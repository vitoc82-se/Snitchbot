import { wclQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  // Test 1: minimal character lookup — no guild field that might vary by schema
  const charMinimal = await wclQuery(`
    query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          id classID name
        }
      }
    }
  `, { name, serverSlug: server, serverRegion: region }).catch(e => ({ _err: e.message }));

  // Test 2: zone rankings without knowing zone IDs — try zoneRankings with no args
  const charRankings = await wclQuery(`
    query($name: String!, $serverSlug: String!, $serverRegion: String!) {
      characterData {
        character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
          id
          z1: zoneRankings(zoneID: 1)
          z2: zoneRankings(zoneID: 2)
          z3: zoneRankings(zoneID: 3)
          z4: zoneRankings(zoneID: 4)
          z5: zoneRankings(zoneID: 5)
        }
      }
    }
  `, { name, serverSlug: server, serverRegion: region }).catch(e => ({ _err: e.message }));

  return res.json({
    charMinimal: charMinimal?.characterData?.character ?? charMinimal,
    charRankings: charRankings?.characterData?.character ?? charRankings,
  });
}
