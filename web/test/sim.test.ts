// The page's own aim previews (lib/sim.ts): the real golf.wasm, in its real
// host, behind a stand-in Worker that answers in-process as sim/worker.ts
// does; the chain a fake that serves the repo's files as a deploy under a
// name would (stage.sh's prefix) and data/holes.txt's data. Then the aim
// (engine/aim.ts) drawing them, the chain asked only once the hand rests, and
// a chain answer that differs turning them off. (The wasm's answers against
// the realm's: scripts/wasmparity.ts.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { makeHost } from "../lib/sim/host.ts";
import type { Ask } from "../lib/sim/worker.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Mode, Stroke, Vec2 } from "../lib/types.ts";

const repo = new URL("../../", import.meta.url);
const wasm = new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo)));
class FakeWorker {
  host = makeHost(wasm);
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: Ask & { n: number }) {
    const h = this.host;
    const out = m.op === "load" ? (h.load(m.id, m.hex), "") : m.op === "from" ? h.from(m.id, m.x, m.y, m.shot, m.stroke, m.period) : m.op === "round" ? h.round(m.id, m.shots, m.period) : JSON.stringify(h.sources());
    setImmediate(() => this.onmessage?.({ data: { n: m.n, out, ms: 0 } }));
  }
  terminate() {}
}
(globalThis as { Worker?: unknown }).Worker = FakeWorker;
const { startSim, simHole, simReady, simStroke, same } = await import("../lib/sim.ts");
const { makeAimer } = await import("../lib/engine/aim.ts");

const NS = "nym-tester000";
const asked: string[] = [];
const hex = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").split("\n")[0].split(" ")[3];
const chain = {
  realm: `gno.land/r/${NS}/gnogolf/golf/v2`,
  // the deployed file: the repo's, its paths under the name
  file: (p: string) => {
    asked.push(p);
    const at = p.replace(`gno.land/p/${NS}/gnogolf/`, "gno.land/p/gnogolf/").replace(`gno.land/r/${NS}/gnogolf/golf/`, "gno.land/r/gnogolf/golf/");
    return Promise.resolve(fs.readFileSync(new URL(at, repo), "utf8").replace(/gno\.land\/([pr])\/gnogolf\//g, `gno.land/$1/${NS}/gnogolf/`));
  },
  holeData: () => Promise.resolve(hex),
};
const ID = "garden/1/v1", PERIOD = 5967997;
const settle = () => new Promise((r) => setTimeout(r, 5));

void test("the wasm starts once its sources are the realm's deployed files, read back through the name's prefix", async () => {
  assert.equal(simReady(ID), false);
  assert.equal(await startSim(chain), true);
  assert.ok(asked.includes(`gno.land/p/${NS}/gnogolf/physics/step.gno`) && asked.includes(`gno.land/r/${NS}/gnogolf/golf/v2/golf.gno`));
  assert.equal(await simHole(chain, ID), true);
  assert.equal(simReady(ID), true);
});

void test("a stroke answers as the chain's JSON; a shot the chain would refuse answers null", async () => {
  const s = await simStroke(ID, [], "21.0000,8.0000", null, PERIOD);
  assert.ok(s && s.path.length > 2 && Array.isArray(s.rest) && typeof s.holed === "boolean");
  const from = await simStroke(ID, ["21.0000,8.0000"], "290.5000,7.7500", s.rest, PERIOD);
  assert.ok(from && from.path[0][0] === Math.round(s.rest[0] * 1000) / 1000);
  assert.equal(await simStroke(ID, [], "21.0000,10.5000", null, PERIOD), null); // too strong: refused
  assert.equal(await simStroke("garden/2/v1", [], "21.0000,8.0000", null, PERIOD), null); // no data loaded for it
});

// the aim, as aim.test.ts rigs it, on this hole with the page's own previews
function rig() {
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 4, 3), new THREE.MeshBasicMaterial(), 256);
  dots.count = 0;
  const aim = new THREE.Group();
  aim.userData.dots = dots;
  const calls: { args: unknown[]; resolve: (s: Stroke) => void }[] = [];
  const ask = (...args: unknown[]) => new Promise<Stroke>((resolve) => calls.push({ args, resolve }));
  const g = { roundMode: null as Mode | null, ball: { x: 2, y: 3 }, period: PERIOD, shots: [] as string[], id: ID, rest: null as Vec2 | null, round: 1, course: null, weather: null, s: null };
  const E = {
    g, aim, band: { visible: false }, ground: () => 0, mode: "assisted" as Mode, shot: { angle: 0.3, power: 7, deg: 21 as number | undefined },
    dragging: true, tickNow: () => 0, landing: () => null, zones: () => [], clock: 0,
    chain: { ...chain, simulateFrom: ask, simulateRound: ask },
  } as unknown as Live;
  return { E, dots, calls, aimer: makeAimer(E) };
}

void test("the aim draws the page's own answer at once, and asks the chain only once the hand rests", async () => {
  const { E, dots, calls, aimer } = rig();
  aimer.preview();
  await settle();
  const own = await simStroke(ID, [], "21.0000,7.0000", null, PERIOD);
  assert.ok(own && dots.count > 2); // the page's path, not the straight line's two
  assert.equal(calls.length, 0); // not asked while the hand moves
  aimer.preview(); // the hand rests on the same aim (the frames go on: the timer armed once)
  await new Promise((r) => setTimeout(r, 130));
  assert.equal(calls.length, 1); // now the chain, for the release and to check
  calls[0].resolve(own);
  await settle();
  assert.equal(simReady(ID), true); // the same answer: still on
  E.dragging = false;
});

void test("a chain answer that differs from the page's turns the page's previews off for the visit", async () => {
  const own = (await simStroke(ID, [], "21.0000,8.0000", null, PERIOD))!;
  assert.equal(same(own, own, { hole: ID, period: PERIOD, shot: "21.0000,8.0000", n: 0 }), true);
  assert.equal(same({ ...own, bounces: own.bounces + 1 }, own, { hole: ID, period: PERIOD, shot: "21.0000,8.0000", n: 0 }), false);
  assert.equal(simReady(ID), false);
  assert.equal(await simStroke(ID, [], "21.0000,8.0000", null, PERIOD), null);
  assert.equal(await startSim(chain), false);
});
