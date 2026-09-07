import { useState, Fragment } from 'react';
import { CLASS_ORDER, POT_COLS } from '../lib/constants';
import { isPrepReady, isPotRelevant, prepScore, prepMax, potionStatus, potionCount,
         relevantPotKeys, POTION_MIN_FIGHT_MS, classColor, weaponBuffType, DEFAULT_MANDATORY } from '../lib/scoring';
import Cell from './Cell';

// Small coloured pill describing a player's in-combat potion use for one fight.
function PotionPill({ p, mandatory }) {
  const status = potionStatus(p, mandatory);
  const count  = potionCount(p);
  if (status === 'used') {
    return <span className="score-badge" style={{ color: '#5aad6f' }}>{count > 0 ? `${count}×` : '✓'}</span>;
  }
  if (status === 'missing') {
    return <span className="score-badge" style={{ color: '#f5c842' }}>none</span>;
  }
  // Not applicable — explain why (short fight vs no relevant pot for this role).
  const hasRelevant = relevantPotKeys(p.class, p.role).length > 0;
  const shortFight  = p.fightDurationMs != null && p.fightDurationMs < POTION_MIN_FIGHT_MS;
  const label = hasRelevant && shortFight ? '— <60s' : '—';
  return <span className="score-badge" style={{ color: '#7a7a7a' }}>{label}</span>;
}

const PRE_COLS_DEF = [
  { key: 'flask',            label: 'Flask'        },
  { key: 'battle_elixir',   label: 'Battle Elixir' },
  { key: 'guardian_elixir', label: 'Guard. Elixir' },
  { key: 'food',            label: 'Food'          },
  { key: 'weapon_oil',      label: 'Weapon Oil'    },
  { key: 'weapon_stone',    label: 'Weapon Stone'  },
  { key: 'scrolls',         label: 'Scrolls'       },
];

export default function PlayerTable({ players, tableView = 'pre', mandatory = DEFAULT_MANDATORY, showSR = false, onPlayerClick }) {
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

  const colCount = 1 + (tableView === 'pre' ? PRE_COLS_DEF.length : POT_COLS.length) + 2 + (showSR ? 1 : 0);

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
            <th style={{ textAlign: 'center' }}>Prep</th>
            <th style={{ textAlign: 'center' }}>Potion</th>
            {showSR && <th style={{ textAlign: 'center' }}>Shadow Res</th>}
          </tr>
        </thead>
        <tbody>
          {orderedClasses.map(cls => {
            const color   = classColor(cls);
            const isOpen  = !!expanded[cls];
            const members = groups[cls] || [];
            const ready   = members.filter(p => isPrepReady(p, mandatory)).length;

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
                  .sort((a, b) => isPrepReady(b, mandatory) - isPrepReady(a, mandatory))
                  .map(p => {
                    const s  = prepScore(p, mandatory);
                    const mx = prepMax(p, mandatory);
                    const pct = mx ? s / mx : 1;
                    const scoreColor = pct >= 1 ? '#5aad6f' : pct >= 0.6 ? '#f5c842' : '#c45a4a';
                    return (
                      <tr key={p.name}
                        className={isPrepReady(p, mandatory) ? 'row-good' : 'row-bad'}
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
                            <Cell value={p.weapon_oil} na={weaponBuffType(p) !== 'oil'} />
                            {weaponBuffType(p) === 'stone' && !p.weapon_stone && p.windfury
                              ? <td className="center"><span style={{ color: '#f5c842', fontWeight: 700, fontSize: '.82rem' }}>WF</span></td>
                              : <Cell value={p.weapon_stone} na={weaponBuffType(p) !== 'stone'} />
                            }
                            <Cell value={p.scrolls} na={!p.scrolls} />
                          </>
                        ) : (
                          POT_COLS.map(c => (
                            <Cell key={c.key} value={p[c.key]} na={!isPotRelevant(p, c.key)} />
                          ))
                        )}
                        <td className="center">
                          <span className="score-badge" style={{ color: scoreColor }}>{s}/{mx}</span>
                        </td>
                        <td className="center">
                          <PotionPill p={p} mandatory={mandatory} />
                        </td>
                        {showSR && (
                          <td className="center">
                            <span className="score-badge"
                              style={{ color: (p.shadowResist || 0) >= 70 ? '#5aad6f' : (p.shadowResist || 0) > 0 ? '#f5c842' : '#c45a4a' }}>
                              {p.shadowResist || 0}
                            </span>
                          </td>
                        )}
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
