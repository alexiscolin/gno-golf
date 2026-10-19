// The builder's Draft: the hole as the editor works on it, in grid units
// (multiples of a quarter: what Fit shifts exactly), each piece a palette
// entry placed. gg1.ts writes it for builder.wasm, whose fit gives the bytes
// that will be published. A draft read from a file or from the browser is
// untrusted: parseDraft takes it only whole, on the grid and within its
// limits. Its history (undo, redo) and its keeping in the browser are here.
import { isObj, isSlug } from "../chain";
import { FIELD, gameWorld, MAX_PAR, notABuilderWorld } from "./rules";

export type V = [number, number];
/** Where a piece is: a rail's ends, a bar's axis and thickness, a post's circle, a zone's box, ellipse or polygon. */
export type Geometry =
  | { t: "rail"; a: V; b: V }
  | { t: "bar"; a: V; b: V; thick: number }
  | { t: "post"; c: V; r: number }
  | { t: "rect"; min: V; max: V }
  | { t: "round"; min: V; max: V }
  | { t: "poly"; pts: V[]; outside?: boolean };
/** A piece's settings, each within its entry's ranges: dir a slope's push (a unit of the lattice), to a tunnel's or a loop's way out. */
export interface Params {
  bounce?: number;
  scale?: number;
  grade?: number;
  dir?: V;
  to?: V;
}
/** How a piece comes and goes: always there, within a stroke (substeps), or with a pulse (strokes). */
export type ClockSpec = { k: "fixed" } | { k: "substep"; every: number; on: number; phase: number } | { k: "stroke"; pulse: number };
export interface Piece {
  /** the draft's own name for it, unique in the draft */
  id: string;
  /** its palette entry ("island/post/palm", "*\/rail/") */
  entry: string;
  geometry: Geometry;
  params: Params;
  clock: ClockSpec;
}
/** A pulse: on the strokes where (stroke+phase) mod every is below on. Its pieces say they are in it (clock). */
export interface Pulse {
  every: number;
  on: number;
  phase: number;
}
/**
 * A round that holed the exact hole in one weather, replayed by the chain's
 * code (proof.ts): key, the hole's (proofKey); kind, the weather's ("" clear);
 * commits, [from, to) as a save cuts it; maxWork, its heaviest shot's work.
 * A file's proofs are kept as given: publishing replays each again.
 */
export interface Proof {
  key: string;
  id: string;
  kind: string;
  period: number;
  shots: string[];
  commits: [number, number][];
  strokes: number;
  maxWork: number;
}
/**
 * The green as painted (surface.ts), the editor's own: its unit cells (each
 * its low corner, on the hole's lattice) and the outline's unit edges left
 * open (each its middle); its rails are found from them (surface.ts owned).
 * Never in the bytes (gg1.ts): the chain sees only the rails.
 */
export interface Surface {
  cells: V[];
  open: V[];
}
export interface Draft {
  v: 1;
  world: string;
  /** fixed before test mode: the hole's id, so its weather, depends on it ("" until then) */
  slug: string;
  title: string;
  /** 1..19 once the proofs suggest it; 0 until then */
  par: number;
  tee: V;
  pin: V;
  pieces: Piece[];
  pulses: Pulse[];
  note: string;
  proofs: Proof[];
  /** the green as painted; none: read from its rails, if they make one (surface.ts surfaceIn) */
  surface?: Surface;
}

/** A draft's limits, beside GG1's own (gg1.ts LIMITS): what the editor holds at once. */
export const MAX_PIECES = 224; // GG1's walls, posts and zones (160 + 32 + 32): a piece takes one at least (a test holds it)
/**
 * Where the browser keeps each draft: a key of its own (newKey), so a save
 * writes that draft only, and two tabs never write over each other's.
 */
export const DRAFT_PREFIX = "gnogolf.builder.draft.";
/** Where earlier Builders kept every draft in one list: moved to keys of their own (loadDrafts), or left as it is. */
export const DRAFTS_KEY = "gnogolf.builder.drafts";
/** A hole's name and note at most (runes), as the realm keeps them. */
export const MAX_TITLE = 40, MAX_NOTE = 140;
const MAX_PULSES = 16;
/** A painted green's cells at most: the board's whole (96 a side). */
const MAX_CELLS = 96 * 96;

/**
 * A grid value: a multiple of a quarter from origin, the tee's (the hole's
 * grid: framing shifts a whole hole, by a post's rim at times, off the
 * board's quarters), to a millionth.
 */
export const onGrid = (x: number, origin: number) => Number.isFinite(x) && Math.abs((x - origin) * 4 - Math.round((x - origin) * 4)) < 1e-6;

/** A new draft in a world: an empty board, the tee and the cup apart. */
export const emptyDraft = (world: string): Draft => ({ v: 1, world, slug: "", title: "", par: 0, tee: [4, 6], pin: [24, 6], pieces: [], pulses: [], note: "", proofs: [] });

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isV = (x: unknown): x is V => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);
const gridV = (x: unknown, tee: V): x is V => isV(x) && onGrid(x[0], tee[0]) && onGrid(x[1], tee[1]);

/** A piece's shape, or why not: "shape" (unknown), "grid" (off the grid from the tee). */
function geometryOf(g: unknown, tee: V): "shape" | "grid" | null {
  if (!isObj(g)) return "shape";
  switch (g.t) {
    case "rail":
      return isV(g.a) && isV(g.b) ? (gridV(g.a, tee) && gridV(g.b, tee) ? null : "grid") : "shape";
    case "bar":
      return isV(g.a) && isV(g.b) && isNum(g.thick) ? (gridV(g.a, tee) && gridV(g.b, tee) ? null : "grid") : "shape";
    case "post":
      return isV(g.c) && isNum(g.r) ? (gridV(g.c, tee) ? null : "grid") : "shape";
    case "rect":
    case "round":
      return isV(g.min) && isV(g.max) ? (gridV(g.min, tee) && gridV(g.max, tee) ? null : "grid") : "shape";
    case "poly":
      if (!Array.isArray(g.pts) || !g.pts.every(isV) || (g.outside !== undefined && typeof g.outside !== "boolean")) return "shape";
      return g.pts.every((v) => gridV(v, tee)) ? null : "grid";
  }
  return "shape";
}

function clockOf(c: unknown, pulses: number): "clock" | "pulse" | null {
  if (!isObj(c)) return "clock";
  if (c.k === "fixed") return null;
  if (c.k === "substep") return isInt(c.every, 1, 1 << 20) && isInt(c.on, 0, c.every) && isInt(c.phase, 0, c.every) ? null : "clock";
  if (c.k === "stroke") return !Number.isInteger(c.pulse) ? "clock" : (c.pulse as number) >= 0 && (c.pulse as number) < pulses ? null : "pulse";
  return "clock";
}

const isProof = (x: unknown) =>
  isObj(x) && typeof x.key === "string" && typeof x.id === "string" && typeof x.kind === "string" && Number.isSafeInteger(x.period) &&
  Array.isArray(x.shots) && x.shots.every((s) => typeof s === "string") && Array.isArray(x.commits) && x.commits.every((c) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger)) &&
  Number.isInteger(x.strokes) && isNum(x.maxWork);

/** A painted green: cells on the grid, all on one unit lattice (their corners a whole unit apart), open edges on it too. */
function isSurface(s: unknown, tee: V): s is Surface {
  if (!isObj(s) || !Array.isArray(s.cells) || !Array.isArray(s.open)) return false;
  if (!s.cells.length || s.cells.length > MAX_CELLS || s.open.length > MAX_CELLS) return false;
  if (!s.cells.every((c) => gridV(c, tee)) || !s.open.every((c) => gridV(c, tee))) return false;
  const [o] = s.cells, whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  return s.cells.every((c) => whole(c[0] - o[0]) && whole(c[1] - o[1])) && s.open.every((m) => whole(2 * (m[0] - o[0])) && whole(2 * (m[1] - o[1])));
}

/** A draft from a file or the browser, whole; or why it is refused, in a sentence. */
export function parseDraft(text: string): Draft | string {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return "The file is not a draft.";
  }
  if (!isObj(d)) return "The file is not a draft.";
  if (d.v !== 1) return "This draft is from another version of the Builder.";
  if (typeof d.world !== "string" || !Object.hasOwn(FIELD, d.world)) return gameWorld(String(d.world)) ? notABuilderWorld(String(d.world)) : `No world is called ${String(d.world)}.`;
  if (typeof d.slug !== "string" || (d.slug !== "" && !isSlug(d.slug))) return "The hole's short name is 1 to 32 lower-case letters, digits and dashes.";
  if (typeof d.title !== "string" || [...d.title].length > MAX_TITLE) return `The name is at most ${MAX_TITLE} characters.`;
  if (typeof d.note !== "string" || [...d.note].length > MAX_NOTE) return `The line for players is at most ${MAX_NOTE} characters.`;
  if (!isInt(d.par, 0, MAX_PAR)) return `Par is a whole number from 0 to ${MAX_PAR}.`;
  if (!isV(d.tee)) return "The file is not a draft.";
  if (!gridV(d.pin, d.tee)) return "The cup is off the grid.";
  if (!Array.isArray(d.pulses) || d.pulses.length > MAX_PULSES) return `A draft has at most ${MAX_PULSES} pulses.`;
  for (const p of d.pulses) if (!isObj(p) || !isInt(p.every, 1, 1 << 20) || !isInt(p.on, 0, p.every) || !isInt(p.phase, 0, p.every)) return "A pulse's timing is not whole numbers.";
  if (!Array.isArray(d.pieces)) return "The file is not a draft.";
  if (d.pieces.length > MAX_PIECES) return `A draft holds at most ${MAX_PIECES} pieces.`;
  const ids = new Set<string>();
  for (const p of d.pieces) {
    if (!isObj(p) || typeof p.id !== "string" || !p.id) return "A piece has no name.";
    if (ids.has(p.id)) return `Two pieces are called ${p.id}.`;
    ids.add(p.id);
    if (typeof p.entry !== "string") return `Piece ${p.id} has no palette entry.`;
    const g = geometryOf(p.geometry, d.tee);
    if (g === "shape") return `Piece ${p.id} has no shape the Builder knows.`;
    if (g === "grid") return `Piece ${p.id} is off the grid.`;
    if (!isObj(p.params)) return `Piece ${p.id} has no settings.`;
    for (const [k, v] of Object.entries(p.params)) {
      const ok = k === "dir" || k === "to" ? isV(v) : ["bounce", "scale", "grade"].includes(k) && isNum(v);
      if (!ok) return `Piece ${p.id} has a setting that is not a number.`;
    }
    const c = clockOf(p.clock, d.pulses.length);
    if (c === "pulse") return `Piece ${p.id} comes and goes with a pulse the draft does not have.`;
    if (c === "clock") return `Piece ${p.id} has a timing that is not whole numbers.`;
  }
  if (!Array.isArray(d.proofs) || !d.proofs.every(isProof)) return "The draft's proofs are not rounds the Builder made.";
  if (d.surface !== undefined && !isSurface(d.surface, d.tee)) return "The draft's green is not one the Builder painted.";
  return rebuild(d as unknown as Draft);
}

/**
 * A checked draft copied field by field: only what a Draft has, nothing else
 * a file carried (a piece's raw GG1 element, any other key) reaches the data
 * the board does not show.
 */
function rebuild(d: Draft): Draft {
  const v = (p: V): V => [p[0], p[1]];
  const geometry = (g: Geometry): Geometry => {
    switch (g.t) {
      case "rail": return { t: g.t, a: v(g.a), b: v(g.b) };
      case "bar": return { t: g.t, a: v(g.a), b: v(g.b), thick: g.thick };
      case "post": return { t: g.t, c: v(g.c), r: g.r };
      case "poly": return { t: g.t, pts: g.pts.map(v), ...(g.outside !== undefined && { outside: g.outside }) };
      default: return { t: g.t, min: v(g.min), max: v(g.max) };
    }
  };
  const params = (p: Params): Params => {
    const out: Params = {};
    for (const k of ["bounce", "scale", "grade"] as const) if (p[k] !== undefined) out[k] = p[k];
    for (const k of ["dir", "to"] as const) if (p[k]) out[k] = v(p[k]);
    return out;
  };
  const clock = (c: ClockSpec): ClockSpec => (c.k === "substep" ? { k: c.k, every: c.every, on: c.on, phase: c.phase } : c.k === "stroke" ? { k: c.k, pulse: c.pulse } : { k: "fixed" });
  return {
    v: 1, world: d.world, slug: d.slug, title: d.title, par: d.par, tee: v(d.tee), pin: v(d.pin), note: d.note,
    pieces: d.pieces.map((p) => ({ id: p.id, entry: p.entry, geometry: geometry(p.geometry), params: params(p.params), clock: clock(p.clock) })),
    pulses: d.pulses.map((q) => ({ every: q.every, on: q.on, phase: q.phase })),
    proofs: d.proofs.map((p) => ({ key: p.key, id: p.id, kind: p.kind, period: p.period, shots: [...p.shots], commits: p.commits.map(([a, b]): [number, number] => [a, b]), strokes: p.strokes, maxWork: p.maxWork })),
    ...(d.surface && { surface: { cells: d.surface.cells.map(v), open: d.surface.open.map(v) } }),
  };
}

/** The draft as a file. */
export const exportDraft = (d: Draft) => JSON.stringify(d, null, 1);

/** Undo and redo over whole drafts, HISTORY steps deep: a drag is one push. */
export const HISTORY = 200;
export function history(first: Draft) {
  const past: Draft[] = [];
  let now = first, future: Draft[] = [];
  return {
    now: () => now,
    push(d: Draft) {
      past.push(now);
      if (past.length > HISTORY) past.shift();
      now = d;
      future = [];
    },
    /** The step as it is, changed in place: no step of its own (proofs carried over to it). */
    amend(d: Draft) {
      now = d;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    undo() {
      if (past.length) future.push(now), (now = past.pop()!);
      return now;
    },
    redo() {
      if (future.length) past.push(now), (now = future.pop()!);
      return now;
    },
  };
}

/** A draft as this browser keeps it: under its key. */
export interface Kept {
  key: string;
  draft: Draft;
}

let last = 0;
/** A new draft's key: when it was started (the drafts' order, never twice the same in a tab), then a random tail (another tab's). */
export function newKey() {
  last = Math.max(Date.now(), last + 1);
  return `${DRAFT_PREFIX}${last}-${Math.random().toString(36).slice(2, 10)}`;
}
/**
 * A draft kept by a Builder that let a proved hole's address drift from its
 * rounds' (typed again, or following its name): the latest round's address
 * again, as the hole's address is fixed once proved (templates.ts retitle).
 */
export function slugSettled(d: Draft): Draft {
  const at = d.proofs.at(-1)?.id.split("/").at(-2);
  return at && at !== d.slug && isSlug(at) ? { ...d, slug: at } : d;
}
const started = (key: string) => Number.parseInt(key.slice(DRAFT_PREFIX.length), 10);

/**
 * The drafts kept in this browser, oldest first; none if it keeps nothing (a
 * private window). A stored draft this Builder cannot read (edited by hand,
 * another version's) is left out, and left as it is: no save writes its key.
 */
export function loadDrafts(): Kept[] {
  try {
    const out = fromList();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const d = key?.startsWith(DRAFT_PREFIX) ? parseDraft(localStorage.getItem(key) ?? "") : "";
      if (key && typeof d !== "string") out.push({ key, draft: slugSettled(d) });
    }
    return out.sort((a, b) => started(a.key) - started(b.key) || (a.key < b.key ? -1 : 1));
  } catch {
    return [];
  }
}

/**
 * An earlier Builder's list, each draft moved as it is to a key of its own
 * (unless that key is there already: a later save of it), the list removed
 * once every one is; the readable drafts the store refused to take, from the
 * list. A list this Builder cannot read stays as it is.
 */
function fromList(): Kept[] {
  let j: unknown;
  try {
    j = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "null");
  } catch {
    return [];
  }
  if (!isObj(j) || j.v !== 1 || !Array.isArray(j.drafts)) return [];
  let moved = true;
  const unmoved: Kept[] = [];
  j.drafts.forEach((x: unknown, i) => {
    const key = `${DRAFT_PREFIX}${i}-list`;
    try {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(x));
    } catch {
      moved = false;
      const draft = parseDraft(JSON.stringify(x));
      if (typeof draft !== "string") unmoved.push({ key, draft: slugSettled(draft) });
    }
  });
  if (moved) localStorage.removeItem(DRAFTS_KEY);
  return unmoved;
}

/** Keeps a draft in this browser, under its key; false if it keeps nothing (the page then says so once). */
export function saveDraft(key: string, d: Draft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** What this browser keeps under a key, as written (null: nothing, or it keeps nothing). */
export function keptText(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Keeps an open draft under its key, if what is kept there is still what
 * this tab last read or wrote (was; null for a key nothing was kept under):
 * kept, the text written (the next save's was). "elsewhere": another tab changed or
 * deleted it since, and nothing is written (the last save would win, a
 * delete come back); null: the browser keeps nothing.
 */
export function saveOver(key: string, d: Draft, was: string | null): { kept: string } | "elsewhere" | null {
  if (keptText(key) !== was) return "elsewhere";
  const text = JSON.stringify(d);
  return saveDraft(key, d) ? { kept: text } : null;
}

/** A draft deleted from this browser. */
export function dropDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

/** A fresh piece name: p and the next number. */
export function nextId(d: Pick<Draft, "pieces">): string {
  const n = d.pieces.reduce((m, p) => Math.max(m, Number(/^p(\d+)$/.exec(p.id)?.[1] ?? 0)), 0);
  return `p${n + 1}`;
}
