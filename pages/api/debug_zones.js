/**
 * GET /api/debug_zones?name=Vitok&server=thunderstrike&region=EU
 * Checks Karazhan + Gruul/Mag encounter IDs and whether they work for encounterRankings.
 */
import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitok', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // 1. Get encounter IDs for Kara and Gruul/Mag from worldData
    const zoneData = await wclFreshQuery(`{
      worldData {
        kara:  zone(id: 1007) { id name encounters { id name } }
        gruul: zone(id: 1008) { id name encounters { id name } }
        ssc:   zone(id: 1010) { id name encounters { id name } }
      }
    }`);

    const karaEncs  = zoneData?.worldData?.kara?.encounters  || [];
    const gruulEncs = zoneData?.worldData?.gruul?.encounters || [];
    const sscEncs   = zoneData?.worldData?.ssc?.encounters   || [];

    // 2. Test encounterRankings for first 3 Kara + 2 Gruul encounters (with +100000 offset)
    const testEncs = [
      ...karaEncs.slice(0, 3).map(e => ({ ...e, zone: 'Kara',  rankId: e.id + 100000 })),
      ...gruulEncs.slice(0, 2).map(e => ({ ...e, zone: 'Gruul', rankId: e.id + 100000 })),
    ];

    const aliases = testEncs.map(e => `e${e.rankId}: encounterRankings(encounterID: ${e.rankId})`).join('\n');
    const charData = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) { ${aliases} }
        }
      }
    `, { n: name, s: server, r: region });

    const char = charData?.characterData?.character;

    // 3. Also try zoneRankings for nearby zone IDs to find Kara/Gruul ranking zones
    const zrAliases = [1050,1051,1052,1053,1054,1055,1056,1057,1058].map(id =>
      `zr${id}: zoneRankings(zoneID: ${id})`
    ).join('\n');
    const zrData = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) { ${zrAliases} }
        }
      }
    `, { n: name, s: server, r: region });

    const zrChar = zrData?.characterData?.character;
    const zrResults = {};
    [1050,1051,1052,1053,1054,1055,1056,1057,1058].forEach(id => {
      const zr = zrChar?.[`zr${id}`];
      zrResults[id] = zr?.error ? `ERROR: ${zr.error}` : {
        zone: zr?.zone, rankings: zr?.rankings?.length, firstBoss: zr?.rankings?.[0]?.encounter?.name
      };
    });

    return res.json({
      karaEncounters:  karaEncs.map(e => ({ id: e.id, name: e.name, rankId: e.id + 100000 })),
      gruulEncounters: gruulEncs.map(e => ({ id: e.id, name: e.name, rankId: e.id + 100000 })),
      sscSample:       sscEncs.slice(0,2).map(e => ({ id: e.id, name: e.name, rankId: e.id + 100000 })),
      encounterRankingTests: testEncs.map(e => ({
        boss: e.name, zone: e.zone, rankId: e.rankId,
        result: char?.[`e${e.rankId}`]?.error
          ? `ERROR: ${char[`e${e.rankId}`].error}`
          : { kills: char?.[`e${e.rankId}`]?.totalKills, best: char?.[`e${e.rankId}`]?.bestAmount }
      })),
      zoneRankingsByID: zrResults,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
