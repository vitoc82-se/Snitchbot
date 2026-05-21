import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const rows = await sql`
    SELECT id, wcl_code, title, created_at
    FROM reports
    WHERE user_id = ${token.dbId}
    ORDER BY created_at DESC
  `;
  res.json(rows);
}
