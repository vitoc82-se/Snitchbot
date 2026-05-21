import { useState, Fragment } from 'react';
import { CLASS_ORDER, POT_COLS } from '../lib/constants';
import { isPrepared, isPotRelevant, score, maxScore, classColor, DEFAULT_MANDATORY } from '../lib/scoring';
import Cell from './Cell';

const PRE_COLS_DEF = [
  { key: 'flask',            label: 'Flask'        },
  { key: 'battle_elixir',   label: 'Battle Elixir' },
  { key: 'guardian_elixir', label: 'Guard. Elixir' },
  { key: 'food',            label: 'Food'          },
  { key: 'scrolls',         label: 'Scrolls'       },
];

export default function PlayerTable({ players, tableView = 'pre', mandatory = DEFAULT_MANDATORY, onPlayerClick }) {
  const [expanded, setExpanded] = useState({});

  const groups = {};
  players.forEach(p => {
    const cls = p.class || 'Unknown';
    if (!groups[cls]) groups[cls] = [];
    groups[cls].push(p);
  });

  const orderedClasses = [
    ...CLASS_ORDER.filter(c => groups[c]),
    ...Object.keys(groups).filter(c => !CLASS_ORDER.includes(c)),
  ];

  const toggle = cls => setExpanded(prev => ({ ...prev, [cls]: !prev[cls] }));

  const colCount = 1 + (tableView === 'pre' ? PRE_COLS_DEF.length : POT_COLS.length) + 1;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="th-player">Player</th>
            {tableView === 'pre'
              ? PRE_COLS_DEF.map(c => <th key={c.key}>{c.label}</th>)
              : POT_COLS.map(c => <th key={c.key}>{c.label}</th>)
            }
            <th style={{ textAlign: 'center' }}>Score</th>
          </tr>
        </thead>
        <tbody>
          {orderedClasses.map(cls => {
            const color   = classColor(cls);
            const isOpen  = !!expanded[cls];
            const members = groups[cls] || [];
            const ready   = members.filter(p => isPrepared(p, mandatory)).length;

            return (
              <Fragment key={cls}>
                <tr className="class-group-row class-group-clickable" onClick={() => toggle(cls)}>
                  <td colSpan={colCount} style={{ color, borderLeft: `4px solid ${color}` }}>
                    <span className="class-group-arrow">{isOpen ? '▾' : '▸'}</span>
                    {cls}
                    <span className="class-group-count"> — {ready}/{members.length} prepared</span>
                  </td>
                </tr>
                {members
                  .slice()
                  .sort((a, b) => isPrepared(b) - isPrepared(a))
                  .map(p => {
                    const s  = score(p, mandatory);
                    const mx = maxScore(p, mandatory);
                    const pct = mx ? s / mx : 0;
                    const scoreColor = pct >= 1 ? '#4caf50' : pct >= 0.6 ? '#f5c842' : '#e05555';
                    return (
                      <tr key={p.name}
                        className={isPrepared(p, mandatory) ? 'row-good' : 'row-bad'}
                        style={{ display: isOpen ? '' : 'none' }}>
                        <td className="player-name" style={{ color }}>
                          {onPlayerClick
                            ? <button className="player-name-btn" style={{ color }} onClick={() => onPlayerClick(p)}>{p.name}</button>
                            : p.name
                          }
                        </td>
                        {tableView === 'pre' ? (
                          <>
                            <Cell value={p.flask} na={p.battle_elixir && p.guardian_elixir} />
                            <Cell value={p.battle_elixir}   na={p.flask} />
                            <Cell value={p.guardian_elixir} na={p.flask} />
                            <Cell value={p.food} />
                            <Cell value={p.scrolls} />
                          </>
                        ) : (
                          POT_COLS.map(c => (
                            <Cell key={c.key} value={p[c.key]} na={!isPotRelevant(p, c.key)} />
                          ))
                        )}
                        <td className="center">
                          <span className="score-badge" style={{ color: scoreColor }}>{s}/{mx}</span>
                        </td>
                      </tr>
                    );
                  })
                }
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
