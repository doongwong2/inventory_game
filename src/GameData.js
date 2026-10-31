// ============================================================
// GameData.js — Central game state, item definitions, NPC data
// ============================================================

export const GRID = {
  CELL: 40, // px per cell
  BAG_COLS: 5,
  BAG_ROWS: 7,
};

// Item shape definitions: array of [col, row] offsets from origin (top-left)
export const ITEM_DEFS = {};

// NPC definitions
export const NPCS = {
  mai: {
    name: 'Mai',
    role: 'Classmate',
    activity: 'lecture',
    affinity: 0,
    color: 0xff9aaf,
    portrait: 'mai',
    thresholds: [
      { level: 1, at: 10, unlock: 'Mai shares her notes with you.' },
      { level: 2, at: 25, unlock: 'Mai invites you to a study group.' },
      { level: 3, at: 45, unlock: 'Mai bakes you cookies.' },
    ],
  },
  kenji: {
    name: 'Kenji',
    role: 'Coworker',
    activity: 'work',
    affinity: 0,
    color: 0x80c0ff,
    portrait: 'kenji',
    thresholds: [
      { level: 1, at: 10, unlock: 'Kenji covers your shift once.' },
      { level: 2, at: 25, unlock: 'Kenji teaches you a café trick.' },
      { level: 3, at: 45, unlock: 'Kenji gives you a staff discount.' },
    ],
  },
  rin: {
    name: 'Rin',
    role: 'Club Senior',
    activity: 'club',
    affinity: 0,
    color: 0xb0e080,
    portrait: 'rin',
    thresholds: [
      { level: 1, at: 10, unlock: 'Rin lends you extra club supplies.' },
      { level: 2, at: 25, unlock: 'Rin recommends you for a project.' },
      { level: 3, at: 45, unlock: 'Rin gives you a handmade gift.' },
    ],
  },
  hiro: {
    name: 'Hiro',
    role: 'Study Buddy',
    activity: 'study',
    affinity: 0,
    color: 0xffd080,
    portrait: 'hiro',
    thresholds: [
      { level: 1, at: 10, unlock: 'Hiro shares practice problems.' },
      { level: 2, at: 25, unlock: 'Hiro quizzes you before exams.' },
      { level: 3, at: 45, unlock: 'Hiro makes you a study playlist.' },
    ],
  },
  sora: {
    name: 'Sora',
    role: 'Neighbour',
    activity: 'random',
    affinity: 0,
    color: 0xd0a0ff,
    portrait: 'sora',
    thresholds: [
      { level: 1, at: 10, unlock: 'Sora waves at you in the hallway.' },
      { level: 2, at: 25, unlock: 'Sora drops off a home-cooked meal.' },
      { level: 3, at: 45, unlock: 'Sora becomes a close friend.' },
    ],
  },
};

// Shelf layout: array of { id, cols, rows, label }
export const SHELF_DEFS = [
  { id: 'shelf_a', cols: 3, rows: 3, label: 'Small Shelf A' },
  { id: 'shelf_b', cols: 3, rows: 3, label: 'Small Shelf B' },
  { id: 'shelf_c', cols: 3, rows: 3, label: 'Small Shelf C' },
  { id: 'big_shelf', cols: 8, rows: 10, label: 'Big Shelf' },
];

// 7-day event schedule
// Each day: { activity, npc, dialogue[], triggers[] }
// triggers: { condition, giveItem?, wantItem?, affinityGain, dialogue }
export const DAYS = [];

// Content loaded from data/game-content.json before Phaser starts.
export const STARTING_ITEMS = [];

export function loadGameContent(content) {
  if (!content || typeof content !== 'object' || !content.items || !Array.isArray(content.days)) {
    throw new Error('Game content must include an items object and days array.');
  }
  for (const key of Object.keys(ITEM_DEFS)) delete ITEM_DEFS[key];
  Object.assign(ITEM_DEFS, content.items);
  DAYS.splice(0, DAYS.length, ...content.days);
  STARTING_ITEMS.splice(0, STARTING_ITEMS.length, ...(content.startingItems || []));
}

// Global game state (mutable during play)
export const GameState = {
  currentDay: 0,          // index into DAYS[]
  phase: 'title',         // 'title' | 'inventory' | 'event' | 'end'
  npcs: JSON.parse(JSON.stringify(NPCS)), // deep copy so we can mutate affinities

  // bag: array of placed items { id, itemKey, gridX, gridY } per cell
  bagGrid: Array(GRID.BAG_COLS * GRID.BAG_ROWS).fill(null),
  bagItems: [],  // list of { instanceId, itemKey, originX, originY }

  // shelves: { [shelfId]: { items: [], grid: [] } }
  shelves: Object.fromEntries(
    SHELF_DEFS.map(s => [
      s.id,
      {
        items: [],
        grid: Array(s.cols * s.rows).fill(null),
      }
    ])
  ),

  // items in limbo (received from events, not yet placed)
  pendingItems: [],

  // items that exist as free objects (not placed in any grid)
  floatingItems: [],

  // day log
  log: [],
};

// Helper: get affinity level for an NPC
export function getAffinityLevel(npcKey) {
  const npc = GameState.npcs[npcKey];
  if (!npc) return 0;
  const sorted = [...npc.thresholds].reverse();
  for (const t of sorted) {
    if (npc.affinity >= t.at) return t.level;
  }
  return 0;
}

// Helper: add affinity, return any newly unlocked threshold
export function addAffinity(npcKey, amount) {
  const npc = GameState.npcs[npcKey];
  if (!npc) return null;
  const prevLevel = getAffinityLevel(npcKey);
  npc.affinity = Math.max(0, Math.min(npc.affinity + amount, 100));
  const newLevel = getAffinityLevel(npcKey);
  if (newLevel > prevLevel) {
    return npc.thresholds.find(t => t.level === newLevel);
  }
  return null;
}

// Helper: check if bag has an item matching itemKey
export function bagHasItem(itemKey) {
  return GameState.bagItems.some(i => i.itemKey === itemKey);
}

// Helper: generate a unique instance ID
let _iid = 0;
export function newInstanceId() {
  return `item_${++_iid}`;
}
