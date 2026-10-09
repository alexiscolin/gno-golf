// scripts/playground-server.mjs: the playground's static build and its /rpc,
// as the static host serves the site, and nothing more: a folder's page at
// its slash, the build's 404, no file outside the build (dotfiles, "..", a
// link leading out), and /rpc to a node on this machine only.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

type Server = http.Server;
const { playgroundServer } = (await import("../../scripts/playground-server.mjs")) as { playgroundServer: (o: { root: string; rpc: string }) => Server };

const listen = (s: Server) => new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as { port: number }).port)));
/** A request sent with its path as written (fetch would normalize it). */
const raw = (port: number, p: string) => new Promise<{ status: number; body: string; location: string }>((ok, ko) => {
  http.get({ host: "127.0.0.1", port, path: p }, (r) => {
    let b = "";
    r.on("data", (c: Buffer) => (b += String(c)));
    r.on("end", () => ok({ status: r.statusCode || 0, body: b, location: r.headers.location || "" }));
  }).on("error", ko);
});
const get = async (port: number, p: string, init: RequestInit = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { redirect: "manual", ...init });
  return { status: r.status, type: r.headers.get("content-type") || "", location: r.headers.get("location") || "", body: await r.text() };
};

void test("the playground serves the build as the static host does, and /rpc from the node on this machine", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "playground-")), out = path.join(dir, "out");
  for (const [f, body] of [["index.html", "home"], ["g/index.html", "gallery"], ["404.html", "missing"], ["_next/static/a.js", "js"], ["golf.wasm", "wasm"], [".secret", "no"]] as const) {
    fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    fs.writeFileSync(path.join(out, f), body);
  }
  fs.writeFileSync(path.join(dir, "outside.txt"), "no");
  fs.symlinkSync(path.join(dir, "outside.txt"), path.join(out, "link.txt"));
  // the node: says what it was asked
  const node = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c: Buffer) => (b += String(c)));
    req.on("end", () => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ node: true, method: req.method, url: req.url, body: b })));
  });
  const nodePort = await listen(node);
  // another server on this machine, which /rpc must never reach
  const other = http.createServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end('{"node":false}'));
  const otherPort = await listen(other);
  const site = playgroundServer({ root: out, rpc: `http://127.0.0.1:${nodePort}` });
  const port = await listen(site);
  try {
    assert.equal((await get(port, "/")).body, "home");
    assert.deepEqual(await get(port, "/g").then((r) => [r.status, r.location]), [308, "/g/"]);
    // an escaped leading slash names no host: a folder's redirect stays on this site
    for (const p of ["/%2Fg", "/%2F%2Fg", "/%5Cg"]) {
      const r = await raw(port, p);
      assert.ok(r.status === 404 || (r.status === 308 && /^\/[^/\\]/.test(r.location)), `${p}: ${r.status} ${r.location}`);
    }
    assert.equal((await get(port, "/g/")).body, "gallery");
    assert.match((await get(port, "/_next/static/a.js")).type, /^text\/javascript/);
    assert.equal((await get(port, "/golf.wasm")).type, "application/wasm");
    for (const p of ["/nowhere/", "/.secret", "/../outside.txt", "/%2e%2e/outside.txt", "/link.txt"]) assert.deepEqual(await get(port, p).then((r) => [r.status, r.body]), [404, "missing"], p);
    assert.equal((await get(port, "/", { method: "POST" })).status, 405);
    assert.deepEqual(JSON.parse((await get(port, "/rpc/status?x=1")).body), { node: true, method: "GET", url: "/status?x=1", body: "" });
    assert.deepEqual(JSON.parse((await get(port, "/rpc/", { method: "POST", body: '{"id":1}', headers: { "content-type": "application/json" } })).body), { node: true, method: "POST", url: "/", body: '{"id":1}' });
    // a path that would name another host (protocol-relative, a backslash, escaped): still this node, never another
    for (const p of ["//127.0.0.1:%d/x", "/\\127.0.0.1:%d/x", "/%2F%2F127.0.0.1:%d/x"].map((p) => p.replace("%d", String(otherPort)))) {
      const r = await raw(port, "/rpc" + p);
      assert.equal(r.status, 200, p);
      assert.equal((JSON.parse(r.body) as { node: boolean }).node, true, p);
    }
  } finally {
    site.close();
    node.close();
    other.close();
  }
  // the root a link swapped to a new build (try-local.sh rebuild): the next request is the new build's
  const v1 = path.join(dir, "site.1"), v2 = path.join(dir, "site.2"), link = path.join(dir, "site");
  for (const [d, body] of [[v1, "old"], [v2, "new"]] as const) (fs.mkdirSync(d), fs.writeFileSync(path.join(d, "index.html"), body));
  fs.symlinkSync("site.1", link);
  const swapped = playgroundServer({ root: link, rpc: `http://127.0.0.1:${nodePort}` }), sp = await listen(swapped);
  try {
    assert.equal((await get(sp, "/")).body, "old");
    fs.symlinkSync("site.2", link + ".next");
    fs.renameSync(link + ".next", link);
    assert.equal((await get(sp, "/")).body, "new");
  } finally {
    swapped.close();
  }
  // a root that is not there, or not a folder: refused at once, not a 404 on every request
  assert.throws(() => playgroundServer({ root: path.join(dir, "nowhere"), rpc: `http://127.0.0.1:${nodePort}` }), /nowhere/);
  assert.throws(() => playgroundServer({ root: path.join(dir, "outside.txt"), rpc: `http://127.0.0.1:${nodePort}` }), /folder/);
  assert.throws(() => playgroundServer({ root: out, rpc: "http://100.104.210.102:26657" }), /127\.0\.0\.1/);
  assert.throws(() => playgroundServer({ root: out, rpc: "http://127.0.0.1.example:80" }), /127\.0\.0\.1/);
});
