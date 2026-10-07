// lib/gnomes/legal.ts: the shop's words the law asks for, as the copy draft
// writes them (docs/superpowers/legal/draft-shop-copy.md): the final
// confirmation before the wallet opens, its two separate boxes, its button,
// and the receipt with every field it must carry.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOX_A, BOX_B, review, orderButton, receipt, jstDate, SELLER, TRUST, BANNED } from "../lib/gnomes/legal.ts";

const closes = Date.UTC(2026, 11, 13, 18) / 1000; // Sun 13 Dec 2026, 18:00 UTC = Mon 14 Dec, 03:00 JST
const order = { name: "Tansy of the Garden", id: 94, tier: "epic", n: 1, price: 336e6, deposit: 310_000, fee: 150_000, address: "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", closesAt: closes, now: closes - 86400 * 60 };

test("legal: the order, term by term, before the wallet opens (§1.1)", () => {
  const rows = review(order);
  assert.deepEqual(rows.map(([k]) => k), ["Item", "Price", "Other costs", "Total", "Payment", "Delivery", "Sale period", "Cancellation", "Nature", "Seller"]);
  const at = (k: string) => rows.find(([x]) => x === k)![1];
  assert.equal(at("Item"), "Tansy of the Garden (#94, Epic), 1 item");
  assert.equal(at("Price"), "336 GNOT");
  assert.equal(at("Other costs"), "Storage deposit about 0.31 GNOT (held by the chain, returned if you burn the gnome) + network fee about 0.15 GNOT. Neither is paid to us.");
  assert.equal(at("Total"), "about 336.46 GNOT");
  assert.equal(at("Delivery"), "Delivered at once to g1jg8m…sqf5, in the same transaction.");
  assert.equal(at("Sale period"), "The genesis sale closes on Sun 13 Dec, 18:00 UTC (Mon 14 Dec, 03:00 JST).");
  assert.match(at("Cancellation"), /^No returns, cancellations or refunds once the transaction is final/);
  assert.equal(at("Seller"), `${SELLER.name}, ${SELLER.address}, ${SELLER.email}`);
  assert.equal(review({ ...order, closesAt: 0 }).find(([k]) => k === "Sale period"), undefined, "no date set: no line claims one");
});

test("legal: two boxes, each its own; the button names the obligation to pay, never Next, Send or Continue (§1.2, §1.3)", () => {
  assert.notEqual(BOX_A, BOX_B);
  assert.match(BOX_A, /18 or older/);
  assert.match(BOX_B, /lose my right of withdrawal/);
  assert.equal(orderButton(336_460_000), "Order with obligation to pay (336.46 GNOT): sign in wallet");
  assert.doesNotMatch(orderButton(1), /^(Next|Send|Continue)\b/);
});

test("legal: the receipt carries every field (§3): seller, date in UTC and JST, item, contract, price and costs, delivery, transaction, terms, consents as ticked", () => {
  const lines = receipt({ ...order, at: Date.UTC(2026, 9, 6, 18, 4) / 1000, hash: "3F9AC21B", realm: "gno.land/r/nym-x/gnogolf/gnomes", chainId: "gnoland-1", consents: [BOX_A, BOX_B] });
  const text = lines.join("\n");
  for (const want of [SELLER.name, "Tue 6 Oct 2026, 18:04 UTC (Wed 7 Oct, 03:04 JST)", "Tansy of the Garden, #94, Epic", "gno.land/r/nym-x/gnogolf/gnomes",
    "336 GNOT (+ network fee 0.15 GNOT, storage deposit 0.31 GNOT held by the chain)", order.address, "3F9AC21B", "gnoland-1", BOX_A, BOX_B, "No returns or refunds once final"])
    assert.ok(text.includes(want), `the receipt says ${want}`);
  assert.ok(receipt({ ...order, at: 0, hash: "", realm: "r", chainId: "c", consents: [BOX_A] }).includes("Transaction: in your wallet's history (permanent record on c)"), "no hash (the wallet gave none): where it is");
  assert.ok(!receipt({ ...order, at: 0, hash: "x", realm: "r", chainId: "c", consents: [BOX_A] }).join("\n").includes(BOX_B), "only the boxes shown and ticked");
});

test("legal: JST is UTC+9, said as the copy says it", () => {
  assert.equal(jstDate(closes), "Mon 14 Dec, 03:00 JST");
});

test("legal: none of the shop's words is one it never uses (§5)", () => {
  const all = [BOX_A, BOX_B, ...TRUST, ...review(order).map(([, v]) => v), orderButton(1)].join(" ").toLowerCase();
  for (const w of BANNED) assert.ok(!all.includes(w), w);
});
