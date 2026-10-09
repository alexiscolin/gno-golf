// What a player wears. Wearing is free (ADR-007): everyone sees the gnome
// the realm says a player wears (Worn: the one put on with Equip while held,
// else their best), read once a visit for the player and a board's page or a
// rival at a time for the others (WornMany); the ball's ghost, the boards'
// faces and the clip dress them in it (gnome.ts knowGnome, wears). The player
// plays any gnome they hold, or a free one, picked in this browser per
// account: nothing on chain. Equip only shows everyone another than the best.
import { GNOMES, knowGnome, wears, loadWardrobe, type Skin } from "../scene/gnome";
import { skinOfTraits } from "./skin";
import { isAddress } from "../chain";
import type { Worn } from "./shop";
import { told } from "./door";

type Token = Pick<Worn, "id" | "name" | "traits">;
/** A token's skin: under "t<id>" (as the catalogue's), an earned kind as the game's own gnome. */
export const tokenSkin = (t: Token, line = "") => skinOfTraits(t.traits, { id: `t${t.id}`, name: t.name, line });

// (the signal of what players wear, and the player's pick, are the shop's door's: the game's first load reads them)
export { onWear, wearVersion, pick, pickOf } from "./door";

/** These tokens' gnomes known to the game (its wardrobe fetched first): their skins, in order. */
export async function know(tokens: readonly Token[]): Promise<Skin[]> {
  if (tokens.length) await loadWardrobe();
  return tokens.map((t) => {
    const s = tokenSkin(t);
    if (!GNOMES.includes(s)) knowGnome(s);
    return s;
  });
}
const worn = new Map<string, Worn | null>();
/** What a player was last met wearing (meet): their row, null for nothing (they hold no gnome), undefined not asked. */
export const wornKnown = (player: string) => worn.get(player);
/** What these players wear for everyone (WornMany's rows), met: the ghost and the face follow; a player asked
 *  of without a row (players) wears nothing any more. */
export async function meet(rows: readonly Worn[], players: readonly string[] = []) {
  const skins = await know(rows);
  rows.forEach((r, i) => (wears(r.player, skins[i].id), worn.set(r.player, r)));
  for (const p of players) if (!rows.some((r) => r.player === p)) (wears(p, null), worn.set(p, null));
  told();
}

/** The gnome played: the pick while it is theirs (one they hold, or a free one unlocked), else the one they
 *  wear for everyone, else the gnome this browser kept (savedGnome: no wallet, or no collection). */
export function playing({ pick, held, worn, saved, free }: { pick: string | null; held: ReadonlySet<string>; worn: Worn | null; saved: string; free: (id: string) => boolean }) {
  if (pick && (held.has(pick) || free(pick))) return pick;
  if (worn) return tokenSkin(worn).id;
  return saved;
}

/** The one line the picker says of it, and whether "Show him to everyone" (Equip) is offered: only for a gnome
 *  they hold that everyone does not see already (a free gnome is nobody's to show). */
export function seen({ worn, playing, name }: { worn: Worn | null; playing: string; name: (id: string) => string }) {
  const theirs = worn ? tokenSkin(worn).id : null;
  if (theirs === playing) return { line: `Everyone sees ${name(playing)}`, show: false };
  const token = !GNOMES.some((g) => g.id === playing);
  return { line: `You play ${name(playing)} · everyone sees ${worn ? name(theirs!) : "a gnome of the game"}`, show: token };
}

// What a page's faces ask, batched: every player asked in the same moment
// goes into one read (WornMany: 50 a read), and a player is asked once a
// visit; a read that fails is asked again the next time.
const asked = new Map<string, Promise<void>>();
let batch: { players: string[]; done: Promise<void> } | null = null;
/** What player wears for everyone, met (meet) with the rest of the page's in one read. */
export function askWorn(read: (players: readonly string[]) => Promise<ReadonlyMap<string, Worn>>, player: string): Promise<void> {
  if (!isAddress(player)) return Promise.resolve();
  const had = asked.get(player);
  if (had) return had;
  if (!batch || batch.players.length >= 50) {
    const b: { players: string[]; done: Promise<void> } = { players: [], done: Promise.resolve() };
    b.done = Promise.resolve().then(async () => {
      if (batch === b) batch = null;
      try {
        const got = await read(b.players);
        await meet([...got.values()], b.players);
      } catch {
        for (const p of b.players) asked.delete(p);
      }
    });
    batch = b;
  }
  batch.players.push(player);
  asked.set(player, batch.done);
  return batch.done;
}
