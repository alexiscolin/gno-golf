// lib/scene/gnome.ts ACTS: the menu's panels each play their own act on the
// one stage (makePreview), Solo and Duel as before, the Builder's gnome
// hammering, the shop's showing himself off: never the same motion twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./scene-harness.ts";
import { ACTS, GNOMES, makeBall, STAGES, type Act } from "../lib/scene/gnome.ts";

/** An act's poses over its first 4 s, every 100 ms: body turn and place, rounded. */
function poses(act: Act) {
  const g = makeBall(GNOMES[0]), out: string[] = [];
  for (let t = 0; t < 4000; t += 100) {
    const hop = ACTS[act](g, t), { rotation: r, position: p } = g.userData.body;
    out.push([r.x, r.y, r.z, p.x, p.y, p.z, hop].map((v) => v.toFixed(2)).join(","));
  }
  return out;
}

/** The act's poses every 16 ms (a frame) over 8 s: the largest turn and move from one frame to the next (a whole turn
 *  of the angle wrapping is the same pose), and the gap between its first pose and the one a period later. */
function pace(act: Act, period: number) {
  const g = makeBall(GNOMES[0]), b = g.userData.body;
  const pose = (t: number) => (ACTS[act](g, t), [b.rotation.x, b.rotation.y, b.rotation.z, b.position.x, b.position.y, b.position.z]);
  const wrap = (d: number) => Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  let turn = 0, move = 0, prev = pose(0);
  for (let t = 16; t < 8000; t += 16) {
    const p = pose(t);
    turn = Math.max(turn, ...[0, 1, 2].map((i) => wrap(p[i] - prev[i])));
    move = Math.max(move, ...[3, 4, 5].map((i) => Math.abs(p[i] - prev[i])));
    prev = p;
  }
  const a = pose(0), z = pose(period);
  return { turn, move, seam: Math.max(...a.map((v, i) => (i < 3 ? wrap(v - z[i]) : Math.abs(v - z[i])))) };
}

void test("every panel's act loops seamlessly, and the Builder's and the shop's turn no faster than 2.5 times the picker's hop", () => {
  const hop = pace("hop", 0);
  for (const [act, period] of [["solo", 3600], ["build", 3200], ["shop", 4000]] as const) {
    const p = pace(act, period);
    assert.ok(p.seam < 1e-6, `${act}: its loop jumps by ${p.seam}`);
    if (act === "solo") continue; // (Solo's roll, the reference the others are held to, rolls fast by design)
    assert.ok(p.turn <= hop.turn * 2.5, `${act}: turns ${p.turn.toFixed(3)} a frame, the hop ${hop.turn.toFixed(3)}`);
    assert.ok(p.move < 0.05, `${act}: moves ${p.move.toFixed(3)} a frame`);
  }
});

void test("every panel's stage stands its gnome on the same baseline: a duel's pair, a step back, is looked at higher", () => {
  for (const s of Object.values(STAGES)) assert.ok(s.z >= 4 && s.lift >= 0);
  assert.ok(STAGES.duel.z > STAGES.solo.z && STAGES.duel.lift > 0);
});

void test("each panel's act moves its own way: the Builder's hammers, the shop's turns to show off", () => {
  const all = (["hop", "solo", "build", "shop"] as const).map((a) => [a, poses(a).join("|")] as const);
  for (const [a, p] of all) for (const [b, q] of all) if (a < b) assert.notEqual(p, q, `${a} and ${b} move alike`);
  // the Builder's: forward strikes (a tip about x) in its first beats; the shop's: a whole turn about y
  const g = makeBall(GNOMES[0]);
  ACTS.build(g, 400);
  assert.ok(g.userData.body.rotation.x > 0.2, "a lean forward at a beat's middle");
  ACTS.shop(g, 1000);
  assert.ok(g.userData.body.rotation.y > 0.7, "one side shown");
  ACTS.shop(g, 3000);
  assert.ok(g.userData.body.rotation.y < -0.7, "then the other");
});
