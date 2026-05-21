import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';
import { DEFAULT_MANDATORY } from './api/settings/buffs';

const SETTINGS_DEF = [
  {
    group: 'Pre-Fight',
    items: [
      { key: 'flask',    label: 'Flask / Battle Elixir',    desc: 'Player must have flask or battle elixir.' },
      { key: 'guardian', label: 'Guardian Elixir / Flask',  desc: 'Player must have flask or guardian elixir.' },
      { key: 'food',     label: 'Food Buff',                desc: 'Player must have a food buff.' },
    ],
  },
  {
    group: 'In-Combat',
    items: [
      { key: 'pots',   label: 'Relevant Potions',   desc: 'Class/role-appropriate potions (haste, destruction, mana).' },
      { key: 'weapon', label: 'Weapon Buff',         desc: 'Weapon oil (casters/healers) or weapon stone (melee/tanks).' },
    ],
  },
];

export default function Settings() {
  const { data: session, status } = useSession();
  const [cfg, setCfg]     = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch('/api/settings/buffs').then(r => r.json()).then(setCfg);
  }, [session]);

  if (status === 'loading') return null;
  if (!session) return (
    <div className="container">
      <div style={{ marginTop: '3rem' }}>
        <button className="btn" onClick={() => signIn('discord')}>Login with Discord</button>
        {' '}to manage your settings.
      </div>
    </div>
  );

  const toggle = key => {
    setCfg(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await fetch('/api/settings/buffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    setSaved(true);
  };

  return (
    <>
      <Head><title>Settings — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>
        <h1>Settings</h1>
        <p style={{ color: '#888', marginTop: '.25rem', marginBottom: '2rem' }}>
          Only checked buffs count toward a player's score in your view.
        </p>

        {cfg && SETTINGS_DEF.map(group => (
          <div key={group.group} style={{ marginBottom: '2rem' }}>
            <p className="section-label">{group.group}</p>
            {group.items.map(item => (
              <label key={item.key} className="settings-row" onClick={() => toggle(item.key)}>
                <input type="checkbox" checked={!!cfg[item.key]} onChange={() => toggle(item.key)} />
                <div>
                  <div className="settings-label">{item.label}</div>
                  <div className="settings-desc">{item.desc}</div>
                </div>
              </label>
            ))}
          </div>
        ))}

        <button className="btn" onClick={save} disabled={saving || !cfg}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>
    </>
  );
}
