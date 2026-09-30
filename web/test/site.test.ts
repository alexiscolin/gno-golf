// lib/site.ts: the public address a link card or a share carries, and the
// cups' names as the pages say them (the Crystal Mines among them).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SITE, siteURL, siteHost, cupName, CUPS } from "../lib/site.ts";

const w = globalThis as { window?: unknown };
const at = (href: string) => {
  const u = new URL(href);
  w.window = { location: { origin: u.origin, pathname: u.pathname, hostname: u.hostname } };
};
afterEach(() => void delete w.window);

test("siteURL: the page's own site, from its root (a hole's page too)", () => {
  at("https://gnogolf.xyz/");
  assert.equal(siteURL(), "https://gnogolf.xyz");
  assert.equal(siteURL("?cup=mines&hole=mines/3"), "https://gnogolf.xyz/?cup=mines&hole=mines/3");
  at("https://gnogolf.xyz/h/mines-3/");
  assert.equal(siteURL("/h/mines/"), "https://gnogolf.xyz/h/mines/", "a hole's page links from the site's root");
  assert.equal(siteHost(), "gnogolf.xyz");
  at("https://ipfs.io/ipfs/bafy/");
  assert.equal(siteURL("?hole=garden/1"), "https://ipfs.io/ipfs/bafy/?hole=garden/1", "under a path: kept");
});

test("siteURL: never a local dev address, the public one instead", () => {
  at("http://localhost:3335/?rpc=http://127.0.0.1:46657");
  assert.equal(siteURL("?hole=mines/7"), `${SITE}/?hole=mines/7`);
  at("http://127.0.0.1:3300/h/garden-1/");
  assert.equal(siteURL(), SITE);
});

test("cupName: the course's cups by their names, the mines last; any other world by its own", () => {
  assert.deepEqual([...CUPS], ["garden", "island", "town", "mountain", "mines"]);
  assert.deepEqual(CUPS.map(cupName), ["Garden Cup", "Island Cup", "Mushroom Town", "Mountain Cup", "Crystal Mines"]);
  assert.equal(cupName("extras"), "Extras");
});
