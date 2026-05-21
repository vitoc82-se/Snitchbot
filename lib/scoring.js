import { CLASS_COLORS } from './constants';

// Returns the list of in-combat potion keys relevant to this player's class and role.
// Role takes priority for hybrid classes (Shaman, Druid, Paladin).
export function relevantPotKeys(cls, role) {
  if (role === 'healer') return ['mana_potion'];
  if (role === 'tank') {
    if (cls === 'Paladin') return ['mana_potion'];
    return [];
  }
  switch (cls) {
    case 'Warrior': return ['haste_potion'];
    case 'Rogue':   return ['haste_potion'];
    case 'Hunter':  return ['haste_potion'];
    case 'Paladin': return ['haste_potion']; // Retribution
    case 'Mage':    return ['destruction_potion', 'mana_potion'];
    case 'Warlock': return ['destruction_potion', 'mana_potion'];
    case 'Priest':  return ['mana_potion']; // Shadow
    case 'Shaman':  return ['haste_potion', 'mana_potion']; // Enh or Elemental
    case 'Druid':   return ['haste_potion', 'mana_potion'];  // Feral or Balance
    default:        return [];
  }
}

export function relevantPots(p) {
  return new Set(relevantPotKeys(p.class, p.role));
}

export function isPotRelevant(p, key) {
  return relevantPots(p).has(key);
}

// A player is "prepared" if they have flask (or both elixirs) AND food.
export function isPrepared(p) {
  return (p.flask || (p.battle_elixir && p.guardian_elixir)) && p.food;
}

// Score: 1pt each for battle coverage, guardian coverage, food, plus 1pt per relevant pot used.
export function score(p) {
  let s = 0;
  if (p.flask || p.battle_elixir)   s++;
  if (p.flask || p.guardian_elixir) s++;
  if (p.food)                        s++;
  relevantPots(p).forEach(key => { if (p[key]) s++; });
  return s;
}

// Maximum possible score for this player (3 pre-fight points + relevant pot count).
export function maxScore(p) {
  return 3 + relevantPotKeys(p.class, p.role).length;
}

// List of missing pre-fight buff labels (used in the Slackers summary).
export function missingList(p) {
  const out = [];
  if (!p.flask && !p.battle_elixir)   out.push('Battle Elixir');
  if (!p.flask && !p.guardian_elixir) out.push('Guardian Elixir');
  if (!p.food)                         out.push('Food');
  return out;
}

export function classColor(cls) {
  return CLASS_COLORS[cls] || '#ccc';
}
