// The shop's words the law asks for, as the copy draft writes them
// (docs/superpowers/legal/draft-shop-copy.md, a draft for lawyer review; its
// Japanese is the reference, this is its English): the final confirmation
// before the wallet opens (最終確認画面: every term, two separate boxes never
// pre-ticked, a button that names the obligation to pay), the receipt, the
// trust strip. The seller is the build's (NEXT_PUBLIC_SELLER_*,
// next.config.mjs refuses a production shop without it); a placeholder shows
// what is missing anywhere else.
import { aboutGnot as about, upToHundredth as up } from "../adena";
import { shortAddr } from "../chain";
import { dateParts, gnot, utcDate } from "./shop";

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
/** What each tier's price stands for on the course, said under a sheet's price when it is the tier's own. */
export const PAR: Record<string, readonly [ugnot: number, words: string]> = {
  common: [36e6, "the par of nine holes"], rare: [72e6, "the par of a course"], epic: [336e6, "the dimples on a ball"], legendary: [1296e6, "eighteen holes times par 72"],
};
/** A price's golf number ("36: the par of nine holes"), "" for a price not its tier's own. */
export const parLine = (tier: string, price: number) => (Object.hasOwn(PAR, tier) && PAR[tier][0] === price ? `${gnot(price)}: ${PAR[tier][1]}` : "");
/** Words the shop never uses (§5), lower case. */
export const BANNED = ["invest ", "investment opportunity", "floor", "returns on", "roi", "profit", "appreciate", "will go up", "last chance", "only "];

const TIER: Record<string, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", earned: "Earned" };
/** A time in Japan's (UTC+9), as the copy says it: "Mon 14 Dec, 03:00 JST". */
export function jstDate(unix: number) {
  const p = dateParts(unix + 9 * 3600);
  return `${p.weekday} ${p.day}, ${p.hm} JST`;
}
/** A date the receipt keeps: the year too ("Tue 6 Oct 2026, 18:04 UTC (Wed 7 Oct, 03:04 JST)"). */
const stamp = (unix: number) => {
  const p = dateParts(unix);
  return `${p.weekday} ${p.day} ${p.year}, ${p.hm} UTC (${jstDate(unix)})`;
};

/** The sale period (申込期間), on the confirmation and the receipt: the genesis's closing date, or plainly that none
 *  is set (the realm sells none of the genesis until the owner sets it: only a later series' gnome then). */
const salePeriod = (closesAt: number, now: number) =>
  closesAt ? `The genesis sale closes on ${utcDate(closesAt, now)} (${jstDate(closesAt)}).` : "The genesis sale has no closing date set yet: the Contract sells none of the genesis until one is set.";

interface Order { name: string; id: number; tier: string; n: number; price: number; deposit: number; fee: number; address: string; closesAt: number; now: number }
/** The order's total, in ugnot: its price, deposit and fee up to the hundredth of a GNOT, never under what the wallet
 *  may be asked (both are the bill's most). The one figure the review's Total and the order's button both say. */
export const orderTotal = (o: Pick<Order, "price" | "deposit" | "fee">) => up(o.price + o.deposit + o.fee);
type Term = [label: string, term: string];
/** The order, term by term (§1.1), grouped for reading and none left out: its total first; what is paid (the item,
 *  its price, the deposit and fee "about", the payment); then the terms (delivery, sale period, cancellation, nature,
 *  seller). */
export function review(o: Order): { total: Term; pay: Term[]; terms: Term[] } {
  return {
    total: ["Total", `${gnot(orderTotal(o))} GNOT at most`],
    pay: [
      ["Item", `${o.name} (#${o.id}, ${TIER[o.tier] || o.tier}), ${o.n} ${o.n === 1 ? "item" : "items"}`],
      ["Price", `${gnot(o.price)} GNOT`],
      ["Other costs", `Storage deposit about ${about(o.deposit)} GNOT (held by the chain, returned if you burn the gnome) + network fee about ${about(o.fee)} GNOT. Neither is paid to us.`],
      ["Payment", "Paid now, in GNOT, from your own wallet, in the transaction you sign."],
    ],
    terms: [
      ["Delivery", `Delivered at once to ${shortAddr(o.address, 6)}, in the same transaction.`],
      ["Sale period", salePeriod(o.closesAt, o.now)],
      ["Cancellation", "No returns, cancellations or refunds once the transaction is final, except where the law requires them."],
      ["Nature", "Cosmetic only. No gameplay advantage. Not an investment."],
      ["Seller", `${SELLER.name}, ${SELLER.address}, ${SELLER.email}`],
    ],
  };
}
/** The order's button (§1.3), the total in it, up to the hundredth (orderTotal's: the review's own figure). */
export const orderButton = (total: number) => `Order with obligation to pay (${gnot(up(total))} GNOT): sign in wallet`;
/** The chain's part of a buy in one line, under a sheet's price, from the review's own estimate: "+ ≈0.5 GNOT chain
 *  costs, 0.43 back if you burn it" (the deposit held by the chain, never paid to us). */
export const chainCosts = (deposit: number, fee: number) => `+ ≈${gnot(up(deposit + fee))} GNOT chain costs, ${gnot(up(deposit))} back if you burn it`;

interface Receipt extends Order { at: number; hash: string; realm: string; chainId: string; consents: readonly string[] }
/** The receipt (§3), a line each: what the buyer prints or saves. consents: the boxes shown and ticked, word for word. */
export function receipt(r: Receipt) {
  return [
    `Seller: ${SELLER.name}, ${SELLER.address}, ${SELLER.email}`,
    `Date and time: ${r.at ? stamp(r.at) : "(the block's, on the chain)"}`,
    `Item: ${r.name}, #${r.id}, ${TIER[r.tier] || r.tier}. Contract ${r.realm}`,
    `Price paid: ${gnot(r.price)} GNOT (+ network fee ${about(r.fee)} GNOT, storage deposit ${about(r.deposit)} GNOT held by the chain)`,
    `Delivered to: ${r.address}`,
    `Sale period: ${salePeriod(r.closesAt, r.now)}`,
    `Transaction: ${r.hash || "in your wallet's history"} (permanent record on ${r.chainId})`,
    `Terms accepted: Terms of Sale version ${TERMS_VERSION}`,
    `Your consents, as ticked: ${r.consents.map((c) => `"${c}"`).join("; ")}`,
    `No returns or refunds once final, except where the law requires them. Questions: ${SELLER.email}.`,
  ];
}
