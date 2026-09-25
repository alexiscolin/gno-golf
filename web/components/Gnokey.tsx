"use client";

import { useRef, useState } from "react";
import { gnokeyPlan } from "@/lib/adena";
import { Button } from "@/components/ui";
import type { Chain } from "@/lib/chain";
import type { Snapshot } from "@/lib/engine";

// "Use gnokey instead": the transaction Adena would sign, as one paste for a
// terminal (bash or zsh: macOS, Linux, WSL) that needs gnokey and nothing
// else. Each commit is a tiny script written with a heredoc into a fresh
// temporary folder (any working directory will do, nothing is left in it),
// then one `maketx run` (Reset then the shots in the first), so each stays one
// atomic transaction as with Adena; the paste stops at the first that fails.
// Collapsed by default; the key name is the player's own, kept in this browser.
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

export default function Gnokey({ s, chain, price, chainId }: { s: Snapshot | null; chain: Chain | null; price: number; chainId: string | null }) {
  const [copied, setCopied] = useState(false);
  const [key, setKey] = useState(savedKey);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  if (!s || !chain) return null;
  const plan = gnokeyPlan(s, { realm: chain.realm, price, chainId, rpc: chain.rpc });
  if (!plan.length) return null;
  const name = key.trim(), ready = keyOk(name);
  // what is shown is what is copied: a subshell that stops at the first failure
  const who = `'${ready ? name : "YOUR_KEY_NAME"}'`;
  const body = plan
    .map((p, k) => [
      ...(plan.length > 1 ? [`echo "Gnogolf: transaction ${k + 1} of ${plan.length}"`] : []),
      `cat >| "$d/${p.file}" <<'EOF'\n${p.script}EOF`,
      p.command.replace(`<your-key-name> ${p.file}`, `${who} "$d/${p.file}"`),
    ].join("\n"))
    .join("\n\n");
  const all = `(\nset -e\nd=$(mktemp -d)\n${body}\nrm -rf "$d"\n)`;
  const onKey = (v: string) => {
    setKey(v);
    try { localStorage.setItem(KEY, v.trim()); } catch {}
  };
  const copy = () =>
    void navigator.clipboard.writeText(all).then(() => (setCopied(true), clearTimeout(t.current), (t.current = setTimeout(() => setCopied(false), 1600))), () => {});
  return (
    <details className="details gnokey">
      <summary>Save with gnokey instead</summary>
      <div className="details__box gnokey__box">
        <ol className="gnokey__steps">
          <li>Your gnokey key's name (<code>gnokey list</code> shows them). It pays the fees: about 1 GNOT for a first save on a hole.
            <input className="gnokey__key" value={key} onChange={(e) => onKey(e.target.value)} placeholder="my-key" aria-label="Your gnokey key name" aria-invalid={!!name && !ready} spellCheck={false} autoCapitalize="off" autoComplete="off" />
            {name && !ready && <small className="gnokey__bad">A key name here can't hold a quote ( ' ) or a backslash.</small>}
          </li>
          <li>Copy it, paste it in a terminal (macOS, Linux or WSL) and type your key's password{plan.length > 1 ? ` (${plan.length} times: one per transaction)` : ""}. It works while this round's weather lasts: see the countdown above.</li>
        </ol>
        <pre className="mono gnokey__code">{all}</pre>
        <div className="gnokey__row">
          <Button variant="primary" className="gnokey__copy" disabled={!ready} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
          <span className="real__fine">{ready ? <>Saved when it prints <b>OK!</b> and a <b>TX HASH</b>{plan.length > 1 ? " for each" : ""}.</> : "Type your key name first."}</span>
        </div>
      </div>
    </details>
  );
}
