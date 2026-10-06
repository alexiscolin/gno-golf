"use client";

// The gnome shop: the gallery, the one screen it adds to the game (the game's
// own front screen: About.tsx FrontScreen), its views a tap apart (on sale,
// a player's own, all; a player's gnomes, read-only), and a gnome in a sheet
// over it (GnomeSheet). Loaded only when it is opened (Golf.tsx, behind
// NEXT_PUBLIC_GNOMES), with its styles: the title and the holes' pages carry
// none of it. Everything it shows is read: the catalogue the site serves, the
// realm's Collection, Sold, GnomesOf and Worn, the region.
import "@/app/gnomes.css";
import { useEffect, useMemo, useState } from "react";
import { FrontScreen } from "@/components/About";
import { Button, Segmented, Sheet } from "@/components/ui";
import Share from "@/components/Share";
import { UNLOCKS, type UnlockId } from "@/lib/card";
import type { Chain } from "@/lib/chain";
import type { Listed } from "@/lib/gnomes/catalogue";
import { cardFact, makeShop, nowRow, shelf, shareWords, teamOrder, utcDate, PAGE, type Collection, type View, type Worn } from "@/lib/gnomes/shop";
import { shopInRegion } from "@/lib/gnomes/geo";
import { know, tokenSkin } from "@/lib/gnomes/wear";
import { served as catalogue, type Served } from "@/lib/gnomes/served";
import type { Home } from "@/lib/gnomes/vocab";
import { Closes, GnomeCard, BlankCard, TierChip } from "./parts";
import GnomeSheet from "./GnomeSheet";

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
}

export default function ShopScreen({ chain, account, wallet, onConnect, view, onView, onBack, onAbout, playing, onPlay, onRace }: ShopProps) {
  const shop = useMemo(() => makeShop(chain), [chain]);
  const me = account && account.address;
  const [cat, setCat] = useState<Served | null>(null);
  const [c, setC] = useState<Collection | null>(null);
  const [sold, setSold] = useState<((id: number) => boolean) | null>(null);
  const [error, setError] = useState(false);
  const [region, setRegion] = useState<boolean | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [worn, setWorn] = useState<Worn | null>(null);
  const [theirs, setTheirs] = useState<{ who: string; ids: number[]; name: string } | null>(null);
  const [now, setNow] = useState(() => Math.floor(chain.now() / 1000));
  const [f, setF] = useState<{ view: View; tier?: Listed["tier"]; home?: Home; text: string }>({ view: "sale", text: "" });
  const [shown, setShown] = useState(PAGE);

  // the sale's figures, again on coming back to the page: a closing date moved, a gnome taken
  const load = () => {
    setError(false);
    void Promise.all([catalogue(), shop.collection(), shop.sold()])
      .then(([k, col, s]) => (setCat(k), setC(col), setSold(() => s), setNow(Math.floor(chain.now() / 1000))))
      .catch(() => setError(true));
  };
  useEffect(() => {
    load();
    void shopInRegion().then(setRegion);
    addEventListener("focus", load);
    return () => removeEventListener("focus", load);
  }, [shop]); // eslint-disable-line react-hooks/exhaustive-deps -- (load reads the same shop)
  // the player's own: what they hold and what everyone sees them wear
  const mineLoad = () => {
    if (!me) return (setMine([]), setWorn(null));
    void shop.allOf(me).then((rows) => setMine(rows.map((r) => Number(r.id))), () => {});
    void shop.worn(me).then(setWorn, () => setWorn(null));
  };
  useEffect(mineLoad, [shop, me]);
  // a player's gnomes, read-only
  useEffect(() => {
    if (!view.who || view.who === me) return setTheirs(null);
    const who = view.who;
    void Promise.all([shop.allOf(who), chain.nameOf(who).catch(() => "")]).then(([rows, name]) => setTheirs({ who, ids: rows.map((r) => Number(r.id)), name }), () => setTheirs({ who, ids: [], name: "" }));
  }, [shop, chain, view.who, me]);

  const mineSet = useMemo(() => new Set(mine), [mine]);
  const seen = useMemo(() => (c && sold ? { c, sold, mine: mineSet, now } : null), [c, sold, mineSet, now]);
  const closed = !!c && !!c.series[0] && c.series[0].closed;
  const viewing = theirs ? "theirs" : view.who === me && me ? "mine" : f.view;
  const list = useMemo(() => {
    if (!cat || !seen) return [];
    if (theirs) return theirs.ids.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g);
    const v: View = viewing === "mine" ? "mine" : f.view;
    const out = shelf(cat.gnomes, { view: v, tier: f.tier, home: f.home, text: f.text }, seen).list;
    return v === "mine" ? teamOrder(out.map((g) => ({ ...g, id: String(g.id) }))).map((g) => ({ ...g, id: Number(g.id) })) : out;
  }, [cat, seen, theirs, viewing, f]);
  useEffect(() => setShown(PAGE), [f, viewing]);

  const open = view.open && cat ? cat.gnomes.find((g) => String(g.id) === view.open) : undefined;
  const earned = view.open && cat && !open ? cat.earned.find((e) => e.unlock === view.open) : undefined;
  const row = c && sold && cat ? nowRow(c, sold, cat.gnomes, now) : null;
  const nameOf = (id: string) => (id.startsWith("t") ? cat?.gnomes.find((g) => `t${g.id}` === id)?.name || "a gnome" : "a gnome of the game");
  const playingName = nameOf(playing), wornSkin = worn ? tokenSkin(worn).id : null;

  // the gnomes this player holds are known to the game (their faces, the picker): drawn from their traits
  useEffect(() => {
    if (cat && mine.length) void know(mine.map((id) => cat.gnomes.find((g) => g.id === id)).filter((g): g is Listed => !!g).map((g) => ({ id: String(g.id), name: g.name, traits: g.traits })));
  }, [cat, mine]);

  const title = theirs ? `${theirs.name || "Their"}'s gnomes` : viewing === "mine" ? (mine.length ? `Your team of ${mine.length}` : "Your gnomes") : "Who's on the ball?";
  const eyebrow = theirs ? "Their gnomes" : viewing === "mine" ? "My gnomes" : "The gnomes";
  const views: (readonly [View, string])[] = [[closed ? "made" : "sale", closed ? "Made" : "On sale"], ...(me ? [["mine", "Mine"] as const] : []), ["all", `All ${cat ? cat.gnomes.length : ""}`.trim()]];

  if (region === false)
    return (
      <FrontScreen className="shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow="The gnomes" title="Not here">
        <p className="gempty">The gnome shop is not offered in your region. The game stays free to play.</p>
      </FrontScreen>
    );
  return (
    <FrontScreen className="shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={eyebrow} title={title}>
      {!theirs && viewing !== "mine" && c && c.closesAt > 0 && !closed && <Closes at={c.closesAt} now={now} />}
      {/* the wave of the moment, or the sale's end: one panel, one line of numbers */}
      {!theirs && viewing !== "mine" && row && row.at !== "none" && (
        <section className="wave" aria-label="The sale">
          {row.at === "closed" ? (
            <div className="wave__head"><span>Closed: {row.made} made · {row.never} never made</span></div>
          ) : (
            <>
              <div className="wave__head">
                <span>Wave {row.wave.n}{row.wave.home ? ` · ${row.wave.home.charAt(0).toUpperCase() + row.wave.home.slice(1)}` : ""}</span>
                <span>{row.at === "soldout" ? `All ${row.wave.size} found a player` : `${row.wave.sold} of ${row.wave.size} found a player`}</span>
              </div>
              <div className="track" aria-hidden="true"><i style={{ width: `${row.wave.size ? (100 * row.wave.sold) / row.wave.size : 0}%` }} /></div>
              {row.at === "teaser" && <p className="wave__note">Opens {utcDate(row.wave.row.start, now)}.</p>}
              {row.at === "players" && <p className="wave__note">Players first until {utcDate(row.wave.row.playersUntil, now, true)}: save one round on-chain to buy now.</p>}
              {row.at === "paused" && <p className="wave__note">Paused for a moment: the sale picks up where it stopped.</p>}
            </>
          )}
        </section>
      )}
      {/* the player's own: who sees what, and their team to share */}
      {viewing === "mine" && me && mine.length > 0 && (
        <>
          <p className="wave__note" style={{ textAlign: "center" }}>{wornSkin === playing ? `Everyone sees ${playingName}` : `You play ${playingName} · everyone sees ${worn ? worn.name : "a gnome of the game"}`}</p>
          <Share text={shareWords.team(mine.length, worn ? worn.name : list[0]?.name || "")} link={`g/?who=${me}`} label="Share my team" kind="share" />
        </>
      )}
      {theirs && <Button variant="gold" className="btn--cta" onClick={() => onRace(theirs.who)}>Race their ghost</Button>}
      {!theirs && (
        <div className="gfilters">
          <Segmented label="Which gnomes" options={views} value={viewing === "mine" ? "mine" : f.view} onChange={(v) => (v === "mine" && me ? onView({ who: me }) : (onView({}), setF((x) => ({ ...x, view: v }))))} />
          <input className="gfilters__search" type="search" placeholder="A name or a number" aria-label="Find a gnome by name or number" value={f.text} onChange={(e) => setF((x) => ({ ...x, text: e.target.value }))} />
          <details className="more">
            <summary>More filters</summary>
            <div className="gfilters">
              <select className="gfilters__search" aria-label="Tier" value={f.tier || ""} onChange={(e) => setF((x) => ({ ...x, tier: (e.target.value || undefined) as Listed["tier"] | undefined }))}>
                {([["", "Every tier"], ["common", "Common"], ["rare", "Rare"], ["epic", "Epic"], ["legendary", "Legendary"]] as const).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <select className="gfilters__search" aria-label="World" value={f.home || ""} onChange={(e) => setF((x) => ({ ...x, home: (e.target.value || undefined) as Home | undefined }))}>
                <option value="">Every world</option>
                {[...new Set((cat ? cat.gnomes : []).map((g) => g.home))].map((h) => <option key={h} value={h}>{h.charAt(0).toUpperCase() + h.slice(1)}</option>)}
              </select>
            </div>
          </details>
        </div>
      )}
      {error ? (
        <div className="gempty" role="alert"><p>The chain did not answer.</p><Button variant="primary" onClick={load}>Try again</Button></div>
      ) : !seen || !cat ? (
        <ul className="gshelf" aria-busy="true">{Array.from({ length: 12 }, (_, i) => <li key={i}><BlankCard /></li>)}</ul>
      ) : !list.length ? (
        <div className="gempty">
          {viewing === "mine" ? <p>None yet. You play with the free gnomes and the ones you earn on the course.</p> : theirs ? <p>No gnome yet.</p> : <p>No gnome like that one.</p>}
          {!theirs && viewing !== "mine" && <Button variant="secondary" onClick={() => setF({ view: f.view, text: "" })}>Clear the filters</Button>}
        </div>
      ) : (
        <>
          <ul className="gshelf">
            {list.slice(0, shown).map((g) => (
              <li key={g.id}><GnomeCard g={g} fact={cardFact(g, seen)} mine={mineSet.has(g.id)} never={closed && !sold!(g.id)} onOpen={() => onView({ ...view, open: String(g.id) })} /></li>
            ))}
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
          onClose={() => onView({ who: view.who })} playing={playing} worn={wornSkin} onPlay={onPlay} onTheirs={(who) => onView({ who })} onChanged={mineLoad} />
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
