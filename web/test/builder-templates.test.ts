// What a new hole starts from (lib/builder/templates.ts, starters.ts): a
// blank lane, or one of its world's three starters, each passing every check
// and holed in every weather its world asks for (the rounds kept by
// scripts/starters.ts): a new hole is never one the Builder refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host } from "./builder-fixture.ts";
import "./scene-harness.ts";
import fs from "node:fs";
import { blank, firstRun, retitle, slugOf, startsIn } from "../lib/builder/templates.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { exportDraft, parseDraft } from "../lib/builder/draft.ts";
import { unknownEntry } from "../lib/builder/edit.ts";
import { canonicalHex, proofKey, replay, unproven, type Proof } from "../lib/builder/proof.ts";
import { required } from "../lib/builder/rules.ts";
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
  assert.deepEqual([s[0].title, s[0].par], ["Straight", 2]);
  assert.deepEqual([s[3].title, s[3].par], ["Blank lane", 0], "a blank lane has no par yet");
  s[0].draft.pieces.length = 0;
  assert.ok(STARTERS.island.straight.pieces.length > 0, "a starter is never changed through its copy");
  assert.deepEqual(startsIn("nowhere").map((x) => x.name), ["blank"]);
});

void test("startsIn: each card says in a line what it is, a signature by its world's own piece", () => {
  const lines = Object.fromEntries(Object.keys(FIELD).map((w) => [w, startsIn(w).map((x) => `${x.title}: ${x.line}`)]));
  assert.deepEqual(lines.garden, ["Straight: A short lane to learn the tools", "Dogleg: One turn to bank around", "The moon bridge: A moon bridge in the lane: roll up and over it", "Blank lane: An empty lane, all yours"]);
  assert.equal(lines.island[2], "The tidepool: A tidepool in the lane: keep the ball out of it");
  assert.equal(lines.town[2], "The funbox: A funbox in the lane: roll up and over it");
  assert.equal(lines.mountain[2], "The kicker: A kicker in the lane: roll up and over it");
  for (const [w, l] of Object.entries(lines)) assert.ok(l.every((x) => x.length <= 64), `${w}: a line fits a card`);
});

void test("the starters are made of their world's own pieces: none borrowed from another world", async () => {
  for (const world of Object.keys(FIELD)) {
    const palette = await loadPalette(world);
    for (const s of startsIn(world)) for (const p of s.draft.pieces) assert.ok(palette.some((e) => e.id === p.entry && !e.borrowed), `${world} ${s.name}: ${p.entry}`);
  }
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

void test("firstRun: a new player opens on the Garden's dogleg, playable and passing every check; never again once hinted, never over their own drafts", () => {
  const d = firstRun([], false);
  assert.ok(d);
  assert.deepEqual([d.world, d.title, d.slug, d.par], ["garden", "Garden Dogleg", "garden-dogleg", 3]);
  assert.equal(firstRun([d], false), null, "a draft of theirs: the drafts screen");
  assert.equal(firstRun([], true), null, "hinted once already: the drafts screen");
});

void test("defaults: a new hole is named from its world and starter, its address from its name; the address follows the name until the hole is first proved, never a hand-set one", () => {
  const dog = startsIn("garden").find((s) => s.name === "dogleg")!;
  assert.equal(dog.draft.title, "Garden Dogleg");
  assert.equal(dog.draft.slug, "garden-dogleg");
  assert.equal(startsIn("mountain").find((s) => s.name === "blank")!.draft.title, "Mountain Lane");
  assert.equal(startsIn("island").find((s) => s.name === "signature")!.draft.title, "Island Tidepool", "a signature named by its piece");
  assert.equal(slugOf("  Le Grand Saut! "), "le-grand-saut");
  assert.equal(slugOf("!!!"), "hole");
  assert.equal(slugOf("x".repeat(50)).length, 32);
  const d = dog.draft;
  assert.deepEqual([retitle(d, "Mole Run").title, retitle(d, "Mole Run").slug], ["Mole Run", "mole-run"], "the address follows");
  assert.equal(retitle({ ...d, slug: "my-own" }, "Mole Run").slug, "my-own", "a hand-set address is kept");
  const proved = { ...d, proofs: [{ key: "k", id: "x", kind: "", period: 1, shots: [], commits: [], strokes: 2, maxWork: 1 }] };
  assert.equal(retitle(proved, "Mole Run").slug, "garden-dogleg", "proved: its address fixed (the proofs are bound to it)");
});
