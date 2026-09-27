# Final review: `Render()` and the gnoweb experience (`r/gnogolf/golf`, HEAD affe241)

Scope: `gno.land/r/gnogolf/golf/render.gno` and what it depends on: `cleanText`, `cleanName` and `cleanSkin` (`golf.gno:878-929`), `listed` (`state.gno:305`), `eachRanked` (`state.gno:600`), `eachRound` and `lastShot` (`state.gno:95-133`), `owner.gno:28-33`, and the client link parsing in `web/components/Golf.tsx:69-90` and `web/lib/engine.ts:1087-1104`. This was a read-only review: no code was changed.

## How it was checked

- **Rendering:** `gno_render` on profile `gnogolf` (gnodev, chain `test-gnogolf`, 74 data holes, no community holes, no archived holes, no rounds). I also loaded gnoweb at `127.0.0.1:8888` with curl to see the real HTML: the columns, the forms and the breadcrumb.
- **Extension surface:** I read gnoweb at `gno@v0.0.0-20260917133642` (`render_config.go`, `markdown/ext.go`). The extensions loaded are Strikethrough, Table, Footnote, TaskList, alerts (with `[!KIND]-` to fold them), columns, forms, links, mentions, the image validator, the new `<gno-foreign>` sandbox and the emphasis DoS guard. **Linkify is not loaded**, so a bare URL in a name does not become a link. `p/nt/markdown/sanitize/v0` and `p/nt/markdown/foreign/v0` are both deployed on pearl.
- **Gas:** `gno_run` with `simulate=true` of a `package main` that calls `golf.Render(path)` and prints `len()`. The baseline, which imports golf and makes one trivial call, is **14.4M**. The net figures below subtract it.

## Gas per Render path (measured)

| path | total | net of baseline | output |
|---|---|---|---|
| hub `""` (74 course holes, empty boards) | 64.3M | **~50M** | 11.0 KB |
| `garden/7` (a plain hole) | 203.5M | **~189M** | 2.6 KB |
| `town/14` (44 walls) | 207.2M | **~193M** | 2.6 KB |
| `island/14/<addr>` (a timed hole, focused, no round) | 330.6M | **~316M** | 2.7 KB |
| `garden/7/data` (2.1 KB of data) | 26.0M | ~12M | 3.5 KB |
| `town/14/data` (2.8 KB of data) | ~27M | ~13M | 6.4 KB |
| for comparison, `State("garden/7")` | 45.2M | ~31M | JSON |

What makes up a hole page, measured by replaying `board()` with the exported API on town/14:

- The walls drawn onto the board cost ~18M, and **they are drawn twice** (once in `board`, once in `blankUnreachable`), so ~36M.
- The posts' `fill` (a `sqrt` for every cell), the flood fill and the grid allocations cost ~35M more.
- The board alone is therefore ~74M. The rest is the decode, the forecast, the wear raster (a `wearRune` call for each of ~1,100 cells) and the `ufmt` float formatting.

How each path scales:

- **Hub:** bounded. It shows at most `maxListed` = 120 entries at about 0.5M each, so ~85M when the list is full. Its cost does not grow with the number of players: bests are stored on each entry, and each leaderboard shows 10 rows, which means 20 `named()` cross-calls.
- **Hole page:** bounded, and flat in the number of players. It lists 24 rounds (`roundsShown`) through an avl iteration. The `<hole>/<addr>` form adds one replay of a Preview through `lastShot`, which costs up to ~235M on a heavy hole at full power (`deep-perf-gno.md`). A rain or storm forecast adds its cost as well. The worst case is about 0.5–0.6B, well under the 3B query cap.
- **`/data`:** bounded by `pageMax` = 100 version rows and by `maxData` = 32 KB. Hex-encoding in the VM costs ~5.3K gas per byte (measured: `HoleData(town/14)`, 2.8 KB, is 15M net). A 32 KB hole therefore costs **~170M for the hex dump alone**, which is nearly all of that page.
- **Nothing is truly unbounded**, with two soft spots:
  - `eachRanked` skips deleted names without a cap. One `named()` cross-call is made per skipped key, so a ranking whose top entries were deleted walks on until it finds 10 live names. This is rare, and it is capped by the size of the ranking.
  - A realm hole's own page runs that realm's `Field()` and `Wear()`. A hostile realm hole with a wall 1e300 long or a post of radius 1e9 makes `trace` or `fill` loop until the query runs out of gas. This happens **on its own page only**, because the hub never calls hole code.

The cost is safe. The real problem is node time per page view, and the fixes for it are in R1.

## Issues and fixes

Severity: **H** fix before deploy · **M** fix before deploy if cheap, else first patch (golf is frozen at deploy, so "later" means golf/v2) · **L** polish.

### Correctness and links

**C1 (H) A community hole's page claims a course cup.**
- **Problem:** `renderHole` prints `cupName(e.world)` for every hole (`render.gno:196`). A community data hole's world is whatever its author wrote (`dataEntry` passes `h.World`, `data.gno:200`). If the author writes `garden`, the page reads **"Par 3 · Garden Cup · Play in 3D"**, so anyone can dress a hole as a course hole. The same happens for realm holes, through `cleanSkin(course.WorldOf(h))`.
- **Fix:** in the header, show the cup only for `e.official`. Otherwise show the author:
  ```go
  where := cupName(e.world)
  if !e.official {
      where = "Community hole"
      if e.by != "" { where += " by " + who(e.by.String()) } else { where += " · " + md("its code", strings.TrimPrefix(e.id, "gno.land")+"$source") }
  }
  ```
  Also add a `by` column to the hub's community table: a community hole named "The Shelf" is otherwise listed exactly like the real one.

**C2 (M) Every breadcrumb segment is a dead end.**
- **Problem:** gnoweb links each path segment on its own. On `:garden/7/v1/data` it links `:garden`, `:garden/7` and `:garden/7/v1`. `Render("garden")` answers "No such hole", and so does `Render("g1…")`, the author segment of a community hole.
- **Fix:** route the two cases:
  - A world id (`isWorld`) goes to a cup page: the hub's table for that one cup.
  - A bare valid address goes to an author page: that address's `aliases` range, reused from `listed`'s walk.

  This is also what makes the smaller hub in the layout proposal possible.

**C3 (M) A query string turns any page into "No such hole".**
- **Problem:** gnoweb passes `?…` to `Render` as part of `path`. For example, `garden/99/v1?x=[a](b)` rendered "No such hole". A link someone shares with `?ref=` breaks the same way.
- **Fix:** at the top of `Render`, `if i := strings.IndexByte(path, '?'); i >= 0 { path = path[:i] }`.

**C4 (M) The play link's client may not be on pearl.**
- **Problem:** `playURL` is hardcoded to `https://gnogolf.netlify.app/`, and it is frozen at deploy (deploy-v1.md:223, and decision 4 at :373 is still open). The client picks its realm from `NEXT_PUBLIC_REALM` and otherwise falls back to `gno.land/r/gnogolf/golf` (`web/lib/chain.ts:43`). `netlify.toml` does not list `NEXT_PUBLIC_REALM` among the variables to set. deploy-v1.md:295 promises a `?realm=` override, but the client does not read one (`Golf.tsx:69-90` handles only `rpc`, `web`, `hole`, `cup`, `gnome` and the test keys).
- **Fix:**
  - Decide the domain before deploy.
  - Add `NEXT_PUBLIC_REALM=gno.land/r/nym-golfer000/golf` to the Netlify environment, and list it in the `netlify.toml` header.
  - Either implement `?realm=` or remove that line from the design doc.

  The link formats themselves check out:
  - `?cup=<w>&hole=<order>` for a current course hole. The client matches `Math.round(h.order) === n` before it tries the n-th hole, so the extras slots 10 and 16 resolve correctly.
  - `?hole=<id>` for anything else. `isHoleId` accepts `garden/7/v2`, `g1…/slug/v1` and `gno.land/r/…`.

**C5 (L) No other absolute paths are hardcoded.**
- **Finding:** every gnoweb link derives from `self` (`hub`, `officialPrefix`), and `renderData`'s package links (`/p/<ns>/course$source`) follow the namespace too, since `scripts/stage.sh` moves `p/` and `r/` together. `/u/<addr>` is gnoweb's own route. The hub's text names `r/gnogolf/` only through `officialPrefix`, so it will read `r/nym-golfer000/` after the move.
- **Fix:** none needed. `playURL` (C4) is the only hardcoded host.

**C6 (L) The `#` column disagrees with the play link for Extras.**
- **Problem:** the hub numbers the Extras rows 1 and 2, but their slots and their `?hole=` links are 10 and 16.
- **Fix:** print `strconv.Itoa(int(e.order))` in the `#` column, which is the number a player sees in 3D and in the link.

**C7 (L) The design doc promises a data listing that is not on the page.**
- **Problem:** deploy-v1.md:301 says `/data` shows "a decimal listing of the pieces". It shows only the raw hex.
- **Fix:** see R3, then correct the doc.

**C8 (L) The board's key names `#` twice.**
- **Problem:** on island/14 the key reads `` `#` wall · … · `#` driftwood ``. `key()` and `legend()` keep separate `seen` sets, so a wall with a skin but no mark of its own is listed a second time under its skin name.
- **Fix:** in `legend`, when `mark(m, def) == def` and `def` is a fixed mark (`#`, `0`), print `` `#` wall (driftwood) `` in place of the key's entry, or skip it. Seeding `seen` with the key's marks and merging the names is the smallest change.

**C9 (L, to verify) Only one `1` is visible on island/14.**
- **Problem:** the key says "a tunnel and its exit", but only one digit shows on this timed hole's board as drawn for stroke 1.
- **Fix:** check whether the tunnel's mouth sits under a wall or a skinned piece drawn after the tunnel zones, or in a cell that `blankUnreachable` blanks. I did not confirm the cause.

### Markdown safety

`cleanText` is the right shape and does most of the work. It drops C0 controls and DEL, the bidi marks, ZWSP/ZWNJ/ZWJ/LRM/RLM and the BOM, and ``|[]<>`*_#\&``. With those gone there is no link or image syntax, no raw HTML or `<gno-*>` tag, no entities (so no `&zwnj;` trick), no table break, no emphasis, and no heading marker inside names or notes. Names are capped at 40 runes and notes at 140. Slugs are `[a-z0-9-]{1,32}`, worlds `[a-z]{1,16}`, and skins pass through `cleanSkin`. Board marks exclude every markdown-active ASCII character. The shots string is digits and punctuation inside backticks. The echo on "No such hole" goes through `cleanName` inside a code span. **No injection was found.** What remains:

**S1 (M) Invisible and blank characters are still allowed.**
- **Problem:** the filter misses U+00AD, U+034F, U+061C, U+115F/U+1160, U+180E, U+2060–U+2064, U+3164, U+FFA0, U+2800, the variation selectors U+FE00–FE0F, the tag characters U+E0000–E007F, and U+2028/U+2029. A name made of 40 × U+3164 is not trimmed, so the hub shows a hole whose link has an invisible label.
- **Fix:** add those ranges to the `continue` case, or keep only `unicode.IsPrint` characters minus that list. After the cleaning, fall back to "Untitled hole" when no letter or digit is left, not only when the string is empty.

**S2 (L) Unlimited combining marks ("Zalgo") and very wide glyphs.**
- **Problem:** 40 combining marks on one base letter smear a name over the rows above and below it. 40 × U+FDFD stretches a table.
- **Fix:** drop characters in category Mn after the second one in a row.

**S3 (L) `~~` still strikes text through.**
- **Problem:** Strikethrough is loaded, so a name like `~~Garden~~ Cup` renders struck through.
- **Fix:** add `~` to the stripped set. It costs nothing, since no real name needs it.

**S4 (L) A note can open a block inside its blockquote.**
- **Problem:** `renderData` prints `"> " + e.note`. A note that is `---`, `- x`, `1. x` or `+ x` becomes a rule or a list inside the quote. The cause is only cosmetic, but it lets an author style the owner-attested provenance block.
- **Fix:** `"> “" + e.note + "”\n\n"`. A note that starts with a quote mark cannot open a block. In the versions table the note sits inside a cell and is already safe.

**S5 (L) Mentions and emails inside names.**
- **Problem:** a name is exactly 40 runes, the length of a bech32 address, so a hole can be named `g1…`. It is then auto-linked to `/u/g1…` in the page title, which makes it look like it is someone's. `x@y.z` becomes a `mailto:`.
- **Fix:** strip `@` in `cleanText`, which removes both. Mentions only fire at word boundaries, so a 40-rune address-shaped name still needs that one character removed.

**S6 (L) An echoed path made only of stripped characters reads "Untitled hole".**
- **Problem:** `Render("[[[")` answers "`Untitled hole` is not a hole here".
- **Fix:** echo `cleanText(path, maxName)`, and print "that page" when the result is empty.

Not needed: `sanitize.InlineText` and `<gno-foreign>`. Stripping at write time (`cleanText` at Publish or Register) is stricter than escaping at read time, and it is paid once. Keep it, and extend it as in S1–S5.

### Readability and UX

**U1 (H for a newcomer) The hub is a 76-row wall.**
- **Problem:** it has four 18-row tables, then Extras, then two leaderboards, then a 250-word "Who can change what" paragraph. A visitor learns nothing about how to play before they scroll past 76 rows. The only instructions are one italic line that assumes the reader knows what "send a Launch" means and that they need a wallet.
- **Fix:** see the layout proposal below:
  - cup cards that link to per-cup pages (C2);
  - a "how to play" tip that names the wallet;
  - the leaderboards up top;
  - the admin disclosure folded into `> [!INFO]-`.

  The fold syntax exists: the alert regex has a `closed` group (`ext_alert.go:87`).

**U2 (M) The leaderboards show addresses, not the names they require.**
- **Problem:** only named players rank, yet `who()` prints `g1abcdef…wxyz`.
- **Fix:** `eachRanked` already calls `users.ResolveAddress` through `named()`. Return the name and print `[@name](/u/name)`, and do the same for `bestCell`. The gas cost is the same.

**U3 (M) A hole's "Rounds" table lists the first 24 players by address, not the best 24.**
- **Problem:** on a popular hole it shows the same 24 lexicographically-first addresses forever, most of them "playing".
- **Fix:** show the hole's own board, the top 10 of `e.board[pro]` and `e.board[assisted]`, as `HoleLeaderboard` already walks it (`IterateByOffset`). Add "N players, M finished" from `e.rounds.Size()` and `e.bests[m].Size()`. This reuses the existing code and keeps the cost bounded.

**U4 (M) Archived holes can push community holes off the hub entirely.**
- **Problem:** `listed()` fills its 120 places with the current slots, then every archived course hole, then the community holes. Re-publishing the course once, which is 74 archives after a physics tweak, leaves no place for community holes.
- **Fix:**
  - On the hub, show the archived holes as a count with a link to a `:archived` page.
  - Reserve at least 40 places for community holes.
  - Page the full lists (`:community`, `:archived`) with the `page()` helper that `Community()` already uses.

**U5 (M) The empty sections disappear.**
- **Problem:** with no community hole, the hub never says that anyone can publish one. PublishMine is mentioned only in the admin footer.
- **Fix:** always render the "Community holes" heading. When it is empty, print "_None yet. Publish yours with PublishMine: see [how](…)._".

**U6 (L) The `/data` page ends in one line of up to 64K hex characters.**
- **Problem:** on gnoweb that is a code block with a horizontal scroll, and it costs up to ~170M of gas (see the gas table above).
- **Fix:** show the sha256 and the size, and link to `$help&func=HoleData&hole=<id>`, gnoweb's own function caller, for the bytes. If the dump must stay, wrap it at 64 characters per line inside `> [!NOTE]- The data, in hex`.

**U7 (L) Instructions are said twice on the hole page.**
- **Problem:** "After a shot, add `/<your address>`…" and "After your shot, see your ball at `…/<your address>`" both appear.
- **Fix:** keep the second one, which names the exact path. Also add under the Launch form: "_Needs a gno.land wallet (Adena). The 3D client previews shots for free._"

**U8 (L) The weather reads as jargon.**
- **Problem:** "Wind, 0.03 a substep" means nothing to a player.
- **Fix:** give a compass direction and a word, for example "Wind from the west, light". The vector is already in `f.Wind`.

**U9 (L) The hub links a version, not its slot.**
- **Problem:** hole links go to `:garden/1/v1`. A link copied from the hub lands on an archived hole after the next publish.
- **Fix:** link the alias, `hub+":"+e.slot`, for current holes. It resolves to the current version, and the page itself still names the exact id in its forms.

### Rendering cost (fixes)

**R1 (M) A hole page is ~6× `State` for the same hole.**
- **Problem:** the board costs ~74M on town/14, and the whole page ~190M.
- **Fix:** all of these change nothing on the board:
  - Trace the walls once, into the `wall` grid, and derive `g` from it. That saves ~18M on town/14.
  - Test `dx*dx+dy*dy <= R*R` in `fill`, which drops a `sqrt` per cell.
  - Build the page with `strings.Builder` in `renderHole` and `board`.

  Expect 30–40% less.

**R2 (L) Hole pages run the author's code.**
- **Problem:** a realm hole's page executes its `Field()`, `Wear()` and `Extras()`.
- **Fix:** clamp `steps` in `trace` and the loop bounds in `fill` to the board: `if steps > 4*(bw+bh) { steps = 4*(bw+bh) }`, and clamp `y`/`x` to `0..bh`/`0..bw`. A hostile hole then costs its page a bounded amount instead of the whole query budget.

**R3 (L) `/data` hex.** See U6.

## Proposed hub layout (markdown mock)

It uses only extensions loaded on pearl's gnoweb. The per-cup tables move to `:garden` and the other cup pages (C2), which keeps the hub at about 25 lines of tables. That also cuts the hub from ~50M to ~15M, since it no longer prints 74 rows with a `bestCell` each.

```markdown
# Gnogolf

Mini-golf where the chain plays every shot. The course is published data, anyone can add holes, and nobody can fake a score.

> [!TIP] How to play
> **In 3D:** [open the game](https://gnogolf.netlify.app/). Aim with a free preview, then record your round in one transaction.
> **Here, one shot at a time:** pick a hole, fill its Launch form (angle and power), sign with your gno.land wallet ([Adena](https://adena.app)), then open the hole at `…:<hole>/<your address>` to see your ball.
> Only players with a gno.land name are ranked.

<gno-columns>
### [Garden Cup](/r/nym-golfer000/golf:garden)
18 holes · par 56
most played: The Pond
<gno-columns-sep />
### [Island Cup](/r/nym-golfer000/golf:island)
18 holes · par 53
most played: Treasure Isle
<gno-columns-sep />
### [Mushroom Town](/r/nym-golfer000/golf:town)
18 holes · par 52
<gno-columns-sep />
### [Mountain Cup](/r/nym-golfer000/golf:mountain)
18 holes · par 52
</gno-columns>

Also: [Extras](/r/nym-golfer000/golf:extras) (2 holes) · [archived holes](/r/nym-golfer000/golf:archived) (0)

## Leaderboard

<gno-columns>
### Assisted
| # | player | holes | strokes |
|---|---|---|---|
| 1 | [@alice](/u/alice) | 18 | 51 |
| 2 | [@bob](/u/bob) | 17 | 49 |
<gno-columns-sep />
### Pro
| # | player | holes | strokes |
|---|---|---|---|
| 1 | [@carol](/u/carol) | 9 | 27 |
</gno-columns>

Your rank: `Rank("pro", <your address>)` · [every standing](/r/nym-golfer000/golf$help&func=Leaderboard)

## Community holes

Anyone can publish a hole with PublishMine. Community holes have no cup and are not ranked on the course.

| hole | by | par | best | played |
|---|---|---|---|---|
| [Spiral](/r/nym-golfer000/golf:g1abc…/spiral) | [g1abc…wxyz](/u/g1abc…) | 3 | 4 strokes, [@dan](/u/dan) | 12 |

[All community holes →](/r/nym-golfer000/golf:community)

> [!INFO]- Who can change what
> Anyone can play, Reset their own round, publish their own holes and Drain. Nobody can edit or delete a round, a record, a best or a published version, and nobody can pause or upgrade this realm. [Read the source](/r/nym-golfer000/golf$source).
>
> One party holds a real power: the course owner, now [g1zgrx…27lr](/u/g1zgrx…). The owner publishes course holes and their new versions. A new version archives the old one (still playable, its records kept) and restarts that slot's ranking. … *(the rest of today's `noAdmin` text, unchanged)*
```

The hole page keeps its current order: title, weather, board, key, Play and its forms, the rounds. The changes are:

- the header from C1;
- the top-10 hole board from U3 in place of the address-ordered rounds;
- the one-line wallet note from U7;
- the data dump from U6 either removed or folded.

## Fix order before deploy

1. Must fix, all small and local to `render.gno` and `golf.gno`:
   - **C1**, the community header and the `by` column;
   - **C4**, `playURL` and the Netlify variable;
   - **C3**, the query strip;
   - **S1**, the invisible characters, plus S3 and S5, which also belong in the `cleanText` set (`~` and `@`).
2. Cheap, and worth doing now because golf is frozen at deploy:
   - **U2**, names on the leaderboards;
   - **U3**, the hole board;
   - **U4**, list caps;
   - **U5**, the empty community state;
   - **C8**, the doubled key;
   - **R1**, the board cost.
3. The layout (**U1** with **C2**'s cup and author pages), which needs one new route per page. Everything else is polish.
