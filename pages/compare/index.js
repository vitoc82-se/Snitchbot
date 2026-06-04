/**
 * /compare?a=Name&serverA=slug&regionA=EU&b=Name&serverB=slug&regionB=US
 * Side-by-side comparison of two players' WCL rankings and consumable data.
 */
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { classColor } from '../../lib/scoring';

// ── Shared helpers (duplicated from lookup/index.js for now) ─────────────────

function parseColor(pct) {
  if (pct == null || pct === 0) return '#555';
  if (pct >= 99) return '#e6cc80';
  if (pct >= 95) return '#ff8000';
  if (pct >= 75) return '#a335ee';
  if (pct >= 50) return '#0070dd';
  if (pct >= 25) return '#1eff00';
  return '#888';
}

function scoreColor(s, mx) {
  if (mx == null || mx === 0) return '#555';
  const p = s / mx;
  if (p >= 1)   return '#4caf50';
  if (p >= 0.6) return '#f5c842';
  return '#e05555';
}

function fmtMs(ms) {
  if (!ms) return '—';
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function getTier(score) {
  if (score >= 95) return { name: 'Legendary', color: '#e6cc80' };
  if (score >= 75) return { name: 'Epic',      color: '#a335ee' };
  if (score >= 50) return { name: 'Rare',      color: '#0070dd' };
  if (score >= 25) return { name: 'Uncommon',  color: '#1eff00' };
  return                  { name: 'Common',    color: '#9d9d9d' };
}

function calcCombinedRating(bosses) {
  const withRank    = bosses.filter(b => b.totalKills > 0 && b.rankPercent != null);
  const withCons    = bosses.filter(b => b.consumeScore != null && b.consumeMax > 0);
  const withEnchant = bosses.filter(b => b.enchantScore != null);
  if (!withRank.length && !withCons.length && !withEnchant.length) return null;
  const avgRank    = withRank.length    ? withRank.reduce((s,b)=>s+b.rankPercent,0)/withRank.length : null;
  const consPct    = withCons.length    ? withCons.reduce((s,b)=>s+(b.consumeScore/b.consumeMax)*100,0)/withCons.length : null;
  const enchantPct = withEnchant.length ? withEnchant.reduce((s,b)=>s+b.enchantScore,0)/withEnchant.length : null;
  let combined = 0, totalWeight = 0;
  if (avgRank    != null) { combined += avgRank    * 0.50; totalWeight += 0.50; }
  if (enchantPct != null) { combined += enchantPct * 0.30; totalWeight += 0.30; }
  if (consPct    != null) { combined += consPct    * 0.20; totalWeight += 0.20; }
  if (totalWeight > 0) combined = combined / totalWeight;
  return { combined: Math.round(combined), avgRank: avgRank != null ? Math.round(avgRank) : null, consPct: consPct != null ? Math.round(consPct) : null };
}

function ConsumeTick({ val }) {
  if (val === null || val === undefined) return <span style={{ color: '#333' }}>—</span>;
  if (val) return <span style={{ color: '#4caf50' }}>✓</span>;
  return <span style={{ color: '#e05555' }}>✗</span>;
}

// ── Player slot — handles fetch + polling for one player ─────────────────────

function usePlayerData(name, server, region) {
  const [state, setState] = useState({ phase: 'idle', profile: null, bosses: [], error: '' });

  useEffect(() => {
    if (!name || !server || !region) return;
    let cancelled = false;

    async function load() {
      setState(s => ({ ...s, phase: 'loading', error: '' }));
      try {
        // Check cache
        const cached = await fetch(
          `/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
        ).then(r => r.json());

        if (!cancelled && cached.status === 'done') {
          setState({ phase: 'done', profile: cached.profile, bosses: cached.bosses, error: '' });
          return;
        }

        // Trigger fetch
        const fetchRes = await fetch('/api/lookup/fetch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, serverSlug: server, serverRegion: region }),
        });
        const body = await fetchRes.json().catch(() => ({}));

        if (!fetchRes.ok) {
          if (!cancelled) setState(s => ({ ...s, phase: 'error', error: body.error || 'Fetch failed' }));
          return;
        }

        // Load fresh
        const fresh = await fetch(
          `/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
        ).then(r => r.json());

        if (!cancelled) {
          if (fresh.status === 'done') {
            setState({ phase: 'done', profile: fresh.profile, bosses: fresh.bosses, error: '' });
          } else {
            setState(s => ({ ...s, phase: 'error', error: fresh.error || 'Could not load data' }));
          }
        }
      } catch (err) {
        if (!cancelled) setState(s => ({ ...s, phase: 'error', error: err.message }));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [name, server, region]);

  return state;
}

// ── Slot header card ─────────────────────────────────────────────────────────

function SlotHeader({ playerData, side }) {
  const { phase, profile, bosses, error } = playerData;
  const accentColor = side === 'A' ? '#4c9fd4' : '#d47c4c';

  if (phase === 'idle') return (
    <div style={{ flex: 1, minWidth: 0, padding: '1.25rem', background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 8 }}>
      <div style={{ color: '#333', fontSize: '.88rem' }}>Player {side} — not set</div>
    </div>
  );

  if (phase === 'loading') return (
    <div style={{ flex: 1, minWidth: 0, padding: '1.25rem', background: '#0a0a0a', border: `1px solid ${accentColor}33`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: '.75rem' }}>
      <div style={{ width: 16, height: 16, border: '2px solid #333', borderTop: `2px solid ${accentColor}`, borderRadius: '50%', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
      <div style={{ color: accentColor, fontSize: '.88rem' }}>Fetching from Warcraft Logs…</div>
    </div>
  );

  if (phase === 'error') return (
    <div style={{ flex: 1, minWidth: 0, padding: '1.25rem', background: 'rgba(224,85,85,.06)', border: '1px solid rgba(224,85,85,.25)', borderRadius: 8 }}>
      <div style={{ color: '#e05555', fontSize: '.88rem' }}>{error || 'Player not found'}</div>
    </div>
  );

  if (!profile) return null;

  const rating = calcCombinedRating(bosses);
  const tier   = rating ? getTier(rating.combined) : null;
  const withKills = bosses.filter(b => b.totalKills > 0);
  const avgPct = withKills.length ? Math.round(withKills.reduce((s,b)=>s+(b.rankPercent??0),0)/withKills.length) : null;

  return (
    <div style={{ flex: 1, minWidth: 0, padding: '1.25rem', background: '#0a0a0a', border: `1px solid ${accentColor}44`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap' }}>
        <span style={{ color: classColor(profile.className), fontSize: '1.3rem', fontWeight: 700 }}>{profile.name}</span>
        {tier && <span style={{ color: tier.color, fontSize: '.8rem', fontWeight: 700 }}>{tier.name}</span>}
      </div>
      <div style={{ color: '#666', fontSize: '.8rem', marginTop: '.2rem' }}>
        {[profile.className, profile.role && profile.role.charAt(0).toUpperCase() + profile.role.slice(1), profile.guildName && `‹${profile.guildName}›`, `${profile.server} (${profile.region})`].filter(Boolean).join(' · ')}
      </div>
      {avgPct != null && (
        <div style={{ marginTop: '.5rem', display: 'flex', gap: '1rem', fontSize: '.78rem' }}>
          <span style={{ color: parseColor(avgPct) }}>{avgPct}% avg WCL</span>
          {rating?.consPct != null && <span style={{ color: '#888' }}>{rating.consPct}% consumes</span>}
        </div>
      )}
    </div>
  );
}

// ── Compare table ─────────────────────────────────────────────────────────────

function CompareTable({ playerA, playerB }) {
  const { bosses: bossesA } = playerA;
  const { bosses: bossesB } = playerB;

  // Build unified boss list — all encounter IDs from both players, sorted by zone then encounter
  const allEncs = new Map();
  for (const b of [...bossesA, ...bossesB]) {
    if (!allEncs.has(b.encounterId)) {
      allEncs.set(b.encounterId, { encounterId: b.encounterId, bossName: b.bossName, zoneId: b.zoneId, zoneName: b.zoneName });
    }
  }
  const encList = [...allEncs.values()].sort((x, y) => y.zoneId - x.zoneId || x.encounterId - y.encounterId);

  // Group by zone
  const zoneMap = {};
  for (const enc of encList) {
    if (!zoneMap[enc.zoneId]) zoneMap[enc.zoneId] = { name: enc.zoneName, encs: [] };
    zoneMap[enc.zoneId].encs.push(enc);
  }
  const zones = Object.values(zoneMap).sort((a, b) => {
    const za = a.encs[0]?.zoneId ?? 0;
    const zb = b.encs[0]?.zoneId ?? 0;
    return zb - za;
  });

  const mapA = Object.fromEntries(bossesA.map(b => [b.encounterId, b]));
  const mapB = Object.fromEntries(bossesB.map(b => [b.encounterId, b]));

  const th = (label, center) => (
    <th style={{ textAlign: center ? 'center' : 'left', fontSize: '.72rem', color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.45rem .5rem', whiteSpace: 'nowrap' }}>
      {label}
    </th>
  );

  const tdC = { textAlign: 'center', verticalAlign: 'middle', padding: '.4rem .5rem', fontSize: '.82rem' };
  const tdL = { verticalAlign: 'middle', padding: '.4rem .5rem', fontSize: '.82rem' };

  function PlayerCells({ b }) {
    if (!b) return (
      <>
        {[0,1,2,3,4,5,6,7].map(i => <td key={i} style={{ ...tdC, color: '#222' }}>—</td>)}
      </>
    );
    const noKill   = b.totalKills === 0;
    const noCons   = b.flask === null && b.battleElixir === null;
    const hasFlask = b.flask === true;
    const usedPot  = b.hastePot > 0 || b.destroPot > 0 || b.manaPot > 0;
    const weaponVal = (b.weaponOil || b.weaponStone) ? true : (b.weaponOil === false || b.weaponStone === false) ? false : null;
    return (
      <>
        <td style={{ ...tdC, color: noKill ? '#333' : '#888' }}>{noKill ? '—' : b.totalKills}</td>
        <td style={{ ...tdC, fontWeight: 700, color: parseColor(b.rankPercent) }}>{b.rankPercent != null ? Math.round(b.rankPercent) : '—'}</td>
        {noCons ? (
          [0,1,2,3,4].map(i => <td key={i} style={{ ...tdC, color: '#222' }}>—</td>)
        ) : (
          <>
            <td style={tdC}><ConsumeTick val={b.flask} /></td>
            <td style={tdC}><ConsumeTick val={hasFlask ? null : b.battleElixir} /></td>
            <td style={tdC}><ConsumeTick val={b.food} /></td>
            <td style={tdC}><ConsumeTick val={weaponVal} /></td>
            <td style={tdC}><ConsumeTick val={usedPot} /></td>
          </>
        )}
        <td style={{ ...tdC, fontWeight: 700, color: b.consumeScore != null ? scoreColor(b.consumeScore, b.consumeMax) : '#333' }}>
          {b.consumeScore != null ? `${b.consumeScore}/${b.consumeMax}` : '—'}
        </td>
      </>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {zones.map(zone => (
        <ZoneCompare key={zone.name} zone={zone} mapA={mapA} mapB={mapB} th={th} tdC={tdC} tdL={tdL} PlayerCells={PlayerCells} />
      ))}
    </div>
  );
}

function ZoneCompare({ zone, mapA, mapB, th, tdC, tdL, PlayerCells }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.65rem 1rem', cursor: 'pointer', background: open ? '#0d0d0d' : '#0a0a0a', userSelect: 'none' }}
      >
        <span style={{ color: '#444', fontSize: '.8rem', width: 14, flexShrink: 0, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>▶</span>
        <span style={{ color: '#f5c842', fontWeight: 600, fontSize: '.92rem' }}>{zone.name}</span>
      </div>

      {open && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid #1a1a1a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead>
              <tr style={{ background: '#080808', borderBottom: '1px solid #1a1a1a' }}>
                {th('Boss')}
                {/* Player A columns */}
                <th style={{ padding: '.45rem .5rem', fontSize: '.72rem', color: '#4c9fd4', textAlign: 'center', borderLeft: '2px solid #1a2a3a', whiteSpace: 'nowrap' }}>Kills A</th>
                {th('Best %', true)}{th('Flask', true)}{th('B.El', true)}{th('Food', true)}{th('Wpn', true)}{th('Pot', true)}{th('Score', true)}
                {/* Player B columns */}
                <th style={{ padding: '.45rem .5rem', fontSize: '.72rem', color: '#d47c4c', textAlign: 'center', borderLeft: '2px solid #3a2a1a', whiteSpace: 'nowrap' }}>Kills B</th>
                {th('Best %', true)}{th('Flask', true)}{th('B.El', true)}{th('Food', true)}{th('Wpn', true)}{th('Pot', true)}{th('Score', true)}
              </tr>
            </thead>
            <tbody>
              {zone.encs.map(enc => {
                const bA = mapA[enc.encounterId];
                const bB = mapB[enc.encounterId];
                const noKillA = !bA || bA.totalKills === 0;
                const noKillB = !bB || bB.totalKills === 0;
                return (
                  <tr key={enc.encounterId} style={{ borderBottom: '1px solid #111', opacity: (noKillA && noKillB) ? 0.35 : 1 }}>
                    <td style={{ ...tdL, fontWeight: 500, color: '#bbb', whiteSpace: 'nowrap' }}>{enc.bossName}</td>
                    <td style={{ borderLeft: '2px solid #1a2a3a' }}></td>
                    <PlayerCells b={bA} />
                    <td style={{ borderLeft: '2px solid #3a2a1a' }}></td>
                    <PlayerCells b={bB} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Search form ───────────────────────────────────────────────────────────────

const KNOWN_SERVERS = [
  { label: 'Thunderstrike — EU', slug: 'thunderstrike',  region: 'EU' },
  { label: 'Spineshatter — EU',  slug: 'spineshatter',   region: 'EU' },
  { label: 'Nightslayer — US',   slug: 'nightslayer',    region: 'US' },
  { label: 'Dreamscythe — US',   slug: 'dreamscythe',    region: 'US' },
];
const REGIONS = ['EU', 'US', 'KR', 'TW'];

function PlayerInput({ label, accentColor, value, onChange }) {
  const [name,   setName]   = useState(value?.name   || '');
  const [slug,   setSlug]   = useState(value?.server || 'thunderstrike');
  const [region, setRegion] = useState(value?.region || 'EU');
  const [custom, setCustom] = useState(false);

  const pickServer = (e) => {
    const v = e.target.value;
    if (v === '__custom') { setCustom(true); setSlug(''); return; }
    const m = KNOWN_SERVERS.find(s => s.slug === v);
    if (m) { setSlug(m.slug); setRegion(m.region); }
    setCustom(false);
  };

  useEffect(() => {
    onChange({ name, server: slug, region });
  }, [name, slug, region]);

  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ color: accentColor, fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '.5rem' }}>{label}</div>
      <input
        type="text" placeholder="Character name" value={name}
        onChange={e => setName(e.target.value)} autoComplete="off"
        style={{ width: '100%', fontSize: '.9rem', padding: '.5rem .65rem', marginBottom: '.4rem', borderColor: `${accentColor}44` }}
      />
      <select
        value={custom ? '__custom' : slug}
        onChange={pickServer}
        style={{ width: '100%', background: '#111', color: '#ddd', border: `1px solid ${accentColor}33`, borderRadius: 4, padding: '.5rem .65rem', fontSize: '.88rem', cursor: 'pointer' }}
      >
        {KNOWN_SERVERS.map(s => <option key={s.slug} value={s.slug}>{s.label}</option>)}
        <option value="__custom">Other (enter below)</option>
      </select>
      {custom && (
        <div style={{ display: 'flex', gap: '.4rem', marginTop: '.4rem' }}>
          <input type="text" placeholder="realm-slug" value={slug} onChange={e => setSlug(e.target.value)} style={{ flex: 1 }} />
          <select value={region} onChange={e => setRegion(e.target.value)} style={{ background: '#111', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '.5rem .65rem' }}>
            {REGIONS.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const router = useRouter();
  const { a: qA, serverA, regionA, b: qB, serverB, regionB } = router.query;

  const [slotA, setSlotA] = useState({ name: '', server: 'thunderstrike', region: 'EU' });
  const [slotB, setSlotB] = useState({ name: '', server: 'thunderstrike', region: 'EU' });
  const [committed, setCommitted] = useState(false);

  // Seed from URL params on first load
  useEffect(() => {
    if (qA && serverA && regionA) setSlotA({ name: qA, server: serverA, region: regionA });
    if (qB && serverB && regionB) setSlotB({ name: qB, server: serverB, region: regionB });
    if (qA && qB) setCommitted(true);
  }, [qA, serverA, regionA, qB, serverB, regionB]);

  const dataA = usePlayerData(committed && slotA.name ? slotA.name : null, slotA.server, slotA.region);
  const dataB = usePlayerData(committed && slotB.name ? slotB.name : null, slotB.server, slotB.region);

  const canCompare = slotA.name.trim() && slotB.name.trim();

  const handleCompare = () => {
    if (!canCompare) return;
    setCommitted(true);
    router.push(
      `/compare?a=${encodeURIComponent(slotA.name)}&serverA=${encodeURIComponent(slotA.server)}&regionA=${encodeURIComponent(slotA.region)}&b=${encodeURIComponent(slotB.name)}&serverB=${encodeURIComponent(slotB.server)}&regionB=${encodeURIComponent(slotB.region)}`,
      undefined, { shallow: true }
    );
  };

  const bothDone = dataA.phase === 'done' && dataB.phase === 'done';

  return (
    <>
      <Head><title>Compare Players — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>Compare Players</h1>
        <p style={{ color: '#666', marginTop: '.35rem', fontSize: '.88rem', maxWidth: 560 }}>
          Side-by-side WCL rankings and consumable usage for two players.
        </p>

        {/* Input form */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <PlayerInput label="Player A" accentColor="#4c9fd4" value={slotA} onChange={setSlotA} />
          <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '.25rem', color: '#333', fontWeight: 700, fontSize: '1.1rem', alignSelf: 'center' }}>vs</div>
          <PlayerInput label="Player B" accentColor="#d47c4c" value={slotB} onChange={setSlotB} />
        </div>

        <button
          className="btn"
          onClick={handleCompare}
          disabled={!canCompare}
          style={{ marginTop: '1rem' }}
        >
          Compare
        </button>

        {/* Player headers */}
        {committed && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', flexWrap: 'wrap' }}>
            <SlotHeader playerData={dataA} side="A" />
            <SlotHeader playerData={dataB} side="B" />
          </div>
        )}

        {/* Compare table */}
        {bothDone && (
          <CompareTable playerA={dataA} playerB={dataB} />
        )}

        {/* Legend */}
        {bothDone && (
          <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #161616', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '.73rem', color: '#444' }}>
            <span>
              <span style={{ color: '#4c9fd4' }}>■</span> Player A &nbsp;&nbsp;
              <span style={{ color: '#d47c4c' }}>■</span> Player B &nbsp;·&nbsp;
              Consumes based on best logged kill per boss &nbsp;·&nbsp; <span style={{ color: '#333' }}>—</span> = no kill recorded
            </span>
          </div>
        )}

        <footer className="site-footer" style={{ marginTop: '4rem' }}>
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API
        </footer>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
