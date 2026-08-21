# F16 — The toggle that locked itself when you needed it most

**Card:** [#3 — Make toggle in Upload page editable by user](https://github.com/miftahulmahfuzh/run-insights/issues/3)
**Date:** 2026-08-21
**Round:** 1

## 1. The report, and what was actually wrong

> in Upload page, the page showed 3 images that user uploaded, plus toggle (Summary, Splits,
> Heart Rate) for each image. make sure this toggle can be edited manually by user. i just seen
> the toggle to classify the screenshot of Heart Rate as Summary

The toggle was already editable — `KindSelector` has taken an `onChange` since F04, and
`UploadPicker.changeKind` has always been wired to it. The card reads like a missing feature and
is really a **lock-up**, which is why it is worth writing down rather than just patching.

`KindSelector` received a `taken` set — the kinds claimed by *other* tiles — and rendered them
`disabled`, at 35% opacity. That guard exists for a real reason: two tiles both claiming `splits`
would make the provenance guard believe a screen is covered when the real screen is missing, and
`ExtractRequestSchema` refuses such a request server-side anyway.

But it was implemented as **subtraction**, and the arithmetic runs out:

```
MAX_IMAGES === 3        SCREEN_KINDS.length === 3
```

With three tiles on screen, all three kinds are claimed. For every tile, the two kinds it does not
hold are held by its neighbours, so `blocked` is true for both of them:

```ts
const blocked = disabled || (!selected && taken.has(kind))
```

Every non-selected button in every tile is disabled. **The control is completely frozen at exactly
the moment a mislabel is most likely** — three screens is the full upload, and the pick order the
defaults come from (`DEFAULT_KIND_BY_INDEX`) is the Fitness app's order, not the order the OS photo
picker hands files over in. So a heart-rate screenshot arrives labelled Summary, and the only
remaining move is Remove-and-re-pick.

Worth noting the near-miss: with **two** tiles the control is only partly frozen — one kind is
always free — which is very likely why this survived F04's review.

## 2. The decision: swap, not subtract

Three options were weighed.

| | Behaviour | Verdict |
|---|---|---|
| **Swap** | Tapping a kind another tile holds exchanges the two tiles' kinds | **Chosen** |
| Allow duplicates | All buttons live; a duplicate is legal but blocks submit with a warning | Rejected |
| Displace to the free kind | The conflicting tile is pushed to whatever kind is unused | Rejected |

**Swap wins because the invariant never breaks.** The distinct-kinds property holds after every
single tap, so `Read this run` is never dead and there is no invalid state to render, explain, or
dig back out of. It also matches what has actually gone wrong: two screens are mislabelled *as
each other*, and one tap fixes both.

*Allow duplicates* was rejected for the opposite reason — it converts a locked control into a
reachable invalid state, trading a dead end for an error message.

*Displace to the free kind* is **identical to swap whenever all three tiles exist**, which is the
reported case. It differs only at one or two tiles, and there it is worse: it can move a tile the
runner deliberately set, in favour of a kind nobody chose.

## 3. Re-uploading, and a comment that was almost a trap

`changeKind` throws away the uploaded blob and redoes the compress-and-PUT from the original bytes.
Its comment explains why: `kind` is baked into the signed upload token, so an uploaded blob cannot
be relabelled after the fact.

That is true, and while reading it a cheaper option appeared — and was rejected on purpose.
Today the token's `kind` is **read by nothing**. It reaches `tokenPayload`, and the only consumer
is `onUploadCompleted`, which `app/api/upload/route.ts` documents as inert:

> a production-only observability net and **NOT a writer** … under R-1 there is nothing for it to
> write anyway

The kind that actually decides anything is the one in the `POST /api/extract` body, validated by
`ExtractRequestSchema`. So a swap *could* just relabel both `ExtractionBlobRef`s in place —
instant, no bytes moved, no button flicker.

**Rejected.** It buys about a second and leaves the signed token asserting a kind the app
disagrees with: decorative-but-wrong, and a live lie the day someone makes the webhook a real
writer — which the route's own comment anticipates. A swap therefore re-uploads both tiles, ~60 KB
and ~1 s each, concurrently, while the runner is still reading the screen. F04's original stance
stands; this section exists so the next reader does not have to re-derive it.

## 4. The rule becomes a pure function

New file **`lib/extract/reassignKind.ts`**:

```ts
export interface KindHolder { id: string; kind: ScreenKind }

export function reassignKind<T extends KindHolder>(
  entries: readonly T[],
  targetId: string,
  next: ScreenKind,
): { entries: T[]; changed: readonly string[] }
```

Four cases. `changed` is the load-bearing half of the return — it names exactly which tiles need
re-uploading, so the caller never has to diff two arrays to find out:

| Situation | `entries` | `changed` |
|---|---|---|
| `targetId` not present | input, unchanged | `[]` |
| target already holds `next` | input, unchanged | `[]` |
| no other entry holds `next` | target takes `next` | `[targetId]` |
| another entry holds `next` | the two exchange kinds | both ids |

It never mutates its input, and never returns a set containing a duplicate kind.

It lives in `lib/`, not in the component, for the reason this repo always gives: `vitest.config.ts`
runs `environment: 'node'` with an `include` matching `*.test.ts` only. Logic inside a `.tsx`
component is logic that cannot be unit-tested here.

`lib/extract/constants.ts` is pure-on-purpose and stays constants-only, so this is a new module
rather than an addition to that one.

## 5. The component: one prop deleted, one field added

**`KindSelector` loses `taken` entirely.** The prop fed only the dimming and the `disabled`
attribute, and both are gone; `blocked` collapses back to the plain `submitting` guard. All three
buttons now render identically, with only the selected one filled.

**No dimming at all** — not even a lighter version. The 35% opacity is what read as *disabled* and
hid the fix from the runner in the first place, and re-introducing a softer form of the same signal
would re-introduce a softer form of the same confusion. The swap needs no forewarning because it
announces itself: the neighbouring tile's control visibly moves the instant the tap lands.

`UploadPicker`'s `takenBy` `useMemo` becomes dead and goes with it — an O(n²) map rebuilt on every
render, now deleted along with the `useMemo` import.

The doc comment on `KindSelector` explaining why duplicate kinds are disabled is rewritten, not
kept. A comment describing behaviour the file no longer has is worse than no comment.

**`Tile` gains `gen: number`.** This is a race that predates the card and that swapping would have
doubled. `changeKind` restarts `process()` on a tile whose previous `process()` may still be
in flight; that older promise ends by writing `state: 'ready'` and a `blob` carrying the **stale**
kind, clobbering the newer one. Every write from inside `process` therefore goes through:

```ts
const patchIfCurrent = useCallback((id: string, gen: number, next: Partial<Tile>) => {
  setTiles((cur) => cur.map((t) => (t.id === id && t.gen === gen ? { ...t, ...next } : t)))
}, [])
```

The generation is compared **inside the updater**, against the state React is about to reduce over,
so it cannot read a stale `gen` from a closure. A superseded upload's result is dropped; its bytes
sit unreferenced in Blob, which is already what happens to the blob a kind change abandons today.

## 6. `changeKind`, and where the side effects live

```ts
const changeKind = (id: string, next: ScreenKind) => {
  const { entries, changed } = reassignKind(tiles, id, next)
  if (changed.length === 0) return

  const files = changed.map((cid) => filesRef.current.get(cid))
  if (files.some((f) => !f)) return   // cannot redo from bytes we no longer hold

  const bumped = entries.map((t) =>
    changed.includes(t.id)
      ? { ...t, gen: t.gen + 1, blob: null, state: 'compressing' as const, error: null }
      : t,
  )
  setTiles(bumped)
  changed.forEach((cid, i) => void process(bumped.find((t) => t.id === cid)!, files[i]!))
}
```

Two deliberate choices.

**The `process()` calls sit outside the `setTiles` updater.** `onPick` launches them from *inside*
one, which React StrictMode is free to invoke twice in dev — double-firing an upload. That is a
real but separate smell, out of scope here; the point is not to copy it into new code.
`changeKind` only runs from a user tap, so its `tiles` closure is current by construction.

**The file guard is all-or-nothing.** A swap either redoes both tiles or does nothing, never
leaving one stranded in `compressing` with no upload running. It is unreachable in practice —
`filesRef` is written on pick and cleared only by `remove`, which drops the tile too — which is
precisely why it should fail closed rather than half-apply.

## 7. Tests

**`tests/extract.reassignKind.test.ts`** — pure, no DOM, no network.

- the two no-op cases, the free-kind case, the swap case, each asserting `changed`
- input array and its elements are not mutated
- **exhaustive invariant**: every reachable arrangement of 1–3 tiles crossed with every
  `(target, next)` tap — a space of a few hundred cases — asserting the result always has distinct
  kinds, always has the same ids, and always gives the target the kind it was asked for
- `MAX_IMAGES === SCREEN_KINDS.length`, asserted directly. This is the equality the whole design
  rests on: it is what guarantees a free kind always exists. If a fourth screen kind ever lands,
  this test fails loudly instead of the picker quietly wedging again.

**`tests/extract.kindSelector.test.ts`** — a text scan, in the style `tests/ui.sheetFocus.test.ts`
establishes and justifies for exactly this situation: the question is a property of the source, not
of one rendered scenario, and proving it by source is stronger than proving it for the one
interaction a DOM test would happen to simulate.

- `KindSelector.tsx` mentions no `taken` and no `opacity`, so the dimming cannot creep back
- `UploadPicker.tsx` mentions no `takenBy`
- `UploadPicker.tsx` routes its in-flight writes through a generation guard, so the race fix cannot
  be silently undone by a later edit

## 8. Verification — MEASURED 2026-08-21

```
npx tsc --noEmit                     # clean
npm test                             # 75 files, 1083 tests, all passing (23 of them new)
npx eslint components/extract lib/extract tests/extract.*.test.ts   # clean
npm run build                        # compiled, all 20 routes
```

A green suite is necessary and not sufficient here: the frozen buttons were always "working" as
written, so the defect only shows up in a browser. The page was therefore driven for real —
headless Chromium against `npm run dev`, signed in with a minted Auth.js JWE session cookie
(the strategy is `jwt`, so no `session` row is needed), and fed the three genuine Apple Fitness
screenshots from `research/fixtures/screenshots/`.

**The old code, same driver.** Six of the nine buttons carried `disabled` and `opacity-35` — every
non-selected button in every tile — and the click never landed:

```
BEFORE: [{"selected":"Summary","disabled":["Splits","Heart rate"]},
         {"selected":"Splits","disabled":["Summary","Heart rate"]},
         {"selected":"Heart rate","disabled":["Summary","Splits"]}]
locator.click: Timeout 30000ms exceeded  —  "element is not enabled"
```

That is the card, reproduced mechanically. **The new code, same driver:**

```
BEFORE: Summary | Splits | Heart rate      disabled across all three tiles: 0
tap "Heart rate" on tile 1 →
AFTER : Heart rate | Splits | Summary      tile 3 took tile 1's old kind; tile 2 untouched
tap "Summary" on tile 1 →
BACK  : Summary | Splits | Heart rate      the swap is not one-way
```

**The race, exercised rather than reasoned about.** Four kinds tapped on one tile with no pause,
while all three uploads were still in flight:

```
start:                     Summary | Splits | Heart rate
immediately after 4 taps:  Heart rate | Summary | Splits
after every upload settled: Heart rate | Summary | Splits   ← identical: no stale write won
```

All three tiles reached `Ready` (66 / 55 / 50 KB), the kinds stayed distinct, and "Read this run"
was enabled — so the re-upload path in §3 works end to end against real Blob, not just in theory.
No page errors in any run.

## 9. Out of scope

- **Guessing the kind from the pixels.** `KindSelector`'s comment already rejects aspect-ratio and
  OCR heuristics — they still need a human override for when they are confidently wrong, so they
  add a guess without removing any UI. The card asks for a working manual control, and that is a
  better answer to a wrong default than a cleverer default.
- **`onPick`'s StrictMode double-fire.** Real, pre-existing, unrelated to this card.
