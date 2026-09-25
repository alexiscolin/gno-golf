import * as THREE from "three";
import { BALL_R } from "../terrain";
import { C, flat, drawn, clipTo, share, disposeCourse } from "./materials";
import { makeRenderer, makeScene } from "./camera";
import { state } from "./state";
import type { Aim, Height, WaterMask } from "./data";
import type { Vec2 } from "../types";

/** The elastic: its strap and its grip. */
export interface Band extends THREE.Group {
  userData: { strap: THREE.Object3D; grip: THREE.Object3D };
}

// made once, used by every splash and every confetti burst
const RING_GEO = share(new THREE.RingGeometry(0.8, 1, 32)), DROP_GEO = share(new THREE.SphereGeometry(0.09, 6, 5));
const HAT_GEO = share(new THREE.ConeGeometry(0.16, 0.36, 8)), PETAL_GEO = share(new THREE.SphereGeometry(0.13, 8, 6).scale(1, 0.35, 0.7));

/** Into the water: rings spreading out and a few drops thrown up. */
// How far the water reaches from a point before the bank, from the hole's
// water mask: a splash's rings stop short of it even if clipping is off.
function toShore(at: THREE.Vector3, water: WaterMask | null, reach = 3) {
  if (!water) return reach;
  const { data, nx, nz, cell } = water;
  const wet = (x: number, z: number) => {
    const i = Math.floor(x / cell), j = Math.floor(z / cell);
    return i >= 0 && j >= 0 && i < nx && j < nz && data[(j * nx + i) * 4 + 1] > 0;
  };
  let best = reach;
  for (let dx = -reach; dx <= reach; dx += cell / 2)
    for (let dz = -reach; dz <= reach; dz += cell / 2) {
      const d = Math.hypot(dx, dz);
      if (d < best && !wet(at.x + dx, at.z + dz)) best = d;
    }
  return best;
}

// open: in open water (the sea under a pier, a gap's water): not clipped to
// the green's ponds, which do not reach there
export function makeSplash(at: THREE.Vector3, { open = false } = {}) {
  const group = new THREE.Group();
  const room = open ? 2.4 : Math.max(0.35, toShore(at, state.water) - 0.15); // the rings' widest
  const rings = [0, 0.25, 0.5].map((delay) => {
    const m = new THREE.Mesh(
      RING_GEO,
      // only over the water: a ring at the bank would spread onto the grass
      clipTo(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), open ? null : state.water)
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(at.x, at.y - 0.45, at.z);
    group.add(m);
    return { m, delay };
  });
  const drops = Array.from({ length: 10 }, () => {
    const d = new THREE.Mesh(DROP_GEO, flat(C.pond));
    d.position.set(at.x, at.y - 0.3, at.z);
    const a = Math.random() * Math.PI * 2;
    group.add(d);
    return { d, v: new THREE.Vector3(Math.cos(a) * 2, 5 + Math.random() * 2, Math.sin(a) * 2) };
  });
  let last = 0;
  return {
    group,
    step(t: number) {
      const dt = t - last;
      last = t;
      for (const { m, delay } of rings) {
        const k = Math.max(0, t - delay) / 1.1;
        m.scale.setScalar(Math.min(room, 0.3 + k * 2.2));
        m.material.opacity = Math.max(0, 0.8 * (1 - k));
      }
      for (const p of drops) {
        p.v.y -= 16 * dt;
        p.d.position.addScaledVector(p.v, dt);
        p.d.visible = p.d.position.y > at.y - 0.5;
      }
    },
  };
}

/** Holed: a burst out of the cup. Pointy hats, petals and leaves — the
 *  garden's own confetti. Returns a step(dt) that says whether it is still alive. */
// Two instanced draws (hats, petals) for all 70 pieces, each its own colour.
export function makeConfetti(cup: Vec2, y = 0) {
  const group = new THREE.Group();
  const colors = [C.cap, C.sun, 0x5b6fb5, 0xe98fb0, C.cream, C.leaf];
  const N = 70, white = flat(0xffffff), col = new THREE.Color();
  const hats = new THREE.InstancedMesh(HAT_GEO, white, Math.ceil(N / 3)), petals = new THREE.InstancedMesh(PETAL_GEO, white, N - Math.ceil(N / 3));
  for (const m of [hats, petals]) (m.frustumCulled = false), m.instanceMatrix.setUsage(THREE.DynamicDrawUsage), group.add(m);
  const parts: { m: THREE.Object3D; mesh: THREE.InstancedMesh; k: number; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
  for (let i = 0; i < N; i++) {
    const mesh = i % 3 ? petals : hats, k = i % 3 ? i - Math.ceil(i / 3) : i / 3;
    mesh.setColorAt(k, col.set(colors[i % colors.length]));
    const o = new THREE.Object3D();
    o.position.set(cup[0], y + 0.3, cup[1]);
    const a = Math.random() * Math.PI * 2, out = 2 + Math.random() * 4;
    parts.push({ m: o, mesh, k, v: new THREE.Vector3(Math.cos(a) * out, 9 + Math.random() * 7, Math.sin(a) * out),
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
  }
  let age = 0;
  const step = (dt: number) => {
    age += dt;
    for (const p of parts) {
      p.v.y -= 18 * dt;
      p.v.multiplyScalar(1 - 1.2 * dt); // air: they float down instead of dropping
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < y + 0.05) { p.m.position.y = y + 0.05; p.v.set(0, 0, 0); }
      else p.m.rotation.set(p.m.rotation.x + p.spin.x * dt, p.m.rotation.y + p.spin.y * dt, p.m.rotation.z + p.spin.z * dt);
      if (age > 2.6) p.m.scale.multiplyScalar(1 - 3 * dt);
      p.m.updateMatrix();
      p.mesh.setMatrixAt(p.k, p.m.matrix);
    }
    hats.instanceMatrix.needsUpdate = petals.instanceMatrix.needsUpdate = true;
    return age < 3.6;
  };
  step(0);
  return { group, step };
}

/** The elastic: from the gnome back toward the pull, stretched with the power. */
export function makeBand(): Band {
  const g = new THREE.Group() as Band;
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 10), flat(C.cap));
  strap.rotation.z = Math.PI / 2; // lie along x, then the group turns it
  const grip = drawn(new THREE.SphereGeometry(0.28, 12, 9), flat(C.cap));
  g.add(strap, grip);
  g.userData = { strap, grip };
  g.visible = false;
  return g;
}

export function bandTo(band: Band, from: { x: number; y: number }, angleRad: number, power: number, y = BALL_R) {
  const len = 0.8 + (power / 10) * 4.2;
  const { strap, grip } = band.userData;
  band.position.set(from.x, y, from.y);
  band.rotation.y = -(angleRad + Math.PI); // points backwards, away from the shot
  const thick = 0.13 - (power / 10) * 0.07; // it thins as it stretches
  strap.scale.set(thick, len, thick);
  strap.position.x = len / 2;
  grip.position.x = len;
}

/** The dotted aim line, straight from the reference: dots along the path.
 *  One instanced mesh, one draw call, whatever the number of dots. */
export function makeAim(count = 48): Aim {
  const g = new THREE.Group() as Aim;
  // opaque and drawn over the ground: seen in rain, fog and on pale sand
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }), count);
  dots.renderOrder = 5;
  dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dots.setColorAt(0, new THREE.Color(1, 1, 1));
  dots.count = 0;
  dots.frustumCulled = false;
  g.add(dots);
  g.userData.dots = dots;
  g.visible = false;
  return g;
}

// scratch for aimAlong, which runs on every pointer move
const _m = new THREE.Matrix4(), _c = new THREE.Color(), FADED = new THREE.Color(0xb9d6c8), WHITE = new THREE.Color(1, 1, 1);

// tint(i, x, z) -> a THREE.Color (or null) colours dot i: where wind or a
// slope bends the path, the engine can say so
export function aimAlong(aim: Aim, path: readonly Vec2[], power: number, height: Height, landing: (p: Vec2, q: Vec2) => string | null = () => null, tint: ((i: number, x: number, z: number) => THREE.Color | null) | null = null) {
  const dots = aim.userData.dots!, cap = dots.instanceMatrix.count;
  const k = power / 10;
  const reach = 2 + k * 16;
  const gap = 0.7;
  const size = 0.7 + k * 0.7; // never so small it gets lost
  const m = _m, c = _c;
  let left = reach, next = gap * 0.8, used = 0;
  for (let i = 0; i + 1 < path.length && left > 0 && used < cap; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    const jump = landing(path[i], path[i + 1]);
    if (jump === "hazard") break; // in the water: the dots stop at the bank
    if (jump === "tunnel") { next = gap * 0.8; continue; } // no dots underground; they resume at the exit
    let d = next;
    while (d <= l && left - d > 0 && used < cap) {
      const x = ax + ((bx - ax) * d) / l, z = az + ((bz - az) * d) / l;
      const fade = 1 - (reach - left + d) / reach;
      const sc = size * (0.7 + 0.3 * fade);
      m.makeScale(sc, sc, sc).setPosition(x, height(x, z) + 0.35, z);
      dots.setMatrixAt(used, m);
      // the far end fades into the green (one material, so by colour)
      // white, greying a little towards the end; a tint (wind, a slope) shows
      // as a clear colour but never so dark the dot disappears
      c.copy(FADED).lerp(WHITE, 0.6 + 0.4 * fade);
      const tc = tint && tint(used, x, z);
      if (tc) c.lerp(tc, 0.5);
      dots.setColorAt(used, c);
      used++;
      d += gap;
    }
    left -= l;
    next = d - l;
  }
  dots.count = used;
  dots.visible = used > 0;
  dots.instanceMatrix.needsUpdate = true;
  if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
}
export type Confetti = ReturnType<typeof makeConfetti>;

/** A cup won: two confetti bursts up from under a transparent canvas laid
 *  over the page, one each side, gone once they fall. Returns its stop(). */
export function cheer(canvas: HTMLCanvasElement) {
  const renderer = makeRenderer(canvas), scene = makeScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  // the view's foot a little above where they land: they fall back out of it
  // rather than piling up over the page
  camera.position.set(0, 0.3, 9);
  camera.lookAt(0, 0.3, 0);
  const bursts = [makeConfetti([0, 0], -3.6), makeConfetti([0, 0], -3.6)];
  for (const b of bursts) scene.add(b.group);
  let alive = true, last = performance.now();
  const stop = () => {
    if (!alive) return;
    alive = false;
    for (const b of bursts) disposeCourse(b.group);
    renderer.dispose();
    renderer.forceContextLoss();
  };
  const tick = (now: number) => {
    if (!alive) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // each burst halfway out to its edge, whatever the screen's shape, and
      // smaller on a narrow one (a phone), still landing out of sight
      const edge = 9 * Math.tan(THREE.MathUtils.degToRad(20)) * camera.aspect, k = camera.aspect < 1 ? 0.65 : 1;
      bursts.forEach((b, i) => (b.group.scale.setScalar(k), b.group.position.set((i ? 1 : -1) * edge * 0.6, -3.6 * (1 - k), 0)));
    }
    const dt = Math.min(Math.max(now - last, 0) / 1000, 0.05); // a frame's time can come before the start
    last = now;
    let busy = false;
    for (const b of bursts) busy = b.step(dt) || busy;
    renderer.render(scene, camera);
    if (busy) requestAnimationFrame(tick);
    else stop();
  };
  requestAnimationFrame(tick);
  return stop;
}
