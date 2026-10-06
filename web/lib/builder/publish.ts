// Publishing a hole (the hole-builder design's "The publish flow"): what a
// PublishMine stores and costs, from the realm's own figures (the
// z_builder_publish filetests in gno.land/r/gnogolf/golf: each publishes a
// warm-up hole, then the one measured; their Storage and Gas less the
// warm-up's), the bill shown before any signature, and the command for
// gnokey, whose every argument reaches the realm as the page shows it.
import { feeFor, gnokeyOn, MAX_GAS, PER_CALL, PKG_PATH } from "../adena";

/**
 * What a publish stores besides its data, name and note (bytes): its entry
 * and its rows in golf's indexes (a plain lane: 4,297 stored for 364 of data
 * and a 4-byte name); an author new to golf adds their row in the
 * community's index; a later version, its alias already indexed, less.
 */
export const STORED = { overhead: 3929, newAuthor: 385, version: -933 } as const;

const utf8 = (s: string) => new TextEncoder().encode(s).length;

/** What a publish stores: the data's bytes (course.Encode's), the name and note as the chain keeps them, its entry and index rows. */
export function publishBytes({ bytes, name, note, v, newAuthor }: { bytes: number; name: string; note: string; v: number; newAuthor: boolean }) {
  return bytes + utf8(name) + utf8(note) + STORED.overhead + (newAuthor ? STORED.newAuthor : 0) + (v > 1 ? STORED.version : 0);
}

/** The storage deposit (ugnot) at price ugnot a byte (the chain's: vm params), a tenth more: the chain takes what is really written. */
export const deposit = (o: Parameters<typeof publishBytes>[0] & { price: number }) => Math.ceil(publishBytes(o) * o.price * 1.1);

/**
 * PublishMine's work, fitted on the filetests: a base, each byte of data
 * (decoding, the checks, the work estimates walk what it holds: golf's
 * heaviest hole, 15,292 bytes, 435M), each rune of name and note (cleaned
 * and checked for links: 180 four-byte runes, 47M).
 */
const GAS = { base: 5.23e6, perByte: 28_113, perRune: 261_800 } as const;
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

/** A string as one POSIX shell word: in single quotes, each one in it as '\''. */
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The publish as one `gnokey maketx call` (PublishMine of slug, data, note),
 * its gas and fee as the bill's, its deposit capped at it; for the author to
 * run with their own key (<your-key-name>). "" for a slug, data, realm, gas
 * or deposit not of their shape: nothing unchecked reaches a shell (the
 * note, any text, is quoted).
 */
export function gnokeyPublish({ realm, slug, hex, note, gas, price, deposit: max, chainId, rpc }: {
  realm: string; slug: string; hex: string; note: string; gas: number; price: number; deposit: number; chainId: string | null | undefined; rpc: string;
}) {
  if (!PKG_PATH.test(realm) || !/^[a-z0-9-]{1,32}$/.test(slug) || !/^(?:[0-9a-f]{2})+$/.test(hex) || !Number.isSafeInteger(gas) || gas <= 0 || !Number.isSafeInteger(max) || max < 0) return "";
  return `gnokey maketx call -pkgpath ${realm} -func PublishMine -args ${slug} -args ${hex} -args ${shq(note)} -gas-fee ${feeFor(gas, price)}ugnot -gas-wanted ${gas} -max-deposit ${max}ugnot ${gnokeyOn(chainId, rpc)}`;
}
