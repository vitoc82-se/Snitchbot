import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';
import PlayerTable from './PlayerTable';
import PlayerPanel from './PlayerModal';
import RankingsView from './RankingsView';
import LoadingStatus, { LOAD_STEP_DELAYS } from './LoadingStatus';
import { isPrepared, missingList, classColor, DEFAULT_MANDATORY } from '../lib/scoring';

const LOOKUP_SERVERS = [
  { label: 'Thunderstrike — EU', slug: 'thunderstrike',  region: 'EU' },
  { label: 'Crusader Strike — US', slug: 'crusader-strike', region: 'US' },
  { label: 'Wild Growth — US',  slug: 'wild-growth',     region: 'US' },
  { label: 'Lone Wolf — US',    slug: 'lone-wolf',        region: 'US' },
];

function PlayerLookupTeaser() {
  const [name,   setName]   = useState('');
  const [server, setServer] = useState('thunderstrike');
  const [region, setRegion] = useState('EU');

  const pickServer = (e) => {
    const match = LOOKUP_SERVERS.find(s => s.slug === e.target.value);
    if (match) { setServer(match.slug); setRegion(match.region); }
  };

  const go = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    window.location.href = `/lookup?name=${encodeURIComponent(name.trim())}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`;
  };

  const selectStyle = {
    width: '100%', background: '#0a0a0a', color: '#ccc',
    border: '1px solid #2a2a2a', borderRadius: 4,
    padding: '.45rem .6rem', fontSize: '.82rem', cursor: 'pointer',
  };

  return (
    <form onSubmit={go} style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      <input
        type="text"
        placeholder="Character name…"
        value={name}
        onChange={e => setName(e.target.value)}
        style={{ width: '100%', fontSize: '.88rem' }}
      />
      <div style={{ display: 'flex', gap: '.4rem' }}>
        <select value={server} onChange={pickServer} style={{ ...selectStyle, flex: 1 }}>
          {LOOKUP_SERVERS.map(s => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={!name.trim()} style={{ flexShrink: 0 }}>
          Look up
        </button>
      </div>
    </form>
  );
}

function DiscordBadge({ username }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(username).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} title="Click to copy Discord username" style={{
      display: 'inline-flex', alignItems: 'center', gap: '.35rem',
      background: copied ? '#4caf50' : '#5865F2',
      border: 'none', borderRadius: 4, padding: '.2rem .55rem',
      color: '#fff', fontSize: '.78rem', fontWeight: 600,
      cursor: 'pointer', transition: 'background .2s',
      verticalAlign: 'middle', lineHeight: 1.4,
    }}>
      {/* Discord logo mark */}
      <svg width="13" height="10" viewBox="0 0 127.14 96.36" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      {copied ? 'Copied!' : username}
    </button>
  );
}

export default function SnitchbotApp({ initialCode }) {
  const [logUrl,     setLogUrl]     = useState('');
  const [results,    setResults]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [loadStep,   setLoadStep]   = useState(0);
  const [error,      setError]      = useState('');
  const [bossIndex,  setBossIndex]  = useState(0);
  const [attemptIdx, setAttemptIdx] = useState(0);
  const [view,       setView]       = useState('table');
  const [saving,      setSaving]     = useState(false);
  const [savedCodes,  setSavedCodes] = useState(new Set());
  const [tableView,   setTableView]  = useState('pre');
  const [panelPlayer, setPanelPlayer] = useState(null);
  const [mandatory,   setMandatory]  = useState(DEFAULT_MANDATORY);

  useEffect(() => {
    if (!loading) { setLoadStep(0); return; }
    const timers = LOAD_STEP_DELAYS.slice(1).map((ms, i) =>
      setTimeout(() => setLoadStep(i + 1), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  const { data: session } = useSession();

  useEffect(() => {
    if (!session) return;
    fetch('/api/reports').then(r => r.json()).then(rows => {
      setSavedCodes(new Set(rows.map(r => r.wcl_code)));
    });
    fetch('/api/settings/buffs').then(r => r.json()).then(setMandatory);
  }, [session]);

  const currentCode = logUrl.match(/reports\/([A-Za-z0-9]+)/)?.[1];
  const alreadySaved = currentCode && savedCodes.has(currentCode);

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

  const saveReport = async () => {
    if (!currentCode || alreadySaved) return;
    setSaving(true);
    try {
      const res = await fetch('/api/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, title: results.title, data: results }),
      });
      if (res.ok) {
        setSavedCodes(prev => new Set([...prev, currentCode]));
      } else {
        const body = await res.json().catch(() => ({}));
        setError(`Save failed (${res.status}): ${body.error || 'unknown error'}`);
      }
    } catch (e) { setError(`Save failed: ${e.message}`); }
    finally { setSaving(false); }
  };

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
  const prepared   = players.filter(p => isPrepared(p, mandatory));
  const unprepared = players.filter(p => !isPrepared(p, mandatory));

  return (
    <>
      <Head><title>Snitchbot</title></Head>
      <div className="container">
        <div className="top-nav">
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span className="nav-logo">Snitchbot</span>
          </Link>

          <div className="nav-center">
            <Link href="/lookup"   className="nav-link">Player Lookup</Link>
            <Link href="/readme"   className="nav-link">How it works</Link>
            <Link href="/suggest"  className="nav-link">Suggest</Link>
          </div>

          <div className="nav-user">
            {session ? (
              <>
                <img src={session.user.image} alt="" className="nav-avatar" />
                <span className="nav-username">{session.user.name}</span>
                <span className="nav-sep">·</span>
                <Link href="/dashboard" className="nav-link">Dashboard</Link>
                <Link href="/settings"  className="nav-link">Settings</Link>
                <button className="nav-signout" onClick={() => signOut()}>Sign out</button>
              </>
            ) : (
              <button className="btn btn-sm" onClick={() => signIn('discord')}>
                Login with Discord
              </button>
            )}
          </div>
        </div>
        {/* ── Tool cards ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>

          {/* Log Analyzer */}
          <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ marginBottom: '.6rem' }}>
              <div style={{ color: '#f5c842', fontWeight: 700, fontSize: '1rem' }}>Log Analyzer</div>
              <div style={{ color: '#555', fontSize: '.8rem', marginTop: '.2rem' }}>
                Paste a Warcraft Logs URL to instantly see who was missing buffs, elixirs, food and pots on every pull.
              </div>
            </div>
            <div className="input-row" style={{ margin: 0 }}>
              <input
                type="text"
                placeholder="https://fresh.warcraftlogs.com/reports/…"
                value={logUrl}
                onChange={e => setLogUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
                style={{ fontSize: '.88rem' }}
              />
              <button className="btn" onClick={analyze} disabled={loading}>
                {loading ? 'Analyzing…' : 'Check'}
              </button>
            </div>
          </div>

          {/* Player Lookup */}
          <div style={{ background: '#0d0d0d', border: '1px solid #1e1e1e', borderRadius: 8, padding: '1.25rem' }}>
            <div style={{ marginBottom: '.6rem' }}>
              <div style={{ color: '#a335ee', fontWeight: 700, fontSize: '1rem' }}>Player Lookup</div>
              <div style={{ color: '#555', fontSize: '.8rem', marginTop: '.2rem' }}>
                Search any player by name to see their WCL rankings and consumable usage across every TBC boss.
              </div>
            </div>
            <PlayerLookupTeaser />
          </div>
        </div>

        {loading && <LoadingStatus step={loadStep} />}
        {error   && <div className="error">{error}</div>}

        {results && (
          <>
            <div className="report-title-row">
              <h2 className="report-title" style={{ margin: 0 }}>{results.title}</h2>
              {session && (
                <button className="btn btn-sm" onClick={saveReport} disabled={saving || alreadySaved}>
                  {alreadySaved ? 'Saved' : saving ? 'Saving...' : 'Save Report'}
                </button>
              )}
            </div>

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
                <div className="tab-row" style={{ marginTop: '.75rem', marginBottom: '.5rem' }}>
                  <button className={`tab${tableView === 'pre' ? ' active' : ''}`} onClick={() => setTableView('pre')}>Pre-Fight</button>
                  <button className={`tab${tableView === 'combat' ? ' active' : ''}`} onClick={() => setTableView('combat')}>In-Combat</button>
                </div>
                <PlayerTable players={players} tableView={tableView} mandatory={mandatory} onPlayerClick={p => setPanelPlayer(p)} />
                {unprepared.length > 0 && (
                  <div className="summary">
                    <h3>Slackers</h3>
                    <ul>
                      {unprepared.map(p => (
                        <li key={p.name}>
                          <strong style={{ color: classColor(p.class) }}>{p.name}</strong>
                          <span className="missing-tags">
                            {missingList(p, mandatory).map(m => <span key={m} className="tag">{m}</span>)}
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
        {panelPlayer && (
          <PlayerPanel player={panelPlayer} bosses={results.bosses} mandatory={mandatory} onClose={() => setPanelPlayer(null)} />
        )}
        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API &nbsp;·&nbsp;
          TBC Anniversary (Fresh) only &nbsp;·&nbsp;
          <DiscordBadge username="vitoc" />
        </footer>
      </div>
    </>
  );
}
