// golf.wasm's host (scripts/wasm.sh builds it): the realm's SimulateFrom and
// SimulateRoundAt answered here, byte for byte, as JSON strings. A refusal is
// "panic: " and the realm's sentence (wasi.ts); a new instance has the holes
// loaded again when asked for. No DOM: the worker (worker.ts) and the parity
// test (scripts/wasmparity.ts) run it alike.
import { makeCaller, type Base } from "./wasi";

interface Exports extends Base {
  load(n: number): void;
  from(n: number, x: number, y: number, m: number, stroke: number, period: bigint): void;
  round(n: number, period: bigint): void;
  sources(): void;
}

export function makeHost(mod: WebAssembly.Module) {
  const { put, call: run } = makeCaller<Exports>(mod);
  const loaded = new Set<string>(), data = new Map<string, string>();
  function call(id: string | null, f: (e: Exports) => void) {
    if (id != null && !data.has(id)) return `panic: golf: unknown hole: ${id}`;
    return run((e) => {
      if (id != null && !loaded.has(id)) {
        e.load(put(e, id, data.get(id)!)[0]);
        loaded.add(id);
      }
      f(e);
    }, () => loaded.clear());
  }
  return {
    /** Keeps a hole's data (HoleData's hex) under its version's id. */
    load(id: string, hex: string) {
      data.set(id, hex);
      loaded.delete(id);
    },
    has: (id: string) => data.has(id),
    /** SimulateFrom's answer. */
    from: (id: string, x: number, y: number, shot: string, stroke: number, period: number) =>
      call(id, (e) => {
        const [n, m] = put(e, id, shot);
        e.from(n, x, y, m, stroke, BigInt(period));
      }),
    /** SimulateRoundAt's (without its clock). */
    round: (id: string, shots: string, period: number) => call(id, (e) => e.round(put(e, id, shots)[0], BigInt(period))),
    /** {path: sha256} of the .gno files it was built from. */
    sources: () => JSON.parse(call(null, (e) => e.sources())) as Record<string, string>,
  };
}
export type Host = ReturnType<typeof makeHost>;
