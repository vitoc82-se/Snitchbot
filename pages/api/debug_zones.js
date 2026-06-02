/**
 * GET /api/debug_zones?name=Vitoduud&server=thunderstrike&region=EU
 * Tests character lookup + zone data through the existing WCL API.
 */
import { wclQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  try {
    // Test 1: Can we get worldData zones with a game_version filter?
    const zonesResult = await wclQuery(`{
      worldData {
        zones { id name }
      }
    }`).catch(e => ({ error: e.message }));

    // Test 2: Can we find the character through the retail API?
    const charResult = await wclQuery(`
      query($name: String!, $serverSlug: String!, $serverRegion: String!) {
        characterData {
          character(name: $name, serverSlug: $serverSlug, serverRegion: $serverRegion) {
            id
            classID
            guilds { guild { name } }
          }
        }
      }
    `, { name, serverSlug: server, serverRegion: region }).catch(e => ({ error: e.message }));

    return res.json({
      zonesCount:   zonesResult?.worldData?.zones?.length ?? 0,
      zoneSample:   (zonesResult?.worldData?.zones || []).slice(0, 5).map(z => z.name),
      zonesError:   zonesResult?.error || null,
      character:    charResult?.characterData?.character || null,
      charError:    charResult?.error || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
