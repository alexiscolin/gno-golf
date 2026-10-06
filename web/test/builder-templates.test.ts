// What a new hole starts from (lib/builder/templates.ts): a blank hole is a
// plain lane, the tee and the cup at its ends, that passes every check in
// every world: a new hole is never one the Builder refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { blank } from "../lib/builder/templates.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { FIELD } from "../lib/builder/rules.ts";

const { census } = await import("../lib/builder/drawn.ts");

void test("blank: a plain lane that passes every check, in every world", async () => {
  for (const world of Object.keys(FIELD)) {
    const d = blank(world), palette = await loadPalette(world);
    assert.equal(d.world, world);
    assert.ok(d.pieces.length >= 4, world);
    const errors = validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error");
    assert.deepEqual(errors.map((i) => `${i.rule} ${i.text}`), [], world);
  }
});
