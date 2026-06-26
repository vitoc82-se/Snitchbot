import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  try {
    const rows = await sql`
      SELECT
        ls.id,
        ls.title,
        ls.created_at,
        COUNT(le.id)::int  AS entry_count,
        array_agg(DISTINCT le.raid_name ORDER BY le.raid_name) AS raids
      FROM loot_sessions ls
      LEFT JOIN loot_entries le ON le.session_id = ls.id
      WHERE ls.user_id = ${token.dbId}
      GROUP BY ls.id, ls.title, ls.created_at
      ORDER BY ls.created_at DESC
    `;
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
}
