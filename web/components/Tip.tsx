"use client";

// A tip for the game's maker: GNOT sent from the player's Adena to the golf
// realm's owner, as the chain has it (never an address the page carries), in
// one plain send the player confirms in Adena. Playing stays free; a testnet's
// GNOT is worth nothing, so it is offered where GNOT is real (and locally).
import { useEffect, useState } from "react";
import { sendTip } from "@/lib/adena";
import { networkOf } from "@/lib/network";
import { Button, Segmented } from "@/components/ui";
import { shortAddr } from "@/components/common";
import type { Chain } from "@/lib/chain";

const AMOUNTS = ["1", "5", "10"] as const;

export default function Tip({ chain, me, chainId, price, onConnect }: { chain: Chain; me: string | null; chainId: string | null; price: number; onConnect: () => void }) {
  const [owner, setOwner] = useState<string | null>(null);
  const [gnot, setGnot] = useState<(typeof AMOUNTS)[number]>("5");
  const [said, setSaid] = useState<{ good: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void chain.owner().then((o) => live && setOwner(o), () => {});
    return () => void (live = false);
  }, [chain]);
  if (!owner || owner === me || networkOf(chain.rpc) === "testnet") return null;
  const send = async () => {
    if (!me) return onConnect();
    setBusy(true);
    try {
      await sendTip({ from: me, to: owner, gnot: Number(gnot), price, chainId, rpc: chain.rpc });
      setSaid({ good: true, text: `Thank you! ${gnot} GNOT sent to ${shortAddr(owner)}.` });
    } catch (e) {
      setSaid((e as { cancelled?: boolean }).cancelled ? null : { good: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <h3 className="about__h">Support the game</h3>
      <p>Playing stays free. A tip goes straight to its maker, the golf realm&apos;s owner on this chain: <b>{shortAddr(owner)}</b>. You confirm it in Adena.</p>
      <Segmented label="Tip" value={gnot} full options={AMOUNTS.map((a) => [a, `${a} GNOT`] as const)} onChange={setGnot} />
      <Button variant="secondary" className="btn--wide" disabled={busy} onClick={() => void send()}>
        {busy ? "Waiting for Adena…" : me ? `Send ${gnot} GNOT` : "Connect Adena to tip"}
      </Button>
      {said && <p className={"note " + (said.good ? "note--good" : "note--bad")}>{said.text}</p>}
    </section>
  );
}
