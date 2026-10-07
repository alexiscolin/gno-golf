// The inspector's settings of a piece, pure: its size (a post's radius, a
// rail's or a bar's length along its way, a zone's two sides), its numbers
// (bounce, grip, grade) and its push's way, its clock and timing; each kept
// within its entry's ranges, the geometry on the grid (handles.ts). Whether
// the hole still holds is the inspector's to ask (edit.ts canPlace).
import { clampTo, START_SUBSTEPS } from "./edit";
import { setHandle } from "./handles";
import type { Clock, PaletteEntry, Range } from "./palette";
import type { Draft, Piece, Pulse, V } from "./draft";

/** A size the inspector shows: its name, value and range. */
export interface Size {
  key: "r" | "length" | "width" | "depth";
  value: number;
  range: Range;
}

/** The piece's sizes: none for a polygon (its points are its handles). */
export function sizesOf(p: Piece, e?: PaletteEntry): Size[] {
  const g = p.geometry, range = e?.size ?? { min: 0, max: 0, step: 0.25, def: 0 };
  if (g.t === "post") return [{ key: "r", value: g.r, range }];
  if (g.t === "rail" || g.t === "bar") return [{ key: "length", value: +Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]).toFixed(2), range }];
  if (g.t === "poly") return [];
  return [{ key: "width", value: g.max[0] - g.min[0], range }, { key: "depth", value: g.max[1] - g.min[1], range }];
}

/** The piece with one size set: within its entry's range, on the grid (a rail's far end moved along its way). */
export function withSize(p: Piece, e: PaletteEntry, key: Size["key"], v: number): Piece {
  const g = p.geometry;
  if (g.t === "post") return setHandle(p, "r", [g.c[0] + v, g.c[1]], e);
  if (g.t === "rail" || g.t === "bar") {
    const l = Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) || 1, u: V = [(g.b[0] - g.a[0]) / l, (g.b[1] - g.a[1]) / l];
    return setHandle(p, "b", [g.a[0] + u[0] * v, g.a[1] + u[1] * v], e);
  }
  if (g.t === "poly") return p;
  return setHandle(p, "max", key === "width" ? [g.min[0] + v, g.max[1]] : [g.max[0], g.min[1] + v], e);
}

/** The piece with a number set (bounce, grip, grade), on its entry's steps and in range; unchanged if its entry has none. */
export function withNumber(p: Piece, e: PaletteEntry, key: "bounce" | "scale" | "grade", v: number): Piece {
  const r = e[key];
  return r ? { ...p, params: { ...p.params, [key]: clampTo(v, r) } } : p;
}

/** A push's eight ways, east first, turning clockwise on the board (y down). */
export const DIRS: readonly V[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
/** The piece pushing the i-th way (DIRS). */
export const withDir = (p: Piece, i: number): Piece => ({ ...p, params: { ...p.params, dir: DIRS[((i % 8) + 8) % 8] } });

/** A timing's ranges: a cycle of 2 to 120 (substeps, or strokes for a pulse), on for 1 less at most, its phase within it. */
export const TIMING = { every: { min: 2, max: 120 } };
const timing = (t: Pulse): Pulse => {
  const every = Math.max(TIMING.every.min, Math.min(TIMING.every.max, Math.round(t.every)));
  return { every, on: Math.max(1, Math.min(every - 1, Math.round(t.on))), phase: Math.max(0, Math.min(every - 1, Math.round(t.phase))) };
};
/** A new pulse: on one stroke in three. */
const NEW_PULSE: Pulse = { every: 3, on: 1, phase: 0 };

/** The draft with piece id on clock k, if its entry takes it: a timed piece starts on half of a 40-substep cycle, a pulsed one in the first pulse (made if there is none). */
export function withClock(d: Draft, id: string, k: Clock, e: PaletteEntry): Draft {
  if (!e.clocks.includes(k)) return d;
  const pulses = k === "stroke" && !d.pulses.length ? [NEW_PULSE] : d.pulses;
  const clock: Piece["clock"] = k === "substep" ? { k, ...START_SUBSTEPS } : k === "stroke" ? { k, pulse: 0 } : { k: "fixed" };
  return { ...d, pulses, pieces: d.pieces.map((p) => (p.id === id ? { ...p, clock } : p)) };
}

/** The draft with piece id's timing set, within TIMING: its own for a timed piece, its pulse's for a pulsed one (every piece of that pulse with it). */
export function withTiming(d: Draft, id: string, t: Pulse): Draft {
  const p = d.pieces.find((q) => q.id === id), c = p?.clock;
  if (c?.k === "substep") return { ...d, pieces: d.pieces.map((q) => (q.id === id ? { ...q, clock: { k: "substep", ...timing(t) } } : q)) };
  if (c?.k === "stroke") return { ...d, pulses: d.pulses.map((q, i) => (i === c.pulse ? timing(t) : q)) };
  return d;
}

/** A blink's speed, as the inspector offers it: its cycle in substeps (a substep a 72 ms frame of play: slow about 5.8 s, medium 2.9 s, fast 1.4 s). */
export const BLINK = { slow: 80, medium: 40, fast: 20 } as const;
/** How much of its cycle a blinking piece is away (the way open): half, most or little of the time. */
export const OPEN = { half: 0.5, most: 0.75, little: 0.25 } as const;
export type Speed = keyof typeof BLINK;
export type Open = keyof typeof OPEN;
const keyOf = <K extends string>(o: Readonly<Record<K, number>>, v: number) => (Object.keys(o) as K[]).find((k) => o[k] === v) ?? null;

/** A timing read as the presets say it: its speed and how open, each null where Fine set it otherwise. */
export function blinkOf(t: Pulse): { speed: Speed | null; open: Open | null } {
  const speed = keyOf(BLINK, t.every), open = keyOf(OPEN, 1 - t.on / t.every);
  return { speed, open: open && Number.isInteger(t.every * OPEN[open]) ? open : null };
}

/** The draft with piece id blinking at a preset speed and openness (the one not given kept as it reads, else medium and half), its phase kept. */
export function withBlink(d: Draft, id: string, to: { speed?: Speed; open?: Open }): Draft {
  const c = d.pieces.find((p) => p.id === id)?.clock;
  if (c?.k !== "substep") return d;
  const now = blinkOf(c), every = BLINK[to.speed ?? now.speed ?? "medium"], open = OPEN[to.open ?? now.open ?? "half"];
  return withTiming(d, id, { every, on: Math.round(every * (1 - open)), phase: Math.min(c.phase, every - 1) });
}
