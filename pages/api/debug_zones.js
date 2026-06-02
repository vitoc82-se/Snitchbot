/**
 * GET /api/debug_zones?name=Vitok&server=thunderstrike&region=EU
 * Scans zone IDs 1000-1070 to find which ones have ranking data for this character.
 */
import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitok', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // Scan zone IDs in batches of 20 to find which ones work
    const ranges = [
      [1000,1020], [1020,1040], [1040,1060], [1060,1080]
    ];

    const working = [];

    for (const [start, end] of ranges) {
      const ids = Array.from({ length: end - start }, (_, i) => start + i);
      const aliases = ids.map(id => `zr${id}: zoneRankings(zoneID: ${id})`).join('\n');
      const data = await wclFreshQuery(`
        query($n:String!,$s:String!,$r:String!) {
          characterData {
            character(name:$n, serverSlug:$s, serverRegion:$r) { ${aliases} }
          }
        }
      `, { n: name, s: server, r: region }).catch(e => null);

      const char = data?.characterData?.character;
      if (!char) continue;

      for (const id of ids) {
        const zr = char[`zr${id}`];
        if (zr && !zr.error && zr.rankings?.length > 0) {
          working.push({
            zoneId: id,
            bossCount: zr.rankings.length,
            firstBoss: zr.rankings[0]?.encounter?.name,
            kills: zr.rankings.filter(r => r.totalKills > 0).length,
          });
        }
      }
    }

    return res.json({ workingZones: working });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
