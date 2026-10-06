// The hole builder's checks in the browser (lib/builder/wasm.ts): builder.wasm's
// check (PublishMine's own checks: the slug, the data, its work, the name and
// note) and fit (the chain's Decode, author.Fit and Encode on a draft), in
// their host. (Their refusals against the realm's PublishMine: scripts/wasmparity.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeBuilderHost } from "../lib/builder/wasm.ts";
import { makeHost } from "../lib/sim/host.ts";

const repo = new URL("../../", import.meta.url);
const mod = new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/builder.wasm", repo)));
const host = makeBuilderHost(mod);
const lines = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").trim().split("\n").map((l) => l.split(" "));
const hex = lines[0][3];
const why = (r: { ok: boolean; why?: string }) => (r.ok ? "ok" : r.why);

void test("a course hole's data passes the publish check, its work set against the realm's limits", () => {
  const r = host.check("my-hole", hex, "a quiet\u0000one​");
  assert.ok(r.ok);
  const c = r.cost;
  assert.ok(c.name.length > 0);
  assert.equal(c.note, "a quietone", "the note as the chain keeps it: no control or zero-width characters");
  assert.equal(c.bytes, hex.length / 2);
  assert.deepEqual([c.maxShot, c.budget, c.minShot], [1300000000, 1400000000, 800000]);
  assert.ok(c.bound > 0 && c.bound <= c.maxShot);
  assert.ok(c.worst > c.bound && c.worst <= c.budget);
  assert.ok(c.room >= c.minShot && c.room <= 1000000, "a first shot's room in the dearest weather, capped at MaxWork");
});

void test("every course hole passes it, and fit at the course's margin gives its data back", () => {
  const moved: string[] = [];
  for (const [slot, , , h] of lines) {
    assert.equal(why(host.check("x", h)), "ok", slot);
    const f = host.fit(h, 1.5);
    assert.ok(f.ok && f.dx === 0 && f.dy === 0, slot);
    if (f.hex !== h) moved.push(slot);
  }
  // all but one: mines/17's leftmost piece lies a hair inside 1.5, so Fit
  // shifts it by an ulp of a small number (one byte of one float). A draft on
  // the builder's grid (multiples of 1/4) is shifted exactly (builder-gg1).
  assert.deepEqual(moved, ["mines/17"]);
});

void test("a refusal is the realm's sentence", () => {
  assert.equal(why(host.check("Bad_Slug", hex)), "golf: a slug is 1 to 32 of a-z, 0-9 and -");
  assert.equal(why(host.check("ok", hex + "0")), "golf: the data is not hex");
  assert.equal(why(host.check("ok", hex.slice(0, 40))), "golf: course: truncated data");
  assert.equal(why(host.check("ok", "00" + hex.slice(2))), "golf: course: not GG1 data");
  assert.equal(why(host.check("ok", hex + "00")), "golf: course: trailing bytes after the hole");
  assert.equal(why(host.check("ok", hex, "see t.me/x")), "golf: a community hole's name and note carry no web address");
  assert.equal(why(host.check("ok", "ab".repeat(32 << 10) + "ab")), "golf: the data is too long");
});

void test("hex in capitals reads as encoding/hex reads it", () => {
  assert.equal(why(host.check("ok", hex.toUpperCase())), "ok");
});

void test("the host goes on after a refusal", () => {
  assert.equal(host.check("ok", "zz").ok, false);
  assert.equal(host.check("ok", hex).ok, true);
});

void test("fit moves a hole to the margin and sizes the board to it; fitted again, it stays", () => {
  const r = host.fit(hex, 3);
  assert.ok(r.ok);
  assert.ok(Math.abs(r.dx - 1.5) < 1e-9 && Math.abs(r.dy - 1.5) < 1e-9, `${r.dx}, ${r.dy}`);
  assert.ok(r.w > 0 && r.w <= 96 && r.h > 0 && r.h <= 96);
  assert.equal(why(host.check("ok", r.hex)), "ok");
  const again = host.fit(r.hex, 3);
  assert.ok(again.ok);
  assert.equal(again.hex, r.hex);
  assert.deepEqual([again.dx, again.dy], [0, 0]);
});

void test("fit refuses what Decode refuses, in its words", () => {
  assert.equal(why(host.fit("00", 1.5)), "golf: course: not GG1 data");
  assert.equal(why(host.fit("0", 1.5)), "golf: the data is not hex");
});

void test("its sources are deployed files: the realm's and the course's, never author's", () => {
  const src = Object.keys(host.sources());
  assert.ok(src.includes("gno.land/r/gnogolf/golf/v2/data.gno"));
  assert.ok(src.every((p) => !p.includes("/author/")));
});

void test("it plays as golf.wasm does: test mode's simulation is the game's", () => {
  const sim = makeHost(mod);
  sim.load("garden/1/v1", hex);
  const golf = makeHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo))));
  golf.load("garden/1/v1", hex);
  assert.equal(sim.from("garden/1/v1", 3, 3, "21.00,8.00", 0, 5967997), golf.from("garden/1/v1", 3, 3, "21.00,8.00", 0, 5967997));
});
