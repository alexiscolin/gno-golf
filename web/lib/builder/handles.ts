// A piece's handles on the board, and what moving one does: the piece stays
// within its entry's ranges (a radius stops at the most its entry takes, a
// bar's length at its longest, a zone's side at its least) and on the grid
// (quarters). Whether the hole still holds is edit.ts's (clampHandle).
import type { Geometry, Piece, V } from "./draft";
import type { PaletteEntry, Range } from "./palette";

/** A handle: c a post's centre, r its rim; a, b a rail's or a bar's ends; min, max a zone's corners; p0… a polygon's points; to a tunnel's way out. */
export type HandleKey = "c" | "r" | "a" | "b" | "min" | "max" | "to" | `p${number}`;
export interface Handle {
  key: HandleKey;
  at: V;
}

/** The grid's finest step: a quarter (what Fit shifts exactly). */
export const QUARTER = 0.25;

/**
 * v on a grid of step (half a unit, the board's default; a quarter at the
 * finest) measured from origin: the hole's tee, the grid's own (framing
 * shifts a whole hole, by a post's rim at times, off the board's quarters;
 * L0 measures from the tee).
 */
export const snap = (v: V, step: number, origin: V): V => [at(origin[0], Math.round((v[0] - origin[0]) / step), step), at(origin[1], Math.round((v[1] - origin[1]) / step), step)];
/** The k-th step from o (to a millionth: an origin's float noise, 13.7 and a quarter, kept out of the draft). */
const at = (o: number, k: number, step: number) => +(o + k * step).toFixed(6) + 0;
const onQ = (v: V, o: V): V => snap(v, QUARTER, o);
// a value's grid line on the side of to, or away from from (a hair's float noise is on the line)
const toward = (v: number, to: number, o: number) => at(o, v < to ? Math.ceil((v - o) / QUARTER - 1e-9) : Math.floor((v - o) / QUARTER + 1e-9), QUARTER);
const away = (v: number, from: number, o: number) => at(o, v < from ? Math.floor((v - o) / QUARTER + 1e-9) : Math.ceil((v - o) / QUARTER - 1e-9), QUARTER);

/** Its handles, in the order the board draws them. */
export function handlesOf(p: Piece): Handle[] {
  const g = p.geometry, to = p.params.to ? [{ key: "to" as const, at: p.params.to }] : [];
  switch (g.t) {
    case "post": return [{ key: "c", at: g.c }, { key: "r", at: [g.c[0] + g.r, g.c[1]] }];
    case "rail":
    case "bar": return [{ key: "a", at: g.a }, { key: "b", at: g.b }, ...to];
    case "poly": return [...g.pts.map((at, i) => ({ key: `p${i}` as HandleKey, at })), ...to];
    default: return [{ key: "min", at: g.min }, { key: "max", at: g.max }, ...to];
  }
}

/** An end moved to `to` from the fixed one, its length kept in r, both on the grid from origin. */
function end(other: V, to: V, r: Range, was: V, origin: V): V {
  const want = onQ(to, origin), dx = want[0] - other[0], dy = want[1] - other[1], l = Math.hypot(dx, dy);
  if (l < 1e-9) return was;
  if (l >= r.min - 1e-9 && l <= r.max + 1e-9) return want;
  const k = (l > r.max ? r.max : r.min) / l, p: V = [other[0] + dx * k, other[1] + dy * k];
  // in from the most toward the other end, out from the least away from it
  return l > r.max ? [toward(p[0], other[0], origin[0]), toward(p[1], other[1], origin[1])] : [away(p[0], other[0], origin[0]), away(p[1], other[1], origin[1])];
}

/** A side from `from` to the handle at v, its length kept in r, on the grid. */
const side = (from: number, v: number, r: Range, up: boolean) => {
  const l = Math.min(r.max, Math.max(r.min, up ? v - from : from - v));
  const k = Math.min(Math.floor(r.max / QUARTER), Math.max(Math.ceil(r.min / QUARTER), Math.round(l / QUARTER))) * QUARTER;
  return up ? from + k : from - k;
};

/** The piece with one handle moved to `to`, within its entry's ranges and on the grid from origin, the tee (a radius on its entry's steps). */
export function setHandle(p: Piece, key: HandleKey, to: V, e: PaletteEntry, origin: V): Piece {
  const g = p.geometry;
  if (key === "to") return { ...p, params: { ...p.params, to: onQ(to, origin) } };
  let geometry: Geometry = g;
  if (g.t === "post") {
    if (key === "c") geometry = { ...g, c: onQ(to, origin) };
    else if (key === "r") {
      const r = Math.hypot(to[0] - g.c[0], to[1] - g.c[1]), s = e.size;
      geometry = { ...g, r: Math.min(s.max, +(s.min + Math.round((Math.min(s.max, Math.max(s.min, r)) - s.min) / s.step) * s.step).toFixed(6)) };
    }
  } else if (g.t === "rail" || g.t === "bar") {
    if (key === "a") geometry = { ...g, a: end(g.b, to, e.size, g.a, origin) };
    else if (key === "b") geometry = { ...g, b: end(g.a, to, e.size, g.b, origin) };
  } else if (g.t === "poly") {
    const i = Number(key.slice(1));
    if (key.startsWith("p") && i >= 0 && i < g.pts.length) geometry = { ...g, pts: g.pts.map((v, k) => (k === i ? onQ(to, origin) : v)) };
  } else if (key === "max") geometry = { ...g, max: [side(g.min[0], to[0], e.size, true), side(g.min[1], to[1], e.size, true)] };
  else if (key === "min") geometry = { ...g, min: [side(g.max[0], to[0], e.size, false), side(g.max[1], to[1], e.size, false)] };
  return { ...p, geometry };
}

/** Why turning p changes nothing ("" when it does): R and Turn say it rather than do nothing. */
export const notTurned = (p: Piece, origin: V) => (JSON.stringify(turnPiece(p, origin)) === JSON.stringify(p) ? "A round piece looks the same turned: nothing to turn." : "");

/** The piece turned a quarter about its middle, on the grid from origin, the tee (a slope's push turned with it); a post as it was. */
export function turnPiece(p: Piece, origin: V): Piece {
  const g = p.geometry;
  const mid: V = g.t === "rail" || g.t === "bar" ? [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2]
    : g.t === "post" ? g.c
    : g.t === "poly" ? [g.pts.reduce((s, v) => s + v[0], 0) / g.pts.length, g.pts.reduce((s, v) => s + v[1], 0) / g.pts.length]
    : [(g.min[0] + g.max[0]) / 2, (g.min[1] + g.max[1]) / 2];
  const t = (v: V): V => onQ([mid[0] - (v[1] - mid[1]), mid[1] + (v[0] - mid[0])], origin);
  let geometry: Geometry;
  switch (g.t) {
    case "post": return p;
    case "rail": geometry = { ...g, a: t(g.a), b: t(g.b) }; break;
    case "bar": geometry = { ...g, a: t(g.a), b: t(g.b) }; break;
    case "poly": geometry = { ...g, pts: g.pts.map(t) }; break;
    default: {
      const a = t(g.min), b = t(g.max);
      geometry = { ...g, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
    }
  }
  const dir = p.params.dir;
  return { ...p, geometry, params: dir ? { ...p.params, dir: [-dir[1], dir[0]] } : p.params };
}
