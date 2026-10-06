// lib/gnomes/tx.ts, the gnomes' signatures (r/gnogolf/gnomes, ADR-007): each one
// call alone (Buy, Equip), the exact coins with it, the gas the
// chain was measured to take with room; and the same call as a gnokey line,
// built from it, never written by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Adena } from "../lib/adena.ts";
import { GNOME_TX, gnomeCall, sendGnome, gnokeyGnome, blockTime } from "../lib/gnomes/tx.ts";

const ADDR = "g1" + "a".repeat(38), RPC = "http://127.0.0.1:26657", CHAIN = "dev", GN = "gno.land/r/nym-x/gnogolf/gnomes";
type Tx = { messages: { type: string; value: Record<string, unknown> }[]; gasFee: number; gasWanted: number; memo: string };
function adena(reply: { status: string; code?: number; data?: unknown } = { status: "success", data: { hash: "aGFzaA==", height: 9 } }) {
  const sent: Tx[] = [];
  const a = {
    GetNetwork: () => Promise.resolve({ status: "success", data: { chainId: CHAIN, rpcUrl: RPC } }),
    SwitchNetwork: () => Promise.resolve({ status: "success" }),
    AddNetwork: () => Promise.resolve({ status: "success" }),
    DoContract: (tx: Tx) => (sent.push(tx), Promise.resolve(reply)),
  };
  (globalThis as unknown as { window?: { adena?: Adena } }).window = { adena: a as unknown as Adena };
  return sent;
}
const at = { address: ADDR, realm: GN, price: 0.001, chainId: CHAIN, rpc: RPC };

test("gnome calls: each the realm's own function, its arguments checked, the coins exact", () => {
  assert.deepEqual(gnomeCall.buy([94], 336_000_000), { func: "Buy", args: ["94"], send: 336_000_000, gas: GNOME_TX.buy.gas(1), bytes: GNOME_TX.buy.bytes(1) });
  assert.deepEqual(gnomeCall.buy([6, 7], 60_000_000).args, ["6,7"]);
  assert.deepEqual(gnomeCall.buy([104], 1_296_000_000).args, ["104"], "a Legendary is bought as any gnome");
  assert.deepEqual(gnomeCall.equip(5).args, ["5"]);
  assert.deepEqual(gnomeCall.equip(null).args, [""], "taken off: everyone sees the best again");
  for (const bad of [() => gnomeCall.buy([], 1), () => gnomeCall.buy([1, 2, 3, 4, 5, 6], 1), () => gnomeCall.buy([1.5], 1), () => gnomeCall.buy([1], 0),
    () => gnomeCall.buy([1, 1], 2), () => gnomeCall.buy([1], 1.5), () => gnomeCall.equip(0), () => gnomeCall.equip(Number.NaN)])
    assert.throws(bad, /Nothing to sign/);
});

test("gnome calls: the gas asked is over what each took on a chain (the e2e report's most), and grows with a Buy's list", () => {
  // measured: a Buy of one 31.0M, two 36.0M, five 55.4M; an Equip 10.8M
  for (const [n, took] of [[1, 31e6], [2, 36e6], [5, 55.4e6]] as const) assert.ok(GNOME_TX.buy.gas(n) >= took * 1.25, `Buy of ${n}`);
  assert.ok(GNOME_TX.equip.gas >= 10.8e6 * 1.25);
  assert.ok(GNOME_TX.buy.bytes(1) >= 3850, "a first buy stores 3,850 bytes (z_storage_buy)");
});

test("sendGnome: one message to Adena, the realm's path, the send in ugnot, nothing else", async () => {
  const sent = adena();
  const r = await sendGnome(gnomeCall.buy([94], 336_000_000), at);
  assert.deepEqual(r, { hash: "aGFzaA==", height: 9 });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].messages, [{ type: "/vm.m_call", value: { caller: ADDR, send: "336000000ugnot", pkg_path: GN, func: "Buy", args: ["94"] } }]);
  assert.equal(sent[0].gasWanted, GNOME_TX.buy.gas(1));
  await sendGnome(gnomeCall.equip(5), at);
  assert.equal(sent[1].messages[0].value.send, "", "Equip sends no coin");
});

test("sendGnome: cancelled in Adena says nothing was sent; a refusal carries the realm's words", async () => {
  adena({ status: "failure", code: 4000 });
  await assert.rejects(sendGnome(gnomeCall.equip(5), at), (e: Error & { cancelled?: boolean }) => !!e.cancelled && /nothing was sent/i.test(e.message));
  adena({ status: "failure", code: 0, data: { error: { message: "gnomes: this gnome is already sold" } } });
  await assert.rejects(sendGnome(gnomeCall.buy([94], 336e6), at), /already sold/);
  await assert.rejects(sendGnome(gnomeCall.buy([94], 336e6), { ...at, realm: "gno.land/r/x; rm -rf" }), /Nothing to sign/);
});

test("gnokeyGnome: the very call, as one gnokey line at its gas and fee, for this chain", () => {
  assert.equal(gnokeyGnome(gnomeCall.buy([94], 336_000_000), at),
    `gnokey maketx call -pkgpath ${GN} -func Buy -args 94 -send 336000000ugnot -gas-fee ${Math.ceil(GNOME_TX.buy.gas(1) * 0.001 * 1.5)}ugnot -gas-wanted ${GNOME_TX.buy.gas(1)} -broadcast -chainid dev -remote ${RPC} <your-key-name>`);
  assert.match(gnokeyGnome(gnomeCall.equip(null), at), / -func Equip -args '' -gas-fee /);
  assert.doesNotMatch(gnokeyGnome(gnomeCall.equip(5), at), /-send/);
  assert.equal(gnokeyGnome(gnomeCall.buy([104], 1296e6), { ...at, realm: "not a realm" }), "");
});

test("blockTime: a block's time (unix seconds) from /block?height, null when the node cannot say", async () => {
  const asked: string[] = [];
  const answer = (body: unknown) => (globalThis.fetch = ((url: string) => (asked.push(url), Promise.resolve({ json: () => Promise.resolve(body) }))) as unknown as typeof fetch);
  answer({ result: { block: { header: { time: "2026-10-06T18:04:05.123456Z" } } } });
  assert.equal(await blockTime("http://node", 42), Date.UTC(2026, 9, 6, 18, 4, 5) / 1000);
  assert.deepEqual(asked, ["http://node/block?height=42"]);
  answer({ result: {} });
  assert.equal(await blockTime("http://node", 42), null);
  globalThis.fetch = () => Promise.reject(new Error("down"));
  assert.equal(await blockTime("http://node", 42), null);
  assert.equal(await blockTime("http://node", -1), null, "no such height: nothing asked");
});
