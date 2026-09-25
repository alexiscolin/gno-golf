import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, ink, flat, drawn, grows, sway, rbox, windNow, share, texOf, fadeable, setFade, fadeLoop } from "./materials";
import { animate } from "./state";
import { timeOf } from "./camera";
import { lantern, fireflies, tree, bush, stone, flower, bigFlower, gnomelet, brolly, mailbox, signpost, hill, house, pond, puddle, fence, mushroom, tuft, bunting, butterfly } from "./props";



// ---------------------------------------------------------------- the set
//
// A garden around the green: trees, bushes, stones, a signpost, hills and a
// couple of clouds. It is decoration and nothing else — no obstacle lives out
// here, and the seed is the hole's own name, so each course keeps its garden
// from one visit to the next.

import { seeded, ISLAND, GRASS, placer, tangentInto, type Rand } from "./common";
import { smoothstep } from "../terrain";
import { look, weatherLooks } from "./bake";
import { ud, type Hole, type Height } from "./data";
import type { Rough } from "./worlds";

/** What a backdrop gets: the hole's random, the island's extent, the board's size and the placer. */
interface Backdrop {
  rand: Rand;
  X0: number;
  X1: number;
  Z0: number;
  W: number;
  H: number;
  reserve: (x: number, z: number, r: number) => void;
  free: (x: number, z: number, r: number) => boolean;
}

/** Pebbles caught in the island's soil, so its sides read as earth. */
function edging(box: THREE.Box3, seed: string) {
  if (cloudy(seed)) return new THREE.Group();
  const g = new THREE.Group();
  const rand = seeded("edge" + seed);
  const y = GRASS - 0.7;
  const { min, max } = box;

  const face = (n: number, pos: (t: number) => THREE.Vector3) => {
    for (let i = 0; i < n; i++) {
      const p = drawn(new THREE.DodecahedronGeometry(0.2 + rand() * 0.22, 0), flat(rand() > 0.4 ? C.stone : C.woodDark));
      p.position.copy(pos(rand()));
      p.position.y = y - 0.5 - rand() * (ISLAND.soil + GRASS - 1.3);
      p.scale.set(1, 0.7, 0.6);
      p.rotation.set(rand(), rand(), rand());
      g.add(p);
    }
  };
  face(16, (t) => new THREE.Vector3(min.x + 0.6 + t * (max.x - min.x - 1.2), 0, max.z - 0.14));
  face(8, (t) => new THREE.Vector3(min.x + 0.14, 0, min.z + 0.6 + t * (max.z - min.z - 1.2)));
  face(8, (t) => new THREE.Vector3(max.x - 0.14, 0, min.z + 0.6 + t * (max.z - min.z - 1.2)));
  return g;
}

// ------------------------------------------------------------ backdrops
//
// Three landscapes for the back of the island. Which one a hole gets is a hash
// of its id: stable for a course, and different from its neighbours often
// enough that eighteen holes do not look like one.

// A few holes have a dream of their own; the rest take one of the three
// everyday backdrops by a hash of their id.
const THEME: Record<string, string> = { hole5: "giants", hole10: "giants", hole17: "giants", hole8: "clouds", hole14: "clouds", hole19: "clouds" };
const themeOf = (id: string) => {
  const named = THEME[String(id).split("/").pop()!];
  if (named) return named;
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ["hills", "stream", "mountains"][h % 3];
};

function hills({ rand, X0, X1, reserve, free }: Backdrop) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = hill(rand, i % 2 === 1);
    const r = ud(m).r!, x = X0 + 10 + ((X1 - X0 - 13) * i) / 3 + (rand() - 0.5) * 2, z = -ISLAND.back + 3.6;
    // its footprint is an oval 1.15r by 0.75r: two circles cover it
    const feet = [-1, 1].map((k) => [x + k * r * 0.55, r * 0.9] as const);
    if (!feet.every(([fx, fr]) => free(fx, z, fr))) continue;
    m.position.set(x, GRASS, z);
    g.add(m);
    for (const [fx, fr] of feet) reserve(fx, z, fr);
  }
  return g;
}

/** Water streaks that scroll: what makes a sheet of water read as running. */
function streaks(rand: Rand, repeat: number) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#8fd0ee"; ctx.fillRect(0, 0, 32, 128);
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (let k = 0; k < 14; k++) ctx.fillRect(Math.floor(rand() * 28), Math.floor(rand() * 128), 3, 10 + rand() * 18);
  const tex = texOf(c); // sRGB, like every colour texture
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, repeat);
  return tex;
}

/** A ribbon of quads along `pts`, `half(k)` wide at point k, across `side(k)`. */
function ribbon(pts: readonly THREE.Vector3[], half: (k: number) => number, side: (k: number) => THREE.Vector3, v = (k: number) => k / (pts.length - 1)) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pts.forEach((p, k) => {
    const s = side(k), w = half(k);
    pos.push(p.x - s.x * w, p.y, p.z - s.z * w, p.x + s.x * w, p.y, p.z + s.z * w);
    uv.push(0, v(k), 1, v(k));
    if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A stream across the back: it wells up from a spring among stones, winds
 * flush with the grass under a bridge, and spills off the island's edge down
 * its soil face. One ribbon of water, narrow at the spring — no boxes.
 */
function stream({ rand, X0, X1, reserve }: Backdrop) {
  const g = new THREE.Group();
  const z = -ISLAND.back + 3.2, x0 = X0 + 3, edge = X1 + 0.8; // the island's right face
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    // it winds: two bends of different sizes, never a ruled line
    pts.push(new THREE.Vector3(x0 + (edge - x0) * t, GRASS + 0.04, z + Math.sin(t * Math.PI * 3.2) * 1.8 + Math.sin(t * Math.PI * 7.1 + 1) * 0.5));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  // the whole ribbon and its banks: nothing stands in the water
  for (let i = 0; i <= 60; i++) {
    const p = curve.getPoint(i / 60);
    reserve(p.x, p.z, 1.3);
  }
  const N = 90, along = Array.from({ length: N + 1 }, (_, k) => curve.getPoint(k / N));
  const across = (k: number) => { const q = curve.getTangent(k / N); return new THREE.Vector3(-q.z, 0, q.x).normalize(); };
  const width = (k: number) => 0.7 * Math.min(1, 0.35 + (k / N) * 9); // narrow at the spring, 1.4 wide soon after
  const wet = flat(C.bark, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const bankPts = along.map((p) => p.clone().setY(GRASS + 0.025));
  g.add(new THREE.Mesh(ribbon(bankPts, (k) => width(k) + 0.22, across), wet));
  g.add(new THREE.Mesh(ribbon(along, width, across), flat(C.pond, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  for (const sgn of [-1, 1]) {
    const line = along.map((p, k) => p.clone().addScaledVector(across(k), sgn * width(k)).setY(GRASS + 0.05));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), ink));
  }
  // the spring: a little pool it wells out of, ringed with stones
  const src = along[0];
  const spring = puddle(0.8, 0.65, rand);
  spring.position.set(src.x - 0.3, GRASS, src.z);
  for (const [x, zz] of ud(spring).outline!(0.3).filter((_, k) => k % 6 === 0)) {
    if (x > 0.3) continue; // open on the side the stream runs out
    const st = stone(rand);
    st.scale.setScalar(0.4);
    st.position.set(x, 0.1, zz);
    spring.add(st);
  }
  g.add(spring);
  reserve(src.x - 0.3, src.z, 1.4);
  // pebbles along the banks, on the bank and not in the water
  for (let i = 0; i < 16; i++) {
    const k = 4 + Math.floor(rand() * (N - 10)), p = along[k], sgn = rand() > 0.5 ? 1 : -1;
    const st = stone(rand);
    st.scale.setScalar(0.35);
    st.position.copy(p).addScaledVector(across(k), sgn * (width(k) + 0.35)).setY(GRASS + 0.08);
    g.add(st);
  }
  // foam drifting downstream, so the water visibly flows
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const foam = Array.from({ length: 10 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.35, 2, 6), foamMat);
    m.rotation.z = Math.PI / 2;
    ud(m).live = true;
    g.add(m);
    return { m, off: i / 10, lane: (rand() - 0.5) * 0.8 };
  });
  // and over the edge: the stream bends down the soil face as a falling sheet
  const end = along[N], side = across(N);
  const fallPts = [
    end.clone(),
    new THREE.Vector3(edge + 0.12, GRASS - 0.12, end.z),
    new THREE.Vector3(edge + 0.2, GRASS - 0.6, end.z),
    new THREE.Vector3(edge + 0.26, -ISLAND.soil + 0.3, end.z),
  ];
  const fallCurve = new THREE.CatmullRomCurve3(fallPts), M = 24;
  const fallAlong = Array.from({ length: M + 1 }, (_, k) => fallCurve.getPoint(k / M));
  const tex = streaks(rand, 2);
  const fade = document.createElement("canvas");
  fade.width = 4; fade.height = 64;
  const fg = fade.getContext("2d")!, grd = fg.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "#fff"); grd.addColorStop(0.7, "#fff"); grd.addColorStop(1, "#000");
  fg.fillStyle = grd; fg.fillRect(0, 0, 4, 64);
  const alpha = new THREE.CanvasTexture(fade);
  alpha.flipY = false;
  const sheet = new THREE.Mesh(
    ribbon(fallAlong, (k) => width(N) * (1 - (k / M) * 0.25), () => side, (k) => k / M),
    new THREE.MeshBasicMaterial({ map: tex, alphaMap: alpha, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  ud(sheet).live = true;
  g.add(sheet);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), tmp = new THREE.Vector3(); // written in place each frame
  animate((t) => {
    tex.offset.y = t * 1.4;
    foam.forEach(({ m, off, lane }) => {
      const u = (t * 0.035 + off) % 1;
      curve.getPoint(u, p), tangentInto(curve, u, q, tmp);
      m.position.set(p.x - q.z * lane * Math.min(1, u * 9), GRASS + 0.1, p.z + q.x * lane * Math.min(1, u * 9));
      m.rotation.y = -Math.atan2(q.z, q.x);
    });
  });

  // the bridge: a plank arch with rails
  const mid = curve.getPoint(0.55);
  const bridge = new THREE.Group();
  for (let i = -3; i <= 3; i++) {
    const plank = drawn(rbox(0.42, 0.14, 2.4, 0.05), flat(i % 2 ? C.wood : C.woodDark));
    plank.position.set(i * 0.45, 0.35 - (i * i) * 0.03, 0);
    bridge.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = drawn(rbox(3.2, 0.12, 0.12, 0.05), flat(C.woodDark));
    rail.position.set(0, 0.95, side * 1.1);
    bridge.add(rail);
    for (const x of [-1.5, 1.5]) {
      const post = drawn(rbox(0.16, 0.8, 0.16, 0.05), flat(C.woodDark));
      post.position.set(x, 0.55, side * 1.1);
      bridge.add(post);
    }
  }
  bridge.position.set(mid.x, GRASS, mid.z);
  bridge.rotation.y = -Math.atan2(curve.getTangent(0.55).z, curve.getTangent(0.55).x) + Math.PI / 2;
  g.add(bridge);
  return g;
}

/**
 * A far range: big hazy peaks on their own low strip of land well behind the
 * island, so they tower over it without standing on (or in) anything of it.
 * `tips` leaves only their snowy tops showing, over a sea of clouds.
 */
function farRange(rand: Rand, X0: number, X1: number, { tips = false } = {}) {
  const g = new THREE.Group();
  // far off and hazy: small on screen, a band along the horizon
  const z = -ISLAND.back - 48, span = X1 - X0 + 80, haze = 0xb4c6c2;
  if (!tips) {
    const land = new THREE.Mesh(new THREE.BoxGeometry(span, 1, 26), flat(haze));
    land.position.set((X0 + X1) / 2, GRASS - 6, z);
    g.add(land);
  }
  const n = Math.round(span / 12);
  for (let k = 0; k < n; k++) {
    const h = 11 + rand() * 9, r = h * 0.6;
    const peak = new THREE.Group();
    const rock = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), flat(haze));
    rock.position.y = h / 2;
    const snowH = h * 0.3;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.3 + 0.05, snowH, 7), flat(0xf2f6f6));
    snow.position.y = h - snowH / 2 + 0.03;
    peak.add(rock, snow);
    peak.position.set(X0 - 40 + (span * (k + 0.5)) / n + (rand() - 0.5) * 5, GRASS - (tips ? h * 0.75 : 5.5), z + (rand() - 0.5) * 8);
    peak.rotation.y = rand() * Math.PI;
    g.add(peak);
  }
  return g;
}

/** Rocky peaks with snow on top — the tallest thing on any island. */
function mountains({ rand, X0, X1, reserve, free }: Backdrop) {
  const g = new THREE.Group();
  const peaks = [[0.12, 7.5], [0.3, 10], [0.5, 12.5], [0.7, 9.5], [0.9, 7]];
  for (const [t, h] of peaks) {
    // as wide as the strip behind the board allows: off the island's back
    // edge, and clear of the board's back wall
    const r = Math.min(h * 0.55, (ISLAND.back - 1.6) / 2);
    const peak = new THREE.Group();
    const rock = drawn(new THREE.ConeGeometry(r, h, 6), flat(t === 0.45 ? C.stone : 0x8a9a8c));
    rock.position.y = h / 2;
    const snowH = h * 0.3;
    const snow = drawn(new THREE.ConeGeometry(r * 0.3 + 0.05, snowH, 6), flat(0xffffff));
    snow.position.y = h - snowH / 2 + 0.02;
    peak.add(rock, snow);
    peak.position.set(X0 + 8 + (X1 - X0 - 9) * t + (rand() - 0.5), GRASS, -ISLAND.back + 0.4 + r);
    if (t !== 0.5 && !free(peak.position.x, peak.position.z, r * 0.85)) continue; // the house is there
    peak.rotation.y = t === 0.5 ? 0 : rand() * Math.PI;
    g.add(peak);
    if (t === 0.5) {
      // the tallest one has a waterfall down one of its ridges — the one
      // facing front-left, so it runs down the rock and its pool stays
      // behind the board instead of falling onto the green
      const dir = new THREE.Vector3(-Math.sin(Math.PI / 3), 0, Math.cos(Math.PI / 3)); // a ridge of the six-sided cone
      const fall = waterfall(peak.position, dir, r, h, rand);
      g.add(fall);
      const { x: px, z: pz, r: pr } = ud(fall).pool!;
      reserve(px, pz, pr);
    }
    reserve(peak.position.x, peak.position.z, r * 0.9);
  }
  return g;
}

/** A texture that fades a ribbon's two edges out, so falling water has no hard sides. */
let softEdges: THREE.CanvasTexture | null = null;
function soft() {
  if (softEdges) return softEdges;
  const c = document.createElement("canvas");
  c.width = 64; c.height = 4;
  const x = c.getContext("2d")!, grd = x.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, "#000"); grd.addColorStop(0.25, "#fff"); grd.addColorStop(0.75, "#fff"); grd.addColorStop(1, "#000");
  x.fillStyle = grd; x.fillRect(0, 0, 64, 4);
  return (softEdges = share(texOf(c)));
}

/**
 * A waterfall off the tallest peak. It wells out of a notch in the rock, curls
 * out over a ledge, then runs down the ridge as one soft-edged ribbon with two
 * thin strands beside it, into a pool nestled at the mountain's foot: foam
 * where it lands, spray, and rings that stay inside the pool.
 */
function waterfall(base: THREE.Vector3, dir: THREE.Vector3, r: number, h: number, rand: Rand) {
  const g = new THREE.Group();
  const side = new THREE.Vector3(dir.z, 0, -dir.x);
  // a point on the ridge at height y, `lift` out from the rock
  const at = (y: number, lift = 0.25) => base.clone().addScaledVector(dir, r * (1 - y / h) + lift).setY(base.y + y);
  const top = h * 0.55;
  // the pool: its back tucked under the rock, long across the ridge
  const centre = at(0, 1.0);
  const pool = puddle(2.4, 1.3, rand);
  pool.position.copy(centre).setY(base.y);
  for (const [x, zz] of ud(pool).outline!(0.35).filter((_, k) => k % 4 === 0)) {
    const st = stone(rand);
    st.scale.setScalar(0.45 + rand() * 0.2);
    st.position.set(x, 0.1, zz);
    pool.add(st);
  }
  g.add(pool);
  const land = at(0, 0.7).setY(base.y + 0.06);
  // the ledge it spills over, and the notch it comes out of
  const ledge = drawn(new THREE.DodecahedronGeometry(0.55, 0), flat(C.stone));
  ledge.position.copy(at(top - 0.35, 0.3));
  ledge.scale.set(1.3, 0.45, 1.3);
  const notch = new THREE.Mesh(new THREE.CircleGeometry(0.4, 12), new THREE.MeshBasicMaterial({ color: C.burrow }));
  notch.position.copy(at(top + 0.1, 0.05));
  notch.lookAt(notch.position.clone().add(dir).setY(notch.position.y + 0.6));
  g.add(ledge, notch);
  // one strand of falling water: out over the lip, down the ridge, into the pool
  const strand = (off: number, w0: number, w1: number, speed: number, start = 0, curl = 0.8) => {
    const o = side.clone().multiplyScalar(off);
    const curve = new THREE.CatmullRomCurve3([
      at(top - start, 0.1).add(o),
      at(top - start - 0.25, curl).add(o),     // curls out over the ledge
      at(top * 0.62, 0.45).add(o),
      at(top * 0.3, 0.32).add(o),
      at(0.6, 0.45).add(o.clone().multiplyScalar(0.7)),
      land.clone().add(o.clone().multiplyScalar(0.5)),
    ]);
    const N = 40, pts = Array.from({ length: N + 1 }, (_, k) => curve.getPoint(k / N));
    const tex = streaks(rand, 4);
    const mesh = new THREE.Mesh(
      ribbon(pts, (k) => w0 + (w1 - w0) * (k / N), () => side, (k) => 1 - k / N),
      new THREE.MeshBasicMaterial({ map: tex, alphaMap: soft(), transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    ud(mesh).live = true;
    g.add(mesh);
    return (t: number) => (tex.offset.y = t * speed);
  };
  const flows = [strand(0, 0.35, 0.8, 1.6), strand(-0.7, 0.08, 0.2, 2.1, 0.6, 0.35), strand(0.62, 0.07, 0.16, 1.9, 1.1, 0.35)];
  // foam where it lands: a pale patch in the pool, breathing
  const foam = puddle(0.75, 0.55, rand, 0xe8f6fb);
  ud(foam).live = true;
  foam.position.copy(land).setY(base.y + 0.02);
  g.add(foam);
  // rings from the landing, never wider than the pool leaves room for
  const room = Math.min(2.4, 1.3) * 0.88 - land.distanceTo(centre.clone().setY(land.y));
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const rings = [0, 0.5].map((ph) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 28), ringMat());
    m.rotation.x = -Math.PI / 2;
    m.position.copy(land).setY(base.y + 0.07);
    ud(m).live = true;
    g.add(m);
    return { m, ph };
  });
  // spray: a few drops thrown up and falling back where it lands
  const drops = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(8 * 3), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85 }));
  ud(drops).live = true;
  drops.frustumCulled = false;
  g.add(drops);
  const spray = Array.from({ length: 8 }, (_, i) => ({ a: rand() * Math.PI * 2, ph: i / 8, v: 0.6 + rand() * 0.5 }));
  animate((t) => {
    for (const f of flows) f(t);
    foam.scale.setScalar(1 + 0.08 * Math.sin(t * 5));
    for (const { m, ph } of rings) {
      const k = (t * 0.8 + ph) % 1;
      m.scale.setScalar(0.35 + k * (room - 0.35));
      m.material.opacity = 0.7 * (1 - k);
    }
    const pa = drops.geometry.attributes.position;
    spray.forEach((p, i) => {
      const k = (t * 1.3 + p.ph) % 1;
      pa.setXYZ(i, land.x + Math.cos(p.a) * k * 0.55, base.y + 0.1 + p.v * 4 * k * (1 - k), land.z + Math.sin(p.a) * k * 0.55);
    });
    pa.needsUpdate = true;
  });
  ud(g).pool = { x: centre.x, z: centre.z, r: 2.7 };
  return g;
}

/**
 * Giants: flowers the size of trees. They grow from the garden on both long
 * sides of the board and arch OVER the lane, their heads hanging high above
 * the green (a canopy, partly in the way of the view — that is the point),
 * swaying and nodding in the wind, shedding petals that drift down onto the
 * lane. A head between the camera and the ball fades out (userData.fade).
 * With dandelion puffs, pollen and a ladybird. Nothing here touches the ball.
 */
function giants({ rand, X0, X1, reserve, free, W, H }: Backdrop) {
  const g = new THREE.Group();
  const pastel = [0xf4a6b8, 0xf6d27a, 0xc5b3f0, 0xa8dcc8, 0xf7b98b];
  const heads: { flower: THREE.Group; head: THREE.Group; mats: THREE.Material[]; R: number; world: THREE.Vector3; colour: number; ph: number }[] = [];
  const n = Math.max(3, Math.round(W / 11));
  for (let k = 0; k < n; k++) {
    const back = k % 2 === 0;
    const x = 3 + ((W - 6) * (k + 0.5)) / n + (rand() - 0.5) * 3, z = back ? -2.6 - rand() * 2 : H + 2.4 + rand() * 1.2;
    if (!free(x, z, 1.2)) continue;
    reserve(x, z, 1.2);
    const flower = new THREE.Group();
    flower.position.set(x, GRASS, z);
    ud(flower).live = true;
    // the stem rises beside the board and bends in over it: the head hangs
    // above the lane, a little past its middle
    const Hh = 4.6 + rand() * 1.6, reach = (back ? 1 : -1) * (H / 2 + 2 + rand() * 1.5);
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, Hh * 0.7, 0),
      new THREE.Vector3(0, Hh * 1.15, reach * 0.55), new THREE.Vector3((rand() - 0.5) * 2, Hh, reach)
    );
    flower.add(drawn(new THREE.TubeGeometry(curve, 24, 0.22, 7, false), flat(C.leafDark)));
    const leaf = drawn(new THREE.SphereGeometry(1.1, 10, 6), flat(C.leaf));
    leaf.scale.set(0.45, 0.12, 1);
    leaf.position.copy(curve.getPoint(0.3)).add(new THREE.Vector3(0.5, 0, 0));
    leaf.rotation.x = 0.4;
    flower.add(leaf);
    // the head, facing down onto the lane
    const head = new THREE.Group();
    head.position.copy(curve.getPoint(1));
    head.rotation.x = back ? 2.2 : -2.2;
    const R = 1.6 + rand() * 1.2, colour = pastel[Math.floor(rand() * pastel.length)];
    // opaque until the canopy fade makes them see-through (setFade)
    const pm = fadeable(flat(colour, {})), hm = fadeable(flat(C.sun, {}));
    for (let q = 0; q < 9; q++) {
      const a = (q / 9) * Math.PI * 2, pt = new THREE.Mesh(new THREE.SphereGeometry(R * 0.45, 10, 6), pm);
      pt.scale.set(1, 0.18, 0.5);
      pt.position.set(Math.cos(a) * R * 0.6, 0, Math.sin(a) * R * 0.6);
      pt.rotation.y = -a;
      head.add(pt);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(R * 0.33, 14, 8), hm);
    heart.scale.y = 0.45;
    head.add(heart);
    flower.add(head);
    g.add(flower);
    const world = new THREE.Vector3();
    heads.push({ flower, head, mats: [pm, hm], R, world, colour, ph: rand() * 6 });
  }
  // the whole flower sways from its foot, the head nods more; harder in wind
  animate((t) => {
    const w = windNow(), k = 1 + Math.min(w.length() * 15, 1);
    for (const f of heads) {
      f.flower.rotation.x = Math.sin(t * 0.5 + f.ph) * 0.025 * k + Math.max(-0.08, Math.min(0.08, w.y)) * 0.6;
      f.flower.rotation.z = Math.cos(t * 0.4 + f.ph) * 0.02 * k - Math.max(-0.08, Math.min(0.08, w.x)) * 0.6;
      f.head.rotation.z = Math.sin(t * 0.8 + f.ph) * 0.08 * k;
    }
  });
  // petals falling from the heads onto the lane, and fading as they land
  const petals: { m: THREE.Mesh<THREE.CircleGeometry, THREE.MeshToonMaterial>; f: (typeof heads)[number]; ph: number; dx: number; dz: number }[] = [];
  for (const f of heads)
    for (let q = 0; q < 3; q++) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 6), fadeable(flat(f.colour, { side: THREE.DoubleSide })));
      m.scale.y = 0.55;
      ud(m).live = true;
      g.add(m);
      petals.push({ m, f, ph: q / 3 + rand() * 0.2, dx: (rand() - 0.5) * 3, dz: (rand() - 0.5) * 3 });
    }
  const top = new THREE.Vector3();
  animate((t) => {
    for (const p of petals) {
      const u = (t * 0.07 + p.ph) % 1;
      p.f.head.getWorldPosition(top);
      p.m.position.set(top.x + p.dx * u + Math.sin(t * 2 + p.ph * 9) * 0.4, top.y - u * (top.y - 0.1), top.z + p.dz * u);
      p.m.rotation.set(t * 2 + p.ph * 5, t * 1.3, 0);
      setFade(p.m.material, u < 0.9 ? 1 : (1 - u) * 10); // blended only while it fades
    }
  });
  // fade: a head near the line from the camera to the ball goes see-through
  // (the shared canopy fade, from where each head is now)
  ud(g).fade = fadeLoop(heads.map((f) => ({ obj: f.head, at: f.world, r: f.R, mats: f.mats })), { min: 0.25 });
  // dandelion puffs on the right
  for (let k = 0; k < 2; k++) {
    const x = W + 2.5 + rand() * (X1 - W - 4), z = 1 + rand() * Math.max(1, H - 2);
    if (!free(x, z, 0.8)) continue;
    reserve(x, z, 0.8);
    const h = 3 + rand() * 1.5;
    // one plant: a stem tapering up to a small receptacle, the seed spokes
    // radiating from it; all on the one sway, from its foot, so the head
    // never floats off the stem. Lit like the rest (toon), not glowing at night
    const dand = new THREE.Group();
    dand.position.set(x, GRASS, z);
    ud(dand).foot = 0; // its sway is weighed from here (materials.js plantFeet)
    ud(dand).flex = 0.7; // a thin stem: it bends, but less than grass
    const stem = grows(new THREE.CylinderGeometry(0.035, 0.09, h, 6), C.leafDark);
    stem.position.y = h / 2;
    const cup = grows(new THREE.SphereGeometry(0.11, 8, 6), C.leafDark);
    cup.position.y = h;
    const puff = new THREE.Group();
    puff.position.y = h + 0.04;
    const seed = sway(0xf4f1ea);
    for (let q = 0; q < 40; q++) {
      const d = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 3), seed);
      sp.position.copy(d).multiplyScalar(0.35);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), seed);
      tip.position.copy(d).multiplyScalar(0.72);
      puff.add(sp, tip);
    }
    dand.add(stem, cup, puff);
    g.add(dand);
  }
  // a ladybird on a leaf, on the left
  const lx = X0 + 2, lz = 1 + rand() * Math.max(1, H - 2);
  if (free(lx, lz, 1.2)) {
    reserve(lx, lz, 1.2);
    const leaf = drawn(new THREE.SphereGeometry(1.1, 12, 6), flat(C.leaf));
    leaf.scale.set(1, 0.12, 0.6);
    leaf.position.set(lx, GRASS + 0.12, lz);
    const bug = new THREE.Group();
    const shell = drawn(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(C.cap));
    const headB = drawn(new THREE.SphereGeometry(0.16, 10, 6), flat(C.ink));
    headB.position.set(0.36, 0.05, 0);
    bug.add(shell, headB);
    for (let q = 0; q < 5; q++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), flat(C.ink));
      const a = q * 1.3;
      spot.position.set(Math.cos(a) * 0.2, 0.22 + (q % 2) * 0.06, Math.sin(a) * 0.2);
      bug.add(spot);
    }
    bug.position.set(lx + 0.2, GRASS + 0.22, lz);
    g.add(leaf, bug);
  }
  // pollen motes drifting over the garden (never through the lane: high up):
  // one instanced draw, live (they were merged where they stood, and never drifted)
  const mote = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.8 });
  const motes = Array.from({ length: 24 }, () => ({ x: X0 + rand() * (X1 - X0), z: -ISLAND.back + rand() * (ISLAND.back - 1), y: 3 + rand() * 7, ph: rand() * 6 }));
  const moteMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 5, 4), mote, motes.length);
  ud(moteMesh).live = true;
  moteMesh.frustumCulled = false; // they drift: bounds measured once would be stale
  g.add(moteMesh);
  const mm = new THREE.Matrix4();
  const drift = (t: number) => {
    motes.forEach((p, k) => moteMesh.setMatrixAt(k, mm.makeTranslation(p.x + Math.sin(t * 0.3 + p.ph) * 1.5, p.y + Math.sin(t * 0.7 + p.ph) * 0.6, p.z + Math.cos(t * 0.25 + p.ph))));
    moteMesh.instanceMatrix.needsUpdate = true;
  };
  drift(0);
  animate(drift);
  return g;
}

/**
 * The "clouds" holes have no island at all: the lane floats in the sky on its
 * own thin slab, over a sea of clouds that fills the view. Snowy peaks pierce
 * it far off; a rainbow, a balloon and a few birds.
 */
const cloudy = (id: string) => themeOf(id) === "clouds";

/** Many puffs as one inked mesh (one draw, plus its outline). */
function puffs(list: readonly (readonly [number, number, number, number, number])[], inked = true) {
  const geos = list.map(([x, y, z, r, sy]) => {
    const g = new THREE.SphereGeometry(r, 8, 5);
    g.scale(1, sy, 1);
    g.translate(x, y, z);
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  // far away an outline is lost in the distance: a plain mesh, half the cost
  return inked ? drawn(merged, flat(0xfbfcff)) : new THREE.Mesh(merged, flat(0xfbfcff));
}

function cloudSea({ rand, W, H }: Pick<Backdrop, "rand" | "W" | "H">) {
  const g = new THREE.Group();
  // two layers, drifting apart slowly: one close under and round the lane,
  // one wide and lower out to the horizon
  const near: [number, number, number, number, number][] = [], far: [number, number, number, number, number][] = [];
  for (let k = 0; k < 50; k++) {
    const x = -14 + rand() * (W + 28), z = -14 + rand() * (H + 24);
    for (let q = 0; q < 3; q++) near.push([x + (q - 1) * 2.4, -2.8 - rand() * 1.8 + q * 0.2, z + (rand() - 0.5) * 1.5, 1.5 + rand() * 1.6, 0.55]);
  }
  for (let k = 0; k < 60; k++) {
    const a = rand() * Math.PI * 2, d = 18 + rand() * 60;
    const x = W / 2 + Math.cos(a) * d * 1.3, z = H / 2 - 10 + Math.sin(a) * d;
    for (let q = 0; q < 3; q++) far.push([x + (q - 1) * 4, -6 - rand() * 3, z + (rand() - 0.5) * 3, 3 + rand() * 3, 0.5]);
  }
  const A = puffs(near), B = puffs(far, false);
  ud(A).live = ud(B).live = true;
  g.add(A, B);
  animate((t) => {
    A.position.x = Math.sin(t * 0.04) * 2.5;
    B.position.x = -Math.sin(t * 0.03) * 4;
  });
  g.add(farRange(rand, -20, W + 20, { tips: true }));
  // a rainbow far behind, half out of the clouds
  const bands = [0xf28b82, 0xf6c177, 0xf4e285, 0x9fd8a8, 0x8ec5f0, 0xb9a3e8];
  bands.forEach((c, k) => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(26 - k * 0.9, 0.45, 6, 48, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false }));
    arc.position.set(W * 0.7, -6, -45);
    g.add(arc);
  });
  // a hot-air balloon, far off to the right
  const balloon = new THREE.Group();
  ud(balloon).live = true;
  const env = drawn(new THREE.SphereGeometry(1.4, 16, 12), flat(C.cap));
  env.scale.y = 1.15;
  const basket = drawn(rbox(0.6, 0.45, 0.6, 0.08), flat(C.bark));
  basket.position.y = -2.1;
  balloon.add(env, basket);
  balloon.position.set(W + 14, 7, -16);
  g.add(balloon);
  // birds: a few inked Vs gliding in a slow circle
  const birds = new THREE.Group();
  ud(birds).live = true;
  const v = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0.2, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.2, 0)]);
  for (let k = 0; k < 5; k++) {
    const b = new THREE.Line(v, ink);
    b.position.set((k - 2) * 1.6, (k % 2) * 0.6, k * 0.8);
    birds.add(b);
  }
  birds.position.set(W * 0.3, 10, -20);
  g.add(birds);
  animate((t) => {
    balloon.position.y = 7 + Math.sin(t * 0.3) * 0.8;
    birds.position.x = W * 0.3 + Math.sin(t * 0.05) * 20;
    birds.children.forEach((b, k) => (b.scale.y = 1 + 0.4 * Math.sin(t * 4 + k)));
  });
  return g;
}

/** The slab the lane floats on: a thin rounded block just under the board. */
function slab(s: Hole) {
  const W = s.board.w, H = s.board.h;
  const g = new THREE.Group();
  const top = drawn(rbox(W + 1.2, 0.5, H + 1.2, 0.2), flat(C.stone));
  top.position.set(W / 2, GRASS - 0.25, H / 2); // its top is where the rough meets the rim
  const under = drawn(rbox(W * 0.9, 0.9, H * 0.9, 0.35), flat(0xa9b3b0));
  under.position.set(W / 2, GRASS - 0.85, H / 2);
  g.add(top, under);
  return g;
}

const BACKDROPS: Record<string, (b: Backdrop) => THREE.Group> = { hills, stream, mountains, giants };


/**
 * The garden around the green. Decoration and nothing else — no obstacle lives
 * out here — and it stays on the island: a prop past the edge reads as
 * floating in the sky. Tall things go behind and to the right only, so they
 * never stand between either camera and the green; the left and the front get
 * low things. The seed is the hole's id, so a course keeps its garden.
 */
function decor(s: Hole, bank: Height = () => 0): THREE.Group {
  if (cloudy(s.hole)) return cloudSea({ rand: seeded(s.name + s.hole), W: s.board.w, H: s.board.h });
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  const rand = seeded(s.name + s.hole);
  const X0 = -ISLAND.x + 0.8, X1 = W + ISLAND.x - 0.8;
  const Z0 = -ISLAND.back + 0.8, Z1 = H + ISLAND.front - 0.6;

  // Nothing stands inside anything else: every prop with a footprint reserves
  // it, and a scattered prop that lands on a reserved spot tries elsewhere or
  // is dropped. A tree through the house roof is the first thing an eye finds.
  const { free, reserve } = placer();
  // the picket fence along the front: nothing grows through it
  for (let x = X0 + 1; x <= X1 - 1; x += 0.7) reserve(x, Z1, 0.3);
  // stepping stones from the tee to the fence, laid first so nothing is
  // planted on them; apart, on the ground, and short of the pickets
  const stones = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const st = drawn(new THREE.CylinderGeometry(0.45, 0.5, 0.14, 10), flat(C.stone));
    const x = s.start[0] + (rand() - 0.5) * 0.4, z = H + 1.0 + i * 0.95;
    st.position.set(x, GRASS + bank(x, z) + 0.05, z);
    st.scale.z = 0.75;
    stones.add(st);
    reserve(x, z, 0.5);
  }
  g.add(stones);

  const put = <T extends THREE.Object3D>(m: T, x: number, z: number, k = 1, r = 0) => {
    m.position.set(x, GRASS + bank(x, z), z);
    m.rotation.y = rand() * Math.PI * 2;
    m.scale.multiplyScalar(k);
    g.add(m);
    if (r) reserve(x, z, r * k);
    return m;
  };
  const FOOT = new Map<(rand: Rand) => THREE.Object3D, number>([[bigFlower, 0.5], [tree, 1.1], [bush, 0.8], [stone, 0.5], [mushroom, 0.4], [flower, 0.25], [tuft, 0.2]]);
  const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, make: (rand: Rand) => THREE.Object3D, k = 1) => {
    const r = (FOOT.get(make) ?? 0.6) * k;
    for (let i = 0; i < n; i++)
      for (let tries = 0; tries < 8; tries++) {
        const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
        if (!free(x, z, r) || (x > -0.4 && x < W + 0.4 && z > -0.4 && z < H + 0.4)) continue; // not on the board
        put(make(rand), x, z, k, r / k);
        break;
      }
  };
  const low = (r: Rand) => { const t = rand(); return t < 0.45 ? bush(r) : t < 0.7 ? stone(r) : flower(r); };

  // behind: the course's backdrop, then a row of trees in front of it. Tall
  // things start clear of the left end: on a portrait screen that is the
  // foreground.
  reserve(-3.6, H + 1.2, 1.3); // the signpost
  const backdrop = BACKDROPS[themeOf(s.hole)];
  const bd = backdrop({ rand, X0, X1, Z0, W, H, reserve, free });
  g.add(bd);
  if (ud(bd).fade) ud(g).fade = ud(bd).fade;
  // the gnome's home: one house, or on some holes a little mushroom village
  let hh = 0;
  for (const ch of String(s.hole)) hh = (hh * 131 + ch.charCodeAt(0)) >>> 0;
  if (["hills", "stream"].includes(themeOf(s.hole)) && hh % 2 === 0) {
    const caps = [C.cap, 0xf2a93b, 0x9b7fd1, 0xc98b5a, 0x5b6fb5];
    const homes: [number, number][] = [];
    // big enough to live in (a house is 1.75 wide at the roof per unit of
    // scale): tried along the back, then down the right side, wherever the
    // backdrop (a stream, hills) has left room
    const spots: [number, number][] = [];
    for (let z = 1.2; z < H + 1.5; z += 1.3) spots.push([W + ISLAND.x - 3.3, z]);
    for (let x = X1 - 3; x > X0 + 6; x -= 1.3) spots.push([x, -ISLAND.back + 4.4]);
    for (const [x, z] of spots) {
      if (homes.length >= 4) break;
      const sc = 1.3 + rand() * 0.3;
      if (!free(x, z, 1.8 * sc)) continue;
      const k = homes.length;
      const m = house(caps[(hh + k) % caps.length]);
      m.scale.setScalar(sc);
      m.position.set(x, GRASS + bank(x, z), z);
      m.rotation.y = (rand() - 0.5) * 0.6; // doors to the lane
      g.add(m);
      reserve(x, z, 1.8 * sc);
      homes.push([x, z + 1.8 * sc]);
    }
    // a path of stones from door to door
    const path = new THREE.Group();
    for (let k = 0; k + 1 < homes.length; k++) {
      const [ax, az] = homes[k], [bx, bz] = homes[k + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.85);
      for (let q = 1; q < n; q++) {
        const x = ax + ((bx - ax) * q) / n, zz = az + ((bz - az) * q) / n + Math.sin(q) * 0.2;
        if (!free(x, zz, 0.3)) continue;
        const st = drawn(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 9), flat(C.stone));
        st.position.set(x, GRASS + bank(x, zz) + 0.04, zz);
        st.scale.z = 0.8;
        path.add(st);
        reserve(x, zz, 0.32);
      }
    }
    g.add(path);
    const extras: [THREE.Object3D, number][] = [[mailbox(), 0.4], [lantern(0, 0), 0.4]];
    homes.forEach(([x, z], k) => {
      if (k < extras.length) {
        const [m, r] = extras[k], ex = x + 1.1, ez = z - 0.3;
        if (free(ex, ez, r)) { m.position.set(ex, GRASS + bank(ex, ez), ez); g.add(m); reserve(ex, ez, r); }
      }
      const gx = x - 0.9, gz = z + 0.2;
      if (k % 2 === 0 && free(gx, gz, 0.3)) {
        const gn = gnomelet(rand);
        gn.add(look(brolly(caps[(hh + k + 1) % caps.length]), "wet")); // his umbrella, up in the rain
        gn.position.set(gx, GRASS + bank(gx, gz), gz);
        gn.rotation.y = rand() * 2 - 1;
        g.add(gn);
        reserve(gx, gz, 0.3);
      }
    });
  } else if (free(X1 - 3.6, -4.6, 2.2)) {
    const home = put(house(), X1 - 3.6, -4.6, 1.1, 2.2);
    home.rotation.y = -0.45;
  }
  // the pond on the right, if the village left it room
  for (const pz of [H * 0.62, H * 0.3, H * 0.9]) if (free(W + 4.2, pz, 2.7)) { put(pond(rand), W + 4.2, pz, 1, 2.7).rotation.y = 0; break; }

  // how much garden there is to fill: a 64-long lane gets twice the trees
  const span = (X1 - X0) / 46;
  // trees at the back — but not among giants, nor on a cloud island
  if (backdrop !== giants) scatter(Math.round((backdrop === mountains ? 12 : 24) * span), X0 + 5, X1, Z0 + 3.5, -1.8, tree, 0.95);
  // groves: a few clumps of wood packed close at the back corners and down
  // the right side, so the island reads framed by forest, not dotted
  if (backdrop !== giants)
    for (const [gx, gz] of [[X1 - 3, -ISLAND.back + 2.5], [X0 + 7, -ISLAND.back + 2.2], [X1 - 2.5, H * 0.3], [X1 - 2.5, H * 0.85]])
      for (let k = 0; k < 7; k++) {
        const a = rand() * Math.PI * 2, d = rand() * 2.6, x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
        if (x > X1 || z > Z1 - 1 || (x > -0.4 && x < W + 0.4 && z > -0.4 && z < H + 0.4) || !free(x, z, 0.8)) continue;
        put(tree(rand), x, z, 0.85 + rand() * 0.3, 0.8);
      }
  scatter(Math.round(8 * span), X0, X1, -2.2, -1.2, low, 0.8);


  // right: trees and a pond
  scatter(6, W + 2, X1 - 1.2, 0, Z1 - 1, tree, 0.9);
  // big flowers, standing tall where tall things may: the right and the back
  scatter(3, W + 1.8, X1 - 0.8, 0, H, bigFlower, 1);
  scatter(Math.round(3 * span), X0 + 6, X1 - 2, -ISLAND.back + 1.5, -2, bigFlower, 1);

  // left and front: nothing taller than a bush
  scatter(9, X0, -1.5, 0, Z1, low, 0.9);
  scatter(Math.round(10 * span), X0, X1, H + 1.3, Z1 - 0.5, (r) => (rand() < 0.6 ? flower(r) : bush(r)), 0.75);

  // a hedge of round bushes hugging the lane's long sides, and rocks at its
  // ends: the lane sits in a garden bed instead of on a lawn
  for (let x = 1; x < W - 1; x += 2.1 + rand() * 1.2) {
    for (const zz of [-1.6, H + 1.6]) {
      if (!free(x, zz, 0.7)) continue;
      const b = bush(rand);
      b.scale.setScalar(0.62 + rand() * 0.25);
      b.position.set(x, GRASS + bank(x, zz), zz);
      g.add(b);
      reserve(x, zz, 0.7);
    }
  }
  for (const xx of [-1.4, W + 1.4]) {
    for (let zz = 0.5; zz < H; zz += 2.4) {
      if (!free(xx, zz, 0.6)) continue;
      const st = rand() < 0.5 ? stone(rand) : bush(rand);
      st.scale.multiplyScalar(0.8);
      st.position.set(xx, GRASS + bank(xx, zz), zz);
      g.add(st);
      reserve(xx, zz, 0.6);
    }
  }
  g.add(fence(X0 + 1, X1 - 1, Z1).translateY(GRASS));

  // the small things that make it look lived in
  scatter(Math.round(60 * span), X0, X1, Z0, Z1, tuft, 1);
  scatter(5, X0, -1.5, 0, H, mushroom, 1);
  scatter(4, W + 1.5, X1, -1, H, mushroom, 1);
  g.add(bunting(new THREE.Vector3(X0 + 6.5, GRASS + bank(X0 + 6.5, -2.4), -2.4), new THREE.Vector3(X1 - 3, GRASS + bank(X1 - 3, -2.4), -2.4)));

  // evening and night: lanterns along the lane, and at night fireflies
  const time = timeOf(s.hole);
  if (time !== "day") {
    for (let x = 4; x < W - 2; x += 10) {
      for (const zz of [-2.4, H + 2.4]) if (free(x, zz, 0.5)) { const l = lantern(x, zz); l.position.y += bank(x, zz); g.add(l); reserve(x, zz, 0.5); }
    }
  }
  if (time === "night") g.add(fireflies(rand, W, H));

  // the sky and the air over the garden
  // (the clouds are the sky's, drawn behind the canvas: in 3D they sat too
  // high for the camera and were cut by the top of the screen)
  // butterflies by day; after dark the fireflies have the air to themselves
  const wingColors = [C.sun, C.petal, 0xffffff];
  if (time !== "night") for (let i = 0; i < 3; i++) g.add(butterfly(rand, X0 + (X1 - X0) * (0.2 + i * 0.3), H + 2.5 - i * 5, wingColors[i]));

  const sign = signpost(String(s.hole).replace(/[^0-9]/g, "") || "1");
  sign.scale.setScalar(1.35);
  sign.position.set(-3.6, GRASS + bank(-3.6, H + 1.2), H + 1.2);
  sign.rotation.y = -0.5; // readable from the front and from the tee end
  g.add(sign);

  weatherLooks(g, (w) => (w.rain || w.storm || w.snow ? "wet" : "clear"));
  return g;
}

/**
 * The banks round the lane: rolling hills that rise a couple of units away
 * from the board and fall away before the island's edge, so the green sits
 * sunken in its garden. Each hole gets its own height and its own wobble.
 */
function berms(s: Hole): { group: THREE.Object3D; height: Height } {
  if (cloudy(s.hole)) return { group: new THREE.Group(), height: () => 0 };
  const W = s.board.w, H = s.board.h;
  const rand = seeded("berm" + s.hole);
  const base = ({ hills: 1.7, mountains: 1.3, stream: 0.9, giants: 1.1, clouds: 0.8 } as Record<string, number>)[themeOf(s.hole)] || 1.2;
  const amp = base * (0.55 + rand() * 0.9), ph = rand() * 6, ph2 = rand() * 6;
  const X0 = -ISLAND.x, X1 = W + ISLAND.x, Z0 = -ISLAND.back, Z1 = H + ISLAND.front;
  // knolls, not a levee: round mounds of their own sizes dotted round the
  // board, each a soft dome, where a ring of even height read as a square
  const knolls: { x: number; z: number; r: number; h: number }[] = [];
  // not along the back: the backdrop (peaks, stream, hills) stands there on
  // flat ground; and none under the pond or the signpost
  const perim = W + 2 * H, n = Math.round(perim / 7);
  const clear = [[W + 4.2, H * 0.62, 3], [-3.6, H + 1.2, 1.5]];
  for (let k = 0; k < n; k++) {
    let u = ((k + rand() * 0.6) / n) * perim, x: number, z: number;
    const off = 3 + rand() * 2.6;
    if (u < H) (x = W + off), (z = u);
    else if ((u -= H) < W) (x = W - u), (z = H + off * 0.6);
    else (x = -off), (z = H - (u - W));
    const r = 1.8 + rand() * 1.8;
    if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr + r)) continue;
    knolls.push({ x, z, r, h: amp * (0.5 + rand() * 0.9) });
  }
  const height = (x: number, z: number) => {
    const dx = Math.max(0, -x, x - W), dz = Math.max(0, -z, z - H);
    const d = Math.hypot(dx, dz);
    if (d <= 0) return 0;
    const edge = Math.min(x - X0, X1 - x, z - Z0, Z1 - z);
    let top = 0;
    for (const m of knolls) {
      const q = Math.hypot(x - m.x, z - m.z) / m.r;
      if (q < 1) top = Math.max(top, m.h * (1 - q * q) * (1 - q * q));
    }
    const wob = 1 + 0.12 * Math.sin(x * 1.3 + z * 0.9 + ph) * Math.cos(z * 0.7 + ph2);
    // and flat under the picket fence along the front
    return top * wob * smoothstep((d - 1.4) / 1.6) * smoothstep(edge / 1.5) * smoothstep((Z1 - 1.2 - z) / 1.2);
  };
  const g = new THREE.Group();
  const step = 0.5, nx = Math.round((X1 - X0) / step), nz = Math.round((Z1 - Z0) / step);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), lo = new THREE.Color(C.surround), hi = new THREE.Color(0x5b9a7d);
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * step, z = Z0 + j * step, h = height(x, z);
      pos.push(x, GRASS + 0.05 + h, z); // clear of the island grass top: 0.01 z-fought at a distance
      c.copy(lo).lerp(hi, Math.min(1, Math.max(0, h) / 2));
      col.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = X0 + (i + 0.5) * step, z = Z0 + (j + 0.5) * step;
      if (x > 0 && x < W && z > 0 && z < H) continue; // the board's own ground
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  return { group: g, height };
}

/** The island itself: a plot of grass on a block of soil, sky all round. */
function base(s: Hole, box: THREE.Box3) {
  if (cloudy(s.hole)) return slab(s);
  const g = new THREE.Group();
  const size = box.getSize(new THREE.Vector3());
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const grass = drawn(rbox(size.x, 0.7, size.z, 0.3), flat(C.surround));
  grass.position.set(cx, GRASS - 0.35, cz);
  const soil = drawn(rbox(size.x - 0.3, ISLAND.soil - 0.7 + GRASS, size.z - 0.3, 0.5), flat(C.soil));
  soil.position.set(cx, (GRASS - 0.7 - ISLAND.soil) / 2, cz);
  const band = drawn(rbox(size.x - 0.2, 0.35, size.z - 0.2, 0.17), flat(C.bark));
  band.position.set(cx, -ISLAND.soil * 0.62, cz);
  g.add(grass, soil, band);
  return g;
}

/** How a clouds hole's rough reads: cloud tops, not a garden bed. */
const CLOUD_ROUGH: Rough = { lo: 0xdde6ee, hi: 0xffffff, plant: (rand) => puffs([[0, 0.25, 0, 0.5 + rand() * 0.4, 0.6], [0.5, 0.2, 0.2, 0.35, 0.6]]) };
const roughOf = (s: Hole) => (cloudy(s.hole) ? CLOUD_ROUGH : null);

export { base, edging, decor, berms, roughOf };
