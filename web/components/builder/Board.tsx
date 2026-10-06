"use client";

// The board (the GUI spec's B2): the hole from above on its grid. The wheel
// and the pinch zoom it and a drag on empty space pans it, never the page.
// Nothing invalid is ever dropped (the hole-builder spec's prevention): the
// armed entry's ghost follows the pointer, snapped, green with its name and
// place where it may go, red with why where not, and a drop on red drops
// nothing; a piece, a handle, the tee or the cup dragged shows the same
// colours as it goes and, let go where it may not stay, stops at the last
// place on its way where it may (edit.ts clampMove, clampHandle, clampEnd).
// Live, the checks run without the render census (fast); a drop or a
// release is checked with it.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { canPlace, clampEnd, clampHandle, clampMove, errorsOf, movePiece, newErrors, nextId, placePiece, snap, whereOf } from "@/lib/builder/edit";
import { commonShift } from "@/lib/builder/editor";
import { BOARD, frame } from "@/lib/builder/gg1";
import { handlesOf, setHandle, type HandleKey } from "@/lib/builder/handles";
import { entry as entryIn, type PaletteEntry } from "@/lib/builder/palette";
import type { ValidateOptions } from "@/lib/builder/pipeline";
import type { Issue } from "@/lib/builder/checks";
import type { Draft, Piece, V } from "@/lib/builder/draft";
import { middleOf, PieceShape } from "./PieceShape";

export interface BoardProps {
  draft: Draft;
  /** checks without the census: as the pointer moves */
  quick: ValidateOptions;
  /** with it: a drop, a release */
  full: ValidateOptions;
  selected: string | null;
  armed: PaletteEntry | null;
  /** the grid's step: 0.5, or 0.25 with Alt held */
  step: number;
  /** pieces with an error, outlined */
  bad: ReadonlySet<string>;
  onSelect: (id: string | null) => void;
  onPreview: (d: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  onSet: (d: Draft) => void;
  onDisarm: () => void;
  /** a refusal, said once */
  onSay: (text: string) => void;
  /** the last refusal, shown at the board's foot until it fades */
  said: string;
}

interface View { x: number; y: number; k: number }
type Drag =
  | { t: "pan"; from: V; view: View }
  | { t: "piece"; id: string; start: Draft; grab: V }
  | { t: "handle"; id: string; key: HandleKey; start: Draft }
  | { t: "end"; which: "tee" | "pin"; start: Draft };

const K_MIN = 3, K_MAX = 90;
const fmt = (v: V) => `${+v[0].toFixed(2)}, ${+v[1].toFixed(2)}`;

/** The extent the view frames at first: the tee, the cup and every piece, with a margin. */
function extent(d: Draft): [V, V] {
  let lo: V = [Math.min(d.tee[0], d.pin[0]), Math.min(d.tee[1], d.pin[1])], hi: V = [Math.max(d.tee[0], d.pin[0]), Math.max(d.tee[1], d.pin[1])];
  for (const p of d.pieces) for (const h of handlesOf(p)) (lo = [Math.min(lo[0], h.at[0]), Math.min(lo[1], h.at[1])]), (hi = [Math.max(hi[0], h.at[0]), Math.max(hi[1], h.at[1])]);
  return [[lo[0] - 3, lo[1] - 3], [hi[0] + 3, hi[1] + 3]];
}

export default function Board(props: BoardProps) {
  const { draft, quick, full, selected, armed, step, bad } = props;
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, V>());
  const [ghost, setGhost] = useState<{ p: Piece; why: string } | null>(null);
  const [live, setLive] = useState<{ id: string; why: string } | null>(null); // a dragged thing where it may not stay
  const prev = useRef(draft);
  // disarmed (Escape, a drop): its ghost goes with it
  useEffect(() => void (!armed && setGhost(null)), [armed]);

  // the container's size, and the view framing the hole at first
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (view || !size.w) return;
    const [lo, hi] = extent(draft), k = Math.max(K_MIN, Math.min(K_MAX, Math.min(size.w / (hi[0] - lo[0]), (size.h - 56) / (hi[1] - lo[1]))));
    setView({ x: (lo[0] + hi[0]) / 2 - size.w / 2 / k, y: (lo[1] + hi[1]) / 2 - (size.h - 56) / 2 / k, k });
  }, [size, view, draft]);
  // a re-framed draft moved as a whole: the view follows, nothing jumps
  useEffect(() => {
    const s = commonShift(prev.current, draft);
    prev.current = draft;
    if (s[0] || s[1]) setView((v) => v && { ...v, x: v.x + s[0], y: v.y + s[1] });
  }, [draft]);

  // the wheel zooms the board round the pointer, never scrolls the page (a listener that may prevent it)
  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        if (!v) return v;
        const k = Math.max(K_MIN, Math.min(K_MAX, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: v.x + px / v.k - px / k, y: v.y + py / v.k - py / k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  if (!view) return <section className="board" ref={box} aria-label="The board" />;
  const shown = view;
  const unit = (e: { clientX: number; clientY: number }): V => {
    const r = box.current!.getBoundingClientRect();
    return [view.x + (e.clientX - r.left) / view.k, view.y + (e.clientY - r.top) / view.k];
  };

  // the armed entry's piece, centred under the pointer, snapped
  const ghostAt = (at: V): Piece => {
    const p = placePiece(armed!, nextId(draft), at), m = middleOf(p), w = whereOf(p.geometry);
    return movePiece(p, snap([w[0] + at[0] - m[0], w[1] + at[1] - m[1]], step));
  };
  const firstWhy = (is: Issue[]) => is[0]?.text ?? "";

  function onDown(e: RPointerEvent<SVGSVGElement>) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size > 1) return void (drag.current = null); // a pinch
    const at = unit(e), target = (e.target as Element).closest<HTMLElement>("[data-piece],[data-handle],[data-end]");
    if (armed) return; // dropped on release
    if (target?.dataset.handle && selected) return void (drag.current = { t: "handle", id: selected, key: target.dataset.handle as HandleKey, start: draft });
    if (target?.dataset.end) return void (drag.current = { t: "end", which: target.dataset.end as "tee" | "pin", start: draft });
    if (target?.dataset.piece) {
      const id = target.dataset.piece, p = draft.pieces.find((q) => q.id === id)!, w = whereOf(p.geometry);
      props.onSelect(id);
      return void (drag.current = { t: "piece", id, start: draft, grab: [at[0] - w[0], at[1] - w[1]] });
    }
    props.onSelect(null);
    drag.current = { t: "pan", from: [e.clientX, e.clientY], view: shown };
  }

  function onMove(e: RPointerEvent<SVGSVGElement>) {
    if (pointers.current.size === 2 && pointers.current.has(e.pointerId)) {
      // a pinch: the change in the distance between the two fingers zooms
      const spread = () => { const [a, b] = [...pointers.current.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
      const before = spread();
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      const now = spread();
      if (before > 0) setView((v) => v && { ...v, k: Math.max(K_MIN, Math.min(K_MAX, (v.k * now) / before)) });
      return;
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const at = unit(e), d = drag.current;
    if (armed && !d) {
      const p = ghostAt(at);
      if (ghost && ghost.p.geometry === p.geometry) return;
      setGhost({ p, why: firstWhy(canPlace(draft, p, quick)) });
      return;
    }
    if (!d) return;
    if (d.t === "pan") return void setView({ ...d.view, x: d.view.x - (e.clientX - d.from[0]) / d.view.k, y: d.view.y - (e.clientY - d.from[1]) / d.view.k });
    if (d.t === "piece") {
      const p = d.start.pieces.find((q) => q.id === d.id)!, moved = movePiece(p, snap([at[0] - d.grab[0], at[1] - d.grab[1]], step));
      props.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
      setLive({ id: d.id, why: firstWhy(canPlace(d.start, moved, quick)) });
    } else if (d.t === "handle") {
      const p = d.start.pieces.find((q) => q.id === d.id)!, e0 = entryIn(p.entry, quick.palette);
      if (!e0) return;
      const moved = setHandle(p, d.key, snap(at, step), e0);
      props.onPreview({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? moved : q)) });
      setLive({ id: d.id, why: firstWhy(canPlace(d.start, moved, quick)) });
    } else {
      const v = snap(at, step), next = { ...d.start, [d.which]: v };
      props.onPreview(next);
      setLive({ id: d.which, why: firstWhy(newErrors(errorsOf(d.start, quick), next, quick)) });
    }
  }

  function onUp(e: RPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    const d = drag.current, at = unit(e);
    drag.current = null;
    setLive(null);
    if (armed && !d) {
      const p = ghostAt(at), why = canPlace(draft, p, full);
      if (why.length) return props.onSay(why[0].text);
      props.onSet(frame({ ...draft, pieces: [...draft.pieces, p] }));
      props.onSelect(p.id);
      setGhost(null);
      if (!e.shiftKey) props.onDisarm(); // Shift keeps it armed: several in a row
      return;
    }
    if (!d || d.t === "pan") return;
    // let go: where it is if it may stay there (checked with the census), else the last place on its way where it may
    let next: Draft;
    if (d.t === "piece") {
      const p = d.start.pieces.find((q) => q.id === d.id)!, to = clampMove(d.start, d.id, snap([at[0] - d.grab[0], at[1] - d.grab[1]], step), quick);
      next = frame({ ...d.start, pieces: d.start.pieces.map((q) => (q.id === d.id ? movePiece(p, to) : q)) });
      const why = canPlace(d.start, next.pieces.find((q) => q.id === d.id)!, full);
      if (why.length) return (props.onCancel(), props.onSay(why[0].text));
    } else if (d.t === "handle") {
      next = clampHandle(d.start, d.id, d.key, snap(at, step), quick);
      const why = canPlace(d.start, next.pieces.find((q) => q.id === d.id)!, full);
      if (why.length) return (props.onCancel(), props.onSay(why[0].text));
    } else {
      const v = clampEnd(d.start, d.which, snap(at, step), quick);
      next = frame({ ...d.start, [d.which]: v });
    }
    props.onPreview(next);
    props.onCommit();
  }

  // what the view shows: the grid's lines in sight, every unit, every fifth darker
  const x0 = Math.max(0, Math.floor(view.x)), x1 = Math.min(BOARD, Math.ceil(view.x + size.w / view.k));
  const y0 = Math.max(0, Math.floor(view.y)), y1 = Math.min(BOARD, Math.ceil(view.y + size.h / view.k));
  const lines: { x?: number; y?: number; major: boolean }[] = [];
  if (view.k >= 6) for (let x = x0; x <= x1; x++) lines.push({ x, major: x % 5 === 0 });
  if (view.k >= 6) for (let y = y0; y <= y1; y++) lines.push({ y, major: y % 5 === 0 });
  const sel = draft.pieces.find((p) => p.id === selected), hs = 7 / view.k;
  const ghostBad = ghost && ghost.why;
  return (
    <section className={`board${ghostBad || live?.why ? " board--no" : ""}`} ref={box} aria-label="The board: the wheel or a pinch zooms, a drag on empty space pans">
      <svg className="board__map" width={size.w} height={size.h} viewBox={`${view.x} ${view.y} ${size.w / view.k} ${size.h / view.k}`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => (pointers.current.delete(e.pointerId), (drag.current = null), setLive(null), props.onCancel())}
        onPointerLeave={() => setGhost(null)}>
        <defs><marker id="arrow" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 6 3 0 6z" fill="#fff" /></marker></defs>
        <rect className="board__ground" x={0} y={0} width={BOARD} height={BOARD} />
        <g className="board__grid">{lines.map((l, i) => (l.x !== undefined ? <line key={i} x1={l.x} y1={y0} x2={l.x} y2={y1} className={l.major ? "major" : ""} /> : <line key={i} x1={x0} y1={l.y} x2={x1} y2={l.y} className={l.major ? "major" : ""} />))}</g>
        {[...draft.pieces].sort((a, b) => order(a) - order(b)).map((p) => (
          <g key={p.id} data-piece={p.id} className={`board__piece${p.id === selected ? " board__piece--on" : ""}`} aria-label={p.id}>
            <PieceShape p={p} state={bad.has(p.id) || live?.id === p.id && live.why ? "bad" : undefined} />
          </g>
        ))}
        <g data-end="tee" className="board__end" aria-label="The tee"><circle cx={draft.tee[0]} cy={draft.tee[1]} r={0.55} fill="#fff" stroke="#1f2a26" strokeWidth={0.15} /><text x={draft.tee[0]} y={draft.tee[1] + 0.3} fontSize={0.8} textAnchor="middle">T</text></g>
        <g data-end="pin" className="board__end" aria-label="The cup"><circle cx={draft.pin[0]} cy={draft.pin[1]} r={0.6} fill="#1f2a26" /><path d={`M${draft.pin[0]} ${draft.pin[1]} v-2.2 l1.4 0.5 -1.4 0.5`} fill="#e14b3b" stroke="#1f2a26" strokeWidth={0.1} /></g>
        {sel && handlesOf(sel).map((h) => <rect key={h.key} data-handle={h.key} className="board__handle" x={h.at[0] - hs / 2} y={h.at[1] - hs / 2} width={hs} height={hs} />)}
        {ghost && <g className="board__ghost" pointerEvents="none"><PieceShape p={ghost.p} state={ghost.why ? "bad" : "ghost"} /></g>}
      </svg>
      {props.said && <p className="board__said" role="alert">{props.said}</p>}
      {(ghost || live) && <span className={`measure${ghost?.why || live?.why ? " measure--no" : ""}`} role="status">{ghost ? ghost.why || `${armed?.label} · ${fmt(whereOf(ghost.p.geometry))}` : live!.why || "Let go to place it"}</span>}
    </section>
  );
}

/** Ground first, then walls and posts, as the scene stacks them. */
const order = (p: Piece) => (p.geometry.t === "rail" || p.geometry.t === "bar" ? 2 : p.geometry.t === "post" ? 3 : 1);
