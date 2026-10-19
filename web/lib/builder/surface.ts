// The green painted (the board's Grow and Shrink): the ground as unit cells
// on the hole's own lattice (their corners where its rails meet), kept in
// the draft beside the pieces (draft.ts surface; never in the bytes), and
// walled by itself: its outline traced, interior on the right, each straight
// run between its corners one plain rail ("*\/rail/"), the sides left open
// none. No corner post, no diagonal: the rails are ordinary pieces, the
// chain sees nothing else. Only the rails the surface owns (its ids) are its
// to replace; one moved, cut or taken away by hand is the author's from then
// on, its side open (owned). Every edit goes through the editor's gate
// (paintEdit: the Builder's limits, then no error the hole did not have).
import type { Issue } from "./checks";
import type { Draft, Piece, Surface, V } from "./draft";
import { errorsOf, newErrors } from "./edit";
import { refusalOf } from "./explain";
import { frame } from "./gg1";
import { pastLimits } from "./limits";
import type { ValidateOptions } from "./pipeline";

export type { Surface };
/** The rail a painted side is walled with. */
export const SURFACE_RAIL = "*/rail/";
/** The brush: a square this many cells a side, round the pointer. */
export const BRUSH = 2;

/** A straight run of the outline, corner to corner: its ends (interior on the right of a→b), its outward normal, its unit edges' middles, and whether every one is open. */
export interface Side {
  a: V;
  b: V;
  out: V;
  edges: V[];
  open: boolean;
}

const key = (v: V) => `${v[0]} ${v[1]}`;
const add = (a: V, b: V, k = 1): V => [+(a[0] + b[0] * k).toFixed(6) + 0, +(a[1] + b[1] * k).toFixed(6) + 0];
const sameRail = (p: Piece, a: V, b: V) => {
  const g = p.geometry;
  return g.t === "rail" && ((key(g.a) === key(a) && key(g.b) === key(b)) || (key(g.a) === key(b) && key(g.b) === key(a)));
};

/** The lattice's offset (in 0..1): the first cell's corner's. */
const originOf = (cells: readonly V[]): V => (cells.length ? [mod1(cells[0][0]), mod1(cells[0][1])] : [0, 0]);
const mod1 = (x: number) => +(x - Math.floor(x)).toFixed(6) + 0;

/**
 * The outline of cells (each its low corner, a unit square): its loops, each
 * traced with the inside on the right (on the board, y down: clockwise round
 * the green), from its top-left corner along +x, and cut into its straight
 * sides. Cells touching at a corner only are kept apart (a right turn there).
 */
export function outline(cells: readonly V[], open: readonly V[] = []): Side[] {
  const has = new Set(cells.map(key)), opened = new Set(open.map(key));
  type Edge = { from: V; to: V; dir: V; mid: V };
  const from = new Map<string, Edge[]>(), all: Edge[] = [];
  const edge = (a: V, dir: V) => {
    const e = { from: a, to: add(a, dir), dir, mid: add(a, dir, 0.5) };
    all.push(e);
    from.set(key(a), [...(from.get(key(a)) ?? []), e]);
  };
  for (const c of cells) {
    const [x, y] = c;
    if (!has.has(key([x, y - 1]))) edge([x, y], [1, 0]);
    if (!has.has(key([x + 1, y]))) edge(add(c, [1, 0]), [0, 1]);
    if (!has.has(key([x, y + 1]))) edge(add(c, [1, 1]), [-1, 0]);
    if (!has.has(key([x - 1, y]))) edge(add(c, [0, 1]), [0, -1]);
  }
  const used = new Set<Edge>(), sides: Side[] = [];
  const left = () => all.filter((e) => !used.has(e)).sort((p, q) => p.from[1] - q.from[1] || p.from[0] - q.from[0])[0];
  for (let start = left(); start; start = left()) {
    const loop: Edge[] = [];
    for (let e: Edge | undefined = start; e && !used.has(e); ) {
      used.add(e), loop.push(e);
      const next: Edge[] = (from.get(key(e.to)) ?? []).filter((n) => !used.has(n) || n === start);
      const right: V = [-e.dir[1], e.dir[0]];
      e = next.find((n) => n.dir[0] === right[0] && n.dir[1] === right[1]) ?? next[0];
    }
    // (its first edge leaves a corner: each side a run of edges one way)
    let side: Side | null = null;
    for (const e of loop) {
      if (side && side.out[0] === e.dir[1] && side.out[1] === -e.dir[0]) (side.b = e.to), side.edges.push(e.mid);
      else sides.push((side = { a: e.from, b: e.to, out: [e.dir[1], -e.dir[0]], edges: [e.mid], open: false }));
    }
  }
  for (const s of sides) s.open = s.edges.every((m) => opened.has(key(m)));
  return sides;
}

/** The rails a surface's outline is walled with: each side's runs of edges not open, one rail each, in the outline's order. */
export function railsOf(cells: readonly V[], open: readonly V[]): { a: V; b: V }[] {
  const opened = new Set(open.map(key)), out: { a: V; b: V }[] = [];
  for (const s of outline(cells)) {
    const d: V = [Math.sign(s.b[0] - s.a[0]), Math.sign(s.b[1] - s.a[1])];
    let run: V | null = null;
    s.edges.forEach((m, i) => {
      const lo = add(m, d, -0.5), hi = add(m, d, 0.5);
      if (!opened.has(key(m))) run ??= lo;
      if (run && (opened.has(key(m)) || i === s.edges.length - 1)) out.push({ a: run, b: opened.has(key(m)) ? lo : hi }), (run = null);
    });
  }
  return out;
}

/**
 * The surface as it stands in d: the rails it owns that are still its own
 * (a plain fixed rail of its outline, as it put it), and its open edges
 * with every run whose rail is gone or the author's now (moved, cut, a
 * timing given, taken away). Nothing in d changes: what the paint works from.
 */
export function owned(d: Draft): { cells: V[]; open: V[]; ids: string[] } | null {
  const s = d.surface;
  if (!s) return null;
  const mine = d.pieces.filter((p) => s.ids.includes(p.id) && p.geometry.t === "rail" && p.clock.k === "fixed" && p.entry.split("/")[1] === "rail");
  const edges = new Set(outline(s.cells).flatMap((x) => x.edges.map(key)));
  const open = s.open.filter((m) => edges.has(key(m))), ids: string[] = [];
  for (const r of railsOf(s.cells, open)) {
    const p = mine.find((q) => !ids.includes(q.id) && sameRail(q, r.a, r.b));
    if (p) ids.push(p.id);
    else open.push(...unitsOf(r.a, r.b));
  }
  return { cells: s.cells, open, ids };
}
/** A rail's unit edges' middles. */
const unitsOf = (a: V, b: V): V[] => {
  const n = Math.round(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])), d: V = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  return Array.from({ length: n }, (_, i) => add(a, d, i + 0.5));
};

/**
 * d with the surface given (cells, open edges): the rails it owns replaced
 * by its outline's, every other piece as it is. A rail kept where it was
 * keeps its name and its look; a new one takes a freed name, then a fresh
 * one. Its rails first, as a starter has them; framed.
 */
export function applySurface(d: Draft, next: { cells: readonly V[]; open: readonly V[] }): Draft {
  const was = owned(d), mineIds = new Set(was?.ids ?? []);
  const edges = new Set(outline(next.cells).flatMap((s) => s.edges.map(key)));
  const open = uniq(next.open.filter((m) => edges.has(key(m))));
  const mine = d.pieces.filter((p) => mineIds.has(p.id)), rest = d.pieces.filter((p) => !mineIds.has(p.id));
  const free = mine.map((p) => p.id);
  let n = d.pieces.reduce((m, p) => Math.max(m, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  const want = railsOf(next.cells, open), kept = want.map((r) => mine.find((p) => sameRail(p, r.a, r.b)));
  for (const p of kept) if (p) free.splice(free.indexOf(p.id), 1);
  const rails = want.map((r, i): Piece => kept[i] ?? { id: free.shift() ?? `p${++n}`, entry: SURFACE_RAIL, geometry: { t: "rail", a: r.a, b: r.b }, params: {}, clock: { k: "fixed" } });
  const cells = uniq([...next.cells]).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return frame({ ...d, pieces: [...rails, ...rest], surface: { cells, open, ids: rails.map((p) => p.id) } });
}
const uniq = (vs: readonly V[]) => [...new Map(vs.map((v) => [key(v), v])).values()];

/** Whether d can be painted (a green of its own: a new hole's, read from its starter's rails): "" it can, else why not in a line (where the tool would be). */
export const paintOff = (d: Draft): string => (d.surface ? "" : "Its walls were placed by hand: this hole stays walled by hand.");

/**
 * A new hole's surface, from its rails (a starter's): the cells inside its
 * plain fixed rails, if their outline is exactly those rails (on one unit
 * lattice, no diagonal, no rail inside); null otherwise.
 */
export function surfaceOf(d: Draft): Surface | null {
  const rails = d.pieces.filter((p) => p.geometry.t === "rail" && p.clock.k === "fixed" && p.entry === SURFACE_RAIL);
  const segs = rails.map((p) => p.geometry as { t: "rail"; a: V; b: V });
  if (!segs.length || segs.some((g) => g.a[0] !== g.b[0] && g.a[1] !== g.b[1])) return null;
  const o: V = [mod1(segs[0].a[0]), mod1(segs[0].a[1])];
  if (segs.some((g) => [g.a, g.b].some((v) => mod1(v[0]) !== o[0] || mod1(v[1]) !== o[1]))) return null;
  const xs = segs.flatMap((g) => [g.a[0], g.b[0]]), ys = segs.flatMap((g) => [g.a[1], g.b[1]]);
  const cells: V[] = [];
  for (let y = Math.min(...ys); y < Math.max(...ys); y++) {
    for (let x = Math.min(...xs); x < Math.max(...xs); x++) {
      // inside: an odd number of upright rails crossed from the cell's middle out to +x
      const cx = x + 0.5, cy = y + 0.5;
      const n = segs.filter((g) => g.a[0] === g.b[0] && g.a[0] > cx && Math.min(g.a[1], g.b[1]) < cy && Math.max(g.a[1], g.b[1]) > cy).length;
      if (n % 2) cells.push([x, y]);
    }
  }
  const want = railsOf(cells, []);
  if (want.length !== rails.length || !want.every((r) => rails.some((p) => sameRail(p, r.a, r.b)))) return null;
  return { cells, open: [], ids: want.map((r) => rails.find((p) => sameRail(p, r.a, r.b))!.id) };
}

/** The cells under the brush at a board point: BRUSH a side, on the surface's lattice, round the pointer. */
export function brushAt(at: V, cells: readonly V[]): V[] {
  const o = originOf(cells), h = BRUSH / 2, out: V[] = [];
  const x0 = Math.round(at[0] - o[0] - h) + o[0], y0 = Math.round(at[1] - o[1] - h) + o[1];
  for (let j = 0; j < BRUSH; j++) for (let i = 0; i < BRUSH; i++) out.push([+(x0 + i).toFixed(6) + 0, +(y0 + j).toFixed(6) + 0]);
  return out;
}
/** The cells a stroke from a to b passes under the brush (a step of half a cell: a quick stroke leaves no gap). */
export function strokeCells(a: V, b: V, cells: readonly V[]): V[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
  return uniq(Array.from({ length: n + 1 }, (_, k) => brushAt([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], cells)).flat());
}
/** Cells grown (painted in) or shrunk (painted out). */
export function painted(cells: readonly V[], brushed: readonly V[], grow: boolean): V[] {
  if (grow) return uniq([...cells, ...brushed]);
  const out = new Set(brushed.map(key));
  return cells.filter((c) => !out.has(key(c)));
}
/** A side moved by whole cells along its outward normal: out (by > 0) a row of cells added along it each, in (by < 0) one taken. */
export function moveSide(cells: readonly V[], side: Side, by: number): V[] {
  const rows: V[] = [];
  for (let k = 1; k <= Math.abs(by); k++) for (const m of side.edges) rows.push(add(add(m, side.out, Math.sign(by) * (k - 0.5)), [-0.5, -0.5]));
  return painted(cells, rows, by > 0);
}
/** A side opened (shut, when it is open): its edges added to the open ones, or taken from them. */
export function toggleSide(open: readonly V[], side: Side): V[] {
  const its = new Set(side.edges.map(key));
  return side.open ? open.filter((m) => !its.has(key(m))) : uniq([...open, ...side.edges]);
}

/**
 * The paint's edit gate: d with the surface given, if it keeps within the
 * Builder's limits (E16) and brings no error the hole did not have (the
 * editor's newErrors); else why not, in the player's words. before: d's own
 * errors, when the caller has them.
 */
export function paintEdit(d: Draft, next: { cells: readonly V[]; open: readonly V[] }, o: ValidateOptions, before?: readonly Issue[]): Draft | { why: string } {
  if (!next.cells.length) return { why: "The hole needs some green." };
  const after = applySurface(d, next), full = pastLimits(d, after), why = full.length ? full : newErrors(before ?? errorsOf(d, o), after, o);
  return why.length ? { why: refusalOf(why[0]) } : after;
}
