// lib/gnomes/legal.ts: the shop's words the law asks for, as the copy draft
// writes them (docs/superpowers/legal/draft-shop-copy.md): the final
// confirmation before the wallet opens, its two separate boxes, its button,
// and the receipt with every field it must carry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX_A, BOX_B, review, orderButton, chainCosts, parLine, receipt, jstDate, SELLER, TRUST, BANNED } from "../lib/gnomes/legal.ts";
import { totalOf } from "../lib/gnomes/shop.ts";

const closes = Date.UTC(2026, 11, 13, 18) / 1000; // Sun 13 Dec 2026, 18:00 UTC = Mon 14 Dec, 03:00 JST
const order = { name: "Tansy of the Garden", id: 94, tier: "epic", n: 1, price: 336e6, deposit: 310_000, fee: 150_000, total: totalOf(336e6, 310_000, 150_000), address: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", closesAt: closes, now: closes - 86400 * 60 };

const all = (r: ReturnType<typeof review>) => [r.total, ...r.pay, ...r.terms];
test("legal: the order, term by term, before the wallet opens (§1.1): its total first, what is paid, then the terms", () => {
  const r = review(order), rows = all(r);
  assert.deepEqual(r.pay.map(([k]) => k), ["Item", "Price", "Other costs", "Payment"]);
  assert.deepEqual(r.terms.map(([k]) => k), ["Delivery", "Sale period", "Cancellation", "Nature", "Seller"]);
  assert.equal(rows.length, 10, "every term, none left out");
  const at = (k: string) => rows.find(([x]) => x === k)![1];
  assert.equal(at("Item"), "Tansy of the Garden (#94, Epic), 1 item");
  assert.equal(at("Price"), "336 GNOT");
  assert.equal(at("Other costs"), "Storage deposit about 0.31 GNOT (held by the chain, returned if you burn the gnome) + network fee about 0.15 GNOT. Neither is paid to us.");
  assert.equal(r.total[0], "Total");
  assert.equal(at("Total"), "336.46 GNOT at most");
  assert.equal(at("Delivery"), "Delivered at once to g1jg8m…sqf5, in the same transaction.");
  assert.equal(at("Sale period"), "The genesis sale closes on Sun 13 Dec, 18:00 UTC (Mon 14 Dec, 03:00 JST).");
  assert.match(at("Cancellation"), /^No returns, cancellations or refunds once the transaction is final/);
  assert.equal(at("Seller"), `${SELLER.name}, ${SELLER.address}, ${SELLER.email}`);
  // no closing date set (it is optional: the genesis then sells until sold out): the period still said, plainly, never left out
  const open = all(review({ ...order, closesAt: 0 }));
  assert.deepEqual(open.map(([k]) => k), rows.map(([k]) => k));
  assert.equal(open.find(([k]) => k === "Sale period")![1], "The genesis sale has no closing date: it runs until sold out, unless one is announced later.");
});

test("legal: two boxes, each its own; the button names the obligation to pay, never Next, Send or Continue (§1.2, §1.3)", () => {
  assert.notEqual(BOX_A, BOX_B);
  assert.match(BOX_A, /18 or older/);
  assert.match(BOX_B, /lose my right of withdrawal/);
  assert.equal(orderButton(336_460_000), "Order with obligation to pay (336.46 GNOT): sign in wallet");
  assert.doesNotMatch(orderButton(1), /^(Next|Send|Continue)\b/);
});

test("legal: one figure, up to the hundredth: the review's Total and the button say the same, never under the bill's most", () => {
  const odd = { ...order, price: 36e6, deposit: 429_001, fee: 60_000, total: totalOf(36e6, 429_001, 60_000) }; // (36.489001 all told)
  assert.equal(odd.total, 36_490_000);
  assert.equal(review(odd).total[1], "36.49 GNOT at most");
  assert.equal(orderButton(odd.total), "Order with obligation to pay (36.49 GNOT): sign in wallet");
  assert.equal(orderButton(totalOf(36_489_001)), "Order with obligation to pay (36.49 GNOT): sign in wallet", "a raw sum is rounded up, never shown to the millionth");
  assert.equal(totalOf(72e6, 0, 0), 72e6);
});

test("legal: a sheet's chain costs, from the review's own estimate; a price's golf number, its tier's own price only", () => {
  assert.equal(chainCosts({ deposit: 429_001, fee: 60_000 }), "+ ≈0.49 GNOT chain costs: a 0.43 deposit, returned if you ever destroy (burn) the gnome");
  assert.equal(chainCosts({ deposit: 430_000, fee: 70_000 }), "+ ≈0.5 GNOT chain costs: a 0.43 deposit, returned if you ever destroy (burn) the gnome");
  assert.equal(parLine("common", 36e6), "Why 36 GNOT? It's the par of nine holes.");
  assert.equal(parLine("legendary", 1296e6), "Why 1,296 GNOT? Eighteen holes times par 72.");
  assert.equal(parLine("rare", 80e6), "", "another price: no golf number claimed");
  assert.equal(parLine("earned", 0), "");
});

test("legal: the receipt carries every field (§3): seller, date in UTC and JST, item, contract, price and costs, delivery, transaction, terms, consents as ticked", () => {
  const lines = receipt({ ...order, at: Date.UTC(2026, 9, 6, 18, 4) / 1000, hash: "3F9AC21B", realm: "gno.land/r/nym-x/gnogolf/gnomes", chainId: "gnoland-1", consents: [BOX_A, BOX_B] });
  const text = lines.join("\n");
  for (const want of [SELLER.name, "Tue 6 Oct 2026, 18:04 UTC (Wed 7 Oct, 03:04 JST)", "Tansy of the Garden, #94, Epic", "gno.land/r/nym-x/gnogolf/gnomes",
    "336 GNOT (+ network fee 0.15 GNOT, storage deposit 0.31 GNOT held by the chain)", order.address, "3F9AC21B", "gnoland-1", BOX_A, BOX_B, "No returns or refunds once final"])
    assert.ok(text.includes(want), `the receipt says ${want}`);
  assert.ok(text.includes("Sale period: The genesis sale closes on Sun 13 Dec, 18:00 UTC (Mon 14 Dec, 03:00 JST)."), "the receipt keeps the sale period");
  assert.ok(receipt({ ...order, closesAt: 0, at: 0, hash: "", realm: "r", chainId: "c", consents: [BOX_A] }).includes("Sale period: The genesis sale has no closing date: it runs until sold out, unless one is announced later."));
  assert.ok(receipt({ ...order, at: 0, hash: "", realm: "r", chainId: "c", consents: [BOX_A] }).includes("Transaction: in your wallet's history (permanent record on c)"), "no hash (the wallet gave none): where it is");
  assert.ok(!receipt({ ...order, at: 0, hash: "x", realm: "r", chainId: "c", consents: [BOX_A] }).join("\n").includes(BOX_B), "only the boxes shown and ticked");
});

test("legal: JST is UTC+9, said as the copy says it", () => {
  assert.equal(jstDate(closes), "Mon 14 Dec, 03:00 JST");
});

test("legal: none of the shop's words is one it never uses (§5)", () => {
  const words = [BOX_A, BOX_B, ...TRUST, ...all(review(order)).map(([, v]) => v), orderButton(1), chainCosts({ deposit: 1, fee: 1 }), parLine("epic", 336e6)].join(" ").toLowerCase();
  for (const w of BANNED) assert.ok(!words.includes(w), w);
});
