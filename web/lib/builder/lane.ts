// Where a ball can be on a hole, on a quarter-unit grid: the floods the
// builder's checks read (checks.ts). A cell is shut where a ball's centre
// there would be within clearance of a fixed wall or post (a timed piece, or
// a pulse's, is not always there: left out, the most open the hole ever is,
// unless the pieces that come and go shut it between them at every tick of
// every stroke). The lane is what a ball cannot leave; the way is what a
// ball from the tee reaches, a tunnel a jump to its way out, a hazard a stop;
// a trap, a place the way reaches that the cup is never reached from.
import { inZone, segDist, there } from "../terrain";
import { RULES } from "../chain";
import { KICK, kicks, MIN_RAMP, rolling, SPEED_CAP } from "./rules";
import type { HoleIn, PostIn, Timing, V, WallIn, ZoneIn } from "./types";

/** The grid's cell: the builder's snap. */
export const CELL = 0.25;
/** The quickest surface a slope may be laid with (ice, wet in the rain): where even that lets a ball rest, no slope is one-way. */
const ROLL_TOP = 1.4;

const shapeOf = (z: ZoneIn) => ({ min: z.min, max: z.max, round: !!z.round, poly: z.poly, outside: z.outside });
/** A zone a ball cannot rest in: a hazard sends it back, a tunnel or a loop moves it on. */
export const moves = (z: ZoneIn) => z.kind === "hazard" || z.kind === "tunnel" || z.kind === "loop";

/** A zone's outline: its polygon, its box's corners, an ellipse by ROUND_SIDES points on it. */
const ROUND_SIDES = 32;
export function outline(z: ZoneIn): V[] {
  if (z.poly?.length) return [...z.poly];
  if (!z.round) return [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]];
  const cx = (z.min[0] + z.max[0]) / 2, cy = (z.min[1] + z.max[1]) / 2, rx = (z.max[0] - z.min[0]) / 2, ry = (z.max[1] - z.min[1]) / 2;
  return Array.from({ length: ROUND_SIDES }, (_, k): V => [cx + rx * Math.cos((2 * Math.PI * k) / ROUND_SIDES), cy + ry * Math.sin((2 * Math.PI * k) / ROUND_SIDES)]);
}

/** f of each 4-way neighbour on a grid nx wide of n cells (none past its edges). */
const around = (k: number, nx: number, n: number, f: (j: number) => void) => {
  const i = k % nx;
  if (i > 0) f(k - 1);
  if (i < nx - 1) f(k + 1);
  if (k >= nx) f(k - nx);
  if (k + nx < n) f(k + nx);
};

/** A grid over a hole's fixed walls, posts and zones, its cells shut at a clearance. */
export interface Grid {
  nx: number;
  ny: number;
  /** a point's cell index, -1 off the grid */
  cell(p: V): number;
  /** a cell's centre */
  centre(k: number): V;
  /** the cells' columns and rows over a box, clamped to the grid: [i0, i1, j0, j1] */
  box(lo: V, hi: V): [number, number, number, number];
  shut: Uint8Array;
}

/** The grid of a hole at a clearance (a ball's radius, or more for a margin); hazards: a fixed hazard's cells shut too (it bounds a lane as a wall does: the void round the mines', the island's sea). */
export function gridOf(h: HoleIn, clearance: number, hazards = false): Grid {
  const walls = h.walls.filter((w) => !w.every), posts = h.posts;
  const xs = [...walls.flatMap((w) => [w.a[0], w.b[0]]), ...h.zones.flatMap((z) => [z.min[0], z.max[0]]), h.tee[0], h.pin[0]];
  const ys = [...walls.flatMap((w) => [w.a[1], w.b[1]]), ...h.zones.flatMap((z) => [z.min[1], z.max[1]]), h.tee[1], h.pin[1]];
  const pad = clearance + 2 * CELL, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / CELL), ny = Math.ceil((Math.max(...ys) + pad - y0) / CELL);
  const shut = new Uint8Array(nx * ny);
  const cx = (i: number) => x0 + (i + 0.5) * CELL, cy = (j: number) => y0 + (j + 0.5) * CELL;
  const span = (lo: number, hi: number, o: number, n: number): [number, number] => [Math.max(0, Math.floor((lo - o) / CELL)), Math.min(n - 1, Math.ceil((hi - o) / CELL))];
  for (const w of walls) {
    const [i0, i1] = span(Math.min(w.a[0], w.b[0]) - clearance, Math.max(w.a[0], w.b[0]) + clearance, x0, nx);
    const [j0, j1] = span(Math.min(w.a[1], w.b[1]) - clearance, Math.max(w.a[1], w.b[1]) + clearance, y0, ny);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(cx(i), cy(j), w.a, w.b) < clearance) shut[j * nx + i] = 1;
  }
  for (const p of posts) {
    const r = p.r + clearance, [i0, i1] = span(p.c[0] - r, p.c[0] + r, x0, nx), [j0, j1] = span(p.c[1] - r, p.c[1] + r, y0, ny);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cx(i) - p.c[0], cy(j) - p.c[1]) < r) shut[j * nx + i] = 1;
  }
  // the pieces that come and go: each cell they shut, with the clocks they shut it on (a timed one's ticks, a
  // pulse's strokes); one shut between them at every tick of every stroke (two planks timed in turn across one
  // door, two pulses in turn) is shut for good, as a fixed wall's is: no ball is ever there
  const comers = new Map<number, Clocked[]>();
  const add = (lo: V, hi: V, hit: (x: number, y: number) => boolean, c: Clocked) => {
    const [i0, i1] = span(lo[0], hi[0], x0, nx), [j0, j1] = span(lo[1], hi[1], y0, ny);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        if (shut[k] || !hit(cx(i), cy(j))) continue;
        const cs = comers.get(k);
        if (cs) cs.push(c);
        else comers.set(k, [c]);
      }
    }
  };
  for (const m of movers(h)) {
    if (m.set === "wall") {
      const w = m.item as WallIn;
      add([Math.min(w.a[0], w.b[0]) - clearance, Math.min(w.a[1], w.b[1]) - clearance], [Math.max(w.a[0], w.b[0]) + clearance, Math.max(w.a[1], w.b[1]) + clearance], (x, y) => segDist(x, y, w.a, w.b) < clearance, m.clock);
    } else if (m.set === "post") {
      const p = m.item as PostIn;
      add([p.c[0] - p.r - clearance, p.c[1] - p.r - clearance], [p.c[0] + p.r + clearance, p.c[1] + p.r + clearance], (x, y) => Math.hypot(x - p.c[0], y - p.c[1]) < p.r + clearance, m.clock);
    } else if ((m.item as ZoneIn).kind === "hazard") {
      const z = m.item as ZoneIn, sh = shapeOf(z);
      add(z.min, z.max, (x, y) => inZone(sh, x, y), m.clock);
    }
  }
  // (one piece alone is never there all the time: E7; the same set of pieces, over many cells, judged once)
  const judged = new Map<string, boolean>(), ids = new Map<Clocked, number>(), idOf = (c: Clocked) => ids.get(c) ?? (ids.set(c, ids.size), ids.size - 1);
  for (const [k, cs] of comers) {
    if (cs.length < 2) continue;
    const key = cs.map(idOf).join(" ");
    let all = judged.get(key);
    if (all === undefined) judged.set(key, (all = always(cs)));
    if (all) shut[k] = 1;
  }
  if (hazards) {
    const fixed = h.zones.filter((z) => z.kind === "hazard" && !z.every).map(shapeOf);
    for (let k = 0; k < shut.length; k++) {
      if (!shut[k] && fixed.some((sh) => inZone(sh, cx(k % nx), cy(Math.floor(k / nx))))) shut[k] = 1;
    }
  }
  return {
    nx, ny, shut,
    cell: (p) => {
      const i = Math.floor((p[0] - x0) / CELL), j = Math.floor((p[1] - y0) / CELL);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    },
    centre: (k) => [cx(k % nx), cy(Math.floor(k / nx))],
    box: (lo, hi) => [...span(lo[0], hi[0], x0, nx), ...span(lo[1], hi[1], y0, ny)] as [number, number, number, number],
  };
}

/** A piece that comes and goes: on at the substeps of its tick timing, or on the strokes of its pulse's. */
type Clocked = { tick?: Timing; stroke?: Timing };
/** A piece that comes and goes, where it is in the hole (set, index, its pulse's) and its clock. */
export interface Mover {
  set: "wall" | "post" | "zone";
  i: number;
  pulse?: number;
  item: WallIn | PostIn | ZoneIn;
  clock: Clocked;
}
/** The hole's pieces that come and go, every one: its timed walls and zones, its pulses' walls, posts and zones (posts are never timed: GG1 has no clock for one). What gridOf shuts for good between them, and E17 holds clear of water. */
export function movers(h: HoleIn): Mover[] {
  const out: Mover[] = [];
  h.walls.forEach((w, i) => w.every && out.push({ set: "wall", i, item: w, clock: { tick: w as Timing } }));
  h.zones.forEach((z, i) => z.every && out.push({ set: "zone", i, item: z, clock: { tick: z as Timing } }));
  h.pulses.forEach((p, k) => {
    p.walls.forEach((w, i) => out.push({ set: "wall", i, pulse: k, item: w, clock: { stroke: p } }));
    p.posts.forEach((q, i) => out.push({ set: "post", i, pulse: k, item: q, clock: { stroke: p } }));
    p.zones.forEach((z, i) => out.push({ set: "zone", i, pulse: k, item: z, clock: { stroke: p } }));
  });
  return out;
}
/** The most ticks a timed piece's cycles are checked over together (their least common multiple): past it, not shut for good. */
const MAX_CYCLE = 1 << 16;
/** Whether pieces that come and go, between them, are there at every tick of every stroke of a round. */
function always(cs: readonly Clocked[]): boolean {
  const ticks = cs.filter((c) => c.tick).map((c) => c.tick!), strokes = cs.filter((c) => c.stroke).map((c) => c.stroke!);
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let cycle = 1;
  for (const t of ticks) if ((cycle = (cycle / gcd(cycle, t.every)) * t.every) > MAX_CYCLE) return false;
  // the timed ones alone there at every tick
  let ticked = ticks.length > 0;
  for (let t = 0; ticked && t < cycle; t++) ticked = ticks.some((q) => there(t, q.every, q.on, q.phase));
  if (ticked) return true;
  if (!strokes.length) return false;
  // else a pulse there on every stroke of a round
  for (let s = 0; s < RULES.maxRoundStrokes; s++) if (!strokes.some((q) => there(s, q.every, q.on, q.phase))) return false;
  return true;
}

/** f of each cell of grid g whose centre lies in zone z (its box's cells only). */
function boxCells(g: Grid, z: ZoneIn, f: (k: number) => void) {
  const sh = shapeOf(z), [i0, i1, j0, j1] = g.box(z.min, z.max), [ox, oy] = g.centre(0);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inZone(sh, ox + i * CELL, oy + j * CELL)) f(j * g.nx + i);
}

/** The cells reached from some start cells through open neighbours (4 ways), with each one's parent; reach() may add jumps. */
function flood(g: Grid, starts: number[], step: (k: number) => number[] = () => []) {
  const parent = new Int32Array(g.nx * g.ny).fill(-2), queue: number[] = [];
  const visit = (k: number, from: number) => {
    if (k >= 0 && !g.shut[k] && parent[k] === -2) (parent[k] = from), queue.push(k);
  };
  for (const s of starts) visit(s, -1);
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    around(k, g.nx, g.shut.length, (j) => visit(j, k));
    for (const j of step(k)) visit(j, k);
  }
  return parent;
}

/**
 * The lane at a clearance: a point a ball cannot leave the board from, its
 * fixed walls, posts and hazards round it (the cells the grid's edge floods
 * are outside). A point on a wall or in a hazard answers true: their own
 * checks name it.
 */
export function laneOf(h: HoleIn, clearance = h.ballR): (p: V) => boolean {
  // (a hole's lane at a clearance, once: the checks and the draft's rules all ask it)
  const kept = lanes.get(h)?.get(clearance);
  if (kept) return kept;
  const l = laned(h, clearance);
  lanes.set(h, (lanes.get(h) ?? new Map<number, (p: V) => boolean>()).set(clearance, l));
  return l;
}
const lanes = new WeakMap<HoleIn, Map<number, (p: V) => boolean>>();
function laned(h: HoleIn, clearance: number): (p: V) => boolean {
  const g = gridOf(h, clearance, true), edge: number[] = [];
  for (let i = 0; i < g.nx; i++) edge.push(i, (g.ny - 1) * g.nx + i);
  for (let j = 0; j < g.ny; j++) edge.push(j * g.nx, j * g.nx + g.nx - 1);
  const out = flood(g, edge);
  return (p) => {
    const k = g.cell(p);
    return k >= 0 && (g.shut[k] === 1 || out[k] === -2);
  };
}

/** How far a hop off a hill's crest may carry a ball, at most: a generous bound (E4 must never refuse a hole a ball can play; the proof, holing it, is the other half). */
export const FLIGHT = 12;

/**
 * The way from the tee at a clearance, the most open the hole ever is:
 * whether the cup is reached (a cell within the cup's radius of the pin), and
 * the cells passed on the way to it (the path, cup first), and how many cells it reaches (size). Fixed hazards stop
 * it (a timed one is sometimes gone); a tunnel of any clock moves it on to
 * its way out, ahead of a hazard it sits in (a geyser in a hot spring); a
 * hill steep enough to launch (MIN_RAMP) hops it off its crest, up to FLIGHT
 * along its climb, over whatever lies there. A necessary condition, not a
 * proof: L3 is the proof.
 */
export function reach(h: HoleIn, clearance = h.ballR): Reach {
  // a hole's flood at a clearance, once (checkHole's way and reach, the draft's bars all ask it)
  const kept = floods.get(h)?.get(clearance);
  if (kept) return kept;
  const r = flooded(h, clearance);
  floods.set(h, (floods.get(h) ?? new Map<number, Reach>()).set(clearance, r));
  return r;
}
type Reach = { reached: boolean; path: V[]; grid: Grid; reaches: (p: V, rad?: number) => boolean; size: number };
const floods = new WeakMap<HoleIn, Map<number, Reach>>();

function flooded(h: HoleIn, clearance: number): Reach {
  const g = gridOf(h, clearance);
  // each zone laid over its box's cells once (not every zone tested at every cell), in the hole's order: a tunnel's or a
  // loop's mouth moves the ball on (the first of them over a cell), a fixed hazard alone sends it back: no way on
  const jumps = new Map<number, number[]>(), add = (k: number, j: number) => j >= 0 && jumps.set(k, [...(jumps.get(k) ?? []), j]);
  const way = new Int16Array(g.shut.length).fill(-1), wet = new Uint8Array(g.shut.length);
  h.zones.forEach((z, i) => {
    if (z.kind === "tunnel" || z.kind === "loop") boxCells(g, z, (k) => way[k] < 0 && (way[k] = i));
    else if (z.kind === "hazard" && !z.every) boxCells(g, z, (k) => (wet[k] = 1));
  });
  for (let k = 0; k < g.shut.length; k++) {
    if (g.shut[k]) continue;
    if (way[k] >= 0) add(k, g.cell(h.zones[way[k]].vec ?? h.zones[way[k]].min));
    else if (wet[k]) g.shut[k] = 1;
  }
  // a hill's crest: up to FLIGHT along its climb
  for (const z of h.zones) {
    if (!(z.kind === "slope" && !z.air && z.vec && Math.hypot(z.vec[0], z.vec[1]) >= MIN_RAMP)) continue;
    const sh = shapeOf(z), l = Math.hypot(z.vec[0], z.vec[1]), u: V = [-z.vec[0] / l, -z.vec[1] / l];
    boxCells(g, z, (k) => {
      if (g.shut[k]) return;
      const [x, y] = g.centre(k);
      if (inZone(sh, x + u[0] * CELL, y + u[1] * CELL)) return; // not its crest
      for (let d = CELL; d <= FLIGHT; d += CELL) add(k, g.cell([x + u[0] * d, y + u[1] * d]));
    });
  }
  const tee = g.cell(h.tee);
  const parent = flood(g, tee >= 0 ? [tee] : [], (k) => jumps.get(k) ?? []);
  const cup = h.cupR, ends: number[] = [];
  let size = 0;
  for (let k = 0; k < parent.length; k++) {
    if (parent[k] === -2) continue;
    size++;
    const [x, y] = g.centre(k);
    if (Math.hypot(x - h.pin[0], y - h.pin[1]) <= cup) ends.push(k);
  }
  // whether a ball from the tee gets within rad of p (a cell of the way that near)
  const reaches = (p: V, rad = 0) => {
    const n = Math.ceil(rad / CELL) + 1;
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      const k = g.cell([p[0] + di * CELL, p[1] + dj * CELL]);
      if (k >= 0 && parent[k] !== -2 && Math.hypot(g.centre(k)[0] - p[0], g.centre(k)[1] - p[1]) <= rad + CELL) return true;
    }
    return false;
  };
  if (!ends.length) return { reached: false, path: [], grid: g, reaches, size };
  const path: V[] = [];
  for (let k = ends[0]; k >= 0; k = parent[k]) path.push(g.centre(k));
  return { reached: true, path, grid: g, reaches, size };
}

/** What leads a ball into a trap: a tunnel's way out, a slope too long to climb back, a hop off a hill (h.zones' index). */
export interface Trap {
  /** climb: no trap, the cup itself out of reach, up the slope zone; cut: out of reach, no slope to blame (a hop the
   *  way's flood lets over a wall, which a ball in the air still meets), zone -1 */
  kind: "tunnel" | "slope" | "hop" | "climb" | "cut";
  zone: number;
  /** where the ball ends up: the tunnel's way out, a place in the trap */
  at: V;
}

/** The most a ball has to climb with, as kinetic energy (v²/2, board units per substep): a full stroke's launch, or SpeedCap's off a bumper. */
const LAUNCH = (KICK * 10 ** 0.75) ** 2 / 2, TOP = SPEED_CAP ** 2 / 2;

/**
 * The traps of a hole: the places a ball from the tee can come to rest that
 * the cup can never be reached from again. The way (reach) treats the board
 * as two-way; three things on it are one-way: a tunnel (in at its mouth, out
 * at its way out, never back), a hop off a hill's crest, and ground a ball
 * cannot rest on (a fixed slope steeper than the rolling resistance of the
 * surface on that cell: ice keeps it so, sand lets a ball stop) when it is
 * longer than a ball can climb. A ball comes to rest on the flat (anywhere a
 * slope does not roll it on), or on such ground pinned against a wall at its
 * foot, or at the bottom of a valley (two falls meeting head on); from rest
 * a stroke gives it at most LAUNCH to climb with (TOP with a bumper to kick
 * off), which a downhill adds to (up to SpeedCap) and an uphill spends at the
 * slope's grade per unit climbed, one plane all along (abutting slopes of one
 * grade and fall are one slope), and on such ground the rolling resistance
 * of the surface there per unit rolled (a full stroke climbs about 17 up the
 * steepest grass slope, as the physics plays it); a step from one plane to another
 * keeps no more than a launch's (generous all the same: a bounce's loss and
 * the grass off such ground are left out, so nothing a ball can climb is
 * ever called a trap). Fixed
 * hazards stop it (they send it back where it was struck), timed and pulsed
 * pieces are left out but those that shut a cell for good (gridOf). In calm
 * weather: the snow's slower green or a puddle may hold a ball on such a
 * slope, the rest of the time it is a trap all the same. A trap is named by
 * what led the ball into it (the first such piece on the way there, from a
 * place the cup is reached from); none for a hole whose cup the tee does
 * not reach (E4 says that) unless only a climb keeps it out ("climb"). full: never
 * the quick way (the tests hold the two to one another).
 */
export function traps(h: HoleIn, clearance = h.ballR, full = false): Trap[] {
  const zs = h.zones;
  // the ground slopes (fixed, not air), their grade and fall (unit, downhill), and the plane each lies in (one grade, one fall)
  const falls = zs.map((z) => {
    if (z.kind !== "slope" || z.air || z.every || !z.vec) return null;
    const grade = Math.hypot(z.vec[0], z.vec[1]);
    return grade > 0 ? { grade, u: [z.vec[0] / grade, z.vec[1] / grade] as V, cos: Math.sqrt(1 - Math.min(grade, 0.95) ** 2), plane: `${z.vec[0]} ${z.vec[1]}` } : null;
  });
  // (steep: a fall a ball cannot rest on even on the quickest surface; else no slope is one-way anywhere)
  const isSteep = (f: (typeof falls)[number]) => !!f && f.grade > rolling(h.friction, ROLL_TOP) * f.cos;
  const steep = falls.some(isSteep);
  const tunnels = zs.some((z) => z.kind === "tunnel" || z.kind === "loop");
  const hills = zs.map((z, i) => i).filter((i) => zs[i].kind === "slope" && !zs[i].air && zs[i].vec && Math.hypot(zs[i].vec[0], zs[i].vec[1]) >= MIN_RAMP);
  if (!tunnels && !steep && !hills.length) return [];
  // the way's own grid (reach: its fixed hazards shut as the walls are, given back below: solid is the walls' and posts')
  const g = reach(h, clearance).grid, n = g.shut.length, solid = g.shut.slice(), nx = g.nx;
  const [cx0, cy0] = g.centre(0), xs = new Float64Array(n), ys = new Float64Array(n);
  for (let k = 0; k < n; k++) (xs[k] = cx0 + (k % nx) * CELL), (ys[k] = cy0 + Math.floor(k / nx) * CELL);
  // each zone laid over its box's cells once, in the hole's order (as the physics reads them): a fixed hazard (wet), a
  // fixed tunnel's mouth (it jumps, never holds a ball) or a timed one's (it may), the first ground slope (the ground),
  // the last surface (its scale: the resistance there), whether a cell is any slope's (a crest has none uphill of it)
  const wet = new Uint8Array(n), mouth = new Int16Array(n).fill(-1), timed = new Int16Array(n).fill(-1), first = new Int16Array(n).fill(-1), sloped = new Uint8Array(n);
  const scale = new Float64Array(n).fill(1);
  const cellsOf = (z: ZoneIn, f: (k: number) => void) => boxCells(g, z, f);
  zs.forEach((z, i) => {
    if (z.kind === "tunnel" || z.kind === "loop") cellsOf(z, (k) => mouth[k] < 0 && timed[k] < 0 && ((z.every ? timed : mouth)[k] = i));
    else if (z.kind === "hazard" && !z.every) cellsOf(z, (k) => (wet[k] = 1));
    else if (z.kind === "slope" && !z.air) cellsOf(z, (k) => ((sloped[k] = 1), falls[i] && first[k] < 0 && (first[k] = i)));
    else if (z.kind === "surface" && !z.every) cellsOf(z, (k) => (scale[k] = z.scale ?? 0));
  });
  for (let k = 0; k < n; k++) {
    if (mouth[k] >= 0 || timed[k] >= 0) wet[k] = 0; // (a tunnel in a hot spring: the tunnel first)
    if (wet[k]) solid[k] = 0; // (the way's grid shut it: water, not a wall)
  }
  // one-way ground: a cell whose first ground slope rolls a ball on there (grade above that cell's resistance)
  // (and its rolling resistance there, the energy a ball loses for each unit it rolls; each zone's most, for the quick way)
  // (and the zones with any: the steep ones)
  const ground = new Int16Array(n).fill(-1), resist = new Float64Array(n), most = new Float64Array(zs.length), steepZones: number[] = [];
  for (let k = 0; k < n; k++) {
    const z = first[k], f = z >= 0 ? falls[z] : null;
    if (!f || !(scale[k] > 0)) continue;
    resist[k] = rolling(h.friction, scale[k]) * f.cos;
    if (!(f.grade > resist[k])) continue;
    if (!most[z]) steepZones.push(z);
    (ground[k] = z), (most[z] = Math.max(most[z], resist[k]));
  }
  // the hops: off each hill's crest (a cell with no slope ground just uphill of it), up its climb as far as FLIGHT or
  // the first wall or post on its way (a ball in the air still meets them)
  const hopTo: number[][] = [], hopZone: number[] = [], hopAt = new Int32Array(n).fill(-1);
  for (const i of hills) {
    const z = zs[i], l = Math.hypot(z.vec![0], z.vec![1]), u: V = [-z.vec![0] / l, -z.vec![1] / l];
    cellsOf(z, (k) => {
      if (solid[k] || hopAt[k] >= 0) return;
      const up = g.cell([xs[k] + u[0] * CELL, ys[k] + u[1] * CELL]);
      if (up >= 0 && sloped[up]) return; // not a crest: more slope above
      const to: number[] = [];
      for (let d = CELL, j = g.cell([xs[k] + u[0] * d, ys[k] + u[1] * d]); d <= FLIGHT && j >= 0 && !solid[j]; d += CELL, j = g.cell([xs[k] + u[0] * d, ys[k] + u[1] * d])) to.push(j);
      hopAt[k] = hopTo.length;
      hopTo.push(to), hopZone.push(i);
    });
  }
  const exitOf = (i: number) => g.cell(zs[i].vec ?? zs[i].min);
  // (a bumper on the board: a ball may come off it at SpeedCap)
  const launch = [...h.posts, ...h.pulses.flatMap((p) => p.posts)].some((p) => kicks(p.skin ?? "") && (p.bounce ?? 0) > 1) || h.walls.some((w) => kicks(w.skin ?? "") && (w.bounce ?? 0) > 1) ? TOP : LAUNCH;
  // (the cup's disc: its box's cells only)
  const atCup = new Uint8Array(n), [ci0, ci1, cj0, cj1] = g.box([h.pin[0] - h.cupR, h.pin[1] - h.cupR], [h.pin[0] + h.cupR, h.pin[1] + h.cupR]);
  for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) if (Math.hypot(xs[j * nx + i] - h.pin[0], ys[j * nx + i] - h.pin[1]) <= h.cupR) atCup[j * nx + i] = 1;
  // every patch of one-way ground (its steep zones joined wherever they meet or overlap, whatever their grade or fall)
  // that a stroke climbs whole (each zone's grade and its most rolling resistance, times its depth along its own fall,
  // summed over the patch: the most the straight way across it costs): no slope is one-way after all, and the board is its open cells joined 4 ways, tunnels
  // and hops the only one-way steps: a trap is a part of it the tee's part reaches by them that never reaches the
  // cup's (quick: no energies; the full way below agrees, builder-traps.test.ts)
  const root = new Map(steepZones.map((i) => [i, i]));
  const rootOf = (i: number): number => (root.get(i) === i ? i : rootOf(root.get(i)!));
  for (const i of steepZones) for (const j of steepZones) {
    const a = zs[i], b = zs[j];
    if (i < j && a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1]) root.set(rootOf(j), rootOf(i));
  }
  const climb = new Map<number, number>();
  for (const i of steepZones) {
    const f = falls[i]!, along = outline(zs[i]).map((q) => q[0] * f.u[0] + q[1] * f.u[1]);
    climb.set(rootOf(i), (climb.get(rootOf(i)) ?? 0) + (f.grade + most[i]) * (Math.max(...along) - Math.min(...along)));
  }
  if (!full && [...climb.values()].every((c) => c <= launch)) return parts(g, { solid, wet, mouth, timed, hopAt, hopTo, hopZone, atCup, exitOf, zs, tee: g.cell(h.tee) });
  // each cell's plane, a number (the first zone of its grade and fall; -1 off one-way ground)
  const planeOf = falls.map((f, i) => (f ? falls.findIndex((q) => q && q.plane === f.plane) : i)), planes = new Int16Array(n).fill(-1);
  for (let k = 0; k < n; k++) if (ground[k] >= 0) planes[k] = planeOf[ground[k]];
  const plane = (k: number) => planes[k];
  // the places a ball rests: the flat (a cell neither wet, a mouth, nor one-way ground), joined 4 ways; and on one-way
  // ground, a cell pinned against a wall or a post downhill of it, or at a valley's bottom (the ground downhill of it
  // falls back toward it), joined 8 ways along its foot
  const free = (k: number) => !solid[k] && !wet[k] && mouth[k] < 0 && ground[k] < 0;
  const pinned = (k: number) => {
    if (solid[k] || ground[k] < 0 || wet[k] || mouth[k] >= 0) return false;
    const { u } = falls[ground[k]]!, i = k % nx;
    const down = [Math.abs(u[0]) > 0.38 ? [Math.sign(u[0]), 0] : null, Math.abs(u[1]) > 0.38 ? [0, Math.sign(u[1])] : null].filter(Boolean) as number[][];
    return down.some(([di, dj]) => {
      const j = k + di + dj * nx;
      if (i + di < 0 || i + di >= nx || j < 0 || j >= n || solid[j]) return true;
      const f = ground[j] >= 0 ? falls[ground[j]]! : null;
      return !!f && f.u[0] * u[0] + f.u[1] * u[1] < 0;
    });
  };
  const rests = new Uint8Array(n);
  for (let k = 0; k < n; k++) rests[k] = free(k) ? 1 : pinned(k) ? 2 : 0;
  const group = new Int32Array(n).fill(-1), groups: number[][] = [];
  const steps8 = [-1, 1, -nx, nx, -nx - 1, -nx + 1, nx - 1, nx + 1];
  for (let k = 0; k < n; k++) {
    const kind = rests[k];
    if (!kind || group[k] >= 0) continue;
    const id = groups.length, cells = [k];
    group[k] = id;
    for (let q = 0; q < cells.length; q++) {
      const c = cells[q], i = c % nx, join = (j: number) => {
        if (group[j] < 0 && rests[j] === kind && (kind === 1 || plane(j) === plane(c))) (group[j] = id), cells.push(j);
      };
      if (kind === 1) around(c, nx, n, join);
      else for (const d of steps8) {
        const j = c + d, dx = (((d % nx) + nx + 1) % nx) - 1; // (the step's column change: -1, 0 or 1)
        if (i + dx >= 0 && i + dx < nx && j >= 0 && j < n) join(j);
      }
    }
    groups.push(cells);
  }
  // the groups whose own flood reaches the cup (true) or never does (false), as they are found
  const fine = new Map<number, boolean>();
  // a flood from some places of rest: the most energy a ball can have at each cell, what led it there (a zone's index
  // times 3, and 0 its tunnel, 1 its slope, 2 a hop off it); stopped once
  // the cup is reached (or a group known to reach it) when only that is asked. The most energetic cell first (a heap),
  // so a cell is seldom met again with more. Its arrays are the traps' own, cleared after each flood where it went
  const best = new Float64Array(n).fill(-1), done = new Float64Array(n).fill(-1), cause = new Int32Array(n).fill(-1);
  const heap: number[] = [];
  const flood = (starts: number[], toCup: boolean, free = false) => {
    const seen: number[] = [], flat: number[] = [];
    let holed = false, size = 0, f0 = 0;
    heap.length = 0;
    // (a heap of cells, the most energetic first; a cell may be in it more than once, met again with more)
    const push = (k: number) => {
      let i = size++;
      heap[i] = k;
      for (let p = (i - 1) >> 1; i > 0 && best[heap[i]] > best[heap[p]]; i = p, p = (i - 1) >> 1) [heap[i], heap[p]] = [heap[p], heap[i]];
    };
    const pop = () => {
      const top = heap[0];
      heap[0] = heap[--size];
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < size && best[heap[l]] > best[heap[m]]) m = l;
        if (r < size && best[heap[r]] > best[heap[m]]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
      return top;
    };
    const visit = (j: number, e: number, why: number, jumps = 0): void => {
      if (j < 0 || solid[j] || wet[j]) return;
      // in at the mouth, out at its way out, as fast (a way out in a mouth: on, a few times at most)
      if (mouth[j] >= 0) return void (jumps < 4 && visit(exitOf(mouth[j]), e, mouth[j] * 3, jumps + 1));
      if (rests[j]) e = Math.max(e, launch); // where it can stop, it can be struck again
      if (e <= best[j] + 1e-3) return; // (a thousandth more is no more: the flood settles)
      if (best[j] < 0) seen.push(j);
      // (the flat at a launch's, the most of it: in turn, no heap needed; the rest by their energy)
      (best[j] = e), (cause[j] = why), rests[j] === 1 && e === launch ? flat.push(j) : push(j);
      // (at the cup, or where a place the cup is reached from lies)
      if (atCup[j] || (toCup && group[j] >= 0 && fine.get(group[j]))) holed = true;
    };
    for (const k of starts) visit(k, launch, -1);
    while ((f0 < flat.length || size) && !(toCup && holed)) {
      // (the most energetic first: the heap's above a launch, then the flat's, then the heap's)
      const k = f0 < flat.length && !(size && best[heap[0]] > launch) ? flat[f0++] : pop(), e = best[k], why = cause[k];
      if (e <= done[k]) continue; // (met already with as much)
      done[k] = e;
      around(k, nx, n, (j) => {
        // up or down one-way ground, in one plane (its height exact), less what rolling there costs; onto it, off it
        // or from one plane to another, what a downhill gave above a stroke's launch is let go (as if the ball stopped
        // there and was struck again). Without the rolling's cost, pieces pushing different ways side by side would
        // let a round trip gain, round and round. (A step's rolling at 1/√2 of its length: a climb along a diagonal
        // fall goes in steps √2 as long as the straight way; along a grid line, generous)
        const same = plane(j) === plane(k), f = same && ground[j] >= 0 ? falls[ground[j]]! : null;
        // (free: every slope two-way, as E4's way has it: what keeps the cup out, if it is not one)
        const next = free ? e : (f ? Math.min(TOP, e + f.grade * ((xs[j] - xs[k]) * f.u[0] + (ys[j] - ys[k]) * f.u[1])) : same ? e : Math.min(e, launch)) - (ground[j] >= 0 ? resist[j] * CELL * Math.SQRT1_2 : 0);
        if (next >= 0) visit(j, next, ground[j] >= 0 && plane(k) !== plane(j) ? ground[j] * 3 + 1 : why);
      });
      if (timed[k] >= 0) visit(exitOf(timed[k]), e, timed[k] * 3);
      if (hopAt[k] >= 0) for (const j of hopTo[hopAt[k]]) visit(j, e, hopZone[hopAt[k]] * 3 + 2);
    }
    return { seen, holed };
  };
  const clear = (seen: number[]) => { for (const k of seen) (best[k] = -1), (done[k] = -1), (cause[k] = -1); };
  // from the tee: the groups it reaches; each one that never reaches the cup is a trap, named by what led into it
  const tee = g.cell(h.tee);
  if (tee < 0) return [];
  // (quick: the tee on the flat, the cup's disc on that same flat, no tunnel, no place of rest on one-way ground, and no
  // other flat a slope or a hop could send a ball to: nothing to trap a ball, nothing to climb to the cup)
  const alone = (() => {
    const tg = group[tee];
    if (tg < 0 || rests[tee] !== 1 || tunnels || !groups[tg].some((k) => atCup[k])) return false;
    for (let k = 0; k < n; k++) {
      if (rests[k] === 2) return false;
      let other = false;
      if (ground[k] >= 0) around(k, nx, n, (j) => void (other ||= group[j] >= 0 && group[j] !== tg));
      if (other) return false;
      if (hopAt[k] >= 0 && hopTo[hopAt[k]].some((j) => group[j] >= 0 && group[j] !== tg)) return false;
    }
    return true;
  })();
  if (alone) return [];
  const from = flood(group[tee] >= 0 ? groups[group[tee]] : [tee], false);
  if (!from.holed) {
    clear(from.seen);
    // the cup out of reach for good (E4's two-way way finds one): up a slope too long to climb, if every slope taken
    // as two-way lets a ball reach it (else something else keeps it out, not a slope's to blame), the steep one it
    // goes over nearest the cup
    const two = flood(group[tee] >= 0 ? groups[group[tee]] : [tee], false, true), over = new Set(two.seen.map((k) => ground[k]));
    clear(two.seen);
    if (!two.holed) return [{ kind: "cut", zone: -1, at: h.pin }];
    const up = falls.map((f, i) => ({ f, i, d: Math.hypot(h.pin[0] - (zs[i].min[0] + zs[i].max[0]) / 2, h.pin[1] - (zs[i].min[1] + zs[i].max[1]) / 2) })).filter(({ f, i }) => isSteep(f) && over.has(i));
    up.sort((a, b) => a.d - b.d);
    return up.length ? [{ kind: "climb", zone: up[0].i, at: h.pin }] : [];
  }
  // what the tee's flood reached: each group, the first cell of it met, what led there
  const reached = new Map<number, number>();
  for (const k of from.seen) if (group[k] >= 0 && !reached.has(group[k])) reached.set(group[k], cause[k]);
  clear(from.seen);
  if (group[tee] >= 0) fine.set(group[tee], true);
  const out: Trap[] = [], said = new Set<number>();
  // whether tunnel i's mouth lies by a place of rest the cup is reached from (each group's flood once, as asked)
  const fineOf = (id: number) => {
    if (!fine.has(id)) {
      const f = flood(groups[id], true);
      clear(f.seen);
      fine.set(id, f.holed);
    }
    return fine.get(id)!;
  };
  // (a mouth on one-way ground, by no place of rest at all: named, the way the full flood found it)
  const intoTrap = (i: number) => {
    let by = false;
    for (let k = 0; k < n; k++) {
      if (mouth[k] !== i && timed[k] !== i) continue;
      const by4: number[] = timed[k] === i ? [k] : [];
      around(k, nx, n, (j) => by4.push(j));
      for (const j of by4) {
        if (group[j] < 0 || !reached.has(group[j])) continue;
        by = true;
        if (fineOf(group[j])) return true;
      }
    }
    return !by;
  };
  for (const [id, why] of reached) {
    if (fineOf(id) || why < 0 || said.has(why)) continue;
    said.add(why);
    const i = Math.floor(why / 3), z = zs[i], kind = (["tunnel", "slope", "hop"] as const)[why % 3];
    // (a tunnel named only where it leads from a place the cup is reached from, the step into the dead end: not one of
    // a chain inside it, as the quick way names them)
    if (kind === "tunnel" && !intoTrap(i)) continue;
    out.push({ kind, zone: i, at: kind === "tunnel" ? (z.vec ?? z.min) : g.centre(groups[id][0]) }); // (its first cell: the same whatever the flood's order)
  }
  return out;
}

/**
 * traps' quick way, when no slope is one-way (every one a stroke climbs): the
 * open cells (neither a wall's, a fixed hazard's nor a fixed mouth's) joined 4
 * ways into parts, a tunnel (from a part beside its mouth, or one a timed
 * mouth is in, to its way out's) and a hop (from its crest's part to its
 * landings') one-way steps between them; a trap, a part the tee's reaches
 * that never reaches one with a cell of the cup's disc, named by the step
 * into it.
 */
function parts(g: Grid, c: { solid: Uint8Array; wet: Uint8Array; mouth: Int16Array; timed: Int16Array; hopAt: Int32Array; hopTo: number[][]; hopZone: number[]; atCup: Uint8Array; exitOf: (i: number) => number; zs: readonly ZoneIn[]; tee: number }): Trap[] {
  const { solid, wet, mouth, timed, hopAt, hopTo, hopZone, atCup, exitOf, zs, tee } = c, n = solid.length, nx = g.nx;
  const open = (k: number) => k >= 0 && !solid[k] && !wet[k] && mouth[k] < 0;
  const part = new Int32Array(n).fill(-1);
  let parts = 0;
  for (let k = 0; k < n; k++) {
    if (!open(k) || part[k] >= 0) continue;
    const cells = [k];
    part[k] = parts;
    for (let q = 0; q < cells.length; q++) around(cells[q], nx, n, (j) => void (part[j] < 0 && open(j) && ((part[j] = parts), cells.push(j))));
    parts++;
  }
  // where a jump lands (a way out in a mouth: on, a few times at most)
  const land = (j: number, jumps = 0): number => (j >= 0 && mouth[j] >= 0 && jumps < 4 ? land(exitOf(mouth[j]), jumps + 1) : open(j) ? j : -1);
  const out = Array.from({ length: parts }, () => new Map<number, number>()), back = Array.from({ length: parts }, () => [] as number[]);
  const step = (from: number, to: number, why: number) => {
    const a = part[from], b = to >= 0 ? part[to] : -1;
    if (a < 0 || b < 0 || a === b || out[a].has(b)) return;
    out[a].set(b, why), back[b].push(a);
  };
  for (let k = 0; k < n; k++) {
    if (mouth[k] >= 0) {
      const to = land(exitOf(mouth[k]));
      around(k, nx, n, (j) => step(j, to, mouth[k] * 3));
    }
    if (timed[k] >= 0 && part[k] >= 0) step(k, land(exitOf(timed[k])), timed[k] * 3);
    if (hopAt[k] >= 0 && part[k] >= 0) for (const j of hopTo[hopAt[k]]) step(k, land(j), hopZone[hopAt[k]] * 3 + 2);
  }
  const start = tee >= 0 ? part[tee] : -1;
  if (start < 0) return [];
  // the parts that reach the cup (back from those with a cell of its disc), and those the tee's reaches
  const fine = new Uint8Array(parts), stack: number[] = [];
  for (let k = 0; k < n; k++) if (atCup[k] && part[k] >= 0 && !fine[part[k]]) (fine[part[k]] = 1), stack.push(part[k]);
  while (stack.length) for (const a of back[stack.pop()!]) if (!fine[a]) (fine[a] = 1), stack.push(a);
  if (!fine[start]) return [];
  const seen = new Uint8Array(parts), result: Trap[] = [], said = new Set<number>();
  seen[start] = 1;
  for (const queue = [start]; queue.length; ) {
    const a = queue.shift()!;
    for (const [b, why] of out[a]) {
      if (!fine[b] && fine[a] && !said.has(why)) {
        said.add(why);
        const i = Math.floor(why / 3), z = zs[i], kind = why % 3 ? "hop" : "tunnel";
        let at: V = z.vec ?? z.min;
        if (kind === "hop") for (let k = 0; k < n; k++) if (part[k] === b) { at = g.centre(k); break; }
        result.push({ kind, zone: i, at });
      }
      if (!seen[b]) (seen[b] = 1), queue.push(b);
    }
  }
  return result;
}
