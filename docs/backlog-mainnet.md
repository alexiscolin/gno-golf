# Backlog: before mainnet

What the game still needs before it goes to mainnet, the first of it a new
golf realm (v3), deployed and tried on a local chain and on the testnet first.
The Builder opens on onyx's golf/v2 as it is: everything here is on top of
what the site already prevents (the Builder's rules, E1–E17, and a community
hole listed only once its author holds a best on chain).

## The golf realm v3

| What | Why | Priority |
|---|---|---|
| **mines/15: its pulsed bat moved clear of the void** | From 11 of the 626 places a ball can rest beside the bat at (27.06, 20.86), the bat comes back and pushes it into the void, where no shot of the next three strokes gets it out: a course hole a player can be stuck on. The data is the realm's (course holes), so it moves with v3, unless v2 can republish a course hole (to check). Found by the 2026-10-22 audit: balls set at rest beside each bat, then played. | High |
| **`PublishMine` requires a holing proof round** | Today the chain checks a hole's format, limits and gas only: a hole published by hand (gnokey) skips the Builder's rules and its proof. The site hides it until its author holds a best, but gnoweb and any other client still show it. Replay one proof round on publish (its gas measured: a heavy hole's round must fit a transaction). | High |
| **A pushed ball's way back is where it was before the push** | A piece that comes back (pulsed or timed) pushes a resting ball out of it with `UnstickIn`, which only avoids the hole's walls: into water, the stroke's "back to where it started" is then the water. The Builder refuses such pieces near water, a mouth or the lane's edge (E17); the physics should not need it. A physics change: a rules version. | Medium |
| **`DayCandidates`** | Missing from onyx's golf/v2 (deployed before it): no community hole of the day there. | Medium |
| **A best keeps the block of its first holing** | The hole of the day counts a hole only if its author's best was set before the day began; the chain keeps only the current best's block, so an author who beats their own best that day takes the hole out for browsers that load later (each browser keeps its own pick for the day meanwhile). Keep the first holing's height, or answer the day's pick on chain. | Low |
| **No puddles on slopes** | The chain can set a rain puddle on a slope; the site now draws it at the ground's height, but a puddle on a hill is odd play. | Low |
| **A `Hidden()` query** | What the site took down, read without walking the realm's state. | Low |

Moving to v3: `Successor()` on v2 names it, and the site follows
`NEXT_PUBLIC_REALM`. To prepare and try on the local chain (scripts/try-local.sh):
the records' continuity (bests, ghosts, community holes and their versions),
the proofs of the holes already published, the gas of each new check.

## The Builder

- **One proof period per weather kind.** Wind and puddles change every period
  and a round keeps the weather it started in: a hole at the edge of full power
  can be harder (never impossible: a two-stroke way stayed in every period
  tried) in some periods, and its par is set from one sample. Prove a few
  periods per kind, or say so on holes near the limits.
- **The live checks on a very heavy hole.** On a board of long steep slopes
  and tunnels, the check run on each drag move takes about 200 ms (60 before
  E17); a normal hole is as before. If it is felt: run the trap search when a
  piece is let go rather than on every move (the refusal kept).

## Before the launch

- The legal pack's review by a Japanese lawyer (docs/superpowers/legal/).
- The realm owner's key as a multisig.
- Moderation: who reads the reports (GitHub issues, "Report this hole") and
  edits /takedown.json.
- The gnome shop on (NEXT_PUBLIC_GNOMES): the collection arrives with mainnet.
