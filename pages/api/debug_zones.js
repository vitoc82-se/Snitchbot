import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // Test encounterRankings with the CORRECT IDs (worldData ID + 100000)
    // Also test fetching multiple zones via zoneRankings with different IDs
    const data = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) {
            id name

            # Get report code for Void Reaver best kill
            voidReaver: encounterRankings(encounterID: 100731)

            # Does no-zone zoneRankings also return Kara / BT / other tiers?
            allZones: zoneRankings
          }
        }
      }
    `, { n: name, s: server, r: region });

    const char = data?.characterData?.character;
    const vr = char?.voidReaver;
    const rankings = char?.allZones?.rankings || [];

    return res.json({
      encounterRankings_voidReaver: {
        rankingsCount: vr?.rankings?.length ?? vr,
        bestKill: vr?.rankings?.[0] ? {
          report: vr.rankings[0].report,
          startTime: vr.rankings[0].startTime,
          duration: vr.rankings[0].duration,
          spec: vr.rankings[0].spec,
          amount: vr.rankings[0].amount,
        } : null,
      },
      zoneRankings_summary: {
        zone: char?.allZones?.zone,
        encounterCount: rankings.length,
        encounters: rankings.map(r => ({ id: r.encounter?.id, name: r.encounter?.name, kills: r.totalKills })),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
