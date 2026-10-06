// Whether a wasm build's sources are the realm's: the .gno files it was
// built from (its sources(): path → sha-256), read back from the chain
// (vm/qfile) through stage.sh's prefix, hashed and compared; once a browser
// (a package on the chain never changes). golf.wasm's previews (lib/sim.ts)
// and builder.wasm's checks before a publish (the Builder) both ask it.
import type { Chain } from "../chain";

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const digest = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

/** Whether src (path → sha-256) is what the realm runs; tag: the build's own key in this browser ("sim", "builder"). */
export async function sameSources(chain: Pick<Chain, "file" | "realm">, src: Record<string, string>, tag: string): Promise<boolean> {
  const key = `gnogolf.${tag}|${chain.realm}|${await digest(JSON.stringify(src))}`;
  try {
    if (localStorage.getItem(key) === "ok") return true;
  } catch {}
  // stage.sh's prefix: the repo's gno.land/[pr]/gnogolf/ is the realm's
  // gno.land/[pr]/<ns>/gnogolf/ (none on a local chain), and golf/v2 (the
  // rules the wasm was built from: scripts/wasm.sh) is the realm
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
