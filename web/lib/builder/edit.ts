// The editor's edits, pure: a palette entry placed as a Draft piece, on the
// grid, its settings within the entry's ranges. (The board's moves, handles
// and clamps join here: the rules they keep are checks.ts's.)
import type { ClockSpec, Draft, Geometry, Piece, V } from "./draft";
import { entryParts } from "./gg1";
import type { PaletteEntry, Range } from "./palette";

/** A piece's settings at placement: each within its entry's range, its default when left out. */
export interface PlaceParams {
  size?: number;
  thick?: number;
  bounce?: number;
  scale?: number;
  grade?: number;
  /** a tunnel's way out */
  to?: V;
}

/** The clock a timed piece starts with: on for half of a 40-substep cycle. */
export const START_SUBSTEPS = { every: 40, on: 20, phase: 0 };

/** v kept in r and on its steps (from r.min). */
export function clampTo(v: number, r: Range): number {
  const k = Math.round((Math.min(r.max, Math.max(r.min, v)) - r.min) / r.step);
  return Math.min(r.max, +(r.min + k * r.step).toFixed(6));
}

const pick = (v: number | undefined, r: Range | undefined) => (r ? clampTo(v ?? r.def, r) : undefined);
/** A size on the grid (a quarter), within its range. */
const gridSize = (v: number | undefined, r: Range) => Math.max(r.min, Math.min(r.max, Math.round(clampTo(v ?? r.def, r) * 4) / 4));

/**
 * The entry placed at `at` (a post's centre, a rail's or a bar's first end,
 * a zone's low corner), along x: a Draft piece named id, on the grid, its
 * settings its entry's (defaults, or those given, kept in range), on its
 * entry's first clock (a pulse's: the first pulse).
 */
export function placePiece(e: PaletteEntry, id: string, at: V, p: PlaceParams = {}): Piece {
  const params: Piece["params"] = {};
  const bounce = pick(p.bounce, e.bounce), scale = pick(p.scale, e.scale), grade = pick(p.grade, e.grade);
  if (bounce) params.bounce = bounce;
  if (scale !== undefined) params.scale = scale;
  if (grade !== undefined) (params.grade = grade), (params.dir = [1, 0]);
  if (e.kind === "tunnel" || e.kind === "loop") params.to = p.to ?? [at[0] + 8, at[1]];
  const c = e.clocks[0];
  const clock: ClockSpec = c === "substep" ? { k: "substep", ...START_SUBSTEPS } : c === "stroke" ? { k: "stroke", pulse: 0 } : { k: "fixed" };
  let geometry: Piece["geometry"];
  if (e.kind === "post") geometry = { t: "post", c: at, r: pick(p.size, e.size)! };
  else if (e.kind === "rail") geometry = { t: "rail", a: at, b: [at[0] + gridSize(p.size, e.size), at[1]] };
  else if (e.kind === "bar") geometry = { t: "bar", a: at, b: [at[0] + gridSize(p.size, e.size), at[1]], thick: pick(p.thick, e.thick)! };
  else {
    const s = gridSize(p.size, e.size), shape = e.shapes?.[0] ?? "rect";
    const max: V = [at[0] + s, at[1] + s];
    geometry = shape === "poly" ? { t: "poly", pts: [at, [at[0] + s, at[1]], [at[0], at[1] + s]] } : { t: shape === "round" ? "round" : "rect", min: at, max };
  }
  return { id, entry: e.id, geometry, params, clock };
}

/** Where a piece is, for a sentence: its first point. */
export const whereOf = (g: Geometry): V => (g.t === "rail" || g.t === "bar" ? g.a : g.t === "post" ? g.c : g.t === "poly" ? g.pts[0] : g.min);
const at = (v: V) => `(${+v[0].toFixed(2)}, ${+v[1].toFixed(2)})`;

/**
 * The draft in another world: each piece takes the same skin's entry there
 * (the world's own drawing, or the shared one); refused, naming each piece
 * the world has no entry for.
 */
export function changeWorld(d: Draft, world: string, palette: readonly PaletteEntry[]): Draft | { refused: string[] } {
  const refused: string[] = [];
  const pieces = d.pieces.map((p) => {
    const { kind, skin } = entryParts(p.entry);
    const e = palette.find((x) => x.kind === kind && x.skin === skin && x.world === world) ?? palette.find((x) => x.kind === kind && x.skin === skin);
    if (!e) refused.push(`the ${skin || "plain"} ${kind} at ${at(whereOf(p.geometry))}`);
    return e ? { ...p, entry: e.id } : p;
  });
  return refused.length ? { refused } : { ...d, world, pieces, proofs: [] };
}

/** A world's name in a sentence: "Garden". */
export const worldName = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** Why an opened draft is refused for its pieces: one whose entry is not its world's palette's; null if none. */
export function unknownEntry(d: Draft, palette: readonly PaletteEntry[]): string | null {
  const ids = new Set(palette.map((e) => e.id));
  const p = d.pieces.find((q) => !ids.has(q.entry));
  return p ? `Piece ${p.id} is no piece of the ${worldName(d.world)}'s.` : null;
}

/** readHole's matcher for a world: a hole's piece to its entry there, the world's own drawing first, null for none. */
export const matchIn = (palette: readonly PaletteEntry[]) => (p: { kind: string; skin: string }): string | null =>
  (palette.find((e) => e.kind === p.kind && e.skin === p.skin && e.world !== "*") ?? palette.find((e) => e.kind === p.kind && e.skin === p.skin))?.id ?? null;
