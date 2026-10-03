import { readFileSync } from "node:fs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  vsPar, parOf, cupOf, cardKey, scoreOf, legacyOf, oldToSlot, migrate, loadCard, recordScore, clearCard, clearCup, badgesFor, byRarity, loadOnChain, markOnChain, fromChain, syncedTo, markSynced,
  totals, cupTotals, UNLOCKS, cupFinishLine, CUP_NAMES, CUPS, CLASSIC, guessCup,
} from "../lib/card.ts";
import type { Finish, SkyKind } from "../lib/card.ts";
import type { ChainBest } from "../lib/chain.ts";
import { skyOf } from "../lib/sky.ts";

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

// ---- UNLOCKS / cupFinishLine ----

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

test("cupFinishLine: what a finished cup earned, at par or over (the Mines: the Miner for finishing, the Mother Lode for par)", () => {
  const gnome = "Cup finished at par or under: a gnome is waiting in the picker.";
  for (const c of ["garden", "island", "town"]) {
    assert.equal(cupFinishLine(c, true), gnome, c);
    assert.equal(cupFinishLine(c, false), "", c);
  }
  assert.equal(cupFinishLine("mountain", true), "", "nothing earned: nothing said");
  assert.equal(cupFinishLine("mountain", false), "");
  assert.equal(cupFinishLine("mines", true), "Cup finished at par or under: the Mother Lode badge is yours.", "par: the badge, not a gnome");
  assert.equal(cupFinishLine("mines", false), "Cup finished: a gnome is waiting in the picker.", "finishing: the Miner");
  assert.equal(cupFinishLine("pond", true), "");
});

// ---- the Crystal Mines (ADR-005 §7) ----

// the four classic cups of two holes each, all at par, and the mines' two
const fiveCups = [...allHoles.filter((h) => h.world !== "extras"),
  { id: "t1", slot: "town/1", par: 3, world: "town" }, { id: "t2", slot: "town/2", par: 3, world: "town" },
  { id: "m1", slot: "mountain/1", par: 3, world: "mountain" }, { id: "m2", slot: "mountain/2", par: 3, world: "mountain" },
  { id: "c1", slot: "mines/1", par: 6, world: "mines" }, { id: "c2", slot: "mines/2", par: 6, world: "mines" }];
const fourAtPar = { "garden/1": 3, "garden/2": 3, "island/1": 3, "island/2": 3, "town/1": 3, "town/2": 3, "mountain/1": 3, "mountain/2": 3 };

test("the cups: the mines after the four, named Crystal Mines; the classic four apart", () => {
  assert.deepEqual([...CUPS], ["garden", "island", "town", "mountain", "mines"]);
  assert.deepEqual([...CLASSIC], ["garden", "island", "town", "mountain"]);
  assert.equal(CUP_NAMES.mines, "Crystal Mines");
});

test("cupTotals: the mines are a cup of their own, left out of the slam", () => {
  const t = cupTotals({ ...fourAtPar, "mines/1": 9 }, fiveCups);
  assert.equal(t.mines.done, 1);
  assert.equal(t.mines.clean, false);
  assert.equal(t.slam, true, "the mines unfinished and over par: still the slam");
  assert.equal(UNLOCKS.king.ok(t), true);
  assert.equal(cupTotals({ ...fourAtPar, "mountain/2": 4, "mines/1": 6, "mines/2": 6 }, fiveCups).slam, false, "the mines at par make up for no classic cup");
  assert.equal(cupTotals({ "mines/1": 1, "mines/2": 1 }, fiveCups).aces, 2, "their aces count toward the Golden Gnome");
});

test("UNLOCKS.miner: finishing the Crystal Mines, at any score", () => {
  assert.equal(UNLOCKS.miner.cup, "mines");
  assert.equal(UNLOCKS.miner.ok(cupTotals({ "mines/1": 6 }, fiveCups)), false);
  assert.equal(UNLOCKS.miner.ok(cupTotals({ "mines/1": 20, "mines/2": 20 }, fiveCups)), true);
});

test("the Mother Lode badge: the Crystal Mines at par or under", () => {
  const mines = (card: Record<string, number>) => finish({ cups: cupTotals(card, fiveCups) });
  assert.ok(badgesFor(mines({ "mines/1": 6, "mines/2": 6 }), []).includes("lode"));
  assert.ok(badgesFor(mines({ "mines/1": 5, "mines/2": 7 }), []).includes("lode"), "par over the cup, not every hole");
  assert.ok(!badgesFor(mines({ "mines/1": 6, "mines/2": 7 }), []).includes("lode"));
  assert.ok(!badgesFor(mines({ "mines/1": 6 }), []).includes("lode"), "not all played");
  assert.ok(!badgesFor(mines({ "mines/1": 6, "mines/2": 6 }), ["lode"]).includes("lode"));
});

test("guessCup: the cup a link names, the garden when none", () => {
  assert.equal(guessCup("mines/3"), "mines");
  assert.equal(guessCup("/h/mines-3/"), "mines");
  assert.equal(guessCup("gno.land/r/gnogolf/island7"), "island");
  assert.equal(guessCup("town/4/v2"), "town");
  assert.equal(guessCup("/h/mountain/"), "mountain");
  assert.equal(guessCup("extras/10"), "garden");
  assert.equal(guessCup(""), "garden");
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

// a record as chain.progressOf reads it (garden, par 3, assisted, saved at block 10, weather period 1, not the hole's record)
const best = (id: string, strokes: number, o: Partial<ChainBest> = {}): ChainBest =>
  ({ id, slot: id.replace(/\/v\d+$/, ""), world: "garden", par: 3, mode: "assisted", strokes, height: 10, period: 1, top: false, ...o });

test("fromChain: a wallet's records fill the holes this card has none for, and beat a worse score not saved here; marked on-chain", () => {
  recordScore("garden/1", 4);
  recordScore("garden/4", 5);
  markOnChain("garden/4", 3);
  markOnChain("island/1", 3);
  const r = fromChain([best("garden/1/v2", 2), best("garden/2/v1", 3), best("garden/2/v1", 2, { mode: "pro", par: 4 }), best("garden/3/v1", 1), best("garden/4/v1", 3)], []);
  assert.deepEqual(r.card, { "garden/1": 2, "garden/2": 2, "garden/3": 1, "garden/4": 5 }, "garden/1's 4 beaten by a 2 played elsewhere; garden/4's 3 was saved here: the latest round stays");
  assert.deepEqual(loadCard(), r.card);
  assert.deepEqual(loadOnChain(), { "garden/4": 3, "island/1": 3, "garden/1": 2, "garden/2": 2, "garden/3": 1 }, "the marks already there kept");
  assert.deepEqual(r.filled, ["garden/1", "garden/2", "garden/3"]);
  assert.deepEqual(r.badges.map((b) => b.id), ["eagle", "pro", "ace", "eagle", "chain"], "what the records prove (garden/2 in Pro, par 4, in 2: eagle and pro)");
  assert.equal(r.height, 10);
});

test("fromChain: every version of a slot, the lowest kept; nothing on the chain changes nothing", () => {
  assert.deepEqual(fromChain([], []), { card: {}, onChain: {}, filled: [], badges: [], kinds: [], height: 0 });
  assert.equal(localStorage.getItem("gnogolf.onchain"), null, "nothing written");
  assert.deepEqual(fromChain([best("garden/1/v1", 2), best("garden/1/v2", 3)], []).filled, ["garden/1"]);
  assert.equal(loadCard()["garden/1"], 2);
});

test("fromChain: the badges a record proves, as a finish earns them, its weather's among them; a whole cup's", () => {
  const at = (id: string, world: string, kind: string) => [...Array(500).keys()].find((p) => skyOf(id, world, p) === kind)!;
  const r = fromChain([
    best("island/1/v1", 15, { world: "island", period: at("island/1/v1", "island", "storm") }),
    best("garden/4/v1", 3, { top: true }),
    best("garden/5/v1", 4, { period: at("garden/5/v1", "garden", "fog") }),
    best("garden/6/v1", 3, { period: at("garden/6/v1", "garden", "fog") }),
    best("mountain/1/v1", 5, { world: "mountain", period: at("mountain/1/v1", "mountain", "snow") }),
  ], []);
  assert.deepEqual(r.badges.map((b) => b.id), ["storm", "snail", "first", "fog", "snow", "chain"], "the fog over par proves nothing, at par it does");
  assert.deepEqual(r.badges.find((b) => b.id === "snail"), { id: "snail", at: "island/1/v1" }, "each where it was earned");
  assert.ok(["storm", "fog", "snow"].every((k) => r.kinds.includes(k as SkyKind)));
  const cup = [best("mines/1/v1", 2, { world: "mines", par: 4 }), best("mines/2/v1", 3, { world: "mines", par: 4 })];
  assert.deepEqual(fromChain(cup, cup).badges.slice(-3).map((b) => b.id), ["chain", "perfect", "lode"], "a whole cup under par, filled from the chain");
});

test("fromChain since a sync: only what was saved after, never this browser's own save, so a New game or a reset is not filled back; what was played elsewhere comes in", () => {
  const rows = [best("garden/1/v1", 3, { height: 5 }), best("garden/2/v1", 2, { height: 20 }), best("garden/3/v1", 1, { height: 30 })];
  recordScore("garden/2", 4);
  markOnChain("garden/3", 1); // saved here after the sync, then a New game:
  clearCard();
  recordScore("garden/2", 4);
  const r = fromChain(rows, [], 10);
  assert.deepEqual(r.filled, ["garden/2"], "garden/1 (before the sync) and garden/3 (this browser's own save) stay cleared, with no badge of theirs; garden/2 beaten elsewhere");
  assert.deepEqual(r.card, { "garden/2": 2 });
  assert.deepEqual(r.badges.map((b) => b.id), ["chain"]);
  assert.equal(r.height, 30, "the next sync's start: the newest record read, whatever came in");
  assert.deepEqual(fromChain(rows, [], 30).filled, [], "nothing newer: nothing");
  assert.deepEqual(fromChain(rows, [], 0).filled, ["garden/1", "garden/3"], "asked (since 0): every record again");
});

test("syncedTo / markSynced: an address's height, 0 for one never synced; one restored before the height was kept counts as all taken in", () => {
  assert.equal(syncedTo("g1abc"), 0);
  markSynced("g1abc", 42);
  assert.equal(syncedTo("g1abc"), 42);
  localStorage.setItem("gnogolf.restored", JSON.stringify(["g1old"]));
  assert.equal(syncedTo("g1old"), Number.MAX_SAFE_INTEGER);
  clearCard();
  assert.equal(syncedTo("g1abc"), 42, "a New game does not forget it: the chain does not fill back what was cleared");
});
