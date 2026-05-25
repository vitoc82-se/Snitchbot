import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const rows = await sql`
    SELECT id, wcl_code, title, created_at, data
    FROM reports
    WHERE user_id = ${token.dbId}
    ORDER BY created_at DESC
  `;

  const result = rows.map(r => ({
    id:         r.id,
    wcl_code:   r.wcl_code,
    title:      r.title,
    created_at: r.created_at,
    raid_date:  r.data?.raidDate ?? null,
    kills:      (r.data?.bosses || [])
                  .filter(b => b.attempts?.some(a => a.isKill))
                  .map(b => b.name),
  }));

  res.json(result);
}
