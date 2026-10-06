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

const holes = new Map(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => [slot, hex]));
const A = "g1" + "a".repeat(38);

void test("fromFile: a draft whole and of its world's pieces; else why", async () => {
  const d = lane("garden", []);
  assert.deepEqual(await fromFile(exportDraft(d)), d);
  assert.equal(await fromFile("{"), "The file is not a draft.");
  const foreign = { ...d, pieces: [{ ...d.pieces[0], entry: "island/post/palm" }] };
  assert.equal(await fromFile(exportDraft(foreign)), "Piece r1 is no piece of the Garden's.");
});

void test("fromPublished: a course hole of palette pieces opens as a draft (its slug yours only if the hole is yours)", async () => {
  const d = await fromPublished(holes.get("garden/6")!, host, "garden/6/v1", A);
  assert.equal(typeof d, "object", JSON.stringify(d));
  if (typeof d === "string") return;
  assert.equal(d.world, "garden");
  assert.ok(d.pieces.length > 0 && d.title.length > 0);
  assert.equal(d.slug, "");
  const mine = await fromPublished(holes.get("garden/6")!, host, `${A}/mole-run/v3`, A);
  assert.equal(typeof mine !== "string" && mine.slug, "mole-run", "your own hole: its next version");
});

void test("fromPublished: a hole with pieces the Builder does not make is refused, naming them", async () => {
  const r = await fromPublished(holes.get("mines/3")!, host, "mines/3/v1", A);
  assert.equal(typeof r, "string");
  assert.match(typeof r === "string" ? r : "", /^This hole has pieces the Builder doesn't make: the rail cart at \(26\.7, 4\.2\)/);
  assert.equal(await fromPublished("zz", host, "x/v1", A), "This hole's data could not be read.");
});

void test("draftFile: a file name from the slug, else the name, else a plain one; never a path", () => {
  const d = lane("garden", []);
  assert.equal(draftFile({ ...d, slug: "mole-run" }), "mole-run.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "Mole Run / ../x" }), "mole-run-x.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "" }), "hole.gnogolf.json");
});
