/**
 * GET /api/debug_zones
 * Step 1: Get encounter IDs from zones.
 * Step 2: Try encounterRankings for Vitoduud with those IDs.
 */
import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  // Get encounter IDs from SSC/TK zone (1010)
  const zoneData = await wclFreshQuery(`{
    worldData {
      ssc_tk:   zone(id: 1010) { id name encounters { id name } }
      bt_hyjal: zone(id: 1011) { id name encounters { id name } }
      kara:     zone(id: 1007) { id name encounters { id name } }
    }
  }`);

  const zones = [
    zoneData?.worldData?.ssc_tk,
    zoneData?.worldData?.bt_hyjal,
    zoneData?.worldData?.kara,
  ].filter(Boolean);

  // Get first few encounter IDs to test with encounterRankings
  const allEncounters = zones.flatMap(z => (z.encounters || []).map(e => ({ ...e, zoneName: z.name })));
  const testIds = allEncounters.slice(0, 6).map(e => e.id);

  let encRankings = null;
  if (testIds.length > 0) {
    const aliases = testIds.map(id => `e${id}: encounterRankings(encounterID: ${id}, limit: 1)`).join('\n');
    const rankData = await wclFreshQuery(`
      query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            ${aliases}
          }
        }
      }
    `, { name, serverSlug: server, serverRegion: region });
    encRankings = rankData?.characterData?.character;
  }

  return res.json({ zones: allEncounters, testIds, encRankings });
}
