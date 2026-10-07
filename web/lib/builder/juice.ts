// The Builder's feel (the game-design review's "juice"), pure: the snap's
// tick at most so often, a label by the pointer kept in its box (a refusal
// said where the cursor is, once), and the confetti of the last weather
// proved, the same each time. The sounds are the game's own (feel.ts sound).

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
