#!/usr/bin/env -S node --experimental-strip-types
// Where a water on the lane (a sunk pond, rock pool, lagoon or canal: terrain
// POOLS; an inlet of the sea cut into the lane) meets a wall or a post: its
// outline sampled every 0.1 within a unit of one, each sample looked down on
// from above. Where water is drawn there, the drawn ground (course.ts
// groundMesh, as built) must close it: lane or bank above the water, or the
// wall's or post's own footprint. A run of samples with neither is a gap
// (the water shows through beside the kerb, down to what is under it);
// gaps over 0.05 fail. Every hole of data/holes.txt, read from the local chain.
//
//   nice -n 20 node --experimental-strip-types scripts/pondcheck.ts [slot…]

import fs from "node:fs";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        try { return await next(s, c); } catch (e) {
          if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$|\\.json$/.test(s)) return next(s + ".ts", c);
          throw e;
        }
      }`,
    ),
);

const { makeChain } = await import("../web/lib/chain.ts");
const { terrain, POOLS, inZone, segDist } = await import("../web/lib/terrain.ts");
const { groundMesh } = await import("../web/lib/scene/course.ts");
const { worldOf, loadWorld } = await import("../web/lib/scene/worlds.ts");
type Vec2 = readonly [number, number];

const slots = process.argv.slice(2).length ? process.argv.slice(2) : fs.readFileSync(new URL("../data/holes.txt", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const chain = makeChain({ rpc: process.env.RPC || "http://127.0.0.1:26757" });
const STEP = 0.1;
let bad = 0, waters = 0;
for (const slot of slots) {
  const s = await chain.state(slot);
  await loadWorld(s.world);
  const SEA = worldOf(s).SEA;
  const bodies = s.zones.filter((q) => (q.kind === "hazard" && POOLS[q.skin]) || (SEA !== undefined && q.skin === "sea" && q.poly && !q.outside));
  if (!bodies.length) continue;
  waters += bodies.length;
  const t = terrain(s);
  // the drawn ground's triangles (its faces and piles; not its ink lines),
  // bucketed by cell
  const tris: number[][] = [], cells = new Map<number, number[]>();
  groundMesh(s, t).traverse((o) => {
    const m = o as unknown as { isMesh?: boolean; geometry: { attributes: { position: { array: ArrayLike<number> } }; index: { array: ArrayLike<number> } | null } };
    if (!m.isMesh) return;
    const P = m.geometry.attributes.position.array, I = m.geometry.index ? m.geometry.index.array : null, n = I ? I.length : P.length / 3;
    for (let k = 0; k + 2 < n; k += 3) {
      const v = [0, 1, 2].flatMap((e) => { const i = I ? I[k + e] : k + e; return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; });
      const id = tris.push(v) - 1;
      for (let i = Math.floor(Math.min(v[0], v[3], v[6])); i <= Math.floor(Math.max(v[0], v[3], v[6])); i++)
        for (let j = Math.floor(Math.min(v[2], v[5], v[8])); j <= Math.floor(Math.max(v[2], v[5], v[8])); j++) {
          const key = i * 4096 + j;
          (cells.get(key) || cells.set(key, []).get(key)!).push(id);
        }
    }
  });
  // the drawn ground over (x, z), its highest face; -Infinity where none
  const top = (x: number, z: number) => {
    let best = -Infinity;
    for (const id of cells.get(Math.floor(x) * 4096 + Math.floor(z)) || []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris[id];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) best = Math.max(best, u * ay + v * by + (1 - u - v) * cy);
    }
    return best;
  };
  const walls = s.walls.filter((w) => !w.every);
  // under a wall's timber or kerb, or a post (a wall's end cap, or the chain's)
  const covered = (x: number, z: number) => walls.some((w) => segDist(x, z, w.a, w.b) < 0.25 || Math.hypot(x - w.a[0], z - w.a[1]) < 0.36 || Math.hypot(x - w.b[0], z - w.b[1]) < 0.36)
    || s.posts.some((p) => Math.hypot(x - p.c[0], z - p.c[1]) < p.r);
  const nearWall = (x: number, z: number) => walls.some((w) => segDist(x, z, w.a, w.b) < 1) || s.posts.some((p) => Math.hypot(x - p.c[0], z - p.c[1]) < p.r + 1);
  // (where another water goes on, or a crossing over it, the water is not closed there)
  const on = s.zones.filter((q) => bodies.includes(q) || q.skin === "bridge" || (q.kind === "slope" && (q.skin === "moon bridge" || q.skin === "seesaw")));
  const gaps: string[] = [];
  for (const q of bodies) {
    const pond = !!POOLS[q.skin];
    // its outline: the polygon, the ellipse, or the rectangle
    const cx = (q.min[0] + q.max[0]) / 2, cz = (q.min[1] + q.max[1]) / 2;
    const ring: Vec2[] = q.poly ? [...q.poly] : q.round ? Array.from({ length: 96 }, (_, k): Vec2 => [cx + Math.cos((k / 96) * 2 * Math.PI) * (q.max[0] - cx), cz + Math.sin((k / 96) * 2 * Math.PI) * (q.max[1] - cz)]) : [q.min, [q.max[0], q.min[1]], q.max, [q.min[0], q.max[1]]];
    // the water's level there, and whether it is drawn (a pond only on the lane; the sea everywhere)
    const level = (x: number, z: number) => (pond ? t.pond(x, z)?.level : SEA);
    let run = 0, worst = 0, at: Vec2 = [0, 0];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
      for (let i = 0; i < n; i++) {
        const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n;
        // a hair outside it (along the edge's normal, away from the water)
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
        if (inZone(q, x + nx * 0.05, z + nz * 0.05)) {
          nx = -nx;
          nz = -nz;
        }
        const ox = x + nx * 0.05, oz = z + nz * 0.05;
        const lv = level(x - nx * 0.05, z - nz * 0.05);
        const open = nearWall(ox, oz) && lv !== undefined && !on.some((o) => inZone(o, ox, oz)) && (!pond || t.onGreen(ox, oz)) && !covered(ox, oz) && top(ox, oz) < lv - 0.01;
        run = open ? run + STEP : 0;
        if (run > worst) {
          worst = run;
          at = [+ox.toFixed(2), +oz.toFixed(2)];
        }
      }
    }
    if (worst > 0.05) gaps.push(`${q.skin} open ${worst.toFixed(1)} beside the kerb at ${at.join(",")}`);
  }
  bad += gaps.length;
  console.log(gaps.length ? "GAP " : "ok  ", slot, bodies.map((q) => q.skin).join(","), gaps.join("; "));
}
console.log(`${slots.length} holes, ${waters} waters on the lane, ${bad} gaps`);
process.exit(bad ? 1 : 0);
