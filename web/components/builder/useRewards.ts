"use client";

// The author's published holes and the rounds saved on them, read from the
// chain (lib/builder/rewards.ts readRewards), with the author's last look at
// them: for "Your holes" on a computer (Start.tsx) and on a phone
// (PhoneBuilder.tsx, which loads nothing of the editor: lib only here).
import { useEffect, useState } from "react";
import type { Chain } from "@/lib/chain";
import { keepSeen, loadSeen, readRewards, statsOf, type SavedOn, type Seen } from "@/lib/builder/rewards";
import { loadTakedown } from "@/lib/takedown";
import type { HoleRow } from "@/lib/types";

const NONE: ReadonlySet<string> = new Set();

/**
 * The author's published holes and the rounds saved on them (null: still
 * read, or no author; a chain that cannot be read: none), and the author's
 * last look (seen) as it was before this one, which is kept now.
 */
export function useRewards(chain: Chain | null, author: string | null) {
  const [got, setGot] = useState<{ rows: HoleRow[]; saved: SavedOn; seen: Seen } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!chain || !author) return setGot(null);
    let live = true;
    const taken = loadTakedown(chain).catch(() => NONE);
    void taken.then((t) => readRewards(chain, author, t)).then(({ rows, saved }) => {
      if (!live) return;
      const seen = loadSeen();
      keepSeen(Object.fromEntries(rows.map((h) => {
        const { plays, players } = statsOf(h, saved, author);
        return [h.id, { plays, players }];
      })));
      setGot({ rows, saved, seen });
    }, () => live && setGot({ rows: [], saved: { rows: [], more: NONE }, seen: {} }));
    return () => void (live = false);
  }, [chain, author, tries]);
  return { got, reload: () => setTries((n) => n + 1) };
}
