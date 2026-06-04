// WCL API endpoints (server-side only)
export const WCL_TOKEN_URL    = 'https://www.warcraftlogs.com/oauth/token';
export const WCL_API_URL      = 'https://www.warcraftlogs.com/api/v2/client';
export const PREPOT_WINDOW_MS = 10000;

// Buff spell IDs for scrolls (detected from CombatantInfo auras, not scored).
// These are confirmed from live log data.
export const SCROLL_IDS = new Set([
  33077, // Scroll of Agility V
  33079, // Scroll of Protection V
  33082, // Scroll of Strength V
  12177, // Scroll of Spirit IV (+15 Spirit)
  12176, // Scroll of Intellect IV (+16 Intellect)
]);

// Buff spell IDs for food items whose buff name does not contain "well fed".
// Detected before the selfApplied gate — food is always self-consumed.
export const FOOD_IDS = new Set([
  33825, // Skullfish Soup (+20 spell crit, +20 mp5) — unconfirmed buff ID
  43722, // Enlightened — confirmed spell ID
]);

// Buff spell IDs for flasks whose buff name does not contain "flask".
// These are the aura IDs seen in CombatantInfo events.
export const FLASK_IDS = new Set([
  17629, // Chromatic Resistance (Flask of Chromatic Resistance)
  17627, // Flask of Distilled Wisdom (+2000 mana)
  17628, // Flask of Supreme Power (+150 spell damage) — buff aura ID (17637 is the item-use spell, not the aura)
]);

// Guardian elixir buff IDs (defensive: armor, stamina, mana regen, resistances).
// Confirmed via CombatantInfo debug on live logs unless noted.
// IDs without a note (35234, 28517) are from older content — kept because
// older consumables are sometimes still best-in-slot in TBC phases.
export const GUARDIAN_IDS = new Set([
  39627, // Elixir of Draenic Wisdom
  39625, // Elixir of Ironskin (+30 Resilience) — unconfirmed
  35234, // Unknown older elixir — kept
  28517, // Unknown older elixir — kept
  28502, // Elixir of Major Defense (Major Armor) — confirmed from debug
  28509, // Elixir of Major Mageblood (Greater Mana Regeneration)
  17535, // Elixir of the Sages (+18 Int/Spirit)
  11371, // Gift of Arthas (+10 Shadow Resistance, chance to deal shadow damage on hit) — confirmed aura ID from live log q1YAWDwyXBV3GjZa
]);

// Battle elixir buff IDs (offensive: agility, strength, spell power, crit).
// IDs without a note (28490, 11406, 33720, 28104, 33726) are from older
// content — kept because older consumables are sometimes still BIS.
export const BATTLE_IDS = new Set([
  28490, // Unknown older elixir — kept
  28491, // Elixir of Healing Power
  28497, // Elixir of Major Agility (Mighty Agility) — confirmed from debug
  28501, // Elixir of Major Firepower
  28503, // Elixir of Major Shadow Power
  17538, // Elixir of the Mongoose
  11406, // Unknown older elixir — kept
  33720, // Unknown older elixir — kept
  28104, // Unknown older elixir — kept
  33726, // Unknown older elixir — kept
  33721, // Adept's Elixir
  28493, // Elixir of Major Frost Power
  17539, // Greater Arcane Elixir
]);

// Temporary weapon enchant IDs from CombatantInfo gear slots.
// These are DBC enchantment IDs, NOT item IDs or spell IDs.
// Confirmed from live logs unless noted.
export const WEAPON_ENCHANT_IDS = {
  2628: 'weapon_oil',   // Brilliant Wizard Oil — confirmed (log zGZLxy43Wp98mwjX)
  2629: 'weapon_oil',   // Brilliant Mana Oil — confirmed (log zGZLxy43Wp98mwjX)
  2678: 'weapon_oil',   // confirmed oil (casters/healers, logs zGZLxy43Wp98mwjX + jXVcA6tbmgqyZfh1)
  2650: 'weapon_oil',   // Superior Wizard Oil — unconfirmed
  2955: 'weapon_stone', // confirmed stone (tank, log zGZLxy43Wp98mwjX)
};

// Windfury Totem enchant IDs — appear in CombatantInfo gear slots when WF is active at pull time.
// These are NOT player consumables but count as a weapon buff for melee DPS classes.
export const WF_ENCHANT_IDS = new Set([2636, 2639, 2713]);

// Windfury Attack proc spell IDs — appear as Cast events during combat when WF procs.
// Detecting ANY proc during the fight confirms WF Totem was active in combat.
// Covers TBC rank 5 (25504) and earlier ranks for safety.
export const WF_PROC_IDS = new Set([25504, 8516, 10608, 10610, 10611, 10612]);

// Cast spell IDs for in-combat consumables, mapped to their category.
// These match the abilityGameID field in WCL Cast events.
// Confirmed from live log data unless noted (CSV = from consumable CSV reference).
export const POTION_CAST_IDS = {
  28507: 'haste_potion',        // Haste Potion — confirmed
  28494: 'haste_potion',        // Insane Strength Potion (melee DPS alt) — CSV
  28508: 'destruction_potion',  // Destruction Potion — confirmed
  28499: 'mana_potion',         // Super Mana Potion — confirmed
  17531: 'mana_potion',         // Major Mana Potion — confirmed
  38929: 'mana_potion',         // Fel Mana Potion — confirmed from live log (Strwbrykiwi, xXjzVNwYFCLBbRn4)
  41617: 'mana_potion',         // Fel Mana Potion (alt ID — unconfirmed, keeping as safety)
  41618: 'mana_potion',         // Fel Mana Potion (alt ID — unconfirmed, keeping as safety)
  27869: 'mana_potion',         // Dark Rune — confirmed spell ID (item 20520)
  16666: 'mana_potion',         // Demonic Rune — confirmed from debug
  27237: 'healthstone',         // Healthstone (major) — confirmed
  27232: 'healthstone',         // Healthstone — confirmed
  27230: 'healthstone',         // Healthstone rank 7
  11730: 'healthstone',         // Healthstone rank 6
  11729: 'healthstone',         // Healthstone rank 5
   6263: 'healthstone',         // Healthstone rank 4
   6262: 'healthstone',         // Healthstone rank 3
};

// ── UI constants ─────────────────────────────────────────────────────────────

export const CLASS_COLORS = {
  Warrior: '#C79C6E',
  Paladin: '#F58CBA',
  Hunter:  '#ABD473',
  Rogue:   '#FFF569',
  Priest:  '#FFFFFF',
  Shaman:  '#0070DE',
  Mage:    '#69CCF0',
  Warlock: '#9482C9',
  Druid:   '#FF7D0A',
};

export const CLASS_ORDER = [
  'Warrior', 'Paladin', 'Druid', 'Priest', 'Shaman', 'Hunter', 'Rogue', 'Mage', 'Warlock',
];

// Pre-fight buff column definitions (Flask / Elixirs / Food).
export const PRE_COLS = [
  { key: 'flask',            label: 'Flask'        },
  { key: 'battle_elixir',   label: 'Battle Elix'  },
  { key: 'guardian_elixir', label: 'Guard. Elix'  },
  { key: 'food',            label: 'Food'         },
  { key: 'weapon_oil',      label: 'Weapon Oil'   },
  { key: 'weapon_stone',    label: 'Weapon Stone' },
];

// In-combat potion column definitions.
export const POT_COLS = [
  { key: 'haste_potion',       label: 'Haste Pot'   },
  { key: 'destruction_potion', label: 'Dest Pot'    },
  { key: 'mana_potion',        label: 'Mana Pot'    },
  { key: 'healthstone',        label: 'Healthstone' },
];
