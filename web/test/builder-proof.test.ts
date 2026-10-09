// Test mode's ground (lib/builder/localchain.ts, proof.ts): the slice of the
// chain the engine plays a hole on, answered by builder.wasm at one clock;
// the weathers a proof must cover, its key, its replay by commits as a save
// is cut, and par.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, ID, PERIOD, hexOf, lane, rail } from "./builder-fixture.ts";
import { makeLocalChain } from "../lib/builder/localchain.ts";
import { parAllowed, periodFor, proofKey, provedAs, replay, replayed, suggestPar, unproven, type Proof } from "../lib/builder/proof.ts";
import { MIN_SHOT_WORK, required } from "../lib/builder/rules.ts";
import { RULES, shotOf } from "../lib/chain.ts";
import { PER_CALL } from "../lib/adena.ts";
import type { HoleRow, SimulateFrom, Vec2 } from "../lib/types.ts";

const d = lane("garden", []);
const row: HoleRow = { id: ID, name: "Fixture", official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" };
const chainAt = (p: number) => makeLocalChain(host, row, hexOf(d), p);

void test("Local clock: period, now, the state's period and the weather agree; the next period has not come", async () => {
  const c = chainAt(PERIOD);
  assert.equal(await c.period(), PERIOD);
  assert.equal(Math.floor(c.now() / RULES.periodMs), PERIOD);
  assert.equal((await c.state(ID)).period, PERIOD);
  assert.equal((await c.weather(ID, PERIOD)).period, PERIOD);
  assert.equal((await c.weather(ID, PERIOD - 3)).period, PERIOD - 3);
  await assert.rejects(c.weather(ID, PERIOD + 1), /that weather has not come yet/);
  assert.deepEqual((await c.holes()).map((h) => h.id), [ID], "the one row the engine looks the hole up by");
  await assert.rejects(c.state("garden/1/v1"), /unknown hole/, "no other hole");
});

void test("Local clock: the strokes and the extras answer as the chain's, parsed by its checks", async () => {
  const c = chainAt(PERIOD), one = shotOf(0, 1);
  const r = await c.simulateRound(ID, [one], PERIOD);
  assert.equal(r.strokes, 1);
  const f = await c.simulateFrom(ID, r.rest, one, 1, PERIOD);
  const two = await c.simulateCommit(ID, r.rest, 1, [one], PERIOD);
  assert.deepEqual(two.rest, f.rest, "a commit after the first plays from the ball as SimulateFrom does");
  assert.equal(two.strokes, 2);
  assert.deepEqual((await c.extras(ID, 0)).walls, []);
  await assert.rejects(c.simulateRound(ID, ["x"], PERIOD), /golf:/, "a refusal is the realm's sentence");
});

void test("required: each weather that moves the ball, in the world's climate (fog out)", () => {
  assert.deepEqual(required("garden"), ["", "wind", "rain"]);
  assert.deepEqual(required("island"), ["", "wind", "rain", "storm"]);
  assert.deepEqual(required("town"), ["", "rain", "wind"]);
  assert.deepEqual(required("mountain"), ["", "snow", "wind"]);
});

void test("proofKey: renaming the hole or changing its par keeps it; moving a piece or the world drops it", async () => {
  const k = await proofKey(d, host);
  assert.match(k!, /^[0-9a-f]{64}$/);
  assert.equal(await proofKey({ ...d, title: "Another", par: 7 }, host), k);
  assert.notEqual(await proofKey(lane("garden", [rail("x", [12, 4], [12, 8])]), host), k);
  assert.notEqual(await proofKey({ ...d, world: "island" }, host), k);
  assert.equal(await proofKey({ ...d, pieces: [rail("x", [-200, 0], [200, 0])] }, host), null, "a draft fit refuses has none");
});

void test("periodFor: the latest period of the kind; for wind, the strongest wind found", () => {
  host.load(ID, hexOf(d));
  const rain = periodFor(host, ID, "rain", PERIOD);
  assert.equal(rain, host.find(ID, "rain", PERIOD));
  const wind = periodFor(host, ID, "wind", PERIOD), strength = (p: number) => {
    const w = (JSON.parse(host.forecast(ID, p)) as { wind: Vec2 }).wind;
    return Math.hypot(w[0], w[1]);
  };
  assert.equal((JSON.parse(host.forecast(ID, wind)) as { kind: string }).kind, "wind");
  for (let p = host.find(ID, "wind", PERIOD), k = 0; p >= 0 && k < 50; p = host.find(ID, "wind", p - 1), k++) assert.ok(strength(p) <= strength(wind), `${p}`);
  assert.equal(periodFor(host, ID, "snow", PERIOD), -1, "the garden has no snow");
});

// A holed round: n small shots east, then the one from where they leave the ball that holes it.
async function roundOf(c: ReturnType<typeof chainAt>, n: number, p: number) {
  const shots: string[] = [];
  let rest: Vec2 | null = null;
  for (let k = 0; k < n; k++) {
    const s = shotOf(0, 0.8), r: SimulateFrom = rest ? await c.simulateFrom(ID, rest, s, k, p) : await c.simulateRound(ID, [s], p);
    shots.push(s), (rest = r.rest);
  }
  for (let pw = 0.5; pw <= 10; pw += 0.05) {
    const s = shotOf(0, pw), r = rest ? await c.simulateFrom(ID, rest, s, n, p) : await c.simulateRound(ID, [s], p);
    if (r.holed) return [...shots, s];
  }
  throw new Error("no holing shot");
}

void test("Proofs: a holed round replays by commits as a save is cut, and gives a proof", async () => {
  const c = chainAt(PERIOD), key = (await proofKey(d, host))!, shots = await roundOf(c, 0, PERIOD);
  const p = await replay(c, { key, id: ID, kind: "", period: PERIOD, shots });
  assert.equal(typeof p, "object", JSON.stringify(p));
  const proof = p as Proof;
  assert.deepEqual(proof.commits, [[0, shots.length]]);
  assert.equal(proof.strokes, shots.length);
  assert.ok(proof.maxWork > 0 && proof.maxWork < MIN_SHOT_WORK);
  assert.deepEqual({ key: proof.key, id: proof.id, kind: proof.kind, period: proof.period }, { key, id: ID, kind: "", period: PERIOD });
});

void test("Proofs: a round of more than 12 strokes replays in several commits and holds", async () => {
  const c = chainAt(PERIOD), key = (await proofKey(d, host))!, shots = await roundOf(c, 13, PERIOD);
  const proof = (await replay(c, { key, id: ID, kind: "", period: PERIOD, shots })) as Proof;
  assert.ok(proof.commits.length >= 2, JSON.stringify(proof));
  assert.ok(proof.commits.every(([a, b]) => b - a <= RULES.maxShots));
  assert.equal(proof.commits.at(-1)![1], shots.length);
  // what a save of it sends: each commit's gas, the call's and its shots' work on top
  const sent = await replayed(c, { key, id: ID, kind: "", period: PERIOD, shots });
  assert.ok(typeof sent === "object" && sent.gas.length === proof.commits.length && sent.gas.every((g) => g > PER_CALL), JSON.stringify(sent));
});

void test("Proofs: a round that does not hole, or holes before its last shot, is no proof (in words)", async () => {
  const c = chainAt(PERIOD), key = (await proofKey(d, host))!, shots = await roundOf(c, 0, PERIOD);
  assert.equal(typeof (await replay(c, { key, id: ID, kind: "", period: PERIOD, shots: [shotOf(0, 1)] })), "string");
  assert.equal(typeof (await replay(c, { key, id: ID, kind: "", period: PERIOD, shots: [...shots, shotOf(0, 1)] })), "string");
});

void test("Proofs: one that names a weather its period did not have does not count (a file's proof is checked, not trusted)", async () => {
  const c = chainAt(PERIOD), key = (await proofKey(d, host))!, shots = await roundOf(c, 0, PERIOD);
  const kind = (JSON.parse(host.forecast(ID, PERIOD)) as { kind: string }).kind, other = kind === "storm" ? "rain" : "storm";
  assert.match(JSON.stringify(await replay(c, { key, id: ID, kind: other, period: PERIOD, shots })), /weather/);
});

void test("Proofs: one with a shot over minShotWork does not count", async () => {
  const c = chainAt(PERIOD), key = (await proofKey(d, host))!, shots = await roundOf(c, 0, PERIOD);
  const heavy = { ...c, simulateRound: async (...a: Parameters<typeof c.simulateRound>) => ({ ...(await c.simulateRound(...a)), work: MIN_SHOT_WORK + 1 }) };
  assert.match(JSON.stringify(await replay(heavy, { key, id: ID, kind: "", period: PERIOD, shots })), /work/);
});

void test("L3: publishing waits for a proof in each required weather, for this hole as it is now", () => {
  const p = (kind: string, over: Partial<Proof> = {}): Proof => ({ key: "k", id: ID, kind, period: 1, shots: ["0,1"], commits: [[0, 1]], strokes: 1, maxWork: 1, ...over });
  assert.deepEqual(unproven([p(""), p("wind"), p("rain")], "garden", "k", ID), []);
  assert.deepEqual(unproven([p(""), p("rain")], "garden", "k", ID), ["wind"]);
  assert.deepEqual(unproven([p(""), p("wind", { key: "old" }), p("rain")], "garden", "k", ID), ["wind"], "a proof of the hole before a piece moved");
  assert.deepEqual(unproven([p(""), p("wind", { id: "other/v1" }), p("rain")], "garden", "k", ID), ["wind"], "another id: another weather");
  assert.deepEqual(unproven([p(""), p("wind", { maxWork: MIN_SHOT_WORK + 1 }), p("rain")], "garden", "k", ID), ["wind"]);
  assert.deepEqual(unproven([], "island", "k", ID), ["", "wind", "rain", "storm"]);
});

void test("provedAs: the hole as it is now proved in every weather under one of the author's ids for its slug", () => {
  const A = "g1" + "a".repeat(38), id = `${A}/lane/v2`;
  const p = (kind: string, over: Partial<Proof> = {}): Proof => ({ key: "k", id, kind, period: 1, shots: ["0,1"], commits: [[0, 1]], strokes: 1, maxWork: 1, ...over });
  const all = [p(""), p("wind"), p("rain")];
  assert.equal(provedAs(all, "garden", "k", A, "lane"), id);
  assert.equal(provedAs(all, "garden", "other", A, "lane"), null, "a piece moved since");
  assert.equal(provedAs(all, "garden", "k", A, "renamed"), null, "another slug: another id, another weather");
  assert.equal(provedAs(all.slice(1), "garden", "k", A, "lane"), null);
  assert.equal(provedAs([...all, p("", { id: `${A}/lane/v1` })], "garden", "k", A, "lane"), id, "an older version's proof aside");
});

void test("par: the most strokes a proof took plus one, at most 19; a par below that refused", () => {
  const proofs = (most: number) => [3, most, 2].map((strokes) => ({ strokes }) as Proof);
  assert.equal(suggestPar(proofs(4)), 5);
  assert.equal(parAllowed(proofs(4), 4), false);
  for (let p = 5; p <= 19; p++) assert.equal(parAllowed(proofs(4), p), true, `${p}`);
  assert.equal(parAllowed(proofs(4), 20), false);
  assert.equal(suggestPar(proofs(19)), 19);
  assert.equal(parAllowed(proofs(19), 19), true);
  assert.equal(parAllowed(proofs(4), 5.5), false, "a whole number");
  assert.equal(suggestPar([]), 0, "no proof, no par");
});
