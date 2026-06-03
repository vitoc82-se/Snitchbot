import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { POT_COLS } from '../lib/constants';
import { relevantPotKeys } from '../lib/scoring';

const ROLE_ROWS = [
  { role: 'Healer (all classes)',          pots: relevantPotKeys('Priest', 'healer') },
  { role: 'Tank (non-Paladin)',            pots: relevantPotKeys('Warrior', 'tank') },
  { role: 'Tank Paladin',                  pots: relevantPotKeys('Paladin', 'tank') },
  { role: 'Warrior DPS',                   pots: relevantPotKeys('Warrior', 'dps') },
  { role: 'Rogue',                          pots: relevantPotKeys('Rogue', 'dps') },
  { role: 'Hunter',                         pots: relevantPotKeys('Hunter', 'dps') },
  { role: 'Retribution Paladin',           pots: relevantPotKeys('Paladin', 'dps') },
  { role: 'Mage',                           pots: relevantPotKeys('Mage', 'dps') },
  { role: 'Warlock',                        pots: relevantPotKeys('Warlock', 'dps') },
  { role: 'Shadow Priest',                  pots: relevantPotKeys('Priest', 'dps') },
  { role: 'Shaman DPS (Enh / Elemental)',  pots: relevantPotKeys('Shaman', 'dps') },
  { role: 'Druid DPS (Feral / Balance)',   pots: relevantPotKeys('Druid', 'dps') },
];

const POT_LABEL = Object.fromEntries(POT_COLS.map(c => [c.key, c.label]));

const FOOD_IDS_LIST = [
  { name: 'Skullfish Soup', id: 33825, note: 'Buff name lacks "well fed" — detected by spell ID' },
  { name: 'Enlightened',    id: 43722, note: 'Detected by spell ID' },
];

const FLASK_IDS_LIST = [
  { name: 'Flask of Distilled Wisdom',     id: 17627, note: 'Buff name lacks "flask" — detected by ID' },
  { name: 'Flask of Chromatic Resistance', id: 17629, note: 'Buff is "Chromatic Resistance" — detected by ID' },
  { name: 'Flask of Supreme Power',        id: 17628, note: '+150 spell damage — buff aura ID (not the item-use spell ID)' },
];

const ELIXIRS = [
  { name: 'Elixir of Major Agility',      type: 'Battle',   id: 28497 },
  { name: 'Elixir of Healing Power',      type: 'Battle',   id: 28491 },
  { name: 'Elixir of Major Firepower',    type: 'Battle',   id: 28501 },
  { name: 'Elixir of Major Shadow Power', type: 'Battle',   id: 28503 },
  { name: 'Elixir of Major Frost Power',  type: 'Battle',   id: 28493 },
  { name: "Adept's Elixir",               type: 'Battle',   id: 33721 },
  { name: 'Greater Arcane Elixir',        type: 'Battle',   id: 17539 },
  { name: 'Elixir of the Mongoose',       type: 'Battle',   id: 17538 },
  { name: 'Elixir of Ironskin',           type: 'Guardian', id: 39625 },
  { name: 'Elixir of Major Defense',      type: 'Guardian', id: 28502 },
  { name: 'Elixir of Major Mageblood',    type: 'Guardian', id: 28509 },
  { name: 'Elixir of Draenic Wisdom',     type: 'Guardian', id: 39627 },
  { name: 'Elixir of the Sages',          type: 'Guardian', id: 17535 },
  { name: 'Gift of Arthas',               type: 'Guardian', id: 11371 },
];

const POTIONS = [
  { name: 'Haste Potion',           key: 'haste_potion',       ids: [28507] },
  { name: 'Insane Strength Potion', key: 'haste_potion',       ids: [28494], note: 'counted as Haste Pot' },
  { name: 'Destruction Potion',     key: 'destruction_potion', ids: [28508] },
  { name: 'Super Mana Potion',      key: 'mana_potion',        ids: [28499] },
  { name: 'Major Mana Potion',      key: 'mana_potion',        ids: [17531] },
  { name: 'Fel Mana Potion',        key: 'mana_potion',        ids: [41617, 41618] },
  { name: 'Dark Rune',              key: 'mana_potion',        ids: [20520] },
  { name: 'Demonic Rune',           key: 'mana_potion',        ids: [16666] },
  { name: 'Healthstone',            key: 'healthstone',        ids: [27237, 27232, 27230, 11730, 11729, 6263, 6262], note: 'tracked, not scored' },
];

const WEAPON_BUFFS = [
  { name: 'Brilliant Wizard Oil',  type: 'Oil',   enchantId: 2628, note: 'confirmed' },
  { name: 'Brilliant Mana Oil',    type: 'Oil',   enchantId: 2629, note: 'confirmed' },
  { name: 'Unknown Oil',           type: 'Oil',   enchantId: 2678, note: 'confirmed from live logs' },
  { name: 'Superior Wizard Oil',   type: 'Oil',   enchantId: 2650, note: 'unconfirmed' },
  { name: 'Unknown Stone (tank)',  type: 'Stone', enchantId: 2955, note: 'confirmed from live logs' },
];

const API_ROUTES = [
  { route: '/api/analyze',          method: 'POST',     auth: 'None',     desc: 'Fetch & analyze a WCL report. Returns full bosses/players JSON.' },
  { route: '/api/admin',            method: 'GET',      auth: 'Password', desc: 'Returns Redis-stored usage stats (total analyses, log URLs).' },
  { route: '/api/auth/[...nextauth]', method: 'GET/POST', auth: '—',      desc: 'NextAuth.js handler. Discord OAuth callback lives here.' },
  { route: '/api/reports',          method: 'GET',      auth: 'JWT',      desc: 'List all saved reports for the current user.' },
  { route: '/api/reports/save',     method: 'POST',     auth: 'JWT',      desc: 'Save a report (or no-op if already saved — UNIQUE constraint).' },
  { route: '/api/reports/[id]',     method: 'GET',      auth: 'JWT',      desc: 'Fetch a single saved report by UUID.' },
  { route: '/api/reports/[id]',     method: 'DELETE',   auth: 'JWT',      desc: 'Delete a report. Player history from that raid disappears.' },
  { route: '/api/players',          method: 'GET',      auth: 'JWT',      desc: 'Aggregated player roster across all saved reports.' },
  { route: '/api/players/[name]',   method: 'GET',      auth: 'JWT',      desc: 'Full raid-by-raid history for a single player.' },
  { route: '/api/settings/buffs',   method: 'GET',      auth: 'JWT',      desc: 'Get mandatory buff settings (or DEFAULT_MANDATORY if unset).' },
  { route: '/api/settings/buffs',   method: 'POST',     auth: 'JWT',      desc: 'Save mandatory buff settings for the current user.' },
  { route: '/api/lookup',           method: 'GET',      auth: 'None',     desc: 'Get cached player profile + boss data (?name=X&server=Y&region=Z). Returns fetch_status.' },
  { route: '/api/lookup/fetch',     method: 'POST',     auth: 'None',     desc: 'Trigger fresh WCL lookup for a player. Creates/updates player_lookup_profiles + bosses.' },
  { route: '/api/suggestions/submit', method: 'POST',  auth: 'None',     desc: 'Submit a new consumable suggestion.' },
  { route: '/api/suggestions',      method: 'GET',      auth: 'Password', desc: 'List all suggestions (admin only).' },
  { route: '/api/debug_gear',       method: 'GET',      auth: 'None',     desc: 'Show weapon enchant IDs from a log (?code=XXX). Dev tool.' },
  { route: '/api/debug_potions',    method: 'GET',      auth: 'None',     desc: 'Show potion cast events from a log (?code=XXX). Dev tool.' },
  { route: '/api/debug_timestamps', method: 'GET',      auth: 'None',     desc: 'Show fight timestamps from a log (?code=XXX). Dev tool.' },
  { route: '/api/debug_auras',      method: 'GET',      auth: 'None',     desc: 'Show CombatantInfo aura IDs for a player (?code=XXX&player=name). Dev tool.' },
];

const ENV_VARS = [
  { key: 'WCL_CLIENT_ID',              desc: 'Warcraft Logs API client ID',                      where: 'warcraftlogs.com/api/clients' },
  { key: 'WCL_CLIENT_SECRET',          desc: 'Warcraft Logs API client secret',                   where: 'warcraftlogs.com/api/clients' },
  { key: 'DISCORD_CLIENT_ID',          desc: 'Discord OAuth app client ID',                       where: 'Discord Developer Portal' },
  { key: 'DISCORD_CLIENT_SECRET',      desc: 'Discord OAuth app client secret',                   where: 'Discord Developer Portal' },
  { key: 'NEXTAUTH_URL',               desc: 'Full URL of the site (e.g. https://new.snitchbot.app)', where: 'Set manually per environment' },
  { key: 'NEXTAUTH_SECRET',            desc: 'Any long random string — signs the JWT session cookies', where: 'Generate randomly' },
  { key: 'DATABASE_URL',               desc: 'Neon Postgres connection string (full URL with SSL params)', where: 'Neon dashboard' },
  { key: 'UPSTASH_REDIS_REST_URL',     desc: 'Upstash Redis REST endpoint',                       where: 'Upstash dashboard' },
  { key: 'UPSTASH_REDIS_REST_TOKEN',   desc: 'Upstash Redis auth token',                          where: 'Upstash dashboard' },
  { key: 'ADMIN_PASSWORD',             desc: 'Password for the /admin page',                       where: 'Set manually' },
];

// ── Shared components ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <section className="readme-section">
      <h2 className="readme-h2">{title}</h2>
      {children}
    </section>
  );
}

// ── Dev-specific components ────────────────────────────────────────────────────

function CodeBlock({ children }) {
  return <pre className="dev-codeblock"><code>{children}</code></pre>;
}

function PipelineStep({ num, title, children }) {
  return (
    <div className="dev-pipeline-step">
      <div className="dev-pipeline-num">{num}</div>
      <div className="dev-pipeline-body">
        <div className="dev-pipeline-title">{title}</div>
        <div className="dev-pipeline-desc">{children}</div>
      </div>
    </div>
  );
}

function ArchBox({ label, sub, color, wide }) {
  return (
    <div className="dev-arch-box" style={{ borderColor: color || '#2a2a2a', minWidth: wide ? 260 : 130 }}>
      <div className="dev-arch-label" style={{ color: color || '#ddd' }}>{label}</div>
      {sub && <div className="dev-arch-sub">{sub}</div>}
    </div>
  );
}

// ── How It Works (existing readme content) ────────────────────────────────────

function HowItWorks() {
  return (
    <>
      <h1>How It Works</h1>
      <p className="subtitle">Snitchbot — TBC consumable tracker for raid leaders</p>

      <Section title="What Is Snitchbot?">
        <p>
          Snitchbot reads a <strong>Warcraft Logs</strong> raid report and tells you exactly who showed up
          without their consumables. Paste a log URL, click Check, and within seconds you see every player
          colour-coded: <span className="check">green = came prepared</span>, <span className="cross">red = missing something</span>.
        </p>
        <p>
          No login required to check a log. Login with Discord to unlock saved raids and player history.
        </p>
      </Section>

      <Section title="Reading the Table">
        <p>
          After analyzing a log, the table is split into two views you can switch between:
        </p>
        <ul>
          <li><strong>Pre-Fight</strong> — Flask, Elixirs, Food, Scrolls. These are checked before the boss is pulled.</li>
          <li><strong>In-Combat</strong> — Potions used during the fight, Healthstone, Weapon Oil/Stone.</li>
        </ul>
        <p>Each cell in the table shows one of these:</p>
        <ul>
          <li><span className="check">✓</span> — Player had it.</li>
          <li><span className="cross">✗</span> — Player was missing it (and it matters for their role).</li>
          <li><span className="na-text">—</span> — Not applicable. For example, if a player used a Flask, the two elixir columns show — because a flask counts as both. Or a tank doesn't need Destruction Potion.</li>
          <li><span className="check">2×</span> — For potions, shows how many times it was used during the raid.</li>
        </ul>
        <p>
          Click any player name to open a side panel showing their full breakdown across every boss and every attempt.
        </p>
      </Section>

      <Section title="How Scoring Works">
        <h3 className="readme-h3">The simple version</h3>
        <p>
          Every player gets a score like <strong>4/4</strong> or <strong>2/5</strong>. The first number is
          what they actually had. The second number is the maximum they could have earned. Higher is better.
        </p>
        <p>
          The score colour tells you at a glance how they did:
        </p>
        <ul>
          <li><span style={{ color: '#4caf50', fontWeight: 'bold' }}>Green</span> — Full score. Came fully prepared.</li>
          <li><span style={{ color: '#f5c842', fontWeight: 'bold' }}>Yellow</span> — Partial. Missing one or two things.</li>
          <li><span style={{ color: '#e05555', fontWeight: 'bold' }}>Red</span> — Low or zero. Significantly unprepared.</li>
        </ul>
        <p>
          A player's entire row is also highlighted <span className="check">green</span> or <span className="cross">red</span> based
          on whether they are fully prepared. The <strong>Slackers</strong> list at the bottom shows everyone
          who is missing at least one mandatory buff.
        </p>

        <h3 className="readme-h3">What earns points (default)</h3>
        <ul>
          <li>+1 point — Flask or Battle Elixir</li>
          <li>+1 point — Flask or Guardian Elixir</li>
          <li>+1 point — Food buff</li>
          <li>+1 point — Used <em>at least one</em> relevant in-combat potion (max 1 point for the pot category, regardless of how many types apply to your role)</li>
        </ul>
        <p>
          Because potions share a cooldown in TBC, only 1 point is awarded for the potion category — using a Destruction Potion, a Haste Potion, or a Mana Potion all give the same 1 point.
          The relevant potion types per class and role are shown in the table below.
        </p>
        <p>
          Healthstone, Weapon Oil, and Weapon Stone are shown in the table but <strong>do not affect the score by default</strong>.
          You can make weapon buffs count by enabling them in Settings.
        </p>

        <h3 className="readme-h3">Why the max score is different per player</h3>
        <p>
          Whether a player has a relevant potion at all depends on their class and role. If any relevant potion
          exists for them, their max goes up by 1. If none do, the pot category doesn't exist for them.
          A Warrior DPS, a Mage, a Holy Priest, and a Prot Warrior all have max 4 — the potion types differ
          but each contributes exactly 1 point to the max.
        </p>
        <p>
          This means the score is <strong>fair</strong> — you're only judged on what actually applies to your class and role.
        </p>
      </Section>

      <Section title="Custom Scoring (Settings)">
        <p>
          If you're logged in as a raid leader, you can go to <strong>Settings</strong> and choose exactly
          which buffs count toward the score. This only affects <em>your</em> view — anonymous users
          always see the default scoring.
        </p>
        <ul>
          <li><strong>Uncheck a buff</strong> — it no longer affects anyone's score. Nobody loses points for skipping it.</li>
          <li><strong>Check Weapon Buff</strong> — weapon oil (casters/healers) and weapon stone (melee/tanks) now count as a mandatory point.</li>
        </ul>
        <p>
          Example: if you uncheck Food, a player missing their food buff will still show ✗ in the table
          (so you can see it), but it won't make their row red and won't lower their score.
        </p>
        <p>
          Your settings are saved and apply every time you use Snitchbot while logged in.
        </p>
      </Section>

      <Section title="Player Lookup">
        <p>
          The <strong>Player Lookup</strong> tool lets you search any player by name and realm — no log URL needed.
          It pulls their full TBC raid history directly from Warcraft Logs and shows WCL rankings alongside
          consumable usage, giving you a quick overview of both how well they perform and how prepared they show up.
        </p>

        <h3 className="readme-h3">How to use it</h3>
        <p>
          Type a character name on the home page or go to <strong>/lookup</strong>, pick a realm, and hit Look up.
          The first search takes 20–60 seconds while data is fetched from WCL. After that, results are cached
          for 24 hours and load instantly. Hit <strong>↻ Refresh data</strong> on the profile page to force a fresh fetch.
        </p>

        <h3 className="readme-h3">What you see</h3>
        <ul>
          <li><strong>Combined Rating</strong> — a single Legendary / Epic / Rare / Uncommon / Common badge. Weighted 50% WCL rank % + 30% enchant score + 20% consumable compliance.</li>
          <li><strong>Per-zone collapsible tables</strong> — Karazhan, Gruul/Mag, SSC/TK (and more as content unlocks). Click a zone to expand the full boss breakdown.</li>
          <li><strong>Per-boss data</strong> — Best %, Median %, Best DPS/HPS, Kill count, Fastest kill, and every consumable column (Flask, Elixirs, Food, Weapon, Pot) based on the player's best logged kill for that boss.</li>
        </ul>

        <h3 className="readme-h3">Sharing a profile</h3>
        <p>
          Every lookup generates a shareable URL: <code>/lookup?name=Vitok&amp;server=thunderstrike&amp;region=EU</code>.
          Anyone with the link gets instant results (from cache) or triggers a fresh fetch if the profile is stale.
        </p>

        <p className="readme-note">
          Consumable data is from the best logged kill per boss, not averaged across all kills. A player who
          potted on their highest-ranked kill but not on wipes will show ✓ for that boss.
        </p>
      </Section>

      <Section title="Saved Raids & Player History">
        <p>
          Login with Discord to save reports and build a history of your raid team's consumable habits over time.
        </p>

        <h3 className="readme-h3">Saving a report</h3>
        <p>
          After analyzing a log, click <strong>Save Report</strong> next to the report title. The button
          turns grey and says "Saved" — that's it. If you come back and load the same log again, it will
          already say Saved.
        </p>

        <h3 className="readme-h3">Dashboard</h3>
        <p>
          Click <strong>Dashboard</strong> in the top navigation to see two tabs:
        </p>
        <ul>
          <li>
            <strong>Saved Reports</strong> — every log you've saved, with the date and a link to view it.
            You can delete a report here — this also removes all player data from that raid from your history.
          </li>
          <li>
            <strong>Player Roster</strong> — every player who has appeared in any of your saved reports,
            with their average score, number of raids attended, and how many raids they came prepared for.
            Filter by role using the All / Tank / Healer / DPS tabs.
          </li>
        </ul>

        <h3 className="readme-h3">Per-player history</h3>
        <p>
          Click any player name in the roster to see their individual history. First you'll see a list of
          every raid they attended, with their average score for that night. Click a raid to drill down
          into a boss-by-boss breakdown — one row per boss showing their pre-fight buffs, pots used, and score.
        </p>
        <p className="readme-note">
          Player data is stored inside each saved report. Deleting a report removes that raid from all player histories automatically.
        </p>
      </Section>

      <Section title="Role-Based Potion Relevance">
        <p>
          This table shows which potions are accepted for each role. A <span className="check">✓</span> means
          using that potion satisfies the pot requirement. <span className="na-text">—</span> means it doesn't apply.
        </p>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          <strong>Important:</strong> The entire potion category is worth <strong>1 point maximum</strong> —
          using any one of the marked potions earns it. Multiple ✓ columns just mean those are all accepted options for that role.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Role / Class</th>
                {POT_COLS.filter(c => !['healthstone','weapon_oil','weapon_stone'].includes(c.key)).map(c => <th key={c.key}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROLE_ROWS.map(row => (
                <tr key={row.role}>
                  <td className="readme-role">{row.role}</td>
                  {POT_COLS.filter(c => !['healthstone','weapon_oil','weapon_stone'].includes(c.key)).map(c => (
                    <td key={c.key} className="center">
                      {row.pots.includes(c.key) ? <span className="check">✓</span> : <span className="na-text">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Technical: How Detection Works">
        <h3 className="readme-h3">Pre-fight buffs (Flask / Elixir / Food)</h3>
        <p>
          Warcraft Logs fires a <code>CombatantInfo</code> event at the start of every fight listing all
          active auras. Snitchbot scans these aura IDs and names to detect flask, elixir, and food buffs.
          If a flask is detected, both elixir columns show — (not applicable) since a flask counts as both.
        </p>

        <h3 className="readme-h3">Weapon oils and stones</h3>
        <p>
          Weapon enchants appear as a <code>temporaryEnchant</code> ID on weapon gear slots inside the{' '}
          <code>CombatantInfo</code> gear array. All 19 equipment slots are checked.
        </p>

        <h3 className="readme-h3">In-combat potions</h3>
        <p>
          Potions don't leave a lasting buff so they can't be read from CombatantInfo. Instead, all{' '}
          <code>Cast</code> events in the log are scanned and matched against known spell IDs.
          A <strong>10-second pre-pull window</strong> is included so pre-potting is counted correctly.
        </p>
      </Section>

      <Section title="Tracked Food Buffs (by ID)">
        <p>Most food is detected because the buff name contains "well fed". These are detected by spell ID only.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Food</th><th>Spell ID</th><th>Notes</th></tr></thead>
            <tbody>
              {FOOD_IDS_LIST.map(f => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="center"><code>{f.id}</code></td>
                  <td className="readme-note">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tracked Flasks (by ID)">
        <p>Most flasks are detected by name. These two are detected by spell ID only.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Flask</th><th>Spell ID</th><th>Notes</th></tr></thead>
            <tbody>
              {FLASK_IDS_LIST.map(f => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="center"><code>{f.id}</code></td>
                  <td className="readme-note">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tracked Elixirs">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Elixir</th><th>Type</th><th>Spell ID</th></tr></thead>
            <tbody>
              {ELIXIRS.map(e => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td><span className={e.type === 'Battle' ? 'check' : 'tag'}>{e.type}</span></td>
                  <td className="center"><code>{e.id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tracked Potions">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Potion</th><th>Tracked As</th><th>Cast Spell ID(s)</th><th>Notes</th></tr></thead>
            <tbody>
              {POTIONS.map(p => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{POT_LABEL[p.key]}</td>
                  <td><code>{p.ids.join(', ')}</code></td>
                  <td className="readme-note">{p.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Tracked Weapon Buffs">
        <p>Detected via temporary enchant ID on weapon slots in CombatantInfo.</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Type</th><th>Enchant ID</th><th>Status</th></tr></thead>
            <tbody>
              {WEAPON_BUFFS.map(w => (
                <tr key={w.enchantId}>
                  <td>{w.name}</td>
                  <td>{w.type}</td>
                  <td className="center"><code>{w.enchantId}</code></td>
                  <td className="readme-note">{w.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Known Limitations">
        <ul>
          <li>
            <strong>Spec inference is approximate</strong> — hybrid classes (Druid, Shaman, Paladin) are
            assigned a role by Warcraft Logs. Within DPS, Feral and Balance Druids or Enhancement and
            Elemental Shamans share potion columns showing both options.
          </li>
          <li>
            <strong>Some weapon enchant IDs unconfirmed</strong> — Superior Wizard Oil (2650) hasn't been
            seen in live log data yet. The confirmed ones (2628, 2629, 2678, 2955) were verified from real raids.
          </li>
          <li>
            <strong>Healthstone is tracked but not scored by default</strong> — it shows in the In-Combat
            table column for reference only.
          </li>
        </ul>
      </Section>
    </>
  );
}

// ── Development tab ────────────────────────────────────────────────────────────

function Development() {
  return (
    <>
      <h1>Development Reference</h1>
      <p style={{ color: '#888', marginTop: '.25rem', marginBottom: '2rem' }}>
        Complete technical documentation for continuing Snitchbot development. Written so a new developer or AI can understand the entire system cold.
      </p>

      <Section title="System Architecture">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '1rem' }}>
          How all the pieces connect — browser, API, and external services.
        </p>

        <div className="dev-arch">
          {/* Top: Browser */}
          <div className="dev-arch-row" style={{ justifyContent: 'center' }}>
            <ArchBox
              label="Browser (Next.js Pages Router)"
              sub="SnitchbotApp · PlayerTable · PlayerPanel · Dashboard · Settings"
              color="#f5c842"
              wide
            />
          </div>

          <div className="dev-arch-row" style={{ justifyContent: 'center' }}>
            <span className="dev-arch-arrow">↕ HTTP</span>
          </div>

          {/* Middle: API layer */}
          <div className="dev-arch-row" style={{ justifyContent: 'center' }}>
            <ArchBox
              label="Next.js API Routes (Vercel serverless)"
              sub="/api/analyze · /api/reports · /api/players · /api/settings · /api/auth"
              color="#4c7fd4"
              wide
            />
          </div>

          {/* Bottom: External services */}
          <div className="dev-arch-row" style={{ justifyContent: 'center', gap: '1rem', marginTop: '.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem' }}>
              <span className="dev-arch-arrow" style={{ fontSize: '.85rem' }}>↓ GraphQL</span>
              <ArchBox label="WCL API" sub="warcraftlogs.com" color="#4caf50" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem' }}>
              <span className="dev-arch-arrow" style={{ fontSize: '.85rem' }}>↕ SQL</span>
              <ArchBox label="Neon Postgres" sub="users · reports · user_settings" color="#4caf50" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem' }}>
              <span className="dev-arch-arrow" style={{ fontSize: '.85rem' }}>↔ OAuth</span>
              <ArchBox label="Discord OAuth" sub="via NextAuth.js v4" color="#7289da" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem' }}>
              <span className="dev-arch-arrow" style={{ fontSize: '.85rem' }}>↕ HTTP</span>
              <ArchBox label="Upstash Redis" sub="admin stats only" color="#ff6b35" />
            </div>
          </div>
        </div>

        <p style={{ color: '#666', fontSize: '.82rem', marginTop: '.75rem' }}>
          There is no local git repository. Deployments go directly to GitHub via the REST API using <code>push_all.py</code>.
          One Vercel project auto-builds from <code>vitoc82-se/Snitchbot</code> on every push.
        </p>
      </Section>

      <Section title="Tech Stack">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Layer</th><th>Technology</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Framework</td><td><code>Next.js 14</code> — Pages Router</td><td className="readme-note">Do NOT use App Router. All pages in src/pages/.</td></tr>
              <tr><td>Hosting</td><td>Vercel (two separate projects)</td><td className="readme-note">Auto-deploys from GitHub main branch</td></tr>
              <tr><td>Auth</td><td>NextAuth.js v4 — Discord OAuth, JWT strategy</td><td className="readme-note">No database sessions. Token decoded with getToken().</td></tr>
              <tr><td>Database</td><td>Neon serverless Postgres</td><td className="readme-note">@neondatabase/serverless. UUIDs, not integers.</td></tr>
              <tr><td>Cache</td><td>Upstash Redis (HTTP pipeline)</td><td className="readme-note">Admin stats only. Not a Redis client lib — HTTP only.</td></tr>
              <tr><td>WCL data</td><td>Warcraft Logs GraphQL API v2</td><td className="readme-note">CombatantInfo + Cast events. Client credentials OAuth.</td></tr>
              <tr><td>Styling</td><td>Single global CSS file</td><td className="readme-note">Dark WoW theme. Managed remotely via push scripts.</td></tr>
              <tr><td>Deploy</td><td>Python scripts (GitHub Git Tree API)</td><td className="readme-note">push_all.py → vitoc82-se/Snitchbot → snitchbot.app. No local git repo.</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Repository & File Structure">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '.75rem' }}>
          Single GitHub repo: <code>vitoc82-se/Snitchbot</code> → snitchbot.app (Vercel auto-deploys on push to main).
          Local working directory: <code>C:\Users\freem\Guidevision.eu\</code>
        </p>
        <CodeBlock>{`src/
├── lib/
│   ├── constants.js      ← All magic IDs + UI column/class definitions
│   ├── scoring.js        ← score(), maxScore(), isPrepared(), missingList()
│   ├── db.js             ← Neon Postgres client (sql tagged template)
│   ├── redis.js          ← Upstash Redis HTTP client (admin only)
│   └── wcl.js            ← WCL GraphQL API clients (retail + fresh endpoints)
├── components/
│   ├── SnitchbotApp.jsx  ← Main app: all state, layout, orchestration
│   ├── PlayerTable.jsx   ← Class-grouped table with score badges
│   ├── PlayerModal.jsx   ← Slide-in player detail panel (right edge)
│   ├── RankingsView.jsx  ← Raid-wide rankings tab
│   ├── LoadingStatus.jsx ← Animated loading steps indicator
│   └── Cell.jsx          ← Table cell: ✓ / ✗ / — / 2× rendering
├── pages/
│   ├── index.js              ← Entry point → renders <SnitchbotApp />
│   ├── readme.js             ← This documentation page (/readme)
│   ├── admin.js              ← Admin panel (/admin), password-protected
│   ├── settings.js           ← Mandatory buff settings (/settings)
│   ├── suggest.js            ← Suggest a consumable (/suggest)
│   ├── lookup/
│   │   └── index.js          ← Player lookup (/lookup?name=X&server=Y&region=Z)
│   ├── dashboard/
│   │   ├── index.js          ← Saved reports + player roster (/dashboard)
│   │   └── players/[name].js ← Per-player raid history
│   ├── reports/[code].js     ← Shareable report URL (/reports/ABC123)
│   └── api/
│       ├── analyze.js         ← Main WCL fetch + analysis endpoint
│       ├── admin.js           ← Admin stats
│       ├── auth/[...nextauth].js
│       ├── reports/save.js    ← POST save
│       ├── reports/index.js   ← GET list
│       ├── reports/[id].js    ← GET single + DELETE + re-analyze
│       ├── players/index.js   ← GET roster (aggregated from reports JSON)
│       ├── players/[name].js  ← GET per-player history
│       ├── settings/buffs.js  ← GET/POST mandatory settings
│       ├── lookup/
│       │   ├── index.js       ← GET cached player profile + boss data
│       │   └── fetch.js       ← POST trigger fresh WCL fetch for a player
│       ├── suggestions/
│       │   ├── index.js       ← GET all suggestions (admin only)
│       │   └── submit.js      ← POST new suggestion
│       ├── debug_gear.js      ← Dev: show weapon enchant IDs (?code=XXX)
│       ├── debug_potions.js   ← Dev: show potion cast events
│       ├── debug_auras.js     ← Dev: show CombatantInfo aura IDs
│       └── debug_timestamps.js← Dev: show fight timestamps
└── styles/
    └── globals.css       ← All CSS. Lives in GitHub only (no local copy).

push_all.py       ← Deploy src/ → vitoc82-se/Snitchbot (snitchbot.app)
DEVELOPMENT.md    ← This content as a local markdown file`}</CodeBlock>
      </Section>

      <Section title="Database Schema">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '.75rem' }}>
          Five tables in Neon Postgres. All IDs are UUID generated by Postgres.
          The first three are created on first use by the app; the player lookup tables are auto-migrated by <code>/api/lookup/fetch.js</code> on first call.
        </p>
        <CodeBlock>{`-- Created automatically by NextAuth signIn callback
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id     TEXT UNIQUE NOT NULL,
  discord_name   TEXT,
  discord_avatar TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Full analyzed JSON stored in data column (JSONB)
-- No separate players table — player data is embedded here
CREATE TABLE reports (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  wcl_code   TEXT NOT NULL,           -- e.g. "ABC123xYZ"
  title      TEXT,                    -- e.g. "Gruul's Lair - 2025-05-01"
  data       JSONB NOT NULL,          -- full bosses/players/leaderboard JSON
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, wcl_code)           -- prevents saving same report twice
);

-- Per-user mandatory buff config
CREATE TABLE user_settings (
  user_id    UUID PRIMARY KEY REFERENCES users(id),
  mandatory  JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Player lookup cache (auto-created by /api/lookup/fetch.js)
CREATE TABLE player_lookup_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  server_slug   TEXT NOT NULL,
  server_region TEXT NOT NULL,
  class_name    TEXT, role TEXT, guild_name TEXT,
  fetch_status  TEXT NOT NULL DEFAULT 'pending', -- pending|fetching|done|error
  fetched_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, server_slug, server_region)        -- 24h TTL via fetched_at
);

-- Per-boss stats for each looked-up player
CREATE TABLE player_lookup_bosses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES player_lookup_profiles(id) ON DELETE CASCADE,
  zone_id INT, encounter_id INT NOT NULL, boss_name TEXT NOT NULL,
  rank_percent NUMERIC(5,2), median_percent NUMERIC(5,2),
  best_amount NUMERIC(10,2), total_kills INT DEFAULT 0, fastest_kill INT,
  flask BOOLEAN, battle_elixir BOOLEAN, guardian_elixir BOOLEAN,
  food BOOLEAN, weapon_oil BOOLEAN, weapon_stone BOOLEAN,
  haste_potion INT, destruction_potion INT, mana_potion INT, healthstone INT,
  consume_score INT, consume_max INT,
  enchant_mainhand BOOLEAN, enchant_head BOOLEAN, enchant_shoulder BOOLEAN,
  enchant_chest BOOLEAN, enchant_legs BOOLEAN, enchant_bracer BOOLEAN,
  enchant_gloves BOOLEAN, enchant_score INT,
  UNIQUE(player_id, encounter_id)
);`}</CodeBlock>

        <p style={{ color: '#666', fontSize: '.82rem', marginTop: '.75rem' }}>
          <strong>Important:</strong> <code>score</code>, <code>maxScore</code>, and <code>prepared</code> are never stored —
          they are always recomputed from the JSONB player data using the current scoring functions.
          This means changing scoring logic automatically recomputes for all historical data.
        </p>

        <h3 className="readme-h3">Running migrations</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          No ORM. Run SQL directly against Neon using psycopg2 (installed on the dev machine):
        </p>
        <CodeBlock>{`import psycopg2
conn = psycopg2.connect('postgresql://neondb_owner:...@ep-silent-violet-...neon.tech/neondb?sslmode=require&channel_binding=require')
cur = conn.cursor()
cur.execute('ALTER TABLE ...')
conn.commit()
conn.close()`}</CodeBlock>
        <p style={{ color: '#666', fontSize: '.82rem' }}>
          Connection string is in the DATABASE_URL env var. Be careful — this runs against the shared live+preview database.
        </p>
      </Section>

      <Section title="Authentication Flow">
        <div className="dev-pipeline">
          <PipelineStep num="1" title="User clicks Login with Discord">
            <code>signIn('discord')</code> from <code>next-auth/react</code> is called client-side.
            NextAuth redirects to Discord OAuth.
          </PipelineStep>
          <PipelineStep num="2" title="Discord OAuth callback">
            Discord redirects to <code>/api/auth/callback/discord</code>. The <code>signIn</code> callback
            in <code>[...nextauth].js</code> fires: upserts the user into the <code>users</code> table,
            retrieves their <code>id</code> (UUID).
          </PipelineStep>
          <PipelineStep num="3" title="JWT created">
            The <code>jwt</code> callback stores <code>token.dbId = user.id</code> (the UUID) in the JWT.
            The JWT is signed with <code>NEXTAUTH_SECRET</code> and stored in an HTTP-only cookie.
          </PipelineStep>
          <PipelineStep num="4" title="API routes read the token">
            All authenticated API routes call:
            <CodeBlock>{`const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });
// token.dbId is the user's UUID from the users table`}</CodeBlock>
            This directly decodes the cookie — no HTTP subrequest, no session lookup. Most reliable method for Pages Router.
          </PipelineStep>
        </div>

        <div className="dev-arch-box" style={{ borderColor: '#e05555', marginTop: '.5rem' }}>
          <div className="dev-arch-label" style={{ color: '#e05555' }}>Why NOT getServerSession or getSession</div>
          <div className="dev-arch-sub">
            getServerSession requires passing authOptions — caused import issues in this project.
            getSession (from next-auth/react) makes an HTTP subrequest that had reliability problems.
            getToken() is the correct approach for Next.js Pages Router API routes.
          </div>
        </div>
      </Section>

      <Section title="WCL Analysis Pipeline">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '1rem' }}>
          What happens in <code>/api/analyze.js</code> when a log URL is submitted. Five sequential steps.
        </p>

        <div className="dev-pipeline">
          <PipelineStep num="1" title="WCL OAuth token">
            POST to <code>WCL_TOKEN_URL</code> with client credentials (<code>WCL_CLIENT_ID</code> / <code>WCL_CLIENT_SECRET</code>).
            Returns a bearer token valid for this request.
          </PipelineStep>
          <PipelineStep num="2" title="Report metadata">
            GraphQL query: fetch report title and list of fights (bosses).
            Each fight has <code>id</code>, <code>name</code>, <code>startTime</code>, <code>endTime</code>, <code>kill</code> flag.
          </PipelineStep>
          <PipelineStep num="3" title="CombatantInfo per fight">
            For each fight: fetch <code>CombatantInfo</code> events. These fire at pull start and contain:<br />
            • <code>auras[]</code> — all active buff spell IDs + names (detects flask/elixir/food/scrolls)<br />
            • <code>gear[]</code> — 19 equipment slots with <code>temporaryEnchant</code> IDs (detects weapon oil/stone)
          </PipelineStep>
          <PipelineStep num="4" title="Potion cast events (full log scan)">
            Fetch all <code>Cast</code> events from timestamp 0 to end, paginated at 10,000 per page.
            Each cast spell ID is matched against <code>POTION_CAST_IDS</code>.
            A <strong>10-second pre-pull window</strong> (<code>fight.startTime - PREPOT_WINDOW_MS</code>) means pre-potting counts correctly.
          </PipelineStep>
          <PipelineStep num="5" title="Response JSON">
            Returns a nested object: <code>{'{ title, bosses: [{ name, attempts: [{ id, players: [...] }] }], potionLeaderboard }'}</code>.
            Each player object has boolean/count fields for every consumable.
            This JSON is stored as-is in <code>reports.data</code> when a report is saved.
          </PipelineStep>
        </div>

        <h3 className="readme-h3">Detection rules</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Consumable</th><th>Source</th><th>Rule</th></tr></thead>
            <tbody>
              <tr><td>Flask</td><td>CombatantInfo auras</td><td className="readme-note">Buff name includes "flask" OR spell ID in FLASK_IDS</td></tr>
              <tr><td>Food</td><td>CombatantInfo auras</td><td className="readme-note">Buff name includes "well fed" OR spell ID in FOOD_IDS (checked before selfApplied gate)</td></tr>
              <tr><td>Guardian elixir</td><td>CombatantInfo auras</td><td className="readme-note">Spell ID in GUARDIAN_IDS AND selfApplied</td></tr>
              <tr><td>Battle elixir</td><td>CombatantInfo auras</td><td className="readme-note">Spell ID in BATTLE_IDS AND selfApplied</td></tr>
              <tr><td>Scrolls</td><td>CombatantInfo auras</td><td className="readme-note">Spell ID in SCROLL_IDS AND selfApplied</td></tr>
              <tr><td>Weapon oil/stone</td><td>CombatantInfo gear</td><td className="readme-note">temporaryEnchant ID in WEAPON_ENCHANT_IDS (all 19 slots checked)</td></tr>
              <tr><td>Potions</td><td>Cast events (full log)</td><td className="readme-note">Cast spell ID in POTION_CAST_IDS, attributed by fight time ± 10s</td></tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Scoring System">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '.75rem' }}>
          All scoring logic is in <code>src/lib/scoring.js</code>. Every function accepts an optional <code>mandatory</code>
          settings object as a second parameter — if omitted, <code>DEFAULT_MANDATORY</code> is used.
        </p>

        <CodeBlock>{`// Default settings (used for anonymous users and as fallback)
export const DEFAULT_MANDATORY = {
  flask:    true,   // flask or battle elixir coverage
  guardian: true,   // flask or guardian elixir coverage
  food:     true,   // food buff
  pots:     true,   // relevant in-combat potions
  weapon:   false,  // weapon oil/stone (opt-in, off by default)
};

// Core functions — all accept optional mandatory second parameter
export function score(player, mandatory = DEFAULT_MANDATORY)
export function maxScore(player, mandatory = DEFAULT_MANDATORY)
export function isPrepared(player, mandatory = DEFAULT_MANDATORY)
export function missingList(player, mandatory = DEFAULT_MANDATORY)

// Returns array of potion keys expected for this class/role
export function relevantPotKeys(playerClass, role)

// Returns 'oil' or 'stone' based on role/class
export function weaponBuffType(player)`}</CodeBlock>

        <h3 className="readme-h3">Max score by class/role (default settings)</h3>
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '.5rem' }}>
          Pot column: always +1 max (1 point if <em>any</em> relevant potion is used — TBC cooldown means you can only use one anyway).
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Player type</th><th>Pre-fight (3)</th><th>Potions</th><th>Total max</th></tr></thead>
            <tbody>
              <tr><td>Warrior DPS / Rogue / Hunter / Ret Paladin</td><td className="center">3</td><td className="center">+1 (Haste Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Mage / Warlock / Shadow Priest</td><td className="center">3</td><td className="center">+1 (Dest, Haste, or Mana Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Shaman DPS / Druid DPS</td><td className="center">3</td><td className="center">+1 (Dest, Haste, or Mana Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Healer (all classes)</td><td className="center">3</td><td className="center">+1 (Mana Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Tank (non-Paladin)</td><td className="center">3</td><td className="center">+1 (Haste Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Tank Paladin</td><td className="center">3</td><td className="center">+1 (Dest, Haste, or Mana Pot)</td><td className="center"><strong>4</strong></td></tr>
              <tr><td>Any of the above + Weapon enabled</td><td className="center">3</td><td className="center">+pots +1</td><td className="center"><strong>5</strong></td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="readme-h3">How mandatory settings flow through the app</h3>
        <div className="dev-pipeline">
          <PipelineStep num="1" title="Logged-in user loads the page">
            <code>SnitchbotApp</code> fetches <code>/api/settings/buffs</code> on session load.
            The response is stored in <code>mandatory</code> state and passed to all client-side scoring.
          </PipelineStep>
          <PipelineStep num="2" title="mandatory is passed down">
            <code>SnitchbotApp</code> → <code>PlayerTable</code> → <code>score(p, mandatory)</code><br />
            <code>SnitchbotApp</code> → <code>PlayerPanel</code> → <code>score(p, mandatory)</code><br />
            <code>/api/players</code> and <code>/api/players/[name]</code> query <code>user_settings</code> from the DB
            and pass the user's <code>mandatory</code> to all <code>score()</code> calls server-side.
          </PipelineStep>
          <PipelineStep num="3" title="Player detail page">
            <code>/api/players/[name]</code> returns <code>{'{ raids, mandatory }'}</code> — the mandatory config is
            included so the client can use it for client-side scoring in <code>RaidDetail</code> without a separate fetch.
          </PipelineStep>
          <PipelineStep num="4" title="User changes settings">
            <code>/settings</code> page POSTs to <code>/api/settings/buffs</code>. Next time any page loads,
            it fetches the updated settings and all scores recompute accordingly.
          </PipelineStep>
        </div>
      </Section>

      <Section title="Key Components">
        <h3 className="readme-h3">SnitchbotApp.jsx</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>The main orchestrator. All application state lives here:</p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>State</th><th>Type</th><th>Purpose</th></tr></thead>
            <tbody>
              <tr><td><code>logUrl</code></td><td>string</td><td>Input field value</td></tr>
              <tr><td><code>results</code></td><td>object | null</td><td>Analyzed report data from /api/analyze</td></tr>
              <tr><td><code>loading</code></td><td>bool</td><td>Analysis in progress</td></tr>
              <tr><td><code>bossIndex</code></td><td>number</td><td>Which boss tab is selected</td></tr>
              <tr><td><code>attemptIdx</code></td><td>number</td><td>Which attempt (wipe/kill) is selected</td></tr>
              <tr><td><code>view</code></td><td>'table'|'rankings'</td><td>Main content tab</td></tr>
              <tr><td><code>tableView</code></td><td>'pre'|'combat'</td><td>Which column group is shown in PlayerTable</td></tr>
              <tr><td><code>panelPlayer</code></td><td>object | null</td><td>Player for the slide-in panel (null = closed)</td></tr>
              <tr><td><code>savedCodes</code></td><td>Set</td><td>WCL codes the user already saved (prevents duplicates)</td></tr>
              <tr><td><code>mandatory</code></td><td>object</td><td>User's mandatory buff settings (fetched on session load)</td></tr>
            </tbody>
          </table>
        </div>

        <h3 className="readme-h3">Cell.jsx</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          Reusable table cell. <code>value</code> can be boolean or number:
        </p>
        <ul className="readme" style={{ marginTop: '.5rem' }}>
          <li><code>false</code> / <code>0</code> → <span className="cross">✗</span> red (unless <code>na=true</code>)</li>
          <li><code>true</code> → <span className="check">✓</span> green</li>
          <li>Number {'>'} 0 → <span className="check">2×</span> green count</li>
          <li><code>na {'&&'} !value</code> → <span className="na-text">—</span> grey</li>
        </ul>

        <h3 className="readme-h3">PlayerModal.jsx (exported as PlayerPanel)</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          Slide-in panel from the right edge. Uses <code>position: fixed; transform: translateX()</code> CSS.
          An overlay div behind it closes the panel on click. Accepts <code>player</code>, <code>bosses</code>,
          <code>mandatory</code>, <code>onClose</code>.
        </p>
      </Section>

      <Section title="API Routes Reference">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Route</th><th>Method</th><th>Auth</th><th>Description</th></tr>
            </thead>
            <tbody>
              {API_ROUTES.map((r, i) => (
                <tr key={i}>
                  <td><code>{r.route}</code></td>
                  <td><code>{r.method}</code></td>
                  <td style={{ color: r.auth === 'JWT' ? '#4caf50' : r.auth === 'Password' ? '#f5c842' : '#666', whiteSpace: 'nowrap' }}>{r.auth}</td>
                  <td className="readme-note">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="readme-h3">Player data aggregation (/api/players)</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          There is no separate players table. The API loads all reports for the user (JSONB), then iterates
          over bosses/attempts/players in JavaScript. A <code>seen</code> Set per report ensures each player
          is counted once per raid (not once per boss attempt). Score/maxScore/isPrepared are always recomputed
          from current <code>lib/scoring.js</code> logic — never read from stored JSON.
        </p>
      </Section>

      <Section title="Environment Variables">
        <p style={{ color: '#666', fontSize: '.82rem', marginBottom: '.75rem' }}>
          Set in Vercel → Project → Settings → Environment Variables. Both preview and live projects need all of these.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Variable</th><th>Description</th><th>Where to get it</th></tr></thead>
            <tbody>
              {ENV_VARS.map(v => (
                <tr key={v.key}>
                  <td><code>{v.key}</code></td>
                  <td className="readme-note">{v.desc}</td>
                  <td className="readme-note">{v.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#666', fontSize: '.82rem', marginTop: '.5rem' }}>
          Discord OAuth redirect URIs must include <code>https://snitchbot.app/api/auth/callback/discord</code> and{' '}
          <code>https://new.snitchbot.app/api/auth/callback/discord</code> in the Discord Developer Portal.
        </p>
      </Section>

      <Section title="Deployment Workflow">
        <p style={{ color: '#888', fontSize: '.88rem', marginBottom: '.75rem' }}>
          No git. All deploys use the GitHub Git Tree API to create a commit atomically. Vercel auto-builds on push.
        </p>

        <div className="dev-pipeline">
          <PipelineStep num="1" title="Edit files locally">
            All source files are in <code>C:\Users\freem\Guidevision.eu\src\</code>.
            There is no local git — never run git commands here.
          </PipelineStep>
          <PipelineStep num="2" title="Deploy">
            <code>python push_all.py</code> — reads local files, creates an atomic commit on <code>vitoc82-se/Snitchbot</code> (main branch) via the GitHub REST API.
            Vercel picks up the push and auto-builds. Usually live in 60–90 seconds.
          </PipelineStep>
          <PipelineStep num="3" title="Verify">
            Visit <code>https://snitchbot.app</code>. Test the golden path: paste a log, check table, open panel, save report, check dashboard.
          </PipelineStep>
        </div>

        <h3 className="readme-h3">Adding a new file to deployments</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>Add an entry to the <code>FILES</code> dict in <code>push_all.py</code>:</p>
        <CodeBlock>{`FILES = {
  # ... existing entries ...
  "pages/api/my-new-route.js": os.path.join(SRC, "pages", "api", "my-new-route.js"),
}`}</CodeBlock>

        <h3 className="readme-h3">Adding new CSS</h3>
        <p style={{ color: '#888', fontSize: '.88rem' }}>
          CSS is append-only — the push script fetches the remote <code>globals.css</code>, checks if a marker comment
          already exists, and appends new blocks if not. Never overwrites existing CSS.
          To add new styles, add a block to <code>CSS_BLOCKS</code> in <code>push_all.py</code>:
        </p>
        <CodeBlock>{`MY_CSS = """
/* ── My new section ──────────────────────────────────────────────────────── */
.my-class { color: #f5c842; }
"""

CSS_BLOCKS = [
  ...existing blocks...,
  ("/* ── My new section", MY_CSS),
]`}</CodeBlock>
        <p style={{ color: '#666', fontSize: '.82rem' }}>
          To <strong>modify</strong> existing CSS, edit the remote file via GitHub web UI or add override rules in a new block with a new marker.
        </p>
      </Section>

      <Section title="Adding New Features — Checklist">
        <h3 className="readme-h3">New consumable to track</h3>
        <ul>
          <li>Add spell/enchant IDs to <code>src/lib/constants.js</code></li>
          <li>Add detection logic in <code>src/pages/api/analyze.js</code></li>
          <li>Add column definition to <code>PRE_COLS</code> or <code>POT_COLS</code> in constants</li>
          <li>Update scoring in <code>src/lib/scoring.js</code> if it should affect score</li>
          <li>Update <code>src/pages/readme.js</code></li>
          <li>Add to <code>FILES</code> dict in both push scripts if it's a new file</li>
        </ul>

        <h3 className="readme-h3">New API route</h3>
        <ul>
          <li>Create file in <code>src/pages/api/</code></li>
          <li>Use <code>getToken({'({ req, secret: process.env.NEXTAUTH_SECRET })'})</code> for auth — not <code>getSession</code> or <code>getServerSession</code></li>
          <li>Add to <code>FILES</code> dict in both push scripts</li>
        </ul>

        <h3 className="readme-h3">New page</h3>
        <ul>
          <li>Create file in <code>src/pages/</code></li>
          <li>Add to <code>FILES</code> dict in both push scripts</li>
          <li>Add nav link in <code>SnitchbotApp.jsx</code> top-nav if needed</li>
          <li>Add CSS block to push scripts if new styles are needed</li>
        </ul>
      </Section>

      <Section title="Known Issues & Technical Debt">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Issue</th><th>Impact</th><th>Notes</th></tr></thead>
            <tbody>
              <tr>
                <td>Player data not in its own table</td>
                <td className="readme-note" style={{ color: '#f5c842' }}>Medium</td>
                <td className="readme-note">All player stats computed by scanning report JSONB in JS. Works fine at current scale. Fix: add a player_appearances table.</td>
              </tr>
              <tr>
                <td>score/maxScore not stored in report JSON</td>
                <td className="readme-note" style={{ color: '#4caf50' }}>Low (intentional)</td>
                <td className="readme-note">Recomputed on every API call. Intentional so scoring logic changes apply retroactively.</td>
              </tr>
              <tr>
                <td>Some weapon enchant IDs unconfirmed</td>
                <td className="readme-note" style={{ color: '#4caf50' }}>Low</td>
                <td className="readme-note">Superior Wizard Oil (2650) not yet seen in live logs. IDs 2636, 2643, 2713 seen but unidentified.</td>
              </tr>
              <tr>
                <td>Spec inference is approximate</td>
                <td className="readme-note" style={{ color: '#4caf50' }}>Low</td>
                <td className="readme-note">Hybrid classes use WCL's role. Feral vs Balance Druid, Enhancement vs Elemental Shaman can't be distinguished.</td>
              </tr>
              <tr>
                <td>No React error boundary</td>
                <td className="readme-note" style={{ color: '#f5c842' }}>Medium</td>
                <td className="readme-note">A component crash brings down the whole page.</td>
              </tr>
              <tr>
                <td>Schema migrations run against live DB directly</td>
                <td className="readme-note" style={{ color: '#f5c842' }}>Medium</td>
                <td className="readme-note">No migration tool or staging DB. Run SQL via psycopg2 and verify carefully — affects live data immediately.</td>
              </tr>
              <tr>
                <td>Admin password in env var (not hashed)</td>
                <td className="readme-note" style={{ color: '#4caf50' }}>Low</td>
                <td className="readme-note">Anyone with Vercel env var access can see it.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

// ── Page shell ─────────────────────────────────────────────────────────────────

export default function Readme() {
  const [tab, setTab] = useState('howto');

  return (
    <>
      <Head><title>Snitchbot — {tab === 'howto' ? 'How It Works' : 'Development'}</title></Head>
      <div className="container readme">
        <div className="readme-nav">
          <Link href="/" className="subtle-link">← Back to analyzer</Link>
        </div>

        <div className="readme-tabs">
          <button
            className={`readme-tab${tab === 'howto' ? ' active' : ''}`}
            onClick={() => setTab('howto')}
          >
            How It Works
          </button>
          <button
            className={`readme-tab${tab === 'dev' ? ' active' : ''}`}
            onClick={() => setTab('dev')}
          >
            Development
          </button>
        </div>

        {tab === 'howto' ? <HowItWorks /> : <Development />}

        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API &nbsp;·&nbsp;
          TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
