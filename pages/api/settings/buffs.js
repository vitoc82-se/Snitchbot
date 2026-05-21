import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export const DEFAULT_MANDATORY = {
  flask:    true,
  guardian: true,
  food:     true,
  pots:     true,
  weapon:   false,
};

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT mandatory FROM user_settings WHERE user_id = ${token.dbId}
    `;
    return res.json(rows[0]?.mandatory ?? DEFAULT_MANDATORY);
  }

  if (req.method === 'POST') {
    const mandatory = req.body;
    await sql`
      INSERT INTO user_settings (user_id, mandatory, updated_at)
      VALUES (${token.dbId}, ${JSON.stringify(mandatory)}, now())
      ON CONFLICT (user_id) DO UPDATE
        SET mandatory = EXCLUDED.mandatory,
            updated_at = now()
    `;
    return res.json({ ok: true });
  }

  res.status(405).end();
}
