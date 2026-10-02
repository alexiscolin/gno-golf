// The render-vs-physics audit (a ?camlog test hook, media/rides/audit.mjs):
// over a grid of board points, what the chain has there (a hazard's skin, the
// lane, the rough) against what the scene draws: every surface a ray
// straight down meets, top first (its height and what it belongs to), and the
// ball's height there as the replay draws it. The triangles of every drawn,
// opaque-or-not mesh of the course are bucketed by board cell once, so the
// grid's rays are cheap.
import * as THREE from "three";
import { inZone } from "../terrain";
import { md, ud } from "../scene/data";
import type { Live } from "./types";
import type { Zone } from "../types";
import type { TubePath } from "../scene/data";

/** What a surface belongs to: the course's child it is under, its kind, its material. */
interface Owner {
  top: number;
  kind: string;
  mat: string;
  color: string;
  side: number;
  see: number; // 1 opaque, 0 transparent or additive
  live: number;
  em: string; // its emissive, if any (a laid surface's)
  by: string; // the name of the nearest named piece it is part of (the rides' are "rides")
}

export function surfaceAudit(E: Live, step = 0.5) {
  const { g } = E;
  if (!g.course || !g.s) return null;
  const course = g.course, s = g.s, t = course.userData.terrain;
  course.updateMatrixWorld(true);
  const W = s.board.w, H = s.board.h, CELL = 1, nx = Math.ceil((W + 8) / CELL), nz = Math.ceil((H + 8) / CELL), X0 = -4, Z0 = -4;
  const buckets: number[][] = Array.from({ length: nx * nz }, () => []);
  const tri: number[] = []; // x0 y0 z0 x1 y1 z1 x2 y2 z2 owner rgb, 11 a triangle
  const owners: Owner[] = [], ownerKey = new Map<string, number>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4(), col = new THREE.Color();
  course.children.forEach((top, ti) => {
    top.traverseVisible((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const mats: THREE.Material[] = Array.isArray(o.material) ? (o.material as THREE.Material[]) : [o.material as THREE.Material];
      const mat = mats[0] as THREE.Material & { color?: THREE.Color; vertexColors?: boolean };
      if (!mat || md(mat).hull) return; // (an ink hull is the outline, not a surface)
      let live = 0, by = "";
      for (let p: THREE.Object3D | null = o; p && p !== course; p = p.parent) (live ||= ud(p).live ? 1 : 0), (by ||= p.name);
      const see = mat.transparent || mat.blending === THREE.AdditiveBlending ? 0 : 1;
      const em = (mat as THREE.Material & { emissive?: THREE.Color }).emissive, emh = em ? em.getHexString() : "";
      const key = [ti, ud(top).kind || top.name || top.type, mat.type, mat.color ? mat.color.getHexString() : "", mat.side, see, live, emh, by].join("|");
      let oi = ownerKey.get(key);
      if (oi === undefined) {
        oi = owners.length;
        ownerKey.set(key, oi);
        owners.push({ top: ti, kind: String(ud(top).kind || top.name || top.type), mat: mat.type, color: mat.color ? mat.color.getHexString() : "", side: mat.side, see, live, em: emh, by });
      }
      const geo = o.geometry as THREE.BufferGeometry, pos = geo.attributes.position, cols = mat.vertexColors ? geo.attributes.color : null, idx = geo.index;
      const n = idx ? idx.count : pos.count, inst = o instanceof THREE.InstancedMesh ? o.count : 1;
      for (let k = 0; k < inst; k++) {
        m4.copy(o.matrixWorld);
        if (o instanceof THREE.InstancedMesh) (o.getMatrixAt(k, im), m4.multiply(im));
        for (let i = 0; i + 2 < n; i += 3) {
          const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(m4);
          b.fromBufferAttribute(pos, i1).applyMatrix4(m4);
          c.fromBufferAttribute(pos, i2).applyMatrix4(m4);
          // (seen from above: its front up, a back face's down, or both)
          const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
          if (Math.abs(ny) < 1e-9 || (mat.side === THREE.FrontSide && ny < 0) || (mat.side === THREE.BackSide && ny > 0)) continue;
          if (cols) col.fromBufferAttribute(cols, i0).multiply(mat.color || col.set(0xffffff));
          const rgb = cols ? col.getHex() : mat.color ? mat.color.getHex() : 0;
          const id = tri.length / 11;
          tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, oi, rgb);
          const x0 = Math.floor((Math.min(a.x, b.x, c.x) - X0) / CELL), x1 = Math.floor((Math.max(a.x, b.x, c.x) - X0) / CELL);
          const z0 = Math.floor((Math.min(a.z, b.z, c.z) - Z0) / CELL), z1 = Math.floor((Math.max(a.z, b.z, c.z) - Z0) / CELL);
          for (let xi = Math.max(0, x0); xi <= Math.min(nx - 1, x1); xi++) for (let zi = Math.max(0, z0); zi <= Math.min(nz - 1, z1); zi++) buckets[zi * nx + xi].push(id);
        }
      }
    });
  });
  // the chain's pieces there: the hole's hazards and the stroke's (not the weather's)
  // (a surface, a tunnel's mouth, a puddle, are lane: only a hazard is not)
  const zones = [...s.zones, ...E.zones().filter((z) => !s.zones.includes(z))].filter((z) => z.kind === "hazard");
  const zoneAt = (x: number, z: number) => zones.find((q) => inZone(q, x, z)) || null;
  const rows: (string | number)[][] = [];
  for (let x = step / 2; x < W; x += step)
    for (let z = step / 2; z < H; z += step) {
      const q = zoneAt(x, z), cell = buckets[Math.floor((z - Z0) / CELL) * nx + Math.floor((x - X0) / CELL)] || [];
      const hits: [number, number, number][] = [];
      for (const id of cell) {
        const o = id * 11, ax = tri[o], az = tri[o + 2], bx = tri[o + 3], bz = tri[o + 5], cx = tri[o + 6], cz = tri[o + 8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        hits.push([+(l1 * tri[o + 1] + l2 * tri[o + 4] + l3 * tri[o + 7]).toFixed(3), tri[o + 9], tri[o + 10]]);
      }
      hits.sort((p, r) => r[0] - p[0]);
      rows.push([+x.toFixed(2), +z.toFixed(2), q ? `${q.kind}:${q.skin}${q.every ? "~" : ""}` : t.onGreen(x, z) ? "lane" : "rough", +E.ground(x, z).toFixed(3), ...hits.slice(0, 16).flat()]);
    }
  return { board: [W, H], step, owners, rows };
}

const firstMat = (o: THREE.Object3D): THREE.Material => { const m = (o as THREE.Mesh).material; return Array.isArray(m) ? m[0] : m; };

/** What a ray straight down at (x, z) meets in the course, top first: each hit's height, mesh and its ancestors' kinds (the audit's close look). */
export function whatAt(E: Live, x: number, z: number) {
  const course = E.g.course;
  if (!course) return null;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0), 0, 200);
  return rc.intersectObject(course, true).filter((h) => h.object instanceof THREE.Mesh && !md(firstMat(h.object)).hull).slice(0, 8).map((h) => {
    const o = h.object as THREE.Mesh, path: string[] = [];
    for (let p: THREE.Object3D | null = o; p && p !== course; p = p.parent) path.push(`${p.type}${p.name ? ":" + p.name : ""}${ud(p).kind ? "[" + String(ud(p).kind) + "]" : ""}${ud(p).live ? "*" : ""}`);
    const m = firstMat(o) as THREE.Material & { color?: THREE.Color };
    const pos = o.geometry.attributes.position, f = h.face, v = new THREE.Vector3(), tri = f ? [f.a, f.b, f.c].map((i) => v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).toArray().map((n) => +n.toFixed(2))) : [];
    return { y: +h.point.y.toFixed(3), mat: m.type, color: m.color ? m.color.getHexString() : "", verts: pos.count, path: path.join(" < "), tri, fade: md(m).fade !== undefined, clear: m.transparent || m.blending === THREE.AdditiveBlending };
  });
}

/** The nearest named piece o is part of ("" if none: the rides' are "rides"). */
const byOf = (o: THREE.Object3D, top: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== top; p = p.parent) if (p.name) return p.name; return ""; };

/**
 * The glows of the course (additive, or see-through and unlit or emissive,
 * not writing depth) against its solids: each glow's sphere, the nearest
 * solid surface to its centre but its own lamp's (under its parent: the
 * course kept in pieces, ?camlog), whether it tests depth, its render order. A glow
 * whose sphere reaches into a solid is drawn on that solid's face: a pool of
 * light through the rock, the timber (the audit's GLOW class).
 */
/**
 * The lamps drawn lit: every visible unlit (basic) or glowing material of the
 * course in a world's lantern colour (the mines': MINES.lantern), as [owner, material type, colour]. Under
 * "Lights out" (the mines' cv.lamps(false)) none should be left.
 */
export function lamps(E: Live, lantern: number) {
  const course = E.g.course;
  if (!course) return null;
  const out: string[][] = [];
  course.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = firstMat(o) as THREE.Material & { color?: THREE.Color };
    if (!m || md(m).hull || !m.color || !(m.type === "MeshBasicMaterial" || m.blending === THREE.AdditiveBlending)) return;
    // (a lantern's own amber, its glass or a halo round it)
    if (m.color.getHex() === lantern) out.push([byOf(o, course) || "(world)", m.type, m.color.getHexString()]);
  });
  return out;
}

export function glows(E: Live) {
  const course = E.g.course;
  if (!course) return null;
  course.updateMatrixWorld(true);
  const solids: { m: THREE.Mesh; box: THREE.Box3 }[] = [], lit: THREE.Mesh[] = [], blind: string[] = [];
  course.traverseVisible((x) => {
    if (!(x instanceof THREE.Mesh)) return;
    const o = x as THREE.Mesh, m = firstMat(o) as THREE.Material & { emissive?: THREE.Color };
    if (!m || md(m).hull) return;
    if (!m.depthTest) blind.push(`${byOf(o, course)}|${m.type}`);
    const glow = m.blending === THREE.AdditiveBlending || (m.transparent && !m.depthWrite && (m.type === "MeshBasicMaterial" || (!!m.emissive && m.emissive.getHex() > 0)));
    if (o instanceof THREE.InstancedMesh) return;
    if (glow) lit.push(o);
    else if (!m.transparent) {
      const geo = o.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      solids.push({ m: o, box: geo.boundingBox!.clone().applyMatrix4(o.matrixWorld) });
    }
  });
  const c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3(), tr = new THREE.Triangle(), sph = new THREE.Sphere(), tb = new THREE.Box3();
  const out = lit.map((o) => {
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sph.copy(o.geometry.boundingSphere!).applyMatrix4(o.matrixWorld);
    c.copy(sph.center);
    const r = sph.radius, own = new Set<THREE.Object3D>();
    o.parent?.traverse((x) => void own.add(x)); // (its own lamp: the glass, its cage, its hook)
    let near = Infinity, hit = "";
    for (const s of solids) {
      if (own.has(s.m) || !s.box.intersectsSphere(sph)) continue;
      const pos = s.m.geometry.attributes.position, idx = s.m.geometry.index, n = idx ? idx.count : pos.count, mw = s.m.matrixWorld;
      for (let i = 0; i + 2 < n; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mw);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(mw);
        d.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(mw);
        tb.makeEmpty().expandByPoint(a).expandByPoint(b).expandByPoint(d);
        if (!tb.intersectsSphere(sph)) continue;
        const dist = tr.set(a, b, d).closestPointToPoint(c, q).distanceTo(c);
        if (dist < near) (near = dist), (hit = `${s.m.geometry.type} ${q.toArray().map((v) => v.toFixed(2)).join(",")}`);
      }
    }
    const m = firstMat(o);
    return { by: byOf(o, course), mat: m.type, p: c.toArray().map((v) => +v.toFixed(2)), r: +r.toFixed(2), near: near === Infinity ? null : +near.toFixed(2), hit, depthTest: m.depthTest, order: o.renderOrder };
  });
  return { glows: out, blind };
}

/** The course's movers as drawn now (the frames drawn so far, and each live piece, its innermost live group: by name, whether it shows, its origin and two of its axes' tips in the world). */
export function movers(E: Live) {
  const course = E.g.course;
  if (!course) return null;
  course.updateMatrixWorld(true);
  const out: (string | number)[][] = [], p = new THREE.Vector3();
  course.traverse((o) => {
    if (!ud(o).live) return;
    let inner = false; // (a live group holding live pieces, a stroke's: its pieces are the movers)
    o.traverse((q) => void (inner ||= q !== o && !!ud(q).live));
    if (inner) return;
    let seen = o.visible ? 1 : 0;
    for (let q = o.parent; q && q !== course; q = q.parent) if (!q.visible) seen = 0;
    const row: (string | number)[] = [byOf(o, course) || o.type, seen];
    for (const v of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) row.push(...p.set(v[0], v[1], v[2]).applyMatrix4(o.matrixWorld).toArray().map((n) => +n.toFixed(3)));
    out.push(row);
  });
  return { frame: E.info ? E.info().render.frame : -1, rows: out };
}

/**
 * The rails' and the cables' clearance: every few vertices of each rail or
 * cable drawn (the rides' iron 9aa3ad, a cable's 2b2733, anyone's), against
 * the ground there (the lane's or the rough's height, not over a hazard): a
 * point more than 0.1 under it runs through the ground, and so would what rides on it. Returns
 * [owner, x, z, y, ground] for each, and how many points were looked at.
 */
export function clearance(E: Live) {
  const course = E.g.course;
  if (!course) return null;
  course.updateMatrixWorld(true);
  const RAILS = new Set(["9aa3ad", "2b2733"]), out: (string | number)[][] = [], v = new THREE.Vector3();
  // (over a hazard the ground is not the lane's: a void, a shaft, lava, the rail may run down into it)
  const holes = [...E.g.s!.zones, ...E.zones()].filter((z) => z.kind === "hazard");
  let seen = 0;
  course.traverseVisible((x) => {
    if (!(x instanceof THREE.Mesh) || x instanceof THREE.InstancedMesh) return;
    const o = x as THREE.Mesh, m = firstMat(o) as THREE.Material & { color?: THREE.Color };
    if (!m || md(m).hull || !m.color || !RAILS.has(m.color.getHexString())) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 6) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      seen++;
      const gy = E.ground(v.x, v.z);
      if (gy - v.y > 0.1 && !holes.some((z) => inZone(z, v.x, v.z))) out.push([byOf(o, course) || "(world)", +v.x.toFixed(2), +v.z.toFixed(2), +v.y.toFixed(2), +gy.toFixed(2)]);
    }
  });
  return { seen, under: out };
}

/**
 * The rides' clearance, frame by frame: every tube ridden (data.ts Ride),
 * played through without the clock (its ease, its `at` placing the ball as
 * the replay does, the ball's visibility), and at each frame the ball is
 * seen, what is drawn over it that is not the ride's own (the terrain, the
 * lava, the water, a rock): under a liquid's surface the ball is seen drowned
 * (DROWNED), under the ground or a rock it is hidden (HIDDEN: a tunnel's
 * dark), under only a see-through layer it is seen through it (THROUGH).
 * Returns [skin, k, x, y, z, over, its colour, which] for each such frame,
 * and how many frames were looked at. (The ride's pieces are left as at rest: at(−1).)
 */
export function rideClearance(E: Live) {
  const course = E.g.course, tubes = course && (course.userData.tubes as Map<Zone, TubePath> | undefined);
  if (!course || !tubes) return null;
  course.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), ball = new THREE.Object3D(), out: (string | number)[][] = [];
  const own = (o: THREE.Object3D) => byOf(o, course) === "rides" || ud(o).live;
  const liquids = [...E.g.s!.zones, ...E.zones()].filter((q) => q.kind === "hazard" && /lava|water|sump|spring|pool|tide|lake|sea/.test(q.skin));
  let seen = 0;
  for (const [z, tube] of tubes) {
    const ride = tube.userData && tube.userData.ride;
    if (!ride) continue;
    for (let i = 0; i <= 60; i++) {
      const k = i / 60, u = Math.min(1, Math.max(0, ride.ease ? ride.ease(k) : k));
      ball.visible = true;
      tube.getPointAt(u, ball.position);
      ride.at?.(k, ball);
      if (!ball.visible) continue;
      seen++;
      rc.set(ball.position.clone().setY(ball.position.y + 40), down);
      rc.far = 40;
      const above = rc.intersectObject(course, true).filter((h) => h.point.y > ball.position.y + 0.05 && h.object.visible && !md(firstMat(h.object)).hull && !own(h.object));
      if (above.length) {
        // under the ground or a rock it is hidden (a tunnel's dark: HIDDEN); under only a liquid's surface it is
        // seen drowned (DROWNED); under only a see-through layer (steam, a glow) it is seen through it (THROUGH)
        const solid = above.find((h) => !firstMat(h.object).transparent), over = solid || above[0], m = firstMat(over.object) as THREE.Material & { color?: THREE.Color };
        const wet = liquids.some((q) => inZone(q, ball.position.x, ball.position.z));
        out.push([z.skin, +k.toFixed(2), ...ball.position.toArray().map((v) => +v.toFixed(2)), +over.point.y.toFixed(2), m.color ? m.color.getHexString() : m.type, solid && !wet ? "HIDDEN" : wet ? "DROWNED" : "THROUGH"]);
      }
    }
    ride.at?.(-1, ball);
  }
  return { seen, under: out };
}

/** The course's draws as they stand (each visible mesh, line or points one), by owner (the nearest named piece); and each of `who`'s: its material, colour, triangles, whether live or an outline, its parents. */
export function draws(E: Live, who = "rides") {
  const course = E.g.course;
  if (!course) return null;
  const by: Record<string, number> = {}, mine: (string | number)[][] = [];
  course.traverseVisible((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points)) return;
    const k = byOf(o, course) || "(world)", m = firstMat(o) as THREE.Material & { color?: THREE.Color };
    by[k] = (by[k] || 0) + 1;
    if (k === who) {
      const geo = (o as THREE.Mesh).geometry, n = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
      let path = "";
      for (let p: THREE.Object3D | null = o.parent, i = 0; p && p !== course && i < 3; p = p.parent, i++) path += (p.name || p.type[0]) + "<";
      mine.push([m.type, m.color ? m.color.getHexString() : "", Math.round(n * ((o as THREE.InstancedMesh).count || 1)), md(m).hull ? "hull" : ud(o).live || ud(o.parent!).live ? "live" : "", path]);
    }
  });
  return { by, mine };
}

/**
 * Render quality, piece by piece (the course kept in pieces, ?camlog): what a
 * player sees near the lane that reads as strange. Each finding is
 * [class, owner, x, z, y, detail]:
 *   TEXEL   a textured mesh within 3 of the lane drawn under 24 texels a unit
 *           (a smeared map), or its UVs stretched over 4:1 (a streaked one)
 *   CARD    a flat piece within 3 of the lane: one side under 0.01 thick, the
 *           others over 0.3 (a sticker; lying flat on the ground it is a decal:
 *           left out)
 *   FOLD    a continuous strip (its vertices shared) whose faces turn over 80°
 *           across an edge (a plank or deck folded)
 *   ORPHAN  a small piece (under 0.8) standing over nothing: over 0.25 above
 *           the highest surface under its foot
 *   SQUARE  a long thin piece (over 8:1) of a plain box's few vertices (a band,
 *           a deck, a stream cut square at its ends)
 */
export function renderQuality(E: Live) {
  const course = E.g.course, s = E.g.s;
  if (!course || !s) return null;
  course.updateMatrixWorld(true);
  const t = course.userData.terrain as { onGreen: (x: number, z: number) => boolean };
  const nearLane = (b: THREE.Box3) => {
    for (let x = b.min.x - 3; x <= b.max.x + 3; x += 1) for (let z = b.min.z - 3; z <= b.max.z + 3; z += 1) if (t.onGreen(x, z)) return true;
    return false;
  };
  const out: (string | number)[][] = [], box = new THREE.Box3(), size = new THREE.Vector3(), c = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  const ua = new THREE.Vector2(), ub = new THREE.Vector2(), uc = new THREE.Vector2();
  const solids: THREE.Mesh[] = [], grown = new THREE.Box3();
  course.traverseVisible((x) => {
    if (!(x instanceof THREE.Mesh) || x instanceof THREE.InstancedMesh) return;
    const o = x as THREE.Mesh, m = firstMat(o) as THREE.Material & { map?: THREE.Texture | null };
    if (!m || md(m).hull || m.side === THREE.BackSide || m.transparent || m.blending === THREE.AdditiveBlending) return; // (an outline is not a piece)
    solids.push(o);
  });
  const boxes = solids.map((o) => { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); return { o, b: o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld) }; });
  for (const o of solids) {
    const geo = o.geometry, pos = geo.attributes.position, m = firstMat(o) as THREE.Material & { map?: THREE.Texture | null }, by = byOf(o, course) || "(world)";
    if (!geo.boundingBox) geo.computeBoundingBox();
    box.copy(geo.boundingBox!).applyMatrix4(o.matrixWorld);
    box.getSize(size);
    box.getCenter(c);
    const near = nearLane(box), live = (() => { for (let p: THREE.Object3D | null = o; p && p !== course; p = p.parent) if (ud(p).live) return true; return false; })();
    const dims = [size.x, size.y, size.z].sort((p, q) => p - q);
    const at = (k: string, detail: string | number) => out.push([k, by, +c.x.toFixed(2), +c.z.toFixed(2), +c.y.toFixed(2), detail]);
    // CARD: one side paper-thin, the others not; not a decal lying on the ground
    if (near && dims[0] < 0.01 && dims[1] > 0.3 && size.y > 0.01) at("CARD", `${dims[1].toFixed(2)}x${dims[2].toFixed(2)}`);
    // SQUARE: long, thin and a plain box
    // (a plain box: few vertices, every normal along an axis of its own; a chamfered one has slanted normals)
    const nrm = geo.attributes.normal;
    let plain = !!nrm && pos.count <= 24;
    if (plain) for (let i = 0; i < nrm.count; i++) { const v = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))].sort((p, q) => q - p); if (v[0] < 0.99) { plain = false; break; } }
    if (near && plain && dims[2] > 8 * dims[1] && dims[2] > 1.5) at("SQUARE", `${dims[2].toFixed(1)} long, ${pos.count} verts`);
    // ORPHAN: small and standing over nothing (not a mover, not in the air on purpose: a lamp hangs from something drawn over it)
    if (!live && dims[2] < 0.8 && c.x > 0 && c.z > 0 && c.x < s.board.w && c.z < s.board.h) {
      const g = E.ground(c.x, c.z), gap = box.min.y - g;
      if (gap > 0.25 && gap < 6) {
        const rc = new THREE.Raycaster(new THREE.Vector3(c.x, box.min.y - 0.01, c.z), new THREE.Vector3(0, -1, 0), 0, gap + 0.5);
        const up = new THREE.Raycaster(new THREE.Vector3(c.x, box.max.y + 0.01, c.z), new THREE.Vector3(0, 1, 0), 0, 3);
        const under = rc.intersectObject(course, true).find((h) => h.object !== o && !md(firstMat(h.object)).hull);
        const over = up.intersectObject(course, true).find((h) => h.object !== o && !md(firstMat(h.object)).hull);
        // (held by a neighbour: any other piece touching its box, a rung by its rails, a cap on its post)
        const held = boxes.some((q) => q.o !== o && q.b.intersectsBox(grown.copy(box).expandByScalar(0.05)));
        if ((!under || under.distance > 0.25) && !over && !held) at("ORPHAN", +gap.toFixed(2));
      }
    }
    // TEXEL and FOLD walk the triangles
    const uv = geo.attributes.uv as THREE.BufferAttribute | undefined, idx = geo.index, tris = idx ? idx.count / 3 : pos.count / 3, mw = o.matrixWorld;
    if (near && m.map && m.map.image && uv) {
      const W = (m.map.image as { width?: number }).width || 0, H = (m.map.image as { height?: number }).height || 0, rep = m.map.repeat;
      let lo = Infinity, worst = 1;
      for (let i = 0; i < tris; i += Math.max(1, Math.floor(tris / 400))) {
        const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw), b.fromBufferAttribute(pos, i1).applyMatrix4(mw), d.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        ua.fromBufferAttribute(uv, i0), ub.fromBufferAttribute(uv, i1), uc.fromBufferAttribute(uv, i2);
        const w1 = a.distanceTo(b), w2 = a.distanceTo(d), t1 = ua.distanceTo(ub) * W * rep.x, t2 = ua.distanceTo(uc) * H * rep.y;
        if (w1 < 1e-3 || w2 < 1e-3 || t1 < 1e-3 || t2 < 1e-3) continue;
        lo = Math.min(lo, Math.min(t1 / w1, t2 / w2));
        const r = t1 / w1 / (t2 / w2);
        worst = Math.max(worst, r, 1 / r);
      }
      if (lo < 24) at("TEXEL", `${lo.toFixed(0)} texels/unit`);
      if (worst > 4) at("TEXEL", `stretch ${worst.toFixed(1)}:1`);
    }
    if (idx && tris < 20000) {
      const edges = new Map<string, number>(), normal = (f: number, out: THREE.Vector3) => {
        a.fromBufferAttribute(pos, idx.getX(f * 3)), b.fromBufferAttribute(pos, idx.getX(f * 3 + 1)), d.fromBufferAttribute(pos, idx.getX(f * 3 + 2));
        return out.subVectors(b, a).cross(d.clone().sub(a)).normalize();
      };
      let folds = 0;
      for (let f = 0; f < tris && folds < 3; f++) for (let e = 0; e < 3; e++) {
        const p = idx.getX(f * 3 + e), q = idx.getX(f * 3 + ((e + 1) % 3)), key = p < q ? `${p}_${q}` : `${q}_${p}`, g2 = edges.get(key);
        if (g2 === undefined) { edges.set(key, f); continue; }
        if (normal(f, n1).dot(normal(g2, n2)) < Math.cos((80 * Math.PI) / 180)) folds++;
      }
      // (a closed volume's shared edges fold by design: a fold counts only on an open strip, one with an edge used once)
      let open = false;
      if (folds) { const used = new Map<string, number>(); for (let f = 0; f < tris; f++) for (let e = 0; e < 3; e++) { const p = idx.getX(f * 3 + e), q = idx.getX(f * 3 + ((e + 1) % 3)), key = p < q ? `${p}_${q}` : `${q}_${p}`; used.set(key, (used.get(key) || 0) + 1); } for (const v of used.values()) if (v === 1) { open = true; break; } }
      // (a sheet: its open edges, its vertices welded by position (a seam's copies are one), over a tenth of its
      // edges; a closed low-poly tube, a box, a torus arc is not one)
      let sheet = false;
      if (folds >= 3 && open) {
        const weld = new Map<string, number>(), id = (i: number) => { a.fromBufferAttribute(pos, i); const k = `${a.x.toFixed(3)},${a.y.toFixed(3)},${a.z.toFixed(3)}`; let v = weld.get(k); if (v === undefined) weld.set(k, (v = weld.size)); return v; };
        const used = new Map<string, number>();
        for (let f = 0; f < tris; f++) for (let e = 0; e < 3; e++) { const p = id(idx.getX(f * 3 + e)), q = id(idx.getX(f * 3 + ((e + 1) % 3))); if (p === q) continue; const key = p < q ? `${p}_${q}` : `${q}_${p}`; used.set(key, (used.get(key) || 0) + 1); }
        let one = 0; for (const v of used.values()) if (v === 1) one++;
        sheet = one > used.size * 0.25; // (a ribbon: about 2 of every 5 edges open; a tube or a band open at its ends far fewer)
      }
      if (folds >= 3 && sheet && near) at("FOLD", `${folds}+ folds`);
    }
  }
  return out;
}

/** Every opaque, drawn triangle of the course bucketed by board cell (1 unit): [9 coordinates, the mesh's index, its facing]; and the meshes. */
function triangles(E: Live) {
  const course = E.g.course!, s = E.g.s!, X0 = -4, Z0 = -4, nx = Math.ceil(s.board.w + 8), nz = Math.ceil(s.board.h + 8);
  const buckets: number[][] = Array.from({ length: nx * nz }, () => []), tri: number[] = [], meshes: THREE.Mesh[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  course.updateMatrixWorld(true);
  course.traverseVisible((x) => {
    if (!(x instanceof THREE.Mesh)) return;
    const o = x as THREE.Mesh, m = firstMat(o);
    if (!m || md(m).hull || m.side === THREE.BackSide || m.transparent || m.blending === THREE.AdditiveBlending) return;
    const oi = meshes.push(o) - 1, geo = o.geometry, pos = geo.attributes.position, idx = geo.index, n = idx ? idx.count : pos.count;
    const inst = o instanceof THREE.InstancedMesh ? o.count : 1;
    for (let k = 0; k < inst; k++) {
      m4.copy(o.matrixWorld);
      if (o instanceof THREE.InstancedMesh) (o.getMatrixAt(k, im), m4.multiply(im));
      for (let i = 0; i + 2 < n; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m4);
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m4);
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m4);
        const id = tri.length / 11, ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z); // (its facing, up or down, by its winding)
        tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, oi, Math.sign(ny));
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) - X0), x1 = Math.floor(Math.max(a.x, b.x, c.x) - X0), z0 = Math.floor(Math.min(a.z, b.z, c.z) - Z0), z1 = Math.floor(Math.max(a.z, b.z, c.z) - Z0);
        for (let xi = Math.max(0, x0); xi <= Math.min(nx - 1, x1); xi++) for (let zi = Math.max(0, z0); zi <= Math.min(nz - 1, z1); zi++) buckets[zi * nx + xi].push(id);
      }
    }
  });
  // the heights (and meshes) a vertical line at (x, z) meets
  const at = (x: number, z: number) => {
    const out: [number, number, number][] = [], cell = buckets[Math.floor(z - Z0) * nx + Math.floor(x - X0)] || [];
    for (const id of cell) {
      const o = id * 11, ax = tri[o], az = tri[o + 2], bx = tri[o + 3], bz = tri[o + 5], cx = tri[o + 6], cz = tri[o + 8];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      out.push([l1 * tri[o + 1] + l2 * tri[o + 4] + l3 * tri[o + 7], tri[o + 9], tri[o + 10]]);
    }
    return out;
  };
  return { meshes, at };
}

/**
 * The movers against everything else as drawn now (MOVER_CLIP): each live
 * piece's vertices (its innermost live group, a sample of them) tested
 * against the other pieces, static or moving: a vertex is inside one when
 * the nearest surface over it and the nearest under it are that one mesh's,
 * both over `tol` away, the one over it facing up and the one under facing
 * down (a solid's top and bottom, not a well's lid and floor). Returns [mover's owner, the other's owner, x, z, y,
 * depth], one a mover and a half-unit cell.
 */
export function moverClip(E: Live, tol = 0.06, sweep = false) {
  const course = E.g.course;
  if (!course || !E.g.s) return null;
  const { meshes, at } = triangles(E), v = new THREE.Vector3(), out: (string | number)[][] = [], seen = new Set<string>();
  const moverOf = new Map<THREE.Object3D, THREE.Object3D>();
  course.traverse((o) => {
    if (!ud(o).live) return;
    let inner = false;
    o.traverse((q) => void (inner ||= q !== o && !!ud(q).live));
    if (!inner) o.traverse((q) => void moverOf.set(q, o));
  });
  const movers = new Set(moverOf.values());
  for (const mv of movers) {
    if (!mv.visible) continue;
    let shown = true;
    for (let p = mv.parent; p && p !== course; p = p.parent) if (!p.visible) shown = false;
    if (!shown) continue;
    const who = byOf(mv, course) || "(world)";
    // (a cart, its ore's colour in it: swept along its axis of travel, ±6 in half units, its load and all: CART_SWEEP)
    let cart = false;
    mv.traverse((q) => void (cart ||= q instanceof THREE.Mesh && (firstMat(q) as THREE.Material & { color?: THREE.Color }).color?.getHex() === 0x3b3048));
    const ax = new THREE.Vector3().setFromMatrixColumn(mv.matrixWorld, 0).setY(0).normalize(), shifts = sweep && cart ? Array.from({ length: 25 }, (_, k) => (k - 12) * 0.5) : [0];
    mv.traverseVisible((x) => {
      if (!(x instanceof THREE.Mesh) || x instanceof THREE.InstancedMesh) return;
      const o = x as THREE.Mesh, m = firstMat(o);
      if (!m || md(m).hull || m.transparent) return;
      const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 150));
      for (const sh of shifts) for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).addScaledVector(ax, sh);
        const hs = at(v.x, v.z).filter(([, oi]) => moverOf.get(meshes[oi]) !== mv);
        let up: [number, number, number] | null = null, dn: [number, number, number] | null = null;
        for (const h of hs) {
          if (h[0] > v.y && (!up || h[0] < up[0])) up = h;
          if (h[0] < v.y && (!dn || h[0] > dn[0])) dn = h;
        }
        // (inside a solid: its top over it facing up, its bottom under it facing down; in a hollow, a pit or a well, the other way round)
        if (!up || !dn || up[1] !== dn[1] || up[0] - v.y < tol || v.y - dn[0] < tol || !(up[2] > 0 && dn[2] < 0)) continue;
        const key = `${who}|${Math.floor(v.x * 2)},${Math.floor(v.z * 2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([sh ? `${who} (swept)` : who, byOf(meshes[up[1]], course) || "(world)", +v.x.toFixed(2), +v.z.toFixed(2), +v.y.toFixed(2), +Math.min(up[0] - v.y, v.y - dn[0]).toFixed(2)]);
      }
    });
  }
  return out;
}

/**
 * Tracks over a hazard with nothing under them (TRACK_OVER_HAZARD): every
 * rail-like piece (the rides' iron 9aa3ad, an iron or timber strip laid on
 * top of the ground, S2's painted rail) sampled every half unit over a
 * liquid or a drop (lava, water, a sump, a spring, a pool, a shaft, the
 * void), with no opaque support 0–0.8 under it (a trestle's cap, a deck)
 * within 1.4 around it. Returns [owner, x, z, y, the hazard's skin].
 */
export function trackOverHazard(E: Live) {
  const course = E.g.course, s = E.g.s;
  if (!course || !s) return null;
  const { meshes, at } = triangles(E), v = new THREE.Vector3(), out: (string | number)[][] = [], seen = new Set<string>();
  const HAZ = /lava|water|sump|spring|pool|shaft|void|crumble|lake|tide|sea/;
  const zones = [...s.zones, ...E.zones()].filter((z) => z.kind === "hazard" && HAZ.test(z.skin));
  const RAILS = new Set(["9aa3ad", "a4aab6", "6e7382"]);
  const railLike = (o: THREE.Mesh) => {
    const m = firstMat(o) as THREE.Material & { color?: THREE.Color; polygonOffset?: boolean };
    const col = m.color ? m.color.getHexString() : "";
    return RAILS.has(col) || (!!m.polygonOffset && (col === "3a3d48" || col === "74492a"));
  };
  const hazOf = (x: number, z: number) => zones.find((q) => inZone(q, x, z));
  course.traverseVisible((x) => {
    if (!(x instanceof THREE.Mesh) || x instanceof THREE.InstancedMesh) return;
    const o = x as THREE.Mesh;
    if (!railLike(o)) return;
    const pos = o.geometry.attributes.position, who = byOf(o, course) || "(world)";
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const key = `${who}|${Math.floor(v.x * 2)},${Math.floor(v.z * 2)}`;
      if (seen.has(key)) continue;
      const hz = hazOf(v.x, v.z);
      if (!hz) continue;
      seen.add(key);
      let held = false;
      for (let dx = -1.4; dx <= 1.4 && !held; dx += 0.7) for (let dz = -1.4; dz <= 1.4 && !held; dz += 0.7) {
        for (const [y, oi] of at(v.x + dx, v.z + dz)) {
          const mo = meshes[oi], name = byOf(mo, course);
          if (railLike(mo) || name === `mines:${hz.skin}`) continue;
          if (v.y - y >= 0.0 && v.y - y <= 0.8) { held = true; break; } // (a cap or a deck right under its foot, or down to 0.8)
        }
      }
      if (!held) out.push([who, +v.x.toFixed(2), +v.z.toFixed(2), +v.y.toFixed(2), hz.skin]);
    }
  });
  return out;
}
