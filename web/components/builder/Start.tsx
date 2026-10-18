"use client";

// The Builder's start on a computer (the GUI spec's B7, "Your holes"): the
// workshop (the game's Miner in his hard hat over a blueprint, what the
// Builder is for in a line: the editor's steps say the rest), a new hole in a
// world (its tab, its starters as cards that show the hole and say in a line
// what it is), the drafts this browser keeps as cards (the whole card opens
// one; its weathers ticked as holed), the author's holes on the chain with
// who played them and the Builder's badges (Rewards.tsx), and a file or a
// published hole opened. A new player never lands here first: the first run
// opens the Garden's dogleg (templates.ts firstRun).
import { useEffect, useMemo, useRef, useState } from "react";
import { BackButton, FrontHead } from "@/components/About";
import { HoleMap, NoMap, useHoleMaps } from "@/components/HoleMap";
import { useGnomeStage } from "@/components/Stage";
import { Emblem } from "@/components/Worlds";
import { Button, Sheet } from "@/components/ui";
import { buttonClass } from "@/components/button";
import { gnomeById } from "@/lib/scene";
import { exportDraft, type Draft } from "@/lib/builder/draft";
import { draftMap, draftState } from "@/lib/builder/cards";
import { draftFile, fromFile, openPublished, type Opened } from "@/lib/builder/importing";
import { census } from "@/lib/builder/drawn";
import { isHoleId, makeChain } from "@/lib/chain";
import { startsIn } from "@/lib/builder/templates";
import { endpoints, menuLink, playLink } from "@/lib/builder/holes";
import { proofKey } from "@/lib/builder/proof";
import { FIELD, weatherName, worldName } from "@/lib/builder/rules";
import { factsOf, isFresh, statsLine, statsOf, versusLine, type HoleStats } from "@/lib/builder/rewards";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { HoleRow } from "@/lib/types";
import { BuilderBadges, SaveTestRound } from "./Rewards";
import { useRewards } from "./useRewards";
import { saveFile } from "./share";

const WORLDS = Object.keys(FIELD);
/** A draft file's most: a draft of every limit at once is far under it. */
const MAX_FILE = 1 << 20;

/** A draft saved as a file (exportDraft), named after it. */
const download = (d: Draft) => saveFile(new Blob([exportDraft(d)], { type: "application/json" }), draftFile(d));

/** The drafts kept in this browser; a new hole in a world, a file opened, a published hole opened for its next version. */
export default function Start({ host, author, drafts, said = "", onOpen, onAdd, onDelete }: {
  host: BuilderHost;
  author: string | null;
  drafts: readonly Draft[];
  /** why something asked of the Builder on arrival (a remix) did not open */
  said?: string;
  onOpen: (i: number) => void;
  /** a new draft, opened */
  /** a new draft, and why it is broken if it is (a file opened as it is: "" if it passes) */
  onAdd: (d: Draft, broken?: string) => void;
  onDelete: (i: number) => void;
}) {
  const [world, setWorld] = useState("garden");
  const [hole, setHole] = useState("");
  const [why, setWhy] = useState(said);
  useEffect(() => void (said && setWhy(said)), [said]);
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState<number | null>(null); // the draft asked to be deleted, before the sheet's yes
  const file = useRef<HTMLInputElement>(null);
  // each starter's map, and whether it is the blank lane (its own group, its own card)
  const starts = useMemo(() => startsIn(world).map((s) => ({ ...s, map: draftMap(s.draft), blank: s.name === "blank" })), [world]);
  const keys = useKeys(drafts, host);
  const { chain, keep } = useMemo(() => {
    const { rpc, web, keep } = endpoints(window.location.search);
    return { chain: makeChain({ rpc, web }), keep };
  }, []);
  // the author's holes on the chain: each draft's own (its alias), and those this browser has no draft of
  const { got, reload } = useRewards(chain, author);
  const rowOf = (d: Draft) => (author && d.slug && got?.rows.find((h) => h.slot === `${author}/${d.slug}`)) || null;
  const elsewhere = got?.rows.filter((h) => !drafts.some((d) => rowOf(d) === h)) ?? [];
  const maps = useHoleMaps(chain, elsewhere.map((h) => h.id));
  const live = (h: HoleRow) => {
    if (!got || !author) return null;
    const s = statsOf(h, got.saved, author);
    return <Live s={s} fresh={isFresh(h.id, s, got.seen)} />;
  };
  const take = (r: Draft | Opened | string) => (typeof r === "string" ? setWhy(r) : (setWhy(""), "broken" in r ? onAdd(r.draft, r.broken) : onAdd(r)));
  const openFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return setWhy("That file is too big to be a draft.");
    void f.text().then((t) => fromFile(t, host, census)).then(take, () => setWhy("That file could not be read."));
  };
  const openHole = (id = hole.trim()) => {
    if (!isHoleId(id)) return setWhy("A hole's address is like g1…/its-name, or g1…/its-name/v2.");
    setBusy(true);
    void openPublished(chain, host, census, id, author).then(take).finally(() => setBusy(false));
  };
  const count = drafts.length + elsewhere.length, any = count > 0;
  const fresh = (
    <section className="bholes__new" aria-labelledby="bholes-new">
      <div className="bholes__bar">
        <h2 id="bholes-new" className="bholes__h">Start a new hole</h2>
        {/* the worlds as tabs, each in its colours with its emblem (the cups' own) */}
        <div className="bholes__worlds" role="radiogroup" aria-label="Its world">
          {WORLDS.map((w) => (
            <button key={w} type="button" role="radio" aria-checked={w === world} className={`bholes__world tint--${w}${w === world ? " on" : ""}`} onClick={() => setWorld(w)}>
              <Emblem id={w} />{worldName(w)}
            </button>
          ))}
        </div>
      </div>
      {/* the starters are templates, ready-made holes to change; the blank lane one card of the same row, under its own label */}
      <div className="bholes__starts">
        {([["Start from a template", false], ["Or start blank", true]] as const).map(([label, blank]) => (
          <section key={label} className={`bholes__set${blank ? " bholes__set--blank" : ""}`} aria-label={label}>
            <h3 className="bholes__group">{label}</h3>
            <ul>
              {starts.filter((s) => s.blank === blank).map((s) => (
                <li key={s.name}>
                  <button type="button" className={`bholes__start${s.blank ? " bholes__start--blank" : ""}`} aria-label={`${s.title}: ${s.line}${s.par ? `, par ${s.par}` : ""}. Start it`} onClick={() => onAdd(s.draft)}>
                    <span className={`bholes__map${s.blank ? " bholes__blank" : ""}`}><HoleMap hole={s.map} className="bholes__svg" /></span>
                    <b>{s.title}</b>
                    <span className="bholes__line">{s.line}</span>
                    <span className="bholes__foot" aria-hidden="true">
                      <span className="bholes__par">{s.par ? `Par ${s.par}` : "Your par"}</span>
                      <span className="bholes__go">Start <i>→</i></span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
  const mine = (
    <section className="bholes__mine" aria-labelledby="bholes-mine">
      <h2 id="bholes-mine" className="bholes__h">Your holes {any && <small>{count}</small>}</h2>
      {got && author && got.rows.length > 0 && <BuilderBadges facts={factsOf(got.rows, got.saved, author)} />}
      {any ? (
        <ul className="bholes__list">
          {drafts.map((d, i) => {
            const st = draftState(d, keys[i] ?? null), h = rowOf(d);
            return (
              <li key={i} className="bholes__draft bholes__draft--open">
                <span className="bholes__map bholes__map--s"><HoleMap hole={draftMap(d)} className="bholes__svg" /></span>
                <span className="bholes__name">
                  {/* the whole card opens it (this button's area covers it: its other links over it) */}
                  <button type="button" className="bholes__pick" onClick={() => onOpen(i)}><b>{d.title || "A hole with no name yet"}</b></button>
                  <small>{worldName(d.world)} · {d.pieces.length} pieces</small>
                  {/* its weathers, ticked as holed (published and none holed here since: its line on the chain says it all) */}
                  {!(h && st.stage === "new") && (
                    <span className={`bholes__state bholes__state--${st.stage}`} aria-label={`Weathers holed: ${st.word}`}>
                      {st.ticks.map((t, k) => <span key={t.kind} className={t.done ? "on" : undefined}>{k ? " · " : ""}{weatherName(t.kind)}{t.done ? " ✓" : ""}</span>)}
                    </span>
                  )}
                  {h && live(h)}
                  {/* the author's test round, the record to beat while none of theirs is saved */}
                  {h && got && author && !statsOf(h, got.saved, author).mine && <SaveTestRound chain={chain} proofs={d.proofs} id={h.id} world={d.world} author={author} onSaved={reload} />}
                </span>
                <span className="bholes__acts">
                  {h && <a className="linkish" href={playLink(h, keep)}>Play</a>}
                  <button type="button" className="linkish" onClick={() => download(d)}>Export</button>
                  <button type="button" className="linkish" onClick={() => setWipe(i)}>Delete</button>
                </span>
              </li>
            );
          })}
          {/* published from another browser (or the draft deleted): on the chain, opened as its next version */}
          {elsewhere.map((h) => {
            const m = maps.get(h.id);
            return (
              <li key={h.id} className="bholes__draft">
                <span className="bholes__map bholes__map--s">{m ? <HoleMap hole={m} className="bholes__svg" /> : <NoMap className="bholes__svg" />}</span>
                <span className="bholes__name">
                  <b>{h.name || h.slot}</b>
                  <small>{worldName(h.world)} · par {h.par}</small>
                  {live(h)}
                </span>
                <span className="bholes__acts">
                  <a className={buttonClass({ size: "s" })} href={playLink(h, keep)}>Play</a>
                  <button type="button" className="linkish" disabled={busy} onClick={() => openHole(h.id)}>Open its next version</button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="bholes__none">No hole of yours yet: pick a starter above, it opens ready to play.</p>
      )}
    </section>
  );
  return (
    <div className={`screen worlds front bholes tint--${world}`}>
      <BackButton label="Back to the game" onClick={() => window.location.assign(menuLink(keep))} />
      <div className="worlds__in bholes__in">
        <Workshop />
        {/* a returning builder's holes first, above the fold; none yet, the starters first and the empty list's line after */}
        {any ? <>{mine}{fresh}</> : <>{fresh}{mine}</>}
        {wipe !== null && drafts[wipe] && (
          // the game's own sheet (focus in, Tab kept, Escape, focus back to the row's Delete)
          <Sheet className="confirm" role="alertdialog" label="Delete this hole" onClose={() => setWipe(null)}>
            <h2>Delete &ldquo;{drafts[wipe].title || "this hole"}&rdquo;?</h2>
            <p>It goes from this browser. Export it first to keep a copy.</p>
            <div className="banner__row">
              <Button onClick={() => setWipe(null)}>Keep it</Button>
              <Button variant="primary" className="btn--danger" onClick={() => (onDelete(wipe), setWipe(null))}>Delete</Button>
            </div>
          </Sheet>
        )}
        <details className="bholes__more">
          <summary>Open a file, or a published hole</summary>
          <div className="bholes__open">
            <Button onClick={() => file.current?.click()}>Open a file…</Button>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => (openFile(e.target.files?.[0]), (e.target.value = ""))} />
            <span className="bholes__hole">
              <input value={hole} placeholder="g1…/its-name" aria-label="A published hole's address" spellCheck={false} autoCapitalize="off" onChange={(e) => setHole(e.target.value)} />
              <Button disabled={!hole.trim() || busy} onClick={() => openHole()}>{busy ? "Reading…" : "Open"}</Button>
            </span>
          </div>
        </details>
        {why && <p className="bholes__why" role="alert">{why}</p>}
      </div>
    </div>
  );
}

/** A published hole's line on its card: on the chain, a dot for what is new since the last look, its players and plays, its best against the author's. */
function Live({ s, fresh }: { s: HoleStats; fresh: boolean }) {
  const vs = versusLine(s);
  return (
    <>
      <span className="bholes__state bholes__state--live">On gno.land{fresh && <i className="bholes__dot" role="img" aria-label="New since your last visit" title="New since your last visit" />}</span>
      <small className="bholes__stats">{statsLine(s)}</small>
      {vs && <small className="bholes__stats">{vs}</small>}
    </>
  );
}

/** Each draft's proof key (proof.ts proofKey: the hole as it is now), for its state; null with no proofs, or one fit refuses. */
function useKeys(drafts: readonly Draft[], host: BuilderHost) {
  const [keys, setKeys] = useState<(string | null)[]>([]);
  useEffect(() => {
    let live = true;
    void Promise.all(drafts.map((d) => (d.proofs.length ? proofKey(d, host) : Promise.resolve(null)))).then((k) => live && setKeys(k));
    return () => void (live = false);
  }, [drafts, host]);
  return keys;
}

/** The workshop's sign: the game's Miner in his hard hat, out of a blueprint's disc (the menu's Builder panel's), hopping under the pointer; what the Builder is for, in a line. */
function Workshop() {
  const [hot, setHot] = useState(false);
  const stage = useGnomeStage<HTMLSpanElement>(gnomeById("miner"), { act: "hop", playing: hot });
  return (
    <header className="bholes__sign" onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
      <span ref={stage} className="bholes__gnome"><Emblem id="build" /></span>
      <div className="bholes__say">
        <FrontHead eyebrow="The Builder" title="Hard hats on!" h1 />
        <p>Build your own hole, sink it in every weather, put your name on it.</p>
      </div>
    </header>
  );
}
