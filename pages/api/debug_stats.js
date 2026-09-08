// TEMP DEBUG: inspect CombatantInfo for a fight — resistances? and aggregate the
// unique item/gem/enchant/set IDs + a sample aura block so we can build a shadow
// resistance table. Usage: /api/debug_stats?code=XXXX&boss=Mother
async function getToken() {
  const credentials = Buffer.from(
    `${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch('https://www.warcraftlogs.com/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

async function queryWCL(token, query, variables = {}) {
  const res = await fetch('https://www.warcraftlogs.com/api/v2/client', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data;
}

export default async function handler(req, res) {
  const code = req.query.code;
  const bossFilter = (req.query.boss || '').toLowerCase();
  if (!code) return res.json({ error: 'pass ?code=XXXX' });

  const token = await getToken();

  const { data: d1 } = await queryWCL(token, `
    query($code: String!) {
      reportData { report(code: $code) {
        fights(killType: Encounters) { id name startTime endTime }
        masterData { actors(type: "Player") { id name } }
      }}
    }
  `, { code });

  const report = d1.reportData.report;
  const fights = report.fights || [];
  if (!fights.length) return res.json({ error: 'No fights found' });
  const actorMap = {};
  (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

  const wantId = req.query.fightId ? Number(req.query.fightId) : null;
  const fight = (wantId && fights.find(f => f.id === wantId))
    || fights.find(f => bossFilter && f.name.toLowerCase().includes(bossFilter))
    || fights[0];

  const { data: d2 } = await queryWCL(token, `
    query($code: String!, $start: Float!, $end: Float!) {
      reportData { report(code: $code) {
        events(dataType: CombatantInfo, startTime: $start, endTime: $end) { data }
      }}
    }
  `, { code, start: fight.startTime, end: fight.endTime });

  const events = d2?.reportData?.report?.events?.data || [];
  if (!events.length) return res.json({ fight: fight.name, note: 'no CombatantInfo events' });

  const items = new Set(), gems = new Set(), enchants = new Set(), sets = new Set(), auraIds = new Set();
  events.forEach(e => {
    (e.gear || []).forEach(g => {
      if (g.id) items.add(g.id);
      if (g.permanentEnchant) enchants.add(g.permanentEnchant);
      if (g.setID) sets.add(g.setID);
      (g.gems || []).forEach(gm => gm.id && gems.add(gm.id));
    });
    (e.auras || []).forEach(a => a.ability && auraIds.add(a.ability));
  });

  // Optional: dump one player's full raw gear so we can see exactly where SR lives.
  // Optional: dump buff apply/remove events for one ability during the fight,
  // to see whether a consumable was active mid-fight (not just at the pull snapshot).
  const abilityId = req.query.ability ? Number(req.query.ability) : null;
  let buffEvents = null;
  if (abilityId) {
    const bd = await queryWCL(token, `
      query($code:String!,$s:Float!,$e:Float!,$ab:Float!){
        reportData{report(code:$code){ events(dataType:Buffs, abilityID:$ab, startTime:$s, endTime:$e, limit:300){data} }}}
    `, { code, s: fight.startTime, e: fight.endTime, ab: abilityId });
    const evs = bd.reportData?.report?.events?.data || [];
    buffEvents = evs.map(e => ({
      t: e.type, atSec: Math.round((e.timestamp - fight.startTime) / 1000),
      src: actorMap[e.sourceID] || e.sourceID, tgt: actorMap[e.targetID] || e.targetID,
    }));
  }

  const who = (req.query.player || '').toLowerCase();
  let playerGear = null;
  let playerSnapshots = null;
  if (who) {
    const evs = events.filter(e => (actorMap[e.sourceID] || '').toLowerCase() === who);
    if (evs.length) {
      const ev = evs[0];
      playerGear = { name: actorMap[ev.sourceID], gear: ev.gear, auras: ev.auras };
      playerSnapshots = evs.map(e => ({
        timestamp: e.timestamp,
        auras: (e.auras || []).map(a => a.ability + ':' + (a.name || '')),
      }));
    }
  }

  return res.json({
    fight: fight.name,
    playerCount: events.length,
    uniqueItemIds:    [...items].sort((a, b) => a - b),
    uniqueGemIds:     [...gems].sort((a, b) => a - b),
    uniqueEnchantIds: [...enchants].sort((a, b) => a - b),
    uniqueSetIds:     [...sets].sort((a, b) => a - b),
    uniqueAuraIds:    [...auraIds].sort((a, b) => a - b),
    sampleAuras: (events[0].auras || []).slice(0, 8),
    playerGear,
    playerSnapshots,
    fightStart: fight.startTime,
    fightEnd: fight.endTime,
    buffEvents,
  });
}
