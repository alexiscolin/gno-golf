"use client";

// The Builder on a computer (the GUI spec's B1, B2, B5): builder.wasm
// loaded, then the drafts this browser keeps (open one, or start a new hole
// in a world), then the editor. Reached only through app/build/gate.tsx's
// dynamic import: nothing here loads on a phone.
import "@/app/title.css";
import "@/app/build/builder.css";
import "@/app/build/phone.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackButton } from "@/components/About";
import { Button, Segmented } from "@/components/ui";
import { exportDraft, loadDrafts, saveDrafts, type Draft } from "@/lib/builder/draft";
import { draftFile, fromFile, fromPublished } from "@/lib/builder/importing";
import { isHoleId, makeChain } from "@/lib/chain";
import { startsIn } from "@/lib/builder/templates";
import { endpoints, knownAuthor } from "@/lib/builder/holes";
import { canonicalHex, parAllowed, proofKey, provedAs } from "@/lib/builder/proof";
import { loadBuilder } from "@/lib/builder/load";
import { FIELD } from "@/lib/builder/rules";
import type { BuilderHost } from "@/lib/builder/wasm";
import Editor from "./Editor";
import Header from "./Header";
import Publish from "./Publish";
import TestMode from "./TestMode";

const WORLDS = Object.keys(FIELD);
const name = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** A draft saved as a file (exportDraft), named after it. */
function download(d: Draft) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([exportDraft(d)], { type: "application/json" }));
  a.download = draftFile(d);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** The drafts kept in this browser; a new hole in a world, a file opened, a published hole opened for its next version. */
function Drafts({ host, author, drafts, onOpen, onAdd, onDelete }: {
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
  const file = useRef<HTMLInputElement>(null);
  const take = (r: Draft | string) => (typeof r === "string" ? setWhy(r) : (setWhy(""), onAdd(r)));
  const openFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return setWhy("That file is too big to be a draft.");
    void f.text().then(fromFile).then(take, () => setWhy("That file could not be read."));
  };
  const openPublished = () => {
    const id = hole.trim();
    if (!isHoleId(id)) return setWhy("A hole's address is like g1…/its-name, or g1…/its-name/v2.");
    setBusy(true);
    const { rpc, web } = endpoints(window.location.search);
    void makeChain({ rpc, web }).holeData(id)
      .then((hex) => fromPublished(hex, host, id, author), () => "The chain has no hole there, or could not be read.")
      .then(take)
      .finally(() => setBusy(false));
  };
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
          <div className="bholes__starts">
            {startsIn(world).map((s) => <Button key={s.name} variant={s.name === "blank" ? "secondary" : "gold"} onClick={() => onAdd(s.draft)}>+ {s.title}</Button>)}
          </div>
        </section>
        {drafts.length ? (
          <ul className="bholes__list">
            {drafts.map((d, i) => (
              <li key={i} className="bphone__row">
                <span className="bphone__name"><b>{d.title || "A hole with no name yet"}</b><small>{name(d.world)} · {d.pieces.length} pieces{d.slug ? ` · ${d.slug}` : ""}</small></span>
                <span className="bholes__acts">
                  <Button className="btn--s" onClick={() => onOpen(i)}>Open</Button>
                  <button type="button" className="linkish" onClick={() => download(d)}>Export</button>
                  <button type="button" className="linkish" onClick={() => window.confirm(`Delete "${d.title || "this hole"}" from this browser?`) && onDelete(i)}>Delete</button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bphone__note">No hole of yours yet: start one above.</p>
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

/** A draft file's most: a draft of every limit at once is far under it. */
const MAX_FILE = 1 << 20;

export default function Builder() {
  const [host, setHost] = useState<BuilderHost | null>(null);
  const [failed, setFailed] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  // the draft open (its place in the list), how many times opened (a fresh editor each), and the step
  const [open, setOpen] = useState<{ i: number; n: number; step: "edit" | "test" | "publish"; test?: { hex: string; key: string } } | null>(null);
  const [author, setAuthor] = useState<string | null>(null);
  const [unkept, setUnkept] = useState(false);
  useEffect(() => {
    setDrafts(loadDrafts());
    setAuthor(knownAuthor());
    void loadBuilder().then(setHost, (e: Error) => setFailed(e.message));
  }, []);
  const keep = useCallback((list: Draft[]) => (setDrafts(list), setUnkept(!saveDrafts(list))), []);
  const at = open?.i ?? -1;
  const update = useCallback((f: (d: Draft) => Draft) => {
    if (at < 0) return;
    setDrafts((list) => {
      const next = list.map((x, k) => (k === at ? f(x) : x));
      setUnkept(!saveDrafts(next));
      return next;
    });
  }, [at]);
  const onSave = useCallback((d: Draft) => update(() => d), [update]);

  if (failed) return <main className="builder-off" role="alert"><h1>The Builder could not load.</h1><p>{failed}</p><Button onClick={() => window.location.reload()}>Try again</Button></main>;
  if (!host) return <main className="builder-off" aria-busy="true"><p>Loading the Builder…</p></main>;
  const unkeptNote = unkept && <p className="bench__unkept" role="status">This browser keeps nothing (a private window?): export your hole before you leave.</p>;
  if (open && drafts[open.i]) {
    const d = drafts[open.i], edit = () => setOpen({ ...open, n: open.n + 1, step: "edit", test: undefined });
    const publish = () => setOpen({ ...open, step: "publish" });
    if (open.step === "publish" && author) {
      return (
        <div className={`pbench tint--${d.world}`}>
          <Header title={d.title} slug={d.slug} author={author} world={d.world} worlds={[d.world]} step="publish"
            steps={{ edit: { locked: "", done: true }, test: { locked: "", done: true }, publish: { locked: "", done: false } }}
            action={null} history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))} onSlug={() => {}} onWorld={() => {}}
            onStep={(s) => (s === "edit" ? edit() : s === "test" && setOpen({ ...open, step: "edit" }))} onBack={edit} />
          <Publish host={host} draft={d} author={author} onDraft={(x) => update(() => x)} onRetest={edit} onDone={() => {}} />
          {unkeptNote}
        </div>
      );
    }
    if (open.step === "test" && open.test) {
      const { hex, key } = open.test, proved = !!author && !!provedAs(d.proofs, d.world, key, author, d.slug);
      return (
        <div className={`tbench tint--${d.world}`}>
          <Header title={d.title} slug={d.slug} author={author} world={d.world} worlds={[d.world]} step="test"
            steps={{ edit: { locked: "", done: true }, test: { locked: "", done: proved }, publish: { locked: proved ? "" : "Hole it in every weather first", done: false } }}
            action={proved ? { text: "Publish →", kind: "chain", onClick: publish } : { text: "Back to edit", kind: "ghost", onClick: edit }}
            history={null} onTitle={(t) => update((x) => ({ ...x, title: t }))} onSlug={() => {}} onWorld={() => {}} onStep={(s) => (s === "edit" ? edit() : s === "publish" && proved && publish())} onBack={edit} />
          <TestMode host={host} draft={d} hex={hex} proofKey={key} author={author} onAuthor={setAuthor}
            onProof={(p) => update((x) => ({ ...x, proofs: [...x.proofs.filter((q) => !(q.kind === p.kind && q.id === p.id && q.key === p.key)), p] }))}
            onPar={(par) => update((x) => (parAllowed(x.proofs.filter((q) => q.key === key), x.par) ? x : { ...x, par }))} />
          {unkeptNote}
        </div>
      );
    }
    return (
      <>
        <Editor key={`${open.i}/${open.n}`} host={host} first={d} author={author} onSave={onSave} onBack={() => setOpen(null)} onPublish={publish}
          onTest={(x) => {
            const hex = canonicalHex(x, host);
            if (hex == null) return;
            void proofKey(x, host).then((key) => key && setOpen({ ...open, step: "test", test: { hex, key } }));
          }} />
        {unkeptNote}
      </>
    );
  }
  return (
    <Drafts host={host} author={author} drafts={drafts}
      onOpen={(i) => setOpen({ i, n: 0, step: "edit" })}
      onAdd={(d) => { keep([...drafts, d]); setOpen({ i: drafts.length, n: 0, step: "edit" }); }}
      onDelete={(i) => keep(drafts.filter((_, k) => k !== i))} />
  );
}
