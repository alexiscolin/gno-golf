// The game's gate on community holes (lib/community.ts): a hole is listed,
// linked or played only once the Builder's own rules pass it (verdict.ts
// judge), each version judged once a browser (its verdict kept by the sha
// of its data, under the rules' version), only for holes about to be shown.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { bornBefore, communityOf, DAY_TRIES, dayHole, dayPoint, dayRows, HARD_KEY, keepLevel, keptLevel, knownOnly, knownVerdict, pageOf, playable, refused, shownOnly, sortHoles, verdictOf, VERDICT_KEY, type Verdict } from "../lib/community.ts";
import { writeHole } from "../lib/builder/gg1.ts";
import type { DayRow, HoleRow } from "../lib/types.ts";
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

function chainOf(data: Record<string, string>, network = "dev", genesis = "G1") {
  const asked: string[] = [];
  return { asked, realm: "gno.land/r/gnogolf/golf/v2", chainId: () => Promise.resolve(network), genesis: () => Promise.resolve(genesis), holeData: (id: string) => (asked.push(id), Object.hasOwn(data, id) ? Promise.resolve(data[id]) : Promise.reject(new Error("no hole"))) };
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

void test("a version's verdict is kept by its id on its chain (its data never changes): known, its data never read again; an alias's always read", async () => {
  const data = { [`${A}/good/v1`]: goodHex, [`${A}/good`]: goodHex };
  const chain = chainOf(data);
  assert.deepEqual(await verdictOf(chain, `${A}/good/v1`, deps), { ok: true });
  assert.deepEqual(chain.asked, [`${A}/good/v1`]);
  assert.deepEqual(await verdictOf(chain, `${A}/good/v1`, deps), { ok: true });
  assert.deepEqual(await knownVerdict(chain, `${A}/good/v1`), { ok: true });
  assert.deepEqual(await knownOnly(chain, [rowOf(`${A}/good/v1`)]).then((r) => r.map((h) => h.id)), [`${A}/good/v1`]);
  assert.deepEqual(chain.asked, [`${A}/good/v1`], "known: no read");
  await verdictOf(chain, `${A}/good`, deps);
  await verdictOf(chain, `${A}/good`, deps);
  assert.deepEqual(chain.asked.slice(1), [`${A}/good`, `${A}/good`], "an alias names a new version once one is published: read each time");
  const other = chainOf({ [`${A}/good/v1`]: hostileHex }, "test-2");
  assert.equal((await verdictOf(other, `${A}/good/v1`, deps)).ok, false, "the same id on another chain: its own data judged");
  const reseeded = chainOf({ [`${A}/good/v1`]: hostileHex }, "dev", "G2");
  assert.equal((await verdictOf(reseeded, `${A}/good/v1`, deps)).ok, false, "the same chain id and realm, another genesis (a chain reseeded): read afresh, its own data judged");
  assert.deepEqual(reseeded.asked, [`${A}/good/v1`]);
});

void test("an alias whose slug looks like a version (\"v3\") is an alias: its verdict never kept by it, a new version under it judged again", async () => {
  const alias = `${A}/v3`, data: Record<string, string> = { [alias]: goodHex };
  const chain = chainOf(data);
  assert.deepEqual(await verdictOf(chain, alias, deps), { ok: true });
  assert.ok(!Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").some((k) => k.endsWith(`|${alias}`)), "never a key by the alias");
  data[alias] = hostileHex; // its author publishes v2 at the same slug, with gnokey
  assert.equal((await verdictOf(chain, alias, deps)).ok, false, "the new version judged");
  assert.equal(await playable(chain, alias, deps), false);
  assert.equal((await knownVerdict(chain, alias))?.ok, false, "and known as it is now");
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

void test("playable: the Builder's rules failing to load is no verdict (it rejects, the load says Try again), never kept as the hole's", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex });
  await assert.rejects(playable(chain, `${A}/good/v1`, { load: () => Promise.reject(new Error("offline")) }), /offline/);
  assert.equal(await knownVerdict(chain, `${A}/good/v1`), null, "not judged: nothing kept");
  assert.equal(await playable(chain, `${A}/good/v1`, deps), true);
});

void test("communityOf: anyone's latest holes, none taken down; none at all until the takedown list is known (the game starts without waiting for it)", () => {
  const row = (id: string, over: Partial<HoleRow> = {}): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "", ...over });
  const list = [row(`${A}/a/v2`), row(`${A}/a/v1`, { next: `${A}/a/v2` }), row(`${A}/gone/v1`), row("garden/1/v1", { official: true })];
  assert.deepEqual(communityOf(list, null), [], "the list not read yet: nothing shown that might be down");
  assert.deepEqual(communityOf(list, new Set([`${A}/gone`])).map((h) => h.id), [`${A}/a/v2`]);
});

void test("a hole whose data cannot be read now is no verdict: never said to break the rules, nothing kept, judged once it reads", async () => {
  const data: Record<string, string> = {};
  const chain = chainOf(data);
  await assert.rejects(verdictOf(chain, `${A}/good/v1`, deps), /no hole/, "the node down: no verdict at all");
  await assert.rejects(playable(chain, `${A}/good/v1`, deps), /no hole/, "not a no: the load says it did not load, with Try again");
  assert.equal(await refused(chain, `${A}/good/v1`, deps), false, "a link to it (or to an id the chain has not): not refused, so loaded, and said not to load");
  assert.equal(localStorage.length, 0, "nothing kept");
  data[`${A}/good/v1`] = goodHex;
  assert.deepEqual(await verdictOf(chain, `${A}/good/v1`, deps), { ok: true }, "read later: judged, and it passes");
  data[`${A}/bad/v1`] = hostileHex;
  assert.equal(await refused(chain, `${A}/bad/v1`, deps), true, "refused only on a verdict that refuses it");
  assert.equal(await refused(chain, "garden/1/v1", deps), false, "a course hole: never");
});

void test("a list's page: its verified rows, said to be judging until every row of the page has a verdict", () => {
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  const rows = ["a", "b", "c", "d"].map((x) => row(`${A}/${x}/v1`));
  const no = { ok: false as const, why: "x" };
  const half = new Map<string, Verdict>([[rows[0].id, { ok: true }], [rows[1].id, no]]);
  assert.deepEqual(pageOf(rows, 3, half), { rows: [rows[0]], judging: true, unread: false, more: 1 }, "c not judged yet: the page waits for it, d beyond the page");
  const all = new Map<string, Verdict>([...half, [rows[2].id, { ok: true }]]);
  assert.deepEqual(pageOf(rows, 3, all), { rows: [rows[0], rows[2]], judging: false, unread: false, more: 1 });
  assert.equal(pageOf(rows, 10, all).more, 0);
  const unread = new Map<string, Verdict | null>([...all, [rows[1].id, null]]);
  assert.deepEqual(pageOf(rows, 3, unread), { rows: [rows[0], rows[2]], judging: false, unread: true, more: 1 }, "b unread: not shown, not waited for, asked again on Try again");
});

const rowOf = (id: string, over: Partial<HoleRow> = {}): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "", ...over });

const listed = (x: string, v = 1) => rowOf(`${A}/${x}/v${v}`, { slot: `${A}/${x}` });

void test("dayPoint: where in alias order the UTC day's pick starts (the day's hash as an address): the same for everyone all day, another the next", () => {
  const day = Date.UTC(2026, 9, 7, 0, 0, 1);
  assert.match(dayPoint(day), /^g1[023456789acdefghjklmnpqrstuvwxyz]{13}$/);
  assert.equal(dayPoint(Date.UTC(2026, 9, 7, 23, 59, 59)), dayPoint(day), "all that UTC day");
  assert.ok(new Set(Array.from({ length: 7 }, (_, i) => dayPoint(day + i * 864e5))).size > 1, "it changes from day to day");
});

/** A chain whose DayCandidates pages these rows (sorted by alias, as the realm keeps them), n a page. */
function dayChain(rows: readonly DayRow[]) {
  const asked: string[] = [];
  const sorted = [...rows].sort((a, b) => ((a.slot ?? "") < (b.slot ?? "") ? -1 : 1));
  return {
    asked,
    dayCandidates: (after: string, limit: number) => {
      asked.push(after);
      const from = sorted.filter((h) => (h.slot ?? "") > after), page = from.slice(0, limit);
      return Promise.resolve({ version: 1, rows: page, next: from.length > limit ? (page[page.length - 1].slot ?? "") : "" });
    },
  };
}
const dayRowOf = (addr: string, slug: string, born = 0): DayRow => ({ ...rowOf(`${addr}/${slug}/v1`, { slot: `${addr}/${slug}` }), born });

void test("dayRows: the day's candidates, DayCandidates' pages from the day's point on, round to it, each once, none taken down", async () => {
  const day = Date.UTC(2026, 9, 7), at = dayPoint(day);
  // addresses on both sides of the day's point
  const lo = "g1" + "0".repeat(38), hi = "g1" + "z".repeat(38), mid = at + "q".repeat(25);
  const rows = [dayRowOf(lo, "a"), dayRowOf(lo, "b"), dayRowOf(mid, "c"), dayRowOf(hi, "d"), dayRowOf(hi, "gone"), dayRowOf(hi, "e")];
  const chain = dayChain(rows);
  const got: DayRow[] = [];
  for await (const page of dayRows(chain, day, new Set([`${hi}/gone`]), 2)) got.push(...page);
  assert.deepEqual(got.map((h) => h.slot), [`${mid}/c`, `${hi}/d`, `${hi}/e`, `${lo}/a`, `${lo}/b`], "from the point, round to it, the one taken down left out");
  assert.equal(chain.asked[0], at);
  const more = dayChain([...rows, dayRowOf("g1" + "1".repeat(38), "new", 999)]);
  const again: DayRow[] = [];
  for await (const page of dayRows(more, day, new Set([`${hi}/gone`]), 2)) again.push(...page);
  assert.deepEqual(again.filter((h) => !h.slot?.endsWith("/new")).map((h) => h.slot), got.map((h) => h.slot), "a hole published: the others in their order");
  await assert.rejects(async () => {
    for await (const _ of dayRows({ dayCandidates: () => Promise.reject(new Error("node down")) }, day, new Set())) void _;
  }, /node down/, "not read: it throws (the day waits, Try again)");
});

void test("dayHole: the first candidate published before the day began that the rules pass; one not known yet holds the day back, one not read says so", () => {
  const [a, b, c] = ["a", "b", "c"].map((x) => listed(x));
  const ok = { ok: true as const }, no = { ok: false as const, why: "x" };
  const born = (m: [HoleRow, boolean | null][]) => new Map(m.map(([h, v]) => [h.slot ?? "", v]));
  const v = (m: [HoleRow, Verdict | null][]) => new Map(m.map(([h, x]) => [h.id, x]));
  assert.deepEqual(dayHole([a, b, c], born([[a, false], [b, true]]), v([[b, ok]])), { day: b, unread: false }, "a: published today, never the day's");
  assert.deepEqual(dayHole([a, b, c], born([[a, true], [b, true]]), v([[a, no], [b, ok]])), { day: b, unread: false }, "a: refused, the next");
  assert.deepEqual(dayHole([a, b, c], born([[a, true]]), v([])), { day: null, unread: false }, "a not judged yet: the day waits");
  assert.deepEqual(dayHole([a, b, c], born([[a, true], [b, true]]), v([[a, null], [b, ok]])), { day: null, unread: true }, "a not read: never skipped");
  assert.deepEqual(dayHole([a, b, c], born([[a, null]]), v([])), { day: null, unread: true }, "when a was published not read: never skipped");
  const many = Array.from({ length: DAY_TRIES + 1 }, (_, i) => listed(`h${i}`));
  assert.deepEqual(dayHole(many, born(many.map((h) => [h, true])), v(many.map((h, i) => [h, i < DAY_TRIES ? no : ok]))), { day: null, unread: false }, "DAY_TRIES refused: none today");
});

void test("bornBefore: whether a hole was first published before a time (its first version's block, as DayCandidates gives it), kept once known; 0 long before; not read: it throws", async () => {
  const at = Date.UTC(2026, 9, 7);
  let reads = 0, down = false, genesis = "G1";
  const chain = {
    realm: "gno.land/r/gnogolf/golf/v2", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve(genesis),
    blockTime: (h: number) => (reads++, down ? Promise.reject(new Error("node down")) : Promise.resolve(h === 7 ? at - 1 : at + 1)),
  };
  const old = dayRowOf(A, "old", 7), young = dayRowOf(A, "young", 90), long = dayRowOf(A, "long", 0);
  down = true;
  await assert.rejects(bornBefore(chain, old, at), /node down/);
  down = false;
  assert.equal(await bornBefore(chain, old, at), true);
  assert.equal(await bornBefore(chain, old, at - 1), false);
  assert.equal(await bornBefore(chain, young, at), false, "published that day");
  assert.equal(reads, 3, "known: not read again");
  assert.equal(await bornBefore(chain, long, at), true, "0: long before (its first older than Versions' page, or from v1)");
  assert.equal(reads, 3, "no block read for it");
  genesis = "G2";
  assert.equal(await bornBefore(chain, old, at), true);
  assert.equal(reads, 4, "a chain reseeded under the same id: read afresh");
});

void test("sortHoles: newest as the chain lists them, most played, hardest by the meter's level (not rated yet: last)", () => {
  const [a, b, c, d] = [rowOf(`${A}/a/v1`, { plays: 2 }), rowOf(`${A}/b/v1`, { plays: 9 }), rowOf(`${A}/c/v1`, { plays: 2 }), rowOf(`${A}/d/v1`, { plays: 5 })];
  const rows = [a, b, c, d];
  assert.deepEqual(sortHoles(rows, "new", new Map()), rows);
  assert.deepEqual(sortHoles(rows, "played", new Map()).map((h) => h.id), [b, d, a, c].map((h) => h.id), "a tie: the newer first");
  const levels = new Map([[a.id, 1], [b.id, 3], [d.id, 1]] as const);
  assert.deepEqual(sortHoles(rows, "hard", levels).map((h) => h.id), [b, a, d, c].map((h) => h.id));
  assert.deepEqual(rows, [a, b, c, d], "the list itself untouched");
});

void test("a hole's meter level, kept by its version (whose data never changes), in this browser; junk or a store that throws: none", () => {
  const id = `${A}/a/v1`;
  assert.equal(keptLevel(id), null);
  keepLevel(id, 2);
  assert.equal(keptLevel(id), 2);
  localStorage.setItem(`${HARD_KEY}|${id}`, "7");
  assert.equal(keptLevel(id), null);
  const was = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
  try {
    assert.equal(keptLevel(id), null);
    assert.doesNotThrow(() => keepLevel(id, 1));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: was, writable: true });
  }
});
