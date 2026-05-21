import { getStats } from '../../lib/redis';

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD || req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const stats = await getStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
  }
}
