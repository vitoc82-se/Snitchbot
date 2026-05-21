import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { classColor, score, maxScore } from '../../../lib/scoring';
import { PRE_COLS, POT_COLS } from '../../../lib/constants';

export default function PlayerDetail() {
  const { data: session, status } = useSession();
  const router  = useRouter();
  const { name } = router.query;
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!session || !name) return;
    fetch(`/api/players/${encodeURIComponent(name)}`).then(r => r.json()).then(setRows);
  }, [session, name]);

  if (status === 'loading' || !name) return null;
  if (!session) return <div className="container"><p style={{ marginTop: '3rem', color: '#888' }}>Not logged in.</p></div>;

  const first = rows[0]?.player;
  const cls   = first?.class;

  return (
    <>
      <Head><title>{name} — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/dashboard" className="subtle-link">← Dashboard</Link>
        </div>
        <h1 style={{ color: classColor(cls) }}>{name}</h1>
        {first && <p style={{ color: '#888', marginTop: '.25rem' }}>{first.class} · {first.role}</p>}

        {rows.length === 0
          ? <p style={{ color: '#666' }}>No data found.</p>
          : (
            <table className="player-table" style={{ marginTop: '1.5rem' }}>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Date</th>
                  {PRE_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
                  {POT_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
                  <th style={{ textAlign: 'center' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = r.player;
                  const s = score(p);
                  const mx = maxScore(p);
                  return (
                    <tr key={i}>
                      <td>
                        <Link href={`/reports/${r.wcl_code}`} className="subtle-link">
                          {r.title || r.wcl_code}
                        </Link>
                      </td>
                      <td style={{ color: '#666', fontSize: '.82rem' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      {PRE_COLS.map(c => (
                        <td key={c.key} style={{ textAlign: 'center', color: p[c.key] ? '#4caf50' : '#555' }}>
                          {p[c.key] ? '✓' : '—'}
                        </td>
                      ))}
                      {POT_COLS.map(c => (
                        <td key={c.key} style={{ textAlign: 'center', color: p[c.key] ? '#4caf50' : '#555' }}>
                          {p[c.key] > 0 ? p[c.key] : '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', color: s === mx ? '#4caf50' : s === 0 ? '#e05555' : '#f5c842' }}>
                        {s}/{mx}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }
      </div>
    </>
  );
}
