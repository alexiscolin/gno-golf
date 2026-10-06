// The game's gate on community holes (lib/community.ts): a hole is listed,
// linked or played only once the Builder's own rules pass it (verdict.ts
// judge), each version judged once a browser (its verdict kept by the sha
// of its data, under the rules' version), only for holes about to be shown.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { communityOf, knownOnly, knownVerdict, pageOf, playable, shownOnly, verdictOf, VERDICT_KEY, type Verdict } from "../lib/community.ts";
import { writeHole } from "../lib/builder/gg1.ts";
import type { HoleRow } from "../lib/types.ts";
import type { HoleIn } from "../lib/builder/types.ts";

const { census } = await import("../lib/builder/drawn.ts");
const A = "g1" + "a".repeat(38);
beforeEach(() => localStorage.clear());

// a hostile hole, published straight through PublishMine with gnokey: a cup inside a post
const hostile: HoleIn = {
  w: 96, h: 96, par: 3, substeps: 22, world: "garden", order: 0, title: "Hostile", tee: [5.5, 11.5], pin: [35.5, 11.5], cupR: 1.2, shelter: 0, friction: 0.86, bounce: 0.85, ballR: 0.5,
  walls: [[1.5, 1.5, 41.5, 1.5], [41.5, 1.5, 41.5, 21.5], [41.5, 21.5, 1.5, 21.5], [1.5, 21.5, 1.5, 1.5]].map(([a, b, c, d]) => ({ a: [a, b] as [number, number], b: [c, d] as [number, number] })),
  posts: [{ c: [35.5, 11.5], r: 1, skin: "rock" }], zones: [], pulses: [],
};
const hostileHex = (() => {
  const f = host.fit(writeHole(hostile), "");
  if (!f.ok) throw new Error(f.why);
  return f.hex;
})();
const goodHex = hexOf(lane("garden", []));

function chainOf(data: Record<string, string>) {
  const asked: string[] = [];
  return { asked, holeData: (id: string) => (asked.push(id), Object.hasOwn(data, id) ? Promise.resolve(data[id]) : Promise.reject(new Error("no hole"))) };
}
const deps = { load: () => Promise.resolve({ host, census }) };

void test("a hostile hole published directly is not shown; a Builder-made one is", async () => {
  const chain = chainOf({ [`${A}/bad/v1`]: hostileHex, [`${A}/good/v1`]: goodHex });
  const bad = await verdictOf(chain, `${A}/bad/v1`, deps), good = await verdictOf(chain, `${A}/good/v1`, deps);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.why, /^This hole was not made with the Builder rules\./);
  assert.deepEqual(good, { ok: true });
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  const verdicts = new Map([[`${A}/bad/v1`, bad], [`${A}/good/v1`, good]]);
  assert.deepEqual(shownOnly([row(`${A}/bad/v1`), row(`${A}/good/v1`), row(`${A}/unjudged/v1`)], verdicts).map((h) => h.id), [`${A}/good/v1`], "a hole not judged yet is not shown either");
});

void test("a version is judged once a browser: its verdict kept by the sha of its data, under the rules' version", async () => {
  let judged = 0;
  const chain = chainOf({ [`${A}/bad/v1`]: hostileHex, [`${A}/bad2/v1`]: hostileHex });
  const counting = { load: () => (judged++, deps.load()) };
  await verdictOf(chain, `${A}/bad/v1`, counting);
  await verdictOf(chain, `${A}/bad2/v1`, counting);
  assert.equal(judged, 1, "the same data under another id: its sha's verdict, not judged again");
  assert.ok(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").some((k) => k.startsWith(VERDICT_KEY)), "kept in this browser");
});

void test("knownVerdict: a verdict this browser already has, never a judging (the phone's /build screen loads no builder.wasm)", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex });
  let loads = 0;
  const watched = { load: () => (loads++, deps.load()) };
  assert.equal(await knownVerdict(chain, `${A}/good/v1`), null, "not judged here yet: unknown, not shown");
  await verdictOf(chain, `${A}/good/v1`, watched);
  assert.deepEqual(await knownVerdict(chain, `${A}/good/v1`), { ok: true });
  assert.equal(loads, 1);
});

void test("knownOnly: the rows this browser already passed, in their order; none judged", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex, [`${A}/bad/v1`]: hostileHex, [`${A}/new/v1`]: hexOf(lane("island", [])) });
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  await verdictOf(chain, `${A}/good/v1`, deps);
  await verdictOf(chain, `${A}/bad/v1`, deps);
  const rows = [row(`${A}/bad/v1`), row(`${A}/new/v1`), row(`${A}/good/v1`)];
  assert.deepEqual((await knownOnly(chain, rows)).map((h) => h.id), [`${A}/good/v1`], "bad: refused; new: never judged here");
});

void test("playable: a course hole always, never judged; a community hole (its version or its alias) only once the Builder's rules pass it", async () => {
  let loads = 0;
  const watched = { load: () => (loads++, deps.load()) };
  const chain = chainOf({ [`${A}/bad/v1`]: hostileHex, [`${A}/bad`]: hostileHex, [`${A}/good/v1`]: goodHex });
  assert.equal(await playable(chain, "garden/1/v1", watched), true);
  assert.equal(await playable(chain, "garden/1", watched), true);
  assert.equal(loads, 0, "a course hole: builder.wasm never loaded for it");
  assert.equal(await playable(chain, `${A}/bad/v1`, watched), false);
  assert.equal(await playable(chain, `${A}/bad`, watched), false, "its alias too");
  assert.equal(await playable(chain, `${A}/good/v1`, watched), true);
  assert.deepEqual(chain.asked.filter((x) => !x.startsWith(A)), [], "a course hole's data never read for it");
});

void test("playable: the Builder's rules failing to load is a no, never kept as the hole's verdict", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex });
  assert.equal(await playable(chain, `${A}/good/v1`, { load: () => Promise.reject(new Error("offline")) }), false);
  assert.equal(await knownVerdict(chain, `${A}/good/v1`), null, "not judged: nothing kept");
  assert.equal(await playable(chain, `${A}/good/v1`, deps), true);
});

void test("communityOf: anyone's latest holes, none taken down; none at all until the takedown list is known (the game starts without waiting for it)", () => {
  const row = (id: string, over: Partial<HoleRow> = {}): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "", ...over });
  const list = [row(`${A}/a/v2`), row(`${A}/a/v1`, { next: `${A}/a/v2` }), row(`${A}/gone/v1`), row("garden/1/v1", { official: true })];
  assert.deepEqual(communityOf(list, null), [], "the list not read yet: nothing shown that might be down");
  assert.deepEqual(communityOf(list, new Set([`${A}/gone`])).map((h) => h.id), [`${A}/a/v2`]);
});

void test("a hole whose data cannot be read is not shown (nothing unjudged is ever played)", async () => {
  const v = await verdictOf(chainOf({}), `${A}/gone/v1`, deps);
  assert.equal(v.ok, false);
});

void test("a list's page: its verified rows, said to be judging until every row of the page has a verdict", () => {
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  const rows = ["a", "b", "c", "d"].map((x) => row(`${A}/${x}/v1`));
  const no = { ok: false as const, why: "x" };
  const half = new Map<string, Verdict>([[rows[0].id, { ok: true }], [rows[1].id, no]]);
  assert.deepEqual(pageOf(rows, 3, half), { rows: [rows[0]], judging: true, more: 1 }, "c not judged yet: the page waits for it, d beyond the page");
  const all = new Map<string, Verdict>([...half, [rows[2].id, { ok: true }]]);
  assert.deepEqual(pageOf(rows, 3, all), { rows: [rows[0], rows[2]], judging: false, more: 1 });
  assert.equal(pageOf(rows, 10, all).more, 0);
});
