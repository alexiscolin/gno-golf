import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { C, ink, flat, sway, grows, swayLine, drawn, rbox, texOf, lanternGlow, glowTex, tuftGeo, share, motion } from "./materials.js";
import { animate, state } from "./state.js";
import { GRASS } from "./common.js";

const GLASS_GEO = share(new THREE.BoxGeometry(0.3, 0.38, 0.3)), GLASS_MAT = share(new THREE.MeshBasicMaterial({ color: 0xffd98a }));

/** A lantern on a post: a warm glass that lights nothing but reads as light. */
function lantern(x, z) {
  const g = new THREE.Group();
  const pole = drawn(new THREE.CylinderGeometry(0.07, 0.09, 2.2, 7), flat(C.woodDark));
  pole.position.y = 1.1;
  const cage = drawn(rbox(0.42, 0.52, 0.42, 0.08), flat(C.ink));
  cage.position.y = 2.35;
  const glass = new THREE.Mesh(GLASS_GEO, GLASS_MAT);
  glass.position.y = 2.35;
  const glow = new THREE.Sprite(lanternGlow());
  glow.scale.set(3, 3, 1);
  glow.position.y = 2.35;
  g.add(pole, cage, glass, glow);
  g.position.set(x, GRASS, z);
  return g; // pole and cage bake with the rest; the glow is a sprite and stays
}

/** Fireflies: a few glowing points drifting and blinking over the lane. */
function fireflies(rand, W, H) {
  // one Points cloud for all of them: one draw
  const n = 18, pos = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: glowTex(), color: 0xd8ff8a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.live = true;
  const flies = Array.from({ length: n }, () => ({ x: -3 + rand() * (W + 6), z: -3 + rand() * (H + 6), ph: rand() * 6, sp2: 0.3 + rand() * 0.5 }));
  const g = new THREE.Group();
  g.userData.live = true;
  g.add(pts);
  animate((t) => {
    flies.forEach((f, i) => {
      pos[i * 3] = f.x + Math.sin(t * f.sp2 + f.ph) * 1.5;
      pos[i * 3 + 1] = 0.8 + Math.sin(t * 1.3 + f.ph) * 0.5;
      pos[i * 3 + 2] = f.z + Math.cos(t * f.sp2 * 0.8 + f.ph) * 1.2;
    });
    geo.attributes.position.needsUpdate = true;
    // they blink together-ish: the cloud's opacity breathes
    mat.opacity = 0.55 + 0.4 * Math.sin(t * 2.2);
  });
  return g;
}

function tree(rand) {
  // a mixed wood: mostly pines, some round oaks, a few birches, now and then
  // a big old tree
  const kind = rand();
  if (kind < 0.22) {
    const g = new THREE.Group(), big = rand() < 0.2 ? 1.6 : 1, h = (1.4 + rand() * 0.8) * big;
    g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
    g.userData.flex = 0.4; // an oak: stiff, a small lean
    const trunk = grows(new THREE.CylinderGeometry(0.2 * big, 0.3 * big, h, 7), C.bark);
    trunk.position.y = h / 2;
    g.add(trunk);
    for (let k = 0; k < 3; k++) {
      const r = (0.9 + rand() * 0.5) * big;
      const crown = grows(new THREE.IcosahedronGeometry(r, 1), k % 2 ? C.leaf : 0x4f9a6a);
      crown.position.set((rand() - 0.5) * big, h + r * 0.6 + k * 0.3 * big, (rand() - 0.5) * big * 0.8);
      g.add(crown);
    }
    return g;
  }
  if (kind < 0.34) {
    const g = new THREE.Group(), h = 3 + rand() * 1.5;
    g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
    g.userData.flex = 0.45; // a birch
    const trunk = grows(new THREE.CylinderGeometry(0.1, 0.14, h, 6), 0xefe9dd);
    trunk.position.y = h / 2;
    const crown = grows(new THREE.IcosahedronGeometry(0.8 + rand() * 0.3, 1), 0x8cc084);
    crown.position.y = h + 0.3;
    crown.scale.y = 1.4;
    g.add(trunk, crown);
    return g;
  }
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  g.userData.flex = 0.28; // a pine: stiffest, 2-4 degrees at most
  const h = 2.2 + rand() * 2.4;
  const trunk = grows(new THREE.CylinderGeometry(0.18, 0.24, h * 0.5, 7), C.bark);
  trunk.position.y = h * 0.25;
  const top = grows(new THREE.ConeGeometry(0.85 + rand() * 0.5, h, 8), rand() > 0.5 ? C.leaf : C.leafDark);
  top.position.y = h * 0.78;
  g.add(trunk, top);
  return g;
}

function bush(rand) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  for (let i = 0; i < 3; i++) {
    const r = 0.45 + rand() * 0.4;
    const b = grows(new THREE.IcosahedronGeometry(r, 1), C.leaf);
    b.position.set((rand() - 0.5) * 1.1, r * 0.75, (rand() - 0.5) * 0.9);
    g.add(b);
  }
  return g;
}

function stone(rand) {
  const m = drawn(new THREE.DodecahedronGeometry(0.4 + rand() * 0.45, 0), flat(C.stone));
  m.rotation.set(rand(), rand(), rand());
  m.scale.y = 0.7;
  m.position.y = 0.25;
  return m;
}

function flower(rand) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), sway(C.leafDark));
  stem.position.y = 0.35;
  const head = grows(new THREE.SphereGeometry(0.17, 8, 6), rand() > 0.5 ? C.petal : C.cream);
  head.position.y = 0.75;
  g.add(stem, head);
  return g;
}

/** The signpost: a hole is somebody's realm, so the garden says whose. */
function signpost(label) {
  const g = new THREE.Group();
  const post = drawn(new THREE.CylinderGeometry(0.11, 0.11, 2.4, 7), flat(C.bark));
  post.position.y = 1.2;
  g.add(post);

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fdf6e9";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#144134";
  ctx.fillRect(0, 0, 256, 10);
  ctx.fillRect(0, 118, 256, 10);
  ctx.font = "bold 76px ui-rounded, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N° " + label, 128, 66);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.95, 0.12),
    [0, 0, 0, 0, 1, 0].map((front) =>
      front
        ? new THREE.MeshBasicMaterial({ map: texOf(canvas) })
        : flat(C.cream)
    )
  );
  // the board hangs in front of its post, not threaded on it
  board.position.set(0, 2.3, 0.2);
  g.add(board, new THREE.LineSegments(new THREE.EdgesGeometry(board.geometry), ink).translateY(2.3).translateZ(0.2));
  return g;
}

function hill(rand, far) {
  const r = 2.4 + rand() * 1.4;
  const m = drawn(new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(far ? C.hillFar : C.hill));
  m.scale.set(1.15, 0.5, 0.75);
  m.userData.r = r;
  return m;
}

/** A gnome lives here — it is his course. */
function house(cap = C.cap) {
  const g = new THREE.Group();
  const body = drawn(new THREE.CylinderGeometry(1.05, 1.2, 1.9, 14), flat(C.cream));
  body.position.y = 0.95;
  const roof = drawn(new THREE.SphereGeometry(1.75, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), flat(cap));
  roof.position.y = 1.75;
  roof.scale.y = 0.85;
  g.add(body, roof);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + 0.4, t = i % 2 ? 0.6 : 1.05;
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 7), flat(C.cream));
    spot.position.set(Math.cos(a) * Math.sin(t) * 1.66, 1.75 + Math.cos(t) * 1.4, Math.sin(a) * Math.sin(t) * 1.66);
    spot.scale.y = 0.5;
    g.add(spot);
  }
  const chimney = drawn(new THREE.CylinderGeometry(0.2, 0.24, 0.9, 10), flat(C.stone));
  chimney.position.set(0.7, 2.95, -0.4);
  g.add(chimney);
  g.add(smoke(new THREE.Vector3(0.7, 3.45, -0.4)));
  const door = drawn(rbox(0.6, 0.95, 0.12, 0.06), flat(C.woodDark));
  door.position.set(0, 0.48, 1.14);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.24, 12), flat(C.sun));
  win.position.set(0.62, 1.2, 0.98);
  win.rotation.y = 0.55;
  g.add(door, win);
  return g;
}

/**
 * Water lying in the grass: an organic outline (no disc, no box), flush with
 * the ground, with a darker wet bank round it and an ink line. rx, rz are its
 * half-sizes; the shape is wobbled by rand so no two are the same.
 */
function puddle(rx, rz, rand, color = C.pond) {
  const g = new THREE.Group();
  const ph = [rand() * 6, rand() * 6], n = 40;
  const outline = (grow) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const r = 1 + 0.12 * Math.sin(a * 2 + ph[0]) + 0.07 * Math.sin(a * 3 + ph[1]);
      pts.push(new THREE.Vector2(Math.cos(a) * (rx * r + grow), Math.sin(a) * (rz * r + grow)));
    }
    return pts;
  };
  const flatShape = (pts, mat, y) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  };
  const bank = flatShape(outline(0.28), flat(C.bark, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), 0.02);
  const water = flatShape(outline(0), flat(color, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 0.035);
  const rim = outline(0).map((p) => new THREE.Vector3(p.x, 0.04, -p.y));
  rim.push(rim[0].clone());
  g.add(bank, water, new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), ink));
  g.userData.outline = (grow) => outline(grow).map((p) => [p.x, -p.y]); // on the ground: x, z
  return g;
}

function pond(rand) {
  const g = puddle(2, 1.4, rand);
  // stones round it, sitting on the bank, never in the water
  for (const [x, z] of g.userData.outline(0.35).filter((_, k) => k % 5 === 0)) {
    const st = stone(rand);
    st.scale.setScalar(0.45);
    st.position.set(x, 0.1, z);
    g.add(st);
  }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.35, 10), flat(C.leaf));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0.6, 0.05, -0.3);
  g.add(pad);
  return g;
}

function fence(x0, x1, z) {
  // one geometry for the whole fence: pickets (a box and a 4-sided tip) and
  // two rails; the rounded boxes cost 150 triangles a picket for nothing seen
  const n = Math.round((x1 - x0) / 1.3), geos = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const p = new THREE.BoxGeometry(0.24, 0.85, 0.16);
    p.translate(x, 0.4, z);
    const tip = new THREE.ConeGeometry(0.17, 0.25, 4);
    tip.rotateY(Math.PI / 4);
    tip.translate(x, 0.92, z);
    geos.push(p.toNonIndexed(), tip.toNonIndexed());
  }
  for (const y of [0.25, 0.6]) {
    const rail = new THREE.BoxGeometry(x1 - x0, 0.1, 0.08);
    rail.translate((x0 + x1) / 2, y, z - 0.1);
    geos.push(rail.toNonIndexed());
  }
  for (const k of geos) for (const a of Object.keys(k.attributes)) if (a !== "position" && a !== "normal") k.deleteAttribute(a);
  const g = new THREE.Group();
  g.add(drawn(mergeGeometries(geos), flat(C.cream)));
  geos.forEach((k) => k.dispose());
  return g;
}

/** A big garden flower: a tall bending stem, a leaf, a wide head of petals. */
function bigFlower(rand) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  const H = 1.6 + rand() * 0.9, lean = (rand() - 0.5) * 0.3;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, H, 6), sway(C.leafDark));
  stem.position.y = H / 2;
  stem.rotation.z = lean;
  // every part sways with the stem (one shader, world-space), or the head and
  // its leaf float off the stem in the wind
  const leafM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 5), sway(C.leaf));
  leafM.scale.set(1, 0.18, 0.45);
  leafM.position.set(0.22, H * 0.35, 0);
  leafM.rotation.z = -0.5;
  const head = new THREE.Group();
  head.position.set(-Math.sin(lean) * H, Math.cos(lean) * H, 0);
  head.rotation.x = -0.5; // faces up and out, towards the camera side
  const colour = [C.petal, C.sun, 0x9b7fd1, 0xf29a6b, C.cream][Math.floor(rand() * 5)];
  const petal = new THREE.SphereGeometry(0.2, 8, 5), pm = sway(colour);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, p = new THREE.Mesh(petal, pm);
    p.scale.set(1, 0.25, 0.55);
    p.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    p.rotation.y = -a;
    head.add(p);
  }
  const heart = grows(new THREE.SphereGeometry(0.16, 10, 6), colour === C.sun ? C.bark : C.sun);
  heart.scale.y = 0.5;
  head.add(heart);
  g.add(stem, leafM, head);
  return g;
}

/** A tiny gnome standing about: a body, a face, a pointed hat. */
function gnomelet(rand) {
  const g = new THREE.Group();
  const body = drawn(new THREE.CylinderGeometry(0.16, 0.22, 0.4, 10), flat([0x5b6fb5, C.leaf, C.bark][Math.floor(rand() * 3)]));
  body.position.y = 0.2;
  const face = drawn(new THREE.SphereGeometry(0.15, 10, 8), flat(C.cream));
  face.position.y = 0.5;
  const hat = drawn(new THREE.ConeGeometry(0.17, 0.42, 10), flat(C.cap));
  hat.position.y = 0.78;
  g.add(body, face, hat);
  return g;
}

/** A gnomelet's umbrella, held at his side: set it on the gnome's own group. */
function brolly(color) {
  const g = new THREE.Group();
  const pole = drawn(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), flat(C.ink));
  pole.position.set(0.22, 0.8, 0);
  const top = drawn(new THREE.ConeGeometry(0.5, 0.22, 8), flat(color));
  top.position.set(0.1, 1.35, 0);
  g.add(pole, top);
  return g;
}

/** A mailbox on a post. */
function mailbox() {
  const g = new THREE.Group();
  const post = drawn(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), flat(C.woodDark));
  post.position.y = 0.45;
  const box = drawn(rbox(0.3, 0.26, 0.45, 0.1), flat(C.cap));
  box.position.y = 1.0;
  g.add(post, box);
  return g;
}

function mushroom(rand) {
  const g = new THREE.Group();
  const r = 0.3 + rand() * 0.25;
  const stem = drawn(new THREE.CylinderGeometry(r * 0.35, r * 0.45, r * 1.4, 8), flat(C.cream));
  stem.position.y = r * 0.7;
  // mostly the red of the bumpers, now and then another wild colour
  const k = rand();
  const color = k < 0.55 ? C.cap : k < 0.7 ? 0xf2a93b : k < 0.85 ? 0x9b7fd1 : 0xc98b5a;
  const cap = drawn(new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(color));
  cap.position.y = r * 1.3;
  g.add(stem, cap);
  return g;
}
function tuft(rand) {
  const g = new THREE.Group();
  g.userData.foot = 0; // its sway is weighed from here (materials.js plantFeet)
  const m = sway(rand() > 0.5 ? C.leaf : C.leafDark);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(tuftGeo, m);
    b.position.set((i - 1) * 0.12, 0.25, (rand() - 0.5) * 0.1);
    b.rotation.z = (i - 1) * 0.35;
    g.add(b);
  }
  return g;
}

/** Bunting between two poles: the one thing here that says "a fête". */
function bunting(a, b) {
  const g = new THREE.Group();
  // a and b are the poles' feet, on the ground (their y); the line hangs at a
  // fixed height, so a pole reaches from its foot up to it. Each sways from
  // its own foot (materials.js plantFeet); line and flags from the lower one
  g.userData.foot = Math.min(a.y, b.y);
  g.userData.flex = 0.6; // the poles, line and flags alike
  const H = 4.2;
  for (const p of [a, b]) {
    const post = new THREE.Group();
    post.userData.foot = p.y;
    post.userData.flex = 0.6;
    const pole = grows(new THREE.CylinderGeometry(0.1, 0.12, H - p.y, 8), C.bark);
    pole.position.set(p.x, (H + p.y) / 2, p.z);
    const knob = grows(new THREE.SphereGeometry(0.2, 10, 8), C.cap);
    knob.position.set(p.x, H + 0.1, p.z);
    post.add(pole, knob);
    g.add(post);
  }
  const n = 13, sag = 0.9, pts = [];
  const colors = [C.cap, C.sun, C.cream, C.pond];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(H - 0.2 - Math.sin(t * Math.PI) * sag));
  }
  // poles, line and pennants all sway with one shader, or the flags drop off the line
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), swayLine(C.ink)));
  const tri = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.28, 0, 0), new THREE.Vector3(0.28, 0, 0), new THREE.Vector3(0, -0.6, 0),
  ]);
  tri.computeVertexNormals();
  // the pennants flap in the shader's wind (sway), so they bake with the rest:
  // one draw for all of them, instead of two per flag
  for (let i = 1; i < n; i++) {
    const f = new THREE.Mesh(tri, sway(colors[i % colors.length], { double: true }));
    f.position.copy(pts[i]);
    f.lookAt(f.position.clone().add(new THREE.Vector3(a.z - b.z, 0, b.x - a.x)));
    g.add(f);
  }
  return g;
}

/** Puffs rising from a chimney: each grows and fades, then starts again. */
const PUFF_GEO = share(new THREE.SphereGeometry(0.22, 10, 8)); // cloned per hole: each batch adds its alphas
const PUFFS = 4;
// A chimney is only a mark where its smoke rises (live: the bake keeps it);
// the hole draws every chimney's puffs in one batch (smokeBatch)
function smoke(at) {
  const g = new THREE.Group();
  g.userData.live = true;
  g.userData.smokeAt = at.clone();
  state.smokes.push(g);
  return g;
}
/** Every chimney's puffs as one instanced draw, each puff faded by its own
 *  alpha; the mesh and its tick, for buildHole. null without a chimney. */
export function smokeBatch(marks) {
  if (!marks.length || !motion) return null; // still: the puffs sat unseen inside the house
  const mat = new THREE.MeshBasicMaterial({ color: C.cloud, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = "attribute float puffAlpha;\nvarying float vPuffA;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vPuffA = puffAlpha;");
    sh.fragmentShader = "varying float vPuffA;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a *= vPuffA;");
  };
  mat.customProgramCacheKey = () => "puff";
  const n = marks.length * PUFFS, geo = PUFF_GEO.clone(), mesh = new THREE.InstancedMesh(geo, mat, n);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("puffAlpha", alpha);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // its puffs move: bounds measured once would be stale
  mesh.userData.live = true;
  const local = new THREE.Matrix4(), world = new THREE.Matrix4(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const tick = (t) => {
    if (!mesh.parent) return;
    marks.forEach((g, c) => {
      const at = g.userData.smokeAt, on = shown(g);
      for (let i = 0; i < PUFFS; i++) {
        const j = c * PUFFS + i;
        if (!on) { mesh.setMatrixAt(j, hide); continue; }
        // as before: in the chimney's own frame, then where the chimney is
        const k = ((t * 0.45 + i / PUFFS) % 1), sc = 0.6 + k * 2.2;
        local.makeScale(sc, sc, sc).setPosition(at.x + Math.sin(k * 5 + i) * 0.25 + k * 0.6, at.y + k * 2.6, at.z);
        mesh.setMatrixAt(j, world.multiplyMatrices(g.matrixWorld, local));
        alpha.array[j] = 0.75 * (1 - k) * Math.min(1, k * 6);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    alpha.needsUpdate = true;
  };
  return { mesh, tick };
}

/** A butterfly: two wings flapping, wandering a loop over the garden. */
function butterfly(rand, cx, cz, color) {
  const g = new THREE.Group();
  const wingGeo = new THREE.CircleGeometry(0.22, 10);
  const mat = flat(color, { side: THREE.DoubleSide });
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const w = new THREE.Mesh(wingGeo, mat);
    w.position.x = side * 0.2;
    w.scale.set(1, 0.75, 1);
    w.rotation.x = -Math.PI / 2;
    pivot.add(w);
    g.add(pivot);
    return { pivot, side };
  });
  g.userData.live = true;
  const a = 3 + rand() * 4, b = 2 + rand() * 3, speed = 0.25 + rand() * 0.2, ph = rand() * 6;
  animate((t) => {
    const u = t * speed + ph;
    g.position.set(cx + Math.sin(u) * a, GRASS + 1.2 + Math.sin(u * 3.1) * 0.35, cz + Math.sin(u * 2) * b);
    g.rotation.y = -Math.atan2(Math.cos(u * 2) * 2 * b, Math.cos(u) * a) + Math.PI / 2;
    const flapA = Math.sin(t * 18 + ph) * 0.9;
    for (const { pivot, side } of wings) pivot.rotation.z = side * flapA;
  });
  return g;
}

const SPARK_GEO = share(new THREE.OctahedronGeometry(0.09, 0)), SPARK_MAT = share(new THREE.MeshBasicMaterial({ color: 0xffffff }));

/** A warp hole: a dark disc with a glowing spiral turning in it, and sparkles. */
function warp(x, y, z, r, color) {
  const g = new THREE.Group();
  g.userData.live = true;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const col = "#" + new THREE.Color(color).getHexString();
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, "#fff");
  grd.addColorStop(0.35, col);
  grd.addColorStop(1, "#144134");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(64, 64, 62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.85)";
  ctx.lineWidth = 5;
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let k = 0; k <= 40; k++) {
      const a = (arm * 2 * Math.PI) / 3 + k * 0.16, rr = 4 + k * 1.45;
      const px = 64 + Math.cos(a) * rr, py = 64 + Math.sin(a) * rr;
      k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ map: texOf(c) }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, y + 0.04, z);
  const rim = drawn(new THREE.TorusGeometry(r, 0.14, 8, 32), flat(color));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(x, y + 0.06, z);
  // the glow lies on the grass: a standing sprite would be cut by the ground
  // into a bright rectangle
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 3.4, r * 3.4),
    new THREE.MeshBasicMaterial({ map: glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(x, y + 0.03, z);
  g.add(disc, rim, glow);
  const sparks = Array.from({ length: 6 }, (_, i) => {
    const sp = new THREE.Mesh(SPARK_GEO, SPARK_MAT);
    g.add(sp);
    return { sp, ph: i };
  });
  animate((t) => {
    disc.rotation.z = -t * 2.2;
    glow.material.opacity = 0.55 + 0.25 * Math.sin(t * 3);
    for (const { sp, ph } of sparks) {
      const k = (t * 0.6 + ph / 6) % 1, a = ph + t * 1.5;
      sp.position.set(x + Math.cos(a) * r * 0.8 * (1 - k), y + 0.2 + k * 1.8, z + Math.sin(a) * r * 0.8 * (1 - k));
      sp.scale.setScalar(1 - k);
    }
  });
  return g;
}

/** A round floating badge with an arrow: down over a tunnel, up over its exit.
 *  A sprite, so it faces the camera from every angle. */
function badge(color, dir, x, y, z) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#144134";
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#" + new THREE.Color(color).getHexString();
  ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fdf6e9";
  ctx.beginPath();
  if (dir === "down") { ctx.moveTo(40, 52); ctx.lineTo(88, 52); ctx.lineTo(64, 90); }
  else { ctx.moveTo(40, 76); ctx.lineTo(88, 76); ctx.lineTo(64, 38); }
  ctx.closePath(); ctx.fill();
  ctx.fillRect(56, dir === "down" ? 30 : 74, 16, 24);
  // drawn over whatever it hangs above (a tube, a wall): a sign, not a solid
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texOf(c), depthTest: false }));
  sp.renderOrder = 10;
  sp.scale.set(1.3, 1.3, 1);
  sp.position.set(x, y, z);
  return sp;
}

/** A mole: a mound of earth and a brown head with a pink nose. */
function mole(p, height) {
  const g = new THREE.Group();
  const [x, z] = p.c;
  const y = height(x, z);
  const mound = drawn(new THREE.SphereGeometry(p.r * 1.25, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), flat(C.bark));
  mound.scale.y = 0.35;
  mound.position.set(x, y, z);
  const head = drawn(new THREE.SphereGeometry(p.r * 0.8, 16, 12), flat(0x6b4a2f));
  head.position.set(x, y + p.r * 0.6, z);
  head.scale.y = 0.9;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.16, 10, 8), flat(C.petal));
  nose.position.set(x, y + p.r * 0.62, z + p.r * 0.76);
  g.add(mound, head, nose);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(p.r * 0.09, 8, 6), flat(C.ink));
    eye.position.set(x + side * p.r * 0.3, y + p.r * 0.95, z + p.r * 0.62);
    g.add(eye);
  }
  return g;
}

/** The mill on the blade's hub: a round tower, a cone roof, four sails turning.
 *  The sails are decoration; what the ball meets is the sweep on the ground. */
function windmill(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const tower = drawn(new THREE.CylinderGeometry(0.85, 1.15, 3.2, 14), flat(C.cream));
  tower.position.y = 1.6;
  const roof = drawn(new THREE.ConeGeometry(1.25, 1.4, 14), flat(C.cap));
  roof.position.y = 3.9;
  const door = drawn(rbox(0.55, 0.9, 0.1, 0.05), flat(C.woodDark));
  door.position.set(0, 0.45, 1.1);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), flat(C.sun));
  win.position.set(0, 2.2, 0.95);
  group.add(tower, roof, door, win);
  // the sails, on a hub facing the camera side
  const hub = new THREE.Group();
  hub.position.set(0, 3.1, 1.05);
  const cap = drawn(new THREE.SphereGeometry(0.22, 10, 8), flat(C.woodDark));
  hub.add(cap);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2;
    const spar = drawn(rbox(0.12, 2.6, 0.08, 0.04), flat(C.woodDark));
    spar.position.y = 1.3;
    const sail = drawn(rbox(0.7, 1.9, 0.05, 0.03), flat(C.cream));
    sail.position.set(0.42, 1.55, 0.03);
    arm.add(spar, sail);
    hub.add(arm);
  }
  group.add(hub);
  return { group, hub, spin: (t) => (hub.rotation.z = -t * 0.9) };
}

export { smoke, lantern, fireflies, tree, bush, stone, flower, bigFlower, gnomelet, brolly, mailbox, signpost, hill, house, pond, puddle, fence, mushroom, tuft, bunting, butterfly, warp, badge, mole, windmill };
