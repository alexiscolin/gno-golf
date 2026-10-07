// Test mode's set-up (lib/builder/testmode.ts): the hole's id (the weather
// hangs on it), a period for each weather to beat, the row the engine finds
// it by, and the chain the engine plays it on (the local one's answers over
// the network's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import { clock, finished, holeId, holeRow, parSaid, plan, QUICK_HOLE, quickPlan, testChain } from "../lib/builder/testmode.ts";
import fs from "node:fs";
import { makeLocalChain } from "../lib/builder/localchain.ts";
import { makeChain } from "../lib/chain.ts";
import { RULES } from "../lib/chain.ts";

const A = "g1" + "a".repeat(38);

void test("holeId: the alias's next version, the first for a new one", () => {
  assert.equal(holeId(A, "mole-run", null), `${A}/mole-run/v1`);
  assert.equal(holeId(A, "mole-run", { version: 1, slot: "", versions: [] }), `${A}/mole-run/v1`);
  const v = (n: number) => ({ id: `${A}/mole-run/v${n}`, v: n, height: 1, by: A, sha: "", note: "", next: "" });
  assert.equal(holeId(A, "mole-run", { version: 1, slot: `${A}/mole-run`, versions: [v(1), v(2)] }), `${A}/mole-run/v3`);
});

void test("plan: a period for each weather to beat, the latest of its kind (wind: the strongest), all at or before now", () => {
  const d = lane("garden", []), id = `${A}/mole-run/v1`, now = 5967997;
  host.load(id, hexOf(d));
  const p = plan(host, id, "garden", now);
  assert.deepEqual(p.map((x) => x.kind), ["", "wind", "rain"]);
  for (const { kind, period } of p) {
    assert.ok(period >= 0 && period <= now, `${kind} ${period}`);
    assert.equal((JSON.parse(host.forecast(id, period)) as { kind: string }).kind, kind);
  }
});

void test("holeRow and testChain: the engine finds the draft's hole and plays it on the local chain; the rest is the network's", async () => {
  const d = { ...lane("garden", []), title: "Mole Run" }, id = `${A}/mole-run/v1`, hex = hexOf(d);
  const row = holeRow(id, d);
  assert.deepEqual([row.id, row.name, row.official, row.world, row.slot, row.next], [id, "Mole Run", true, "garden", `${A}/mole-run`, ""]);
  const p = 5967997, local = makeLocalChain(host, row, hex, p), base = makeChain();
  const c = testChain(base, local, hex);
  assert.equal(await c.period(), p);
  assert.equal(Math.floor(c.now() / RULES.periodMs), p);
  assert.equal(await c.holeData(id), hex, "the page's own previews play the same bytes");
  assert.equal(await c.chainId(), "builder", "no takedown list is another chain's");
  assert.equal(c.realm, base.realm);
});

void test("a quick test: calm weather only, under an id of its own (no address asked, nothing proved)", () => {
  const d = lane("garden", []);
  host.load(QUICK_HOLE, hexOf(d));
  const p = quickPlan(host, QUICK_HOLE);
  assert.deepEqual(p.map((x) => x.kind), [""]);
  assert.equal((JSON.parse(host.forecast(QUICK_HOLE, p[0].period)) as { kind: string }).kind, "");
});

void test("clock: a weather's time in play, minutes, seconds and tenths", () => {
  assert.equal(clock(0), "0:00.0");
  assert.equal(clock(14_230), "0:14.2");
  assert.equal(clock(65_000), "1:05.0");
});

void test("parSaid: the score card's par, the rounds' once proved, else the meter's guess, else none", () => {
  assert.equal(parSaid(3, 4), "par 3");
  assert.equal(parSaid(0, 4), "par 4?");
  assert.equal(parSaid(0, 0), "");
});

void test("finished: a test's hole-finished card, its words and its actions (the way on last, the one primary)", () => {
  const acts = (f: ReturnType<typeof finished>) => f.actions.map((a) => `${a.text}${a.key ? ` (${a.key})` : ""}${a.primary ? "*" : ""}${a.off ? "!" : ""}`);
  // a quick test: never a proof, Prove it the way on (off with why while the hole cannot be proved)
  const q = finished({ quick: true, strokes: 7, kind: "" });
  assert.deepEqual([q.title, q.sub], ["Holed in 7", ""]);
  assert.doesNotMatch(q.line, /not a proof/, "said once, on the label");
  assert.deepEqual(acts(q), ["Try again (R)", "Back to edit (Esc)", "Prove it*"]);
  assert.equal(finished({ quick: true, strokes: 7, kind: "", proveOff: "Fix the errors first" }).actions[2].off, "Fix the errors first");
  assert.deepEqual(acts(finished({ quick: true, strokes: 2, kind: "", checking: true, why: "x" })), ["Try again (R)", "Back to edit (Esc)", "Prove it*"], "a quick test is never replayed");
  // Prove: the chain replaying the round, nothing to press yet
  const c = finished({ quick: false, strokes: 3, kind: "wind", checking: true, next: "rain" });
  assert.deepEqual([c.title, c.sub, c.line, c.actions.length], ["Holed in 3", "", "The chain's code replays your round…", 0]);
  // a round that does not count: why, and play it again first
  const w = finished({ quick: false, strokes: 3, kind: "wind", why: "It took too much work.", next: "wind" });
  assert.equal(w.line, "That wind round doesn't count: It took too much work.");
  assert.deepEqual(acts(w), ["Try again (R)*", "Back to edit (Esc)"]);
  // proved, a weather left: the next one
  const n = finished({ quick: false, strokes: 3, kind: "wind", next: "rain" });
  assert.deepEqual([`${n.title} · ${n.sub}`, n.line], ["Holed in 3 · Wind proved", "Next: rain."]);
  assert.deepEqual(acts(n), ["Try again (R)", "Back to edit (Esc)", "Next weather*"]);
  assert.equal(finished({ quick: false, strokes: 2, kind: "", next: "wind" }).sub, "Clear proved");
  // proved, none left: publish, with the par the rounds set
  const p = finished({ quick: false, strokes: 4, kind: "rain", next: null, par: 3 });
  assert.deepEqual([p.sub, p.line], ["Rain proved", "Every weather proved: par 3."]);
  assert.deepEqual(acts(p), ["Try again (R)", "Back to edit (Esc)", "Publish →*"]);
  assert.equal(finished({ quick: false, strokes: 4, kind: "rain", next: null }).line, "Every weather proved.");
  for (const f of [q, w, n, p]) assert.equal(f.actions.filter((a) => a.primary).length, 1, "one primary");
});

void test("the address step, Prove's alone: its words, Adena first, an address pasted behind a tap, where to get Adena", () => {
  const src = fs.readFileSync(new URL("../components/builder/TestMode.tsx", import.meta.url), "utf8");
  assert.match(src, /<h2>Sign your hole<\/h2>/);
  assert.ok(src.includes("Your address is part of its name and sets its weather, so your proofs still count when you publish. Nothing is signed now."));
  assert.ok(src.includes(">Use my Adena address<") && src.includes("Or paste an address (g1…)") && src.includes("ADENA_URL"));
  assert.match(src, /if \(!author && !quick\)/, "a quick test never asks");
});
