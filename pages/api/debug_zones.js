/**
 * GET /api/debug_zones?name=Vitoduud&server=thunderstrike&region=EU
 * Dumps raw zoneRankings response so we can see the exact structure.
 */
import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  // Query zone rankings for TBC zones — dump raw response to see structure
  const data = await wclFreshQuery(`
    query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          id classID name
          ssc_tk:   zoneRankings(zoneID: 1010)
          bt_hyjal: zoneRankings(zoneID: 1011)
          kara:     zoneRankings(zoneID: 1007)
          gruul:    zoneRankings(zoneID: 1008)
          sunwell:  zoneRankings(zoneID: 1013)
          za:       zoneRankings(zoneID: 1012)
        }
      }
    }
  `, { name, serverSlug: server, serverRegion: region });

  return res.json(data?.characterData?.character ?? { error: 'character not found' });
}
