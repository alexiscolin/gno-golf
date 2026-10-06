"use client";

// The Builder on a computer (the GUI spec's B1, B2, B5): builder.wasm
// loaded, then the drafts this browser keeps (open one, or start a new hole
// in a world), then the editor. Reached only through app/build/gate.tsx's
// dynamic import: nothing here loads on a phone.
import "@/app/title.css";
import "@/app/build/builder.css";
import "@/app/build/phone.css";
import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/About";
import { Button, Segmented } from "@/components/ui";
import { loadDrafts, saveDrafts, type Draft } from "@/lib/builder/draft";
import { blank } from "@/lib/builder/templates";
import { knownAuthor } from "@/lib/builder/holes";
import { loadBuilder } from "@/lib/builder/load";
import { FIELD } from "@/lib/builder/rules";
import type { BuilderHost } from "@/lib/builder/wasm";
import Editor from "./Editor";

const WORLDS = Object.keys(FIELD);
const name = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** The drafts kept in this browser, and a new hole's world. */
function Drafts({ drafts, onOpen, onNew, onDelete }: { drafts: readonly Draft[]; onOpen: (i: number) => void; onNew: (world: string) => void; onDelete: (i: number) => void }) {
  const [world, setWorld] = useState("garden");
  return (
    <div className="screen worlds front bholes tint--garden">
      <BackButton label="Back to the game" onClick={() => window.location.assign("/")} />
      <div className="worlds__in bholes__in">
        <div className="front__head">
          <span className="eyebrow">The Builder</span>
          <h2 className="worlds__title">Your holes</h2>
        </div>
        <section className="bholes__new" aria-label="A new hole">
          <Segmented label="Its world" value={world} options={WORLDS.map((w) => [w, name(w)] as const)} onChange={setWorld} />
          <Button variant="gold" onClick={() => onNew(world)}>+ New hole</Button>
        </section>
        {drafts.length ? (
          <ul className="bholes__list">
            {drafts.map((d, i) => (
              <li key={i} className="bphone__row">
                <span className="bphone__name"><b>{d.title || "A hole with no name yet"}</b><small>{name(d.world)} · {d.pieces.length} pieces{d.slug ? ` · ${d.slug}` : ""}</small></span>
                <span className="bholes__acts">
                  <Button className="btn--s" onClick={() => onOpen(i)}>Open</Button>
                  <button type="button" className="linkish" onClick={() => window.confirm(`Delete "${d.title || "this hole"}" from this browser?`) && onDelete(i)}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bphone__note">No hole of yours yet: start one above.</p>
        )}
      </div>
    </div>
  );
}

export default function Builder() {
  const [host, setHost] = useState<BuilderHost | null>(null);
  const [failed, setFailed] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [open, setOpen] = useState<{ i: number; first: Draft } | null>(null);
  const [unkept, setUnkept] = useState(false);
  useEffect(() => {
    setDrafts(loadDrafts());
    void loadBuilder().then(setHost, (e: Error) => setFailed(e.message));
  }, []);
  const keep = useCallback((list: Draft[]) => (setDrafts(list), setUnkept(!saveDrafts(list))), []);
  const onSave = useCallback((d: Draft) => {
    if (!open) return;
    setDrafts((list) => {
      const next = list.map((x, k) => (k === open.i ? d : x));
      setUnkept(!saveDrafts(next));
      return next;
    });
  }, [open]);

  if (failed) return <main className="builder-off" role="alert"><h1>The Builder could not load.</h1><p>{failed}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  if (open) {
    return (
      <>
        <Editor key={open.i} host={host} first={open.first} author={knownAuthor()} onSave={onSave} onBack={() => setOpen(null)} onTest={() => {}} />
        {unkept && <p className="bench__unkept" role="status">This browser keeps nothing (a private window?): export your hole before you leave.</p>}
      </>
    );
  }
  return (
    <Drafts drafts={drafts}
      onOpen={(i) => setOpen({ i, first: drafts[i] })}
      onNew={(w) => { const d = blank(w); keep([...drafts, d]); setOpen({ i: drafts.length, first: d }); }}
      onDelete={(i) => keep(drafts.filter((_, k) => k !== i))} />
  );
}
