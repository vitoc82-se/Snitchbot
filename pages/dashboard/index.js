import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { classColor } from '../../lib/scoring';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [reports, setReports]   = useState([]);
  const [players, setPlayers]   = useState([]);
  const [tab, setTab]           = useState('reports');

  const loadData = () => {
    fetch('/api/reports').then(r => r.json()).then(setReports);
    fetch('/api/players').then(r => r.json()).then(setPlayers);
  };

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  const deleteReport = async (id) => {
    if (!confirm('Delete this report? Player history from it will also be removed.')) return;
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    loadData();
  };

  if (status === 'loading') return null;
  if (!session) return (
    <div className="container">
      <p style={{ marginTop: '3rem', color: '#888' }}>
        <button className="btn" onClick={() => signIn('discord')}>Login with Discord</button>
        {' '}to view your dashboard.
      </p>
    </div>
  );

  return (
    <>
      <Head><title>Dashboard — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>
        <h1>Dashboard</h1>

        <div className="tab-row" style={{ marginBottom: '1.5rem' }}>
          <button className={`tab${tab === 'reports' ? ' active' : ''}`} onClick={() => setTab('reports')}>
            Saved Reports <span className="badge badge-wipe">{reports.length}</span>
          </button>
          <button className={`tab${tab === 'players' ? ' active' : ''}`} onClick={() => setTab('players')}>
            Player Roster <span className="badge badge-wipe">{players.length}</span>
          </button>
        </div>

        {tab === 'reports' && (
          reports.length === 0
            ? <p style={{ color: '#666' }}>No saved reports yet. Analyze a log and click Save Report.</p>
            : (
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Code</th>
                    <th>Saved</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id}>
                      <td>{r.title || r.wcl_code}</td>
                      <td><code>{r.wcl_code}</code></td>
                      <td style={{ color: '#666', fontSize: '.82rem' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                        <Link href={`/reports/${r.wcl_code}`} className="subtle-link">View →</Link>
                        <button
                          onClick={() => deleteReport(r.id)}
                          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '.82rem', padding: '0 .25rem' }}
                          title="Delete report">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}

        {tab === 'players' && (
          players.length === 0
            ? <p style={{ color: '#666' }}>No player data yet. Save a report first.</p>
            : (
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Class</th>
                    <th>Role</th>
                    <th style={{ textAlign: 'center' }}>Appearances</th>
                    <th style={{ textAlign: 'center' }}>Avg Score</th>
                    <th style={{ textAlign: 'center' }}>Prepared</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map(p => (
                    <tr key={p.name}>
                      <td>
                        <Link href={`/dashboard/players/${encodeURIComponent(p.name)}`}
                          style={{ color: classColor(p.class), textDecoration: 'none', fontWeight: 'bold' }}>
                          {p.name}
                        </Link>
                      </td>
                      <td style={{ color: classColor(p.class) }}>{p.class}</td>
                      <td style={{ color: '#888', fontSize: '.85rem' }}>{p.role}</td>
                      <td style={{ textAlign: 'center', color: '#888' }}>{p.appearances}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ color: scoreColor(p.avg_score, p.avg_max) }}>
                          {p.avg_score}/{p.avg_max}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', color: '#888' }}>
                        {p.prepared_count}/{p.appearances}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}
      </div>
    </>
  );
}

function scoreColor(score, max) {
  if (!max) return '#888';
  const pct = score / max;
  if (pct >= 1)   return '#4caf50';
  if (pct >= 0.7) return '#f5c842';
  return '#e05555';
}
