import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // Get the full encounter list from SSC/TK zone
    const zoneData = await wclFreshQuery(`{
      worldData {
        zone(id: 1010) { id name encounters { id name } }
      }
    }`).catch(e => ({ _zoneErr: e.message }));

    // Try encounterRankings with the encounter IDs we already know exist
    // from the worldData.zones dump: SSC/TK has 10 encounters
    // Let's just try the first zone's encounters directly
    const encounters = zoneData?.worldData?.zone?.encounters || [];

    // If zone query worked, test encounterRankings with those IDs
    let encTest = null;
    if (encounters.length > 0) {
      const aliases = encounters.slice(0, 4).map(e => `e${e.id}: encounterRankings(encounterID: ${e.id}, limit: 1)`).join('\n');
      encTest = await wclFreshQuery(`
        query($n:String!,$s:String!,$r:String!) {
          characterData {
            character(name:$n, serverSlug:$s, serverRegion:$r) { ${aliases} }
          }
        }
      `, { n: name, s: server, r: region }).catch(e => ({ _encErr: e.message }));
    }

    return res.json({
      zoneQuery:  zoneData?._zoneErr ? { error: zoneData._zoneErr } : zoneData?.worldData?.zone,
      encounters: encounters.slice(0, 4),
      encRankings: encTest?.characterData?.character ?? encTest,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0,5) });
  }
}
