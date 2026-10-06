// lib/gnomes/geo.ts: the shop's region gate, at zero server cost. Netlify
// answers /geo.json from a list of countries (netlify.toml), the client reads
// it once; and the list there is the one geo.ts documents, on every rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BLOCKED, shopInRegion, readGeo } from "../lib/gnomes/geo.ts";

test("geo: the client reads /geo.json once; a blocked answer, or none, keeps the shop shut", async () => {
  const asked: string[] = [];
  const answer = (body: unknown, ok = true) => (url: string) => (asked.push(url), Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response));
  assert.equal(await readGeo(answer({ shop: true })), true);
  assert.equal(await readGeo(answer({ shop: false })), false);
  assert.equal(await readGeo(answer({ shop: "yes" })), false, "anything but true is shut");
  assert.equal(await readGeo(answer({}, false)), false, "not served: shut (the game itself stays)");
  assert.equal(await readGeo(() => Promise.reject(new Error("offline"))), false);
  assert.deepEqual(asked, ["/geo.json", "/geo.json", "/geo.json", "/geo.json"]);
  // once a visit
  let n = 0;
  const once = (url: string) => (n++, answer({ shop: true })(url));
  assert.equal(await shopInRegion(once), true);
  assert.equal(await shopInRegion(once), true);
  assert.equal(n, 1);
});

test("geo: the files the site serves say open, the blocked one says shut", () => {
  const read = (f: string) => JSON.parse(fs.readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")) as { shop: unknown };
  assert.equal(read("geo.json").shop, true);
  assert.equal(read("geo-blocked.json").shop, false);
});

test("geo: netlify.toml's country rules each carry exactly geo.ts's list: /geo.json and /g/* both", () => {
  const toml = fs.readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const rules = toml.split("[[redirects]]").slice(1).map((r) => r.split(/\n\[\[/)[0]).filter((r) => /conditions\s*=\s*\{\s*Country/.test(r));
  const field = (r: string, k: string) => (new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m").exec(r) || [])[1];
  const countries = (r: string) => JSON.parse((/Country\s*=\s*(\[[^\]]*\])/.exec(r) || [])[1] || "[]") as string[];
  assert.deepEqual(rules.map((r) => [field(r, "from"), field(r, "to")]), [["/geo.json", "/geo-blocked.json"], ["/g/*", "/unavailable/"]]);
  for (const r of rules) {
    assert.deepEqual(countries(r), [...BLOCKED], `${field(r, "from")}: the list is geo.ts's, in its order`);
    assert.equal(field(r, "status") ?? (/status\s*=\s*(\d+)/.exec(r) || [])[1], "200");
    assert.match(r, /force\s*=\s*true/);
  }
});
