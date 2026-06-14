/**
 * POST /api/guild/scan
 * Efficient batch scan of all guild members.
 *
 * Key optimisations vs calling /api/lookup/fetch per player:
 *   1. Batches character + zone-ranking queries (3 players per Fresh API call)
 *   2. Deduplicates retail report fetches — if 20 guild members share the same
 *      raid log, that log is queried ONCE and all 20 players' data extracted.
 *      (vs 20 separate queries in the naïve approach)
 *   3. Skips consistency-rate calculation (all-kills pass) entirely.
 *
 * Typical WCL point cost:
 *   Naïve per-player approach:  ~600 pts / 50 players
 *   This endpoint:              ~80-120 pts / 50 players  (~5-8x improvement)
 *
 * Auth: JWT required.
 */
import sql from '../../../lib/db';
import { wclQuery, wclFreshQuery } from '../../../lib/wcl';
import { getToken as getJWT } from 'next-auth/jwt';
import {
  PREPOT_WINDOW_MS,
  FLASK_IDS, FOOD_IDS, GUARDIAN_IDS, BATTLE_IDS,
  POTION_CAST_IDS, WEAPON_ENCHANT_IDS, WF_ENCHANT_IDS,
} from '../../../lib/constants';
import { score as calcScore, maxScore as calcMax, DEFAULT_MANDATORY } from '../../../lib/scoring';

const CLASS_NAMES = {
  1: 'Death Knight', 2: 'Druid',  3: 'Hunter', 4: 'Mage',    5: 'Monk',
  6: 'Paladin',      7: 'Priest', 8: 'Rogue',  9: 'Shaman', 10: 'Warlock',
 11: 'Warrior',     12: 'Demon Hunter', 13: 'Evoker',
};

const ENCHANT_SLOTS   = { mainhand: 15, head: 0, shoulder: 2, chest: 4, legs: 6, bracer: 8, gloves: 9 };
const ENCHANT_WEIGHTS = { mainhand: 25, head: 20, shoulder: 15, legs: 15, gloves: 10, bracer: 8, chest: 7 };

const TBC_RANKING_ZONES = [
  { id: 1047, name: 'Karazhan'            },
  { id: 1048, name: 'Gruul / Magtheridon' },
  { id: 1056, name: 'SSC / TK'            },
];

const CHAR_BATCH = 3;  // players per Fresh API character query
const ENC_BATCH  = 3;  // players per Fresh API encounter-rankings query

function specToRole(spec) {
  if (!spec) return 'dps';
  const s = spec.toLowerCase();
  if (s.includes('holy') || s.includes('restoration') || s.includes('discipline')) return 'healer';
  if (s.includes('protection') || s === 'feral combat' || s === 'guardian') return 'tank';
  return 'dps';
}

function detectBuff(buffName, buffId, selfApplied) {
  const n = (buffName || '').toLowerCase();
  if (n.includes('well fed') || FOOD_IDS.has(buffId)) return 'food';
  if (n.includes('windfury')) return 'windfury';
  if (!selfApplied) return null;
  if (n.includes('flask') || FLASK_IDS.has(buffId)) return 'flask';
  if (GUARDIAN_IDS.has(buffId)) return 'guardian_elixir';
  if (BATTLE_IDS.has(buffId))   return 'battle_elixir';
  return null;
}

function detectEnchants(gear) {
  const result = {};
  let enchantScore = 0;
  for (const [slot, idx] of Object.entries(ENCHANT_SLOTS)) {
    const enchanted = (gear?.[idx]?.permanentEnchant ?? 0) > 0;
    result[slot] = enchanted;
    if (enchanted) enchantScore += ENCHANT_WEIGHTS[slot] ?? 0;
  }
  return { ...result, enchantScore };
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = await getJWT({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Login required' });

  const { members, serverSlug, serverRegion } = req.body;
  if (!Array.isArray(members) || !members.length || !serverSlug || !serverRegion) {
    return res.status(400).json({ error: 'members, serverSlug, serverRegion required' });
  }

  const cleanSlug   = serverSlug.trim().toLowerCase();
  const cleanRegion = serverRegion.trim().toUpperCase();

  try {
    // ── Step 1: Batch character + zone rankings (3 players per Fresh query) ──
    const zrAliases = TBC_RANKING_ZONES.flatMap(z => [
      `zr${z.id}dps: zoneRankings(zoneID: ${z.id}, metric: dps)`,
      `zr${z.id}hps: zoneRankings(zoneID: ${z.id}, metric: hps)`,
    ]).join('\n');

    const charInfo = {}; // name → { classId, className, guildName, charData }

    for (let i = 0; i < members.length; i += CHAR_BATCH) {
      const batch  = members.slice(i, i + CHAR_BATCH);
      const aliases = batch.map((m, j) =>
        `p${j}: character(name: ${JSON.stringify(m.name)}, serverSlug: "${cleanSlug}", serverRegion: "${cleanRegion}") {
           id classID
           guilds { name }
           ${zrAliases}
         }`
      ).join('\n');

      const result = await wclFreshQuery(`query { characterData { ${aliases} } }`);

      for (let j = 0; j < batch.length; j++) {
        const char = result?.characterData?.[`p${j}`];
        if (!char) continue;
        charInfo[batch[j].name] = {
          classId:   char.classID,
          className: CLASS_NAMES[char.classID] || batch[j].className || 'Unknown',
          guildName: char.guilds?.[0]?.name ?? null,
          rawChar:   char,
        };
      }
    }

    // ── Step 2: Build ranking maps per player ────────────────────────────────
    const rankingMaps = {}; // name → { encId → { bossName, zoneId, zoneName, rankPercent, ... } }
    const allEncounters = {}; // name → [ allEncounterEntries ]

    for (const [name, info] of Object.entries(charInfo)) {
      const char = info.rawChar;
      const merged = {};

      for (const zone of TBC_RANKING_ZONES) {
        const dpsR = char[`zr${zone.id}dps`]?.rankings || [];
        const hpsR = char[`zr${zone.id}hps`]?.rankings || [];
        const hpsById = {};
        for (const r of hpsR) { if (r.encounter?.id) hpsById[r.encounter.id] = r; }

        for (const r of dpsR) {
          const encId = r.encounter?.id;
          if (!encId) continue;
          const hps  = hpsById[encId];
          const useDps = !hps || (r.bestAmount ?? 0) >= (hps.bestAmount ?? 0);
          const best  = useDps ? r : hps;
          merged[encId] = {
            encId, bossName: best.encounter.name,
            zoneId: zone.id, zoneName: zone.name,
            rankPercent:   best.rankPercent   ?? null,
            medianPercent: best.medianPercent ?? null,
            bestAmount:    best.bestAmount    ?? null,
            totalKills:    best.totalKills    ?? 0,
            fastestKill:   best.fastestKill   ?? null,
            bestSpec:      best.bestSpec      ?? null,
          };
        }
        for (const [hEncId, hR] of Object.entries(hpsById)) {
          if (!merged[hEncId]) {
            merged[hEncId] = {
              encId: Number(hEncId), bossName: hR.encounter.name,
              zoneId: zone.id, zoneName: zone.name,
              rankPercent: hR.rankPercent ?? null, medianPercent: hR.medianPercent ?? null,
              bestAmount: hR.bestAmount ?? null, totalKills: hR.totalKills ?? 0,
              fastestKill: hR.fastestKill ?? null, bestSpec: hR.bestSpec ?? null,
            };
          }
        }
      }

      rankingMaps[name] = {};
      for (const [encId, entry] of Object.entries(merged)) {
        if ((entry.totalKills ?? 0) > 0) rankingMaps[name][encId] = entry;
      }
      allEncounters[name] = Object.values(merged);
    }

    // ── Step 3: Batch encounter rankings to get report codes ─────────────────
    const playerNames = Object.keys(charInfo);
    const encRankData = {}; // name → { encId → { reportCode, fightStart, fightEnd } }

    for (let i = 0; i < playerNames.length; i += ENC_BATCH) {
      const batch = playerNames.slice(i, i + ENC_BATCH);
      const withKills = batch.map(name => ({
        name,
        encs: Object.values(rankingMaps[name] || {}),
      })).filter(p => p.encs.length > 0);

      if (!withKills.length) continue;

      const charAliases = withKills.map((p, j) => {
        const encAliases = p.encs.map(e =>
          `e${e.encId}: encounterRankings(encounterID: ${e.encId})`
        ).join('\n');
        return `p${j}: character(name: ${JSON.stringify(p.name)}, serverSlug: "${cleanSlug}", serverRegion: "${cleanRegion}") { ${encAliases} }`;
      }).join('\n');

      const result = await wclFreshQuery(`query { characterData { ${charAliases} } }`);

      for (let j = 0; j < withKills.length; j++) {
        const pName  = withKills[j].name;
        const pChar  = result?.characterData?.[`p${j}`];
        if (!pChar) continue;
        encRankData[pName] = {};

        for (const enc of withKills[j].encs) {
          const er = pChar[`e${enc.encId}`];
          if (!er?.ranks?.length) continue;
          // Pick latest kill
          const latestKill = er.ranks.reduce((latest, r) =>
            r?.report?.code && (!latest || r.startTime > latest.startTime) ? r : latest
          , null);
          if (!latestKill?.report?.code) continue;
          const fs = latestKill.startTime - latestKill.report.startTime;
          encRankData[pName][enc.encId] = {
            reportCode: latestKill.report.code,
            fightStart: fs,
            fightEnd:   fs + (latestKill.duration ?? 0),
          };
          // Attach to ranking entry
          if (rankingMaps[pName][enc.encId]) {
            rankingMaps[pName][enc.encId].reportCode = latestKill.report.code;
            rankingMaps[pName][enc.encId].fightStart = fs;
            rankingMaps[pName][enc.encId].fightEnd   = fs + (latestKill.duration ?? 0);
          }
        }
      }
    }

    // ── Step 4: Deduplicate retail API calls by report code ──────────────────
    // Key insight: guild members raid together → same log, same fights.
    // Collect: reportCode → [ { playerName, encId, fightStart, fightEnd } ]
    const reportGroups = {};
    for (const [pName, encMap] of Object.entries(encRankData)) {
      for (const [encId, info] of Object.entries(encMap)) {
        const code = info.reportCode;
        if (!reportGroups[code]) reportGroups[code] = [];
        reportGroups[code].push({ playerName: pName, encId: Number(encId), ...info });
      }
    }

    // Fetch each unique report ONCE, extract all players' consumable data
    const consumableMap = {}; // `${playerName}:${encId}` → consumable fields

    for (const [code, entries] of Object.entries(reportGroups)) {
      // Deduplicate fight windows (same encId might appear for multiple players but has one window)
      const fightWindows = {};
      for (const e of entries) {
        if (!fightWindows[e.encId] || e.fightStart < fightWindows[e.encId].fightStart) {
          fightWindows[e.encId] = { fightStart: e.fightStart, fightEnd: e.fightEnd };
        }
      }

      const bossAliases = Object.entries(fightWindows).flatMap(([encId, fw]) => {
        const prePot = Math.max(0, fw.fightStart - PREPOT_WINDOW_MS);
        return [
          `ci_${encId}: events(dataType: CombatantInfo, startTime: ${fw.fightStart}, endTime: ${fw.fightEnd}) { data }`,
          `ca_${encId}: events(dataType: Casts, startTime: ${prePot}, endTime: ${fw.fightEnd}) { data }`,
          `wf_${encId}: events(dataType: Buffs, startTime: ${fw.fightStart}, endTime: ${fw.fightEnd}, limit: 10000) { data }`,
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
      if (!report) continue;

      const actorMap = {};
      (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name.toLowerCase(); });

      const auraNameMap = {};
      (report.buffs?.data?.auras || []).forEach(a => { auraNameMap[a.guid] = a.name; });

      // Build actor ID → name for quick lookup
      const nameToActorId = {};
      for (const [id, name] of Object.entries(actorMap)) nameToActorId[name] = id;

      // Process each player that has kills in this report
      const playersInReport = [...new Set(entries.map(e => e.playerName))];

      for (const pName of playersInReport) {
        const sourceId = nameToActorId[pName.toLowerCase()];
        if (!sourceId) continue;

        const playerEncIds = entries.filter(e => e.playerName === pName).map(e => e.encId);

        for (const encId of playerEncIds) {
          const ciEvents = report[`ci_${encId}`]?.data || [];
          const caEvents = report[`ca_${encId}`]?.data || [];
          const wfEvents = report[`wf_${encId}`]?.data || [];
          const myEvent  = ciEvents.find(e => String(e.sourceID) === String(sourceId));

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
              if (WF_ENCHANT_IDS.has(slot.temporaryEnchant)) result.windfury = true;
            }
            const enchants = detectEnchants(myEvent.gear);
            Object.assign(result, {
              enchant_mainhand: enchants.mainhand, enchant_head: enchants.head,
              enchant_shoulder: enchants.shoulder, enchant_chest: enchants.chest,
              enchant_legs:     enchants.legs,     enchant_bracer: enchants.bracer,
              enchant_gloves:   enchants.gloves,   enchantScore:   enchants.enchantScore,
            });
          }

          for (const cast of caEvents) {
            if (String(cast.sourceID) !== String(sourceId)) continue;
            const cat = POTION_CAST_IDS[cast.abilityGameID];
            if (cat && typeof result[cat] === 'number') result[cat]++;
          }
          if (!result.windfury && wfEvents.some(e =>
            e.type === 'applybuff' &&
            e.abilityGameID === 25584 &&
            (String(e.sourceID) === String(sourceId) ||
             String(e.targetID) === String(sourceId))
          )) {
            result.windfury = true;
          }

          consumableMap[`${pName}:${encId}`] = result;
        }
      }
    }

    // ── Step 5: Write all results to DB ──────────────────────────────────────
    const results = [];

    for (const [pName, info] of Object.entries(charInfo)) {
      // Upsert profile
      const role = specToRole(
        Object.values(rankingMaps[pName] || {}).find(r => r.bestSpec)?.bestSpec
      );

      const [profile] = await sql`
        INSERT INTO player_lookup_profiles (name, server_slug, server_region, class_id, class_name, role, guild_name, fetch_status, fetched_at)
        VALUES (${pName}, ${cleanSlug}, ${cleanRegion}, ${info.classId}, ${info.className}, ${role}, ${info.guildName}, 'done', now())
        ON CONFLICT (name, server_slug, server_region) DO UPDATE
          SET class_id = EXCLUDED.class_id, class_name = EXCLUDED.class_name,
              role = EXCLUDED.role, guild_name = EXCLUDED.guild_name,
              fetch_status = 'done', fetched_at = now()
        RETURNING id
      `;
      const playerId = profile.id;

      await sql`DELETE FROM player_lookup_bosses WHERE player_id = ${playerId}`;

      const encs = allEncounters[pName] || [];
      for (const enc of encs) {
        const ranking = rankingMaps[pName]?.[enc.encId] ?? null;
        const cons    = consumableMap[`${pName}:${enc.encId}`] ?? null;

        const fakePlayer = cons && ranking ? {
          class: info.className, role,
          flask: cons.flask, battle_elixir: cons.battle_elixir,
          guardian_elixir: cons.guardian_elixir, food: cons.food,
          weapon_oil: cons.weapon_oil, weapon_stone: cons.weapon_stone,
          haste_potion: cons.haste_potion, destruction_potion: cons.destruction_potion,
          mana_potion: cons.mana_potion,
        } : null;

        const cScore = fakePlayer ? calcScore(fakePlayer, DEFAULT_MANDATORY) : null;
        const cMax   = fakePlayer ? calcMax(fakePlayer, DEFAULT_MANDATORY)   : null;

        await sql`
          INSERT INTO player_lookup_bosses (
            player_id, zone_id, zone_name, encounter_id, boss_name, report_code, best_spec,
            rank_percent, median_percent, best_amount, total_kills, fastest_kill,
            flask, battle_elixir, guardian_elixir, food, weapon_oil, weapon_stone,
            haste_potion, destruction_potion, mana_potion, healthstone,
            consume_score, consume_max,
            enchant_mainhand, enchant_head, enchant_shoulder, enchant_chest,
            enchant_legs, enchant_bracer, enchant_gloves, enchant_score
          ) VALUES (
            ${playerId}, ${enc.zoneId}, ${enc.zoneName}, ${enc.encId}, ${enc.bossName},
            ${ranking?.reportCode ?? null}, ${ranking?.bestSpec ?? null},
            ${ranking?.rankPercent ?? null}, ${ranking?.medianPercent ?? null},
            ${ranking?.bestAmount ?? null}, ${ranking?.totalKills ?? 0},
            ${ranking?.fastestKill ?? null},
            ${cons?.flask ?? null}, ${cons?.battle_elixir ?? null},
            ${cons?.guardian_elixir ?? null}, ${cons?.food ?? null},
            ${cons?.weapon_oil ?? null}, ${cons?.weapon_stone ?? null},
            ${cons?.haste_potion ?? 0}, ${cons?.destruction_potion ?? 0},
            ${cons?.mana_potion ?? 0}, ${cons?.healthstone ?? 0},
            ${cScore}, ${cMax},
            ${cons?.enchant_mainhand ?? null}, ${cons?.enchant_head ?? null},
            ${cons?.enchant_shoulder ?? null}, ${cons?.enchant_chest ?? null},
            ${cons?.enchant_legs ?? null}, ${cons?.enchant_bracer ?? null},
            ${cons?.enchant_gloves ?? null}, ${cons?.enchantScore ?? null}
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
            enchant_gloves = EXCLUDED.enchant_gloves, enchant_score = EXCLUDED.enchant_score
        `;
      }

      results.push({ name: pName, className: info.className, role, status: 'done' });
    }

    // Mark any members not in WCL as error
    const foundNames = new Set(Object.keys(charInfo));
    for (const m of members) {
      if (!foundNames.has(m.name)) {
        await sql`
          UPDATE player_lookup_profiles
          SET fetch_status = 'error',
              error_message = 'Player not found on Warcraft Logs (may be rate limit — try re-scanning)'
          WHERE name = ${m.name} AND server_slug = ${cleanSlug} AND server_region = ${cleanRegion}
        `;
        results.push({ name: m.name, className: m.className, role: null, status: 'error' });
      }
    }

    return res.json({ ok: true, scanned: results.length, results });

  } catch (err) {
    console.error('[guild/scan]', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { bodyParser: true, responseLimit: false }, maxDuration: 300 };
