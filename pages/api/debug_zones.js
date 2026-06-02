/**
 * GET /api/debug_zones
 * Introspects the WCL GraphQL schema to find exact character query parameters,
 * then tests character lookup with different parameter combinations.
 */
import { wclQuery } from '../../lib/wcl';

export default async function handler(req, res) {
  const { name = 'Vitoduud', server = 'thunderstrike', region = 'EU' } = req.query;

  // 1. Introspect the character field to see all accepted arguments
  const introspect = await wclQuery(`{
    __type(name: "CharacterData") {
      fields {
        name
        args {
          name
          type { name kind ofType { name kind } }
        }
      }
    }
  }`).catch(e => ({ _err: e.message }));

  // 2. Try character lookup with various combos — maybe gameVersion is needed
  const tests = {};

  // Basic lookup
  tests.basic = await wclQuery(`
    query($name:String!,$slug:String!,$region:String!) {
      characterData {
        character(name:$name, serverSlug:$slug, serverRegion:$region) { id classID name }
      }
    }`, { name, slug: server, region }).catch(e => e.message);

  // Lowercase name
  tests.lowercase = await wclQuery(`
    query($name:String!,$slug:String!,$region:String!) {
      characterData {
        character(name:$name, serverSlug:$slug, serverRegion:$region) { id classID name }
      }
    }`, { name: name.toLowerCase(), slug: server, region }).catch(e => e.message);

  // Different region format
  tests.regionLower = await wclQuery(`
    query($name:String!,$slug:String!,$region:String!) {
      characterData {
        character(name:$name, serverSlug:$slug, serverRegion:$region) { id classID name }
      }
    }`, { name, slug: server, region: region.toLowerCase() }).catch(e => e.message);

  // 3. Also check what GameVersion enum values exist
  const gameVersionType = await wclQuery(`{
    __type(name: "GameVersion") { enumValues { name } }
  }`).catch(e => ({ _err: e.message }));

  return res.json({
    characterDataFields: introspect?.__type?.fields?.find(f => f.name === 'character')?.args || introspect,
    gameVersionValues: gameVersionType?.__type?.enumValues || gameVersionType,
    tests,
  });
}
