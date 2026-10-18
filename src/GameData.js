// ============================================================
// GameData.js — Central game state, item definitions, NPC data
// ============================================================

export const GRID = {
  CELL: 40, // px per cell
  BAG_COLS: 5,
  BAG_ROWS: 7,
};

// Item shape definitions: array of [col, row] offsets from origin (top-left)
export const ITEM_DEFS = {
  // Stationery
  pencil:      { name: 'Pencil',        color: 0xf6d860, shape: [[0,0],[0,1]],         category: 'stationery', description: 'A trusty HB pencil.' },
  notebook:    { name: 'Notebook',      color: 0x7ec8e3, shape: [[0,0],[0,1],[0,2]],   category: 'stationery', description: 'Lined pages, slightly crumpled.' },
  textbook:    { name: 'Textbook',      color: 0xe07b54, shape: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], category: 'academic', description: 'Heavy. Very heavy.' },
  ruler:       { name: 'Ruler',         color: 0xc0e0a0, shape: [[0,0],[0,1],[0,2],[0,3]], category: 'stationery', description: '30cm, transparent.' },

  // Food & Snacks
  cookie_jar:  { name: 'Cookie Jar',   color: 0xd4a96a, shape: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], category: 'food', description: 'Homemade cookies. Sharing = affinity boost.' },
  bento:       { name: 'Bento Box',    color: 0xf0a0b0, shape: [[0,0],[1,0],[0,1],[1,1]], category: 'food', description: 'Neatly packed lunch.' },
  energy_drink:{ name: 'Energy Drink', color: 0x80ff80, shape: [[0,0],[0,1]],          category: 'food', description: 'A last resort.' },
  snack_bag:   { name: 'Snack Bag',    color: 0xffd580, shape: [[0,0],[1,0]],           category: 'food', description: 'Chips. Classic.' },

  // Club / Work gear
  apron:       { name: 'Apron',        color: 0xa08060, shape: [[0,0],[0,1],[0,2],[1,1]], category: 'work', description: 'For the café shift.' },
  camera:      { name: 'Camera',       color: 0x606060, shape: [[0,0],[1,0],[0,1],[1,1]], category: 'club', description: 'Photography club essential.' },
  sketchbook:  { name: 'Sketchbook',   color: 0xffe0b0, shape: [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]], category: 'club', description: 'Art club sketchbook.' },
  water_bottle:{ name: 'Water Bottle', color: 0x90d0ff, shape: [[0,0],[0,1],[0,2]],    category: 'misc', description: 'Stay hydrated.' },

  // Misc
  umbrella:    { name: 'Umbrella',     color: 0x9090d0, shape: [[0,0],[0,1],[0,2],[0,3],[0,4]], category: 'misc', description: 'Just in case.' },
  keys:        { name: 'Keys',         color: 0xd4af37, shape: [[0,0]],                category: 'misc', description: 'Do not forget these.' },
  phone:       { name: 'Phone',        color: 0x303030, shape: [[0,0],[0,1]],          category: 'misc', description: 'Notifications off (mostly).' },
};

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
  { id: 'shelf_c', cols: 8, rows: 10, label: 'Big Bookcase' },
];

// 7-day event schedule
// Each day: { activity, npc, dialogue[], triggers[] }
// triggers: { condition, giveItem?, wantItem?, affinityGain, dialogue }
export const DAYS = [
  // Day 1
  {
    day: 1,
    activity: 'lecture',
    npc: 'mai',
    intro: [
      "Day 1 — Monday",
      "You drag yourself to your 8am lecture.",
      "Mai slides into the seat next to you.",
    ],
    triggers: [
      {
        wantItems: ['pencil', 'notebook'],
        dialogue: '"Oh! You have a spare pencil? Can I borrow it?" Mai looks relieved. "I always forget mine..."',
        affinityGain: 12,
        receiveItem: null,
      },
      {
        wantItems: [],
        dialogue: 'Mai glances at your bag. "All set for the lecture?" She smiles politely.',
        affinityGain: 2,
        receiveItem: null,
      },
    ],
    outro: ["The lecture ends. You head home."],
  },
  // Day 2
  {
    day: 2,
    activity: 'work',
    npc: 'kenji',
    intro: [
      "Day 2 — Tuesday",
      "Afternoon shift at the campus café.",
      "Kenji is already tying his apron.",
    ],
    triggers: [
      {
        wantItems: ['apron'],
        dialogue: '"Nice, you brought your own apron!" Kenji grins. "Much better than borrowing the manager\'s old one."',
        affinityGain: 12,
        receiveItem: 'energy_drink',
      },
      {
        wantItems: [],
        dialogue: 'Kenji raises an eyebrow. "Forgot your apron again?" He hands you a dusty spare from the back.',
        affinityGain: 1,
        receiveItem: null,
      },
    ],
    outro: ["Shift done. Your feet ache. You head home."],
  },
  // Day 3
  {
    day: 3,
    activity: 'club',
    npc: 'rin',
    intro: [
      "Day 3 — Wednesday",
      "Photography club meets in the rooftop garden.",
      "Rin is already adjusting her lens.",
    ],
    triggers: [
      {
        wantItems: ['camera'],
        dialogue: '"Oh, you brought your camera today!" Rin beams. "Come, I\'ll show you the golden-hour trick."',
        affinityGain: 15,
        receiveItem: 'sketchbook',
      },
      {
        wantItems: [],
        dialogue: 'Rin glances at your empty hands. "Forgot your camera? You can share mine... just be careful."',
        affinityGain: 2,
        receiveItem: null,
      },
    ],
    outro: ["Club wraps up. The sky turns orange. Time to go home."],
  },
  // Day 4
  {
    day: 4,
    activity: 'study',
    npc: 'hiro',
    intro: [
      "Day 4 — Thursday",
      "Library study session with Hiro.",
      "He's already spread out three textbooks.",
    ],
    triggers: [
      {
        wantItems: ['textbook', 'notebook'],
        dialogue: '"Perfect timing! I needed someone to quiz!" Hiro slides a worksheet across the table. "Let\'s go."',
        affinityGain: 14,
        receiveItem: 'ruler',
      },
      {
        wantItems: [],
        dialogue: 'Hiro looks at your empty bag. "Did you... forget everything?" He sighs, but shares his notes anyway.',
        affinityGain: 2,
        receiveItem: null,
      },
    ],
    outro: ["You study until the library closes. Good session."],
  },
  // Day 5
  {
    day: 5,
    activity: 'random',
    npc: 'sora',
    intro: [
      "Day 5 — Friday",
      "You run into Sora in the dormitory hallway.",
      "She's carrying way too many grocery bags.",
    ],
    triggers: [
      {
        wantItems: ['bento'],
        dialogue: '"Is that a bento? Oh wow, it smells amazing." Sora peeks into your bag. "Did you make that yourself?"',
        affinityGain: 13,
        receiveItem: 'snack_bag',
      },
      {
        wantItems: [],
        dialogue: 'Sora smiles shyly. "Hi! Sorry — do you live on this floor too?" She shifts her grocery bags awkwardly.',
        affinityGain: 3,
        receiveItem: null,
      },
    ],
    outro: ["Sora waves and disappears into her room. Quiet Friday evening."],
  },
  // Day 6
  {
    day: 6,
    activity: 'lecture',
    npc: 'mai',
    intro: [
      "Day 6 — Saturday",
      "A make-up lecture. On a Saturday. Really.",
      "Mai looks as tired as you feel.",
    ],
    triggers: [
      {
        wantItems: ['energy_drink', 'notebook'],
        dialogue: '"Oh my gosh, you brought an energy drink?" Mai\'s eyes light up. "Can I have a sip? Please?"',
        affinityGain: 13,
        receiveItem: 'pencil',
      },
      {
        wantItems: [],
        dialogue: 'Mai yawns. "Saturday lecture... who does this?" She glances at you. "At least we suffer together."',
        affinityGain: 3,
        receiveItem: null,
      },
    ],
    outro: ["Finally done. You both agree never to let this happen again."],
  },
  // Day 7
  {
    day: 7,
    activity: 'random',
    npc: 'sora',
    intro: [
      "Day 7 — Sunday",
      "Last day of the week. Sora knocks on your door.",
      '"Hey — a few of us are having a little get-together. Want to come?"',
    ],
    triggers: [
      {
        wantItems: ['snack_bag', 'cookie_jar'],
        dialogue: '"You brought snacks! Yes!" Sora claps her hands. Everyone cheers. You feel like a hero.',
        affinityGain: 20,
        receiveItem: 'phone',
      },
      {
        wantItems: [],
        dialogue: 'You show up empty-handed. It\'s still a nice time, but you feel a little guilty.',
        affinityGain: 5,
        receiveItem: null,
      },
    ],
    outro: [
      "The week is over.",
      "You lie on your bed and stare at the ceiling.",
      "Next week will be different. (It won't.)",
      "— END OF DEMO —",
    ],
  },
];

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
  npc.affinity = Math.min(npc.affinity + amount, 100);
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
