import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { RAID_ORDER, normalizeRaidName } from '../../lib/loot-raids';

const CLASS_COLORS = {
  1: '#C79C6E', 2: '#F58CBA', 3: '#ABD473', 4: '#FFF569',
  5: '#FFFFFF', 6: '#C41F3B', 7: '#0070DE', 8: '#69CCF0',
  9: '#9482C9', 10: '#00FF96', 11: '#FF7D0A',
};

const CLASS_NAMES = {
  1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue',
  5: 'Priest', 6: 'Death Knight', 7: 'Shaman', 8: 'Mage',
  9: 'Warlock', 10: 'Monk', 11: 'Druid',
};

function RollBadge({ type, isSr }) {
  if (isSr) return <span className="loot-badge loot-badge-sr">SR</span>;
  if (type === 'OS') return <span className="loot-badge loot-badge-os">OS</span>;
  return <span className="loot-badge loot-badge-ms">MS</span>;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function groupByNight(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = e.soft_res_id;
    if (!map.has(key)) map.set(key, { date: e.raid_date, entries: [] });
    map.get(key).entries.push(e);
  }
  return [...map.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function buildLeaderboard(entries) {
  const map = new Map();
  for (const e of entries) {
    const isDE = e.awarded_to === '|de|' || e.awarded_to === 'de';
    if (isDE) continue;
    const name = e.awarded_to;
    if (!map.has(name)) {
      map.set(name, {
        name,
        winner_class: e.winner_class,
        total: 0, sr: 0, ms: 0, os: 0,
      });
    }
    const p = map.get(name);
    p.total++;
    if (e.is_sr)                    p.sr++;
    else if (e.winning_roll_type === 'OS') p.os++;
    else                             p.ms++;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export default function LootView() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData]           = useState(null);
  const [error, setError]         = useState('');
  const [raid, setRaid]           = useState('All');
  const [search, setSearch]       = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [view, setView]           = useState('log'); // 'log' | 'leaderboard'
  const wowheadLoaded = useRef(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/loot/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else {
          // Normalize old raid names (SSC / TK → SSC + The Eye)
          d.entries = d.entries.map(e => ({ ...e, raid_name: normalizeRaidName(e.raid_name) }));
          setData(d);
        }
      })
      .catch(e => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!data || wowheadLoaded.current) return;
    wowheadLoaded.current = true;
    const script = document.createElement('script');
    script.src = 'https://wow.zamimg.com/widgets/power.js';
    document.head.appendChild(script);
  }, [data]);

  if (error) return (
    <div className="container" style={{ marginTop: '3rem', color: 'var(--text2)' }}>{error}</div>
  );
  if (!data) return (
    <div className="container" style={{ marginTop: '3rem', color: 'var(--text2)' }}>Loading…</div>
  );

  const { session, entries } = data;

  const availableRaids = RAID_ORDER.filter(r => entries.some(e => e.raid_name === r));

  const q = search.trim().toLowerCase();
  const filtered = entries.filter(e => {
    if (raid !== 'All' && e.raid_name !== raid) return false;
    if (q) {
      return (
        e.awarded_to.toLowerCase().includes(q) ||
        e.item_name.toLowerCase().includes(q) ||
        (e.awarded_by || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const nights       = groupByNight(filtered);
  const leaderboard  = buildLeaderboard(filtered);
  const toggleNight  = key => setCollapsed(c => ({ ...c, [key]: !c[key] }));
  const shareUrl     = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <>
      <Head>
        <title>{session.title} — Snitchbot</title>
        <script dangerouslySetInnerHTML={{ __html: 'const whTooltips = {colorLinks: false, iconSize: "small"};' }} />
      </Head>

      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/loot" className="subtle-link">← My Uploads</Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ marginBottom: '.2rem' }}>{session.title}</h1>
            <p style={{ color: 'var(--text2)', fontSize: '.85rem', margin: 0 }}>
              {entries.length} items distributed
            </p>
          </div>
          <div className="loot-share-box">
            <span style={{ color: 'var(--text3)', fontSize: '.78rem', display: 'block', marginBottom: '.3rem' }}>Shareable link</span>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <code style={{ fontSize: '.78rem', color: 'var(--text2)' }}>{shareUrl}</code>
              <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(shareUrl)} style={{ flexShrink: 0, fontSize: '.75rem' }}>
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem' }}>
          <button
            className={`loot-view-btn${view === 'log' ? ' active' : ''}`}
            onClick={() => setView('log')}
          >
            Loot Log
          </button>
          <button
            className={`loot-view-btn${view === 'leaderboard' ? ' active' : ''}`}
            onClick={() => setView('leaderboard')}
          >
            Leaderboard
          </button>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div className="tab-row" style={{ marginBottom: 0 }}>
            {['All', ...availableRaids].map(r => (
              <button
                key={r}
                className={`tab${raid === r ? ' active' : ''}`}
                onClick={() => { setRaid(r); setSearch(''); }}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="loot-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search player or item…"
          />
        </div>

        {/* ── Leaderboard view ── */}
        {view === 'leaderboard' && (
          leaderboard.length === 0
            ? <p style={{ color: 'var(--text3)', marginTop: '2rem' }}>No results.</p>
            : (
              <table className="player-table loot-table">
                <thead>
                  <tr>
                    <th style={{ width: '2rem' }}>#</th>
                    <th>Player</th>
                    <th>Class</th>
                    <th style={{ textAlign: 'center' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>
                      <span className="loot-badge loot-badge-sr" style={{ fontSize: '.65rem' }}>SR</span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span className="loot-badge loot-badge-ms" style={{ fontSize: '.65rem' }}>MS</span>
                    </th>
                    <th style={{ textAlign: 'center' }}>
                      <span className="loot-badge loot-badge-os" style={{ fontSize: '.65rem' }}>OS</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((p, i) => {
                    const color = CLASS_COLORS[p.winner_class] || 'var(--text)';
                    return (
                      <tr key={p.name}>
                        <td style={{ color: 'var(--text3)', fontSize: '.8rem' }}>{i + 1}</td>
                        <td style={{ color, fontWeight: 600 }}>{p.name}</td>
                        <td style={{ color: 'var(--text3)', fontSize: '.82rem' }}>
                          {CLASS_NAMES[p.winner_class] || '—'}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{p.total}</td>
                        <td style={{ textAlign: 'center', color: 'var(--gold)' }}>{p.sr || '—'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--green)' }}>{p.ms || '—'}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text3)' }}>{p.os || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
        )}

        {/* ── Loot log view ── */}
        {view === 'log' && (
          <>
            {nights.length === 0 && (
              <p style={{ color: 'var(--text3)', marginTop: '2rem' }}>No results.</p>
            )}
            {nights.map((night, ni) => {
              const key  = night.entries[0]?.soft_res_id || ni;
              const open = !collapsed[key];
              const nightRaids = [...new Set(night.entries.map(e => e.raid_name))].join(' + ');
              return (
                <div key={key} className="loot-night">
                  <div className="loot-night-header" onClick={() => toggleNight(key)}>
                    <span className="loot-night-arrow">{open ? '▾' : '▸'}</span>
                    <span className="loot-night-date">{formatDate(night.date)}</span>
                    {raid === 'All' && <span className="loot-night-raid">{nightRaids}</span>}
                    <span className="loot-night-count">{night.entries.length} items</span>
                  </div>
                  {open && (
                    <table className="player-table loot-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Winner</th>
                          <th>Class</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {night.entries.map(e => {
                          const isDE  = e.awarded_to === '|de|' || e.awarded_to === 'de';
                          const color = CLASS_COLORS[e.winner_class] || 'var(--text2)';
                          return (
                            <tr key={e.id} className={!e.received ? 'loot-row-unreceived' : ''}>
                              <td>
                                <a
                                  href={`https://www.wowhead.com/tbc/item=${e.item_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="loot-item-link"
                                >
                                  {e.item_name}
                                </a>
                              </td>
                              <td style={{ color: isDE ? 'var(--text3)' : color, fontStyle: isDE ? 'italic' : 'normal' }}>
                                {isDE ? 'Disenchanted' : e.awarded_to}
                              </td>
                              <td style={{ color: 'var(--text3)', fontSize: '.82rem' }}>
                                {!isDE && (CLASS_NAMES[e.winner_class] || '—')}
                              </td>
                              <td>
                                {!isDE && <RollBadge type={e.winning_roll_type} isSr={e.is_sr} />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
