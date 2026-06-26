// Maps TBC raid item IDs to their source raid.
// Items not found here are treated as Classic content and skipped on import.
// Session classification uses majority vote, so partial coverage is fine.

const KARAZHAN = new Set([
  // Attumen the Huntsman
  28476, 28480, 28484, 28488, 28509,
  // Moroes
  28477, 28505, 28508, 28514, 28528, 28529, 28530, 28531, 28532, 28536, 28538, 28568, 28771,
  // Maiden of Virtue
  28518, 28519, 28521, 28523, 28524, 28525, 28592, 28662,
  // Opera (shared/BBW/R&J/WoZ)
  28502, 28503, 28512, 28520, 28522, 28527, 28534, 28535, 28539, 28540, 28543, 28545, 28565,
  28577, 28579, 28580, 28581, 28583, 28585,
  // The Curator
  28511, 28513, 28516, 28517, 28566, 28567, 28570, 28572, 28573, 28576, 28588, 30667,
  // Terestian Illhoof
  28558, 28559, 28560, 28658,
  // Shade of Aran
  28553, 28556, 28586, 28589, 28594, 28596, 28601, 28734,
  // Netherspite
  28587, 28604, 28607, 28609, 28610, 28612, 28614, 28616,
  // Chess Event
  30638, 30639, 30640, 30641, 30642, 30644, 30645, 30646, 30648, 30659, 30669, 30673,
  // Prince Malchezaar
  28470, 28591, 28593, 28631, 28638, 28641, 28645, 28649, 28650, 28651, 28652, 28653,
  28655, 28659, 28672, 28674, 28676, 28679, 28680, 28681, 28682, 28683, 28686, 28692,
  28694, 28727, 28730, 28733, 28737, 28738, 28739, 28740, 28741, 28742, 28743, 28744,
  28745, 28746, 28747, 28748, 28749, 28751, 28752, 28753, 28754, 28755, 28759, 28763,
  28764, 28766, 28767, 28772, 28775, 28777, 28778, 28779, 28782, 28783, 28784,
  // Nightbane
  28663, 28665, 28667, 28673,
  // Miscellaneous Kara items seen in log
  28506, 28597, 28602, 28597, 28661,
  // T4 Gloves token (The Curator)
  29756, 29757, 29758,
  // T4 Legs token (Prince Malchezaar)
  29762,
  // Chess / miscellaneous
  30559, 30630, 30632, 30633, 30634, 30636, 30637,
]);

const GRUUL_MAG = new Set([
  // High King Maulgar (Gruul's Lair)
  28793, 28795, 28796, 28797, 28798, 28799, 28800, 28801, 28803,
  28823, 28824, 28825, 28826, 28827, 28828, 28829, 28830, 28831,
  // Gruul the Dragonkiller
  28832, 28833, 28834, 28835, 28836, 28837, 28838, 28839, 28840,
  // Gruul items seen in log
  28802,
  // Magtheridon
  28778, 28781, 28789, 28790, 28791, 28792, 28810, 28811, 28812,
  28813, 28814, 28815, 28816, 28817, 28818, 28819, 28820, 28821, 28822,
  // Magtheridon head / satchels
  32386, 34845, 34846,
  // T4 Head token (High King Maulgar)
  29759, 29760, 29761,
  // T4 Chest token (Magtheridon)
  29753, 29754, 29755,
  // T4 Shoulder tokens (Gruul)
  29763, 29764, 29765, 29766,
]);

const SSC = new Set([
  // Hydross the Unstable
  30023, 30025, 30027, 30031, 30032, 30033, 30034, 30035, 30036, 30098,
  // The Lurker Below
  30037, 30038, 30040, 30041, 30042, 30043, 30044, 30045, 30046,
  // Leotheras the Blind
  30047, 30048, 30049, 30050, 30051, 30052, 30053, 30054, 30055,
  // Fathom-Lord Karathress
  30056, 30057, 30058, 30059, 30060, 30061, 30062, 30063, 30064, 30065,
  // Morogrim Tidewalker
  30066, 30067, 30068, 30069, 30070, 30071, 30072, 30073, 30074, 30075,
  30076, 30077, 30078, 30079, 30080, 30081, 30082, 30083, 30084, 30085,
  30086, 30087, 30088, 30089, 30090, 30091, 30092, 30093, 30094, 30095,
  // Lady Vashj
  30096, 30097, 30099, 30100, 30101, 30102, 30103, 30104, 30105, 30106,
  30107, 30108, 30109, 30110, 30111, 30112, 30113, 30114, 30115, 30116,
  30117, 30118, 30119, 30120,
  30620, 30621, 30622, 30623, 30624, 30625, 30626,
  // Specific items confirmed in log
  30021, 30049, 30052, 30053, 30058, 30062, 30064, 30080, 30083, 30084,
  30091, 30098, 30100, 30102, 30110, 30111, 30620, 30626,
  // T5 Leggings token (Lady Vashj)
  30245, 30246, 30247,
  // T5 Shoulders token (Fathom-Lord Karathress)
  30248, 30249, 30250,
]);

const TK = new Set([
  // Void Reaver
  29985, 30449,
  // High Astromancer Solarian
  29918, 29924, 30030,
  // A'lar
  29949, 29951, 29977,
  // Kael'thas Sunstrider
  29992, 29993, 30028, 32405,
  // Additional TK items (29900-29984 range)
  29896, 29897, 29898, 29899, 29900, 29901, 29902, 29903, 29904, 29905,
  29906, 29907, 29908, 29909, 29910, 29911, 29912, 29913, 29914, 29915,
  29916, 29917, 29919, 29920, 29921, 29922, 29923, 29925, 29926, 29927,
  29928, 29929, 29930, 29931, 29932, 29933, 29934, 29935, 29936, 29937,
  29938, 29939, 29940, 29941, 29942, 29943, 29944, 29945, 29946, 29947,
  29948, 29950, 29952, 29953, 29954, 29955, 29956, 29957, 29958, 29959,
  29960, 29961, 29962, 29963, 29964, 29965, 29966, 29967, 29968, 29969,
  29970, 29971, 29972, 29973, 29974, 29975, 29976, 29978, 29979, 29980,
  29981, 29982, 29983, 29984, 29986, 29987, 29988, 29989, 29990, 29991,
  // T5 Chest token (Kael'thas)
  30236, 30237, 30238,
  // T5 Gloves token (Void Reaver)
  30239, 30240, 30241,
  // T5 Helm token (Solarian)
  30242, 30243, 30244,
]);

// Build reverse map: itemId → raidName
const ITEM_RAID_MAP = new Map();
for (const id of KARAZHAN) ITEM_RAID_MAP.set(id, 'Karazhan');
for (const id of GRUUL_MAG) ITEM_RAID_MAP.set(id, 'Gruul & Magtheridon');
for (const id of SSC)       ITEM_RAID_MAP.set(id, 'SSC + The Eye');
for (const id of TK)        ITEM_RAID_MAP.set(id, 'SSC + The Eye');

export function getRaidName(itemId) {
  return ITEM_RAID_MAP.get(itemId) ?? null;
}

// Given an array of entries (all from the same softresID), classify the session.
// Returns the raid name with the most recognized items, or null if no TBC items found.
export function classifySession(entries) {
  const counts = {};
  for (const e of entries) {
    const raid = getRaidName(e.itemID);
    if (raid) counts[raid] = (counts[raid] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

export const RAID_ORDER = ['Karazhan', 'Gruul & Magtheridon', 'SSC + The Eye'];

// Normalize old DB values (pre-merge) to current names
export function normalizeRaidName(name) {
  if (name === 'Serpentshrine Cavern' || name === 'The Eye') return 'SSC + The Eye';
  return name;
}
