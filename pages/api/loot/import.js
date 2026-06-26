import { getToken } from 'next-auth/jwt';
import crypto from 'crypto';
import sql from '../../../lib/db';
import { classifySession, getRaidName } from '../../../lib/loot-raids';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { json, title } = req.body;
  if (!json) return res.status(400).json({ error: 'Missing json' });

  let entries;
  try {
    entries = typeof json === 'string' ? JSON.parse(json) : json;
    if (!Array.isArray(entries)) throw new Error('Expected an array');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON: ' + e.message });
  }

  // Group by softresID
  const bySession = {};
  for (const e of entries) {
    if (!e.itemID || !e.awardedTo) continue;
    const sid = e.softresID || 'unknown';
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(e);
  }

  // Classify each session and filter out Classic raids
  const tbcSessions = [];
  for (const [sid, sessionEntries] of Object.entries(bySession)) {
    const raidName = classifySession(sessionEntries);
    if (!raidName) continue; // Classic or unknown — skip
    // Derive raid date from earliest timestamp in session
    const ts = sessionEntries.map(e => e.timestamp).filter(Boolean);
    const raidDate = ts.length ? new Date(Math.min(...ts) * 1000) : new Date();
    tbcSessions.push({ sid, raidName, raidDate, entries: sessionEntries });
  }

  if (tbcSessions.length === 0) {
    return res.status(400).json({ error: 'No TBC raid entries found in this log.' });
  }

  // Create the session
  await sql`
    CREATE TABLE IF NOT EXISTS loot_sessions (
      id        TEXT PRIMARY KEY,
      user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
      title     TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS loot_entries (
      id                SERIAL PRIMARY KEY,
      session_id        TEXT REFERENCES loot_sessions(id) ON DELETE CASCADE,
      soft_res_id       TEXT NOT NULL,
      raid_name         TEXT NOT NULL,
      raid_date         TIMESTAMPTZ NOT NULL,
      item_id           INTEGER NOT NULL,
      item_name         TEXT NOT NULL,
      awarded_to        TEXT NOT NULL,
      awarded_by        TEXT,
      winner_class      INTEGER,
      winning_roll_type TEXT,
      is_os             BOOLEAN DEFAULT FALSE,
      is_sr             BOOLEAN DEFAULT FALSE,
      received          BOOLEAN DEFAULT TRUE,
      checksum          TEXT,
      UNIQUE (session_id, checksum)
    )
  `;

  const sessionId = crypto.randomBytes(5).toString('hex');
  const sessionTitle = title?.trim() || autoTitle(tbcSessions);

  await sql`
    INSERT INTO loot_sessions (id, user_id, title)
    VALUES (${sessionId}, ${token.dbId}, ${sessionTitle})
  `;

  // Batch insert entries — 100 at a time
  let inserted = 0;
  for (const { sid, raidName, raidDate, entries: sEntries } of tbcSessions) {
    const rows = sEntries.map(e => ({
      session_id:        sessionId,
      soft_res_id:       sid,
      raid_name:         raidName,
      raid_date:         raidDate,
      item_id:           e.itemID,
      item_name:         stripBrackets(e.itemLink || ''),
      awarded_to:        stripRealm(e.awardedTo || ''),
      awarded_by:        stripRealm(e.awardedBy || ''),
      winner_class:      e.winnerClass || null,
      winning_roll_type: e.winningRollType || null,
      is_os:             !!e.OS,
      is_sr:             !!e.SR,
      received:          e.received !== false,
      checksum:          e.checksum || null,
    }));

    // Insert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      try {
        await sql`
          INSERT INTO loot_entries ${sql(chunk)}
          ON CONFLICT (session_id, checksum) DO NOTHING
        `;
        inserted += chunk.length;
      } catch (e) {
        // If checksum is null we can get constraint issues — fall back to individual inserts
        for (const row of chunk) {
          try {
            await sql`INSERT INTO loot_entries ${sql([row])} ON CONFLICT DO NOTHING`;
            inserted++;
          } catch {}
        }
      }
    }
  }

  res.json({ sessionId, title: sessionTitle, inserted, raids: tbcSessions.map(s => s.raidName) });
}

function stripBrackets(s) {
  return s.replace(/^\[/, '').replace(/\]$/, '');
}

function stripRealm(s) {
  return s.replace(/-[^-]+$/, '');
}

function autoTitle(sessions) {
  const raids = [...new Set(sessions.map(s => s.raidName))];
  const dates = sessions.map(s => s.raidDate).sort((a, b) => a - b);
  const first = dates[0];
  const last  = dates[dates.length - 1];
  const fmt = d => d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  const dateStr = first.toDateString() === last.toDateString()
    ? fmt(first)
    : `${fmt(first)} – ${fmt(last)}`;
  return raids.join(' + ') + ' — ' + dateStr;
}
