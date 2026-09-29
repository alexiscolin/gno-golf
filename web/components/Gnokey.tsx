"use client";

import { useState } from "react";
import { gnokeyPlan, gnokeyPaste, chainSplit } from "@/lib/adena";
import { Button } from "@/components/ui";
import { messageOf, useCopied } from "@/components/common";
import { errorKind, type Chain } from "@/lib/chain";
import type { Snapshot } from "@/lib/engine";

// "Use gnokey instead": the calls Adena would sign, as one paste for a
// terminal (bash or zsh: macOS, Linux, WSL) that needs gnokey and nothing
// else: one plain `gnokey maketx call` per commit, after a Reset of its own
// (gnokeyPlan), each sent again a block later if the node had not taken the
// one before yet, and the paste stops at the first that fails (gnokeyPaste).
// Collapsed by default; the key name is the player's own, kept in this browser.
// Once copied, the player says when it went (onSent): the game asks the chain;
// with no account connected to ask for (no onSent), the round stays, to check once one is.
const KEY = "gnogolf.gnokey";
// any name gnokey takes, quoted for the shell: all but a quote and control characters
const keyOk = (k: string) => /^[^'\\\u0000-\u001f]{1,64}$/.test(k);
const savedKey = () => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};

export default function Gnokey({ s, chain, price, chainId, onSent }: { s: Snapshot | null; chain: Chain | null; price: number; chainId: string | null; onSent?: () => void }) {
  const [copied, copyText] = useCopied(1600);
  const [out, setOut] = useState(""); // the round last copied
  const [key, setKey] = useState(savedKey);
  // the commits as the chain itself cuts them, asked when the panel opens:
  // the same split an Adena save sends (keyed by the round it is for)
  const round = s ? `${s.id}#${s.shots.join(";")}#${s.period}` : "";
  // (refused: the chain refused the round, and no paste is offered; a node that did not answer
  // leaves the model's split, which the chain checks again as it plays it)
  const [split, setSplit] = useState<{ round: string; parts: readonly (readonly [number, number])[] | null; bad?: string; refused?: boolean } | null>(null);
  const ask = () => {
    if (!s || !chain || !s.id || s.period == null || (split && split.round === round)) return;
    setSplit({ round, parts: null });
    chainSplit(chain, { ...s, id: s.id }, s.period)
      .then((parts) => setSplit((v) => (v && v.round === round ? { round, parts } : v)))
      .catch((e: unknown) => setSplit((v) => (v && v.round === round ? { round, parts: null, bad: messageOf(e), refused: errorKind(e) !== "down" } : v)));
  };
  if (!s || !chain) return null;
  const mine = split && split.round === round ? split : null;
  const plan = gnokeyPlan(s, { realm: chain.realm, price, chainId, rpc: chain.rpc, parts: mine && mine.parts });
  if (!plan.length) return null;
  const checking = !!mine && !mine.parts && !mine.bad;
  const name = key.trim(), ready = keyOk(name);
  // what is shown is what is copied
  const all = gnokeyPaste(plan, `'${ready ? name : "YOUR_KEY_NAME"}'`);
  const onKey = (v: string) => {
    setKey(v);
    try { localStorage.setItem(KEY, v.trim()); } catch {}
  };
  const copy = () => (setOut(round), void copyText(all));
  return (
    <details className="details gnokey" onToggle={(e) => e.currentTarget.open && ask()}>
      <summary>Save with gnokey instead</summary>
      <div className="details__box gnokey__box">
        <ol className="gnokey__steps">
          <li>Your gnokey key's name (<code>gnokey list</code> shows them). It pays the fee, shown before you send.
            <input className="gnokey__key" value={key} onChange={(e) => onKey(e.target.value)} placeholder="my-key" aria-label="Your gnokey key name" aria-invalid={!!name && !ready} spellCheck={false} autoCapitalize="off" autoComplete="off" />
            {name && !ready && <small className="gnokey__bad">A key name here can't hold a quote ( ' ) or a backslash.</small>}
          </li>
          <li>Copy it, paste it in a terminal (macOS, Linux or WSL) and type your key's password ({plan.length} times: one per transaction). It works while this round's weather lasts: see the countdown above.</li>
        </ol>
        {!(mine && mine.refused) && <pre className="mono gnokey__code">{all}</pre>}
        <div className="gnokey__row">
          <Button variant="primary" className="gnokey__copy" disabled={!ready || checking || !!(mine && mine.refused)} onClick={copy}>{copied ? "Copied" : checking ? "Checking…" : "Copy"}</Button>
          <span className="real__fine">
            {mine && mine.bad ? <span className="gnokey__bad">{mine.bad}</span>
              : checking ? "Asking the chain how it cuts this round…"
              : ready ? <>Saved when it prints <b>OK!</b> and a <b>TX HASH</b> for each.{out === round && (onSent ? <> <button className="linkish" onClick={onSent} aria-label="It did: check the chain for this round">It did</button></> : " Connect Adena to check it on the chain.")}</> : "Type your key name first."}
          </span>
        </div>
      </div>
    </details>
  );
}
