import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  const { id } = req.query;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT * FROM reports
      WHERE id = ${id} AND user_id = ${session.user.id}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    await sql`
      DELETE FROM reports
      WHERE id = ${id} AND user_id = ${session.user.id}
    `;
    return res.status(204).end();
  }

  res.status(405).end();
}
