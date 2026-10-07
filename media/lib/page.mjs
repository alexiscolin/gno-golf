// @ts-check
// A page of the game's own code in headless Chrome, for the media scripts
// that draw with it (builder/tiles.mjs, gnomes/render.mjs,
// gnomes/portrait/extract.mjs): the code bundled with a pinned esbuild (no
// dependency added), the dice seeded, the pictures taken as WebP under a size.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launch, sleep } from "./cdp.mjs";

/** An entry's first lines: Math.random seeded, so a picture made twice is the same; `seed = 7` throws the same dice again. */
export const SEEDED = `let seed = 7;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);`;

/**
 * Chrome (launch's options) on about:blank with entry run in it, which sets
 * window.ready: bundled by esbuild 0.24.2 from stdin, so its imports resolve
 * from cwd, defines its --define flags (name → code). motion: the page told
 * the viewer wants motion (headless Chrome asks for less: the game would draw
 * no trail).
 * @param {string} entry
 * @param {{ cwd: string, name: string, define?: Record<string, string>, motion?: boolean, width?: number, height?: number }} o
 */
export async function bundledPage(entry, { cwd, name, define = {}, motion = false, ...opts }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gnogolf-page-")), bundle = path.join(tmp, name);
  execFileSync("npx", ["--yes", "esbuild@0.24.2", "--bundle", "--format=iife", `--sourcefile=${name}`, `--outfile=${bundle}`, "--log-level=warning",
    ...Object.entries(define).map(([k, v]) => `--define:${k}=${v}`)], { input: entry, stdio: ["pipe", "inherit", "inherit"], cwd });
  const b = await launch(opts);
  if (motion) await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await b.send("Page.navigate", { url: "about:blank" });
  await sleep(300);
  await b.js(fs.readFileSync(bundle, "utf8") + ";1");
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!(await b.ev("window.ready"))) throw (b.kill(), new Error(`the page did not start: ${b.errors.slice(0, 3)}`));
  return b;
}

/**
 * A WebP at the best quality that keeps under max bytes: from q down by 0.06
 * to 0.3, the last one taken when none fits. shot(q) is the page's data URL
 * at that quality (q with two decimals).
 * @param {(q: string) => Promise<string>} shot @param {number} max @param {number} q
 */
export async function webpUnder(shot, max, q) {
  let out = Buffer.alloc(0);
  for (; q >= 0.3; q -= 0.06) {
    out = Buffer.from((await shot(q.toFixed(2))).split(",")[1], "base64");
    if (out.length <= max) break;
  }
  return out;
}

/**
 * A contact sheet: html (its style and figures) laid out at width × height
 * in b's page, as a JPEG.
 * @param {Awaited<ReturnType<typeof launch>>} b @param {string} html @param {number} width @param {number} height @param {number} quality
 */
export async function sheet(b, html, width, height, quality) {
  const { frameTree } = await b.send("Page.getFrameTree");
  await b.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
  await sleep(450);
  return Buffer.from((await b.send("Page.captureScreenshot", { format: "jpeg", quality })).data, "base64");
}
