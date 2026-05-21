const BASE  = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function pipeline(commands) {
  if (!BASE || !TOKEN) return null;
  const res = await fetch(`${BASE}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash pipeline failed: ${res.status}`);
  return res.json();
}

export async function trackAnalysis(code, ip) {
  if (!BASE || !TOKEN) return;
  const entry = JSON.stringify({ code, ip, ts: Date.now() });
  await pipeline([
    ['INCR', 'stats:count'],
    ['SADD', 'stats:ips', ip],
    ['LPUSH', 'stats:log', entry],
    ['LTRIM', 'stats:log', '0', '499'],
  ]);
}

export async function getStats() {
  if (!BASE || !TOKEN) return { totalReports: 0, uniqueUsers: 0, reports: [] };
  const results = await pipeline([
    ['GET', 'stats:count'],
    ['SCARD', 'stats:ips'],
    ['LRANGE', 'stats:log', '0', '199'],
  ]);
  const [countRes, ipsRes, logsRes] = results || [];
  const reports = (logsRes?.result || []).map(r => {
    try { return JSON.parse(r); } catch { return null; }
  }).filter(Boolean);
  return {
    totalReports: countRes?.result || 0,
    uniqueUsers:  ipsRes?.result  || 0,
    reports,
  };
}
