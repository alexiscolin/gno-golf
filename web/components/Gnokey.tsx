"use client";

import { useRef, useState } from "react";
import { gnokeyPlan } from "@/lib/adena";
import { Button } from "@/components/ui";
import type { Chain } from "@/lib/chain";
import type { Snapshot } from "@/lib/engine";

// "Use gnokey instead": the transaction Adena would sign, as one paste for a
// terminal (bash or zsh: macOS, Linux, WSL) that needs gnokey and nothing
// else. Each commit is a tiny script written with a heredoc, then one
// `maketx run` (Reset then the shots in the first), so each stays one atomic
// transaction as with Adena; the paste stops at the first that fails.
// Collapsed by default; the key name is the player's own, kept in this browser.
const KEY = "gnogolf.gnokey";
const keyOk = (k: string) => /^[\w.@-]{1,64}$/.test(k);
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
  const body = plan.map((p) => `cat > ${p.file} <<'EOF'\n${p.script}EOF\n${p.command.replace("<your-key-name>", ready ? name : "<your-key-name>")}`).join("\n\n");
  const all = `(\nset -e\n${body}\n)`;
  const onKey = (v: string) => {
    setKey(v);
    try { localStorage.setItem(KEY, v.trim()); } catch {}
  };
  const copy = () =>
    void navigator.clipboard.writeText(all).then(() => (setCopied(true), clearTimeout(t.current), (t.current = setTimeout(() => setCopied(false), 1600))), () => {});
  return (
    <details className="details gnokey">
      <summary>Use gnokey instead</summary>
      <div className="details__box gnokey__box">
        <ol className="gnokey__steps">
          <li>Your gnokey key's name (<code>gnokey list</code> shows them):
            <input className="gnokey__key" value={key} onChange={(e) => onKey(e.target.value)} placeholder="my-key" aria-label="Your gnokey key name" spellCheck={false} autoCapitalize="off" autoComplete="off" />
          </li>
          <li>Copy, and paste it in a terminal (macOS, Linux or WSL). It needs only gnokey, and asks for your key's password{plan.length > 1 ? `, once per transaction (${plan.length})` : ""}.</li>
        </ol>
        <div className="gnokey__term">
          <pre className="mono gnokey__code">{all}</pre>
          <Button className="gnokey__copy" disabled={!ready} onClick={copy} title={ready ? undefined : "Type your key name first"}>{copied ? "Copied" : "Copy"}</Button>
        </div>
        <p className="real__fine gnokey__note">The chain replays your shots exactly as Adena would send them.</p>
      </div>
    </details>
  );
}
