/**
 * /api/bot/channels
 *
 * Internal endpoint used by the Discord bot to manage per-guild channel settings.
 *
 * GET  ?guildId=X              → { channelIds: ['123', '456'] }
 * POST { guildId, channelId }  → adds channel, { ok: true }
 * DELETE { guildId, channelId }→ removes channel, { ok: true }
 */

import sql from '../../../lib/db';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS bot_guild_channels (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      guild_id   TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      added_at   TIMESTAMPTZ DEFAULT now(),
      UNIQUE(guild_id, channel_id)
    )
  `;
}

export default async function handler(req, res) {
  try {
    await ensureTable();

    // ── GET — fetch allowed channels for a guild ──────────────────────────────
    if (req.method === 'GET') {
      const { guildId } = req.query;
      if (!guildId) return res.status(400).json({ error: 'guildId required' });

      const rows = await sql`
        SELECT channel_id FROM bot_guild_channels
        WHERE guild_id = ${guildId}
        ORDER BY added_at
      `;
      return res.json({ channelIds: rows.map(r => r.channel_id) });
    }

    // ── POST — add a channel ──────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { guildId, channelId } = req.body;
      if (!guildId || !channelId) return res.status(400).json({ error: 'guildId and channelId required' });

      await sql`
        INSERT INTO bot_guild_channels (guild_id, channel_id)
        VALUES (${guildId}, ${channelId})
        ON CONFLICT (guild_id, channel_id) DO NOTHING
      `;
      return res.json({ ok: true });
    }

    // ── DELETE — remove a channel ─────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { guildId, channelId } = req.body;
      if (!guildId || !channelId) return res.status(400).json({ error: 'guildId and channelId required' });

      await sql`
        DELETE FROM bot_guild_channels
        WHERE guild_id = ${guildId} AND channel_id = ${channelId}
      `;
      return res.json({ ok: true });
    }

    return res.status(405).end();

  } catch (err) {
    console.error('[bot/channels]', err);
    return res.status(500).json({ error: err.message });
  }
}
