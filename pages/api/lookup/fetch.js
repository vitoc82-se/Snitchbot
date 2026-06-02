/**
 * POST /api/lookup/fetch
 * Fetches a player's full TBC raid history from WCL Fresh and stores in DB.
 *
 * Key findings from API exploration:
 * - Character/zone data: fresh.warcraftlogs.com API (wclFreshQuery) — same credentials
 * - Report CombatantInfo: warcraftlogs.com API (wclQuery) — already works for fresh logs
 * - worldData encounter IDs (e.g. 623 for Hydross) + 100000 = ranking encounter ID (100623)
 * - encounterRankings returns { totalKills, bestAmount, medianPerformance, fastestKill,
 *     ranks: [{ rankPercent, spec, duration, startTime, report: { code, startTime, fightID } }] }
 * - ranks[0] = best kill, sorted by rankPercent desc
 * - Fight time (relative to report): startTime - report.startTime
 */

import sql from '../../../lib/db';
import { wclQuery, wclFreshQuery } from '../../../lib/wcl';
import {
  PREPOT_WINDOW_MS,
  FLASK_IDS, FOOD_IDS, GUARDIAN_IDS, BATTLE_IDS,
  POTION_CAST_IDS, WEAPON_ENCHANT_IDS,
} from '../../../lib/constants';
import { score as calcScore, maxScore as calcMax, DEFAULT_MANDATORY } from '../../../lib/scoring';

// WCL classID → class name (WCL uses alphabetical ordering, not WoW internal IDs)
const CLASS_NAMES = {
  1:  'Death Knight',
  2:  'Druid',
  3:  'Hunter',
  4:  'Mage',
  5:  'Monk',
  6:  'Paladin',
  7:  'Priest',
  8:  'Rogue',
  9:  'Shaman',
  10: 'Warlock',
  11: 'Warrior',
  12: 'Demon Hunter',
  13: 'Evoker',
};

// WCL TBC zone IDs in worldData (Fresh server)
const TBC_ZONE_IDS = [1007, 1008, 1010, 1011, 1012, 1013];
// Zone names matching worldData zone IDs above (for display)
const ZONE_NAMES = {
  1007: 'Karazhan',
  1008: 'Gruul / Magtheridon',
  1010: 'SSC / TK',
  1011: 'BT / Hyjal',
  1012: "Zul'Aman",
  1013: 'Sunwell Plateau',
};

function specToRole(spec) {
  if (!spec) return 'dps';
  const s = spec.toLowerCase();
  if (s.includes('holy') || s.includes('restoration') || s.includes('discipline')) return 'healer';
  if (s.includes('protection') || s === 'feral combat' || s === 'guardian') return 'tank';
  return 'dps';
}

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

    // Upsert profile
    const [profile] = await sql`
      INSERT INTO player_lookup_profiles (name, server_slug, server_region, fetch_status)
      VALUES (${cleanName}, ${cleanSlug}, ${cleanRegion}, 'fetching')
      ON CONFLICT (name, server_slug, server_region) DO UPDATE
        SET fetch_status = 'fetching', error_message = NULL, fetched_at = NULL
      RETURNING id
    `;
    const playerId = profile.id;

    // ── 1. Get all TBC encounter IDs from worldData (Fresh API) ───────────
    const zoneAliasesWD = TBC_ZONE_IDS.map(id => `z${id}: zone(id: ${id}) { encounters { id name } }`).join('\n');
    const worldData = await wclFreshQuery(`{ worldData { ${zoneAliasesWD} } }`);

    // Build flat encounter list with worldData IDs and ranking IDs (+100000)
    const allEncounters = TBC_ZONE_IDS.flatMap(zoneId => {
      const enc = worldData?.worldData?.[`z${zoneId}`]?.encounters || [];
      return enc.map(e => ({
        worldId:  e.id,
        rankId:   e.id + 100000,   // ranking encounter ID used in encounterRankings
        bossName: e.name,
        zoneId,
        zoneName: ZONE_NAMES[zoneId] || `Zone ${zoneId}`,
      }));
    });

    if (!allEncounters.length) throw new Error('Could not load TBC encounter list from WCL');

    // ── 2. Character info + all encounter rankings (Fresh API, one query) ──
    const encAliases = allEncounters.map(e => `e${e.rankId}: encounterRankings(encounterID: ${e.rankId})`).join('\n');
    const charResult = await wclFreshQuery(`
      query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id classID
            guilds { id name }
            ${encAliases}
          }
        }
      }
    `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

    const char = charResult?.characterData?.character;
    if (!char) throw new Error(`Player "${cleanName}" not found on Warcraft Logs (${cleanSlug}, ${cleanRegion})`);

    const className = CLASS_NAMES[char.classID] || 'Unknown';
    const guildName = char.guilds?.[0]?.name || null;

    // Parse encounter rankings — build a map of boss data and determine role from spec
    const rankingMap = {}; // worldId → boss data
    let bestSpec = null;

    for (const enc of allEncounters) {
      const er = char[`e${enc.rankId}`];
      if (!er || er.error || !er.totalKills) continue;

      const bestKill = er.ranks?.[0];
      if (!bestKill) continue;

      const fightStart = bestKill.startTime - bestKill.report.startTime;

      rankingMap[enc.worldId] = {
        ...enc,
        rankPercent:   bestKill.rankPercent ?? null,
        medianPercent: er.medianPerformance  ?? null,
        bestAmount:    er.bestAmount         ?? null,
        totalKills:    er.totalKills         ?? 0,
        fastestKill:   er.fastestKill        ?? null,
        bestSpec:      bestKill.spec         ?? null,
        reportCode:    bestKill.report?.code ?? null,
        fightStart,                                         // ms from report start
        fightEnd:      fightStart + (bestKill.duration ?? 0),
      };
      if (bestKill.spec && !bestSpec) bestSpec = bestKill.spec;
    }

    const role = specToRole(bestSpec);

    await sql`
      UPDATE player_lookup_profiles
      SET class_id = ${char.classID}, class_name = ${className},
          role = ${role}, guild_name = ${guildName}
      WHERE id = ${playerId}
    `;

    // ── 3. Fetch consumables grouped by report code (retail API) ──────────
    // The retail WCL API can read fresh report data — same as analyze.js.
    const byReport = {}; // reportCode → [{ worldId, fightStart, fightEnd }]
    for (const boss of Object.values(rankingMap)) {
      if (!boss.reportCode) continue;
      if (!byReport[boss.reportCode]) byReport[boss.reportCode] = [];
      byReport[boss.reportCode].push(boss);
    }

    const consumableMap = {}; // worldId → consumable fields

    await Promise.all(
      Object.entries(byReport).map(async ([code, bosses]) => {
        const bossAliases = bosses.flatMap(b => {
          const prePot = Math.max(0, b.fightStart - PREPOT_WINDOW_MS);
          return [
            `ci_${b.worldId}: events(dataType: CombatantInfo, startTime: ${b.fightStart}, endTime: ${b.fightEnd}) { data }`,
            `ca_${b.worldId}: events(dataType: Casts,          startTime: ${prePot},         endTime: ${b.fightEnd}) { data }`,
          ];
        }).join('\n');

        const repResult = await wclQuery(`
          query($code: String!) {
            reportData { report(code: $code) {
              masterData { actors(type: "Player") { id name } }
              buffs: table(dataType: Buffs, startTime: 0, endTime: 9999999999) { data }
              ${bossAliases}
            }}
          }
        `, { code });

        const report = repResult?.reportData?.report;
        if (!report) return;

        const actorMap   = {};
        (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

        const auraNameMap = {};
        (report.buffs?.data?.auras || []).forEach(a => { auraNameMap[a.guid] = a.name; });

        const targetLower = cleanName.toLowerCase();
        const sourceId    = Object.entries(actorMap)
          .find(([, n]) => n.toLowerCase() === targetLower)?.[0];
        if (!sourceId) return;

        for (const boss of bosses) {
          const ciEvents = report[`ci_${boss.worldId}`]?.data || [];
          const caEvents = report[`ca_${boss.worldId}`]?.data || [];
          const myEvent  = ciEvents.find(e => String(e.sourceID) === String(sourceId));

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
            if (cat && typeof result[cat] === 'number') result[cat]++;
          }

          consumableMap[boss.worldId] = result;
        }
      })
    );

    // ── 4. Write all boss rows to DB ──────────────────────────────────────
    await sql`DELETE FROM player_lookup_bosses WHERE player_id = ${playerId}`;

    for (const enc of allEncounters) {
      const ranking = rankingMap[enc.worldId];
      const cons    = consumableMap[enc.worldId] ?? null;

      // If no ranking data at all (player never killed this boss) — still store it
      const fakePlayer = cons && ranking ? {
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
          ${playerId}, ${enc.zoneId}, ${enc.zoneName}, ${enc.worldId}, ${enc.bossName},
          ${ranking?.reportCode ?? null}, ${ranking?.bestSpec ?? null},
          ${ranking?.rankPercent ?? null}, ${ranking?.medianPercent ?? null},
          ${ranking?.bestAmount  ?? null}, ${ranking?.totalKills    ?? 0},
          ${ranking?.fastestKill ?? null},
          ${cons?.flask            ?? null}, ${cons?.battle_elixir   ?? null},
          ${cons?.guardian_elixir  ?? null}, ${cons?.food            ?? null},
          ${cons?.weapon_oil       ?? null}, ${cons?.weapon_stone     ?? null},
          ${cons?.haste_potion       ?? 0}, ${cons?.destruction_potion ?? 0},
          ${cons?.mana_potion        ?? 0}, ${cons?.healthstone        ?? 0},
          ${cScore}, ${cMax}
        )
        ON CONFLICT (player_id, encounter_id) DO UPDATE SET
          report_code = EXCLUDED.report_code, best_spec = EXCLUDED.best_spec,
          rank_percent = EXCLUDED.rank_percent, median_percent = EXCLUDED.median_percent,
          best_amount = EXCLUDED.best_amount, total_kills = EXCLUDED.total_kills,
          fastest_kill = EXCLUDED.fastest_kill,
          flask = EXCLUDED.flask, battle_elixir = EXCLUDED.battle_elixir,
          guardian_elixir = EXCLUDED.guardian_elixir, food = EXCLUDED.food,
          weapon_oil = EXCLUDED.weapon_oil, weapon_stone = EXCLUDED.weapon_stone,
          haste_potion = EXCLUDED.haste_potion, destruction_potion = EXCLUDED.destruction_potion,
          mana_potion = EXCLUDED.mana_potion, healthstone = EXCLUDED.healthstone,
          consume_score = EXCLUDED.consume_score, consume_max = EXCLUDED.consume_max
      `;
    }

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
