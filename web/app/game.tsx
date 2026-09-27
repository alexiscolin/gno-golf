"use client";

// The game, for the home page and every hole's page: a client module of its
// own, as a dynamic import with ssr:false can only be made from one.
import dynamic from "next/dynamic";
import Title from "@/components/Title";

// WebGL has no business running during a build: the whole game mounts in the
// browser or not at all.
const Golf = dynamic(() => import("@/components/Golf"), {
  ssr: false,
  // the title screen shows while the game loads, so nothing appears under it
  loading: () => <Title loading />,
});

export default function Game() {
  return <Golf />;
}
