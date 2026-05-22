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
  const CASTER_POTS = ['destruction_potion', 'haste_potion', 'mana_potion'];
  switch (cls) {
    case 'Warrior': return ['haste_potion'];
    case 'Rogue':   return ['haste_potion'];
    case 'Hunter':  return ['haste_potion'];
    case 'Paladin': return ['haste_potion']; // Retribution
    case 'Mage':    return CASTER_POTS;
    case 'Warlock': return CASTER_POTS;
    case 'Priest':  return CASTER_POTS; // Shadow
    case 'Shaman':  return CASTER_POTS; // Enh or Elemental — haste covers Enh, destro/mana covers Ele
    case 'Druid':   return CASTER_POTS; // Feral or Balance — haste covers Feral, destro/mana covers Balance
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
  const casters = ['Mage', 'Warlock', 'Priest', 'Druid', 'Shaman', 'Paladin'];
  return casters.includes(p.class) ? 'oil' : 'stone';
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
    if (type === 'oil'   && p.weapon_oil)   s++;
    if (type === 'stone' && p.weapon_stone) s++;
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
    if (type === 'stone' && !p.weapon_stone) out.push('Weapon Stone');
  }
  return out;
}

export function classColor(cls) {
  return CLASS_COLORS[cls] || '#ccc';
}
