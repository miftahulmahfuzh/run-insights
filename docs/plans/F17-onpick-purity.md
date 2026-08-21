# F17 — The picker that uploaded everything twice while nobody was watching

**Card:** [#6 — onPick fires every upload twice in dev: side effects inside a setTiles updater](https://github.com/miftahulmahfuzh/run-insights/issues/6)
**Date:** 2026-08-21
**Round:** 1

## 1. The report, and why it is the last of its kind

`onPick` launches the compress-and-upload chain from **inside** a `setTiles` state updater:

```ts
setTiles((current) => {
  ...
  filesRef.current.set(tile.id, file)
  void process(tile, file)      // <- side effect inside an updater
  return [...current, ...added]
})
```

`next.config.ts` sets `reactStrictMode: true`, and Strict Mode double-invokes state updaters
deliberately, to surface impure ones. So in dev every side effect in that updater runs twice.
Measured on the card — headless Chromium against `npm run dev`, one file picked, exactly once:

```
files picked:            1
tiles rendered:          1
POST /api/upload calls:  2   <- token mints
all PUTs:                2
```

Two token mints, **two distinct blobs written**, one tile. The surviving tile references one of
them; the other is orphaned in the store for good. `URL.createObjectURL` and `filesRef.current.set`
run twice as well, leaving a stray `File` in the map under an id no tile has.

**Dev-only.** Strict Mode does not double-invoke in a production build, so no shipped upload is
duplicated and no user is affected. What it costs is Blob storage on the free tier, and it makes
the upload count misleading exactly when someone is debugging the upload path.

What makes this worth a plan rather than a one-line patch is that it is the **last** of its kind
here. F16 rebuilt `changeKind` around precisely this hazard and left the reason in the source:

> The `process` calls sit OUTSIDE the `setTiles` updater on purpose: React StrictMode may invoke
> an updater twice in dev, which would double-fire an upload.

F16 §9 then listed `onPick`'s double-fire as knowingly out of scope. This is that item. So the
design is not new — it is applying an existing, already-argued one to the function it was written
about, which is why this plan spends its length on *where the logic goes* rather than on what the
behaviour should be.

## 2. The decision: move the decision out, not the effects down

Three options were weighed.

| | Approach | Verdict |
|---|---|---|
| **Pure planner + effects after** | The whole decision becomes a pure function in `lib/`; `onPick` calls it, sets state with a value, then runs each effect once | **Chosen** |
| Shuffle the effects out, logic stays inline | Same control flow, but the loop stays in the `.tsx` | Rejected |
| Queue tiles, upload from a `useEffect` | Tiles enter state as `queued`; an effect drains the queue | Rejected |

**The planner wins on testability, and that is not a preference here — it is a property of the
runner.** `vitest.config.ts` sets `environment: 'node'` with an `include` matching `*.test.ts`
only, and this repo has no component tests by design. `lib/extract/reassignKind.ts` opens by
stating the consequence outright: *"Logic living inside a `.tsx` component is logic this repo
cannot unit-test."* The kind-default rule, the room arithmetic and all three error strings are
exactly the kind of small total rule that deserves exhaustive proof, and inline in a `.tsx` they
get none.

*Shuffle the effects out* fixes the reported bug and leaves the interesting half unprovable. It is
the smaller diff and the worse outcome.

*Queue from a `useEffect`* is the textbook separation of render from effect, and it loses on its own
terms: Strict Mode double-invokes **effects** too, so it needs the same idempotence guard as §4
anyway, while rewriting a path that works in production. It buys nothing the chosen option does not
already have.

## 3. The pure module, and two things that force its signature

```ts
// lib/extract/planPicked.ts
planPicked(existing: readonly KindHolder[], picked: readonly File[]): PickPlan
// PickPlan = { accepted: { file: File; kind: ScreenKind }[]; error: string | null }
```

It returns `{ file, kind }` pairs rather than finished `Tile`s, and both reasons are the point of
the exercise.

**`newId()` is random and `URL.createObjectURL` is a browser API.** A planner that minted ids or
previews would be impure — the same defect one layer down — and asserting anything about it would
need a stubbed RNG. So the planner decides only *which files are accepted and which kind each
gets*; `onPick` mints `id`, `gen: 0` and `previewUrl`. Every branch is then deterministic and
asserted directly, with no test doubles at all.

**`rejectionReason` moves to `lib/extract/rejectionReason.ts`.** It lives today in
`lib/photos/compressForExtraction.ts`, which opens with `'use client'` and imports
`browser-image-compression`; reaching a nine-line pure validator through that is the wrong trade
for a node-environment test. The move is small and has precedent in the same file — `resizeTarget.ts`
was split out of it for the same reason and says so in its header. `rejectionReason` has exactly
**one** importer (`UploadPicker.tsx:19`), it validates rather than compresses, and it belongs next
to the `MAX_SOURCE_BYTES` it reads. `compressForExtraction` loses that import entirely; it uses the
constant nowhere else.

**Behaviour is preserved exactly, including one asymmetry worth naming.** A rejected file today
sets `formError` and `continue`s, so picking one good file and one 40 MB file adds the good one
*and* shows the message. The planner returns `accepted: [good]` alongside `error`, keeping that;
when several messages fire in one pick, the last still wins. `error: null` on the happy path means
`onPick` can call `setFormError(plan.error)` unconditionally, which subsumes today's
`setFormError(null)` at the top of the function.

## 4. `process` becomes idempotent per generation

Purity fixes the reported bug at its cause. The guard is belt and braces for the next replay path,
whatever introduces it — a future concurrent-rendering behaviour, or an edit that reintroduces a
double call somewhere else:

```ts
const started = useRef(new Set<string>())

const process = useCallback(async (tile: Tile, file: File) => {
  const key = `${tile.id}:${tile.gen}`
  if (started.current.has(key)) return
  started.current.add(key)
  try {
    ...
  } catch (cause) {
    started.current.delete(key)   // a failure is retryable; a success is not repeatable
    patchIfCurrent(tile.id, tile.gen, { state: 'error', ... })
  }
})
```

`changeKind` already bumps `gen`, so a swap mints a fresh key and re-uploads exactly as it does
today. The guard is invisible to every path that currently works.

**The `catch` deletes the key, and that is the load-bearing detail.** A guard that only ever adds
is a guard that silently no-ops a *legitimate* second attempt. There is no retry path today, but
"the tile says Upload failed, tap to retry" is the obvious next feature on this screen, and it
would arrive at the same `gen` and do nothing — a worse bug than this one, and harder to see,
because the guard would be hiding it. Deleting on failure keeps the guard's real job intact: it
blocks a replay of a start that is still in flight or that already succeeded, which is precisely
the duplicate-blob case. A failed attempt wrote no blob, so letting it run again costs nothing.

**Not doing:** pruning `started` in `remove`. `newId()` never repeats, tiles cap at three, and a
prefix scan to reclaim three strings is noise. It gets a comment, not code.

## 5. `onPick`, after

```ts
const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
  const picked = Array.from(event.target.files ?? [])
  event.target.value = ''
  if (picked.length === 0) return

  const { accepted, error } = planPicked(tiles, picked)
  setFormError(error)
  if (accepted.length === 0) return

  const added: Tile[] = accepted.map(({ file, kind }) => {
    const previewUrl = URL.createObjectURL(file)
    previewsRef.current.push(previewUrl)
    return { id: newId(), gen: 0, previewUrl, kind, ... }
  })

  setTiles([...tiles, ...added])

  added.forEach((tile, i) => {
    filesRef.current.set(tile.id, accepted[i].file)
    void process(tile, accepted[i].file)
  })
}
```

`setTiles` receives a **value**, not an updater, so there is nothing for Strict Mode to
double-invoke. Reading `tiles` from the closure is safe for the same reason F16 gives for
`changeKind`: this only ever runs from the file input's `change` event, so the closure is current
by construction.

## 6. Tests

**`tests/extract.planPicked.test.ts`** — pure, no DOM, no network, no doubles. The rule is total
and small, so it is proved exhaustively the way `tests/extract.reassignKind.test.ts` proves its own:

- room arithmetic at 0/1/2/3 existing tiles, including the `room <= 0` message
- pick-order defaults, and the skip when a kind is already claimed
- the over-cap message naming the right count, alongside the files it *did* accept
- a rejected file accepted-around rather than aborting the batch — one good, one oversized
- all-rejected, empty pick, exact fill
- inputs not mutated
- `MAX_IMAGES === SCREEN_KINDS.length`, asserted directly, as F16 does: it is what guarantees a
  free kind always exists

**`tests/extract.onPickPurity.test.ts`** — a text scan, the idiom `tests/ui.sheetFocus.test.ts`
establishes and `tests/extract.kindSelector.test.ts` reuses, for the same reason both give: the
question is a property of the *source*, not of one rendered scenario, and answering it by source
covers every future interaction rather than the one a DOM test happens to simulate.

It brace-matches **every** `setTiles(` in `UploadPicker.tsx` and asserts that any argument which is
an arrow function has a body free of `process(`, `createObjectURL`, `.push(`, `.set(` and
`setFormError`. Stated that generally it passes for `patchIfCurrent` (a `map`) and `remove` (a
`filter`), and it fails for **any** future updater that reintroduces an effect — not only for the
one this card is about. It also pins the `started` guard, and asserts that nothing reachable from
`lib/extract/planPicked.ts` is a client module, so the node-testability that motivated §3's move
cannot silently regress.

## 7. Verification — MEASURED 2026-08-21

```
npm run typecheck                    # clean
npm test                             # 77 files, 1119 tests, all passing (36 of them new)
npm run lint                         # clean
npm run format:check                 # clean
```

**The scan was checked red before it was trusted.** A source assertion that cannot fail proves
nothing, so `origin/main`'s picker was swapped back in and the suite re-run: **12 of the 14** cases
in `tests/extract.onPickPurity.test.ts` fail on it, naming each effect individually. The two that
stay green are the regex sanity check and the planner's import-graph assertion, neither of which is
about the picker.

A green suite is still necessary and not sufficient here: the old code was "working" as written,
and the duplicate upload exists only in a browser under Strict Mode. So the card's measurement was
reproduced mechanically, with the F16 §8 recipe — Playwright's cached Chromium against
`npm run dev`, signed in with a minted Auth.js JWE session cookie (the strategy is `jwt`, so no
`session` row is needed) plus a throwaway onboarded profile, fed the genuine Apple Fitness
screenshots from `research/fixtures/screenshots/`, with `page.on('request')` counting what actually
left the browser. Real `/api/upload` mints, real Blob PUTs.

**The old code, same driver** — the card, reproduced exactly:

```
BEFORE   filesPicked: 1   tilesRendered: 1   tilesReady: 1
         postApiUpload: 2   puts: 2
           shots/gP7Pw4H82BqL.jpg
           shots/4yjNKzoViQxe.jpg     <- two distinct blobs, one referenced by no tile
         pageErrors: []
```

**The new code, same driver:**

```
AFTER    filesPicked: 1   tilesRendered: 1   tilesReady: 1
         postApiUpload: 1   puts: 1
           shots/7CQfQ7eASOJ2.jpg
         pageErrors: []
```

One mint, one blob, one tile, and the tile reached `Ready` — so the upload path still works end to
end against real Blob rather than merely running less often. And picking all three screens at once:

```
AFTER-3  filesPicked: 3   tilesRendered: 3   tilesReady: 3
         postApiUpload: 3   puts: 3          <- six, under the old code
```

The probe itself is not committed. It needs a real database, a real Blob token and a minted session
cookie, so it is a scratch harness like F16's, not something `npm test` should be able to reach —
the same line `scripts/f04-e2e-probe.mjs` draws in its own header.

## 8. Out of scope

- **The orphaned blobs already in the store.** Every file picked during development since F04 left
  one behind. Reaping them is a `@vercel/blob` `list`-and-`del` script against `shots/`, needs a
  rule for telling an orphan from a live reference, and belongs on its own card.
- **A retry affordance on a failed tile.** §4 makes it possible — the guard clears on failure —
  but the button, its copy and its interaction with `submitting` are a feature, not this fix.
- **`previewsRef` growth.** Revoked on unmount, and now pushed once per pick rather than twice; a
  removed tile's URL still sits in the array until the page goes away. Harmless, and unchanged by
  this card.
