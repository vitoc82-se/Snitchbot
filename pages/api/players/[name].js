import { getToken } from 'next-auth/jwt';
import sql from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.dbId) return res.status(401).json({ error: 'Not logged in' });

  const { name } = req.query;

  const reports = await sql`
    SELECT id, wcl_code, title, created_at, data
    FROM reports
    WHERE user_id = ${token.dbId}
    ORDER BY created_at DESC
  `;

  const result = reports.map(r => {
    const bosses = (r.data.bosses || []).map(b => {
      const playerAttempts = (b.attempts || []).map(a => {
        const p = (a.players || []).find(pl => pl.name === name);
        return p ? { attempt: a.attempt, isKill: a.isKill, ...p } : null;
      }).filter(Boolean);
      return playerAttempts.length ? { name: b.name, attempts: playerAttempts } : null;
    }).filter(Boolean);

    return bosses.length
      ? { id: r.id, wcl_code: r.wcl_code, title: r.title, created_at: r.created_at, bosses }
      : null;
  }).filter(Boolean);

  res.json(result);
}
