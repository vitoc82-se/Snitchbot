import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { classColor } from '../../lib/scoring';

// WCL percentile tier colours (mirrors WoW armory parse colours)
function parseColor(pct) {
  if (pct == null || pct === 0) return '#555';
  if (pct >= 99) return '#e6cc80';
  if (pct >= 95) return '#ff8000';
  if (pct >= 75) return '#a335ee';
  if (pct >= 50) return '#0070dd';
  if (pct >= 25) return '#1eff00';
  return '#888';
}

function scoreColor(s, mx) {
  if (!mx) return '#555';
  const p = s / mx;
  if (p >= 1)    return '#4caf50';
  if (p >= 0.6)  return '#f5c842';
  return '#e05555';
}

function fmtMs(ms) {
  if (!ms) return '—';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toFixed(1);
}

function tick(val, na = false) {
  if (na)   return <span style={{ color: '#444' }}>—</span>;
  if (val)  return <span style={{ color: '#4caf50' }}>✓</span>;
  if (val === false) return <span style={{ color: '#e05555' }}>✗</span>;
  return <span style={{ color: '#444' }}>—</span>; // null = no data
}

const KNOWN_SERVERS = [
  { label: 'Thunderstrike (EU)', slug: 'thunderstrike', region: 'EU' },
  { label: 'Crusader Strike (US)', slug: 'crusader-strike', region: 'US' },
  { label: 'Wild Growth (US)', slug: 'wild-growth', region: 'US' },
  { label: 'Lone Wolf (US)', slug: 'lone-wolf', region: 'US' },
];

// ── Search form ──────────────────────────────────────────────────────────────

function SearchForm({ onSearch, loading }) {
  const [name,   setName]   = useState('');
  const [server, setServer] = useState('thunderstrike');
  const [region, setRegion] = useState('EU');
  const [custom, setCustom] = useState(false);

  const handleServer = (e) => {
    const v = e.target.value;
    if (v === '__custom') { setCustom(true); setServer(''); return; }
    const match = KNOWN_SERVERS.find(s => s.slug === v);
    if (match) { setServer(match.slug); setRegion(match.region); }
    setCustom(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim() || !server.trim()) return;
    onSearch({ name: name.trim(), server: server.trim(), region });
  };

  return (
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1.5rem' }}>
        <div style={{ flex: '2 1 200px' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem' }}>
            Character name
          </label>
          <input
            type="text"
            placeholder="e.g. Vitok"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: '2 1 200px' }}>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem' }}>
            Realm
          </label>
          <select
            onChange={handleServer}
            style={{ width: '100%', background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '.5rem', fontSize: '.9rem' }}
          >
            {KNOWN_SERVERS.map(s => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
            <option value="__custom">Other (enter manually)</option>
          </select>
          {custom && (
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.4rem' }}>
              <input
                type="text"
                placeholder="server-slug"
                value={server}
                onChange={e => setServer(e.target.value)}
                style={{ flex: 2 }}
              />
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                style={{ flex: 1, background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '.5rem', fontSize: '.9rem' }}
              >
                {['EU','US','KR','TW'].map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <button className="btn" type="submit" disabled={loading || !name.trim()}>
            {loading ? 'Searching…' : 'Look up'}
          </button>
        </div>
      </div>
      <p style={{ color: '#555', fontSize: '.78rem', marginTop: '.5rem' }}>
        Server slug = the realm name as it appears in WCL URLs (e.g. <code>fresh.warcraftlogs.com/character/eu/thunderstrike/…</code>)
      </p>
    </form>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function groupByZone(bosses) {
  const zones = {};
  for (const b of bosses) {
    if (!zones[b.zoneId]) zones[b.zoneId] = { name: b.zoneName, bosses: [] };
    zones[b.zoneId].bosses.push(b);
  }
  return Object.values(zones);
}

function BossTable({ bosses, role }) {
  return (
    <div className="table-wrap" style={{ marginTop: '.5rem' }}>
      <table style={{ fontSize: '.8rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left'   }}>Boss</th>
            <th style={{ textAlign: 'center' }}>Kills</th>
            <th style={{ textAlign: 'center' }}>Best %</th>
            <th style={{ textAlign: 'center' }}>Median %</th>
            <th style={{ textAlign: 'center' }}>Best</th>
            <th style={{ textAlign: 'center' }}>Fastest</th>
            <th style={{ textAlign: 'center' }}>Flask</th>
            <th style={{ textAlign: 'center' }}>Battle Elix</th>
            <th style={{ textAlign: 'center' }}>Guard Elix</th>
            <th style={{ textAlign: 'center' }}>Food</th>
            <th style={{ textAlign: 'center' }}>Weapon</th>
            <th style={{ textAlign: 'center' }}>Pot</th>
            <th style={{ textAlign: 'center' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {bosses.map(b => {
            const noKill  = b.totalKills === 0;
            const noCons  = b.flask === null; // null = no consumable data
            const usedAnyPot = b.hastePot > 0 || b.destroPot > 0 || b.manaPot > 0;
            const hasFlask = b.flask;
            // Weapon: show oil for healers/casters, stone for tanks/melee
            // We just show whichever is relevant; if both null, show —
            const weaponVal = (b.weaponOil || b.weaponStone) ? true
                            : (b.weaponOil === false || b.weaponStone === false) ? false : null;

            return (
              <tr key={b.encounterId} style={{ opacity: noKill ? 0.4 : 1 }}>
                <td style={{ whiteSpace: 'nowrap', color: '#ddd' }}>
                  {b.reportCode ? (
                    <a
                      href={`https://fresh.warcraftlogs.com/reports/${b.reportCode}`}
                      target="_blank" rel="noreferrer"
                      style={{ color: '#ddd', textDecoration: 'none' }}
                      title="Open best kill in WCL"
                    >
                      {b.bossName}
                    </a>
                  ) : b.bossName}
                </td>
                <td style={{ textAlign: 'center', color: noKill ? '#444' : '#888' }}>
                  {b.totalKills || '—'}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold', color: parseColor(b.rankPercent) }}>
                  {b.rankPercent != null ? `${Math.round(b.rankPercent)}` : '—'}
                </td>
                <td style={{ textAlign: 'center', color: parseColor(b.medianPercent) }}>
                  {b.medianPercent != null ? `${Math.round(b.medianPercent)}` : '—'}
                </td>
                <td style={{ textAlign: 'center', color: '#888' }}>
                  {b.bestAmount != null ? fmtNum(b.bestAmount) : '—'}
                </td>
                <td style={{ textAlign: 'center', color: '#666' }}>{fmtMs(b.fastestKill)}</td>

                {noCons ? (
                  /* No consumable data — player had no logged kill for this boss */
                  <>
                    {[...Array(6)].map((_, i) => (
                      <td key={i} style={{ textAlign: 'center', color: '#333' }}>—</td>
                    ))}
                  </>
                ) : (
                  <>
                    <td style={{ textAlign: 'center' }}>{tick(hasFlask)}</td>
                    <td style={{ textAlign: 'center' }}>{tick(hasFlask ? null : b.battleElixir)}</td>
                    <td style={{ textAlign: 'center' }}>{tick(hasFlask ? null : b.guardianElixir)}</td>
                    <td style={{ textAlign: 'center' }}>{tick(b.food)}</td>
                    <td style={{ textAlign: 'center' }}>{tick(weaponVal)}</td>
                    <td style={{ textAlign: 'center' }}>{tick(usedAnyPot)}</td>
                  </>
                )}

                <td style={{ textAlign: 'center', fontWeight: 'bold',
                  color: b.consumeScore != null ? scoreColor(b.consumeScore, b.consumeMax) : '#333' }}>
                  {b.consumeScore != null ? `${b.consumeScore}/${b.consumeMax}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlayerProfile({ profile, bosses, onRefresh, refreshing }) {
  const zones = groupByZone(bosses);

  // Overall consume score across all bosses that have data
  const scoredBosses = bosses.filter(b => b.consumeScore != null);
  const avgScore = scoredBosses.length
    ? (scoredBosses.reduce((s, b) => s + b.consumeScore, 0) / scoredBosses.length).toFixed(1)
    : null;
  const avgMax = scoredBosses.length
    ? (scoredBosses.reduce((s, b) => s + b.consumeMax, 0) / scoredBosses.length).toFixed(1)
    : null;

  const bossesWithKills = bosses.filter(b => b.totalKills > 0);
  const avgPct = bossesWithKills.length
    ? Math.round(bossesWithKills.reduce((s, b) => s + (b.rankPercent ?? 0), 0) / bossesWithKills.length)
    : null;

  const fetchedAgo = profile.fetchedAt
    ? Math.round((Date.now() - new Date(profile.fetchedAt).getTime()) / 60000)
    : null;

  return (
    <div style={{ marginTop: '2rem' }}>
      {/* Player header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: classColor(profile.className), margin: 0, fontSize: '2rem' }}>
            {profile.name}
          </h1>
          <p style={{ color: '#888', margin: '.25rem 0 0', fontSize: '.9rem' }}>
            {profile.className}
            {profile.role && <> · <span style={{ textTransform: 'capitalize' }}>{profile.role}</span></>}
            {profile.guildName && <> · <span style={{ color: '#f5c842' }}>&lt;{profile.guildName}&gt;</span></>}
            {' '}· {profile.server} ({profile.region})
          </p>
          <p style={{ color: '#444', fontSize: '.75rem', margin: '.4rem 0 0' }}>
            Based on best logged kill per boss &nbsp;·&nbsp;
            {fetchedAgo != null && (fetchedAgo < 60
              ? `Updated ${fetchedAgo}m ago`
              : `Updated ${Math.round(fetchedAgo / 60)}h ago`)}
          </p>
        </div>
        <button
          className="btn btn-sm"
          onClick={onRefresh}
          disabled={refreshing}
          style={{ alignSelf: 'flex-start', marginTop: '.25rem' }}
        >
          {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Summary cards */}
      <div className="admin-stats-row" style={{ marginTop: '1.5rem' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-number" style={{ color: avgScore != null ? scoreColor(avgScore, avgMax) : '#555' }}>
            {avgScore != null ? `${avgScore}/${avgMax}` : '—'}
          </div>
          <div className="admin-stat-label">Avg Consume Score</div>
          <div style={{ color: '#555', fontSize: '.75rem' }}>{scoredBosses.length} bosses checked</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-number" style={{ color: parseColor(avgPct) }}>
            {avgPct != null ? `${avgPct}%` : '—'}
          </div>
          <div className="admin-stat-label">Avg WCL Rank %</div>
          <div style={{ color: '#555', fontSize: '.75rem' }}>{bossesWithKills.length} bosses with kills</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-number">{bossesWithKills.length}</div>
          <div className="admin-stat-label">Boss Kills Tracked</div>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-number" style={{ color: '#888' }}>
            {scoredBosses.length > 0
              ? `${Math.round((scoredBosses.filter(b => b.consumeScore === b.consumeMax).length / scoredBosses.length) * 100)}%`
              : '—'}
          </div>
          <div className="admin-stat-label">Full Score Rate</div>
          <div style={{ color: '#555', fontSize: '.75rem' }}>kills with perfect consumes</div>
        </div>
      </div>

      {/* Per-zone boss tables */}
      {zones.map(zone => (
        <div key={zone.name} style={{ marginTop: '2rem' }}>
          <h3 style={{ color: '#f5c842', fontSize: '1rem', marginBottom: 0 }}>{zone.name}</h3>
          <BossTable bosses={zone.bosses} role={profile.role} />
        </div>
      ))}

      <p style={{ color: '#444', fontSize: '.75rem', marginTop: '2rem' }}>
        Percentile colours: &nbsp;
        {[['≥99', '#e6cc80'], ['≥95', '#ff8000'], ['≥75', '#a335ee'], ['≥50', '#0070dd'], ['≥25', '#1eff00'], ['<25', '#888']].map(([l, c]) => (
          <span key={l} style={{ color: c, marginRight: '.75rem' }}>{l}</span>
        ))}
        &nbsp;·&nbsp; Consumable data from best logged kill per boss.
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LookupPage() {
  const router = useRouter();

  const [state,      setState]      = useState('idle');  // idle | loading | done | error
  const [profile,    setProfile]    = useState(null);
  const [bosses,     setBosses]     = useState([]);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState('');

  const doFetch = useCallback(async ({ name, server, region }) => {
    setState('loading');
    setErrorMsg('');
    setStatusMsg('Checking cache…');

    // 1. Check cache first
    const cached = await fetch(`/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`).then(r => r.json());

    if (cached.status === 'done') {
      setProfile(cached.profile);
      setBosses(cached.bosses);
      setState('done');
      return;
    }

    // 2. Need to fetch from WCL
    setStatusMsg('Fetching from Warcraft Logs… this takes 20–60 seconds for a new profile.');
    const fetchRes = await fetch('/api/lookup/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, serverSlug: server, serverRegion: region }),
    });

    if (!fetchRes.ok) {
      const err = await fetchRes.json().catch(() => ({}));
      setErrorMsg(err.error || `Server error ${fetchRes.status}`);
      setState('error');
      return;
    }

    // 3. Now load from cache
    setStatusMsg('Loading results…');
    const fresh = await fetch(`/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`).then(r => r.json());

    if (fresh.status === 'done') {
      setProfile(fresh.profile);
      setBosses(fresh.bosses);
      setState('done');
    } else {
      setErrorMsg(fresh.error || 'Fetch completed but data not found. Please try again.');
      setState('error');
    }
  }, []);

  // Auto-search if query params are present on load
  useEffect(() => {
    const { name, server, region } = router.query;
    if (name && server && region && state === 'idle') {
      doFetch({ name, server, region });
    }
  }, [router.query, state, doFetch]);

  const handleSearch = ({ name, server, region }) => {
    router.push(`/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`, undefined, { shallow: true });
    doFetch({ name, server, region });
  };

  const handleRefresh = async () => {
    if (!profile || refreshing) return;
    setRefreshing(true);
    setStatusMsg('Re-fetching from Warcraft Logs…');
    try {
      await fetch('/api/lookup/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profile.name, serverSlug: profile.server, serverRegion: profile.region }),
      });
      const fresh = await fetch(`/api/lookup?name=${encodeURIComponent(profile.name)}&server=${encodeURIComponent(profile.server)}&region=${encodeURIComponent(profile.region)}`).then(r => r.json());
      if (fresh.status === 'done') {
        setProfile(fresh.profile);
        setBosses(fresh.bosses);
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Head><title>Player Lookup — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        <h1>Player Lookup</h1>
        <p style={{ color: '#888', marginTop: '.25rem' }}>
          Search any player on Warcraft Logs — see their TBC raid rankings and consumable usage across every boss.
          First lookup takes 20–60 seconds. Subsequent lookups are instant (24h cache).
        </p>

        <SearchForm onSearch={handleSearch} loading={state === 'loading' || refreshing} />

        {state === 'loading' && (
          <div style={{ marginTop: '2rem', color: '#f5c842', fontSize: '.9rem' }}>
            <span style={{ marginRight: '.5rem' }}>⟳</span>{statusMsg}
          </div>
        )}

        {state === 'error' && (
          <div className="error" style={{ marginTop: '1.5rem' }}>{errorMsg}</div>
        )}

        {state === 'done' && profile && (
          <PlayerProfile
            profile={profile}
            bosses={bosses}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        <footer className="site-footer" style={{ marginTop: '3rem' }}>
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API
        </footer>
      </div>
    </>
  );
}
