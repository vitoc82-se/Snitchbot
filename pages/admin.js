import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const STATUS_COLORS = { pending: '#f5c842', added: '#5aad6f', rejected: '#c45a4a' };
const SETTING_LABELS = {
  flask:    'Flask / Battle Elixir',
  guardian: 'Guardian Elixir / Flask',
  food:     'Food Buff',
  pots:     'Relevant Potions',
  weapon:   'Weapon Buff',
};

function ago(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30)  return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12)  return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatCard({ number, label, sub, color }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-number" style={color ? { color } : {}}>{number ?? '—'}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div style={{ color: '#6a5c44', fontSize: '.75rem', marginTop: '.2rem' }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginTop: '2.5rem', marginBottom: '.75rem' }}>
      <h3 className="pot-leaderboard-title" style={{ margin: 0 }}>{children}</h3>
      {sub && <p style={{ color: '#6a5c44', fontSize: '.82rem', margin: '.2rem 0 0' }}>{sub}</p>}
    </div>
  );
}

export default function AdminPage() {
  const [password,    setPassword]    = useState('');
  const [data,        setData]        = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [bossLimit,   setBossLimit]   = useState(10);

  const login = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const [statsRes, suggestRes] = await Promise.all([
        fetch(`/api/admin?password=${encodeURIComponent(password)}`),
        fetch(`/api/suggestions?password=${encodeURIComponent(password)}`),
      ]);
      const json = await statsRes.json().catch(() => null);
      if (statsRes.status === 401) { setError('Wrong password.'); return; }
      if (!statsRes.ok) { setError(`Server error ${statsRes.status}: ${json?.error || 'unknown'}`); return; }
      setData(json);
      if (suggestRes.ok) setSuggestions(await suggestRes.json().catch(() => []));
    } catch (err) { setError(`Failed to load: ${err.message}`); }
    finally       { setLoading(false); }
  };

  const db = data?.db;

  return (
    <>
      <Head><title>Snitchbot — Admin</title></Head>
      <div className="container">
        <Link href="/" className="subtle-link" style={{ fontSize: '.85rem' }}>← Back to Snitchbot</Link>
        <h1 style={{ marginTop: '.75rem' }}>Admin Panel</h1>

        {!data ? (
          <form onSubmit={login} style={{ marginTop: '1.5rem' }}>
            <div className="input-row">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button className="btn" type="submit" disabled={loading}>
                {loading ? 'Loading…' : 'Login'}
              </button>
            </div>
            {error && <div className="error" style={{ marginTop: '.75rem' }}>{error}</div>}
          </form>
        ) : (
          <>
            {/* ── Headline numbers ──────────────────────────────────────── */}
            <div className="admin-stats-row" style={{ marginTop: '1.5rem' }}>
              <StatCard number={data.totalReports}        label="Total Analyses"        sub="via WCL (Redis)" />
              <StatCard number={data.uniqueUsers}         label="Unique Visitors"        sub="distinct IPs" />
              <StatCard number={db?.totalUsers}           label="Registered Users"       sub="Discord OAuth" color="#69CCF0" />
              <StatCard number={db?.totalSavedReports}    label="Saved Reports"          sub="in database" color="#4caf50" />
              <StatCard number={suggestions.length}       label="Suggestions"            />
            </div>

            <div className="admin-stats-row" style={{ marginTop: '.75rem' }}>
              <StatCard number={db?.newUsers7d}           label="New Users (7d)"        color={db?.newUsers7d  > 0 ? '#5aad6f' : '#8a7a60'} />
              <StatCard number={db?.newUsers30d}          label="New Users (30d)"       color={db?.newUsers30d > 0 ? '#5aad6f' : '#8a7a60'} />
              <StatCard number={db?.totalBossesTracked}   label="Boss Encounters Saved" />
              <StatCard
                number={db?.avgBossesPerReport > 0 ? db.avgBossesPerReport.toFixed(1) : '—'}
                label="Avg Bosses / Report"
              />
              <StatCard number={db?.avgPlayersPerAttempt} label="Avg Players / Attempt" />
            </div>

            <div className="admin-stats-row" style={{ marginTop: '.75rem' }}>
              <StatCard number={db?.lookupTotal}   label="Players Looked Up"    sub="all time" color="#a335ee" />
              <StatCard number={db?.lookupLast7d}  label="Lookups (7d)"         color={db?.lookupLast7d > 0 ? '#5aad6f' : '#8a7a60'} />
              <StatCard number={db?.lookupErrors}  label="Lookup Errors"        color={db?.lookupErrors > 0 ? '#c45a4a' : '#8a7a60'} />
            </div>

            {/* ── Recent player lookups ─────────────────────────────────── */}
            {(db?.recentLookups?.length > 0) && (
              <>
                <SectionTitle sub="Most recently looked up players">Recent Player Lookups</SectionTitle>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Player</th>
                        <th style={{ textAlign: 'left' }}>Class · Role</th>
                        <th style={{ textAlign: 'left' }}>Guild</th>
                        <th style={{ textAlign: 'left' }}>Server</th>
                        <th style={{ textAlign: 'left' }}>Fetched</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.recentLookups.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 'bold' }}>
                            <a href={`/lookup?name=${encodeURIComponent(r.name)}&server=${encodeURIComponent(r.server)}&region=${encodeURIComponent(r.region)}`}
                              style={{ color: '#ddd', textDecoration: 'none' }}>
                              {r.name}
                            </a>
                          </td>
                          <td style={{ color: '#8a7a60', fontSize: '.82rem' }}>
                            {r.className}{r.role && ` · ${r.role}`}
                          </td>
                          <td style={{ color: '#6a5c44', fontSize: '.82rem' }}>{r.guild || '—'}</td>
                          <td style={{ color: '#6a5c44', fontSize: '.82rem' }}>{r.server} ({r.region})</td>
                          <td style={{ color: '#6a5c44', fontSize: '.82rem' }}>
                            {r.fetchedAt ? new Date(r.fetchedAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── Registered users ──────────────────────────────────────── */}
            <SectionTitle sub={`${db?.users?.length} Discord accounts · ${db?.usersWithCustomSettings} have saved custom settings`}>
              Registered Users
            </SectionTitle>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>User</th>
                    <th style={{ textAlign: 'center' }}>Reports</th>
                    <th style={{ textAlign: 'left' }}>Joined</th>
                    <th style={{ textAlign: 'left' }}>Last Active</th>
                    <th style={{ textAlign: 'center' }}>Flask</th>
                    <th style={{ textAlign: 'center' }}>Guard</th>
                    <th style={{ textAlign: 'center' }}>Food</th>
                    <th style={{ textAlign: 'center' }}>Pots</th>
                    <th style={{ textAlign: 'center' }}>Weapon</th>
                  </tr>
                </thead>
                <tbody>
                  {(db?.users || []).map((u, i) => {
                    const s = u.settings;
                    // null settings = using DEFAULT_MANDATORY
                    const flask    = s ? s.flask    !== false : true;
                    const guardian = s ? s.guardian !== false : true;
                    const food     = s ? s.food     !== false : true;
                    const pots     = s ? s.pots     !== false : true;
                    const weapon   = s ? !!s.weapon          : false;
                    const tick = v => (
                      <span style={{ color: v ? '#5aad6f' : '#4a3e2c' }}>{v ? '✓' : '✗'}</span>
                    );
                    return (
                      <tr key={i}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                            {u.avatar && (
                              <img
                                src={u.avatar}
                                alt=""
                                style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }}
                              />
                            )}
                            <span style={{ fontWeight: 'bold', color: '#ddd' }}>{u.name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ color: u.reportCount > 0 ? '#5aad6f' : '#6a5c44', fontWeight: 'bold' }}>
                            {u.reportCount}
                          </span>
                        </td>
                        <td style={{ color: '#6a5c44', fontSize: '.82rem' }}>{fmt(u.joinedAt)}</td>
                        <td style={{ color: '#6a5c44', fontSize: '.82rem' }}>
                          {u.lastReportAt ? ago(u.lastReportAt) : <span style={{ color: '#4a3e2c' }}>No reports</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>{tick(flask)}</td>
                        <td style={{ textAlign: 'center' }}>{tick(guardian)}</td>
                        <td style={{ textAlign: 'center' }}>{tick(food)}</td>
                        <td style={{ textAlign: 'center' }}>{tick(pots)}</td>
                        <td style={{ textAlign: 'center' }}>{tick(weapon)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Settings distribution ─────────────────────────────────── */}
            <SectionTitle sub="Across all registered users. Users who haven't saved settings counted as using defaults.">
              Settings Distribution
            </SectionTitle>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Setting</th>
                    <th style={{ textAlign: 'center' }}>Enabled</th>
                    <th style={{ textAlign: 'left', width: '40%' }}>Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(SETTING_LABELS).map(([key, label]) => {
                    const count = db?.settingsDist?.[key] ?? 0;
                    const total = db?.totalUsers ?? 1;
                    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <tr key={key}>
                        <td style={{ color: '#ccc' }}>{label}</td>
                        <td style={{ textAlign: 'center', color: pct > 50 ? '#5aad6f' : '#8a7a60' }}>
                          {count}/{total} <span style={{ color: '#6a5c44', fontSize: '.8rem' }}>({pct}%)</span>
                        </td>
                        <td>
                          <div style={{ background: '#1a1a1a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%', borderRadius: 4,
                              background: pct >= 80 ? '#5aad6f' : pct >= 40 ? '#f5c842' : '#c45a4a',
                              transition: 'width .3s',
                            }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Boss encounter leaderboard ────────────────────────────── */}
            <SectionTitle sub="Across all saved reports — how often each boss appears and how often it dies.">
              Boss Encounter Leaderboard
            </SectionTitle>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Boss</th>
                    <th style={{ textAlign: 'center' }}>Reports</th>
                    <th style={{ textAlign: 'center' }}>Kills</th>
                    <th style={{ textAlign: 'center' }}>Kill Rate</th>
                    <th style={{ textAlign: 'left', width: '30%' }}>Kill Rate Bar</th>
                  </tr>
                </thead>
                <tbody>
                  {(db?.bossList || []).slice(0, bossLimit).map((b, i) => (
                    <tr key={b.name}>
                      <td style={{ color: '#ddd' }}>{b.name}</td>
                      <td style={{ textAlign: 'center', color: '#8a7a60' }}>{b.seen}</td>
                      <td style={{ textAlign: 'center', color: b.kills > 0 ? '#5aad6f' : '#6a5c44' }}>{b.kills}</td>
                      <td style={{ textAlign: 'center', color: b.killRate >= 80 ? '#5aad6f' : b.killRate >= 40 ? '#f5c842' : '#c45a4a', fontWeight: 'bold' }}>
                        {b.killRate}%
                      </td>
                      <td>
                        <div style={{ background: '#1a1a1a', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{
                            width: `${b.killRate}%`, height: '100%', borderRadius: 4,
                            background: b.killRate >= 80 ? '#5aad6f' : b.killRate >= 40 ? '#f5c842' : '#c45a4a',
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(db?.bossList?.length || 0) > bossLimit && (
              <button
                className="subtle-link"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a7a60', fontSize: '.82rem', marginTop: '.5rem' }}
                onClick={() => setBossLimit(l => l + 10)}>
                Show more ({db.bossList.length - bossLimit} remaining)
              </button>
            )}

            {/* ── Recent analyses (Redis) ───────────────────────────────── */}
            <SectionTitle sub={`Last ${data.reports?.length} WCL analyses (not the same as saved reports)`}>
              Recent Analyses
            </SectionTitle>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Log Code</th>
                    <th style={{ textAlign: 'left' }}>Time (UTC)</th>
                    <th style={{ textAlign: 'left' }}>Visitor IP</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.reports || []).map((r, i) => (
                    <tr key={i}>
                      <td>
                        <a
                          href={`https://fresh.warcraftlogs.com/reports/${r.code}`}
                          target="_blank" rel="noreferrer"
                          style={{ color: '#f5c842', textDecoration: 'none' }}
                        >
                          {r.code}
                        </a>
                      </td>
                      <td style={{ color: '#8a7a60', fontSize: '.82rem' }}>
                        {new Date(r.ts).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td style={{ color: '#6a5c44', fontSize: '.82rem', fontFamily: 'monospace' }}>
                        {r.ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Suggestions ───────────────────────────────────────────── */}
            <SectionTitle>Consumable Suggestions — {suggestions.length} total</SectionTitle>
            {suggestions.length === 0 ? (
              <p style={{ color: '#6a5c44', fontSize: '.85rem' }}>No suggestions yet.</p>
            ) : (
              <div style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {suggestions.map(s => (
                  <div key={s.id} className="suggest-admin-card">
                    <div className="suggest-admin-header">
                      <span className="suggest-admin-id">ID: <strong>{s.spell_item_id}</strong></span>
                      {s.category && <span className="suggest-admin-cat">{s.category}</span>}
                      <span className="suggest-admin-status" style={{ color: STATUS_COLORS[s.status] || '#8a7a60' }}>
                        {s.status}
                      </span>
                      <span style={{ color: '#6a5c44', fontSize: '.78rem', marginLeft: 'auto' }}>
                        {new Date(s.created_at).toISOString().replace('T', ' ').slice(0, 16)} UTC
                        {s.submitted_by && ` · ${s.submitted_by}`}
                      </span>
                    </div>
                    {s.class_spec && (
                      <div className="suggest-admin-row">
                        <span className="suggest-admin-lbl">Class/Spec</span> {s.class_spec}
                      </div>
                    )}
                    {s.wowhead_link && (
                      <div className="suggest-admin-row">
                        <span className="suggest-admin-lbl">Wowhead</span>{' '}
                        <a href={s.wowhead_link} target="_blank" rel="noreferrer" style={{ color: '#f5c842', textDecoration: 'none' }}>
                          {s.wowhead_link}
                        </a>
                      </div>
                    )}
                    {s.log_example && (
                      <div className="suggest-admin-row">
                        <span className="suggest-admin-lbl">Log</span>{' '}
                        {/^[A-Za-z0-9]+$/.test(s.log_example.trim()) ? (
                          <a href={`https://fresh.warcraftlogs.com/reports/${s.log_example.trim()}`} target="_blank" rel="noreferrer" style={{ color: '#f5c842', textDecoration: 'none' }}>
                            {s.log_example.trim()}
                          </a>
                        ) : s.log_example}
                      </div>
                    )}
                    <div className="suggest-admin-row">
                      <span className="suggest-admin-lbl">Reason</span> {s.motivation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by Warcraft Logs API &nbsp;·&nbsp; TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
