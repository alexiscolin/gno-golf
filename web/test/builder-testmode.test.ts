// Test mode's set-up (lib/builder/testmode.ts): the hole's id (the weather
// hangs on it), a period for each weather to beat, the row the engine finds
// it by, and the chain the engine plays it on (the local one's answers over
// the network's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import { clock, finished, holeId, holeRow, nowSaid, parSaid, plan, summary, testChain, TRY_HOLE, tryPlan, type Finished } from "../lib/builder/testmode.ts";
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
  assert.equal(await c.genesis(), "builder", "a hole judged on it (its verdict kept by chain) asks no node: Play plays offline");
  assert.equal(c.realm, base.realm);
});

void test("a try (no address yet): calm weather only, under an id of its own (nothing proved)", () => {
  const d = lane("garden", []);
  host.load(TRY_HOLE, hexOf(d));
  const p = tryPlan(host, TRY_HOLE);
  assert.deepEqual(p.map((x) => x.kind), [""]);
  assert.equal((JSON.parse(host.forecast(TRY_HOLE, p[0].period)) as { kind: string }).kind, "");
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

void test("finished: a round that does not count says why, play it again first; one that counts has no card", () => {
  const acts = (f: Finished) => f.actions.map((a) => `${a.text}${a.key ? ` (${a.key})` : ""}${a.primary ? "*" : ""}`);
  const w = finished({ strokes: 3, kind: "wind", why: "It took too much work." })!;
  assert.equal(w.title, "Holed in 3");
  assert.equal(w.line, "That wind round doesn't count: It took too much work.");
  assert.deepEqual(acts(w), ["Try again (R)*", "Back to Build (Esc)"]);
  assert.equal(finished({ strokes: 3, kind: "wind" }), null, "the next weather starts on its own; the last, the summary");
});

void test("nowSaid: the title card as the next weather starts on its own", () => {
  assert.equal(nowSaid("wind"), "Now: Wind");
  assert.equal(nowSaid(""), "Now: Clear");
});

void test("summary: Play's one card at the end, each weather proved with its strokes and time, Publish the way on", () => {
  const s = summary([{ kind: "", strokes: 2, ms: 4_130 }, { kind: "wind", strokes: 3, ms: 65_000 }, { kind: "rain", strokes: 4 }], 3);
  assert.equal(s.title, "Holed in every weather");
  assert.equal(s.line, "Par 3, from your rounds.");
  assert.deepEqual(s.rows, [
    { weather: "Clear", strokes: "2", time: "0:04.1" },
    { weather: "Wind", strokes: "3", time: "1:05.0" },
    { weather: "Rain", strokes: "4", time: "–" }, // (proved before this visit: its time not known)
  ]);
  const acts = s.actions.map((a) => `${a.text}${a.key ? ` (${a.key})` : ""}${a.primary ? "*" : ""}`);
  assert.deepEqual(acts, ["Try again (R)", "Back to Build (Esc)", "Publish →*"]);
  assert.equal(summary([{ kind: "", strokes: 2 }], 0).line, "", "no par yet: nothing said");
});

void test("the address, asked in a line of the HUD once a try is holed: Adena first, an address pasted behind a tap, where to get Adena", () => {
  const src = fs.readFileSync(new URL("../components/builder/TestMode.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(">Use my Adena address<") && src.includes("or paste an address") && src.includes("ADENA_URL"));
  assert.match(src, /function AddressLine/);
});
