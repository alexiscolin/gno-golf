// A palette entry placed on the board: the GG1 pieces it is (gg1.ts), as
// the course's own builders make them (physics/build: a bar is Bar's four
// walls round its axis). Pure: the editor and the tests place alike.
import type { Vec2 } from "../types";
import type { GPost, GWall, GZone } from "./gg1";
import type { Clock, PaletteEntry, Shape } from "./palette";

/** What one placed piece is in GG1. */
export interface Placed {
  walls: GWall[];
  posts: GPost[];
  zones: GZone[];
}
/** A piece's parameters, each within its entry's range; unset, the range's default. */
export interface Params {
  size?: number;
  thick?: number;
  bounce?: number;
  scale?: number;
  grade?: number;
  /** degrees: a bar's or a rail's heading, a slope's push, a tunnel's or a loop's way out */
  angle?: number;
  shape?: Shape;
  /** a tunnel's or a loop's way out, on the board */
  to?: Vec2;
  /** a polygon's points, for shape "poly" or "outside" */
  poly?: readonly Vec2[];
}
/** A substep clock: on for on of every substeps, from phase (a timed wall or zone). */
export interface Timing {
  every: number;
  on: number;
  phase: number;
}
/** The clock a timed piece starts with: on half of a 40-substep cycle. */
export const DEFAULT_TIMING: Timing = { every: 40, on: 20, phase: 0 };

const pick = (p: number | undefined, r: { def: number } | undefined) => p ?? r?.def ?? 0;

/** physics/build's Bar: the four walls of a barrier thick wide from a to b, its caps extended so corners meet. */
export function bar(a: Vec2, b: Vec2, thick: number): [Vec2, Vec2][] {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  if (l === 0) return [];
  const n: Vec2 = [(-dy / l) * (thick / 2), (dx / l) * (thick / 2)], e: Vec2 = [(dx * thick) / 2 / l, (dy * thick) / 2 / l];
  const A: Vec2 = [a[0] - e[0], a[1] - e[1]], B: Vec2 = [b[0] + e[0], b[1] + e[1]];
  const c: Vec2[] = [[A[0] + n[0], A[1] + n[1]], [B[0] + n[0], B[1] + n[1]], [B[0] - n[0], B[1] - n[1]], [A[0] - n[0], A[1] - n[1]]];
  return c.map((p, i) => [p, c[(i + 1) % 4]]);
}

/**
 * The entry placed at `at` (a post's centre, a bar's or a zone's middle, a
 * rail's start), with params and a clock (substep timing for "substep"; a
 * "stroke" piece goes into a pulse, which the caller makes).
 */
export function place(e: PaletteEntry, at: Vec2, p: Params = {}, clock: Clock = e.clocks[0], timing: Timing = DEFAULT_TIMING): Placed {
  const out: Placed = { walls: [], posts: [], zones: [] };
  const timed = clock === "substep" ? timing : {};
  const size = pick(p.size, e.size), rad = ((p.angle ?? 0) * Math.PI) / 180, dir: Vec2 = [Math.cos(rad), Math.sin(rad)];
  const bounce = pick(p.bounce, e.bounce);
  if (e.kind === "post") {
    out.posts.push({ c: at, r: size, bounce, skin: e.skin });
  } else if (e.kind === "rail") {
    out.walls.push({ a: at, b: [at[0] + dir[0] * size, at[1] + dir[1] * size], bounce, skin: e.skin });
  } else if (e.kind === "bar") {
    const half: Vec2 = [(dir[0] * size) / 2, (dir[1] * size) / 2];
    for (const [a, b] of bar([at[0] - half[0], at[1] - half[1]], [at[0] + half[0], at[1] + half[1]], pick(p.thick, e.thick))) {
      out.walls.push({ a, b, bounce, skin: e.skin, ...timed });
    }
  } else {
    const shape = p.shape ?? e.shapes?.[0] ?? "rect", h = size / 2;
    const z: GZone = {
      kind: e.kind === "air" ? "slope" : e.kind,
      min: [at[0] - h, at[1] - h],
      max: [at[0] + h, at[1] + h],
      skin: e.skin,
      ...timed,
    };
    if (shape === "round") z.round = true;
    if ((shape === "poly" || shape === "outside") && p.poly) {
      z.poly = p.poly;
      z.outside = shape === "outside";
      z.min = [Math.min(...p.poly.map((q) => q[0])), Math.min(...p.poly.map((q) => q[1]))];
      z.max = [Math.max(...p.poly.map((q) => q[0])), Math.max(...p.poly.map((q) => q[1]))];
    }
    if (e.kind === "slope" || e.kind === "air") {
      const g = pick(p.grade, e.grade);
      z.vec = [dir[0] * g, dir[1] * g];
      if (e.kind === "air") z.air = true;
    }
    if (e.kind === "surface" || e.kind === "loop") z.scale = pick(p.scale, e.scale);
    if (e.kind === "tunnel" || e.kind === "loop") z.vec = p.to ?? [at[0] + dir[0] * 8, at[1] + dir[1] * 8];
    // a hazard's vec is unused by the physics, but GG1 holds it to the board
    // and Fit moves it with the rest: its middle, which is on the board
    if (e.kind === "hazard") z.vec = [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2];
    out.zones.push(z);
  }
  return out;
}
