import { getToken } from 'next-auth/jwt';
import crypto from 'crypto';
import { IncomingForm } from 'formidable';
import fs from 'fs';
import path from 'path';
import { classifySession } from '../../../lib/loot-raids';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  // Parse multipart form
  const form = new IncomingForm({ maxFileSize: 50 * 1024 * 1024 });
  let fields, files;
  try {
    [fields, files] = await new Promise((resolve, reject) =>
      form.parse(req, (err, f, fi) => err ? reject(err) : resolve([f, fi]))
    );
  } catch (e) {
    return res.status(400).json({ error: 'File upload failed: ' + e.message });
  }

  const uploadedFile = files.file?.[0] || files.file;
  if (!uploadedFile) return res.status(400).json({ error: 'No file received.' });

  const title  = Array.isArray(fields.title) ? fields.title[0] : (fields.title || '');
  const ext    = path.extname(uploadedFile.originalFilename || '').toLowerCase();
  const buffer = fs.readFileSync(uploadedFile.filepath);

  let entries;
  try {
    if (ext === '.docx') {
      entries = await parseDocx(buffer);
    } else {
      entries = JSON.parse(buffer.toString('utf8'));
    }
    if (!Array.isArray(entries)) throw new Error('Expected a JSON array');
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse file: ' + e.message });
  } finally {
    fs.unlinkSync(uploadedFile.filepath);
  }

  return importEntries(entries, title?.trim(), token.dbId, res);
}

// Extract JSON array from a DOCX (JSON is stored as text across <w:t> runs)
async function parseDocx(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');

  // Concatenate only <w:t> text nodes — don't strip all tags (introduces spaces mid-JSON)
  const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map(m => m[1])
    .join('')
    // Unescape XML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // Find the JSON array
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON array found in document');
  return JSON.parse(text.slice(start, end + 1));
}

async function importEntries(entries, title, userId, res) {
  const sql = (await import('../../../lib/db')).default;

  // Ensure tables exist
  await sql`
    CREATE TABLE IF NOT EXISTS loot_sessions (
      id         TEXT PRIMARY KEY,
      user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT,
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

  // Group by softresID
  const bySession = {};
  for (const e of entries) {
    if (!e.itemID || !e.awardedTo) continue;
    const sid = e.softresID || 'unknown';
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(e);
  }

  // Classify and filter — keep only TBC raids
  const tbcSessions = [];
  for (const [sid, sessionEntries] of Object.entries(bySession)) {
    const raidName = classifySession(sessionEntries);
    if (!raidName) continue;
    const ts = sessionEntries.map(e => e.timestamp).filter(Boolean);
    const raidDate = ts.length ? new Date(Math.min(...ts) * 1000) : new Date();
    tbcSessions.push({ sid, raidName, raidDate, entries: sessionEntries });
  }

  if (tbcSessions.length === 0)
    return res.status(400).json({ error: 'No TBC raid entries found in this file.' });

  const sessionId    = crypto.randomBytes(5).toString('hex');
  const sessionTitle = title || autoTitle(tbcSessions);

  await sql`INSERT INTO loot_sessions (id, user_id, title) VALUES (${sessionId}, ${userId}, ${sessionTitle})`;

  // Collect all rows across all sessions for a single bulk insert via unnest
  const allRows = [];
  for (const { sid, raidName, raidDate, entries: sEntries } of tbcSessions) {
    for (const e of sEntries) {
      allRows.push({
        session_id:        sessionId,
        soft_res_id:       sid,
        raid_name:         raidName,
        raid_date:         raidDate,
        item_id:           e.itemID,
        item_name:         stripBrackets(e.itemLink || ''),
        awarded_to:        stripRealm(e.awardedTo || ''),
        awarded_by:        stripRealm(e.awardedBy || ''),
        winner_class:      e.winnerClass  || null,
        winning_roll_type: e.winningRollType || null,
        is_os:             !!e.OS,
        is_sr:             !!e.SR,
        received:          e.received !== false,
        checksum:          e.checksum || null,
      });
    }
  }

  let inserted = 0;
  // Batch in chunks of 500 using unnest — works with neon tagged templates
  for (let i = 0; i < allRows.length; i += 500) {
    const chunk = allRows.slice(i, i + 500);
    const p_session_id        = chunk.map(r => r.session_id);
    const p_soft_res_id       = chunk.map(r => r.soft_res_id);
    const p_raid_name         = chunk.map(r => r.raid_name);
    const p_raid_date         = chunk.map(r => r.raid_date);
    const p_item_id           = chunk.map(r => r.item_id);
    const p_item_name         = chunk.map(r => r.item_name);
    const p_awarded_to        = chunk.map(r => r.awarded_to);
    const p_awarded_by        = chunk.map(r => r.awarded_by);
    const p_winner_class      = chunk.map(r => r.winner_class);
    const p_winning_roll_type = chunk.map(r => r.winning_roll_type);
    const p_is_os             = chunk.map(r => r.is_os);
    const p_is_sr             = chunk.map(r => r.is_sr);
    const p_received          = chunk.map(r => r.received);
    const p_checksum          = chunk.map(r => r.checksum);

    try {
      await sql`
        INSERT INTO loot_entries
          (session_id, soft_res_id, raid_name, raid_date, item_id, item_name,
           awarded_to, awarded_by, winner_class, winning_roll_type,
           is_os, is_sr, received, checksum)
        SELECT * FROM unnest(
          ${p_session_id}::text[],
          ${p_soft_res_id}::text[],
          ${p_raid_name}::text[],
          ${p_raid_date}::timestamptz[],
          ${p_item_id}::int[],
          ${p_item_name}::text[],
          ${p_awarded_to}::text[],
          ${p_awarded_by}::text[],
          ${p_winner_class}::int[],
          ${p_winning_roll_type}::text[],
          ${p_is_os}::bool[],
          ${p_is_sr}::bool[],
          ${p_received}::bool[],
          ${p_checksum}::text[]
        )
        ON CONFLICT (session_id, checksum) DO NOTHING
      `;
      inserted += chunk.length;
    } catch (e) {
      console.error('Batch insert error:', e.message);
    }
  }

  res.json({ sessionId, title: sessionTitle, inserted, raids: [...new Set(tbcSessions.map(s => s.raidName))] });
}

function stripBrackets(s) { return s.replace(/^\[/, '').replace(/\]$/, ''); }
function stripRealm(s)    { return s.replace(/-[^-]+$/, ''); }

function autoTitle(sessions) {
  const raids = [...new Set(sessions.map(s => s.raidName))];
  const dates = sessions.map(s => s.raidDate).sort((a, b) => a - b);
  const fmt   = d => d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  const first = dates[0], last = dates[dates.length - 1];
  const dateStr = first.toDateString() === last.toDateString() ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
  return raids.join(' + ') + ' — ' + dateStr;
}
