// The board's view (Board.tsx): its top-left corner in board units (x, y)
// and its scale (k, pixels a unit). A wheel zooms about the pointer, a pinch
// about the fingers' midpoint, which it also follows: the board under the
// fingers stays under them. Points are in the board's own pixels.
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
