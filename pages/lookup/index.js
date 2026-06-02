import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { classColor } from '../../lib/scoring';

// ── Combined rating ──────────────────────────────────────────────────────────
// 60% avg WCL rank % + 40% consumable compliance rate → WoW quality tier

function calcCombinedRating(bosses) {
  const withRank = bosses.filter(b => b.totalKills > 0 && b.rankPercent != null);
  const withCons = bosses.filter(b => b.consumeScore != null && b.consumeMax > 0);
  if (!withRank.length && !withCons.length) return null;

  const avgRank    = withRank.length
    ? withRank.reduce((s, b) => s + b.rankPercent, 0) / withRank.length : 0;
  const consPct    = withCons.length
    ? withCons.reduce((s, b) => s + (b.consumeScore / b.consumeMax) * 100, 0) / withCons.length : 0;

  let combined;
  if (withRank.length && withCons.length) combined = avgRank * 0.6 + consPct * 0.4;
  else if (withRank.length)               combined = avgRank;
  else                                    combined = consPct;

  return { combined: Math.round(combined), avgRank: Math.round(avgRank), consPct: Math.round(consPct) };
}

function getTier(score) {
  if (score >= 95) return { name: 'Legendary', color: '#e6cc80', border: 'rgba(230,204,128,0.5)', bg: 'rgba(230,204,128,0.07)' };
  if (score >= 75) return { name: 'Epic',      color: '#a335ee', border: 'rgba(163,53,238,0.5)',  bg: 'rgba(163,53,238,0.07)'  };
  if (score >= 50) return { name: 'Rare',      color: '#0070dd', border: 'rgba(0,112,221,0.5)',   bg: 'rgba(0,112,221,0.07)'   };
  if (score >= 25) return { name: 'Uncommon',  color: '#1eff00', border: 'rgba(30,255,0,0.5)',    bg: 'rgba(30,255,0,0.07)'    };
  return                  { name: 'Common',    color: '#9d9d9d', border: 'rgba(157,157,157,0.3)', bg: 'rgba(157,157,157,0.05)' };
}

function RatingBadge({ bosses }) {
  const rating = calcCombinedRating(bosses);
  if (!rating) return null;
  const tier = getTier(rating.combined);
  return (
    <div style={{
      border: `1px solid ${tier.border}`,
      background: tier.bg,
      borderRadius: 8,
      padding: '.9rem 1.4rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '.2rem',
      minWidth: 120,
    }}>
      <div style={{ color: tier.color, fontSize: '1.4rem', fontWeight: 800, letterSpacing: '.04em', textShadow: `0 0 20px ${tier.color}55` }}>
        {tier.name}
      </div>
      <div style={{ color: '#555', fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.07em' }}>
        Combined Rating
      </div>
      <div style={{ color: '#444', fontSize: '.72rem', marginTop: '.15rem', textAlign: 'center' }}>
        WCL {rating.avgRank}% &nbsp;·&nbsp; Consumes {rating.consPct}%
      </div>
    </div>
  );
}

// WCL parse tier colours
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

function ConsumeTick({ val, na }) {
  if (na || val === null || val === undefined) return <span style={{ color: '#333' }}>—</span>;
  if (val) return <span style={{ color: '#4caf50' }}>✓</span>;
  return <span style={{ color: '#e05555' }}>✗</span>;
}

const REGIONS = ['EU', 'US', 'KR', 'TW'];
const KNOWN_SERVERS = [
  { label: 'Thunderstrike — EU', slug: 'thunderstrike',  region: 'EU' },
  { label: 'Crusader Strike — US', slug: 'crusader-strike', region: 'US' },
  { label: 'Wild Growth — US',  slug: 'wild-growth',     region: 'US' },
  { label: 'Lone Wolf — US',    slug: 'lone-wolf',        region: 'US' },
  { label: 'Other (enter below)', slug: '__custom',       region: 'EU' },
];

function groupByZone(bosses) {
  const map = {};
  for (const b of bosses) {
    if (!map[b.zoneId]) map[b.zoneId] = { name: b.zoneName, bosses: [] };
    map[b.zoneId].bosses.push(b);
  }
  return Object.values(map);
}

// ── Search form ──────────────────────────────────────────────────────────────

function SearchForm({ initialName, initialServer, initialRegion, onSearch, loading }) {
  const [name,   setName]   = useState(initialName   || '');
  const [slug,   setSlug]   = useState(initialServer || 'thunderstrike');
  const [region, setRegion] = useState(initialRegion || 'EU');
  const [custom, setCustom] = useState(false);

  const pickServer = (e) => {
    const v = e.target.value;
    if (v === '__custom') { setCustom(true); setSlug(''); return; }
    const m = KNOWN_SERVERS.find(s => s.slug === v);
    if (m) { setSlug(m.slug); setRegion(m.region); }
    setCustom(false);
  };

  const submit = (e) => {
    e.preventDefault();
    if (name.trim() && slug.trim()) onSearch({ name: name.trim(), server: slug.trim(), region });
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 620, marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>

        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem', letterSpacing: '.03em', textTransform: 'uppercase' }}>
            Character name
          </label>
          <input
            type="text"
            placeholder="e.g. Vitok"
            value={name}
            onChange={e => setName(e.target.value)}
            autoComplete="off"
            style={{ width: '100%', fontSize: '1rem', padding: '.6rem .75rem' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.8rem', marginBottom: '.3rem', letterSpacing: '.03em', textTransform: 'uppercase' }}>
            Realm
          </label>
          <select
            defaultValue="thunderstrike"
            onChange={pickServer}
            style={{
              width: '100%', background: '#111', color: '#ddd',
              border: '1px solid #333', borderRadius: 4,
              padding: '.6rem .75rem', fontSize: '.95rem', cursor: 'pointer',
            }}
          >
            {KNOWN_SERVERS.map(s => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>

          {custom && (
            <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
              <input
                type="text"
                placeholder="realm-slug (from WCL URL)"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                style={{ flex: 1 }}
              />
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                style={{
                  background: '#111', color: '#ddd', border: '1px solid #333',
                  borderRadius: 4, padding: '.6rem .75rem', fontSize: '.9rem',
                }}
              >
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
          )}
          {custom && (
            <p style={{ color: '#555', fontSize: '.75rem', margin: '.35rem 0 0' }}>
              Find your slug at: fresh.warcraftlogs.com/character/<strong style={{ color: '#888' }}>eu/thunderstrike</strong>/yourname
            </p>
          )}
        </div>

        <button
          className="btn"
          type="submit"
          disabled={loading || !name.trim() || !slug.trim()}
          style={{ alignSelf: 'flex-start', minWidth: 120 }}
        >
          {loading ? '↻ Looking up…' : 'Look up'}
        </button>
      </div>
    </form>
  );
}

// ── Loading state ─────────────────────────────────────────────────────────────

function LoadingState({ msg }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 600);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{
        width: 20, height: 20, border: '2px solid #333',
        borderTop: '2px solid #f5c842', borderRadius: '50%',
        animation: 'spin 0.9s linear infinite', flexShrink: 0,
      }} />
      <div>
        <div style={{ color: '#f5c842', fontWeight: 600, fontSize: '.95rem' }}>{msg}{dots}</div>
        <div style={{ color: '#555', fontSize: '.78rem', marginTop: '.2rem' }}>
          First-time lookups take 20–60 seconds while we fetch from Warcraft Logs
        </div>
      </div>
    </div>
  );
}

// ── Player results ────────────────────────────────────────────────────────────

function StatCard({ value, label, sub, color }) {
  return (
    <div style={{
      background: '#0d0d0d', border: '1px solid #222', borderRadius: 6,
      padding: '1rem 1.25rem', minWidth: 130, flex: '1 1 130px',
    }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: color || '#ddd', lineHeight: 1.2 }}>
        {value ?? '—'}
      </div>
      <div style={{ color: '#666', fontSize: '.78rem', marginTop: '.25rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      {sub && <div style={{ color: '#444', fontSize: '.72rem', marginTop: '.15rem' }}>{sub}</div>}
    </div>
  );
}

function BossRow({ b }) {
  const noKill  = b.totalKills === 0;
  const noCons  = b.flask === null && b.battleElixir === null;
  const hasFlask = b.flask === true;
  const usedPot  = b.hastePot > 0 || b.destroPot > 0 || b.manaPot > 0;
  const weaponVal = (b.weaponOil || b.weaponStone)
    ? true
    : (b.weaponOil === false || b.weaponStone === false) ? false : null;

  const tdCenter = { textAlign: 'center', verticalAlign: 'middle' };

  return (
    <tr style={{ opacity: noKill ? 0.35 : 1 }}>
      <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
        {b.reportCode && !noKill ? (
          <a href={`https://fresh.warcraftlogs.com/reports/${b.reportCode}`}
            target="_blank" rel="noreferrer"
            style={{ color: '#ddd', textDecoration: 'none' }}
            title="Open best kill in WCL">
            {b.bossName} <span style={{ color: '#444', fontSize: '.75rem' }}>↗</span>
          </a>
        ) : <span style={{ color: noKill ? '#555' : '#ddd' }}>{b.bossName}</span>}
      </td>

      <td style={{ ...tdCenter, color: noKill ? '#333' : '#888' }}>{b.totalKills || '—'}</td>
      <td style={{ ...tdCenter, fontWeight: 700, color: parseColor(b.rankPercent) }}>
        {b.rankPercent != null ? Math.round(b.rankPercent) : '—'}
      </td>
      <td style={{ ...tdCenter, color: parseColor(b.medianPercent) }}>
        {b.medianPercent != null ? Math.round(b.medianPercent) : '—'}
      </td>
      <td style={{ ...tdCenter, color: '#888' }}>
        {b.bestAmount != null ? Number(b.bestAmount).toFixed(1) : '—'}
      </td>
      <td style={{ ...tdCenter, color: '#555', fontSize: '.82rem' }}>{fmtMs(b.fastestKill)}</td>

      {noCons ? (
        [0,1,2,3,4,5].map(i => (
          <td key={i} style={{ ...tdCenter, color: '#222', fontSize: '.8rem' }}>—</td>
        ))
      ) : (
        <>
          <td style={tdCenter}><ConsumeTick val={b.flask} /></td>
          <td style={tdCenter}><ConsumeTick val={hasFlask ? null : b.battleElixir} /></td>
          <td style={tdCenter}><ConsumeTick val={hasFlask ? null : b.guardianElixir} /></td>
          <td style={tdCenter}><ConsumeTick val={b.food} /></td>
          <td style={tdCenter}><ConsumeTick val={weaponVal} /></td>
          <td style={tdCenter}><ConsumeTick val={usedPot} /></td>
        </>
      )}

      <td style={{
        ...tdCenter, fontWeight: 700, fontSize: '.85rem',
        color: b.consumeScore != null ? scoreColor(b.consumeScore, b.consumeMax) : '#333',
      }}>
        {b.consumeScore != null ? `${b.consumeScore}/${b.consumeMax}` : '—'}
      </td>
    </tr>
  );
}

function ZoneSection({ zone, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  // Zone-level summary stats
  const withKills = zone.bosses.filter(b => b.totalKills > 0);
  const withCons  = zone.bosses.filter(b => b.consumeScore != null && b.consumeMax > 0);
  const kills     = withKills.length;
  const avgRank   = kills
    ? Math.round(withKills.reduce((s, b) => s + (b.rankPercent ?? 0), 0) / kills)
    : null;
  const consRate  = withCons.length
    ? Math.round(withCons.reduce((s, b) => s + (b.consumeScore / b.consumeMax) * 100, 0) / withCons.length)
    : null;
  const fullCount = withCons.filter(b => b.consumeScore === b.consumeMax).length;

  const th = (label, center) => (
    <th key={label} style={{ textAlign: center ? 'center' : 'left', whiteSpace: 'nowrap', fontSize: '.75rem', color: '#555', textTransform: 'uppercase', letterSpacing: '.04em', padding: '.5rem .6rem' }}>
      {label}
    </th>
  );

  return (
    <div style={{ marginTop: '1rem', border: '1px solid #1a1a1a', borderRadius: 6, overflow: 'hidden' }}>

      {/* Clickable summary row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '.75rem 1rem', cursor: 'pointer',
          background: open ? '#0d0d0d' : '#0a0a0a',
          userSelect: 'none',
        }}
      >
        {/* Chevron */}
        <span style={{ color: '#444', fontSize: '.8rem', width: 14, flexShrink: 0, transition: 'transform .2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>
          ▶
        </span>

        {/* Zone name */}
        <span style={{ color: '#f5c842', fontWeight: 600, fontSize: '.95rem', flex: '0 0 auto', minWidth: 160 }}>
          {zone.name}
        </span>

        {/* Boss kill count */}
        <span style={{ color: kills > 0 ? '#4caf50' : '#444', fontSize: '.82rem', flex: '0 0 auto' }}>
          {kills}/{zone.bosses.length} kills
        </span>

        {/* Avg WCL % */}
        {avgRank != null && (
          <span style={{ color: parseColor(avgRank), fontWeight: 700, fontSize: '.88rem', flex: '0 0 auto' }}>
            {avgRank}% avg
          </span>
        )}

        {/* Consume rate */}
        {consRate != null && (
          <span style={{ color: consRate >= 80 ? '#4caf50' : consRate >= 50 ? '#f5c842' : '#e05555', fontSize: '.82rem', flex: '0 0 auto' }}>
            {fullCount}/{withCons.length} full consumes
          </span>
        )}

        {/* Mini tier badge */}
        {avgRank != null && consRate != null && (() => {
          const combined = Math.round(avgRank * 0.6 + consRate * 0.4);
          const t = getTier(combined);
          return (
            <span style={{ color: t.color, fontSize: '.78rem', fontWeight: 700, marginLeft: 'auto', letterSpacing: '.04em' }}>
              {t.name}
            </span>
          );
        })()}

        {kills === 0 && (
          <span style={{ color: '#333', fontSize: '.78rem', marginLeft: 'auto' }}>not yet cleared</span>
        )}
      </div>

      {/* Expandable detail table */}
      {open && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid #1a1a1a' }}>
          <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1a1a1a', background: '#080808' }}>
                {th('Boss')}
                {th('Kills',    true)}
                {th('Best %',   true)}
                {th('Median %', true)}
                {th('Best',     true)}
                {th('Fastest',  true)}
                {th('Flask',    true)}
                {th('B. Elix',  true)}
                {th('G. Elix',  true)}
                {th('Food',     true)}
                {th('Weapon',   true)}
                {th('Pot',      true)}
                {th('Score',    true)}
              </tr>
            </thead>
            <tbody>
              {zone.bosses.map(b => <BossRow key={b.encounterId} b={b} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerProfile({ profile, bosses, onRefresh, refreshing }) {
  const zones = groupByZone(bosses);
  const withKills = bosses.filter(b => b.totalKills > 0);
  const withCons  = bosses.filter(b => b.consumeScore != null);

  const avgPct   = withKills.length
    ? Math.round(withKills.reduce((s, b) => s + (b.rankPercent ?? 0), 0) / withKills.length)
    : null;
  const avgScore = withCons.length
    ? (withCons.reduce((s, b) => s + b.consumeScore, 0) / withCons.length).toFixed(1)
    : null;
  const avgMax   = withCons.length
    ? (withCons.reduce((s, b) => s + b.consumeMax,   0) / withCons.length).toFixed(1)
    : null;
  const fullRate = withCons.length
    ? Math.round((withCons.filter(b => b.consumeScore === b.consumeMax).length / withCons.length) * 100)
    : null;

  const fetchedAgoMin = profile.fetchedAt
    ? Math.round((Date.now() - new Date(profile.fetchedAt).getTime()) / 60000)
    : null;

  return (
    <div style={{ marginTop: '2.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: classColor(profile.className), margin: 0, fontSize: '1.8rem', letterSpacing: '-.01em' }}>
            {profile.name}
          </h2>
          <div style={{ marginTop: '.35rem', color: '#888', fontSize: '.88rem' }}>
            {[
              profile.className,
              profile.role && profile.role.charAt(0).toUpperCase() + profile.role.slice(1),
              profile.guildName && `‹${profile.guildName}›`,
              `${profile.server} (${profile.region})`,
            ].filter(Boolean).join('  ·  ')}
          </div>
          {fetchedAgoMin != null && (
            <div style={{ color: '#444', fontSize: '.72rem', marginTop: '.3rem' }}>
              Based on best logged kill per boss &nbsp;·&nbsp;
              Updated {fetchedAgoMin < 60 ? `${fetchedAgoMin}m` : `${Math.round(fetchedAgoMin / 60)}h`} ago
            </div>
          )}
        </div>
        <button
          className="btn btn-sm"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? '↻ Refreshing…' : '↻ Refresh data'}
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginTop: '1.5rem', alignItems: 'stretch' }}>
        <RatingBadge bosses={bosses} />
        <StatCard
          value={avgScore != null ? `${avgScore}/${avgMax}` : '—'}
          label="Avg consume score"
          sub={`${withCons.length} bosses checked`}
          color={avgScore != null ? scoreColor(Number(avgScore), Number(avgMax)) : '#555'}
        />
        <StatCard
          value={avgPct != null ? `${avgPct}%` : '—'}
          label="Avg WCL rank"
          sub={`${withKills.length} bosses with kills`}
          color={parseColor(avgPct)}
        />
        <StatCard value={withKills.length} label="Boss kills tracked" />
        <StatCard
          value={fullRate != null ? `${fullRate}%` : '—'}
          label="Full score rate"
          sub="perfect consumes"
          color={fullRate >= 80 ? '#4caf50' : fullRate >= 50 ? '#f5c842' : '#e05555'}
        />
      </div>

      {/* Per-zone boss tables — first zone with kills is open by default */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        {zones.map((z, i) => {
          const hasKills = z.bosses.some(b => b.totalKills > 0);
          const firstWithKills = zones.findIndex(z2 => z2.bosses.some(b => b.totalKills > 0));
          return <ZoneSection key={z.name} zone={z} defaultOpen={i === firstWithKills} />;
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #161616', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '.73rem', color: '#444' }}>
        <span>Rank %:&nbsp;
          {[['≥99','#e6cc80'],['≥95','#ff8000'],['≥75','#a335ee'],['≥50','#0070dd'],['≥25','#1eff00'],['&lt;25','#888']].map(([l,c]) => (
            <span key={l} style={{ color: c, marginRight: '.5rem' }} dangerouslySetInnerHTML={{ __html: l }} />
          ))}
        </span>
        <span>Consumes based on best logged kill per boss &nbsp;·&nbsp; <span style={{ color: '#333' }}>—</span> = no kill recorded</span>
      </div>
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function LookupPage() {
  const router = useRouter();

  const [phase,      setPhase]      = useState('idle');   // idle | loading | done | error
  const [profile,    setProfile]    = useState(null);
  const [bosses,     setBosses]     = useState([]);
  const [errorMsg,   setErrorMsg]   = useState('');
  const [statusMsg,  setStatusMsg]  = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { name: qName, server: qServer, region: qRegion } = router.query;

  const doLookup = useCallback(async ({ name, server, region }) => {
    setPhase('loading');
    setErrorMsg('');
    setStatusMsg('Checking cache…');

    try {
      // 1. Check cache
      const cached = await fetch(
        `/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
      ).then(r => r.json());

      if (cached.status === 'done') {
        setProfile(cached.profile);
        setBosses(cached.bosses);
        setPhase('done');
        return;
      }

      // 2. Trigger WCL fetch
      setStatusMsg('Fetching from Warcraft Logs…');
      const fetchRes = await fetch('/api/lookup/fetch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, serverSlug: server, serverRegion: region }),
      });
      const fetchBody = await fetchRes.json().catch(() => ({}));

      if (!fetchRes.ok) {
        setErrorMsg(fetchBody.error || `Server error (${fetchRes.status})`);
        setPhase('error');
        return;
      }

      // 3. Load fresh data
      setStatusMsg('Loading results…');
      const fresh = await fetch(
        `/api/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`
      ).then(r => r.json());

      if (fresh.status === 'done') {
        setProfile(fresh.profile);
        setBosses(fresh.bosses);
        setPhase('done');
      } else {
        setErrorMsg(fresh.error || 'Data fetched but could not be loaded. Try again.');
        setPhase('error');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Unexpected error');
      setPhase('error');
    }
  }, []);

  // Auto-search from URL params
  useEffect(() => {
    if (qName && qServer && qRegion && phase === 'idle') {
      doLookup({ name: qName, server: qServer, region: qRegion });
    }
  }, [qName, qServer, qRegion, phase, doLookup]);

  const handleSearch = ({ name, server, region }) => {
    router.push(
      `/lookup?name=${encodeURIComponent(name)}&server=${encodeURIComponent(server)}&region=${encodeURIComponent(region)}`,
      undefined, { shallow: true }
    );
    doLookup({ name, server, region });
  };

  const handleRefresh = async () => {
    if (!profile || refreshing) return;
    setRefreshing(true);
    try {
      await fetch('/api/lookup/fetch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: profile.name, serverSlug: profile.server, serverRegion: profile.region }),
      });
      const fresh = await fetch(
        `/api/lookup?name=${encodeURIComponent(profile.name)}&server=${encodeURIComponent(profile.server)}&region=${encodeURIComponent(profile.region)}`
      ).then(r => r.json());
      if (fresh.status === 'done') {
        setProfile(fresh.profile);
        setBosses(fresh.bosses);
      }
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Head><title>Player Lookup — Snitchbot</title></Head>
      <div className="container">

        {/* Nav */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        {/* Header */}
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em', margin: 0 }}>
          Player Lookup
        </h1>
        <p style={{ color: '#666', marginTop: '.4rem', fontSize: '.9rem', maxWidth: 560 }}>
          See any player's WCL rankings and consumable usage across every TBC boss.
          First lookup: 20–60 s. After that, instant.
        </p>

        <SearchForm
          initialName={qName}
          initialServer={qServer}
          initialRegion={qRegion}
          onSearch={handleSearch}
          loading={phase === 'loading' || refreshing}
        />

        {phase === 'loading' && <LoadingState msg={statusMsg} />}

        {phase === 'error' && (
          <div style={{
            marginTop: '1.5rem', padding: '.85rem 1rem',
            background: 'rgba(224,85,85,.1)', border: '1px solid rgba(224,85,85,.3)',
            borderRadius: 6, color: '#e05555', fontSize: '.9rem',
          }}>
            {errorMsg}
          </div>
        )}

        {phase === 'done' && profile && (
          <PlayerProfile
            profile={profile}
            bosses={bosses}
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        <footer className="site-footer" style={{ marginTop: '4rem' }}>
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API
        </footer>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}
