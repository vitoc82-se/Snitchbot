/**
 * GET /api/debug_zones?name=Vitoduud&server=thunderstrike&region=EU
 * Tests: same credentials, fresh.warcraftlogs.com endpoint.
 */
import { WCL_TOKEN_URL, WCL_API_URL } from '../../lib/constants';

const FRESH_TOKEN = 'https://fresh.warcraftlogs.com/oauth/token';
const FRESH_API   = 'https://fresh.warcraftlogs.com/api/v2/client';

async function getToken(tokenUrl) {
  const creds = Buffer.from(
    `${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`
  ).toString('base64');
  const r = await fetch(tokenUrl, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  return d.access_token ? { ok: true, token: d.access_token } : { ok: false, error: d };
}

async function gql(apiUrl, token, query, variables = {}) {
  const r = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return r.json();
}

const CHAR_QUERY = `query($n:String!,$s:String!,$r:String!) {
  characterData {
    character(name:$n, serverSlug:$s, serverRegion:$r) {
      id classID name
    }
  }
}`;

const ZONES_QUERY = `{ worldData { zones { id name } } }`;

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;
  const vars = { n: name, s: server, r: region };

  // Auth on both endpoints with the SAME credentials
  const [retailAuth, freshAuth] = await Promise.all([
    getToken(WCL_TOKEN_URL),
    getToken(FRESH_TOKEN),
  ]);

  const result = { retailAuth: retailAuth.ok, freshAuth: freshAuth.ok };

  if (retailAuth.ok) {
    result.retailChar  = (await gql(WCL_API_URL,  retailAuth.token, CHAR_QUERY,  vars))?.data?.characterData?.character;
    result.retailZones = (await gql(WCL_API_URL,  retailAuth.token, ZONES_QUERY))?.data?.worldData?.zones?.slice(0,5).map(z=>z.name);
  }

  if (freshAuth.ok) {
    result.freshChar  = (await gql(FRESH_API, freshAuth.token, CHAR_QUERY,  vars))?.data?.characterData?.character;
    result.freshZones = (await gql(FRESH_API, freshAuth.token, ZONES_QUERY))?.data?.worldData?.zones?.slice(0,5).map(z=>z.name);
  } else {
    result.freshAuthError = freshAuth.error;
  }

  return res.json(result);
}
