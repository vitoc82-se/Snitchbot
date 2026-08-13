/**
 * POST /api/lookup/weekly-fetch
 * Body: { name, serverSlug, serverRegion }
 *
 * Builds a per-raid-week history for one character and stores it in
 * player_lookup_weeks. Reuses the exact same WCL data as lookup/fetch.js
 * (character zoneRankings → encounterRankings → per-kill CombatantInfo/Casts),
 * but instead of collapsing all kills into all-time aggregates, it buckets each
 * individual kill into the raid week it happened in (Wed reset EU / Tue US) and
 * aggregates prep + parse per week.
 *
 *   prep  — consumable score for the kill (via lib/scoring), averaged per week
 *   parse — the kill's WCL percentile (rank.rankPercent), averaged + best per week
 *
 * Scope is capped to the last MAX_WEEKS raid weeks to bound WCL API cost.
 */

import sql from '../../../lib/db';
import { wclQuery, wclFreshQuery } from '../../../lib/wcl';
import { PREPOT_WINDOW_MS } from '../../../lib/constants';
import { score as calcScore, maxScore as calcMax, DEFAULT_MANDATORY } from '../../../lib/scoring';
import {
  CLASS_NAMES, TBC_RANKING_ZONES,
  specToRole, parseFightCons,
} from '../../../lib/wcl-consumables';
import { weekStartKey, lastNWeekKeys } from '../../../lib/raid-week';

const MAX_WEEKS = 6;         // how many raid weeks of history to keep
const MAX_KILLS = 150;       // hard safety cap on kills parsed per character

// ── DB auto-migration ────────────────────────────────────────────────────────
// Idempotent — mirrors the CREATE-IF-NOT-EXISTS pattern in lookup/fetch.js.
export async function ensureTables() {
  // Profile table is the FK target; created here too in case weekly-fetch runs
  // before the character has ever been looked up. Same definition as fetch.js.
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
    CREATE TABLE IF NOT EXISTS player_lookup_weeks (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      player_id   UUID NOT NULL REFERENCES player_lookup_profiles(id) ON DELETE CASCADE,
      week_start  DATE NOT NULL,
      kills       INT  NOT NULL DEFAULT 0,
      prep_score  NUMERIC(5,2),
      prep_max    NUMERIC(5,2),
      flask_rate  NUMERIC(4,2),
      food_rate   NUMERIC(4,2),
      pot_rate    NUMERIC(4,2),
      weapon_rate NUMERIC(4,2),
      avg_parse   NUMERIC(5,2),
      best_parse  NUMERIC(5,2),
      UNIQUE(player_id, week_start)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS user_characters (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      server_slug   TEXT NOT NULL,
      server_region TEXT NOT NULL,
      sort_order    INT DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT now(),
      UNIQUE(user_id, name, server_slug, server_region)
    )
  `;
}

/**
 * Core worker — runnable directly (from the characters API) or via the HTTP
 * handler below. Resolves to { weeks } on success; on failure it records the
 * error on the profile row and rethrows.
 */
export async function runWeeklyFetch({ name, serverSlug, serverRegion }) {
  if (!name?.trim() || !serverSlug?.trim() || !serverRegion?.trim()) {
    throw new Error('name, serverSlug, serverRegion are required');
  }

  const cleanName   = name.trim();
  const cleanSlug   = serverSlug.trim().toLowerCase();
  const cleanRegion = serverRegion.trim().toUpperCase();
  const nameLower   = cleanName.toLowerCase();

  try {
    await ensureTables();

    // Upsert profile → mark fetching
    const [profile] = await sql`
      INSERT INTO player_lookup_profiles (name, server_slug, server_region, fetch_status)
      VALUES (${cleanName}, ${cleanSlug}, ${cleanRegion}, 'fetching')
      ON CONFLICT (name, server_slug, server_region) DO UPDATE
        SET fetch_status = 'fetching', error_message = NULL
      RETURNING id
    `;
    const playerId = profile.id;

    // ── 1. Character info + which encounters have kills ─────────────────────
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

    // Collect encounter IDs that have any kills, plus a best spec for role.
    const encIds = new Set();
    let bestSpec = null;
    for (const zone of TBC_RANKING_ZONES) {
      for (const metric of ['dps', 'hps']) {
        const rankings = char[`zr${zone.id}${metric}`]?.rankings || [];
        for (const r of rankings) {
          if (r.encounter?.id && (r.totalKills ?? 0) > 0) {
            encIds.add(r.encounter.id);
            if (r.bestSpec && !bestSpec) bestSpec = r.bestSpec;
          }
        }
      }
    }

    const role = specToRole(bestSpec);

    await sql`
      UPDATE player_lookup_profiles
      SET class_id = ${char.classID}, class_name = ${className},
          role = ${role}, guild_name = ${guildName}
      WHERE id = ${playerId}
    `;

    // ── 2. encounterRankings → every kill with timestamp + parse ────────────
    const cutoffMs = weekStartByOffset(cleanRegion, MAX_WEEKS - 1);
    const validWeekKeys = new Set(lastNWeekKeys(cleanRegion, MAX_WEEKS));

    // weekKey → aggregate accumulator
    const weekAgg = {};
    const ensureWeek = (wk) => (weekAgg[wk] ||= {
      kills: 0, parseSum: 0, parseN: 0, bestParse: null,
      prepScoreSum: 0, prepN: 0, prepMax: null,
      flaskN: 0, foodN: 0, potN: 0, weaponN: 0,
    });

    // Kills that still need consumable parsing (prep), keyed to a report code.
    const killsToParse = []; // { uid, encId, weekKey, code, fightStart, fightEnd }

    if (encIds.size > 0) {
      const encList = [...encIds];
      const encAliases = encList.map(id => `e${id}: encounterRankings(encounterID: ${id})`).join('\n');
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
      let uid = 0;
      for (const encId of encList) {
        const ranks = encChar?.[`e${encId}`]?.ranks || [];
        for (const rank of ranks) {
          const startTime = rank?.startTime;
          const code      = rank?.report?.code;
          if (!startTime || !code) continue;
          if (startTime < cutoffMs) continue;               // outside the window
          const wk = weekStartKey(startTime, cleanRegion);
          if (!validWeekKeys.has(wk)) continue;             // guard against edge slips

          // Parse contribution (from ranking data — no extra WCL call).
          // WCL ranks expose the percentile as rankPercent; fall back to other
          // known field names so a naming change degrades gracefully.
          const w = ensureWeek(wk);
          w.kills++;
          const rp = rank.rankPercent ?? rank.percentile ?? rank.historicalPercent ?? null;
          if (rp !== null && rp !== undefined) {
            w.parseSum += rp;
            w.parseN++;
            if (w.bestParse === null || rp > w.bestParse) w.bestParse = rp;
          }

          // Queue for prep (consumable) parsing.
          if (killsToParse.length < MAX_KILLS) {
            const fightStart = startTime - rank.report.startTime;
            const fightEnd   = fightStart + (rank.duration || 600000);
            killsToParse.push({ uid: `k${uid++}`, encId, weekKey: wk, code, fightStart, fightEnd });
          }
        }
      }
    }

    // ── 3. Fetch consumables per report (batched), compute prep per kill ────
    const byReport = {};
    for (const k of killsToParse) (byReport[k.code] ||= []).push(k);

    await Promise.all(
      Object.entries(byReport).map(async ([code, kills]) => {
        const aliases = kills.flatMap(k => {
          const prePot = Math.max(0, k.fightStart - PREPOT_WINDOW_MS);
          return [
            `ci_${k.uid}: events(dataType: CombatantInfo, startTime: ${k.fightStart}, endTime: ${k.fightEnd}) { data }`,
            `ca_${k.uid}: events(dataType: Casts,          startTime: ${prePot},        endTime: ${k.fightEnd}) { data }`,
            `wf_${k.uid}: events(dataType: Buffs,          startTime: ${k.fightStart}, endTime: ${k.fightEnd}, limit: 10000) { data }`,
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

        for (const k of kills) {
          const ciEvents = report[`ci_${k.uid}`]?.data || [];
          const caEvents = report[`ca_${k.uid}`]?.data || [];
          const wfEvents = report[`wf_${k.uid}`]?.data || [];
          const parsed   = parseFightCons(ciEvents, caEvents, actorMap, auraNameMap, nameLower);
          if (!parsed) continue;
          const c = parsed.result;

          // Mirror fetch.js Windfury fallback: WF Attack proc during the fight.
          if (!c.windfury && wfEvents.some(e =>
            e.type === 'applybuff' && e.abilityGameID === 25584 &&
            ((actorMap[e.sourceID] || '').toLowerCase() === nameLower ||
             (actorMap[e.targetID] || '').toLowerCase() === nameLower)
          )) c.windfury = true;

          const player = {
            class: className, role,
            flask: c.flask, battle_elixir: c.battle_elixir,
            guardian_elixir: c.guardian_elixir, food: c.food,
            weapon_oil: c.weapon_oil, weapon_stone: c.weapon_stone, windfury: c.windfury,
            haste_potion: c.haste_potion, destruction_potion: c.destruction_potion,
            mana_potion: c.mana_potion,
          };

          const w = ensureWeek(k.weekKey);
          w.prepScoreSum += calcScore(player, DEFAULT_MANDATORY);
          w.prepMax = calcMax(player, DEFAULT_MANDATORY);
          w.prepN++;
          if (c.flask || c.battle_elixir)                    w.flaskN++;
          if (c.food)                                        w.foodN++;
          if (c.weapon_oil || c.weapon_stone || c.windfury)  w.weaponN++;
          if (c.haste_potion > 0 || c.destruction_potion > 0 || c.mana_potion > 0) w.potN++;
        }
      })
    );

    // ── 4. Write per-week rows ──────────────────────────────────────────────
    await sql`DELETE FROM player_lookup_weeks WHERE player_id = ${playerId}`;

    const round2 = (n) => (n === null || n === undefined ? null : parseFloat(n.toFixed(2)));

    for (const [wk, w] of Object.entries(weekAgg)) {
      if (!w.kills) continue;
      const prepScore = w.prepN ? round2(w.prepScoreSum / w.prepN) : null;
      const prepMax   = w.prepMax !== null ? round2(w.prepMax) : null;
      const avgParse  = w.parseN ? round2(w.parseSum / w.parseN) : null;
      const bestParse = w.bestParse !== null ? round2(w.bestParse) : null;
      const rateOf    = (n) => (w.prepN ? round2(n / w.prepN) : null);

      await sql`
        INSERT INTO player_lookup_weeks (
          player_id, week_start, kills, prep_score, prep_max,
          flask_rate, food_rate, pot_rate, weapon_rate, avg_parse, best_parse
        ) VALUES (
          ${playerId}, ${wk}, ${w.kills}, ${prepScore}, ${prepMax},
          ${rateOf(w.flaskN)}, ${rateOf(w.foodN)}, ${rateOf(w.potN)}, ${rateOf(w.weaponN)},
          ${avgParse}, ${bestParse}
        )
        ON CONFLICT (player_id, week_start) DO UPDATE SET
          kills = EXCLUDED.kills, prep_score = EXCLUDED.prep_score, prep_max = EXCLUDED.prep_max,
          flask_rate = EXCLUDED.flask_rate, food_rate = EXCLUDED.food_rate,
          pot_rate = EXCLUDED.pot_rate, weapon_rate = EXCLUDED.weapon_rate,
          avg_parse = EXCLUDED.avg_parse, best_parse = EXCLUDED.best_parse
      `;
    }

    await sql`
      UPDATE player_lookup_profiles
      SET fetch_status = 'done', fetched_at = now()
      WHERE id = ${playerId}
    `;

    return { weeks: Object.keys(weekAgg).length };

  } catch (err) {
    console.error('[lookup/weekly-fetch]', err);
    try {
      await sql`
        UPDATE player_lookup_profiles
        SET fetch_status = 'error', error_message = ${err.message}
        WHERE name = ${cleanName} AND server_slug = ${cleanSlug} AND server_region = ${cleanRegion}
      `;
    } catch {}
    throw err;
  }
}

// ── HTTP handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const result = await runWeeklyFetch(req.body || {});
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Reset instant (ms) that opens the raid week `offset` weeks before the current one.
function weekStartByOffset(region, offset) {
  const keys = lastNWeekKeys(region, offset + 1);
  const oldest = keys[keys.length - 1];
  return new Date(`${oldest}T00:00:00Z`).getTime();
}

export const config = { api: { responseLimit: false, bodyParser: true } };
