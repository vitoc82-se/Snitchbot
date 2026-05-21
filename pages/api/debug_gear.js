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

// Returns all temporaryEnchant IDs seen on weapon slots across the first fight.
// Use this to verify WEAPON_ENCHANT_IDS in constants.js.
// Usage: /api/debug_gear?code=XXXX
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

  const report = d1.reportData.report;
  const fights = report.fights || [];
  if (!fights.length) return res.json({ error: 'No fights found' });

  const actorMap = {};
  (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

  // Fetch CombatantInfo for the first fight only
  const fight = fights[0];
  const { data: d2 } = await queryWCL(token, `
    query($code: String!, $start: Float!, $end: Float!) {
      reportData { report(code: $code) {
        events(dataType: CombatantInfo, startTime: $start, endTime: $end) { data }
      }}
    }
  `, { code, start: fight.startTime, end: fight.endTime });

  const events = d2?.reportData?.report?.events?.data || [];

  // Extract all gear slots with temporaryEnchant set
  const byPlayer = events.map(event => {
    const name = actorMap[event.sourceID] || `actor_${event.sourceID}`;
    const tempEnchants = (event.gear || [])
      .filter(slot => slot.temporaryEnchant)
      .map(slot => ({ slot: slot.slot, itemId: slot.id, temporaryEnchant: slot.temporaryEnchant }));
    return { name, tempEnchants };
  }).filter(p => p.tempEnchants.length > 0);

  return res.json({
    fight: fight.name,
    playersWithTempEnchants: byPlayer,
  });
}
