// @ts-check
// A stand-in for Adena in the repo's headless Chrome (media/lib/cdp.mjs), for
// trying the shop on a local chain: the page gets a window.adena answering
// what web/lib/adena.ts asks (AddEstablish, GetAccount, GetNetwork,
// SwitchNetwork, AddNetwork, DoContract, On), and every DoContract is signed
// here, in Node, by gnokey with one of the seed's throwaway keys (scripts/
// e2e-gnomes.sh SEED=1, its seed.env), on that chain alone. It answers as
// Adena does: success with the hash and height, or a failure with the
// chain's own words where adena.ts's refusal() finds them, a cancel (4000),
// or a failure that says nothing went (as a timeout: "maybe").
// No event API is needed: the page queues each call, polled here.
import { execFile } from "node:child_process";
import fs from "node:fs";

/** seed.env as an object; PAGE_RPC (env) is the same node as the page's wallet names it (scripts/try-local.sh: its raw TCP port on the tailnet, NEXT_PUBLIC_WALLET_RPC), RPC by default. @param {string} file */
export function seedEnv(file) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(env.RPC || "")) throw new Error(`seed.env's RPC is not this machine's: ${env.RPC}`);
  env.PAGE_RPC = process.env.PAGE_RPC || env.RPC; // (the network the stand-in says it is on; it signs on RPC)
  return env;
}

/** gnokey's run, its output whatever it says. @param {string} bin @param {string[]} args @param {string} input */
const run = (bin, args, input) => new Promise((resolve) => {
  const p = execFile(bin, args, { maxBuffer: 1 << 24, timeout: 120e3 }, (_, out, err) => resolve(String(out) + String(err)));
  p.stdin?.end(input + "\n");
});

/**
 * Puts the stand-in on the page b (from launch()) for key (a name of seed.env's keybase), before any
 * page loads. Returns { address, next(mode), pump(), signed }: next("cancel" | "maybe") makes the next
 * DoContract answer so; pump() answers what the page asked since (call it while the page waits).
 * @param {{ send: (m: string, p?: object) => Promise<any>, ev: (e: string) => Promise<any>, js: (e: string) => Promise<any> }} b
 * @param {Record<string, string>} env @param {string} key
 */
export async function fakeAdena(b, env, key) {
  const address = env[key];
  if (!/^g1[0-9a-z]{38}$/.test(address || "")) throw new Error(`no address for ${key} in seed.env`);
  const page = `(() => {
    const q = (window.__adenaQueue = []), wait = {}; let n = 0;
    window.__adenaReply = (id, res) => { const f = wait[id]; delete wait[id]; f && f(res); };
    const ok = (data) => Promise.resolve({ status: "success", data });
    window.adena = {
      AddEstablish: () => ok(), GetAccount: () => ok({ address: ${JSON.stringify(address)}, chainId: ${JSON.stringify(env.CHAINID)} }),
      GetNetwork: () => ok({ chainId: ${JSON.stringify(env.CHAINID)}, rpcUrl: ${JSON.stringify(env.PAGE_RPC)} }),
      SwitchNetwork: () => ok(), AddNetwork: () => ok(),
      DoContract: (tx) => new Promise((r) => { const id = ++n; wait[id] = r; q.push({ id, tx }); }),
      On: () => {},
    };
  })();`;
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: page });
  /** @type {string} */
  let mode = "";
  /** @type {{ func: string, args: string[], send: string, ok: boolean, said: string }[]} */
  const signed = [];
  /** One call signed by gnokey: Adena's answer. @param {any} tx */
  async function sign(tx) {
    if (mode === "cancel") return (mode = ""), { status: "failure", code: 4000, type: "TRANSACTION_REJECTED", message: "User rejected" };
    if (mode === "maybe") return (mode = ""), { status: "failure", code: 0, message: "Timed out waiting for the network" };
    if (!tx || tx.messages?.length !== 1 || tx.messages[0].type !== "/vm.m_call") return { status: "failure", code: 0, message: "the stand-in signs one /vm.m_call at a time" };
    const v = tx.messages[0].value;
    const args = ["maketx", "call", "-home", env.KH, "-pkgpath", v.pkg_path, "-func", v.func, ...v.args.flatMap((/** @type {string} */ a) => ["-args", a]),
      ...(v.send ? ["-send", v.send] : []), "-gas-fee", `${tx.gasFee}ugnot`, "-gas-wanted", String(tx.gasWanted), "-max-deposit", "100000000ugnot",
      "-remote", env.RPC.replace(/^http:\/\//, ""), "-chainid", env.CHAINID, "-broadcast", "-insecure-password-stdin", key];
    const out = String(await run(env.GNOKEY, args, env.PASS));
    const ok = /^OK!/m.test(out), said = (/(gnomes: [^"\n]*)/.exec(out) || [])[1] || (ok ? "" : out.trim().split("\n").slice(-3).join(" ").slice(0, 300));
    signed.push({ func: v.func, args: v.args, send: v.send, ok, said });
    if (!ok) return { status: "failure", code: 0, data: { error: { message: said } } };
    return { status: "success", data: { hash: (/TX HASH:\s*(\S+)/.exec(out) || [])[1] || "", height: Number((/HEIGHT:\s*(\d+)/.exec(out) || [])[1] || 0) } };
  }
  return {
    address,
    signed,
    /** @param {"cancel" | "maybe"} m */
    next: (m) => void (mode = m),
    /** Answers every call the page queued since. */
    async pump() {
      const asked = (await b.ev("window.__adenaQueue ? window.__adenaQueue.splice(0) : []")) || [];
      for (const { id, tx } of asked) await b.js(`window.__adenaReply(${Number(id)}, ${JSON.stringify(await sign(tx))})`);
      return asked.length;
    },
  };
}
