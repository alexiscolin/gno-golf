"use client";

// The game, for the home page and every hole's page: a client module of its
// own, as a dynamic import with ssr:false can only be made from one.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import Title from "@/components/Title";
import { FrontScreen } from "@/components/About";
import { MENU_HEAD, onMenuLink } from "@/lib/menu";
import { start } from "@/lib/analytics";
import { watchClicks } from "@/lib/uitrack";

// WebGL has no business running during a build: the whole game mounts in the
// browser or not at all.
const Golf = dynamic(() => import("@/components/Golf"), {
  ssr: false,
  // the title screen shows while the game loads, so nothing appears under it; the menu's address, the menu's head
  // (its cards come with the game: never the title on the way to the menu)
  loading: () => (onMenuLink() ? <MenuFrame /> : <Title loading />),
});

/** The menu's frame while the game loads: its head as the menu has it (Modes.tsx), its cards to come. */
const MenuFrame = () => <FrontScreen className="modes" back={MENU_HEAD.back} eyebrow={MENU_HEAD.eyebrow} title={MENU_HEAD.title} />;

export default function Game() {
  // analytics, once the page is idle (nothing without its key)
  useEffect(() => (void start(), watchClicks()), []);
  return <Golf />;
}
