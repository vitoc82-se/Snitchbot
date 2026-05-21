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

const POTION_CAST_IDS = {
  28507: 'haste_potion',
  28494: 'haste_potion',
  28508: 'destruction_potion',
  28499: 'mana_potion',
  17531: 'mana_potion',
};

const PREPOT_WINDOW_MS = 10000;

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) return res.json({ error: 'pass ?code=XXXX' });

  const token = await getToken();

  const { data: d1 } = await queryWCL(token, `
    query($code: String!) {
      reportData { report(code: $code) {
        fights(killType: Encounters) { id name startTime endTime kill }
        masterData { actors(type: "Player") { id name } }
        summary: table(dataType: Summary, startTime: 0, endTime: 9999999999)
      }}
    }
  `, { code });

  const report = d1.reportData.report;
  const fights = report.fights || [];
  const actorMap = {};
  (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

  const details = report.summary?.data?.playerDetails || {};
  const rosterByName = {};
  [...(details.tanks || []), ...(details.healers || []), ...(details.dps || [])].forEach(p => {
    rosterByName[p.name] = p;
  });

  const logEnd = fights.length ? fights[fights.length - 1].endTime : 9999999999;
  const fightPotions = {};
  fights.forEach(f => { fightPotions[f.id] = {}; });

  const raidPotionTotals = {};
  let nextPage = 0;
  let pages = 0;

  while (nextPage !== null && pages < 30) {
    pages++;
    const { data: d2 } = await queryWCL(token, `
      query($code: String!, $start: Float!, $end: Float!) {
        reportData { report(code: $code) {
          events(dataType: Casts, startTime: $start, endTime: $end, limit: 10000) {
            data nextPageTimestamp
          }
        }}
      }
    `, { code, start: nextPage, end: logEnd });

    const evBlock = d2?.reportData?.report?.events;
    (evBlock?.data || []).forEach(e => {
      if (e.type !== 'cast') return;
      const cat = POTION_CAST_IDS[e.abilityGameID];
      if (!cat) return;

      const playerName = actorMap[e.sourceID];

      // Raid totals
      if (playerName && rosterByName[playerName]) {
        if (!raidPotionTotals[playerName]) {
          raidPotionTotals[playerName] = { haste_potion: 0, destruction_potion: 0, mana_potion: 0 };
        }
        raidPotionTotals[playerName][cat] = (raidPotionTotals[playerName][cat] || 0) + 1;
      }

      // Per-fight totals
      const fight = fights.find(f =>
        e.timestamp >= f.startTime - PREPOT_WINDOW_MS &&
        e.timestamp <= f.endTime
      );
      if (fight) {
        if (!fightPotions[fight.id][e.sourceID]) fightPotions[fight.id][e.sourceID] = {};
        fightPotions[fight.id][e.sourceID][cat] = (fightPotions[fight.id][e.sourceID][cat] || 0) + 1;
      }
    });

    nextPage = evBlock?.nextPageTimestamp ?? null;
  }

  // Flatten fightPotions with readable names
  const fightBreakdown = fights.map(f => {
    const entries = Object.entries(fightPotions[f.id] || {}).map(([sid, cats]) => ({
      player: actorMap[Number(sid)] || `actor_${sid}`,
      inRoster: !!(actorMap[Number(sid)] && rosterByName[actorMap[Number(sid)]]),
      ...cats,
    }));
    return { fightId: f.id, fightName: f.name, entries };
  });

  return res.json({
    fights: fights.map(f => ({ id: f.id, name: f.name, start: f.startTime, end: f.endTime })),
    logEnd,
    pages,
    raidPotionTotals,
    fightBreakdown,
  });
}
