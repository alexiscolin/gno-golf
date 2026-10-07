// What the first load of every page carries (app/game.tsx, its title screen,
// the game it always loads next and what they import, eagerly): never the
// collection gnomes' wardrobe, which GNOMES' fourteen never use. It is loaded
// where a collection gnome is shown (loadWardrobe, scene/gnome.ts). Walked
// here from the sources: the static imports, not the type-only ones, and of
// the import() calls only those every page makes (ALWAYS).
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
  assert.ok(first.includes("components/Golf.tsx") && first.includes("lib/gnomes/codec.ts"), "the walk reaches the game and the gnomes' codec");
  const heavy = first.filter((f) => /scene\/gnome-(dress|kit|props|matter|legend)\.ts$|gnomes\/props\.ts$/.test(f));
  assert.deepEqual(heavy, []);
});
