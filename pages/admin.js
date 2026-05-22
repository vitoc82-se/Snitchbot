import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const STATUS_COLORS = { pending: '#f5c842', added: '#7ec87e', rejected: '#e05c5c' };

export default function AdminPage() {
  const [password,    setPassword]    = useState('');
  const [data,        setData]        = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

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
            <div className="admin-stats-row">
              <div className="admin-stat-card">
                <div className="admin-stat-number">{data.totalReports}</div>
                <div className="admin-stat-label">Reports Analyzed</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-number">{data.uniqueUsers}</div>
                <div className="admin-stat-label">Unique Visitors</div>
              </div>
              <div className="admin-stat-card">
                <div className="admin-stat-number">{suggestions.length}</div>
                <div className="admin-stat-label">Suggestions</div>
              </div>
            </div>

            <h3 className="pot-leaderboard-title" style={{ marginTop: '2.5rem' }}>
              Recent Reports — last {data.reports.length}
            </h3>
            <div className="table-wrap" style={{ marginTop: '.5rem' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Log Code</th>
                    <th style={{ textAlign: 'left' }}>Time (UTC)</th>
                    <th style={{ textAlign: 'left' }}>Visitor IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((r, i) => (
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
                      <td style={{ color: '#888', fontSize: '.82rem' }}>
                        {new Date(r.ts).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td style={{ color: '#555', fontSize: '.82rem', fontFamily: 'monospace' }}>
                        {r.ip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="pot-leaderboard-title" style={{ marginTop: '2.5rem' }}>
              Consumable Suggestions — {suggestions.length} total
            </h3>
            {suggestions.length === 0 ? (
              <p style={{ color: '#555', fontSize: '.85rem' }}>No suggestions yet.</p>
            ) : (
              <div style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {suggestions.map(s => (
                  <div key={s.id} className="suggest-admin-card">
                    <div className="suggest-admin-header">
                      <span className="suggest-admin-id">ID: <strong>{s.spell_item_id}</strong></span>
                      {s.category && <span className="suggest-admin-cat">{s.category}</span>}
                      <span className="suggest-admin-status" style={{ color: STATUS_COLORS[s.status] || '#888' }}>
                        {s.status}
                      </span>
                      <span style={{ color: '#555', fontSize: '.78rem', marginLeft: 'auto' }}>
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
