// lib/gnomes/promo.ts: the sale the game's screens promote, read once a chain
// (another chain is read on its own; a failed read is asked again), its state
// worked out from the clock at each use, never frozen at the first read; and
// the one gate the shop's every door goes through (geo.ts shopShown).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { Collection } from "../lib/gnomes/shop.ts";
import type { Served } from "../lib/gnomes/served.ts";
import { readSale, saleAt } from "../lib/gnomes/promo.ts";
import { shopShown } from "../lib/gnomes/geo.ts";

const catalogue = JSON.parse(fs.readFileSync(new URL("../../data/gnomes.json", import.meta.url), "utf8")) as { gnomes: Served["gnomes"] };
const served = () => Promise.resolve({ gnomes: catalogue.gnomes, earned: [] } as Served);
const T0 = Date.UTC(2026, 9, 10, 18) / 1000;
const COLLECTION: Collection = {
  version: 1, open: true, earnedOpen: true, closesAt: 0, owner: "", treasury: "", pendingTreasury: "", site: "", royaltyBps: 500,
  tiers: ["common", "rare", "epic", "legendary"].map((name, i) => ({ name, price: [36e6, 72e6, 336e6, 1296e6][i], cap: 10, playerCap: 3, sold: 0 })),
  series: [{ name: "genesis", first: 1, last: 720, sold: 0, closed: false, sale: { start: T0, playersUntil: T0 + 3600, prices: [36e6, 72e6, 336e6, 1296e6] } }],
};
/** A chain that answers Collection() and Sold(), counting its reads (fail: the first read fails). */
function chainOf(fail = false) {
  let reads = 0, failing = fail;
  const chain = {
    qjson: (_realm: string, expr: string) => {
      reads++;
      if (failing) return (failing = false), Promise.reject(new Error("down"));
      return expr.startsWith("Collection") ? Promise.resolve(COLLECTION as never) : Promise.reject(new Error(expr));
    },
    qstr: () => (reads++, Promise.resolve("")),
  };
  return { chain, reads: () => reads };
}

void test("the sale is read once a chain; another chain is read on its own; a failed read is asked again", async () => {
  const a = chainOf(), b = chainOf(), c = chainOf(true);
  await readSale(a.chain, served);
  await readSale(a.chain, served);
  assert.equal(a.reads(), 2, "Collection and Sold, once");
  await readSale(b.chain, served);
  assert.equal(b.reads(), 2, "the other chain read on its own");
  await assert.rejects(readSale(c.chain, served));
  await readSale(c.chain, served);
  assert.ok(c.reads() >= 3, "asked again after the failure");
});

void test("the sale's state is the clock's at each use: players first, then on sale", async () => {
  const sale = await readSale(chainOf().chain, served);
  assert.equal(saleAt(sale, T0 + 60)!.at, "players");
  assert.equal(saleAt(sale, T0 + 7200)!.at, "open");
  assert.equal(saleAt(sale, T0 - 60)!.at, "teaser");
});

void test("the shop shows only where the region answered yes, and only with the flag", () => {
  assert.equal(shopShown(true, true), true);
  assert.equal(shopShown(true, null), false, "not answered yet: not shown");
  assert.equal(shopShown(true, false), false, "a blocked region");
  assert.equal(shopShown(false, true), false, "the flag off");
});
