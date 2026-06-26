import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useSession, signIn } from 'next-auth/react';

export default function LootPage() {
  const { data: session, status } = useSession();
  const [sessions, setSessions] = useState([]);
  const [json, setJson]         = useState('');
  const [title, setTitle]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState('');

  const loadSessions = () =>
    fetch('/api/loot/sessions').then(r => r.json()).then(setSessions).catch(() => {});

  useEffect(() => { if (session) loadSessions(); }, [session]);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!json.trim()) { setError('Paste your SoftRes JSON first.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/loot/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: json.trim(), title: title.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed.'); return; }
      setResult(data);
      setJson('');
      setTitle('');
      loadSessions();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this loot history? This cannot be undone.')) return;
    await fetch(`/api/loot/${id}`, { method: 'DELETE' });
    loadSessions();
  };

  if (status === 'loading') return null;

  if (!session) return (
    <div className="container">
      <div style={{ marginTop: '3rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--text2)', marginBottom: '1.25rem' }}>
          Log in to upload and share your raid loot history.
        </p>
        <button className="btn" onClick={() => signIn('discord')}>Login with Discord</button>
      </div>
    </div>
  );

  return (
    <>
      <Head><title>Loot History — Snitchbot</title></Head>
      <div className="container">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/" className="subtle-link">← Back</Link>
        </div>

        <h1 style={{ marginBottom: '.25rem' }}>Loot History</h1>
        <p style={{ color: 'var(--text2)', marginBottom: '2rem', fontSize: '.9rem' }}>
          Upload your SoftRes loot log to get a shareable link for your guild.
        </p>

        {/* Upload form */}
        <div className="loot-upload-card">
          <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '1rem' }}>
            Upload SoftRes Log
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '.75rem' }}>
              <label className="loot-label">Title <span style={{ color: 'var(--text3)', fontSize: '.8rem' }}>(optional — auto-generated if blank)</span></label>
              <input
                type="text"
                className="loot-input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Week 12 — Kara + SSC"
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label className="loot-label">SoftRes JSON</label>
              <p style={{ color: 'var(--text3)', fontSize: '.78rem', marginBottom: '.4rem' }}>
                In-game: type <code>/sr export</code> and paste the output below.
              </p>
              <textarea
                className="loot-input loot-textarea"
                value={json}
                onChange={e => setJson(e.target.value)}
                placeholder='[{"itemID":28508,"awardedTo":"Vitok-Thunderstrike",...}]'
                spellCheck={false}
              />
            </div>
            {error && <div className="loot-error">{error}</div>}
            {result && (
              <div className="loot-success">
                Imported {result.inserted} entries across {result.raids?.join(', ')}.{' '}
                <Link href={`/loot/${result.sessionId}`} style={{ color: 'var(--gold)' }}>
                  View →
                </Link>
              </div>
            )}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? 'Importing…' : 'Import Log'}
            </button>
          </form>
        </div>

        {/* Past sessions */}
        {sessions.length > 0 && (
          <div style={{ marginTop: '2.5rem' }}>
            <h2 style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '1rem' }}>
              Your Uploads
            </h2>
            <table className="player-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Raids</th>
                  <th>Items</th>
                  <th>Uploaded</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/loot/${s.id}`} style={{ color: 'var(--gold)', textDecoration: 'none', fontWeight: 600 }}>
                        {s.title}
                      </Link>
                    </td>
                    <td style={{ color: 'var(--text2)', fontSize: '.85rem' }}>
                      {(s.raids || []).filter(Boolean).join(', ') || '—'}
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{s.entry_count}</td>
                    <td style={{ color: 'var(--text3)', fontSize: '.82rem' }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ display: 'flex', gap: '.75rem' }}>
                      <Link href={`/loot/${s.id}`} className="subtle-link" style={{ fontSize: '.85rem' }}>
                        View →
                      </Link>
                      <button
                        onClick={() => handleDelete(s.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: '.82rem', fontFamily: 'inherit', padding: 0 }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
