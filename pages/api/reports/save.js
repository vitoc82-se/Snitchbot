import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { code, title, data } = req.body;
  if (!code || !data) return res.status(400).json({ error: 'Missing code or data' });

  try {
    const rows = await sql`
      INSERT INTO reports (user_id, wcl_code, title, data)
      VALUES (${token.dbId}, ${code}, ${title || null}, ${JSON.stringify(data)})
      ON CONFLICT (user_id, wcl_code) DO UPDATE
        SET title = EXCLUDED.title,
            data  = EXCLUDED.data
      RETURNING id
    `;
    res.json({ id: rows[0].id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
