// lib/scene/gnome.ts ACTS: the menu's panels each play their own act on the
// one stage (makePreview), Solo and Duel as before, the Builder's gnome
// hammering, the shop's showing himself off: never the same motion twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./scene-harness.ts";
import { ACTS, GNOMES, makeBall, type Act } from "../lib/scene/gnome.ts";

/** An act's poses over its first 4 s, every 100 ms: body turn and place, rounded. */
function poses(act: Act) {
  const g = makeBall(GNOMES[0]), out: string[] = [];
  for (let t = 0; t < 4000; t += 100) {
    const hop = ACTS[act](g, t), { rotation: r, position: p } = g.userData.body;
    out.push([r.x, r.y, r.z, p.x, p.y, p.z, hop].map((v) => v.toFixed(2)).join(","));
  }
  return out;
}

void test("each panel's act moves its own way: the Builder's hammers, the shop's turns to show off", () => {
  const all = (["hop", "solo", "build", "shop"] as const).map((a) => [a, poses(a).join("|")] as const);
  for (const [a, p] of all) for (const [b, q] of all) if (a < b) assert.notEqual(p, q, `${a} and ${b} move alike`);
  // the Builder's: forward strikes (a tip about x) in its first beats; the shop's: a whole turn about y
  const g = makeBall(GNOMES[0]);
  ACTS.build(g, 120);
  assert.ok(g.userData.body.rotation.x > 0.3, "a strike tips him forward");
  ACTS.shop(g, 800);
  assert.ok(g.userData.body.rotation.y > 2, "half way round");
  ACTS.shop(g, 3000);
  assert.equal(g.userData.body.rotation.y, 0, "back facing the player");
});
