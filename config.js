// ─────────────────────────────────────────────────────────────
//  Don't Make a Sound — static game data
//  Everything tweakable lives here: noise costs, rooms, items.
// ─────────────────────────────────────────────────────────────

export const MAX_DAYS = 5;
export const START_ROOM = 'bedroom';

export const NOISE = {
  move: 10,          // walking between rooms
  creakyBonus: 5,    // extra when stepping onto the hallway floorboards
  search: 25,        // rummaging drawers / cupboards
  loudTool: 50,      // swinging the hammer
  lockpickFail: 25,  // fumbling the kitchen lock
  flashlightMove: 5, // light spilling under doors while you walk
  fumbleDark: 15,    // knocking things over in the dark basement
  hideRelief: -30,   // holding your breath under the bed
  afterEscape: 20,   // noise level after surviving a Pursuit Event
  max: 100,
};

export const DIFFICULTY = {
  easy:      { label: 'Easy',      seconds: 15, noiseMult: 0.8, weights: { easy: 6, medium: 3, hard: 1 } },
  normal:    { label: 'Normal',    seconds: 10, noiseMult: 1.0, weights: { easy: 4, medium: 4, hard: 2 } },
  nightmare: { label: 'Nightmare', seconds: 7,  noiseMult: 1.25, weights: { easy: 2, medium: 4, hard: 4 } },
};

export const ITEMS = {
  flashlight:  { name: 'Flashlight',   desc: 'Weak beam. Toggle with F.' },
  hammer:      { name: 'Claw Hammer',  desc: 'Heavy. Loud. Effective.' },
  basementKey: { name: 'Basement Key', desc: 'Rusted. Smells like damp earth.' },
  boltCutters: { name: 'Bolt Cutters', desc: 'Enough to bite through a chain.' },
  masterKey:   { name: 'Master Key',   desc: 'Brass. Fits the front deadbolt.' },
};

// danger = number of trivia questions asked during a Pursuit Event in that room
export const ROOMS = {
  bedroom: {
    name: 'Bedroom',
    danger: 1,
    exits: ['hallway'],
    hideSpot: 'under the bed',
    desc: 'The room you woke up in. Peeling floral wallpaper. The bed frame is low enough to slide under.',
    hotspots: ['nightstand', 'note', 'bed'],
  },
  hallway: {
    name: 'Hallway',
    danger: 2,
    exits: ['bedroom', 'kitchen', 'basement', 'foyer'],
    creaky: true,
    hideSpot: 'inside the linen closet',
    desc: 'A long corridor with every door hanging open a crack. The floorboards groan under your weight.',
    hotspots: ['linenCloset', 'portrait'],
  },
  kitchen: {
    name: 'Kitchen',
    danger: 2,
    exits: ['hallway'],
    hideSpot: 'behind the pantry door',
    desc: 'A dripping tap. Something rotting in the sink. One drawer has a brass lock on it.',
    hotspots: ['cupboards', 'lockedDrawer', 'fridge'],
  },
  basement: {
    name: 'Basement',
    danger: 3,
    exits: ['hallway'],
    requires: 'basementKey',
    dark: true,
    hideSpot: 'behind the boiler',
    desc: 'Concrete, cold, and wet. The boiler ticks. You are not alone down here — you are never alone down here.',
    darkDesc: 'Pitch black. Water drips somewhere close. You can’t see your own hands.',
    hotspots: ['workbench', 'toolbox'],
  },
  foyer: {
    name: 'Front Foyer',
    danger: 3,
    exits: ['hallway'],
    hideSpot: 'in the coat closet',
    desc: 'The front door. Freedom is two locks away: a heavy chain and a brass deadbolt.',
    hotspots: ['frontDoor'],
  },
};

// type: search | read | hide | lockpick | smash | exit
export const HOTSPOTS = {
  nightstand: {
    label: 'Nightstand drawer', type: 'search', gives: 'flashlight',
    text: 'You ease the drawer open. A flashlight rolls into your palm.',
    emptyText: 'Empty now. Just a dead moth and a hair tie.',
  },
  note: {
    label: 'Crumpled note', type: 'read',
    text: '“If you’re reading this, I didn’t make it. The BASEMENT KEY is in the locked kitchen drawer — the lock is old, you can work it. The MASTER KEY is in the toolbox downstairs; you’ll need something heavy to open it. The chain on the front door needs cutters. It hunts by SOUND. Don’t make a sound.”',
  },
  bed: {
    label: 'Slide under the bed', type: 'hide',
    text: 'You slide under the bed and hold your breath until your chest burns. The house settles.',
    usedText: 'You just did that. Lying here longer won’t help — the house is listening.',
  },
  linenCloset: {
    label: 'Linen closet', type: 'search', gives: 'hammer',
    text: 'Behind moth-eaten towels: a claw hammer, its head crusted with something dark.',
    emptyText: 'Towels. Mildew. Nothing else.',
  },
  portrait: {
    label: 'Family portrait', type: 'read',
    text: 'A family of four. Someone has scratched out every face but one. The remaining face is smiling at you.',
  },
  cupboards: {
    label: 'Cupboards', type: 'search',
    text: 'Tins with no labels. A jar of teeth. Nothing useful — and that was loud.',
    emptyText: 'You’ve already searched these. Don’t push your luck.',
  },
  lockedDrawer: {
    label: 'Locked drawer', type: 'lockpick', gives: 'basementKey', questions: 2,
    text: 'The pins give one by one… click. Inside: the Basement Key.',
    emptyText: 'Open and empty.',
  },
  fridge: {
    label: 'Fridge note', type: 'read',
    text: 'A grocery list in shaky handwriting: “milk, eggs, more rope, new lock for front door — CHAIN.”',
  },
  workbench: {
    label: 'Workbench', type: 'search', gives: 'boltCutters',
    text: 'Your fingers close around cold steel handles. Bolt cutters.',
    emptyText: 'Sawdust and rusted nails.',
  },
  toolbox: {
    label: 'Padlocked toolbox', type: 'smash', gives: 'masterKey', requires: 'hammer',
    text: 'CRACK. The padlock shatters — the sound echoes up through the whole house. A brass key glints inside.',
    lockedText: 'Padlocked shut. You’d need something heavy to break it… and it would be loud.',
    emptyText: 'Smashed open. Empty.',
  },
  frontDoor: {
    label: 'Front door', type: 'exit', requires: ['masterKey', 'boltCutters'], questions: 3,
    lockedText: 'A chain and a deadbolt. You need the MASTER KEY and the BOLT CUTTERS.',
  },
};
