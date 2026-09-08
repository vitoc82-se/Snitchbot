import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  isPrepReady, prepMissingList, potionStatus, potionCount,
  isStar, totalPotions, classColor,
} from '../lib/scoring';

const POLL_MS = 4 * 60 * 1000;   // 4 minutes
const ACTIVITY_MIN = 85;         // DPS/tanks below this active-time % = slacker

// Normalise whatever the user pastes (full URL or bare report code) into a URL
// the /api/analyze endpoint understands (it extracts /reports/<code>/).
function toLogUrl(input) {
  const v = (input || '').trim();
  if (!v) return null;
  if (/reports\/[a-zA-Z0-9]+/.test(v)) return v;
  if (/^[a-zA-Z0-9]+$/.test(v)) return `https://fresh.warcraftlogs.com/reports/${v}`;
  return v;
}

// Flatten an analyze response into all attempts (kills + wipes), newest first.
function allAttempts(data) {
  const out = [];
  (data.bosses || []).forEach(boss => {
    (boss.attempts || []).forEach(a => {
      out.push({
        key: `${boss.name}#${a.id}`,
        boss: boss.name,
        attemptId: a.id,
        isKill: !!a.isKill,
        attempt: a.attempt,
        players: a.players || [],
      });
    });
  });
  return out.sort((a, b) => b.attemptId - a.attemptId);
}

// Running "best raider" across every kill seen so far this session: the player
// who has been a star (brought everything) on the most kills, tiebroken by
// total potions used.
function topPlayerSoFar(kills) {
  const agg = {};
  kills.forEach(k => (k.players || []).forEach(p => {
    if (!agg[p.name]) agg[p.name] = { name: p.name, class: p.class, stars: 0, pots: 0 };
    agg[p.name].pots += totalPotions(p);
    if (isStar(p)) agg[p.name].stars++;
  }));
  const arr = Object.values(agg).filter(a => a.stars > 0)
    .sort((a, b) => b.stars - a.stars || b.pots - a.pots);
  return { top: arr[0] || null, totalKills: kills.length };
}

function StarPill({ p }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'rgba(245,200,66,.12)', border: '1px solid #f5c842', color: '#f5c842',
      borderRadius: 6, padding: '3px 9px', fontSize: '.82rem', fontWeight: 700,
    }}>
      <span aria-hidden>★</span>
      <span style={{ color: classColor(p.class) }}>{p.name}</span>
      {totalPotions(p) > 0 && <span style={{ color: '#9a8a60', fontWeight: 400 }}>· {totalPotions(p)} pot</span>}
    </span>
  );
}

function KillCard({ kill, isNew }) {
  const players = kill.players;
  const unprepared = players.filter(p => !isPrepReady(p));
  const noPot      = players.filter(p => potionStatus(p) === 'missing');
  const stars      = players.filter(isStar).sort((a, b) => totalPotions(b) - totalPotions(a)).slice(0, 3);

  // Activity: DPS/tanks who survived the whole fight but were active < 85%.
  const act = kill.activity;
  const lowActivity = act
    ? players
        .filter(p => (p.role === 'dps' || p.role === 'tank') && act[p.name] && act[p.name].alive && act[p.name].activity < ACTIVITY_MIN)
        .map(p => ({ ...p, activity: act[p.name].activity }))
        .sort((a, b) => a.activity - b.activity)
    : null;

  return (
    <div style={{
      background: '#131008', border: `1px solid ${isNew ? 'rgba(245,200,66,.45)' : '#2a2218'}`,
      borderRadius: 10, padding: '1.1rem 1.25rem', marginBottom: '1rem',
      boxShadow: isNew ? '0 0 24px rgba(245,200,66,.10)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '.85rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f3e9d2' }}>{kill.boss}</span>
        {kill.isKill
          ? <span style={{ background: '#274d2e', color: '#7fdc8f', fontSize: '.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Kill</span>
          : <span style={{ background: '#4a2618', color: '#e0a05a', fontSize: '.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '.08em' }}>Wipe {kill.attempt}</span>}
        {isNew && <span style={{ background: 'rgba(245,200,66,.15)', color: '#f5c842', fontSize: '.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>{kill.isKill ? 'NEW' : 'LIVE'}</span>}
        <span style={{ marginLeft: 'auto', color: '#6a5f4a', fontSize: '.8rem' }}>{players.length} players</span>
      </div>

      {/* Star players */}
      {stars.length > 0 && (
        <div style={{ marginBottom: '.9rem' }}>
          <div style={{ color: '#9a8a60', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
            Star {stars.length > 1 ? 'players' : 'player'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stars.map(p => <StarPill key={p.name} p={p} />)}
          </div>
        </div>
      )}

      {/* Unprepared */}
      <div style={{ color: '#9a8a60', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 6 }}>
        Unprepared ({unprepared.length})
      </div>
      {unprepared.length === 0 ? (
        <div style={{ color: '#5aad6f', fontSize: '.9rem', marginBottom: '.6rem' }}>Everyone came fully consumed. 🎉</div>
      ) : (
        <div className="table-wrap" style={{ marginBottom: '.6rem' }}>
          <table style={{ width: '100%', fontSize: '.88rem' }}>
            <tbody>
              {unprepared.map(p => (
                <tr key={p.name} style={{ borderTop: '1px solid #221c12' }}>
                  <td style={{ padding: '5px 8px', color: classColor(p.class), fontWeight: 600, whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td style={{ padding: '5px 8px' }}>
                    <span className="missing-tags">
                      {prepMissingList(p).map(m => (
                        <span key={m} className="tag" style={{ marginRight: 5 }}>{m}</span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* No potion */}
      <div style={{ color: '#9a8a60', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em', margin: '.4rem 0 6px' }}>
        No combat potion ({noPot.length})
      </div>
      {noPot.length === 0 ? (
        <div style={{ color: '#5aad6f', fontSize: '.9rem' }}>Everyone potted.</div>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {noPot.map(p => (
            <span key={p.name} style={{ border: '1px solid #f5c842', color: '#f5c842', borderRadius: 5, padding: '2px 8px', fontSize: '.82rem' }}>
              {p.name}
            </span>
          ))}
        </div>
      )}

      {/* Low activity (DPS/tanks, survived the whole fight, < 85% active) */}
      {lowActivity && (
        <>
          <div style={{ color: '#9a8a60', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.1em', margin: '.75rem 0 6px' }}>
            Low activity &lt; {ACTIVITY_MIN}% ({lowActivity.length}) <span style={{ textTransform: 'none', letterSpacing: 0, color: '#5f5646' }}>· DPS &amp; tanks, full fight</span>
          </div>
          {lowActivity.length === 0 ? (
            <div style={{ color: '#5aad6f', fontSize: '.9rem' }}>Everyone kept their uptime up.</div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {lowActivity.map(p => (
                <span key={p.name} style={{ border: '1px solid #d98b45', color: '#e0a05a', borderRadius: 5, padding: '2px 8px', fontSize: '.82rem' }}>
                  <span style={{ color: classColor(p.class) }}>{p.name}</span> · {p.activity}%
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LiveView({ initialCode }) {
  const [input, setInput]     = useState(initialCode || '');
  const [running, setRunning] = useState(false);
  const [status, setStatus]   = useState('');   // human-readable status line
  const [error, setError]     = useState('');
  const [title, setTitle]     = useState('');
  const [kills, setKills]     = useState([]);
  const [currentWipe, setCurrentWipe] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [newKeys, setNewKeys] = useState(new Set());

  const seenRef   = useRef(new Set());
  const timerRef  = useRef(null);
  const urlRef    = useRef(null);
  const wipeKeyRef = useRef(null);

  const poll = useCallback(async (firstRun) => {
    const logUrl = urlRef.current;
    if (!logUrl) return;
    setStatus('Checking Warcraft Logs…');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analyze failed');
      if (data.title) setTitle(data.title);

      // Attach active-time % (DPS/tank activity) to an attempt object.
      const attachActivity = async (k) => {
        try {
          const ar = await fetch('/api/activity', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logUrl, fightId: k.attemptId }),
          });
          const aj = await ar.json();
          if (ar.ok && Array.isArray(aj.players)) {
            const map = {};
            aj.players.forEach(p => { map[p.name] = { activity: p.activity, alive: p.alive }; });
            k.activity = map;
          }
        } catch (e) { /* activity stays undefined → section hidden */ }
      };

      const all       = allAttempts(data);
      const killsList = all.filter(a => a.isKill);

      // New kills → persistent log (newest first).
      const fresh = killsList.filter(k => !seenRef.current.has(k.key));
      fresh.forEach(k => seenRef.current.add(k.key));
      if (fresh.length) {
        await Promise.all(fresh.map(attachActivity));
        setKills(prev => [...fresh, ...prev]);
        if (!firstRun) setNewKeys(new Set(fresh.map(k => k.key)));
      }

      // Latest wipe: show ONE wipe card, but only while the most recent attempt
      // overall is a wipe. Once a kill lands after it, the wipe card drops.
      const latest = all[0];
      if (latest && !latest.isKill) {
        if (wipeKeyRef.current !== latest.key) {
          wipeKeyRef.current = latest.key;
          await attachActivity(latest);
          setCurrentWipe(latest);
        }
      } else if (wipeKeyRef.current !== null) {
        wipeKeyRef.current = null;
        setCurrentWipe(null);
      }

      setLastChecked(new Date());
      setError('');
      const nk = killsList.length;
      setStatus(firstRun
        ? `Watching “${data.title || logUrl}” — ${nk} kill${nk === 1 ? '' : 's'} so far.`
        : `Live — checking every 4 min.`);
    } catch (e) {
      setError(String(e.message || e));
      setStatus('Last check failed — will retry.');
    }
  }, []);

  function start() {
    const logUrl = toLogUrl(input);
    if (!logUrl) { setError('Enter a Warcraft Logs URL or report code.'); return; }
    setError(''); setKills([]); setCurrentWipe(null); setNewKeys(new Set());
    seenRef.current = new Set(); wipeKeyRef.current = null;
    urlRef.current = logUrl;
    setRunning(true);
    poll(true);
    timerRef.current = setInterval(() => poll(false), POLL_MS);
  }

  function stop() {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setStatus('Stopped.');
  }

  // Clear the NEW highlight a little after it appears.
  useEffect(() => {
    if (newKeys.size === 0) return;
    const t = setTimeout(() => setNewKeys(new Set()), 60000);
    return () => clearTimeout(t);
  }, [newKeys]);

  // Cleanup on unmount.
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  return (
    <>
      <Head><title>Snitchbot Live</title></Head>
      <div className="container">
        <div className="top-nav">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span className="nav-logo"><span className="nav-logo-mark">✦</span>Snitchbot</span>
          </Link>
          <div className="nav-center">
            <Link href="/" className="nav-link">Log Analyzer</Link>
            <Link href="/lookup" className="nav-link">Player Lookup</Link>
            <Link href="/readme" className="nav-link">How it works</Link>
          </div>
          <div className="nav-user">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: running ? '#e05555' : '#6a5f4a', fontWeight: 700, fontSize: '.82rem' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: running ? '#e05555' : '#4a4335', display: 'inline-block', boxShadow: running ? '0 0 8px #e05555' : 'none' }} />
              LIVE
            </span>
          </div>
        </div>

        <div style={{ marginTop: '.5rem', marginBottom: '1.25rem' }}>
          <h1 style={{ fontSize: '1.4rem', color: '#f3e9d2', margin: '0 0 .3rem' }}>Live raid tracker</h1>
          <p style={{ color: '#8a7a60', fontSize: '.9rem', margin: 0, lineHeight: 1.55 }}>
            Paste your live-logging Warcraft Logs report. Every 4 minutes this page checks for new boss kills and
            shows who showed up unprepared, who skipped their potion, and the best-prepared raiders. Keep this tab open.
          </p>
        </div>

        <div className="input-row" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="https://fresh.warcraftlogs.com/reports/…  (or just the code)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !running) start(); }}
            disabled={running}
            style={{ fontSize: '.88rem' }}
          />
          {!running
            ? <button className="btn" onClick={start}>Go live →</button>
            : <button className="btn" onClick={stop} style={{ borderColor: '#e05555', color: '#e05555' }}>Stop</button>}
          {running && <button className="btn btn-sm" onClick={() => poll(false)}>Check now</button>}
        </div>

        {(status || error) && (
          <div style={{ marginBottom: '1rem', fontSize: '.85rem' }}>
            {status && <span style={{ color: '#8a7a60' }}>{status}</span>}
            {lastChecked && <span style={{ color: '#6a5f4a' }}> · last checked {lastChecked.toLocaleTimeString()}</span>}
            {error && <div style={{ color: '#e05555', marginTop: 4 }}>{error}</div>}
          </div>
        )}

        {running && kills.length === 0 && !currentWipe && !error && (
          <div style={{ color: '#6a5f4a', fontSize: '.9rem', padding: '1.5rem 0' }}>
            No boss pulls logged yet. This page will update automatically when one appears.
          </div>
        )}

        {kills.length > 0 && (() => {
          const { top, totalKills } = topPlayerSoFar(kills);
          return (
            <div style={{
              background: 'linear-gradient(180deg, rgba(245,200,66,.10), rgba(245,200,66,.03))',
              border: '1px solid #b8912f', borderRadius: 10, padding: '.9rem 1.1rem', marginBottom: '1.1rem',
              display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
            }}>
              <span aria-hidden style={{ fontSize: '1.6rem', lineHeight: 1 }}>🏆</span>
              <div>
                <div style={{ color: '#f5c842', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 700 }}>
                  Top player so far
                </div>
                {top ? (
                  <div style={{ marginTop: 3 }}>
                    <span style={{ color: classColor(top.class), fontWeight: 700, fontSize: '1.15rem' }}>{top.name}</span>
                    <span style={{ color: '#9a8a60', fontSize: '.85rem' }}>
                      {' '}— fully prepped on {top.stars} of {totalKills} kill{totalKills === 1 ? '' : 's'} · {top.pots} potion{top.pots === 1 ? '' : 's'} used
                    </span>
                  </div>
                ) : (
                  <div style={{ marginTop: 3, color: '#8a7a60', fontSize: '.9rem' }}>
                    No fully-prepped raider yet — bring flask, elixirs, food, scrolls, a potion and a weapon buff to claim it.
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Current wipe: a single transient card for the latest wipe (replaced each pull, gone once a kill lands). */}
        {currentWipe && <KillCard key={'wipe:' + currentWipe.key} kill={currentWipe} isNew={true} />}

        {kills.map(k => <KillCard key={k.key} kill={k} isNew={newKeys.has(k.key)} />)}

        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU · Powered by Warcraft Logs API · TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
