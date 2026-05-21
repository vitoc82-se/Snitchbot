import { getSession } from 'next-auth/react';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const session = await getSession({ req });
  if (!session) return res.status(401).json({ error: 'Not logged in' });

  // Aggregate per player across all saved reports for this user
  const rows = await sql`
    SELECT
      p->>'name'                          AS name,
      p->>'class'                         AS class,
      p->>'role'                          AS role,
      COUNT(*)::int                       AS appearances,
      ROUND(AVG((p->>'score')::numeric), 2) AS avg_score,
      ROUND(AVG((p->>'maxScore')::numeric), 2) AS avg_max,
      SUM(CASE WHEN (p->>'prepared')::boolean THEN 1 ELSE 0 END)::int AS prepared_count
    FROM reports r,
         jsonb_array_elements(
           (SELECT jsonb_agg(pl)
            FROM jsonb_array_elements(r.data->'bosses') b,
                 jsonb_array_elements(b->'attempts') a,
                 jsonb_array_elements(a->'players') pl)
         ) p
    WHERE r.user_id = ${session.user.id}
    GROUP BY p->>'name', p->>'class', p->>'role'
    ORDER BY avg_score DESC
  `;
  res.json(rows);
}
