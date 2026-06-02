import { WCL_TOKEN_URL } from '../../lib/constants';

const FRESH_TOKEN = 'https://fresh.warcraftlogs.com/oauth/token';
const FRESH_API   = 'https://fresh.warcraftlogs.com/api/v2/client';

async function getFreshToken() {
  const creds = Buffer.from(`${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(FRESH_TOKEN, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  return d.access_token;
}

async function freshQuery(token, query, variables = {}) {
  const r = await fetch(FRESH_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return (await r.json())?.data;
}

export default async function handler(req, res) {
  const token = await getFreshToken();

  const data = await freshQuery(token, `{
    worldData { zones { id name encounters { id name } } }
  }`);

  const zones = data?.worldData?.zones || [];

  return res.json({
    totalZones: zones.length,
    allZones: zones.map(z => ({ id: z.id, name: z.name, encounters: z.encounters?.length || 0 })),
  });
}
