// What the editor's dock says (lib/builder/editor.ts): the verdict, the
// gauges against GG1's and the realm's limits, the palette's entries a limit
// switches off (with why).
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane, rail } from "./builder-fixture.ts";
import "./scene-harness.ts";
import fs from "node:fs";
import { commonShift, dials, gauges, meterFace, nearLimits, offAtLimit, problems, shortWhy, testGate, verdict, type Gauge } from "../lib/builder/editor.ts";
import type { Shown } from "../lib/builder/difficulty.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { placePiece } from "../lib/builder/edit.ts";
import { LIMITS } from "../lib/builder/gg1.ts";
import { DRAFT_ID, validate } from "../lib/builder/pipeline.ts";
import type { Issue } from "../lib/builder/checks.ts";

const garden = await loadPalette("garden");
const entry = (id: string) => garden.find((e) => e.id === id)!;
const err = (rule: Issue["rule"]): Issue => ({ rule, severity: "error", text: "x" });
const stateAt1 = (hex: string) => (host.load(DRAFT_ID, hex), host.setperiod(1), JSON.parse(host.state(DRAFT_ID)) as unknown);

void test("verdict: what to fix first, then ready to test, then proved", () => {
  assert.deepEqual(verdict({ pieces: 0, errors: 0, proved: false }), { ok: false, text: "Place pieces between the tee and the cup" });
  assert.deepEqual(verdict({ pieces: 3, errors: 2, proved: false }), { ok: false, text: "2 things to fix" });
  assert.deepEqual(verdict({ pieces: 3, errors: 1, proved: false }), { ok: false, text: "1 thing to fix" });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false }), { ok: true, text: "Ready: press T to try it, or Prove it." });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: true }), { ok: true, text: "Holed in every weather: press Publish." });
  // the one place the next step's reason is said, in words (the header's action keeps its own words, so nothing moves)
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, off: "Give it a short name first" }), { ok: false, text: "Give it a short name first" });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, off: "Checking…" }), { ok: true, text: "Ready: press T to try it, or Prove it." }, "a check under way changes nothing said");
  assert.deepEqual(verdict({ pieces: 3, errors: 2, proved: false, off: "Fix 2 first" }), { ok: false, text: "2 things to fix" });
  // proofs over an edit: the rounds that broke said, the weathers still holed after them, ready to test again
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, rounds: { kept: ["", "rain"], broken: ["Your Wind round now stops short"] } }),
    { ok: true, warn: true, text: "Your Wind round now stops short · Clear and Rain still holed" });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, rounds: { kept: [], broken: ["Your Clear round now stops short", "Your Wind round now stops short"] } }),
    { ok: true, warn: true, text: "Your Clear round now stops short · and 1 more" });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: true, rounds: { kept: ["", "wind", "rain"], broken: [] } }), { ok: true, text: "Holed in every weather: press Publish." });
  assert.deepEqual(verdict({ pieces: 3, errors: 1, proved: false, rounds: { kept: [], broken: ["Your Wind round now stops short"] } }), { ok: false, text: "1 thing to fix" }, "a thing to fix first");
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

void test("dials: the player's four gauges always, a chain count only from 80%, the rest in the chain limits' tooltip", () => {
  const g = (name: string, used: number, of: number, level: Gauge["level"], shown = `${used}/${of}`): Gauge => ({ name, used, of, level, shown });
  const calm = [g("Pieces", 6, 60, "ok", "6 / 60"), g("Moving", 0, 8, "ok", "0 / 8"), g("Walls", 4, 160, "ok"), g("Posts", 2, 32, "ok"), g("Zones", 0, 32, "ok"), g("Points", 0, 512, "ok"), g("Size", 512, 32768, "ok", "0.5 KB"), g("Room", 19, 100, "ok", "81%")];
  const d = dials(calm);
  assert.deepEqual(d.dials.map((x) => [x.label, x.shown, x.fill, x.level]), [["Pieces", "6 / 60", 10, "ok"], ["Moving", "0 / 8", 0, "ok"], ["Room for shots", "81%", 81, "ok"], ["Size", "0.5 KB", 2, "ok"]],
    "Pieces, Moving, the room (its bar the room left), Size; nothing of the chain's counts");
  assert.equal(d.chain, "Walls 4/160 · Posts 2/32 · Zones 0/32 · Points 0/512");
  assert.deepEqual(d.reached, [], "no limit reached: no sentence");
  assert.match(d.dials[2].title, /room left for a first shot in its stormiest weather: 81%/i);
  // a chain count near its limit (80%) joins the line, amber; one at its cap, red, and its sentence said
  const near = dials(calm.map((x) => (x.name === "Posts" ? g("Posts", 26, 32, "warn") : x.name === "Zones" ? g("Zones", 32, 32, "full") : x)));
  assert.deepEqual(near.dials.slice(4).map((x) => [x.label, x.shown, x.fill, x.level]), [["Posts", "26/32", 81, "warn"], ["Zones", "32/32", 100, "full"]]);
  assert.equal(near.chain, "Walls 4/160 · Points 0/512");
  assert.deepEqual(near.reached, ["Zones: 32 of 32 · no room for more"]);
  // the room nearly gone: amber at 80% used (20% left), red when none is left
  assert.equal(dials([g("Room", 80, 100, "warn", "20%")]).dials.find((x) => x.name === "Room")!.fill, 20);
  assert.deepEqual(dials([g("Room", 100, 100, "full", "0%")]).reached, ["Room for a shot in its stormiest weather: 0% left"]);
  // before the first check: the room and the size kept in their places, not yet measured
  const first = dials([g("Pieces", 1, 60, "ok", "1 / 60"), g("Moving", 0, 8, "ok", "0 / 8")]);
  assert.deepEqual(first.dials.map((x) => [x.label, x.shown, x.fill]), [["Pieces", "1 / 60", 2], ["Moving", "0 / 8", 0], ["Room for shots", "–", 0], ["Size", "–", 0]]);
  assert.equal(first.chain, "");
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
  assert.equal(shortWhy("Give it a short name first"), "Name it first ↓");
  assert.equal(shortWhy(""), "");
});

void test("testGate: Test opens only on a check of the draft as kept now (an older check's verdict never opens it)", () => {
  const ok = { ...lane("garden", [placePiece(entry("*/post/rock"), "x", [12, 4])]), slug: "lane" };
  const v = validate(ok, { host, palette: garden });
  assert.equal(testGate(ok, { of: ok, v }), "");
  const undone = { ...ok, pieces: [] };
  assert.equal(testGate(undone, { of: ok, v }), "Checking…", "an undo since the check: its verdict is the old draft's");
  assert.equal(testGate(ok, null), "Checking…");
  const walled = { ...lane("garden", [rail("w", [20, 0], [20, 20])]), slug: "lane" };
  assert.equal(testGate(walled, { of: walled, v: validate(walled, { host, palette: garden }) }), "Fix 1 first");
  const unnamed = { ...ok, slug: "" };
  assert.equal(testGate(unnamed, { of: unnamed, v }), "Give it a short name first");
});

void test("the Editor keeps one session (its undo history) for as long as it is open: saving a step never makes a new one", () => {
  const src = fs.readFileSync(new URL("../components/builder/Editor.tsx", import.meta.url), "utf8");
  assert.match(src, /const \[session\] = useState\(\(\) => makeSession\(first\)\)/, "made once per mount (its key opens a new one)");
  assert.doesNotMatch(src, /useMemo\(\(\) => makeSession/, "not remade when the parent hands the saved draft back");
});

void test("quick shots in Edit: said on the board to be no proof, never handed to a proof, and the meter's line shown only on the hole it measured", () => {
  const board = fs.readFileSync(new URL("../components/builder/Board.tsx", import.meta.url), "utf8");
  const editor = fs.readFileSync(new URL("../components/builder/Editor.tsx", import.meta.url), "utf8");
  assert.match(board, />Quick shot: not a proof</);
  assert.match(editor, /quickShots\(host, /);
  assert.doesNotMatch(editor, /replay\(|onProof/, "the editor never makes a proof: Test does");
  assert.match(editor, /est\?\.of === kept && draft === kept/, "the line: of the hole as kept, and not while a drag moves it");
});

void test("meterFace: measured, measuring, not measurable (said so, never \"measuring\" for ever), a hole with errors", () => {
  const d = lane("garden", []), other = { ...d, title: "Other" };
  const e = { level: 1, word: "Easy", title: "Difficulty: easy", line: { text: "" }, par: 2, path: [], heat: [] } as unknown as Shown;
  assert.deepEqual(meterFace(true, { of: d, e }, d), { level: 1, word: "Easy", title: "Difficulty: easy", busy: false });
  assert.deepEqual(meterFace(true, { of: other, e }, d), { level: null, word: "–", title: "Difficulty: measuring…", busy: true });
  assert.deepEqual(meterFace(true, null, d), { level: null, word: "–", title: "Difficulty: measuring…", busy: true });
  assert.deepEqual(meterFace(true, { of: d, e: null }, d), { level: null, word: "–", title: "Difficulty: not measured: the meter's shots found no way to hole it, or it could not run here. Try it yourself; it never stops you publishing.", busy: false });
  assert.deepEqual(meterFace(false, { of: d, e }, d), { level: null, word: "–", title: "Difficulty: measured once the hole has no error", busy: false });
});

