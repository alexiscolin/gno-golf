// What the editor's dock says (lib/builder/editor.ts): the verdict, the
// gauges against GG1's and the realm's limits, the palette's entries a limit
// switches off (with why), the palette grouped by kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { host, lane, rail } from "./builder-fixture.ts";
import "./scene-harness.ts";
import fs from "node:fs";
import { commonShift, gauges, groupsOf, offAtLimit, testGate, verdict } from "../lib/builder/editor.ts";
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
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false }), { ok: true, text: "Ready to test: press Test it." });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: true }), { ok: true, text: "Holed in every weather: press Publish." });
  // the one place the next step's reason is said, in words (the header's action keeps its own words, so nothing moves)
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, off: "Give it a short name first" }), { ok: false, text: "Give it a short name first" });
  assert.deepEqual(verdict({ pieces: 3, errors: 0, proved: false, off: "Checking…" }), { ok: true, text: "Ready to test: press Test it." }, "a check under way changes nothing said");
  assert.deepEqual(verdict({ pieces: 3, errors: 2, proved: false, off: "Fix 2 first" }), { ok: false, text: "2 things to fix" });
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

void test("groupsOf: the palette by kind, in the editor's order, each group's entries kept in the palette's order", () => {
  const g = groupsOf(garden);
  assert.deepEqual(g.map((x) => x.name), ["Walls", "Posts", "Ground", "Hazards", "Hills", "Jumps"].filter((n) => g.some((x) => x.name === n)));
  assert.ok(g.every((x) => x.entries.length > 0));
  assert.equal(g.reduce((n, x) => n + x.entries.length, 0), garden.length, "every entry once");
});

void test("a full check hands back the hole as players get it (the census's HoleState): the 3D preview draws it, no second load", async () => {
  const { census } = await import("../lib/builder/drawn.ts");
  const d = lane("garden", [placePiece(entry("*/post/rock"), "x", [12, 4])]);
  const v = validate(d, { host, palette: garden, census });
  assert.ok(v.state, "the state the census read");
  assert.deepEqual(v.state, stateAt1(v.hex!), "the realm's HoleState of those bytes, at the period the preview shows");
  assert.equal(validate(d, { host, palette: garden }).state, undefined, "a quick check reads none");
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
