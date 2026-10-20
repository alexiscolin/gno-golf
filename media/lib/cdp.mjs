// @ts-check
// Chrome over the DevTools protocol, for the media scripts (camera/*.mjs,
// promo/render.mjs): one headless Chrome with a profile of its own, niced,
// its port read from the profile (DevToolsActivePort: no clash with another
// Chrome), killed by PID. Node 22+ (the built-in WebSocket).
//
// The paths and addresses can be set from the environment: CHROME (the
// binary), CHROME_ARGS (more flags, each starting --; a value may hold spaces), APP (the running
// client), RPC (the local chain), REALM (the golf realm on it; else
// NEXT_PUBLIC_REALM, the client's).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const APP = process.env.APP || "http://localhost:3300";
export const RPC = process.env.RPC || "http://127.0.0.1:26657";
export const REALM = process.env.REALM || process.env.NEXT_PUBLIC_REALM || "gno.land/r/gnogolf/golf";
export const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

// The course's holes are data in slots now ("garden/17"): a hole the scripts
// name as its old realm ("hole19", "town1") is its slot, from data/holes.txt
// (lines "<slot> <pkgpath> <sha8> <hex>"). A slot or a version id is kept.
/** @type {Record<string, string> | null} */
let slots = null;
/** @param {string} name */
export function slotOf(name) {
  if (name.includes("/")) return name;
  const s = (slots ||= Object.fromEntries(fs.readFileSync(new URL("../../data/holes.txt", import.meta.url), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")).map(([slot, pkg]) => [pkg.split("/").pop(), slot])));
  if (!s[name]) throw new Error(`no slot for ${name} in data/holes.txt`);
  return s[name];
}

// Every Chrome this process started dies with it: at a normal exit, on
// Ctrl-C or a kill, on an uncaught error, and after CDP_MAX_MS (default an
// hour) should a run hang. A Chrome left running keeps a game page playing.
const live = new Set();
// Chrome runs in its own process group (detached), so a kill takes its helpers too
const stop = (pid) => { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch {} } };
const killAll = () => { for (const pid of live) stop(pid); live.clear(); };
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => (killAll(), process.exit(130)));
process.on("uncaughtException", (e) => (console.error(e), killAll(), process.exit(1)));
process.on("unhandledRejection", (e) => (console.error(e), killAll(), process.exit(1)));
setTimeout(() => (console.error("cdp: run over CDP_MAX_MS, Chrome killed"), killAll(), process.exit(2)), Number(process.env.CDP_MAX_MS || 3600e3)).unref();

/**
 * A headless Chrome on about:blank, the page's viewport set: { send(method,
 * params), ev(expr) (its value, undefined if it threw), js(expr) (throws), on(method, fn) (an event's params, one listener each),
 * errors (the page's exceptions and console errors), kill() }.
 * dir: its profile (a fresh one by default); args: more Chrome flags.
 * @param {{ width?: number, height?: number, mobile?: boolean, touch?: boolean, dir?: string, args?: string[] }} [opts]
 */
export async function launch({ width = 1100, height = 700, mobile = false, touch = false, dir = "", args = [] } = {}) {
  dir ||= fs.mkdtempSync(path.join(os.tmpdir(), "gnogolf-cdp-"));
  fs.mkdirSync(dir, { recursive: true });
  try { fs.unlinkSync(path.join(dir, "DevToolsActivePort")); } catch {}
  const p = spawn("nice", ["-n", "20", CHROME, "--headless=new", `--user-data-dir=${dir}`, "--remote-debugging-port=0", "--use-angle=metal", "--no-first-run", "--mute-audio", ...args, ...(process.env.CHROME_ARGS || "").split(/ +(?=--)/).filter(Boolean), "about:blank"], { stdio: "ignore", detached: true });
  const pid = /** @type {number} */ (p.pid);
  live.add(pid);
  const kill = () => { stop(pid); live.delete(pid); };
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(200);
    try { port = fs.readFileSync(path.join(dir, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {}
  }
  if (!port) throw (kill(), new Error("Chrome did not start"));
  /** @type {{ type: string, webSocketDebuggerUrl: string }[]} */
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(/** @type {{ webSocketDebuggerUrl: string }} */ (list.find((t) => t.type === "page")).webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  /** @type {Map<number, [(v: any) => void, (e: Error) => void]>} */
  const wait = new Map();
  /** @type {string[]} */
  const errors = [];
  /** @type {Map<string, (params: any) => void>} */
  const heard = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method) heard.get(d.method)?.(d.params);
    const w = d.id && wait.get(d.id);
    if (w) (d.error ? w[1](new Error(d.error.message)) : w[0](d.result), wait.delete(d.id));
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description?.slice(0, 160) || d.params.exceptionDetails.text);
    // (the dev build's own "LOOKS…" notes are not errors)
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error" && !/^LOOKS/.test(String(d.params.args[0] && d.params.args[0].value)))
      errors.push(d.params.args.map((/** @type {{ value?: unknown, description?: string }} */ a) => a.value || a.description).join(" ").slice(0, 160));
  };
  /** @type {(method: string, params?: object) => Promise<any>} */
  const send = (method, params = {}) => new Promise((r, j) => (wait.set(++id, [r, j]), ws.send(JSON.stringify({ id, method, params }))));
  /** @type {(expr: string) => Promise<any>} */
  const js = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  /** @type {(expr: string) => Promise<any>} */
  const ev = (expr) => js(expr).catch(() => undefined);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
  if (touch) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  /** @type {(method: string, fn: (params: any) => void) => void} */
  const on = (method, fn) => void heard.set(method, fn);
  return { send, ev, js, on, errors, kill: () => { try { ws.close(); } catch {} kill(); } };
}

/**
 * Offline in the page, as a deploy that took the old files or a lost network would be: every script not loaded yet
 * fails (a chunk a dev build names and a production build hashes, alike). now: from this moment, the scripts loaded
 * so far still running; else from the next page loaded. back(): online again.
 * @param {{ js: (expr: string) => Promise<any>, send: (method: string, params?: object) => Promise<any> }} b
 */
export async function offline(b, now = true) {
  const source = `(() => { const seen = new Set(${now ? 'performance.getEntriesByType("resource").map((e) => e.name)' : "[]"}); window.__offline = true;
    const off = (n) => window.__offline && n && n.tagName === "SCRIPT" && n.src && !seen.has(n.src) && (n.src = location.origin + "/__offline__.js");
    for (const k of ["appendChild", "insertBefore"]) { const f = Node.prototype[k]; Node.prototype[k] = function (n, ...r) { off(n); return f.call(this, n, ...r); }; }
    return true; })()`;
  if (now) await b.js(source);
  else await b.send("Page.addScriptToEvaluateOnNewDocument", { source });
  return { back: () => b.js("window.__offline = false") };
}

/** Waits until the local chain answers (it restarts on hot reloads): up to tries × 5 s. */
export async function chainUp(tries = 120) {
  const hex = Buffer.from(`${REALM}.Period()`).toString("hex");
  for (let i = 0; i < tries; i++) {
    try {
      const r = await (await fetch(`${RPC}/abci_query?path=%22vm/qeval%22&data=0x${hex}`, { signal: AbortSignal.timeout(4000) })).json();
      if (r.result && r.result.response && !r.result.response.ResponseBase.Error) return true;
    } catch {}
    await sleep(5000);
  }
  return false;
}
