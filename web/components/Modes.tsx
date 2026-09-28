"use client";

// The first choice, before the cups: play alone, race a player's ghost
// (ADR-004), or, to come, build a hole. A duel asks whom to race, then the
// cups: the rival's ghost is raced on every hole they have a best on. Panels
// of their own, a kart game's modes (never the cups' cards: another choice).
import { useEffect, useState, type FormEvent } from "react";
import { Emblem } from "@/components/Worlds";
import { useGnomeStage } from "@/components/Stage";
import { gnomeById } from "@/lib/scene";
import type { Skin } from "@/lib/scene/gnome";
import { AboutButton, BackButton } from "@/components/About";
import { Button } from "@/components/ui";
import { nameOnce } from "@/components/Leaderboard";
import { shortAddr } from "@/components/common";
import { isAddress, type Chain } from "@/lib/chain";
import { loadFriends } from "@/lib/friends";
import { sound } from "@/lib/feel";
import type { Mode } from "@/lib/types";

type Pick = { addr: string; name: string };

export default function Modes({ chain, me, mode, gnome, onSolo, onDuel, onBack, onAbout }: { chain: Chain | null; me: string | null; mode: Mode; gnome: string; onSolo: () => void; onDuel: (addr: string) => void; onBack: () => void; onAbout: () => void }) {
  const [asking, setAsking] = useState(false); // the duel's "whom?" under the panels
  const skin = gnomeById(gnome);
  return (
    <div className="screen worlds front modes tint--garden">
      <BackButton label="Back to the title" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in">
        <div className="front__head">
          <span className="eyebrow">Choose your game</span>
          <h2 className="worlds__title">How do we play?</h2>
        </div>
        <ul className="modes__list">
          <li><Panel tint="garden" name="Solo" line="Four cups, your best on the boards" skin={skin} onClick={onSolo} /></li>
          <li><Panel tint="island" name="Duel" line="Race a player's ghost, stroke for stroke" skin={skin} ghost on={asking} onClick={() => setAsking(true)} /></li>
          <li><Panel tint="town" name="Builder" line="Draw your own hole, dare the others" skin={skin} soon /></li>
        </ul>
        {asking && <Whom chain={chain} me={me} mode={mode} onPick={onDuel} />}
      </div>
    </div>
  );
}

/** A game's panel, as a kart game's modes are: its colour edge to edge, the
 *  gnome hopping on it in 3D (a duel's ghost beside him), its name inked big.
 *  One to come is drawn, dimmed, with its sticker (and no 3D of its own). */
function Panel({ tint, name, line, skin, ghost = false, soon = false, on = false, onClick }: { tint: string; name: string; line: string; skin: Skin; ghost?: boolean; soon?: boolean; on?: boolean; onClick?: () => void }) {
  return (
    <button className={`mode tint--${tint}` + (on ? " mode--on" : "")} disabled={soon} aria-expanded={ghost ? on : undefined}
      aria-label={`${name}: ${line}${soon ? ". Coming soon" : ""}`} onClick={() => (sound("select"), onClick && onClick())}>
      {soon ? <span className="mode__stage"><Emblem id="build" /></span> : <Stage skin={skin} ghost={ghost} />}
      <span className="mode__name">{name}</span>
      <span className="mode__line">{line}</span>
      {soon && <span className="dare mode__soon">Coming soon</span>}
    </button>
  );
}
const Stage = ({ skin, ghost }: { skin: Skin; ghost: boolean }) => <span ref={useGnomeStage<HTMLSpanElement>(skin, { ghost })} className="mode__stage" />;

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
