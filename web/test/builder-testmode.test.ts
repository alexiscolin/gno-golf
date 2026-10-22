// Test mode's set-up (lib/builder/testmode.ts): the hole's id (the weather
// hangs on it), a period for each weather to beat, the row the engine finds
// it by, and the chain the engine plays it on (the local one's answers over
// the network's).
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import { askSaid, cameFrom, clock, finished, freeSlug, heldSaid, holeId, holeRow, nextHoleId, nowSaid, parSaid, plan, publishTip, summary, testChain, toGo, TRY_HOLE, tryPlan, type Finished } from "../lib/builder/testmode.ts";
import { holdsIn, holdsToo } from "../lib/builder/carry.ts";
import { provedAt, replay, type Proof } from "../lib/builder/proof.ts";
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

void test("nowSaid: each round's title card, its place among the weathers to sink; one sunk already, again", () => {
  assert.equal(nowSaid("", { n: 1, of: 3 }), "Round 1 of 3: Clear");
  assert.equal(nowSaid("wind", { n: 2, of: 3 }), "Round 2 of 3: Wind");
  assert.equal(nowSaid("rain"), "Again: Rain");
});

void test("toGo: the weathers row's eyebrow, how many are left once one is sunk", () => {
  assert.equal(toGo(3, 0), "Sink it in each");
  assert.equal(toGo(3, 1), "Sink it in each · 2 to go");
  assert.equal(toGo(3, 3), "Sink it in each · all sunk ✓");
});

void test("publishTip, askSaid, heldSaid: the weathers named, never \"every weather\"", () => {
  assert.equal(publishTip("garden", ["", "wind", "rain"]), "Sink it once in each weather: Clear, Wind and Rain. Players meet them all.");
  assert.equal(publishTip("island", ["", "wind", "rain", "storm"]), "Sink it once in each weather: Clear, Wind, Rain and Storm. Players meet them all.");
  assert.equal(publishTip("garden", ["wind", "rain"]), "Still to sink: Wind and Rain.");
  assert.equal(askSaid("garden"), "Clear ✓ — next: Wind and Rain. The hole is saved under your gno.land address, and its weather comes from it, so we need it once to go on. Nothing is signed.");
  assert.equal(heldSaid("", ["rain"]), "Your Clear round holds in Rain too ✓");
  assert.equal(heldSaid("", ["wind", "rain"]), "Your Clear round holds in Wind and Rain too ✓");
  assert.equal(heldSaid(null, ["", "wind"]), "Your practice round holds in Clear and Wind ✓");
});

void test("provedAt, nextHoleId: proved under the alias's next version only; that id as the chain says, v1 unread", async () => {
  const mk = (id: string, kind: string, maxWork = 1): Proof => ({ key: "k", id, kind, period: 1, shots: [], commits: [], strokes: 2, maxWork });
  const v1 = `${A}/mole-run/v1`, v2 = `${A}/mole-run/v2`;
  const versions = { version: 1, slot: `${A}/mole-run`, versions: [{ id: v1, v: 1, height: 1, by: A, sha: "", note: "", next: "" }] };
  assert.deepEqual(await nextHoleId({ versions: () => Promise.resolve(versions) }, A, "mole-run"), { id: v2, read: true });
  assert.deepEqual(await nextHoleId({ versions: () => Promise.reject(new Error("down")) }, A, "mole-run"), { id: v1, read: false });
  // the one rule the stepper, Play and Publish go by: every weather under the alias's next version
  const all = (id: string) => ["", "wind", "rain"].map((k) => mk(id, k));
  assert.equal(provedAt(all(v1), "garden", "k", v1), v1);
  assert.equal(provedAt(all(v1), "garden", "k", v2), null, "v1 published since: its rounds prove nothing for v2");
  assert.equal(provedAt([...all(v1), mk(v2, "")], "garden", "k", v2), null);
});

void test("holdsToo: a proved round's shots replayed in the weathers left, each it holes in proved by that replay alone", async () => {
  const d = lane("garden", []), id = `${A}/mole-run/v1`, hex = hexOf(d), key = "k";
  host.load(id, hex);
  const p = plan(host, id, "garden", 5967997), calm = p.find((x) => x.kind === "")!;
  // a round that holes in calm weather: found by the chain's own simulation (a straight lane)
  const local = makeLocalChain(host, holeRow(id, d), hex, calm.period);
  let proof: Proof | null = null;
  for (let pw = 1; pw <= 10 && !proof; pw += 0.25) {
    const r = await replay(local, { key, id, kind: "", period: calm.period, shots: [`0.0000,${pw.toFixed(4)}`] });
    if (typeof r !== "string") proof = r;
  }
  assert.ok(proof, "a straight lane holed in one");
  const left = p.filter((x) => x.kind !== "");
  const more = await holdsToo(host, d, hex, proof, left);
  assert.ok(more.some((q) => q.kind === "rain"), "a calm putt down a straight lane holds in the rain too");
  for (const q of more) {
    assert.ok(left.some((x) => x.kind === q.kind && x.period === q.period), "each at plan's own period");
    assert.equal(q.id, id);
    assert.deepEqual(q.shots, proof.shots);
    const again = await replay(makeLocalChain(host, holeRow(id, d), hex, q.period), { key, id, kind: q.kind, period: q.period, shots: q.shots });
    assert.ok(typeof again !== "string", `${q.kind}: holds when replayed`);
  }
  assert.deepEqual(await holdsToo(host, d, hex, proof, [{ kind: "wind", period: -1 }]), [], "a weather with no period is never counted");
  // a practice round's shots (no weather of its own), under the author's id: each weather it holes in proved, calm too
  const practice = await holdsIn(host, d, hex, { key, id, shots: proof.shots }, p);
  assert.ok(practice.some((q) => q.kind === "") && practice.some((q) => q.kind === "rain"), "a practice putt counts in calm and in the rain");
  for (const q of practice) assert.equal(q.period, p.find((x) => x.kind === q.kind)!.period);
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
  assert.deepEqual(acts, ["Back to Build (Esc)", "Publish →*"], "no Try again: a weather's chip plays it again");
  assert.equal(summary([{ kind: "", strokes: 2 }], 0).line, "", "no par yet: nothing said");
});

void test("the address, asked once on the game's card: as Play opens (round 1 named, or just a try), else once the try is holed; Adena first, a paste behind a tap", () => {
  const src = fs.readFileSync(new URL("../components/builder/TestMode.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(">Use my Adena address<") && src.includes(">Paste an address<") && src.includes("ADENA_URL") && src.includes("askSaid(draft.world)"));
  assert.ok(src.includes(">Practice first<") && src.includes("Nothing is signed until you publish."), "the start card: a try kept, nothing signed");
  assert.match(src, /function AddressLine/);
});

void test("cameFrom: played under its alias's next version, a draft is a new version of the hole there only if it is of it (opened or published from it, or played under one of its versions); nothing there yet, any is", () => {
  const A = "g1me", proof = (id: string) => ({ key: "k", id, kind: "", period: 1, shots: [], commits: [], strokes: 2, maxWork: 1 });
  assert.equal(cameFrom({ proofs: [] }, `${A}/mole-run/v1`), true, "nothing published there");
  assert.equal(cameFrom({ proofs: [] }, `${A}/mole-run/v2`), false, "another hole holds it: not this draft's");
  assert.equal(cameFrom({ proofs: [proof(`${A}/mole-run/v2`)] }, `${A}/mole-run/v2`), false, "rounds under the next one prove nothing of where it came from");
  assert.equal(cameFrom({ from: `${A}/mole-run/v1`, proofs: [] }, `${A}/mole-run/v2`), true, "opened from v1 (or published as it)");
  assert.equal(cameFrom({ from: `${A}/mole-run`, proofs: [] }, `${A}/mole-run/v3`), true, "opened by its alias");
  assert.equal(cameFrom({ proofs: [proof(`${A}/mole-run/v1`)] }, `${A}/mole-run/v2`), true, "a draft kept before: played under v1");
  assert.equal(cameFrom({ from: `${A}/other/v1`, proofs: [proof(`${A}/other/v1`)] }, `${A}/mole-run/v2`), false, "of another hole");
});

test("freeSlug: the start card's offer free of the drafts and of the author's holes on the chain; unread, the drafts' next", async () => {
  const on = new Set(["a/mole-run", "a/mole-run-2", "a/mole-run-4"]);
  const versions = (alias: string) => Promise.resolve({ slot: alias, versions: on.has(alias) ? [{ v: 1, id: `${alias}/v1`, by: "a", sha: "", note: "", next: "", height: 1 }] : [] });
  assert.equal(await freeSlug({ versions }, "a", "mole-run", new Set(["mole-run-3"])), "mole-run-5");
  assert.equal(await freeSlug({ versions: () => Promise.reject(new Error("down")) }, "a", "mole-run", new Set()), "mole-run-2");
});
