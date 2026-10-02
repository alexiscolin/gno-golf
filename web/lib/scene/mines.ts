// The "mines" world: the Crystal Mines (ADR-005), same functions as
// garden.ts (see worlds.ts for the contract). The board is a lit pocket deep
// in a cave: a carpet laid down by the gnomes along a gallery of blue-slate
// rock, timber and iron all round, crystals growing out of the rock and
// glowing, lanterns on posts and chains, a vault of rock overhead with its
// stalactites, crystal veins and glowworms, galleries going off into the dark
// with their lamps, and, where the lane has no rails, the void: a drop into
// the dark. The light is the scene's own (camera.ts "cave"): the crystals and
// lanterns spill it as pools baked into the merged meshes' colours (baked),
// and "Lights out" puts the lanterns out. Decoration only: nothing out here is
// in the physics. The lane's own pieces are mines-rides.ts's, then
// mines-pieces.ts's (piece, extras).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, drawn, relief, share, glowTex, quality, geoOf, gridGeo, uTime, windNow, motion, hullOf, ownFade, fadeLoop, type FadeItem } from "./materials";
import { weatherLooks, look, bakeLocal } from "./bake";
import { animate } from "./state";
import { seeded, GRASS, placer, shown, type Rand } from "./common";
import { ud, md, type Hole, type Height } from "./data";
import type { Bar } from "./worlds";
import { VOID_ROWS, VOID_BANDS, VOID_FLOOR, voidEdges } from "./course";
import { gnomeIn } from "./gnome";
import { terrain, mod, boxOf, inZone, inSea, smoothstep, cupRadius, segDist, CELL, type Terrain } from "../terrain";
import { MINES, minesOrder, darkGallery, crystalMat, HUES, planks, drawnGround, lantern, lanternsLit, GLASS, DEAD_GLASS, chamferField } from "./mines-kit";
import { site, type SiteKind, outcrop, stalagmites, pillar, logPile, rails, oreCart, orePile, headframe, miners, cartLoop, bats,
  crateStack, bigLamp, giantCrystal, archOver,
  canary, figure, mushroomForest, cathedral, waterfall, bucketWheel, forge, liftTower, drillHead, boiler, treasure, canteen, sleeper, dynamiteShed, danglingCart, fossil, lavaFall, ponyStall } from "./mines-decor";
import { lavaMaterial } from "./mines-lava";
import { waterField, waterMaterial, shoreline, type WaterField, type WaterLight } from "./mines-water";
import { smoke } from "./props";
import { boulder, paint, strata, trestle } from "./mines-toon";
import { board, ladder, wood, WINDOW, newHoleBoards } from "./mines-decor";
import * as pieces from "./mines-pieces";
import * as rides from "./mines-rides";
import { signs, pulseSigns } from "./mines-signs";
import type { Extras, MutVec2, Post, Vec2, Wall, Zone } from "../types";

// ------------------------------------------------------------ the cave
//
// Round the board: a floor of blue slate, a ridge of rock along the lane's
// edges (the gallery it runs in), rubble rising to the cave's wall; the wall
// and the vault as one shell over it all (a superellipse round the board,
// near behind it, far in front: the camera looks in from the front); in front
// of the board the floor ends at a ledge over a chasm, and where the lane has
// no rails (the void) the chasm opens under the whole board.

const SIDE = 17, BACK = 13, FRONT = 46; // the shell's footprint past the board: at the sides, behind, in front
const LEDGE = 19; // the floor's front edge past the board, over the chasm (past the Far view's bottom)
const CHASM = 3.5; // how far past the board the void's chasm opens
const VAULT = 31; // the vault's top, over GRASS
const STEP = 0.5; // the field's grid

/** A light the world spills round it: baked into the merged meshes' colours
 *  (baked), a lantern's (lamp: it goes out in "Lights out") or a crystal's. */
interface Pool { x: number; y: number; z: number; r: number; c: THREE.Color; k: number; lamp: boolean }
/** A glow: one point of the hole's batch of glows (glowBatch). */
interface Glow { x: number; y: number; z: number; c: number; s: number; lamp?: boolean; tw?: number; /** it swings from there (a hanging lamp's) */ hook?: THREE.Vector3 }

/** What a hole's cave is, built once (caveOf). */
interface Cave {
  s: Hole;
  t: Terrain;
  W: number;
  H: number;
  voids: Zone[];
  voidAt: (x: number, z: number) => boolean;
  /** where a ball plays: the green, off the void */
  lane: (x: number, z: number) => boolean;
  /** distance to the lane (0 on it), and how far the lane lies behind (−z) within 10 */
  dist: (x: number, z: number) => number;
  back: (x: number, z: number) => number;
  /** > 0 on the floor, < 0 over a drop (the front chasm, the void's), 0 its edge */
  drop: (x: number, z: number) => number;
  /** the floor's height (world y) */
  floor: Height;
  /** the shell: its centre and half-axes, and where (x, z) is in it (1 its wall) */
  cx: number; cz: number; ax: number; az: number;
  rim: (x: number, z: number) => number;
  pools: Pool[];
  glows: Glow[];
  /** the lanterns on or out (set by the weather; baked sets it up) */
  lamps: (on: boolean) => void;
  lampK: { value: number };
  /** the lanterns guttering, a frame of it (baked sets it up) */
  tick: (t: number) => void;
  /** the places the cave is dressed in (planSites) */
  sites: Site[];
  /** the lane's edge distance, for its wear (wearTex) */
  wear?: THREE.DataTexture;
  /** a pit's lake: its depth (what stands in it stamps it dry) and the lights streaked on it */
  /** the pit's floor (or its lake's surface) at (x, z), over the drop; undefined elsewhere (pitFloor) */
  pitAt?: (x: number, z: number) => number | undefined;
  /** what is drawn at (x, z) on the pit's floor: its lake's water, its seam's lava, or dry floor (undefined) (pitFloor) */
  pitWet?: (x: number, z: number) => "water" | "lava" | undefined;
  lake?: { field: WaterField; lights: (list: readonly WaterLight[]) => void; follow: (x: number, z: number, h: number, k: number) => void };
}

const caves = new WeakMap<Hole, Cave>();
const noise = (x: number, z: number) => 0.5 * Math.sin(x * 0.55 + z * 0.3) + 0.5 * Math.sin(x * 0.23 - z * 0.62);
const fine = (x: number, z: number) => Math.sin(x * 1.7 + z * 1.1) * Math.sin(z * 1.9 - x * 0.7);

function caveOf(s: Hole): Cave {
  const had = caves.get(s);
  if (had) return had;
  // (the cave's own terrain, kept with it: without the rough's cells, the course's alone to plant)
  const W = s.board.w, H = s.board.h, t = lifted(s) ?? { ...terrain(s), rough: [] };
  const voids = (s.zones || []).filter((q) => q.skin === "void" && q.kind === "hazard");
  const voidAt = (x: number, z: number) => voids.some((q) => inZone(q, x, z));
  const lane = (x: number, z: number) => t.onGreen(x, z) && !voidAt(x, z);
  const cx = W / 2, ax = W / 2 + SIDE, cz = (-BACK + H + FRONT) / 2, az = (H + BACK + FRONT) / 2;
  const rim = (x: number, z: number) => Math.pow(Math.abs((x - cx) / ax) ** 4 + Math.abs((z - cz) / az) ** 4, 0.25);
  // the distance field, on a grid over the floor's extent: from every lane
  // cell (a two-pass chamfer), and how far back (−z) the lane is
  const X0 = cx - ax - 1, Z0 = cz - az - 1, nx = Math.ceil((2 * ax + 2) / STEP) + 1, nz = Math.ceil((H + LEDGE + 2 - Z0) / STEP) + 1;
  const D = new Float32Array(nx * nz).fill(1e4), B = new Float32Array(nx * nz).fill(1e4), X = new Float32Array(nx * nz).fill(1e4);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = X0 + i * STEP, z = Z0 + j * STEP;
      if (x > 0 && z > 0 && x < W && z < H && lane(x, z)) D[j * nx + i] = 0;
    }
  chamferField(D, nx, nz, STEP);
  for (let i = 0; i < nx; i++) {
    let last = -1e4;
    for (let j = 0; j < nz; j++) {
      const k = j * nx + i;
      if (!D[k]) last = j;
      B[k] = (j - last) * STEP;
    }
  }
  // (and how far the lane is in +x: a phone held upright looks from -x)
  for (let j = 0; j < nz; j++) {
    let last = 1e4;
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (!D[k]) last = i;
      X[k] = (last - i) * STEP;
    }
  }
  const at = (F: Float32Array) => (x: number, z: number) => {
    const u = Math.min(nx - 1.001, Math.max(0, (x - X0) / STEP)), v = Math.min(nz - 1.001, Math.max(0, (z - Z0) / STEP));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * nx + i;
    return (F[k] * (1 - fu) + F[k + 1] * fu) * (1 - fv) + (F[k + nx] * (1 - fu) + F[k + nx + 1] * fu) * fv;
  };
  const dist = at(D), back0 = at(B), side0 = at(X);
  // (how far back the lane is from where the camera looks, a wide screen's
  // from +z, an upright phone's from -x, and a little to either side too: a
  // camera off to one side sees past a thing to the lane beside it)
  const back = (x: number, z: number) => Math.min(back0(x, z), back0(x - 4, z), back0(x + 4, z), back0(x - 8, z), back0(x + 8, z),
    side0(x, z), side0(x, z - 3), side0(x, z + 3));
  const isVoid = voids.length > 0;
  // the drop: the chasm in front, and round a void lane the whole board
  const drop = (x: number, z: number) => {
    const front = H + LEDGE + 1.2 * Math.sin(x * 0.23) + 0.6 * Math.sin(x * 0.61 + 1) - z;
    if (!isVoid) return front;
    const m = CHASM + 0.8 * Math.sin(x * 0.4 + z * 0.3) + 0.4 * fine(x, z);
    const dx = Math.max(-m - x, x - W - m), dz = -m - z;
    const out = dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz);
    return Math.min(front, out);
  };
  // the floor: flat slate, a ridge of rock along the lane (the gallery's
  // shoulder: none over the void), rubble rising to the shell's wall; low in
  // front of the lane, where it would hide it from the camera
  const ground = (x: number, z: number) => {
    const d = dist(x, z), n = noise(x, z);
    const ridge = isVoid ? 0 : 2.3 * smoothstep((d - 0.45) / 2.6) * (1 - 0.6 * smoothstep((d - 4.5) / 6)) * (0.8 + 0.3 * n);
    const r = rim(x, z), talus = 6 * smoothstep((r - 0.86) / 0.14) ** 1.5 * (0.8 + 0.3 * n);
    // shelves of rock further out: terraces a man high, their faces in strata
    const far = smoothstep((d - 4.5) / 2.5);
    const shelf = far * (1.8 * smoothstep((noise(x * 0.19 + 3, z * 0.23) + 0.12 * fine(x * 0.6, z * 0.6) - 0.15) / 0.06) + 1.6 * smoothstep((noise(x * 0.13 - 7, z * 0.15 + 2) - 0.4) / 0.06)
      // and ridges of rubble winding across it
      + 0.9 * Math.max(0, 1 - Math.abs(noise(x * 0.09 + 5, z * 0.11 - 3)) * 6) * (0.7 + 0.3 * fine(x * 0.8, z * 0.8)));
    let h = ridge + talus + shelf + 0.18 * n + 0.08 * fine(x * 1.3, z * 1.3);
    h = Math.min(h, 0.35 + 0.75 * back(x, z)); // (the lane behind it stays in view)
    // (under the lane's own edge a hair below it: never the lane's plane, no fighting it;
    // under the lane itself well down, out of sight through a hole a piece cuts in it)
    return lane(x, z) ? GRASS - 3 : d < 0.5 ? GRASS - 0.06 : GRASS - 0.02 + Math.max(0, h);
  };
  // the places the cave is dressed in (dress): each on level ground, a
  // little raised, the floor falling away round it
  const sites = planSites(s, { dist, back, drop, rim, W, H, cx, cz, ax, az }, ground);
  const floor = (x: number, z: number) => {
    let h = ground(x, z);
    for (const q of sites) {
      const d = Math.hypot(x - q.x, z - q.z);
      if (d < q.r + 2) h += (q.y + 0.15 * smoothstep(1 - d / q.r) - h) * smoothstep((q.r + 2 - d) / 2);
    }
    return h;
  };
  const cave: Cave = {
    s, t, W, H, voids, voidAt, lane, dist, back, drop, floor, cx, cz, ax, az, rim, sites,
    pools: [], glows: [], lamps: () => {}, lampK: { value: 1 }, tick: () => {},
  };
  caves.set(s, cave);
  newHoleBoards();
  return cave;
}

const EARTH = new THREE.Color(0x5a4a44);
const SITE_GROUND: Record<SiteKind, THREE.Color> = {
  work: new THREE.Color(0x6a5446), camp: new THREE.Color(0x6e5848), ore: new THREE.Color(0x6a5446), collapse: new THREE.Color(0x6a6278),
  mushrooms: new THREE.Color(0x3c5a5a), lake: new THREE.Color(0x34485a), druse: new THREE.Color(0x4a4a6e), stalagmites: new THREE.Color(0x4e4862),
};
/** A place the cave is dressed in: where, how big, what, at what level. */
interface Site { x: number; z: number; r: number; y: number; kind: SiteKind; tall: boolean; k: number }
/** The sites each biome is dressed in, in order of preference; low ones
 *  (seen over) may stand in front of the lane. */
const SITES: Record<string, readonly SiteKind[]> = {
  gallery: ["work", "camp", "collapse", "ore", "stalagmites"], hollow: ["mushrooms", "lake", "mushrooms", "druse", "stalagmites", "camp"],
  yard: ["ore", "work", "camp", "stalagmites"], chasm: ["stalagmites", "work", "druse", "camp"], grotto: ["druse", "lake", "stalagmites", "druse", "work"],
  falls: ["lake", "mushrooms", "camp", "stalagmites", "druse"], forge: ["work", "ore", "collapse", "stalagmites"], shaft: ["work", "camp", "ore", "collapse"],
  collapse: ["collapse", "collapse", "work", "stalagmites"], boiler: ["work", "camp", "ore", "stalagmites"], lavafalls: ["stalagmites", "collapse", "ore", "druse"],
  frozen: ["lake", "stalagmites", "druse", "stalagmites", "mushrooms"], vault: ["work", "camp", "ore", "stalagmites"], lode: ["druse", "work", "ore", "collapse"],
};
const LOW: ReadonlySet<SiteKind> = new Set(["druse", "lake"]);
const ALL_SITES: readonly SiteKind[] = ["work", "camp", "ore", "collapse", "mushrooms", "stalagmites", "druse", "lake"];
/**
 * Where a hole's sites stand: four or five, round the lane at the other
 * worlds' distance (a few units off it, behind and at its sides; a low one in
 * front), well apart, on the floor (off every drop); the biome says what.
 */
function planSites(s: Hole, f: { dist: Height; back: Height; drop: Height; rim: Height; W: number; H: number; cx: number; cz: number; ax: number; az: number }, ground: Height): Site[] {
  const rand = seeded("sites" + s.hole), kinds = SITES[biomeOf(s)], out: Site[] = [];
  const want = quality.low ? 3 : 5;
  const cands: { x: number; z: number; score: number }[] = [];
  for (let x = f.cx - f.ax + 4; x < f.cx + f.ax - 4; x += 2.5)
    for (let z = f.cz - f.az + 4; z < f.H + LEDGE - 2; z += 2.5) {
      const d = f.dist(x, z);
      if (d < 4.5 || d > 26 || f.rim(x, z) > 0.86) continue;
      cands.push({ x: x + (rand() - 0.5), z: z + (rand() - 0.5), score: Math.abs(d - 10) + rand() * 5 });
    }
  cands.sort((a, b) => a.score - b.score);
  for (const c of cands) {
    if (out.length >= want) break;
    // (the biome's own kinds first, each once; then any other kind not yet on the hole: no two alike in view)
    const tall = f.back(c.x, c.z) > 7, fits = (k: SiteKind) => tall || LOW.has(k), used = new Set(out.map((q) => q.kind));
    const kind = kinds.find((k) => fits(k) && !used.has(k)) ?? ALL_SITES.find((k) => fits(k) && !used.has(k));
    if (!kind) continue;
    const r = (kind === "work" ? 6.5 : kind === "lake" ? 7 : kind === "druse" || kind === "ore" ? 4.5 : 5) * (f.dist(c.x, c.z) > 11 ? 1.7 : 1.35);
    if (f.drop(c.x, c.z) < r + 1 || f.dist(c.x, c.z) < r + 2 || out.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < q.r + r + 3)) continue;
    // (a work site needs its tunnel mouth behind: a spot the lane is well in front of)
    if (kind === "work" && f.back(c.x, c.z) < 11) continue;
    out.push({ x: c.x, z: c.z, r, y: ground(c.x, c.z) - GRASS, kind, tall, k: r / (kind === "work" ? 6.5 : kind === "lake" ? 7 : kind === "druse" || kind === "ore" ? 4.5 : 5) });
  }
  // and along the floor in front of the lane (a narrow band before the
  // ledge): small low ones, a row of them
  const FRONT: readonly SiteKind[] = ["druse", "lake"];
  for (let x = f.cx - f.ax + 6, k = 0; x < f.cx + f.ax - 6 && k < (quality.low ? 1 : 2); x += 9 + rand() * 5) {
    for (let z = f.H + 2; z < f.H + LEDGE; z += 1.5) {
      const r = 3.2 + rand() * 0.8, kind = FRONT.find((q) => !out.some((o) => o.kind === q));
      if (!kind) break; // (none twice on the hole)
      if (f.drop(x, z) < r + 0.4 || f.dist(x, z) < r + 1.4 || f.dist(x, z) > 16 || out.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r + 1.5)) continue;
      out.push({ x, z, r, y: ground(x, z) - GRASS, kind, tall: false, k: r / (kind === "lake" ? 7 : kind === "druse" || kind === "ore" ? 4.5 : 5) });
      k++;
      break;
    }
  }
  for (const q of out) q.y = Math.max(0, q.y) + GRASS;
  return out;
}

// ------------------------------------------------------------ the terraces
//
// A lane in parts joined only by geysers (the Geysers' terraces): each part
// a step higher than the one its geyser throws from, so the climb reads as a
// climb and not as walls on one floor. Cosmetic: the ball is drawn on it
// (course.ts takes the world's lifted terrain), the chain's physics is flat.

const STEP_UP = 1.4;
const lifts = new WeakMap<Hole, Terrain | null>();
function lifted(s: Hole): Terrain | null {
  if (lifts.has(s)) return lifts.get(s)!;
  const geysers = (s.zones || []).filter((q) => q.kind === "tunnel" && q.skin === "geyser");
  const t = terrain(s);
  let out: Terrain | null = null;
  if (geysers.length) {
    // the lane's parts: its cells joined across no wall (a cell a wall runs
    // through belongs to no part)
    const walls = (s.walls || []).filter((w) => !w.every), nx = t.nx, nz = t.nz;
    const label = new Int32Array(nx * nz).fill(-1);
    const free = (i: number, j: number) => t.inGrid(i, j) && !!t.green[t.idx(i, j)] && !walls.some((w) => segDist((i + 0.5) * CELL, (j + 0.5) * CELL, w.a, w.b) < 0.3);
    let parts = 0;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        if (label[t.idx(i, j)] >= 0 || !free(i, j)) continue;
        const stack = [[i, j]];
        label[t.idx(i, j)] = parts;
        while (stack.length) {
          const [a, b] = stack.pop()!;
          for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = a + da, d = b + db;
            if (free(c, d) && label[t.idx(c, d)] < 0) (label[t.idx(c, d)] = parts), stack.push([c, d]);
          }
        }
        parts++;
      }
    const partAt = (x: number, z: number) => { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); return t.inGrid(i, j) ? label[t.idx(i, j)] : -1; };
    // levels: the tee's part at 0, each geyser's exit a step over its mouth's
    const level = new Float32Array(parts).fill(-1);
    const tee = partAt(s.start[0], s.start[1]);
    if (tee >= 0) level[tee] = 0;
    for (let pass = 0; pass < geysers.length + 1; pass++)
      for (const q of geysers) {
        const a = partAt(boxOf(q).cx, boxOf(q).cz), b = partAt(q.vec[0], q.vec[1]);
        if (a >= 0 && b >= 0 && level[a] >= 0 && level[b] < 0) level[b] = level[a] + 1;
      }
    if (level.some((v) => v > 0)) {
      // a point's step: its part's, or (under a wall) the highest of the parts
      // round it, so the wall stands on the upper side and drops to the lower
      const stepAt = (x: number, z: number) => {
        const p = partAt(x, z);
        if (p >= 0) return Math.max(0, level[p]);
        let best = 0;
        for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]]) {
          const q = partAt(x + dx, z + dz);
          if (q >= 0) best = Math.max(best, level[q]);
        }
        return best;
      };
      const h0 = t.height, g0 = t.ground;
      out = { ...t, height: (x, z) => h0(x, z) + STEP_UP * stepAt(x, z), ground: (x, z) => g0(x, z) + STEP_UP * stepAt(x, z) };
    }
  }
  lifts.set(s, out);
  return out;
}

// ------------------------------------------------------------ the land

/** A lit point: the pools of light and the glows are its (see Pool, Glow). */
function light(cv: Cave, x: number, y: number, z: number, c: number, { r = 4, k = 0.7, lamp = false, glow = 1.6 } = {}) {
  cv.pools.push({ x, y, z, r, c: new THREE.Color(c), k, lamp });
  if (glow) cv.glows.push({ x, y, z, c, s: glow, lamp });
}

/**
 * The floor: one sheet of slate over the shell's footprint, fine near the
 * board and coarser out to the wall, not drawn under the lane nor over a
 * drop; its edge over a drop snapped onto the drop's outline, and a cut face
 * in strata going down into the dark (as the lane's own over the void).
 */
function floorMesh(cv: Cave) {
  const { W, H, drop, floor, rim } = cv;
  const x0 = cv.cx - cv.ax, x1 = cv.cx + cv.ax, z0 = cv.cz - cv.az, z1 = H + LEDGE + 3;
  const axis = (lo: number, hi: number, a: number, b: number, step: number) => {
    const v: number[] = [];
    for (let u = lo; u < a; u += 2.4) v.push(u);
    for (let u = Math.max(lo, a); u < Math.min(hi, b); u += step) v.push(u);
    for (let u = Math.min(hi, b); u < hi; u += 2.4) v.push(u);
    v.push(hi);
    return v;
  };
  // (a big board's floor coarser: its cells as many as a middling one's)
  const fine_ = Math.max(1.3, Math.sqrt(((W + 16) * (H + LEDGE + 11)) / 2800));
  const xs = axis(x0, x1, -8, W + 8, fine_), zs = axis(z0, z1, -8, H + LEDGE + 3, fine_);
  const nx = xs.length, nz = zs.length;
  // a corner on the drop's edge goes onto the edge (along the gradient)
  const snap = (x0: number, z0: number): MutVec2 => {
    let x = x0, z = z0;
    for (let k = 0; k < 3; k++) {
      const s0 = drop(x, z), e = 0.05, gx = (drop(x + e, z) - drop(x - e, z)) / (2 * e), gz = (drop(x, z + e) - drop(x, z - e)) / (2 * e), g2 = gx * gx + gz * gz || 1;
      x -= (s0 * gx) / g2;
      z -= (s0 * gz) / g2;
    }
    // (not past its own cell: at a corner of the drop the gradient can send it across the board)
    return Math.hypot(x - x0, z - z0) > fine_ ? [x0, z0] : [x, z];
  };
  const keep = new Uint8Array((nx - 1) * (nz - 1));
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
      // off where the lane covers it all, over a drop, past the shell
      const under = [[xs[i], zs[j]], [xs[i + 1], zs[j]], [xs[i], zs[j + 1]], [xs[i + 1], zs[j + 1]]].every(([x, z]) => cv.dist(x, z) < 0.3);
      keep[j * (nx - 1) + i] = +(drop(mx, mz) > 0 && rim(mx, mz) < 1.01 && !under);
    }
  const kept = (i: number, j: number) => i >= 0 && j >= 0 && i < nx - 1 && j < nz - 1 && !!keep[j * (nx - 1) + i];
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const vid = new Int32Array(nx * nz).fill(-1);
  const c = new THREE.Color(), slate = new THREE.Color(MINES.slate), dark = new THREE.Color(MINES.slateDark), rock = new THREE.Color(), hi = new THREE.Color(MINES.rockHi);
  const STRATA = [MINES.basalt, MINES.umber, 0x453d5c, MINES.basalt, 0x524034];
  const vert = (i: number, j: number) => {
    const k = j * nx + i;
    if (vid[k] >= 0) return vid[k];
    let [x, z] = [xs[i], zs[j]];
    // (a corner of a kept cell beside one over a drop: on the edge)
    if ([[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]].some(([a, b]) => a >= 0 && b >= 0 && a < nx - 1 && b < nz - 1 && drop((xs[a] + xs[a + 1]) / 2, (zs[b] + zs[b + 1]) / 2) <= 0)) [x, z] = snap(x, z);
    const y = floor(x, z), up = y - GRASS, e = 0.3;
    const slope = Math.hypot(floor(x + e, z) - floor(x - e, z), floor(x, z + e) - floor(x, z - e)) / (2 * e);
    // slate on the flat (lighter up on a shelf), rock in strata where it
    // rises steeply (a terrace's face, the ridge); chips of a lighter stone
    rock.set(STRATA[Math.floor((y + 3) / 0.45) % STRATA.length]);
    c.copy(slate).lerp(dark, 0.35 + 0.3 * noise(x * 0.9, z * 0.7)).lerp(hi, Math.min(0.3, up * 0.07)).lerp(rock, 0.85 * smoothstep((slope - 0.45) / 0.5));
    if (fine(x * 2.1, z * 1.7) > 0.8) c.lerp(hi, 0.25);
    // big patches over the floor (earth, pale stone), and round each site its
    // own ground: trodden earth where people work, moss where it is wet
    c.lerp(EARTH, 0.35 * smoothstep((noise(x * 0.07 + 11, z * 0.09) - 0.1) / 0.3)).lerp(hi, 0.2 * smoothstep((noise(x * 0.11 - 4, z * 0.07 + 6) - 0.3) / 0.3));
    for (const q of cv.sites) {
      const d = Math.hypot(x - q.x, z - q.z) / (q.r + 1.5);
      if (d < 1) c.lerp(SITE_GROUND[q.kind], 0.55 * smoothstep((1 - d) / 0.4));
    }
    pos.push(x, y, z);
    col.push(c.r, c.g, c.b);
    return (vid[k] = pos.length / 3 - 1);
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      if (!kept(i, j)) continue;
      const a = vert(i, j), b = vert(i + 1, j), d = vert(i, j + 1), e = vert(i + 1, j + 1);
      idx.push(a, d, b, b, d, e);
    }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geoOf(pos, idx, col), relief()));
  // the cut face down every edge over a drop
  const fp: number[] = [], fc: number[] = [], band = new THREE.Color(), low = new THREE.Color();
  const face = (p: number, q: number) => {
    const P = [pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2]], Q = [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    const ex = Q[0] - P[0], ez = Q[2] - P[2], l = Math.hypot(ex, ez) || 1;
    let nxv = ez / l, nzv = -ex / l;
    const mx = (P[0] + Q[0]) / 2, mz = (P[2] + Q[2]) / 2;
    if (drop(mx + nxv * 0.3, mz + nzv * 0.3) > drop(mx - nxv * 0.3, mz - nzv * 0.3)) (nxv = -nxv), (nzv = -nzv); // toward the drop
    const row = (v: number[], k: number) => {
      const [dy, out] = VOID_ROWS[k], jag = k && k < VOID_ROWS.length - 1 ? 0.12 * Math.sin(v[0] * 1.9 + v[2] * 1.3 + k * 2.1) : 0;
      return [v[0] + nxv * (out + jag), k === VOID_ROWS.length - 1 ? VOID_FLOOR - 0.4 : v[1] + dy, v[2] + nzv * (out + jag)];
    };
    for (let k = 0; k + 1 < VOID_ROWS.length; k++) {
      const a0 = row(P, k), a1 = row(P, k + 1), b1 = row(Q, k + 1), b0 = row(Q, k);
      band.set(VOID_BANDS[k]);
      low.set(VOID_BANDS[k + 1]);
      for (const [v, cc] of [[a0, band], [a1, low], [b1, low], [a0, band], [b1, low], [b0, band]] as const) fp.push(...v), fc.push(cc.r, cc.g, cc.b);
    }
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      if (!kept(i, j)) continue;
      const open = (a: number, b: number) => a >= 0 && b >= 0 && a < nx - 1 && b < nz - 1 && !kept(a, b) && drop((xs[a] + xs[a + 1]) / 2, (zs[b] + zs[b + 1]) / 2) <= 0;
      if (open(i, j - 1)) face(vert(i + 1, j), vert(i, j));
      if (open(i, j + 1)) face(vert(i, j + 1), vert(i + 1, j + 1));
      if (open(i - 1, j)) face(vert(i, j), vert(i, j + 1));
      if (open(i + 1, j)) face(vert(i + 1, j + 1), vert(i + 1, j));
    }
  if (fp.length) {
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute("color", new THREE.Float32BufferAttribute(fc, 3));
    fg.computeVertexNormals();
    g.add(new THREE.Mesh(fg, relief(THREE.DoubleSide)));
  }
  return g;
}

/** Where the shell's galleries open (angles round it, behind and at the
 *  sides): a hole's own, two or three. */
function galleriesOf(s: Hole) {
  const rand = seeded("gallery" + s.hole), n = 2 + Math.floor(rand() * 2), out: number[] = [];
  // (angle 0 is +x; behind the board is -π/2)
  const spots = [-Math.PI / 2 - 0.55, -Math.PI / 2 + 0.5, -Math.PI + 0.2, 0.2, -Math.PI / 2 - 0.05];
  for (let k = 0; out.length < n && k < 20; k++) {
    const a = spots[Math.floor(rand() * spots.length)] + (rand() - 0.5) * 0.15;
    if (out.every((b) => Math.abs(b - a) > 0.4)) out.push(a);
  }
  return out;
}
const GALLERY_HALF = 0.05, GALLERY_ROWS = 2; // an opening's half-angle, and the rows of the shell it takes

/**
 * The shell: the cave's wall rising from the floor's edge (from the chasm's
 * depth in front) and curving over into the vault, one mesh of big facets,
 * rock in strata at its foot going into the vault's dark over it; openings
 * into other galleries; stalactites hanging from the vault, crystals growing
 * out of the wall and veins of crystal running up it, glowworms over it all.
 */
const VAULT_ROW = 6; // the rows from which the shell is the vault
const THREAD = share(new THREE.LineBasicMaterial({ color: 0x8fe8f0, transparent: true, opacity: 0.85, fog: false }));
// the vault's material: unlit, and not drawn over the eye (a camera up at the
// vault's height, or over it, sees down into the cave, not its underside)
const VAULT_MAT = (() => {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying float vVaultY;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vVaultY = (modelMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = "varying float vVaultY;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n  if (cameraPosition.y > vVaultY - 6.0) discard;");
  };
  m.customProgramCacheKey = () => "minesVault";
  md(m).hook = "minesVault";
  return share(m);
})();
const ROWS: readonly (readonly [number, number])[] = [[0, 0], [2.5, 0.006], [6, 0.018], [10, 0.04], [14, 0.08], [18, 0.16], [22, 0.29], [25.5, 0.45], [28, 0.63], [30, 0.82], [VAULT, 1]];
function shell(cv: Cave, rand: Rand) {
  const g = new THREE.Group();
  const N = 76, R = ROWS.length;
  const gal = galleriesOf(cv.s);
  const apex = new THREE.Vector3(cv.cx, GRASS + VAULT, cv.cz);
  // a point on the footprint's rim at angle a
  const rimAt = (a: number): MutVec2 => {
    const c = Math.cos(a), s = Math.sin(a), k = Math.pow(Math.abs(c) ** 4 + Math.abs(s) ** 4, -0.25);
    return [cv.cx + cv.ax * c * k, cv.cz + cv.az * s * k];
  };
  const P: THREE.Vector3[][] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI, [rx, rz] = rimAt(a);
    const base = cv.drop(rx, rz) > 0 ? cv.floor(rx, rz) - 0.6 : VOID_FLOOR - 0.6;
    const col: THREE.Vector3[] = [];
    for (let k = 0; k < R; k++) {
      const [y, f] = ROWS[k];
      // rock: pushed in and out by a noise of its own, less up in the vault
      const bump = (k === R - 1 ? 0 : 1) * (1.4 * noise(a * 9, k * 1.7) + 0.7 * fine(a * 17, k * 2.3)) * (k < 6 ? 1 : 0.5);
      const p = new THREE.Vector3(rx + (apex.x - rx) * f, Math.max(base, GRASS + y) + (k ? 0.6 * fine(a * 13, k) : 0), rz + (apex.z - rz) * f);
      const dx = apex.x - rx, dz = apex.z - rz, l = Math.hypot(dx, dz) || 1;
      p.x += (dx / l) * bump;
      p.z += (dz / l) * bump;
      col.push(p);
    }
    P.push(col);
  }
  const open = (i: number, k: number) => k < GALLERY_ROWS && gal.some((b) => Math.abs(Math.atan2(Math.sin((i + 0.5) / N * Math.PI * 2 - Math.PI - b), Math.cos((i + 0.5) / N * Math.PI * 2 - Math.PI - b))) < GALLERY_HALF);
  const pos: number[] = [], col: number[] = [], c = new THREE.Color(), cv0 = new THREE.Color(MINES.vault), cv1 = new THREE.Color(MINES.vaultHi);
  const STRATA = [MINES.basalt, 0x46405e, MINES.umber, 0x3f3754, 0x4c3d33];
  const tone = (p: THREE.Vector3, i: number, k: number) => {
    const up = p.y - GRASS;
    c.set(STRATA[(Math.floor(up / 1.9) + (i % 7 === 0 ? 1 : 0)) % STRATA.length]);
    // up in the vault the rock goes into its dark
    c.lerp(cv1, smoothstep((up - 10) / 10)).lerp(cv0, smoothstep((k - VAULT_ROW) / 3));
    return c;
  };
  // the wall in lit facets; the vault over it unlit, in its own dark (seen
  // from a camera over it, lit facets fanning to its top read as a star)
  const vp: number[] = [], vc: number[] = [];
  for (let i = 0; i < N; i++)
    for (let k = 0; k < R - 1; k++) {
      if (open(i, k)) continue;
      const a = P[i][k], b = P[(i + 1) % N][k], d = P[i][k + 1], e = P[(i + 1) % N][k + 1];
      const [op, oc] = k < VAULT_ROW ? [pos, col] : [vp, vc];
      // (wound to face in: the camera is inside)
      for (const [p, ii, kk] of [[a, i, k], [b, i + 1, k], [d, i, k + 1], [b, i + 1, k], [e, i + 1, k + 1], [d, i, k + 1]] as const) {
        op.push(p.x, p.y, p.z);
        const cc = tone(p, ii, kk);
        oc.push(cc.r, cc.g, cc.b);
      }
    }
  g.add(new THREE.Mesh(geoOf(pos, null, col), relief())); // (a triangle soup: flat facets)
  g.add(new THREE.Mesh(geoOf(vp, null, vc), VAULT_MAT));

  // stalactites from the vault, and a few crystals among them
  const drips: THREE.BufferGeometry[] = [];
  // in clusters, big ones among smaller, where the wall overhangs; a forest
  // of them in the dark galleries
  const nStal = Math.round((darkGallery(cv.s) ? 26 : 14) * (quality.low ? 0.5 : 1));
  for (let n = 0; n < nStal; n++) {
    const i = Math.floor(rand() * N), k = 2 + Math.floor(rand() * (VAULT_ROW - 2)), f = rand();
    const p0 = new THREE.Vector3().lerpVectors(P[i][k], P[(i + 1) % N][k], f).lerp(P[i][k + 1], rand() * 0.5);
    // (never over the board: from a camera over the vault one would hang over the lane)
    if (p0.x > -6 && p0.x < cv.W + 6 && p0.z > -6) continue;
    const inward = new THREE.Vector3(apex.x - p0.x, 0, apex.z - p0.z).normalize(), m = 3 + Math.floor(rand() * 3);
    for (let j = 0; j < m; j++) {
      const p = p0.clone().addScaledVector(inward, 0.4 + rand() * 1.2).add(new THREE.Vector3((rand() - 0.5) * 3, 0.3, (rand() - 0.5) * 3));
      const len = j ? 2 + rand() * 3.5 : 5 + rand() * 5, r = len * (0.13 + rand() * 0.05);
      drips.push(stalactite(r, len, rand, p));
    }
  }
  if (drips.length) g.add(new THREE.Mesh(merge(drips), relief())); // (no ink: a pixel wide up there)
  // glowworm threads hanging from the wall's overhang in the dark galleries
  // and the hollows: silk lines going down, beaded with light
  if (darkGallery(cv.s) || biomeOf(cv.s) === "hollow") {
    const tp: number[] = [];
    for (let n = 0; n < 160 && tp.length < 70 * 6; n++) {
      const i = Math.floor(rand() * N), k = 2 + Math.floor(rand() * (VAULT_ROW - 2));
      const p = new THREE.Vector3().lerpVectors(P[i][k], P[(i + 1) % N][k], rand());
      if (p.x > -6 && p.x < cv.W + 6 && p.z > -6) continue;
      const inward = new THREE.Vector3(apex.x - p.x, 0, apex.z - p.z).normalize();
      p.addScaledVector(inward, 0.6 + rand() * 1.2);
      const len = 2.5 + rand() * 5;
      tp.push(p.x, p.y, p.z, p.x, p.y - len, p.z);
      for (let b = 0; b < 3; b++) cv.glows.push({ x: p.x, y: p.y - len * (0.35 + b * 0.3), z: p.z, c: b === 2 ? MINES.cyan : MINES.glowworm, s: 1 + b * 0.35, tw: 1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(tp, 3));
    g.add(new THREE.LineSegments(geo, THREAD));
  }
  // crystals out of the wall's foot, facing in, and veins up it
  for (let n = 0; n < (quality.low ? 5 : 10); n++) {
    const i = Math.floor(rand() * N), p = P[i][0].clone().lerp(P[i][1], 0.2 + rand() * 0.5);
    if (open(i, 0) || open(i, 1) || cv.drop(p.x, p.z) <= 0) continue;
    const inward = new THREE.Vector3(apex.x - p.x, 0, apex.z - p.z).normalize(), size = 1.8 + rand() * 2.4;
    const o = outcrop(rand, size);
    o.g.position.copy(p).addScaledVector(inward, size * 0.2).setY(Math.max(cv.floor(p.x, p.z), p.y - 1) - 0.2);
    o.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), inward.clone().setY(1.6).normalize());
    g.add(o.g);
    o.g.updateMatrixWorld(true);
    const at = new THREE.Vector3(0, o.top * 0.6, 0).applyMatrix4(o.g.matrixWorld);
    light(cv, at.x, at.y, at.z, o.hue, { r: 7, k: 0.55, glow: 3.2 });
  }
  g.add(veins(P, rand, open));
  // glowworms on the vault: a batch of tiny points, each its own twinkle
  for (let n = 0; n < (quality.low ? 90 : 240); n++) {
    const i = Math.floor(rand() * N), k = 5 + Math.floor(rand() * (R - 6));
    const p = new THREE.Vector3().lerpVectors(P[i][k], P[(i + 1) % N][k], rand()).lerp(P[i][k + 1], rand());
    cv.glows.push({ x: p.x, y: p.y - 0.3, z: p.z, c: rand() < 0.8 ? MINES.glowworm : MINES.cyan, s: 0.35 + rand() * 0.35, tw: 1 });
  }
  // (each tube a little wider than its opening in the wall: nothing seen past its edge)
  for (const a of gal) {
    const [x0, z0] = rimAt(a - GALLERY_HALF - 0.01), [x1, z1] = rimAt(a + GALLERY_HALF + 0.01);
    g.add(gallery(cv, rimAt(a), Math.hypot(x1 - x0, z1 - z0) / 2 + 0.8, rand));
  }
  return g;
}

/** A stalactite: a lumpy cone point down from p, its root in the rock. */
function stalactite(r: number, len: number, rand: Rand, p: THREE.Vector3) {
  const geo = new THREE.ConeGeometry(r, len, 6, 2);
  geo.rotateX(Math.PI); // point down
  const q = geo.attributes.position, ph = rand() * 6;
  for (let i = 0; i < q.count; i++) {
    const y = q.getY(i), k = 1 + 0.18 * Math.sin(Math.atan2(q.getZ(i), q.getX(i)) * 3 + ph + y);
    q.setX(i, q.getX(i) * k);
    q.setZ(i, q.getZ(i) * k);
  }
  geo.translate(0, -len / 2 + 0.4, 0);
  const col = new Float32Array(q.count * 3), a = new THREE.Color(MINES.basalt), b = new THREE.Color(MINES.rockHi);
  for (let i = 0; i < q.count; i++) {
    const c = a.clone().lerp(b, Math.min(1, -q.getY(i) / len));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo.translate(p.x, p.y, p.z);
}

/** Veins of crystal running up the wall: thin glowing ribbons over the rock,
 *  branching; one draw with every crystal. */
function veins(P: THREE.Vector3[][], rand: Rand, open: (i: number, k: number) => boolean) {
  const N = P.length, pos: number[] = [], col: number[] = [], c = new THREE.Color();
  for (let v = 0; v < (quality.low ? 4 : 9); v++) {
    let i = rand() * N, k = 0.3;
    const hue = HUES[Math.floor(rand() * HUES.length)];
    c.set(hue);
    for (let step = 0; step < 18 && k < VAULT_ROW - 1.2; step++) {
      const i2 = i + (rand() - 0.5) * 1.6, k2 = k + 0.35 + rand() * 0.25;
      if (open(Math.floor(i) % N, Math.floor(k))) break;
      const p = pt(P, i, k), q = pt(P, i2, k2), w = 0.16 * (1 - step / 20);
      const inward = new THREE.Vector3(-p.x + P[0][ROWS.length - 1].x, 0, -p.z + P[0][ROWS.length - 1].z).normalize().multiplyScalar(0.08);
      const side = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(w * 3);
      for (const x of [p.clone().sub(side), q.clone().sub(side), q.clone().add(side), p.clone().sub(side), q.clone().add(side), p.clone().add(side)]) {
        x.add(inward);
        pos.push(x.x, x.y, x.z);
        col.push(c.r, c.g, c.b);
      }
      i = i2;
      k = k2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, crystalMat());
  return m;
}
/** A point of the shell's grid, between its columns and rows. */
function pt(P: THREE.Vector3[][], i: number, k: number) {
  const N = P.length, i0 = mod(Math.floor(i), N), i1 = (i0 + 1) % N, k0 = Math.min(P[0].length - 2, Math.floor(k));
  const fi = i - Math.floor(i), fk = Math.min(1, k - k0);
  const a = P[i0][k0].clone().lerp(P[i1][k0], fi), b = P[i0][k0 + 1].clone().lerp(P[i1][k0 + 1], fi);
  return a.lerp(b, fk);
}

/**
 * A gallery going off through the shell: a mine drift, its timber sets
 * receding into the dark, rails along its floor, a string of lamps along its
 * roof, and at its end the dark or (a lava hole) the glow of lava far off.
 */
function gallery(cv: Cave, [rx, rz]: MutVec2, HW: number, rand: Rand) {
  const g = new THREE.Group();
  const out = new THREE.Vector2(rx - cv.cx, rz - cv.cz).normalize(), side = new THREE.Vector2(-out.y, out.x);
  const y0 = cv.drop(rx, rz) > 0 ? cv.floor(rx, rz) : GRASS;
  const LEN = 26, HT = 7.4, SEG = 10;
  // its tube: walls and roof, one mesh, seen from inside, going dark
  const pos: number[] = [], col: number[] = [], c = new THREE.Color();
  const prof: MutVec2[] = [];
  for (let m = 0; m <= 8; m++) {
    const th = Math.PI * (m / 8);
    prof.push([Math.cos(th) * HW * (m === 0 || m === 8 ? 1.05 : 1), HT * 0.55 + Math.sin(th) * HT * 0.45]);
  }
  prof.unshift([HW * 1.05, -0.3]);
  prof.push([-HW * 1.05, -0.3]);
  const P = (u: number, [sx, sy]: MutVec2) => {
    const d = u * LEN, jag = u > 0 ? 0.25 * fine(sx * 3 + d, sy * 2) : 0;
    return new THREE.Vector3(rx + out.x * (d - 0.8) + side.x * (sx + jag), y0 + sy + jag * 0.5, rz + out.y * (d - 0.8) + side.y * (sx + jag));
  };
  for (let s0 = 0; s0 < SEG; s0++)
    for (let m = 0; m + 1 < prof.length; m++) {
      const u0 = s0 / SEG, u1 = (s0 + 1) / SEG;
      const q = [P(u0, prof[m]), P(u1, prof[m]), P(u1, prof[m + 1]), P(u0, prof[m + 1])];
      for (const [p, u] of [[q[0], u0], [q[2], u1], [q[1], u1], [q[0], u0], [q[3], u0], [q[2], u1]] as const) {
        pos.push(p.x, p.y, p.z);
        c.set(MINES.basalt).lerp(new THREE.Color(MINES.umber), 0.3 * (m % 2)).multiplyScalar(1 - 0.85 * u);
        col.push(c.r, c.g, c.b);
      }
    }
  const tube = new THREE.BufferGeometry();
  tube.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  tube.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  tube.computeVertexNormals();
  g.add(new THREE.Mesh(tube, relief(THREE.DoubleSide)));
  // its floor, and the far end: the dark, or lava glowing
  const hot = hotHole(cv.s) && rand() < 0.7;
  const endC = hot ? 0xff6a2a : MINES.void;
  const end = new THREE.Mesh(new THREE.CircleGeometry(HW * 1.2, 12), new THREE.MeshBasicMaterial({ color: endC, fog: false }));
  end.position.set(rx + out.x * (LEN - 1), y0 + HT * 0.45, rz + out.y * (LEN - 1));
  end.lookAt(cv.cx, y0 + HT * 0.45, cv.cz);
  g.add(end);
  if (hot) for (let k = 0; k < 4; k++) cv.glows.push({ x: end.position.x - out.x * k * 1.5, y: y0 + 1 + k * 0.6, z: end.position.z - out.y * k * 1.5, c: k ? MINES.lava : MINES.lavaHi, s: 7 - k, tw: 0.3 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, LEN).rotateX(-Math.PI / 2), flat(MINES.slateDark));
  fl.rotation.y = Math.atan2(out.x, out.y);
  fl.position.set(rx + out.x * (LEN / 2 - 0.8), y0 - 0.02, rz + out.y * (LEN / 2 - 0.8));
  g.add(fl);
  // the timber sets, the rails, and a lamp under every other set
  const sets: THREE.BufferGeometry[] = [], irons: THREE.BufferGeometry[] = [];
  const turn = new THREE.Matrix4().makeRotationY(Math.atan2(out.x, out.y));
  const place = (geo: THREE.BufferGeometry, d: number, sx: number, y: number) => geo.applyMatrix4(turn).translate(rx + out.x * d + side.x * sx, y0 + y, rz + out.y * d + side.y * sx);
  for (let d = 0.4, n = 0; d < LEN - 2; d += 3.2, n++) {
    for (const sx of [-HW + 0.35, HW - 0.35]) sets.push(place(wood(new THREE.BoxGeometry(0.4, HT * 0.62, 0.4), MINES.timberDark), d, sx, HT * 0.31));
    sets.push(place(wood(new THREE.BoxGeometry(HW * 2 - 0.2, 0.42, 0.46).rotateY(Math.PI / 2), MINES.timberDark), d, 0, HT * 0.62 + 0.2));
    if (n % 2 === 0) {
      const lamp = new THREE.Vector3(rx + out.x * (d + 1.6), y0 + HT * 0.62 - 0.4, rz + out.y * (d + 1.6));
      cv.glows.push({ x: lamp.x, y: lamp.y, z: lamp.z, c: MINES.lantern, s: 2.2 * (1 - d / LEN) + 0.8, lamp: true });
    }
  }
  for (const sx of [-0.55, 0.55]) irons.push(place(new THREE.BoxGeometry(0.1, 0.12, LEN).translate(0, 0, LEN / 2 - 1), 0, sx, 0.06));
  for (let d = 0; d < LEN - 1; d += 0.9) sets.push(place(wood(new THREE.BoxGeometry(1.6, 0.08, 0.26), MINES.timberDark), d, 0, 0.03));
  g.add(drawn(merge(sets), relief(), hullOf(0.03, MINES.ink)), drawn(merge(irons), flat(MINES.iron), hullOf(0.03, MINES.ink))); // (the sets each their own tone, in the shared relief toon)
  // the portal: a big timber frame over the mouth
  const portal = new THREE.Group();
  for (const sx of [-HW - 0.2, HW + 0.2]) {
    const post = board(0.7, HT + 0.4, 0.7, MINES.timber);
    post.position.set(sx, (HT + 0.4) / 2, 0);
    portal.add(post);
  }
  const cap = board(HW * 2 + 1.8, 0.8, 0.8, MINES.timber);
  cap.position.y = HT + 0.6;
  portal.add(cap);
  portal.position.set(rx - out.x * 0.6, y0 - 0.1, rz - out.y * 0.6);
  portal.rotation.y = Math.atan2(side.x, side.y);
  g.add(portal);
  light(cv, rx - out.x * 1.8, y0 + HT * 0.7, rz - out.y * 1.8, MINES.lantern, { r: 6, k: 0.8, lamp: true, glow: 2.4 });
  return g;
}

/** The ink outlines of what stands far off the board left out (a pixel
 *  wide out there, half the cave's triangles; and a moving thing's, a draw
 *  call each): the High tier's own cut, further than the Low tier's (bake.ts
 *  INK_OFF). */
const INK_FAR = 4;
function inkNear(root: THREE.Object3D, s: Hole) {
  root.updateMatrixWorld(true);
  const drop: THREE.Object3D[] = [], c = new THREE.Vector3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !md(o.material as THREE.Material).hull || o instanceof THREE.InstancedMesh) return;
    const geo = (o as THREE.Mesh<THREE.BufferGeometry>).geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    c.copy(geo.boundingSphere!.center).applyMatrix4(o.matrixWorld);
    if (Math.max(-c.x, 0, c.x - s.board.w, -c.z, 0, c.z - s.board.h) > INK_FAR) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
}

/** Light added over what is behind it (a lamp's pool, a glow, the rim's
 *  violet) drawn before every other see-through thing: a timber faded out of
 *  the camera's way writes no depth, and a light drawn after it (sorted by
 *  its object, at the origin) showed through it as if through nothing.
 *  (Kept out of the bake's merge, which would drop the order.) */
function lightsFirst(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (!m || Array.isArray(m) || m.blending !== THREE.AdditiveBlending) return;
    o.renderOrder = -1;
    (ud(o).live = true), (o.name ||= "mines:light");
  });
}

/** Geometries merged, keeping only what they all have. */
function merge(list: THREE.BufferGeometry[]) {
  const names = ["position", "normal", "color"].filter((n) => list.every((g) => g.attributes[n]));
  const flatList = list.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (!names.includes(k)) q.deleteAttribute(k);
    return q;
  });
  let n = 0;
  for (const q of flatList) n += q.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = flatList[0].attributes[name].itemSize, arr = new Float32Array(n * size);
    let o = 0;
    for (const q of flatList) (arr.set(q.attributes[name].array, o), (o += q.attributes[name].array.length));
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (!names.includes("normal")) out.computeVertexNormals();
  return out;
}

/** The hot holes: lava on the lane (and the boss). */
function hotHole(s: Hole) {
  return [7, 11, 13, 18].includes(minesOrder(s)) || (s.zones || []).some((q) => q.skin.startsWith("lava"));
}

function base(s: Hole) {
  const cv = caveOf(s), rand = seeded("mines" + s.hole);
  const g = new THREE.Group();
  g.name = "mines:cave"; // (the probes say whose a surface is by its nearest named group)
  g.add(floorMesh(cv), shell(cv, rand));
  inkNear(g, s);
  g.add(pitFloor(cv));
  return g;
}

/** The ground round the board is the floor's (base); decor stands on it. */
function berms(s: Hole) {
  return { group: new THREE.Group(), height: caveOf(s).floor };
}

// ------------------------------------------------------------ the edge

/**
 * Round the lane: over the void, a border along its edge — kerb stones set
 * flush with the lane, or on a gantry the timber fascia of its deck — the
 * miners' gear down its cut face, and deep under the lip a faint violet glow,
 * the abyss's own light. (The lane's edge wear is its texture's: laneLook,
 * from the distance texture the course owns: baked.)
 */
function edging(s: Hole) {
  const cv = caveOf(s), g = new THREE.Group();
  g.name = "mines:edge";
  const edges = cv.voids.length ? voidEdges(cv.voids) : [];
  if (edges.length) g.add(voidTrim(cv, edges, surfaceOf(s) === "planks"));
  if (edges.length && surfaceOf(s) !== "planks") g.add(voidRim(cv, edges)); // (a gantry's deck is open under: no rim)
  if (edges.length && surfaceOf(s) !== "planks") g.add(faceGear(cv, edges));
  if (lifted(s)) g.add(risers(cv));
  if (surfaceOf(s) === "planks") g.add(deckOf(cv));
  g.add(lostRails(cv));
  lightsFirst(g);
  return g;
}

/**
 * The lane's border over the void: kerb stones, blocky and inked, laid on
 * its rim just inside the edge, a hair proud of it (a border, not a rail:
 * nothing a ball meets; nothing out over the drop, clear of the cut face
 * below); on a gantry, the deck's timber fascia. One mesh (and its ink),
 * baked with the rest.
 */
function voidTrim(cv: Cave, edges: readonly (readonly [Vec2, Vec2])[], timber: boolean) {
  const rand = seeded("trim" + cv.s.hole), items: { x: number; z: number; y: number; a: number; l: number; h: number; p: number }[] = [];
  const sunk = cv.s.zones.filter((q) => q.skin !== "void"), piles: THREE.BufferGeometry[] = [], trestles: THREE.Object3D[] = [];
  for (const [a, b] of edges) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-3) continue;
    let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!cv.voidAt(mx + nx * 0.3, mz + nz * 0.3)) (nx = -nx), (nz = -nz);
    const step = timber ? 1.6 : 1.8, n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, out = timber ? 0.05 : -0.13; // (a fascia's faces on the edge and 0.1 out over the drop: nothing of it over the lane, nor further out)
      // (a piece's patch reaches a hair past its outline: kept that far from it, along the whole stone)
      const L2 = (L / n) * 0.55, dx = ((b[0] - a[0]) / L) * L2, dz = ((b[1] - a[1]) / L) * L2;
      if (sunk.some((q) => [[0, 0], [dx, dz], [-dx, -dz]].some(([ex, ez]) => [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].some(([ox, oz]) => inZone(q, x - nx * 0.4 + ex + ox, z - nz * 0.4 + ez + oz)))) || walled(cv, x, z)) continue; // (no plain lane there: a pool's or a shaft's own rim, a piece's (a bridge, a ramp); a wall on the edge is its own border)
      // (along the lane as it lies: its height at both ends, the stone pitched to them)
      const l = (L / n) * (timber ? 1.02 : 0.8 + rand() * 0.08), tx = ((b[0] - a[0]) / L) * l * 0.5, tz = ((b[1] - a[1]) / L) * l * 0.5, ix = x - nx * 0.2, iz = z - nz * 0.2;
      const h0 = cv.t.height(ix - tx, iz - tz), h1 = cv.t.height(ix + tx, iz + tz);
      // (none where the lane tilts across its edge, a ramp's: a flat stone would stand proud of it)
      // (nor where it bends along the edge, a crease under the stone's middle)
      // (a gantry's fascia: none over a fold, where a ramp meets the flat, nor on a
      // corner's short cut: one straight board there would stand off the deck's edge)
      if (timber ? Math.abs(cv.t.height(ix, iz) - (h0 + h1) / 2) > 0.03 || L < 1.2 : Math.abs(cv.t.height(x - nx * 0.3, z - nz * 0.3) - cv.t.height(x - nx * 0.02, z - nz * 0.02)) > 0.03 || Math.abs(cv.t.height(ix, iz) - (h0 + h1) / 2) > 0.03) continue;
      items.push({ x: x + nx * out, z: z + nz * out, y: (h0 + h1) / 2 + (timber ? 0 : 0.03), a: Math.atan2(b[0] - a[0], b[1] - a[1]), l, h: timber ? 1 : 0.8 + rand() * 0.4, p: -Math.atan2(h1 - h0, l) });
      // a gantry's legs, every third board, under its deck down into the dark
      // (or the lake): a braced trestle across it where the deck is wide
      // enough to stand one on (the deck builder's, mines-toon), else a pile
      if (timber && k % 3 === 1) {
        const top = cv.t.height(x - nx * 0.4, z - nz * 0.4) - 0.3;
        if (cv.lane(x - nx * 1.6, z - nz * 1.6)) {
          trestles.push(trestle(new THREE.Vector3(x - nx * 0.8, top, z - nz * 0.8), VOID_FLOOR - 0.2, 1.4, Math.atan2(nx, nz)));
          for (const d of [0.25, 1.35]) cv.lake?.field.stamp(x - nx * d, z - nz * d, 0.12);
        } else piles.push(pile(cv, x - nx * 0.25, z - nz * 0.25, top));
      }
    }
  }
  const g = new THREE.Group();
  if (piles.length) g.add(drawn(merge(piles), relief(), hullOf(0.03, MINES.ink)));
  if (trestles.length) g.add(...trestles);
  if (!items.length) return g;
  // the piece: a unit along z, its top at 0
  let geo: THREE.BufferGeometry;
  if (timber) {
    geo = new THREE.BoxGeometry(0.1, 0.4, 1);
    const p = geo.attributes.position; // (its top edge bevelled)
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.6);
    geo.translate(0, -0.2 + 0.05, 0);
    paint(geo, (_x, y, z, c) => c.set(MINES.timber).multiplyScalar(0.8 + 0.2 * (y + 0.35) / 0.4 - 0.08 * Math.abs(z)));
  } else {
    geo = new THREE.BoxGeometry(0.22, 0.34, 1, 1, 2, 1);
    // (its top edges and ends bevelled: a dressed stone, not a sawn block; its sides
    // straight up to a hair over the lane, the bevel only above: nowhere in the lane's plane)
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.1) p.setXYZ(i, p.getX(i) * 0.7, y, p.getZ(i) * 0.9);
      else if (Math.abs(y) < 0.01) p.setY(i, 0.13); // (the middle row just under the top: 0.01 over the lane once set)
    }
    geo.translate(0, -0.15, 0);
    const seed = rand() * 9;
    paint(geo, (x, y, z, c) => strata(y + 0.5, x, z, 0.5, c, seed));
  }
  geo.computeVertexNormals();
  // (one geometry of them all, inked: it bakes with the hole's other relief, no draws of its own)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const all = merge(items.map((it) => {
    rand(); // (the roll once drawn here: kept, the rest laid as before; none now, a stone's sides straight up, never slanting through the lane's plane)
    q.setFromEuler(e.set(it.p, it.a, 0, "YXZ"));
    return geo.clone().applyMatrix4(m.compose(v.set(it.x, it.y, it.z), q, sc.set(1, it.h, it.l)));
  }));
  g.add(drawn(all, relief(), hullOf(0.04, MINES.ink)));
  return g;
}

/** Whether a thing (placed, its matrix up to date) stands out over the void up at
 *  the lane's level near its edge: a ball going over the edge would meet it. */
function overDrop(cv: Cave, o: THREE.Object3D) {
  if (!cv.voids.length) return false;
  o.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(o);
  if (bb.isEmpty() || bb.max.y <= GRASS - 0.9) return false;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  return [[bb.min.x, bb.min.z], [bb.max.x, bb.min.z], [bb.min.x, bb.max.z], [bb.max.x, bb.max.z], [cx, cz]].some(([px, pz]) => cv.voidAt(px, pz) && cv.dist(px, pz) < 2.5);
}

/**
 * A rail on every static wall a ball can reach from the lane that may stand
 * unseen: the plain ones course.ts leaves undrawn round a void (wholly out in
 * it, or on the board's edge: there it takes the sea for the edge a player
 * reads), and the rock faces and rail guards along their whole line (their
 * pieces stand only where they have room). A timber rail on iron posts on the
 * wall's line, its face on the lane's side. One mesh and its ink, baked with the rest.
 */
function lostRails(cv: Cave) {
  const s = cv.s, parts: THREE.BufferGeometry[] = [], outside = (s.zones || []).some((q) => q.outside && q.kind === "hazard");
  const onEdge = (w: Wall) => ([0, 1] as const).some((k) => [w.a[k], w.b[k]].every((v) => Math.abs(v) < 0.01 || Math.abs(v - (k ? s.board.h : s.board.w)) < 0.01) && Math.abs(w.a[k] - w.b[k]) < 0.01);
  for (const w of s.walls || []) {
    // (a plain one course.ts leaves undrawn; a rock face or a rail guard, whose piece stands only where it has room: the rail at its foot all along, inside the rock where the rock stands)
    if (w.every || !(w.skin ? w.skin === "rockface" || w.skin === "railguard" : inSea(w, s.zones) || (outside && onEdge(w)))) continue;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (L < 0.2) continue;
    const ux = (w.b[0] - w.a[0]) / L, uz = (w.b[1] - w.a[1]) / L, ang = Math.atan2(uz, ux);
    // (the lane's side of it: the ball comes from there; none where it can't)
    let side = 0;
    for (let u = 0.1; u < L && !side; u += 0.4) for (const e of [1, -1]) if (cv.lane(w.a[0] + ux * u - uz * e * 0.6, w.a[1] + uz * u + ux * e * 0.6)) (side = e);
    if (!side) continue;
    const nx = -uz * side, nz = ux * side, y = (x: number, z: number) => cv.t.height(x + nx * 0.6, z + nz * 0.6);
    const mx = (w.a[0] + w.b[0]) / 2 - nx * 0.09, mz = (w.a[1] + w.b[1]) / 2 - nz * 0.09, my = (y(w.a[0], w.a[1]) + y(w.b[0], w.b[1])) / 2;
    parts.push(paint(new THREE.BoxGeometry(L + 0.1, 0.16, 0.18).rotateY(-ang).translate(mx, my + 0.36, mz), (_x, _y, _z, c) => c.set(MINES.timber).multiplyScalar(0.9)));
    for (let u = 0; u <= L + 1e-3 && !w.skin; u += Math.max(0.8, L / Math.ceil(L / 1.6))) { // (on a plain wall's line; a rock face's foot a rail alone)
      const px = w.a[0] + ux * u - nx * 0.09, pz = w.a[1] + uz * u - nz * 0.09;
      parts.push(paint(new THREE.BoxGeometry(0.14, 0.52, 0.14).translate(px, y(px, pz) + 0.24, pz), (_x, _y, _z, c) => c.set(MINES.iron)));
    }
  }
  const g = new THREE.Group();
  if (parts.length) g.add(drawn(merge(parts), relief(), hullOf(0.03, MINES.ink)));
  return g;
}

/**
 * A gantry's deck (a boardwalk hole's lane): the kit's boards over it, a hair
 * over the lane (dark between them: laneLook), across its run; none on a
 * piece's place (its own surface laid there) nor over the cup.
 */
function deckOf(cv: Cave) {
  const s = cv.s, laid = s.zones.filter((q) => q.skin !== "void"), cr = cupRadius(s) + 0.12;
  const inside = (x: number, z: number) => cv.lane(x, z) && !laid.some((q) => [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].some(([dx, dz]) => inZone(q, x + dx, z + dz))) && Math.hypot(x - s.cup[0], z - s.cup[1]) > cr; // (clear of a piece's patch or a ramp's boards, a hair past its outline)
  return planks([{ inside, top: (x, z) => drawnGround(cv.t, x, z) + 0.016, box: [0, 0, cv.W, cv.H], angle: s.board.w >= s.board.h ? Math.PI / 2 : 0 }], seeded("deck" + s.hole));
}

/**
 * The terraces' steps made to read: every lane cell that climbs from one
 * terrace to the next (its corners a step apart) faced in dark timber boards
 * laid up its slope, a pale nosing beam along its top (nothing standing on
 * the lane: the ball rolls over the step's edge).
 */
function risers(cv: Cave) {
  const t = cv.t, nose: THREE.BufferGeometry[] = [], rise = [new Set<number>(), new Set<number>()]; // (cells climbing along x, along z)
  const g = new THREE.Group(), ground = { height: t.ground || t.height };
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      if (!t.green[t.idx(i, j)]) continue;
      const x0 = i * CELL, z0 = j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
      // (its corners' heights as the lane's mesh takes them: a corner on a step is the upper side's)
      const hc = (x: number, z: number) => ground.height(x, z), h = [hc(x0, z0), hc(x1, z0), hc(x1, z1), hc(x0, z1)];
      if (Math.max(...h) - Math.min(...h) < 0.7) continue;
      rise[Math.abs(h[1] + h[2] - h[0] - h[3]) > Math.abs(h[2] + h[3] - h[0] - h[1]) ? 0 : 1].add(t.idx(i, j));
      // the nosing along its top: the edge between its two highest corners
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], top = [0, 1, 2, 3].sort((a, b) => h[b] - h[a]).slice(0, 2), [pa, pb] = top.map((k) => new THREE.Vector3(corners[k][0], h[k], corners[k][1]));
      if (pa.distanceTo(pb) < 1.2) {
        const d = pb.clone().sub(pa), beam = new THREE.BoxGeometry(0.2, 0.16, d.length() + 0.05).rotateY(Math.atan2(d.x, d.z)).translate((pa.x + pb.x) / 2, (pa.y + pb.y) / 2 + 0.05, (pa.z + pb.z) / 2);
        nose.push(paint(beam, (_x, _y, _z, q) => q.set(MINES.timber).multiplyScalar(1.15)));
      }
    }
  // the boards: the kit's, dark, across each rise (a row a cell, lying on the cell's slope)
  const inCell = (set: Set<number>) => (x: number, z: number) => { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); return t.inGrid(i, j) && set.has(t.idx(i, j)); };
  const spans = rise.map((set, k) => ({ inside: inCell(set), top: (x: number, z: number) => drawnGround(ground, x, z) + 0.03, box: [0, 0, cv.W, cv.H] as const, angle: k ? 0 : Math.PI / 2 })).filter((_, k) => rise[k].size);
  if (spans.length) g.add(planks(spans, seeded("risers" + cv.s.hole), { tone: MINES.timberDark }));
  if (nose.length) g.add(drawn(merge(nose), relief(), hullOf(0.03, MINES.ink)));
  return g;
}

/** A wall standing on the lane's edge at (x, z) (its own border there). */
const walled = (cv: Cave, x: number, z: number) => (cv.s.walls || []).some((w) => !w.every && segDist(x, z, w.a, w.b) < 0.6);

/** A gantry's pile from top down into the pit, wet and dark where it stands
 *  in its lake (stamped dry in it: its foam ring). */
function pile(cv: Cave, x: number, z: number, top: number) {
  // (in a lake: in two, the dry timber over a hard band of wet)
  const cut = cv.lake ? WATERLINE + 0.3 : VOID_FLOOR - 0.2, parts = [[top, cut, MINES.timberDark], [cut, VOID_FLOOR - 0.2, 0x2a2230]] as const;
  cv.lake?.field.stamp(x, z, 0.16);
  return merge(parts.filter(([a, b]) => a - b > 0.01).map(([a, b, hex]) => paint(new THREE.CylinderGeometry(0.13 + 0.01 * (top - a), 0.13 + 0.01 * (top - b), a - b, 6).translate(x, (a + b) / 2, z), (_x, _y, _z, c) => c.set(hex))));
}

/** The void's rim: a faint violet glow deep under the lane's lip, fading down
 *  the cut face (additive: it adds light, it hides nothing). */
function voidRim(cv: Cave, edges: readonly (readonly [Vec2, Vec2])[]) {
  const pos: number[] = [], col: number[] = [], top = new THREE.Color(0x241c48), foot = new THREE.Color(0x000000);
  for (const [a, b] of edges) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.2));
    let nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!cv.voidAt(mx + nx * 0.3, mz + nz * 0.3)) (nx = -nx), (nz = -nz);
    for (let k = 0; k < n; k++) {
      const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], q = [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n];
      const hp = cv.t.height(p[0] - nx * 0.2, p[1] - nz * 0.2), hq = cv.t.height(q[0] - nx * 0.2, q[1] - nz * 0.2), o = 0.3;
      const v = [[p[0] + nx * o, hp - 0.5, p[1] + nz * o, top], [p[0] + nx * o, hp - 1.6, p[1] + nz * o, foot], [q[0] + nx * o, hq - 1.6, q[1] + nz * o, foot], [q[0] + nx * o, hq - 0.5, q[1] + nz * o, top]] as const;
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [x, y, z, c] = v[i];
        pos.push(x, y, z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, RIM_MAT);
  (ud(m).live = true), (m.name ||= "mines:voidRim"); // (additive: kept out of the merge's buckets)
  return m;
}
const RIM_MAT = share(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));

/**
 * On the lane's cut face over the void, the miners' gear: ladders going
 * down into the dark, timber shoring against the rock, a lamp on a bracket
 * lighting the face (every few units, by turns).
 */
function faceGear(cv: Cave, edges: readonly (readonly [Vec2, Vec2])[]) {
  const g = new THREE.Group(), rand = seeded("face" + cv.s.hole);
  let next = 3 + rand() * 4, k = 0;
  for (const [a, b] of edges) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (!cv.voidAt(mx + nx * 0.3, mz + nz * 0.3)) (nx = -nx), (nz = -nz);
    for (let u = next; u < L; u += 5 + rand() * 5) {
      const x = a[0] + ((b[0] - a[0]) * u) / L, z = a[1] + ((b[1] - a[1]) * u) / L, y = cv.t.height(x - nx * 0.3, z - nz * 0.3);
      if (cv.back(x, z) < 2.5 && nz > 0.3) continue; // (not hanging in front of the lane from the camera)
      if (u < 1.1 || u > L - 1.1 || walled(cv, x, z) || cv.s.zones.some((q) => q.skin !== "void" && inZone(q, x - nx * 0.4, z - nz * 0.4))) continue; // (nor past a corner, out over the drop, nor under a wall or a piece)
      const kind = k++ % 3, m = faceItem(kind, rand);
      m.position.set(x + nx * 0.16, y, z + nz * 0.16); // (clear of the cut face's jagged rows)
      m.rotation.y = Math.atan2(nx, nz);
      g.add(m);
      if (kind === 2) light(cv, x + nx * 0.5, y - 1.75, z + nz * 0.5, MINES.lantern, { r: 3.5, k: 0.9, lamp: true, glow: 2.2 });
    }
    next = Math.max(0, next - L);
  }
  return g;
}
const moved = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
function faceItem(kind: number, rand: Rand) {
  const g = new THREE.Group();
  if (kind === 0) {
    // a ladder down into the dark (the gear hung from a unit under the lip:
    // nothing solid out over the drop at the lane's level)
    g.add(moved(ladder(3.6, 0.6, MINES.timber), 0, -4.5, 0.07));
  } else if (kind === 1) {
    // shoring: two posts against the face, a cap and a brace
    for (const x of [-0.7, 0.7]) g.add(moved(board(0.22, 2.6, 0.22, MINES.timberDark), x, -2.25, 0.08));
    g.add(moved(board(1.8, 0.24, 0.26, MINES.timber), 0, -1.0, 0.1));
    const brace = board(1.9, 0.14, 0.14, MINES.timberDark);
    brace.position.set(0, -1.9, 0.14);
    brace.rotation.z = 0.9 + rand() * 0.2;
    g.add(brace);
  } else {
    // a lamp on an iron bracket, low on the face (nothing out over the drop at the lane's level)
    g.add(moved(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.4), flat(MINES.iron)), 0, -1.0, 0.2));
    const l = lantern(0.9);
    l.position.set(0, -1.75, 0.38);
    g.add(l);
  }
  return g;
}



// ------------------------------------------------------------ props

/**
 * Water coming through the vault in the rain: thin streams pouring off the
 * wall's overhang onto the floor, white water running down them, a ring
 * spreading where each lands (the "wet" look: only in the rain).
 */
function trickles(cv: Cave, rand: Rand) {
  // (every stream, its pool and its ring one mesh, the shader making each:
  // a stream's white water running down, a pool still, a ring spreading and
  // fading; one draw, shown in the wet)
  const parts: THREE.BufferGeometry[] = [];
  const part = (geo: THREE.BufferGeometry, kind: number, c: THREE.Vector3, ph: number) => {
    const g = geo.toNonIndexed(), n = g.attributes.position.count;
    for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
    g.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(n).fill(kind), 1));
    g.setAttribute("aC", new THREE.BufferAttribute(new Float32Array(n * 4).map((_, i) => [c.x, c.y, c.z, ph][i % 4]), 4));
    parts.push(g);
  };
  for (let k = 0, got = 0; k < 60 && got < 5; k++) {
    const x = -4 + rand() * (cv.W + 8), z = -BACK + 2 + rand() * 4;
    if (cv.drop(x, z) < 1 || cv.dist(x, z) < 3 || cv.rim(x, z) > 0.95) continue;
    const y0 = cv.floor(x, z), h = 9 + rand() * 4, c = new THREE.Vector3(x, y0 + 0.06, z), ph = rand();
    part(new THREE.CylinderGeometry(0.06, 0.12, h, 5, 4, true).translate(x, y0 + h / 2, z), 0, c, ph);
    part(new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2).translate(x, y0 + 0.04, z), 1, c, ph);
    part(new THREE.RingGeometry(0.2, 0.28, 16).rotateX(-Math.PI / 2).translate(x, y0 + 0.06, z), 2, c, ph);
    got++;
  }
  const g = new THREE.Group();
  if (!parts.length) return g;
  const m = new THREE.Mesh(mergeGeometries(parts), STREAMS);
  m.frustumCulled = false;
  (ud(m).live = true), (m.name = "mines:trickles");
  g.add(look(m, "wet"));
  return g;
}
const STREAMS = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = "uniform float uTime;\nattribute float aKind;\nattribute vec4 aC;\nvarying float vStY;\nvarying float vKind;\nvarying float vU;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  vKind = aKind;
  vU = fract(uTime * 0.9 + aC.w);
  if (aKind > 1.5) transformed = aC.xyz + (transformed - aC.xyz) * (1.0 + vU * 3.0); // (the ring spreading)
  vStY = transformed.y;`);
    sh.fragmentShader = "uniform float uTime;\nvarying float vStY;\nvarying float vKind;\nvarying float vU;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  if (vKind < 0.5) diffuseColor = vec4(mix(vec3(0.62, 0.85, 0.94), vec3(0.95, 0.99, 1.0), step(0.7, fract(vStY * 0.9 + uTime * 2.2))), 0.8);
  else if (vKind < 1.5) diffuseColor = vec4(0.17, 0.29, 0.4, 1.0);
  else diffuseColor = vec4(0.81, 0.92, 1.0, 0.7 * (1.0 - vU));`);
  };
  m.customProgramCacheKey = () => "mines-streams";
  return share(m);
})();

/** A lamp post: a timber post with a bracket, the lantern hanging off it. */
function lampPost(rand: Rand) {
  const g = new THREE.Group();
  const post = board(0.24, 2.7, 0.24, MINES.timber);
  void rand;
  post.position.y = 1.35;
  const arm = board(0.9, 0.14, 0.14, MINES.timberDark);
  arm.position.set(0.38, 2.55, 0);
  const brace = board(0.1, 0.6, 0.1, MINES.timberDark);
  brace.position.set(0.2, 2.25, 0);
  brace.rotation.z = -0.75;
  const l = lantern(1.1);
  l.position.set(0.72, 1.72, 0);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 4), flat(MINES.iron));
  hook.position.set(0.72, 2.46, 0);
  g.add(post, arm, brace, l, hook);
  return g;
}

/** A lantern hanging from the dark on a chain, over the void: the chain
 *  going up into the vault's dark (unlit, its colour the dark's by its top). */
function hangingLamp() {
  const g = new THREE.Group();
  // (its origin at the chain's top: it swings from there)
  const chain = new THREE.CylinderGeometry(0.03, 0.03, CHAIN, 4, 6, true).translate(0, -CHAIN / 2, 0);
  const p = chain.attributes.position, col = new Float32Array(p.count * 3), a = new THREE.Color(MINES.iron), b = new THREE.Color(MINES.vault);
  for (let i = 0; i < p.count; i++) {
    const c = a.clone().lerp(b, smoothstep((p.getY(i) + CHAIN - 1) / (CHAIN * 0.5)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  chain.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const l = lantern(1.15);
  l.position.y = -CHAIN - 0.7;
  g.add(l, new THREE.Mesh(chain, CHAIN_MAT));
  return g;
}
/**
 * The hanging lamps as one mesh and one ink: every part of each lamp in its
 * vertices (its colour; its glass flagged, lit by the lamps and dimmed with
 * them, cv.lampK), each vertex knowing its lamp's hook (aHook), the shader
 * turning it about that hook a little, more and downwind in the draught.
 */
function swingingLamps(cv: Cave, hung: readonly THREE.Vector3[], rand: Rand) {
  const body: THREE.BufferGeometry[] = [], c = new THREE.Color();
  for (const p of hung) {
    const l = hangingLamp();
    l.position.copy(p);
    l.rotation.y = rand() * 6;
    l.updateMatrixWorld(true);
    l.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || md(o.material as THREE.Material).hull) return;
      // (its ink, if it has one: the hull drawn from the same geometry beside it, and how wide)
      const inked = o.parent!.children.find((q) => q !== o && q instanceof THREE.Mesh && q.geometry === o.geometry && md(q.material as THREE.Material).hull) as THREE.Mesh | undefined;
      const w = inked ? parseFloat(String(md(inked.material as THREE.Material).hook).slice(4)) || 0.055 : 0;
      const m = o.material as THREE.MeshBasicMaterial, geo = (o.geometry as THREE.BufferGeometry).toNonIndexed().applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal" && k !== "color") geo.deleteAttribute(k);
      const n = geo.attributes.position.count, col = geo.attributes.color, glow = m === GLASS ? 1 : 0;
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c.copy(m.color || c.set(0xffffff));
        if (col && m.vertexColors) c.multiply(new THREE.Color().fromBufferAttribute(col, i));
        if (glow) c.set(MINES.lantern);
        out.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
      geo.setAttribute("aHook", new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [p.x, p.y, p.z][i % 3]), 3));
      geo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
      geo.setAttribute("aInk", new THREE.BufferAttribute(new Float32Array(n).fill(w), 1));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      body.push(geo);
    });
  }
  const g = new THREE.Group();
  g.name = "mines:hanging lamps";
  ud(g).live = true;
  // (one geometry for both: the ink pushed out by each part's own width, none where a part has no ink)
  const geo = mergeGeometries(body), at = new THREE.Vector3();
  for (const mat of [LAMP_MAT(cv), LAMP_INK]) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.onBeforeRender = (_r, scene) => { const gn = gnomeIn(scene); uBall.value.copy(gn ? gn.getWorldPosition(at) : at.set(0, -99, 0)); };
    mesh.frustumCulled = false; // (they swing past their bounds)
    g.add(mesh);
  }
  return g;
}
// the swing, about each vertex's hook: as the instanced set's was (a little
// always, more and downwind in the draught)
const SWING = /* glsl */ `
  vec3 swRel = transformed - aHook;
  float swPh = aHook.x * 0.37 + aHook.z * 0.21, swK = 0.012 + min(0.09, length(uWind) * 0.8);
  float swX = sin(uTime * 1.1 + swPh) * swK + uWind.y * 0.6, swZ = sin(uTime * 0.9 + swPh * 1.7) * swK - uWind.x * 0.6;
  swRel = vec3(swRel.x * cos(swZ) - swRel.y * sin(swZ), swRel.x * sin(swZ) + swRel.y * cos(swZ), swRel.z);
  swRel = vec3(swRel.x, swRel.y * cos(swX) - swRel.z * sin(swX), swRel.y * sin(swX) + swRel.z * cos(swX));
  transformed = aHook + swRel;`;
const swingHead = "uniform float uTime;\nuniform vec2 uWind;\nuniform vec3 uBall;\nattribute vec3 aHook;\nattribute float aGlow;\nattribute float aInk;\nvarying float vGlow;\nvarying float vFade;\n";
// the ball as drawn (a lamp between the camera and it fades out: SIGHT), set each frame by the lamps
const uBall = { value: new THREE.Vector3(0, -99, 0) };
// how much a lamp (its body: CHAIN + 0.4 under its hook) stands in the camera's line to the ball
const SIGHT = /* glsl */ `
  vec3 sgC = aHook - vec3(0.0, 9.4, 0.0), sgD = uBall + vec3(0.0, 0.5, 0.0) - cameraPosition;
  float sgT = clamp(dot(sgC - cameraPosition, sgD) / max(dot(sgD, sgD), 1e-4), 0.0, 1.0);
  vFade = uBall.y < -50.0 ? 0.0 : 1.0 - smoothstep(0.9, 1.8, length(cameraPosition + sgD * sgT - sgC));`;
// (a faded lamp's pixels dithered away: opaque still, no sorting)
const DITHER = "  if (vFade > 0.0 && fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125) < vFade) discard;\n";
const LAMP_MAT = (cv: Cave) => {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: relief().gradientMap });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime, uWind: { value: windNow() }, uLampK: cv.lampK, uDead: { value: DEAD_GLASS } });
    sh.uniforms.uBall = uBall;
    sh.vertexShader = swingHead + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vGlow = aGlow;" + SIGHT + SWING);
    sh.fragmentShader = "uniform float uLampK;\nuniform vec3 uDead;\nvarying float vGlow;\nvarying float vFade;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n" + DITHER).replace(
      "#include <opaque_fragment>",
      "outgoingLight = mix(outgoingLight, mix(uDead, diffuseColor.rgb, uLampK), vGlow);\n#include <opaque_fragment>",
    );
  };
  m.customProgramCacheKey = () => "mines-lamps";
  return m;
};
const LAMP_INK = (() => {
  const m = new THREE.MeshBasicMaterial({ color: MINES.ink, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime, uWind: { value: windNow() }, uBall });
    sh.fragmentShader = "varying float vFade;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n" + DITHER);
    sh.vertexShader = swingHead + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vGlow = aGlow;\n  transformed += normal * aInk;" + SIGHT + SWING)
      .replace("#include <project_vertex>", "#include <project_vertex>\n  if (aInk <= 0.0) gl_Position = vec4(0.0); // (no ink on this part: its triangles folded away)");
  };
  m.customProgramCacheKey = () => "mines-lamps-ink";
  md(m).hull = true;
  return share(m);
})();

const CHAIN = 9;
const CHAIN_MAT = share(new THREE.MeshBasicMaterial({ vertexColors: true }));

// ------------------------------------------------------------ decor

function decor(s: Hole, bank: Height = caveOf(s).floor) {
  const cv = caveOf(s), g = new THREE.Group();
  g.name = "mines:decor";
  const rand = seeded("mines-decor" + s.hole), dark = darkGallery(s);
  const { free, reserve } = placer();
  // a spot off the lane, on the floor, clear of the rest
  const ok = (x: number, z: number, r: number, clear = 0.9) => free(x, z, r) && cv.drop(x, z) > r + 0.3 && cv.dist(x, z) > r + clear && cv.rim(x, z) < 0.96;
  // (on ground level enough to stand on, nothing standing out over the floor
  // falling away on the rim's talus: a prop turned down there (its room kept
  // all the same, the rest laid out as it was), a set piece on its posts
  // footed at the lowest of the ground under it, dug into the rest)
  const footing = (x: number, z: number, r: number) => Math.min(bank(x, z), ...[0, 1, 2, 3, 4, 5].map((k) => bank(x + Math.cos(k * 1.05) * r, z + Math.sin(k * 1.05) * r)));
  const place = <T extends THREE.Object3D>(m: T, x: number, z: number, r: number, rot = 0, clear = 0.9) => {
    if (!ok(x, z, r, clear)) return null;
    const y = bank(x, z), low = footing(x, z, r), steep = y - low > 0.4;
    if (steep && r < 2) return reserve(x, z, r), null;
    m.position.set(x, (steep ? low : y) - 0.05, z);
    m.rotation.y = rot;
    if (overDrop(cv, m)) return reserve(x, z, r), null;
    g.add(m);
    reserve(x, z, r);
    return m;
  };
  // the tee and the cup: room for the gnome, nothing tall
  reserve(s.start[0], s.start[1], 2.5);
  reserve(s.cup[0], s.cup[1], 2.5);
  g.add(signs(s, { t: cv.t, ok, reserve, bank, lamp: lantern, light: (p) => light(cv, p.x, p.y, p.z, MINES.lantern, { r: 5.5, k: 0.9, lamp: true, glow: 2.6 }) })); // (mines-signs.ts: first, the signs take their spots)

  // lanterns along the lane: on posts beside it, behind (not between it and
  // the camera), or over the void on chains from the vault
  if (!dark) {
    const spots: [number, number, number, number][] = [];
    const along = (a: Vec2, b: Vec2, off: number, out: (x: number, z: number) => boolean) => {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = -(b[1] - a[1]) / (L || 1), nz = (b[0] - a[0]) / (L || 1);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (!out(mx + nx * 0.6, mz + nz * 0.6)) (nx = -nx), (nz = -nz);
      for (let u = rand() * 3; u < L; u += 4) spots.push([a[0] + ((b[0] - a[0]) * u) / L + nx * off, a[1] + ((b[1] - a[1]) * u) / L + nz * off, nx, nz]);
    };
    if (cv.voids.length) for (const [a, b] of voidEdges(cv.voids)) along(a, b, 1.9, cv.voidAt);
    else for (const w of s.walls || []) if (!w.every) along(w.a, w.b, 1.35, (x, z) => !cv.lane(x, z));
    // (a hole in its lava's dark gets them closer: the Corkscrew's loop lit warm)
    const lastAt: MutVec2[] = [], hung: THREE.Vector3[] = [], many = minesOrder(s) === 11, gap = many ? 4.5 : 7;
    for (const [x, z, nx, nz] of spots.sort(() => rand() - 0.5)) {
      if (lastAt.length >= (quality.low ? 8 : many ? 16 : cv.voids.length ? 8 : 10) || lastAt.some(([a, b]) => Math.hypot(a - x, b - z) < gap) || nz > 0.6) continue;
      if (cv.voids.length) {
        // (over the void, hung above the chase camera's line: none by the tee or the cup, where it stands behind the ball)
        if (!cv.voidAt(x, z) || cv.dist(x, z) < 2.4 || Math.hypot(x - s.start[0], z - s.start[1]) < 9 || Math.hypot(x - s.cup[0], z - s.cup[1]) < 5) continue; // (clear of the lane's machines: a stamp's frame, a wheel)
        const y = cv.t.height(x, z) + 4.2;
        hung.push(new THREE.Vector3(x, y + CHAIN + 0.7, z));
        light(cv, x, y + 0.25, z, MINES.lantern, { r: 6.5, k: 0.9, lamp: true, glow: 3.6 });
        cv.glows[cv.glows.length - 1].hook = hung[hung.length - 1]; // (its glow swings with it)
      } else {
        const m = place(lampPost(rand), x, z, 0.5, Math.atan2(nz, -nx), 0.6); // (its arm over the lane)
        if (!m) continue;
        m.updateMatrixWorld(true);
        const at = new THREE.Vector3(0.72, 1.95, 0).applyMatrix4(m.matrixWorld);
        light(cv, at.x, at.y, at.z, MINES.lantern, { r: 6.5, k: 0.9, lamp: true, glow: 3.4 });
      }
      lastAt.push([x, z]);
    }
    // the hanging lamps: all of them one mesh and its ink, swinging a little
    // on their chains, more in the draught (the vertex shader's: two draws)
    if (hung.length) g.add(swingingLamps(cv, hung, rand));
  }

  dress(cv, s, g, rand, { ok, place, reserve, bank });

  if (hotHole(s)) g.add(heat(cv, s, rand));
  g.add(motes(cv, rand));
  g.add(headlamp(s));
  g.add(cupLamp(s));
  g.add(glowBatch(cv, s));
  inkNear(g, s);
  g.add(trickles(cv, rand));
  animate((t) => cv.tick(t));
  lightsFirst(g);
  // the lamps and crystals over a lake, streaked on it (the brightest over it)
  if (cv.lake) {
    const f = cv.lake.field;
    cv.lake.lights(cv.glows.filter((q) => q.y > WATERLINE + 0.5 && q.s > 1 && [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([dx, dz]) => f.at(q.x + dx, q.z + dz) > 0.1))
      .sort((a, b) => b.s - a.s).slice(0, 7).map((q) => ({ x: q.x, z: q.z, h: q.y - WATERLINE, c: q.c, k: Math.min(1, q.s / 3) * 0.55, lamp: q.lamp })));
  }
  weatherLooks(g, (w) => {
    cv.lamps(!(w.fog || dark));
    return w.fog ? "fog" : w.rain ? "wet" : "clear";
  });
  return g;
}

/** How the decor puts things down (decor's own, handed to dress). */
interface Placing {
  ok: (x: number, z: number, r: number, clear?: number) => boolean;
  place: <T extends THREE.Object3D>(m: T, x: number, z: number, r: number, rot?: number, clear?: number) => T | null;
  reserve: (x: number, z: number, r: number) => void;
  bank: Height;
}

/**
 * The cave round the lane, in rings: near it crystal outcrops growing from
 * their rocks, stalagmites, barrels and crates, cave mushrooms; further off
 * scaffolding, parked carts on their rails, ore piles, pools, miners at the
 * rock, a winch, a loop of track with carts going round; far back rock
 * pillars rising into the dark and the hole's own landmark (a headframe
 * over its shaft...). Tall things never between the lane and the camera
 * (in front of it: back() small); over the void, pillars rise out of the
 * chasm. The Low tier puts down fewer of each.
 */
function dress(cv: Cave, s: Hole, g: THREE.Group, rand: Rand, { ok, place, reserve, bank }: Placing) {
  const W = s.board.w, H = s.board.h, low = quality.low, dark = darkGallery(s);
  const few = (k: number) => Math.max(1, Math.round(k * (low ? 0.55 : 1)));
  // a random spot on the floor dmin..dmax off the lane, clear of the rest; tall: never in front of the lane
  const spot = (dmin: number, dmax: number, r: number, tall = 0, tries = 40): MutVec2 | null => {
    for (let k = 0; k < tries; k++) {
      const x = -SIDE + 2 + rand() * (W + 2 * SIDE - 4), z = -BACK + 2 + rand() * (H + BACK + LEDGE - 2);
      const d = cv.dist(x, z);
      if (d < dmin || d > dmax || !ok(x, z, r)) continue;
      if (tall && cv.back(x, z) < tall * 1.5) continue;
      return [x, z];
    }
    return null;
  };
  const lit = (o: THREE.Object3D, p: THREE.Vector3, c: number, r: number, k: number, glow: number, lamp = false) => {
    o.updateMatrixWorld(true);
    const w = p.clone().applyMatrix4(o.matrixWorld);
    light(cv, w.x, w.y, w.z, c, { r, k, glow, lamp });
  };
  setPieces(cv, s, rand, { ok, place, reserve, bank }, spot, lit);
  const biome = biomeOf(s), hue = BIOME_HUE[biome], lamp = () => lantern(1);
  const hueOf = () => (rand() < 0.75 ? hue : HUES[Math.floor(rand() * HUES.length)]);

  // crystal groves, two: a giant group, a big one of another
  // form beside it and a crowd at their feet, the rock round them lit;
  // never in front of the lane, never a sprinkle
  groves(rand, 2, (h) => spot(6, 26, h * 0.45, h, 80), place, lit, hueOf, BIOME_HUE[biome]);

  // the board dressed: frames the lane passes under, lamps strung across it,
  // rails set in its ground, the miners' things on its shoulders, crystal
  // tufts on its rails, glowworm moss along its edges (never on the tee, the
  // cup or over the void)
  if (!cv.voids.length) dressBoard(cv, s, g, rand, { ok, place, reserve, bank }, lit, lamp);
  const edgeGlow = (x: number, z: number) => cv.glows.push({ x, y: cv.t.height(x, z) + 0.12, z, c: MINES.glowworm, s: 0.35, tw: 1 });
  for (let k = 0; k < (dark ? 90 : 40); k++) {
    const x = rand() * W, z = rand() * H;
    if (cv.lane(x, z) && cv.dist(x, z) === 0 && !cv.lane(x + 0.6, z) !== !cv.lane(x - 0.6, z)) edgeGlow(x, z);
  }

  // the cave in places: the planned sites, each composed round its focus and
  // facing the lane, its miners at work
  const crew: { x: number; y: number; z: number; face: number }[] = [];
  const busy = new Set<SiteKind>();
  for (const q of cv.sites) {
    // (a far one a size up: its things built at their own size, the whole scaled;
    // the first of its kind busy, the others at rest: a moving thing is a draw of its own)
    const built = site(q.kind, rand, q.r / q.k, lamp, hue, !busy.has(q.kind));
    busy.add(q.kind);
    built.g.scale.setScalar(q.k);
    // turned to the lane: the way the distance to it falls
    const e = 0.8, gx = cv.dist(q.x + e, q.z) - cv.dist(q.x - e, q.z), gz = cv.dist(q.x, q.z + e) - cv.dist(q.x, q.z - e);
    const face = Math.atan2(-gx, -gz), m = built.g;
    m.position.set(q.x, cv.floor(q.x, q.z) - 0.05, q.z);
    m.rotation.y = face;
    g.add(m);
    reserve(q.x, q.z, q.r);
    m.updateMatrixWorld(true);
    for (const o of [...m.children]) if (overDrop(cv, o)) m.remove(o); // (its things standing up by the lane's edge over the void left out)
    for (const l of built.lights) {
      const w = l.p.clone().applyMatrix4(m.matrixWorld);
      light(cv, w.x, w.y, w.z, l.c, { r: l.r * q.k, k: l.k, glow: l.glow * q.k, lamp: l.lamp });
    }
    for (const c of built.crew) {
      const w = c.clone().applyMatrix4(m.matrixWorld);
      crew.push({ x: w.x, y: cv.floor(w.x, w.z) - 0.05, z: w.z, face: face + Math.PI });
      // his helmet's lamp, and a pool of light round him: a miner at work reads from far
      light(cv, w.x, cv.floor(w.x, w.z) + 1.3, w.z, MINES.lantern, { r: 3.5, k: 0.9, glow: 1.6, lamp: true });
    }
  }
  // the pit under the void, and the front chasm: what lies down there (its camp's crew with the rest)
  g.add(pitDressing(cv, s, rand, lit, lamp, hueOf, crew));
  g.add(miners(rand, crew, !cv.voids.length));
  // a loop of track behind the board, carts pushed round it
  if (!dark && !low) {
    const z0 = cv.voids.length ? -CHASM - 3 : -4.5, z1 = z0 - 3.4, x0 = W * 0.2, x1 = W * 0.8;
    const pts = [[x0, z0], [(x0 + x1) / 2, z0 - 0.3], [x1, z0], [x1 + 1.6, (z0 + z1) / 2], [x1, z1], [(x0 + x1) / 2, z1 + 0.3], [x0, z1], [x0 - 1.6, (z0 + z1) / 2]];
    const clear = pts.every(([x, z]) => ok(x, z, 1.1, 1.2)) && [0.25, 0.5, 0.75].every((u) => ok(x0 + (x1 - x0) * u, (z0 + z1) / 2, 1, 1));
    if (clear && x1 - x0 > 10) {
      const path = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, bank(x, z), z)), true, "centripetal");
      g.add(cartLoop(rand, path, 2 + Math.floor(rand() * 2)).g);
      for (let u = 0; u < 1; u += 0.04) { const p = path.getPointAt(u); reserve(p.x, p.z, 1.2); }
    }
  }
  // rock pillars far back, rising into the dark (the cave's depth)
  for (let k = 0; k < few(4); k++) {
    const h = 14 + rand() * 10, r = 1.2 + rand() * 1.2, at = spot(10, 30, r * 1.4, h);
    if (at) place(pillar(rand, Math.min(h, (cv.back(...at) - 0.8) * 0.6), r, 0, h * 0.55), at[0], at[1], r * 1.4, rand() * 6);
  }
  // bats in flocks wheeling round the brightest lights behind the lane (the
  // giant crystals), so they show against them; big enough to read from far
  const lights = cv.pools.filter((q) => !q.lamp && cv.back(q.x, q.z) > 8).sort((a, b) => b.r - a.r);
  {
    const c = lights[0] || { x: W / 2, y: GRASS + 6, z: -BACK * 0.35 };
    g.add(bats(rand, c.x, c.y + 3.5, c.z, 5 + rand() * 2, low ? 6 : 8, 2.3));
  }
  // the Glowworm Gallery's great crystal, rising out of the pit in its U-bend
  if (minesOrder(s) === 2) {
    let best: MutVec2 | null = null, bd = 0;
    for (let x = 4; x < W - 4; x += 1) for (let z = 4; z < H - 4; z += 1) { const d = cv.dist(x, z); if (cv.voidAt(x, z) && d > bd) (bd = d), (best = [x, z]); }
    if (best && bd > 2.5) {
      const h = Math.min(7, -VOID_FLOOR + bd * 1.2), c = giantCrystal(rand, h, MINES.cyan, "spire");
      c.g.position.set(best[0], VOID_FLOOR, best[1]);
      g.add(c.g);
      c.g.updateMatrixWorld(true);
      const w = c.heart.clone().applyMatrix4(c.g.matrixWorld);
      light(cv, w.x, w.y, w.z, MINES.cyan, { r: h * 2, k: 1.2, glow: h * 1.3 });
    }
  }

}

/** Crystal groves (dress): n of them, each a giant group, a big one of
 *  another composition beside it and a crowd of clusters at their feet. */
function groves(rand: Rand, n: number, where: (h: number) => MutVec2 | null, place: Placing["place"],
  lit: (o: THREE.Object3D, p: THREE.Vector3, c: number, r: number, k: number, glow: number, lamp?: boolean) => void, hueOf: () => number, hue: number) {
  for (let k = 0, got = 0; k < n * 3 && got < n - (quality.low ? 1 : 0); k++) {
    const h = 8 + rand() * 4, at = where(h);
    if (!at) break;
    const c = giantCrystal(rand, h, hueOf()), m = place(c.g, at[0], at[1], h * 0.45, rand() * 6, 2);
    if (!m) continue;
    lit(m, c.heart, hue, h * 1.5, 1.2, h);
    for (let j = 0; j < 1; j++) {
      const a = rand() * Math.PI * 2, d = h * 0.55 + 1.2, hh = 3 + rand() * 2, b = giantCrystal(rand, hh, hueOf());
      if (place(b.g, at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d, hh * 0.45, rand() * 6)) lit(b.g, b.heart, hue, hh * 1.5, 0.8, hh * 0.9);
    }
    for (let j = 0; j < 4; j++) {
      const a = rand() * Math.PI * 2, d = h * 0.45 + 0.8 + rand() * 3, x = at[0] + Math.cos(a) * d, z = at[1] + Math.sin(a) * d, o = outcrop(rand, 0.8 + rand() * 1.4, hueOf());
      if (place(o.g, x, z, 0.7, rand() * 6)) lit(o.g, new THREE.Vector3(0, o.top * 0.6, 0), o.hue, 3, 0.5, 1.4);
    }
    got++;
  }
}

/**
 * The board dressed as the other worlds dress theirs: one or two timber
 * frames the lane passes under and strings of lanterns across it (both fade
 * out of the camera's way, as the Town's strings do) and rails set flush in
 * its ground across it. Never on the tee or the cup.
 */
function dressBoard(cv: Cave, s: Hole, g: THREE.Group, rand: Rand, { ok }: Placing,
  lit: (o: THREE.Object3D, p: THREE.Vector3, c: number, r: number, k: number, glow: number, lamp?: boolean) => void, lamp: () => THREE.Object3D) {
  const W = s.board.w, H = s.board.h, far = (x: number, z: number, r: number) => Math.hypot(x - s.start[0], z - s.start[1]) > r && Math.hypot(x - s.cup[0], z - s.cup[1]) > r;
  // the lane's narrowest crossing through a point of it: its ends and its way
  const crossing = (x: number, z: number) => {
    let best: { a: MutVec2; b: MutVec2; w: number; ang: number } | null = null;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI, dx = Math.cos(ang), dz = Math.sin(ang);
      let lo = 0, hi = 0;
      while (lo > -12 && cv.lane(x + dx * (lo - 0.25), z + dz * (lo - 0.25))) lo -= 0.25;
      while (hi < 12 && cv.lane(x + dx * (hi + 0.25), z + dz * (hi + 0.25))) hi += 0.25;
      if (!best || hi - lo < best.w) best = { a: [x + dx * lo, z + dz * lo], b: [x + dx * hi, z + dz * hi], w: hi - lo, ang };
    }
    return best!;
  };
  const faders: FadeItem[] = [], used: MutVec2[] = [];
  const spots = (n: number) => {
    const out: ReturnType<typeof crossing>[] = [];
    for (let k = 0; k < 200 && out.length < n; k++) {
      const x = 2 + rand() * (W - 4), z = 2 + rand() * (H - 4);
      if (!cv.lane(x, z) || !far(x, z, 6) || used.some(([a, b]) => Math.hypot(a - x, b - z) < 12)) continue;
      const c = crossing(x, z);
      if (c.w < 2.5 || c.w > 9) continue;
      out.push(c);
      used.push([x, z]);
    }
    return out;
  };
  // frames over the lane, and strings of lanterns across it
  for (const [i, c] of spots(quality.low ? 1 : 2).entries()) {
    const dx = Math.cos(c.ang), dz = Math.sin(c.ang), pa: MutVec2 = [c.a[0] - dx * 1.1, c.a[1] - dz * 1.1], pb: MutVec2 = [c.b[0] + dx * 1.1, c.b[1] + dz * 1.1];
    if (!ok(pa[0], pa[1], 0.4, 0.6) || !ok(pb[0], pb[1], 0.4, 0.6)) continue;
    const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2, span = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), y = Math.min(cv.floor(...pa), cv.floor(...pb));
    if (cv.t.height(mx, mz) > y + 0.3) continue; // (not over a lane a terrace up: its lamps would hang at the ball's height)
    const piece = i % 2 === 0 ? archOver(span, lamp) : null;
    const grp = piece ? piece.g : new THREE.Group();
    if (!piece) {
      // a string of lanterns between two masts
      for (const sx of [-span / 2, span / 2]) {
        const mast = board(0.22, 5.2, 0.22, MINES.timberDark);
        mast.position.set(sx, 2.6, 0);
        grp.add(mast);
      }
      const rope: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) rope.push(new THREE.Vector3(-span / 2 + (span * k) / 12, 5 - 0.7 * Math.sin((k / 12) * Math.PI), 0));
      grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope), 12, 0.03, 3), flat(0x8a6b45)));
      for (let k = 1; k <= 3; k++) {
        const u = k / 4, l = lamp();
        l.scale.setScalar(1.3);
        l.position.set(-span / 2 + span * u, 5 - 0.7 * Math.sin(u * Math.PI) - 0.95, 0);
        grp.add(l);
      }
    }
    grp.position.set(mx, y, mz);
    grp.rotation.y = -c.ang;
    g.add(grp);
    grp.updateMatrixWorld(true);
    const lampsAt = piece ? [piece.lamp] : [1, 2, 3].map((k) => new THREE.Vector3(-span / 2 + (span * k) / 4, 5 - 0.7 * Math.sin((k / 4) * Math.PI) - 0.6, 0));
    for (const p of lampsAt) lit(grp, p, MINES.lantern, 6, 1, 3.2, true);
    bakeLocal(grp); // (a few draws, not one a board)
    const mats = ownFade(grp);
    for (let k = 0; k <= 4; k++) faders.push({ at: new THREE.Vector3(-span / 2 + (span * k) / 4, 4.2, 0).applyMatrix4(grp.matrixWorld), r: 1.8, mats });
  }
  if (faders.length) ud(g).fade = fadeLoop(faders);
}

/** A biome's crystals: cyan, violet, pink, amber by the lava. */
const BIOME_HUE: Record<Biome, number> = {
  gallery: MINES.cyan, hollow: 0x6ff0c8, yard: MINES.cyan, chasm: MINES.amethyst, grotto: MINES.amethyst, falls: MINES.cyan, forge: 0xffb35a,
  shaft: MINES.cyan, collapse: MINES.rose, boiler: MINES.cyan, lavafalls: 0xffb35a, frozen: 0x9fe8ff, vault: MINES.rose, lode: MINES.amethyst,
};

// ------------------------------------------------------------ the pit
//
// Under the void (and past the front ledge) the drop has a floor a few units
// down, VOID_FLOOR: a still lake, scree with a rail gallery, a bed of glowing
// crystals or a seam of lava, by turns along the cup. The ball that falls in
// lands there (course.ts surfaceAt).

type Pit = "lake" | "scree" | "crystals" | "lava";
const PITS: Record<number, Pit> = { 1: "lake", 2: "crystals", 3: "scree", 4: "lava", 6: "lake", 9: "scree", 12: "lava", 14: "scree", 15: "lake", 16: "crystals", 17: "lava" };
const pitOf = (s: Hole): Pit => PITS[minesOrder(s)] || (hotHole(s) ? "lava" : "scree");
const WATERLINE = VOID_FLOOR + 0.45;

/** The pit's ground: talus rising against its walls and under the lane's
 *  cut faces, level in its middle; its height at (x, z). */
function pitGround(cv: Cave, kind: Pit) {
  return (x: number, z: number) => {
    // (talus against the pit's walls; under the lane's edge a low apron only:
    // the drop off the lane stays a drop, its floor well under it)
    const wall = -cv.drop(x, z), lane = cv.voids.length ? cv.dist(x, z) : 99;
    const wet = kind === "lake" ? 0.5 : 1; // (a lake's bed smoother: no shoal of islets)
    let talus = Math.max((kind === "lake" ? 0.9 : 1.5) * (1 - smoothstep((wall - 0.2) / (kind === "scree" ? 3.2 : 2.2))), 0.5 * wet * (1 - smoothstep(lane / 2.5)));
    if (kind === "lava") talus *= smoothstep(seamAt(cv, x, z) - 0.9); // (the seam's bed level)
    const y = VOID_FLOOR + Math.max(0, talus + wet * (0.18 * noise(x * 0.9, z * 0.8) + 0.08 * fine(x * 2, z * 2)));
    // (a lake's banks steep: its shore a line, not a wide wash over the floor's facets)
    return kind === "lake" ? WATERLINE + (y - 0.1 - WATERLINE) * 2.2 : y;
  };
}
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]] as const; // a cell's corners and middle

/**
 * A lake's bank all along its shore: wet rock going under the water, a dark
 * wet band at the waterline, drier stone up its talus onto the floor (and
 * over where the water meets the floor's facets).
 */
function bank(field: WaterField, ground: Height) {
  const ROWS: readonly (readonly [number, number, number])[] = [[-0.35, -0.2, 0x1c1f30], [0, 0.01, 0x262636], [0.3, 0.1, 0x353249], [0.65, 0.2, 0x3f3a55], [1.05, NaN, 0x4a4262]];
  const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color(), R = ROWS.length;
  for (const { pts, closed } of shoreline(field)) {
    const n0 = pos.length / 3, n = pts.length;
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[closed ? (k - 1 + n) % n : Math.max(0, k - 1)], b = pts[closed ? (k + 1) % n : Math.min(n - 1, k + 1)];
      let nx = a.y - b.y, nz = b.x - a.x;
      const l = Math.hypot(nx, nz) || 1;
      (nx /= l), (nz /= l);
      if (field.at(p.x + nx * 0.5, p.y + nz * 0.5) > field.at(p.x - nx * 0.5, p.y - nz * 0.5)) (nx = -nx), (nz = -nz); // (toward the dry side)
      const jag = 0.1 * noise(p.x * 3.1, p.y * 2.7);
      for (const [off, dy, hex] of ROWS) {
        const o = off + (off > 0 ? jag : 0), x = p.x + nx * o, z = p.y + nz * o;
        pos.push(x, Number.isNaN(dy) ? Math.max(ground(x, z), WATERLINE + 0.25) + 0.02 : WATERLINE + dy + (off > 0 ? 0.05 * fine(x * 2, z * 2) : 0), z);
        c.set(hex).multiplyScalar(0.9 + 0.2 * noise(x * 1.7, z * 1.3));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < (closed ? n : n - 1); k++) {
      const q = (k + 1) % n, tx = pts[q].x - pts[k].x, tz = pts[q].y - pts[k].y, P = pos, i0 = (n0 + k * R) * 3;
      // (wound to face up, whichever way the line runs)
      const up = tz * (P[i0 + 3] - P[i0]) - tx * (P[i0 + 5] - P[i0 + 2]) > 0;
      for (let r = 0; r + 1 < R; r++) {
        const a = n0 + k * R + r, b = n0 + q * R + r;
        if (up) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  return new THREE.Mesh(geoOf(pos, idx, col), relief());
}

/** Where the lava's seam runs down the pit: a winding band (0 at its middle, 1 at its banks). */
const seamAt = (cv: Cave, x: number, z: number) => Math.abs(z - (cv.cz * 0.35 + 0.65 * cv.H / 2 + 3 * Math.sin(x * 0.11) + 1.4 * Math.sin(x * 0.29 + 1))) / 2.4;

/** The last pit drawn, read for its hole only (by its place in the course: a stroke's own state, or a realm's version of it, is a hole of its own).
 *  One, not one a hole: a Cave holds its Hole and Terrain, and with them the scene systems keyed by them. */
let lastPit: Cave | undefined;
function pitFloor(cv: Cave) {
  const kind = pitOf(cv.s), ground = pitGround(cv, kind), g = new THREE.Group();
  lastPit = cv;
  cv.pitAt = (x, z) => (cv.voidAt(x, z) || cv.drop(x, z) < 0 ? (kind === "lake" ? Math.max(WATERLINE, ground(x, z)) : ground(x, z)) : undefined);
  const x0 = cv.cx - cv.ax, x1 = cv.cx + cv.ax, z0 = cv.cz - cv.az, z1 = cv.cz + cv.az, step = 2.2;
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const inPit = (x: number, z: number) => cv.drop(x, z) < 0.8 && cv.rim(x, z) < 1.03;
  // (a cell the lane covers from corner to corner is never seen: left out)
  const hidden = (i: number, j: number) => CORNERS.every(([u, v]) => cv.lane(x0 + (i + u) * step, z0 + (j + v) * step));
  const c = new THREE.Color(), rock = new THREE.Color(), wet = new THREE.Color(0x2a2a3c), crust = new THREE.Color(MINES.crust);
  const STR = [0x4a4262, 0x5a4a40, 0x443c5a, 0x524638];
  const geo = gridGeo(nx, nz, (i, j, pos, col) => {
    const x = x0 + i * step, z = z0 + j * step, y = ground(x, z);
    pos.push(x, y, z);
    rock.set(STR[Math.floor((y + 9) / 0.5) % STR.length]);
    c.set(MINES.slateDark).lerp(rock, 0.5 + 0.3 * noise(x * 1.3, z * 1.1));
    if (kind === "lake") c.lerp(wet, 1 - smoothstep((y - WATERLINE) / 0.4));
    if (kind === "lava") c.lerp(crust, 0.55 * (1 - smoothstep(seamAt(cv, x, z) - 1)));
    col.push(c.r, c.g, c.b);
  }, (_a, _b, _d, _e, i, j) => inPit(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step) && !hidden(i, j));
  g.add(new THREE.Mesh(geo, relief()));
  if (kind === "lake") {
    // the lake: how deep, over the pit (dry up its banks, under a lane of
    // rock, off the pit; under a gantry's deck the water goes on), and the
    // water drawn from that, its shore the field's, a bank of wet rock along it
    const solid = surfaceOf(cv.s) !== "planks";
    const field = waterField((x, z) => (cv.drop(x, z) > 0 || (solid && cv.lane(x, z)) ? -1 : WATERLINE - ground(x, z)), x0, z0, x1 - x0, z1 - z0);
    const water = waterMaterial(field, cv.lampK);
    const wg = gridGeo(nx, nz, (i, j, pos) => void pos.push(x0 + i * step, WATERLINE, z0 + j * step),
      (_a, _b, _d, _e, i, j) => CORNERS.some(([u, v]) => field.at(x0 + (i + u) * step, z0 + (j + v) * step) > -0.2) && !(solid && hidden(i, j)));
    const wm = new THREE.Mesh(wg, water.material);
    (ud(wm).live = true), (wm.name ||= "mines:pitFloor"); // (its own material and field: one draw either way, and it owns the field)
    ud(wm).owned = [field.tex];
    g.add(wm, bank(field, ground));
    cv.lake = { field, lights: water.lights, follow: water.follow };
    cv.pitWet = (x, z) => (field.at(x, z) > 0 ? "water" : undefined);
  }
  if (kind === "lava") {
    // the seam: lava down a winding band of the pit's floor, a ribbon along
    // its course, crusted at its banks, cut where the pit's floor rises
    const mid = (x: number) => cv.cz * 0.35 + 0.65 * cv.H / 2 + 3 * Math.sin(x * 0.11) + 1.4 * Math.sin(x * 0.29 + 1);
    const lp: number[] = [], lc: number[] = [], li: number[] = [], A = 7;
    const ok = (x: number, z: number) => inPit(x, z) && ground(x, z) < VOID_FLOOR + 0.55;
    let prevOk = false;
    for (let x = x0, n = 0; x <= x1; x += 1, n++) {
      const w = 2.4 * (0.8 + 0.25 * Math.sin(x * 0.37)), zc = mid(x), row = n * A;
      for (let k = 0; k < A; k++) {
        const v = k / (A - 1) * 2 - 1;
        lp.push(x, VOID_FLOOR + 0.3 + 0.04 * (1 - v * v), zc + v * w);
        lc.push(smoothstep((Math.abs(v) - 0.5) / 0.5));
      }
      const here = ok(x, zc);
      if (n && here && prevOk) for (let k = 0; k < A - 1; k++) { const a0 = row - A + k, b0 = row + k; li.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
      prevOk = here;
    }
    cv.pitWet = (x, z) => (ok(x, mid(x)) && Math.abs(z - mid(x)) <= 2.4 * (0.8 + 0.25 * Math.sin(x * 0.37)) ? "lava" : undefined);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
    lg.setAttribute("lavaCrust", new THREE.Float32BufferAttribute(lc, 1));
    lg.setIndex(li);
    g.add(new THREE.Mesh(lg, lavaMaterial()));
    for (let x = x0; x < x1; x += 3) {
      const z = cv.cz * 0.35 + 0.65 * cv.H / 2 + 3 * Math.sin(x * 0.11) + 1.4 * Math.sin(x * 0.29 + 1);
      if (inPit(x, z) && ground(x, z) < VOID_FLOOR + 0.5) {
        cv.glows.push({ x, y: VOID_FLOOR + 0.9, z, c: MINES.lava, s: 5, tw: 0.3 });
        cv.pools.push({ x, y: VOID_FLOOR + 1, z, r: 5, c: new THREE.Color(MINES.lava), k: 0.8, lamp: false });
      }
    }
  }
  return g;
}

/**
 * What lies on the pit's floor, by its kind: on a lake, rock islands, a raft
 * moored with its lantern and a miner fishing off it; on scree, a lower rail
 * gallery (a loop of track with carts pushed round, a buffer stop, an ore
 * hopper, lamps), rubble cones and fallen props; a bed of crystals, glowing,
 * of every size; along a lava seam, scorched rocks and amber crystals.
 * Everything stays under the lane (its top a unit below).
 */
function pitDressing(cv: Cave, s: Hole, rand: Rand, lit: (o: THREE.Object3D, p: THREE.Vector3, c: number, r: number, k: number, glow: number, lamp?: boolean) => void, lamp: () => THREE.Object3D, hueOf: () => number,
  crew: { x: number; y: number; z: number; face: number }[]) {
  const g = new THREE.Group(), kind = pitOf(s), ground = pitGround(cv, kind), taken: { x: number; z: number; r: number }[] = [];
  const W = s.board.w, H = s.board.h;
  // a spot on the pit's floor you can see (not under the lane), clear of the rest
  const spot = (r: number, flat = false, keep = true): MutVec2 | null => {
    for (let k = 0; k < 60; k++) {
      const x = -CHASM - 3 + rand() * (W + 2 * CHASM + 6), z = -CHASM - 2 + rand() * (H + LEDGE + CHASM + 3);
      if (cv.drop(x, z) > -r - 0.8 || cv.dist(x, z) < r + 1.2 || cv.rim(x, z) > 0.96) continue;
      if (flat && ground(x, z) > VOID_FLOOR + 0.35) continue;
      if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + r)) continue;
      if (keep) taken.push({ x, z, r });
      return [x, z];
    }
    return null;
  };
  const put = <T extends THREE.Object3D>(o: T, at: MutVec2 | null, rot = rand() * 6, lift = 0) => {
    if (!at) return null;
    // (what stands in the lake stamps it dry: its foam ring round it)
    const r = taken.find((q) => q.x === at[0] && q.z === at[1])?.r;
    if (r) cv.lake?.field.stamp(at[0], at[1], r * 0.6);
    // (its foot at the lowest of the floor round it: nothing standing out over a slope of the pit's talus)
    const low = Math.min(ground(...at), ...[0, 1, 2, 3].map((k) => ground(at[0] + Math.cos(k * 1.57) * 0.8, at[1] + Math.sin(k * 1.57) * 0.8)));
    o.position.set(at[0], (kind === "lake" ? Math.max(WATERLINE - 0.05, low) : low) + lift, at[1]);
    o.rotation.y = rot;
    // (nothing of it up at the lane's level near its edge: a ball going over meets nothing solid)
    o.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.max.y > GRASS - 0.9 && cv.dist(at[0], at[1]) < 2.5 + Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2) return null;
    g.add(o);
    return o;
  };
  // (as much as the pit has room for: its open floor you can see, by the hundred square units)
  let area = 0;
  for (let x = -CHASM; x < W + CHASM; x += 2) for (let z = -CHASM; z < H + LEDGE; z += 2) if (cv.drop(x, z) < -2 && cv.dist(x, z) > 2) area += 4;
  const low = quality.low, room = Math.max(0.6, Math.min(1.5, area / 900)), few = (k: number) => Math.max(1, Math.round(k * room * (low ? 0.5 : 1)));
  // on the pit's floor, first: a miners' camp a size up, two of them at the rock by it,
  // its lantern and fire lit (life read from Far); and a second place of the pit's own
  // (an ore dump on scree or lava, a crystal bed in a crystal pit or by a lake) — on dry
  // ground (a lake's bank), each where it has room, the biggest that fits
  const dryAt = (at: MutVec2 | null, r: number) => at && (kind !== "lake" || [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => ground(at[0] + dx, at[1] + dz) > WATERLINE + 0.15)) ? at : null;
  const pitSite = (kinds: readonly SiteKind[], people: boolean) => {
    for (const rr of [3.6, 3, 2.4]) {
      // (of the spots it fits in, the one nearest the board's middle: in the Far view's heart)
      const R = rr * 1.35 + 0.6, mid = (q: MutVec2) => Math.hypot(q[0] - W / 2, q[1] - H / 2);
      // (its tall things, a shack's roof, stand up to the lane's level: kept 3 clear of the lane's edge)
      const best = (ok: (q: MutVec2) => boolean) => { let b: MutVec2 | null = null; for (let t = 0; t < 14; t++) { const q = spot(R, false, false); if (q && cv.dist(q[0], q[1]) > R + 3 && ok(q) && (!b || mid(q) < mid(b))) b = q; } return b; };
      let at = best((q) => !!dryAt(q, rr * 1.35)), deck = false;
      // (a lake with no bank wide enough: the camp on a timber deck standing in the water)
      if (!at && kind === "lake") (at = best(() => true)), (deck = !!at);
      if (!at) continue;
      taken.push({ x: at[0], z: at[1], r: R });
      const kindHere = kinds[Math.floor(rand() * kinds.length)], built = site(kindHere, rand, rr, lamp, BIOME_HUE[biomeOf(s)], false);
      built.g.scale.setScalar(1.35);
      // (turned to the lane: the way the distance to it falls)
      const e = 0.8, face = Math.atan2(-(cv.dist(at[0] + e, at[1]) - cv.dist(at[0] - e, at[1])), -(cv.dist(at[0], at[1] + e) - cv.dist(at[0], at[1] - e)));
      const y = Math.max(kind === "lake" ? WATERLINE : -99, ground(...at)) - 0.05;
      built.g.position.set(at[0], y + (deck ? 0.35 : 0), at[1]);
      built.g.rotation.y = face;
      g.add(built.g);
      for (const o of [...built.g.children]) if (overDrop(cv, o)) built.g.remove(o); // (nothing of it up at the lane's edge)
      if (deck) {
        // (the kit's boards, a round deck, on four posts down into the water)
        const R = rr * 1.35 + 0.3, posts = new THREE.Group();
        g.add(planks([{ inside: (x, z) => Math.hypot(x - at[0], z - at[1]) < R, top: () => y + 0.35, box: [at[0] - R, at[1] - R, at[0] + R, at[1] + R], angle: face }], rand, { thick: 0.12 }));
        for (const [dx, dz] of [[R * 0.6, R * 0.6], [-R * 0.6, R * 0.6], [R * 0.6, -R * 0.6], [-R * 0.6, -R * 0.6]]) posts.add(moved(board(0.22, 1.2, 0.22, MINES.timberDark), dx, -0.6, dz));
        posts.position.set(at[0], y + 0.28, at[1]);
        posts.rotation.y = face;
        g.add(posts);
        cv.lake?.field.stamp(at[0], at[1], R); // (the water round it: its foam ring)
      }
      built.g.updateMatrixWorld(true);
      for (const l of built.lights) lit(built.g, l.p, l.c, l.r * 1.35, l.k, l.glow * 1.35, l.lamp);
      if (people) for (const a of [0.9, -0.9]) {
        const x = at[0] + Math.sin(face + a) * rr * 1.1, z = at[1] + Math.cos(face + a) * rr * 1.1;
        crew.push({ x, y: deck ? y + 0.35 : Math.max(y, ground(x, z) - 0.05), z, face: face + a });
      }
      return true;
    }
    return false;
  };
  pitSite(["camp"], true);
  // (a lava seam lights and fills its pit by itself: no second place there)
  if (kind !== "lava") pitSite(kind === "crystals" || kind === "lake" ? ["druse"] : ["ore", "collapse"], false);
  if (kind === "lake") {
    for (let k = 0; k < few(4); k++) put(boulder(rand, 0.8 + rand() * 0.9, 0.5 + rand() * 0.4, 0.7 + rand() * 0.8, 1), spot(1.4), rand() * 6, 0.1);
    for (let k = 0; k < few(3); k++) { const o = outcrop(rand, 1 + rand() * 0.9, hueOf()), m = put(o.g, spot(1)); if (m) lit(m, new THREE.Vector3(0, o.top * 0.6, 0), o.hue, 4, 0.8, 2.4); }
    // a raft moored, its lantern lit, a miner fishing off it
    const raft = new THREE.Group();
    for (let k = 0; k < 6; k++) raft.add(board(0.3, 0.26, 2.2, MINES.timber).translateX(-0.75 + k * 0.3));
    const l = lamp();
    l.position.set(0.6, 0.15, 0.7);
    const f = figure(rand, true);
    f.position.set(-0.3, 0.1, -0.2);
    const rod = board(0.04, 0.04, 2.2, 0xb57d47);
    rod.position.set(-0.3, 0.6, -1.1);
    rod.rotation.x = 0.5;
    raft.add(l, f, rod);
    const at = spot(1.6, true);
    if (put(raft, at, rand() * 6, 0.02)) lit(raft, new THREE.Vector3(0.6, 0.5, 0.7), MINES.lantern, 5, 1, 2.6, true);
  } else if (kind === "scree") {
    // the lower gallery: a loop of track on the floor with its carts
    for (let tries = 0; tries < 80; tries++) {
      const cx = -CHASM + rand() * (W + 2 * CHASM), cz = -CHASM + rand() * (H + CHASM), L = Math.max(3.5, 9 - tries * 0.08) + rand() * 3, D = 2.2;
      const pts = [[-L, -D], [0, -D - 0.3], [L, -D], [L + 1.8, 0], [L, D], [0, D + 0.3], [-L, D], [-L - 1.8, 0]].map(([x, z]) => [cx + x, cz + z] as MutVec2);
      if (!pts.every(([x, z]) => cv.drop(x, z) < -1.2 && cv.dist(x, z) > 1.4 && cv.rim(x, z) < 0.95)) continue;
      const path = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, ground(x, z), z)), true, "centripetal");
      g.add(cartLoop(rand, path, 2, false).g);
      for (const [x, z] of pts) taken.push({ x, z, r: 1.4 });
      const b = bigLamp(lamp), m = put(b.g, [cx, cz]);
      if (m) for (const p of b.pts) lit(m, p, MINES.lantern, 6, 1, 3.2, true);
      break;
    }
    for (let k = 0; k < few(2); k++) put(orePile(rand, 1.2 + rand() * 0.6), spot(1.5));
    for (let k = 0; k < few(6); k++) put(boulder(rand, 0.7 + rand() * 0.8, 0.5 + rand() * 0.4, 0.6 + rand() * 0.7, 1), spot(1.1), rand() * 6, -0.15);
    for (let k = 0; k < few(3); k++) { const o = outcrop(rand, 0.9 + rand() * 0.9, hueOf()), m = put(o.g, spot(0.9)); if (m) lit(m, new THREE.Vector3(0, o.top * 0.6, 0), o.hue, 3.5, 0.8, 2); }
    for (let k = 0; k < few(2); k++) { const l = logPile(rand); l.scale.setScalar(1.3); put(l, spot(1.8)); }
    for (let k = 0; k < few(2); k++) put(crateStack(rand), spot(1.3));
    for (let k = 0; k < few(2); k++) { const b = bigLamp(lamp), m = put(b.g, spot(0.8)); if (m) for (const p of b.pts) lit(m, p, MINES.lantern, 5, 0.9, 3, true); }
    for (let k = 0; k < few(1); k++) put(stalagmites(rand, 1.2 + rand() * 1), spot(0.8));
  } else if (kind === "crystals") {
    // groves of crystal growing up out of the pit, their tops under the lane
    for (let k = 0; k < few(3); k++) {
      const at = spot(2.4);
      if (!at) continue;
      const h = Math.min(2.4 + rand() * 0.3, -0.9 - ground(...at)); // (its top under the lane's level by 0.9: nothing solid there a falling ball meets)
      if (h < 1.2) continue;
      const c = giantCrystal(rand, h, hueOf()), m = put(c.g, at);
      if (m) lit(m, c.heart, BIOME_HUE[biomeOf(s)], h * 3, 1.2, h * 2);
      for (let j = 0; j < 5; j++) {
        const a = rand() * Math.PI * 2, d = 1.8 + rand() * 2.6, x = at[0] + Math.cos(a) * d, z = at[1] + Math.sin(a) * d;
        if (cv.drop(x, z) > -0.6 || cv.dist(x, z) < 1.2) continue;
        const o = outcrop(rand, 0.7 + rand() * (1.6 - d * 0.2), hueOf());
        put(o.g, [x, z]);
      }
    }
  } else {
    for (let k = 0; k < few(3); k++) {
      const b = boulder(rand, 0.9 + rand() * 0.8, 0.6 + rand() * 0.4, 0.8 + rand() * 0.7, 1);
      put(b, spot(1.3), rand() * 6, 0.2);
    }
    for (let k = 0; k < few(2); k++) { const o = outcrop(rand, 0.8 + rand() * 1, 0xffb35a), m = put(o.g, spot(0.9)); if (m) lit(m, new THREE.Vector3(0, o.top * 0.6, 0), 0xffb35a, 3.5, 0.8, 2); }
    for (let k = 0; k < few(1); k++) put(stalagmites(rand, 1.2 + rand() * 1), spot(0.8));
  }
  return g;
}

/** A hole's cave biome (the owner's "backdrops that change"): no two
 *  neighbours alike along the cup, a place of its own for a hole dressed as
 *  the mines from elsewhere. */
const BIOMES = ["gallery", "hollow", "yard", "chasm", "grotto", "falls", "forge", "shaft", "collapse", "boiler", "forge", "boiler", "lavafalls", "yard", "frozen", "vault", "shaft", "lode"] as const;
type Biome = (typeof BIOMES)[number];
const biomeOf = (s: Hole): Biome => BIOMES[(minesOrder(s) || [...String(s.hole)].reduce((a, c) => a + c.charCodeAt(0), 0) % 18 + 1) - 1];

/**
 * The hole's own "wow" far back (its biome's set piece: a headframe, a
 * mushroom forest, sidings, a rope bridge over the chasm, a crystal
 * cathedral, a waterfall and its bucket wheel, the forge, a lift tower, the
 * drill head in the rock, a boiler, lava falls, the treasure...) and a few
 * small surprises (a canary, a gnome asleep, the canteen, a fossil, the
 * dynamite shed), put down before the rest takes the room.
 */
function setPieces(cv: Cave, s: Hole, rand: Rand, { ok, place, reserve }: Placing,
  spot: (dmin: number, dmax: number, r: number, tall?: number, tries?: number) => MutVec2 | null,
  lit: (o: THREE.Object3D, p: THREE.Vector3, c: number, r: number, k: number, glow: number, lamp?: boolean) => void) {
  const W = s.board.w, biome = biomeOf(s), low = quality.low;
  // far back, behind the board: the landmark's spot (big, tall), the middle first
  const back = (r: number, h: number): MutVec2 | null => {
    for (let k = 0; k < 80; k++) {
      const x = W / 2 + (rand() - 0.5) * W * (0.3 + k * 0.012), z = -(cv.voids.length ? CHASM : 2) - r - rand() * (BACK - r);
      if (cv.drop(x, z) > r && cv.rim(x, z) < 0.96 && cv.dist(x, z) > r + 1.5 && cv.back(x, z) > h && ok(x, z, r, 1.2)) return [x, z];
    }
    return spot(5, 40, r, h, 120);
  };
  const put = <T extends THREE.Object3D>(o: T, at: MutVec2 | null, r: number, rot = 0) => (at ? place(o, at[0], at[1], r, rot, 1.2) : null);
  const lamp = () => lantern(1);
  const hot = hotHole(s), lava = lavaMaterial();
  const ORANGE = MINES.lava, GOLD = MINES.lavaHi;

  switch (biome) {
    case "gallery": case "shaft": {
      const h = minesOrder(s) === 17 ? 17 : 13, hr = h * 0.14 + 4.4, hf = put(headframe(h), back(hr, h), hr, rand() * 0.6 - 0.3); // (its room: the frame and its winding house)
      if (hf) lit(hf, new THREE.Vector3(0, h + 0.5, 0), MINES.lantern, 7, 0.7, 3, true);
      if (biome === "shaft") {
        const lt = put(liftTower(rand, 11), back(2, 11), 2, rand() * 0.4);
        if (lt) lit(lt, new THREE.Vector3(0, 11.3, 0), MINES.lantern, 6, 0.8, 2.6, true);
      }
      break;
    }
    case "hollow": case "frozen":
      for (let k = 0; k < (biome === "frozen" ? 1 : 2); k++) {
        const f = mushroomForest(rand), m = put(f.g, back(3.2, 5), 3.2, rand() * 6);
        if (m) for (const c of f.caps) lit(m, c.p, c.hue, 4 + c.r * 2, 0.9, 2 + c.r * 1.8);
      }
      if (biome === "frozen") {
        const c = cathedral(rand), m = put(c.g, back(3, 10), 3);
        if (m) for (const q of c.tops) lit(m, q.p, MINES.cyan, 6, 0.8, 3);
      }
      break;
    case "yard": {
      // sidings: parallel tracks with carts parked on them
      const at = back(5, 2);
      if (at) {
        const yard = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const r = rails(12);
          r.position.z = (k - 1) * 1.9;
          yard.add(r);
          if (rand() < 0.8) {
            const c = oreCart(rand, rand() < 0.8);
            c.g.position.set((rand() - 0.5) * 7, 0, (k - 1) * 1.9);
            yard.add(c.g);
          }
        }
        yard.add(at_(rails(3), 7.2, 0, 1.9, 0.3), at_(winchBuffer(), 6.2, 0, -1.9));
        if (put(yard, at, 5.5, rand() * 0.3 - 0.15)) lit(yard, new THREE.Vector3(0, 1.6, 0), MINES.cyan, 7, 0.7, 3);
      }
      break;
    }
    case "chasm": {
      // (hung no lower than the floor under it lets it swing clear: the rock a unit and a half down its rope's reach)
      const dc = back(1.5, 2);
      if (dc) { const under = Math.min(...[1.6, 2.6, 3.6].map((d) => cv.floor(dc[0], dc[1] + d))), drop = Math.max(1.2, Math.min(3, cv.floor(dc[0], dc[1]) - under - 1.4)); put(danglingCart(rand, drop), dc, 1.5, 0); }
      break;
    }
    case "grotto": case "lode": {
      const c = cathedral(rand), m = put(c.g, back(3, 10), 3);
      if (m) for (const q of c.tops) lit(m, q.p, q.hue, 7, 0.9, 3.4);
      if (biome === "lode") {
        const t = put(treasure(rand), back(2.2, 2), 2.2, rand() - 0.5);
        if (t) lit(t, new THREE.Vector3(0, 0.8, 0), GOLD, 5, 0.6, 2.2);
      }
      break;
    }
    case "falls": {
      const wf = waterfall(rand, 8, 2.6), m = put(wf.g, back(3.6, 9), 3.6);
      if (m) {
        lit(m, wf.pool, 0x5fd8f0, 8, 1, 3.6);
        // (at the fall's foot, the water pouring onto its buckets)
        const bw = bucketWheel(1.6);
        bw.position.set(1.0, 0, 0.55);
        m.add(bw);
      }
      break;
    }
    case "forge": case "lavafalls": {
      if (biome === "forge") {
        const f = forge(rand, lava), m = put(f.g, back(2.8, 5), 2.8, rand() * 0.4 - 0.2);
        if (m) (lit(m, f.fire, ORANGE, 8, 1.2, 4), lit(m, f.anvil, GOLD, 3, 0.4, 1.2));
      }
      for (let k = 0; k < (biome === "lavafalls" ? 2 : 1); k++) {
        const lf = lavaFall(rand, 7 + rand() * 3, 2 + rand(), lava), m = put(lf.g, back(3, 10), 3);
        if (m) (lit(m, lf.glow, ORANGE, 10, 1.3, 6), lit(m, lf.pool, GOLD, 7, 1, 3));
      }
      break;
    }
    case "collapse": {
      const d = put(drillHead(rand, 2.2), back(3, 5), 3);
      if (d) lit(d, new THREE.Vector3(0, 2.2, 1.2), MINES.lantern, 5, 0.5, 1.8, true);
      put(dynamiteShed(), spot(4, 18, 1.8, 2.5), 1.8, rand() * 0.6 - 0.3);
      break;
    }
    case "boiler": {
      const b = boiler(rand, lava), m = put(b.g, back(2.6, 5), 2.6, rand() * 0.4 - 0.2);
      if (m) {
        lit(m, b.fire, ORANGE, 5, 0.9, 2.4);
        m.updateMatrixWorld(true);
        m.add(smoke(b.steam));
      }
      break;
    }
    case "vault": {
      for (let k = 0; k < 3; k++) {
        const tr = treasure(rand);
        tr.scale.setScalar(1.7);
        const t = put(tr, back(3.4, 3), 3.4, rand() - 0.5);
        if (t) lit(t, new THREE.Vector3(0, 0.8, 0), GOLD, 5, 0.6, 2.2);
      }
      break;
    }
  }
  // small surprises: two or three of these, on the floor near enough to see
  const surprises: (() => void)[] = [
    () => { const c = put(canary(), spot(2.5, 9, 0.8, 2), 0.8, rand() * 6); if (c) { const l = lamp(); l.position.set(-0.2, 1.62, 0.15); c.add(l); lit(c, new THREE.Vector3(-0.2, 1.9, 0.15), MINES.lantern, 4, 0.8, 2.2, true); } },
    () => put(sleeper(rand), spot(2, 10, 0.8), 0.8, rand() * 6),
    () => { const c = canteen(rand, lamp()), m = put(c.g, spot(3, 12, 1.6, 1), 1.6, rand() * 6); if (m) lit(m, c.lamp, MINES.lantern, 4.5, 0.9, 2.4, true); },
    () => put(fossil(rand), spot(3, 14, 1.4, 2), 1.4, rand() * 6),
    () => put(dynamiteShed(), spot(4, 16, 1.8, 2.5), 1.8, rand() * 0.6 - 0.3),
    () => put(ponyStall(rand), spot(4, 16, 1.9, 2.5), 1.9, rand() * 6),
  ];
  // the Pithead has its canary by the lamp and its pony asleep; the others a few of these
  if (minesOrder(s) === 1) (surprises[0](), surprises.pop()!(), surprises.shift());
  const take = low ? 1 : 2 + (rand() < 0.5 ? 1 : 0);
  for (let k = 0; k < take; k++) surprises.splice(Math.floor(rand() * surprises.length), 1)[0]();
  void [reserve, hot];
}
const at_ = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0) => (o.position.set(x, y, z), (o.rotation.y = ry), o);
/** A buffer stop at a siding's end: a timber beam on posts. */
function winchBuffer() {
  const g = new THREE.Group();
  const beam = board(0.4, 0.5, 1.8, 0xa8392e);
  beam.position.y = 0.7;
  g.add(beam);
  for (const z of [-0.6, 0.6]) {
    const p = board(0.25, 0.8, 0.25, MINES.timberDark);
    p.position.set(0, 0.4, z);
    g.add(p);
  }
  return g;
}

/**
 * "Hot" mode, a lava hole's heat whatever the weather: the lava's glow on
 * the rock and the lane round it (orange pools baked like the lanterns'),
 * embers rising off it and drifting (with the draught when there is one).
 */
function heat(cv: Cave, s: Hole, rand: Rand) {
  const hot: THREE.Vector3[] = [];
  for (const q of s.zones || []) {
    if (!q.skin.startsWith("lava")) continue;
    for (let x = q.min[0] + 1; x < q.max[0]; x += 2.6)
      for (let z = q.min[1] + 1; z < q.max[1]; z += 2.6) {
        if (!inZone(q, x, z)) continue;
        const y = cv.t.height(x, z);
        hot.push(new THREE.Vector3(x, y, z));
        cv.pools.push({ x, y: y + 0.6, z, r: 4.2, c: new THREE.Color(MINES.lava), k: 0.55, lamp: false });
      }
  }
  // (and far lava in the decor: its glows are there already)
  for (const q of cv.glows) if (q.c === MINES.lava || q.c === MINES.lavaHi) hot.push(new THREE.Vector3(q.x, q.y - 1, q.z));
  const g = new THREE.Group();
  if (!hot.length) return g;
  const n = quality.low ? 40 : 110, pos = new Float32Array(n * 3);
  const life = Array.from({ length: n }, () => ({ from: hot[Math.floor(rand() * hot.length)], T: 2.5 + rand() * 3, ph: rand() * 6, dx: (rand() - 0.5) * 2.2, dz: (rand() - 0.5) * 2.2 }));
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), EMBER());
  pts.frustumCulled = false;
  (ud(pts).live = true), (pts.name ||= "mines:heat");
  g.add(pts);
  animate((t) => {
    const w = windNow();
    life.forEach((e, i) => {
      const u = ((t + e.ph * e.T) % e.T) / e.T, up = u * 4.5;
      pos[i * 3] = e.from.x + e.dx * 0.5 + Math.sin(t * 1.3 + e.ph) * 0.3 * u + w.x * 30 * up;
      pos[i * 3 + 1] = e.from.y + 0.2 + up;
      pos[i * 3 + 2] = e.from.z + e.dz * 0.5 + Math.cos(t * 1.1 + e.ph) * 0.3 * u + w.y * 30 * up;
    });
    pts.geometry.attributes.position.needsUpdate = true;
  });
  return g;
}
// (round and soft, the glow's own falloff: not square flakes; made when first drawn, the canvas a browser's)
let emberMat: THREE.PointsMaterial | null = null, moteMat: THREE.PointsMaterial | null = null;
const EMBER = () => (emberMat ||= share(new THREE.PointsMaterial({ map: glowTex(), color: 0xffa040, size: 0.28, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));

/** Dust motes turning slowly in the lanterns' light. */
function motes(cv: Cave, rand: Rand) {
  const lamps = cv.glows.filter((q) => q.lamp && Math.max(-q.x, q.x - cv.W, -q.z, q.z - cv.H) < 6);
  const g = new THREE.Group();
  if (!lamps.length || quality.low) return g;
  const n = Math.min(90, lamps.length * 8), pos = new Float32Array(n * 3);
  const m = Array.from({ length: n }, () => ({ l: lamps[Math.floor(rand() * lamps.length)], a: rand() * 6, r: 0.3 + rand() * 1.4, y: (rand() - 0.7) * 2.2, s: 0.1 + rand() * 0.2 }));
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)), MOTE());
  pts.frustumCulled = false;
  (ud(pts).live = true), (pts.name ||= "mines:motes");
  g.add(pts);
  animate((t) => {
    m.forEach((d, i) => pos.set([d.l.x + Math.cos(d.a + t * d.s) * d.r, d.l.y + d.y + Math.sin(t * d.s * 2 + d.a) * 0.2, d.l.z + Math.sin(d.a + t * d.s) * d.r], i * 3));
    pts.geometry.attributes.position.needsUpdate = true;
  });
  return g;
}
const MOTE = () => (moteMat ||= share(new THREE.PointsMaterial({ map: glowTex(), color: 0xffe6b0, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));

/**
 * Every glow of the hole (lanterns, crystals, lava, glowworms) as one set of
 * points: additive, sized each its own, the glowworms twinkling, the
 * lanterns' put out with them (cv.lampK). The Low tier keeps only those near
 * the board.
 */
function glowBatch(cv: Cave, s: Hole) {
  const W = s.board.w, H = s.board.h;
  const list = quality.low ? cv.glows.filter((q) => Math.max(-q.x, 0, q.x - W, -q.z, 0, q.z - H) < 4 || q.tw) : cv.glows;
  const n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), kind = new Float32Array(n * 2), hook = new Float32Array(n * 4), c = new THREE.Color();
  list.forEach((q, i) => {
    pos.set([q.x, q.y, q.z], i * 3);
    c.set(q.c);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = q.s;
    kind.set([q.lamp ? 1 : 0, q.tw || 0], i * 2);
    if (q.hook) hook.set([q.hook.x, q.hook.y, q.hook.z, 1], i * 4);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("gSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("gKind", new THREE.BufferAttribute(kind, 2));
  geo.setAttribute("gHook", new THREE.BufferAttribute(hook, 4));
  const m = new THREE.PointsMaterial({ map: glowTex(), vertexColors: true, size: 1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const lampK = cv.lampK;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uLamp = lampK;
    sh.uniforms.uWind = { value: windNow() };
    sh.uniforms.uBall = uBall;
    sh.vertexShader = "uniform float uTime;\nuniform float uLamp;\nuniform vec2 uWind;\nuniform vec3 uBall;\nattribute float gSize;\nattribute vec2 gKind;\nattribute vec4 gHook;\nfloat vFade = 0.0;\n" + sh.vertexShader
      // (a hanging lamp's glow swings with it: SWING, as the lamps do; and fades out with it: SIGHT)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  if (gHook.w > 0.0) {\n  vec3 aHook = gHook.xyz;" + SIGHT + SWING + "\n  }")
      .replace("gl_PointSize = size;", `float tw = gKind.y > 0.0 ? 0.55 + 0.45 * sin(uTime * (1.3 + fract(position.x * 7.1) * 2.0) + position.z * 3.7) : 1.0 + 0.06 * sin(uTime * 3.1 + position.x);
  // a lantern's flame flickers
  if (gKind.x > 0.0) tw *= 1.0 + 0.07 * sin(uTime * 13.0 + position.x * 5.0) + 0.05 * sin(uTime * 7.3 + position.z * 3.0);
  gl_PointSize = size * gSize * tw * mix(1.0, uLamp, gKind.x) * (1.0 - vFade);
  if (gKind.y > 0.0 && cameraPosition.y > position.y - 6.0) gl_PointSize = 0.0;`)
      .replace("#include <color_vertex>", "#include <color_vertex>\n  vColor.rgb *= mix(1.0, uLamp, gKind.x);");
  };
  m.customProgramCacheKey = () => "minesGlow";
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  (ud(pts).live = true), (pts.name ||= "mines:glowBatch");
  return pts;
}

/**
 * The headlamp's light on the ground: a cone of warm light from the gnome's
 * feet the way he faces (at rest the way he aims; rolling, the way he goes),
 * and a soft pool round him, so he reads in the dark. Additive, a sheet laid
 * on the lane as it lies (its height at every point of a fine grid), its
 * shape the shader's (a soft angular edge, a round end, fading out), clipped
 * to the lane itself (the lane's edge texture, wearTex: nothing past a kerb,
 * under a wall or over a drop). Hung from his root, not his spinning body:
 * it finds him in the scene as it is drawn (gnome.ts gnomeIn), and is off
 * while his lamp is (headlamp()).
 */
function headlamp(s: Hole) {
  const lift = surfaceOf(s) === "planks" ? 0.08 : 0.03; // (over a gantry's boards, not under them)
  const cv = caveOf(s), R = 7.5, HALF = 0.42, NA = 22, NS = 14, BACK_ = 2, SIDE_ = R * Math.sin(HALF) + 0.6;
  const geo = new THREE.PlaneGeometry(1, 1, NA, NS), pos = geo.attributes.position as THREE.BufferAttribute;
  const uO = { value: new THREE.Vector2() }, uD = { value: new THREE.Vector2(1, 0) }, uK = { value: 0 }, uFree = { value: 0 };
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe2a6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uWear: { value: wearTex(cv) }, uBoard: { value: new THREE.Vector2(cv.W, cv.H) }, uO, uD, uK, uFree });
    sh.vertexShader = "varying vec2 vLampW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vLampW = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = "uniform sampler2D uWear;\nuniform vec2 uBoard, uO, uD;\nuniform float uK, uFree;\nvarying vec2 vLampW;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  {
    vec2 rel = vLampW - uO;
    float along = dot(rel, uD), side = dot(rel, vec2(-uD.y, uD.x)), d = length(rel), ang = abs(atan(side, max(along, 1e-3)));
    // the cone: soft at its sides, round at its end, dimming as it goes; the pool round his feet
    float cone = step(0.0, along) * (1.0 - smoothstep(${(HALF * 0.55).toFixed(3)}, ${HALF.toFixed(3)}, ang)) * (1.0 - smoothstep(${(R * 0.55).toFixed(2)}, ${R.toFixed(2)}, d)) * pow(1.0 - min(d / ${R.toFixed(2)}, 1.0), 1.2);
    float pool = 0.7 * (1.0 - smoothstep(0.5, 1.7, d));
    // only on the lane, faded in from half a unit inside its cells' edge (the texture's
    // edge distance, 1.5 at 1): the drawn lane's outline is smooth, its cells' a staircase,
    // and a sheet lit past the one over the drop showed the steps as a saw-tooth;
    // falling into the pit, on the pit's floor under him (uFree)
    float on = max(uFree, smoothstep(0.3, 0.55, texture2D(uWear, vLampW / uBoard).r * 1.5));
    diffuseColor.rgb *= max(cone + 0.12 * (1.0 - smoothstep(0.0, ${R.toFixed(2)}, d)) * step(0.0, along) * (1.0 - smoothstep(${(HALF * 0.8).toFixed(3)}, ${(HALF * 1.3).toFixed(3)}, ang)), pool) * on * uK;
  }`);
  };
  mat.customProgramCacheKey = () => "mines-headlamp";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  (ud(mesh).live = true), (mesh.name ||= "mines:headlamp");
  const last = new THREE.Vector3(NaN, 0, 0), fwd = new THREE.Vector3(), at = new THREE.Vector3(), sc = new THREE.Vector3();
  let yaw = Math.PI / 2;
  mesh.onBeforeRender = (_r, scene) => {
    const gn = gnomeIn(scene), lamp = gn && gn.userData.lamp;
    if (!gn || !lamp || !shown(lamp)) return void ((uK.value = 0), cv.lake?.follow(0, 0, 0, 0));
    // he as drawn now (his world point: a ride may carry him), and only while
    // he is on the lane: into a hopper, down a hatch, off in a cart or a lift,
    // over the void, the light goes with him, not left on the ground behind
    const p = gn.getWorldPosition(at), lh = cv.lane(p.x, p.z) ? cv.t.height(p.x, p.z) : NaN;
    cv.lake?.follow(p.x, p.z, p.y - WATERLINE, 0.9); // (his lamp on the lake under him)
    // on the lane, the light on it; dropping into the pit (off the lane, over its floor, still
    // over it), the light goes down with him: on the pit's floor under him, brighter as he nears it
    const onLane = Math.abs(p.y - 0.5 - lh) < 0.45, floorY = (cv.pitAt && cv.pitAt(p.x, p.z)) ?? NaN, falling = !onLane && Number.isFinite(floorY) && p.y > floorY - 0.2 && !cv.lane(p.x, p.z);
    if ((!onLane && !falling) || gn.getWorldScale(sc).y < 0.6) return void ((uK.value = 0), last.set(NaN, 0, 0));
    uFree.value = falling ? 1 : 0;
    // which way: rolling, the way he rolls; at rest, the way he faces
    const vx = p.x - last.x, vz = p.z - last.z, moving = Number.isFinite(vx) && Math.hypot(vx, vz) > 0.02;
    last.copy(p);
    let want = yaw;
    if (moving) want = Math.atan2(vz, vx);
    else {
      fwd.set(0, 0, 1).applyQuaternion(gn.userData.body.quaternion);
      if (Math.hypot(fwd.x, fwd.z) > 0.3) want = Math.atan2(fwd.z, fwd.x);
    }
    yaw += Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)) * 0.25;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    // the sheet under the light, on the ground as it lies
    for (let i = 0; i < pos.count; i++) {
      const u = (i % (NA + 1)) / NA, v = Math.floor(i / (NA + 1)) / NS, lx = -BACK_ + u * (R + BACK_ + 0.3), lz = (v - 0.5) * 2 * SIDE_;
      const x = p.x + lx * cs - lz * sn, z = p.z + lx * sn + lz * cs;
      pos.setXYZ(i, x, (falling ? cv.pitAt!(x, z) ?? floorY : cv.t.height(x, z)) + lift, z);
    }
    pos.needsUpdate = true;
    uO.value.set(p.x, p.z);
    uD.value.set(cs, sn);
    uK.value = (cv.lampK.value < 0.5 ? 1.25 : 0.24) * (falling ? Math.max(0.35, 1 - (p.y - floorY) / 8) * 2 : 1); // (in the dark it is the light; down the pit, the only light)
  };
  return mesh;
}

/** The cup's own lamp: a warm ring of light on the lane round it, a
 *  lantern's glow over it, so it is found in the dark. */
function cupLamp(s: Hole) {
  const cv = caveOf(s), [x, z] = s.cup, R = cupRadius(s), g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(R + 0.15, R + 0.9, 40).rotateX(-Math.PI / 2), CUP_GLOW);
  ring.position.set(x, cv.t.height(x, z) + 0.05, z);
  (ud(ring).live = true), (ring.name ||= "mines:cupLamp");
  g.add(ring);
  cv.glows.push({ x, y: cv.t.height(x, z) + 3.1, z, c: MINES.lantern, s: 3.2 });
  cv.pools.push({ x, y: cv.t.height(x, z) + 2.5, z, r: 4, c: new THREE.Color(MINES.lantern), k: 0.5, lamp: false });
  return g;
}
const CUP_GLOW = share(new THREE.MeshBasicMaterial({ color: 0x6b4a1c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));

// ------------------------------------------------------------ the light

/**
 * After the merge: every lit mesh's colours take the pools of light round it
 * (a lantern's warm, a crystal's cool, the lava's), and fall off into the
 * dark away from the board, the lit pocket in the cave; kept so "Lights out"
 * can put the lanterns' out (cv.lamps).
 */
function baked(course: THREE.Object3D) {
  const s = (course.userData as { state: Hole }).state, cv = caveOf(s), W = s.board.w, H = s.board.h;
  // the edge's wear texture, freed with the course: its root owns it (the merge
  // drops an emptied group, and what it owned went unfreed with it)
  (ud(course).owned ||= []).push(wearTex(cv));
  // the pools by cell, for a vertex to find the few near it
  const CELLW = 8, bins = new Map<string, Pool[]>();
  for (const p of cv.pools)
    for (let i = Math.floor((p.x - p.r) / CELLW); i <= Math.floor((p.x + p.r) / CELLW); i++)
      for (let j = Math.floor((p.z - p.r) / CELLW); j <= Math.floor((p.z + p.r) / CELLW); j++) {
        const k = i + "," + j;
        if (!bins.has(k)) bins.set(k, []);
        bins.get(k)!.push(p);
      }
  // each mesh's colours written lit with the lamps out, and kept of the lamps
  // only what they add where they reach (index, amount): switching them adds
  // or takes that back, no copy of the whole colours kept
  const lit: { a: THREE.BufferAttribute; at: Uint32Array; add: Float32Array }[] = [];
  let cur = 0;
  course.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.matrixAutoUpdate || ud(o).live) return;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.Material>, m = mesh.material;
    const a = mesh.geometry.attributes.color as THREE.BufferAttribute | undefined;
    if (!a || a.itemSize !== 3 || m instanceof THREE.MeshBasicMaterial || md(m).hull || m.transparent) return;
    const p = mesh.geometry.attributes.position, n = p.count, arr = a.array as Float32Array, at: number[] = [], add: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // the pocket: light round the board, the dark closing in away from it
      const off = Math.max(-x, 0, x - W, -z, 0, z - H), vig = 1 - 0.5 * smoothstep((off - 5) / 24) - 0.3 * smoothstep((GRASS - 1 - y) / 6);
      let r = vig, g = vig, b = vig, wr = 0, wg = 0, wb = 0;
      for (const q of bins.get(Math.floor(x / CELLW) + "," + Math.floor(z / CELLW)) || []) {
        const d = Math.hypot(x - q.x, (y - q.y) * 0.8, z - q.z);
        if (d >= q.r) continue;
        const f = (1 - d / q.r) ** 2 * q.k;
        if (q.lamp) (wr += q.c.r * f), (wg += q.c.g * f), (wb += q.c.b * f);
        else (r += q.c.r * f), (g += q.c.g * f), (b += q.c.b * f);
      }
      // (lit, and a little light of its own on dark rock: a pool reads on it)
      const cool = [r, g, b], warm = [wr, wg, wb];
      for (let c = 0; c < 3; c++) {
        const k = i * 3 + c, base = arr[k];
        arr[k] = base * cool[c] + 0.1 * Math.max(0, cool[c] - 1);
        if (warm[c] > 0) (at.push(k), add.push((base * 1.6 + 0.14) * warm[c]));
      }
    }
    a.needsUpdate = true;
    if (at.length) lit.push({ a, at: Uint32Array.from(at), add: Float32Array.from(add) });
  });
  const apply = (k: number) => {
    const dk = k - cur;
    cur = k;
    if (!dk) return;
    for (const { a, at, add } of lit) {
      const arr = a.array as Float32Array;
      for (let j = 0; j < at.length; j++) arr[at[j]] += dk * add[j];
      a.needsUpdate = true;
    }
  };
  // on: the lanterns come up at once; off, they gutter and die over a second
  // and a half (their glows and glass flicker down, then their pools go)
  let want = -1, t0 = 0;
  const glass = (k: number) => (lanternsLit(k), WINDOW.color.setHex(0xffc86b).lerp(DEAD_GLASS, 1 - k));
  cv.lamps = (on) => {
    const k = on ? 1 : 0;
    if (k === want) return;
    const first = want < 0;
    want = k;
    t0 = -1;
    if (k || first || !motion) (cv.lampK.value = k), glass(k), apply(k);
  };
  // (run by the decor's clock: baked runs after the hole's ticks are gathered)
  cv.tick = (t) => {
    if (want !== 0 || cv.lampK.value === 0) return;
    if (t0 < 0) t0 = t;
    const u = (t - t0) / 1.5, flick = 0.55 + 0.45 * Math.sin(t * 31) * Math.sin(t * 17.3);
    if (u >= 1) return void ((cv.lampK.value = 0), glass(0), apply(0));
    cv.lampK.value = (1 - u) * flick;
    glass(cv.lampK.value);
  };
  cv.lamps(!darkGallery(s));
}

// ------------------------------------------------------------ the board

/** The board's rough: the floor's own (drawn by base), nothing over it. */
const rough = { lo: MINES.slate, hi: MINES.slate, mound: 0, plant: () => null };
/** The lane's surface by the hole's biome: packed ore dirt, planks (a
 *  gantry over the void), slate flags, basalt's hexagons (the lava's
 *  caverns), iron tread plate (the engine halls), pale crystal stone, the
 *  vault's marble. Always the brightest ground in the cave. */
type Surface = "dirt" | "planks" | "slate" | "basalt" | "tread" | "crystal" | "marble";
const SURFACE: Record<Biome, Surface> = {
  gallery: "dirt", hollow: "dirt", yard: "dirt", chasm: "slate", grotto: "crystal", falls: "slate", forge: "basalt",
  shaft: "tread", collapse: "dirt", boiler: "tread", lavafalls: "basalt", frozen: "crystal", vault: "marble", lode: "crystal",
};
const TONES: Record<Exclude<Surface, "planks">, readonly [number, number]> = {
  dirt: [MINES.carpet, MINES.carpetDark], slate: [0xa39c9c, 0x9d9696], basalt: [0x9c92a6, 0x968ca0],
  tread: [0xa4a8b4, 0x9ea2ae], crystal: [0xb4c6d8, 0xadbfd2], marble: [0xe0d4bc, 0xdacdb4],
};
// (the Stamp Mill's floors: iron tread plate, the engine hall's, not the Pithead's boardwalk)
const surfaceOf = (s: Hole): Surface => (minesOrder(s) === 6 ? "tread" : [1, 14].includes(minesOrder(s)) && (s.zones || []).some((q) => q.skin === "void") ? "planks" : SURFACE[biomeOf(s)]);
const green = (s: Hole): readonly [number, number] | "planks" => { const k = surfaceOf(s); return k === "planks" ? k : TONES[k]; };

/**
 * How far in from the lane's edge each point of the board is (0 at a rail
 * or over the void, up to 1.5 units in), a texel every quarter unit, for
 * the edge's wear (laneLook); made once a hole, freed with it (the course owns it: baked).
 */
function wearTex(cv: Cave) {
  if (cv.wear) return cv.wear;
  const S = 4, nx = Math.ceil(cv.W * S), nz = Math.ceil(cv.H * S), D = new Float32Array(nx * nz), data = new Uint8Array(nx * nz);
  const fixed = (cv.s.walls || []).filter((w) => !w.every);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = (i + 0.5) / S, z = (j + 0.5) / S;
      D[j * nx + i] = cv.lane(x, z) && !fixed.some((w) => Math.abs(w.a[0] - x) + Math.abs(w.a[1] - z) < 99 && segNear(x, z, w.a, w.b)) ? 1e4 : 0;
    }
  const a = 1 / S, d2 = a * Math.SQRT2;
  for (let pass = 0; pass < 2; pass++)
    for (let jj = 0; jj < nz; jj++)
      for (let ii = 0; ii < nx; ii++) {
        const i = pass ? nx - 1 - ii : ii, j = pass ? nz - 1 - jj : jj, k = j * nx + i, s0 = pass ? -1 : 1;
        if (!D[k]) continue;
        const ni = i - s0, nj = j - s0;
        let v = D[k];
        if (ni >= 0 && ni < nx) v = Math.min(v, D[k - s0] + a);
        if (nj >= 0 && nj < nz) {
          v = Math.min(v, D[k - s0 * nx] + a);
          if (ni >= 0 && ni < nx) v = Math.min(v, D[k - s0 * nx - s0] + d2);
          const oi = i + s0;
          if (oi >= 0 && oi < nx) v = Math.min(v, D[k - s0 * nx + s0] + d2);
        }
        D[k] = v;
      }
  for (let k = 0; k < D.length; k++) data[k] = Math.round(Math.min(1.5, D[k]) / 1.5 * 255);
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return (cv.wear = tex);
}
const segNear = (x: number, z: number, a: Vec2, b: Vec2) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) < 0.32;
};

// each surface's pattern, in the fragment (on the lane's top: vGrainW, the
// grain's world point; grainNoise/grainHash, its noise)
const PATTERN: Record<Surface, () => string> = {
  dirt: () => `
    float mo = grainNoise(vec3(lp * 0.55, 0.0)) * 0.6 + grainNoise(vec3(lp * 1.9, 3.0)) * 0.4;
    diffuseColor.rgb *= 0.93 + 0.07 * floor(mo * 3.0);
    vec2 pc = floor(lp * 1.6), pf = fract(lp * 1.6);
    float ph = grainHash(vec3(pc, 1.0));
    float pd = length(pf - (0.15 + 0.7 * vec2(grainHash(vec3(pc, 2.0)), grainHash(vec3(pc, 3.0)))));
    float peb = (1.0 - smoothstep(0.05, 0.08, pd * (0.7 + ph))) * step(0.7, ph);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * (ph > 0.85 ? 1.22 : 0.7), peb);
    ${CELLS("lp * 0.9")}
    float dry = step(0.62, grainNoise(vec3(lp * 0.21, 7.0)));
    diffuseColor.rgb *= 1.0 - 0.22 * dry * (1.0 - smoothstep(0.02, 0.05, f2 - f1));
    ${CHIPS}`,
  // (a gantry's lane is under its boards (deckOf): what shows between them is the dark under the deck)
  planks: () => `
    diffuseColor.rgb *= 0.22;`,
  slate: () => SLABS("vec2(0.55, 0.8)", "vec3(0.0)"),
  basalt: () => `
    // the tops of basalt columns: hexagons, each its tone, dark seams
    vec2 hq = lp * 1.1;
    vec2 hr = vec2(1.0, 1.7320508), hh = hr * 0.5;
    vec2 ha = mod(hq, hr) - hh, hb = mod(hq - hh, hr) - hh;
    vec2 hv = dot(ha, ha) < dot(hb, hb) ? ha : hb, hid = hq - hv;
    float he = 0.5 - max(abs(hv.x) * 0.866 + abs(hv.y) * 0.5, abs(hv.y));
    float hh2 = grainHash(vec3(floor(hid * 10.0), 9.0));
    diffuseColor.rgb *= (0.9 + 0.15 * hh2) * mix(0.6, 1.0, smoothstep(0.02, 0.06, he));`,
  tread: () => `
    // iron tread plate: raised diamonds in rows, a rivet line every two units
    vec2 tq = lp * 3.0;
    tq.x += 0.5 * mod(floor(tq.y), 2.0);
    vec2 tf = fract(tq) - 0.5;
    float dm = abs(tf.x * 1.8 + tf.y * 0.9) + abs(tf.y * 0.9 - tf.x * 1.8 * 0.0);
    diffuseColor.rgb *= 1.0 + 0.14 * (1.0 - smoothstep(0.12, 0.2, abs(tf.x * 2.2 + tf.y) * 0.5 + abs(tf.y) * 0.4));
    vec2 rv = vec2(fract(lp.x * 0.5) - 0.5, fract(lp.y * 1.5) - 0.5);
    diffuseColor.rgb *= 1.0 - 0.35 * (1.0 - smoothstep(0.05, 0.08, length(vec2(rv.x * 2.0, rv.y * 0.7))));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.32, 0.2), 0.25 * smoothstep(0.55, 0.8, grainNoise(vec3(lp * 0.7, 4.0))));
    dm += 0.0;`,
  crystal: () => SLABS("vec2(0.45, 0.65)", "vec3(0.55, 0.9, 1.0)"),
  marble: () => `
    // the vault's floor: big dressed slabs of pale stone, gold running in their veins
    ${CELLS("lp * 0.45")}
    float fh = grainHash(vec3(cid, 3.0));
    diffuseColor.rgb *= 0.92 + 0.1 * fh;
    float vein = abs(sin(lp.x * 1.3 + 3.0 * grainNoise(vec3(lp * 0.6, 2.0)) + lp.y * 0.4));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.72, 0.3), 0.5 * (1.0 - smoothstep(0.02, 0.07, vein)) * step(0.5, fh));
    diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.04, 0.09, f2 - f1));`,
};
// dressed slabs in courses (a running bond, each course its own offset), per
// square unit `per` of them: each slab its tone, the joints dark and fine,
// the arrises worn paler, a crack across one in four, the whole scuffed paler
// in patches where the traffic goes; a vein of crystal in some (fleck: its
// colour, none if black)
const SLABS = (per: string, fleck: string) => `
    vec2 slQ = lp * ${per};
    slQ.y += 0.35 * (grainNoise(vec3(lp.x * 0.3, 0.0, 13.0)) - 0.5); // (courses wandering: cleft stone, not a pavement)
    float slRow = floor(slQ.y);
    slQ.x += 0.5 * mod(slRow, 2.0) + 0.23 * grainHash(vec3(slRow, 0.0, 11.0)) + 0.4 * (grainNoise(vec3(lp.y * 0.45, slRow, 17.0)) - 0.5);
    vec2 slId = floor(slQ), slF = fract(slQ), slEd = min(slF, 1.0 - slF) / ${per};
    float slH = grainHash(vec3(slId, 6.0)), slE = min(slEd.x, slEd.y) + 0.03 * (grainNoise(vec3(lp * 5.0, 1.0)) - 0.5);
    diffuseColor.rgb *= 0.86 + 0.18 * slH + 0.06 * (grainNoise(vec3(lp * 1.7, slH * 7.0)) - 0.5);
    diffuseColor.rgb *= 1.0 + 0.05 * step(0.6, sin(dot(lp, vec2(0.8, 2.3)) * 3.0 + 4.0 * grainNoise(vec3(lp * 0.8, slH)))); // (its cleavage)
    diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.025, 0.05, slE));
    diffuseColor.rgb *= 1.0 + 0.09 * (1.0 - smoothstep(0.05, 0.13, slE)) * step(0.05, slE);
    float slCk = abs(dot(slF - 0.5, normalize(vec2(slH - 0.5, 0.7))) + 0.08 * (grainNoise(vec3(lp * 3.0, 5.0)) - 0.5));
    diffuseColor.rgb *= 1.0 - 0.35 * step(0.75, slH) * (1.0 - smoothstep(0.004, 0.014, slCk));
    diffuseColor.rgb *= 1.0 + 0.07 * smoothstep(0.55, 0.8, grainNoise(vec3(lp * 0.35, 9.0)));
    float slVn = abs(sin(dot(lp, vec2(1.1, 0.7)) + 2.5 * grainNoise(vec3(lp * 0.5, slH * 4.0))));
    diffuseColor.rgb = mix(diffuseColor.rgb, ${fleck}, 0.4 * step(0.8, slH) * step(0.01, dot(${fleck}, vec3(1.0))) * (1.0 - smoothstep(0.03, 0.08, slVn)));`;
// a cellular pattern: f1, f2 (the nearest two cell points) and cid (the nearest's cell)
const CELLS = (at: string) => `
    vec2 cq = ${at}, cc = floor(cq), cf = fract(cq), cid = cc;
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y)), pt = o + vec2(grainHash(vec3(cc + o, 4.0)), grainHash(vec3(cc + o, 5.0)));
      float d = length(cf - pt);
      if (d < f1) { f2 = f1; f1 = d; cid = cc + o; } else if (d < f2) f2 = d;
    }`;
// a chip of crystal glinting here and there
const CHIPS = `
    vec2 sc = floor(lp * 3.0), sf = fract(lp * 3.0) - 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.95, 1.0), 0.7 * step(0.985, grainHash(vec3(sc, 6.0))) * (1.0 - smoothstep(0.06, 0.1, length(sf))));`;

/**
 * The lane's texture (course.ts groundMesh asks for it: a hook over its own
 * grain): its surface's pattern on its top, and its edges worn — grimy and
 * chipped along every rail and over the void, where nobody walks; polished a
 * little down its middle.
 */
function laneLook(m: THREE.Material, s: Hole) {
  // (three declares the hook as a method; it is a closure, called as one)
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const prev = m.onBeforeCompile, key = m.customProgramCacheKey(), kind = surfaceOf(s);
  const wear = { value: wearTex(caveOf(s)) }, board = { value: new THREE.Vector2(s.board.w, s.board.h) };
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uWear = wear;
    sh.uniforms.uBoard = board;
    sh.fragmentShader = "uniform sampler2D uWear;\nuniform vec2 uBoard;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  if (vGrainN.y > 0.5) {
    vec2 lp = vGrainW.xz;
    ${PATTERN[kind]()}
    // the edge's wear: a grimy band, its inner line broken, grit in it
    float ed = texture2D(uWear, lp / uBoard).r * 1.5, wn = grainNoise(vec3(lp * 2.1, 11.0));
    float wr = 1.0 - smoothstep(0.12, 0.55 + 0.35 * wn, ed);
    diffuseColor.rgb *= 1.0 - 0.3 * wr * (0.75 + 0.25 * step(0.5, grainHash(vec3(floor(lp * 6.0), 12.0))));
    diffuseColor.rgb *= 1.0 + 0.05 * smoothstep(0.9, 1.5, ed);
  }`);
  };
  m.customProgramCacheKey = () => key + "|minesLane:" + kind;
  md(m).hook = m.customProgramCacheKey();
}
/** The rails: timber with iron posts. */
const kerb = { color: MINES.timber, post: MINES.iron };
/** Under ground: the cave's light, or the dark galleries'. */
const time = (s: Hole) => (darkGallery(s) ? "gallery" : "cave");

function piece(kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain, s: Hole): THREE.Object3D | null | undefined {
  // the void is the world's: drawn by base (the chasm), edging (its rim) and the lane's own cut face
  if (kind === "zone" && (item as Zone).skin === "void") return new THREE.Group();
  return rides.piece(kind, item, t, s) ?? pieces.piece(kind, item, t, s);
}

function extras(ex: Extras, s: Hole, t: Terrain) {
  const r = pulseSigns(pieces.extras(ex, s, t), ex, s);
  if (r) bakeLocal(r.group); // (the stroke's pieces and their signs: what stands still merged as one, the hole's bake leaving the live group)
  return r;
}

// the pieces draw the lone skinned walls (rock, crystal, grates, ropes), look
// two strokes ahead, ring the singing crystals, sink the lane's pits and drown
// the ball their own way;
// the rides give the carts their track; the timed pieces' dashed outlines are one line
// (the lane's wear overlay a row a unit: the mines' boards are big, their lanes flat)
const wearStep = 1;
const walls = true, fallCam = true, ahead = 2, ghostLine = true, pieceFade = true, route = true, { ring, fallIn, open } = pieces, { track } = rides;
// the machines standing over the kerb, as drawn: the water wheel's paddles and rim, the cage's lattice, the doors' leaves
// (a cage door to its lintel, 4.2: drawn up, the lattice hangs over the lane there, the camera sees over that too; a vault door's disc, 5.5)
const TALL: Record<string, number> = { paddle: 4, "cage door": 4.2, "swing door": 2, "safe door": 2, "vault door": 5.5 };
const wallHeight = (skin: string) => TALL[skin];
/** What a ball off the lane at (x, z) falls onto, as the pit is drawn there (its floor, pitFloor's pitAt and pitWet: its lake,
 *  its lava seam, dry floor), and the hazard whose ending it gets; undefined where no floor is drawn (the dark). */
const pit = (s: Hole, x: number, z: number) => {
  const cv = lastPit && minesOrder(lastPit.s) === minesOrder(s) ? lastPit : undefined, y = cv?.pitAt?.(x, z);
  if (!cv || y === undefined) return undefined;
  const wet = cv.pitWet?.(x, z);
  return wet === "water" ? { y: WATERLINE, end: "water" as const, as: "sump" } : wet === "lava" ? { y: VOID_FLOOR + 0.3, end: "lava" as const, as: "lava" } : { y, end: "floor" as const, as: "void" };
};
// the chase camera keeps clear of the pieces and over the cave's relief
const camSolids = true, camFloor = (s: Hole) => caveOf(s).floor;
export { base, edging, berms, decor, rough, green, kerb, time, baked, laneLook, lifted, piece, extras, walls, ahead, ghostLine, pieceFade, route, wallHeight, camSolids, camFloor, wearStep, ring, fallIn, fallCam, pit, open, track };
