"use client";

// /build on a phone, a touch screen or under 900 px (the GUI spec's B6): the
// Builder is for a computer, a link to open it there, and holes to play
// (playing stays on the phone). Nothing of the editor is imported here, nor
// builder.wasm (test/builder-route.test.ts holds it so): so it judges no
// community hole, and lists only those this browser has already passed
// (lib/community.ts knownOnly); the game's cups screen judges and lists the rest.
import "@/app/title.css";
import "@/app/build/phone.css";
import { useEffect, useState } from "react";
import { BackButton } from "@/components/About";
import { useCopied } from "@/components/common";
import { Button } from "@/components/ui";
import { makeChain } from "@/lib/chain";
import { cupsLink, endpoints, knownAuthor, listHoles, playLink } from "@/lib/builder/holes";
import { knownOnly } from "@/lib/community";
import { readTakedown } from "@/lib/takedown";
import type { HoleRow } from "@/lib/types";

/** How many community holes show before "More community holes". */
const PAGE = 12;
const NONE: ReadonlySet<string> = new Set();
const worldName = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const short = (a: string) => `${a.slice(0, 7)}…${a.slice(-4)}`;

function Row({ h, sub, keep }: { h: HoleRow; sub: string; keep: string }) {
  return (
    <li className="bphone__row">
      <span className="bphone__name"><b>{h.name || h.slot || h.id}</b><small>{sub}</small></span>
      <a className="btn btn--ghost btn--s" href={playLink(h, keep)}>Play</a>
    </li>
  );
}

export default function PhoneBuilder() {
  const [lists, setLists] = useState<{ mine: HoleRow[]; community: HoleRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [copied, copy] = useCopied();
  const [keep, setKeep] = useState("");
  useEffect(() => {
    const { rpc, web, keep: k } = endpoints(window.location.search);
    setKeep(k);
    const chain = makeChain({ rpc, web });
    const taken = Promise.all([fetch("/takedown.json", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")), chain.chainId()])
      .then(([text, id]) => readTakedown(text, id), () => NONE);
    Promise.all([chain.holes(), taken])
      .then(([rows, t]) => listHoles(rows, knownAuthor(), t))
      .then(async ({ mine, community }) => setLists({ mine, community: await knownOnly(chain, community) }), () => setFailed(true));
  }, []);
  const { mine = [], community = [] } = lists || {};
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
            <ul>{mine.map((h) => <Row key={h.id} h={h} keep={keep} sub={`${worldName(h.world)} · par ${h.par}`} />)}</ul>
          </section>
        )}
        <section className="bphone__list" aria-label="Community holes">
          <h3>Community holes</h3>
          {failed ? <p className="bphone__note" role="status">The holes can&apos;t be read right now. Try again in a moment.</p>
            : !lists ? <ul aria-busy="true">{[0, 1, 2].map((k) => <li key={k} className="bphone__row skel" />)}</ul>
            : !community.length ? <p className="bphone__note">None checked on this device yet.</p>
            : <ul>{community.slice(0, shown).map((h) => <Row key={h.id} h={h} keep={keep} sub={`by ${short(h.id.split("/")[0])} · ${worldName(h.world)} · par ${h.par}`} />)}</ul>}
          {community.length > shown && <Button className="btn--wide" onClick={() => setShown((n) => n + PAGE)}>More community holes</Button>}
          {!failed && <a className="btn btn--ghost btn--wide" href={cupsLink(keep)}>Every community hole, in the game</a>}
        </section>
      </div>
    </div>
  );
}
