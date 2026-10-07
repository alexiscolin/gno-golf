// Opening a hole in the Builder: a file (a draft exported before, untrusted:
// parseDraft takes it only whole, unknownEntry only of its world's pieces),
// or a published hole read back as a draft for its next version (gg1.ts
// readHole on builder.wasm's decode: each piece matched to the palette, each
// bar recovered from build.Bar's corners), refused naming the pieces the
// Builder does not make, or whose world is not one of the Builder's. Either
// way the hole then goes through the editor's own checks, the render census
// with them, and one they refuse never opens: no way in skips the palette
// or the rules (the Builder opens only what it can vouch for).
// And a draft's file name.
import { errorsOf, matchIn, unknownEntry } from "./edit";
import { plainOf } from "./explain";
import { readHole } from "./gg1";
import { loadPalette } from "./palette";
import { validate, type Census } from "./pipeline";
import { FIELD, notABuilderWorld } from "./rules";
import { MAX_NOTE, parseDraft, type Draft } from "./draft";
import { authorOf } from "./holes";
import { shortAddr, type Chain } from "../chain";
import type { BuilderHost } from "./wasm";
import { loadTakedown, takenDown } from "../takedown";

/** A draft from a file's text, or why not: whole, of its world's pieces, and passing every rule (the census too). */
export async function fromFile(text: string, host: BuilderHost, census: Census): Promise<Draft | string> {
  const d = parseDraft(text);
  if (typeof d === "string") return d;
  const palette = await loadPalette(d.world), unknown = unknownEntry(d, palette);
  if (unknown) return unknown;
  const why = errorsOf(d, { host, palette, census })[0];
  return why ? `This draft breaks the Builder's rules: ${plainOf(why)}` : d;
}

/** How many refused pieces a sentence names before "and n more". */
const NAMED = 4;

/**
 * A published hole's data read as the Builder reads it: its world one of the
 * Builder's, its pieces its palette's, every rule passed (the census too),
 * and the bytes the Builder would write for it; or why not.
 */
export async function asDraft(hex: string, host: BuilderHost, census: Census): Promise<{ draft: Draft; hex: string } | string> {
  let g;
  try {
    g = host.decode(hex);
  } catch {
    return "This hole's data could not be read.";
  }
  if (!Object.hasOwn(FIELD, g.world)) return notABuilderWorld(g.world);
  const palette = await loadPalette(g.world), r = readHole(g, matchIn(palette), (line) => host.bar(line));
  if ("refused" in r) {
    const more = r.refused.length - NAMED;
    return `This hole has pieces the Builder doesn't make: ${r.refused.slice(0, NAMED).join(", ")}${more > 0 ? `, and ${more} more` : ""}.`;
  }
  const v = validate(r, { host, palette, census }), why = v.issues.find((i) => i.severity === "error");
  if (why) return `This hole breaks the Builder's rules: ${why.text}. It stays playable in the game.`;
  return { draft: r, hex: v.hex! };
}

/**
 * A published hole (its data in hex, its id) as a draft: its next version
 * when the hole is me's (the slug its alias's), a new hole otherwise; or why
 * not (asDraft: the Builder opens only what it can vouch for).
 */
export async function fromPublished(hex: string, host: BuilderHost, id: string, me: string | null, census: Census, taken: ReadonlySet<string> = new Set()): Promise<Draft | string> {
  // a hole the site took down (takedown.ts): never opened, nor published again as its next version
  if (takenDown(taken, id)) return "This hole was taken down: it cannot be opened in the Builder.";
  const r = await asDraft(hex, host, census);
  if (typeof r === "string") return r;
  const [author, slug] = id.split("/");
  return { ...r.draft, slug: me && author === me && /^[a-z0-9-]{1,32}$/.test(slug) ? slug : "" };
}

/**
 * Someone's hole (a draft fromPublished made of its version id) as a new
 * hole of the remixer's: its maker credited in the note ("Remix of Mole Run
 * by g1abcdef…wxyz"), and no name, par or proofs of its own yet.
 */
export function remixOf(d: Draft, id: string): Draft {
  const credit = `Remix of ${d.title || "a hole"} by ${shortAddr(authorOf(id) ?? "")}`;
  return { ...d, slug: "", title: "", par: 0, proofs: [], note: [...credit].slice(0, MAX_NOTE).join("") };
}

/**
 * A community hole's version (id) as a remix (remixOf): its data read from
 * the chain, the site's takedown list with it (one taken down never opens),
 * opened as the Builder opens any published hole (fromPublished); or why not.
 */
export async function remixFrom(chain: Pick<Chain, "holeData" | "chainId">, host: BuilderHost, census: Census, id: string, get?: Parameters<typeof loadTakedown>[1]): Promise<Draft | string> {
  let d: Draft | string;
  try {
    const [hex, taken] = await Promise.all([chain.holeData(id), loadTakedown(chain, get)]);
    d = await fromPublished(hex, host, id, null, census, taken);
  } catch {
    return "The chain has no hole there, or could not be read.";
  }
  return typeof d === "string" ? d : remixOf(d, id);
}

/** A draft's file name: its slug, else its name made safe, else "hole". */
export function draftFile(d: Draft): string {
  const base = d.slug || d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "hole";
  return `${base}.gnogolf.json`;
}
