// The game's gate on community holes (lib/community.ts): a hole is listed,
// linked or played only once the Builder's own rules pass it (verdict.ts
// judge), each version judged once a browser (its verdict kept by the sha
// of its data, under the rules' version), only for holes about to be shown.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { host, hexOf, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { aliasOf, authorHoled, BESTS_AT_ONCE, bornBefore, DAY_SKIPS, keepDay, keptDay, VERDICT_RULES, communityOf, DAY_TRIES, dayHole, dayHole as day, dayPoint, gateOf, heldBefore, heldFor, dayRows, HARD_KEY, keepLevel, keepOwn, keptLevel, knownOnly, knownVerdict, linkGate, MODES, pageOf, shownOnly, sortHoles, verdictOf, VERDICT_KEY, type Verdict } from "../lib/community.ts";
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

/** A chain of these holes' data; held: whether a hole's author holds a best on it (by default every one: the gate on it is tested apart). */
function chainOf(data: Record<string, string>, network = "dev", genesis = "G1", held: (id: string) => boolean = () => true) {
  const asked: string[] = [], bests: string[] = [];
  return {
    asked, bests: (id: string, mode: string, players: readonly string[]) => (bests.push(`${id} ${mode}`), Promise.resolve({ version: 1, hole: id, mode: mode as "assisted", par: 3, rows: held(id) ? players.map((player) => ({ player, name: "", strokes: 3 })) : [] })), bested: bests,
    realm: "gno.land/r/gnogolf/golf/v2", chainId: () => Promise.resolve(network), genesis: () => Promise.resolve(genesis), holeData: (id: string) => (asked.push(id), Object.hasOwn(data, id) ? Promise.resolve(data[id]) : Promise.reject(new Error("no hole"))),
  };
}
const deps = { load: () => Promise.resolve({ host, census }) };
// whether the game plays a hole (gateOf's ""), for the tests that ask only that
const playable = async (...a: Parameters<typeof gateOf>) => (await gateOf(...a)) === "";

void test("a hostile hole published directly is not shown; a Builder-made one is", async () => {
  const chain = chainOf({ [`${A}/bad/v1`]: hostileHex, [`${A}/good/v1`]: goodHex });
  const bad = await verdictOf(chain, `${A}/bad/v1`, deps), good = await verdictOf(chain, `${A}/good/v1`, deps);
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.why, /^This hole was not made with the Builder rules\./);
  assert.deepEqual(good, { ok: true });
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  const verdicts = new Map([[`${A}/bad/v1`, bad], [`${A}/good/v1`, good]]), open = new Map([`${A}/bad/v1`, `${A}/good/v1`, `${A}/unjudged/v1`].map((id) => [id, true]));
  assert.deepEqual(shownOnly([row(`${A}/bad/v1`), row(`${A}/good/v1`), row(`${A}/unjudged/v1`)], verdicts, open).map((h) => h.id), [`${A}/good/v1`], "a hole not judged yet is not shown either");
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
  assert.equal(await linkGate(chain, `${A}/good/v1`, deps), "", "a link to it (or to an id the chain has not): not refused, so loaded, and said not to load");
  assert.ok(!Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").some((k) => k.startsWith(VERDICT_KEY)), "no verdict kept");
  data[`${A}/good/v1`] = goodHex;
  assert.deepEqual(await verdictOf(chain, `${A}/good/v1`, deps), { ok: true }, "read later: judged, and it passes");
  data[`${A}/bad/v1`] = hostileHex;
  assert.equal(await linkGate(chain, `${A}/bad/v1`, deps), "unchecked", "refused only on a verdict that refuses it");
  assert.equal(await linkGate(chain, "garden/1/v1", deps), "", "a course hole: never");
});

void test("a list's page: its verified rows, said to be judging until every row of the page has a verdict", () => {
  const row = (id: string): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "" });
  const rows = ["a", "b", "c", "d"].map((x) => row(`${A}/${x}/v1`)), open = new Map(rows.map((h) => [h.id, true]));
  const no = { ok: false as const, why: "x" };
  const half = new Map<string, Verdict>([[rows[0].id, { ok: true }], [rows[1].id, no]]);
  assert.deepEqual(pageOf(rows, 3, half, open), { rows: [rows[0]], judging: true, unread: false, more: 1 }, "c not judged yet: the page waits for it, d beyond the page");
  const all = new Map<string, Verdict>([...half, [rows[2].id, { ok: true }]]);
  assert.deepEqual(pageOf(rows, 3, all, open), { rows: [rows[0], rows[2]], judging: false, unread: false, more: 1 });
  assert.equal(pageOf(rows, 10, all, open).more, 0);
  const unread = new Map<string, Verdict | null>([...all, [rows[1].id, null]]);
  assert.deepEqual(pageOf(rows, 3, unread, open), { rows: [rows[0], rows[2]], judging: false, unread: true, more: 1 }, "b unread: not shown, not waited for, asked again on Try again");
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
  const all = new Map<string, boolean | null>(), dayHole = (rows: HoleRow[], b: Map<string, boolean | null>, vs: Map<string, Verdict | null>, held = all) => day(rows, b, vs, held);
  for (const h of [a, b, c]) all.set(h.id, true);
  assert.deepEqual(dayHole([a, b, c], born([[a, false], [b, true]]), v([[b, ok]])), { day: b, unread: false }, "a: published today, never the day's");
  assert.deepEqual(dayHole([a, b, c], born([[a, true], [b, true]]), v([[a, no], [b, ok]])), { day: b, unread: false }, "a: refused, the next");
  assert.deepEqual(dayHole([a, b, c], born([[a, true]]), v([])), { day: null, unread: false, need: { what: "verdict", h: a } }, "a not judged yet: the day waits");
  assert.deepEqual(dayHole([a, b, c], born([[a, true], [b, true]]), v([[a, null], [b, ok]])), { day: null, unread: true }, "a not read: never skipped");
  assert.deepEqual(dayHole([a, b, c], born([[a, null]]), v([])), { day: null, unread: true }, "when a was published not read: never skipped");
  const many = Array.from({ length: DAY_TRIES + 1 }, (_, i) => listed(`h${i}`));
  for (const h of many) all.set(h.id, true);
  assert.deepEqual(dayHole(many, born(many.map((h) => [h, true])), v(many.map((h, i) => [h, i < DAY_TRIES ? no : ok]))), { day: null, unread: false, done: true }, "DAY_TRIES refused: none today, no page more read");
});

void test("the day's hole: the same all day however many publish (more than Holes() lists), version or are taken down beside it", async () => {
  const day = Date.UTC(2026, 9, 7), at = day, noon = day + 12 * 3600e3;
  const addr = (i: number) => "g1" + "023456789acdefghjklmnpqrstuvwxyz"[i % 32].repeat(2) + String(i).padStart(36, "0").replace(/[1b-io]/g, "q");
  // blocks: height 10 before the day began, 500 during it
  const chain = { realm: "r", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("G"), blockTime: (h: number) => Promise.resolve(h < 100 ? at - 1 : at + 1) };
  const pick = async (rows: readonly DayRow[], taken = new Set<string>()) => {
    const list: DayRow[] = [], born = new Map<string, boolean | null>();
    for await (const page of dayRows(dayChain(rows), noon, taken, 7)) list.push(...page);
    for (const h of list) born.set(aliasOf(h), await bornBefore(chain, h, at));
    return dayHole(list, born, new Map(list.map((h) => [h.id, { ok: true as const }])), new Map(list.map((h) => [h.id, true]))).day?.slot;
  };
  const before = Array.from({ length: 30 }, (_, i) => dayRowOf(addr(i), `old${i}`, 10));
  const first = await pick(before);
  assert.ok(first);
  const today = Array.from({ length: 150 }, (_, i) => dayRowOf(addr(i * 7 + 3), `new${i}`, 500));
  assert.equal(await pick([...before, ...today]), first, "150 published during the day, anywhere in alias order: the same hole");
  const versioned = [...before.map((h) => (h.slot === first ? { ...h, id: `${h.slot}/v2` } : h)), ...today];
  assert.equal(await pick(versioned), first, "its own new version: still the day's");
  const other = before.find((h) => h.slot !== first)!;
  assert.equal(await pick([...before, ...today], new Set([other.slot!])), first, "another taken down: the same");
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

void test("a hole's meter level, kept by its version on its chain (its id, genesis, realm), in this browser; an alias, junk or a store that throws: none", async () => {
  const id = `${A}/a/v1`, chain = chainOf({}), reseeded = chainOf({}, "dev", "G2");
  assert.equal(await keptLevel(chain, id), null);
  await keepLevel(chain, id, 2);
  assert.equal(await keptLevel(chain, id), 2);
  assert.equal(await keptLevel(reseeded, id), null, "the same id on a chain reseeded: measured afresh");
  assert.equal(await keptLevel(chainOf({}, "test-2"), id), null, "on another chain too");
  await keepLevel(chain, `${A}/v3`, 1);
  assert.equal(await keptLevel(chain, `${A}/v3`), null, "an alias (its slug like a version): never kept");
  const key = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").find((k) => k.startsWith(HARD_KEY))!;
  localStorage.setItem(key, "7");
  assert.equal(await keptLevel(chain, id), null);
  const was = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
  try {
    assert.equal(await keptLevel(chain, id), null);
    await assert.doesNotReject(keepLevel(chain, id, 1));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: was, writable: true });
  }
  await assert.doesNotReject(keepLevel({ ...chain, genesis: () => Promise.reject(new Error("down")) }, id, 1), "its chain not read: nothing kept, nothing thrown");
});

// The audit's (2026-10-22): a publish with gnokey skips the Builder's proof, and the rules alone pass a hole no round
// can hole. A community hole is listed, linked, played and picked for the day only once its author holds a best on it.
void test("a community hole its author has not holed: not listed, not played, not the day's; once they hold a best, all three", async () => {
  let held = false;
  const chain = chainOf({ [`${A}/good/v1`]: goodHex, [`${A}/bad/v1`]: hostileHex }, "dev", "G1", () => held);
  assert.deepEqual(await verdictOf(chain, `${A}/good/v1`, deps), { ok: true }, "the rules' verdict: its own fact, the best apart");
  assert.equal(await heldFor(chain, `${A}/good/v1`), false);
  assert.equal(await gateOf(chain, `${A}/good/v1`, deps), "unheld");
  assert.equal(await gateOf(chain, `${A}/bad/v1`, deps), "unchecked", "a hole the rules refuse says so, whatever its best");
  assert.equal(await gateOf(chain, "garden/1/v1", deps), "", "a course hole: always");
  const rows = [{ id: `${A}/good/v1`, slot: `${A}/good` }];
  const verdicts = new Map([[`${A}/good/v1`, await verdictOf(chain, `${A}/good/v1`, deps)]]);
  assert.equal(dayHole(rows, new Map([[`${A}/good`, true]]), verdicts, new Map([[`${A}/good/v1`, false]])).day, null, "not the day's");
  assert.deepEqual(shownOnly(rows as HoleRow[], verdicts, new Map([[`${A}/good/v1`, await heldFor(chain, `${A}/good/v1`)]])), [], "not listed");
  // the author saves a round that holes it
  held = true;
  assert.equal(await heldFor(chain, `${A}/good/v1`), true);
  assert.equal(await playable(chain, `${A}/good/v1`, deps), true);
  // kept once known: never asked again (a best stays its player's)
  held = false;
  const before = chain.bested.length;
  assert.equal(await authorHoled(chain, `${A}/good/v1`), true);
  assert.equal(chain.bested.length, before);
});

void test("the author's own: a hole published from this browser plays here before its author holds a best on it, and is still not listed", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex, [`${A}/good`]: goodHex }, "dev", "G1", () => false);
  await keepOwn(chain, `${A}/good/v1`);
  assert.equal(await playable(chain, `${A}/good/v1`, deps), true);
  assert.equal(await authorHoled(chain, `${A}/good/v1`), false, "its best still none: listed to others only once there is one");
  assert.equal(await playable(chain, `${A}/good`, deps), false, "the transaction not seen landed: its alias not marked (a publish that failed opens nothing under it)");
  await keepOwn(chain, `${A}/good/v1`, true);
  assert.equal(await playable(chain, `${A}/good`, deps), true, "seen landed: its alias, the link it is shared by");
  const other = chainOf({ [`${A}/good/v1`]: goodHex }, "test", "G1", () => false);
  assert.equal(await playable(other, `${A}/good/v1`, deps), false, "on another chain: not its own");
});

void test("a best not read now is no verdict", async () => {
  const down = { ...chainOf({ [`${A}/good/v1`]: goodHex }), bests: () => Promise.reject(new Error("node down")) };
  await assert.rejects(playable(down, `${A}/good/v1`, deps), /node down/);
  assert.deepEqual(await knownVerdict(down, `${A}/good/v1`), { ok: true }, "the rules' verdict kept all the same: a fact of its own, the best asked again");
});

// The verifier's (2026-10-22): a link says why it is refused; the day's pick holds all day; the author plays their own.
void test("a link to a hole refused says why: not the Builder's rules, or not holed by its maker yet; not read now, not refused", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex, [`${A}/bad/v1`]: hostileHex }, "dev", "G1", () => false);
  assert.equal(await linkGate(chain, `${A}/good/v1`, deps), "unheld");
  assert.equal(await linkGate(chain, `${A}/bad/v1`, deps), "unchecked");
  assert.equal(await linkGate(chain, "garden/1/v1", deps), "");
  const down = { ...chain, bests: () => Promise.reject(new Error("node down")) };
  assert.equal(await linkGate(down, `${A}/good/v1`, deps), "", "not read now: loaded, and said not to load");
});

void test("the day's pick: a hole counts only with its author's best set before the day began; one not holed yet passes without a try", async () => {
  const day = Date.UTC(2026, 9, 7);
  // the author's best at block 10 (before the day) on x, at block 500 (during it) on y, none on z
  const heights: Record<string, number> = { [`${A}/x/v1`]: 10, [`${A}/y/v1`]: 500 };
  const chain = {
    ghost: (id: string, mode: string, player: string) => Promise.resolve(mode === "assisted" && heights[id] ? { version: 1, hole: id, mode: "assisted" as const, player, height: heights[id], strokes: 3, period: 1, shots: "0,1" } : null),
    blockTime: (h: number) => Promise.resolve(h < 100 ? day - 1 : day + 1),
    realm: "r", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("G"),
  };
  assert.equal(await heldBefore(chain, `${A}/x/v1`, day), true);
  assert.equal(await heldBefore(chain, `${A}/y/v1`, day), false, "holed today: not before the day began");
  assert.equal(await heldBefore(chain, `${A}/z/v1`, day), false);
  assert.equal(await heldBefore(chain, "garden/1/v1", day), true);
  const rows = ["z", "y", "x"].map((n) => ({ id: `${A}/${n}/v1`, slot: `${A}/${n}` })), born = new Map(rows.map((h) => [h.slot, true]));
  const notHeld = { ok: true as const }, verdicts = new Map(rows.map((h) => [h.id, h.id.includes("/x/") ? { ok: true as const } : notHeld]));
  const held = new Map(await Promise.all(rows.map(async (h) => [h.id, await heldBefore(chain, h.id, day)] as const)));
  assert.equal(dayHole(rows, born, verdicts, held).day?.id, `${A}/x/v1`, "z and y passed over: x, held before the day");
  // more unheld ones than DAY_TRIES before it: none of them a try
  const many = [...Array.from({ length: DAY_TRIES + 2 }, (_, i) => ({ id: `${A}/u${i}/v1`, slot: `${A}/u${i}` })), rows[2]];
  assert.equal(dayHole(many, new Map(many.map((h) => [h.slot, true])), new Map(many.map((h) => [h.id, h === rows[2] ? { ok: true as const } : notHeld])), new Map(many.map((h) => [h.id, h === rows[2]]))).day?.id, `${A}/x/v1`);
  // a best not read now: the day waits, never skips it
  assert.deepEqual(dayHole(rows, born, verdicts, new Map([[rows[0].id, null]])), { day: null, unread: true });
});

void test("the author plays their own: the account connected or the address this browser knows; a hole marked by its alias too once seen landed", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex, [`${A}/good`]: goodHex }, "dev", "G1", () => false);
  assert.equal(await gateOf(chain, `${A}/good/v1`, deps, A), "", "the account connected is its author's");
  assert.equal(await gateOf(chain, `${A}/good/v1`, deps, "g1" + "c".repeat(38)), "unheld", "another's");
  localStorage.setItem("gnogolf.builder.author", A);
  assert.equal(await gateOf(chain, `${A}/good/v1`, deps), "", "the address this browser knows");
  localStorage.clear();
  await keepOwn(chain, `${A}/good/v1`, true);
  assert.equal(await gateOf(chain, `${A}/good`, deps), "", "its alias, the link Play it for real gives");
});

void test("the phone's list asks the chain a few authors' bests at a time", async () => {
  let now = 0, most = 0;
  const base = chainOf({});
  const chain = { ...base, holeData: () => Promise.resolve(goodHex), bests: async (id: string, mode: string, players: readonly string[]) => {
    most = Math.max(most, ++now);
    await new Promise((r) => setTimeout(r, 5));
    now--;
    return base.bests(id, mode, players);
  } };
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: `${A}/h${i}/v1`, slot: `${A}/h${i}` }) as HoleRow);
  for (const h of rows) await verdictOf(chain, h.id, deps);
  assert.equal((await knownOnly(chain, rows)).length, 12);
  assert.ok(most <= BESTS_AT_ONCE * MODES.length, `at most ${BESTS_AT_ONCE} holes at once, both modes each: ${most} reads`);
});

void test("the day's pick asks each candidate's best first: one not held is passed over unjudged, DAY_SKIPS of them at most", () => {
  const rows = Array.from({ length: DAY_SKIPS + 3 }, (_, i) => ({ id: `${A}/d${i}/v1`, slot: `${A}/d${i}` }));
  const born = new Map(rows.map((h) => [h.slot, true])), last = rows[DAY_SKIPS - 1], beyond = rows[DAY_SKIPS];
  // no verdict for any of the unheld: none was judged
  const one = (h: (typeof rows)[number]) => new Map(rows.map((r) => [r.id, r === h])), ok = (h: (typeof rows)[number]) => new Map([[h.id, { ok: true as const }]]);
  assert.equal(dayHole(rows, born, ok(last), one(last)).day?.id, last.id, "the last one within DAY_SKIPS");
  assert.deepEqual(dayHole(rows, born, ok(beyond), one(beyond)), { day: null, unread: false, done: true }, "one past them: none today, and done (no page more read)");
  assert.deepEqual(dayHole(rows, born, new Map(), one(rows[2])), { day: null, unread: false, need: { what: "verdict", h: rows[2] } }, "held, its verdict not in yet: the day waits");
});

void test("the day's pick is kept in this browser for its UTC day, by chain; a kept one not of a hole's shape is none", async () => {
  const chain = chainOf({}), other = chainOf({}, "test"), day = Date.UTC(2026, 9, 7, 9), row = { ...listed("x"), id: `${A}/x/v1`, slot: `${A}/x`, born: 10 };
  assert.equal(await keptDay(chain, day), null);
  await keepDay(chain, day, row);
  assert.deepEqual(await keptDay(chain, day + 10 * 3600e3), row, "the same day, later");
  assert.equal(await keptDay(chain, day + 24 * 3600e3), null, "the next day: picked afresh");
  assert.equal(await keptDay(other, day), null, "another chain's");
  localStorage.setItem(`gnogolf.day|${VERDICT_RULES}|dev|G1|gno.land/r/gnogolf/golf/v2|2026-10-07`, JSON.stringify({ id: "garden/1/v1" }));
  assert.equal(await keptDay(chain, day), null, "not a community hole's row");
});

// The review's (2026-10-22): a best at the chain's first block counts; the author sees their own listed.
void test("heldBefore: a best at block 0 (the chain's first) is a best held before the day", async () => {
  const day = Date.UTC(2026, 9, 7);
  const chain = {
    ghost: (id: string, mode: string, player: string) => Promise.resolve(mode === "pro" ? { version: 1, hole: id, mode: "pro" as const, player, height: 0, strokes: 3, period: 1, shots: "0,1" } : null),
    blockTime: (h: number) => Promise.resolve(h === 0 ? day - 864e5 : day + 1),
    realm: "r", chainId: () => Promise.resolve("dev"), genesis: () => Promise.resolve("G"),
  };
  assert.equal(await heldBefore(chain, `${A}/x/v1`, day), true);
});

void test("the community list shows the author their own hole before they hold a best on it, and no one else", async () => {
  const chain = chainOf({ [`${A}/good/v1`]: goodHex }, "dev", "G1", () => false), rows = [rowOf(`${A}/good/v1`)];
  const verdicts = new Map([[rows[0].id, await verdictOf(chain, rows[0].id, deps)]]);
  const page = async (me: string | null) => pageOf(rows, 10, verdicts, new Map([[rows[0].id, await heldFor(chain, rows[0].id, me)]])).rows.length;
  assert.equal(await page(A), 1, "its author's account");
  assert.equal(await page("g1" + "c".repeat(38)), 0, "another's");
});
