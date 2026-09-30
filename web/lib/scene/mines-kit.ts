// The Crystal Mines' shared kit (ADR-005 §6): the palette every mines module
// draws with, and what a hole of the mines is (its place, whether its
// gallery is dark). Dark around a lit lane: the darkness lives in the vault
// and the walls, never on the carpet. And the looks the world and its pieces
// share: the crystals' glowing material and a crystal cluster.
import * as THREE from "three";
import { flat, drawn, share, uTime, relief, hullOf } from "./materials";
import { prism } from "./crystal";
import { md } from "./data";
import type { Rand } from "./common";
import { CELL, mod } from "../terrain";

export const MINES = {
  vault: 0x15122b, vaultHi: 0x2a2350, // the cave dome, far walls, the CSS sky
  void: 0x07060d, // the dark down a drift, a shaft, a slot: nothing lit there
  basalt: 0x3b3450, umber: 0x5a4638, // rock: walls, berms, boulders
  slate: 0x566089, slateDark: 0x3a4062, rockHi: 0x6f6590, // the cave floor's blue slate, a lit rock face
  timber: 0x9a6536, timberDark: 0x74492a, iron: 0x4b4f5c, rust: 0x8a4a2c, brass: 0xc9a24a, rope: 0x9c7a4c, // props, sleepers, kerbs, rails
  carpet: 0xb68e5d, carpetDark: 0xae8757, carpetLit: 0xe0bd86, // the lane: packed ore dirt, the one warm bright ground; its lit edge
  cyan: 0x5ff3ff, amethyst: 0xb27cff, rose: 0xff8fc8, // crystal
  lava: 0xff4d1a, lavaHi: 0xffb23b, crust: 0x3a1a14,
  lantern: 0xffcf6b, glowworm: 0x8ff5d8,
  ink: 0x1a1320,
} as const;

// a mines hole's place and its dark galleries: in data.ts, so the game's own
// chunk (the HUD, the aim dots) reads them without the mines' kit
export { minesOrder, darkGallery } from "./data";

// ------------------------------------------------------------ crystals

let crystalM: THREE.MeshToonMaterial | null = null;
/** Every crystal of the hole a little brighter for a while: the singing crystals struck (mines-pieces.ts ring). */
export const lit = { value: 0 };
/**
 * The crystals' material: the toon bands over their vertex colours (a hue
 * each, paler to the tip), and a light of their own — an inner glow that
 * breathes slowly, each crystal on its own beat (by where it stands), and a
 * pale rim where a facet turns from the eye. It needs no light and no fog:
 * in the dark it is what lights the way. One material for every crystal of
 * a hole: one draw.
 */
export function crystalMat() {
  if (crystalM) return crystalM;
  const m = flat(0xffffff, { vertexColors: true });
  m.fog = false;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uLit = lit;
    sh.vertexShader = "varying vec3 vCrW;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vCrW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = "uniform float uTime;\nuniform float uLit;\nvarying vec3 vCrW;\n" + sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
  {
    float pulse = 0.5 + 0.5 * sin(uTime * 1.6 + vCrW.x * 0.9 + vCrW.z * 0.7 + vCrW.y * 0.5);
    float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
    totalEmissiveRadiance += (diffuseColor.rgb * (0.4 + 0.22 * pulse) + vec3(0.85, 0.97, 1.0) * rim * 0.35) * (1.0 + uLit);
  }`,
    );
  };
  m.customProgramCacheKey = () => "minesCrystal";
  md(m).hook = "minesCrystal";
  return (crystalM = share(m));
}

/** The crystals' hues: cyan most, amethyst, rose now and then. */
export const HUES = [MINES.cyan, MINES.cyan, MINES.amethyst, MINES.cyan, MINES.rose] as const;
const c0 = new THREE.Color(), c1 = new THREE.Color(), WHITE = new THREE.Color(0xffffff);
/** One crystal: crystal.ts's six-sided prism with its point, r wide and h
 *  tall, its foot at 0, coloured in hue from a deep foot to a pale tip. */
export function shard(r: number, h: number, hue: number) {
  const full = prism(r, h).toNonIndexed(), fp = full.attributes.position; // (flat facets)
  // without its foot's disc: it grows out of something, never seen from under
  const keep: number[] = [];
  for (let i = 0; i < fp.count; i += 3) if (!(Math.abs(fp.getY(i)) < 1e-4 && Math.abs(fp.getY(i + 1)) < 1e-4 && Math.abs(fp.getY(i + 2)) < 1e-4)) for (let j = 0; j < 3; j++) keep.push(fp.getX(i + j), fp.getY(i + j), fp.getZ(i + j));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(keep, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  const p = g.attributes.position, col = new Float32Array(p.count * 3), top = g.boundingBox!.max.y || 1;
  c0.set(hue).multiplyScalar(0.62);
  c1.set(hue).lerp(WHITE, 0.45);
  const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const k = Math.max(0, p.getY(i)) / top;
    // (each facet its own tone, from its facing: two at one height never the same)
    const f = 0.82 + 0.3 * (((Math.sin(nr.getX(i - (i % 3)) * 12.9898 + nr.getY(i - (i % 3)) * 78.233 + nr.getZ(i - (i % 3)) * 37.719) * 43758.5453) % 1 + 1) % 1);
    const c = c0.clone().lerp(c1, k * k).multiplyScalar(f);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * A cluster of crystals growing out of a point, its foot at 0: n shards
 * fanning out from a knot, the tallest in the middle, about `size` tall, in
 * one hue (a rose or an amethyst among cyan now and then). Inked; the
 * shards' feet sink a little so they grow out of whatever it stands on.
 */
export function crystalCluster(rand: Rand, size = 1, hue: number = HUES[Math.floor(rand() * HUES.length)], n = 4 + Math.floor(rand() * 4)) {
  const g = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const main = k === 0, a = (k / n) * Math.PI * 2 + rand() * 0.8, off = main ? 0 : (0.18 + rand() * 0.25) * size;
    const h = size * (main ? 1 : 0.35 + rand() * 0.5), r = size * (main ? 0.2 : 0.09 + rand() * 0.08);
    const other = !main && rand() < 0.15 ? HUES[Math.floor(rand() * HUES.length)] : hue;
    const s = drawn(shard(r, h, other), crystalMat());
    s.position.set(Math.cos(a) * off, -0.12 * size, Math.sin(a) * off);
    const lean = main ? rand() * 0.15 : 0.35 + rand() * 0.45;
    s.rotation.set(Math.sin(a) * lean, rand() * 6, -Math.cos(a) * lean);
    g.add(s);
  }
  return g;
}

/** An ore cart heaped with its load (mines-rides.ts oreCart: its tub's rim at 1.35, the ore and the crystals over it), how high it stands. */
export const CART_LOAD_H = 2.5;
/**
 * The mouth a cart W wide goes through, ride or decor: its timber set's
 * width (the legs and the second set take 0.6 of it, a margin of 0.2 either
 * side left clear) and height (the load's, and 0.4 over it). One size for
 * every tunnel a cart drives into (the owner: "enlarge the mouth").
 */
export const cartMouth = (cartW: number) => ({ width: cartW + 1.0, height: CART_LOAD_H + 0.4 });

/** The ground as drawn under a point: the terrain's mesh, a grid of CELL
 *  squares each split corner to corner, flat in each triangle (a laid surface
 *  on it hugs what is drawn, not the smooth height it samples). */
export function drawnGround(t: { height: (x: number, z: number) => number }, x: number, z: number) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL), fx = x / CELL - i, fz = z / CELL - j;
  const h = (a: number, b: number) => t.height((i + a) * CELL, (j + b) * CELL), h00 = h(0, 0), h11 = h(1, 1);
  return fz > fx ? h00 + fz * (h(0, 1) - h00) + fx * (h11 - h(0, 1)) : h00 + fx * (h(1, 0) - h00) + fz * (h11 - h(1, 0));
}

/** A distance field in place, a two-pass chamfer over an nx by nz grid of cells
 *  step apart: each cell's D (0 on what it is measured from, 1e4 elsewhere) the
 *  distance to the nearest 0, along the grid's rows, columns and diagonals. */
export function chamferField(D: Float32Array, nx: number, nz: number, step: number) {
  const a = step, d2 = step * Math.SQRT2;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (i) D[k] = Math.min(D[k], D[k - 1] + a);
      if (j) D[k] = Math.min(D[k], D[k - nx] + a, i ? D[k - nx - 1] + d2 : 1e4, i < nx - 1 ? D[k - nx + 1] + d2 : 1e4);
    }
  for (let j = nz - 1; j >= 0; j--)
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      if (i < nx - 1) D[k] = Math.min(D[k], D[k + 1] + a);
      if (j < nz - 1) D[k] = Math.min(D[k], D[k + nx] + a, i < nx - 1 ? D[k + nx + 1] + d2 : 1e4, i ? D[k + nx - 1] + d2 : 1e4);
    }
  return D;
}

// ------------------------------------------------------------ planks

/** Where a deck lies: which points its boards may cover, its top there, the
 *  box to fill, and the way its boards run (their long axis, radians from +x). */
export interface DeckSpan {
  inside: (x: number, z: number) => boolean;
  top: (x: number, z: number) => number;
  box: readonly [number, number, number, number];
  angle: number;
  /** how far either side of a row its top is taken (0.6 if not given; a ramp's boards across its slope: at their own edges) */
  reach?: number;
}

/**
 * Every deck of the mines, one way (the owner's: boards, not lines painted on a
 * sheet): boards a little apart (the dark or the water between them), each with
 * its thickness and its top edges bevelled, its own width, tone and a hair of
 * warp, laid in rows with their butt joints staggered, ragged where a row runs
 * out over the edge; nail pairs over each joist, its top in two strips of its
 * grain. All the spans' boards one geometry in the shared relief toon.
 */
export function planks(spans: readonly DeckSpan[], rand: Rand, { width = 0.46, gap = 0.04, thick = 0.08, tone = MINES.timber }: { width?: number; gap?: number; thick?: number; tone?: number } = {}) {
  const pos: number[] = [], col: number[] = [], nor: number[] = [], c = new THREE.Color(), base = new THREE.Color(tone);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const tri = (P: THREE.Vector3[], k: [number, number, number], cc: THREE.Color) => {
    a.copy(P[k[1]]).sub(P[k[0]]), b.copy(P[k[2]]).sub(P[k[0]]), n.crossVectors(a, b).normalize();
    for (const i of k) (pos.push(P[i].x, P[i].y, P[i].z), nor.push(n.x, n.y, n.z), col.push(cc.r, cc.g, cc.b));
  };
  for (const sp of spans) {
    const [x0, z0, x1, z1] = sp.box, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.hypot(x1 - x0, z1 - z0) / 2 + 0.5;
    const ux = Math.cos(sp.angle), uz = Math.sin(sp.angle), vx = -uz, vz = ux;
    const P = (u: number, v: number): [number, number] => [cx + ux * u + vx * v, cz + uz * u + vz * v];
    // (rows square to the lane's cells, when they run with them: a board then lies in one
    // column of cells, flat on what is drawn, never bent over a crease between two)
    const pitch = width + gap, sq = Math.abs(Math.sin(2 * sp.angle)) < 1e-6 && Math.abs(pitch - CELL) < 1e-6, o = cx * vx + cz * vz;
    const v0 = sq ? -R + mod(CELL / 2 - o + R, CELL) : -R;
    for (let v = v0; v <= R; v += pitch) {
      const w = width * (0.94 + rand() * 0.06), ok = (u: number) => [0, -w / 2 + 0.02, w / 2 - 0.02].every((e) => sp.inside(...P(u, v + e)));
      // the row's runs over the deck, board by board, their joints staggered
      let u = -R;
      while (u < R) {
        while (u < R && !ok(u)) u += 0.1;
        if (u >= R) break;
        let e = u;
        while (e < R && ok(e + 0.1)) e += 0.1;
        const lo = u - 0.02 - rand() * 0.07, hi = e + 0.02 + rand() * 0.07; // (ragged: each end its own, never more than 0.1 past the edge)
        let s0 = lo, first = true;
        while (hi - s0 > 0.3) {
          let L = Math.min(hi - s0, first ? 0.6 + rand() * 2.2 : 1.9 + rand() * 1.6);
          // (a board is flat: over a ground that bends (a ramp's foot) shorter ones, each true to it within a hair)
          // (along its middle and both its edges: a crease across its width bends it too)
          const yAt = (q: number, k: number) => sp.top(...P(Math.min(e, Math.max(q, u)), v + k * w * 0.5));
          while (L > 0.2 && [-1, 0, 1].some((k) => [0.25, 0.5, 0.75].some((f) => Math.abs(yAt(s0 + L * f, k) - (yAt(s0, k) * (1 - f) + yAt(s0 + L, k) * f)) > 0.005))) L *= 0.7;
          first = false;
          board(s0, s0 + (hi - s0 - L < 0.35 ? hi - s0 : L), v, w, u, e, !sp.inside(...P(s0 + L / 2, v - w / 2 - gap - 0.1)) || !sp.inside(...P(s0 + L / 2, v + w / 2 + gap + 0.1)));
          s0 += L + 0.02;
        }
        u = e + 0.2;
      }
    }
    // a board from along a to b in its row v, w wide (its top taken along the run's inside, u0..u1)
    function board(ua: number, ub: number, v: number, w: number, u0: number, u1: number, edge: boolean) {
      const L = ub - ua, warp = (rand() - 0.5) * 0.012, bev = Math.min(0.03, w * 0.1);
      c.copy(base).multiplyScalar(0.8 + 0.32 * rand()).offsetHSL((rand() - 0.5) * 0.02, (rand() - 0.5) * 0.06, 0);
      // (each corner at the ground's own height there: along the run's inside, across at the corner itself, or at the span's reach)
      const top = (u: number, e: number, inset: number): THREE.Vector3 => { const uu = u + (u > ua + L / 2 ? -inset : inset), [x, z] = P(uu, v + e * (w / 2 - inset)); return new THREE.Vector3(x, sp.top(...P(Math.min(u1, Math.max(u0, uu)), v + e * (sp.reach ?? w / 2 - inset))) + (u > ua + L / 2 ? warp : 0) * e, z); };
      const T = [top(ua, -1, bev), top(ub, -1, bev), top(ub, 1, bev), top(ua, 1, bev)];
      const B = [top(ua, -1, 0), top(ub, -1, 0), top(ub, 1, 0), top(ua, 1, 0)].map((q) => q.setY(q.y - 0.008)), F = B.map((q) => q.clone().setY(q.y - thick));
      const V = [...T, ...B, ...F];
      const dark = c.clone().multiplyScalar(0.72);
      // its top in two strips along it, each its own tone: the grain runs with the board
      const mid = (a: number, b: number) => a === b ? V[a] : V[a].clone().lerp(V[b], 0.5), M0 = mid(0, 3), M1 = mid(1, 2);
      const c2 = c.clone().multiplyScalar(0.9 + 0.12 * rand());
      tri([V[0], V[1], M1, M0], [0, 2, 1], c), tri([V[0], V[1], M1, M0], [0, 3, 2], c);
      tri([M0, M1, V[2], V[3]], [0, 2, 1], c2), tri([M0, M1, V[2], V[3]], [0, 3, 2], c2);
      // the bevel round the top, then the sides down to the underside
      // (a long side's face only at the deck's edge: between two boards the gap hides it)
      for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0]] as const) {
        tri(V, [p, q, q + 4], c), tri(V, [p, q + 4, p + 4], c);
        if (edge || p === 1 || p === 3) tri(V, [p + 4, q + 4, q + 8], dark), tri(V, [p + 4, q + 8, p + 8], dark);
      }
      // a nail pair over each joist (the joists under the whole deck, 1.4 apart: the nails in lines across the rows)
      for (let a = Math.ceil((ua + 0.15) / JOIST) * JOIST; a < ub - 0.15; a += JOIST)
        for (const e of [-0.55, 0.55]) {
          const [nx, nz] = P(a, v + e * w / 2), ny = sp.top(...P(Math.min(u1, Math.max(u0, a)), v + e * w / 2)) + 0.01, r = 0.025;
          const Q = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([du, dv]) => new THREE.Vector3(nx + ux * du + vx * dv, ny, nz + uz * du + vz * dv));
          tri(Q, [0, 2, 1], NAIL), tri(Q, [0, 3, 2], NAIL);
        }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  // (no ink: the gaps draw each board's outline; a hull round hundreds of boards doubled their cost.
  // The shared relief toon: the boards bake with the rest of the timber, no draw of their own)
  return new THREE.Mesh(geo, relief());
}
const NAIL = new THREE.Color(0x2a2733), JOIST = 1.4;

// ------------------------------------------------------------ lanterns

/** A lantern: an iron frame round a lit glass, a little roof and a ring to
 *  hang it by; its foot at 0 (hung: from its ring). Every lantern of the
 *  mines, the world's and the rides': one glass, dimmed at once (lanternsLit). */
export function lantern(scale = 1) {
  const g = new THREE.Group();
  const iron = flat(MINES.iron);
  const base = drawn(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 8), iron, hullOf(0.03, MINES.ink));
  base.position.y = 0.03;
  const glass = new THREE.Mesh(GLASS_GEO, GLASS);
  glass.position.y = 0.23;
  const roof = drawn(new THREE.ConeGeometry(0.24, 0.2, 8), iron, hullOf(0.03, MINES.ink));
  roof.position.y = 0.5;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 3, 6), iron);
  ring.position.y = 0.66;
  g.add(base, glass, roof, ring);
  for (let k = 0; k < 4; k++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), iron);
    bar.position.set(Math.cos((k * Math.PI) / 2 + 0.785) * 0.17, 0.23, Math.sin((k * Math.PI) / 2 + 0.785) * 0.17);
    g.add(bar);
  }
  g.scale.setScalar(scale);
  return g;
}
// the lanterns' glass: its colour in its own material (vertex coloured white:
// the bake keeps it apart, so "Lights out" can dim every lantern at once)
export const GLASS = share(new THREE.MeshBasicMaterial({ color: MINES.lantern, vertexColors: true })), DEAD_GLASS = new THREE.Color(0x3a2a18);
/** Every lantern's glass lit (k 1) to dead (k 0): "Lights out", a dark gallery (mines.ts cv.lamps). */
export const lanternsLit = (k: number) => GLASS.color.setHex(MINES.lantern).lerp(DEAD_GLASS, 1 - k);
const GLASS_GEO = share((() => {
  const geo = new THREE.CylinderGeometry(0.15, 0.15, 0.34, 8);
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
})());

/**
 * A part built along its own z (a beam w x h x the length, a rod or a post
 * turned onto z) set from a to b: its middle between them, its z along a to b.
 * The mines' one "timber (rod, post) from a to b".
 */
export function between<O extends THREE.Object3D>(o: O, a: THREE.Vector3, b: THREE.Vector3): O {
  o.position.copy(a).lerp(b, 0.5);
  o.lookAt(b);
  return o;
}
