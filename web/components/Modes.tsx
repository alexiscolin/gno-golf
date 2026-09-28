"use client";

// The first choice, before the cups: play alone, race a player's ghost
// (ADR-004), or, to come, build a hole. A duel asks whom to race on a screen
// of its own (Rival), then the cups: the rival's ghost is raced on every hole
// they have a best on. Panels of their own, a kart game's modes.
import { useId, useState, type FormEvent } from "react";
import { Emblem } from "@/components/Worlds";
import { useGnomeStage } from "@/components/Stage";
import { gnomeById } from "@/lib/scene";
import type { Act, Skin } from "@/lib/scene/gnome";
import type { Snapshot } from "@/lib/engine";
import { AboutButton, BackButton } from "@/components/About";
import { Button } from "@/components/ui";
import { FullBoard } from "@/components/Leaderboard";
import { isAddress, type Chain } from "@/lib/chain";
import { sound } from "@/lib/feel";
import type { Mode } from "@/lib/types";

export default function Modes({ gnome, onSolo, onDuel, onBack, onAbout }: { gnome: string; onSolo: () => void; onDuel: () => void; onBack: () => void; onAbout: () => void }) {
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
          <li><Panel kind="solo" name="Solo" line="Four cups, your best on the boards" skin={skin} onClick={onSolo} /></li>
          <li><Panel kind="duel" name="Duel" line="Race a player's ghost, stroke for stroke" skin={skin} onClick={onDuel} /></li>
          <li><Panel kind="build" name="Builder" line="Draw your own hole, dare the others" skin={skin} soon /></li>
        </ul>
      </div>
    </div>
  );
}

/** A game's panel, as a kart game's modes are: its colour edge to edge, the
 *  gnome's act in 3D (a duel's ghost taking turns with him) playing under the
 *  pointer or the focus only, its name inked big. One to come is drawn,
 *  dimmed, with its sticker (and no 3D of its own). */
function Panel({ kind, name, line, skin, soon = false, onClick }: { kind: "solo" | "duel" | "build"; name: string; line: string; skin: Skin; soon?: boolean; onClick?: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <button className={`mode mode--${kind}`} disabled={soon} aria-label={`${name}: ${line}${soon ? ". Coming soon" : ""}`}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      onClick={() => (sound("select"), onClick && onClick())}>
      {kind === "build" ? <span className="mode__stage"><Emblem id="build" /></span> : <Stage skin={skin} act={kind} playing={hot} />}
      <span className="mode__name">{name}</span>
      <span className="mode__line">{line}</span>
      {soon && <span className="dare mode__soon">Coming soon</span>}
    </button>
  );
}
const Stage = ({ skin, act, playing }: { skin: Skin; act: Act; playing: boolean }) => <span ref={useGnomeStage<HTMLSpanElement>(skin, { act, playing })} className="mode__stage" />;

/**
 * A duel's rival, on a screen of their own: a name or an address typed (the
 * (i) says where to find one), or anyone on the course's board, a tap away.
 * Then the cups: their ghost is raced on every hole they have a best on.
 */
export function Rival({ s, chain, me, mode, onPick, onBack, onAbout }: { s: Snapshot; chain: Chain | null; me: string | null; mode: Mode; onPick: (addr: string) => void; onBack: () => void; onAbout: () => void }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState(false);
  const popId = useId();
  const go = async (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    const addr = isAddress(v) ? v : chain ? await chain.resolveName(v).catch(() => "") : "";
    if (!addr) return setNote(`No gno.land name “${v}” here. Check the spelling, or pick someone below.`);
    // a duel is played where their ghost is: someone with no saved round has none (a failed read lets them through)
    const ids = (s.allHoles || []).filter((h) => h.official).map((h) => h.id);
    const has = !chain || !ids.length || (await chain.ghostHoles(ids, addr).then((h) => h.size > 0, () => true));
    if (!has) return setNote(`${v} has no saved round yet: no ghost to race. Pick someone below.`);
    onPick(addr);
  };
  return (
    <div className="screen worlds front modes tint--garden">
      <BackButton label="Back to the games" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in rival">
        <div className="front__head">
          <span className="eyebrow">Choose your rival</span>
          <h2 className="worlds__title">Who do we race?</h2>
          <p className="dare">Their best round, as a ghost. Beat it!</p>
        </div>
        {/* two ways: someone you know, typed; else anyone on the board */}
        <section className="rival__way">
          <h3 className="about__h">Race a friend</h3>
          <form className="friends__add" onSubmit={(e) => void go(e)}>
            <input value={typed} onChange={(e) => (setTyped(e.target.value), setNote(""))} placeholder="nym-ace123 or g1…" aria-label="Your friend's gno.land name or address" />
            <Button variant="primary" type="submit" disabled={!typed.trim()}>Race</Button>
          </form>
          {note && <p className="note note--warn">{note}</p>}
          <p className="drawer__note">
            Their gno.land name or address.
            <button type="button" className="aimset__info" aria-expanded={why} aria-describedby={why ? popId : undefined} aria-label="How do I get it?" onClick={() => setWhy((v) => !v)} onBlur={() => setWhy(false)}>ⓘ</button>
            {why && <span id={popId} className="aimset__pop" role="note">Ask them for it, or for their dare link: it opens the duel straight away, nothing to type.</span>}
          </p>
        </section>
        <section className="rival__way">
          <h3 className="about__h">Or race anyone on the board</h3>
          <p className="drawer__note">Their ghost waits on each hole they saved a round on. Playing stays free.</p>
          <FullBoard kind="course" s={s} chain={chain} me={me} mode={mode} onRace={onPick} />
        </section>
      </div>
    </div>
  );
}

/** The game chosen, said big in the top-left corner beside Back (the rival's
 *  screen, the cups, the picker), in its panel's colour. */
export const ModeTag = ({ kind }: { kind: "solo" | "duel" }) => <span className={`modetag mode--${kind}`}>{kind === "duel" ? "Duel" : "Solo"}</span>;
