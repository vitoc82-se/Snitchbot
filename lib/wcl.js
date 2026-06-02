/**
 * Shared WCL API v2 client.
 * Used by the lookup fetch job. analyze.js still uses its own inline token logic
 * to avoid any risk of regression — this module is new code only.
 */
import { WCL_TOKEN_URL, WCL_API_URL } from './constants';

let _token  = null;
let _expiry = 0;

export async function getWclToken() {
  if (_token && Date.now() < _expiry) return _token;
  const creds = Buffer.from(
    `${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`
  ).toString('base64');
  const res  = await fetch(WCL_TOKEN_URL, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('WCL auth failed');
  _token  = data.access_token;
  _expiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

export async function wclQuery(query, variables = {}) {
  const token = await getWclToken();
  const res   = await fetch(WCL_API_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'WCL GraphQL error');
  return data.data;
}
