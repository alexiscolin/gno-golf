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
// release is checked with it; a refusal said by the pointer is gone at the
// next press (never left over another gesture). A pull from the ball by the
// tee (or, Shift held, anywhere on the board) plays a quick shot
// (quickshot.ts: from the tee, or from the ball where the last stopped), its
// path drawn, the last three faded, all played again as the hole changes;
// the board says it is no proof. The meter's best line is drawn when the
// header's difficulty chip asks; after a drop that held, a ghost ball runs
// it once (a second, never with reduced motion). The keys most used are
// said at its foot on a browser's first visit. The green is painted too
// (surface.ts, gesture.ts; its tools the palette's, B): Add, a drag
// adds the box from the press to the pointer (surface.ts boxCells: a click,
// the brush's BRUSH cells a side), Erase takes it away, a side of its
// outline dragged moves the whole side, a side clicked opens or shuts it;
// the box drawn at once as one ghost, judged once a
// frame at most (green, or red with why), let go one step, judged by the
// editor's gate (refused: said at the board's foot). A side hovered says
// what it does, or why it stays as it is (locked). The tee and the cup are
// dragged in either mode (pressed on, the end's; anywhere else, a stroke).
// From the keyboard, Tab reaches the sides (one stop, the arrows' side
// after), an arrow moves the focused one a cell, Enter or Space opens or
// shuts it; painting itself takes the pointer.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { middleOf, pieceLabel, whereOf } from "@/lib/builder/edit";
import { commonShift } from "@/lib/builder/editor";
import { boxIn, centreOn, FLAT, frameView, fromPlane, islandIn, gridLines, matrixOf, pinch, relook, toBoard, toPlane, toScreen, zoomAt, type Look, type View } from "@/lib/builder/view";
import { BOARD, MARGIN } from "@/lib/builder/gg1";
import { handlesOf, type HandleKey } from "@/lib/builder/handles";
import { type PaletteEntry } from "@/lib/builder/palette";
import type { ValidateOptions } from "@/lib/builder/pipeline";
import type { Draft, Piece, V } from "@/lib/builder/draft";
import { makeGesture, type Env, type Painted, type Shown as Moved, type Target } from "@/lib/builder/gesture";
import { onStage, stageRenderer, stageUp } from "@/lib/builder/stage";
import type { Hole } from "@/lib/scene/data";
import { ISLAND } from "@/lib/scene/common";
import Scene, { type Eye } from "./Scene";
import { PieceShape } from "./PieceShape";
import { MOD } from "./Inspector";
import { sound } from "@/lib/feel";
import { Chip } from "@/components/ui";
import { chain, labelAt, lean, reactionAt, throttle } from "@/lib/builder/juice";
import { entryName } from "@/lib/builder/names";
import { KEY_LINE } from "@/lib/builder/keys";
import { pt, xy } from "@/lib/builder/rules";
import { pulled, type Played, type QuickShot } from "@/lib/builder/quickshot";
import { moveSide, railsOf, SIDE_HAND, SIDE_LOCKED, toggleSide, type Green, type PaintMode } from "@/lib/builder/surface";
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
  /** the keys line at the board's foot (a browser's first visit) */
  keys?: boolean;
  /** a drop that held (placed, moved): the editor runs the ghost ball once the meter has measured it */
  onLanded?: () => void;
  /** the ghost ball's run along the meter's line (n: run again) */
  roll?: { path: readonly (readonly V[])[]; n: number } | null;
  /** how the board is looked at: turned, tilted (view.ts Look; flat by default) */
  look?: Look;
  /** the hole as checked (the pipeline's HoleState), and the draft it is of: the board drawn in 3D from it (none: in 2D);
   *  eye: the player's view painted from the same scene */
  scene?: { state: Hole | null; of: Draft | null; paused?: boolean; keep?: boolean; eye?: Eye };
  /** the green's paint (surface.ts): the way on (null: the pieces), the green as it stands while on (null: none to paint), a stroke let go (the editor's gate judges it) */
  paint?: Paint;
}

export interface Paint {
  mode: PaintMode | null;
  green: Green | null;
  onPaint: (s: Painted, refused?: string) => void;
}

/** The quick shots on the board: those played (the latest last; null, one the realm refused), the one being pulled, and the meter's line. */
export interface Ball {
  played: readonly (Played | null)[];
  /** the last try's round that holed (Play, no address yet), as played on the hole as it is now: a dotted trail */
  trail: readonly (Played | null)[];
  /** the latest's spec (where the next may start from: its rest, unless it holed) */
  last: QuickShot | null;
  aimed: Played | null;
  /** the meter's line on the hole as kept, when the header's chip shows it (null: not shown, or none: measuring, an error, a drag) */
  line: Pick<Shown, "path" | "heat"> | null;
  onAim: (s: QuickShot | null) => void;
  onShot: (s: QuickShot) => void;
}

/** The board's own gestures, in pixels: a pan, a quick shot's pull (the edits are the gesture's: gesture.ts). */
type Drag =
  | { t: "pan"; from: V; view: View }
  | { t: "paint"; press: [number, number]; side: boolean }
  | { t: "aim"; press: [number, number]; from: V | null; stroke: number; shot: string | null };

/** What the dock covers at the board's foot (px): F frames the hole above it. */
const DOCK = { bottom: 56 };

/** Cells as one path (each its unit square). */
const cellsPath = (cells: readonly V[]) => cells.map((c) => `M${c[0]} ${c[1]}h1v1h-1z`).join("");

/** The extent the view frames at first: the tee, the cup and every piece, with a margin. */
function extent(d: Draft): [V, V] {
  let lo: V = [Math.min(d.tee[0], d.pin[0]), Math.min(d.tee[1], d.pin[1])], hi: V = [Math.max(d.tee[0], d.pin[0]), Math.max(d.tee[1], d.pin[1])];
  for (const p of d.pieces) for (const h of handlesOf(p)) (lo = [Math.min(lo[0], h.at[0]), Math.min(lo[1], h.at[1])]), (hi = [Math.max(hi[0], h.at[0]), Math.max(hi[1], h.at[1])]);
  return [[lo[0] - 3, lo[1] - 3], [hi[0] + 3, hi[1] + 3]];
}

/** The scene's board (its island round 0..w, 0..h): the checked hole's, else the draft's pieces with Fit's margin. */
function boardOf(d: Draft, s: Hole | null | undefined): { w: number; h: number } {
  if (s) return s.board;
  let w = Math.max(d.tee[0], d.pin[0]), h = Math.max(d.tee[1], d.pin[1]);
  for (const p of d.pieces) for (const q of handlesOf(p)) (w = Math.max(w, q.at[0])), (h = Math.max(h, q.at[1]));
  return { w: w + MARGIN, h: h + MARGIN };
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
  // the paint: on with a green to paint; the stroke's ghost (why: null until judged, a frame at most), the side hovered and why it stays as it is
  const green = props.paint?.mode ? props.paint.green : null, mode = green ? props.paint!.mode : null;
  const [wash, setWash] = useState<Moved["wash"]>(null);
  const [hover, setHover] = useState<{ of: Draft; i: number; why: string } | null>(null);
  const [endHover, setEndHover] = useState<"tee" | "pin" | null>(null); // (the tee or the cup under the pointer: it says it drags)
  // the side the keyboard is on (its one Tab stop), and the one to take the focus once a move it made is drawn (its way out, where it went)
  const [roving, setRoving] = useState(0);
  const refocus = useRef<{ out: V; at: V } | null>(null);
  const judging = useRef(0);
  const washPath = useMemo(() => wash && { cells: cellsPath(wash.cells), rails: railsOf(wash.cells, [...wash.open, ...(green?.hand ?? [])]) }, [wash?.cells, wash?.open]); // eslint-disable-line react-hooks/exhaustive-deps -- (its why, the green: no reason to draw again)
  const greenPath = useMemo(() => (green ? cellsPath(green.cells) : ""), [green]);
  // the edits (gesture.ts), their callbacks the latest props' (one gesture a mount)
  const outs = useRef(props);
  outs.current = props;
  const [gesture] = useState(() => makeGesture({
    onPreview: (d) => outs.current.onPreview(d), onCommit: () => outs.current.onCommit(), onCancel: () => outs.current.onCancel(), onSet: (d) => outs.current.onSet(d),
    onSelect: (id) => outs.current.onSelect(id), onDisarm: () => outs.current.onDisarm(), onBin: (id) => outs.current.onBin(id),
    onPaint: (s, refused) => outs.current.paint?.onPaint(s, refused),
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
  useEffect(() => () => (timers.current.forEach(clearTimeout), cancelAnimationFrame(judging.current)), []);
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
    props.onLanded?.();
    setPopped(id);
    later(() => setPopped((x) => (x === id ? null : x)), 300);
    toStir.current = id; // (stirred once the draft has it where it landed)
  };
  const toStir = useRef<string | null>(null);
  // the ghost ball's run: its path written once a run (not each render of the board's)
  const roll = props.roll, rollPath = useMemo(() => (roll?.path.length ? `M${roll.path.flat().map((v) => `${v[0]},${v[1]}`).join(" L")}` : ""), [roll]);
  /** The snap's tick: a grid step further, a soft creak (at most every 70 ms). */
  const stepped = (key: string) => key !== cell.current && ((cell.current = key), tick());
  // disarmed (Escape, a drop): its ghost goes with it
  useEffect(() => void (!armed && setGhost(null)), [armed]);
  // the paint put down (Esc, a piece armed) mid-stroke: the stroke dropped, its ghost with it
  useEffect(() => void (!mode && (gesture.painting() && gesture.cancel(), setWash(null), setHover(null))), [mode, gesture]);
  // a side moved from the keyboard: the focus on it where it went (the nearest side facing its way), as it is drawn again
  useEffect(() => {
    const r = refocus.current;
    if (!r || !green) return;
    refocus.current = null;
    const dist = (i: number) => {
      const s = green.sides[i];
      return s.out[0] === r.out[0] && s.out[1] === r.out[1] ? Math.hypot((s.a[0] + s.b[0]) / 2 - r.at[0], (s.a[1] + s.b[1]) / 2 - r.at[1]) : Infinity;
    };
    const i = green.sides.reduce((best, _, k) => (dist(k) < dist(best) ? k : best), 0);
    setRoving(i);
    requestAnimationFrame(() => box.current?.querySelector<SVGGElement>(`[data-side="${i}"]`)?.focus());
  }, [green]);

  // the container's size, and the view framing the hole at first
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const framed = (): View => {
    // the extent's corners in the view's plane (turned, tilted), and their box; the sight kept on the 3D world's island
    const [a, b] = extent(draft), [lo, hi] = boxIn([a, b, [a[0], b[1]], [b[0], a[1]]], look);
    return frameView(lo, hi, size, DOCK, in3d ? islandIn(boardOf(draft, props.scene?.state), look, ISLAND) : undefined);
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

  /** The stroke's ghost drawn at once; judged (the fast checks: the editor's gate judges it let go with the census) at the next frame, not before. */
  const washed = (w: Moved["wash"]) => {
    setWash((x) => (w && w.why === null ? { ...w, why: x?.why ?? "" } : w ?? null));
    if (w?.why !== null || judging.current) return;
    judging.current = requestAnimationFrame(() => {
      judging.current = 0;
      const why = gesture.judge();
      if (why !== null) setWash((x) => x && { ...x, why });
    });
  };

  if (!view) return <section className="board" ref={box} aria-label="The board" />;
  const shown = view;
  // the board point under the pointer, projected onto the ground through the look (view.ts toBoard)
  const unit = (e: { clientX: number; clientY: number }): V => {
    const r = box.current!.getBoundingClientRect();
    return toBoard(view, look, [e.clientX - r.left, e.clientY - r.top]);
  };
  const env: Env = { draft, quick, full, armed, selected, step, paint: mode && green ? { mode, green } : null };

  /** A side from the keyboard: an arrow moves it a cell (along its way out, the arrow as it points on the screen), Enter or Space opens or shuts it; the author's wall on it: neither, why said. */
  function onSideKey(e: RKeyboardEvent<SVGGElement>, i: number) {
    const g = green, s = g?.sides[i], arrows: Record<string, V> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!g || !s || !props.paint || (!arrows[e.key] && e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation(); // (the editor's arrows move a piece selected: not this one)
    if (s.hand) return refuse(SIDE_HAND);
    if (e.key === "Enter" || e.key === " ") return props.paint.onPaint({ cells: g.cells, open: toggleSide(g.open, s) }, s.open ? undefined : SIDE_LOCKED);
    const d = fromPlane(arrows[e.key], { turns: look.turns, tilt: 0 }), by = Math.round(d[0] * s.out[0] + d[1] * s.out[1]);
    if (!by) return; // (along it: it has no way to go)
    refocus.current = { out: s.out, at: [(s.a[0] + s.b[0]) / 2 + s.out[0] * by, (s.a[1] + s.b[1]) / 2 + s.out[1] * by] };
    props.paint.onPaint(moveSide(g, s, by));
  }

  function onDown(e: RPointerEvent<SVGSVGElement>) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    setFlash(null); // (a refusal said is the last gesture's: a new one starts clean)
    refocus.current = null; // (a key's move refused: the pointer's edit is no reason to move the focus)
    if (pointers.current.size > 1) {
      // a pinch: a drag under way is dropped, its unchecked preview with it (never kept by the next edit), a stroke's ghost too
      if (gesture.grabbing()) (gesture.cancel(), setLive(null), setWash(null), props.onCarry?.(false));
      return void (drag.current = null);
    }
    const at = unit(e), hit = (e.target as Element).closest<HTMLElement>("[data-piece],[data-handle],[data-end],[data-shot]");
    if (props.pan) return void (drag.current = { t: "pan", from: [e.clientX, e.clientY], view: shown }); // (Space held: whatever is under it)
    if (((e.shiftKey && !mode) || hit?.dataset.shot) && props.ball && !armed) { // (Shift's quick shot not while painting)
      // a quick shot pulled: from where the last one stopped when pressed on its ball, else from the tee (its ball beside it)
      const last = props.ball.last, rest = props.ball.played.at(-1);
      const on = last && rest && !rest.holed && (hit?.dataset.shot === "rest" || (!hit?.dataset.shot && Math.hypot(at[0] - rest.rest[0], at[1] - rest.rest[1]) <= Math.max(1, 14 / shown.k))) ? { from: rest.rest, stroke: last.stroke + 1 } : null;
      return void (drag.current = { t: "aim", press: [e.clientX, e.clientY], from: on?.from ?? null, stroke: on?.stroke ?? 0, shot: null });
    }
    if (env.paint && !hit?.dataset.end) {
      // painting: the tee or the cup pressed is dragged (below); a side pressed moves it (or, let go where it was, opens or shuts it); anywhere else a stroke
      const side = (e.target as Element).closest<HTMLElement>("[data-side]")?.dataset.side;
      gesture.down(env, at, side !== undefined ? { t: "side", i: Number(side) } : { t: "brush" });
      drag.current = { t: "paint", press: [e.clientX, e.clientY], side: side !== undefined };
      // (its first place the step's: a place left over from the last stroke never hides this one's first ghost)
      const first = gesture.move(env, at);
      cell.current = first?.cell ?? "";
      return washed(first?.wash);
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
    if (d?.t === "paint") {
      const shown = env.paint && gesture.move(env, at);
      if (!shown) return (gesture.cancel(), (drag.current = null), setWash(null)); // (the paint put down mid-stroke)
      if (shown.cell !== cell.current) (stepped(shown.cell), washed(shown.wash));
      return;
    }
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
    if (d?.t === "paint") {
      // the stroke's green as the gesture keeps it (or a side clicked: opened or shut), to the editor's gate (refused: nothing changes, why said); the paint put down mid-stroke: nothing
      setWash(null);
      if (!env.paint) return gesture.cancel();
      const r = gesture.up(env, at, { click: Math.hypot(e.clientX - d.press[0], e.clientY - d.press[1]) < 6 });
      return void (r && "refused" in r && refuse(r.refused));
    }
    if (d) return; // (a pan)
    const bin = document.elementsFromPoint(e.clientX, e.clientY).some((x) => x.closest("[data-bin]"));
    const r = gesture.up(env, at, { keep: e.shiftKey, bin });
    if (!r) return;
    if ("refused" in r) return refuse(r.refused); // (said by the pointer, where the ghost is: once)
    if ("placed" in r) (dropped(r.placed, true), setGhost(null));
    else if ("moved" in r && r.moved) dropped(r.moved, false);
  }

  // what the view shows: the grid's lines in sight, every unit from the tee, every fifth darker
  const seen = ([[0, 0], [size.w, 0], [0, size.h], [size.w, size.h]] as const).map((c) => toBoard(view, look, c));
  const x0 = Math.max(0, Math.floor(Math.min(...seen.map((c) => c[0])))), x1 = Math.min(BOARD, Math.ceil(Math.max(...seen.map((c) => c[0]))));
  const y0 = Math.max(0, Math.floor(Math.min(...seen.map((c) => c[1])))), y1 = Math.min(BOARD, Math.ceil(Math.max(...seen.map((c) => c[1]))));
  const lines = view.k >= 6 ? gridLines([x0, y0], [x1, y1], draft.tee) : [];
  const sel = draft.pieces.find((p) => p.id === selected), hs = 7 / view.k;
  // the tee's and the cup's hit areas, last in their groups (the selection glows their drawing): wider than it (the
  // flag and its pole with the cup), 14 px at least
  const hit = Math.max(0.9, 14 / view.k);
  // the ball by the tee: down and right of it, its hit area (12 px at least) touching the tee's, never under it
  const ballHit = Math.max(0.6, 12 / view.k), teeBall = [0.8 * (hit + ballHit), 0.6 * (hit + ballHit)] as const;
  const ghostBad = ghost && ghost.why;
  // the side under the pointer (painting, no stroke under way): what it does, or why it stays as it is
  const side = mode && green && hover?.of === draft && !drag.current ? { ...green.sides[hover.i], why: hover.why } : null;
  const end = endHover && !drag.current && !gesture.grabbing() && !armed ? endHover : null;
  // in 3D, the overlay draws a piece only where the scene does not show it yet: dragged, or changed since the hole drawn was checked
  const shownBefore = new Map((props.scene?.of?.pieces ?? []).map((p) => [p.id, JSON.stringify(p)]));
  const pending = (p: Piece) => !gl || shownBefore.get(p.id) !== JSON.stringify(p);
  const ball = props.ball, aiming = drag.current?.t === "aim", line = ball?.line ?? null;
  const most = line ? Math.max(1, ...line.heat.map((c) => c[2])) : 1, latest = ball?.played.at(-1);
  const pathOf = (p: readonly V[]) => p.map((v) => `${v[0]},${v[1]}`).join(" ");
  // the tee's and the cup's badges: where they are, upright and at the board's scale whatever the look
  const badge = (at: V) => { const q = toScreen(view, look, at); return `translate(${q[0]} ${q[1]}) scale(${view.k})`; };
  return (
    <section className={`board${gl ? " board--3d" : ""}${ghostBad || live?.why || wash?.why ? " board--no" : ""}${props.pan ? " board--pan" : ""}${mode ? " board--paint" : ""}`} ref={box} tabIndex={-1} aria-label={mode ? `The board, painting the green: a box dragged ${mode === "grow" ? "adds" : "erases"} green, a side dragged moves it (or Tab to a side: the arrows move it, Enter opens it), Space and a drag pans, the wheel zooms` : "The board: the wheel or a pinch zooms, a drag on empty space pans"}>
      {in3d && props.scene && <Scene state={props.scene.state} view={view} look={look} size={size} waker={waker} eye={props.scene.eye} paused={props.scene.paused} keep={props.scene.keep} />}
      <svg className="board__map" width={size.w} height={size.h}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={(e) => (pointers.current.delete(e.pointerId), (drag.current = null), setLive(null), setWash(null), gesture.cancel(), props.ball?.onAim(null), props.onCarry?.(false))}
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
        {/* painting: the green as it stands, faint; each side of its outline, to drag or click (open: dashed; hovered and locked: it stays as it is, why said) */}
        {mode && green && (
          <g className="board__green">
            <path className="board__cells" d={greenPath} pointerEvents="none" />
            {green.sides.map((sd, i) => {
              const why = hover?.of === draft && hover.i === i ? hover.why : "";
              // (its resize cursor across it on the screen: a quarter turn of the look swaps them)
              const across = !!sd.out[0] !== (look.turns % 2 === 1) ? " board__side--ew" : " board__side--ns";
              return (
                <g key={`${sd.a.join()} ${sd.b.join()}`} data-side={i} className={`board__side${sd.open ? " board__side--open" : ""}${why ? " board__side--locked" : ""}${across}`}
                  role="button" tabIndex={i === Math.min(roving, green.sides.length - 1) ? 0 : -1} onKeyDown={(e) => onSideKey(e, i)}
                  aria-label={`A side of the green, ${sd.open ? "open" : "walled"}: ${why || `the arrows move it, Enter ${sd.open ? "shuts" : "opens"} it`}`}
                  onFocus={() => (setRoving(i), setHover({ of: draft, i, why: gesture.sideWhy(env, i) }))} onBlur={() => setHover(null)}
                  onPointerEnter={() => !drag.current && setHover({ of: draft, i, why: gesture.sideWhy(env, i) })} onPointerLeave={() => setHover(null)}>
                  <line x1={sd.a[0]} y1={sd.a[1]} x2={sd.b[0]} y2={sd.b[1]} />
                  <line className="board__hit" x1={sd.a[0]} y1={sd.a[1]} x2={sd.b[0]} y2={sd.b[1]} stroke="transparent" strokeWidth={Math.max(0.6, 14 / view.k)} />
                </g>
              );
            })}
          </g>
        )}
        {sel && !mode && handlesOf(sel).map((h) => <rect key={h.key} data-handle={h.key} className="board__handle" x={h.at[0] - hs / 2} y={h.at[1] - hs / 2} width={hs} height={hs} />)}
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
            {ball.aimed && <polyline className="aim" points={pathOf(ball.aimed.path)} />}
          </g>
        )}
        {/* where the last quick shot stopped: its ball, pulled for the next */}
        {ball && latest && !latest.holed && <g data-shot="rest" className="board__shot"><circle className="board__ball" cx={latest.rest[0]} cy={latest.rest[1]} r={0.5} /><circle className="board__hit" cx={latest.rest[0]} cy={latest.rest[1]} r={hit} /></g>}
        {/* after a drop that held: a ghost ball runs the meter's line once */
          rollPath && (
          <circle key={roll!.n} className="board__roll" r={0.45} pointerEvents="none">
            <animateMotion dur="1s" fill="freeze" path={rollPath} />
          </circle>
        )}
        {ghost && <g className="board__ghost" pointerEvents="none"><PieceShape p={ghost.p} state={ghost.why ? "bad" : "ghost"} /></g>}
        {/* the stroke as one ghost: the green it makes, and its walls */}
        {mode && wash && washPath && (
          <g className={`board__wash${wash.why ? " board__wash--no" : ""}`} pointerEvents="none">
            <path d={washPath.cells} />
            {washPath.rails.map((r) => <line key={`${r.a.join()} ${r.b.join()}`} x1={r.a[0]} y1={r.a[1]} x2={r.b[0]} y2={r.b[1]} />)}
          </g>
        )}
        {fx.map((f) => (
          <g key={f.n} className={`board__fx board__fx--${f.kind}`} pointerEvents="none">
            {f.p && <g className="board__shrink"><PieceShape p={f.p} /></g>}
            <circle cx={f.at[0]} cy={f.at[1]} r={1.2} />
          </g>
        ))}
        </g>
        <g data-end="tee" onPointerEnter={() => setEndHover("tee")} onPointerLeave={() => setEndHover(null)} className={`board__end${selected === "tee" ? " board__end--on" : ""}`} tabIndex={0} role="button" aria-label={`The tee at ${pt(draft.tee)}: the arrows move it`} aria-pressed={selected === "tee"} onFocus={() => props.onSelect("tee")} transform={badge(draft.tee)}><circle r={0.55} fill="#fff" stroke="#1f2a26" strokeWidth={0.15} /><text y={0.3} fontSize={0.8} textAnchor="middle">T</text><circle className="board__hit" r={hit} /></g>
        <g data-end="pin" onPointerEnter={() => setEndHover("pin")} onPointerLeave={() => setEndHover(null)} className={`board__end${selected === "pin" ? " board__end--on" : ""}`} tabIndex={0} role="button" aria-label={`The cup at ${pt(draft.pin)}: the arrows move it`} aria-pressed={selected === "pin"} onFocus={() => props.onSelect("pin")} transform={badge(draft.pin)}><circle r={0.6} fill="#1f2a26" /><path d="M0 0 v-2.2 l1.4 0.5 -1.4 0.5" fill="#e14b3b" stroke="#1f2a26" strokeWidth={0.1} /><rect className="board__hit" x={-hit} y={-2.2 - hit / 2} width={1.4 + 2 * hit} height={2.2 + 1.5 * hit} rx={hit} /></g>
        {/* the shot's handle: a ball by the tee, pulled back to play a quick shot (as Shift and a pull anywhere); drawn over
            the tee's, its hit area just outside the tee's at every zoom (a press on it never drags the tee) */}
        {ball && !armed && <g data-shot="tee" className="board__shot board__shot--tee" transform={badge(draft.tee)} aria-hidden="true"><title>Pull back to play a quick shot (just to try)</title><circle className="board__ball" cx={teeBall[0]} cy={teeBall[1]} r={0.38} /><circle className="board__hit" cx={teeBall[0]} cy={teeBall[1]} r={ballHit} /></g>}
      </svg>
      {ball && (aiming || ball.played.length > 0 || ball.trail.length > 0) && <Chip size="s" className="board__quick" role="status">Quick shot: just to try</Chip>}
      {props.said && <p className="board__said" role="alert">{props.said}</p>}
      {/* the keys a first hole needs, at the board's foot (the GUI spec's B1) */}
      {props.keys && !props.said && <p className="board__keys" aria-hidden="true">{KEY_LINE.map((k, i) => <Fragment key={k.key}>{i ? " " : ""}<span><kbd>{k.key.replace("mod", MOD)}</kbd> {k.short}</span></Fragment>)}</p>}
      {/* by the pointer: the ghost's name and place or why not, a drag's, or a refusal just made (once, shaken) */}
      {/* (painting, it says nothing to a screen reader as it goes: the result is said, by the editor) */}
      {(flash || ghost || live || (mode && wash) || side || end || (aiming && ball?.aimed)) && (
        <span key={flash ? `f${flash.n}` : "m"} ref={label} className={`measure${flash || ghost?.why || live?.why || wash?.why || side?.why ? " measure--no" : ""}${flash ? " measure--shake" : ""}`} role={(mode || end) && !flash ? undefined : "status"}>
          {flash ? flash.text : ghost ? ghost.why || `${armed ? entryName(armed) : ""} · ${xy(whereOf(ghost.p.geometry))}` : live ? live.why || "Let go to place it"
            : wash ? wash.why || `Let go to ${drag.current?.t === "paint" && drag.current.side ? "move the side" : mode === "shrink" ? "erase this green" : "add this green"}`
              : side ? side.why || `Drag to move · click to ${side.open ? "shut" : "open"}` : end ? `Drag to move the ${end === "tee" ? "tee" : "cup"}` : "Let go to play it"}
        </span>
      )}
    </section>
  );
}

/** Ground first, then walls and posts, as the scene stacks them. */
const order = (p: Piece) => (p.geometry.t === "rail" || p.geometry.t === "bar" ? 2 : p.geometry.t === "post" ? 3 : 1);
