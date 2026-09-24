import * as THREE from "three";
import { CUP_R, BALL_R, inZone, airy } from "../terrain.js";
import { CELL } from "../terrain.js";
import { C, ink, flat, drawn, clipTo, rbox } from "./materials.js";
import { animate, state } from "./state.js";
import { stone, warp, badge, windmill } from "./props.js";
import { MOUTHS, mouthAt } from "./pieces.js";
import { seeded } from "./common.js";
import { drape, fromWorld } from "./course.js";

/**
 * A rounded, slightly wobbly outline inside a zone's rectangle: water and sand
 * look like ponds and bunkers, not tiles. It only ever eats into the
 * rectangle, never past it, so what looks wet always is wet.
 */
/** Clips a polygon to a rectangle (Sutherland–Hodgman): a round pond that
 *  reaches past the lane's walls is drawn only inside them. */
function clipRect(pts, x0, z0, x1, z1) {
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= z0, (a, b) => [a[0] + ((b[0] - a[0]) * (z0 - a[1])) / (b[1] - a[1]), z0]],
    [(p) => p[1] <= z1, (a, b) => [a[0] + ((b[0] - a[0]) * (z1 - a[1])) / (b[1] - a[1]), z1]],
  ];
  let out = pts;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length];
      if (inside(b)) {
        if (!inside(a)) out.push(cut(a, b));
        out.push(b);
      } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}

function organic(z, rand, board) {
  if (z.poly && z.poly.length > 2) {
    // the chain's own polygon: drawn as it is. Outside: the rectangle (cut at
    // the board) with the polygon as a hole — the sea round a lane
    const poly = z.poly.map(([x, y]) => [x, y]);
    const V = ([x, y]) => new THREE.Vector2(x, -y);
    if (!z.outside) {
      const points = clipRect(poly, z.min[0], z.min[1], z.max[0], z.max[1]);
      return { shape: new THREE.Shape(points.map(V)), points };
    }
    const x0 = Math.max(0, z.min[0]), y0 = Math.max(0, z.min[1]), x1 = Math.min(board.w, z.max[0]), y1 = Math.min(board.h, z.max[1]);
    const shape = new THREE.Shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(V));
    shape.holes.push(new THREE.Path(poly.map(V)));
    return { shape, points: poly };
  }
  if (z.round) {
    // the chain's own ellipse, a hair of wobble, cut at the board's edge
    const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
    const hx = (z.max[0] - z.min[0]) / 2, hz = (z.max[1] - z.min[1]) / 2;
    const phase = rand() * 6, raw = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, k = 1 + 0.015 * Math.sin(a * 6 + phase);
      raw.push([cx + Math.cos(a) * hx * k, cz + Math.sin(a) * hz * k]);
    }
    const points = clipRect(raw, 0, 0, board.w, board.h);
    const shape = new THREE.Shape(points.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    return { shape, points };
  }
  const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1];
  const cx = z.min[0] + w / 2, cz = z.min[1] + h / 2;
  const hx = w / 2, hz = h / 2;
  const phase = rand() * 6, n = 64;
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a superellipse is a rectangle with soft corners; the wobble eats inward
    const c = Math.cos(a), s = Math.sin(a);
    // Nearly the zone's own rectangle, corners softened: the chain drowns the
    // ball as soon as its centre is inside, so the drawn water must reach the
    // zone's edge. A shape eaten inward left a strip of "grass" that drowned
    // you. The ball's radius (0.5) covers the small inset that remains.
    const e = 0.16; // closer to 0 is a rectangle
    let x = Math.sign(c) * Math.pow(Math.abs(c), e) * hx;
    let zz = Math.sign(s) * Math.pow(Math.abs(s), e) * hz;
    // a small wobble, so the bank does not look ruled
    const pull = 0.04 + 0.12 * (1 + Math.sin(a * 5 + phase)) / 2;
    const len = Math.hypot(x, zz) || 1;
    x -= (x / len) * pull;
    zz -= (zz / len) * pull;
    points.push([cx + x, cz + zz]);
  }
  const shape = new THREE.Shape(points.map(([x, zz]) => new THREE.Vector2(x, -zz)));
  return { shape, points };
}

/**
 * Where the ball can be, as a texture: one texel per terrain cell, green or
 * not. A zone drawn with it as an alpha map (and alphaTest) shows only inside
 * the walls — sand or water whose rectangle reaches past an angled rim stops
 * at the wall instead of spilling over the rough. Filtered, so the cut follows
 * a diagonal wall instead of stair-stepping.
 */
function greenMask(t) {
  if (t.mask) return t.mask;
  const data = new Uint8Array(t.nx * t.nz * 4);
  for (let j = 0; j < t.nz; j++) for (let i = 0; i < t.nx; i++) if (t.green[t.idx(i, j)]) data.fill(255, (j * t.nx + i) * 4, (j * t.nx + i) * 4 + 4);
  const tex = new THREE.DataTexture(data, t.nx, t.nz, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  // a shape's uv is (x, -z) in board units: to the mask's 0..1
  tex.repeat.set(1 / (t.nx * CELL), -1 / (t.nz * CELL));
  tex.needsUpdate = true;
  return (t.mask = tex);
}

/** The water of a hole as a mask (cells of the green inside a hazard zone),
 *  for clipping ripples and splashes to it. */
export function waterMask(t, s) {
  if (t.water) return t.water;
  const data = new Uint8Array(t.nx * t.nz * 4);
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      const x = (i + 0.5) * CELL, zz = (j + 0.5) * CELL, q = t.zoneAt(x, zz);
      if (t.green[t.idx(i, j)] && q && (q.kind === "hazard" || q.skin === "puddle")) data.fill(255, (j * t.nx + i) * 4, (j * t.nx + i) * 4 + 4);
    }
  const tex = new THREE.DataTexture(data, t.nx, t.nz, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return (t.water = { tex, data, nx: t.nx, nz: t.nz, cell: CELL, w: t.nx * CELL, h: t.nz * CELL });
}

const TUNNEL_COLORS = [C.cap, 0x5b6fb5, C.sun, 0xe98fb0];

/**
 * What a zone adds on top of its colour in the ground. A dispatch table:
 * the first entry whose test matches draws the zone (world pieces first).
 */
const ZONE_DRAW = [
  [(z) => z.kind === "loop" && (z.skin === "loop-the-loop" || z.skin === "bob loop"), loopTrack],
  [(z) => z.skin === "castle tube", (z, s, t, g) => {
    const castle = (s.posts || []).find((p) => p.skin === "sandcastle");
    const [cx, cz] = [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2];
    return castle ? castleSlide(z, s, t, g, castle, [cx, cz], z.vec) : g;
  }],
  [(z) => z.skin === "crevasse" || z.skin === "ditch", draw_gap],
  [(z) => z.kind === "slope" && z.skin === "moon bridge", moonBridge],
  [(z) => z.kind === "slope" && !airy(z) && z.skin !== "mound" && (z.vec[0] || z.vec[1]), draw_contours],
  [(z) => z.skin === "mill", draw_mill],
  [(z) => z.skin === "molehill", draw_molehill],
  [(z) => z.kind === "surface" || z.kind === "hazard", draw_surface],
  [(z) => z.kind === "tunnel", draw_tunnel],
];

function zoneDetail(z, s, t) {
  const own = fromWorld(s, "zone", z, t);
  if (own) return own;
  const g = new THREE.Group();
  const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1];
  const rand = seeded("zone" + s.hole + z.min + z.max);
  const inside = () => [z.min[0] + rand() * w, z.min[1] + rand() * h];
  const onGreen = t.onGreen;
  const hit = ZONE_DRAW.find(([test]) => test(z));
  if (!hit) return g;
  return hit[1] === draw_gap ? draw_gap(z, s, t) : hit[1](z, s, t, g, { w, h, rand, inside, onGreen });
}

/** A real gap in the lane: a crevasse (ice) or a ditch (earth). */
function draw_gap(z, s, t) {
  // a ditch is the garden's crevasse: earth and roots, not ice
  const earth = z.skin === "ditch";
  // the gap itself: ice cliffs down both sides (where the rough and the
  // world's ground meet it; the lane's own sides are the ground's), a dark
  // blue depth at the bottom, and icicles hanging off the lips
  const g = new THREE.Group();
  const D = -7, x0 = z.min[0], x1 = z.max[0], z0 = z.min[1], z1 = z.max[1];
  const rand = seeded("crevasse" + s.hole + z.min);
  const onGreen = t.onGreen;
  const cliff = flat(earth ? 0x7a5236 : 0x8fcde6, { side: THREE.DoubleSide });
  for (const x of [x0, x1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0 + 8, -0.6 - D), cliff);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, (-0.6 + D) / 2, (z0 + z1) / 2);
    g.add(m);
  }
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0 + 8), new THREE.MeshBasicMaterial({ color: earth ? 0x2a1d14 : 0x1d3a5c }));
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.set((x0 + x1) / 2, D, (z0 + z1) / 2);
  g.add(bottom);
  for (let k = 0; k < Math.round((z1 - z0) * 1.2); k++) {
    const zz = z0 + rand() * (z1 - z0), x = rand() < 0.5 ? x0 : x1, y = onGreen(x - 0.3, zz) || onGreen(x + 0.3, zz) ? 0 : -0.6;
    // icicles off an ice lip; roots dangling off an earth one
    const ic = new THREE.Mesh(earth ? new THREE.CylinderGeometry(0.03, 0.05, 0.6 + rand() * 0.7, 4) : new THREE.ConeGeometry(0.1, 0.5 + rand() * 0.6, 5), flat(earth ? 0x5a3a24 : 0xe8f6fb));
    ic.rotation.x = Math.PI;
    ic.position.set(x + (x === x0 ? 0.1 : -0.1), y - 0.35, zz);
    g.add(ic);
  }
  return g;
}

/**
 * Half of a moon bridge (one of its two slopes): planks across the deck on
 * the arch the terrain already makes, and a red side each way, down into the
 * stream, with the arch's dark opening under the crest. No rails: the chain
 * has none, and a ball that runs off the side is in the water.
 */
function moonBridge(z, s, t, g) {
  const alongX = Math.abs(z.vec[0]) > Math.abs(z.vec[1]); // the slope's own axis
  const [a0, a1] = alongX ? [z.min[0], z.max[0]] : [z.min[1], z.max[1]];
  const [b0, b1] = alongX ? [z.min[1], z.max[1]] : [z.min[0], z.max[0]];
  const P = (a, b) => (alongX ? [a, b] : [b, a]);
  const H = (a) => t.height(...P(a, (b0 + b1) / 2));
  const wood = flat(0xb9804c), red = flat(0xc8452f), shade = flat(0x2f5f75, { side: THREE.DoubleSide });
  const n = Math.max(2, Math.round((a1 - a0) / 0.42));
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * (a1 - a0), d = 0.1, slope = (H(Math.min(a1 - 0.01, a + d)) - H(Math.max(a0, a - d))) / (2 * d);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(alongX ? (a1 - a0) / n - 0.05 : b1 - b0, 0.06, alongX ? b1 - b0 : (a1 - a0) / n - 0.05), k % 2 ? wood : flat(0xa9733f));
    const [x, zz] = P(a, (b0 + b1) / 2);
    plank.position.set(x, H(a) + 0.02, zz);
    if (alongX) plank.rotation.z = Math.atan(slope);
    else plank.rotation.x = -Math.atan(slope);
    g.add(plank);
  }
  // each side: a red face from the deck's edge down into the water, with the
  // arch's shadow cut in under the crest
  const crest = Math.abs(H(a0)) > Math.abs(H(a1)) ? a0 : a1, foot = crest === a0 ? a1 : a0;
  for (const b of [b0 - 0.02, b1 + 0.02]) {
    const prof = [];
    for (let k = 0; k <= 16; k++) {
      const a = a0 + (k / 16) * (a1 - a0);
      prof.push([a, H(a) + 0.06]);
    }
    const side = [...prof, [a1, -0.3], [a0, -0.3]];
    const hole = [];
    for (let k = 0; k <= 12; k++) {
      // a quarter ellipse from the crest down to the stream, the arch's inside
      const q = (k / 12) * (Math.PI / 2), a = crest + (foot - crest) * Math.sin(q) * 0.55, y = -0.3 + (H(crest) * 0.6) * Math.cos(q);
      hole.push([a, Math.max(-0.3, y)]);
    }
    hole.push([crest, -0.3]);
    for (const [pts, mat, off] of [[side, red, 0], [hole, shade, 0.012]]) {
      const shp = new THREE.Shape(pts.map(([a, y]) => new THREE.Vector2(a, y)));
      const geo = new THREE.ShapeGeometry(shp);
      const m = new THREE.Mesh(geo, mat === red ? flat(0xc8452f, { side: THREE.DoubleSide }) : mat);
      // the shape's x is along the bridge, its y is height: stand it up on the side
      if (alongX) m.position.set(0, 0, b + (b === b0 - 0.02 ? -off : off));
      else {
        m.rotation.y = -Math.PI / 2;
        m.position.set(b + (b === b0 - 0.02 ? -off : off), 0, 0);
      }
      g.add(m);
    }
    // the red beam along the top of the side
    const beam = new THREE.CatmullRomCurve3(prof.map(([a, y]) => { const [x, zz] = P(a, b); return new THREE.Vector3(x, y - 0.04, zz); }));
    g.add(drawn(new THREE.TubeGeometry(beam, 24, 0.09, 6, false), red));
  }
  return g;
}

function draw_contours(z, s, t, g, { w, h, rand, inside, onGreen }) {
  // Contour lines, like a map: one every half unit of height, across the
  // slope and draped on it. They show where it rises and how steeply —
  // bunched up where it is steep — without an arrow in sight.
  const l = Math.hypot(z.vec[0], z.vec[1]);
  const ux = -z.vec[0] / l, uz = -z.vec[1] / l; // uphill
  const vx = -uz, vz = ux;                        // across
  const contour = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
  const reach = Math.hypot(w, h) / 2 + 3;
  const segs = [];
  let last = t.height(cx - ux * reach, cz - uz * reach);
  for (let a = -reach; a <= reach; a += 0.25) {
    const px = cx + ux * a, pz = cz + uz * a;
    const hh = t.height(px, pz);
    if (Math.floor(hh / 0.5) === Math.floor(last / 0.5) || hh < 0.2) { last = hh; continue; }
    last = hh;
    // walk across the slope at this height, keeping the pieces on the green
    let run = [];
    const flush = () => {
      // as pairs, all in one LineSegments per slope (one draw, and one
      // material the replay can light up)
      for (let k = 1; k < run.length; k++) segs.push(run[k - 1], run[k]);
      run = [];
    };
    for (let b = -reach; b <= reach; b += 0.3) {
      const x = px + vx * b, zz = pz + vz * b;
      const nearCup = Math.hypot(x - s.cup[0], zz - s.cup[1]) < CUP_R + 0.5;
      if (!onGreen(x, zz) || t.height(x, zz) < 0.15 || nearCup) { flush(); continue; }
      run.push(new THREE.Vector3(x, t.height(x, zz) + 0.04, zz));
    }
    flush();
  }
  if (segs.length) {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), contour);
    lines.userData.live = true; // lit by the replay: never baked
    g.add(lines);
    // glow(k): 0 at rest, 1 fully lit (a pale gold) while the ball rolls on it
    const rest = new THREE.Color(0xffffff), lit = new THREE.Color(0xffe38a);
    state.slopes.set(z, {
      glow(k) {
        k = Math.max(0, Math.min(1, k));
        contour.color.copy(rest).lerp(lit, k);
        contour.opacity = 0.55 + 0.45 * k;
      },
    });
  }
  return g;
}

function draw_mill(z, s, t, g, { w, h, rand, inside, onGreen }) {
  // the mill standing across the lane: a big tower, its sails turning
  const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
  const k = Math.min(w, h) / 2.4, y0 = t.height(cx, cz);
  const m = windmill(cx, y0, cz);
  m.group.scale.setScalar(k);
  m.group.rotation.y = -Math.PI / 2; // the sails face the tee
  // long sweeps, so a sail reaches down over whichever door it blocks
  // (the tips pass just clear of the mill's low base kerb)
  for (const arm of m.hub.children.slice(1)) arm.scale.y = 1.1;
  m.hub.userData.live = true;
  // The chain turns the wheel within the stroke: its sails are timed
  // walls over the doors (hole4: a turn in 24 substeps, a sail down over
  // the middle door at every quarter). So the replay drives it — at step u
  // of a shot the wheel is at start + u × a 24th of a turn, sails where the
  // chain has them. Between shots it turns on its own; on a new shot it
  // eases on to the next quarter (four sails: every quarter is the start).
  const STEP = (Math.PI * 2) / 24, QUARTER = Math.PI / 2;
  let ang = Math.PI, start = null, goal = null, last = null;
  state.mill = {
    shoot() {
      // the next quarter at least a little ahead (π, sail down, is a quarter)
      start = Math.ceil((ang + 0.15) / QUARTER) * QUARTER;
      goal = start;
    },
    at(u) { if (start !== null) goal = start + u * STEP; },
    idle() { start = goal = null; },
  };
  animate((time) => {
    const dt = last === null ? 0 : Math.min(0.1, time - last);
    last = time;
    if (goal === null) ang += 1.1 * dt; // idle: turning, the same way as in a shot
    else ang += Math.min(Math.max(0, goal - ang), Math.max(1.5 * dt, (goal - ang) * Math.min(1, dt * 14)));
    m.hub.rotation.z = ang;
  });
  g.add(m.group);
  return g;
  return g;
}

function draw_molehill(z, s, t, g, { w, h, rand, inside, onGreen }) {
  // where the mole lives: a ring of turned earth, flat enough to roll over
  const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
  const y = t.height(cx, cz);
  const ring = drawn(new THREE.TorusGeometry(0.75, 0.2, 8, 20), flat(C.bark));
  ring.rotation.x = -Math.PI / 2;
  ring.scale.z = 0.6;
  ring.position.set(cx, y + 0.05, cz);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18), flat(C.burrow));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(cx, y + 0.04, cz);
  for (let k = 0; k < 5; k++) {
    const clod = drawn(new THREE.DodecahedronGeometry(0.14, 0), flat(C.bark));
    const a = (k / 5) * Math.PI * 2 + rand();
    clod.position.set(cx + Math.cos(a) * 1.05, y + 0.08, cz + Math.sin(a) * 1.05);
    g.add(clod);
  }
  g.add(ring, hole);
  return g;
  return g;
}

function draw_surface(z, s, t, g, { w, h, rand, inside, onGreen }) {
  const water = z.kind === "hazard";
  const ice = z.skin === "ice" || (z.kind === "surface" && z.scale > 1);
  // skins the chain names get their own look; an unknown one is the kind's
  const bed = z.skin === "flowerbed", puddle = z.skin === "puddle", deck = z.skin === "bridge", soil = z.skin === "soil";
  const WATER = { sea: 0x4ea3cf, wave: 0x8fd0ee, lagoon: 0x5fd0cc, tidepool: 0x6fc3c9, fountain: 0x8fd0ee, canal: 0x4d8fb3, gap: 0x1f3d4a };
  // in the mountains a bunker is a patch of deep snow: same drag, white
  const snow = s.world === "mountain" && !water && !ice && !puddle && !bed && !deck && (z.skin === "sand" || !z.skin);
  const color = snow ? 0xf3f7fa : water ? WATER[z.skin] ?? C.pond : puddle ? 0x9fcde0 : bed ? 0x7b5a3f : soil ? 0x6e4d33 : deck ? C.wood : z.skin === "wetsand" ? 0xc8a46e : ice ? 0xbfe6f0 : 0xecd49c;
  const blob = organic(z, rand, s.board);
  // inside the drawn shape and on the green, with a margin: where detail may go
  const inSand = (x, zz) => {
    if (x < 0.4 || zz < 0.4 || x > s.board.w - 0.4 || zz > s.board.h - 0.4) return false;
    if (!onGreen(x, zz)) return false;
    if (z.poly) return inZone(z, x, zz);
    if (!z.round) return true;
    const ex = (x - (z.min[0] + z.max[0]) / 2) / (w / 2), ez = (zz - (z.min[1] + z.max[1]) / 2) / (h / 2);
    return ex * ex + ez * ez < 0.8;
  };
  // a spot for a detail of radius r, all of it inside the shape; null if none
  const spot = (r, lo = 0.25, span = 0.5) => {
    for (let tries = 0; tries < 12; tries++) {
      const x = z.min[0] + w * (lo + rand() * span), zz = z.min[1] + h * (lo + rand() * span);
      if ([[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([a, b]) => inSand(x + a, zz + b))) return [x, zz];
    }
    return null;
  };
  const geo = new THREE.ShapeGeometry(blob.shape, 6);
  geo.rotateX(-Math.PI / 2);
  // sunk a touch below the green for water, laid on it for sand
  drape(geo, (x, zz) => t.height(x, zz) + (water ? 0.025 : 0.035));
  g.add(new THREE.Mesh(geo, flat(color, { alphaMap: greenMask(t), alphaTest: 0.5 })));
  if (deck) {
    // planks across the deck, and a rail each side
    const alongX = w >= h, n = Math.floor((alongX ? w : h) / 0.45);
    const line = new THREE.LineBasicMaterial({ color: C.woodDark });
    for (let k = 1; k < n; k++) {
      const u = k / n;
      const a = alongX ? [z.min[0] + u * w, z.min[1]] : [z.min[0], z.min[1] + u * h], b = alongX ? [z.min[0] + u * w, z.max[1]] : [z.max[0], z.min[1] + u * h];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a[0], t.height(...a) + 0.05, a[1]), new THREE.Vector3(b[0], t.height(...b) + 0.05, b[1])]), line));
    }
  }
  // the bank's ink line, only where the bank is on the green
  let run = [];
  const flushRim = () => { if (run.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), ink)); run = []; };
  for (const [x, zz] of [...blob.points, blob.points[0]]) {
    if (onGreen(x, zz)) run.push(new THREE.Vector3(x, t.height(x, zz) + 0.06, zz));
    else flushRim();
  }
  flushRim();

  if (water) {
    // a shore of pebbles, reeds at a corner, a lily pad and ripples — none
    // on a wall: a pond that runs up to one would push them through it
    // (nor on a bridge's deck or a causeway, where a pond runs up to one)
    const onDeck = (x, zz) => s.zones.some((q) => ((q.kind === "slope" && q.skin === "moon bridge") || q.skin === "bridge") && x > q.min[0] - 0.8 && x < q.max[0] + 0.8 && zz > q.min[1] - 0.8 && zz < q.max[1] + 0.8);
    const byWall = (x, zz) => onDeck(x, zz) || s.walls.some((w) => {
      const dx = w.b[0] - w.a[0], dz = w.b[1] - w.a[1], l2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - w.a[0]) * dx + (zz - w.a[1]) * dz) / l2));
      return Math.hypot(x - w.a[0] - u * dx, zz - w.a[1] - u * dz) < 0.8;
    });
    // the sea and a wave have no shore of pebbles and reeds: they are open water
    const shore = !["sea", "wave", "canal", "gap", "fountain"].includes(z.skin);
    if (z.skin === "fountain") {
      // a round basin with a rim, and a spout of water in the middle
      const cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2, r = Math.min(w, h) / 2, y = t.height(cx, cz);
      const rim = drawn(new THREE.TorusGeometry(r, 0.18, 8, 32), flat(0xb9c2bd));
      rim.rotation.x = Math.PI / 2;
      rim.position.set(cx, y + 0.12, cz);
      const col = drawn(new THREE.CylinderGeometry(0.18, 0.3, 1.2, 10), flat(0xb9c2bd));
      col.position.set(cx, y + 0.6, cz);
      const bowl = drawn(new THREE.SphereGeometry(0.7, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), flat(0xa5aea9, { side: THREE.DoubleSide }));
      bowl.position.set(cx, y + 1.35, cz);
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xdff4fb, transparent: true, opacity: 0.8 }));
      jet.position.set(cx, y + 1.8, cz);
      jet.userData.live = true;
      animate((time) => (jet.scale.y = 0.85 + 0.2 * Math.sin(time * 6)));
      g.add(rim, col, bowl, jet);
    }
    if (z.skin === "canal") {
      // stone edges along its long sides
      const alongX = w >= h, n = Math.ceil((alongX ? w : h) / 1.2);
      for (const sgn of [0, 1])
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n;
          const x = alongX ? z.min[0] + u * w : sgn ? z.max[0] : z.min[0], zz = alongX ? (sgn ? z.max[1] : z.min[1]) : z.min[1] + u * h;
          if (!onGreen(x, zz) && !onGreen(x + (alongX ? 0 : sgn ? 0.3 : -0.3), zz + (alongX ? (sgn ? 0.3 : -0.3) : 0))) continue;
          const st = drawn(rbox(alongX ? 1.15 : 0.35, 0.18, alongX ? 0.35 : 1.15, 0.05), flat(k % 2 ? 0xb9c2bd : 0xa5aea9));
          st.position.set(x, t.height(x, zz) + 0.06, zz);
          g.add(st);
        }
    }
    for (let k = 0; shore && k < blob.points.length; k += 3) {
      const [x, zz] = blob.points[k];
      if (byWall(x, zz) || !onGreen(x, zz)) continue;
      const st = stone(rand);
      st.scale.setScalar(0.35 + rand() * 0.2);
      st.position.set(x, t.height(x, zz) + 0.05, zz);
      g.add(st);
    }
    for (let k = 0; shore && k < 5; k++) {
      const [x, zz] = blob.points[Math.floor(rand() * blob.points.length)];
      if (byWall(x, zz) || !onGreen(x, zz)) continue;
      const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.9 + rand() * 0.5, 5), flat(C.leafDark));
      reed.position.set(x, t.height(x, zz) + 0.5, zz);
      reed.rotation.z = (rand() - 0.5) * 0.4;
      const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 3, 6), flat(C.bark));
      tip.position.y = 0.45;
      reed.add(tip);
      g.add(reed);
    }
    for (let k = 0; k < Math.min(8, Math.max(2, (w * h) / 8)); k++) {
      const at = spot(1.0);
      if (!at) continue;
      const [x, zz] = at;
      const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 24), clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), waterMask(t, s)));
      r.rotation.x = -Math.PI / 2;
      r.position.set(x, t.height(x, zz) + 0.04, zz);
      const phase = rand() * 3;
      r.userData.live = true;
      animate((time) => {
        const k = ((time + phase) % 3) / 3; // one ring every three seconds
        r.scale.setScalar(0.6 + k * 1.8);
        r.material.opacity = 0.55 * (1 - k);
      });
      g.add(r);
    }
    const padAt = shore && spot(0.6, 0.3, 0.4);
    if (padAt) {
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14, 0.3, Math.PI * 1.8), flat(C.leaf));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(padAt[0], t.height(padAt[0], padAt[1]) + 0.045, padAt[1]);
      g.add(pad);
    }
  } else if (puddle) {
    // a shallow puddle: glints of sky and rings, all inside it
    const ringMat = () => clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), waterMask(t, s));
    for (let k = 0; k < 3; k++) {
      const at = spot(0.8);
      if (!at) continue;
      const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 24), ringMat());
      r.rotation.x = -Math.PI / 2;
      r.position.set(at[0], t.height(at[0], at[1]) + 0.045, at[1]);
      const phase = rand() * 3;
      r.userData.live = true;
      animate((time) => {
        const k = ((time + phase) % 3) / 3;
        r.scale.setScalar(0.5 + k * 1.6);
        r.material.opacity = 0.5 * (1 - k);
      });
      g.add(r);
    }
    const glint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
    for (let k = 0; k < 5; k++) {
      const at = spot(0.5, 0.2, 0.6);
      if (!at) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + rand() * 0.6, 0.07), glint);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -0.6;
      m.position.set(at[0], t.height(at[0], at[1]) + 0.05, at[1]);
      g.add(m);
    }
  } else if (soil) {
    // a row of the vegetable patch: furrows along it, and cabbages and
    // lettuces planted in lines on the ridges, low enough to roll through
    const pts = z.poly && z.poly.length > 2 ? z.poly : [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]];
    let ax = 1, az = 0, best = 0;
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > best) (best = l), (ax = (b[0] - a[0]) / l), (az = (b[1] - a[1]) / l);
    }
    const nx = -az, nz = ax, cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2, reach = Math.hypot(w, h) / 2 + 1;
    const furrow = new THREE.LineBasicMaterial({ color: 0x4f3524 });
    const heads = [flat(0x8fcb6a), flat(0x6fae55), flat(0xb5d98a)], leaf = new THREE.SphereGeometry(1, 9, 6);
    const inRow = (x, zz) => inSand(x, zz) && inZone(z, x, zz);
    for (let b = -reach, line = 0; b <= reach; b += 0.55, line++) {
      let run = [];
      const flush = () => { if (run.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(run), furrow)); run = []; };
      for (let a = -reach; a <= reach; a += 0.3) {
        const x = cx + ax * a + nx * b, zz = cz + az * a + nz * b;
        if (!inRow(x, zz)) { flush(); continue; }
        run.push(new THREE.Vector3(x, t.height(x, zz) + 0.05, zz));
      }
      flush();
      if (line % 2) continue;
      // every other ridge is planted, a head every 1.1 or so
      for (let a = -reach + (line % 4 ? 0.55 : 0); a <= reach; a += 1.1) {
        const x = cx + ax * a + nx * (b + 0.27), zz = cz + az * a + nz * (b + 0.27), r = 0.17 + rand() * 0.08;
        if (![[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => inRow(x + dx, zz + dz))) continue;
        const m = new THREE.Mesh(leaf, heads[Math.floor(rand() * heads.length)]);
        m.scale.set(r, r * 0.75, r);
        m.position.set(x, t.height(x, zz) + 0.04 + r * 0.5, zz);
        g.add(m);
      }
    }
  } else if (bed) {
    // a bed of soil full of flowers, low enough to read as ground you can
    // roll through (slowly), not a wall of stems
    const petals = [C.petal, C.cream, C.sun, 0x9b7fd1, 0xf29a6b].map((c) => flat(c));
    const stemMat = flat(C.leafDark);
    const head = new THREE.SphereGeometry(0.1, 7, 5), stem = new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4);
    const leaf = new THREE.SphereGeometry(0.12, 6, 4);
    for (let k = 0; k < w * h * 3; k++) {
      const x = z.min[0] + rand() * w, zz = z.min[1] + rand() * h;
      if (!inSand(x, zz)) continue;
      const y = t.height(x, zz) + 0.04;
      if (k % 3 === 2) {
        const l = new THREE.Mesh(leaf, flat(C.leaf));
        l.scale.y = 0.4;
        l.position.set(x, y + 0.03, zz);
        g.add(l);
        continue;
      }
      const st = new THREE.Mesh(stem, stemMat);
      st.position.set(x, y + 0.12, zz);
      const hd = new THREE.Mesh(head, petals[k % petals.length]);
      hd.position.set(x, y + 0.26, zz);
      hd.scale.y = 0.7;
      g.add(st, hd);
    }
  } else if (ice) {
    // ice: long white scratches and a few glints, so it reads frozen, not grey
    const streak = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    for (let k = 0; k < Math.max(6, (w * h) / 6); k++) {
      const at = spot(1.3, 0.2, 0.6);
      if (!at) continue;
      const [x, zz] = at;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rand() * 1.6, 0.06), streak);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -0.5 + (rand() - 0.5) * 0.3;
      m.position.set(x, t.height(x, zz) + 0.045, zz);
      g.add(m);
    }
    for (let k = 0; k < 6; k++) {
      const at = spot(0.2, 0.2, 0.6);
      if (!at) continue;
      const [x, zz] = at;
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.12, 4), streak);
      glint.rotation.x = -Math.PI / 2;
      glint.position.set(x, t.height(x, zz) + 0.05, zz);
      g.add(glint);
    }
  } else if (!deck) {
    // sand: grains and raked lines, kept inside the shape's inner margin
    const grain = new THREE.CircleGeometry(1, 10);
    const tones = snow ? [flat(0xd6e6ef), flat(0xffffff)] : [flat(0xd9bd82), flat(0xf4e1b2)];
    for (let i = 0; i < w * h * 4; i++) {
      const x = z.min[0] + w * (0.2 + rand() * 0.6), zz = z.min[1] + h * (0.2 + rand() * 0.6);
      if (!inSand(x, zz)) continue;
      const d = new THREE.Mesh(grain, tones[i % 2]);
      d.scale.setScalar(0.025 + rand() * 0.035);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, t.height(x, zz) + 0.045, zz);
      g.add(d);
    }
    for (let k = 1; k < Math.floor(h / 0.9); k++) {
      const zz = z.min[1] + k * 0.9;
      const pts = [];
      for (let x = z.min[0] + w * 0.22; x <= z.max[0] - w * 0.22; x += 0.4) {
        if (!inSand(x, zz)) {
          if (pts.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: snow ? 0xc9dce8 : 0xd9bd82 })));
          pts.length = 0;
          continue;
        }
        pts.push(new THREE.Vector3(x, t.height(x, zz) + 0.05, zz + Math.sin(x * 1.3) * 0.12));
      }
      if (pts.length > 1) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: snow ? 0xc9dce8 : 0xd9bd82 })));
    }
  }
  return g;
}

/**
 * The castle gate: an arch in the castle's wall where the ball goes in, and a
 * sand-coloured tube that spirals round the outside of the castle, above the
 * lane (the ball rolls round the castle under it), down to the exit mouth.
 * The replay rides the ball along it (state.tubes).
 */
function castleSlide(z, s, t, g, castle, [cx, cz], [ox, oz]) {
  const [kx, kz] = castle.c, R0 = castle.r;
  const ang = (x, zz) => Math.atan2(zz - kz, x - kx);
  // round the castle the way that leaves it heading +x (east, to the cup):
  // clockwise on the board, the angle going down
  const a0 = ang(cx, cz);
  let a1 = ang(ox, oz);
  while (a1 > a0 - Math.PI * 2.2) a1 -= Math.PI * 2; // about a turn and a quarter
  const r0 = Math.hypot(cx - kx, cz - kz), r1 = Math.hypot(ox - kx, oz - kz), rs = R0 + 0.55; // hugs the wall
  const y0 = t.height(cx, cz), y1 = t.height(ox, oz), top = 5.6, clear = 2.1; // clear of a rolling ball and the ramparts
  // in straight from the tee side: the mouth opens at -x, square to the zone,
  // and the tube runs +x a little before it turns round the castle
  const lead = Math.max(0.3, Math.min(0.8, r0 - R0 - 0.6));
  const sit = 0.9; // the mouth's centre: its ring clears the ground
  const pts = [new THREE.Vector3(cx - 0.05, y0 + sit, cz), new THREE.Vector3(cx + lead, y0 + sit + 0.1, cz)];
  const N = 90;
  for (let k = 3; k < N; k++) {
    const u = k / N, a = a0 + (a1 - a0) * u;
    const edge = Math.min(1, Math.min(u, 1 - u) / 0.1);
    const r = u < 0.5 ? r0 + (rs - r0) * edge : r1 + (rs - r1) * edge;
    const up = Math.min(1, Math.min(u, 1 - u) / 0.07);
    const yy = (u < 0.5 ? y0 : y1) + sit + up * (clear - sit) + Math.sin(Math.PI * u) * (top - clear);
    pts.push(new THREE.Vector3(kx + Math.cos(a) * r, yy, kz + Math.sin(a) * r));
  }
  // and out, straightened: the last stretch runs east onto the exit
  pts.push(new THREE.Vector3(ox - 1.4, y1 + sit + 0.3, oz), new THREE.Vector3(ox, y1 + sit, oz));
  const path = new THREE.CatmullRomCurve3(pts);
  const tubeR = 0.6; // the zone is 1.6 across: the mouth fills it
  g.add(drawn(new THREE.TubeGeometry(path, 200, tubeR, 12, false), flat(0xe0bd7e)));
  const rim = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + tubeR * 0.85)));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(rim, 200, 0.07, 5, false), flat(0xb98f55)));
  // the two mouths: wet-sand arches, dark inside; the entry faces the tee
  // (-x), the exit faces the cup (+x)
  for (const u of [0, 1]) {
    const p = path.getPoint(u);
    // square to the lane: the entry faces the tee (-x), the exit the cup (+x)
    const face = new THREE.Vector3(u === 0 ? -1 : 1, 0, 0);
    const arch = new THREE.Group();
    const ring = drawn(new THREE.TorusGeometry(tubeR * 1.35, 0.16, 8, 18), flat(0xc9a66a));
    // a dark throat going into the tube: it reads "in here" from any angle
    const hole = new THREE.Mesh(new THREE.CircleGeometry(tubeR * 1.2, 18), new THREE.MeshBasicMaterial({ color: C.burrow }));
    hole.position.z = -0.35;
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(tubeR * 1.2, tubeR * 1.2, 0.4, 18, 1, true), new THREE.MeshBasicMaterial({ color: C.burrow, side: THREE.BackSide }));
    throat.rotation.x = Math.PI / 2;
    throat.position.z = -0.15;
    arch.add(ring, hole, throat);
    arch.position.copy(p);
    arch.lookAt(p.x + face.x, p.y, p.z + face.z);
    g.add(arch);
  }
  state.tubes.set(z, path);
  return g;
}

function draw_tunnel(z, s, t, g, { w, h, rand, inside, onGreen }) {
  // A tunnel is a hole in the ground with a coloured rim, and a badge over
  // it pointing down; its way out is a pipe of the same colour with a badge
  // pointing up. Nothing else on a hole looks like that — the cup has its
  // target and the yellow arrow — so there is no guessing which is which.
  const pair = TUNNEL_COLORS[s.zones.filter((q) => q.kind === "tunnel").indexOf(z) % TUNNEL_COLORS.length];
  const [cx, cz] = [z.min[0] + w / 2, z.min[1] + h / 2];
  const y = t.height(cx, cz);
  const [ox, oz] = z.vec;
  const oy = t.height(ox, oz);
  // The tube is the tunnel: its open mouth lies on the green facing the
  // tee and swallows the ball, the other end lies by the exit and spits it
  // out facing the cup. The mouth's opening is the zone the chain tests.
  const flat2 = (x, zz) => new THREE.Vector3(x, 0, zz);
  const dirIn = flat2(s.start[0] - cx, s.start[1] - cz).normalize();
  const dirOut = flat2(s.cup[0] - ox, s.cup[1] - oz).normalize();
  if (MOUTHS[z.skin]) {
    // an entrance that is a thing (a cave, a well, a door, a wreck), and
    // the same thing where the ball comes out; no pipe between
    const R = Math.max(0.6, Math.min(w, h) * 0.4);
    g.add(mouthAt(z.skin, cx, y, cz, R, dirIn), mouthAt(z.skin, ox, oy, oz, R * 0.8, dirOut));
    return g;
  }
  if (z.skin === "castle gate") {
    const castle = (s.posts || []).find((p) => p.skin === "sandcastle");
    if (castle) return castleSlide(z, s, t, g, castle, [cx, cz], [ox, oz]);
  }
  if (z.skin === "warp") {
    // a magic hole: a spinning, glowing swirl at each end, and nothing in
    // between — the ball drops into one and pops out of the other
    g.add(warp(cx, y, cz, Math.min(w, h) / 2, pair), warp(ox, oy, oz, 1.1, pair));
    return g;
  }
  // the mouth lies on the ground, its opening right where the chain swallows
  // the ball: you roll into the pipe, you do not drop into a hole next to it
  const R = Math.max(0.6, Math.min(w, h) * 0.32), lift = R * 1.4 + 0.15; // the bell's lip clears the grass
  const mouth = new THREE.Vector3(cx, y + lift, cz).addScaledVector(dirIn, 0.25);
  const out = new THREE.Vector3(ox, oy + lift, oz).addScaledVector(dirOut, 0.25);
  const span = mouth.distanceTo(out), top = Math.max(y, oy) + Math.min(4.5, 1.6 + span * 0.12);
  // a pipe that would cross a mill goes under it instead: over the top it
  // would pass through the turning sails. It dives into the ground right
  // behind its mouth and comes up again at its exit, like a garden pipe.
  const underMill = s.zones.some((q) => q.skin === "mill" && Math.min(cx, ox) < q.min[0] && Math.max(cx, ox) > q.max[0]);
  const path = underMill
    ? new THREE.CatmullRomCurve3([
        mouth,
        new THREE.Vector3(cx, y + lift * 0.55, cz).addScaledVector(dirIn, -0.7),
        new THREE.Vector3(cx, y - 1.4, cz).addScaledVector(dirIn, -1.3),
        mouth.clone().lerp(out, 0.5).setY(Math.min(y, oy) - 2.2),
        new THREE.Vector3(ox, oy - 1.4, oz).addScaledVector(dirOut, -1.3),
        new THREE.Vector3(ox, oy + lift * 0.55, oz).addScaledVector(dirOut, -0.7),
        out,
      ])
    : new THREE.CatmullRomCurve3([
        mouth,
        new THREE.Vector3(cx, y + lift + 0.2, cz).addScaledVector(dirIn, -1.2),
        mouth.clone().lerp(out, 0.5).setY(top),
        new THREE.Vector3(ox, oy + lift + 0.2, oz).addScaledVector(dirOut, -1.2),
        out,
      ]);
  const tube = drawn(new THREE.TubeGeometry(path, 70, R, 12, false), flat(pair));
  g.add(tube);
  // a flared bell at each end, dark inside: the openings read at a glance
  for (const [at, dir] of [[mouth, dirIn], [out, dirOut]]) {
    // a real mouth: the flared bell seen from both sides, a thick lip,
    // a dark throat going into the tube, and the bottom set well back
    const ends = new THREE.Group();
    ends.position.copy(at);
    ends.lookAt(at.clone().add(dir));
    const bell = drawn(new THREE.CylinderGeometry(R * 1.4, R * 1.02, 0.6, 20, 1, true), flat(pair, { side: THREE.DoubleSide }));
    bell.rotation.x = Math.PI / 2;
    bell.position.z = 0.2;
    const lip = drawn(new THREE.TorusGeometry(R * 1.4, 0.13, 8, 24), flat(pair));
    lip.position.z = 0.5;
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 1.4, 20, 1, true), new THREE.MeshBasicMaterial({ color: C.burrow, side: THREE.BackSide }));
    throat.rotation.x = Math.PI / 2;
    throat.position.z = -0.5;
    const back = new THREE.Mesh(new THREE.CircleGeometry(R, 20), new THREE.MeshBasicMaterial({ color: 0x0b1f19 }));
    back.position.z = -1.15;
    ends.add(bell, lip, throat, back);
    g.add(ends);
  }
  // one badge, over the way in, clear of the tube's arch
  g.add(badge(pair, "down", mouth.x, mouth.y + R * 1.4 + 1.2, mouth.z));
  const ringMat = flat(C.ink);
  for (let k = 1; k < 6; k++) {
    const pt = path.getPoint(k / 6), tan = path.getTangent(k / 6);
    const band = new THREE.Mesh(new THREE.TorusGeometry(R + 0.03, 0.06, 6, 16), ringMat);
    band.position.copy(pt);
    band.lookAt(pt.clone().add(tan));
    g.add(band);
  }
  state.tubes.set(z, path);
  return g;
}

/** The loop's radius, board units: its top is 2R over the lane. */
export const LOOP_R = 3;

/**
 * An open loop's layout, from its zone as the chain has it (step.gno Loop):
 * the axis is the one the destination lies furthest along; the lane (A) runs
 * in along it at the mouth's middle, the track comes down on a lane (B)
 * beside it at vec's side. P(u, w) is the board point at u along the axis
 * and w across it; Xc is where the track leaves the lane (a unit in from the
 * mouth's front); fall is where the chain sets down a ball that flew off.
 */
export function loopFrame(z) {
  const mx = (z.min[0] + z.max[0]) / 2, mz = (z.min[1] + z.max[1]) / 2;
  const ax = Math.abs(z.vec[1] - mz) <= Math.abs(z.vec[0] - mx); // along x (as the chain decides)
  const k = ax ? 0 : 1, o = 1 - k;
  const sign = z.vec[k] < (ax ? mx : mz) ? -1 : 1;
  const P = (u, w) => (ax ? [u, w] : [w, u]);
  const front = sign > 0 ? z.min[k] : z.max[k], back = sign > 0 ? z.max[k] : z.min[k];
  const wA = (z.min[o] + z.max[o]) / 2, W = z.max[o] - z.min[o];
  return { ax, sign, P, front, back, Xc: front + sign, wA, W, wB: z.vec[o], vecU: z.vec[k], r: LOOP_R, fall: P(front - sign * 0.01 - sign * 1.5, wA) };
}

/**
 * The lane itself curling up into a vertical loop and coming down beside
 * itself: a deck with the lane's green on top and timber sides, rails along
 * both edges, and the ground filled in under its two low ends, so the lane
 * bends up rather than a track standing on it. The kerbs it replaces are cut
 * open for it (course.js openings). The replay rides the ball along
 * state.tubes.get(z) (open: no tube round it): round and down onto the second
 * lane, part way up and back, or off the top.
 */
function loopTrack(z, s, t, g) {
  const F = loopFrame(z), { sign, P, Xc, wA, wB, W, r } = F;
  const base = t.height(...P(F.front, wA));
  // the garden's is timber under a strip of lawn; the bobsleigh's is packed
  // snow under glassy ice, with red-and-white banks
  const bob = z.skin === "bob loop";
  const LOOK = bob ? { body: 0xe9f1f8, top: 0xa9dcf0, rail: C.cap, skirt: 0xd3e0ec } : { body: C.wood, top: C.fairway, rail: C.wood, skirt: C.woodDark };
  const L = F.ax ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0); // across
  const U = F.ax ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign); // along
  const ease = (q) => q * q * (3 - 2 * q);
  const N = 120, TH = 0.28;
  // the centreline of the deck's top, and the normal into the loop
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const phi = (i / N) * Math.PI * 2;
    const w = wA + (wB - wA) * ease(i / N);
    const [x, zz] = P(Xc + sign * r * Math.sin(phi), w);
    const c = new THREE.Vector3(x, base + 0.03 + r * (1 - Math.cos(phi)), zz);
    const n = U.clone().multiplyScalar(-Math.sin(phi)).add(new THREE.Vector3(0, Math.cos(phi), 0));
    ring.push({ c, n, h: r * (1 - Math.cos(phi)), phi });
  }
  // the deck: a box section swept round, timber, outlined
  const pos = [], idx = [];
  const corners = ({ c, n }) => [
    c.clone().addScaledVector(L, -W / 2), c.clone().addScaledVector(L, W / 2),
    c.clone().addScaledVector(L, W / 2).addScaledVector(n, -TH), c.clone().addScaledVector(L, -W / 2).addScaledVector(n, -TH),
  ];
  for (const q of ring) for (const v of corners(q)) pos.push(v.x, v.y, v.z);
  const V = (i) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const quad = (a, b, c, d, out) => {
    // wound so its normal points out of the section (the ink hull needs it)
    const n = V(b).sub(V(a)).cross(V(d).sub(V(a)));
    if (n.dot(out) < 0) idx.push(a, d, c, a, c, b);
    else idx.push(a, b, c, a, c, d);
  };
  for (let i = 0; i < N; i++)
    for (let e = 0; e < 4; e++) {
      const a = i * 4 + e, b = i * 4 + ((e + 1) % 4), mid = V(a).add(V(b)).multiplyScalar(0.5);
      const ctr = ring[i].c.clone().addScaledVector(ring[i].n, -TH / 2);
      quad(a, b, b + 4, a + 4, mid.sub(ctr));
    }
  for (const [i, out] of [[0, U.clone().negate()], [N, U.clone()]]) quad(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3, out);
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  body.setIndex(idx);
  body.computeVertexNormals();
  g.add(drawn(body, flat(LOOK.body)));
  // the lane's green on top, a hair over the timber
  const top = [], tIdx = [];
  for (const { c, n } of ring) {
    for (const sgn of [-1, 1]) {
      const v = c.clone().addScaledVector(L, sgn * (W / 2 - 0.02)).addScaledVector(n, 0.015);
      top.push(v.x, v.y, v.z);
    }
  }
  for (let i = 0; i < N; i++) tIdx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
  const deck = new THREE.BufferGeometry();
  deck.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
  deck.setIndex(tIdx);
  deck.computeVertexNormals();
  g.add(new THREE.Mesh(deck, flat(LOOK.top, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })));
  // a rail each side, like the lane's kerbs, riding the deck's edges
  for (const sgn of [-1, 1]) {
    const pts = ring.map(({ c, n }) => c.clone().addScaledVector(L, sgn * (W / 2 + 0.12)).addScaledVector(n, 0.22));
    g.add(drawn(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.17, 8, false), flat(sgn > 0 && bob ? C.cream : LOOK.rail)));
  }
  // under its low ends the deck is filled down into the ground: timber faces
  // under both edges, and one across where the fill stops
  const skirt = flat(LOOK.skirt, { side: THREE.DoubleSide });
  const fill = (from, to) => {
    const sp = [], si = [];
    for (let i = from; i <= to; i++) {
      const [, , cB, dB] = corners(ring[i]);
      for (const v of [dB, cB]) sp.push(v.x, v.y, v.z, v.x, base - 0.7, v.z);
    }
    const n = to - from;
    for (let i = 0; i < n; i++) {
      for (const e of [0, 2]) {
        const a = i * 4 + e, b = a + 1, c = a + 4, d = a + 5;
        si.push(a, b, d, a, d, c);
      }
    }
    // the face across, at the end that stands clear of the ground
    const end = from === 0 ? n : 0;
    si.push(end * 4, end * 4 + 1, end * 4 + 3, end * 4, end * 4 + 3, end * 4 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    geo.setIndex(si);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, skirt));
  };
  const lowEnd = Math.round(N * 0.12); // ~43°: up to about 0.6 of r
  fill(0, lowEnd);
  fill(N - lowEnd, N);
  // the ride: the ball's centre, BALL_R in from the deck, in along the lane
  // from the mouth and out along the second lane to where the chain sets it
  const [fx, fz] = P(F.front, wA);
  const ride = [new THREE.Vector3(fx, base + BALL_R, fz)];
  for (const { c, n } of ring) ride.push(c.clone().addScaledVector(n, BALL_R + 0.03));
  const [ex, ez] = P(F.vecU, wB);
  ride.push(new THREE.Vector3(ex, t.height(ex, ez) + BALL_R, ez));
  const curve = new THREE.CatmullRomCurve3(ride, false, "centripetal");
  // its pace: slower the higher it climbs, as a ball under gravity
  const lens = curve.getLengths(400), total = lens[lens.length - 1];
  const times = [0];
  for (let i = 1; i < lens.length; i++) {
    const p = curve.getPointAt(lens[i] / total), h = Math.max(0, p.y - base - BALL_R);
    times.push(times[i - 1] + (lens[i] - lens[i - 1]) / Math.sqrt(Math.max(0.2, 1 - (0.7 * h) / (2 * r))));
  }
  const T = times[times.length - 1];
  const topAt = (lens[Math.round(400 * (1 + N / 2) / (N + 2))] || total / 2) / total;
  curve.userData = {
    open: true,
    top: topAt, // the arc fraction at the top of the loop
    fall: F.fall, // where a ball that flew off is set down
    centre: new THREE.Vector3(...((q) => [q[0], base + 0.03 + r, q[1]])(P(Xc, wA))), // the ring's middle
    across: L, // the axis across the loop
    base, // the lane's height at the mouth
    pace(k) {
      const want = k * T;
      let lo = 0, hi = times.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] < want) lo = m; else hi = m; }
      const f = times[hi] > times[lo] ? (want - times[lo]) / (times[hi] - times[lo]) : 0;
      return (lens[lo] + (lens[hi] - lens[lo]) * f) / total;
    },
  };
  state.tubes.set(z, curve);
  return g;
}

export { zoneDetail };
