// A draft through every check the builder makes, cheapest first (the
// design's validation pipeline): L0, each piece within its palette entry;
// the hole's extent before it is fitted (E1, E1b); fit, the chain's own
// (a refusal: L2); the editor's checks on the hole as fit gives it, each
// issue named by the draft piece it is about (E2 to E8, E10, E13 to E15);
// the Builder's own piece limits (E16);
// the render census (E12); the chain's PublishMine checks (L2), the data's
// size (E9) and its work (E11). The issues are the issues list's; canPlace
// and the board's clamps read the same rules (edit.ts).
import { checkHole, KERB_GAP, LOOSE, work, WORK_WARN, type Issue } from "./checks";
import { explain } from "./explain";
import { BOARD, LIMITS, MARGIN, barCorners, frame, keyOf, piecesBy, writeDraft } from "./gg1";
import { pieceName } from "./names";
import { CELL, reach } from "./lane";
import { entry as entryIn, type PaletteEntry, type Range } from "./palette";
import { cap, FIELD, pt } from "./rules";
import { builderLimits } from "./limits";
import { onGrid, shapeOfPiece, type Draft, type Piece, type V } from "./draft";
import type { BuilderHost, Cost } from "./wasm";
import type { GHole } from "./types";
import type { Drawn, PieceRef } from "../scene/census";
import type { Hole } from "../scene/data";
import { inZone, segDist } from "../terrain";

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
  /** false: no trap search (E17's lane.ts traps, the dearest check): the editor's quick checks, a ghost's and a drag's
   *  clamp, made many times a gesture; whatever is kept is judged with it (the full checks: dropMove, gate) */
  traps?: boolean;
}
/** The render census as an opened hole is always judged with (drawn.ts census). */
export type Census = NonNullable<ValidateOptions["census"]>;
export interface Validated {
  issues: Issue[];
  /** the canonical bytes, once fitted */
  hex?: string;
  hole?: GHole;
  cost?: Cost;
  refs: Map<string, PieceRef[]>;
  /** the hole as players get it (the realm's HoleState of the bytes, at period 1): read for the census, drawn by the preview */
  state?: Hole;
}

/** The realm's maxData: a version's data at most. */
export const MAX_BYTES = 32 << 10;
const ACROSS = BOARD - 2 * MARGIN;
const err = (rule: Issue["rule"], text: string, p?: Piece, at?: V): Issue => ({ rule, severity: "error", text, ...(p && { piece: p.id }), ...(at && { at }) });

/** A geometry in a sentence. */
const SHAPES = { rail: "a rail", bar: "a bar", post: "a post", rect: "a box", round: "an ellipse", poly: "a polygon" } as const;

/** L0: each piece's entry is its world's, within its ranges and clocks. */
function ranges(d: Draft, palette: readonly PaletteEntry[]): Issue[] {
  const out: Issue[] = [];
  const grid = (v: V) => onGrid(v[0], d.tee[0]) && onGrid(v[1], d.tee[1]);
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
/** Whether a point lies strictly inside a convex outline (its edges, in order). */
const within = (q: V, sides: readonly [V, V][]) => {
  const s = sides.map(([a, b]) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
  return s.every((x) => x > 1e-9) || s.every((x) => x < -1e-9);
};
const segSeg = (a: V, b: V, c: V, e: V) => (crosses(a, b, c, e) ? 0 : Math.min(segDist(a[0], a[1], c, e), segDist(b[0], b[1], c, e), segDist(c[0], c[1], a, b), segDist(e[0], e[1], a, b)));

/** A draft's bar, once: the piece, its corners (build.Bar's), its sides in order, its middle. */
type Bar = { p: Piece & { geometry: { t: "bar"; a: V; b: V; thick: number } }; c: V[]; sides: [V, V][]; mid: V };
const barsOf = (d: Draft): Bar[] =>
  d.pieces.flatMap((p) => {
    if (p.geometry.t !== "bar") return [];
    const g = p.geometry, c = barCorners(g.a, g.b, g.thick);
    return [{ p: p as Bar["p"], c, sides: c.map((q, k): [V, V] => [q, c[(k + 1) % 4]]), mid: [(g.a[0] + g.b[0]) / 2, (g.a[1] + g.b[1]) / 2] as V }];
  });
/** A draft's fixed rails. */
const railsOf = (d: Draft) => d.pieces.filter((p): p is Piece & { geometry: { t: "rail"; a: V; b: V } } => p.geometry.t === "rail" && p.clock.k === "fixed");
/** Whether the palette lets p lie on or in q (as: q's kind as overlaps names it, "wall" a rail's or a bar's), or q on p. */
const mayOverlap = (palette: readonly PaletteEntry[]) => (p: Piece, q: Piece, as: string) => {
  const kp = entryIn(p.entry, palette)?.kind;
  return !!entryIn(p.entry, palette)?.overlaps?.includes(as) || !!entryIn(q.entry, palette)?.overlaps?.includes(kp === "rail" || kp === "bar" ? "wall" : kp ?? "");
};

/** The draft's own rules on its bars: out of the lane (E10), crossing another bar (E13), against a rail (E15). */
function bars(d: Draft, h: GHole, palette: readonly PaletteEntry[], refs: Map<string, PieceRef[]>, all: readonly Bar[]): Issue[] {
  const out: Issue[] = [], { reaches } = reach(h, LOOSE(h)), may = mayOverlap(palette);
  const barList = all.filter(({ p }) => p.clock.k !== "stroke"), rails = railsOf(d);
  barList.forEach(({ p, sides, mid }, i) => {
    const g = p.geometry;
    if (!reaches(mid, Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]) / 2 + g.thick + h.ballR + CELL)) out.push(err("E10", `${cap(pieceName(p))} at ${pt(mid)} is outside the lane: no ball reaches it`, p, mid));
    for (const q of barList.slice(i + 1)) {
      if (!may(p, q.p, "wall") && sides.some(([a, b]) => q.sides.some(([c, e]) => crosses(a, b, c, e)))) out.push({ ...err("E13", `${cap(pieceName(p))} crosses ${pieceName(q.p)} at ${pt(mid)}`, p, mid), also: refs.get(q.p.id) ?? [] });
    }
    const onRails = entryIn(p.entry, palette)?.overlaps?.includes("wall");
    for (const r of rails) {
      const ra = r.geometry.a, rb = r.geometry.b;
      // a rail run through the bar, or lying under it whole
      if (!onRails && (sides.some(([a, b]) => crosses(a, b, ra, rb)) || within(ra, sides) || within(rb, sides))) {
        out.push({ ...err("E13", `${cap(pieceName(p))} crosses ${pieceName(r)} at ${pt(mid)}`, p, mid), also: refs.get(r.id) ?? [] });
        continue;
      }
      const gap = Math.min(...sides.map(([a, b]) => segSeg(a, b, ra, rb)));
      if (gap > 0 && gap < KERB_GAP - 1e-9) out.push(err("E15", `${cap(pieceName(p))} is ${+gap.toFixed(2)} from ${pieceName(r)}: at least ${KERB_GAP}, or the kerb swallows it`, p, mid));
    }
  });
  return out;
}

/**
 * The draft's own rules on what its bars, rails and tunnels meet, of any clock:
 * E6, a tunnel let out inside a bar (the ball would rest in the solid); E13,
 * two rails crossing or lying along one another (their kerbs drawn twice), a
 * post standing inside a bar, a bar over a tunnel's mouth. A pairing the
 * palette allows (overlaps) is fine. (A rail may stand in water or a mouth: a
 * pier, a wall across a pond, a cave set in a wall; the ground comes up to
 * meet it, terrain.ts pools' walls. A bar that comes back by water: E17,
 * checks.ts, on its four walls.)
 */
function meets(d: Draft, palette: readonly PaletteEntry[], refs: Map<string, PieceRef[]>, all: readonly Bar[]): Issue[] {
  const out: Issue[] = [], kindOf = (p: Piece) => entryIn(p.entry, palette)?.kind, may = mayOverlap(palette);
  const meet = (p: Piece, what: string, q: Piece, at: V) => out.push({ ...err("E13", `${cap(pieceName(p))} ${what} ${pieceName(q)} at ${pt(at)}`, p, at), also: refs.get(q.id) ?? [] });
  for (const t of d.pieces) {
    const v = t.params.to;
    if (!v || kindOf(t) !== "tunnel") continue;
    const bar = all.find(({ sides }) => within(v, sides));
    if (bar) out.push(err("E6", `${cap(pieceName(t))} comes out at ${pt(v)}, inside ${pieceName(bar.p)}`, t, v));
  }
  for (const { p, c, sides, mid } of all) {
    for (const q of d.pieces) {
      if (q.geometry.t === "post" && within(q.geometry.c, sides) && !may(q, p, "wall")) meet(q, "stands on", p, q.geometry.c);
      const s = kindOf(q) === "tunnel" && shapeOfPiece(q.geometry);
      if (s && !may(p, q, "tunnel")) {
        const lo = [Math.max(s.min[0], Math.min(...c.map((r) => r[0]))), Math.max(s.min[1], Math.min(...c.map((r) => r[1])))], hi = [Math.min(s.max[0], Math.max(...c.map((r) => r[0]))), Math.min(s.max[1], Math.max(...c.map((r) => r[1])))];
        let over = false; // (sampled where the bar's box and the mouth's meet)
        for (let x = lo[0]; x <= hi[0] && !over; x += CELL / 2) for (let y = lo[1]; y <= hi[1] && !over; y += CELL / 2) over = within([x, y], sides) && inZone(s, x, y);
        if (over) meet(p, "lies over", q, mid);
      }
    }
  }
  const rails = railsOf(d);
  rails.forEach((r, i) => {
    const { a, b } = r.geometry, l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const q of rails.slice(i + 1)) {
      const { a: c, b: e } = q.geometry;
      if (crosses(a, b, c, e)) meet(r, "crosses", q, a);
      else {
        // along one another: on one line, sharing more than a point
        const side = (p: V) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]), at = (p: V) => ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (l * l);
        if (Math.abs(side(c)) < 1e-9 && Math.abs(side(e)) < 1e-9 && Math.min(1, Math.max(at(c), at(e))) - Math.max(0, Math.min(at(c), at(e))) > 1e-6) meet(r, "lies over", q, c);
      }
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
      const why = s.by === "hidden" && s.why === "view" ? "would stand between the player's camera and the ball or the cup, its ice tower in the way: move it where nothing of the lane is behind its tower"
        : s.by === "hidden" && s.why === "room" ? "has no room beside the lane for what stands by it (a cannon, an ice tower): leave it some room off the lane"
        : s.by === "hidden" ? `is not drawn (${s.why === "sea" ? "out in the sea" : s.why === "unreached" ? "out of every ball's reach" : s.why === "timed" ? "a timed wall alone" : "it has no area"})`
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
 * judged where the hole will put it. A draft (never changed once made: an
 * edit makes a new one) is checked once for each options: an edit's own
 * check is the next edit's "before", the editor's check of it as kept the
 * same, so an edit pays one census, not three.
 */
export function validate(draft: Draft, o: ValidateOptions): Validated {
  const kept = checked.get(o)?.get(draft);
  if (kept) return kept;
  const v = validated(draft, o);
  checked.set(o, (checked.get(o) ?? new WeakMap<Draft, Validated>()).set(draft, v));
  return v;
}
const checked = new WeakMap<ValidateOptions, WeakMap<Draft, Validated>>();

function validated(draft: Draft, o: ValidateOptions): Validated {
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
  const byRef = piecesBy(d, refs);
  const name = (r: PieceRef) => (byRef.has(keyOf(r)) ? pieceName(byRef.get(keyOf(r))!) : `a piece`);
  const entryOf = (r: PieceRef) => { const p = byRef.get(keyOf(r)); return p ? entryIn(p.entry, palette) : undefined; };
  const seen = new Set<string>(), issues: Issue[] = [];
  const all = barsOf(d);
  for (const i of [...checkHole(h, { name, entryOf, traps: o.traps !== false }), ...bars(d, h, palette, refs, all), ...meets(d, palette, refs, all)]) {
    const p = i.ref ? byRef.get(keyOf(i.ref)) : undefined, piece = i.piece ?? p?.id;
    const k = `${i.rule} ${piece} ${i.text}`;
    if (!seen.has(k)) seen.add(k), issues.push({ ...i, ...(piece && { piece }) });
  }
  issues.push(...builderLimits(d));
  let state: Hole | undefined;
  if (o.census) {
    host.load(DRAFT_ID, f.hex);
    host.setperiod(1);
    state = JSON.parse(host.state(DRAFT_ID)) as Hole;
    issues.push(...drawnAs(d, refs, palette, o.census(state)));
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
  return { issues, hex: f.hex, hole: h, ...(c.ok && { cost: c.cost }), refs, ...(state && { state }) };
}

/** Whether an issue is about a draft piece: named for it, or for another piece it meets (also). */
export function about(i: Issue, id: string, refs: Map<string, PieceRef[]>): boolean {
  if (i.piece === id) return true;
  const mine = new Set((refs.get(id) ?? []).map(keyOf));
  return !!i.also?.some((r) => mine.has(keyOf(r)));
}

/** The draft pieces an error of v is about (about: named, or met by it): each outlined on the board. */
export const atFault = (v: Pick<Validated, "issues" | "refs">, ids: readonly string[]): Set<string> =>
  new Set(ids.filter((id) => v.issues.some((i) => i.severity === "error" && about(i, id, v.refs))));

/** The id a draft is shown under in the builder's own wasm (its test mode has its real one). */
/** The id a full check loads the draft under (its census, its state). */
export const DRAFT_ID = "draft/v1";
