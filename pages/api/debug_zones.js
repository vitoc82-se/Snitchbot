/**
 * GET /api/debug_zones
 * Dumps WCL worldData so we can identify TBC zone IDs and names.
 * Tries multiple expansion IDs to find the right one for TBC Fresh/Classic.
 */
import { wclQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  try {
    // Query everything that might tell us about TBC zones
    const data = await wclQuery(`{
      worldData {
        expansions { id name }
        allZones: zones { id name }
        exp1:  expansion(id:  1)  { id name zones { id name } }
        exp2:  expansion(id:  2)  { id name zones { id name encounters { id name } } }
        exp3:  expansion(id:  3)  { id name zones { id name } }
        exp9:  expansion(id:  9)  { id name zones { id name } }
        exp10: expansion(id: 10)  { id name zones { id name } }
      }
    }`);
    return res.json(data);
  } catch (err) {
    // If the batched query fails (e.g. invalid expansion IDs), try simpler version
    try {
      const simple = await wclQuery(`{
        worldData {
          expansions { id name }
          zones { id name }
        }
      }`);
      return res.json({ simple, originalError: err.message });
    } catch (err2) {
      return res.status(500).json({ error: err.message, error2: err2.message });
    }
  }
}
