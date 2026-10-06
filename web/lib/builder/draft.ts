// The builder's Draft: the hole as the editor works on it, in grid units
// (multiples of a quarter: what Fit shifts exactly), each piece a palette
// entry placed. gg1.ts writes it for builder.wasm, whose fit gives the bytes
// that will be published. A draft read from a file or from the browser is
// untrusted: parseDraft takes it only whole, on the grid and within its
// limits. Its history (undo, redo) and its keeping in the browser are here.
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
}

/** A draft's limits, beside GG1's own (gg1.ts LIMITS): what the editor holds at once. */
export const MAX_PIECES = 200;
/** Where the browser keeps the drafts. */
export const DRAFTS_KEY = "gnogolf.builder.drafts";
const MAX_TITLE = 40, MAX_NOTE = 140, MAX_PULSES = 16;

/** A grid value: a multiple of a quarter (Fit shifts the hole by one exactly). */
export const onGrid = (x: number) => Number.isFinite(x) && x * 4 === Math.round(x * 4);

/** A new draft in a world: an empty board, the tee and the cup apart. */
export const emptyDraft = (world: string): Draft => ({ v: 1, world, slug: "", title: "", par: 0, tee: [4, 6], pin: [24, 6], pieces: [], pulses: [], note: "", proofs: [] });

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isInt = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const isV = (x: unknown): x is V => Array.isArray(x) && x.length === 2 && isNum(x[0]) && isNum(x[1]);
const gridV = (x: unknown): x is V => isV(x) && onGrid(x[0]) && onGrid(x[1]);

/** A piece's shape, or why not: "shape" (unknown), "grid" (off it). */
function geometryOf(g: unknown): "shape" | "grid" | null {
  if (!isObj(g)) return "shape";
  switch (g.t) {
    case "rail":
      return isV(g.a) && isV(g.b) ? (gridV(g.a) && gridV(g.b) ? null : "grid") : "shape";
    case "bar":
      return isV(g.a) && isV(g.b) && isNum(g.thick) ? (gridV(g.a) && gridV(g.b) ? null : "grid") : "shape";
    case "post":
      return isV(g.c) && isNum(g.r) ? (gridV(g.c) ? null : "grid") : "shape";
    case "rect":
    case "round":
      return isV(g.min) && isV(g.max) ? (gridV(g.min) && gridV(g.max) ? null : "grid") : "shape";
    case "poly":
      if (!Array.isArray(g.pts) || !g.pts.every(isV) || (g.outside !== undefined && typeof g.outside !== "boolean")) return "shape";
      return g.pts.every(gridV) ? null : "grid";
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
  if (typeof d.slug !== "string" || (d.slug !== "" && !/^[a-z0-9-]{1,32}$/.test(d.slug))) return "The hole's short name is 1 to 32 lower-case letters, digits and dashes.";
  if (typeof d.title !== "string" || [...d.title].length > MAX_TITLE) return `The name is at most ${MAX_TITLE} characters.`;
  if (typeof d.note !== "string" || [...d.note].length > MAX_NOTE) return `The line for players is at most ${MAX_NOTE} characters.`;
  if (!isInt(d.par, 0, MAX_PAR)) return `Par is a whole number from 0 to ${MAX_PAR}.`;
  if (!gridV(d.tee)) return "The tee is off the grid.";
  if (!gridV(d.pin)) return "The cup is off the grid.";
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
    const g = geometryOf(p.geometry);
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

/** The drafts kept in this browser; none if it keeps nothing (a private window) or kept another version's. */
export function loadDrafts(): Draft[] {
  try {
    const j: unknown = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "null");
    if (!isObj(j) || j.v !== 1 || !Array.isArray(j.drafts)) return [];
    return j.drafts.map((d) => parseDraft(JSON.stringify(d))).filter((d): d is Draft => typeof d !== "string");
  } catch {
    return [];
  }
}

/** Keeps the drafts in this browser; false if it keeps nothing (the page then says so once). */
export function saveDrafts(list: readonly Draft[]): boolean {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, drafts: list }));
    return true;
  } catch {
    return false;
  }
}
