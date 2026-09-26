// Frame pacing: which display refreshes are drawn, and when a device is too
// slow for the High tier. Plain numbers, no three: scripts/selfcheck.ts runs it.

/** Where Auto remembers a device found too slow for High ("low"): the title and the cup cards read it too. */
export const SLOW_KEY = "gnogolf.gfx.slow";

const out = { draw: false, budget: 0 };
/**
 * One display refresh: the time owed since the last frame drawn (budget),
 * plus this refresh's gap, against the frame interval wanted. Drawn once a
 * whole interval (less 1 ms of jitter) is owed; what is left over is carried,
 * at most one interval, so a 75, 90 or 144 Hz display averages the interval
 * (60 a second when busy) instead of every second or third refresh. The same
 * object every call.
 */
export function pace(budget: number, gap: number, interval: number) {
  const b = budget + gap;
  out.draw = b >= interval - 1;
  out.budget = out.draw ? Math.min(b - interval, interval) : b;
  return out;
}

/** Whether busy frames drawn this far apart (ms) say a slow GPU: over 20 ms on
 *  average (the cap wants 16.7), the slowest tenth left out (a hitch is not a GPU). */
export function slowFrames(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(gaps.length * 0.9)));
  return d.reduce((s, x) => s + x, 0) / d.length > 20;
}
