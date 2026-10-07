// The board's pointer edits (Board.tsx), pure: in board units, whatever the
// board is looked through (flat, turned, tilted: view.ts's lens), so the 2D
// board and the 3D one make the very same drafts. The armed piece's ghost
// follows the pointer, snapped, with why it may not go; a drop where it may
// places it, else nothing. A piece, a handle, the tee or the cup grabbed
// follows, checked as it goes (the fast checks), and let go stays where it
// may or stops at the last place on its way where it may, judged with the
// census before it is kept (edit.ts dropMove, dropHandle, dropEnd). The
// board's own gestures in pixels (a pan, a pinch, a quick shot's pull) are
// the board's.
import { canPlace, dragCheck, dropEnd, dropHandle, dropMove, ghostAt, movePiece, nextId, snap, whereOf } from "./edit";
import { refusalOf } from "./explain";
import { frame } from "./gg1";
import { setHandle, type HandleKey } from "./handles";
import { entry as entryIn, type PaletteEntry } from "./palette";
import type { ValidateOptions } from "./pipeline";
import type { Issue } from "./checks";
import type { Draft, Piece, V } from "./draft";

/** What the pointer pressed on: a piece, a handle of the selected one, the tee or the cup; null for the board. */
export type Target = { t: "piece"; id: string } | { t: "handle"; key: HandleKey } | { t: "end"; which: "tee" | "pin" } | null;
/** The board as the gesture sees it at a press, a move or a release. */
export interface Env {
  draft: Draft;
  quick: ValidateOptions;
  full: ValidateOptions;
  armed: PaletteEntry | null;
  selected: string | null;
  /** the grid's step: 0.5, or 0.25 with Alt held */
  step: number;
}
/** What the gesture does to the editor's draft and selection. */
export interface Out {
  onPreview: (d: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  onSet: (d: Draft) => void;
  onSelect: (id: string | null) => void;
  onDisarm: () => void;
  onBin: (id: string) => void;
}
/** What a move shows: the armed piece's ghost, or the grabbed thing's place; why it may not stay ("" it may); the snapped place (a grid step taken when it changes). */
export interface Shown {
  ghost?: { p: Piece; why: string };
  live?: { id: string; why: string };
  cell: string;
}
/** What a release did: a piece placed or moved (its id: the pop), or why nothing changed. */
export type Let = { placed: string } | { moved?: string } | { refused: string } | null;

type Checker = ReturnType<typeof dragCheck>;
type Grab =
  | { t: "piece"; id: string; start: Draft; grab: V; check: Checker }
  | { t: "handle"; id: string; key: HandleKey; start: Draft; check: Checker }
  | { t: "end"; which: "tee" | "pin"; start: Draft; check: Checker };

const firstWhy = (is: readonly Issue[]) => (is[0] ? refusalOf(is[0]) : "");

export function makeGesture(out: Out) {
  let grab: Grab | null = null;
  // the armed piece's checks over the draft as it is (a place checked once, however often the pointer passes)
  let armedCheck: { of: Draft; c: Checker } | null = null;
  const armedOf = (e: Env) => (armedCheck?.of === e.draft ? armedCheck.c : (armedCheck = { of: e.draft, c: dragCheck(e.draft, e.quick) }).c);
  // the armed entry's piece, centred under the pointer, every point of it on the grid
  const ghostOf = (e: Env, at: V): Piece => ghostAt(e.armed!, nextId(e.draft), at, e.step);
  return {
    /** Something grabbed (a piece, a handle, an end): the board leaves the press alone. */
    grabbing: () => !!grab,
    /**
     * A press: with a piece armed, nothing (it drops on release: true); on a
     * handle of the selected piece, a piece, the tee or the cup, grabbed
     * (true); on the board, the selection let go (false: the board's to pan).
     */
    down(e: Env, at: V, target: Target): boolean {
      if (e.armed) return true;
      if (target?.t === "handle" && e.selected) return (grab = { t: "handle", id: e.selected, key: target.key, start: e.draft, check: dragCheck(e.draft, e.quick) }), true;
      if (target?.t === "end") return (grab = { t: "end", which: target.which, start: e.draft, check: dragCheck(e.draft, e.quick) }), true;
      if (target?.t === "piece") {
        const p = e.draft.pieces.find((q) => q.id === target.id)!, w = whereOf(p.geometry);
        out.onSelect(target.id);
        return (grab = { t: "piece", id: target.id, start: e.draft, grab: [at[0] - w[0], at[1] - w[1]], check: dragCheck(e.draft, e.quick) }), true;
      }
      out.onSelect(null);
      return false;
    },
    /** The pointer moved to at: what it shows (null: nothing armed or grabbed). */
    move(e: Env, at: V): Shown | null {
      if (e.armed && !grab) {
        const p = ghostOf(e, at), cell = whereOf(p.geometry).join();
        return { ghost: { p, why: firstWhy(armedOf(e).piece(p)) }, cell };
      }
      const d = grab;
      if (!d) return null;
      if (d.t === "piece") {
        const p = d.start.pieces.find((q) => q.id === d.id)!, moved = movePiece(p, snap([at[0] - d.grab[0], at[1] - d.grab[1]], e.step));
        out.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
        return { live: { id: d.id, why: firstWhy(d.check.piece(moved)) }, cell: whereOf(moved.geometry).join() };
      }
      if (d.t === "handle") {
        const p = d.start.pieces.find((q) => q.id === d.id)!, e0 = entryIn(p.entry, e.quick.palette);
        if (!e0) return null;
        const moved = setHandle(p, d.key, snap(at, e.step), e0);
        out.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
        return { live: { id: d.id, why: firstWhy(d.check.piece(moved)) }, cell: snap(at, e.step).join() };
      }
      const v = snap(at, e.step);
      out.onPreview({ ...d.start, [d.which]: v });
      return { live: { id: d.which, why: firstWhy(d.check.end(d.which, v)) }, cell: v.join() };
    },
    /** Let go at at: keep (Shift held) keeps the piece armed for another; bin: let go over the palette's bin. */
    up(e: Env, at: V, { keep = false, bin = false } = {}): Let {
      const d = grab;
      grab = null;
      if (e.armed && !d) {
        const p = ghostOf(e, at), why = canPlace(e.draft, p, e.full);
        if (why.length) return { refused: refusalOf(why[0]) };
        out.onSet(frame({ ...e.draft, pieces: [...e.draft.pieces, p] }));
        out.onSelect(p.id);
        if (!keep) out.onDisarm(); // Shift keeps it armed: several in a row
        return { placed: p.id };
      }
      if (!d) return null;
      // let go on the palette's bin: removed (if the hole holds without it)
      if (d.t === "piece" && bin) return (out.onCancel(), out.onSelect(null), out.onBin(d.id), null);
      const next = d.t === "piece" ? dropMove(d.start, d.id, snap([at[0] - d.grab[0], at[1] - d.grab[1]], e.step), e.quick, e.full)
        : d.t === "handle" ? dropHandle(d.start, d.id, d.key, snap(at, e.step), e.quick, e.full)
          : dropEnd(d.start, d.which, snap(at, e.step), e.quick, e.full);
      if ("why" in next) return (out.onCancel(), next.why ? { refused: next.why } : null);
      out.onPreview(next);
      out.onCommit();
      return d.t === "piece" ? { moved: d.id } : {};
    },
    /** The gesture dropped (a pinch, the pointer lost): the grabbed thing back where it was. */
    cancel() {
      if (grab) out.onCancel();
      grab = null;
    },
  };
}
export type Gesture = ReturnType<typeof makeGesture>;
