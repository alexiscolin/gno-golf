"use client";

// The gnome shop: the gallery, the one screen it adds to the game (the game's
// own front screen: About.tsx FrontScreen), its views a tap apart (on sale,
// a player's own, all; a player's gnomes, read-only), and a gnome in a sheet
// over it (GnomeSheet). Loaded only when it is opened (Golf.tsx, behind
// NEXT_PUBLIC_GNOMES), with its styles: the title and the holes' pages carry
// none of it. Everything it shows is read: the catalogue the site serves, the
// realm's Collection, Sold, GnomesOf and Worn, the region; each gnome drawn
// as the thumbnails show him, or as the chain does (the look a sheet's switch
// picked). One way to each thing: the player's own under Mine (their album its badge, the
// album itself one line under their team), the search in All alone, a share
// one button.
import "@/app/gnomes.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { FrontScreen } from "@/components/About";
import { Button, Sheet } from "@/components/ui";
import { CUP_NAMES, UNLOCKS, type Cup, type UnlockId } from "@/lib/card";
import type { Chain } from "@/lib/chain";
import type { Listed } from "@/lib/gnomes/catalogue";
import { canBuyCard, cardFact, closingSlot, theirTitle, makeShop, neverMade, nowRow, saleLine, shelf, shareWords, teamOrder, PAGE, SHOP, type Collection, type Held, type View, type Worn } from "@/lib/gnomes/shop";
import { shopInRegion } from "@/lib/gnomes/geo";
import { know, tokenSkin } from "@/lib/gnomes/wear";
import { served as catalogue, type Served } from "@/lib/gnomes/served";
import { Closes, EarnedTile, GnomeCard, LookSwitch, SaleLine, SearchButton, SearchRow, ShareOne, TierChip, TierFilter, useSearch } from "./parts";
import { BlankShelf, SaleSlot, SHOP_HEAD, ShopPitch } from "./ShopFrame";
import { knownSale } from "@/lib/gnomes/promo";
import { portraitsOf, savedLook, saveLook, type Look } from "@/lib/gnomes/onchain";
import GnomeSheet from "./GnomeSheet";
import Album from "./Album";
import { album, albumNext, albumShown, collectorsOf, seriesLine } from "@/lib/gnomes/collection";

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
  /** to the holes, for a round (a cup's, when one is named) */
  onRound: (cup?: Cup) => void;
}

export default function ShopScreen({ chain, account, wallet, onConnect, view, onView, onBack, onAbout, playing, onPlay, onRace, onRound }: ShopProps) {
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
  const [f, setF] = useState<{ tier?: Listed["tier"]; text: string }>({ text: "" });
  const [shown, setShown] = useState(PAGE);
  const search = useSearch(f.text, (text) => setF((x) => ({ ...x, text })));
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
  const viewing = theirs ? "theirs" : view.who === me && me ? "mine" : "all";
  const list = useMemo(() => {
    if (!cat || !seen) return [];
    if (theirs) return theirs.ids.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g);
    const v: View = viewing === "mine" ? "mine" : "all";
    const out = shelf(cat.gnomes, { view: v, tier: f.tier, text: v === "all" ? f.text : "" }, seen).list;
    return v === "mine" ? teamOrder(out.map((g) => ({ ...g, id: String(g.id) }))).map((g) => ({ ...g, id: Number(g.id) })) : out;
  }, [cat, seen, theirs, viewing, f]);
  useEffect(() => setShown(PAGE), [f, viewing]);

  const open = view.open && cat ? cat.gnomes.find((g) => String(g.id) === view.open) : undefined;
  // the open gnome's place in the series, and what he brings the player's album (each worked out once a gnome opened)
  const series = useMemo(() => (open ? seriesLine(open, cat ? cat.gnomes : [open]) : ""), [open, cat]);
  const albumNote = useMemo(() => (open && myAlbum && held ? albumNext(myAlbum, { total: held.length, rows: held }, open.home) : null), [open, myAlbum, held]);
  const earned = view.open && cat && !open ? cat.earned.find((e) => e.unlock === view.open) : undefined;
  const row = c && sold && cat ? nowRow(c, sold, cat.gnomes, now, cat.series) : null;
  const line = row && c && sold && cat ? saleLine(row, c, cat.gnomes, sold, now) : null;
  const nameOf = (id: string) => (id.startsWith("t") ? cat?.gnomes.find((g) => `t${g.id}` === id)?.name || "a gnome" : "a gnome of the game");
  const playingName = nameOf(playing), wornSkin = worn ? tokenSkin(worn).id : null;

  // the gnomes this player holds are known to the game (their faces, the picker): drawn from their traits
  useEffect(() => {
    if (cat && mine.length) void know(mine.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g).map((g) => ({ id: String(g.id), name: g.name, traits: g.traits })));
  }, [cat, mine]);

  // a shop at first glance: its name, then one line of what is sold (the player's own gnomes and another's keep theirs)
  const title = theirs ? theirTitle(theirs.name, theirs.who) : viewing === "mine" ? (mine.length ? `Your team of ${mine.length}` : "Your gnomes") : SHOP_HEAD.title;
  const searching = viewing === "all";
  const albumOf = (owned: Held["rows"], player: string, mine: boolean) => cat && albumShown(SHOP, region ?? null) && (
    <Album cat={cat} owned={owned} given={mine ? myAlbum : null} chain={chain} player={player} mine={mine} onOpen={(o) => onView({ ...view, open: o })} />
  );
  const cup = earned && (UNLOCKS[earned.unlock as UnlockId] as { cup?: Cup } | undefined)?.cup;

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
    <FrontScreen className={`front--fit shop${theirs || viewing === "mine" ? "" : " shop--sale"}`} back="Back" onBack={onBack} onAbout={onAbout} eyebrow={theirs || viewing === "mine" ? SHOP_HEAD.page : SHOP_HEAD.eyebrow} title={title} dare={!theirs && viewing !== "mine" ? <ShopPitch /> : undefined}>
      {/* the sale's card in its place from the first frame (ShopFrame), its closing line's room kept until the sale is
          read (none when it says no date): nothing moves as they are read */}
      {!theirs && viewing !== "mine" && !row && <SaleSlot closes={closingSlot(c) !== "none"} />}
      {/* the sale in one line, a little fairway: the sale of the moment, or its end (none: none opened yet); the
          closing date its card's last line */}
      {!theirs && viewing !== "mine" && line && <SaleLine line={line} closes={c && closingSlot(c) === "line" && <Closes at={c.closesAt} now={now} />} />}
      {/* the player's own: who sees what, and their team to share */}
      {viewing === "mine" && me && mine.length > 0 && (
        <>
          <p className="sale__note" style={{ textAlign: "center" }}>{wornSkin === playing ? `Everyone sees ${playingName}` : `You play ${playingName} · everyone sees ${worn ? worn.name : "a gnome of the game"}`}</p>
          <span className="gshare-row"><ShareOne text={shareWords.team(mine.length, worn ? worn.name : list[0]?.name || "")} link={`g/?who=${me}`} label="Share my team" /></span>
        </>
      )}
      {theirs && <Button variant="gold" className="btn--cta" onClick={() => onRace(theirs.who)}>Race their ghost</Button>}
      {/* their album (ADR-011), under their Race, folded; the player's own comes under their team */}
      {theirs && theirs.rows.length > 0 && albumOf(theirs.rows, theirs.who, false)}
      {/* one toolbar: the tiers (their prices and what is left, once), the search (open, a row of its own under it) and
          Mine (the album's count its badge: the one way to the player's own) at its left; how the gnomes are drawn at its right */}
      {!theirs && (
        <>
          <div className="gbar">
            <TierFilter tiers={line && line.at !== "closed" ? line.tiers : []} value={f.tier} onChange={(t) => setF((x) => ({ ...x, tier: t as Listed["tier"] | undefined }))} />
            <div className="gbar__tools">
              {searching && <SearchButton search={search} />}
              {me && <Button size="s" type="button" aria-pressed={viewing === "mine"} onClick={() => onView(viewing === "mine" ? {} : { who: me })}>{myAlbum && myAlbum.have ? `Mine · ${myAlbum.have}` : "Mine"}</Button>}
            </div>
            <div className="gbar__end"><LookSwitch look={look} onLook={onLook} /></div>
          </div>
          {searching && <SearchRow search={search} />}
        </>
      )}
      {/* a read that failed is said, never shown as an empty shelf: the sale's, the player's own, another's */}
      {error || (viewing === "mine" && mineFailed) || theirs?.failed ? (
        <div className="gempty" role="alert"><p>The chain did not answer.</p><Button variant="primary" onClick={error ? load : theirs ? theirsLoad : mineLoad}>Try again</Button></div>
      ) : !seen || !cat || (viewing === "mine" && !held) ? (
        <BlankShelf />
      ) : !list.length ? (
        <div className="gempty">
          {viewing === "mine" ? <p>None yet. You play with the free gnomes and the ones you earn on the course.</p> : theirs ? <p>No gnome yet.</p> : <p>No gnome like that one.</p>}
          {!theirs && viewing !== "mine" && <Button variant="secondary" onClick={() => setF({ text: "" })}>Clear the filters</Button>}
        </div>
      ) : (
        <>
          <ul className="gshelf">
            {list.slice(0, shown).map((g) => (
              <li key={g.id}><GnomeCard g={g} fact={cardFact(g, seen)} mine={mineSet.has(g.id)} never={neverMade(g, seen)} buy={canBuyCard(g, seen)} onChain={onChain} onOpen={() => onView({ ...view, open: String(g.id) })} /></li>
            ))}
          </ul>
          {list.length > shown && <Button variant="secondary" className="gshelf__more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more · {shown} of {list.length}</Button>}
        </>
      )}
      {/* the player's album, under their team: one line, opening on a tap */}
      {viewing === "mine" && me && held && held.length > 0 && albumOf(held, me, true)}
      <details className="more">
        <summary>How the gnomes work</summary>
        <p>Each gnome is one of a kind: you pick the exact one, nothing is random, and it is yours on the chain the moment you buy it. The prices are golf numbers: each gnome&apos;s sheet says which. Cosmetic only: same ball, same physics. Not an investment, no promise of value or resale. The shop is for adults (18+); playing stays free for everyone. Earned gnomes are free: prove the feat on the course. They can&apos;t be bought or sold.</p>
      </details>
      {open && c && (
        <GnomeSheet g={open} shop={shop} chain={chain} c={c} account={account} region={region === true} now={now} wallet={wallet} onConnect={onConnect}
          onClose={() => onView({ who: view.who })} playing={playing} worn={wornSkin} onPlay={onPlay} onRound={onRound} onTheirs={(who) => onView({ who })} onChanged={mineLoad}
          look={look} onLook={onLook} series={series} albumNote={albumNote} />
      )}
      {earned && (
        <Sheet label={earned.name} onClose={() => onView({ who: view.who })} className="gsheet">
          <div className="gsheet__head"><EarnedTile /><div className="gsheet__id"><TierChip tier="earned" /><h2>{earned.name}</h2></div></div>
          <p className="gsheet__line">{earned.line}</p>
          <p className="gsheet__fine">Earned in play: {UNLOCKS[earned.unlock as UnlockId]?.need || "a feat on the course"}. Free: the chain proves the feat. It can&apos;t be bought or sold.</p>
          <div className="gsheet__foot"><Button variant="gold" className="btn--wide" onClick={() => (onView({ who: view.who }), onRound(cup || undefined))}>{cup ? `Play ${cup === "town" ? "" : "the "}${CUP_NAMES[cup]}` : "Play a round"}</Button></div>
        </Sheet>
      )}
    </FrontScreen>
  );
}
