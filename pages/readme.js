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
  { name: 'Gift of Arthas',               type: 'Guardian', id: 9088  },
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

function Section({ title, children }) {
  return (
    <section className="readme-section">
      <h2 className="readme-h2">{title}</h2>
      {children}
    </section>
  );
}

export default function Readme() {
  return (
    <>
      <Head><title>Snitchbot — How It Works</title></Head>
      <div className="container readme">
        <div className="readme-nav">
          <Link href="/" className="subtle-link">← Back to analyzer</Link>
        </div>

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
            <li>+1 point per relevant in-combat potion used (depends on class and role — see table below)</li>
          </ul>
          <p>
            Healthstone, Weapon Oil, and Weapon Stone are shown in the table but <strong>do not affect the score by default</strong>.
            You can make weapon buffs count by enabling them in Settings.
          </p>

          <h3 className="readme-h3">Why the max score is different per player</h3>
          <p>
            Not every player is expected to use the same potions. A Warrior only has one relevant potion
            (Haste Pot), so their max is 4. A Mage has two relevant potions (Destruction Pot + Mana Pot),
            so their max is 5. A non-Paladin tank has no relevant potions, so their max is 3.
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
            This table shows which potions are expected for each role. A <span className="check">✓</span> means
            the potion is scored for that role. <span className="na-text">—</span> means it doesn't apply.
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
            Weapon enchants appear as a <code>temporaryEnchant</code> ID on weapon gear slots inside the
            <code>CombatantInfo</code> gear array. All 19 equipment slots are checked.
          </p>

          <h3 className="readme-h3">In-combat potions</h3>
          <p>
            Potions don't leave a lasting buff so they can't be read from CombatantInfo. Instead, all
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

        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by <a href="https://www.warcraftlogs.com" target="_blank" rel="noreferrer" className="subtle-link">Warcraft Logs</a> API &nbsp;·&nbsp;
          TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
