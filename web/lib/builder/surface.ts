// The green painted (the board's Grow and Shrink): the ground as unit cells
// on the hole's own lattice (their corners where its rails meet), kept in
// the draft beside the pieces (draft.ts surface; never in the bytes), and
// walled by itself: its outline traced, interior on the right, each straight
// run between its corners one plain rail ("*\/rail/"), the sides left open
// none. No corner post, no diagonal: the rails are ordinary pieces, the
// chain sees nothing else. A hole that has none yet is read from its rails
// (surfaceOf: a starter, an older draft, a published hole walled plainly).
// The green's own rails are found, never stored: a plain fixed rail exactly
// on a run of its outline. One moved, cut, timed or taken away by hand is the
// author's from then on: its run left alone (hand), never walled again over
// it. Every edit goes through the editor's gate (edit.ts gate), which asks
// narrowed too: no way of the green narrower than MIN_WIDE.
import type { Issue } from "./checks";
import { nextId, type Draft, type Piece, type Surface, type V } from "./draft";
import { frame } from "./gg1";

export type { Surface };
/** The rail a painted side is walled with. */
export const SURFACE_RAIL = "*/rail/";
/** The brush: a square this many cells a side, round the pointer (the narrowest green that plays: a click a bump that stands) */
export const BRUSH = 3;
/** The green's narrowest way, in cells: three balls across (the ball is 1). */
export const MIN_WIDE = 3;
/** The paint's two ways. */
export type PaintMode = "grow" | "shrink";
/** Why a hole cannot be painted, as a next step (said where the tool is asked for). */
export const PAINT_OFF = "This hole was walled by hand: move its walls one by one, or start from a template to paint its green.";
/** Why a side cannot open (said when it is clicked). */
export const SIDE_LOCKED = "Put water along this side to open it.";
/** Why a side cannot be moved or opened: a wall of the author's on it. */
export const SIDE_HAND = "A wall placed by hand is on this side: move that wall on its own.";

/** A straight run of the outline, corner to corner: its ends (interior on the right of a→b), its outward normal, its unit edges' middles, whether every one is open, and whether one is the author's (hand). */
export interface Side {
  a: V;
  b: V;
  out: V;
  edges: V[];
  open: boolean;
  hand: boolean;
}
/** The green as it stands in a draft: its cells, its open edges, the edges of the author's rails (hand), its own rails (ids) and its sides. */
export interface Green {
  cells: V[];
  open: V[];
  hand: V[];
  ids: string[];
  sides: Side[];
}

/** To a millionth (a lattice's float noise kept out of the draft: every lattice point is made through it, add too). */
export const r6 = (x: number) => +x.toFixed(6) + 0;
const key = (v: V) => `${v[0]} ${v[1]}`;
const add = (a: V, b: V, k = 1): V => [r6(a[0] + b[0] * k), r6(a[1] + b[1] * k)];
const STEPS: readonly V[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const sameRail = (p: Piece, a: V, b: V) => {
  const g = p.geometry;
  return g.t === "rail" && ((key(g.a) === key(a) && key(g.b) === key(b)) || (key(g.a) === key(b) && key(g.b) === key(a)));
};
/** A green's own rail: plain, fixed, from a to b (the one piece the green is walled with: a starter's, from scratch's, a stroke's). */
export const railPiece = (id: string, a: V, b: V): Piece => ({ id, entry: SURFACE_RAIL, geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });
/** A rail the green may own: plain, fixed (a run of its outline exactly, as it puts them). */
export const isPlainRail = (p: Piece) => p.entry === SURFACE_RAIL && p.geometry.t === "rail" && p.clock.k === "fixed";
/** Points once each (the first of each place). */
export const uniq = (vs: readonly V[]) => [...new Map(vs.map((v) => [key(v), v])).values()];

/** The lattice's offset (in 0..1): its first point's. */
const mod1 = (x: number) => r6(x - Math.floor(x));
const originOf = (pts: readonly V[]): V => (pts.length ? [mod1(pts[0][0]), mod1(pts[0][1])] : [0, 0]);

/**
 * The outline of cells (each its low corner, a unit square): its loops, each
 * traced with the inside on the right (on the board, y down: clockwise round
 * the green), from its top-left corner along +x, and cut into its straight
 * sides, open where every edge is in open. Cells touching at a corner only
 * are kept apart (a right turn there).
 */
export function outline(cells: readonly V[], open: readonly V[] = [], hand: readonly V[] = []): Side[] {
  const has = new Set(cells.map(key));
  type Edge = { from: V; to: V; dir: V; mid: V };
  const from = new Map<string, Edge[]>(), all: Edge[] = [];
  const edge = (a: V, dir: V) => {
    const e = { from: a, to: add(a, dir), dir, mid: add(a, dir, 0.5) }, k = key(a), at = from.get(k);
    all.push(e);
    if (at) at.push(e);
    else from.set(k, [e]);
  };
  for (const c of cells) {
    const [x, y] = c;
    if (!has.has(key(add(c, [0, -1])))) edge([x, y], [1, 0]);
    if (!has.has(key(add(c, [1, 0])))) edge(add(c, [1, 0]), [0, 1]);
    if (!has.has(key(add(c, [0, 1])))) edge(add(c, [1, 1]), [-1, 0]);
    if (!has.has(key(add(c, [-1, 0])))) edge(add(c, [0, 1]), [0, -1]);
  }
  all.sort((p, q) => p.from[1] - q.from[1] || p.from[0] - q.from[0]);
  const used = new Set<Edge>(), sides: Side[] = [];
  for (let i = 0; i < all.length; i++) {
    const start = all[i];
    if (used.has(start)) continue;
    const loop: Edge[] = [];
    for (let e: Edge | undefined = start; e && !used.has(e); ) {
      used.add(e), loop.push(e);
      const next: Edge[] = (from.get(key(e.to)) ?? []).filter((n) => !used.has(n) || n === start), right: V = [-e.dir[1], e.dir[0]];
      e = next.find((n) => n.dir[0] === right[0] && n.dir[1] === right[1]) ?? next[0];
    }
    // (its first edge leaves a corner: each side a run of edges one way)
    let side: Side | null = null;
    for (const e of loop) {
      if (side && side.out[0] === e.dir[1] && side.out[1] === -e.dir[0]) (side.b = e.to), side.edges.push(e.mid);
      else sides.push((side = { a: e.from, b: e.to, out: [e.dir[1], -e.dir[0]], edges: [e.mid], open: false, hand: false }));
    }
  }
  return marked(sides, open, hand);
}
/** Sides marked open (every edge in open) and the author's (an edge in hand). */
const marked = (sides: readonly Side[], open: readonly V[], hand: readonly V[]): Side[] => {
  const o = new Set(open.map(key)), h = new Set(hand.map(key));
  return sides.map((s) => ({ ...s, open: s.edges.every((m) => o.has(key(m))), hand: s.edges.some((m) => h.has(key(m))) }));
};

/** The rails an outline is walled with: each side's runs of edges not skipped (open, the author's), one rail each, in the outline's order. sides: the cells' outline, when traced already. */
export function railsOf(cells: readonly V[], skip: readonly V[], sides: readonly Side[] = outline(cells)): { a: V; b: V }[] {
  const skipped = new Set(skip.map(key)), out: { a: V; b: V }[] = [];
  for (const s of sides) {
    const d: V = [Math.sign(s.b[0] - s.a[0]), Math.sign(s.b[1] - s.a[1])];
    let run: V | null = null;
    s.edges.forEach((m, i) => {
      const lo = add(m, d, -0.5), hi = add(m, d, 0.5), gap = skipped.has(key(m));
      if (!gap) run ??= lo;
      if (run && (gap || i === s.edges.length - 1)) out.push({ a: run, b: gap ? lo : hi }), (run = null);
    });
  }
  return out;
}

/** A rail's unit edges' middles. */
const unitsOf = (a: V, b: V): V[] => {
  const n = Math.round(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])), d: V = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
  return Array.from({ length: n }, (_, i) => add(a, d, i + 0.5));
};
/** Whether the point lies on a rail's line (an author's rail over an edge). */
const onRail = (p: Piece, m: V) => {
  const g = p.geometry;
  if (g.t !== "rail") return false;
  const [ax, ay] = g.a, [bx, by] = g.b, cross = (bx - ax) * (m[1] - ay) - (by - ay) * (m[0] - ax);
  return Math.abs(cross) < 1e-6 && Math.min(ax, bx) - 1e-6 <= m[0] && m[0] <= Math.max(ax, bx) + 1e-6 && Math.min(ay, by) - 1e-6 <= m[1] && m[1] <= Math.max(ay, by) + 1e-6;
};

/** The hole's surface: the one painted, else the one its rails make (surfaceOf); null if neither. */
export const surfaceIn = (d: Draft): Surface | null => d.surface ?? surfaceOf(d);

/**
 * The green as it stands in d (null: it has none to paint): its own rails (a
 * plain fixed rail exactly on a run, each once), its open edges (those kept
 * open, and those whose rail was taken away), and the author's (an edge a
 * rail not its own lies on: moved, cut, timed). Nothing in d changes.
 */
export function owned(d: Draft): Green | null {
  const s = surfaceIn(d);
  if (!s) return null;
  const traced = outline(s.cells), edges = new Set(traced.flatMap((x) => x.edges.map(key)));
  const open = s.open.filter((m) => edges.has(key(m))), plain = d.pieces.filter(isPlainRail), ids: string[] = [], hand: V[] = [];
  for (const r of railsOf(s.cells, open, traced)) {
    const p = plain.find((q) => !ids.includes(q.id) && sameRail(q, r.a, r.b));
    if (p) ids.push(p.id);
    else for (const m of unitsOf(r.a, r.b)) (d.pieces.some((q) => onRail(q, m)) ? hand : open).push(m);
  }
  return { cells: s.cells, open, hand, ids, sides: marked(traced, open, hand) };
}

/**
 * d with the green given (cells, open edges): its own rails replaced by its
 * outline's, every other piece as it is (the author's runs never walled). A
 * rail kept where it was keeps its name and its look; a new one takes a freed
 * name, then a fresh one; one already there (a bank on the new outline) is
 * not laid twice. Its rails first, as a starter has them; framed. was: d's
 * green (owned), when the caller has it.
 */
export function applySurface(d: Draft, next: { cells: readonly V[]; open: readonly V[] }, was: Green | null = owned(d)): Draft {
  const mineIds = new Set(was?.ids ?? []), traced = outline(next.cells), edges = new Set(traced.flatMap((s) => s.edges.map(key)));
  const open = uniq(next.open.filter((m) => edges.has(key(m)))), hand = (was?.hand ?? []).filter((m) => edges.has(key(m)));
  const mine = d.pieces.filter((p) => mineIds.has(p.id)), rest = d.pieces.filter((p) => !mineIds.has(p.id));
  const free = mine.map((p) => p.id), want = railsOf(next.cells, [...open, ...hand], traced);
  const kept = want.map((r) => mine.find((p) => sameRail(p, r.a, r.b)));
  for (const p of kept) if (p) free.splice(free.indexOf(p.id), 1);
  const rails: Piece[] = [];
  want.forEach((r, i) => {
    if (kept[i]) return void rails.push(kept[i]);
    if (rest.some((p) => isPlainRail(p) && sameRail(p, r.a, r.b))) return;
    rails.push(railPiece(free.shift() ?? nextId({ pieces: [...d.pieces, ...rails] }), r.a, r.b));
  });
  const cells = uniq(next.cells).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return frame({ ...d, pieces: [...rails, ...rest], surface: { cells, open } });
}

/**
 * A hole's surface from its rails (a starter's, a plain hand-walled one): the
 * cells inside its plain fixed rails, if their outline is exactly those rails
 * (on one unit lattice, no diagonal, no rail inside); null otherwise.
 */
export function surfaceOf(d: Draft): Surface | null {
  const rails = d.pieces.filter(isPlainRail), segs = rails.map((p) => p.geometry as { t: "rail"; a: V; b: V });
  if (!segs.length || segs.some((g) => g.a[0] !== g.b[0] && g.a[1] !== g.b[1])) return null;
  const ends = segs.flatMap((g) => [g.a, g.b]), o = originOf(ends);
  if (ends.some((v) => mod1(v[0]) !== o[0] || mod1(v[1]) !== o[1])) return null;
  const xs = ends.map((v) => v[0]), ys = ends.map((v) => v[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), cells: V[] = [];
  // (each cell from the low corner by whole steps, to a millionth: no float drift across the lattice)
  for (let j = 0; j < Math.round(Math.max(...ys) - y0); j++) {
    for (let i = 0; i < Math.round(Math.max(...xs) - x0); i++) {
      // inside: an odd number of upright rails crossed from the cell's middle out to +x
      const x = r6(x0 + i), y = r6(y0 + j), cx = x + 0.5, cy = y + 0.5;
      const n = segs.filter((g) => g.a[0] === g.b[0] && g.a[0] > cx && Math.min(g.a[1], g.b[1]) < cy && Math.max(g.a[1], g.b[1]) > cy).length;
      if (n % 2) cells.push([x, y]);
    }
  }
  const want = railsOf(cells, []);
  return want.length === rails.length && want.every((r) => rails.some((p) => sameRail(p, r.a, r.b))) ? { cells, open: [] } : null;
}

/** The cells under the brush at a board point: BRUSH a side, on the surface's lattice, round the pointer. */
export function brushAt(at: V, cells: readonly V[]): V[] {
  const o = originOf(cells), h = BRUSH / 2, out: V[] = [];
  const x0 = Math.round(at[0] - o[0] - h) + o[0], y0 = Math.round(at[1] - o[1] - h) + o[1];
  for (let j = 0; j < BRUSH; j++) for (let i = 0; i < BRUSH; i++) out.push([r6(x0 + i), r6(y0 + j)]);
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
/** A side moved by whole cells along its outward normal (out, by > 0: a row of cells added along it each; in, by < 0: one taken), its open edges with it. */
export function moveSide(g: { cells: readonly V[]; open: readonly V[] }, side: Side, by: number): { cells: V[]; open: V[] } {
  const rows: V[] = [];
  for (let k = 1; k <= Math.abs(by); k++) for (const m of side.edges) rows.push(add(add(m, side.out, Math.sign(by) * (k - 0.5)), [-0.5, -0.5]));
  const its = new Set(side.edges.map(key)), was = g.open.filter((m) => its.has(key(m)));
  return { cells: painted(g.cells, rows, by > 0), open: [...g.open.filter((m) => !its.has(key(m))), ...was.map((m) => add(m, side.out, by))] };
}
/** A side opened (shut, when it is open): its edges added to the open ones, or taken from them. */
export function toggleSide(open: readonly V[], side: Side): V[] {
  const its = new Set(side.edges.map(key));
  return side.open ? open.filter((m) => !its.has(key(m))) : uniq([...open, ...side.edges]);
}

/** Cells' parts (4-neighbours joined): each cell's part, and how many. */
function partsOf(cells: readonly V[]): { of: Map<string, number>; n: number } {
  const has = new Set(cells.map(key)), of = new Map<string, number>();
  let n = 0;
  for (const c of cells) {
    if (of.has(key(c))) continue;
    const stack = [c];
    of.set(key(c), n);
    while (stack.length) {
      const u = stack.pop()!;
      for (const s of STEPS) {
        const w = add(u, s), k = key(w);
        if (has.has(k) && !of.has(k)) of.set(k, n), stack.push(w);
      }
    }
    n++;
  }
  return { of, n };
}
/**
 * How narrow cells are: the cells no MIN_WIDE square of them covers (a way,
 * a nook narrower than that), the squares' parts beyond one in a part of
 * the green (two rooms a way that narrow joins, or none), and the green's
 * parts (one cut in two: an island apart). 0: never narrower.
 */
export function narrowness(cells: readonly V[]): { bare: number; split: number; parts: number } {
  const has = new Set(cells.map(key)), W = MIN_WIDE, within = (c: V) => Array.from({ length: W * W }, (_, i) => add(c, [i % W, Math.floor(i / W)]));
  const squares = cells.filter((c) => within(c).every((v) => has.has(key(v)))), covered = new Set(squares.flatMap(within).map(key));
  const green = partsOf(cells), rooms = partsOf(squares);
  return { bare: cells.filter((c) => !covered.has(key(c))).length, split: rooms.n - new Set(squares.map((c) => green.of.get(key(c)))).size, parts: green.n };
}
/** Why a green may not become now from was (the gate's): none left, cut in more parts than it was (an island no ball reaches), or narrower somewhere than it was (MIN_WIDE). */
export function narrowed(was: Surface | null, now: Surface): Issue[] {
  const issue = (text: string): Issue[] => [{ rule: "E14", severity: "error", text }];
  if (!now.cells.length) return issue("The hole needs some green");
  const a = was ? narrowness(was.cells) : { bare: 0, split: 0, parts: 1 }, b = narrowness(now.cells);
  if (b.parts > a.parts) return issue("This cuts the green in two: keep it in one piece");
  return b.bare > a.bare || b.split > a.split ? issue(`This leaves the green too narrow to play: keep it at least ${MIN_WIDE} wide`) : [];
}
