// What the client works out from a hole's geometry — for drawing, never for
// play. The chain decides where the ball goes; this only decides what the
// ground under it looks like.
//
// Two things come out of it:
//   - the shape of the green: the part of the board a ball can actually reach,
//     flood-filled from the tee. Whatever the walls fence off is not green, it
//     is rough ground, and it gets drawn as such — so a hole built from walls
//     looks like the shape its author drew, not like a rectangle.
//   - a height field: a Slope zone pushes the ball one way, so it is drawn as
//     a ramp rising the other way. Height is cosmetic; the physics is flat.

export const CELL = 0.5;

// Must match the Field.Radius every hole deploys with: the gnome is drawn this
// big because the chain keeps its centre this far from any wall.
export const BALL_R = 0.5;

// The cup is drawn at the radius the chain holes a ball in.
export const CUP_R = 1.2;

/**
 * Whether (x, y) is in a zone, as the chain tests it: its rectangle; a Round
 * zone is the ellipse in it; a zone with `poly` is that polygon (within the
 * rectangle), and with `outside` everything in the rectangle but the polygon.
 */
/** A slope that is air, not ground (wind, a gust, anything timed): it pushes
 *  the ball but raises no ramp. */
export const airy = (z) => z.kind === "slope" && (z.skin === "wind" || z.skin === "gust" || !!z.every);

/** Even-odd point in polygon ([[x, y], ...]). */
export function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inZone(q, x, y) {
  if (x < q.min[0] || x >= q.max[0] || y < q.min[1] || y >= q.max[1]) return false;
  if (q.poly && q.poly.length > 2) return inPoly(x, y, q.poly) !== !!q.outside;
  if (q.round) {
    const ex = (x - (q.min[0] + q.max[0]) / 2) / ((q.max[0] - q.min[0]) / 2), ey = (y - (q.min[1] + q.max[1]) / 2) / ((q.max[1] - q.min[1]) / 2);
    return ex * ex + ey * ey <= 1;
  }
  return true;
}

const MAX_RISE = 1.6;
const BANK = 2.5; // how far a ramp's top edge takes to fall back to the green
const SHOULDER = 1.2; // its sides taper over this much, so it reads as a hill

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

/** A ramp per Slope zone: 0 on its downhill edge, rising against the push. */
function ramps(zones) {
  return zones
    .filter((z) => z.kind === "slope" && !airy(z) && (z.vec[0] || z.vec[1]))
    .map((z) => {
      const l = Math.hypot(z.vec[0], z.vec[1]);
      const ux = -z.vec[0] / l, uz = -z.vec[1] / l; // uphill
      const proj = [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]].map((p) => p[0] * ux + p[1] * uz);
      const lo = Math.min(...proj), hi = Math.max(...proj);
      // as high as the slope is strong over its length: what looks steep is steep
      const len = hi - lo;
      // a kicker is a ski jump, not a bump: steep and tall, cut off at its lip
      const rise = z.skin === "kicker" || z.skin === "ramp" ? 2.2 : Math.min(MAX_RISE, 0.35 * l * len * 1.6);
      // across the slope, for the shoulders
      const vx = -uz, vz = ux;
      const across = [z.min, [z.max[0], z.min[1]], z.max, [z.min[0], z.max[1]]].map((p) => p[0] * vx + p[1] * vz);
      return { z, ux, uz, vx, vz, lo, span: hi - lo || 1, rise, noLip: z.skin === "kicker" || z.skin === "ramp", a0: Math.min(...across), a1: Math.max(...across) };
    });
}

/**
 * A ramp whose top edge faces the tee is a hill the player starts on: the
 * ground stays up at the top (a plateau) instead of banking back down, so a
 * "downhill" hole begins high. Only when no other ramp lies between the tee
 * and this one — a row of hills keeps its valleys.
 */
function plateaus(rs, tee) {
  for (const r of rs) {
    const along = tee[0] * r.ux + tee[1] * r.uz - r.lo;
    const between = rs.some((o) => {
      if (o === r) return false;
      const a = (o.z.min[0] + o.z.max[0]) / 2 * r.ux + (o.z.min[1] + o.z.max[1]) / 2 * r.uz - r.lo;
      return a > r.span && a < along;
    });
    r.plateau = along > r.span && !between;
  }
  // two ramps whose tops face each other, a short flat between them, are one
  // hill: the ground stays up across the gap (easing from one top's height to
  // the other's) instead of dropping to the green and rising again like two
  // boxes. The physics there is flat, and so is a hilltop.
  for (const r of rs)
    for (const q of rs) {
      if (q === r || r.bridge || q.bridge || r.ux * q.ux + r.uz * q.uz > -0.99) continue;
      if (Math.min(r.a1, -q.a0) - Math.max(r.a0, -q.a1) < 1) continue; // side by side, not facing
      const gap = -(q.lo + q.span) - (r.lo + r.span);
      if (gap > 0 && gap <= 10) (r.bridge = { gap, to: q.rise }), (q.noLip = true);
    }
  return rs;
}

export function terrain(s) {
  const W = s.board.w, H = s.board.h;
  const nx = Math.round(W / CELL), nz = Math.round(H / CELL);
  const idx = (i, j) => j * nx + i;
  const centre = (i, j) => [(i + 0.5) * CELL, (j + 0.5) * CELL];

  // cells a wall runs through
  const blocked = new Uint8Array(nx * nz);
  for (const w of s.walls) {
    if (w.every) continue; // a wall that comes and goes fences nothing off
    const x0 = Math.max(0, Math.floor(Math.min(w.a[0], w.b[0]) / CELL) - 1);
    const x1 = Math.min(nx - 1, Math.ceil(Math.max(w.a[0], w.b[0]) / CELL) + 1);
    const z0 = Math.max(0, Math.floor(Math.min(w.a[1], w.b[1]) / CELL) - 1);
    const z1 = Math.min(nz - 1, Math.ceil(Math.max(w.a[1], w.b[1]) / CELL) + 1);
    for (let j = z0; j <= z1; j++)
      for (let i = x0; i <= x1; i++) {
        const [px, pz] = centre(i, j);
        if (segDist(px, pz, w.a, w.b) < CELL * 0.52) blocked[idx(i, j)] = 1;
      }
  }

  // flood from everywhere a ball can be put: the tee, and wherever a tunnel or
  // a hazard sends it
  const reach = new Uint8Array(nx * nz);
  const stack = [];
  const seed = (p) => {
    const i = Math.floor(p[0] / CELL), j = Math.floor(p[1] / CELL);
    if (i >= 0 && j >= 0 && i < nx && j < nz && !blocked[idx(i, j)] && !reach[idx(i, j)]) {
      reach[idx(i, j)] = 1;
      stack.push([i, j]);
    }
  };
  seed(s.start);
  seed(s.cup);
  for (const z of s.zones) if (z.kind === "tunnel" || z.kind === "hazard") seed(z.vec);
  while (stack.length) {
    const [i, j] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const k = idx(a, b);
      if (blocked[k] || reach[k]) continue;
      reach[k] = 1;
      stack.push([a, b]);
    }
  }

  // green: what the ball reaches, plus the wall cells along its edge (a wall
  // stands on the green, not on a gap next to it)
  const green = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = idx(i, j);
      if (reach[k]) green[k] = 1;
      else if (blocked[k])
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a >= 0 && b >= 0 && a < nx && b < nz && reach[idx(a, b)]) green[k] = 1;
        }
    }

  // rough: connected pieces of everything else, for the scenery to fill
  const rough = [];
  const seen = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = idx(i, j);
      if (green[k] || seen[k]) continue;
      const cells = [];
      const st = [[i, j]];
      seen[k] = 1;
      while (st.length) {
        const [a, b] = st.pop();
        cells.push([a, b]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = a + di, d = b + dj;
          if (c < 0 || d < 0 || c >= nx || d >= nz) continue;
          const kk = idx(c, d);
          if (green[kk] || seen[kk]) continue;
          seen[kk] = 1;
          st.push([c, d]);
        }
      }
      rough.push(cells);
    }

  const rs = plateaus(ramps(s.zones), s.start);
  const W2 = W, H2 = H;
  const raw = (x, z) => {
    let h = 0;
    for (const r of rs) {
      const along = x * r.ux + z * r.uz - r.lo, side = x * r.vx + z * r.vz;
      if (along < 0 || side < r.a0 || side > r.a1) continue;
      let k;
      if (along <= r.span) k = r.z.skin === "kicker" || r.z.skin === "ramp" ? (along / r.span) ** 2 : smooth(along / r.span); // a jump curls up to its lip
      else if (r.bridge && along - r.span < r.bridge.gap) k = 1 + (r.bridge.to / r.rise - 1) * smooth((along - r.span) / r.bridge.gap);
      else if (r.plateau) k = 1;
      else if (r.noLip) continue; // the top of the hill the tee stands on
      else if (along - r.span < BANK * 0.4 && x > 0 && z > 0 && x < W2 && z < H2) k = 1 - smooth((along - r.span) / (BANK * 0.4)); // a short lip, not a slope the physics lacks
      else continue;
      // shoulders: a ramp inside the green tapers at its sides; one that runs
      // wall to wall does not (its sides are the walls)
      const edge = Math.min(side - r.a0, r.a1 - side);
      const walled = r.a0 <= 0.01 || r.a1 >= Math.max(W2, H2) - 0.01;
      if (!walled && edge < SHOULDER) k *= smooth(edge / SHOULDER);
      h += k * r.rise;
    }
    return h;
  };
  // the cup sits on a flat landing, never on the slope itself
  const cupH = raw(s.cup[0], s.cup[1]);
  // a cup inside a slope zone sits on the slope: flattening it would show a
  // landing the ball does not have
  const onSlope = s.zones.some((q) => q.kind === "slope" && !airy(q) && s.cup[0] >= q.min[0] && s.cup[0] < q.max[0] && s.cup[1] >= q.min[1] && s.cup[1] < q.max[1]);
  const height = (x, z) => {
    // on a slope the landing is just the cup itself: the rings lie flat, the
    // slope comes back right after
    if (onSlope) {
      const d = Math.hypot(x - s.cup[0], z - s.cup[1]);
      return d <= CUP_R + 0.15 ? cupH : d < CUP_R + 0.9 ? cupH + (raw(x, z) - cupH) * smooth((d - CUP_R - 0.15) / 0.75) : raw(x, z);
    }
    const d = Math.hypot(x - s.cup[0], z - s.cup[1]);
    if (d <= CUP_R + 0.3) return cupH;
    if (d < CUP_R + 1.6) {
      const k = smooth((d - CUP_R - 0.3) / 1.3);
      return cupH * (1 - k) + raw(x, z) * k;
    }
    return raw(x, z);
  };

  const zoneAt = (x, z) => s.zones.find((q) => inZone(q, x, z)) || null;

  /** Whether the ball can be at (x, z): the board cell there is green. */
  const onGreen = (x, z) => {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < nx && j < nz && !!green[idx(i, j)];
  };
  return { nx, nz, idx, green, rough, height, zoneAt, centre, onGreen };
}

// The self-check: an L made of walls leaves its corner as rough, and a ramp
// rises against its slope.
export function demo() {
  const s = {
    board: { w: 8, h: 8 }, start: [1, 1], cup: [1, 7],
    walls: [
      { a: [0, 0], b: [8, 0] }, { a: [8, 0], b: [8, 8] }, { a: [8, 8], b: [0, 8] }, { a: [0, 8], b: [0, 0] },
      { a: [3, 3], b: [8, 3] }, { a: [3, 3], b: [3, 8] }, // fences off the corner x>3, z>3
    ],
    zones: [{ kind: "slope", min: [0, 0], max: [3, 3], vec: [-0.4, 0] }],
  };
  const t = terrain(s);
  const at = (x, z) => t.green[t.idx(Math.floor(x / CELL), Math.floor(z / CELL))];
  console.assert(at(1, 1) === 1, "tee is green");
  console.assert(at(6, 6) === 0, "fenced corner is rough");
  console.assert(t.rough.some((c) => c.length > 50), "the corner is one rough piece");
  console.assert(t.height(2.9, 1) > t.height(0.1, 1), "ramp rises against the push");
  const hill = terrain({
    board: { w: 20, h: 3 }, walls: [], posts: [], start: [0.5, 1.5], cup: [19.5, 1.5],
    zones: [
      { kind: "slope", min: [2, 0], max: [8, 3], vec: [-0.3, 0] },
      { kind: "slope", min: [11, 0], max: [17, 3], vec: [0.3, 0] },
    ],
  });
  console.assert(hill.height(9.5, 1.5) > hill.height(7.9, 1.5) * 0.9, "facing ramps make one hill, not two");
  console.assert(t.height(6, 1) === 0, "flat past the bank");
  console.assert(t.height(3.3, 1) > 0 && t.height(3.3, 1) < t.height(2.9, 1), "the lip falls back to the green");
  console.assert(t.height(1, 7) === t.height(1.5, 7), "flat around the cup");
  return "ok";
}
