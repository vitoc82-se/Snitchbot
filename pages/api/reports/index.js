import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  const rows = await sql`
    SELECT id, wcl_code, title, created_at
    FROM reports
    WHERE user_id = ${session.user.id}
    ORDER BY created_at DESC
  `;
  res.json(rows);
}
