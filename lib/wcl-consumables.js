/**
 * Shared WCL consumable / gear parsing helpers.
 *
 * Extracted from pages/api/lookup/fetch.js so that both the all-time lookup
 * pipeline (fetch.js) and the weekly tracker pipeline (weekly-fetch.js) parse
 * consumables, enchants, roles and ranking zones through the SAME code — they
 * must never diverge, or the two views would disagree about the same kill.
 */

import {
  FLASK_IDS, FOOD_IDS, GUARDIAN_IDS, BATTLE_IDS,
  POTION_CAST_IDS, WEAPON_ENCHANT_IDS, WF_ENCHANT_IDS,
} from './constants';

// WCL classID → class name (WCL uses alphabetical ordering, not WoW internal IDs)
export const CLASS_NAMES = {
  1:  'Death Knight',
  2:  'Druid',
  3:  'Hunter',
  4:  'Mage',
  5:  'Monk',
  6:  'Paladin',
  7:  'Priest',
  8:  'Rogue',
  9:  'Shaman',
  10: 'Warlock',
  11: 'Warrior',
  12: 'Demon Hunter',
  13: 'Evoker',
};

// Gear slot indices in WCL's CombatantInfo gear array (0-indexed, standard WoW order)
export const ENCHANT_SLOTS = { mainhand: 15, head: 0, shoulder: 2, chest: 4, legs: 6, bracer: 8, gloves: 9 };

// Importance weights — must sum to 100.
// Weapon+Head+Shoulder = 60 → Rare (blue), matching the user's "blue rank minimum" rule.
export const ENCHANT_WEIGHTS = { mainhand: 25, head: 20, shoulder: 15, legs: 15, gloves: 10, bracer: 8, chest: 7 };

// WCL RANKING zone IDs for TBC Fresh content.
// These are DIFFERENT from worldData zone IDs (1007, 1008, 1010...).
// Discovered by scanning zoneRankings(zoneID: X) across a range.
// Add new entries here as future content phases are released on the Fresh server.
export const TBC_RANKING_ZONES = [
  { id: 1047, name: 'Karazhan'            },
  { id: 1048, name: 'Gruul / Magtheridon' },
  { id: 1056, name: 'SSC / TK'            },
  // { id: ???, name: "Zul'Aman"          },  // add when released
  // { id: ???, name: 'BT / Hyjal'        },  // add when released
  // { id: ???, name: 'Sunwell Plateau'   },  // add when released
];

export function detectEnchants(gear) {
  const result = {};
  let score = 0;
  for (const [slot, idx] of Object.entries(ENCHANT_SLOTS)) {
    const enchanted = (gear?.[idx]?.permanentEnchant ?? 0) > 0;
    result[slot] = enchanted;
    if (enchanted) score += ENCHANT_WEIGHTS[slot] ?? 0;
  }
  return { ...result, enchantScore: score };
}

export function specToRole(spec) {
  if (!spec) return 'dps';
  const s = spec.toLowerCase();
  if (s.includes('holy') || s.includes('restoration') || s.includes('discipline')) return 'healer';
  if (s.includes('protection') || s === 'feral combat' || s === 'guardian') return 'tank';
  return 'dps';
}

export function detectBuff(buffName, buffId, selfApplied) {
  const n = (buffName || '').toLowerCase();
  if (n.includes('well fed'))   return 'food';
  if (FOOD_IDS.has(buffId))     return 'food';
  // Windfury comes from Shaman totem — not self-applied, check before selfApplied gate
  if (n.includes('windfury')) return 'windfury';
  if (!selfApplied)             return null;
  if (n.includes('flask') || FLASK_IDS.has(buffId)) return 'flask';
  if (GUARDIAN_IDS.has(buffId)) return 'guardian_elixir';
  if (BATTLE_IDS.has(buffId))   return 'battle_elixir';
  return null;
}

/**
 * Parse one fight's consumables for a single player.
 *
 * @param ciEvents    CombatantInfo events (dataType: CombatantInfo) for the fight
 * @param caEvents    Cast events (dataType: Casts) covering pre-pot window → fight end
 * @param actorMap    { actorId: name } from report masterData
 * @param auraNameMap { abilityGuid: name } from the report Buffs table
 * @param targetLower lowercased character name to match
 * @returns { result, sourceId } or null if the player wasn't in this fight
 */
export function parseFightCons(ciEvents, caEvents, actorMap, auraNameMap, targetLower) {
  const sourceId = Object.entries(actorMap)
    .find(([, n]) => n.toLowerCase() === targetLower)?.[0];
  if (!sourceId) return null;
  const myEvent = ciEvents.find(e => String(e.sourceID) === String(sourceId));
  const result = {
    flask: false, battle_elixir: false, guardian_elixir: false, food: false,
    weapon_oil: false, weapon_stone: false, windfury: false,
    haste_potion: 0, destruction_potion: 0, mana_potion: 0, healthstone: 0,
    enchant_mainhand: false, enchant_head: false, enchant_shoulder: false,
    enchant_chest: false, enchant_legs: false, enchant_bracer: false,
    enchant_gloves: false, enchantScore: 0,
  };
  if (myEvent) {
    for (const aura of (myEvent.auras || [])) {
      const selfApplied = aura.source === myEvent.sourceID;
      const cat = detectBuff(auraNameMap[aura.ability] || '', aura.ability, selfApplied);
      if (cat) result[cat] = true;
    }
    for (const slot of (myEvent.gear || [])) {
      const cat = WEAPON_ENCHANT_IDS[slot.temporaryEnchant];
      if (cat) result[cat] = true;
      // WF enchant IDs in gear slots = WF Totem active at pull time
      if (WF_ENCHANT_IDS.has(slot.temporaryEnchant)) result.windfury = true;
    }
    const enchants = detectEnchants(myEvent.gear);
    Object.assign(result, {
      enchant_mainhand: enchants.mainhand, enchant_head: enchants.head,
      enchant_shoulder: enchants.shoulder, enchant_chest: enchants.chest,
      enchant_legs: enchants.legs, enchant_bracer: enchants.bracer,
      enchant_gloves: enchants.gloves, enchantScore: enchants.enchantScore,
    });
  }
  for (const cast of caEvents) {
    if (String(cast.sourceID) !== String(sourceId)) continue;
    const cat = POTION_CAST_IDS[cast.abilityGameID];
    if (cat && typeof result[cat] === 'number') result[cat]++;
  }
  return { result, sourceId };
}
