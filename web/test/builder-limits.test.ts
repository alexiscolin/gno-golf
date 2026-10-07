// The Builder's own piece limits (lib/builder/limits.ts, E16): calibrated on
// the course of the four classic worlds (every course hole within them, with
// room to spare but not much), refused through the pipeline and at placement
// (the ghost's canPlace, the keyboard's and the copy's check) in the
// player's words, and shown as the dock's first gauges.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { host, lane, rail } from "./builder-fixture.ts";
import "./scene-harness.ts";
import { BUILDER_LIMITS, builderLimits, isMoving, pastLimits, pieceCounts } from "../lib/builder/limits.ts";
import { readHole } from "../lib/builder/gg1.ts";
import { loadPalette } from "../lib/builder/palette.ts";
import { validate } from "../lib/builder/pipeline.ts";
import { canPlace, placePiece } from "../lib/builder/edit.ts";
import { plainOf } from "../lib/builder/explain.ts";
import { nearLimits, pieceGauges } from "../lib/builder/editor.ts";
import type { Draft, Piece, V } from "../lib/builder/draft.ts";

const garden = await loadPalette("garden");
const entry = (id: string) => garden.find((e) => e.id === id)!;
const CLASSIC = ["garden", "island", "town", "mountain"];

/**
 * A course hole counted as the Builder would have made it: readHole's
 * pieces (four walls build.Bar made, one bar), and four moving walls closed
 * on one another that it did not make (a gate in a pulse, a mill's sail, a
 * tram) one piece too, as the Builder places them.
 */
function courseCount(hex: string) {
  const g = host.decode(hex), d = readHole(g, (p) => `x/${p.kind}/${p.skin}`, (line) => host.bar(line)) as Draft;
  const same = (a: V, b: V) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  const pieces: Piece[] = [];
  for (let i = 0; i < d.pieces.length; ) {
    const run = d.pieces.slice(i, i + 4), ends = run.map((p) => (p.geometry.t === "rail" ? p.geometry : null));
    const closed = run.length === 4 && ends.every((e, k) => e && isMoving(run[k]) && JSON.stringify(run[k].clock) === JSON.stringify(run[0].clock) && same(e.b, ends[(k + 1) % 4]!.a));
    pieces.push(run[0]);
    i += closed ? 4 : 1;
  }
  return { world: g.world, ...pieceCounts({ pieces }) };
}
/** The nearest-rank percentile. */
const pct = (xs: readonly number[], p: number) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(p * xs.length) - 1)];

void test("calibrated on the course: every classic course hole within the limits, which leave a fifth more pieces and two more moving ones at most", (t) => {
  const course = fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n").map((l) => l.split(" "))
    .map(([slot, , , hex]) => ({ slot, ...courseCount(hex) })).filter((h) => CLASSIC.includes(h.world));
  assert.equal(course.length, 72, "the four classic worlds' 18 holes each");
  for (const w of [...CLASSIC, "all"]) {
    const hs = course.filter((h) => w === "all" || h.world === w), n = hs.map((h) => h.pieces), m = hs.map((h) => h.moving);
    t.diagnostic(`${w.padEnd(8)} pieces max ${Math.max(...n)} p90 ${pct(n, 0.9)} median ${pct(n, 0.5)} · moving max ${Math.max(...m)} p90 ${pct(m, 0.9)} median ${pct(m, 0.5)}`);
  }
  for (const h of course) assert.deepEqual(builderLimits({ pieces: Array.from({ length: h.pieces }, (_, k) => ({ clock: { k: k < h.moving ? "substep" : "fixed" } }) as Piece) }), [], `${h.slot}: within the Builder's limits`);
  const most = Math.max(...course.map((h) => h.pieces)), moving = Math.max(...course.map((h) => h.moving));
  assert.ok(BUILDER_LIMITS.pieces >= most && BUILDER_LIMITS.pieces <= Math.ceil(most * 1.2), `pieces: ${BUILDER_LIMITS.pieces} for a course of ${most} at most`);
  assert.ok(BUILDER_LIMITS.moving >= moving && BUILDER_LIMITS.moving <= moving + 2, `moving: ${BUILDER_LIMITS.moving} for a course of ${moving} at most`);
});

/** A lane with n pieces in all: its four rails, and rocks and sand in rows, clear of one another (the golden set's E16 hole). */
const withPieces = (n: number, more: Piece[] = []) =>
  lane("garden", [...Array.from({ length: n - 4 - more.length }, (_, k) => {
    const at: V = [4 + (k % 14) * 3, 4 + Math.floor(k / 14) * 4.5];
    return k % 2 ? placePiece(entry("*/post/rock"), `s${k}`, at, { size: 0.3 }) : placePiece(entry("*/surface/sand"), `s${k}`, at, { size: 1 });
  }), ...more], 50, 30);
const hand = (id: string, y: number): Piece => ({ ...placePiece(entry("*/bar/clock hand"), id, [8, y]), clock: { k: "substep", every: 40, on: 20, phase: 0 } });
const ctx = { host, palette: garden };

void test("E16: the pipeline refuses a draft past them, in the player's words", () => {
  const at = withPieces(BUILDER_LIMITS.pieces), past = withPieces(BUILDER_LIMITS.pieces + 1);
  assert.equal(at.pieces.length, BUILDER_LIMITS.pieces);
  assert.deepEqual(validate(at, ctx).issues.filter((i) => i.severity === "error"), [], "at the cap: a hole that passes");
  const e16 = validate(past, ctx).issues.filter((i) => i.rule === "E16");
  assert.deepEqual(e16.map((i) => [i.severity, i.text]), [["error", `Too many pieces: ${BUILDER_LIMITS.pieces + 1} of ${BUILDER_LIMITS.pieces}`]]);
  assert.equal(plainOf(e16[0]), `A Builder hole holds ${BUILDER_LIMITS.pieces} pieces at most: remove one to add another.`);
  const moving = builderLimits({ pieces: Array.from({ length: BUILDER_LIMITS.moving + 1 }, (_, k) => hand(`h${k}`, 4 + k)) });
  assert.deepEqual(moving.map((i) => i.text), [`Too many moving pieces: ${BUILDER_LIMITS.moving + 1} of ${BUILDER_LIMITS.moving}`]);
  assert.equal(plainOf(moving[0]), `A Builder hole holds ${BUILDER_LIMITS.moving} moving pieces at most: remove one, or make one still.`);
});

void test("at the cap, placement is refused (the ghost, a drop, the keyboard, a copy) with the sentence; under it, it is not", () => {
  const full = withPieces(BUILDER_LIMITS.pieces), room = withPieces(BUILDER_LIMITS.pieces - 1);
  const rock = placePiece(entry("*/post/rock"), "x", [24, 26]);
  const refused = canPlace(full, rock, ctx);
  assert.deepEqual(refused.map((i) => i.rule), ["E16"]);
  assert.equal(plainOf(refused[0]), `A Builder hole holds ${BUILDER_LIMITS.pieces} pieces at most: remove one to add another.`);
  assert.deepEqual(canPlace(room, rock, ctx), [], "a free place under the cap");
  // a piece already in it moves freely at the cap
  const mine = full.pieces.at(-1)!;
  assert.deepEqual(canPlace(full, mine, ctx).filter((i) => i.rule === "E16"), []);
});

void test("moving pieces: the ninth refused, a still piece still placed; a piece made to move at the cap refused, a moving one moved", () => {
  const hands = Array.from({ length: BUILDER_LIMITS.moving }, (_, k) => hand(`h${k}`, 4 + 2 * k));
  const d = { ...lane("garden", [], 50, 30), pieces: [...lane("garden", [], 50, 30).pieces, ...hands] };
  assert.deepEqual(pastLimits(d, { pieces: [...d.pieces, hand("x", 25)] }).map((i) => i.text), [`Too many moving pieces: ${BUILDER_LIMITS.moving + 1} of ${BUILDER_LIMITS.moving}`]);
  assert.deepEqual(pastLimits(d, { pieces: [...d.pieces, placePiece(entry("*/post/rock"), "y", [30, 20])] }), []);
  const still = d.pieces[0];
  assert.equal(pastLimits(d, { pieces: d.pieces.map((p) => (p === still ? { ...p, clock: { k: "stroke", pulse: 0 } } : p)) }).length, 1);
  assert.deepEqual(pastLimits(d, { pieces: d.pieces.map((p) => (p === hands[0] ? { ...p, clock: { k: "stroke", pulse: 0 } } : p)) }), []);
  // a draft opened past them (a hand-edited file) may lose a piece, never gain one
  const past = { pieces: Array.from({ length: BUILDER_LIMITS.pieces + 3 }, (_, k) => rail(`r${k}`, [0, k], [1, k])) };
  assert.deepEqual(pastLimits(past, { pieces: past.pieces.slice(1) }), []);
  assert.equal(pastLimits(past, { pieces: [...past.pieces, rail("z", [3, 3], [4, 3])] }).length, 1);
});

void test("the gauges: pieces and moving pieces first, calm until near the cap", () => {
  const g = pieceGauges(withPieces(42, [hand("h1", 26), hand("h2", 27), hand("h3", 28)]));
  assert.deepEqual(g.map((x) => [x.name, x.shown, x.level]), [["Pieces", `42 / ${BUILDER_LIMITS.pieces}`, "ok"], ["Moving", `3 / ${BUILDER_LIMITS.moving}`, "ok"]]);
  const near = pieceGauges(withPieces(50));
  assert.equal(near[0].level, "warn");
  assert.deepEqual(nearLimits(near), [`Pieces: 50 of ${BUILDER_LIMITS.pieces} · room for ${BUILDER_LIMITS.pieces - 50} more`]);
  const at = pieceGauges(withPieces(BUILDER_LIMITS.pieces));
  assert.equal(at[0].level, "full");
  assert.deepEqual(nearLimits(at), [`Pieces: ${BUILDER_LIMITS.pieces} of ${BUILDER_LIMITS.pieces} · no room for more`]);
  assert.deepEqual(nearLimits(pieceGauges({ pieces: Array.from({ length: BUILDER_LIMITS.moving }, (_, k) => hand(`h${k}`, k)) })).at(-1), `Moving pieces: ${BUILDER_LIMITS.moving} of ${BUILDER_LIMITS.moving} · no room for more`);
});
