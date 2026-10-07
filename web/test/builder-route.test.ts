// /build (app/build): behind NEXT_PUBLIC_BUILDER; on a phone, a touch screen
// or under 900 px the one phone screen and nothing of the editor: neither its
// components nor builder.wasm are reachable from that path but through a
// dynamic import the computer's path alone makes. And the holes the phone
// screen lists (lib/builder/holes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { builderOn, onComputer, PHONE_QUERY } from "../lib/builder/route.ts";
import { AUTHOR_KEY, authorOf, cupsLink, holeByline, knownAuthor, listHoles, playLink } from "../lib/builder/holes.ts";
import { GNOKEY_ADDR_KEY } from "../lib/adena.ts";
import type { HoleRow } from "../lib/types.ts";

const WEB = new URL("../", import.meta.url).pathname;

void test("the flag: the Builder is there only with NEXT_PUBLIC_BUILDER=1", () => {
  assert.equal(builderOn("1"), true);
  for (const v of [undefined, "", "0", "true", "yes"]) assert.equal(builderOn(v), false, String(v));
});

void test("a computer is 900 px and up with a fine pointer; anything else is the phone's screen", () => {
  assert.equal(PHONE_QUERY, "(max-width: 899px), (pointer: coarse)");
  assert.equal(onComputer(() => false), true);
  assert.equal(onComputer((q) => q === PHONE_QUERY), false);
});

// The files a module reaches through static imports (import … from, export … from,
// import "…"), the repo's own only; a dynamic import() is a separate chunk, loaded
// only when the code that makes it runs.
function reached(entry: string): Set<string> {
  const seen = new Set<string>();
  const resolve = (from: string, spec: string) => {
    const base = spec.startsWith("@/") ? path.join(WEB, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
    if (!base) return null;
    for (const f of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    return null;
  };
  const walk = (f: string) => {
    if (seen.has(f)) return;
    seen.add(f);
    if (!/\.tsx?$/.test(f)) return;
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm)) {
      const r = resolve(f, m[1]);
      if (r) walk(r);
    }
  };
  walk(entry);
  return seen;
}

void test("the phone's path reaches neither the editor nor builder.wasm; the computer's loads the editor as its own chunk", () => {
  const gate = path.join(WEB, "app/build/gate.tsx"), phone = path.join(WEB, "components/builder/PhoneBuilder.tsx");
  for (const entry of [path.join(WEB, "app/build/page.tsx"), gate, phone]) {
    const files = [...reached(entry)].map((f) => path.relative(WEB, f));
    assert.ok(!files.includes("components/builder/Builder.tsx"), `${entry}: the editor`);
    assert.ok(!files.includes("lib/builder/wasm.ts"), `${entry}: the builder's wasm host`);
    for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(WEB, f), "utf8"), /["'`][^"'`\n]*builder\.wasm["'`]/, `${f} asks for builder.wasm`);
  }
  const src = fs.readFileSync(gate, "utf8");
  assert.match(src, /dynamic\(\(\) => import\("@\/components\/builder\/Builder"\)/, "the editor: a dynamic import");
  assert.match(src, /dynamic\(\(\) => import\("@\/components\/builder\/PhoneBuilder"\)/, "the phone's screen: a dynamic import too");
  const editor = reached(path.join(WEB, "components/builder/Builder.tsx"));
  assert.ok(editor.has(path.join(WEB, "lib/builder/wasm.ts")), "the editor itself reaches its host (the checks above are not vacuous)");
  assert.ok([...editor].some((f) => /["'`][^"'`\n]*builder\.wasm["'`]/.test(fs.readFileSync(f, "utf8"))), "and asks for builder.wasm");
  // the difficulty meter runs in its worker, a chunk of its own: the editor carries only the line that starts it
  assert.ok(editor.has(path.join(WEB, "lib/builder/meter.ts")) && !editor.has(path.join(WEB, "lib/builder/difficulty.ts")), "the editor: the meter's worker, not the meter");
  assert.ok(reached(path.join(WEB, "lib/builder/meter-worker.ts")).has(path.join(WEB, "lib/builder/difficulty.ts")), "the worker: the meter");
});

const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38);
const row = (id: string, over: Partial<HoleRow> = {}): HoleRow => ({ id, name: id, official: false, plays: 0, best: 0, proBest: 0, par: 3, world: "garden", order: 0, next: "", slot: id.replace(/\/v\d+$/, ""), ...over });

void test("the phone's lists: your holes, the community's (their latest versions, never a course hole, never one taken down)", () => {
  const rows = [
    row(`${A}/mole-run/v2`), row(`${A}/mole-run/v1`, { next: `${A}/mole-run/v2` }), row(`${A}/crab/v1`, { world: "island" }),
    row(`${B}/long-ice/v1`), row(`${B}/gone/v1`), row("garden/1/v1", { official: true, slot: "garden/1" }),
  ];
  const taken = new Set([`${B}/gone`]);
  const { mine, community } = listHoles(rows, A, taken);
  assert.deepEqual(mine.map((h) => h.id), [`${A}/mole-run/v2`, `${A}/crab/v1`]);
  assert.deepEqual(community.map((h) => h.id), [`${B}/long-ice/v1`]);
  assert.deepEqual(listHoles(rows, null, taken).community.map((h) => h.id), [`${A}/mole-run/v2`, `${A}/crab/v1`, `${B}/long-ice/v1`], "no address known: none is yours");
  assert.equal(authorOf(`${B}/long-ice/v1`), B);
  assert.equal(authorOf("garden/1/v1"), null);
  assert.equal(playLink(row(`${B}/long-ice/v1`)), `/?hole=${encodeURIComponent(`${B}/long-ice`)}`);
});

void test("the phone lists only the community holes this browser already passed (it judges none); the rest are on the game's cups screen", () => {
  assert.equal(cupsLink(), "/?screen=cups");
  assert.equal(cupsLink("rpc=x"), "/?screen=cups&rpc=x");
  const src = fs.readFileSync(path.join(WEB, "components/builder/PhoneBuilder.tsx"), "utf8");
  assert.match(src, /knownOnly\(/, "its community list: the known verdicts only");
  assert.doesNotMatch(src, /verdictOf\(/, "never a judging");
});

void test("holeByline: a community hole's line under its name, the same on the game's list, the phone's and the share card", () => {
  assert.equal(holeByline({ author: "g1" + "a".repeat(38), world: "island", par: 4 }), "Island · par 4 · by g1aaaaaa…aaaa");
});

void test("knownAuthor: the address the Builder last used, else the one the save flow's gnokey panel keeps (one key, both read it)", () => {
  const A = "g1" + "a".repeat(38), B = "g1" + "b".repeat(38);
  localStorage.clear();
  assert.equal(knownAuthor(), null);
  localStorage.setItem(GNOKEY_ADDR_KEY, B);
  assert.equal(knownAuthor(), B);
  localStorage.setItem(AUTHOR_KEY, A);
  assert.equal(knownAuthor(), A);
  localStorage.setItem(AUTHOR_KEY, "not an address");
  assert.equal(knownAuthor(), B);
});
