import { useState, Fragment } from 'react';
import { CLASS_ORDER, POT_COLS } from '../lib/constants';
import { isPrepared, isPotRelevant, classColor } from '../lib/scoring';
import Cell from './Cell';

export default function PlayerTable({ players }) {
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

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="th-player">Player</th>
            <th colSpan={5} className="group-header pre-header">Pre-fight</th>
            <th colSpan={POT_COLS.length} className="group-header pot-header">Potions</th>
          </tr>
          <tr>
            <th>Flask</th>
            <th>Battle Elixir</th>
            <th>Guard. Elixir</th>
            <th>Food</th>
            <th>Scrolls</th>
            {POT_COLS.map(c => <th key={c.key}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {orderedClasses.map(cls => {
            const color   = classColor(cls);
            const isOpen  = !!expanded[cls];
            const members = groups[cls] || [];
            const ready   = members.filter(isPrepared).length;

            return (
              <Fragment key={cls}>
                <tr className="class-group-row class-group-clickable" onClick={() => toggle(cls)}>
                  <td colSpan={1 + 5 + POT_COLS.length} style={{ color, borderLeft: `4px solid ${color}` }}>
                    <span className="class-group-arrow">{isOpen ? '▾' : '▸'}</span>
                    {cls}
                    <span className="class-group-count"> — {ready}/{members.length} prepared</span>
                  </td>
                </tr>
                {members
                  .slice()
                  .sort((a, b) => isPrepared(b) - isPrepared(a))
                  .map(p => (
                    <tr key={p.name} className={isPrepared(p) ? 'row-good' : 'row-bad'} style={{ display: isOpen ? '' : 'none' }}>
                      <td className="player-name" style={{ color }}>{p.name}</td>
                      <Cell value={p.flask} na={p.battle_elixir && p.guardian_elixir} />
                      <Cell value={p.battle_elixir}   na={p.flask} />
                      <Cell value={p.guardian_elixir} na={p.flask} />
                      <Cell value={p.food} />
                      <Cell value={p.scrolls} />
                      {POT_COLS.map(c => (
                        <Cell key={c.key} value={p[c.key]} na={!isPotRelevant(p, c.key)} />
                      ))}
                    </tr>
                  ))
                }
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
