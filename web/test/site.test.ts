// lib/site.ts: the public address a link card or a share carries, and the
// cups' names as the pages say them (the Crystal Mines among them).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SITE, siteURL, siteHost, cupName, CUPS, ISSUES, reportHole } from "../lib/site.ts";

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
  at("https://gnogolf.xyz/build/");
  assert.equal(siteURL("?hole=x/v1"), "https://gnogolf.xyz/?hole=x/v1", "so does the Builder");
  at("https://ipfs.io/ipfs/bafy/build/");
  assert.equal(siteURL("?hole=x/v1"), "https://ipfs.io/ipfs/bafy/?hole=x/v1");
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

test("reportHole: an issue titled with the hole's id, its body a link that plays it and why left to say", () => {
  at("https://gnogolf.xyz/");
  const id = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5/avalanche/v1", u = new URL(reportHole(id));
  assert.equal(u.origin + u.pathname, ISSUES);
  assert.equal(u.searchParams.get("title"), `Report: ${id}`);
  const body = u.searchParams.get("body") || "";
  assert.ok(body.includes(`Play it: https://gnogolf.xyz/?hole=${id}`) && body.includes("Why?"));
});
