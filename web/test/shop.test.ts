// lib/gnomes/shop.ts: the gnomes' shop as the screens read it. The realm's
// answers in the shapes r/gnogolf/gnomes writes them (read.gno, buy.gno,
// equip.gno), and every state a screen shows decided from them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  makeShop, soldSet, gnot, landing, utcDate, nowRow, promoOf, promoWords, canBuyCard, showsClosing, closingSlot, theirTitle, whyNot, bill, shelf, teamOrder, shareWords, PAGE, onSale, cardFact, comingLegends, comingFact, waveLine,
  type Collection, type CanBuy,
} from "../lib/gnomes/shop.ts";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";
import { depositFor, feeFor } from "../lib/adena.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const entries = catalogue.gnomes;
const A = "g1" + "a".repeat(38);
const T0 = Date.UTC(2026, 9, 9, 18) / 1000; // Fri 9 Oct 2026, 18:00 UTC

const collection = (o: Partial<Collection> = {}): Collection => ({
  version: 1, open: true, earnedOpen: true, closesAt: Date.UTC(2026, 11, 14, 18) / 1000, owner: A, treasury: A, pendingTreasury: "", site: "", royaltyBps: 500,
  tiers: [
    { name: "common", price: 36e6, cap: 10, playerCap: 3, sold: 0 },
    { name: "rare", price: 72e6, cap: 5, playerCap: 2, sold: 0 },
    { name: "epic", price: 336e6, cap: 2, playerCap: 1, sold: 0 },
    { name: "legendary", price: 1296e6, cap: 1, playerCap: 1, sold: 0 },
  ],
  series: [{ name: "genesis", first: 1, last: 720, sold: 0, closed: false }],
  waves: [{ first: 1, last: 104, start: T0, playersUntil: T0 + 48 * 3600, prices: [36e6, 72e6, 336e6, 1296e6] }],
  ...o,
});
const can = (o: Partial<CanBuy> = {}): CanBuy => ({ version: 1, ok: false, reason: "", said: "", total: 0, left: { common: 10, rare: 5, epic: 2, legendary: 1 }, window: { until: 0, left: { common: 0, rare: 0, epic: 0, legendary: 0 } }, ...o });

// ------------------------------------------------------------ the reads, on the wire
type Asked = { realm: string; expr: string };
function fakeChain(answers: Record<string, unknown>) {
  const asked: Asked[] = [];
  const answer = (realm: string, expr: string) => {
    asked.push({ realm, expr });
    const fn = expr.slice(0, expr.indexOf("("));
    if (!(fn in answers)) throw new Error("not answered: " + expr);
    return answers[fn];
  };
  return {
    asked,
    chain: {
      qjson: <T>(realm: string, expr: string, ok: (v: unknown) => v is T) => {
        const v = answer(realm, expr);
        return ok(v) ? Promise.resolve(v) : Promise.reject(Object.assign(new Error(`The chain's answer to ${expr} is not one this page can read.`), { kind: "chain" }));
      },
      qstr: (realm: string, expr: string) => Promise.resolve(String(answer(realm, expr))),
    },
  };
}

test("shop: each read asks the gnomes' realm once, its arguments quoted, its answer checked", async () => {
  const { chain, asked } = fakeChain({
    Collection: collection(),
    Gnome: { version: 1, id: "94", series: "genesis", name: "Tansy", tier: "epic", traits: "01", owner: "", price: 336e6, sold: false, closed: false },
    Sold: "05",
    GnomesOf: { version: 1, owner: A, total: 1, next: -1, rows: [{ id: "3", tier: "common", traits: "01" }] },
    Worn: "",
    WornMany: { version: 1, rows: [{ player: A, id: "3", name: "Thistle", tier: "common", traits: "01", equipped: false }] },
    CanBuy: can({ ok: true, total: 36e6 }),
    Params: { version: 1, maxHours: 168, maxBatch: 5, denom: "ugnot" },
  });
  const shop = makeShop(chain, "gno.land/r/x/gnogolf/gnomes");
  assert.equal((await shop.collection()).tiers.length, 4);
  assert.equal((await shop.gnome(94))?.name, "Tansy");
  const sold = await shop.sold();
  assert.deepEqual([1, 2, 3, 4].map(sold), [true, false, true, false]);
  assert.equal((await shop.gnomesOf(A)).rows[0].id, "3");
  assert.equal(await shop.worn(A), null);
  assert.equal((await shop.wornMany([A, "nobody", A])).get(A)?.name, "Thistle");
  assert.equal((await shop.canBuy(A, [7])).total, 36e6);
  assert.equal((await shop.params()).maxBatch, 5);
  assert.ok(asked.every((a) => a.realm === "gno.land/r/x/gnogolf/gnomes"));
  assert.deepEqual(asked.map((a) => a.expr), [
    "Collection()", 'Gnome("94")', "Sold()", `GnomesOf(address("${A}"), 0)`, `Worn(address("${A}"))`,
    `WornMany("${A}")`, `CanBuy(address("${A}"), "7")`, "Params()",
  ]);
});

test("shop: nothing is asked for what is not an address or a gnome, and 'none' answers are null", async () => {
  const { chain, asked } = fakeChain({ Gnome: { version: 1, id: "" }, Worn: JSON.stringify({ version: 1, player: A, id: "9", name: "Moss", tier: "common", traits: "01", equipped: true }) });
  const shop = makeShop(chain);
  assert.equal(await shop.gnome(99999), null);
  assert.equal((await shop.worn(A))?.id, "9");
  assert.equal((await shop.gnomesOf("not-an-address")).total, 0);
  assert.equal((await shop.wornMany(["x", "y"])).size, 0);
  await assert.rejects(shop.canBuy("x", [1]), /address/);
  await assert.rejects(shop.gnome(0), /number/);
  assert.equal(asked.length, 2);
});

test("shop: a whole collection is read page by page, until the realm says there is no next", async () => {
  const asked: string[] = [];
  const chain = {
    qjson: <T>(_: string, expr: string, ok: (v: unknown) => v is T) => {
      asked.push(expr);
      const at = Number(/, (\d+)\)$/.exec(expr)![1]);
      const v = { version: 1, owner: A, total: 150, next: at === 0 ? 100 : -1, rows: Array.from({ length: at === 0 ? 100 : 50 }, (_, i) => ({ id: String(at + i + 1), tier: "common", traits: "01" })) };
      return ok(v) ? Promise.resolve(v) : Promise.reject(new Error("shape"));
    },
    qstr: () => Promise.resolve(""),
  };
  const rows = await makeShop(chain).allOf(A);
  assert.equal(rows.length, 150);
  assert.deepEqual(asked, [`GnomesOf(address("${A}"), 0)`, `GnomesOf(address("${A}"), 100)`]);
  assert.deepEqual(await makeShop(chain).allOf("nope"), []);
});

test("shop: an answer of another shape is refused, as the chain's", async () => {
  const { chain } = fakeChain({ Collection: { version: 1, open: "yes" }, GnomesOf: { version: 1, rows: [{ id: 3 }] } });
  const shop = makeShop(chain);
  await assert.rejects(shop.collection(), /not one this page can read/);
  await assert.rejects(shop.gnomesOf(A), /not one this page can read/);
  // the earned gnomes' switch is read too (read.gno Collection's "earnedOpen")
  const { earnedOpen: _, ...noSwitch } = collection();
  await assert.rejects(makeShop(fakeChain({ Collection: noSwitch }).chain).collection(), /not one this page can read/);
});

test("shop: the sold bitmap reads a bit an id, id 1 the lowest bit of the first byte", () => {
  const s = soldSet("8101");
  assert.deepEqual([1, 2, 7, 8, 9, 16, 17].map(s), [true, false, false, true, true, false, false]);
  assert.equal(soldSet("zz")(1), false); // not hex: nothing sold rather than nonsense
});

// ------------------------------------------------------------ words and numbers
test("shop: GNOT exact, thousands apart; typed amounts back to ugnot", () => {
  assert.equal(gnot(30e6), "30");
  assert.equal(gnot(333_330_000), "333.33");
  assert.equal(gnot(1_240e6), "1,240");
  assert.equal(gnot(385_000), "0.385");
  assert.equal(gnot(1), "0.000001");
});

test("shop: a date is a date in UTC, today said as today; never a countdown", () => {
  const closes = Date.UTC(2026, 11, 14, 18) / 1000;
  assert.equal(utcDate(closes, T0), "Mon 14 Dec, 18:00 UTC");
  assert.equal(utcDate(closes, closes - 3600), "today, 18:00 UTC");
  assert.equal(utcDate(T0 + 86400, T0, true), "Sat 18:00 UTC"); // short: within the week
});

// ------------------------------------------------------------ the gallery's "now" row
const isSold = (ids: number[]) => (id: number) => ids.includes(id);
test("shop: the now row follows the sale's life: teaser, players first, open, sold out, paused, closed", () => {
  const c = collection();
  assert.equal(nowRow(c, isSold([]), entries, T0 - 60).at, "teaser");
  const players = nowRow(c, isSold([1, 2]), entries, T0 + 60);
  assert.equal(players.at, "players");
  assert.ok(players.at !== "closed" && players.at !== "none" && players.wave.size === 104 && players.wave.sold === 2 && players.wave.home === "garden" && players.wave.n === 1);
  assert.equal(nowRow(c, isSold([]), entries, T0 + 49 * 3600).at, "open");
  const all = Array.from({ length: 104 }, (_, i) => i + 1);
  assert.equal(nowRow(c, isSold(all), entries, T0 + 49 * 3600).at, "soldout");
  assert.equal(nowRow(collection({ open: false }), isSold([]), entries, T0 + 60).at, "paused");
  const closed = nowRow(collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 486, closed: true }] }), isSold([]), entries, T0);
  assert.deepEqual(closed, { at: "closed", closesAt: Date.UTC(2026, 11, 14, 18) / 1000, made: 486, never: 234 });
  assert.equal(nowRow(collection({ waves: [] }), isSold([]), entries, T0).at, "none");
});

test("shop: the genesis closing closes the genesis alone: a later series' wave sells on (close.gno isClosed)", () => {
  const later = [721, 722, 723].map((id, i) => ({ ...entries[0], id, series: "winter-2027", wave: 8, tier: i === 2 ? ("legendary" as const) : ("common" as const), home: "mountain" as const }));
  const all = [...entries, ...later];
  const prices = [36e6, 72e6, 336e6, 1296e6];
  const c = collection({
    series: [{ name: "genesis", first: 1, last: 720, sold: 486, closed: true }, { name: "winter-2027", first: 721, last: 723, sold: 0, closed: false }],
    waves: [...collection().waves, { first: 721, last: 722, start: T0, playersUntil: T0, prices }, { first: 723, last: 723, start: T0 + 86400 * 30, playersUntil: T0 + 86400 * 30, prices }],
  });
  const now = T0 + 60, none = isSold([]);
  assert.equal(onSale(all.find((e) => e.id === 721)!, c, none, now), true, "the later series' open wave: on sale");
  assert.equal(onSale(entries[4], c, none, now), false, "a genesis gnome never sold: never made");
  const row = nowRow(c, none, all, now);
  assert.ok(row.at === "open" && row.wave.n === 2 && row.wave.size === 2, `the head shows the later series' wave, not "closed": ${row.at}`);
  assert.deepEqual(comingLegends(all, c, now).map((e) => e.id), [723], "the later series' Legendary still to come; none of the genesis");
  // no later wave at all: the sale is closed
  assert.equal(nowRow({ ...c, waves: collection().waves }, none, all, now).at, "closed");
});

test("shop: a later wave is the teaser once the one before is sold out", () => {
  const c = collection({ waves: [...collection().waves, { first: 105, last: 208, start: T0 + 86400 * 3, playersUntil: T0 + 86400 * 4, prices: [36e6, 72e6, 336e6, 1296e6] }] });
  const all = Array.from({ length: 104 }, (_, i) => i + 1);
  const r = nowRow(c, isSold(all), entries, T0 + 86400);
  assert.equal(r.at, "soldout");
  assert.ok(r.at === "soldout" && r.next?.n === 2 && r.next.home === "island");
});

// ------------------------------------------------------------ the collection on the game's screens
test("shop: the promo is the wave to see, its lowest price, its Legendary and three faces; none once closed", () => {
  const c = collection(), open = promoOf(nowRow(c, isSold([1, 2, 3, 4]), entries, T0 + 49 * 3600), c, entries)!;
  assert.equal(open.at, "open");
  assert.deepEqual([open.n, open.home, open.size, open.sold, open.from], [1, "garden", 104, 4, 36e6]);
  assert.ok(open.legendary && open.legendary.id === 104 && open.legendary.price === 1296e6);
  // each face with its own tier, the catalogue's: an Epic, a Rare, a Common of the wave
  assert.deepEqual(open.faces.map((f) => f.tier), ["epic", "rare", "common"]);
  for (const f of open.faces) assert.equal(entries.find((e) => e.id === f.id)?.tier, f.tier);
  assert.deepEqual(promoWords(open, T0 + 49 * 3600), { title: "Wave 1 · the Garden", line: "104 gnomes, from 36 GNOT", state: "4 of 104 found a player" });
  assert.match(promoWords(promoOf(nowRow(c, isSold([]), entries, T0 + 60), c, entries)!, T0 + 60).state, /^Players first until /);
  assert.match(promoWords(promoOf(nowRow(c, isSold([]), entries, T0 - 60), c, entries)!, T0 - 60).state, /^Opens /);
  assert.equal(promoOf(nowRow(collection({ open: false }), isSold([]), entries, T0 + 60), c, entries)!.at, "paused");
  const all = Array.from({ length: 104 }, (_, i) => i + 1);
  assert.equal(promoOf(nowRow(c, isSold(all), entries, T0 + 49 * 3600), c, entries), null, "sold out, no wave after it: nothing to promote");
  assert.equal(promoOf(nowRow(collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 486, closed: true }] }), isSold([]), entries, T0), c, entries), null);
  // a wave without some tiers: its faces are what it holds, each named with its tier (never by its place)
  const commons = entries.filter((e) => e.tier === "common"), onlyCommons = collection({ waves: [{ first: 1, last: 104, start: T0, playersUntil: T0, prices: [36e6, 72e6, 336e6, 1296e6] }] });
  const thin = promoOf(nowRow(onlyCommons, isSold([]), commons, T0 + 60), onlyCommons, commons)!;
  assert.deepEqual(thin.faces.map((f) => f.tier), ["common"]);
  assert.equal(thin.legendary, null);
  assert.equal(thin.from, 36e6, "from: the tiers the wave holds, not the others' prices");
  // no price above 0 in what it holds: no "from" at all (never "from Infinity GNOT", never "from 0")
  const free = collection({ waves: [{ first: 1, last: 104, start: T0, playersUntil: T0, prices: [0, 0, 0, 0] }] });
  const none = promoOf(nowRow(free, isSold([]), entries, T0 + 60), free, entries)!;
  assert.equal(none.from, 0);
  assert.equal(promoWords(none, T0 + 60).line, "104 gnomes");
  // the words never press: no countdown, no "only", no "last"
  for (const p of [open]) for (const w of Object.values(promoWords(p, T0))) assert.doesNotMatch(w, /only|last|hurry|left|invest|value/i);
});

// ------------------------------------------------------------ the closing line
test("shop: no closing line when no closing date is set (a launch may leave it unset), nor once closed", () => {
  assert.equal(showsClosing(collection({ closesAt: 0 })), false);
  assert.equal(showsClosing(collection()), true);
  assert.equal(showsClosing(collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 486, closed: true }] })), false, "closed: the wave panel says it");
});
test("shop: the closing line's room: the line with a date, none without, kept while the sale is not read yet", () => {
  assert.equal(closingSlot(collection()), "line");
  assert.equal(closingSlot(collection({ closesAt: 0 })), "none");
  assert.equal(closingSlot(null), "room", "unknown: the room kept, the line may come");
});

// ------------------------------------------------------------ a player's gnomes
test("shop: a player's gnomes titled by their name, else their short address, never \"Their's\"", () => {
  assert.equal(theirTitle("alice", "g1abcdefghijklmnopqrstuvwxyz0123456789cd"), "alice's gnomes");
  assert.equal(theirTitle("", "g1abcdefghijklmnopqrstuvwxyz0123456789cd"), "g1abcdef…89cd's gnomes");
});

// ------------------------------------------------------------ the gallery as a shop
test("shop: Buy on a card on sale only", () => {
  const c = collection();
  const seen = { c, sold: isSold([2]), mine: new Set([3]), now: T0 + 49 * 3600 };
  assert.equal(canBuyCard(entries[0], seen), true);
  assert.equal(canBuyCard(entries[1], seen), false, "found a player");
  assert.equal(canBuyCard(entries[2], seen), false, "yours");
  assert.equal(canBuyCard(entries[0], { ...seen, now: T0 - 60 }), false, "its wave not open yet");
  assert.equal(canBuyCard(entries.find((e) => e.id > 104)!, seen), false, "no wave of its own yet");
});

// ------------------------------------------------------------ why not, in plain words
test("shop: every refusal CanBuy gives has its words: the button's and a note", () => {
  const c = collection(), until = T0 + 48 * 3600;
  const tansy = { id: 94, tier: "epic" as const, wave: 1, home: "garden" as const };
  const w = (r: CanBuy) => whyNot(r, c, tansy, T0 + 60);
  assert.equal(w(can({ ok: true })), null);
  assert.deepEqual(w(can({ reason: "paused" })), { button: "Paused for a moment", note: "The sale picks up where it stopped." });
  assert.deepEqual(w(can({ reason: "players-only", window: { until, left: { common: 3, rare: 2, epic: 1 } } })), { button: "Players first until Sun 18:00 UTC", note: "Save one round on-chain to buy now.", play: true });
  assert.deepEqual(w(can({ reason: "wave-cap", window: { until, left: { common: 3, rare: 2, epic: 0 } } })), { button: "1 of 1 Epic this wave", note: "Your share until Sun 18:00 UTC. Then open to everyone." });
  assert.deepEqual(w(can({ reason: "cap", left: { common: 10, rare: 5, epic: 0 } })), { button: "2 of 2 Epics", note: "The most one wallet buys." });
  assert.deepEqual(w(can({ reason: "later" })), { button: "Opens today, 18:00 UTC", note: "From Wave 1 · Garden." });
  // two waves to come, published in any order: the date is the gnome's own wave's
  const two = collection({ waves: [{ first: 105, last: 208, start: T0 + 7 * 86400, playersUntil: T0 + 9 * 86400, prices: [36e6, 72e6, 336e6, 1296e6] }, { first: 1, last: 104, start: T0 + 86400, playersUntil: T0 + 3 * 86400, prices: [36e6, 72e6, 336e6, 1296e6] }] });
  assert.equal(whyNot(can({ reason: "later" }), two, { id: 150, tier: "common", wave: 2, home: "island" }, T0)?.button, "Opens Fri 16 Oct, 18:00 UTC");
  assert.equal(whyNot(can({ reason: "later" }), two, tansy, T0)?.button, "Opens Sat 18:00 UTC");
  assert.deepEqual(w(can({ reason: "unlisted" })), { button: "Not on sale yet", note: "From Wave 1 · Garden. A wave not open by Mon 14 Dec, 18:00 UTC never opens." });
  assert.deepEqual(w(can({ reason: "taken" })), { button: "Already found a player", note: "" });
  assert.deepEqual(w(can({ reason: "closed" })), { button: "Never made", note: "The sale closed before this gnome found a player." });
  assert.deepEqual(w(can({ reason: "unknown" })), { button: "No gnome by that number", note: "" });
  // a code this page does not know: the realm's own sentence, never silence
  assert.deepEqual(w(can({ reason: "newer" as CanBuy["reason"], said: "the moon is full" })), { button: "Can't be bought now", note: "The chain says: the moon is full." });
});

// ------------------------------------------------------------ a buy sent, not confirmed
test("shop: a buy with no hash to read, by the gnome read again: landed (the buyer's), taken (another's), or not yet", () => {
  const me = "g1u6gljuvfjhfp6rzeud99567tmr5zncl6sa54vd", other = "g1f3chauez3mk9evmwczjwcwfy8pysfy9jn2p3m7";
  const g = { id: "5", series: "genesis", name: "Nell", tier: "common", traits: "", owner: "", price: 36e6, sold: false, closed: false };
  assert.equal(landing({ ...g, owner: me, sold: true }, me), "mine");
  assert.equal(landing({ ...g, owner: other, sold: true }, me), "taken");
  assert.equal(landing(g, me), null, "still unsold: nothing landed yet");
  assert.equal(landing(null, me), null);
});

// ------------------------------------------------------------ the bill
test("shop: the bill: each cost on a line, at most their sum, short by what the balance lacks", () => {
  const b = bill({ price: 333_330_000, bytes: 3849, storagePrice: 100, gas: 50e6, gasPrice: 0.001, balance: 120e6 });
  assert.deepEqual(b.lines.map(([k]) => k), ["Price", "Storage deposit", "Network fee"]);
  assert.equal(b.lines[0][1], 333_330_000);
  assert.equal(b.lines[1][1], 423_391); // 3,849 bytes at 100 ugnot, and a tenth more, rounded up
  assert.equal(b.lines[2][1], 75_000); // 50M gas at 0.001, half again
  // the wallet's own rules, the Builder's bill's too (adena.ts): never a copy that drifts from what Adena is asked
  assert.equal(b.lines[1][1], depositFor(3849, 100));
  assert.equal(b.lines[2][1], feeFor(50e6, 0.001));
  assert.equal(b.most, 333_330_000 + 423_391 + 75_000);
  assert.equal(b.short, b.most - 120e6);
  assert.equal(bill({ price: 0, bytes: 100, storagePrice: 100, gas: 1e6, gasPrice: 0.001, balance: null }).short, null);
  assert.equal(bill({ price: 0, bytes: 100, storagePrice: 100, gas: 1e6, gasPrice: 0.001, balance: 10e6 }).short, 0);
});

// ------------------------------------------------------------ the shelf
test("shop: the gallery's shelf: on sale, mine, all; tier counts; filters; a page of 48", () => {
  const c = collection();
  const sold = isSold([1, 2, 3]);
  const now = T0 + 49 * 3600;
  const sale = shelf(entries, { view: "sale" }, { c, sold, mine: new Set(), now });
  assert.equal(sale.list.length, 101); // wave 1, less the sold
  assert.ok(sale.list.every((e) => onSale(e, c, sold, now)));
  assert.deepEqual(sale.tiers, { common: 69, rare: 21, epic: 10, legendary: 1 });
  assert.equal(shelf(entries, { view: "all" }, { c, sold, mine: new Set(), now }).list.length, 720);
  assert.deepEqual(shelf(entries, { view: "mine" }, { c, sold, mine: new Set([94, 3]), now }).list.map((e) => e.id), [3, 94]);
  assert.deepEqual(shelf(entries, { view: "all", text: "#94" }, { c, sold, mine: new Set(), now }).list.map((e) => e.id), [94]);
  assert.deepEqual(shelf(entries, { view: "all", text: "94" }, { c, sold, mine: new Set(), now }).list.map((e) => e.id).slice(0, 1), [94]);
  assert.equal(shelf(entries, { view: "all", tier: "legendary" }, { c, sold, mine: new Set(), now }).list.length, 7);
  assert.equal(PAGE, 48);
  // closed: "made" is what was sold
  const closedC = collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 3, closed: true }] });
  assert.deepEqual(shelf(entries, { view: "made" }, { c: closedC, sold, mine: new Set(), now }).list.map((e) => e.id), [1, 2, 3]);
});

test("shop: a card's one fact: the price, the player, Yours, Never made, its wave", () => {
  const c = collection(), now = T0 + 49 * 3600;
  const e = (id: number) => entries.find((x) => x.id === id)!;
  assert.equal(cardFact(e(5), { c, sold: isSold([]), mine: new Set(), now }), "36 GNOT");
  assert.equal(cardFact(e(5), { c, sold: isSold([5]), mine: new Set([5]), now }), "Yours");
  assert.equal(cardFact(e(5), { c, sold: isSold([5]), mine: new Set(), now }), "Found a player");
  assert.equal(cardFact(e(104), { c, sold: isSold([]), mine: new Set(), now }), "1,296 GNOT", "a Legendary at its price, as any gnome");
  assert.equal(cardFact(e(200), { c, sold: isSold([]), mine: new Set(), now }), "Wave 2 · Island");
  const closedC = collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 1, closed: true }] });
  assert.equal(cardFact(e(6), { c: closedC, sold: isSold([5]), mine: new Set(), now }), "Never made");
});

test("shop: a team, Legendary first, then Epic, Rare, Common, earned, then by number", () => {
  const rows = [{ id: "7", tier: "common" }, { id: "104", tier: "legendary" }, { id: "1000001", tier: "earned" }, { id: "94", tier: "epic" }, { id: "73", tier: "rare" }, { id: "2", tier: "common" }];
  assert.deepEqual(teamOrder(rows).map((r) => r.id), ["104", "94", "73", "2", "7", "1000001"]);
});

test("shop: the words of each share moment: about the game, never value", () => {
  const w = shareWords;
  assert.equal(w.bought("Tansy", 94), "I just adopted Tansy, gnome #94 of Gnogolf. Tansy rolls for me now");
  assert.equal(w.equipped("Tansy", "garden"), "My gnome for the boards: Tansy of the Garden. Race my ghost");
  assert.equal(w.equipped("Tansy", "town"), "My gnome for the boards: Tansy of Mushroom Town. Race my ghost", "the world as the game names it");
  assert.equal(w.equipped("Tansy", "mines"), "My gnome for the boards: Tansy of the Crystal Mines. Race my ghost");
  assert.equal(w.team(31, "The Miller"), "My Gnogolf team: 31 gnomes, The Miller up front. Race their ghosts");
  assert.equal(w.team(1, "Tansy"), "My Gnogolf team: Tansy. Race my ghost");
  for (const s of Object.values(w).map((f) => (f as (...a: string[]) => string)("X", "1")))
    assert.doesNotMatch(s, /\b(NFT|mint|token|floor|invest|value|limited)\b/i);
});

// ------------------------------------------------------------ the Legendaries to come
test("shop: the gallery shows each wave's Legendary while its wave is not open, none once the genesis has closed", () => {
  const legends = entries.filter((e) => e.tier === "legendary");
  const ids = (c: Collection, now = T0 + 60) => comingLegends(entries, c, now).map((e) => [e.id, e.wave]);
  const all = legends.map((e) => [e.id, e.wave]);
  assert.equal(legends.length, 7, "one a wave");
  // none open: no wave on the chain yet, or each still to start
  assert.deepEqual(ids(collection({ waves: [] })), all);
  assert.deepEqual(ids(collection(), T0 - 60), all, "wave 1 published, its start to come");
  // some: wave 1 open, wave 2 published for later; a paused sale still has its wave open
  const two = [collection().waves[0], { first: 105, last: 208, start: T0 + 2 * 86400, playersUntil: T0 + 3 * 86400, prices: [36e6, 72e6, 336e6, 1296e6] }];
  assert.deepEqual(ids(collection({ waves: two })), all.slice(1));
  assert.deepEqual(ids(collection({ waves: two }), T0 + 2 * 86400), all.slice(2), "wave 2 opened in turn");
  assert.deepEqual(ids(collection({ waves: two, open: false })), all.slice(1));
  // all open
  assert.deepEqual(ids(collection({ waves: [{ first: 1, last: 720, start: T0, playersUntil: T0, prices: [36e6, 72e6, 336e6, 1296e6] }] })), []);
  // the genesis closed: what never opened never will
  assert.deepEqual(ids(collection({ waves: two, series: [{ name: "genesis", first: 1, last: 720, sold: 40, closed: true }] })), []);
  // its card says its wave alone: no price, no date, no scarcity
  assert.equal(comingFact(legends[2]), "Coming · wave 3");
});

// ------------------------------------------------------------ the shop's wave line: a little fairway, tee to flag
test("shop: the wave line: the ball at the share that found a player, each tier's own, the Legendary at the flag", () => {
  const c = collection(), at = T0 + 49 * 3600;
  const line = waveLine(nowRow(c, isSold([1, 2, 3, 73]), entries, at), c, entries, isSold([1, 2, 3, 73]), at)!;
  assert.ok(line.at === "open");
  // the wave card's two lines: its title, then its count (the Legendary's words beside it)
  assert.equal(line.title, "Wave 1 · Garden");
  assert.equal(line.count, "4 of 104 found a player");
  assert.equal(line.label, "Wave 1, the Garden: 4 of 104 gnomes found a player");
  assert.equal(line.share, 4 / 104);
  assert.deepEqual(line.tiers.map((t) => [t.tier, t.found, t.total, t.price]), [["common", 3, 72, 36e6], ["rare", 1, 21, 72e6], ["epic", 0, 10, 336e6], ["legendary", 0, 1, 1296e6]]);
  assert.equal(line.tiers[0].label, "Common, 36 GNOT: 3 of 72 found a player");
  assert.deepEqual(line.legend, { id: 104, name: "The Miller", words: "The Miller waits at the flag" });
  assert.equal(line.chip, null, "open to everyone: nothing to say but the count");
  // the Legendary taken: said so, never "waits"
  const won = waveLine(nowRow(c, isSold([104]), entries, at), c, entries, isSold([104]), at)!;
  assert.ok(won.at === "open" && won.legend?.words === "The Miller found a player");
});

test("shop: the wave line's edges: none sold, all sold, not started, players first, paused, closed, no wave", () => {
  const c = collection(), all = Array.from({ length: 104 }, (_, i) => i + 1), none = isSold([]);
  const zero = waveLine(nowRow(c, none, entries, T0 + 49 * 3600), c, entries, none, T0 + 49 * 3600)!;
  assert.ok(zero.at === "open" && zero.share === 0 && zero.count === "0 of 104 found a player" && zero.tiers.every((t) => t.found === 0));
  const full = waveLine(nowRow(c, isSold(all), entries, T0 + 49 * 3600), c, entries, isSold(all), T0 + 49 * 3600)!;
  assert.ok(full.at === "soldout" && full.share === 1 && full.count === "All 104 found a player");
  assert.equal(full.label, "Wave 1, the Garden: all 104 gnomes found a player");
  assert.ok(full.tiers.every((t) => t.found === t.total));
  const teaser = waveLine(nowRow(c, none, entries, T0 - 60), c, entries, none, T0 - 60)!;
  assert.ok(teaser.at === "teaser" && teaser.share === 0);
  assert.deepEqual(teaser.chip, { text: "Opens today, 18:00 UTC", short: "Opens 18:00 UTC", full: "Wave 1 opens today, 18:00 UTC." });
  const players = waveLine(nowRow(c, none, entries, T0 + 60), c, entries, none, T0 + 60)!;
  assert.deepEqual(players.chip, { text: "Players first · until Sun 18:00 UTC", short: "Players first · Sun 18:00 UTC", full: "Players first until Sun 18:00 UTC: save one round on-chain to buy now." });
  const p = collection({ open: false }), paused = waveLine(nowRow(p, none, entries, T0 + 60), p, entries, none, T0 + 60)!;
  assert.deepEqual(paused.chip, { text: "Paused for a moment", short: "Paused", full: "Paused for a moment: the sale picks up where it stopped." });
  const k = collection({ series: [{ name: "genesis", first: 1, last: 720, sold: 486, closed: true }] });
  assert.deepEqual(waveLine(nowRow(k, none, entries, T0), k, entries, none, T0), { at: "closed", title: "The sale is closed", count: "486 made · 234 never made", label: "The sale is closed: 486 gnomes made, 234 never made" });
  const w = collection({ waves: [] });
  assert.equal(waveLine(nowRow(w, none, entries, T0), w, entries, none, T0), null);
  // a tier the wave holds at no price: its count kept, no price said; a wave of one tier holds that tier alone
  const free = collection({ waves: [{ ...c.waves[0], prices: [36e6, 0, 336e6, 1296e6] }] }), at = T0 + 49 * 3600;
  const thin = waveLine(nowRow(free, none, entries, at), free, entries, none, at)!;
  assert.ok(thin.at === "open" && thin.tiers[1].price === 0 && thin.tiers[1].label === "Rare: 0 of 21 found a player");
  const commons = entries.filter((e) => e.tier === "common"), one = waveLine(nowRow(c, none, commons, at), c, commons, none, at)!;
  assert.ok(one.at === "open" && one.tiers.length === 1 && one.legend === null);
  // the words never press: no countdown, no "only", no "last"
  for (const l of [zero, full, teaser, players, paused]) for (const s of [l.label, l.title, l.count, l.at !== "closed" && l.chip ? l.chip.text + l.chip.full : ""]) assert.doesNotMatch(s, /only|last|hurry|left|invest|value/i);
});
