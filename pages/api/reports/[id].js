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

  res.status(405).end();
}
