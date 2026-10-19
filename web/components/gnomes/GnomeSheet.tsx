"use client";

// A gnome, in the game's own sheet (ui.tsx Sheet): who he is and his one
// action; for one on sale, the order before the wallet opens (its total
// first, every term, the two boxes over the button that names the obligation
// to pay: legal.ts), then the wallet (lib/adena.ts sendGnome, gnokey behind a
// tap), the chain read back, and the moment he is yours (his portrait turns
// once, his place in the series said) with the receipt. Not connected, his
// button connects Adena and goes on to the order. A step changes the sheet's
// content, never opens another. One gnome, one call (Buy(id)). He is drawn in
// the look the shop shows (his 3D portrait, or the chain's), the switch under
// his picture, the one place it is.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Sheet } from "@/components/ui";
import { buttonClass } from "@/components/button";
import { GnokeyTx } from "@/components/Gnokey";
import { messageOf } from "@/components/common";
import { ADENA_URL, GNOT_URL } from "@/lib/network";
import { hasAdena, onOurNode, resultOf, PRICE, type SendError } from "@/lib/adena";
import { sendGnome, gnokeyGnome, gnomeCall, GNOME_TX } from "@/lib/gnomes/tx";
import { BYTE_PRICE, errorKind, wait, type Chain } from "@/lib/chain";
import { worldName } from "@/lib/card";
import { traitRows, type Listed } from "@/lib/gnomes/catalogue";
import { decode } from "@/lib/gnomes/codec";
import { bill, gnot, landing, whyNot, shareWords, type CanBuy, type Collection, type GnomeRow, type Shop } from "@/lib/gnomes/shop";
import { BOX_A, BOX_B, LINKS, SIGN_NOTE, TRUST, chainCosts, orderButton, parLine, receipt, review } from "@/lib/gnomes/legal";
import { tokenSkin } from "@/lib/gnomes/wear";
import { portraitsOf, type Look } from "@/lib/gnomes/onchain";
import { LookSwitch, ShareOne, TierChip, Tile, tierName } from "./parts";

type Account = { address: string; chainId: string };

/** A chain's own figures for a bill (its gas and storage prices, its id): read once for each chain (the shop's, for the
 *  visit), a read that failed read again the next time; the balance and Adena's node are read each time. */
const fixed = new WeakMap<Chain, Promise<{ price: number; storage: number; chainId: string | null }>>();
function chainFigures(chain: Chain) {
  let got = fixed.get(chain);
  if (!got) {
    let failed = false;
    const or = <T,>(read: Promise<T>, none: T) => read.catch(() => ((failed = true), none));
    got = Promise.all([or(chain.gasPrice(), PRICE), or(chain.storagePrice(), BYTE_PRICE), or(chain.chainId(), null)]).then(([price, storage, chainId]) => {
      if (failed) fixed.delete(chain);
      return { price, storage, chainId };
    });
    fixed.set(chain, got);
  }
  return got;
}
type Step =
  | { at: "view" } | { at: "review"; note?: ReactNode } | { at: "sign" } | { at: "read"; hash: string; height: number }
  | { at: "done"; hash: string; height: number; when: number | null } | { at: "receipt"; hash: string; when: number | null }
  | { at: "taken" } | { at: "unsure"; hash?: string; why: string };

interface Props {
  g: Listed; shop: Shop; chain: Chain; c: Collection; account: Account | null; region: boolean; now: number;
  wallet: { busy: boolean; error: string | null }; onConnect: () => void; onClose: () => void;
  /** the gnome played (a skin id): his is "t<id>" */
  playing: string; worn: string | null;
  onPlay: (skinId: string) => void; onTheirs: (owner: string) => void;
  /** to the holes, for a round (a players' window asks one saved on-chain) */
  onRound: () => void;
  /** after a buy or an equip: read the player's gnomes again */
  onChanged: () => void;
  /** how he is drawn (the shop's look), and the switch to the other */
  look: Look; onLook: (l: Look) => void;
  /** his place in the series ("#104 · the only Legendary of Garden · 1 of 720": collection.ts seriesLine) */
  series: string;
  /** once he is the player's: what he brings their album ("Garden 5/104 · 3 more points for Silver"), null not read */
  albumNote: string | null;
}

export default function GnomeSheet({ g, shop, chain, c, account, region, now, wallet, onConnect, onClose, playing, worn, onPlay, onTheirs, onRound, onChanged, look, onLook, series, albumNote }: Props) {
  const me = account && account.address;
  const [row, setRow] = useState<GnomeRow | null>(null);
  const [unread, setUnread] = useState(false); // (the gnome's read failed: said, never a Buy greyed out with no reason)
  const [can, setCan] = useState<CanBuy | null>(null);
  const [step, setStep] = useState<Step>({ at: "view" });
  const [ticks, setTicks] = useState({ a: false, b: false });
  const boxA = useRef<HTMLInputElement>(null), boxB = useRef<HTMLInputElement>(null);
  // the order button pressed before both boxes: the first one left, brought into view and focused (never ticked for them)
  const toBox = () => {
    const el = (!ticks.a ? boxA : boxB).current;
    if (el) (el.scrollIntoView({ block: "center", behavior: "smooth" }), el.focus({ preventScroll: true }));
  };
  // the bill's figures: read with the gnome (his price's chain costs) and again when the order is reviewed (the balance)
  const [costs, setCosts] = useState<{ price: number; storage: number; balance: number | null; chainId: string | null; ours: boolean | null } | null>(null);
  // Equip: "" not asked, "busy" in Adena, "done", else what went wrong
  const [equip, setEquip] = useState("");
  // Connect Adena to buy pressed: the order once the wallet answers and the chain says he can be bought
  const [want, setWant] = useState(false);

  const readCosts = () =>
    void Promise.all([chainFigures(chain), me ? chain.balance(me) : Promise.resolve(null), onOurNode(chain.rpc)])
      .then(([f, balance, ours]) => setCosts({ ...f, balance, ours }));
  const read = () => {
    setUnread(false);
    void shop.gnome(g.id).then(setRow, () => (setRow(null), setUnread(true)));
    if (me) void shop.canBuy(me, [g.id]).then(setCan, () => setCan(null));
    readCosts();
  };
  useEffect(read, [g.id, me]); // eslint-disable-line react-hooks/exhaustive-deps -- (shop: the same for the visit)

  const owner = row && row.owner, mine = !!me && owner === me, skin = tokenSkin({ id: String(g.id), name: g.name, traits: g.traits });
  const price = row ? row.price : 0;
  const tx = gnomeCall.buy([g.id], Math.max(1, price));
  const cost = costs && bill({ price, bytes: tx.bytes, storagePrice: costs.storage, gas: tx.gas, gasPrice: costs.price, balance: costs.balance });
  const order = me && cost && { name: g.name, id: g.id, tier: g.tier, n: 1, price, deposit: cost.deposit, fee: cost.fee, total: cost.total, address: me, closesAt: c.closesAt, now };
  const why = can && row && !row.sold ? whyNot(can, c, g, now) : null;

  const toReview = () => (setStep({ at: "review" }), readCosts());
  // connected for the order: on to it once the chain has said he can be bought (else his sheet says why)
  useEffect(() => {
    if (!want || !me || !row || !can) return;
    setWant(false);
    if (!row.sold && !whyNot(can, c, g, now)) toReview();
  }, [want, me, row, can]); // eslint-disable-line react-hooks/exhaustive-deps -- (the rest: this gnome's, this visit's)
  // someone was first: who, read again (their gnomes a tap away)
  const taken = () => (setStep({ at: "taken" }), read());

  async function buy() {
    if (!me || !costs) return;
    setStep({ at: "sign" });
    try {
      const r = await sendGnome(tx, { address: me, realm: shop.realm, price: costs.price, chainId: costs.chainId, rpc: chain.rpc });
      if (!r) throw Object.assign(new Error("Adena said nothing back."), { maybe: true });
      setStep({ at: "read", hash: r.hash, height: r.height });
      await readBack(r.hash, r.height);
    } catch (e) {
      const err = e as SendError;
      if (err.cancelled) setStep({ at: "review", note: <p className="note note--bad" role="status">Cancelled in Adena: nothing was sent.</p> });
      else if (/already sold/.test(err.message)) taken();
      else if (err.maybe) setStep({ at: "unsure", hash: err.hash, why: err.message });
      else setStep({ at: "review", note: <p className="note note--bad" role="alert">{err.message}</p> });
    }
  }
  // the chain's word: the transaction's result by its hash, else the owner it now shows
  async function readBack(hash: string, height: number) {
    for (let i = 0; i < 6; i++) {
      try {
        const got = await resultOf(chain, hash);
        const now = await shop.gnome(g.id);
        if ((got != null && got.includes(String(g.id))) || (now && now.owner === me)) {
          const when = await chain.blockTime(height).then((ms) => Math.floor(ms / 1000), () => null); // (the receipt says it in seconds)
          setRow(now);
          onChanged();
          return setStep({ at: "done", hash, height, when });
        }
      } catch (e) {
        if (errorKind(e) === "chain") return /already sold/.test(messageOf(e)) ? taken() : setStep({ at: "unsure", hash, why: messageOf(e) });
      }
      await wait(1500);
    }
    setStep({ at: "unsure", hash, why: "The chain has not shown it yet." });
  }
  // no hash to read (the wallet gave none): the gnome read again, a few times: ours, another's, or nothing landed
  async function settle() {
    if (!me) return;
    setStep({ at: "read", hash: "", height: 0 });
    for (let i = 0; i < 6; i++) {
      const now = await shop.gnome(g.id).catch(() => undefined);
      if (now === undefined) return setStep({ at: "unsure", why: "The chain did not answer." });
      const at = landing(now, me);
      if (at === "mine") return (setRow(now), onChanged(), setStep({ at: "done", hash: "", height: 0, when: null }));
      if (at === "taken") return taken();
      await wait(1500);
    }
    setStep({ at: "review", note: <p className="note note--warn" role="status">Nothing landed: {g.name} is still on sale. You can order again.</p> });
  }

  async function showEveryone() {
    if (!me) return;
    setEquip("busy");
    try {
      const p = await chain.gasPrice().catch(() => PRICE);
      await sendGnome(gnomeCall.equip(g.id), { address: me, realm: shop.realm, price: p, chainId: await chain.chainId().catch(() => null), rpc: chain.rpc });
      setEquip("done");
      onChanged();
    } catch (e) {
      setEquip((e as SendError).cancelled ? "" : messageOf(e));
    }
  }

  const onChain = look === "chain" ? portraitsOf(chain) : null;
  // his picture, and beside it (stacked on a phone) who he is: his tier and number on one line (or his place in the
  // series), his name (the sheet's title), what is said of him (say), the look switch (in his first view alone)
  const head = (small = false, title: ReactNode = g.name, swap = false, meta: ReactNode = <>#{g.id} · {worldName(g.home)}</>, say: ReactNode = null) => (
    <div className={`gsheet__head${small ? " gsheet__head--small" : ""}`}>
      <Tile id={g.id} tier={g.tier} lazy={false} never={!!row && row.closed} onChain={onChain} />
      <div className="gsheet__id">
        {!small && <span className="gsheet__meta"><TierChip tier={g.tier} /><span>{meta}</span></span>}
        <h2>{title}</h2>
        {say && <p className="gsheet__line">{say}</p>}
        {swap && <LookSwitch look={look} onLook={onLook} />}
      </div>
    </div>
  );
  const share = <ShareOne text={`${g.name}, gnome #${g.id} of Gnogolf`} link={`g/${g.id}/`} />;
  const theirs = (who: string) => <button className="linkish" onClick={() => onTheirs(who)}>Their gnomes →</button>;
  const close = step.at === "sign" || step.at === "read" ? () => {} : onClose; // (no closing while Adena is open)

  let body: ReactNode;
  switch (step.at) {
    case "view": {
      const traits = decode(g.traits);
      body = (
        <>
          {head(false, g.name, true, undefined, g.line)}
          {/* what is said of him (above), his traits and his share, then his one action in the footer, last */}
          {row && row.closed ? (
            <p className="gsheet__fine"><b>Never made.</b> The sale closed before this gnome found a player.</p>
          ) : owner && !mine ? (
            <p className="gsheet__fine">Found a player. {theirs(owner)}</p>
          ) : !mine && !unread && region ? (
            <div className="gsheet__offer">
              {/* his price, its chain costs from the order's own estimate, the golf number it is */}
              {row && <p className="gsheet__price">{gnot(price)} GNOT <small>{cost ? chainCosts(cost) : "+ chain costs"}</small></p>}
              {row && parLine(g.tier, price) && <p className="gsheet__par">{parLine(g.tier, price)}</p>}
              <ul className="trust">{TRUST.slice(0, 2).map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ) : null}
          {traits && (
            <details className="more">
              <summary>Traits</summary>
              <dl className="review">{traitRows(traits).map((r, i) => <Term key={`${r.trait}-${i}`} k={r.trait} v={r.value} />)}</dl>
            </details>
          )}
          {/* Share beside the one action (a third of its width, its height), alone where there is none */}
          {(row && row.closed) || !(mine || (!owner && (unread || region))) ? share : null}
          {row && row.closed ? null : mine ? (
            <div className="gsheet__foot">
              <div className="gsheet__act">{share}<Button variant="gold" className="btn--wide" onClick={() => (onPlay(skin.id), onClose())}>{playing === skin.id ? `Playing ${g.name}` : `Play with ${g.name}`}</Button></div>
              {worn !== skin.id && region && (
                <button className="linkish" disabled={equip === "busy"} onClick={() => void showEveryone()}>
                  {equip === "done" ? "Everyone sees this gnome now" : equip === "busy" ? "Sign in Adena…" : `Show ${g.name} to everyone · about ${(Math.ceil((GNOME_TX.equip.gas * PRICE * 1.5) / 1e4) / 100).toFixed(2)} GNOT`}
                </button>
              )}
              {equip && equip !== "busy" && equip !== "done" && <p className="gsheet__fine" role="alert">{equip}</p>}
              {equip === "done" && <ShareOne text={shareWords.equipped(g.name, g.home)} link={`g/${g.id}/`} label={`Your rivals will see ${g.name}`} />}
              <p className="gsheet__fine">Playing any gnome you hold is free. {worn === skin.id ? "Everyone sees this one on your ball." : ""}</p>
            </div>
          ) : owner ? null : unread ? (
            <div className="gsheet__foot"><p className="note note--bad" role="alert">The chain did not answer.</p><div className="gsheet__act">{share}<Button variant="primary" className="btn--wide" onClick={read}>Try again</Button></div></div>
          ) : region && !account && hasAdena() ? (
            <div className="gsheet__foot">
              {want && wallet.error && <p className="note note--bad" role="alert">{wallet.error}</p>}
              <div className="gsheet__act">{share}<Button variant="chain" className="btn--wide" disabled={!row || wallet.busy} onClick={() => (setWant(true), onConnect())}>{wallet.busy ? "Waiting for Adena…" : "Connect Adena to buy"}</Button></div>
            </div>
          ) : region ? (
            <div className="gsheet__foot">
              <div className="gsheet__act">{share}<Button variant="chain" className="btn--wide" disabled={!row || !!why || want} onClick={toReview}>{why ? why.button : `Buy ${g.name}`}</Button></div>
              {why && why.note && <p className="gsheet__fine">{why.note}</p>}
              {why && why.play && <Button variant="gold" className="btn--wide" onClick={() => (onClose(), onRound())}>Play a round →</Button>}
            </div>
          ) : null}
        </>
      );
      break;
    }
    case "review": {
      const wrongNet = !!(account && costs && costs.chainId && account.chainId !== costs.chainId) || (costs && costs.ours === false);
      // the order for reading: its total first and large, what is paid, then the terms a step smaller; the two boxes in
      // the footer over the button, in view from the first screen with it (every term scrolls above them)
      const terms = order && review(order);
      body = (
        <>
          {head(true, "Review your order")}
          {step.note}
          {!account ? (
            <>
              <p className="gsheet__line">{hasAdena() ? "Connect Adena, the gno.land wallet, to review your order." : "Buying takes a gno.land wallet."}</p>
              {wallet.error && <p className="note note--bad" role="alert">{wallet.error}</p>}
              <Gnokey chain={chain} shop={shop} id={g.id} price={price} />
              <div className="gsheet__foot">
                {hasAdena() ? <Button variant="primary" className="btn--wide" disabled={wallet.busy} onClick={onConnect}>{wallet.busy ? "Waiting for Adena…" : "Connect Adena"}</Button>
                  : <a className={buttonClass({ variant: "primary" }, "btn--wide")} href={ADENA_URL} target="_blank" rel="noopener noreferrer">Install Adena ↗</a>}
              </div>
            </>
          ) : !order || !terms ? (
            <p className="gsheet__line">Reading the costs…</p>
          ) : (
            <>
              <p className="review__total"><span>{terms.total[0]}</span><b>{terms.total[1]}</b></p>
              {([["What you pay", terms.pay, ""], ["Terms", terms.terms, " review__group--terms"]] as const).map(([label, rows, more]) => (
                <section key={label} className={`review__group${more}`} aria-label={label}><h3>{label}</h3><dl className="review">{rows.map(([k, v]) => <Term key={k} k={k} v={v} />)}</dl></section>
              ))}
              <p className="legal"><a href={LINKS.terms} target="_blank" rel="noopener noreferrer">Terms of Sale</a> · <a href={LINKS.seller} target="_blank" rel="noopener noreferrer">Seller information (特定商取引法に基づく表記)</a> · <a href={LINKS.privacy} target="_blank" rel="noopener noreferrer">Privacy</a></p>
              <div className="gsheet__foot gsheet__foot--order">
                <label className="box"><input ref={boxA} type="checkbox" checked={ticks.a} onChange={(e) => setTicks((t) => ({ ...t, a: e.target.checked }))} /><span>{BOX_A}</span></label>
                <label className="box"><input ref={boxB} type="checkbox" checked={ticks.b} onChange={(e) => setTicks((t) => ({ ...t, b: e.target.checked }))} /><span>{BOX_B}</span></label>
                {wrongNet ? (
                  <><p className="note note--warn" role="status">Adena is on another network. Pick <b>{costs && costs.chainId}</b> in Adena: nothing was sent.</p>
                    <Button variant="primary" className="btn--wide" onClick={toReview}>Check again</Button></>
                ) : cost && cost.short ? (
                  <><p className="note note--warn" role="status"><b>{gnot(cost.short)} GNOT</b> to go.</p>
                    <a className={buttonClass({ variant: "primary" }, "btn--wide")} href={GNOT_URL} target="_blank" rel="noopener noreferrer">Get GNOT ↗</a></>
                ) : (
                  <>{!(ticks.a && ticks.b) && <p className="gsheet__fine" id="order-ticks" role="status">Tick both boxes above to order</p>}
                    {/* off, but pressable: a press finds the box left (a disabled button hears nothing) */}
                    <Button variant="chain" className="btn--wide" aria-disabled={ticks.a && ticks.b ? undefined : true} aria-describedby={ticks.a && ticks.b ? undefined : "order-ticks"}
                      onClick={() => (ticks.a && ticks.b ? void buy() : toBox())}>
                      {orderButton(order.total)}
                    </Button></>
                )}
                <p className="gsheet__fine">{SIGN_NOTE}</p>
                {ticks.a && ticks.b && <Gnokey chain={chain} shop={shop} id={g.id} price={price} />}
              </div>
            </>
          )}
        </>
      );
      break;
    }
    case "sign": case "read":
      body = <div className="gsheet__head gsheet__hop" role="status"><Tile id={g.id} tier={g.tier} lazy={false} onChain={onChain} /><h2>{step.at === "sign" ? "Sign in Adena…" : "Reading it back from the chain…"}</h2></div>;
      break;
    case "done":
      body = (
        <>
          {head(false, `${g.name}'s yours!`, false, series)}
          {albumNote && <p className="gsheet__line">{albumNote}</p>}
          <div className="gsheet__foot">
            <Button variant="gold" className="btn--wide" onClick={() => (onPlay(skin.id), onClose())}>Play with {g.name}</Button>
            <ShareOne text={shareWords.bought(g.name, g.id)} link={`g/${g.id}/`} label="Show your gnome" />
            <button className="linkish" onClick={() => setStep({ at: "receipt", hash: step.hash, when: step.when })}>Your receipt: print or save it</button>
          </div>
        </>
      );
      break;
    case "receipt":
      body = (
        <>
          {head(true, "Your receipt")}
          <div className="receipt" id="receipt">
            <h3>Receipt: Gnogolf gnome purchase</h3>
            {order && receipt({ ...order, at: step.when || 0, hash: step.hash, realm: shop.realm, chainId: (costs && costs.chainId) || "", consents: [BOX_A, BOX_B] }).map((l) => <p key={l}>{l}</p>)}
          </div>
          <div className="gsheet__foot"><Button variant="primary" className="btn--wide" onClick={() => window.print()}>Print or save as PDF</Button></div>
        </>
      );
      break;
    case "taken":
      body = <>{head(true)}<p className="note note--bad" role="alert">Someone took {g.name} a moment before you. <b>Nothing was sent.</b></p>{owner && owner !== me && <p className="gsheet__fine">{theirs(owner)}</p>}<div className="gsheet__foot"><Button variant="primary" className="btn--wide" onClick={onClose}>Pick another</Button></div></>;
      break;
    case "unsure":
      body = (
        <>
          {head(true)}
          <p className="note note--warn" role="alert">Sent, but not confirmed yet. <b>Don&apos;t buy again</b>: it would pay twice.</p>
          <div className="gsheet__foot">
            <Button variant="primary" className="btn--wide" onClick={() => (step.hash ? (setStep({ at: "read", hash: step.hash, height: 0 }), void readBack(step.hash, 0)) : void settle())}>Check again</Button>
            <p className="gsheet__fine">{step.why}</p>
          </div>
        </>
      );
  }
  return (
    <Sheet label={`${g.name}, gnome number ${g.id}, ${tierName(g.tier)}`} onClose={close} className={`gsheet${step.at === "done" ? " gsheet--done" : ""}`}>
      {body}
    </Sheet>
  );
}

/** A term of a list: its label and its value. */
const Term = ({ k, v }: { k: string; v: string }) => <><dt>{k}</dt><dd>{v}</dd></>;

/** The same Buy with gnokey, built from the realm's own call (lib/adena.ts gnokeyGnome), never written by hand. */
function Gnokey({ chain, shop, id, price }: { chain: Chain; shop: Shop; id: number; price: number }) {
  if (!price) return null;
  const call = gnomeCall.buy([id], price);
  return (
    <GnokeyTx chain={chain} summary="Buy with gnokey instead" why="The gnome's price is not known yet."
      plan={(at) => [gnokeyGnome(call, { realm: shop.realm, price: at.price, chainId: at.chainId, rpc: chain.rpc })].filter(Boolean)}
      web={<>Or in a browser, on gno.land: <a href={chain.helpURL(shop.realm, "Buy")} target="_blank" rel="noopener noreferrer">the realm&apos;s Buy ↗</a></>} />
  );
}
