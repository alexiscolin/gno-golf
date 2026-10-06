// builder.wasm, fetched and compiled once a visit, on the editor's path only
// (app/build/gate.tsx): the phone's screen never reaches this module. A
// failed load is tried again by the next call.
import { makeBuilderHost, type BuilderHost } from "./wasm";

let once: Promise<BuilderHost> | null = null;

/** The builder's host, its wasm loaded. */
export function loadBuilder(): Promise<BuilderHost> {
  once ??= fetch(new URL("../sim/builder.wasm", import.meta.url))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`builder.wasm: ${r.status}`))))
    .then((b) => WebAssembly.compile(b))
    .then(makeBuilderHost)
    .catch((e: unknown) => {
      once = null;
      throw e instanceof Error ? e : new Error(String(e));
    });
  return once;
}
