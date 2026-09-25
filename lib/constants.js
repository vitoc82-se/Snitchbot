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
  43764, // Well Fed (+Spirit/rating) — confirmed from live log TqBGYh7vPDFjpCJx
]);

// Buff spell IDs for flasks whose buff name does not contain "flask".
// These are the aura IDs seen in CombatantInfo events.
export const FLASK_IDS = new Set([
  17629, // Chromatic Resistance (Flask of Chromatic Resistance)
  17627, // Flask of Distilled Wisdom (+2000 mana) — buff aura is "Distilled Wisdom"
  17628, // Flask of Supreme Power (+150 spell damage) — buff aura ID (17637 is the item-use spell, not the aura)
  42735, // Chromatic Wonder (Flask of Chromatic Wonder, item 33208) — buff is "Chromatic Wonder", no "flask" in name
  // Shattrath (raid-only BoP) flasks — buff auras are named "<effect> of Shattrath"
  // (NOT "Flask of …"), so name matching misses them. GOTCHA: each of these flasks has
  // TWO same-named spells — a "Dummy" item-cast wrapper (does the raid-zone check) and the
  // REAL buff aura that shows up in CombatantInfo. WCL logs the AURA, not the cast. The
  // first six below are the confirmed aura IDs (verified via spell effects + live log
  // LyAFWfxp3htdwZMC where priest Wynji's Mighty Restoration logged as 41605). The
  // cast-wrapper IDs are kept afterward as a harmless safety net. Verified 2026-08-29.
  41604, // Supreme Power of Shattrath       aura — Mod Damage (All)              (item 32900)
  41605, // Mighty Restoration of Shattrath  aura — Power Regen (Mana)            (item 32899)
  41606, // Relentless Assault of Shattrath  aura — Mod Melee Attack Power        (item 32901)
  41607, // Fortification of Shattrath       aura — Increase Max Health           (item 32898)
  46838, // Pure Death of Shattrath          aura — Mod Damage (Fire/Frost/Shadow)(item 35716)
  46840, // Blinding Light of Shattrath      aura — Mod Damage (Arcane/Holy/Nature)(item 35717)
  41608, 41609, 41610, 41611, 46837, 46839, // item-cast "Dummy" wrappers — safety net, not normally logged
]);

// Guardian elixir buff IDs (defensive: armor, stamina, mana regen, resistances).
// Confirmed via CombatantInfo debug on live logs unless noted.
// IDs without a note (35234, 28517) are from older content — kept because
// older consumables are sometimes still best-in-slot in TBC phases.
export const GUARDIAN_IDS = new Set([
  39627, // Elixir of Draenic Wisdom
  39628, // Elixir of Ironskin (+30 Resilience) — confirmed spell ID (39625 is a different elixir: Major Fortitude, below)
  39625, // Elixir of Major Fortitude (+250 max HP, +10 HP/5s) — guardian; item 32062 (aura confirmed via wowhead 2026-08-29)
  39626, // Earthen Elixir (-20 dmg from all schools) — confirmed from live log PvnTp132mWNyBDGq
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
  11406, // Elixir of Demonslaying (+265 AP vs demons) — battle; item 9224 (relevant in BT/Hyjal)
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

// Windfury enchant IDs — appear in CombatantInfo gear slots when WF is active at pull time.
// Covers both WF Weapon (Shaman self-enchant) and WF Totem (applied to nearby melee by the totem).
// Confirmed from live logs: 2636 on Niapy (Enh Shaman dual-wield), 2639/2713 on Warriors/melee.
// Note: 2643 is Rogue poison — do NOT add it here.
export const WF_ENCHANT_IDS = new Set([2636, 2639, 2713]);

// Windfury Attack proc spell IDs — appear as Cast events during combat when WF procs.
// Detecting ANY proc during the fight confirms WF Totem/Weapon was active in combat.
// 25584 = Windfury Attack rank 5 (TBC confirmed via wowhead spell=25584)
// Earlier ranks kept as safety net.
export const WF_PROC_IDS = new Set([25584, 25504, 8516, 10608, 10610, 10611, 10612]);

// ── Shadow Resistance (for shadow-heavy fights like Mother Shahraz) ──────────
// Bosses where a Shadow Resistance column is shown in the report.
export const SHADOW_RESIST_FIGHTS = ['Mother Shahraz'];

// Shadow Protection / Shadow Resistance Aura set shadow resistance to +70 and
// Mark / Gift of the Wild give +25 all-resist. All four are the "Flat - Does
// not Stack" resistance aura type, so only the HIGHEST applies (never summed).
// Detected by buff name so it works across ranks.
export const SHADOW_PROTECTION_SR = 70;
export const MARK_OF_THE_WILD_SR  = 25;

// Resistance consumables that DO stack on top of the above (aura id → SR).
// Values verified on wowhead.com/tbc spell pages ("Mod Resistance" effect).
export const SHADOW_RESIST_AURAS = {
  42735: 35,  // Flask of Chromatic Wonder (+35 all resist)
  17629: 25,  // Flask of Chromatic Resistance (+25 all resist)
  11371: 10,  // Gift of Arthas
};

// Wowhead recommends 174 SR from gear for Mother Shahraz; with the +70 buff
// that's 244 total. Report colours: green ≥ this, amber 70+ (buff only /
// partial gear), red < 70 (missing even the free buff). Tanks don't need SR.
export const SHADOW_RESIST_RECOMMENDED = 244;

// Per-item shadow resistance (itemId → SR). COMPLETE list of every TBC item
// with shadow resistance (all-resist items included), from the Wowhead TBC
// item filter cr=29 (shadow res > 0) — the jsonequip "shares" field.
// Pulled 2026-09-25: 189 items, no set bonuses grant SR on any of them.
export const SHADOW_RESIST_ITEMS = {
  32649: 40,  // Medallion of Karabor
  32757: 40,  // Blessed Medallion of Karabor
  32389: 72,  // Soulguard Leggings
  32396: 72,  // Redeemed Soul Legguards
  32400: 72,  // Greaves of Shackled Souls
  32404: 72,  // Shadesteel Greaves
  32390: 54,  // Soulguard Girdle
  32391: 54,  // Soulguard Slippers
  32393: 54,  // Redeemed Soul Cinch
  32394: 54,  // Redeemed Soul Moccasins
  32397: 54,  // Waistguard of Shackled Souls
  32398: 54,  // Boots of Shackled Souls
  32401: 54,  // Shadesteel Girdle
  32402: 54,  // Shadesteel Sabots
  32392: 40,  // Soulguard Bracers
  32395: 40,  // Redeemed Soul Wristguards
  32399: 40,  // Bracers of Shackled Souls
  32403: 40,  // Shadesteel Bracers
  32420: 40,  // Night's End
  28301: 12,  // Syrannis' Mystic Sheen
  24097: 30,  // Pendant of Shadow's End
  27895: 10,  // Band of Many Prisms
  32082: 22,  // The Fel Barrier
  31928: 18,  // Dark Band
  31933: 18,  // Dark Charm
  31939: 18,  // Dark Cloak
  29400: 18,  // Abyssal Shroud
  23042: 13,  // Loatheb's Reflection
  21605:  6,  // Gloves of the Hidden Temple
  21530: 30,  // Onyx Embedded Leggings
  21529: 20,  // Amulet of Shadow Shielding
  21627: 20,  // Cloak of Untold Secrets
  21687: 20,  // Ukko's Ring of Darkness
  16818: 10,  // Netherwind Belt
  16899: 10,  // Stormrage Handguards
  16900: 10,  // Stormrage Cover
  16903: 10,  // Stormrage Belt
  16907: 10,  // Bloodfang Gloves
  16908: 10,  // Bloodfang Hood
  16910: 10,  // Bloodfang Belt
  16913: 10,  // Netherwind Gloves
  16914: 10,  // Netherwind Crown
  16920: 10,  // Handguards of Transcendence
  16922: 10,  // Leggings of Transcendence
  16925: 10,  // Belt of Transcendence
  16928: 10,  // Nemesis Gloves
  16929: 10,  // Nemesis Skullcap
  16933: 10,  // Nemesis Belt
  16936: 10,  // Dragonstalker's Belt
  16939: 10,  // Dragonstalker's Helm
  16940: 10,  // Dragonstalker's Gauntlets
  16944: 10,  // Belt of Ten Storms
  16947: 10,  // Helmet of Ten Storms
  16948: 10,  // Gauntlets of Ten Storms
  16952: 10,  // Judgement Belt
  16955: 10,  // Judgement Crown
  16956: 10,  // Judgement Gauntlets
  16960: 10,  // Waistband of Wrath
  16963: 10,  // Helm of Wrath
  16964: 10,  // Gauntlets of Wrath
  18608: 20,  // Benediction
  18609: 20,  // Anathema
  21128: 10,  // Staff of the Qiraji Prophets
  18813: 10,  // Ring of Binding
  17107:  5,  // Dragon's Blood Cape
  19439: 30,  // Interlaced Shadow Jerkin
  21838: 25,  // Garb of Royal Ascension
  18544:  8,  // Doomhide Gauntlets
  20615:  4,  // Dragonspur Wraps
  18806:  8,  // Core Forged Greaves
  17110:  6,  // Seal of the Archmagus
  19157:  5,  // Chromatic Gauntlets
  18546: 10,  // Infernal Headcage
  18823:  5,  // Aged Core Leather Gloves
  21467:  5,  // Thick Silithid Chestguard
  17113:  5,  // Amberseal Keeper
  16796: 10,  // Arcanist Leggings
  16800: 10,  // Arcanist Boots
  16810: 10,  // Felheart Pants
  16814: 10,  // Pants of Prophecy
  16822: 10,  // Nightslayer Pants
  16835: 10,  // Cenarion Leggings
  16843: 10,  // Earthfury Legguards
  16847: 10,  // Giantstalker's Leggings
  16855: 10,  // Lawbringer Legplates
  16867: 10,  // Legplates of Might
  16797:  7,  // Arcanist Mantle
  16803:  7,  // Felheart Slippers
  16807:  7,  // Felheart Shoulder Pads
  16811:  7,  // Boots of Prophecy
  16816:  7,  // Mantle of Prophecy
  16823:  7,  // Nightslayer Shoulder Pads
  16824:  7,  // Nightslayer Boots
  16829:  7,  // Cenarion Boots
  16836:  7,  // Cenarion Spaulders
  16837:  7,  // Earthfury Boots
  16844:  7,  // Earthfury Epaulets
  16848:  7,  // Giantstalker's Epaulets
  16849:  7,  // Giantstalker's Boots
  16856:  7,  // Lawbringer Spaulders
  16859:  7,  // Lawbringer Boots
  16862:  7,  // Sabatons of Might
  16868:  7,  // Pauldrons of Might
  19059:  5,  // Argent Shoulders
  20538: 25,  // Runed Stygian Leggings
  20550: 25,  // Darkrune Breastplate
  20551: 25,  // Darkrune Helm
  20537: 20,  // Runed Stygian Boots
  20539: 20,  // Runed Stygian Belt
  20549: 20,  // Darkrune Gauntlets
  18718: 15,  // Grand Crusader's Helm
  18424:  5,  // Sedge Boots
  13525: 20,  // Darkbind Fingers
  15068: 18,  // Frostsaber Tunic
  13528: 15,  // Twilight Void Bracers
  13398: 10,  // Boots of the Shrieker
  13524: 10,  // Skull of Burning Shadows
  14537: 10,  // Corpselight Greaves
  14543: 10,  // Darkshade Gloves
  17000: 10,  // Band of the Wraith
  18694: 10,  // Shadowy Mail Greaves
  18734: 10,  // Pale Moon Cloak
  18509:  9,  // Chromatic Cloak
  14528:  7,  // Rattlecage Buckler
  18755:  6,  // Xorothian Firestick
  12903:  5,  // Legguards of the Chromatic Defier
  12945:  5,  // Legplates of the Chromatic Defier
  12609: 20,  // Polychromatic Visionwrap
  12420: 18,  // Radiant Leggings
  13531: 18,  // Crypt Stalker Leggings
  13532: 13,  // Darkspinner Claws
  18861: 11,  // Flamewaker Legplates
  14577:  5,  // Skullsmoke Pants
  21792:  3,  // Necklace of the Diamond Tower
  18639: 20,  // Ultra-Flash Shadow Reflector
  18730: 12,  // Shadowy Laced Handwraps
  10778: 10,  // Necklace of Sanctuary
  12414: 10,  // Thorium Leggings
  18729: 10,  // Screeching Bow
  12065:  8,  // Ward of the Elements
  12417: 18,  // Radiant Circlet
  18340: 15,  // Eidolon Talisman
  15070: 12,  // Frostsaber Gloves
  18339: 12,  // Eidolon Cloak
   1168: 10,  // Skullflame Shield
  14104: 16,  // Brightcloth Pants
  12419: 15,  // Radiant Boots
  17061: 15,  // Juno's Shadow
  18744: 10,  // Plaguebat Fur Gloves
  18325:  8,  // Felhide Cap
  19056:  4,  // Argent Boots
  15069: 16,  // Frostsaber Leggings
  12418: 12,  // Radiant Gloves
  13405: 10,  // Wailing Nightbane Pauldrons
  18699: 10,  // Icy Tomb Spaulders
  11925:  5,  // Ghostshroud
  12410: 10,  // Thorium Helm
  12409:  7,  // Thorium Boots
  15071: 12,  // Frostsaber Boots
  11811:  7,  // Smoking Heart of the Mountain
  14103:  7,  // Brightcloth Cloak
  12552:  6,  // Blisterbane Wrap
  12415: 16,  // Radiant Breastplate
  14100: 15,  // Brightcloth Robe
  13473: 13,  // Felstone Good Luck Charm
  14101: 11,  // Brightcloth Gloves
  12416: 12,  // Radiant Belt
  20504: 10,  // Lightforged Blade
  20006:  6,  // Circle of Hope
   8367: 12,  // Dragonscale Breastplate
  13009: 10,  // Cow King's Hide
  13030:  6,  // Basilisk Bone
  12408:  5,  // Thorium Bracers
  12405:  8,  // Thorium Armor
  12406:  6,  // Thorium Belt
  13109:  5,  // Blackflame Cape
   1169: 10,  // Blackskull Shield
   1604:  7,  // Chromatic Sword
   9434:  5,  // Elemental Raiment
  12252:  6,  // Staff of Protection
    936: 10,  // Midnight Mace
   1992:  5,  // Swampchill Fetish
  10571:  5,  // Ebony Boneclub
   7001:  5,  // Gravestone Scepter
    886:  4,  // Black Metal Shortsword
   1462:  5,  // Ring of the Shadow
   2236:  5,  // Blackfang
   2292:  5,  // Necrology Robes
   3227:  7,  // Nightbane Staff
};

// Per-gem shadow resistance (gemId → SR), same authoritative source.
export const SHADOW_RESIST_GEMS = {
  22459: 4,   // Void Sphere (+4 all resist)
};

// Permanent enchant ids (gear slot `permanentEnchant`) → SR. Enchant ids read
// from each spell's "Enchant Item: … (id)" effect on wowhead.com/tbc.
// 1441, 2984 and 3009 confirmed in a live Shahraz log (r4LvbmByhKnxt3kN).
export const SHADOW_RESIST_ENCHANTS = {
  3009: 20,   // Glyph of Shadow Warding (head)
  1441: 15,   // Enchant Cloak - Greater Shadow Resistance
   804: 10,   // Enchant Cloak - Lesser Shadow Resistance
  2984:  8,   // Shadow Armor Kit
  2664:  7,   // Enchant Cloak - Major Resistance (all)
  1888:  5,   // Enchant Cloak - Greater Resistance (all)
   903:  3,   // Enchant Cloak - Resistance (all)
    65:  1,   // Enchant Cloak - Minor Resistance (all)
};

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
  28579: 'survival_potion',     // Ironshield Potion (item 22849) — item-use cast recorded in logs
  28515: 'survival_potion',     // Ironshield (armor buff the potion applies) — safety alt ID
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
  { key: 'survival_potion',    label: 'Ironshield'  },
  { key: 'healthstone',        label: 'Healthstone' },
];
