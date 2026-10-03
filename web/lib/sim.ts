// The aim preview's physics in the page: golf.wasm, the realm's own
// SimulateFrom and SimulateRoundAt built from its sources (scripts/wasm.sh),
// run in a worker (sim/worker.ts). It answers byte for byte as the chain does
// (scripts/wasmparity.ts plays the whole course through both), so the aim's
// dots follow the pull without asking the chain (engine/aim.ts). The chain
// stays the authority: the shot played is the chain's answer, and every
// answer the chain gives the aim is checked against this one (same): any
// difference, and the previews are the chain's again for the rest of the
// visit, and analytics hears of it.
//
// It is used only once its sources are the realm's: the .gno files it was
// built from, read back from the chain (vm/qfile) through stage.sh's prefix,
// hashed and compared (once a browser: a package on the chain never changes).
// No worker, no WebAssembly, no crypto.subtle, a load or a check that fails:
// the chain's previews, as before.

import { track, trackError } from "./analytics";
import type { Chain } from "./chain";
import type { Stroke, Vec2 } from "./types";
import type { Ask, Reply } from "./sim/worker";

type SimChain = Pick<Chain, "file" | "realm" | "holeData">;

let worker: Worker | null = null, on: Promise<boolean> | null = null, off = false;
let seq = 0;
const waiting = new Map<number, [(s: string) => void, (e: Error) => void]>();
const loaded = new Map<string, Promise<boolean>>(), ready = new Set<string>();
/** The worker's time for each of the last simulations (ms), and the chain's answers checked against the page's (same): what the perf rigs read. */
export const simMs: number[] = [], simChecks = { n: 0, differ: 0 };

function post(m: Ask): Promise<string> {
  return new Promise((ok, no) => {
    waiting.set(++seq, [ok, no]);
    worker!.postMessage({ ...m, n: seq });
  });
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const digest = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Whether the files golf.wasm was built from are the ones the realm runs. */
async function sourcesMatch(chain: SimChain) {
  const src = JSON.parse(await post({ op: "sources" })) as Record<string, string>;
  const key = `gnogolf.sim|${chain.realm}|${await digest(JSON.stringify(src))}`;
  try {
    if (localStorage.getItem(key) === "ok") return true;
  } catch {}
  // stage.sh's prefix: the repo's gno.land/[pr]/gnogolf/ is the realm's
  // gno.land/[pr]/<ns>/gnogolf/ (none on a local chain), and golf/v2 (the
  // rules golf.wasm was built from: scripts/wasm.sh) is the realm
  const at = chain.realm.replace(/^gno\.land\/r\//, "").replace(/\/v[0-9]+$/, "").replace(/[^/]+$/, "");
  const rules = /^gno\.land\/r\/gnogolf\/golf(\/v[0-9]+)?\//;
  const deployed = (p: string) =>
    rules.test(p) ? chain.realm + "/" + p.replace(rules, "") : p.replace(/^gno\.land\/p\/gnogolf\//, `gno.land/p/${at}`);
  const back = (s: string) => s.replaceAll(`gno.land/p/${at}`, "gno.land/p/gnogolf/").replaceAll(`gno.land/r/${at}`, "gno.land/r/gnogolf/");
  const same = await Promise.all(Object.entries(src).map(async ([p, sum]) => (await digest(back(await chain.file(deployed(p))))) === sum));
  if (!same.every(Boolean)) return false;
  try {
    localStorage.setItem(key, "ok");
  } catch {}
  return true;
}

/** Starts the local preview, once a visit: the worker, the wasm, its sources checked. */
export function startSim(chain: SimChain): Promise<boolean> {
  if (on && !off) return on;
  if (off || typeof Worker === "undefined" || typeof WebAssembly === "undefined" || !globalThis.crypto?.subtle) return Promise.resolve(false);
  worker = new Worker(new URL("./sim/worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data: r }: MessageEvent<Reply>) => {
    const w = waiting.get(r.n);
    waiting.delete(r.n);
    if (r.ms != null) simMs.push(r.ms) > 200 && simMs.shift();
    if (w) r.err != null ? w[1](new Error(r.err)) : w[0](r.out ?? "");
  };
  worker.onerror = () => simOff("load"); // its script would not load: the chain's previews
  on = sourcesMatch(chain).then(
    (ok) => (ok || simOff("sources"), ok),
    (e: unknown) => (trackError("sim", e), simOff("load"), false),
  );
  return on;
}

/** Loads a hole's data into the local preview (HoleData, once a visit). */
export function simHole(chain: SimChain, id: string): Promise<boolean> {
  let p = loaded.get(id);
  if (!p) {
    p = startSim(chain).then(async (ok) => {
      if (!ok) return false;
      await post({ op: "load", id, hex: await chain.holeData(id) });
      ready.add(id);
      return true;
    }).catch(() => (loaded.delete(id), false)); // the chain did not answer: asked again next time
    loaded.set(id, p);
  }
  return p;
}

/** Whether the local preview answers for this hole now. */
export const simReady = (id: string | null) => !off && !!id && ready.has(id);

/**
 * One stroke as the chain would answer it (engine/aim.ts strokeFrom, the same
 * call): from the exact ball after shots, SimulateFrom; from the tee, or with
 * no ball, SimulateRoundAt of the whole list. null when the local preview is
 * not there, or when the chain would refuse the shot (it says why). A worker
 * that fails turns it off: the chain's previews, not none.
 */
export async function simStroke(id: string, shots: readonly string[], one: string, rest: Vec2 | null, period: number): Promise<Stroke | null> {
  if (!simReady(id)) return null;
  const out = await (shots.length && rest
    ? post({ op: "from", id, x: rest[0], y: rest[1], shot: one, stroke: shots.length, period })
    : post({ op: "round", id, shots: [...shots, one].join(";"), period })).catch((e: unknown) => (off || (trackError("sim", e), simOff("load")), ""));
  return out.startsWith("{") ? (JSON.parse(out) as Stroke) : null;
}

/**
 * The chain's answer to a stroke against the local one for the same call
 * (null: the local one refused it): two answers of the same JSON are equal
 * field for field, and a difference turns the local preview off (the hole,
 * the weather and the shot told).
 */
export function same(chainRes: Stroke, local: Stroke | null, what: { hole: string; period: number; shot: string; n: number }) {
  simChecks.n++;
  if (JSON.stringify(chainRes) === JSON.stringify(local)) return true;
  simChecks.differ++;
  simOff("mismatch", what);
  return false;
}

/** The chain's previews again, for the rest of the visit. */
export function simOff(why: "sources" | "load" | "mismatch", what: { hole?: string; period?: number; shot?: string; n?: number } = {}) {
  if (off) return;
  off = true;
  track("sim_off", { why, ...what });
  worker?.terminate();
  worker = null;
  for (const [, [, no]] of waiting) no(new Error("the local preview is off"));
  waiting.clear();
}
