/**
 * /guild — Guild roster lookup
 * Login required. Fetches all guild members from WCL and shows their
 * combined rating, WCL %, enchant score and consumable compliance.
 */
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { classColor } from '../../lib/scoring';

// ── Shared helpers ────────────────────────────────────────────────────────────

function parseColor(pct) {
  if (pct == null || pct === 0) return '#555';
  if (pct >= 99) return '#e6cc80';
  if (pct >= 95) return '#ff8000';
  if (pct >= 75) return '#a335ee';
  if (pct >= 50) return '#0070dd';
  if (pct >= 25) return '#1eff00';
  return '#888';
}

function getTier(score) {
  if (score >= 95) return { name: 'Legendary', color: '#e6cc80', border: 'rgba(230,204,128,0.4)', bg: 'rgba(230,204,128,0.07)' };
  if (score >= 75) return { name: 'Epic',      color: '#a335ee', border: 'rgba(163,53,238,0.4)',  bg: 'rgba(163,53,238,0.07)'  };
  if (score >= 50) return { name: 'Rare',      color: '#0070dd', border: 'rgba(0,112,221,0.4)',   bg: 'rgba(0,112,221,0.07)'   };
  if (score >= 25) return { name: 'Uncommon',  color: '#1eff00', border: 'rgba(30,255,0,0.4)',    bg: 'rgba(30,255,0,0.07)'    };
  return                  { name: 'Common',    color: '#9d9d9d', border: 'rgba(157,157,157,0.3)', bg: 'rgba(157,157,157,0.05)' };
}

function scoreColor(s, mx) {
  if (mx == null || mx === 0) return '#555';
  const p = s / mx;
  if (p >= 1)   return '#4caf50';
  if (p >= 0.6) return '#f5c842';
  return '#e05555';
}

function computeSummary(bosses) {
  if (!bosses?.length) return {};
  const withKills   = bosses.filter(b => b.totalKills > 0 && b.rankPercent != null);
  const withCons    = bosses.filter(b => b.consumeScore != null && b.consumeMax > 0);
  const withEnchant = bosses.filter(b => b.enchantScore != null);

  const avgRank    = withKills.length    ? Math.round(withKills.reduce((s,b)=>s+b.rankPercent,0)/withKills.length) : null;
  const consPct    = withCons.length     ? Math.round(withCons.reduce((s,b)=>s+(b.consumeScore/b.consumeMax)*100,0)/withCons.length) : null;
  const enchantPct = withEnchant.length  ? Math.round(withEnchant.reduce((s,b)=>s+b.enchantScore,0)/withEnchant.length) : null;
  const avgConsScore = withCons.length   ? (withCons.reduce((s,b)=>s+b.consumeScore,0)/withCons.length).toFixed(1) : null;
  const avgConsMax   = withCons.length   ? (withCons.reduce((s,b)=>s+b.consumeMax,0)/withCons.length).toFixed(1) : null;

  let combined = 0, totalWeight = 0;
  if (avgRank    != null) { combined += avgRank    * 0.50; totalWeight += 0.50; }
  if (enchantPct != null) { combined += enchantPct * 0.30; totalWeight += 0.30; }
  if (consPct    != null) { combined += consPct    * 0.20; totalWeight += 0.20; }
  if (totalWeight > 0) combined = Math.round(combined / totalWeight);

  return {
    avgRank,
    consPct,
    enchantPct,
    avgConsScore,
    avgConsMax,
    combined: totalWeight > 0 ? combined : null,
  };
}

// ── Server list (same as lookup/compare) ─────────────────────────────────────

const KNOWN_SERVERS = [
  { label: 'Thunderstrike — EU', slug: 'thunderstrike', region: 'EU' },
  { label: 'Spineshatter — EU',  slug: 'spineshatter',  region: 'EU' },
  { label: 'Nightslayer — US',   slug: 'nightslayer',   region: 'US' },
  { label: 'Dreamscythe — US',   slug: 'dreamscythe',   region: 'US' },
];
const REGIONS = ['EU', 'US', 'KR', 'TW'];
const BATCH_SIZE = 4;

// ── Login gate ────────────────────────────────────────────────────────────────

function LoginGate() {
  return (
    <div style={{ marginTop: '4rem', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔒</div>
      <h2 style={{ color: '#ddd', marginBottom: '.5rem' }}>Login required</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem', maxWidth: 400, margin: '0 auto .5rem' }}>
        Guild Lookup is only available to logged-in users to prevent abuse.
      </p>
      <p style={{ color: '#555', fontSize: '.85rem', marginBottom: '1.5rem' }}>
        It scans your entire guild roster and fetches WCL data for every member.
      </p>
      <button className="btn" onClick={() => signIn('discord')}>
        Login with Discord
      </button>
    </div>
  );
}

// ── Search form ───────────────────────────────────────────────────────────────

function SearchForm({ onSearch, loading }) {
  const [guildName, setGuildName] = useState('');
  const [slug,      setSlug]      = useState('thunderstrike');
  const [region,    setRegion]    = useState('EU');
  const [custom,    setCustom]    = useState(false);

  const pickServer = (e) => {
    const v = e.target.value;
    if (v === '__custom') { setCustom(true); setSlug(''); return; }
    const m = KNOWN_SERVERS.find(s => s.slug === v);
    if (m) { setSlug(m.slug); setRegion(m.region); }
    setCustom(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (guildName.trim() && slug.trim()) onSearch({ guildName: guildName.trim(), server: slug.trim(), region });
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 560, marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Guild name
          </label>
          <input
            type="text"
            placeholder="e.g. Whos Looting"
            value={guildName}
            onChange={e => setGuildName(e.target.value)}
            autoComplete="off"
            style={{ width: '100%', fontSize: '1rem', padding: '.6rem .75rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Realm
          </label>
          <select
            defaultValue="thunderstrike"
            onChange={pickServer}
            style={{ width: '100%', background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '.6rem .75rem', fontSize: '.95rem', cursor: 'pointer' }}
          >
            {KNOWN_SERVERS.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
            <option value="__custom">Other (enter below)</option>
          </select>
          {custom && (
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
              <input type="text" placeholder="realm-slug" value={slug} onChange={e => setSlug(e.target.value)} style={{ flex: 1 }} />
              <select value={region} onChange={e => setRegion(e.target.value)} style={{ background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '.6rem .75rem' }}>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        <button className="btn" type="submit" disabled={loading || !guildName.trim() || !slug.trim()} style={{ alignSelf: 'flex-start', minWidth: 140 }}>
          {loading ? '↻ Scanning…' : 'Scan guild'}
        </button>
      </div>
    </form>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#666', marginBottom: '.35rem' }}>
        <span>Fetching member data…</span>
        <span style={{ color: '#f5c842' }}>{done} / {total}</span>
      </div>
      <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#f5c842', borderRadius: 2, transition: 'width .3s ease' }} />
      </div>
    </div>
  );
}

// ── Results table ─────────────────────────────────────────────────────────────

const SORT_KEYS = ['combined', 'avgRank', 'enchantPct', 'consPct', 'name'];

function GuildTable({ members, server, region }) {
  const [sortKey, setSortKey]   = useState('combined');
  const [sortDir, setSortDir]   = useState('desc');

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...members].sort((a, b) => {
    const av = a[sortKey] ?? (sortKey === 'name' ? '' : -1);
    const bv = b[sortKey] ?? (sortKey === 'name' ? '' : -1);
    if (sortKey === 'name') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  // Guild averages
  const done     = members.filter(m => m.fetchStatus === 'done' && m.combined != null);
  const avgCombined = done.length ? Math.round(done.reduce((s,m)=>s+m.combined,0)/done.length) : null;
  const avgWcl      = done.filter(m=>m.avgRank!=null).length
    ? Math.round(done.filter(m=>m.avgRank!=null).reduce((s,m)=>s+m.avgRank,0)/done.filter(m=>m.avgRank!=null).length)
    : null;
  const avgEnchant  = done.filter(m=>m.enchantPct!=null).length
    ? Math.round(done.filter(m=>m.enchantPct!=null).reduce((s,m)=>s+m.enchantPct,0)/done.filter(m=>m.enchantPct!=null).length)
    : null;
  const fullConsCount = done.filter(m=>m.consPct!=null && m.consPct>=100).length;

  const SortTh = ({ label, k }) => {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        style={{ cursor: 'pointer', textAlign: k === 'name' ? 'left' : 'center', whiteSpace: 'nowrap',
          fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.5rem .75rem',
          color: active ? '#f5c842' : '#555', userSelect: 'none' }}
      >
        {label} {active ? (sortDir === 'desc' ? '↓' : '↑') : ''}
      </th>
    );
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* Guild summary strip */}
      {done.length > 0 && (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '.75rem 1rem', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 6, fontSize: '.82rem' }}>
          <span style={{ color: '#666' }}>{done.length} members scanned</span>
          {avgCombined != null && <span>Avg rating: <strong style={{ color: getTier(avgCombined).color }}>{avgCombined}%</strong></span>}
          {avgWcl      != null && <span>Avg WCL: <strong style={{ color: parseColor(avgWcl) }}>{avgWcl}%</strong></span>}
          {avgEnchant  != null && <span>Avg enchants: <strong style={{ color: parseColor(avgEnchant) }}>{avgEnchant}/100</strong></span>}
          {done.length > 0      && <span>Full consumes: <strong style={{ color: '#4caf50' }}>{fullConsCount}/{done.length}</strong></span>}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a', background: '#080808' }}>
              <SortTh label="Player"   k="name" />
              <th style={{ fontSize: '.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.5rem .75rem', textAlign: 'center' }}>Class · Role</th>
              <SortTh label="Rating"   k="combined" />
              <SortTh label="WCL %"    k="avgRank" />
              <SortTh label="Enchants" k="enchantPct" />
              <SortTh label="Consumes" k="consPct" />
              <th style={{ fontSize: '.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.5rem .75rem', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(m => <MemberRow key={m.name} m={m} server={server} region={region} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({ m, server, region }) {
  const tdC = { textAlign: 'center', verticalAlign: 'middle', padding: '.5rem .75rem' };
  const tdL = { verticalAlign: 'middle', padding: '.5rem .75rem' };

  const tier = m.combined != null ? getTier(m.combined) : null;
  const roleLabel = m.role ? m.role.charAt(0).toUpperCase() + m.role.slice(1) : null;

  let statusEl;
  if (m.fetchStatus === 'fetching') {
    statusEl = (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', color: '#f5c842', fontSize: '.75rem' }}>
        <span style={{ width: 10, height: 10, border: '1.5px solid #333', borderTop: '1.5px solid #f5c842', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
        Fetching
      </span>
    );
  } else if (m.fetchStatus === 'error') {
    statusEl = <span style={{ color: '#e05555', fontSize: '.75rem' }}>Error</span>;
  } else if (m.fetchStatus === 'done') {
    statusEl = <span style={{ color: '#4caf50', fontSize: '.75rem' }}>✓</span>;
  } else {
    statusEl = <span style={{ color: '#333', fontSize: '.75rem' }}>—</span>;
  }

  return (
    <tr style={{ borderBottom: '1px solid #0d0d0d' }}>
      <td style={tdL}>
        <a href={`/lookup?name=${encodeURIComponent(m.name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`}
          style={{ color: classColor(m.className), fontWeight: 600, textDecoration: 'none', fontSize: '.9rem' }}>
          {m.name}
        </a>
      </td>
      <td style={{ ...tdC, color: '#666', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
        {[m.className, roleLabel].filter(Boolean).join(' · ')}
      </td>
      <td style={tdC}>
        {tier ? (
          <span style={{ color: tier.color, fontWeight: 700, fontSize: '.82rem' }}>{tier.name}</span>
        ) : <span style={{ color: '#333' }}>—</span>}
      </td>
      <td style={{ ...tdC, fontWeight: 700, color: parseColor(m.avgRank) }}>
        {m.avgRank != null ? `${m.avgRank}%` : '—'}
      </td>
      <td style={{ ...tdC, color: m.enchantPct != null ? parseColor(m.enchantPct) : '#333' }}>
        {m.enchantPct != null ? `${m.enchantPct}/100` : '—'}
      </td>
      <td style={{ ...tdC, color: m.consPct != null ? scoreColor(m.consPct, 100) : '#333' }}>
        {m.avgConsScore != null ? `${m.avgConsScore}/${m.avgConsMax}` : '—'}
      </td>
      <td style={tdC}>{statusEl}</td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GuildPage() {
  const { data: session, status } = useSession();

  const [phase,    setPhase]    = useState('idle');   // idle | fetching-roster | scanning | done
  const [members,  setMembers]  = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error,    setError]    = useState('');
  const [guildInfo, setGuildInfo] = useState(null);  // { guildName, server, region }

  const handleSearch = async ({ guildName, server, region }) => {
    setPhase('fetching-roster');
    setError('');
    setMembers([]);
    setProgress({ done: 0, total: 0 });

    // 1. Fetch roster
    let roster;
    try {
      const res  = await fetch('/api/guild/fetch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ guildName, serverSlug: server, serverRegion: region }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error || 'Failed to fetch guild'); setPhase('idle'); return; }
      roster = body.members;
      setGuildInfo({ guildName: body.guildName, server, region });
    } catch (err) {
      setError(err.message || 'Unexpected error');
      setPhase('idle');
      return;
    }

    // 2. Initialise rows
    const rows = roster.map(m => ({ ...m, fetchStatus: 'pending' }));
    setMembers(rows);
    setProgress({ done: 0, total: roster.length });
    setPhase('scanning');

    // 3. Batch fetch members BATCH_SIZE at a time
    let doneCount = 0;
    for (let i = 0; i < roster.length; i += BATCH_SIZE) {
      const batch = roster.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (m) => {
        // Mark as fetching
        setMembers(prev => prev.map(r => r.name === m.name ? { ...r, fetchStatus: 'fetching' } : r));

        try {
          // Check cache first — skip fetch if fresh
          const cached = await fetch(
            `/api/lookup?name=${encodeURIComponent(m.name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
          ).then(r => r.json());

          if (cached.status === 'done' && !cached.stale) {
            const summary = computeSummary(cached.bosses);
            setMembers(prev => prev.map(r => r.name === m.name
              ? { ...r, fetchStatus: 'done', role: cached.profile.role, ...summary }
              : r
            ));
            return;
          }

          // Trigger fresh WCL fetch
          const fetchRes = await fetch('/api/lookup/fetch', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ name: m.name, serverSlug: server, serverRegion: region }),
          });

          const fresh = await fetch(
            `/api/lookup?name=${encodeURIComponent(m.name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
          ).then(r => r.json());

          if (fresh.status === 'done') {
            const summary = computeSummary(fresh.bosses);
            setMembers(prev => prev.map(r => r.name === m.name
              ? { ...r, fetchStatus: 'done', role: fresh.profile.role, ...summary }
              : r
            ));
          } else {
            setMembers(prev => prev.map(r => r.name === m.name
              ? { ...r, fetchStatus: 'error', error: fresh.error || 'No data' }
              : r
            ));
          }
        } catch (err) {
          setMembers(prev => prev.map(r => r.name === m.name
            ? { ...r, fetchStatus: 'error', error: err.message }
            : r
          ));
        }
      }));

      doneCount += batch.length;
      setProgress({ done: doneCount, total: roster.length });
    }

    setPhase('done');
  };

  const isLoading = phase === 'fetching-roster' || phase === 'scanning';

  if (status === 'loading') return null;

  return (
    <>
      <Head><title>Guild Lookup — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>Guild Lookup</h1>
        <p style={{ color: '#666', marginTop: '.4rem', fontSize: '.9rem', maxWidth: 560 }}>
          Scan your entire guild roster — WCL rankings, enchants and consumable compliance for every member.
        </p>

        {!session ? (
          <LoginGate />
        ) : (
          <>
            <SearchForm onSearch={handleSearch} loading={isLoading} />

            {phase === 'fetching-roster' && (
              <div style={{ marginTop: '1.5rem', color: '#f5c842', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                <div style={{ width: 16, height: 16, border: '2px solid #333', borderTop: '2px solid #f5c842', borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
                Fetching guild roster from Warcraft Logs…
              </div>
            )}

            {error && (
              <div style={{ marginTop: '1.5rem', padding: '.85rem 1rem', background: 'rgba(224,85,85,.1)', border: '1px solid rgba(224,85,85,.3)', borderRadius: 6, color: '#e05555', fontSize: '.9rem' }}>
                {error}
              </div>
            )}

            {(phase === 'scanning' || phase === 'done') && guildInfo && (
              <>
                <div style={{ marginTop: '1.5rem' }}>
                  <span style={{ color: '#f5c842', fontWeight: 700, fontSize: '1.1rem' }}>{guildInfo.guildName}</span>
                  <span style={{ color: '#555', fontSize: '.85rem', marginLeft: '.75rem' }}>{guildInfo.server} ({guildInfo.region})</span>
                </div>

                {phase === 'scanning' && (
                  <ProgressBar done={progress.done} total={progress.total} />
                )}

                {members.length > 0 && (
                  <GuildTable members={members} server={guildInfo.server} region={guildInfo.region} />
                )}

                {phase === 'done' && (
                  <p style={{ color: '#444', fontSize: '.78rem', marginTop: '1rem' }}>
                    Scan complete · {members.filter(m=>m.fetchStatus==='done').length} found · {members.filter(m=>m.fetchStatus==='error').length} not on WCL
                  </p>
                )}
              </>
            )}
          </>
        )}

        <footer className="site-footer" style={{ marginTop: '4rem' }}>
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API
        </footer>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
