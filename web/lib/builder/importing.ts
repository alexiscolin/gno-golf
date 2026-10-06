// Opening a hole in the Builder: a file (a draft exported before, untrusted:
// parseDraft takes it only whole, unknownEntry only of its world's pieces),
// or a published hole read back as a draft for its next version (gg1.ts
// readHole on builder.wasm's decode: each piece matched to the palette, each
// bar recovered from build.Bar's corners), refused naming the pieces the
// Builder does not make. And a draft's file name.
import { matchIn, unknownEntry } from "./edit";
import { readHole } from "./gg1";
import { loadPalette } from "./palette";
import { parseDraft, type Draft } from "./draft";
import type { BuilderHost } from "./wasm";

/** A draft from a file's text, or why not. */
export async function fromFile(text: string): Promise<Draft | string> {
  const d = parseDraft(text);
  if (typeof d === "string") return d;
  return unknownEntry(d, await loadPalette(d.world)) ?? d;
}

/** How many refused pieces a sentence names before "and n more". */
const NAMED = 4;

/**
 * A published hole (its data in hex, its id) as a draft: its next version
 * when the hole is me's (the slug its alias's), a new hole otherwise; or why
 * not, naming the pieces the Builder does not make.
 */
export async function fromPublished(hex: string, host: BuilderHost, id: string, me: string | null): Promise<Draft | string> {
  let g;
  try {
    g = host.decode(hex);
  } catch {
    return "This hole's data could not be read.";
  }
  const r = readHole(g, matchIn(await loadPalette(g.world)), (line) => host.bar(line));
  if ("refused" in r) {
    const more = r.refused.length - NAMED;
    return `This hole has pieces the Builder doesn't make: ${r.refused.slice(0, NAMED).join(", ")}${more > 0 ? `, and ${more} more` : ""}.`;
  }
  const [author, slug] = id.split("/");
  return { ...r, slug: me && author === me && /^[a-z0-9-]{1,32}$/.test(slug) ? slug : "" };
}

/** A draft's file name: its slug, else its name made safe, else "hole". */
export function draftFile(d: Draft): string {
  const base = d.slug || d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "hole";
  return `${base}.gnogolf.json`;
}
