"use client";

// The gnome shop: the gallery, the one screen it adds to the game (the game's
// own front screen: About.tsx FrontScreen), its views a tap apart (on sale,
// a player's own, all; a player's gnomes, read-only), and a gnome in a sheet
// over it (GnomeSheet). Loaded only when it is opened (Golf.tsx, behind
// NEXT_PUBLIC_GNOMES), with its styles: the title and the holes' pages carry
// none of it. Everything it shows is read: the catalogue the site serves, the
// realm's Collection, Sold, GnomesOf and Worn, the region; each gnome drawn
// as the thumbnails show him, or as the chain does (the look switch). On
// sale, each wave's Legendary to come shows too, to look at.
import "@/app/gnomes.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { FrontScreen } from "@/components/About";
import { Button, Segmented, Sheet } from "@/components/ui";
import Share from "@/components/Share";
import { UNLOCKS, worldName, type UnlockId } from "@/lib/card";
import type { Chain } from "@/lib/chain";
import type { Listed } from "@/lib/gnomes/catalogue";
import { canBuyCard, cardFact, closingSlot, theirTitle, comingLegends, makeShop, neverMade, nowRow, shelf, shareWords, teamOrder, waveLine, PAGE, SHOP, type Collection, type Held, type View, type Worn } from "@/lib/gnomes/shop";
import { shopInRegion } from "@/lib/gnomes/geo";
import { know, tokenSkin } from "@/lib/gnomes/wear";
import { served as catalogue, type Served } from "@/lib/gnomes/served";
import type { Home } from "@/lib/gnomes/vocab";
import { Closes, ComingCard, GnomeCard, LookSwitch, SaleLine, SearchToggle, TierChip, TierFilter } from "./parts";
import { BlankShelf, ClosesSlot, SHOP_HEAD, ShopPitch, ShopTitle, WaveSlot } from "./ShopFrame";
import { knownSale } from "@/lib/gnomes/promo";
import { portraitsOf, savedLook, saveLook, type Look } from "@/lib/gnomes/onchain";
import GnomeSheet from "./GnomeSheet";
import type { Skin } from "@/lib/scene/gnome";
import Album from "./Album";
import Collector from "./Rank";
import { ALBUM_WORDS, album, albumLine, albumShown, collectorsOf } from "@/lib/gnomes/collection";

/** What the shop shows: a player's gnomes (who: their address, theirs read-only) and a gnome open (its id, or an earned kind). */
export interface ShopView { who?: string; open?: string }
type Account = { address: string; chainId: string };

export interface ShopProps {
  chain: Chain;
  account: Account | null;
  wallet: { busy: boolean; error: string | null };
  onConnect: () => void;
  view: ShopView;
  onView: (v: ShopView) => void;
  onBack: () => void;
  onAbout: () => void;
  /** the gnome the player plays (a skin id), and playing another (free, in this browser) */
  playing: string;
  onPlay: (skinId: string) => void;
  /** race a player's ghost */
  onRace: (player: string) => void;
  /** the shopkeeper by the title: the menu's Shop panel's gnome (null: not known yet) */
  keeper?: Skin | null;
}

export default function ShopScreen({ chain, account, wallet, onConnect, view, onView, onBack, onAbout, playing, onPlay, onRace, keeper }: ShopProps) {
  const shop = useMemo(() => makeShop(chain), [chain]);
  const me = account && account.address;
  // the first frame from the sale the menu already read (its panel), when it has: then read again (load)
  const [known] = useState(() => knownSale(chain));
  const [cat, setCat] = useState<Served | null>(known && known.served);
  const [c, setC] = useState<Collection | null>(known && known.c);
  const [sold, setSold] = useState<((id: number) => boolean) | null>(() => known && known.sold);
  const [error, setError] = useState(false);
  const [region, setRegion] = useState<boolean | null | undefined>(undefined); // (undefined: not read yet; null: could not be read)
  const [mine, setMine] = useState<number[]>([]);
  const [held, setHeld] = useState<Held["rows"] | null>(null); // (the same, as the realm lists them: the album's; null: not read)
  const [worn, setWorn] = useState<Worn | null>(null);
  const [mineFailed, setMineFailed] = useState(false);
  const [theirs, setTheirs] = useState<{ who: string; ids: number[]; name: string; rows: Held["rows"]; failed?: true } | null>(null);
  const [now, setNow] = useState(() => Math.floor(chain.now() / 1000));
  const [f, setF] = useState<{ view: View; tier?: Listed["tier"]; home?: Home; text: string }>({ view: "sale", text: "" });
  const [shown, setShown] = useState(PAGE);
  const [more, setMore] = useState(false);
  // the look the viewer picked, kept in this browser: on chain, the portraits read as the cards come into view
  const [look, setLook] = useState<Look>(savedLook);
  const onLook = (l: Look) => (setLook(l), saveLook(l));
  const onChain = look === "chain" ? portraitsOf(chain) : null;

  // the sale's figures, again on coming back to the page: a closing date moved, a gnome taken
  const load = () => {
    setError(false);
    void Promise.all([catalogue(), shop.collection(), shop.sold()])
      .then(([k, col, s]) => (setCat(k), setC(col), setSold(() => s), setNow(Math.floor(chain.now() / 1000))))
      .catch(() => setError(true));
  };
  const askRegion = () => (setRegion(undefined), void shopInRegion().then(setRegion));
  useEffect(() => {
    load();
    askRegion();
    addEventListener("focus", load);
    return () => removeEventListener("focus", load);
  }, [shop]); // eslint-disable-line react-hooks/exhaustive-deps -- (load reads the same shop)
  // what is shown now: an answer for another account, or another player, landing late is dropped
  const here = useRef({ me, who: view.who });
  here.current = { me, who: view.who };
  // the player's own: what they hold and what everyone sees them wear (a read that failed: said, with Try again)
  const mineLoad = () => {
    setMineFailed(false);
    if (!me) return;
    const mine = () => here.current.me === me;
    void shop.allOf(me).then((rows) => mine() && (setMine(rows.map((r) => Number(r.id))), setHeld(rows), collectorsOf(chain).know(me, { total: rows.length, rows })), () => mine() && setMineFailed(true));
    void shop.worn(me).then((w) => mine() && setWorn(w), () => mine() && setWorn(null));
  };
  useEffect(() => (setMine([]), setHeld(null), setWorn(null), mineLoad()), [shop, chain, me]); // eslint-disable-line react-hooks/exhaustive-deps -- (mineLoad: me's)
  // a player's gnomes, read-only
  const theirsLoad = () => {
    if (!view.who || view.who === me) return setTheirs(null);
    const who = view.who, still = () => here.current.who === who;
    void Promise.all([shop.allOf(who), chain.nameOf(who).catch(() => "")]).then(
      ([rows, name]) => still() && (setTheirs({ who, ids: rows.map((r) => Number(r.id)), name, rows }), collectorsOf(chain).know(who, { total: rows.length, rows })),
      () => still() && setTheirs({ who, ids: [], name: "", rows: [], failed: true }),
    );
  };
  useEffect(theirsLoad, [shop, chain, view.who, me]);

  const mineSet = useMemo(() => new Set(mine), [mine]);
  const myAlbum = useMemo(() => (cat && held ? album(cat.gnomes, cat.earned, held) : null), [cat, held]);
  const seen = useMemo(() => (c && sold ? { c, sold, mine: mineSet, now } : null), [c, sold, mineSet, now]);
  const viewing = theirs ? "theirs" : view.who === me && me ? "mine" : f.view;
  const list = useMemo(() => {
    if (!cat || !seen) return [];
    if (theirs) return theirs.ids.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g);
    const v: View = viewing === "mine" ? "mine" : f.view;
    const out = shelf(cat.gnomes, { view: v, tier: f.tier, home: f.home, text: f.text }, seen).list;
    return v === "mine" ? teamOrder(out.map((g) => ({ ...g, id: String(g.id) }))).map((g) => ({ ...g, id: Number(g.id) })) : out;
  }, [cat, seen, theirs, viewing, f]);
  // on sale, the Legendary of each wave not open yet, to look at, after the page of gnomes on sale (the same filters)
  const coming = useMemo(() => (cat && seen && viewing === "sale" ? shelf(comingLegends(cat.gnomes, seen.c, seen.now), { view: "all", tier: f.tier, home: f.home, text: f.text }, seen).list : []), [cat, seen, viewing, f]);
  useEffect(() => setShown(PAGE), [f, viewing]);

  const open = view.open && cat ? cat.gnomes.find((g) => String(g.id) === view.open) : undefined;
  const earned = view.open && cat && !open ? cat.earned.find((e) => e.unlock === view.open) : undefined;
  const row = c && sold && cat ? nowRow(c, sold, cat.gnomes, now) : null;
  const line = row && c && sold && cat ? waveLine(row, c, cat.gnomes, sold, now) : null;
  const closed = !!row && row.at === "closed"; // (the genesis closed, no later series' wave: what was made, not on sale)
  const nameOf = (id: string) => (id.startsWith("t") ? cat?.gnomes.find((g) => `t${g.id}` === id)?.name || "a gnome" : "a gnome of the game");
  const playingName = nameOf(playing), wornSkin = worn ? tokenSkin(worn).id : null;

  // the gnomes this player holds are known to the game (their faces, the picker): drawn from their traits
  useEffect(() => {
    if (cat && mine.length) void know(mine.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g).map((g) => ({ id: String(g.id), name: g.name, traits: g.traits })));
  }, [cat, mine]);

  // a shop at first glance: its name, then one line of what is sold (the player's own gnomes and another's keep theirs)
  const title = theirs ? theirTitle(theirs.name, theirs.who) : viewing === "mine" ? (mine.length ? `Your team of ${mine.length}` : "Your gnomes") : <ShopTitle keeper={keeper} />;
  const views: (readonly [View, string])[] = [[closed ? "made" : "sale", closed ? "Made" : "On sale"], ...(me ? [["mine", "Mine"] as const] : []), ["all", `All ${cat ? cat.gnomes.length : ""}`.trim()]];

  if (region === null)
    return (
      <FrontScreen className="front--fit shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={SHOP_HEAD.page} title={SHOP_HEAD.title}>
        <div className="gempty" role="alert"><p>Couldn't check whether the gnome shop is offered here.</p><Button variant="primary" onClick={askRegion}>Try again</Button></div>
      </FrontScreen>
    );
  if (region === false)
    return (
      <FrontScreen className="front--fit shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={SHOP_HEAD.page} title="Not here">
        <p className="gempty">The gnome shop is not offered in your region. The game stays free to play.</p>
      </FrontScreen>
    );
  return (
    <FrontScreen className="front--fit shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={theirs || viewing === "mine" ? SHOP_HEAD.page : SHOP_HEAD.eyebrow} title={title} dare={!theirs && viewing !== "mine" ? <ShopPitch /> : undefined}>
      {/* the closing line and the wave in their places from the first frame (ShopFrame), the line's room kept until the
          sale is read (no room at all when it says no date): nothing moves as they are read */}
      {!theirs && viewing !== "mine" && closingSlot(c) !== "none" && <ClosesSlot>{c && closingSlot(c) === "line" && <Closes at={c.closesAt} now={now} />}</ClosesSlot>}
      {!theirs && viewing !== "mine" && !row && <WaveSlot />}
      {/* the sale in one line, a little fairway: the wave of the moment, or the sale's end (none: no wave yet) */}
      {!theirs && viewing !== "mine" && line && <SaleLine line={line} />}
      {/* the player's own: who sees what, and their team to share */}
      {viewing === "mine" && me && mine.length > 0 && (
        <>
          <p className="wave__note" style={{ textAlign: "center" }}>{wornSkin === playing ? `Everyone sees ${playingName}` : `You play ${playingName} · everyone sees ${worn ? worn.name : "a gnome of the game"}`}</p>
          <Share text={shareWords.team(mine.length, worn ? worn.name : list[0]?.name || "")} link={`g/?who=${me}`} label="Share my team" kind="share" />
        </>
      )}
      {theirs && <Button variant="gold" className="btn--cta" onClick={() => onRace(theirs.who)}>Race their ghost</Button>}
      {/* the album (ADR-011): the player's own, or theirs (under their Race), a row a world, a tier, a set */}
      {cat && albumShown(SHOP, region ?? null) && (viewing === "mine" && me ? <Album cat={cat} owned={held || []} chain={chain} player={me} mine onOpen={(o) => onView({ ...view, open: o })} />
        : theirs && theirs.rows.length > 0 && <Album cat={cat} owned={theirs.rows} chain={chain} player={theirs.who} mine={false} onOpen={(o) => onView({ ...view, open: o })} />)}
      {/* one toolbar: which gnomes, the tiers (their prices, once), the search, the look, more filters folded */}
      {!theirs && (
        <>
          <div className="gbar">
            <Segmented label="Which gnomes" className="gbar__views" options={views} value={viewing === "mine" ? "mine" : f.view} onChange={(v) => (v === "mine" && me ? onView({ who: me }) : (onView({}), setF((x) => ({ ...x, view: v }))))} />
            <TierFilter tiers={line && line.at !== "closed" ? line.tiers : []} value={f.tier} onChange={(t) => setF((x) => ({ ...x, tier: t as Listed["tier"] | undefined }))} />
            <SearchToggle value={f.text} onChange={(text) => setF((x) => ({ ...x, text }))} />
            <LookSwitch look={look} onLook={onLook} />
            <Button variant="icon" size="m" type="button" className={`gbar__icon gbar__more${f.home ? " btn--on" : ""}`} aria-label="More filters" aria-expanded={more} aria-controls="gmore" onClick={() => setMore((m) => !m)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2.4" /><circle cx="15" cy="17" r="2.4" /></svg>
            </Button>
          </div>
          {more && (
            <div className="gfilters" id="gmore">
              <select className="gfilters__search" aria-label="World" value={f.home || ""} onChange={(e) => setF((x) => ({ ...x, home: (e.target.value || undefined) as Home | undefined }))}>
                <option value="">Every world</option>
                {[...new Set((cat ? cat.gnomes : []).map((g) => g.home))].map((h) => <option key={h} value={h}>{worldName(h)}</option>)}
              </select>
            </div>
          )}
        </>
      )}
      {/* the player's album in one line, its room kept from the first frame (ADR-011): a tap to it */}
      {!theirs && viewing !== "mine" && me && (
        <p className="galbum-line">{myAlbum && albumShown(SHOP, region ?? null) && (
          <button className="linkish" onClick={() => onView({ who: me })}>{ALBUM_WORDS.open}{myAlbum.have > 0 && <> · {albumLine(myAlbum, row && row.at !== "none" && row.at !== "closed" ? row.wave.home : undefined)}<Collector chain={chain} player={me} /></>} ›</button>
        )}</p>
      )}
      {/* a read that failed is said, never shown as an empty shelf: the sale's, the player's own, another's */}
      {error || (viewing === "mine" && mineFailed) || theirs?.failed ? (
        <div className="gempty" role="alert"><p>The chain did not answer.</p><Button variant="primary" onClick={error ? load : theirs ? theirsLoad : mineLoad}>Try again</Button></div>
      ) : !seen || !cat || (viewing === "mine" && !held) ? (
        <BlankShelf />
      ) : !list.length && !coming.length ? (
        <div className="gempty">
          {viewing === "mine" ? <p>None yet. You play with the free gnomes and the ones you earn on the course.</p> : theirs ? <p>No gnome yet.</p> : <p>No gnome like that one.</p>}
          {!theirs && viewing !== "mine" && <Button variant="secondary" onClick={() => setF({ view: f.view, text: "" })}>Clear the filters</Button>}
        </div>
      ) : (
        <>
          <ul className="gshelf">
            {list.slice(0, shown).map((g) => (
              <li key={g.id}><GnomeCard g={g} fact={cardFact(g, seen)} mine={mineSet.has(g.id)} never={neverMade(g, seen)} buy={canBuyCard(g, seen)} onChain={onChain} onOpen={() => onView({ ...view, open: String(g.id) })} /></li>
            ))}
            {coming.map((g) => <li key={g.id}><ComingCard g={g} onChain={onChain} /></li>)}
          </ul>
          {list.length > shown && <Button variant="secondary" className="gshelf__more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more · {shown} of {list.length}</Button>}
        </>
      )}
      <details className="more">
        <summary>How the gnomes work</summary>
        <p>Each gnome is one of a kind: you pick the exact one, nothing is random, and it is yours on the chain the moment you buy it. The prices are golf numbers: 36 GNOT a Common (the par of nine holes), 72 a Rare (the par of a course), 336 an Epic (the dimples on a ball), 1,296 a Legendary (eighteen holes times par 72). Cosmetic only: same ball, same physics. Not an investment, no promise of value or resale. The shop is for adults (18+); playing stays free for everyone. Earned gnomes are free: prove the feat on the course. They can&apos;t be bought or sold.</p>
      </details>
      {open && c && (
        <GnomeSheet g={open} shop={shop} chain={chain} c={c} account={account} region={region === true} now={now} wallet={wallet} onConnect={onConnect}
          onClose={() => onView({ who: view.who })} playing={playing} worn={wornSkin} onPlay={onPlay} onTheirs={(who) => onView({ who })} onChanged={mineLoad}
          look={look} onLook={onLook} />
      )}
      {earned && (
        <Sheet label={earned.name} onClose={() => onView({ who: view.who })} className="gsheet">
          <div className="gsheet__head"><TierChip tier="earned" /><h2>{earned.name}</h2></div>
          <p className="gsheet__line">{earned.line}</p>
          <p className="gsheet__fine">Earned in play: {UNLOCKS[earned.unlock as UnlockId]?.need || "a feat on the course"}. Free: the chain proves the feat. It can&apos;t be bought or sold.</p>
        </Sheet>
      )}
    </FrontScreen>
  );
}
