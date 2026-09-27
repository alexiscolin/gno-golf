"use client";

import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/feel";
import { clipSupport } from "@/lib/clip";
import type { ClipRun } from "@/lib/engine/clip";
import { siteURL } from "@/lib/site";
import { pasted, shareLinks } from "./common";

// Sharing a moment on the networks: a small cluster of round icons that sits
// with the score (X, Facebook, WhatsApp, Bluesky, copy link), each opening
// that network's own share page with the text and the link. On a phone one
// more icon opens the system share sheet, with a picture of the course.


// simple filled glyphs, 24×24
const GLYPH: Record<string, string> = {
  X: "M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z",
  Facebook: "M13.5 21v-8h2.7l.4-3.2h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V13h2.7v8h3.1z",
  WhatsApp: "M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.5 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm0 17.1c-1.4 0-2.8-.4-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3a7.7 7.7 0 1 1 6.6 3.6zm4.2-5.7c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 1.9 4.5 4.5 0 0 0 1 2.4 10.3 10.3 0 0 0 4 3.5c1.5.6 2 .7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.5-.3z",
  Bluesky: "M6.3 4.4C8.6 6.1 11 9.6 12 11.5c1-1.9 3.4-5.4 5.7-7.1 1.6-1.2 4.3-2.2 4.3.9 0 .6-.4 5.2-.6 5.9-.7 2.6-3.3 3.2-5.6 2.8 4 .7 5 3 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5l-.1-.3-.1.3c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.2-1.2-4.5 2.8-5.2-2.3.4-4.9-.2-5.6-2.8C2.4 10.5 2 5.9 2 5.3c0-3.1 2.7-2.1 4.3-.9z",
};

interface ShareProps {
  text: string;
  /** a picture of the course to share, where the system sheet can take one */
  snapshot?: (() => Promise<Blob | null>) | null;
  /** the shot's clip, once made (ShareClip): shared in the picture's place */
  clip?: Clip | null;
  link?: string;
}
// the system sheet only where it is the phone's own (on a desktop it is a
// bare OS panel without the networks people mean)
const onPhone = () => typeof navigator !== "undefined" && !!navigator.share && typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

export default function Share({ text, snapshot, link = "", clip = null }: ShareProps) {
  const [copied, setCopied] = useState(false);
  const copiedT = useRef<ReturnType<typeof setTimeout>>(undefined); // the "copied" note's timer, cleared if the card goes first
  useEffect(() => () => clearTimeout(copiedT.current), []);
  // this hole, this cup, this gnome, at the game's public address
  const url = siteURL(link);
  const phone = onPhone();
  const sheet = async () => {
    sound("blip");
    try {
      // the clip when there is one and the phone can send a video, else a
      // picture of the course, else the words and the link alone
      const can = (f: File) => !!navigator.canShare && navigator.canShare({ files: [f] });
      let file: File | null = clip && can(clip.file) ? clip.file : null;
      if (!file && snapshot) {
        const blob = await snapshot();
        file = blob && new File([blob], "gnogolf.png", { type: "image/png" });
      }
      const data: ShareData = { title: "Gnogolf", text, url };
      if (file && can(file)) data.files = [file];
      await navigator.share(data);
    } catch {} // cancelled, or refused: nothing to say
  };
  const copy = async () => {
    sound("blip");
    try {
      await navigator.clipboard.writeText(pasted(text, url));
      setCopied(true);
      clearTimeout(copiedT.current);
      copiedT.current = setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  const links = shareLinks(text, url);
  return (
    <span className="share" role="group" aria-label="Share">
      <span className="share__label">Share</span>
      {links.map(([name, href]) => (
        // X takes no file from a page: with a clip, its post opens and the clip downloads, to drop in
        <a key={name} className={"share__icon share__icon--" + name.toLowerCase()} target="_blank" rel="noopener noreferrer" href={href} aria-label={`Share on ${name}`} title={name === "X" && clip && !phone ? "X: the clip downloads, drop it into the post" : name} onClick={() => (sound("blip"), name === "X" && clip && !phone && save(clip))}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={GLYPH[name]} /></svg>
        </a>
      ))}
      <button className="share__icon share__icon--copy" aria-label={copied ? "Link copied" : "Copy the link"} title={copied ? "Copied" : "Copy link"} onClick={() => void copy()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="share__stroke">{copied ? <path d="M5 12l5 5 9-10" /> : <path d="M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" />}</svg>
      </button>
      {phone && (
        <button className="share__icon share__icon--more" aria-label="More ways to share" title="More" onClick={() => void sheet()}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="share__stroke"><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" /></svg>
        </button>
      )}
    </span>
  );
}

/** A made clip: its file, and an address the page plays and saves it from. */
export interface Clip {
  url: string;
  file: File;
}
interface ClipProps {
  /** records the clip (the engine's clip()): an MP4, or null */
  make: (run: ClipRun) => Promise<Blob | null>;
  /** the file's name (lib/clip.ts clipName) */
  name: string;
  /** the clip once made, null when gone: the share buttons send it */
  onClip: (clip: Clip | null) => void;
}
/** Saves the clip as a download. */
function save(clip: Clip) {
  Object.assign(document.createElement("a"), { href: clip.url, download: clip.file.name }).click();
}

/** The shot as a clip (ADR-003; NEXT_PUBLIC_CLIPS): made once the hole is
 *  won and looped in the card, with a download in its corner; the share
 *  buttons above send it (the phone's sheet as a file, X as a download to
 *  drop in its post). Only where the browser records MP4; elsewhere nothing
 *  shows. A computer makes it as the card opens; a phone when asked (a second
 *  renderer for a few seconds is a lot to spend unasked on a phone). */
export function ShareClip({ make, name, onClip }: ClipProps) {
  const [mime] = useState(() => clipSupport());
  const [go, setGo] = useState(() => typeof matchMedia !== "undefined" && !matchMedia("(pointer: coarse)").matches);
  const [k, setK] = useState(0);
  // undefined while it is being made; null: none came of it
  const [clip, setClip] = useState<Clip | null>();
  const [still] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  // made once, from when it is asked for; the card closing cancels it and frees it all
  const run = useRef({ make, name, onClip });
  useEffect(() => {
    if (!go || !mime) return;
    const ac = new AbortController(), r = run.current;
    let url = "";
    void r
      .make({ mime, signal: ac.signal, progress: setK })
      .catch(() => null)
      .then((blob) => {
        if (ac.signal.aborted) return;
        url = blob ? URL.createObjectURL(blob) : "";
        const made = blob ? { url, file: new File([blob], r.name, { type: "video/mp4" }) } : null;
        setClip(made);
        r.onClip(made);
      });
    return () => {
      ac.abort();
      r.onClip(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [go, mime]);
  if (!mime || clip === null) return null;
  if (!go)
    return (
      <div className="clip">
        <button className="btn btn--ghost" onClick={() => (sound("blip"), setGo(true))}>Make a clip of the shot</button>
      </div>
    );
  return (
    <div className="clip">
      <div className="clip__screen">
        {!clip ? (
          <div className="clip__making" role="status" aria-live="polite">
            <span>Making the clip of your shot…</span>
            <span className="clip__bar" aria-hidden="true"><span style={{ width: `${Math.round(k * 100)}%` }} /></span>
          </div>
        ) : (
          <>
            <video ref={video} src={clip.url} muted playsInline loop autoPlay={!still} controls={still && playing} onPlay={() => setPlaying(true)} aria-label="A clip of the holing shot, looping" />
            {still && !playing && (
              <button className="clip__play" aria-label="Play the clip" onClick={() => void video.current?.play()}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </button>
            )}
            <a className="clip__save" href={clip.url} download={clip.file.name} aria-label="Download the clip" title="Download the clip" onClick={() => sound("blip")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 19h14" /></svg>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
