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
  POTION_CAST_IDS, WEAPON_ENCHANT_IDS, WF_ENCHANT_IDS, WF_PROC_IDS,
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

// Gear slot indices in WCL's CombatantInfo gear array (0-indexed, standard WoW order)
const ENCHANT_SLOTS = { mainhand: 15, head: 0, shoulder: 2, chest: 4, legs: 6, bracer: 8, gloves: 9 };

// Importance weights — must sum to 100.
// Weapon+Head+Shoulder = 60 → Rare (blue), matching the user's "blue rank minimum" rule.
const ENCHANT_WEIGHTS = { mainhand: 25, head: 20, shoulder: 15, legs: 15, gloves: 10, bracer: 8, chest: 7 };

function detectEnchants(gear) {
  const result = {};
  let score = 0;
  for (const [slot, idx] of Object.entries(ENCHANT_SLOTS)) {
    const enchanted = (gear?.[idx]?.permanentEnchant ?? 0) > 0;
    result[slot] = enchanted;
    if (enchanted) score += ENCHANT_WEIGHTS[slot] ?? 0;
  }
  return { ...result, enchantScore: score };
}

// WCL RANKING zone IDs for TBC Fresh content.
// These are DIFFERENT from worldData zone IDs (1007, 1008, 1010...).
// Discovered by scanning zoneRankings(zoneID: X) across a range.
// Add new entries here as future content phases are released on the Fresh server.
const TBC_RANKING_ZONES = [
  { id: 1047, name: 'Karazhan'           },
  { id: 1048, name: 'Gruul / Magtheridon' },
  { id: 1056, name: 'SSC / TK'           },
  // { id: ???, name: "Zul'Aman"         },  // add when released
  // { id: ???, name: 'BT / Hyjal'       },  // add when released
  // { id: ???, name: 'Sunwell Plateau'  },  // add when released
];

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
  // Windfury comes from Shaman totem — not self-applied, check before selfApplied gate
  if (n.includes('windfury') || WF_ENCHANT_IDS.has(buffId)) return 'windfury';
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
      enchant_mainhand   BOOLEAN,
      enchant_head       BOOLEAN,
      enchant_shoulder   BOOLEAN,
      enchant_chest      BOOLEAN,
      enchant_legs       BOOLEAN,
      enchant_bracer     BOOLEAN,
      enchant_gloves     BOOLEAN,
      enchant_score      INT,
      UNIQUE(player_id, encounter_id)
    )
  `;
  // Add enchant columns to existing tables (safe to run repeatedly)
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_mainhand BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_head     BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_shoulder BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_chest    BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_legs     BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_bracer   BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_gloves   BOOLEAN`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS enchant_score    INT`;
  // Consistency rate columns (2.1) — fraction of kills with each consumable (0.00–1.00)
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS flask_rate           NUMERIC(4,2)`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS battle_elix_rate     NUMERIC(4,2)`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS guardian_elix_rate   NUMERIC(4,2)`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS food_rate            NUMERIC(4,2)`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS weapon_rate          NUMERIC(4,2)`;
  await sql`ALTER TABLE player_lookup_bosses ADD COLUMN IF NOT EXISTS pot_rate             NUMERIC(4,2)`;
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

    // ── 1. Character info + zone rankings (both DPS and HPS metrics) ─────────
    // Query both metrics simultaneously. Per encounter, we pick whichever has a
    // non-zero bestAmount — this correctly handles healers, DPS, and hybrids that
    // swap roles between bosses (e.g. a Druid healing most kills but DPS on one boss).
    const zrAliases = TBC_RANKING_ZONES.flatMap(z => [
      `zr${z.id}dps: zoneRankings(zoneID: ${z.id}, metric: dps)`,
      `zr${z.id}hps: zoneRankings(zoneID: ${z.id}, metric: hps)`,
    ]).join('\n');

    const charResult = await wclFreshQuery(`
      query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id classID
            guilds { id name }
            ${zrAliases}
          }
        }
      }
    `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

    const char = charResult?.characterData?.character;
    if (!char) throw new Error(`Player "${cleanName}" not found on Warcraft Logs (${cleanSlug} ${cleanRegion}). If the player exists on WCL, this may be a temporary rate limit — try again in a moment.`);

    const className = CLASS_NAMES[char.classID] || 'Unknown';
    const guildName = char.guilds?.[0]?.name || null;

    // Merge DPS and HPS rankings per encounter.
    // For each encounter, pick the metric with a non-zero bestAmount (real performance).
    // Falls back to DPS if both are zero or only one metric has data.
    const mergedByEncId = {}; // encId → best ranking entry

    for (const zone of TBC_RANKING_ZONES) {
      const dpsRankings = char[`zr${zone.id}dps`]?.rankings || [];
      const hpsRankings = char[`zr${zone.id}hps`]?.rankings || [];

      // Index HPS data by encounter ID for O(1) lookup
      const hpsById = {};
      for (const r of hpsRankings) {
        if (r.encounter?.id) hpsById[r.encounter.id] = r;
      }

      for (const r of dpsRankings) {
        const encId = r.encounter?.id;
        if (!encId) continue;
        const hps  = hpsById[encId];

        // Pick the entry whose bestAmount is higher (actual role this boss was done in).
        // A healer doing DPS parse will show bestAmount ≈ 0; HPS entry will be non-zero.
        const useDps = !hps || (r.bestAmount ?? 0) >= (hps.bestAmount ?? 0);
        const best   = useDps ? r : hps;

        mergedByEncId[encId] = {
          encId,
          bossName:      best.encounter.name,
          zoneId:        zone.id,
          zoneName:      zone.name,
          rankPercent:   best.rankPercent   ?? null,
          medianPercent: best.medianPercent ?? null,
          bestAmount:    best.bestAmount    ?? null,
          totalKills:    best.totalKills    ?? 0,
          fastestKill:   best.fastestKill   ?? null,
          bestSpec:      best.bestSpec      ?? null,
        };

        // Also handle encounters only in HPS (e.g. purely healing encounter)
        for (const [hEncId, hR] of Object.entries(hpsById)) {
          if (!mergedByEncId[hEncId]) {
            mergedByEncId[hEncId] = {
              encId:         Number(hEncId),
              bossName:      hR.encounter.name,
              zoneId:        zone.id,
              zoneName:      zone.name,
              rankPercent:   hR.rankPercent   ?? null,
              medianPercent: hR.medianPercent ?? null,
              bestAmount:    hR.bestAmount    ?? null,
              totalKills:    hR.totalKills    ?? 0,
              fastestKill:   hR.fastestKill   ?? null,
              bestSpec:      hR.bestSpec      ?? null,
            };
          }
        }
      }
    }

    const rankingMap   = {}; // encId → entry (only bosses with kills)
    const allEncounters = Object.values(mergedByEncId);
    let bestSpec = null;

    for (const entry of allEncounters) {
      if ((entry.totalKills ?? 0) > 0) {
        rankingMap[entry.encId] = entry;
        if (entry.bestSpec && !bestSpec) bestSpec = entry.bestSpec;
      }
    }

    if (!allEncounters.length) throw new Error('No TBC encounter data returned from WCL');

    // ── 2. Get report codes for each boss with kills (encounterRankings) ────
    const withKills = Object.values(rankingMap);
    if (withKills.length > 0) {
      const encAliases = withKills.map(e =>
        `e${e.encId}: encounterRankings(encounterID: ${e.encId})`
      ).join('\n');
      const encResult = await wclFreshQuery(`
        query($name: String!, $serverSlug: String!, $serverRegion: String!) {
          characterData {
            character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
              ${encAliases}
            }
          }
        }
      `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

      const encChar = encResult?.characterData?.character;
      for (const enc of withKills) {
        const er = encChar?.[`e${enc.encId}`];
        if (!er?.ranks?.length) continue;
        // Latest kill — most recent by startTime, used for consumable data
        const latestKill = er.ranks.reduce((latest, r) =>
          r?.report?.code && (!latest || r.startTime > latest.startTime) ? r : latest
        , null);
        if (latestKill) {
          const fightStart = latestKill.startTime - latestKill.report.startTime;
          enc.reportCode = latestKill.report.code;
          enc.fightStart = fightStart;
          enc.fightEnd   = fightStart + (latestKill.duration ?? 0);
        }
        // All kills — store report/fight info for consistency rate computation
        enc.allKills = er.ranks
          .filter(r => r?.report?.code)
          .map(r => {
            const fs = r.startTime - r.report.startTime;
            return { code: r.report.code, fightStart: fs, fightEnd: fs + (r.duration ?? 0) };
          });
      }
    }

    const role = specToRole(bestSpec);

    await sql`
      UPDATE player_lookup_profiles
      SET class_id = ${char.classID}, class_name = ${className},
          role = ${role}, guild_name = ${guildName}
      WHERE id = ${playerId}
    `;

    // ── 3. Fetch consumables grouped by report code (retail API) ──────────
    const byReport = {};
    for (const boss of withKills) {
      if (!boss.reportCode) continue;
      if (!byReport[boss.reportCode]) byReport[boss.reportCode] = [];
      byReport[boss.reportCode].push(boss);
    }

    const consumableMap = {}; // encId → consumable fields (best kill)
    const rateMap       = {}; // encId → consistency rate tallies

    // Helper: parse consumables from one fight's CI + cast events
    function parseFightCons(ciEvents, caEvents, actorMap, auraNameMap, targetLower) {
      const sourceId = Object.entries(actorMap)
        .find(([, n]) => n.toLowerCase() === targetLower)?.[0];
      if (!sourceId) return null;
      const myEvent = ciEvents.find(e => String(e.sourceID) === String(sourceId));
      const result = {
        flask: false, battle_elixir: false, guardian_elixir: false, food: false,
        weapon_oil: false, weapon_stone: false, windfury: false,
        haste_potion: 0, destruction_potion: 0, mana_potion: 0, healthstone: 0,
        enchant_mainhand: false, enchant_head: false, enchant_shoulder: false,
        enchant_chest: false, enchant_legs: false, enchant_bracer: false,
        enchant_gloves: false, enchantScore: 0,
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
          // WF enchant IDs in gear slots = WF Totem active at pull time
          if (WF_ENCHANT_IDS.has(slot.temporaryEnchant)) result.windfury = true;
        }
        const enchants = detectEnchants(myEvent.gear);
        Object.assign(result, {
          enchant_mainhand: enchants.mainhand, enchant_head: enchants.head,
          enchant_shoulder: enchants.shoulder, enchant_chest: enchants.chest,
          enchant_legs: enchants.legs, enchant_bracer: enchants.bracer,
          enchant_gloves: enchants.gloves, enchantScore: enchants.enchantScore,
        });
      }
      for (const cast of caEvents) {
        if (String(cast.sourceID) !== String(sourceId)) continue;
        const cat = POTION_CAST_IDS[cast.abilityGameID];
        if (cat && typeof result[cat] === 'number') result[cat]++;
        // WF proc confirms Windfury Totem was active in-combat for this player
        if (WF_PROC_IDS.has(cast.abilityGameID)) result.windfury = true;
      }
      return { result, sourceId };
    }

    // ── Fetch best-kill consumables (existing logic) ──────────────────────────
    await Promise.all(
      Object.entries(byReport).map(async ([code, bosses]) => {
        const bossAliases = bosses.flatMap(b => {
          const prePot = Math.max(0, b.fightStart - PREPOT_WINDOW_MS);
          return [
            `ci_${b.encId}: events(dataType: CombatantInfo, startTime: ${b.fightStart}, endTime: ${b.fightEnd}) { data }`,
            `ca_${b.encId}: events(dataType: Casts,          startTime: ${prePot},         endTime: ${b.fightEnd}) { data }`,
          ];
        }).join('\n');

        const repResult = await wclQuery(`
          query($code: String!) {
            reportData { report(code: $code) {
              masterData { actors(type: "Player") { id name } }
              buffs: table(dataType: Buffs, startTime: 0, endTime: 9999999999)
              ${bossAliases}
            }}
          }
        `, { code });

        const report = repResult?.reportData?.report;
        if (!report) return;

        const actorMap = {};
        (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });
        const auraNameMap = {};
        (report.buffs?.data?.auras || []).forEach(a => { auraNameMap[a.guid] = a.name; });

        // Determine this player's actor ID in this report
        const sourceId = Object.entries(actorMap)
          .find(([, n]) => n.toLowerCase() === cleanName.toLowerCase())?.[0];

        // WF scan: query only THIS player's buff events — targetID filter keeps it tiny
        // Fight events are dense (10k+ total) so we must filter by player, not rely on limit
        let wfEventsByFight = {}; // encId → boolean
        if (sourceId) {
          try {
            const wfResult = await wclQuery(`
              query($code: String!, $tid: Int!) {
                reportData { report(code: $code) {
                  events(dataType: Buffs, startTime: 0, endTime: 9999999999,
                         targetID: $tid, limit: 10000) { data }
                }}
              }
            `, { code, tid: Number(sourceId) });
            const wfAll = (wfResult?.reportData?.report?.events?.data || [])
              .filter(e => e.type === 'applybuff' && e.abilityGameID === 25584);
            for (const boss of bosses) {
              wfEventsByFight[boss.encId] = wfAll.some(e =>
                e.timestamp >= boss.fightStart && e.timestamp <= boss.fightEnd
              );
            }
          } catch {}
        }

        for (const boss of bosses) {
          const ciEvents = report[`ci_${boss.encId}`]?.data || [];
          const caEvents = report[`ca_${boss.encId}`]?.data || [];
          const parsed   = parseFightCons(ciEvents, caEvents, actorMap, auraNameMap, cleanName.toLowerCase());
          if (parsed) {
            if (!parsed.result.windfury && wfEventsByFight[boss.encId]) {
              parsed.result.windfury = true;
            }
            consumableMap[boss.encId] = parsed.result;
          }
        }
      })
    );

    // ── Fetch consistency rates across all kills ──────────────────────────────
    // Group all kills by report code so we batch WCL queries efficiently
    const killsByReport = {}; // code → [{ encId, fightStart, fightEnd }]
    for (const enc of withKills) {
      if (!enc.allKills?.length) continue;
      for (const kill of enc.allKills) {
        if (!killsByReport[kill.code]) killsByReport[kill.code] = [];
        killsByReport[kill.code].push({ encId: enc.encId, ...kill });
      }
    }

    // Initialise rate tallies
    for (const enc of withKills) {
      rateMap[enc.encId] = { flask: 0, battle_elixir: 0, guardian_elixir: 0, food: 0, weapon: 0, pot: 0, total: 0 };
    }

    await Promise.all(
      Object.entries(killsByReport).map(async ([code, kills]) => {
        // Deduplicate: same report can appear for multiple bosses, batch all fights
        const uniqueEncs = [...new Map(kills.map(k => [k.encId, k])).values()];
        const aliases = uniqueEncs.flatMap(k => {
          const prePot = Math.max(0, k.fightStart - PREPOT_WINDOW_MS);
          return [
            `ci_${k.encId}: events(dataType: CombatantInfo, startTime: ${k.fightStart}, endTime: ${k.fightEnd}) { data }`,
            `ca_${k.encId}: events(dataType: Casts,          startTime: ${prePot},         endTime: ${k.fightEnd}) { data }`,
          ];
        }).join('\n');

        const repResult = await wclQuery(`
          query($code: String!) {
            reportData { report(code: $code) {
              masterData { actors(type: "Player") { id name } }
              buffs: table(dataType: Buffs, startTime: 0, endTime: 9999999999)
              ${aliases}
            }}
          }
        `, { code });

        const report = repResult?.reportData?.report;
        if (!report) return;

        const actorMap = {};
        (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });
        const auraNameMap = {};
        (report.buffs?.data?.auras || []).forEach(a => { auraNameMap[a.guid] = a.name; });

        for (const k of uniqueEncs) {
          if (!rateMap[k.encId]) continue;
          const ciEvents = report[`ci_${k.encId}`]?.data || [];
          const caEvents = report[`ca_${k.encId}`]?.data || [];
          const parsed   = parseFightCons(ciEvents, caEvents, actorMap, auraNameMap, cleanName.toLowerCase());
          if (!parsed) continue;
          const c = parsed.result;
          const r = rateMap[k.encId];
          r.total++;
          if (c.flask)                                       r.flask++;
          if (c.battle_elixir)                               r.battle_elixir++;
          if (c.guardian_elixir)                             r.guardian_elixir++;
          if (c.food)                                        r.food++;
          if (c.weapon_oil || c.weapon_stone)                r.weapon++;
          if (c.haste_potion > 0 || c.destruction_potion > 0 || c.mana_potion > 0) r.pot++;
        }
      })
    );

    // ── 4. Write all boss rows to DB ──────────────────────────────────────
    await sql`DELETE FROM player_lookup_bosses WHERE player_id = ${playerId}`;

    for (const enc of allEncounters) {
      const ranking = rankingMap[enc.encId] ?? null;
      const cons    = consumableMap[enc.encId] ?? null;

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

      // Compute consistency rates
      const rates = rateMap[enc.encId];
      const rateOf = (n) => rates && rates.total > 0 ? parseFloat((n / rates.total).toFixed(2)) : null;
      const flaskRate      = rateOf(rates?.flask        ?? 0);
      const battleElRate   = rateOf(rates?.battle_elixir ?? 0);
      const guardianElRate = rateOf(rates?.guardian_elixir ?? 0);
      const foodRate       = rateOf(rates?.food         ?? 0);
      const weaponRate     = rateOf(rates?.weapon       ?? 0);
      const potRate        = rateOf(rates?.pot          ?? 0);

      await sql`
        INSERT INTO player_lookup_bosses (
          player_id, zone_id, zone_name, encounter_id, boss_name, report_code, best_spec,
          rank_percent, median_percent, best_amount, total_kills, fastest_kill,
          flask, battle_elixir, guardian_elixir, food, weapon_oil, weapon_stone,
          haste_potion, destruction_potion, mana_potion, healthstone,
          consume_score, consume_max,
          enchant_mainhand, enchant_head, enchant_shoulder, enchant_chest,
          enchant_legs, enchant_bracer, enchant_gloves, enchant_score,
          flask_rate, battle_elix_rate, guardian_elix_rate, food_rate, weapon_rate, pot_rate
        ) VALUES (
          ${playerId}, ${enc.zoneId}, ${enc.zoneName}, ${enc.encId}, ${enc.bossName},
          ${ranking?.reportCode ?? null}, ${ranking?.bestSpec ?? null},
          ${ranking?.rankPercent ?? null}, ${ranking?.medianPercent ?? null},
          ${ranking?.bestAmount  ?? null}, ${ranking?.totalKills    ?? 0},
          ${ranking?.fastestKill ?? null},
          ${cons?.flask            ?? null}, ${cons?.battle_elixir   ?? null},
          ${cons?.guardian_elixir  ?? null}, ${cons?.food            ?? null},
          ${cons?.weapon_oil       ?? null}, ${cons?.weapon_stone     ?? null},
          ${cons?.haste_potion       ?? 0}, ${cons?.destruction_potion ?? 0},
          ${cons?.mana_potion        ?? 0}, ${cons?.healthstone        ?? 0},
          ${cScore}, ${cMax},
          ${cons?.enchant_mainhand ?? null}, ${cons?.enchant_head     ?? null},
          ${cons?.enchant_shoulder ?? null}, ${cons?.enchant_chest    ?? null},
          ${cons?.enchant_legs     ?? null}, ${cons?.enchant_bracer   ?? null},
          ${cons?.enchant_gloves   ?? null}, ${cons?.enchantScore     ?? null},
          ${flaskRate}, ${battleElRate}, ${guardianElRate}, ${foodRate}, ${weaponRate}, ${potRate}
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
          consume_score = EXCLUDED.consume_score, consume_max = EXCLUDED.consume_max,
          enchant_mainhand = EXCLUDED.enchant_mainhand, enchant_head = EXCLUDED.enchant_head,
          enchant_shoulder = EXCLUDED.enchant_shoulder, enchant_chest = EXCLUDED.enchant_chest,
          enchant_legs = EXCLUDED.enchant_legs, enchant_bracer = EXCLUDED.enchant_bracer,
          enchant_gloves = EXCLUDED.enchant_gloves, enchant_score = EXCLUDED.enchant_score,
          flask_rate = EXCLUDED.flask_rate, battle_elix_rate = EXCLUDED.battle_elix_rate,
          guardian_elix_rate = EXCLUDED.guardian_elix_rate, food_rate = EXCLUDED.food_rate,
          weapon_rate = EXCLUDED.weapon_rate, pot_rate = EXCLUDED.pot_rate
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
