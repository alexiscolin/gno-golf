// Loaded before every unit test (npm test): the client's modules import each
// other without an extension, as the bundler takes them, so ".ts" is tried,
// and by the "@/" alias;
// and the browser storage they touch is an in-memory stand-in.
import { register } from "node:module";

// "@/…" is the client's alias for web/ (tsconfig paths), which Node doesn't read
const web = new URL("../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        if (s.startsWith("@/")) s = ${JSON.stringify(web)} + s.slice(2) + (/\\.[cm]?[jt]sx?$/.test(s) ? "" : ".ts");
        try { return await next(s, c); } catch (e) {
          if (/^\\.\\.?\\//.test(s) && !/\\.[cm]?[jt]sx?$|\\.json$/.test(s)) return next(s + ".ts", c);
          throw e;
        }
      }`,
    ),
);

class MemoryStorage {
  #m = new Map();
  get length() { return this.#m.size; }
  key(i) { return [...this.#m.keys()][i] ?? null; }
  getItem(k) { return this.#m.has(k) ? this.#m.get(k) : null; }
  setItem(k, v) { this.#m.set(k, String(v)); }
  removeItem(k) { this.#m.delete(k); }
  clear() { this.#m.clear(); }
}
globalThis.localStorage ??= new MemoryStorage();
globalThis.sessionStorage ??= new MemoryStorage();
