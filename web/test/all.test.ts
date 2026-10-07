// Every module of the logic layer, loaded: one no test reaches counts in the
// coverage at 0% instead of being left out of it. (The 3D scene, the engine's
// three.js orchestration and the promo renderer are covered by npm run smoke
// and the media/ captures, not here.)
import { test } from "node:test";
import assert from "node:assert/strict";

test("the logic layer loads", async () => {
  for (const m of [
    "../lib/adena.ts", "../lib/card.ts", "../lib/chain.ts", "../lib/clip.ts", "../lib/chase.ts", "../lib/duel.ts", "../lib/feel.ts", "../lib/friends.ts",
    "../lib/hostile.ts", "../lib/network.ts", "../lib/own.ts", "../lib/prefs.ts", "../lib/takedown.ts", "../lib/terrain.ts",
    "../lib/builder/cards.ts", "../lib/builder/checks.ts", "../lib/builder/draft.ts", "../lib/builder/edit.ts", "../lib/builder/editor.ts", "../lib/builder/explain.ts", "../lib/builder/gg1.ts", "../lib/builder/handles.ts", "../lib/builder/holes.ts", "../lib/builder/importing.ts", "../lib/builder/lane.ts", "../lib/builder/localchain.ts", "../lib/builder/pipeline.ts", "../lib/builder/proof.ts", "../lib/builder/publish.ts", "../lib/builder/route.ts", "../lib/builder/rules.ts", "../lib/builder/session.ts", "../lib/builder/settings.ts", "../lib/builder/starters.ts", "../lib/builder/templates.ts", "../lib/builder/testmode.ts", "../lib/builder/types.ts", "../lib/builder/wasm.ts",
    "../lib/engine/aim.ts", "../lib/engine/camera.ts", "../lib/engine/pace.ts", "../lib/engine/probes.ts", "../lib/engine/replay.ts",
  ]) assert.ok(await import(m), m);
});
