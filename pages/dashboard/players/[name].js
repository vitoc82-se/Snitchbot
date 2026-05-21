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
  const [raids, setRaids]           = useState([]);
  const [selectedRaid, setSelected] = useState(null);

  useEffect(() => {
    if (!session || !name) return;
    fetch(`/api/players/${encodeURIComponent(name)}`).then(r => r.json()).then(setRaids);
  }, [session, name]);

  if (status === 'loading' || !name) return null;
  if (!session) return <div className="container"><p style={{ marginTop: '3rem', color: '#888' }}>Not logged in.</p></div>;

  const first = raids[0]?.bosses?.[0]?.attempts?.[0];
  const cls   = first?.class;

  return (
    <>
      <Head><title>{name} — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          {selectedRaid
            ? <button className="subtle-link" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '.9rem' }}
                onClick={() => setSelected(null)}>← Back to raids</button>
            : <Link href="/dashboard" className="subtle-link">← Dashboard</Link>
          }
        </div>

        <h1 style={{ color: classColor(cls) }}>{name}</h1>
        {first && <p style={{ color: '#888', marginTop: '.25rem' }}>{first.class} · {first.role}</p>}

        {raids.length === 0
          ? <p style={{ color: '#666', marginTop: '1.5rem' }}>No raid history found.</p>
          : !selectedRaid
            ? <RaidList raids={raids} onSelect={setSelected} />
            : <RaidDetail raid={selectedRaid} name={name} />
        }
      </div>
    </>
  );
}

function RaidList({ raids, onSelect }) {
  return (
    <table className="player-table" style={{ marginTop: '1.5rem' }}>
      <thead>
        <tr>
          <th>Raid</th>
          <th>Date</th>
          <th style={{ textAlign: 'center' }}>Bosses</th>
          <th style={{ textAlign: 'center' }}>Avg Score</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {raids.map(r => {
          const allAttempts = r.bosses.flatMap(b => b.attempts);
          const avgScore = allAttempts.reduce((s, a) => s + (a.score || 0), 0) / allAttempts.length;
          const avgMax   = allAttempts.reduce((s, a) => s + (a.maxScore || 0), 0) / allAttempts.length;
          return (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(r)}>
              <td>{r.title || r.wcl_code}</td>
              <td style={{ color: '#666', fontSize: '.82rem' }}>{new Date(r.created_at).toLocaleDateString()}</td>
              <td style={{ textAlign: 'center', color: '#888' }}>{r.bosses.length}</td>
              <td style={{ textAlign: 'center' }}>
                <span style={{ color: scoreColor(avgScore, avgMax) }}>
                  {avgScore.toFixed(1)}/{avgMax.toFixed(1)}
                </span>
              </td>
              <td style={{ color: '#555', fontSize: '.82rem' }}>Details →</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RaidDetail({ raid, name }) {
  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', color: '#f5c842', marginBottom: '1rem' }}>{raid.title || raid.wcl_code}</h2>
      {raid.bosses.map(boss => (
        <div key={boss.name} style={{ marginBottom: '1.5rem' }}>
          <p className="section-label">{boss.name}</p>
          <table className="player-table">
            <thead>
              <tr>
                <th>Attempt</th>
                {PRE_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
                {POT_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
                <th style={{ textAlign: 'center' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {boss.attempts.map((a, i) => {
                const s  = a.score    ?? score(a);
                const mx = a.maxScore ?? maxScore(a);
                return (
                  <tr key={i}>
                    <td style={{ color: a.isKill ? '#4caf50' : '#888', fontSize: '.85rem' }}>
                      {a.isKill ? 'Kill' : `Wipe ${a.attempt}`}
                    </td>
                    {PRE_COLS.map(c => (
                      <td key={c.key} style={{ textAlign: 'center', color: a[c.key] ? '#4caf50' : '#555' }}>
                        {a[c.key] ? '✓' : '—'}
                      </td>
                    ))}
                    {POT_COLS.map(c => (
                      <td key={c.key} style={{ textAlign: 'center', color: a[c.key] > 0 ? '#4caf50' : '#555' }}>
                        {a[c.key] > 0 ? a[c.key] : '—'}
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
        </div>
      ))}
    </div>
  );
}

function scoreColor(score, max) {
  if (!max) return '#888';
  const pct = score / max;
  if (pct >= 1)   return '#4caf50';
  if (pct >= 0.7) return '#f5c842';
  return '#e05555';
}
