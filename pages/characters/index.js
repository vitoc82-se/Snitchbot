import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { classColor } from '../../lib/scoring';

// Realms offered in the add form (mirrors the lookup page).
const KNOWN_SERVERS = [
  { label: 'Thunderstrike — EU', slug: 'thunderstrike', region: 'EU' },
  { label: 'Spineshatter — EU',  slug: 'spineshatter',  region: 'EU' },
  { label: 'Nightslayer — US',   slug: 'nightslayer',   region: 'US' },
  { label: 'Dreamscythe — US',   slug: 'dreamscythe',   region: 'US' },
  { label: 'Other (enter below)', slug: '__custom',     region: 'EU' },
];
const REGIONS = ['EU', 'US', 'KR', 'TW'];

// ── Colour helpers (shared visual language with /lookup) ─────────────────────
function parseColor(pct) {
  if (pct == null || pct === 0) return '#555';
  if (pct >= 99) return '#e6cc80';
  if (pct >= 95) return '#ff8000';
  if (pct >= 75) return '#a335ee';
  if (pct >= 50) return '#0070dd';
  if (pct >= 25) return '#1eff00';
  return '#888';
}
function prepColor(pct) {
  if (pct == null) return '#555';
  if (pct >= 100) return '#4caf50';
  if (pct >= 60)  return '#f5c842';
  return '#e05555';
}
function roleLabel(role) {
  if (!role) return '';
  return role.charAt(0).toUpperCase() + role.slice(1);
}
function prepPctOf(week) {
  if (!week || week.prepMax == null || week.prepMax === 0 || week.prepScore == null) return null;
  return Math.round((week.prepScore / week.prepMax) * 100);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function weekLabel(key) {
  if (!key) return '';
  const d = new Date(`${key}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// ── Mini trend (up to 6 weeks, oldest → newest) ──────────────────────────────
function TrendRow({ label, weeks, kind }) {
  // weeks arrive newest-first; show up to 6, oldest on the left.
  const slice = weeks.slice(0, 6).reverse();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
      <span style={{ color: '#6a5c44', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.08em', width: 38, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 26, flex: 1 }}>
        {slice.length === 0 && <span style={{ color: '#3a3226', fontSize: '.7rem' }}>no data yet</span>}
        {slice.map((w, i) => {
          const val   = kind === 'prep' ? prepPctOf(w) : (w.avgParse != null ? Math.round(w.avgParse) : null);
          const color = kind === 'prep' ? prepColor(val) : parseColor(val);
          const h     = val == null ? 3 : Math.max(3, Math.round((val / 100) * 26));
          return (
            <div key={i}
              title={`${weekLabel(w.weekStart)} — ${val == null ? 'no data' : val + (kind === 'prep' ? '% prep' : ' parse')}`}
              style={{
                flex: 1, minWidth: 6, height: h, borderRadius: 2,
                background: val == null ? '#241f17' : color,
                alignSelf: 'flex-end',
              }} />
          );
        })}
      </div>
    </div>
  );
}

// ── One character card ───────────────────────────────────────────────────────
function CharacterCard({ char, busy, onRefresh, onDelete }) {
  const [open, setOpen] = useState(false);
  const latest  = char.weeks[0] || null;
  const prepPct = prepPctOf(latest);
  const parse   = latest && latest.avgParse != null ? Math.round(latest.avgParse) : null;
  const best    = latest && latest.bestParse != null ? Math.round(latest.bestParse) : null;

  const status = char.fetchStatus;
  const isFetching = status === 'fetching' || status === 'pending';
  const isError    = status === 'error';

  return (
    <div style={{
      background: '#131008', border: '1px solid #2a2218', borderRadius: 10,
      padding: '1.15rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '.9rem',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.5rem' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: classColor(char.className), fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>
            {char.name}
          </div>
          <div style={{ color: '#8a7a60', fontSize: '.75rem', marginTop: '.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[roleLabel(char.role), char.server, char.guildName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.25rem', flexShrink: 0 }}>
          <button
            onClick={() => onRefresh(char)} disabled={busy}
            title="Refresh from Warcraft Logs"
            style={iconBtn(busy)}>↻</button>
          <button
            onClick={() => onDelete(char)} disabled={busy}
            title="Unpin character"
            style={iconBtn(busy)}>✕</button>
        </div>
      </div>

      {/* Status line for fetching / error / no data */}
      {isFetching && <div style={{ color: '#f5c842', fontSize: '.8rem' }}>↻ Fetching from Warcraft Logs…</div>}
      {isError && (
        <div style={{ color: '#e05555', fontSize: '.78rem', lineHeight: 1.4 }}>
          Couldn’t load: {char.errorMessage || 'unknown error'}
        </div>
      )}

      {!isFetching && !isError && (
        <>
          {/* Two grades side by side */}
          <div style={{ display: 'flex', gap: '.75rem' }}>
            <Grade label="Prep"  value={prepPct != null ? `${prepPct}%` : '—'} color={prepColor(prepPct)}
                   sub={latest && latest.prepMax != null ? `${latest.prepScore}/${latest.prepMax} avg` : 'no kills'} />
            <Grade label="Parse" value={parse != null ? parse : '—'} color={parseColor(parse)}
                   sub={best != null ? `best ${best}` : 'no parse'} />
          </div>

          {/* Trends */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
            <TrendRow label="Prep"  weeks={char.weeks} kind="prep" />
            <TrendRow label="Parse" weeks={char.weeks} kind="parse" />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #221b12', paddingTop: '.6rem' }}>
            <span style={{ color: '#6a5c44', fontSize: '.75rem' }}>
              {latest ? `${weekLabel(latest.weekStart)} · ${latest.kills} kill${latest.kills === 1 ? '' : 's'}` : 'No raids in range'}
            </span>
            {char.weeks.length > 0 && (
              <button onClick={() => setOpen(o => !o)}
                style={{ background: 'none', border: 'none', color: '#8a7a60', cursor: 'pointer', fontSize: '.75rem' }}>
                Weekly detail {open ? '▴' : '▾'}
              </button>
            )}
          </div>

          {/* Expanded per-week table */}
          {open && char.weeks.length > 0 && (
            <div style={{ borderTop: '1px solid #221b12', paddingTop: '.6rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                <thead>
                  <tr style={{ color: '#6a5c44', textAlign: 'left' }}>
                    <th style={{ fontWeight: 500, padding: '.2rem 0' }}>Week</th>
                    <th style={{ fontWeight: 500, textAlign: 'center' }}>Prep</th>
                    <th style={{ fontWeight: 500, textAlign: 'center' }}>Parse</th>
                    <th style={{ fontWeight: 500, textAlign: 'center' }}>Kills</th>
                  </tr>
                </thead>
                <tbody>
                  {char.weeks.map(w => {
                    const pp = prepPctOf(w);
                    const pa = w.avgParse != null ? Math.round(w.avgParse) : null;
                    return (
                      <tr key={w.weekStart}>
                        <td style={{ color: '#bbaa88', padding: '.2rem 0' }}>{weekLabel(w.weekStart)}</td>
                        <td style={{ textAlign: 'center', color: prepColor(pp), fontWeight: 600 }}>{pp != null ? `${pp}%` : '—'}</td>
                        <td style={{ textAlign: 'center', color: parseColor(pa), fontWeight: 600 }}>{pa != null ? pa : '—'}</td>
                        <td style={{ textAlign: 'center', color: '#8a7a60' }}>{w.kills}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: '.5rem', textAlign: 'right' }}>
                <Link
                  href={`/lookup?name=${encodeURIComponent(char.name)}&server=${encodeURIComponent(char.server)}&region=${encodeURIComponent(char.region)}`}
                  className="subtle-link" style={{ fontSize: '.78rem' }}>
                  Full history →
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Grade({ label, value, color, sub }) {
  return (
    <div style={{
      flex: 1, background: '#0d0a05', border: '1px solid #221b12', borderRadius: 8,
      padding: '.65rem .5rem', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.65rem', fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ color: '#6a5c44', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.08em', marginTop: '.15rem' }}>{label}</div>
      <div style={{ color: '#4d4234', fontSize: '.66rem', marginTop: '.1rem' }}>{sub}</div>
    </div>
  );
}

function iconBtn(disabled) {
  return {
    background: 'none', border: '1px solid #2a2218', borderRadius: 5,
    color: disabled ? '#4d4234' : '#8a7a60', cursor: disabled ? 'default' : 'pointer',
    fontSize: '.78rem', width: 26, height: 26, lineHeight: 1,
  };
}

// ── Add character form ───────────────────────────────────────────────────────
function AddCharacterForm({ onAdd, adding }) {
  const [name,   setName]   = useState('');
  const [slug,   setSlug]   = useState('thunderstrike');
  const [region, setRegion] = useState('EU');
  const [custom, setCustom] = useState(false);

  const pickServer = (e) => {
    const v = e.target.value;
    if (v === '__custom') { setCustom(true); setSlug(''); return; }
    const m = KNOWN_SERVERS.find(s => s.slug === v);
    if (m) { setSlug(m.slug); setRegion(m.region); }
    setCustom(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim() || adding) return;
    onAdd({ name: name.trim(), server: slug.trim(), region });
    setName('');
  };

  const field = { background: '#131008', color: '#e8dcc8', border: '1px solid #2a2218', borderRadius: 5, padding: '.5rem .65rem', fontSize: '.9rem' };

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', marginBottom: '1.5rem' }}>
      <input type="text" placeholder="Character name…" value={name}
        onChange={e => setName(e.target.value)} autoComplete="off"
        style={{ ...field, flex: '1 1 180px' }} />
      <select value={custom ? '__custom' : slug} onChange={pickServer} style={{ ...field, cursor: 'pointer' }}>
        {KNOWN_SERVERS.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
      </select>
      {custom && (
        <>
          <input type="text" placeholder="realm-slug" value={slug}
            onChange={e => setSlug(e.target.value)} style={{ ...field, flex: '0 1 150px' }} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={{ ...field, cursor: 'pointer' }}>
            {REGIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </>
      )}
      <button className="btn" type="submit" disabled={adding || !name.trim() || !slug.trim()}>
        {adding ? 'Adding…' : '+ Add character'}
      </button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CharactersPage() {
  const { data: session, status } = useSession();
  const [chars,   setChars]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [busyIds, setBusyIds] = useState(new Set());
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    const rows = await fetch('/api/characters').then(r => r.json());
    if (Array.isArray(rows)) setChars(rows);
    setLoading(false);
  }, []);

  useEffect(() => { if (session) load(); }, [session, load]);

  const addCharacter = async ({ name, server, region }) => {
    setAdding(true); setError('');
    try {
      const res = await fetch('/api/characters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, server, region }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || 'Failed to add character');
      else if (body.fetchError) setError(`Added, but data fetch failed: ${body.fetchError}`);
      await load();
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const withBusy = async (id, fn) => {
    setBusyIds(prev => new Set([...prev, id]));
    try { await fn(); } finally {
      setBusyIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const refreshChar = (char) => withBusy(char.id, async () => {
    setError('');
    const res = await fetch(`/api/characters/${char.id}`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (body.fetchError) setError(`${char.name}: ${body.fetchError}`);
    await load();
  });

  const refreshAll = async () => {
    // Sequential to avoid tripping WCL rate limits (mirrors dashboard reanalyzeAll).
    for (const char of chars) {
      // eslint-disable-next-line no-await-in-loop
      await refreshChar(char);
    }
  };

  const deleteChar = (char) => withBusy(char.id, async () => {
    if (!confirm(`Unpin ${char.name}? This only removes it from your list.`)) return;
    await fetch(`/api/characters/${char.id}`, { method: 'DELETE' });
    await load();
  });

  if (status === 'loading') return null;
  if (!session) return (
    <div className="container">
      <p style={{ marginTop: '3rem', color: '#8a7a60' }}>
        <button className="btn" onClick={() => signIn('discord')}>Login with Discord</button>
        {' '}to track your characters.
      </p>
    </div>
  );

  const anyBusy = busyIds.size > 0 || adding;

  return (
    <>
      <Head><title>My Characters — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>My Characters</h1>
          {chars.length > 0 && (
            <button className="btn btn-sm" onClick={refreshAll} disabled={anyBusy}
              title="Refresh every character from Warcraft Logs">
              {anyBusy ? '↻ Refreshing…' : '↻ Refresh all'}
            </button>
          )}
        </div>
        <p style={{ color: '#8a7a60', fontSize: '.88rem', marginTop: '.4rem', marginBottom: '1.5rem' }}>
          Pin the characters you raid on to track consumable prep and parses, week by week.
        </p>

        <AddCharacterForm onAdd={addCharacter} adding={adding} />

        {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {loading ? (
          <p style={{ color: '#6a5c44' }}>Loading…</p>
        ) : chars.length === 0 ? (
          <div style={{
            border: '1px dashed #2a2218', borderRadius: 10, padding: '2.5rem 1.5rem',
            textAlign: 'center', color: '#6a5c44',
          }}>
            No characters yet. Add your first character above to see how you’re doing each week.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.15rem' }}>
            {chars.map(char => (
              <CharacterCard
                key={char.id}
                char={char}
                busy={busyIds.has(char.id)}
                onRefresh={refreshChar}
                onDelete={deleteChar}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
