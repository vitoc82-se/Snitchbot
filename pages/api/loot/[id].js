import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'DELETE') return handleDelete(req, res);
  if (req.method !== 'GET') return res.status(405).end();

  const { id } = req.query;
  try {
    const [session] = await sql`
      SELECT id, title, created_at FROM loot_sessions WHERE id = ${id}
    `;
    if (!session) return res.status(404).json({ error: 'Not found' });

    const entries = await sql`
      SELECT
        id, soft_res_id, raid_name, raid_date, item_id, item_name,
        awarded_to, awarded_by, winner_class, winning_roll_type,
        is_os, is_sr, received
      FROM loot_entries
      WHERE session_id = ${id}
      ORDER BY raid_date ASC, id ASC
    `;

    res.json({ session, entries });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function handleDelete(req, res) {
  const { getToken } = await import('next-auth/jwt');
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { id } = req.query;
  await sql`DELETE FROM loot_sessions WHERE id = ${id} AND user_id = ${token.dbId}`;
  res.json({ ok: true });
}
