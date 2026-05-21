import { POT_COLS } from '../lib/constants';
import { relevantPots, score, maxScore, classColor } from '../lib/scoring';
import Cell from './Cell';

// Per-player breakdown modal showing every boss/attempt in the log.
// Receives the resolved player object directly so we don't re-scan bosses inside.
export default function PlayerModal({ player, bosses, onClose }) {
  const color = classColor(player.class);
  const rel   = relevantPots(player);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-player-name" style={{ color }}>
            {player.name}
            <span className="modal-class"> — {player.class}</span>
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {bosses.map(boss => {
            const rows = boss.attempts
              .map(a => ({ attempt: a, p: a.players.find(x => x.name === player.name) }))
              .filter(r => r.p);
            if (!rows.length) return null;
            return (
              <div key={boss.name} className="modal-boss-section">
                <div className="modal-boss-label">{boss.name}</div>
                <div className="modal-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="th-attempt">Attempt</th>
                        <th>Flask</th>
                        <th>Battle Elix</th>
                        <th>Guard. Elix</th>
                        <th>Food</th>
                        {POT_COLS.filter(c => rel.has(c.key)).map(c => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ attempt, p }) => (
                        <tr key={attempt.id} className={attempt.isKill ? 'row-kill' : 'row-wipe'}>
                          <td className="attempt-label">
                            <span className={`badge ${attempt.isKill ? 'badge-kill' : 'badge-wipe'}`}>
                              {attempt.isKill ? 'Kill' : `Wipe ${attempt.attempt}`}
                            </span>
                          </td>
                          <Cell value={p.flask} na={p.battle_elixir && p.guardian_elixir} />
                          <Cell value={p.battle_elixir}   na={p.flask} />
                          <Cell value={p.guardian_elixir} na={p.flask} />
                          <td className="center">
                            <span className={p.food ? 'check' : 'cross'}>{p.food ? '✓' : '✗'}</span>
                          </td>
                          {POT_COLS.filter(c => rel.has(c.key)).map(c => (
                            <td key={c.key} className="center">
                              <span className={p[c.key] ? 'check' : 'cross'}>{p[c.key] ? '✓' : '✗'}</span>
                            </td>
                          ))}
                          <td className="center modal-score">{score(p)}/{maxScore(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
