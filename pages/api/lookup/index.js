/**
 * GET /api/lookup?name=X&server=Y&region=Z
 * Returns cached player profile + boss data. 24-hour freshness window.
 *
 * Response shapes:
 *   { status: 'not_found' }                       — never fetched
 *   { status: 'fetching' }                         — fetch in progress
 *   { status: 'error', error: '...' }              — last fetch failed
 *   { status: 'done', profile: {...}, bosses: [...] } — cached data
 */
import sql from '../../../lib/db';

const CACHE_TTL_DAYS = 7; // auto-refresh after 7 days

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { name, server, region } = req.query;
  if (!name || !server || !region) {
    return res.status(400).json({ error: 'name, server, region required' });
  }

  // Table might not exist yet on first ever use
  try {
    const profiles = await sql`
      SELECT id, name, class_id, class_name, role, guild_name,
             fetch_status, error_message, fetched_at, created_at
      FROM player_lookup_profiles
      WHERE name         = ${name.trim()}
        AND server_slug  = ${server.trim().toLowerCase()}
        AND server_region = ${region.trim().toUpperCase()}
      LIMIT 1
    `;

    if (!profiles.length) return res.json({ status: 'not_found' });

    const p = profiles[0];

    if (p.fetch_status === 'fetching') return res.json({ status: 'fetching' });
    if (p.fetch_status === 'error')    return res.json({ status: 'error', error: p.error_message });

    // Check staleness — stale = never fetched OR older than 7 days
    // Return data immediately but include stale:true so client can auto-refresh
    const ageDays = p.fetched_at
      ? (Date.now() - new Date(p.fetched_at).getTime()) / 86400000
      : Infinity;
    const isStale = ageDays > CACHE_TTL_DAYS;

    // Load boss rows ordered by zone then encounter
    const bosses = await sql`
      SELECT
        zone_id, zone_name, encounter_id, boss_name, report_code, best_spec,
        rank_percent, median_percent, best_amount, total_kills, fastest_kill,
        flask, battle_elixir, guardian_elixir, food, weapon_oil, weapon_stone,
        haste_potion, destruction_potion, mana_potion, healthstone,
        consume_score, consume_max,
        enchant_mainhand, enchant_head, enchant_shoulder, enchant_chest,
        enchant_legs, enchant_bracer, enchant_gloves, enchant_score,
        flask_rate, battle_elix_rate, guardian_elix_rate, food_rate, weapon_rate, pot_rate
      FROM player_lookup_bosses
      WHERE player_id = ${p.id}
      ORDER BY zone_id, encounter_id
    `;

    return res.json({
      status: 'done',
      stale: isStale,  // true = older than 7 days, client should auto-refresh
      profile: {
        name:       p.name,
        classId:    p.class_id,
        className:  p.class_name,
        role:       p.role,
        guildName:  p.guild_name,
        server:     server.trim(),
        region:     region.trim().toUpperCase(),
        fetchedAt:  p.fetched_at,
      },
      bosses: bosses.map(b => ({
        zoneId:           b.zone_id,
        zoneName:         b.zone_name,
        encounterId:      b.encounter_id,
        bossName:         b.boss_name,
        reportCode:       b.report_code,
        bestSpec:         b.best_spec,
        rankPercent:      b.rank_percent   !== null ? Number(b.rank_percent)   : null,
        medianPercent:    b.median_percent !== null ? Number(b.median_percent) : null,
        bestAmount:       b.best_amount    !== null ? Number(b.best_amount)    : null,
        totalKills:       Number(b.total_kills),
        fastestKill:      b.fastest_kill   !== null ? Number(b.fastest_kill)   : null,
        flask:            b.flask,
        battleElixir:     b.battle_elixir,
        guardianElixir:   b.guardian_elixir,
        food:             b.food,
        weaponOil:        b.weapon_oil,
        weaponStone:      b.weapon_stone,
        hastePot:         Number(b.haste_potion),
        destroPot:        Number(b.destruction_potion),
        manaPot:          Number(b.mana_potion),
        healthstone:      Number(b.healthstone),
        consumeScore:     b.consume_score !== null ? Number(b.consume_score) : null,
        consumeMax:       b.consume_max   !== null ? Number(b.consume_max)   : null,
        enchantMainhand:  b.enchant_mainhand,
        enchantHead:      b.enchant_head,
        enchantShoulder:  b.enchant_shoulder,
        enchantChest:     b.enchant_chest,
        enchantLegs:      b.enchant_legs,
        enchantBracer:    b.enchant_bracer,
        enchantGloves:    b.enchant_gloves,
        enchantScore:     b.enchant_score !== null ? Number(b.enchant_score) : null,
        flaskRate:        b.flask_rate         !== null ? Number(b.flask_rate)         : null,
        battleElixRate:   b.battle_elix_rate   !== null ? Number(b.battle_elix_rate)   : null,
        guardianElixRate: b.guardian_elix_rate !== null ? Number(b.guardian_elix_rate) : null,
        foodRate:         b.food_rate          !== null ? Number(b.food_rate)          : null,
        weaponRate:       b.weapon_rate        !== null ? Number(b.weapon_rate)        : null,
        potRate:          b.pot_rate           !== null ? Number(b.pot_rate)           : null,
      })),
    });

  } catch (err) {
    // Table doesn't exist yet — treat as not found
    if (err.message?.includes('player_lookup_profiles')) {
      return res.json({ status: 'not_found' });
    }
    console.error('[lookup/index]', err);
    return res.status(500).json({ error: err.message });
  }
}
