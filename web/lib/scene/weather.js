// The weather over a hole, as the chain has it for the stroke: zones that
// cover the board, skinned "wind" (a slope: vec is the push), "rain" (a
// slippier green), "fog" and "storm" (for the eye only). This draws what
// they mean — rain falling, wind lines running, fog — and says what the
// weather is, for the HUD. Lightning is the page's: a flash over everything.
import * as THREE from "three";
import { mod } from "../terrain.js";

/** The zone skins that are weather (drawn here, not as pieces of the course). */
export const WEATHER_SKINS = ["wind", "rain", "fog", "storm", "snow"];

const RAIN = 1500, TRAILS = 16, BITS = 30, SPLASH = 40, PUDDLES = 6, BANKS = 16, CLOUDS = 10;

// A Wind Waker gust: a flat white ribbon that runs straight along the wind,
// then curls into a loop at its tip. Built once, along +x, lying flat (it is
// seen from above); the drawn part slides along it — the head grows out, the
// tail follows, and it is gone.
const STEPS = 64;
function trailGeometry(len, curl) {
  const pts = [];
  for (let k = 0; k <= STEPS; k++) {
    const u = k / STEPS;
    if (u < 0.62) pts.push([(u / 0.62) * len, 0]);
    else {
      // the curl: a spiral that tightens, turning up-wind of its start
      const a = ((u - 0.62) / 0.38) * Math.PI * 1.75, r = curl * (1 - 0.35 * ((u - 0.62) / 0.38));
      pts.push([len + Math.sin(a) * r, curl - Math.cos(a) * r]);
    }
  }
  const pos = [], idx = [];
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
const BITS_OF = {
  garden: [0x7fb85a, 0xe98fb0, 0xf2b94a, 0x5b9a7d],
  island: [0xf0d9a0, 0xe8cc88, 0xfff4d6],
  town: [0xe25248, 0xf5b83d, 0x5b6fb5, 0xffffff],
  mountain: [0xffffff, 0xeef6fb, 0xdde9f2], // snowflakes
};

// a soft round blob, for fog banks and storm clouds
let blobTex = null;
function blob() {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return (blobTex = new THREE.CanvasTexture(c));
}

// A stand-in for one piece of a batch: the transform and look the tick code
// sets, written into the batch's instances once a frame (flush). A handful of
// draw calls for all the weather, however many drops, gusts and banks.
const proxy = (color = 0xffffff, opacity = 1) => {
  const o = new THREE.Object3D();
  o.visible = false;
  o.material = { color: new THREE.Color(color), opacity };
  return o;
};
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);

export function makeWeather(scene, { onFlash = () => {}, camera = null } = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  let W = 40, H = 10, now = null, area = { x: -8, z: -8, w: 56, d: 26 };

  // rain: short streaks, recycled from the top as they reach the ground
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 6);
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.85, depthWrite: false }));
  rain.frustumCulled = false;
  group.add(rain);
  const drops = Array.from({ length: RAIN }, () => ({ x: 0, y: 0, z: 0, v: 0 }));
  const seed = (d, top) => {
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
    return { m, local: geo.attributes.position.array, idx: geo.index.array, t: n / TRAILS, life: 1.6 + Math.random() * 0.8, x: 0, z: 0, y: 1 };
  });
  const trailPos = new Float32Array(TRAILS * V * 3), trailCol = new Float32Array(TRAILS * V * 4).fill(1);
  const trailIdx = [];
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
  const reseedBit = (b, anywhere) => {
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
  const reseedTrail = (tr) => {
    tr.x = area.x + Math.random() * area.w;
    tr.z = area.z + Math.random() * area.d;
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
  const puddleMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24), puddleMat, PUDDLES);
  puddleMesh.frustumCulled = false;
  group.add(puddleMesh);
  const puddles = Array.from({ length: PUDDLES }, () => {
    const m = proxy();
    m.rotation.x = -Math.PI / 2;
    return m;
  });
  let wet = 0; // how far the puddles have gathered, 0..1
  let green = () => true; // where the lane is: puddles and splashes stay on it
  const onLane = (x, z, r = 0) => green(x, z) && green(x - r, z) && green(x + r, z) && green(x, z - r) && green(x, z + r);
  // fog banks drifting low over the course, and dark clouds over a storm
  // banks and clouds: soft blobs on planes turned to the camera, one batch each
  const blobGeo = new THREE.PlaneGeometry(1, 1);
  const bankMat = new THREE.MeshBasicMaterial({ map: blob(), color: 0xeef2ef, transparent: true, opacity: 0.55, depthWrite: false });
  // a bank fades out as the camera comes into it (Third person runs through
  // the low ones): one blended plane over the whole screen was the storm's
  // and the fog's worst overdraw, and it hid the course. Gone within NEAR_BANK.
  const bankGeo = new THREE.PlaneGeometry(1, 1), bankA = new THREE.InstancedBufferAttribute(new Float32Array(BANKS).fill(1), 1);
  bankGeo.setAttribute("bankA", bankA);
  bankMat.onBeforeCompile = (sh) => {
    sh.vertexShader = "attribute float bankA;\nvarying float vBankA;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vBankA = bankA;");
    sh.fragmentShader = "varying float vBankA;\n" + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n  diffuseColor.a *= vBankA;");
  };
  bankMat.customProgramCacheKey = () => "bankA";
  const bankMesh = new THREE.InstancedMesh(bankGeo, bankMat, BANKS);
  const cloudMat = new THREE.MeshBasicMaterial({ map: blob(), color: 0x3a4250, transparent: true, opacity: 0.8, depthWrite: false });
  const cloudMesh = new THREE.InstancedMesh(blobGeo, cloudMat, CLOUDS);
  bankMesh.frustumCulled = cloudMesh.frustumCulled = false;
  group.add(bankMesh, cloudMesh);
  const banks = Array.from({ length: BANKS }, () => ({ m: proxy(), x: 0, z: 0, y: 0.8, s: 6, v: 0.2 + Math.random() * 0.3 }));
  const clouds = Array.from({ length: CLOUDS }, () => ({ m: proxy(), x: 0, z: 0 }));

  // one frame's pieces into their batches
  const col = new THREE.Color(), wetGreen = new THREE.Color(0x5c8a74);
  const tv = new THREE.Vector3();
  // colours per batch, made once (flush runs every frame)
  const bitColor = (m) => m.material.color;
  const ringColor = (m) => col.copy(wetGreen).lerp(m.material.color, m.material.opacity / 0.7);
  const piece = (x) => x.m;
  const self = (x) => x;
  let cam = null;
  const NEAR_BANK = 3, FAR_BANK = 7;
  const bankFade = (m) => {
    const d = cam ? m.position.distanceTo(cam.position) : Infinity;
    return d >= FAR_BANK ? 1 : d <= NEAR_BANK ? 0 : ((d - NEAR_BANK) / (FAR_BANK - NEAR_BANK)) ** 2;
  };
  function inst(mesh, list, get, face, color, fade = null, alpha = null) {
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
      mesh.setMatrixAt(k, m.matrix);
      if (color) mesh.setColorAt(k, color(m));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (color && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (alpha) alpha.needsUpdate = true;
  }
  function flush() {
    cam = typeof camera === "function" ? camera() : camera;
    inst(bitMesh, bits, piece, false, bitColor);
    inst(ringMesh, splashes, piece, false, ringColor);
    inst(puddleMesh, puddles, self, false, null);
    inst(bankMesh, banks, piece, true, null, bankFade, bankA);
    inst(cloudMesh, clouds, piece, true, null);
    if (!trailMesh.visible) return;
    // the gusts: each ribbon's vertices into place, alpha 0 outside its drawn part
    trails.forEach((tr, k) => {
      const m = tr.m, o = k * V;
      m.updateMatrix();
      const [i0, i1] = m.range, a = m.visible ? m.material.opacity : 0;
      for (let v = 0; v < V; v++) {
        tv.fromArray(tr.local, v * 3).applyMatrix4(m.matrix).toArray(trailPos, (o + v) * 3);
        const step = v >> 1;
        trailCol[(o + v) * 4 + 3] = step >= i0 && step <= i1 ? a : 0;
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
    clouds.forEach((c, k) => {
      c.x = area.x + ((k + Math.random() * 0.6) / CLOUDS) * area.w;
      c.z = area.z + Math.random() * area.d * 0.6;
      const r = 8 + Math.random() * 6;
      c.m.scale.set(r, r * 0.5, 1);
      c.m.position.set(c.x, 11 + Math.random() * 3, c.z);
    });
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
  let gusts = [], gustOn = 0, gustNow = null;
  const streaks = Array.from({ length: GS }, () => ({ u: Math.random(), v: Math.random(), s: 0.6 + Math.random() * 0.8 }));

  // fog: the scene's own, always there — fog coming or going recompiles every
  // material — and pushed far past the far plane (no effect) when there is none
  const OFF = 1e5;
  const fog = (scene.fog = new THREE.Fog(0xdfe6e2, OFF, OFF * 10));
  let fogOn = false;
  const setFog = (on) => {
    if (on === fogOn) return;
    fogOn = on;
    if (on) (fog.near = 20), (fog.far = 60);
    else (fog.near = OFF), (fog.far = OFF * 10);
  };

  let last = null, lastZones = [], lastFc = null;
  // the Low tier: a third of the rain, half the banks, clouds, rings and gusts
  let thin = false;
  const share = (n) => (thin ? Math.ceil(n / (n === RAIN ? 3 : 2)) : n);
  let rainN = RAIN;
  return {
    /** Low: fewer particles of every kind (the next set() and on). */
    thin(on) {
      if (thin === !!on) return;
      thin = !!on;
      this.set(lastZones, lastFc);
    },
    /** The board it hangs over: rain falls there and a little around. */
    board(w, h, world = "garden", onGreen = () => true) {
      green = onGreen;
      W = w;
      H = h;
      palette = BITS_OF[world] || BITS_OF.garden;
      area = { x: -6, z: -6, w: w + 12, d: h + 12 };
      drops.forEach((d) => seed(d, false));
      placeWeather();
      wet = 0;
    },
    /** The weather zones for this stroke (the hole's own and the stroke's); fc,
     *  the chain's forecast ({ kind, wind }), names the wind when it has one. */
    set(zones, fc = null) {
      lastZones = zones || [];
      lastFc = fc;
      rainN = share(RAIN);
      rainGeo.setDrawRange(0, rainN * 2);
      // a storm's wind blows in timed gusts (skinned "wind"): streaked like a hole's own
      gusts = (zones || []).filter((q) => (q.skin === "gust" || q.skin === "wind") && q.every > 0);
      if (!gusts.includes(gustNow)) (gustNow = null), (gustOn = 0);
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
      // the rain's puddles are where the chain has them: they slow the ball there
      const pz = (zones || []).filter((q) => q.skin === "puddle");
      puddles.forEach((p, k) => {
        const q = pz[k];
        p.visible = raining && !!q;
        if (!q) return;
        p.position.set((q.min[0] + q.max[0]) / 2, 0.03, (q.min[1] + q.max[1]) / 2);
        p.scale.set((q.max[0] - q.min[0]) / 2, (q.max[1] - q.min[1]) / 2, 1);
      });
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
    view(dist) {
      if (fogOn) (fog.near = dist * 0.75), (fog.far = dist * 1.9);
    },
    /** The timed pieces' clock (substeps, fractional): gusts blow when the chain has them on. */
    clock(c) {
      // the gust blowing now (a storm's two take turns), else none
      gustOn = 0;
      gustNow = gusts[0] || null;
      for (const z of gusts) {
        const k = mod(c + (z.phase | 0), z.every);
        // on in [0, on), with a quarter-substep swell at each edge
        if (k < z.on) {
          gustNow = z;
          gustOn = Math.min(1, k * 4, (z.on - k) * 4);
          break;
        }
      }
    },
    tick(t) {
      const dt = last === null ? 0 : Math.min(0.05, t - last);
      last = t;
      const z = gustNow;
      gustMat.opacity = z ? 0.85 * gustOn : 0;
      gustLines.visible = !!z && gustOn > 0;
      if (gustLines.visible) {
        const [vx, vz] = z.vec, l = Math.hypot(vx, vz) || 1, ux = vx / l, uz = vz / l;
        const w = z.max[0] - z.min[0], d = z.max[1] - z.min[1];
        streaks.forEach((st, i) => {
          st.u = (st.u + dt * 1.8 * st.s) % 1;
          const x = z.min[0] + st.v * w, zz = z.min[1] + st.u * d;
          const x0 = z.min[0] + ((x - z.min[0] + ux * st.u * d) % w + w) % w;
          const o = i * 6, y = 0.6 + st.s * 0.5;
          gustPos[o] = x0, gustPos[o + 1] = y, gustPos[o + 2] = zz;
          gustPos[o + 3] = x0 + ux * 1.4, gustPos[o + 4] = y, gustPos[o + 5] = zz + uz * 1.4;
        });
        gustGeo.attributes.position.needsUpdate = true;
      }
      if (!now) return;
      const wx = now.wind ? now.wind[0] : 0, wz = now.wind ? now.wind[1] : 0;
      if (rain.visible) {
        // slanted by the wind
        const sx = wx * 18, sz = wz * 18;
        for (let i = 0; i < rainN; i++) {
          const d = drops[i];
          d.y -= d.v * dt;
          d.x += sx * dt;
          d.z += sz * dt;
          if (d.y < 0) seed(d, true);
          const l = now.snow ? 0.12 : 0.8;
          if (now.snow) d.x += Math.sin(t + i) * 0.3 * dt;
          const o = i * 6;
          rainPos[o] = d.x, rainPos[o + 1] = d.y, rainPos[o + 2] = d.z;
          rainPos[o + 3] = d.x - sx * 0.05, rainPos[o + 4] = d.y + l, rainPos[o + 5] = d.z - sz * 0.05;
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
        wet = Math.min(1, wet + dt / 8);
        puddleMat.opacity = 0.45 * wet;
      }
      if (now.fog)
        for (const b of banks) {
          b.x += b.v * dt;
          if (b.x > area.x + area.w + 6) b.x = area.x - 6;
          b.m.position.set(b.x, b.y + Math.sin(t * 0.3 + b.s) * 0.2, b.z);
        }
      if (now.storm) {
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
      for (const m of [trailMesh, bitMesh, ringMesh, puddleMesh, bankMesh, cloudMesh]) (m.geometry.dispose(), m.material.dispose(), m.dispose && m.dispose());
      bitGeo.dispose();
    },
  };
}
