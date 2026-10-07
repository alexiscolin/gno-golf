"use client";

// /build on a phone, a touch screen or under 900 px (the GUI spec's B6): the
// Builder is for a computer, a link to open it there, and holes to play
// (playing stays on the phone). Nothing of the editor is imported here, nor
// builder.wasm (test/builder-route.test.ts holds it so): so it judges no
// community hole, and lists only those this browser has already passed
// (lib/community.ts knownOnly); the game's cups screen judges and lists the rest.
// The author's own holes come with who played them (useRewards.ts), as on a computer.
import "@/app/title.css";
import "@/app/build/phone.css";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/About";
import { useCopied } from "@/components/common";
import { worldName } from "@/lib/builder/rules";
import { Button } from "@/components/ui";
import { makeChain } from "@/lib/chain";
import { authorOf, cupsLink, endpoints, holeByline, knownAuthor, listHoles, playLink } from "@/lib/builder/holes";
import { knownOnly } from "@/lib/community";
import { isFresh, statsLine, statsOf } from "@/lib/builder/rewards";
import { loadTakedown } from "@/lib/takedown";
import type { HoleRow } from "@/lib/types";
import { useRewards } from "./useRewards";

/** How many community holes show before "More community holes". */
const PAGE = 12;
const NONE: ReadonlySet<string> = new Set();

function Row({ h, sub, keep, fresh = false }: { h: HoleRow; sub: string; keep: string; fresh?: boolean }) {
  return (
    <li className="bphone__row">
      <span className="bphone__name"><b>{h.name || h.slot || h.id}{fresh && <i className="bholes__dot" role="img" aria-label="New since your last visit" title="New since your last visit" />}</b><small>{sub}</small></span>
      <a className="btn btn--ghost btn--s" href={playLink(h, keep)}>Play</a>
    </li>
  );
}

export default function PhoneBuilder() {
  const [lists, setLists] = useState<{ mine: HoleRow[]; community: HoleRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [copied, copy] = useCopied();
  const { chain, keep, author } = useMemo(() => {
    const { rpc, web, keep } = endpoints(window.location.search);
    return { chain: makeChain({ rpc, web }), keep, author: knownAuthor() };
  }, []);
  // the author's holes, every one of theirs with who played it (Holes() lists three an author)
  const { got } = useRewards(chain, author);
  useEffect(() => {
    const taken = loadTakedown(chain).catch(() => NONE);
    Promise.all([chain.holes(), taken])
      .then(([rows, t]) => listHoles(rows, author, t))
      .then(async ({ mine, community }) => setLists({ mine, community: await knownOnly(chain, community) }), () => setFailed(true));
  }, [chain, author]);
  const { community = [] } = lists || {}, mine = got?.rows.length ? got.rows : lists?.mine ?? [];
  const mineRow = (h: HoleRow) => {
    if (!got || !author) return <Row key={h.id} h={h} keep={keep} sub={`${worldName(h.world)} · par ${h.par}`} />;
    const s = statsOf(h, got.saved, author);
    return <Row key={h.id} h={h} keep={keep} fresh={isFresh(h.id, s, got.seen)} sub={`${worldName(h.world)} · ${statsLine(s)}`} />;
  };
  return (
    <div className="screen worlds front bphone tint--garden">
      <BackButton label="Back to the game" onClick={() => window.location.assign("/")} />
      <div className="worlds__in bphone__in">
        <div className="front__head">
          <span className="eyebrow">The Builder</span>
          <h2 className="worlds__title">For a computer</h2>
        </div>
        <p className="bphone__lead">Drawing a hole takes a mouse and a keyboard. Playing them works right here.</p>
        <Button variant="primary" className="btn--wide" onClick={() => void copy(window.location.href)}>{copied ? "Copied: open it on your computer" : "Copy the link for my computer"}</Button>
        {mine.length > 0 && (
          <section className="bphone__list" aria-label="Your holes">
            <h3>Your holes</h3>
            <ul>{mine.map(mineRow)}</ul>
          </section>
        )}
        <section className="bphone__list" aria-label="Community holes">
          <h3>Community holes</h3>
          {failed ? <p className="bphone__note" role="status">The holes can&apos;t be read right now. Try again in a moment.</p>
            : !lists ? <ul aria-busy="true">{[0, 1, 2].map((k) => <li key={k} className="bphone__row skel" />)}</ul>
            : !community.length ? <p className="bphone__note">None checked on this device yet.</p>
            : <ul>{community.slice(0, shown).map((h) => <Row key={h.id} h={h} keep={keep} sub={holeByline({ author: authorOf(h.id) ?? "", world: h.world, par: h.par })} />)}</ul>}
          {community.length > shown && <Button className="btn--wide" onClick={() => setShown((n) => n + PAGE)}>More community holes</Button>}
          {!failed && <a className="btn btn--ghost btn--wide" href={cupsLink(keep)}>Every community hole, in the game</a>}
        </section>
      </div>
    </div>
  );
}
