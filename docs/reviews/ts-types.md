# Web client: TypeScript and React review (commit 8ff9be6)

Scope: `web/` after the strict TypeScript migration. This was a read-only review; no code was changed.
Method: I read `lib/chain.ts`, `lib/types.ts`, `lib/scene/data.ts`, `lib/engine.ts`, `lib/engine/types.ts`,
`components/Golf.tsx`, `components/Title.tsx`, `components/ui.tsx` and `lib/adena.ts`, and compared the types with
`gno.land/r/gnogolf/golf/{state,weather}.gno`. I also ran four checks:

- `tsc` with `noUncheckedIndexedAccess` enabled, and again with `exactOptionalPropertyTypes` enabled (each through a scratch tsconfig);
- `@typescript-eslint/no-unused-expressions` over the client;
- a scan of value imports for cycles;
- a look at the prerendered `out/index.html`.

Baseline `tsc --noEmit` is clean.

Each finding says whether its fix is **behaviour-neutral** (the same output for every input the realm actually sends).

## What is good

- **The types match the realm.** Every interface in `lib/types.ts` field-matches the JSON that `state.gno` / `weather.gno` print:
  - `HoleState` has the optional `slot`/`v`/`next`. `Zone` has `air`/`capped`, which are printed only when true, and `poly`/`outside`, printed only for polygons.
  - The timing fields are optional because `timingJSON` prints nothing when `every <= 0`.
  - `ZoneKind` equals `physics.ZoneKind.String()`.
  - `SimulateFrom` and `SimulateRound` match `simulateFrom` and `simulateRound`. `Round | null` matches `Round()`, which returns `"null"`.
  - `Weather` is `Versioned & Forecast`.
  - `Stroke = SimulateFrom & Partial<Pick<SimulateRound, …>>` is exactly right for "either answer".

  I found no drift.
- **There is one parse point.** `qeval<T>(expr, guard)` means no realm JSON reaches the app as `any`. Errors are tagged (`ChainError.kind`), the version is checked, the timeouts are the page's own, and the arguments are escaped (`s()` is `JSON.stringify`, `fx()` refuses non-finite numbers).
- **Every `JSON.parse` of browser storage is typed `unknown` and narrowed.** This covers the holes cache (it re-runs `checks.holes`), friends, earned and flags.
- **The unions are tight where they matter.** `Screen`, `Mode`, `CamMode`, `GfxMode`, `Tier`, `ErrorKind`, `gl: null | "lost" | "gone"` and `view` are all unions, and `camOf`/`gfxOf` and `m()` normalise strings coming in.
- **userData is typed through a single door.** `ud()`/`md()` are the only way `userData` is read as a shape. `Course`/`Gnome`/`Aim`/`LitScene` narrow `userData` on the object type, so `course.userData.tubes.get(z)` is typed. Only 4 files touch `userData` outside those types.
- **Module structure is sound.** A scan of value imports found **no circular imports**. `engine/types.ts` is type-only on purpose, and the engine parts (`engine/camera`, `aim`, `replay`, `probes`) take a `Live` view (`E`) rather than importing `engine.ts`.
- **React is well structured.**
  - The hot/cold snapshot split (`useSyncExternalStore` for power, cause and flash) avoids 60 Hz re-renders of a 2000-line tree. It is the right tool, and it is used correctly (the `sub` function is stable, and the selectors return primitives).
  - Every async effect has a `live` flag or an `AbortSignal`. Keys in lists are stable ids (`player`, `addr`, `h.id`).
  - `Golf` is `ssr: false`, so its `window`/`localStorage` reads in `useState` initialisers are safe.
  - `useDialog` handles focus trap, restore and stacking properly.
- **The TS config is modern and strict:** `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `consistent-type-imports` enforced.

## Findings, by severity

### High

**H1. There is a hydration mismatch on every first load.** `web/components/Title.tsx:121`, and `:155` + `:300`.

The dynamic loader's fallback, `<Title loading />`, is prerendered into `out/index.html`. The built file contains `load__chore">Oiling the windmill…`.

- `Loader` seeds its chore with `useState(() => Math.floor(Math.random() * chores.length))`. The client picks another index about 7 times in 8, so the text differs and React 19 throws away the server HTML and re-renders the root on the client, logging "Hydration failed…" in production.
- `guessWorld()` returns `"garden"` on the server and the URL's world on the client. The `load--island` class and the chores list therefore differ for every `?hole=island…` or `?world=` link. React does not patch attribute mismatches, so today only the text mismatch's full re-render hides this one.

Fix:
- Initialise with `useState(0)` and randomise in the existing `useEffect` (or `setChore(random)` on mount).
- Read the world with `useSyncExternalStore(noopSubscribe, guessWorld, () => "garden")`, or in an effect.

Behaviour-neutral apart from the first chore shown (now index 0 for one frame). It removes the console error and a full client re-render at boot.

### Medium

**M1. The generic type guards at the chain boundary are casts in disguise.** `web/lib/chain.ts:72`, `:75`, `:77`.

- `stroke: <T extends SimulateFrom>(v): v is T` checks only `path`. It is instantiated as `checks.stroke<SimulateRound>`, so it "proves" `strokes`, `period`, `rest`, `holed`, `air` and `cause` without looking at them.
- `rows: <T>(v): v is T` proves every field of `Leaderboard`, `Bests`, `Standings` and `HoleLeaderboard` from `Array.isArray(v.rows)`.
- `round` checks `shots` only, while `Golf.tsx:646-664` branches on `r.strokes` and `mine.done`.

The consumers know this. They re-check fields the types say are already sound:
- `engine.ts:989`: `Array.isArray(res.rest) && res.rest.every(Number.isFinite)`;
- `engine/replay.ts:415`: `typeof flags === "string"`;
- `engine/aim.ts:267`: `typeof res.cause === "string"`.

A guard declared `v is T` must check what `T` promises, or the file header's claim ("a reply that is not that shape is refused here") is false for these reads.

Fix: write non-generic guards.
- `simFrom`: path non-empty and all points, `isVec(rest)`, `typeof holed === "boolean"`, `typeof air === "string"`, `typeof cause === "string"`.
- `simRound = simFrom && Number.isInteger(strokes)`.
- `round`: add `typeof done === "boolean" && Number.isFinite(strokes) && isVec(rest)`.
- `rows`: take an element guard, e.g. `rowsOf(isStrokesRow)`.

Then delete the three downstream re-checks.

Not strictly behaviour-neutral: a malformed reply becomes a "chain" refusal where today it degrades (for example, `rest` missing makes the next stroke replay from the tee). For anything the realm prints today it is neutral.

**M2. The save state is a bag of optionals rather than a union.** `web/components/Golf.tsx:37-48`, used at `:407`, `:602-668` and `RecordState` `:1198`.

`Rec = null | "signing" | Saving`, where `Saving` has eight optional fields. The states are real and disjoint: signing (with an optional part/of), refused (`error`, `stale`), and on-chain (`hash`, `height`, `parts`). The code decodes them indirectly: `onChain = rec.hash !== undefined && !rec.error`, and `RecordState` tests `record.signing` inside a `record !== "signing"` branch. Nothing stops `{ hash, error }` being built, and `land({ ...(tx || {}), hash: … })` relies on spread order.

Fix:

```ts
type Rec = null
  | { at: "signing"; part?: number; of?: number }
  | { at: "refused"; error: string; stale: boolean }
  | { at: "saved"; hash: string; height?: number; parts: number };
```

`RecordState` then becomes a `switch (record.at)`. Behaviour-neutral.

**M3. Cups, unlocks and error text are keyed by `string`, so a missing key only shows at runtime.**
- `web/lib/card.ts:132`, `:138`, `:159`: `CUPS` is a `string[]` and `cupTotals` returns `Record<string, CupTotal>`, so `t.garden` / `t.gardn` both type-check, and `UNLOCKS: Record<string, Unlock>` accepts any id.
- `web/lib/scene/gnome.ts:14`: `Skin.unlock?: string`, so `UNLOCKS[gn.unlock]` needs the runtime `&& UNLOCKS[gn.unlock]` guard at `Golf.tsx:393`, `:398` and `:753`.
- `web/components/Golf.tsx:252`, `:159`, `:1144`: `fatal.kind` is `string`, and the banner's `TEXT` table is forced with `as Record<string, readonly [string, string]>`. A new `ErrorKind` without a row renders `undefined[0]`, which throws inside the error banner itself.

Fix:
- `const CUPS = [...] as const; type Cup = (typeof CUPS)[number];` then `Record<Cup, CupTotal>`.
- `UNLOCKS = {...} satisfies Record<string, Unlock>` and `unlock?: keyof typeof UNLOCKS`.
- `type FatalKind = "down" | "empty" | "bug" | "webgl"` as the return type of `fatalKind` and the type of `fatal.kind`.
- Replace the `TEXT` cast with `satisfies Record<FatalKind | ErrorKind, readonly [string, string]>`.

Behaviour-neutral. All keys exist today; these types keep it that way.

**M4. Course userData is built after an up-front cast.** `web/lib/scene/course.ts:39`, `:79-118` (and the same pattern at `gnome.ts:317`, `fx.ts:144`, `camera.ts:41`).

`new THREE.Group() as Course` asserts that 20 `CourseData` fields exist before they are assigned one by one. Forgetting one, or adding a field to `CourseData` without assigning it, compiles and fails in the frame loop. Separately, `dec.userData.fade` / `.weather` (`course.ts:88-89`) read three's `any` bag directly instead of going through `ud(dec)`.

Fix: build the data as one object literal and attach it once, so the compiler checks completeness:

```ts
const withData = <O extends THREE.Object3D, D extends object>(o: O, d: D) =>
  Object.assign(o, { userData: Object.assign(o.userData, d) }) as O & { userData: D };
// const data: CourseData = { wear, flag: flagOf(g), height, … };   // missing key = compile error
```

Also use `ud(dec).fade`. `Gnome`, `Aim` and `LitScene` are small enough to do the same way. Behaviour-neutral.

The `ud()`/`md()` escape hatch itself is sound. three types `userData` as `Record<string, any>`, `ObjData` is all-optional, and every reader already handles `undefined`. The `!` reads in `title.ts:250` (`baseY!`) and `island.ts:1329` / `:1366` (`crown!`, `lamp!`) are on objects built a few lines earlier in the same module. They are acceptable, but `?? 0` (as `engine.ts:405` already does) costs nothing.

### Low

**L1. The latest-value refs are written during render.** `web/components/ui.tsx:96`, `Golf.tsx:209`, `:223`, `:683`, `:747`.

`close.current = onClose`, `again.current = onRetry`, `unlockedRef.current = unlocked` and `holedRef.current = …` are assigned in the render body. That is fine today, because nothing is concurrent-interrupted. React 19.3 is installed, so `useEffectEvent` is the supported form of this pattern, and the React Compiler lint rules flag the current form. Fix: `const onRetryEvent = useEffectEvent(onRetry)`, and so on. `goToRef` (`:340`) already does it the effect way. Behaviour-neutral.

**L2. The lint plugin is too old for React 19 idioms.** `eslint.config.js:22-25`.

`eslint-plugin-react-hooks@5.2` predates the React 19 / Compiler rules (`purity`, `refs`, `set-state-in-render`, `useEffectEvent` awareness). The `purity` rule would have caught H1: `Math.random` in a `useState` initialiser. Fix: bump to `^7` and use `reactHooks.configs.recommended`. There are three `eslint-disable exhaustive-deps` comments (`Golf.tsx:481`, `:1766`, `:1876`). They are justified, and two of them hide a `key`-joined array that `useMemo(() => who, [key])` would make honest. Behaviour-neutral.

**L3. `useConfig` reads the URL in an effect, which forces an empty first render.** `web/components/Golf.tsx:67-102`.

`Golf` never renders on the server (`ssr: false`), so the effect only buys a render with `cfg === null`, then a second one. Fix: `useState(readConfig)`. This removes a render and the `if (!cfg)` guards in three effects. It is behaviour-neutral except that the game is created one commit earlier.

**L4. Defensive guards survive from the JS days.**

- `Golf.tsx:274`, `:320`, `:735-736`: `game.current.cover && …`, `.setMode && …`, `.find && …`, `.current && …`. These methods are always there.
- `Golf.tsx:1919`: `hb.finished ?? hb.players`, where the type says `finished: number`.
- `Golf.tsx:1864`: `b.rows || []`.
- `adena.ts:95`: `a.GetNetwork!()`. The declared-optional method is asserted and a missing one is caught as a throw; use `a.GetNetwork?.()`.

Fix: run `@typescript-eslint/no-unnecessary-condition` once (it is not in `recommendedTypeChecked`) and delete what it lists. Keep the rule off afterwards if it is noisy on three.js code. Behaviour-neutral.

**L5. `connect` trusts Adena's success reply to carry data.** `web/lib/adena.ts:128-129`, `:319`.

`acc.data!` is destructured: a `"success"` without `data` throws "Cannot destructure property 'address' of undefined" at the player. `current()` (`:163`) already handles this properly. `res.data!` at `:319` is harmless, because callers do `tx && tx.hash`, but the type then lies about it. Fix: check `acc.data?.address` with `isAddress`, and throw `why(acc, …)` if it is missing. Return `res.data ?? null` with a nullable type. Not behaviour-neutral only in the error text.

**L6. A malformed qeval reply is not tagged as a chain error.** `web/lib/chain.ts:150-151`.

If the reply is not `("…" string)`, `JSON.parse` throws an untagged `SyntaxError`. `fatalKind` then catches it with a `/unexpected token/` regex (`Golf.tsx:162`) and calls it "down". Fix: wrap the two parses and `throw refused("The chain's answer to X is not JSON.")`. Not neutral: the error kind becomes "chain".

**L7. The engine options and link types are looser than their values.**

- `engine.ts:47-49`: `aimMode`, `camMode` and `gfx` are typed `string`, though callers pass `Mode`/`CamMode`/`GfxMode`. They are normalised anyway, so type them as the unions and keep the normalisers for storage input.
- `engine/types.ts:174`: `Link { id?; cup?; n? }` would be clearer as `{ id: string } | { cup: string; n?: number }`, which is how `linked()` reads it.
- `engine/types.ts:167`: `errorKind: ErrorKind | null | undefined` should be `ErrorKind | null`. `snapshot()` produces `undefined` only when `g.error` is set without a kind, which never happens.

Behaviour-neutral.

**L8. The HOT field list is duplicated.** `engine.ts:147` and `Golf.tsx:106`.

The engine and the page each list `["power", "cause", "flash"]`. Fix: export `HOT = [...] as const satisfies readonly (keyof Snapshot)[]` from `engine/types.ts` and use it in both. Behaviour-neutral.

**L9. A history state value is cast without checking.** `Golf.tsx:728`: `st.screen as Screen`.

A foreign `history.state` with a `screen` string would set an unknown screen, and nothing would render. Fix: `const SCREENS = ["title", "worlds", "pick", "play"] as const` plus an `includes` check. Behaviour-neutral for the page's own entries.

**L10. `Golf.tsx` exports helpers.** `Golf.tsx:1722`, `:1730`, `:1736`.

`loadFriends`, `saveFriends` and `addFriend` are exported but used only inside the file. Exporting non-components from a component module breaks Fast Refresh for it in dev. Drop `export`, or move them to `lib/friends.ts` (see the split below). Behaviour-neutral.

## Compiler and lint flags: would enabling them catch bugs?

- **`noUncheckedIndexedAccess`: leave it off.** It produces 939 errors, 180 of them in `course.ts`, 123 in `island.ts` and 93 in `mountain.ts`, almost all vector and tuple math inside bounds-checked loops (`res.path[i + 1]`, `p[0]`) and `.split(",")` destructuring.
  I sampled every hit in `chain`, `adena`, `card`, `engine`, `Golf`, `Title` and `Worlds`. None is a live bug; each is guarded by context (`path.length > 0` from the guard, `WORLDS[0]` fallbacks, `CHORES.garden`). The one real class it points at, `Record<string, …>` lookups, is fixed better by M3's key unions than by `| undefined` everywhere.
- **`exactOptionalPropertyTypes`: leave it off.** It produces 19 errors. All are `x: T | undefined` passed to an optional prop (`world={s ? s.world : undefined}`, `{ rpc, web }` into `makeChain`). None is a bug, and the fixes would be pure noise.
- **`@typescript-eslint/no-unused-expressions`: off is right.** With `allowShortCircuit` and `allowTernary`, it still reports 123 sites. I looked at 90 of them and every one is a deliberate comma sequence (`(a = 1), (b = 2)`, `e.preventDefault(), z.focus()`). None is a dead expression or a forgotten call. The comment in `eslint.config.js` is accurate.
- **Worth adding instead:** `no-unnecessary-condition` for one cleanup pass (L4), and the React Compiler hook rules (L2).

## Oversized files: proposed splits (not done)

The engine already has the right pattern: `makeX(E: Live)` modules under `lib/engine/`. Both big files can follow the seams they already mark.

**`lib/engine.ts` (1312 lines).** Its section banners are the cut lines:

| New module | Lines now | Contents |
|---|---|---|
| `engine/publish.ts` | 143-236 | `perList`, `publish`, `snapshot`, HOT throttle; takes `g`, `chain`, `onChange` |
| `engine/gfx.ts` | 246-320 | tier, frame probe, `resize`, dpr cap; returns `{ setTier, probeFrame, resize, tier() }` |
| `engine/load.ts` | 441-718 | tickets, `prefetch`/`stateOf`, `load`, `warm`, extras/pulses, weather refresh, `newRound` |
| `engine/input.ts` | 719-909 | pointer and keyboard aiming, `boardPoint`, `endPull` |
| `engine/shot.ts` | 910-1056 | `fire`, `shoot`, the replay budget, `rightUp` |

What stays in `engine.ts` (about 350 lines) is the state `g`, the scene objects, `frame()`, `start`/`linked`, and the returned `api`.

`Live` (`engine/types.ts`) already lists most of what these modules read. It gains `load`, `publish` and `fail`.

**`components/Golf.tsx` (2018 lines; `Golf()` alone runs 243-1197).**

| New file | Moves |
|---|---|
| `components/Boards.tsx` | `Boards`, `Friends`, `Leaderboard`, `Standings`, `useFlags`, `FlagMark`, `screen_`, `vsPar` (1610-2004) |
| `lib/friends.ts`, `lib/prefs.ts` | friends storage (1716-1744); `savedCam`, `savedGnome`, `hadGnome`, `earned`, `remember` |
| `components/Save.tsx` | `SaveClock`, `RecordState`, `RealPlay`, deposit helpers, and a `useSaveRound(game, s, account)` hook holding `recordIt` + `Rec` (M2) |
| `components/Picker.tsx` | `Picker`, `AimSetting` |
| `components/WinCard.tsx` | `Stamp`, `Scorecard`, `shareText` |
| hooks in `components/golf/` | `useConfig`, `makeHot`/`useHot`; `useWallet()` (account, funds, gas, chain id, node, byte price: the effects at 524-590 plus connect/disconnect); `useAddressBar(screen, s, gnome)` (URL sync and popstate, 697-742); `useTabTitle(s, playing)` (349-378) |

`Golf()` would then keep the screen machine, the game's lifetime effect and the JSX composition, at about 400 lines.

These are moves only: behaviour-neutral if they are done as pure extraction with the same effect dependencies.

## Minor notes (no action needed)

- `State` and `Community` in `types.ts` are never used; the client calls neither `State()` nor `Community()`. They are harmless as documentation of the realm.
- `title.ts:25` uses `TITLE_HOLES as unknown as Record<string, Hole>`, a double cast of a baked JSON asset. This is acceptable: JSON imports widen tuples to `number[]`, and the file is build-time data. `promo.ts:155` is a test hook.
- `checks.state` deliberately stops at structure. A hole missing `wear` or `board.w` fails inside `buildHole`, which `load()` catches as `"draw"`. That is reasonable, since the realm is the only author of this JSON and the page is pinned to it by `REALM` and `safeEndpoint`.
