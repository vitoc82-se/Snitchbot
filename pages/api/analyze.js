import {
  WCL_TOKEN_URL, WCL_API_URL, PREPOT_WINDOW_MS,
  FLASK_IDS, FOOD_IDS, GUARDIAN_IDS, BATTLE_IDS, POTION_CAST_IDS, SCROLL_IDS, WEAPON_ENCHANT_IDS,
  WF_ENCHANT_IDS, SHADOW_RESIST_ITEMS, SHADOW_RESIST_GEMS, SHADOW_PROTECTION_SR,
} from '../../lib/constants';
import { trackAnalysis, redisGet, redisSet } from '../../lib/redis';

// Classifies a self-applied aura into a consumable category.
// Returns null if the aura is not a tracked consumable.
function detectBuff(buffName, buffId, selfApplied) {
  const n = (buffName || '').toLowerCase();
  // Food is always self-consumed — WCL sometimes omits source, so check before selfApplied gate
  if (n.includes('well fed')) return 'food';
  if (FOOD_IDS.has(buffId))   return 'food';
  // Windfury comes from a Shaman totem — not self-applied, must check before the selfApplied gate
  if (n.includes('windfury')) return 'windfury';
  if (!selfApplied) return null;
  if (n.includes('flask'))       return 'flask';
  if (FLASK_IDS.has(buffId))     return 'flask';
  if (n === 'haste')             return 'haste_potion';
  if (n.includes('destruction')) return 'destruction_potion';
  if (GUARDIAN_IDS.has(buffId))  return 'guardian_elixir';
  if (BATTLE_IDS.has(buffId))    return 'battle_elixir';
  return null;
}

// In-memory token cache for this instance
let _analyzeToken = null, _analyzeExpiry = 0;

// These are TBC Anniversary (Fresh) reports. The FRESH endpoint is authoritative
// and serves the complete report — crucially the buff events/tables. The retail
// (www) endpoint returns CombatantInfo + summary for fresh reports but NOT buff
// events, which silently dropped any consumable drunk at/after the pull.
const FRESH_TOKEN_URL = 'https://fresh.warcraftlogs.com/oauth/token';
const FRESH_API_URL   = 'https://fresh.warcraftlogs.com/api/v2/client';

async function getToken() {
  // 1. In-memory cache
  if (_analyzeToken && Date.now() < _analyzeExpiry) return _analyzeToken;

  // 2. Redis shared cache
  const cached = await redisGet('wcl:token:fresh');
  if (cached) {
    _analyzeToken  = cached;
    _analyzeExpiry = Date.now() + 300_000;
    return cached;
  }

  // 3. Fetch a fresh token (same credentials work on the fresh endpoint)
  const credentials = Buffer.from(
    `${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(FRESH_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('Failed to authenticate with Warcraft Logs');
  const data = await res.json();
  if (!data.access_token) throw new Error('No access token in WCL response');

  const ttl = (data.expires_in ?? 3600) - 120;
  await redisSet('wcl:token:fresh', data.access_token, ttl);
  _analyzeToken  = data.access_token;
  _analyzeExpiry = Date.now() + Math.min(ttl, 300) * 1000;

  return data.access_token;
}

async function queryWCL(token, query, variables = {}) {
  const res = await fetch(FRESH_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data;
}

function extractCode(url) {
  const match = url.match(/reports\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function emptyPlayer(name, cls, role) {
  return {
    name, class: cls, role,
    flask: false, battle_elixir: false, guardian_elixir: false, food: false,
    scrolls: 0,
    haste_potion: 0, destruction_potion: 0,
    mana_potion: 0, survival_potion: 0, healthstone: 0,
    weapon_oil: false, weapon_stone: false, windfury: false,
    shadowResist: 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { logUrl } = req.body;
  if (!logUrl) return res.status(400).json({ error: 'Log URL is required' });
  const code = extractCode(logUrl);
  if (!code) return res.status(400).json({ error: 'Invalid Warcraft Logs URL' });

  try {
    const token = await getToken();

    // Q1: report metadata, roster, and pre-fight buff name map
    const { data: d1 } = await queryWCL(token, `
      query Q1($code: String!) {
        reportData { report(code: $code) {
          title
          startTime
          fights(killType: Encounters) { id name startTime endTime kill }
          masterData { actors(type: "Player") { id name subType } }
          summary: table(dataType: Summary, startTime: 0, endTime: 9999999999)
          buffs:   table(dataType: Buffs,   startTime: 0, endTime: 9999999999)
        }}
      }
    `, { code });

    const report = d1.reportData.report;
    const fights = report.fights || [];
    if (!fights.length) return res.status(400).json({ error: 'No encounters found in this log.' });

    const actorMap = {};
    (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

    const auraMap = {};
    (report.buffs?.data?.auras || []).forEach(a => { auraMap[a.guid] = a.name; });

    const details    = report.summary?.data?.playerDetails || {};
    const raidRoster = [
      ...(details.tanks   || []),
      ...(details.healers || []),
      ...(details.dps     || []),
    ];
    if (!raidRoster.length) return res.status(400).json({ error: 'No raid members found.' });

    const roleMap = {};
    (details.tanks   || []).forEach(p => { roleMap[p.name] = 'tank'; });
    (details.healers || []).forEach(p => { roleMap[p.name] = 'healer'; });
    (details.dps     || []).forEach(p => { roleMap[p.name] = 'dps'; });

    const rosterByName = {};
    raidRoster.forEach(p => { rosterByName[p.name] = p; });

    // Q2: CombatantInfo + WF buff events for every fight in one batched query
    const aliases = fights.flatMap((f, i) => [
      `f${i}:  events(dataType: CombatantInfo, startTime: ${f.startTime}, endTime: ${f.endTime}) { data }`,
      `wf${i}: events(dataType: Buffs,         startTime: ${f.startTime}, endTime: ${f.endTime}, limit: 10000) { data }`,
    ]).join('\n');

    const { data: d2 } = await queryWCL(token, `
      query Q2($code: String!) {
        reportData { report(code: $code) { ${aliases} }}
      }
    `, { code });

    const r2 = d2.reportData.report;

    // Q3: all cast events (paginated) for potion detection
    const fightPotions = {};
    fights.forEach(f => { fightPotions[f.id] = {}; });

    const raidPotionTotals = {}; // log-wide totals per player, including trash

    let nextPage = 0;
    while (nextPage !== null) {
      const logEnd = fights[fights.length - 1].endTime;
      const { data: d3 } = await queryWCL(token, `
        query Q3($code: String!, $start: Float!, $end: Float!) {
          reportData { report(code: $code) {
            events(dataType: Casts, startTime: $start, endTime: $end, limit: 10000) {
              data nextPageTimestamp
            }
          }}
        }
      `, { code, start: nextPage, end: logEnd });

      const evBlock = d3?.reportData?.report?.events;
      (evBlock?.data || []).forEach(e => {
        if (e.type !== 'cast') return;

        const cat = POTION_CAST_IDS[e.abilityGameID];
        if (!cat) return;

        // Raid-wide totals (haste/dest/mana only — healthstone + survival excluded)
        if (cat !== 'healthstone' && cat !== 'survival_potion') {
          const playerName = actorMap[e.sourceID];
          if (playerName && rosterByName[playerName]) {
            if (!raidPotionTotals[playerName]) {
              raidPotionTotals[playerName] = { haste_potion: 0, destruction_potion: 0, mana_potion: 0 };
            }
            raidPotionTotals[playerName][cat]++;
          }
        }

        // Per-fight totals (within fight windows + pre-pot window)
        const fight = fights.find(f =>
          e.timestamp >= f.startTime - PREPOT_WINDOW_MS &&
          e.timestamp <= f.endTime
        );
        if (!fight) return;
        if (!fightPotions[fight.id][e.sourceID]) fightPotions[fight.id][e.sourceID] = {};
        fightPotions[fight.id][e.sourceID][cat] = (fightPotions[fight.id][e.sourceID][cat] || 0) + 1;
      });

      nextPage = evBlock?.nextPageTimestamp ?? null;
    }

    const uniqueRoster = [...new Map(raidRoster.map(p => [p.name, p])).values()];

    const potionLeaderboard = uniqueRoster
      .map(p => {
        const t = raidPotionTotals[p.name] || { haste_potion: 0, destruction_potion: 0, mana_potion: 0 };
        return {
          name: p.name, class: p.type, role: roleMap[p.name] || 'dps',
          haste_potion: t.haste_potion,
          destruction_potion: t.destruction_potion,
          mana_potion: t.mana_potion,
          total: t.haste_potion + t.destruction_potion + t.mana_potion,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Build per-fight player maps from CombatantInfo + cast data
    const attemptCount = {};
    const fightResults = fights.map((fight, i) => {
      attemptCount[fight.name] = (attemptCount[fight.name] || 0) + 1;
      const attempt = attemptCount[fight.name];

      const combatantEvents = r2[`f${i}`]?.data || [];
      const playerMap = {};

      // Only add players who have a CombatantInfo event for this fight —
      // avoids penalising absent players in per-fight scoring.
      combatantEvents.forEach(event => {
        const playerName  = actorMap[event.sourceID];
        const rosterEntry = rosterByName[playerName];
        if (!rosterEntry) return;
        if (!playerMap[playerName]) {
          playerMap[playerName] = emptyPlayer(playerName, rosterEntry.type, roleMap[playerName] || 'dps');
        }
        // Shadow resistance: buff (+70, same-school buffs don't stack so take
        // presence, not sum) plus per-item and per-gem SR from the gear snapshot.
        let buffSR = 0;
        (event.auras || []).forEach(aura => {
          const selfApplied = aura.source === event.sourceID;
          const name = (auraMap[aura.ability] || aura.name || '').toLowerCase();
          if (name.includes('shadow protection') || name.includes('shadow resistance')) {
            buffSR = SHADOW_PROTECTION_SR;
          }
          if (selfApplied && SCROLL_IDS.has(aura.ability)) {
            playerMap[playerName].scrolls++;
            return;
          }
          const cat = detectBuff(auraMap[aura.ability] || '', aura.ability, selfApplied);
          if (cat) playerMap[playerName][cat] = true;
        });
        let gearSR = 0;
        (event.gear || []).forEach(slot => {
          const cat = WEAPON_ENCHANT_IDS[slot.temporaryEnchant];
          if (cat) playerMap[playerName][cat] = true;
          // Windfury Totem shows as a weapon temporaryEnchant when active at pull time
          if (WF_ENCHANT_IDS.has(slot.temporaryEnchant)) playerMap[playerName].windfury = true;
          gearSR += SHADOW_RESIST_ITEMS[slot.id] || 0;
          (slot.gems || []).forEach(g => { gearSR += SHADOW_RESIST_GEMS[g.id] || 0; });
        });
        playerMap[playerName].shadowResist = buffSR + gearSR;
      });

      // Merge cast-event potions
      const fpMap = fightPotions[fight.id] || {};
      Object.entries(fpMap).forEach(([sourceId, cats]) => {
        const playerName  = actorMap[Number(sourceId)];
        if (!playerName) return;
        const rosterEntry = rosterByName[playerName];
        if (!rosterEntry) return;
        if (!playerMap[playerName]) {
          playerMap[playerName] = emptyPlayer(playerName, rosterEntry.type, roleMap[playerName] || 'dps');
        }
        Object.assign(playerMap[playerName], cats);
      });

      // Consumable + WF detection from the per-fight Buffs events.
      // The CombatantInfo snapshot only captures buffs present at the exact pull
      // instant, so it misses consumables drunk a few seconds into the fight
      // (e.g. a battle elixir popped on the pull). The buff events cover the whole
      // fight, so union them in. Only persistent consumable auras are set here —
      // NOT haste/destruction potions (those are counted from cast events and
      // must not be clobbered into booleans).
      const BUFF_EVENT_TYPES = new Set(['applybuff', 'applybuffstack', 'refreshbuff', 'removebuff']);
      const EVENT_CONS_CATS  = new Set(['flask', 'food', 'guardian_elixir', 'battle_elixir', 'windfury']);
      (r2[`wf${i}`]?.data || []).forEach(e => {
        // Windfury Attack (25584) — the buffed player is the source.
        if (e.abilityGameID === 25584) {
          const wfName = actorMap[e.sourceID] || actorMap[e.targetID];
          if (wfName && playerMap[wfName]) playerMap[wfName].windfury = true;
          return;
        }
        if (!BUFF_EVENT_TYPES.has(e.type)) return;
        const playerName = actorMap[e.targetID];   // consumable buffs land on the target
        if (!playerName || !playerMap[playerName]) return;
        const selfApplied = e.sourceID === e.targetID;
        const cat = detectBuff(auraMap[e.abilityGameID] || '', e.abilityGameID, selfApplied);
        if (cat && EVENT_CONS_CATS.has(cat)) playerMap[playerName][cat] = true;
        // Scrolls: mark presence (don't inflate the count with repeated events).
        if (selfApplied && SCROLL_IDS.has(e.abilityGameID) && !playerMap[playerName]._scrollIds) {
          playerMap[playerName]._scrollIds = new Set();
        }
        if (selfApplied && SCROLL_IDS.has(e.abilityGameID)) playerMap[playerName]._scrollIds.add(e.abilityGameID);
      });

      // Fight length — used to gate the in-combat potion check. Potions are
      // popped mid-fight (typically on Bloodlust, which can be delayed well
      // into the pull), so a short wipe before anyone would reasonably pot
      // must not count as a missing potion. Stamp each player so the shared
      // scoring helpers can apply the duration gate.
      const durationMs = fight.endTime - fight.startTime;
      const players = Object.values(playerMap);
      players.forEach(p => {
        // Scrolls drunk at the pull show up in buff events but not the snapshot —
        // take the larger of the two (distinct scroll auras), never the sum.
        if (p._scrollIds) { p.scrolls = Math.max(p.scrolls || 0, p._scrollIds.size); delete p._scrollIds; }
        p.fightDurationMs = durationMs;
      });

      return {
        id: fight.id,
        name: fight.name,
        isKill: fight.kill,
        attempt,
        durationMs,
        players,
      };
    });

    // Group fights by boss name
    const bossMap = {};
    const bosses  = [];
    fightResults.forEach(f => {
      if (!bossMap[f.name]) {
        bossMap[f.name] = { name: f.name, attempts: [] };
        bosses.push(bossMap[f.name]);
      }
      bossMap[f.name].attempts.push(f);
    });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    await trackAnalysis(code, ip).catch(() => {});

    return res.json({ title: report.title, raidDate: report.startTime || null, bosses, potionLeaderboard });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to analyze log' });
  }
}
