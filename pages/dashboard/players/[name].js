import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { classColor, score, maxScore, weaponBuffType, DEFAULT_MANDATORY } from '../../../lib/scoring';
import { PRE_COLS, POT_COLS } from '../../../lib/constants';

export default function PlayerDetail() {
  const { data: session, status } = useSession();
  const router  = useRouter();
  const { name } = router.query;
  const [raids,     setRaids]     = useState([]);
  const [mandatory, setMandatory] = useState(DEFAULT_MANDATORY);
  const [selectedRaid, setSelected] = useState(null);

  useEffect(() => {
    if (!session || !name) return;
    fetch(`/api/players/${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(({ raids, mandatory }) => {
        setRaids(raids);
        setMandatory(mandatory);
      });
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
            : <RaidDetail raid={selectedRaid} mandatory={mandatory} />
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
          // Use kill attempt per boss (or last attempt) — matches RaidDetail logic.
          // ref.score / ref.maxScore are pre-calculated by the API using the user's mandatory settings.
          const bossScores = r.bosses.map(b => {
            const ref = b.attempts.find(a => a.isKill) ?? b.attempts[b.attempts.length - 1];
            return { score: ref.score || 0, maxScore: ref.maxScore || 0 };
          });
          const avgScore = bossScores.reduce((s, b) => s + b.score, 0) / bossScores.length;
          const avgMax   = bossScores.reduce((s, b) => s + b.maxScore, 0) / bossScores.length;
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

function RaidDetail({ raid, mandatory }) {
  // One row per boss, using the kill attempt as the source of truth.
  // Pre-fight buffs are stable across attempts; pots reflect what was used on the kill.
  const rows = raid.bosses.map(boss => {
    const isKill = boss.attempts.some(a => a.isKill);
    const result = isKill ? 'Kill' : `${boss.attempts.length}W`;
    const ref = boss.attempts.find(a => a.isKill) ?? boss.attempts[boss.attempts.length - 1];
    // Score with the user's mandatory settings (same mandatory the API used for ref.score,
    // but we recalculate client-side so the weapon column visibility is also respected).
    const s  = score(ref, mandatory);
    const mx = maxScore(ref, mandatory);
    return { boss: boss.name, result, isKill, ref, s, mx };
  });

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', color: '#f5c842', marginBottom: '1rem' }}>{raid.title || raid.wcl_code}</h2>
      <table className="player-table" style={{ fontSize: '.82rem' }}>
        <thead>
          <tr>
            <th>Boss</th>
            <th style={{ textAlign: 'center' }}>Result</th>
            {PRE_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
            {POT_COLS.map(c => <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>)}
            <th style={{ textAlign: 'center' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.boss}>
              <td style={{ whiteSpace: 'nowrap' }}>{r.boss}</td>
              <td style={{ textAlign: 'center', color: r.isKill ? '#4caf50' : '#888' }}>{r.result}</td>
              {PRE_COLS.map(c => {
                const wbType = weaponBuffType(r.ref);
                const na = (c.key === 'weapon_oil'   && wbType !== 'oil')
                        || (c.key === 'weapon_stone' && wbType !== 'stone');
                const val = r.ref[c.key];
                return (
                  <td key={c.key} style={{ textAlign: 'center',
                    color: na ? '#555' : val ? '#4caf50' : '#e05555' }}>
                    {na ? '—' : val ? '✓' : '✗'}
                  </td>
                );
              })}
              {POT_COLS.map(c => {
                const val = r.ref[c.key] || 0;
                return (
                  <td key={c.key} style={{ textAlign: 'center', color: val > 0 ? '#4caf50' : '#555' }}>
                    {val > 0 ? val : '—'}
                  </td>
                );
              })}
              <td style={{ textAlign: 'center', color: r.s === r.mx ? '#4caf50' : r.s === 0 ? '#e05555' : '#f5c842', fontWeight: 'bold' }}>
                {r.s}/{r.mx}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
