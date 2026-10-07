// A hole as GG1 (gno.land/p/gnogolf/course, data.gno), written in the page
// for builder.wasm's fit: decodable, never canonical. Every stored wall
// length is 0 (Decode reads them without trusting them; Fit prepares the
// walls again and Encode writes the chain's own), and a bar is four
// placeholder walls and a line (fit makes them build.Bar's): no float the
// chain stores is computed here but a slope's push. The layout is Encode's,
// field for field: a change to it is a new format (GG2), not an edit here.
// And the way back: a hole's decoded data (builder.wasm's decode) as a Draft.
import type { Draft, Geometry, Piece, V } from "./draft";
import { pt, type Field } from "./rules";
import type { GHole, GPost, GWall, GZone, HoleIn, PostIn, WallIn, ZoneIn, ZoneKind } from "./types";
import type { PieceRef } from "../scene/census";

/** GG1's frozen limits (course/data.gno), a pulse's pieces counted in: the one place the builder has them. */
export const LIMITS = { walls: 160, posts: 32, zones: 32, poly: 64, polyTotal: 512, pulses: 16, skins: 64 } as const;
/** The draft's board: GG1's largest, the hole sized to its pieces by Fit. */
export const BOARD = 96;
/** The margin round a hole's pieces, as every course hole has it (author.Fit's). */
export const MARGIN = 1.5;

const KINDS: readonly ZoneKind[] = ["surface", "slope", "tunnel", "hazard", "loop"]; // physics.ZoneKind's order
const ROUND = 1, OUTSIDE = 2, AIR = 4, CAPPED = 8; // data.gno's flags

/** h as GG1, in hex, every stored wall length 0: builder.wasm's fit (or decode) takes it. */
export function writeHole(h: HoleIn): string {
  const out: number[] = [], f64 = new DataView(new ArrayBuffer(8)), enc = new TextEncoder();
  const u8 = (n: number) => out.push(n & 0xff);
  const u16 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff);
  const i32 = (n: number) => out.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  const num = (x: number) => {
    f64.setFloat64(0, x, true);
    for (let i = 0; i < 8; i++) out.push(f64.getUint8(i));
  };
  const vec = (v: readonly [number, number]) => (num(v[0]), num(v[1]));
  const str = (s: string) => {
    const b = enc.encode(s).slice(0, 255); // (Decode reads a byte's worth: kept short here)
    u8(b.length);
    out.push(...b);
  };
  const skins: string[] = [], index = new Map<string, number>();
  const skin = (s = "") => {
    if (!index.has(s)) index.set(s, skins.push(s) - 1);
    return index.get(s)!;
  };
  const pieces = (ws: readonly WallIn[], ps: readonly PostIn[], zs: readonly ZoneIn[]) => {
    for (const p of [...ws, ...ps, ...zs]) skin(p.skin);
  };
  pieces(h.walls, h.posts, h.zones);
  for (const p of h.pulses) pieces(p.walls, p.posts, p.zones);

  const walls = (ws: readonly WallIn[], lengths: boolean) => {
    u16(ws.length);
    for (const w of ws) { // a style run each: decodable, if not Encode's runs
      u16(1);
      num(w.bounce ?? 0);
      i32(w.mark ?? 0);
      u16(skin(w.skin));
      i32(w.every ?? 0), i32(w.on ?? 0), i32(w.phase ?? 0);
    }
    for (const w of ws) {
      vec(w.a), vec(w.b);
      if (lengths) num(0), num(0), num(0);
    }
  };
  const posts = (ps: readonly PostIn[]) => {
    u16(ps.length);
    for (const p of ps) vec(p.c), num(p.r), num(p.bounce ?? 0), i32(p.mark ?? 0), u16(skin(p.skin));
  };
  const zones = (zs: readonly ZoneIn[]) => {
    u16(zs.length);
    for (const z of zs) {
      u8(KINDS.indexOf(z.kind));
      u8((z.round ? ROUND : 0) | (z.outside ? OUTSIDE : 0) | (z.air ? AIR : 0) | (z.capped ? CAPPED : 0));
      vec(z.min), vec(z.max), vec(z.vec ?? [0, 0]);
      num(z.scale ?? 0);
      i32(z.mark ?? 0);
      u16(skin(z.skin));
      i32(z.every ?? 0), i32(z.on ?? 0), i32(z.phase ?? 0);
      u16(z.poly?.length ?? 0);
      for (const p of z.poly ?? []) vec(p);
    }
  };

  out.push(...enc.encode("GG1"));
  u16(h.w), u16(h.h), u8(h.par), u16(h.substeps);
  str(h.world), num(h.order), str(h.title);
  vec(h.tee), vec(h.pin);
  num(h.cupR), num(h.shelter), num(h.friction), num(h.bounce), num(h.ballR);
  u16(skins.length);
  for (const s of skins) str(s);
  walls(h.walls, true), posts(h.posts), zones(h.zones);
  u8(h.pulses.length);
  for (const p of h.pulses) {
    i32(p.every), i32(p.on), i32(p.phase);
    walls(p.walls, false), posts(p.posts), zones(p.zones);
  }
  return out.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A palette entry's id read: "<world or *>/<kind>/<skin>"; air is a slope of moving air. */
export function entryParts(id: string): { world: string; kind: string; skin: string } {
  const [world = "", kind = "", ...skin] = id.split("/");
  return { world, kind, skin: skin.join("/") };
}


/** A hole's piece as a key: "wall4", "post0", "zone2p1" (the census's). */
export const keyOf = (r: PieceRef) => `${r.set}${r.i}${r.pulse ?? ""}`;
/** The draft piece each of the hole's pieces came from, by keyOf (writeDraft's refs). */
export function piecesBy(d: Draft, refs: Map<string, PieceRef[]>): Map<string, Piece> {
  const by = new Map<string, Piece>();
  for (const p of d.pieces) for (const r of refs.get(p.id) ?? []) by.set(keyOf(r), p);
  return by;
}

const sub = (a: V, d: V): V => [a[0] + d[0], a[1] + d[1]];

/**
 * The draft as GG1 (hex) on a 96 by 96 board, and its bars (fit's lines:
 * "ax ay bx by thickness wallIndex pulse"). A piece of a pulse goes into
 * that pulse's lists; a hazard's unread vec is the tee (a board point in the
 * extent, as Fit moves it). refs: which of the hole's pieces each draft piece
 * became (fit keeps their order), as the render census names them.
 */
export function writeDraft(d: Draft, field: Field): { hex: string; bars: string; refs: Map<string, PieceRef[]> } {
  const { hole, bars, refs } = draftHole(d, field);
  return { hex: writeHole(hole), bars, refs };
}

/**
 * The draft as GG1's pieces, and which pieces each draft piece became. A bar
 * is four placeholders and fit's line for it, or, with corners, four walls
 * round its corners near enough to judge without the wasm (a drag's every
 * step; never stored: only fit's bytes are published).
 */
export function draftHole(d: Draft, field: Field, corners = false): { hole: HoleIn; bars: string; refs: Map<string, PieceRef[]> } {
  const lists = [{ walls: [] as WallIn[], posts: [] as PostIn[], zones: [] as ZoneIn[] }, ...d.pulses.map(() => ({ walls: [] as WallIn[], posts: [] as PostIn[], zones: [] as ZoneIn[] }))];
  const bars: string[] = [], refs = new Map<string, PieceRef[]>();
  for (const p of d.pieces) {
    const pulse = p.clock.k === "stroke" ? p.clock.pulse : -1, to = lists[pulse + 1];
    const ref = (set: PieceRef["set"], i: number, n = 1) => refs.set(p.id, Array.from({ length: n }, (_, k) => ({ set, i: i + k, ...(pulse >= 0 && { pulse }) })));
    const timing = p.clock.k === "substep" ? { every: p.clock.every, on: p.clock.on, phase: p.clock.phase } : {};
    const { kind, skin } = entryParts(p.entry), g = p.geometry, bounce = p.params.bounce ?? 0;
    if (g.t === "rail") (ref("wall", to.walls.length), to.walls.push({ a: g.a, b: g.b, bounce, skin, ...timing }));
    else if (g.t === "bar") {
      ref("wall", to.walls.length, 4);
      bars.push(`${g.a[0]} ${g.a[1]} ${g.b[0]} ${g.b[1]} ${g.thick} ${to.walls.length} ${pulse}`);
      const c = barCorners(g.a, g.b, g.thick);
      for (let k = 0; k < 4; k++) to.walls.push({ ...(corners ? { a: c[k], b: c[(k + 1) % 4] } : { a: g.a, b: g.b }), bounce, skin, ...timing });
    } else if (g.t === "post") (ref("post", to.posts.length), to.posts.push({ c: g.c, r: g.r, bounce, skin }));
    else (ref("zone", to.zones.length), to.zones.push(zoneOf(kind, skin, g, p, d.tee, timing)));
  }
  const [field0, ...pulses] = lists;
  const hole: HoleIn = {
    w: BOARD, h: BOARD, title: d.title, par: d.par, tee: d.tee, pin: d.pin, world: d.world, order: 0,
    substeps: field.substeps, cupR: field.cupR, shelter: field.shelter, friction: field.friction, bounce: field.bounce, ballR: field.ballR,
    ...field0, pulses: d.pulses.map((q, i) => ({ ...q, ...pulses[i] })),
  };
  return { hole, bars: bars.join("\n"), refs };
}

/** A bar's four corners, near enough for a check (fit stores build.Bar's own): its axis a→b, thick wide, its caps out by half that. */
export function barCorners(a: V, b: V, thick: number): V[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, h = thick / 2;
  const n: V = [(-dy / l) * h, (dx / l) * h], e: V = [(dx / l) * h, (dy / l) * h];
  return [[a[0] - e[0] + n[0], a[1] - e[1] + n[1]], [b[0] + e[0] + n[0], b[1] + e[1] + n[1]], [b[0] + e[0] - n[0], b[1] + e[1] - n[1]], [a[0] - e[0] - n[0], a[1] - e[1] - n[1]]];
}

function zoneOf(kind: string, skin: string, g: Exclude<Geometry, { t: "rail" | "bar" | "post" }>, p: Piece, tee: V, timing: object): ZoneIn {
  const box = g.t === "poly"
    ? { min: [Math.min(...g.pts.map((q) => q[0])), Math.min(...g.pts.map((q) => q[1]))] as V, max: [Math.max(...g.pts.map((q) => q[0])), Math.max(...g.pts.map((q) => q[1]))] as V }
    : { min: g.min, max: g.max };
  const z: ZoneIn = { kind: kind === "air" ? "slope" : (kind as ZoneKind), ...box, skin, ...timing };
  if (g.t === "round") z.round = true;
  if (g.t === "poly") (z.poly = g.pts), (z.outside = !!g.outside);
  if (kind === "slope" || kind === "air") {
    const [dx, dy] = p.params.dir ?? [1, 0], l = Math.hypot(dx, dy) || 1, grade = p.params.grade ?? 0;
    z.vec = [(dx / l) * grade, (dy / l) * grade];
    if (kind === "air") z.air = true;
  } else if (kind === "tunnel" || kind === "loop") z.vec = p.params.to ?? [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2];
  else if (kind === "hazard") z.vec = tee;
  if (kind === "surface" || kind === "loop") z.scale = p.params.scale ?? 0;
  return z;
}

/**
 * The draft moved so its extent starts at the margin: by whole grid steps,
 * so Fit shifts it by none. The extent is Fit's, less the bars: rail ends,
 * post edges, the tee and the cup (E1b holds every bar inside them).
 */
export function frame(d: Draft): Draft {
  let lx = Infinity, ly = Infinity;
  const grow = (p: V, r = 0) => ((lx = Math.min(lx, p[0] - r)), (ly = Math.min(ly, p[1] - r)));
  for (const p of d.pieces) {
    const g = p.geometry;
    if (g.t === "rail") grow(g.a), grow(g.b);
    else if (g.t === "post") grow(g.c, g.r);
  }
  grow(d.tee), grow(d.pin);
  const s: V = [MARGIN - lx, MARGIN - ly];
  if (s[0] === 0 && s[1] === 0) return d;
  const move = (g: Geometry): Geometry => {
    switch (g.t) {
      case "rail": return { ...g, a: sub(g.a, s), b: sub(g.b, s) };
      case "bar": return { ...g, a: sub(g.a, s), b: sub(g.b, s) };
      case "post": return { ...g, c: sub(g.c, s) };
      case "poly": return { ...g, pts: g.pts.map((q) => sub(q, s)) };
      default: return { ...g, min: sub(g.min, s), max: sub(g.max, s) };
    }
  };
  return {
    ...d, tee: sub(d.tee, s), pin: sub(d.pin, s),
    pieces: d.pieces.map((p) => ({ ...p, geometry: move(p.geometry), params: p.params.to ? { ...p.params, to: sub(p.params.to, s) } : p.params })),
  };
}

const cut = (v: readonly [number, number]): V => [v[0], v[1]];
const clockOf = (t: { every: number; on: number; phase: number }, pulse: number): Piece["clock"] =>
  pulse >= 0 ? { k: "stroke", pulse } : t.every ? { k: "substep", every: t.every, on: t.on, phase: t.phase } : { k: "fixed" };

/** A hole's piece as readHole hands it to a matcher: its kind (rail, bar, post or a zone's), skin and element. */
export interface RawPiece {
  kind: string;
  skin: string;
  wall?: GWall;
  post?: GPost;
  zone?: GZone;
}
/** The palette entry a hole's piece is, or null for none. */
export type Match = (p: RawPiece) => string | null;

const near = (a: readonly number[], b: readonly number[]) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/**
 * Four walls build.Bar made: the bar's axis and thickness, recovered from its
 * corners (the short sides' middles, less the caps), on the grid, and
 * checked against bar (builder.wasm's build.Bar) corner for corner.
 */
function barOf(ws: readonly GWall[], bar: (line: string) => [number, number][]): { a: V; b: V; thick: number } | null {
  if (ws.length < 4 || !ws.every((w, k) => near(w.b, ws[(k + 1) % 4].a) && w.skin === ws[0].skin && w.every === ws[0].every && w.on === ws[0].on && w.phase === ws[0].phase && w.bounce === ws[0].bounce)) return null;
  const c = ws.map((w) => w.a);
  const l0 = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]), l1 = Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]);
  const thick = Math.round(l1 * 20) / 20, long = l0;
  if (!(thick > 0) || long <= thick) return null;
  const m0: V = [(c[0][0] + c[3][0]) / 2, (c[0][1] + c[3][1]) / 2], m1: V = [(c[1][0] + c[2][0]) / 2, (c[1][1] + c[2][1]) / 2];
  const ux = (m1[0] - m0[0]) / long, uy = (m1[1] - m0[1]) / long, e = thick / 2;
  const snap = (x: number) => Math.round(x * 4) / 4;
  const a: V = [snap(m0[0] + ux * e), snap(m0[1] + uy * e)], b: V = [snap(m1[0] - ux * e), snap(m1[1] - uy * e)];
  const got = bar(`${a[0]} ${a[1]} ${b[0]} ${b[1]} ${thick}`);
  return got.length === 4 && got.every((p, k) => p[0] === c[k][0] && p[1] === c[k][1]) ? { a, b, thick } : null;
}

/**
 * A published hole's data (decoded) as a Draft the builder can open for its
 * next version: each piece matched to a palette entry, four walls read back
 * as the bar build.Bar made; or refused, naming every piece no entry matches.
 */
export function readHole(g: GHole, match: Match, bar: (line: string) => [number, number][]): Draft | { refused: string[] } {
  let n = 0;
  const pieces: Piece[] = [], refused: string[] = [];
  const read = (list: { walls: GWall[]; posts: GPost[]; zones: GZone[] }, pulse: number) => {
    for (let i = 0; i < list.walls.length; ) {
      const w = list.walls[i], b = barOf(list.walls.slice(i, i + 4), bar);
      const raw: RawPiece = { kind: b ? "bar" : "rail", skin: w.skin, wall: w }, entry = match(raw);
      if (!entry) refused.push(`the ${raw.kind} ${w.skin || "plain"} at ${pt(w.a)}`);
      else pieces.push({ id: `p${++n}`, entry, geometry: b ? { t: "bar", ...b } : { t: "rail", a: cut(w.a), b: cut(w.b) }, params: w.bounce ? { bounce: w.bounce } : {}, clock: clockOf(w, pulse) });
      i += b ? 4 : 1;
    }
    for (const p of list.posts) {
      const entry = match({ kind: "post", skin: p.skin, post: p });
      if (!entry) refused.push(`the post ${p.skin || "plain"} at ${pt(p.c)}`);
      else pieces.push({ id: `p${++n}`, entry, geometry: { t: "post", c: cut(p.c), r: p.r }, params: p.bounce ? { bounce: p.bounce } : {}, clock: clockOf({ every: 0, on: 0, phase: 0 }, pulse) });
    }
    for (const z of list.zones) {
      const kind = z.kind === "slope" && z.air ? "air" : z.kind, entry = match({ kind, skin: z.skin, zone: z });
      if (!entry) { refused.push(`the ${kind} ${z.skin || "plain"} at ${pt(z.min)}`); continue; }
      const geometry: Geometry = z.poly.length ? { t: "poly", pts: z.poly.map(cut), ...(z.outside && { outside: true }) } : { t: z.round ? "round" : "rect", min: cut(z.min), max: cut(z.max) };
      const params: Piece["params"] = {};
      if (z.kind === "slope") {
        const l = Math.hypot(z.vec[0], z.vec[1]);
        if (l) (params.grade = Math.round(l * 100) / 100), (params.dir = [Math.round((z.vec[0] / l) * 1e6) / 1e6, Math.round((z.vec[1] / l) * 1e6) / 1e6]);
      } else if (z.kind === "tunnel" || z.kind === "loop") params.to = cut(z.vec);
      if (z.kind === "surface" || z.kind === "loop") params.scale = z.scale;
      pieces.push({ id: `p${++n}`, entry, geometry, params, clock: clockOf(z, pulse) });
    }
  };
  read(g, -1);
  g.pulses.forEach((p, i) => read(p, i));
  if (refused.length) return { refused };
  return {
    v: 1, world: g.world, slug: "", title: g.title, par: g.par, tee: cut(g.tee), pin: cut(g.pin), pieces,
    pulses: g.pulses.map(({ every, on, phase }) => ({ every, on, phase })), note: "", proofs: [],
  };
}
