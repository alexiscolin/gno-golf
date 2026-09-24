#!/usr/bin/env node
// Bot check: scores how machine-made the top recorded rounds look.
//
// The physics is public and deterministic, so a bot can play perfectly and
// nothing on chain can stop it. This only flags: it reads the boards, replays
// the candidates' holing shots with small nudges through SimulateRoundAt (a
// free query), and writes a 0-1 score per player for the dapp to hide behind
// a "show all" toggle. An indicator, not proof: see README.md, "Bot check".
//
//   nice -n 20 node scripts/botcheck.mjs [--rpc URL] [--top 10] [--delay 150]
//     [--max-sims 300] [--max-rounds 300] [--out web/public/flags.json] [--json]
//   nice -n 20 node scripts/botcheck.mjs --selftest
//
// Reads only, over the node's abci_query vm/qeval, the same client as the dapp.

import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { makeChain, DEFAULT_RPC } from "../web/lib/chain.js";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? def : typeof def === "boolean" ? true : argv[i + 1];
};
const RPC = opt("rpc", DEFAULT_RPC);
const TOP = +opt("top", 10);
const DELAY = +opt("delay", 150); // ms between RPC calls: the node is on a laptop
const MAX_SIMS = +opt("max-sims", 300); // perturbation replays, whole run
const MAX_ROUNDS = +opt("max-rounds", 300); // Round() reads, whole run
const OUT = opt("out", here("../web/public/flags.json"));
const JSON_OUT = opt("json", false);
const SELFTEST = opt("selftest", false);

try { os.setPriority(19); } catch {} // as nice as we are allowed, whoever launched us

const OFFICIAL = "gno.land/r/gnogolf/";
const BESTS = JSON.parse(fs.readFileSync(here("./hole-bests.json"), "utf8")); // solver results, see README

// --- rate-limited chain -------------------------------------------------------

const chain = makeChain({ rpc: RPC });
let lastCall = 0, calls = 0, sims = 0;
async function rpc(fn) {
  const wait = lastCall + DELAY - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  calls++;
  return fn(chain);
}
const simulate = (hole, shots, period) => (sims++, rpc((c) => c.simulateRound(hole, shots, period, 15000)));

// --- signals ------------------------------------------------------------------

// Signal weights; they sum to 1, so the score is a weighted mean of 0-1 signals.
export const WEIGHTS = { knife: 0.35, values: 0.3, optimal: 0.2, volume: 0.15 };

const parseShot = (s) => {
  const [a, p, t] = s.split(",").map(Number);
  return { a, p, t: t | 0 };
};
const fmt = ({ a, p, t }) => `${a.toFixed(4)},${p.toFixed(4)},${t}`;
const near = (x, step) => Math.abs(x / step - Math.round(x / step)) < 1e-6;

// values: the dapp sends angle and power at 0.01 steps, so a human's shot lands
// on the solver's grid (whole degrees, power in 0.25) about 1 time in 2500.
// A shot on that grid counts 1; one finer than the dapp can send (a 3rd or
// 4th decimal: another client) counts 0.5; anything else 0.
function valueSignal(shots) {
  if (!shots.length) return 0;
  const per = shots.map(({ a, p }) => (near(a, 1) && near(p, 0.25) ? 1 : near(a, 0.01) && near(p, 0.01) ? 0 : 0.5));
  return (per.reduce((x, y) => x + y, 0) / per.length) * Math.min(1, shots.length / 5); // a few shots prove little
}

// knife: nudge the holing shot (the prefix kept, so the ball starts from the
// very same spot) by ±0.2°, ±0.05 power and, on a timed hole, ±1 tick. The
// fraction of nudges that no longer hole in as few strokes is the round's
// fragility. Only the last shot: nudging a setup shot moves the ball under
// every later shot, and that breaks a human's round as surely as a bot's.
const NUDGES = [[0.2, 0, 0], [-0.2, 0, 0], [0, 0.05, 0], [0, -0.05, 0]];
async function fragility(r) {
  const shots = r.shots.map(parseShot), last = shots[shots.length - 1], prefix = shots.slice(0, -1).map(fmt);
  const nudges = [...NUDGES, ...(last.t > 0 ? [[0, 0, 1], [0, 0, -1]] : [])]; // at most 6
  let tried = 0, held = 0;
  for (const [da, dp, dt] of nudges) {
    const n = { a: last.a + da, p: +(last.p + dp).toFixed(4), t: last.t + dt };
    if (n.p <= 0 || n.p > 10 || n.t < 0) continue;
    if (sims >= MAX_SIMS) return null; // out of budget: unchecked, not innocent
    const res = await simulate(r.hole, [...prefix, fmt(n)], r.period);
    tried++;
    if (res.holed && res.strokes <= r.strokes) held++;
  }
  return tried ? 1 - held / tried : null;
}

// Scores one player: bests = { hole: strokes } over the official holes,
// rounds = the finished rounds on record [{ hole, shots: ["a,p,t"], strokes, period }].
export async function scorePlayer({ bests, rounds }) {
  const reasons = [];
  const s = {};

  let edges = 0, checked = 0;
  for (const r of rounds) {
    const f = await fragility(r);
    if (f == null) continue;
    checked++;
    if (f >= 0.75) edges++;
  }
  s.knife = checked ? edges / Math.max(3, checked) : 0; // one lucky ace is not a pattern
  if (edges) reasons.push(`knife-edge holing shot on ${edges}/${checked} holes (>=75% of ±0.2°/±0.05/±1 tick nudges miss)`);

  const all = rounds.flatMap((r) => r.shots.map(parseShot));
  s.values = valueSignal(all);
  const grid = all.filter(({ a, p }) => near(a, 1) && near(p, 0.25)).length;
  const fine = all.filter(({ a, p }) => !(near(a, 0.01) && near(p, 0.01))).length;
  if (grid) reasons.push(`${grid}/${all.length} shots on the solver grid (whole degrees, power in 0.25)`);
  if (fine) reasons.push(`${fine}/${all.length} shots finer than the dapp sends (0.01)`);

  const known = Object.entries(bests).filter(([h]) => BESTS[h]);
  const atBest = known.filter(([h, n]) => n <= BESTS[h].best);
  const below = known.filter(([h, n]) => n < BESTS[h].best);
  s.optimal = known.length ? (atBest.length / known.length) * Math.min(1, known.length / 3) : 0;
  if (atBest.length) reasons.push(`${atBest.length}/${known.length} holes at the solver's best`);
  if (below.length) reasons.push(`beats the solver on ${below.map(([h]) => h.slice(OFFICIAL.length)).join(", ")}`);

  s.volume = Math.min(1, atBest.length / 20);

  const score = Object.keys(WEIGHTS).reduce((x, k) => x + WEIGHTS[k] * s[k], 0);
  return { score: Math.round(score * 100) / 100, signals: s, holes: known.length, atBest: atBest.length, reasons };
}

// --- the live run -------------------------------------------------------------

async function run() {
  const holes = (await rpc((c) => c.holes())).filter((h) => h.id.startsWith(OFFICIAL) && !h.next).map((h) => h.id);
  const candidates = new Set();
  for (const mode of ["assisted", "pro"]) {
    for (const r of (await rpc((c) => c.leaderboard(mode))).rows) candidates.add(r.player);
    for (const h of holes) for (const r of (await rpc((c) => c.holeLeaderboard(h, 0, TOP, mode))).rows) candidates.add(r.player);
  }
  const players = [...candidates];
  const bests = Object.fromEntries(players.map((p) => [p, {}]));
  for (const h of holes)
    for (const mode of ["assisted", "pro"])
      for (let i = 0; i < players.length; i += 50) // Bests takes 50 addresses at most
        for (const r of (await rpc((c) => c.bests(h, mode, players.slice(i, i + 50)))).rows)
          bests[r.player][h] = Math.min(bests[r.player][h] ?? Infinity, r.strokes);

  const out = {};
  let rounds = 0;
  for (const p of players) {
    const recs = [];
    for (const h of Object.keys(bests[p])) {
      if (rounds >= MAX_ROUNDS) break;
      rounds++;
      const r = await rpc((c) => c.round(h, p)); // the round on record: the latest, maybe a replay
      if (r && r.done && r.shots) recs.push({ hole: h, shots: r.shots.split(";"), strokes: r.strokes, period: r.period });
    }
    out[p] = await scorePlayer({ bests: bests[p], rounds: recs });
  }
  return { holes: holes.length, players: out };
}

function report({ holes, players }) {
  const rows = Object.entries(players).sort((a, b) => b[1].score - a[1].score);
  const lines = [`# Gnogolf bot check`, ``, `${new Date().toISOString()} · ${RPC} · ${holes} official holes · ${rows.length} candidates · ${calls} RPC calls, ${sims} perturbation replays`, ``];
  if (!rows.length) return [...lines, `No candidates: the boards are empty.`].join("\n");
  lines.push(`| player | score | holes | at best | reasons |`, `|---|---|---|---|---|`);
  for (const [p, r] of rows) lines.push(`| ${p} | ${r.score.toFixed(2)} | ${r.holes} | ${r.atBest} | ${r.reasons.join("; ") || "-"} |`);
  return lines.join("\n");
}

// --- selftest -----------------------------------------------------------------

// Two synthetic players on a few holes, built from real replays: the bot plays
// the solver's plans as they are, the fewest-strokes one however fragile (raw)
// where there is one; the human plays the same plans with 0.01-step noise
// (what the dapp sends), keeping only noisy versions that still hole.
async function selftest() {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const bot = { bests: {}, rounds: [] }, human = { bests: {}, rounds: [] };
  const withRaw = Object.entries(BESTS).filter(([, b]) => b.raw && b.period);
  const picked = [...withRaw.slice(0, 3), ...Object.entries(BESTS).filter(([, b]) => !b.raw && b.plan).slice(0, 2)];
  for (const [hole, b] of picked) {
    const plan = (b.raw || b.plan).map(parseShot);
    const res = await simulate(hole, plan.map(fmt), b.period);
    if (!res.holed) { console.log(`skip ${hole}: its plan no longer holes on this chain`); continue; }
    bot.bests[hole] = res.strokes;
    bot.rounds.push({ hole, shots: plan.map(fmt), strokes: res.strokes, period: b.period });
    human.bests[hole] = res.strokes + 1; // where the jitter misses, a human takes one more
    for (let k = 0; k < 5; k++) {
      const noisy = plan.map(({ a, p, t }) => ({ a: +(a + 0.01 + Math.round((rand() - 0.5) * 70) / 100).toFixed(2), p: Math.min(10, +(p + 0.01 + Math.round((rand() - 0.5) * 14) / 100).toFixed(2)), t }));
      const r = await simulate(hole, noisy.map(fmt), b.period);
      if (r.holed && r.strokes <= res.strokes) {
        human.bests[hole] = r.strokes;
        human.rounds.push({ hole, shots: noisy.map(fmt), strokes: r.strokes, period: b.period });
        break;
      }
    }
  }
  const sb = await scorePlayer(bot), sh = await scorePlayer(human);
  console.log(`bot   ${sb.score.toFixed(2)} ${JSON.stringify(sb.signals)}\n      ${sb.reasons.join("\n      ")}`);
  console.log(`human ${sh.score.toFixed(2)} ${JSON.stringify(sh.signals)}\n      ${sh.reasons.join("\n      ") || "-"}`);
  console.log(`${bot.rounds.length} holes, ${human.rounds.length} human rounds holed, ${calls} RPC calls, ${sims} replays`);
  if (!bot.rounds.length) throw new Error("selftest: no plan holes on this chain");
  if (!(sb.score > sh.score)) throw new Error("selftest: the bot does not score above the human");
  console.log("selftest ok");
}

// --- main ---------------------------------------------------------------------

if (SELFTEST) await selftest();
else {
  const res = await run();
  const flags = Object.fromEntries(Object.entries(res.players).filter(([, r]) => r.score > 0).map(([p, r]) => [p, { score: r.score, reasons: r.reasons }]));
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), flags }, null, 2) + "\n");
  console.log(JSON_OUT ? JSON.stringify(res, null, 2) : report(res));
}
