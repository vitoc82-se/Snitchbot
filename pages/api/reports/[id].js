import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { id } = req.query;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM reports
      WHERE id = ${id} AND user_id = ${token.dbId}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    await sql`
      DELETE FROM reports
      WHERE id = ${id} AND user_id = ${token.dbId}
    `;
    return res.status(204).end();
  }

  // POST /api/reports/[id] — re-analyze: re-fetch from WCL and overwrite stored data.
  // Needed when detection logic changes after a report was originally saved.
  if (req.method === 'POST') {
    const rows = await sql`
      SELECT wcl_code FROM reports
      WHERE id = ${id} AND user_id = ${token.dbId}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const { wcl_code } = rows[0];

    // Call /api/analyze internally using the same host.
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers.host;
    const base  = process.env.NEXTAUTH_URL || `${proto}://${host}`;

    const analyzeRes = await fetch(`${base}/api/analyze`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ logUrl: `https://www.warcraftlogs.com/reports/${wcl_code}` }),
    });

    const freshData = await analyzeRes.json();
    if (!analyzeRes.ok || freshData.error) {
      return res.status(500).json({ error: freshData.error || 'Re-analysis failed' });
    }

    await sql`
      UPDATE reports
      SET data      = ${JSON.stringify(freshData)},
          title     = ${freshData.title || null}
      WHERE id = ${id} AND user_id = ${token.dbId}
    `;

    return res.json({ ok: true, title: freshData.title });
  }

  res.status(405).end();
}
