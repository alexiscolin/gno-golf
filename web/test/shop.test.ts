// lib/gnomes/shop.ts: the gnomes' shop as the screens read it. The realm's
// answers in the shapes r/gnogolf/gnomes writes them (read.gno, buy.gno,
// auction.gno, equip.gno), and every state a screen shows decided from them.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  makeShop, soldSet, gnot, parseGnot, utcDate, nowRow, promoOf, promoWords, whyNot, bill, shelf, teamOrder, shareWords, PAGE, onSale, cardFact,
  type Collection, type CanBuy,
} from "../lib/gnomes/shop.ts";
import type { Catalogue } from "../lib/gnomes/catalogue.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as Catalogue;
const entries = catalogue.gnomes;
const A = "g1" + "a".repeat(38);
const T0 = Date.UTC(2026, 9, 9, 18) / 1000; // Fri 9 Oct 2026, 18:00 UTC

const collection = (o: Partial<Collection> = {}): Collection => ({
  version: 1, open: true, closesAt: Date.UTC(2026, 11, 14, 18) / 1000, owner: A, treasury: A, pendingTreasury: "", site: "", royaltyBps: 500,
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
  assert.equal(parseGnot("1,302"), 1_302e6);
  assert.equal(parseGnot(" 12.5 "), 12_500_000);
  assert.ok(Number.isNaN(parseGnot("1.0000001")));
  assert.ok(Number.isNaN(parseGnot("-3")));
  assert.ok(Number.isNaN(parseGnot("")));
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

// ------------------------------------------------------------ why not, in plain words
test("shop: every refusal CanBuy gives has its words: the button's and a note", () => {
  const c = collection(), until = T0 + 48 * 3600;
  const tansy = { tier: "epic" as const, wave: 1, home: "garden" as const };
  const w = (r: CanBuy) => whyNot(r, c, tansy, T0 + 60);
  assert.equal(w(can({ ok: true })), null);
  assert.deepEqual(w(can({ reason: "paused" })), { button: "Paused for a moment", note: "The sale picks up where it stopped." });
  assert.deepEqual(w(can({ reason: "players-only", window: { until, left: { common: 3, rare: 2, epic: 1 } } })), { button: "Players first until Sun 18:00 UTC", note: "Save one round on-chain to buy now.", play: true });
  assert.deepEqual(w(can({ reason: "wave-cap", window: { until, left: { common: 3, rare: 2, epic: 0 } } })), { button: "1 of 1 Epic this wave", note: "Your share until Sun 18:00 UTC. Then open to everyone." });
  assert.deepEqual(w(can({ reason: "cap", left: { common: 10, rare: 5, epic: 0 } })), { button: "2 of 2 Epics", note: "The most one wallet buys." });
  assert.deepEqual(w(can({ reason: "later" })), { button: "Opens today, 18:00 UTC", note: "From Wave 1 · Garden." });
  assert.deepEqual(w(can({ reason: "unlisted" })), { button: "Not on sale yet", note: "From Wave 1 · Garden. A wave not open by Mon 14 Dec, 18:00 UTC never opens." });
  assert.deepEqual(w(can({ reason: "taken" })), { button: "Already found a player", note: "" });
  assert.deepEqual(w(can({ reason: "closed" })), { button: "Never made", note: "The sale closed before this gnome found a player." });
  assert.deepEqual(w(can({ reason: "unknown" })), { button: "No gnome by that number", note: "" });
  // a code this page does not know: the realm's own sentence, never silence
  assert.deepEqual(w(can({ reason: "newer" as CanBuy["reason"], said: "the moon is full" })), { button: "Can't be bought now", note: "The chain says: the moon is full." });
});

// ------------------------------------------------------------ the bill
test("shop: the bill: each cost on a line, at most their sum, short by what the balance lacks", () => {
  const b = bill({ price: 333_330_000, bytes: 3849, storagePrice: 100, gas: 50e6, gasPrice: 0.001, balance: 120e6 });
  assert.deepEqual(b.lines.map(([k]) => k), ["Price", "Storage deposit", "Network fee"]);
  assert.equal(b.lines[0][1], 333_330_000);
  assert.equal(b.lines[1][1], 423_400); // 3,849 bytes and a tenth more, at 100 ugnot
  assert.equal(b.lines[2][1], 75_000); // 50M gas at 0.001, half again
  assert.equal(b.most, 333_330_000 + 423_400 + 75_000);
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
  assert.equal(w.team(31, "The Miller"), "My Gnogolf team: 31 gnomes, The Miller up front. Race their ghosts");
  assert.equal(w.team(1, "Tansy"), "My Gnogolf team: Tansy. Race my ghost");
  for (const s of Object.values(w).map((f) => (f as (...a: string[]) => string)("X", "1")))
    assert.doesNotMatch(s, /\b(NFT|mint|token|floor|invest|value|limited)\b/i);
});
