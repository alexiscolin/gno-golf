"use client";

// The gnome shop's frame, in the game's first load (light: no shop logic):
// what the shop screen (Shop.tsx, its own chunk) shows around its data, so
// the screen has its final layout from its first paint. ShopSkeleton is what
// shows while the shop's chunk downloads (Golf.tsx's dynamic import), and
// Shop.tsx draws its own head and slots with the same pieces while the chain
// answers: the same sizes then, nothing moving once the figures come in.
import "@/app/gnomes.css";
import type { ReactNode } from "react";
import { FrontScreen } from "@/components/About";
import { BlankCard } from "./parts";

/** The sale's own head: its eyebrow, its name, one line of what it sells. */
export const SHOP_HEAD = {
  eyebrow: "Who's on the ball?",
  title: "Gnome shop",
  pitch: "Pick the exact gnome you play as. Cosmetic only: the same ball, the same physics.",
};
/** The shelf while it is read: a page of blank cards, each the size of a card on sale. */
export const BlankShelf = ({ n = 12 }: { n?: number }) => <ul className="gshelf" aria-busy="true">{Array.from({ length: n }, (_, i) => <li key={i}><BlankCard /></li>)}</ul>;
/** The closing date's line, its height fixed; only when a date is set (none by default: the frame keeps no room for it). */
export const ClosesSlot = ({ children }: { children?: ReactNode }) => <div className="closes-slot">{children}</div>;
/** The wave panel while it is read: its head, bar, prices and note lines, blank. */
export const WaveSlot = () => (
  <section className="wave wave--skel" aria-hidden="true">
    <div className="wave__head"><span>&nbsp;</span></div>
    <div className="track" />
    <p className="wave__prices">&nbsp;</p>
    <p className="wave__note">&nbsp;</p>
  </section>
);

/** The shop as it opens, before its chunk has come: its final frame, blank. */
export function ShopSkeleton({ onBack = () => {}, onAbout = () => {} }: { onBack?: () => void; onAbout?: () => void }) {
  return (
    <FrontScreen className="shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={SHOP_HEAD.eyebrow} title={SHOP_HEAD.title}>
      <p className="shop__pitch">{SHOP_HEAD.pitch}</p>
      <WaveSlot />
      <div className="gfilters gfilters--skel" aria-hidden="true" />
      <BlankShelf />
    </FrontScreen>
  );
}
