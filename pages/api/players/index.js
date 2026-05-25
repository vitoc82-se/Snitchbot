import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';
import { score, maxScore } from '../../../lib/scoring';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const reports = await sql`
    SELECT id, data FROM reports WHERE user_id = ${token.dbId}
  `;

  // One entry per player across all reports.
  // Per report: for each boss, use the kill attempt (or last attempt) as the
  // source of truth — same logic as the player detail page.
  const playerMap = {};

  for (const r of reports) {
    // Per-player, accumulate score/max across bosses within this report.
    const raidTotals = {}; // name -> { class, role, totalScore, totalMax, bossCount }

    for (const boss of (r.data.bosses || [])) {
      // Kill attempt is the ground truth; fall back to last attempt.
      const refAttempt =
        boss.attempts?.find(a => a.isKill) ??
        boss.attempts?.[boss.attempts.length - 1];
      if (!refAttempt) continue;

      for (const p of (refAttempt.players || [])) {
        if (!raidTotals[p.name]) {
          raidTotals[p.name] = { class: p.class, role: p.role,
            totalScore: 0, totalMax: 0, bossCount: 0 };
        }
        raidTotals[p.name].totalScore += score(p);
        raidTotals[p.name].totalMax   += maxScore(p);
        raidTotals[p.name].bossCount++;
      }
    }

    // Fold this report's per-boss averages into the global player map.
    for (const [name, rt] of Object.entries(raidTotals)) {
      if (!rt.bossCount) continue;
      if (!playerMap[name]) {
        playerMap[name] = { name, class: rt.class, role: rt.role,
          appearances: 0, totalScore: 0, totalMax: 0 };
      }
      const entry = playerMap[name];
      entry.appearances++;
      // Add per-raid avg (keeps the same unit as the player detail overview).
      entry.totalScore += rt.totalScore / rt.bossCount;
      entry.totalMax   += rt.totalMax   / rt.bossCount;
    }
  }

  const rows = Object.values(playerMap).map(e => ({
    name:        e.name,
    class:       e.class,
    role:        e.role,
    appearances: e.appearances,
    avg_score:   e.appearances ? +(e.totalScore / e.appearances).toFixed(2) : 0,
    avg_max:     e.appearances ? +(e.totalMax   / e.appearances).toFixed(2) : 0,
  })).sort((a, b) => b.avg_score - a.avg_score);

  res.json(rows);
}
