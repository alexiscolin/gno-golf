#!/usr/bin/env -S node --experimental-strip-types
// The Builder end to end (scripts/e2e-builder.sh starts the chain and runs
// this, from web/, with the env it sets): holes drafted with the Builder's
// code, checked by its pipeline (validate, the census included), proved in
// test mode (builder.wasm's local chain, a holing round found for each
// weather the world asks, replayed as a save is cut), then readied and
// billed as the Publish step does (its chain readings, publishSteps, bill,
// gasFor) and published with the very command it prints (gnokeyPublish),
// run with gnokey. Each publish is then read back as the game reads it
// (Holes, HoleData, HoleState, Versions), its proofs replayed by the chain
// (SimulateRoundIn), and a round found in the weather of the moment played
// for real with the game's own gnokey save (gnokeyPlan). Then holes the
// Builder refuses, published around it. Each step is a row of OUT's table,
// and the publishes' measures a table of their own after it.

import fs from "node:fs";
import { execFileSync } from "node:child_process";
import type { Draft, Piece, V } from "../web/lib/builder/draft.ts";
import type { HoleRow } from "../web/lib/types.ts";

const env = (k: string) => process.env[k] ?? (() => { throw new Error(`e2e-builder: ${k} is not set`); })();
const RPC = env("RPC"), REALM = env("NEXT_PUBLIC_REALM"), GNOKEY = env("GNOKEY"), KEYHOME = env("KEYHOME"), PASS = env("PASS"), OUT = env("OUT");
const KEYS: Record<string, string> = { a1: env("A1"), a2: env("A2"), pl: env("PL") };

const { host } = await import("../web/test/builder-fixture.ts");
await import("../web/test/scene-harness.ts");
const { census } = await import("../web/lib/builder/drawn.ts");
const { loadPalette } = await import("../web/lib/builder/palette.ts");
const { placePiece } = await import("../web/lib/builder/edit.ts");
const { frame, writeDraft } = await import("../web/lib/builder/gg1.ts");
const { emptyDraft, MAX_PIECES } = await import("../web/lib/builder/draft.ts");
const { validate } = await import("../web/lib/builder/pipeline.ts");
const { FIELD } = await import("../web/lib/builder/rules.ts");
const { STARTERS } = await import("../web/lib/builder/starters.ts");
const { canonicalHex, proofKey, provedAs, replay, shaOf, suggestPar } = await import("../web/lib/builder/proof.ts");
const { plan, holeId, holeRow } = await import("../web/lib/builder/testmode.ts");
const { makeLocalChain } = await import("../web/lib/builder/localchain.ts");
const { bill, finalHex, gasFor, gnokeyPublish, holeHolds, publishBytes, publishSteps } = await import("../web/lib/builder/publish.ts");
const { fromPublished } = await import("../web/lib/builder/importing.ts");
const { listHoles } = await import("../web/lib/builder/holes.ts");
const { makeChain, shotOf } = await import("../web/lib/chain.ts");
const { boardWork, chainSplit, feeFor, gnokeyPlan } = await import("../web/lib/adena.ts");
const { sameSources } = await import("../web/lib/sim/sources.ts");

const chain = makeChain({ rpc: RPC, web: env("WEB") });

// ------------------------------------------------------------------ report
let n = Number(env("N0")), npass = Number(env("PASS0")), nfail = Number(env("FAIL0")), nnote = 0;
let fails = env("FAILS0");
const cell = (s: unknown) => String(s).replace(/\n/g, " ").replace(/\|/g, "\\|").slice(0, 220);
/** A row of the table: ok true (PASS), false (FAIL), or "note" (what is not there yet, said, not failed). */
function row(step: string, call: string, expected: unknown, got: unknown, ok: boolean | "note", gas: unknown = "-") {
  n++;
  const r = ok === "note" ? "NOTE" : ok ? "PASS" : "FAIL";
  if (ok === "note") nnote++;
  else if (ok) npass++;
  else {
    nfail++;
    fails += ` ${n}`;
  }
  fs.appendFileSync(OUT, `| ${n} | ${cell(step)} | \`${cell(call)}\` | ${cell(expected)} | ${cell(got)} | ${r} | ${cell(gas)} |\n`);
  console.error(`${r} ${n} ${step}: ${cell(got)}`);
}
const is = (step: string, call: string, expected: unknown, got: unknown, gas?: unknown) => row(step, call, expected, got, String(expected) === String(got), gas);

// ------------------------------------------------------------------ gnokey
interface Sent { ok: boolean; out: string; gas: number; delta: number; fee: number; why: string; events: { type: string; attrs: { key: string; value: string }[] }[] }
const num = (out: string, label: string) => Number((out.match(new RegExp(`^${label}:\\s*(-?\\d+)`, "m")) ?? [])[1] ?? NaN);
/**
 * A command as the page prints it, run as the author would: gnokey, signed
 * by key, which the page names by its address (a publish) or leaves as
 * <your-key-name> (a round's plan). The one change is where the key is (this
 * run's keybase) and the password on stdin.
 */
function run(command: string, key: string): Sent {
  const signer = [` ${KEYS[key]}`, " <your-key-name>"].find((x) => command.endsWith(x));
  if (!command.startsWith("gnokey maketx ") || !signer) throw new Error(`not a page's gnokey command for ${key}: ${command.slice(0, 80)}`);
  const sh = GNOKEY + command.slice("gnokey".length, -signer.length) + ` -home ${KEYHOME} -insecure-password-stdin ${KEYS[key]}`;
  let out = "";
  for (let i = 0; i < 3; i++) {
    try {
      out = execFileSync("sh", ["-c", sh], { input: PASS + "\n", encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 1 << 26 });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? "") + String((e as { stderr?: string }).stderr ?? "");
    }
    // (a sequence read before the last tx's block is "unauthorized": again)
    if (!out.includes("unauthorized error")) break;
    execFileSync("sleep", ["2"]);
  }
  const ok = /^OK!/m.test(out);
  const ev = (out.match(/^EVENTS:\s*(\[.*\])$/m) ?? [])[1];
  return {
    ok, out, gas: num(out, "GAS USED"), delta: num(out, "STORAGE DELTA"), fee: num(out, "STORAGE FEE"),
    why: (out.match(/^Data: (.*)$/m) ?? [])[1] ?? "", events: ev ? (JSON.parse(ev) as Sent["events"]) : [],
  };
}
const event = (s: Sent, type: string) => Object.fromEntries((s.events.find((e) => e.type === type)?.attrs ?? []).map((a) => [a.key, a.value]));

// ------------------------------------------------------------------ drafts
const rail = (id: string, a: V, b: V): Piece => ({ id, entry: "*/rail/", geometry: { t: "rail", a, b }, params: {}, clock: { k: "fixed" } });
const ring = (pts: V[]) => pts.map((p, i) => rail(`r${i + 1}`, p, pts[(i + 1) % pts.length]));
/** A plain lane: four rails, the tee and the cup at its ends. */
const lane = (world: string, w: number, h: number, pieces: Piece[] = []): Draft =>
  frame({ ...emptyDraft(world), title: "Plain lane", tee: [3, h / 2], pin: [w - 3, h / 2], pieces: [...ring([[0, 0], [w, 0], [w, h], [0, h]]), ...pieces] });

/** A post of the world's palette, as scripts/starters.ts picks one: its own, else a skinned post of every world. */
const postOf = (palette: Awaited<ReturnType<typeof loadPalette>>, world: string) =>
  [...palette.filter((e) => e.kind === "post" && e.world === world), ...palette.filter((e) => e.kind === "post" && e.world === "*" && e.skin)][0];

/** The Builder's errors on a draft (validate, the census in), as "rule text". */
async function errorsOf(d: Draft): Promise<string[]> {
  const palette = await loadPalette(d.world);
  return validate(d, { host, palette, census, slug: d.slug || "draft" }).issues.filter((i) => i.severity === "error").map((i) => `${i.rule} ${i.text}`);
}

/** A holing round by search (scripts/starters.ts holing): each stroke the best of a fan of shots toward the cup, 8 strokes at most. */
function holing(id: string, d: Draft, period: number): string[] | null {
  const shots: string[] = [];
  let rest: V = d.tee;
  host.setperiod(period);
  for (let k = 0; k < 8; k++) {
    let best: { s: string; rest: V; d: number } | null = null;
    const toward = (Math.atan2(d.pin[1] - rest[1], d.pin[0] - rest[0]) * 180) / Math.PI;
    for (let da = -40; da <= 40; da += 2) {
      for (let pw = 0.5; pw <= 10; pw += 0.25) {
        const s = shotOf(Math.round((toward + da) * 100) / 100, pw);
        const out = k === 0 ? host.round(id, s, period) : host.from(id, rest[0], rest[1], s, k, period);
        if (out.startsWith("panic: ")) continue;
        const r = JSON.parse(out) as { holed: boolean; rest: V };
        if (r.holed) return [...shots, s];
        const dd = Math.hypot(r.rest[0] - d.pin[0], r.rest[1] - d.pin[1]);
        if (!best || dd < best.d) best = { s, rest: r.rest, d: dd };
      }
    }
    if (!best) return null;
    shots.push(best.s);
    rest = best.rest;
  }
  return null;
}

// --------------------------------------------- the Publish step's readings
/** What Publish.tsx reads before it opens, read the same way (the takedown list is the site's: none here). */
async function readings(alias: string) {
  const [publishing, rules, writer, versions, holes, gas, byte, chainId] = await Promise.all([
    chain.publishing().catch(() => null),
    Promise.all([chain.successor(), sameSources(chain, host.sources(), "builder")]).then(([s, same]) => same && s === "", () => null),
    chain.writer().catch(() => null),
    chain.versions(alias).catch(() => null),
    chain.holes(true).catch(() => [] as HoleRow[]),
    chain.gasPrice(),
    chain.storagePrice(),
    chain.chainId(),
  ]);
  return { publishing, rules, writer, taken: false, versions, firstCommunity: !holes.some((h) => h.official === false), gas, byte, chainId };
}

// ------------------------------------------------------- one hole, published
interface Measure { hole: string; id: string; bytes: number; runes: number; v: number; newAuthor: boolean; firstCommunity: boolean; stored: number; predicted: number; depositCap: number; depositPaid: number; gasAsked: number; gasUsed: number; fee: number }
const measures: Measure[] = [];
const authorsSeen = new Set<string>();

/**
 * A draft through the Builder to the chain, as its author would take it:
 * checked, proved in each weather under the id it will have, its par from
 * the proofs, readied and billed as the Publish step does, published with
 * the command it prints; then read back and played. Returns the id.
 */
async function publish(label: string, d0: Draft, signer: string): Promise<{ id: string; hex: string; draft: Draft } | null> {
  const author = KEYS[signer], alias = `${author}/${d0.slug}`;
  const errors = await errorsOf(d0);
  is(`${label}: the Builder's checks`, `validate(${d0.slug}) errors`, "none", errors.length ? errors.join("; ") : "none");
  if (errors.length) return null;

  // test mode: the id it will be published under, each weather's period up to the chain's now, a holing round in each
  const r0 = await readings(alias);
  const id = holeId(author, d0.slug, r0.versions), now = await chain.period();
  const key0 = await proofKey(d0, host), hex0 = canonicalHex(d0, host)!;
  host.load(id, hex0);
  const proofs = [];
  for (const { kind, period } of plan(host, id, d0.world, now)) {
    const shots = holing(id, d0, period);
    const p = shots && (await replay(makeLocalChain(host, holeRow(id, d0), hex0, period), { key: key0!, id, kind, period, shots }));
    const ok = !!p && typeof p !== "string";
    row(`${label}: test mode, ${kind || "clear"}`, `holing round at period ${period}, replayed as a save is cut`, "holed", ok ? `holed in ${shots.length}: ${shots.join(" ")}` : (p ?? "no round found"), ok);
    if (ok) proofs.push(p);
  }
  const d: Draft = { ...d0, proofs, par: Math.max(d0.par, suggestPar(proofs)) };

  // the Publish step, as Publish.tsx computes it
  const first = host.check(d.slug, finalHex(d, host, d.title) ?? "", d.note);
  const name = first.ok ? first.cost.name : d.title, note = first.ok ? first.cost.note : d.note;
  const hex = finalHex(d, host, name) ?? "";
  const checked = host.check(d.slug, hex, note);
  const key = await proofKey(d, host);
  const proved = key ? provedAs(d.proofs, d.world, key, author, d.slug) : null;
  const hole = hex && key && proved ? await holeHolds({ ...d, title: name }, hex, key, proved, { host, palette: await loadPalette(d.world), census }) : "The rounds that proved it no longer play out the same on its final data: test it again.";
  const sha = await shaOf(hex);
  const step = publishSteps({ publishing: r0.publishing, rules: r0.rules, writer: r0.writer, taken: r0.taken, versions: r0.versions, hole, name: checked.ok ? "" : checked.why }, { author, slug: d.slug, proved: proved ?? "", sha, realm: chain.realm });
  is(`${label}: the Publish step`, "publishSteps(readings)", "ready", step.at + (step.why ? `: ${step.why}` : ""));
  if (step.at !== "ready" || !checked.ok) return null;
  const v = Number(id.slice(id.lastIndexOf("/v") + 2)) || 1;
  const sizes = { bytes: checked.cost.bytes, name, note, v, newAuthor: true };
  const b = bill({ ...sizes, gasPrice: r0.gas, bytePrice: r0.byte });
  const gas = gasFor(sizes), deposit = Math.round(b.deposit * 1e6);
  const command = gnokeyPublish({ realm: chain.realm, slug: d.slug, hex, note, gas, price: r0.gas, deposit, chainId: r0.chainId, rpc: RPC, author });
  row(`${label}: the command it prints`, command.replace(hex, `<${hex.length / 2} bytes>`), "a gnokey call", command ? "printed" : "none", !!command);

  // published
  const sent = run(command, signer);
  row(`${label}: published (${b.deposit.toFixed(4)} GNOT deposit, ${b.fee.toFixed(4)} fee billed)`, `${signer}: the printed command`, "went through", sent.ok ? "went through" : `refused: ${sent.why || sent.out.slice(-300)}`, sent.ok, sent.gas);
  if (!sent.ok) return null;
  const ev = event(sent, "HolePublished");
  is(`${label}: its id`, "HolePublished hole", id, ev.hole);
  is(`${label}: its sha`, "HolePublished sha = shaOf(hex)", sha, ev.sha);
  const after = await chain.versions(alias);
  const last = after.versions.at(-1);
  is(`${label}: Versions`, `Versions(${d.slug}) last: id, v, sha`, `${id} ${v} ${sha}`, `${last?.id} ${last?.v} ${last?.sha}`);
  is(`${label}: Current`, `Current(${d.slug})`, id, await chain.current(alias));

  // what it stored and cost, against the bill
  const newAuthor = !authorsSeen.has(author);
  authorsSeen.add(author);
  const predicted = publishBytes({ ...sizes, newAuthor });
  measures.push({ hole: label, id, bytes: sizes.bytes, runes: [...name].length + [...note].length, v, newAuthor, firstCommunity: r0.firstCommunity, stored: sent.delta, predicted, depositCap: deposit, depositPaid: sent.fee, gasAsked: gas, gasUsed: sent.gas, fee: feeFor(gas, r0.gas) });
  row(`${label}: the deposit within the bill`, "STORAGE FEE ≤ the bill's deposit (-max-deposit)", `≤ ${deposit}`, sent.fee, sent.fee <= deposit);
  row(`${label}: the gas within the ask`, "GAS USED ≤ gasFor", `≤ ${gas}`, sent.gas, sent.gas <= gas);
  // the deposit is publishBytes a tenth more (publish.ts deposit): more stored than that would make the cap too low
  // (a refused publish), a failure; within it but over publishBytes, or a bill that overstates by a tenth, noted
  // (the table after the steps has every figure)
  const off = sent.delta - predicted;
  row(`${label}: stored vs publishBytes`, `STORAGE DELTA vs publishBytes (newAuthor ${newAuthor}, first ${r0.firstCommunity})`, `≤ ${Math.floor(predicted * 1.1)} (publishBytes ${predicted}, a tenth more)`,
    `${sent.delta} (${off >= 0 ? "+" : ""}${off}, ${(off / predicted * 100).toFixed(0)}%)`, off > 0.1 * predicted ? false : (off <= 0 && -off <= 0.1 * predicted) || "note");

  // the game reads it
  const listed = (await chain.holes(true)).find((h) => h.id === id);
  is(`${label}: listed`, "Holes(): its row, official", "false", String(listed?.official));
  is(`${label}: HoleData`, "HoleData(id) = the published bytes", "same", (await chain.holeData(id)) === hex ? "same" : "differs");
  const p = await chain.period(), s = await chain.state(id);
  host.load(id, hex);
  host.setperiod(p);
  is(`${label}: HoleState`, "HoleState(id) = builder.wasm's state of it", "same", JSON.stringify(s) === JSON.stringify(JSON.parse(host.state(id))) ? "same" : "differs");
  for (const pr of d.proofs) {
    const r = await chain.replayRound(id, pr.shots, pr.period);
    is(`${label}: the chain replays the ${pr.kind || "clear"} proof`, `SimulateRoundIn(id, …, ${pr.period})`, `holed in ${pr.strokes}`, r.holed ? `holed in ${r.strokes}` : `not holed (${r.strokes})`);
  }
  await play(label, id, d);
  return { id, hex, draft: d };
}

/** A round in the weather of the moment, found locally, asked of the chain, then saved by the player with the game's gnokey save. */
async function play(label: string, id: string, d: Draft) {
  const period = await chain.period();
  const shots = holing(id, d, period);
  if (!shots) return row(`${label}: played now`, `a holing round at period ${period}`, "found", "none", false);
  const sim = await chain.simulateRound(id, shots, period);
  is(`${label}: SimulateRoundAt`, `SimulateRoundAt(id, ${shots.join(";")}, ${period})`, `holed in ${shots.length}`, sim.holed ? `holed in ${sim.strokes}` : `not holed (${sim.strokes})`);
  // the save, as the engine snapshots a holed round: the work model's fields, each stroke's path and work
  const [st, fc] = await Promise.all([chain.state(id), chain.weather(id, period)]);
  const pts: number[] = [], works: number[] = [];
  let rest: V | null = null;
  for (let k = 0; k < shots.length; k++) {
    const a = rest ? await chain.simulateFrom(id, rest, shots[k], k, period) : await chain.simulateRound(id, [shots[k]], period);
    pts.push(a.path.length);
    works.push(a.work || 0);
    rest = a.rest as V;
  }
  const save = { id, official: false, shots, period, roundMode: "assisted" as const, ...boardWork(st, { walls: 0, posts: 0, pieces: 0 }, fc.zones), kind: fc.kind, pts, works, fixed: fc.gas || 0 };
  const parts = await chainSplit(chain, save, period);
  const cmds = gnokeyPlan(save, { realm: chain.realm, price: await chain.gasPrice(), chainId: await chain.chainId(), rpc: RPC, parts });
  let gas = 0, ok = cmds.length > 0, why = "";
  for (const c of cmds) {
    const r = run(c, "pl");
    gas += r.gas || 0;
    if (!r.ok) {
      ok = false;
      why = r.why || r.out.slice(-200);
    }
    if (!ok) break;
  }
  row(`${label}: the player saves it (gnokeyPlan, ${cmds.length - 1} commit${cmds.length > 2 ? "s" : ""})`, "pl: Reset, then PlayRoundAt as printed", "went through", ok ? "went through" : `refused: ${why}`, ok, gas);
  const best = Number((execFileSync(GNOKEY, ["query", "vm/qeval", "-remote", RPC.replace(/^https?:\/\//, ""), "-data", `${REALM}.BestOf("${id}","assisted","${KEYS.pl}")`], { encoding: "utf8" }).match(/\((\d+) int\)/) ?? [])[1]);
  is(`${label}: the player's best`, `BestOf(id, "assisted", pl)`, shots.length, best);
}

// ------------------------------------------------------------ the scenario
// 1. a plain lane: the chain's first community hole, its author's first
const plain = { ...lane("garden", 30, 12), slug: "plain-lane", title: "Plain lane" };
const v1 = await publish("plain lane", plain, "a1");

// 2. a starter of each classic world, as the Builder offers them
for (const world of Object.keys(FIELD)) {
  const st = STARTERS[world].signature;
  await publish(`starter ${world}`, { ...st, slug: `${world}-signature` }, "a1");
}

// 3. a heavy hole: a long lane, posts added on both sides of a clear middle
//    until the Builder takes no more (MAX_PIECES, or a check refuses five in a row)
{
  const palette = await loadPalette("garden"), post = postOf(palette, "garden");
  let d: Draft = { ...lane("garden", 90, 40), slug: "heavy", title: "Heavy" };
  let refusedInRow = 0, tried = 0;
  outer: for (let y = 3; y <= 37; y += 3) {
    if (Math.abs(y - 20) < 6) continue; // the middle stays clear: the ball's way
    for (let x = 4; x <= 86; x += 3) {
      if (d.pieces.length >= MAX_PIECES) break outer;
      tried++;
      const next = { ...d, pieces: [...d.pieces, placePiece(post, `p${tried}`, [x, y])] };
      if ((await errorsOf(next)).length) {
        if (++refusedInRow >= 5) break outer;
        continue;
      }
      d = next;
      refusedInRow = 0;
    }
  }
  const c = host.check("heavy", canonicalHex(d, host)!, "");
  if (c.ok) {
    const k = c.cost;
    row("heavy hole: near the limits", "check(heavy): bytes, bound/maxShot, worst/budget, room/minShot",
      `${d.pieces.length} pieces`, `${k.bytes} B of 32768; bound ${(k.bound / k.maxShot * 100).toFixed(0)}% of maxShot; worst ${(k.worst / k.budget * 100).toFixed(0)}% of budget; room ${k.room} (min ${k.minShot})`, true);
  }
  await publish("heavy hole", d, "a1");
}

// 4. a named hole: a long name and note, in several scripts (the Builder's limits: 40 and 140 characters)
{
  const title = "Le jardin des gnomes 🌷 庭のノーム ⛳ Ωμέγα";
  const note = "Un trou pour les patients : visez le coin, laissez rouler. 🌧️ Bei Regen langsamer. 雨の日は遅い。 Καλή τύχη! Удачи — ¡suerte! 🍄🍄🍄 ok";
  const d = { ...lane("island", 34, 14), slug: "jardin-unicode", title: [...title].slice(0, 40).join(""), note: [...note].slice(0, 140).join("") };
  is("named hole: within the Builder's limits", "[...title].length, [...note].length", "≤40 ≤140", `${[...d.title].length <= 40 ? "≤40" : [...d.title].length} ${[...d.note].length <= 140 ? "≤140" : [...d.note].length}`);
  const r = await publish("named hole", d, "a2");
  if (r) {
    const want = host.check(d.slug, r.hex, d.note);
    const entry = (await chain.versions(`${KEYS.a2}/${d.slug}`)).versions.at(-1);
    is("named hole: the note as kept", "Versions(…).note = check's note", want.ok ? want.cost.note : "?", entry?.note);
    const listed = (await chain.holes(true)).find((h) => h.id === r.id);
    is("named hole: the name as kept", "Holes() name = check's name", want.ok ? want.cost.name : "?", listed?.name);
  }
}

// 5. a second version of the plain lane: a post added; the old proofs are not this hole's
if (v1) {
  const palette = await loadPalette("garden"), post = postOf(palette, "garden");
  const same = await readings(`${KEYS.a1}/plain-lane`);
  const sha1 = await shaOf(v1.hex);
  const again = publishSteps({ publishing: same.publishing, rules: same.rules, writer: same.writer, taken: same.taken, versions: same.versions, hole: "", name: "" }, { author: KEYS.a1, slug: "plain-lane", proved: holeId(KEYS.a1, "plain-lane", same.versions), sha: sha1, realm: chain.realm });
  is("second version: the same data again", "publishSteps, v1's data", "same", again.at);
  const d2: Draft = { ...plain, pieces: [...plain.pieces, placePiece(post, "p1", [15, 3])], proofs: v1.draft.proofs };
  const k2 = await proofKey(d2, host);
  is("second version: v1's proofs do not hold", "provedAs(v1's proofs, the new key)", "null", String(provedAs(d2.proofs, "garden", k2!, KEYS.a1, "plain-lane")));
  const v2 = await publish("second version", { ...d2, proofs: [] }, "a1");
  if (v2) {
    const vs = await chain.versions(`${KEYS.a1}/plain-lane`);
    is("second version: v1 archived", "Versions: v1's next", v2.id, vs.versions[0]?.next);
    is("second version: the alias plays v2", "Current(plain-lane)", v2.id, await chain.current(`${KEYS.a1}/plain-lane`));
  }
}

// ------------------------------------------------------------------ hostile
// Holes the Builder refuses (its checks), published around it with a plain
// gnokey PublishMine: the chain takes them (it checks the data, not the
// play); the Builder will not open them; the lists, today, still show them.
{
  const palette = await loadPalette("garden"), post = postOf(palette, "garden");
  const base = lane("garden", 30, 12);
  const hostile: [string, Draft][] = [
    ["cup in a wall", { ...base, slug: "cup-in-wall", title: "Cup in a wall", pieces: [...base.pieces, placePiece(post, "p1", base.pin)] }],
    // (a box of rails round the cup, clear of it and of the lane's own rails: nothing touches; the ball cannot get in)
    ["unreachable cup", { ...lane("garden", 44, 20, ring([[34, 5], [43, 5], [43, 15], [34, 15]]).map((p, i) => ({ ...p, id: `w${i}` }))), slug: "walled-cup", title: "Walled cup" }],
    ["overlapping pieces", { ...base, slug: "overlap", title: "Overlap", pieces: [...base.pieces, placePiece(post, "p1", [12, 4]), placePiece(post, "p2", [12.5, 4])] }],
  ];
  const r = await readings(`${KEYS.a2}/x`);
  for (const [label, d] of hostile) {
    const errors = await errorsOf(d);
    row(`hostile, ${label}: the Builder refuses it`, `validate(${d.slug}) errors`, "an error", errors.length ? errors.join("; ") : "none", errors.length > 0);
    const { hex: raw, bars } = writeDraft(frame(d), FIELD[d.world]);
    const f = host.fit(raw, bars);
    const hex = f.ok ? f.hex : raw;
    const c = host.check(d.slug, hex, "");
    const gas = gasFor({ bytes: hex.length / 2, name: d.title, note: "" });
    const cmd = gnokeyPublish({ realm: chain.realm, slug: d.slug, hex, note: "", gas, price: r.gas, deposit: 100_000_000, chainId: r.chainId, rpc: RPC, author: KEYS.a2 });
    const sent = run(cmd, "a2");
    row(`hostile, ${label}: the chain takes it`, "a2: PublishMine, around the Builder", "went through", sent.ok ? "went through" : `refused: ${sent.why}`, sent.ok, sent.gas);
    if (!sent.ok) continue;
    const id = event(sent, "HolePublished").hole;
    is(`hostile, ${label}: PublishMine's own checks pass`, "builder.wasm check()", "ok", c.ok ? "ok" : c.why);
    const opened = await fromPublished(await chain.holeData(id), host, id, KEYS.a2, census);
    row(`hostile, ${label}: the Builder will not open it`, "fromPublished(HoleData(id))", "refused, its rules named", typeof opened === "string" ? opened : "opened", typeof opened === "string" && opened.startsWith("This hole breaks the Builder's rules"));
    const { community, mine } = listHoles(await chain.holes(true), null, new Set());
    const shown = [...community, ...mine].some((h) => h.id === id);
    row(`hostile, ${label}: hidden from the lists`, "listHoles(Holes()) after re-validation", "hidden", shown ? "listed (no re-validation in the lists yet)" : "hidden", shown ? "note" : true);
  }
}

// ------------------------------------------------------------------ summary
fs.appendFileSync(OUT, `\n**${npass} passed, ${nfail} failed${nnote ? `, ${nnote} noted` : ""}** of ${n} steps.${fails.trim() ? ` Failed: ${fails.trim()}.` : ""}\n`);
fs.appendFileSync(OUT, `\n### What each publish stored and cost\n\n| hole | id | data B | name+note runes | v | new author | first community | stored B | publishBytes | Δ | deposit cap (bill) | deposit paid | gasFor | gas used | used/asked |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`);
for (const m of measures)
  fs.appendFileSync(OUT, `| ${m.hole} | \`${m.id.replace(/^g1\w+/, (a) => a.slice(0, 8) + "…")}\` | ${m.bytes} | ${m.runes} | ${m.v} | ${m.newAuthor} | ${m.firstCommunity} | ${m.stored} | ${m.predicted} | ${m.stored - m.predicted >= 0 ? "+" : ""}${m.stored - m.predicted} | ${m.depositCap} | ${m.depositPaid} | ${m.gasAsked} | ${m.gasUsed} | ${(m.gasUsed / m.gasAsked * 100).toFixed(0)}% |\n`);
fs.writeFileSync(OUT.replace(/\.md$/, "") + "-measures.json", JSON.stringify(measures, null, 1));
console.error(`e2e: ${npass} passed, ${nfail} failed${nnote ? `, ${nnote} noted` : ""}; the table is in ${OUT}`);
process.exit(nfail ? 1 : 0);
