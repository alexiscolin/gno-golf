// The "island" world: the board on a sandy island in a warm sea. Same four
// functions as garden.js (the contract is in worlds.js). No grass round the
// field, no forest: sand, dunes, palms, the gnomes' straw huts shaped like
// mushrooms, and turquoise water to the horizon.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, ink, flat, drawn, grows, sway, swayLine, setFoot, rbox, lanternGlow, glowTex, share, hullOf, ownFade, fadeLoop, windNow } from "./materials.js";
import { inZone, mod, segDist, smoothstep } from "../terrain.js";
import { bake, look, weatherLooks } from "./bake.js";
import { gnomelet, brolly } from "./props.js";
import { animate, state } from "./state.js";
import { timeOf, islandBox } from "./camera.js";
import { seeded, ISLAND, GRASS, placer } from "./common.js";
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
      c.copy(shallow).lerp(deep, smoothstep(off / 14));
      const fade = 1 - smoothstep((r - 110) / 150);
      col.push(c.r, c.g, c.b, (0.72 + 0.28 * smoothstep(off / 8)) * fade); // opaque by 8 out: the seabed ends unseen
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
      m.visible = m.material.opacity > 0.01; // gone: not drawn (nor blended) for nothing
    });
    // runs up as each crest breaks, then slides back
    const u = (t / PERIOD * 3) % 1;
    const run = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
    around(swash, 1 - (run * 0.5) / R0);
    swash.material.opacity = 0.45 * run;
    swash.visible = swash.material.opacity > 0.01;
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
    const beach = inn >= 3 ? 0 : (SEA - GRASS) * (1 - smoothstep(inn / 3)) + (inn < 0 ? inn * 0.6 : 0);
    const dx = Math.max(0, -x, x - W), dz = Math.max(0, -z, z - H);
    const near = smoothstep((Math.hypot(dx, dz) - 1.2) / 2); // flat by the board
    let top = 0;
    for (const d of dunes) {
      const cs = Math.cos(d.a), sn = Math.sin(d.a);
      const u = ((x - d.x) * cs + (z - d.z) * sn) / d.rx, v = (-(x - d.x) * sn + (z - d.z) * cs) / d.rz;
      const q = u * u + v * v;
      if (q < 1) top = Math.max(top, d.h * (1 - q) * (1 - q));
    }
    return beach + top * near * smoothstep((inn - 2) / 3);
  };
}

/** The sand round the board: dunes, the beach, the shelf under the water. */
function berms(s) {
  const sh = shape(s);
  const height = land(s, sh);
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
      const h = lg > 0 ? base + (SEA - 0.6 - GRASS - base) * smoothstep(lg / 1.5) : base, y = GRASS + h;
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
  g.add(grows(mergeGeometries(geos), 0x6b4a2b)); // hung in the crown: they sway with it
}

// a leaf blade: seen from above and below, with its ink edge. It sways with
// the same shader as its midrib (sway) and its outline (swayLine): a still
// blade left the ribs and the ink floating over it in the wind
function leafMesh(geo, color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, sway(color, { double: true })));
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
  // each outline weighs its sway from its own palm's foot, as its leaves do
  const geos = leafLines.map(({ e, owner }) => setFoot(e.applyMatrix4(owner.matrixWorld), owner));
  leafLines = [];
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const lines = new THREE.LineSegments(mergeGeometries(geos).applyMatrix4(inv), leafInk);
  root.add(lines);
}

/** A standing palm: a gentle wind lean, its crown over its own footprint. */
function palm(rand, h = 4.5 + rand() * 2.5) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  g.userData.flex = 0.6; // a palm bends, but not like grass
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

/** A beach umbrella and its towel, in three looks (see weatherLooks): open in
 *  clear weather, tilted and flapping in the wind, furled in the rain; and
 *  furled whatever the weather at night. */
function umbrella(rand, time) {
  const g = new THREE.Group();
  const open = new THREE.Group();
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
  open.add(pole, canopy);
  // in the wind: leaning, and all of it (pole, canopy, their ink) on the one
  // sway weighed from its foot, so the canopy never slides off the pole
  const windy = new THREE.Group();
  windy.userData.foot = 0;
  const wpole = grows(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6), C.cream);
  wpole.position.y = 1.05;
  windy.add(wpole);
  for (let i = 0; i < 8; i++) {
    const m = grows(new THREE.ConeGeometry(1.2, 0.5, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4).translate(0, 2.1, 0), colors[i % 2]);
    m.children[0].material = sway(colors[i % 2], { double: true });
    windy.add(m);
  }
  windy.rotation.z = 0.2;
  // in the rain: furled round its pole, tied
  const shut = new THREE.Group();
  const spole = drawn(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), flat(C.cream));
  spole.position.y = 1.15;
  // a spindle: slim at the bottom, fullest near the top where the ribs meet
  const furl = drawn(new THREE.LatheGeometry([[0.045, 0], [0.13, 0.5], [0.19, 1], [0.1, 1.28], [0.045, 1.36]].map(([x, y]) => new THREE.Vector2(x, y)), 8), flat(colors[0]));
  furl.position.y = 0.9;
  const tie = drawn(new THREE.TorusGeometry(0.15, 0.025, 4, 10).rotateX(Math.PI / 2), flat(colors[1]));
  tie.position.y = 1.55;
  shut.add(spole, furl, tie);
  if (time === "night") g.add(look(shut, "clear", "wind", "wet"));
  else g.add(look(open, "clear"), look(windy, "wind"), look(shut, "wet"));
  for (const wet of [false, true]) {
    const towel = drawn(rbox(0.8, 0.04, 1.6, 0.02), flatTop(wet ? soaked(colors[0]) : colors[0]));
    towel.position.set(0.9, 0.07, 0.2);
    towel.rotation.y = 0.3;
    g.add(wet ? look(towel, "wet") : look(towel, "clear", "wind"));
  }
  return g;
}

function sandcastle() {
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
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
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
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
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


/** A tall wind-bent palm rooted off the lane, its crown high over it: drawn
 *  as palm() is (toon bands, ink hulls, leaf outlines, the same sway), with
 *  its own fadeable copies of those materials (ownFade, by the caller). */
function archPalm(rand, toward, reach, h) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  g.userData.flex = 0.45; // taller than a beach palm: a little stiffer
  // from its foot to its crown it leans `reach` over `h`, as a coconut palm
  // grows: leaning most at the foot, then rising towards the crown in one
  // gentle upward curve (the outward step shrinks up the trunk)
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12, u = 0.65 * (2 * k - k * k) + 0.35 * k;
    pts.push(new THREE.Vector3(toward.x * reach * u, h * k, toward.z * reach * u));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const { bark, rings } = trunkGeometry(curve, 0.32);
  g.add(grows(bark, P.trunk), grows(rings, P.trunkDark));
  const top = curve.getPoint(1);
  const crown = new THREE.Group();
  const cr = crownGeometry(rand, new THREE.Vector3(), 9, 1.15);
  crown.add(new THREE.Mesh(cr.rachis, sway(P.trunkDark)));
  // the blades and their outlines as palm()'s, but kept in the crown: the
  // outlines fade and nod with it (leafMesh's are gathered into the decor's)
  for (const [k, geo] of cr.leaves.entries()) crown.add(new THREE.Mesh(geo, sway(k ? P.frond : P.frondDark, { double: true })), new THREE.LineSegments(new THREE.EdgesGeometry(geo, 40), leafInk));
  coconuts(crown, new THREE.Vector3(0, 0.1, 0), 4);
  crown.position.copy(top);
  g.add(crown);
  g.userData.crown = crown;
  g.userData.reach = Math.hypot(top.x, top.z);
  return g;
}

/** A hibiscus as big as a gnome's house, on a dune. */
function giantHibiscus(rand) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  g.userData.flex = 0.7; // how far it bends: see materials.js SWAY
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

/**
 * A kite high over the beach: a diamond sail on its cross spars, inked round,
 * a ribbon tail with bows, and its string down to a stake in the sand
 * (`stake`, in the kite's own frame). The sail and tail flutter as one piece
 * about the string's knot; the tail waves out behind it, downwind.
 */
function kite(rand, color, stake) {
  const g = new THREE.Group();
  g.userData.live = true;
  // the string: from the knot (the kite's origin) down to the stake, sagging
  const sag = [];
  for (let i = 0; i <= 16; i++) {
    const k = i / 16;
    sag.push(stake.clone().multiplyScalar(k).add(new THREE.Vector3(0, -Math.sin(k * Math.PI) * 0.8, 0)));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(sag), ink));
  const peg = drawn(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), flat(P.trunkDark));
  peg.position.copy(stake).add(new THREE.Vector3(0, 0.2, 0));
  g.add(peg);
  // the flier: all that flutters, about the knot at the spars' cross
  const fly = new THREE.Group();
  const top = new THREE.Vector2(0, 0.75), right = new THREE.Vector2(0.6, 0), bottom = new THREE.Vector2(0, -1.05), left = new THREE.Vector2(-0.6, 0);
  fly.add(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([top, right, bottom, left])), dside(color)));
  const v3 = (p, z = 0.02) => new THREE.Vector3(p.x, p.y, z);
  fly.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([top, right, bottom, left].map((p) => v3(p, 0.01))), ink));
  const spar = flat(P.trunkDark);
  for (const [a, b] of [[top, bottom], [left, right]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 4), spar);
    m.position.copy(v3(a.clone().lerp(b, 0.5), 0.04));
    m.rotation.z = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    fly.add(m);
  }
  // the tail: one ribbon from the bottom tip, its bows riding on it
  const N = 14, LEN = 2.6, W = 0.05;
  const rib = new THREE.PlaneGeometry(W * 2, LEN, 1, N);
  const ribbon = new THREE.Mesh(rib, dside(0xffffff));
  ribbon.frustumCulled = false; // its vertices move every frame, away from its first bounds
  const bows = [];
  const bow = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.2, 0.1, 0), new THREE.Vector3(-0.2, -0.1, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, -0.1, 0), new THREE.Vector3(0.2, 0.1, 0)]);
  bow.computeVertexNormals();
  for (let i = 1; i <= 4; i++) {
    const b = new THREE.Mesh(bow, dside(i % 2 ? color : 0xffffff));
    fly.add(b);
    bows.push({ b, at: (i * N) / 5 | 0 });
  }
  fly.add(ribbon);
  g.add(fly);
  const pos = rib.attributes.position, ph = rand() * 6, spine = [];
  animate((t) => {
    const w = windNow(), k = 1 + Math.min(w.length() * 15, 1);
    // the whole kite flutters about its knot, leaning a little downwind
    fly.rotation.z = Math.sin(t * 0.8 * k + ph) * 0.12 - Math.max(-0.08, Math.min(0.08, w.x)) * 2;
    // the tail waves, more at its end, and streams downwind
    for (let j = 0; j <= N; j++) {
      const u = j / N;
      spine[j] = [Math.sin(t * 2.6 * k - u * 5 + ph) * 0.22 * u + Math.max(-0.08, Math.min(0.08, w.x)) * 9 * u * u, bottom.y - u * LEN];
    }
    for (let i = 0; i < pos.count; i++) {
      const j = i >> 1; // PlaneGeometry: two vertices a row, from the top (the kite) down
      pos.setXYZ(i, spine[j][0] + (i % 2 ? W : -W), spine[j][1], 0);
    }
    pos.needsUpdate = true;
    for (const { b, at } of bows) b.position.set(spine[at][0], spine[at][1], 0.01);
  });
  return g;
}

/** A whole object that moves as one, merged into a mesh per material by the
 *  shared bake (in its own frame), and marked live so the hole's own bake leaves it be. */
const mergedMover = (group) => ((bake(group, { local: true }).userData.live = true), group);

// ------------------------------------------------------------ beach life

const STRIPES = [[C.cap, 0xffffff], [P.towel, 0xffffff], [0xf5b83d, C.cap], [0x5b6fb5, 0xf5b83d], [0x3fbf8f, 0xffffff], [0xf29ac0, 0xffffff]];

// a towel left out in the rain: its colours darker
const soaked = (c) => new THREE.Color(c).multiplyScalar(0.5).getHex();
/** A towel in bright stripes, flat on the sand; soaked in the rain. */
function towel(rand) {
  const g = new THREE.Group();
  const [a, b] = STRIPES[Math.floor(rand() * STRIPES.length)];
  const dry = new THREE.Group(), wet = new THREE.Group();
  for (let i = 0; i < 5; i++)
    for (const grp of [dry, wet]) {
      const c = i % 2 ? b : a, m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.03, 0.34), flatTop(grp === wet ? soaked(c) : c));
      m.position.set(0, 0.06, -0.68 + i * 0.34);
      grp.add(m);
    }
  g.add(look(dry, "clear", "wind"), look(wet, "wet"));
  return g;
}
/** A gnome sunbathing on his towel, hat over his eyes. In the rain he is
 *  gone, or stands on it under his umbrella (wrand: the weather's own dice,
 *  so the beach's layout never changes with it). At dusk he is packing up:
 *  sitting up, or gone; at night the towel is left empty. */
function sunbather(rand, wrand, time) {
  const g = towel(rand);
  const lying = new THREE.Group();
  const body = drawn(new THREE.CapsuleGeometry(0.17, 0.5, 3, 8).rotateX(Math.PI / 2), flat([0x5b6fb5, C.leaf, 0xf5b83d][Math.floor(rand() * 3)]));
  body.position.set(0, 0.2, 0.15);
  const face = drawn(new THREE.SphereGeometry(0.16, 10, 8), flat(C.cream));
  face.position.set(0, 0.2, -0.45);
  const hat = drawn(new THREE.ConeGeometry(0.17, 0.42, 10).rotateX(-Math.PI / 2), flat(C.cap));
  hat.position.set(0, 0.26, -0.72);
  lying.add(body, face, hat);
  if (time === "night") return g;
  if (time === "day") g.add(look(lying, "clear", "wind"));
  else if (wrand() < 0.5) g.add(look(sitter(wrand, 0, 0.1), "clear", "wind"));
  if (wrand() < 0.5) {
    const gn = gnomelet(wrand);
    gn.add(brolly(STRIPES[Math.floor(wrand() * STRIPES.length)][0]));
    gn.position.set(0, 0.075, 0.3); // on the towel
    gn.rotation.y = wrand() * 6;
    g.add(look(gn, "wet"));
  }
  return g;
}
/** A gnome sitting on the sand (or a towel): a gnomelet, squat. */
function sitter(wrand, x, z, turn = wrand() * 6, y = 0.075) {
  const gn = gnomelet(wrand);
  gn.scale.y = 0.78;
  gn.position.set(x, y, z);
  gn.rotation.y = turn;
  return gn;
}
/** A beach campfire for the night, three gnomes round it: a ring of stones,
 *  crossed logs, the flame, and a glow that flickers (its own material, so
 *  every copy of it flickers too). Lights nothing: the glow is a sprite. */
function campfire(wrand) {
  const g = new THREE.Group();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, st = drawn(new THREE.DodecahedronGeometry(0.13, 0), flat(P.rock));
    st.position.set(Math.cos(a) * 0.42, 0.06, Math.sin(a) * 0.42);
    st.scale.y = 0.6;
    g.add(st);
  }
  for (const a of [0.5, -0.6]) {
    const log = drawn(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 6).rotateZ(Math.PI / 2), flat(P.trunkDark));
    log.position.y = 0.08;
    log.rotation.y = a;
    g.add(log);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 7), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.y = 0.38;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.35, 6), new THREE.MeshBasicMaterial({ color: 0xffe38a }));
  core.position.y = 0.3;
  const mat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xffa64d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Sprite(mat);
  glow.scale.set(4.4, 4.4, 1);
  glow.position.y = 0.5;
  g.add(flame, core, glow);
  const ph = wrand() * 6;
  for (let k = 0; k < 3; k++) {
    const a = ph + (k / 3) * Math.PI * 2 + (wrand() - 0.5) * 0.4;
    // facing the fire: a gnomelet's front is +z
    g.add(sitter(wrand, Math.cos(a) * 1.05, Math.sin(a) * 1.05, Math.atan2(-Math.cos(a), -Math.sin(a)), 0));
  }
  animate((t) => (mat.opacity = 0.8 + Math.sin(t * 11 + ph) * 0.12 + Math.sin(t * 6.7) * 0.08));
  return g;
}
/** Two gnomes sheltering from the rain: side by side at (x, z) of a hut or a bar. */
function shelter(wrand, pts) {
  const g = new THREE.Group();
  for (const [x, z] of pts) {
    const gn = gnomelet(wrand);
    gn.position.set(x, 0, z);
    gn.rotation.y = (wrand() - 0.5) * 1.2;
    g.add(gn);
  }
  return look(g, "wet");
}
/** A gnome running along the shore with a towel over his head, in the rain. */
function runner(wrand, sh, bank) {
  const gn = gnomelet(wrand);
  const cover = drawn(new THREE.CylinderGeometry(0.34, 0.34, 0.75, 10, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), dside(STRIPES[Math.floor(wrand() * STRIPES.length)][0]));
  cover.position.y = 0.66; // an arch over the hat, its tip just under the crown
  gn.add(cover);
  const run = mergedMover(gn);
  // his way, sampled once: along the front of the shore, off the wet sand's edge
  const N = 40, way = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) {
    const [x, z] = sh.shore(Math.PI * (0.3 + (0.4 * k) / (N - 1)), -1.3);
    way.set([x, GRASS + bank(x, z), z], k * 3);
  }
  animate((t) => {
    if (!run.parent || !run.parent.visible) return;
    const u = (t * 0.05) % 2, back = u > 1, f = (back ? 2 - u : u) * (N - 1), i = Math.min(N - 2, f | 0), a = f - i, j = i * 3;
    const dx = way[j + 3] - way[j], dz = way[j + 5] - way[j + 2];
    run.position.set(way[j] + dx * a, way[j + 1] + (way[j + 4] - way[j + 1]) * a + Math.abs(Math.sin(t * 9)) * 0.08, way[j + 2] + dz * a);
    run.rotation.y = Math.atan2(-dz, dx) + (back ? Math.PI : 0);
  });
  return look(run, "wet");
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
function coconutPile() {
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
  // dents, lit like the sand they are pressed in (an unlit colour glowed at night)
  const mat = flatTop(0xdcc28c);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8).rotateX(-Math.PI / 2).scale(0.7, 1, 1.2), mat);
    m.position.copy(from).addScaledVector(d, i / n).addScaledVector(side, i % 2 ? 0.1 : -0.1);
    m.position.y = y(m.position.x, m.position.z) + 0.02;
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
  const wrand = seeded(s.hole + "isle weather"); // the weather looks' own: rand's draws, so the layout, stay as they were
  const sh = shape(s);
  const time = timeOf(s.hole);

  const { free, reserve } = placer();
  // the board and its kerb, which stands a little outside it
  const onBoard = (x, z, r = 0) => x > -1.2 - r && x < W + 1.2 + r && z > -1.2 - r && z < H + 1.2 + r;
  // on the sand, off the beach's slope — and not in a boardwalk's lagoon
  const wetBoard = green(s) === "planks";
  const inLag = wetBoard ? lagoonShape(s) : null;
  const dry = (x, z, r) => sh.inland(x, z) > 2.2 + r && !(wetBoard && inLag(x, z) > -1 - r);
  // and clear of every wall: a lane's kerb can stand past the board's edge
  const byWall = (x, z, r) => s.walls.some((w) => segDist(x, z, w.a, w.b) < r + 1);
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

  // the lighthouse's spot (it is built further down), kept clear of the canopy
  const LH = [W + ISLAND.x - 2.6, Math.min(H * 0.4, 5)];
  // the canopy: palms rooted just off the lane's long sides, curving in over it
  const fading = [], crowns = [];
  // two or three per hole, from behind (the camera's far side)
  const arches = 2 + (rand() < 0.5 ? 1 : 0);
  for (let k = 0; k < arches; k++) {
    const x = W * ((k + 0.5) / arches) + (rand() - 0.5) * 3, z = -2.8 - rand() * 0.6;
    if (!dry(x, z, 0) || byWall(x, z, 1) || !free(x, z, 1.2)) continue;
    // a real leaning palm: a foot-to-crown lean of 25-40° from the vertical,
    // its crown over the lane's near side (not flung across it)
    // tall (its crown well above the lane), so the lean sets its reach
    const h = 6.5 + rand() * 2, want = h * Math.tan(THREE.MathUtils.degToRad(25 + rand() * 15));
    // its crown (fronds ~3.3 out) clear of the lighthouse and the other crowns
    if (Math.hypot(x - LH[0], z + want - LH[1]) < 3.3 + 3.2 || crowns.some((c) => Math.hypot(c.x - x, c.z - z - want) < 6.6)) continue;
    const p = archPalm(rand, new THREE.Vector3(0, 0, 1), want, h);
    p.position.set(x, GRASS + bank(x, z), z);
    g.add(p);
    const mats = ownFade(p); // its own copies of palm()'s materials, to fade
    // its foot and its trunk: nothing else stands in them (its crown is high
    // over the lane, above anything low)
    reserve(x, z, 1.4);
    reserve(x, z + want * 0.5, 0.6);
    crowns.push({ x, z: z + want });
    const ph = rand() * 6, crown = p.userData.crown;
    animate((t) => (crown.rotation.z = Math.sin(t * 0.9 + ph) * 0.05, crown.rotation.x = Math.cos(t * 0.7 + ph) * 0.04));
    p.updateMatrixWorld(true);
    fading.push({ at: crown.getWorldPosition(new THREE.Vector3()), r: 2.5, mats });
  }
  // behind the board, the gnomes' beach village: straw mushroom huts in a row,
  // the tiki bar among them, all facing the lane
  const huts = 2 + Math.floor(rand() * 2);
  for (let k = 0; k < huts; k++) {
    const x = W * (0.25 + (0.5 * k) / Math.max(1, huts - 1)) + (rand() - 0.5) * 3, z = -5 - rand() * 2;
    const big = 0.8 + rand() * 0.35;
    if (dry(x, z, 2) && free(x, z, 2 * big)) {
      put(paillote(rand, big), x, z, 2 * big, (rand() - 0.5) * 0.4).add(shelter(wrand, [[-0.5 * big, 1.35 * big + 0.1], [0.5 * big, 1.35 * big + 0.1]]));
      perches.push(new THREE.Vector3(x, GRASS + bank(x, z) + (1.6 + 1.75 * 0.62 + 0.05) * big, z)); // the top of its straw cap
    }
  }
  {
    const x = W * 0.5 + (rand() - 0.5) * 4, z = -3.4;
    if (dry(x, z, 2.2) && free(x, z, 2.4)) {
      put(tikiBar(), x, z, 2.4, (rand() - 0.5) * 0.3).add(shelter(wrand, [[-0.6, -0.1], [0.6, -0.1]])); // behind the counter
      for (const dx of [-2.9, 2.9]) if (free(x + dx, z, 0.5)) put(coconutPile(), x + dx, z, 0.5);
    }
  }
  // the lighthouse on its rocks, off the back-right corner, half in the sea
  {
    // on the right-hand shore, back a little: tall, it must stay in the frame
    // past the board's right end, a little behind it: the overview frames the
    // island's box, and a tower there stays inside it whatever the board's shape
    const [x, z] = LH;
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
      // it sways as the trunks it is tied to do (same shader, same foot), or it slips off them
      const net = grows(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(pa, mid, pb), 12, 0.16, 6, false), P.towel);
      net.userData.foot = (a.position.y + b.position.y) / 2;
      net.userData.flex = 0.6; // as its palms
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
    () => scatter(1, X0 + 1, -1.5, H * 0.3, H + 2.5, 0.9, () => sandcastle()),
    () => { const th = rand() * Math.PI; g.add(seaweedLine(sh, rand, th, bank)); },
  ];
  const kit = [...KIT.keys()].sort(() => rand() - 0.5).slice(0, 3 + Math.floor(rand() * 3));
  for (const k of kit) KIT[k]();
  // and on every beach: umbrellas with towels and sunbathers, the odd picnic
  // at night the first umbrella's place is a campfire's, gnomes round it (the
  // same draw of rand, so the rest of the beach stays put)
  let fire = false;
  const spot = (n, x0, x1, z0, z1) => {
    for (let i = 0; i < n; i++) {
      scatter(1, x0, x1, z0, z1, 1.3, () => (time === "night" && !fire ? (rand(), (fire = true), look(campfire(wrand), "clear", "wind")) : umbrella(rand, time)));
      scatter(1 + Math.floor(rand() * 2), x0, x1, z0, z1, 0.9, () => (rand() < 0.5 ? sunbather(rand, wrand, time) : towel(rand)), undefined, 1.2);
      if (rand() < 0.6) scatter(1, x0, x1, z0, z1, 0.3, () => flipflops());
      if (rand() < 0.5) scatter(1, x0, x1, z0, z1, 0.5, () => coolBox());
      if (rand() < 0.4) scatter(1, x0, x1, z0, z1, 0.4, () => beachBall());
    }
  };
  spot(2, W + 1.5, X1 - 1, -1, H + 2);
  spot(1, X0 + 1, -1.8, -1, H + 2);
  spot(2, X0 + 1, X1 - 1, H + 1.6, sh.cz + sh.b - 2.4);
  g.add(runner(wrand, sh, bank));
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
  // (on the string to a stake in the sand behind; a kite with no dry sand for
  // its stake is not flown, and none flies in rain or storm)
  const kites = [];
  for (let i = 0; i < 2; i++) {
    const at = new THREE.Vector3(W * (0.25 + i * 0.5), 9 + rand() * 2, -4 - rand() * 3);
    const spot = [[3, -2], [-3, -2], [2, -4], [-2, -4], [4, 0], [-4, 0], [0, -6]].map(([dx, dz]) => [at.x + dx, at.z + dz]).find(([x, z]) => dry(x, z, 0.3) && !onBoard(x, z, 1) && free(x, z, 0.3));
    if (!spot) continue;
    const kt = kite(rand, [C.cap, P.towel, 0xf5b83d][i % 3], new THREE.Vector3(spot[0] - at.x, GRASS + bank(spot[0], spot[1]) - at.y, spot[1] - at.z));
    kt.position.copy(at);
    reserve(spot[0], spot[1], 0.3);
    g.add(kt);
    kites.push(kt);
  }
  // the fade: a crown near the line from the eye to the ball goes see-through
  g.userData.fade = fadeLoop(fading);

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
  // the beach in the weather: in rain or storm no one sunbathes, in wind the parasols lean
  weatherLooks(g, (w) => (w.rain || w.storm || w.snow ? "wet" : w.wind ? "wind" : "clear"));
  // the kites are landed in the wet, with the sunbathers
  const dress = g.userData.weather;
  g.userData.weather = (w) => (dress(w), kites.forEach((k) => (k.visible = !(w && (w.rain || w.storm || w.snow)))));
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
  p.userData.foot = 0.35; // where the trunk leaves the planter: still there
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

/**
 * A rowing boat beached across the lane (island4): the chain's bar is its
 * footprint exactly — the hull runs the bar's length and width, square at
 * the stern (the bar's start) and pointed at the bow, with two thwarts and a
 * pair of oars shipped along them, listing a little as a boat does on sand.
 */
function rowingBoat(bar, t) {
  const [cx, cz] = bar.c, L = bar.length, W = bar.thick || 1.4, H = 0.6;
  const g = new THREE.Group();
  // the hull in plan: x along the bar (-L/2 stern .. +L/2 bow), y across
  const plan = (inset) => {
    const l = L / 2 - inset, w = W / 2 - inset, s = new THREE.Shape();
    s.moveTo(-l, -w * 0.8);
    s.quadraticCurveTo(-l, -w, -l + 0.3, -w);
    s.lineTo(l * 0.25, -w);
    s.quadraticCurveTo(l * 0.85, -w, l, 0);
    s.quadraticCurveTo(l * 0.85, w, l * 0.25, w);
    s.lineTo(-l + 0.3, w);
    s.quadraticCurveTo(-l, w, -l, w * 0.8);
    s.closePath();
    return s;
  };
  // extruded up (the shape's y becomes the world's z once laid flat)
  const lay = (geo) => geo.rotateX(-Math.PI / 2);
  const ext = (shape, depth) => lay(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }));
  const ring = (inset) => { const r = plan(0); r.holes.push(plan(inset)); return r; };
  const keel = drawn(ext(plan(0), 0.25), flat(0x3f7fa6)); // the bottom, solid
  const sides = drawn(ext(ring(0.12), H - 0.25), flat(0x3f7fa6)); // the planking, open inside
  sides.position.y = 0.25;
  const strake = drawn(ext(ring(0.12), 0.07), flat(C.cream)); // the gunwale
  strake.position.y = H;
  const floor = drawn(ext(plan(0.12), 0.02), flat(P.trunk)); // the boards inside
  floor.position.y = 0.25;
  g.add(keel, sides, strake, floor);
  for (const u of [-0.22, 0.12]) {
    const thwart = drawn(rbox(0.26, 0.06, W - 0.3, 0.02), flat(P.trunkDark));
    thwart.position.set(u * L, H - 0.12, 0);
    g.add(thwart);
  }
  for (const side of [-1, 1]) {
    const oar = drawn(new THREE.CylinderGeometry(0.04, 0.04, L * 0.7, 6).rotateZ(Math.PI / 2), flat(C.cream));
    oar.position.set(-0.05 * L, H - 0.02, side * (W / 2 - 0.3));
    const blade = drawn(rbox(0.5, 0.03, 0.18, 0.01), flat(C.cream));
    blade.position.set(0.3 * L, H - 0.02, side * (W / 2 - 0.3));
    g.add(oar, blade);
  }
  const tilt = new THREE.Group();
  tilt.add(g);
  g.rotation.x = 0.08; // listing onto one side on the sand
  tilt.rotation.y = -bar.ang;
  tilt.position.set(cx, ground(t, cx, cz) - 0.05, cz);
  return tilt;
}

/** A zone's polygon as a flat geometry (x, 0, z) about (cx, cz), cut in unit
 *  squares so it can follow the ground: each square's piece of the polygon
 *  (Sutherland–Hodgman), triangulated on its own. */
function polyGeometry(poly, cx, cz) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]), pos = [];
  const clip = (pts, inside, cut) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); }
      else if (inside(a)) out.push(cut(a, b));
    }
    return out;
  };
  const atX = (x) => (a, b) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atZ = (zz) => (a, b) => [a[0] + ((b[0] - a[0]) * (zz - a[1])) / (b[1] - a[1]), zz];
  for (let x = Math.floor(Math.min(...xs)); x < Math.max(...xs); x++)
    for (let zz = Math.floor(Math.min(...zs)); zz < Math.max(...zs); zz++) {
      let piece = clip(poly, (p) => p[0] >= x, atX(x));
      piece = clip(piece, (p) => p[0] <= x + 1, atX(x + 1));
      piece = clip(piece, (p) => p[1] >= zz, atZ(zz));
      piece = clip(piece, (p) => p[1] <= zz + 1, atZ(zz + 1));
      if (piece.length < 3) continue;
      const v = piece.map(([a, b]) => new THREE.Vector2(a, b));
      for (const tri of THREE.ShapeUtils.triangulateShape(v, [])) {
        // wound to face up (+y): in (x, z) that is clockwise
        const [a, b, c] = tri.map((k) => v[k]), up = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0;
        for (const q of up ? [a, b, c] : [a, c, b]) pos.push(q.x - cx, 0, q.y - cz);
      }
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// a flat shape filling a zone's footprint exactly (its ellipse if round, its
// polygon if it has one), laid on the ground a hair above it
function footprint(z, t, material, lift = 0.05, seg = 40) {
  onTop(material);
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const poly = z.poly && z.poly.length > 2 && !z.outside;
  const geo = poly ? polyGeometry(z.poly, cx, cz) : z.round ? new THREE.CircleGeometry(1, seg).scale((x1 - x0) / 2, (z1 - z0) / 2, 1) : new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 4);
  if (!poly) geo.rotateX(-Math.PI / 2);
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
  if (z.poly && z.poly.length > 2 && !z.outside) {
    // a pool in the rock: its edge inked, and a starfish or two on its floor
    const loop = z.poly.map(([x, zz]) => new THREE.Vector3(x, ground(t, x, zz) + 0.16, zz));
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(loop), new THREE.LineBasicMaterial({ color: 0x3d5a63 })));
    const n = z.poly.length, c = z.poly.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
    // rocks round its edge, just inside the water (where a ball is already sunk)
    for (let k = 0; k < n; k++) {
      const a = z.poly[k], b = z.poly[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let u = 0.45 / L; u < 1; u += 0.85 / L) {
        let x = a[0] + (b[0] - a[0]) * u, zz = a[1] + (b[1] - a[1]) * u;
        const d = Math.hypot(c[0] - x, c[1] - zz) || 1;
        x += ((c[0] - x) / d) * 0.32;
        zz += ((c[1] - zz) / d) * 0.32;
        if (!inZone(z, x, zz)) continue;
        const r = pebble(rand);
        r.scale.multiplyScalar(1.4 + rand() * 0.8);
        r.position.set(x, ground(t, x, zz) + 0.08, zz);
        g.add(r);
      }
    }
    for (let k = 0; k < 2; k++) {
      const [px, pz] = z.poly[k * 2 % n], x = c[0] + (px - c[0]) * 0.45, zz = c[1] + (pz - c[1]) * 0.45;
      if (!inZone(z, x, zz)) continue;
      const f = starfish(rand);
      f.position.set(x, ground(t, x, zz) + 0.17, zz);
      f.rotation.y = rand() * 6;
      g.add(f);
    }
  }
  return g;
}

/**
 * A blowhole (a timed tunnel): a craggy rim of rock on the zone's own
 * ellipse, low enough to roll over, around a real hole going down to the
 * sea. The water in it swells before a spout, the spout shoots up as a
 * tapered column with a foam cap and spray, and falls back leaving the rock
 * wet; between spouts a wisp of mist and a few bubbles. All on the timed
 * pieces' clock (state.timed), so it spouts on screen when the chain throws.
 * A ball thrown out flies an arc to where it comes down (state.tubes).
 * The lane's cells over the hole are left open (course.js), so the hole is
 * a hole, under a lid of two rock slabs that is shut (the ball rolls over
 * it) except while it spouts. Instanced spray and rocks; nothing allocated
 * per frame.
 */
export const BLOWHOLE_MOUTH = 0.5; // the hole's size, a share of the zone's ellipse
function blowhole(z, t) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = (x1 - x0) / 2, b = (z1 - z0) / 2;
  const y = ground(t, cx, cz), rand = seeded("blowhole" + z.min.join());
  const ph1 = rand() * 6, ph2 = rand() * 6;
  const crag = (th) => 1 + 0.05 * Math.sin(5 * th + ph1) + 0.035 * Math.sin(11 * th + ph2);
  // the rim, swept round: [radius (share of the ellipse), height, colour];
  // dry rock outside, wet and darker at the lip, dark down the throat
  const dry = new THREE.Color(0x9aa3a9), wet = new THREE.Color(0x5f6c74), deep = new THREE.Color(0x26363d);
  const M = BLOWHOLE_MOUTH;
  const prof = [[1, 0.01, dry], [0.9, 0.09, dry], [0.79, 0.19, dry], [0.69, 0.22, wet], [0.6, 0.14, wet], [M + 0.02, 0.02, wet], [M - 0.02, -0.3, deep], [M - 0.04, -1.1, deep]];
  const A = 56, pos = [], col = [], idx = [];
  for (let k = 0; k <= A; k++) {
    const th = (k / A) * Math.PI * 2, n = crag(th);
    prof.forEach(([r, h, c], j) => {
      const nn = j < 5 ? n : 1 + (n - 1) * 0.4, hh = h > 0 ? h * (0.8 + 0.4 * (0.5 + 0.5 * Math.sin(7 * th + ph2))) : h;
      pos.push(cx + Math.cos(th) * a * r * nn, y + hh, cz + Math.sin(th) * b * r * nn);
      col.push(c.r, c.g, c.b);
    });
  }
  const P = prof.length;
  for (let k = 0; k < A; k++) for (let j = 0; j + 1 < P; j++) {
    const q0 = k * P + j, q1 = (k + 1) * P + j;
    idx.push(q0, q1, q0 + 1, q1, q1 + 1, q0 + 1);
  }
  const rimGeo = new THREE.BufferGeometry();
  rimGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  rimGeo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  rimGeo.setIndex(idx);
  rimGeo.computeVertexNormals();
  // wound to face up on the outer slope (the ink hull needs it)
  if (rimGeo.attributes.normal.getY(P + 1) < 0) { rimGeo.setIndex(idx.map((v, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); rimGeo.computeVertexNormals(); }
  g.add(drawn(rimGeo, flat(0xffffff, { vertexColors: true, side: THREE.DoubleSide })));
  // chunky rocks and barnacles on the rim, all low: the ball rolls over it
  const dummy = new THREE.Object3D();
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), flat(0x88919a), 7);
  for (let k = 0; k < 7; k++) {
    const th = (k / 7) * Math.PI * 2 + rand() * 0.5, r = 0.8 + rand() * 0.1, s = 0.14 + rand() * 0.1;
    dummy.position.set(cx + Math.cos(th) * a * r * crag(th), y + 0.1, cz + Math.sin(th) * b * r * crag(th));
    dummy.scale.set(s * 1.3, s * 0.8, s);
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(k, dummy.matrix);
  }
  const barn = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1.4, 6), flat(0xe6e0cf), 14);
  for (let k = 0; k < 14; k++) {
    const th = rand() * Math.PI * 2, r = 0.62 + rand() * 0.12, s = 0.035 + rand() * 0.03;
    dummy.position.set(cx + Math.cos(th) * a * r * crag(th), y + 0.17, cz + Math.sin(th) * b * r * crag(th));
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    barn.setMatrixAt(k, dummy.matrix);
  }
  g.add(rocks, barn);
  // two tiny pools caught in hollows of the rim
  for (let k = 0; k < 2; k++) {
    const th = ph1 + k * 2.6, r = 0.86;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 14).scale(0.16, 0.11, 1).rotateX(-Math.PI / 2), onTop(new THREE.MeshBasicMaterial({ color: 0x6fc3c9 }), 2));
    pool.position.set(cx + Math.cos(th) * a * r, y + 0.1, cz + Math.sin(th) * b * r);
    g.add(pool);
  }
  // the water down the hole, sloshing on the clock
  const mouth = new THREE.CircleGeometry(1, 28).scale(a * M * 0.95, b * M * 0.95, 1).rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(mouth, flat(0x1d5a6e, {}));
  const foam = new THREE.Mesh(new THREE.RingGeometry(0.78, 1, 28).scale(a * M * 0.95, b * M * 0.95, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
  water.position.set(cx, y - 0.48, cz);
  foam.position.set(cx, y - 0.47, cz);
  g.add(water, foam);
  // the spout: a tapered column, toon-shaded, capped with foam
  const colGeo = new THREE.LatheGeometry([0, 0.2, 0.45, 0.7, 0.88, 1].map((u) => new THREE.Vector2(Math.max(0.05, (1 - u) * 0.62 + 0.24 + 0.06 * Math.sin(u * 9)), u * 4.4)), 14);
  const column = new THREE.Mesh(colGeo, flat(0xd9f1f7, { transparent: true, opacity: 0.92 }));
  const cap = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flat(0xffffff), 6);
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI * 2, s = 0.3 + rand() * 0.12;
    dummy.position.set(Math.cos(th) * 0.28, 4.35 + rand() * 0.2, Math.sin(th) * 0.28);
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    cap.setMatrixAt(k, dummy.matrix);
  }
  const spout = new THREE.Group();
  spout.add(column, cap);
  spout.position.set(cx, y - 0.48, cz);
  g.add(spout);
  // spray (and, between spouts, bubbles): soft round droplets, instanced
  const N = 48, drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), flat(0xffffff), N);
  drops.frustumCulled = false;
  const seeds = [];
  for (let k = 0; k < N; k++) seeds.push([rand() * Math.PI * 2, 0.4 + rand() * 0.6, rand(), 0.05 + rand() * 0.07]);
  // mist: a few soft puffs
  const puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }), 5);
  puffs.frustumCulled = false;
  // the rock left wet round the rim after a spout
  const wetRing = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.35, 40).scale(a, b, 1).rotateX(-Math.PI / 2), onTop(new THREE.MeshBasicMaterial({ color: 0x2c4a4f, transparent: true, opacity: 0, depthWrite: false }), 2));
  wetRing.position.set(cx, y + 0.04, cz);
  g.add(drops, puffs, wetRing);
  // the lid: two slabs of wet rock over the mouth, flush with the lane, hinged
  // at its sides. Shut, the ball rolls over them, as the chain has it; the
  // sea bursts them open for the throw, on the same clock
  const doors = [];
  for (const sgn of [-1, 1]) {
    const rx = a * M * 0.97, rz = b * M * 0.97, pts = [];
    // its half of the mouth, a crack's width short of the middle, about its hinge
    for (let k = 0; k <= 16; k++) {
      const th = -Math.PI / 2 + (k / 16) * Math.PI;
      pts.push(new THREE.Vector2(sgn * (Math.max(0.03, Math.cos(th) * rx) - rx), Math.sin(th) * rz));
    }
    if (sgn < 0) pts.reverse(); // one winding for both
    const slab = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.12, bevelEnabled: false });
    slab.rotateX(-Math.PI / 2).translate(0, -0.12, 0);
    const hinge = new THREE.Group();
    hinge.position.set(cx + sgn * rx, y + 0.02, cz);
    hinge.add(drawn(slab, flat(0x6d7880)));
    // barnacles and a crack on the slab's top, so it reads as rock
    for (let k = 0; k < 4; k++) {
      const bn = new THREE.Mesh(new THREE.CircleGeometry(0.05 + rand() * 0.04, 6).rotateX(-Math.PI / 2), flat(0xe6e0cf));
      bn.position.set(-sgn * rx * (0.3 + rand() * 0.5), 0.005, (rand() - 0.5) * rz);
      hinge.add(bn);
    }
    hinge.userData.live = true;
    g.add(hinge);
    doors.push([hinge, sgn]);
  }
  let lid = 0;
  for (const m of [water, foam, spout, drops, puffs, wetRing]) m.userData.live = true;
  // the clock: where in its cycle the blowhole is, and whether it spouts
  const every = z.every | 0, onFor = z.on | 0, phase = z.phase | 0;
  let step = 0;
  state.timed.push({ at: (st) => (step = st) });
  let on = 0, lvl = 0, wetK = 0, last = null, fall = 1;
  animate((tt) => {
    const dt = last === null ? 0 : Math.min(0.1, tt - last);
    last = tt;
    const p = every ? mod(step + phase, every) : 0, spouting = !every || p < onFor;
    // the water swells over the last three substeps before a spout
    const want = spouting ? 1 : every && p > every - 3 ? (p - (every - 3)) / 3 : 0;
    lvl += (want - lvl) * Math.min(1, dt * 10);
    on += ((spouting ? 1 : 0) - on) * Math.min(1, dt * (spouting ? 20 : 7));
    if (spouting) (fall = 0), (wetK = 1);
    else fall = Math.min(1, fall + dt * 1.6);
    wetK = Math.max(0, wetK - dt * 0.5);
    const wy = y - 0.48 + 0.4 * lvl + 0.03 * Math.sin(tt * 5);
    water.position.y = wy;
    foam.position.y = wy + 0.01;
    foam.material.opacity = 0.35 + 0.5 * lvl;
    spout.position.y = wy;
    spout.visible = on > 0.03;
    // the lid flies open with the spout, and drops shut after it
    lid += ((spouting ? 1 : 0) - lid) * Math.min(1, dt * (spouting ? 28 : 10));
    for (const [hinge, sgn] of doors) hinge.rotation.z = sgn * lid * 1.75;
    spout.scale.set(0.75 + 0.25 * on + 0.04 * Math.sin(tt * 23), Math.max(0.03, on), 0.75 + 0.25 * on + 0.04 * Math.cos(tt * 19));
    wetRing.material.opacity = 0.35 * wetK;
    wetRing.visible = wetRing.material.opacity > 0.01;
    for (let k = 0; k < N; k++) {
      const [th, sp, u0, r] = seeds[k];
      if (on > 0.05 || fall < 1) {
        // flung out of the column's head and falling round the rim
        const u = (tt * (0.8 + sp * 0.6) + u0) % 1, top = 4.4 * Math.max(on, 0.25) * sp, out = (0.3 + 1.5 * u) * (a + b) * 0.5 * sp;
        dummy.position.set(cx + Math.cos(th) * out, wy + top * (1 - (2 * u - 1) * (2 * u - 1) * 0.9) * (1 - fall * 0.7) - fall * u * 1.2, cz + Math.sin(th) * out);
        dummy.scale.setScalar(r * (1 - u * 0.5) * (1 - fall));
      } else {
        // bubbles popping on the water
        const u = (tt * 0.6 + u0) % 1;
        dummy.position.set(cx + Math.cos(th) * a * M * 0.7 * sp, wy + 0.03, cz + Math.sin(th) * b * M * 0.7 * sp);
        dummy.scale.setScalar(k % 3 ? 0 : r * 0.6 * Math.sin(Math.PI * u));
      }
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      drops.setMatrixAt(k, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < 5; k++) {
      const u = (tt * 0.25 + k / 5) % 1;
      dummy.position.set(cx + Math.sin(k * 2.1 + tt * 0.4) * 0.25, y + 0.1 + u * 1.3, cz + Math.cos(k * 1.7) * 0.25);
      dummy.scale.setScalar((0.18 + u * 0.25) * (on > 0.05 ? 0 : Math.sin(Math.PI * u)));
      dummy.updateMatrix();
      puffs.setMatrixAt(k, dummy.matrix);
    }
    puffs.instanceMatrix.needsUpdate = true;
  });
  // the throw: up out of the hole and over, to where the ball comes down
  const [ox, oz] = z.vec, oy = ground(t, ox, oz);
  const arc = [];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24;
    arc.push(new THREE.Vector3(cx + (ox - cx) * u, y + 0.5 + (oy - y) * u + 5.5 * Math.sin(Math.PI * u), cz + (oz - cz) * u));
  }
  const path = new THREE.CatmullRomCurve3(arc);
  path.userData = { arc: true };
  state.tubes.set(z, path);
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
    m.visible = m.material.opacity > 0.01;
  }));
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
function wreck(z, t) {
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
    if (k === "rowing boat") return rowingBoat(item, t);
    // (a pier backstop is a polyline, not a bar: it keeps the shared kerb)
    return null;
  }
  if (kind === "zone") {
    if (k === "wetsand") return footprint(item, t, flatTop(P.wet));
    if (k === "sand") return footprint(item, t, flatTop(P.sand));
    if (k === "tidepool") return waterZone(item, t, s);
    if (k === "lagoon") return waterZone(item, t, s, { color: 0x4fc4c9 });
    if (k === "wave") return wave(item, t);
    if (k === "blowhole") return blowhole(item, t);
    // (a gap, missing planks, is the shared deckGap in zones.js)
    if (k === "sea") return new THREE.Group(); // the world's sea shows round the lane
    if (item.islandDressed) return null;
    if (k === "shipwreck") return withDefault(item, s, t, wreck(item, t));
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
      if (s.zones.some((q) => q.skin === "gap" && x > q.min[0] - 0.4 && x < q.max[0] + 0.4 && z > q.min[1] - 0.4 && z < q.max[1] + 0.4)) continue; // (a gap has its own posts)
      piles.push(new THREE.CylinderGeometry(0.16, 0.2, GRASS - SEA + 0.8, 6).translate(x, (GRASS + SEA - 0.8) / 2, z));
    }
  }
  if (piles.length) g.add(drawn(mergeGeometries(piles), flat(P.trunkDark)));
  return g;
}

/** The lane's own ground, for course.js: boardwalk planks where the lane is a
 *  boardwalk over the water (the pier and the broken boardwalk), else green. */
// the rock pools' shelf is flat rock, not a lawn
export const green = (s) => (/island(9|10)$/.test(s.hole) ? "planks" : /island8$/.test(s.hole) ? [0xaeb0a6, 0xa5a79d] : null);
