#!/usr/bin/env -S node --experimental-strip-types
// The wasm parity test: web/lib/sim/golf.wasm (scripts/wasm.sh) must answer
// every call exactly as the realm does, byte for byte. The realm's side runs
// in the GnoVM (gno test, the onyx toolchain), in scratch copies of the
// packages, one per core: scripts/wasm/parity_test.gno, in golf/v2 (the rules
// the wasm is built from: scripts/wasm.sh), publishes every hole
// and plays it (its par plans stroke by stroke in 19 weathers, and random
// shots anywhere, at any stroke and tick, some refused), printing each
// call's answer's sha256; then the wasm answers the same calls, through the
// page's own host (web/lib/sim/host.ts). The builder's builder.wasm the same
// way (web/lib/builder/wasm.ts): PublishMine itself on each hole's data,
// changed and not, and on holes at the work limits, its refusals word for
// word; author.Fit and Encode byte for byte. Any difference fails.
//
// The holes: the course's (data/holes.txt, their plans in
// the solver's bests, private/botcheck/hole-bests.json, kept out of the public repo:
// without them, random shots only), and the mines' 18 from the mines worktree
// (MINES, default: gnogolf-mines beside the repo) when the course lacks them.
//
//   cd web && node --experimental-strip-types --import ./test/setup.mjs ../scripts/wasmparity.ts
//   (scripts/wasm.sh --check runs it; check.sh runs that)

import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeHost } from "../web/lib/sim/host.ts";
import { makeBuilderHost } from "../web/lib/builder/wasm.ts";

const root = path.resolve(import.meta.dirname, "..");
const toolchain = process.env.GNO_TOOLCHAIN || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "gno-toolchains/onyx");
const GNO = process.env.GNO || path.join(toolchain, "gno");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** A hole's data (hex) as a check case changes it: parity_test.gno's mutate. */
function mutate(x: string, m: string) {
  const [k, a, b] = m.split(":");
  if (k === "upper") return x.toUpperCase();
  if (k === "odd") return x + "0";
  if (k === "extra") return x + "00";
  if (k === "cut") return x.slice(0, 2 * Number(a));
  if (k === "set") return x.slice(0, 2 * Number(a)) + b + x.slice(2 * Number(a) + 2);
  return x;
}

interface Hole { slot: string; hex: string; plans: string[] }
function holes(dir: string, only?: RegExp): Hole[] {
  // (the mines worktree, an older branch, has them at scripts/)
  const file = ["private/botcheck/hole-bests.json", "scripts/hole-bests.json"].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
  if (!file) console.log(`wasmparity: no solver bests in ${dir}: random shots only, no par plans`);
  const bests = (file ? JSON.parse(fs.readFileSync(file, "utf8")) : {}) as Record<string, { plan?: string[]; raw?: string[] }>;
  return fs.readFileSync(path.join(dir, "data/holes.txt"), "utf8").trim().split("\n").map((l) => l.split(" "))
    .filter(([slot]) => !only || only.test(slot))
    .map(([slot, , , hex]) => ({ slot, hex, plans: [bests[slot]?.plan, bests[slot]?.raw].filter((p): p is string[] => !!p?.length).map((p) => p.join(";")) }));
}
const all = holes(root);
const main = path.dirname(execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim());
const mines = process.env.MINES || path.join(main, "../gnogolf-mines");
const ownMines = all.some((h) => h.slot.startsWith("mines/")); // (the course has them already: each slot once)
if (!ownMines && fs.existsSync(path.join(mines, "data/holes.txt"))) all.push(...holes(mines, /^mines\//));
else if (!ownMines) console.log(`wasmparity: no mines worktree at ${mines}: the course's holes only`);
if (process.env.ONLY) all.splice(0, all.length, ...all.filter((h) => new RegExp(process.env.ONLY!).test(h.slot))); // ONLY=mines/1: those holes alone
const hexOf = new Map(all.map((h) => [h.slot, h.hex]));

// the shards, balanced by the work they play (the data's size, the plans' strokes)
const n = Math.min(all.length, os.availableParallelism());
const shards: { holes: Hole[]; load: number }[] = Array.from({ length: n }, () => ({ holes: [], load: 0 }));
const weight = (h: Hole) => h.hex.length * (4 + h.plans.join(";").split(";").length);
for (const h of [...all].sort((a, b) => weight(b) - weight(a))) {
  const s = shards.reduce((a, b) => (b.load < a.load ? b : a));
  s.holes.push(h);
  s.load += weight(h);
}

const t0 = performance.now();
const lines = (
  await Promise.all(shards.map(async (s, i) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wasmparity${i}-`));
    try {
      fs.cpSync(path.join(root, "gno.land/p/gnogolf"), path.join(dir, "gno.land/p/gnogolf"), { recursive: true });
      for (const r of ["golf", "store"]) fs.cpSync(path.join(root, "gno.land/r/gnogolf", r), path.join(dir, "gno.land/r/gnogolf", r), { recursive: true });
      const golf = path.join(dir, "gno.land/r/gnogolf/golf/v2");
      fs.copyFileSync(path.join(root, "gnowork.toml"), path.join(dir, "gnowork.toml"));
      fs.cpSync(path.join(toolchain, "gnohome"), path.join(dir, "gnohome"), { recursive: true }); // its own: gno locks its package cache
      fs.copyFileSync(path.join(root, "scripts/wasm/parity_test.gno"), path.join(golf, "wasm_parity_test.gno"));
      fs.writeFileSync(path.join(golf, "wasm_parity_data_test.gno"),
        `package golf\n\n// slot, data, plans ("a,p;a,p|…")\nvar wasmHoles = [][3]string{\n${s.holes.map((h) => `\t{${JSON.stringify(h.slot)}, ${JSON.stringify(h.hex)}, ${JSON.stringify(h.plans.join("|"))}},\n`).join("")}}\n`);
      const out = await new Promise<string>((ok, no) => {
        const p = spawn(GNO, ["test", "-v", "-run", "TestWasmParity|TestBuilderParity","./gno.land/r/gnogolf/golf/v2"], { cwd: dir, env: { ...process.env, GNOHOME: path.join(dir, "gnohome") } });
        let o = "", e = "";
        p.stdout.on("data", (d: Buffer) => (o += d.toString()));
        p.stderr.on("data", (d: Buffer) => (e += d.toString()));
        p.on("close", (code) => (code === 0 ? ok(o + e) : no(new Error(`gno test (shard ${i}) exited ${code}:\n${(o + e).slice(-3000)}`))));
      });
      return out.split("\n").filter((l) => l.startsWith("WP\t"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }))
).flat();
const gnoMs = performance.now() - t0;

// the wasm, as the page runs it
const host = makeHost(new WebAssembly.Module(fs.readFileSync(path.join(root, "web/lib/sim/golf.wasm"))));
let failed = 0;
const fail = (what: string) => (failed++ < 20 && console.error(`MISMATCH ${what}`));
for (const [p, want] of Object.entries(host.sources())) {
  if (sha(fs.readFileSync(path.join(root, p), "utf8")) !== want) fail(`sources: golf.wasm was built from another ${p}: run scripts/wasm.sh`);
}
const builder = makeBuilderHost(new WebAssembly.Module(fs.readFileSync(path.join(root, "web/lib/sim/builder.wasm"))));
for (const [p, want] of Object.entries(builder.sources())) {
  if (sha(fs.readFileSync(path.join(root, p), "utf8")) !== want) fail(`sources: builder.wasm was built from another ${p}: run scripts/wasm.sh`);
}
const count = { holes: 0, from: 0, round: 0, plan: 0, refused: 0, checks: 0, checksRefused: 0, fits: 0, bars: 0 };
const refusals = new Set<string>(); // PublishMine's sentences the checks met
const t1 = performance.now();
for (const l of lines) {
  const f = l.split("\t");
  if (f[1] === "C") { // PublishMine on (slug, data, note): builder.wasm's check
    const [, , slug, hole, mutation, note] = f, want = f.slice(6).join("\t");
    const r = builder.check(slug, mutate(hole.startsWith("=") ? hole.slice(1) : hexOf.get(hole)!, mutation), note);
    const got = r.ok ? ["ok", r.cost.name, r.cost.note, r.cost.bytes, r.cost.bound, r.cost.worst, r.cost.room].join("\t") : `panic: ${r.why}`;
    count.checks++;
    if (!r.ok) {
      count.checksRefused++;
      refusals.add(r.why.replace(/ \S+\/v\d+:/, " <id>:"));
    }
    if (got !== want) fail(`check ${slug} ${hole.slice(0, 40)} ${mutation} ${JSON.stringify(note)}\n  realm: ${want}\n  wasm:  ${got}`);
    continue;
  }
  if (f[1] === "T") { // author.Fit then Encode: builder.wasm's fit
    const [, , slot, margin, dx, dy, w, h, want] = f;
    const r = builder.fit(hexOf.get(slot)!, "", Number(margin));
    const got = r.ok ? `${r.dx} ${r.dy} ${r.w} ${r.h} ${sha(r.hex)}` : r.why;
    count.fits++;
    if (got !== `${Number(dx)} ${Number(dy)} ${w} ${h} ${want}`) fail(`fit ${slot} ${margin}\n  realm: ${dx} ${dy} ${w} ${h} ${want}\n  wasm:  ${got}`);
    continue;
  }
  if (f[1] === "B") { // build.Bar's corners: builder.wasm's bar
    const got = JSON.stringify(builder.bar(f[2]));
    count.bars++;
    if (got !== f[3]) fail(`bar ${f[2]}\n  realm: ${f[3]}\n  wasm:  ${got}`);
    continue;
  }
  if (f[1] === "H") {
    host.load(f[3], hexOf.get(f[2])!);
    count.holes++;
    continue;
  }
  const from = f[1] === "F" || f[1] === "f";
  const out = from ? host.from(f[2], Number(f[3]), Number(f[4]), f[5], Number(f[6]), Number(f[7])) : host.round(f[2], f[3], Number(f[4]));
  if (from) count.from++;
  else count.round++;
  if (f[1] === "F" || f[1] === "R") count.plan++;
  if (out.startsWith("panic: ")) count.refused++;
  if (sha(out) !== f[f.length - 1]) fail(`${l.split("\t").slice(1, -1).join(" ")}\n  wasm: ${out.slice(0, 300)}`);
}
const calls = count.from + count.round;
console.log(`wasmparity: ${count.holes} holes, ${calls} calls (${count.from} SimulateFrom, ${count.round} SimulateRound; ${count.plan} of the plans in 19 weathers, ` +
  `${calls - count.plan} random; ${count.refused} refused), ` +
  `${count.checks} PublishMine checks (${count.checksRefused} refused, in ${refusals.size} sentences), ${count.fits} fits, ${count.bars} bars; ` +
  `${failed} different — gno ${(gnoMs / 1000).toFixed(0)} s on ${n} cores, wasm ${((performance.now() - t1) / 1000).toFixed(1)} s`);
if (count.holes !== all.length || calls === 0) {
  failed++;
  console.error(`wasmparity: ${count.holes} of ${all.length} holes played`);
}
if (process.env.VERBOSE) console.log([...refusals].sort().join("\n"));
if (count.fits !== all.length || count.bars === 0 || count.checks === count.checksRefused) {
  failed++;
  console.error(`wasmparity: ${count.fits} fits of ${all.length}, ${count.bars} bars; ${count.checks - count.checksRefused} of ${count.checks} checks passed`);
}
process.exit(failed ? 1 : 0);
