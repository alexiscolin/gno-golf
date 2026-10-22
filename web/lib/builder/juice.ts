// The Builder's feel (the game-design review's "juice"), pure: the snap's
// tick at most so often, a label by the pointer kept in its box (a refusal
// said where the cursor is, once), the confetti of the last weather proved,
// the same each time; and the board's: placements chained (the plop's note
// climbing), what a piece landing stirs (water ripples, sand puffs), how
// far a dragged piece leans. The sounds are the game's own (feel.ts sound).
import { inZone } from "../terrain";
import { entryParts } from "./gg1";
import { shapeOfPiece, type Draft, type V } from "./draft";

/** f, run at most once every ms (now: the clock, performance.now's by default). */
export function throttle(f: () => void, ms: number, now: () => number = () => performance.now()) {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < ms) return;
    last = t;
    f();
  };
}

/** How far from the pointer a label sits, and from its box's edge at least. */
const OFF = 16, EDGE = 8;

/** Where a label of size goes by the pointer p (in its box's pixels): below right of it, else on the side it fits, inside the box. */
export function labelAt(p: readonly [number, number], box: { w: number; h: number }, size: { w: number; h: number }): { left: number; top: number } {
  let left = p[0] + OFF, top = p[1] + OFF;
  if (left + size.w > box.w - EDGE) left = p[0] - OFF - size.w;
  if (top + size.h > box.h - EDGE) top = p[1] - OFF - size.h;
  return { left: Math.max(EDGE, Math.min(left, box.w - EDGE - size.w)), top: Math.max(EDGE, Math.min(top, box.h - EDGE - size.h)) };
}

/** A confetti piece: across the screen (x, %), when it starts (ms), how far it drifts (px), its turn and its colour (a token). */
export interface Bit {
  x: number;
  delay: number;
  drift: number;
  turn: number;
  color: string;
}
const COLORS = ["var(--gold)", "var(--hat)", "var(--green)", "var(--sunny)", "var(--wood)"];

/** n pieces of confetti, the same each time (a small generator, no Math.random). */
export function confetti(n: number): Bit[] {
  let s = 0x2f6b;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), s / 0x7fffffff);
  return Array.from({ length: n }, (_, i) => ({ x: Math.round(r() * 1000) / 10, delay: Math.round(r() * 400), drift: Math.round((r() - 0.5) * 120), turn: Math.round(r() * 720 - 360), color: COLORS[i % COLORS.length] }));
}

/** A placement's step in a chain: 0, then one more for each placed within ms of the one before (the plop climbing a scale). */
export function chain(ms: number, now: () => number = () => performance.now()) {
  let last = -Infinity, n = -1;
  return () => {
    const t = now();
    n = t - last <= ms ? n + 1 : 0;
    last = t;
    return n;
  };
}

/** What a piece landing at a board point stirs: water ripples, sand or other ground puffs, the lane a little dust. */
export function reactionAt(d: Pick<Draft, "pieces">, at: V): "ripple" | "puff" | "dust" {
  for (const p of [...d.pieces].reverse()) {
    const g = p.geometry, kind = entryParts(p.entry).kind;
    if (g.t === "rail" || g.t === "bar" || g.t === "post" || (kind !== "hazard" && kind !== "surface" && kind !== "slope")) continue;
    const z = shapeOfPiece(g);
    if (z && inZone(z, at[0], at[1])) return kind === "hazard" ? "ripple" : "puff";
  }
  return "dust";
}

/** How far a dragged piece leans toward where it goes (degrees), from its last move across the screen (px). */
export const lean = (dx: number) => Math.max(-6, Math.min(6, Math.round(dx * 0.6 * 10) / 10)) + 0;
