// @ts-check
// A gnome's meshes seen from the thumbnails' camera (web/lib/scene/
// gnome-showcase.ts), drawn in software into layers of pixels, then traced
// back into SVG paths: what build.mjs makes the portrait's shapes with.
//
// The picture is SIZE units square, the thumbnails' frame (a unit a pixel
// of their 256); it is drawn at SS pixels a unit and traced from there.

/** The portrait's side, in SVG units: viewBox 0 0 SIZE SIZE. */
export const SIZE = 256;
/** Raster pixels a unit. */
const SS = 4;
/** The raster's side, in pixels. */
export const N = SIZE * SS;

/** @typedef {[number, number, number]} V3 */
const sub = (/** @type {V3} */ a, /** @type {V3} */ b) => /** @type {V3} */ ([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
const dot = (/** @type {V3} */ a, /** @type {V3} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (/** @type {V3} */ a, /** @type {V3} */ b) => /** @type {V3} */ ([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
const unit = (/** @type {V3} */ a) => { const l = Math.hypot(...a); return /** @type {V3} */ ([a[0] / l, a[1] / l, a[2] / l]); };

// the showcase's camera: 26° high, looking at (0, 0.8, 0) from 4.9 away, three-quarters from his front
const TARGET = /** @type {V3} */ ([0, 0.8, 0]);
const BACK = unit([0.68, 0.36, 0.72]);
const EYE = /** @type {V3} */ ([TARGET[0] + BACK[0] * 4.9, TARGET[1] + BACK[1] * 4.9, TARGET[2] + BACK[2] * 4.9]);
const FWD = /** @type {V3} */ ([-BACK[0], -BACK[1], -BACK[2]]);
const RIGHT = unit(cross(FWD, [0, 1, 0]));
const UP = cross(RIGHT, FWD);
const FOCAL = 1 / Math.tan((13 * Math.PI) / 180);

/** A world point on the raster: [x, y] in pixels and its depth (distance along the view). */
export function project(/** @type {V3} */ p) {
  const v = sub(p, EYE), z = dot(v, FWD);
  return /** @type {V3} */ ([((dot(v, RIGHT) * FOCAL) / z + 1) * N / 2, (1 - (dot(v, UP) * FOCAL) / z) * N / 2, z]);
}
/** A world point in SVG units. */
export const toUnits = (/** @type {V3} */ p) => { const [x, y] = project(p); return [x / SS, y / SS]; };
/** How many SVG units a world length is, at a depth. */
export const unitsAt = (/** @type {number} */ len, /** @type {number} */ z) => (len * FOCAL * N) / 2 / z / SS;
/** The depth of the body's centre (where the depth keys are measured from). */
export const VIEW_DEPTH = 4.9;

// the game's day light (camera.ts makeScene): a sky over a green ground, a sun from above right
const lin = (/** @type {number} */ c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgbLin = (/** @type {number} */ h) => /** @type {V3} */ ([lin((h >> 16) & 255), lin((h >> 8) & 255), lin(h & 255)]);
const SKY = rgbLin(0xfff3df), GROUND = rgbLin(0x9fc4b3), SUN = rgbLin(0xfff6e2), SUN_AT = unit([24, 40, 6]);
const lum = (/** @type {V3} */ c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** The light a surface facing n gets (linear, before its colour), its sun banded by levels (a toon gradient map). */
function light(/** @type {V3} */ n, /** @type {number[]} */ levels) {
  const k = 0.5 * n[1] + 0.5, d = dot(n, SUN_AT);
  const band = Math.min(levels.length - 1, Math.floor((d * 0.5 + 0.5) * levels.length));
  const s = (levels[Math.max(0, band)] / 255) * 0.7;
  return { rgb: /** @type {V3} */ ([0, 1, 2].map((i) => 1.3 * (GROUND[i] + (SKY[i] - GROUND[i]) * k) + s * SUN[i])), band };
}
const TOON = [104, 178, 255];
/** The light on a lit top (a surface facing up, in the brightest band): what a colour's own fill is drawn under. */
export const LIT = light([0, 1, 0], TOON).rgb;
/** Each channel's factor from a colour to its lit fill, in sRGB (≈ the linear factor ^ 1/2.2). */
export const LIT_SRGB = LIT.map((c) => (c / Math.PI) ** (1 / 2.2));

/**
 * A layer: one mesh drawn alone, within its box: depth (Infinity where it is
 * not), the light on it relative to a lit top (lum ratio), its toon band,
 * and its texture's colour where it has one.
 * @typedef {{ x0: number, y0: number, w: number, h: number, depth: Float32Array, shade: Float32Array, band: Int8Array, texel: Int32Array | null }} Layer
 */

/**
 * Draws a mesh (extract.mjs's Mesh) into a layer of its own.
 * @param {import("./extract.mjs").Mesh} m
 * @param {{ w: number, h: number, data: number[], flipY: boolean } | null} tex
 * @returns {Layer | null}
 */
export function rasterize(m, tex) {
  const pos = m.position, nrm = m.normal, uv = m.uv;
  const count = m.index ? m.index.length : pos.length / 3;
  const idx = (/** @type {number} */ k) => (m.index ? m.index[k] : k);
  const levels = m.bands ?? TOON;
  /** @type {{ s: V3[], n: V3[], u: number[][] }[]} */
  const tris = [];
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (const e of m.at) {
    // the world matrix (column-major) and its normal matrix (the inverse transpose of its 3×3)
    const tp = (/** @type {number} */ i) => /** @type {V3} */ ([
      e[0] * pos[3 * i] + e[4] * pos[3 * i + 1] + e[8] * pos[3 * i + 2] + e[12],
      e[1] * pos[3 * i] + e[5] * pos[3 * i + 1] + e[9] * pos[3 * i + 2] + e[13],
      e[2] * pos[3 * i] + e[6] * pos[3 * i + 1] + e[10] * pos[3 * i + 2] + e[14]]);
    const a = [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]];
    const det = a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    // (inverse transpose = cofactors / det)
    const cof = [
      [a[1][1] * a[2][2] - a[1][2] * a[2][1], a[1][2] * a[2][0] - a[1][0] * a[2][2], a[1][0] * a[2][1] - a[1][1] * a[2][0]],
      [a[0][2] * a[2][1] - a[0][1] * a[2][2], a[0][0] * a[2][2] - a[0][2] * a[2][0], a[0][1] * a[2][0] - a[0][0] * a[2][1]],
      [a[0][1] * a[1][2] - a[0][2] * a[1][1], a[0][2] * a[1][0] - a[0][0] * a[1][2], a[0][0] * a[1][1] - a[0][1] * a[1][0]]];
    const tn = (/** @type {number} */ i) => nrm ? unit(/** @type {V3} */ ([0, 1, 2].map((r) => (cof[r][0] * nrm[3 * i] + cof[r][1] * nrm[3 * i + 1] + cof[r][2] * nrm[3 * i + 2]) / det))) : null;
    for (let k = 0; k + 2 < count; k += 3) {
      const vs = [idx(k), idx(k + 1), idx(k + 2)];
      const w = vs.map(tp);
      const s = w.map(project);
      if (s.some((p) => p[2] <= 0.1)) continue;
      let n = vs.map(tn);
      if (!n[0]) { const f = unit(cross(sub(w[1], w[0]), sub(w[2], w[0]))); n = [f, f, f]; }
      tris.push({ s, n: /** @type {V3[]} */ (n), u: uv ? vs.map((i) => [uv[2 * i], uv[2 * i + 1]]) : [] });
      for (const p of s) (x0 = Math.min(x0, p[0])), (y0 = Math.min(y0, p[1])), (x1 = Math.max(x1, p[0])), (y1 = Math.max(y1, p[1]));
    }
  }
  x0 = Math.max(0, Math.floor(x0)), y0 = Math.max(0, Math.floor(y0)), x1 = Math.min(N, Math.ceil(x1) + 1), y1 = Math.min(N, Math.ceil(y1) + 1);
  if (x1 <= x0 || y1 <= y0) return null;
  const w = x1 - x0, h = y1 - y0;
  const depth = new Float32Array(w * h).fill(Infinity), shade = new Float32Array(w * h), band = new Int8Array(w * h);
  const texel = tex ? new Int32Array(w * h) : null;
  const ref = lum(LIT);
  for (const t of tris) {
    const [A, B, C] = t.s;
    const area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (Math.abs(area) < 1e-9) continue;
    const bx0 = Math.max(x0, Math.floor(Math.min(A[0], B[0], C[0]))), bx1 = Math.min(x1 - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
    const by0 = Math.max(y0, Math.floor(Math.min(A[1], B[1], C[1]))), by1 = Math.min(y1 - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
    for (let py = by0; py <= by1; py++) for (let px = bx0; px <= bx1; px++) {
      const x = px + 0.5, y = py + 0.5;
      const l0 = ((B[0] - x) * (C[1] - y) - (B[1] - y) * (C[0] - x)) / area;
      const l1 = ((C[0] - x) * (A[1] - y) - (C[1] - y) * (A[0] - x)) / area;
      const l2 = 1 - l0 - l1;
      if (l0 < 0 || l1 < 0 || l2 < 0) continue;
      // perspective-correct: weights over each vertex's depth
      const q0 = l0 / A[2], q1 = l1 / B[2], q2 = l2 / C[2], qs = q0 + q1 + q2;
      const z = 1 / qs, o = (py - y0) * w + (px - x0);
      if (z >= depth[o]) continue;
      // under the ground: the plinth hides it (a long beard's tip)
      const at = unproject(x, y, z);
      if (at[1] < 0) continue;
      depth[o] = z;
      let n = unit(/** @type {V3} */ ([0, 1, 2].map((i) => (t.n[0][i] * q0 + t.n[1][i] * q1 + t.n[2][i] * q2) / qs)));
      // a face seen from behind (a double-sided brim's inside) is lit as three lights it: turned to the eye
      if (dot(n, sub(EYE, at)) < 0) n = /** @type {V3} */ ([-n[0], -n[1], -n[2]]);
      const l = light(n, levels);
      shade[o] = lum(l.rgb) / ref;
      band[o] = l.band;
      if (texel && tex) {
        const u = (t.u[0][0] * q0 + t.u[1][0] * q1 + t.u[2][0] * q2) / qs, v = (t.u[0][1] * q0 + t.u[1][1] * q1 + t.u[2][1] * q2) / qs;
        const tx = Math.min(tex.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.w)));
        const vv = v - Math.floor(v), ty = Math.min(tex.h - 1, Math.max(0, Math.floor((tex.flipY ? 1 - vv : vv) * tex.h)));
        const i = 4 * (ty * tex.w + tx);
        texel[o] = (tex.data[i] << 16) | (tex.data[i + 1] << 8) | tex.data[i + 2];
      }
    }
  }
  return { x0, y0, w, h, depth, shade, band, texel };
}

/** The world point at raster (x, y) and depth z (the inverse of project). */
function unproject(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) {
  const nx = ((x * 2) / N - 1) / FOCAL, ny = (1 - (y * 2) / N) / FOCAL;
  return /** @type {V3} */ ([0, 1, 2].map((i) => EYE[i] + z * (FWD[i] + nx * RIGHT[i] + ny * UP[i])));
}

/** A mask of the raster, within a box. @typedef {{ x0: number, y0: number, w: number, h: number, on: Uint8Array }} Mask */

/** The pixels of a layer where test holds, as a mask. */
export function maskOf(/** @type {Layer} */ L, /** @type {(o: number, x: number, y: number) => boolean} */ test) {
  const on = new Uint8Array(L.w * L.h);
  let any = 0;
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const o = y * L.w + x;
    if (L.depth[o] !== Infinity && test(o, x + L.x0, y + L.y0)) (on[o] = 1), any++;
  }
  return { mask: { x0: L.x0, y0: L.y0, w: L.w, h: L.h, on }, count: any };
}

/** A mask shrunk by r pixels (what a shape's marks keep off its outline), or grown (a thin mark made bold). */
export function erode(/** @type {Mask} */ m, /** @type {number} */ r) { return morph(m, r, false); }
export function dilate(/** @type {Mask} */ m, /** @type {number} */ r) { return morph(m, r, true); }
function morph(/** @type {Mask} */ m, /** @type {number} */ r, /** @type {boolean} */ grow) {
  const out = new Uint8Array(m.on.length);
  const at = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.on[y * m.w + x] === 1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!grow && !m.on[y * m.w + x]) continue;
    let hit = !grow;
    for (let dy = -r; dy <= r && hit === !grow; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r && at(x + dx, y + dy) === grow) { hit = grow; break; }
    out[y * m.w + x] = hit ? 1 : 0;
  }
  return { ...m, on: out };
}

/**
 * The outlines of a mask, as closed polygons in raster pixels (pixel
 * corners): each boundary between a pixel in and one out, walked with the
 * inside on the left, so an outer ring and a hole turn opposite ways (SVG's
 * nonzero fill keeps the holes).
 */
export function trace(/** @type {Mask} */ m) {
  const W = m.w + 1;
  const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.on[y * m.w + x] === 1;
  /** @type {Map<number, number[]>} from a corner to the corners its edges go to */
  const next = new Map();
  const edge = (/** @type {number} */ ax, /** @type {number} */ ay, /** @type {number} */ bx, /** @type {number} */ by) => {
    const k = ay * W + ax;
    const l = next.get(k);
    l ? l.push(by * W + bx) : next.set(k, [by * W + bx]);
  };
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!inside(x, y)) continue;
    // y grows downward: inside on the left of each edge, going round clockwise on screen
    if (!inside(x, y - 1)) edge(x, y, x + 1, y);
    if (!inside(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) edge(x, y + 1, x, y);
  }
  /** @type {number[][][]} */
  const rings = [];
  for (const [start] of next) {
    if (!next.get(start)?.length) continue;
    /** @type {number[][]} */
    const ring = [];
    let at = start, prev = -1;
    for (let guard = 0; guard < 1e7; guard++) {
      const outs = next.get(at);
      if (!outs || !outs.length) break;
      // at a corner two edges leave (pixels touching diagonally), keep turning the same way: right
      let pick = 0;
      if (outs.length > 1 && prev >= 0) {
        const [px, py] = [prev % W, Math.floor(prev / W)], [ax, ay] = [at % W, Math.floor(at / W)];
        const dir = [ax - px, ay - py];
        pick = outs.findIndex((o) => { const d = [(o % W) - ax, Math.floor(o / W) - ay]; return dir[0] * d[1] - dir[1] * d[0] > 0; });
        if (pick < 0) pick = 0;
      }
      const to = outs.splice(pick, 1)[0];
      ring.push([at % W + m.x0, Math.floor(at / W) + m.y0]);
      prev = at;
      at = to;
      if (at === start) break;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** A ring with its staircase smoothed and its points thinned (Douglas–Peucker, tol pixels). */
export function simplify(/** @type {number[][]} */ ring, /** @type {number} */ tol) {
  // the corners' midpoints first: a staircase becomes a slope
  const mid = ring.map((p, i) => { const q = ring[(i + 1) % ring.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  const dp = (/** @type {number[][]} */ pts) => {
    if (pts.length < 3) return pts;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let far = 0, at = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const d = L ? Math.abs(dx * (a[1] - p[1]) - dy * (a[0] - p[0])) / L : Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (d > far) (far = d), (at = i);
    }
    return far > tol ? [...dp(pts.slice(0, at + 1)).slice(0, -1), ...dp(pts.slice(at))] : [a, b];
  };
  // split the ring at its two farthest-apart points, so both halves are open polylines
  let j = 0, best = 0;
  for (let i = 1; i < mid.length; i++) { const d = Math.hypot(mid[i][0] - mid[0][0], mid[i][1] - mid[0][1]); if (d > best) (best = d), (j = i); }
  const out = [...dp(mid.slice(0, j + 1)).slice(0, -1), ...dp([...mid.slice(j), mid[0]]).slice(0, -1)];
  return out;
}

/** The area of a ring (pixels², signed: positive clockwise on screen). */
export const areaOf = (/** @type {number[][]} */ r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;

/** Rings (raster pixels) as SVG path data in units, relative moves, whole numbers. */
export function pathOf(/** @type {number[][][]} */ rings, /** @type {[number, number]} */ shift = [0, 0]) {
  let d = "";
  for (const r of rings) {
    const pts = r.map(([x, y]) => [Math.round(x / SS + shift[0]), Math.round(y / SS + shift[1])]);
    const kept = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    if (kept.length < 3) continue;
    d += `M${kept[0][0]} ${kept[0][1]}l`;
    let s = "";
    for (let i = 1; i < kept.length; i++) {
      const dx = kept[i][0] - kept[i - 1][0], dy = kept[i][1] - kept[i - 1][1];
      s += (dx < 0 || !s ? "" : " ") + dx + (dy < 0 ? "" : " ") + dy;
    }
    d += s + "z";
  }
  return d;
}
