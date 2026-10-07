// Publishing a hole (the hole-builder design's "The publish flow"): what a
// PublishMine stores and costs, from the realm's own figures (the
// z_builder_publish filetests in gno.land/r/gnogolf/golf: each publishes a
// warm-up hole, then the one measured; their Storage and Gas less the
// warm-up's), the bill shown before any signature, and the command for
// gnokey, whose every argument reaches the realm as the page shows it.
import { feeFor, gnokeyCall, gnokeyOn, MAX_GAS, PER_CALL, publishArgs } from "../adena";
import { isAddress } from "../chain";
import type { Versions } from "../types";
import { holeId, holeRow } from "./testmode";
import { makeLocalChain } from "./localchain";
import { canonicalHex, parAllowed, replay, suggestPar, type Proof } from "./proof";
import { validate, type ValidateOptions } from "./pipeline";
import { required } from "./rules";
import type { Draft } from "./draft";
import type { BuilderHost } from "./wasm";

/**
 * What a publish stores besides its data, name and note (bytes), in store
 * under golf/v2's rules (the z_builder_publish filetests in golf/v2): its
 * entry and its rows in the indexes (a plain lane: 2,557 stored for 364 of
 * data and a 4-byte name); an author new to golf adds their row in the
 * authors' index; a later version, its alias already indexed, less. Store
 * made the indexes' first leaves at its deploy: the chain's first community
 * hole pays no more (the warm-up's 139 bytes over, within the deposit's tenth).
 */
export const STORED = { overhead: 2189, newAuthor: 454, version: -960 } as const;

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** What a publish stores: the data's bytes (course.Encode's), the name and note as the chain keeps them, its entry and index rows. */
export function publishBytes({ bytes, name, note, v, newAuthor }: { bytes: number; name: string; note: string; v: number; newAuthor: boolean }) {
  return bytes + utf8(name) + utf8(note) + STORED.overhead + (newAuthor ? STORED.newAuthor : 0) + (v > 1 ? STORED.version : 0);
}

/** The storage deposit (ugnot) at price ugnot a byte (the chain's: vm params), a tenth more: the chain takes what is really written. */
export const deposit = (o: Parameters<typeof publishBytes>[0] & { price: number }) => Math.ceil(publishBytes(o) * o.price * 1.1);

/**
 * PublishMine's work under golf/v2, fitted on its filetests: a base (a new
 * author's or a version's rows on top: kept above both), each byte of data
 * (decoding, the checks, the work estimates walk what it holds: the heaviest
 * hole v2 takes from the Builder's worlds, 5,346 bytes, 128M), each rune of
 * name and note (cleaned and checked for links: 180 four-byte runes, 49M).
 */
const GAS = { base: 8.0e6, perByte: 22_185, perRune: 273_400 } as const;
/** The gas a publish asks for: the call's own, and PublishMine's work a quarter more, never past what a transaction may ask. */
export function gasFor({ bytes, name, note }: { bytes: number; name: string; note: string }) {
  const runes = [...name].length + [...note].length;
  return Math.min(MAX_GAS, Math.ceil(PER_CALL + 1.25 * (GAS.base + GAS.perByte * bytes + GAS.perRune * runes)));
}

/** The bill before any signature, in GNOT: the deposit, the fee (the gas at gasPrice, half again for a price that rises), at most their total. */
export function bill(o: Parameters<typeof publishBytes>[0] & { gasPrice: number; bytePrice: number }) {
  const d = deposit({ ...o, price: o.bytePrice }) / 1e6, fee = feeFor(gasFor(o), o.gasPrice) / 1e6;
  return { deposit: d, fee, total: d + fee };
}

/** The data as it will be published: the draft framed and fitted, its title the name as the chain keeps it (check's); null if fit refuses it. */
export const finalHex = (d: Draft, host: BuilderHost, name: string) => canonicalHex({ ...d, title: name }, host);

/**
 * Whether the hole may be published as it is, said in words ("" it may): the
 * Builder's own rules once more on the final draft (the census included: a
 * draft file or an undo may reach here past the editor's gate), every weather
 * the world asks proved under id by a round that replays on the final data in
 * the strokes it says, and a par no lower than those rounds allow.
 */
export async function holeHolds(d: Draft, hex: string, key: string, id: string, o: Pick<ValidateOptions, "host" | "palette" | "census">): Promise<string> {
  const e = validate(d, { ...o, slug: d.slug }).issues.find((i) => i.severity === "error");
  if (e) return `This hole breaks the Builder's rules: ${e.text}. Fix it in Edit.`;
  const proofs: Proof[] = [];
  for (const kind of required(d.world)) {
    const p = d.proofs.find((x) => x.kind === kind && x.key === key && x.id === id);
    const again = p && (await replay(makeLocalChain(o.host, holeRow(id, d), hex, p.period), { key, id, kind, period: p.period, shots: p.shots }));
    if (!p || !again || typeof again === "string" || again.strokes !== p.strokes) return "The rounds that proved it no longer play out the same on its final data: test it again.";
    proofs.push(p);
  }
  if (!parAllowed(proofs, d.par)) {
    const most = Math.max(...proofs.map((p) => p.strokes));
    return `Par ${d.par} is below the ${most} strokes it was proved in: at least ${suggestPar(proofs)}.`;
  }
  return "";
}

/** The par explained from the rounds that proved the hole (the review's quick win 12): "Holed in 2 everywhere · par 3 leaves room"; "" with none. */
export function parLine(proofs: readonly Pick<Proof, "strokes">[], par: number): string {
  if (!proofs.length) return "";
  const n = proofs.map((p) => p.strokes), lo = Math.min(...n), hi = Math.max(...n);
  const holed = lo === hi ? `Holed in ${hi} everywhere` : `Holed in ${lo} to ${hi} by weather`;
  return `${holed} · par ${par} ${par > hi ? "leaves room" : `leaves none: at least ${suggestPar(proofs)}`}`;
}

/** What the publish step reads before it opens (undefined: still being read; null: the chain could not be read). */
export interface Readings {
  /** Publishing(): community holes open on this chain */
  publishing: boolean | null | undefined;
  /** builder.wasm's sources are the realm's, and the realm has no successor */
  rules: boolean | null | undefined;
  /** who writes in the records' realm (store's Writer()): "" paused, another realm once new rules took over; a publish's last act writes there */
  writer: string | null | undefined;
  /** the alias on the site's takedown list (takedown.ts); null: the list could not be read */
  taken: boolean | null | undefined;
  /** Versions(alias); null: the chain could not be read */
  versions: Versions | null | undefined;
  /** holeHolds on the final data: "" it may be published, else why; undefined: still being judged */
  hole: string | undefined;
  /** check()'s refusal of the name or the note, explained; "" none */
  name: string;
}
export type Step = { at: "ready" | "reading"; why: "" } | { at: "closed" | "paused" | "rules" | "taken" | "unread" | "newer" | "same" | "hole" | "name"; why: string };

/**
 * Where the publish step stands: ready, or the first check that does not
 * hold, said once. The id it publishes under (the alias's next version) is
 * the one the proofs were made under, or the weather was another's; the data
 * may not be the alias's current version's again (golf refuses it).
 */
export function publishSteps(r: Readings, { author, slug, proved, sha, realm }: { author: string; slug: string; proved: string; sha: string; realm: string }): Step {
  if (r.publishing === false) return { at: "closed", why: "Publishing isn't open on gno.land yet. Your draft is kept." };
  if (r.rules === false) return { at: "rules", why: "The Builder's checks are not the chain's current rules. Reload the page, or wait for the site to catch up." };
  if (r.writer === "") return { at: "paused", why: "Saves are paused on gno.land for now. Your draft is kept." };
  if (r.writer && r.writer !== realm) return { at: "rules", why: "New rules play this course now. Your draft is kept: reload the page once the site has caught up." };
  if (r.taken) return { at: "taken", why: "This hole was taken down: it cannot be published again." };
  if (r.publishing === null || r.rules === null || r.writer === null || r.taken === null || r.versions === null) return { at: "unread", why: "The chain could not be read. Try again in a moment." };
  if (r.publishing === undefined || r.rules === undefined || r.writer === undefined || r.taken === undefined || r.versions === undefined || r.hole === undefined) return { at: "reading", why: "" };
  const id = holeId(author, slug, r.versions);
  if (id !== proved) return { at: "newer", why: `This one would be ${id.slice(id.lastIndexOf("/") + 1)}, with new weather: test it again.` };
  if (r.versions.versions.at(-1)?.sha === sha) return { at: "same", why: "This is exactly the version already published." };
  if (r.hole) return { at: "hole", why: r.hole };
  if (r.name) return { at: "name", why: r.name };
  return { at: "ready", why: "" };
}

/** A string as one POSIX shell word: in single quotes, each one in it as '\''. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The publish as one `gnokey maketx call` (PublishMine of slug, data, note),
 * its gas and fee as the bill's, its deposit capped at it, signed by the
 * author's key named by its address (gnokey takes a name or an address): a
 * keybase without it refuses, so the hole never lands under another address,
 * whose weather was never proved. "" for a slug, data, realm, gas, deposit or
 * author not of their shape: nothing unchecked reaches a shell (the note, any
 * text, is quoted).
 */
export function gnokeyPublish({ realm, slug, hex, note, gas, price, deposit: max, chainId, rpc, author }: {
  realm: string; slug: string; hex: string; note: string; gas: number; price: number; deposit: number; chainId: string | null | undefined; rpc: string; author: string;
}) {
  if (!isAddress(author) || !publishArgs({ realm, slug, hex, deposit: max }) || !Number.isSafeInteger(gas) || gas <= 0) return "";
  return gnokeyCall(realm, "PublishMine", [slug, hex, shq(note)], gas, price, gnokeyOn(chainId, rpc, author), 0, max);
}
