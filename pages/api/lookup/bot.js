/**
 * GET /api/lookup/bot?name=X&server=Y&region=Z
 *
 * Bot-friendly single-call endpoint used by the Discord bot.
 * - Checks the DB cache (7-day TTL)
 * - If stale or missing: triggers /api/lookup/fetch internally and waits
 * - Returns a compact summary JSON ready for Discord embed formatting
 *
 * Response shapes:
 *   { found: false, error: '...' }
 *   { found: true, name, className, role, guildName, server,
 *     tier, tierColor, rating: { combined, wcl, consumes, enchants }, profileUrl }
 */

import sql from '../../../lib/db';

const CACHE_TTL_DAYS = 7;

// Mirrors calcCombinedRating() from pages/lookup/index.js (kept in sync manually)
// Weights: WCL 50% · Enchants 30% · Consumes 20%
function calcCombinedRating(bosses) {
  const withRank    = bosses.filter(b => Number(b.total_kills) > 0 && b.rank_percent    != null);
  const withCons    = bosses.filter(b => b.consume_score != null && Number(b.consume_max) > 0);
  const withEnchant = bosses.filter(b => b.enchant_score != null);
  if (!withRank.length && !withCons.length && !withEnchant.length) return null;

  const avgRank    = withRank.length
    ? withRank.reduce((s, b) => s + Number(b.rank_percent), 0) / withRank.length : null;
  const consPct    = withCons.length
    ? withCons.reduce((s, b) => s + (Number(b.consume_score) / Number(b.consume_max)) * 100, 0) / withCons.length : null;
  const enchantPct = withEnchant.length
    ? withEnchant.reduce((s, b) => s + Number(b.enchant_score), 0) / withEnchant.length : null;

  let combined = 0, totalWeight = 0;
  if (avgRank    != null) { combined += avgRank    * 0.50; totalWeight += 0.50; }
  if (enchantPct != null) { combined += enchantPct * 0.30; totalWeight += 0.30; }
  if (consPct    != null) { combined += consPct    * 0.20; totalWeight += 0.20; }
  if (totalWeight > 0) combined = combined / totalWeight;

  return {
    combined: Math.round(combined),
    wcl:      avgRank    != null ? Math.round(avgRank)    : null,
    consumes: consPct    != null ? Math.round(consPct)    : null,
    enchants: enchantPct != null ? Math.round(enchantPct) : null,
  };
}

// WoW item quality tiers — colors as Discord integer values (0xRRGGBB)
function getTier(score) {
  if (score >= 95) return { name: 'Legendary', color: 0xe6cc80 };
  if (score >= 75) return { name: 'Epic',      color: 0xa335ee };
  if (score >= 50) return { name: 'Rare',      color: 0x0070dd };
  if (score >= 25) return { name: 'Uncommon',  color: 0x1eff00 };
  return                  { name: 'Common',    color: 0x9d9d9d };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { name, server, region } = req.query;
  if (!name?.trim() || !server?.trim() || !region?.trim()) {
    return res.status(400).json({ error: 'name, server, region are required' });
  }

  const cleanName   = name.trim();
  const cleanSlug   = server.trim().toLowerCase();
  const cleanRegion = region.trim().toUpperCase();

  try {
    // ── 1. Check cache ────────────────────────────────────────────────────────
    let profiles;
    try {
      profiles = await sql`
        SELECT id, name, class_name, role, guild_name,
               fetch_status, error_message, fetched_at
        FROM player_lookup_profiles
        WHERE name          = ${cleanName}
          AND server_slug   = ${cleanSlug}
          AND server_region = ${cleanRegion}
        LIMIT 1
      `;
    } catch (e) {
      // Table doesn't exist yet — treat as not found
      profiles = [];
    }

    const p = profiles[0] ?? null;
    const ageDays = p?.fetched_at
      ? (Date.now() - new Date(p.fetched_at).getTime()) / 86400000
      : Infinity;
    const needsFetch = !p || p.fetch_status === 'error' || ageDays > CACHE_TTL_DAYS;

    // ── 2. Trigger fetch if needed ────────────────────────────────────────────
    if (needsFetch) {
      const baseUrl = (process.env.NEXTAUTH_URL || 'https://snitchbot.app').replace(/\/$/, '');
      const fetchRes = await fetch(`${baseUrl}/api/lookup/fetch`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: cleanName, serverSlug: cleanSlug, serverRegion: cleanRegion }),
      });

      if (!fetchRes.ok) {
        const err = await fetchRes.json().catch(() => ({}));
        return res.json({ found: false, error: err.error || 'Fetch failed — try again later.' });
      }
    }

    // ── 3. Read fresh profile + boss data ─────────────────────────────────────
    const [profile] = await sql`
      SELECT id, name, class_name, role, guild_name, fetch_status, error_message
      FROM player_lookup_profiles
      WHERE name          = ${cleanName}
        AND server_slug   = ${cleanSlug}
        AND server_region = ${cleanRegion}
      LIMIT 1
    `;

    if (!profile) {
      return res.json({ found: false, error: `Player "${cleanName}" not found on Warcraft Logs.` });
    }
    if (profile.fetch_status === 'error') {
      return res.json({ found: false, error: profile.error_message || 'Lookup failed.' });
    }

    const bosses = await sql`
      SELECT rank_percent, consume_score, consume_max, enchant_score, total_kills
      FROM player_lookup_bosses
      WHERE player_id = ${profile.id}
    `;

    // ── 4. Compute rating + tier ──────────────────────────────────────────────
    const rating = calcCombinedRating(bosses);
    const tier   = rating ? getTier(rating.combined) : null;

    // Avg consume score as X.X/Y.Y (matches website display)
    const withCons = bosses.filter(b => b.consume_score != null && Number(b.consume_max) > 0);
    const avgConsumeScore = withCons.length
      ? withCons.reduce((s, b) => s + Number(b.consume_score), 0) / withCons.length : null;
    const avgConsumeMax = withCons.length
      ? withCons.reduce((s, b) => s + Number(b.consume_max),  0) / withCons.length : null;

    // Avg enchant score (0–100 weighted)
    const withEnch = bosses.filter(b => b.enchant_score != null);
    const avgEnchantScore = withEnch.length
      ? Math.round(withEnch.reduce((s, b) => s + Number(b.enchant_score), 0) / withEnch.length) : null;

    const serverDisplay = `${cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1)} ${cleanRegion}`;
    const baseUrl       = (process.env.NEXTAUTH_URL || 'https://snitchbot.app').replace(/\/$/, '');
    const profileUrl    = `${baseUrl}/lookup?name=${encodeURIComponent(cleanName)}&server=${encodeURIComponent(cleanSlug)}&region=${encodeURIComponent(cleanRegion)}`;

    return res.json({
      found:           true,
      name:            profile.name,
      className:       profile.class_name,
      role:            profile.role,
      guildName:       profile.guild_name,
      server:          serverDisplay,
      tier:            tier?.name  ?? null,
      tierColor:       tier?.color ?? 0x9d9d9d,
      rating,
      avgConsumeScore: avgConsumeScore != null ? Math.round(avgConsumeScore * 10) / 10 : null,
      avgConsumeMax:   avgConsumeMax   != null ? Math.round(avgConsumeMax   * 10) / 10 : null,
      avgEnchantScore,
      profileUrl,
    });

  } catch (err) {
    console.error('[lookup/bot]', err);
    return res.status(500).json({ error: err.message });
  }
}
