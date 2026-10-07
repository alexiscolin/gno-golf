// Publishing a hole (lib/builder/publish.ts): the storage deposit and the gas
// a PublishMine asks for, from the realm's own figures (the z_builder_publish
// filetests), the bill shown before any signature, and the gnokey command,
// whose every argument reaches the realm as the page shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { bill, deposit, finalHex, gasFor, gnokeyPublish, holeHolds, parLine, publishBytes, publishSteps, shq, STORED } from "../lib/builder/publish.ts";
import { shaOf } from "../lib/builder/proof.ts";

// the rules the Builder publishes under (golf/v2, chain.ts's REALM), its records in store
const GOLF = new URL("../../gno.land/r/gnogolf/golf/v2/", import.meta.url);
/** A filetest's golden numbers: what golf/v2 and store stored, and the gas. */
const golden = (name: string) => {
  const s = fs.readFileSync(new URL(`z_builder_publish_${name}_filetest.gno`, GOLF), "utf8");
  const at = (realm: string) => Number(new RegExp(`// ${realm.replaceAll("/", "\\/")}: (-?\\d+)`).exec(s)![1]);
  return { stored: at("gno.land/r/gnogolf/golf/v2") + at("gno.land/r/gnogolf/store"), gas: Number(/\/\/ Gas:\n\/\/ (\d+)/.exec(s)![1]) };
};
const warm = golden("warm");
const own = (name: string) => ({ stored: golden(name).stored - warm.stored, gas: golden(name).gas - warm.gas });
const FOUR = "\u{10400}";
// the measured holes: their data's bytes (course.Encode's), name and note
const CASES = {
  more: { bytes: 364, name: "More", note: "", v: 1, newAuthor: false },
  author: { bytes: 364, name: "Lane", note: "", v: 1, newAuthor: true },
  heavy: { bytes: 5346, name: "Fixture", note: "", v: 1, newAuthor: false },
  named: { bytes: 520, name: FOUR.repeat(40), note: FOUR.repeat(140), v: 1, newAuthor: false },
  version: { bytes: 364, name: "Warm", note: "", v: 2, newAuthor: false },
};

void test("publishBytes: what each measured publish stored, within a few bytes (the realm's own figures)", () => {
  for (const [name, c] of Object.entries(CASES)) {
    const want = own(name).stored, got = publishBytes(c);
    assert.ok(Math.abs(got - want) <= 24, `${name}: ${got} for ${want}`);
  }
  assert.ok(STORED.overhead > 1500 && STORED.overhead < 3000, "v2: an entry and its index rows, no first leaves");
});

void test("publishBytes: the chain's first community hole costs what any first publish does (store made the indexes' first leaves at its deploy)", () => {
  const first = { bytes: 364, name: "Warm", note: "", v: 1, newAuthor: true };
  assert.ok(Math.abs(publishBytes(first) - warm.stored) < 160, `${publishBytes(first)} for ${warm.stored}`);
  assert.ok(deposit({ ...first, price: 100 }) >= warm.stored * 100, "the very first publish, on an empty store: still within the deposit's tenth");
  assert.ok(!("firstCommunity" in STORED), "no surcharge for being first: v1's, which its first publisher paid");
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
  const by = "g1" + "c".repeat(38);
  const cmd = gnokeyPublish({ realm: "gno.land/r/x/golf", slug: "a-b", hex: "00ff", note: "Let's go; $(x)", gas: 1e8, price: 0.001, deposit: 600000, chainId: "dev", rpc: "http://127.0.0.1:26657", author: by });
  assert.match(cmd, /-func PublishMine -args a-b -args 00ff -args 'Let'\\''s go; \$\(x\)'/);
  assert.match(cmd, /-max-deposit 600000ugnot/, "the deposit capped at the bill's");
  assert.ok(cmd.endsWith(`-chainid dev -remote http://127.0.0.1:26657 ${by}`), "signed by the proved author's key, named by its address: a keybase without it refuses (the weather was proved under that address)");
});

const A = "g1" + "a".repeat(38);
const ver = (v: number, sha = "old") => ({ id: `${A}/lane/v${v}`, v, height: 1, by: A, sha, note: "", next: "" });
const ready = { publishing: true, rules: true, versions: { version: 1, slot: `${A}/lane`, versions: [ver(1)] }, writer: "gno.land/r/gnogolf/golf/v2", taken: false, hole: "", name: "" };
const at = { author: A, slug: "lane", proved: `${A}/lane/v2`, sha: "new", realm: "gno.land/r/gnogolf/golf/v2" };

void test("publishSteps: open once every check holds; else the first that does not, in words", () => {
  assert.deepEqual(publishSteps(ready, at), { at: "ready", why: "" });
  assert.equal(publishSteps({ ...ready, publishing: undefined }, at).at, "reading");
  assert.deepEqual(publishSteps({ ...ready, publishing: false }, at), { at: "closed", why: "Publishing isn't open on gno.land yet. Your draft is kept." });
  assert.deepEqual(publishSteps({ ...ready, rules: false }, at), { at: "rules", why: "The Builder's checks are not the chain's current rules. Reload the page, or wait for the site to catch up." });
  assert.equal(publishSteps({ ...ready, versions: null }, at).at, "unread");
  assert.equal(publishSteps({ ...ready, publishing: null }, at).at, "unread", "a read that failed is said, never waited on");
  assert.equal(publishSteps({ ...ready, rules: null }, at).at, "unread");
  // the records' realm: a publish's last act is to write there (golf's flush); paused, or new rules writing, it would fail after its gas
  assert.deepEqual(publishSteps({ ...ready, writer: "" }, at), { at: "paused", why: "Saves are paused on gno.land for now. Your draft is kept." });
  assert.deepEqual(publishSteps({ ...ready, writer: "gno.land/r/gnogolf/golf/v3" }, at), { at: "rules", why: "New rules play this course now. Your draft is kept: reload the page once the site has caught up." });
  assert.equal(publishSteps({ ...ready, writer: null }, at).at, "unread");
  assert.equal(publishSteps({ ...ready, writer: undefined }, at).at, "reading");
  // a hole the site took down: never published again (its next version would be down too, its fee spent for nothing)
  assert.deepEqual(publishSteps({ ...ready, taken: true }, at), { at: "taken", why: "This hole was taken down: it cannot be published again." });
  assert.equal(publishSteps({ ...ready, taken: undefined }, at).at, "reading");
  const newer = publishSteps({ ...ready, versions: { ...ready.versions, versions: [ver(1), ver(2)] } }, at);
  assert.deepEqual(newer, { at: "newer", why: "This one would be v3, with new weather: test it again." }, "a version published elsewhere since: its proofs are another id's");
  assert.deepEqual(publishSteps(ready, { ...at, sha: "old" }), { at: "same", why: "This is exactly the version already published." });
  assert.deepEqual(publishSteps({ ...ready, hole: "Par 1 is below the 5 strokes it was proved in: at least 6." }, at), { at: "hole", why: "Par 1 is below the 5 strokes it was proved in: at least 6." });
  assert.equal(publishSteps({ ...ready, hole: undefined }, at).at, "reading", "the hole still being judged");
  assert.deepEqual(publishSteps({ ...ready, name: "The name or the note looks like a web address." }, at), { at: "name", why: "The name or the note looks like a web address." });
  assert.equal(publishSteps({ ...ready, publishing: false, rules: false }, at).at, "closed", "closed first: nothing else matters then");
});

void test("the final data: the name as the chain keeps it written in; the proofs replay on it; its sha the realm's", async () => {
  const { host } = await import("./builder-fixture.ts");
  await import("./scene-harness.ts");
  const { STARTERS } = await import("../lib/builder/starters.ts");
  const { proofKey, replay, suggestPar } = await import("../lib/builder/proof.ts");
  const { required } = await import("../lib/builder/rules.ts");
  const { loadPalette } = await import("../lib/builder/palette.ts");
  const { census } = await import("../lib/builder/drawn.ts");
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
  d.par = suggestPar(d.proofs);
  const hex = finalHex(d, host, "Garden Straight")!;
  const o = { host, palette: await loadPalette("garden"), census };
  assert.equal(host.decode(hex).title, "Garden Straight", "the name as the chain keeps it, in the data");
  assert.equal(await holeHolds(d, hex, key, id, o), "", "a new name moves no ball");
  const moved = finalHex({ ...d, pieces: d.pieces.map((p) => (p.id === "p1" && p.geometry.t === "post" ? { ...p, geometry: { ...p.geometry, c: [p.geometry.c[0], p.geometry.c[1] + 2] as [number, number] } } : p)) }, host, "x")!;
  assert.equal(typeof (await holeHolds(d, moved, key, id, o)), "string");
  assert.match(await holeHolds({ ...d, proofs: [] }, hex, key, id, o), /^The rounds that proved it/, "no proof, nothing holds");
  const most = Math.max(...d.proofs.map((p) => (p as { strokes: number }).strokes));
  assert.equal(await holeHolds({ ...d, par: 1 }, hex, key, id, o), `Par 1 is below the ${most} strokes it was proved in: at least ${most + 1}.`, "a draft file's par below its proofs: refused here, test mode or not");
  const told = { ...d, proofs: d.proofs.map((p) => ({ ...(p as object), strokes: most + 3 })) as never[] };
  assert.match(await holeHolds({ ...told, par: most + 4 }, hex, key, id, o), /^The rounds that proved it/, "a proof's strokes must be what its replay takes");
  const broken = { ...d, pieces: [...d.pieces, { ...d.pieces.find((p) => p.geometry.t === "post")!, id: "px", geometry: { t: "post" as const, c: d.pin, r: 0.8 } }] };
  assert.match(await holeHolds(broken, hex, key, id, o), /^This hole breaks the Builder's rules: The .+\. Fix it in Edit\.$/, "the Builder's own rules, census included, once more on the final draft");
  assert.match(await shaOf(hex), /^[0-9a-f]{64}$/);
  assert.notEqual(await shaOf(hex), await shaOf(moved));
});

void test("gnokeyPublish: nothing for a slug, data or realm not of their shape (nothing unchecked reaches a shell)", () => {
  const ok = { realm: "gno.land/r/x/golf", slug: "a-b", hex: "00ff", note: "", gas: 1e8, price: 0.001, deposit: 1, chainId: "dev", rpc: "http://127.0.0.1:26657", author: "g1" + "c".repeat(38) };
  assert.notEqual(gnokeyPublish(ok), "");
  for (const bad of [{ slug: "a b" }, { slug: "$(x)" }, { hex: "0g" }, { hex: "0" }, { realm: "gno.land/r/x;rm" }, { deposit: -1 }, { gas: 1.5 }, { author: "" }, { author: "mykey" }, { author: "g1x; rm -rf ~" }]) {
    assert.equal(gnokeyPublish({ ...ok, ...bad }), "", JSON.stringify(bad));
  }
});

void test("parLine: the par explained from the rounds that proved it", () => {
  const s = (...strokes: number[]) => strokes.map((n) => ({ strokes: n }));
  assert.equal(parLine(s(2, 2, 2), 3), "Holed in 2 everywhere · par 3 leaves room");
  assert.equal(parLine(s(2, 3, 2), 4), "Holed in 2 to 3 by weather · par 4 leaves room");
  assert.equal(parLine(s(1, 1, 1), 2), "Holed in 1 everywhere · par 2 leaves room");
  assert.equal(parLine(s(2, 2, 2), 5), "Holed in 2 everywhere · par 5 leaves room");
  assert.equal(parLine(s(3, 3), 3), "Holed in 3 everywhere · par 3 leaves none: at least 4", "a par the rounds do not allow (Publish refuses it too)");
  assert.equal(parLine([], 3), "");
});
