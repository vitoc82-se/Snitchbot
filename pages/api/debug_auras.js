import { WCL_TOKEN_URL, WCL_API_URL } from '../../lib/constants';

async function getToken() {
  const credentials = Buffer.from(`${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(WCL_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  const { code, player, fight: fightName } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing ?code=' });

  const token = await getToken();

  const { data: d1 } = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `
      query($code:String!) { reportData { report(code:$code) {
        fights(killType:Encounters) { id name startTime endTime }
        masterData { actors(type:"Player") { id name } }
      }}}`, variables: { code } }),
  }).then(r => r.json());

  const report = d1.reportData.report;
  const fights = report.fights || [];
  if (!fights.length) return res.json({ error: 'No encounters' });

  const actorMap = {};
  (report.masterData?.actors || []).forEach(a => { actorMap[a.id] = a.name; });

  const fight = (fightName
    ? fights.find(f => f.name.toLowerCase().includes(fightName.toLowerCase()))
    : null) ?? fights[0];
  const { data: d2 } = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `
      query($code:String!, $start:Float!, $end:Float!) { reportData { report(code:$code) {
        events(dataType:CombatantInfo, startTime:$start, endTime:$end) { data }
      }}}`, variables: { code, start: fight.startTime, end: fight.endTime } }),
  }).then(r => r.json());

  const events = d2.reportData.report.events.data || [];

  const result = {};
  events.forEach(event => {
    const name = actorMap[event.sourceID];
    if (!name) return;
    if (player && !name.toLowerCase().includes(player.toLowerCase())) return;
    result[name] = (event.auras || []).map(a => ({
      id: a.ability,
      source: a.source,
      selfApplied: a.source === event.sourceID,
    }));
  });

  return res.json({ fight: fight.name, auras: result });
}
