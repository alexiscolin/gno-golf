// Where a ball can be on a hole, on a quarter-unit grid: the floods the
// builder's checks read (checks.ts). A cell is shut where a ball's centre
// there would be within clearance of a fixed wall or post (a timed piece, or
// a pulse's, is not always there: left out, the most open the hole ever is).
// The lane is what a ball cannot leave; the way is what a ball from the tee
// reaches, a tunnel a jump to its way out, a hazard a stop.
import { inZone, segDist } from "../terrain";
import { MIN_RAMP } from "./rules";
import type { HoleIn, V, ZoneIn } from "./types";

/** The grid's cell: the builder's snap. */
export const CELL = 0.25;

const shapeOf = (z: ZoneIn) => ({ min: z.min, max: z.max, round: !!z.round, poly: z.poly, outside: z.outside });
/** A zone a ball cannot rest in: a hazard sends it back, a tunnel or a loop moves it on. */
export const moves = (z: ZoneIn) => z.kind === "hazard" || z.kind === "tunnel" || z.kind === "loop";

/** A grid over a hole's fixed walls, posts and zones, its cells shut at a clearance. */
export interface Grid {
  nx: number;
  ny: number;
  /** a point's cell index, -1 off the grid */
  cell(p: V): number;
  /** a cell's centre */
  centre(k: number): V;
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
  const span = (lo: number, hi: number, o: number, n: number) => [Math.max(0, Math.floor((lo - o) / CELL)), Math.min(n - 1, Math.ceil((hi - o) / CELL))];
  for (const w of walls) {
    const [i0, i1] = span(Math.min(w.a[0], w.b[0]) - clearance, Math.max(w.a[0], w.b[0]) + clearance, x0, nx);
    const [j0, j1] = span(Math.min(w.a[1], w.b[1]) - clearance, Math.max(w.a[1], w.b[1]) + clearance, y0, ny);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(cx(i), cy(j), w.a, w.b) < clearance) shut[j * nx + i] = 1;
  }
  for (const p of posts) {
    const r = p.r + clearance, [i0, i1] = span(p.c[0] - r, p.c[0] + r, x0, nx), [j0, j1] = span(p.c[1] - r, p.c[1] + r, y0, ny);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (Math.hypot(cx(i) - p.c[0], cy(j) - p.c[1]) < r) shut[j * nx + i] = 1;
  }
  if (hazards) {
    const fixed = h.zones.filter((z) => z.kind === "hazard" && !z.every);
    for (let k = 0; k < shut.length; k++) {
      if (!shut[k] && fixed.some((z) => inZone(shapeOf(z), cx(k % nx), cy(Math.floor(k / nx))))) shut[k] = 1;
    }
  }
  return {
    nx, ny, shut,
    cell: (p) => {
      const i = Math.floor((p[0] - x0) / CELL), j = Math.floor((p[1] - y0) / CELL);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    },
    centre: (k) => [cx(k % nx), cy(Math.floor(k / nx))],
  };
}

/** The cells reached from some start cells through open neighbours (4 ways), with each one's parent; reach() may add jumps. */
function flood(g: Grid, starts: number[], step: (k: number) => number[] = () => []) {
  const parent = new Int32Array(g.nx * g.ny).fill(-2), queue: number[] = [];
  const visit = (k: number, from: number) => {
    if (k >= 0 && !g.shut[k] && parent[k] === -2) (parent[k] = from), queue.push(k);
  };
  for (const s of starts) visit(s, -1);
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q], i = k % g.nx;
    if (i > 0) visit(k - 1, k);
    if (i < g.nx - 1) visit(k + 1, k);
    if (k >= g.nx) visit(k - g.nx, k);
    if (k < g.nx * (g.ny - 1)) visit(k + g.nx, k);
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
 * the cells passed on the way to it (the path, cup first). Fixed hazards stop
 * it (a timed one is sometimes gone); a tunnel of any clock moves it on to
 * its way out, ahead of a hazard it sits in (a geyser in a hot spring); a
 * hill steep enough to launch (MIN_RAMP) hops it off its crest, up to FLIGHT
 * along its climb, over whatever lies there. A necessary condition, not a
 * proof: L3 is the proof.
 */
export function reach(h: HoleIn, clearance = h.ballR): { reached: boolean; path: V[]; grid: Grid; reaches: (p: V, rad?: number) => boolean } {
  const g = gridOf(h, clearance);
  const zones = h.zones.filter((z) => (z.kind === "hazard" && !z.every) || z.kind === "tunnel" || z.kind === "loop");
  const hills = h.zones.filter((z) => z.kind === "slope" && !z.air && z.vec && Math.hypot(z.vec[0], z.vec[1]) >= MIN_RAMP);
  const jumps = new Map<number, number[]>(), add = (k: number, j: number) => j >= 0 && jumps.set(k, [...(jumps.get(k) ?? []), j]);
  for (let k = 0; k < g.shut.length; k++) {
    if (g.shut[k]) continue;
    const [x, y] = g.centre(k);
    const at = zones.filter((z) => inZone(shapeOf(z), x, y));
    const way = at.find((z) => z.kind !== "hazard");
    // a tunnel moves the ball on; a hazard alone sends it back: no way on through it
    if (way) add(k, g.cell(way.vec ?? way.min));
    else if (at.length) g.shut[k] = 1;
    for (const z of hills) {
      if (!inZone(shapeOf(z), x, y)) continue;
      const l = Math.hypot(z.vec![0], z.vec![1]), u: V = [-z.vec![0] / l, -z.vec![1] / l];
      if (inZone(shapeOf(z), x + u[0] * CELL, y + u[1] * CELL)) continue; // not its crest
      for (let d = CELL; d <= FLIGHT; d += CELL) add(k, g.cell([x + u[0] * d, y + u[1] * d]));
    }
  }
  const tee = g.cell(h.tee);
  const parent = flood(g, tee >= 0 ? [tee] : [], (k) => jumps.get(k) ?? []);
  const cup = h.cupR, ends: number[] = [];
  for (let k = 0; k < parent.length; k++) {
    if (parent[k] === -2) continue;
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
  if (!ends.length) return { reached: false, path: [], grid: g, reaches };
  const path: V[] = [];
  for (let k = ends[0]; k >= 0; k = parent[k]) path.push(g.centre(k));
  return { reached: true, path, grid: g, reaches };
}
