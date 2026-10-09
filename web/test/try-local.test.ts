// scripts/try-local.sh's commands on a playground running, in a copy of the
// script beside a stand-in node (its /status) and gnokey (what the realm
// says): "rebuild" keeps the build served and the new one alone, its numbers
// only growing; "all" says which waves opened and fails on a refusal other
// than "already in a wave"; "close" writes the date in seed.env; and no
// command goes on when the chain does not answer.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "../..");
const NOW = 1_800_000_000;
const made: string[] = [];
after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

/** A copy of the scripts (try-local.sh and the helpers it sources) and the catalogue in a folder of its own, a playground "running" from it. */
function playground(rpc: string, gnokeySays: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "try-local-")), work = path.join(dir, "cache/gnogolf-try-local/run.x");
  made.push(dir);
  for (const f of ["scripts/try-local.sh", "scripts/lib/e2e.sh", "data/gnomes.json"]) fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true }), fs.copyFileSync(path.join(repo, f), path.join(dir, f));
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(dir, "cache/gnogolf-try-local/last"), work);
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  // gnokey: logs its call, then answers as the realm would (the script below, from the call's args)
  fs.writeFileSync(path.join(bin, "gnokey"), `#!/bin/bash\ncat >/dev/null\necho "$*" >>"${dir}/calls"\n${gnokeySays}\n`, { mode: 0o755 });
  // npm run build: a site whose page says which build it is
  fs.writeFileSync(path.join(bin, "npm"), `#!/bin/bash\nn=$(( $(cat "${dir}/builds" 2>/dev/null || echo 0) + 1 )); echo $n >"${dir}/builds"\nrm -rf out && mkdir out && echo "build $n" >out/index.html\n`, { mode: 0o755 });
  fs.mkdirSync(path.join(dir, "web"));
  fs.writeFileSync(path.join(work, "seed.env"), `RPC=${rpc}\nCHAINID=test\nGNOMES=gno.land/r/x/gnomes\nGOLF=gno.land/r/x/golf\nKH=${dir}/keys\nPASS=p\nGNOKEY=${bin}/gnokey\nWORK=${work}\nCLOSE_AT=0\n`);
  fs.writeFileSync(path.join(work, "site.env"), "WALLET_RPC=http://127.0.0.1:1\nWEB_URL=http://127.0.0.1:2\n");
  // (not spawnSync: the stand-in node answers from this process's own loop)
  const run = (...args: string[]) =>
    new Promise<{ code: number | null; out: string }>((done) => {
      const c = spawn("bash", [path.join(dir, "scripts/try-local.sh"), ...args], { env: { ...process.env, XDG_CACHE_HOME: path.join(dir, "cache"), PATH: `${bin}:${process.env.PATH}` } });
      let out = "";
      c.stdout.on("data", (b: Buffer) => (out += String(b)));
      c.stderr.on("data", (b: Buffer) => (out += String(b)));
      c.on("close", (code) => done({ code, out }));
    });
  return { dir, work, run, calls: () => (fs.existsSync(path.join(dir, "calls")) ? fs.readFileSync(path.join(dir, "calls"), "utf8") : "") };
}
const node = async () => {
  const s = http.createServer((_, res) => res.end(JSON.stringify({ result: { sync_info: { latest_block_time: new Date(NOW * 1000).toISOString() } } })));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { s, rpc: `http://127.0.0.1:${(s.address() as { port: number }).port}` };
};

void test("try-local rebuild: the build served and the new one kept, nothing else, the numbers only growing; a folder site refused", async () => {
  const { s, rpc } = await node();
  try {
    const p = playground(rpc, 'echo "OK!"');
    // a gap and leftovers: site.1 and site.3 lying there, site.5 served
    for (const n of [1, 3, 5]) fs.mkdirSync(path.join(p.work, `site.${n}`));
    fs.symlinkSync("site.5", path.join(p.work, "site"));
    for (let i = 0; i < 3; i++) assert.equal((await p.run("rebuild")).code, 0);
    const left = fs.readdirSync(p.work).filter((f) => f.startsWith("site.") && f !== "site.env").sort();
    assert.deepEqual(left, ["site.7", "site.8"]);
    assert.equal(fs.readlinkSync(path.join(p.work, "site")), "site.8");
    assert.equal(fs.readFileSync(path.join(p.work, "site/index.html"), "utf8").trim(), "build 3");
    // a site that is a folder (a playground from before the link): refused, the folder as it was
    const old = playground(rpc, 'echo "OK!"');
    fs.mkdirSync(path.join(old.work, "site"));
    fs.writeFileSync(path.join(old.work, "site/index.html"), "old");
    const r = await old.run("rebuild");
    assert.notEqual(r.code, 0);
    assert.match(r.out, /restart/);
    assert.equal(fs.readFileSync(path.join(old.work, "site/index.html"), "utf8"), "old");
  } finally {
    s.close();
  }
});

void test("try-local all: says each wave opened, keeps quiet on those open already, fails on any other refusal", async () => {
  const { s, rpc } = await node();
  try {
    // the realm: wave 1 open already, wave 4 refused for another reason, the rest opened
    const says = `case "$*" in *"-args 1 "*) echo 'Error: "gnomes: ids 1 to 104 are in a wave already"';; *"-args 312 "*) echo 'Error: "gnomes: at most 64 waves"';; *) echo "OK!";; esac`;
    const p = playground(rpc, says);
    const r = await p.run("all");
    assert.notEqual(r.code, 0, r.out);
    assert.match(r.out, /wave 2 \(105-208\) on sale/);
    assert.match(r.out, /wave 7 \(619-720\) on sale/);
    assert.match(r.out, /wave 4.*at most 64 waves/);
    assert.doesNotMatch(r.out, /in a wave already/);
    assert.equal(p.calls().split("\n").filter((l) => l.includes("AddWave")).length, 7);
    assert.match(p.calls(), new RegExp(`-args 105 -args 208 -args ${NOW} -args 48`));
    // all open already: nothing to do, no failure
    const q = playground(rpc, `echo 'Error: "gnomes: ids 1 to 104 are in a wave already"'`);
    const all = await q.run("all");
    assert.equal(all.code, 0, all.out);
  } finally {
    s.close();
  }
});

void test("try-local close: the date set on the chain and in seed.env; no command goes on when the chain does not answer", async () => {
  const { s, rpc } = await node();
  const p = playground(rpc, 'echo "OK!"');
  try {
    assert.equal((await p.run("close", "10")).code, 0);
    assert.match(p.calls(), new RegExp(`SetCloseAt -args ${NOW + 10 * 86400}`));
    assert.match(fs.readFileSync(path.join(p.work, "seed.env"), "utf8"), new RegExp(`^CLOSE_AT=${NOW + 10 * 86400}$`, "m"));
    assert.equal(fs.readFileSync(path.join(p.work, "seed.env"), "utf8").match(/^CLOSE_AT=/gm)!.length, 1);
  } finally {
    s.close();
  }
  for (const cmd of [["close", "10"], ["wave2"], ["all"]]) {
    const r = await p.run(...cmd);
    assert.notEqual(r.code, 0, cmd.join(" "));
    assert.match(r.out, /chain/i, cmd.join(" "));
  }
  assert.doesNotMatch(p.calls(), /AddWave/, "nothing sent once the chain is gone");
});
