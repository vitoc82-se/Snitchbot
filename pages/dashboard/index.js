import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import { classColor } from '../../lib/scoring';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reports,     setReports]     = useState([]);
  const [players,     setPlayers]     = useState([]);
  const [tab,         setTab]         = useState('reports');
  const [sortRole,    setSortRole]    = useState('all');
  const [hoveredId,   setHoveredId]   = useState(null);
  const [reanalyzing, setReanalyzing] = useState(new Set());

  const loadData = () => {
    fetch('/api/reports').then(r => r.json()).then(setReports);
    fetch('/api/players').then(r => r.json()).then(setPlayers);
  };

  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  const deleteReport = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this report? Player history from it will also be removed.')) return;
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    loadData();
  };

  const reanalyzeReport = async (e, id) => {
    e.stopPropagation();
    setReanalyzing(prev => new Set([...prev, id]));
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) { alert(`Re-analysis failed: ${body.error || 'unknown error'}`); return; }
      loadData();
    } catch (err) {
      alert(`Re-analysis failed: ${err.message}`);
    } finally {
      setReanalyzing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const reanalyzeAll = async () => {
    if (!reports.length) return;
    // Run sequentially to avoid hammering WCL rate limits.
    setReanalyzing(new Set(reports.map(r => r.id)));
    for (const r of reports) {
      try {
        await fetch(`/api/reports/${r.id}`, { method: 'POST' });
      } catch {}
      setReanalyzing(prev => { const s = new Set(prev); s.delete(r.id); return s; });
    }
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
              <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '.75rem' }}>
                <button
                  className="btn btn-sm"
                  onClick={reanalyzeAll}
                  disabled={reanalyzing.size > 0}
                  title="Re-fetch all reports from WCL with the latest detection logic">
                  {reanalyzing.size > 0
                    ? `↻ Refreshing ${reanalyzing.size} remaining…`
                    : '↻ Refresh All'}
                </button>
              </div>
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Code</th>
                    <th>Raid Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => {
                    const raidDate = r.raid_date
                      ? new Date(r.raid_date).toLocaleDateString()
                      : new Date(r.created_at).toLocaleDateString();

                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/reports/${r.wcl_code}`)}
                        onMouseEnter={() => setHoveredId(r.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ position: 'relative' }}>
                          <span>{r.title || r.wcl_code}</span>
                          {hoveredId === r.id && r.kills?.length > 0 && (
                            <div className="kills-tooltip">
                              <div className="kills-tooltip-title">Bosses killed</div>
                              {r.kills.map(k => (
                                <div key={k} className="kills-tooltip-boss">⚔ {k}</div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td><code>{r.wcl_code}</code></td>
                        <td style={{ color: '#666', fontSize: '.82rem' }}>{raidDate}</td>
                        <td style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          <Link href={`/reports/${r.wcl_code}`} className="subtle-link">View →</Link>
                          <button
                            onClick={e => reanalyzeReport(e, r.id)}
                            disabled={reanalyzing.has(r.id)}
                            style={{ background: 'none', border: 'none', color: reanalyzing.has(r.id) ? '#555' : '#888', cursor: reanalyzing.has(r.id) ? 'default' : 'pointer', fontSize: '.82rem', padding: '0 .25rem' }}
                            title="Re-fetch from WCL with latest detection logic">
                            {reanalyzing.has(r.id) ? '↻ Refreshing…' : '↻ Refresh'}
                          </button>
                          <button
                            onClick={e => deleteReport(e, r.id)}
                            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '.82rem', padding: '0 .25rem' }}
                            title="Delete report">
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </>
            )
        )}

        {tab === 'players' && (
          <>
            <div className="tab-row" style={{ marginBottom: '1rem' }}>
              {['all', 'tank', 'healer', 'dps'].map(r => (
                <button key={r}
                  className={`tab${sortRole === r ? ' active' : ''}`}
                  onClick={() => setSortRole(r)}>
                  {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            {players.length === 0
              ? <p style={{ color: '#666' }}>No player data yet. Save a report first.</p>
              : (
                <table className="player-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Class</th>
                      <th>Role</th>
                      <th style={{ textAlign: 'center' }}>Raids</th>
                      <th style={{ textAlign: 'center' }}>Avg Score</th>
                      <th style={{ textAlign: 'center' }}>Consistency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players
                      .filter(p => sortRole === 'all' || p.role === sortRole)
                      .map(p => (
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
                          <td style={{ textAlign: 'center' }}>
                            <ConsistencyBadge avg={p.avg_score} max={p.avg_max} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )
            }
          </>
        )}
      </div>
    </>
  );
}

// Percentage-based so thresholds stay meaningful regardless of max score
// (max varies by settings — e.g. 4 normally, 5 with weapon buff enabled).
// >= 75% → green ✓   50–75% → yellow ~   < 50% → red ✗
function ConsistencyBadge({ avg, max }) {
  const pct = max > 0 ? avg / max : 0;
  const label = `Avg score: ${avg}/${max}`;
  if (pct >= 0.75) return <span title={label} style={{ color: '#4caf50', fontSize: '1.1rem' }}>✓</span>;
  if (pct >= 0.5)  return <span title={label} style={{ color: '#f5c842', fontSize: '1.1rem' }}>~</span>;
  return                  <span title={label} style={{ color: '#e05555', fontSize: '1.1rem' }}>✗</span>;
}

function scoreColor(score, max) {
  if (!max) return '#888';
  const pct = score / max;
  if (pct >= 1)   return '#4caf50';
  if (pct >= 0.7) return '#f5c842';
  return '#e05555';
}
