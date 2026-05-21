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

// Food items whose buff name doesn't contain "well fed" — detected by spell ID only.
const FOOD_IDS_LIST = [
  { name: 'Skullfish Soup', id: 33825, note: '+20 spell crit, +20 mp5 — buff ID unconfirmed' },
  { name: 'Enlightened',    id: 43722, note: '' },
];

// Flasks whose buff name doesn't contain "flask" — detected by spell ID only.
const FLASK_IDS_LIST = [
  { name: 'Flask of Distilled Wisdom',    id: 17627, note: 'Buff name lacks "flask" — detected by ID' },
  { name: 'Flask of Chromatic Resistance',id: 17629, note: 'Buff is "Chromatic Resistance" — detected by ID' },
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
  { name: 'Insane Strength Potion', key: 'haste_potion',       ids: [28494], note: 'counted as Haste Pot slot' },
  { name: 'Destruction Potion',     key: 'destruction_potion', ids: [28508] },
  { name: 'Super Mana Potion',      key: 'mana_potion',        ids: [28499] },
  { name: 'Major Mana Potion',      key: 'mana_potion',        ids: [17531] },
  { name: 'Fel Mana Potion',        key: 'mana_potion',        ids: [41617, 41618] },
  { name: 'Dark Rune',              key: 'mana_potion',        ids: [20520] },
  { name: 'Demonic Rune',           key: 'mana_potion',        ids: [16666] },
  { name: 'Healthstone',            key: 'healthstone',        ids: [27237, 27232, 27230, 11730, 11729, 6263, 6262], note: 'tracked, not scored' },
];

const WEAPON_BUFFS = [
  { name: 'Brilliant Wizard Oil',        type: 'Oil',   enchantId: 2628 },
  { name: 'Brilliant Mana Oil',          type: 'Oil',   enchantId: 2629 },
  { name: 'Superior Wizard Oil',         type: 'Oil',   enchantId: 2650 },
  { name: 'Adamantite Sharpening Stone', type: 'Stone', enchantId: 3842 },
  { name: 'Adamantite Weightstone',      type: 'Stone', enchantId: 3854 },
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

        <Section title="What It Tracks">
          <p>Use The Pots reads a Warcraft Logs raid report and checks every player for:</p>
          <ul>
            <li><strong>Pre-fight buffs</strong> — Flask, Battle Elixir, Guardian Elixir, Food (Well Fed), Scrolls</li>
            <li><strong>In-combat potions</strong> — Haste Pot, Destruction Pot, Mana Pot</li>
            <li><strong>Informational (not scored)</strong> — Healthstone, Weapon Oil, Weapon Stone</li>
          </ul>
          <p>Each category is tracked per boss per attempt, and rolled up into raid-wide rankings.</p>
        </Section>

        <Section title="How Detection Works">
          <h3 className="readme-h3">Pre-fight buffs (Flask / Elixir / Food)</h3>
          <p>
            Warcraft Logs fires a <code>CombatantInfo</code> event at the start of every fight. This event
            lists all active auras on the player at pull time. Use The Pots scans these aura spell IDs
            and names to classify each buff as a flask, battle elixir, guardian elixir, or food.
          </p>
          <p>
            <strong>Food detection:</strong> buff name contains &ldquo;well fed&rdquo;, OR the buff ID is in
            a known list. Skullfish Soup and Enlightened are detected by ID because their buff names don&rsquo;t
            contain &ldquo;well fed&rdquo;.
          </p>
          <p>
            <strong>Flask detection:</strong> buff name contains &ldquo;flask&rdquo;, OR the buff ID is in
            a known list. Flask of Distilled Wisdom and Flask of Chromatic Resistance are detected by ID
            because their buff names don&rsquo;t contain the word &ldquo;flask&rdquo;.
          </p>
          <p>
            <strong>Flask vs elixir:</strong> a flask occupies both elixir slots simultaneously. If a flask
            is detected, the Battle Elixir and Guardian Elixir columns show <em>—</em> (not applicable)
            rather than a red ✗.
          </p>

          <h3 className="readme-h3">Weapon oils and stones</h3>
          <p>
            Weapon oils and stones apply a temporary weapon enchant visible in the <code>gear</code> array
            of the <code>CombatantInfo</code> event. Each gear slot can carry a <code>temporaryEnchant</code> ID.
            Use The Pots checks all 19 equipment slots for these IDs and marks the player accordingly.
            These are shown in the table as informational columns — they do not affect score.
          </p>

          <h3 className="readme-h3">In-combat potions</h3>
          <p>
            Potions are consumed during combat and do not leave a lasting buff — they can&rsquo;t be read
            from CombatantInfo. Instead, Use The Pots scans all <code>Cast</code> events in the entire log,
            matches each cast&rsquo;s spell ID against a known list, and assigns the cast to whichever fight
            it falls within. A <strong>10-second pre-pull window</strong> is included so pre-potting is
            counted.
          </p>
          <p>
            Cast events are paginated (10,000 events per request) and fetched from timestamp 0, so even
            long logs with many wipes are fully covered.
          </p>
        </Section>

        <Section title="Scoring">
          <p>Each player receives a score per attempt:</p>
          <ul>
            <li>+1 — Flask or Battle Elixir</li>
            <li>+1 — Flask or Guardian Elixir</li>
            <li>+1 — Food (Well Fed)</li>
            <li>+1 per relevant in-combat potion used (Haste Pot, Destruction Pot, Mana Pot)</li>
          </ul>
          <p>
            Healthstone, Weapon Oil, and Weapon Stone are tracked and shown in the table but do
            not contribute to score.
          </p>
          <p>
            The maximum score depends on the player&rsquo;s class and role (see Role-Based Potion Relevance below).
            Rankings average this score across all pulls the player was present for, so players who
            only attended part of the raid are not unfairly penalised.
          </p>
          <p>
            A player is marked <strong>Prepared</strong> (green row) if they have at minimum: Flask or
            both elixirs, plus food. Potions are tracked separately and affect score only.
          </p>
        </Section>

        <Section title="Role-Based Potion Relevance">
          <p>
            A <span className="check">✓</span> means the column is scored for that role — missing it shows
            a red ✗ and lowers the score. Columns marked <span className="na-text">—</span> are not
            applicable. Healthstone, Weapon Oil, and Weapon Stone are informational for all roles and
            are not shown in this table.
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

        <Section title="Tracked Food Buffs (by ID)">
          <p>Most food is detected because the buff name contains &ldquo;well fed&rdquo;. These are detected by spell ID only.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Food</th><th>Buff Spell ID</th><th>Notes</th></tr>
              </thead>
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
          <p>Most flasks are detected because their buff name contains &ldquo;flask&rdquo;. These two are detected by spell ID only.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Flask</th><th>Buff Spell ID</th><th>Notes</th></tr>
              </thead>
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
          <p>Detected via buff spell ID in CombatantInfo auras.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Elixir</th><th>Type</th><th>Buff Spell ID</th></tr>
              </thead>
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
          <p>Detected via cast spell ID in Cast events.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Potion</th><th>Tracked As</th><th>Cast Spell ID(s)</th><th>Notes</th></tr>
              </thead>
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
          <p>
            Detected via temporary enchant ID on weapon gear slots in CombatantInfo. Shown as informational
            columns — not scored. Enchant IDs marked as unconfirmed until seen in live log data.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Item</th><th>Type</th><th>Enchant ID</th></tr>
              </thead>
              <tbody>
                {WEAPON_BUFFS.map(w => (
                  <tr key={w.enchantId}>
                    <td>{w.name}</td>
                    <td>{w.type}</td>
                    <td className="center"><code>{w.enchantId}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Known Limitations">
          <ul>
            <li>
              <strong>Older healthstone rank IDs unconfirmed</strong> — IDs 27237 and 27232 are confirmed
              from live data. The lower-rank IDs (27230, 11730, 11729, 6263, 6262) have not been seen
              in logs yet but are kept for coverage.
            </li>
            <li>
              <strong>Weapon enchant IDs unconfirmed</strong> — The temporary enchant IDs for Brilliant
              Wizard Oil, Brilliant Mana Oil, Superior Wizard Oil, Adamantite Sharpening Stone, and
              Adamantite Weightstone have not yet been verified from live log data. They will be corrected
              as real logs are processed.
            </li>
            <li>
              <strong>Scrolls tracked but not scored</strong> — Scroll of Agility V (33077), Scroll of
              Protection V (33079), Scroll of Strength V (33082), Scroll of Spirit IV (12177), and
              Scroll of Intellect IV (12176) are detected and shown in the table, but do not contribute
              to a player&rsquo;s score. Other scroll ranks and types are added as confirmed from live logs.
            </li>
            <li>
              <strong>Spec inference is approximate</strong> — hybrid classes (Druid, Shaman, Paladin)
              are assigned a role (tank/healer/dps) by Warcraft Logs. Within DPS, Feral and Balance
              Druids or Enhancement and Elemental Shamans share a potion column showing both options.
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
