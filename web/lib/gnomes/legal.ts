// The shop's words the law asks for, as the copy draft writes them
// (docs/superpowers/legal/draft-shop-copy.md, a draft for lawyer review; its
// Japanese is the reference, this is its English): the final confirmation
// before the wallet opens (最終確認画面: every term, two separate boxes never
// pre-ticked, a button that names the obligation to pay), the receipt, the
// trust strip. The seller is the build's (NEXT_PUBLIC_SELLER_*,
// next.config.mjs refuses a production shop without it); a placeholder shows
// what is missing anywhere else.
import { shortAddr } from "../chain";
import { gnot, utcDate } from "./shop";

const env = (v: string | undefined, placeholder: string) => (v && v.trim()) || placeholder;
/** Who sells (特定商取引法に基づく表記; the EU's trader): name, geographical address, e-mail. */
export const SELLER = {
  name: env(process.env.NEXT_PUBLIC_SELLER_NAME, "[operator name]"),
  address: env(process.env.NEXT_PUBLIC_SELLER_ADDRESS, "[address]"),
  email: env(process.env.NEXT_PUBLIC_SELLER_EMAIL, "[e-mail]"),
};
/** The shop's legal pages: the Terms of Sale, the seller's (特定商取引法に基づく表記), privacy; their version. */
export const LINKS = {
  terms: env(process.env.NEXT_PUBLIC_TERMS_URL, "#"),
  seller: env(process.env.NEXT_PUBLIC_TOKUSHOHO_URL, "#"),
  privacy: env(process.env.NEXT_PUBLIC_PRIVACY_URL, "#"),
};
export const TERMS_VERSION = env(process.env.NEXT_PUBLIC_TERMS_VERSION, "[version, date]");

/** Box A, always shown (§1.2): its link is the Terms of Sale. */
export const BOX_A = "I am 18 or older, and I accept the Terms of Sale. I understand a gnome is a cosmetic item, not an investment, and that it may lose all resale value.";
/** Box B, its own (§1.2): the consent to delivery at once and the loss of the 14-day withdrawal (EU/UK; shown to everyone). */
export const BOX_B = "I want my gnome delivered now, before the 14-day withdrawal period ends, and I understand that I therefore lose my right of withdrawal once it is delivered.";
/** Under the order button (§1.3). */
export const SIGN_NOTE = "Your wallet will open and ask you to sign. Signing is your order. It cannot be undone.";
/** The trust strip, under a buy button (§4). */
export const TRUST = ["Cosmetic only: same ball, same physics.", "You pick the exact gnome; nothing is random.", "Not an investment. No promise of value or resale."];
/** Words the shop never uses (§5), lower case. */
export const BANNED = ["invest ", "investment opportunity", "floor", "returns on", "roi", "profit", "appreciate", "will go up", "last chance", "only "];

const TIER: Record<string, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", earned: "Earned" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
/** A time in Japan's (UTC+9), as the copy says it: "Mon 14 Dec, 03:00 JST" (time: the hour alone). */
export function jstDate(unix: number, time = false) {
  const d = new Date((unix + 9 * 3600) * 1000);
  return time ? `${hm(d)} JST` : `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hm(d)} JST`;
}
/** A date the receipt keeps: the year too ("Tue 6 Oct 2026, 18:04 UTC (Wed 7 Oct, 03:04 JST)"). */
const stamp = (unix: number) => {
  const d = new Date(unix * 1000);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hm(d)} UTC (${jstDate(unix)})`;
};
/** GNOT "about" a figure, to the hundredth (a deposit, a fee). */
const about = (ugnot: number) => (Math.ceil(ugnot / 1e4) / 100).toFixed(2);

interface Order { name: string; id: number; tier: string; n: number; price: number; deposit: number; fee: number; address: string; closesAt: number; now: number }
/** The order, term by term (§1.1): [label, term]; the total "about" (the deposit and fee are the bill's most). */
export function review(o: Order): [string, string][] {
  const rows: [string, string][] = [
    ["Item", `${o.name} (#${o.id}, ${TIER[o.tier] || o.tier}), ${o.n} ${o.n === 1 ? "item" : "items"}`],
    ["Price", `${gnot(o.price)} GNOT`],
    ["Other costs", `Storage deposit about ${about(o.deposit)} GNOT (held by the chain, returned if you burn the gnome) + network fee about ${about(o.fee)} GNOT. Neither is paid to us.`],
    ["Total", `about ${gnot(o.price + Math.ceil(o.deposit / 1e4) * 1e4 + Math.ceil(o.fee / 1e4) * 1e4)} GNOT`],
    ["Payment", "Paid now, in GNOT, from your own wallet, in the transaction you sign."],
    ["Delivery", `Delivered at once to ${shortAddr(o.address, 6)}, in the same transaction.`],
    ["Sale period", `The genesis sale closes on ${utcDate(o.closesAt, o.now)} (${jstDate(o.closesAt)}).`],
    ["Cancellation", "No returns, cancellations or refunds once the transaction is final, except where the law requires them."],
    ["Nature", "Cosmetic only. No gameplay advantage. Not an investment."],
    ["Seller", `${SELLER.name}, ${SELLER.address}, ${SELLER.email}`],
  ];
  return o.closesAt ? rows : rows.filter(([k]) => k !== "Sale period");
}
/** The order's button (§1.3), the total in it. */
export const orderButton = (total: number) => `Order with obligation to pay (${gnot(total)} GNOT): sign in wallet`;

interface Receipt extends Order { at: number; hash: string; realm: string; chainId: string; explorer: string; consents: readonly string[] }
/** The receipt (§3), a line each: what the buyer prints or saves. consents: the boxes shown and ticked, word for word. */
export function receipt(r: Receipt) {
  return [
    `Seller: ${SELLER.name}, ${SELLER.address}, ${SELLER.email}`,
    `Date and time: ${r.at ? stamp(r.at) : "(the block's, on the chain)"}`,
    `Item: ${r.name}, #${r.id}, ${TIER[r.tier] || r.tier}. Contract ${r.realm}`,
    `Price paid: ${gnot(r.price)} GNOT (+ network fee ${about(r.fee)} GNOT, storage deposit ${about(r.deposit)} GNOT held by the chain)`,
    `Delivered to: ${r.address}`,
    `Transaction: ${r.hash} (permanent record on ${r.chainId}${r.explorer ? `: ${r.explorer}` : ""})`,
    `Terms accepted: Terms of Sale version ${TERMS_VERSION}`,
    `Your consents, as ticked: ${r.consents.map((c) => `"${c}"`).join("; ")}`,
    `No returns or refunds once final, except where the law requires them. Questions: ${SELLER.email}.`,
  ];
}
