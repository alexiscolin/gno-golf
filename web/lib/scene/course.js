import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { terrain, CELL, CUP_R, airy, there, inPoly, closest, segDist, smoothstep, POOL } from "../terrain.js";
import { C, ink, flat, motion, drawn, drape, rbox, ringLine, texOf, setWind, share, plantFeet, quality } from "./materials.js";
import { bake } from "./bake.js";
import { state } from "./state.js";
import { timeOf, islandBox } from "./camera.js";
import { bush, stone, flower, tuft, mole, windmill, smokeBatch } from "./props.js";
import { seeded, GRASS } from "./common.js";
import { roughOf } from "./garden.js";
import { worldOf, fromWorld, gapWater, DECK } from "./worlds.js";
import { WEATHER_SKINS } from "./weather.js";
import { POSTS, BARS, roofs, ROOF_Y } from "./pieces.js";
import { zoneDetail, waterMask, pondWater } from "./zones.js";

// defer: leave the merge (finishHole) to the caller, to run in a task of its own
export function buildHole(s, { defer = false } = {}) {
  state.live = [];
  state.tubes = new Map();
  state.timed = [];
  state.lifts = [];
  state.smokes = [];
  state.slopes = new Map();
  state.ghosts = null;
  state.mill = null;
  const g = new THREE.Group();
  const t = terrain(s);
  state.water = waterMask(t); // what splashes are clipped to, for this hole

  // the garden is an island, not a world: a raised plot of grass on a block of
  // soil, with sky all around it — a diorama reads cuter than a plain
  // everything round the board is the world's (garden, island, town): one
  // module per world, all with the same four functions (see worlds.js)
  const world = worldOf(s);
  const box = islandBox(s.board);
  g.add(world.base(s, box), world.edging(box, s.hole));
  const bank = world.berms(s);
  g.add(bank.group);
  const dec = world.decor(s, bank.height);
  g.add(dec);

  // the ground of the board: green where a ball can go, rough where it cannot
  g.add(groundMesh(s, t));
  const pond = pondWater(s, t);
  if (pond) g.add(pond);
  g.add(roughScenery(s, t));

  // wear: one counter per cell, painted as a soft trodden patch
  const wear = wearLayer(s.wear, s.board.w, s.board.h, t.height);
  g.add(wear.mesh);

  const ownSea = worldOf(s).SEA !== undefined;
  // several roof zones over one another (a fall sends you back to where that
  // stretch began) are one town below: its houses drawn once, by the widest
  const area = (q) => (q.max[0] - q.min[0]) * (q.max[1] - q.min[1]);
  const town = s.zones.filter((q) => q.skin === "roof").reduce((a, q) => (!a || area(q) > area(a) ? q : a), null);
  for (const z of s.zones) {
    if (z.skin === "roof") { if (z === town) g.add(roofs(z, s)); }
    else if (!(ownSea && z.skin === "sea")) g.add(zoneDetail(z, s, t));
  }
  for (const w of wallPieces(s, t)) g.add(w);
  for (const p of s.posts) g.add(post(p, t.height, s, t));
  g.add(hole(s.cup, t.height));
  g.add(tee(s.start, t.height));

  g.userData.wear = wear;
  g.userData.flag = flagOf(g);
  // the ground the ball rides: the height field, plus any deck that moves on
  // the clock (a seesaw), as it stands now
  const lifts = state.lifts;
  g.userData.height = lifts.length ? (x, z) => t.height(x, z) + lifts.reduce((h, f) => h + f(x, z), 0) : t.height;
  g.userData.lifts = lifts.length > 0; // the engine keeps a ball at rest on it
  g.userData.terrain = t;
  g.userData.wind = setWind; // wind(vec): the weather's push [x, y] per substep, or null for calm
  g.userData.fade = dec.userData.fade || null; // a world's canopy fading out of the way: fade(eye, ball)
  g.userData.weather = dec.userData.weather || null; // its decor dressed for the weather: weather(w) (see weatherLooks)
  g.userData.state = s; // for what a stroke adds (buildExtras)
  // what the course owns that no mesh holds: its masks, freed with it
  g.userData.owned = [t.water && t.water.tex, t.mask].filter(Boolean);
  g.userData.time = timeOf(s.hole);
  g.userData.world = s.world || "garden"; // for the sky
  g.userData.tubes = state.tubes;
  // timed walls (a tram, a clock's hands...): the replay calls at(step) on
  // each with the substep it is showing; they show and move as the chain has them
  g.userData.timed = state.timed;
  g.userData.slopes = state.slopes; // slope zone -> { glow(k) }
  // where a ball that falls in at (x, z) meets the water or the bottom: the
  // world's sea under a pier, a gap's water, a crevasse's floor, the streets
  // under the roofs; a pond on the green is at the green's own height
  g.userData.surfaceAt = (x, z) => {
    const q = t.zoneAt(x, z), SEA = worldOf(s).SEA;
    if (!q) return t.height(x, z);
    if (q.skin === "sea" && SEA !== undefined) return SEA;
    if (q.skin === "gap") return gapWater(s);
    if (q.skin === "roof") return ROOF_Y - 3.2;
    if (GAPS.has(q.skin)) return CREVASSE_Y + 0.3;
    const w = t.pond(x, z); // a garden pond, sunk
    return w ? w.level : t.height(x, z);
  };
  g.userData.ghosts = state.ghosts || (() => {}); // ghosts(aiming): the timed pieces' dashed outlines
  g.userData.mill = state.mill;
  const ticks = (g.userData.ticks = state.live);
  state.live = [];
  g.userData.tick = (time) => { if (motion) for (const f of ticks) f(time); };
  g.userData.smokes = state.smokes;
  state.smokes = [];
  if (!defer) finishHole(g);
  return g;
}

/** The second half of a hole's build: what stands still merged, and every
 *  chimney's smoke in one draw. */
export function finishHole(g) {
  if (!g.userData.state.unbaked) bake(g, { board: quality.low ? g.userData.state.board : null });
  else plantFeet(g); // unbaked: kept in pieces, for the trailer's hole that builds itself (web/lib/promo.js)
  const puffs = smokeBatch(g.userData.smokes);
  g.userData.smokes = null;
  if (puffs) (g.add(puffs.mesh), g.userData.ticks.push(puffs.tick));
}

// Skin is a hint, geometry is the contract: re-theming the whole game is this
// table, and the realm never hears about it.

/**
 * The board's ground as one mesh: a top face per cell, following the height
 * field, and a side face wherever the green stops. The colour is per cell —
 * mown stripes on the green, sand, water, contour bands on a slope — so zones
 * are part of the ground rather than pads stacked on it.
 */
/**
 * The green's edge, as drawn. Cells are half a unit, walls are not on the
 * grid: the last green cells stop short of a curved wall in steps, and the
 * rough showed through in dark notches. So the green is drawn one cell
 * further, under the wall, and any corner that would stick out past the
 * wall's thickness is pulled back onto it: the green meets every wall along
 * the wall's own line. Rough cells drawn as green here are left out of the
 * rough mesh.
 */
function greenEdge(s, t) {
  if (t.edge) return t.edge;
  const segs = s.walls;
  const near = (x, z, r) => segs.some((w) => segDist(x, z, w.a, w.b) < r);
  const isGreen = (i, j) => t.inGrid(i, j) && !!t.green[t.idx(i, j)];
  const cells = new Uint8Array(t.nx * t.nz);
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      if (isGreen(i, j)) continue;
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([a, b]) => isGreen(i + a, j + b));
      if (touches && near((i + 0.5) * CELL, (j + 0.5) * CELL, 1.3)) cells[t.idx(i, j)] = 1;
    }
  // a corner of an added cell no further than 0.4 past its nearest wall
  // past the kerb's inner face (a spline through the wall's corners bulges
  // up to ~0.3 out of each chord) and still under the kerb (0.72 thick)
  // ...but a straight timber is only 0.5 thick: under it, stay within 0.4
  const inKerb = new Set();
  for (const ch of kerbChains(segs)) for (let k = ch.from; k <= ch.to; k++) inKerb.add(segs[k]);
  const corner = (x, z) => {
    // a corner a green cell shares stays put, or the two quads would part
    const ci = Math.round(x / CELL), cj = Math.round(z / CELL);
    if (isGreen(ci, cj) || isGreen(ci - 1, cj) || isGreen(ci, cj - 1) || isGreen(ci - 1, cj - 1)) return [x, z];
    let best = null, bd = Infinity;
    for (const w of segs) { const d = segDist(x, z, w.a, w.b); if (d < bd) (bd = d), (best = w); }
    const LIP = best && inKerb.has(best) ? 0.55 : 0.4;
    if (!best || bd <= LIP) return [x, z];
    const { x: qx, z: qz } = closest(x, z, best.a, best.b), k = LIP / bd;
    return [qx + (x - qx) * k, qz + (z - qz) * k];
  };
  return (t.edge = { cells, corner });
}

/**
 * A wall with the stretches cut out where a gap crosses it or an inlet of the
 * sea opens it. Returns the pieces left.
 */
function openings(w, zones, lines = []) {
  // a gap across the lane (a crevasse, a ditch) cuts through whatever
  // crosses it: the rails fell in too
  const strips = [];
  // (a polygon gap, "everything but the lane", cuts nothing: the lane's own
  // walls run along its edge)
  for (const z of zones || []) if (GAPS.has(z.skin) && !z.poly) strips.push([z.min[0], z.max[0], z.min[1] - 1, z.max[1] + 1]);
  // (and where a tram's rails cross it: a level crossing, a low curb instead)
  strips.push(...lines);
  const inlet = (zones || []).some((z) => z.skin === "sea" && z.poly && !z.outside);
  if (!strips.length && !inlet) return [w];
  const [ax, az] = w.a, dx = w.b[0] - ax, dz = w.b[1] - az, L = segLen(w) || 1;
  // where the wall is inside each strip, in its own parameter u (Liang-Barsky)
  const cuts = [];
  for (const [x0, x1, z0, z1] of strips) {
    let lo = 0, hi = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) ok = false; continue; }
      const r = q / p;
      if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
    }
    if (ok && lo < hi) cuts.push([lo, hi]);
  }
  // an inlet of the sea (a sea polygon cut into the lane) opens the rail
  // across its mouth: the stretches of the wall inside the polygon
  for (const z of zones || []) if (z.skin === "sea" && z.poly && !z.outside) cuts.push(...polyCuts(w, z.poly));
  let pieces = [[0, 1]];
  for (const [c0, c1] of cuts) pieces = pieces.flatMap(([p0, p1]) => [[p0, Math.min(p1, c0)], [Math.max(p0, c1), p1]]).filter(([p0, p1]) => p1 - p0 > 1e-6);
  const at = (u) => [ax + dx * u, az + dz * u];
  return pieces.filter(([p0, p1]) => (p1 - p0) * L > 0.05).map(([p0, p1]) => ({ a: at(p0), b: at(p1), skin: w.skin, cut: p0 > 0 || p1 < 1 }));
}


/** The stretches [u0, u1] of wall w (in its own parameter) inside polygon pts. */
function polyCuts(w, pts) {
  const [ax, az] = w.a, dx = w.b[0] - ax, dz = w.b[1] - az;
  const us = [0, 1];
  for (let i = 0; i < pts.length; i++) {
    const [px, pz] = pts[i], [qx, qz] = pts[(i + 1) % pts.length], ex = qx - px, ez = qz - pz;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const u = ((px - ax) * ez - (pz - az) * ex) / den, v = ((px - ax) * dz - (pz - az) * dx) / den;
    if (u > 0 && u < 1 && v >= 0 && v <= 1) us.push(u);
  }
  us.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < us.length; i++) {
    const m = (us[i] + us[i + 1]) / 2;
    if (inPoly(ax + dx * m, az + dz * m, pts)) out.push([us[i], us[i + 1]]);
  }
  return out;
}

const CREVASSE_Y = -7; // how deep a gap goes
// the zones drawn as a real gap in the lane: nothing under the ball there
const GAPS = new Set(["crevasse", "ditch", "gap", "cliff"]);
const iceSide = new THREE.Color(0x8fcde6), earthSide = new THREE.Color(0x7a5236), plankSide = new THREE.Color(0x9a6f42), joist = new THREE.Color(0x5e412a), rockSide = new THREE.Color(0x8e96a0);

const PLANK = 1; // a boardwalk's board, across the lane

function groundMesh(s, t) {
  const pos = [], col = [], nor = [], edges = [];
  // world.green: [a, b] stripes (mountain packed snow...), or a function of
  // the hole giving them, or "planks" for a boardwalk: boards across the lane
  // with dark seams; nothing for the garden's own
  const wg = worldOf(s).green, G = typeof wg === "function" ? wg(s) : wg, stripes = G || [0x60ab96, 0x5aa38e];
  const c = new THREE.Color();
  const side = new THREE.Color(C.hill);
  // the top is shaded from the slope of the height field itself, so a ramp
  // reads as one smooth surface and not as a patchwork of triangles
  const e = 0.05;
  const gh = t.ground || t.height;
  const up = (x, z) => {
    const dx = (gh(x + e, z) - gh(x - e, z)) / (2 * e);
    const dz = (gh(x, z + e) - gh(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  };
  // a pond's bank: the lane's grass, turning to earth as it goes down, dark
  // and wet at the water
  const earth = new THREE.Color(0x8a6a45), wet = new THREE.Color(0x4f4232), bank = new THREE.Color();
  const banked = (color, p) => {
    const w = t.pond(p[0], p[2]), dd = w ? w.k * -POOL.bed : 0; // how far down the bank
    if (dd < 0.01) return color;
    return bank.copy(color).lerp(earth, smoothstep(dd / 0.22)).lerp(wet, smoothstep((dd - 0.25) / 0.2));
  };
  // (split along the diagonal whose ends are nearer in height: a bank's lip
  // across the cells then runs straight, not in a saw of triangles)
  const quad = (p, color, n) => {
    for (const k of Math.abs(p[0][1] - p[2][1]) > Math.abs(p[1][1] - p[3][1]) + 1e-4 ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[k]);
      const cc = n || !t.pond ? color : banked(color, p[k]);
      col.push(cc.r, cc.g, cc.b);
      nor.push(...(n || up(p[k][0], p[k][2])));
    }
  };
  const colour = (i, j, x, z) => {
    const q = t.zoneAt(x, z);
    // sand, water and the like are drawn as shapes over the green
    // (zoneDetail): the ground under them stays green, so no square corner shows
    // a mound is the lane's own grass, lit brighter as it rises (a soft
    // highlight on top, the plain green at its foot): by the dome, not by the
    // zones' rectangles, so no square patch shows
    const dome = t.domes && t.domes.find((d) => Math.hypot((x - d.x) / d.rx, (z - d.z) / d.rz) < 1);
    if (dome) {
      c.set(Array.isArray(stripes) ? (Math.floor(i / 4) % 2 ? stripes[0] : stripes[1]) : 0x60ab96);
      c.offsetHSL(0, 0.03, Math.min(0.1, (t.height(x, z) / dome.h) * 0.1));
      return c;
    }
    if (q && q.kind === "slope" && !airy(q)) {
      // contour bands every 0.4 of height: the eye reads a climb from them
      // one tone: the ramp reads from its shading, not from stripes. A dune is
      // sand, stairs are stone steps (banded every half unit up)
      if (q.skin === "dune") c.set(0xe9cf97);
      else if (q.skin === "stairs") c.set(Math.floor(t.height(x, z) / 0.35) % 2 ? 0xb9c2bd : 0xa5aea9);
      // a skate park's ramps are smooth concrete, a touch lighter as they rise
      else if (q.skin === "quarter pipe" || q.skin === "funbox") c.set(0xb3aea4).offsetHSL(0, 0, Math.min(0.12, t.height(x, z) * 0.09));
      else {
        // a world with its own lane colour (mountain snow) keeps it on a slope's edges too
        c.set(Array.isArray(G) ? G[0] : 0x62ae98);
      }
      return c;
    }
    // mown stripes, or a boardwalk's planks
    if (stripes === "planks") {
      // boards a unit wide across the lane, in three warm tones; the seams
      // between them are thin lines (see planks below), not whole cells
      const board = Math.floor(((s.board.w >= s.board.h ? i : j) * CELL) / PLANK);
      c.set([0xd4a86c, 0xc99a63, 0xbf8f58][(board * 7) % 3]);
      return c;
    }
    c.set(Math.floor(i / 4) % 2 ? stripes[0] : stripes[1]);
    return c;
  };

  const edge = greenEdge(s, t);
  // where the world has its own sea (island: SEA), the sea zone of the board
  // is left open: the world's water shows through, and the lane's edge gets a
  // side face down to it
  const open_ = new Uint8Array(t.nx * t.nz);
  // (an inlet of the sea, a polygon cut into the lane, is one too)
  const seaZone = s.zones.find((q) => ((worldOf(s).SEA !== undefined && q.skin === "sea") || q.skin === "roof" || GAPS.has(q.skin)) && q.poly && (q.outside || q.skin === "sea"));
  // a corner of a lane cell out in the sea is pulled onto the lane's outline,
  // so the lane's edge is the chain's polygon and not cell steps
  // (every corner on the lane's edge — touching an open cell — goes onto
  // the outline, the inner corners of a stair step as much as the outer ones)
  const onLane = (x, z) => {
    const ci = Math.round(x / CELL), cj = Math.round(z / CELL);
    const rim = [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]].some(([a, b]) => t.inGrid(a, b) && open_[t.idx(a, b)] === 1);
    if (!seaZone || !rim) return [x, z];
    let best = [x, z], bd = Infinity;
    const P = seaZone.poly;
    for (let k = 0; k < P.length; k++) {
      const q = closest(x, z, P[k], P[(k + 1) % P.length]);
      if (q.d < bd) (bd = q.d), (best = [q.x, q.z]);
    }
    return best;
  };
  // likewise over the rooftops of a `roof` zone: the lane is a walkway over them
  const ownSea = worldOf(s).SEA !== undefined, hasRoof = s.zones.some((q) => q.skin === "roof");
  // a crevasse is a real gap in the lane: open, with ice walls deep down
  const crev = (a, b) => { const q = t.zoneAt((a + 0.5) * CELL, (b + 0.5) * CELL); return !!q && GAPS.has(q.skin); };
  const hasCrev = s.zones.some((q) => GAPS.has(q.skin));
  if (ownSea || hasRoof || hasCrev || s.zones.some((q) => q.skin === "blowhole"))
    for (let j = 0; j < t.nz; j++)
      for (let i = 0; i < t.nx; i++) {
        const q = t.zoneAt((i + 0.5) * CELL, (j + 0.5) * CELL);
        if (q && ((ownSea && q.skin === "sea") || q.skin === "roof" || GAPS.has(q.skin))) open_[t.idx(i, j)] = 1;
        // a blowhole's mouth is a real hole (its rim, drawn by island.js,
        // covers the cells' stepped edge)
        if (q && q.skin === "blowhole") {
          const ex = ((i + 0.5) * CELL - (q.min[0] + q.max[0]) / 2) / ((q.max[0] - q.min[0]) / 2), ez = ((j + 0.5) * CELL - (q.min[1] + q.max[1]) / 2) / ((q.max[1] - q.min[1]) / 2);
          if (ex * ex + ez * ez < 0.72 * 0.72) open_[t.idx(i, j)] = 2; // 2: no edge is pulled onto it
        }
        // a plank laid between two roofs: the street shows under it (the
        // world draws the plank); 2, so the roofs' edges are not pulled onto it
        else if (hasRoof && q && q.skin === "plank bridge") open_[t.idx(i, j)] = 2;
      }
  // side faces reach the water, or down past the rooftops' eaves
  const foot = hasRoof ? ROOF_Y - 1.5 : ownSea ? worldOf(s).SEA - 0.3 : -1;
  if (ownSea && seaZone && seaZone.outside) side.set(C.woodDark); // a lane over the sea is a jetty: timber sides
  // in a world with its own ground the green's sides take that ground's
  // colour: a dark face peeping between kerb posts read as a hole
  else if (!hasRoof && (worldOf(s).rough || roughOf(s))) side.set((worldOf(s).rough || roughOf(s)).lo);
  else if (hasRoof) side.set(0xb8573f); // over the roofs: a brick parapet
  const planks = G === "planks";
  const piles = [], piled = new Set();
  const drawn_ = (a, b) => t.inGrid(a, b) && !open_[t.idx(a, b)] && (!!t.green[t.idx(a, b)] || !!edge.cells[t.idx(a, b)]);
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      const added = !!edge.cells[t.idx(i, j)];
      if ((!t.green[t.idx(i, j)] && !added) || open_[t.idx(i, j)]) continue;
      const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL;
      const hc = (x, z) => {
        if (added) [x, z] = edge.corner(x, z);
        if (seaZone) [x, z] = onLane(x, z);
        return [x, (t.ground || t.height)(x, z), z];
      };
      const top = [hc(x0, z0), hc(x0, z1), hc(x1, z1), hc(x1, z0)];
      const col = colour(i, j, x0 + CELL / 2, z0 + CELL / 2);
      quad(top, col);

      // sides where the green ends
      const open = (a, b) => !drawn_(a, b);
      const wallsAt = [
        [open(i, j - 1), top[3], top[0]],
        [open(i, j + 1), top[1], top[2]],
        [open(i - 1, j), top[0], top[1]],
        [open(i + 1, j), top[2], top[3]],
      ];
      const nb = [[i, j - 1], [i, j + 1], [i - 1, j], [i + 1, j]];
      for (const [n, [o, p, q]] of wallsAt.entries()) {
        if (!o) continue;
        const sx = q[2] - p[2], sz = p[0] - q[0], sl = Math.hypot(sx, sz) || 1;
        const gz = hasCrev && crev(...nb[n]) ? t.zoneAt((nb[n][0] + 0.5) * CELL, (nb[n][1] + 0.5) * CELL) : null;
        // a boardwalk (over the sea, or round its missing planks) is a deck on
        // stilts, not a block: the planks' cut face, a joist set back under
        // it, piles down into the water; the water shows under the deck
        if (planks && (gz ? gz.skin === "gap" : ownSea)) {
          const n_ = [-sx / sl, 0, -sz / sl], bx = sx / sl * 0.18, bz = sz / sl * 0.18, lo = p[1] - DECK, lq = q[1] - DECK;
          quad([p, [p[0], lo, p[2]], [q[0], lq, q[2]], q], plankSide, n_);
          quad([[p[0] + bx, lo, p[2] + bz], [p[0] + bx, lo - 0.28, p[2] + bz], [q[0] + bx, lq - 0.28, q[2] + bz], [q[0] + bx, lq, q[2] + bz]], joist, n_);
          edges.push(p[0], lo, p[2], q[0], lq, q[2]);
          const key = Math.round(p[0] / CELL) + "," + Math.round(p[2] / CELL);
          if ((Math.round(p[0] / CELL) + Math.round(p[2] / CELL)) % 5 === 0 && !piled.has(key)) {
            piled.add(key);
            const h = lo - (gapWater(s) - 0.7);
            piles.push(new THREE.CylinderGeometry(0.13, 0.16, h, 6).translate(p[0] + bx, lo - h / 2, p[2] + bz));
          }
        } else {
          // a gap's walls: ice down a crevasse, earth down a ditch
          const gy = gz ? CREVASSE_Y : foot;
          const gc = gz ? (gz.skin === "ditch" ? earthSide : gz.skin === "cliff" ? rockSide : iceSide) : side;
          quad([p, [p[0], gy, p[2]], [q[0], gy, q[2]], q], gc, [-sx / sl, 0, -sz / sl]);
        }
        // an ink line only where the edge is bare (over the sea, the roofs, a
        // crevasse): under a kerb it flickered through it in black streaks
        const [ni, nj] = nb[n];
        if (t.inGrid(ni, nj) && open_[t.idx(ni, nj)]) edges.push(...p, ...q);
      }
    }

  // a boardwalk's seams: a thin dark line along every board's edge, over the
  // drawn deck, and a nail at each end of each board where it meets a seam
  const seams = [];
  if (planks) {
    const alongX = s.board.w >= s.board.h, per = Math.round(PLANK / CELL);
    for (let j = 0; j < t.nz; j++)
      for (let i = 0; i < t.nx; i++) {
        const a = alongX ? i : j;
        if (a % per || !drawn_(i, j)) continue;
        // (its ends on the lane's outline, as the cells' corners are: not out over the sea)
        const lane = (x, z) => (seaZone ? onLane(x, z) : [x, z]);
        const [x0, z0] = lane(i * CELL, j * CELL), [x1, z1] = lane(alongX ? i * CELL : i * CELL + CELL, alongX ? j * CELL + CELL : j * CELL);
        seams.push(x0, t.height(x0, z0) + 0.012, z0, x1, t.height(x1, z1) + 0.012, z1);
      }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  const m = new THREE.Group();
  // pushed back in depth: walls, lines and pads sit exactly on this ground, and
  // two surfaces on one plane flicker as the camera moves
  // Lambert, not toon: on a slope the three toon bands turn into jagged steps
  // that follow the triangles; smooth light is what makes a hill read as one
  m.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 })));
  const eg = new THREE.BufferGeometry();
  eg.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
  // a world may hide the green's edge ink (mountain snow: world.edgeInk = false)
  if (worldOf(s).edgeInk !== false) m.add(new THREE.LineSegments(eg, ink));
  if (piles.length) m.add(drawn(mergeGeometries(piles), flat(0x6b4a2e)));
  if (seams.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(seams, 3));
    m.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x5a3a24, transparent: true, opacity: 0.8 })));
  }
  return m;
}

/**
 * Whatever the walls fence off is garden, not green: a raised bed with its own
 * plants, and a rocky hill in the middle when it is big enough to hold one —
 * so a hole built as an L or a ring reads as that shape.
 */
function roughScenery(s, t) {
  // the rough's floor is a hair above the world's ground it lies on (both
  // were at GRASS): two coplanar sheets z-fight, and that showed as thin
  // dark lines flickering across the sand and the grass
  const ROUGH0 = GRASS + 0.03;
  // a world may paint its rough its own way ({ lo, hi } colours): then it is
  // bare ground with a few stones, not a garden bed
  const R = worldOf(s).rough || roughOf(s);
  const g = new THREE.Group();
  const rand = seeded("rough" + s.hole);
  // cells over the rooftops (a roof zone), or the world's own sea, are open
  // air: no rough there, nothing planted
  const ownSea = worldOf(s).SEA !== undefined;
  const air = (a, b) => { const q = t.zoneAt((a + 0.5) * CELL, (b + 0.5) * CELL); return !!q && (q.skin === "roof" || GAPS.has(q.skin) || (ownSea && q.skin === "sea")); };
  const isRough = (a, b) => t.inGrid(a, b) && !t.green[t.idx(a, b)] && !air(a, b);

  // Distance of every rough cell to the green, in cells: the ground rises
  // with it, so rough is a rounded mound that swells out of the green's edge
  // instead of a block standing on it.
  const dist = new Float32Array(t.nx * t.nz).fill(-1);
  const q = [];
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++)
      if (isRough(i, j) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !isRough(i + a, j + b) && t.inGrid(i + a, j + b)))
        (dist[t.idx(i, j)] = 1), q.push([i, j]);
  for (let k = 0; k < q.length; k++) {
    const [i, j] = q[k];
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + a, z = j + b;
      if (!isRough(x, z) || dist[t.idx(x, z)] >= 0) continue;
      dist[t.idx(x, z)] = dist[t.idx(i, j)] + 1;
      q.push([x, z]);
    }
  }
  const size = new Float32Array(t.nx * t.nz);
  for (const cells of t.rough) for (const [i, j] of cells) size[t.idx(i, j)] = cells.length;
  // a small pocket against the board's edge (the corner behind a rounded
  // rim, a sliver outside a bend) is just the garden: flat at its level. A
  // slope from the wall down to the edge in a cell or two reads as a dark,
  // stepped wedge; flat, the rim wall's skirt hides the step to the green.
  const flatPocket = new Uint8Array(t.nx * t.nz);
  for (const cells of t.rough)
    if (cells.length < 60 && cells.some(([i, j]) => i === 0 || j === 0 || i === t.nx - 1 || j === t.nz - 1))
      for (const [i, j] of cells) flatPocket[t.idx(i, j)] = 1;
  const phase = rand() * 6;
  const cellH = (i, j) => {
    if (!isRough(i, j)) return 0;
    if (flatPocket[t.idx(i, j)]) return ROUGH0;
    const d = Math.max(0, dist[t.idx(i, j)]) * CELL, n = size[t.idx(i, j)];
    // a world that says how high its rough may rise (rough.mound: 0 = flat)
    // keeps it at its own ground level, ROUGH0, with at most soft low dunes
    // that come down both at the board's edge and at the lane: no rim, no
    // raised block with the board's straight sides
    if (R) {
      if (!R.mound) return ROUGH0; // flat unless the world asks for dunes
      const e = Math.min(i, j, t.nx - 1 - i, t.nz - 1 - j) * CELL;
      const k = Math.min(1, e / 2.5, Math.max(0, d - 1) / 2.5);
      return ROUGH0 + R.mound * smoothstep(k) * (0.7 + 0.3 * Math.sin(i * 0.5 + phase) * Math.cos(j * 0.45));
    }
    const top = n < 60 ? 0.25 : Math.min(1.8, 0.5 + n / 220); // a sliver stays low, a big patch is a hill
    const wobble = 0.85 + 0.15 * Math.sin(i * 0.7 + phase) * Math.cos(j * 0.6 + phase);
    // and toward the board's own edge it comes down to the garden's grass,
    // so the mound meets the banks outside instead of ending in a cliff
    const e = Math.min(i, j, t.nx - 1 - i, t.nz - 1 - j) * CELL;
    const k = Math.min(1, e / 1.5);
    const edgeK = smoothstep(k);
    // flat for the first unit off the green: a wall stands on that strip, and
    // a mound rising under it would cut through the timber
    const mound = top * wobble * (1 - Math.exp(-Math.max(0, d - 1.1) / 1.3));
    return ROUGH0 + (mound - ROUGH0) * edgeK;
  };
  // a height per grid corner: the mean of its rough cells, 0 where it
  // touches the green — so the mound meets the green's edge exactly
  const NX = t.nx + 1, cornerH = new Float32Array(NX * (t.nz + 1));
  for (let j = 0; j <= t.nz; j++)
    for (let i = 0; i <= t.nx; i++) {
      let sum = 0, touch = false, n = 0, pocket = false;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (a < 0 || b < 0 || a >= t.nx || b >= t.nz) continue;
        if (isRough(a, b)) (sum += cellH(a, b)), n++, (pocket ||= !!flatPocket[t.idx(a, b)]);
        else touch = true;
      }
      if (pocket) { cornerH[j * NX + i] = ROUGH0; continue; }
      const onEdge = i === 0 || j === 0 || i === t.nx || j === t.nz;
      // in a world with its own rough level, even where it meets the lane it
      // stays at that level: the lane's side face and kerb stand over it
      const level = !!R;
      cornerH[j * NX + i] = onEdge && !touch ? ROUGH0 : touch || !n ? (level ? ROUGH0 : 0.01) : sum / n;
    }
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(), lo = new THREE.Color(R ? R.lo : C.surround), hi = new THREE.Color(R ? R.hi : 0x5b9a7d);
  for (let j = 0; j <= t.nz; j++)
    for (let i = 0; i <= t.nx; i++) {
      const h = cornerH[j * NX + i];
      pos.push(i * CELL, h, j * CELL);
      c.copy(lo).lerp(hi, Math.min(1, Math.max(0, h) / 1.8)); // down at the garden (h < 0) it is garden green, not darker
      col.push(c.r, c.g, c.b);
    }
  const edge = greenEdge(s, t);
  for (let j = 0; j < t.nz; j++)
    for (let i = 0; i < t.nx; i++) {
      if (!isRough(i, j) || edge.cells[t.idx(i, j)]) continue; // drawn as green, under a wall
      const a = j * NX + i, b = a + 1, d = a + NX, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  // a world with its own flat ground (island sand, town cobbles, mountain
  // snow) shows through where the ball can't go: no rough sheet of ours over
  // it, so no board-sized rectangle, no stepped edge and nothing to z-fight
  const bare = R && !R.mound;
  if (idx.length && !bare) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: 4 })));
  }

  // where the mill stands nothing grows: it would come up through it
  // (nor round a serac's tower uphill of its spot, nor the cairns at a col's saddle)
  const built = [...s.zones.filter((z) => z.skin === "mill"),
    ...s.zones.filter((z) => z.skin === "serac").map((z) => ({ min: [z.min[0] - 2.5, z.min[1] - 9], max: [z.max[0] + 2.5, z.max[1] + 9] })),
    ...s.zones.filter((z) => z.skin === "saddle crest" && z.vec[0] < 0).map((z) => ({ min: [z.max[0] - 1.5, z.min[1]], max: [z.max[0] + 1.5, z.max[1]] })),
    // (nor on a tram's rails, into its tunnels)
    ...tramCuts(tramLines(s, t)).map(([x0, x1, z0, z1]) => ({ min: [x0 - 3, z0 - 3], max: [x1 + 3, z1 + 3] }))];
  const taken = [];
  const FOOT = [0.75, 0.45, 0.2, 0.2]; // bush, stone, tuft, flower
  for (const cells of t.rough) {
    // plant it: a few things per ten cells, on the slope
    const n = Math.floor(cells.length / 10);
    for (let k = 0; k < n; k++) {
      const [i, j] = cells[Math.floor(rand() * cells.length)];
      const r = rand();
      if (dist[t.idx(i, j)] * CELL < 1.6) continue; // clear of the walls on the edge
      if (R && !R.plant && r > 0.3) continue; // bare: a third as many things, all stones
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, kind = R ? 1 : r < 0.35 ? 0 : r < 0.55 ? 1 : r < 0.75 ? 2 : 3;
      if (built.some((q) => x > q.min[0] - 0.5 && x < q.max[0] + 0.5 && z > q.min[1] - 0.5 && z < q.max[1] + 0.5)) continue;
      if (taken.some((q) => Math.hypot(q.x - x, q.z - z) < q.r + FOOT[kind])) continue; // nothing inside anything else
      taken.push({ x, z, r: FOOT[kind] });
      // a world's own planting may say "nothing here" (null): a lagoon, a street
      const m = R && R.plant ? R.plant(rand, s, x, z) : [bush, stone, tuft, flower][kind](rand);
      if (!m) continue;
      // on the mesh as drawn: the mean of the cell's four corners
      const y = (cornerH[j * NX + i] + cornerH[j * NX + i + 1] + cornerH[(j + 1) * NX + i] + cornerH[(j + 1) * NX + i + 1]) / 4;
      m.position.set(x, y, z);
      m.scale.multiplyScalar(0.8);
      m.rotation.y = rand() * Math.PI * 2;
      g.add(m);
    }
  }
  return g;
}



const near = (p, q) => Math.abs(p[0] - q[0]) < 1e-3 && Math.abs(p[1] - q[1]) < 1e-3;
const segLen = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

/**
 * Long runs of short outline walls with no skin (a flowing lane built from
 * physics.Lane) are one border, not forty timbers with a post at every joint:
 * found here as chains of consecutive segments, each chain drawn as a kerb.
 */
function kerbChains(W) {
  const chains = [];
  for (let i = 0; i < W.length; ) {
    let j = i;
    while (j + 1 < W.length && !W[j].skin && !W[j + 1].skin && near(W[j].b, W[j + 1].a)) j++;
    const n = j - i + 1;
    const len = W.slice(i, j + 1).reduce((a, w) => a + segLen(w), 0);
    if (n >= 12 && len / n < 4.5 && !W[i].skin) chains.push({ from: i, to: j, closed: near(W[j].b, W[i].a) });
    i = j + 1;
  }
  return chains;
}


/** End grain: rings on a sawn face, for logs and stumps. */
let ringsTex = null;
function endGrain() {
  if (ringsTex) return ringsTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = "#e3b57a"; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = "#b07a45"; x.lineWidth = 2;
  for (let r = 6; r < 32; r += 6) { x.beginPath(); x.arc(32, 32, r, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = "#8a5a32"; x.beginPath(); x.arc(32, 32, 3, 0, Math.PI * 2); x.fill();
  return (ringsTex = share(texOf(c)));
}
let sawnMat = null;
const sawn = () => (sawnMat ||= share(flat(0xffffff, { map: endGrain() })));

/**
 * A sawn log or stump, one material per part so it bakes: the bark round
 * (open ended) in bark, and each cut end a disc of end grain. Along y, r0 at
 * the bottom, r1 at the top.
 */
function sawnCylinder(r1, r0, h, seg = 14) {
  const g = new THREE.Group();
  g.add(drawn(new THREE.CylinderGeometry(r1, r0, h, seg, 1, true), flat(C.bark)));
  for (const [y, r, flip] of [[h / 2, r1, false], [-h / 2, r0, true]]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(r, seg), sawn());
    cap.rotation.x = flip ? Math.PI / 2 : -Math.PI / 2;
    cap.position.y = y;
    g.add(cap);
  }
  return g;
}

/** Stacked logs on a bar's exact footprint: two below, one on top. */
function logs([x, z], len, thick, ang, height) {
  const g = new THREE.Group();
  const r = thick / 4;
  const y0 = height(x, z);
  for (const [off, y] of [[-r, r], [r, r], [0, r + r * 1.73]]) {
    const log = sawnCylinder(r, r, len);
    log.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(log);
    holder.position.set(x - Math.sin(ang) * off, y0 + y, z + Math.cos(ang) * off);
    holder.rotation.y = -ang;
    g.add(holder);
  }
  return g;
}

/** Hay bales along a bar's exact footprint, tied with twine. */
function hay([x, z], len, thick, ang, height) {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(len / 1.1)), bl = len / n;
  for (let k = 0; k < n; k++) {
    const u = -len / 2 + bl * (k + 0.5);
    const bx = x + Math.cos(ang) * u, bz = z + Math.sin(ang) * u, y = height(bx, bz);
    const bale = drawn(rbox(bl - 0.04, 0.75, thick, 0.12), flat(0xe3c36a));
    bale.position.set(bx, y + 0.375, bz);
    bale.rotation.y = -ang;
    for (const d of [-bl * 0.25, bl * 0.25]) {
      const twine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.77, thick + 0.02), flat(C.bark));
      twine.position.set(d, 0, 0);
      bale.add(twine);
    }
    g.add(bale);
  }
  return g;
}

/**
 * The kerb of a flowing lane: one continuous low border along the chain, its
 * inner face on the wall line (where the ball bounces), its outer foot down
 * to the garden. Smooth, with no joints.
 */
function kerb(W, ch, t, reachable, { TH = 0.72, TOP = 0.6, smooth = true, foot = GRASS - 0.4, color = C.wood } = {}) {
  const pts = [];
  for (let k = ch.from; k <= ch.to; k++) pts.push(W[k].a);
  if (!ch.closed) pts.push(W[ch.to].b);
  // which side the green is on: tried at the middle of the longest segment
  let best = ch.from;
  for (let k = ch.from; k <= ch.to; k++) if (segLen(W[k]) > segLen(W[best])) best = k;
  const w = W[best], wl = segLen(w) || 1, nx = -(w.b[1] - w.a[1]) / wl, nz = (w.b[0] - w.a[0]) / wl;
  const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
  const side = reachable(mx + nx * 0.6, mz + nz * 0.6) ? -1 : 1; // outward = away from the green
  const v3 = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = smooth ? new THREE.CatmullRomCurve3(v3, ch.closed, "centripetal") : new THREE.CurvePath();
  if (!smooth) for (let k = 0; k + 1 < v3.length; k++) curve.add(new THREE.LineCurve3(v3[k], v3[k + 1]));
  const N = smooth ? Math.max(40, Math.round(curve.getLength() * 3)) : Math.max(2, Math.round(curve.getLength() * 2));
  // a rounded profile, from the green's side over the top to the garden's
  // thick enough to cover the green cells that reach past the wall line (up
  // to 0.61 out): their side faces showed through the kerb as dark slots
  const prof = [[0, -0.3], [0, TOP - 0.12], [0.06, TOP - 0.03], [0.18, TOP], [TH - 0.18, TOP], [TH - 0.06, TOP - 0.03], [TH, TOP - 0.12], [TH, null]];
  const pos = [], idx = [], M = prof.length;
  const rings = ch.closed ? N : N + 1;
  for (let k = 0; k < rings; k++) {
    const p = curve.getPointAt(k / N), tg = curve.getTangentAt(k / N);
    const ox = -tg.z * side, oz = tg.x * side; // outward, in the ground plane
    const h = t.height(p.x, p.z);
    for (const [o, y] of prof) {
      const x = p.x + ox * o, z = p.z + oz * o;
      pos.push(x, y === null ? foot : h + y, z);
    }
  }
  for (let k = 0; k < N; k++) {
    const a = k * M, b = ((k + 1) % rings) * M;
    for (let m = 0; m < M - 1; m++) idx.push(a + m, b + m, a + m + 1, a + m + 1, b + m, b + m + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return drawn(geo, flat(color, { side: THREE.DoubleSide }));
}

/**
 * Timed bars (a tram, the hands of a clock; a mill's sails are the mill's):
 * each a live piece of its own, there only on the substeps the chain has it.
 * Each registers { at(step), walls } in state.timed for the engine's clock.
 */
// ------------------------------------------------------------ trams
//
// A tram is a timed bar across the lane: the chain has it standing through
// its window. It is drawn as a tram driving along its rails, the bar's own
// axis: out of a tunnel mouth off one side of the lane, slowing as it comes,
// creeping over the crossing through its window (its body covering the bar's
// footprint on the lane all the while), then picking up and away into the
// tunnel on the far side, where it fades into the dark, to come round again
// from the start. Every tram on a line drives the same way; two trams on one
// line (town18) go one after the other and never meet. All of it follows the
// timed clock's fractional tick (state.timed).

const TRAM_CREEP = 0.15; // how far it creeps either side of its stop through its window
const TRAM_EASE = 2.5; // ticks to come in (and go away), at most, for a tram alone on its line
const TRAM_FADE = 1.0; // ticks to fade in out of a tunnel (and into one), at most

/**
 * The tram lines of a hole: [{ u, perp, e0, e1, trams: [...] }]. u is the
 * line's axis (the way its trams drive), e0..e1 the lane's extent along it
 * (from where it first meets the lane to where it leaves it), and each tram
 * { c, sF, lo, hi, Lt, th, w, on, every, Aa, Ad, S0, S1 }: its bar's centre,
 * where its body stops (sF, along u), the lane's crossing either side of the
 * bar's centre (lo, hi), its body's length, its window's opening (w), and its
 * come-in / go-away times and far ends.
 */
export function tramLines(s, t) {
  const walls = (s.walls || []).filter((w) => w.skin === "tram" && w.every);
  const bars = [];
  for (let i = 0; i + 3 < walls.length; i += 4) {
    const q = walls.slice(i, i + 4), l0 = segLen(q[0]), l1 = segLen(q[1]), long = l0 >= l1 ? q[0] : q[1];
    let ux = (long.b[0] - long.a[0]) / segLen(long), uz = (long.b[1] - long.a[1]) / segLen(long);
    if (Math.abs(ux) >= Math.abs(uz) ? ux < 0 : uz < 0) (ux = -ux), (uz = -uz); // every line drives toward +x or +z
    const c = [q.reduce((a, w) => a + w.a[0] / 4, 0), q.reduce((a, w) => a + w.a[1] / 4, 0)];
    const L = Math.max(l0, l1);
    // the lane's crossing of this bar: where its axis is on the green
    const on = (d) => t.onGreen(c[0] + ux * d, c[1] + uz * d);
    let lo = 0, hi = 0;
    while (lo > -L / 2 && on(lo - 0.25)) lo -= 0.25;
    while (hi < L / 2 && on(hi + 0.25)) hi += 0.25;
    bars.push({ q, u: [ux, uz], c, th: Math.min(l0, l1), lo, hi, every: q[0].every, on: q[0].on, w: (((-q[0].phase) % q[0].every) + q[0].every) % q[0].every });
  }
  const lines = [];
  for (const b of bars) {
    const perp = -b.u[1] * b.c[0] + b.u[0] * b.c[1];
    const line = lines.find((l) => Math.abs(l.u[0] * b.u[0] + l.u[1] * b.u[1]) > 0.99 && Math.abs(l.perp - perp) < 0.5);
    if (line) line.trams.push(b);
    else lines.push({ u: b.u, perp, trams: [b] });
  }
  for (const l of lines) {
    const [ux, uz] = l.u, S = (p) => p[0] * ux + p[1] * uz;
    l.trams.sort((a, b) => S(a.c) - S(b.c));
    // the lane along the whole line, first tram's side to last's
    const f = l.trams[0], g = l.trams[l.trams.length - 1];
    const onAt = (b, d) => t.onGreen(b.c[0] + ux * d, b.c[1] + uz * d);
    let a = f.lo, z = g.hi;
    while (onAt(f, a - 0.25) && a > -200) a -= 0.25;
    while (onAt(g, z + 0.25) && z < 200) z += 0.25;
    l.e0 = S(f.c) + a;
    l.e1 = S(g.c) + z;
    for (const b of l.trams) {
      b.sF = S(b.c) + (b.lo + b.hi) / 2;
      b.Lt = b.hi - b.lo + 2 * TRAM_CREEP + 0.3;
      // time to come in: since the last window on this line closed; to go
      // away: until the next one opens (a tram behind it must not catch it up)
      const gap = (from, to) => ((((to - from) % b.every) + b.every) % b.every) || b.every;
      const before = Math.min(...l.trams.map((o) => gap(o.w + o.on, b.w))), after = Math.min(...l.trams.map((o) => gap(b.w + b.on, o.w)));
      // (one tram on a line comes and goes in the same gap: half each; two on
      // one line go and come in it together, one behind the other: all of it)
      const tandem = l.trams.length > 1;
      b.Aa = tandem ? before : Math.min(TRAM_EASE, before / 2);
      b.Ad = tandem ? after : Math.min(TRAM_EASE, after / 2);
      b.S0 = l.e0 - b.Lt / 2 - 0.4; // its middle, back in the start tunnel
      b.S1 = l.e1 + b.Lt / 2 + 0.4; // and in the far one
      // a tunnel only at an end that runs away from the camera (-z); at an
      // end toward it, the line runs off the town's edge and the tram fades
      // as it goes (a tunnel there would stand between the view and the lane)
      l.tunnel = [tramTunnelAt(l.u, -1), tramTunnelAt(l.u, 1)];
      b.fadeIn = l.tunnel[0] ? Math.min(TRAM_FADE, b.Aa * 0.5) : b.Aa;
      b.fadeOut = l.tunnel[1] ? Math.min(TRAM_FADE, b.Ad * 0.5) : b.Ad;
    }
  }
  return lines;
}

/**
 * The come-in and go-away curve, 0 to 1 over [0, 1]: an S, leaving and
 * arriving at slope m (the creep's, so the speed never jumps). One curve for
 * both: two trams on one line, one going as the other comes over the same
 * ticks and the same distance, keep their distance exactly.
 */
function tramEase(m, k) {
  const k2 = k * k, k3 = k2 * k;
  return (k3 - 2 * k2 + k) * m + (-2 * k3 + 3 * k2) + (k3 - k2) * m;
}

/**
 * Tram b at tick t: { s, fade, moving } — its middle along the line, how
 * much of it is there (0 in a tunnel, 1 out on the lane) and its speed's
 * change (for its sway). Hidden between its going away and its next coming.
 */
export function tramAt(b, t) {
  const E = b.every, tau = (((t - b.w) % E) + E) % E, creep = (2 * TRAM_CREEP) / b.on;
  const inAt = E - b.Aa;
  if (tau <= b.on) return { s: b.sF - TRAM_CREEP + creep * tau, fade: 1, sway: 0 };
  if (tau <= b.on + b.Ad) {
    // away: from its creep, picking up, into the far tunnel
    const k = (tau - b.on) / b.Ad, from = b.sF + TRAM_CREEP, dist = b.S1 - from;
    return { s: from + dist * tramEase((creep * b.Ad) / dist, k), fade: smoothstep((b.on + b.Ad - tau) / b.fadeOut), sway: Math.sin(2 * Math.PI * k) };
  }
  if (tau >= inAt) {
    // coming: out of the start tunnel, slowing to its stop
    const k = (tau - inAt) / b.Aa, dist = b.sF - TRAM_CREEP - b.S0;
    return { s: b.S0 + dist * tramEase((creep * b.Aa) / dist, k), fade: smoothstep((tau - inAt) / b.fadeIn), sway: Math.sin(2 * Math.PI * k) };
  }
  return { s: b.S0, fade: 0, sway: 0 };
}

/** Whether a line's end (dir -1: where its trams come from, 1: where they go) runs away from the camera, into a tunnel. */
const tramTunnelAt = (u, dir) => u[1] * dir < -0.3;

/** The strips the tram lines run on, [x0, x1, z0, z1]: the kerbs are cut there (a level crossing). */
function tramCuts(lines) {
  const out = [];
  for (const l of lines) {
    const [ux, uz] = l.u, th = Math.max(...l.trams.map((b) => b.th)), P = (sv, off) => [ux * sv - uz * off + -uz * 0, uz * sv + ux * off];
    // the line's points: s along u, off across it (perp is its offset)
    const pt = (sv, off) => { const q = P(sv, off); return [q[0] - uz * l.perp, q[1] + ux * l.perp]; };
    const ps = [pt(l.e0 - 1, -th / 2 - 0.05), pt(l.e0 - 1, th / 2 + 0.05), pt(l.e1 + 1, -th / 2 - 0.05), pt(l.e1 + 1, th / 2 + 0.05)];
    out.push([Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[1]))]);
  }
  return out;
}

/** Where a line's tunnels stand: [{ at, dir, depth }] (at: the mouth, along u; dir: which way the tunnel runs). */
function tramPortals(l, s) {
  const [ux, uz] = l.u, th = Math.max(...l.trams.map((b) => b.th));
  const toEdge = (sv, dir) => {
    // how far from the mouth, along the line, to the board's edge
    const x = ux * sv - uz * l.perp, z = uz * sv + ux * l.perp, dx = ux * dir, dz = uz * dir;
    const tx = dx > 1e-6 ? (s.board.w - x) / dx : dx < -1e-6 ? -x / dx : Infinity, tz = dz > 1e-6 ? (s.board.h - z) / dz : dz < -1e-6 ? -z / dz : Infinity;
    return Math.min(tx, tz);
  };
  return [[l.e0 - 0.45, -1], [l.e1 + 0.45, 1]].map(([at, dir]) => ({ at, dir, depth: Math.max(1.2, Math.min(3.2, toEdge(at, dir) + 1.6)), width: th + 0.9 }));
}

/**
 * A tram line's fixed dressing: its two rails set in the lane from tunnel to
 * tunnel, a low curb where it crosses the lane's kerbs (a level crossing),
 * the overhead wire, and a tunnel mouth at each end, off the lane, dark
 * inside, where the trams come out and go in.
 */
function tramLine(l, s, t) {
  const g = new THREE.Group(), [ux, uz] = l.u, th = Math.max(...l.trams.map((b) => b.th));
  const P = (sv, off = 0) => [ux * sv - uz * (l.perp + off), uz * sv + ux * (l.perp + off)];
  const ang = Math.atan2(uz, ux), portals = tramPortals(l, s);
  const gauge = Math.min(0.75, th * 0.28);
  // the rails, on the lane only (the tunnels' floors carry them on out of sight)
  for (const off of [-gauge, gauge]) {
    const n = Math.max(2, Math.ceil((l.e1 - l.e0) / 0.5)), pos = [], idx = [];
    for (let k = 0; k <= n; k++) {
      const sv = l.e0 + ((l.e1 - l.e0) * k) / n;
      for (const w of [-0.07, 0.07]) {
        const [x, z] = P(sv, off + w);
        pos.push(x, t.height(x, z) + 0.02, z);
      }
    }
    for (let k = 0; k < n; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 3, k * 2, k * 2 + 3, k * 2 + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x8d989e, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  }
  // the level crossings: a low curbstone where the kerb is cut
  for (const sv of [l.e0 - 0.2, l.e1 + 0.2]) {
    const [x, z] = P(sv), curb = drawn(rbox(0.3, 0.16, th + 0.3, 0.05), flat(0xb8ad9c));
    curb.position.set(x, t.height(...P(sv + (sv < l.e0 ? 0.3 : -0.3))) + 0.08, z);
    curb.rotation.y = -ang;
    g.add(curb);
  }
  // off the lane each end: the track bed, raised to the lane's level over
  // the lower ground out to the board's edge, the rails on it; then a low
  // tunnel mouth at an end away from the camera, dark inside
  const stone = flat(0xb0a594), bedMat = flat(0x9d9383), roofMat = flat(0x8d4f3a), dark = new THREE.MeshBasicMaterial({ color: 0x141a20, side: THREE.BackSide });
  const HP = 2.4, base = GRASS - 0.3; // (a tunnel over the pantograph)
  portals.forEach((pt, end) => {
    const grp = new THREE.Group(), D = pt.depth, Wd = pt.width;
    const box = (w, h, d, x, y, z, m) => { const b = drawn(rbox(w, h, d, 0.05), m); b.position.set(x, y, z); grp.add(b); };
    box(D + 0.3, -base, th + 0.5, (D - 0.3) / 2, base / 2, 0, bedMat);
    for (const off of [-gauge, gauge]) box(D + 0.3, 0.05, 0.14, (D - 0.3) / 2, 0.02, off, flat(0x8d989e));
    if (l.tunnel[end]) {
      for (const side of [-1, 1]) box(D, HP - base, 0.25, D / 2, (HP + base) / 2, side * (Wd / 2 + 0.12), stone);
      box(D, 0.18, Wd + 0.5, D / 2, HP + 0.09, 0, roofMat);
      box(0.3, 0.35, Wd + 0.5, 0.15, HP - 0.18, 0, stone); // the lintel over the mouth
      box(0.25, HP - base, Wd + 0.5, D - 0.12, (HP + base) / 2, 0, stone); // the far end, closed
      const inside = new THREE.Mesh(new THREE.BoxGeometry(D - 0.2, HP - base - 0.1, Wd - 0.05), dark);
      inside.position.set(D / 2, (HP + base) / 2, 0);
      grp.add(inside);
    }
    else {
      // no tunnel: a pole beside the bed holds the wire's end
      const pole = drawn(rbox(0.14, HP + 0.2 - base, 0.14, 0.03), flat(0x3d4a45));
      pole.position.set(0.3, (HP + 0.2 + base) / 2, th / 2 + 0.45);
      const arm = drawn(rbox(0.1, 0.1, th / 2 + 0.5, 0.02), flat(0x3d4a45));
      arm.position.set(0.3, HP + 0.1, (th / 2 + 0.45) / 2);
      grp.add(pole, arm);
    }
    const [x, z] = P(pt.at);
    grp.position.set(x, 0, z);
    grp.rotation.y = pt.dir > 0 ? -ang : -ang + Math.PI; // its depth runs away from the lane
    g.add(grp);
  });
  // the overhead wire, mouth to mouth
  const wy = 2.27, wire = [P(portals[0].at), P(portals[1].at)].map(([x, z]) => new THREE.Vector3(x, wy, z));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: C.ink })));
  return g;
}

function timedPieces(s, t, out) {
  const timed = s.walls.filter((w) => w.every && w.skin !== "sail");
  const pieces = [];
  const lines = tramLines(s, t), tramOf = new Map();
  for (const l of lines) for (const b of l.trams) tramOf.set(b.q[0], b);
  for (const l of lines) out.push(tramLine(l, s, t));
  for (let i = 0; i + 3 < timed.length; i += 4) {
    const q = timed.slice(i, i + 4), [every, on, phase] = [q[0].every, q[0].on, q[0].phase];
    // built in world coordinates, then hung from a pivot at its centre, so a
    // clock hand can turn about the clock
    const cx = q.reduce((a, w) => a + w.a[0] / 4, 0), cz = q.reduce((a, w) => a + w.a[1] / 4, 0);
    const pivot = new THREE.Group(), piece = new THREE.Group();
    pivot.position.set(cx, 0, cz);
    piece.position.set(-cx, 0, -cz);
    pivot.add(piece);
    pivot.userData.live = true;
    for (const m of wallPieces({ ...s, walls: q.map(({ a, b, skin }) => ({ a, b, skin })) }, t)) piece.add(m);
    const l0 = segLen(q[0]), l1 = segLen(q[1]), long = l0 >= l1 ? q[0] : q[1];
    const ang = Math.atan2(long.b[1] - long.a[1], long.b[0] - long.a[0]);
    const at0 = (k) => there(k, every, on, phase);
    // its footprint, faintly dashed, while the player aims: "it comes and goes"
    let ghost = null;
    // not for a clock's hands (the dial says it) nor the lift's chairs (their
    // cable does)
    if (q[0].skin !== "clock hand" && q[0].skin !== "lift") {
      const pts = [...q.map((w) => w.a), q[0].a].map(([x, z]) => new THREE.Vector3(x, t.height(x, z) + 0.05, z));
      ghost = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.3, gapSize: 0.3, transparent: true, opacity: 0.35, depthWrite: false }));
      ghost.computeLineDistances();
      ghost.userData.live = true;
      ghost.visible = false;
      out.push(ghost);
    }
    // a tram fades in and out of its tunnels: its own materials
    const tr = tramOf.get(q[0]), mats = [];
    if (tr) piece.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); mats.push(o.material); } });
    pieces.push({ pivot, there: at0, ang, cx, cz, ghost, hand: q[0].skin === "clock hand", walls: q, tram: tr, mats });
    out.push(pivot);
  }
  // Between ticks a piece glides: over the last EASE of the substep before
  // its window it rises (or, a clock hand, sweeps round from the hand before
  // it); over the first EASE after its window it sinks. Through every
  // substep of its window, where the chain has it block, it is fully there.
  const EASE = 0.3;
  const hands = pieces.filter((p) => p.hand);
  let aiming = false;
  for (const p of pieces) {
    if (p.tram) {
      const [ux, uz] = p.tram.u, axis = new THREE.Vector3(ux, 0, uz);
      const at = (tick) => {
        const r = tramAt(p.tram, tick), d = r.s - p.tram.sF;
        p.pivot.position.set(p.cx + ux * d, 0, p.cz + uz * d);
        // a little roll on its bogies as it picks up and slows
        p.pivot.quaternion.setFromAxisAngle(axis, 0.018 * r.sway);
        p.pivot.visible = r.fade > 0.01;
        for (const m of p.mats) {
          m.opacity = r.fade;
          const see = r.fade < 0.999;
          if (m.transparent !== see) (m.transparent = see), (m.needsUpdate = true);
          m.depthWrite = !see;
        }
        if (p.ghost) p.ghost.visible = aiming && !p.there(Math.floor(tick));
      };
      at(0);
      state.timed.push({ at, walls: p.walls });
      continue;
    }
    const at = (tick) => {
      const k = Math.floor(tick), f = tick - k;
      let e = 0; // 0 away, 1 in place
      if (p.there(k)) e = 1;
      else if (p.there(k + 1) && f > 1 - EASE) e = smoothstep((f - (1 - EASE)) / EASE);
      else if (p.there(k - 1) && f < EASE) e = 1 - smoothstep(f / EASE);
      p.pivot.visible = e > 0.001;
      p.pivot.rotation.y = 0;
      p.pivot.scale.y = 1;
      p.pivot.position.y = 0;
      if (p.hand && e > 0 && e < 1 && !p.there(k)) {
        // a clock's hand: coming, it turns in from the hand that is going
        const prev = p.there(k + 1) ? hands.find((o) => o !== p && o.there(k)) : null;
        if (prev) {
          let d = p.ang - prev.ang;
          d = ((d % Math.PI) + Math.PI) % Math.PI; // hands are lines: half turns
          p.pivot.rotation.y = d * (1 - e); // from the old hand's angle to its own
        } else p.pivot.visible = false; // going: the next one takes over
      } else if (e < 1) {
        // a tram, a plank: it comes up out of its slot and goes back down
        p.pivot.scale.y = Math.max(0.02, e);
        p.pivot.position.y = (1 - e) * -0.1;
      }
      if (p.ghost) p.ghost.visible = aiming && e < 0.5;
    };
    at(0);
    state.timed.push({ at, walls: p.walls });
  }
  // the dashed outlines only while aiming (the engine tells: ghosts(true/false))
  state.ghosts = (on) => {
    aiming = !!on;
    for (const p of pieces) if (p.ghost && !on) p.ghost.visible = false;
  };
}

/** A kerb chain cut open where a gap or an inlet crosses it: each run left
 *  is its own kerb ({ list, ch }), ending at posts. */
function kerbRuns(W, ch, zones, cuts = []) {
  const runs = [];
  let cur = [];
  const flush = () => { if (cur.length) runs.push({ list: cur, ch: { from: 0, to: cur.length - 1, closed: false } }); cur = []; };
  for (let k = ch.from; k <= ch.to; k++)
    for (const piece of openings(W[k], zones, cuts)) {
      if (cur.length && !near(cur[cur.length - 1].b, piece.a)) flush();
      cur.push(piece);
    }
  flush();
  // a closed chain cut once: its first and last runs are one
  if (ch.closed && runs.length > 1 && near(runs[runs.length - 1].list[runs[runs.length - 1].list.length - 1].b, runs[0].list[0].a)) {
    const last = runs.pop(), list = [...last.list, ...runs[0].list];
    runs[0] = { list, ch: { from: 0, to: list.length - 1, closed: false } };
  } else if (runs.length === 1 && ch.closed) runs[0].ch.closed = true;
  return runs;
}

/**
 * Walls as the eye expects them. physics.Bar makes a free-standing barrier out
 * of four segments; drawn one by one they look like two rails, so four closed
 * thin segments are drawn as one solid timber. A lone segment is a board edge:
 * its face is put on the line, on the side the ball plays on, so a gnome that
 * stops against it touches it instead of sinking into it.
 */
function wallPieces(s, t) {
  const out = [];
  // a timed wall (a mill's sail) is drawn by what it belongs to, not as a bar
  const W = s.walls.filter((w) => !w.every);
  timedPieces(s, t, out);
  const caps = new Map();
  const reachable = t.onGreen;

  const inKerb = new Set();
  // a world may dress the rails its own way: world.kerb = { color, post }
  // (mountain: grey stone, town: kerbstone...); wood by default
  const K = (s.board && worldOf(s).kerb) || {};
  const cuts = tramCuts(tramLines(s, t));
  const cutAny = cuts.length > 0 || (s.zones || []).some((q) => GAPS.has(q.skin) || (q.skin === "sea" && q.poly && !q.outside)); // any gap, inlet or tram line to cut the kerbs at
  for (const ch of kerbChains(W)) {
    for (let k = ch.from; k <= ch.to; k++) inKerb.add(k);
    for (const { list, ch: c } of cutAny ? kerbRuns(W, ch, s.zones, cuts) : [{ list: W, ch }]) {
      out.push(kerb(list, c, t, reachable, { color: K.color ?? C.wood }));
      // an open run ends at a post, like any wall: no bare cut profile
      if (!c.closed) for (const p of [list[c.from].a, list[c.to].b]) caps.set(p[0].toFixed(2) + "," + p[1].toFixed(2), [p[0], p[1]]);
    }
  }

  for (let i = 0; i < W.length; i++) {
    if (inKerb.has(i)) continue;
    const q = W.slice(i, i + 4);
    if (q.length === 4 && q.every((w, k) => near(w.b, q[(k + 1) % 4].a))) {
      const l0 = segLen(q[0]), l1 = segLen(q[1]);
      if (Math.min(l0, l1) <= 1.6 || BARS[q[0].skin]) {
        out.push(...barPiece(q, W, s, t));
        i += 3;
        continue;
      }
    }
    const whole = W[i];
    if (segLen(whole) < 1e-6) continue;
    if (whole.skin === "rampart") {
      out.push(rampart(whole, t));
      continue;
    }
    const parts = openings(whole, s.zones, cuts);
    for (const w of parts) {
    const len = segLen(w);
    if (len < 1e-6) continue;
    // a hole with no rails (all sea or rooftops round the lane) is only
    // fenced at the board's edge: a low rope on posts, not a timber
    const onEdge = (k) => [w.a[k], w.b[k]].every((v) => Math.abs(v) < 0.01 || Math.abs(v - (k ? s.board.h : s.board.w)) < 0.01) && Math.abs(w.a[k] - w.b[k]) < 0.01;
    // round a lane over the sea or the rooftops the board's own edge can't be
    // reached (the ball is in the water first): no rail out in the water
    if (!w.skin && s.board && (onEdge(0) || onEdge(1)) && (s.zones || []).some((q) => q.outside && q.kind === "hazard")) continue;
    const ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
    const plusGreen = reachable(mx + nx * 0.6, mz + nz * 0.6);
    const minusGreen = reachable(mx - nx * 0.6, mz - nz * 0.6);
    const thick = plusGreen && minusGreen ? 0.36 : 0.5;
    // push the body away from the green by half its thickness
    const off = plusGreen === minusGreen ? 0 : (plusGreen ? -1 : 1) * thick / 2;
    out.push(timber([mx + nx * off, mz + nz * off], len + (off ? thick : 0), thick, ang, t.height, K.color ?? C.wood, off !== 0));
    for (const p of [w.a, w.b]) {
      const k = p[0].toFixed(2) + "," + p[1].toFixed(2);
      if (!caps.has(k)) caps.set(k, [p[0] + nx * off, p[1] + nz * off]);
    }
    }
  }
  for (const [x, z] of caps.values()) {
    const h = t.height(x, z);
    // from its top down to the garden, however high the green is here
    const foot = GRASS - 0.4, len = 1.4 + h - foot;
    const cap = drawn(new THREE.CylinderGeometry(0.36, 0.4, len, 12), flat(K.post ?? C.woodDark));
    cap.position.set(x, foot + len / 2, z);
    const top = drawn(new THREE.SphereGeometry(0.36, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(K.color ?? C.wood));
    top.position.set(x, 1.4 + h, z);
    out.push(cap, top);
  }
  return out;
}

/** A bar (four walls round a thin box: a timber, a gate, a tram, a world's
 *  own piece) drawn as one piece: what to add to the course. */
function barPiece(q, W, s, t) {
  const l0 = segLen(q[0]), l1 = segLen(q[1]), parts = [];
  const long = l0 >= l1 ? q[0] : q[1];
  const thick = Math.min(l0, l1);
  const cxz = q.reduce((acc, w) => [acc[0] + w.a[0] / 4, acc[1] + w.a[1] / 4], [0, 0]);
  const skin = q[0].skin, door = skin === "gate door", gate = skin === "gate";
  const tint = door ? C.cream : gate ? C.stone : skin === "blade" || skin === "sail" ? C.cream : skin === "hedge" ? C.leafDark : C.wood;
  // a door fits between its gate posts: drawn at full length it would
  // share their end faces and the two flicker against each other
  let L = Math.max(l0, l1) - (door ? thick * 1.4 : 0);
  const ang = Math.atan2(long.b[1] - long.a[1], long.b[0] - long.a[0]);
  // an end that meets another wall runs on into it: butted face to
  // face, the two rounded ends and their outlines leave a dark wedge
  let L0 = L; const c0 = [...cxz]; // the gate's hats stay on its own ends
  if (!door) {
    const ux = Math.cos(ang), uz = Math.sin(ang);
    const others = W.filter((w) => !q.includes(w));
    for (const sgn of [-1, 1]) {
      const ex = cxz[0] + ux * sgn * L / 2, ez = cxz[1] + uz * sgn * L / 2;
      if (others.some((w) => segDist(ex, ez, w.a, w.b) < 0.35)) {
        L += 0.35;
        cxz[0] += ux * sgn * 0.175; cxz[1] += uz * sgn * 0.175;
      }
    }
  }
  // a tram across the lane is drawn between the lane's walls only: its
  // physics runs on past them (no ball gets there), but drawn in full it
  // drove through the rails, the lamps and the street
  if (skin === "tram") {
    const ux = Math.cos(ang), uz = Math.sin(ang);
    let lo = 0, hi = 0;
    while (lo > -L0 / 2 && t.onGreen(c0[0] + ux * (lo - 0.25), c0[1] + uz * (lo - 0.25))) lo -= 0.25;
    while (hi < L0 / 2 && t.onGreen(c0[0] + ux * (hi + 0.25), c0[1] + uz * (hi + 0.25))) hi += 0.25;
    if (hi - lo > 1) {
      const mid = (lo + hi) / 2;
      c0[0] += ux * mid; c0[1] += uz * mid;
      L0 = hi - lo + 2 * TRAM_CREEP + 0.3; // over the whole crossing as it creeps, into the level crossings
    }
  }
  const own = s.board && fromWorld(s, "wall", { walls: q, skin, c: c0, length: L0, thick, ang }, t);
  if (own) return [own];
  // their own look, on the chain's footprint exactly
  if (skin === "logs" || skin === "hay" || BARS[skin]) return [(BARS[skin] || (skin === "logs" ? logs : hay))(c0, L0, thick, ang, t.height)];
  parts.push(timber(cxz, L, door ? thick * 0.8 : thick, ang, t.height, tint));
  // a gnome's gate: stone pillars with a red hat on each end, and a
  // picket door with its own little hat
  const ends = door ? [0] : [-L0 / 2 + thick / 2, L0 / 2 - thick / 2];
  for (const e of ends) {
    if (!gate && !door) break;
    const x = c0[0] + Math.cos(ang) * e, z = c0[1] + Math.sin(ang) * e, y = t.height(x, z);
    const hat = drawn(new THREE.ConeGeometry(door ? 0.28 : 0.45, door ? 0.6 : 0.95, 12), flat(C.cap));
    hat.position.set(x, y + 1.1 + (door ? 0.3 : 0.47), z);
    const brim = drawn(new THREE.TorusGeometry(door ? 0.22 : 0.36, 0.06, 6, 16), flat(C.cap));
    brim.rotation.x = Math.PI / 2;
    brim.position.set(x, y + 1.12, z);
    parts.push(hat, brim);
  }
  if (door) {
    // slats: dark lines down the door, so it reads as pickets
    for (let k = -2; k <= 2; k++) {
      const off = (k / 5) * L;
      const x = cxz[0] + Math.cos(ang) * off, z = cxz[1] + Math.sin(ang) * off, y = t.height(x, z);
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, thick * 0.84), flat(C.woodDark));
      slat.position.set(x, y + 0.55, z);
      slat.rotation.y = -ang;
      parts.push(slat);
    }
  }
  return parts;
}

/** One solid wall: rounded when the ground is flat under it, bent to the
 *  ground when it crosses a ramp. */
function timber([x, z], len, thick, ang, height, color = C.wood, skirt = false) {
  // sampled every half unit: a ramp between two samples would rise through it
  const n = Math.max(2, Math.ceil(len * 2));
  const ends = Array.from({ length: n + 1 }, (_, i) => height(x + Math.cos(ang) * len * (i / n - 0.5), z + Math.sin(ang) * len * (i / n - 0.5)));
  const flatUnder = ends.every((h) => Math.abs(h) < 1e-6);
  // a wall on the rim stands over the drop to the garden: it reaches down to
  // the grass instead of floating above the gap
  const H = skirt ? 2.1 : 1.1;
  const geo = flatUnder
    ? rbox(len, H, thick, 0.14)
    : new THREE.BoxGeometry(len, H, thick, Math.max(1, Math.ceil(len * 2)), 1, 1);
  geo.rotateY(-ang);
  geo.translate(x, 1.1 - H / 2, z);
  if (!flatUnder) {
    // bent to the ground: the top follows it; a rim wall's foot goes on down
    // to the garden wherever the green stands higher (a hole that starts on a
    // hill), or a dark cliff shows under it
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 1.1 - H / 2, y = p.getY(i) + height(p.getX(i), p.getZ(i));
      p.setY(i, skirt && !top ? Math.min(y, GRASS - 0.4) : y);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return drawn(geo, flat(color));
}


/**
 * A sand rampart along a wall (from a sandcastle to the shore): a thick
 * wall of moulded sand, darker wet band at its foot, crenellated on top, its
 * ends run on into the castle and under the shore's kerb so nothing shows a
 * gap. Centred on the wall's line; the ball meets its face.
 */
function rampart(w, t) {
  const g = new THREE.Group();
  const len = segLen(w), ang = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  const TH = 0.9, H = 1.2, over = 0.6; // runs on past each end
  const cx = (w.a[0] + w.b[0]) / 2, cz = (w.a[1] + w.b[1]) / 2;
  const y = t.height(cx, cz);
  const body = drawn(rbox(len + over * 2, H, TH, 0.12), flat(0xe0bd7e));
  body.position.set(cx, y + H / 2 - 0.05, cz);
  body.rotation.y = -ang;
  const band = new THREE.Mesh(new THREE.BoxGeometry(len + over * 2 - 0.1, 0.16, TH + 0.04), flat(0xc9a66a));
  band.position.set(cx, y + 0.22, cz);
  band.rotation.y = -ang;
  g.add(body, band);
  const n = Math.max(2, Math.round(len / 0.9));
  for (let k = 0; k < n; k++) {
    if (k % 2) continue;
    const u = (k + 0.5) / n - 0.5, x = cx + Math.cos(ang) * u * len, z = cz + Math.sin(ang) * u * len;
    const m = drawn(new THREE.BoxGeometry((len / n) * 0.9, 0.42, TH * 0.72), flat(0xeed7a4));
    m.position.set(x, y + H + 0.16, z);
    m.rotation.y = -ang;
    g.add(m);
  }
  return g;
}

/** A boulder filling a post's circle exactly (its widest is the radius). */
function rock(p, height) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const a = geo.attributes.position;
  let far = 0;
  for (let i = 0; i < a.count; i++) far = Math.max(far, Math.hypot(a.getX(i), a.getZ(i)));
  geo.scale(p.r / far, (p.r * 0.8) / far, p.r / far);
  const m = drawn(geo, flat(C.stone));
  m.position.set(p.c[0], height(p.c[0], p.c[1]) + p.r * 0.55, p.c[1]);
  return m;
}

/** A tree stump: bark round, sawn rings on top, no wider than the post. */
function stump(p, height) {
  const m = sawnCylinder(p.r * 0.92, p.r, 0.75, 16);
  m.position.set(p.c[0], height(p.c[0], p.c[1]) + 0.375, p.c[1]);
  return m;
}

/** A post is a bumper; in this garden a bumper is a mushroom — or, when the
 *  chain says so, a rock or a stump. An unknown skin is a mushroom. */
function post(p, height, s, t) {
  // the world draws its own pieces first (see worlds.js, piece()); then ours
  const own = s && fromWorld(s, "post", p, t);
  if (own) return own;
  if (POSTS[p.skin]) return POSTS[p.skin](p, height(p.c[0], p.c[1]));
  if (p.skin === "rock") return rock(p, height);
  if (p.skin === "stump") return stump(p, height);
  const g = new THREE.Group();
  const [x, z] = p.c;
  g.position.y = height(x, z);

  const stem = drawn(new THREE.CylinderGeometry(p.r * 0.5, p.r * 0.62, 1.1, 14), flat(C.cream));
  stem.position.set(x, 0.55, z);
  g.add(stem);

  const cap = drawn(
    new THREE.SphereGeometry(p.r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2),
    flat(C.cap)
  );
  cap.position.set(x, 1.0, z);
  cap.scale.y = 0.8;
  g.add(cap);

  // the spots sit ON the dome, not inside it
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const tilt = i % 2 ? 0.55 : 0.95;           // two rings, so the cap reads round
    const rr = Math.sin(tilt) * p.r * 0.94;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.16, 9, 7), flat(C.cream));
    spot.position.set(x + Math.cos(a) * rr, 1.0 + Math.cos(tilt) * p.r * 0.78, z + Math.sin(a) * rr);
    spot.scale.y = 0.55;
    g.add(spot);
  }
  return g;
}

/** The flag is the only thing that moves on its own; find it once. */
function flagOf(course) {
  let found = null;
  course.traverse((o) => {
    if (o.userData && o.userData.isFlag) found = o;
  });
  return found;
}

function hole(cup, height) {
  const g = new THREE.Group();
  const [x, z] = cup;
  g.position.y = height(x, z);

  // a target, not a flag: bands of colour down to the pit, all of it inside
  // the radius where the chain holes the ball — so what looks in, is in
  // the pit is a dark disc on the green: a cylinder sunk into it poked out
  // of the ground (and its outline showed through it at a grazing angle)
  // drawn over whatever lies there (sand, ice, snow at +0.035): pulled
  // forward in depth, or the two flicker against each other
  const over = (c, k) => flat(c, { polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k * 4 });
  const pit = new THREE.Mesh(new THREE.CircleGeometry(CUP_R * 0.62, 32), over(C.burrow, 2));
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(x, 0.06, z);
  g.add(pit);
  const bands = [[0.62, 0.76, C.cream], [0.76, 0.9, C.sun], [0.9, 1, C.cap]];
  for (const [r0, r1, color] of bands) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(CUP_R * r0, CUP_R * r1, 40), over(color, 2));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.065, z);
    const line = new THREE.Mesh(new THREE.RingGeometry(CUP_R * r1 - 0.03, CUP_R * r1 + 0.03, 40), ringLine);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.07, z);
    g.add(ring, line);
  }

  // a fat arrow bobbing over it: the one thing the eye should find first
  const s2 = new THREE.Shape();
  s2.moveTo(-0.28, 1.4); s2.lineTo(0.28, 1.4); s2.lineTo(0.28, 0.62); s2.lineTo(0.7, 0.62);
  s2.lineTo(0, 0); s2.lineTo(-0.7, 0.62); s2.lineTo(-0.28, 0.62); s2.closePath();
  const geo = new THREE.ExtrudeGeometry(s2, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -0.15);
  const arrow = drawn(geo, flat(C.sun));
  arrow.position.set(x, 2.2, z);
  arrow.userData.isFlag = true;
  arrow.userData.baseY = 2.2;
  g.add(arrow);
  return g;
}

function tee(start, height) {
  const m = drawn(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 20), flat(C.cream, { transparent: true, opacity: 0.6 }));
  m.position.set(start[0], height(start[0], start[1]) + 0.06, start[1]);
  return m;
}

function wearLayer(wear, W, H, height) {
  const canvas = document.createElement("canvas");
  canvas.width = wear.w;
  canvas.height = wear.h;
  const ctx = canvas.getContext("2d");

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter; // the blur is the point: grooves, not pixels

  // laid on the ground, ramps included — over the worn cells only (and two
  // cells round them, as far as the blur reaches): the rest of the lane is
  // not blended over for nothing
  const cover = (i0, j0, i1, j1) => {
    const x0 = (i0 / wear.w) * W, x1 = (i1 / wear.w) * W, z0 = (j0 / wear.h) * H, z1 = (j1 / wear.h) * H;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.ceil((x1 - x0) * 2)), Math.max(1, Math.ceil((z1 - z0) * 2))); // as fine as the ground's cells
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
    // the texture spans the whole board, as before
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / W, 1 - p.getZ(k) / H);
    drape(geo, height);
    return geo;
  };
  const mesh = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: C.wear, map: texture, transparent: true, opacity: 0.55, depthWrite: false })
  );
  mesh.userData.live = true; // repainted and shown/hidden: never baked

  let box = "";
  const paint = (cells) => {
    mesh.visible = cells.some(Boolean); // no overlay to draw on a pristine green
    if (mesh.visible) {
      let i0 = wear.w, j0 = wear.h, i1 = 0, j1 = 0;
      cells.forEach((v, i) => {
        if (!v) return;
        const x = i % wear.w, y = Math.floor(i / wear.w);
        (i0 = Math.min(i0, x)), (i1 = Math.max(i1, x)), (j0 = Math.min(j0, y)), (j1 = Math.max(j1, y));
      });
      const b = [Math.max(0, i0 - 2), Math.max(0, j0 - 2), Math.min(wear.w, i1 + 3), Math.min(wear.h, j1 + 3)];
      if (b.join() !== box) (mesh.geometry.dispose(), (mesh.geometry = cover(...b)), (box = b.join()));
    }
    ctx.clearRect(0, 0, wear.w, wear.h);
    cells.forEach((v, i) => {
      if (!v) return;
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.22 + v * 0.16, 0.95)})`;
      ctx.fillRect(i % wear.w, Math.floor(i / wear.w), 1, 1);
    });
    texture.needsUpdate = true;
  };
  paint(wear.cells);
  return { mesh, paint };
}

/**
 * The pieces a timed hole adds for one stroke — a blade, a shut gate, a mole —
 * drawn like the rest of the course. They are live: nothing here is baked,
 * since the next stroke replaces them.
 */
// the weather's skins: the sky's and the engine's, never drawn on the ground
const WEATHER = new Set([...WEATHER_SKINS, "gust"]);

export function buildExtras(course, ex) {
  const t = course.userData.terrain;
  const g = new THREE.Group();
  g.userData.live = true;
  // a world may draw a stroke's pieces itself (an avalanche, a wave): it
  // returns { group, skins }, and what it drew is left out of the rest
  const own = worldOf(course.userData.state).extras?.(ex, course.userData.state, t);
  if (own) {
    own.group.userData.live = true;
    g.add(own.group);
    ex = { ...ex, walls: ex.walls.filter((w) => !own.skins.has(w.skin)), posts: ex.posts.filter((p) => !own.skins.has(p.skin)), zones: (ex.zones || []).filter((z) => !own.skins.has(z.skin)) };
  }
  const ticks = [];
  for (const w of wallPieces({ ...course.userData.state, walls: ex.walls, zones: ex.zones || [] }, t)) g.add(w);
  for (const p of ex.posts) g.add(p.skin === "mole" ? mole(p, t.height) : post(p, t.height, course.userData.state, t));
  // what a stroke adds on the lane (a wave washing across...); the weather is
  // the sky's and the engine's, not drawn on the ground
  for (const z of ex.zones || []) if (!WEATHER.has(z.skin)) g.add(zoneDetail(z, { ...course.userData.state, zones: ex.zones }, t));
  // a blade is a mill's sweep: stand the mill itself on its hub
  const blade = ex.walls.filter((w) => w.skin === "blade");
  if (blade.length) {
    const cx = blade.reduce((a, w) => a + w.a[0], 0) / blade.length;
    const cz = blade.reduce((a, w) => a + w.a[1], 0) / blade.length;
    const m = windmill(cx, t.height(cx, cz), cz);
    m.hub.userData.live = true;
    g.add(m.group);
    ticks.push(m.spin);
  }
  g.userData.tick = (time) => { if (motion) for (const f of ticks) f(time); };
  bake(g); // walls, posts, moles: merged; a mill's sails stay live
  return g;
}

