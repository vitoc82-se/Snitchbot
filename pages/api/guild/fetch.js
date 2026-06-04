/**
 * POST /api/guild/fetch
 * Fetches a guild's roster from WCL Fresh and stores it in guild_lookup_cache.
 * Also upserts each member into player_lookup_profiles as 'pending'.
 * Auth required.
 */
import sql from '../../../lib/db';
import { wclFreshQuery } from '../../../lib/wcl';
import { getToken } from 'next-auth/jwt';

const CLASS_NAMES = {
  1: 'Death Knight', 2: 'Druid',  3: 'Hunter', 4: 'Mage',    5: 'Monk',
  6: 'Paladin',      7: 'Priest', 8: 'Rogue',  9: 'Shaman',  10: 'Warlock',
  11: 'Warrior',     12: 'Demon Hunter', 13: 'Evoker',
};

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS guild_lookup_cache (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_name    TEXT NOT NULL,
      server_slug   TEXT NOT NULL,
      server_region TEXT NOT NULL,
      member_names  JSONB NOT NULL DEFAULT '[]',
      fetched_at    TIMESTAMPTZ DEFAULT now(),
      created_at    TIMESTAMPTZ DEFAULT now(),
      UNIQUE(guild_name, server_slug, server_region)
    )
  `;
  // Add user_id column for dashboard association (safe to run repeatedly)
  await sql`ALTER TABLE guild_lookup_cache ADD COLUMN IF NOT EXISTS user_id UUID`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Login required' });

  const { guildName, serverSlug, serverRegion } = req.body;
  if (!guildName?.trim() || !serverSlug?.trim() || !serverRegion?.trim()) {
    return res.status(400).json({ error: 'guildName, serverSlug, serverRegion required' });
  }

  const cleanName   = guildName.trim();
  const cleanSlug   = serverSlug.trim().toLowerCase();
  const cleanRegion = serverRegion.trim().toUpperCase();

  try {
    await ensureTable();

    const result = await wclFreshQuery(`
      query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        guildData {
          guild(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id
            name
            members {
              data {
                name
                classID
                guildRank
              }
            }
          }
        }
      }
    `, { name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion });

    const guild = result?.guildData?.guild;
    if (!guild) throw new Error(`Guild "${cleanName}" not found on Warcraft Logs`);

    const members = (guild.members?.data || [])
      .filter(m => m?.name)
      .map(m => ({
        name:      m.name,
        classId:   m.classID ?? null,
        className: CLASS_NAMES[m.classID] || 'Unknown',
        guildRank: m.guildRank ?? null,
      }));

    if (!members.length) throw new Error(`Guild "${cleanName}" has no members on Warcraft Logs`);

    // Cache the roster (associate with this user)
    await sql`
      INSERT INTO guild_lookup_cache (guild_name, server_slug, server_region, member_names, fetched_at, user_id)
      VALUES (${cleanName}, ${cleanSlug}, ${cleanRegion}, ${JSON.stringify(members)}, now(), ${token.dbId})
      ON CONFLICT (guild_name, server_slug, server_region) DO UPDATE
        SET member_names = EXCLUDED.member_names, fetched_at = now(), user_id = EXCLUDED.user_id
    `;

    // Upsert each member — reset errored/stale members to pending so they get re-fetched
    for (const m of members) {
      await sql`
        INSERT INTO player_lookup_profiles (name, server_slug, server_region, class_name, fetch_status)
        VALUES (${m.name}, ${cleanSlug}, ${cleanRegion}, ${m.className}, 'pending')
        ON CONFLICT (name, server_slug, server_region) DO UPDATE
          SET fetch_status = CASE
            WHEN player_lookup_profiles.fetch_status = 'error' THEN 'pending'
            WHEN player_lookup_profiles.fetch_status = 'done'
              AND player_lookup_profiles.fetched_at < now() - INTERVAL '7 days' THEN 'pending'
            ELSE player_lookup_profiles.fetch_status
          END
      `;
    }

    return res.json({
      ok:        true,
      guildName: guild.name,
      server:    cleanSlug,
      region:    cleanRegion,
      members,
    });

  } catch (err) {
    console.error('[guild/fetch]', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { bodyParser: true } };
