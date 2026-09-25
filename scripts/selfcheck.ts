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
const { commitsOf } = await import("../web/lib/adena.ts");
const card = await import("../web/lib/card.ts");
const { thirdAim } = await import("../web/lib/engine/aim.ts");

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
});

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all ok");
