"use client";

// A tip for the game's maker: GNOT sent from the player's Adena to the golf
// realm's owner, as the chain has it (never an address the page carries), in
// one plain send the player confirms in Adena, or signs with gnokey (a paste:
// the only way without Adena, a quiet other one with it). Playing stays free; a testnet's
// GNOT is test GNOT, and said so. Not on mainnet while its ugnot is
// transfer-locked (bank restricted_denoms): the chain refuses a plain send.
import { useEffect, useState } from "react";
import { hasAdena, resultOf, sendTip, gnokeyTip, TIPS, type SendError } from "@/lib/adena";
import { isTouch } from "@/lib/device";
import { networkOf } from "@/lib/network";
import { Button, Segmented } from "@/components/ui";
import { GnokeyTx } from "@/components/Gnokey";
import { messageOf, shortAddr } from "@/components/common";
import { wait, type Chain } from "@/lib/chain";

const AMOUNTS = TIPS.map(String);

// bare: in a sheet of its own (its title is the sheet's)
export default function Tip({ chain, me, chainId, price, onConnect, bare = false }: { chain: Chain; me: string | null; chainId: string | null; price: number; onConnect: () => void; bare?: boolean }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [gnot, setGnot] = useState("5");
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void chain.owner().then((o) => live && setOwner(o), () => live && setOwner("")); // ("": not read, a node down or an owner renounced)
    return () => void (live = false);
  }, [chain]);
  if (networkOf(chain.rpc) === "mainnet")
    return <section>{!bare && <h3 className="about__h">Support the game</h3>}<p>Tips open once GNOT can be sent on mainnet: until then the chain refuses a plain send.</p></section>;
  if (!owner || owner === me) return bare ? <p>{owner ? "You made the game: nothing to tip yourself." : owner === "" ? "No one to tip on this chain: its owner could not be read." : "Reading the chain…"}</p> : null;
  const unit = "test GNOT"; // (mainnet's tips are not open: said above)
  // a phone with no Adena: it is a computer's browser extension (as saving a round)
  const adena = hasAdena(), away = !me && isTouch() && !adena;
  const thanks = `Thank you! ${gnot} ${unit} sent to ${shortAddr(owner)}.`;
  const send = async () => {
    if (!me) return onConnect();
    setBusy(true);
    try {
      // (the chain's id read now if the page has not yet: an account connected before the game was built)
      await sendTip({ from: me, to: owner, gnot: Number(gnot), price, chainId: chainId || (await chain.chainId()), rpc: chain.rpc });
      setSaid({ good: true, text: thanks });
    } catch (e) {
      const err = e as SendError;
      if (err.cancelled) return setSaid(null);
      if (!err.maybe) return setSaid({ good: false, text: err.message });
      // Adena failed for no reason that says it never went: the chain is asked by its hash, as a
      // save's is, and without its answer the player checks before a second tip
      try {
        for (let k = 0; err.hash && k < 5; k++) {
          if (k) await wait(3000);
          if ((await resultOf(chain, err.hash)) !== null) return setSaid({ good: true, text: thanks });
        }
        setSaid({ good: false, text: `Adena did not confirm it (${err.message.replace(/\.$/, "")}), but it may have gone through all the same: check your balance before sending again.` });
      } catch (refused) {
        setSaid({ good: false, text: messageOf(refused) }); // it failed on the chain: not sent
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      {!bare && <h3 className="about__h">Support the game</h3>}
      <p>Playing stays free. A tip goes straight to its maker, the golf realm&apos;s owner on this chain: <a className="mono" href={chain.userURL(owner)} target="_blank" rel="noopener noreferrer">{owner} ↗</a>. You confirm it in Adena or gnokey, where the same address shows.</p>
      {away ? (
        <p className="real__fine">Adena is a computer&apos;s browser extension: open the game there to tip.</p>
      ) : (
        <>
          <Segmented label="Tip" value={gnot} full options={AMOUNTS.map((a) => [a, `${a} ${unit}`] as const)} onChange={setGnot} />
          {adena && (
            <Button variant="secondary" className="btn--wide" disabled={busy} onClick={() => void send()}>
              {busy ? "Waiting for Adena…" : me ? `Send ${gnot} ${unit}` : "Connect Adena to tip"}
            </Button>
          )}
          <GnokeyTx chain={chain} open={!adena} summary={adena ? "Tip with gnokey instead" : `Send ${gnot} ${unit} with gnokey`}
            plan={(at) => gnokeyTip({ to: owner, gnot: Number(gnot), rpc: chain.rpc, ...at })} why="Nothing to send."
            web={<>A send has no form on gno.land: any wallet can send to <a href={chain.userURL(owner)} target="_blank" rel="noopener noreferrer">the owner&apos;s address ↗</a>.</>} />
        </>
      )}
      {said && <p className={"note " + (said.good ? "note--good" : "note--bad")}>{said.text}</p>}
    </section>
  );
}
