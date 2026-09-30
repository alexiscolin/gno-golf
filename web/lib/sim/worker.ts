// The local preview's worker (lib/sim): golf.wasm in its host, off the main
// thread, so a simulation never holds a frame. One message, one answer, in
// the order they came.
import { makeHost, type Host } from "./host";

/** What the page asks: a hole's data kept, a SimulateFrom, a SimulateRoundAt, the wasm's sources. */
export type Ask =
  | { op: "load"; id: string; hex: string }
  | { op: "from"; id: string; x: number; y: number; shot: string; stroke: number; period: number }
  | { op: "round"; id: string; shots: string; period: number }
  | { op: "sources" };
/** Its answer: the call's (a JSON string, "panic: …" for a refusal), or what went wrong, and the time taken. */
export type Reply = { n: number; out?: string; err?: string; ms?: number };

let host: Promise<Host> | null = null;
self.onmessage = async ({ data: m }: MessageEvent<Ask & { n: number }>) => {
  const t0 = performance.now();
  let r: Reply;
  try {
    host ??= fetch(new URL("./golf.wasm", import.meta.url))
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`golf.wasm: ${res.status}`))))
      .then((b) => WebAssembly.compile(b))
      .then(makeHost);
    const h = await host;
    const out =
      m.op === "load" ? (h.load(m.id, m.hex), "")
      : m.op === "from" ? h.from(m.id, m.x, m.y, m.shot, m.stroke, m.period)
      : m.op === "round" ? h.round(m.id, m.shots, m.period)
      : JSON.stringify(h.sources());
    r = { n: m.n, out, ms: performance.now() - t0 };
  } catch (e) {
    host = null; // a failed load is tried again by the next message
    r = { n: m.n, err: String(e) };
  }
  postMessage(r);
};
