// Quick shots (the game-design review's "Show the ball in Edit"): a shot
// pulled back on the board in Edit, Shift held, as the game's slingshot
// pulls one (chain.ts pullShot), played in calm weather by builder.wasm's
// round (from the tee) and from (from where a quick shot stopped): the
// realm's own physics, as the meter plays it. Its path is drawn on the
// board, the last few faded, and played again on the hole as it changes (a
// piece dragged: the shots replay live). Never a proof: nothing here is kept
// with the draft or replayed as a save is cut, and calm is the only weather
// (a proof is Test's: proof.ts).
import { pullShot, shotOf } from "../chain";
import { frame } from "./gg1";
import { canonicalHex } from "./proof";
import type { Draft, V } from "./draft";
import type { BuilderHost } from "./wasm";

/** What a quick shot is played with: builder.wasm's calls (the editor's host, or the meter's in its worker). */
export type Shooter = Pick<BuilderHost, "load" | "setperiod" | "find" | "round" | "from" | "fit">;

/** The id a quick shot's hole is loaded under (the checks', the meter's and Test's are their own). */
export const QUICK_ID = "quick/v1";
/** The clock calm weather is found from (the meter's too). */
export const CALM_NOW = 1_000_000;

/** The period of calm weather at or before CALM_NOW for the hole loaded under id (CALM_NOW itself if none, or if the realm will not forecast it). */
export function calmPeriod(sim: Pick<Shooter, "setperiod" | "find">, id: string): number {
  sim.setperiod(CALM_NOW);
  try {
    const p = sim.find(id, "", CALM_NOW);
    return p < 0 ? CALM_NOW : p;
  } catch {
    return CALM_NOW;
  }
}

/** A quick shot: from the tee (from null) or from where one stopped, at that stroke, and the shot (shotOf). */
export interface QuickShot {
  from: V | null;
  stroke: number;
  shot: string;
}
/** A quick shot played: its path, where it stopped, whether it holed. Nothing else: no proof. */
export interface Played {
  path: V[];
  rest: V;
  holed: boolean;
}

/**
 * The shots played on the draft as it is (written and fit as it will be
 * published), in calm weather, each in the board's own units (a draft a drag
 * left off its frame: the shift framing makes taken back); a shot the realm
 * refuses (a ball inside a wall) is null. Null if fit refuses the draft.
 */
export function quickShots(sim: Shooter, d: Draft, shots: readonly QuickShot[]): (Played | null)[] | null {
  if (!shots.length) return [];
  const hex = canonicalHex(d, sim);
  if (hex == null) return null;
  const f = frame(d), dx = d.tee[0] - f.tee[0], dy = d.tee[1] - f.tee[1], back = (v: readonly number[]): V => [v[0] + dx, v[1] + dy];
  sim.load(QUICK_ID, hex);
  const period = calmPeriod(sim, QUICK_ID);
  return shots.map((s) => {
    const out = s.from ? sim.from(QUICK_ID, s.from[0] - dx, s.from[1] - dy, s.shot, s.stroke, period) : sim.round(QUICK_ID, s.shot, period);
    if (out.startsWith("panic: ")) return null;
    const r = JSON.parse(out) as { holed: boolean; rest: V; path?: V[] };
    return { path: (r.path ?? []).map(back), rest: back(r.rest), holed: r.holed };
  });
}

/**
 * A pull on the board as a shot, as the game's slingshot has it: the ball
 * flies away from the pull (press: where it began, at: the pointer, in
 * pixels; y down, as the board's), its power the pull's length against the
 * window's short side (vw × vh). Null for no pull.
 */
export function pulled(press: readonly [number, number], at: readonly [number, number], vw: number, vh: number): string | null {
  const dx = press[0] - at[0], dy = press[1] - at[1];
  const { deg, power } = pullShot(Math.hypot(dx, dy), vw, vh, Math.atan2(dy, dx));
  return power > 0 ? shotOf(deg, power) : null;
}

/** A round's shots (a quick test's) as quick shots: the first from the tee, each next from where the one before stopped; cut where the realm refuses one. */
export function roundOf(sim: Shooter, d: Draft, shots: readonly string[]): QuickShot[] {
  const out: QuickShot[] = [];
  let from: V | null = null;
  for (const [stroke, shot] of shots.entries()) {
    const q: QuickShot = { from, stroke, shot }, [p] = quickShots(sim, d, [q]) ?? [null];
    out.push(q);
    if (!p || p.holed) break;
    from = p.rest;
  }
  return out;
}
