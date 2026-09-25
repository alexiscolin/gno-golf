// The "mountain" world: the board on a snowy shelf high in the Alps, same
// functions as garden.js (see worlds.js for the contract). Snow all round with
// blue shadows, rocks breaking through, the shelf ending in a cliff over a
// misty valley at the front, and snowy peaks in rows to the horizon. A chalet,
// a ski lift and a cable car running, pines heavy with snow, a snowman,
// skiing gnomes, eagles, snow falling. Decoration only: nothing out here is in
// the physics. Tall things stand behind and to the right, as in the garden.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, flat, drawn, rbox, lanternGlow, share, ownFade, fadeLoop, type FadeItem } from "./materials";
import { animate, state } from "./state";
import { inZone, mod, there, segDist, wallDist, smoothstep } from "../terrain";
import { timeOf } from "./camera";
import { gnomelet, bunting, stone, smoke } from "./props";
import { bake, look, weatherLooks } from "./bake";
import { seeded, ISLAND, GRASS, placer, onGround, tangentInto, type Rand } from "./common";
import { ud, type Hole, type Height } from "./data";
import type { Bar } from "./worlds";
import type { Terrain } from "../terrain";
import type { Extras, MutVec2, Post, Vec2, Wall, Zone } from "../types";

/** Places reserved round the board (common.ts placer). */
type Reserve = (x: number, z: number, r: number) => void;

const M = {
  snow: 0xf4f8fc, shadow: 0xc9d8ea, rock: 0x7d8490, rockDark: 0x5f6672,
  pine: 0x2d6a55, pineDark: 0x21513f, bark: 0x7a5236,
  wood: 0xb07a48, woodDark: 0x8a5a33, roof: 0x9c3f35, lit: 0xffd98a, unlit: 0x50627a,
  ice: 0xbfe6f4, iceDeep: 0x8ccbe6, haze: 0xeef3f8, cable: 0x3d4a45,
  flags: [0x4a78c8, 0xf2f2f2, 0xd9453d, 0x4aa36c, 0xf2c14a],
};
// every piece of snow: lit a little from within like the snow sheet, or the
// scene's warm light turns it beige
// powder: lit like the lane's snow (no glow of its own: it must match the
// piste round it at dusk and night), its edge see-through
// a drift's surface: opaque, lit like the piste, a hair over it
const DRIFT_OPAQUE = share(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xb9d0ec, emissiveIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
const SNOW_2SIDE = new THREE.MeshLambertMaterial({ color: 0xf6f9fc, emissive: 0xc4d2e2, emissiveIntensity: 0.55, side: THREE.DoubleSide });
const SNOW = share(new THREE.MeshLambertMaterial({ color: 0xf6f9fc, emissive: 0xc4d2e2, emissiveIntensity: 0.55 }));
// A moving piece made of many meshes costs a draw call per mesh, every frame
// (the hole's bake only merges what stands still): compact() merges an
// object's meshes that share a material into one, in the object's own space
// (bake's local frame): a chair of eight parts becomes two or three draws.
const compact = <T extends THREE.Object3D>(obj: T) => bake(obj, { local: true });

/**
 * Many copies of one moving thing (chairs on a lift, skiers): the template is
 * compacted, then drawn as one InstancedMesh per material for all n copies —
 * a handful of draws for the whole lot. set(i, position, rotation) places a copy.
 */
function instances(template: THREE.Object3D, n: number) {
  compact(template);
  const g = new THREE.Group();
  ud(g).live = true;
  const meshes = template.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh).map((o) => {
    const m = new THREE.InstancedMesh(o.geometry, o.material, n);
    m.frustumCulled = false; // copies spread far from the template's bounds
    g.add(m);
    return m;
  });
  const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  return {
    group: g,
    set(i: number, pos: THREE.Vector3, euler: THREE.Euler, scale = one) {
      q.setFromEuler(euler);
      mat.compose(pos, q, scale);
      for (const m of meshes) m.setMatrixAt(i, mat);
    },
    /** A copy's colour, multiplying its material's (a chair going into a dark shed). */
    tint(i: number, c: THREE.Color) { for (const m of meshes) m.setColorAt(i, c); },
    done() { for (const m of meshes) (m.instanceMatrix.needsUpdate = true), m.instanceColor && (m.instanceColor.needsUpdate = true); },
  };
}

const CLIFF = 11; // how far in front of the plot the shelf ends: past the overview's bottom edge

/** How high the snow lies above GRASS: flat round the board, rising into
 *  drifts further out and up the slope behind it. */
function snowAt(W: number, H: number, x: number, z: number) {
  const d = Math.max(0, -x - 2, x - W - 2, -z - 2);
  return smoothstep(d / 14) * (1.5 + 0.9 * Math.sin(x * 0.21 + z * 0.13) + 0.5 * Math.cos(x * 0.07 - z * 0.3)) + smoothstep(-z / 40) * 6;
}

// ---------------------------------------------------------------- the land

/** The snow shelf, its cliff at the front, the valley far below, the peaks. */
function base(s: Hole, box: THREE.Box3) {
  const g = new THREE.Group();
  const rand = seeded("mountain" + s.hole);
  const X0 = box.min.x - 36, X1 = box.max.x + 36, Z0 = box.min.z - 34, Z1 = box.max.z + CLIFF;
  // the snow: one sheet, gently rolling away from the board, blue in its hollows
  const nz = 30, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const white = new THREE.Color(M.snow), blue = new THREE.Color(M.shadow), c = new THREE.Color();
  const W = s.board.w, H = s.board.h;
  const lift = (x: number, z: number) => snowAt(W, H, x, z);
  // a crevasse splits the mountain, not only the board: the sheet has a
  // column edge on each side of it, and nothing in between
  const cracks = crevasses(s);
  const xs: number[] = [];
  for (let i = 0; i <= 48; i++) xs.push(X0 + ((X1 - X0) * i) / 48);
  for (const [a, b] of cracks) xs.push(a, b);
  xs.push(0, W);
  xs.sort((p, q) => p - q);
  const nx = xs.length - 1;
  // rows: the board's own edges are rows too, so the sheet can leave the
  // board's rectangle out (under.. below fills it, open where the ground is)
  const zs: number[] = [];
  for (let j = 0; j <= nz; j++) zs.push(Z0 + ((Z1 - Z0) * j) / nz);
  zs.push(0, H);
  zs.sort((p, q) => p - q);
  const nzz = zs.length - 1;
  const far = new THREE.Color(0xc2d2e2);
  const tint = (x: number, z: number, y: number) => {
    c.copy(white).lerp(blue, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(x * 0.4 + z * 0.25)) * smoothstep(y / 2));
    // aerial perspective: the snow further back goes blue-grey, so it reads
    // as ground running up to the peaks, not as sky
    return c.lerp(far, 0.6 * smoothstep(-(z + 3) / 9));
  };
  for (let j = 0; j <= nzz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = xs[i], z = zs[j];
      const y = lift(x, z);
      pos.push(x, GRASS + y, z);
      tint(x, z, y);
      col.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < nzz; j++)
    for (let i = 0; i < nx; i++) {
      const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
      if (cracks.some(([a, b]) => mx > a && mx < b)) continue; // the gap
      if (mx > 0 && mx < W && mz > 0 && mz < H) continue; // the board's: under() below
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  let under: THREE.BufferGeometry | null = null;
  // under the board, fine snow at the garden's level: open wherever the board
  // is (a cliff, a crack), so the drop is a drop and not a floor of snow
  {
    const open = (s.zones || []).filter((q) => q.skin === "cliff" || q.skin === "crevasse");
    const step = 0.5, un = Math.ceil(W / step), vn = Math.ceil(H / step), up: number[] = [], uc: number[] = [], ui: number[] = [];
    for (let j = 0; j <= vn; j++)
      for (let i = 0; i <= un; i++) {
        const x = Math.min(W, i * step), z = Math.min(H, j * step);
        up.push(x, GRASS + lift(x, z), z);
        tint(x, z, lift(x, z)); // the same snow as the sheet round it: no seam at the board's edge
        uc.push(c.r, c.g, c.b);
      }
    for (let j = 0; j < vn; j++)
      for (let i = 0; i < un; i++) {
        const mx = (i + 0.5) * step, mz = (j + 0.5) * step;
        if (open.some((q) => inZone(q, mx, mz))) continue;
        const a = j * (un + 1) + i;
        ui.push(a, a + un + 1, a + 1, a + 1, a + un + 1, a + un + 2);
      }
    const ug = new THREE.BufferGeometry();
    ug.setAttribute("position", new THREE.Float32BufferAttribute(up, 3));
    ug.setAttribute("color", new THREE.Float32BufferAttribute(uc, 3));
    ug.setIndex(ui);
    ug.computeVertexNormals();
    under = ug;
  }
  // the chasm beyond the board, behind it and in front, down to the depth
  const ground = { height: (x: number, z: number) => GRASS + snowAt(W, H, x, z) };
  for (const [a, b] of cracks) {
    g.add(crevasse({ min: [a, Z0 + 4], max: [b, -0.2] }, ground));
    g.add(crevasse({ min: [a, H + 0.2], max: [b, Z1] }, ground));
  }
  // lit a little from within: under the scene's warm light plain white reads grey
  // by day crisp white; at dusk the scene's warm light gives it alpenglow
  const day = timeOf(s.hole) === "day";
  const snowMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: day ? 0xc4d2e2 : 0x9fb2c8, emissiveIntensity: day ? 0.6 : 0.45 });
  g.add(new THREE.Mesh(geo, snowMat));
  if (under) g.add(new THREE.Mesh(under, snowMat));

  // the cliff: a rock face dropping from the shelf's front edge, jagged, with
  // snow lying on its ledges
  const face: number[] = [], fi: number[] = [], steps = 60, drop = 16;
  for (let k = 0; k <= steps; k++) {
    let x = X0 + ((X1 - X0) * k) / steps;
    for (const [a, b] of cracks) if (x > a && x < b) x = x - a < b - x ? a : b; // the face stops at the crack
    const jag = Math.sin(k * 1.7) * 0.6 + Math.sin(k * 0.53) * 0.9;
    face.push(x, GRASS + 0.02, Z1, x + jag * 0.3, GRASS - drop * 0.45, Z1 + 1.2 + jag, x - jag * 0.2, GRASS - drop, Z1 + 2.5 + jag * 0.6);
    if (k) for (let r = 0; r < 2; r++) {
      const a = (k - 1) * 3 + r, b = k * 3 + r;
      fi.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.Float32BufferAttribute(face, 3));
  // snow-streaked at the lip, going blue into the valley's mist
  const fcol: number[] = [], top = new THREE.Color(M.shadow), low = new THREE.Color(0xbcd3e6).lerp(new THREE.Color(M.rock), 0.35);
  for (let k = 0; k < face.length / 3; k++) {
    const t = k % 3 === 0 ? 0 : k % 3 === 1 ? 0.5 : 1; // lip, middle, foot: dark rock going blue into the mist
    const cc = top.clone().lerp(low, t);
    fcol.push(cc.r, cc.g, cc.b);
  }
  fg.setAttribute("color", new THREE.Float32BufferAttribute(fcol, 3));
  fg.setIndex(fi);
  fg.computeVertexNormals();
  g.add(new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x8fa3b8, emissiveIntensity: 0.5 })));
  // the valley below, lost in mist: a pale plane fading out
  const valley = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 200, 160), new THREE.MeshBasicMaterial({ color: 0xe6eef6 }));
  valley.rotation.x = -Math.PI / 2;
  valley.position.set((X0 + X1) / 2, GRASS - drop - 0.5, Z1 + 80);
  g.add(valley);
  for (let k = 0; k < 3; k++) {
    // mist banks drifting over the valley
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 60, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    mist.rotation.x = -Math.PI / 2;
    mist.position.set((X0 + X1) / 2, GRASS - drop * (0.35 + k * 0.2), Z1 + 10 + k * 14);
    ud(mist).live = true;
    g.add(mist);
    animate((t) => (mist.position.x = (X0 + X1) / 2 + Math.sin(t * 0.05 + k * 2) * 8));
  }
  // rocks breaking through the snow (not on the cliff's lip: there they read as floating over the drop)
  for (let k = 0; k < 16; k++) {
    const r = drawn(new THREE.DodecahedronGeometry(0.8 + rand() * 1.6, 0), flat(rand() < 0.5 ? M.rock : M.rockDark));
    const x = rand() < 0.5 ? X0 + rand() * 14 : X1 - rand() * 14;
    const z = Z0 + 10 + rand() * (Z1 - Z0 - 20);
    if (x > -8 && x < W + 8 && z > -8 && z < H + 8) continue; // well clear of the board
    if (cracks.some(([a, b]) => x > a - 2.5 && x < b + 2.5)) continue; // and of the crack
    r.position.set(x, GRASS + lift(x, z) - 0.3, z);
    r.scale.set(1, 0.55, 1);
    r.rotation.set(rand(), rand() * 6, rand());
    g.add(r);
  }
  g.add(peaks(rand, X0, X1, Z0, Z1, drop, box));
  return g;
}

/**
 * Peaks all round: rows of snowy cones behind and to the sides, each row
 * further off, smaller on screen and closer to the haze, and a lower range
 * across the valley in front. One mesh per row and shade: cheap.
 */
function peaks(rand: Rand, X0: number, X1: number, Z0: number, Z1: number, drop: number, box: THREE.Box3) {
  const g = new THREE.Group();
  // one material for every massif: the colour is in the vertices (rock
  // below, snow above a ragged line, both hazed with distance), and flat
  // shading gives the facets and ridges
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x7f8fa2, emissiveIntensity: 0.3, side: THREE.DoubleSide });
  const snowC = new THREE.Color(0xf7fbff), hazeC = new THREE.Color(M.haze);
  const geos: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = []; // the snow caps apart: they lie on the rock faces
  // A peak: one clean cone of five big faces, each face one flat rock tone
  // (three, lit to dark round the peak), and a snow cap on its upper part —
  // the same cone, scaled to that height and a hair larger, so its edge is a
  // clean ring following the ridges. Sometimes a lower shoulder beside it.
  const W = box.max.x - ISLAND.x, H = box.max.z - ISLAND.front;
  const tones = [new THREE.Color(0x8b9db3), new THREE.Color(0x71839b), new THREE.Color(0x5c6c84)];
  const cone = (x: number, z: number, h: number, r: number, rot: number, k: number, y0: number) => {
    const rock = new THREE.ConeGeometry(r, h, 5, 1).toNonIndexed();
    rock.rotateY(rot);
    const col: number[] = [];
    for (let f = 0; f < rock.attributes.position.count; f += 3) {
      const c = tones[(f / 3) % 3].clone().lerp(hazeC, k);
      for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b);
    }
    rock.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    rock.translate(x, y0 + h / 2, z);
    const share = 0.42 + rand() * 0.12; // how far down the snow comes
    const cap = new THREE.ConeGeometry(r * share * 1.035, h * share * 1.012, 5, 1).toNonIndexed();
    cap.rotateY(rot);
    const sc = snowC.clone().lerp(hazeC, k * 0.6), ccol: number[] = [];
    for (let v = 0; v < cap.attributes.position.count; v++) ccol.push(sc.r, sc.g, sc.b);
    cap.setAttribute("color", new THREE.Float32BufferAttribute(ccol, 3));
    cap.translate(x, y0 + h - (h * share) / 2 + 0.01, z);
    rock.deleteAttribute("uv"), geos.push(rock);
    cap.deleteAttribute("uv"), caps.push(cap);
  };
  // standing on the snow where it is (the slope behind rises): a base at
  // GRASS would be buried, and only a white tip would show
  const skirt = (x: number, z: number, r: number, k: number, y0: number) => {
    // snow flaring out at the foot: the peak grows out of the slope
    const sk = new THREE.CylinderGeometry(r * 1.02, r * 1.55, r * 0.35, 5, 1, true).toNonIndexed();
    const c = snowC.clone().lerp(new THREE.Color(0xc2d2e4), 0.45).lerp(hazeC, k), col: number[] = [];
    for (let v = 0; v < sk.attributes.position.count; v++) col.push(c.r, c.g, c.b);
    sk.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    sk.deleteAttribute("uv");
    sk.translate(x, y0 + r * 0.12, z);
    geos.push(sk);
  };
  const massif = (x: number, z: number, h: number, k: number, y0 = GRASS + snowAt(W, H, x, z) - 0.5) => {
    const r = h * (0.62 + rand() * 0.12), rot = rand() * Math.PI;
    skirt(x, z, r, k, y0);
    cone(x, z, h, r, rot, k, y0);
    if (rand() < 0.5) cone(x + (rand() < 0.5 ? -1 : 1) * r * 0.75, z + r * 0.15, h * 0.6, r * 0.7, rot + 0.5, k, y0);
    return { x, z, top: y0 + h };
  };
  const cx = (X0 + X1) / 2;
  let near: { x: number; z: number; top: number } | null = null;
  // the first range, where the camera looks: back far enough, and low
  // enough, that whole silhouettes fit inside the overview
  // (the camera looks down steeply: the further back, the higher on screen,
  // so these stand close and low — the far rows are for the play camera)
  for (const [z, k, h0] of [[box.min.z - 8, 0.1, 3.8]])
    for (let x = box.min.x - 4; x < box.max.x + 8; x += 16 + rand() * 8) {
      const p = massif(x + rand() * 3, z - rand() * 2, h0 + rand() * 2, k);
      if (!near || Math.abs(p.x - cx - 8) < Math.abs(near.x - cx - 8)) near = p;
    }
  // further back, fading into the haze
  for (let row = 0; row < 2; row++) {
    const z = Z0 - 30 - row * 24, k = 0.5 + row * 0.2;
    for (let x = X0 - 40 - row * 20; x < X1 + 40 + row * 20; x += 24 + rand() * 14) massif(x + rand() * 6, z - rand() * 8, 18 + rand() * 12 + row * 8, k);
  }
  // the sides, going back
  for (const side of [-1, 1])
    for (let z = Z0 + 6; z < Z1 - 10; z += 18 + rand() * 10)
      massif(side < 0 ? X0 - 8 - rand() * 10 : X1 + 8 + rand() * 10, z, 10 + rand() * 8, 0.2);
  // across the valley, lower and hazier
  for (let x = X0 - 60; x < X1 + 60; x += 24 + rand() * 16) massif(x, Z1 + 60 + rand() * 30, 14 + rand() * 10, 0.6, GRASS - drop);
  // ridge lines: a dark blue-grey band of forested slopes and rock behind each
  // row, a jagged low wall the peaks stand on — the ground's visible horizon
  const ridge = (z: number, k: number, y0: number, x0: number, x1: number, hgt: number) => {
    const pts: MutVec2[] = [], n = Math.ceil((x1 - x0) / 3);
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, hgt * (0.6 + 0.4 * Math.sin(i * 1.3 + z) + 0.25 * rand())]);
    const pos: number[] = [], col: number[] = [];
    const top = new THREE.Color(0x6a8496).lerp(hazeC, k), foot = new THREE.Color(0x8ea6ba).lerp(hazeC, k);
    for (let i = 0; i < n; i++) {
      const [xa, ha] = pts[i], [xb, hb] = pts[i + 1];
      const ya = y0 + snowAt(W, H, xa, z), yb = y0 + snowAt(W, H, xb, z);
      pos.push(xa, ya - 0.5, z, xb, yb - 0.5, z, xa, ya + ha, z, xb, yb - 0.5, z, xb, yb + hb, z, xa, ya + ha, z);
      for (const c of [foot, foot, top, foot, top, top]) col.push(c.r, c.g, c.b);
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo2.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geos.push(geo2);
  };
  ridge(box.min.z - 8.6, 0.15, GRASS, X0 - 20, X1 + 20, 1.8);
  for (let row = 0; row < 2; row++) ridge(Z0 - 31 - row * 24, 0.5 + row * 0.2, GRASS, X0 - 60, X1 + 60, 4 + row * 2);
  const capGeo = mergeGeometries(caps);
  capGeo.computeVertexNormals();
  g.add(new THREE.Mesh(capGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x7f8fa2, emissiveIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })));
  const geo = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const a of Object.keys(q.attributes)) if (a !== "position" && a !== "color") q.deleteAttribute(a); return q; }));
  geo.computeVertexNormals(); // non-indexed: one normal per face, flat planes
  g.add(new THREE.Mesh(geo, mat));
  // a summit cross on the nearest peak behind
  if (near) {
    const cross = new THREE.Group();
    const up = drawn(rbox(0.3, 2.4, 0.3, 0.05), flat(M.woodDark));
    up.position.y = 1.2;
    const arm = drawn(rbox(1.4, 0.26, 0.26, 0.05), flat(M.woodDark));
    arm.position.y = 1.8;
    cross.add(up, arm);
    cross.position.set(near.x, near.top - 0.3, near.z);
    g.add(cross);
  }
  return g;
}

/** The rocks on the shelf round a W×H board: where edging draws them, and
 *  where decor keeps off. */
function edgeRocks(W: number, H: number, seed: string) {
  const rand = seeded("mountain-edge" + seed), out: { size: number; x: number; z: number; rot: [number, number, number] }[] = [];
  for (let k = 0; k < 6; k++) {
    const size = 0.35 + rand() * 0.3, side = k % 2, slot = Math.floor(k / 2); // three slots a side, one rock each
    const x = 2 + ((slot + 0.2 + rand() * 0.6) * (W - 4)) / 3, z = side ? -2.4 - rand() : H + 2.4 + rand();
    out.push({ size, x, z, rot: [rand(), rand() * 6, rand()] });
  }
  return out;
}

/** The shelf round the board: a few rocks half sunk in the snow, no more. */
function edging(box: THREE.Box3, seed: string) {
  const g = new THREE.Group();
  for (const { size, x, z, rot } of edgeRocks(box.max.x - ISLAND.x, box.max.z - ISLAND.front, seed)) {
    const r = drawn(new THREE.DodecahedronGeometry(size, 0), flat(M.rock));
    r.position.set(x, GRASS - 0.1, z);
    r.scale.y = 0.5;
    r.rotation.set(...rot);
    g.add(r);
  }
  return g;
}

// the snow sheet is base's; its height is what decor stands on
function berms(s: Hole) {
  return { group: new THREE.Group(), height: (x: number, z: number) => snowAt(s.board.w, s.board.h, x, z) };
}

// ---------------------------------------------------------------- props

/** A pine weighed down with snow: three tiers, snow on each. */
function pine(rand: Rand, scale = 1) {
  const g = new THREE.Group();
  const h = (3 + rand() * 2.5) * scale;
  const trunk = drawn(new THREE.CylinderGeometry(0.14 * scale, 0.2 * scale, h * 0.3, 6), flat(M.bark));
  trunk.position.y = h * 0.15;
  g.add(trunk);
  for (let k = 0; k < 3; k++) {
    const r = (1.25 - k * 0.3) * scale * (h / 4), th = h * 0.36, y = h * 0.25 + k * h * 0.22;
    const tier = drawn(new THREE.ConeGeometry(r, th, 7), flat(k % 2 ? M.pineDark : M.pine));
    tier.position.y = y + th / 2;
    const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, th * 0.42, 7), SNOW);
    snow.position.y = y + th - th * 0.2;
    g.add(tier, snow);
  }
  return { g, r: 1.25 * scale * (h / 4) };
}

/** The chalet: timber walls, a snowy pitched roof, lit windows after dark. */
/** A chalet; fog: by day its windows light up in the fog (a weather look). */
function chalet(night: boolean, fog = false) {
  const g = new THREE.Group();
  const body = drawn(rbox(4.2, 2.6, 3.4, 0.1), flat(M.wood));
  body.position.y = 1.3;
  g.add(body);
  for (const side of [-1, 1]) {
    const slope = drawn(rbox(4.8, 0.25, 2.4, 0.08), flat(M.roof));
    slope.position.set(0, 3.25, side * 0.95);
    slope.rotation.x = side * 0.62;
    const snow = drawn(rbox(4.9, 0.18, 2.3, 0.08), SNOW);
    snow.position.set(0, 3.45, side * 0.98);
    snow.rotation.x = side * 0.62;
    g.add(slope, snow);
  }
  const win = night ? new THREE.MeshBasicMaterial({ color: M.lit }) : flat(M.unlit);
  for (const x of [-1.2, 1.2]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), win);
    w.position.set(x, 1.6, 1.71);
    g.add(w);
    if (night) {
      const glow = new THREE.Sprite(lanternGlow());
      glow.scale.set(2.4, 2.4, 1);
      glow.position.set(x, 1.6, 1.9);
      g.add(glow);
    }
  }
  if (fog && !night) {
    // lit through the murk: the lamps inside on, a glow at each window
    const lit = new THREE.Group(), glass = new THREE.MeshBasicMaterial({ color: M.lit, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    for (const x of [-1.2, 1.2]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), glass);
      w.position.set(x, 1.6, 1.71);
      const glow = new THREE.Sprite(lanternGlow());
      glow.scale.set(2.4, 2.4, 1);
      glow.position.set(x, 1.6, 1.9);
      lit.add(w, glow);
    }
    g.add(look(lit, "fog"));
  }
  const door = drawn(rbox(0.8, 1.4, 0.1, 0.05), flat(M.woodDark));
  door.position.set(0, 0.7, 1.72);
  const balcony = drawn(rbox(4.4, 0.12, 0.7, 0.04), flat(M.woodDark));
  balcony.position.set(0, 2.3, 1.95);
  const chimney = drawn(rbox(0.5, 1.2, 0.5, 0.05), flat(M.rockDark));
  chimney.position.set(1.3, 3.9, -0.4);
  g.add(door, balcony, chimney, smoke(new THREE.Vector3(1.3, 4.5, -0.4)));
  return g;
}

/** A snowman, with a gnome hat of course. */
function snowman() {
  const g = new THREE.Group();
  for (const [r, y] of [[0.7, 0.55], [0.5, 1.45], [0.36, 2.1]]) {
    const b = drawn(new THREE.SphereGeometry(r, 14, 10), SNOW);
    b.position.y = y;
    g.add(b);
  }
  const hat = drawn(new THREE.ConeGeometry(0.3, 0.7, 12), flat(C.cap));
  hat.position.y = 2.7;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 8), flat(0xf08a2c));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 2.1, 0.45);
  g.add(hat, nose);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), flat(M.bark));
    arm.position.set(s * 0.75, 1.55, 0);
    arm.rotation.z = s * -1.0;
    g.add(arm);
  }
  return g;
}

/** A pair of skis and poles stuck upright in the snow. */
function skis(rand: Rand) {
  const g = new THREE.Group();
  const col = [0xd9453d, 0x4a78c8, 0xf2c14a][Math.floor(rand() * 3)];
  for (const x of [-0.12, 0.12]) {
    const ski = drawn(rbox(0.12, 1.8, 0.04, 0.03), flat(col));
    ski.position.set(x, 0.8, 0);
    ski.rotation.z = x * 0.6;
    g.add(ski);
  }
  for (const x of [-0.45, 0.45]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4), flat(M.cable));
    pole.position.set(x, 0.6, 0.1);
    pole.rotation.z = -x * 0.3;
    g.add(pole);
  }
  return g;
}

/** A wooden sledge. */
function sledge() {
  const g = new THREE.Group();
  const seat = drawn(rbox(0.7, 0.1, 1.4, 0.04), flat(M.wood));
  seat.position.y = 0.4;
  g.add(seat);
  for (const x of [-0.3, 0.3]) {
    const run = drawn(rbox(0.07, 0.07, 1.6, 0.03), flat(M.woodDark));
    run.position.set(x, 0.1, 0.05);
    const leg = drawn(rbox(0.06, 0.3, 0.06, 0.02), flat(M.woodDark));
    leg.position.set(x, 0.25, 0);
    g.add(run, leg);
  }
  return g;
}

/** A frozen waterfall down a rock: an ice ribbon and icicles, a frozen pool. */
function frozenFall() {
  const g = new THREE.Group();
  // an icy crag: pale blue rock, the fall frozen down its face
  const rock = drawn(new THREE.DodecahedronGeometry(2.4, 0), flat(M.shadow));
  rock.scale.set(1.2, 1.5, 0.8);
  rock.position.y = 2.8;
  const ice = drawn(rbox(1.5, 4.6, 0.4, 0.2), flat(M.ice));
  ice.position.set(0, 2.4, 1.7);
  const pool = drawn(new THREE.CylinderGeometry(1.8, 2, 0.15, 16), flat(M.iceDeep));
  pool.position.set(0, 0.08, 2.8);
  pool.scale.z = 0.6;
  g.add(rock, ice, pool);
  for (let k = 0; k < 7; k++) {
    const ic = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8 + (k % 3) * 0.3, 5), flat(M.ice));
    ic.rotation.x = Math.PI;
    ic.position.set(-1.2 + k * 0.4, 4.6 - (k % 2) * 0.3, 1.5);
    g.add(ic);
  }
  return g;
}

/**
 * A chair lift as the eye knows one: tube pylons with a crossbeam and sheaves
 * at the top, snow on them; two cables sagging between pylons, up on one side
 * and down on the other; chairs on clamp arms, evenly spaced, swinging a
 * little; a station hut at each end. From a (bottom) to b (top), on the
 * ground height fn (the world's snow).
 */
function chairLift(a: THREE.Vector3, b: THREE.Vector3, pylons: number, chairs: number, ground: Height, night: boolean) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
  const GAP = 0.9, H = 4.2; // half the gap between the up and down cables; cable height at a pylon
  const tube = flat(0x8a97a6), dark = flat(M.cable);
  const tops: THREE.Vector3[] = [];
  for (let k = 0; k <= pylons; k++) {
    const p = new THREE.Vector3().lerpVectors(a, b, k / pylons), y0 = ground(p.x, p.z);
    const py = new THREE.Group();
    py.position.set(p.x, y0, p.z);
    py.rotation.y = Math.atan2(-side.z, side.x);
    const pole = drawn(new THREE.CylinderGeometry(0.12, 0.16, H, 8), tube);
    pole.position.y = H / 2;
    const beam = drawn(rbox(GAP * 2 + 0.6, 0.16, 0.16, 0.04), tube);
    beam.position.y = H;
    py.add(pole, beam);
    for (const sx of [-1, 1]) {
      // the sheaves the cable runs over, and snow lying on the beam
      const wheel = drawn(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * GAP, H + 0.02, 0);
      const snow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
      snow.scale.set(1.6, 0.4, 0.8);
      snow.position.set(sx * GAP * 0.5, H + 0.08, 0);
      py.add(wheel, snow);
    }
    const capSnow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
    capSnow.position.y = H + 0.08;
    py.add(capSnow);
    g.add(py);
    tops.push(new THREE.Vector3(p.x, y0 + H, p.z));
  }
  // the cable between two pylons sags a little in the middle
  const at = (u: number, s0: number, p = new THREE.Vector3()) => {
    const f = u * pylons, k = Math.min(pylons - 1, Math.floor(f)), v = f - k;
    p.lerpVectors(tops[k], tops[k + 1], v);
    p.y -= Math.sin(Math.PI * v) * 0.45;
    return p.addScaledVector(side, s0 * GAP);
  };
  const cable = new THREE.LineBasicMaterial({ color: M.cable });
  for (const s0 of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= pylons * 12; k++) pts.push(at(k / (pylons * 12), s0));
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cable));
  }
  // the chairs, evenly spaced: up on one cable, down on the other — all of
  // them one instanced set
  const tpl = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), dark);
  arm.position.y = -0.55;
  const seat = drawn(rbox(0.8, 0.1, 0.42, 0.04), flat(0xd9453d));
  seat.position.y = -1.15;
  const back = drawn(rbox(0.8, 0.42, 0.08, 0.03), flat(0xd9453d));
  back.position.set(0, -0.92, -0.2);
  const rider = gnomeHead();
  rider.position.set(0, -0.95, 0);
  tpl.add(arm, seat, back, rider);
  const set = instances(tpl, chairs);
  g.add(set.group);
  const e = new THREE.Euler(), cp = new THREE.Vector3();
  animate((t) => {
    for (let k = 0; k < chairs; k++) {
      const u = (k / chairs + t * 0.01) % 1, up = u < 0.5, v = up ? u * 2 : 2 - u * 2; // out and back round the bull wheels
      e.set(Math.sin(t * 1.6 + k * 2) * 0.08, Math.atan2(dir.x, dir.z) + (up ? 0 : Math.PI), 0); // a little swing
      set.set(k, at(Math.min(0.999, Math.max(0.001, v)), up ? 1 : -1, cp), e);
    }
    set.done();
  });
  // a hut at each end, where the chairs turn
  for (const [p, lit] of [[a, true], [b, false]] as const) {
    const hut = new THREE.Group();
    const body = drawn(rbox(2.2, 1.6, 1.8, 0.1), flat(M.wood));
    body.position.y = 0.8;
    const roof = drawn(rbox(2.6, 0.22, 2.2, 0.08), SNOW);
    roof.position.y = 1.72;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), night && lit ? new THREE.MeshBasicMaterial({ color: M.lit }) : flat(M.unlit));
    win.position.set(0, 1, 0.91);
    hut.add(body, roof, win);
    hut.position.set(p.x - dir.x * 1.4, ground(p.x, p.z), p.z - dir.z * 1.4);
    hut.rotation.y = Math.atan2(dir.x, dir.z);
    g.add(hut);
  }
  return g;
}

/** Gnomes on skis, going down a curve on the slope behind, again and again:
 *  one instanced set for all of them. */
function skiers(rand: Rand, path: THREE.Curve<THREE.Vector3>, ground: Height, n: number) {
  const tpl = gnomelet(rand);
  for (const x of [-0.08, 0.08]) {
    const ski = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.9), flat(0x4a78c8));
    ski.position.set(x, 0.02, 0);
    tpl.add(ski);
  }
  const set = instances(tpl, n), p = new THREE.Vector3(), tan = new THREE.Vector3(), tmp = new THREE.Vector3(), e = new THREE.Euler();
  animate((t) => {
    for (let k = 0; k < n; k++) {
      const u = (t * 0.035 + k / n) % 1;
      path.getPoint(u, p);
      p.y = GRASS + ground(p.x, p.z);
      tangentInto(path, u, tan, tmp);
      e.set(0, Math.atan2(tan.x, tan.z), 0);
      set.set(k, p, e);
    }
    set.done();
  });
  return set.group;
}

/**
 * A cable car that crosses high over the lane now and then: a cable from a
 * pylon behind the left end to one behind the right end, the cabin gliding
 * across it in half a minute, then gone (off the far pylon) for a while.
 */
function cableCar(W: number) {
  const g = new THREE.Group();
  const y = GRASS + 12, a = new THREE.Vector3(-14, y, -9), b = new THREE.Vector3(W + 14, y + 1.5, -6);
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: M.cable })));
  for (const p of [a, b]) {
    const pyl = drawn(rbox(0.3, p.y - GRASS, 0.3, 0.05), flat(0x8a97a6));
    pyl.position.set(p.x, GRASS + (p.y - GRASS) / 2, p.z);
    g.add(pyl);
  }
  const cab = new THREE.Group();
  const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 4), flat(M.cable));
  hang.position.y = -0.55;
  const box = drawn(rbox(2, 1.4, 1.4, 0.25), flat(0xd9453d));
  box.position.y = -1.7;
  const win = drawn(rbox(2.1, 0.5, 1.5, 0.12), flat(M.ice));
  win.position.y = -1.45;
  const roof = drawn(rbox(2.2, 0.18, 1.6, 0.08), SNOW);
  roof.position.y = -0.95;
  cab.add(hang, box, win, roof);
  compact(cab);
  ud(cab).live = true;
  g.add(cab);
  const PERIOD = 55, RIDE = 26;
  animate((t) => {
    const u = (t % PERIOD) / RIDE;
    cab.visible = u < 1;
    if (u < 1) cab.position.lerpVectors(a, b, u), (cab.rotation.z = Math.sin(t * 1.3) * 0.03);
  });
  return g;
}

/**
 * A bobsleigh run down the slope behind, left of the chalet: an iced channel
 * with banked walls snaking down, and a bob racing down it now and then.
 */
function bobsleigh(X0: number, X1: number, H: number, bank: Height, reserve: Reserve) {
  const g = new THREE.Group();
  const x0 = X0 + (X1 - X0) * 0.45;
  const ctrl = [[x0 - 4, -16], [x0 + 3, -13], [x0 - 2, -10.5], [x0 + 4, -8], [x0 + 1, -5.6]];
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, GRASS + bank(x, z) + 0.1, z)));
  // the channel: a half-pipe swept along it, open to the sky
  const N = 60, P = 9, pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= N; k++) {
    const u = k / N, p = curve.getPoint(u), tan = curve.getTangent(u);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (let m = 0; m <= P; m++) {
      const a = Math.PI * (m / P); // from one lip, down, to the other
      const q = p.clone().addScaledVector(side, Math.cos(a) * 0.6).setY(p.y + 0.5 - Math.sin(a) * 0.45);
      pos.push(q.x, q.y, q.z);
    }
    if (k) for (let m = 0; m < P; m++) {
      const a0 = (k - 1) * (P + 1) + m, b0 = k * (P + 1) + m;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
    if (k % 6 === 0) reserve(p.x, p.z, 0.9);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xcfeefa, emissive: 0x8fc4dc, emissiveIntensity: 0.35, shininess: 80, side: THREE.DoubleSide })));
  const bob = new THREE.Group();
  const body = drawn(rbox(0.9, 0.35, 0.45, 0.15), flat(0x4a78c8));
  body.position.y = 0.2;
  const rider = gnomeHead();
  rider.position.set(0.1, 0.45, 0);
  bob.add(body, rider);
  compact(bob);
  ud(bob).live = true;
  g.add(bob);
  const PERIOD = 18, RIDE = 3.2, bobTan = new THREE.Vector3(), bobTmp = new THREE.Vector3();
  animate((t) => {
    const u = (t % PERIOD) / RIDE;
    bob.visible = u < 1;
    if (u >= 1) return;
    const e = u * u; // it gathers speed
    curve.getPoint(e, bob.position);
    const tan = tangentInto(curve, e, bobTan, bobTmp);
    bob.rotation.y = Math.atan2(-tan.z, tan.x);
  });
  return g;
}
const gnomeHead = () => {
  const g = new THREE.Group();
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), flat(C.cream));
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 8), flat(C.cap));
  hat.position.y = 0.2;
  g.add(face, hat);
  return g;
};

/** Eagles: a V of wings, circling high over the shelf. */
function eagles(W: number, H: number) {
  const g = new THREE.Group();
  const wing = new THREE.ConeGeometry(0.12, 1.2, 3);
  for (let k = 0; k < 2; k++) {
    const e = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(wing, flat(0x4a3a2c));
      w.rotation.z = s * Math.PI / 2;
      w.position.x = s * 0.6;
      e.add(w);
    }
    ud(e).live = true;
    g.add(e);
    const r = 10 + k * 6, h = 12 + k * 3, ph = k * 2;
    animate((t) => {
      const a = t * 0.15 + ph;
      e.position.set(W / 2 + Math.cos(a) * r, GRASS + h + Math.sin(t * 0.4 + ph) * 0.8, H / 2 - 14 + Math.sin(a) * r * 0.5);
      e.rotation.y = -a;
      e.rotation.z = Math.sin(t * 0.6 + ph) * 0.2;
      e.children.forEach((w, i) => (w.rotation.x = Math.sin(t * 3 + ph) * 0.15 * (i ? 1 : -1)));
    });
  }
  return g;
}

/** Snow falling, gently, over the board and round it. */
function snowfall(W: number, H: number) {
  const N = 360, pos = new Float32Array(N * 3), seeds = new Float32Array(N * 4), rand = seeded("snowfall" + W + "x" + H);
  for (let i = 0; i < N; i++) seeds.set([-8 + rand() * (W + 16), rand() * 12, -10 + rand() * (H + 16), rand() * 6], i * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
  pts.frustumCulled = false;
  ud(pts).live = true;
  animate((t) => {
    for (let i = 0; i < N; i++) {
      const x = seeds[i * 4], y = seeds[i * 4 + 1], z = seeds[i * 4 + 2], ph = seeds[i * 4 + 3];
      pos[i * 3] = x + Math.sin(t * 0.7 + ph) * 0.4;
      pos[i * 3 + 1] = GRASS + ((y - t * 0.6 + 120) % 12);
      pos[i * 3 + 2] = z + Math.cos(t * 0.5 + ph) * 0.3;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return pts;
}

/**
 * A drift of wind-blown snow: a long gentle slope up from the windward side
 * to a sharp crest, then a short steep drop on the lee side, which is in blue
 * shadow — so it has volume from above, not a flat white blob.
 */
function drift(rand: Rand) {
  const L = 1.3 + rand() * 1.0, D = 0.8 + rand() * 0.4, hgt = 0.45 + rand() * 0.25;
  const nx = 14, nz = 8, pos: number[] = [], col: number[] = [], idx: number[] = [];
  const white = new THREE.Color(0xf6f9fc), blue = new THREE.Color(M.shadow).lerp(new THREE.Color(0x9fb8d6), 0.4);
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = (j / nz) * 2 - 1; // u: windward 0 -> lee 1 (crest at 0.72)
      const across = 1 - v * v;
      const prof = u < 0.72 ? Math.pow(u / 0.72, 1.4) : 1 - Math.pow((u - 0.72) / 0.28, 0.6);
      const y = hgt * prof * across;
      pos.push((u - 0.5) * L * 2, y, v * D);
      const c = white.clone().lerp(blue, u > 0.72 ? 0.85 : 0.1 * across);
      col.push(c.r, c.g, c.b);
    }
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, DRIFT));
  // the shadow it casts past its lee
  const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 16), new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  shade.rotation.x = -Math.PI / 2;
  shade.scale.set(L * 0.35, D * 0.8, 1);
  shade.position.set(L * 0.75, 0.1, 0); // 0.05 over the snow (the drift sits 0.05 down)
  g.add(shade);
  return g;
}
const HEAP_SHADOW = share(new THREE.MeshBasicMaterial({ color: 0x3b4d66, transparent: true, opacity: 0.28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }));
const HEAP_CHUNK_DARK = share(new THREE.MeshLambertMaterial({ color: 0xc9d6e6, emissive: 0x8fa3bb, emissiveIntensity: 0.35 }));
const HEAP_CREVICE = share(new THREE.LineBasicMaterial({ color: 0x4d6282 }));
const DRIFT_2SIDE = share(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xc4d2e2, emissiveIntensity: 0.45, side: THREE.DoubleSide }));
const DRIFT = share(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xc4d2e2, emissiveIntensity: 0.45 }));

/** A rock outcrop: two or three slabs breaking through, snow on their tops. */
function outcrop(rand: Rand) {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const r = 0.9 + rand() * 0.8;
    const slab = drawn(new THREE.DodecahedronGeometry(r, 0), flat(k % 2 ? M.rockDark : M.rock));
    slab.scale.set(1, 0.9 + rand() * 0.6, 0.8);
    slab.position.set((rand() - 0.5) * 2, r * 0.4, (rand() - 0.5) * 1.6);
    slab.rotation.set(rand(), rand() * 6, rand() * 0.4);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
    cap.scale.set(1, 0.3, 0.9);
    cap.position.set(slab.position.x, slab.position.y + r * 0.75, slab.position.z);
    g.add(slab, cap);
  }
  return g;
}

/** A frozen pond, a rim of snow round it, and two gnomes skating in circles. */
function frozenPond(x: number, y: number, z: number, rand: Rand) {
  const g = new THREE.Group();
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.08, 28), new THREE.MeshPhongMaterial({ color: 0xbfe6f4, emissive: 0x7fbcd8, emissiveIntensity: 0.3, shininess: 100, specular: 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
  ice.scale.z = 0.6;
  ice.position.set(x, y + 0.09, z); // its top 0.13 up: clear of the snow sheet
  const rim = drawn(new THREE.TorusGeometry(2.85, 0.28, 6, 28), SNOW);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1, 0.6, 0.6);
  rim.position.set(x, y + 0.05, z);
  g.add(ice, rim);
  const set = instances(gnomelet(rand), 2), p = new THREE.Vector3(), e = new THREE.Euler();
  g.add(set.group);
  animate((t) => {
    for (let k = 0; k < 2; k++) {
      const a = t * (0.6 + k * 0.25) + k * 3;
      p.set(x + Math.cos(a) * (1.4 + k * 0.6), y + 0.08, z + Math.sin(a) * (0.8 + k * 0.3));
      e.set(0, -a, 0);
      set.set(k, p, e);
    }
    set.done();
  });
  return g;
}

/** A snow fence: a short run of pickets, half buried, snow along its top. */
function snowFence(rand: Rand) {
  const g = new THREE.Group();
  const n = 5 + Math.floor(rand() * 3);
  for (let k = 0; k < n; k++) {
    const p = drawn(rbox(0.12, 0.7, 0.08, 0.03), flat(M.wood));
    p.position.set((k - n / 2) * 0.45, 0.3, 0);
    p.rotation.z = (rand() - 0.5) * 0.15;
    g.add(p);
  }
  const bank = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
  bank.scale.set(n * 0.26, 0.28, 0.45);
  bank.position.set(0, 0, 0.25);
  g.add(bank);
  return g;
}

/** Ski tracks and footprints across the front snow, where no one stands. */
function tracks(rand: Rand, X0: number, X1: number, z0: number, z1: number, W: number, gaps: readonly (readonly [number, number])[] = []) {
  const inGap = (x: number) => gaps.some(([a, b]) => x > a - 0.4 && x < b + 0.4);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: M.shadow, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  for (let t = 0; t < 2; t++) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(X0 + ((X1 - X0) * k) / 8, 0, z0 + 1.5 + t * 3 + Math.sin(k * 1.1 + t) * 1.2));
    // sampled, and cut into runs where the track meets a crack: it stops at
    // the edge and goes on past the far side
    const c = new THREE.CatmullRomCurve3(pts), runs: THREE.Vector3[][] = [[]];
    for (let k = 0; k <= 120; k++) {
      const p = c.getPoint(k / 120);
      if (inGap(p.x)) { if (runs[runs.length - 1].length) runs.push([]); continue; }
      runs[runs.length - 1].push(p);
    }
    for (const run of runs) {
      if (run.length < 2) continue;
      const rc = new THREE.CatmullRomCurve3(run);
      for (const off of [-0.18, 0.18]) {
        const line = new THREE.Mesh(new THREE.TubeGeometry(rc, Math.max(4, run.length), 0.05, 3, false), mat);
        line.scale.y = 0.2;
        line.position.set(0, GRASS + 0.06, off);
        g.add(line);
      }
    }
  }
  // a line of footprints wandering off toward the pond
  for (let k = 0; k < 16; k++) {
    if (inGap(W * 0.55 - k * 0.7)) continue;
    const f = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), mat);
    f.rotation.x = -Math.PI / 2;
    f.scale.y = 1.6;
    f.position.set(W * 0.55 - k * 0.7, GRASS + 0.06, z1 - 1 - k * 0.12 + (k % 2) * 0.28);
    g.add(f);
  }
  return g;
}

/** A ski jump far off on the slope: an inrun on stilts and its take-off. */
function skiJump() {
  const g = new THREE.Group();
  const ramp = drawn(rbox(1.2, 0.2, 7, 0.05), SNOW);
  ramp.position.set(0, 3.2, 0);
  ramp.rotation.x = -0.5;
  g.add(ramp);
  for (const z of [-2.8, 0, 2.6]) {
    const leg = drawn(rbox(0.14, 4.6 - (z + 2.8) * 0.6, 0.14, 0.04), flat(M.woodDark));
    leg.position.set(0, (4.6 - (z + 2.8) * 0.6) / 2, z);
    g.add(leg);
  }
  const lip = drawn(rbox(1.3, 0.3, 0.6, 0.05), flat(M.roof));
  lip.position.set(0, 1.5, 3.3);
  g.add(lip);
  return g;
}

/**
 * Over the lane: arches of ice spanning it from rim to rim, with icicles
 * hanging from them and a glint running along; they fade where they come
 * between the camera and the ball.
 */
const ICE = share(new THREE.MeshPhongMaterial({ color: 0xcfeefa, emissive: 0x6fb4d6, emissiveIntensity: 0.35, shininess: 90, specular: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false }));
const FROST = share(new THREE.MeshPhongMaterial({ color: 0xf2fbff, emissive: 0xbfe0f0, emissiveIntensity: 0.4, shininess: 40 }));

/** Which canopy a hole gets: ice arches on some, leaning pines on others. */
const canopyOf = (s: Hole) => {
  if ((s.walls || []).some((w) => w.skin === "lift")) return "none"; // the lift lines are the lane's overhead
  let h = 0;
  for (const ch of String(s.hole)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 2 ? "arches" : "pines";
};

/**
 * Over the lane, one of two canopies. Ice arches: translucent pale blue with
 * a bright frosted rim, thick frost at the feet, icicles and a glint now and
 * then. Or pines rooted behind the lane, their trunks curving out over it and
 * their snow-laden crowns drooping above the green. Both fade where they come
 * between the camera and the ball.
 */
function canopy(s: Hole, rand: Rand) {
  const g = new THREE.Group();
  const faders: FadeItem[] = [], sparks: { m: THREE.Sprite; ph: number }[] = [];
  if (canopyOf(s) === "arches")
    for (const { x, z: zc, r } of archSpots(s).slice(0, 2)) {
      const a = new THREE.Group();
      a.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.3, 10, 32, Math.PI), ICE)); // no ink hull: seen through the ice it reads as a dark pipe
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r + 0.24, 0.07, 6, 32, Math.PI), FROST);
      a.add(rim);
      for (const side of [-1, 1]) {
        // frost thick at each foot, where the arch meets the snow
        const foot = drawn(new THREE.SphereGeometry(0.62, 10, 8), FROST);
        foot.scale.set(1, 0.85, 1);
        foot.position.set(side * r, 0.2, 0);
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.1, 10), ICE);
        collar.position.set(side * r, 0.7, 0);
        a.add(foot, collar);
      }
      for (let k = 1; k < 12; k++) {
        const th = (k / 12) * Math.PI, ic = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35 + rand() * 0.6, 5), ICE);
        ic.rotation.x = Math.PI;
        ic.position.set(Math.cos(th) * r, Math.sin(th) * r - 0.45, 0);
        a.add(ic);
      }
      for (let k = 0; k < 3; k++) {
        const th = (0.2 + rand() * 0.6) * Math.PI;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: undefined, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
        sp.scale.set(0.35, 0.35, 1);
        sp.position.set(Math.cos(th) * (r + 0.3), Math.sin(th) * (r + 0.3), 0.1);
        a.add(sp);
        sparks.push({ m: sp, ph: rand() * 6 });
      }
      compact(a);
      a.position.set(x, GRASS, zc);
      a.rotation.y = Math.PI / 2; // across the lane
      g.add(a);
      const mats = ownFade(a);
      for (const u of [0.03, 0.2, 0.5, 0.8, 0.97]) faders.push({ at: new THREE.Vector3(x, GRASS + Math.sin(u * Math.PI) * r, zc + Math.cos(u * Math.PI) * r), r: 2.4, mats });
    }
  else if (canopyOf(s) === "pines")
    for (const x of pineSpots(s)) {
      const piv = new THREE.Group();
      // the trunk leans out over the lane in one gentle arc (no hook at the
      // top: a snow-laden fir is stiff)
      const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.6, 0.35), new THREE.Vector3(0.2, 4.8, 2.0), new THREE.Vector3(0.3, 6.4, 3.6));
      piv.add(drawn(new THREE.TubeGeometry(curve, 16, 0.22, 7, false), flat(M.bark)));
      const top = curve.getPoint(1);
      // a crown of tiers stacked on the trunk's top, each under its snow,
      // drooping a little toward the lane (not stepped back: that sheared it)
      for (let k = 0; k < 4; k++) {
        const tier = new THREE.Group();
        const rr = 1.9 - k * 0.35, hh = 1.1;
        const cone = drawn(new THREE.ConeGeometry(rr, hh, 8), flat(k % 2 ? M.pineDark : M.pine));
        const snow = new THREE.Mesh(new THREE.ConeGeometry(rr * 0.8, hh * 0.5, 8), SNOW);
        snow.position.y = hh * 0.3;
        tier.add(cone, snow);
        tier.position.set(top.x, top.y - 0.9 + k * 0.62, top.z);
        tier.rotation.x = 0.15; // drooping toward the lane
        piv.add(tier);
      }
      compact(piv);
      piv.position.set(x, GRASS, -2.4);
      g.add(piv);
      const mats = ownFade(piv);
      for (const p of [curve.getPoint(0.7), top]) faders.push({ at: p.clone().add(piv.position), r: 2.4, mats });
      animate((t) => (piv.rotation.z = Math.sin(t * 0.5 + x) * 0.02));
    }
  ud(g).fade = fadeLoop(faders); // (ice stays see-through: its base level, times the fade)
  animate((t) => sparks.forEach((sp) => (sp.m.material.opacity = Math.max(0, Math.sin(t * 2.3 + sp.ph)) ** 6, (sp.m.visible = sp.m.material.opacity > 0.01))));
  return g;
}

/** Where a leaning pine may root behind the lane: two, clear of the tee and
 *  the cup, whose crowns would hang over the ball as it starts or ends. */
function pineSpots(s: Hole) {
  const W = s.board.w;
  return [0.32, 0.68].map((u) => W * u).filter((x) => Math.abs(x - s.start[0]) > 5 && Math.abs(x - s.cup[0]) > 5);
}

/** Where an ice arch may span the lane: clear of every piece on it, the tee
 *  and the cup — up to three, a quarter of the board apart. */
function archSpots(s: Hole) {
  const W = s.board.w, all = new Set(["wind", "rain", "fog", "storm", "sea", "roof"]);
  const clear = (x: number) =>
    Math.abs(x - s.start[0]) > 3 && Math.abs(x - s.cup[0]) > 3 &&
    s.zones.every((z) => all.has(z.skin) || z.max[0] < x - 1.5 || z.min[0] > x + 1.5) &&
    s.posts.every((p) => Math.abs(p.c[0] - x) > p.r + 1.2) &&
    s.walls.every((w) => !w.every || Math.min(Math.abs(w.a[0] - x), Math.abs(w.b[0] - x)) > 2.5);
  // the lane's edges at x: the walls crossing that line (a curved lane is
  // far narrower than its board). An arch spans that, feet just outside.
  const span = (x: number) => {
    let lo = Infinity, hi = -Infinity;
    for (const w of s.walls) {
      if (w.every) continue;
      const [ax, az] = w.a, [bx, bz] = w.b;
      if ((ax - x) * (bx - x) > 0) continue;
      const z = ax === bx ? Math.min(az, bz) : az + ((x - ax) / (bx - ax)) * (bz - az);
      const z2 = ax === bx ? Math.max(az, bz) : z;
      lo = Math.min(lo, z, z2);
      hi = Math.max(hi, z, z2);
    }
    return hi > lo ? { z: (lo + hi) / 2, r: (hi - lo) / 2 + 1.35 } : null; // feet clear of the kerb
  };
  const fixed = s.walls.filter((w) => !w.every);
  const toWall = (x: number, z: number) => wallDist(x, z, fixed);
  const feetClear = (x: number, sp: { z: number; r: number }) => {
    for (let k = 0; k < 4; k++, sp.r += 0.35) if (toWall(x, sp.z - sp.r) > 1 && toWall(x, sp.z + sp.r) > 1) return true;
    return false;
  };
  const out: { x: number; z: number; r: number }[] = [];
  for (let u = 0.2; u <= 0.86 && out.length < 3; u += 0.04) {
    const x = W * u, sp = span(x);
    if (sp && !feetClear(x, sp)) continue; // a foot would stand on a kerb
    if (!sp || sp.r > 6 || !clear(x)) continue; // too wide an arch would stand across the view
    if (out.every((o) => Math.abs(o.x - x) > W * 0.25)) out.push({ x, ...sp });
  }
  return out;
}

// ------------------------------------------------------------------- decor

function decor(s: Hole, bank: Height = () => 0) {
  const g = new THREE.Group();
  const W = s.board.w, H = s.board.h;
  const rand = seeded("mountain" + s.name + s.hole);
  const X0 = -ISLAND.x + 0.8, X1 = W + ISLAND.x - 0.8;
  const Z0 = -ISLAND.back + 0.8, Z1 = H + ISLAND.front - 0.6;
  const night = timeOf(s.hole) !== "day";

  const { free, reserve } = placer();
  const onBoard = (x: number, z: number, r: number) => x > -0.8 - r && x < W + 0.8 + r && z > -0.8 - r && z < H + 0.8 + r;
  const nearWall = (x: number, z: number, r: number) => (s.walls || []).some((w) => segDist(x, z, w.a, w.b) < r + 0.6);
  const place = <T extends THREE.Object3D>(m: T, x: number, z: number, r: number, rot = 0) => {
    if (!free(x, z, r) || onBoard(x, z, r) || nearWall(x, z, r) || z + r > Z1 + CLIFF - 1) return null; // not over the cliff
    m.position.set(x, GRASS + bank(x, z) - 0.05, z);
    m.rotation.y = rot;
    g.add(m);
    reserve(x, z, r);
    return m;
  };
  // the crack, wherever it runs
  for (const [a, b] of crevasses(s)) for (let z = Z0 - 30; z < Z1 + CLIFF; z += 1) reserve((a + b) / 2, z, (b - a) / 2 + 0.8);
  // the edging's rocks (edging is built on its own): decor keeps off them
  for (const { x, z } of edgeRocks(W, H, s.hole)) reserve(x, z, 0.8);
  // the lane lift's stations (mountain8), before the groves take the room
  {
    const L = liftPlan(s);
    if (L) for (const x of [L.xA - 1.3, L.xB + 1.3]) for (const z of [L.zc - L.half - 1.1, L.zc + L.half + 1.1]) reserve(x, z, 1.8);
  }
  // the canopy's roots and feet, before anything else takes the room
  if (canopyOf(s) === "arches") for (const a of archSpots(s).slice(0, 2)) for (const z of [a.z - a.r, a.z + a.r]) reserve(a.x, z, 0.8);
  else if (canopyOf(s) === "pines") for (const x of pineSpots(s)) reserve(x, -2.4, 1.2);

  // the chair lift up the slope behind, on the left
  {
    const la = new THREE.Vector3(X0 + 1, 0, -4.2), lb = new THREE.Vector3(X0 + 7, 0, -20);
    g.add(chairLift(la, lb, 3, 10, (x, z) => GRASS + bank(x, z), night));
    for (let k = 0; k <= 3; k++) reserve(la.x + ((lb.x - la.x) * k) / 3, la.z + ((lb.z - la.z) * k) / 3, 1.2);
    reserve(la.x, la.z + 1.4, 1.6);
  }

  // behind, big things: the chalet right of centre, the frozen fall at the
  // back right, a forest of pines
  place(chalet(night, true), X0 + (X1 - X0) * 0.72, -6.4, 2.8, -0.15) || place(chalet(night, true), X1 - 3.4, -6.4, 2.8);
  place(frozenFall(), X1 - 2.5, -8.5, 3.4, -0.3);
  for (let i = 0; i < Math.round((X1 - X0) / 2.2); i++) {
    const x = X0 + rand() * (X1 - X0), z = -3.6 - rand() * 6;
    const p = pine(rand, 0.8 + rand() * 0.5);
    place(p.g, x, z, p.r, rand() * 6);
  }
  // down the right: more pines, a woodpile by the chalet
  for (let z = -1; z < H + 2; z += 2.4 + rand() * 1.5) {
    const p = pine(rand, 0.7 + rand() * 0.4);
    place(p.g, W + 2.6 + rand() * 3, z, p.r, rand() * 6);
  }
  // prayer flags across the back
  g.add(bunting(new THREE.Vector3(X0 + 3, GRASS + bank(X0 + 3, -3.2), -3.2), new THREE.Vector3(X1 - 4, GRASS + bank(X1 - 4, -3.2), -3.2)));
  for (let x = X0 + 3; x < X1 - 4; x += 1.2) reserve(x, -3.2, 0.25);

  // the left and the front: only low things — a snowman, skis, sledges,
  // gnomes, snowdrifts; nothing that would stand between the camera and the lane
  place(snowman(), -3.4, H * 0.5, 0.8, 0.4);
  for (let i = 0; i < 4; i++) place(skis(rand), X0 + rand() * (X1 - X0), H + 1.8 + rand() * 1.4, 0.5, (rand() - 0.5) * 0.6);
  for (let i = 0; i < 3; i++) place(sledge(), X0 + rand() * (X1 - X0), H + 2 + rand() * 1.2, 0.9, rand() * 6);
  for (let i = 0; i < 5; i++) place(gnomelet(rand), X0 + rand() * (X1 - X0), rand() < 0.5 ? H + 2.2 + rand() : -3 - rand(), 0.35, rand() * 6);
  for (let i = 0; i < 6; i++) {
    const st = stone(rand);
    st.scale.multiplyScalar(0.7);
    place(st, X0 + rand() * (X1 - X0), rand() < 0.5 ? H + 1.6 + rand() * 2 : -1.8 - rand() * 1.5, 0.6, rand() * 6);
  }
  // gnomes skiing down the slope behind, on a long S
  // (on the left, down to the back corner of the board: small, and clear of the peaks)
  const piste = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X0 + 2, 0, -13),
    new THREE.Vector3(X0 + 9, 0, -10),
    new THREE.Vector3(X0 + 3, 0, -6.5),
    new THREE.Vector3(X0 + 10, 0, -3.8),
  ]);
  if (timeOf(s.hole) === "night") rand(); // the skiers have gone home (their one draw kept, so the rest stays put)
  else g.add(skiers(rand, piste, bank, 3));

  // the snow field, filled like the town is: all of it low in front of the
  // lane, taller only behind and at the far sides
  const front0 = H + 2, front1 = H + CLIFF + ISLAND.front - 1.5;
  // a frozen pond with gnomes skating on it, front left
  const pondAt: MutVec2 = [X0 + (X1 - X0) * 0.2, (front0 + front1) / 2 + 0.5];
  if (free(pondAt[0], pondAt[1], 3.2)) {
    g.add(frozenPond(pondAt[0], GRASS + bank(...pondAt), pondAt[1], rand));
    reserve(pondAt[0], pondAt[1], 3.2);
  }
  // drifts with blue shadows on their lee side, and boulders
  // the wind blows the same way over the whole shelf: every drift faces it
  const wind = rand() * 0.6 - 0.3;
  for (let i = 0; i < 10; i++) {
    const x = X0 - 4 + rand() * (X1 - X0 + 8), z = rand() < 0.5 ? front0 + rand() * (front1 - front0) : -4 - rand() * 8;
    place(drift(rand), x, z, 2.3, wind + (rand() - 0.5) * 0.3);
  }
  for (let i = 0; i < 7; i++) {
    const b = drawn(new THREE.DodecahedronGeometry(0.5 + rand() * 0.6, 0), flat(rand() < 0.5 ? M.rock : M.rockDark));
    b.scale.y = 0.6;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
    cap.scale.set(1.1, 0.35, 1.1);
    cap.position.y = 0.35;
    const grp = new THREE.Group();
    grp.add(b, cap);
    place(grp, X0 + rand() * (X1 - X0), front0 + rand() * (front1 - front0), 1, rand() * 6);
  }
  // rock outcrops breaking through at the far sides
  for (const side of [-1, 1])
    for (let i = 0; i < 2; i++) place(outcrop(rand), side < 0 ? X0 - 2 - rand() * 3 : X1 + 2 + rand() * 3, H * (0.1 + rand() * 0.8), 2.2, rand() * 6);
  // pine groves in clumps: at the back corners, and down both far sides
  const grove = (cx: number, cz: number, n: number, sc: number) => {
    for (let i = 0; i < n; i++) {
      const p = pine(rand, sc * (0.7 + rand() * 0.5));
      place(p.g, cx + (rand() - 0.5) * 5, cz + (rand() - 0.5) * 4, p.r, rand() * 6);
    }
  };
  grove(X0 - 3, -2, 6, 0.9);
  grove(X1 + 4, H * 0.5, 6, 0.9);
  grove(X0 - 5, H + 4, 4, 0.6); // front corners: small ones only
  grove(X1 + 5, H + 5, 4, 0.6);
  // snow fences half buried along the front, ski tracks and footprints
  for (let x = X0 + 4; x < X1 - 6; x += 11 + rand() * 6) place(snowFence(rand), x, front0 + 1 + rand() * 2, 1.8, (rand() - 0.5) * 0.4);
  g.add(tracks(rand, X0, X1, front0, front1, W, crevasses(s)));
  // a ski jump far off on the slope behind, left of centre
  place(skiJump(), X0 + (X1 - X0) * 0.36, -11, 2.5, 0);

  g.add(cableCar(W));
  g.add(bobsleigh(X0, X1, H, bank, reserve));
  // the ski lift (mountain8): a line of its own across the lane at each bar
  if ((s.walls || []).some((w) => w.skin === "lift")) g.add(liftLines(s, night, reserve));
  g.add(eagles(W, H));
  g.add(snowfall(W, H));
  const over = canopy(s, rand);
  g.add(over);
  ud(g).fade = ud(over).fade;
  // in snow or storm the skiers ski on; in fog the chalet lights up
  weatherLooks(g, (w) => (w.fog ? "fog" : "clear"));
  return g;
}

/** The board's rough in the mountains: flat snow, a rock now and then. */
const rough = {
  lo: 0xdde7f1, hi: 0xf7fafd, mound: 0,
  plant: (rand: Rand) => {
    if (rand() < 0.7) return new THREE.Group(); // bare snow, mostly
    const st = stone(rand);
    st.scale.multiplyScalar(0.6);
    return st;
  },
};

// the board itself, in the mountains: grey stone kerbs with log posts, the
// lane groomed piste in two white stripes, no ink along its edge (on snow
// the line reads as a crack)
const kerb = { color: 0x9aa6b4, post: 0x8a5a33 };
const green: readonly [number, number] = [0xeaf4ff, 0xd8e7f8]; // a little blue: the warm light turns plain white beige
const edgeInk = false;

/**
 * The stroke's pieces this world draws itself (for course.js buildExtras):
 * an avalanche heap is a slide of snow poured from the slope beside the lane
 * onto the bar's footprint; "avalanche-warn" (a zone the chain puts where the
 * next stroke's heap will fall) is snowballs rolling down that slope and puffs
 * of loose snow. Returns the group, and the skins it drew, which course.js
 * then skips.
 */
function extras(ex: Extras, s: Hole, t: Terrain) {
  const g = new THREE.Group();
  ud(g).live = true;
  const height = (x: number, z: number) => (t && t.height ? t.height(x, z) : 0);
  // walls of the lane itself: the slide comes over the one nearest a bar's end
  const walls = (s.walls || []).filter((w) => !w.every);
  const toWall = (x: number, z: number) => wallDist(x, z, walls);
  // a bar (4 walls) or a box as: its centre line, the end at the lane's edge, the way out
  const pieceOf = (ends: readonly [Vec2, Vec2], thick: number): Slide => {
    let [a, b] = ends;
    if (toWall(b[0], b[1]) < toWall(a[0], a[1])) [a, b] = [b, a]; // a: the end against the kerb
    const dx = a[0] - b[0], dz = a[1] - b[1], l = Math.hypot(dx, dz) || 1;
    return { a, b, out: [dx / l, dz / l], len: l, thick };
  };
  const bars: Slide[] = [];
  const av = (ex.walls || []).filter((w) => w.skin === "avalanche");
  for (let k = 0; k + 3 < av.length; k += 4) {
    // physics.Bar: the long sides are walls 0 and 2; the centre line joins their midpoints' ends
    const ws = av.slice(k, k + 4), pts = ws.flatMap((w) => [w.a, w.b]);
    let best: Vec2[] = [pts[0], pts[1]], far = 0;
    for (const p of pts) for (const q of pts) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d > far) (far = d), (best = [p, q]); }
    const cx = pts.reduce((m, p) => m + p[0], 0) / pts.length, cz = pts.reduce((m, p) => m + p[1], 0) / pts.length;
    // the axis: through the centre along the longest diagonal's direction
    const dx = best[1][0] - best[0][0], dz = best[1][1] - best[0][1], l = Math.hypot(dx, dz) || 1;
    const half = Math.max(...pts.map((p) => Math.abs((p[0] - cx) * dx / l + (p[1] - cz) * dz / l)));
    const thick = Math.max(...pts.map((p) => Math.abs(-(p[0] - cx) * dz / l + (p[1] - cz) * dx / l))) * 2;
    bars.push(pieceOf([[cx - (dx / l) * half, cz - (dz / l) * half], [cx + (dx / l) * half, cz + (dz / l) * half]], thick));
  }
  const warns = (ex.zones || []).filter((z) => z.skin === "avalanche-warn").map((z) => {
    const w = z.max[0] - z.min[0], h = z.max[1] - z.min[1], cx = (z.min[0] + z.max[0]) / 2, cz = (z.min[1] + z.max[1]) / 2;
    const along = w >= h;
    return pieceOf(along ? [[z.min[0], cz], [z.max[0], cz]] : [[cx, z.min[1]], [cx, z.max[1]]], along ? h : w);
  });

  // the ground as drawn: the board's own inside it, the world's snow outside
  const W = s.board.w, H = s.board.h;
  const ground = (x: number, z: number) => (x >= 0 && x <= W && z >= 0 && z <= H ? height(x, z) : GRASS + snowAt(W, H, x, z));
  const clear = (x: number, z: number, r: number) => toWall(x, z) > r && (s.posts || []).every((p) => Math.hypot(p.c[0] - x, p.c[1] - z) > p.r + r);
  // where the slide meets the lane: just past the kerb's outer face (its posts too)
  const offLane = (b: Slide) => {
    let d = 0;
    while (d < 4 && t.onGreen && t.onGreen(b.a[0] + b.out[0] * d, b.a[1] + b.out[1] * d)) d += 0.1;
    return d + 0.75;
  };
  const downOf = (b: Slide) => {
    const cx = (b.a[0] + b.b[0]) / 2, cz = (b.a[1] + b.b[1]) / 2;
    const sl = (s.zones || []).find((q) => q.kind === "slope" && !q.every && (q.vec[0] || q.vec[1]) && inZone(q, cx, cz));
    if (!sl) return 0;
    // across the bar: the normal to its axis, signed towards the push
    const nx = -b.out[1], nz = b.out[0], d = sl.vec[0] * nx + sl.vec[1] * nz;
    return Math.abs(d) < 1e-6 ? 0 : Math.sign(d);
  };
  for (const b of bars) g.add(heap(b, height, ground, clear, offLane(b), downOf(b)));
  for (const w of warns) g.add(warning(w, ground, offLane(w)));
  return { group: g, skins: new Set(["avalanche", "avalanche-warn"]) };
}

/** The heap: lumps of snow along the bar, and the slide it came down. */
const M_SHADE = 0xa9bfd8; // the drifts' shadow blue, for the slide's flank
const HEAP_BASE = 0x7d93b0; // the heap's shadowed base: darker, so it stands off the piste

/** A bar, or a warning's box, as the slide sees it: its centre line a→b (a against the kerb), the way out, its length and thickness. */
interface Slide {
  a: Vec2;
  b: Vec2;
  out: MutVec2;
  len: number;
  thick: number;
}

function heap(b: Slide, height: Height, ground: Height, clear: (x: number, z: number, r: number) => boolean, start: number, down = 0) {
  const g = new THREE.Group();
  const rand = seeded("heap" + b.a[0].toFixed(1) + b.a[1].toFixed(1));
  // the heap on the wall's own footprint: lumps along the bar, never wider
  // than it on the side the ball comes from. Where the lane runs downhill
  // across the bar (down = ±1 along the bar's normal), the snow may spill
  // past the wall on the downhill side only: the uphill face, the one a
  // stopped ball rests against, is the wall's own line.
  const nx = -b.out[1], nz = b.out[0]; // across the bar
  const half = b.thick / 2, spill = down ? 0.5 : 0;
  // one continuous mound along the bar, lofted: across it from the uphill
  // face (steep, on the wall's line) over a lumpy crest to the downhill side
  // (where it may spill a little past the wall); deeper at the kerb end
  const NH = Math.max(12, Math.ceil(b.len / 0.25)), P = 12, hpos: number[] = [], hcol: number[] = [], hidx: number[] = [];
  const hw = new THREE.Color(0xf6f9fc), hs = new THREE.Color(HEAP_BASE);
  const lo = down ? -down * half : -half, hi = down ? down * (half + spill) : half; // across, uphill → downhill
  for (let k = 0; k <= NH; k++) {
    const u = k / NH, x0 = b.b[0] + (b.a[0] - b.b[0]) * u, z0 = b.b[1] + (b.a[1] - b.b[1]) * u;
    const end = Math.min(1, Math.min(u, 1 - u) * b.len / 0.6); // rounded off at both ends
    const top = (0.85 + 0.35 * u) * (0.85 + 0.15 * Math.sin(u * 17.3) + 0.08 * Math.sin(u * 41)) * Math.sqrt(end);
    for (let m = 0; m <= P; m++) {
      const v = m / P, a = lo + (hi - lo) * v; // across offset, signed
      // steep face at v = 0 (uphill), long spill to v = 1
      const f = down ? Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.6) / 2), 0.4) * (1 - Math.pow(Math.max(0, (v - 0.35) / 0.65), 1.6)) : Math.pow(Math.sin(Math.PI * v), 0.55);
      const x = x0 + nx * a, z = z0 + nz * a;
      hpos.push(x, height(x0, z0) + top * f - 0.03, z);
      // a blue-grey shadowed base and lower flank, the crest white: it reads
      // as a heap on the pale piste even from far off
      const c = hw.clone().lerp(hs, Math.min(1, 0.95 * Math.pow(1 - f, 0.7) + (down ? 0.25 * v : 0.1)));
      hcol.push(c.r, c.g, c.b);
    }
    if (k) for (let m = 0; m < P; m++) {
      const a0 = (k - 1) * (P + 1) + m, b0 = k * (P + 1) + m;
      hidx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute(hpos, 3));
  mg.setAttribute("color", new THREE.Float32BufferAttribute(hcol, 3));
  mg.setIndex(hidx);
  mg.computeVertexNormals();
  g.add(drawn(mg, DRIFT_2SIDE)); // inked like every piece on the lane
  // the slide it came down: a tongue of snow lying on the ground beyond the
  // kerb, from its outer face out up the slope, lumpy on top and thinning at
  // its edges, shaded like the drifts; nothing of it where a wall or a post is
  const len = 5, N = 16, M = 8, [ox, oz] = b.out, sx = -oz, sz = ox, pos: number[] = [], col: number[] = [], idx: number[] = [], ok: boolean[] = [];
  const white = new THREE.Color(0xf6f9fc), blue = new THREE.Color(M_SHADE);
  for (let k = 0; k <= N; k++)
    for (let m = 0; m <= M; m++) {
      const u = k / N, v = (m / M) * 2 - 1, w = b.thick * (0.6 + u * 0.8);
      const x = b.a[0] + ox * (start + u * len) + sx * v * w, z = b.a[1] + oz * (start + u * len) + sz * v * w;
      const lump = 0.12 + 0.08 * Math.sin(x * 3.1 + z * 2.3) * Math.cos(z * 2.7 - x * 1.3);
      const depth = (0.18 + 0.32 * (1 - u)) * (1 - v * v) + lump * (1 - v * v);
      pos.push(x, ground(x, z) + depth - 0.02, z);
      const c = white.clone().lerp(blue, 0.15 + 0.45 * Math.max(0, v)); // one flank in shadow
      col.push(c.r, c.g, c.b);
      ok.push(clear(x, z, 0.35));
    }
  for (let k = 0; k < N; k++)
    for (let m = 0; m < M; m++) {
      const a0 = k * (M + 1) + m, a1 = a0 + 1, b0 = a0 + M + 1, b1 = b0 + 1;
      if (ok[a0] && ok[a1] && ok[b0] && ok[b1]) idx.push(a0, b0, a1, a1, b0, b1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, DRIFT));
  // blocks tumbled along the slide, resting on it
  for (let k = 0; k < 4; k++) {
    const u = 0.15 + k * 0.22, x = b.a[0] + ox * (start + u * len) + sx * (rand() - 0.5) * b.thick, z = b.a[1] + oz * (start + u * len) + sz * (rand() - 0.5) * b.thick;
    if (!clear(x, z, 0.6)) continue;
    const blk = drawn(new THREE.DodecahedronGeometry(0.22 + rand() * 0.16, 0), SNOW);
    blk.position.set(x, ground(x, z) + 0.45 * (1 - u) + 0.3, z);
    blk.rotation.set(rand(), rand(), rand());
    g.add(blk);
  }
  // its cast shadow on the lane, on the side away from the light (+z, and
  // the downhill side where there is one): a soft dark band just past its foot
  {
    const sp: number[] = [], si: number[] = [], NS = 16;
    const side = down || 1, from = side * half, to = side * (half + spill + 0.55);
    for (let k = 0; k <= NS; k++) {
      const u = k / NS, x0 = b.b[0] + (b.a[0] - b.b[0]) * u, z0 = b.b[1] + (b.a[1] - b.b[1]) * u;
      for (const a of [from, to]) { const x = x0 + nx * a, z = z0 + nz * a; sp.push(x, height(x, z) + 0.05, z); }
      if (k) si.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    sg.setIndex(si);
    g.add(new THREE.Mesh(sg, HEAP_SHADOW));
  }
  // broken chunks along the crest, inked, with dark crevices between them
  const crev: THREE.Vector3[] = [];
  for (let k = 0; k < Math.max(6, Math.round(b.len / 1.1)); k++) {
    const u = (k + 0.3 + rand() * 0.4) / Math.max(6, Math.round(b.len / 1.1)), off = (down ? down * 0.2 : 0) + (rand() - 0.5) * half * 0.6;
    const x = b.b[0] + (b.a[0] - b.b[0]) * u + nx * off, z = b.b[1] + (b.a[1] - b.b[1]) * u + nz * off;
    const r = 0.26 + rand() * 0.18;
    const blk = drawn(new THREE.DodecahedronGeometry(r, 0), rand() < 0.35 ? HEAP_CHUNK_DARK : SNOW);
    blk.scale.set(1, 0.75, 1.15);
    blk.position.set(x, height(x, z) + (0.85 + 0.35 * u) * 0.8 + r * 0.2, z);
    blk.rotation.set(rand(), rand() * 6, rand());
    g.add(blk);
    // a crevice: a short dark crack down the flank next to it
    const cx = x - nx * 0.05 * (down || 1), cz = z - nz * 0.05 * (down || 1);
    for (const a of [-half * 0.1, -half * 0.85]) {
      const px = cx + nx * a * (down ? -down : 1), pz = cz + nz * a * (down ? -down : 1);
      crev.push(new THREE.Vector3(px, height(px, pz) + 0.15 + (a > -half * 0.5 ? 0.75 : 0.1), pz));
    }
  }
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crev), HEAP_CREVICE));
  return g;
}

/** The warning: snowballs rolling down the slope toward that stretch. */
function warning(w: Slide, ground: Height, start: number) {
  const g = new THREE.Group();
  const [ox, oz] = w.out, len = 5;
  const balls: { ball: THREE.Group; r: number; ph: number; side: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const r = 0.32 + k * 0.08; // big enough to read from the whole-course view
    const ball = drawn(new THREE.SphereGeometry(r, 10, 8), SNOW);
    ud(ball).live = true;
    g.add(ball);
    balls.push({ ball, r, ph: k / 4, side: (k % 2 ? 1 : -1) * 0.4 * k });
  }
  // a cracked snow cornice up the slope, where it will break
  const lip = drawn(rbox(w.thick * 1.6, 0.3, 0.6, 0.12), SNOW);
  const lx = w.a[0] + ox * (start + len), lz = w.a[1] + oz * (start + len);
  lip.position.set(lx, ground(lx, lz) + 0.25, lz);
  lip.rotation.y = Math.atan2(-oz, ox) + Math.PI / 2;
  g.add(lip);
  animate((t) => balls.forEach((b) => {
    const u = (t * 0.35 + b.ph) % 1; // down the slope, to the kerb, and again
    const x = w.a[0] + ox * (start + len * (1 - u)) - oz * b.side, z = w.a[1] + oz * (start + len * (1 - u)) + ox * b.side;
    b.ball.position.set(x, ground(x, z) + b.r + Math.abs(Math.sin(u * 18)) * 0.12, z); // rolling down the snow
    b.ball.rotation.x = u * 20;
    b.ball.visible = u < 0.92; // gone before it reaches the kerb
  }));
  return g;
}

// --------------------------------------------------------- on-lane pieces
//
// What the mountain holes put on the lane, in the mountain's look, each on
// its physics footprint: a post's circle, a bar's box, a zone's shape.
// course.js and zones.js ask piece(kind, item, t, s) for every post, wall and
// zone; nothing back means "draw it the shared way".


/**
 * A skin laid over a zone's shape, on the ground as it is (a ramp rises, so
 * the skin does), a hair above it: col(x, z, h) gives each vertex its colour,
 * bump(x, z) a small lift (powder), and only what is inside the zone is kept.
 */
function overlay(z: Zone, t: Terrain, col: (x: number, z: number, h: number) => THREE.Color, bump: Height = () => 0, mat?: THREE.Material, lane = true, mask: ((x: number, z: number) => boolean) | null = null) {
  const [x0, z0] = z.min, [x1, z1] = z.max;
  const onLane = (x: number, zz: number) => !t.onGreen || t.onGreen(x, zz);
  // clipped to the lane only where the zone runs past the rails (a kicker
  // across the whole board); a zone inside the lane keeps its own clean edge
  let crosses = !!mask && lane; // a masked skin (powder) is always kept to the lane
  if (lane && !crosses) for (let k = 0; k < 64 && !crosses; k++) {
    const x = x0 + ((k % 8) + 0.5) * (x1 - x0) / 8, zz = z0 + (Math.floor(k / 8) + 0.5) * (z1 - z0) / 8;
    if (inZone(z, x, zz) && !onLane(x, zz)) crosses = true;
  }
  const n = Math.max(8, Math.ceil((x1 - x0) / 0.35)), m = Math.max(8, Math.ceil((z1 - z0) / 0.35));
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ax = (x1 - x0) / 2, az = (z1 - z0) / 2;
  const pos: number[] = [], cols: number[] = [], idx: number[] = [], keep: boolean[] = [];
  for (let j = 0; j <= m; j++)
    for (let i = 0; i <= n; i++) {
      let x = x0 + ((x1 - x0) * i) / n, zz = z0 + ((z1 - z0) * j) / m;
      if (z.round) {
        // a round zone: vertices outside the ellipse are pulled onto it, so
        // its edge is the ellipse and not cell steps
        const u = (x - cx) / ax, v = (zz - cz) / az, r = Math.hypot(u, v);
        if (r > 1) (x = cx + (u / r) * ax), (zz = cz + (v / r) * az);
      }
      const h = t.height(x, zz);
      pos.push(x, h + 0.035 + bump(x, zz), zz);
      const c = col(x, zz, h);
      cols.push(c.r, c.g, c.b);
      keep.push((!z.poly || inZone(z, x, zz)) && (!mask || mask(x, zz)));
    }
  for (let j = 0; j < m; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
      if (!(keep[a] && keep[b] && keep[d] && keep[e])) continue;
      if (crosses) {
        const qx = (pos[a * 3] + pos[e * 3]) / 2, qz = (pos[a * 3 + 2] + pos[e * 3 + 2]) / 2;
        if (!onLane(qx, qz)) continue;
      }
      idx.push(a, d, b, b, d, e);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat || new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xb8c8da, emissiveIntensity: 0.45, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
}

// snow in two tones by how high it lies: shading that follows a rise
const snowRise = (lo: number, hi: number, top: number) => (x: number, z: number, h: number) => new THREE.Color(lo).lerp(new THREE.Color(hi), Math.min(1, h / top));

/** A pine as a post: its trunk is the post's circle, its boughs high above. */
function pinePost(r: number, rand: Rand) {
  const p = pine(rand, 1.05);
  const trunk = drawn(new THREE.CylinderGeometry(r * 0.8, r, 1.3, 10), flat(M.bark));
  trunk.position.y = 0.65;
  p.g.add(trunk);
  return p.g;
}

/** A boulder: a squat rock filling the circle, snow on its top. */
function boulder(r: number, rand: Rand) {
  const g = new THREE.Group();
  const rock = drawn(new THREE.DodecahedronGeometry(r, 1), flat(rand() < 0.5 ? M.rock : M.rockDark));
  rock.scale.set(1, 0.72, 1);
  rock.position.y = r * 0.5;
  rock.rotation.y = rand() * 6;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(r * 0.82, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
  cap.scale.set(1, 0.36, 1);
  cap.position.y = r * 0.95;
  g.add(rock, cap);
  return g;
}

/** A snowman as a bumper: his bottom ball is the post, a scarf, a gnome hat. */
function snowmanPost(r: number) {
  const m = snowman();
  m.scale.setScalar(r / 0.7);
  const scarf = drawn(new THREE.TorusGeometry(0.4, 0.09, 6, 14), flat(C.cap));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.85;
  m.add(scarf);
  return m;
}

/** The chalet as a post: a timber house inside the circle, a snowy roof. */
function chaletPost(r: number, night: boolean) {
  const g = chalet(night);
  g.scale.setScalar((r * 1.3) / 4.2); // its body (4.2 wide) within the circle
  return g;
}

/** A door the ball rolls in by, or out of: a timber frame, dark inside. */
function doorway(out: boolean) {
  const g = new THREE.Group();
  const arch = drawn(new THREE.TorusGeometry(0.62, 0.13, 6, 14, Math.PI), flat(M.woodDark));
  arch.position.y = 0.8;
  for (const x of [-0.62, 0.62]) {
    const jamb = drawn(new THREE.CylinderGeometry(0.13, 0.13, 0.8, 6), flat(M.woodDark));
    jamb.position.set(x, 0.4, 0);
    g.add(jamb);
  }
  const dark = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: C.burrow }));
  dark.position.y = 0.8;
  const low = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), dark.material);
  low.position.y = 0.4;
  const snow = drawn(rbox(1.6, 0.14, 0.4, 0.06), SNOW);
  snow.position.y = 1.5;
  g.add(arch, dark, low, snow);
  if (out) {
    const leaf = drawn(rbox(0.6, 1.3, 0.08, 0.04), flat(M.wood));
    leaf.position.set(0.95, 0.65, 0.3);
    leaf.rotation.y = -1.1;
    g.add(leaf);
  }
  return g;
}

/** An ice cave's mouth: a dome of blue ice, a dark way in facing the ball. */
function iceCave(r: number) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), ICE_SOLID);
  dome.scale.y = 0.75;
  const snow = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 18, 6, 0, Math.PI * 2, 0, Math.PI / 5), SNOW);
  snow.scale.y = 0.75;
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x0f2a44 }));
  mouth.position.set(0, 0, r * 0.98);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 20), new THREE.MeshBasicMaterial({ color: 0x163a5a }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  g.add(dome, snow, mouth, floor);
  for (let k = 0; k < 7; k++) {
    const ic = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3 + (k % 3) * 0.12, 5), ICE_SOLID);
    ic.rotation.x = Math.PI;
    ic.position.set(-r * 0.55 + k * r * 0.18, r * 0.62 * Math.sin(Math.PI * (k / 6)) - 0.1, r * 0.98);
    g.add(ic);
  }
  return g;
}
const ICE_SOLID = share(new THREE.MeshPhongMaterial({ color: 0xbfe6f4, emissive: 0x6fb4d6, emissiveIntensity: 0.3, shininess: 90, specular: 0xffffff }));

/** Where a crevasse splits the lane, across it: the [x0, x1] of each. */
// (only one that crosses the whole board runs on into the mountain; one inside
// the lane, like mountain17's, stays the lane's)
const crevasses = (s: Hole) => (s.zones || []).filter((z) => z.skin === "crevasse" && z.min[1] <= 0.01 && z.max[1] >= s.board.h - 0.01).map((z): [number, number] => [z.min[0], z.max[0]]);

/** A chasm: ice walls going blue to black, jagged snow lips, mist deep down. */
function crevasse(z: Pick<Zone, "min" | "max">, t: { height: Height }, ends = false) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, D = -7, rand = seeded("crev" + z.min.join());
  // it runs across the lane: its long walls are the short sides' opposites
  const along = x1 - x0 < z1 - z0; // true: the crack runs along z
  const walls = along ? [[x0, 1], [x1, -1]] : [[z0, 1], [z1, -1]];
  const L = along ? z1 - z0 : x1 - x0;
  for (const [at, sgn] of walls) {
    // a wall with strata: pale ice at the lip down to deep navy, jagged
    const n = Math.ceil(L / 0.6), rows = 6, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= n; i++) {
        const u = (i / n - 0.5) * L, v = j / rows, jag = j && j < rows ? (rand() - 0.5) * 0.35 : 0;
        const x = along ? at + sgn * jag : (x0 + x1) / 2 + u, zz = along ? (z0 + z1) / 2 + u : at + sgn * jag;
        const top = t.height(x, zz) - 0.05, y = top + (D - top) * v;
        pos.push(x, y, zz);
        const c = new THREE.Color(0xd8f1fb).lerp(new THREE.Color(0x10243e), Math.pow(v, 0.7));
        col.push(c.r, c.g, c.b);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // the lip: one continuous rounded cornice along the edge, overhanging
    // the drop a little, with small icicles hanging under its overhang
    const n2 = Math.ceil(L / 0.25), P = 7, cpos: number[] = [], cidx: number[] = [];
    for (let k = 0; k <= n2; k++) {
      const u = (k / n2 - 0.5) * L;
      const ex = along ? at : (x0 + x1) / 2 + u, ez = along ? (z0 + z1) / 2 + u : at;
      const y = t.height(ex - (along ? sgn * 0.3 : 0), ez - (along ? 0 : sgn * 0.3));
      const wob = 1 + 0.12 * Math.sin(u * 2.3) + 0.08 * Math.sin(u * 5.1);
      for (let m = 0; m <= P; m++) {
        // a half-ellipse across the edge, from the land side over to the drop
        const a = Math.PI * (m / P), off = -Math.cos(a) * 0.32 * wob - 0.05, hgt = Math.sin(a) * 0.2 * wob;
        cpos.push(along ? at + sgn * off : ex, y + hgt - 0.03, along ? ez : at + sgn * off);
      }
      if (k) for (let m = 0; m < P; m++) {
        const a0 = (k - 1) * (P + 1) + m, b0 = k * (P + 1) + m;
        cidx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
      }
      if (k % 3 === 1) {
        const hang = 0.18 + rand() * 0.22;
        const ic = new THREE.Mesh(new THREE.ConeGeometry(0.035, hang, 5), ICE_SOLID);
        ic.rotation.x = Math.PI; // point down
        const o = sgn * (0.2 + rand() * 0.05); // under the overhang, on the drop's side
        ic.position.set(along ? at + o : ex, y - 0.04 - hang / 2, along ? ez : at + o);
        g.add(ic);
      }
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3));
    cg.setIndex(cidx);
    cg.computeVertexNormals();
    g.add(new THREE.Mesh(cg, share(SNOW_2SIDE)));
  }
  // its short ends too, where it stops inside the lane
  if (ends) {
    const sh = along ? [[z0, x0, x1], [z1, x0, x1]] : [[x0, z0, z1], [x1, z0, z1]];
    for (const [at, a0, a1] of sh) {
      const pos: number[] = [], col: number[] = [], idx: number[] = [], n = 4, rows = 6;
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= n; i++) {
          const u = a0 + ((a1 - a0) * i) / n, v = j / rows;
          const x = along ? u : at, zz = along ? at : u, top = t.height(x, zz) - 0.05;
          pos.push(x, top + (D - top) * v, zz);
          const c = new THREE.Color(0xd8f1fb).lerp(new THREE.Color(0x10243e), Math.pow(v, 0.7));
          col.push(c.r, c.g, c.b);
        }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < n; i++) {
          const a = j * (n + 1) + i;
          idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
        }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    }
  }
  // mist in the depth, and a dark floor
  const w = along ? x1 - x0 : L, d = along ? L : z1 - z0;
  for (const [y, op] of [[D + 0.4, 1], [D * 0.55, 0.35]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: op === 1 ? 0x0c1a2e : 0x9fc4de, transparent: op < 1, opacity: op, depthWrite: op === 1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    g.add(m);
  }
  return g;
}

/**
 * The cliff: a real drop. The board's ground is open over the zone (course.js
 * leaves no cells there, and the lane's own sides go down), so this draws
 * what is below and round it: jagged rock walls down the zone's outer
 * rectangle, dark at the top and going into mist, a pale mist floor far
 * down, mist drifting in the depth, and a snow cornice along the edge the
 * lane (or the ridge between two drops) runs on.
 */
const CLIFF_Y = -7;
function cliff(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, W = s.board.w, H = s.board.h;
  const rand = seeded("cliff" + s.hole + z.min.join(","));
  const top = new THREE.Color(0x4d5d72), low = new THREE.Color(0xc9d7e6);
  // a wall from (ax, az) to (bx, bz), its face towards (fx, fz)
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.ceil(L / 0.6)), rows = 6, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= n; i++) {
        const u = i / n, v = j / rows, jag = j && j < rows ? (rand() - 0.5) * 0.4 : 0;
        const x = ax + (bx - ax) * u, zz = az + (bz - az) * u, nx = -(bz - az) / L, nz = (bx - ax) / L;
        // on the board's own edge the world's snow is the ground (GRASS), inside it the board's
        const rim = x <= 0.01 || x >= W - 0.01 || zz <= 0.01 || zz >= H - 0.01;
        const y0 = rim ? GRASS : t.height(Math.min(Math.max(x, 0), W), Math.min(Math.max(zz, 0), H));
        pos.push(x + nx * jag, y0 + (CLIFF_Y - y0) * v, zz + nz * jag);
        const c = top.clone().lerp(low, Math.pow(v, 0.8));
        col.push(c.r, c.g, c.b);
      }
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < n; i++) {
        const a = j * (n + 1) + i, b = a + 1, d = a + n + 1, e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  };
  // the outer rectangle: where it is the board's edge, or meets the lane's
  // own ground at a short end, a wall goes down
  wall(x0, z0, x1, z0);
  wall(x1, z0, x1, z1);
  wall(x1, z1, x0, z1);
  wall(x0, z1, x0, z0);
  // the floor far down, lost in mist, and banks of it drifting at mid depth
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ color: 0xdfe8f1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, CLIFF_Y, (z0 + z1) / 2);
  g.add(floor);
  const zw = x1 - x0, zd = z1 - z0, mr = Math.min(1.6, Math.min(zw, zd) * 0.4);
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(mr, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.scale.set(1.8, 1, 1);
    ud(m).live = true;
    g.add(m);
    const cz = z0 + zd * (0.3 + 0.2 * k), span = Math.max(0, zw / 2 - mr * 1.8);
    animate((tt) => m.position.set(x0 + zw / 2 + Math.sin(tt * 0.1 + k * 1.7) * span, CLIFF_Y * (0.45 + 0.15 * k), cz));
  }
  // the cornice: along a long edge that is not the board's own (where a
  // strip meets the ridge), snow rounding over the edge
  if (!z.poly)
    for (const [ez, sgn] of [[z0, -1], [z1, 1]]) {
      if (ez <= 0.01 || ez >= H - 0.01) continue;
      const n2 = Math.ceil(zw / 0.25), P = 7, cpos: number[] = [], cidx: number[] = [];
      for (let k = 0; k <= n2; k++) {
        const x = x0 + (zw * k) / n2, y = t.height(x, ez + sgn * 0.3), wob = 1 + 0.12 * Math.sin(x * 2.3);
        for (let m = 0; m <= P; m++) {
          const a = Math.PI * (m / P), off = -Math.cos(a) * 0.3 * wob - 0.08, hgt = Math.sin(a) * 0.18 * wob;
          cpos.push(x, y + hgt - 0.03, ez - sgn * off);
        }
        if (k) for (let m = 0; m < P; m++) {
          const a0 = (k - 1) * (P + 1) + m, b0 = k * (P + 1) + m;
          cidx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute("position", new THREE.Float32BufferAttribute(cpos, 3));
      cg.setIndex(cidx);
      cg.computeVertexNormals();
      g.add(new THREE.Mesh(cg, share(SNOW_2SIDE)));
    }
  return g;
}

// ------------------------------------------------------------ the lane lift
//
// mountain8: the chain has three timed bars across the lane, 4.5 apart, each
// up 4 ticks in 12, in turn up the lane (0-4, 4-8, 8-12): one of them is
// always up. The look is one chairlift along the lane's centre line, one way,
// tee to cup, between two gantry stations over the lane either side of the
// bars, the cable sagging a little between them. Bench chairs, one file,
// 4.5 apart (one per bar), glide up it at an even pace, easing a little as
// they pass over a bar: exactly three are out at a time, one coming out of
// the near station as one goes into the far one, and the loop back is out of
// sight. Every third chair is the one working: it hangs low, its bench at
// the ball's height, the whole way through, passing each bar in the middle
// of that bar's window; the other two ride high. So a bar is up while the
// low chair is over it (to 2.25 either side at the windows' edges, where one
// bar hands over to the next). All of it follows the timed clock's fractional
// tick (state.timed): one instanced set, nothing allocated per frame.

const LIFT_CABLE = 4.6; // the cable, at the bullwheels up in the sheds
const LIFT_SAG = 1.2; // down to 3.4 over the middle bar
const SEAT_LOW = 0.25, SEAT_HANG = 1.45; // a bench's seat: working, on the ball's height; riding, this far under the cable
const LIFT_FADE = 0.3; // of a bar spacing: a chair fades into (out of) the dark just inside a shed's mouth over this
const LIFT_IN = 0.45; // of a bar spacing: how far into a shed a chair is still drawn
const LIFT_EASE = 0.3; // of a bar spacing: the working chair swings down over this inside the near shed (and up inside the far one)
const LIFT_SLOW = 0.55; // how much the pace eases over a bar (0: even, 1: a stop)
const LIFT_SWAY = 0.08; // radians: how far a chair swings on its hanger as the pace eases and picks up

/** The lift bars as lines across the lane: [{ x, z0, z1, every, on, phase }], by x. */
function liftBars(walls: readonly Wall[]) {
  const out: { x: number; z0: number; z1: number; every: number; on: number; phase: number }[] = [];
  for (let i = 0; i + 3 < walls.length; i += 4) {
    const q = walls.slice(i, i + 4), xs = q.flatMap((w) => [w.a[0], w.b[0]]), zs = q.flatMap((w) => [w.a[1], w.b[1]]);
    out.push({ x: (Math.min(...xs) + Math.max(...xs)) / 2, z0: Math.min(...zs), z1: Math.max(...zs), every: q[0].every ?? 0, on: q[0].on ?? 0, phase: q[0].phase ?? 0 });
  }
  return out.sort((a, b) => a.x - b.x);
}

/**
 * The lift's layout from the hole: the bars, their spacing D, the stations
 * half a spacing outside the first and last bars (so three chairs D apart
 * fill the run), the gap between two windows P (every / bars), and the clock
 * time t0 when a working chair leaves the near station: the first bar's
 * window opening.
 */
function liftPlan(s: Hole) {
  const bars = liftBars((s.walls || []).filter((w) => w.skin === "lift"));
  if (bars.length < 2) return null;
  const n = bars.length, every = bars[0].every, on = bars[0].on, P = every / n;
  const D = (bars[n - 1].x - bars[0].x) / (n - 1);
  const zc = bars.reduce((a, b) => a + (b.z0 + b.z1) / 2, 0) / n, half = Math.max(...bars.map((b) => (b.z1 - b.z0) / 2));
  const t0 = mod(-bars[0].phase, every);
  return { bars, n, every, on, P, D, zc, half, t0, xA: bars[0].x - D / 2, xB: bars[n - 1].x + D / 2, bench: 2 * half - 3 };
}

/**
 * The train at tick t: how far it has gone, in bar spacings since a working
 * chair left the near station at t0 — one spacing every P ticks, easing over
 * each bar (s + 1/2 an integer) and quickest between two.
 */
/** The lane lift's layout (liftPlan). */
type LiftPlan = NonNullable<ReturnType<typeof liftPlan>>;

function liftTrain(L: LiftPlan, t: number) {
  const u = (t - L.t0) / L.P;
  return u + (LIFT_SLOW / (2 * Math.PI)) * Math.sin(2 * Math.PI * u);
}

/**
 * The chairs out at tick t: [{ x, seat, working }], three of them. Chair j
 * of the file is at xA + D·(g - j); it is out while that is within the run
 * (0..n spacings), and the ones with j ≡ 0 (mod n) are the working ones.
 */
function liftChairs(L: LiftPlan, t: number) {
  const g = liftTrain(L, t), out: { x: number; seat: number; working: boolean; j: number; sway: number; fade: number; onLane: boolean }[] = [];
  // the chairs' swing on their hangers: forward as the train eases over a
  // bar, back as it picks up again (the train's deceleration, one curve)
  const sway = LIFT_SWAY * Math.sin((2 * Math.PI * (t - L.t0)) / L.P);
  for (let j = Math.floor(g) - L.n - 1; j <= Math.floor(g) + 1; j++) {
    const a = g - j; // spacings from the near station's mouth
    // on the lane from mouth to mouth; a little way into each shed, fading
    if (a < -LIFT_IN || a > L.n + LIFT_IN) continue;
    const working = ((j % L.n) + L.n) % L.n === 0;
    // the working chair swings down inside the near shed and up inside the far one
    const down = working ? smoothstep((a + LIFT_EASE) / LIFT_EASE) * smoothstep((L.n + LIFT_EASE - a) / LIFT_EASE) : 0;
    const x = L.xA + L.D * a, high = cableY(L, x) - SEAT_HANG;
    out.push({ x, seat: high + (SEAT_LOW - high) * down, working, j, sway, fade: smoothstep((a + LIFT_FADE) / LIFT_FADE) * smoothstep((L.n + LIFT_FADE - a) / LIFT_FADE), onLane: a >= 0 && a < L.n });
  }
  return out;
}

/** The cable's height at x: at LIFT_CABLE at the stations, sagging between. */
function cableY(L: LiftPlan, x: number) {
  const k = Math.max(0, Math.min(1, (x - L.xA) / (L.xB - L.xA)));
  return LIFT_CABLE - LIFT_SAG * 4 * k * (1 - k);
}

function liftLines(s: Hole, night: boolean, reserve: Reserve) {
  const L = liftPlan(s);
  const g = new THREE.Group();
  ud(g).live = true;
  if (!L) return g;
  const wood = flat(M.wood), red = flat(0xd9453d), steel = flat(0x8a97a6);
  // the cable, station to station, over the lane's middle
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= 40; k++) {
    // from bullwheel to bullwheel, round which it turns inside the sheds
    const x = L.xA - 1.2 + ((L.xB - L.xA + 2.4) * k) / 40;
    pts.push(new THREE.Vector3(x, cableY(L, x), L.zc));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: M.cable })));
  // a station at each end: a lift shed up on stilts over the lane, its
  // stilts off the lane's edges, open on the side the chairs come and go,
  // dark inside, with the bullwheel the cable turns round; the chairs rise
  // into the far one's mouth and fade into its dark, and come out of the
  // near one (the loop back is inside and behind, out of sight)
  const legZ = [L.zc - L.half - 1.1, L.zc + L.half + 1.1], HW = L.bench / 2 + 0.55, F = 2.55, TOP = 5.35, LEN = 2.6;
  const inner = new THREE.MeshBasicMaterial({ color: 0x1c232c, side: THREE.BackSide });
  for (const [x, face, lit] of [[L.xA, 1, true], [L.xB, -1, false]] as const) {
    const st = new THREE.Group(), back = -face; // the shed runs back from its mouth, away from the bars
    // stilts, off the lane, and the beams across under the floor
    // (open underneath: nothing across the chairs' way, only an outrigger
    // from each stilt in to the shed's end wall)
    for (const dx of [0.3, LEN - 0.3]) {
      for (const z of legZ) {
        const leg = drawn(rbox(0.26, F + 0.3, 0.26, 0.05), steel);
        leg.position.set(back * dx, (F + 0.3) / 2, z - L.zc);
        const arm = drawn(rbox(0.22, 0.22, Math.abs(z - L.zc) - HW + 0.2, 0.04), steel);
        arm.position.set(back * dx, F + 0.2, (z - L.zc + Math.sign(z - L.zc) * HW) / 2);
        st.add(leg, arm);
      }
    }
    for (const z of legZ) reserve(x + back * LEN * 0.5, z, 1.2);
    // back wall, the two ends; the roof over; the mouth and the floor left open
    const box = (w: number, h: number, d: number, px: number, py: number, pz: number, mat: THREE.Material = wood) => { const m = drawn(rbox(w, h, d, 0.05), mat); m.position.set(px, py, pz); st.add(m); };
    box(0.14, TOP - F, 2 * HW, back * (LEN - 0.07), (F + TOP) / 2, 0);
    for (const z of [-HW, HW]) box(LEN, TOP - F, 0.14, back * LEN / 2, (F + TOP) / 2, z);
    box(LEN + 0.5, 0.2, 2 * HW + 0.5, back * LEN / 2, TOP + 0.1, 0, SNOW);
    box(0.16, 0.34, 2 * HW + 0.2, back * 0.08, TOP - 0.17, 0, red); // the lintel over the mouth
    // the dark inside, and the bullwheel in it
    const dark = new THREE.Mesh(new THREE.BoxGeometry(LEN - 0.2, TOP - F - 0.2, 2 * HW - 0.2), inner);
    dark.position.set(back * LEN / 2, (F + TOP) / 2, 0);
    const wheel = drawn(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 20), flat(M.cable));
    wheel.position.set(back * 1.2, LIFT_CABLE, 0);
    st.add(dark, wheel);
    if (night && lit) {
      const glow = new THREE.Sprite(lanternGlow());
      glow.scale.set(1.4, 1.4, 1);
      glow.position.set(back * LEN / 2, (F + TOP) / 2, HW + 0.3);
      st.add(glow);
    }
    st.position.set(x, 0, L.zc);
    g.add(st);
  }
  // the chairs: a six-seat bench across the lane (x along the lane, z
  // across it), seat and a tall backrest, a safety bar down in front with its
  // footrest, and three gnomes riding, their skis dangling; the hanger comes
  // down from its grip on the cable to a yoke over the backrest (a rod
  // stretched to length: a working chair hangs low). Its origin is the seat.
  const W = L.bench, tpl = new THREE.Group(), metal = flat(M.cable);
  const seat = drawn(rbox(0.75, 0.12, W, 0.05), red);
  seat.position.x = 0.05;
  const back = drawn(rbox(0.12, 0.75, W, 0.05), red);
  back.position.set(-0.36, 0.42, 0);
  back.rotation.z = 0.12;
  const yoke = drawn(rbox(0.1, 0.1, W * 0.6, 0.03), metal);
  yoke.position.set(-0.45, 0.85, 0);
  tpl.add(seat, back, yoke);
  for (const zz of [-W / 2, W / 2]) {
    // a side frame each end, from the yoke down round the seat
    const side = drawn(rbox(0.08, 0.9, 0.08, 0.02), metal);
    side.position.set(-0.4, 0.4, zz);
    const rest = drawn(rbox(0.7, 0.06, 0.08, 0.02), metal);
    rest.position.set(0.02, 0.35, zz);
    tpl.add(side, rest);
  }
  // the safety bar, lowered: a rail across in front at chest height, two
  // drops to the footrest under the riders' feet
  const bar = drawn(rbox(0.06, 0.06, W - 0.2, 0.02), metal);
  bar.position.set(0.55, 0.62, 0);
  const foot = drawn(rbox(0.3, 0.05, W - 0.6, 0.02), metal);
  foot.position.set(0.72, -0.28, 0);
  tpl.add(bar, foot);
  for (const zz of [-W / 4, W / 4]) {
    const drop = drawn(rbox(0.05, 0.9, 0.05, 0.02), metal);
    drop.position.set(0.63, 0.17, zz);
    tpl.add(drop);
  }
  const lr = seeded("lift riders" + s.hole);
  for (const k of [0.5, 2.5, 4.5]) {
    const zz = -W / 2 + (W * k) / 6 + (lr() - 0.5) * 0.2;
    const gn = gnomelet(lr);
    gn.scale.setScalar(1.15);
    gn.position.set(-0.08, 0.06, zz);
    tpl.add(gn);
    for (const sk of [-0.09, 0.09]) {
      // skis off the footrest, tips down a little
      const ski = drawn(rbox(1.3, 0.035, 0.09, 0.015), flat(M.flags[Math.floor(lr() * M.flags.length)]));
      ski.position.set(0.95, -0.34, zz + sk);
      ski.rotation.z = -0.3;
      tpl.add(ski);
    }
  }
  const rodT = new THREE.Group();
  rodT.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 6).translate(0, -0.5, 0), metal), drawn(rbox(0.24, 0.18, 0.24, 0.05), metal));
  const benches = instances(tpl, L.n + 2), rods = instances(rodT, L.n + 2);
  g.add(benches.group, rods.group);
  const p = new THREE.Vector3(), e = new THREE.Euler(), sc = new THREE.Vector3(), none = new THREE.Vector3(1e-4, 1e-4, 1e-4), one = new THREE.Vector3(1, 1, 1);
  const tone = new THREE.Color(), DARK = new THREE.Color(0x1c232c);
  const place = (step: number) => {
    const qs = liftChairs(L, step);
    for (let i = 0; i < L.n + 2; i++) {
      const q = qs[i];
      if (!q) {
        benches.set(i, p.set(0, -50, 0), e.set(0, 0, 0), none);
        rods.set(i, p.set(0, -50, 0), e, none);
        continue;
      }
      // hung from its grip (over the yoke), swinging round it
      const gx = q.x - 0.45, top = cableY(L, gx), hang = Math.max(0.2, top - q.seat - 0.85), f = q.sway;
      const yx = gx + hang * Math.sin(f), yy = top - hang * Math.cos(f);
      // the seat's origin from the yoke, turned with the swing
      const ox = 0.45 * Math.cos(f) + 0.85 * Math.sin(f), oy = 0.45 * Math.sin(f) - 0.85 * Math.cos(f);
      benches.set(i, p.set(yx + ox, yy + oy, L.zc), e.set(0, 0, f), one);
      rods.set(i, p.set(gx, top, L.zc), e.set(0, 0, f), sc.set(1, hang, 1));
      // in and out of a shed's dark mouth: faded to its dark, never a pop
      tone.setRGB(1, 1, 1).lerp(DARK, 1 - q.fade);
      benches.tint(i, tone);
      rods.tint(i, tone);
    }
    benches.done();
    rods.done();
  };
  place(0);
  state.timed.push({ at: place });
  return g;
}

/**
 * The gust (a timed slope zone: it pushes only in its window of substeps) as
 * a snow cannon beside the ridge, blowing across it in bursts: when the gust
 * is on, a jet of snow streams over the zone the way it pushes; off, the
 * cannon idles with a wisp. Driven by the timed pieces' clock (state.timed),
 * so what blows on screen is what the chain has blowing.
 */
function snowCannon(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group();
  ud(g).live = true;
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2;
  const l = Math.hypot(z.vec[0], z.vec[1]) || 1, dx = z.vec[0] / l, dz = z.vec[1] / l;
  // the cannon stands up-wind, just off the zone's edge, aimed along the push
  const along = Math.abs(dz) > Math.abs(dx);
  const px = along ? cx : dx > 0 ? x0 - 2 : x1 + 2, pz = along ? (dz > 0 ? z0 - 2 : z1 + 2) : (z0 + z1) / 2;
  const cannon = new THREE.Group();
  const legs = drawn(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 6), flat(0x8a97a6));
  legs.position.y = 0.7;
  const barrel = drawn(new THREE.CylinderGeometry(0.55, 0.42, 1.5, 14, 1, true), flat(0xf2c14a, { side: THREE.DoubleSide }));
  barrel.rotation.x = Math.PI / 2 - 0.35; // tipped up a little
  barrel.position.set(0, 1.6, 0.2);
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), flat(M.cable));
  fan.position.set(0, 1.35, -0.45);
  fan.rotation.x = -0.35;
  const base = drawn(rbox(1.1, 0.25, 1.1, 0.08), flat(M.cable));
  base.position.y = 0.12;
  cannon.add(legs, barrel, fan, base);
  compact(cannon);
  cannon.position.set(px, t.height(px, pz), pz);
  cannon.rotation.y = Math.atan2(dx, dz);
  g.add(cannon);
  // the jet: snow streaming out of the barrel across the zone, one draw
  const N = 220, pos = new Float32Array(N * 3), seeds = new Float32Array(N * 3), jr = seeded("cannon" + z.min.join(","));
  for (let k = 0; k < N; k++) seeds.set([jr(), jr() - 0.5, jr()], k * 3);
  const y0 = t.height(px, pz) + 1.7;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0, depthWrite: false });
  const jet = new THREE.Points(geo, mat);
  jet.frustumCulled = false;
  g.add(jet);
  const reach = along ? z1 - z0 + 3 : x1 - x0 + 3, width = along ? x1 - x0 : z1 - z0;
  // the gust lane on the ground: where the zone crosses the lane (and no
  // drop is), chevrons pointing the push and streaks of blown snow — bright
  // while the gust is on, faint when it is off
  const drops = (s.zones || []).filter((q) => q.kind === "hazard");
  const safe = (x: number, zz: number) => (!t.onGreen || t.onGreen(x, zz)) && !drops.some((q) => inZone(q, x, zz));
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 });
  const chev = new THREE.Shape();
  chev.moveTo(-0.55, -0.25); chev.lineTo(0, 0.25); chev.lineTo(0.55, -0.25); chev.lineTo(0.55, 0.05); chev.lineTo(0, 0.55); chev.lineTo(-0.55, 0.05); chev.closePath();
  const chevGeo = new THREE.ShapeGeometry(chev), marks: THREE.Mesh[] = [];
  for (let a = along ? x0 + 1 : z0 + 1; a < (along ? x1 : z1) - 0.5; a += 2.2)
    for (let b = along ? z0 : x0; b <= (along ? z1 : x1); b += 0.9) {
      const x = along ? a : b, zz = along ? b : a;
      if (!safe(x, zz) || !safe(x + dx * 0.6, zz + dz * 0.6) || !safe(x - dx * 0.6, zz - dz * 0.6)) continue;
      const m = new THREE.Mesh(chevGeo, laneMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.atan2(dx, dz) + Math.PI; // its tip (+y) along the push
      m.position.set(x, t.height(x, zz) + 0.06, zz);
      g.add(m);
      marks.push(m);
    }
  // streaks: thin lines along the push, sliding with it
  const streakPos: number[] = [];
  for (let k = 0; k < 14; k++) {
    const u = (k + 0.5) / 14, x = along ? x0 + (x1 - x0) * u : x0, zz = along ? z0 : z0 + (z1 - z0) * u;
    for (let v = 0; v < 1; v += 0.12) {
      const p0: MutVec2 = [x + dx * v * reach, zz + dz * v * reach], p1: MutVec2 = [p0[0] + dx * 0.5, p0[1] + dz * 0.5];
      if (!safe(...p0) || !safe(...p1)) continue;
      streakPos.push(p0[0], t.height(...p0) + 0.07, p0[1], p1[0], t.height(...p1) + 0.07, p1[1]);
    }
  }
  const streaks = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(streakPos, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false }));
  g.add(streaks);
  let on = 0, target = 0;
  const every = (z.every ?? 0) | 0, onFor = (z.on ?? 0) | 0, phase = (z.phase ?? 0) | 0;
  state.timed.push({ at: (step) => (target = there(Math.floor(step), every, onFor, phase) ? 1 : 0.08) });
  let last: number | null = null;
  animate((tt) => {
    const dt = last === null ? 0 : Math.min(0.1, tt - last);
    last = tt;
    on += (target - on) * Math.min(1, dt * 8);
    mat.opacity = 0.55 * on; // the air spray, light
    laneMat.opacity = 0.18 + 0.62 * on;
    streaks.material.opacity = 0.12 + 0.55 * on;
    // the streaks run with the push while it blows
    streaks.position.set(dx * ((tt * 2.2) % 0.6) * on, 0, dz * ((tt * 2.2) % 0.6) * on);
    for (let k = 0; k < N; k++) {
      const u0 = seeds[k * 3], sp = seeds[k * 3 + 1], h = seeds[k * 3 + 2];
      const u = (u0 + tt * 0.9) % 1, d = u * reach, w = sp * width * Math.min(1, 0.15 + u * 1.2);
      const x = px + dx * d - dz * w, zz = pz + dz * d + dx * w;
      pos[k * 3] = x;
      pos[k * 3 + 1] = y0 - 1.2 * u + h * 0.35 + 0.15; // out of the barrel, down to skim the ridge
      pos[k * 3 + 2] = zz;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return g;
}

// ------------------------------------------------------------- the ice rink
//
// mountain13: gnomes on skates (posts that come and go stroke by stroke: the
// pulse's pieces), the goalie padded out, and a goal net round the cup.

/** A skater, a gnome on blades, the post's circle his footprint; the goalie in pads with a stick. */
function skaterPost(r: number, rand: Rand, goalie: boolean) {
  const g = new THREE.Group();
  const k = r / 0.28; // the gnomelet's body is about 0.22 across its foot
  const gn = gnomelet(rand);
  gn.scale.setScalar(k);
  gn.position.y = 0.16 * k;
  g.add(gn);
  // a scarf, two skates on their blades
  const scarf = drawn(new THREE.TorusGeometry(0.15 * k, 0.04 * k, 6, 14), flat(M.flags[Math.floor(rand() * M.flags.length)]));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.16 * k + 0.37 * k;
  g.add(scarf);
  for (const side of [-1, 1]) {
    const boot = drawn(rbox(0.14 * k, 0.1 * k, 0.26 * k, 0.03 * k), flat(0x3a3f4a));
    boot.position.set(side * 0.1 * k, 0.1 * k, 0.03 * k);
    const blade = drawn(rbox(0.03 * k, 0.05 * k, 0.32 * k, 0.01 * k), flat(0xd8dee6));
    blade.position.set(side * 0.1 * k, 0.03 * k, 0.03 * k);
    g.add(boot, blade);
  }
  if (goalie) {
    for (const side of [-1, 1]) {
      const pad = drawn(rbox(0.14 * k, 0.34 * k, 0.12 * k, 0.04 * k), flat(C.cream));
      pad.position.set(side * 0.13 * k, 0.28 * k, 0.12 * k);
      g.add(pad);
    }
    const stick = drawn(rbox(0.04 * k, 0.04 * k, 0.6 * k, 0.01), flat(M.woodDark));
    stick.position.set(0.25 * k, 0.1 * k, 0.28 * k);
    stick.rotation.x = -0.35;
    g.add(stick);
  }
  g.rotation.y = rand() * Math.PI * 2;
  return g;
}

/** A goal's net: a red frame along the bar, mesh hung from it down to the ice. */
function goalNet(len: number, thick: number) {
  const g = new THREE.Group();
  const H = 1.1, red = flat(C.cap);
  const top = drawn(new THREE.CylinderGeometry(0.06, 0.06, len, 8).rotateZ(Math.PI / 2), red);
  top.position.y = H;
  g.add(top);
  for (const e of [-1, 1]) {
    const post = drawn(new THREE.CylinderGeometry(0.06, 0.06, H, 8), red);
    post.position.set((e * len) / 2, H / 2, 0);
    g.add(post);
  }
  // the mesh: a pale sheet the bar's thickness, and its cords over it
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(len, H, thick * 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  sheet.position.y = H / 2;
  const cords: THREE.Vector3[] = [];
  for (let x = -len / 2; x <= len / 2 + 1e-6; x += 0.22) cords.push(new THREE.Vector3(x, 0, thick * 0.26), new THREE.Vector3(x, H, thick * 0.26), new THREE.Vector3(x, 0, -thick * 0.26), new THREE.Vector3(x, H, -thick * 0.26));
  for (let y = 0.2; y < H; y += 0.22) for (const zz of [thick * 0.26, -thick * 0.26]) cords.push(new THREE.Vector3(-len / 2, y, zz), new THREE.Vector3(len / 2, y, zz));
  const net = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cords), new THREE.LineBasicMaterial({ color: 0xe6edf3 }));
  g.add(sheet, net);
  return g;
}

// ------------------------------------------------------------- the col
//
// mountain12: at the saddle, a cairn each side of the pass and prayer flags
// strung over it, off the lane.
function colCrest(z: Zone, t: Terrain) {
  const g = new THREE.Group();
  // the top edge of the climb (against its push), and the lane's two sides along it
  const x = z.vec[0] < 0 ? z.max[0] : z.min[0], mid = (z.min[1] + z.max[1]) / 2;
  const on = (zz: number) => !t.onGreen || t.onGreen(x, zz);
  let lo = mid, hi = mid;
  while (lo > z.min[1] && on(lo - 0.25)) lo -= 0.25;
  while (hi < z.max[1] && on(hi + 0.25)) hi += 0.25;
  const rand = seeded("col" + z.min.join());
  const feet: THREE.Vector3[] = [];
  for (const [zz, dir] of [[lo - 1.6, -1], [hi + 1.6, 1]]) {
    if (on(zz) || on(zz - dir * 0.6)) continue; // no room off the lane
    const cairn = new THREE.Group();
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const rr = 0.55 - k * 0.1, st = drawn(new THREE.DodecahedronGeometry(rr, 0), flat(k % 2 ? M.rock : M.rockDark));
      st.scale.y = 0.6;
      st.rotation.y = rand() * 3;
      st.position.y = y + rr * 0.55;
      y += rr * 1.05;
      cairn.add(st);
    }
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
    cap.scale.y = 0.5;
    cap.position.y = y;
    cairn.add(cap);
    g.add(onGround(cairn, x, zz, t));
    feet.push(new THREE.Vector3(x, t.height(x, zz), zz + dir * 0.9));
  }
  if (feet.length === 2) g.add(bunting(feet[0], feet[1]));
  return g;
}

// ------------------------------------------------------------- the seracs
//
// mountain15: a serac leans over the traverse above each timed hazard, and
// its ice comes down on the lane in the hazard's window of substeps — driven
// by the timed pieces' clock (state.timed), so the blocks fall on screen when
// the chain has them fall. A shadow darkens the spot for a few substeps
// before, and the rubble of old falls marks it the rest of the time.
function serac(z: Zone, t: Terrain, s: Hole) {
  const g = new THREE.Group();
  const [x0, z0] = z.min, [x1, z1] = z.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ax = (x1 - x0) / 2, az = (z1 - z0) / 2;
  const rand = seeded("serac" + z.min.join());
  const lane = (x: number, zz: number) => !t.onGreen || t.onGreen(x, zz);
  // the rubble, where the ice lands: always there, so the spot reads
  g.add(overlay(z, t, (x, zz) => new THREE.Color(0xdfeaf3).lerp(new THREE.Color(0xa9c4dc), 0.35 + 0.25 * Math.sin(x * 2.1 + zz * 1.7)), () => 0.01));
  for (let k = 0; k < 7; k++) {
    const x = cx + (rand() - 0.5) * ax * 1.4, zz = cz + (rand() - 0.5) * az * 1.4;
    if (!inZone(z, x, zz) || !lane(x, zz)) continue;
    const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + rand() * 0.08), ICE_SOLID);
    chip.position.set(x, t.height(x, zz) + 0.05, zz);
    chip.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    g.add(chip);
  }
  // the serac: a leaning tower of ice off the lane, uphill of the spot (-z),
  // or below it when the board leaves no room above; clear of the lane by a
  // good step and inside the board, so it never stands in the decor round it
  const clear = (zz: number) => zz > 1.3 && zz < s.board.h - 1.3 && [[-1.3, 0], [1.3, 0], [0, -1.3], [0, 1.3], [0, 0], [-1, -1], [1, 1], [-1, 1], [1, -1]].every(([a, b]) => !lane(cx + a, zz + b));
  let tz: number | null = null;
  for (const dir of [-1, 1]) for (let d = 0.5; d < 9 && tz == null; d += 0.25) if (clear(dir < 0 ? z0 - d : z1 + d)) tz = dir < 0 ? z0 - d : z1 + d;
  if (tz == null) tz = z0 - 3;
  const tower = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const w = 2.2 - k * 0.45, h = 1.5 + rand() * 0.4;
    const b = drawn(rbox(w, h, w * 0.8, 0.15), ICE_SOLID);
    b.position.set((rand() - 0.5) * 0.3, 0.1 + k * 1.35 + h / 2, k * 0.35);
    b.rotation.y = (rand() - 0.5) * 0.4;
    tower.add(b);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), SNOW);
  cap.scale.set(1, 0.4, 0.8);
  cap.position.set(0, 4.4, 0.7);
  tower.add(cap);
  tower.rotation.x = tz < cz ? 0.12 : -0.12; // leaning out over the path
  if (tz > cz) tower.rotation.y = Math.PI;
  g.add(onGround(tower, cx, tz, t));
  // the fall: blocks dropping on the spot, and the shadow before them
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 28).scale(ax * 0.85, az * 0.85, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1d3550, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  shadow.position.set(cx, t.height(cx, cz) + 0.06, cz);
  ud(shadow).live = true;
  g.add(shadow);
  const blocks: { b: THREE.Group; x: number; zz: number; y: number; s: number; d: number; spin: number }[] = [];
  for (let k = 0; k < 9 && blocks.length < 6; k++) {
    const x = cx + (rand() - 0.5) * ax * 1.3, zz = cz + (rand() - 0.5) * az * 1.3, s = 0.45 + rand() * 0.35;
    if (!inZone(z, x, zz) || !lane(x, zz)) continue;
    const b = drawn(rbox(s, s * 0.8, s, 0.08), ICE_SOLID);
    ud(b).live = true;
    b.visible = false;
    g.add(b);
    blocks.push({ b, x, zz, y: t.height(x, zz) + s * 0.4, s, d: rand() * 0.05, spin: rand() * 3 });
  }
  const every = (z.every ?? 0) | 0, onFor = (z.on ?? 0) | 0, phase = (z.phase ?? 0) | 0;
  let on = false, warn = 0, t0 = -1e9, t1 = -1e9, now = 0;
  state.timed.push({
    at: (step) => {
      const k = mod(Math.floor(step) + phase, every);
      const was = on;
      on = !every || k < onFor;
      // substeps to go before the next fall
      const until = on ? 0 : every - k;
      warn = on ? 1 : until <= 3 ? 1 - (until - 1) / 3 : 0;
      if (on && !was) t0 = now;
      if (!on && was) t1 = now;
    },
  });
  animate((tt) => {
    now = tt;
    shadow.material.opacity = 0.35 * Math.max(warn, 0);
    for (const q of blocks) {
      const fall = Math.min(1, Math.max(0, (tt - t0 - q.d) / 0.15)), gone = Math.min(1, Math.max(0, (tt - t1) / 0.1));
      const showing = on || gone < 1;
      q.b.visible = showing && tt - t0 > q.d;
      if (!q.b.visible) continue;
      q.b.position.set(q.x, q.y + (1 - fall * fall) * 7, q.zz);
      q.b.rotation.set(q.spin * (1 - fall), q.spin, 0);
      q.b.scale.setScalar(on ? 1 : 1 - gone);
    }
  });
  return g;
}

function piece(kind: "post" | "wall" | "zone", item: Post | Bar | Zone, t: Terrain, s: Hole) {
  const skin = item.skin || "";
  const rand = seeded("mpiece" + s.hole + JSON.stringify("c" in item ? item.c : "min" in item ? item.min : []));
  const night = timeOf(s.hole) !== "day";
  if (kind === "post") {
    const post = item as Post; // (kind says which)
    const [x, z] = post.c, r = post.r;
    const makers: Record<string, () => THREE.Group> = { pine: () => pinePost(r, rand), boulder: () => boulder(r, rand), snowman: () => snowmanPost(r), chalet: () => chaletPost(r, night), skater: () => skaterPost(r, rand, r > 0.8) };
    const make = makers[skin];
    return make ? onGround(make(), x, z, t) : undefined;
  }
  if (kind === "wall") {
    if (skin === "net") {
      const bar = item as Bar; // (kind says which)
      const g = new THREE.Group();
      g.add(goalNet(bar.length, bar.thick));
      g.rotation.y = -bar.ang;
      return onGround(g, bar.c[0], bar.c[1], t);
    }
    if (skin !== "lift") return undefined;
    // the chairs glide along the cable, drawn by decor (liftLines): the bar
    // itself, shown and hidden by the replay, is nothing to see
    return new THREE.Group();
  }
  if (kind !== "zone") return undefined;
  const zone = item as Zone; // (kind says which)
  const [x0, z0] = zone.min, [x1, z1] = zone.max, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (skin === "ice") {
    // glossy ice: pale at its edges where frost lies, a clearer blue in the
    // middle, lit from within so it stays ice at dusk and night; cracks, skate
    // scratches, and a frosty rim that melts it into the snow round it
    const g = new THREE.Group();
    const ex = (x: number, zz: number) => {
      // how far inside the zone, 0 at its edge .. 1 well in (a round zone: its ellipse)
      if (zone.round) {
        const u = (x - cx) / ((x1 - x0) / 2), v = (zz - cz) / ((z1 - z0) / 2);
        return Math.min(1, (1 - Math.hypot(u, v)) * 4);
      }
      return Math.min(1, Math.min(x - x0, x1 - x, zz - z0, z1 - zz) / 1.2);
    };
    // scratches and cracks only where the ice is on the lane (a zone may reach past the rails)
    const onLane = (x: number, zz: number) => !t.onGreen || t.onGreen(x, zz);
    const edge = new THREE.Color(0xeef8fd), mid = new THREE.Color(0x9fd6ee), deep = new THREE.Color(0x7cc3e4);
    g.add(overlay(zone, t, (x, zz) => edge.clone().lerp(mid, ex(x, zz)).lerp(deep, 0.35 * (0.5 + 0.5 * Math.sin(x * 0.6 + zz * 0.9)) * ex(x, zz)), () => 0.01,
      new THREE.MeshPhongMaterial({ vertexColors: true, emissive: 0x5aa8cc, emissiveIntensity: 0.28, shininess: 120, specular: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    const scratch: THREE.Vector3[] = [], crack: THREE.Vector3[] = [];
    const add = (arr: THREE.Vector3[], p: Vec2, q: Vec2, lift: number) => { for (const [a2, b2] of [p, q]) arr.push(new THREE.Vector3(a2, t.height(a2, b2) + lift, b2)); };
    for (let k = 0; k < Math.ceil(((x1 - x0) * (z1 - z0)) / 5); k++) {
      const x = x0 + rand() * (x1 - x0), zz = z0 + rand() * (z1 - z0), a = rand() * Math.PI, l = 0.6 + rand() * 1.4;
      const p: MutVec2 = [x - Math.cos(a) * l, zz - Math.sin(a) * l], q: MutVec2 = [x + Math.cos(a) * l, zz + Math.sin(a) * l];
      if (inZone(zone, ...p) && inZone(zone, ...q) && ex(...p) > 0.3 && ex(...q) > 0.3 && onLane(...p) && onLane(...q)) add(scratch, p, q, 0.06);
    }
    // cracks: a few branching zigzags from a point
    for (let k = 0; k < Math.max(2, Math.round(((x1 - x0) * (z1 - z0)) / 30)); k++) {
      let x = x0 + (0.2 + rand() * 0.6) * (x1 - x0), zz = z0 + (0.2 + rand() * 0.6) * (z1 - z0), a = rand() * Math.PI * 2;
      if (!onLane(x, zz)) continue;
      for (let m = 0; m < 5; m++) {
        const l = 0.4 + rand() * 0.6, nx = x + Math.cos(a) * l, nz = zz + Math.sin(a) * l;
        if (!inZone(zone, nx, nz) || ex(nx, nz) < 0.2 || !onLane(nx, nz)) break;
        add(crack, [x, zz], [nx, nz], 0.065);
        if (rand() < 0.4) add(crack, [nx, nz], [nx + Math.cos(a + 1.2) * 0.4, nz + Math.sin(a + 1.2) * 0.4], 0.065);
        (x = nx), (zz = nz), (a += (rand() - 0.5) * 1.4);
      }
    }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(scratch), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(crack), new THREE.LineBasicMaterial({ color: 0x4f8fb4, transparent: true, opacity: 0.8 })));
    // a rink (a goal net on it): its markings, the red centre line and the circles
    if ((s.walls || []).some((w) => w.skin === "net")) {
      const y = t.height(cx, cz) + 0.07, mark = (pts: readonly Vec2[], color: number) => g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(([a, b]) => new THREE.Vector3(a, y, b))), new THREE.LineBasicMaterial({ color })));
      const ring = (x: number, zz: number, r: number) => Array.from({ length: 33 }, (_, k): Vec2 => [x + Math.cos((k / 32) * Math.PI * 2) * r, zz + Math.sin((k / 32) * Math.PI * 2) * r]);
      const H = (z1 - z0) / 2;
      mark([[cx, z0 + 0.8], [cx, z1 - 0.8]], C.cap);
      mark(ring(cx, cz, H * 0.35), 0x4a78c8);
      for (const x of [x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7]) mark([[x, z0 + 1.5], [x, z1 - 1.5]], 0x4a78c8);
    }
    return g;
  }
  if (skin === "snowdrift") {
    // deep soft powder, part of the lane's own snow: a gentle drift surface
    // on the zone's footprint, always clipped to the lane (never past the
    // kerb), its edge soft and irregular (the zone's outline broken by noise,
    // and its colour and height fading into the piste there), wind ripples,
    // bluer hollows, a faint sparkle. No blobs on top.
    const g = new THREE.Group();
    const n2 = (x: number, zz: number) => Math.sin(x * 1.3 + zz * 0.7) * 0.5 + Math.sin(x * 3.1 - zz * 2.3) * 0.3 + Math.sin(zz * 4.7 + x * 0.9) * 0.2;
    const inner = (x: number, zz: number) => {
      // how far in, 0 at the zone's edge, 1 about a unit in (ellipse or rect)
      if (zone.round) {
        const u = (x - cx) / ((x1 - x0) / 2), v = (zz - cz) / ((z1 - z0) / 2);
        return (1 - Math.hypot(u, v)) * Math.min(x1 - x0, z1 - z0) * 0.5;
      }
      return Math.min(x - x0, x1 - x, zz - z0, z1 - zz);
    };
    // the soft edge: 0 outside the noisy outline, rising to 1 over 1.2 in
    // (a short ramp: the drift has an edge you can see, soft but not hazy)
    const rim = (x: number, zz: number) => Math.max(0, Math.min(1, (inner(x, zz) - 0.25 + 0.3 * n2(x, zz)) / 0.45));
    const ripple = (x: number, zz: number) => Math.sin(x * 2.4 + zz * 0.9 + 0.8 * Math.sin(zz * 0.6));
    // a raised lip just inside the edge, catching the light, then the drift
    const lip = (k: number) => Math.exp(-((k - 0.45) ** 2) / 0.03);
    const piste = new THREE.Color(green[1]), hi = new THREE.Color(0xffffff), hollow = new THREE.Color(0xb3cbe8), rimC = new THREE.Color(0xf2f9ff);
    const col = (x: number, zz: number) => {
      const k = rim(x, zz), lit = 0.2 + 0.8 * (0.5 + 0.5 * ripple(x + 0.25, zz)); // the ripples' lit faces, and their shaded ones
      // cooler and brighter than the packed piste, the lip brightest of all
      return piste.clone().lerp(hollow.clone().lerp(hi, lit), Math.min(1, k * 1.4)).lerp(rimC, 0.5 * lip(k));
    };
    // the drift itself: a mesh of rings out from the middle to a crisp,
    // wind-scalloped outline inside the zone, raised in the middle and
    // falling to the lane at its edge, opaque, lit like the piste; a faint
    // blue shade just inside the edge gives it a clean contour
    const ax = (x1 - x0) / 2, az = (z1 - z0) / 2, NT = 96, NR = 10;
    const edgeR = (th: number) => 0.9 + 0.06 * Math.sin(th * 5 + 1.3) + 0.04 * Math.sin(th * 11 + 0.4);
    const at = (th: number, r: number): MutVec2 => {
      const R = edgeR(th) * r, c = Math.cos(th), sn = Math.sin(th);
      if (zone.round) return [cx + ax * R * c, cz + az * R * sn];
      const e = 0.2, sx = Math.sign(c) * Math.abs(c) ** e, sz = Math.sign(sn) * Math.abs(sn) ** e; // a rectangle with soft corners
      return [cx + ax * R * sx, cz + az * R * sz];
    };
    const pos: number[] = [], cols: number[] = [], idx: number[] = [], keep: boolean[] = [];
    const shade = new THREE.Color(0x9fb8d6);
    for (let r = 0; r <= NR; r++)
      for (let q = 0; q < NT; q++) {
        const th = (q / NT) * Math.PI * 2, rr = r / NR, [x, zz] = at(th, rr);
        const k = smoothstep((1 - rr) / 0.35); // 0 at the edge, 1 a third of the way in
        const hgt = k * (0.17 + 0.04 * ripple(x, zz) + 0.04 * n2(x * 0.7, zz * 0.7)) + 0.015;
        pos.push(x, t.height(x, zz) + hgt, zz);
        const c = col(x, zz).lerp(piste, 0.25 * (1 - k)).lerp(shade, 0.35 * Math.exp(-(((1 - rr) - 0.06) ** 2) / 0.002));
        cols.push(c.r, c.g, c.b);
        keep.push(!t.onGreen || t.onGreen(x, zz));
      }
    const id = (r: number, q: number) => r * NT + (q % NT);
    for (let r = 0; r < NR; r++)
      for (let q = 0; q < NT; q++) {
        const a = id(r, q), b = id(r, q + 1), c = id(r + 1, q), d = id(r + 1, q + 1);
        if (keep[a] && keep[c] && keep[d]) idx.push(a, d, c);
        if (keep[a] && keep[d] && keep[b]) idx.push(a, b, d);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, DRIFT_OPAQUE);
    g.add(mesh);
    // the drift's height at (x, z), as the mesh has it (by its polar rings)
    const hAt = (x: number, zz: number) => {
      const u = (x - cx) / ax, v = (zz - cz) / az, th = Math.atan2(v, u), rr = Math.hypot(u, v) / edgeR(th);
      const k = smoothstep((1 - rr) / 0.35);
      return t.height(x, zz) + k * (0.17 + 0.04 * ripple(x, zz) + 0.04 * n2(x * 0.7, zz * 0.7)) + 0.015;
    };
    const N = Math.min(60, Math.ceil(((x1 - x0) * (z1 - z0)) * 1.2)), sp = new Float32Array(N * 3);
    let m = 0;
    for (let k = 0; k < N * 3 && m < N; k++) {
      const x = x0 + rand() * (x1 - x0), zz = z0 + rand() * (z1 - z0);
      if (Math.hypot((x - cx) / ax, (zz - cz) / az) > 0.6 || (t.onGreen && !t.onGreen(x, zz))) continue;
      sp.set([x, hAt(x, zz) + 0.05, zz], m++ * 3);
    }
    const sparkle = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp.subarray(0, m * 3), 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.4, depthWrite: false }));
    ud(sparkle).live = true;
    g.add(sparkle);
    animate((tt) => (sparkle.material.opacity = 0.25 + 0.2 * Math.sin(tt * 1.7)));
    return g;
  }
  if (zone.kind === "slope" && ["kicker", "terrace", "downhill", "slope", "saddle crest", "bank"].includes(skin)) {
    const g = new THREE.Group();
    if (skin === "saddle crest" && zone.vec[0] < 0) g.add(colCrest(zone, t));
    const top = Math.max(0.3, ...[[x0, z0], [x1, z0], [x0, z1], [x1, z1], [cx, cz]].map(([a, b]) => t.height(a, b)));
    g.add(overlay(zone, t, skin === "downhill" ? (x, zz, h) => snowRise(0xd9e6f3, 0xf7fbff, top)(x, zz, h).lerp(new THREE.Color(0xc6d6e8), Math.floor(zz * 2.5) % 2 ? 0.15 : 0) : snowRise(0xc6d6e8, 0xf7fbff, top)));
    // the uphill side (against the push): a timber lip on a kicker, a stone step on a terrace
    const l = Math.hypot(zone.vec[0], zone.vec[1]) || 1, ux = -zone.vec[0] / l, uz = -zone.vec[1] / l;
    const along = Math.abs(ux) > Math.abs(uz);
    const ex = along ? (ux > 0 ? x1 : x0) : cx, ez = along ? cz : uz > 0 ? z1 : z0;
    if (skin === "kicker" || skin === "terrace") {
      // the lane's width along the lip, from its green cells: the lip and the
      // flags stay between the rails
      const green = (x: number, zz: number) => !t.onGreen || t.onGreen(x, zz);
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k <= 80; k++) {
        const u = k / 80, x = along ? ex - ux * 0.3 : x0 + (x1 - x0) * u, zz = along ? z0 + (z1 - z0) * u : ez - uz * 0.3;
        if (green(x, zz)) (lo = Math.min(lo, along ? zz : x)), (hi = Math.max(hi, along ? zz : x));
      }
      if (!(hi > lo)) return g;
      const len = hi - lo - 0.8, mid = (lo + hi) / 2;
      const fx0 = along ? ex : mid, fz0 = along ? mid : ez;
      const lip = drawn(rbox(along ? 0.3 : len, 0.18, along ? len : 0.3, 0.06), flat(skin === "kicker" ? M.wood : M.rock));
      lip.position.set((along ? ex : mid) - ux * 0.15, t.height(ex - ux * 0.3, ez - uz * 0.3) + 0.12, (along ? mid : ez) - uz * 0.15);
      g.add(lip);
      if (skin === "kicker")
        for (const sgn of [-1, 1]) {
          // a red flag each side of the take-off
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), flat(M.cable));
          // just inside the rails, at the lip's two ends
          const fx = along ? fx0 - ux * 0.3 : fx0 + sgn * (len / 2 - 0.1), fz = along ? fz0 + sgn * (len / 2 - 0.1) : fz0 - uz * 0.3;
          pole.position.set(fx, t.height(fx, fz) + 0.8, fz);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), flat(C.cap, { side: THREE.DoubleSide }));
          flag.position.set(fx + 0.25, t.height(fx, fz) + 1.4, fz);
          g.add(pole, flag);
        }
    }
    return g;
  }
  if (skin === "cliff") return cliff(zone, t, s);
  if (skin === "serac") return serac(zone, t, s);
  // a crack inside the lane (mountain17): drawn here, walls on all four
  // sides; one across the whole board (mountain5) is the shared drawing's,
  // carried on into the mountain by base()
  if (skin === "crevasse" && !(zone.min[1] <= 0.01 && zone.max[1] >= s.board.h - 0.01)) return crevasse(zone, t, true);
  if (zone.kind === "tunnel" && (skin === "ice cave" || skin === "door")) {
    const g = new THREE.Group();
    const face = (x: number, zz: number) => Math.atan2(x - cx, zz - cz); // facing where the ball comes from
    const tee = s.start;
    if (skin === "ice cave") {
      const r = Math.min(x1 - x0, z1 - z0) / 2;
      const inn = onGround(iceCave(r), cx, cz, t);
      inn.rotation.y = face(tee[0], tee[1]);
      const out = onGround(iceCave(1.1), zone.vec[0], zone.vec[1], t);
      out.rotation.y = inn.rotation.y + Math.PI;
      g.add(inn, out);
    } else {
      const inn = onGround(doorway(false), cx, cz, t);
      inn.rotation.y = face(tee[0], tee[1]);
      const out = onGround(doorway(true), zone.vec[0], zone.vec[1], t);
      out.rotation.y = inn.rotation.y + Math.PI;
      g.add(inn, out);
    }
    return g;
  }
  if (skin === "gust") {
    // the spine it blows over is snow like the rest of the lane (the shared
    // drawing would colour a slope green), and the cannon beside it
    const g = snowCannon(zone, t, s);
    const drops = (s.zones || []).filter((q) => q.kind === "hazard");
    g.add(overlay(zone, t, (x) => new THREE.Color(Math.floor(x * 1.2) % 2 ? green[0] : green[1]), () => 0, undefined, true, (x, zz) => !drops.some((q) => inZone(q, x, zz))));
    return g;
  }
  return undefined;
}

export { base, edging, berms, decor, rough, kerb, green, edgeInk, extras, piece, liftPlan, liftChairs };
