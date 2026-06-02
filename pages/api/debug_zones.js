/**
 * GET /api/debug_zones
 * Dumps what WCL worldData returns so we can identify TBC zone IDs and names.
 */
import { wclQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  try {
    const data = await wclQuery(`{
      worldData {
        zones { id name }
        tbc: expansion(id: 2) { zones { id name encounters { id name } } }
      }
    }`);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
