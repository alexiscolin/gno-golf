// What the first load of every page carries (app/game.tsx, its title screen,
// the game it always loads next and what they import, eagerly): never the
// collection gnomes' wardrobe, which GNOMES' fourteen never use. It is loaded
// where a collection gnome is shown (loadWardrobe, scene/gnome.ts). And none
// of the gnome shop but its door (components/gnomes/Door.tsx): its part of
// the game is a chunk the door fetches, an import() under the flag as the
// build writes it, so a build with NEXT_PUBLIC_GNOMES off has no such chunk
// at all. Walked here from the sources: the static imports, not the
// type-only ones, and of the import() calls only those every page makes
// (ALWAYS).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const WEB = new URL("../", import.meta.url).pathname;
/** A module's file from an import's specifier, or null for a package. */
function resolve(spec: string, from: string) {
  const base = spec.startsWith("@/") ? path.join(WEB, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const f of [base, base + ".ts", base + ".tsx", path.join(base, "index.ts")]) if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  return null;
}
/** The import() every page makes at once: app/game.tsx's game, behind its title screen. */
const ALWAYS = new Set(["@/components/Golf"]);
/** Every module a file brings in eagerly, itself included. */
function eager(entry: string, seen = new Set<string>()) {
  if (seen.has(entry)) return seen;
  seen.add(entry);
  const src = fs.readFileSync(entry, "utf8");
  const statics = [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);
  const always = [...src.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]).filter((s) => ALWAYS.has(s));
  for (const spec of [...statics, ...always]) {
    const f = resolve(spec, entry);
    if (f) eager(f, seen);
  }
  return seen;
}

test("the first load carries none of the collection gnomes' wardrobe", () => {
  const first = [...eager(path.join(WEB, "app/game.tsx"))].map((f) => path.relative(WEB, f));
  assert.ok(first.includes("lib/scene/gnome.ts"), "the walk reaches the gnome (through the title's prefs)");
  assert.ok(first.includes("components/Golf.tsx") && first.includes("components/Leaderboard.tsx"), "the walk reaches the game and its boards");
  const heavy = first.filter((f) => /scene\/gnome-(dress|kit|props|matter|legend)\.ts$|gnomes\/props\.ts$/.test(f));
  assert.deepEqual(heavy, []);
});

// the shop's door, all of the shop the game's first load may carry: the flag and the wear signal (door.ts), the
// region gate (geo.ts), the door's own lazy pieces (Door.tsx); and the gnomes' colour maths every gnome is drawn with
const DOOR = ["lib/gnomes/door.ts", "lib/gnomes/geo.ts", "lib/gnomes/colour.ts", "components/gnomes/Door.tsx"];
const shopFile = (f: string) => /^(lib\/gnomes\/|components\/gnomes\/|app\/(gnomes|collection)\.css$)/.test(f);

test("the first load carries none of the gnome shop but its door; the rest is a chunk only a build with the flag on has", () => {
  const first = [...eager(path.join(WEB, "app/game.tsx"))].map((f) => path.relative(WEB, f));
  assert.ok(first.includes("components/gnomes/Door.tsx"), "the walk reaches the shop's door");
  assert.deepEqual(first.filter((f) => shopFile(f) && !DOOR.includes(f)), []);
  // every import() of the shop from the first load sits under the flag the build writes in: off, no chunk is made
  for (const f of first) {
    const src = fs.readFileSync(path.join(WEB, f), "utf8");
    for (const line of src.split("\n")) {
      for (const m of line.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
        const to = resolve(m[1], path.join(WEB, f));
        if (to && shopFile(path.relative(WEB, to))) assert.match(line, /process\.env\.NEXT_PUBLIC_GNOMES === "1" \?/, `${f}: import("${m[1]}") is not under the flag`);
      }
    }
  }
});

test("the build writes the shop's flag in even unset, so a build without it drops the shop's import()", async () => {
  const { default: config } = (await import("../next.config.mjs")) as { default: { env: Record<string, unknown> } };
  assert.equal(typeof config.env.NEXT_PUBLIC_GNOMES, "string");
});
