// What golf.wasm's and builder.wasm's hosts share (scripts/wasm.sh builds
// both): an instance with the three WASI imports TinyGo asks for, a call's
// strings written into its buffer, its answer read back, and a refusal kept.
// A refusal is "panic: " and the realm's sentence: TinyGo prints it, then
// traps, so the caller keeps what it printed and starts a new instance next
// time. No DOM: the worker, the tests and the parity test run it alike.

/** The calls every build exports: its argument buffer, its answer. */
export interface Base {
  memory: WebAssembly.Memory;
  _initialize(): void;
  arg(n: number): number;
  out(): number;
  outlen(): number;
}

export function makeCaller<E extends Base>(mod: WebAssembly.Module) {
  const enc = new TextEncoder(), dec = new TextDecoder();
  let said = "", x: E | null = null, fresh = false;
  function start(): E {
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
    x = inst.exports as unknown as E;
    x._initialize();
    fresh = true;
    return x;
  }
  return {
    /** A call's strings, one after the other in the instance's buffer; their lengths in bytes. */
    put: (e: E, ...parts: string[]) => {
      const bs = parts.map((s) => enc.encode(s)), p = e.arg(bs.reduce((n, b) => n + b.length, 0));
      let at = p;
      for (const b of bs) new Uint8Array(e.memory.buffer, at, b.length).set(b), (at += b.length);
      return bs.map((b) => b.length);
    },
    /**
     * f's answer on the instance (begin runs first on a new one), or the
     * refusal it printed; a trap that printed none is thrown.
     */
    call: (f: (e: E) => void, begin?: (e: E) => void) => {
      said = "";
      try {
        const e = x || start();
        if (fresh) (fresh = false), begin?.(e);
        f(e);
        return dec.decode(new Uint8Array(e.memory.buffer, e.out(), e.outlen()));
      } catch (err) {
        x = null; // a trap leaves the instance as it was: a new one
        const m = said.match(/panic: [^\n]*/);
        if (!m) throw err;
        return m[0];
      }
    },
  };
}
