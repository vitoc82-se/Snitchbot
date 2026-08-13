/**
 * /api/characters/[id]
 *
 *   DELETE — unpin the character (removes only the user_characters row; the
 *            shared lookup profile + week cache are left intact).
 *   POST   — refresh: re-run the weekly fetch for this character.
 *
 * Auth: JWT via getToken; the row must belong to token.dbId.
 */
import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';
import { runWeeklyFetch } from '../lookup/weekly-fetch';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });
  const userId = token.dbId;
  const { id } = req.query;

  try {
    if (req.method === 'DELETE') {
      const rows = await sql`
        DELETE FROM user_characters
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
      `;
      if (!rows.length) return res.status(404).json({ error: 'Character not found' });
      return res.json({ ok: true });
    }

    if (req.method === 'POST') {
      const [char] = await sql`
        SELECT name, server_slug, server_region
        FROM user_characters
        WHERE id = ${id} AND user_id = ${userId}
        LIMIT 1
      `;
      if (!char) return res.status(404).json({ error: 'Character not found' });

      let fetchError = null;
      try {
        await runWeeklyFetch({
          name: char.name, serverSlug: char.server_slug, serverRegion: char.server_region,
        });
      } catch (e) {
        fetchError = e.message;
      }
      return res.json({ ok: true, fetchError });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[api/characters/[id]]', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { responseLimit: false, bodyParser: true } };
