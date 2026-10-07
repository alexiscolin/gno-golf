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
import { useGnomeStage } from "@/components/Stage";
import type { Skin } from "@/lib/scene/gnome";
import { Button } from "@/components/ui";
import { BlankCard } from "./parts";
import { SHOP_TITLE } from "@/lib/gnomes/door";

/** The sale's own head, as every front screen's (About.tsx FrontScreen, the rival's size): its pill, its title, one
 *  line of what it sells; its other pages' pill (a player's gnomes, the player's own: their own title). */
export const SHOP_HEAD = {
  eyebrow: "Choose your gnome",
  title: SHOP_TITLE,
  page: "The gnome shop",
  pitch: "Pick the exact gnome you play as. Cosmetic only: the same ball, the same physics.",
};
/** The shopkeeper: the menu's Shop panel's gnome (Golf.tsx useShopSkin), small, standing past the title's last letter
 *  in his act (still under reduced motion: the stage's own clock); out of the flow, the head no taller. */
const ShopKeeper = ({ skin }: { skin: Skin }) => <span ref={useGnomeStage<HTMLSpanElement>(skin, { act: "shop" })} className="shopkeeper" aria-hidden="true" />;
/** The sale's title, the shopkeeper by it once known. */
export const ShopTitle = ({ keeper }: { keeper?: Skin | null }) => <>{SHOP_HEAD.title}{keeper && <ShopKeeper skin={keeper} />}</>;
/** Under the title (FrontScreen's dare): the head's one line. */
export const ShopPitch = () => <p className="shop__pitch">{SHOP_HEAD.pitch}</p>;
/** The shelf while it is read: a page of blank cards, each the size of a card on sale. */
export const BlankShelf = ({ n = 12 }: { n?: number }) => <ul className="gshelf" aria-busy="true">{Array.from({ length: n }, (_, i) => <li key={i}><BlankCard /></li>)}</ul>;
/** The closing date's line, its height fixed: where a date is set, or while it is not known (lib/gnomes/shop.ts closingSlot). */
export const ClosesSlot = ({ children }: { children?: ReactNode }) => <div className="closes-slot">{children}</div>;
/** The sale's line while it is read: its room, blank (its height fixed: app/gnomes.css .wline). */
export const WaveSlot = () => <div className="wline wline--skel" aria-hidden="true" />;
/** The toolbar while it is read: its rows' room, blank (their heights fixed: app/gnomes.css .gbar). */
export const BarSlot = () => <div className="gbar gbar--skel" aria-hidden="true" />;

/** The shop as it opens, before its chunk has come: its final frame, blank, Back and About working (the shop's own),
 *  the closing line's room as the sale already read says (closing); onRetry, once the chunk could not be fetched. */
export function ShopSkeleton({ onBack, onAbout, closing, keeper, onRetry }: { onBack: () => void; onAbout: () => void; closing: "line" | "none" | "room"; keeper?: Skin | null; onRetry?: () => void }) {
  return (
    <FrontScreen className="front--fit shop" back="Back" onBack={onBack} onAbout={onAbout} eyebrow={SHOP_HEAD.eyebrow} title={<ShopTitle keeper={keeper} />} dare={<ShopPitch />}>
      {closing !== "none" && <ClosesSlot />}
      <WaveSlot />
      <BarSlot />
      {onRetry ? <div className="gempty" role="alert"><p>The shop did not load.</p><Button variant="primary" onClick={onRetry}>Try again</Button></div> : <BlankShelf />}
    </FrontScreen>
  );
}
