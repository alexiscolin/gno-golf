#!/usr/bin/env -S node --experimental-strip-types
// The client's self-check: the realm's rules it copies (web/lib/chain.ts
// RULES) read back from golf.gno and weather.gno, and the calls it makes
// checked against the realm's. Any drift exits non-zero. (The client's own
// checks are its unit tests: web/test.)
//
//   nice -n 20 node --experimental-strip-types scripts/selfcheck.ts
//   (from web/: npm run selfcheck)

import assert from "node:assert/strict";
import fs from "node:fs";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { RULES } = await import("../web/lib/chain.ts");
const { SKIES } = await import("../web/lib/card.ts");
const { CLIMATES } = await import("../web/lib/sky.ts");

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
const realmDir = new URL("../gno.land/r/gnogolf/golf/v2/", import.meta.url); // the rules the site plays
const realm = (f: string) => fs.readFileSync(new URL(f, realmDir), "utf8");
const golf = realm("golf.gno"), weather = realm("weather.gno");
/** The number a Go constant is set to (a literal, or a product of literals). */
const constOf = (src: string, name: string) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*([\\d.e_]+(?:\\s*\\*\\s*[\\d.e_]+)*)`).exec(src);
  assert.ok(m, `${name} not found`);
  return m[1].split("*").reduce((n, x) => n * Number(x.trim().replace(/_/g, "")), 1);
};
const has = (src: string, code: string) => src.replace(/\s+/g, "").includes(code.replace(/\s+/g, ""));

// every golf function the client calls exists, with as many arguments: the
// reads chain.ts evaluates and the transactions adena.ts sends
check("realm calls", () => {
  const src = fs.readdirSync(realmDir).filter((f) => f.endsWith(".gno") && !/_(file)?test\.gno$/.test(f)).map(realm).join("\n");
  const arity = new Map<string, number>();
  // (and its unexported ones: an expression may read the realm's own state through them)
  for (const m of src.matchAll(/^func ([A-Za-z]\w*)\(([^)]*)\)/gm)) {
    const params = m[2].split(",").map((x) => x.trim()).filter((x) => x && !/^cur realm$/.test(x));
    arity.set(m[1], params.length);
  }
  /** the top-level arguments of the call that starts at text[i] (just past its "(") */
  const argsAt = (text: string, i: number) => {
    let depth = 0, n = 0, any = false;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === "(" || c === "{" || c === "[") depth++;
      else if (c === ")" || c === "}" || c === "]") {
        if (depth === 0) break;
        depth--;
      } else if (c === "," && depth === 0) n++;
      else if (!/\s/.test(c)) any = true;
    }
    return any ? n + 1 : 0;
  };
  const web = (f: string) => fs.readFileSync(new URL(`../web/lib/${f}`, import.meta.url), "utf8");
  const reads = web("chain.ts"), writes = web("adena.ts");
  const calls: [string, number, string][] = [];
  // reads: qeval(`Name(…)`) and vm(REALM, "Name(…)")
  for (const m of reads.matchAll(/(?:qeval\(`|vm\(REALM, ")([A-Z]\w*)\(/g)) calls.push([m[1], argsAt(reads, m.index + m[0].length), "chain.ts"]);
  // and those inside an expression: qstr(REALM, `func() … BestOf(…) …`)
  // (a method, after a dot, is its type's; the expression's own funcs and Go's are not the realm's)
  const GO = new Set(["func", "string", "rune", "len", "int", "int64", "append", "make", "panic"]);
  for (const q of reads.matchAll(/qstr\(REALM, `([^`]*)`/g)) {
    const gno = q[1].replace(/\$\{[^}]*\}/g, "x"); // (the client's own values, put in)
    const own = new Set([...gno.matchAll(/\b(\w+(?:, \w+)*) :=/g)].flatMap((m) => m[1].split(", ")));
    for (const m of gno.matchAll(/(?<![.\w])([A-Za-z]\w*)\(/g)) if (!GO.has(m[1]) && !own.has(m[1])) calls.push([m[1], argsAt(gno, m.index + m[0].length), "chain.ts"]);
  }
  assert.ok(calls.some(([name]) => name === "BestOf"), "bestsOf's BestOf not found: the patterns drifted");
  // writes: call("Name", [..]) and [realm, "Name", [..]]
  for (const m of writes.matchAll(/(?:call\("|\[realm, ")([A-Z]\w*)", \[/g)) calls.push([m[1], argsAt(writes, m.index + m[0].length), "adena.ts"]);
  assert.ok(calls.length > 20, `only ${calls.length} calls found: the patterns drifted`);
  for (const [name, n, where] of calls) {
    assert.ok(arity.has(name), `${where} calls ${name}, which golf does not have`);
    assert.equal(n, arity.get(name), `${where}: ${name} takes ${arity.get(name)} arguments, called with ${n}`);
  }
});

// what the client's reads of the realm's own state take as written (chain.ts recordsOf,
// boardRecords; botproof.ts; sky.ts): the layout of a kept best, a shot's, the methods
// and fields they reach, the climates the client draws a record's sky from
check("the realm's formats the client reads", () => {
  assert.ok(has(golf, `return strconv.Itoa(r.strokes) + " " + strconv.FormatInt(runtime.ChainHeight(), 10) + " " + strconv.FormatInt(r.period, 10) + " " + r.shots`), "bestOf: recordsOf parses <strokes> <height> <period> <shots>");
  assert.ok(has(golf, `played := ufmt.Sprintf("%.4f,%.4f,%d", angle, power, tick)`), "a shot as kept: SHOTS and botproof read %.4f,%.4f,%d");
  assert.ok(has(golf, "func bestFields(s string) (int64, int64, string) {"), "bestFields: height, period, shots");
  for (const m of ["func (e *entry) bests(m int) view {", "func (e *entry) board(m int) view {", "func (e *entry) hole() *course.Simple {", "func (v view) Get(k string) (string, bool) {", "func (v view) IterateByOffset(offset, count int, cb func(key, x string) bool) bool {"])
    assert.ok(has(golf + realm("kv.gno"), m), `a method the reads call: ${m}`);
  const course = fs.readFileSync(new URL("../gno.land/p/gnogolf/course/course.gno", import.meta.url), "utf8");
  const kinds: Record<string, string> = Object.fromEntries([...course.matchAll(/^\t(Clear|Wind|Rain|Fog|Storm|Snow)\s*=\s*"(\w*)"/gm)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.values(kinds).sort(), [...SKIES].sort(), "the six kinds: card.ts SKIES");
  const table = /var climates = map\[string\]\[\]chance\{([\s\S]*?)\n\}/.exec(course);
  assert.ok(table, "course.gno climates not found");
  const gnoClimates = Object.fromEntries([...table[1].matchAll(/"(\w+)":\s*\{(.*)\},/g)].map((m) => [m[1], [...m[2].matchAll(/\{(\d+), (\w+)\}/g)].map((c) => [+c[1], kinds[c[2]]])]));
  assert.deepEqual(gnoClimates, CLIMATES, "sky.ts CLIMATES: course.gno's climates");
  assert.ok(has(course, `seed := hash(id + "#" + strconv.FormatInt(period, 10))`) && has(course, "h := uint64(14695981039346656037)") && has(course, "h *= 1099511628211") && has(course, "roll, kind := int(seed%100), Clear"), "sky.ts skyOf: ForecastFor's hash and roll");
});

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
  assert.equal(w.unit, constOf(golf, "workPerUnit"), "workPerUnit");
  assert.equal(w.pulseWall, constOf(golf, "workPerPulseWall"), "workPerPulseWall");
  assert.equal(w.pulsePost, constOf(golf, "workPerPulsePost"), "workPerPulsePost");
  // the pulses' set-up, as the engine's snapshot gives it (setup) and adena.ts adds it to each shot and takes it off the cap
  assert.ok(has(golf, "w.setup += int64(len(p.Walls))*workPerPulseWall + int64(len(p.Posts))*workPerPulsePost"), "newWork(): the pulses' set-up changed");
  assert.ok(has(golf, "c -= w.setup / workPerUnit"), "next(): the set-up off the cap changed");
  assert.ok(has(golf, "c += w.setup"), "add(): the set-up per shot changed");
  // what HoleState says of it, which boardWork reads (the formula above its fallback)
  assert.ok(has(realm("state.gno"), 'w := newWork(h, nil) sb.WriteString(ufmt.Sprintf(`,"work":{"walls":%d,"pieces":%d,"setup":%d}`, w.walls, w.pieces, w.setup))'), "HoleState's work changed");
  const step = fs.readFileSync(new URL("../gno.land/p/gnogolf/physics/step.gno", import.meta.url), "utf8");
  assert.equal(RULES.maxWork, constOf(step, "MaxWork"), "physics MaxWork");
  assert.equal(RULES.maxWorkStep, constOf(step, "MaxWorkStep"), "physics MaxWorkStep");
  // a shot's cap, as commitsOf mirrors it
  assert.ok(has(golf, "c := (workBudget-w.fixed-w.spent-workPerShot-w.walls*workPerWall)/workPerUnit - physics.MaxWorkStep"), "next(): the shot's cap changed");
  // the formula and the cut rule adena.ts copies (workOf, commitsOf)
  assert.ok(has(golf, "c := workPerShot + w.walls*workPerWall + int64(len(s.Path))*(workPerPoint+w.pieces*workPerPiece)"), "add(): the work of a shot changed");
  assert.ok(has(golf, "if w.played > 0 && w.spent+w.most > workBudget {"), "next(): the cut rule changed");
  // the chain also counts a shot by its physics work (Shot.Work), which a
  // path alone does not show: its estimate is never below the one mirrored
  // here, so where it is above, the chain cuts sooner and says so, and
  // splitRound follows its cut
  assert.ok(has(golf, "if u := workPerShot + w.walls*workPerWall + int64(s.Work)*workPerUnit; u > c {"), "add(): the work term changed");
});
check("golf's own figures the gas model reads", () => {
  // each shot's work (SimulateFrom, SimulateRound: adena.ts workOf) and what a
  // commit spends before its shots (Weather: adena.ts gasOf's fixed)
  const state = realm("state.gno");
  assert.ok(has(state, '`,"work":` + strconv.Itoa(shot.Work)'), "a shot's JSON no longer says its work");
  assert.ok(has(weather, '`,"gas":`+strconv.FormatInt(fixedGas(e, fc), 10)'), "Weather() no longer says the commit's fixed gas");
});
check("the course ranking's order", () => {
  // most holes, then the score against par (strokes - par): what Standings,
  // Players and a standing row give, and components/common.ts byStanding sorts by
  assert.ok(has(golf, 'return pad(99999-r.holes, 5) + "/" + pad(vsParBias+r.strokes-r.par, 7) + "/" + pad(int(r.height), 12) + "/" + r.player'), "rankKey: the course ranking's order changed");
  assert.ok(has(realm("state.gno"), '`,"holes":` + strconv.Itoa(r.holes) + `,"strokes":` + strconv.Itoa(r.strokes) + `,"par":` + strconv.Itoa(r.par)'), "standingFields: a standing's numbers changed");
  const common = fs.readFileSync(new URL("../web/components/common.ts", import.meta.url), "utf8");
  assert.ok(has(common, "(z.holes || 0) - (a.holes || 0) || standingVs(a) - standingVs(z)") && has(common, "r.strokes - (r.par || 0)"), "byStanding no longer sorts as rankKey");
});
check("weather.gno period", () => {
  assert.equal(RULES.periodMs, constOf(weather, "PeriodSeconds") * 1000, "PeriodSeconds");
  // a round saves in its period or the next one (Golf.tsx saveBy: period + 2)
  assert.ok(has(weather, "if period != now && period != now-1 {"), "playablePeriod: the periods a round saves in changed");
});

if (failed) {
  console.log(`${failed} failed`);
  process.exit(1);
}
console.log("all ok");
