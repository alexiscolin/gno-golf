// What a gnome of the collection leaves behind as he rolls (a trail) and what
// the cup does when he drops in (a holing), within the limits that keep the
// game readable (docs/gnomes/design.md, "Never in the way"): a trail is behind
// the ball, under the aim, without depth writes, at most 0.6 opaque and 1.5
// long, gone 0.6 s after he stops; a holing starts after the drop, lasts at
// most 1.5 s, never flashes the screen. One instanced draw each (a ribbon is
// one mesh). Under reduced motion, neither: the game's confetti stands.
import * as THREE from "three";
import { motion, share } from "./materials";
import type { Skin } from "./gnome";
import type { Holing, Trail as TrailKind } from "../gnomes/vocab";

const MAX_LEN = 1.5, MAX_ALPHA = 0.6, FADE_S = 0.6;

/** A particle's look and motion: its shape, how it leaves (up, out), what pulls it (gravity, minus to rise), its spin, how it grows. */
interface Motion { geo: THREE.BufferGeometry; up: number; out: number; g: number; spin: number; grow: number; lit?: boolean }
const NOTE = (() => {
  // a quaver: its head and its stem, one geometry
  const head = new THREE.SphereGeometry(0.06, 6, 4).scale(1.2, 0.9, 0.6), stem = new THREE.BoxGeometry(0.018, 0.16, 0.018).translate(0.06, 0.08, 0);
  const pos = [...head.toNonIndexed().attributes.position.array, ...stem.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return share(g);
})();
const SHAPES: Record<string, Motion> = {
  sparks: { geo: share(new THREE.OctahedronGeometry(0.05, 0)), up: 2.5, out: 2, g: 9, spin: 8, grow: -1, lit: true },
  shavings: { geo: share(new THREE.TorusGeometry(0.06, 0.018, 4, 8, Math.PI * 1.4)), up: 2, out: 1.4, g: 6, spin: 6, grow: 0 },
  shards: { geo: share(new THREE.TetrahedronGeometry(0.07, 0)), up: 2.6, out: 1.8, g: 8, spin: 7, grow: 0 },
  embers: { geo: share(new THREE.IcosahedronGeometry(0.04, 0)), up: 1.6, out: 0.8, g: -1.5, spin: 3, grow: -1, lit: true },
  petals: { geo: share(new THREE.SphereGeometry(0.07, 6, 4).scale(1, 0.3, 0.7)), up: 1.8, out: 1.6, g: 3, spin: 5, grow: 0 },
  spores: { geo: share(new THREE.SphereGeometry(0.035, 6, 4)), up: 0.8, out: 0.6, g: -1, spin: 0, grow: 0.5, lit: true },
  snow: { geo: share(new THREE.IcosahedronGeometry(0.05, 0)), up: 1.2, out: 1.2, g: 2, spin: 2, grow: 0 },
  bubbles: { geo: share(new THREE.TorusGeometry(0.05, 0.012, 4, 10)), up: 1, out: 0.7, g: -2, spin: 1, grow: 0.6 },
  leaves: { geo: share(new THREE.SphereGeometry(0.07, 6, 4).scale(0.5, 0.2, 1.2)), up: 1.8, out: 1.6, g: 3, spin: 6, grow: 0 },
  stars: { geo: share(new THREE.OctahedronGeometry(0.07, 0).scale(1, 1, 0.35)), up: 2.4, out: 1.6, g: 6, spin: 4, grow: 0, lit: true },
  notes: { geo: NOTE, up: 1.6, out: 1, g: -0.5, spin: 1.5, grow: 0 },
  dust: { geo: share(new THREE.IcosahedronGeometry(0.08, 0)), up: 0.6, out: 1, g: -0.4, spin: 1, grow: 1.4 },
  crumbs: { geo: share(new THREE.BoxGeometry(0.06, 0.04, 0.05)), up: 2, out: 1.6, g: 9, spin: 8, grow: 0 },
  feathers: { geo: share(new THREE.SphereGeometry(0.06, 6, 4).scale(0.35, 0.15, 1.5)), up: 2, out: 1.2, g: 1.5, spin: 3, grow: 0 },
  steam: { geo: share(new THREE.IcosahedronGeometry(0.1, 1)), up: 1.4, out: 0.4, g: -0.8, spin: 0.5, grow: 2 },
};

// the particles not lit by themselves: one toon a colour, shared (never freed
// with a swarm, so its shader is never linked again); unbanded, as the gnomes'
// recorded looks hold them (data/gnomes/looks.golden.json)
const toons = new Map<number, THREE.MeshToonMaterial>();
const toonOf = (color: number) => {
  let m = toons.get(color);
  if (!m) toons.set(color, (m = share(new THREE.MeshToonMaterial({ color }))));
  return m;
};

/** A swarm of particles in one instanced draw: spawn, then step(dt). */
function swarm(kind: Motion, color: number, n: number, life: number) {
  const mat = kind.lit
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
    : toonOf(color);
  const mesh = new THREE.InstancedMesh(kind.geo, mat, n);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const ps = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), age: Infinity }));
  const o = new THREE.Object3D();
  let next = 0;
  const hide = () => (o.scale.setScalar(0), o.updateMatrix(), o.matrix);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, hide());
  return {
    mesh,
    /** One more, at p, thrown up and out (scale: how hard, 0..1). */
    spawn(p: THREE.Vector3, scale = 1) {
      const q = ps[next++ % n], a = Math.random() * Math.PI * 2;
      q.p.copy(p);
      q.v.set(Math.cos(a) * kind.out * scale * Math.random(), kind.up * scale * (0.6 + Math.random() * 0.6), Math.sin(a) * kind.out * scale * Math.random());
      q.r.set(Math.random() * 6, Math.random() * 6, 0);
      q.age = 0;
    },
    step(dt: number) {
      let alive = false;
      ps.forEach((q, i) => {
        q.age += dt;
        if (q.age >= life) return mesh.setMatrixAt(i, hide());
        alive = true;
        q.v.y -= kind.g * dt;
        q.p.addScaledVector(q.v, dt);
        q.r.x += kind.spin * dt;
        q.r.y += kind.spin * 0.7 * dt;
        const k = q.age / life;
        o.position.copy(q.p);
        o.rotation.copy(q.r);
        o.scale.setScalar(Math.max(0.001, (1 + kind.grow * k) * (k > 0.7 ? (1 - k) / 0.3 : 1)));
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      return alive;
    },
  };
}

/** A trail: push(ball) each frame he rolls (where he is now, the scene's clock in s), step(t) every frame. */
export interface GnomeTrail {
  group: THREE.Object3D;
  push(at: THREE.Vector3, t: number): void;
  step(t: number): void;
  clear(): void;
}

// a ribbon's kinds: a flat band along the ground behind him; the rest are particles
const RIBBONS: Partial<Record<TrailKind, { width: number; alpha: number; additive?: boolean }>> = {
  ribbon: { width: 0.44, alpha: MAX_ALPHA },
  light: { width: 0.3, alpha: MAX_ALPHA, additive: true },
  streaks: { width: 0.5, alpha: 0.45 },
  foam: { width: 0.5, alpha: 0.5 },
};

/** A ribbon of up to 24 segments along the ground, tapering to its tail. */
function ribbon(color: number, { width, alpha, additive }: { width: number; alpha: number; additive?: boolean }): GnomeTrail {
  const N = 24, pts: { p: THREE.Vector3; t: number }[] = [];
  const pos = new Float32Array(N * 2 * 3), g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const idx: number[] = [];
  for (let i = 0; i < N - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  g.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1; // under the aim's dots
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let last = 0;
  const draw = () => {
    // each point a pair of vertices across the trail, narrowing to the tail and cut at MAX_LEN
    let len = 0;
    for (let i = 0; i < N; i++) {
      const k = Math.min(i, pts.length - 1), c = pts[k].p;
      if (i > 0 && i < pts.length) len += c.distanceTo(pts[i - 1].p);
      side.subVectors(pts[Math.max(0, k - 1)].p, pts[Math.min(k + 1, pts.length - 1)].p).cross(up);
      if (side.lengthSq() < 1e-9) side.set(1, 0, 0);
      const w = i >= pts.length || len > MAX_LEN ? 0 : (width / 2) * (1 - i / N) * (1 - len / MAX_LEN);
      side.normalize().multiplyScalar(w);
      pos.set([c.x + side.x, c.y, c.z + side.z, c.x - side.x, c.y, c.z - side.z], i * 6);
    }
    g.attributes.position.needsUpdate = true;
  };
  return {
    group: mesh,
    push(at, t) {
      last = t;
      const p = at.clone();
      if (pts.length && pts[0].p.distanceTo(p) < 0.06) return;
      pts.unshift({ p, t });
      pts.length = Math.min(pts.length, N);
      draw();
    },
    step(t) {
      // once he stops, it shortens from its tail and is gone within FADE_S
      const k = Math.min(1, (t - last) / FADE_S);
      mat.opacity = alpha * (1 - k);
      mesh.visible = k < 1 && pts.length > 1;
    },
    clear() {
      pts.length = 0;
      mesh.visible = false;
    },
  };
}

/** A gnome's trail (Skin.trail), or null: none, or reduced motion. */
export function makeTrail(skin: Skin): GnomeTrail | null {
  if (!skin.trail || !motion) return null;
  const color = skin.trailColor ?? 0xffffff, rib = RIBBONS[skin.trail];
  if (rib) return ribbon(color, rib);
  const s = swarm(SHAPES[skin.trail] ?? SHAPES.stars, color, 24, FADE_S);
  let last = -1, prev = 0;
  return {
    group: s.mesh,
    push(at, t) {
      // a particle every 50 ms he rolls, dropped where he was, thrown lightly
      if (t - last > 0.05) (last = t), s.spawn(at, 0.25);
    },
    step(t) {
      s.step(Math.min(0.05, prev ? t - prev : 0));
      prev = t;
    },
    clear() {
      s.step(FADE_S * 2);
    },
  };
}

/** A holing effect, the game's confetti's shape: { group, step(dt) } that says whether it is still going. */
export interface Holed {
  group: THREE.Group;
  step(dt: number): boolean;
}

const BURST_S = 1.5;
/** The burst out of the cup: what each kind throws, and how many. */
const BURSTS: Partial<Record<Holing, { shape: string; n: number }>> = {
  sparks: { shape: "sparks", n: 32 }, shavings: { shape: "shavings", n: 24 }, shards: { shape: "shards", n: 28 },
  embers: { shape: "embers", n: 32 }, petals: { shape: "petals", n: 28 }, spores: { shape: "spores", n: 32 },
  bubbles: { shape: "bubbles", n: 20 }, leaves: { shape: "leaves", n: 24 }, stars: { shape: "stars", n: 24 },
  notes: { shape: "notes", n: 14 }, steam: { shape: "steam", n: 10 }, crumbs: { shape: "crumbs", n: 28 },
  feathers: { shape: "feathers", n: 18 }, avalanche: { shape: "snow", n: 32 }, gale: { shape: "petals", n: 32 },
};

/** A ring that spreads from the cup and fades: a pulse of light, a ripple. */
function ring(at: THREE.Vector3, color: number, delay: number, lit: boolean) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: lit ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.copy(at).setY(at.y + 0.05);
  return {
    m,
    step(t: number) {
      const k = Math.max(0, t - delay) / 1.1;
      m.scale.setScalar(0.3 + k * 2);
      m.material.opacity = k > 0 && k < 1 ? (lit ? 0.7 : 0.8) * (1 - k) : 0;
    },
  };
}

/**
 * A gnome's holing (Skin.holing) at the cup (its centre on the ground), or
 * null: the game's confetti then (none of his own, or reduced motion). Starts
 * when made: the engine makes it after the drop.
 */
export function makeHoling(skin: Skin, cup: THREE.Vector3): Holed | null {
  if (!skin.holing || !motion) return null;
  const color = skin.holingColor ?? 0xffd98a, group = new THREE.Group();
  const parts: { step(t: number): void }[] = [];
  let t = 0;
  const kind = skin.holing;
  if (kind === "pulse" || kind === "ripples" || kind === "splash") {
    for (const d of [0, 0.25, 0.5]) {
      const r = ring(cup, kind === "splash" ? 0xffffff : color, d, kind === "pulse");
      group.add(r.m);
      parts.push(r);
    }
  }
  const burst = BURSTS[kind] ?? (kind === "splash" ? { shape: "bubbles", n: 16 } : kind === "bolt" ? { shape: "sparks", n: 24 } : null);
  if (burst) {
    const s = swarm(SHAPES[burst.shape], kind === "splash" ? 0x79c0e8 : color, burst.n, BURST_S);
    group.add(s.mesh);
    // the avalanche falls in over the rim; the gale blows across; the rest come up out of the cup
    const from = cup.clone().setY(cup.y + (kind === "avalanche" ? 1.4 : 0.1));
    for (let i = 0; i < burst.n; i++) s.spawn(from, kind === "avalanche" ? 0.6 : 1);
    let prev = 0;
    parts.push({ step: (now) => (s.step(now - prev), (prev = now), kind === "gale" && (s.mesh.position.x = now * 1.6)) });
  }
  if (kind === "bolt") {
    // a bolt down into the cup: three lit strokes, there for a moment
    const bolt = new THREE.Group();
    [[0, 2.1, 0.4], [0.18, 1.45, -0.5], [0, 0.75, 0.4]].forEach(([x, y, r]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.75, 0.05), new THREE.MeshBasicMaterial({ color }));
      b.position.set(cup.x + x, cup.y + y, cup.z);
      b.rotation.z = r;
      bolt.add(b);
    });
    group.add(bolt);
    parts.push({ step: (now) => (bolt.visible = now < 0.25) });
  }
  return {
    group,
    step(dt) {
      t += dt;
      for (const p of parts) p.step(t);
      return t < BURST_S;
    },
  };
}
