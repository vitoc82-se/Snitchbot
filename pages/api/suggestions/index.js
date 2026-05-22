import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD || req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const rows = await sql`SELECT * FROM suggestions ORDER BY created_at DESC`;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
