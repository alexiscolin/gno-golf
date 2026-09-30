// The page's own aim previews turned off (lib/sim.ts), each case in a fresh
// copy of the module: sources that are not the realm's, a worker that fails,
// and (through the aim, engine/aim.ts) a shot the page refuses that the chain
// answers. Off, simReady is false and the aim asks the chain again.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { makeHost } from "../lib/sim/host.ts";
import type { Ask } from "../lib/sim/worker.ts";
import type * as Sim from "../lib/sim.ts";
import type { Live } from "../lib/engine/types.ts";
import type { Stroke } from "../lib/types.ts";

const repo = new URL("../../", import.meta.url);
const wasm = new WebAssembly.Module(fs.readFileSync(new URL("web/lib/sim/golf.wasm", repo)));
let failing = "", refusing = false; // the op the worker fails; every simulation refused
class FakeWorker {
  host = makeHost(wasm);
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: Ask & { n: number }) {
    const h = this.host;
    const data = m.op === failing ? { n: m.n, err: "RuntimeError: unreachable" }
      : refusing && m.op !== "load" && m.op !== "sources" ? { n: m.n, out: "panic: golf: refused" }
      : { n: m.n, out: m.op === "load" ? (h.load(m.id, m.hex), "") : m.op === "from" ? h.from(m.id, m.x, m.y, m.shot, m.stroke, m.period) : m.op === "round" ? h.round(m.id, m.shots, m.period) : JSON.stringify(h.sources()) };
    setImmediate(() => this.onmessage?.({ data }));
  }
  terminate() {}
}
(globalThis as { Worker?: unknown }).Worker = FakeWorker;

const hex = fs.readFileSync(new URL("data/holes.txt", repo), "utf8").split("\n")[0].split(" ")[3];
const chain = (file = (p: string) => fs.readFileSync(new URL(p, repo), "utf8")) => ({ realm: "gno.land/r/gnogolf/golf", file: (p: string) => Promise.resolve(file(p)), holeData: () => Promise.resolve(hex) });
const ID = "garden/1/v1", PERIOD = 5967997;
let copies = 0;
const fresh = () => import(`../lib/sim.ts?${++copies}`) as Promise<typeof Sim>;

void test("a deployed file that is not the one golf.wasm was built from: never started", async () => {
  const sim = await fresh();
  const c = chain((p) => fs.readFileSync(new URL(p, repo), "utf8") + (p.endsWith("physics/step.gno") ? " " : ""));
  assert.equal(await sim.startSim(c), false);
  assert.equal(await sim.simHole(c, ID), false);
  assert.equal(sim.simReady(ID), false);
});

void test("a worker that fails a simulation turns the page's previews off, not blank", async () => {
  const sim = await fresh();
  assert.equal(await sim.simHole(chain(), ID), true);
  failing = "round";
  assert.equal(await sim.simStroke(ID, [], "21.0000,8.0000", null, PERIOD), null);
  failing = "";
  assert.equal(sim.simReady(ID), false);
});

void test("a shot the page refuses that the chain answers is a difference", async (t) => {
  const sim = await import("../lib/sim.ts"), { makeAimer } = await import("../lib/engine/aim.ts"); // the aim's own copy
  assert.equal(await sim.simHole(chain(), ID), true);
  refusing = true;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 4, 3), new THREE.MeshBasicMaterial(), 256);
  const aim = new THREE.Group();
  aim.userData.dots = dots;
  const asked: ((s: Stroke) => void)[] = [];
  const ask = () => new Promise<Stroke>((ok) => asked.push(ok));
  const E = {
    g: { roundMode: null, ball: { x: 2, y: 3 }, period: PERIOD, shots: [], id: ID, rest: null, round: 1, course: null, weather: null, s: null },
    aim, band: { visible: false }, ground: () => 0, mode: "assisted", shot: { angle: 0.3, power: 7, deg: 21 },
    dragging: true, tickNow: () => 0, landing: () => null, zones: () => [], clock: 0,
    chain: { ...chain(), simulateFrom: ask, simulateRound: ask },
  } as unknown as Live;
  const aimer = makeAimer(E);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  aimer.preview();
  t.mock.timers.tick(120);
  t.mock.timers.reset();
  assert.equal(asked.length, 1);
  asked[0]({ holed: false, bounces: 0, path: [[2, 3], [4, 5]], air: "", cause: "", work: 1, rest: [4, 5] } as unknown as Stroke);
  await new Promise((r) => setTimeout(r, 20));
  E.dragging = false;
  assert.equal(sim.simReady(ID), false);
});
