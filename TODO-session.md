# What the player asked for, and who has it

One line per request from the 2026-09-24 session, so nothing is dropped.
Owners: **chain** (holes and physics), **garden** (garden look, shared board
drawing), **island** (island.js), **town** (town.js), **ui** (Golf.jsx, cards,
HUD, sound, engine replay).

## Worlds and holes
- [x] chain: Island Cup, 18 holes, live (island6 and island9 have no rails).
- [x] chain: Mushroom Town, 18 holes, live.
- [x] chain: re-solve island3, island18, town18 (all within par+1); storm on town12, with the rain.
- [x] chain: weather on 2–3 holes per world (wind, rain, fog, storm) via per-stroke zones. Garden 11, 14, 19 are live.
- [x] chain: reuse stumps and logs now and then in the new worlds.
- [x] chain: bridge over a stream, gnome house with a door: town7 Canal Bridge, town5 Mushroom House (door tunnel).
- [x] chain: flowing lanes (holes 1, 13, 18), obstacle set, loop, timed walls, mill, hills roll back.

## Looks
- [ ] garden: draw every new on-lane skin (palm, coral, outcrop, buoy, crab, driftwood, lamp, house, clock, statue, roundabout, chimney, plank, tram, clock hands, stall, awning, pier, wetsand, puddle, bridge, dune, stairs, wave, gap, tidepool, lagoon, fountain, canal, sea, roof, shipwreck, cave, door, well, lighthouse and chimney loops, rope edges). Timed pieces driven by the replay.
- [x] island: look done (sand, sea, palms, mushroom huts, tiki bar, lighthouse, pier, crabs, gulls).
- [x] island: sand rough inside the walls (garden hook), sea under rail-less lanes (garden).
- [ ] island (old line): completely tropical. Sand dunes with no greenery, sea and horizon, palms, mushroom-style straw huts and tiki bar, crabs instead of ladybirds, gulls instead of fireflies, sand rough inside the walls.
- [x] town: look done (cobbles, canal, tram, market, houses, clock tower, bakery, fountain, lit at night).
- [x] town: rough export and flower boxes on the curb.
- [x] garden: wire world.rough (colours and plant) into roughScenery, for the island and the town.
- [x] garden: mill sails must not pass through the door tubes.
- [ ] ui and garden: lower Chrome's power use (frame capping, pause when hidden, triangle and draw-call budget, instancing).
- [ ] ui: town sky palette.
- [ ] town (old line): cobbles and streets around the field, mushroom houses, clock tower, market, lamps, fountain, canal, tram. Rough = cobbles or planters.
- [ ] garden: more forest.
- [x] garden: mushroom-village houses bigger, and never standing in the stream.
- [ ] garden: giant flowers arching OVER the lane in 3D, swaying, petals falling, partly in the way of the view, ball kept readable.
- [x] garden: "clouds" theme for real. No green island at all: the lane floats on a sea of clouds, mountain tips pierce through.
- [x] garden: palm and crab posts are drawn with their own skins (they fall back to mushrooms today).
- [x] garden: rope or net edge instead of timbers on rail-less sea holes.
- [ ] garden: CC0 model packs (Kenney/Quaternius) allowed for decor.
- [ ] all: nothing overlapping, nothing floating, no holes, no artefacts. Re-audit after every change.

- [x] garden: town15 `roof` drawn as rooftops below the lane (priority), then the town pieces, then the island pieces.
- [x] island: dreamlike canopy (curved palms, giant hibiscus, kites, fading) and island1–18 checked.
- [x] town: dreamlike canopy (lanterns overhead, leaning caps, balloons, fading); organic park beds; park-lawn rough export.
- [x] garden: wire town's rough (park lawn, pots) as well as the island's.

## Interface
- [ ] ui: bigger, consistent Back button on every screen, and Escape.
- [x] ui: cup standings ("vue du championnat en cours") on the holed card and in the menu: progress through the cup's 18, total against par, position, a medal per hole, the cup emblem.
- [x] ui: scoring per cup, plus a "grand chelem" over all cups, with more gnomes to unlock for it.
- [x] ui: rolling sounds on sand, ice, puddle and flowers loud enough to hear.
- [x] ui: loop ride, the ball stays on the track at the top (rotate it with the loop angle).
- [ ] ui: wind drawn like Wind Waker, our style: curling trails, carried leaves or sand, flags leaning (weather.js).
- [ ] ui: current cup in the menu, with its emblem; change cup from there.
- [ ] ui: Adena button shows the connected address (g1yt…ty6).
- [ ] ui: loop ride keeps the ball's entry speed and line (no re-acceleration).
- [ ] ui: stamps in each cup's style; per-cup progress and strokes on the cup cards; world screen Back button; weather checked on every live weather hole.
- [x] ui: loading screen and curtain themed per cup (hat on the loader ball, track, flag, chores).
- [x] ui: remove the dead mill `hold()` path in buildExtras once the sails are timed walls (garden owns course.js: ask it).
- [x] ui: world screen, gnome choice after the cup, weather HUD, menu sounds, tab title, settings, new game.
- [x] ui: menu head shows the cup (emblem, name, "Change cup").
- [x] ui: Adena button shows the short address (g1yt…ty6) as soon as Adena already knows the page, no popup.
- [x] ui: loop keeps the ball's entry speed and line, slows over the top.
- [x] ui: power: idle scene drawn at 30 fps, nothing drawn behind opaque screens or in a hidden tab.
- [x] ui: Wind Waker wind trails (curling ribbons) plus leaves / sand / confetti carried by the wind; canopy fade hook in frame().
- [x] ui: stamps inked per cup (shell and palm, lantern and mushroom house).
- [x] ui: cup cards on the world screen show progress and strokes vs par.
- [x] ui: cup cards: a putting-green progress bar (shared `Green` from Title.jsx: track, mown part, hatted ball, cup and flag) + score + stamp; "Reset this cup" and "New game · clear all scores" on the cup screen, both two-tap.
- [x] ui: cup screen: per-card resets removed, one "Reset scores ▾" menu at the top (one cup or every cup, two-tap), cards the same height, scrolls on phones.
- [x] ui: Mountain Cup card (coming soon), bobble-hat / snow-track / pine loader, chores, curtain, sky, snowflakes on the wind.
- [x] ui: weather as a HUD card after STROKES (vane, sky, one word); a round badge under the menu on phones.
- [x] ui: weather you can see: dense rain, splash rings and puddles on the lane only, wet/dark tint, drifting fog banks, storm light flashes synced with the page flash, thunder; wider white wind trails; the flag leans with the wind; snow (mountain).
- [x] ui: weather sounds: rain bed, gusts, snow whoosh, thunder after flashes — behind the Sound switch, silent in a hidden tab.
- [x] ui: menu cup header: name big on two lines, the header opens the cup screen.
- [x] ui: standings: a played hole shows its strokes big, number small, and the cup's stamp (shell, lantern, gnome, snowflake).
- [x] ui: weather per round and period: State `period`/`weather` drawn, SimulateRoundAt for every shot, Reset + PlayRoundAt to record, refreshed between rounds only, "until 12:30" on the card (and "Clear" when clear).
- [ ] garden: trees and bunting leaning with the wind (scene files).
- [x] ui: loop replay: slanted entry (>25°) rides up and falls off the side with a thud ("Off the loop — aim straight in"); a too-soft climb goes as high as v² says; rolls out as fast as it went in.
- [x] ui: aim dots cut at 7 units in fog.
- [x] ui: share: one small "Share" control under the score — the phone's share sheet (snapshot + text), on a desktop a popover of four round icons (X, Facebook, Bluesky, copy link). `?won=N` screenshot hook.
- [x] ui: "Save on-chain" opens Adena at once: price, balance and chain id read when the card opens (4 s timeouts), no balance gate (a warning under the button instead).
- [ ] ui: share also from a finished cup / grand slam / gnome unlocked outside the win card (the message already follows the moment on the win card).
- [ ] user: fund the Adena account on the local chain to save a round (needs the address; not done without it).
- [x] ui: black-line lead: resize() only calls setSize when the size or the pixel ratio really changed (it cleared the buffer on every hole load). No backdrop-filter anywhere.
- [x] ui: weather card says "for N min" (period×300 s + 300 s vs the local clock; the chain clock checked in step), rain puddles drawn at the chain's puddle zones.
- [x] ui: player-timed pieces: a clock at one substep per 72 ms drives mill, tram, clock hands, planks, gusts; the release tick (clock mod lcm of every) goes with each shot ("a,p,t") to SimulateRoundAt and PlayRoundAt; the preview re-asks at the current tick (every 250 ms while aiming).
- [x] ui: screenshots saved in media/ui/.
- [x] ui: loop dots: reach lent up to the mouth and past the exit; a red cross where a too-fast or slanted ball is put down; dots swing with the aim while the chain answers.
- [x] ui: "can't play after one attempt": not reproduced in 3–6-stroke drag/release sequences (hole20, hole4, hole5+rain, play again / restart / next hole). Safety net added: a replay past 4 s + 0.7 s per path step is cut and input comes back.
- [x] ui: loops removed from the engine (ride, detection, dots, cross, notes); the generic note stays.
- [x] ui: timed zones on the clock (mountain10 gust, every 10 / on 4): white streaks racing up the zone while it blows.
- [x] ui: standings: a played hole shows one centred figure (its strokes), the stamp outside the circle.
- [x] ui: depth: camera near 3 / far 260 (farthest scenery measured at 210 on the island overview, plus the lean), 3× the depth precision against z-fighting; before/after in media/ui/depth-*.png, nothing clipped.
- [x] ui: HUD aim watchdog (re-publishes if the power bar's state is stale for 300 ms, logged); a preview slower than 1.5 s is let go so the latest aim goes out; press resets the batched aim dots.
- [x] ui: review [ui] items done: 1–3 (URL params checked, chain-built links validated, String(player)), 13–15 and 17 (weather: index writes, flush without closures or hidden rewrites, rain material disposed), 16 (WEATHER_SKINS exported from weather.js — course.js is garden's), 31/32/51 (engine uses terrain inZone and onGreen), 46 (grand slam), 48 (no RPCs from the old hole), 49 (dropAim), 50 (destroy disposes ball/aim/band/confetti and stops animations), 52/57 (checked queries with AbortSignal timeouts, encoded address, preview 1.5 s), 56 (probe global gone), 58 (unused simulate gone), 59 (real unsubscribe, Adena guard, one fee formula), 60 (rain loop stopped when dry, resume handled), 61 (one save, one worldOf), 63 (no storage writes in render), 64 (leaderboard read once, no state after unmount), 67 (one close X), 68 (npm run lint: ESLint + react-hooks, 0 errors, 0 warnings in the ui files).
- [ ] ui: review items left on purpose: 18 (blob texture kept: glowTex has another falloff, the fog would look different), 53/62 (split publish and memoise the tree — a refactor with no bug behind it), 54 (the aim watchdog stays, as asked), 55, 65, 66 partly.
- [x] ui: "dev" gone from the UI: the hint names the node's own chain id, the public-faucet link hides on any local node (by address), the client reads test-gnogolf from the node.
- [x] ui: disconnect × inside the connected chip's right end, centred, tooltip "Disconnect", own label; "Disconnect Adena" in the menu on phones (media/ui/adena-disconnect-*.png).
- [x] ui: Adena fee / deposit: ensureNetwork() before every signature (switch, else add, else a precise error when an old network holds the same RPC under another chain id — Adena refuses a second one silently, then waits forever for networkInfo's chain); gas capped under Adena's 2e9 simulation limit; bogus `commit` dropped (read-back retried 8 s); RPC string normalised the same way in AddNetwork and networkInfo. Self-tested against a stand-in Adena; not yet tried in the real wallet.
- [x] ui: causes shown in the replay (lib/scene/cause.js, 2 draws): wind streaks, wet spray, ice glint, downhill speed lines, one label per cause per shot; aim dots tinted by cause; ghosts shown while aiming; idle clock 3.5 substeps/s (1.5 reduced motion), fractional tick to at().
- [x] ui: shareable links ?cup=<world>&hole=<order>&gnome=<id>: straight to the hole (picker first for a first-time player without a gnome), bad values → cup screen, old ?hole=<id> kept; bar synced with replaceState; locked gnome → own gnome + note; share links carry it.
- [x] ui: local aim arrow drawn on top the moment you pull (length by power); preview skipped under power 0.3 (the chain refused power 0).
- [x] ui: cause cues driven by the chain's "cause" string (s/w/i/b/-; zones read only for an older realm); the caption moved to the bottom centre, small, above the buttons; provisional straight dots until the chain's preview lands (14 dots with the preview blocked).
- [x] ui: slope contour arrows glow gold while the ball rolls down them (from the chain's "s" cause), fading after; spiral slides (island7) timed by their length.
- [x] ui: the address bar follows every screen (title bare, cups ?cup=, picker &gnome=, hole ?cup=&hole=&gnome=); pushState per screen, replaceState within a hole; Back/Forward restore the screen and hole without reloading the scene (tested title → cups → picker → hole → next → menu → Back → Back → Forward).
- [x] ui: no arrow any more: while the preview is pending, straight dots drawn by the same aimAlong (same size, colour, spacing); the chain's dots glide into place over 120 ms (instance matrices blended); the pull band unchanged.
- [x] ui: follow camera 30 % closer (engine-side factor on focusRig's distance).
- [x] ui: cups show only current holes (Holes().next == ""); an archived hole still opens by its ?hole=<id> link.
- [x] ui: Leaderboard chip bottom right (trophy + label; a round icon above the hint on phones) with a "Coming soon" badge; a sheet with This hole (HoleLeaderboard(hole, offset, limit), ten by ten, Show more, "You", strokes vs par, players finished, archived → link to current) and The course; empty state is the Coming soon block. One constant SOON in Golf.jsx turns it all off at launch.
- [x] ui: one SheetClose everywhere: pinned 16 px in on the sheets (cup, Play for real, leaderboard), inline in the menu drawer's header row (menu and settings checked desktop + phone); the share row on the win card has no X and nothing overlaps it (media/ui/x-*.png).
- [x] ui: harder preview: PREVIEW = { stopAt: "first-contact", maxLen: 7 } in engine.js — the dots stop at the first bounce / slope / wind / ice / tunnel / water (the chain's cause, a sharp turn for older realms), 7 units at most, same size whatever the power; provisional dots capped the same.
- [x] ui: aim modes. Assisted (full chain line, default) / Pro (no line, no preview request; the elastic and the gnome turning give the direction), in the menu and on the picker, kept per browser; PREVIEWS in engine.js. PRO chip on the HUD; a mid-round switch restarts the hole after a confirm; a round records in the mode of its first stroke (Reset + PlayRoundPro, else PlayRoundAt — checked on the message sent to a stand-in Adena). Leaderboard sheet: Assisted | Pro switch (defaults to your mode), PRO badge on rows, the honesty note on the Pro tab and behind an ⓘ.
- [x] ui: picker slimmed: one short aim line, compact switch, Play/Locked the same size, nothing moves while flipping gnomes (button stays at the same place through all 14), fits 1280×800 and 390×844 without scrolling.
- [x] ui: camera overhaul — one controller in engine.js (modes classic / far / third × states rest / aiming / replay / tube / holed), critically damped springs for position, look-at, lens and view offset; switches ease from the actual pose (~0.5 s) and reset the follow; teleports snap. Third person: 7 back, 3 up, 58° lens, lane-ahead heading at rest (distance field over the green), soft aim trail (0.35 s, ≤120°/s) measured from the pull-start heading (90°/screen, Shift halves), damped run heading (≤90°/s) that holds on bounces and widens instead of spinning, analytic wall/post/terrain occlusion and collision, swings round a wall behind the ball, never closer than 4.5, pitch 18–40°, ring marker in tubes and falls, short lens ray against decor. Button shows the current mode (Classic → Third person → Far), Classic by default, choice kept for the session only.
- [x] ui: camera suite (scratchpad camsuite.mjs → media/camera/results.json, contact-sheet.jpg): 11/12 holes pass; hole20 rest pitch 34° (the tee sits under a rise; within the 40° cap, over the 28° target).
- [x] ui: Friends tab (Bests / Standings, add by address or gno.land name via r/sys/users, "add me as a friend" link with ?friend=), "Ranked: players with a gno.land name" line, flags.json filter (hide ≥ 0.5, Show all, ? badge with reasons; Friends never filtered).
- [x] ui: Classic keeps one side for the whole hole (the turn-to-aim was built, then withdrawn at the user's request); camsuite checks its heading stays constant through 8 aims and a replay (0° on all 12 holes).
- [x] ui: no browser popup left: the mid-round aim switch asks in the game's own dialog (Cancel / Restart in Pro).
- [x] ui: Aim in settings: label, a full-width Assisted | Pro switch (the drawer's control height and radius), one muted line with the ⓘ under it.
- [x] ui: shared controls (components/ui.jsx): Button (primary / secondary / chain / chip / icon, badge slot), Segmented, Toggle, Sheet, SheetClose; every HUD, sheet and dialog button, the aim switch, the board tabs and the settings toggles use them; one CSS block for hover lift, press sink, focus ring, disabled; old per-control copies removed. Pressed states: media/ui/pressed-desktop.png, pressed-phone.png.
- [x] ui: strokes card padded, PRO as a badge in its corner (desktop and phone).
- [x] ui: third-person CPU: heading search ~6 Hz, sight test every other frame, collision pass reused between passes, far 80; the per-frame lens ray removed. Measured: town18 +5 % / 0 % (1× / 4×), mountain10 +2 % / 0 %.
- [x] ui: camera fixes from the suite: holed is its own state (framed on the cup, up and back; from when the winning ball nears the cup); a hard floor of 4.2 on the real distance (a ball rolling back at the camera); the lens kept clear of posts (bumpers, mushrooms); aim probe uses the camera's own sight test (mountain10 8/8). Passing now: garden 1, 2, 3, 14, island 1, 2, 7, town 1, 18, mountain 5, 10.
- [ ] ui: final full camsuite run once the hardening agent is done (hole20 would not load in the last run: the chain was reloading). The suite now waits for the chain and retries a hole once. Tried and withdrawn: a decor height map (tall thin things and the canopy made it far too cautious).
- [x] ui: pressed-state pass on title, cups, picker, HUD, drawer (aim switch, Sound toggle), leaderboard tabs and the sheet X: every one lifts on hover and sinks on press (media/ui/pressed-desktop.png, pressed-phone.png).
- [x] ui: the elastic always comes back: a pull brought back within 6 px of its start now drops to zero power (the handler returned early and kept the last power); letting go there shoots nothing. media/camera/pulltest.mjs: out 160 px, ±40° sweep, back in — power down to 0 and cancel OK in Classic and Third person, mouse and touch, on town1 and island2.
- [x] ui: a chain "w" point is drawn as wind only where a wind or gust zone (or the weather's wind) covers it; on a timed slope of another skin (hole20's seesaw plank) it is a tilt — speed lines, the caption "Tilting" (plain slopes keep "Downhill"), no wind streaks.
- [x] ui: third-person aim is the drag vector (the shot opposite the pull, like Classic), read in the camera frame frozen at the pull's start — every direction reachable, straight back included; 18 px dead zone, light smoothing, Shift a third as far. Power unchanged (the report was about turning). pulltest: 8/8 directions and the pull back to 0, mouse and touch, town1 and island2.
- [ ] garden: 10 lint warnings left in scene files (unused vars in course, island, mountain, props, town, zones); course.js should import WEATHER_SKINS from weather.js.
- [x] ui: slingshot hardened: fire() wraps the whole shot in try/finally (flying, aiming, drag always reset); replay frames guarded (a throw ends the replay); watchdog budget from the path's own timing, reason logged; blur / hidden tab / lost capture drop a pull; a new press takes over a held keyboard aim.
- [x] ui: same pull, same shot: power from the drag in CSS px over the viewport's short side (not DPR, zoom or frames), both ends through the current camera, angle and power rounded to 0.01 once, preview = shot. Self-check `demoPull()`; DPR 1 and 2 give the same shot string exactly, simulated zoom 90/110 % give the same power, angle within 0.05°.
- [x] ui: win card paths: Play again then a hole in one again, then Next hole three times with a stroke on each — all fine.
- [x] ui: weather batched into 2–4 draw calls (rain lines, one merged gust mesh, instanced bits, rings, puddles, fog banks, storm clouds).
- [x] ui: big pass — Adena price label on the chain's gas price; pond and tunnel endings then a stroke (ok); engine: stray timers guarded, preview timer cleared on destroy, NDC vector reused, NaN path rejected, DPR refreshed on resize with maxDpr(), slow-GPU drop to ratio 1, 20 fps when still; worlds lazy-loaded per cup (game chunk 98 → 67 KB gz); 360/390 review: ribbon wraps, canvas focus ring.
- [x] ui: timed pieces (`course.userData.timed`) driven by the replay step, back to at(0) at rest.
- [x] ui: weather HUD checked in a production build (static export) on island16, and on first load without a stroke.
- [x] ui: one big round back button (52px, top left) on the cups and gnome screens; Escape goes back.
- [x] ui: weather checked with a screenshot on every live weather hole (fog made camera-relative) (garden 11, 14, 19; island 16, 18; town 12, 17).
- [x] garden: 5 new gnome models (pirate, diver, baker, mayor, king) — asked, unlock keys already in card.js.

- [x] chain: variety pass, 8 holes reworked (island2 Snail Shell, island17 Coral Atoll, island18, town1, town2 Market Square, town11 Gnome Courtyard, town12, town16 Crossroads).
- [ ] ui: cup cards with big on-style progress bars, a stamp and a score, and a reset per cup.

- [ ] ui: weather card at the top next to STROKES; unmistakable effects (dense rain, puddles, fog banks, visible wind, storm with thunder).
- [ ] ui: in the menu, the cup name big on two lines with no "Change cup" link.
- [ ] ui: standings show the score in each circle, with a real stamp.
- [ ] garden: every post (lamp and the rest) stands on the ground.

- [ ] chain: weather per round on every hole, drawn from time (15-minute periods, a table per cup, hash of hole and period), verifiable; SimulateRound/PlayRound take the period.
- [ ] ui: weather sounds (thunder after the flash, a rain loop, wind gusts), with the Sound switch.
- [ ] ui: engine and Adena carry the round's period; weather read once per round.

- [ ] garden: trees, bunting and fronds lean with the wind (a course.userData.wind hook; the other worlds follow it).

- [ ] chain: design pass 2, at least 12 holes more organic (meanders, planted islands, splits), very long and very short holes, tunnels through houses, big beach obstacles (boat, rock, sandcastle).
- [ ] garden: worldOf(s).piece hook, so each world draws its own on-lane pieces.
- [x] town: on-lane pieces drawn (lamp, house, clock, statue, roundabout, tram, clock hands, stalls, awning, fountain, canal, bridge, stairs, door, well).
- [x] town: giant caps toned down, the town4 tram readable.
- [x] island: on-lane pieces drawn (palm, coral, outcrop, buoy, crab, driftwood, wetsand, tidepool, lagoon, wave, gap, shipwreck, cave).
- [ ] chain: shipwreck and cave mouths touching the kerb (island7, island14), palm against the kerb (island13).

- [x] chain: all 54 holes re-solved against the live chain (the hardest: The Maze, in 5 at par 5).
- [ ] garden: timed and pulse walls never drawn solid when absent (sails, planks, tram, clock hands, gate, awnings); hole20 loop base reads as a plinth; rope edges on the no-rail holes.

- [ ] chain (pass 2): Mario Kart and real mini-golf creativity (zigzags, humps, several levels, sandcastle with a gate, banked curves, volcano, figure-8, crater); at most one U per cup.
- [ ] garden: no strip between the curved kerb and the green (green clipped to the lane polygon).

- [x] garden: bigger village houses off the stream, giant flowers over the lane (holes 5, 10, 17), real clouds theme (8, 14, 19), more forest, mill pipes under the mill, shared pieces.js, rope edges, flat rough per world, pirate, diver, baker, mayor and king gnomes.
- [x] physics: loop tightened (LoopOver 1.45) and an entry more than 25° off falls off the side.
- [x] chain: stronger weather v2 (5-minute period, wind 0.08–0.15, rain 1.12 plus puddles, snow, fog, storm), ForecastFor.
- [x] physics: timed zones (gusts) and Field.Tick (release moment).
- [ ] chain: storm gusts in timed zones.
- [ ] chain and ui: timed walls driven by the release moment ("angle,power,phase"), pieces running continuously on screen.
- [ ] ui: replay of the slanted loop fall ("Off the loop — aim straight in"), fall-back height that follows the speed, short aim guide in fog.
- [x] island: lighthouse at 1.3×, fully in frame.
- [ ] garden: ink edge hidden on snow, remaining slots under the kerb (town4).
- [ ] chain (pass 2): town17 Night Market and town18 Grand Plaza too plain.
- [x] rule: screenshots saved in gnogolf/media/.

## To decide
- [ ] chain: Mountain Cup, 18 holes (ice, snow, hairpin bends, crevasse jump, ski lift, avalanche, cable-car loop, ridge with no rails, summit in fog, snow weather).
- [x] mountain: first alpine look (snow, cliff over the valley, peaks, chalet, ski lift, cable car, frozen waterfall, snowman, skiers, eagles, snow, ice arches, snow rough).
- [ ] mountain: real peaks (not paper cones), a snow field filled in (groves, rocks, frozen pond, ski jump, tracks), icy translucent arches or snowy pines as the canopy.
- [ ] ui: Mountain Cup card and emblem, loader (bobble hat), alpine sky.
- [ ] ui: cup screen, cards the same height, no reset under the cards, a single small reset at the top.

- [ ] garden: mountain loop rails no longer crossing the kerbs (the loop block is back with garden).
- [x] mountain: kerb/green/edgeInk settings, cable car overhead, bobsleigh, brighter background, avalanche (heap, slide, warning).
- [x] mountain: its on-lane pieces drawn, a real chairlift, the crevasse open through the world.
- [x] garden: loop rails no longer crossing the kerbs (a gap in the kerb), world extras hook.
- [ ] chain: avalanche with a legible rule, wind that clearly bends the path.
- [ ] ui: live aim dots that follow again, wind visible in the dots.

- [x] NO MORE LOOPS: The Ditch Jump (hole20), Broken Boardwalk (island10), Swing Bridge (town10), Snow Cannon Ridge (mountain10), all finishable.
- [ ] chain: crevasse sends back to the tee (mountain5).
- [x] garden and ui: loop drawing and replay removed; gust drawn; physics treats gust and timed slopes as wind.
- [ ] garden: boardwalk (openings for the gaps, fine seams between the planks).
- [ ] ui: "after one try you can't play any more", the stuck input found and fixed, plus a safety net.



- [x] physics: a ball on a slope steeper than the friction keeps rolling past the end of its stroke (MaxRollOn 120).
- [ ] chain: re-solve the slope holes under that rule; mountain16 with the cup halfway down the slope.

- [ ] ui (priority): the slingshot that sometimes stops responding (try/finally, watchdog, pointer resets); a deterministic shot for the same pull (independent of DPR, zoom and fps).
- [ ] island, town, mountain: perf pass in their files (from 130–340 draw calls down to about 70, and under 150k triangles).

- [x] security: audit done; fixes applied (par frozen at Register, only official holes ranked and listed first, 60 strokes per round, 512-point path, shots rounded before simulating, no future weather, negative phase).
- [ ] decide: the release moment (tick) is a free choice, so a bot can always pick the best one; commit-reveal if needed.

- [x] chain: storm gusts (two alternating gusts), crevasse sends back to the tee, mountain16 with the cup halfway down, doc comments.
- [x] chain (pass 2): 16 holes reworked (Crab Beach, Beached Boat, The Sandcastle, The Volcano, Banked Bend, The Boulevard, The Crescent, Side Door, Square Garden, Night Market as a T, Grand Plaza as an oval, Round the Bed, The Long Meander…).
- [ ] chain: re-solve under the current rules (slopes, pass-2 holes, mountain5/16, timed holes, worst weather).
- [ ] worlds: draw the new pieces (mound, volcano, bank, sandcastle, castle gate, rowing boat).
- [x] loops: replaced (The Ditch Jump, Broken Boardwalk, Swing Bridge, Snow Cannon Ridge).
- [ ] garden and ui: remove the loop drawing and replay code; draw the new pieces.
- [x] review: gnoweb (proposals handed to gno-quality).

- [x] garden: rough no longer drawn in the flat worlds (no more grey or pale rectangle), netlify.toml and .env.example, share links through NEXT_PUBLIC_SITE_URL.
- [ ] chain: walls within [0.3, W-0.3]×[0.3, H-0.3] on every hole (hole2, hole14, island12, town8, town12, mountain2, mountain9…), plus a check.
- [x] review: Gno best practices via MCP (lint clean; gas, storage, style and test findings).
- [x] gno-quality: golden replay tests and limit tests, gas (−26% on rank), path stored as a flat array, weather once per call, style and lint clean, gnoweb (cups, /u/ links, weather note, Play in 3D link, player page, alerts).
- [x] review: JS client code quality (docs/reviews/js-review.md, 68 items).
- [ ] fixes from the JS review, per owner: ui (security first, weather, engine, Golf.jsx, lint), garden (disposal, shared material, shared helpers), island, town, mountain (adopt the helpers).

- [ ] chain: lanes overflowing the board (hole2, hole14, island12, town8, town12, mountain2, mountain9); placement check on the board's edges.
- [x] rendering: z-fighting fixed (layers apart in every world, no more stacked surfaces).
- [x] deploy: netlify.toml and web/.env.example ready (define the variables in Netlify).
- [ ] gnoweb: optimise the golf Render with the latest gnoweb features.

## At the very end
- [ ] Big pass (running): security audit of the realms (auditor), 3D perf (garden), engine bugs, web perf, Adena, UI design (ui), docs (docs).
- [x] README, docs/physics.md, docs/course.md, docs/golf.md.
- [ ] chain: missing doc comments in physics and course.
- [ ] A game and physics engine that's complete and shareable (p/gnogolf/physics and course usable by other games).
- [ ] Final summary in French.
- [ ] Full 3D and web performance pass: draw calls, triangles and FPS per cup, instancing (distant houses, glows, trees), merging the pieces that move, Chrome battery use, load time and bundle size.

## Later
- [ ] Builder mode (4th card), after the three cups.

- [x] garden: timed walls ghosted when absent (dashed footprint), hole20 plinth in sandstone with arrows into the loop, rope on every outside-hazard hole, world piece hook `piece(kind,item,t,s)`, wind hook `course.userData.wind(vec)` + `windNow()`.
- [x] ui: scoring fix — onHoled got res.strokes, which SimulateFrom never sends: the card saved nothing. It now gets g.strokes; recordScore refuses a non-integer count (demoCard self-check).
- [x] ui: Far camera — its own rig (farRig): the whole course box at 86 % of the free screen, a 3/4 view (39° desktop, 49° phone), a mouse orbit of ±6° yaw / ±2° pitch sized so the box stays in frame; Far never takes the ball framing. The overview distance cap raised from 240 to 480 (town18 on a phone was cut). Test: media/camera/farshot.mjs.
- [x] ui: thunder removed (the flash stays).
- [x] ui: flights drawn to the chain's air flags — on the ground (no flag) the ball follows downhill slopes instead of free-falling behind them (mountain16 floated 0.19 over a slope); a flight leaves at the height he really has and along the ramp's slope, then one parabola to the chain's landing (the fixed extra arc, and a lip height read before a seesaw moved, drew a dip then a hop). Test: media/camera/flighttest.mjs.
- [x] ui: sound gate verified — nothing plays unless the page is visible, focused and on a hole (demo silent, AudioContext suspended and gust timers dropped on blur/hide). media/camera/soundtest.mjs (blurred storm hole, title idle, and a focused control that does hear the shot; SECS=60 for the long run).
- [x] media: lib/cdp.mjs kills every Chrome it started on exit, Ctrl-C, SIGTERM, an uncaught error, or after CDP_MAX_MS (1 h); pulltest goes through it (muted).
- [x] ui: third person — inside the board (over the green, ≥1.5 from a rail, or ≥0.6 and above the rail when straight behind; the real pose too, not only the target); rest heading along the lane's axis (the rails near the ball, averaged twice, 1/d³; the distance field now 8-connected); a board that leaves no room (a tee in a round end) brings the camera in steeper and wider rather than out past the rail; the gnome kept within 55 % of the half lens of the centre; aim trail 0.14 s / 480°/s (a U-turn within 15° in 0.5 s); no more lean off a rail beside the ball. camsuite: hole7, hole8 added; put-ball rests (axis ≤5°, inside), aim convergence, board rule every replay frame.
- [x] ui: intro glide — the end pose picked once, then one 1.4 s ease-in-out orbit of the gnome (distance and heading each one way), look, lens and offset eased, the far plane kept far; starts the frame after one drawn, a key or click finishes it in 250 ms; camsuite checks it (length, monotonic, in frame, frame ≤20 ms, finish), glidestrip.mjs makes the strip (media/camera/glide/).
