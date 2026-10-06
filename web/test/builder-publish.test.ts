// Publishing a hole (lib/builder/publish.ts): the storage deposit and the gas
// a PublishMine asks for, from the realm's own figures (the z_builder_publish
// filetests), the bill shown before any signature, and the gnokey command,
// whose every argument reaches the realm as the page shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { bill, deposit, finalHex, gasFor, gnokeyPublish, proofsHold, publishBytes, publishSteps, shq, STORED } from "../lib/builder/publish.ts";
import { shaOf } from "../lib/builder/proof.ts";

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

void test("publishBytes: the chain's first community hole also opens the community's indexes (the warm-up filetest: a first publish)", () => {
  const first = publishBytes({ bytes: 364, name: "Warm", note: "", v: 1, newAuthor: true, firstCommunity: true });
  assert.ok(Math.abs(first - warm.stored) <= 24, `${first} for ${warm.stored}`);
  assert.ok(deposit({ bytes: 364, name: "Warm", note: "", v: 1, newAuthor: true, firstCommunity: true, price: 100 }) >= warm.stored * 100);
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

const A = "g1" + "a".repeat(38);
const ver = (v: number, sha = "old") => ({ id: `${A}/lane/v${v}`, v, height: 1, by: A, sha, note: "", next: "" });
const ready = { publishing: true, rules: true, versions: { version: 1, slot: `${A}/lane`, versions: [ver(1)] }, proofs: true, name: "" };
const at = { author: A, slug: "lane", proved: `${A}/lane/v2`, sha: "new" };

void test("publishSteps: open once every check holds; else the first that does not, in words", () => {
  assert.deepEqual(publishSteps(ready, at), { at: "ready", why: "" });
  assert.equal(publishSteps({ ...ready, publishing: undefined }, at).at, "reading");
  assert.deepEqual(publishSteps({ ...ready, publishing: false }, at), { at: "closed", why: "Publishing isn't open on gno.land yet. Your draft is kept." });
  assert.deepEqual(publishSteps({ ...ready, rules: false }, at), { at: "rules", why: "The Builder's checks are not the chain's current rules. Reload the page, or wait for the site to catch up." });
  assert.equal(publishSteps({ ...ready, versions: null }, at).at, "unread");
  assert.equal(publishSteps({ ...ready, publishing: null }, at).at, "unread", "a read that failed is said, never waited on");
  assert.equal(publishSteps({ ...ready, rules: null }, at).at, "unread");
  const newer = publishSteps({ ...ready, versions: { ...ready.versions, versions: [ver(1), ver(2)] } }, at);
  assert.deepEqual(newer, { at: "newer", why: "This one would be v3, with new weather: test it again." }, "a version published elsewhere since: its proofs are another id's");
  assert.deepEqual(publishSteps(ready, { ...at, sha: "old" }), { at: "same", why: "This is exactly the version already published." });
  assert.equal(publishSteps({ ...ready, proofs: false }, at).at, "proofs");
  assert.deepEqual(publishSteps({ ...ready, name: "The name or the note looks like a web address." }, at), { at: "name", why: "The name or the note looks like a web address." });
  assert.equal(publishSteps({ ...ready, publishing: false, rules: false }, at).at, "closed", "closed first: nothing else matters then");
});

void test("the final data: the name as the chain keeps it written in; the proofs replay on it; its sha the realm's", async () => {
  const { host } = await import("./builder-fixture.ts");
  await import("./scene-harness.ts");
  const { STARTERS } = await import("../lib/builder/starters.ts");
  const { proofKey, replay, required } = await import("../lib/builder/proof.ts");
  const { makeLocalChain } = await import("../lib/builder/localchain.ts");
  const { holeRow } = await import("../lib/builder/testmode.ts");
  const rounds = JSON.parse(fs.readFileSync(new URL("./builder-starters.json", import.meta.url), "utf8")) as Record<string, Record<string, { period: number; shots: string[] }>>;
  const id = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/garden-straight/v1", d0 = { ...STARTERS.garden.straight, slug: "garden-straight" };
  const key = (await proofKey(d0, host))!, proofs = [];
  for (const kind of required("garden")) {
    const r = rounds["garden-straight"][kind];
    proofs.push(await replay(makeLocalChain(host, holeRow(id, d0), finalHex(d0, host, d0.title)!, r.period), { key, id, kind, period: r.period, shots: r.shots }));
  }
  const d = { ...d0, proofs: proofs as never[] };
  const hex = finalHex(d, host, "Garden Straight")!;
  assert.equal(host.decode(hex).title, "Garden Straight", "the name as the chain keeps it, in the data");
  assert.equal(await proofsHold(d, host, hex, key, id), true, "a new name moves no ball");
  const moved = finalHex({ ...d, pieces: d.pieces.map((p) => (p.id === "p1" && p.geometry.t === "post" ? { ...p, geometry: { ...p.geometry, c: [p.geometry.c[0], p.geometry.c[1] + 2] as [number, number] } } : p)) }, host, "x")!;
  assert.equal(typeof (await proofsHold(d, host, moved, key, id)), "boolean");
  assert.equal(await proofsHold({ ...d, proofs: [] }, host, hex, key, id), false, "no proof, nothing holds");
  assert.match(await shaOf(hex), /^[0-9a-f]{64}$/);
  assert.notEqual(await shaOf(hex), await shaOf(moved));
});

void test("gnokeyPublish: nothing for a slug, data or realm not of their shape (nothing unchecked reaches a shell)", () => {
  const ok = { realm: "gno.land/r/x/golf", slug: "a-b", hex: "00ff", note: "", gas: 1e8, price: 0.001, deposit: 1, chainId: "dev", rpc: "http://127.0.0.1:26657" };
  assert.notEqual(gnokeyPublish(ok), "");
  for (const bad of [{ slug: "a b" }, { slug: "$(x)" }, { hex: "0g" }, { hex: "0" }, { realm: "gno.land/r/x;rm" }, { deposit: -1 }, { gas: 1.5 }]) {
    assert.equal(gnokeyPublish({ ...ok, ...bad }), "", JSON.stringify(bad));
  }
});
