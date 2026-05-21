import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  const { id } = req.query;
  const rows = await sql`
    SELECT * FROM reports
    WHERE id = ${id} AND user_id = ${session.user.id}
  `;
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}
