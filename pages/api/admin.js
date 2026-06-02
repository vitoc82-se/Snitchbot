import { getStats } from '../../lib/redis';
import sql from '../../lib/db';

const DEFAULT_MANDATORY = { flask: true, guardian: true, food: true, pots: true, weapon: false };

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD || req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const [
      redisStats,
      userCount,
      userRows,
      reportAgg,
      allReports,
      settingsRows,
      lookupAgg,
      recentLookups,
    ] = await Promise.all([
      getStats(),

      // User registration stats
      sql`
        SELECT
          COUNT(*)                                                             AS total,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS new_7d,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS new_30d
        FROM users
      `,

      // Per-user: report count, last active, settings
      sql`
        SELECT
          u.id,
          u.discord_name,
          u.discord_avatar,
          u.created_at                          AS joined_at,
          COUNT(r.id)                           AS report_count,
          MAX(r.created_at)                     AS last_report_at,
          us.mandatory                          AS settings
        FROM users u
        LEFT JOIN reports r  ON r.user_id  = u.id
        LEFT JOIN user_settings us ON us.user_id = u.id
        GROUP BY u.id, u.discord_name, u.discord_avatar, u.created_at, us.mandatory
        ORDER BY report_count DESC, u.created_at DESC
      `,

      // Report-level aggregates (JSONB)
      sql`
        SELECT
          COUNT(*)                                                    AS total_saved,
          COALESCE(SUM(jsonb_array_length(data->'bosses')), 0)       AS total_bosses,
          COALESCE(AVG(jsonb_array_length(data->'bosses')), 0)       AS avg_bosses
        FROM reports
      `,

      // All reports JSONB — for boss frequency + kill rate + player count
      sql`SELECT data FROM reports`,

      // Settings rows
      sql`SELECT mandatory FROM user_settings`,

      // Player lookup stats
      sql`
        SELECT
          COUNT(*) FILTER (WHERE fetch_status = 'done')                           AS total_lookups,
          COUNT(*) FILTER (WHERE fetch_status = 'done'
                           AND fetched_at > now() - interval '7 days')            AS lookups_7d,
          COUNT(*) FILTER (WHERE fetch_status = 'error')                          AS errors
        FROM player_lookup_profiles
      `.catch(() => [{ total_lookups: 0, lookups_7d: 0, errors: 0 }]),

      // Most recent lookups
      sql`
        SELECT name, server_slug, server_region, class_name, role, guild_name,
               fetch_status, fetched_at
        FROM player_lookup_profiles
        WHERE fetch_status = 'done'
        ORDER BY fetched_at DESC
        LIMIT 20
      `.catch(() => []),
    ]);

    // ── Boss frequency + kill rate + player count from JSONB ────────────────
    const bossFreq  = {}; // name -> { seen, kills }
    let totalPlayers = 0;
    let totalAttempts = 0;

    for (const row of allReports) {
      for (const boss of (row.data?.bosses || [])) {
        if (!bossFreq[boss.name]) bossFreq[boss.name] = { seen: 0, kills: 0 };
        const hasKill = boss.attempts?.some(a => a.isKill);
        bossFreq[boss.name].seen++;
        if (hasKill) bossFreq[boss.name].kills++;

        for (const attempt of (boss.attempts || [])) {
          totalAttempts++;
          totalPlayers += (attempt.players || []).length;
        }
      }
    }

    const bossList = Object.entries(bossFreq)
      .map(([name, { seen, kills }]) => ({ name, seen, kills, killRate: seen ? Math.round((kills / seen) * 100) : 0 }))
      .sort((a, b) => b.seen - a.seen);

    const avgPlayersPerAttempt = totalAttempts > 0
      ? Math.round(totalPlayers / totalAttempts)
      : 0;

    // ── Settings distribution ────────────────────────────────────────────────
    const KEYS = ['flask', 'guardian', 'food', 'pots', 'weapon'];
    const totalUsers = Number(userCount[0].total);
    const usersWithCustomSettings = settingsRows.length;
    const usersOnDefaults = totalUsers - usersWithCustomSettings;

    const settingsDist = {};
    KEYS.forEach(k => { settingsDist[k] = 0; });

    // Users with saved settings
    for (const row of settingsRows) {
      KEYS.forEach(k => {
        const val = row.mandatory?.[k];
        // If key missing from saved settings, fall back to default
        if (val === undefined ? DEFAULT_MANDATORY[k] : val) settingsDist[k]++;
      });
    }
    // Users still on defaults
    KEYS.forEach(k => {
      if (DEFAULT_MANDATORY[k]) settingsDist[k] += usersOnDefaults;
    });

    return res.json({
      // Redis stats (pass-through)
      ...redisStats,

      db: {
        // Users
        totalUsers,
        newUsers7d:  Number(userCount[0].new_7d),
        newUsers30d: Number(userCount[0].new_30d),
        usersWithCustomSettings,

        // Reports
        totalSavedReports:   Number(reportAgg[0].total_saved),
        totalBossesTracked:  Number(reportAgg[0].total_bosses),
        avgBossesPerReport:  Number(Number(reportAgg[0].avg_bosses).toFixed(1)),
        avgPlayersPerAttempt,

        // Settings
        settingsDist,
        totalUsers, // repeated for easy % in frontend

        // Boss leaderboard
        bossList,

        // Player lookup
        lookupTotal:  Number(lookupAgg[0]?.total_lookups ?? 0),
        lookupLast7d: Number(lookupAgg[0]?.lookups_7d    ?? 0),
        lookupErrors: Number(lookupAgg[0]?.errors        ?? 0),
        recentLookups: recentLookups.map(r => ({
          name:      r.name,
          server:    r.server_slug,
          region:    r.server_region,
          className: r.class_name,
          role:      r.role,
          guild:     r.guild_name,
          fetchedAt: r.fetched_at,
        })),

        // Per-user roster
        users: userRows.map(u => ({
          name:          u.discord_name,
          avatar:        u.discord_avatar,
          joinedAt:      u.joined_at,
          reportCount:   Number(u.report_count),
          lastReportAt:  u.last_report_at,
          settings:      u.settings,
        })),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
  }
}
