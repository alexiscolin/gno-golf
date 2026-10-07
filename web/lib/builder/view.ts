// The board's view (Board.tsx): its top-left corner in board units (x, y)
// and its scale (k, pixels a unit), in the plane the board is looked at in
// (its Look: turned a quarter at a time, tilted; flat, the board itself). A
// wheel zooms about the pointer, a pinch about the fingers' midpoint, which
// it also follows: the board under the fingers stays under them. Points are
// in the board's own pixels.
type P = readonly [number, number];
export interface View { x: number; y: number; k: number }

export const K_MIN = 3, K_MAX = 90;
const clamp = (k: number) => Math.max(K_MIN, Math.min(K_MAX, k));

/** The view at scale k (clamped), the board point under p where it was. */
export function zoomAt(v: View, p: P, k: number): View {
  const to = clamp(k);
  return { k: to, x: v.x + p[0] / v.k - p[0] / to, y: v.y + p[1] / v.k - p[1] / to };
}

/** The view as two fingers moved from `from` to `to`: zoomed by their spread, the board under their midpoint kept under it. */
export function pinch(v: View, from: readonly [P, P], to: readonly [P, P]): View {
  const mid = (f: readonly [P, P]): P => [(f[0][0] + f[1][0]) / 2, (f[0][1] + f[1][1]) / 2];
  const spread = (f: readonly [P, P]) => Math.hypot(f[0][0] - f[1][0], f[0][1] - f[1][1]);
  const before = spread(from);
  if (!(before > 0)) return v;
  const k = clamp((v.k * spread(to)) / before), m0 = mid(from), m1 = mid(to);
  return { k, x: v.x + m0[0] / v.k - m1[0] / k, y: v.y + m0[1] / v.k - m1[1] / k };
}

/**
 * The grid's lines in sight (from lo to hi, in board units): every unit from
 * origin, the tee (the hole's grid: framing shifts a whole hole, by a post's
 * rim at times, off the board's units), every fifth from it darker.
 */
export function gridLines(lo: P, hi: P, origin: P): { x?: number; y?: number; major: boolean }[] {
  const out: { x?: number; y?: number; major: boolean }[] = [];
  for (let k = Math.ceil(lo[0] - origin[0]); origin[0] + k <= hi[0]; k++) out.push({ x: origin[0] + k, major: k % 5 === 0 });
  for (let k = Math.ceil(lo[1] - origin[1]); origin[1] + k <= hi[1]; k++) out.push({ y: origin[1] + k, major: k % 5 === 0 });
  return out;
}

/** The view with a board point in its middle (Show me), at the scale it is seen at; size: the board in pixels. */
export const centreOn = (v: View, at: P, size: { w: number; h: number }): View => ({ k: v.k, x: at[0] - size.w / 2 / v.k, y: at[1] - size.h / 2 / v.k });

/**
 * How the board is looked at (the 3D board's camera, the overlay's matrix): a
 * number of quarter turns (clockwise on the screen) and a tilt from straight
 * down (radians), which squashes the ground's depth by its cosine, as an
 * orthographic camera does. The view (x, y, k) is then of the plane the board
 * is turned and squashed into; flat, that plane is the board itself.
 */
export interface Look { turns: number; tilt: number }
export const FLAT: Look = { turns: 0, tilt: 0 };
/** The 3D board's tilt, when tilted (V): enough to show heights and shadows, never to hide the tee or the cup. */
export const TILT = (16 * Math.PI) / 180;

const turn = (p: P, n: number): [number, number] => {
  let [x, y] = p;
  for (let k = 0; k < (((n % 4) + 4) % 4); k++) [x, y] = [-y, x];
  return [x + 0, y + 0];
};
/** A board point in the view's plane. */
export const toPlane = (p: P, look: Look): [number, number] => {
  const r = turn(p, look.turns);
  return [r[0], r[1] * Math.cos(look.tilt)];
};
/** The board point at a point of the view's plane. */
export const fromPlane = (u: P, look: Look): [number, number] => turn([u[0], u[1] / Math.cos(look.tilt)], -look.turns);
/** A board point in the board's pixels. */
export const toScreen = (v: View, look: Look, p: P): [number, number] => {
  const u = toPlane(p, look);
  return [(u[0] - v.x) * v.k, (u[1] - v.y) * v.k];
};
/** The board point under a pixel of the board (the pointer, projected onto the ground). */
export const toBoard = (v: View, look: Look, px: P): [number, number] => fromPlane([v.x + px[0] / v.k, v.y + px[1] / v.k], look);
/** The board's units to its pixels as an SVG matrix (a b c d e f): what the overlay draws in. */
export function matrixOf(v: View, look: Look): [number, number, number, number, number, number] {
  const o = toScreen(v, look, [0, 0]), ex = toScreen(v, look, [1, 0]), ey = toScreen(v, look, [0, 1]);
  return [ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]];
}
/** The view looked at another way, the board point in the middle of the board (w × h pixels) kept there. */
export function relook(v: View, from: Look, to: Look, size: { w: number; h: number }): View {
  const mid = toBoard(v, from, [size.w / 2, size.h / 2]), u = toPlane(mid, to);
  return { k: v.k, x: u[0] - size.w / 2 / v.k, y: u[1] - size.h / 2 / v.k };
}
