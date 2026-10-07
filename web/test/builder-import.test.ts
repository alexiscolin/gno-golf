// Opening a hole in the Builder (lib/builder/importing.ts): a file, whole
// and of its world's pieces, or refused with why; a published hole read back
// as a draft (its pieces matched to the palette, its bars recovered), or
// refused naming the pieces the Builder does not make; a draft as a file.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hexOf, host, lane } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { draftFile, fromFile, fromPublished, openPublished, remixFrom, remixOf } from "../lib/builder/importing.ts";
import { remixId, remixLink } from "../lib/builder/holes.ts";
import { MAX_NOTE } from "../lib/builder/draft.ts";
import { exportDraft } from "../lib/builder/draft.ts";
import { canonicalHex } from "../lib/builder/proof.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { census } from "../lib/builder/drawn.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { testGate } from "../lib/builder/editor.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { judge } from "../lib/builder/verdict.ts";
import type { Hole } from "../lib/scene/data.ts";

const holes = new Map(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" ")).map(([slot, , , hex]) => [slot, hex]));
const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38);

void test("fromFile: a draft whole and of its world's pieces; else why", async () => {
  const d = lane("garden", []);
  assert.deepEqual(await fromFile(exportDraft(d), host, census), { draft: d, broken: "" });
  assert.equal(await fromFile("{", host, census), "The file is not a draft.");
  const foreign = { ...d, pieces: [{ ...d.pieces[0], entry: "island/post/palm" }] };
  assert.equal(await fromFile(exportDraft(foreign), host, census), "Piece r1 is no piece of the Garden's.");
});

void test("fromFile, fromPublished: an opened hole goes through the editor's own checks, the render census with them; a file they refuse opens as it is, said broken, a published one never", async () => {
  const d = lane("garden", []), drawn: Hole[] = [], spy = (s: Hole) => (drawn.push(s), census(s));
  // a bumper on the cup: every piece the palette's, every number in range, and refused all the same (E3), as the board refuses it
  const onCup = { ...d, pieces: [...d.pieces, { id: "p1", entry: "*/post/bumper", geometry: { t: "post" as const, c: d.pin, r: 0.8 }, params: { bounce: 1.2 }, clock: { k: "fixed" as const } }] };
  const broken = await fromFile(exportDraft(onCup), host, spy);
  assert.ok(typeof broken === "object", "a broken file opens");
  if (typeof broken === "string") return;
  assert.deepEqual(broken.draft, onCup, "as it is, nothing changed");
  assert.equal(broken.broken, "This draft breaks the Builder's rules: The cup is inside the bumper: move the cup or the bumper. Fix what is marked: Prove and Publish stay locked until it passes.");
  // never proved nor published while broken: the editor's gate (and every edit judged against it as it was: never worse)
  const palette = await loadPalette("garden");
  assert.match(testGate(onCup, { of: onCup, v: validate(onCup, { host, palette, census }) }), /^Fix \d+ first$/);
  drawn.length = 0;
  assert.deepEqual(await fromFile(exportDraft(d), host, spy), { draft: d, broken: "" });
  assert.equal(drawn.length, 1, "the file's hole drawn for the census");
  drawn.length = 0;
  const opened = await fromPublished(canonicalHex(STARTERS.garden.straight, host)!, host, `${B}/lane/v1`, A, spy);
  assert.equal(typeof opened, "object", typeof opened === "string" ? opened : "");
  assert.equal(drawn.length, 1, "a published hole's drawn for the census too");
});

void test("fromPublished: a hole the Builder published opens as a draft (its slug yours only if the hole is yours); an off-grid course hole does not", async () => {
  const hex = canonicalHex({ ...STARTERS.garden.straight, title: "Mole Run" }, host)!;
  const d = await fromPublished(hex, host, `${B}/lane/v1`, A, census);
  assert.equal(typeof d, "object", JSON.stringify(d));
  if (typeof d === "string") return;
  assert.equal(d.world, "garden");
  assert.ok(d.pieces.length > 0 && d.title === "Mole Run");
  assert.equal(d.slug, "");
  const mine = await fromPublished(hex, host, `${A}/mole-run/v3`, A, census);
  assert.equal(typeof mine !== "string" && mine.slug, "mole-run", "your own hole: its next version");
  const byHand = await fromPublished(holes.get("garden/6")!, host, "garden/6/v1", A, census);
  assert.match(typeof byHand === "string" ? byHand : "", /off the grid/, "a course hole written by hand: not on the Builder's grid");
});

void test("fromPublished: a hole the site took down never opens in the Builder (nor comes back as a new version), its data not even read", async () => {
  const hex = hexOf(lane("garden", []));
  const taken = new Set([`${B}/rude`]);
  for (const id of [`${B}/rude/v1`, `${B}/rude/v3`, `${B}/rude`]) assert.equal(await fromPublished(hex, host, id, A, census, taken), "This hole was taken down: it cannot be opened in the Builder.", id);
  assert.equal(await fromPublished("zz", host, `${B}/rude/v1`, A, census, taken), "This hole was taken down: it cannot be opened in the Builder.", "said before the data is decoded");
  assert.equal(typeof (await fromPublished(hex, host, `${B}/other/v1`, A, census, taken)), "object");
});

void test("fromPublished: a hole with pieces the Builder does not make is refused, naming them", async () => {
  const r = await fromPublished(holes.get("island/4")!, host, "island/4/v1", A, census);
  assert.equal(typeof r, "string");
  assert.match(typeof r === "string" ? r : "", /^This hole has pieces the Builder doesn't make: the rail rowing boat at \(30\.24, 7\.19\)/);
  assert.equal(await fromPublished("zz", host, "x/v1", A, census), "This hole's data could not be read.");
});

void test("fromPublished: a hole the Builder's rules refuse never opens in the editor (the course holes it is stricter on)", async () => {
  for (const slot of ["town/14"]) {
    const r = await fromPublished(holes.get(slot)!, host, `${slot}/v1`, A, census);
    assert.equal(typeof r, "string", `${slot} opened`);
  }
  const door = await fromPublished(holes.get("town/14")!, host, "town/14/v1", A, census);
  assert.match(typeof door === "string" ? door : "", /^This hole breaks the Builder's rules: /);
});

void test("fromPublished, fromFile: a Crystal Mines hole never opens in the Builder (not one of its worlds), said plainly", async () => {
  const want = "The Builder makes holes in the Garden, the Island, Mushroom Town and the Mountain: this one is in the Crystal Mines, and stays playable in the game.";
  for (const slot of ["mines/1", "mines/3", "mines/12"]) assert.equal(await fromPublished(holes.get(slot)!, host, `${slot}/v1`, A, census), want, slot);
  assert.equal(await fromFile(JSON.stringify({ ...lane("garden", []), world: "mines" }), host, census), want);
});

void test("draftFile: a file name from the slug, else the name, else a plain one; never a path", () => {
  const d = lane("garden", []);
  assert.equal(draftFile({ ...d, slug: "mole-run" }), "mole-run.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "Mole Run / ../x" }), "mole-run-x.gnogolf.json");
  assert.equal(draftFile({ ...d, title: "" }), "hole.gnogolf.json");
});

void test("remixOf: someone's hole as a new draft of the remixer's, its maker credited in the note, no name, no par, no proofs", async () => {
  const hex = canonicalHex({ ...STARTERS.garden.straight, title: "Mole Run" }, host)!;
  const d = await fromPublished(hex, host, `${B}/mole-run/v2`, A);
  if (typeof d === "string") throw new Error(d);
  const r = remixOf({ ...d, par: 3, note: "theirs" }, `${B}/mole-run/v2`);
  assert.deepEqual([r.slug, r.title, r.par, r.proofs], ["", "", 0, []]);
  assert.equal(r.note, `Remix of Mole Run by ${B.slice(0, 8)}…${B.slice(-4)}`);
  assert.deepEqual(r.pieces, d.pieces, "the hole itself as it was");
  const long = remixOf({ ...d, title: "M".repeat(40) }, `${B}/x/v1`);
  assert.ok([...long.note].length <= MAX_NOTE);
});

void test("remixId and remixLink: a community hole's version to remix, from the Builder's address; anything else none", () => {
  assert.equal(remixLink(`${B}/mole-run/v2`), `/build/?remix=${encodeURIComponent(`${B}/mole-run/v2`)}`);
  assert.equal(remixLink(`${B}/mole-run/v2`, "rpc=x"), `/build/?remix=${encodeURIComponent(`${B}/mole-run/v2`)}&rpc=x`);
  assert.equal(remixId(`?remix=${encodeURIComponent(`${B}/mole-run/v2`)}&rpc=x`), `${B}/mole-run/v2`);
  assert.equal(remixId(`?remix=${encodeURIComponent(`${B}/v3`)}`), null, "an alias whose slug looks like a version: not a version");
  assert.equal(remixId(`?remix=${encodeURIComponent(`${B}/v3/v1`)}`), `${B}/v3/v1`, "its own version is");
  for (const q of ["", "?remix=", "?remix=garden/1/v1", "?remix=nope", `?remix=${B}/Bad Slug/v1`]) assert.equal(remixId(q), null, q);
});

void test("remixFrom: the chain's version read, judged as the Builder opens any, credited; one taken down or unread: why not", async () => {
  const hex = canonicalHex({ ...STARTERS.garden.straight, title: "Mole Run" }, host)!, id = `${B}/mole-run/v2`;
  const chain = (data: Record<string, string>, taken = "") => ({
    holeData: (x: string) => (Object.hasOwn(data, x) ? Promise.resolve(data[x]) : Promise.reject(new Error("no hole"))),
    chainId: () => Promise.resolve("dev"),
    get: () => Promise.resolve(new Response(JSON.stringify({ holes: taken ? [taken] : [] }))),
  });
  const ok = chain({ [id]: hex });
  const d = await remixFrom(ok, host, census, id, ok.get);
  assert.ok(typeof d === "object" && d.note.startsWith("Remix of Mole Run by ") && d.slug === "", JSON.stringify(d));
  assert.equal(await remixFrom(chain({}), host, census, id, ok.get), "The chain has no hole there, or could not be read.");
  const gone = chain({ [id]: hex }, `${B}/mole-run`);
  assert.equal(await remixFrom(gone, host, census, id, gone.get), "This hole was taken down: it cannot be opened in the Builder.");
});

void test("openPublished: a published hole by its id, as Start and a remix open it; each failure said for what failed", async () => {
  const hex = canonicalHex({ ...STARTERS.garden.straight, title: "Mole Run" }, host)!, id = `${B}/mole-run/v2`;
  const chain = { holeData: (x: string) => (x === id ? Promise.resolve(hex) : Promise.reject(new Error("no hole"))), chainId: () => Promise.resolve("dev") };
  const list = () => Promise.resolve(new Response(JSON.stringify({ holes: [] })));
  const mine = await openPublished(chain, host, census, id, B, list);
  assert.ok(typeof mine === "object" && mine.slug === "mole-run" && mine.title === "Mole Run", "the author's own: its next version");
  assert.equal(await openPublished(chain, host, census, `${B}/nope/v1`, B, list), "The chain has no hole there, or could not be read.");
  assert.equal(await openPublished(chain, host, census, id, B, () => Promise.reject(new Error("offline"))), "The site's list of holes taken down could not be read. Try again in a moment.", "the site's list, not the chain");
  const broken = () => {
    throw new Error("a chunk did not load");
  };
  assert.equal(await openPublished(chain, host, broken, id, B, list), "The Builder's pieces could not load. Try again in a moment.", "a failure past the read: said, never unhandled");
});

void test("a bar on a hole a post's rim frames off the board's quarters: published, it opens again and the community verdict takes it", async () => {
  const island = await loadPalette("island"), entry = (id: string) => island.find((e) => e.id === id)!;
  const framed = lane("island", [placePiece(entry("*/post/sandcastle"), "s", [15, 1.5])]);
  assert.notEqual(framed.tee[1] % 0.25, 0, "the tee off the board's quarters");
  const [tx, ty] = framed.tee, d = { ...framed, pieces: [...framed.pieces, placePiece(entry("*/bar/plank"), "b", [tx + 6, ty - 3])] };
  const v = validate(d, { host, palette: island, census });
  assert.deepEqual(v.issues.filter((i) => i.severity === "error"), []);
  const opened = await fromPublished(v.hex!, host, `${A}/plank/v1`, A, census);
  assert.equal(typeof opened, "object", typeof opened === "string" ? opened : "");
  assert.deepEqual(await judge(v.hex!, host, census), { ok: true });
});
