// The editor's edits, pure: a palette entry placed as a Draft piece, on the
// grid, its settings within the entry's ranges; and the prevention the
// board keeps (the design's "Prevention, not warning"): where a piece may go
// (canPlace, the ghost's colour and sentence), where a drag stops
// (clampMove), the one-click fix of an issue (fixOf). Each asks the whole
// pipeline (pipeline.ts validate), so the board refuses exactly what the
// issues list would.
import type { Issue } from "./checks";
import type { ClockSpec, Draft, Geometry, Piece, V } from "./draft";
import { entryParts, frame } from "./gg1";
import { handlesOf, QUARTER, setHandle, type HandleKey } from "./handles";
import { CELL } from "./lane";
import { entry as entryIn, type PaletteEntry, type Range } from "./palette";
import { about, validate, type ValidateOptions } from "./pipeline";

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

/**
 * The draft moved to another world (changeWorld), only if it holds there:
 * judged with that world's palette (its ranges, its drawings: the census)
 * against what it had in this one (o: this world's checks). Refused naming
 * the pieces it has no entry for, or with the first error it would bring.
 */
export function toWorld(d: Draft, world: string, palette: readonly PaletteEntry[], o: ValidateOptions): Draft | { refused: string[] } | { why: string } {
  const r = changeWorld(d, world, palette);
  if ("refused" in r) return r;
  const why = newErrors(errorsOf(d, o), r, { ...o, palette });
  return why.length ? { why: why[0].text } : r;
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

/** An error's place: its rule and the piece it names ("-" the whole hole's). */
const keyOf = (i: Issue) => `${i.rule} ${i.piece ?? "-"}`;

/**
 * What a piece brings to a hole: the errors of after (the hole with it, as
 * the edit leaves it, framed or not: validate frames) about the piece, and
 * every other one the hole without it (rest) did not have, whichever piece
 * it names (a bar the new rail swallows into the kerb, the cup cut off).
 * before: rest's own errors, when the caller has them.
 */
export function editErrors(rest: Draft, after: Draft, id: string, o: ValidateOptions, before?: readonly Issue[]): Issue[] {
  const had = new Set((before ?? errorsOf(rest, o)).map(keyOf));
  const v = validate(after, o);
  return v.issues.filter((i) => i.severity === "error" && (about(i, id, v.refs) || !had.has(keyOf(i))));
}

/** Why the piece may not go where it is in d (put in, or put back in place of its old self); none, it may (editErrors). */
export function canPlace(d: Draft, piece: Piece, o: ValidateOptions, before?: readonly Issue[]): Issue[] {
  const rest = { ...d, pieces: d.pieces.filter((p) => p.id !== piece.id) };
  return editErrors(rest, { ...rest, pieces: [...rest.pieces, piece] }, piece.id, o, before);
}
/** The draft's errors (validate's, warnings left out). */
export const errorsOf = (d: Draft, o: ValidateOptions) => validate(d, o).issues.filter((i) => i.severity === "error");

/** The piece moved so its first point (whereOf) is at `to`, its shape and settings unchanged (a tunnel's way out is its own handle). */
export function movePiece(p: Piece, to: V): Piece {
  const at = whereOf(p.geometry), dx = to[0] - at[0], dy = to[1] - at[1], m = (v: V): V => [v[0] + dx, v[1] + dy];
  const g = p.geometry;
  const geometry: Geometry = g.t === "rail" || g.t === "bar" ? { ...g, a: m(g.a), b: m(g.b) } : g.t === "post" ? { ...g, c: m(g.c) } : g.t === "poly" ? { ...g, pts: g.pts.map(m) } : { ...g, min: m(g.min), max: m(g.max) };
  return { ...p, geometry };
}

/** v on a grid of step (half a unit, the board's default; a quarter at the finest). */
export const snap = (v: V, step = 0.5): V => [Math.round(v[0] / step) * step + 0, Math.round(v[1] / step) * step + 0];

/**
 * v on the quarter grid as the hole has it: measured from origin (the tee:
 * the grid's own, since framing shifts a whole hole, by a post's rim at
 * times; the cup when the tee itself moves).
 */
const onQuarter = (v: V, origin: V): V => {
  const s = snap([v[0] - origin[0], v[1] - origin[1]], QUARTER);
  return [s[0] + origin[0], s[1] + origin[1]];
};

/** The last point from `from` toward `to` (a grid step at a time) that ok takes: `to` itself if it does; `from` if not even the first step does. */
function walk(from: V, to: V, ok: (v: V) => boolean, origin: V = [0, 0]): V {
  const on = (v: V) => onQuarter(v, origin);
  to = on(to);
  if (ok(to)) return to;
  const n = Math.ceil(Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1])) / CELL);
  let last = from;
  for (let k = 1; k < n; k++) {
    const v = on([from[0] + ((to[0] - from[0]) * k) / n, from[1] + ((to[1] - from[1]) * k) / n]);
    if (!ok(v)) break;
    last = v;
  }
  return last;
}

const without = (d: Draft, id: string) => ({ ...d, pieces: d.pieces.filter((q) => q.id !== id) });
const replace = (d: Draft, p: Piece) => frame({ ...d, pieces: d.pieces.map((q) => (q.id === p.id ? p : q)) });

/**
 * Where a drag of piece id toward `to` stops: `to` if the piece may go there,
 * else the last place on the way (a grid step at a time) it may; where it
 * is if not even the first step may.
 */
export function clampMove(d: Draft, id: string, to: V, o: ValidateOptions): V {
  const p = d.pieces.find((q) => q.id === id);
  if (!p) return to;
  const rest = without(d, id), before = errorsOf(rest, o);
  return walk(whereOf(p.geometry), to, (v) => canPlace(rest, movePiece(p, v), o, before).length === 0, d.tee);
}

/** A drag of one of a piece's handles toward `to`: the piece within its entry's ranges (handles.ts), stopped at the last place the hole holds; the draft framed. */
export function clampHandle(d: Draft, id: string, key: HandleKey, to: V, o: ValidateOptions): Draft {
  const p = d.pieces.find((q) => q.id === id), e = p && entryIn(p.entry, o.palette), h = p && handlesOf(p).find((x) => x.key === key);
  if (!p || !e || !h) return d;
  const rest = without(d, id), before = errorsOf(rest, o);
  const last = walk(h.at, to, (v) => canPlace(rest, setHandle(p, key, v, e), o, before).length === 0);
  return replace(d, setHandle(p, key, last, e));
}

/** A drag of the tee or the cup toward `to`: stopped at the last place where the hole has no error it did not have. */
export function clampEnd(d: Draft, which: "tee" | "pin", to: V, o: ValidateOptions): V {
  const had = errorsOf(d, o);
  return walk(d[which], to, (v) => newErrors(had, { ...d, [which]: v }, o).length === 0, which === "tee" ? d.pin : d.tee);
}

/** A release's outcome: the draft as it is kept (framed), or why nothing changes. */
export type Dropped = Draft | { why: string };
const verdict = (next: Draft, why: readonly Issue[]): Dropped => (why.length ? { why: why[0].text } : next);

/**
 * A piece let go after a drag toward `to`: clamped with the fast checks
 * (quick), then the whole result judged with the census (full) before it is
 * kept, framed; refused if even that fails.
 */
export function dropMove(start: Draft, id: string, to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const p = start.pieces.find((q) => q.id === id);
  if (!p) return { why: "" };
  const at = clampMove(start, id, to, quick), next = frame({ ...start, pieces: start.pieces.map((q) => (q.id === id ? movePiece(p, at) : q)) });
  return verdict(next, editErrors(without(start, id), next, id, full));
}

/** A handle let go: as dropMove, the piece within its entry's ranges (clampHandle). */
export function dropHandle(start: Draft, id: string, key: HandleKey, to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const next = clampHandle(start, id, key, to, quick);
  return verdict(next, editErrors(without(start, id), next, id, full));
}

/** The tee or the cup let go: clamped (clampEnd), then judged with the census: kept only with no error the hole did not have. */
export function dropEnd(start: Draft, which: "tee" | "pin", to: V, quick: ValidateOptions, full: ValidateOptions): Dropped {
  const next = frame({ ...start, [which]: clampEnd(start, which, to, quick) });
  return verdict(next, newErrors(errorsOf(start, full), next, full));
}

/** The errors an edit brings (a rule on a piece, or on the whole hole, that before did not have): none, it may be made. before: the draft's own errors before it. */
export function newErrors(before: readonly Issue[], after: Draft, o: ValidateOptions): Issue[] {
  const had = new Set(before.map(keyOf));
  return errorsOf(after, o).filter((i) => !had.has(keyOf(i)));
}

/** A fresh piece name: p and the next number. */
export function nextId(d: Draft): string {
  const n = d.pieces.reduce((m, p) => Math.max(m, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  return `p${n + 1}`;
}

/** The draft without the piece (its proofs kept: their key says whether they still hold, an undo brings them back). */
export const removePiece = (d: Draft, id: string): Draft => without(d, id);

/** The nearest place to p's (rings a grid step apart, out to FIX_REACH, never where it is) where it may go in rest; null if none. */
function nearest(rest: Draft, p: Piece, o: ValidateOptions): Piece | null {
  const before = errorsOf(rest, o), from = whereOf(p.geometry), seen = new Set<string>();
  for (let r = CELL; r <= FIX_REACH + 1e-9; r += CELL) {
    for (let k = 0; k < FIX_DIRECTIONS; k++) {
      const a = (2 * Math.PI * k) / FIX_DIRECTIONS, v = onQuarter([from[0] + r * Math.cos(a), from[1] + r * Math.sin(a)], rest.tee), key = v.join(" ");
      if (seen.has(key) || (v[0] === from[0] && v[1] === from[1])) continue;
      seen.add(key);
      const moved = movePiece(p, v);
      if (canPlace(rest, moved, o, before).length === 0) return moved;
    }
  }
  return null;
}

/** A copy of piece id, under a fresh name, at the nearest place it may go; the draft framed, or null if there is none near. */
export function copyPiece(d: Draft, id: string, o: ValidateOptions): Draft | null {
  const p = d.pieces.find((q) => q.id === id);
  const c = p && nearest(d, { ...p, id: nextId(d) }, o);
  return c ? frame({ ...d, pieces: [...d.pieces, c] }) : null;
}

/** How far fixOf looks for a place, and in how many directions on each ring. */
export const FIX_REACH = 3;
const FIX_DIRECTIONS = 16;

/**
 * The one-click fix of an issue: its piece moved to the nearest place (rings
 * a grid step apart, out to FIX_REACH) where it may go, the draft framed
 * again; null when the issue is the whole hole's (no piece to move) or no
 * place near is free.
 */
export function fixOf(issue: Issue, d: Draft, o: ValidateOptions): Draft | null {
  const p = issue.piece ? d.pieces.find((q) => q.id === issue.piece) : undefined;
  const moved = p && nearest(without(d, p.id), p, o);
  return moved ? replace(d, moved) : null;
}
