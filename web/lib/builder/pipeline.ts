// A draft through every check the builder makes, cheapest first (the
// design's validation pipeline): L0, each piece within its palette entry;
// the hole's extent before it is fitted (E1, E1b); fit, the chain's own
// (a refusal: L2); the editor's checks on the hole as fit gives it, each
// issue named by the draft piece it is about (E2 to E8, E10, E13 to E15);
// the render census (E12); the chain's PublishMine checks (L2), the data's
// size (E9) and its work (E11). The issues are the issues list's; canPlace
// and the board's clamps read the same rules (edit.ts).
import { checkHole, KERB_GAP, work, WORK_WARN, type Issue } from "./checks";
import { explain } from "./explain";
import { BOARD, LIMITS, MARGIN, barCorners, entryParts, frame, writeDraft } from "./gg1";
import { CELL, reach } from "./lane";
import { entry as entryIn, type PaletteEntry, type Range } from "./palette";
import { FIELD } from "./rules";
import type { Draft, Piece, V } from "./draft";
import type { BuilderHost, Cost } from "./wasm";
import type { GHole } from "./types";
import type { Drawn, PieceRef } from "../scene/census";
import type { Hole } from "../scene/data";
import { segDist } from "../terrain";

export interface ValidateOptions {
  host: BuilderHost;
  /** the draft's world's palette */
  palette: readonly PaletteEntry[];
  /** what drew each piece (buildHole's census on HoleState), keyed "wall4", "post0", "zone2p1"; none: E12 not run */
  census?: (s: Hole) => Map<string, Drawn>;
  slug?: string;
  /** the data's size at most (E9): the realm's maxData */
  maxBytes?: number;
  /** the share of a work limit past which E11 warns */
  warnAt?: number;
}
export interface Validated {
  issues: Issue[];
  /** the canonical bytes, once fitted */
  hex?: string;
  hole?: GHole;
  cost?: Cost;
  refs: Map<string, PieceRef[]>;
}

/** The realm's maxData: a version's data at most. */
export const MAX_BYTES = 32 << 10;
const ACROSS = BOARD - 2 * MARGIN;
const pt = (p: V) => `(${+p[0].toFixed(2)}, ${+p[1].toFixed(2)})`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const keyOf = (r: PieceRef) => `${r.set}${r.i}${r.pulse ?? ""}`;
/** A piece's name in a sentence: "the plank bar", "the plain rail". */
export const pieceName = (p: Piece) => {
  const { kind, skin } = entryParts(p.entry);
  return `the ${skin || "plain"} ${kind}`;
};
const err = (rule: Issue["rule"], text: string, p?: Piece, at?: V): Issue => ({ rule, severity: "error", text, ...(p && { piece: p.id }), ...(at && { at }) });

/** A geometry in a sentence. */
const SHAPES = { rail: "a rail", bar: "a bar", post: "a post", rect: "a box", round: "an ellipse", poly: "a polygon" } as const;

/** L0: each piece's entry is its world's, within its ranges and clocks. */
function ranges(d: Draft, palette: readonly PaletteEntry[]): Issue[] {
  const out: Issue[] = [];
  const q = (x: number) => Math.abs(x * 4 - Math.round(x * 4)) < 1e-6, grid = (v: V) => q(v[0] - d.tee[0]) && q(v[1] - d.tee[1]);
  const range = (p: Piece, what: string, v: number, r?: Range) => r && !(v >= r.min - 1e-9 && v <= r.max + 1e-9) && out.push(err("L0", `${cap(pieceName(p))}'s ${what} is ${+v.toFixed(2)}: ${r.min} to ${r.max}`, p));
  for (const p of d.pieces) {
    const e = entryIn(p.entry, palette);
    if (!e) { out.push(err("L0", `${cap(pieceName(p))} is no piece of this world's`, p)); continue; }
    const g = p.geometry;
    // every point on the quarter grid, as the board places them, measured from the tee (framing shifts the
    // whole hole, by a post's rim at times); a radius and a thickness are on their entry's steps
    const at = g.t === "rail" || g.t === "bar" ? [g.a, g.b] : g.t === "post" ? [g.c] : g.t === "poly" ? g.pts : [g.min, g.max];
    if (![...at, ...(p.params.to ? [p.params.to] : [])].every(grid)) { out.push(err("L0", `${cap(pieceName(p))} is off the grid: every point on a quarter`, p)); continue; }
    // its kind's geometry, in a shape its entry takes; a polygon within GG1's points
    const shapes: readonly string[] = e.kind === "rail" || e.kind === "bar" || e.kind === "post" ? [e.kind] : (e.shapes ?? ["rect"]);
    if (!shapes.includes(g.t)) { out.push(err("L0", `${cap(pieceName(p))} cannot be drawn as ${SHAPES[g.t]}`, p)); continue; }
    if (g.t === "poly" && (g.pts.length < 3 || g.pts.length > LIMITS.poly)) { out.push(err("L0", `${cap(pieceName(p))}'s outline has ${g.pts.length} points: ${g.pts.length < 3 ? "at least 3" : `at most ${LIMITS.poly}`}`, p)); continue; }
    if (g.t === "post") range(p, "radius", g.r, e.size);
    else if (g.t === "rail" || g.t === "bar") range(p, "length", Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]), e.size);
    else if (g.t !== "poly") (range(p, "side", g.max[0] - g.min[0], e.size), range(p, "side", g.max[1] - g.min[1], e.size));
    if (g.t === "bar") range(p, "thickness", g.thick, e.thick);
    if (p.params.bounce !== undefined) range(p, "bounce", p.params.bounce, e.bounce);
    if (p.params.scale !== undefined) range(p, "grip", p.params.scale, e.scale);
    if (p.params.grade !== undefined) range(p, "grade", p.params.grade, e.grade);
    if (!e.clocks.includes(p.clock.k)) out.push(err("L0", `${cap(pieceName(p))} cannot be ${p.clock.k === "fixed" ? "fixed" : p.clock.k === "substep" ? "timed within a stroke" : "in a pulse"}`, p));
  }
  if (!grid(d.pin)) out.push(err("L0", "The cup is off the grid: every point on a quarter"));
  return out;
}

/** E1 and E1b, before fit: the hole's extent fits the board, every point lies on it once fitted, no bar sets its low edge. */
function extent(d: Draft): Issue[] {
  const out: Issue[] = [];
  let lo: V = [Infinity, Infinity], hi: V = [-Infinity, -Infinity];
  const grow = (p: V, r = 0) => ((lo = [Math.min(lo[0], p[0] - r), Math.min(lo[1], p[1] - r)]), (hi = [Math.max(hi[0], p[0] + r), Math.max(hi[1], p[1] + r)]));
  for (const p of d.pieces) {
    const g = p.geometry;
    if (g.t === "rail") grow(g.a), grow(g.b);
    else if (g.t === "post") grow(g.c, g.r);
  }
  grow(d.tee), grow(d.pin);
  const grid = { lo, hi };
  for (const p of d.pieces) if (p.geometry.t === "bar") for (const c of barCorners(p.geometry.a, p.geometry.b, p.geometry.thick)) grow(c);
  const across = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  if (across > ACROSS + 1e-9) out.push(err("E1", `The hole is ${+across.toFixed(2)} across: at most ${ACROSS} between its outermost pieces`));
  const off = (q: V) => q[0] < lo[0] - MARGIN || q[1] < lo[1] - MARGIN || q[0] > hi[0] + MARGIN || q[1] > hi[1] + MARGIN;
  for (const p of d.pieces) {
    const g = p.geometry;
    if (p.params.to && off(p.params.to)) out.push(err("E1", `${cap(pieceName(p))} comes out at ${pt(p.params.to)}, off the board once the hole is fitted`, p, p.params.to));
    if (g.t === "poly") { const q = g.pts.find(off); if (q) out.push(err("E1", `${cap(pieceName(p))}'s point at ${pt(q)} lies off the board once the hole is fitted`, p, q)); }
    if (g.t === "bar" && barCorners(g.a, g.b, g.thick).some((c) => c[0] < grid.lo[0] - 1e-9 || c[1] < grid.lo[1] - 1e-9)) {
      out.push(err("E1b", `${cap(pieceName(p))} reaches past the hole's outermost rail, post, tee or cup: bring it in`, p, g.a));
    }
  }
  return out;
}

/** Whether segments cross at a point inside both. */
function crosses(a: V, b: V, c: V, e: V) {
  const o = (p: V, q: V, r: V) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, e, a), d2 = o(c, e, b), d3 = o(a, b, c), d4 = o(a, b, e), t = 1e-9;
  return ((d1 > t && d2 < -t) || (d1 < -t && d2 > t)) && ((d3 > t && d4 < -t) || (d3 < -t && d4 > t));
}
const segSeg = (a: V, b: V, c: V, e: V) => (crosses(a, b, c, e) ? 0 : Math.min(segDist(a[0], a[1], c, e), segDist(b[0], b[1], c, e), segDist(c[0], c[1], a, b), segDist(e[0], e[1], a, b)));

/** The draft's own rules on its bars: out of the lane (E10), crossing another bar (E13), against a rail (E15). */
function bars(d: Draft, h: GHole, palette: readonly PaletteEntry[], refs: Map<string, PieceRef[]>): Issue[] {
  const out: Issue[] = [], { reaches } = reach(h, h.ballR - CELL * Math.SQRT1_2);
  const barList = d.pieces.filter((p): p is Piece & { geometry: { t: "bar"; a: V; b: V; thick: number } } => p.geometry.t === "bar" && p.clock.k !== "stroke");
  const rails = d.pieces.filter((p) => p.geometry.t === "rail" && p.clock.k === "fixed");
  const edges = (p: (typeof barList)[number]) => { const c = barCorners(p.geometry.a, p.geometry.b, p.geometry.thick); return c.map((q, k): [V, V] => [q, c[(k + 1) % 4]]); };
  barList.forEach((p, i) => {
    const g = p.geometry, mid: V = [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2];
    if (!reaches(mid, Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / 2 + g.thick + h.ballR + CELL)) out.push(err("E10", `${cap(pieceName(p))} at ${pt(mid)} is outside the lane: no ball reaches it`, p, mid));
    for (const q of barList.slice(i + 1)) {
      const may = entryIn(p.entry, palette)?.overlaps?.includes("wall") || entryIn(q.entry, palette)?.overlaps?.includes("wall");
      if (!may && edges(p).some(([a, b]) => edges(q).some(([c, e]) => crosses(a, b, c, e)))) out.push({ ...err("E13", `${cap(pieceName(p))} crosses ${pieceName(q)} at ${pt(mid)}`, p, mid), also: refs.get(q.id) ?? [] });
    }
    for (const r of rails) {
      if (r.geometry.t !== "rail") continue;
      const ra = r.geometry.a, rb = r.geometry.b;
      const gap = Math.min(...edges(p).map(([a, b]) => segSeg(a, b, ra, rb)));
      if (gap > 0 && gap < KERB_GAP - 1e-9) out.push(err("E15", `${cap(pieceName(p))} is ${+gap.toFixed(2)} from ${pieceName(r)}: at least ${KERB_GAP}, or the kerb swallows it`, p, mid));
    }
  });
  return out;
}

/** E12: what drew each piece is its entry's own drawing (the census). */
function drawnAs(d: Draft, refs: Map<string, PieceRef[]>, palette: readonly PaletteEntry[], said: Map<string, Drawn>): Issue[] {
  const out: Issue[] = [];
  for (const p of d.pieces) {
    const e = entryIn(p.entry, palette), rs = refs.get(p.id) ?? [];
    if (!e) continue;
    const at = p.geometry.t === "post" ? p.geometry.c : p.geometry.t === "rail" || p.geometry.t === "bar" ? p.geometry.a : p.geometry.t === "poly" ? p.geometry.pts[0] : p.geometry.min;
    for (const r of rs) {
      const s = said.get(keyOf(r));
      if (!s) continue;
      const why = s.by === "hidden" ? `is not drawn (${s.why === "sea" ? "out in the sea" : s.why === "unreached" ? "out of every ball's reach" : s.why === "timed" ? "a timed wall alone" : "it has no area"})`
        : s.by === "tram" ? "is drawn as part of a tram line"
        : e.kind === "rail" && s.by === "bar" ? "is drawn as part of a bar: give it room from the other rails"
        : e.kind === "bar" && s.by !== "bar" ? (s.by === "kerb" ? "is drawn as part of the kerb: move it off the rail" : "is not read as a bar")
        : !e.plain && (s.by === "fallback" || (s.by === "bar" && s.draw === "fallback")) ? "is drawn as the plain form, not as itself"
        : "";
      if (why) { out.push(err("E12", `${cap(pieceName(p))} at ${pt(at)} ${why}`, p, at)); break; }
    }
  }
  return out;
}

/**
 * Every check the builder makes of a draft, errors first; a layer runs only
 * once the ones before it pass. The draft is judged framed (gg1.ts frame:
 * as the editor keeps it), so a piece moved past the hole's low edge is
 * judged where the hole will put it.
 */
export function validate(draft: Draft, o: ValidateOptions): Validated {
  const { host, palette } = o, d = frame(draft);
  const l0 = ranges(d, palette);
  const { hex, bars: barLines, refs } = writeDraft(d, FIELD[d.world]);
  if (l0.length) return { issues: l0, refs };
  const e1 = extent(d);
  if (e1.length) return { issues: e1, refs };
  const f = host.fit(hex, barLines);
  if (!f.ok) return { issues: [{ rule: "L2", severity: "error", text: explain(f.why) }], refs };
  const h = host.decode(f.hex);
  // the hole's pieces back to the draft's
  const byRef = new Map<string, Piece>();
  for (const p of d.pieces) for (const r of refs.get(p.id) ?? []) byRef.set(keyOf(r), p);
  const name = (r: PieceRef) => (byRef.has(keyOf(r)) ? pieceName(byRef.get(keyOf(r))!) : `a piece`);
  const entryOf = (r: PieceRef) => { const p = byRef.get(keyOf(r)); return p ? entryIn(p.entry, palette) : undefined; };
  const seen = new Set<string>(), issues: Issue[] = [];
  for (const i of [...checkHole(h, { name, entryOf }), ...bars(d, h, palette, refs)]) {
    const p = i.ref ? byRef.get(keyOf(i.ref)) : undefined, piece = i.piece ?? p?.id;
    const k = `${i.rule} ${piece} ${i.text}`;
    if (!seen.has(k)) seen.add(k), issues.push({ ...i, ...(piece && { piece }) });
  }
  if (o.census) {
    host.load(DRAFT_ID, f.hex);
    host.setperiod(1);
    issues.push(...drawnAs(d, refs, palette, o.census(JSON.parse(host.state(DRAFT_ID)) as Hole)));
  }
  const bytes = f.hex.length / 2;
  if (bytes > (o.maxBytes ?? MAX_BYTES)) issues.push(err("E9", `The hole is ${bytes} bytes of data: at most ${o.maxBytes ?? MAX_BYTES}`));
  const c = host.check(o.slug || "draft", f.hex, d.note);
  if (!c.ok) issues.push({ rule: "L2", severity: "error", text: explain(c.why) });
  else {
    const w = work(c.cost, o.warnAt ?? WORK_WARN);
    issues.push(...w.issues);
  }
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  return { issues, hex: f.hex, hole: h, ...(c.ok && { cost: c.cost }), refs };
}

/** Whether an issue is about a draft piece: named for it, or for another piece it meets (also). */
export function about(i: Issue, id: string, refs: Map<string, PieceRef[]>): boolean {
  if (i.piece === id) return true;
  const mine = new Set((refs.get(id) ?? []).map(keyOf));
  return !!i.also?.some((r) => mine.has(keyOf(r)));
}

/** The id a draft is shown under in the builder's own wasm (its test mode has its real one). */
const DRAFT_ID = "draft/v1";
