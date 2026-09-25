// What the hole being built collects as it goes: buildHole resets it, the
// props and zones fill it, buildHole hands it to the course (userData) and
// resets it again.
import type * as THREE from "three";
import type { Zone } from "../types";
import type { Mill, SlopeGlow, Tick, Timed, TubePath, WaterMask, Height } from "./data";

export const state = {
  live: [] as Tick[], // functions of time for the live parts, run each frame (userData.tick)
  tubes: new Map<Zone, TubePath>(), // tunnel zone -> the curve its tube follows (userData.tubes)
  mill: null as Mill | null, // the hole's mill: { shoot(), at(step), idle() }, driven by the replay (userData.mill)
  timed: [] as Timed[], // timed walls: { at(step), walls } each, driven by the engine's clock (userData.timed)
  slopes: new Map<Zone, SlopeGlow>(), // slope zone -> { glow(k) }: its contour lines, lit by the replay (userData.slopes)
  water: null as WaterMask | null, // the hole's water mask { tex, data, nx, nz, cell, w, h }: splashes clip to it
  smokes: [] as THREE.Object3D[], // chimneys' marks (props.js smoke): their puffs drawn as one batch (smokeBatch)
  lifts: [] as Height[], // (x, z) -> extra height of a moving deck under the ball (a seesaw), or 0 (userData.height)
  ghosts: null as ((aiming: boolean) => void) | null, // the timed pieces' dashed outlines, shown while aiming
};
export const animate = (fn: Tick) => state.live.push(fn);
