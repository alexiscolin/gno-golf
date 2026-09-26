#!/usr/bin/env -S node --experimental-strip-types
// The client's self-check: the realm's rules it copies (web/lib/chain.ts
// RULES) read back from golf.gno and weather.gno, and the client's own small
// checks (the save's split, the scorecard, the third-person aim). Any drift or
// failed assert exits non-zero.
//
//   nice -n 20 node --experimental-strip-types scripts/selfcheck.ts
//   (from web/: npm run selfcheck)

import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";

// the client's modules import each other without an extension, as the bundler
// takes them: Node is told to try ".ts"
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        try { return await next(s, c); } catch (e) {
          if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$|\\.json$/.test(s)) return next(s + ".ts", c);
          throw e;
        }
      }`,
    ),
);

const { RULES } = await import("../web/lib/chain.ts");
const { commitsOf, gnokeyPlan } = await import("../web/lib/adena.ts");
const card = await import("../web/lib/card.ts");
const { thirdAim } = await import("../web/lib/engine/aim.ts");
const { pace, slowFrames, frameMs, AWAY_MS } = await import("../web/lib/engine/pace.ts");

let failed = 0;
function check(name: string, f: () => void) {
  try {
    f();
    console.log("ok  ", name);
  } catch (e) {
    failed++;
    console.log("FAIL", name, "\n    ", e instanceof Error ? e.message : e);
  }
}

// ---------------------------------------------------------------- the realm
const realm = (f: string) => fs.readFileSync(new URL(`../gno.land/r/gnogolf/golf/${f}`, import.meta.url), "utf8");
const golf = realm("golf.gno"), weather = realm("weather.gno");
/** The number a Go constant is set to (a literal, or a product of literals). */
const constOf = (src: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*([\\d.e_]+(?:\\s*\\*\\s*[\\d.e_]+)*)`).exec(src);
  assert.ok(m, `${name} not found`);
  return m[1].split("*").reduce((n, x) => n * Number(x.trim().replace(/_/g, "")), 1);
};
const has = (src: string, code: string) => src.replace(/\s+/g, "").includes(code.replace(/\s+/g, ""));

check("golf.gno limits", () => {
  assert.equal(RULES.maxShots, constOf(golf, "maxShots"), "maxShots");
  assert.equal(RULES.maxRoundStrokes, constOf(golf, "maxRoundStrokes"), "maxRoundStrokes");
  assert.equal(RULES.maxPath, constOf(golf, "maxPath"), "maxPath");
  assert.equal(RULES.maxPower, constOf(golf, "maxPower"), "maxPower");
});
check("golf.gno work model", () => {
  const w = RULES.work;
  assert.equal(w.budget, constOf(golf, "workBudget"), "workBudget");
  assert.equal(w.shot, constOf(golf, "workPerShot"), "workPerShot");
  assert.equal(w.wall, constOf(golf, "workPerWall"), "workPerWall");
  assert.equal(w.point, constOf(golf, "workPerPoint"), "workPerPoint");
  assert.equal(w.piece, constOf(golf, "workPerPiece"), "workPerPiece");
  // the formula and the cut rule adena.ts copies (workOf, commitsOf)
  assert.ok(has(golf, "c := workPerShot + w.walls*workPerWall + int64(len(s.Path))*(workPerPoint+w.pieces*workPerPiece)"), "add(): the work of a shot changed");
  assert.ok(has(golf, "if w.played > 0 && w.spent+w.most > workBudget {"), "next(): the cut rule changed");
  // the chain also counts a shot by its physics work (Shot.Work), which a
  // path alone does not show: its estimate is never below the one mirrored
  // here, so where it is above, the chain cuts sooner and says so, and
  // splitRound follows its cut
  assert.ok(has(golf, "if u := workPerShot + w.walls*workPerWall + int64(s.Work)*workPerUnit; u > c {"), "add(): the work term changed");
});
check("golf.gno forecast gas", () => {
  const m = /forecast \(up\s*(?:\/\/)?\s*to ([\d.e]+) measured/.exec(golf);
  assert.ok(m, "the forecast's measured gas is no longer in golf.gno's budget comment");
  assert.equal(RULES.forecastGas, Number(m[1]));
});
check("weather.gno period", () => {
  assert.equal(RULES.periodMs, constOf(weather, "PeriodSeconds") * 1000, "PeriodSeconds");
  // a round saves in its period or the next one (Golf.tsx saveBy: period + 2)
  assert.ok(has(weather, "if period != now && period != now-1 {"), "playablePeriod: the periods a round saves in changed");
});

// -------------------------------------------------------------- the client
// the chain's own sums (golf.gno add, next) over a split
const work = (c: { walls: number; pieces: number; pts: number[] }, i: number) => RULES.work.shot + c.walls * RULES.work.wall + c.pts[i] * (RULES.work.point + c.pieces * RULES.work.piece);
const refused = (c: { walls: number; pieces: number; pts: number[] }, [a, b]: [number, number]) => {
  let spent = 0, most = 0;
  for (let i = a; i < b; i++) {
    if (i > a && spent + most > RULES.work.budget) return true;
    const w = work(c, i);
    spent += w;
    most = Math.max(most, w);
  }
  return b - a > RULES.maxShots;
};
check("the save's split (adena.ts commitsOf)", () => {
  const heavy = { walls: 100, pieces: 100, pts: Array<number>(12).fill(190) }; // 5.4e8 a shot
  const p = commitsOf(heavy);
  assert.ok(p.length === 6 && p.every(([a, b]) => b - a === 2), "heavy: two a commit, as next() would cut");
  const light = { walls: 0, pieces: 0, pts: Array<number>(60).fill(10) };
  const q = commitsOf(light);
  assert.ok(q.length === 5 && q.every(([a, b]) => b - a === 12), "light: twelve a commit, 60 in five");
  const mixed = { walls: 100, pieces: 100, pts: [10, 10, 10, 512, 512, 512, 512] };
  assert.ok(!commitsOf(mixed).some((part) => refused(mixed, part)), "mixed: no commit the chain would refuse");
  const late = commitsOf(heavy, 12, 5);
  assert.ok(late[0][0] === 5 && late.every(([a, b]) => b - a <= 2) && late[late.length - 1][1] === 12, "a split from a later stroke");
});

check("the gnokey plan (adena.ts gnokeyPlan)", () => {
  const round = { id: "garden/1/v1", name: "The Shelf", shots: ["1.0000,2.0000", "3.0000,4.0000", "5.0000,6.0000"], period: 7, roundMode: "pro" as const, walls: 4, pieces: 6, pts: [10, 10, 10] };
  const opts = { realm: "gno.land/r/gnogolf/golf", chainId: "dev", rpc: "http://127.0.0.1:26757" };
  const gas = (p: { command: string }) => Number(/-gas-wanted (\d+)/.exec(p.command)?.[1]);
  // the chain's own cut, when it was asked, is what gnokey sends
  const cut = gnokeyPlan(round, { ...opts, parts: [[0, 1], [1, 3]] });
  assert.equal(cut.length, 2, "the chain's split is used");
  assert.ok(cut[1].script.includes('"3.0000,4.0000;5.0000,6.0000"') && !cut[1].script.includes("Reset"), "part 2: the rest of the shots, no Reset");
  assert.equal(gnokeyPlan(round, opts).length, 1, "without it, the work model's cut");
  // a community hole may take up to 70M more to decode
  assert.equal(gas(gnokeyPlan({ ...round, official: false }, opts)[0]) - gas(gnokeyPlan(round, opts)[0]), 70e6, "community decode allowance");
});

check("the scorecard (card.ts)", () => {
  const mem: Record<string, string> = {};
  const fake: Pick<Storage, "getItem" | "setItem" | "removeItem"> = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => void (mem[k] = String(v)), removeItem: (k) => void delete mem[k] };
  const ls = globalThis.localStorage, warn = console.warn;
  globalThis.localStorage = fake as Storage; // the three calls the card makes
  console.warn = () => {}; // (the refused count says so)
  try {
    card.recordScore("h1", 4);
    card.recordScore("h1", 3);
    card.recordScore("h1", 5);
    card.recordScore("h2", undefined);
    const c = card.loadCard(), t = card.totals(c, [{ id: "h1", par: 3 }, { id: "h2", par: 3 }]);
    assert.ok(c.h1 === 3 && !("h2" in c), "kept the best, refused undefined");
    assert.ok(t.done === 1 && t.strokes === 3 && t.par === 3, "totals");
    // a version-1 card: realm ids to slots, the lower score where two meet
    const old = "gno.land/r/gnogolf/";
    const m = card.migrate({ [`${old}hole19`]: 4, "garden/17": 3, [`${old}town5`]: 2, [`${old}hole10`]: 5, "gno.land/r/alice/marsh": 6, x: 0 });
    assert.ok(m["garden/17"] === 3 && m["town/5"] === 2 && m["extras/10"] === 5 && m["gno.land/r/alice/marsh"] === 6 && !("x" in m), "migrated");
    assert.ok(card.legacyOf("garden/17") === `${old}hole19` && card.legacyOf("mountain/18") === `${old}mountain18` && card.legacyOf("garden/19") === "", "legacy ids");
    assert.ok(card.scoreOf({ "garden/17": 3 }, { id: "garden/17/v2", slot: "garden/17" }) === 3, "a new version keeps the card");
  } finally {
    globalThis.localStorage = ls;
    console.warn = warn;
  }
});

check("the third-person aim (engine/aim.ts thirdAim)", () => {
  const deg = (a: number) => Math.round((((a * 180) / Math.PI) % 360 + 360) % 360);
  assert.equal(deg(thirdAim(0, 0, 100)), 0, "pull down: ahead");
  assert.equal(deg(thirdAim(0, 0, -100)), 180, "pull up: back");
  assert.equal(deg(thirdAim(0, -100, 0)), 90, "pull left: right");
  assert.equal(deg(thirdAim(0, 100, 0)), 270, "pull right: left");
  assert.equal(thirdAim(0, 3, 4, 1.2), 1.2, "dead zone holds");
  assert.ok(Math.abs(thirdAim(0, 0, 100, Math.PI / 2, true) - (Math.PI / 2) * 0.67) < 1e-9, "fine");
  // a step back along the pull (the power going down) with a little sideways drift keeps the aim
  assert.equal(thirdAim(0, 5, 40, 0.3, false, 1, -6), 0.3, "radial step: direction held");
  assert.notEqual(thirdAim(0, 40, 40, 0.3, false, 6, -6), 0.3, "sideways step: direction turns");
});

check("the frame pacing (engine/pace.ts)", () => {
  // a second of refreshes at hz, drawn at interval: the frames drawn, and the gaps between them
  const run = (hz: number, interval: number) => {
    let budget = 0, drawn = 0, since = 0;
    const gaps: number[] = [];
    for (let i = 0; i < hz * 4; i++) {
      since += 1000 / hz;
      const p = pace(budget, 1000 / hz, interval);
      budget = p.budget;
      if (!p.draw) continue;
      drawn++;
      gaps.push(since);
      since = 0;
    }
    return { fps: drawn / 4, gaps };
  };
  // the policy (frameMs): busy, fast movers, anything moving, away, nothing moving
  const fps = (ms: number) => (ms ? Math.round(1000 / ms) : 0);
  const S = 1000; // a second since the last input
  assert.equal(fps(frameMs(true, false, false, 10 * AWAY_MS, 1e9)), 60, "busy: 60");
  assert.equal(fps(frameMs(false, true, true, S, S)), 60, "a tram, a lift in view: 60");
  assert.equal(fps(frameMs(false, true, false, S, S)), 30, "only the sway: 30");
  assert.equal(AWAY_MS, 60_000, "the doze: after a minute");
  assert.ok(fps(frameMs(false, true, false, AWAY_MS - 1, S)) >= 25 && fps(frameMs(false, true, true, AWAY_MS - 1, S)) >= 25, "moving, the player about: never under 25");
  assert.ok(fps(frameMs(false, true, true, AWAY_MS + 1, AWAY_MS + 1)) <= 10, "away a minute: 10 at most");
  assert.equal(fps(frameMs(false, true, true, 0, 0)), 60, "the first input after: back at once");
  assert.equal(fps(frameMs(true, true, false, AWAY_MS + 1, AWAY_MS + 1)), 60, "a shot on its way: never dozing");
  assert.equal(fps(frameMs(false, false, false, S, 500)), 10, "nothing moving, just changed: 10");
  assert.equal(frameMs(false, false, false, S, 1001), 0, "nothing moving: not drawn");
  for (const hz of [60, 75, 90, 120, 144, 165]) {
    const busy = run(hz, 1000 / 60), idle = run(hz, 1000 / 30), doze = run(hz, 1000 / 10);
    assert.ok(Math.abs(busy.fps - 60) <= 2, `${hz} Hz busy: ${busy.fps} fps`);
    assert.ok(Math.abs(idle.fps - 30) <= 1.5, `${hz} Hz idle: ${idle.fps} fps`);
    assert.ok(Math.abs(doze.fps - 10) <= 1, `${hz} Hz away: ${doze.fps} fps`);
    assert.ok(!slowFrames(busy.gaps), `${hz} Hz on time: not slow`);
    // an even strip: no idle gap over two refreshes past the interval
    assert.ok(Math.max(...idle.gaps.slice(1)) <= 1000 / 30 + 1000 / hz + 1, `${hz} Hz idle: even gaps`);
  }
  // a GPU that makes every refresh late: 30 a second at best
  assert.ok(slowFrames(Array<number>(60).fill(33.3)), "30 fps busy: slow");
  assert.ok(!slowFrames([...Array<number>(55).fill(16.7), 200, 180, 150, 120, 90]), "a few hitches: not slow");
});

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all ok");
