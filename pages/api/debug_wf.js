/**
 * GET /api/debug_wf?code=XXX&fight=2
 * Dumps ALL raw Buffs events for a specific fight so we can see
 * the exact field names, types, sourceID/targetID/abilityGameID values.
 * This is temporary debug tooling to figure out the WF detection schema.
 */
import { WCL_TOKEN_URL, WCL_API_URL } from '../../lib/constants';

async function getToken() {
  const creds = Buffer.from(`${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(WCL_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  return (await res.json()).access_token;
}

export default async function handler(req, res) {
  const { code, fight: fightId } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing ?code=' });

  const token = await getToken();

  // Get fight list + actor map
  const { data: d1 } = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($code:String!) { reportData { report(code:$code) {
        fights(killType:Encounters) { id name startTime endTime }
        masterData { actors(type:"Player") { id name } }
      }}}`,
      variables: { code },
    }),
  }).then(r => r.json());

  const report  = d1?.data?.reportData?.report || d1?.reportData?.report;
  const fights  = report?.fights || [];
  const actors  = report?.masterData?.actors || [];
  if (!fights.length) return res.json({ error: 'No fights found', raw: d1 });

  const actorMap = {};
  actors.forEach(a => { actorMap[a.id] = a.name; });

  // Pick fight by ID or default to first
  const fight = fightId
    ? fights.find(f => String(f.id) === String(fightId)) ?? fights[0]
    : fights[0];

  // Query ALL Buffs events for this fight (no filter — see raw schema)
  const { data: d2 } = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($code:String!, $start:Float!, $end:Float!) { reportData { report(code:$code) {
        events(dataType: Buffs, startTime: $start, endTime: $end, limit: 200) { data }
      }}}`,
      variables: { code, start: fight.startTime, end: fight.endTime },
    }),
  }).then(r => r.json());

  const events = d2?.data?.reportData?.report?.events?.data
              || d2?.reportData?.report?.events?.data
              || [];

  // Show the first 50 events in full so we can see all field names
  const sample = events.slice(0, 50).map(e => ({
    ...e,
    sourceName: actorMap[e.sourceID] ?? e.sourceID,
    targetName: actorMap[e.targetID] ?? e.targetID,
  }));

  // Also filter just WF-related (abilityGameID 25584 or name contains windfury)
  const wfOnly = events.filter(e =>
    e.abilityGameID === 25584 ||
    (e.ability?.name || '').toLowerCase().includes('windfury')
  ).map(e => ({
    ...e,
    sourceName: actorMap[e.sourceID] ?? e.sourceID,
    targetName: actorMap[e.targetID] ?? e.targetID,
  }));

  return res.json({
    fight: fight.name,
    fightId: fight.id,
    totalEvents: events.length,
    wfEvents: wfOnly,
    first50Events: sample,
  });
}
