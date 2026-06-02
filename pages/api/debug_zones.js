/**
 * GET /api/debug_zones
 * Tests the Fresh WCL API and dumps zone/character data.
 * Shows whether credentials are configured correctly.
 */
import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const hasCreds = !!(process.env.WCL_FRESH_CLIENT_ID && process.env.WCL_FRESH_CLIENT_SECRET);

  if (!hasCreds) {
    return res.status(503).json({
      error: 'WCL_FRESH_CLIENT_ID and WCL_FRESH_CLIENT_SECRET are not set.',
      action: 'Register a client at https://fresh.warcraftlogs.com/api/clients then add both env vars in Vercel.',
    });
  }

  try {
    const data = await wclFreshQuery(`{
      worldData {
        expansions { id name }
        zones { id name encounters { id name } }
      }
    }`);
    return res.json({ credentialsOk: true, data });
  } catch (err) {
    return res.status(500).json({ credentialsOk: false, error: err.message });
  }
}
