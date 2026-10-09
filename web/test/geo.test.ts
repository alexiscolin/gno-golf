// lib/gnomes/geo.ts: the shop's region gate, at zero server cost. Netlify
// answers /geo.json from a list of countries (netlify.toml), the client reads
// it once; and the list there is the one geo.ts documents, on every rule.
// Shut by default: a host without those rules serves the closed /geo.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BLOCKED, shopInRegion, readGeo } from "../lib/gnomes/geo.ts";

test("geo: an answer opens or shuts the shop; no answer is not one (null), never read as a region's no", async () => {
  const asked: string[] = [];
  const answer = (body: unknown, ok = true) => (url: string) => (asked.push(url), Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response));
  assert.equal(await readGeo(answer({ shop: true }), null), true);
  assert.equal(await readGeo(answer({ shop: false }), null), false);
  assert.equal(await readGeo(answer({ shop: "yes" }), null), false, "anything but true is shut");
  assert.equal(await readGeo(answer({}, false), null), null, "not served (a 5xx, a deploy mid-flight): unknown, the shop shut meanwhile");
  assert.equal(await readGeo(() => Promise.reject(new Error("offline")), null), null);
  assert.equal(await readGeo(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError("not JSON")) } as Response), null), null);
  assert.deepEqual(asked, ["/geo.json", "/geo.json", "/geo.json", "/geo.json"]);
});

test("geo: once a visit, an answer; a read that failed is asked again", async () => {
  let n = 0;
  const flaky = () => (n++ === 0 ? Promise.reject(new Error("offline")) : Promise.resolve({ ok: true, json: () => Promise.resolve({ shop: true }) } as Response));
  assert.equal(await shopInRegion(flaky), null);
  assert.equal(await shopInRegion(flaky), true);
  assert.equal(await shopInRegion(flaky), true);
  assert.equal(n, 2);
});

test("geo: where the test hooks answer, the gate reads as Netlify answers an open country, or a blocked one (?geo=blocked)", async () => {
  const { geoAs } = await import("../lib/testhooks.ts");
  assert.equal(geoAs("?geo=blocked"), "blocked");
  assert.equal(geoAs("?x=1&geo=blocked"), "blocked");
  assert.equal(geoAs("?geo=blockedx"), "open");
  assert.equal(geoAs(""), "open");
  const asked: string[] = [];
  const get = (url: string) => (asked.push(url), Promise.resolve({ ok: true, json: () => Promise.resolve({ shop: url === "/geo-open.json" }) } as Response));
  assert.equal(await readGeo(get, "blocked"), false);
  assert.equal(await readGeo(get, "open"), true);
  assert.equal(await readGeo(get, null), false, "the host's own /geo.json: shut where no rule answers it");
  assert.deepEqual(asked, ["/geo-blocked.json", "/geo-open.json", "/geo.json"]);
});

test("geo: the files the site serves: shut by default and for a blocked country, open only where a rule says so", () => {
  const read = (f: string) => JSON.parse(fs.readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")) as { shop: unknown };
  assert.equal(read("geo.json").shop, false);
  assert.equal(read("geo-blocked.json").shop, false);
  assert.equal(read("geo-open.json").shop, true);
});

test("geo: netlify.toml: the country rules carry exactly geo.ts's list, then everyone else's /geo.json is the open one", () => {
  const toml = fs.readFileSync(new URL("../../netlify.toml", import.meta.url), "utf8");
  const all = toml.split("[[redirects]]").slice(1).map((r) => r.split(/\n\[\[/)[0]);
  const field = (r: string, k: string) => (new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, "m").exec(r) || [])[1];
  const countries = (r: string) => JSON.parse((/Country\s*=\s*(\[[^\]]*\])/.exec(r) || [])[1] || "[]") as string[];
  const forced = (r: string) => (field(r, "status") ?? (/status\s*=\s*(\d+)/.exec(r) || [])[1]) === "200" && /force\s*=\s*true/.test(r);
  const rules = all.filter((r) => /conditions\s*=\s*\{\s*Country/.test(r));
  assert.deepEqual(rules.map((r) => [field(r, "from"), field(r, "to")]), [["/geo.json", "/geo-blocked.json"], ["/g/*", "/unavailable/"]]);
  for (const r of rules) {
    assert.deepEqual(countries(r), [...BLOCKED], `${field(r, "from")}: the list is geo.ts's, in its order`);
    assert.ok(forced(r));
  }
  // Netlify applies the first rule that matches: the blocked countries' first, then the open answer for the rest
  const geo = all.filter((r) => field(r, "from") === "/geo.json");
  assert.deepEqual(geo.map((r) => field(r, "to")), ["/geo-blocked.json", "/geo-open.json"]);
  assert.ok(forced(geo[1]) && !/conditions/.test(geo[1]));
});
