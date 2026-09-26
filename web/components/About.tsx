"use client";

import { Sheet } from "@/components/ui";
import { REALM_PATH } from "@/lib/chain";

// About: who made it, how it works, and where to go next. Short on purpose.
const GITHUB = "https://github.com/alexiscolin", REPO = `${GITHUB}/gno-golf`;
const LINKS: readonly [string, string, string][] = [
  ["gno.land", "https://gno.land", "the chain the game runs on"],
  ["Adena", "https://adena.app", "the gno.land wallet, to save your rounds"],
  ["Faucet", "https://faucet.gno.land", "free test GNOT (its Pearl faucet feeds pearl-1)"],
  ["Gno docs", "https://docs.gno.land", "write your own realm"],
];

export default function About({ onClose, web }: { onClose: () => void; web: string }) {
  const out = { target: "_blank", rel: "noopener noreferrer" } as const;
  return (
    <Sheet className="about" label="About Gnogolf" onClose={onClose}>
      <span className="eyebrow">About</span>
      <h2>Gnogolf</h2>
      <p className="about__lead">Mini-golf where the ball is rolled by a smart contract.</p>

      <ol className="about__how">
        <li><b>You aim.</b> The game sends your decision (an angle, a power) to the <code>golf</code> realm on gno.land.</li>
        <li><b>The chain plays it.</b> The realm runs the physics and sends back the ball's path. Previews are free reads, so you play without a wallet.</li>
        <li><b>You keep it, if you like.</b> Adena signs one transaction; the chain replays your shots and puts the round on the board. Nobody can type in a score.</li>
      </ol>

      <ul className="about__links">
        {web && (
          <li><a href={`${web}${REALM_PATH}`} {...out}>The golf realm ↗</a><span>its code and its boards, on gnoweb</span></li>
        )}
        {LINKS.map(([name, href, what]) => (
          <li key={name}><a href={href} {...out}>{name} ↗</a><span>{what}</span></li>
        ))}
      </ul>

      <p className="about__credit">
        Made by <a href={GITHUB} {...out}><b>alexiscolin</b></a> · <a href={REPO} {...out}>the code on GitHub ↗</a>
      </p>
    </Sheet>
  );
}
