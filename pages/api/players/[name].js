import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { name } = req.query;

  const rows = await sql`
    SELECT
      r.id,
      r.wcl_code,
      r.title,
      r.created_at,
      p AS player
    FROM reports r,
         jsonb_array_elements(
           (SELECT jsonb_agg(pl)
            FROM jsonb_array_elements(r.data->'bosses') b,
                 jsonb_array_elements(b->'attempts') a,
                 jsonb_array_elements(a->'players') pl)
         ) p
    WHERE r.user_id = ${token.dbId}
      AND p->>'name' = ${name}
    ORDER BY r.created_at DESC
  `;
  res.json(rows);
}
