"use client";

// The Builder's start on a computer (the GUI spec's B7, "Your holes"): the
// workshop (the game's Miner in his hard hat over a blueprint, what the
// Builder is for and its three steps), a new hole in a world (its tab, its
// starters as cards that show the hole and say in a line what it is), the
// drafts this browser keeps as cards with their state, and a file or a
// published hole opened. A new player never lands here first: the first run
// opens the Garden's dogleg (templates.ts firstRun).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackButton } from "@/components/About";
import { HoleMap } from "@/components/HoleMap";
import { useGnomeStage } from "@/components/Stage";
import { Emblem } from "@/components/Worlds";
import { Button, Sheet } from "@/components/ui";
import { gnomeById } from "@/lib/scene";
import { exportDraft, type Draft } from "@/lib/builder/draft";
import { draftMap, draftState } from "@/lib/builder/cards";
import { draftFile, fromFile, fromPublished } from "@/lib/builder/importing";
import { census } from "@/lib/builder/drawn";
import { loadTakedown } from "@/lib/takedown";
import { isHoleId, makeChain } from "@/lib/chain";
import { startsIn } from "@/lib/builder/templates";
import { endpoints } from "@/lib/builder/holes";
import { proofKey } from "@/lib/builder/proof";
import { FIELD, worldName } from "@/lib/builder/rules";
import type { BuilderHost } from "@/lib/builder/wasm";
import { saveFile } from "./share";

const WORLDS = Object.keys(FIELD);
/** A draft file's most: a draft of every limit at once is far under it. */
const MAX_FILE = 1 << 20;

/** A draft saved as a file (exportDraft), named after it. */
const download = (d: Draft) => saveFile(new Blob([exportDraft(d)], { type: "application/json" }), draftFile(d));

/** The drafts kept in this browser; a new hole in a world, a file opened, a published hole opened for its next version. */
export default function Start({ host, author, drafts, onOpen, onAdd, onDelete }: {
  host: BuilderHost;
  author: string | null;
  drafts: readonly Draft[];
  onOpen: (i: number) => void;
  /** a new draft, opened */
  onAdd: (d: Draft) => void;
  onDelete: (i: number) => void;
}) {
  const [world, setWorld] = useState("garden");
  const [hole, setHole] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState<number | null>(null); // the draft asked to be deleted, before the sheet's yes
  const file = useRef<HTMLInputElement>(null);
  const starts = useMemo(() => startsIn(world).map((s) => ({ ...s, map: draftMap(s.draft) })), [world]);
  const keys = useKeys(drafts, host);
  const take = (r: Draft | string) => (typeof r === "string" ? setWhy(r) : (setWhy(""), onAdd(r)));
  const openFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return setWhy("That file is too big to be a draft.");
    void f.text().then((t) => fromFile(t, host, census)).then(take, () => setWhy("That file could not be read."));
  };
  const openPublished = () => {
    const id = hole.trim();
    if (!isHoleId(id)) return setWhy("A hole's address is like g1…/its-name, or g1…/its-name/v2.");
    setBusy(true);
    const { rpc, web } = endpoints(window.location.search);
    const chain = makeChain({ rpc, web });
    // the site's takedown list too: a hole taken down never opens (the list unread, nothing does)
    void Promise.all([chain.holeData(id), loadTakedown(chain)])
      .then(([hex, taken]) => fromPublished(hex, host, id, author, census, taken), () => "The chain has no hole there, or could not be read.")
      .then(take)
      .finally(() => setBusy(false));
  };
  return (
    <div className={`screen worlds front bholes tint--${world}`}>
      <BackButton label="Back to the game" onClick={() => window.location.assign("/")} />
      <div className="worlds__in bholes__in">
        <Workshop />
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
            {[{ label: "Start from a template", list: starts.filter((s) => s.name !== "blank") }, { label: "Or start blank", list: starts.filter((s) => s.name === "blank") }].map(({ label, list }) => (
              <section key={label} className={`bholes__set${list[0]?.name === "blank" ? " bholes__set--blank" : ""}`} aria-label={label}>
                <h3 className="bholes__group">{label}</h3>
                <ul>
                  {list.map((s) => (
                    <li key={s.name}>
                      <button type="button" className={`bholes__start${s.name === "blank" ? " bholes__start--blank" : ""}`} aria-label={`${s.title}: ${s.line}${s.par ? `, par ${s.par}` : ""}. Start it`} onClick={() => onAdd(s.draft)}>
                        <span className={`bholes__map${s.name === "blank" ? " bholes__blank" : ""}`}><HoleMap hole={s.map} className="bholes__svg" /></span>
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
        <section className="bholes__mine" aria-labelledby="bholes-mine">
          <h2 id="bholes-mine" className="bholes__h">Your holes {drafts.length > 0 && <small>{drafts.length}</small>}</h2>
          {drafts.length ? (
            <ul className="bholes__list">
              {drafts.map((d, i) => {
                const st = draftState(d, keys[i] ?? null);
                return (
                  <li key={i} className="bholes__draft">
                    <span className="bholes__map bholes__map--s"><HoleMap hole={draftMap(d)} className="bholes__svg" /></span>
                    <span className="bholes__name">
                      <b>{d.title || "A hole with no name yet"}</b>
                      <small>{worldName(d.world)} · {d.pieces.length} pieces</small>
                      <span className={`bholes__state bholes__state--${st.stage}`}>{st.word}</span>
                    </span>
                    <span className="bholes__acts">
                      <Button className="btn--s" onClick={() => onOpen(i)}>Open</Button>
                      <button type="button" className="linkish" onClick={() => download(d)}>Export</button>
                      <button type="button" className="linkish" onClick={() => setWipe(i)}>Delete</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="bholes__none">No hole of yours yet: pick a starter above, it opens ready to play.</p>
          )}
        </section>
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
              <Button disabled={!hole.trim() || busy} onClick={openPublished}>{busy ? "Reading…" : "Open"}</Button>
            </span>
          </div>
        </details>
        {why && <p className="bholes__why" role="alert">{why}</p>}
      </div>
    </div>
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

/** The workshop's sign: the game's Miner in his hard hat, out of a blueprint's disc (the menu's Builder panel's), hopping under the pointer; what the Builder is for; its three steps. */
function Workshop() {
  const [hot, setHot] = useState(false);
  const stage = useGnomeStage<HTMLSpanElement>(gnomeById("miner"), { act: "hop", playing: hot });
  return (
    <header className="bholes__sign" onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
      <span ref={stage} className="bholes__gnome"><Emblem id="build" /></span>
      <div className="bholes__say">
        <span className="eyebrow">The Builder</span>
        <h1 className="worlds__title">Hard hats on!</h1>
        <p>Build your own hole. Test it. Put your name on it.</p>
      </div>
      <ol className="bholes__steps" aria-label="How it goes">
        <Step n={1} name="Pick" line="a template or a blank lane"><path d="M5 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" className="i-paper" /><path d="M6 16q4-7 8-2t4-4" className="i-dash" /><circle cx="18" cy="10" r="1.6" className="i-ink" /></Step>
        <Step n={2} name="Build" line="drag pieces onto the board"><path d="M4 20 13 11" className="i-line" /><path d="M11 6.5 15 3l6 6-3.5 4z" className="i-gold" /></Step>
        <Step n={3} name="Test & publish" line="hole it, then sign it"><path d="M8 21V4" className="i-line" /><path d="M8 4l10 3.5L8 11z" className="i-flag" /><ellipse cx="9" cy="21" rx="6" ry="1.6" className="i-ink" /></Step>
      </ol>
    </header>
  );
}

/** One of the three steps: a small inked picture, its name and a few words. */
const Step = ({ n, name, line, children }: { n: number; name: string; line: string; children: ReactNode }) => (
  <li className="bholes__step">
    <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
    <span><b><i>{n}</i>{name}</b><small>{line}</small></span>
  </li>
);
