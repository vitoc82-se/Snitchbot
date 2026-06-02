import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    const partData = await wclFreshQuery(`{
      worldData {
        ssc_tk: zone(id: 1010) { id name partitions { id name default } }
        kara:   zone(id: 1007) { id name partitions { id name default } }
      }
    }`);

    const partitions = partData?.worldData?.ssc_tk?.partitions || [];

    const partTests = {};
    for (const part of partitions) {
      const r = await wclFreshQuery(`
        query($n:String!,$s:String!,$r:String!) {
          characterData {
            character(name:$n, serverSlug:$s, serverRegion:$r) {
              e731: encounterRankings(encounterID: 731, partition: ${part.id})
            }
          }
        }
      `, { n: name, s: server, r: region }).catch(e => e.message);
      partTests[`p${part.id}_${part.name}`] = r?.characterData?.character?.e731 ?? r;
    }

    return res.json({ partitions, partTests });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
