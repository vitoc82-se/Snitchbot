import { useState } from 'react';
import { score, maxScore, classColor } from '../lib/scoring';
import PlayerModal from './PlayerModal';

const POT_BOARD_COLS = [
  { key: 'haste_potion',       label: 'Haste Pot'  },
  { key: 'destruction_potion', label: 'Dest Pot'   },
  { key: 'mana_potion',        label: 'Mana Pot'   },
];

function PotionLeaderboard({ rows }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className="pot-leaderboard">
      <h3 className="pot-leaderboard-title">Potion Usage &mdash; Entire Raid (including trash)</h3>
      {safeRows.length === 0 ? (
        <p style={{ color: '#666', fontSize: '13px' }}>No potion data found.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="pot-rank-col">#</th>
                <th className="th-player">Player</th>
                {POT_BOARD_COLS.map(c => <th key={c.key}>{c.label}</th>)}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((p, i) => {
                const color = classColor(p.class);
                return (
                  <tr key={p.name} className={p.total > 0 ? 'row-good' : 'row-bad'}>
                    <td className="center pot-rank-col" style={{ color: '#666' }}>{i + 1}</td>
                    <td className="player-name" style={{ color }}>{p.name}</td>
                    {POT_BOARD_COLS.map(c => (
                      <td key={c.key} className="center">
                        {p[c.key] > 0
                          ? <span className="check">{p[c.key]}×</span>
                          : <span style={{ color: '#444' }}>—</span>}
                      </td>
                    ))}
                    <td className="center">
                      {p.total > 0
                        ? <strong className="check">{p.total}</strong>
                        : <span className="cross">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function buildRankingStats(bosses) {
  const stats = {};
  bosses.forEach(boss => {
    boss.attempts.forEach(attempt => {
      attempt.players.forEach(p => {
        if (!stats[p.name]) {
          stats[p.name] = { name: p.name, class: p.class, role: p.role, totalScore: 0, totalMax: 0, pulls: 0 };
        }
        stats[p.name].totalScore += score(p);
        stats[p.name].totalMax  += maxScore(p);
        stats[p.name].pulls++;
      });
    });
  });
  return Object.values(stats).map(s => ({
    ...s,
    avgPct:   s.totalScore / s.totalMax,
    avgScore: s.totalScore / s.pulls,
  }));
}

// Raid-wide rankings averaged across all bosses and attempts.
export default function RankingsView({ bosses, potionLeaderboard }) {
  const [selected, setSelected] = useState(null);

  const allStats  = buildRankingStats(bosses);
  const top5      = [...allStats].sort((a, b) => b.avgPct - a.avgPct).slice(0, 5);
  const top5Names = new Set(top5.map(s => s.name));
  const bot5      = [...allStats].sort((a, b) => a.avgPct - b.avgPct).filter(s => !top5Names.has(s.name)).slice(0, 5);

  const selectedPlayer = selected
    ? bosses.flatMap(b => b.attempts).flatMap(a => a.players).find(p => p.name === selected)
    : null;

  function RankRow({ rank, s }) {
    const color = classColor(s.class);
    const pct   = Math.round(s.avgPct * 100);
    const mx    = maxScore({ class: s.class, role: s.role });
    return (
      <div className="rank-row rank-clickable" onClick={() => setSelected(s.name)} title="Click for full breakdown">
        <span className="rank-num">{rank}</span>
        <span className="rank-name" style={{ color }}>{s.name}</span>
        <span className="rank-class" style={{ color }}>{s.class}</span>
        <div className="rank-bar-wrap">
          <div className="rank-bar" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span className="rank-score">{s.avgScore.toFixed(1)}<span className="rank-denom">/{mx}</span></span>
        <span className="rank-arrow">›</span>
      </div>
    );
  }

  return (
    <>
      <p className="rank-subtitle">Averaged across all bosses and pulls · score is class-adjusted</p>
      <div className="rankings-wrap">
        <div className="rank-section">
          <h3 className="rank-title rank-title-good">Top 5 Most Prepared</h3>
          {top5.map((s, i) => <RankRow key={s.name} rank={i + 1} s={s} />)}
        </div>
        <div className="rank-section">
          <h3 className="rank-title rank-title-bad">Top 5 Least Prepared</h3>
          {bot5.map((s, i) => <RankRow key={s.name} rank={i + 1} s={s} />)}
        </div>
      </div>
      {selected && selectedPlayer && (
        <PlayerModal player={selectedPlayer} bosses={bosses} onClose={() => setSelected(null)} />
      )}
      <PotionLeaderboard rows={potionLeaderboard} />
    </>
  );
}
