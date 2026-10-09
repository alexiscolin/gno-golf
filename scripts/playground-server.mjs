// @ts-check
// The playground's site (scripts/try-local.sh): the static build (web/out)
// served on 127.0.0.1 alone, and the page's own /rpc streamed to the local
// node, so a device on the tailnet reads the chain on the page's origin (no
// CORS, no second host). A production build: no dev server's on-demand
// compiles, hot reloads nor its client's reloads over a proxied link.
//
//   node scripts/playground-server.mjs <out dir> <port> <rpc: http://127.0.0.1:<port>>
//
// Only what the static host would serve: a file under the root (no dotfile,
// nothing a link leads out of it to), a folder's index.html, the build's
// 404.html; GET and HEAD. /rpc/* goes to the node as /* (any method: the
// node's JSON-RPC is POST), and to a node on this machine only.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".xml": "application/xml",
};
/** The node this may stream to: http on this machine, a port. */
export const LOCAL_RPC = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;

/**
 * The server, not yet listening: root the static build, rpc the node.
 * @param {{ root: string, rpc: string }} o
 */
export function playgroundServer({ root, rpc }) {
  if (!LOCAL_RPC.test(rpc)) throw new Error(`the node is on this machine, http://127.0.0.1:<port>, not "${rpc}"`);
  const node = new URL(rpc).origin;
  if (!fs.statSync(fs.realpathSync(root)).isDirectory()) throw new Error(`the build is a folder, not "${root}"`); // (missing: realpath's own error, naming it)
  /** The file a path names under the root, or null: the root resolved anew each time (a link try-local.sh rebuild swaps
   *  to a new build in one rename: every request is the old build's or the new one's, whole). @param {string} p */
  const fileOf = (p) => {
    // (no dotfile, no "..", nor a path a redirect would read as another host: "//host", a backslash)
    if (p.startsWith("//") || p.includes("\\") || p.split("/").some((s) => s.startsWith("."))) return null;
    const base = fs.realpathSync(root);
    for (const f of [p, path.join(p, "index.html"), `${p}.html`]) {
      let real;
      try { real = fs.realpathSync(path.join(base, f)); } catch { continue; }
      if ((real === base || real.startsWith(base + path.sep)) && fs.statSync(real).isFile()) return real;
    }
    return null;
  };
  /** @param {http.ServerResponse} res @param {string} file @param {number} status @param {boolean} head */
  const send = (res, file, status, head) => {
    const ext = path.extname(file);
    res.writeHead(status, {
      "content-type": TYPES[/** @type {keyof typeof TYPES} */ (ext)] || "application/octet-stream",
      "content-length": fs.statSync(file).size,
      // the build's hashed files kept; a page read anew (a new build behind the same link)
      "cache-control": file.includes(`${path.sep}_next${path.sep}static${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    });
    if (head) res.end();
    else fs.createReadStream(file).pipe(res);
  };
  return http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://playground");
    if (url.pathname === "/rpc" || url.pathname.startsWith("/rpc/")) {
      // the node's origin and the path after it, never a reference resolved against it ("//host/" would name another host)
      const to = new URL(node + url.pathname.slice(4) + url.search);
      if (to.origin !== node) return void res.writeHead(400).end();
      const up = http.request(to, { method: req.method, headers: { "content-type": req.headers["content-type"] || "application/json" } }, (r) => {
        res.writeHead(r.statusCode || 502, { "content-type": r.headers["content-type"] || "application/json" });
        r.pipe(res);
      });
      up.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end("the node did not answer")));
      req.pipe(up);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") return void res.writeHead(405, { allow: "GET, HEAD" }).end();
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { return void res.writeHead(400).end(); }
    // a folder's page is its slash's (trailingSlash, as the static host serves it)
    if (!p.endsWith("/") && !path.extname(p) && fileOf(p + "/")) return void res.writeHead(308, { location: p + "/" + url.search }).end();
    const page = fileOf(p);
    if (page) return send(res, page, 200, req.method === "HEAD");
    const missing = fileOf("/404.html");
    return missing ? send(res, missing, 404, req.method === "HEAD") : void res.writeHead(404).end();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [root, port, rpc] = process.argv.slice(2);
  if (!root || !/^\d{1,5}$/.test(port || "") || !rpc) throw new Error("usage: playground-server.mjs <out dir> <port> <rpc>");
  playgroundServer({ root, rpc }).listen(Number(port), "127.0.0.1", () => console.log(`playground: ${root} on http://127.0.0.1:${port}, /rpc to ${rpc}`));
}
