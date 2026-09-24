import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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
const SHARED = new Set();
/** Marks a material, texture or geometry as shared; returns it. */
export const share = (x) => (x && SHARED.add(x), x);
export const isShared = (x) => SHARED.has(x);

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
const palette = new Map();
const flat = (color, opts) => {
  if (opts) return new THREE.MeshToonMaterial({ color, gradientMap: bands, ...opts });
  let m = palette.get(color);
  if (!m) palette.set(color, (m = share(new THREE.MeshToonMaterial({ color, gradientMap: bands }))));
  return m;
};

// The contour is an inverted hull: the same geometry pushed out along its
// normals, drawn from the inside in ink. Unlike edge lines it follows curves,
// so volumes can be rounded and still read as drawn.
/** Pushes a material's vertices out along their normals by w (the hull). */
export function pushHull(mat, w = 0.055, extra = "") {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\n  transformed += normal * ${w.toFixed(3)};` + extra);
  };
  mat.customProgramCacheKey = () => "hull" + w + extra.length;
  mat.userData.hook = "hull" + w + extra.length;
  return mat;
}
/** An ink outline material of width w (shared per width and colour). */
const hulls = new Map();
export function hullOf(w = 0.055, color = C.ink) {
  const k = w + ":" + color;
  if (!hulls.has(k)) hulls.set(k, share(pushHull(new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }), w)));
  return hulls.get(k);
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
export const setTime = (t) => { if (motion) clock.value = t; };
// The wind of the hole's weather (the chain's push per substep, [x, y]): the
// foliage leans with it and sways harder the stronger it is. 0 is calm.
const wind = { value: new THREE.Vector2(0, 0) };
export const setWind = (v) => wind.value.set(v ? v[0] : 0, v ? v[1] : 0);
export const windNow = () => wind.value;

// Wind is done in the vertex shader from world height, so swaying foliage can
// still be merged into one mesh: the grass barely moves, a treetop moves most.
const SWAY = `
  vec4 swayW = modelMatrix * vec4(transformed, 1.0);
  // capped: a treetop sways a few tenths, never metres (a palm's fronds sway
  // and its trunk does not; uncapped, the fronds flew off the trunk)
  float swayH = clamp(swayW.y + 0.6, 0.0, 2.4);
  // a gale sways things about twice as much, never more; and they lean a
  // little downwind — capped, or a tall stem is thrown across the screen
  float swayK = 1.0 + min(length(uWind) * 15.0, 1.0);
  transformed.x += sin(uTime * 1.3 * (0.8 + swayK * 0.2) + swayW.x * 0.37 + swayW.z * 0.21) * 0.028 * swayK * swayH * swayH;
  transformed.z += cos(uTime * 1.1 * (0.8 + swayK * 0.2) + swayW.z * 0.31) * 0.018 * swayK * swayH * swayH;
  // and leans downwind, the board's y being the world's z
  float swayL = min(swayH, 3.0);
  transformed.x += clamp(uWind.x, -0.08, 0.08) * 1.5 * swayL;
  transformed.z += clamp(uWind.y, -0.08, 0.08) * 1.5 * swayL;`;
const withSway = (m, extra = "") => {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clock;
    sh.uniforms.uWind = wind;
    sh.vertexShader = "uniform float uTime;\nuniform vec2 uWind;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>" + extra + SWAY
    );
  };
  m.customProgramCacheKey = () => "sway" + extra.length;
  m.userData.hook = "sway" + extra.length; // same shader whatever the colour: merges
  return m;
};
const swayMats = new Map();
/** A flat material that sways in the wind: for anything that grows. Pass
 *  { double: true } for a flat thing seen from both sides (a pennant, a leaf):
 *  its own cached variant — never set .side on the shared one. */
const sway = (color, { double = false } = {}) => {
  const k = color + (double ? ":2" : "");
  let m = swayMats.get(k);
  if (!m) swayMats.set(k, (m = share(withSway(new THREE.MeshToonMaterial({ color, gradientMap: bands, side: double ? THREE.DoubleSide : THREE.FrontSide })))));
  return m;
};
// its outline sways with it, or the contour would stay behind
const hullSway = share(withSway(new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide }), "\n  transformed += normal * 0.055;"));
const grows = (geometry, color) => drawn(geometry, sway(color), hullSway);
/** A line that sways with the foliage it is drawn on (a frond's rib, a
 *  leaf's vein): a plain line stayed put while the leaf moved. Shared per colour. */
const swayLines = new Map();
const swayLine = (color) => {
  if (!swayLines.has(color)) swayLines.set(color, share(withSway(new THREE.LineBasicMaterial({ color }))));
  return swayLines.get(color);
};

/** A solid plus its contour — the two halves of the look. */
function drawn(geometry, material, line = hull) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, line));
  return g;
}
const inked = (geometry, material) => drawn(geometry, material, hullThin);

/** Nothing in a garden has a sharp corner. */
// 2 segments: round enough under an ink outline, a third of the triangles of 3
const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.98);

/** Board coordinates are (x right, y away); the world uses y for height. */
export const at = (p, h = 0) => new THREE.Vector3(p[0], h, p[1]);

let lanternGlowMat = null;
function lanternGlow() {
  return (lanternGlowMat ||= share(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc86b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
}

let glowCache = null;
function glowTex() {
  if (glowCache) return glowCache;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,.35)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return (glowCache = share(texOf(c)));
}

function texOf(canvas) {
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
export function disposeCourse(root) {
  const tex = (t) => t && !SHARED.has(t) && t.dispose();
  root.traverse((o) => {
    if (o.isInstancedMesh) o.dispose(); // its instance buffers
    if (o.geometry && !o.isSprite && !SHARED.has(o.geometry)) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (SHARED.has(m)) continue;
      for (const k of ["map", "alphaMap", "normalMap", "emissiveMap", "aoMap", "gradientMap"]) tex(m[k]);
      m.dispose();
    }
    for (const x of (o.userData && o.userData.owned) || []) x.dispose();
  });
}

/**
 * Clips a material to a board mask (a texture with one texel per terrain
 * cell, board units w x h): fragments over a cell the mask leaves out are
 * dropped. Ripples and splash rings use it with the water mask, so no ring
 * ever spreads past the water onto the grass.
 */
function clipTo(mat, mask) {
  if (!mask) return mat;
  // the mask is the course's (course.userData.owned frees it), not this material's
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMask = { value: mask.tex };
    sh.uniforms.uSize = { value: new THREE.Vector2(mask.w, mask.h) };
    sh.vertexShader = "varying vec2 vXZ;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n  vXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    sh.fragmentShader = "uniform sampler2D uMask;\nuniform vec2 uSize;\nvarying vec2 vXZ;\n" + sh.fragmentShader.replace("void main() {", "void main() {\n  if (texture2D(uMask, vXZ / uSize).g < 0.5) discard;");
  };
  mat.customProgramCacheKey = () => "clipTo";
  mat.userData.hook = "clip";
  mat.userData.maskId = mask.tex.uuid; // never merged with a mesh clipped to another mask
  return mat;
}

/**
 * A material that can fade out of the camera's way (a canopy, a roof over the
 * lane). Transparent only while faded: an opaque material that is flagged
 * transparent still sorts and blends every frame.
 */
export function fadeable(mat) {
  mat.userData.fade = 1;
  return mat;
}
/** Sets a fadeable material's opacity (0..1), switching transparency on and
 *  off as it crosses 0.99. */
export function setFade(mat, o) {
  if (Math.abs(mat.userData.fade - o) < 0.005) return;
  mat.userData.fade = o;
  const t = o < 0.99;
  if (t !== mat.transparent) (mat.transparent = t), (mat.needsUpdate = true);
  mat.opacity = o;
  mat.depthWrite = !t;
}
/**
 * The canopy fade every world uses: each item is { at: THREE.Vector3 (world),
 * r: radius, mats: [materials] }. Returns fade(eye, ball): items near the line
 * from the eye to the ball go see-through, others come back.
 */
export function fadeLoop(items, { min = 0.25 } = {}) {
  const seg = new THREE.Line3(), near = new THREE.Vector3();
  return (eye, ball) => {
    seg.set(eye, ball);
    for (const it of items) {
      seg.closestPointToPoint(it.at, true, near);
      const d = near.distanceTo(it.at), o = d < it.r * 1.3 ? min : d < it.r * 2.2 ? min + ((d - it.r * 1.3) / (it.r * 0.9)) * (1 - min) : 1;
      for (const m of it.mats) setFade(m, o);
    }
  };
}

export { hull, swayLine, clipTo, ink, flat, sway, grows, drawn, inked, rbox, texOf, lanternGlow, glowTex, tuftGeo, ringLine };
