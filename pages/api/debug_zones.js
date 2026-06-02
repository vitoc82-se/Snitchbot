import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // Get partitions for TBC zones
    const partData = await wclFreshQuery(`{
      worldData {
        ssc_tk:   zone(id: 1010) { id name partitions { id name isDefault } }
        kara:     zone(id: 1007) { id name partitions { id name isDefault } }
      }
    }`);

    const partitions = partData?.worldData?.ssc_tk?.partitions || [];

    // Try encounterRankings with each partition
    const partTests = {};
    for (const part of partitions) {
      const result = await wclFreshQuery(`
        query($n:String!,$s:String!,$r:String!) {
          characterData {
            character(name:$n, serverSlug:$s, serverRegion:$r) {
              e731: encounterRankings(encounterID: 731, partition: ${part.id})
            }
          }
        }
      `, { n: name, s: server, r: region }).catch(e => ({ _err: e.message }));
      partTests[`partition_${part.id}_${part.name}`] = result?.characterData?.character?.e731 ?? result;
    }

    // Also try without partition on Void Reaver (731)
    const noPartTest = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) {
            e731: encounterRankings(encounterID: 731)
          }
        }
      }
    `, { n: name, s: server, r: region }).catch(e => ({ _err: e.message }));

    return res.json({
      sscPartitions: partitions,
      noPartitionTest: noPartTest?.characterData?.character?.e731 ?? noPartTest,
      partitionTests: partTests,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
