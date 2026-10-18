"use client";

// The shop's small pieces, one of each (the GUI spec's "Shared pieces"): a
// tier's chip, a gnome's tile (his 3D portrait, or the chain's; an earned
// one's leaf), his card in a grid (and a Legendary's to come, to look at), the
// switch between the two looks, the closing date, the one share button. On
// the game's own tokens (app/gnomes.css).
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { Button, Segmented } from "@/components/ui";
import { useCopied } from "@/components/common";
import { retryIn } from "@/lib/retry";
import { siteURL } from "@/lib/site";
import { shareOrCopy } from "@/components/Share";
import { TIER_LOOK, type Listed } from "@/lib/gnomes/catalogue";
import type { Look, Portraits } from "@/lib/gnomes/onchain";
import { gnot, utcDate, localDate, type SaleCard, type TierShare } from "@/lib/gnomes/shop";
import type { Tier } from "@/lib/gnomes/vocab";

// a tier's shape, read in grey too: a disc, a diamond, a gem, a crown; a leaf for an earned one
const SHAPE: Record<string, ReactNode> = {
  common: <circle cx="8" cy="8" r="5" />,
  rare: <path d="M8 2 14 8 8 14 2 8z" />,
  epic: <path d="M4 3h8l3 4-7 7-7-7z" />,
  legendary: <path d="M2 12 3 5l3 3 2-5 2 5 3-3 1 7z" />,
  earned: <path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10z" />,
};
export const tierName = (t: string) => (TIER_LOOK[t as Tier] || { label: t }).label;

/** A tier's chip: its shape and its name, on its colour. */
export const TierChip = ({ tier }: { tier: string }) => (
  <span className={`tier tier--${tier}`}>
    <svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE[tier] || SHAPE.common}</svg>
    {tierName(tier)}
  </span>
);

/** Where a gnome's picture is served (scripts/gnomeassets.mjs): his thumbnail. */
export const thumb = (id: number) => `/gnomes/${id}.webp`;

/** A gnome's portrait as the chain draws it, read once his tile is in view (lazy; at once otherwise): undefined
 *  while it is read, null for none (his 3D portrait shows instead). */
function useOnChain(id: number, from: Portraits | null, lazy: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState(() => from?.known(id));
  useEffect(() => {
    if (!from) return;
    const known = from.known(id);
    setUrl(known);
    if (known !== undefined) return;
    let live = true;
    const load = () => void from.get(id).then((u) => live && setUrl(u));
    const el = ref.current;
    if (!lazy || !el || typeof IntersectionObserver === "undefined") return load(), () => void (live = false);
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (o.disconnect(), load()), { rootMargin: "200px" });
    o.observe(el);
    return () => ((live = false), o.disconnect());
  }, [id, from, lazy]);
  return { ref, url };
}

/** A gnome's tile: his thumbnail on his tier's stage, in his tier's rim (never: the sale closed before he found a player);
 *  onChain: the portraits he is drawn from as the chain draws him (the stage bare while it is read, his thumbnail if it fails). */
export function Tile({ id, tier, never = false, lazy = true, onChain = null }: { id: number; tier: string; never?: boolean; lazy?: boolean; onChain?: Portraits | null }) {
  const { ref, url } = useOnChain(id, onChain, lazy);
  const [broken, setBroken] = useState<string | null>(null);
  // the thumbnail not fetched (the site restarting, the network gone a moment): asked again a few times, then the bare stage, never a broken icon
  const [tries, setTries] = useState(0), [gone, setGone] = useState(false);
  const src = !onChain ? thumb(id) : url === undefined ? null : url && url !== broken ? url : thumb(id);
  const failed = () => {
    if (url && src === url) return setBroken(url); // (the chain's drawing refused: his thumbnail instead)
    const wait = retryIn(tries);
    if (wait === null) return setGone(true);
    setTimeout(() => setTries((n) => n + 1), wait);
  };
  return (
    <span ref={ref} className={`gtile gtile--${tier}${never ? " gtile--never" : ""}`}>
      {src && !gone && <img key={tries} src={src} alt="" width={256} height={256} loading={lazy ? "lazy" : "eager"} decoding="async" onError={failed} />}
    </span>
  );
}

/** An earned gnome's tile: his tier's leaf on its stage (no portrait is made of the game's own gnomes). */
export const EarnedTile = () => (
  <span className="gtile gtile--earned"><svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE.earned}</svg></span>
);

/** The switch between a gnome's two looks: his 3D portrait, or the SVG the chain draws (the gallery's and a sheet's). */
export const LookSwitch = ({ look, onLook }: { look: Look; onLook: (l: Look) => void }) => (
  <Segmented label="How the gnomes are drawn" className="seg--look" options={[["3d", "3D"], ["chain", "On chain"]]} value={look} onChange={onLook} />
);

/** A gnome in the grid: his tile, name and number, his tier and one fact (his price when on sale), and Buy when he
 *  can be bought; a button that opens his sheet (where the order is reviewed: the card itself never buys). */
export function GnomeCard({ g, fact, mine, never, buy = false, onChain = null, onOpen }: { g: Listed; fact: string; mine: boolean; never: boolean; buy?: boolean; onChain?: Portraits | null; onOpen: () => void }) {
  return (
    <button type="button" className={`gcard${mine ? " gcard--mine" : ""}${never ? " gcard--never" : ""}`} onClick={onOpen}
      aria-label={`${g.name}, number ${g.id}, ${tierName(g.tier)}: ${fact}${buy ? ". Buy" : ""}`}>
      <Tile id={g.id} tier={g.tier} never={never} onChain={onChain} />
      <span className="gcard__name"><span>{g.name}</span><small>#{g.id}</small></span>
      <span className="gcard__foot"><TierChip tier={g.tier} /><span className="gcard__fact">{fact}</span></span>
      {buy && <span className="gcard__buy" aria-hidden="true">Buy</span>}
    </button>
  );
}
/** A card's place while the grid is read: the same size, blank. */
export const BlankCard = () => (
  <span className="gcard gcard--skel" aria-hidden="true"><span className="gtile" /><span className="gcard__name">&nbsp;</span><span className="gcard__foot" /><span className="gcard__buy gcard__buy--skel">&nbsp;</span></span>
);

/** The closing date: a date in UTC (the player's own time on hover and for a screen reader), never a countdown. */
export function Closes({ at, now }: { at: number; now: number }) {
  return (
    <p className="closes wcard__closes" title={localDate(at)}>
      <span>Sale closes for good on <b aria-label={`${utcDate(at, now)}, ${localDate(at)} your time`}>{utcDate(at, now)}</b>. Unsold gnomes are never made.</span>
    </p>
  );
}

/** The sale's card, the game's front card (title.css): its Legendary in gold on the left, the series' name over
 *  its count (its figure big) and the Legendaries' words; at its right the state's chip (a date, never a countdown; a
 *  phone's shorter) over the fairway, the ball rolled from the tee to the share that found a player (still with
 *  reduced motion); the closing date (closes) its foot. A phone: all stacked, the fairway under. Its height the
 *  slot's (ShopFrame SaleSlot). */
export function SaleLine({ line, closes }: { line: SaleCard; closes?: ReactNode }) {
  if (line.at === "closed")
    return <section className="wcard wcard--closed" aria-label="The sale"><b className="wcard__title">{line.title}</b><span className="wcard__count">{line.count}</span></section>;
  const { legend, chip } = line;
  return (
    <section className={`wcard${closes ? " wcard--closes" : ""}`} aria-label="The sale">
      {legend && <span className="wcard__legend" title={legend.words}><img src={thumb(legend.id)} alt="" width={256} height={256} decoding="async" /></span>}
      <b className="wcard__title" aria-hidden="true">{line.title}</b>
      {chip && (
        <span className="wcard__chip" role="note" aria-label={chip.full} title={chip.full}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.5V8l2.5 1.6" /></svg>
          <span className="wcard__long">{chip.text}</span><span className="wcard__short">{chip.short}</span>
        </span>
      )}
      <span className="wcard__count" aria-hidden="true"><b className="wcard__big">{line.big}</b> {line.rest}</span>
      {legend && <span className="wcard__who" aria-hidden="true"><b>{legend.name}</b> {legend.words.slice(legend.name.length + 1)}</span>}
      <span className="fw" role="img" aria-label={legend ? `${line.label}. ${legend.words}` : line.label} style={{ "--at": line.share } as CSSProperties}>
        <span className="fw__lane" />
        <span className="fw__tee" />
        <svg className="fw__flag" viewBox="0 0 16 32" aria-hidden="true"><ellipse cx="4" cy="23" rx="4" ry="2" className="fw__cup" /><path d="M4 23V2" className="w__pole" /><path d="M4 2l11 4-11 4z" className="w__flag" /></svg>
        <span className="fw__ball" />
      </span>
      {closes}
    </section>
  );
}

/** The tiers as the shelf's filter: a chip each, its price in the sale (once, here; no price, none said) and how many
 *  of it are left of what the sale holds (its own count, never a countdown), pressed
 *  when it filters; pressed again, every tier. Each chip says its tier's share of the sale to a screen reader. */
export function TierFilter({ tiers, value, onChange }: { tiers: readonly TierShare[]; value?: string; onChange: (t: string | undefined) => void }) {
  const known = new Map(tiers.map((t) => [t.tier, t]));
  return (
    <div className="gbar__tiers" role="group" aria-label="Show one tier">
      {(["common", "rare", "epic", "legendary"] as const).map((t) => {
        const s = known.get(t);
        return (
          <Button key={t} size="s" type="button" className={`tier tier--${t} tierbtn${t === "legendary" ? " tierbtn--long" : ""}`} aria-pressed={value === t} onClick={() => onChange(value === t ? undefined : t)}
            aria-label={s ? s.label : tierName(t)}>
            <svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE[t]}</svg>
            <span className="tierbtn__name">{tierName(t)}</span>{t === "legendary" && <span className="tierbtn__short">Legend</span>}
            {s && s.price > 0 && <span className="tierbtn__price">{gnot(s.price)}<span className="tierbtn__unit"> GNOT</span></span>}
            {s && <span className="tierbtn__left">{s.total - s.found}/{s.total} left</span>}
          </Button>
        );
      })}
    </div>
  );
}

/** The search's state, shared by its icon and its row (Shop holds it): open while in use; shown while open or a
 *  query is kept. Open, the field is focused; Escape (anywhere in the row or on the icon) or ✕ clears and closes it,
 *  and only it (the shop stays), the icon focused again; focus leaving both closes it (an empty search goes, a query
 *  kept stays shown); the icon opens it, or back to a query kept, and, open, clears and closes it. */
export function useSearch(value: string, onChange: (text: string) => void) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null), icon = useRef<HTMLButtonElement>(null), row = useRef<HTMLDivElement>(null), back = useRef(false);
  const shown = open || value !== "";
  useEffect(() => {
    if (open) field.current?.focus();
    if (!shown && back.current) (back.current = false), icon.current?.focus();
  }, [shown, open]);
  const close = () => ((back.current = true), onChange(""), setOpen(false));
  return {
    value, onChange, open, shown, field, icon, row, close,
    press: () => (open ? close() : setOpen(true)),
    /** Escape closes the search and goes no further (the game's Escape leaves the screen) */
    key: (e: KeyboardEvent) => shown && e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), close()),
    /** focus gone from the row and the icon: no longer in use */
    blur: (e: FocusEvent) => !row.current?.contains(e.relatedTarget) && e.relatedTarget !== icon.current && setOpen(false),
  };
}
type Search = ReturnType<typeof useSearch>;

/** The search's icon, in the toolbar's right group, by the look switch, pressed (gold) while the search shows. */
export function SearchButton({ search: s }: { search: Search }) {
  return (
    <Button ref={s.icon} variant="icon" size="s" type="button" className={`gbar__icon${s.shown ? " btn--on" : ""}`} aria-label="Find a gnome by name or number"
      aria-expanded={s.shown} aria-controls={s.shown ? "gsearch" : undefined} onClick={s.press} onKeyDown={s.key} onBlur={s.blur}
      onMouseDown={(e) => s.open && e.preventDefault()} /* (open, the field keeps the focus: a press closes it) */>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
    </Button>
  );
}

/** The search's row, under the toolbar, the gallery's width (it covers nothing), while it shows. */
export function SearchRow({ search: s }: { search: Search }) {
  if (!s.shown) return null;
  return (
    <div ref={s.row} className="gsearch" id="gsearch" role="search" onKeyDown={s.key} onBlur={s.blur}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
      <input ref={s.field} type="search" placeholder="A name or a number" aria-label="Find a gnome by name or number" value={s.value} onChange={(e) => s.onChange(e.target.value)} />
      <button type="button" className="gsearch__close" aria-label="Close the search" onClick={s.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  );
}

/** Sharing in the shop, one button: the phone's own share sheet (the words and the link), else the link copied, and
 *  "Copied" said (a computer's share sheet is a bare panel without the networks people mean: Share.tsx). */
export function ShareOne({ text, link, label = "Share" }: { text: string; link: string; label?: string }) {
  const [copied, copy] = useCopied();
  const go = () => shareOrCopy(text, siteURL(link), copy);
  return (
    <Button size="s" type="button" className="gshare" onClick={go} aria-label={copied ? "Link copied" : label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{copied ? <path d="M5 12l5 5 9-10" /> : <path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" />}</svg>
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </Button>
  );
}
