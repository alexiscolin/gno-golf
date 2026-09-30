// golf.wasm's host (scripts/wasm.sh builds it): the realm's SimulateFrom and
// SimulateRoundAt answered here, byte for byte, as JSON strings. A refusal is
// "panic: " and the realm's sentence: TinyGo prints it, then traps, so the
// host keeps what it printed and starts a new instance, whose holes are
// loaded again when asked for. No DOM: the worker (worker.ts) and the parity
// test (scripts/wasmparity.ts) run it alike.

interface Exports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  arg(n: number): number;
  load(n: number): void;
  from(n: number, x: number, y: number, m: number, stroke: number, period: bigint): void;
  round(n: number, period: bigint): void;
  sources(): void;
  out(): number;
  outlen(): number;
}

export function makeHost(mod: WebAssembly.Module) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  let said = "", x: Exports | null = null;
  const loaded = new Set<string>(), data = new Map<string, string>();
  function start(): Exports {
    const inst = new WebAssembly.Instance(mod, {
      wasi_snapshot_preview1: {
        // what TinyGo prints: a panic's line, before it traps
        fd_write(_fd: number, iovs: number, n: number, written: number) {
          const v = new DataView(x!.memory.buffer);
          let len = 0;
          for (let i = 0; i < n; i++) {
            const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
            said += dec.decode(new Uint8Array(x!.memory.buffer, p, l));
            len += l;
          }
          v.setUint32(written, len, true);
          return 0;
        },
        random_get(p: number, n: number) {
          crypto.getRandomValues(new Uint8Array(x!.memory.buffer, p, n));
          return 0;
        },
      },
    });
    x = inst.exports as unknown as Exports;
    x._initialize();
    loaded.clear();
    return x;
  }
  // a call's strings, one after the other in the instance's buffer; their
  // lengths in bytes
  function put(e: Exports, ...parts: string[]) {
    const bs = parts.map((s) => enc.encode(s)), p = e.arg(bs.reduce((n, b) => n + b.length, 0));
    let at = p;
    for (const b of bs) new Uint8Array(e.memory.buffer, at, b.length).set(b), (at += b.length);
    return bs.map((b) => b.length);
  }
  const answer = (e: Exports) => dec.decode(new Uint8Array(e.memory.buffer, e.out(), e.outlen()));
  function call(id: string | null, f: (e: Exports) => void) {
    said = "";
    try {
      const e = x || start();
      if (id != null && !loaded.has(id)) {
        const hex = data.get(id);
        if (hex == null) return `panic: golf: unknown hole: ${id}`;
        e.load(put(e, id, hex)[0]);
        loaded.add(id);
      }
      f(e);
      return answer(e);
    } catch (err) {
      x = null; // a trap leaves the instance as it was: a new one
      const m = said.match(/panic: [^\n]*/);
      if (!m) throw err;
      return m[0];
    }
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
