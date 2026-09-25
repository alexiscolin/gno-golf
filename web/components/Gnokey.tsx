"use client";

import { useRef, useState } from "react";
import { gnokeyPlan } from "@/lib/adena";
import { Button } from "@/components/ui";
import type { Chain } from "@/lib/chain";
import type { Snapshot } from "@/lib/engine";

// "Use gnokey instead": the transaction Adena would sign, as gnokey commands
// the player runs with their own key. One `maketx run` per commit, each a tiny
// script (Reset then the shots in the first), so each stays one atomic
// transaction as with Adena. Collapsed by default; no key or address in it.
export default function Gnokey({ s, chain, price, chainId }: { s: Snapshot | null; chain: Chain | null; price: number; chainId: string | null }) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  if (!s || !chain) return null;
  const plan = gnokeyPlan(s, { realm: chain.realm, price, chainId, rpc: chain.rpc });
  if (!plan.length) return null;
  // one paste: write each script, then run it
  const all = plan.map((p) => `cat > ${p.file} <<'EOF'\n${p.script}EOF\n${p.command}`).join("\n\n");
  const copy = () =>
    void navigator.clipboard.writeText(all).then(() => (setCopied(true), clearTimeout(t.current), (t.current = setTimeout(() => setCopied(false), 1600))), () => {});
  return (
    <details className="details gnokey">
      <summary>Use gnokey instead</summary>
      <div className="details__box">
        <p className="real__fine">Run this with your own gnokey key; the chain replays your shots exactly as recorded.</p>
        {plan.length > 1 && <p className="real__fine">This round needs {plan.length} transactions: run them in order, each once the one before is in a block.</p>}
        {plan.map((p) => (
          <div key={p.file} className="gnokey__part">
            <p className="real__fine"><b>{p.file}</b></p>
            <pre className="mono gnokey__code">{p.script}</pre>
            <pre className="mono gnokey__code">{p.command}</pre>
          </div>
        ))}
        <Button onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
      </div>
    </details>
  );
}
