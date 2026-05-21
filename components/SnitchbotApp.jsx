import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import PlayerTable from './PlayerTable';
import RankingsView from './RankingsView';
import LoadingStatus, { LOAD_STEP_DELAYS } from './LoadingStatus';
import { isPrepared, missingList, classColor } from '../lib/scoring';

export default function SnitchbotApp({ initialCode }) {
  const [logUrl,     setLogUrl]     = useState('');
  const [results,    setResults]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [loadStep,   setLoadStep]   = useState(0);
  const [error,      setError]      = useState('');
  const [bossIndex,  setBossIndex]  = useState(0);
  const [attemptIdx, setAttemptIdx] = useState(0);
  const [view,       setView]       = useState('table');

  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const timers = LOAD_STEP_DELAYS.slice(1).map((ms, i) =>
      setTimeout(() => setLoadStep(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const doAnalyze = async (url) => {
    if (!url?.trim()) return;
    setLoading(true); setError(''); setResults(null);
    setBossIndex(0); setAttemptIdx(0); setView('table');
    try {
      const res  = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logUrl: url }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  };

  const analyze = () => doAnalyze(logUrl);

  const didAutoAnalyze = useRef(false);
  useEffect(() => {
    if (initialCode && !didAutoAnalyze.current) {
      didAutoAnalyze.current = true;
      const url = `https://www.warcraftlogs.com/reports/${initialCode}`;
      setLogUrl(url);
      doAnalyze(url);
    }
  }, [initialCode]);

  const boss    = results?.bosses?.[bossIndex];
  const attempt = boss?.attempts?.[attemptIdx];
  const players = attempt?.players || [];
  const prepared   = players.filter(isPrepared);
  const unprepared = players.filter(p => !isPrepared(p));

  return (
    <>
      <Head><title>Snitchbot</title></Head>
      <div className="container">
        <h1>Snitchbot</h1>
        <p className="subtitle">
          Check who forgot their consumables ·{' '}
          <Link href="/readme" className="subtle-link">How it works</Link>
        </p>

        <div className="input-row">
          <input
            type="text"
            placeholder="Paste Warcraft Logs URL..."
            value={logUrl}
            onChange={e => setLogUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
          />
          <button className="btn" onClick={analyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Check'}
          </button>
        </div>

        {loading && <LoadingStatus step={loadStep} />}
        {error   && <div className="error">{error}</div>}

        {results && (
          <>
            <h2 className="report-title">{results.title}</h2>

            <p className="section-label">Boss</p>
            <div className="tab-row">
              {results.bosses.map((b, i) => {
                const hasKill = b.attempts.some(a => a.isKill);
                return (
                  <button key={b.name}
                    className={`tab${bossIndex === i && view === 'table' ? ' active' : ''}${hasKill ? ' has-kill' : ''}`}
                    onClick={() => { setBossIndex(i); setAttemptIdx(0); setView('table'); }}>
                    {b.name}
                    <span className={`badge ${hasKill ? 'badge-kill' : 'badge-wipe'}`}>
                      {hasKill ? 'Kill' : `${b.attempts.length}W`}
                    </span>
                  </button>
                );
              })}
              <button
                className={`tab rankings-tab${view === 'rankings' ? ' active' : ''}`}
                onClick={() => setView('rankings')}>
                Rankings
              </button>
            </div>

            {view === 'table' && boss && (
              <>
                <p className="section-label" style={{ marginTop: '1.25rem' }}>Attempt</p>
                <div className="tab-row">
                  {boss.attempts.map((a, i) => (
                    <button key={a.id}
                      className={`tab attempt-tab${attemptIdx === i ? ' active' : ''}${a.isKill ? ' kill-tab' : ' wipe-tab'}`}
                      onClick={() => setAttemptIdx(i)}>
                      {a.isKill ? 'Kill' : `Wipe ${a.attempt}`}
                    </button>
                  ))}
                </div>
              </>
            )}

            {view === 'rankings' && <RankingsView bosses={results.bosses} potionLeaderboard={results.potionLeaderboard} />}

            {view === 'table' && attempt && (
              <>
                <div className="score-bar">
                  <div className="score-good" style={{ width: `${(prepared.length / players.length) * 100}%` }}>
                    {prepared.length > 0 && `${prepared.length} ready`}
                  </div>
                  <div className="score-bad" style={{ width: `${(unprepared.length / players.length) * 100}%` }}>
                    {unprepared.length > 0 && `${unprepared.length} missing`}
                  </div>
                </div>
                <PlayerTable players={players} />
                {unprepared.length > 0 && (
                  <div className="summary">
                    <h3>Slackers</h3>
                    <ul>
                      {unprepared.map(p => (
                        <li key={p.name}>
                          <strong style={{ color: classColor(p.class) }}>{p.name}</strong>
                          <span className="missing-tags">
                            {missingList(p).map(m => <span key={m} className="tag">{m}</span>)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API &nbsp;·&nbsp;
          TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
