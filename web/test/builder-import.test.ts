// Opening a hole in the Builder (lib/builder/importing.ts): a file, whole
// and of its world's pieces, or refused with why; a published hole read back
// as a draft (its pieces matched to the palette, its bars recovered), or
// refused naming the pieces the Builder does not make; a draft as a file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { host, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { draftFile, fromFile, fromPublished } from "../lib/builder/importing.ts";
import { exportDraft } from "../lib/builder/draft.ts";
import { canonicalHex } from "../lib/builder/proof.ts";
import { STARTERS } from "../lib/builder/starters.ts";

const holes = new Map(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => [slot, hex]));
const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38);

void test("fromFile: a draft whole and of its world's pieces; else why", async () => {
  const d = lane("garden", []);
  assert.deepEqual(await fromFile(exportDraft(d)), d);
  assert.equal(await fromFile("{"), "The file is not a draft.");
  const foreign = { ...d, pieces: [{ ...d.pieces[0], entry: "island/post/palm" }] };
  assert.equal(await fromFile(exportDraft(foreign)), "Piece r1 is no piece of the Garden's.");
});

void test("fromPublished: a hole the Builder published opens as a draft (its slug yours only if the hole is yours); an off-grid course hole does not", async () => {
  const hex = canonicalHex({ ...STARTERS.garden.straight, title: "Mole Run" }, host)!;
  const d = await fromPublished(hex, host, `${B}/lane/v1`, A);
  assert.equal(typeof d, "object", JSON.stringify(d));
  if (typeof d === "string") return;
  assert.equal(d.world, "garden");
  assert.ok(d.pieces.length > 0 && d.title === "Mole Run");
  assert.equal(d.slug, "");
  const mine = await fromPublished(hex, host, `${A}/mole-run/v3`, A);
  assert.equal(typeof mine !== "string" && mine.slug, "mole-run", "your own hole: its next version");
  assert.match(String(await fromPublished(holes.get("garden/6")!, host, "garden/6/v1", A)), /off the grid/, "a course hole written by hand: not on the Builder's grid");
});

void test("fromPublished: a hole with pieces the Builder does not make is refused, naming them", async () => {
  const r = await fromPublished(holes.get("island/4")!, host, "island/4/v1", A);
  assert.equal(typeof r, "string");
  assert.match(typeof r === "string" ? r : "", /^This hole has pieces the Builder doesn't make: the rail rowing boat at \(30\.24, 7\.19\)/);
  assert.equal(await fromPublished("zz", host, "x/v1", A), "This hole's data could not be read.");
});

void test("fromPublished: a hole the Builder's rules refuse never opens in the editor (the course holes it is stricter on)", async () => {
  for (const slot of ["town/14"]) {
    const r = await fromPublished(holes.get(slot)!, host, `${slot}/v1`, A);
    assert.equal(typeof r, "string", `${slot} opened`);
  }
  const door = await fromPublished(holes.get("town/14")!, host, "town/14/v1", A);
  assert.match(typeof door === "string" ? door : "", /^This hole breaks the Builder's rules: /);
});

void test("fromPublished, fromFile: a Crystal Mines hole never opens in the Builder (not one of its worlds), said plainly", async () => {
  const want = "The Builder makes holes in the Garden, the Island, Mushroom Town and the Mountain: this one is in the Crystal Mines, and stays playable in the game.";
  for (const slot of ["mines/1", "mines/3", "mines/12"]) assert.equal(await fromPublished(holes.get(slot)!, host, `${slot}/v1`, A), want, slot);
  assert.equal(await fromFile(JSON.stringify({ ...lane("garden", []), world: "mines" })), want);
});

void test("draftFile: a file name from the slug, else the name, else a plain one; never a path", () => {
  const d = lane("garden", []);
  assert.equal(draftFile({ ...d, slug: "mole-run" }), "mole-run.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "Mole Run / ../x" }), "mole-run-x.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "" }), "hole.gnogolf.json");
});
