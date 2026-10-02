// Frame pacing: which display refreshes are drawn, and when a device is too
// slow for the High tier, and the tier this browser plays in. Plain numbers,
// no three: the title reads it before the game loads.
import type { GfxMode } from "./types";

/** Where Auto remembers a device found too slow for High ("low"): the title and the cup cards read it too. */
export const SLOW_KEY = "gnogolf.gfx.slow";
const GFX_KEY = "gnogolf.gfx";
/** The graphics picked in this browser: auto (by the device), high or low. */
export function savedGfx(): GfxMode {
  try {
    const v = localStorage.getItem(GFX_KEY);
    return v === "high" || v === "low" ? v : "auto";
  } catch {
    return "auto";
  }
}
export function saveGfx(m: GfxMode) {
  try { localStorage.setItem(GFX_KEY, m); } catch {}
}
/** The Low graphics tier: picked, or Auto on a device whose frames were slow
 *  (the engine's own flag); `blocked` when storage cannot be read. */
export function lowGfx(blocked = false) {
  const gfx = savedGfx();
  try {
    return gfx === "low" || (gfx !== "high" && localStorage.getItem(SLOW_KEY) === "low");
  } catch {
    return blocked;
  }
}


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

/** Whether busy frames sit steadily on 33 ms: the browser holds them at 30 fps
 *  (a battery saver), which says nothing of the GPU. */
export function capped30(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b), mid = d[d.length >> 1];
  return d[Math.floor(d.length * 0.1)] > 30 && mid >= 31 && mid <= 36;
}

/** A run of busy frames' gaps (ms) as analytics says it: the median frame
 *  rate and the slowest tenth's, the frames over 50 ms (a hitch), how many. */
export function frameStats(gaps: readonly number[]) {
  const d = [...gaps].sort((a, b) => a - b), at = (q: number) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
  return { fps: Math.round(1000 / at(0.5)), fps_p10: Math.round(1000 / at(0.9)), long: d.filter((x) => x > 50).length, frames: d.length };
}

/** No input (pointer, key, touch, wheel) for this long, no shot on its way: the scene dozes. */
export const AWAY_MS = 60_000;
/**
 * The frame interval (ms) a scene in view is drawn at, or 0: not drawn.
 * busy (a shot, an aim, the camera moving) and fast movers in view (a tram, a
 * lift, a mill's sails): 60 fps. Anything else moving (the garden's sway, the
 * water, the weather, the decor): 30, never less while the player is about;
 * 10 once away (sinceInput past AWAY_MS). Nothing moving (reduced motion, no
 * timed piece): 10 for a second after the last input or change (sinceWake), then nothing.
 */
export function frameMs(busy: boolean, moving: boolean, fast: boolean, sinceInput: number, sinceWake: number) {
  if (busy) return 1000 / 60;
  if (!moving) return sinceWake > 1000 ? 0 : 1000 / 10;
  if (sinceInput > AWAY_MS) return 1000 / 10;
  return fast ? 1000 / 60 : 1000 / 30;
}
