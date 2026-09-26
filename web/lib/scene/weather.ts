// The weather over a hole, as the chain has it for the stroke: zones that
// cover the board, skinned "wind" (a slope: vec is the push), "rain" (a
// slippier green), "fog" and "storm" (for the eye only). This draws what
// they mean — rain falling, wind lines running, fog — and says what the
// weather is, for the HUD. Lightning is the page's: a flash over everything.
import * as THREE from "three";
import { mod } from "../terrain";
import { motion } from "./materials";
import type { Forecast, MutVec2, Zone } from "../types";

/** The weather drawn now, for the HUD and the decor: null for none. */
export interface WeatherNow {
  wind: MutVec2 | null;
  rain: boolean;
  fog: boolean;
  storm: boolean;
  snow: boolean;
}
/** A zone as the weather reads it: the chain's, or one ?weather= fakes. */
export type WeatherZone = Pick<Zone, "skin" | "vec"> & Partial<Zone>;

/** The zone skins that are weather (drawn here, not as pieces of the course). */
export const WEATHER_SKINS: readonly string[] = ["wind", "rain", "fog", "storm", "snow"];

const RAIN = 1500, TRAILS = 16, BITS = 30, SPLASH = 40, BANKS = 16, CLOUDS = 12;

// A Wind Waker gust: a flat white ribbon that runs straight along the wind,
// then curls into a loop at its tip. Built once, along +x, lying flat (it is
// seen from above); the drawn part slides along it — the head grows out, the
// tail follows, and it is gone.
const STEPS = 64;
function trailGeometry(len: number, curl: number) {
  const pts: MutVec2[] = [];
  for (let k = 0; k <= STEPS; k++) {
    const u = k / STEPS;
    if (u < 0.62) pts.push([(u / 0.62) * len, 0]);
    else {
      // the curl: a spiral that tightens, turning up-wind of its start
      const a = ((u - 0.62) / 0.38) * Math.PI * 1.75, r = curl * (1 - 0.35 * ((u - 0.62) / 0.38));
      pts.push([len + Math.sin(a) * r, curl - Math.cos(a) * r]);
    }
  }
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= STEPS; k++) {
    const [x, z] = pts[k], [nx, nz] = pts[Math.min(k + 1, STEPS)], [px, pz] = pts[Math.max(k - 1, 0)];
    let dx = nx - px, dz = nz - pz;
    const l = Math.hypot(dx, dz) || 1;
    (dx /= l), (dz /= l);
    const w = 0.26 * Math.sin(Math.PI * Math.min(1, (k / STEPS) * 1.15)) + 0.03; // tapered both ends
    pos.push(x - dz * w, 0, z + dx * w, x + dz * w, 0, z - dx * w);
    if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k, 2 * k - 1, 2 * k + 1, 2 * k);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

// what the wind carries, per world: leaves and petals, grains of sand, paper confetti
const BITS_OF: Record<string, readonly number[]> = {
  garden: [0x7fb85a, 0xe98fb0, 0xf2b94a, 0x5b9a7d],
  island: [0xf0d9a0, 0xe8cc88, 0xfff4d6],
  town: [0xe25248, 0xf5b83d, 0x5b6fb5, 0xffffff],
  mountain: [0xffffff, 0xeef6fb, 0xdde9f2], // snowflakes
};

// a soft round blob, for fog banks
let blobTex: THREE.CanvasTexture | null = null;
function blob() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (blobTex = new THREE.CanvasTexture(c));
}

// a storm cloud, drawn like the rest of the game: a flat puffy shape, slate
// shaded to a dark belly, a pale rim on its top and an inked outline
let cloudTex: THREE.CanvasTexture | null = null;
function stormCloud() {
  if (cloudTex) return cloudTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d")!;
  // the puffs: [x, y, r], a flat bottom under them
  const puffs = [[52, 84, 30], [92, 62, 40], [142, 54, 46], [188, 68, 36], [214, 88, 24]] as const;
  const shape = (grow: number, dy = 0) => {
    x.beginPath();
    for (const [px, py, r] of puffs) (x.moveTo(px + r + grow, py + dy), x.arc(px, py + dy, r + grow, 0, Math.PI * 2));
    x.rect(40 - grow, 84, 176 + 2 * grow, 22 + grow);
  };
  x.fillStyle = "#1c2433"; // the ink
  shape(5), x.fill();
  x.fillStyle = "#9aa6b8"; // the rim the light catches
  shape(0), x.fill();
  x.clip();
  const g = x.createLinearGradient(0, 20, 0, 110);
  g.addColorStop(0, "#66728a");
  g.addColorStop(1, "#353e50");
  x.fillStyle = g;
  shape(0, 6), x.fill();
  cloudTex = new THREE.CanvasTexture(c);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  return cloudTex;
}

// A stand-in for one piece of a batch: the transform and look the tick code
// sets, written into the batch's instances once a frame (flush). A handful of
// draw calls for all the weather, however many drops, gusts and banks.
interface Proxy extends THREE.Object3D {
  material: { color: THREE.Color; opacity: number };
  /** a gust's drawn part: its first and last steps along the ribbon */
  range?: [number, number];
}
const proxy = (color = 0xffffff, opacity = 1): Proxy => {
  const o = new THREE.Object3D() as Proxy;
  o.visible = false;
  o.material = { color: new THREE.Color(color), opacity };
  return o;
};
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

/** The puddles as one fan each: the chain's ellipse, every spoke from its
 *  middle stopped where the lane ends (dry: where rain can lie). */
function puddleGeo(zones: readonly Zone[], dry: (x: number, z: number) => boolean) {
  const pos: number[] = [], N = 24;
  for (const q of zones) {
    const cx = (q.min[0] + q.max[0]) / 2, cz = (q.min[1] + q.max[1]) / 2, rx = (q.max[0] - q.min[0]) / 2, rz = (q.max[1] - q.min[1]) / 2;
    if (!dry(cx, cz)) continue;
    const rim: MutVec2[] = [];
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2, dx = Math.cos(a) * rx, dz = Math.sin(a) * rz;
      let f = 0;
      while (f < 1 && dry(cx + dx * (f + 0.04), cz + dz * (f + 0.04))) f += 0.04;
      rim.push([cx + dx * Math.min(1, f), cz + dz * Math.min(1, f)]);
    }
    for (let k = 0; k < N; k++) {
      const a = rim[k], b = rim[(k + 1) % N];
      pos.push(cx, 0.03, cz, b[0], 0.03, b[1], a[0], 0.03, a[1]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

export function makeWeather(scene: THREE.Scene, { onFlash = () => {}, camera = null }: { onFlash?: () => void; camera?: THREE.Camera | (() => THREE.Camera) | null } = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  let W = 40, H = 10, now: WeatherNow | null = null, area = { x: -8, z: -8, w: 56, d: 26 };

  // rain: short streaks, recycled from the top as they reach the ground
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 6);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.7, depthWrite: false }));
  rain.frustumCulled = false;
  group.add(rain);
  const drops = Array.from({ length: RAIN }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
  const seed = (d: (typeof drops)[number], top: boolean) => {
    d.x = area.x + Math.random() * area.w;
    d.z = area.z + Math.random() * area.d;
    d.y = top ? 9 + Math.random() * 3 : Math.random() * 12;
    d.v = 16 + Math.random() * 6;
  };
  drops.forEach((d) => seed(d, false));

  // wind: Wind Waker gusts, and bits carried along
  // the gusts: one mesh for all of them, each ribbon's vertices moved on the
  // CPU into place and faded through a per-vertex alpha
  const V = (STEPS + 1) * 2;
  const trails = Array.from({ length: TRAILS }, (_, n) => {
    const geo = trailGeometry(3 + Math.random() * 3, 0.45 + Math.random() * 0.35);
    const m = proxy(0xffffff, 0);
    m.range = [0, 0];
    return { m, local: geo.attributes.position.array, idx: geo.index!.array, t: n / TRAILS, life: 1.6 + Math.random() * 0.8, x: 0, z: 0, y: 1 };
  });
  const trailPos = new Float32Array(TRAILS * V * 3), trailCol = new Float32Array(TRAILS * V * 4).fill(1);
  const trailIdx: number[] = [];
  trails.forEach((tr, k) => { for (const i of tr.idx) trailIdx.push(i + k * V); });
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 4));
  trailGeo.setIndex(trailIdx);
  const trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  trailMesh.frustumCulled = false;
  group.add(trailMesh);
  const bitGeo = new THREE.PlaneGeometry(0.16, 0.1);
  const bitMesh = new THREE.InstancedMesh(bitGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), BITS);
  bitMesh.frustumCulled = false;
  bitMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BITS * 3).fill(1), 3);
  group.add(bitMesh);
  const bits = Array.from({ length: BITS }, () => ({ m: proxy(), x: 0, y: 0, z: 0, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), ph: Math.random() * 6 }));
  let palette = BITS_OF.garden;
  const reseedBit = (b: (typeof bits)[number], anywhere: boolean) => {
    b.x = area.x + Math.random() * area.w;
    b.z = area.z + Math.random() * area.d;
    b.y = 0.4 + Math.random() * 2.6;
    if (!anywhere) {
      // in again from the up-wind side
      const [wx, wz] = (now && now.wind) || [1, 0], l = Math.hypot(wx, wz) || 1;
      b.x = W / 2 - (wx / l) * (area.w / 2) + (Math.random() - 0.5) * area.w * 0.3;
      b.z = H / 2 - (wz / l) * (area.d / 2) + (Math.random() - 0.5) * area.d * 0.6;
    }
    b.m.material.color.setHex(palette[Math.floor(Math.random() * palette.length)]);
    b.m.position.set(b.x, b.y, b.z);
  };
  // gusts over the course only (round it, one ran across the lens in the Far view)
  const reseedTrail = (tr: (typeof trails)[number]) => {
    tr.x = -1 + Math.random() * (W + 2);
    tr.z = -1 + Math.random() * (H + 2);
    tr.y = 0.8 + Math.random() * 2.2;
    tr.t = 0;
    tr.life = 1.6 + Math.random() * 0.8;
  };

  // splashes where rain lands on the green, and puddles that gather
  // a ring fades by turning from white to the wet green it lies on
  const ringGeo = new THREE.RingGeometry(0.08, 0.14, 16);
  const ringMesh = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), SPLASH);
  ringMesh.frustumCulled = false;
  ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SPLASH * 3).fill(1), 3);
  group.add(ringMesh);
  const splashes = Array.from({ length: SPLASH }, () => {
    const m = proxy(0xffffff, 0);
    m.rotation.x = -Math.PI / 2;
    return { m, t: Math.random() };
  });
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x5f8fa8, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  // one mesh for all of them, rebuilt when the weather is set (not per frame)
  const puddleMesh = new THREE.Mesh(new THREE.BufferGeometry(), puddleMat);
  puddleMesh.frustumCulled = false;
  group.add(puddleMesh);
  let wet = 0; // how far the puddles have gathered, 0..1
  let green: (x: number, z: number) => boolean = () => true; // where the lane is: puddles and splashes stay on it
  const onLane = (x: number, z: number, r = 0) => green(x, z) && green(x - r, z) && green(x + r, z) && green(x, z - r) && green(x, z + r);
  // fog banks drifting low over the course: soft blobs on planes turned to the camera
  const bankMat = new THREE.MeshBasicMaterial({ map: blob(), color: 0xeef2ef, transparent: true, opacity: 0.55, depthWrite: false });
  // a bank fades out as the camera comes into it (Third person runs through
  // the low ones): one blended plane over the whole screen was the storm's
  // and the fog's worst overdraw, and it hid the course. Gone within NEAR_BANK.
  // (the storm's clouds fade the same way, by their height over the lens)
  const faded = (mat: THREE.MeshBasicMaterial, n: number) => {
    const geo = new THREE.PlaneGeometry(1, 1), a = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
    geo.setAttribute("bankA", a);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = "attribute float bankA;\nvarying float vBankA;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vBankA = bankA;");
      sh.fragmentShader = "varying float vBankA;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a *= vBankA;");
    };
    mat.customProgramCacheKey = () => "bankA";
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    group.add(mesh);
    return [mesh, a] as const;
  };
  const [bankMesh, bankA] = faded(bankMat, BANKS);
  const banks = Array.from({ length: BANKS }, () => ({ m: proxy(), x: 0, z: 0, y: 0.8, s: 6, v: 0.2 + Math.random() * 0.3 }));
  // A storm's clouds: inked shapes in a ring round the lens, far out and
  // at its eye level, so they are the sky's and never lie over the course
  // (it drew them 11 over the board: from the Far view, dark smudges across
  // it). Behind all the scene (depth tested), they are seen where the sky is
  // — on Third person's horizon, a Far lean — the same size from every camera.
  const cloudMat = new THREE.MeshBasicMaterial({ map: stormCloud(), transparent: true, depthWrite: false, fog: false });
  const [cloudMesh, cloudA] = faded(cloudMat, CLOUDS);
  const SKY_R = 100; // inside the camera's far plane (120 at the least)
  const clouds = Array.from({ length: CLOUDS }, (_, k) => ({ m: proxy(), a: ((k + Math.random() * 0.5) / CLOUDS) * Math.PI * 2, e: 0.02 + Math.random() * 0.05, s: 0.5 + Math.random() * 0.25 }));

  // one frame's pieces into their batches
  const col = new THREE.Color(), wetGreen = new THREE.Color(0x5c8a74);
  const tv = new THREE.Vector3();
  // colours per batch, made once (flush runs every frame)
  const bitColor = (m: Proxy) => m.material.color;
  const ringColor = (m: Proxy) => col.copy(wetGreen).lerp(m.material.color, m.material.opacity / 0.7);
  const piece = (x: { m: Proxy }) => x.m;
  let cam: THREE.Camera | null = null;
  const NEAR_BANK = 3, FAR_BANK = 7;
  const bankFade = (m: Proxy) => {
    const d = cam ? m.position.distanceTo(cam.position) : Infinity;
    return d >= FAR_BANK ? 1 : d <= NEAR_BANK ? 0 : ((d - NEAR_BANK) / (FAR_BANK - NEAR_BANK)) ** 2;
  };
  // the wind near the lens (Third person stands in it): a gust or a blown bit
  // closer than NEAR_WIND is not drawn, and comes back in by FAR_WIND; in the
  // lens's face it was a white smear across the screen
  const NEAR_WIND = 3, FAR_WIND = 8;
  const NEAR_RAIN = 2, RAIN_LEN = 0.024; // (0.6 long at 25 from the lens, the Classic view)
  const nearFade = (d: number) => (d >= FAR_WIND ? 1 : d <= NEAR_WIND ? 0 : ((d - NEAR_WIND) / (FAR_WIND - NEAR_WIND)) ** 2);
  // a cloud under the lens's eye level is not drawn: in as it rises over it
  const cloudFade = (m: Proxy) => Math.min(1, Math.max(0, (m.position.y - (cam ? cam.position.y : 0)) / (SKY_R * 0.02)));
  const bitFade = (m: Proxy) => (cam ? nearFade(m.position.distanceTo(cam.position)) : 1);
  const shrink = new THREE.Vector3();
  // fade: a piece's opacity (into alpha when the batch has one, else its size)
  function inst<T>(mesh: THREE.InstancedMesh, list: readonly T[], get: (x: T) => Proxy, face: boolean, color: ((m: Proxy) => THREE.Color) | null, fade: ((m: Proxy) => number) | null = null, alpha: THREE.InstancedBufferAttribute | null = null) {
    if (!mesh.visible) return; // a hidden batch is not rewritten
    for (let k = 0; k < list.length; k++) {
      const m = get(list[k]);
      const a = fade && m.visible ? fade(m) : 1;
      if (alpha) alpha.array[k] = a;
      if (!m.visible || a < 0.01) {
        mesh.setMatrixAt(k, HIDE);
        continue;
      }
      if (face && cam) m.quaternion.copy(cam.quaternion);
      m.updateMatrix();
      if (!alpha && a < 1) m.matrix.scale(shrink.setScalar(a));
      mesh.setMatrixAt(k, m.matrix);
      if (color) mesh.setColorAt(k, color(m));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (color && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (alpha) alpha.needsUpdate = true;
  }
  function flush() {
    cam = typeof camera === "function" ? camera() : camera;
    inst(bitMesh, bits, piece, false, bitColor, bitFade);
    inst(ringMesh, splashes, piece, false, ringColor);
    inst(bankMesh, banks, piece, true, null, bankFade, bankA);
    if (cloudMesh.visible && cam)
      for (const c of clouds) {
        const s = SKY_R * c.s;
        c.m.scale.set(s, s / 2, 1);
        c.m.position.set(cam.position.x + Math.cos(c.a) * SKY_R, cam.position.y + SKY_R * c.e, cam.position.z + Math.sin(c.a) * SKY_R);
      }
    inst(cloudMesh, clouds, piece, true, null, cloudFade, cloudA);
    if (!trailMesh.visible) return;
    // the gusts: each ribbon's vertices into place, alpha 0 outside its drawn part
    trails.forEach((tr, k) => {
      const m = tr.m, o = k * V;
      m.updateMatrix();
      const [i0, i1] = m.range!, a = m.visible ? m.material.opacity : 0;
      for (let v = 0; v < V; v++) {
        tv.fromArray(tr.local, v * 3).applyMatrix4(m.matrix).toArray(trailPos, (o + v) * 3);
        const step = v >> 1;
        trailCol[(o + v) * 4 + 3] = step >= i0 && step <= i1 && a > 0 ? a * (cam ? nearFade(tv.distanceTo(cam.position)) : 1) : 0;
      }
    });
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.attributes.color.needsUpdate = true;
  }
  // the lightning's light over the scene: always in it (dark between flashes),
  // since a light coming or going recompiles every lit material
  const bolt = new THREE.HemisphereLight(0xeaf0ff, 0x8090a0, 0);
  scene.add(bolt);
  let nextFlash = 0, flashAt = -9;
  const placeWeather = () => {
    // puddles are the chain's (zones skinned "puddle", set in set())
    for (const b of banks) {
      b.x = area.x + Math.random() * area.w;
      b.z = area.z + Math.random() * area.d;
      b.y = 0.6 + Math.random() * 1.6;
      b.s = 5 + Math.random() * 6;
      b.m.scale.set(b.s, b.s * 0.45, 1);
      b.m.position.set(b.x, b.y, b.z);
    }
  };

  // a hole's own gusts (a timed slope skinned "gust"): white streaks racing
  // up its rectangle while the chain has it on, gone between
  const GS = 60;
  const gustPos = new Float32Array(GS * 6);
  const gustGeo = new THREE.BufferGeometry();
  gustGeo.setAttribute("position", new THREE.BufferAttribute(gustPos, 3));
  const gustMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const gustLines = new THREE.LineSegments(gustGeo, gustMat);
  gustLines.frustumCulled = false;
  scene.add(gustLines);
  let gusts: WeatherZone[] = [], gustOn = 0, gustNow: WeatherZone | null = null;
  const streaks = Array.from({ length: GS }, () => ({ u: Math.random(), v: Math.random(), s: 0.6 + Math.random() * 0.8 }));

  // fog: the scene's own, always there — fog coming or going recompiles every
  // material — and pushed far past the far plane (no effect) when there is none
  const OFF = 1e5, WHITE = new THREE.Color(0xffffff);
  const fog = (scene.fog = new THREE.Fog(0xdfe6e2, OFF, OFF * 10));
  const BANK_TINT = new THREE.Color(bankMat.color.r / fog.color.r, bankMat.color.g / fog.color.g, bankMat.color.b / fog.color.b);
  // It rolls in and out over FOG_IN seconds (k: 0 none, 1 all of it), from
  // beyond the course toward its range, and that range follows the camera's
  // real distance (want): at once when the camera backs off, eased when it
  // closes in. A range set for where the camera is going, not where it is,
  // put the whole course past the fog's far end: one flat pale plane.
  const FOG_IN = 1.5;
  let fogOn = false, fogK = 0, fogD = 0, fogWant = 0;
  const setFog = (on: boolean) => void (fogOn = on);
  function fogStep(dt: number) {
    fogK = fogOn ? Math.min(1, fogK + dt / FOG_IN) : Math.max(0, fogK - dt / FOG_IN);
    fogD = !fogD || fogWant >= fogD ? fogWant : fogD + (fogWant - fogD) * Math.min(1, dt * 4);
    const e = fogK * fogK * (3 - 2 * fogK), push = (1 - e) * fogD * 4;
    if (e <= 0 || !fogD) (fog.near = OFF), (fog.far = OFF * 10);
    else (fog.near = fogD * 0.75 + push), (fog.far = fogD * 1.9 + push);
    bankMat.opacity = 0.55 * e;
    bankMat.color.copy(fog.color).multiply(BANK_TINT); // the banks as pale as the fog, day or night (setLighting sets its colour)
    cloudMat.color.copy(fog.color).lerp(WHITE, 0.3); // the clouds too: slate by day, rosy at dusk, dark at night
  }

  let last: number | null = null, lastZones: readonly WeatherZone[] = [], lastFc: Pick<Forecast, "wind"> | null = null;
  // the Low tier: a third of the rain, half the banks, clouds, rings and gusts
  let thin = false;
  const share = (n: number) => (thin ? Math.ceil(n / (n === RAIN ? 3 : 2)) : n);
  let rainN = RAIN;
  return {
    /** Low: fewer particles of every kind (the next set() and on). */
    thin(on: boolean) {
      if (thin === !!on) return;
      thin = !!on;
      this.set(lastZones, lastFc);
    },
    /** The board it hangs over: rain falls there and a little around. */
    board(w: number, h: number, world = "garden", onGreen: (x: number, z: number) => boolean = () => true) {
      green = onGreen;
      W = w;
      H = h;
      palette = BITS_OF[world] || BITS_OF.garden;
      area = { x: -6, z: -6, w: w + 12, d: h + 12 };
      drops.forEach((d) => seed(d, false));
      placeWeather();
      wet = 0;
      fogK = 0; // a new hole: its fog rolls in again
      fogD = 0;
    },
    /** The weather zones for this stroke (the hole's own and the stroke's); fc,
     *  the chain's forecast ({ kind, wind }), names the wind when it has one. */
    set(zones: readonly WeatherZone[] | null, fc: Pick<Forecast, "wind"> | null = null): WeatherNow | null {
      lastZones = zones || [];
      lastFc = fc;
      rainN = share(RAIN);
      rainGeo.setDrawRange(0, rainN * 2);
      // a storm's wind blows in timed gusts (skinned "wind"): streaked like a hole's own
      gusts = (zones || []).filter((q) => (q.skin === "gust" || q.skin === "wind") && (q.every ?? 0) > 0);
      if (!gustNow || !gusts.includes(gustNow)) (gustNow = null), (gustOn = 0);
      const z = (zones || []).filter((q) => WEATHER_SKINS.includes(q.skin));
      const wind = z.find((q) => q.skin === "wind");
      // the forecast's own wind (a storm's gusts are 40° off it), else the first wind zone's
      const fw = fc && Array.isArray(fc.wind) && (fc.wind[0] || fc.wind[1]) ? fc.wind : null;
      now = {
        wind: fw ? [fw[0], fw[1]] : wind ? [wind.vec[0], wind.vec[1]] : null,
        rain: z.some((q) => q.skin === "rain"),
        fog: z.some((q) => q.skin === "fog"),
        storm: z.some((q) => q.skin === "storm"),
        snow: z.some((q) => q.skin === "snow"),
      };
      if (!now.wind && !now.rain && !now.fog && !now.storm && !now.snow) now = null;
      group.visible = !!now;
      rain.visible = !!now && (now.rain || now.storm || now.snow);
      // snow: the same particles, slow and short, drifting
      rain.material.color.setHex(now && now.snow ? 0xffffff : 0xeaf6ff);
      drops.forEach((d) => (d.v = now && now.snow ? 1.2 + Math.random() : 16 + Math.random() * 6));
      const raining = !!now && (now.rain || now.storm);
      // the rain's puddles are where the chain has them (they slow the ball
      // there), cut at the lane's edge: none spills over its side or the water
      const pz = raining ? (zones || []).filter((q): q is Zone => q.skin === "puddle" && !!q.min && !!q.max) : [];
      puddleMesh.geometry.dispose();
      puddleMesh.geometry = puddleGeo(pz, green);
      splashes.forEach((sp, k) => (sp.m.visible = raining && k < share(SPLASH)));

      banks.forEach((b, k) => (b.m.visible = !!now && now.fog && k < share(BANKS)));
      clouds.forEach((c, k) => (c.m.visible = !!now && now.storm && k < share(CLOUDS)));
      if (!raining) wet = 0;
      setFog(!!now && now.fog);
      const s = now && now.wind ? Math.hypot(now.wind[0], now.wind[1]) : 0;
      // a breeze shows a few gusts, a gale a dozen
      const n = s ? share(Math.max(3, Math.min(TRAILS, Math.round(3 + (s / 0.08) * 9)))) : 0;
      trails.forEach((tr, k) => ((tr.m.visible = k < n), k < n && reseedTrail(tr), (tr.t = k / Math.max(1, n))));
      bits.forEach((b, k) => ((b.m.visible = k < Math.round((n / TRAILS) * BITS)), reseedBit(b, true)));
      trailMesh.visible = n > 0;
      bitMesh.visible = n > 0;
      ringMesh.visible = raining;
      puddleMesh.visible = raining;
      bankMesh.visible = !!now && now.fog;
      cloudMesh.visible = !!now && now.storm;
      flush();
      return now;
    },
    get: () => now,
    /** The fog is set by how far the camera stands: the near end of the
     *  course clear, the far end and the garden beyond it lost in it. */
    view(dist: number) {
      fogWant = dist;
    },
    /** The timed pieces' clock (substeps, fractional): gusts blow when the chain has them on. */
    clock(c: number) {
      // the gust blowing now (a storm's two take turns), else none
      gustOn = 0;
      gustNow = gusts[0] || null;
      for (const z of gusts) {
        const every = z.every ?? 0, on = z.on ?? 0, k = mod(c + ((z.phase ?? 0) | 0), every);
        // on in [0, on), with a quarter-substep swell at each edge
        if (k < on) {
          gustNow = z;
          gustOn = Math.min(1, k * 4, (on - k) * 4);
          break;
        }
      }
    },
    tick(t: number) {
      const step = last === null ? 0 : Math.min(0.05, t - last);
      last = t;
      // reduced motion: the weather is shown still (drops, rings, banks, gusts,
      // blown bits all where they are), the fog simply there, no lightning
      fogStep(motion ? step : 1);
      const dt = motion ? step : 0;
      const z = gustNow;
      gustMat.opacity = z ? 0.85 * gustOn : 0;
      gustLines.visible = !!z && gustOn > 0;
      if (z && gustLines.visible) {
        const [vx, vz] = z.vec, l = Math.hypot(vx, vz) || 1, ux = vx / l, uz = vz / l;
        const min = z.min!, max = z.max!, w = max[0] - min[0], d = max[1] - min[1];
        streaks.forEach((st, i) => {
          st.u = (st.u + dt * 1.8 * st.s) % 1;
          const x = min[0] + st.v * w, zz = min[1] + st.u * d;
          const x0 = min[0] + ((x - min[0] + ux * st.u * d) % w + w) % w;
          const o = i * 6, y = 0.6 + st.s * 0.5;
          // shortened to nothing near the lens, like the gusts: a streak at it crossed the screen
          const l = 1.4 * (cam ? nearFade(Math.hypot(x0 - cam.position.x, y - cam.position.y, zz - cam.position.z)) : 1);
          gustPos[o] = x0, gustPos[o + 1] = y, gustPos[o + 2] = zz;
          gustPos[o + 3] = x0 + ux * l, gustPos[o + 4] = y, gustPos[o + 5] = zz + uz * l;
        });
        gustGeo.attributes.position.needsUpdate = true;
      }
      if (!now) return;
      const wx = now.wind ? now.wind[0] : 0, wz = now.wind ? now.wind[1] : 0;
      if (rain.visible) {
        // slanted by the wind, and as long on screen from every camera: a
        // streak's length is its distance to the lens (RAIN_LEN of it), one
        // closer than NEAR_RAIN not drawn (Third person stands in the rain:
        // a drop at the lens was a line across the whole screen)
        const sx = wx * 18, sz = wz * 18, c = cam ? cam.position : null;
        for (let i = 0; i < rainN; i++) {
          const d = drops[i];
          d.y -= d.v * dt;
          d.x += sx * dt;
          d.z += sz * dt;
          if (d.y < 0) seed(d, true);
          if (now.snow) d.x += Math.sin(t + i) * 0.3 * dt;
          const ex = c ? d.x - c.x : 25, ey = c ? d.y - c.y : 0, ez = c ? d.z - c.z : 0, r = Math.sqrt(ex * ex + ey * ey + ez * ez);
          const l = r < NEAR_RAIN ? 0 : Math.min(2.5, r * RAIN_LEN) * (now.snow ? 0.15 : 1), k = l / 0.8;
          const o = i * 6;
          rainPos[o] = d.x, rainPos[o + 1] = d.y, rainPos[o + 2] = d.z;
          rainPos[o + 3] = d.x - sx * 0.05 * k, rainPos[o + 4] = d.y + l, rainPos[o + 5] = d.z - sz * 0.05 * k;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }
      if (rain.visible && !now.snow) {
        // rings where drops land, and puddles gathering over some seconds
        for (const sp of splashes) {
          if (!sp.m.visible) continue;
          sp.t += dt * 2.2;
          if (sp.t >= 1) {
            sp.t = 0;
            let x = 0, z = 0;
            for (let k = 0; k < 6 && !onLane(x, z); k++) (x = Math.random() * W), (z = Math.random() * H);
            sp.m.position.set(x, 0.04, z);
          }
          sp.m.scale.setScalar(1 + sp.t * 3);
          sp.m.material.opacity = 0.7 * (1 - sp.t);
        }
        wet = motion ? Math.min(1, wet + dt / 8) : 1;
        puddleMat.opacity = 0.45 * wet;
      }
      if (now.fog)
        for (const b of banks) {
          b.x += b.v * dt;
          if (b.x > area.x + area.w + 6) b.x = area.x - 6;
          b.m.position.set(b.x, b.y + (motion ? Math.sin(t * 0.3 + b.s) * 0.2 : 0), b.z);
        }
      if (now.storm) for (const c of clouds) c.a += dt * 0.01; // the sky drifts round (dt is 0 with reduced motion: still)
      if (now.storm && motion) {
        // now and then a flash: the scene lit white, and the page told
        if (t > nextFlash) {
          flashAt = t;
          nextFlash = t + 4 + Math.random() * 6;
          if (nextFlash - t > 0.5) onFlash();
        }
        const k = t - flashAt;
        bolt.intensity = k < 0.08 ? 3 : k < 0.16 ? 0.4 : k < 0.26 ? 2.2 : Math.max(0, 2.2 - (k - 0.26) * 6);
      } else bolt.intensity = 0;
      if (now.wind) {
        const a = Math.atan2(wz, wx), s = Math.hypot(wx, wz);
        const drift = 1.5 + s * 60; // how fast the air moves across, units a second
        for (const tr of trails) {
          if (!tr.m.visible) continue;
          tr.t += dt / tr.life;
          if (tr.t >= 1) reseedTrail(tr);
          // the head grows out along the ribbon, the tail follows, and it fades
          const head = Math.min(1, tr.t * 1.6), tail = Math.max(0, tr.t * 1.6 - 0.55);
          const i0 = Math.floor(tail * STEPS), i1 = Math.ceil(head * STEPS);
          tr.m.range = [i0, i1];
          tr.m.material.opacity = Math.min(1, (1 - tr.t) * 3) * Math.min(1, tr.t * 6);
          tr.x += Math.cos(a) * drift * 0.35 * dt;
          tr.z += Math.sin(a) * drift * 0.35 * dt;
          tr.m.position.set(tr.x, tr.y, tr.z);
          tr.m.rotation.y = -a;
        }
        for (const b of bits) {
          if (!b.m.visible) continue;
          b.x += Math.cos(a) * drift * dt;
          b.z += Math.sin(a) * drift * dt;
          b.y += Math.sin(t * 2 + b.ph) * 0.4 * dt;
          b.m.position.set(b.x, b.y, b.z);
          b.m.rotation.x += b.spin.x * dt;
          b.m.rotation.y += b.spin.y * dt;
          b.m.rotation.z += b.spin.z * dt;
          if (b.x < area.x - 4 || b.x > area.x + area.w + 4 || b.z < area.z - 4 || b.z > area.z + area.d + 4) reseedBit(b, false);
        }
      }
      flush();
    },
    dispose() {
      if (scene.fog === fog) scene.fog = null;
      scene.remove(group, bolt);
      scene.remove(gustLines);
      gustGeo.dispose();
      gustMat.dispose();
      rainGeo.dispose();
      rain.material.dispose();
      for (const m of [bitMesh, ringMesh, bankMesh, cloudMesh]) (m.geometry.dispose(), m.material.dispose(), m.dispose());
      puddleMesh.geometry.dispose();
      puddleMat.dispose();
      trailMesh.geometry.dispose();
      trailMesh.material.dispose();
      bitGeo.dispose();
    },
  };
}
export type Weather = ReturnType<typeof makeWeather>;
