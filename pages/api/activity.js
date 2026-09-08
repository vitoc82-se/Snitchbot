// Active-time % for a single boss kill — used only by /live.
// Returns per-player activity (activeTime / fight duration) and whether they
// survived the whole fight. The /live page filters to DPS/tanks and flags < 85%.
import { WCL_TOKEN_URL, WCL_API_URL } from '../../lib/constants';
import { redisGet, redisSet } from '../../lib/redis';

let _tok = null, _exp = 0;
async function getToken() {
  if (_tok && Date.now() < _exp) return _tok;
  const cached = await redisGet('wcl:token:retail').catch(() => null);
  if (cached) { _tok = cached; _exp = Date.now() + 60_000; return _tok; }
  const credentials = Buffer.from(`${process.env.WCL_CLIENT_ID}:${process.env.WCL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(WCL_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('WCL auth failed');
  _tok = data.access_token; _exp = Date.now() + (data.expires_in ? data.expires_in * 1000 - 60_000 : 300_000);
  await redisSet('wcl:token:retail', _tok, 3600).catch(() => {});
  return _tok;
}

async function queryWCL(token, query, variables) {
  const res = await fetch(WCL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
}

function extractCode(url) {
  const m = (url || '').match(/reports\/([a-zA-Z0-9]+)/);
  return m ? m[1] : (/^[a-zA-Z0-9]+$/.test((url || '').trim()) ? url.trim() : null);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { logUrl, fightId } = req.body || {};
  const code = extractCode(logUrl);
  if (!code || !fightId) return res.status(400).json({ error: 'logUrl and fightId required' });

  try {
    const token = await getToken();
    const d = await queryWCL(token, `
      query Q($code: String!, $fid: [Int]!) {
        reportData { report(code: $code) {
          fights(fightIDs: $fid) { id startTime endTime name }
          dmg:    table(dataType: DamageDone, fightIDs: $fid)
          deaths: table(dataType: Deaths,     fightIDs: $fid)
        }}
      }
    `, { code, fid: [Number(fightId)] });

    const report = d.reportData.report;
    const fight  = (report.fights || [])[0];
    if (!fight) return res.status(404).json({ error: 'fight not found' });
    const durationMs = fight.endTime - fight.startTime;

    // Names that died at any point in the fight → not "alive the whole fight".
    const deadEntries = report.deaths?.data?.entries || report.deaths?.data || [];
    const died = new Set((Array.isArray(deadEntries) ? deadEntries : []).map(e => e.name).filter(Boolean));

    const entries = report.dmg?.data?.entries || [];
    const players = entries.map(e => {
      const active = Number(e.activeTime) || 0;
      const pct = durationMs > 0 ? Math.round((active / durationMs) * 1000) / 10 : 0;
      return { name: e.name, activity: pct, alive: !died.has(e.name) };
    });

    return res.status(200).json({ fightId: fight.id, durationMs, players });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
