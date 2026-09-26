import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { GRASS } from "./common";
import { ud, md, type Height, type WaterMask } from "./data";
import type { Vec2 } from "../types";

/** Something the GPU holds: a material, a texture or a geometry. */
type Disposable = { dispose(): void };
/** A shader hook, as onBeforeCompile gets it. */
type Shader = Parameters<THREE.Material["onBeforeCompile"]>[0];
/** A mesh, a line, points or a sprite: what has a geometry and a material. */
export type Drawn = THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;
export const isDrawn = (o: THREE.Object3D): o is Drawn =>
  o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points || o instanceof THREE.Sprite;
// the maps a material may own
const TEXTURES = ["map", "alphaMap", "normalMap", "emissiveMap", "aoMap", "gradientMap"];

// A gnome's garden, in gno.land's own colours: #226C57 is the primary green,
// #60AB96 its light, #144134 its deep. The rest is what a garden needs.
export const C = {
  fairway: 0x60ab96,
  leaf: 0x3f8f6f,
  leafDark: 0x2c6b53,
  hill: 0x2f6d58,
  hillFar: 0x27614e,
  stone: 0x9fae9f,
  sun: 0xffd98a,
  cloud: 0xfff6e6,
  bark: 0x8a6240,
  petal: 0xf2b8b0,
  rim: 0x226c57,
  surround: 0x3f7a64,
  wood: 0xc99a63,
  woodDark: 0x9a6f42,
  cap: 0xe0524b,   // mushroom, and the gnome's hat
  cream: 0xfdf6e9,
  soil: 0xe3c79a,
  pond: 0x79c0e8,
  moss: 0x8fcba8,
  burrow: 0x144134,
  ink: 0x144134,
  wear: 0x226c57,
};

// Things made once and used by every hole (a module-level material, texture
// or geometry): disposeCourse never frees them. Anything cached at module
// level must go through share(), or the next hole draws with a freed object.
const SHARED = new Set<unknown>();
/** Marks a material, texture or geometry as shared; returns it. */
export const share = <T extends Disposable>(x: T): T => (SHARED.add(x), x);

const ink = share(new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.85 }));

// Cel shading: light is quantised into three flat bands instead of a gradient.
// With the contours, that is the whole look — the volumes read as drawn, not
// rendered.
const bands = (() => {
  const t = new THREE.DataTexture(new Uint8Array([104, 178, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return share(t);
})();

// One material per colour, shared by every prop that uses it: a garden of
// hundreds of meshes then needs a couple of dozen materials, not a thousand.
// A material built with options is the caller's own and is not shared.
const palette = new Map<THREE.ColorRepresentation, THREE.MeshToonMaterial>();
const flat = (color: THREE.ColorRepresentation, opts?: THREE.MeshToonMaterialParameters) => {
  if (opts) return new THREE.MeshToonMaterial({ color, gradientMap: bands, ...opts });
  let m = palette.get(color);
  if (!m) palette.set(color, (m = share(new THREE.MeshToonMaterial({ color, gradientMap: bands }))));
  return m;
};

// The contour is an inverted hull: the same geometry pushed out along its
// normals, drawn from the inside in ink. Unlike edge lines it follows curves,
// so volumes can be rounded and still read as drawn.
/** Pushes a material's vertices out along their normals by w (the hull). */
function pushHull<M extends THREE.Material>(mat: M, w = 0.055, extra = ""): M {
  mat.onBeforeCompile = (sh: Shader) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n  transformed += normal * ${w.toFixed(3)};` + extra);
  };
  // keyed on the snippet itself: two of the same length are not one shader
  mat.customProgramCacheKey = () => "hull" + w + extra;
  md(mat).hook = "hull" + w + extra;
  md(mat).hull = true; // an outline (the Low tier leaves distant ones out: see bake)
  return mat;
}
/** An ink outline material of width w (shared per width and colour). */
const hulls = new Map<string, THREE.MeshBasicMaterial>();
export function hullOf(w = 0.055, color: number = C.ink) {
  const k = w + ":" + color;
  if (!hulls.has(k)) hulls.set(k, share(pushHull(new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }), w)));
  return hulls.get(k)!;
}
const hull = hullOf(0.055);
// the gnome is seen up close in the picker: a scenery-weight line is too heavy
const hullThin = hullOf(0.028);

// ---------------------------------------------------------------- motion
//
// The garden moves a little: foliage sways, water ripples, smoke rises. All of
// it is decoration, and all of it stops for a player who asked the system for
// less motion.

export const motion = typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = { value: 0 };
/** Advances the garden's clock; the engine calls it once a frame. */
export const setTime = (t: number) => { if (motion) clock.value = t; };
// The wind of the hole's weather (the chain's push per substep, [x, y]): the
// foliage leans with it and sways harder the stronger it is. 0 is calm.
const wind = { value: new THREE.Vector2(0, 0) };
export const setWind = (v: readonly [number, number] | null | undefined) => wind.value.set(v ? v[0] : 0, v ? v[1] : 0);
export const windNow = () => wind.value;

// Wind is done in the vertex shader from world height, so swaying foliage can
// still be merged into one mesh: the grass barely moves, a treetop moves most.
const SWAY = `
  vec4 swayW = modelMatrix * vec4(transformed, 1.0);
  // how high above its own foot (swayFoot, see plantFeet): 0 there, so a
  // trunk never slides off its bed, its pot or its dune
  float swayH = max(swayW.y - swayFoot.y, 0.0);
  // the plant turns about its foot by an angle: a gentle arc over its lowest
  // 0.6, then straight at that angle (C1: never an S, never a kink), so a tall
  // tree tilts rather than shears
  float swayB = swayH < 0.6 ? swayH * swayH / 1.2 : swayH - 0.3;
  // a gale flutters things about twice as much, never more; and they lean
  // downwind, both capped by the plant's flex (swayFlex: 1 for grass, flowers,
  // bunting; a stiff pine about 0.28, a lean of 2-4 degrees at the most)
  float swayK = 1.0 + min(length(uWind) * 15.0, 1.0);
  // phased by the plant's foot, not the vertex: all of a plant turns as one
  float swayF = 0.05 * swayK * swayFlex;
  vec2 swayA = vec2(sin(uTime * 1.3 * (0.8 + swayK * 0.2) + swayFoot.x * 0.37 + swayFoot.z * 0.21), 0.7 * cos(uTime * 1.1 * (0.8 + swayK * 0.2) + swayFoot.z * 0.31)) * swayF;
  // and leans downwind, the board's y being the world's z
  swayA += clamp(uWind, -0.08, 0.08) * 1.75 * swayFlex;
  transformed.x += swayA.x * swayB;
  transformed.z += swayA.y * swayB;`;
const withSway = <M extends THREE.Material>(m: M, extra = ""): M => {
  m.onBeforeCompile = (sh: Shader) => {
    sh.uniforms.uTime = clock;
    sh.uniforms.uWind = wind;
    sh.vertexShader = "uniform float uTime;\nuniform vec2 uWind;\nattribute vec3 swayFoot;\nattribute float swayFlex;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>" + extra + SWAY
    );
  };
  m.customProgramCacheKey = () => "sway" + extra;
  md(m).hook = "sway" + extra; // same shader whatever the colour: merges (keyed on the snippet, not its length)
  return m;
};
const footV = new THREE.Vector3();
/** Gives a swaying geometry the foot and flex of o's plant: its nearest
 *  ancestor marked with userData.foot (that foot's local y) and userData.flex
 *  (1 unless stiffer); unmarked, the grass and 1. Every swaying geometry needs
 *  them (plantFeet sets them). */
export function setFoot(geo: THREE.BufferGeometry, o: THREE.Object3D) {
  let flex = 1;
  o.getWorldPosition(footV).setY(GRASS);
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (ud(p).foot !== undefined) {
    p.localToWorld(footV.set(0, ud(p).foot!, 0));
    flex = ud(p).flex ?? 1;
    break;
  }
  const n = geo.attributes.position.count, foot = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) foot.set([footV.x, footV.y, footV.z], i * 3);
  geo.setAttribute("swayFoot", new THREE.BufferAttribute(foot, 3));
  geo.setAttribute("swayFlex", new THREE.BufferAttribute(new Float32Array(n).fill(flex), 1));
  return geo;
}
/** Sets the foot of every swaying mesh or line under root that has none
 *  (bake() calls it; a shared geometry is copied first, its foot is per plant). */
export function plantFeet(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!isDrawn(o)) return;
    const m = o.material;
    if (!o.geometry || !m || Array.isArray(m) || !String(md(m).hook).startsWith("sway")) return;
    if (SHARED.has(o.geometry)) o.geometry = o.geometry.clone();
    else if (o.geometry.attributes.swayFoot) return;
    setFoot(o.geometry, o);
  });
}
const swayMats = new Map<string, THREE.MeshToonMaterial>();
/** A flat material that sways in the wind: for anything that grows. Pass
 *  { double: true } for a flat thing seen from both sides (a pennant, a leaf):
 *  its own cached variant — never set .side on the shared one. */
const sway = (color: number, { double = false } = {}) => {
  const k = color + (double ? ":2" : "");
  let m = swayMats.get(k);
  if (!m) swayMats.set(k, (m = share(withSway(new THREE.MeshToonMaterial({ color, gradientMap: bands, side: double ? THREE.DoubleSide : THREE.FrontSide })))));
  return m;
};
// its outline sways with it, or the contour would stay behind
const hullSway = share(withSway(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }), "\n  transformed += normal * 0.055;"));
md(hullSway).hull = true;
/** The graphics tier the next hole is built for: low leaves the ink outlines
 *  off the decor far from the board (see bake), where they are a pixel wide. */
export const quality = { low: false };
const grows = (geometry: THREE.BufferGeometry, color: number) => drawn(geometry, sway(color), hullSway);
/** A line that sways with the foliage it is drawn on (a frond's rib, a
 *  leaf's vein): a plain line stayed put while the leaf moved. Shared per colour. */
const swayLines = new Map<number, THREE.LineBasicMaterial>();
const swayLine = (color: number) => {
  if (!swayLines.has(color)) swayLines.set(color, share(withSway(new THREE.LineBasicMaterial({ color }))));
  return swayLines.get(color)!;
};

/** A solid plus its contour — the two halves of the look. */
function drawn(geometry: THREE.BufferGeometry, material: THREE.Material, line: THREE.Material = hull) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, line));
  return g;
}
const inked = (geometry: THREE.BufferGeometry, material: THREE.Material) => drawn(geometry, material, hullThin);

/** Nothing in a garden has a sharp corner. */
// 2 segments: round enough under an ink outline, a third of the triangles of 3
const rbox = (w: number, h: number, d: number, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.98);

// ---------------------------------------------------------------- relief
//
// Borders (kerbs, rails, their posts, a bank's face, a quay) get some volume
// and a light texture, the same way in every world: their colour darkens down
// to the foot (baked into vertex colours by shade()), the top catches a
// little more light, and a fine grain runs over them — soft value noise of
// the world position, in the shader. No texture, nothing done per frame; one
// material per side, so the bake merges every border of a hole into one draw.

/** A soft grain, scaled by k, on the vertical faces only (sides) or on all;
 *  and a touch more light on what faces up. Adds to any lit material. */
function withGrain<M extends THREE.Material>(m: M, k = 0.07, sides = false): M {
  const key = "grain" + k + (sides ? "s" : "");
  m.onBeforeCompile = (sh: Shader) => {
    sh.vertexShader = "varying vec3 vGrainW;\nvarying vec3 vGrainN;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n  vGrainW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vGrainN = normalize(mat3(modelMatrix) * objectNormal);",
    );
    sh.fragmentShader = `varying vec3 vGrainW;
varying vec3 vGrainN;
float grainHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float grainNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(grainHash(i), grainHash(i + vec3(1, 0, 0)), f.x), mix(grainHash(i + vec3(0, 1, 0)), grainHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(grainHash(i + vec3(0, 0, 1)), grainHash(i + vec3(1, 0, 1)), f.x), mix(grainHash(i + vec3(0, 1, 1)), grainHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
` + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    // fine grain, stretched along the ground (a kerb's run, a bank's strata), over a broader mottle
    float g = grainNoise(vGrainW * vec3(3.0, 9.0, 3.0)) - 0.5 + 0.6 * (grainNoise(vGrainW * 1.3) - 0.5);
    float up = ${sides ? "1.0 - abs(vGrainN.y)" : "1.0"};
    diffuseColor.rgb *= 1.0 + ${k.toFixed(3)} * 2.0 * g * up${sides ? "" : " + 0.08 * smoothstep(0.55, 0.95, vGrainN.y)"};
  }`,
    );
  };
  m.customProgramCacheKey = () => key;
  md(m).hook = key;
  return m;
}
const reliefs = new Map<number, THREE.MeshToonMaterial>();
/** The material of a border built with shade(): white toon over its vertex
 *  colours, with the grain. Shared per side. */
export function relief(side: THREE.Side = THREE.FrontSide) {
  let m = reliefs.get(side);
  if (!m) reliefs.set(side, (m = share(withGrain(new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: bands, side })))));
  return m;
}
/** The grain on the vertical faces of a vertex-coloured ground (a lane's
 *  side face down to the sea, a bank). Returns m. */
export const grainSides = <M extends THREE.Material>(m: M) => withGrain(m, 0.08, true);

/** Colours a geometry color times k per vertex (vertex colours, for relief()):
 *  by default darker toward its foot, k from 0.62 at its lowest to 1.06 at its
 *  top; k(y01, i) for a builder that knows better (i: the vertex). */
export function shade(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, k: (y01: number, i: number) => number = (y) => 0.62 + 0.44 * Math.sqrt(y)) {
  const p = geo.attributes.position, c = new THREE.Color(color), col = new Float32Array(p.count * 3);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const lo = geo.boundingBox!.min.y, span = geo.boundingBox!.max.y - lo || 1;
  for (let i = 0; i < p.count; i++) {
    const f = k((p.getY(i) - lo) / span, i);
    col[i * 3] = c.r * f;
    col[i * 3 + 1] = c.g * f;
    col[i * 3 + 2] = c.b * f;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return geo;
}
/** A border piece with volume: shaded to its foot, grained, outlined. */
export const carved = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, side: THREE.Side = THREE.FrontSide, k?: (y01: number, i: number) => number) =>
  drawn(shade(geo, color, k), relief(side));

// ---------------------------------------------------------------- water
//
// One look for every body of water on a lane (a pond, a moat, a rock pool, a
// lagoon, a canal): its colour per vertex, from waterTone — pale in the
// shallows, deep in the middle, a line of foam where it laps the bank — and
// a slow shimmer of light drifting over it, done in the shader from the world
// position and the shared clock: nothing per frame on the CPU, still for a
// player who asked for less motion. One material: all a hole's water is one
// draw call.

/** The shallows and the deep of each water, by skin (a pond's by default). */
const WATERS: Record<string, readonly [number, number]> = {
  water: [0x86c3cc, 0x2c6479],
  tidepool: [0x8fe3d6, 0x2e8f9e],
  lagoon: [0x8fe8dc, 0x2fa3ad],
  canal: [0x7fb2c4, 0x2a5a73],
};
const shallowC = new THREE.Color(), deepC = new THREE.Color(), foamC = new THREE.Color(0xeef8f6);
/** The colour of water `skin` at a point d in from its shore, over `depth`
 *  of water (0 where it laps the bank: foam), into c. */
export function waterTone(c: THREE.Color, skin: string, d: number, depth: number) {
  const [a, b] = WATERS[skin] || WATERS.water;
  return c.copy(shallowC.set(a)).lerp(deepC.set(b), smoothstep01((d - 0.3) / 2.2)).lerp(foamC, 0.6 * (1 - smoothstep01(depth / 0.1)));
}
const smoothstep01 = (x: number) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
let waterM: THREE.MeshBasicMaterial | null = null;
/** The shared water material (vertex colours from waterTone). */
export function waterMat() {
  if (waterM) return waterM;
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh: Shader) => {
    sh.uniforms.uTime = clock;
    sh.vertexShader = "varying vec2 vWaterXZ;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vWaterXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = "uniform float uTime;\nvarying vec2 vWaterXZ;\n" + sh.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
  {
    // long soft streaks of sky, drifting and crossing: the water is never still
    vec2 p = vWaterXZ;
    float a = sin(p.x * 0.9 + p.y * 1.7 + uTime * 0.55) * sin(p.x * 2.3 - p.y * 0.6 - uTime * 0.4 + sin(p.y * 0.5));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.2 * smoothstep(0.72, 0.95, a));
  }`,
    );
  };
  m.customProgramCacheKey = () => "water";
  md(m).hook = "water";
  return (waterM = share(m));
}

/** One row of a bank's face: its height, how far out it leans, the colour
 *  of the band below it. */
export type BankRow = readonly [y: number, out: number, color: number];
const BANK_BANDS = [0xe6cb98, 0xbd9466, 0xd9bb88, 0xa98158] as const; // sand, earth, sand, earth
/**
 * A natural bank of earth and sand, from its lip (top) down to foot, where
 * it meets water at level `water`: a turf lip of colour `turf` with an uneven
 * edge, overhanging a little; strata of sand and earth, leaning out as they
 * go down; a darker wet band, a line of foam at the water, and the dark
 * under it. Rows top to foot; (x, z) wobbles them, so a corner two faces
 * share has the same rows on both. With shade()'s darkening to each band's
 * foot and grainSides() on the material, it has volume, not a flat band.
 */
export function bankRows(x: number, z: number, top: number, water: number, foot: number, turf: number): BankRow[] {
  const w1 = Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4), w2 = Math.sin(x * 2.9 - z * 1.9 + 1.3), w3 = Math.cos(x * 0.8 + z * 2.3 - 0.7);
  const raw: [number, number, number][] = [
    [top, 0, turf],
    [top - 0.11 - 0.05 * w1, -0.08, BANK_BANDS[0]], // under the turf: the lip overhangs
    [top - 0.32 + 0.07 * w2, -0.02, BANK_BANDS[1]],
    [top - 0.56 + 0.06 * w3, 0.04 + 0.04 * w1, BANK_BANDS[2]],
    [top - 0.8 + 0.06 * w2, 0.08, BANK_BANDS[3]],
    [water + 0.34 + 0.04 * w3, 0.12, 0x7d6448], // wet
    [water + 0.13 + 0.02 * w1, 0.15, 0xeef7f3], // foam, just over the water
    [water + 0.02, 0.17, 0x4a3e30], // and under it
    [foot, 0.22, 0x4a3e30],
  ];
  // never folding back up: a low lip squeezes its strata
  for (let k = 1; k < raw.length; k++) raw[k][0] = Math.min(raw[k][0], raw[k - 1][0] - 0.03);
  return raw;
}

/** Board coordinates are (x right, y away); the world uses y for height. */
export const at = (p: Vec2, h = 0) => new THREE.Vector3(p[0], h, p[1]);

let lanternGlowMat: THREE.SpriteMaterial | null = null;
function lanternGlow() {
  return (lanternGlowMat ||= share(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc86b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
}

let glowCache: THREE.CanvasTexture | null = null;
function glowTex() {
  if (glowCache) return glowCache;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return (glowCache = share(texOf(c)));
}

function texOf(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// tufts are many and tiny: one shared geometry, no contour
const tuftGeo = share(new THREE.ConeGeometry(0.09, 0.55, 4));

const ringLine = share(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));

/**
 * Frees what a course, a splash or a confetti burst holds on the GPU. Shared
 * things (anything passed through share()) stay, since the next course uses
 * them too; so does three's own sprite geometry. What a course owns outright
 * that no mesh holds (its water mask...) is listed in root.userData.owned.
 */
export function disposeCourse(root: THREE.Object3D) {
  const tex = (t: unknown) => t instanceof THREE.Texture && !SHARED.has(t) && t.dispose();
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) o.dispose(); // its instance buffers
    if (isDrawn(o)) {
      if (o.geometry && !(o instanceof THREE.Sprite) && !SHARED.has(o.geometry)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (SHARED.has(m)) continue;
        for (const k of TEXTURES) tex(Reflect.get(m, k));
        m.dispose();
      }
    }
    for (const x of ud(o).owned || []) x.dispose();
  });
}

/**
 * Clips a material to a board mask (a texture with one texel per terrain
 * cell, board units w x h): fragments over a cell the mask leaves out are
 * dropped. Ripples and splash rings use it with the water mask, so no ring
 * ever spreads past the water onto the grass.
 */
function clipTo<M extends THREE.Material>(mat: M, mask: WaterMask | null): M {
  if (!mask) return mat;
  // the mask is the course's (course.userData.owned frees it), not this material's
  mat.onBeforeCompile = (sh: Shader) => {
    sh.uniforms.uMask = { value: mask.tex };
    sh.uniforms.uSize = { value: new THREE.Vector2(mask.w, mask.h) };
    sh.vertexShader = "varying vec2 vXZ;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = "uniform sampler2D uMask;\nuniform vec2 uSize;\nvarying vec2 vXZ;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n  if (texture2D(uMask, vXZ / uSize).g < 0.5) discard;");
  };
  mat.customProgramCacheKey = () => "clipTo";
  md(mat).hook = "clip";
  md(mat).maskId = mask.tex.uuid; // never merged with a mesh clipped to another mask
  return mat;
}

/**
 * A material that can fade out of the camera's way (a canopy, a roof over the
 * lane). Transparent only while faded: an opaque material that is flagged
 * transparent still sorts and blends every frame.
 */
export function fadeable<M extends THREE.Material>(mat: M): M {
  md(mat).fade = 1;
  return mat;
}
/** Sets a fadeable material's opacity (0..1), switching transparency on and
 *  off as it crosses 0.99. A see-through one (userData.base, its own opacity:
 *  ice) stays see-through, at base times the fade. */
export function setFade(mat: THREE.Material, o: number) {
  const d = md(mat);
  if (Math.abs((d.fade ?? 1) - o) < 0.005) return;
  d.fade = o;
  const base = d.base, t = o < 0.99 || base !== undefined;
  if (t !== mat.transparent) (mat.transparent = t), (mat.needsUpdate = true);
  mat.opacity = (base ?? 1) * o;
  mat.depthWrite = !t;
}
/** An ink outline that can fade with its solid (the shared hull cannot). */
const fadeHull = () => fadeable(pushHull(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }), 0.055));
/**
 * Gives a piece over the lane its own fadeable materials (clones of what it
 * draws with, one fadeable outline for all its hulls), so it can fade out of
 * the camera's way without fading the shared palette; marks it live. A
 * see-through material keeps its opacity as its base (setFade). Returns the
 * materials, for fadeLoop.
 */
export function ownFade(piece: THREE.Object3D) {
  const own = new Map<THREE.Material, THREE.Material>();
  let ink: THREE.MeshBasicMaterial | null = null;
  piece.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line) || Array.isArray(o.material)) return;
    // a plain outline: one fadeable hull for all of them; a swaying one (its
    // own shader) is cloned like a solid, so it keeps swaying with it
    const was = o.material as THREE.Material;
    if (was.side === THREE.BackSide && !String(md(was).hook).startsWith("sway")) return void (o.material = ink ||= fadeHull());
    if (!own.has(was)) {
      const m = fadeable(was.clone());
      // clone() drops the shader hook (sway, a hull's push): keep it
      // (three declares the hooks as methods; they are closures, copied as they are)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      m.onBeforeCompile = was.onBeforeCompile;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      m.customProgramCacheKey = was.customProgramCacheKey;
      if (was.transparent) (md(m).base = was.opacity), (m.depthWrite = false);
      own.set(was, m);
    }
    o.material = own.get(was)!;
  });
  ud(piece).live = true;
  return ink ? [...own.values(), ink] : [...own.values()];
}
/** One thing a canopy fade watches: where it is (read from obj if it moves), its radius, its materials. */
export interface FadeItem {
  at: THREE.Vector3;
  r: number;
  mats: readonly THREE.Material[];
  obj?: THREE.Object3D;
}
/**
 * The canopy fade every world uses: each item is { at: THREE.Vector3 (world),
 * r: radius, mats: [materials] }, and with obj (an Object3D that moves) its
 * at is read from where obj is now. Returns fade(eye, ball): items near the
 * line from the eye to the ball go see-through, others come back.
 */
export function fadeLoop(items: readonly FadeItem[], { min = 0.22 } = {}) {
  const seg = new THREE.Line3(), near = new THREE.Vector3();
  // nothing that moves by itself, the eye and the ball where they were: every
  // fade stands as it is (a still camera on a ball at rest, frame after frame)
  const lastEye = new THREE.Vector3(NaN, 0, 0), lastBall = new THREE.Vector3(), moving = items.some((it) => it.obj);
  return (eye: THREE.Vector3, ball: THREE.Vector3) => {
    if (!moving && eye.equals(lastEye) && ball.equals(lastBall)) return;
    lastEye.copy(eye);
    lastBall.copy(ball);
    seg.set(eye, ball);
    for (const it of items) {
      if (it.obj) it.obj.getWorldPosition(it.at);
      seg.closestPointToPoint(it.at, true, near);
      const d = near.distanceTo(it.at), o = d < it.r * 1.3 ? min : d < it.r * 2.2 ? min + ((d - it.r * 1.3) / (it.r * 0.9)) * (1 - min) : 1;
      for (const m of it.mats) setFade(m, o);
    }
  };
}

/** A flat layer lying on another: pulled towards the eye in the depth test
 *  (k times, by units a step), so at a distance it never shimmers against
 *  what it lies on. Returns the material. */
export const onTop = <M extends THREE.Material>(m: M, k = 1, units = 4) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -1 * k, polygonOffsetUnits: -units * k });

/** A geometry from flat arrays: positions, an index (none: a triangle soup)
 *  and vertex colours (none: none), its normals computed. */
export function geoOf(pos: readonly number[], idx?: number[] | null, col?: readonly number[] | null) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (col) geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  if (idx) geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * A sheet of (nx + 1) × (nz + 1) vertices, rows of i along each j: vert(i, j)
 * pushes each one's position (and colour) onto pos (and col), keep(a, b, d, e)
 * says whether the cell between those four vertices is drawn (every one by
 * default). Two triangles a cell, wound a, d, b / b, d, e.
 */
export function gridGeo(
  nx: number, nz: number,
  vert: (i: number, j: number, pos: number[], col: number[]) => void,
  keep?: (a: number, b: number, d: number, e: number, i: number, j: number, pos: readonly number[]) => boolean,
) {
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) vert(i, j, pos, col);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      if (!keep || keep(a, b, d, e, i, j, pos)) idx.push(a, d, b, b, d, e);
    }
  return geoOf(pos, idx, col.length ? col : null);
}

/** Lifts a world-space geometry onto the height field, vertex by vertex. */
export function drape(geo: THREE.BufferGeometry, height: Height) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + height(p.getX(i), p.getZ(i)));
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export { swayLine, clipTo, ink, flat, sway, grows, drawn, inked, rbox, texOf, lanternGlow, glowTex, tuftGeo, ringLine };
