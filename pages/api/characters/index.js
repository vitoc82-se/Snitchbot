/**
 * /api/characters
 *
 *   GET  — list the logged-in user's pinned characters, each joined to its
 *          cached lookup profile (class/role/guild/status) and its per-week
 *          history (player_lookup_weeks), newest week first.
 *   POST — pin a new character { name, server, region } and immediately run the
 *          weekly fetch (awaited, same long-request pattern as /lookup).
 *
 * Auth: JWT via getToken; every row is scoped to token.dbId.
 */
import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';
import { runWeeklyFetch, ensureTables } from '../lookup/weekly-fetch';

function weekKey(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });
  const userId = token.dbId;

  try {
    await ensureTables();

    if (req.method === 'GET') {
      const chars = await sql`
        SELECT uc.id, uc.name, uc.server_slug, uc.server_region, uc.sort_order,
               p.id AS profile_id, p.class_name, p.role, p.guild_name,
               p.fetch_status, p.error_message, p.fetched_at
        FROM user_characters uc
        LEFT JOIN player_lookup_profiles p
          ON p.name = uc.name
         AND p.server_slug = uc.server_slug
         AND p.server_region = uc.server_region
        WHERE uc.user_id = ${userId}
        ORDER BY uc.sort_order, uc.created_at
      `;

      // All weeks for this user's characters in one query, grouped by profile.
      const weeks = await sql`
        SELECT w.player_id, w.week_start, w.kills,
               w.prep_score, w.prep_max,
               w.flask_rate, w.food_rate, w.pot_rate, w.weapon_rate,
               w.avg_parse, w.best_parse
        FROM player_lookup_weeks w
        JOIN player_lookup_profiles p ON p.id = w.player_id
        JOIN user_characters uc
          ON uc.name = p.name AND uc.server_slug = p.server_slug AND uc.server_region = p.server_region
        WHERE uc.user_id = ${userId}
        ORDER BY w.week_start DESC
      `;

      const weeksByProfile = {};
      for (const w of weeks) {
        (weeksByProfile[w.player_id] ||= []).push({
          weekStart:  weekKey(w.week_start),
          kills:      Number(w.kills),
          prepScore:  w.prep_score  !== null ? Number(w.prep_score)  : null,
          prepMax:    w.prep_max    !== null ? Number(w.prep_max)    : null,
          flaskRate:  w.flask_rate  !== null ? Number(w.flask_rate)  : null,
          foodRate:   w.food_rate   !== null ? Number(w.food_rate)   : null,
          potRate:    w.pot_rate    !== null ? Number(w.pot_rate)    : null,
          weaponRate: w.weapon_rate !== null ? Number(w.weapon_rate) : null,
          avgParse:   w.avg_parse   !== null ? Number(w.avg_parse)   : null,
          bestParse:  w.best_parse  !== null ? Number(w.best_parse)  : null,
        });
      }

      const rows = chars.map(c => ({
        id:          c.id,
        name:        c.name,
        server:      c.server_slug,
        region:      c.server_region,
        className:   c.class_name,
        role:        c.role,
        guildName:   c.guild_name,
        fetchStatus: c.fetch_status,
        errorMessage: c.error_message,
        fetchedAt:   c.fetched_at,
        weeks:       c.profile_id ? (weeksByProfile[c.profile_id] || []) : [],
      }));

      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { name, server, region } = req.body || {};
      if (!name?.trim() || !server?.trim() || !region?.trim()) {
        return res.status(400).json({ error: 'name, server and region are required' });
      }
      const cleanName   = name.trim();
      const cleanSlug   = server.trim().toLowerCase();
      const cleanRegion = region.trim().toUpperCase();

      const [{ next }] = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
        FROM user_characters WHERE user_id = ${userId}
      `;

      const [row] = await sql`
        INSERT INTO user_characters (user_id, name, server_slug, server_region, sort_order)
        VALUES (${userId}, ${cleanName}, ${cleanSlug}, ${cleanRegion}, ${next})
        ON CONFLICT (user_id, name, server_slug, server_region) DO UPDATE
          SET name = EXCLUDED.name
        RETURNING id
      `;

      // Populate weekly data now (long request, mirrors /lookup). If WCL fails,
      // the pin is still saved and its profile carries the error status.
      let fetchError = null;
      try {
        await runWeeklyFetch({ name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });
      } catch (e) {
        fetchError = e.message;
      }

      return res.json({ ok: true, id: row.id, fetchError });
    }

    return res.status(405).end();
  } catch (err) {
    console.error('[api/characters]', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { responseLimit: false, bodyParser: true } };
