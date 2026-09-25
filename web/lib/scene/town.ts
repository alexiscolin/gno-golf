// The "town" world: Mushroom Town, same four functions as garden.js (see
// worlds.js for the contract). The board is a raised green in the middle of a
// cobbled square: houses with mushroom caps all round, a clock tower, a
// bakery, market stalls, lamp posts, a fountain, a tram going by at the back,
// a canal down the left with a bridge over it, and rooftops to the horizon.
// Decoration only: nothing out here is in the physics. Tall things stand
// behind and to the right, as in the garden, so the lane is never hidden.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"; // the skyline
import { C, flat, drawn, rbox, texOf, ink, lanternGlow, grows, share, ownFade, fadeLoop, type FadeItem } from "./materials";
import { bake, look, weatherLooks } from "./bake";
import { animate } from "./state";
import { timeOf } from "./camera";
import { gnomelet, brolly, bunting, mailbox } from "./props";
import { seeded, ISLAND, GRASS, placer, onGround, type Rand } from "./common";
import { ud, type Hole } from "./data";
import type { Bar } from "./worlds";
import type { Terrain } from "../terrain";
import type { Extras, MutVec2, Post, Vec2, Zone } from "../types";

const T = {
  cobble: 0xcdbb9f, cobbleDark: 0xa99578, curb: 0xe2d6c0, quay: 0xa89c8a,
  wall: 0xf6ead3, wallWarm: 0xf1d9b8, roofFar: 0xe2c9c4, roofFarCap: 0xd4b3b5,
  caps: [C.cap, 0xf2a93b, 0x9b7fd1, 0xc98b5a, 0x5b6fb5],
  lampLit: 0xffd98a, lampOff: 0xe9e2cf, iron: 0x3d4a45, awningA: C.cap, awningB: C.cream,
};
const CANAL = { x0: -ISLAND.x - 6.5, x1: -ISLAND.x - 1.5 }; // down the left, just off the plot

// cobbles: a canvas of rounded stones, repeated over the square
let cobbleTex: THREE.CanvasTexture | null = null;
function cobbles() {
  if (cobbleTex) return cobbleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!, rand = seeded("cobbles");
  x.fillStyle = "#b6a386"; // the joints: close to the stones, so the square reads calm
  x.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const cx = col * 16 + (row % 2 ? 8 : 0) + (rand() - 0.5) * 2, cy = row * 16 + 8 + (rand() - 0.5) * 2;
      const shade = 200 + Math.floor(rand() * 14);
      x.fillStyle = `rgb(${shade + 12},${shade - 2},${shade - 30})`;
      for (const dx of [0, 128, -128]) {
        x.beginPath();
        x.ellipse(cx + dx, cy, 6.6 + rand(), 5.8 + rand(), rand(), 0, Math.PI * 2);
        x.fill();
      }
    }
  const t = texOf(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (cobbleTex = share(t));
}

/** The square: cobbles to the horizon, a curbed plinth under the board, the canal. */
function base(s: Hole, box: THREE.Box3) {
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  // far wider than the plot: in town the ground does not end at the island
  const X0 = box.min.x - 40, X1 = box.max.x + 40, Z0 = box.min.z - 40, Z1 = box.max.z + 18;
  const roofed = (s.zones || []).some((z) => z.skin === "roof");
  const tex = cobbles().clone();
  tex.needsUpdate = true;
  tex.repeat.set((X1 - X0) / 7, (Z1 - Z0) / 7); // a cobble is about a ball across
  // the square: one sheet, or with a hole where the board is, when rooftops
  // lie down under the lane and must show
  // (the shape is drawn with y = -z, so turning it flat puts it face up)
  const V = (x: number, z: number) => new THREE.Vector2(x, -z);
  const sq = new THREE.Shape([V(X0, Z0), V(X0, Z1), V(X1, Z1), V(X1, Z0)]);
  if (roofed) sq.holes.push(new THREE.Path([V(0, 0), V(W, 0), V(W, H), V(0, H)]));
  const sqGeo = new THREE.ShapeGeometry(sq);
  // UVs from the world, so the cobbles keep their size
  const uv = sqGeo.attributes.uv, pos = sqGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - X0) / (X1 - X0), (-pos.getY(i) - Z0) / (Z1 - Z0));
  sqGeo.rotateX(-Math.PI / 2);
  const square = new THREE.Mesh(sqGeo, new THREE.MeshToonMaterial({ map: tex, color: 0xffffff }));
  square.position.y = GRASS;
  g.add(square);
  // cut the canal out visually: water a step down, stone quays either side
  const len = Z1 - Z0;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(CANAL.x1 - CANAL.x0, len), new THREE.MeshToonMaterial({ color: C.pond }));
  water.rotation.x = -Math.PI / 2;
  // heights over the cobbles, each well clear of the next (no shimmer far off):
  // haze 0.06, water, grates and rails 0.08, the lawn under the board 0.12
  water.position.set((CANAL.x0 + CANAL.x1) / 2, GRASS + 0.08, (Z0 + Z1) / 2);
  g.add(water);
  for (const x of [CANAL.x0, CANAL.x1]) {
    const quay = drawn(rbox(0.5, 0.35, len, 0.1), flat(T.quay));
    quay.position.set(x, GRASS + 0.1, (Z0 + Z1) / 2);
    g.add(quay);
  }
  // ripples drifting down the canal
  const ripples: { m: THREE.Mesh; off: number; lane: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.7, 2, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    m.rotation.x = Math.PI / 2;
    m.userData.live = true;
    g.add(m);
    ripples.push({ m, off: i / 5, lane: (i % 3) - 1 });
  }
  animate((t) => ripples.forEach(({ m, off, lane }) => {
    const u = (t * 0.03 + off) % 1;
    m.position.set((CANAL.x0 + CANAL.x1) / 2 + lane * 1.3, GRASS + 0.16, Z0 + u * len);
  }));
  // under the whole board, a lawn: wherever the board's own ground leaves a
  // gap (the rough dips to the square at the board's edge, a curved kerb
  // leaves a sliver) the park shows through, never the cobbles
  // the plot is whatever the walls enclose, which may reach past the board's
  // nominal size: the curb and the lawn go round that, or walls would stand
  // outside the square's curb, on the cobbles
  let x0 = 0, z0 = 0, x1 = W, z1 = H;
  for (const w of s.walls || []) for (const p of [w.a, w.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  const PW = x1 - x0, PH = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (!roofed) {
    const under = new THREE.Mesh(new THREE.PlaneGeometry(PW + 1.2, PH + 1.2), flat(rough.lo));
    under.rotation.x = -Math.PI / 2;
    under.position.set(cx, GRASS + 0.12, cz);
    g.add(under);
  }
  // the plinth the green stands on: a stone step round the board
  // — a ring round it, not a slab under it: what hangs below the green (wall
  // skirts, the rough's plants) is the board's, and its top stays below 0
  const R = 0.6, hgt = 0.55;
  const E = 0.6; // clear of the rim timbers' outer face
  for (const [w, d, x, z] of [
    [PW + 2 * (R + E), R, cx, z0 - E - R / 2], [PW + 2 * (R + E), R, cx, z1 + E + R / 2],
    [R, PH + 2 * E, x0 - E - R / 2, cz], [R, PH + 2 * E, x1 + E + R / 2, cz],
  ]) {
    const piece = drawn(rbox(w, hgt, d, 0.1), flat(T.curb));
    piece.position.set(x, GRASS + hgt / 2, z);
    g.add(piece);
  }
  return g;
}

/** Curbs and small street furniture along the plinth. */
function edging(box: THREE.Box3, seed: string) {
  const g = new THREE.Group();
  const rand = seeded("town-edge" + seed);
  const W = box.max.x - ISLAND.x, H = box.max.z - ISLAND.front; // the board, from the plot box
  // drain grates in the square, a step off the plinth
  for (let x = 3; x < W - 2; x += 9 + rand() * 4)
    for (const z of [-1.3, H + 1.3]) {
      const grate = drawn(rbox(0.9, 0.05, 0.5, 0.03), flat(T.iron));
      grate.position.set(x, GRASS + 0.08, z);
      g.add(grate);
    }
  g.add(flowerBoxes(W, H, rand));
  return g;
}

// flower boxes sit on the curb ring round the board (see base): a few per side
function flowerBoxes(W: number, H: number, rand: Rand) {
  const g = new THREE.Group();
  const box = (x: number, z: number, rot: number) => {
    const b = drawn(box3(1.2, 0.3, 0.4), flat(C.wood));
    b.position.set(x, GRASS + 0.55 + 0.15, z);
    b.rotation.y = rot;
    g.add(b);
    for (let i = 0; i < 3; i++) {
      const f = tflower(rand);
      f.scale.multiplyScalar(0.55);
      f.position.set(x + Math.cos(rot) * (i - 1) * 0.35, GRASS + 0.85, z - Math.sin(rot) * (i - 1) * 0.35);
      g.add(f);
    }
  };
  for (let x = 5; x < W - 4; x += 11 + rand() * 3) box(x, -0.3, 0), box(x + 4, H + 0.3, 0);
  return g;
}

/** Town is flat: nothing rises round the board. */
function berms() {
  return { group: new THREE.Group(), height: () => 0 };
}

// ------------------------------------------------------------ the buildings

// the town's bush: three low-poly puffs (the garden's is round and heavy,
// and the town has hundreds of them in its beds and pots)
// and its flower: a stem and a round head, a fraction of the garden's
const flowerHead = share(new THREE.IcosahedronGeometry(0.16, 0)), flowerStem = share(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4));
function tflower(rand: Rand) {
  const g = new THREE.Group();
  const stem = new THREE.Mesh(flowerStem, flat(C.leafDark));
  stem.position.y = 0.25;
  const head = drawn(flowerHead, flat([C.petal, C.sun, 0x9b7fd1, C.cream, C.cap][Math.floor(rand() * 5)]));
  head.position.y = 0.52;
  g.add(stem, head);
  return g;
}

function tbush(rand: Rand) {
  const g = new THREE.Group();
  ud(g).foot = 0; // its sway is weighed from here (materials.js plantFeet)
  for (let i = 0; i < 3; i++) {
    const r = 0.45 + rand() * 0.35;
    const puff = grows(new THREE.IcosahedronGeometry(r, 0), rand() < 0.5 ? C.leaf : C.leafDark);
    puff.position.set((i - 1) * 0.45, r * 0.8, (rand() - 0.5) * 0.4);
    g.add(puff);
  }
  return g;
}

// a plain box, for the small and the many (benches, stalls, planks)
const box3 = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const lit = (on: boolean) => (on ? new THREE.MeshBasicMaterial({ color: T.lampLit }) : flat(0x7f9aa6));

/** A tower of a house: a taller body, its cap, a clock face on the front. */
function clockTower(night: boolean) {
  const g = new THREE.Group();
  const body = drawn(rbox(2.4, 7, 2.4, 0.3), flat(T.wall));
  body.position.y = 3.5;
  const band = drawn(rbox(2.6, 0.35, 2.6, 0.12), flat(T.quay));
  band.position.y = 5.2;
  const cap = drawn(new THREE.ConeGeometry(2.3, 3, 12), flat(0x5b6fb5));
  cap.position.y = 8.5;
  const face = drawn(new THREE.CylinderGeometry(0.85, 0.85, 0.12, 20), flat(C.cream));
  face.rotation.x = Math.PI / 2;
  face.position.set(0, 6.1, 1.24);
  g.add(body, band, cap, face);
  // the hands turn: slowly for the hour, faster for the minute
  const hand = (len: number, w: number) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.04), flat(C.ink));
    m.position.y = len / 2;
    pivot.add(m);
    pivot.position.set(0, 6.1, 1.33);
    ud(pivot).live = true;
    g.add(pivot);
    return pivot;
  };
  const hr = hand(0.45, 0.1), mn = hand(0.7, 0.07);
  animate((t) => ((mn.rotation.z = -t * 0.5), (hr.rotation.z = -t * 0.04)));
  for (const y of [1.6, 3.4]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), lit(night));
    w.position.set(0, y, 1.22);
    g.add(w);
  }
  const door = drawn(rbox(0.8, 1.3, 0.14, 0.2), flat(C.woodDark));
  door.position.set(0, 0.65, 1.2);
  g.add(door);
  return g;
}

/** The bakery: a wide warm house with a striped awning and a pretzel sign. */
function bakery(night: boolean) {
  const g = new THREE.Group();
  const body = drawn(rbox(3.6, 2.4, 2.4, 0.3), flat(T.wallWarm));
  body.position.y = 1.2;
  const cap = drawn(new THREE.SphereGeometry(2.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xc98b5a));
  cap.scale.set(1, 0.6, 0.75);
  cap.position.y = 2.35;
  g.add(body, cap, awning(3.2, 1.4, 1.35, 1.3));
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), lit(night));
  win.position.set(0.8, 1.1, 1.21);
  const door = drawn(rbox(0.7, 1.4, 0.12, 0.2), flat(C.woodDark));
  door.position.set(-0.9, 0.7, 1.2);
  const sign = drawn(new THREE.TorusGeometry(0.28, 0.1, 6, 14), flat(0xb87a3c));
  sign.position.set(-1.9, 2.1, 1.3);
  const chimney = drawn(new THREE.CylinderGeometry(0.22, 0.26, 1, 10), flat(C.stone));
  chimney.position.set(1.1, 3.5, -0.3);
  g.add(win, door, sign, chimney);
  return g;
}

/** A striped awning: panels of two colours sloping out over a shopfront. */
function awning(w: number, depth: number, y: number, z: number) {
  const g = new THREE.Group();
  const n = 6;
  for (let i = 0; i < n; i++) {
    const p = drawn(box3(w / n, 0.06, depth), flat(i % 2 ? T.awningB : T.awningA));
    p.position.set(-w / 2 + (w / n) * (i + 0.5), y + 0.35, z + depth / 2 - 0.1);
    p.rotation.x = 0.35;
    g.add(p);
  }
  return g;
}

/**
 * A town house, in one of four shapes: the classic cap, a tall thin one, a
 * squat wide one, and a two-cap house (a small cap stacked on the big one).
 * After dark its windows glow and a lamp by the door lights the street.
 */
function townHouse(rand: Rand, night: boolean, only: number | null = null) {
  const g = new THREE.Group();
  const kind = only ?? Math.floor(rand() * 4);
  const cap = T.caps[Math.floor(rand() * T.caps.length)];
  const [r, h] = [[1.05, 1.9], [0.75, 3], [1.4, 1.4], [1, 2.2]][kind];
  const body = drawn(new THREE.CylinderGeometry(r, r * 1.12, h, 10), flat(rand() < 0.5 ? T.wall : T.wallWarm));
  body.position.y = h / 2;
  g.add(body);
  const top = (rr: number, y: number, c: number) => {
    const m = drawn(new THREE.SphereGeometry(rr, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), flat(c));
    m.position.y = y;
    m.scale.y = kind === 1 ? 1.1 : 0.8;
    g.add(m);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rand(), t = 0.7 + (i % 2) * 0.3;
      const spot = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.13, 6, 4), flat(C.cream));
      spot.position.set(Math.cos(a) * Math.sin(t) * rr * 0.95, y + Math.cos(t) * rr * m.scale.y * 0.95, Math.sin(a) * Math.sin(t) * rr * 0.95);
      spot.scale.y = 0.5;
      g.add(spot);
    }
  };
  top(r * 1.65, h - 0.1, cap);
  if (kind === 3) {
    const neck = drawn(new THREE.CylinderGeometry(0.35, 0.45, 1, 6), flat(T.wall));
    neck.position.y = h + r * 1.2;
    g.add(neck);
    top(0.8, h + r * 1.6, T.caps[(T.caps.indexOf(cap) + 2) % T.caps.length]);
  }
  const door = drawn(box3(0.55, 0.9, 0.12), flat(C.woodDark));
  door.position.set(0, 0.45, r * 1.06);
  g.add(door);
  // windows round the front, one per floor
  const floors = Math.max(1, Math.round(h / 1.2));
  for (let f = 0; f < floors; f++) {
    const a = (f % 2 ? -1 : 1) * 0.55, y = 1.05 + f * 1.05;
    if (y > h - 0.3) break;
    const win = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), lit(night));
    win.position.set(Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 1.02);
    win.rotation.y = a;
    g.add(win);
  }
  if (night) {
    const glow = new THREE.Sprite(lanternGlow());
    glow.scale.set(2.2, 2.2, 1);
    glow.position.set(0.5, 1.1, r * 1.15);
    g.add(glow);
  }
  return { g, r: r * 1.8 };
}

/** A gnome's stall on the street: a small cart with a parasol, a gnome behind it. */
function gnomeStand(rand: Rand, night: boolean, late = night) {
  const g = new THREE.Group();
  const cart = drawn(box3(1.1, 0.6, 0.6), flat(C.wood));
  cart.position.y = 0.5;
  g.add(cart);
  for (const x of [-0.4, 0.4]) {
    const wheel = drawn(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), flat(C.woodDark));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.2, 0.34);
    g.add(wheel);
  }
  const pole = drawn(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), flat(T.iron));
  pole.position.set(0, 1.4, 0);
  const shade = drawn(new THREE.ConeGeometry(0.9, 0.35, 10), flat(T.caps[Math.floor(rand() * T.caps.length)]));
  shade.position.set(0, 2.1, 0);
  g.add(pole, shade);
  for (let i = 0; i < 3; i++) {
    const good = drawn(new THREE.SphereGeometry(0.1, 8, 6), flat([0xf2a93b, C.cap, 0x8fcba8][i]));
    good.position.set(-0.3 + i * 0.3, 0.88, 0.05);
    g.add(good);
  }
  const seller = gnomelet(rand);
  seller.position.set(0, 0, -0.55);
  if (!late) g.add(seller); // at night the cart is left lit, its seller gone home
  if (night) {
    const glow = new THREE.Sprite(lanternGlow());
    glow.scale.set(1.8, 1.8, 1);
    glow.position.set(0, 1.7, 0);
    g.add(glow);
  }
  return g;
}

/** A market stall: a counter, four poles, a striped roof, a crate of fruit. */
function stall(rand: Rand, night: boolean) {
  const g = new THREE.Group();
  const counter = drawn(box3(1.8, 0.8, 0.9), flat(C.wood));
  counter.position.y = 0.4;
  g.add(counter);
  for (const [x, z] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) {
    const pole = drawn(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), flat(C.woodDark));
    pole.position.set(x, 0.95, z);
    g.add(pole);
  }
  const colour = [C.cap, 0x5b6fb5, 0xf2a93b][Math.floor(rand() * 3)];
  for (let i = 0; i < 4; i++) {
    const p = drawn(box3(0.5, 0.07, 1.2), flat(i % 2 ? C.cream : colour));
    p.position.set(-0.75 + i * 0.5, 1.95, 0);
    g.add(p);
  }
  for (let i = 0; i < 5; i++) {
    const fruit = drawn(new THREE.SphereGeometry(0.13, 8, 6), flat([C.cap, 0xf2a93b, 0x8fcba8][i % 3]));
    fruit.position.set(-0.6 + i * 0.3, 0.9, 0.15);
    g.add(fruit);
  }
  // in the rain its awning is let down over the front, the fruit behind it
  const down = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const p = drawn(box3(0.5, 1, 0.05), flat(i % 2 ? C.cream : colour));
    p.position.set(-0.75 + i * 0.5, 1.42, 0.63);
    down.add(p);
  }
  g.add(night ? look(down, "clear", "wind", "wet") : look(down, "wet")); // and shut for the night
  return g;
}

/** A street lamp: an iron post and a lantern that glows after dark. */
function lamp(on: boolean) {
  const g = new THREE.Group();
  const post = drawn(new THREE.CylinderGeometry(0.07, 0.1, 2.6, 8), flat(T.iron));
  post.position.y = 1.3;
  const head = drawn(new THREE.ConeGeometry(0.34, 0.3, 8), flat(T.iron));
  head.position.y = 2.95;
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), on ? new THREE.MeshBasicMaterial({ color: T.lampLit }) : flat(T.lampOff));
  glass.position.y = 2.72;
  g.add(post, head, glass);
  if (on) {
    const glow = new THREE.Sprite(lanternGlow());
    glow.scale.set(3, 3, 1);
    glow.position.y = 2.72;
    g.add(glow);
  }
  return g;
}

/** A fountain: a stone basin, water, and a jet that rises and falls. */
function fountain() {
  const g = new THREE.Group();
  const basin = drawn(new THREE.CylinderGeometry(1.5, 1.6, 0.45, 20), flat(T.quay));
  basin.position.y = 0.22;
  const rim = drawn(new THREE.TorusGeometry(1.42, 0.14, 8, 24), flat(T.quay));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.5;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.34, 24), new THREE.MeshToonMaterial({ color: C.pond }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.5;
  g.add(rim);
  const column = drawn(new THREE.CylinderGeometry(0.18, 0.26, 1.1, 10), flat(T.curb));
  column.position.y = 0.95;
  const bowl = drawn(new THREE.CylinderGeometry(0.55, 0.3, 0.2, 14), flat(T.curb));
  bowl.position.y = 1.55;
  g.add(basin, water, column, bowl);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 1, 8), new THREE.MeshBasicMaterial({ color: 0xcfeaf6, transparent: true, opacity: 0.85 }));
  ud(jet).live = true;
  g.add(jet);
  animate((t) => {
    const h = 0.7 + 0.25 * Math.sin(t * 2.3);
    jet.scale.y = h;
    jet.position.y = 1.65 + h / 2;
  });
  return g;
}

/**
 * A street tree: a round, soft crown (not the garden's pine) over a patch of
 * grass in a stone surround — the square's greenery, so the town reads lived
 * in and not paved over.
 */
function streetTree(rand: Rand, bare = false) {
  const g = new THREE.Group();
  const bed = drawn(new THREE.CylinderGeometry(0.85, 0.9, 0.22, 14), flat(T.curb));
  bed.position.y = 0.11;
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 14), flat(C.leaf));
  lawn.position.y = 0.23;
  const h = 1.6 + rand() * 0.8;
  const trunk = grows(new THREE.CylinderGeometry(0.12, 0.17, h, 7), C.bark);
  trunk.position.y = h / 2 + 0.2;
  ud(g).foot = 0.2; // the trunk's foot: its sway is weighed from here (materials.js plantFeet)
  ud(g).flex = 0.32; // a street tree: stiff, a small lean
  // bare: no bed of its own, for a tree planted in a lawn that has one
  if (bare) g.add(trunk);
  else g.add(bed, lawn, trunk);
  for (let i = 0; i < 3; i++) {
    const r = 0.7 + rand() * 0.35;
    const puff = grows(new THREE.IcosahedronGeometry(r, 0), rand() < 0.5 ? C.leaf : C.moss);
    puff.position.set((i - 1) * 0.45, h + 0.5 + (i % 2) * 0.35, (rand() - 0.5) * 0.4);
    g.add(puff);
  }
  return g;
}

/** One mesh per material for a group that moves as one (a lantern string, a
 *  leaning mushroom, the tram): the shared bake, in the group's own frame. */
const mergeLive = <T extends THREE.Object3D>(group: T) => bake(group, { local: true });

// A piece over the lane gets its own see-through materials (materials.js
// ownFade), so it can fade out of the camera's way without fading the shared
// palette: see-through within ~2.3 of the view line at these points, back by ~4.
function fadeAt(piece: THREE.Object3D, points: readonly THREE.Vector3[]): FadeItem[] {
  const mats = ownFade(piece);
  return points.map((at) => ({ at, r: 1.8, mats }));
}

/**
 * Over the lane: strings of paper lanterns slung high across it, from a mast
 * behind to a bunch of balloons in front; two giant mushroom caps leaning in
 * over its ends; balloons drifting. It sways a little and glows after dark,
 * and fades out of the way when it comes between the camera and the ball.
 */
function overhead(W: number, H: number, rand: Rand, night: boolean) {
  const g = new THREE.Group();
  const faders: FadeItem[] = [];
  const Y = 6.2, colours = [C.cap, 0xf2a93b, 0x9b7fd1, C.cream, 0x5b6fb5];
  const litMat = new Map<number, THREE.MeshBasicMaterial>();
  const paper = (c: number) => {
    if (!night) return flat(c);
    if (!litMat.has(c)) litMat.set(c, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xfff1c4), 0.45) }));
    return litMat.get(c)!;
  };
  const strings: { line: THREE.Group; ph: number }[] = [];
  for (let x = W * 0.16; x < W - 1; x += Math.max(8, W / 4)) {
    const a = new THREE.Vector3(x - 1.5, 0, -2.6), b = new THREE.Vector3(x + 1.5, 0, H + 2.6);
    // a mast at the back; the front end is held up by a bunch of balloons —
    // a pole there would stand between the camera and the lane
    const mast = drawn(new THREE.CylinderGeometry(0.06, 0.08, Y + 0.4, 6), flat(T.iron));
    mast.position.set(a.x, GRASS + (Y + 0.4) / 2, a.z);
    g.add(mast);
    const line = new THREE.Group();
    const pts: THREE.Vector3[] = [], n = 10, glowAt: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(GRASS + Y - Math.sin(t * Math.PI) * 1.1));
    }
    line.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: C.ink })));
    for (let i = 1; i < n; i++) {
      const lan = drawn(new THREE.IcosahedronGeometry(0.28, 0), paper(colours[(i + strings.length) % colours.length]));
      lan.scale.y = 1.25;
      lan.position.copy(pts[i]).setY(pts[i].y - 0.4);
      line.add(lan);
      if (night && i % 3 === 1) glowAt.push(lan.position.clone());
    }
    for (let k = 0; k < 3; k++) {
      const bl = drawn(new THREE.IcosahedronGeometry(0.42, 1), paper(colours[(k + strings.length * 2) % colours.length]));
      bl.scale.y = 1.2;
      bl.position.set(b.x + (k - 1) * 0.55, GRASS + Y + 1.1 + (k % 2) * 0.35, b.z);
      line.add(bl);
    }
    mergeLive(line);
    if (glowAt.length) {
      // the string's glows as one set of points, swaying with it
      const m = lanternGlow();
      line.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(glowAt), new THREE.PointsMaterial({ map: m.map, color: m.color, size: 2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    g.add(line);
    strings.push({ line, ph: rand() * 6 });
    faders.push(...fadeAt(line, pts));
  }
  // two giant mushrooms rooted beside the lane's ends, leaning in over them:
  // a red and a violet cap with white spots, cream gills under, a stem you see
  const leaners: { piv: THREE.Group; ph: number }[] = [];
  const zc = H / 2;
  for (const [bx, dir, colour] of [[-2.6, 1, C.cap], [W + 2.6, -1, 0x9b7fd1]]) {
    const piv = new THREE.Group();
    piv.position.set(bx, GRASS, zc);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 4.2, 0), new THREE.Vector3(dir * 3.2, 5.6, -0.6));
    const stem = drawn(new THREE.TubeGeometry(curve, 16, 0.32, 8, false), flat(C.cream));
    const top = curve.getPoint(1), R = 2.5;
    const cap = drawn(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat(colour));
    cap.scale.y = 0.55;
    const gills = new THREE.Mesh(new THREE.CircleGeometry(R * 0.98, 20), flat(C.cream));
    gills.rotation.x = Math.PI / 2;
    const head = new THREE.Group();
    head.add(cap, gills);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.95, t = 0.45 + (i % 2) * 0.45;
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), flat(C.cream));
      spot.position.set(Math.cos(a) * Math.sin(t) * R * 0.97, Math.cos(t) * R * 0.55 * 0.97, Math.sin(a) * Math.sin(t) * R * 0.97);
      spot.scale.y = 0.5;
      head.add(spot);
    }
    head.position.copy(top);
    head.rotation.z = -dir * 0.35; // tipped toward the lane, like the stem
    piv.add(stem, head);
    g.add(mergeLive(piv));
    leaners.push({ piv, ph: rand() * 6 });
    faders.push(...fadeAt(piv, [curve.getPoint(0.6), top].map((p) => p.clone().add(piv.position))));
  }
  // balloons, bobbing high over the square
  const balloons: { b: THREE.Group; x: number; z: number; y: number; ph: number }[] = [];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Group();
    const ball = drawn(new THREE.SphereGeometry(0.45, 12, 10), paper(colours[(i + 1) % colours.length]));
    ball.scale.y = 1.2;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.4, 3), flat(C.ink));
    str.position.y = -1.2;
    b.add(ball, str);
    mergeLive(b);
    ud(b).live = true;
    g.add(b);
    balloons.push({ b, x: rand() * W, z: -3 - rand() * 3, y: 8 + rand() * 3, ph: rand() * 6 });
  }
  ud(g).fade = fadeLoop(faders);

  animate((t) => {
    for (const s of strings) s.line.rotation.x = Math.sin(t * 0.8 + s.ph) * 0.012;
    for (const l of leaners) l.piv.rotation.z = Math.sin(t * 0.5 + l.ph) * 0.03;
    for (const b of balloons) b.b.position.set(b.x + Math.sin(t * 0.2 + b.ph) * 2, GRASS + b.y + Math.sin(t * 0.7 + b.ph) * 0.4, b.z);
  });
  return g;
}

/**
 * A park bed: an organic blob of lawn, mounded a little, edged with stones,
 * its bushes and flowers in clumps and now and then a small tree.
 */
function parkBed(rx: number, rz: number, rand: Rand) {
  const g = new THREE.Group();
  const shape = new THREE.Shape(), n = 14, pts: MutVec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = 0.8 + rand() * 0.3;
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]);
  }
  shape.setFromPoints(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const lawn = drawn(new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.12, bevelSegments: 2, curveSegments: 3 }).rotateX(Math.PI / 2).translate(0, 0.24, 0), flat(0x7fb28a));
  g.add(lawn);
  pts.forEach(([x, z], i) => {
    if (i % 2) return;
    const st = drawn(new THREE.DodecahedronGeometry(0.2 + rand() * 0.1, 0), flat(T.quay));
    st.position.set(x * 1.08, 0.1, z * 1.08);
    st.scale.y = 0.6;
    g.add(st);
  });
  const clumps = Math.round(rx * rz * 0.5);
  for (let i = 0; i < clumps; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.65;
    const m = rand() < 0.5 ? tbush(rand) : tflower(rand);
    m.scale.multiplyScalar(0.55 + rand() * 0.35);
    m.position.set(Math.cos(a) * rx * r, 0.3, Math.sin(a) * rz * r);
    g.add(m);
  }
  if (rx > 1.8 && rand() < 0.6) {
    const t = streetTree(rand, true); // it stands in the bed's own lawn
    t.position.y = 0.1;
    g.add(t);
  }
  return g;
}

/** A bench on the square. */
function bench() {
  const g = new THREE.Group();
  const seat = drawn(box3(1.5, 0.1, 0.45), flat(C.wood));
  seat.position.y = 0.45;
  const back = drawn(box3(1.5, 0.35, 0.08), flat(C.wood));
  back.position.set(0, 0.75, -0.2);
  g.add(seat, back);
  for (const x of [-0.6, 0.6]) {
    const leg = drawn(box3(0.08, 0.45, 0.4), flat(T.iron));
    leg.position.set(x, 0.22, 0);
    g.add(leg);
  }
  return g;
}

/** A potted plant: a clay pot, and a bush or flowers in it. */
function pot(rand: Rand) {
  const g = new THREE.Group();
  const p = drawn(new THREE.CylinderGeometry(0.32, 0.24, 0.5, 10), flat(0xc9774a));
  p.position.y = 0.25;
  const plant = rand() < 0.5 ? tbush(rand) : tflower(rand);
  plant.scale.multiplyScalar(0.6);
  plant.position.y = 0.45;
  g.add(p, plant);
  return g;
}

/** A tram on its rails along the back street, going by and coming round again. */
function tram(z: number, x0: number, x1: number, night: boolean) {
  const g = new THREE.Group();
  for (const dz of [-0.45, 0.45]) {
    const rail = drawn(rbox(x1 - x0, 0.06, 0.08, 0.02), flat(T.iron));
    rail.position.set((x0 + x1) / 2, GRASS + 0.08, z + dz);
    g.add(rail);
  }
  const car = new THREE.Group();
  const body = drawn(rbox(4, 1.7, 1.6, 0.3), flat(0xf2a93b));
  body.position.y = 1.15;
  const roof = drawn(rbox(4.2, 0.2, 1.7, 0.08), flat(C.cream));
  roof.position.y = 2.05;
  car.add(body, roof);
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), lit(night));
    w.position.set(-1.35 + i * 0.9, 1.45, 0.81);
    car.add(w);
  }
  const pole = drawn(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), flat(T.iron));
  pole.position.set(0, 2.6, 0);
  pole.rotation.z = 0.5;
  car.add(pole);
  // headlamps, and at night their glow and a warm light inside
  for (const x of [-2.02, 2.02]) {
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), night ? new THREE.MeshBasicMaterial({ color: T.lampLit }) : flat(C.cream));
    head.position.set(x, 0.75, 0.55);
    head.rotation.y = Math.sign(x) * Math.PI / 2;
    car.add(head);
  }
  if (night) {
    const front = new THREE.Sprite(lanternGlow());
    front.scale.set(3.2, 3.2, 1);
    front.position.set(2.3, 0.8, 0);
    const inside = new THREE.Sprite(lanternGlow());
    inside.scale.set(4.5, 2.4, 1);
    inside.position.set(0, 1.4, 0.9);
    car.add(front, inside);
  }
  mergeLive(car);
  ud(car).live = true;
  car.position.set(x0, GRASS, z);
  g.add(car);
  animate((t) => {
    // along the line and off its far end, then in again from the canal side
    const span = x1 - x0 + 6;
    car.position.x = x0 + 2 + ((t * 2.2) % span);
    car.visible = car.position.x < x1 + 2;
  });
  return g;
}

/** A little arched bridge over the canal. */
function bridge(z: number) {
  const g = new THREE.Group();
  const w = CANAL.x1 - CANAL.x0 + 1.2;
  for (let i = -3; i <= 3; i++) {
    const plank = drawn(box3(w / 7, 0.14, 1.8), flat(i % 2 ? T.quay : T.curb));
    plank.position.set(((i + 3.5) / 7) * w - w / 2, 0.35 - i * i * 0.025, 0);
    g.add(plank);
  }
  for (const side of [-1, 1]) {
    const rail = drawn(box3(w, 0.12, 0.12), flat(T.iron));
    rail.position.set(0, 0.95, side * 0.85);
    g.add(rail);
  }
  g.position.set((CANAL.x0 + CANAL.x1) / 2, GRASS, z);
  return g;
}

/**
 * The town going on into the distance: rows of houses behind the square, each
 * row smaller and closer to the haze colour than the one before, with no
 * outline, over a ground that fades into haze — so the far edge reads as a
 * crowded town lost in the distance, not as empty paving.
 */
const HAZE = 0xf1d6c6;
function skyline(rand: Rand, X0: number, X1: number, Z0: number) {
  const g = new THREE.Group();
  // all of it one mesh, the colours in the vertices: hundreds of far houses
  // for one draw call (a material per shade was a draw call per shade)
  const body = new THREE.CylinderGeometry(1, 1.1, 2, 6).toNonIndexed(), cap = new THREE.SphereGeometry(1.6, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const parts: THREE.BufferGeometry[] = [], hazeC = new THREE.Color(HAZE), col = new THREE.Color();
  const tinted = (geo: THREE.BufferGeometry, c: number, k: number, m: THREE.Matrix4) => {
    const gg = geo.clone().applyMatrix4(m);
    col.set(c).lerp(hazeC, k);
    const n = gg.attributes.position.count, cs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cs.set([col.r, col.g, col.b], i * 3);
    gg.setAttribute("color", new THREE.BufferAttribute(cs, 3));
    gg.deleteAttribute("uv");
    parts.push(gg);
  };
  const put = (x: number, z: number, sc: number, k: number, colour: number) => {
    const hy = sc * (0.8 + rand() * 0.9);
    tinted(body, T.wall, k, new THREE.Matrix4().compose(new THREE.Vector3(x, GRASS + hy, z), new THREE.Quaternion(), new THREE.Vector3(sc, hy, sc)));
    tinted(cap, colour, k, new THREE.Matrix4().compose(new THREE.Vector3(x, GRASS + hy * 2 - 0.1, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 0.8, sc)));
  };
  // rows back from the square: nearer rows full colour, far ones in the haze
  for (let row = -1; row < 6; row++) {
    // row -1 is the second row of the square, just behind the first: full colour
    const z = row < 0 ? -9.6 : Z0 - 6 - row * 3.4, k = row < 0 ? 0 : Math.min(0.85, 0.15 + row * 0.14), sc = row < 0 ? 0.75 : 1.1 - row * 0.08;
    for (let x = X0 - 24 + (row % 2) * 1.6; x < X1 + 24; x += 2.4 + rand() * 1.4)
      put(x, z - rand() * 1.2, sc * (0.7 + rand() * 0.5), k, T.caps[Math.floor(rand() * T.caps.length)]);
  }
  // and down the far right, beyond the bakery
  for (let row = 0; row < 3; row++)
    for (let z = Z0 - 1; z < 26; z += 2.6 + rand() * 1.2)
      put(X1 + 9 + row * 3.4 + rand(), z, 0.9 - row * 0.1, 0.25 + row * 0.2, T.caps[Math.floor(rand() * T.caps.length)]);
  g.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshToonMaterial({ vertexColors: true })));
  // the ground itself fading into haze past the square
  const c = document.createElement("canvas");
  c.width = 4; c.height = 128;
  const x = c.getContext("2d")!, gr = x.createLinearGradient(0, 0, 0, 128);
  const hz = "#" + new THREE.Color(HAZE).getHexString();
  gr.addColorStop(0, hz);
  gr.addColorStop(0.55, hz + "cc");
  gr.addColorStop(1, hz + "00");
  x.fillStyle = gr;
  x.fillRect(0, 0, 4, 128);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 90, 40), new THREE.MeshBasicMaterial({ map: texOf(c), transparent: true, depthWrite: false }));
  haze.rotation.x = -Math.PI / 2;
  haze.position.set((X0 + X1) / 2, GRASS + 0.06, Z0 - 22);
  haze.renderOrder = 1;
  g.add(haze);
  return g;
}

// ------------------------------------------------------------------- decor

function decor(s: Hole) {
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  const rand = seeded("town" + s.name + s.hole);
  const X0 = -ISLAND.x + 0.8, X1 = W + ISLAND.x - 0.8;
  const Z0 = -ISLAND.back + 0.8;
  const time = timeOf(s.hole), night = time !== "day";

  const { free, reserve } = placer();
  // the board and a step round it are the lane's
  // (the walls may reach past the board's nominal size: keep clear of them too)
  let bx0 = 0, bz0 = 0, bx1 = W, bz1 = H;
  for (const w of s.walls || []) for (const p of [w.a, w.b]) {
    bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
    bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]);
  }
  const onBoard = (x: number, z: number, r: number) => x > bx0 - 1.9 - r && x < bx1 + 1.9 + r && z > bz0 - 1.9 - r && z < bz1 + 1.9 + r;
  const place = <T extends THREE.Object3D>(m: T, x: number, z: number, r: number, rot = 0) => {
    if (!free(x, z, r) || onBoard(x, z, r)) return null;
    m.position.set(x, GRASS, z);
    m.rotation.y = rot;
    g.add(m);
    reserve(x, z, r);
    return m;
  };

  // the tram line along the back street, before anything is put on it
  const TZ = -3.3;
  // (it starts past the canal: rails do not run over water)
  const TX0 = CANAL.x1 + 1.2;
  g.add(tram(TZ, TX0, X1 + 6, night));
  for (let x = TX0; x <= X1 + 6; x += 1) reserve(x, TZ, 1.1);
  // lamps along the back street, just behind the rails, before the stalls take the room
  for (let x = X0 + 2; x < X1 - 1; x += 6.5) place(lamp(night), x, TZ - 1.5, 0.35);
  // and a tree between every two lamps, before the stalls take the room
  for (let x = X0 + 5.2; x < X1 - 2; x += 6.5) place(streetTree(rand), x, TZ - 1.6, 0.8);

  // the back row: market stalls first (the houses find room round them),
  // the clock tower right of centre, then the houses
  for (let x = X0 + 4; x < X1 - 3; x += 7 + rand() * 4) place(stall(rand, time === "night"), x, -5.6, 1.1, (rand() - 0.5) * 0.3);
  const tower = place(clockTower(night), X0 + (X1 - X0) * 0.68, -7.2, 2);
  if (!tower) place(clockTower(night), X1 - 3, -7.2, 2);
  // the near row of houses (the row behind is part of the skyline: one mesh, see skyline)
  for (let x = X0 + 2; x < X1 - 1; x += 2.8 + rand() * 1.2) {
    const sc = 0.45 + rand() * 0.55, h = townHouse(rand, night); // small and big side by side
    place(h.g, x, -7.2 + rand() * 0.6, h.r * sc * 0.88, (rand() - 0.5) * 0.5)?.scale.setScalar(sc);
  }

  // gnomes selling on the street: in front of the back row, and down the right
  for (let x = X0 + 6; x < X1 - 4; x += 9 + rand() * 4) place(gnomeStand(rand, night, time === "night"), x, -4.6, 0.9, (rand() - 0.5) * 0.4);
  place(gnomeStand(rand, night, time === "night"), W + 2.6, H + 1.6, 0.9, -0.6);

  // the right: the bakery, the fountain, a couple of houses
  place(bakery(night), X1 - 2.6, H * 0.25, 2.2, -Math.PI / 2);
  place(fountain(), W + 3.8, H * 0.62 + 0.4, 1.8);
  for (let z = H - 0.5; z > -2; z -= 3.2) {
    const sc = 0.6 + rand() * 0.3, h = townHouse(rand, night);
    place(h.g, X1 - 1.5, z, h.r * sc * 0.88, -Math.PI / 2 + (rand() - 0.5) * 0.4)?.scale.setScalar(sc);
  }

  // the left and the front: only low things — benches, pots, lamps, gnomes
  for (let z = 1; z < H; z += 4.5) place(bench(), -3.2, z, 0.9, Math.PI / 2);
  for (let x = 2; x < W - 1; x += 7) place(bench(), x, H + 2.6, 0.9, Math.PI);
  for (let i = 0; i < Math.round(W / 5); i++) {
    const x = X0 + rand() * (X1 - X0), z = rand() < 0.5 ? H + 1.6 + rand() * 1.4 : -1.7 - rand() * 0.6;
    place(pot(rand), x, z, 0.4);
  }
  // street lamps: behind the lane, along the back street, at the board's
  // corners and down the right; nothing tall in front of the lane
  for (let x = 4; x < W - 2; x += 8) place(lamp(night), x, -1.9, 0.35);
  for (const [x, z] of [[-1.6, -1.6], [W + 1.6, -1.6], [-1.6, H + 1.6], [W + 1.6, H + 1.6]]) place(lamp(night), x, z, 0.35);
  for (let z = 1; z < H; z += 5) place(lamp(night), W + 1.8, z, 0.35);
  for (let i = 0; i < 6; i++) {
    const x = X0 + rand() * (X1 - X0), z = rand() < 0.5 ? H + 2 + rand() : -4.4 - rand() * 0.6;
    const gn = gnomelet(rand);
    gn.add(look(brolly(T.caps[i % T.caps.length]), "wet")); // his umbrella, up in the rain
    const turn = rand() * Math.PI * 2;
    if (time !== "night" || i < 2) place(gn, x, z, 0.3, turn); // after dark, only a couple out strolling
  }
  place(mailbox(), -2.4, H + 1.4, 0.35, 0.4);

  // greenery: trees along the back street and down the right, pocket lawns
  // along the front; the square stays a square, but a green one
  for (let z = 3; z < H; z += 5) place(streetTree(rand), W + 3, z, 0.9);
  for (let x = 3; x < W - 3; x += 9 + rand() * 3) place(parkBed(1.5, 0.75, rand), x, H + 3.5, 1.6);

  // the square closes in round the lane: a front row of low, squat houses
  // (backs to the camera, below its line to the green) and a row down the
  // left before the canal — so what shows round the park is town, not paving
  // (the front is seen from above: flower beds and low hedges read there,
  // a house would show only its cap, like a disc on the cobbles)
  // a little park along the front: a few big rounded beds, low
  for (let x = X0 + 1; x < X1 + 1; x += 7 + rand() * 3) {
    const rx = 2 + rand() * 1.3, rz = 1 + rand() * 0.5;
    place(parkBed(rx, rz, rand), x, H + 5.8 + rand() * 1.2, rx, (rand() - 0.5) * 0.4);
  }
  place(gnomeStand(rand, night, time === "night"), X0 + (X1 - X0) * 0.3, H + 7.5, 0.9, Math.PI + 0.3);
  place(gnomeStand(rand, night, time === "night"), X0 + (X1 - X0) * 0.75, H + 8, 0.9, Math.PI - 0.4);
  // and past the park, the houses on the near side of the square, of every
  // shape and size, with trees between them
  for (let x = X0 - 3; x < X1 + 4; x += 2.8 + rand() * 2) {
    if (rand() < 0.3) { place(streetTree(rand), x, H + 10 + rand(), 0.9); continue; }
    const sc = 0.45 + rand() * 0.5, h = townHouse(rand, night);
    place(h.g, x, H + 10.5 + rand() * 1.5, h.r * sc * 0.88, Math.PI + (rand() - 0.5) * 0.6)?.scale.setScalar(sc);
  }
  // trees round the edges of the town, in the gaps
  for (let i = 0; i < 26; i++) {
    const side = i % 3, x = side === 0 ? X0 - 4 - rand() * 4 : side === 1 ? X1 + 3 + rand() * 5 : X0 + rand() * (X1 - X0);
    const z = side === 2 ? -11.5 - rand() * 3 : -10 + rand() * (H + 20);
    place(streetTree(rand), x, z, 0.9, rand() * 6);
  }
  for (let z = -1; z < H + 4; z += 3 + rand() * 0.8) {
    const sc = 0.5 + rand() * 0.15, h = townHouse(rand, night, rand() < 0.5 ? 0 : 2);
    place(h.g, -6.2, z, h.r * sc * 0.88, Math.PI / 2 + (rand() - 0.5) * 0.4)?.scale.setScalar(sc);
  }

  // bunting across the back street, and the bridge over the canal
  g.add(bunting(new THREE.Vector3(X0 + 2, GRASS, -4.6), new THREE.Vector3(X1 - 2, GRASS, -4.6)));
  g.add(bridge(H * 0.5));
  // every still glow (windows, doors, lamps, stalls) as one set of points:
  // a sprite each was a draw call each
  g.updateMatrixWorld(true);
  const moving = (o: THREE.Object3D) => { for (let p = o.parent; p; p = p.parent) if (ud(p).live) return true; return false; };
  const glows: THREE.Object3D[] = [];
  g.traverse((o) => { if (o instanceof THREE.Sprite && o.material === lanternGlow() && !moving(o)) glows.push(o); });
  if (glows.length) {
    const pos = new Float32Array(glows.length * 3);
    glows.forEach((o, i) => { const w = o.getWorldPosition(new THREE.Vector3()); pos.set([w.x, w.y, w.z], i * 3); o.removeFromParent(); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = lanternGlow();
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ map: m.map, color: m.color, size: 2.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  // town10's canal is always there; the bridge over it comes with each stroke
  if (String(s.hole).endsWith("town10")) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4, H + 3.2), new THREE.MeshToonMaterial({ color: C.pond, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(22, GRASS + 0.63, H / 2);
    g.add(water);
    for (const x of [20, 24]) {
      const quay = drawn(box3(0.3, 0.16, H + 3.2), flat(T.quay));
      quay.position.set(x, GRASS + 0.66, H / 2);
      g.add(quay);
    }
  }
  const over = overhead(W, H, rand, night);
  g.add(over);
  ud(g).fade = ud(over).fade;
  reserve(-2.6, H / 2, 0.8);
  reserve(W + 2.6, H / 2, 0.8);
  g.add(skyline(rand, X0, X1, Z0));
  weatherLooks(g, (w) => (w.rain || w.storm || w.snow ? "wet" : "clear"));
  return g;
}

/** How the board's rough (ground inside the walls a ball never reaches)
 *  looks in town: planter soil and flower pots, not wild garden. For
 *  course.js roughScenery, when it asks the world. */
const rough = {
  lo: 0x6f9f7e, hi: 0x86b58f, // a park lawn inside the walls: the green heart of the square
  // mostly pots and flowers; a bush now and then (a bush is three spheres,
  // and a park of them was a third of the town's triangles)
  plant: (rand: Rand) => { const k = rand(); return k < 0.4 ? pot(rand) : k < 0.85 ? tflower(rand) : tbush(rand); },
};


// --------------------------------------------------------- on-lane pieces
//
// What the town's holes put on the lane, drawn in town's look. Each matches
// its physics footprint: a post's circle, a bar's box, a zone's rectangle or
// ellipse. course.js asks piece(kind, item, t, s) for every post, wall and
// zone; null means "not a town skin, draw it the usual way".


/** The door of a house the ball rolls into, or comes out of: a frame, a dark way in. */
function doorway(out: boolean) {
  const g = new THREE.Group();
  const frame = drawn(new THREE.TorusGeometry(0.75, 0.16, 6, 14, Math.PI), flat(C.woodDark));
  frame.position.y = 0.9;
  for (const x of [-0.75, 0.75]) {
    const jamb = drawn(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 6), flat(C.woodDark));
    jamb.position.set(x, 0.45, 0);
    g.add(jamb);
  }
  const dark = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: C.burrow }));
  dark.position.y = 0.9;
  const low = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.9), dark.material);
  low.position.y = 0.45;
  g.add(frame, dark, low);
  if (out) {
    // the exit: the door itself stands open beside it
    const leaf = drawn(rbox(0.7, 1.5, 0.08, 0.05), flat(C.wood));
    leaf.position.set(1.05, 0.75, 0.35);
    leaf.rotation.y = -1.1;
    g.add(leaf);
  }
  return g;
}

/** A stone well: its ring, a roof on two posts, the dark shaft. */
function well(r: number) {
  const g = new THREE.Group();
  const ring = drawn(new THREE.TorusGeometry(r, 0.18, 8, 20), flat(T.quay));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  const shaft = new THREE.Mesh(new THREE.CircleGeometry(r - 0.1, 20), new THREE.MeshBasicMaterial({ color: C.burrow }));
  shaft.rotation.x = -Math.PI / 2;
  shaft.position.y = 0.05;
  g.add(ring, shaft);
  for (const x of [-r - 0.1, r + 0.1]) {
    const post = drawn(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), flat(C.woodDark));
    post.position.set(x, 0.9, 0);
    g.add(post);
  }
  const roof = drawn(new THREE.ConeGeometry(r + 0.6, 0.8, 4), flat(C.cap));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.1;
  g.add(roof);
  return g;
}

// the town's bars on the lane, drawn at their footprint: len along, thick across
function tramAcross(len: number, thick: number, night: boolean) {
  const g = new THREE.Group();
  // the tram, lengthwise along the bar
  // low and bright: a tram, not a wall across the view
  const body = drawn(rbox(len, 1.3, thick, 0.35), flat(0xf2a93b));
  body.position.y = 0.85;
  const band = drawn(rbox(len + 0.04, 0.22, thick + 0.04, 0.06), flat(C.cap));
  band.position.y = 0.45;
  // seen mostly from above: a red roof with skylights and a pantograph,
  // so it reads as a tram and not as a slab
  const roof = drawn(rbox(len + 0.2, 0.2, thick + 0.1, 0.08), flat(C.cap));
  roof.position.y = 1.6;
  g.add(body, band, roof);
  for (let i = 0; i < Math.floor(len / 2); i++) {
    const sky = drawn(rbox(0.9, 0.12, thick * 0.4, 0.04), flat(C.cream));
    sky.position.set(-len / 2 + 1.2 + i * 2, 1.75, 0);
    g.add(sky);
  }
  const panto = drawn(new THREE.TorusGeometry(0.5, 0.05, 4, 8, Math.PI), flat(T.iron));
  panto.position.set(0, 1.75, 0);
  g.add(panto);
  for (let i = 0; i < Math.floor(len / 1.3); i++)
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), lit(night));
      w.position.set(-len / 2 + 0.9 + i * 1.3, 1.1, side * (thick / 2 + 0.01));
      w.rotation.y = side < 0 ? Math.PI : 0;
      g.add(w);
    }
  return g;
}

function clockHand(len: number, thick: number) {
  const g = new THREE.Group();
  const hand = drawn(rbox(len, 0.25, thick, 0.06), flat(T.iron));
  hand.position.y = 0.35;
  const tip = drawn(new THREE.ConeGeometry(thick * 0.9, 0.9, 4), flat(T.iron));
  tip.rotation.z = -Math.PI / 2;
  tip.position.set(len / 2, 0.35, 0);
  g.add(hand, tip);
  return g;
}

function stallAcross(len: number, thick: number, rand: Rand) {
  const g = new THREE.Group();
  const counter = drawn(rbox(len, 0.9, thick, 0.08), flat(C.wood));
  counter.position.y = 0.45;
  g.add(counter);
  const colour = [C.cap, 0x5b6fb5, 0xf2a93b][Math.floor(rand() * 3)];
  const n = Math.max(3, Math.round(len / 0.6));
  for (let i = 0; i < n; i++) {
    const stripe = drawn(rbox(len / n, 0.07, thick + 0.4, 0.02), flat(i % 2 ? C.cream : colour));
    stripe.position.set(-len / 2 + (len / n) * (i + 0.5), 2, 0);
    g.add(stripe);
    if (i % 2 === 0) {
      const fruit = drawn(new THREE.SphereGeometry(0.14, 8, 6), flat([C.cap, 0xf2a93b, 0x8fcba8][i % 3]));
      fruit.position.set(-len / 2 + (len / n) * (i + 0.5), 1.02, 0);
      g.add(fruit);
    }
  }
  for (const px of [-len / 2 + 0.1, len / 2 - 0.1]) {
    const pole = drawn(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), flat(C.woodDark));
    pole.position.set(px, 1.45, 0);
    g.add(pole);
  }
  return g;
}

function awningAcross(len: number, thick: number) {
  const g = new THREE.Group();
  // an awning let down across the lane: a striped canvas to the ground
  const n = Math.max(4, Math.round(len / 0.5));
  for (let i = 0; i < n; i++) {
    const panel = drawn(rbox(len / n, 1.3, thick, 0.03), flat(i % 2 ? C.cream : T.awningA));
    panel.position.set(-len / 2 + (len / n) * (i + 0.5), 0.65, 0);
    g.add(panel);
  }

  return g;
}

// --------------------------------------------------------- the Grand Plaza
//
// town18's own pieces: a brick floor with its patches (herringbone, a marble
// rosette) and the tram rails set in it, a bandstand, a clock obelisk, round
// market stalls and pigeons. Each stands on its physics footprint: a post's
// circle, a zone's polygon, rectangle or ellipse.

// a paving: one tile of it drawn on a canvas, repeated over the ground
const pavings = new Map<string, THREE.CanvasTexture>();
function paving(key: string, px: number, draw: (x: CanvasRenderingContext2D, rand: Rand, n: number) => void) {
  if (!pavings.has(key)) {
    const c = document.createElement("canvas");
    c.width = c.height = px;
    draw(c.getContext("2d")!, seeded(key), px);
    const tex = texOf(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    pavings.set(key, share(tex));
  }
  return pavings.get(key)!;
}
const rgb = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;
// red bricks in a running bond, 4 by 8 to a tile: a brick is a ball across
const brickTex = () => paving("brick", 128, (x, rand, n) => {
  x.fillStyle = "#e2cdb0"; // the mortar
  x.fillRect(0, 0, n, n);
  const tone = Array.from({ length: 32 }, () => rand());
  for (let row = 0; row < 8; row++)
    for (let col = -1; col <= 4; col++) {
      const k = tone[row * 4 + ((col + 4) % 4)]; // a brick cut by the edge is the same brick on the other side
      x.fillStyle = rgb(186 + k * 34, 84 + k * 26, 62 + k * 18);
      x.fillRect(col * 32 + (row % 2) * 16 + 1.5, row * 16 + 1.5, 29, 13);
    }
});
// a 90° herringbone of paler bricks, laid at 45° (the texture turns)
const herringTex = () => paving("herringbone", 128, (x, rand, n) => {
  x.fillStyle = "#e9dcc4";
  x.fillRect(0, 0, n, n);
  const u = 8, tone = Array.from({ length: 32 }, () => rand());
  // the pattern's lattice is (1, 1) and (-2, 2) bricks-widths: it tiles every 4
  for (let a = -24; a <= 24; a++)
    for (let b = -12; b <= 12; b++) {
      const ox = (a - 2 * b) * u, oy = (a + 2 * b) * u;
      if (ox > n + 2 * u || oy > n + 3 * u || ox < -3 * u || oy < -3 * u) continue;
      const k = tone[(((a % 8) + 8) % 8) * 4 + (((b % 4) + 4) % 4)];
      x.fillStyle = rgb(214 + k * 22, 150 + k * 24, 112 + k * 20);
      x.fillRect(ox + 1, oy + 1, 2 * u - 2, u - 2); // lying
      x.fillStyle = rgb(206 + k * 22, 140 + k * 24, 104 + k * 20);
      x.fillRect(ox + 1, oy + u + 1, u - 2, 2 * u - 2); // standing
    }
});
// a marble rosette: a compass star in two stones on cream, ringed in slate
const marbleTex = () => paving("marble", 256, (x, rand, n) => {
  const c = n / 2;
  x.fillStyle = "#f1e9da";
  x.fillRect(0, 0, n, n);
  x.strokeStyle = "rgba(160,150,140,0.35)"; // veins
  x.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    x.beginPath();
    let px = rand() * n, py = rand() * n;
    x.moveTo(px, py);
    for (let k = 0; k < 5; k++) x.lineTo((px += (rand() - 0.5) * 50), (py += (rand() - 0.3) * 40));
    x.stroke();
  }
  const ring = (r: number, w: number, col: string) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); };
  ring(c - 7, 10, "#8d9ca6");
  ring(c - 20, 4, "#c9785a");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, long = i % 2 === 0, R = long ? c - 26 : c * 0.52, w = 0.2;
    x.fillStyle = long ? (i % 4 === 0 ? "#c9785a" : "#8d9ca6") : "#d9b99a";
    x.beginPath();
    x.moveTo(c, c);
    x.lineTo(c + Math.cos(a - w) * R * 0.34, c + Math.sin(a - w) * R * 0.34);
    x.lineTo(c + Math.cos(a) * R, c + Math.sin(a) * R);
    x.lineTo(c + Math.cos(a + w) * R * 0.34, c + Math.sin(a + w) * R * 0.34);
    x.closePath();
    x.fill();
  }
  ring(c * 0.2, 5, "#8d9ca6");
});

// a zone's outline, as the chain has it: its polygon, ellipse or rectangle
function outlineOf(z: Zone): readonly Vec2[] {
  if (z.poly && z.poly.length > 2) return z.poly;
  const [x0, z0] = z.min, [x1, z1] = z.max;
  if (!z.round) return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  return Array.from({ length: 72 }, (_, i): Vec2 => [cx + Math.cos((i / 72) * Math.PI * 2) * hx, cz + Math.sin((i / 72) * Math.PI * 2) * hz]);
}
// a flat sheet over pts, lift above the ground; tile > 0 repeats the texture
// every tile units of the board, 0 stretches it over the zone once. over
// pulls it forward in depth, over what it lies on
function sheet(pts: readonly Vec2[], z: Zone, t: Terrain, mat: THREE.Material, tile: number, lift: number) {
  const [x0, z0] = z.min, [x1, z1] = z.max;
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, -zz))));
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), zz = -p.getY(i);
    uv.setXY(i, tile ? x / tile : (x - x0) / (x1 - x0), tile ? -zz / tile : 1 - (zz - z0) / (z1 - z0));
  }
  geo.rotateX(-Math.PI / 2);
  for (let i = 0; i < p.count; i++) p.setY(i, t.height(p.getX(i), p.getZ(i)) + lift);
  return new THREE.Mesh(geo, mat);
}
const overMat = (map: THREE.Texture, color: number, k: number) => flat(color, { map, polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k * 2 });
// a patch of paving with a stone kerb flush round it and an ink line
function patch(z: Zone, t: Terrain, map: THREE.Texture, tile: number, kerb: number) {
  const g = new THREE.Group(), pts = outlineOf(z);
  const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
  const hx = (z.max[0] - z.min[0]) / 2, hz = (z.max[1] - z.min[1]) / 2;
  g.add(sheet(pts, z, t, overMat(map, 0xffffff, 1), tile, 0.02));
  // the kerb: the outline, and inside it the same outline pulled in by 0.3
  const inner = pts.map(([x, zz]): Vec2 => [cx + (x - cx) * (1 - 0.3 / hx), cz + (zz - cz) * (1 - 0.3 / hz)]);
  const shape = new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, -zz)));
  shape.holes.push(new THREE.Path(inner.map(([x, zz]) => new THREE.Vector2(x, -zz))));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, t.height(p.getX(i), p.getZ(i)) + 0.03);
  g.add(new THREE.Mesh(geo, flat(kerb, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map(([x, zz]) => new THREE.Vector3(x, t.height(x, zz) + 0.04, zz))), ink));
  return g;
}
// the floor: bricks over the whole plaza
function brickFloor(z: Zone, s: Hole, t: Terrain) {
  const g = new THREE.Group(), pts = outlineOf(z);
  g.add(sheet(pts, z, t, flat(0xffffff, { map: brickTex() }), 4, 0.012));
  // (the tram rails are the tram lines' own: course.js tramLine)
  return g;
}
const PLAZA_GROUND: Record<string, (z: Zone, s: Hole, t: Terrain) => THREE.Group> = {
  brick: brickFloor,
  herringbone: (z, s, t) => { const tex = herringTex(); tex.rotation = Math.PI / 4; return patch(z, t, tex, 8, T.curb); },
  marble: (z, s, t) => patch(z, t, marbleTex(), 0, 0x8d9ca6),
  // a parterre: lawn and low flowers in a stone kerb, low enough to read as
  // ground a ball rolls through (slowly), not a wall of stems
  flowerbed: (z, s, t) => {
    const g = patch(z, t, bedTex(), 3, T.curb), rand = seeded("bed" + z.min.join() + z.max.join());
    const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2, hx = (z.max[0] - z.min[0]) / 2, hz = (z.max[1] - z.min[1]) / 2;
    for (let i = 0; i < hx * hz * 2.2; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 0.82;
      const x = cx + Math.cos(a) * hx * d, zz = cz + Math.sin(a) * hz * d, f = tflower(rand);
      f.scale.setScalar(0.5 + rand() * 0.2);
      g.add(onGround(f, x, zz, t));
    }
    return g;
  },
};
// the parterre's lawn, speckled with petals
const bedTex = () => paving("bed", 128, (x, rand, n) => {
  x.fillStyle = "#6fa57a";
  x.fillRect(0, 0, n, n);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = rand() < 0.7 ? (rand() < 0.5 ? "#7fb488" : "#5f9670") : ["#f2b8b0", "#ffd98a", "#fdf6e9", "#9b7fd1"][Math.floor(rand() * 4)];
    x.beginPath();
    x.arc(rand() * n, rand() * n, 1.5 + rand() * 2.5, 0, Math.PI * 2);
    x.fill();
  }
});

/** The bandstand: a stone drum, a ring of slim columns, a mushroom-cap roof. */
function bandstand(r: number, rand: Rand, night: boolean) {
  const g = new THREE.Group();
  const drum = drawn(new THREE.CylinderGeometry(r, r, 0.6, 36), flat(T.curb));
  drum.position.y = 0.3;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.15, r - 0.15, 0.06, 36), flat(C.wood));
  deck.position.y = 0.63;
  g.add(drum, deck);
  const cr = r - 0.45;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, col = drawn(new THREE.CylinderGeometry(0.11, 0.14, 1.9, 8), flat(C.cream));
    col.position.set(Math.cos(a) * cr, 1.6, Math.sin(a) * cr);
    g.add(col);
  }
  const rail = drawn(new THREE.TorusGeometry(cr, 0.05, 5, 48), flat(C.cream));
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 1.2;
  g.add(rail);
  // the roof, a red cap with white spots, overhanging a little in the air
  const R = r + 0.15, k = 0.38, y0 = 2.5;
  const cap = drawn(new THREE.SphereGeometry(R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), flat(C.cap));
  cap.scale.y = k;
  cap.position.y = y0;
  const under = new THREE.Mesh(new THREE.CircleGeometry(R, 32), flat(C.cream, { side: THREE.DoubleSide }));
  under.rotation.x = Math.PI / 2;
  under.position.y = y0;
  g.add(cap, under);
  for (let i = 0; i < 11; i++) {
    const th = 0.35 + rand() * 0.9, ph = rand() * Math.PI * 2;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.34 + rand() * 0.2, 10, 6), flat(C.cream));
    spot.scale.y = 0.3;
    spot.position.set(Math.sin(th) * Math.cos(ph) * R * 0.99, y0 + Math.cos(th) * R * k, Math.sin(th) * Math.sin(ph) * R * 0.99);
    spot.lookAt(spot.position.x * 2, y0 + (spot.position.y - y0) * 2 / (k * k), spot.position.z * 2);
    spot.rotateX(Math.PI / 2);
    g.add(spot);
  }
  const mast = drawn(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), flat(T.iron));
  mast.position.y = y0 + R * k + 0.45;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), flat(C.sun, { side: THREE.DoubleSide }));
  flag.position.set(0.3, y0 + R * k + 0.78, 0);
  g.add(mast, flag);
  // the band: three gnomes on the deck
  for (let i = 0; i < 3; i++) {
    const gn = gnomelet(rand), a = (i / 3) * Math.PI * 2 + 0.5;
    gn.scale.setScalar(1.8);
    gn.position.set(Math.cos(a) * r * 0.35, 0.66, Math.sin(a) * r * 0.35);
    gn.rotation.y = -a - Math.PI / 2;
    g.add(gn);
  }
  if (night) {
    const glow = new THREE.Sprite(lanternGlow());
    glow.scale.set(4, 4, 1);
    glow.position.y = y0 - 0.3;
    g.add(glow);
  }
  return g;
}

/** The clock obelisk: a stepped plinth, a shaft, a clock, a gilt spire. */
function obelisk(r: number, night: boolean) {
  // built for a plinth of 1.1 and scaled to the post: a bigger post, a taller obelisk
  const g = new THREE.Group(), k = r / 1.1;
  g.scale.setScalar(k);
  r = 1.1;
  const plinth = drawn(new THREE.CylinderGeometry(r, r, 0.7, 8), flat(T.quay));
  plinth.position.y = 0.35;
  const step = drawn(new THREE.CylinderGeometry(r * 0.72, r * 0.8, 0.5, 8), flat(T.curb));
  step.position.y = 0.95;
  const shaft = drawn(new THREE.CylinderGeometry(0.34, 0.46, 2.4, 4), flat(T.curb));
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 2.4;
  const box = drawn(rbox(0.86, 0.86, 0.86, 0.08), flat(T.wallWarm));
  box.position.y = 4;
  const spire = drawn(new THREE.ConeGeometry(0.5, 1.5, 4), flat(C.cap));
  spire.rotation.y = Math.PI / 4;
  spire.position.y = 5.18;
  const tip = drawn(new THREE.SphereGeometry(0.14, 10, 8), flat(C.sun));
  tip.position.y = 6;
  g.add(plinth, step, shaft, box, spire, tip);
  const face = night ? new THREE.MeshBasicMaterial({ color: T.lampLit }) : flat(C.cream);
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = (i * Math.PI) / 2;
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), face);
    dial.position.set(0, 4, 0.44);
    const hh = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.2), flat(C.ink));
    hh.position.set(0, 4.08, 0.45);
    const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.28), flat(C.ink));
    mh.position.set(0.1, 4, 0.451);
    mh.rotation.z = -1.2;
    side.add(dial, hh, mh);
    g.add(side);
  }
  return g;
}

/** A round market stall: a counter all round, fruit on it, a striped parasol. */
function marketStall(r: number, rand: Rand) {
  const g = new THREE.Group();
  const counter = drawn(new THREE.CylinderGeometry(r * 0.94, r, 0.85, 18), flat(C.wood));
  counter.position.y = 0.425;
  const top = drawn(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.08, 18), flat(C.woodDark));
  top.position.y = 0.89;
  g.add(counter, top);
  const fruit = [C.cap, 0xf2a93b, 0x8fcba8, 0x9b7fd1];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, f = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flat(fruit[i % 4]));
    f.position.set(Math.cos(a) * r * 0.66, 1.05, Math.sin(a) * r * 0.66);
    g.add(f);
  }
  const pole = drawn(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), flat(C.woodDark));
  pole.position.y = 2.05;
  g.add(pole);
  const colour = [C.cap, 0x5b6fb5, 0xf2a93b][Math.floor(rand() * 3)];
  for (let i = 0; i < 8; i++) {
    const wedge = drawn(new THREE.ConeGeometry(r * 1.3, 0.65, 3, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4), flat(i % 2 ? C.cream : colour));
    wedge.position.y = 3.4;
    g.add(wedge);
  }
  return g;
}

/** Two pigeons pecking at the paving. */
function pigeons(r: number, rand: Rand) {
  const g = new THREE.Group();
  const grey = flat(0x9ba4b6), dark = flat(0x757e91), neck = flat(0x6f9e8e);
  for (const [px, pz] of [[-r * 0.35, -r * 0.2], [r * 0.3, r * 0.3]]) {
    const b = new THREE.Group();
    const body = drawn(new THREE.SphereGeometry(0.15, 10, 8), grey);
    body.scale.set(1.4, 0.95, 0.95);
    body.position.y = 0.2;
    const tail = drawn(new THREE.ConeGeometry(0.09, 0.24, 4), dark);
    tail.rotation.z = Math.PI / 2 + 0.3;
    tail.position.set(-0.26, 0.24, 0);
    const collar = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), neck);
    collar.position.set(0.14, 0.3, 0);
    const head = drawn(new THREE.SphereGeometry(0.08, 8, 6), grey);
    const pecking = rand() < 0.5;
    head.position.set(pecking ? 0.26 : 0.2, pecking ? 0.2 : 0.4, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), flat(C.sun));
    beak.rotation.z = -Math.PI / 2 - (pecking ? 0.9 : 0);
    beak.position.set(0.08, pecking ? -0.04 : 0, 0);
    head.add(beak);
    for (const e of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), flat(C.ink));
      eye.position.set(0.04, 0.02, e * 0.06);
      head.add(eye);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4), flat(0xe28b8b));
      leg.position.set(0.02, 0.06, e * 0.05);
      b.add(leg);
    }
    b.add(body, tail, collar, head);
    b.position.set(px, 0, pz);
    b.rotation.y = rand() * Math.PI * 2;
    g.add(b);
  }
  return g;
}
const PLAZA_POSTS: Record<string, (r: number, rand: Rand, night: boolean) => THREE.Group> = {
  bandstand: (r, rand, night) => bandstand(r, rand, night),
  obelisk: (r, rand, night) => obelisk(r, night),
  stall: (r, rand) => marketStall(r, rand),
  pigeon: (r, rand) => pigeons(r, rand),
};

// ------------------------------------------------------------- the skate park
//
// town6: concrete ramps (the ground itself rises: terrain.js), a funbox, a
// ledge down the middle and a grind rail. The park's floor is concrete, not a
// lawn (green below).
const CONCRETE = 0xd0cbc1, STEEL = 0x8e9aa3;
const skatePark = (s: Hole) => (s.zones || []).some((z) => z.skin === "quarter pipe");
/** The lane's stripes: poured concrete in a skate park, the default lawn elsewhere. */
const green = (s: Hole): readonly [number, number] | null => (skatePark(s) ? [0xcfcac1, 0xcac5bc] : null);

/** A grind rail: a steel tube on legs over a low concrete curb, the bar's footprint. */
function grindRail(len: number, thick: number) {
  const g = new THREE.Group();
  const curb = drawn(rbox(len, 0.14, thick, 0.04), flat(CONCRETE));
  curb.position.y = 0.07;
  const tube = drawn(new THREE.CylinderGeometry(0.07, 0.07, len - 0.1, 10).rotateZ(Math.PI / 2), flat(STEEL));
  tube.position.y = 0.55;
  g.add(curb, tube);
  const legs = Math.max(2, Math.round(len / 2.5) + 1);
  for (let k = 0; k < legs; k++) {
    const leg = drawn(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 6), flat(STEEL));
    leg.position.set(-len / 2 + 0.25 + ((len - 0.5) * k) / (legs - 1), 0.34, 0);
    g.add(leg);
  }
  return g;
}

/** A ledge: a low concrete block, steel coping along both top edges. */
function skateLedge(len: number, thick: number) {
  const g = new THREE.Group();
  // as tall as the funbox it meets: the ramps butt against it, never through it
  const block = drawn(rbox(len, 1, thick, 0.05), flat(CONCRETE));
  block.position.y = 0.5;
  g.add(block);
  for (const side of [-1, 1]) {
    const edge = drawn(new THREE.CylinderGeometry(0.05, 0.05, len - 0.04, 8).rotateZ(Math.PI / 2), flat(STEEL));
    edge.position.set(0, 1, side * (thick / 2 - 0.05));
    g.add(edge);
  }
  return g;
}

/** A funbox ramp's top edge: a steel coping strip flush with the concrete. */
function funboxEdge(z: Zone, t: Terrain) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max;
  // uphill is against the push; the top edge is the zone's side that way
  const alongX = Math.abs(z.vec[0]) >= Math.abs(z.vec[1]);
  const ex = alongX ? (z.vec[0] > 0 ? x0 : x1) : (x0 + x1) / 2, ez = alongX ? (z0 + z1) / 2 : z.vec[1] > 0 ? z0 : z1;
  const w = alongX ? 0.16 : x1 - x0 - 0.1, d = alongX ? z1 - z0 - 0.1 : 0.16;
  const inX = alongX ? Math.sign(z.vec[0]) * 0.08 : 0, inZ = alongX ? 0 : Math.sign(z.vec[1]) * 0.08;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), flat(STEEL, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  strip.position.set(ex + inX, t.height(ex + inX, ez + inZ) + 0.012, ez + inZ);
  g.add(strip);
  return g;
}

// ------------------------------------------------------------- the rooftops
//
// town15: planks laid from roof to roof over the street, and a cat asleep on one.

/** A plank bridge over the street: boards across the way, two stringers under them. */
function plankBridge(z: Zone, t: Terrain) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = w >= d, L = alongX ? w : d, A = alongX ? d : w; // along the way, across it
  const y = t.height(cx, cz);
  const n = Math.max(4, Math.round(L / 0.55));
  for (let k = 0; k < n; k++) {
    // the boards a hair apart, a little uneven in tone
    const u = -L / 2 + (L / n) * (k + 0.5), bw = L / n - 0.05;
    const board = drawn(rbox(alongX ? bw : A, 0.1, alongX ? A : bw, 0.02), flat(k % 3 ? C.wood : C.woodDark));
    board.position.set(cx + (alongX ? u : 0), y - 0.05, cz + (alongX ? 0 : u));
    g.add(board);
  }
  // the stringers run on under the roofs' edges, where the plank rests
  for (const side of [-1, 1]) {
    const beam = drawn(rbox(alongX ? L + 0.8 : 0.22, 0.22, alongX ? 0.22 : L + 0.8, 0.03), flat(C.woodDark));
    const off = side * (A / 2 - 0.3);
    beam.position.set(cx + (alongX ? 0 : off), y - 0.21, cz + (alongX ? off : 0));
    g.add(beam);
  }
  return g;
}

/** A cat asleep, curled up: the post it is, round, ginger with a tail about it. */
function sleepingCat(r: number) {
  const g = new THREE.Group();
  const fur = flat(0xe39a4f), dark = flat(0xb86a2c), cream = flat(0xf6e3c6);
  const body = drawn(new THREE.SphereGeometry(1, 16, 10), fur);
  body.scale.set(r, r * 0.55, r * 0.8);
  body.position.y = r * 0.5;
  const head = drawn(new THREE.SphereGeometry(r * 0.42, 14, 10), fur);
  head.position.set(r * 0.62, r * 0.55, r * 0.25);
  const muzzle = drawn(new THREE.SphereGeometry(r * 0.2, 10, 8), cream);
  muzzle.position.set(r * 0.92, r * 0.47, r * 0.33);
  g.add(body, head, muzzle);
  for (const side of [-1, 1]) {
    const ear = drawn(new THREE.ConeGeometry(r * 0.13, r * 0.26, 4), dark);
    ear.position.set(r * 0.6, r * 0.93, r * 0.25 + side * r * 0.2);
    ear.rotation.x = side * 0.25;
    g.add(ear);
  }
  // the tail wrapped round the front, and a stripe or two over the back
  const tail = drawn(new THREE.TorusGeometry(r * 0.78, r * 0.11, 6, 16, Math.PI * 0.9), dark);
  tail.rotation.set(Math.PI / 2, 0, Math.PI * 0.05);
  tail.position.y = r * 0.14;
  g.add(tail);
  for (const k of [-0.25, 0.05, 0.35]) {
    const stripe = drawn(new THREE.TorusGeometry(r * 0.5, r * 0.05, 4, 10, Math.PI), dark);
    stripe.scale.set(1, 1.05, 1.5);
    stripe.rotation.y = Math.PI / 2;
    stripe.position.set(k * r, r * 0.52, 0);
    g.add(stripe);
  }
  return g;
}

function piece(kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain, s: Hole) {
  const night = timeOf(s.hole) !== "day";
  // seeded by where it stands: two pieces of one skin get different looks
  const at = "c" in item ? item.c : "min" in item ? item.min : [0, 0];
  const rand = seeded("piece" + s.hole + kind + (item.skin || "") + at[0].toFixed(2) + "," + at[1].toFixed(2));
  const skin = item.skin || "";
  if (kind === "post") {
    const post = item as Post; // (kind says which)
    const [x, z] = post.c, r = post.r;
    let m: THREE.Object3D | null = null;
    if (skin === "lamp") {
      m = lamp(night);
      const foot = drawn(new THREE.CylinderGeometry(r, r * 1.1, 0.3, 12), flat(T.iron));
      foot.position.y = 0.15;
      m.add(foot);
    } else if (skin === "house") {
      const h = townHouse(rand, night, 0);
      h.g.scale.setScalar(r / (1.05 * 1.12)); // its wall, at the ground, is the post
      m = h.g;
    } else if (skin === "clock") {
      m = clockTower(night);
      m.scale.setScalar(r / 1.2);
    } else if (skin === "gnome statue") {
      m = new THREE.Group();
      const plinth = drawn(new THREE.CylinderGeometry(r, r * 1.08, 0.5, 14), flat(T.curb));
      plinth.position.y = 0.25;
      const gn = gnomelet(rand);
      gn.scale.setScalar(2.2);
      gn.position.y = 0.5;
      m.add(plinth, gn);
    } else if (skin === "roundabout") {
      m = new THREE.Group();
      const curb = drawn(new THREE.CylinderGeometry(r, r, 0.35, 32), flat(T.curb));
      curb.position.y = 0.17;
      const lawn = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.25, r - 0.25, 0.4, 32), flat(0x7fb28a));
      lawn.position.y = 0.2;
      m.add(curb, lawn);
      const tree = streetTree(rand, true);
      tree.position.y = 0.2;
      m.add(tree);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, f = tflower(rand);
        f.scale.multiplyScalar(0.6);
        f.position.set(Math.cos(a) * (r - 0.7), 0.4, Math.sin(a) * (r - 0.7));
        m.add(f);
      }
    } else if (skin === "chimney") {
      m = new THREE.Group();
      const stack = drawn(new THREE.CylinderGeometry(r, r, 1.6, 12), flat(0xb8573f));
      stack.position.y = 0.8;
      const lip = drawn(new THREE.CylinderGeometry(r * 1.15, r * 1.15, 0.2, 12), flat(T.quay));
      lip.position.y = 1.65;
      m.add(stack, lip);
    } else if (skin === "cat") m = sleepingCat(r);
    else if (PLAZA_POSTS[skin]) m = PLAZA_POSTS[skin](r, rand, night);
    return m ? onGround(m, x, z, t) : undefined;
  }
  if (kind === "wall") {
    if (!["tram", "clock hand", "stall", "awning", "rail", "ledge"].includes(skin)) return undefined;
    const bar = item as Bar; // (kind says which)
    const [cx, cz] = bar.c, len = bar.length, thick = bar.thick, ang = bar.ang, g = new THREE.Group();
    const make: Record<string, () => THREE.Group> = { tram: () => tramAcross(len, thick, night), "clock hand": () => clockHand(len, thick), stall: () => stallAcross(len, thick, rand), awning: () => awningAcross(len, thick), rail: () => grindRail(len, thick), ledge: () => skateLedge(len, thick) };
    g.add(make[skin]());
    g.rotation.y = -ang; // a timed bar is drawn still: course.js shows and slides it with the replay
    // one mesh per kind of material: a timed bar stays out of the bake
    // (a ledge stands on the park's floor, whatever ramp runs up beside it)
    if (skin === "ledge") {
      const m = mergeLive(g);
      m.position.set(cx, 0, cz);
      return m;
    }
    return onGround(mergeLive(g), cx, cz, t);
  }
  if (kind === "zone") {
    const zone = item as Zone; // (kind says which)
    const [x0, z0] = zone.min, [x1, z1] = zone.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    if (PLAZA_GROUND[skin]) return PLAZA_GROUND[skin](zone, s, t);
    if (skin === "plank bridge") return plankBridge(zone, t);
    if (skin === "funbox") return funboxEdge(zone, t);
    if (skin === "quarter pipe") return new THREE.Group(); // the ground rises itself: concrete, nothing on it
    if (skin === "fountain") {
      const f = fountain();
      f.scale.set(w / 3.2, 0.45, d / 3.2); // a low rim: the ball rolls in, it does not bounce off
      return onGround(f, cx, cz, t);
    }
    if (skin === "canal") {
      const g = new THREE.Group();
      const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshToonMaterial({ color: C.pond, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.06;
      g.add(water);
      for (const ex of [-w / 2, w / 2]) {
        const edge = drawn(rbox(0.25, 0.12, d, 0.04), flat(T.quay));
        edge.position.set(ex, 0.06, 0);
        g.add(edge);
      }
      return onGround(g, cx, cz, t);
    }
    if (skin === "bridge") {
      const g = new THREE.Group();
      const n = Math.max(4, Math.round(w / 0.5));
      for (let i = 0; i < n; i++) {
        const plank = drawn(rbox(w / n - 0.04, 0.1, d, 0.03), flat(i % 2 ? C.wood : C.woodDark));
        plank.position.set(-w / 2 + (w / n) * (i + 0.5), 0.06, 0);
        g.add(plank);
      }
      for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
        const post = drawn(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), flat(C.woodDark));
        post.position.set(px, 0.35, pz);
        g.add(post);
      }
      return onGround(g, cx, cz, t);
    }
    if (skin === "stairs") {
      // stone steps across the slope, each at the ground's height there
      const g = new THREE.Group(), up = zone.vec[0] !== 0 ? 0 : 1, n = 5;
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n;
        const sx = up === 0 ? x0 + w * k : cx, sz = up === 1 ? z0 + d * k : cz;
        const step = drawn(rbox(up === 0 ? w / n - 0.05 : w, 0.08, up === 1 ? d / n - 0.05 : d, 0.03), flat(i % 2 ? T.curb : T.quay));
        step.position.set(sx, t.height(sx, sz) + 0.03, sz);
        g.add(step);
      }
      return g;
    }
    // (the roof zone: the shared rooftops, at their own depth, are right)
    if (skin === "door" || skin === "well") {
      const g = new THREE.Group(), r = Math.min(w, d) / 2;
      if (skin === "well") {
        g.add(onGround(well(r), cx, cz, t), onGround(well(r), zone.vec[0], zone.vec[1], t));
      } else {
        // the way in faces where the ball comes from; the way out faces on
        const into = Math.atan2(zone.vec[1] - cz, zone.vec[0] - cx);
        const a = onGround(doorway(false), cx, cz, t), b = onGround(doorway(true), zone.vec[0], zone.vec[1], t);
        a.rotation.y = -into - Math.PI / 2;
        b.rotation.y = -into + Math.PI / 2;
        g.add(a, b);
      }
      return g;
    }
    return undefined;
  }
  return undefined;
}

// ------------------------------------------------------------- the swing bridge
//
// town10: a canal across the lane, and a bridge that is down on one stroke
// and swung open on the next (the chain's pulse zones: a "bridge" surface or
// a "canal" hazard over the same strip). The canal is always drawn; each
// stroke the bridge is drawn down or open, by what the stroke brings.
function swingBridge(z: Zone, open: boolean, t: Terrain) {
  const [x0, z0] = z.min, [x1, z1] = z.max, w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2;
  const g = new THREE.Group();
  const y = t.height(cx, (z0 + z1) / 2);
  // the deck, hinged at its near end on a stone pier on the bank
  const pier = drawn(box3(1, 1.2, 1.4), flat(T.quay));
  pier.position.set(x0 - 0.3, y + 0.1, z0 + 0.7);
  g.add(pier);
  const hinge = new THREE.Group();
  hinge.position.set(x0 - 0.3, y + 0.12, z0 + 0.7);
  const deck = new THREE.Group();
  const n = Math.max(4, Math.round(w / 0.55));
  for (let i = 0; i < n; i++) {
    const plank = drawn(box3(w / n - 0.05, 0.12, d - 0.4), flat(i % 2 ? C.wood : C.woodDark));
    plank.position.set(0.3 + (w / n) * (i + 0.5), 0, (d - 0.4) / 2 - 0.5);
    deck.add(plank);
  }
  for (const side of [-0.5, d - 0.9]) {
    const rail = drawn(box3(w, 0.1, 0.1), flat(C.woodDark));
    rail.position.set(0.3 + w / 2, 0.55, side);
    deck.add(rail);
  }
  hinge.add(mergeLive(deck));
  // swung open: turned round its pier out over the bank, clear of the water
  hinge.rotation.y = open ? Math.PI / 2 : 0;
  g.add(hinge);
  return g;
}

/** A stroke's pieces town draws itself: the swing bridge, down or open. */
function extras(ex: Extras, s: Hole, t: Terrain) {
  const bridge = (ex.zones || []).find((z) => z.skin === "bridge" && z.max[1] - z.min[1] >= s.board.h - 0.01);
  const canal = (ex.zones || []).find((z) => z.skin === "canal");
  const z = bridge || canal;
  if (!z || s.hole.indexOf("town10") < 0) return undefined;
  const group = new THREE.Group();
  group.add(swingBridge(z, !bridge, t));
  return { group, skins: new Set(["bridge", "canal"]) };
}

export { base, edging, berms, decor, rough, green, piece, extras };
