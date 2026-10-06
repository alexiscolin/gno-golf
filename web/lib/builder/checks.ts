// The builder's own checks of a hole: what the chain does not check and a
// player would meet (the design's L1, "The validation pipeline"). The chain
// takes a cup inside a wall; these do not. Each issue names its rule (E2…),
// its piece and the place, and is an error (no test mode, no publish) or a
// warning. Pure, on the hole's GG1 pieces: Fit only moves a hole, so the
// draft's own coordinates do (a rectangle Fit cuts at the board's edge only
// loses what lies off the board, where neither tee nor cup is).
import { inZone, segDist } from "../terrain";
import type { Vec2 } from "../types";
import { LIMITS, type GHole, type GPost, type GWall, type GZone } from "./gg1";
import type { Cost } from "./wasm";

/** Where a piece is in the hole: its list, its place in it, and its pulse (-1: none). */
export interface PieceRef {
  list: "walls" | "posts" | "zones";
  index: number;
  pulse: number;
}
export interface Issue {
  rule: "E2" | "E3" | "E7" | "E8" | "E11";
  severity: "error" | "warning";
  text: string;
  piece?: PieceRef;
  at?: Vec2;
}

/** How close a ball may rest to a wall at the tee: its radius and this (the design's E2). */
export const TEE_GAP = 0.05;
/** A pulse's cycle, in strokes: a round has at most 60 (the design's E7). */
export const PULSE_EVERY = { min: 2, max: 60 };
/** The share of a work limit past which the gauge warns (E11). */
export const WORK_WARN = 0.9;

type Each<T> = { item: T; ref: PieceRef };
function all<T>(h: GHole, list: PieceRef["list"]): Each<T>[] {
  const out: Each<T>[] = (h[list] as readonly T[]).map((item, index) => ({ item, ref: { list, index, pulse: -1 } }));
  h.pulses.forEach((p, k) => (p[list] as readonly T[]).forEach((item, index) => out.push({ item, ref: { list, index, pulse: k } })));
  return out;
}
const shape = (z: GZone) => ({ min: z.min, max: z.max, round: !!z.round, poly: z.poly, outside: z.outside });
/** A zone a ball cannot rest in: it moves it on (a tunnel, a loop) or sends it back (a hazard). */
const notGround = (z: GZone) => z.kind === "hazard" || z.kind === "tunnel" || z.kind === "loop";
const named = (r: PieceRef, skin = "") => `the ${skin || "plain"} ${r.list === "walls" ? "wall" : r.list === "posts" ? "post" : "zone"}${r.pulse >= 0 ? ` (pulse ${r.pulse + 1})` : ""}`;
const pt = (p: Vec2) => `(${+p[0].toFixed(2)}, ${+p[1].toFixed(2)})`;

/** The lane's grid: a ball's centre tested every quarter unit, the builder's snap. */
export const LANE_CELL = 0.25;

/**
 * The lane: where a ball cannot leave the board, closed in by the untimed
 * walls (a timed one, or a pulse's, is not always there). A cell is shut
 * when a ball's centre there would be within its radius of a wall, so a gap
 * narrower than the ball closes the lane and a rail inside it does not cut
 * it (an even-odd count of the walls across a ray, course's dryLand, would);
 * everything reached from the grid's edge round the walls is outside. It
 * answers for a point: in the lane, or on a wall (the walls' own checks name
 * it there).
 */
export function inLane(h: GHole): (p: Vec2) => boolean {
  const walls = h.walls.filter((w) => !w.every), r = h.ballR, pad = r + 2 * LANE_CELL;
  if (!walls.length) return () => false;
  const xs = walls.flatMap((w) => [w.a[0], w.b[0]]), ys = walls.flatMap((w) => [w.a[1], w.b[1]]);
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const nx = Math.ceil((Math.max(...xs) + pad - x0) / LANE_CELL), ny = Math.ceil((Math.max(...ys) + pad - y0) / LANE_CELL);
  const shut = new Uint8Array(nx * ny), out = new Uint8Array(nx * ny);
  const cx = (i: number) => x0 + (i + 0.5) * LANE_CELL, cy = (j: number) => y0 + (j + 0.5) * LANE_CELL;
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor((Math.min(w.a[0], w.b[0]) - r - x0) / LANE_CELL)), i1 = Math.min(nx - 1, Math.ceil((Math.max(w.a[0], w.b[0]) + r - x0) / LANE_CELL));
    const j0 = Math.max(0, Math.floor((Math.min(w.a[1], w.b[1]) - r - y0) / LANE_CELL)), j1 = Math.min(ny - 1, Math.ceil((Math.max(w.a[1], w.b[1]) + r - y0) / LANE_CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(cx(i), cy(j), w.a, w.b) < r) shut[j * nx + i] = 1;
  }
  // the outside: every open cell reached from the grid's edge
  const queue: number[] = [];
  const reach = (i: number, j: number) => {
    const k = j * nx + i;
    if (i >= 0 && j >= 0 && i < nx && j < ny && !shut[k] && !out[k]) (out[k] = 1), queue.push(k);
  };
  for (let i = 0; i < nx; i++) reach(i, 0), reach(i, ny - 1);
  for (let j = 0; j < ny; j++) reach(0, j), reach(nx - 1, j);
  while (queue.length) {
    const k = queue.pop()!, i = k % nx, j = (k - i) / nx;
    reach(i + 1, j), reach(i - 1, j), reach(i, j + 1), reach(i, j - 1);
  }
  return (p) => {
    const i = Math.floor((p[0] - x0) / LANE_CELL), j = Math.floor((p[1] - y0) / LANE_CELL);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    return shut[j * nx + i] === 1 || !out[j * nx + i];
  };
}

/** What blocks a disc of radius rad at p, any clock: a wall within rad, a post over it, a zone it must stay out of. */
function blocked(h: GHole, p: Vec2, rad: number, zoneHit: (z: GZone) => boolean): PieceRef[] {
  const out: PieceRef[] = [];
  for (const { item, ref } of all<GWall>(h, "walls")) if (segDist(p[0], p[1], item.a, item.b) < rad) out.push(ref);
  for (const { item, ref } of all<GPost>(h, "posts")) if (Math.hypot(p[0] - item.c[0], p[1] - item.c[1]) < item.r + rad) out.push(ref);
  for (const { item, ref } of all<GZone>(h, "zones")) if (notGround(item) && zoneHit(item)) out.push(ref);
  return out;
}
const skinOf = (h: GHole, r: PieceRef) => ((r.pulse < 0 ? h : h.pulses[r.pulse])[r.list][r.index] as { skin?: string }).skin;

/** E2: the tee in the lane, the ball's radius and TEE_GAP from every wall, off every post and every zone that moves or sends a ball back. */
function tee(h: GHole, lane: (p: Vec2) => boolean): Issue[] {
  const out: Issue[] = [];
  if (!lane(h.tee)) out.push({ rule: "E2", severity: "error", text: `The tee at ${pt(h.tee)} is outside the lane`, at: h.tee });
  for (const ref of blocked(h, h.tee, h.ballR + TEE_GAP, (z) => inZone(shape(z), h.tee[0], h.tee[1]))) {
    out.push({ rule: "E2", severity: "error", text: `The tee touches ${named(ref, skinOf(h, ref))} at ${pt(h.tee)}`, piece: ref, at: h.tee });
  }
  return out;
}

/** E3: the cup's disc (the cup and a ball's radius) in the lane, touching no wall, post or zone of any clock. */
function cup(h: GHole, lane: (p: Vec2) => boolean): Issue[] {
  const out: Issue[] = [], rad = h.cupR + h.ballR, [x, y] = h.pin;
  // the disc's rim, every 15°, and its centre: in the lane, and in no zone
  const rim: Vec2[] = [h.pin, ...Array.from({ length: 24 }, (_, k): Vec2 => [x + rad * Math.cos((k * Math.PI) / 12), y + rad * Math.sin((k * Math.PI) / 12)])];
  if (!rim.every(lane)) out.push({ rule: "E3", severity: "error", text: `The cup at ${pt(h.pin)} is not wholly in the lane`, at: h.pin });
  for (const ref of blocked(h, h.pin, rad, (z) => rim.some((p) => inZone(shape(z), p[0], p[1])))) {
    out.push({ rule: "E3", severity: "error", text: `The cup touches ${named(ref, skinOf(h, ref))} at ${pt(h.pin)}`, piece: ref, at: h.pin });
  }
  return out;
}

/** E7: a timed piece is on for part of its cycle, never all or none of it; a pulse's cycle fits a round. */
function clocks(h: GHole): Issue[] {
  const out: Issue[] = [];
  const timed = (list: "walls" | "zones") => {
    for (const { item, ref } of all<GWall | GZone>(h, list)) {
      if (item.every && !(item.on! >= 1 && item.on! <= item.every - 1)) {
        out.push({ rule: "E7", severity: "error", text: `${named(ref, item.skin)} is on for ${item.on ?? 0} of ${item.every} substeps: 1 to ${item.every - 1}`, piece: ref });
      }
    }
  };
  timed("walls"), timed("zones");
  h.pulses.forEach((p, k) => {
    if (p.every < PULSE_EVERY.min || p.every > PULSE_EVERY.max || p.on < 1 || p.on > p.every - 1) {
      out.push({ rule: "E7", severity: "error", text: `Pulse ${k + 1} is on for ${p.on} of every ${p.every} strokes: every ${PULSE_EVERY.min} to ${PULSE_EVERY.max}, on for 1 to every−1` });
    }
  });
  return out;
}

/** What the hole counts against GG1's limits (pulses included), each with its limit. */
export function counts(h: GHole) {
  const zs = all<GZone>(h, "zones").map((z) => z.item), skins = new Set<string>();
  for (const l of ["walls", "posts", "zones"] as const) for (const { item } of all<{ skin?: string }>(h, l)) skins.add(item.skin ?? "");
  return {
    walls: [all(h, "walls").length, LIMITS.walls],
    posts: [all(h, "posts").length, LIMITS.posts],
    zones: [zs.length, LIMITS.zones],
    points: [zs.reduce((n, z) => n + (z.poly?.length ?? 0), 0), LIMITS.polyTotal],
    pulses: [h.pulses.length, LIMITS.pulses],
    skins: [skins.size, LIMITS.skins],
  } satisfies Record<string, [number, number]>;
}

/** E8: the counts within GG1's limits, and each polygon within its own. */
function limits(h: GHole): Issue[] {
  const out: Issue[] = [];
  for (const [what, [n, max]] of Object.entries(counts(h))) {
    if (n > max) out.push({ rule: "E8", severity: "error", text: `Too many ${what}: ${n} of ${max}` });
  }
  for (const { item, ref } of all<GZone>(h, "zones")) {
    if (item.poly && item.poly.length > LIMITS.poly) out.push({ rule: "E8", severity: "error", text: `${named(ref, item.skin)} has ${item.poly.length} points: at most ${LIMITS.poly}`, piece: ref });
  }
  return out;
}

/** The editor's checks of a hole (E2, E3, E7, E8), errors first. */
export function checkHole(h: GHole): Issue[] {
  const lane = inLane(h);
  const out = [...tee(h, lane), ...cup(h, lane), ...clocks(h), ...limits(h)];
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

/** A work gauge: what the hole uses of one of the realm's limits (0 to 1, past 1 refused). */
export interface Gauge {
  used: number;
  of: number;
  share: number;
}
/**
 * The hole's work against the realm's limits, from builder.wasm's check: its
 * heaviest shot (refused past maxShot), a commit's first shot in its
 * dearest weather (refused past budget), and E11, a warning as either nears
 * its limit (each fixed wall costs every storm's puddle tries).
 */
export function work(c: Cost): { shot: Gauge; storm: Gauge; issues: Issue[] } {
  const g = (used: number, of: number): Gauge => ({ used, of, share: used / of });
  const shot = g(c.bound, c.maxShot), storm = g(c.worst, c.budget), issues: Issue[] = [];
  if (shot.share > WORK_WARN) issues.push({ rule: "E11", severity: "warning", text: `Its heaviest shot is ${Math.round(shot.share * 100)}% of what a transaction can replay` });
  if (storm.share > WORK_WARN) issues.push({ rule: "E11", severity: "warning", text: `In its dearest weather, a first shot has ${c.room.toLocaleString("en")} units of room, at least ${c.minShot.toLocaleString("en")}` });
  return { shot, storm, issues };
}
