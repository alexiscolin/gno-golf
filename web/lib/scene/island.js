// The "island" world: the board on a sandy island in a warm sea. Same four
// functions as garden.js (the contract is in worlds.js). No grass round the
// field, no forest: sand, dunes, palms, the gnomes' straw huts shaped like
// mushrooms, and turquoise water to the horizon.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, flat, drawn, grows, sway, swayLine, rbox, lanternGlow, share, hullOf, fadeable, fadeLoop } from "./materials.js";
import { inZone } from "../terrain.js";
import { mergeByMaterial } from "./course.js";
import { animate } from "./state.js";
import { timeOf, islandBox } from "./camera.js";
import { seeded, ISLAND, GRASS } from "./common.js";
import { zoneDetail } from "./zones.js";

// A flat layer lying on another: pulled towards the eye in the depth test, so
// at a distance it never shimmers against what it lies on
const onTop = (m, k = 1) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1 * k, polygonOffsetUnits: -4 * k });
const topMats = new Map();
const flatTop = (color) => {
  let m = topMats.get(color);
  if (!m) topMats.set(color, (m = share(onTop(flat(color, {})))));
  return m;
};

// two-sided materials, one per colour like flat()'s, so the bake can merge them
const dsides = new Map();
const dside = (color) => {
  let m = dsides.get(color);
  if (!m) dsides.set(color, (m = share(flat(color, { side: THREE.DoubleSide }))));
  return m;
};

// the palette of a beach, inked like the rest
const P = {
  sand: 0xf0d9a0, sandHi: 0xf7e6ba, wet: 0xd4b77e, under: 0xc7b489,
  shallow: 0x5fd0cc, deep: 0x2489b3,
  straw: 0xe0b964, strawDark: 0xc49a4a, trunk: 0xa47a4c, trunkDark: 0x8a6238,
  frond: 0x3f9b62, frondDark: 0x2f7d4f, rock: 0x8f8a80, shell: 0xf6d2c4,
  crab: 0xe2553e, hibiscus: 0xe8456b, towel: 0x4bb3e0, stripe: 0xffffff,
};

/** How high the sea is: a step below the sand, so the beach slopes into it. */
export const SEA = GRASS - 0.9;

// ---------------------------------------------------------------- the land
//
// The island is a rounded rectangle a little larger than the diorama's box,
// with a wobbly shore. inland(x, z) is how far a point is inside the shore
// (negative: in the sea), in world units — dunes, the beach and the foam all
// read from it.

function shape(s) {
  const box = islandBox(s.board);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const a = (box.max.x - box.min.x) / 2 + 1.5, b = (box.max.z - box.min.z) / 2 + 1.5;
  const rand = seeded("shore" + s.hole);
  const ph = [rand() * 6, rand() * 6, rand() * 6];
  const wob = (th) => 0.035 * Math.sin(3 * th + ph[0]) + 0.025 * Math.sin(5 * th + ph[1]) + 0.015 * Math.sin(9 * th + ph[2]);
  const N = 6; // squareness: a board is long and flat, so is its island
  const rho = (x, z) => {
    const u = (x - cx) / a, v = (z - cz) / b;
    return Math.pow(Math.pow(Math.abs(u), N) + Math.pow(Math.abs(v), N), 1 / N) / (1 + wob(Math.atan2(v, u)));
  };
  const inland = (x, z) => (1 - rho(x, z)) * Math.min(a, b);
  // a point on the shore, for foam and shells: θ round the island
  const shore = (th, off = 0) => {
    const c = Math.cos(th), sn = Math.sin(th);
    const u = Math.sign(c) * Math.pow(Math.abs(c), 2 / N), v = Math.sign(sn) * Math.pow(Math.abs(sn), 2 / N);
    const k = 1 + wob(Math.atan2(v, u));
    const x = cx + u * a * k, z = cz + v * b * k;
    // pushed off the shore, outward (+) or inland (-), along the radius
    const dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
    return [x + (dx / l) * off, z + (dz / l) * off];
  };
  return { box, cx, cz, a, b, inland, shore };
}

const smooth = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v));

/** The sea, and the sand shelving into it under the water. */
function base(s) {
  const g = new THREE.Group();
  const sh = shape(s);
  // the sea: a wide disc, turquoise over the shallows, deep blue further out,
  // and it fades into the sky at the horizon (the sky is the page's, behind)
  const R = 300, rings = 36, segs = 72;
  const pos = [], col = [], idx = [];
  const shallow = new THREE.Color(P.shallow), deep = new THREE.Color(P.deep), c = new THREE.Color();
  for (let i = 0; i <= rings; i++) {
    // denser near the island, where the colour changes
    const r = R * Math.pow(i / rings, 2.2);
    for (let j = 0; j < segs; j++) {
      const th = (j / segs) * Math.PI * 2;
      const x = sh.cx + Math.cos(th) * (r + Math.min(sh.a, sh.b) * 0.3), z = sh.cz + Math.sin(th) * (r + Math.min(sh.a, sh.b) * 0.3);
      pos.push(x, SEA, z);
      const off = -sh.inland(x, z); // how far out to sea
      c.copy(shallow).lerp(deep, smooth(off / 14));
      const fade = 1 - smooth((r - 110) / 150);
      col.push(c.r, c.g, c.b, (0.72 + 0.28 * smooth(off / 8)) * fade); // opaque by 8 out: the seabed ends unseen
    }
  }
  // and a centre patch under the island, so no hole shows through
  const centre = pos.length / 3;
  pos.push(sh.cx, SEA, sh.cz);
  col.push(shallow.r, shallow.g, shallow.b, 0.75);
  for (let j = 0; j < segs; j++) idx.push(centre, (j + 1) % segs, j); // facing up, like the rings
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < segs; j++) {
      const a0 = i * segs + j, a1 = i * segs + ((j + 1) % segs), b0 = a0 + segs, b1 = a1 + segs;
      idx.push(a0, b1, b0, a0, a1, b1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  geo.setIndex(idx);
  const seaMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  // the swell: long low waves rolling towards the island, none right at its shore
  // the hole's centre and calm radius are uniforms: one program for every hole
  const swell = { value: 0 }, seaCentre = { value: new THREE.Vector2(sh.cx, sh.cz) }, calm = { value: Math.min(sh.a, sh.b) };
  seaMat.onBeforeCompile = (sh2) => {
    Object.assign(sh2.uniforms, { uSwell: swell, uCentre: seaCentre, uCalm: calm });
    sh2.vertexShader = "uniform float uSwell;\nuniform vec2 uCentre;\nuniform float uCalm;\n" + sh2.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  float d = length(transformed.xz - uCentre);
  transformed.y += sin(d * 0.35 - uSwell * 1.4) * 0.12 * smoothstep(uCalm + 4.0, uCalm + 14.0, d);`
    );
  };
  seaMat.customProgramCacheKey = () => "swell";
  animate((t) => (swell.value = t));
  const sea = new THREE.Mesh(geo, seaMat);
  sea.renderOrder = -1;
  g.add(sea);

  // waves: foam crests rolling in from 4 out to the shore, one after another,
  // brightest as they break; then the swash, a thin sheet running up the
  // sand and sliding back
  const loop = (off) => {
    const pts = [];
    for (let k = 0; k <= 140; k++) {
      const [x, z] = sh.shore((k / 140) * Math.PI * 2, off);
      pts.push(new THREE.Vector3(x, SEA + 0.04, z));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  };
  const R0 = Math.min(sh.a, sh.b);
  const crests = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(loop(0), 280, 0.14, 4, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    m.scale.y = 0.25;
    m.userData.live = true;
    g.add(m);
    return m;
  });
  // the swash: a ring of pale water just inland of the waterline
  const swashGeo = (() => {
    const pos = [], idx = [], N = 160;
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI * 2;
      const [xo, zo] = sh.shore(th, 0.2), [xi, zi] = sh.shore(th, -1.3);
      pos.push(xo, SEA + 0.05, zo, xi, SEA + 0.35, zi);
      if (k) idx.push(2 * k - 2, 2 * k, 2 * k - 1, 2 * k - 1, 2 * k, 2 * k + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    return geo;
  })();
  const swash = new THREE.Mesh(swashGeo, onTop(new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 2));
  swash.userData.live = true;
  g.add(swash);
  const around = (m, k) => {
    m.scale.x = m.scale.z = k;
    m.position.x = sh.cx * (1 - k);
    m.position.z = sh.cz * (1 - k);
  };
  const PERIOD = 4.5;
  animate((t) => {
    crests.forEach((m, i) => {
      const u = ((t / PERIOD + i / 3) % 1); // 0 far out, 1 at the shore
      around(m, 1 + ((1 - u) * 4) / R0);
      m.position.y = 0;
      m.material.opacity = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.25 + 0.6 * u);
    });
    // runs up as each crest breaks, then slides back
    const u = (t / PERIOD * 3) % 1;
    const run = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
    around(swash, 1 - (run * 0.5) / R0);
    swash.material.opacity = 0.45 * run;
  });
  return g;
}

/** Shells, pebbles and starfish along the beach. */
function edging(box, seed) {
  const g = new THREE.Group();
  const rand = seeded("shells" + seed);
  // the same island the berms draw, rebuilt from the hole's box
  const s = { board: { w: box.max.x - ISLAND.x, h: box.max.z - ISLAND.front }, hole: seed };
  const sh = shape(s);
  const height = land(s, sh);
  for (let i = 0; i < 26; i++) {
    const [x, z] = sh.shore(rand() * Math.PI * 2, -0.6 - rand() * 1.4);
    if (x > -0.5 && x < s.board.w + 0.5 && z > -0.5 && z < s.board.h + 0.5) continue;
    const y = GRASS + height(x, z);
    const k = rand();
    const m = k < 0.35 ? starfish(rand) : k < 0.7 ? shell(rand) : pebble(rand);
    m.position.set(x, y + 0.03, z);
    m.rotation.y = rand() * Math.PI * 2;
    g.add(m);
  }
  return g;
}

// the sand's height above GRASS: dunes inland, the beach shelving to the sea
function land(s, sh) {
  const W = s.board.w, H = s.board.h;
  const rand = seeded("dunes" + s.hole);
  const dunes = [];
  // a few long soft dunes behind and beside the board, none in front of it
  for (let k = 0; k < 7; k++) {
    const side = k % 3; // back, right, left
    const x = side === 0 ? -2 + rand() * (W + 4) : side === 1 ? W + 3 + rand() * 3 : -3 - rand() * 3;
    const z = side === 0 ? -3.5 - rand() * 5 : rand() * H;
    dunes.push({ x, z, rx: 3 + rand() * 4, rz: 1.8 + rand() * 1.6, h: 0.6 + rand() * 1.1, a: rand() * Math.PI });
  }
  return (x, z) => {
    const inn = sh.inland(x, z);
    // the beach: GRASS 3 inland of the shore, sea level at the shore, and on down
    const beach = inn >= 3 ? 0 : (SEA - GRASS) * (1 - smooth(inn / 3)) + (inn < 0 ? inn * 0.6 : 0);
    const dx = Math.max(0, -x, x - W), dz = Math.max(0, -z, z - H);
    const near = smooth((Math.hypot(dx, dz) - 1.2) / 2); // flat by the board
    let top = 0;
    for (const d of dunes) {
      const cs = Math.cos(d.a), sn = Math.sin(d.a);
      const u = ((x - d.x) * cs + (z - d.z) * sn) / d.rx, v = (-(x - d.x) * sn + (z - d.z) * cs) / d.rz;
      const q = u * u + v * v;
      if (q < 1) top = Math.max(top, d.h * (1 - q) * (1 - q));
    }
    return beach + top * near * smooth((inn - 2) / 3);
  };
}

/** The sand round the board: dunes, the beach, the shelf under the water. */
function berms(s) {
  const sh = shape(s);
  const height = land(s, sh);
  const W = s.board.w, H = s.board.h;
  const g = new THREE.Group();
  // out to where the sea is opaque (8 off the shore), so the seabed never shows an edge
  const X0 = sh.cx - sh.a - 10, X1 = sh.cx + sh.a + 10, Z0 = sh.cz - sh.b - 10, Z1 = sh.cz + sh.b + 10;
  const step = 0.8, nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step); // dunes are soft: a coarse grid holds them
  const pos = [], col = [], idx = [];
  const sand = new THREE.Color(P.sand), hi = new THREE.Color(P.sandHi), wet = new THREE.Color(P.wet), under = new THREE.Color(P.under), c = new THREE.Color();
  // where the chain has the sea inside the board (a lane with no rails, the
  // sea all round it), the sand under the board goes under water too
  const seas = s.zones.filter((q) => q.kind === "hazard" && q.skin === "sea");
  // a boardwalk hole stands over a lagoon: the sand round its lane is under water
  const boardwalk = green(s) === "planks";
  const inLag = boardwalk ? lagoonShape(s) : null;
  const drowned = (x, z) => seas.some((q) => inZone(q, x, z));
  const keep = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * step, z = Z0 + j * step;
      // the sand shelves into the lagoon over its last unit and a half
      const lg = boardwalk ? inLag(x, z) : -1;
      const base = drowned(x, z) ? SEA - 1 - GRASS : height(x, z);
      const h = lg > 0 ? base + (SEA - 0.6 - GRASS - base) * smooth(lg / 1.5) : base, y = GRASS + h;
      pos.push(x, y, z);
      keep.push(-sh.inland(x, z) < 9);
      if (y < SEA - 0.02) c.copy(under);
      else if (y < SEA + 0.35) c.copy(wet).lerp(sand, (y - SEA) / 0.35); // the wet band at the water's edge
      else c.copy(sand).lerp(hi, Math.min(1, Math.max(0, h) / 1.4)); // dune tops paler
      col.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      // under the board too: sand, not the sea, shows in any gap of its ground
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      if (!keep[a] && !keep[b] && !keep[d] && !keep[e]) continue;
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // pushed back in the depth test: where the board's rough meets it at the
  // same height, the board's ground always wins and nothing shimmers
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 6 })));
  return { group: g, height };
}

// ----------------------------------------------------------------- props

// A coconut palm, built as merged geometry so a beach of them stays cheap:
// a trunk of tapering segments along a curve that bends more towards the top
// (the wind's work), a crown of arching fronds with leaflets, coconuts.
const Y = new THREE.Vector3(0, 1, 0);
const mat4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3();
const place = (geo, pos, dir, sx = 1, sy = 1, sz = 1) => {
  q4.setFromUnitVectors(Y, dir.clone().normalize());
  return geo.applyMatrix4(mat4.compose(pos, q4, s4.set(sx, sy, sz)));
};

/** The trunk's curve: up, then leaning `lean` radians by the top, towards `toward`. */
function trunkCurve(h, lean, toward) {
  const pts = [];
  let p = new THREE.Vector3();
  const n = 12;
  for (let i = 0; i <= n; i++) {
    pts.push(p.clone());
    const k = i / n, a = lean * Math.pow(k, 1.6); // the curve grows towards the top
    p = p.clone().add(new THREE.Vector3(toward.x * Math.sin(a), Math.cos(a), toward.z * Math.sin(a)).multiplyScalar(h / n));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function trunkGeometry(curve, r0 = 0.3) {
  const geos = [], ring = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = curve.getPoint(i / n), b = curve.getPoint((i + 1) / n), k = i / n;
    const r = r0 * (1 - 0.4 * k);
    const seg = new THREE.CylinderGeometry(r * 0.9, r, a.distanceTo(b) * 1.04, 6);
    geos.push(place(seg, a.clone().lerp(b, 0.5), b.clone().sub(a)));
    // a ring at each joint: segmented bark
    ring.push(place(new THREE.TorusGeometry(r * 0.95, 0.045, 3, 8).rotateX(Math.PI / 2), b, b.clone().sub(a)));
  }
  return { bark: mergeGeometries(geos), rings: mergeGeometries(ring) };
}

/** A crown of broad arching fronds round `top`: each a long blade that
 *  droops, widest a third of the way out, its edge notched into leaflets,
 *  with a darker midrib along it. Two leaf colours alternate. */
function crownGeometry(rand, top, n = 8, size = 1) {
  const rachis = [], leaves = [[], []];
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + rand() * 0.35;
    const len = (2.4 + rand() * 0.7) * size, rise = 0.3 + rand() * 0.2, droop = 1.3 + rand() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    const at = (t) => top.clone().addScaledVector(dir, len * t).setY(top.y + len * (rise * t - droop * 0.5 * t * t));
    const N = 8, pos = [], idx = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N, p = at(t);
      // half-width: swelling then tapering to a point, notched every other station
      const w = len * 0.26 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (k % 2 ? 0.72 : 1);
      // the blade folds down along its midrib, a little V
      const l = p.clone().addScaledVector(side, -w).setY(p.y - w * 0.35), r = p.clone().addScaledVector(side, w).setY(p.y - w * 0.35);
      pos.push(l.x, l.y, l.z, p.x, p.y + 0.02, p.z, r.x, r.y, r.z);
      if (k) {
        const b = (k - 1) * 3;
        idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5);
      }
      if (k < N && k % 2 === 0) { // the midrib, in half as many pieces
        const q = at(Math.min(1, (k + 2) / N));
        rachis.push(place(new THREE.CylinderGeometry(0.03 * size, 0.05 * size, p.distanceTo(q) * 1.05, 3), p.clone().lerp(q, 0.5).setY((p.y + q.y) / 2 + 0.03), q.clone().sub(p)));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    leaves[f % 2].push(geo);
  }
  return { rachis: mergeGeometries(rachis), leaves: leaves.map((l) => mergeGeometries(l)) };
}

function coconuts(g, top, n = 3) {
  const geos = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.1 + 0.4;
    geos.push(new THREE.SphereGeometry(0.19, 7, 5).translate(top.x + Math.cos(a) * 0.24, top.y - 0.28, top.z + Math.sin(a) * 0.24));
  }
  g.add(drawn(mergeGeometries(geos), flat(0x6b4a2b)));
}

// a leaf blade: seen from above and below, with its ink edge
const leafMats = new Map();
function leafMesh(geo, color) {
  let m = leafMats.get(color);
  if (!m) leafMats.set(color, (m = dside(color)));
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, m));
  // the outline is collected: decor() (or piece()) draws all of them as one set of lines
  const e = new THREE.EdgesGeometry(geo, 40);
  g.updateMatrixWorld();
  leafLines.push({ e, owner: g });
  return g;
}
// it sways with the leaves it outlines, or the outline would stay behind
const leafInk = share(swayLine(C.ink));
let leafLines = [];
/** All the leaf outlines made since the last call, in world space, as one mesh. */
function flushLeafLines(root) {
  if (!leafLines.length) return;
  root.updateMatrixWorld(true);
  const geos = leafLines.map(({ e, owner }) => e.applyMatrix4(owner.matrixWorld));
  leafLines = [];
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const lines = new THREE.LineSegments(mergeGeometries(geos).applyMatrix4(inv), leafInk);
  root.add(lines);
}

/** A standing palm: a gentle wind lean, its crown over its own footprint. */
function palm(rand, h = 4.5 + rand() * 2.5) {
  const g = new THREE.Group();
  const a = rand() * Math.PI * 2;
  const curve = trunkCurve(h, 0.2 + rand() * 0.25, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  const { bark, rings } = trunkGeometry(curve, 0.24 + rand() * 0.06);
  g.add(grows(bark, P.trunk), grows(rings, P.trunkDark));
  const top = curve.getPoint(1);
  const cr = crownGeometry(rand, top, 7 + Math.floor(rand() * 3), 0.8);
  g.add(new THREE.Mesh(cr.rachis, sway(P.trunkDark)));
  for (const [k, geo] of cr.leaves.entries()) g.add(leafMesh(geo, k ? P.frond : P.frondDark));
  coconuts(g, top);
  g.userData.top = top;
  return g;
}

/** A gnome's beach hut: a thatched mushroom cap on a stout pale stem, a round door. */
function paillote(rand, big = 1) {
  const g = new THREE.Group();
  const r = 1.0 * big, hgt = 1.6 * big;
  const body = drawn(new THREE.CylinderGeometry(r * 0.88, r, hgt, 14), flat(C.cream));
  body.position.y = hgt / 2;
  // the straw cap: a dome with a fringe hanging from its rim
  const cap = drawn(new THREE.SphereGeometry(r * 1.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(P.straw));
  cap.scale.y = 0.62;
  cap.position.y = hgt - 0.05;
  const fringe = drawn(new THREE.CylinderGeometry(r * 1.76, r * 1.86, 0.32 * big, 16, 1, true), dside(P.strawDark));
  fringe.position.y = hgt - 0.12;
  const tip = drawn(new THREE.ConeGeometry(0.16 * big, 0.5 * big, 6), flat(P.strawDark));
  tip.position.y = hgt + r * 1.08 + 0.15;
  g.add(body, cap, fringe, tip);
  // a round door and a round window, facing the lane (+z)
  const door = drawn(new THREE.CylinderGeometry(0.34 * big, 0.34 * big, 0.08, 14), flat(P.trunkDark));
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 0.52 * big, r * 0.96);
  const win = drawn(new THREE.CylinderGeometry(0.18 * big, 0.18 * big, 0.06, 12), flat(0xffe39a));
  win.rotation.x = Math.PI / 2;
  win.position.set(r * 0.55, 1.05 * big, r * 0.78);
  win.rotation.y = 0.6;
  g.add(door, win);
  return g;
}

/** A tiki bar in the same style: a counter under a straw mushroom cap on four poles. */
function tikiBar() {
  const g = new THREE.Group();
  const bar = drawn(rbox(2.4, 0.9, 0.8, 0.12), flat(P.trunk));
  bar.position.set(0, 0.45, 0.6);
  const top = drawn(rbox(2.6, 0.12, 1, 0.05), flat(P.trunkDark));
  top.position.set(0, 0.95, 0.6);
  g.add(bar, top);
  for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 1.0], [1.2, 1.0]]) {
    const pole = drawn(new THREE.CylinderGeometry(0.09, 0.11, 2.3, 7), flat(P.trunkDark));
    pole.position.set(x, 1.15, z);
    g.add(pole);
  }
  const cap = drawn(new THREE.SphereGeometry(2.2, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2), flat(P.straw));
  cap.scale.y = 0.5;
  cap.position.set(0, 2.25, 0.2);
  const fringe = drawn(new THREE.CylinderGeometry(2.21, 2.3, 0.3, 16, 1, true), dside(P.strawDark));
  fringe.position.set(0, 2.15, 0.2);
  g.add(cap, fringe);
  // three coconut cups on the counter
  for (let i = 0; i < 3; i++) {
    const cup = drawn(new THREE.SphereGeometry(0.13, 8, 6), flat(0x6b4a2b));
    cup.position.set(-0.6 + i * 0.6, 1.1, 0.7);
    g.add(cup);
  }
  return g;
}

/** A lighthouse on its rocks: a striped tower, a railed gallery, a glazed
 *  lamp room under a red cap, and after dusk a beam turning over the sea. */
function lighthouse(night = false, away = 0) {
  const g = new THREE.Group();
  for (const [x, z, r] of [[0, 0, 2.4], [1.9, 0.6, 1.5], [-1.6, 0.9, 1.7], [0.6, -1.6, 1.3]]) {
    const m = drawn(new THREE.DodecahedronGeometry(r, 0), flat(P.rock));
    m.position.set(x, r * 0.3, z);
    m.scale.y = 0.6;
    g.add(m);
  }
  const bands = 6, bh = 1.2; // about 1.3× the first one: the whole tower fits the overview
  for (let i = 0; i < bands; i++) {
    const r0 = 1.25 - i * 0.08, r1 = 1.25 - (i + 1) * 0.08;
    const band = drawn(new THREE.CylinderGeometry(r1, r0, bh, 18), flat(i % 2 ? P.stripe : C.cap));
    band.position.y = 1.2 + i * bh + bh / 2;
    g.add(band);
  }
  const top = 1.2 + bands * bh;
  const door = drawn(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12, 1, false, 0, Math.PI), flat(P.trunkDark));
  door.rotation.x = Math.PI / 2;
  door.position.set(0, 1.9, 1.22);
  g.add(door);
  // the gallery: a wide deck with a railing
  const deck = drawn(new THREE.CylinderGeometry(1.15, 0.8, 0.25, 18), flat(C.ink));
  deck.position.y = top + 0.12;
  const rail = drawn(new THREE.TorusGeometry(1.1, 0.04, 4, 24), flat(C.cream));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = top + 0.75;
  g.add(deck, rail);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2, bal = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), flat(C.cream));
    bal.position.set(Math.cos(a) * 1.1, top + 0.45, Math.sin(a) * 1.1);
    g.add(bal);
  }
  // the lamp room: glass between posts, the lamp inside
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  glass.position.y = top + 0.85;
  const lamp = drawn(new THREE.SphereGeometry(0.32, 12, 8), flat(0xffe39a));
  lamp.position.y = top + 0.85;
  g.add(glass, lamp);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, post = drawn(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), flat(C.ink));
    post.position.set(Math.cos(a) * 0.62, top + 0.85, Math.sin(a) * 0.62);
    g.add(post);
  }
  const cap = drawn(new THREE.ConeGeometry(0.85, 0.9, 16), flat(C.cap));
  cap.position.y = top + 1.85;
  const knob = drawn(new THREE.SphereGeometry(0.12, 8, 6), flat(C.ink));
  knob.position.y = top + 2.35;
  g.add(cap, knob);
  g.userData.lamp = new THREE.Vector3(0, top + 0.85, 0);
  if (night) {
    // the beam: a long pale cone from the lamp, turning
    const beam = new THREE.Group();
    beam.userData.live = true;
    // tilted a little up, so it never sweeps through the lane at eye height
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 26, 16, 1, true).translate(0, -13, 0).rotateZ(Math.PI / 2 - 0.12), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.add(cone);
    beam.position.y = top + 0.85;
    g.add(beam);
    g.userData.live = true;
    // it turns 
    // it sweeps to and fro over the open sea, never round over the island
    animate((tt) => (beam.rotation.y = away + Math.sin(tt * 0.5) * 1.0));
  }
  return g;
}

function umbrella(rand) {
  const g = new THREE.Group();
  const pole = drawn(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6), flat(C.cream));
  pole.position.y = 1.05;
  pole.rotation.z = 0.12;
  const colors = [[C.cap, P.stripe], [P.towel, P.stripe], [0xf5b83d, P.stripe]][Math.floor(rand() * 3)];
  const canopy = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const m = drawn(new THREE.ConeGeometry(1.2, 0.5, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4), dside(colors[i % 2]));
    canopy.add(m);
  }
  canopy.position.set(0.12, 2.1, 0);
  const towel = drawn(rbox(0.8, 0.04, 1.6, 0.02), flatTop(colors[0]));
  towel.position.set(0.9, 0.07, 0.2);
  towel.rotation.y = 0.3;
  g.add(pole, canopy, towel);
  return g;
}

function sandcastle(rand) {
  const g = new THREE.Group();
  const base = drawn(rbox(1.2, 0.5, 1.2, 0.08), flat(P.wet));
  base.position.y = 0.25;
  g.add(base);
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const tower = drawn(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 8), flat(P.wet));
    tower.position.set(x, 0.4, z);
    const roof = drawn(new THREE.ConeGeometry(0.24, 0.3, 8), flat(P.wet));
    roof.position.set(x, 0.95, z);
    g.add(tower, roof);
  }
  const keep = drawn(new THREE.CylinderGeometry(0.3, 0.34, 1.1, 8), flat(P.wet));
  keep.position.y = 0.8;
  const flag = drawn(new THREE.PlaneGeometry(0.3, 0.2), dside(C.cap));
  flag.position.set(0.15, 1.65, 0);
  const stick = drawn(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), flat(P.trunkDark));
  stick.position.y = 1.55;
  g.add(keep, flag, stick);
  return g;
}

function hibiscus(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = grows(new THREE.IcosahedronGeometry(0.35 + rand() * 0.2, 1), P.frond);
    b.position.set((rand() - 0.5) * 0.7, 0.3, (rand() - 0.5) * 0.6);
    g.add(b);
  }
  for (let i = 0; i < 4; i++) {
    const f = grows(new THREE.SphereGeometry(0.11, 6, 4), rand() < 0.7 ? P.hibiscus : 0xf5b83d);
    f.position.set((rand() - 0.5) * 0.8, 0.55 + rand() * 0.2, (rand() - 0.5) * 0.7);
    g.add(f);
  }
  return g;
}

/** Dune grass, in the sand's own colours: the only "green" out here is the palms. */
function duneGrass(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const b = grows(new THREE.ConeGeometry(0.05, 0.6 + rand() * 0.4, 3), rand() < 0.5 ? 0xc9b06a : 0xb99d58);
    b.position.set((rand() - 0.5) * 0.35, 0.3, (rand() - 0.5) * 0.35);
    b.rotation.set((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
    g.add(b);
  }
  return g;
}

function rock(rand) {
  const m = drawn(new THREE.DodecahedronGeometry(0.5 + rand() * 0.7, 0), flat(rand() < 0.5 ? P.rock : 0x77746c));
  m.rotation.set(rand(), rand(), rand());
  m.scale.y = 0.65;
  m.position.y = 0.3;
  return m;
}

function starfish(rand) {
  const g = new THREE.Group();
  const col = rand() < 0.5 ? 0xf08a4b : 0xe8656b;
  for (let i = 0; i < 5; i++) {
    const arm = drawn(new THREE.ConeGeometry(0.07, 0.3, 4), flat(col));
    arm.rotation.z = Math.PI / 2;
    const p = new THREE.Group();
    arm.position.x = 0.14;
    p.add(arm);
    p.rotation.y = (i / 5) * Math.PI * 2;
    g.add(p);
  }
  g.scale.y = 0.4;
  return g;
}

function shell(rand) {
  const m = drawn(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), flat(rand() < 0.5 ? P.shell : C.cream));
  m.scale.set(1, 0.5, 1.3);
  return m;
}

function pebble(rand) {
  const m = drawn(new THREE.DodecahedronGeometry(0.12 + rand() * 0.1, 0), flat(P.rock));
  m.scale.y = 0.5;
  return m;
}

/** A crab that scuttles sideways along the sand, back and forth. */
function crab(rand, x, z, y) {
  const g = new THREE.Group();
  g.userData.live = true;
  const body = drawn(new THREE.SphereGeometry(0.22, 10, 6), flat(P.crab));
  body.scale.set(1.3, 0.55, 1);
  body.position.y = 0.14;
  g.add(body);
  for (const s of [-1, 1]) {
    const claw = drawn(new THREE.SphereGeometry(0.09, 6, 5), flat(P.crab));
    claw.position.set(s * 0.26, 0.16, 0.2);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), flat(C.ink));
    eye.position.set(s * 0.07, 0.3, 0.14);
    g.add(claw, eye);
  }
  g.position.set(x, y, z);
  const ph = rand() * 6, span = 0.6 + rand() * 0.8;
  animate((t) => {
    g.position.x = x + Math.sin(t * 0.7 + ph) * span;
    g.position.y = y + Math.abs(Math.sin(t * 9 + ph)) * 0.025;
  });
  return g;
}

// Gulls are instanced: every bird is the same four meshes — its body (white,
// a yellow beak, by vertex colour), the body's ink, and the two halves of a
// wing — each one InstancedMesh for the whole flock, posed every frame.
const colored = (geo, hex) => {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
};
const GULL = (() => {
  const body = mergeGeometries([
    colored(new THREE.SphereGeometry(0.16, 9, 7).scale(1.7, 0.85, 0.9), 0xffffff),
    colored(new THREE.SphereGeometry(0.1, 7, 5).translate(0.26, 0.08, 0), 0xffffff),
    colored(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(-Math.PI / 2).translate(0.39, 0.06, 0), 0xf5b83d),
    colored(new THREE.ConeGeometry(0.1, 0.2, 3).rotateZ(Math.PI / 2).scale(1, 0.3, 1).translate(-0.3, 0.02, 0), 0xffffff),
  ]);
  // a wing half for the right side (+z); the left is the same, mirrored
  const inner = colored(new THREE.BoxGeometry(0.26, 0.02, 0.42).translate(0, 0, 0.21), 0xd6dbde);
  const outer = mergeGeometries([
    colored(new THREE.BoxGeometry(0.2, 0.02, 0.4).translate(-0.03, 0, 0.2), 0xd6dbde),
    colored(new THREE.BoxGeometry(0.14, 0.021, 0.14).translate(-0.05, 0, 0.42), 0x3a4046),
  ]);
  return { body, inner, outer };
})();
const gullInk = hullOf(); // the shared ink hull, for the instanced flock

function gulls(rand, cx, cz, n = 4, perches = []) {
  const g = new THREE.Group();
  g.userData.live = true;
  const flocks = [0, 1].map(() => ({ r: 9 + rand() * 12, y: 12 + rand() * 3, ph: rand() * 6, sp: (0.1 + rand() * 0.08) * (rand() < 0.5 ? -1 : 1) }));
  const fliers = Array.from({ length: n + 2 }, (_, i) => ({ f: flocks[i % 2], dr: (rand() - 0.5) * 3, dy: (rand() - 0.5) * 1.2, lag: i * 0.12, ph: rand() * 6 }));
  const sitters = perches.slice(0, 3).map((pt) => ({ at: pt.clone().add(new THREE.Vector3(0, 0.12, 0)), turn: rand() * Math.PI * 2, ph: rand() * 6 }));
  const N = fliers.length + sitters.length;
  const mat = flat(0xffffff, { vertexColors: true });
  const wingMat = flat(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
  const mk = (geo, m, k) => { const im = new THREE.InstancedMesh(geo, m, N * k); im.frustumCulled = false; g.add(im); return im; };
  const body = mk(GULL.body, mat, 1), bodyInk = mk(GULL.body, gullInk, 1);
  const inner = mk(GULL.inner, wingMat, 2), outer = mk(GULL.outer, wingMat, 2);
  const B = new THREE.Matrix4(), M = new THREE.Matrix4(), T = new THREE.Matrix4(), R = new THREE.Matrix4(), S = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3();
  // bird k at matrix B, wings raised `up` (inner) and bent `bend` (outer) — or folded
  const pose = (k, up, bend) => {
    body.setMatrixAt(k, B);
    bodyInk.setMatrixAt(k, B);
    for (const sg of [1, -1]) {
      S.makeScale(1, 1, sg); // the left wing: the right one mirrored
      T.makeTranslation(0.02, 0.06, 0);
      R.makeRotationX(-sg * up);
      M.copy(B).multiply(T).multiply(R).multiply(S);
      inner.setMatrixAt(2 * k + (sg > 0 ? 0 : 1), M);
      T.makeTranslation(0, 0, 0.42);
      R.makeRotationX(sg * bend * sg); // (in the mirrored frame the bend is the same sign)
      M.multiply(T).multiply(R);
      outer.setMatrixAt(2 * k + (sg > 0 ? 0 : 1), M);
    }
  };
  animate((t) => {
    fliers.forEach(({ f, dr, dy, lag, ph }, k) => {
      const a = (t - lag) * f.sp + f.ph, r = f.r + dr;
      v.set(cx + Math.cos(a) * r, f.y + dy + Math.sin(t * 0.7 + ph) * 0.3, cz - 5 + Math.sin(a) * r * 0.6);
      q.setFromEuler(e.set(0, -a - (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2), f.sp > 0 ? 0.25 : -0.25, "YXZ"));
      B.compose(v, q, one.setScalar(1.4));
      // a few beats, then a long glide on flat wings
      const cycle = (t * 0.6 + ph) % 3, up = cycle < 1 ? 0.15 + Math.sin(cycle * Math.PI * 6) * 0.35 : 0.15;
      pose(k, up, 0.2 + up * 0.45);
    });
    sitters.forEach(({ at, turn, ph }, i) => {
      const k = fliers.length + i;
      B.compose(v.copy(at).setY(at.y + Math.max(0, Math.sin(t * 1.3 + ph)) * 0.02), q.setFromEuler(e.set(0, turn, 0)), one.setScalar(1));
      pose(k, -0.25, -2.6); // folded along the body
    });
    for (const im of [body, bodyInk, inner, outer]) im.instanceMatrix.needsUpdate = true;
  });
  return g;
}

/** A small boat tied to the pier, rocking. */
function boat() {
  const g = new THREE.Group();
  g.userData.live = true;
  const hull = drawn(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(C.cap));
  hull.scale.set(1.5, 0.45, 0.6);
  const rim = drawn(new THREE.TorusGeometry(1, 0.06, 5, 20), flat(C.cream));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.5, 0.6, 1);
  const seat = drawn(rbox(0.2, 0.06, 1.0, 0.02), flat(P.trunk));
  seat.position.y = -0.12;
  g.add(hull, rim, seat);
  return g;
}

function pier(len) {
  const g = new THREE.Group();
  for (let i = 0; i < len; i++) {
    const plank = drawn(rbox(0.36, 0.1, 1.6, 0.03), flat(i % 2 ? C.wood : C.woodDark));
    plank.position.set(i * 0.42, 0, 0);
    g.add(plank);
  }
  for (let i = 0; i < len; i += 3)
    for (const s of [-1, 1]) {
      const post = drawn(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), flat(P.trunkDark));
      post.position.set(i * 0.42, -0.55, s * 0.7);
      g.add(post);
    }
  return g;
}

/** A far island: a low green-topped hump with palm silhouettes, out at sea. */
function farIsle(rand, r) {
  const g = new THREE.Group();
  const sand = drawn(new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(P.sand));
  sand.scale.y = 0.25;
  g.add(sand);
  for (let i = 0; i < 3; i++) {
    const p = palm(rand, 3 + rand());
    p.position.set((rand() - 0.5) * r, r * 0.18, (rand() - 0.5) * r * 0.4);
    g.add(p);
  }
  return g;
}

function ship() {
  const g = new THREE.Group();
  g.userData.live = true;
  const hull = drawn(rbox(4, 0.9, 1.3, 0.3), flat(P.trunkDark));
  hull.position.y = 0.3;
  const mast = drawn(new THREE.CylinderGeometry(0.07, 0.09, 4, 6), flat(P.trunk));
  mast.position.y = 2.4;
  const sail = drawn(new THREE.PlaneGeometry(2, 2.4), dside(C.cream));
  sail.position.set(0, 2.6, 0.08);
  g.add(hull, mast, sail);
  return g;
}

// ------------------------------------------------------- over the lane
//
// The dream of the island: tall palms whose trunks curve in from the sides and
// hang their crowns high over the lane, giant hibiscus on the dunes, kites,
// gulls gliding low. They cross the play camera's view on purpose — but a
// crown between the camera and the ball fades, so the shot stays readable.
// Each fading piece owns its materials; decor's group carries fade(eye, ball),
// which the engine calls every frame.

// an ink outline that can fade with its solid (the shared one cannot)
// materials a canopy palm can fade (materials.js fadeLoop): its own, not
// the shared palette's, which every palm on the island draws with
function fader(colors) {
  const mats = Object.fromEntries(colors.map((c) => [c, fadeable(new THREE.MeshToonMaterial({ color: c }))]));
  const ink = fadeable(hullOf().clone());
  return { mat: (c) => mats[c], ink, all: [...Object.values(mats), ink] };
}

/** A tall wind-bent palm rooted off the lane, its crown high over it. */
function archPalm(rand, toward, reach, h, fd) {
  const g = new THREE.Group();
  g.userData.live = true;
  // from its foot to its crown it leans `reach` over `h`; the bend is all near
  // the top (x ∝ k²), as a wind-bent beach palm grows
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    pts.push(new THREE.Vector3(toward.x * reach * k * k, h * k, toward.z * reach * k * k));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const { bark, rings } = trunkGeometry(curve, 0.32);
  g.add(new THREE.Mesh(bark, fd.mat(P.trunk)), new THREE.Mesh(bark, fd.ink), new THREE.Mesh(rings, fd.mat(P.trunkDark)));
  const top = curve.getPoint(1);
  const crown = new THREE.Group();
  const cr = crownGeometry(rand, new THREE.Vector3(), 9, 1.15);
  for (const c of [P.frondDark, P.frond]) fd.mat(c).side = THREE.DoubleSide;
  crown.add(new THREE.Mesh(cr.rachis, fd.mat(P.trunkDark)), new THREE.Mesh(cr.leaves[0], fd.mat(P.frondDark)), new THREE.Mesh(cr.leaves[1], fd.mat(P.frond)));
  crown.add(new THREE.Mesh(mergeGeometries([0, 1, 2, 3].map((i) => new THREE.SphereGeometry(0.2, 7, 5).translate(Math.cos(i * 1.7) * 0.26, -0.3, Math.sin(i * 1.7) * 0.26))), fd.mat(P.trunkDark)));
  crown.position.copy(top);
  g.add(crown);
  g.userData.crown = crown;
  g.userData.reach = Math.hypot(top.x, top.z);
  return g;
}

/** A hibiscus as big as a gnome's house, on a dune. */
function giantHibiscus(rand) {
  const g = new THREE.Group();
  const stem = grows(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 6), P.frondDark);
  stem.position.y = 1.2;
  stem.rotation.z = (rand() - 0.5) * 0.3;
  g.add(stem);
  const head = new THREE.Group();
  head.position.set(0, 2.5, 0);
  head.rotation.x = -0.9; // opening up and towards the lane
  const col = rand() < 0.6 ? P.hibiscus : rand() < 0.5 ? 0xf5b83d : 0xf29ac0;
  for (let i = 0; i < 5; i++) {
    const petal = grows(new THREE.SphereGeometry(1, 10, 6), col);
    petal.scale.set(0.9, 0.08, 0.55);
    const a = (i / 5) * Math.PI * 2;
    petal.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
    petal.rotation.y = -a;
    head.add(petal);
  }
  const pistil = grows(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), 0xffe39a);
  pistil.position.y = 0.4;
  head.add(pistil);
  for (let i = 0; i < 2; i++) {
    const leaf = grows(new THREE.SphereGeometry(1, 8, 4), P.frond);
    leaf.scale.set(0.9, 0.06, 0.4);
    leaf.position.set(i ? 0.5 : -0.5, 0.9 + i * 0.4, 0);
    leaf.rotation.z = i ? -0.5 : 0.5;
    g.add(leaf);
  }
  g.add(head);
  return g;
}

/** A kite high over the beach, swaying on its line, its tail hanging. */
function kite(rand, color) {
  const g = new THREE.Group();
  const shape = new THREE.Shape([new THREE.Vector2(0, 0.7), new THREE.Vector2(0.45, 0), new THREE.Vector2(0, -0.9), new THREE.Vector2(-0.45, 0)]);
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), flat(color)));
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), flat(i % 2 ? 0xffffff : color));
    b.position.set(Math.sin(i * 0.9) * 0.12 * (i + 1), -1.1 - i * 0.35, 0);
    g.add(b);
  }
  const k = mergedMover(g);
  const ph = rand() * 6;
  animate((t) => (k.rotation.z = Math.sin(t * 0.8 + ph) * 0.15));
  return k;
}

/** A whole object that moves as one, merged into a mesh per material by the
 *  shared bake, and marked live so the hole's own bake leaves it be. */
function mergedMover(group) {
  mergeByMaterial(group);
  group.userData.live = true;
  return group;
}

// ------------------------------------------------------------ beach life

const STRIPES = [[C.cap, 0xffffff], [P.towel, 0xffffff], [0xf5b83d, C.cap], [0x5b6fb5, 0xf5b83d], [0x3fbf8f, 0xffffff], [0xf29ac0, 0xffffff]];

/** A towel in bright stripes, flat on the sand. */
function towel(rand) {
  const g = new THREE.Group();
  const [a, b] = STRIPES[Math.floor(rand() * STRIPES.length)];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.34), flatTop(i % 2 ? b : a));
    m.position.set(0, 0.06, -0.68 + i * 0.34);
    g.add(m);
  }
  return g;
}
/** A gnome sunbathing on his towel, hat over his eyes. */
function sunbather(rand) {
  const g = towel(rand);
  const body = drawn(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8).rotateX(Math.PI / 2), flat([0x5b6fb5, C.leaf, 0xf5b83d][Math.floor(rand() * 3)]));
  body.position.set(0, 0.2, 0.15);
  const face = drawn(new THREE.SphereGeometry(0.16, 10, 8), flat(C.cream));
  face.position.set(0, 0.2, -0.45);
  const hat = drawn(new THREE.ConeGeometry(0.17, 0.42, 10).rotateX(-Math.PI / 2), flat(C.cap));
  hat.position.set(0, 0.26, -0.72);
  g.add(body, face, hat);
  return g;
}
function flipflops() {
  const g = new THREE.Group();
  for (const x of [-0.12, 0.12]) {
    const m = drawn(new THREE.CapsuleGeometry(0.07, 0.16, 2, 6).rotateX(Math.PI / 2).scale(1, 0.25, 1), flat(C.cap));
    m.position.set(x, 0.02, 0);
    m.rotation.y = x * 2;
    g.add(m);
  }
  return g;
}
function coolBox() {
  const g = new THREE.Group();
  const box = drawn(rbox(0.7, 0.45, 0.45, 0.06), flat(P.towel));
  box.position.y = 0.23;
  const lid = drawn(rbox(0.74, 0.1, 0.49, 0.04), flat(0xffffff));
  lid.position.y = 0.5;
  g.add(box, lid);
  return g;
}
const ballInk = hullOf(0);
function beachBall() {
  const g = new THREE.Group();
  const cols = [C.cap, 0xffffff, 0xf5b83d, 0xffffff, P.towel, 0xffffff];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, (i / 6) * Math.PI * 2, Math.PI / 3), flat(cols[i]));
    g.add(m);
  }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), ballInk));
  g.children[g.children.length - 1].scale.setScalar(1.06);
  g.position.y = 0.3;
  const w = new THREE.Group();
  w.add(g);
  return w;
}
function surfboards(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
    const m = drawn(new THREE.CapsuleGeometry(0.22, 1.4, 3, 10).scale(1, 1, 0.18), flat(STRIPES[Math.floor(rand() * STRIPES.length)][0]));
    m.position.set(i * 0.55 - 0.4, 0.8, 0);
    m.rotation.z = (rand() - 0.5) * 0.3;
    g.add(m);
  }
  return g;
}
function volleyNet() {
  const g = new THREE.Group();
  for (const x of [-2.2, 2.2]) {
    const pole = drawn(new THREE.CylinderGeometry(0.06, 0.07, 2.2, 6), flat(P.trunk));
    pole.position.set(x, 1.1, 0);
    g.add(pole);
  }
  const net = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.7, 16, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
  net.position.y = 1.75;
  const band = drawn(rbox(4.4, 0.08, 0.04, 0.02), flat(0xffffff));
  band.position.y = 2.1;
  g.add(net, band);
  const ball = beachBall();
  ball.scale.setScalar(0.6);
  ball.position.set(1.2, 0, 1.1);
  g.add(ball);
  return g;
}
function rockPool(rand) {
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), flat(P.shallow));
  water.scale.set(1, 1, 0.7);
  water.position.y = 0.03;
  g.add(water);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, r = drawn(new THREE.DodecahedronGeometry(0.25 + rand() * 0.2, 0), flat(P.rock));
    r.position.set(Math.cos(a) * 1.1, 0.1, Math.sin(a) * 0.8);
    r.scale.y = 0.6;
    g.add(r);
  }
  const sf = starfish(rand);
  sf.position.set(0.3, 0.05, 0.1);
  g.add(sf);
  return g;
}
function driftwood(rand) {
  const g = new THREE.Group();
  const log = drawn(new THREE.CylinderGeometry(0.14, 0.18, 2 + rand(), 7).rotateZ(Math.PI / 2), flat(0xb7a58d));
  log.position.y = 0.14;
  const branch = drawn(new THREE.CylinderGeometry(0.05, 0.08, 0.7, 5), flat(0xb7a58d));
  branch.position.set(0.4, 0.3, 0.1);
  branch.rotation.set(0.6, 0, 0.8);
  g.add(log, branch);
  return g;
}
function wreckPlank(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = drawn(rbox(2.2 - i * 0.5, 0.1, 0.3, 0.03), flat(i % 2 ? C.woodDark : 0x7a5a3a));
    m.position.set(i * 0.2, 0.06 + i * 0.05, i * 0.34);
    m.rotation.y = (rand() - 0.5) * 0.5;
    g.add(m);
  }
  const ribs = drawn(new THREE.TorusGeometry(0.8, 0.07, 5, 10, Math.PI), flat(0x7a5a3a));
  ribs.position.set(-0.6, 0, -0.6);
  g.add(ribs);
  return g;
}
function coconutPile(rand) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const nut = drawn(new THREE.SphereGeometry(0.18, 8, 6), flat(0x6b4a2b));
    const layer = i < 4 ? 0 : 1, a = i * 1.6;
    nut.position.set(Math.cos(a) * (layer ? 0.1 : 0.25), 0.16 + layer * 0.26, Math.sin(a) * (layer ? 0.1 : 0.25));
    g.add(nut);
  }
  return g;
}
/** A line of seaweed left by the tide, along the shore. */
function seaweedLine(sh, rand, th0, bank) {
  const g = new THREE.Group();
  for (let k = 0; k < 18; k++) {
    const [x, z] = sh.shore(th0 + k * 0.035, -0.9 + Math.sin(k * 0.9) * 0.15);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 3).scale(1.6, 0.15, 0.8), flat(0x3d6b3a));
    m.position.set(x, GRASS + bank(x, z) + 0.06, z);
    m.rotation.y = rand() * 3;
    g.add(m);
  }
  return g;
}
/** Footprints across the sand, from somewhere to the water. */
function footprints(from, to, y) {
  const g = new THREE.Group();
  const d = to.clone().sub(from), n = Math.floor(d.length() / 0.45), side = new THREE.Vector3(-d.z, 0, d.x).normalize();
  const mat = onTop(new THREE.MeshBasicMaterial({ color: 0xc8ad74 }));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8).rotateX(-Math.PI / 2).scale(0.7, 1, 1.2), mat);
    m.position.copy(from).addScaledVector(d, i / n).addScaledVector(side, i % 2 ? 0.1 : -0.1);
    m.position.y = y(m.position.x, m.position.z) + 0.05;
    m.rotation.y = -Math.atan2(d.z, d.x);
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------- decor

function decor(s, bank = () => 0) {
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  const rand = seeded(s.name + s.hole + "isle");
  const sh = shape(s);
  const time = timeOf(s.hole);

  const taken = [];
  const free = (x, z, r) => taken.every((t) => Math.hypot(t.x - x, t.z - z) >= t.r + r);
  const reserve = (x, z, r) => taken.push({ x, z, r });
  // the board and its kerb, which stands a little outside it
  const onBoard = (x, z, r = 0) => x > -1.2 - r && x < W + 1.2 + r && z > -1.2 - r && z < H + 1.2 + r;
  // on the sand, off the beach's slope — and not in a boardwalk's lagoon
  const wetBoard = green(s) === "planks";
  const inLag = wetBoard ? lagoonShape(s) : null;
  const dry = (x, z, r) => sh.inland(x, z) > 2.2 + r && !(wetBoard && inLag(x, z) > -1 - r);
  // and clear of every wall: a lane's kerb can stand past the board's edge
  const byWall = (x, z, r) => s.walls.some((w) => {
    const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (z - w.a[1]) * dz) / l2));
    return Math.hypot(x - w.a[0] - u * dx, z - w.a[1] - u * dz) < r + 1;
  });
  const put = (m, x, z, r, turn = rand() * Math.PI * 2) => {
    m.position.set(x, GRASS + bank(x, z), z);
    m.rotation.y = turn;
    g.add(m);
    reserve(x, z, r);
    return m;
  };
  // n tries at a random spot in a rectangle, for things of footprint r
  // clear: how far from the board it must stand (a palm's fronds reach out)
  const scatter = (n, x0, x1, z0, z1, r, make, turn, clear = r) => {
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 10; k++) {
        const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
        if (onBoard(x, z, clear) || byWall(x, z, clear) || !dry(x, z, r * 0.3) || !free(x, z, r)) continue;
        put(make(), x, z, r, turn);
        break;
      }
  };
  const X0 = sh.cx - sh.a, X1 = sh.cx + sh.a, Z0 = sh.cz - sh.b;
  const perches = []; // where a gull may stand: the pier, the lighthouse rocks

  // the canopy: palms rooted just off the lane's long sides, curving in over it
  const fading = [];
  // two or three per hole, from behind (the camera's far side)
  const arches = 2 + (rand() < 0.5 ? 1 : 0);
  for (let k = 0; k < arches; k++) {
    const x = W * ((k + 0.5) / arches) + (rand() - 0.5) * 3, z = -2.8 - rand() * 0.6;
    if (!dry(x, z, 0) || byWall(x, z, 1) || !free(x, z, 1.2)) continue;
    const fd = fader([P.trunk, P.trunkDark, P.frond, P.frondDark]);
    // tall enough that its lean carries the crown a third of the way over the
    // lane, and the crown then hangs well above the kerb
    // tall enough that the lean carries the crown over the middle of the lane:
    // how far a unit-high trunk reaches is measured on its own curve
    // the crown over the middle of the lane; a foot-to-crown lean of 45-55°
    const want = -z + H * (0.42 + rand() * 0.12);
    const h = want / Math.tan(THREE.MathUtils.degToRad(45 + rand() * 10));
    const p = archPalm(rand, new THREE.Vector3(0, 0, 1), want, h, fd);
    p.position.set(x, GRASS + bank(x, z), z);
    g.add(p);
    reserve(x, z, 1.4);
    const ph = rand() * 6, crown = p.userData.crown;
    animate((t) => (crown.rotation.z = Math.sin(t * 0.9 + ph) * 0.05, crown.rotation.x = Math.cos(t * 0.7 + ph) * 0.04));
    p.updateMatrixWorld(true);
    fading.push({ at: crown.getWorldPosition(new THREE.Vector3()), r: 2.5, mats: fd.all });
  }
  // behind the board, the gnomes' beach village: straw mushroom huts in a row,
  // the tiki bar among them, all facing the lane
  const huts = 2 + Math.floor(rand() * 2);
  for (let k = 0; k < huts; k++) {
    const x = W * (0.25 + (0.5 * k) / Math.max(1, huts - 1)) + (rand() - 0.5) * 3, z = -5 - rand() * 2;
    const big = 0.8 + rand() * 0.35;
    if (dry(x, z, 2) && free(x, z, 2 * big)) {
      put(paillote(rand, big), x, z, 2 * big, (rand() - 0.5) * 0.4);
      perches.push(new THREE.Vector3(x, GRASS + bank(x, z) + (1.6 + 1.75 * 0.62 + 0.05) * big, z)); // the top of its straw cap
    }
  }
  {
    const x = W * 0.5 + (rand() - 0.5) * 4, z = -3.4;
    if (dry(x, z, 2.2) && free(x, z, 2.4)) {
      put(tikiBar(), x, z, 2.4, (rand() - 0.5) * 0.3);
      for (const dx of [-2.9, 2.9]) if (free(x + dx, z, 0.5)) put(coconutPile(rand), x + dx, z, 0.5);
    }
  }
  // the lighthouse on its rocks, off the back-right corner, half in the sea
  {
    // on the right-hand shore, back a little: tall, it must stay in the frame
    // past the board's right end, a little behind it: the overview frames the
    // island's box, and a tower there stays inside it whatever the board's shape
    const x = W + ISLAND.x - 2.6, z = Math.min(H * 0.4, 5);
    // the beam lies along +x at rotation 0; rotation.y = θ turns it to
    // (cos θ, -sin θ): this θ points it away from the island, out to sea
    const lh = lighthouse(time !== "day", Math.atan2(-(z - sh.cz), x - sh.cx));
    lh.position.set(x, SEA, z);
    g.add(lh);
    if (time !== "day") {
      const glow = new THREE.Sprite(lanternGlow());
      glow.scale.set(6, 6, 1);
      glow.position.set(x, SEA + lh.userData.lamp.y, z);
      g.add(glow);
    }
    reserve(x, z, 3.2);
    perches.push(new THREE.Vector3(x + 1.9, SEA + 0.9, z + 0.6));
  }
  // a pier off the back-left shore, a boat tied to it
  {
    const th = -Math.PI * 0.72;
    const [x0, z0] = sh.shore(th, -1.2), [x1, z1] = sh.shore(th, 5);
    const len = Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.42);
    const p = pier(len);
    p.position.set(x0, GRASS - 0.25, z0);
    p.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    g.add(p);
    const b = mergedMover(boat());
    const bx = x1 + Math.cos(th + Math.PI / 2) * 1.5, bz = z1 + Math.sin(th + Math.PI / 2) * 1.5;
    b.position.set(bx, SEA + 0.1, bz);
    b.rotation.y = p.rotation.y;
    g.add(b);
    animate((t) => {
      b.rotation.z = Math.sin(t * 1.2) * 0.06;
      b.position.y = SEA + 0.1 + Math.sin(t * 1.5) * 0.05;
    });
    perches.push(new THREE.Vector3(x1, GRASS - 0.2, z1), new THREE.Vector3((x0 + x1) / 2, GRASS - 0.2, (z0 + z1) / 2));
    for (let k = 0; k <= 6; k++) reserve(x0 + ((x1 - x0) * k) / 6, z0 + ((z1 - z0) * k) / 6, 1);
  }
  // a hammock between two palms, on the right
  {
    const x = W + 4.4, z = H * 0.3;
    if (dry(x, z, 2) && free(x, z, 2.4) && free(x, z + 4.6, 2.4)) {
      const a = put(palm(rand, 4.2), x, z, 2.2, 0), b = put(palm(rand, 4.4), x, z + 4.6, 2.2, 0);
      const pa = a.position.clone().setY(a.position.y + 1.4), pb = b.position.clone().setY(b.position.y + 1.4);
      const mid = pa.clone().lerp(pb, 0.5).setY(pa.y - 0.6);
      const net = drawn(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pa, mid, pb), 12, 0.16, 6, false), flat(P.towel));
      net.scale.set(1, 1, 1);
      g.add(net);
    }
  }
  // palms: many, tall, behind and to the right; a few low leaning ones left
  // (a palm's crown is two wide each way: that is its footprint)
  // lots of them: the back row, the right side, the far left, and along the shore
  scatter(16, X0 + 1, X1 - 1, Z0 + 1, -2.2, 2.4, () => palm(rand), 0, 2.8);
  scatter(8, W + 1.8, X1, -2, H + 3, 2.4, () => palm(rand), 0, 2.8);
  scatter(5, X0, -2, -3, H * 0.7, 2.2, () => palm(rand, 3 + rand()), 0, 2.8);
  for (let k = 0; k < 14; k++) {
    const [x, z] = sh.shore(-Math.PI + (k / 14) * Math.PI, -2.6); // the back half of the shore
    if (!onBoard(x, z, 2.8) && free(x, z, 2.2)) put(palm(rand, 3.5 + rand() * 2), x, z, 2.2, 0);
  }
  // the beach itself: umbrellas and a sandcastle to the sides, low things in front
  // the beach's life: every hole draws its own mix from this, seeded by its id,
  // so walking the eighteen is not one beach eighteen times
  const KIT = [
    () => scatter(1, W + 2, X1 - 2, -2, H + 2, 2.6, () => volleyNet(), rand() * 0.6 - 0.3, 3),
    () => scatter(1, X0 + 1.5, X1 - 1.5, H + 1.8, sh.cz + sh.b - 3, 1.4, () => rockPool(rand), undefined, 1.8),
    () => scatter(2, X0 + 1, X1 - 1, Z0 + 2, -2.5, 0.8, () => surfboards(rand), 0),
    () => scatter(1, X0 + 1, X1 - 1, H + 1.8, sh.cz + sh.b - 2.5, 1.4, () => wreckPlank(rand)),
    () => scatter(3, X0, X1, H + 1.6, sh.cz + sh.b - 2.4, 1.1, () => driftwood(rand)),
    () => scatter(1, X0 + 1, -1.5, H * 0.3, H + 2.5, 0.9, () => sandcastle(rand)),
    () => { const th = rand() * Math.PI; g.add(seaweedLine(sh, rand, th, bank)); },
  ];
  const kit = [...KIT.keys()].sort(() => rand() - 0.5).slice(0, 3 + Math.floor(rand() * 3));
  for (const k of kit) KIT[k]();
  // and on every beach: umbrellas with towels and sunbathers, the odd picnic
  const spot = (n, x0, x1, z0, z1) => {
    for (let i = 0; i < n; i++) {
      scatter(1, x0, x1, z0, z1, 1.3, () => umbrella(rand));
      scatter(1 + Math.floor(rand() * 2), x0, x1, z0, z1, 0.9, () => (rand() < 0.5 ? sunbather(rand) : towel(rand)), undefined, 1.2);
      if (rand() < 0.6) scatter(1, x0, x1, z0, z1, 0.3, () => flipflops());
      if (rand() < 0.5) scatter(1, x0, x1, z0, z1, 0.5, () => coolBox());
      if (rand() < 0.4) scatter(1, x0, x1, z0, z1, 0.4, () => beachBall());
    }
  };
  spot(2, W + 1.5, X1 - 1, -1, H + 2);
  spot(1, X0 + 1, -1.8, -1, H + 2);
  spot(2, X0 + 1, X1 - 1, H + 1.6, sh.cz + sh.b - 2.4);
  // footprints from the huts down to the water
  if (rand() < 0.7) {
    const fx = W * (0.2 + rand() * 0.6), [tx, tz] = sh.shore(Math.PI / 2 + (rand() - 0.5) * 0.8, -1.4);
    const fz = H + 1.6;
    if (!onBoard(fx, fz)) g.add(footprints(new THREE.Vector3(fx, 0, fz), new THREE.Vector3(tx, 0, tz), (x, z) => GRASS + bank(x, z)));
  }
  scatter(2, X0, X1, Z0, -1.4, 0.7, () => hibiscus(rand));
  scatter(1, W + 1.4, X1, 0, H, 0.6, () => hibiscus(rand));
  scatter(10, X0, X1, Z0, H + 4, 0.8, () => rock(rand));
  scatter(26, X0, X1, Z0, H + 4, 0.3, () => duneGrass(rand));
  // crabs on the sand, in front and to the sides
  for (let i = 0; i < 5; i++)
    for (let k = 0; k < 10; k++) {
      const x = X0 + rand() * (X1 - X0), z = rand() < 0.5 ? H + 1 + rand() * 2.5 : rand() * H;
      if (onBoard(x, z, 1.6) || !dry(x, z, 0) || !free(x, z, 1.6)) continue;
      g.add(crab(rand, x, z, GRASS + bank(x, z)));
      reserve(x, z, 1.6);
      break;
    }
  // tiki torches along the back at dusk and after
  if (time !== "day")
    for (let x = 3; x < W - 1; x += 9) {
      const z = -2.3;
      if (!free(x, z, 0.4)) continue;
      // one torch: pole, flame and glow together
      const torch = new THREE.Group();
      const pole = drawn(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 6), flat(P.trunkDark));
      pole.position.y = 0.9;
      const flame = drawn(new THREE.ConeGeometry(0.14, 0.34, 6), flat(0xffb347));
      flame.position.y = 1.95;
      const glow = new THREE.Sprite(lanternGlow());
      glow.scale.set(2.6, 2.6, 1);
      glow.position.y = 1.95;
      torch.add(pole, flame, glow);
      torch.position.set(x, GRASS + bank(x, z), z);
      g.add(torch);
      reserve(x, z, 0.4);
    }

  // giant hibiscus on the dunes behind and beside
  scatter(3, X0 + 2, X1 - 2, Z0 + 1, -2.5, 1.6, () => giantHibiscus(rand), undefined, 2);
  scatter(2, W + 1.8, X1 - 1, 0, H, 1.6, () => giantHibiscus(rand), undefined, 2);
  // kites up over the beach
  for (let i = 0; i < 2; i++) {
    const kt = kite(rand, [C.cap, P.towel, 0xf5b83d][i % 3]);
    kt.position.set(W * (0.25 + i * 0.5), 9 + rand() * 2, -4 - rand() * 3);
    g.add(kt);
  }
  // the fade: a crown near the line from the eye to the ball goes see-through
  g.userData.fade = fadeLoop(fading, { min: 0.22 });

  // out at sea: a far island or two, a ship on the horizon, gulls overhead
  const isles = [[-55, -80, 9], [70, -95, 12], [-90, 30, 7]];
  for (const [dx, dz, r] of isles.slice(0, 2 + Math.floor(rand() * 2))) {
    const f = farIsle(rand, r);
    f.position.set(sh.cx + dx, SEA, sh.cz + dz);
    g.add(f);
  }
  const sp = mergedMover(ship());
  sp.position.set(sh.cx + 30, SEA, sh.cz - 70);
  g.add(sp);
  animate((t) => {
    sp.position.x = sh.cx + 30 + Math.sin(t * 0.02) * 25;
    sp.rotation.z = Math.sin(t * 0.9) * 0.03;
  });
  g.add(gulls(rand, sh.cx, sh.cz, 4 + Math.floor(rand() * 3), perches));
  if (green(s) === "planks") g.add(lagoonUnder(s, bank));
  flushLeafLines(g);
  return g;
}

/** The rough inside the walls, for course.js: sand here, not grass. */
// on a boardwalk the rough is lagoon: nothing there; elsewhere a sparse stone
export const rough = { lo: P.wet, hi: P.sand, plant: (rand, s) => (green(s) === "planks" || rand() > 0.33 ? null : rock(rand)) };

export { base, edging, berms, decor };

// -------------------------------------------------------- on-lane pieces
//
// The island's own look for what the chain puts on the lane. course.js /
// zones.js call piece(kind, item, t, s) for each wall, post and zone, with
// the chain's JSON for it (a wall comes as its whole bar); this returns an
// Object3D in world units, or null for the shared default. The lighthouse loop
// is dressed by zones.js itself.
// Every one stands on the ground and keeps to its footprint.

const ground = (t, x, z) => t.height(x, z);

function palmPost(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  // the footprint is the planter: a ring of sand-coloured stones of radius r
  const pot = drawn(new THREE.CylinderGeometry(r * 0.93, r * 0.97, 0.35, 16), flat(P.wet));
  pot.position.y = 0.17;
  g.add(pot);
  const rand = seeded("palm" + x + z);
  const p = palm(rand, 4 + rand() * 1.5);
  g.add(p);
  g.position.set(x, ground(t, x, z), z);
  flushLeafLines(g);
  return g;
}

function coral(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  const rand = seeded("coral" + x + z);
  const cols = [0xf07a6a, 0xf29ac0, 0xf5b83d, 0xb58be0];
  const base = drawn(new THREE.CylinderGeometry(r, r * 1.02, 0.25, 14), flat(0xe8d6b8));
  base.position.y = 0.12;
  g.add(base);
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2, d = rand() * r * 0.6, h = 0.5 + rand() * 0.7;
    const b = drawn(new THREE.CylinderGeometry(0.07, 0.12, h, 5), flat(cols[i % cols.length]));
    b.position.set(Math.cos(a) * d, 0.25 + h / 2, Math.sin(a) * d);
    b.rotation.set((rand() - 0.5) * 0.7, 0, (rand() - 0.5) * 0.7);
    const tip = drawn(new THREE.SphereGeometry(0.12, 6, 5), flat(cols[i % cols.length]));
    tip.position.set(0, h / 2, 0);
    b.add(tip);
    g.add(b);
  }
  g.position.set(x, ground(t, x, z), z);
  return g;
}

function outcrop(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  const rand = seeded("rock" + x + z);
  const main = drawn(new THREE.DodecahedronGeometry(r * 0.97, 1), flat(P.rock));
  main.scale.set(1, 0.55 + rand() * 0.2, 1);
  main.position.y = r * 0.25; // sitting in the sand
  g.add(main);
  // a smaller rock on top, not beside: the footprint is the circle
  if (r > 1) {
    const s2 = r * 0.4, m = drawn(new THREE.DodecahedronGeometry(s2, 0), flat(0x77746c));
    m.position.set(r * 0.15, r * 0.55 + s2 * 0.3, -r * 0.1);
    g.add(m);
  }
  g.position.set(x, ground(t, x, z), z);
  return g;
}

function buoy(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  const bob = new THREE.Group();
  bob.userData.live = true;
  for (let i = 0; i < 3; i++) {
    const band = drawn(new THREE.CylinderGeometry(r * (1 - i * 0.18), r * (1 - (i - 1) * 0.18 > 1 ? 1 : 1 - (i - 1) * 0.18), 0.35, 16), flat(i % 2 ? 0xffffff : C.cap));
    band.position.y = 0.18 + i * 0.35;
    bob.add(band);
  }
  const lamp = drawn(new THREE.SphereGeometry(0.14, 8, 6), flat(0xffe39a));
  lamp.position.y = 1.2;
  bob.add(lamp);
  g.add(bob);
  const ph = x * 0.7;
  animate((tt) => (bob.rotation.z = Math.sin(tt * 1.3 + ph) * 0.06, bob.position.y = Math.sin(tt * 1.7 + ph) * 0.03));
  g.position.set(x, ground(t, x, z), z);
  return g;
}

function crabPost(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  g.userData.live = true;
  const c = crab(seeded("crab" + x + z), 0, 0, 0);
  c.scale.setScalar(r / 0.32); // its claws' reach is the footprint
  g.add(c);
  g.position.set(x, ground(t, x, z), z);
  return g;
}

function driftwoodPost(item, t) {
  const [x, z] = item.c, r = item.r, g = new THREE.Group();
  const stump = drawn(new THREE.CylinderGeometry(r * 0.9, r, 0.7, 12), flat(0xb7a58d));
  stump.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.85, 12).rotateX(-Math.PI / 2), flat(0xd8c8ae));
  top.position.y = 0.71;
  g.add(stump, top);
  g.position.set(x, ground(t, x, z), z);
  return g;
}

/** A driftwood log filling a bar: {c, length, thick, ang} from course.js. */
function driftwoodBar(bar, t) {
  const [cx, cz] = bar.c, th = bar.thick || 0.5;
  const g = new THREE.Group();
  const log = drawn(new THREE.CylinderGeometry(th / 2, th / 2 * 0.9, bar.length, 9).rotateZ(Math.PI / 2), flat(0xb7a58d));
  log.position.y = th / 2;
  const knot = drawn(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5), flat(0xb7a58d));
  knot.position.set(bar.length * 0.2, th * 0.9, 0);
  knot.rotation.z = 0.5;
  g.add(log, knot);
  g.rotation.y = -bar.ang;
  g.position.set(cx, ground(t, cx, cz), cz);
  return g;
}

// a flat shape filling a zone's footprint exactly (its ellipse if round),
// laid on the ground a hair above it
function footprint(z, t, material, lift = 0.05, seg = 40) {
  onTop(material);
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const geo = z.round ? new THREE.CircleGeometry(1, seg).scale((x1 - x0) / 2, (z1 - z0) / 2, 1) : new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 4);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, ground(t, cx + p.getX(i), cz + p.getZ(i)) + lift);
  const m = new THREE.Mesh(geo, material);
  m.position.set(cx, 0, cz);
  return m;
}

function rim(z, t, rand, n, make) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = (x1 - x0) / 2, b = (z1 - z0) / 2;
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    const x = cx + Math.cos(th) * (a - 0.25), zz = cz + Math.sin(th) * (b - 0.25); // just inside the edge
    const m = make(rand);
    m.position.set(x, ground(t, x, zz), zz);
    g.add(m);
  }
  return g;
}

function waterZone(z, t, s, { color = P.shallow, stones = true, foam = true } = {}) {
  const g = new THREE.Group();
  const rand = seeded(z.skin + z.min.join());
  g.add(footprint(z, t, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }), 0.05));
  if (foam) {
    const ring = footprint(z, t, onTop(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }), 2), 0.1);
    ring.scale.set(0.96, 1, 0.96);
    ring.renderOrder = 1;
    ring.userData.live = true; // only the breathing foam: the rest bakes
    const inner = footprint(z, t, onTop(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false }), 3), 0.15);
    inner.scale.set(0.9, 1, 0.9);
    inner.renderOrder = 2;
    g.add(ring, inner);
    animate((tt) => (ring.material.opacity = 0.2 + 0.2 * (0.5 + 0.5 * Math.sin(tt * 1.4))));
  }
  if (stones && z.round) g.add(rim(z, t, rand, Math.round((z.max[0] - z.min[0] + z.max[1] - z.min[1]) * 0.8), (r) => pebble(r)));
  return g;
}

function wave(z, t) {
  const g = new THREE.Group();
  g.add(footprint(z, t, new THREE.MeshBasicMaterial({ color: P.shallow, transparent: true, opacity: 0.85, depthWrite: false }), 0.05));
  // foam lines running across the strip, along its long side
  const [x0, z0] = z.min, [x1, z1] = z.max, alongX = x1 - x0 > z1 - z0;
  const lines = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? x1 - x0 : 0.25, alongX ? 0.25 : z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
    m.userData.live = true;
    g.add(m);
    return m;
  });
  animate((tt) => lines.forEach((m, i) => {
    const u = (tt * 0.35 + i / 3) % 1;
    const x = alongX ? (x0 + x1) / 2 : x0 + 0.2 + u * (x1 - x0 - 0.4), zz = alongX ? z0 + 0.2 + u * (z1 - z0 - 0.4) : (z0 + z1) / 2;
    m.position.set(x, ground(t, x, zz) + 0.05, zz);
    m.material.opacity = Math.sin(Math.PI * u) * 0.8;
  }));
  return g;
}

function gap(z, t) {
  // missing planks: the opening sunk below the deck, dark teal water down
  // there, a shadow under the deck's edge, and the boards round it broken off
  // in splintered ends
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const y = ground(t, cx, cz), w = x1 - x0, d = z1 - z0;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), flat(0x3fb3b3)); // the lagoon's turquoise, a shade deeper in the hole
  water.position.set(cx, y - 0.45, cz);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0d2f33, transparent: true, opacity: 0.55 }));
  shade.scale.set(1, 1, 0.25);
  shade.position.set(cx, y - 0.44, z0 + d * 0.13); // under the far edge of the deck
  // the hole's walls: the deck's cut thickness, dark
  const walls = [];
  for (const [px, pz, sx, sz] of [[cx, z0, w, 0.04], [cx, z1, w, 0.04], [x0, cz, 0.04, d], [x1, cz, 0.04, d]])
    walls.push(new THREE.BoxGeometry(sx, 0.45, sz).translate(px, y - 0.22, pz));
  g.add(water, shade, new THREE.Mesh(mergeGeometries(walls), flat(0x3a2818)));
  // splintered plank ends along the two edges the boards run into
  const rand = seeded("gap" + cx + cz);
  const alongX = w <= d; // boards run across the lane: they end on the long sides
  const n = Math.max(2, Math.round((alongX ? d : w) / 0.5));
  const ends = [];
  for (const side of [-1, 1])
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, len = 0.08 + rand() * 0.25;
      const ex = alongX ? cx + side * (w / 2 - len / 2) : x0 + u * w;
      const ez = alongX ? z0 + u * d : cz + side * (d / 2 - len / 2);
      const b = new THREE.BoxGeometry(alongX ? len : 0.42, 0.06, alongX ? 0.42 : len);
      // a jagged tip: one corner pulled in
      b.attributes.position.setX(0, b.attributes.position.getX(0) * (0.3 + rand() * 0.5));
      ends.push(b.translate(ex, y + 0.01, ez));
    }
  g.add(drawn(mergeGeometries(ends), flat(0xc99a63)));
  return g;
}

// A tunnel or loop keeps the shared drawing (its tube or track is what the
// engine rides) and gets its dressing on top: the default is drawn with a
// mark this file then declines.
const withDefault = (z, s, t, dressing) => {
  const g = new THREE.Group();
  g.add(zoneDetail({ ...z, islandDressed: true }, s, t), dressing);
  return g;
};

// dressing round a tunnel mouth or its exit
function wreck(z, t, s) {
  const g = new THREE.Group();
    const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = (x1 - x0) / 2, b = (z1 - z0) / 2;
  const rand = seeded("wreck" + cx);
  // broken ribs standing round the far half of the mouth, low
  for (let k = 0; k < 5; k++) {
    const th = -Math.PI / 2 + (k / 4) * Math.PI;
    const x = cx + Math.cos(th) * (a - 0.5), zz = cz + Math.sin(th) * (b - 0.35);
    const rib = drawn(new THREE.TorusGeometry(0.35, 0.06, 5, 8, Math.PI * 0.7), flat(0x7a5a3a));
    rib.position.set(x, ground(t, x, zz) + 0.05, zz);
    rib.rotation.y = -th;
    g.add(rib);
  }
  const mast = drawn(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), flat(0x7a5a3a));
  mast.position.set(cx, ground(t, cx, cz) + 1.1, cz - b + 0.3);
  mast.rotation.z = -0.35;
  g.add(mast);
  // and its exit: a few planks washed up round it
  const [ex, ez] = z.vec;
  for (let k = 0; k < 3; k++) {
    const p = drawn(rbox(1.2, 0.08, 0.26, 0.03), flat(k % 2 ? C.woodDark : 0x7a5a3a));
    const th = rand() * Math.PI * 2;
    p.position.set(ex + Math.cos(th) * 1.6, ground(t, ex, ez) + 0.05, ez + Math.sin(th) * 1.6);
    p.rotation.y = rand() * 3;
    g.add(p);
  }
  return g;
}

function cave(z, t) {
  const g = new THREE.Group();
    const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = (x1 - x0) / 2;
  // a rock arch over the far side of the mouth, and boulders at its feet
  // the arch spans the mouth inside its own ellipse, high enough to roll under
  const arch = drawn(new THREE.TorusGeometry(a - 0.4, 0.35, 6, 12, Math.PI), flat(P.rock));
  arch.position.set(cx, ground(t, cx, cz), cz);
  g.add(arch);
  const rand = seeded("cave" + cx);
  void rand; // (boulders round it stood on the lane's kerb)
  const [ex, ez] = z.vec;
  for (let k = 0; k < 4; k++) {
    const th = (k / 4) * Math.PI * 2 + 0.4, m = drawn(new THREE.DodecahedronGeometry(0.35, 0), flat(P.rock));
    m.position.set(ex + Math.cos(th) * 1.5, ground(t, ex, ez) + 0.15, ez + Math.sin(th) * 1.5);
    g.add(m);
  }
  return g;
}

export function piece(kind, item, t, s) {
  const k = item.skin;
  if (kind === "post") {
    if (k === "palm") return palmPost(item, t);
    if (k === "coral") return coral(item, t);
    if (k === "outcrop") return outcrop(item, t);
    if (k === "buoy") return buoy(item, t);
    if (k === "crab") return crabPost(item, t);
    if (k === "driftwood") return driftwoodPost(item, t);
    return null;
  }
  if (kind === "wall") {
    if (k === "driftwood") return driftwoodBar(item, t);
    // (a pier backstop is a polyline, not a bar: it keeps the shared kerb)
    return null;
  }
  if (kind === "zone") {
    if (k === "wetsand") return footprint(item, t, flatTop(P.wet));
    if (k === "sand") return footprint(item, t, flatTop(P.sand));
    if (k === "tidepool") return waterZone(item, t, s);
    if (k === "lagoon") return waterZone(item, t, s, { color: 0x4fc4c9 });
    if (k === "wave") return wave(item, t);
    if (k === "gap") return gap(item, t);
    if (k === "sea") return new THREE.Group(); // the world's sea shows round the lane
    if (item.islandDressed) return null;
    if (k === "shipwreck") return withDefault(item, s, t, wreck(item, t, s));
    if (k === "cave") return withDefault(item, s, t, cave(item, t));
    return null;
  }
  return null;
}

/** The lagoon round a boardwalk: a rounded, wobbly shape a few units out
 *  from the board. inLagoon(x, z) > 0 inside, in units from its shore. */
function lagoonShape(s) {
  const W = s.board.w, H = s.board.h, cx = W / 2, cz = H / 2, a = W / 2 + 3, b = H / 2 + 3;
  const rand = seeded("lagoon" + s.hole), ph = [rand() * 6, rand() * 6];
  const wob = (th) => 1 + 0.06 * Math.sin(3 * th + ph[0]) + 0.04 * Math.sin(7 * th + ph[1]);
  const N = 4; // rounded, but it still holds the long board
  return (x, z) => {
    const u = (x - cx) / a, v = (z - cz) / b;
    const rho = Math.pow(Math.pow(Math.abs(u), N) + Math.pow(Math.abs(v), N), 1 / N) / wob(Math.atan2(v, u));
    return (1 - rho) * Math.min(a, b);
  };
}

/** A boardwalk's lagoon: turquoise water filling the board's area at sea
 *  level (the sand under it is sunk by berms), and piles standing in it under
 *  the deck's edge, one every few units along each wall. */
function lagoonUnder(s) {
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  // the water: the lagoon's own outline, filled
  const inLag = lagoonShape(s), pts = [];
  for (let k = 0; k < 96; k++) {
    const th = (k / 96) * Math.PI * 2, dx = Math.cos(th), dz = Math.sin(th);
    let lo = 0, hi = Math.max(W, H); // march out to the shore
    for (let n = 0; n < 24; n++) { const m = (lo + hi) / 2; inLag(W / 2 + dx * m, H / 2 + dz * m) > 0 ? (lo = m) : (hi = m); }
    pts.push(new THREE.Vector2(W / 2 + dx * lo, H / 2 + dz * lo));
  }
  const water = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts), 1).rotateX(Math.PI / 2), onTop(new THREE.MeshBasicMaterial({ color: P.shallow, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide })));
  water.position.y = SEA + 0.02;
  g.add(water);
  const piles = [];
  for (const w of s.walls) {
    if (w.every) continue;
    const l = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    for (let u = 0.5; u < l; u += 3) {
      const x = w.a[0] + ((w.b[0] - w.a[0]) * u) / l, z = w.a[1] + ((w.b[1] - w.a[1]) * u) / l;
      if (x < 0.5 || x > W - 0.5 || z < 0.5 || z > H - 0.5) continue; // the board's own edge fence
      piles.push(new THREE.CylinderGeometry(0.16, 0.2, GRASS - SEA + 0.8, 6).translate(x, (GRASS + SEA - 0.8) / 2, z));
    }
  }
  if (piles.length) g.add(drawn(mergeGeometries(piles), flat(P.trunkDark)));
  return g;
}

/** The lane's own ground, for course.js: boardwalk planks where the lane is a
 *  boardwalk over the water (the pier and the broken boardwalk), else green. */
export const green = (s) => (/island(9|10)$/.test(s.hole) ? "planks" : null);
