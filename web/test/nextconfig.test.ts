// next.config.mjs: scripts/try-local.sh's playground (the page's /rpc proxied to
// a node on this machine, the dev server's scripts served to the tailnet's
// hosts) is a dev server's alone. No build has it, whatever its environment
// says: not with the shop, the Builder and the community holes on, not with
// the playground's own variables set by mistake.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHASE_DEVELOPMENT_SERVER, PHASE_EXPORT, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants.js";

type Config = { rewrites?: () => Promise<{ source: string; destination: string }[]>; allowedDevOrigins?: string[]; skipTrailingSlashRedirect?: boolean };
const { default: config, playground } = (await import("../next.config.mjs")) as { default: (phase: string) => Config; playground: (phase: string, env: Record<string, string>) => Config };
const ON = { NEXT_PUBLIC_GNOMES: "1", NEXT_PUBLIC_BUILDER: "1", NEXT_PUBLIC_COMMUNITY: "1" };
const PLAYGROUND = { GNOGOLF_PLAYGROUND: "1", PLAYGROUND_RPC: "http://127.0.0.1:26667", PLAYGROUND_ORIGINS: "mac-studio.tail8cf12f.ts.net,100.104.210.102" };

void test("no build has the playground: no rewrite, no dev origins, flags on, its variables set or not", () => {
  for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_EXPORT, PHASE_PRODUCTION_SERVER])
    for (const env of [ON, { ...ON, ...PLAYGROUND }]) {
      const c = { ...config(phase), ...playground(phase, env) };
      assert.equal(c.rewrites, undefined, `${phase}: a rewrite`);
      assert.equal(c.allowedDevOrigins, undefined, `${phase}: dev origins`);
      assert.equal(c.skipTrailingSlashRedirect, undefined, `${phase}: the trailing slash`);
    }
});

void test("a dev server has it only with GNOGOLF_PLAYGROUND=1: /rpc to 127.0.0.1, the hosts named exactly", async () => {
  assert.deepEqual(playground(PHASE_DEVELOPMENT_SERVER, ON), {});
  assert.deepEqual(playground(PHASE_DEVELOPMENT_SERVER, { ...PLAYGROUND, GNOGOLF_PLAYGROUND: "" }), {});
  const c = playground(PHASE_DEVELOPMENT_SERVER, { ...ON, ...PLAYGROUND });
  assert.deepEqual(c.allowedDevOrigins, ["mac-studio.tail8cf12f.ts.net", "100.104.210.102"]);
  assert.deepEqual(await c.rewrites!(), [{ source: "/rpc/:path*", destination: "http://127.0.0.1:26667/:path*" }]);
  assert.throws(() => playground(PHASE_DEVELOPMENT_SERVER, { ...PLAYGROUND, PLAYGROUND_RPC: "http://100.104.210.102:26667" }), /127\.0\.0\.1/);
  assert.throws(() => playground(PHASE_DEVELOPMENT_SERVER, { ...PLAYGROUND, PLAYGROUND_RPC: "http://127.0.0.1.evil.example:80" }), /127\.0\.0\.1/);
  assert.throws(() => playground(PHASE_DEVELOPMENT_SERVER, { ...PLAYGROUND, PLAYGROUND_ORIGINS: "*.ts.net" }), /exactly/);
});
