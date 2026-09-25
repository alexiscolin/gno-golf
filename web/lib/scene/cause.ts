// Why the ball does what it does, drawn as it rolls: a gust leaves white
// streaks bending with the wind, a wet green a spray of drops, ice a glint, a
// slope pale speed lines. All from the zones under the ball — the chain's own
// — so a ball that speeds up or drifts shows its reason instead of looking
// like a bug. One Points and one LineSegments for every particle: two draws.
import * as THREE from "three";
import { inZone, onAt } from "../terrain";
import type { Vec2, Zone } from "../types";

/** Why the ball moves as it does: the push that names it, and its direction when it has one. */
export type Cause = { kind: "wind" | "slope" | "tilt"; vec: Vec2 } | { kind: "ice" | "wet" };
/** A zone as causeAt reads it. */
type CauseZone = Pick<Zone, "kind" | "skin" | "vec" | "min" | "max" | "round" | "poly" | "outside" | "air" | "capped" | "every" | "on" | "phase">;

const N = 160; // particles alive at once, recycled
const LOOK: Record<Cause["kind"], { color: number; life: number; streak: boolean; label: string }> = {
  wind: { color: 0xffffff, life: 0.5, streak: true, label: "Gust" },
  wet: { color: 0x9fd4ec, life: 0.45, streak: false, label: "Slippery" },
  ice: { color: 0xeafaff, life: 0.35, streak: false, label: "Slippery" },
  slope: { color: 0xfff1b8, life: 0.4, streak: true, label: "Downhill" },
  tilt: { color: 0xfff1b8, life: 0.4, streak: true, label: "Tilting" }, // a timed slope: a seesaw, a tilting board
};

/** What pushes a ball at (x, y), moving (vx, vy), under these zones and this clock tick. */
export function causeAt(zones: Iterable<CauseZone>, x: number, y: number, vx: number, vy: number, tick = 0): Cause | null {
  let wind: Vec2 | null = null, slope: Vec2 | { tilt: true; vec: Vec2 } | null = null, wet = false, ice = false;
  for (const z of zones) {
    if (!inZone(z, x, y)) continue;
    const on = onAt(z, tick);
    if (z.kind === "slope" && on) {
      // wind: the chain's "air" flag when it sends one, else the skin (a capped
      // one only brakes the ball: nothing to name)
      if (typeof z.air === "boolean" ? z.air : z.skin === "wind" || z.skin === "gust") {
        if (!z.capped) wind = z.vec;
      }
      // downhill only: a slope the ball climbs slows it, which needs no reason
      else if (z.every) slope = slope || { tilt: true, vec: z.vec }; // a plank that tilts on a clock, whichever way
      else if (z.vec[0] * vx + z.vec[1] * vy > 0) slope = z.vec;
    }
    if (z.kind === "surface" && (z.skin === "rain" || z.skin === "puddle" || z.skin === "wetsand")) wet = true;
    if (z.kind === "surface" && z.skin === "ice") ice = true;
  }
  return wind ? { kind: "wind", vec: wind } : ice ? { kind: "ice" } : wet ? { kind: "wet" } : slope ? ("tilt" in slope ? { kind: "tilt", vec: slope.vec } : { kind: "slope", vec: slope }) : null;
}

export function makeCauses(scene: THREE.Scene) {
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const dots = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(pos, 3)).setAttribute("color", new THREE.BufferAttribute(col, 3)),
    new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, depthWrite: false })
  );
  const lpos = new Float32Array(N * 6), lcol = new Float32Array(N * 6);
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(lpos, 3)).setAttribute("color", new THREE.BufferAttribute(lcol, 3)),
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
  );
  dots.frustumCulled = lines.frustumCulled = false;
  scene.add(dots, lines);
  const parts = Array.from({ length: N }, () => ({ t: 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, dx: 0, dz: 0, c: new THREE.Color(), streak: false }));
  let next = 0, seen = new Set<string>(), last: number | null = null;
  const c = new THREE.Color();

  const api = {
    /** A new shot: every cause may be named again. */
    shot() {
      seen = new Set();
    },
    /**
     * The ball at p (world), moving (vx, vz) per second on the board, under
     * this cause. Spawns a few particles; returns the label to show the first
     * time a cause appears in the shot, else null.
     */
    at(p: THREE.Vector3, vx: number, vz: number, cause: Cause | null) {
      if (!cause) return null;
      const L = LOOK[cause.kind], sp = Math.hypot(vx, vz) || 1;
      for (let k = 0; k < 2; k++) {
        const q = parts[next];
        next = (next + 1) % N;
        q.t = 0;
        q.life = L.life * (0.7 + Math.random() * 0.6);
        q.streak = L.streak;
        q.c.setHex(L.color);
        // from just behind the ball, a little to either side
        const side = (Math.random() - 0.5) * 0.5;
        q.x = p.x - (vx / sp) * 0.45 - (vz / sp) * side;
        q.z = p.z - (vz / sp) * 0.45 + (vx / sp) * side;
        q.y = p.y - 0.25 + Math.random() * 0.3;
        if (cause.kind === "wind") {
          // blown along the wind, the streak drawn the way it blows
          const [wx, wy] = cause.vec, wl = Math.hypot(wx, wy) || 1;
          q.vx = (wx / wl) * 3.5;
          q.vz = (wy / wl) * 3.5;
          q.vy = 0.3;
          q.dx = (wx / wl) * 0.7;
          q.dz = (wy / wl) * 0.7;
        } else if (cause.kind === "slope" || cause.kind === "tilt") {
          // speed lines trailing the ball
          q.vx = -vx * 0.1;
          q.vz = -vz * 0.1;
          q.vy = 0;
          q.dx = (-vx / sp) * 0.8;
          q.dz = (-vz / sp) * 0.8;
        } else {
          // spray: drops kicked up and back; ice: a glint that stays
          const kick = cause.kind === "wet" ? 1 : 0;
          q.vx = (-vx / sp) * 1.2 * kick + (Math.random() - 0.5) * kick;
          q.vz = (-vz / sp) * 1.2 * kick + (Math.random() - 0.5) * kick;
          q.vy = 1.4 * kick;
          q.y = cause.kind === "ice" ? p.y - 0.42 : q.y;
        }
      }
      if (seen.has(L.label)) return null;
      seen.add(L.label);
      return L.label;
    },
    tick(t: number) {
      const dt = last === null ? 0 : Math.min(0.05, t - last);
      last = t;
      let any = false;
      for (let i = 0; i < N; i++) {
        const q = parts[i];
        if (q.t < 1) {
          q.t += dt / q.life;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.z += q.vz * dt;
          q.vy -= q.streak ? 0 : 5 * dt; // drops fall, streaks glide
          any = true;
        }
        const alive = q.t < 1, f = alive ? 1 - q.t : 0;
        // fading by darkening toward the ground's colour: no per-point alpha in one draw
        c.copy(q.c).multiplyScalar(f);
        const o = i * 3, l = i * 6;
        if (!alive) {
          pos[o + 1] = -99;
          lpos[l + 1] = lpos[l + 4] = -99;
          continue;
        }
        if (q.streak) {
          pos[o + 1] = -99;
          lpos[l] = q.x, lpos[l + 1] = q.y, lpos[l + 2] = q.z;
          lpos[l + 3] = q.x - q.dx, lpos[l + 4] = q.y, lpos[l + 5] = q.z - q.dz;
          lcol[l] = lcol[l + 3] = c.r, lcol[l + 1] = lcol[l + 4] = c.g, lcol[l + 2] = lcol[l + 5] = c.b;
        } else {
          lpos[l + 1] = lpos[l + 4] = -99;
          pos[o] = q.x, pos[o + 1] = q.y, pos[o + 2] = q.z;
          col[o] = c.r, col[o + 1] = c.g, col[o + 2] = c.b;
        }
      }
      dots.visible = lines.visible = any;
      if (!any) return;
      dots.geometry.attributes.position.needsUpdate = dots.geometry.attributes.color.needsUpdate = true;
      lines.geometry.attributes.position.needsUpdate = lines.geometry.attributes.color.needsUpdate = true;
    },
    dispose() {
      scene.remove(dots, lines);
      dots.geometry.dispose(), dots.material.dispose(), lines.geometry.dispose(), lines.material.dispose();
    },
  };
  return api;
}

export type Causes = ReturnType<typeof makeCauses>;
