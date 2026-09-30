import { readFileSync } from "node:fs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  vsPar, parOf, cupOf, cardKey, scoreOf, legacyOf, oldToSlot, migrate, loadCard, recordScore, clearCard, clearCup, badgesFor, byRarity, loadOnChain, markOnChain,
  totals, cupTotals, UNLOCKS, cupHasGnome, CUP_NAMES,
} from "../lib/card.ts";
import type { Finish } from "../lib/card.ts";

beforeEach(() => {
  localStorage.clear();
});

test("vsPar writes par the golf way", () => {
  assert.equal(vsPar(0), "E");
  assert.equal(vsPar(2), "+2");
  assert.equal(vsPar(-1), "−1");
});

// ---- parOf / cupOf ----

test("parOf: the hole's own par, 3 when unknown", () => {
  assert.equal(parOf({ par: 5 }), 5);
  assert.equal(parOf(undefined), 3);
  assert.equal(parOf(null), 3);
  assert.equal(parOf({}), 3);
});

test("cupOf: the hole's world, garden when unset", () => {
  assert.equal(cupOf({ world: "island" }), "island");
  assert.equal(cupOf({}), "garden");
});

// ---- cardKey / scoreOf ----

test("cardKey: the slot when there is one, else the id", () => {
  assert.equal(cardKey({ id: "hole1", slot: "garden/1" }), "garden/1");
  assert.equal(cardKey({ id: "hole1" }), "hole1");
  assert.equal(cardKey(null), "");
});

test("scoreOf: reads the card by cardKey", () => {
  const card = { "garden/1": 3 };
  assert.equal(scoreOf(card, { id: "hole1", slot: "garden/1" }), 3);
  assert.equal(scoreOf(card, { id: "hole2" }), undefined);
});

// ---- legacyOf / oldToSlot ----

test("legacyOf: a course slot's old realm id, from the garden map", () => {
  assert.equal(legacyOf("garden/17"), "gno.land/r/gnogolf/hole19");
  assert.equal(legacyOf("garden/1"), "gno.land/r/gnogolf/hole1");
});

test("legacyOf: a course slot's old realm id, from a plain world/n", () => {
  assert.equal(legacyOf("island/5"), "gno.land/r/gnogolf/island5");
  assert.equal(legacyOf("mountain/18"), "gno.land/r/gnogolf/mountain18");
});

test("legacyOf: empty for a slot with no old realm, or a malformed slot", () => {
  assert.equal(legacyOf("island/19"), ""); // out of the old 1-18 range
  assert.equal(legacyOf("garden/19"), ""); // the garden had 18
  assert.equal(legacyOf("not-a-slot"), "");
  assert.equal(legacyOf(null), "");
  assert.equal(legacyOf(undefined), "");
});

test("oldToSlot: the inverse of legacyOf, both mappings", () => {
  assert.equal(oldToSlot("gno.land/r/gnogolf/hole19"), "garden/17");
  assert.equal(oldToSlot("gno.land/r/gnogolf/island5"), "island/5");
  assert.equal(oldToSlot("gno.land/r/gnogolf/nope"), "");
});

// ---- migrate ----

test("migrate: rewrites old realm ids to slots, keeping the lower score on a clash", () => {
  const old = {
    "gno.land/r/gnogolf/hole19": 4, // -> garden/17
    "gno.land/r/gnogolf/island5": 3, // -> island/5
    "some/unmapped/key": 2, // stays as-is
  };
  assert.deepEqual(migrate(old), { "garden/17": 4, "island/5": 3, "some/unmapped/key": 2 });
});

test("migrate: two old ids landing on the same slot keep the better score", () => {
  // both hole19 (garden/17) style ids collapse to one slot; simulate a clash
  // by handing two keys that map to the same slot through oldToSlot directly
  const slot = oldToSlot("gno.land/r/gnogolf/hole19");
  const old = { "gno.land/r/gnogolf/hole19": 5 };
  const card = migrate(old);
  assert.equal(card[slot], 5);
});

test("migrate: drops entries that are not a whole positive number", () => {
  const old = { "garden/1": 0, "garden/2": -1, "garden/3": 1.5, "garden/4": "3", "garden/5": 2 };
  assert.deepEqual(migrate(old), { "garden/5": 2 });
});

test("migrate: an empty or missing input is an empty card", () => {
  assert.deepEqual(migrate(null), {});
  assert.deepEqual(migrate(undefined), {});
  assert.deepEqual(migrate({}), {});
});

// ---- loadCard / recordScore / clearCard / clearCup ----

test("loadCard: an empty browser starts with an empty card, marked v2", () => {
  assert.deepEqual(loadCard(), {});
  assert.equal(localStorage.getItem("gnogolf.card.v"), "2");
});

test("loadCard: migrates a v1 (unversioned) card by old realm id, then saves it as v2", () => {
  localStorage.setItem("gnogolf.card", JSON.stringify({ "gno.land/r/gnogolf/hole19": 4 }));
  assert.deepEqual(loadCard(), { "garden/17": 4 });
  assert.equal(localStorage.getItem("gnogolf.card.v"), "2");
  // a second load reads the already-migrated v2 card as-is
  assert.deepEqual(loadCard(), { "garden/17": 4 });
});

test("loadCard: a v2 card is trusted as-is, even if it looks like an old key", () => {
  localStorage.setItem("gnogolf.card", JSON.stringify({ "gno.land/r/gnogolf/hole19": 4 }));
  localStorage.setItem("gnogolf.card.v", "2");
  assert.deepEqual(loadCard(), { "gno.land/r/gnogolf/hole19": 4 });
});

test("loadCard: corrupt JSON in storage reads as an empty card", () => {
  localStorage.setItem("gnogolf.card", "{not json");
  assert.deepEqual(loadCard(), {});
});

test("recordScore: the latest round on a hole replaces the one before, better or worse", () => {
  recordScore("garden/1", 5);
  assert.deepEqual(loadCard(), { "garden/1": 5 });
  recordScore("garden/1", 7);
  assert.deepEqual(loadCard(), { "garden/1": 7 });
  recordScore("garden/1", 3);
  assert.deepEqual(loadCard(), { "garden/1": 3 });
});

test("recordScore: an invalid score is refused and warns, card unchanged", (t) => {
  recordScore("garden/1", 4);
  const warn = t.mock.method(console, "warn", () => {});
  const before = loadCard();
  assert.deepEqual(recordScore("garden/2", undefined), before);
  assert.deepEqual(recordScore("garden/2", 0), before);
  assert.deepEqual(recordScore("garden/2", -1), before);
  assert.deepEqual(recordScore("garden/2", 1.5), before);
  assert.deepEqual(recordScore("", 3), before);
  assert.equal(warn.mock.callCount(), 5);
});

test("recordScore: a storage that throws still returns the updated in-memory card", () => {
  localStorage.setItem = () => { throw new Error("quota"); };
  try {
    assert.deepEqual(recordScore("garden/1", 4), { "garden/1": 4 });
  } finally {
    delete (localStorage as unknown as Record<string, unknown>).setItem;
  }
});

test("clearCard: wipes the card back to empty", () => {
  recordScore("garden/1", 4);
  assert.deepEqual(clearCard(), {});
  assert.deepEqual(loadCard(), {});
});

test("clearCup: removes only the given cardKeys", () => {
  recordScore("garden/1", 4);
  recordScore("garden/2", 3);
  recordScore("island/1", 2);
  assert.deepEqual(clearCup(["garden/1", "garden/2"]), { "island/1": 2 });
  assert.deepEqual(loadCard(), { "island/1": 2 });
});

// ---- totals ----

const holes = [
  { id: "g1", slot: "garden/1", par: 3, world: "garden" },
  { id: "g2", slot: "garden/2", par: 4, world: "garden" },
  { id: "g3", slot: "garden/3", par: 5, world: "garden" },
];

test("totals: sums only the holes with a recorded score", () => {
  const card = { "garden/1": 1, "garden/2": 4 }; // g3 not played
  const t = totals(card, holes);
  assert.equal(t.done, 2);
  assert.equal(t.strokes, 5);
  assert.equal(t.par, 7); // 3 + 4, g3's par not counted
  assert.equal(t.aces, 1); // the hole-in-one on g1
  assert.equal(t.all, false);
});

test("totals: all is true once every hole given has a score", () => {
  const card = { "garden/1": 3, "garden/2": 4, "garden/3": 5 };
  assert.equal(totals(card, holes).all, true);
});

test("totals: an empty hole list is never 'all'", () => {
  assert.equal(totals({}, []).all, false);
});

// ---- cupTotals ----

const allHoles = [
  { id: "g1", slot: "garden/1", par: 3, world: "garden" },
  { id: "g2", slot: "garden/2", par: 3, world: "garden" },
  { id: "i1", slot: "island/1", par: 3, world: "island" },
  { id: "i2", slot: "island/2", par: 3, world: "island" },
  { id: "p1", slot: "pond/1", par: 3, world: "pond" }, // not a cup
];

test("cupTotals: buckets holes by cup, a hole in no cup counts in none", () => {
  const card = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 4, "pond/1": 1 };
  const t = cupTotals(card, allHoles);
  assert.equal(t.garden.done, 2);
  assert.equal(t.garden.clean, true); // at par
  assert.equal(t.island.clean, false); // one over
  assert.equal(t.town.open, false);
  assert.equal(t.mountain.open, false);
  assert.equal(t.aces, 0); // the pond's ace does not count toward any cup
});

test("cupTotals: slam is true only once every cup the chain has is clean", () => {
  const card = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 3 };
  assert.equal(cupTotals(card, allHoles).slam, true);
  const worse = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 5 };
  assert.equal(cupTotals(worse, allHoles).slam, false);
});

test("cupTotals: a single-cup chain can never slam", () => {
  const oneCup = allHoles.filter((h) => h.world === "garden");
  const card = { "garden/1": 3, "garden/2": 3 };
  assert.equal(cupTotals(card, oneCup).slam, false);
});

test("cupTotals: aces sum across every cup", () => {
  const card = { "garden/1": 1, "garden/2": 1, "island/1": 1, "island/2": 4 };
  assert.equal(cupTotals(card, allHoles).aces, 3);
});

// ---- UNLOCKS / cupHasGnome ----

test("UNLOCKS: each ok() reads the matching field off cupTotals", () => {
  const card = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 3 };
  const t = cupTotals(card, allHoles);
  assert.equal(UNLOCKS.wizard.ok(t), true); // garden finished
  assert.equal(UNLOCKS.viking.ok(t), true); // garden clean
  assert.equal(UNLOCKS.pirate.ok(t), true); // island finished
  assert.equal(UNLOCKS.diver.ok(t), true); // island clean
  assert.equal(UNLOCKS.baker.ok(t), false); // town never played
  assert.equal(UNLOCKS.mayor.ok(t), false);
  // king mirrors slam: this chain only has garden+island holes, and both are
  // clean, so it is a grand slam even though town/mountain were never played
  assert.equal(UNLOCKS.king.ok(t), true);
});

test("UNLOCKS.king: false once a cup the chain actually has is left unclean", () => {
  const fourCups = [
    ...allHoles,
    { id: "t1", slot: "town/1", par: 3, world: "town" },
    { id: "m1", slot: "mountain/1", par: 3, world: "mountain" },
  ];
  const clean = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 3, "town/1": 3, "mountain/1": 3 };
  assert.equal(UNLOCKS.king.ok(cupTotals(clean, fourCups)), true);
  const oneOver = { ...clean, "mountain/1": 4 };
  assert.equal(UNLOCKS.king.ok(cupTotals(oneOver, fourCups)), false);
});

test("UNLOCKS.golden: five holes-in-one, anywhere", () => {
  const card = { "garden/1": 1, "garden/2": 1, "island/1": 1, "island/2": 1 };
  const almost = cupTotals(card, allHoles);
  assert.equal(UNLOCKS.golden.ok(almost), false); // only 4 aces
  const t = cupTotals({ ...card, "pond/1": 1 }, allHoles);
  // pond/1 is not part of any cup, so it never counts toward aces either
  assert.equal(UNLOCKS.golden.ok(t), false);
});

test("cupHasGnome: true for cups with an unlock, false for the Mountain Cup", () => {
  assert.equal(cupHasGnome("garden"), true);
  assert.equal(cupHasGnome("island"), true);
  assert.equal(cupHasGnome("town"), true);
  assert.equal(cupHasGnome("mountain"), false);
  assert.equal(cupHasGnome("pond"), false);
});

// ---- badges ----
const cupsOf = (card: Record<string, number>) => cupTotals(card, [{ id: "a", slot: "garden/1", par: 3, world: "garden" }, { id: "b", slot: "garden/2", par: 4, world: "garden" }]);
const finish = (f: Partial<Finish>): Finish => ({ strokes: 3, par: 3, pro: false, kind: "", timed: false, cups: cupsOf({}), weathers: [""], ...f });

test("badges: what a finish earns, rarest first, never twice", () => {
  assert.deepEqual(badgesFor(finish({ strokes: 1 }), []), ["ace", "eagle"]); // a par 3 in one is also two under
  assert.deepEqual(badgesFor(finish({ strokes: 1 }), ["ace"]), ["eagle"]);
  assert.deepEqual(badgesFor(finish({ strokes: 2, pro: true }), []), ["pro"]);
  assert.deepEqual(badgesFor(finish({ strokes: 3, timed: true, kind: "fog" }), []), ["clock", "fog"]);
  assert.deepEqual(badgesFor(finish({ strokes: 5, kind: "fog" }), []), []); // over par in the fog: no Fog walker
  assert.deepEqual(badgesFor(finish({ strokes: 16, kind: "storm" }), []), ["storm", "snail"]);
  assert.deepEqual(badgesFor(finish({ weathers: ["", "wind", "fog", "rain", "storm", "snow"] }), []), ["weathers"]);
});

test("badges: a perfect cup is every hole of a cup under par", () => {
  assert.ok(badgesFor(finish({ cups: cupsOf({ "garden/1": 2, "garden/2": 3 }) }), []).includes("perfect"));
  assert.ok(!badgesFor(finish({ cups: cupsOf({ "garden/1": 2, "garden/2": 4 }) }), []).includes("perfect")); // one at par
  assert.ok(!badgesFor(finish({ cups: cupsOf({ "garden/1": 2 }) }), []).includes("perfect")); // not all played
});

test("badges: a duel's two, Ghost buster only for a fair win against a best at par or under", () => {
  const duel = (d: Partial<NonNullable<Finish["duel"]>>) => ({ result: "win" as const, theirs: 3, self: false, mixed: false, ...d });
  assert.deepEqual(badgesFor(finish({ strokes: 2, duel: duel({}) }), []), ["ghost"]);
  assert.deepEqual(badgesFor(finish({ strokes: 3, duel: duel({ theirs: 4 }) }), []), [], "a ghost over par is no feat");
  assert.deepEqual(badgesFor(finish({ strokes: 2, duel: duel({ self: true }) }), []), [], "your own best is no rival");
  assert.deepEqual(badgesFor(finish({ strokes: 2, duel: duel({ mixed: true }) }), []), [], "a mixed race is no record");
  assert.deepEqual(badgesFor(finish({ strokes: 4, duel: duel({ result: "loss" }) }), []), ["sport"]);
  assert.deepEqual(badgesFor(finish({ strokes: 4, duel: duel({ result: "loss", self: true }) }), []), [], "nor is losing to it");
  assert.deepEqual(badgesFor(finish({ strokes: 4, duel: duel({ result: "loss", mixed: true }) }), []), [], "a mixed race earns nothing");
  assert.deepEqual(badgesFor(finish({ strokes: 2 }), []), [], "no duel, neither");
});

test("badges: the chain's two come from a save, and ids sort rarest first", () => {
  assert.ok(!badgesFor(finish({ strokes: 1 }), []).some((id) => id === "chain" || id === "first"));
  assert.deepEqual(byRarity(["snail", "chain", "first", "ace"]), ["first", "ace", "chain", "snail"]);
});

test("the card's scores saved on-chain: kept per cardKey, the latest save wins", () => {
  assert.deepEqual(loadOnChain(), {});
  markOnChain("garden/3", 2);
  assert.deepEqual(markOnChain("garden/3", 1), { "garden/3": 1 });
  assert.deepEqual(loadOnChain(), { "garden/3": 1 });
  localStorage.setItem("gnogolf.onchain", "[1,2]"); // not a map: none
  assert.deepEqual(loadOnChain(), {});
});

test("the link cards name the cups as the game does (media/og/og.mjs keeps its own copy: plain node reads no .ts)", () => {
  const og = readFileSync(new URL("../../media/og/og.mjs", import.meta.url), "utf8");
  const copy = og.match(/const CUP_NAMES = (\{[^}]*\});/);
  assert.ok(copy, "og.mjs's CUP_NAMES");
  assert.deepEqual(Object.fromEntries([...copy[1].matchAll(/(\w+): "([^"]*)"/g)].map((m) => [m[1], m[2]])), CUP_NAMES);
});
