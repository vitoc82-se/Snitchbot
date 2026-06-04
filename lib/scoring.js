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
  if (mandatory.pots && relevantPotKeys(p.class, p.role).length > 0) {
    const usedAny = relevantPotKeys(p.class, p.role).some(key => p[key]);
    if (usedAny) s++;
  }
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
  if (mandatory.pots && relevantPotKeys(p.class, p.role).length > 0) mx++;
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
