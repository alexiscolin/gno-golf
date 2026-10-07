// The difficulty meter (lib/builder/difficulty.ts) on what the Builder makes
// and opens: every starter, the course holes of its worlds (those it opens
// as drafts, and every one as data), the golden set's broken holes and the
// hostile ones (the rules refuse them: the meter must only not throw), and a
// hole made very hard on purpose, which must say so and name its pieces.
// The timings are said as diagnostics (the budget: difficulty.ts BUDGET).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { host, lane, rail } from "./builder-fixture.ts";
import { cases, garden, put } from "./builder-broken.ts";
import { loadWorld } from "./scene-harness.ts";
import { BUDGET, estimate, estimateHole, fraction, holing, levelOf, LEVELS, meterLine, meterTitle, shown, type Estimate } from "../lib/builder/difficulty.ts";
import { STARTERS } from "../lib/builder/starters.ts";
import { canonicalHex } from "../lib/builder/proof.ts";
import { writeHole } from "../lib/builder/gg1.ts";
import { FIELD } from "../lib/builder/rules.ts";
import { hostileHoles } from "../lib/hostile.ts";
import type { Draft } from "../lib/builder/draft.ts";
import type { GHole } from "../lib/builder/types.ts";

await loadWorld("garden");
const { census } = await import("../lib/builder/drawn.ts");
const { validate } = await import("../lib/builder/pipeline.ts");
const { asDraft } = await import("../lib/builder/importing.ts");

const said = (e: Estimate) => `${LEVELS[e.level]}, par ${e.par || "–"}, ${e.shots} shots in ${e.ms} ms${e.cut ? " (cut)" : ""}`;
/** The budget's time, with room for the shot that crossed it. */
const LATE = BUDGET.ms + 250;

void test("every starter: easy, nothing to say of it, its par the meter's (or one above: a signature piece holed in one), well within the budget", async (t) => {
  let most = 0;
  for (const [world, set] of Object.entries(STARTERS)) {
    for (const [name, d] of Object.entries(set)) {
      const e = await estimate(host, d);
      assert.ok(e, `${world} ${name}`);
      assert.equal(e.level, 0, `${world} ${name}: ${said(e)}`);
      assert.deepEqual(e.reasons, []);
      assert.ok(e.par === d.par || e.par === d.par - 1, `${world} ${name}: par ${e.par} for ${d.par}`);
      assert.ok(!e.cut && e.shots <= BUDGET.shots && e.ms < LATE);
      assert.equal(meterLine(e).text, `Easy to play: par ${e.par} likely.`);
      most = Math.max(most, e.ms);
      t.diagnostic(`${world} ${name}: ${said(e)}`);
    }
  }
  t.diagnostic(`the slowest starter: ${most} ms`);
});

void test("the search scripts/starters.ts finds its rounds with (holing, its fan) still finds the rounds it kept", async () => {
  const kept = JSON.parse(fs.readFileSync(new URL("./builder-starters.json", import.meta.url), "utf8")) as Record<string, Record<string, { period: number; shots: string[] }>>;
  for (const slug of ["garden-straight", "town-dogleg"]) {
    const [world, name] = slug.split("-"), d = { ...STARTERS[world][name], slug }, id = `g1hvuayx9ll7dal54kr0f6t89j8867z8lf5vtxgv/${slug}/v1`;
    host.load(id, canonicalHex(d, host)!);
    const { period, shots } = kept[slug][""];
    assert.deepEqual(await holing(host, id, d.tee, d.pin, period), shots, slug);
  }
});

void test("the course holes of the Builder's worlds: each measured within the budget, its par near the course's; those the Builder opens, their reasons on their own pieces", async (t) => {
  const tally = [0, 0, 0, 0], near: string[] = [];
  let heaviest = { slot: "", ms: 0, shots: 0 }, opened = 0;
  for (const l of fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").trim().split("\n")) {
    const [slot, , , hex] = l.split(" ");
    const g: GHole = host.decode(hex);
    if (!Object.hasOwn(FIELD, g.world)) continue;
    const e = await estimateHole(host, hex);
    assert.ok(e, slot);
    assert.ok(e.shots <= BUDGET.shots && e.ms < LATE, `${slot}: ${said(e)}`);
    tally[e.level]++;
    if (e.par && Math.abs(e.par - g.par) <= 1) near.push(slot);
    if (e.ms > heaviest.ms) heaviest = { slot, ms: e.ms, shots: e.shots };
    const r = await asDraft(hex, host, census);
    if (typeof r !== "string") {
      opened++;
      const de = (await estimate(host, r.draft))!, ids = new Set(r.draft.pieces.map((p) => p.id));
      for (const x of de.reasons) assert.ok(!x.piece || ids.has(x.piece), `${slot}: ${x.text} names no piece of the draft`);
      t.diagnostic(`${slot} (opened as a draft): ${said(de)}${de.reasons[0] ? `: ${de.reasons[0].text}` : ""}`);
    }
  }
  const all = tally.reduce((a, b) => a + b, 0);
  t.diagnostic(`${all} course holes: ${tally.map((n, k) => `${n} ${LEVELS[k]}`).join(", ")}; the heaviest ${heaviest.slot}, ${heaviest.shots} shots in ${heaviest.ms} ms`);
  assert.ok(opened >= 1, "the Builder opens some course hole");
  assert.ok(near.length >= 0.75 * all, `the meter's par within one of the course's on ${near.length} of ${all}`);
  assert.ok(tally[0] > all / 3 && tally[3] < all / 3, "most course holes are not very hard");
});

void test("the golden set's broken holes, refused by the rules: measured without a throw", async () => {
  for (const [what, make] of cases) {
    const e = await estimate(host, make());
    if (e) assert.ok(LEVELS[e.level], what);
  }
});

void test("the hostile holes, in every Builder world: measured without a throw, within the budget", async (t) => {
  let most = 0, n = 0;
  for (const world of Object.keys(FIELD)) {
    const f = FIELD[world];
    for (const s of hostileHoles(world)) {
      const hex = writeHole({ w: s.board.w, h: s.board.h, title: "", par: s.par, tee: s.start, pin: s.cup, world, order: 0, ...f, walls: s.walls, posts: s.posts, zones: s.zones, pulses: [] });
      const fit = host.fit(hex, "");
      const e = await estimateHole(host, fit.ok ? fit.hex : hex);
      if (!e) continue;
      n++;
      assert.ok(e.shots <= BUDGET.shots && e.ms < LATE, `${world}: ${said(e)}`);
      most = Math.max(most, e.ms);
    }
  }
  t.diagnostic(`${n} hostile holes measured; the slowest ${most} ms`);
});

/** A hole made very hard on purpose: a wall across with a gap 1.25 balls wide, a second wall whose opening a plank closes all but 1/6 of the time, the cup round the corner behind a rock. */
const gate = (every: number, on: number) => ({ ...put("gate", "*/bar/plank", [26, 4.75]), geometry: { t: "bar" as const, a: [26, 4.75] as [number, number], b: [26, 7.25] as [number, number], thick: 0.5 }, clock: { k: "substep" as const, every, on, phase: 0 } });
const VERY_HARD: Draft = { ...lane("garden", [
  rail("w1", [14, 0], [14, 7.25]), rail("w2", [14, 8.5], [14, 16]), rail("w3", [26, 0], [26, 4]), rail("w4", [26, 8], [26, 16]),
  gate(6, 5), put("rock", "*/post/rock", [33, 7], { size: 1.5 }),
], 40, 16), pin: [37, 13] };

void test("a hole made very hard on purpose: the rules let it through, the meter says Very hard and names the plank and the gap", async (t) => {
  assert.deepEqual(validate(VERY_HARD, { host, palette: garden, census }).issues.filter((i) => i.severity === "error"), [], "possible, as the rules judge it");
  const e = (await estimate(host, VERY_HARD))!;
  t.diagnostic(`very hard: ${said(e)}: ${e.reasons.map((r) => `${r.text}${r.piece ? ` [${r.piece}]` : ""}`).join(" | ")}`);
  assert.equal(e.level, 3);
  assert.ok(e.narrowest! > 1.2 && e.narrowest! < 1.3);
  assert.deepEqual(e.reasons.slice(0, 2).map((r) => [r.piece, r.text]), [
    ["gate", "The plank lets the ball by only 1/6 of the time."],
    ["w1", "The gap between two walls is only 1.3 balls wide: most shots will catch an edge."],
  ]);
  assert.deepEqual(meterLine(e), { text: "The plank lets the ball by only 1/6 of the time.", piece: "gate" });
  assert.match(meterTitle(e), /^Difficulty, the meter's guess: Very hard\. \(\d[\d,]* shots in \d+ ms\.\)$/);
  assert.deepEqual(shown(e), { level: 3, word: "Very hard", line: meterLine(e), title: meterTitle(e), par: 0, path: e.path, heat: e.heat }, "what the worker sends the editor");
});

void test("one narrow gap alone, or one rare window alone: at least Medium, the piece named", async () => {
  const gap = (await estimate(host, { ...lane("garden", [rail("w1", [14, 0], [14, 7.25]), rail("w2", [14, 8.5], [14, 16])], 40, 16), pin: [37, 13] }))!;
  assert.ok(gap.level >= 1, said(gap));
  assert.equal(gap.reasons.find((r) => r.piece === "w1")?.text, "The gap between two walls is only 1.3 balls wide: most shots will catch an edge.");
  const wide = (await estimate(host, { ...lane("garden", [rail("w1", [14, 0], [14, 7.25]), rail("w2", [14, 9.25], [14, 16])], 40, 16), pin: [37, 13] }))!;
  assert.equal(wide.level, 0, `a gap of two balls: ${said(wide)}`);
  const timed = (await estimate(host, { ...lane("garden", [rail("w3", [26, 0], [26, 4]), rail("w4", [26, 8], [26, 16]), gate(4, 3)], 40, 16), pin: [37, 13] }))!;
  assert.ok(timed.level >= 2, said(timed));
  assert.equal(timed.reasons.find((r) => r.piece === "gate")?.text, "The plank lets the ball by only 1/4 of the time.");
});

void test("the meter's words are calm: no alarm, no command, never a refusal", async () => {
  const es = [(await estimate(host, VERY_HARD))!, ...(await Promise.all(Object.values(STARTERS.garden).map((d) => estimate(host, d)))).map((e) => e!)];
  for (const e of es) for (const s of [meterLine(e).text, meterTitle(e), ...e.reasons.map((r) => r.text)]) {
    assert.doesNotMatch(s, /!|error|fail|impossible|refuse|must not|can't|cannot|warning|danger/i, s);
    assert.match(s, /^[A-Z(].*[.)]$/, s);
  }
});

void test("the budget: the meter stops at it and says so; a newer run takes over between fans", async () => {
  const d = STARTERS.garden.dogleg;
  const cut = (await estimate(host, d, { budget: { shots: 300, ms: 10_000 } }))!;
  assert.ok(cut.cut && cut.shots <= 300, said(cut));
  let asked = 0;
  assert.equal(await estimate(host, d, { pause: () => Promise.resolve(++asked < 2) }), null, "a newer run took over");
  assert.equal(asked, 2);
  assert.equal(await estimate(host, { ...d, tee: [-200, 5] }), null, "fit refuses it: the checks say why");
});

void test("the level from what was measured", () => {
  const m = { strokes: 1 as number | null, forgiving: [1], narrowest: null as number | null, rarest: null as number | null };
  assert.equal(levelOf(m), 0);
  assert.equal(levelOf({ ...m, strokes: null }), 3, "no line found");
  assert.equal(levelOf({ ...m, strokes: 2, forgiving: [0.2, 1] }), 0, "a dogleg's tee shot");
  assert.equal(levelOf({ ...m, strokes: 3, forgiving: [0.5, 0.3, 1] }), 1);
  assert.equal(levelOf({ ...m, strokes: 3, forgiving: [0.2, 0.4, 0.7] }), 2);
  assert.equal(levelOf({ ...m, strokes: 5, forgiving: [0.2, 0.7, 0.4, 0.4, 0.7] }), 3);
  assert.equal(levelOf({ ...m, narrowest: 1.3 }), 1, "a gap under 1.5 balls");
  assert.equal(levelOf({ ...m, narrowest: 1.7 }), 0);
  assert.equal(levelOf({ ...m, rarest: 1 / 8 }), 2, "a window a quarter of the time or less");
  assert.equal(levelOf({ ...m, rarest: 1 / 2 }), 1);
  assert.deepEqual([1 / 8, 1 / 2, 5 / 12, 1 / 6, 0.37].map(fraction), ["1/8", "1/2", "5/12", "1/6", "37%"]);
});

void test("the line to show in Edit: the best line's paths stroke by stroke from the tee, and where the meter's shots stopped, counted by cell", async () => {
  const d = STARTERS.garden.dogleg, e = (await estimate(host, d))!;
  assert.equal(e.path.length, e.strokes, "a path a stroke");
  assert.ok(Math.hypot(e.path[0][0][0] - d.tee[0], e.path[0][0][1] - d.tee[1]) < 1e-6, "the first from the tee");
  for (let k = 1; k < e.path.length; k++) assert.deepEqual(e.path[k][0], e.path[k - 1].at(-1), `stroke ${k + 1} from where stroke ${k} stopped`);
  const counted = e.heat.reduce((n, [, , k]) => n + k, 0);
  assert.ok(counted > 0 && counted <= e.shots, `${counted} stops of ${e.shots} shots`);
  assert.ok(e.heat.every(([x, y]) => x === Math.floor(x) + 0.5 && y === Math.floor(y) + 0.5), "each cell by its middle");
  const s = shown(e);
  assert.deepEqual([s.path, s.heat], [e.path, e.heat], "the editor is handed them");
});
