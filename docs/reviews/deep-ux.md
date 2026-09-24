# Gnogolf: deep UX and accessibility review

Review only: no code was changed. Everything was walked in one headless Chrome against the dev server (`localhost:3300`, chain `test-gnogolf` on `:26757`, gnoweb `:8888`). The sizes were 1280×800 (13" laptop), 1366×690 (short laptop), 1920×1080 (desktop) and 390×844 (phone). Screenshots are in `media/ux-review/`, and each finding cites its file. Hub pages were read with `gno_render` on profile `gnogolf`.

Effort: **S** = under an hour, **M** = half a day, **L** = a day or more.

---

## P0: broken for players

### 1. Every in-card note is turned into a toast that fades away
- **Screen:** the win card (gnome unlocked, "Recorded in block N", Adena fee and funds warnings, replay mismatch errors), Play for real (connect errors, "Disconnected"), the Leaderboard sheet (archived hole, errors, "No gno.land name"). See `21-win-note-bug.png`.
- **Problem:** `.note` is defined twice. The second definition is the HUD toast: `position: fixed; top: 108px; white-space: nowrap; animation: note 3.2s forwards` ending at `opacity: 0`, plus `pointer-events: none`. It applies to every `.note--good/--warn/--bad` inside cards too. In the test, a note injected into the win card jumped over the "In the hole!" heading, lost its green style, and was at opacity 0 after 3.5 s. So the proof that a round went on-chain, and every error about fees or funds, shows for 3 seconds over the title and then disappears. Its links, such as "See your round on gno.land ↗" and "play the current one", cannot be clicked at all.
- **Fix:** give the toast its own class. Rename the HUD toasts to `.toast` (`Golf.jsx:767-768`) and move the fixed and animated rules to `.toast` (`globals.css:1734-1741`). Keep `.note` for inline notes only.
- **Effort:** S · `web/app/globals.css:1734`, `web/components/Golf.jsx:767-768`

### 2. With reduced motion on, every toast is invisible
- **Screen:** the HUD during play ("Wizard is locked — playing as Gardener" from a shared link, shot notes).
- **Problem:** the global reduced-motion rule (`globals.css:1550`) cuts every animation to 0.01 ms. The `note` keyframes end at `opacity: 0` with `forwards`, so the toast is transparent from the first frame. `linkNote` also unmounts on `animationend`, so it is gone at once. Measured: without reduced motion the note is there at 300 ms (`22-shared-link-locked-note.png`). With reduced motion, `.note` is gone before 1.5 s. The same happens to the curtain and the chores text.
- **Fix:** add `@media (prefers-reduced-motion: reduce) { .toast { animation: none; opacity: 1 } }` and dismiss it with a `setTimeout(3200)` instead of `onAnimationEnd`. `.cause` already does this right (`globals.css:1993`).
- **Effort:** S · `globals.css:1740,1550`, `Golf.jsx:768`

### 3. Chain down: the Play button behind the error leads to a blank screen
- **Screen:** title with an unreachable RPC (`40-chain-down-title.png`).
- **Problem:** the title shows `Play` whenever `!loading`, and loading is `!s && !fatal`, so the button appears when the chain fails. Clicking it sets `screen="worlds"`, but `Worlds` only renders when `s` exists (`Golf.jsx:447`), which leaves an empty screen. The error dialog has no automatic retry and no link to the chain's status.
- **Fix:** keep the loader, or a disabled "Course unreachable" button, while `fatal` is set (`Golf.jsx:446`: `loading={!s}`). In the dialog, retry on its own every 10 s ("Trying again in 8 s…"), keep the "Try again" button, and add "Check the network status ↗".
- **Effort:** S · `Golf.jsx:446-447,771-815`

### 4. Escape does not close the Leaderboard or the aim-switch dialog, and no dialog takes focus
- **Screen:** the Leaderboard sheet, "Switch to Pro?", the menu drawer, Play for real.
- **Problem:** the Escape handler (`Golf.jsx:349-360`) closes the menu, Play for real and the scorecard, but not `board` or `askAim`. Tested: Escape leaves the leaderboard open. No sheet moves focus into itself: after opening the menu, `document.activeElement` is still the canvas. Focus is not trapped and is not given back to the opener. Keyboard and screen-reader users are left outside a dialog marked `aria-modal="true"`.
- **Fix:** in the shared `Sheet` (`ui.jsx:69`), focus the close button on mount, trap Tab, close on Escape, and put focus back on the element that opened it on unmount. The drawer, the win banner and the error banner should use it too. Add `setBoard(false); setAskAim(null)` to the Escape handler.
- **Effort:** M · `web/components/ui.jsx:69-79`, `Golf.jsx:349-360,523-597`

---

## P1: confusing, misleading or over-promising

### 5. Copy that claims too much: no-cheat, "in writing", "a gnome is waiting"
A bot can compute shots and record them, and free-play scores live in `localStorage`, which anyone can edit. These lines claim more than that:

| Where | Now | Suggested |
|---|---|---|
| Share, ace (`Golf.jsx:1157`) | "The gno.land VM replayed it and couldn't find a trick." | "Every bounce computed by a realm on gno.land." |
| Share, cup done (`Golf.jsx:1152`) | "Every putt replayed by a realm on gno.land, so no, I didn't make it up." | "Every putt computed on gno.land." |
| Share, grand slam (`Golf.jsx:1150`) | "…and gno.land has it in writing." | Only if the rounds were recorded; otherwise "…The Gnome King bows." |
| Share, unlock (`Golf.jsx:1155`) | "Earned the hard way, one on-chain putt at a time." | "…one putt at a time." (free play is not on-chain) |
| Play for real, step 3 (`Golf.jsx:895-897`) | "…so a score can never be typed in." | "…so the score is the chain's own, not one you type in." |
| Play for real, step 2 (`Golf.jsx:888`) | "it can never move your funds." | "it cannot move funds without your signature in Adena." |
| Cup finished (`Golf.jsx:1277`) | "Cup finished at par or under — a gnome is waiting in the picker." | True for Garden, Island and Town only. **The Mountain Cup unlocks nothing** (`card.js:86-95`). Either add a Mountain gnome, or say "Cup finished at par or under!" when nothing unlocks. |
| Hub footer (`render.gno:172-174`) | "no upgrade, no way to delist a course — not for us either" | The next paragraph admits that an `r/gnogolf/` realm can archive a hole. Say it in the same sentence: "…no way to delete a course. The only change possible: an `r/gnogolf/` hole can archive an older one (see below)." |

- **Effort:** S

### 6. "Free play … nothing is kept" is false, and it hides what on-chain adds
- **Screen:** the win card (`20-win-card.png`), Play for real.
- **Problem:** the win card says "Free play: the chain computed every shot, but nothing is kept". The Grand Prix card right under it shows the hole as done (1/18, −1), which is kept in the browser, and gnomes unlock from it. Play for real says "Nothing is kept when you leave". Players see the contradiction, and the real difference (public, portable, ranked) is lost.
- **Fix:** win card: "Saved in this browser only. Save it on-chain to make it public and ranked." Play for real, Free play column: "Your card is kept in this browser only". Saved on-chain column: "Public, on your address, on any device".
- **Effort:** S · `Golf.jsx:659-662,868`

### 7. The Leaderboard says "Coming soon" but half-works, and says it twice
- **Screen:** `16-board-friends.png`, `17-board-hole.png`, `37-phone-board.png`.
- **Problem:** the HUD chip wears a red "Coming soon" badge, yet it opens a working sheet. Friends shows two empty headings ("The Shelf par 3", "The course") and an Add form while you are not connected. This hole says "0 players finished" and "COMING SOON" together. The course tab titles itself "Leaderboard · recorded on-chain" under an h2 that already says "Leaderboard". "Ranked: players with a gno.land name · get a name ↗" shows above a board that is not open. Meanwhile the gnoweb hub already publishes a working Leaderboard table.
- **Fix:** choose one state. Until launch, either make the chip open a one-line sheet ("Leaderboards open at launch. Rounds you save on-chain now will count.") or drop the badge and ship the boards as they are. Either way: hide the Friends headings until there is data, and show "Connect Adena to add friends" in place of the form when not connected (`Golf.jsx:1391-1424`). Drop the h3 at `Golf.jsx:1568`. Show the "Ranked:" line only when rows exist (`Golf.jsx:1502`).
- **Effort:** S–M · `Golf.jsx:614,1286-1293,1391-1424,1502-1508,1568`

### 8. A newcomer is never told why on-chain matters
- **Screen:** the title (`02-title-ready.png`), cups, picker.
- **Problem:** the three facts say what (a hole is a contract, pull back, free to play) but not what it gives the player. The one convincing idea, "you can read the physics before you trust it" (hub, `render.gno:274`), appears only as a 16 px "read its code ↗" link. On a phone that link is hidden (`globals.css:1488`).
- **Fix:** title fact 1: "**Every hole** is a contract anyone can read". Fact 3: "**Free to play** · save your best rounds on-chain". Keep "read its code" on phones as an entry in the menu drawer ("Read this hole's code ↗").
- **Effort:** S · `Title.jsx:214,231`, `globals.css:1488`, `Golf.jsx:541-556`

### 9. "Play for real" sounds like betting, and the icon on phones means nothing
- **Screen:** the HUD Adena button (`08-hole-hud.png`, `33-phone-hud.png`).
- **Problem:** "Play for real" suggests real money or a different game. The sheet itself says it is the same game. On a phone the label is hidden (`globals.css:1491`), so only the Adena logo is left. After "Install Adena ↗" the page never picks up the new extension, because `hasAdena()` is read at render, and there is no "reload" hint. That is a dead end.
- **Fix:** rename it "Save on-chain" (eyebrow "Adena") and the sheet title "Save your rounds on-chain". On phones keep a short label under the icon ("Save"). Under the Install button: "Installed it? Reload this page." with a Reload button. Say that the account needs GNOT *before* the player finishes a hole, as step 2b: "Needs a little GNOT for gas — Get test GNOT ↗".
- **Effort:** S · `Golf.jsx:494-504,852-925`, `globals.css:1491`

### 10. Cup and unlock names do not match
- **Problem:** the cup is "Mushroom Town" (`Worlds.jsx:14`, `render.gno:58`), but the unlocks say "Finish the Town Cup" and "Town Cup at par" (`card.js:92-93`). The Viking's line says "Par or under on every hole" while its unlock is the cup total at par (`gnome.js:23` vs `card.js:88`). The Wizard says "Finished every hole" but means the Garden Cup only (`gnome.js:21`). "At par" means "at par or under" (`card.js:74`).
- **Fix:** unlocks: "Finish Mushroom Town", "Mushroom Town at par or under", "Garden Cup at par or under". Viking line: "The Garden Cup at par or under. The horns are earned." Wizard line: "Finished the Garden Cup, and now the hat has stars on it."
- **Effort:** S

### 11. The aim switch appears before the player knows what an aim line is
- **Screen:** picker (`04-picker.png`, `06-picker-pro.png`).
- **Problem:** "Aim · Assisted/Pro · Full aim line" is 11–12 px and comes before the first shot. The Pro honesty note hides behind a tooltip-only ⓘ (a `title` attribute: nothing on touch). In the drawer, the Pro help drops the ⓘ entirely.
- **Fix:** default to Assisted and leave the switch out of the first-run picker (keep it in the menu). Or make the help literal: "Assisted: see where the ball will roll" / "Pro: no preview, ranked on its own board (on your word)". Replace the ⓘ with that visible line.
- **Effort:** S · `Golf.jsx:1026,1036-1051`

### 12. A shared link skips all onboarding
- **Problem:** `?cup=…&hole=…&gnome=…` jumps straight into play (`Golf.jsx:216`). A friend who opens a share never sees the title facts, the cup screen or the aim choice, and gets only a 13 px hint. The link also carries no score, so the friend does not know what to beat. An invalid link (`hole=99`) lands on the cups with no word.
- **Fix:** add `&vs=<strokes>` to share links and show a one-time card on arrival: "Alex holed The Shelf in 2. Your turn — pull back from the ball to shoot." For a bad link, show a toast: "That hole isn't on this course — pick a cup."
- **Effort:** M · `Golf.jsx:208-218,953-962`, `Share.jsx:29`

### 13. The gnoweb "Play in 3D" link goes to production, not to this chain
- **Screen:** hole page (`51-gnoweb-hole.png`).
- **Problem:** `playURL` is hard-coded to `https://gnogolf.netlify.app/` (`render.gno:48`) with no `rpc` or `web`. From the local or test chain it opens a game on another chain, where the hole numbering may differ.
- **Fix:** make it a realm variable set at deploy time, or add `&rpc=` for non-production chains.
- **Effort:** S · `gno.land/r/gnogolf/golf/render.gno:44-48`

---

## P2: feedback, hierarchy and layout

### 14. Cause captions are too faint to read in flight
`.cause` is 12 px `--ink-soft` on 85 % paper, over a moving 3D scene, for 1.4 s (`globals.css:1990`). Make it 14 px `--ink` at 800 weight on opaque paper with a 2 px ink border, like the other chips, and add an icon per cause (wind ↝, slippery ❄, downhill ↘). **S**

### 15. After a shot, nothing says how it went
The HUD renders `s.note` (`Golf.jsx:767`), but `engine.js` never sets `g.note`: it only clears it (`engine.js:1268`). A ball that stops short, falls in water or lands on sand gets no word. Add short toasts: "Splash! +1 stroke, back to where you shot from", "In the sand", "3 left to par". **M**

### 16. The weather card's "changing soon" is ambiguous
In `Weather.jsx:72`, "changing soon" sits under "Clear" and reads as if the ball will change. Use "new weather in <1 min", and "for 2 min" → "2 min left". The explanation that "the aim dots already include the wind" lives only in a `title` tooltip. Put a one-line version into the first windy hole's hint. **S**

### 17. The cup is off-screen in the default Classic camera
After the intro flyover (`07-hole-intro.png`), Classic frames the ball closely and the cup falls out of view (`09-hole-classic.png`, `12-after-shot.png`). A first-timer loses the goal. Show a small edge arrow toward the cup when it is off-screen, or add "Tap Far to see the whole hole" to the first hint. The camera button label "Classic ▾" does not say what it cycles: use "Camera: Classic". **M**

### 18. The Restart button restarts at once
The HUD "Restart" (`Golf.jsx:619`) throws away the round with no confirmation, while switching aim asks first. Ask when strokes > 0 ("Restart this hole? Your 3 strokes are lost."), or allow Undo for 3 s. **S**

### 19. Win card on phones: the main action is last and below the fold
On 390×844 the card is 903 px inside 808 px (`34-phone-win.png`). The buttons stack as Play again, Save on-chain, Next hole, so the primary button is last and scrolled off once any note shows. "Save my score on-\nchain" breaks the word. On phones, order them Next hole (full width), then Save on-chain, then Play again. Shorten the label to "Save on-chain". **S** · `Golf.jsx:694-713`

### 20. Scores are written three ways
Vs par appears as `-1` (hyphen) on the cup cards and drawer (`Worlds.jsx:175`, `Golf.jsx:546,1250`), and as `−1` / `E` on the boards (`Golf.jsx:1448`). The stamp for under par says "WOW" where golf says birdie. Use `vsPar()` everywhere, and name the medals Ace / Birdie / Par. **S**

### 21. Names for the same thing vary
- "Main menu" (drawer) vs "Back to the title" (aria).
- "The cup" button vs "Scorecard" (sheet aria) vs "Grand prix".
- "Play again" (win card) vs "Restart" (HUD).
- The hub calls itself "Mini-golf", the game "Gnogolf".

Pick one: "Title screen", "Scorecard", "Play again", and "# Gnogolf — mini-golf on-chain" on the hub. **S**

### 22. Phone HUD: the corner chips crowd the edges
On 390 px, the weather collapses to a dial whose sun badge touches the right edge, and the "Coming soon" badge on the trophy sits 4 px from the edge (`33-phone-hud.png`). On the cups screen, the last card overflows the frame's rounded border (`31-phone-cups.png`). Add a 12 px safe inset and clip the list inside the frame. **S**

### 23. The HUD does not scale on large screens
At 1920×1080 the cards keep their 13" size: "for 2 min" is 10 px, "4/4" is about 9 px (`24-desktop-hud-island.png`). Scale the HUD with `clamp()` (e.g. `font-size: clamp(11px, .75vw, 14px)` on the chips). **S**

### 24. The loading state never says what is slow
The loader eases toward 90 % forever (`Title.jsx:108`). If the chain is slow but alive (under the 8 s timeout), the player sees chores cycle with no sign of progress. After 6 s, add "Still reaching the chain…" under the chores. **S**

---

## P2: accessibility details

| # | Screen | Problem | Fix | Effort · where |
|---|---|---|---|---|
| 25 | Title, cups, picker | The first Tab lands on the **hidden canvas** ("Course. Arrow keys…") behind the title. | Set `canvas.tabIndex = -1` while `cover(true)`, 0 in play. | S · `engine.js:1168`, `Golf.jsx:70-72` |
| 26 | All screen changes | Focus drops to `<body>` after title → cups → picker → play. | Focus the screen's h2 (`tabIndex=-1`) or its primary button on mount. | S |
| 27 | Hole | The keyboard controls exist (←→ aim, ↑↓ power, Space) but are only in the canvas `aria-label`. The visible hint mentions only click and touch. | Add "or use the arrow keys and Space" to `.hint--mouse`. | S · `Golf.jsx:601` |
| 28 | Picker | The 13 page dots are bare spans, and the 3D gnome has no text alternative. Locked state is shown only by a greyed model and an emoji. | Give the dots `role="tablist"` buttons (or hide them), add `aria-live="polite"` on `.pick__name` + `.pick__line`, and label the lock "Locked — Finish the Garden Cup". | S · `Golf.jsx:1012-1025` |
| 29 | Picker | Locked gnomes show no progress. | "Locked · Finish the Garden Cup (3/18)". | S · `Golf.jsx:1019` |
| 30 | HUD | Strokes and hole changes are not announced. `.aimbar` is `aria-live` but holds only a bar. | Add a visually hidden live region: "Stroke 2. Ball stopped 4 m from the cup." / "Power 60 %". | M |
| 31 | Badges, small text | The "Coming soon" badge (paper on `--hat`) is **3.57:1** at 9–10 px (fails AA). `--ink-soft` on paper is 4.51:1 (just passes) but is used at 9–12 px. On the selected cup card it is **4.12:1** (fails). | Darken `--hat` for text (≈ `#b83a33`, 5:1) or use ink text on the badge. Raise the minimum size to 12 px. Darken `--ink-soft` to `#3f6659`. | S · `globals.css:5,2071,1494,1916,1692` |
| 32 | Touch | "read its code ↗" is 82×16 px. "remove" and "linkish" buttons are text-sized. The phone share icons are 34 px. | Minimum 44×44 hit area (padding or `::after`). | S · `globals.css:209,1967` |
| 33 | Reduced motion | The camera flyover and follow moves still animate. Only CSS and the scene's own motion are cut. | With `reduced`, cut the camera to the target and skip the overview (`engine.js:936` has the flag). | M |
| 34 | Sound | Sound is **on by default**: the first chime plays on "Play", and a rain bed and wind gusts loop in the background. Muting is two taps deep in the drawer. | Add a mute icon in the HUD (next to the burger), or a "Sound on?" toggle on the title. Keep the default on but make it reachable. | S · `feel.js:8`, `Golf.jsx:492-514` |
| 35 | Weather | `role="status"` on the weather card re-announces on every render. | Give it a static `aria-label` with no role, and announce only a change of weather. | S · `Weather.jsx:35` |

---

## gnoweb (hub, hole page, /u/)

### 36. The hub's cup cards duplicate the table of contents, and "most played" shows 0-play holes
The cup summaries are `### Garden Cup` headings (`render.gno:104`), so "On this page" lists every cup twice (`50-gnoweb-hub.png`). "most played: The Shelf" appears when every hole has 0 shots. Make the card titles bold text (`**Garden Cup**`), and show "most played" only when `c.top.plays > 0`. **S** · `render.gno:99-106`

### 37. The hub opens on 74 table rows; the "how to play" and the leaderboard come last
A text player has to scroll past five tables to reach the Leaderboard, and no line explains how to play from gnoweb. Add under the intro: "Pick a hole, send a Launch with an angle and a power, and add `/<your address>` to its URL to see your ball." Put the Leaderboard above the cup tables, or collapse the tables in `<details>`. **S**

### 38. The hole page's key is ambiguous
On *The Seesaw* (`51-gnoweb-hole.png`), `:` is both "wear" and "flowerbed", and `#` is both "wall" and "hedge". The key lists both meanings side by side. Reserve `:;x%` for wear and refuse a skin mark that collides with them (in `mark()`, `render.gno:417`). Merge the `#` meanings into one entry ("`#` wall / hedge"). **S**

### 39. After Launch, the page does not show the shot you just played
The Launch form submits, but the page stays generic until the player types `/<address>` into the URL by hand (`render.gno:232-234`). That is the biggest text-play dead end. Put a link under the form: "After your shot: [see your ball](/r/gnogolf/golf:<hole>/<your address>)" with a placeholder the player fills, or explain it right under the Submit button. **S**

### 40. The pro note is phrased as a rule, not as a benefit
"_Played from here, one shot at a time with no aim line, a round counts as **pro**_" reads as a warning. Suggest: "Rounds played here have no aim preview, so they go on the **Pro** board." **S** · `render.gno:235`

### 41. The archived note does not say where the old records now count
The note (`render.gno:209-210`) is clear. Add "Your best here still shows on this page" and link "the current version" by its name, not "a newer version". **S**

### 42. /u/ links lead to a generic profile with nothing about golf
Every player link on the hub goes to `/u/<addr>` (`render.gno:69`), which shows gnoweb's "Contributions 0 · No packages found" and nothing about Gnogolf (`53-gnoweb-user.png`). That is a dead end. Link players to their round on the hole instead (`/r/gnogolf/golf:<hole>/<addr>`), or add a `/r/gnogolf/golf:player/<addr>` render with that player's bests. **M**

---

## Top 10 quick wins

1. **Split `.note` from the toast** (`globals.css:1734`): the recorded, unlock and fee messages stop vanishing. S
2. **Reduced-motion toasts**: `animation:none; opacity:1`, and dismiss with a timer. S
3. **Hide Play while the chain is down** (`Golf.jsx:446`: `loading={!s}`) and auto-retry. S
4. **Escape closes the Leaderboard and "Switch aim"**, and every `Sheet` focuses its close button. S
5. **Rewrite the over-promising lines** (#5 table): no "couldn't find a trick", no "in writing", no false "a gnome is waiting" on the Mountain Cup. S
6. **"Saved in this browser only"** in place of "nothing is kept" on the win card and Play for real. S
7. **One state for the Leaderboard**: drop the empty Friends headings and the stray "Ranked:" line, and settle "Coming soon". S
8. **Rename "Play for real" to "Save on-chain"**, and add "Installed Adena? Reload" under Install. S
9. **Take the canvas out of the Tab order off the course**, and add the arrow-key hint. S
10. **gnoweb:** bold cup cards (no duplicate TOC), hide "most played" at 0 plays, and a "see your ball" line under Launch. S

Also consider: fixing the badge contrast (#31), a HUD mute button (#34), and one naming pass on Mushroom Town, Scorecard and vs par (#10, #20, #21).
