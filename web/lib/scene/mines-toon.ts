// The Crystal Mines' toon kit, shared by its piece modules (mines-pieces,
// -machines, -zones, -pulses): the mines' ink, rock carved in strata, the
// crystal material lit from within, halos, timber, iron and rivets. The
// worlds' own look (materials.ts): MeshToon in three bands, ink hulls, the
// shared grain on carved things; what never moves is merged by the bake.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { drawn, relief, hullOf, share, ownFade, setFade, flat } from "./materials";
import { bakeLocal } from "./bake";
import { ud } from "./data";
import { md } from "./data";
import { MINES, crystalMat, planks } from "./mines-kit";
import { mod } from "../terrain";
import type { Rand } from "./common";

/** The mines' ink: a warm near-black, as ADR §6 has it. */
export const INK = hullOf(0.055, MINES.ink);
export const INK_THIN = hullOf(0.03, MINES.ink);

/** A solid in the mines' ink. */
export const inked = (geo: THREE.BufferGeometry, mat: THREE.Material, line: THREE.Material = INK) => drawn(geo, mat, line);

/**
 * A solid in one colour, as the mines draw every small part: the colour in
 * its vertices over the shared relief material, a thin ink hull — so the
 * parts of a moving piece merge into two draws (bakeLocal), whatever their
 * colours.
 */
export function solid(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, line: THREE.Material = INK_THIN) {
  const c = new THREE.Color(color);
  if (color === IRON || color === IRON_DARK) ironPaint(geo, c);
  else paint(geo, (_x, _y, _z, o) => o.copy(c));
  return small(geo) ? new THREE.Mesh(geo, relief()) : inked(geo, relief(), line);
}
/** Iron as the mines paint it: a tone of its own a piece, darker at its foot, its top edges worn toward steel. */
function ironPaint(geo: THREE.BufferGeometry, c: THREE.Color) {
  geo.computeBoundingBox();
  const b = geo.boundingBox!, h = Math.max(1e-3, b.max.y - b.min.y), tone = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin((b.min.x + b.max.z) * 12.9 + (b.max.x - b.min.z) * 78.2));
  paint(geo, (_x, y, _z, o) => { const u = (y - b.min.y) / h; o.copy(c).multiplyScalar(tone * (0.8 + 0.25 * u + (u > 0.92 ? 0.18 : 0))); });
}
/** A part too small to carry an ink outline (a bolt, a knob, a band): its hull would cost as much and read as a blot. */
const small = (geo: THREE.BufferGeometry) => (geo.computeBoundingSphere(), geo.boundingSphere!.radius < 0.2);

/** A part in one colour with no ink (small bits: pebbles, stripes, rollers), over the shared relief material. */
export function tinted(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const c = new THREE.Color(color);
  return new THREE.Mesh(paint(geo, (_x, _y, _z, o) => o.copy(c)), relief());
}

/**
 * A faceted solid: its body in flat facets (each face its own normal, as a
 * cut crystal or a split rock), its ink hull on the smooth shape, so the
 * outline stays whole round the corners.
 */
export function facets(geo: THREE.BufferGeometry, mat: THREE.Material, line: THREE.Material = INK) {
  const src = geo.clone();
  src.deleteAttribute("uv");
  src.deleteAttribute("normal");
  const smooth = src.index ? src : mergeVertices(src, 1e-4);
  smooth.computeVertexNormals();
  const cut = smooth.toNonIndexed();
  cut.computeVertexNormals();
  // (each face one colour, its three corners' mean: strata painted per vertex turn crisp, faceted, not smeared)
  const col = cut.attributes.color as THREE.BufferAttribute | undefined;
  if (col) for (let i = 0; i + 2 < col.count; i += 3) for (let k = 0; k < 3; k++) { const v = (col.getComponent(i, k) + col.getComponent(i + 1, k) + col.getComponent(i + 2, k)) / 3; for (let q = 0; q < 3; q++) col.setComponent(i + q, k, v); }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cut, mat), new THREE.Mesh(smooth, line));
  return g;
}

/** Soft value noise in 3D: smooth lumps for rock, [-1, 1]. */
export function lumps(x: number, y: number, z: number, o = 0) {
  return (
    0.5 * Math.sin(x * 1.7 + y * 2.9 + z * 1.3 + o) +
    0.3 * Math.sin(x * 3.1 - y * 1.7 + z * 2.3 + o * 1.7) +
    0.2 * Math.sin(-x * 5.3 + y * 4.1 + z * 4.7 + o * 2.3)
  );
}

const hash2 = (i: number, j: number) => {
  const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
/** Value noise in 2D, [0, 1]: blotches with no direction (lumps() makes bands). */
export function vnoise(x: number, z: number) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash2(i, j) * (1 - u) + hash2(i + 1, j) * u) * (1 - v) + (hash2(i, j + 1) * (1 - u) + hash2(i + 1, j + 1) * u) * v;
}

/**
 * Pushes a closed geometry's vertices out from `centre` by lumps (amp, over
 * freq): a lumpy rock or a stalagmite instead of a primitive. Returns an
 * indexed geometry with position only (its shared corners moved together).
 */
export function knobbly(geo: THREE.BufferGeometry, rand: Rand, amp: number, freq = 1.4, radialOnly = false) {
  for (const k of Object.keys(geo.attributes)) if (k !== "position") geo.deleteAttribute(k);
  const g = mergeVertices(geo, 1e-4), p = g.attributes.position, o = rand() * 50, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const d = radialOnly ? new THREE.Vector3(v.x, 0, v.z) : v.clone();
    const l = d.length();
    if (l < 1e-5) continue;
    v.addScaledVector(d.divideScalar(l), amp * lumps(v.x * freq, v.y * freq, v.z * freq, o));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Vertex colours from a function of the (local) vertex position. */
export function paint(geo: THREE.BufferGeometry, col: (x: number, y: number, z: number, c: THREE.Color) => void) {
  const p = geo.attributes.position, out = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    col(p.getX(i), p.getY(i), p.getZ(i), c);
    out.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return geo;
}

// rock in strata: bands a hand high, each its own tone, broken by lumps; the
// top catches the lanterns' warm light, the foot darkens into the floor
const STRATA = [0x5b5374, 0x4b4462, 0x665849, 0x544c6b, 0x5e4f43, 0x6a6384].map((c) => new THREE.Color(c));
const ROCK_TOP = new THREE.Color(0x877da0), ROCK_FOOT = new THREE.Color(0x2c2740);
/** Rock colours at a height y (world-ish: the bands line up from rock to rock), lit from above. */
export function strata(y: number, x: number, z: number, top: number, c: THREE.Color, seed = 0) {
  const band = Math.floor(y * 2.2 + 0.35 * lumps(x * 0.9, 0, z * 0.9, seed) + 40);
  c.copy(STRATA[mod(band, STRATA.length)]);
  if (y > top - 0.35) c.lerp(ROCK_TOP, Math.min(1, (y - top + 0.35) / 0.35) * 0.55);
  if (y < 0.3) c.lerp(ROCK_FOOT, Math.min(1, (0.3 - y) / 0.9));
  return c;
}

/** A rock: an icosahedron made lumpy, sx × sy × sz, its colours in strata; faceted, inked. */
export function boulder(rand: Rand, sx: number, sy: number, sz: number, detail = 1, lift = 0) {
  const geo = knobbly(new THREE.IcosahedronGeometry(1, detail), rand, 0.16 + rand() * 0.06, 1.3);
  geo.scale(sx, sy, sz);
  const seed = rand() * 9;
  paint(geo, (x, y, z, c) => strata(y + lift + sy, x, z, lift + sy * 2, c, seed));
  return facets(geo, relief());
}

// ---------------------------------------------------------------- crystals
//
// The crystals are the world's (mines-kit.ts crystalMat, shard, crystalCluster:
// one material for every crystal of a hole, its hue in its vertex colours);
// gem() gives any geometry that material in a hue.

/** A geometry as crystal in a hue (deep at its foot, pale to its top): flat facets, thin ink. */
export function gem(geo: THREE.BufferGeometry, hue: number, ink = true) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  g.computeBoundingBox();
  const lo = g.boundingBox!.min.y, span = g.boundingBox!.max.y - lo || 1, c0 = new THREE.Color(hue).multiplyScalar(0.62), c1 = new THREE.Color(hue).lerp(new THREE.Color(0xffffff), 0.45);
  paint(g, (_x, y, _z, c) => c.copy(c0).lerp(c1, ((y - lo) / span) ** 2));
  if (small(g) || !ink) {
    const o = new THREE.Group();
    o.add(new THREE.Mesh(g, crystalMat()));
    return o;
  }
  return drawn(g, crystalMat(), INK_THIN);
}

// the crystal's forms, as a mineralogist would sort them (the owner's list):
// long hex prisms with a pyramid tip, stubby double-terminated ones, tabular
// plates, needles, cubes of fluorite growing into each other; each a geometry
// with its foot at 0, about r wide and h tall
export type Form = "prism" | "double" | "plate" | "needle" | "cube";
const V2 = (x: number, y: number) => new THREE.Vector2(x, y);
export function form(kind: Form, r: number, h: number): THREE.BufferGeometry {
  switch (kind) {
    case "double": return new THREE.LatheGeometry([V2(0, -r * 0.2), V2(r, r * 0.9), V2(r, h - r * 0.9), V2(0, h + r * 0.4)], 6);
    case "plate": return new THREE.LatheGeometry([V2(0, 0), V2(r, 0), V2(r, h * 0.8), V2(0, h)], 6).scale(1, 1, 0.32);
    case "needle": return new THREE.LatheGeometry([V2(0, 0), V2(r * 0.35, 0), V2(r * 0.3, h * 0.85), V2(0, h)], 5);
    case "cube": {
      const a = new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4).rotateY(Math.PI / 4).translate(0, r * 0.7, 0);
      const b = new THREE.BoxGeometry(r, r, r).rotateY(0.3).rotateX(0.5).translate(r * 0.55, r * 1.25, r * 0.2);
      return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]);
    }
    default: return new THREE.LatheGeometry([V2(0, 0), V2(r, 0), V2(r, h), V2(0, h + r * 1.6)], 6);
  }
}
/**
 * A splayed cluster of crystals of mixed forms growing from a point, its foot
 * at 0: the tallest near the middle, the rest leaning out, uneven, in hues
 * graded from a deep foot to a pale tip (gem); about `size` tall and `R` wide.
 */
export function splay(rand: Rand, size: number, R: number, hues: readonly number[], n = 5, forms: readonly Form[] = ["prism", "prism", "double", "plate", "needle"], maxLean = 0.85, ink = true) {
  const g = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const main = k === 0, kind = main ? "prism" : forms[Math.floor(rand() * forms.length)], a = (k / n) * Math.PI * 2 + rand() * 0.9;
    const h = size * (main ? 1 : 0.35 + rand() * 0.55), r = size * (kind === "needle" ? 0.12 : main ? 0.2 : 0.1 + rand() * 0.08);
    const c = gem(form(kind, r, h), hues[Math.floor(rand() * hues.length)], ink);
    const off = main ? 0 : R * (0.25 + rand() * 0.55), lean = main ? rand() * 0.2 : Math.min(maxLean, 0.3 + rand() * 0.55);
    c.position.set(Math.cos(a) * off, -0.1 * size, Math.sin(a) * off);
    c.rotation.set(Math.sin(a) * lean, rand() * 6, -Math.cos(a) * lean);
    g.add(c);
  }
  return g;
}

// a crystal's halo: a soft additive shell, bright where it faces the eye and
// gone at its rim, so it reads as light, not a ball. One material for every
// halo of the hole, their colours (times their strength: it adds) in their
// vertices: merged by the bake into one draw; the Low tier keeps them (they
// are on the board)
let haloM: THREE.MeshBasicMaterial | null = null;
export function haloMat() {
  if (haloM) return haloM;
  const m = share(new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = "varying float vHalo;\n" + sh.vertexShader.replace(
      "#include <project_vertex>",
      "#include <project_vertex>\n  vHalo = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));",
    );
    sh.fragmentShader = "varying float vHalo;\n" + sh.fragmentShader.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\n  diffuseColor.rgb *= pow(vHalo, 3.4);", // (soft: gone well before its rim)
    );
  };
  m.customProgramCacheKey = () => "mines-halo";
  md(m).hook = "mines-halo";
  return (haloM = m);
}
/** A shell of light of its own (a flash, a veil that fades: its material its own, its opacity the caller's). */
export function glow(geo: THREE.BufferGeometry, color: number, opacity = 1) {
  const c = new THREE.Color(color), mat = haloMat().clone();
  mat.opacity = opacity;
  const m = new THREE.Mesh(paint(geo, (_x, _y, _z, o) => o.copy(c)), mat);
  m.renderOrder = 2;
  return m;
}
/** A halo of radius r, its colour at a strength (0..1). */
export function halo(r: number, color: number, strength = 0.34) {
  const c = new THREE.Color(color).multiplyScalar(strength);
  const m = new THREE.Mesh(paint(new THREE.IcosahedronGeometry(r, 1), (_x, _y, _z, o) => o.copy(c)), haloMat());
  m.renderOrder = 2;
  return m;
}

// the timber and the iron
/** The mines' one gold: its two tones, and its one material (vertex coloured, a low glow of its own: treasure catches the lamplight in the dark). */
export const GOLD = 0xe8b54a, GOLD_DARK = 0xb8862a;
export const goldMat = () => once("gold", () => flat(0xffffff, { vertexColors: true, emissive: 0x3a2508, emissiveIntensity: 0.6 }));
// (the kit's palette: one iron, one rust, one brass, one timber-dark for the whole of the mines)
export const TIMBER = MINES.timber, TIMBER_DARK = MINES.timberDark, TIMBER_LIGHT = 0xb57d47, IRON = MINES.iron, IRON_DARK = 0x3a3d48, RUST = MINES.rust, BRASS = MINES.brass;
/** A box with its edges chamfered (one segment of rounding: 108 triangles, a third of the shared rbox's): the mines' timbers and plates are many. */
// (a slender one, under 0.3 across, a plain box: its bevel would not read, its 96 more triangles would cost)
export const chamfer = (w: number, h: number, d: number, r = 0.05) => (Math.min(w, h, d) < 0.3 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2) * 0.98));
/** A timber: a grained, inked beam, w × h × d, centred. */
export const beam = (w: number, h: number, d: number, color: number = TIMBER) => {
  const geo = chamfer(w, h, d, Math.min(0.05, w / 4, h / 4, d / 4));
  // a darker grain toward the ends of its long way and toward the foot, lighter on top; a tone of its own a piece
  const tone = 0.88 + 0.24 * (0.5 + 0.5 * Math.sin(w * 71.3 + h * 29.1 + d * 53.7)), long = w >= h && w >= d ? 0 : d >= h ? 2 : 1;
  paint(geo, (x, y, z, c) => c.set(color).multiplyScalar(tone * (0.78 + 0.22 * (y / h + 0.5) - 0.12 * Math.abs(long === 0 ? x / w : long === 2 ? z / d : y / h))));
  return boxed(geo, w, h, d);
};
/** A chamfered box's body and its ink: the hull on a plain box of its size (12 triangles, not the chamfer's 108), its corners' normals shared so the outline closes. */
export function boxed(geo: THREE.BufferGeometry, w: number, h: number, d: number) {
  const b = new THREE.BoxGeometry(w, h, d);
  b.deleteAttribute("normal");
  b.deleteAttribute("uv");
  const hb = mergeVertices(b);
  hb.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, relief()), new THREE.Mesh(hb, INK_THIN));
  return g;
}
/** A round log (a prop): bark-grained, r × h, its foot at 0, the sawn end on top. */
export function log(r: number, h: number, color: number = TIMBER) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r * 0.94, r, h, 8, 2).translate(0, h / 2, 0);
  paint(geo, (x, y, z, c) => c.set(color).multiplyScalar(0.72 + 0.3 * (y / h) + 0.08 * Math.sin(Math.atan2(z, x) * 5)));
  g.add(inked(geo, relief(), INK_THIN));
  const end = new THREE.Mesh(paint(new THREE.CircleGeometry(r * 0.9, 10).rotateX(-Math.PI / 2).translate(0, h + 0.003, 0), (_x, _y, _z, c) => c.set(TIMBER_LIGHT)), relief());
  g.add(end);
  return g;
}
/** Rivets: little iron domes at the given points (on a face whose normal is n). */
export function rivets(pts: readonly THREE.Vector3[], r = 0.05) {
  // (a low four-sided dome each: a rivet reads by its dot, not its roundness)
  const geos = pts.map((p) => new THREE.ConeGeometry(r, r * 0.7, 4, 1).rotateX(Math.PI / 2).translate(p.x, p.y, p.z));
  return new THREE.Mesh(paint(mergeGeometries(geos), (_x, _y, _z, c) => c.set(IRON_DARK)), relief());
}
/** An iron plate, worn: iron with a rust-brown edge. w × h × d, centred. */
export function plate(w: number, h: number, d: number, color: number = IRON) {
  const geo = chamfer(w, h, d, Math.min(0.04, w / 4, h / 4, d / 4));
  const rust = new THREE.Color(RUST), base = new THREE.Color(color).multiplyScalar(0.9 + 0.2 * (0.5 + 0.5 * Math.sin(w * 91.3 + h * 17.7 + d * 43.1))); // (a tone of its own a plate)
  // rust creeping up from its foot, in blotches
  paint(geo, (x, y, z, c) => c.copy(base).lerp(rust, 0.5 * Math.max(0, 0.35 - (y + h / 2)) / 0.35 + 0.25 * Math.max(0, vnoise(x * 3 + z * 2, y * 3) - 0.7) / 0.3));
  return boxed(geo, w, h, d);
}

// ---------------------------------------------------------------- one system a hole
//
// Things many pieces of a hole have (bubbles in every lava, drips in every
// pool, steam off every spring) are one live system for the whole hole, not
// one each: the first piece that asks holds it (its root), the others only
// add to it. (key: the hole's build, its terrain.)
const systems = new WeakMap<object, Map<string, unknown>>();
/**
 * A material (or any disposable) made once for the whole game, by its key: kept
 * (materials.ts share: never disposed with a course), so a piece built on every
 * hole reuses it rather than leaving a new one behind each build.
 */
const ONCE = new Map<string, unknown>();
export function once<T extends { dispose(): void }>(key: string, make: () => T): T {
  let x = ONCE.get(key) as T | undefined;
  if (!x) ONCE.set(key, (x = share(make())));
  return x;
}
/** The dark down a drift, a slot, a pocket: the mines' void black, unlit (one material for all of them). */
export const darkMouth = () => once("dark mouth", () => new THREE.MeshBasicMaterial({ color: MINES.void }));
export function shared<S extends { root: THREE.Object3D }>(build: object, key: string, make: () => S): { sys: S; first: boolean } {
  let m = systems.get(build);
  if (!m) systems.set(build, (m = new Map<string, unknown>()));
  const had = m.get(key) as S | undefined;
  if (had) return { sys: had, first: false };
  const sys = make();
  m.set(key, sys);
  return { sys, first: true };
}

// ---------------------------------------------------------------- out of the camera's way
//
// Nothing of the mines may hide the ball from the player: a piece that can
// stand between the camera and a ball at rest fades out of that line (the
// town's canopies' way: materials.ts fadeable), one fade a hole (shared),
// the course calling it each frame (worlds.ts pieceFade). A still piece is
// laid in a bucket of its neighbours (a cell of the board, 32 units), the bucket merged
// and faded as one (two draws a bucket, not two a piece); a moving one fades
// on its own.
type Sight = { root: THREE.Group; items: { at: THREE.Vector3; r: number; set: FadeSet }[]; buckets: Map<string, { root: THREE.Group; set: FadeSet; baked: boolean }> };
type FadeSet = { own: Map<THREE.Material, THREE.Material>; ink: THREE.MeshBasicMaterial | null; mats: THREE.Material[] };
const newSet = (): FadeSet => ({ own: new Map(), ink: null, mats: [] });
function sightSystem(): Sight {
  const root = new THREE.Group(), sys: Sight = { root, items: [], buckets: new Map() };
  ud(root).live = true;
  const seg = new THREE.Line3(), near = new THREE.Vector3(), least = new Map<FadeSet, number>();
  ud(root).fade = (eye: THREE.Vector3, ball: THREE.Vector3) => {
    // (a still bucket merged once, before its first frame: its materials the ones faded)
    for (const b of sys.buckets.values()) if (!b.baked) {
      b.baked = true;
      bakeLocal(b.root);
      const ms = new Set<THREE.Material>();
      b.root.traverse((o) => void (o instanceof THREE.Mesh && ms.add(o.material as THREE.Material)));
      b.set.mats = [...ms];
    }
    seg.set(eye, ball);
    least.clear();
    for (const it of sys.items) {
      seg.closestPointToPoint(it.at, true, near);
      const d = near.distanceTo(it.at), o = d < it.r * 1.1 ? 0.1 : d < it.r * 1.8 ? 0.1 + ((d - it.r * 1.1) / (it.r * 0.7)) * 0.9 : 1; // (nearly gone: a ghost, not a pale blob by the ball)
      least.set(it.set, Math.min(least.get(it.set) ?? 1, o));
    }
    // (a piece faded out keeps its own colours; its ink goes at once, or the outline alone would stand there as a dark slab)
    for (const [set, o] of least) for (const m of set.mats) setFade(m, String(md(m).hook).startsWith("hull") ? (o < 0.99 ? 0 : 1) : o);
  };
  return sys;
}
/**
 * A piece that fades out of the camera's way (see above): r its radius round
 * at (its middle, world). A live piece (a machine, a fall) fades alone; a
 * still one goes in its cell's bucket, or its kind's for the whole hole (kind:
 * two draws for all of them; returned: add it where the piece would
 * have gone, the first time; null after). Returns the hole's fade root the
 * first time any piece is registered (add it to the course).
 */
export function sightFade(build: object, piece: THREE.Object3D, at: THREE.Vector3, r: number, alone = false, kind = ""): { root: THREE.Object3D | null; bucket: THREE.Object3D | null } {
  const { sys, first } = shared(build, "sight", sightSystem);
  let bucket: THREE.Object3D | null = null, set: FadeSet;
  if (alone) {
    set = newSet();
    set.mats = ownFade(piece, 0.03, set);
  } else {
    const key = kind || Math.floor(at.x / 32) + ":" + Math.floor(at.z / 32);
    let b = sys.buckets.get(key);
    if (!b) (sys.buckets.set(key, (b = { root: new THREE.Group(), set: newSet(), baked: false })), (bucket = b.root), ud(b.root).live = true);
    ownFade(piece, 0.03, b.set);
    ud(piece).live = false; // (merged with its bucket)
    b.root.add(piece);
    set = b.set;
  }
  sys.items.push({ at: at.clone(), r, set });
  return { root: first ? sys.root : null, bucket };
}

// ---------------------------------------------------------------- timber decks
//
// Every timber deck of the mines — a bridge, a ramp, a gantry's walkway —
// built one way: planks laid across two stringer beams with a hair of gap
// between them, each a little longer or shorter, grained, two nail heads at
// each end; a threshold beam across each end; trestles under it every few
// units down to its footing, cross-braced; a rail each side (a handrail on
// posts, a rope on posts, or a low kerb). Its walking surface is the plane
// through a and b (the physics' own): nothing of it stands above that plane
// but its rails, at its sides.

/** A timber deck's plan: its ends (their middles, at the deck's top), its width, and its dress. */
export interface Deck {
  a: THREE.Vector3;
  b: THREE.Vector3;
  width: number;
  /** its rails: a handrail on posts, a rope on posts, a low kerb, or none */
  rail?: "hand" | "rope" | "kerb" | "none";
  /** how far down its trestles go under a point along it (0 at a, 1 at b), or none */
  foot?: ((u: number) => number) | null;
  /** battens across its planks (a ramp's footholds) */
  cleats?: boolean;
  rand: Rand;
}
export function deck({ a, b, width, rail = "hand", foot = null, cleats = false, rand }: Deck) {
  const g = new THREE.Group(), L = a.distanceTo(b);
  if (L < 0.2) return g;
  // built along +x from a, then turned and tilted onto a→b
  const timber: THREE.BufferGeometry[] = [];
  // its boards across it, the mines' own (mines-kit planks: gaps, bevels, staggered joints, nails), their tops at 0
  g.add(planks([{ inside: (x, z) => x > 0 && x < L && Math.abs(z) < width / 2, top: () => 0, box: [0, -width / 2, L, width / 2], angle: Math.PI / 2 }], rand));
  // cleats: battens nailed across the planks, inside its width
  if (cleats) for (let x = 0.4; x < L - 0.3; x += 0.9) timber.push(new THREE.BoxGeometry(0.07, 0.05, width - 0.3).translate(x, 0.025, 0));
  // stringers under the planks' ends, thresholds across its ends
  // (their tops just under the planks' faces: what shows between two planks is timber at the deck's height, not a drop)
  // (shallow: a deck's end lies on the floor, its stringers under it not down into the floor)
  for (const sd of [-1, 1]) timber.push(new THREE.BoxGeometry(L, 0.08, 0.16).translate(L / 2, -0.06, sd * (width / 2 - 0.15)));
  // (thresholds: a lip over the boards' ends, their undersides over the floor a deck's end lies on, not into it)
  for (const x of [0.12, L - 0.12]) timber.push(new THREE.BoxGeometry(0.24, 0.07, width + 0.1).translate(x, 0, 0));
  // trestles down to the footing, braced crosswise
  if (foot) for (let x = Math.min(1.2, L / 2); x < L; x += 2.6) timber.push(...trestleParts(Math.max(0.4, foot(x / L)), width).map((q) => q.translate(x, -0.3, 0)));
  // its rails
  if (rail !== "none")
    for (const sd of [-1, 1]) {
      const z = sd * (width / 2 + 0.02);
      if (rail === "kerb") timber.push(new THREE.BoxGeometry(L, 0.18, 0.14).translate(L / 2, 0.09, z));
      else {
        const H = rail === "hand" ? 0.95 : 0.8, step = rail === "hand" ? 1.5 : 1.8;
        for (let x = 0.12; x <= L; x += step) timber.push(new THREE.BoxGeometry(0.12, H, 0.12).translate(x, H / 2 - 0.05, z));
        if (rail === "hand") timber.push(new THREE.BoxGeometry(L, 0.1, 0.1).translate(L / 2, H, z), new THREE.BoxGeometry(L, 0.07, 0.06).translate(L / 2, H * 0.5, z));
      }
    }
  g.add(timbers(timber));
  if (rail === "rope")
    for (const sd of [-1, 1])
      for (const h of [0.45, 0.78]) {
        const z = sd * (width / 2 + 0.02), p = new THREE.Vector3(0, h, z), q = new THREE.Vector3(L, h, z), m = p.clone().lerp(q, 0.5).setY(h - Math.min(0.25, L * 0.03));
        g.add(inked(paint(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, m, q), 10, 0.035, 4), (_x, _y, _z, c) => c.set(0xc9a86a)), relief(), INK_THIN));
      }
  // onto a→b: turned to its heading, tilted to its slope
  // (kept upright: its width level, whatever the slope)
  const d = b.clone().sub(a), flat = new THREE.Vector3(d.x, 0, d.z).normalize(), yaw = Math.atan2(-flat.z, flat.x), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  g.quaternion.setFromEuler(new THREE.Euler(0, yaw, pitch, "YZX"));
  g.position.copy(a);
  return g;
}

/** A trestle's timbers, its top at 0, its width along z: two legs down `drop`, a cap beam across, crossed braces where it is tall enough. */
function trestleParts(drop: number, width: number) {
  const out: THREE.BufferGeometry[] = [];
  for (const sd of [-1, 1]) out.push(new THREE.BoxGeometry(0.16, drop, 0.16).translate(0, -drop / 2, sd * (width / 2 - 0.15)));
  out.push(new THREE.BoxGeometry(0.12, 0.12, width - 0.2).translate(0, -0.15, 0));
  if (drop > 1) for (const sg of [1, -1]) out.push(new THREE.BoxGeometry(0.1, Math.hypot(drop - 0.6, width - 0.3), 0.1).rotateX(sg * Math.atan2(width - 0.3, drop - 0.6)).translate(0, -drop / 2, 0));
  return out;
}
/** Timbers merged as one inked piece of the mines' dark timber (vertex coloured over the relief material). */
function timbers(parts: THREE.BufferGeometry[]) {
  // (each timber a tone of its own, darker toward its foot)
  const geo = mergeGeometries(parts.map((q, i) => { const tone = 0.88 + 0.24 * (0.5 + 0.5 * Math.sin(i * 12.9898 + 4.1)); return paint(q.toNonIndexed(), (_x, y, _z, c) => c.set(TIMBER_DARK).multiplyScalar(tone * (0.8 + 0.2 * Math.min(1, Math.max(0, y + 1))))); }));
  geo.computeVertexNormals();
  return inked(geo, relief(), INK_THIN);
}
/**
 * A braced trestle under a deck or a gantry (what deck() stands on): its top's
 * middle at `top`, its two legs down to footY, `width` across its heading
 * (radians: the way its width runs, 0 along z), its cap beam and crossed braces.
 */
export function trestle(top: THREE.Vector3, footY: number, width: number, heading = 0) {
  const g = timbers(trestleParts(Math.max(0.4, top.y - footY), width));
  g.position.copy(top);
  g.rotation.y = heading;
  return g;
}

