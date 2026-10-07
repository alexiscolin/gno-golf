// An author's rewards after publishing (lib/builder/rewards.ts, the
// game-design review's #8): each published hole's players, plays and best
// against the author's own, a dot for what is new since the author last
// looked (kept in this browser), the Builder's badges from the chain's own
// records, and the author's test round saved as the hole's first record.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  BUILDER_BADGES, earnedBadges, factsOf, heldWeathers, isFresh, keepSeen, loadSeen, nextRound, readRewards, roundNow, SEEN_KEY, statsLine, statsOf, testRounds, versusLine,
} from "../lib/builder/rewards.ts";
import type { Proof } from "../lib/builder/proof.ts";
import { required } from "../lib/builder/rules.ts";
import { skyOf } from "../lib/sky.ts";
import type { HoleRow, Saved } from "../lib/types.ts";

const ME = "g1" + "m".repeat(38), P1 = "g1" + "a".repeat(38), P2 = "g1" + "b".repeat(38), P3 = "g1" + "c".repeat(38);
const ID = `${ME}/dogleg/v1`, ID2 = `${ME}/sand/v2`;
const saved = (player: string, strokes: number, o: Partial<Saved> = {}): Saved => ({ id: ID, mode: "assisted", player, strokes, period: 1, ...o });
const none = new Set<string>();
beforeEach(() => localStorage.clear());

void test("statsOf: distinct players (never the author), the plays, the best, the author's own and how many beat it", () => {
  const rows = [saved(P1, 2), saved(P1, 3, { mode: "pro" }), saved(P2, 4), saved(ME, 3), saved(ME, 5, { mode: "pro" }), saved(P3, 1, { id: ID2 })];
  assert.deepEqual(statsOf({ id: ID, plays: 9 }, { rows, more: none }, ME), { players: 2, more: false, plays: 9, best: 2, mine: 3, beat: 1 });
  // a player's best of either mode counts once; a hole with more rounds than one read takes is said so
  assert.equal(statsOf({ id: ID2, plays: 1 }, { rows, more: new Set([ID2]) }, ME).more, true);
  assert.deepEqual(statsOf({ id: "g1x/none/v1", plays: 0 }, { rows, more: none }, ME), { players: 0, more: false, plays: 0, best: 0, mine: 0, beat: 0 });
});

void test("statsLine and versusLine: the numbers in plain words", () => {
  const s = { players: 0, more: false, plays: 0, best: 0, mine: 0, beat: 0 };
  assert.equal(statsLine(s), "Nobody has played it yet");
  assert.equal(statsLine({ ...s, plays: 1 }), "1 play · no round saved yet");
  assert.equal(statsLine({ ...s, players: 1, plays: 3 }), "1 player · 3 plays");
  assert.equal(statsLine({ ...s, players: 100, more: true, plays: 400 }), "100+ players · 400 plays");
  assert.equal(versusLine(s), "");
  assert.equal(versusLine({ ...s, best: 2 }), "Best 2 · none of yours saved");
  assert.equal(versusLine({ ...s, players: 1, best: 3, mine: 3 }), "Best 3 · yours 3 · nobody beat you yet");
  assert.equal(versusLine({ ...s, players: 3, best: 2, mine: 4, beat: 2 }), "Best 2 · yours 4 · 2 players beat you");
  assert.equal(versusLine({ ...s, players: 3, best: 2, mine: 4, beat: 1 }), "Best 2 · yours 4 · 1 player beat you");
});

/** A period at or after from whose weather on id is kind. */
const periodOf = (id: string, world: string, kind: string, from = 1) => {
  for (let p = from; p < from + 10_000; p++) if (skyOf(id, world, p) === kind) return p;
  throw new Error(`no ${kind}`);
};

void test("heldWeathers: the weathers the hole was holed in, rounds saved by players other than its author", () => {
  const kinds = required("garden");
  const all = kinds.map((k, i) => saved([P1, P2, P3][i % 3], 3, { period: periodOf(ID, "garden", k) }));
  assert.deepEqual(heldWeathers({ id: ID, world: "garden" }, all, ME), kinds);
  // the author's own rounds never count; nor another hole's
  const mine = all.map((r, i) => (i === 0 ? { ...r, player: ME } : r));
  assert.deepEqual(heldWeathers({ id: ID, world: "garden" }, mine, ME), kinds.slice(1));
  assert.deepEqual(heldWeathers({ id: ID2, world: "garden" }, all, ME), []);
});

void test("factsOf and the badges: published, distinct players over every hole, a hole holed in every weather", () => {
  assert.deepEqual(earnedBadges(factsOf([], { rows: [], more: none }, ME)), []);
  const rows = [saved(P1, 2), saved(P2, 2, { id: ID2 }), saved(P1, 3, { id: ID2 }), saved(ME, 2)];
  const f = factsOf([{ id: ID, world: "garden" }, { id: ID2, world: "garden" }], { rows, more: none }, ME);
  assert.deepEqual(f, { published: 2, players: 2, weathers: false });
  assert.deepEqual(earnedBadges(f), ["published", "players1"]);
  assert.deepEqual(earnedBadges({ published: 1, players: 50, weathers: true }), BUILDER_BADGES.map((b) => b.id));
  assert.deepEqual(earnedBadges({ published: 1, players: 49, weathers: false }), ["published", "players1", "players10"]);
  // a hole with more rounds than one read takes: at least that many players
  assert.equal(factsOf([{ id: ID, world: "garden" }], { rows: [saved(P1, 2)], more: new Set([ID]) }, ME).players, 100);
  const every = required("garden").map((k, i) => saved([P1, P2, P3][i % 3], 3, { period: periodOf(ID, "garden", k) }));
  assert.equal(factsOf([{ id: ID, world: "garden" }], { rows: every, more: none }, ME).weathers, true);
  for (const b of BUILDER_BADGES) assert.ok(b.name && b.need && !/[.]$/.test(b.need), b.id);
});

void test("the dot: new plays or players since the author's last visit, kept in this browser", () => {
  assert.deepEqual(loadSeen(), {});
  const s = { plays: 3, players: 1 };
  assert.equal(isFresh(ID, s, {}), true, "never seen, played: new");
  assert.equal(isFresh(ID, { plays: 0, players: 0 }, {}), false, "never played: nothing new");
  keepSeen({ [ID]: s });
  assert.deepEqual(loadSeen(), { [ID]: s });
  assert.equal(isFresh(ID, s, loadSeen()), false);
  assert.equal(isFresh(ID, { plays: 4, players: 1 }, loadSeen()), true);
  assert.equal(isFresh(ID, { plays: 3, players: 2 }, loadSeen()), true);
  // what the browser keeps that is not the shape: nothing seen
  localStorage.setItem(SEEN_KEY, JSON.stringify({ [ID]: { plays: "3" }, x: 1 }));
  assert.deepEqual(loadSeen(), {});
  localStorage.setItem(SEEN_KEY, "{not json");
  assert.deepEqual(loadSeen(), {});
  // a browser that keeps nothing: nothing seen, nothing thrown
  const was = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("denied"); } });
  try {
    assert.deepEqual(loadSeen(), {});
    assert.doesNotThrow(() => keepSeen({ [ID]: s }));
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: was, writable: true });
  }
});

const proof = (kind: string, strokes: number, o: Partial<Proof> = {}): Proof => ({ key: "k", id: ID, kind, period: 1, shots: Array.from({ length: strokes }, () => "0.0000,1.0000,0"), commits: [[0, strokes]], strokes, maxWork: 0, ...o });

void test("testRounds: the author's rounds of that version, one a weather, the fewest strokes", () => {
  const list = [proof("", 3), proof("", 2), proof("wind", 4), proof("rain", 2, { id: `${ME}/dogleg/v2` })];
  assert.deepEqual(testRounds(list, ID).map((p) => [p.kind, p.strokes]), [["", 2], ["wind", 4]]);
});

/** A period whose weather is kind, and the one before it before. */
const pairOf = (id: string, kind: string, before: (k: string) => boolean) => {
  for (let p = 2; p < 10_000; p++) if (skyOf(id, "garden", p) === kind && before(skyOf(id, "garden", p - 1))) return p;
  throw new Error(`no ${kind}`);
};

void test("roundNow and nextRound: the test round the weather of the moment replays, else when one comes back", () => {
  const clear = periodOf(ID, "garden", ""), wind = periodOf(ID, "garden", "wind");
  const list = [proof("", 2), proof("wind", 3)];
  assert.deepEqual(roundNow(list, ID, "garden", clear), { proof: list[0], period: clear });
  assert.deepEqual(roundNow(list, ID, "garden", wind), { proof: list[1], period: wind });
  // the moment's weather has none: the period just gone's
  const turned = pairOf(ID, "rain", (k) => k === "");
  assert.deepEqual(roundNow(list, ID, "garden", turned), { proof: list[0], period: turned - 1 });
  // neither: none now, and the next period in a weather of one
  const dry = pairOf(ID, "", (k) => k !== "rain"), wet = [proof("rain", 2)];
  assert.equal(roundNow(wet, ID, "garden", dry), null);
  assert.equal(nextRound(wet, ID, "garden", dry), periodOf(ID, "garden", "rain", dry + 1));
  assert.equal(nextRound([], ID, "garden", dry), null);
  assert.equal(roundNow([], ID, "garden", dry), null);
});

void test("readRewards: the author's holes (none taken down, nor anyone else's), the rounds on them a dozen holes a read", async () => {
  const row = (slug: string, by = ME): HoleRow => ({ id: `${by}/${slug}/v1`, name: slug, official: false, plays: 1, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "", slot: `${by}/${slug}` });
  const mine = Array.from({ length: 14 }, (_, i) => row(`h${i}`));
  const asked: string[][] = [];
  const chain = {
    holesOf: (a: string) => Promise.resolve(a === ME ? [...mine, row("gone"), row("theirs", P1)] : []),
    savedOn: (ids: readonly string[]) => (asked.push([...ids]), Promise.resolve({ rows: [saved(P1, 2, { id: ids[0] })], more: new Set([ids[0]]) })),
  };
  const got = await readRewards(chain, ME, new Set([`${ME}/gone`]));
  assert.deepEqual(got.rows.map((r) => r.slot), mine.map((r) => r.slot));
  assert.deepEqual(asked.map((a) => a.length), [12, 2]);
  assert.deepEqual(got.saved.rows.map((r) => r.id), [mine[0].id, mine[12].id]);
  assert.deepEqual([...got.saved.more], [mine[0].id, mine[12].id]);
});
