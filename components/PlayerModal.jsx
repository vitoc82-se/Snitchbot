import { POT_COLS } from '../lib/constants';
import { relevantPots, prepScore, prepMax, potionStatus, potionCount, classColor, DEFAULT_MANDATORY } from '../lib/scoring';
import Cell from './Cell';

function PotCell({ p, mandatory }) {
  const status = potionStatus(p, mandatory);
  const count  = potionCount(p);
  if (status === 'used')    return <td className="center" style={{ color: '#5aad6f', fontWeight: 700 }}>{count > 0 ? `${count}×` : '✓'}</td>;
  if (status === 'missing') return <td className="center" style={{ color: '#f5c842', fontWeight: 700 }}>none</td>;
  return <td className="center" style={{ color: '#7a7a7a' }}>—</td>;
}

export default function PlayerPanel({ player, bosses, mandatory = DEFAULT_MANDATORY, onClose }) {
  if (!player) return null;
  const color = classColor(player.class);
  const rel   = relevantPots(player);

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="player-panel open">
        <div className="panel-header">
          <span className="modal-player-name" style={{ color }}>
            {player.name}
            <span className="modal-class"> — {player.class}</span>
          </span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="panel-body">
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
                        <th>Battle</th>
                        <th>Guard.</th>
                        <th>Food</th>
                        {POT_COLS.filter(c => rel.has(c.key)).map(c => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                        <th>Prep</th>
                        <th>Pot</th>
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
                          <Cell value={p.food} />
                          {POT_COLS.filter(c => rel.has(c.key)).map(c => (
                            <Cell key={c.key} value={p[c.key]} />
                          ))}
                          <td className="center modal-score">{prepScore(p, mandatory)}/{prepMax(p, mandatory)}</td>
                          <PotCell p={p} mandatory={mandatory} />
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
    </>
  );
}
