// Proofs that survive an edit (lib/builder/carry.ts): the author's own rounds
// of the hole before, replayed whole on the new canonical bytes by the realm's
// code (proof.ts replay); a weather whose round still holes in the same
// strokes keeps its proof, keyed to the new hole; the others are said in a
// plain line. Nothing here plays a shot of its own: only the rounds kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, ID, PERIOD, hexOf, lane, rail } from "./builder-fixture.ts";
import { carry, dropped, KEPT_KEYS, toCarry, withCarried } from "../lib/builder/carry.ts";
import { weatherName } from "../lib/builder/rules.ts";
import { makeLocalChain } from "../lib/builder/localchain.ts";
import { holeRow } from "../lib/builder/testmode.ts";
import { proofKey, replay, type Proof } from "../lib/builder/proof.ts";
import { shotOf } from "../lib/chain.ts";
import type { Draft, Piece } from "../lib/builder/draft.ts";
import type { SimulateFrom, Vec2 } from "../lib/types.ts";

const AUTHOR = ID.split("/")[0];
const d: Draft = { ...lane("garden", []), slug: "fixture" };
host.load(ID, hexOf(d));
host.setperiod(PERIOD);
const kind = (JSON.parse(host.forecast(ID, PERIOD)) as { kind: string }).kind;
const post = (id: string, c: [number, number], r = 1.5): Piece => ({ id, entry: "*/post/rock", geometry: { t: "post", c, r }, params: {}, clock: { k: "fixed" } });

/** A holed round on d: small shots east, then the one that holes from where they leave the ball. */
async function proved(on: Draft): Promise<Proof> {
  const hex = hexOf(on), c = makeLocalChain(host, holeRow(ID, on), hex, PERIOD), shots: string[] = [];
  let rest: Vec2 | null = null;
  const s0 = shotOf(0, 0.8), r0: SimulateFrom = await c.simulateRound(ID, [s0], PERIOD);
  shots.push(s0), (rest = r0.rest);
  for (let pw = 0.5; pw <= 10; pw += 0.05) {
    const s = shotOf(0, pw), r = await c.simulateFrom(ID, rest, s, 1, PERIOD);
    if (r.holed) {
      const p = await replay(c, { key: (await proofKey(on, host))!, id: ID, kind, period: PERIOD, shots: [...shots, s] });
      if (typeof p === "string") throw new Error(p);
      return p;
    }
  }
  throw new Error("no holing shot");
}

void test("weatherName: a weather in a sentence, clear for none", () => {
  assert.deepEqual(["", "wind", "rain", "storm", "snow"].map(weatherName), ["Clear", "Wind", "Rain", "Storm", "Snow"]);
});

void test("toCarry: for each weather, the latest round of an older hole under the author's ids for the slug, none the new hole already has", () => {
  const p = (k: string, key: string, over: Partial<Proof> = {}): Proof => ({ key, id: ID, kind: k, period: 1, shots: ["0,1"], commits: [[0, 1]], strokes: 1, maxWork: 1, ...over });
  const old = [p("", "a"), p("wind", "a"), p("", "b", { strokes: 2 }), p("rain", "now"), p("wind", "a", { id: "g1other/fixture/v1" })];
  const got = toCarry(old, "now", AUTHOR, "fixture");
  assert.deepEqual(got.map((x) => [x.kind, x.key, x.strokes]), [["", "b", 2], ["wind", "a", 1]], "clear's latest (b), wind's; rain is had; another author's aside");
  assert.deepEqual(toCarry(old, "now", AUTHOR, "renamed"), [], "another slug: another id, another weather");
});

void test("carry: an edit off the ball's way keeps the proof, keyed to the new hole, a full replay on its bytes", async () => {
  const p = await proved(d);
  const moved = { ...d, pieces: [...d.pieces, rail("far", [4, 2], [6, 2])], proofs: [p] };
  const key = (await proofKey(moved, host))!;
  assert.notEqual(key, p.key);
  const r = await carry(host, moved, hexOf(moved), key, AUTHOR);
  assert.deepEqual(r.broken, []);
  assert.equal(r.proofs.length, 1);
  const same = (x: Proof) => ({ id: x.id, kind: x.kind, period: x.period, shots: x.shots, strokes: x.strokes, commits: x.commits });
  assert.deepEqual(same(r.proofs[0]), same(p), "the same round in the same strokes (its work the new hole's)");
  assert.equal(r.proofs[0].key, key);
});

void test("carry: an edit in the ball's way drops the proof, said in a plain line", async () => {
  const p = await proved(d);
  const blocked = { ...d, pieces: [...d.pieces, post("rock", [d.pin[0] - 4, d.pin[1]])], proofs: [p] };
  const key = (await proofKey(blocked, host))!;
  const r = await carry(host, blocked, hexOf(blocked), key, AUTHOR);
  assert.deepEqual(r.proofs, []);
  assert.equal(r.broken.length, 1);
  assert.equal(r.broken[0].kind, kind);
  assert.match(r.broken[0].why, new RegExp(`^Your ${weatherName(kind)} round now `));
});

void test("dropped: the weathers the hole before was proved in that the new one is not, in the toast's words", () => {
  const p = (k: string, key: string): Proof => ({ key, id: ID, kind: k, period: 1, shots: ["0,1"], commits: [[0, 1]], strokes: 1, maxWork: 1 });
  const proofs = [p("", "old"), p("wind", "old"), p("rain", "old"), p("", "new")];
  assert.deepEqual(dropped(proofs, "old", "new"), ["wind", "rain"]);
  assert.deepEqual(dropped(proofs, "new", "old"), []);
  assert.deepEqual(dropped(proofs, null, "new"), [], "no hole before (a draft opened): nothing dropped by an edit");
});

void test("withCarried: the carried proofs in, the oldest keys' let go past KEPT_KEYS", () => {
  const p = (key: string): Proof => ({ key, id: ID, kind: "", period: 1, shots: ["0,1"], commits: [[0, 1]], strokes: 1, maxWork: 1 });
  assert.deepEqual(withCarried([p("a"), p("b")], [p("c")]).map((x) => x.key), ["a", "b", "c"]);
  assert.deepEqual(withCarried([p("a"), p("b"), p("c"), p("d")], [p("e")]).map((x) => x.key), ["b", "c", "d", "e"]);
  assert.equal(KEPT_KEYS, 4);
});
