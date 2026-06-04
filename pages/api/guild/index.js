/**
 * GET /api/guild?name=X&server=Y&region=Z
 * Returns cached guild roster + each member's current fetch status.
 * Auth required.
 */
import sql from '../../../lib/db';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Login required' });

  const { name, server, region } = req.query;
  if (!name || !server || !region) return res.status(400).json({ error: 'name, server, region required' });

  const cleanSlug   = server.trim().toLowerCase();
  const cleanRegion = region.trim().toUpperCase();

  try {
    const guilds = await sql`
      SELECT * FROM guild_lookup_cache
      WHERE guild_name    = ${name.trim()}
        AND server_slug   = ${cleanSlug}
        AND server_region = ${cleanRegion}
      LIMIT 1
    `;

    if (!guilds.length) return res.json({ status: 'not_found' });

    const guild   = guilds[0];
    const members = guild.member_names; // JSONB → already parsed by Neon client

    // Fetch current status for each member
    const memberNames = members.map(m => m.name);
    const profiles = await sql`
      SELECT name, class_name, role, fetch_status, fetched_at
      FROM player_lookup_profiles
      WHERE name = ANY(${memberNames})
        AND server_slug   = ${cleanSlug}
        AND server_region = ${cleanRegion}
    `;

    const profileMap = {};
    for (const p of profiles) profileMap[p.name] = p;

    return res.json({
      status:    'found',
      guildName: guild.guild_name,
      server:    guild.server_slug,
      region:    guild.server_region,
      fetchedAt: guild.fetched_at,
      members:   members.map(m => ({
        ...m,
        fetchStatus: profileMap[m.name]?.fetch_status ?? 'pending',
        role:        profileMap[m.name]?.role          ?? null,
      })),
    });

  } catch (err) {
    // Table doesn't exist yet
    if (err.message?.includes('guild_lookup_cache')) return res.json({ status: 'not_found' });
    console.error('[guild/index]', err);
    return res.status(500).json({ error: err.message });
  }
}
