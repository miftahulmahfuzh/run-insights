# F20 — the pace/HR chart's x-axis stops overprinting

**Card:** [#18](https://github.com/miftahulmahfuzh/run-insights/issues/18) · round 1 · 2026-08-22

## 1. The bug, measured

On `/r/[id]`, the pace/HR chart's x-axis overprints once a run has ~20 or more split rows. At the
app's own width a 21.2 km run's 22 tick labels render as `101112131415161718192021 22*` — an
unreadable smear. An 11-row 10.9 km run on the same screen is clean.

The pixel budget, derived rather than guessed:

| Step | Width |
|---|---|
| iPhone-class viewport | 390 px |
| `main` is `max-w-[470px] p-5` | 350 px |
| `Card` is `p-5` (`ChartFrame`) | 310 px |
| less `YAxis width={46}` (pace), `width={30}` (HR), `margin.right: 8` | **≈ 226 px of plot** |

Recharts then confirms it: the rendered axis line is `x1="46" x2="264"` — **218 px**, eight less than
derived, because the HR axis rounds up. Every figure below uses the derived 226; the real budget is
slightly tighter, which only makes the cap safer.

At Recharts' 12 px tick font a two-digit label is ~14 px, so with a readable gap the axis holds
**about 8–11 labels**. `interval={0}` with `minTickGap={0}` was asking it to draw 22 — those two
props tell Recharts explicitly *never* to skip a tick, which is the direct cause.

The two measured data points bound the fix: **11 labels is legible, 22 is not.**

## 2. Why not the alternatives

Three were weighed (the card names all three) plus a fourth found while reading Recharts.

**Rotate the labels** (`angle={-45}`). 22 labels at a ~10 px pitch still collide when rotated, it
costs plot height inside a fixed `height={186}` frame, and diagonal text is a voice this app's
charts have avoided everywhere else.

**Switch the x-axis to a distance scale** (`type="number"`, domain `[0, distanceM]`). Spatially the
most honest — the partial kilometre would finally occupy less width than a full one. But it re-bases
the tooltip's `data.find((p) => p.km === label)` lookup, `SeriesDot`'s index math and the `*` marker
semantics all at once, for a legibility problem a stride solves. Worth revisiting on its own merits;
not as a bug fix.

**`interval="preserveStartEnd"`** — the one-line version. Recharts measures the label text itself and
skips collisions, keeping the first and last tick. Rejected for two reasons:

1. **It is unverifiable in this repo.** The skip depends on runtime text measurement, and
   `vitest.config.ts` sets `environment: 'node'` — there is no DOM, so there is nothing to assert.
   The behaviour would be eyeball-only, permanently. This bug already survived to production once
   by being eyeball-only.
2. **No control of the stride.** Recharts picks whatever step clears collisions, which is how you
   get labels at km 1, 4, 7, 13. Where the stops land is a legibility decision worth making on
   purpose.

## 3. The fix

### 3.1 A pure function on a stride ladder

New export in `lib/charts/paceHr.ts`, barrelled through `lib/charts/index.ts`:

```ts
const MAX_AXIS_LABELS = 11
const STRIDES = [1, 2, 5, 10] as const

export function kmAxisTicks(points, maxLabels = MAX_AXIS_LABELS): number[]
```

Two rules govern it:

- **Round strides only.** A reader scanning a kilometre axis expects 2s, 5s and 10s — not 3s and 7s.
- **Stride by index, never by `km` value.** `km` happens to run `1..n` today; a function that
  assumes it will break quietly the day it doesn't.

Anchored on the first row, then the last row is **force-appended, because it carries the `*`** — its
neighbour is popped when the gap is under one stride. That makes D14's partial marker a visible
guarantee in the code rather than something that happens to survive.

| Rows | Stride | Labels drawn | Count |
|---|---|---|---|
| 11 (the run in `docs/media/07-run-chart.png`) | 1 | 1,2,3,…,11* | 11 — **identical to before** |
| 22 (the bug) | 2 | 1,3,5,…,19, 22* | 11 |
| 42 (a marathon) | 5 | 1,6,11,…,36, 42* | 9 |
| 100 (an ultra) | 10 | 1,11,…,81, 100* | 10 |

Every case lands at or under the density already observed to be readable, and short runs are
provably untouched — which is what keeps F19's committed screenshot valid.

The cap is a constant sized for the **narrowest** viewport, not measured per render. At a 470 px
column the plot is ~306 px and would hold ~15 labels; sizing for 390 px is the same mobile-first
choice the fixed heights and fixed axis widths in `ChartFrame` already make.

### 3.2 One prop on the XAxis

`PaceHrChartInner.tsx`'s `XAxis` gains `ticks={kmAxisTicks(data)}`. Nothing else in the file moves:
same single pace axis, same HR axis, same dots, same tooltip, same `LabelList`, so
`ci:f08-guard`'s `yAxisId`-appears-once count is unchanged.

**`interval={0}` stays, and it is load-bearing.** With an explicit `ticks` array it no longer means
"draw all 22" — it means "draw exactly the ticks we chose, and do not second-guess them." Removed,
Recharts re-applies its own collision skip *on top of* our list, and the tick it is likeliest to
take is the crowded final one — the one carrying the `*`. The comment has to say so, or it gets
deleted as dead weight.

### 3.3 What deliberately does not change

- **Every split still draws a dot.** `SeriesDot` is per-datum; thinning labels does not thin marks.
  A 22 km run shows 22 dots and 22 tooltip stops.
- **The keyboard path is untouched.** `accessibilityLayer` arrows through data points, not ticks, so
  all 22 kilometres stay announced.
- **The caption is unchanged.** A chart labelling every other tick is ordinary convention and does
  not need apologising for.
- **`table={null}` stands.** The splits table below still prints all 22 rows — which is why thinning
  labels costs no access at all. F08's table-twin rule doing exactly the job it was written for.

## 4. The harness comment

`scripts/capture/shoot.mjs` documents this bug at its run-selection block and justifies
photographing the 10.9 km run partly because of it. Once fixed that comment is **false**, and a
stale comment explaining a bug that no longer exists is worse than no comment.

It is rewritten to keep the run choice — "the modal run is the honest thing to show a visitor rather
than the flattering one" stands entirely on its own — and to drop the overprinting justification.

`07-run-chart.png` / `08-run-splits.png` are **not** re-shot, and the harness is **not** switched to
the long run. §3.1 keeps the 11-row frame pixel-valid, and changing what the README photographs is a
separate editorial call, not part of fixing an axis.

## 5. Verification

- Unit tests in `tests/charts.paceHr.test.ts`, pure, no DOM: the 11-row no-change guard, the 22-row
  bug in numbers, the last-tick-always invariant, the ladder past the reported case, a
  property loop over every length 2..120, and non-contiguous `km` values to prove index striding.
- The full CI gate from `.github/workflows/`.
- The actual eye, at 390×844 — and **not** by seeding: `seed-demo.mjs` writes to the real database
  and the real Blob store, which is too much side effect for looking at an axis. Instead the real
  `PaceHrChart` was rendered on a throwaway route inside the identical `max-w-[470px] p-5` shell, so
  the card, both y-axes and therefore the plot band are pixel-for-pixel what `/r/[id]` produces. The
  route and its Playwright driver were deleted before commit.

  Before, with the prop removed: `1 2 3 4 5 6 7 8 9 10111213141516171819202122*` — the reported
  smear, reproduced. After: `1 3 5 7 9 11 13 15 17 19 22*`. The eleven-row control reads
  `1 2 3 4 5 6 7 8 9 10 11*` both times.
