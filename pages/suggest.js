import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CATEGORIES = [
  'Flask', 'Battle Elixir', 'Guardian Elixir', 'Food',
  'Potion', 'Weapon Oil', 'Weapon Stone', 'Scroll', 'Other',
];

export default function SuggestPage() {
  const [form, setForm] = useState({
    spell_item_id: '',
    wowhead_link:  '',
    category:      '',
    class_spec:    '',
    log_example:   '',
    motivation:    '',
  });
  const [status,   setStatus]   = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.spell_item_id.trim() || !form.motivation.trim()) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/suggestions/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Submission failed');
      setStatus('ok');
    } catch (e) {
      setErrorMsg(e.message);
      setStatus('error');
    }
  };

  const reset = () => {
    setForm({ spell_item_id: '', wowhead_link: '', category: '', class_spec: '', log_example: '', motivation: '' });
    setStatus(null);
    setErrorMsg('');
  };

  return (
    <>
      <Head><title>Snitchbot — Suggest a Consumable</title></Head>
      <div className="container">
        <Link href="/" className="subtle-link" style={{ fontSize: '.85rem' }}>← Back to Snitchbot</Link>
        <h1 style={{ marginTop: '.75rem' }}>Suggest a Consumable</h1>
        <p style={{ color: '#888', fontSize: '.9rem', marginTop: '.25rem', marginBottom: '1.75rem' }}>
          Think we're missing a spell or item ID? Fill in what you know and we'll look into adding it.
        </p>

        {status === 'ok' ? (
          <div style={{ color: '#7ec87e', fontSize: '.95rem' }}>
            Thanks! Your suggestion has been submitted.{' '}
            <button onClick={reset} className="suggest-reset-btn">Submit another</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ maxWidth: 540 }}>
            <div className="suggest-field">
              <label className="suggest-label">
                Item ID / Spell ID <span className="suggest-required">*</span>
              </label>
              <input
                type="text"
                className="suggest-input"
                placeholder="e.g. 13512 or 17628"
                value={form.spell_item_id}
                onChange={e => set('spell_item_id', e.target.value)}
              />
            </div>

            <div className="suggest-field">
              <label className="suggest-label">Wowhead Link</label>
              <input
                type="text"
                className="suggest-input"
                placeholder="https://www.wowhead.com/classic/item=..."
                value={form.wowhead_link}
                onChange={e => set('wowhead_link', e.target.value)}
              />
            </div>

            <div className="suggest-field">
              <label className="suggest-label">Category</label>
              <select
                className="suggest-input"
                value={form.category}
                onChange={e => set('category', e.target.value)}
              >
                <option value="">— Select category —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="suggest-field">
              <label className="suggest-label">Class / Spec</label>
              <input
                type="text"
                className="suggest-input"
                placeholder="e.g. Balance Druid, all casters, tanks…"
                value={form.class_spec}
                onChange={e => set('class_spec', e.target.value)}
              />
            </div>

            <div className="suggest-field">
              <label className="suggest-label">WCL Log Example</label>
              <input
                type="text"
                className="suggest-input"
                placeholder="Log code or URL where this consumable appears"
                value={form.log_example}
                onChange={e => set('log_example', e.target.value)}
              />
              <div className="suggest-hint">Helps us verify the spell/item ID quickly.</div>
            </div>

            <div className="suggest-field">
              <label className="suggest-label">
                Why it should be tracked <span className="suggest-required">*</span>
              </label>
              <textarea
                className="suggest-input suggest-textarea"
                placeholder="Short explanation — what does it do, who uses it, why it matters…"
                value={form.motivation}
                onChange={e => set('motivation', e.target.value)}
                rows={3}
              />
            </div>

            {status === 'error' && (
              <div className="error" style={{ marginBottom: '.75rem' }}>{errorMsg}</div>
            )}

            <button className="btn" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Submitting…' : 'Submit suggestion'}
            </button>
          </form>
        )}

        <footer className="site-footer">
          Built by <strong>Vitok</strong> · Thunderstrike EU &nbsp;·&nbsp;
          Powered by Warcraft Logs API &nbsp;·&nbsp; TBC Anniversary (Fresh) only
        </footer>
      </div>
    </>
  );
}
