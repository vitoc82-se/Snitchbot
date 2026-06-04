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
  const { code, player } = req.query;
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

  // Find actor ID for the requested player name (case-insensitive)
  const playerLower = (player || '').toLowerCase();
  const playerEntry = actors.find(a => a.name.toLowerCase() === playerLower);

  // Query WF buff events (abilityGameID 25584) for every fight, bundled into one query
  const aliases = fights.map((f, i) =>
    `f${i}: events(dataType: Buffs, startTime: ${f.startTime}, endTime: ${f.endTime}, limit: 10000) { data }`
  ).join('\n');

  const { data: d2 } = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($code:String!) { reportData { report(code:$code) { ${aliases} }}}`,
      variables: { code },
    }),
  }).then(r => r.json());

  const r2 = d2?.data?.reportData?.report || d2?.reportData?.report || {};

  const results = fights.map((f, i) => {
    const allEvents = r2[`f${i}`]?.data || [];
    const wfEvents  = allEvents.filter(e => e.type === 'applybuff' && e.abilityGameID === 25584);
    return {
      fightId:   f.id,
      fightName: f.name,
      totalBuffEvents: allEvents.length,
      wfEventCount: wfEvents.length,
      wfEvents: wfEvents.map(e => ({
        ...e,
        sourceName: actorMap[e.sourceID] ?? e.sourceID,
        targetName: actorMap[e.targetID] ?? e.targetID,
      })),
    };
  });

  return res.json({
    code,
    playerQuery: player || null,
    playerActorId: playerEntry?.id ?? 'NOT FOUND',
    actors: actors.map(a => ({ id: a.id, name: a.name })),
    fights: results,
  });
}
