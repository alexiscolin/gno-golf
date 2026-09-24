// What the hole being built collects as it goes: buildHole resets it, the
// props and zones fill it, buildHole hands it to the course (userData) and
// resets it again.
export const state = {
  live: [], // functions of time for the live parts, run each frame (userData.tick)
  tubes: new Map(), // tunnel zone -> the curve its tube follows (userData.tubes)
  mill: null, // the hole's mill: { shoot(), at(step), idle() }, driven by the replay (userData.mill)
  timed: [], // timed walls: { at(step), walls } each, driven by the engine's clock (userData.timed)
  water: null, // the hole's water mask { tex, data, nx, nz, cell, w, h }: splashes clip to it
};
export const animate = (fn) => state.live.push(fn);
