# ADR-011: The collection as status: an album and a collector rank

## Status

Accepted, 2026-10-07. Built: `web/lib/gnomes/collection.ts` (the one
module), `web/components/gnomes/Album.tsx`, `Rank.tsx`; read by the gallery,
My gnomes, a player's gnomes, the boards, a duel and the picker. The realm
(`r/gnogolf/gnomes`, ADR-007) does not change. Not built, by the user's
decision: early access for holders, rewards for a completed set.

## Context

The user asked for a reason to collect that is status only: no gift, no
draw, nothing to win, no promise. What a player holds should read as an
album (each world, each tier, each archetype's set, a silhouette for each
one missing) and as a rank beside their name wherever they appear. The
words must carry no money (no value, worth, floor, profit, an asset that is
rare) and no hurry.

Two constraints shape it. The realm has no read of a collection's summary:
`GnomesOf(owner, offset)` lists a wallet, 100 rows a page, best first
(ADR-007); `WornMany` says what a board's page wears, 50 players a read.
And the shop is not offered in some regions (ADR-007, "Where the shop
opens"), while the tokens, and the gnome each player wears, exist on the
chain wherever the viewer is.

## Decision

**One module, every surface.** `collection.ts` holds the thresholds, the
album, the rank, the reader and every word the surfaces show; the album and
the badge are drawn from it alone, so a threshold or a word changes in one
place. A test scans its strings (and the two components') for the words the
user ruled out.

**The album is the catalogue's own data.** Its worlds are the catalogue's
homes, its tiers the tiers sold and the earned nine, its sets the
archetypes the catalogue carries (14 in the Genesis, 48 to 57 gnomes each):
nothing is invented, and a later series adds its own rows. An earned gnome is
known by its traits; an id the catalogue lacks is counted apart, in no row.
The full album (each row's silhouettes) is in My gnomes and on a player's
gnomes; the gallery shows one line of it ("Your album · Garden 3/104"), a
tap to the album, nothing that pushes its cards down.

**The rank is points, in one config.** A Common counts 1, a Rare 2, an Epic
4, a Legendary 8, an earned gnome 1 (proof of play, never bought: a player
who has only played reaches Bronze). Bronze from 1, Silver from 8, Gold from
20, Legendary from 36 with a Legendary held: one wallet's lifetime caps
(10, 5, 2, 1: 36 points) reach the top, nothing past them is needed. The
rank is shown, never sold, and changes nothing in play.

| rank | points | with |
|---|---|---|
| Bronze | 1 | |
| Silver | 8 | |
| Gold | 20 | |
| Legendary | 36 | a Legendary |

**One page decides a rank.** The realm lists a wallet best first, so the
first page of `GnomesOf` holds every Legendary, Epic and Rare before any
Common; a row past it counts the least a gnome counts (1). With the top
threshold under 100 points, a full first page reaches every rank: one page
decides, exactly (a test holds the config to it). A player's own rank counts
every page, which the screens read already.

**Reads, bounded and cached.** A board's faces already read `WornMany` for
its page (wear.ts `askWorn`); a player it finds wearing nothing holds
nothing, and costs no more. For each one wearing a gnome, one `GnomesOf`
page, at most four at a time, once a visit for each chain and address; a
read that fails is asked again the next time, and shows no badge meanwhile.
The player's own gnomes, read whole by the picker and the shop, are kept
without a read. A badge is drawn inline after the name, its height within
the line's: a row never moves when it lands.

| screen | reads it adds |
|---|---|
| a board's page of 20 | one `GnomesOf` page per holder shown (0 to 20), none for the rest |
| a duel | one page for the rival (none if they hold nothing) |
| the picker, My gnomes | none (the player's own gnomes, read already) |
| a player's gnomes | none (their page, read already) |

**Where it shows.** Off with the shop's flag (`NEXT_PUBLIC_GNOMES`): no
album, no rank, no read. In a region the shop is not offered in, there is
no album (it lives in the shop, which is shut there) and no line or door to
it; **the ranks still show on the boards, a duel and the picker**, every
region alike. Why:

- A rank is a fact of the chain, as the gnome a player wears, which the
  boards' faces and the ghosts already show in every region (ADR-007,
  "Wearing is free"): hiding one and not the other would say two things
  about the same player.
- A board must read the same to everyone on it: a duel between a player in
  a blocked region and one outside it compares the same rows, names and
  badges.
- The tokens exist wherever the viewer is: a player who holds gnomes (bought
  elsewhere, moved to them, or earned in play: earned gnomes are not the
  shop's) is shown as what they hold, not as nothing.
- The badge sells nothing: it is not a link, carries no price, no date and
  no "next rank"; the next rank and how points count are said only in the
  album, behind the shop's gate.

## Consequences

- A new threshold, weight or rank is one edit of `COLLECTOR`; the tests say
  at once if one page no longer decides a rank.
- A later series' gnomes count towards a rank by their tier (the realm's
  rows carry it) and join the album when the served catalogue carries them.
- A realm read of a collection's counts (a `CollectorsOf(list)` answering a
  board's page in one query) would cut a board's reads to one; it is a
  realm change, left for its next version.
- Whether a rank should also show on a player's gnomes on gno.land (the
  realm's `Render`) is the realm's call: not done.
