// Every module of the logic layer, loaded: one no test reaches counts in the
// coverage at 0% instead of being left out of it. (The 3D scene, the engine's
// three.js orchestration and the promo renderer are covered by npm run smoke
// and the media/ captures, not here.)
import { test } from "node:test";
import assert from "node:assert/strict";

test("the logic layer loads", async () => {
  for (const m of [
    "../lib/adena.ts", "../lib/card.ts", "../lib/chain.ts", "../lib/clip.ts", "../lib/chase.ts", "../lib/duel.ts", "../lib/feel.ts", "../lib/friends.ts",
    "../lib/network.ts", "../lib/prefs.ts", "../lib/terrain.ts",
    "../lib/engine/aim.ts", "../lib/engine/camera.ts", "../lib/engine/pace.ts", "../lib/engine/probes.ts", "../lib/engine/replay.ts",
  ]) assert.ok(await import(m), m);
});
