// next.config.mjs: the site's build has nothing of scripts/try-local.sh's
// playground. No rewrite and no dev origins in any build (the playground's
// /rpc is its own server's, scripts/playground-server.mjs), and Netlify's
// production build refuses the playground's variables outright.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const CONFIG = new URL("../next.config.mjs", import.meta.url).href;
/** The config as next.config.mjs exports it under env, or the error it throws. */
function load(env: Record<string, string>) {
  try {
    return { config: JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `const c = (await import(${JSON.stringify(CONFIG)})).default; console.log(JSON.stringify({ keys: Object.keys(c) }))`], { env: { PATH: process.env.PATH || "", ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as { keys: string[] }, error: "" };
  } catch (e) {
    return { config: null, error: String((e as { stderr?: string }).stderr || e) };
  }
}
const SITE = {
  CONTEXT: "production", NEXT_PUBLIC_REALM: "gno.land/r/gnogolf/golf/v2", NEXT_PUBLIC_RPC: "https://rpc.gno.land", NEXT_PUBLIC_WEB: "https://gno.land", NEXT_PUBLIC_NETWORK: "mainnet",
};
const PLAYGROUND = { NEXT_PUBLIC_GNOMES: "1", NEXT_PUBLIC_BUILDER: "1", NEXT_PUBLIC_COMMUNITY: "1", NEXT_PUBLIC_RPC: "/rpc", NEXT_PUBLIC_PLAYGROUND: "1", NEXT_PUBLIC_WALLET_RPC: "http://100.104.210.102:5182", NEXT_PUBLIC_TEST_HOOKS: "1" };

void test("no build of the site has a rewrite or dev origins, flags on, the playground's variables set or not", () => {
  for (const env of [{}, PLAYGROUND]) {
    const { config, error } = load(env);
    assert.ok(config, error);
    assert.deepEqual(config.keys.filter((k) => /rewrites|redirects|headers|allowedDevOrigins|skipTrailingSlashRedirect/.test(k)), []);
  }
});

void test("Netlify's production build refuses the playground's variables", () => {
  assert.ok(load(SITE).config, "the site's own settings build");
  for (const k of ["NEXT_PUBLIC_PLAYGROUND", "NEXT_PUBLIC_WALLET_RPC", "NEXT_PUBLIC_TEST_HOOKS"]) {
    const { config, error } = load({ ...SITE, [k]: "1" });
    assert.equal(config, null, k);
    assert.match(error, new RegExp(`no ${k}`));
  }
});

void test("every variable the production build asks for or refuses is in netlify.toml, which its error names", () => {
  const { error } = load({ ...SITE, NEXT_PUBLIC_REALM: "", NEXT_PUBLIC_GNOMES: "1", NEXT_PUBLIC_PLAYGROUND: "1", NEXT_PUBLIC_WALLET_RPC: "1", NEXT_PUBLIC_TEST_HOOKS: "1" });
  assert.match(error, /see netlify\.toml/);
  const named = [...new Set(error.match(/NEXT_PUBLIC_[A-Z_]+/g))];
  assert.ok(named.length >= 11, error);
  const toml = fs.readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const header = toml.slice(0, toml.indexOf("[build]"));
  assert.deepEqual(named.filter((k) => !new RegExp(`\\b${k}\\b`).test(header)), []);
});
