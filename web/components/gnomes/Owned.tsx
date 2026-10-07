"use client";

// What the picker adds for a player who holds gnomes (the game's picker
// itself unchanged, Golf.tsx Picker): one line saying who sees what, one
// row of their gnomes' faces (a tap plays one, free, kept in this browser),
// and, apart, the one call that costs: showing everyone another than their
// best (Equip). Loaded with the shop's chunk, and only for a player with a
// collection.
import "@/app/gnomes.css";
import { useState } from "react";
import Share from "@/components/Share";
import { PRICE, type SendError } from "@/lib/adena";
import { sendGnome, gnomeCall, GNOME_TX } from "@/lib/gnomes/tx";
import type { Chain } from "@/lib/chain";
import { GNOMES_REALM } from "@/lib/chain";
import { messageOf } from "@/components/common";
import { seen, tokenSkin } from "@/lib/gnomes/wear";
import { shareWords, type Worn } from "@/lib/gnomes/shop";
import { thumb } from "./parts";
import Collector from "./Rank";

interface Props {
  chain: Chain;
  me: string;
  /** their gnomes, best first (GnomesOf's rows) */
  held: readonly { id: string; tier: string; traits: string; name: string; home: string }[];
  worn: Worn | null;
  /** the gnome played (a skin id) */
  playing: string;
  onPick: (skinId: string) => void;
  /** whether the shop opens here (lib/gnomes/geo.ts): Equip is one of its calls */
  region: boolean;
  /** what everyone sees changed: read Worn again */
  onWorn: () => void;
  name: (skinId: string) => string;
}

export default function Owned({ chain, me, held, worn, playing, onPick, region, onWorn, name }: Props) {
  const [busy, setBusy] = useState<"" | "sign" | "done">("");
  const [shown, setShown] = useState<{ id: string; name: string; home: string } | null>(null); // the one just shown to everyone: share him
  const [error, setError] = useState("");
  // (an earned gnome is one of the picker's own: the row is the bought ones)
  const bought = held.filter((g) => Number(g.id) < 1_000_001);
  if (!bought.length) return null;
  const said = seen({ worn, playing, name });
  const id = playing.startsWith("t") ? Number(playing.slice(1)) : NaN;
  const fee = (Math.ceil((GNOME_TX.equip.gas * PRICE * 1.5) / 1e4) / 100).toFixed(2);
  async function show() {
    setBusy("sign");
    setError("");
    try {
      const price = await chain.gasPrice().catch(() => PRICE);
      await sendGnome(gnomeCall.equip(id), { address: me, realm: GNOMES_REALM, price, chainId: await chain.chainId().catch(() => null), rpc: chain.rpc });
      setBusy("done");
      const g = bought.find((x) => x.id === String(id));
      if (g) setShown(g);
      onWorn();
    } catch (e) {
      setBusy("");
      if (!(e as SendError).cancelled) setError(messageOf(e));
    }
  }
  return (
    <div className="owned">
      <p className="owned__line" role="status">
        {said.line}
        <Collector chain={chain} player={me} />
        {said.show && region && Number.isSafeInteger(id) && (
          <> · <button className="linkish" disabled={busy === "sign"} onClick={() => void show()}>{busy === "sign" ? "Sign in Adena…" : `Show to everyone · about ${fee} GNOT`}</button></>
        )}
      </p>
      {error && <p className="owned__line" role="alert">{error}</p>}
      {/* the moment everyone sees him: the game's own share row, once */}
      {shown && <Share text={shareWords.equipped(shown.name, shown.home)} link={`g/${shown.id}/`} label={`Your rivals will see ${shown.name}`} kind="share" />}
      <div className="owned__row" role="group" aria-label="Your gnomes">
        {bought.map((g) => {
          const skin = tokenSkin(g).id;
          return (
            <button key={g.id} type="button" className="owned__face" aria-pressed={playing === skin} aria-label={`Play with ${g.name}`} title={g.name} onClick={() => onPick(skin)}>
              <img src={thumb(Number(g.id))} alt="" width={44} height={44} loading="lazy" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
