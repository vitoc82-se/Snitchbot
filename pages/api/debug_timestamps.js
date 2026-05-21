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

  const fights  = d1.reportData.report.fights;
  const actors  = d1.reportData.report.masterData.actors;
  const actorMap = {};
  actors.forEach(a => { actorMap[a.id] = a.name; });

  const HASTE_IDS = new Set([28507, 28494]);
  const logEnd = fights[fights.length - 1].endTime;

  // Page through cast events to find ALL haste potion casts
  const hasteCasts = [];
  let nextPage = 0;
  let pages = 0;
  while (nextPage !== null && pages < 20) {
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
      if (!HASTE_IDS.has(e.abilityGameID)) return;
      const playerName = actorMap[e.sourceID] || `actor_${e.sourceID}`;
      const matchedFight = fights.find(f =>
        e.timestamp >= f.startTime - 10000 && e.timestamp <= f.endTime
      );
      hasteCasts.push({
        t: e.timestamp,
        player: playerName,
        spell: e.abilityGameID,
        fight: matchedFight ? matchedFight.name : 'NO MATCH (trash or outside window)',
      });
    });

    nextPage = evBlock?.nextPageTimestamp ?? null;
  }

  return res.json({
    fights: fights.map(f => ({ name: f.name, start: f.startTime, end: f.endTime })),
    logEnd,
    pages,
    hasteCasts,
  });
}
