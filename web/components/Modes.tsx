"use client";

// The first choice, before the cups: play alone, race a player's ghost
// (ADR-004), or, to come, build a hole. A duel asks whom to race, then the
// cups: the rival's ghost is raced on every hole they have a best on. The
// cards are the cups' own (Worlds.tsx), their emblems in the same ink.
import { useEffect, useState, type FormEvent } from "react";
import { Emblem } from "@/components/Worlds";
import { AboutButton, BackButton } from "@/components/About";
import { Button } from "@/components/ui";
import { nameOnce } from "@/components/Leaderboard";
import { shortAddr } from "@/components/common";
import { isAddress, type Chain } from "@/lib/chain";
import { loadFriends } from "@/lib/friends";
import { sound } from "@/lib/feel";
import type { Mode } from "@/lib/types";

type Pick = { addr: string; name: string };

export default function Modes({ chain, me, mode, onSolo, onDuel, onBack, onAbout }: { chain: Chain | null; me: string | null; mode: Mode; onSolo: () => void; onDuel: (addr: string) => void; onBack: () => void; onAbout: () => void }) {
  const [asking, setAsking] = useState(false); // the duel's "whom?" under the cards
  return (
    <div className="screen worlds worlds--v2 modes front tint--garden">
      <BackButton label="Back to the title" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in">
        <div className="front__head">
          <span className="eyebrow">Choose your game</span>
          <h2 className="worlds__title">How do we play?</h2>
        </div>
        <ul className="worlds__list">
          <li>
            <button className="world tint--garden" onClick={() => (sound("select"), onSolo())}>
              <span className="world__art"><Emblem id="solo" /></span>
              <span className="world__ribbon">Solo</span>
              <span className="world__info"><span className="world__tag">Four cups, your best on the boards</span></span>
            </button>
          </li>
          <li>
            <button className={"world tint--island" + (asking ? " world--on" : "")} aria-expanded={asking} onClick={() => (sound("select"), setAsking(true))}>
              <span className="world__art"><Emblem id="duel" /></span>
              <span className="world__ribbon">Duel</span>
              <span className="world__info"><span className="world__tag">Race a player&apos;s ghost, stroke for stroke</span></span>
            </button>
          </li>
          <li>
            <button className="world tint--town" disabled aria-label="Builder: draw your own hole, dare the others. Coming soon">
              <span className="world__art"><Emblem id="build" /></span>
              <span className="world__ribbon">Builder</span>
              <span className="world__info"><span className="world__tag">Draw your own hole, dare the others</span><span className="world__count">Coming soon</span></span>
            </button>
          </li>
        </ul>
        {asking && <Whom chain={chain} me={me} mode={mode} onPick={onDuel} />}
      </div>
    </div>
  );
}

/** Whom a duel races: a name or an address typed, a friend, or one of the course's top players. */
function Whom({ chain, me, mode, onPick }: { chain: Chain | null; me: string | null; mode: Mode; onPick: (addr: string) => void }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [top, setTop] = useState<Pick[]>([]);
  const friends = loadFriends().filter((f) => f.addr !== me);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    void chain.leaderboard(mode).then(async (b) => {
      const rows = b.rows.filter((r) => r.player !== me).slice(0, 3);
      const names = await Promise.all(rows.map((r) => nameOnce(chain, r.player)));
      if (live) setTop(rows.map((r, i) => ({ addr: r.player, name: names[i] || shortAddr(r.player) })));
    }, () => {});
    return () => void (live = false);
  }, [chain, me, mode]);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    const addr = isAddress(v) ? v : chain ? await chain.resolveName(v).catch(() => "") : "";
    if (!addr) return setNote(`No gno.land name “${v}” on this chain.`);
    onPick(addr);
  };
  const chips = [...friends.map((f) => ({ addr: f.addr, name: f.name || shortAddr(f.addr) })), ...top.filter((t) => !friends.some((f) => f.addr === t.addr))];
  return (
    <section className="whom" aria-label="Whom to race">
      <p className="dare">Whose ghost do you race?</p>
      <form className="friends__add" onSubmit={(e) => void go(e)}>
        <input value={typed} onChange={(e) => (setTyped(e.target.value), setNote(""))} placeholder="A gno.land name or address" aria-label="The player to race: gno.land name or address" />
        <Button variant="primary" type="submit" disabled={!typed.trim()}>Race</Button>
      </form>
      {note && <p className="note note--warn">{note}</p>}
      {chips.length > 0 && (
        <p className="whom__picks">
          {chips.map((c) => (
            <button key={c.addr} className="linkish" onClick={() => (sound("select"), onPick(c.addr))}>{c.name}</button>
          ))}
        </p>
      )}
      <small className="drawer__note">Their ghost waits on every hole they have a saved round on. Playing stays free.</small>
    </section>
  );
}
