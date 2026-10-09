// Quick shots (lib/builder/quickshot.ts, the game-design review's "Show the
// ball in Edit"): a shot pulled back on the board in Edit, played in calm
// weather by builder.wasm's round and from, its path in the board's own
// units, and played again on the hole as it changes. Never a proof: nothing
// of it reaches the draft.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane } from "./builder-fixture.ts";
import { calmPeriod, pulled, QUICK_ID, quickShots, type QuickShot } from "../lib/builder/quickshot.ts";
import { canonicalHex } from "../lib/builder/proof.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { shotOf } from "../lib/chain.ts";
import type { Draft, V } from "../lib/builder/draft.ts";

const near = (a: readonly number[], b: readonly number[], eps = 1e-9) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

void test("a quick shot from the tee: the realm's round in calm weather, its path from the tee, in the draft's units", () => {
  const d = STARTERS.garden.straight, shot: QuickShot = { from: null, stroke: 0, shot: shotOf(0, 4) };
  const [p] = quickShots(host, d, [shot])!;
  assert.ok(p && p.path.length > 2);
  assert.ok(near(p.path[0], d.tee, 1e-6), `starts at the tee: ${p.path[0].join()} for ${d.tee.join()}`);
  // the same shot, played by hand on the same bytes and period: the same rest
  host.load(QUICK_ID, canonicalHex(d, host)!);
  const r = JSON.parse(host.round(QUICK_ID, shot.shot, calmPeriod(host, QUICK_ID))) as { rest: V; holed: boolean };
  assert.deepEqual([p.rest, p.holed], [r.rest, r.holed]);
  assert.ok(p.rest[0] > d.tee[0], "pushed along +x, it goes right");
});

void test("a quick shot from where the last stopped: the realm's from, the stroke after it", () => {
  const d = STARTERS.garden.straight, [first] = quickShots(host, d, [{ from: null, stroke: 0, shot: shotOf(0, 3) }])!;
  const [second] = quickShots(host, d, [{ from: first!.rest, stroke: 1, shot: shotOf(0, 2) }])!;
  assert.ok(second && near(second.path[0], first!.rest, 1e-3), "the second starts where the first stopped (a path to a thousandth)");
  assert.ok(second.rest[0] > first!.rest[0]);
});

void test("a draft a drag has moved off its frame: the path still in the board's units (the shift framing makes is undone)", () => {
  const d = lane("garden", []), moved: Draft = { ...d, tee: [d.tee[0] - 1, d.tee[1]], pieces: d.pieces.map((p) => (p.geometry.t === "rail" ? { ...p, geometry: { ...p.geometry, a: [p.geometry.a[0] - 1, p.geometry.a[1]], b: [p.geometry.b[0] - 1, p.geometry.b[1]] } } : p)) };
  const [p] = quickShots(host, moved, [{ from: null, stroke: 0, shot: shotOf(0, 3) }])!;
  assert.ok(p && near(p.path[0], moved.tee, 1e-6), `${p?.path[0].join()} for ${moved.tee.join()}`);
});

void test("never a proof: a quick shot is a path and where it stopped, and the draft keeps its proofs as they were", () => {
  const d = STARTERS.garden.dogleg, before = JSON.stringify(d);
  const [p] = quickShots(host, d, [{ from: null, stroke: 0, shot: shotOf(80, 6) }])!;
  assert.deepEqual(Object.keys(p!).sort(), ["holed", "path", "rest"]);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(quickShots(host, d, []), []);
});

void test("a pull on the board, as the game's slingshot: the ball flies away from it; no pull, no shot", () => {
  const [a, power] = pulled([500, 400], [400, 400], 1440, 900)!.split(",").map(Number);
  assert.equal(a, 0, "pulled left, it goes right");
  assert.ok(power > 0 && power <= 10);
  assert.equal(Number(pulled([500, 400], [500, 300], 1440, 900)!.split(",")[0]), 90, "pulled up the screen, it goes down the board (y down)");
  assert.equal(pulled([500, 400], [500, 400], 1440, 900), null);
});

void test("a test's round as quick shots (the trail it leaves on the board): each from where the last stopped, the last in the cup", async () => {
  const { roundOf } = await import("../lib/builder/quickshot.ts");
  const fs = await import("node:fs");
  const kept = JSON.parse(fs.readFileSync(new URL("./builder-starters.json", import.meta.url), "utf8")) as Record<string, Record<string, { shots: string[] }>>;
  const d = STARTERS.garden.dogleg, shots = kept["garden-dogleg"][""].shots, round = roundOf(host, d, shots);
  assert.equal(round.length, shots.length);
  assert.deepEqual(round.map((q) => q.stroke), shots.map((_, k) => k));
  assert.equal(round[0].from, null, "the first from the tee");
  const played = quickShots(host, d, round)!;
  assert.ok(played.slice(1).every((p, k) => p && near(p.path[0], played[k]!.rest, 1e-3)), "each from where the one before stopped");
  assert.equal(played.at(-1)?.holed, true, "in calm weather, as tested, it holes");
});
