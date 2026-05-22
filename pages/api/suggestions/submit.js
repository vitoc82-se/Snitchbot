import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { spell_item_id, wowhead_link, category, class_spec, log_example, motivation } = req.body || {};
  if (!spell_item_id?.trim() || !motivation?.trim()) {
    return res.status(400).json({ error: 'spell_item_id and motivation are required' });
  }

  // Capture submitter from next-auth JWT if available (preview site only).
  let submitted_by = null;
  try {
    const { getToken } = await import('next-auth/jwt');
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token?.name) submitted_by = token.name;
  } catch {}

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS suggestions (
        id            SERIAL PRIMARY KEY,
        spell_item_id TEXT NOT NULL,
        wowhead_link  TEXT,
        category      TEXT,
        class_spec    TEXT,
        log_example   TEXT,
        motivation    TEXT NOT NULL,
        submitted_by  TEXT,
        status        TEXT DEFAULT 'pending',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      INSERT INTO suggestions
        (spell_item_id, wowhead_link, category, class_spec, log_example, motivation, submitted_by)
      VALUES
        (${spell_item_id.trim()}, ${wowhead_link || null}, ${category || null},
         ${class_spec || null}, ${log_example || null}, ${motivation.trim()}, ${submitted_by})
    `;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
