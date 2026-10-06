// What a new hole starts from (lib/builder/templates.ts, starters.ts): a
// blank lane, or one of its world's three starters, each passing every check
// and holed in every weather its world asks for (the rounds kept by
// scripts/starters.ts): a new hole is never one the Builder refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host } from "./builder-fixture.ts";
import "./scene-harness.ts";
import fs from "node:fs";
import { blank, startsIn } from "../lib/builder/templates.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { exportDraft, parseDraft } from "../lib/builder/draft.ts";
import { unknownEntry } from "../lib/builder/edit.ts";
import { canonicalHex, proofKey, replay, required, unproven, type Proof } from "../lib/builder/proof.ts";
import { holeRow } from "../lib/builder/testmode.ts";
import { makeLocalChain } from "../lib/builder/localchain.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { FIELD } from "../lib/builder/rules.ts";

const { census } = await import("../lib/builder/drawn.ts");

const ROUNDS = JSON.parse(fs.readFileSync(new URL("./builder-starters.json", import.meta.url), "utf8")) as Record<string, Record<string, { period: number; shots: string[] }>>;
const AUTHOR = "g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv";

void test("the starters: three a world, each whole, passing every check, holed in every weather its world asks for (scripts/starters.ts)", async () => {
  assert.deepEqual(Object.keys(STARTERS).sort(), Object.keys(FIELD).sort());
  for (const [world, list] of Object.entries(STARTERS)) {
    assert.deepEqual(Object.keys(list), ["straight", "dogleg", "signature"], world);
    const palette = await loadPalette(world);
    for (const [name, d0] of Object.entries(list)) {
      const slug = `${world}-${name}`, d = { ...d0, slug }, id = `${AUTHOR}/${slug}/v1`;
      assert.deepEqual(parseDraft(exportDraft(d0)), d0, `${slug}: whole`);
      assert.equal(unknownEntry(d0, palette), null, `${slug}: its world's pieces`);
      assert.deepEqual(validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error").map((i) => i.text), [], slug);
      const hex = canonicalHex(d, host)!, key = (await proofKey(d, host))!;
      const proofs: Proof[] = [];
      for (const kind of required(world)) {
        const r = ROUNDS[slug]?.[kind];
        assert.ok(r, `${slug}: a round in ${kind || "clear"}`);
        const p = await replay(makeLocalChain(host, holeRow(id, d), hex, r.period), { key, id, kind, period: r.period, shots: r.shots });
        assert.equal(typeof p, "object", `${slug} in ${kind || "clear"}: ${JSON.stringify(p)}`);
        proofs.push(p as Proof);
      }
      assert.deepEqual(unproven(proofs, world, key, id), [], slug);
    }
  }
});

void test("startsIn: a world's starters then a blank lane, each a copy of its own", () => {
  const s = startsIn("island");
  assert.deepEqual(s.map((x) => x.name), ["straight", "dogleg", "signature", "blank"]);
  assert.match(s[0].title, /^Straight · par 2$/);
  s[0].draft.pieces.length = 0;
  assert.ok(STARTERS.island.straight.pieces.length > 0, "a starter is never changed through its copy");
  assert.deepEqual(startsIn("nowhere").map((x) => x.name), ["blank"]);
});

void test("blank: a plain lane that passes every check, in every world", async () => {
  for (const world of Object.keys(FIELD)) {
    const d = blank(world), palette = await loadPalette(world);
    assert.equal(d.world, world);
    assert.ok(d.pieces.length >= 4, world);
    const errors = validate(d, { host, palette, census }).issues.filter((i) => i.severity === "error");
    assert.deepEqual(errors.map((i) => `${i.rule} ${i.text}`), [], world);
  }
});
