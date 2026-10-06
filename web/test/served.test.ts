// lib/gnomes/served.ts: the catalogue the site serves, read once a visit,
// a failure asked again, and the file the build writes being one it reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { served } from "../lib/gnomes/served.ts";

test("served: read once; a failed read is asked again; another shape is refused", async () => {
  let n = 0;
  const bad = () => (n++, Promise.resolve({ ok: false } as Response));
  await assert.rejects(served(bad), /did not load/);
  const odd = () => (n++, Promise.resolve({ ok: true, json: () => Promise.resolve({ gnomes: 3 }) } as unknown as Response));
  await assert.rejects(served(odd), /not one this page can read/);
  const good = () => (n++, Promise.resolve({ ok: true, json: () => Promise.resolve({ gnomes: [], earned: [] }) } as unknown as Response));
  assert.deepEqual(await served(good), { gnomes: [], earned: [] });
  await served(good);
  assert.equal(n, 3, "asked again after each failure, then once");
});

test("served: scripts/gnomeassets.mjs writes every gnome, without its skin, and the nine earned kinds", () => {
  execFileSync("node", [new URL("../../scripts/gnomeassets.mjs", import.meta.url).pathname], { stdio: "ignore" });
  const c = JSON.parse(fs.readFileSync(new URL("../public/gnomes/catalogue.json", import.meta.url), "utf8")) as { gnomes: Record<string, unknown>[]; earned: unknown[] };
  assert.equal(c.gnomes.length, 720);
  assert.equal(c.earned.length, 9);
  assert.deepEqual(Object.keys(c.gnomes[0]).sort(), ["archetype", "home", "id", "line", "name", "series", "tier", "traits", "wave"]);
});
