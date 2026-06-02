import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    const data = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) {
            id classID name
            zoneRankings
            zrDps:    zoneRankings(metric: dps)
            zrHps:    zoneRankings(metric: hps)
            zr1010:   zoneRankings(zoneID: 1010)
            zr1010dps: zoneRankings(zoneID: 1010, metric: dps)
            zr1010p2: zoneRankings(zoneID: 1010, partition: 2)
          }
        }
      }
    `, { n: name, s: server, r: region });

    return res.json(data?.characterData?.character ?? { notFound: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
