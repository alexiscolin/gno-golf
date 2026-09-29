"use client";

import { useEffect, useState, type ReactNode } from "react";
import { gnokeyPlan, gnokeyPaste, gnokeyLate, chainSplit, PRICE } from "@/lib/adena";
import { Button } from "@/components/ui";
import { messageOf, useCopied } from "@/components/common";
import { errorKind, type Chain } from "@/lib/chain";
import type { Snapshot } from "@/lib/engine";

// "Use gnokey instead": the calls Adena would sign, as one paste for a
// terminal (bash or zsh: macOS, Linux, WSL) that needs gnokey and nothing
// else: the weather asked first (gnokeyLate: too late, nothing goes), then one
// plain `gnokey maketx call` per commit, after a Reset of its own
// (gnokeyPlan), each sent again a block later if the node had not taken the
// one before yet, and the paste stops at the first that fails (gnokeyPaste).
// Collapsed by default; the key name is the player's own, kept in this browser.
// Once copied, the player says when it went (onSent): the game asks the chain;
// with no account connected to ask for (no onSent), the round stays, to check once one is.
// The name, a Claim and a tip go the same way (GnokeyTx), in the same panel (Panel).
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

/**
 * A gnokey paste as the player sees it: collapsed under what it does
 * (summary), or open where Adena cannot do it (open); their key's name, the
 * paste (paste: the commands with that name quoted in) as it is copied, Copy
 * and the line beside it: note whatever the key (a check under way, a
 * refusal), else done once a key is typed. hold: Copy waits (its label);
 * hide: nothing to copy. children: another way, under it.
 */
function Panel({ summary, open, onOpen, txs, when = "", paste, note, done, hold, hide = false, onCopy, children }: {
  summary: string | null; open?: boolean; onOpen?: () => void; txs: number; when?: string; paste: (who: string) => string;
  note?: ReactNode; done: (copied: boolean) => ReactNode; hold?: string; hide?: boolean; onCopy?: () => void; children?: ReactNode;
}) {
  const [copied, copyText] = useCopied(1600);
  const [out, setOut] = useState(false); // copied once: the line may say what next
  const [key, setKey] = useState(savedKey);
  const name = key.trim(), ready = keyOk(name);
  // what is shown is what is copied
  const all = paste(`'${ready ? name : "YOUR_KEY_NAME"}'`);
  const onKey = (v: string) => {
    setKey(v);
    try { localStorage.setItem(KEY, v.trim()); } catch {}
  };
  const copy = () => (setOut(true), onCopy && onCopy(), void copyText(all));
  const box = (
      <div className="details__box gnokey__box">
        <ol className="gnokey__steps">
          <li>Your gnokey key&apos;s name (<code>gnokey list</code> shows them). It pays the fee, shown before you send.
            <input className="gnokey__key" value={key} onChange={(e) => onKey(e.target.value)} placeholder="my-key" aria-label="Your gnokey key name" aria-invalid={!!name && !ready} spellCheck={false} autoCapitalize="off" autoComplete="off" />
            {name && !ready && <small className="gnokey__bad">A key name here can&apos;t hold a quote ( &apos; ) or a backslash.</small>}
          </li>
          <li>Copy it, paste it in a terminal (macOS, Linux or WSL) and type your key&apos;s password ({txs === 1 ? "once" : `${txs} times: one per transaction`}).{when}</li>
        </ol>
        {!hide && <pre className="mono gnokey__code">{all}</pre>}
        <div className="gnokey__row">
          <Button variant="primary" className="gnokey__copy" disabled={!ready || !!hold || hide} onClick={copy}>{copied ? "Copied" : hold || "Copy"}</Button>
          <span className="real__fine">{note || (ready ? done(out) : "Type your key name first.")}</span>
        </div>
        {children}
      </div>
  );
  // no summary: shown as is, inside a fold of the caller's (one fold, not two)
  if (summary === null) return <div className="details gnokey">{box}</div>;
  return (
    <details className="details gnokey" open={open} onToggle={(e) => e.currentTarget.open && onOpen && onOpen()}>
      <summary>{summary}</summary>
      {box}
    </details>
  );
}

export default function Gnokey({ s, chain, price, chainId, onSent }: { s: Snapshot | null; chain: Chain | null; price: number; chainId: string | null; onSent?: () => void }) {
  const [out, setOut] = useState(""); // the round last copied
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
  return (
    <Panel summary="Save with gnokey instead" onOpen={ask} txs={plan.length} when=" It works while this round's weather lasts: see the countdown above."
      paste={(who) => gnokeyPaste(plan, who, gnokeyLate(s.period, chain))} hide={!!(mine && mine.refused)} hold={checking ? "Checking…" : undefined} onCopy={() => setOut(round)}
      note={mine && mine.bad ? <span className="gnokey__bad">{mine.bad}</span> : checking ? "Asking the chain how it cuts this round…" : undefined}
      done={() => <>Saved when it prints <b>OK!</b> and a <b>TX HASH</b> for each.{out === round && (onSent ? <> <button className="linkish" onClick={onSent} aria-label="It did: check the chain for this round">It did</button></> : " Connect Adena to check it on the chain.")}</>} />
  );
}

/**
 * Another transaction as a gnokey paste, the way Adena would send it: a name
 * (gnokeyName), a Claim (gnokeyClaim), a tip (gnokeyTip). plan: its commands
 * at this chain's id and gas price, read here (PRICE until then); empty, why
 * says what is missing. open: where Adena cannot do it. web: the same on
 * gnoweb, in a browser. onSent: once copied, "It did" (the caller asks the chain).
 */
export function GnokeyTx({ chain, plan, why, summary, open, web, onSent }: {
  chain: Chain; plan: (at: { chainId: string | null; price: number }) => readonly string[]; why: string;
  summary: string | null; open?: boolean; web: ReactNode; onSent?: () => void;
}) {
  const [at, setAt] = useState<{ chainId: string | null; price: number }>({ chainId: null, price: PRICE });
  useEffect(() => {
    let live = true;
    void chain.chainId().then((chainId) => live && setAt((a) => ({ ...a, chainId })), () => {});
    void chain.gasPrice().then((price) => live && setAt((a) => ({ ...a, price })), () => {});
    return () => void (live = false);
  }, [chain]);
  const list = plan(at);
  return (
    <Panel summary={summary} open={open} txs={Math.max(1, list.length)} paste={(who) => gnokeyPaste(list, who)} hide={!list.length}
      note={list.length ? undefined : why}
      done={(copied) => <>Done when it prints <b>OK!</b> and a <b>TX HASH</b>{list.length > 1 && " for each"}.{copied && onSent && <> <button className="linkish" onClick={onSent}>It did</button></>}</>}>
      <p className="real__fine gnokey__web">{web}</p>
    </Panel>
  );
}
