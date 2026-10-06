// The builder's own checks of a hole: what the chain does not check and a
// player would meet (the design's L1). The chain takes a cup inside a wall;
// these do not. Each issue names its rule (E2…), its piece and the place,
// and is an error (no test mode, no publish) or a warning (a gauge nearing
// its limit). checkHole reads a hole as fit gives it (decode's pieces, in
// GG1's order); the draft's checks (draft-checks.ts) add what only the draft
// knows. Rules and thresholds: docs/superpowers/specs/2026-10-06-hole-builder-design.md.
import { inZone, segDist } from "../terrain";
import type { PieceRef } from "../scene/census";
import { RULES } from "../chain";
import { LIMITS } from "./gg1";
import { MIN_SHOT_WORK } from "./rules";
import { CELL, laneOf, moves, reach } from "./lane";
import type { HoleIn, PostIn, V, WallIn, ZoneIn } from "./types";
import type { Cost } from "./wasm";

export type Rule = "L0" | "E1" | "E1b" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9" | "E10" | "E11" | "E12" | "E13" | "E14" | "E15" | "L2";
export interface Issue {
  rule: Rule;
  severity: "error" | "warning";
  text: string;
  /** the hole's piece it is about (census.ts PieceRef); the draft's checks add its piece's id */
  ref?: PieceRef;
  piece?: string;
  at?: V;
  /** the pieces it is about, beyond ref (E13's other, E14's walls) */
  also?: PieceRef[];
}

/** How close a ball may rest to a wall at the tee: its radius and this (E2). */
export const TEE_GAP = 0.05;
/** A round's strokes at most: a pulse must come and go within them (E7). */
export const ROUND_STROKES = 60;
/** The share of a work limit past which the gauge warns (E11). */
export const WORK_WARN = 0.8;
/** A mouth a ball must not step over: a hazard or a tunnel at least this across (E5). */
export const MOUTH = 1.5;
/** A passage the ball must use: its width, beyond the ball's diameter (E14). */
export const PASSAGE = 0.25;
/** How far a piece keeps from a rail: nearer, the kerb swallows it (E15). */
export const KERB_GAP = 0.5;

/** A hole's piece, its place and pulse. */
type Each<T> = { item: T; ref: PieceRef };
function each<T>(h: HoleIn, set: PieceRef["set"]): Each<T>[] {
  const key = set === "wall" ? "walls" : set === "post" ? "posts" : "zones";
  const out: Each<T>[] = (h[key] as readonly T[]).map((item, i) => ({ item, ref: { set, i } }));
  h.pulses.forEach((p, k) => (p[key] as readonly T[]).forEach((item, i) => out.push({ item, ref: { set, i, pulse: k } })));
  return out;
}
const pieceOf = (h: HoleIn, r: PieceRef) => {
  const list = r.pulse === undefined ? h : h.pulses[r.pulse];
  return (r.set === "wall" ? list.walls : r.set === "post" ? list.posts : list.zones)[r.i];
};
const shapeOf = (z: ZoneIn) => ({ min: z.min, max: z.max, round: !!z.round, poly: z.poly, outside: z.outside });
const pt = (p: V) => `(${+p[0].toFixed(2)}, ${+p[1].toFixed(2)})`;
const centreOf = (z: ZoneIn): V => [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2];

/** A piece's name in a sentence: "the hedge wall", "the plain post", "the water hazard". */
export type Namer = (r: PieceRef) => string;
export const nameIn = (h: HoleIn): Namer => (r) => {
  const p = pieceOf(h, r), kind = r.set === "zone" ? (p as ZoneIn).kind : r.set;
  return `the ${p.skin || "plain"} ${kind}${r.pulse !== undefined ? ` (pulse ${r.pulse + 1})` : ""}`;
};

const err = (rule: Rule, text: string, ref?: PieceRef, at?: V, also?: PieceRef[]): Issue => ({ rule, severity: "error", text, ...(ref && { ref }), ...(at && { at }), ...(also && { also }) });

/** What blocks a disc of radius rad at p, any clock: a wall within rad, a post over it, a zone it must stay out of. */
function blocked(h: HoleIn, p: V, rad: number, zoneHit: (z: ZoneIn) => boolean, judged: Judged = () => true): PieceRef[] {
  const out: PieceRef[] = [];
  for (const { item, ref } of each<WallIn>(h, "wall")) if (segDist(p[0], p[1], item.a, item.b) < rad) out.push(ref);
  for (const { item, ref } of each<PostIn>(h, "post")) if (Math.hypot(p[0] - item.c[0], p[1] - item.c[1]) < item.r + rad) out.push(ref);
  for (const { item, ref } of each<ZoneIn>(h, "zone")) if (moves(item) && zoneHit(item)) out.push(ref);
  return out.filter(judged);
}

/** E1: a zone Fit cut to nothing at the board's edge (it lay off the board). */
function board(h: HoleIn, name: Namer): Issue[] {
  return each<ZoneIn>(h, "zone").filter(({ item }) => !(item.max[0] > item.min[0] && item.max[1] > item.min[1])).map(({ ref }) => err("E1", `${cap(name(ref))} lies off the board once the hole is fitted`, ref));
}

/** E2: the tee in the lane, the ball's radius and TEE_GAP from every wall, off every post and every zone that moves or sends a ball back. */
function tee(h: HoleIn, lane: (p: V) => boolean, name: Namer, judged: Judged): Issue[] {
  const out: Issue[] = [];
  if (!lane(h.tee)) out.push(err("E2", `The tee at ${pt(h.tee)} is outside the lane`, undefined, h.tee));
  for (const ref of blocked(h, h.tee, h.ballR + TEE_GAP, (z) => inZone(shapeOf(z), h.tee[0], h.tee[1]), judged)) out.push(err("E2", `The tee touches ${name(ref)} at ${pt(h.tee)}`, ref, h.tee));
  return out;
}

/** E3: the cup's disc (where a ball is holed: the cup's radius round the pin) in the lane, touching no wall, post or zone of any clock. */
function cup(h: HoleIn, lane: (p: V) => boolean, name: Namer, judged: Judged): Issue[] {
  const out: Issue[] = [], rad = h.cupR, [x, y] = h.pin;
  const rim: V[] = [h.pin, ...Array.from({ length: 24 }, (_, k): V => [x + rad * Math.cos((k * Math.PI) / 12), y + rad * Math.sin((k * Math.PI) / 12)])];
  if (!rim.every(lane)) out.push(err("E3", `The cup at ${pt(h.pin)} is not wholly in the lane`, undefined, h.pin));
  for (const ref of blocked(h, h.pin, rad, (z) => rim.some((p) => inZone(shapeOf(z), p[0], p[1])), judged)) out.push(err("E3", `The cup touches ${name(ref)} at ${pt(h.pin)}`, ref, h.pin));
  return out;
}

/**
 * E4: the cup reached from the tee at the ball's clearance (the most open the
 * hole ever is: its timed and pulsed pieces left out; tunnels jump, hazards
 * stop). E14: and at the ball's diameter and PASSAGE, so no way to the cup is
 * one a ball only just threads; the pieces at the narrowest place named.
 */
function way(h: HoleIn, name: Namer): Issue[] {
  // the grid's flood is generous (a cell shut only if no ball could be anywhere in it): it must never
  // refuse a hole a ball can play; the gaps are then measured exactly
  const loose = h.ballR - CELL * Math.SQRT1_2;
  if (!reach(h, loose).reached) return [err("E4", "The cup cannot be reached from the tee", undefined, h.pin)];
  // the gaps between two fixed solids (walls, posts: a pulse's and a timed one are not always there)
  const of: Solid[] = [], refs: PieceRef[] = [];
  for (const { item, ref } of each<WallIn>(h, "wall")) if (!item.every && ref.pulse === undefined) of.push({ kind: "wall", a: item.a, b: item.b }), refs.push(ref);
  for (const { item, ref } of each<PostIn>(h, "post")) if (ref.pulse === undefined) of.push({ kind: "post", c: item.c, r: item.r }), refs.push(ref);
  const ball = 2 * h.ballR, wide = ball + PASSAGE, out: Issue[] = [];
  for (let i = 0; i < of.length; i++) {
    for (let j = i + 1; j < of.length; j++) {
      const [gap, mid] = gapOf(of[i], of[j]);
      if (!(gap > 1e-9 && gap < wide)) continue;
      // one the way needs: closed there, the cup is lost
      if (reach({ ...h, posts: [...h.posts, { c: mid, r: Math.max(gap / 2, CELL) }] }, loose).reached) continue;
      const between = `the gap at ${pt(mid)} between ${name(refs[i])} and ${name(refs[j])} is ${+gap.toFixed(2)} wide`;
      out.push(gap < ball
        ? err("E4", `The cup cannot be reached from the tee: ${between}, narrower than the ball (${ball})`, refs[i], mid, [refs[j]])
        : err("E14", `${cap(between)}, and the way to the cup goes through it: at least ${wide}, or a ball only just fits`, refs[i], mid, [refs[j]]));
    }
  }
  return out;
}

/** The gap between two solids (a wall a segment, a post a circle) and the middle of its narrowest place. */
type Solid = { kind: "wall"; a: V; b: V } | { kind: "post"; c: V; r: number };
function gapOf(a: Solid, b: Solid): [number, V] {
  const seg = (p: V, s: { a: V; b: V }): [number, V] => {
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / l2)) : 0;
    const q: V = [s.a[0] + u * dx, s.a[1] + u * dy];
    return [Math.hypot(p[0] - q[0], p[1] - q[1]), q];
  };
  const mid = (p: V, q: V): V => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  if (a.kind === "post" && b.kind === "post") {
    const d = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]), u: V = [(b.c[0] - a.c[0]) / d, (b.c[1] - a.c[1]) / d];
    return [d - a.r - b.r, mid([a.c[0] + u[0] * a.r, a.c[1] + u[1] * a.r], [b.c[0] - u[0] * b.r, b.c[1] - u[1] * b.r])];
  }
  if (a.kind === "post" || b.kind === "post") {
    const p = (a.kind === "post" ? a : b) as { c: V; r: number }, w = (a.kind === "wall" ? a : b) as { a: V; b: V };
    const [d, q] = seg(p.c, w), u: V = d ? [(q[0] - p.c[0]) / d, (q[1] - p.c[1]) / d] : [0, 0];
    return [d - p.r, mid([p.c[0] + u[0] * p.r, p.c[1] + u[1] * p.r], q)];
  }
  // two walls: the nearest of each one's ends to the other (walls that cross have no gap)
  if (crosses(a.a, a.b, b.a, b.b)) return [0, a.a];
  let best: [number, V] = [Infinity, a.a];
  for (const [p, s] of [[a.a, b], [a.b, b], [b.a, a], [b.b, a]] as const) {
    const [d, q] = seg(p, s);
    if (d < best[0]) best = [d, mid(p, q)];
  }
  return best;
}

/** The widest circle inside a polygon, by its diameter: a grid's points inside, each one's distance to the edges. */
function inscribed(poly: readonly V[]): number {
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]), step = 0.05;
  let best = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      if (!inZone({ min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs) + 1e-9, Math.max(...ys) + 1e-9], round: false, poly }, x, y)) continue;
      let d = Infinity;
      for (let k = 0; k < poly.length; k++) d = Math.min(d, segDist(x, y, poly[k], poly[(k + 1) % poly.length]));
      best = Math.max(best, d);
    }
  }
  return 2 * best;
}

/** E5: every hazard's and tunnel's mouth at least MOUTH across (a polygon by the widest circle in it); thinner, a fast ball steps over it. */
function mouths(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const { item: z, ref } of each<ZoneIn>(h, "zone")) {
    if (z.kind !== "hazard" && z.kind !== "tunnel") continue;
    if (z.outside) continue; // (all the box but a polygon: the sea round a lane, as wide as the board)
    const w = z.poly?.length ? inscribed(z.poly) : Math.min(z.max[0] - z.min[0], z.max[1] - z.min[1]);
    if (w < MOUTH - 1e-9) out.push(err("E5", `${cap(name(ref))} is ${+w.toFixed(2)} across: at least ${MOUTH}, or a fast ball steps over it`, ref, z.min));
  }
  return out;
}

/** E6: a tunnel's way out in the lane, clear of walls and posts by the ball's radius, in no zone that moves the ball. */
function exits(h: HoleIn, lane: (p: V) => boolean, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const { item: z, ref } of each<ZoneIn>(h, "zone")) {
    if (z.kind !== "tunnel" || !z.vec) continue;
    const v = z.vec;
    const why = !lane(v) ? "outside the lane"
      : blocked(h, v, h.ballR, () => false).length ? "on a wall or a post"
      : h.zones.some((q) => moves(q) && inZone(shapeOf(q), v[0], v[1])) ? "in a zone that moves the ball on" : "";
    if (why) out.push(err("E6", `${cap(name(ref))} comes out at ${pt(v)}, ${why}`, ref, v));
  }
  return out;
}

/** E7: a timed piece is on for part of its cycle, never all or none of it; a pulse both comes and goes within a round's strokes. */
function clocks(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const set of ["wall", "zone"] as const) {
    for (const { item, ref } of each<WallIn | ZoneIn>(h, set)) {
      if (item.every && !((item.on ?? 0) >= 1 && (item.on ?? 0) <= item.every - 1)) {
        out.push(err("E7", `${cap(name(ref))} is on for ${item.on ?? 0} of ${item.every} substeps: 1 to ${item.every - 1}`, ref));
      }
    }
  }
  h.pulses.forEach((p, k) => {
    const on = Array.from({ length: ROUND_STROKES }, (_, s) => (((s + p.phase) % p.every) + p.every) % p.every < p.on);
    if (p.every < 2 || !on.includes(true) || !on.includes(false)) {
      out.push(err("E7", `Pulse ${k + 1} (on for ${p.on} of every ${p.every} strokes) never ${on.includes(true) ? "goes" : "comes"} in a round's ${ROUND_STROKES} strokes`));
    }
  });
  return out;
}

/** What the hole counts against GG1's limits (pulses included), each with its limit: the gauges. */
export function counts(h: HoleIn) {
  const zs = each<ZoneIn>(h, "zone").map((z) => z.item), skins = new Set<string>();
  for (const s of ["wall", "post", "zone"] as const) for (const { item } of each<{ skin?: string }>(h, s)) skins.add(item.skin ?? "");
  return {
    walls: [each(h, "wall").length, LIMITS.walls],
    posts: [each(h, "post").length, LIMITS.posts],
    zones: [zs.length, LIMITS.zones],
    points: [zs.reduce((n, z) => n + (z.poly?.length ?? 0), 0), LIMITS.polyTotal],
    pulses: [h.pulses.length, LIMITS.pulses],
    skins: [skins.size, LIMITS.skins],
  } satisfies Record<string, [number, number]>;
}

/** E8: the counts within GG1's limits, and each polygon within its own. */
function limits(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [];
  for (const [what, [n, max]] of Object.entries(counts(h))) if (n > max) out.push(err("E8", `Too many ${what}: ${n} of ${max}`));
  for (const { item, ref } of each<ZoneIn>(h, "zone")) {
    if (item.poly && item.poly.length > LIMITS.poly) out.push(err("E8", `${cap(name(ref))} has ${item.poly.length} points: at most ${LIMITS.poly}`, ref));
  }
  return out;
}

/** Whether a ball from the tee gets within rad of a point (lane.ts reach). */
export type Reaches = (p: V, rad?: number) => boolean;
/** E10: a post or a zone (the draft's checks add bars) no ball from the tee gets near: outside the lane. */
function inReach(h: HoleIn, reaches: Reaches, name: Namer): Issue[] {
  const out: Issue[] = [], near = h.ballR + CELL;
  for (const { item, ref } of each<PostIn>(h, "post")) if (!reaches(item.c, item.r + near)) out.push(err("E10", `${cap(name(ref))} at ${pt(item.c)} is outside the lane: no ball reaches it`, ref, item.c));
  for (const { item, ref } of each<ZoneIn>(h, "zone")) {
    if (item.outside) continue;
    const c = centreOf(item), half = Math.max(item.max[0] - item.min[0], item.max[1] - item.min[1]) / 2;
    if (!reaches(c, half + near)) out.push(err("E10", `${cap(name(ref))} at ${pt(c)} is outside the lane: no ball reaches it`, ref, c));
  }
  return out;
}

/** Whether segments a→b and c→d cross at a point inside both (meeting at an end is not crossing). */
function crosses(a: V, b: V, c: V, d: V) {
  const o = (p: V, q: V, r: V) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d), e = 1e-9;
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}
/** Whether two zones' boxes overlap with an area (touching edges do not). */
const overlap = (a: ZoneIn, b: ZoneIn) => Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]) > 1e-9 && Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]) > 1e-9;
/** A piece's palette entry as the checks read it (its overlaps), or none: a piece the builder did not place (an imported hole's composition) is not judged. */
export type EntryOf = (r: PieceRef) => { overlaps?: readonly string[] } | undefined;
type Judged = (r: PieceRef) => boolean;
/** A piece's kind as overlaps names it: "wall", "post", or a zone's kind. */
const kindOf = (h: HoleIn, r: PieceRef) => (r.set === "zone" ? (pieceOf(h, r) as ZoneIn).kind : r.set);

/**
 * E13: no two solid pieces in one another where the scene draws them badly:
 * posts overlapping, a post on a wall, two walls crossing, a post in a zone
 * that moves the ball, two zones of different kinds overlapping; unless the
 * palette lets that pair meet (allow).
 */
function overlaps(h: HoleIn, name: Namer, entryOf: EntryOf): Issue[] {
  const out: Issue[] = [], posts = each<PostIn>(h, "post"), walls = each<WallIn>(h, "wall"), zones = each<ZoneIn>(h, "zone");
  const may = (a: PieceRef, b: PieceRef) => !!entryOf(a)?.overlaps?.includes(kindOf(h, b));
  const say = (a: PieceRef, b: PieceRef, what: string, at: V) => {
    if (!entryOf(a) || !entryOf(b) || may(a, b) || may(b, a)) return;
    out.push(err("E13", `${cap(name(a))} ${what} ${name(b)} at ${pt(at)}`, a, at, [b]));
  };
  posts.forEach(({ item: p, ref }, k) => {
    for (const { item: q, ref: r } of posts.slice(k + 1)) if (Math.hypot(p.c[0] - q.c[0], p.c[1] - q.c[1]) < p.r + q.r - 1e-9) say(ref, r, "overlaps", p.c);
    for (const { item: w, ref: r } of walls) if (segDist(p.c[0], p.c[1], w.a, w.b) < p.r - 1e-9) say(ref, r, "stands on", p.c);
    for (const { item: z, ref: r } of zones) if (moves(z) && inZone(shapeOf(z), p.c[0], p.c[1])) say(ref, r, "stands in", p.c);
  });
  zones.forEach(({ item: z, ref }, k) => {
    for (const { item: y, ref: r } of zones.slice(k + 1)) if (z.kind !== y.kind && !z.outside && !y.outside && overlap(z, y)) say(ref, r, "lies over", z.min);
  });
  return out;
}

/** E15: no post (the draft's checks add bars) in the world's own scenery round the lane: inside the sea, the void, the rooftops (a zone of all its box but the lane). */
function scenery(h: HoleIn, name: Namer): Issue[] {
  const out: Issue[] = [], round = h.zones.filter((z) => z.outside && moves(z));
  for (const { item: p, ref } of each<PostIn>(h, "post")) {
    const z = round.find((q) => inZone(shapeOf(q), p.c[0], p.c[1]));
    if (z) out.push(err("E15", `${cap(name(ref))} at ${pt(p.c)} stands in the ${z.skin || "hazard"} round the lane: the world draws over it`, ref, p.c));
  }
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The hole's checks (E1 to E8, E10, E13 to E15), errors first. name says a
 * piece; entryOf is the palette's view of each (by default every piece judged,
 * none allowed to meet another): a piece with no entry is not the builder's
 * to judge.
 */
export function checkHole(h: HoleIn, { name = nameIn(h), entryOf = () => ({}) }: { name?: Namer; entryOf?: EntryOf } = {}): Issue[] {
  const lane = laneOf(h), judged: Judged = (r) => !!entryOf(r);
  const ends = [...tee(h, lane, name, judged), ...cup(h, lane, name, judged)].filter((i) => !i.ref || judged(i.ref));
  // (the way follows from its ends: with the tee or the cup refused, E4 would only say so again)
  const out = [...board(h, name), ...ends, ...(ends.length ? [] : way(h, name)), ...mouths(h, name), ...exits(h, lane, name),
    ...clocks(h, name), ...limits(h, name), ...(ends.length ? [] : inReach(h, reach(h, h.ballR - CELL * Math.SQRT1_2).reaches, name)), ...overlaps(h, name, entryOf), ...scenery(h, name)];
  return out.filter((i) => !i.ref || judged(i.ref)).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}

/** A work gauge: what the hole adds of the room the realm leaves it (0 to 1, past 1 refused). */
export interface Gauge {
  used: number;
  of: number;
  share: number;
}
const W = RULES.work;
/** golf's shotBound with no wall: one shot's most (MaxWork and a step past it), whatever the hole. */
export const SHOT_FLOOR = W.shot + (RULES.maxWork + RULES.maxWorkStep) * W.unit;
/** golf's worstGas with nothing of the hole's: a first shot of minShotWork, whatever the hole. */
export const STORM_FLOOR = W.shot + (RULES.maxWorkStep + MIN_SHOT_WORK) * W.unit;
/**
 * The hole's work against the realm's limits, from builder.wasm's check, as
 * what the hole adds over a floor every hole pays (a gauge on the whole
 * would sit at 95% for a plain lane): its heaviest shot's walls and pulses'
 * set-up (refused past maxShot), a commit's decoding, forecast, walls and
 * set-up before a first shot in its dearest weather (refused past budget);
 * E11, a warning as either nears its limit (each fixed wall costs every
 * storm's puddle tries).
 */
export function work(c: Cost, warnAt = WORK_WARN): { shot: Gauge; storm: Gauge; issues: Issue[] } {
  const g = (used: number, of: number): Gauge => ({ used, of, share: used / of });
  const shot = g(c.bound - SHOT_FLOOR, c.maxShot - SHOT_FLOOR), storm = g(c.worst - STORM_FLOOR, c.budget - STORM_FLOOR), issues: Issue[] = [];
  if (shot.share > warnAt) issues.push({ rule: "E11", severity: "warning", text: `Its walls and moving pieces take ${Math.round(shot.share * 100)}% of what one shot may cost` });
  if (storm.share > warnAt) issues.push({ rule: "E11", severity: "warning", text: `In its dearest weather, a first shot has ${c.room.toLocaleString("en")} units of room, at least ${c.minShot.toLocaleString("en")}` });
  return { shot, storm, issues };
}
