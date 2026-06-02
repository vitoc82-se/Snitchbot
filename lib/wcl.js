/**
 * Shared WCL API v2 clients.
 *
 * TWO separate WCL instances:
 *   - warcraftlogs.com     → retail WoW (reportData works for any log)
 *   - fresh.warcraftlogs.com → TBC Anniversary Fresh (character/zone data)
 *
 * analyze.js still uses its own inline token logic for the retail API — this
 * module is new code only and is used by the lookup feature.
 *
 * Required env vars:
 *   WCL_CLIENT_ID / WCL_CLIENT_SECRET           — retail, already set
 *   WCL_FRESH_CLIENT_ID / WCL_FRESH_CLIENT_SECRET — register at fresh.warcraftlogs.com/api/clients
 */
import { WCL_TOKEN_URL, WCL_API_URL } from './constants';

const FRESH_TOKEN_URL = 'https://fresh.warcraftlogs.com/oauth/token';
const FRESH_API_URL   = 'https://fresh.warcraftlogs.com/api/v2/client';

// Token cache for each instance
const _cache = { retail: { token: null, expiry: 0 }, fresh: { token: null, expiry: 0 } };

async function getToken(tokenUrl, clientId, clientSecret, cacheKey) {
  const c = _cache[cacheKey];
  if (c.token && Date.now() < c.expiry) return c.token;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res   = await fetch(tokenUrl, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`WCL auth failed (${cacheKey}): ${JSON.stringify(data)}`);
  c.token  = data.access_token;
  c.expiry = Date.now() + (data.expires_in - 60) * 1000;
  return c.token;
}

async function query(apiUrl, token, gql, variables = {}) {
  const res  = await fetch(apiUrl, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query: gql, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'WCL GraphQL error');
  return data.data;
}

/** Query the retail WCL API (warcraftlogs.com) */
export async function wclQuery(gql, variables = {}) {
  const token = await getToken(WCL_TOKEN_URL, process.env.WCL_CLIENT_ID, process.env.WCL_CLIENT_SECRET, 'retail');
  return query(WCL_API_URL, token, gql, variables);
}

/**
 * Query the Fresh WCL API (fresh.warcraftlogs.com) using the SAME credentials
 * as the retail API — WCL clients are site-wide. Only the endpoint differs.
 * Use this for characterData and worldData (character rankings, zone info).
 * Use wclQuery for reportData (analyzing log files) — retail endpoint works for those.
 */
export async function wclFreshQuery(gql, variables = {}) {
  const id     = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET not set');
  const token = await getToken(FRESH_TOKEN_URL, id, secret, 'fresh');
  return query(FRESH_API_URL, token, gql, variables);
}
