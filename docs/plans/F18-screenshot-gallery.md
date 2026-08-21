# F18 — The screenshot gallery: one viewer, a circular swipe, and a tile that fills

> **Numbering note.** Drafted as F16 and renumbered before merge: two other cards landed
> `docs/plans/F16-splits-column-gutters.md` and `docs/plans/F16-upload-kind-swap.md` on `main`
> while this was in flight, and F17 went to `F17-onpick-purity.md`. F18 is the next free number.
> Every `F18 §n` reference in the source comments points here.

**Card:** [#8](https://github.com/miftahulmahfuzh/run-insights/issues/8) · round 1 · 2026-08-21
**Branch:** `task/8-split-the-screenshot-row-tap-toggle-vs`

---

## 1. What this fixes, and why the four items are one feature

The card reads as four requests. They are one, and the shape of the fix is what proves it:
every screenshot in this app is looked at through the same overlay, and that overlay is
currently a **module-private function inside `components/review/ScreenshotStrip.tsx`**. So
"make the zoom view swipeable" (§2), "make the review images swipeable too" (§3), and "let
the shared-page rows open the zoom view" (§1) are all blocked on the same thing: the viewer
is not reachable from outside one file, and it is typed to one file's photo shape.

Lift the viewer out and the four items collapse into **one new module, one moved component,
and two call-site edits**. Item 4 is a genuinely separate CSS bug that happens to live in
the same file, and is fixed on its own terms.

### The three surfaces that show a screenshot

| Surface | Component | Today | After |
|---|---|---|---|
| Run details → "Screenshots in the shared page" | `components/share/PhotoInclusionList.tsx` | row is one `<label>`; tap anywhere toggles; **no viewer at all** | left region zooms, right 72 px toggles |
| Correct this run → top strip | `components/review/ScreenshotStrip.tsx` → `ScreenshotStrip` | opens the private viewer | opens the shared viewer |
| Correct this run → a sheet's evidence panel | `components/review/ScreenshotStrip.tsx` → `SheetSource` | opens the private viewer | opens the shared viewer |

The **public** shared page (`app/(public)/s/[token]/page.tsx`) is deliberately excluded. Its
own doc comment states the decision: a Server Component with plain links and *no* lightbox,
so a viewer gets the platform's own image viewer with real save and real back. Nothing here
touches it, and `scripts/check-f11-share-boundaries.mjs` enforces that it never imports an
owner-side control.

---

## 2. `lib/photos/gallery.ts` — the pure core

New module. Co-located test `lib/photos/gallery.test.ts`; `vitest.config.ts` already includes
`lib/**/*.test.ts`, and `lib/photos/resizeTarget.ts` + `resizeTarget.test.ts` set the
precedent for exactly this pairing.

**Why a pure module instead of logic inside the component.** This repo has no component
tests *by design* — `vitest.config.ts` runs `environment: 'node'` and its `include` matches
`*.test.ts` only, and `tests/ui.sheetFocus.test.ts` documents the reasoning. So anything with
interesting behaviour has to be a pure function to be testable at all. The circular
arithmetic and the "is this gesture a page turn?" decision are both pure, and both are where
the bugs would be.

### 2.1 `stepIndex`

```ts
export function stepIndex(current: number, delta: number, count: number): number
```

`((current + delta) % count + count) % count`, returning `0` when `count <= 0`.

The double-modulo is the point: JavaScript's `%` keeps the sign of the dividend, so
`(0 - 1) % 3` is `-1`, not `2`. A naive single `%` wraps forward and not backward — which is
precisely the "swipe on the first item" case the card asks for.

**Both** the swipe and the keyboard arrows route through this. Today the arrows clamp:

```ts
if (event.key === 'ArrowRight') onIndex(Math.min(index + 1, photos.length - 1))
if (event.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0))
```

Clamping is the opposite of wrapping, so those two lines are the change. Routing both input
paths through one function is what stops the swipe wrapping while the arrow key silently
does not.

### 2.2 `decideSwipe`

```ts
export interface SwipeGesture {
  dx: number                  // end.x - start.x, px
  dy: number                  // end.y - start.y, px
  touches: number             // MAX concurrent touches seen during the gesture
  canPanHorizontally: boolean // the pan container can scroll on x (image wider than box)
  zoomScale: number           // visualViewport.scale at gesture end
}

export type SwipeDecision = 'next' | 'prev' | 'none'

export function decideSwipe(gesture: SwipeGesture): SwipeDecision
```

Evaluated in order, first match wins:

1. `touches > 1` → `none`. Two fingers is a pinch, never a page turn.
2. `zoomScale > 1` (with a small epsilon) → `none`. The page is zoomed; a horizontal drag is
   the user panning around the zoomed image.
3. `canPanHorizontally` → `none`. Same reason, for the case where the image overflows its box
   without the viewport being zoomed.
4. `Math.abs(dx) < SWIPE_MIN_DISTANCE` (48 px) → `none`. A tap and a twitch are not swipes.
5. `Math.abs(dx) < Math.abs(dy) * SWIPE_DOMINANCE` (1.2) → `none`. A vertical-dominant drag
   is the user scrolling a tall screenshot in the pan container.
6. `dx < 0` → `next`, else `prev`.

`SWIPE_MIN_DISTANCE` and `SWIPE_DOMINANCE` are exported so the test names the same numbers
the component obeys.

**Rules 1–3 are the entire pinch-zoom protection**, and they live here rather than in the
component so they can be asserted without a browser. The card is explicit that a swipe
handler which fights the native two-finger zoom is a regression, and the existing doc comment
on the viewer explains why that zoom is native in the first place: `touch-action: pinch-zoom`
on a scroll container gives the browser's own zoom and momentum panning, which a JS pinch
handler could only imitate worse, and would fight VoiceOver doing it.

### 2.3 The gesture-direction mapping, stated

The card's phrasing — *"swipe left on first → last, swipe right on last → first"* — describes
**travel through the list**, not finger direction. This implements the native mapping instead:

- finger moves **left** (`dx < 0`) → the **next** photo slides in from the right
- finger moves **right** (`dx > 0`) → the **previous** photo

That matches iOS Photos and reads correctly against the left-to-right dot row already at the
bottom of the viewer. **The circular requirement is satisfied identically under either
mapping** — only which gesture goes which way differs. Confirmed with the author before
writing this plan.

---

## 3. `components/ui/PhotoViewer.tsx` — the viewer, lifted

`PhotoViewer` moves out of `ScreenshotStrip.tsx` (~80 lines leave that file) into
`components/ui/`, and is exported from the `components/ui` barrel. It is the only
full-screen image overlay in the authenticated app.

### 3.1 The prop type widens to the minimum

```ts
export interface ViewerPhoto {
  url: string
  kind: string
}
```

Today it takes `ReviewPhoto[]`, which is why `PhotoInclusionList` could not use it. `ViewerPhoto`
is the subset the viewer actually reads — it renders `photo.url` and looks `photo.kind` up in
`SCREEN_KIND_LABEL`, and never touches `width`/`height`. TypeScript's structural typing means
`ReviewPhoto[]` still assigns to `readonly ViewerPhoto[]` with **no adapter at the review call
sites**; only `PhotoInclusionList` maps, because its field is named `blobUrl`.

### 3.2 The touch handlers

Three handlers on the **existing** pan container (`min-h-0 flex-1 touch-pinch-zoom
overflow-auto`) — no new element, no layout change:

- `onTouchStart` — record `touches[0]`'s `clientX/clientY`, seed `maxTouches` from
  `event.touches.length`, and snapshot `canPanHorizontally` as
  `el.scrollWidth > el.clientWidth + 1`.
- `onTouchMove` — `maxTouches = Math.max(maxTouches, event.touches.length)`. This is the only
  job of this handler, and it is why rule 1 works: a pinch that *starts* as one finger is
  still caught, because the second finger is seen mid-gesture.
- `onTouchEnd` — only when `event.touches.length === 0` (the last finger left). Build the
  `SwipeGesture` from `changedTouches[0]` plus `window.visualViewport?.scale ?? 1`, call
  `decideSwipe`, and on `next`/`prev` call `onIndex(stepIndex(index, ±1, photos.length))`.

**None of them calls `preventDefault()`.** That is the load-bearing property, and it is only
affordable because paging is a discrete state change with no follow-the-finger transform: the
handlers *read* the gesture and let the browser do whatever it was going to do. A
transform-based carousel would have to `preventDefault` on move to stop the container
scrolling, and that is exactly what would break the native pinch-zoom the card forbids
breaking. The scroll container keeps handling vertical drags itself, unaware.

Mutable gesture state lives in a `React.useRef`, not `useState` — it is read once at
`touchend` and must never trigger a render mid-drag.

### 3.3 Two smaller changes

- **`scrollTop` resets on index change.** A `React.useEffect` on `index` scrolls the pan
  container back to `{top: 0, left: 0}`. Without it, paging away from a screenshot scrolled
  halfway down lands on the next one already scrolled halfway down.
- **No slide animation.** Deliberate. The `n / total` counter, the dot row, and the image
  itself all change on a page turn, which is feedback enough; a transform transition would
  reintroduce the `preventDefault` pressure §3.2 exists to avoid.

Desktop keeps keyboard-only paging — no mouse-drag handler. The arrows now wrap, which is the
whole desktop half of item 2.

---

## 4. `PhotoInclusionList.tsx` — the row splits in two

### 4.1 Why the `<label>` has to go

The row is currently one `<label>` wrapping the thumbnail, the text and the checkbox, which
is *why* a tap anywhere toggles. The fix is not to add a handler to part of it: **HTML
forbids a `<button>` inside a `<label>`**, and a nested interactive control inside a label has
no defined activation behaviour. So the row becomes a flex container with two sibling targets:

```tsx
<li className="flex items-stretch rounded-field bg-paper-2">
  <button type="button" onClick={() => setViewing(index)}
          className="flex min-w-0 flex-1 items-center gap-3 p-2.5 text-left">
    <img … />
    <span className="min-w-0 flex-1">
      <span>{SCREEN_KIND_LABEL[…]}</span>
      <span>{isExcluded ? PHOTO_EXCLUDED : PHOTO_INCLUDED} · {PHOTO_ZOOM_HINT}</span>
    </span>
  </button>
  <label className="flex w-[72px] shrink-0 items-center justify-center">
    <input type="checkbox" … className="size-6 accent-[var(--accent)]" />
  </label>
</li>
```

**The padding moves off the `<li>` and onto the `<button>.`** That is what lets the `<label>`
stretch to the row's full height and width instead of leaving a 10 px dead border that
belongs to neither target — a 72 × ~57 px toggle, comfortably past the 44 pt minimum, and a
size that does not change with the label text.

The `<label>` keeps its implicit association by wrapping the input, so the whole 72 px column
activates the checkbox with no `htmlFor`/`id` pair to keep in sync. The input keeps its
`aria-label`; the button gets the strip's wording, `View the … screenshot full screen`.

### 4.2 What must not change

`toggle()` stays exactly as it is — the optimistic flip, the rollback on failure, and
`PHOTO_TOGGLE_FAILED`. Its doc comment argues that a control which lies about a privacy
setting is worse than a slow one, and none of this touches that path.

### 4.3 The viewer, and the hint

`setViewing(index)` opens `PhotoViewer` over **all** the run's photos at the tapped index —
not just the tapped one — which is what makes the swipe meaningful here. Excluded photos are
included: every row is listed, so every row is reachable.

New constant in `lib/share/copy.ts`:

```ts
export const PHOTO_ZOOM_HINT = 'tap to zoom'
```

`lib/share/copy.ts` and not the public copy module, because
`scripts/check-f11-share-boundaries.mjs` lists `PhotoInclusionList` in `OWNER_COMPONENTS` and
owner copy lives here. The wording matches the `tap to zoom` hint `SheetSource` already
shows, so the two surfaces teach the same gesture with the same words.

---

## 5. `ScreenshotStrip` — the tile that fills (card item 4)

### 5.1 The one cause behind both symptoms

```tsx
<button className="block overflow-hidden rounded-field bg-paper-2 shadow-card">
  <img className="h-[104px] w-auto object-cover" />
  <span className="block px-2 py-1.5 text-[10px] …">{label}</span>
</button>
```

The tile has **no width of its own**. It is a flex item sized by its widest child, and its
two children disagree: the image is `w-auto` (~48 px, a 9:19.5 phone screenshot at 104 px
tall) while the caption is a variable-length string plus `px-2` (~70 px). So:

- **4a, uneven tiles** — the caption wins, and "Summary" is wider than "Splits". The tile
  width is literally the width of the word.
- **4b, the image pushed left with white to its right** — the tile is ~70 px, the image is
  ~48 px and block-start aligned, and `bg-paper-2` shows through the remaining ~22 px.
  `object-cover` is already on the image and does nothing, because it has no constrained box
  to cover.

Both symptoms, one cause. Fixing the width fixes both.

### 5.2 The fix

```tsx
<button className="block w-[104px] overflow-hidden rounded-field bg-paper-2 shadow-card">
  <img className="size-[104px] object-cover object-top" />
  <span className="block truncate px-2 py-1.5 text-center text-[10px] …">{label}</span>
</button>
```

- `w-[104px]` on the tile — every tile identical, whatever the caption says.
- `size-[104px]` on the image — a real square, and now `object-cover` has a box to fill, so
  it crops instead of leaving a gutter. Chosen over the alternatives with the author: a
  phone-aspect tile (~56 px) would keep the whole screenshot but clip every caption to
  `Hear…`, and `object-contain` would only move the white space from one side to both.
- `object-top` and not the default centre. Cover on a 739×1600 screenshot in a 104 px square
  scales to width and shows ~46 % of the height; anchored at the top that band is the title
  plus the chart, the table's first rows, or the workout-details stats — the part that makes
  each screenshot identifiable. Centre-anchored, the titles are the first thing cropped away.
- `truncate text-center` on the caption — the tile is now the constraint, so a long
  `SCREEN_KIND_LABEL` must ellipse rather than widen.

The `width`/`height` attributes stay on the `<img>`: they still describe the intrinsic aspect
for the browser's own layout, and the classes constrain the rendered box.

### 5.3 `SheetSource` is left alone, on purpose

The card asks whether its `h-[168px] w-auto` thumbnails need the same treatment. **They do
not, and should not get it.**

- There is **no bug**: `SheetSource` renders no caption, so its tile *is* the image width.
  Nothing disagrees about the width, so there is no gutter and no unevenness.
- The treatment would be **actively harmful**: this is the pinned evidence panel a reviewer
  reads a heart-rate number or a split time off. Cropping ~54 % of it away to make a square
  removes the thing it exists to show. It is a free-scrolling strip precisely so the whole
  screenshot stays legible.

It still gains the swipe for free, through the shared viewer.

---

## 6. Order of work

1. `lib/photos/gallery.ts` + `gallery.test.ts` — pure, no UI, green before anything renders.
2. `components/ui/PhotoViewer.tsx` — move, widen the prop type, wire the handlers; export
   from the barrel.
3. `ScreenshotStrip.tsx` — delete the private viewer, import the shared one, fix the tile.
4. `PhotoInclusionList.tsx` — split the row, open the viewer; add `PHOTO_ZOOM_HINT`.
5. `tests/ui.photoViewer.test.ts` — the source scan.
6. Verify (§7).

Steps 3 and 4 are independent of each other once 2 lands.

## 7. Verification

Unit, on the pure core (`lib/photos/gallery.test.ts`):

- `stepIndex` wraps **both** ways — `stepIndex(0, -1, 3) === 2` and `stepIndex(2, 1, 3) === 0`
  — plus `count === 1` (every step is a no-op) and `count === 0` (returns 0, no `NaN`).
- `decideSwipe` returns `none` for each of rules 1–5 in isolation, and `next`/`prev` for a
  clean horizontal drag in each direction.

Structural, as a source scan in the style of `tests/ui.sheetFocus.test.ts`
(`tests/ui.photoViewer.test.ts`, using `readRepoCode` so doc comments cannot satisfy an
assertion):

- `ScreenshotStrip.tsx` defines no viewer of its own and imports `PhotoViewer` — there is one
  overlay in the app, not two that drift.
- `PhotoViewer.tsx` never calls `preventDefault` — §3.2's guarantee, asserted rather than
  remembered.
- The keydown handler contains no `Math.min`/`Math.max` clamp and does route through
  `stepIndex` — the arrows wrap with the swipe.
- `PhotoInclusionList.tsx` no longer wraps a row in a `<label>` and does import `PhotoViewer`.
- The strip's tile carries both a fixed width and `object-cover` — the pairing item 4 needs,
  since either alone leaves the bug.

Commands, all of which must pass:

```
npm run lint
npm run typecheck
npm test
npm run ci:f11-guard
```

Then the app itself at phone width (~414 px), which is the only place the last three claims
can actually be checked:

- the three tiles on Correct this run are the same width, each filled edge to edge;
- swipe pages both ways and wraps at both ends, in the viewer opened from all three surfaces;
- **two-finger pinch still zooms and pans, and does not page** — the regression this plan is
  most exposed to;
- on a shared-page row, the left two-thirds zooms and the right 72 px toggles.
