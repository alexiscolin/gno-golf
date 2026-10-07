// The takedown list (the site serves it at /takedown.json; who edits it and
// when: docs/leaderboards.md): community holes the site no longer shows,
// listed or linked, whatever the chain still keeps. Read as flags.ts reads
// its list: only what it should hold, from the chain the game plays on.
import { isAddress, isSlug } from "./chain";

// a list a few thousand holes long is some 200 kB; past this it is not read at all
const MAX_BYTES = 1 << 20;

/** The aliases ("<address>/<slug>") taken down: none if the list is too big, not JSON, or another chain's. */
export function readTakedown(text: string, chainId: string): ReadonlySet<string> {
  const out = new Set<string>();
  if (text.length > MAX_BYTES) return out;
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return out;
  }
  if (!j || typeof j !== "object") return out;
  const { chain, holes } = j as Record<string, unknown>;
  if ((typeof chain === "string" && chain && chain !== chainId) || !Array.isArray(holes)) return out;
  for (const h of holes) {
    if (typeof h !== "string") continue;
    const [addr, slug, ...rest] = h.split("/");
    if (!rest.length && isAddress(addr) && isSlug(slug)) out.add(h);
  }
  return out;
}

/** The site's list (/takedown.json, read anew: no-cache, as Publish checks an alias before it is published) for the chain played on; none served, none taken down; a failed read rejects (the caller says what it falls back to). */
export async function loadTakedown(chain: { chainId: () => Promise<string> }, get: Get = fetch): Promise<ReadonlySet<string>> {
  const [text, id] = await Promise.all([get("/takedown.json", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")), chain.chainId()]);
  return readTakedown(text, id);
}

/** No hole taken down: what a reader falls back to when the list cannot be read. */
export const NO_TAKEN: ReadonlySet<string> = new Set();

type Get = (url: string, init?: RequestInit) => Promise<Response>;
// the lists read this visit, by loader and chain id
const read = new WeakMap<Get, Map<string, Promise<ReadonlySet<string>>>>();
/** The site's list for the chain played on, read once a visit (the game, the Builder's lists and its rewards ask the same); a failed read is not kept: the next ask reads it again. */
export async function takedownOf(chain: { chainId: () => Promise<string> }, get: Get = fetch): Promise<ReadonlySet<string>> {
  const id = await chain.chainId();
  const lists = read.get(get) ?? new Map<string, Promise<ReadonlySet<string>>>();
  read.set(get, lists);
  let p = lists.get(id);
  if (!p) lists.set(id, (p = loadTakedown({ chainId: () => Promise.resolve(id) }, get).catch((e: unknown) => (lists.delete(id), Promise.reject(e instanceof Error ? e : new Error(String(e)))))));
  return p;
}

/** Whether a hole (any version of an alias, or the alias) is taken down. */
export function takenDown(set: ReadonlySet<string>, id: string) {
  const [addr, slug] = id.split("/");
  return set.has(`${addr}/${slug}`);
}
