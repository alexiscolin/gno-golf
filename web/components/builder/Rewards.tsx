"use client";

// What an author gets back once a hole is out (lib/builder/rewards.ts, the
// game-design review's #8), on the Builder's start (Start.tsx's "Your
// holes"): the Builder's badges as the game's medals, and the author's test
// round saved on the chain with Adena, the hole's first record to beat and
// its ghost. (The holes and their rounds: useRewards.ts, the phone's
// screen's too.)
import { useState } from "react";
import { Medal } from "@/components/Badges";
import { Button } from "@/components/ui";
import { connect, hasAdena, PRICE, recordRound } from "@/lib/adena";
import { wait, type Chain } from "@/lib/chain";
import { replayed, type Proof } from "@/lib/builder/proof";
import { BUILDER_BADGES, earnedBadges, nextRound, roundNow, testRounds, type BuilderFacts } from "@/lib/builder/rewards";

/** How long the chain is read for a saved round to land (a few blocks). */
const LAND_MS = 90_000;

/** The Builder's badges, each a medal (the game's, in its on-chain colour) earned or not, with its name, and what earns it until it is. */
export function BuilderBadges({ facts }: { facts: BuilderFacts }) {
  const had = earnedBadges(facts);
  return (
    <ul className="bbadges" aria-label={`Builder badges: ${had.length} of ${BUILDER_BADGES.length}`}>
      {BUILDER_BADGES.map((b) => {
        const on = had.includes(b.id);
        return (
          <li key={b.id} className={on ? "" : "bbadges__off"}>
            <Medal b={{ id: b.id, family: "chain" }} glyph={b.glyph} on={on} />
            <span><b>{b.name}</b>{!on && <small>{b.need}</small>}</span>
          </li>
        );
      })}
    </ul>
  );
}

type Saving = { at: "idle" | "checking" | "signing" | "landing" | "done" } | { at: "later" | "failed"; why: string };

/**
 * The author's test round of a published version (id), saved on the chain
 * with Adena: the hole's first record to beat, and the author's ghost. Only
 * a round played in the weather of the moment can be (the realm takes the
 * current period or the one before): its kind is checked, then it is
 * replayed on the chain's own data as a save is cut (proof.ts replayed);
 * else it says when one comes back. Nothing without Adena.
 */
export function SaveTestRound({ chain, proofs, id, world, author, onSaved }: { chain: Chain; proofs: readonly Proof[]; id: string; world: string; author: string; onSaved: () => void }) {
  const [s, setS] = useState<Saving>({ at: "idle" });
  if (!hasAdena() || !testRounds(proofs, id).length) return null;
  const save = async () => {
    setS({ at: "checking" });
    try {
      const now = await chain.period(), c = roundNow(proofs, id, world, now);
      if (!c) {
        const next = nextRound(proofs, id, world, now);
        return setS({ at: "later", why: next ? `Your test rounds were played in other weather: one comes back within about ${(next - now) * 5} minutes.` : "Your test rounds were played in other weather, none of which comes back today." });
      }
      const r = await replayed(chain, { key: c.proof.key, id, kind: c.proof.kind, period: c.period, shots: c.proof.shots });
      if (typeof r === "string") return setS({ at: "failed", why: r });
      const [chainId, price, under] = await Promise.all([chain.chainId(), chain.gasPrice().catch(() => PRICE), chain.round(id, author).catch(() => null)]);
      const { address } = await connect({ chainId, rpc: chain.rpc });
      if (address !== author) return setS({ at: "failed", why: `Adena is on ${address}, not ${author}: switch accounts in Adena.` });
      setS({ at: "signing" });
      for (const [k, [from, to]] of r.proof.commits.entries()) {
        await recordRound({ address, realm: chain.realm, hole: id, shots: r.proof.shots.slice(from, to), reset: k === 0 && !!under, gas: r.gas[k], period: c.period, mode: "assisted", price, chainId, rpc: chain.rpc });
      }
      setS({ at: "landing" });
      for (const t0 = Date.now(); Date.now() - t0 < LAND_MS; await wait(3000)) {
        if ((await chain.bestsOf([id], author).catch(() => null))?.get(id)?.assisted) return (setS({ at: "done" }), onSaved());
      }
      setS({ at: "failed", why: "The chain does not show it yet. If you signed, give it a minute and look again." });
    } catch (e) {
      setS({ at: "failed", why: e instanceof Error ? e.message : String(e) });
    }
  };
  if (s.at === "done") return <p className="bsave bsave--done" role="status">Saved: your test round is the record to beat.</p>;
  const busy = s.at === "checking" || s.at === "signing" || s.at === "landing";
  return (
    <div className="bsave">
      <Button size="s" disabled={busy} onClick={() => void save()}>
        {s.at === "checking" ? "Checking the weather…" : s.at === "signing" ? "Sign in Adena…" : s.at === "landing" ? "Saving…" : "Save your test round"}
      </Button>
      <small>{"why" in s ? s.why : "It becomes the record to beat, and your ghost."}</small>
    </div>
  );
}
