// What the editor's dock says (lib/builder/editor.ts): the verdict, the
// gauges against GG1's and the realm's limits, the palette's entries a limit
// switches off (with why).
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane, rail } from "./builder-fixture.ts";
import "./scene-harness.ts";
import fs from "node:fs";
import { CHECKING, NO_GL, brokenLine, commonShift, dials, gauges, meterFace, nearLimits, offAtLimit, playWhenAsked, problems, sameShape, shortWhy, testGate, type Gauge } from "../lib/builder/editor.ts";
import type { Shown } from "../lib/builder/difficulty.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { LIMITS } from "../lib/builder/gg1.ts";
import { DRAFT_ID, validate } from "../lib/builder/pipeline.ts";
import type { Issue } from "../lib/builder/checks.ts";
import { plainOf, two } from "../lib/builder/explain.ts";
import { pieceName } from "../lib/builder/names.ts";

const garden = await loadPalette("garden");
const entry = (id: string) => garden.find((e) => e.id === id)!;
const err = (rule: Issue["rule"]): Issue => ({ rule, severity: "error", text: "x" });
const stateAt1 = (hex: string) => (host.load(DRAFT_ID, hex), host.setperiod(1), JSON.parse(host.state(DRAFT_ID)) as unknown);

void test("brokenLine: the rounds an edit broke, said calm, the weathers still holed after them; nothing else (the header says it)", () => {
  assert.equal(brokenLine({ errors: 0, proved: false }), "", "all well: nothing said under the board");
  assert.equal(brokenLine({ errors: 0, proved: false, rounds: { kept: ["", "rain"], broken: ["Your Wind round now stops short"] } }), "Your Wind round now stops short · Clear and Rain still holed");
  assert.equal(brokenLine({ errors: 0, proved: false, rounds: { kept: [], broken: ["Your Clear round now stops short", "Your Wind round now stops short"] } }), "Your Clear round now stops short · and 1 more");
  assert.equal(brokenLine({ errors: 0, proved: true, rounds: { kept: ["", "wind", "rain"], broken: [] } }), "");
  assert.equal(brokenLine({ errors: 1, proved: false, rounds: { kept: [], broken: ["Your Wind round now stops short"] } }), "", "a thing to fix first: listed under the board");
  void err;
});

void test("gauges: the hole's counts, its size and its room, green, amber from 80%, red at the limit", () => {
  const v = validate(lane("garden", []), { host, palette: garden });
  const g = gauges(v.hole!, v.cost!, v.hex!.length / 2);
  assert.deepEqual(g.map((x) => x.name), ["Walls", "Posts", "Zones", "Points", "Size", "Room"]);
  assert.deepEqual(g[0], { name: "Walls", used: 4, of: LIMITS.walls, shown: `4/${LIMITS.walls}`, level: "ok" });
  assert.equal(g[4].shown, `${(v.hex!.length / 2 / 1024).toFixed(1)} KB`);
  assert.equal(g[5].level, "ok");
  const near = gauges({ ...v.hole!, posts: Array.from({ length: 27 }, () => v.hole!.walls[0] as never) }, v.cost!, 100);
  assert.equal(near[1].level, "warn");
  const full = gauges({ ...v.hole!, posts: Array.from({ length: 32 }, () => v.hole!.walls[0] as never) }, v.cost!, 100);
  assert.equal(full[1].level, "full");
});

void test("offAtLimit: an entry whose pieces would pass a limit is off, with why", () => {
  const many = Array.from({ length: LIMITS.walls - 4 - 2 }, (_, k) => rail(`x${k}`, [2 + (k % 20), 2], [2 + (k % 20), 3]));
  const d = lane("garden", many);
  const off = offAtLimit(d, garden);
  assert.equal(off.get("*/rail/"), undefined, "a rail: two walls left");
  assert.equal(off.get("*/bar/plank"), `Walls: ${LIMITS.walls - 2} of ${LIMITS.walls}. A bar takes 4.`);
  assert.equal(off.get("*/post/rock"), undefined);
  const posts = lane("garden", Array.from({ length: LIMITS.posts }, (_, k) => placePiece(entry("*/post/rock"), `p${k}`, [3 + k * 0.5, 15])));
  assert.equal(offAtLimit(posts, garden).get("*/post/rock"), `Posts: ${LIMITS.posts} of ${LIMITS.posts}.`);
});

void test("commonShift: how far a re-framing moved the whole hole (what most of it moved by), none for an edit of one piece", () => {
  const d = lane("garden", [rail("x", [10, 5], [10, 8])]);
  const move = (v: [number, number], s: [number, number]): [number, number] => [v[0] + s[0], v[1] + s[1]];
  const shifted = { ...d, tee: move(d.tee, [2, 0.5]), pin: move(d.pin, [2, 0.5]), pieces: d.pieces.map((p) => (p.geometry.t === "rail" ? { ...p, geometry: { ...p.geometry, a: move(p.geometry.a, [2, 0.5]), b: move(p.geometry.b, [2, 0.5]) } } : p)) };
  assert.deepEqual(commonShift(d, shifted), [2, 0.5]);
  const one = { ...d, pieces: d.pieces.map((p) => (p.id === "x" ? { ...p, geometry: { t: "rail" as const, a: [11, 5] as [number, number], b: [11, 8] as [number, number] } } : p)) };
  assert.deepEqual(commonShift(d, one), [0, 0]);
  assert.deepEqual(commonShift(d, { ...d, pieces: [] }), [0, 0], "nothing in common but the ends: they say");
});

void test("a full check hands back the hole as players get it (the census's HoleState): the 3D preview draws it, no second load", async () => {
  const { census } = await import("../lib/builder/drawn.ts");
  const d = lane("garden", [placePiece(entry("*/post/rock"), "x", [12, 4])]);
  const v = validate(d, { host, palette: garden, census });
  assert.ok(v.state, "the state the census read");
  assert.deepEqual(v.state, stateAt1(v.hex!), "the realm's HoleState of those bytes, at the period the preview shows");
  assert.equal(validate(d, { host, palette: garden }).state, undefined, "a quick check reads none");
});

void test("nearLimits: a limit said only when near it (amber from 80%), in words with the room left", () => {
  const g = (name: string, used: number, of: number, level: "ok" | "warn" | "full", shown = `${used}/${of}`) => ({ name, used, of, level, shown });
  assert.deepEqual(nearLimits([g("Walls", 40, 160, "ok"), g("Posts", 27, 32, "warn")]), ["Posts: 27 of 32 · room for 5 more"]);
  assert.deepEqual(nearLimits([g("Zones", 32, 32, "full")]), ["Zones: 32 of 32 · no room for more"]);
  assert.deepEqual(nearLimits([g("Size", 28000, 32768, "warn", "27.3 KB")]), ["Size: 27.3 KB of 32 KB"]);
  assert.deepEqual(nearLimits([g("Room", 90, 100, "warn", "10%")]), ["Room for a shot in its stormiest weather: 10% left"]);
  assert.deepEqual(nearLimits([g("Walls", 4, 160, "ok")]), [], "far from every limit: nothing said");
});

void test("dials: a gauge only once it nears its limit (amber from 80%), in order, the player's own first; nothing while far from them all", () => {
  const g = (name: string, used: number, of: number, level: Gauge["level"], shown = `${used}/${of}`): Gauge => ({ name, used, of, level, shown });
  const calm = [g("Pieces", 6, 60, "ok", "6 / 60"), g("Moving", 0, 8, "ok", "0 / 8"), g("Walls", 4, 160, "ok"), g("Posts", 2, 32, "ok"), g("Zones", 0, 32, "ok"), g("Points", 0, 512, "ok"), g("Size", 512, 32768, "ok", "0.5 KB"), g("Room", 19, 100, "ok", "81%")];
  assert.deepEqual(dials(calm), { dials: [], reached: [] }, "far from every limit: no gauge, no \"0.5 KB\"");
  // a count near its limit (80%) shown, amber; one at its cap, red, and its sentence said; the player's own first
  const near = dials(calm.map((x) => (x.name === "Posts" ? g("Posts", 26, 32, "warn") : x.name === "Zones" ? g("Zones", 32, 32, "full") : x.name === "Pieces" ? g("Pieces", 50, 60, "warn", "50 / 60") : x)));
  assert.deepEqual(near.dials.map((x) => [x.label, x.shown, x.fill, x.level]), [["Pieces", "50 / 60", 83, "warn"], ["Posts", "26/32", 81, "warn"], ["Zones", "32/32", 100, "full"]]);
  assert.deepEqual(near.reached, ["Zones: 32 of 32 · no room for more"]);
  assert.equal(near.dials[0].title, "Pieces: 50 of 60 · room for 10 more");
  // the room nearly gone: amber at 80% used (20% left, its bar the room left), red when none is left
  const room = dials([g("Room", 80, 100, "warn", "20%")]).dials[0];
  assert.deepEqual([room.label, room.fill], ["Room for shots", 20]);
  assert.match(room.title, /room left for a first shot in its stormiest weather: 20%/i);
  assert.deepEqual(dials([g("Room", 100, 100, "full", "0%")]).reached, ["Room for a shot in its stormiest weather: 0% left"]);
});

void test("problems: each issue's plain reason and the piece a click selects; Move it for an error on a piece", () => {
  const rows = problems([
    { rule: "E13", severity: "error", text: "The plank overlaps the rock", piece: "p3" },
    { rule: "L2", severity: "error", text: "The hole does not load" },
    { rule: "E11", severity: "warning", text: "Its walls and moving pieces take 85% of what one shot may cost", piece: "s1" },
  ]);
  assert.deepEqual(rows, [
    { text: "The plank overlaps the rock: move one of them.", rule: "E13", bad: true, piece: "p3", fix: true },
    { text: "The hole does not load.", rule: "L2", bad: true, fix: false },
    { text: "Its walls and moving pieces take 85% of what one shot may cost.", rule: "E11", bad: false, piece: "s1", fix: false },
  ]);
  assert.deepEqual(problems([]), [], "none: the panel folds back to its line");
});

void test("shortWhy: the reason beside the big button, in a few words (the full one in the checks line under the board)", () => {
  assert.equal(shortWhy("Fix 1 first"), "1 thing to fix ↓");
  assert.equal(shortWhy("Fix 3 first"), "3 things to fix ↓");
  assert.equal(shortWhy("Checking…"), "Checking…");
  assert.equal(shortWhy("Name it first"), "Name it first");
  assert.equal(shortWhy(""), "");
});

void test("testGate: Play opens only on a check of the draft as kept now (an older check's verdict never opens it)", () => {
  const ok = { ...lane("garden", [placePiece(entry("*/post/rock"), "x", [12, 4])]), slug: "lane" };
  const v = validate(ok, { host, palette: garden });
  assert.equal(testGate(ok, { of: ok, v }), "");
  const undone = { ...ok, pieces: [] };
  assert.equal(testGate(undone, { of: ok, v }), "Checking…", "an undo since the check: its verdict is the old draft's");
  assert.equal(testGate(ok, null), "Checking…");
  const walled = { ...lane("garden", [rail("w", [20, 0], [20, 20])]), slug: "lane" };
  assert.equal(testGate(walled, { of: walled, v: validate(walled, { host, palette: garden }) }), "Fix 1 first");
  const unnamed = { ...ok, slug: "" };
  assert.equal(testGate(unnamed, { of: unnamed, v }), "Name it first", "its address follows its name: a name is all it asks");
  assert.equal(testGate(ok, { of: ok, v }, false), NO_GL, "no WebGL: no game to play it in, said plainly");
  assert.equal(shortWhy(NO_GL), "Needs 3D (WebGL)");
});

void test("the Editor keeps one session (its undo history) for as long as it is open: saving a step never makes a new one", () => {
  const src = fs.readFileSync(new URL("../components/builder/Editor.tsx", import.meta.url), "utf8");
  assert.match(src, /const \[session\] = useState\(\(\) => makeSession\(first\)\)/, "made once per mount (its key opens a new one)");
  assert.doesNotMatch(src, /useMemo\(\(\) => makeSession/, "not remade when the parent hands the saved draft back");
});

void test("quick shots in Build: said on the board to be no proof, never handed to a proof, and the meter's line shown only on the hole it measured", () => {
  const board = fs.readFileSync(new URL("../components/builder/Board.tsx", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../components/builder/Editor.tsx", import.meta.url), "utf8");
  assert.match(board, />Quick shot: just to try</);
  assert.match(editor, /quickShots\(host, /);
  assert.doesNotMatch(editor, /replay\(/, "the editor never makes a proof: Play does (TestMode's replay)");
  assert.equal(editor.match(/onProof=/g)?.length, 1, "proofs come from Play alone");
  assert.match(editor, /est\?\.of === shape && draft === kept/, "the line: of the hole as kept (its shape), and not while a drag moves it");
});

void test("the meter where no worker can run (here, in node): every ask answered as not measured, none carried, no level; never measuring for ever", async () => {
  assert.equal(typeof (globalThis as { Worker?: unknown }).Worker, "undefined");
  const { makeMeter } = await import("../lib/builder/meter.ts");
  const d = lane("garden", []), said: unknown[] = [];
  const m = makeMeter((of, e) => said.push([of, e]));
  m.ask(d);
  assert.deepEqual(said, [[d, null]]);
  assert.equal(meterFace(true, { of: d, e: null }, d).busy, false);
  assert.equal(await m.carry(d, "", "", ""), null);
  assert.equal(await m.rate(""), null);
  m.stop();
});

void test("meterFace: measured, measuring, not measurable (said so, never \"measuring\" for ever), a hole with errors", () => {
  const d = lane("garden", []), other = { ...d, title: "Other" };
  const e = { level: 1, word: "Easy", title: "Difficulty: easy", line: { text: "" }, par: 2, path: [], heat: [] } as unknown as Shown;
  assert.deepEqual(meterFace(true, { of: d, e }, d), { level: 1, word: "Easy", title: "Difficulty: easy", busy: false });
  assert.equal(meterFace(true, { of: d, e: { ...e, line: { text: "The gap is narrow." } } }, d).title, "Difficulty: easy The gap is narrow.", "past easy: its strongest reason in the chip's words");
  assert.deepEqual(meterFace(true, { of: other, e }, d), { level: null, word: "–", title: "Difficulty: measuring…", busy: true });
  assert.deepEqual(meterFace(true, null, d), { level: null, word: "–", title: "Difficulty: measuring…", busy: true });
  assert.deepEqual(meterFace(true, { of: d, e: null }, d), { level: null, word: "–", title: "Difficulty: not measured: the meter's shots found no way to hole it, or it could not run here. Try it yourself; it never stops you publishing.", busy: false });
  assert.deepEqual(meterFace(false, { of: d, e }, d), { level: null, word: "–", title: "Difficulty: measured once the hole has no error", busy: false });
});


void test("E13 between two pieces of one name: counted, never \"the scarecrow overlaps the scarecrow\", the plural right for every piece", async () => {
  const say = (text: string) => plainOf({ rule: "E13", text });
  assert.equal(say("The scarecrow overlaps the scarecrow at (3, 4)"), "Two scarecrows overlap: move one.");
  assert.equal(say("The sand lies over the sand"), "Two patches of sand lie over each other: move one.");
  assert.equal(say("The plank crosses the plank"), "Two planks cross: move one.");
  assert.equal(say("The plank overlaps the rock"), "The plank overlaps the rock: move one of them.");
  assert.deepEqual(["the bench", "the snowman", "the buoy", "the city", "the stairs", "the wet sand", "the hay bales", "the crevasse", "a piece", "the blinking hand (pulse 2)"].map(two),
    ["Two benches", "Two snowmen", "Two buoys", "Two cities", "Two sets of stairs", "Two patches of wet sand", "Two sets of hay bales", "Two crevasses", "Two pieces", "Two blinking hands (pulse 2)"]);
  // every piece of every world: one plural each, never a word doubled or a bare "s" on a plural
  for (const w of ["garden", "island", "town", "mountain"])
    for (const e of await loadPalette(w)) {
      const t = two(pieceName({ entry: e.id }));
      assert.match(t, /^Two (patches of |sets of )?[a-z ]+[^s ]s$|^Two (patches|sets) of [a-z ]+$|^Two [a-z ]+men$/, `${e.id}: ${t}`);
      assert.doesNotMatch(t, /(ss|[^aeiou]ys|xs|chs|shs|mans)$/, `${e.id}: ${t}`);
    }
});

void test("sameShape: a round's proof or the par it sets is no change of the hole (nothing to check again, the meter not asked); any other change is", () => {
  const d = { ...lane("garden", [placePiece(entry("*/post/rock"), "x", [12, 4])]), slug: "lane" };
  const proof = { key: "k", id: "x", kind: "", period: 1, shots: [], commits: [], strokes: 2, maxWork: 1 };
  assert.equal(sameShape(d, d), true);
  assert.equal(sameShape(d, { ...d, proofs: [proof] }), true, "a proof kept in play");
  assert.equal(sameShape(d, { ...d, par: 3 }), true, "the par the proofs set");
  assert.equal(sameShape(d, { ...d, title: "Another" }), false, "renamed");
  assert.equal(sameShape(d, { ...d, slug: "other" }), false, "another address");
  assert.equal(sameShape(d, { ...d, pieces: [] }), false, "a piece gone");
  assert.equal(sameShape(d, { ...d, tee: [3, 3] }), false, "the tee moved");
});

void test("playWhenAsked: Play asked for (back from Publish) plays once the hole is checked, and is dropped when it cannot start (never opening later, unasked)", () => {
  assert.equal(playWhenAsked(false, ""), "wait", "not asked");
  assert.equal(playWhenAsked(true, CHECKING), "wait", "still checking");
  assert.equal(playWhenAsked(true, ""), "play");
  assert.equal(playWhenAsked(true, "Fix 1 first"), "drop", "errors: the ask goes, the editor stays");
  assert.equal(playWhenAsked(true, NO_GL), "drop");
  assert.equal(CHECKING, "Checking…");
});
