// The Builder's start screen's cards (lib/builder/cards.ts): a starter's or
// a draft's map, drawn from the pieces gg1.ts writes, and a draft's stage
// from its proofs for the hole as it is now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftMap, draftState } from "../lib/builder/cards.ts";
import { startsIn } from "../lib/builder/templates.ts";
import type { Proof } from "../lib/builder/proof.ts";
import { required } from "../lib/builder/rules.ts";
import type { Draft } from "../lib/builder/draft.ts";

const proof = (kind: string, key = "k", id = "g1me/hole/v1"): Proof => ({ key, id, kind, period: 1, shots: [], commits: [], strokes: 2, maxWork: 0 });

void test("draftMap: a starter's rails, posts and zones, its tee and cup, in its world", () => {
  const [straight, , tidepool] = startsIn("island").map((s) => s.draft);
  const m = draftMap(straight);
  assert.equal(m.world, "island");
  assert.deepEqual([m.start, m.cup], [straight.tee, straight.pin]);
  assert.equal(m.walls.length, 4, "the lane's four rails");
  assert.ok(m.walls.every((w) => w.every === 0), "none moving");
  assert.deepEqual(m.posts.map((p) => p.skin), ["palm", "coral"]);
  assert.deepEqual(draftMap(tidepool).zones.map((z) => [z.kind, z.skin]), [["hazard", "tidepool"]]);
  assert.ok(m.cupR > 0, "its world's cup");
});

void test("draftMap: a bar round its four corners; a pulse's piece drawn as a moving one", () => {
  const d: Draft = {
    ...startsIn("garden")[0].draft,
    pulses: [{ every: 2, on: 1, phase: 0 }],
    pieces: [
      { id: "b", entry: "*/bar/", geometry: { t: "bar", a: [2, 2], b: [8, 2], thick: 1 }, params: {}, clock: { k: "fixed" } },
      { id: "g", entry: "*/rail/", geometry: { t: "rail", a: [2, 6], b: [8, 6] }, params: {}, clock: { k: "stroke", pulse: 0 } },
    ],
  };
  const m = draftMap(d);
  assert.equal(m.walls.length, 5);
  assert.ok(m.walls.slice(0, 4).every((w) => !w.every) && new Set(m.walls.slice(0, 4).map((w) => w.a.join())).size === 4, "the bar's four corners, still");
  assert.ok(m.walls[4].every, "the pulse's rail, moving");
});

void test("draftState: never tested, changed since, holed in some weathers, ready", () => {
  const all = required("garden");
  assert.ok(all.length > 1);
  assert.deepEqual(draftState({ world: "garden", proofs: [] }, "k"), { stage: "new", word: "Not tested yet" });
  assert.equal(draftState({ world: "garden", proofs: [proof("")] }, "other").stage, "changed", "proofs of the hole before an edit");
  assert.equal(draftState({ world: "garden", proofs: [proof("")] }, null).stage, "changed");
  assert.deepEqual(draftState({ world: "garden", proofs: [proof(all[0])] }, "k"), { stage: "testing", word: `Holed in 1 of ${all.length} weathers` });
  // the best of its ids: one id holed everywhere is ready, whatever another holds
  const ready = draftState({ world: "garden", proofs: [proof(all[0], "k", "g1me/hole/v2"), ...all.map((k) => proof(k))] }, "k");
  assert.deepEqual(ready, { stage: "ready", word: "Ready to publish" });
});
