// The hole builder's checks in the browser (lib/builder/wasm.ts): builder.wasm's
// check (PublishMine's own checks: the slug, the data, its work, the name and
// note) and fit (the chain's Decode, author.Fit and Encode on a draft), in
// their host. (Their refusals against the realm's PublishMine: scripts/wasmparity.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makeBuilderHost } from "../lib/builder/wasm.ts";
import { makeHost } from "../lib/sim/host.ts";
import { draftHex } from "../lib/builder/gg1.ts";
import type { GHole } from "../lib/builder/types.ts";

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
    const f = host.fit(h, "", 1.5);
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

void test("fit says the extent's low corner, the margin, on every course hole", () => {
  for (const [slot, , , h] of lines) {
    const f = host.fit(h, "", 1.5);
    assert.ok(f.ok && f.w <= 96 && f.h <= 96, slot);
    // (mines/17's leftmost piece a hair inside it: the known ulp)
    if (slot !== "mines/17") assert.deepEqual(f.lo, [1.5, 1.5], slot);
    else assert.ok(Math.abs(f.lo[0] - 1.5) < 1e-12 && Math.abs(f.lo[1] - 1.5) < 1e-12);
  }
});

void test("a draft out of its frame is refused: the builder keeps every draft framed", () => {
  assert.equal(why(host.fit(hex, "", 3)), "builder: the draft is not in its frame");
});

void test("fit refuses what Decode refuses, in its words", () => {
  assert.equal(why(host.fit("00", "", 1.5)), "golf: course: not GG1 data");
  assert.equal(why(host.fit("0", "", 1.5)), "golf: the data is not hex");
});

void test("bar gives build.Bar's corners: a 4-long bar along X, 0.5 thick", () => {
  assert.deepEqual(host.bar("2 2 6 2 0.5"), [[1.75, 2.25], [6.25, 2.25], [6.25, 1.75], [1.75, 1.75]]);
  assert.deepEqual(host.bar("0 0 3 4 1").length, 4, "a slanted one");
  assert.equal(host.bar("1 1 1 1 0.5").length, 0, "none for a bar of no length");
});

void test("its sources are deployed files: the realm's and the course's, never author's", () => {
  const src = Object.keys(host.sources());
  assert.ok(src.includes("gno.land/r/gnogolf/golf/v2/data.gno"));
  assert.ok(src.every((p) => !p.includes("/author/")));
});

void test("it plays as golf.wasm does: test mode's simulation is the game's", () => {
  const sim = makeBuilderHost(mod);
  sim.load("garden/1/v1", hex);
  sim.setperiod(5967997);
  const golf = makeHost(new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo))));
  golf.load("garden/1/v1", hex);
  assert.equal(sim.from("garden/1/v1", 3, 3, "21.00,8.00", 0, 5967997), golf.from("garden/1/v1", 3, 3, "21.00,8.00", 0, 5967997));
});

void test("decode is lossless: every course hole, written back by gg1 and fitted, is the same bytes", () => {
  for (const [slot, , , h] of lines) {
    const g: GHole = host.decode(h);
    assert.ok(g.w >= 1 && g.w <= 96 && g.walls.length + g.pulses.reduce((n, p) => n + p.walls.length, 0) <= 160, slot);
    const back = host.fit(draftHex(g), "", 1.5);
    assert.ok(back.ok, slot);
    if (slot !== "mines/17") assert.equal(back.hex, h, slot);
  }
});

void test("decode refuses what Decode refuses", () => {
  assert.throws(() => host.decode("00"), /golf: course: not GG1 data/);
});

const ID = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/t/v1", P = 5967997;

void test("state answers HoleState at the clock set; forecast refuses a period ahead of it", () => {
  host.load(ID, hex);
  host.setperiod(P);
  const s = JSON.parse(host.state(ID)) as { period: number; hole: string; slot: string; v: number; official: boolean; walls: unknown[] };
  assert.equal(s.period, P);
  assert.equal(s.hole, ID);
  assert.equal(s.slot, "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/t");
  assert.equal(s.v, 1);
  assert.equal(s.official, false);
  assert.ok(s.walls.length > 0);
  assert.equal((JSON.parse(host.forecast(ID, P)) as { period: number }).period, P);
  assert.equal(host.forecast(ID, P + 1), "panic: golf: that weather has not come yet");
  assert.match(host.extras(ID, 0), /^\{"version":1,"walls":/);
});

void test("the clock survives a refusal: a new instance is set to it again", () => {
  host.setperiod(P);
  assert.equal(host.check("Bad_Slug", hex).ok, false);
  assert.equal((JSON.parse(host.state(ID)) as { period: number }).period, P);
});

void test("find gives the latest period of a kind; commit plays from a ball, as SimulateCommit", () => {
  host.load(ID, hex);
  host.setperiod(P);
  const p = host.find(ID, "rain", P);
  assert.ok(p > P - 10000 && p <= P, String(p));
  assert.equal((JSON.parse(host.forecast(ID, p)) as { kind: string }).kind, "rain");
  assert.equal(host.find(ID, "snow", P), -1, "the garden has no snow");
  const first = JSON.parse(host.round(ID, "21.00,8.00", p)) as { rest: [number, number] };
  assert.ok(Array.isArray(first.rest));
  assert.match(host.commit(ID, first.rest[0], first.rest[1], 1, "290.50,7.75", P), /^\{/);
  assert.match(host.commit(ID, 3, 3, 0, "10.00,1.00", P - 5), /^panic: golf: /, "a first stroke in a period long gone: the realm's refusal");
});
