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
// release is checked with it. With Shift held, a pull on the board plays a
// quick shot (quickshot.ts: from the tee, or from where the last stopped),
// its path drawn, the last three faded, all played again as the hole changes;
// the board says it is no proof. "Show the line" draws the meter's best line
// and where its shots stopped.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from "react";
import { middleOf, pieceLabel, whereOf } from "@/lib/builder/edit";
import { commonShift } from "@/lib/builder/editor";
import { centreOn, FLAT, K_MAX, K_MIN, matrixOf, pinch, relook, toBoard, toPlane, toScreen, zoomAt, type Look, type View } from "@/lib/builder/view";
import { BOARD } from "@/lib/builder/gg1";
import { handlesOf, type HandleKey } from "@/lib/builder/handles";
import { type PaletteEntry } from "@/lib/builder/palette";
import type { ValidateOptions } from "@/lib/builder/pipeline";
import type { Draft, Piece, V } from "@/lib/builder/draft";
import { makeGesture, type Env, type Target } from "@/lib/builder/gesture";
import { onStage, stageRenderer, stageUp } from "@/lib/builder/stage";
import type { Hole } from "@/lib/scene/data";
import Scene, { type Eye } from "./Scene";
import { PieceShape } from "./PieceShape";
import { MOD } from "./Inspector";
import { sound } from "@/lib/feel";
import { chain, labelAt, lean, reactionAt, throttle } from "@/lib/builder/juice";
import { entryName } from "@/lib/builder/names";
import { KEYS } from "@/lib/builder/keys";
import { pt, xy } from "@/lib/builder/rules";
import { pulled, type Played, type QuickShot } from "@/lib/builder/quickshot";
import type { Shown } from "@/lib/builder/difficulty";

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
  /** a piece let go on the palette's bin: removed, if the hole holds without it */
  onBin: (id: string) => void;
  /** a piece carried (pressed on and held), or let go: the palette's bin shows meanwhile */
  onCarry?: (on: boolean) => void;
  onDisarm: () => void;
  /** the last refusal made off the board (a key, the inspector), shown at the board's foot until it fades; the board's own are said by the pointer */
  said: string;
  /** Space held: a press and a drag pan the board, whatever is under it */
  pan?: boolean;
  /** F: the whole hole framed again, each time this changes */
  frameAsk?: number;
  /** Show me: the piece to frame (n: asked again, framed again) */
  show?: { id: string; n: number } | null;
  /** quick shots (the editor's: quickshot.ts) */
  ball?: Ball;
  /** how the board is looked at: turned, tilted (view.ts Look; flat by default) */
  look?: Look;
  /** the hole as checked (the pipeline's HoleState), and the draft it is of: the board drawn in 3D from it (none: in 2D);
   *  eye: the player's view painted from the same scene */
  scene?: { state: Hole | null; of: Draft | null; paused?: boolean; keep?: boolean; eye?: Eye };
}

/** The quick shots on the board: those played (the latest last; null, one the realm refused), the one being pulled, and the meter's line. */
export interface Ball {
  played: readonly (Played | null)[];
  /** the last quick test's round that holed, as played on the hole as it is now: a dotted trail */
  trail: readonly (Played | null)[];
  /** the latest's spec (where the next may start from: its rest, unless it holed) */
  last: QuickShot | null;
  aimed: Played | null;
  /** the meter's line on the hole as kept (null: none to show: measuring, an error, a drag) */
  line: Pick<Shown, "path" | "heat"> | null;
  lineOn: boolean;
  onLine: () => void;
  onAim: (s: QuickShot | null) => void;
  onShot: (s: QuickShot) => void;
  /** a quick test (T), and why it waits ("" it does not) */
  onTry: () => void;
  tryOff: string;
}

/** The board's own gestures, in pixels: a pan, a quick shot's pull (the edits are the gesture's: gesture.ts). */
type Drag =
  | { t: "pan"; from: V; view: View }
  | { t: "aim"; press: [number, number]; from: V | null; stroke: number; shot: string | null };

/** The extent the view frames at first: the tee, the cup and every piece, with a margin. */
function extent(d: Draft): [V, V] {
  let lo: V = [Math.min(d.tee[0], d.pin[0]), Math.min(d.tee[1], d.pin[1])], hi: V = [Math.max(d.tee[0], d.pin[0]), Math.max(d.tee[1], d.pin[1])];
  for (const p of d.pieces) for (const h of handlesOf(p)) (lo = [Math.min(lo[0], h.at[0]), Math.min(lo[1], h.at[1])]), (hi = [Math.max(hi[0], h.at[0]), Math.max(hi[1], h.at[1])]);
  return [[lo[0] - 3, lo[1] - 3], [hi[0] + 3, hi[1] + 3]];
}

export default function Board(props: BoardProps) {
  const { draft, quick, full, selected, armed, step, bad } = props, look = props.look ?? FLAT;
  // in 3D where this browser has WebGL (the Builder's one context: stage.ts), else the 2D board as it was;
  // its context lost, in 2D until it is back (the scene kept, to draw again then)
  const [in3d] = useState(() => !!props.scene && !!stageRenderer());
  const gl = useSyncExternalStore(onStage, stageUp) && in3d;
  const waker = useRef<(() => void) | null>(null);
  const box = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, V>());
  const [ghost, setGhost] = useState<{ p: Piece; why: string } | null>(null);
  // the edits (gesture.ts), their callbacks the latest props' (one gesture a mount)
  const outs = useRef(props);
  outs.current = props;
  const [gesture] = useState(() => makeGesture({
    onPreview: (d) => outs.current.onPreview(d), onCommit: () => outs.current.onCommit(), onCancel: () => outs.current.onCancel(), onSet: (d) => outs.current.onSet(d),
    onSelect: (id) => outs.current.onSelect(id), onDisarm: () => outs.current.onDisarm(), onBin: (id) => outs.current.onBin(id),
  }));
  const [live, setLive] = useState<{ id: string; why: string } | null>(null); // a dragged thing where it may not stay
  const prev = useRef(draft);
  // the feel: the pointer (the label by it), a refusal said there once (shaken, a thud), the piece just dropped (a pop)
  const pointer = useRef<[number, number]>([0, 0]), label = useRef<HTMLSpanElement>(null), cell = useRef("");
  const [flash, setFlash] = useState<{ text: string; n: number } | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  // what a drop stirs (a ripple, a puff, dust) and a piece taken away (it shrinks into a puff), each for a moment
  const [fx, setFx] = useState<{ n: number; at: V; kind: "ripple" | "puff" | "dust" | "gone"; p?: Piece }[]>([]);
  const fxN = useRef(0), chained = useMemo(() => chain(1500), []);
  // the grid by the pointer (3D): its middle moved with the pointer, no render; the pointer's last move across (a dragged piece leans with it)
  const near = useRef<SVGRadialGradientElement>(null), dx = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tick = useMemo(() => throttle(() => sound("stretch", 0.1), 70), []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (f: () => void, ms: number) => void timers.current.push(setTimeout(f, ms));
  // the label by the pointer, in the board (after each render, and as the pointer moves)
  const place = () => {
    const el = label.current, b = box.current;
    if (!el || !b) return;
    const at = labelAt(pointer.current, { w: b.clientWidth, h: b.clientHeight }, { w: el.offsetWidth, h: el.offsetHeight });
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
  };
  useLayoutEffect(place);
  /** A refusal, said once by the pointer: shaken, with a thud. */
  const refuse = (text: string) => {
    if (!text) return;
    sound("thud");
    setFlash((f) => ({ text, n: (f?.n ?? 0) + 1 }));
    later(() => setFlash((f) => (f?.text === text ? null : f)), 2600);
  };
  /** A moment of an effect at a board point, gone after ms. */
  const stir = (at: V, kind: (typeof fx)[number]["kind"], p?: Piece, ms = 650) => {
    const n = ++fxN.current;
    setFx((f) => [...f, { n, at, kind, p }]);
    later(() => setFx((f) => f.filter((x) => x.n !== n)), ms);
  };
  /** A drop that held: the piece pops in (0 → 1.15 → 1), stirs what it lands on; placed, a plop climbing a scale as placements chain; moved, a knock. */
  const dropped = (id: string, placed: boolean) => {
    sound(placed ? "plop" : "knock", placed ? chained() : undefined);
    setPopped(id);
    later(() => setPopped((x) => (x === id ? null : x)), 300);
    toStir.current = id; // (stirred once the draft has it where it landed)
  };
  const toStir = useRef<string | null>(null);
  /** The snap's tick: a grid step further, a soft creak (at most every 70 ms). */
  const stepped = (key: string) => key !== cell.current && ((cell.current = key), tick());
  // disarmed (Escape, a drop): its ghost goes with it
  useEffect(() => void (!armed && setGhost(null)), [armed]);

  // the container's size, and the view framing the hole at first
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const framed = (): View => {
    // the extent's corners in the view's plane (turned, tilted), and their box
    const [a, b] = extent(draft), cs = [a, b, [a[0], b[1]] as V, [b[0], a[1]] as V].map((c) => toPlane(c, look));
    const lo = [Math.min(...cs.map((c) => c[0])), Math.min(...cs.map((c) => c[1]))], hi = [Math.max(...cs.map((c) => c[0])), Math.max(...cs.map((c) => c[1]))];
    const k = Math.max(K_MIN, Math.min(K_MAX, Math.min(size.w / (hi[0] - lo[0]), (size.h - 56) / (hi[1] - lo[1]))));
    return { x: (lo[0] + hi[0]) / 2 - size.w / 2 / k, y: (lo[1] + hi[1]) / 2 - (size.h - 56) / 2 / k, k };
  };
  useEffect(() => {
    if (view || !size.w) return;
    setView(framed());
  }, [size, view, draft]); // eslint-disable-line react-hooks/exhaustive-deps -- (framed reads them)
  // F: the whole hole framed again
  useEffect(() => {
    if (props.frameAsk && size.w) setView(framed());
  }, [props.frameAsk]); // eslint-disable-line react-hooks/exhaustive-deps -- (asked, not as the draft changes)
  // Show me: the piece in the middle of the board
  useEffect(() => {
    const p = props.show && draft.pieces.find((q) => q.id === props.show!.id);
    if (p && size.w) setView((v) => v && centreOn(v, toPlane(middleOf(p), look), { w: size.w, h: size.h - 56 }));
  }, [props.show?.n]); // eslint-disable-line react-hooks/exhaustive-deps -- (asked, not as the draft changes)
  // a re-framed draft moved as a whole: the view follows, nothing jumps
  useEffect(() => {
    const s = commonShift(prev.current, draft), had = prev.current.pieces;
    prev.current = draft;
    const landed = toStir.current && draft.pieces.find((q) => q.id === toStir.current);
    if (landed) (stir(middleOf(landed), reactionAt(draft, middleOf(landed))), (toStir.current = null));
    // a piece taken away (a key, the bin, the inspector): it shrinks into a puff, and a falling plop
    for (const p of had) if (!draft.pieces.some((q) => q.id === p.id)) (stir(middleOf(p), "gone", p, 420), sound("plop", -1));
    const u = toPlane(s, look);
    if (s[0] || s[1]) setView((v) => v && { ...v, x: v.x + u[0], y: v.y + u[1] });
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps -- (the look as it is)
  // looked at another way (a turn, a tilt): the board's middle stays in the middle
  const was = useRef(look);
  useEffect(() => {
    const from = was.current;
    was.current = look;
    if (from.turns !== look.turns || from.tilt !== look.tilt) setView((v) => v && relook(v, from, look, size));
  }, [look.turns, look.tilt]); // eslint-disable-line react-hooks/exhaustive-deps -- (asked, not as the size changes)

  // the wheel zooms the board round the pointer, never scrolls the page (a listener that may prevent it)
  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => v && zoomAt(v, [px, py], v.k * Math.exp(-e.deltaY * 0.0015)));
      waker.current?.();
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  if (!view) return <section className="board" ref={box} aria-label="The board" />;
  const shown = view;
  // the board point under the pointer, projected onto the ground through the look (view.ts toBoard)
  const unit = (e: { clientX: number; clientY: number }): V => {
    const r = box.current!.getBoundingClientRect();
    return toBoard(view, look, [e.clientX - r.left, e.clientY - r.top]);
  };
  const env: Env = { draft, quick, full, armed, selected, step };

  function onDown(e: RPointerEvent<SVGSVGElement>) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size > 1) {
      // a pinch: a drag under way is dropped, its unchecked preview with it (never kept by the next edit)
      if (gesture.grabbing()) (gesture.cancel(), setLive(null), props.onCarry?.(false));
      return void (drag.current = null);
    }
    const at = unit(e), hit = (e.target as Element).closest<HTMLElement>("[data-piece],[data-handle],[data-end]");
    if (props.pan) return void (drag.current = { t: "pan", from: [e.clientX, e.clientY], view: shown }); // (Space held: whatever is under it)
    if (e.shiftKey && props.ball && !armed) {
      // a quick shot pulled: from where the last one stopped when pressed on its ball, else from the tee
      const last = props.ball.last, rest = props.ball.played.at(-1);
      const on = last && rest && !rest.holed && Math.hypot(at[0] - rest.rest[0], at[1] - rest.rest[1]) <= Math.max(1, 14 / shown.k) ? { from: rest.rest, stroke: last.stroke + 1 } : null;
      return void (drag.current = { t: "aim", press: [e.clientX, e.clientY], from: on?.from ?? null, stroke: on?.stroke ?? 0, shot: null });
    }
    const target: Target = hit?.dataset.handle ? { t: "handle", key: hit.dataset.handle as HandleKey } : hit?.dataset.end ? { t: "end", which: hit.dataset.end as "tee" | "pin" }
      : hit?.dataset.piece ? { t: "piece", id: hit.dataset.piece } : null;
    if (!gesture.down(env, at, target)) drag.current = { t: "pan", from: [e.clientX, e.clientY], view: shown };
    else if (target?.t === "piece") props.onCarry?.(true);
  }

  function onMove(e: RPointerEvent<SVGSVGElement>) {
    if (pointers.current.size === 2 && pointers.current.has(e.pointerId)) {
      // a pinch: the fingers' spread zooms, about their midpoint, which the board follows
      const r = box.current!.getBoundingClientRect();
      const fingers = () => { const [a, b] = [...pointers.current.values()]; return [[a[0] - r.left, a[1] - r.top], [b[0] - r.left, b[1] - r.top]] as const; };
      const from = fingers();
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      const to = fingers();
      setView((v) => v && pinch(v, from, to));
      return;
    }
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const r = box.current!.getBoundingClientRect();
    waker.current?.();
    pointer.current = [e.clientX - r.left, e.clientY - r.top];
    place();
    const at = unit(e), d = drag.current;
    dx.current = e.movementX || dx.current * 0.8;
    near.current?.setAttribute("cx", String(at[0])), near.current?.setAttribute("cy", String(at[1]));
    if (d?.t === "aim") {
      const shot = pulled(d.press, [e.clientX, e.clientY], innerWidth, innerHeight);
      if (shot !== d.shot) (d.shot = shot), props.ball?.onAim(shot ? { from: d.from, stroke: d.stroke, shot } : null);
      return;
    }
    if (d?.t === "pan") return void setView({ ...d.view, x: d.view.x - (e.clientX - d.from[0]) / d.view.k, y: d.view.y - (e.clientY - d.from[1]) / d.view.k });
    const shown = gesture.move(env, at);
    if (!shown) return;
    stepped(shown.cell);
    const g = shown.ghost;
    if (g && (!ghost || ghost.why !== g.why || whereOf(ghost.p.geometry).join() !== shown.cell)) (setGhost(g), g.why !== flash?.text && setFlash(null)); // (the same snapped place: no render)
    if (shown.live) setLive(shown.live);
  }

  function onUp(e: RPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    const d = drag.current, at = unit(e);
    drag.current = null;
    setLive(null);
    props.onCarry?.(false);
    if (d?.t === "aim") return (props.ball?.onAim(null), void (d.shot && props.ball?.onShot({ from: d.from, stroke: d.stroke, shot: d.shot })));
    if (d) return; // (a pan)
    const bin = document.elementsFromPoint(e.clientX, e.clientY).some((x) => x.closest("[data-bin]"));
    const r = gesture.up(env, at, { keep: e.shiftKey, bin });
    if (!r) return;
    if ("refused" in r) return refuse(r.refused); // (said by the pointer, where the ghost is: once)
    if ("placed" in r) (dropped(r.placed, true), setGhost(null));
    else if (r.moved) dropped(r.moved, false);
  }

  // what the view shows: the grid's lines in sight, every unit, every fifth darker
  const seen = ([[0, 0], [size.w, 0], [0, size.h], [size.w, size.h]] as const).map((c) => toBoard(view, look, c));
  const x0 = Math.max(0, Math.floor(Math.min(...seen.map((c) => c[0])))), x1 = Math.min(BOARD, Math.ceil(Math.max(...seen.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...seen.map((c) => c[1])))), y1 = Math.min(BOARD, Math.ceil(Math.max(...seen.map((c) => c[1]))));
  const lines: { x?: number; y?: number; major: boolean }[] = [];
  if (view.k >= 6) for (let x = x0; x <= x1; x++) lines.push({ x, major: x % 5 === 0 });
  if (view.k >= 6) for (let y = y0; y <= y1; y++) lines.push({ y, major: y % 5 === 0 });
  const sel = draft.pieces.find((p) => p.id === selected), hs = 7 / view.k;
  // the tee's and the cup's hit areas, last in their groups (the selection glows their drawing): wider than it (the
  // flag and its pole with the cup), 14 px at least
  const hit = Math.max(0.9, 14 / view.k);
  const ghostBad = ghost && ghost.why;
  // in 3D, the overlay draws a piece only where the scene does not show it yet: dragged, or changed since the hole drawn was checked
  const shownBefore = new Map((props.scene?.of?.pieces ?? []).map((p) => [p.id, JSON.stringify(p)]));
  const pending = (p: Piece) => !gl || shownBefore.get(p.id) !== JSON.stringify(p);
  const ball = props.ball, aiming = drag.current?.t === "aim", line = ball?.lineOn ? ball.line : null;
  const most = line ? Math.max(1, ...line.heat.map((c) => c[2])) : 1, latest = ball?.played.at(-1);
  const pathOf = (p: readonly V[]) => p.map((v) => `${v[0]},${v[1]}`).join(" ");
  // the tee's and the cup's badges: where they are, upright and at the board's scale whatever the look
  const badge = (at: V) => { const q = toScreen(view, look, at); return `translate(${q[0]} ${q[1]}) scale(${view.k})`; };
  return (
    <section className={`board${gl ? " board--3d" : ""}${ghostBad || live?.why ? " board--no" : ""}${props.pan ? " board--pan" : ""}`} ref={box} tabIndex={-1} aria-label="The board: the wheel or a pinch zooms, a drag on empty space pans">
      {in3d && props.scene && <Scene state={props.scene.state} view={view} look={look} size={size} waker={waker} eye={props.scene.eye} paused={props.scene.paused} keep={props.scene.keep} />}
      <svg className="board__map" width={size.w} height={size.h}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => (pointers.current.delete(e.pointerId), (drag.current = null), setLive(null), gesture.cancel(), props.ball?.onAim(null), props.onCarry?.(false))}
        onPointerLeave={() => (setGhost(null), near.current?.setAttribute("cx", "-99"))}>
        <defs><marker id="arrow" viewBox="0 0 6 6" refX="3" refY="3" markerUnits="userSpaceOnUse" markerWidth="0.8" markerHeight="0.8" orient="auto"><path d="M0 0 6 3 0 6z" fill="#fff" /></marker></defs>
        {/* the board in its units, looked at through the look (view.ts matrixOf); the tee's and the cup's badges upright over it */}
        <g className="board__plane" transform={`matrix(${matrixOf(view, look).join(" ")})`}>
        {!gl && <rect className="board__ground" x={0} y={0} width={BOARD} height={BOARD} />}
        {gl && (
          <defs>
            <radialGradient id="board-near" ref={near} gradientUnits="userSpaceOnUse" cx={-99} cy={-99} r={4}><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" /></radialGradient>
            <mask id="board-near-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={BOARD} height={BOARD}><rect x={0} y={0} width={BOARD} height={BOARD} fill="url(#board-near)" /></mask>
          </defs>
        )}
        <g className="board__grid" mask={gl ? "url(#board-near-mask)" : undefined}>{lines.map((l, i) => (l.x !== undefined ? <line key={i} x1={l.x} y1={y0} x2={l.x} y2={y1} className={l.major ? "major" : ""} /> : <line key={i} x1={x0} y1={l.y} x2={x1} y2={l.y} className={l.major ? "major" : ""} />))}</g>
        {[...draft.pieces].sort((a, b) => order(a) - order(b)).map((p) => (
          <g key={p.id} data-piece={p.id} className={`board__piece${p.id === selected ? " board__piece--on" : ""}${p.id === popped ? " board__piece--pop" : ""}`} tabIndex={0} role="button"
            aria-label={pieceLabel(p)} aria-pressed={p.id === selected} onFocus={() => props.onSelect(p.id)}>
            {live?.id === p.id ? <g className="board__lean" style={{ rotate: `${lean(dx.current)}deg` }}><PieceShape p={p} state={live.why ? "bad" : undefined} /></g>
              : <PieceShape p={p} state={bad.has(p.id) ? "bad" : undefined} hit={!pending(p)} />}
          </g>
        ))}
        {sel && handlesOf(sel).map((h) => <rect key={h.key} data-handle={h.key} className="board__handle" x={h.at[0] - hs / 2} y={h.at[1] - hs / 2} width={hs} height={hs} />)}
        {line && (
          <g className="board__line" pointerEvents="none">
            {line.heat.map(([x, y, n]) => <circle key={`${x} ${y}`} cx={x} cy={y} r={0.5} opacity={0.06 + 0.44 * (n / most)} />)}
            {line.path.map((p, i) => <polyline key={i} points={pathOf(p)} />)}
          </g>
        )}
        {ball && (
          <g className="board__shots" pointerEvents="none">
            {ball.trail.map((p, i) => p && <polyline key={`t${i}`} className="trail" points={pathOf(p.path)} />)}
            {ball.played.map((p, i) => p && <polyline key={i} className={i < ball.played.length - 1 ? "old" : undefined} points={pathOf(p.path)} />)}
            {latest && !latest.holed && <circle className="board__ball" cx={latest.rest[0]} cy={latest.rest[1]} r={0.5} />}
            {ball.aimed && <polyline className="aim" points={pathOf(ball.aimed.path)} />}
          </g>
        )}
        {ghost && <g className="board__ghost" pointerEvents="none"><PieceShape p={ghost.p} state={ghost.why ? "bad" : "ghost"} /></g>}
        {fx.map((f) => (
          <g key={f.n} className={`board__fx board__fx--${f.kind}`} pointerEvents="none">
            {f.p && <g className="board__shrink"><PieceShape p={f.p} /></g>}
            <circle cx={f.at[0]} cy={f.at[1]} r={1.2} />
          </g>
        ))}
        </g>
        <g data-end="tee" className={`board__end${selected === "tee" ? " board__end--on" : ""}`} tabIndex={0} role="button" aria-label={`The tee at ${pt(draft.tee)}: the arrows move it`} aria-pressed={selected === "tee"} onFocus={() => props.onSelect("tee")} transform={badge(draft.tee)}><circle r={0.55} fill="#fff" stroke="#1f2a26" strokeWidth={0.15} /><text y={0.3} fontSize={0.8} textAnchor="middle">T</text><circle className="board__hit" r={hit} /></g>
        <g data-end="pin" className={`board__end${selected === "pin" ? " board__end--on" : ""}`} tabIndex={0} role="button" aria-label={`The cup at ${pt(draft.pin)}: the arrows move it`} aria-pressed={selected === "pin"} onFocus={() => props.onSelect("pin")} transform={badge(draft.pin)}><circle r={0.6} fill="#1f2a26" /><path d="M0 0 v-2.2 l1.4 0.5 -1.4 0.5" fill="#e14b3b" stroke="#1f2a26" strokeWidth={0.1} /><rect className="board__hit" x={-hit} y={-2.2 - hit / 2} width={1.4 + 2 * hit} height={2.2 + 1.5 * hit} rx={hit} /></g>
      </svg>
      {ball && (
        <div className="board__tools">
          {(aiming || ball.played.length > 0 || ball.trail.length > 0) && <span className="board__quick" role="status">Quick shot: not a proof</span>}
          <button type="button" className="board__toggle" aria-pressed={ball.lineOn} disabled={!ball.line && !ball.lineOn}
            title={ball.line ? "The difficulty meter's best line, and where its shots stopped (a guess, calm weather)" : "Shown once the meter has measured the hole as it is"}
            onClick={ball.onLine}>Show the line</button>
          <button type="button" className="board__toggle" aria-disabled={ball.tryOff ? true : undefined} title={ball.tryOff || "Play it now in calm weather, then back here: never a proof (T)"}
            onClick={() => !ball.tryOff && ball.onTry()}>Quick test<kbd>T</kbd></button>
        </div>
      )}
      {props.said && <p className="board__said" role="alert">{props.said}</p>}
      {/* the keys a first hole needs, at the board's foot (the GUI spec's B1) */}
      {!props.said && <p className="board__keys" aria-hidden="true">{KEYS.map((k, i) => <span key={k.key}>{i ? " · " : ""}<kbd>{k.key.replace("mod", MOD)}</kbd> {k.short}</span>)}</p>}
      {/* by the pointer: the ghost's name and place or why not, a drag's, or a refusal just made (once, shaken) */}
      {(flash || ghost || live || (aiming && ball?.aimed)) && (
        <span key={flash ? `f${flash.n}` : "m"} ref={label} className={`measure${flash || ghost?.why || live?.why ? " measure--no" : ""}${flash ? " measure--shake" : ""}`} role="status">
          {flash ? flash.text : ghost ? ghost.why || `${armed ? entryName(armed) : ""} · ${xy(whereOf(ghost.p.geometry))}` : live ? live.why || "Let go to place it" : "Let go to play it"}
        </span>
      )}
    </section>
  );
}

/** Ground first, then walls and posts, as the scene stacks them. */
const order = (p: Piece) => (p.geometry.t === "rail" || p.geometry.t === "bar" ? 2 : p.geometry.t === "post" ? 3 : 1);
