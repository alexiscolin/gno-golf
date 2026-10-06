// Publishing a hole (lib/builder/publish.ts): the storage deposit and the gas
// a PublishMine asks for, from the realm's own figures (the z_builder_publish
// filetests), the bill shown before any signature, and the gnokey command,
// whose every argument reaches the realm as the page shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { bill, deposit, gasFor, gnokeyPublish, publishBytes, shq, STORED } from "../lib/builder/publish.ts";

const GOLF = new URL("../../gno.land/r/gnogolf/golf/", import.meta.url);
/** A filetest's golden numbers: the golf realm's storage and the gas. */
const golden = (name: string) => {
  const s = fs.readFileSync(new URL(`z_builder_publish_${name}_filetest.gno`, GOLF), "utf8");
  return { stored: Number(/gno\.land\/r\/gnogolf\/golf: (\d+)/.exec(s)![1]), gas: Number(/\/\/ Gas:\n\/\/ (\d+)/.exec(s)![1]) };
};
const warm = golden("warm");
const own = (name: string) => ({ stored: golden(name).stored - warm.stored, gas: golden(name).gas - warm.gas });
const FOUR = "\u{10400}";
// the measured holes: their data's bytes (course.Encode's), name and note
const CASES = {
  more: { bytes: 364, name: "More", note: "", v: 1, newAuthor: false },
  author: { bytes: 364, name: "Lane", note: "", v: 1, newAuthor: true },
  heavy: { bytes: 15292, name: "At the limits", note: "", v: 1, newAuthor: false },
  named: { bytes: 520, name: FOUR.repeat(40), note: FOUR.repeat(140), v: 1, newAuthor: false },
  version: { bytes: 364, name: "Warm", note: "", v: 2, newAuthor: false },
};

void test("publishBytes: what each measured publish stored, within a few bytes (the realm's own figures)", () => {
  for (const [name, c] of Object.entries(CASES)) {
    const want = own(name).stored, got = publishBytes(c);
    assert.ok(Math.abs(got - want) <= 24, `${name}: ${got} for ${want}`);
  }
  assert.ok(STORED.overhead > 3000 && STORED.overhead < 5000);
});

void test("deposit: the bytes at the chain's price, a tenth more: never less than what is stored", () => {
  for (const [name, c] of Object.entries(CASES)) {
    const d = deposit({ ...c, price: 100 });
    assert.ok(d >= own(name).stored * 100 && d <= own(name).stored * 100 * 1.12, `${name}: ${d}`);
  }
  assert.equal(deposit({ ...CASES.more, price: 100 }) / 1e6 < 0.5, true, "a plain lane: under half a GNOT at 100 ugnot a byte");
});

void test("gasFor: above each measured publish's own gas (and a call's), never past what a transaction may ask", () => {
  for (const [name, c] of Object.entries(CASES)) {
    const g = gasFor(c), want = own(name).gas;
    assert.ok(g > want && g < want * 1.6 + 40e6, `${name}: ${g} for ${want}`);
  }
  assert.ok(gasFor({ bytes: 32 << 10, name: FOUR.repeat(40), note: FOUR.repeat(140) }) <= 1.9e9, "the largest hole the realm takes, the longest text");
});

void test("bill: the deposit, the fee (gas at the price, half again for a rising one) and their total, in GNOT", () => {
  const b = bill({ ...CASES.more, gasPrice: 0.001, bytePrice: 100 });
  assert.equal(b.total, b.deposit + b.fee);
  assert.equal(b.fee, Math.ceil(gasFor(CASES.more) * 0.001 * 1.5) / 1e6);
  assert.equal(b.deposit, deposit({ ...CASES.more, price: 100 }) / 1e6);
});

void test("the note comes out of the gnokey command unchanged", () => {
  const note = "Let's go; $(x) `y` \\ \"z\"";
  const out = execFileSync("sh", ["-c", `printf %s ${shq(note)}`], { encoding: "utf8" });
  assert.equal(out, note);
  const cmd = gnokeyPublish({ realm: "gno.land/r/x/golf", slug: "a-b", hex: "00ff", note: "Let's go; $(x)", gas: 1e8, price: 0.001, deposit: 600000, chainId: "dev", rpc: "http://127.0.0.1:26657" });
  assert.match(cmd, /-func PublishMine -args a-b -args 00ff -args 'Let'\\''s go; \$\(x\)'/);
  assert.match(cmd, /-max-deposit 600000ugnot/, "the deposit capped at the bill's");
  assert.match(cmd, /-chainid dev -remote http:\/\/127\.0\.0\.1:26657 <your-key-name>$/);
});

void test("gnokeyPublish: nothing for a slug, data or realm not of their shape (nothing unchecked reaches a shell)", () => {
  const ok = { realm: "gno.land/r/x/golf", slug: "a-b", hex: "00ff", note: "", gas: 1e8, price: 0.001, deposit: 1, chainId: "dev", rpc: "http://127.0.0.1:26657" };
  assert.notEqual(gnokeyPublish(ok), "");
  for (const bad of [{ slug: "a b" }, { slug: "$(x)" }, { hex: "0g" }, { hex: "0" }, { realm: "gno.land/r/x;rm" }, { deposit: -1 }, { gas: 1.5 }]) {
    assert.equal(gnokeyPublish({ ...ok, ...bad }), "", JSON.stringify(bad));
  }
});
