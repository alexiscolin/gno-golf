// The Crystal Mines' set dressing (mines.ts's decor places it): what stands
// round the lane, in the mines' toon (mines-toon.ts: rock in strata, timber,
// iron, rivets, the ink): crystal outcrops growing out of their rock,
// stalagmites, rock pillars, timber scaffolding, rails with their carts heaped
// with glowing ore, ore piles, barrels and crates, cave mushrooms, a winch, a
// headframe; and what lives: miners at the rock, carts on a loop, bats, drips
// into pools. Each builder's foot is at 0; its triangles counted (the cave's
// budget): low-poly, inked, and merged by the hole's bake unless it moves.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flat, share, relief, uTime, geoOf } from "./materials";
import { waterMaterial } from "./mines-water";
import { animate } from "./state";
import { bakeLocal, instances } from "./bake";
import { gnomelet } from "./props";
import { ud } from "./data";
import type { Rand } from "./common";
import { MINES, crystalCluster, crystalMat, shard, HUES, planks, cartMouth } from "./mines-kit";
import { crustBy, FALLING } from "./mines-lava";
import { boulder, knobbly, paint, strata, facets, inked, gem, form, type Form, INK_THIN, TIMBER, TIMBER_DARK, TIMBER_LIGHT, IRON, IRON_DARK, RUST } from "./mines-toon";

// ------------------------------------------------------------ rock

/** A crystal outcrop: a cluster of crystals growing out of a rock, about
 *  `size` tall; its glow's height (top) for the caller's light. */
export function outcrop(rand: Rand, size: number, hue: number = HUES[Math.floor(rand() * HUES.length)]) {
  const g = new THREE.Group();
  const rock = boulder(rand, size * 0.62, size * 0.3, size * 0.55, size > 2.2 ? 1 : 0);
  rock.position.y = size * 0.1;
  const cl = crystalCluster(rand, size, hue, size > 1.6 ? 5 : size > 1 ? 4 : 3);
  cl.position.set((rand() - 0.5) * size * 0.2, size * 0.3, (rand() - 0.5) * size * 0.2);
  g.add(rock, cl);
  return { g, hue, top: size * 1.05 };
}

/** A knobbly cone of rock, r at its foot and h tall, in strata: a
 *  stalagmite (up) or a stalactite (down: pass the ceiling's height). */
function spike(rand: Rand, r: number, h: number, down = false) {
  const geo = knobbly(new THREE.ConeGeometry(r, h, 7, 4).translate(0, h / 2, 0), rand, r * 0.22, 2.2 / Math.max(r, 0.4), true);
  const seed = rand() * 9;
  paint(geo, (x, y, z, c) => strata(y, x, z, h, c, seed));
  if (down) geo.rotateX(Math.PI);
  return facets(geo, relief());
}

/** Stalagmites: two to four rising from one foot, the tallest h. */
export function stalagmites(rand: Rand, h: number) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const hh = k ? h * (0.3 + rand() * 0.45) : h, r = hh * (0.2 + rand() * 0.06), a = rand() * 6, d = k ? r * 1.4 + rand() * 0.3 : 0;
    const s = spike(rand, r, hh);
    s.position.set(Math.cos(a) * d, -0.05, Math.sin(a) * d);
    g.add(s);
  }
  return g;
}

/** A rock pillar: a column of rock in strata, flared at its foot, rising
 *  into the dark: from `sink` (local height) down it goes into the dark of a
 *  chasm, from `fade` up into the vault's (its top then unseen, none drawn). */
export function pillar(rand: Rand, h: number, r: number, sink = 0, fade = 0) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r * 0.75, r * 1.25, h, 9, 6, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h + 0.5, flare = 1 + 0.5 * Math.max(0, 0.18 - y) / 0.18 + 0.25 * Math.max(0, y - 0.85) / 0.15;
    p.setX(i, p.getX(i) * flare);
    p.setZ(i, p.getZ(i) * flare);
  }
  geo.translate(0, h / 2, 0);
  const body = knobbly(geo, rand, r * 0.2, 1.1 / r, true), seed = rand() * 9;
  paint(body, (x, y, z, c) => {
    strata(y, x, z, fade ? h * 2 : h, c, seed);
    if (sink) c.lerp(DARK, 1 - Math.min(1, Math.max(0, y / sink)) ** 1.5);
    if (fade) c.lerp(VAULT, Math.min(1, Math.max(0, (y - fade) / (h - fade))));
  });
  g.add(facets(body, relief()));
  // its broken top: a knob of rock
  if (!fade) {
    const top = boulder(rand, r * 0.95, r * 0.5, r * 0.95, 0, h);
    top.position.y = h;
    g.add(top);
  }
  return g;
}

const DARK = new THREE.Color(MINES.void), VAULT = new THREE.Color(MINES.vault);

// ------------------------------------------------------------ timber and iron

let boards = 0; // (the boards built so far in a hole: each its own tone, the same from one build of it to the next)
/** A hole's build begins: its boards counted from the first again. */
export const newHoleBoards = () => void (boards = 0);
/** Any piece of timber in the shared relief toon: its own tone, darker toward
 *  its ends along its longest side (painted on its vertices: it bakes with the rest). */
export const wood = (geo: THREE.BufferGeometry, color: number) => {
  geo.computeBoundingBox();
  const b = geo.boundingBox!, d = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z], ax = d.indexOf(Math.max(...d)), mid = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
  const tone = 0.85 + 0.27 * (((Math.sin(++boards * 12.9898) * 43758.5453) % 1 + 1) % 1);
  return paint(geo, (x, y, z, c) => c.set(color).multiplyScalar(tone * (0.84 + 0.16 * Math.cos((([x, y, z][ax] - mid[ax]) / (d[ax] || 1)) * Math.PI))));
};
// a sawn board or post: a box with its grain darker toward the ends, inked thin
export const board = (w: number, h: number, d: number, color: number = TIMBER) => {
  const L = Math.max(w, h, d), ax = w === L ? 0 : h === L ? 1 : 2;
  // (its ends chamfered, not sawn square: three segments along it, the end rings drawn in)
  const geo = new THREE.BoxGeometry(w, h, d, ax === 0 ? 3 : 1, ax === 1 ? 3 : 1, ax === 2 ? 3 : 1), p = geo.attributes.position;
  const dims = [w, h, d], cut = Math.min(0.05, 0.3 * Math.min(...dims.filter((_, i) => i !== ax)), L * 0.2);
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)], along = v[ax];
    if (Math.abs(Math.abs(along) - L / 6) < 1e-5) v[ax] = Math.sign(along) * (L / 2 - cut); // (the inner rings out to the chamfer)
    else if (Math.abs(Math.abs(along) - L / 2) < 1e-5) for (let k = 0; k < 3; k++) if (k !== ax) v[k] -= Math.sign(v[k]) * cut;
    p.setXYZ(i, v[0], v[1], v[2]);
  }
  geo.computeVertexNormals();
  // (each board its own tone, a split of it a shade apart across its width: the grain runs with it)
  const tone = 0.85 + 0.27 * (((Math.sin(++boards * 12.9898) * 43758.5453) % 1 + 1) % 1), across = ax === 0 ? 2 : 0;
  paint(geo, (x, y, z, c) => c.set(color).multiplyScalar(tone * (0.84 + 0.16 * Math.cos(([x, y, z][ax] / L) * Math.PI)) * ([x, y, z][across] > 0 ? 1 : 0.93)));
  return inked(geo, relief(), INK_THIN);
};

/** A ladder h high (its foot at 0): two square rails 0.1 thick, inked as the
 *  timber is, and round rungs set between them every 0.4 (their ends in the
 *  rails: the rails' ink outlines them). */
export function ladder(h: number, w = 0.6, color: number = TIMBER_LIGHT) {
  const rails = mergeGeometries([-w / 2, w / 2].map((x) => new THREE.BoxGeometry(0.1, h, 0.1).translate(x, h / 2, 0).toNonIndexed()));
  const rungs: THREE.BufferGeometry[] = [];
  for (let y = 0.3; y < h - 0.15; y += 0.4) rungs.push(new THREE.CylinderGeometry(0.035, 0.035, w - 0.1, 5, 1, true).rotateZ(Math.PI / 2).translate(0, y, 0).toNonIndexed());
  const rung = mergeGeometries(rungs);
  paint(rails, (_x, _y, _z, c) => c.set(color).multiplyScalar(0.8));
  paint(rung, (_x, y, _z, c) => c.set(color).multiplyScalar(0.95 + 0.05 * Math.sin(y * 9)));
  const g = new THREE.Group();
  g.add(inked(rails, relief(), INK_THIN), new THREE.Mesh(rung, relief()));
  return g;
}
const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => (o.position.set(x, y, z), o.rotation.set(rx, ry, rz), o);

/** Timber scaffolding against the rock: four posts, two decks, cross braces
 *  and a ladder, a lantern on its top deck (lit: its point, for the caller). */
function scaffold(rand: Rand) {
  const g = new THREE.Group(), W = 2.4, D = 1.5, H = 1.7 + rand() * 0.5;
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(at(board(0.18, H * 2 + 0.3, 0.18, TIMBER_DARK), x, H + 0.15, z));
  // its two decks: the kit's boards, and a toe rail along the back of each
  g.add(planks([H, H * 2].map((y) => ({ inside: (x: number, z: number) => Math.abs(x) < (W + 0.3) / 2 && Math.abs(z) < D / 2, top: () => y + 0.04, box: [-(W + 0.3) / 2, -D / 2, (W + 0.3) / 2, D / 2] as const, angle: 0 })), rand, { width: 0.26, gap: 0.03, thick: 0.08 }));
  for (const y of [H, H * 2]) g.add(at(board(W + 0.2, 0.1, 0.08, TIMBER_DARK), 0, y + 0.35, -D / 2 - 0.02));
  const br = Math.hypot(W, H);
  for (const z of [-D / 2 - 0.1, D / 2 + 0.1]) g.add(at(board(br, 0.1, 0.06, TIMBER_DARK), 0, H / 2, z, 0, 0, Math.atan2(H, W)));
  // the ladder up its side
  g.add(at(ladder(H * 2.1), W / 2 + 0.35 - Math.sin(0.18) * H * 1.05, 0, 0.1, 0, 0, -0.18));
  const lamp = new THREE.Vector3(-W / 2 + 0.3, H * 2 + 0.3, D / 2);
  return { g, lamp };
}

/** A stack of pit props (logs), chocked. */
export function logPile(rand: Rand) {
  const g = new THREE.Group(), L = 2.2 + rand() * 0.8;
  const ends = flat(TIMBER_LIGHT);
  for (const [x, y] of [[-0.44, 0.2], [0, 0.2], [0.44, 0.2], [-0.22, 0.58], [0.22, 0.58], [0, 0.96]]) {
    const geo = new THREE.CylinderGeometry(0.2, 0.2, L, 8, 1, true).rotateX(Math.PI / 2);
    paint(geo, (px, py, pz, c) => c.set(TIMBER).multiplyScalar(0.75 + 0.25 * Math.sin(Math.atan2(py, px) * 4 + pz)));
    g.add(at(inked(geo, relief(), INK_THIN), x, y, 0));
    for (const z of [-L / 2, L / 2]) g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.19, 8), ends), x, y, z, 0, z > 0 ? 0 : Math.PI));
  }
  for (const x of [-0.8, 0.8]) g.add(at(board(0.12, 0.5, 0.18, TIMBER_DARK), x, 0.25, L / 2 - 0.3));
  return g;
}

/** Rails: two iron rails on sleepers, len long along +x, centred. */
export function rails(len: number) {
  const g = new THREE.Group();
  const iron = flat(IRON_DARK);
  for (const z of [-0.5, 0.5]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.09), iron);
    r.position.set(0, 0.13, z);
    g.add(r);
  }
  for (let x = -len / 2 + 0.35; x < len / 2; x += 0.75) g.add(at(board(0.28, 0.1, 1.45, TIMBER_DARK), x, 0.04, 0));
  return g;
}

/** An ore cart's width across its track (its tub's, scale 1). */
const CART_W = 0.95;
/** An ore cart: an iron tub tapering to its floor, rims riveted, four
 *  wheels on the rails; heaped (glow) with ore and glowing crystal. */
export function oreCart(rand: Rand, heaped = true) {
  const g = new THREE.Group();
  const tub = new THREE.CylinderGeometry(0.95, 0.72, 0.75, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, 0.7).translate(0, 0.72, 0);
  const rust = new THREE.Color(RUST), iron = new THREE.Color(IRON);
  paint(tub, (x, y, _z, c) => c.copy(iron).lerp(rust, 0.45 * Math.max(0, (y - 0.9) / 0.2) + 0.2 * Math.max(0, 0.55 - y) * (0.5 + 0.5 * Math.sin(x * 7)))); // rust at the rim and the foot
  // (every part in its vertices' colours over the relief material and the thin
  // ink: a cart that moves is three draws, not six)
  g.add(inked(tub, relief(), INK_THIN));
  const rim = new THREE.Mesh(paint(new THREE.TorusGeometry(1, 0.05, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4).scale(1.1, 1, 0.7), (_x, _y, _z, c) => c.set(IRON_DARK)), relief());
  rim.position.y = 1.1;
  g.add(rim);
  const wheel = paint(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10).rotateX(Math.PI / 2), (_x, _y, _z, c) => c.set(IRON_DARK));
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) g.add(at(inked(wheel.clone(), relief(), INK_THIN), x, 0.23, z));
  if (heaped) {
    // the heap: ore lumps, crystals poking out of it
    const heap = knobbly(new THREE.SphereGeometry(0.75, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), rand, 0.1, 3);
    heap.scale(1.15, 0.5, 0.7).translate(0, 1.02, 0);
    paint(heap, (x, _y, z, c) => c.set(0x5a4a5c).lerp(new THREE.Color(0x8a6a4a), 0.5 + 0.5 * Math.sin(x * 6 + z * 5)));
    g.add(facets(heap, relief(), INK_THIN));
    const hue = HUES[Math.floor(rand() * HUES.length)];
    for (let k = 0; k < 4; k++) {
      const s = inked(shard(0.1 + rand() * 0.06, 0.35 + rand() * 0.25, hue), crystalMat(), INK_THIN);
      at(s, (rand() - 0.5) * 1.1, 1.1, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.9, rand() * 6, (rand() - 0.5) * 0.9);
      g.add(s);
    }
    return { g, hue, glow: new THREE.Vector3(0, 1.5, 0) };
  }
  return { g, hue: 0, glow: null };
}

/** An ore pile: a heap of broken ore, a shovel stuck in it, a glint of
 *  crystal here and there. */
export function orePile(rand: Rand, r = 1) {
  const g = new THREE.Group();
  const heap = knobbly(new THREE.SphereGeometry(r, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2), rand, r * 0.1, 2.4 / r);
  heap.scale(1, 0.55, 1);
  const a = new THREE.Color(0x6b5244), b = new THREE.Color(0x4a3e58), o = new THREE.Color(0xb07a3c);
  paint(heap, (x, y, z, c) => c.copy(a).lerp(b, 0.5 + 0.5 * Math.sin(x * 3.1 + z * 2.3)).lerp(o, Math.max(0, Math.sin(x * 9 + y * 7 + z * 8) - 0.7) * 2));
  g.add(facets(heap, relief(), INK_THIN));
  const hue = HUES[Math.floor(rand() * HUES.length)];
  for (let k = 0; k < 2; k++) {
    const t = rand() * 6, d = r * (0.3 + rand() * 0.4);
    g.add(at(inked(shard(0.08, 0.3, hue), crystalMat(), INK_THIN), Math.cos(t) * d, r * 0.4, Math.sin(t) * d, 0.4, t, 0.3));
  }
  // a shovel stuck in its side
  const sh = new THREE.Group();
  sh.add(at(board(0.06, 1.1, 0.06, TIMBER_LIGHT), 0, 0.55, 0), at(inked(new THREE.BoxGeometry(0.3, 0.36, 0.04), flat(IRON)), 0, -0.1, 0));
  g.add(at(sh, r * 0.5, r * 0.45, 0.1, 0.1, 0.4, -0.5));
  return g;
}

/** A barrel: staves bulging, two iron hoops. */
export function barrel(rand: Rand) {
  const g = new THREE.Group();
  // staves bulging at the middle: a cylinder of eight, its middle ring pushed out
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8, 2).translate(0, 0.4, 0);
  const bp = geo.attributes.position;
  for (let i = 0; i < bp.count; i++) if (Math.abs(bp.getY(i) - 0.4) < 0.01 && Math.hypot(bp.getX(i), bp.getZ(i)) > 0.1) (bp.setX(i, bp.getX(i) * 1.22), bp.setZ(i, bp.getZ(i) * 1.22));
  const tone = rand() < 0.5 ? TIMBER : TIMBER_DARK;
  paint(geo, (x, _y, z, c) => c.set(tone).multiplyScalar(0.82 + 0.18 * (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 10) % 2)));
  g.add(inked(geo, relief(), INK_THIN));
  for (const y of [0.18, 0.62]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 8, 1, true), flat(IRON_DARK)), 0, y, 0));
  return g;
}

/** A crate of planks; a dynamite crate (red, its sticks on top) now and then. */
export function crate(rand: Rand) {
  const g = new THREE.Group(), s = 0.6 + rand() * 0.2, tnt = rand() < 0.3;
  const geo = new THREE.BoxGeometry(s, s * 0.8, s * 0.9).translate(0, s * 0.4, 0);
  const base = new THREE.Color(tnt ? 0xa8392e : TIMBER_LIGHT);
  paint(geo, (_x, y, _z, c) => c.copy(base).multiplyScalar(Math.floor((y / (s * 0.8)) * 3) % 2 ? 0.88 : 1));
  g.add(inked(geo, relief(), INK_THIN));
  for (const y of [0.05, s * 0.75]) g.add(at(board(s + 0.04, 0.06, s * 0.94, TIMBER_DARK), 0, y, 0));
  if (tnt)
    for (let k = 0; k < 3; k++) g.add(at(inked(new THREE.CylinderGeometry(0.06, 0.06, s * 0.8, 6).rotateZ(Math.PI / 2), flat(0xd8453a), INK_THIN), 0, s * 0.8 + 0.07, -0.13 + k * 0.13));
  return g;
}

/** Cave mushrooms glowing: pale stems, caps lit from within (the crystals'
 *  material, one draw with them). */
export function mushrooms(rand: Rand) {
  const g = new THREE.Group(), hue = rand() < 0.6 ? 0x6ff0c8 : 0xb89cff, stem = flat(0xe8dcc8);
  const n = 3 + Math.floor(rand() * 4);
  for (let k = 0; k < n; k++) {
    const h = 0.25 + rand() * 0.45, r = h * (0.5 + rand() * 0.3), a = rand() * 6, d = k ? 0.2 + rand() * 0.4 : 0;
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.28, h, 6), stem), Math.cos(a) * d, h / 2, Math.sin(a) * d, (rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3));
    const cap = new THREE.SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1);
    paint(cap, (_x, y, _z, c) => c.set(hue).lerp(new THREE.Color(0xffffff), Math.max(0, y / (r * 0.55)) * 0.35));
    g.add(at(inked(cap, crystalMat(), INK_THIN), Math.cos(a) * d, h, Math.sin(a) * d));
  }
  return { g, hue };
}


/**
 * A headframe on the cave's skyline: four legs leaning in to a head deck,
 * braced, its sheave wheel turning slowly and the cable running down; a
 * landmark far back. Its wheel is live (it turns); the rest merges.
 */
export function headframe(h: number) {
  const g = new THREE.Group(), W = h * 0.28;
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const leg = board(0.4, h * 1.02, 0.4, TIMBER_DARK);
    at(leg, (x * W) / 2, h / 2, (z * W) / 2, z * -0.1, 0, x * 0.1);
    g.add(leg);
  }
  for (let y = h * 0.22; y < h * 0.9; y += h * 0.22) {
    const w = W * (1 - (0.2 * y) / h);
    for (const z of [-1, 1]) g.add(at(board(w + 0.3, 0.26, 0.26), 0, y, (z * w) / 2));
    for (const x of [-1, 1]) g.add(at(board(0.26, 0.26, w + 0.3), (x * w) / 2, y, 0));
    g.add(at(board(Math.hypot(w, h * 0.22) + 0.2, 0.16, 0.16, TIMBER_LIGHT), 0, y - h * 0.11, w / 2 + 0.05, 0, 0, Math.atan2(h * 0.22, w)));
  }
  g.add(at(board(W * 1.1, 0.35, W * 0.9, TIMBER), 0, h, 0));
  // the sheave: a spoked iron wheel, turning
  const wheel = new THREE.Group(), R = W * 0.42;
  wheel.add(inked(new THREE.TorusGeometry(R, 0.13, 6, 24), flat(IRON), INK_THIN));
  for (let k = 0; k < 6; k++) wheel.add(at(new THREE.Mesh(new THREE.BoxGeometry(R * 2, 0.09, 0.09), flat(IRON_DARK)), 0, 0, 0, 0, 0, (k * Math.PI) / 6));
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10).rotateX(Math.PI / 2), flat(RUST)));
  bakeLocal(wheel);
  (ud(wheel).live = true), (wheel.name ||= "mines:headframe");
  wheel.position.set(0, h + R + 0.2, 0);
  g.add(wheel);
  animate((t) => (wheel.rotation.z = -t * 0.6));
  // the rope: down its front into the shaft (a dark mouth in a timber collar
  // at its foot), and off its back down to the winding house's drum
  const ropeC = flat(0x2a2733), top = h + R + 0.2;
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, top + 0.3, 4), ropeC), R, (top - 0.3) / 2, 0));
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), ADIT_DARK), R, 0.04, 0));
  for (const s0 of [-1, 1]) g.add(at(board(1.7, 0.22, 0.2, TIMBER_DARK), R, 0.11, s0 * 0.75), at(board(0.2, 0.22, 1.3, TIMBER_DARK), R + s0 * 0.75, 0.11, 0));
  const hx = -(W / 2 + 3.2), drum = new THREE.Vector3(hx + 0.9, 1.3, 0), from = new THREE.Vector3(-R, top, 0), d = drum.clone().sub(from);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, d.length(), 4), ropeC);
  back.position.copy(from).addScaledVector(d, 0.5);
  back.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(back);
  // the winding house: a timber shed, its roof pitched, the drum at its open front
  g.add(at(board(2.2, 1.9, 2.0, TIMBER_DARK), hx, 0.95, 0));
  g.add(at(inked(new THREE.ConeGeometry(1.75, 0.9, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.9), flat(RUST), INK_THIN), hx, 2.35, 0));
  g.add(at(inked(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10).rotateX(Math.PI / 2), flat(IRON), INK_THIN), hx + 1.3, 1.3, 0));
  return g;
}

// a ripple spreading on still water (each its own clone: its opacity fades)

// ------------------------------------------------------------ life

/** A miner: a gnome in a hard hat with its lamp. */
function minerBody(rand: Rand) {
  const g = gnomelet(rand);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xf2c14e));
  hat.position.y = 0.6;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12), flat(0xf2c14e));
  brim.position.y = 0.6;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8).rotateX(Math.PI / 2), flat(0xfff3b0));
  lamp.position.set(0, 0.68, 0.17);
  g.children = g.children.slice(0, 2); // (no pointed hat under the hard one)
  g.add(hat, brim, lamp);
  return g;
}
/** The background's people and their things, a size up from the gnomelet. */
const MAN = 1.45;
/** A pick, its pivot at the grip. */
function pickTool() {
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(wood(new THREE.BoxGeometry(0.05, 0.62, 0.05), TIMBER_LIGHT), relief()), 0, 0.28, 0));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.5, 5).rotateZ(Math.PI / 2), flat(IRON));
  head.position.set(0.08, 0.58, 0);
  g.add(head);
  return g;
}

/**
 * Miners at the rock: gnomes in hard hats swinging picks at a face, each on
 * its own beat, a spray of sparks where the pick bites. All of them one
 * instanced set (and their picks another): a few draws for the lot.
 */
export function miners(rand: Rand, spots: readonly { x: number; y: number; z: number; face: number }[], sparking = true) {
  const g = new THREE.Group();
  if (!spots.length) return g;
  // (the men stand where they work: baked with the rest; their picks swing, one instanced set)
  const n = spots.length, picks = instances(pickTool(), n);
  for (const s of spots) {
    const b = minerBody(rand);
    b.position.set(s.x, s.y, s.z);
    b.rotation.y = s.face;
    b.scale.setScalar(MAN);
    g.add(b);
  }
  g.add(picks.group);
  // (the sparks off their picks: a draw of their own, left out where a hole counts its draws)
  const sp = new Float32Array(n * 6 * 3), sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp, 3)), SPARK);
  sparks.frustumCulled = false;
  (ud(sparks).live = true), (sparks.name ||= "mines:miners");
  if (sparking) g.add(sparks);
  // (a size up: the background's people read from the Far view)
  const e = new THREE.Euler(), q = new THREE.Vector3(), m = new THREE.Matrix4(), off = new THREE.Vector3(), S = new THREE.Vector3().setScalar(MAN);
  const beat = spots.map(() => 0.8 + rand() * 0.5), ph = spots.map(() => rand() * 6);
  const draw = (t: number) => {
    spots.forEach((s, i) => {
      // the swing: back, then down fast to the face
      const u = (t * beat[i] + ph[i]) % 1, sw = u < 0.7 ? -1.9 * Math.sin((u / 0.7) * Math.PI * 0.5) : -1.9 + 3.1 * ((u - 0.7) / 0.3) ** 2;
      m.makeRotationY(s.face);
      off.set(0.18, 0.4, 0.08).multiplyScalar(MAN).applyMatrix4(m);
      e.set(sw, s.face, 0, "YXZ");
      picks.set(i, q.set(s.x, s.y, s.z).add(off), e, S);
      // sparks for a moment after the bite
      const hit = u > 0.97 || u < 0.12, k = u < 0.12 ? u / 0.12 : 0;
      const fx = s.x + Math.sin(s.face) * 0.7 * MAN, fz = s.z + Math.cos(s.face) * 0.7 * MAN;
      for (let j = 0; j < 6; j++) {
        const a = j * 1.05 + i, o = (i * 6 + j) * 3;
        sp[o] = hit ? fx + Math.cos(a) * k * 0.5 : 0;
        sp[o + 1] = hit ? s.y + 0.3 + k * 0.4 - k * k * 0.5 : -99;
        sp[o + 2] = hit ? fz + Math.sin(a) * k * 0.5 : 0;
      }
    });
    picks.done();
    sparks.geometry.attributes.position.needsUpdate = true;
  };
  draw(0);
  animate(draw);
  return g;
}
const SPARK = share(new THREE.PointsMaterial({ color: 0xffd27a, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));

/**
 * Carts on a loop of track behind the board: the rails laid along the
 * loop's curve, and two or three carts heaped with ore going round,
 * instanced, each pushed by a miner (crew; none far down a pit, where he is
 * a speck and two draws). path: the loop (closed), on the floor.
 */
export function cartLoop(rand: Rand, path: THREE.CatmullRomCurve3, n: number, crew = true) {
  const g = new THREE.Group(), L = path.getLength(), N = Math.round(L / 0.75);
  g.name = "mines:cartLoop";
  const sleepers: THREE.BufferGeometry[] = [], railsG: THREE.BufferGeometry[] = [];
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const u = k / N;
    path.getPointAt(u, p);
    path.getTangentAt(u, tan);
    const a = Math.atan2(tan.x, tan.z);
    sleepers.push(wood(new THREE.BoxGeometry(1.75, 0.1, 0.3).rotateY(a).translate(p.x, p.y + 0.04, p.z), TIMBER_DARK));
  }
  // the rails: two iron strips following the loop (a quad each step, not a box)
  const rp: number[] = [];
  for (const s of [-0.62, 0.62])
    for (let k = 0; k < N; k++) {
      const q = [k / N, (k + 1) / N].map((u) => {
        path.getPointAt(u, p);
        path.getTangentAt(u, tan);
        side.set(tan.z, 0, -tan.x).normalize();
        return [p.clone().addScaledVector(side, s - 0.05), p.clone().addScaledVector(side, s + 0.05)];
      });
      for (const v of [q[0][0], q[1][0], q[1][1], q[0][0], q[1][1], q[0][1]]) rp.push(v.x, v.y + 0.16, v.z);
    }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
  rg.computeVertexNormals();
  railsG.push(rg);
  const merged = (list: THREE.BufferGeometry[]) => {
    const out = new THREE.BufferGeometry(), pos: number[] = [], nor: number[] = [];
    for (const q of list) {
      const b = q.index ? q.toNonIndexed() : q;
      pos.push(...(b.attributes.position.array as Float32Array));
      nor.push(...(b.attributes.normal.array as Float32Array));
    }
    out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    return out;
  };
  g.add(new THREE.Mesh(merged(sleepers), relief()), new THREE.Mesh(merged(railsG), flat(IRON_DARK)));
  // each cart pushed by a miner leaning into it
  const cart = oreCart(rand, true), set = instances(cart.g, n), men = crew ? instances(minerBody(rand), n) : null, e = new THREE.Euler(), cp = new THREE.Vector3();
  const CART = new THREE.Vector3().setScalar(1.25), MEN = new THREE.Vector3().setScalar(MAN);
  g.add(set.group);
  if (men) g.add(men.group);
  const draw = (t: number) => {
    for (let k = 0; k < n; k++) {
      const u = (t * (1.2 / L) + k / n) % 1, back = (u - 1.7 / L + 1) % 1;
      path.getPointAt(u, cp);
      path.getTangentAt(u, tan);
      e.set(0, Math.atan2(tan.x, tan.z) + Math.PI / 2, Math.sin(t * 7 + k) * 0.015);
      set.set(k, cp, e, CART);
      if (!men) continue;
      path.getPointAt(back, cp);
      path.getTangentAt(back, tan);
      e.set(0.25, Math.atan2(tan.x, tan.z), 0, "YXZ");
      men.set(k, cp.setY(cp.y + Math.abs(Math.sin(t * 6 + k)) * 0.04), e, MEN);
    }
    set.done();
    men?.done();
  };
  draw(0);
  animate(draw);
  return { g, hue: cart.hue };
}

/** Bats: a flock wheeling high in the dark, wings beating; one instanced
 *  set for the bodies and one for each wing. */
export function bats(rand: Rand, cx: number, cy: number, cz: number, R: number, n = 7, size = 1) {
  // (a dusky violet, inked: a silhouette against the lit rock, not a black speck)
  const g = new THREE.Group(), dark = flat(0x8a78b0);
  g.name = "mines:bats";
  const body = new THREE.Group();
  body.add(inked(new THREE.SphereGeometry(0.16, 6, 4).scale(1, 0.8, 1.4), dark, INK_THIN));
  for (const s of [-1, 1]) body.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), dark), s * 0.08, 0.14, 0.1));
  const wing = new THREE.Group(), shape = new THREE.Shape();
  // (a bat's wing: its fingers' points along the trailing edge)
  shape.moveTo(0, 0.04); shape.lineTo(0.3, 0.16); shape.lineTo(0.62, 0.2); shape.lineTo(0.7, -0.02); shape.lineTo(0.52, -0.1); shape.lineTo(0.44, -0.2); shape.lineTo(0.3, -0.1); shape.lineTo(0.18, -0.2); shape.lineTo(0.06, -0.1); shape.lineTo(0, -0.08);
  wing.add(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }).rotateX(-Math.PI / 2), dark)); // (its body inked: a draw less a wing)
  // (both wings one set: the right one the left mirrored, one draw and one geometry)
  const B = instances(body, n), Wg = instances(wing, 2 * n);
  g.add(B.group, Wg.group);
  const ph = Array.from({ length: n }, () => rand() * 6), rr = Array.from({ length: n }, () => R * (0.6 + rand() * 0.5));
  const p = new THREE.Vector3(), e = new THREE.Euler(), w = new THREE.Vector3(), one = new THREE.Vector3(size, size, size), flip = new THREE.Vector3(-size, size, size);
  const draw = (t: number) => {
    for (let k = 0; k < n; k++) {
      const a = t * 0.35 + ph[k], y = cy + Math.sin(t * 0.8 + ph[k]) * 1.2;
      p.set(cx + Math.cos(a) * rr[k], y, cz + Math.sin(a) * rr[k] * 0.6);
      const yaw = -a + Math.PI;
      e.set(0, yaw, 0);
      B.set(k, p, e, one);
      const flap = Math.sin(t * 14 + ph[k]) * 0.8;
      for (const s of [1, -1]) Wg.set(s > 0 ? k : n + k, w.copy(p), e.set(0, yaw, s * flap, "YXZ"), s > 0 ? one : flip);
    }
    B.done();
    Wg.done();
  };
  draw(0);
  animate(draw);
  return g;
}


// ------------------------------------------------------------ set pieces
//
// Each hole's own "wow" far back and its small surprises (mines.ts picks
// them by the hole's biome): each foot at 0, facing +z (the board), live
// parts marked and animated on the scene's clock.

/** A figure: a miner as the background's gnomes are (props.ts gnomelet,
 *  a hard hat and its lamp), standing, or sitting (legs out, lower). */
export function figure(rand: Rand, sit = false) {
  const g = minerBody(rand);
  if (sit) {
    g.children[0].scale.y = 0.6;
    for (const o of g.children.slice(1)) o.position.y -= 0.16;
    for (const s of [-0.09, 0.09]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6).rotateX(Math.PI / 2), flat(0x3d4a6e)), s, 0.08, 0.18));
  }
  return g;
}

/** A canary in its brass cage on a post by a lamp, hopping from perch to floor. */
export function canary() {
  const g = new THREE.Group(), brass = flat(MINES.brass);
  g.add(at(board(0.12, 1.9, 0.12, TIMBER_DARK), 0, 0.95, 0), at(board(0.5, 0.08, 0.08, TIMBER_DARK), 0.2, 1.9, 0));
  const cage = new THREE.Group();
  for (const y of [0, 0.5]) cage.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.015, 4, 12), brass), 0, y, 0, Math.PI / 2));
  for (let k = 0; k < 8; k++) cage.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 3), brass), Math.cos((k / 8) * 6.28) * 0.2, 0.25, Math.sin((k / 8) * 6.28) * 0.2));
  cage.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), brass), 0, 0.5, 0));
  cage.add(at(new THREE.Mesh(wood(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 12), TIMBER), relief()), 0, 0, 0));
  cage.position.set(0.4, 1.2, 0);
  g.add(cage);
  const bird = new THREE.Group();
  bird.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6).scale(1, 0.9, 1.3), flat(0xffd23a)));
  bird.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), flat(0xffd23a)), 0, 0.07, 0.07));
  bird.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4).rotateX(Math.PI / 2), flat(0xf08a2c)), 0, 0.07, 0.13));
  bird.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4).rotateX(-Math.PI / 2 - 0.5), flat(0xd8a820)), 0, 0.02, -0.1));
  bakeLocal(bird);
  (ud(bird).live = true), (bird.name ||= "mines:canary");
  g.add(bird);
  animate((t) => {
    // (a hop from one perch to the other and back: eased, an arc, never a snap)
    const u = t % 3, e = (x: number) => { const v = Math.min(1, Math.max(0, x)); return v * v * (3 - 2 * v); };
    const k = e((u - 1.35) / 0.3) * (1 - e((u - 2.7) / 0.3)), arc = Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 1.35) / 0.3))) + Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 2.7) / 0.3)));
    bird.position.set(0.45 - 0.1 * k, 1.45 - 0.2 * k + 0.15 * arc + 0.01 * Math.abs(Math.sin(t * 9)), 0);
    bird.rotation.y = 0.6 - 2.8 * k;
  });
  return g;
}

/** A forest of giant cave mushrooms, their caps glowing and pulsing (the
 *  crystals' material), gills under them; the caps' centres, for the glow. */
export function mushroomForest(rand: Rand) {
  const g = new THREE.Group(), caps: { p: THREE.Vector3; hue: number; r: number }[] = [];
  const n = 4 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const h = 1.8 + rand() * 2.6, r = 0.8 + rand() * 0.9, a = rand() * 6, d = k ? 1 + rand() * 2.4 : 0, hue = rand() < 0.55 ? 0x6ff0c8 : rand() < 0.5 ? 0xb89cff : 0x7fd8ff;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, lean = (rand() - 0.5) * 0.4;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * h, h * 0.5, 0), new THREE.Vector3(lean * h * 0.6, h, 0));
    const stem = new THREE.TubeGeometry(curve, 4, r * 0.18, 5);
    paint(stem, (_x, y, _z, c) => c.set(0xe9dcc4).multiplyScalar(0.8 + 0.2 * (y / h)));
    const st = inked(stem, relief(), INK_THIN);
    st.position.set(x, 0, z);
    st.rotation.y = rand() * 6;
    g.add(st);
    const top = curve.getPoint(1).applyAxisAngle(new THREE.Vector3(0, 1, 0), st.rotation.y).add(st.position);
    const cap = new THREE.SphereGeometry(r, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1);
    paint(cap, (px, py, pz, c) => c.set(hue).lerp(new THREE.Color(0xffffff), 0.35 * (py / (r * 0.55))).multiplyScalar(0.85 + 0.15 * Math.sin(Math.atan2(pz, px) * 7)));
    g.add(at(inked(cap, crystalMat(), INK_THIN), top.x, top.y - 0.05, top.z));
    const gills = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 12).rotateX(Math.PI / 2), flat(0xd9c9e8));
    g.add(at(gills, top.x, top.y - 0.06, top.z));
    caps.push({ p: top, hue, r });
  }
  return { g, caps };
}

/** A crystal cathedral: huge crystals rising like pillars, glowing, from a
 *  knot of rock; their tops for the glow. */
export function cathedral(rand: Rand) {
  const g = new THREE.Group(), tops: { p: THREE.Vector3; hue: number }[] = [];
  g.add(at(boulder(rand, 2.6, 0.9, 2.2, 1), 0, 0.4, 0));
  const n = 5 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand() * 0.5, d = k ? 0.9 + rand() * 1.2 : 0, h = k ? 3 + rand() * 4 : 8 + rand() * 2, r = h * 0.1, hue = HUES[Math.floor(rand() * HUES.length)];
    const s = inked(shard(r, h, hue), crystalMat());
    const lean = k ? 0.15 + rand() * 0.3 : 0.05;
    at(s, Math.cos(a) * d, 0.3, Math.sin(a) * d, Math.sin(a) * lean, rand() * 6, -Math.cos(a) * lean);
    g.add(s);
    tops.push({ p: new THREE.Vector3(Math.cos(a) * (d + h * lean * 0.6), h * 0.75, Math.sin(a) * (d + h * lean * 0.6)), hue });
  }
  return { g, tops };
}

/** A waterfall pouring off a ledge of the wall into a glowing pool: its
 *  curtain a thick bent sheet of water whose bands run down, foam where it
 *  lands, ripples going out. h: its drop. */
export function waterfall(rand: Rand, h: number, w: number) {
  const g = new THREE.Group();
  // the ledge it pours from, and the rock behind
  g.add(at(boulder(rand, w * 0.8, 0.9, 1.3, 1), 0, h + 0.2, -0.9));
  g.add(at(pillar(rand, h, w * 0.55), 0, 0, -1.6));
  // the curtain: bowed out, thicker at its foot
  const N = 10, M = 6, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= M; i++) {
      const v = j / N, u = i / M, bow = Math.sin(v * Math.PI * 0.5) * 0.9;
      pos.push((u - 0.5) * w * (0.8 + 0.3 * v), h * (1 - v) + 0.1, -0.3 + bow + 0.12 * Math.sin(u * Math.PI));
      uv.push(u, v);
    }
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) { const a = j * (M + 1) + i; idx.push(a, a + M + 1, a + 1, a + 1, a + M + 1, a + M + 2); }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  sheet.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  sheet.setIndex(idx);
  sheet.computeVertexNormals();
  const fall = new THREE.Mesh(sheet, FALL);
  (ud(fall).live = true), (fall.name ||= "mines:waterfall");
  g.add(fall);
  // the pool, lit from below, and its foam
  const water = poolOf(Array.from({ length: 20 }, (_, k) => new THREE.Vector2(Math.cos((k / 20) * Math.PI * 2) * w * 1.1, Math.sin((k / 20) * Math.PI * 2) * w * 0.82)));
  water.position.set(0, 0.05, 1.2);
  g.add(water);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2, st = boulder(rand, 0.4 + rand() * 0.2, 0.22, 0.35, 0);
    st.position.set(Math.cos(a) * w * 1.12, 0.05, 1.2 + Math.sin(a) * w * 0.84);
    g.add(st);
  }
  const foam = new THREE.Mesh(new THREE.TorusGeometry(w * 0.45, 0.14, 5, 18).rotateX(Math.PI / 2), flat(0xe8f6ff));
  foam.position.set(0, 0.12, 0.65);
  foam.scale.set(1, 1, 0.45);
  g.add(foam);
  return { g, pool: new THREE.Vector3(0, 0.6, 1.2) };
}
const FALL = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0x8fd8f0, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = "varying vec2 vFallUv;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vFallUv = uv;");
    sh.fragmentShader = "uniform float uTime;\nvarying vec2 vFallUv;\n" + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    // bands of white water running down, stepped (toon), a darker core
    float b = fract(vFallUv.y * 5.0 - uTime * 1.6 + sin(vFallUv.x * 9.0) * 0.12);
    float streak = step(0.72, b) * (0.6 + 0.4 * step(0.5, fract(vFallUv.x * 7.0 + 0.3)));
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.93, 0.98, 1.0), streak * 0.8 + 0.25 * smoothstep(0.85, 1.0, vFallUv.y));
  }`,
    );
  };
  m.customProgramCacheKey = () => "mines-fall";
  return share(m);
})();

/** A water wheel with its chain of buckets turning in the fall's race. */
export function bucketWheel(R: number) {
  const g = new THREE.Group(), wheel = new THREE.Group();
  for (const z of [-0.35, 0.35]) wheel.add(at(inked(wood(new THREE.TorusGeometry(R, 0.1, 5, 20), TIMBER_DARK), relief(), INK_THIN), 0, 0, z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    wheel.add(at(new THREE.Mesh(wood(new THREE.BoxGeometry(R * 2, 0.12, 0.12), TIMBER), relief()), 0, 0, 0, 0, 0, a));
    wheel.add(at(inked(wood(new THREE.BoxGeometry(0.42, 0.34, 0.7), TIMBER_LIGHT), relief(), INK_THIN), Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a));
  }
  wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8).rotateX(Math.PI / 2), flat(IRON_DARK)));
  bakeLocal(wheel);
  (ud(wheel).live = true), (wheel.name ||= "mines:bucketWheel");
  wheel.position.y = R + 0.3;
  g.add(wheel);
  for (const z of [-0.6, 0.6]) g.add(at(board(0.3, R + 0.5, 0.3, TIMBER_DARK), 0, (R + 0.5) / 2, z));
  animate((t) => (wheel.rotation.z = t * 0.5));
  return g;
}

/** The forge: a stone hearth heaped with glowing coals under its hood, the
 *  bellows breathing, an anvil and a smith at it, sparks at each blow. */
export function forge(rand: Rand, lava: THREE.Material) {
  const g = new THREE.Group();
  const hearth = boulder(rand, 1.2, 0.6, 0.9, 1);
  hearth.position.y = 0.5;
  g.add(hearth);
  const coals = knobbly(new THREE.SphereGeometry(0.75, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), rand, 0.08, 4).scale(1, 0.35, 0.8);
  g.add(at(new THREE.Mesh(coals, lava), 0, 1.02, 0));
  // the hood and its flue, iron
  const hood = new THREE.CylinderGeometry(0.25, 1.1, 0.8, 8, 1, true);
  const rust = new THREE.Color(RUST), iron = new THREE.Color(IRON);
  paint(hood, (x, y, _z, c) => c.copy(iron).lerp(rust, 0.4 + 0.3 * Math.sin(x * 5 + y * 3)));
  g.add(at(inked(hood, relief(), INK_THIN), 0, 2.6, 0), at(inked(new THREE.CylinderGeometry(0.25, 0.25, 3, 8, 1, true), flat(IRON_DARK), INK_THIN), 0, 4.4, 0));
  for (const x of [-0.9, 0.9]) g.add(at(board(0.14, 2.3, 0.14, IRON_DARK), x, 1.3, -0.6));
  // the bellows: two boards and a leather bag between, breathing
  const bel = new THREE.Group();
  bel.add(at(board(0.9, 0.06, 0.5, TIMBER), 0, 0.3, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 4).scale(1, 0.35, 0.6), flat(0x7a4a2a)), 0, 0.15, 0), at(board(0.9, 0.06, 0.5, TIMBER), 0, 0, 0));
  bel.position.set(-1.6, 0.6, 0);
  bel.rotation.z = -0.25;
  bakeLocal(bel);
  (ud(bel).live = true), (bel.name ||= "mines:forge");
  g.add(bel);
  // the anvil, the smith
  const anvil = new THREE.Group();
  anvil.add(at(board(0.4, 0.5, 0.4, TIMBER_DARK), 0, 0.25, 0), at(inked(new THREE.BoxGeometry(0.7, 0.22, 0.3), flat(IRON_DARK), INK_THIN), 0, 0.6, 0), at(inked(new THREE.ConeGeometry(0.12, 0.35, 5).rotateZ(-Math.PI / 2), flat(IRON_DARK), INK_THIN), 0.5, 0.64, 0));
  anvil.position.set(1.6, 0, 0.8);
  g.add(anvil);
  const smith = figure(rand);
  smith.position.set(1.6, 0, 1.55);
  smith.rotation.y = Math.PI;
  const hammer = new THREE.Group();
  hammer.add(at(new THREE.Mesh(wood(new THREE.BoxGeometry(0.05, 0.5, 0.05), TIMBER_LIGHT), relief()), 0, 0.25, 0), at(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.12), flat(IRON_DARK)), 0, 0.5, 0));
  bakeLocal(hammer);
  (ud(hammer).live = true), (hammer.name ||= "mines:forge");
  hammer.position.set(1.75, 0.45, 1.3);
  g.add(smith, hammer);
  const sp = new Float32Array(8 * 3), sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp, 3)), SPARK);
  sparks.frustumCulled = false;
  (ud(sparks).live = true), (sparks.name ||= "mines:forge");
  g.add(sparks);
  animate((t) => {
    bel.scale.y = 1 + 0.35 * Math.sin(t * 2.2);
    const u = (t * 0.9) % 1, sw = u < 0.75 ? 1.6 * Math.sin((u / 0.75) * Math.PI * 0.5) : 1.6 * (1 - ((u - 0.75) / 0.25) ** 2);
    hammer.rotation.x = -sw;
    const k = u > 0.97 || u < 0.15 ? (u < 0.15 ? u / 0.15 : 0) : -1;
    for (let j = 0; j < 8; j++) {
      const a = j * 0.8;
      sp[j * 3] = 1.6 + Math.cos(a) * k * 0.6;
      sp[j * 3 + 1] = k < 0 ? -99 : 0.75 + k * 0.5 - k * k * 0.6;
      sp[j * 3 + 2] = 0.8 + Math.sin(a) * k * 0.6;
    }
    sparks.geometry.attributes.position.needsUpdate = true;
  });
  return { g, fire: new THREE.Vector3(0, 1.3, 0), anvil: new THREE.Vector3(1.6, 0.9, 0.8) };
}

/** A lift tower: four posts braced, a landing deck round its well (the
 *  kit's boards, the hatch framed by a collar, a rail round it), guide rails
 *  up the well, the cage (on a bridle) fitting the hatch with room to spare,
 *  flush in it at the landing; its cable over a sheave on the head down to
 *  the counterweight, the sheave turning as it runs. */
export function liftTower(rand: Rand, h: number) {
  const g = new THREE.Group(), W = 2.2, O = 1.75, D = 0.3, E = W / 2 + 0.9, X = W / 2 + 0.45, R = X / 2, SY = h + 0.75;
  for (const x of [-W / 2, W / 2]) for (const z of [-W / 2, W / 2]) g.add(at(board(0.3, h, 0.3, TIMBER_DARK), x, h / 2, z));
  for (let y = 2; y < h; y += 2.4) for (const z of [-W / 2, W / 2]) g.add(at(board(W + 0.3, 0.2, 0.2), 0, y, z));
  g.add(at(board(W + 0.6, 0.35, W + 0.6), 0, h, 0));
  // the landing: boards round the well, the hatch's collar, a rail on three sides
  g.add(planks([{ inside: (x, z) => Math.max(Math.abs(x), Math.abs(z)) < E && Math.max(Math.abs(x), Math.abs(z)) > O / 2 + 0.14, top: () => D, box: [-E, -E, E, E], angle: 0 }], rand, { thick: 0.1 }));
  for (const s0 of [-1, 1]) g.add(at(board(O + 0.3, 0.16, 0.14, TIMBER_DARK), 0, D + 0.02, s0 * (O / 2 + 0.07)), at(board(0.14, 0.16, O + 0.3, TIMBER_DARK), s0 * (O / 2 + 0.07), D + 0.02, 0));
  for (const x of [-E + 0.1, E - 0.1]) for (const z of [-E + 0.1, E - 0.1]) g.add(at(board(0.12, 1.0, 0.12, TIMBER_DARK), x, D + 0.5, z));
  for (const s0 of [-1, 1]) g.add(at(board(0.08, 0.1, 2 * E - 0.2), s0 * (E - 0.1), D + 0.95, 0));
  g.add(at(board(2 * E - 0.2, 0.1, 0.08), 0, D + 0.95, -(E - 0.1)));
  // the guide rails up the well, either side of the cage
  for (const x of [-O / 2 + 0.02, O / 2 - 0.02]) g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.06, h - D, 0.08), flat(IRON_DARK)), x, (h + D) / 2, 0));
  // the cage: its floor and roof, corner bars, a rider, the bridle's four chains up to its ring
  const cage = new THREE.Group();
  cage.add(at(inked(new THREE.BoxGeometry(1.5, 0.1, 1.5), flat(IRON)), 0, 0, 0), at(inked(new THREE.BoxGeometry(1.5, 0.1, 1.5), flat(IRON)), 0, 1.7, 0));
  for (const x of [-0.7, 0.7]) for (const z of [-0.7, 0.7]) {
    cage.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.7, 0.07), flat(IRON_DARK)), x, 0.85, z));
    const len = Math.hypot(0.7, 0.6, 0.7), chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, len, 4), flat(IRON_DARK));
    chain.position.set(x / 2, 2.05, z / 2);
    chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-x, 0.6, -z).normalize());
    cage.add(chain);
  }
  cage.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 8), flat(IRON_DARK)), 0, 2.4, 0));
  const rider = figure(rand);
  rider.position.y = 0.05;
  cage.add(rider);
  bakeLocal(cage);
  (ud(cage).live = true), (cage.name ||= "mines:liftTower");
  g.add(cage);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), flat(IRON_DARK));
  (ud(cw).live = true), (cw.name ||= "mines:liftTower");
  cw.position.x = X;
  g.add(cw);
  // the head: the sheave on its axle between two cheeks, the cable over it, cage side and weight side
  for (const z of [-0.2, 0.2]) g.add(at(board(0.2, SY - h, 0.12, TIMBER_DARK), R, (h + SY) / 2 + 0.1, z));
  const sheave = new THREE.Group();
  sheave.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 5, 16), flat(IRON)));
  for (let k = 0; k < 3; k++) sheave.add(at(new THREE.Mesh(new THREE.BoxGeometry(2 * R, 0.05, 0.05), flat(IRON)), 0, 0, 0, 0, 0, (k * Math.PI) / 3));
  sheave.position.set(R, SY, 0);
  bakeLocal(sheave);
  (ud(sheave).live = true), (sheave.name ||= "mines:liftTower");
  g.add(sheave);
  // (the cable: two runs down from the sheave, one line set moved each frame)
  const cable = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, SY, 0, 0, 0, 0, X, SY, 0, X, 0, 0], 3)), new THREE.LineBasicMaterial({ color: MINES.ink }));
  const cp = cable.geometry.attributes.position as THREE.BufferAttribute;
  cable.frustumCulled = false;
  (ud(cable).live = true), (cable.name ||= "mines:liftTower");
  g.add(cable);
  animate((t) => {
    const u = (Math.sin(t * 0.3) + 1) / 2, e = u * u * (3 - 2 * u);
    cage.position.y = D - 0.05 + e * (h - 2.8 - D); // (at the landing its floor flush with the deck)
    cw.position.y = h - 1 - e * (h - 2.4);
    cp.setY(1, cage.position.y + 2.4), cp.setY(3, cw.position.y + 0.45), (cp.needsUpdate = true);
    sheave.rotation.z = -cage.position.y / R;
  });
  return g;
}

/** The tunnel-boring drill head, half sunk into the rock: a cutting wheel
 *  of iron spokes and teeth, its body riveted, turning slowly. */
export function drillHead(rand: Rand, R: number) {
  const g = new THREE.Group(), wheel = new THREE.Group();
  wheel.add(inked(new THREE.CylinderGeometry(R, R, 0.5, 18).rotateX(Math.PI / 2), flat(IRON)));
  for (let k = 0; k < 6; k++) wheel.add(at(inked(new THREE.BoxGeometry(R * 1.9, 0.3, 0.3), flat(IRON_DARK), INK_THIN), 0, 0, 0.35, 0, 0, (k * Math.PI) / 6));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    wheel.add(at(inked(new THREE.ConeGeometry(0.16, 0.45, 5).rotateX(Math.PI / 2), flat(0xb8bcc8), INK_THIN), Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, 0.5));
  }
  wheel.add(at(inked(new THREE.ConeGeometry(0.4, 0.8, 8).rotateX(Math.PI / 2), flat(RUST), INK_THIN), 0, 0, 0.75));
  bakeLocal(wheel);
  (ud(wheel).live = true), (wheel.name ||= "mines:drillHead");
  wheel.position.set(0, R * 0.8, 0.6);
  g.add(wheel);
  const body = new THREE.CylinderGeometry(R * 0.9, R * 0.95, 3, 16, 1, true).rotateX(Math.PI / 2);
  const rust = new THREE.Color(RUST), iron = new THREE.Color(IRON);
  paint(body, (x, y, z, c) => c.copy(iron).lerp(rust, 0.3 + 0.3 * Math.sin(x * 3 + y * 5 + z)));
  g.add(at(inked(body, relief()), 0, R * 0.8, -1.2));
  // the rock it bores into, round its body
  g.add(at(boulder(rand, R * 1.6, R * 1.2, 1.6, 1), 0, R * 0.8, -2.3));
  animate((t) => (wheel.rotation.z = t * 0.25));
  return g;
}

/** A steam boiler: a riveted drum on saddles, its firebox glowing, a gauge,
 *  a stack; its whistle's steam (props.ts smoke at `steam`). */
export function boiler(rand: Rand, lava: THREE.Material) {
  const g = new THREE.Group();
  const drum = new THREE.CylinderGeometry(1, 1, 3.4, 16).rotateZ(Math.PI / 2);
  const rust = new THREE.Color(RUST), iron = new THREE.Color(0x6a4a3e);
  paint(drum, (x, y, z, c) => c.copy(iron).lerp(rust, 0.25 + 0.25 * Math.sin(x * 4 + z * 2) + 0.2 * Math.abs(y)));
  g.add(at(inked(drum, relief()), 0, 1.6, 0));
  for (const x of [-1.2, -0.4, 0.4, 1.2]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(1.01, 0.04, 4, 20), flat(IRON_DARK)), x, 1.6, 0, 0, Math.PI / 2));
  for (const x of [-1.1, 1.1]) g.add(at(board(0.4, 0.8, 1.6, IRON_DARK), x, 0.4, 0));
  const box = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), lava);
  g.add(at(box, -1.71, 1.3, 0, 0, -Math.PI / 2));
  g.add(at(inked(new THREE.CylinderGeometry(0.2, 0.25, 2.6, 8, 1, true), flat(IRON_DARK), INK_THIN), 1.2, 3.6, 0));
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), flat(0xf2ead8));
  g.add(at(gauge, 0.3, 2.3, 0.96, -0.5), at(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 12), flat(MINES.brass)), 0.3, 2.3, 0.97, -0.5));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), flat(MINES.brass)), -0.6, 2.8, 0));
  void rand;
  return { g, steam: new THREE.Vector3(-0.6, 3.1, 0), fire: new THREE.Vector3(-1.9, 1.3, 0) };
}

/** Treasure: heaps of gold coins with jewels in them, an open chest. */
export function treasure(rand: Rand) {
  const g = new THREE.Group(), gold = new THREE.Color(0xe8b43a), dark = new THREE.Color(0xa87a1e);
  for (let k = 0; k < 3; k++) {
    const r = 0.6 + rand() * 0.6, heap = knobbly(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), rand, r * 0.06, 6).scale(1, 0.45, 1);
    paint(heap, (x, y, z, c) => c.copy(dark).lerp(gold, 0.55 + 0.45 * Math.sin(x * 11 + z * 13 + y * 7)));
    g.add(at(facets(heap, relief(), INK_THIN), (k - 1) * 1.1, 0, (rand() - 0.5) * 0.8));
    g.add(at(inked(shard(0.1, 0.22, HUES[k % HUES.length]), crystalMat(), INK_THIN), (k - 1) * 1.1, r * 0.4, 0, 0.4, 0, 0.3));
  }
  const chest = new THREE.Group();
  chest.add(at(board(1, 0.55, 0.65, TIMBER_DARK), 0, 0.28, 0), at(board(1.04, 0.08, 0.69, MINES.brass), 0, 0.5, 0));
  const lid = new THREE.Mesh(wood(new THREE.CylinderGeometry(0.33, 0.33, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), TIMBER), relief());
  chest.add(at(lid, 0, 0.62, -0.25, -1.1));
  const heap = knobbly(new THREE.SphereGeometry(0.42, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), rand, 0.03, 8).scale(1.1, 0.4, 0.7);
  paint(heap, (x, _y, z, c) => c.copy(gold).lerp(dark, 0.3 + 0.3 * Math.sin(x * 14 + z * 9)));
  chest.add(at(new THREE.Mesh(heap, relief()), 0, 0.54, 0));
  chest.position.set(0.3, 0, 1.2);
  chest.rotation.y = -0.4;
  g.add(chest);
  return g;
}

/** The miners' canteen: a table and benches, mugs, a lantern, one of them
 *  sitting at it. */
export function canteen(rand: Rand, lamp: THREE.Object3D) {
  const g = new THREE.Group();
  g.add(at(board(2.2, 0.1, 0.9, TIMBER_LIGHT), 0, 0.72, 0));
  for (const x of [-0.9, 0.9]) g.add(at(board(0.1, 0.7, 0.7, TIMBER_DARK), x, 0.35, 0));
  for (const z of [-0.8, 0.8]) g.add(at(board(2, 0.08, 0.3, TIMBER), 0, 0.42, z), at(board(0.1, 0.4, 0.25, TIMBER_DARK), -0.8, 0.2, z), at(board(0.1, 0.4, 0.25, TIMBER_DARK), 0.8, 0.2, z));
  for (const [x, z] of [[-0.5, 0.2], [0.2, -0.15], [0.6, 0.25]]) g.add(at(inked(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 8), flat(0xd8c8a8), INK_THIN), x, 0.85, z));
  lamp.position.set(-0.2, 0.77, -0.1);
  g.add(lamp);
  const f = figure(rand, true);
  f.position.set(0.4, 0.3, 0.8);
  f.rotation.y = Math.PI;
  g.add(f);
  return { g, lamp: new THREE.Vector3(-0.2, 1.05, -0.1) };
}

/** A snore's bubble at u of its breath (0..1): swelling to top, then gone in a blink (a few frames, not one). */
const swell = (u: number, top: number) => Math.max(0.001, u < 0.85 ? (top * u) / 0.85 : top * (1 - (u - 0.85) / 0.07));

/** A gnome asleep on a crate, snoring: a bubble swelling and gone. */
export function sleeper(rand: Rand) {
  const g = new THREE.Group();
  g.add(crate(() => 0.9));
  const f = figure(rand, true);
  f.position.set(0, 0.62, 0);
  f.rotation.z = 0.35;
  g.add(f);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.7 }));
  (ud(bubble).live = true), (bubble.name ||= "mines:sleeper");
  g.add(bubble);
  animate((t) => {
    const u = (t * 0.35) % 1;
    bubble.scale.setScalar(swell(u, 1.66));
    bubble.position.set(0.28, 1.25 + u * 0.12, 0.15);
  });
  return g;
}

/** A dynamite shed: planks, a pent roof, a red door with its sign. */
export function dynamiteShed() {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) g.add(at(board(0.4, 1.8, 0.1, k % 2 ? TIMBER : TIMBER_DARK), -1 + k * 0.4, 0.9, 0.8));
  for (const x of [-1.2, 1.2]) g.add(at(board(0.1, 1.8, 1.6, TIMBER_DARK), x, 0.9, 0));
  g.add(at(board(2.6, 0.12, 2, TIMBER_LIGHT), 0, 2, 0, 0.12));
  g.add(at(board(0.8, 1.3, 0.08, 0xa8392e), 0.3, 0.7, 0.86));
  g.add(at(board(0.9, 0.36, 0.05, 0xf2ead8), -0.55, 1.4, 0.87), at(board(0.6, 0.08, 0.02, 0xa8392e), -0.55, 1.4, 0.9));
  return g;
}


/** An old cart hanging over the chasm on its chains from a beam at the
 *  edge, swaying: a skeleton of the old workings. */
export function danglingCart(rand: Rand, drop: number) {
  const g = new THREE.Group();
  g.add(at(board(0.3, 0.3, 3.2, TIMBER_DARK), 0, 0, 1.2));
  g.add(at(board(0.3, 1.4, 0.3, TIMBER_DARK), 0, -0.6, -0.3));
  const hang = new THREE.Group(), c = oreCart(rand, false).g;
  c.rotation.z = 0.5;
  c.position.y = -drop;
  hang.add(c);
  for (const x of [-0.5, 0.5]) hang.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, drop - 0.9, 3), flat(IRON_DARK)), x * 0.8, -(drop - 0.9) / 2, 0, 0, 0, x * 0.2));
  bakeLocal(hang);
  (ud(hang).live = true), (hang.name ||= "mines:danglingCart");
  hang.position.set(0, 0, 2.6);
  g.add(hang);
  animate((t) => (hang.rotation.x = Math.sin(t * 0.6) * 0.06));
  return g;
}

/** An ammonite in the rock: a boulder with a spiral fossil on its face. */
export function fossil(rand: Rand) {
  const g = new THREE.Group();
  g.add(at(boulder(rand, 1.3, 1, 0.9, 1), 0, 0.7, 0));
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 40; k++) { const a = k * 0.35, r = 0.05 + k * 0.014; pts.push(new THREE.Vector3(Math.cos(a) * r, 0.8 + Math.sin(a) * r, 0)); }
  g.add(at(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.04, 4), flat(0xd8c8a8)), 0, 0, 0.82));
  return g;
}

/** A far lava fall pouring down a rock face into its lava pool, lit from
 *  within (the lava's own material). */
export function lavaFall(rand: Rand, h: number, w: number, lava: THREE.Material) {
  const g = new THREE.Group();
  g.add(at(pillar(rand, h + 1, w * 0.7), 0, 0, -1.2));
  const sheet = new THREE.PlaneGeometry(w, h, 4, 8);
  const p = sheet.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, 0.4 * Math.sin((p.getY(i) / h + 0.5) * Math.PI) + 0.15 * Math.sin(p.getX(i) * 2));
  sheet.translate(0, h / 2, 0);
  g.add(new THREE.Mesh(crustBy(sheet, () => FALLING), lava));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(w * 1.2, 18).rotateX(-Math.PI / 2).scale(1, 1, 0.7), lava);
  pool.position.set(0, 0.06, 1);
  g.add(pool);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, st = boulder(rand, 0.45, 0.25, 0.4, 0);
    st.position.set(Math.cos(a) * w * 1.25, 0.05, 1 + Math.sin(a) * w * 0.88);
    g.add(st);
  }
  return { g, glow: new THREE.Vector3(0, h * 0.4, 0.6), pool: new THREE.Vector3(0, 0.4, 1) };
}

/** Two miners carrying a long plank between them, walking along a path and
 *  back (a and b: its ends, on the floor). */
function carriers(rand: Rand, a: THREE.Vector3, b: THREE.Vector3) {
  const team = new THREE.Group();
  for (const x of [-0.9, 0.9]) team.add(at(minerBody(rand), x, 0, 0, 0, Math.PI / 2));
  team.add(at(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.3), flat(TIMBER_LIGHT)), 0, 0.72, 0.18)); // (in the men's own colours bucket: no draw of its own)
  bakeLocal(team);
  (ud(team).live = true), (team.name ||= "mines:carriers");
  const L = a.distanceTo(b), yaw = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
  animate((t) => {
    const u = (t * 0.6 / L) % 2, v = u < 1 ? u : 2 - u, e = v * v * (3 - 2 * v);
    team.position.lerpVectors(a, b, e);
    team.position.y += Math.abs(Math.sin(t * 5)) * 0.04;
    team.rotation.y = yaw + (u < 1 ? 0 : Math.PI);
  });
  return team;
}

// ------------------------------------------------------------ the decor pass: bigger things
//
// The cave filled as the other worlds are (a Town's houses, a Garden's
// trees): things the size of a shack, a lamp post, a stack of crates, a
// giant crystal, round the lane in rows. Cheap per triangle: boxes painted in
// their grain, lathes of few sides, one crystal material.

/** A miners' shack: a timber hut of upright boards, a pent roof of rusty tin,
 *  a door, a lit window, a stovepipe (its smoke at `smoke`). */
function shack(rand: Rand) {
  const g = new THREE.Group(), W = 2.6 + rand() * 0.8, D = 2.2, H = 2.1 + rand() * 0.4, tone = rand() < 0.5 ? TIMBER : TIMBER_DARK;
  const walls = new THREE.BoxGeometry(W, H, D).translate(0, H / 2, 0);
  paint(walls, (x, y, z, c) => c.set(tone).multiplyScalar((0.82 + 0.14 * (Math.floor((Math.abs(x) > W / 2 - 0.01 ? z : x) * 3.2) % 2)) * (0.8 + 0.2 * (y / H))));
  g.add(inked(walls, relief()));
  // the roof: tin sheets in ridges, rust at the edges
  const roof = new THREE.BoxGeometry(W + 0.5, 0.12, D + 0.6);
  const rust = new THREE.Color(RUST), tin = new THREE.Color(0x8a8e98);
  paint(roof, (x, _y, z, c) => c.copy(tin).multiplyScalar(0.85 + 0.15 * (Math.floor(x * 3) % 2)).lerp(rust, 0.2 + 0.5 * Math.max(0, Math.abs(z) / (D / 2 + 0.3) - 0.6)));
  g.add(at(inked(roof, relief()), 0, H + 0.2, 0, 0.14));
  g.add(at(board(0.7, 1.5, 0.08, TIMBER_DARK), -W * 0.22, 0.75, D / 2 + 0.03));
  g.add(at(new THREE.Mesh(WINDOW_GEO, WINDOW), W * 0.22, 1.3, D / 2 + 0.03));
  g.add(at(board(0.72, 0.08, 0.06, TIMBER_LIGHT), W * 0.22, 1.02, D / 2 + 0.06), at(board(0.08, 0.6, 0.06, TIMBER_LIGHT), W * 0.22, 1.3, D / 2 + 0.07));
  g.add(at(inked(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6, 1, true), flat(IRON_DARK), INK_THIN), W * 0.3, H + 0.7, -D * 0.2));
  return { g, window: new THREE.Vector3(W * 0.22, 1.3, D / 2 + 0.2), smoke: new THREE.Vector3(W * 0.3, H + 1.4, -D * 0.2) };
}
// a lit window: its colour in its own material, vertex coloured white (as the
// lanterns' glass: the bake keeps it apart, "Lights out" dims them all at once)
export const WINDOW = share(new THREE.MeshBasicMaterial({ color: 0xffc86b, vertexColors: true }));
const WINDOW_GEO = share((() => {
  const geo = new THREE.PlaneGeometry(0.6, 0.5);
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
})());

/** A rack of picks and shovels against its frame. */
function toolRack(rand: Rand) {
  const g = new THREE.Group();
  g.add(at(board(2, 0.12, 0.12, TIMBER_DARK), 0, 1.35, 0), at(board(2, 0.12, 0.12, TIMBER_DARK), 0, 0.3, 0.25));
  for (const x of [-0.95, 0.95]) g.add(at(board(0.12, 1.45, 0.12, TIMBER_DARK), x, 0.72, 0));
  for (let k = 0; k < 5; k++) {
    const x = -0.75 + k * 0.38, pick = rand() < 0.5, t = new THREE.Group();
    t.add(at(board(0.06, 1.35, 0.06, TIMBER_LIGHT), 0, 0.68, 0));
    t.add(pick ? at(inked(new THREE.ConeGeometry(0.05, 0.6, 5).rotateZ(Math.PI / 2), flat(IRON), INK_THIN), 0, 1.35, 0) : at(inked(new THREE.BoxGeometry(0.3, 0.4, 0.04), flat(IRON), INK_THIN), 0, 0.05, 0));
    g.add(at(t, x, pick ? 0 : 0.2, 0.15, -0.12, 0, (rand() - 0.5) * 0.15));
  }
  return g;
}

/** Crates stacked two or three high, a dynamite one among them now and then. */
// the stores stacked three ways: a pyramid of crates, a row against the wall
// with sacks on them, a pallet of crates and barrels
const STACKS: readonly (readonly [number, number, number, "c" | "s" | "b"])[][] = [
  [[0, 0, 0, "c"], [1.05, 0, 0.1, "c"], [0.5, 1, 0.05, "c"], [-0.1, 0, 1.05, "c"], [0.45, 2, 0, "c"]],
  [[0, 0, 0, "c"], [1.1, 0, 0, "c"], [2.2, 0, 0, "c"], [0.1, 1, 0, "s"], [1.2, 1, 0, "s"], [2.0, 1, 0.1, "s"]],
  [[0, 0, 0, "c"], [1.05, 0, 0, "b"], [0, 0, 1.05, "b"], [1.05, 0, 1.05, "c"], [0.5, 1, 0.5, "s"]],
];
export function crateStack(rand: Rand) {
  const g = new THREE.Group(), plan = STACKS[Math.floor(rand() * STACKS.length)], n = plan.length - Math.floor(rand() * 2);
  for (let k = 0; k < n; k++) {
    const [x, y, z, kind] = plan[k], c = kind === "c" ? crate(rand) : kind === "b" ? barrel(rand) : sack(rand);
    c.scale.setScalar(kind === "c" ? 1.35 : 1.3);
    c.position.set(x, y * 0.98, z);
    c.rotation.y = (rand() - 0.5) * (kind === "c" ? 0.3 : 3);
    g.add(c);
  }
  return g;
}
/** A burlap sack of ore, tied at its neck. */
function sack(rand: Rand) {
  const geo = knobbly(new THREE.SphereGeometry(0.42, 8, 6).scale(1, 0.8, 0.9), rand, 0.05, 3).translate(0, 0.32, 0);
  paint(geo, (x, y, _z, c) => c.set(0xb89868).multiplyScalar(0.8 + 0.2 * (y / 0.7) + 0.04 * Math.sin(x * 20)));
  const g = new THREE.Group();
  g.add(inked(geo, relief(), INK_THIN), at(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.18, 6), flat(0x9a7a4e)), 0, 0.72, 0));
  return g;
}

/** A tall iron lamp post, a cross arm and two lanterns hanging off it; the
 *  lanterns' points (for the caller's light). */
export function bigLamp(make: () => THREE.Object3D, kind = 0) {
  if (kind % 3 === 1) return gallows(make);
  if (kind % 3 === 2) return tripod(make);
  const g = new THREE.Group(), H = 3.8;
  g.add(at(inked(new THREE.CylinderGeometry(0.09, 0.14, H, 7), flat(IRON_DARK), INK_THIN), 0, H / 2, 0));
  g.add(at(inked(new THREE.CylinderGeometry(0.26, 0.32, 0.3, 7), flat(IRON_DARK), INK_THIN), 0, 0.15, 0));
  g.add(at(board(1.7, 0.1, 0.1, IRON_DARK), 0, H - 0.1, 0));
  const pts: THREE.Vector3[] = [];
  for (const x of [-0.72, 0.72]) {
    const l = make();
    l.scale.setScalar(1.5);
    l.position.set(x, H - 1.25, 0);
    g.add(l, at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), flat(IRON_DARK)), x, H - 0.2, 0));
    pts.push(new THREE.Vector3(x, H - 0.85, 0));
  }
  return { g, pts };
}
/** A lamp on a timber gallows: a post, its arm and brace, the lantern hanging. */
function gallows(make: () => THREE.Object3D) {
  const g = new THREE.Group(), H = 3.6;
  g.add(at(board(0.3, H, 0.3, TIMBER_DARK), 0, H / 2, 0), at(board(1.5, 0.2, 0.2, TIMBER), 0.6, H - 0.1, 0), at(board(0.12, 1, 0.12, TIMBER_DARK), 0.35, H - 0.5, 0, 0, 0, -0.8));
  const l = make();
  l.scale.setScalar(1.6);
  l.position.set(1.2, H - 1.4, 0);
  g.add(l);
  return { g, pts: [new THREE.Vector3(1.2, H - 1, 0)] };
}
/** A lantern hung under a tripod of poles, lashed at the top. */
function tripod(make: () => THREE.Object3D) {
  const g = new THREE.Group(), H = 3.2;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    g.add(at(board(0.14, H + 0.3, 0.14, TIMBER), Math.cos(a) * 0.55, H / 2, Math.sin(a) * 0.55, Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2));
  }
  const l = make();
  l.scale.setScalar(1.6);
  l.position.set(0, H - 1.5, 0);
  g.add(l, at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4), flat(IRON_DARK)), 0, H - 0.3, 0));
  return { g, pts: [new THREE.Vector3(0, H - 1.1, 0)] };
}

/**
 * A giant crystal group on its rock, about h tall, its heart for the caller's
 * light, in one of a few compositions (never the same cone twice): a spire
 * (one huge prism, big ones leaning out round it), a fan of tabular plates
 * splayed from the rock, an urchin of needles radiating from a knot, fluorite
 * (cubes stacked and interpenetrating), or a druse (a bed of many points on a
 * broad rock). Graded colour, small shards as accents at its feet.
 */
type Composition = "spire" | "fan" | "urchin" | "fluorite" | "druse";
const COMPOSITIONS: Composition[] = ["spire", "fan", "urchin", "fluorite", "druse"];
export function giantCrystal(rand: Rand, h: number, hue: number, kind: Composition = COMPOSITIONS[Math.floor(rand() * COMPOSITIONS.length)]) {
  const g = new THREE.Group();
  const bed = kind === "druse" ? boulder(rand, h * 0.6, h * 0.16, h * 0.5, 1) : boulder(rand, h * 0.35, h * 0.14, h * 0.3, 1);
  g.add(at(bed, 0, h * 0.05, 0));
  const put = (kind: Form, r: number, hh: number, a: number, d: number, lean: number, c = hue, y = h * 0.08, tilt = 0) => {
    const s = gem(form(kind, r, hh), c);
    at(s, Math.cos(a) * d, y, Math.sin(a) * d, Math.sin(a) * lean + tilt, rand() * 6, -Math.cos(a) * lean);
    g.add(s);
  };
  const accent = () => (rand() < 0.2 ? HUES[Math.floor(rand() * HUES.length)] : hue);
  if (kind === "spire") {
    put("prism", h * 0.1, h, 0, 0, 0.06);
    const n = 4 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) put(rand() < 0.3 ? "double" : "prism", h * (0.05 + rand() * 0.03), h * (0.35 + rand() * 0.3), (k / n) * Math.PI * 2 + rand() * 0.5, h * 0.1, 0.3 + rand() * 0.35);
  } else if (kind === "fan") {
    const n = 5 + Math.floor(rand() * 3), a0 = rand() * 6;
    for (let k = 0; k < n; k++) put("plate", h * (0.12 + rand() * 0.05), h * (0.55 + rand() * 0.45), a0 + (k - n / 2) * 0.35, h * 0.05, 0.15 + Math.abs(k - n / 2) * 0.12);
  } else if (kind === "urchin") {
    const n = 16 + Math.floor(rand() * 8);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, up = rand();
      put("needle", h * 0.05, h * (0.35 + rand() * 0.45), a, h * 0.06, 0.2 + up * 1.1, accent(), h * 0.2);
    }
    g.add(at(boulder(rand, h * 0.22, h * 0.2, h * 0.22, 1), 0, h * 0.2, 0));
  } else if (kind === "fluorite") {
    const n = 6 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const r = h * (0.08 + rand() * 0.12), a = rand() * Math.PI * 2, d = h * rand() * 0.25;
      put("cube", r, r, a, d, 0, accent(), h * 0.08 + (k > n / 2 ? r * 1.3 : 0), (rand() - 0.5) * 0.9);
    }
  } else {
    const n = 22 + Math.floor(rand() * 10);
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * h * 0.5;
      put(rand() < 0.7 ? "prism" : "double", h * (0.03 + rand() * 0.03), h * (0.15 + rand() * 0.3) * (1 - d / h), a, d, 0.1 + (d / h) * 0.6, accent(), h * 0.1);
    }
  }
  for (let k = 0; k < 6; k++) put(rand() < 0.5 ? "prism" : "needle", h * 0.025, h * (0.08 + rand() * 0.1), rand() * Math.PI * 2, h * (0.25 + rand() * 0.15), 0.5 + rand() * 0.4, accent());
  return { g, heart: new THREE.Vector3(0, h * 0.45, 0) };
}

/** A pool's water inside its shore (pts, round its middle): the mines' water
 *  (mines-water), in rings in to the middle, each as deep as it is in (its shore at 0). */
function poolOf(pts: readonly THREE.Vector2[]) {
  const n = pts.length, pos: number[] = [], depth: number[] = [], idx: number[] = [], RING = [1, 0.85, 0.6, 0.25], DEEP = [0, 0.3, 0.6, 0.85];
  RING.forEach((k, r) => { for (const p of pts) (pos.push(p.x * k, 0, p.y * k), depth.push(DEEP[r])); });
  pos.push(0, 0, 0);
  depth.push(1);
  for (let r = 0; r < RING.length - 1; r++) for (let k = 0; k < n; k++) { const a = r * n + k, b = r * n + ((k + 1) % n); idx.push(a, b, a + n, b, b + n, a + n); }
  for (let k = 0; k < n; k++) idx.push((RING.length - 1) * n + k, (RING.length - 1) * n + ((k + 1) % n), RING.length * n);
  const geo = geoOf(pos, idx);
  geo.setAttribute("wDepth", new THREE.Float32BufferAttribute(depth, 1));
  const water = new THREE.Mesh(geo, waterMaterial(null).material);
  (ud(water).live = true), (water.name ||= "mines:lake"); // (its own material: one draw either way)
  return water;
}

/**
 * An underground lake: the mines' water (mines-water: dark, glowing where
 * it meets the rock, drips ringing on it), a jetty of planks on posts
 * running out into it and a raft moored to it; its middle (for the glow).
 */
export function lake(rand: Rand, rx: number, rz: number) {
  const g = new THREE.Group(), n = 28, pts: THREE.Vector2[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, w = 0.85 + 0.15 * Math.sin(a * 3 + rand() * 6) + 0.05 * rand();
    pts.push(new THREE.Vector2(Math.cos(a) * rx * w, Math.sin(a) * rz * w));
  }
  const water = poolOf(pts);
  water.position.y = 0.06;
  g.add(water);
  // (its stones on the bank round it, clear of the water)
  for (let k = 0; k < n; k += 2) {
    const r = 0.45 + rand() * 0.3, st = boulder(rand, r, 0.25, 0.4, 0), out = 1 + (r + 0.12) / Math.max(0.5, pts[k].length());
    st.position.set(pts[k].x * out, 0.05, pts[k].y * out);
    g.add(st);
  }
  // the jetty, from the shore out
  const a0 = rand() * Math.PI * 2, sx = Math.cos(a0) * rx * 0.95, sz = Math.sin(a0) * rz * 0.95, L = Math.min(rx, rz) * 0.8;
  const jet = new THREE.Group();
  jet.add(planks([{ inside: (x, z) => Math.abs(x) < 0.6 && z < 0 && z > -L, top: () => 0.32, box: [-0.6, -L, 0.6, 0], angle: 0 }], rand, { width: 0.36 }));
  for (const x of [-0.5, 0.5]) for (const z of [-0.2, -L + 0.2]) jet.add(at(board(0.14, 0.7, 0.14, TIMBER_DARK), x, 0.05, z));
  jet.position.set(sx, 0, sz);
  jet.rotation.y = Math.atan2(sx, sz);
  g.add(jet);
  const raft = new THREE.Group();
  for (let k = 0; k < 5; k++) raft.add(at(inked(wood(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 6).rotateX(Math.PI / 2), TIMBER), relief(), INK_THIN), -0.52 + k * 0.26, 0, 0));
  // (moored still: it bakes with the rest, no draw of its own)
  raft.position.set(sx * (1 - L / Math.hypot(sx, sz)) * 0.7, 0.2, sz * (1 - L / Math.hypot(sx, sz)) * 0.7 + 1.2); // (riding on the water, its logs over it)
  raft.rotation.y = 0.4;
  g.add(raft);
  return { g, mid: new THREE.Vector3(0, 0.4, 0) };
}
/** A mole in a miner's helmet popping out of its hill now and then, looking
 *  round, and down again. */
export function mole(rand: Rand) {
  const g = new THREE.Group();
  const hill = knobbly(new THREE.SphereGeometry(0.6, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), rand, 0.06, 4).scale(1, 0.45, 1);
  paint(hill, (x, _y, z, c) => c.set(0x6b5244).lerp(new THREE.Color(0x4a3e58), 0.5 + 0.5 * Math.sin(x * 7 + z * 5)));
  g.add(facets(hill, relief(), INK_THIN));
  const m = new THREE.Group();
  m.add(inked(new THREE.SphereGeometry(0.28, 10, 8).scale(1, 1.1, 1), flat(0x5a4636), INK_THIN));
  m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), flat(0xf2a2a0)), 0, 0.02, 0.27));
  for (const x of [-0.1, 0.1]) m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), flat(MINES.ink)), x, 0.12, 0.23));
  m.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xf2c14e)), 0, 0.2, 0));
  m.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8).rotateX(Math.PI / 2), flat(0xfff3b0)), 0, 0.28, 0.17));
  bakeLocal(m);
  (ud(m).live = true), (m.name ||= "mines:mole");
  g.add(m);
  const T = 6 + rand() * 4, ph = rand() * T;
  animate((t) => {
    const u = ((t + ph) % T) / T, up = u < 0.1 ? u / 0.1 : u < 0.55 ? 1 : u < 0.65 ? 1 - (u - 0.55) / 0.1 : 0;
    m.position.y = -0.3 + up * 0.55;
    m.rotation.y = Math.sin(t * 1.5) * 0.7 * up;
    m.visible = up > 0.01;
  });
  return g;
}

/**
 * A timber frame the lane passes under: two posts outside it, a lintel and
 * knee braces, a lantern hanging from the middle; its lantern's point.
 */
export function archOver(span: number, make: () => THREE.Object3D) {
  const g = new THREE.Group(), H = 4.2;
  for (const x of [-span / 2, span / 2]) {
    g.add(at(board(0.4, H, 0.4, TIMBER_DARK), x, H / 2, 0));
    g.add(at(board(1.2, 0.18, 0.2, TIMBER), x - Math.sign(x) * 0.45, H - 0.55, 0, 0, 0, Math.sign(x) * 0.8));
  }
  g.add(at(board(span + 1, 0.45, 0.45, TIMBER), 0, H + 0.2, 0));
  const l = make();
  l.scale.setScalar(1.5);
  l.position.set(0, H - 1.3, 0);
  g.add(l, at(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4), flat(IRON_DARK)), 0, H - 0.15, 0));
  return { g, lamp: new THREE.Vector3(0, H - 0.9, 0) };
}


/** The pit pony asleep in its stall: timber stall, straw, the pony lying in
 *  it, snoring (the mines' sleeping cat). */
export function ponyStall(rand: Rand) {
  const g = new THREE.Group();
  for (const x of [-1.3, 1.3]) g.add(at(board(0.12, 1.3, 2.2, TIMBER_DARK), x, 0.65, 0));
  g.add(at(board(2.7, 1.3, 0.12, TIMBER_DARK), 0, 0.65, -1.1));
  for (const x of [-1.3, 1.3]) g.add(at(board(0.2, 2.2, 0.2, TIMBER), x, 1.1, 1.1));
  g.add(at(board(3.1, 0.1, 2.8, TIMBER_LIGHT), 0, 2.25, 0, 0.12));
  const straw = knobbly(new THREE.SphereGeometry(1.1, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), rand, 0.06, 5).scale(1.1, 0.18, 0.9);
  paint(straw, (x, _y, z, c) => c.set(0xd8b45a).multiplyScalar(0.85 + 0.15 * Math.sin(x * 13 + z * 11)));
  g.add(new THREE.Mesh(straw, relief()));
  const coat = flat(0x8a6040), mane = flat(0x3a2a20);
  const pony = new THREE.Group();
  pony.add(at(inked(new THREE.SphereGeometry(0.55, 12, 8).scale(1.5, 0.75, 0.85), coat), 0, 0.38, 0));
  const head = new THREE.Group();
  head.add(inked(new THREE.SphereGeometry(0.26, 10, 8).scale(1.3, 0.9, 0.9), coat));
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flat(0xb8906a)), 0.3, -0.05, 0));
  for (const z of [-0.1, 0.1]) head.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 5), coat), -0.05, 0.25, z));
  head.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.07), flat(MINES.ink)), 0.1, 0.06, 0.2), at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.07), flat(MINES.ink)), 0.1, 0.06, -0.2));
  head.position.set(0.85, 0.35, 0.1);
  head.rotation.z = -0.35;
  pony.add(head, at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.1), mane), 0.55, 0.62, 0.05, 0, 0, -0.5));
  pony.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 5), mane), -0.9, 0.35, 0, 0, 0, 1.9));
  for (const x of [-0.4, 0.4]) pony.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 5).rotateZ(Math.PI / 2), coat), x, 0.1, 0.4));
  pony.rotation.y = 0.2; // (lying still, asleep: it bakes with the stall; its snore says it breathes)
  g.add(pony);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.7 }));
  (ud(bubble).live = true), (bubble.name ||= "mines:ponyStall");
  g.add(bubble);
  animate((t) => {
    const u = (t * 0.3) % 1;
    bubble.scale.setScalar(swell(u, 1.58));
    bubble.position.set(1.25, 0.6 + u * 0.1, 0.35);
  });
  return g;
}

/**
 * A miners' camp: a canvas tent, a campfire (a ring of stones, logs, its
 * flame flickering and its smoke), crates and a barrel, a miner sitting by
 * the fire; its fire's point (for the caller's light and smoke).
 */
export function camp(rand: Rand) {
  const g = new THREE.Group();
  // the tent: an A of canvas on its ridge pole, a flap open
  const canvas = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 3, 1, true, Math.PI / 2, Math.PI * 2).rotateZ(Math.PI / 2).scale(1, 1.05, 1).translate(0, 0.72, 0);
  paint(canvas, (x, y, _z, c) => c.set(0xcbb892).multiplyScalar(0.8 + 0.2 * (y / 1.4) + 0.05 * Math.sin(x * 9)));
  const tent = new THREE.Group();
  tent.add(inked(canvas, relief()));
  tent.add(at(board(2.9, 0.08, 0.08, TIMBER_DARK), 0, 2.0, 0));
  for (const x of [-1.3, 1.3]) tent.add(at(board(0.08, 2.1, 0.08, TIMBER_DARK), x, 1, 0));
  tent.position.set(-1.6, 0, -1.2);
  tent.rotation.y = 0.3;
  g.add(tent);
  // the fire
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, st = boulder(rand, 0.2, 0.14, 0.18, 0);
    st.position.set(Math.cos(a) * 0.55, 0.06, Math.sin(a) * 0.55);
    g.add(st);
  }
  for (let k = 0; k < 3; k++) g.add(at(inked(wood(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6).rotateZ(Math.PI / 2), TIMBER_DARK), relief(), INK_THIN), 0, 0.12, 0, 0, (k * Math.PI) / 3, 0.25));
  const flame = new THREE.Group();
  flame.add(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 6).translate(0, 0.35, 0), FLAME_OUT), at(new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.45, 6).translate(0, 0.22, 0), FLAME_IN), 0, 0.02, 0));
  bakeLocal(flame);
  (ud(flame).live = true), (flame.name ||= "mines:camp");
  flame.position.y = 0.21; // (on its logs, over their tops: the flame's flicker never into them)
  g.add(flame);
  animate((t) => { flame.scale.set(1 + 0.08 * Math.sin(t * 11), 1 + 0.18 * Math.sin(t * 7.3) * Math.sin(t * 3.1), 1 + 0.08 * Math.cos(t * 9)); flame.rotation.y = t * 0.8; });
  g.add(at(crateStack(rand), 1.8, 0, -1.1, 0, 0.4));
  const b = barrel(rand);
  b.scale.setScalar(1.3);
  g.add(at(b, 1.3, 0, 0.9));
  const f = figure(rand, true);
  f.scale.setScalar(MAN);
  g.add(at(f, 0.2, 0.25, 1.1, 0, Math.PI));
  return { g, fire: new THREE.Vector3(0, 0.6, 0), smoke: new THREE.Vector3(0, 1.2, 0) };
}
const FLAME_OUT = share(new THREE.MeshBasicMaterial({ color: 0xff8a2a })), FLAME_IN = share(new THREE.MeshBasicMaterial({ color: 0xffe08a }));

// ------------------------------------------------------------ sites
//
// The cave dressed in places, not confetti (the owner): a few composed sites
// a hole, each a focus with its things gathered round it, at the other
// worlds' scale. Each builder's foot at 0, facing +z (the lane), about r
// across; what it lights (local points) and where its miners work.

/** A light a site gives: its point (local), colour, reach, strength, glow, a lamp's. */
interface SiteLight { p: THREE.Vector3; c: number; r: number; k: number; glow: number; lamp?: boolean }
export type SiteKind = "work" | "camp" | "mushrooms" | "stalagmites" | "collapse" | "druse" | "ore" | "lake";

/** A tunnel's mouth in a rock mass: a timber frame, the dark behind it; its
 *  size the kit's for the cart that runs into it (cartMouth: the load and a margin clear). */
function adit(rand: Rand, cartW: number) {
  const g = new THREE.Group(), { width: w, height: h } = cartMouth(cartW);
  g.add(at(boulder(rand, w + 1.0, h, 2.2, 1), 0, h / 2, -1.2));
  g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), ADIT_DARK), 0, h / 2, 0.72));
  for (const x of [-(w / 2 + 0.17), w / 2 + 0.17]) g.add(at(board(0.34, h + 0.4, 0.34, TIMBER_DARK), x, (h + 0.4) / 2, 0.8));
  g.add(at(board(w + 1.0, 0.4, 0.42, TIMBER), 0, h + 0.45, 0.8));
  return g;
}
const ADIT_DARK = share(new THREE.MeshBasicMaterial({ color: 0x0a0812 }));

/** A cart running up and down a track, eased at its ends: its group (live). */
function shuttleCart(rand: Rand, len: number, busy: boolean) {
  const c = oreCart(rand, true);
  c.g.scale.setScalar(1.25);
  const T = 9 + rand() * 4, ph = rand() * T;
  // (parked at the ore end when this is not the hole's busy site: it bakes with the rest)
  if (!busy) return (c.g.position.x = len / 2 - 1.4), c;
  bakeLocal(c.g);
  (ud(c.g).live = true), (c.g.name ||= "mines:shuttleCart");
  animate((t) => {
    const u = ((t + ph) % T) / T, v = u < 0.5 ? u * 2 : 2 - u * 2, e = v * v * (3 - 2 * v);
    c.g.position.x = -len / 2 + 1.4 + e * (len - 2.8);
    c.g.rotation.z = Math.sin(t * 9) * 0.01;
  });
  return c;
}

/** A site of the cave, composed round its focus (busy: its people and carts on the move, one site of a kind a hole). */
export function site(kind: SiteKind, rand: Rand, r: number, lamp: () => THREE.Object3D, hue: number, busy = true) {
  const g = new THREE.Group(), lights: SiteLight[] = [], crew: THREE.Vector3[] = [];
  const L = (p: THREE.Vector3, c: number, rr: number, k: number, glow: number, isLamp = false) => lights.push({ p, c, r: rr, k, glow, lamp: isLamp });
  const lampAt = (x: number, z: number) => {
    const b = bigLamp(lamp, Math.floor(rand() * 3));
    g.add(at(b.g, x, 0, z, 0, rand() * 6));
    for (const p of b.pts) L(p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), b.g.rotation.y).add(new THREE.Vector3(x, 0, z)), MINES.lantern, 6, 1, 3.2, true);
  };
  switch (kind) {
    case "work": {
      // a track from a tunnel mouth down to the ore it brought out, a cart running it
      const len = Math.min(10, r * 1.6);
      g.add(at(adit(rand, CART_W * 1.25), 0, 0, -len / 2 - 0.4, 0, 0)); // (its cart a size up: shuttleCart)
      const track = new THREE.Group(), rl = rails(len);
      track.add(rl, shuttleCart(rand, len, busy).g);
      g.add(at(track, 0, 0, 0, 0, Math.PI / 2));
      g.add(at(orePile(rand, 1.6), 1.2, 0, len / 2 + 0.6));
      g.add(at(toolRack(rand), -2.2, 0, len / 2 - 1.2, 0, 0.6));
      const sc = scaffold(rand);
      g.add(at(sc.g, -3.2, 0, -len / 2 + 1, 0, 0.3));
      const sl = lamp();
      sl.position.copy(sc.lamp);
      sc.g.add(sl);
      L(sc.lamp.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3).add(new THREE.Vector3(-3.2, 0.3, -len / 2 + 1)), MINES.lantern, 6, 0.9, 3, true);
      lampAt(2.2, -len / 2 + 1.2);
      crew.push(new THREE.Vector3(-0.2, 0, len / 2 + 1.9));
      break;
    }
    case "camp": {
      const c = camp(rand);
      g.add(c.g);
      L(c.fire, 0xff9a40, 6, 1.2, 3.4);
      g.add(at(board(1.6, 0.1, 0.4, TIMBER_LIGHT), -0.4, 0.42, 1.4), at(board(0.1, 0.4, 0.35, TIMBER_DARK), -1.0, 0.2, 1.4), at(board(0.1, 0.4, 0.35, TIMBER_DARK), 0.2, 0.2, 1.4));
      g.add(at(sleeper(rand), 2.6, 0, 1.4, 0, -0.6));
      const sh = shack(rand);
      g.add(at(sh.g, 1.8, 0, -3.4, 0, -0.3));
      L(sh.window.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.3).add(new THREE.Vector3(1.8, 0, -3.4)), MINES.lantern, 4, 0.8, 2.4, true);
      const pot = new THREE.Group();
      pot.add(inked(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).rotateX(Math.PI), flat(IRON_DARK), INK_THIN));
      for (const x of [-0.5, 0.5]) pot.add(at(board(0.06, 1.1, 0.06, TIMBER_DARK), x, 0.2, 0, 0, 0, x * -0.4));
      pot.add(at(board(1.2, 0.05, 0.05, TIMBER_DARK), 0, 0.75, 0));
      g.add(at(pot, 0, 0.45, 0));
      break;
    }
    case "mushrooms": {
      const f = mushroomForest(rand);
      g.add(f.g);
      for (const c of f.caps) L(c.p, c.hue, 4 + c.r * 2, 0.9, 2 + c.r * 1.8);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + rand(), d = r * (0.55 + rand() * 0.3), m = mushrooms(rand);
        m.g.scale.setScalar(1.4 + rand() * 0.6);
        g.add(at(m.g, Math.cos(a) * d, 0, Math.sin(a) * d, 0, rand() * 6));
        L(new THREE.Vector3(Math.cos(a) * d, 0.8, Math.sin(a) * d), m.hue, 2.6, 0.6, 1.5);
      }
      g.add(at(boulder(rand, 1.2, 0.8, 1, 1), -r * 0.3, 0.4, -r * 0.2));
      const m = mole(rand);
      m.scale.setScalar(1.8);
      g.add(at(m, r * 0.5, 0, r * 0.5));
      L(new THREE.Vector3(r * 0.5, 0.9, r * 0.5), MINES.lantern, 2.5, 0.8, 1.2, true);
      break;
    }
    case "lake": {
      // a still lake with its shore: crystals on its rocks, a mole at the water
      const l = lake(rand, r, r * 0.62);
      g.add(l.g);
      L(l.mid, 0x3fb8c8, r * 1.4, 0.6, 4);
      for (let k = 0; k < 3; k++) {
        const a = rand() * Math.PI * 2, o = outcrop(rand, 1 + rand() * 0.8, hue);
        g.add(at(o.g, Math.cos(a) * r * 1.08, 0, Math.sin(a) * r * 0.7));
        L(new THREE.Vector3(Math.cos(a) * r * 1.08, o.top * 0.6, Math.sin(a) * r * 0.7), o.hue, 3.5, 0.7, 2);
      }
      const m = mole(rand);
      m.scale.setScalar(1.8);
      g.add(at(m, -r * 0.9, 0, r * 0.55));
      L(new THREE.Vector3(-r * 0.9, 0.9, r * 0.55), MINES.lantern, 2.5, 0.8, 1.2, true);
      break;
    }
    case "stalagmites": {
      for (let k = 0; k < 9; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.8, h = 1.4 + rand() * 3.2 * (1 - d / r);
        g.add(at(stalagmites(rand, h), Math.cos(a) * d, 0, Math.sin(a) * d, 0, rand() * 6));
      }
      for (let k = 0; k < 6; k++) { const s0 = rand() * 0.4 + 0.3, st = boulder(rand, s0 * 1.3, s0 * 0.8, s0, 0); g.add(at(st, (rand() - 0.5) * r * 1.6, s0 * 0.3, (rand() - 0.5) * r * 1.6)); }
      break;
    }
    case "collapse": {
      // a rubble cone where the roof came down, broken props sticking out of it
      const cone = knobbly(new THREE.ConeGeometry(r * 0.55, r * 0.45, 12, 4).translate(0, r * 0.22, 0), rand, 0.25, 1.2);
      const seed = rand() * 9;
      paint(cone, (x, y, z, c) => strata(y + 0.2, x, z, r * 0.45, c, seed));
      g.add(facets(cone, relief()));
      for (let k = 0; k < 5; k++) {
        const a = rand() * Math.PI * 2, d = r * (0.1 + rand() * 0.3);
        g.add(at(board(0.28, 2.4 + rand(), 0.28, TIMBER_DARK), Math.cos(a) * d, r * 0.2, Math.sin(a) * d, (rand() - 0.5) * 1.6, rand() * 6, (rand() - 0.5) * 1.6));
      }
      for (let k = 0; k < 7; k++) { const s0 = 0.4 + rand() * 0.5, a = rand() * Math.PI * 2, d = r * (0.55 + rand() * 0.35); g.add(at(boulder(rand, s0 * 1.2, s0 * 0.8, s0, 0), Math.cos(a) * d, s0 * 0.3, Math.sin(a) * d)); }
      lampAt(r * 0.6, r * 0.3);
      break;
    }
    case "druse": {
      // a bed of crystal on low slabs of rock, glowing (low: seen over)
      for (let k = 0; k < 4; k++) {
        const a = rand() * Math.PI * 2, d = rand() * r * 0.5, s0 = 1 + rand() * 0.8;
        g.add(at(boulder(rand, s0 * 1.2, 0.3, s0, 1), Math.cos(a) * d, 0.1, Math.sin(a) * d));
      }
      for (let k = 0; k < 9; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.75, cl = crystalCluster(rand, 0.6 + rand() * 0.7, rand() < 0.8 ? hue : HUES[Math.floor(rand() * HUES.length)], 3 + Math.floor(rand() * 2));
        g.add(at(cl, Math.cos(a) * d, 0.25, Math.sin(a) * d, 0, rand() * 6));
      }
      L(new THREE.Vector3(0, 0.8, 0), hue, r * 1.5, 1, r * 0.8);
      break;
    }
    case "ore": {
      // the ore dump: piles by a stretch of track with a cart parked on it, barrels
      for (let k = 0; k < 2; k++) g.add(at(orePile(rand, 1.4 + rand() * 0.5), (k - 0.5) * 3, 0, -0.8 + rand() * 0.6));
      const track = new THREE.Group(), c = oreCart(rand, true);
      c.g.scale.setScalar(1.25);
      track.add(rails(8), c.g);
      g.add(at(track, 0, 0, 1.6));
      if (c.glow) L(c.glow.clone().multiplyScalar(1.25).add(new THREE.Vector3(0, 0, 1.6)), c.hue, 3.5, 0.9, 2.4);
      for (let k = 0; k < 3; k++) { const b = barrel(rand); b.scale.setScalar(1.4); g.add(at(b, r * 0.6 + (k % 2) * 0.9, 0, -1 + (k > 1 ? 0.9 : 0))); }
      lampAt(-r * 0.6, 0.4);
      if (busy) g.add(carriers(rand, new THREE.Vector3(-r * 0.7, 0, -2.4), new THREE.Vector3(r * 0.7, 0, -2.4)));
      break;
    }
  }
  // its edge filled: the things it gathers round it, and rock and rubble
  // grading it into the floor
  const PEOPLE: ReadonlySet<SiteKind> = new Set(["work", "camp", "ore", "collapse"]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rand() * 0.5, d = r * (0.75 + rand() * 0.3), x = Math.cos(a) * d, z = Math.sin(a) * d, pick = rand();
    if (kind === "lake") { const sr = 0.5 + rand() * 0.5, st = boulder(rand, sr, 0.35, 0.45, 0), k = 1.08 + (sr + 0.15) / r; g.add(at(st, Math.cos(a) * r * k, 0.1, Math.sin(a) * r * 0.62 * k)); continue; } // (on the bank, clear of its water: lake() is r by 0.62 r, 1.05 out at most)
    if (PEOPLE.has(kind) && pick < 0.45) {
      const m = pick < 0.15 ? crateStack(rand) : pick < 0.3 ? logPile(rand) : barrel(rand);
      if (pick >= 0.3) m.scale.setScalar(1.4);
      g.add(at(m, x, 0, z, 0, rand() * 6));
    } else if (kind === "mushrooms" && pick < 0.5) {
      const m = mushrooms(rand);
      m.g.scale.setScalar(1.2 + rand() * 0.6);
      g.add(at(m.g, x, 0, z, 0, rand() * 6));
      L(new THREE.Vector3(x, 0.7, z), m.hue, 2.4, 0.5, 1.2);
    } else {
      const s0 = 0.5 + rand() * 0.6;
      g.add(at(boulder(rand, s0 * 1.3, s0 * 0.7, s0, 0), x, s0 * 0.3, z, 0, rand() * 6));
    }
  }
  return { g, lights, crew };
}

