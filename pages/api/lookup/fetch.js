/**
 * POST /api/lookup/fetch
 * Fetches a player's full TBC raid history from WCL and stores it in the DB.
 * This runs synchronously — the client waits for the response (20-60s).
 * Subsequent lookups for the same player are served instantly from the cache.
 */
import sql from '../../../lib/db';
import { wclFreshQuery } from '../../../lib/wcl';
import {
  PREPOT_WINDOW_MS,
  FLASK_IDS, FOOD_IDS, GUARDIAN_IDS, BATTLE_IDS,
  POTION_CAST_IDS, WEAPON_ENCHANT_IDS,
} from '../../../lib/constants';
import { score as calcScore, maxScore as calcMax, DEFAULT_MANDATORY } from '../../../lib/scoring';

// Keywords to identify TBC raid zones — checked case-insensitively against zone name
const TBC_KEYWORDS = [
  'karazhan', 'gruul', 'magtheridon', 'serpentshrine',
  'the eye', 'tempest keep', 'hyjal', 'black temple', 'sunwell',
];

function isTBCZone(name) {
  const n = (name || '').toLowerCase();
  return TBC_KEYWORDS.some(k => n.includes(k));
}

// WCL numeric classID → class name string (matches our scoring.js class names)
const CLASS_NAMES = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
  7: 'Shaman',  8: 'Mage',    9: 'Warlock', 11: 'Druid',
};

// WCL spec string → role. Best-effort — hybrids can't be perfectly inferred without
// seeing the player play, but spec name is a reliable signal.
function specToRole(spec) {
  if (!spec) return 'dps';
  const s = spec.toLowerCase();
  if (s.includes('holy') || s.includes('restoration') || s.includes('discipline')) return 'healer';
  if (s.includes('protection') || s === 'feral combat' || s === 'guardian') return 'tank';
  return 'dps';
}

// Parse color tier for WCL percentile (used in display, stored as-is)
// Same logic as WoW armory parse colors.
export function parseColor(pct) {
  if (pct == null) return '#444';
  if (pct >= 99)   return '#e6cc80'; // legendary
  if (pct >= 95)   return '#ff8000'; // epic
  if (pct >= 75)   return '#a335ee'; // purple
  if (pct >= 50)   return '#0070dd'; // blue
  if (pct >= 25)   return '#1eff00'; // green
  return '#888';
}

// Same consumable detection logic as analyze.js — copied here to avoid coupling.
function detectBuff(buffName, buffId, selfApplied) {
  const n = (buffName || '').toLowerCase();
  if (n.includes('well fed'))   return 'food';
  if (FOOD_IDS.has(buffId))     return 'food';
  if (!selfApplied)             return null;
  if (n.includes('flask') || FLASK_IDS.has(buffId)) return 'flask';
  if (GUARDIAN_IDS.has(buffId)) return 'guardian_elixir';
  if (BATTLE_IDS.has(buffId))   return 'battle_elixir';
  return null;
}

// ── DB auto-migration ────────────────────────────────────────────────────────

async function ensureTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS player_lookup_profiles (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      server_slug   TEXT NOT NULL,
      server_region TEXT NOT NULL,
      class_id      INT,
      class_name    TEXT,
      role          TEXT,
      guild_name    TEXT,
      fetch_status  TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      fetched_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT now(),
      UNIQUE(name, server_slug, server_region)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS player_lookup_bosses (
      id                 UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id          UUID    NOT NULL REFERENCES player_lookup_profiles(id) ON DELETE CASCADE,
      zone_id            INT     NOT NULL,
      zone_name          TEXT    NOT NULL,
      encounter_id       INT     NOT NULL,
      boss_name          TEXT    NOT NULL,
      report_code        TEXT,
      best_spec          TEXT,
      rank_percent       NUMERIC(5,2),
      median_percent     NUMERIC(5,2),
      best_amount        NUMERIC(10,2),
      total_kills        INT     NOT NULL DEFAULT 0,
      fastest_kill       INT,
      flask              BOOLEAN,
      battle_elixir      BOOLEAN,
      guardian_elixir    BOOLEAN,
      food               BOOLEAN,
      weapon_oil         BOOLEAN,
      weapon_stone       BOOLEAN,
      haste_potion       INT     NOT NULL DEFAULT 0,
      destruction_potion INT     NOT NULL DEFAULT 0,
      mana_potion        INT     NOT NULL DEFAULT 0,
      healthstone        INT     NOT NULL DEFAULT 0,
      consume_score      INT,
      consume_max        INT,
      UNIQUE(player_id, encounter_id)
    )
  `;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, serverSlug, serverRegion } = req.body;
  if (!name?.trim() || !serverSlug?.trim() || !serverRegion?.trim()) {
    return res.status(400).json({ error: 'name, serverSlug, serverRegion are required' });
  }

  const cleanName   = name.trim();
  const cleanSlug   = serverSlug.trim().toLowerCase();
  const cleanRegion = serverRegion.trim().toUpperCase();

  try {
    await ensureTables();

    // Upsert profile as 'fetching'
    const [profile] = await sql`
      INSERT INTO player_lookup_profiles (name, server_slug, server_region, fetch_status)
      VALUES (${cleanName}, ${cleanSlug}, ${cleanRegion}, 'fetching')
      ON CONFLICT (name, server_slug, server_region) DO UPDATE
        SET fetch_status = 'fetching', error_message = NULL, fetched_at = NULL
      RETURNING id
    `;
    const playerId = profile.id;

    // ── 1. Discover TBC raid zones from WCL worldData ─────────────────────
    // Try multiple strategies: plain zones list, then expansion-scoped lists.
    // WCL Classic content sometimes lives under a different expansion ID.
    const zonesData = await wclFreshQuery(`{
      worldData {
        allZones: zones { id name encounters { id name } }
        exp2:  expansion(id:  2) { zones { id name encounters { id name } } }
        exp9:  expansion(id:  9) { zones { id name encounters { id name } } }
        exp10: expansion(id: 10) { zones { id name encounters { id name } } }
      }
    }`).catch(() => null);

    // Merge all zone lists, deduplicate by id
    const allZones = new Map();
    const addZones = (list) => (list || []).forEach(z => { if (z?.id) allZones.set(z.id, z); });
    addZones(zonesData?.worldData?.allZones);
    addZones(zonesData?.worldData?.exp2?.zones);
    addZones(zonesData?.worldData?.exp9?.zones);
    addZones(zonesData?.worldData?.exp10?.zones);

    const tbcZones = [...allZones.values()].filter(z => isTBCZone(z.name));
    if (!tbcZones.length) throw new Error(
      `Could not identify TBC zones. WCL returned ${allZones.size} total zones. ` +
      `Zone names: ${[...allZones.values()].slice(0, 10).map(z => z.name).join(', ')}`
    );

    // ── 2. Character info + zone rankings in one batched query ────────────
    const zoneAliases = tbcZones.map(z => `z${z.id}: zoneRankings(zoneID: ${z.id})`).join('\n');
    const charResult  = await wclFreshQuery(`
      query ($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id classID
            guilds { guild { name } }
            ${zoneAliases}
          }
        }
      }
    `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

    const char = charResult?.characterData?.character;
    if (!char) throw new Error(`Player "${cleanName}" not found on Warcraft Logs for ${cleanSlug} (${cleanRegion}). Check spelling and realm slug.`);

    const className = CLASS_NAMES[char.classID] || 'Unknown';
    const guildName = char.guilds?.[0]?.guild?.name || null;

    // Parse zone rankings into a flat map: encounterId → ranking row
    const rankingMap = {}; // encId → { zoneId, zoneName, bossName, rankPercent, ... }
    let bestSpec = null;

    for (const zone of tbcZones) {
      const zr = char[`z${zone.id}`];
      if (!zr?.rankings?.length) continue;
      for (const r of zr.rankings) {
        const encId = r.encounter?.id;
        if (!encId) continue;
        rankingMap[encId] = {
          zoneId:        zone.id,
          zoneName:      zone.name,
          bossName:      r.encounter.name,
          encounterId:   encId,
          rankPercent:   r.rankPercent   ?? null,
          medianPercent: r.medianPercent ?? null,
          bestAmount:    r.bestAmount    ?? null,
          totalKills:    r.totalKills    ?? 0,
          fastestKill:   r.fastestKill   ?? null,
          bestSpec:      r.bestSpec      ?? null,
        };
        if (r.bestSpec && !bestSpec) bestSpec = r.bestSpec;
      }
    }

    const role = specToRole(bestSpec);

    // Update profile with character details
    await sql`
      UPDATE player_lookup_profiles
      SET class_id = ${char.classID}, class_name = ${className},
          role = ${role}, guild_name = ${guildName}
      WHERE id = ${playerId}
    `;

    // ── 3. Encounter rankings → get report codes for each boss with kills ──
    const encountersWithKills = Object.values(rankingMap)
      .filter(r => r.totalKills > 0)
      .map(r => r.encounterId);

    const reportCodeMap = {}; // encId → { reportCode, startTime (in report), duration, spec }

    if (encountersWithKills.length > 0) {
      const encAliases = encountersWithKills
        .map(id => `e${id}: encounterRankings(encounterID: ${id}, limit: 1)`)
        .join('\n');

      const encResult = await wclFreshQuery(`
        query ($name: String!, $serverSlug: String!, $serverRegion: String!) {
          characterData {
            character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
              ${encAliases}
            }
          }
        }
      `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

      const encChar = encResult?.characterData?.character;
      if (encChar) {
        for (const encId of encountersWithKills) {
          const er   = encChar[`e${encId}`];
          const best = er?.rankings?.[0];
          if (!best?.report?.code) continue;
          reportCodeMap[encId] = {
            reportCode: best.report.code,
            startTime:  best.startTime ?? 0,   // ms from report start
            duration:   best.duration  ?? 300000,
            spec:       best.spec      ?? null,
          };
        }
      }
    }

    // ── 4. Fetch consumables — grouped by report code to batch WCL calls ──
    // Multiple bosses from the same report are fetched in a single GraphQL query.
    const byReport = {}; // reportCode → [{ encId, startTime, duration }]
    for (const [encId, info] of Object.entries(reportCodeMap)) {
      const code = info.reportCode;
      if (!byReport[code]) byReport[code] = [];
      byReport[code].push({ encId: Number(encId), ...info });
    }

    const consumableMap = {}; // encId → consumable boolean/int fields

    await Promise.all(
      Object.entries(byReport).map(async ([code, bosses]) => {
        // Build batched aliases: CombatantInfo + Cast events per boss, plus buffs table for name lookup
        const bossAliases = bosses.flatMap(b => {
          const st     = b.startTime;
          const et     = b.startTime + b.duration;
          const prePot = Math.max(0, st - PREPOT_WINDOW_MS);
          return [
            `ci_${b.encId}: events(dataType: CombatantInfo, startTime: ${st}, endTime: ${et}) { data }`,
            `ca_${b.encId}: events(dataType: Casts, startTime: ${prePot}, endTime: ${et}) { data }`,
          ];
        }).join('\n');

        const repResult = await wclFreshQuery(`
          query ($code: String!) {
            reportData { report(code: $code) {
              masterData { actors(type: "Player") { id name } }
              buffs: table(dataType: Buffs, startTime: 0, endTime: 9999999999) { data }
              ${bossAliases}
            }}
          }
        `, { code });

        const report = repResult?.reportData?.report;
        if (!report) return;

        // Build actor and aura name maps
        const actorMap = {};
        (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

        const auraNameMap = {};
        (report.buffs?.data?.auras || []).forEach(a => { auraNameMap[a.guid] = a.name; });

        // Find the player's actor ID
        const targetLower = cleanName.toLowerCase();
        const sourceId = Object.entries(actorMap)
          .find(([, n]) => n.toLowerCase() === targetLower)?.[0];
        if (!sourceId) return;

        for (const boss of bosses) {
          const ciEvents = report[`ci_${boss.encId}`]?.data || [];
          const caEvents = report[`ca_${boss.encId}`]?.data || [];

          // Find this player's CombatantInfo event
          const myEvent = ciEvents.find(e => String(e.sourceID) === String(sourceId));

          const result = {
            flask: false, battle_elixir: false, guardian_elixir: false, food: false,
            weapon_oil: false, weapon_stone: false,
            haste_potion: 0, destruction_potion: 0, mana_potion: 0, healthstone: 0,
          };

          if (myEvent) {
            for (const aura of (myEvent.auras || [])) {
              const selfApplied = aura.source === myEvent.sourceID;
              const cat = detectBuff(auraNameMap[aura.ability] || '', aura.ability, selfApplied);
              if (cat) result[cat] = true;
            }
            for (const slot of (myEvent.gear || [])) {
              const cat = WEAPON_ENCHANT_IDS[slot.temporaryEnchant];
              if (cat) result[cat] = true;
            }
          }

          for (const cast of caEvents) {
            if (String(cast.sourceID) !== String(sourceId)) continue;
            const cat = POTION_CAST_IDS[cast.abilityGameID];
            if (cat) result[cat] = (typeof result[cat] === 'number' ? result[cat] : 0) + 1;
          }

          consumableMap[boss.encId] = result;
        }
      })
    );

    // ── 5. Write all boss rows to DB ──────────────────────────────────────
    await sql`DELETE FROM player_lookup_bosses WHERE player_id = ${playerId}`;

    for (const zone of tbcZones) {
      for (const enc of (zone.encounters || [])) {
        const ranking = rankingMap[enc.id];
        if (!ranking) continue; // player has no data for this boss at all

        const cons      = consumableMap[enc.id] ?? null;
        const repInfo   = reportCodeMap[enc.id]  ?? null;
        const bossSpec  = repInfo?.spec ?? ranking.bestSpec ?? null;

        // Build a player-like object for the scoring functions
        const fakePlayer = cons ? {
          class: className, role,
          flask:              cons.flask,
          battle_elixir:      cons.battle_elixir,
          guardian_elixir:    cons.guardian_elixir,
          food:               cons.food,
          weapon_oil:         cons.weapon_oil,
          weapon_stone:       cons.weapon_stone,
          haste_potion:       cons.haste_potion,
          destruction_potion: cons.destruction_potion,
          mana_potion:        cons.mana_potion,
        } : null;

        const cScore = fakePlayer ? calcScore(fakePlayer, DEFAULT_MANDATORY) : null;
        const cMax   = fakePlayer ? calcMax(fakePlayer,   DEFAULT_MANDATORY) : null;

        await sql`
          INSERT INTO player_lookup_bosses (
            player_id, zone_id, zone_name, encounter_id, boss_name, report_code, best_spec,
            rank_percent, median_percent, best_amount, total_kills, fastest_kill,
            flask, battle_elixir, guardian_elixir, food, weapon_oil, weapon_stone,
            haste_potion, destruction_potion, mana_potion, healthstone,
            consume_score, consume_max
          ) VALUES (
            ${playerId}, ${zone.id}, ${zone.name}, ${enc.id}, ${enc.name},
            ${repInfo?.reportCode ?? null}, ${bossSpec},
            ${ranking.rankPercent}, ${ranking.medianPercent},
            ${ranking.bestAmount},  ${ranking.totalKills}, ${ranking.fastestKill},
            ${cons?.flask            ?? null}, ${cons?.battle_elixir   ?? null},
            ${cons?.guardian_elixir  ?? null}, ${cons?.food            ?? null},
            ${cons?.weapon_oil       ?? null}, ${cons?.weapon_stone     ?? null},
            ${cons?.haste_potion       ?? 0}, ${cons?.destruction_potion ?? 0},
            ${cons?.mana_potion        ?? 0}, ${cons?.healthstone        ?? 0},
            ${cScore}, ${cMax}
          )
          ON CONFLICT (player_id, encounter_id) DO UPDATE SET
            report_code        = EXCLUDED.report_code,
            best_spec          = EXCLUDED.best_spec,
            rank_percent       = EXCLUDED.rank_percent,
            median_percent     = EXCLUDED.median_percent,
            best_amount        = EXCLUDED.best_amount,
            total_kills        = EXCLUDED.total_kills,
            fastest_kill       = EXCLUDED.fastest_kill,
            flask              = EXCLUDED.flask,
            battle_elixir      = EXCLUDED.battle_elixir,
            guardian_elixir    = EXCLUDED.guardian_elixir,
            food               = EXCLUDED.food,
            weapon_oil         = EXCLUDED.weapon_oil,
            weapon_stone       = EXCLUDED.weapon_stone,
            haste_potion       = EXCLUDED.haste_potion,
            destruction_potion = EXCLUDED.destruction_potion,
            mana_potion        = EXCLUDED.mana_potion,
            healthstone        = EXCLUDED.healthstone,
            consume_score      = EXCLUDED.consume_score,
            consume_max        = EXCLUDED.consume_max
        `;
      }
    }

    // ── 6. Mark done ──────────────────────────────────────────────────────
    await sql`
      UPDATE player_lookup_profiles
      SET fetch_status = 'done', fetched_at = now()
      WHERE id = ${playerId}
    `;

    return res.json({ ok: true });

  } catch (err) {
    console.error('[lookup/fetch]', err);
    try {
      await sql`
        UPDATE player_lookup_profiles
        SET fetch_status = 'error', error_message = ${err.message}
        WHERE name = ${cleanName} AND server_slug = ${cleanSlug} AND server_region = ${cleanRegion}
      `;
    } catch {}
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { responseLimit: false, bodyParser: true } };
