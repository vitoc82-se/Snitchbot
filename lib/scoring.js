import { CLASS_COLORS } from './constants';

export const DEFAULT_MANDATORY = {
  flask:    true,
  guardian: true,
  food:     true,
  pots:     true,
  weapon:   false,
};

// Returns the list of in-combat potion keys relevant to this player's class and role.
// Role takes priority for hybrid classes (Shaman, Druid, Paladin).
export function relevantPotKeys(cls, role) {
  if (role === 'healer') return ['mana_potion'];
  if (role === 'tank') {
    if (cls === 'Paladin') return ['destruction_potion', 'haste_potion', 'mana_potion'];
    return ['haste_potion'];
  }
  // Mana-less classes must use haste pot. Mana classes accept haste, destruction, or mana.
  const ALL_DPS_POTS = ['destruction_potion', 'haste_potion', 'mana_potion'];
  switch (cls) {
    case 'Warrior': return ['haste_potion'];          // no mana
    case 'Rogue':   return ['haste_potion'];           // no mana
    case 'Hunter':  return ALL_DPS_POTS;               // has mana
    case 'Paladin': return ALL_DPS_POTS;               // Retribution — has mana
    case 'Mage':    return ALL_DPS_POTS;
    case 'Warlock': return ALL_DPS_POTS;
    case 'Priest':  return ALL_DPS_POTS;               // Shadow
    case 'Shaman':  return ALL_DPS_POTS;               // Enh or Elemental
    case 'Druid':   return ALL_DPS_POTS;               // Feral or Balance
    default:        return [];
  }
}

export function relevantPots(p) {
  return new Set(relevantPotKeys(p.class, p.role));
}

export function isPotRelevant(p, key) {
  return relevantPots(p).has(key);
}

// Minimum fight length (ms) before an in-combat potion is expected. The first
// potion is normally used on Bloodlust, which can be delayed ~30s into the
// pull, so a shorter fight (early wipe) must not be scored as a missing potion.
export const POTION_MIN_FIGHT_MS = 60000;

// Whether the in-combat potion is a scored requirement for this player+fight.
// Requires: potions are mandatory, the class/role actually has a relevant pot,
// and the fight ran long enough to warrant one. When fight length is unknown
// (e.g. ranking/lookup data, which is kills-only and always long), we treat it
// as applicable to preserve historical scoring.
export function potionApplicable(p, mandatory = DEFAULT_MANDATORY) {
  if (!mandatory.pots) return false;
  if (relevantPotKeys(p.class, p.role).length === 0) return false;
  if (p.fightDurationMs != null && p.fightDurationMs < POTION_MIN_FIGHT_MS) return false;
  return true;
}

// Whether this player actually used a relevant in-combat potion.
export function usedRelevantPot(p) {
  return relevantPotKeys(p.class, p.role).some(key => p[key]);
}

// Which weapon buff type this player uses.
// Healers and caster DPS use oil; tanks and melee/physical DPS use stone.
export function weaponBuffType(p) {
  if (p.role === 'healer') return 'oil';
  if (p.role === 'tank')   return 'stone';
  // DPS weapon type:
  // Paladin DPS = Ret → stone (not Holy/Prot which are healer/tank roles)
  // Shaman DPS  = Enhancement → stone/WF (Elemental is less common in melee comps)
  // Pure casters (Mage, Warlock, Shadow Priest, Balance Druid) → oil
  const oilCasters = ['Mage', 'Warlock', 'Priest', 'Druid'];
  return oilCasters.includes(p.class) ? 'oil' : 'stone';
}

// Score: counts only the mandatory buffs the player has.
export function score(p, mandatory = DEFAULT_MANDATORY) {
  let s = 0;
  if (mandatory.flask    && (p.flask || p.battle_elixir))   s++;
  if (mandatory.guardian && (p.flask || p.guardian_elixir)) s++;
  if (mandatory.food     && p.food)                          s++;
  if (potionApplicable(p, mandatory) && usedRelevantPot(p))  s++;
  if (mandatory.weapon) {
    const type = weaponBuffType(p);
    if (type === 'oil'   && p.weapon_oil)                    s++;
    if (type === 'stone' && (p.weapon_stone || p.windfury))  s++; // WF counts as weapon buff
  }
  return s;
}

// Maximum possible score for this player given current mandatory settings.
export function maxScore(p, mandatory = DEFAULT_MANDATORY) {
  let mx = 0;
  if (mandatory.flask)    mx++;
  if (mandatory.guardian) mx++;
  if (mandatory.food)     mx++;
  if (potionApplicable(p, mandatory)) mx++;
  if (mandatory.weapon)   mx++;
  return mx;
}

// A player is "prepared" if they have all mandatory buffs.
export function isPrepared(p, mandatory = DEFAULT_MANDATORY) {
  return score(p, mandatory) === maxScore(p, mandatory);
}

// List of missing mandatory pre-fight buff labels (used in Slackers summary).
export function missingList(p, mandatory = DEFAULT_MANDATORY) {
  const out = [];
  if (mandatory.flask    && !p.flask && !p.battle_elixir)   out.push('Battle Elixir');
  if (mandatory.guardian && !p.flask && !p.guardian_elixir) out.push('Guardian Elixir');
  if (mandatory.food     && !p.food)                         out.push('Food');
  if (potionApplicable(p, mandatory) && !usedRelevantPot(p)) out.push('Combat Potion');
  if (mandatory.weapon) {
    const type = weaponBuffType(p);
    if (type === 'oil'   && !p.weapon_oil)   out.push('Weapon Oil');
    if (type === 'stone' && !p.weapon_stone && !p.windfury) out.push('Weapon Stone');
  }
  return out;
}

export function classColor(cls) {
  return CLASS_COLORS[cls] || '#ccc';
}
