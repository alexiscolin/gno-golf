// The mines' water: one material for every pool of it underground (a pit's
// lake, a site's lake, the sumps and hot springs): dark and still, murky in
// its middle, glowing at its shore with what grows there, a foam line where
// it meets rock or timber, drip rings, and the lamps and crystals over it
// streaked on it toward the eye, broken by its swell.
//
// How deep it is comes from a field (waterField: a depth sampled over a box
// into a texture, read smoothly: the shoreline is the field's, round and
// soft, whatever the triangles under it) or, for a small pool built as rings,
// from its vertices (a `wDepth` attribute). Negative is dry: nothing drawn.
import * as THREE from "three";
import { uTime } from "./materials";

/** A pool's depth over a box: its texture (the shader's), the depth at a
 *  point as sampled, and stamp() to make a spot dry (a post, a rock). */
export interface WaterField {
  tex: THREE.DataTexture;
  box: THREE.Vector4; // x0, z0, 1/width, 1/depth: a world point to the texture
  at: (x: number, z: number) => number;
  stamp: (x: number, z: number, r: number) => void;
  /** the grid itself: nx by nz depths, from (x0, z0), res apart (shoreline) */
  grid: { v: Float32Array; nx: number; nz: number; x0: number; z0: number; res: number };
}

const LO = -1, SPAN = 3; // the depths a texel holds: -1 (dry) .. 2
const enc = (d: number) => Math.round(Math.min(1, Math.max(0, (d - LO) / SPAN)) * 255);

/** The depth of a pool sampled every res units over [x0, x0 + w] x [z0, z0 + h]. */
export function waterField(depth: (x: number, z: number) => number, x0: number, z0: number, w: number, h: number, res = 0.3): WaterField {
  const nx = Math.ceil(w / res) + 1, nz = Math.ceil(h / res) + 1;
  const v = new Float32Array(nx * nz), data = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const d = depth(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res);
      v[j * nx + i] = d;
      data[j * nx + i] = enc(d);
    }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const at = (x: number, z: number) => {
    const i = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / res - 0.5))), j = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / res - 0.5)));
    return v[j * nx + i];
  };
  const stamp = (x: number, z: number, r: number) => {
    const reach = r + res * 0.5;
    for (let j = Math.max(0, Math.floor((z - reach - z0) / res)); j <= Math.min(nz - 1, Math.ceil((z + reach - z0) / res)); j++)
      for (let i = Math.max(0, Math.floor((x - reach - x0) / res)); i <= Math.min(nx - 1, Math.ceil((x + reach - x0) / res)); i++) {
        const cx = x0 + (i + 0.5) * res, cz = z0 + (j + 0.5) * res, k = j * nx + i;
        if (Math.hypot(cx - x, cz - z) > reach || v[k] < 0) continue;
        v[k] = -0.3;
        data[k] = enc(-0.3);
      }
    tex.needsUpdate = true;
  };
  return { tex, box: new THREE.Vector4(x0, z0, 1 / (nx * res), 1 / (nz * res)), at, stamp, grid: { v, nx, nz, x0, z0, res } };
}

/** A light over the water, streaked on it: where, how high over it, its colour, how bright; a lamp dims with the lamps. */
export interface WaterLight {
  x: number;
  z: number;
  h: number;
  c: number;
  k: number;
  lamp?: boolean;
}
const N = 8;
const DEEP = 0x070e1c, MID = 0x103046, GLOW = 0x2aa8bc, FOAM = 0xc6f2ee, SHEEN = 0x5d8fb4;

/**
 * The water's material: a field's (depth from its texture) or, without one,
 * a mesh's own (its `wDepth` vertices). lamp: the lanterns on (1) or out (0),
 * shared with the world's. lights(): the lights streaked on it, up to seven;
 * follow(): the eighth, one that moves (a gnome's headlamp over it).
 * (One a pool, freed with the course; the field's texture is the mesh's to
 * own: ud(mesh).owned.)
 */
export function waterMaterial(field: WaterField | null, lamp: { value: number } = { value: 1 }) {
  const L = Array.from({ length: N }, () => new THREE.Vector4()), C = Array.from({ length: N }, () => new THREE.Color()), K = new Array<number>(N).fill(0);
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const uniforms = {
    uWDepth: { value: field ? field.tex : null },
    uWBox: { value: field ? field.box : new THREE.Vector4() },
    uWL: { value: L },
    uWLC: { value: C },
    uWK: { value: K },
    uWLamp: lamp,
    uWTime: uTime,
    uWDeep: { value: new THREE.Color(DEEP) },
    uWMid: { value: new THREE.Color(MID) },
    uWGlow: { value: new THREE.Color(GLOW) },
    uWFoam: { value: new THREE.Color(FOAM) },
    uWSheen: { value: new THREE.Color(SHEEN) },
  };
  m.defines = field ? { W_FIELD: "" } : {};
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = "varying vec3 vWW;\n#ifndef W_FIELD\nattribute float wDepth;\nattribute float wMud;\nvarying float vWD;\nvarying float vWM;\n#endif\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vWW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifndef W_FIELD\n  vWD = wDepth;\n  vWM = wMud;\n#endif",
    );
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_BODY);
  };
  m.customProgramCacheKey = () => "mines-water" + (field ? "-field" : "");
  const lights = (list: readonly WaterLight[]) => {
    for (let i = 0; i < N - 1; i++) {
      const q = list[i];
      L[i].set(q ? q.x : 0, q ? q.h : 0, q ? q.z : 0, q ? q.k : 0);
      C[i].set(q ? q.c : 0);
      K[i] = q && q.lamp ? 1 : 0;
    }
  };
  const follow = (x: number, z: number, h: number, k: number) => {
    L[N - 1].set(x, h, z, k);
    C[N - 1].set(0xffe2a6);
  };
  return { material: m, lights, follow };
}

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uWDepth;
uniform vec4 uWBox;
uniform vec4 uWL[${N}];
uniform vec3 uWLC[${N}];
uniform float uWK[${N}];
uniform float uWLamp;
uniform float uWTime;
uniform vec3 uWDeep, uWMid, uWGlow, uWFoam, uWSheen;
varying vec3 vWW;
#ifndef W_FIELD
varying float vWD;
varying float vWM;
#endif
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const FRAG_BODY = /* glsl */ `
{
#ifdef W_FIELD
  float d = texture2D(uWDepth, (vWW.xz - uWBox.xy) * uWBox.zw).r * ${SPAN.toFixed(1)} + ${LO.toFixed(1)};
#else
  float d = vWD;
#endif
  // (the shore's line not the texels': a slow wobble along it)
  d += 0.045 * sin(vWW.x * 2.3 + vWW.z * 1.4 + uWTime * 0.5) + 0.035 * sin(vWW.z * 3.1 - vWW.x * 1.9 - uWTime * 0.35);
  if (d < 0.0) discard;
  float murk = smoothstep(0.05, 0.9, d), sheen = max(murk, 0.35); // (a shallow pool keeps its sheen and its rings: not flat teal)
  vec3 col = mix(uWMid, uWDeep, murk);
  // what grows at the shore, glowing under the surface: a soft band, then a brighter one
  float edge = 1.0 - smoothstep(0.04, 0.55, d);
  col += uWGlow * edge * (0.45 + 0.12 * sin(uWTime * 1.1 + vWW.x * 0.6 + vWW.z * 0.4));
  col = mix(col, uWGlow, step(d, 0.17) * 0.3);
#ifndef W_FIELD
  // a puddle over mud (a pool that brakes the ball, wMud 1): dark brown water, wet, its sheen and rings over it;
  // a hot spring (wMud -1): milky turquoise, paler at its rim
  col = mix(col, mix(vec3(0.06, 0.042, 0.03), vec3(0.025, 0.02, 0.016), murk), max(vWM, 0.0));
  col = mix(col, mix(vec3(0.42, 0.72, 0.7), vec3(0.14, 0.44, 0.48), murk), max(-vWM, 0.0));
#endif
  // the swell: thin wavering lines of light, broken up, drifting
  vec2 q = vWW.xz + 0.5 * vec2(sin(vWW.z * 0.6 + uWTime * 0.35), sin(vWW.x * 0.5 - uWTime * 0.3));
  float line = abs(fract(q.x * 0.3 + q.y * 0.14 + 0.25 * sin(q.y * 0.9 + uWTime * 0.4)) - 0.5);
  col += uWSheen * step(line, 0.02) * step(0.45, sin(q.y * 1.1 - q.x * 0.35 + uWTime * 0.5)) * 0.24 * sheen;
  // drips from the roof: rings going out, here and there
  vec2 cell = floor(vWW.xz / 4.0);
  float hh = wHash(cell);
  if (hh < 0.2) {
    vec2 c = (cell + 0.3 + 0.4 * vec2(wHash(cell + 7.1), wHash(cell + 3.7))) * 4.0;
    float T = 2.8 + 2.2 * hh, ph = fract(uWTime / T + hh * 7.0), dist = length(vWW.xz - c);
    col += uWFoam * (1.0 - ph) * sheen * (0.4 * step(abs(dist - ph), 0.035) + 0.22 * step(0.3, ph) * step(abs(dist - ph * 0.55), 0.03));
  }
  // the lights over it, streaked on it toward the eye, broken by the swell
  vec2 toE = normalize(cameraPosition.xz - vWW.xz + vec2(1e-4));
  for (int i = 0; i < ${N}; i++) {
    vec4 Lq = uWL[i];
    if (Lq.w <= 0.0) continue;
    vec2 rel = vWW.xz - Lq.xz;
    float along = dot(rel, toE), side = dot(rel, vec2(-toE.y, toE.x)) + 0.07 * sin(along * 7.0 + uWTime * 2.3);
    // (in glints of their own lengths, each a lozenge pointed at both ends and
    // thrown to one side or the other: broken light, not the rungs of a ladder)
    float ak = along * 3.2 + 0.7 * sin(along * 1.3 + float(i)) - uWTime * 0.8, kk = floor(ak), fr = fract(ak);
    float hk = fract(sin(kk * 91.7 + float(i) * 13.1) * 43758.5), hw = fract(hk * 17.3), on = 0.3 + 0.45 * hk, u = fr / on;
    float len = 0.6 + Lq.y * 0.6, w = (0.12 + 0.07 * max(along, 0.0)) * (0.45 + 0.9 * hw);
    float lz = step(fr, on) * max(0.0, 1.0 - (2.0 * u - 1.0) * (2.0 * u - 1.0));
    // (soft at its sides and dimmer down its length: a shimmer in the water, no hard-edged strip on it)
    float s = (1.0 - smoothstep(0.3, 1.0, abs(side - (hw - 0.5) * w * 1.4) / max(w * lz, 1e-3))) * step(-0.25, along) * step(along, len) * 0.75;
    col += uWLC[i] * s * Lq.w * mix(1.0, uWLamp, uWK[i]) * (1.0 - 0.6 * max(along, 0.0) / len);
  }
  // the foam line where it meets rock or timber
  float foam = step(d, 0.055 + 0.015 * sin(vWW.x * 7.0 + vWW.z * 5.0 + uWTime * 1.7));
  // (none against a cut face, where the depth drops in a texel: its line would be the texels' saw-tooth)
  float dd = length(vec2(dFdx(d), dFdy(d))) / max(length(vec2(length(dFdx(vWW.xz)), length(dFdy(vWW.xz)))), 1e-4);
  foam *= 1.0 - smoothstep(1.2, 2.5, dd);
  diffuseColor.rgb = mix(col, uWFoam, foam * 0.8);
}
`;

/**
 * The shoreline of a field: its zero line, traced over its grid (marching
 * squares), smoothed round (two passes of corner cutting) and spaced about
 * `step` apart; each line open (it runs off the box) or closed.
 */
export function shoreline(field: WaterField, step = 0.6): { pts: THREE.Vector2[]; closed: boolean }[] {
  const { v, nx, nz, x0, z0, res } = field.grid;
  const P = (i: number, j: number) => new THREE.Vector2(x0 + (i + 0.5) * res, z0 + (j + 0.5) * res);
  // a crossing on a grid edge: h (i, j)-(i+1, j) or v (i, j)-(i, j+1)
  const cross = (key: string) => {
    const [t, a, b] = key.split(","), i = +a, j = +b, k = j * nx + i, k2 = t === "h" ? k + 1 : k + nx;
    const u = v[k] / (v[k] - v[k2] || 1e-6);
    return P(i, j).lerp(t === "h" ? P(i + 1, j) : P(i, j + 1), Math.min(1, Math.max(0, u)));
  };
  const links = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    for (const [p, q] of [[a, b], [b, a]]) (links.get(p) || links.set(p, []).get(p)!).push(q);
  };
  for (let j = 0; j + 1 < nz; j++)
    for (let i = 0; i + 1 < nx; i++) {
      const a = v[j * nx + i] > 0, b = v[j * nx + i + 1] > 0, c = v[(j + 1) * nx + i + 1] > 0, d = v[(j + 1) * nx + i] > 0;
      const e: string[] = [];
      if (a !== b) e.push(`h,${i},${j}`);
      if (b !== c) e.push(`v,${i + 1},${j}`);
      if (c !== d) e.push(`h,${i},${j + 1}`);
      if (d !== a) e.push(`v,${i},${j}`);
      if (e.length === 2) link(e[0], e[1]);
      else if (e.length === 4) {
        // a saddle: the middle says which corners join
        const mid = (v[j * nx + i] + v[j * nx + i + 1] + v[(j + 1) * nx + i + 1] + v[(j + 1) * nx + i]) / 4 > 0;
        if (mid === a) (link(e[0], e[1]), link(e[2], e[3]));
        else (link(e[0], e[3]), link(e[1], e[2]));
      }
    }
  const seen = new Set<string>(), out: { pts: THREE.Vector2[]; closed: boolean }[] = [];
  const walk = (from: string) => {
    const keys = [from];
    seen.add(from);
    for (let cur = from; ; ) {
      const next = (links.get(cur) || []).find((q) => !seen.has(q));
      if (!next) break;
      seen.add(next);
      keys.push(next);
      cur = next;
    }
    return keys;
  };
  // the open ones from their ends first, then the loops
  const ends = [...links].filter(([, l]) => l.length === 1).map(([k]) => k);
  for (const k of [...ends, ...links.keys()]) {
    if (seen.has(k)) continue;
    const keys = walk(k), closed = (links.get(keys[keys.length - 1]) || []).includes(keys[0]) && keys.length > 2;
    if (keys.length < 3) continue;
    let pts = keys.map(cross);
    for (let pass = 0; pass < 2; pass++) {
      const cut: THREE.Vector2[] = closed ? [] : [pts[0]];
      for (let n = 0; n < pts.length - (closed ? 0 : 1); n++) {
        const p = pts[n], q = pts[(n + 1) % pts.length];
        cut.push(p.clone().lerp(q, 0.25), p.clone().lerp(q, 0.75));
      }
      if (!closed) cut.push(pts[pts.length - 1]);
      pts = cut;
    }
    // spaced out evenly
    const even: THREE.Vector2[] = [pts[0]];
    let carry = 0;
    for (let n = 1; n < pts.length + (closed ? 1 : 0); n++) {
      const p = pts[n - 1], q = pts[n % pts.length], l = p.distanceTo(q);
      let s = step - carry;
      while (s <= l) (even.push(p.clone().lerp(q, s / l)), (s += step));
      carry = l - (s - step);
    }
    if (even.length >= 3) out.push({ pts: even, closed });
  }
  return out;
}
