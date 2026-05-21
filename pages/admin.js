import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [data,     setData]     = useState(null);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const login = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin?password=${encodeURIComponent(password)}`);
      const json = await res.json().catch(() => null);
      if (res.status === 401) { setError('Wrong password.'); return; }
      if (!res.ok) {
        setError(`Server error ${res.status}: ${json?.error || 'unknown'}`);
        return;
      }
      setData(json);
    } catch (err) { setError(`Failed to load stats: ${err.message}`); }
    finally   { setLoading(false); }
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
