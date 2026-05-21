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

  // One entry per (player, report) — consumables don't change within a raid
  const playerMap = {};
  for (const r of reports) {
    const seen = {}; // name -> first player snapshot in this report
    for (const boss of (r.data.bosses || [])) {
      for (const attempt of (boss.attempts || [])) {
        for (const p of (attempt.players || [])) {
          if (!seen[p.name]) seen[p.name] = p;
        }
      }
    }
    for (const p of Object.values(seen)) {
      if (!playerMap[p.name]) {
        playerMap[p.name] = { name: p.name, class: p.class, role: p.role,
          appearances: 0, totalScore: 0, totalMax: 0, preparedCount: 0 };
      }
      const entry = playerMap[p.name];
      entry.appearances++;
      entry.totalScore   += score(p);
      entry.totalMax     += maxScore(p);
      if (p.prepared) entry.preparedCount++;
    }
  }

  const rows = Object.values(playerMap).map(e => ({
    name:           e.name,
    class:          e.class,
    role:           e.role,
    appearances:    e.appearances,
    avg_score:      e.appearances ? +(e.totalScore / e.appearances).toFixed(2) : 0,
    avg_max:        e.appearances ? +(e.totalMax   / e.appearances).toFixed(2) : 0,
    prepared_count: e.preparedCount,
  })).sort((a, b) => b.avg_score - a.avg_score);

  res.json(rows);
}
