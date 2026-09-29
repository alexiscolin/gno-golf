#!/usr/bin/env -S node --experimental-strip-types
// The end-to-end smoke test, against a local chain and dev server (see the
// README): every read the client makes, answered by the realm and passed
// through the client's own checks (chain.ts `checks`, which throw on any
// shape it does not expect), then the game in a headless Chrome: a hole
// played and holed, the finished banner and its save clock, the leaderboard
// read from the cups screen. Exits non-zero on the first failure.
//
//   nice -n 20 node --experimental-strip-types scripts/smoke.ts
//   (from web/: npm run smoke; RPC and APP override the local defaults)

import assert from "node:assert/strict";
// the client's modules as the unit tests load them (".ts" tried, "@/" read)
import "../web/test/setup.mjs";

const { makeChain } = await import("../web/lib/chain.ts");
/** media/lib/cdp.mjs, as this script uses it: one headless Chrome over the DevTools protocol */
interface Browser {
  send: (method: string, params?: object) => Promise<unknown>;
  ev: <T = unknown>(expr: string) => Promise<T>;
  errors: unknown[];
  kill: () => void;
}
const cdp = (await import("../media/lib/cdp.mjs")) as {
  launch: (o: { width: number; height: number }) => Promise<Browser>;
  chainUp: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  APP: string;
  RPC: string;
};
const { launch, chainUp, sleep, APP, RPC } = cdp;

let failed = 0;
async function step(name: string, f: () => Promise<unknown>) {
  try {
    const note = await f();
    console.log("ok  ", name, typeof note === "string" && note ? `(${note})` : "");
  } catch (e) {
    failed++;
    console.log("FAIL", name, "\n    ", e instanceof Error ? e.message : e);
  }
}

if (!(await chainUp())) {
  console.log("FAIL the chain at", RPC, "does not answer");
  process.exit(1);
}
const chain = makeChain({ rpc: RPC });

// ---------------------------------------------------------------- the reads
let hole = "", player = "", period = 0;
await step("Holes: the course is published", async () => {
  const list = await chain.holes(true);
  const official = list.filter((h) => h.official && !h.next);
  assert.ok(official.length >= 74, `${official.length} course holes`);
  hole = (official.find((h) => h.id.startsWith("garden/3/")) || official[0]).id;
  return `${official.length} holes`;
});
await step("HoleState, Period, Weather, Extras", async () => {
  await chain.state(hole);
  period = await chain.period();
  await chain.weather(hole, period);
  await chain.extras(hole, 0);
});
await step("SimulateRound / At / In, SimulateCommit, SimulateFrom", async () => {
  const shots = ["0,9.25"];
  await chain.simulateRound(hole, shots, null);
  const at = await chain.simulateRound(hole, shots, period);
  const past = await chain.replayRound(hole, shots, period - 50); // an old weather: botcheck's read
  assert.ok(at.path.length > 0 && past.path.length > 0);
  await chain.simulateCommit(hole, [2, 8], 0, shots, period);
  await chain.simulateFrom(hole, at.rest, "0,1", 1, period); // the next stroke, from where the first stopped
});
await step("Leaderboard, CourseLeaderboard (paged), Rank", async () => {
  const top = await chain.leaderboard("pro");
  const page = await chain.courseLeaderboard(0, 5, "pro");
  assert.ok(page.rows.length <= 5);
  // in the ranking's order: most holes, then the best score against par
  for (const [i, r] of page.rows.entries()) {
    const up = page.rows[i - 1];
    if (up) assert.ok(up.holes > r.holes || (up.holes === r.holes && up.strokes - up.par <= r.strokes - r.par), `row ${i + 1} ranks before row ${i}`);
  }
  if (page.players > 5) assert.equal((await chain.courseLeaderboard(page.next, 5, "pro")).offset, page.next);
  player = (top.rows[0] || page.rows[0] || { player: "" }).player;
  if (player) assert.ok((await chain.rank("pro", player)).rank >= 1, "the top player ranks");
  return `${page.players} ranked`;
});
await step("HoleLeaderboard, HoleRank, Bests, Standings, Records, Players, Round", async () => {
  const b = await chain.holeLeaderboard(hole, 0, 10, "pro");
  const p = b.rows[0] ? b.rows[0].player : player;
  if (p) {
    const r = await chain.holeRank(hole, "pro", p);
    if (b.rows[0]) assert.equal(r.rank, 1, "the board's first row is rank 1");
    await chain.bests(hole, "pro", [p]);
    await chain.standings("pro", [p]);
    await chain.round(hole, p);
  }
  await chain.records(hole, "pro");
  await chain.players("pro");
});
await step("names: registrar, a check, a batch", async () => {
  const reg = await chain.nameReg();
  assert.match(reg, /^gno\.land\/r\/sys\/namereg\/v\d$/);
  assert.match(await chain.nameProblem("nym-golf000"), /\w/, "a stem of 4 letters is refused");
  if (player) assert.equal((await chain.namesOf([player])).length, 1);
  return reg;
});

// ---------------------------------------------------------------- the game
const b = await launch({ width: 1100, height: 700 });
/** polls a page expression until it is truthy, or gives up: its last value */
async function until<T>(expr: string, tries = 80, ms = 250): Promise<T> {
  let v = await b.ev<T>(expr);
  for (let i = 0; i < tries && !v; i++) {
    await sleep(ms);
    v = await b.ev<T>(expr);
  }
  return v;
}
try {
  await step("a hole played and holed in the browser", async () => {
    await b.send("Page.navigate", { url: `${APP}/?play&camlog&hole=${hole.replace(/\/v\d+$/, "")}` });
    assert.ok(await until<boolean>(`!!(window.__g && document.querySelector('.cam-btn'))`, 100), "the game did not load");
    await sleep(1200);
    // the weather moves the ball: a shot that holes now, asked of the chain
    // around the known one (a free read), then played for real
    const p = await chain.period();
    let shot: [number, number] | null = null;
    search: for (const da of [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -3, 3])
      for (const pw of [9.25, 9, 9.5, 8.75, 9.75, 8.5, 10]) {
        const r = await chain.simulateRound(hole, [`${da},${pw}`], p);
        if (r.holed && r.strokes === 1) {
          shot = [da, pw];
          break search;
        }
      }
    assert.ok(shot, "no holing shot found in this weather");
    await b.ev(`window.__g.shoot(${shot[0]}, ${shot[1]})`);
    assert.ok(await until<boolean>(`!!document.querySelector('.banner--win')`), "no hole-finished banner");
    await sleep(1200);
    assert.match(await b.ev<string>(`(document.querySelector('.saveclock')||{}).textContent||""`), /Save within/, "the save clock");
  });
  await step("the leaderboard from the cups screen", async () => {
    await b.send("Page.navigate", { url: `${APP}/` });
    assert.ok(await until<boolean>(`!!document.querySelector('.btn--start')`, 100), "no title screen");
    await b.ev(`document.querySelector('.btn--start').click()`);
    // Play opens the modes first: Solo leads to the cups
    assert.ok(await until<boolean>(`!!document.querySelector('.mode--solo')`, 50), "no modes screen");
    await b.ev(`document.querySelector('.mode--solo').click()`);
    assert.ok(await until<boolean>(`!!document.querySelector('.podium__open')`, 50), "no top players on the cups screen");
    // a course standing reads as its holes and its score against par
    const vs = /(E|[+−]\d+)$/;
    if (await until<boolean>(`!!document.querySelector('.podium .sticker__sub')`, 20)) {
      const sub = await b.ev<string>(`document.querySelector('.podium .sticker__sub').textContent`);
      assert.ok(/holes · /.test(sub) && vs.test(sub), `a podium sticker says ${sub}`);
    }
    await b.ev(`document.querySelector('.podium__open').click()`);
    const rows = await until<number>(`document.querySelectorAll('.lb--full ol:not(.lb__ghosts) > li:not(.lb__more)').length`, 40);
    assert.ok(rows > 0, "no board rows");
    const caption = await b.ev<string>(`document.querySelector('.lb--full h3 small').textContent`);
    assert.ok(caption.includes("most holes, then best score against par"), `the course board's caption: ${caption}`);
    const score = await b.ev<string>(`document.querySelector('.lb--full ol > li strong').textContent`);
    assert.ok(vs.test(score), `a course row's score: ${score}`);
    return `${rows} rows, the first at ${score}`;
  });
  await step("a player the bot check flags is hidden from the boards", async () => {
    assert.ok(player, "no ranked player to flag");
    // the page's flags.json answered with this player flagged, as scripts/botcheck.ts writes it
    const flags = JSON.stringify({ flags: { [player]: { score: 0.9, reasons: ["smoke test"] } } });
    await b.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `{ const f = window.fetch; window.fetch = (u, o) => String(u).endsWith("flags.json") ? Promise.resolve(new Response(${JSON.stringify(flags)})) : f(u, o); }`,
    });
    await b.send("Page.navigate", { url: `${APP}/` });
    assert.ok(await until<boolean>(`!!document.querySelector('.btn--start')`, 100), "no title screen");
    await b.ev(`document.querySelector('.btn--start').click()`);
    // Play opens the modes first: Solo leads to the cups
    assert.ok(await until<boolean>(`!!document.querySelector('.mode--solo')`, 50), "no modes screen");
    await b.ev(`document.querySelector('.mode--solo').click()`);
    assert.ok(await until<boolean>(`document.querySelectorAll('.podium__row li:not(.podium__ghost)').length > 0`, 50), "no top players");
    const podium = await b.ev<string>(`document.querySelector('.podium__row').textContent`);
    const name = (await chain.namesOf([player]))[0].name;
    assert.ok(!name || !podium.includes(name), `the flagged ${name} is on the podium`);
    await b.ev(`document.querySelector('.podium__open').click()`);
    assert.ok(await until<boolean>(`[...document.querySelectorAll('.lb--full .linkish')].some((x) => /hidden/.test(x.textContent))`, 40), "no \"Show all (… hidden)\" toggle");
    const shown = await b.ev<string>(`document.querySelector('.lb--full ol:not(.lb__ghosts)').textContent`);
    assert.ok(!name || !shown.includes(name), `the flagged ${name} is listed`);
    return `${name || player} hidden`;
  });
  assert.equal(b.errors.length, 0, `console errors: ${JSON.stringify(b.errors).slice(0, 300)}`);
} finally {
  b.kill();
}
console.log(failed ? `${failed} failed` : "all ok");
process.exit(failed ? 1 : 0);
