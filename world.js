// ─────────────────────────────────────────────────────────────
//  The house: a tile grid (1 tile ≈ 2.4 m wide, walls 1 unit high).
//  DOM-free — used by the renderer, the creature AI and the tests.
//
//  Cell kinds:  0 floor · 1 wall · 2 door · 3 block (solid furniture)
// ─────────────────────────────────────────────────────────────

export const FLOOR = 0;
export const WALL = 1;
export const DOOR = 2;
export const BLOCK = 3;

export const ROOM_DEFS = {
  bedroom:   { name: 'Bedroom',     rect: [1, 1, 6, 6],    floor: 'wood',      wall: 'paperRose',    ceil: 'plaster',      ambient: [0.050, 0.055, 0.085], danger: 1, steps: 'wood' },
  nursery:   { name: 'Nursery',     rect: [8, 1, 12, 6],   floor: 'wood',      wall: 'paperNursery', ceil: 'plaster',      ambient: [0.050, 0.040, 0.045], danger: 2, steps: 'wood' },
  kitchen:   { name: 'Kitchen',     rect: [14, 1, 20, 6],  floor: 'checker',   wall: 'kitchen',      ceil: 'plaster',      ambient: [0.035, 0.045, 0.030], danger: 2, steps: 'tile' },
  hall:      { name: 'Hallway',     rect: [1, 8, 21, 9],   floor: 'woodDark',  wall: 'wainscot',     ceil: 'plaster',      ambient: [0.030, 0.026, 0.022], danger: 2, steps: 'wood' },
  bathroom:  { name: 'Bathroom',    rect: [1, 11, 5, 15],  floor: 'tileSmall', wall: 'bathTile',     ceil: 'plaster',      ambient: [0.030, 0.040, 0.045], danger: 2, steps: 'tile' },
  foyer:     { name: 'Front Foyer', rect: [7, 11, 13, 16], floor: 'checker',   wall: 'paperRed',     ceil: 'woodCeil',     ambient: [0.060, 0.038, 0.032], danger: 3, steps: 'tile' },
  stairwell: { name: 'Stairwell',   rect: [23, 8, 23, 8],  floor: 'concrete',  wall: 'brick',        ceil: 'concreteCeil', ambient: [0.010, 0.010, 0.012], danger: 3, steps: 'wood' },
  basement:  { name: 'Basement',    rect: [26, 1, 34, 11], floor: 'concrete',  wall: 'brick',        ceil: 'concreteCeil', ambient: [0.012, 0.015, 0.018], danger: 3, steps: 'concrete' },
};
export const ROOM_IDS = Object.keys(ROOM_DEFS);

const DOORS = [
  { x: 3, y: 7 }, { x: 10, y: 7 }, { x: 17, y: 7 }, { x: 3, y: 10 },
  { x: 22, y: 8, kind: 'basement', lock: 'basementKey' },
];
const ARCHES = [[10, 10, 'foyer'], [11, 10, 'foyer']];

// solid furniture drawn as textured blocks
const BLOCKS = [
  [6, 1, 'wardrobe'], [12, 1, 'wardrobe'],
  [14, 1, 'fridge'], [15, 1, 'counter'], [16, 1, 'counter'], [17, 1, 'counterLock'], [18, 1, 'counterSink'], [19, 1, 'counter'], [20, 1, 'pantry'],
  [1, 8, 'closet'],
  [7, 11, 'clock'], [13, 16, 'closet'],
  [29, 1, 'bench'], [30, 1, 'bench'], [34, 3, 'shelves'], [34, 4, 'shelves'], [34, 5, 'shelves'], [34, 10, 'boiler'],
];

// textures painted onto specific wall cells
const WALL_OVERRIDES = [
  [10, 17, 'frontDoor'], [24, 8, 'stairsDown'], [26, 0, 'stairsUp'], [0, 3, 'window'],
  [7, 7, 'portrait'], [13, 7, 'portrait2'], [6, 10, 'portrait'], [14, 10, 'portrait2'],
];

// billboards: sprite name, position, collision radius, world size, height above floor
export const OBJECTS = [
  { id: 'bed',       sprite: 'bed',        x: 2.3,  y: 1.9,  r: 0.75, w: 1.5,  h: 0.62 },
  { id: 'nightstand',sprite: 'nightstand', x: 4.4,  y: 1.4,  r: 0.3,  w: 0.55, h: 0.48 },
  { id: 'note',      sprite: 'note',       x: 3.6,  y: 5.4,  r: 0,    w: 0.22, h: 0.1 },
  { id: 'crib',      sprite: 'crib',       x: 10.3, y: 1.7,  r: 0.55, w: 1.0,  h: 0.78 },
  { id: 'rocker',    sprite: 'rocker',     x: 9.0,  y: 5.0,  r: 0.4,  w: 0.7,  h: 0.75, anim: 'rock' },
  { id: 'toys',      sprite: 'doll',       x: 11.7, y: 5.5,  r: 0,    w: 0.3,  h: 0.3 },
  { id: 'table',     sprite: 'table',      x: 17,   y: 4,    r: 0.65, w: 1.3,  h: 0.5 },
  { id: 'chair1',    sprite: 'chair',      x: 16.1, y: 4.4,  r: 0.25, w: 0.5,  h: 0.62 },
  { id: 'chair2',    sprite: 'chair',      x: 17.9, y: 3.6,  r: 0.25, w: 0.5,  h: 0.62 },
  { id: 'bathtub',   sprite: 'bathtub',    x: 1.9,  y: 13.2, r: 0.7,  w: 1.3,  h: 0.95 },
  { id: 'sink',      sprite: 'sink',       x: 4.6,  y: 11.4, r: 0.3,  w: 0.55, h: 0.6 },
  { id: 'candle',    sprite: 'sidetable',  x: 11.5, y: 8.25, r: 0.25, w: 0.5,  h: 0.5 },
  { id: 'coatrack',  sprite: 'coatrack',   x: 8.0,  y: 15.6, r: 0.25, w: 0.65, h: 0.95 },
  { id: 'toolbox',   sprite: 'toolbox',    x: 31.5, y: 8.2,  r: 0.35, w: 0.6,  h: 0.32 },
  { id: 'bchair',    sprite: 'chair',      x: 29,   y: 6,    r: 0.25, w: 0.5,  h: 0.62 },
];

// point lights [x, y, r, g, b, radius, flicker 0..1]
export const LIGHTS = [
  { x: 6, y: 8.5, c: [1.0, 0.72, 0.42], rad: 5.5, flicker: 0.6, id: 'hall1' },
  { x: 15.5, y: 8.5, c: [1.0, 0.7, 0.4], rad: 5.5, flicker: 0.3, id: 'hall2' },
  { x: 17, y: 3.5, c: [0.62, 0.85, 0.45], rad: 6, flicker: 0.5, id: 'kitchen' },
  { x: 10, y: 13.5, c: [1.0, 0.55, 0.32], rad: 7.5, flicker: 0.15, id: 'foyer' },
  { x: 3, y: 13, c: [0.55, 0.7, 0.85], rad: 4.5, flicker: 0.9, id: 'bath' },
  { x: 11.6, y: 5.6, c: [0.9, 0.35, 0.4], rad: 3.2, flicker: 0.05, id: 'nightlight' },
  { x: 1.1, y: 3.5, c: [0.45, 0.55, 0.85], rad: 4.5, flicker: 0, id: 'moon' },
  { x: 33.8, y: 10.2, c: [1.0, 0.42, 0.12], rad: 5, flicker: 0.2, id: 'boiler' },
];

// things you can interact with (E / tap). face = which side you stand on
export const INTERACTABLES = [
  { id: 'nightstand',   x: 4.4,  y: 1.4,  type: 'search', label: 'Search the nightstand', gives: 'flashlight', text: 'Inside the drawer: a flashlight. The batteries rattle.', emptyText: 'Empty. A dead moth.' },
  { id: 'note',         x: 3.6,  y: 5.4,  type: 'read',   label: 'Read the note', text: '“If you’re reading this, she brought you home too. BASEMENT KEY: locked kitchen drawer. MASTER KEY: toolbox in the basement — you’ll need something heavy. BOLT CUTTERS for the chain. She hunts by SOUND. She hums when she’s calm. When the humming stops, hide.”' },
  { id: 'bed',          x: 2.3,  y: 1.9,  type: 'hide',   label: 'Hide under the bed', hide: { x: 2.3, y: 2.55, a: Math.PI / 2, z: 0.1, view: 'bed' } },
  { id: 'wardrobe1',    x: 6.5,  y: 1.5,  type: 'hide',   label: 'Hide in the wardrobe', hide: { x: 6.5, y: 2.08, a: Math.PI / 2, z: 0.55, view: 'slats' } },
  { id: 'crib',         x: 10.3, y: 1.7,  type: 'read',   label: 'Look in the crib', text: 'A diary page tucked in the blanket: “They’re still here. I hear them laughing inside the walls. Edmund says I need rest. I don’t need rest. I need them to STAY.”' },
  { id: 'rocker',       x: 9.0,  y: 5.0,  type: 'read',   label: 'Touch the rocking chair', text: 'It’s still moving. Nobody has sat here in years.' },
  { id: 'wardrobe2',    x: 12.5, y: 1.5,  type: 'hide',   label: 'Hide in the wardrobe', hide: { x: 12.5, y: 2.08, a: Math.PI / 2, z: 0.55, view: 'slats' } },
  { id: 'fridge',       x: 14.5, y: 1.5,  type: 'read',   label: 'Read the fridge note', text: 'Shaky handwriting: “milk · eggs · rope · a new CHAIN for the front door · set six places at the table. They’ll be hungry when they wake.”' },
  { id: 'cupboards',    x: 15.5, y: 1.5,  type: 'search', label: 'Search the cupboards', text: 'Tins with no labels. A jar of teeth. That was loud.', emptyText: 'Nothing else here.' },
  { id: 'lockedDrawer', x: 17.5, y: 1.5,  type: 'lockpick', label: 'Pick the drawer lock', gives: 'basementKey', questions: 2, text: 'Click. The drawer slides open: the Basement Key.', emptyText: 'Open and empty.' },
  { id: 'pantry',       x: 20.5, y: 1.5,  type: 'hide',   label: 'Hide in the pantry', hide: { x: 20.5, y: 2.08, a: Math.PI / 2, z: 0.55, view: 'crack' } },
  { id: 'linenCloset',  x: 1.5,  y: 8.5,  type: 'search', label: 'Search the linen closet', gives: 'hammer', text: 'Behind mouldy towels: a claw hammer, crusted with something dark.', emptyText: 'Towels. Mildew.' },
  { id: 'mirror',       x: 4.6,  y: 11.4, type: 'read',   label: 'Look in the mirror', text: 'Scratched into the glass, from the other side: SHE CAN’T FIND YOU IF YOU DON’T BREATHE.' },
  { id: 'diary',        x: 34.5, y: 4.5,  type: 'read',   label: 'Read the diary on the shelf', text: 'The last page: “Edmund tried to take them away from me. Now he stays in the garden. The nurse tried. The girl from the lake tried. Now everyone stays. Everyone stays home.”' },
  { id: 'portrait',     x: 7.5,  y: 7.5,  type: 'read',   label: 'Look at the portrait', text: 'The Marrow family, 1931. Every face is scratched out except the mother’s. Someone painted her eyes over in black.' },
  { id: 'bathtub',      x: 1.9,  y: 13.2, type: 'hide',   label: 'Hide behind the shower curtain', hide: { x: 1.95, y: 13.2, a: 0, z: 0.45, view: 'curtain' } },
  { id: 'clock',        x: 7.5,  y: 11.5, type: 'read',   label: 'Look at the clock', text: 'Stopped at 3:07 — the minute she came home and found them. The pendulum is still swinging.' },
  { id: 'coatCloset',   x: 13.5, y: 16.5, type: 'hide',   label: 'Hide in the coat closet', hide: { x: 12.92, y: 16.5, a: Math.PI, z: 0.55, view: 'slats' } },
  { id: 'frontDoor',    x: 10.5, y: 17.5, type: 'exit',   label: 'Unlock the front door', requires: ['masterKey', 'boltCutters'], questions: 3, lockedText: 'A heavy chain and a brass deadbolt. You need the MASTER KEY and BOLT CUTTERS.' },
  { id: 'stairsUp',     x: 26.5, y: 0.5,  type: 'stairs', label: 'Go back upstairs' },
  { id: 'workbench',    x: 29.5, y: 1.5,  type: 'search', label: 'Search the workbench', gives: 'boltCutters', text: 'Cold steel handles: bolt cutters.', emptyText: 'Sawdust and rusted nails.' },
  { id: 'toolbox',      x: 31.5, y: 8.2,  type: 'smash',  label: 'Smash the padlocked toolbox', gives: 'masterKey', requires: 'hammer', text: 'CRACK. The padlock shatters — the whole house heard that. A brass key glints inside.', lockedText: 'A padlocked toolbox. You need something heavy… and it will be loud.', emptyText: 'Smashed open. Empty.' },
  { id: 'boiler',       x: 34.5, y: 10.5, type: 'hide',   label: 'Hide behind the boiler', hide: { x: 33.55, y: 10.6, a: Math.PI, z: 0.4, view: 'boiler' } },
];

export const PLAYER_START = { x: 3.0, y: 3.4, a: Math.PI / 2 };
export const WAKE_POS = { x: 2.3, y: 2.9, a: Math.PI / 2 };
export const MONSTER_START = { x: 30.5, y: 6.5 };
export const PORTAL = { up: { x: 23.5, y: 8.5 }, down: { x: 26.5, y: 1.6 } }; // stairwell ↔ basement

export const WAYPOINTS = [
  [3.5, 4.0], [10, 4.0], [16.0, 3.0], [19.0, 5.0], [4, 8.5], [12, 8.5], [19.5, 8.5], [3, 13], [10, 13], [10, 15.5], [29, 4], [31, 9.5],
];

export const ITEMS = {
  flashlight:  { name: 'Flashlight',   icon: '🔦' },
  hammer:      { name: 'Claw Hammer',  icon: '🔨' },
  basementKey: { name: 'Basement Key', icon: '🗝' },
  boltCutters: { name: 'Bolt Cutters', icon: '✂' },
  masterKey:   { name: 'Master Key',   icon: '🔑' },
};

export class World {
  constructor() {
    this.w = 36; this.h = 19;
    const n = this.w * this.h;
    this.kind = new Uint8Array(n).fill(WALL);
    this.room = new Int8Array(n).fill(-1);
    this.override = new Array(n).fill(null);   // texture name
    this.blockTex = new Array(n).fill(null);
    this.doorAt = new Int16Array(n).fill(-1);
    this.pathBlocked = new Uint8Array(n);

    ROOM_IDS.forEach((id, ri) => {
      const [x1, y1, x2, y2] = ROOM_DEFS[id].rect;
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.set(x, y, FLOOR, ri);
    });
    ARCHES.forEach(([x, y, r]) => this.set(x, y, FLOOR, ROOM_IDS.indexOf(r)));
    this.doors = DOORS.map((d, i) => {
      this.kind[this.i(d.x, d.y)] = DOOR;
      this.doorAt[this.i(d.x, d.y)] = i;
      const axis = this.solid(d.x - 1, d.y) && this.solid(d.x + 1, d.y) ? 'x' : 'y'; // plane runs along this axis
      // a door belongs to the room it opens from: pick a floor neighbour
      const nb = axis === 'x' ? [[d.x, d.y - 1], [d.x, d.y + 1]] : [[d.x - 1, d.y], [d.x + 1, d.y]];
      this.room[this.i(d.x, d.y)] = this.room[this.i(...nb[1])] >= 0 ? this.room[this.i(...nb[1])] : this.room[this.i(...nb[0])];
      return { ...d, i, axis, kind: d.kind ?? 'wood', open: 0, target: 0, locked: !!d.lock };
    });
    BLOCKS.forEach(([x, y, tex]) => { this.kind[this.i(x, y)] = BLOCK; this.blockTex[this.i(x, y)] = tex; });
    WALL_OVERRIDES.forEach(([x, y, tex]) => { this.override[this.i(x, y)] = tex; });
    OBJECTS.filter((o) => o.r >= 0.5).forEach((o) => { this.pathBlocked[this.i(Math.floor(o.x), Math.floor(o.y))] = 1; });
    this.objects = OBJECTS.map((o) => ({ ...o }));
  }

  i(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, k, r) { const i = this.i(x, y); this.kind[i] = k; this.room[i] = r; }

  /** Solid for movement: walls, furniture blocks, and doors that aren't open. */
  solid(x, y) {
    if (!this.inside(x, y)) return true;
    const i = this.i(x, y), k = this.kind[i];
    if (k === WALL || k === BLOCK) return true;
    if (k === DOOR) return this.doors[this.doorAt[i]].open < 0.85;
    return false;
  }

  roomAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (!this.inside(cx, cy)) return null;
    const r = this.room[this.i(cx, cy)];
    return r >= 0 ? ROOM_IDS[r] : null;
  }

  doorNear(x, y, a, reach = 1.35) {
    let best = null, bestD = reach;
    for (const d of this.doors) {
      const dx = d.x + 0.5 - x, dy = d.y + 0.5 - y, dist = Math.hypot(dx, dy);
      if (dist > bestD) continue;
      const facing = (dx * Math.cos(a) + dy * Math.sin(a)) / (dist || 1);
      if (facing > 0.55) { best = d; bestD = dist; }
    }
    return best;
  }

  updateDoors(dt) {
    for (const d of this.doors) {
      if (d.open !== d.target) {
        const s = dt * 1.6;
        d.open = d.open < d.target ? Math.min(d.target, d.open + s) : Math.max(d.target, d.open - s * 1.5);
      }
    }
  }

  /** Move a circle of radius r from (x,y) by (dx,dy) with wall sliding. */
  move(x, y, dx, dy, r = 0.24) {
    const nx = x + dx;
    if (!this.#hits(nx, y, r)) x = nx;
    const ny = y + dy;
    if (!this.#hits(x, ny, r)) y = ny;
    return [x, y];
  }

  #hits(x, y, r) {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      if (this.solid(Math.floor(x + ox), Math.floor(y + oy))) return true;
    }
    for (const o of this.objects) {
      if (o.r > 0 && Math.hypot(o.x - x, o.y - y) < o.r + r * 0.6) return true;
    }
    return false;
  }

  /** Grid line of sight between two points (doors that are closed block it). */
  los(ax, ay, bx, by) {
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(dist * 6);
    for (let s = 1; s < steps; s++) {
      const t = s / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const cx = Math.floor(x), cy = Math.floor(y);
      const k = this.kind[this.i(cx, cy)];
      if (k === WALL || k === BLOCK) return false;
      if (k === DOOR && this.doors[this.doorAt[this.i(cx, cy)]].open < 0.6) return false;
    }
    return true;
  }

  walkableForCreature(x, y) {
    if (!this.inside(x, y)) return false;
    const i = this.i(x, y), k = this.kind[i];
    return (k === FLOOR || k === DOOR) && !this.pathBlocked[i];
  }

  /** A* over tiles (8-way, no corner cutting) with the stairwell↔basement portal. */
  path(sx, sy, tx, ty) {
    const start = [Math.floor(sx), Math.floor(sy)], goal = [Math.floor(tx), Math.floor(ty)];
    if (!this.walkableForCreature(...goal)) {
      // nearest walkable neighbour of the goal
      const alt = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => [goal[0] + dx, goal[1] + dy]).find((p) => this.walkableForCreature(...p));
      if (!alt) return null;
      goal[0] = alt[0]; goal[1] = alt[1];
    }
    const key = (x, y) => y * this.w + x;
    const pu = [Math.floor(PORTAL.up.x), Math.floor(PORTAL.up.y)], pd = [Math.floor(PORTAL.down.x), Math.floor(PORTAL.down.y)];
    const h = (x, y) => {
      const direct = Math.hypot(goal[0] - x, goal[1] - y);
      const via1 = Math.hypot(pu[0] - x, pu[1] - y) + Math.hypot(goal[0] - pd[0], goal[1] - pd[1]);
      const via2 = Math.hypot(pd[0] - x, pd[1] - y) + Math.hypot(goal[0] - pu[0], goal[1] - pu[1]);
      return Math.min(direct, via1, via2);
    };
    const open = new Map(), came = new Map(), g = new Map();
    const sk = key(...start);
    g.set(sk, 0); open.set(sk, h(...start));
    let guard = 0;
    while (open.size && guard++ < 4000) {
      let cur = null, best = Infinity;
      for (const [k, f] of open) if (f < best) { best = f; cur = k; }
      open.delete(cur);
      const cx = cur % this.w, cy = (cur / this.w) | 0;
      if (cx === goal[0] && cy === goal[1]) {
        const out = [[cx, cy]];
        let k = cur;
        while (came.has(k)) { k = came.get(k); out.unshift([k % this.w, (k / this.w) | 0]); }
        return out;
      }
      const nbrs = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.walkableForCreature(nx, ny)) continue;
        if (dx && dy && (!this.walkableForCreature(cx + dx, cy) || !this.walkableForCreature(cx, cy + dy))) continue;
        if (dx && dy && (this.kind[this.i(cx + dx, cy)] === DOOR || this.kind[this.i(cx, cy + dy)] === DOOR || this.kind[this.i(nx, ny)] === DOOR)) continue;
        nbrs.push([nx, ny, dx && dy ? 1.414 : 1]);
      }
      if (cx === pu[0] && cy === pu[1]) nbrs.push([pd[0], pd[1], 1]);
      if (cx === pd[0] && cy === pd[1]) nbrs.push([pu[0], pu[1], 1]);
      for (const [nx, ny, c] of nbrs) {
        const nk = key(nx, ny), ng = g.get(cur) + c;
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng); came.set(nk, cur); open.set(nk, ng + h(nx, ny));
        }
      }
    }
    return null;
  }
}

// Where the residents stand — dark corners and doorways, never in the middle of a room.
export const RESIDENT_SPOTS = [
  [5.6, 5.6], [1.4, 5.6], [8.5, 5.6], [12.5, 3.5], [20.5, 5.6], [14.5, 5.5],
  [20.6, 9.4], [1.5, 9.5], [11, 9.6], [5.5, 15.5], [1.5, 11.4],
  [7.5, 16.5], [12.6, 11.5], [7.4, 13.5], [26.6, 11.4], [34.4, 7], [28, 10.5],
];
