"use client";

// A gnome, in the game's own sheet (ui.tsx Sheet): who he is and his one
// action; for one on sale, the order before the wallet opens (every term,
// the two boxes, the button that names the obligation to pay: legal.ts),
// then the wallet (lib/adena.ts sendGnome, gnokey behind a tap), the chain
// read back, and the moment he is yours with the receipt. A step changes the
// sheet's content, never opens another. One gnome, one call (Buy(id)).
import { useEffect, useState, type ReactNode } from "react";
import { Button, Sheet } from "@/components/ui";
import Share from "@/components/Share";
import { GnokeyTx } from "@/components/Gnokey";
import { messageOf } from "@/components/common";
import { ADENA_URL, GNOT_URL } from "@/lib/network";
import { hasAdena, onOurNode, resultOf, PRICE, type SendError } from "@/lib/adena";
import { sendGnome, gnokeyGnome, gnomeCall, blockTime, GNOME_TX } from "@/lib/gnomes/tx";
import { errorKind, type Chain } from "@/lib/chain";
import { traitRows, type Listed } from "@/lib/gnomes/catalogue";
import { decode } from "@/lib/gnomes/codec";
import { bill, gnot, whyNot, shareWords, type CanBuy, type Collection, type GnomeRow, type Shop } from "@/lib/gnomes/shop";
import { BOX_A, BOX_B, LINKS, SIGN_NOTE, TRUST, orderButton, receipt, review } from "@/lib/gnomes/legal";
import { tokenSkin } from "@/lib/gnomes/wear";
import { TierChip, Tile, tierName } from "./parts";

type Account = { address: string; chainId: string };
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
  /** after a buy or an equip: read the player's gnomes again */
  onChanged: () => void;
}

export default function GnomeSheet({ g, shop, chain, c, account, region, now, wallet, onConnect, onClose, playing, worn, onPlay, onTheirs, onChanged }: Props) {
  const me = account && account.address;
  const [row, setRow] = useState<GnomeRow | null>(null);
  const [can, setCan] = useState<CanBuy | null>(null);
  const [step, setStep] = useState<Step>({ at: "view" });
  const [ticks, setTicks] = useState({ a: false, b: false });
  // the bill's figures, read when the order is reviewed
  const [costs, setCosts] = useState<{ price: number; storage: number; balance: number | null; chainId: string | null; ours: boolean | null } | null>(null);
  // Equip: "" not asked, "busy" in Adena, "done", else what went wrong
  const [equip, setEquip] = useState("");

  const read = () => {
    void shop.gnome(g.id).then(setRow, () => setRow(null));
    if (me) void shop.canBuy(me, [g.id]).then(setCan, () => setCan(null));
  };
  useEffect(read, [g.id, me]); // eslint-disable-line react-hooks/exhaustive-deps -- (shop: the same for the visit)

  const owner = row && row.owner, mine = !!me && owner === me, skin = tokenSkin({ id: String(g.id), name: g.name, traits: g.traits });
  const price = row ? row.price : 0;
  const tx = gnomeCall.buy([g.id], Math.max(1, price));
  const cost = costs && bill({ price, bytes: tx.bytes, storagePrice: costs.storage, gas: tx.gas, gasPrice: costs.price, balance: costs.balance });
  const deposit = cost ? cost.lines[1][1] : 0, fee = cost ? cost.lines[2][1] : 0;
  const order = me && cost && { name: g.name, id: g.id, tier: g.tier, n: 1, price, deposit, fee, address: me, closesAt: c.closesAt, now };

  const toReview = () => {
    setStep({ at: "review" });
    void Promise.all([
      chain.gasPrice().catch(() => PRICE), chain.storagePrice().catch(() => 100),
      me ? chain.balance(me) : Promise.resolve(null), chain.chainId().catch(() => null), onOurNode(chain.rpc),
    ]).then(([p, storage, balance, chainId, ours]) => setCosts({ price: p, storage, balance, chainId, ours }));
  };

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
      else if (/already sold/.test(err.message)) setStep({ at: "taken" });
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
          const when = await blockTime(chain.rpc, height);
          setRow(now);
          onChanged();
          return setStep({ at: "done", hash, height, when });
        }
      } catch (e) {
        if (errorKind(e) === "chain") return /already sold/.test(messageOf(e)) ? setStep({ at: "taken" }) : setStep({ at: "unsure", hash, why: messageOf(e) });
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setStep({ at: "unsure", hash, why: "The chain has not shown it yet." });
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

  const head = (small = false, title: ReactNode = g.name) => (
    <div className={`gsheet__head${small ? " gsheet__head--small" : ""}`}>
      <Tile id={g.id} tier={g.tier} lazy={false} never={!!row && row.closed} />
      {!small && <span className="gsheet__meta"><TierChip tier={g.tier} /> #{g.id} · Wave {g.wave} · {home(g.home)}</span>}
      <h2>{title}</h2>
    </div>
  );
  const why = can && row && !row.sold ? whyNot(can, c, g, now) : null;
  const share = <Share text={shareWords.bought(g.name, g.id)} link={`g/${g.id}/`} label="Show your gnome" what="hole" kind="share" />;
  const close = step.at === "sign" || step.at === "read" ? () => {} : onClose; // (no closing while Adena is open)

  let body: ReactNode;
  switch (step.at) {
    case "view": {
      const traits = decode(g.traits);
      body = (
        <>
          {head()}
          <p className="gsheet__line">{g.line}</p>
          {row && row.closed ? (
            <p className="gsheet__fine"><b>Never made.</b> The sale closed before this gnome found a player.</p>
          ) : mine ? (
            <div className="gsheet__foot">
              <Button variant="gold" className="btn--wide" onClick={() => (onPlay(skin.id), onClose())}>{playing === skin.id ? `Playing ${g.name}` : `Play with ${g.name}`}</Button>
              {worn !== skin.id && region && (
                <button className="linkish" disabled={equip === "busy"} onClick={() => void showEveryone()}>
                  {equip === "done" ? "Everyone sees this gnome now" : equip === "busy" ? "Sign in Adena…" : `Show ${g.name} to everyone · about ${(Math.ceil((GNOME_TX.equip.gas * PRICE * 1.5) / 1e4) / 100).toFixed(2)} GNOT`}
                </button>
              )}
              {equip && equip !== "busy" && equip !== "done" && <p className="gsheet__fine" role="alert">{equip}</p>}
              {equip === "done" && <Share text={shareWords.equipped(g.name, g.home)} link={`g/${g.id}/`} label={`Your rivals will see ${g.name}`} kind="share" />}
              <p className="gsheet__fine">Playing any gnome you hold is free. {worn === skin.id ? "Everyone sees this one on your ball." : ""}</p>
            </div>
          ) : owner ? (
            <p className="gsheet__fine">Found a player. <button className="linkish" onClick={() => onTheirs(owner)}>Their gnomes →</button></p>
          ) : region ? (
            <>
              {row && <p className="gsheet__price">{gnot(price)} GNOT <small>+ a small deposit and fee</small></p>}
              <ul className="trust">{TRUST.slice(0, 2).map((t) => <li key={t}>{t}</li>)}</ul>
              <div className="gsheet__foot">
                <Button variant="secondary" className="btn--wide btn--save" disabled={!row || !!why} onClick={toReview}>{why ? why.button : `Buy ${g.name}`}</Button>
                {why && why.note && <p className="gsheet__fine">{why.note}</p>}
              </div>
            </>
          ) : null}
          {traits && (
            <details className="more">
              <summary>Traits</summary>
              <dl className="review">{traitRows(traits).map((r, i) => <Term key={`${r.trait}-${i}`} k={r.trait} v={r.value} />)}</dl>
            </details>
          )}
          <Share text={`${g.name}, gnome #${g.id} of Gnogolf`} link={`g/${g.id}/`} what="hole" kind="share" />
        </>
      );
      break;
    }
    case "review": {
      const wrongNet = !!(account && costs && costs.chainId && account.chainId !== costs.chainId) || (costs && costs.ours === false);
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
                  : <a className="btn btn--main btn--wide" href={ADENA_URL} target="_blank" rel="noopener noreferrer">Install Adena ↗</a>}
              </div>
            </>
          ) : !order ? (
            <p className="gsheet__line">Reading the costs…</p>
          ) : (
            <>
              <dl className="review" aria-label="Your order">{review(order).map(([k, v]) => <Term key={k} k={k} v={v} />)}</dl>
              <p className="legal"><a href={LINKS.terms} target="_blank" rel="noopener noreferrer">Terms of Sale</a> · <a href={LINKS.seller} target="_blank" rel="noopener noreferrer">Seller information (特定商取引法に基づく表記)</a> · <a href={LINKS.privacy} target="_blank" rel="noopener noreferrer">Privacy</a></p>
              <label className="box"><input type="checkbox" checked={ticks.a} onChange={(e) => setTicks((t) => ({ ...t, a: e.target.checked }))} /><span>{BOX_A}</span></label>
              <label className="box"><input type="checkbox" checked={ticks.b} onChange={(e) => setTicks((t) => ({ ...t, b: e.target.checked }))} /><span>{BOX_B}</span></label>
              {ticks.a && ticks.b && <Gnokey chain={chain} shop={shop} id={g.id} price={price} />}
              <div className="gsheet__foot">
                {wrongNet ? (
                  <><p className="note note--warn" role="status">Adena is on another network. Pick <b>{costs && costs.chainId}</b> in Adena: nothing was sent.</p>
                    <Button variant="primary" className="btn--wide" onClick={toReview}>Check again</Button></>
                ) : cost && cost.short ? (
                  <><p className="note note--warn" role="status"><b>{gnot(cost.short)} GNOT</b> to go.</p>
                    <a className="btn btn--main btn--wide" href={GNOT_URL} target="_blank" rel="noopener noreferrer">Get GNOT ↗</a></>
                ) : (
                  <Button variant="secondary" className="btn--wide btn--save" disabled={!ticks.a || !ticks.b} title={ticks.a && ticks.b ? undefined : "Tick both boxes first"} onClick={() => void buy()}>
                    {orderButton(cost ? cost.most : price)}
                  </Button>
                )}
                <p className="gsheet__fine">{SIGN_NOTE}</p>
              </div>
            </>
          )}
        </>
      );
      break;
    }
    case "sign": case "read":
      body = <div className="gsheet__head gsheet__hop" role="status"><Tile id={g.id} tier={g.tier} lazy={false} /><h2>{step.at === "sign" ? "Sign in Adena…" : "Reading it back from the chain…"}</h2></div>;
      break;
    case "done":
      body = (
        <>
          {head(false, `${g.name}'s yours!`)}
          <div className="gsheet__foot">
            <Button variant="gold" className="btn--wide" onClick={() => (onPlay(skin.id), onClose())}>Play with {g.name}</Button>
            {share}
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
            {order && receipt({ ...order, at: step.when || 0, hash: step.hash, realm: shop.realm, chainId: (costs && costs.chainId) || "", explorer: "", consents: [BOX_A, BOX_B] }).map((l) => <p key={l}>{l}</p>)}
          </div>
          <div className="gsheet__foot"><Button variant="primary" className="btn--wide" onClick={() => window.print()}>Print or save as PDF</Button></div>
        </>
      );
      break;
    case "taken":
      body = <>{head(true)}<p className="note note--bad" role="alert">Someone took {g.name} a moment before you. <b>Nothing was sent.</b></p><div className="gsheet__foot"><Button variant="primary" className="btn--wide" onClick={onClose}>Pick another</Button></div></>;
      break;
    case "unsure":
      body = (
        <>
          {head(true)}
          <p className="note note--warn" role="alert">Sent, but not confirmed yet. <b>Don&apos;t buy again</b>: it would pay twice.</p>
          <div className="gsheet__foot">
            <Button variant="primary" className="btn--wide" onClick={() => (step.hash ? (setStep({ at: "read", hash: step.hash, height: 0 }), void readBack(step.hash, 0)) : read())}>Check again</Button>
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

const home = (h: string) => h.charAt(0).toUpperCase() + h.slice(1);
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
