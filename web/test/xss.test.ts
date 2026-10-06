// Threat: a hole's name, note, slug or author written to steal a page (XSS).
// Anyone can publish one with gnokey, with any text the realm takes. The page
// renders chain text only as text: React's own (escaped), a canvas's fillText
// (the share cards: pixels), aria labels. Links are built from what the chain
// says only once checked (lib/chain.ts: a hole id, an address, a package;
// test/chain.test.ts holds them). These hold the few places HTML is written
// whole, and the static pages (og: tags, made without the chain) to the course.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isAddress } from "../lib/chain.ts";
import { cupsLink, playLink } from "../lib/builder/holes.ts";
import type { HoleRow } from "../lib/types.ts";

const WEB = path.resolve(import.meta.dirname, "..");
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(WEB, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [path.join(dir, e.name)] : []);
const ALL = ["app", "components", "lib"].flatMap(sources);
const read = (f: string) => fs.readFileSync(path.join(WEB, f), "utf8");

void test("HTML written whole: only the JSON-LD (its \"<\" escaped, so a name cannot close the script), and markup that is a literal", () => {
  const raw = ALL.filter((f) => read(f).includes("dangerouslySetInnerHTML"));
  assert.deepEqual(raw, ["app/intro.tsx"]);
  assert.match(read("app/intro.tsx"), /dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify\([^)]*\)\.replace\(\/<\/g, "\\\\u003c"\) \}\}/);
  // the one exception: the trailer rig's titles (lib/promo.ts, ?promo only), handed to window.__promo.setup()
  // by media/promo/render.mjs: code already running on the page, never the chain's text
  const RIG = new Set(["lib/promo.ts\0el.innerHTML = t.html"]);
  for (const f of ALL) {
    for (const m of read(f).matchAll(/(\w+)\.(?:innerHTML|outerHTML)\s*=\s*([^;\n]+)/g))
      assert.ok(/^['"`]/.test(m[2]) && !/\$\{/.test(m[2]) || /^[A-Z_]+$/.test(m[2]) || RIG.has(`${f}\0${m[0]}`), `${f}: markup from a value (${m[0]})`);
    assert.doesNotMatch(read(f), /insertAdjacentHTML|document\.write\(|new Function\(|\beval\(/, f);
  }
  const ld = (name: string) => JSON.stringify({ name }).replace(/</g, "\\u003c");
  assert.doesNotMatch(ld("</script><script>alert(1)</script>"), /<\/script/i, "the escape as intro.tsx writes it");
});

void test("the static pages (og: tags, the link cards) are the course's alone: no community hole's name reaches them", () => {
  const slots = fs.readFileSync(path.join(WEB, "../data/holes.txt"), "utf8").split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
  assert.ok(slots.length > 0);
  for (const s of slots) assert.ok(!isAddress(s.split("/")[0]), `${s}: a community hole`);
  assert.match(read("app/h/[slot]/page.tsx"), /export const dynamicParams = false;/, "no page made for a slot not listed");
  assert.match(read("app/h/slots.ts"), /readFileSync\("\.\.\/data\/holes\.txt"/, "the slots: the course's file, never the chain");
});

void test("a link to a community hole: its id or alias encoded, a hostile one stays a query on the game's own page", () => {
  const evil = `g1${"a".repeat(38)}/"><script>alert(1)</script>?x=javascript:alert(1)#`;
  const row = { id: `${evil}/v1`, slot: evil } as HoleRow;
  const link = playLink(row, "rpc=x");
  assert.ok(link.startsWith("/?hole="), link);
  assert.doesNotMatch(link.slice("/?hole=".length).replace(/&rpc=x$/, ""), /[<>"'#?&: ]/, "nothing of it unencoded");
  assert.equal(new URL(link, "https://gnogolf.example").searchParams.get("hole"), evil, "read back as it was: text");
  assert.equal(cupsLink(), "/?screen=cups");
});
