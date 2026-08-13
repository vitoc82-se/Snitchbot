/**
 * Raid-week bucketing.
 *
 * TBC Classic lockouts reset weekly on a region-specific day: Wednesday for EU
 * realms, Tuesday for US realms. We bucket each kill into the raid week it
 * belongs to by finding the most recent reset instant on or before the kill's
 * timestamp. This keeps "this week" aligned with the actual raid lockout rather
 * than an arbitrary calendar week.
 *
 * Reset hours below are approximate (in UTC) — they only matter for kills that
 * land within a couple hours of the reset, which effectively never happens since
 * raids don't start at reset time.
 */

// { day: UTC weekday (Sun=0 … Sat=6), hour: approximate reset hour in UTC }
const RESET = {
  EU: { day: 3, hour: 5  }, // Wednesday ~07:00 CET
  US: { day: 2, hour: 15 }, // Tuesday   ~08:00 PT
};

function cfgFor(region) {
  return RESET[(region || '').toUpperCase()] || RESET.EU;
}

/**
 * The reset instant (Date, UTC) that opens the raid week containing `tsMs`.
 */
export function weekStart(tsMs, region) {
  const cfg = cfgFor(region);
  const d = new Date(tsMs);
  const deltaDays = (d.getUTCDay() - cfg.day + 7) % 7;
  const candidate = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - deltaDays,
    cfg.hour, 0, 0, 0,
  ));
  // If tsMs falls on the reset day but before the reset hour, it belongs to the
  // previous week.
  if (tsMs < candidate.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() - 7);
  }
  return candidate;
}

/** 'YYYY-MM-DD' key for the raid week containing `tsMs` (used as a DB DATE). */
export function weekStartKey(tsMs, region) {
  return weekStart(tsMs, region).toISOString().slice(0, 10);
}

/**
 * The `n` most recent raid-week start keys ('YYYY-MM-DD'), newest first,
 * ending with the week containing `nowMs`.
 */
export function lastNWeekKeys(region, n, nowMs = Date.now()) {
  const start = weekStart(nowMs, region);
  const keys = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() - 7 * i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short label for a week key or Date, e.g. "Aug 6". */
export function weekLabel(key) {
  const d = key instanceof Date ? key : new Date(`${key}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
