import { wclFreshQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // 1. Introspect the Character type to find exact args for encounterRankings and zoneRankings
    const schema = await wclFreshQuery(`{
      __type(name: "Character") {
        fields {
          name
          args { name type { name kind ofType { name kind } } }
        }
      }
    }`);
    const charFields = schema?.__type?.fields || [];
    const erField = charFields.find(f => f.name === 'encounterRankings');
    const zrField = charFields.find(f => f.name === 'zoneRankings');

    // 2. Try encounterRankings without limit arg
    const encTest = await wclFreshQuery(`
      query($n:String!,$s:String!,$r:String!) {
        characterData {
          character(name:$n, serverSlug:$s, serverRegion:$r) {
            e623: encounterRankings(encounterID: 623)
            e731: encounterRankings(encounterID: 731)
          }
        }
      }
    `, { n: name, s: server, r: region }).catch(e => ({ _err: e.message }));

    return res.json({
      encounterRankingsArgs: erField?.args,
      zoneRankingsArgs:      zrField?.args,
      encTest: encTest?.characterData?.character ?? encTest,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
