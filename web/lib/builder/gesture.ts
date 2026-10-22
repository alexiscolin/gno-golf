// The board's pointer edits (Board.tsx), pure: in board units, whatever the
// board is looked through (flat, turned, tilted: view.ts's lens), so the 2D
// board and the 3D one make the very same drafts. The armed piece's ghost
// follows the pointer, snapped, with why it may not go; a drop where it may
// places it, else nothing. A piece, a handle, the tee or the cup grabbed
// follows, checked as it goes (the fast checks), and let go stays where it
// may or stops at the last place on its way where it may, judged with the
// census before it is kept (edit.ts dropMove, dropHandle, dropEnd). The
// green painted (surface.ts) is a target too: a stroke of the brush grows or
// shrinks it (Shift: along one axis), a side dragged moves by whole cells, a
// side clicked opens or shuts; the ghost at once, judged by the gate when
// the board asks (judge: a frame at most), let go one step for the editor's
// gate (onPaint). The board's own gestures in pixels (a pan, a pinch, a
// quick shot's pull) are the board's.
import { canPlace, dragCheck, dropEnd, dropHandle, dropMove, ghostAt, movePiece, whereOf } from "./edit";
import { refusalOf } from "./explain";
import { frame } from "./gg1";
import { setHandle, snap, type HandleKey } from "./handles";
import { entry as entryIn, type PaletteEntry } from "./palette";
import type { ValidateOptions } from "./pipeline";
import type { Issue } from "./checks";
import { nextId, type Draft, type Piece, type V } from "./draft";
import { moveSide, painted, PAINT_OFF, SIDE_HAND, SIDE_LOCKED, strokeCells, toggleSide, type Green, type PaintMode, type Side } from "./surface";

/** What the pointer pressed on: a piece, a handle of the selected one, the tee or the cup, the green under the brush or one of its sides (painting); null for the board. */
export type Target = { t: "piece"; id: string } | { t: "handle"; key: HandleKey } | { t: "end"; which: "tee" | "pin" } | { t: "brush" } | { t: "side"; i: number } | null;
/** The board as the gesture sees it at a press, a move or a release. */
export interface Env {
  draft: Draft;
  quick: ValidateOptions;
  full: ValidateOptions;
  armed: PaletteEntry | null;
  selected: string | null;
  /** the grid's step: 0.5, or 0.25 with Alt held */
  step: number;
  /** painting: the way, and the green as it stands (surface.ts owned) */
  paint?: { mode: PaintMode; green: Green } | null;
}
/** A green as a stroke leaves it. */
export type Painted = { cells: V[]; open: V[] };
/** What the gesture does to the editor's draft and selection. */
export interface Out {
  onPreview: (d: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  onSet: (d: Draft) => void;
  onSelect: (id: string | null) => void;
  onDisarm: () => void;
  onBin: (id: string) => void;
  /** a stroke or a side let go: the green it makes, and what to say if the gate refuses it (a side opened: where it may) */
  onPaint: (s: Painted, refused?: string) => void;
}
/** What a move shows: the armed piece's ghost, or the grabbed thing's place; why it may not stay ("" it may); a stroke's green (wash: null, none; why null, not judged yet: judge); the snapped place (a grid step taken when it changes). */
export interface Shown {
  ghost?: { p: Piece; why: string };
  live?: { id: string; why: string };
  wash?: (Painted & { why: string | null }) | null;
  cell: string;
}
/** What a release did: a piece placed or moved (its id: the pop), a green let go to the editor, or why nothing changed. */
export type Let = { placed: string } | { moved?: string } | { refused: string } | { painted: true } | null;

type Checker = ReturnType<typeof dragCheck>;
type Grab =
  | { t: "piece"; id: string; start: Draft; grab: V; check: Checker; from: V; moved: boolean }
  | { t: "handle"; id: string; key: HandleKey; start: Draft; check: Checker; from: V; moved: boolean }
  | { t: "end"; which: "tee" | "pin"; start: Draft; check: Checker; from: V; moved: boolean }
  | { t: "paint"; grow: boolean; green: Green; from: V; last: V; axis: 0 | 1 | null; brushed: Map<string, V>; now: Painted; wash: Shown["wash"]; check: Checker }
  | { t: "side"; green: Green; side: Side; from: V; by: number; now: Painted | null; wash: Shown["wash"]; check: Checker };

/** How far (cells) a stroke goes before it takes its axis, and goes across it before it turns onto the other. */
const SETTLE = 1, TURN = 2;
/**
 * A stroke kept straight: once it has gone SETTLE cells, along the axis it
 * went most (the other coordinate held where its leg began); taken TURN cells
 * across, it turns there onto the other axis, a new leg. A lane drawn in
 * straight legs, cell-exact, the hand's wobble left out.
 */
export function alongAxis(g: { from: V; axis: 0 | 1 | null }, at: V): V {
  const d = [at[0] - g.from[0], at[1] - g.from[1]];
  if (g.axis === null) {
    if (Math.hypot(d[0], d[1]) < SETTLE) return g.from;
    g.axis = Math.abs(d[0]) >= Math.abs(d[1]) ? 0 : 1;
  }
  const a = g.axis, b = a === 0 ? 1 : 0;
  if (Math.abs(d[b]) > TURN) {
    const corner: V = a === 0 ? [at[0], g.from[1]] : [g.from[0], at[1]];
    (g.from = corner), (g.axis = b);
    return alongAxis(g, at);
  }
  return a === 0 ? [at[0], g.from[1]] : [g.from[0], at[1]];
}
const firstWhy = (is: readonly Issue[]) => (is[0] ? refusalOf(is[0]) : "");

export function makeGesture(out: Out) {
  let grab: Grab | null = null;
  // the armed piece's checks over the draft as it is (a place checked once, however often the pointer passes)
  let armedCheck: { of: Draft; c: Checker } | null = null;
  // (the paint's too: a green judged once for the draft, a stroke, a hover over a side)
  const armedOf = (e: Env) => (armedCheck?.of === e.draft ? armedCheck.c : (armedCheck = { of: e.draft, c: dragCheck(e.draft, e.quick) }).c);
  /** The stroke's green as it stands, with why not when known (judged already for that shape), else null: asked once a new shape (its key a sort of every cell), kept for the moves within it. */
  const washOf = (d: Extract<Grab, { t: "paint" | "side" }>) => d.now && { ...d.now, why: d.check.known(d.now) };
  // the armed entry's piece, centred under the pointer, every point of it on the grid (the hole's: from its tee)
  const ghostOf = (e: Env, at: V): Piece => ghostAt(e.armed!, nextId(e.draft), at, e.step, e.draft.tee);
  return {
    /** Something grabbed (a piece, a handle, an end): the board leaves the press alone. */
    grabbing: () => !!grab,
    /**
     * A press: with a piece armed, nothing (it drops on release: true); on a
     * handle of the selected piece, a piece, the tee or the cup, grabbed
     * (true); on the board, the selection let go (false: the board's to pan).
     */
    down(e: Env, at: V, target: Target): boolean {
      const p = e.paint;
      if (p && target?.t === "brush") {
        const brushed = new Map(strokeCells(at, at, p.green.cells).map((c) => [c.join(), c]));
        const g: Grab = { t: "paint", grow: p.mode === "grow", green: p.green, from: at, last: at, axis: null, brushed, now: { cells: painted(p.green.cells, [...brushed.values()], p.mode === "grow"), open: p.green.open }, wash: null, check: armedOf(e) };
        return (g.wash = washOf(g)), (grab = g), true;
      }
      if (p && target?.t === "side") return (grab = { t: "side", green: p.green, side: p.green.sides[target.i], from: at, by: 0, now: null, wash: null, check: armedOf(e) }), true;
      if (e.armed) return true;
      if (target?.t === "handle" && e.selected) return (grab = { t: "handle", id: e.selected, key: target.key, start: e.draft, check: dragCheck(e.draft, e.quick), from: at, moved: false }), true;
      if (target?.t === "end") return (grab = { t: "end", which: target.which, start: e.draft, check: dragCheck(e.draft, e.quick), from: at, moved: false }), true;
      if (target?.t === "piece") {
        const p = e.draft.pieces.find((q) => q.id === target.id)!, w = whereOf(p.geometry);
        out.onSelect(target.id);
        return (grab = { t: "piece", id: target.id, start: e.draft, grab: [at[0] - w[0], at[1] - w[1]], check: dragCheck(e.draft, e.quick), from: at, moved: false }), true;
      }
      out.onSelect(null);
      return false;
    },
    /** The pointer moved to at: what it shows (null: nothing armed or grabbed); free: Shift held, a stroke as the hand goes. */
    move(e: Env, at: V, { free = false } = {}): Shown | null {
      const g = grab;
      if (g?.t === "paint") {
        if (!free) at = alongAxis(g, at);
        const n = g.brushed.size;
        for (const c of strokeCells(g.last, at, g.green.cells)) g.brushed.set(c.join(), c);
        g.last = at;
        if (g.brushed.size !== n) (g.now = { cells: painted(g.green.cells, [...g.brushed.values()], g.grow), open: g.green.open }), (g.wash = washOf(g));
        return { wash: g.wash, cell: String(g.brushed.size) };
      }
      if (g?.t === "side") {
        // whole cells along its outward normal; the author's wall on it: it stays
        const by = Math.round((at[0] - g.from[0]) * g.side.out[0] + (at[1] - g.from[1]) * g.side.out[1]);
        if (by !== g.by) (g.by = by), (g.now = by ? moveSide(g.green, g.side, by) : null), (g.wash = g.now && (g.side.hand ? { ...g.now, why: SIDE_HAND } : washOf(g)));
        return { wash: g.wash, cell: String(by) };
      }
      if (e.armed && !grab) {
        const p = ghostOf(e, at), cell = whereOf(p.geometry).join();
        return { ghost: { p, why: firstWhy(armedOf(e).piece(p)) }, cell };
      }
      const d = g;
      if (!d) return null;
      // (a press that never went further than a quarter of a step: a click, its let-go no edit)
      d.moved ||= Math.hypot(at[0] - d.from[0], at[1] - d.from[1]) > e.step / 4;
      const on = (v: V) => snap(v, e.step, d.start.tee);
      if (d.t === "piece") {
        const p = d.start.pieces.find((q) => q.id === d.id)!, moved = movePiece(p, on([at[0] - d.grab[0], at[1] - d.grab[1]]));
        out.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
        return { live: { id: d.id, why: firstWhy(d.check.piece(moved)) }, cell: whereOf(moved.geometry).join() };
      }
      if (d.t === "handle") {
        const p = d.start.pieces.find((q) => q.id === d.id)!, e0 = entryIn(p.entry, e.quick.palette);
        if (!e0) return null;
        const moved = setHandle(p, d.key, on(at), e0, d.start.tee);
        out.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
        return { live: { id: d.id, why: firstWhy(d.check.piece(moved)) }, cell: on(at).join() };
      }
      const v = on(at);
      out.onPreview({ ...d.start, [d.which]: v });
      return { live: { id: d.which, why: firstWhy(d.check.end(d.which, v)) }, cell: v.join() };
    },
    /** Let go at at: keep (Shift held) keeps the piece armed for another; bin: let go over the palette's bin. */
    up(e: Env, at: V, { keep = false, bin = false, click = false } = {}): Let {
      const d = grab;
      grab = null;
      // (a stroke that changed no cell, painted inside the green, erased outside it: nothing, no step to undo)
      if (d?.t === "paint") return d.now.cells.length === d.green.cells.length ? null : (out.onPaint(d.now), { painted: true });
      if (d?.t === "side") {
        // a click: opened or shut (the author's wall on it: neither); else the side moved
        if (d.side.hand && (d.by || click)) return { refused: SIDE_HAND };
        if (d.by && d.now) return out.onPaint(d.now), { painted: true };
        return click ? (out.onPaint({ cells: d.green.cells, open: toggleSide(d.green.open, d.side) }, d.side.open ? undefined : SIDE_LOCKED), { painted: true }) : null;
      }
      if (e.armed && !d) {
        const p = ghostOf(e, at), why = canPlace(e.draft, p, e.full);
        if (why.length) return { refused: refusalOf(why[0]) };
        out.onSet(frame({ ...e.draft, pieces: [...e.draft.pieces, p] }));
        out.onSelect(p.id);
        if (!keep) out.onDisarm(); // Shift keeps it armed: several in a row
        return { placed: p.id };
      }
      if (!d) return null;
      // a click (a piece pressed to select it, a handle or an end touched): nothing moves, nothing to undo, nothing checked
      if (!d.moved) return (out.onCancel(), null);
      // let go on the palette's bin: removed (if the hole holds without it)
      if (d.t === "piece" && bin) return (out.onCancel(), out.onSelect(null), out.onBin(d.id), null);
      const on = (v: V) => snap(v, e.step, d.start.tee);
      const next = d.t === "piece" ? dropMove(d.start, d.id, on([at[0] - d.grab[0], at[1] - d.grab[1]]), e.quick, e.full)
        : d.t === "handle" ? dropHandle(d.start, d.id, d.key, on(at), e.quick, e.full)
          : dropEnd(d.start, d.which, on(at), e.quick, e.full);
      if ("why" in next) return (out.onCancel(), next.why ? { refused: next.why } : null);
      // dragged back to where it was: nothing to undo
      if (same(d.start, next)) return (out.onCancel(), null);
      out.onPreview(next);
      out.onCommit();
      return d.t === "piece" ? { moved: d.id } : {};
    },
    /** The stroke's green judged (the board asks once a frame at most): why not ("" it may); null, no stroke. */
    judge(): string | null {
      const d = grab;
      return (d?.t === "paint" || d?.t === "side") && d.now ? (d.t === "side" && d.side.hand ? SIDE_HAND : d.check.surface(d.now)) : null;
    },
    /** Why side i of the green may not open (or shut), on the draft as it is: "" it may (judged once a draft). */
    sideWhy(e: Env, i: number): string {
      const g = e.paint?.green, s = g?.sides[i];
      if (!g || !s) return PAINT_OFF;
      const why = s.hand ? SIDE_HAND : armedOf(e).surface({ cells: g.cells, open: toggleSide(g.open, s) });
      return why && !s.open && !s.hand ? SIDE_LOCKED : why;
    },
    /** A stroke or a side under way. */
    painting: () => grab?.t === "paint" || grab?.t === "side",
    /** The gesture dropped (a pinch, the pointer lost, the paint put down): the grabbed thing back where it was. */
    cancel() {
      if (grab && grab.t !== "paint" && grab.t !== "side") out.onCancel();
      grab = null;
    },
  };
}

/** Whether an edit left the hole as it was: every field of it the same, a number to a millionth (a drag away and back adds float dust). */
const same = (a: Draft, b: Draft) => JSON.stringify(a, millionth) === JSON.stringify(b, millionth);
const millionth = (_: string, v: unknown) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v);
