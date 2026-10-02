// The Crystal Mines' lava: one material for every lava of the world (a lake,
// a river, a channel, the tide, a fall's pool, the far lava of the decor) and
// the pool it makes on the board. Unlit, it is its own light: a dark crust
// breaking into plates that drift apart over the flow, the cracks between
// them glowing orange to yellow-white, open lava between the rafts of crust,
// the whole slowly flowing and shimmering — in the toon's flat bands, stepped,
// not a gradient. On the scene's clock (still for a player who asked for less
// motion), nothing done per frame on the CPU but the bubbles.
//
// lavaMaterial() is shared: a geometry may carry `lavaCrust` (0..1 per
// vertex, more crust: a shore, a cooling edge), none is the open flow. The
// world (mines.ts) builds the heat round it (embers, glow, shimmer) on top.
import * as THREE from "three";
import { share, uTime } from "./materials";
import { md, ud } from "./data";
import { animate } from "./state";
import { MINES } from "./mines-kit";
import { shared, once } from "./mines-toon";
import type { Rand } from "./common";

const hex = (c: number) => new THREE.Color(c);
// the bands, coolest to hottest
const BANDS = {
  crust: hex(0x2b1613), crustWarm: hex(0x4e1f16), ember: hex(0x9c2a12),
  lava: hex(MINES.lava), hot: hex(MINES.lavaHi), white: hex(0xfff0b8),
};

// the noise and the plates of crust, the same in the vertex shader (the plates' relief) and the fragment (their colour)
const LV = `float lvH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lvN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lvH(i), lvH(i + vec2(1.0, 0.0)), f.x), mix(lvH(i + vec2(0.0, 1.0)), lvH(i + vec2(1.0, 1.0)), f.x), f.y);
}
// plates of crust: the nearest two cell points (their gap is a crack) and the plate's own number
vec3 lvPlates(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), c = i + g;
      vec2 o = 0.5 + 0.38 * sin(uTime * 0.12 + 6.2831 * vec2(lvH(c), lvH(c + 17.3)));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = lvH(c + 3.7); }
      else if (d < d2) d2 = d;
    }
  return vec3(d1, d2, id);
}
// the flow's coordinates on a lake (drifting, bent by a lazy swirl)
vec2 lvFlow(vec2 p) {
  vec2 q = p * 0.42 + vec2(uTime * 0.045, uTime * 0.028);
  return q + 0.45 * vec2(lvN(p * 0.55 + uTime * 0.07), lvN(p * 0.55 - uTime * 0.06 + 9.0));
}
`;

let mat: THREE.MeshBasicMaterial | null = null;
/**
 * The lava: one material for every lava of the mines. A geometry's lavaCrust
 * (per vertex, 0..1) is how much it has crusted over; -1 marks a curtain
 * pouring down (crustBy(geo, FALLING)): its flow runs down it.
 */
export const FALLING = -1;
export function lavaMaterial() {
  if (mat) return mat;
  const m = share(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  const u = Object.fromEntries(Object.entries(BANDS).map(([k, c]) => ["u" + k[0].toUpperCase() + k.slice(1), { value: c }]));
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { uTime });
    sh.vertexShader = "uniform float uTime;\nattribute float lavaCrust;\nvarying float vCrust;\nvarying vec3 vLw;\n" + LV + sh.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
  vCrust = lavaCrust;
  #ifndef USE_INSTANCING
  // a lake's crust in relief: its plates raised off the melt, 0.05 to 0.12 proud with rounded shoulders, heaving
  // slowly; the bright bands between them and the open melt stay at the lake's plane (the chain's lava height).
  // (not a shore, crusted through: 1; nor a fall: -1)
  if (lavaCrust >= 0.0 && lavaCrust < 0.99) {
    vec4 lw = modelMatrix * vec4(transformed, 1.0);
    vec3 pl = lvPlates(lvFlow(lw.xz));
    float crusty = clamp(0.5 + 0.6 * lavaCrust - 0.45 * lvN(lw.xz * 0.18 + uTime * 0.03), 0.0, 1.0);
    float plate = step(pl.z, crusty) * smoothstep(0.05, 0.3, pl.y - pl.x);
    transformed.y += plate * (0.05 + 0.07 * lvH(vec2(pl.z, 1.7)) + 0.015 * sin(uTime * 0.5 + pl.z * 20.0));
  }
  #endif
  #ifdef USE_INSTANCING
    vLw = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vLw = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`,
    );
    sh.fragmentShader = `uniform float uTime;
uniform vec3 uCrust, uCrustWarm, uEmber, uLava, uHot, uWhite;
varying float vCrust;
varying vec3 vLw;
` + LV + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    bool falling = vCrust < -0.5;
    vec2 p = falling ? vec2((vLw.x + vLw.z) * 2.8, vLw.y * 0.9 + uTime * 1.8) : vLw.xz; // (a fall: finer, streaking down)
    // the flow: a slow drift, bent by a lazy swirl, and a shimmer on top
    vec2 q = falling ? p * 0.42 + vec2(uTime * 0.045, uTime * 0.028) + 0.45 * vec2(lvN(p * 0.55 + uTime * 0.07), lvN(p * 0.55 - uTime * 0.06 + 9.0)) : lvFlow(p);
    q += 0.04 * sin(uTime * 3.1 + p.yx * 5.0);
    vec3 pl = lvPlates(q);
    float crack = pl.y - pl.x;
    // how much of it has crusted over: more at a shore, less where it runs hot
    float heat = lvN(p * 0.18 + uTime * 0.03);
    float crusty = falling ? 0.1 : clamp(0.5 + 0.6 * vCrust - 0.45 * heat, 0.0, 1.0);
    // the bands (toon: flat steps) with their edges anti-aliased over a pixel
    float wc = fwidth(crack) * 0.8 + 1e-4;
    vec3 c;
    if (pl.z < crusty) {
      // a raft of crust, its cracks glowing, warmer toward its broken edge
      c = mix(uCrustWarm, uCrust, smoothstep(0.16 - wc, 0.16 + wc, crack));
      c = mix(uEmber, c, smoothstep(0.09 - wc, 0.09 + wc, crack));
      c = mix(uHot, c, smoothstep(0.045 - wc, 0.045 + wc, crack));
      float glint = smoothstep(0.02 + wc, 0.02 - wc, crack) * step(0.55, lvN(q * 3.0 + uTime * 0.5));
      c = mix(c, uWhite, glint);
      c *= 0.88 + 0.24 * fract(pl.z * 13.7); // (each raft its own tone: cooled more or less)
      // (its relief read: a plate's shoulder turned from the light darker, its top lit, in two toon steps)
      vec3 nrm = normalize(cross(dFdx(vLw), dFdy(vLw)));
      float lit = dot(nrm * sign(nrm.y), normalize(vec3(0.4, 1.0, 0.3)));
      if (!falling) c *= lit > 0.93 ? 1.12 : lit > 0.8 ? 0.95 : 0.7;
    } else {
      // open lava between them, in bands of heat, the veins brightest
      float v = lvN(q * 1.7 - uTime * 0.12) * 0.7 + 0.3 * (1.0 - smoothstep(0.0, 0.25, crack));
      v += 0.08 * sin(uTime * 1.7 + p.x * 0.8 + p.y * 0.6);
      float wv = fwidth(v) * 0.8 + 1e-4;
      c = mix(uLava, uHot, smoothstep(0.52 - wv, 0.52 + wv, v));
      c = mix(c, uWhite, smoothstep(0.78 - wv, 0.78 + wv, v));
      c = mix(uEmber, c, smoothstep(0.035 - wc, 0.035 + wc, crack)); // the edge of the plate it split from
    }
    diffuseColor.rgb = c;
  }`,
    );
  };
  m.customProgramCacheKey = () => "mines-lava";
  md(m).hook = "mines-lava";
  m.side = THREE.DoubleSide; // (a curtain is seen from both sides; a lake from above only)
  return (mat = m);
}

/** A crust per vertex (lavaCrust): k(x, z) of each vertex. */
export function crustBy(geo: THREE.BufferGeometry, k: (x: number, z: number) => number) {
  const p = geo.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = k(p.getX(i), p.getZ(i));
  geo.setAttribute("lavaCrust", new THREE.BufferAttribute(a, 1));
  return geo;
}

/**
 * Bubbles swelling up out of the lava (or a boiling spring: white) and
 * popping, each with a ring and a spit of sparks, at the spots given (world
 * points on the surface): one system for all of a hole's (shared), the first
 * caller gets its group to add, the others null.
 */
export function bubbles(build: object, spots: readonly THREE.Vector3[], rand: Rand, boil = false): THREE.Object3D | null {
  const { sys, first } = shared(build, boil ? "boil" : "lava bubbles", () => bubbleSystem(boil));
  for (const at of spots) sys.list.push({ at, T: 2.2 + rand() * 2.6, ph: rand() * 5, r: (boil ? 0.1 : 0.18) + rand() * (boil ? 0.08 : 0.22) });
  return first ? sys.root : null;
}
const CAP = 96;
function bubbleSystem(boil: boolean) {
  const root = new THREE.Group();
  ud(root).live = true;
  const dome = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  // hot at its foot, a darker skin cooling over its top (a boil: white)
  const pos = dome.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (boil) c.set(0xf2fbff);
    else c.copy(BANDS.hot).lerp(BANDS.crustWarm, Math.min(1, pos.getY(i) * 1.1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const domes = new THREE.InstancedMesh(dome, once("bubble dome", () => new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true })), CAP);
  // (a boil's ring thin and faint, spreading as it goes: a ripple, not a white sticker)
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, boil ? 0.05 : 0.12, 3, 16).rotateX(Math.PI / 2), boil ? once("boil ring", () => new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.4, depthWrite: false })) : once("bubble ring", () => new THREE.MeshBasicMaterial({ color: MINES.lavaHi })), CAP);
  // (the embers over the lava are the world's: mines.ts)
  for (const o of [domes, rings]) (o.frustumCulled = false), root.add(o);
  const list: { at: THREE.Vector3; T: number; ph: number; r: number }[] = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  animate((tt) => {
    const n = Math.min(CAP, list.length);
    domes.count = rings.count = n;
    for (let i = 0; i < n; i++) {
      const L = list[i], at = L.at, k = ((tt + L.ph) % L.T) / L.T; // 0..1 through its life
      // swells for most of it, pops at 0.8, then the ring runs out
      if (k < 0.8) {
        const s = L.r * Math.sin((k / 0.8) * Math.PI * 0.5) ** 0.7;
        domes.setMatrixAt(i, M.compose(P.copy(at).setY(at.y - 0.03), Q, S.set(s, s * 0.8, s))); // (its foot under the surface: out of it, never lying on it)
        rings.setMatrixAt(i, hide);
      } else {
        const r = (k - 0.8) / 0.2;
        domes.setMatrixAt(i, hide);
        rings.setMatrixAt(i, M.compose(P.copy(at).setY(at.y + 0.01), Q, S.set(L.r * (1 + r * 2.2), 1, L.r * (1 + r * 2.2))));
      }
    }
    domes.instanceMatrix.needsUpdate = rings.instanceMatrix.needsUpdate = true;
  });
  return { root, list };
}
