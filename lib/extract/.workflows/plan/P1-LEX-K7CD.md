> Adopted from `/home/miftah/run-insights/.workflows/orchestration/workout-details-estimate/PLAN.md` phase 1. Source: `.workflows/plan/workout-details-estimate/phase-1.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 1: Chart estimator

**Plan set:** `WORKOUT_DETAILS_ESTIMATE_PLAN.md`
**Analysis:** `.workflows/analyze/20261122-160452-W4D7_code_analyzer.md`
**Satisfies:** R2 — deterministic code (no model) that turns the Workout Details screen's Pace and Heart Rate chart pixels plus its printed numbers into an estimated distance and per-km splits
**Criteria:** R2.1, R2.2, R2.4
**Depends on:** none
**Difficulty:** HARD
**Package:** `lib/extract/chart`

---

## Goal

After this phase, `lib/extract/chart/` holds a pure, deterministic estimator. Given a decoded
Workout Details screenshot and its printed duration, pace range and HR range, it returns an
estimated distance and per-km splits (time, pace, HR, cadence null, final row partial). It returns
`null` instead of throwing whenever the charts cannot be found or the inputs make no sense. A
`sharp` decode shell turns stored JPEG/PNG bytes into the RGB buffer the estimator reads.
Nothing in the product imports it yet; phase 3 wires it into the extraction job.

The method's numbers were re-measured while writing this plan. The code blocks below were run
against the committed fixtures, in a scratch copy of the repo layout with the repo's
`node_modules`, `tsconfig.json` and Prettier settings: **18/18 vitest cases green (19 after reconciliation added the partial-row case, see below), `tsc --noEmit`
clean, Prettier-clean**. Measured results:

| Fixture | Distance | Full-km splits (truth 7:26 7:48 7:38 7:30 7:43 7:46) | Split HR (truth 148 158 167 174 181 180) |
|---|---|---|---|
| Fri, 560 px JPEG q80 | **6.08 km** (+0.7 %) | 7:17 7:47 7:38 7:30 7:41 7:43 (worst −9 s) | 149 159 167 175 181 180 |
| Fri, 739 px PNG | 6.07 km | 7:17 7:48 7:38 7:31 7:41 7:45 | 148 158 166 174 180 180 |
| Sun, 560 px JPEG q80 | 6.07 km | 8:16 8:18 8:17 8:36 8:31 8:13 (+0:35 partial) | 137 156 163 165 168 172 |
| Fri JPEG, `knownDistanceKm: 6.04` | 6.04 km, not estimated | 7:20 7:50 7:41 7:33 7:44 7:47 (the 0.04 km remainder, ~0:18, gets no partial row: below the 0.05 km rule, see Step 7) | 149 159 167 175 181 180 |

**Reconciled 2026-11-22 (partial-row threshold).** The planner's first draft emitted a partial row
from a 0.01 km remainder. `lib/review/checks.ts` CHK-4 (`partialConsistency`) treats a remainder as
partial only when `round2(distanceKm − floor(distanceKm)) > 0.05` (`PARTIAL_MIN_KM = 0.05`, strict),
so a 0.01–0.05 km partial row drew its "marked partial, but … leaves no part-kilometre" advisory on
every such estimate. The estimator now emits the final partial row only when the 2-decimal
remainder is **> 0.05 km**, the same test CHK-4 applies. A smaller remainder is folded away: no
row, its seconds join no full row (a full row's time stays one kilometre's time), and `distanceKm`
still reports the whole total. Friday unscaled (6.08, remainder 0.08) and Sunday (6.07, remainder
0.07) keep their partial row; Friday scaled to a transcribed 6.04 has six rows and none partial.

**One measured correction to the analysis.** Its teal predicate (`g>130 && b>130 && r<130 &&
g−r>50`) drops whole bars at 560 px. JPEG chroma subsampling lightens a 2 px bar to
~(141, 214, 220), so `r<130` fails on it: slot 10 of the Friday JPEG read 0, which moved the
estimate to 6.12 km. Removing `r<130` alone let the Elevation chart's anti-aliased green edges
(~(159, 232, 140)) through, and the locator took the Elevation chart as the pace chart. The
shipped predicate is **`g>130 && b>130 && g−r>50 && |g−b|<40`**. The red predicate
`r>170 && g<110 && b<90` is kept and works at 560 px: the marks thin out, and the empty slots are
interpolated, as the method already specifies.

## Interface Contract

**Deletes:** none
**Renames:** none
**Creates:**
- `lib/extract/chart/estimate.ts`: `RgbImage` (type re-export), `ChartEstimateInput`, `EstimatedSplit`, `ChartEstimate`, `estimateFromCharts(image, input): ChartEstimate | null`. These are exactly the index's "Shared contracts" block: same names, same fields, same nullability.
- `lib/extract/chart/decode.ts`: `decodeToRgb(jpegOrPng: Buffer): Promise<RgbImage>` (server-only; **throws** on undecodable bytes, see Handoffs)
- `lib/extract/chart/pixels.ts`: `RgbImage` (the definition), `isTealAt`, `isRedAt`, `isUsableImage` (internal to the directory)
- `lib/extract/chart/locate.ts`: `PaceChartBand`, `HrChartBand`, `SLOT_COUNT`, `slotColumns`, `locatePaceChart`, `locateHrChart` (internal to the directory)
- `lib/extract/chart/measure.ts`: `measurePaceSlots`, `measureHrSlots` (internal to the directory)
- `tests/extract.chartEstimate.test.ts`
- `research/fixtures/workout-details/` (7 PNGs moved in, `shipped/` 7 JPEGs generated, `README.md`)
**Signature changes:** none (`scripts/shipped-image-recipe.py` gains an optional `workout-details` argument; with no argument it behaves as before, byte for byte)
**Requires (from earlier phases):** none
**Leaves alone (owned by others):** `lib/extract/constants.ts`, `lib/schema/*`, `lib/llm/*` (Phase 3); `lib/db/*`, `drizzle/*`, `lib/records/*`, `app/r/[id]/*`, `lib/llm/facts.ts` (Phase 2); `docs/architecture.md`, `CLAUDE.md`, `.claude/skills/verify-run-insights/features/*` (Phase 3); `research/fixtures/README.md` (untouched; the new set documents itself in its own README)

## Files

| File | Action | What changes |
|---|---|---|
| `research/fixtures/workout-details/*.png` (7) | create (move) | moved from `.workflows/plan/workout-details-estimate/fixtures/` (untracked there) |
| `research/fixtures/workout-details/shipped/*.jpg` (7) | create (generated) | 560 × 1212 JPEG q80, by the recipe script |
| `research/fixtures/workout-details/README.md` | create | provenance, truth, printed inputs, regenerate command |
| `scripts/shipped-image-recipe.py` | modify | named fixture sets; `workout-details` set added; default unchanged |
| `lib/extract/chart/pixels.ts` | create | `RgbImage`, colour predicates, buffer sanity check |
| `lib/extract/chart/locate.ts` | create | pace-chart and HR-chart locators, slot grid |
| `lib/extract/chart/measure.ts` | create | per-slot bar height and per-slot HR |
| `lib/extract/chart/estimate.ts` | create | the contract types and `estimateFromCharts` (pure) |
| `lib/extract/chart/decode.ts` | create | `decodeToRgb` (`server-only`, `sharp`) |
| `tests/extract.chartEstimate.test.ts` | create | 19 cases on the committed bytes |

Ten entries, 23 files on disk. No existing TypeScript file is modified.

## Implementation Steps

### Step 1: Move the fixtures into `research/`
**File:** `research/fixtures/workout-details/` (new directory)
**Change:** Move the seven PNGs with a plain `mv`, not `git mv`: they are untracked in the plan
directory. Leave `prototype_pace.py` and `prototype_check.py` where they are. They are plan
artefacts that import a scratchpad path and are not fixtures.
**Code:**
```sh
cd /home/miftah/.worktrees/run-insights/workout-details-estimate
mkdir -p research/fixtures/workout-details
mv .workflows/plan/workout-details-estimate/fixtures/2026-11-2*.png research/fixtures/workout-details/
ls research/fixtures/workout-details   # 7 files: 2026-11-20-{details,heartrate,splits,summary}.png, 2026-11-22-{details,heartrate,summary}.png
```
**Impact:** The plan index and the analysis still name the old directory for the fixtures. The
reconciler or phase 3 should point at `research/fixtures/workout-details/` (see Handoffs).
`research/` is excluded from `tsconfig.json`, ESLint (`globalIgnores`) and Prettier
(`.prettierignore`), so no gate scans these files.

### Step 2: Give the shipped-image recipe a second fixture set
**File:** `scripts/shipped-image-recipe.py:1` (whole file; changes at the docstring lines 2 and 24, `import sys` at 27, `SRC`/`OUT` at 39–40 become `FIXTURES`/`SETS`, `main()` at 51–78 reads the set from `argv`)
**Change:** One recipe for every committed shipped JPEG, not a second copy of
`long_edge_target_for`. With no argument the script regenerates the canonical set exactly as
before. This was checked: the regenerated `screenshots/shipped/{1,2,3}.jpg` are byte-identical to
the committed ones under Pillow 12.3.0.
**Code:** (complete replacement)
```python
#!/usr/bin/env python3
"""Regenerate a fixture set's shipped/ JPEGs from its canonical PNGs.

Two sets, picked by the first argument (default `canonical`, the original behaviour):

  canonical         research/fixtures/screenshots/{1,2,3}.png -> screenshots/shipped/
  workout-details   research/fixtures/workout-details/*.png   -> workout-details/shipped/
                    (the chart estimator's fixtures, lib/extract/chart/; WORKOUT_DETAILS_ESTIMATE
                    phase 1)

The three `.jpg` files under `shipped/` are what the browser actually uploads: 560 px on the
SHORT edge, JPEG quality 80 — the recipe `research/downscale.mjs` scored at 108/108 and the one
`lib/photos/compressForExtraction.ts` produces. They are committed so the tagged live suite can
send exactly what production sends, rather than the originals (which cost 5,494 input tokens
against the shipped recipe's ~3,600).

This script exists because the real compressor runs in a browser Web Worker and cannot be invoked
from a test or a shell. It reimplements the same two decisions in Pillow:

  1. the long-edge target from `lib/photos/resizeTarget.ts` — `round(560 * long / short)`, which
     is the whole of the §3.1 trap. Passing 560 to a portrait image directly would clamp the
     1600 px height and yield a 259 px-wide image, far outside the tested envelope.
  2. quality 80, matching TARGET_QUALITY exactly, with no iterative byte-budget search.

It is NOT the production path and is not imported by anything — it is a documented, re-runnable
recipe for a committed artefact. Pillow's JPEG encoder is not the browser's, so the byte sizes
differ slightly from the measured table (183 KB total here vs the 170 KB
`research/downscale.mjs` recorded); the PIXEL DIMENSIONS, which are what drive token cost and
accuracy, are identical.

    python3 scripts/shipped-image-recipe.py                    # canonical
    python3 scripts/shipped-image-recipe.py workout-details    # the chart estimator's set
"""

import sys
from pathlib import Path

from PIL import Image
from PIL.Image import Resampling

# Mirrors lib/extract/constants.ts. Kept as literals with the constant names beside them because
# a Python script cannot import the TypeScript, and a silent drift here would produce a fixture
# that no longer represents what the browser sends.
TARGET_SHORT_EDGE_PX = 560  # TARGET_SHORT_EDGE_PX
TARGET_QUALITY = 80  # TARGET_QUALITY (0.8)

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "research" / "fixtures"

# set name -> (source directory, PNG stems). Each set writes <source>/shipped/<stem>.jpg.
SETS = {
    "canonical": (FIXTURES / "screenshots", ("1", "2", "3")),
    "workout-details": (
        FIXTURES / "workout-details",
        (
            "2026-11-20-details",
            "2026-11-20-heartrate",
            "2026-11-20-splits",
            "2026-11-20-summary",
            "2026-11-22-details",
            "2026-11-22-heartrate",
            "2026-11-22-summary",
        ),
    ),
}


def long_edge_target_for(width: int, height: int, short_edge_target: int) -> int:
    """Port of lib/photos/resizeTarget.ts's longEdgeTargetFor(). Never upscales."""
    short_edge, long_edge = min(width, height), max(width, height)
    if short_edge <= short_edge_target:
        return long_edge
    return round(short_edge_target * (long_edge / short_edge))


def main() -> None:
    set_name = sys.argv[1] if len(sys.argv) > 1 else "canonical"
    if set_name not in SETS:
        raise SystemExit(f"unknown set {set_name!r}; expected one of {sorted(SETS)}")
    src, names = SETS[set_name]
    out = src / "shipped"
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for name in names:
        source = src / f"{name}.png"
        image = Image.open(source).convert("RGB")
        width, height = image.size

        target_long = long_edge_target_for(width, height, TARGET_SHORT_EDGE_PX)
        # browser-image-compression's maxWidthOrHeight clamps the LONGER dimension and preserves
        # the aspect ratio; this reproduces that, not a direct resize to the target.
        # Resampling.LANCZOS, not the deprecated Image.LANCZOS alias: the latter still works at
        # runtime on Pillow 12 but is untyped, and this repo type-checks what it can.
        scale = target_long / max(width, height)
        resized = image.resize((round(width * scale), round(height * scale)), Resampling.LANCZOS)

        destination = out / f"{name}.jpg"
        resized.save(destination, "JPEG", quality=TARGET_QUALITY)

        kb = destination.stat().st_size / 1024
        total += kb
        short = min(resized.size)
        assert abs(short - TARGET_SHORT_EDGE_PX) <= 5, (
            f"{name}: short edge {short} is outside the tested 560 +/- 5 envelope"
        )
        print(f"{name}: {width}x{height} -> {resized.size[0]}x{resized.size[1]}  short {short}  {kb:.0f} KB")

    print(f"total {total:.0f} KB")
    if set_name == "canonical":
        print("(research/downscale.mjs measured 170 KB with the browser encoder)")


if __name__ == "__main__":
    main()
```
Then generate the set:
```sh
cd /home/miftah/.worktrees/run-insights/workout-details-estimate
python3 scripts/shipped-image-recipe.py workout-details
# 2026-11-20-details: 739x1600 -> 560x1212  short 560  52 KB   … (7 lines)  total 384 KB
sha256sum research/fixtures/workout-details/shipped/2026-11-20-details.jpg
# c57c66f995d46e54c56fcb8ec0748fffff6f6cdd49cd92de095cdd00338fc0eb under Pillow 12.3.0 (python3 -c "import PIL;print(PIL.__version__)")
```
A different Pillow version may produce different bytes. That is acceptable, because the README
says the pixel dimensions are the contract, but the R2.2 test must still pass on the regenerated
bytes. If it does not, report it; do not loosen the test.
**Impact:** None on the canonical set, `research/downscale.mjs` or the live suites.

### Step 3: Document the fixture set
**File:** `research/fixtures/workout-details/README.md:1` (new)
**Code:**
```markdown
# `research/fixtures/workout-details/` — the chart estimator's two runs

The fixtures behind `lib/extract/chart/` (WORKOUT_DETAILS_ESTIMATE_PLAN phase 1): Apple Fitness
screenshots of two runs on the same loop, used by `tests/extract.chartEstimate.test.ts`.

| File | Run | Screen |
|---|---|---|
| `2026-11-20-details.png` | Fri 20 Nov | Workout Details — Elevation, Heart Rate, Pace and (cut by the screen edge) Cadence charts |
| `2026-11-20-splits.png` | Fri 20 Nov | Splits — **the ground truth**: 6.04 km; 7:26 7:48 7:38 7:30 7:43 7:46 (+0:17 partial); HR 148 158 167 174 181 180 |
| `2026-11-20-summary.png`, `2026-11-20-heartrate.png` | Fri 20 Nov | Summary, Heart Rate (non-details screens: the estimator must return `null`) |
| `2026-11-22-details.png` | Sun 22 Nov | Workout Details — no Cadence chart; the watch printed no distance and no split table |
| `2026-11-22-summary.png`, `2026-11-22-heartrate.png` | Sun 22 Nov | Summary, Heart Rate |
| `shipped/*.jpg` | both | The same seven at the shipped recipe — 560 × 1212, JPEG q80 — what a browser upload puts on the wire |

**The route map is painted over** on both details screens (privacy). The real screen has a teal
route line there; `tests/extract.chartEstimate.test.ts` paints a wide, tall teal band back in to
prove the locator ignores it.

Printed inputs the tests pass to `estimateFromCharts` (what the details vision call transcribes):

| Run | Duration | Pace range (slowest–fastest) | HR range |
|---|---|---|---|
| Fri 20 Nov | 0:46:13 (2773 s) | 8'17"–6'05" (497–365 s/km) | 101–186 |
| Sun 22 Nov | 0:50:46 (3046 s) | 9'12"–6'47" (552–407 s/km) | 116–177 |

Measured 2026-11-22 with the shipped estimator: Friday 6.08 km at 560 px JPEG (6.07 km at
739 px) against 6.04 km true, full-km splits within 9 s, HR within 1 bpm; Sunday 6.07 km.

Regenerate `shipped/` with:

    python3 scripts/shipped-image-recipe.py workout-details

Pillow's encoder is not the browser's; the pixel dimensions match exactly, the bytes do not.
```
**Impact:** none.

### Step 4: Pixel vocabulary
**File:** `lib/extract/chart/pixels.ts:1` (new)
**Change:** `RgbImage` is defined here, not in `estimate.ts`, so `locate.ts` and `measure.ts` can
use it without importing the module that imports them. `estimate.ts` re-exports it, and the
contract's import path (`@/lib/extract/chart/estimate`) is unchanged.
**Code:**
```ts
/**
 * The pixel vocabulary of the Workout Details chart estimator: the image shape every module in
 * `lib/extract/chart/` reads, and the two colour predicates that decide what a chart mark is.
 *
 * Pure: no I/O, no `sharp`, no `server-only`. `decode.ts` is the only file in this directory that
 * touches a codec; everything else works on an {@link RgbImage} it is handed.
 */

/** A decoded image: RGB, 3 bytes per pixel, row-major, no padding, no alpha. */
export interface RgbImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Apple Fitness's pace-chart teal, ~(70, 230, 228) — and the Cadence chart's, and the
 * "Average: …/KM" text's; the locator, not this predicate, tells those apart.
 *
 * Measured on the 739 px PNGs and their 560 px JPEG q80 re-encodes (2026-11-22):
 *   · no red ceiling: JPEG chroma subsampling lightens a 2 px bar to ~(141, 214, 220), so the
 *     analysis's `r < 130` dropped whole bars and moved the 560 px Friday estimate to 6.12 km;
 *   · `|g − b| < 40` instead keeps out the Elevation chart's green, whose anti-aliased edges
 *     ~(159, 232, 140) otherwise pass and get picked as a bar band.
 */
export function isTealAt(image: RgbImage, x: number, y: number): boolean {
  const i = (y * image.width + x) * 3
  const r = image.data[i]!
  const g = image.data[i + 1]!
  const b = image.data[i + 2]!
  return g > 130 && b > 130 && g - r > 50 && Math.abs(g - b) < 40
}

/**
 * The heart-rate chart's red marks (and the "Average: …BPM" text above them). Measured at both
 * sizes: at 560 px JPEG the marks thin out, and the empty slots are interpolated.
 */
export function isRedAt(image: RgbImage, x: number, y: number): boolean {
  const i = (y * image.width + x) * 3
  const r = image.data[i]!
  const g = image.data[i + 1]!
  const b = image.data[i + 2]!
  return r > 170 && g < 110 && b < 90
}

/** True when `image` is a non-empty, internally consistent RGB buffer. */
export function isUsableImage(image: RgbImage): boolean {
  return (
    Number.isInteger(image.width) &&
    Number.isInteger(image.height) &&
    image.width > 0 &&
    image.height > 0 &&
    image.data.length === image.width * image.height * 3
  )
}
```
**Impact:** none (new file).

### Step 5: The locators
**File:** `lib/extract/chart/locate.ts:1` (new)
**Change:** The analysis's locator requirements, with every threshold a fraction of the width.
The pace chart is the first top-to-bottom band of "bar rows" (≥ 45 thin teal runs, spanning
≥ 80 % of the width). To count, the band must also:
- be ≤ 15 % of the width tall, which rejects the route map;
- have a clean gap (4 % of the width) under its baseline, with no bar rows resuming. This rejects
  the Cadence chart, which is cut by the screen edge or the home indicator;
- have a bar in ≥ 81 of its 90 slots, which also rejects the Cadence chart and stray teal.

The "Average: …/KM" text cannot form a bar row (≤ 28 runs, narrow). Column heights are walked up
from the baseline, tolerating one missing row (JPEG). The HR chart is the first cluster of red
rows above the pace chart, with a missing-row tolerance of 1.25 % of the width. Measured: internal
gaps ≤ 4 rows at 560 px, and the gap up to the red "Average" text is 10 rows at 560 px. The
cluster must span ≥ 70 % of the width, and the text spans ~30 %.

Measured geometry: at 739 px the pace chart has baseline 1411, top 1324, x 34–705, and the HR
marks run from row 1101 to 1187. At 560 px the pace chart has baseline 1068, top 1003, x 26–534,
and the HR marks run from row 834/835 to 899.
**Code:**
```ts
import { isRedAt, isTealAt, isUsableImage, type RgbImage } from './pixels'

/**
 * Find the Pace bar chart and the Heart Rate chart on a Workout Details screenshot by what they
 * look like, never by fixed rows. Pure.
 *
 * ── WHAT ELSE IS TEAL OR RED ON THAT SCREEN ─────────────────────────────────────────────────
 *   · the route map's line (teal): wide and very tall (~380 px at 739 px);
 *   · "Average: 7'39"/KM" (teal) and "Average: 169BPM" (red): narrow, a handful of runs per row;
 *   · the Cadence chart (teal), BELOW the pace chart: the same bar shape, cut by the bottom edge
 *     of the screen or by the home indicator (2026-11-20-details.png).
 * The pace chart is the first band, top to bottom, of rows holding many thin teal runs across
 * most of the width, short, with a clean gap under its baseline and a bar in nearly every one of
 * its 90 slots. The HR chart is the first cluster of red rows above it that spans most of the
 * width.
 *
 * Every threshold is a fraction of the image width, so the 739 px original and the 560 px JPEG
 * the browser actually uploads pass the same code.
 */

/** Where the pace chart is, and how tall each pixel column's bar is. */
export interface PaceChartBand {
  /** The lowest row of the bars (they all stand on it). */
  baseline: number
  /** The highest row any bar reaches. */
  top: number
  /** First column holding a bar. */
  x0: number
  /** One past the last column holding a bar. */
  x1: number
  /** Bar height, in px, of every image column (0 where no bar stands). Length = image width. */
  columnHeights: number[]
}

/** The rows the heart-rate marks occupy. The printed HR range maps onto [bottom, top]. */
export interface HrChartBand {
  /** Highest red row — the printed maximum HR. */
  top: number
  /** Lowest red row — the printed minimum HR. */
  bottom: number
}

/** Apple draws a workout as this many equal time slots. */
export const SLOT_COUNT = 90
/** Bars must stand in at least this many of the 90 slots. */
const MIN_BAR_SLOTS = 81
/** Bar rows need at least this many thin runs (the chart has 90 bars). */
const MIN_BAR_RUNS = 45
/** A bar band spans at least this fraction of the width (measured: 0.91). */
const MIN_SPAN_FRACTION = 0.8
/** A bar band is at most this fraction of the width tall (measured: 0.12). */
const MAX_BAND_HEIGHT_FRACTION = 0.15
/** A "thin" run is at most this fraction of the width wide (bars are 2-4 px at 739). */
const THIN_RUN_FRACTION = 0.015
/**
 * Below the real baseline there is a clean gap ("0:00:00" is grey) of at least this fraction of
 * the width. The Cadence chart, cut by the screen edge or by the home indicator, has none.
 */
const CLEAN_GAP_FRACTION = 0.04
/** Rows right under the baseline that JPEG may smear teal into (measured: 1 at 560 px). */
const BASELINE_SMEAR_ROWS = 2
/** A row under the baseline with this many thin runs means bars continue — not a baseline. */
const MAX_RUNS_IN_GAP = 15
/** Rows of red allowed to be missing inside the HR marks (measured ≤ 4 at 560 px). */
const HR_GAP_FRACTION = 0.0125
/** The HR marks span at least this fraction of the width (the red "Average" text spans 0.3). */
const MIN_HR_SPAN_FRACTION = 0.7
/** How far above the pace chart the HR chart may sit (measured: 0.19 of the width). */
const HR_SEARCH_FRACTION = 0.45

interface RowStats {
  thinRuns: number
  minX: number
  maxX: number
}

function tealRowStats(image: RgbImage, y: number, thinMax: number): RowStats {
  let thinRuns = 0
  let minX = Number.POSITIVE_INFINITY
  let maxX = -1
  let start = -1
  for (let x = 0; x <= image.width; x++) {
    const on = x < image.width && isTealAt(image, x, y)
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      if (x - start <= thinMax) {
        thinRuns++
        if (start < minX) minX = start
        maxX = x - 1
      }
      start = -1
    }
  }
  return { thinRuns, minX, maxX }
}

/**
 * Height of the teal bar standing on `baseline` in column `x`: walk up, tolerating one missing
 * row at a time (JPEG blurs the baseline and nicks thin bars), stopping at `maxHeight`. The
 * "Average" text sits ≥ 10 rows above the tallest bar, so the walk never reaches it.
 */
function barHeightAt(image: RgbImage, x: number, baseline: number, maxHeight: number): number {
  let top = -1
  let misses = 0
  const limit = Math.max(0, baseline - maxHeight + 1)
  for (let y = baseline; y >= limit; y--) {
    if (isTealAt(image, x, y)) {
      top = y
      misses = 0
    } else {
      misses++
      if (misses > 1) break
    }
  }
  return top < 0 ? 0 : baseline - top + 1
}

/** Column range [start, end) of slot `i` of `slots` equal slots across [x0, x1). Never empty. */
export function slotColumns(x0: number, x1: number, i: number, slots: number): [number, number] {
  const start = Math.floor(x0 + ((x1 - x0) * i) / slots)
  const end = Math.max(Math.floor(x0 + ((x1 - x0) * (i + 1)) / slots), start + 1)
  return [start, end]
}

/** The pace chart, or null when no band on the image has its shape. */
export function locatePaceChart(image: RgbImage): PaceChartBand | null {
  if (!isUsableImage(image)) return null
  const width = image.width
  const thinMax = Math.max(3, Math.round(THIN_RUN_FRACTION * width))
  const minSpan = MIN_SPAN_FRACTION * width
  const maxBandHeight = Math.round(MAX_BAND_HEIGHT_FRACTION * width)
  const gapRows = Math.round(CLEAN_GAP_FRACTION * width)

  const thinRuns: number[] = []
  const isBarRow: boolean[] = []
  for (let y = 0; y < image.height; y++) {
    const s = tealRowStats(image, y, thinMax)
    thinRuns.push(s.thinRuns)
    isBarRow.push(s.thinRuns >= MIN_BAR_RUNS && s.maxX - s.minX + 1 >= minSpan)
  }

  let y = 0
  while (y < image.height) {
    if (!isBarRow[y]) {
      y++
      continue
    }
    const first = y
    let last = y
    // One missing row inside a band is JPEG noise, not the end of the band.
    while (last + 1 < image.height && (isBarRow[last + 1] || isBarRow[last + 2])) {
      last += isBarRow[last + 1] ? 1 : 2
    }
    y = last + 1

    if (last - first + 1 > maxBandHeight) continue // the route map, or anything else tall
    // No room for the clean gap = cut by the screen edge (the Cadence chart, 2026-11-20).
    if (last + gapRows >= image.height) continue
    let barsContinue = false
    for (let g = last + 1 + BASELINE_SMEAR_ROWS; g <= last + gapRows; g++) {
      if (thinRuns[g]! >= MAX_RUNS_IN_GAP) barsContinue = true
    }
    if (barsContinue) continue // cut by the home indicator, bars resume below it

    const baseline = last
    const columnHeights: number[] = []
    let x0 = -1
    let x1 = -1
    let tallest = 0
    for (let x = 0; x < width; x++) {
      const h = barHeightAt(image, x, baseline, maxBandHeight)
      columnHeights.push(h)
      if (h > 0) {
        if (x0 < 0) x0 = x
        x1 = x + 1
        if (h > tallest) tallest = h
      }
    }
    if (x0 < 0 || x1 - x0 < minSpan) continue
    let filledSlots = 0
    for (let i = 0; i < SLOT_COUNT; i++) {
      const [start, end] = slotColumns(x0, x1, i, SLOT_COUNT)
      if (columnHeights.slice(start, end).some((h) => h > 0)) filledSlots++
    }
    if (filledSlots < MIN_BAR_SLOTS) continue
    return { baseline, top: baseline - tallest + 1, x0, x1, columnHeights }
  }
  return null
}

/**
 * The HR chart: the first cluster of red rows above the pace chart (top row `paceTop`) that
 * spans most of the width. null when there is none.
 */
export function locateHrChart(image: RgbImage, paceTop: number): HrChartBand | null {
  if (!isUsableImage(image)) return null
  const width = image.width
  const gapTolerance = Math.max(2, Math.round(HR_GAP_FRACTION * width))
  const searchFloor = Math.max(0, paceTop - Math.round(HR_SEARCH_FRACTION * width))

  let bottom = -1
  let top = -1
  let minX = Number.POSITIVE_INFINITY
  let maxX = -1
  let gap = 0
  for (let y = paceTop - 1; y >= searchFloor; y--) {
    let rowMin = -1
    let rowMax = -1
    for (let x = 0; x < width; x++) {
      if (isRedAt(image, x, y)) {
        if (rowMin < 0) rowMin = x
        rowMax = x
      }
    }
    if (rowMin < 0) {
      if (bottom >= 0) {
        gap++
        if (gap > gapTolerance) break
      }
      continue
    }
    if (bottom < 0) bottom = y
    top = y
    gap = 0
    if (rowMin < minX) minX = rowMin
    if (rowMax > maxX) maxX = rowMax
  }
  if (bottom < 0 || bottom - top < 2) return null
  if (maxX - minX + 1 < MIN_HR_SPAN_FRACTION * width) return null
  return { top, bottom }
}
```
**Impact:** none (new file).

### Step 6: Slot measurement
**File:** `lib/extract/chart/measure.ts:1` (new)
**Change:** 90 equal slots across the pace chart's x-extent. Pace: the tallest column in each
slot. HR: the midpoint of the slot's red pixels, mapped linearly from [bottom, top] onto
[hrMin, hrMax]. Gaps are linearly interpolated, and the ends take the nearest value.
**Code:**
```ts
import { SLOT_COUNT, slotColumns, type HrChartBand, type PaceChartBand } from './locate'
import { isRedAt, type RgbImage } from './pixels'

/**
 * Turn located chart bands into per-slot numbers. Pure.
 *
 * Apple draws the whole workout as 90 equal time slots across the chart's x-extent. The bars are
 * 2-4 px wide at a ~7.45 px pitch (739 px image), so the slot grid is computed from the extent,
 * never from detected bar edges — JPEG splits and merges bars, the grid does not move.
 */

/** The tallest bar in each slot, in px. Length {@link SLOT_COUNT}. */
export function measurePaceSlots(band: PaceChartBand): number[] {
  const heights: number[] = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    const [start, end] = slotColumns(band.x0, band.x1, i, SLOT_COUNT)
    let tallest = 0
    for (let x = start; x < end; x++) {
      const h = band.columnHeights[x] ?? 0
      if (h > tallest) tallest = h
    }
    heights.push(tallest)
  }
  return heights
}

/**
 * Heart rate per slot: the midpoint of the slot's red marks, mapped linearly from
 * [hr.bottom, hr.top] onto [hrMin, hrMax]. The HR chart shares the pace chart's time axis, so the
 * slot grid is the pace chart's. Slots with no mark are filled by linear interpolation between
 * their nearest marked neighbours (the nearest one at either end). null when no slot has a mark.
 */
export function measureHrSlots(
  image: RgbImage,
  pace: PaceChartBand,
  hr: HrChartBand,
  hrMin: number,
  hrMax: number,
): number[] | null {
  const span = hr.bottom - hr.top
  if (span <= 0) return null
  const raw: Array<number | null> = []
  for (let i = 0; i < SLOT_COUNT; i++) {
    const [start, end] = slotColumns(pace.x0, pace.x1, i, SLOT_COUNT)
    let minY = -1
    let maxY = -1
    for (let x = start; x < end; x++) {
      for (let y = hr.top; y <= hr.bottom; y++) {
        if (isRedAt(image, x, y)) {
          if (minY < 0 || y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (minY < 0) {
      raw.push(null)
      continue
    }
    const mid = (minY + maxY) / 2
    raw.push(hrMin + ((hr.bottom - mid) / span) * (hrMax - hrMin))
  }
  return fillGaps(raw)
}

/** Linear interpolation over nulls; ends take the nearest value. null when every entry is null. */
function fillGaps(values: ReadonlyArray<number | null>): number[] | null {
  const known: number[] = []
  values.forEach((v, i) => {
    if (v !== null) known.push(i)
  })
  if (known.length === 0) return null
  return values.map((v, i) => {
    if (v !== null) return v
    const after = known.find((k) => k > i)
    const before = known.findLast((k) => k < i)
    if (before === undefined) return values[after!]!
    if (after === undefined) return values[before]!
    const a = values[before]!
    const b = values[after]!
    return a + ((b - a) * (i - before)) / (after - before)
  })
}
```
**Impact:** none (new file).

### Step 7: The pure estimator and the contract types
**File:** `lib/extract/chart/estimate.ts:1` (new)
**Change:** This step ports `prototype_pace.py`'s `est(…, 'fast-speed')` (height linear in speed,
tall = fast), with these differences:
- The prototype's fixed rows are replaced by the locators.
- Split boundaries are rounded once and differenced, so the rows sum to `round(durationSec)`
  whenever a partial row is emitted. When the remainder is folded away (≤ 0.05 km) they fall
  short of it by that remainder's time, at most ~25 s at the slowest printed pace; phase 3 skips
  CHK-1 for estimated splits, so neither case draws a review advisory.
- The partial row gets `km = n+1` and `paceSecPerKm = round(time / remainderKm)`, the same shape
  Apple's own partial row has in `research/fixtures/golden-response.json`. It is emitted only when
  the 2-decimal remainder is > 0.05 km, the test CHK-4 (`lib/review/checks.ts`
  `partialConsistency`, `PARTIAL_MIN_KM`) applies, so an estimate never draws CHK-4's advisory.
- A split's HR is the time-weighted mean of the slots it covers.
- `knownDistanceKm` scales the speeds.
- The whole body sits in `try/catch → null`, so the contract's "never throws" holds even against
  a bug.

Input validation happens once, at the public entry (`inputsUsable`). A non-finite or non-positive
`knownDistanceKm` is ignored, so the estimate still runs on the chart. An unusable HR range only
removes HR. The `@public` JSDoc tags follow the repo convention for exports nobody imports yet
(see Principles applied).
**Code:**
```ts
import { SLOT_COUNT, locateHrChart, locatePaceChart } from './locate'
import { measureHrSlots, measurePaceSlots } from './measure'
import type { RgbImage } from './pixels'

/**
 * **The Workout Details chart estimator** — distance and per-kilometre splits from the pixels of
 * Apple Fitness's Pace and Heart Rate charts, for a run whose watch produced no split table.
 *
 * PURE: no `sharp`, no `server-only`, no I/O, no model. "The LLM never computes" (CLAUDE.md):
 * the vision model only transcribes the printed duration, pace range and HR range; every number
 * below is arithmetic on those and on bar heights. `./decode.ts` turns bytes into an
 * {@link RgbImage}; the extraction job calls this (WORKOUT_DETAILS_ESTIMATE_PLAN phase 3).
 *
 * ── THE METHOD (calibrated on the 2026-11-20 run, truth 6.04 km) ────────────────────────────
 *   1. The pace chart is 90 equal time slots; a slot's value is its tallest teal bar.
 *   2. The shortest bar is the slowest printed pace, the tallest the fastest, and height is
 *      linear in SPEED (1/pace): 6.07 km at 739 px, 6.08 km at 560 px JPEG q80. Linear in pace
 *      gave 5.99 km and worse splits.
 *   3. Distance = Σ speed × slot duration. Each whole-km boundary is interpolated inside the slot
 *      whose cumulative distance crosses it; a remainder > 0.05 km is the final partial row (the
 *      review screen's CHK-4 rule), a smaller one is folded away.
 *   4. HR per slot = midpoint of its red marks mapped onto the printed HR range; empty slots are
 *      interpolated; a split's HR is the time-weighted mean of the slots it covers.
 *   5. A transcribed distance, when there is one, wins: speeds are scaled so they total it.
 *
 * Every failure is `null`, never a throw, so the caller can always finish the extraction without
 * an estimate (R2.4).
 */

/** @public A decoded RGB image — consumed by `lib/llm/runExtractionJob.ts` (phase 3). */
export type { RgbImage }

/** @public What the details screen printed — built by the extraction job (phase 3). */
export interface ChartEstimateInput {
  /** Printed workout duration. */
  durationSec: number
  /** Printed pace range, left value (e.g. 9'12" -> 552). */
  paceSlowestSecPerKm: number
  /** Printed pace range, right value (e.g. 6'47" -> 407). */
  paceFastestSecPerKm: number
  /** Printed HR range, low. */
  hrMinBpm: number | null
  /** Printed HR range, high. */
  hrMaxBpm: number | null
  /** A transcribed distance; when set, speeds are scaled to total exactly this. */
  knownDistanceKm: number | null
}

/** @public One estimated split row — the shape of `ExtractedSplit` (lib/schema/extractedSession.ts). */
export interface EstimatedSplit {
  km: number
  timeSec: number
  paceSecPerKm: number
  hrBpm: number | null
  cadenceSpm: null
  partial: boolean
}

/** @public The estimate — consumed by `lib/llm/runExtractionJob.ts` (phase 3). */
export interface ChartEstimate {
  /** 2 decimals; equals knownDistanceKm when that was given. */
  distanceKm: number
  /** false when knownDistanceKm was given. */
  distanceWasEstimated: boolean
  /**
   * Full km rows, then one partial row when the 2-decimal remainder is > 0.05 km. A smaller
   * remainder is folded away: no row, and its seconds join no full row.
   */
  splits: EstimatedSplit[]
  /** 90. */
  slotCount: number
}

/**
 * The smallest remainder that earns its own partial row, tested exactly as CHK-4 does
 * (`lib/review/checks.ts` `partialConsistency`: `round2(remainder) > PARTIAL_MIN_KM`, strict), so
 * an estimate never draws the review screen's "marked partial, but … no part-kilometre" advisory.
 */
const MIN_PARTIAL_KM = 0.05

/** null = the pace chart could not be located / measured, or the inputs are unusable. Never throws. */
export function estimateFromCharts(
  image: RgbImage,
  input: ChartEstimateInput,
): ChartEstimate | null {
  try {
    if (!inputsUsable(input)) return null
    const pace = locatePaceChart(image)
    if (pace === null) return null
    const heights = measurePaceSlots(pace)

    let hrSlots: number[] | null = null
    const { hrMinBpm: hrMin, hrMaxBpm: hrMax } = input
    const hrUsable =
      hrMin !== null && hrMax !== null && Number.isFinite(hrMin) && Number.isFinite(hrMax)
    if (hrUsable && hrMin > 0 && hrMax > hrMin) {
      const hr = locateHrChart(image, pace.top)
      if (hr !== null) hrSlots = measureHrSlots(image, pace, hr, hrMin, hrMax)
    }
    return estimateFromHeights(heights, hrSlots, input)
  } catch {
    return null
  }
}

/** The boundary check: the printed values the estimate is scaled by must make sense. */
function inputsUsable(input: ChartEstimateInput): boolean {
  const { durationSec, paceSlowestSecPerKm: slow, paceFastestSecPerKm: fast } = input
  return (
    Number.isFinite(durationSec) &&
    durationSec > 0 &&
    Number.isFinite(slow) &&
    Number.isFinite(fast) &&
    fast > 0 &&
    slow > fast
  )
}

/** The arithmetic, on the 90 measured slot heights (and HR per slot, when the HR chart read). */
function estimateFromHeights(
  heights: readonly number[],
  hrSlots: readonly number[] | null,
  input: ChartEstimateInput,
): ChartEstimate | null {
  const lo = Math.min(...heights)
  const hi = Math.max(...heights)
  if (!(hi > lo)) return null // a flat chart has no scale

  const T = input.durationSec
  const dt = T / SLOT_COUNT
  const slowSpeed = 1 / input.paceSlowestSecPerKm // km per second
  const fastSpeed = 1 / input.paceFastestSecPerKm
  let speeds = heights.map((h) => slowSpeed + (fastSpeed - slowSpeed) * ((h - lo) / (hi - lo)))
  let total = speeds.reduce((sum, v) => sum + v * dt, 0)

  const known = input.knownDistanceKm
  const useKnown = known !== null && Number.isFinite(known) && known > 0
  if (useKnown) {
    const scale = known / total
    speeds = speeds.map((v) => v * scale)
    total = known
  }
  if (!Number.isFinite(total) || total <= 0) return null

  // Whole-km crossing times, interpolated inside the slot that crosses each boundary.
  const crossings: number[] = []
  let cum = 0
  speeds.forEach((v, i) => {
    const d = v * dt
    while (cum + d >= crossings.length + 1 - 1e-9 && crossings.length + 1 <= total + 1e-9) {
      crossings.push(i * dt + (crossings.length + 1 - cum) / v)
    }
    cum += d
  })

  const hrBetween = (from: number, to: number): number | null => {
    if (hrSlots === null || !(to > from)) return null
    let weighted = 0
    hrSlots.forEach((bpm, i) => {
      const overlap = Math.min(to, (i + 1) * dt) - Math.max(from, i * dt)
      if (overlap > 0) weighted += bpm * overlap
    })
    return Math.round(weighted / (to - from))
  }

  // Boundaries are rounded once and differenced, so the rows sum to the rounded duration.
  const splits: EstimatedSplit[] = []
  let previousBoundary = 0
  let previousExact = 0
  crossings.forEach((t, index) => {
    const boundary = Math.round(t)
    const timeSec = boundary - previousBoundary
    if (timeSec > 0) {
      splits.push({
        km: index + 1,
        timeSec,
        paceSecPerKm: timeSec,
        hrBpm: hrBetween(previousExact, t),
        cadenceSpm: null,
        partial: false,
      })
    }
    previousBoundary = boundary
    previousExact = t
  })

  const remainderKm = total - crossings.length
  const partialTime = Math.round(T) - previousBoundary
  // Folded away when it is CHK-4's "rounding", not a part-kilometre: no row, and its seconds are
  // NOT added to the last full row (that row's time must stay one kilometre's time).
  const remainderShownKm = Math.round(remainderKm * 100) / 100
  if (remainderShownKm > MIN_PARTIAL_KM && partialTime > 0) {
    splits.push({
      km: crossings.length + 1,
      timeSec: partialTime,
      paceSecPerKm: Math.round(partialTime / remainderKm),
      hrBpm: hrBetween(previousExact, T),
      cadenceSpm: null,
      partial: true,
    })
  }

  return {
    distanceKm: Math.round(total * 100) / 100,
    distanceWasEstimated: !useKnown,
    splits,
    slotCount: SLOT_COUNT,
  }
}
```
**Impact:** none (new file; nothing imports it until phase 3).

### Step 8: The decode shell
**File:** `lib/extract/chart/decode.ts:1` (new)
**Change:** `sharp` is already a dependency (0.35.3, in `serverExternalPackages`), and its shape
follows `lib/photos/deriveThumbnail.ts`. This file opens with `import 'server-only'`, which
vitest aliases to `tests/support/serverOnlyStub.ts`. No other file in the directory imports it
(invariant 7).
**Code:**
```ts
import 'server-only'

import sharp from 'sharp'

import type { RgbImage } from './pixels'

/**
 * **The one codec in `lib/extract/chart/`** — bytes of a stored screenshot (the browser's 560 px
 * JPEG, or a PNG) to the 8-bit RGB buffer `estimateFromCharts` reads.
 *
 * Server-only because `sharp` is a native module (`serverExternalPackages` in `next.config.ts`,
 * the same arrangement as `lib/photos/deriveThumbnail.ts`). Everything else in this directory is
 * pure and never imports this file, so the estimator stays testable and bundle-safe
 * (WORKOUT_DETAILS_ESTIMATE_PLAN invariant 7).
 *
 * Alpha is dropped and the colourspace forced to 8-bit sRGB, so a greyscale, palette, 16-bit or
 * RGBA input still comes back as exactly 3 bytes per pixel.
 *
 * THROWS on bytes `sharp` cannot decode. That is deliberate: this is the I/O edge, and the caller
 * (the extraction job) owns the degradation — it catches and finishes with no estimate (R2.4).
 */
export async function decodeToRgb(jpegOrPng: Buffer): Promise<RgbImage> {
  const { data, info } = await sharp(jpegOrPng)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 3 || data.length !== info.width * info.height * 3) {
    throw new Error(
      `decodeToRgb: expected 3-channel RGB, got ${info.channels} channels for ${info.width}x${info.height}`,
    )
  }
  return {
    width: info.width,
    height: info.height,
    data: new Uint8Array(data.buffer, data.byteOffset, data.length),
  }
}
```
**Impact:** none (new file).

### Step 9: Tests
**File:** `tests/extract.chartEstimate.test.ts:1` (new)
**Change:** The file sits beside the other `tests/extract.*.test.ts` files and reads the
fixtures with `readFileSync` relative to the repo root, as `tests/research/goldenFixture.test.ts`
does. Every case drives the public contract (`decodeToRgb` → `estimateFromCharts`) on committed
bytes. No internal function is mocked or asserted on. The locator cases observe their effect
through the estimate: map painted in, the estimate is unchanged; pace chart erased, the result is
`null`. The whole file runs in ~0.4 s, well under the 5 s default timeout.
**Code:**
```ts
import { readFileSync } from 'node:fs'

import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { decodeToRgb } from '@/lib/extract/chart/decode'
import {
  estimateFromCharts,
  type ChartEstimateInput,
  type RgbImage,
} from '@/lib/extract/chart/estimate'

/**
 * The Workout Details chart estimator against the two real runs it was calibrated on
 * (`research/fixtures/workout-details/README.md`). Every test goes through the public contract
 * phase 3 consumes — `decodeToRgb` then `estimateFromCharts` — on the committed bytes: the 739 px
 * originals and the 560 px JPEG q80 re-encodes the browser actually uploads.
 */

const DIR = 'research/fixtures/workout-details'

const FRIDAY: ChartEstimateInput = {
  durationSec: 2773, // 0:46:13
  paceSlowestSecPerKm: 497, // 8'17"
  paceFastestSecPerKm: 365, // 6'05"
  hrMinBpm: 101,
  hrMaxBpm: 186,
  knownDistanceKm: null,
}
/** The Splits screen of the same run (2026-11-20-splits.png): 6.04 km. */
const FRIDAY_TRUTH = {
  distanceKm: 6.04,
  splitSec: [446, 468, 458, 450, 463, 466], // 7:26 7:48 7:38 7:30 7:43 7:46
  splitHr: [148, 158, 167, 174, 181, 180],
}

const SUNDAY: ChartEstimateInput = {
  durationSec: 3046, // 0:50:46
  paceSlowestSecPerKm: 552, // 9'12"
  paceFastestSecPerKm: 407, // 6'47"
  hrMinBpm: 116,
  hrMaxBpm: 177,
  knownDistanceKm: null,
}

async function load(path: string): Promise<RgbImage> {
  return decodeToRgb(readFileSync(path))
}

/** A copy of `image` with the rectangle [x0, x1) × [y0, y1) painted one colour. */
function paint(
  image: RgbImage,
  rect: { x0: number; y0: number; x1: number; y1: number },
  rgb: [number, number, number],
): RgbImage {
  const data = new Uint8Array(image.data)
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      const i = (y * image.width + x) * 3
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
    }
  }
  return { width: image.width, height: image.height, data }
}

/** Rows and columns measured at 739 px, scaled to `image`'s width. */
function at(image: RgbImage, px739: number): number {
  return Math.round((px739 * image.width) / 739)
}

const TEAL: [number, number, number] = [72, 230, 228]
const BACKGROUND: [number, number, number] = [28, 28, 30]

let images: Record<string, RgbImage>

beforeAll(async () => {
  images = {
    fridayJpeg: await load(`${DIR}/shipped/2026-11-20-details.jpg`),
    fridayPng: await load(`${DIR}/2026-11-20-details.png`),
    sundayJpeg: await load(`${DIR}/shipped/2026-11-22-details.jpg`),
    sundayPng: await load(`${DIR}/2026-11-22-details.png`),
    summaryPng: await load(`${DIR}/2026-11-20-summary.png`),
    summaryJpeg: await load(`${DIR}/shipped/2026-11-22-summary.jpg`),
    splitsJpeg: await load(`${DIR}/shipped/2026-11-20-splits.jpg`),
    heartrateJpeg: await load(`${DIR}/shipped/2026-11-20-heartrate.jpg`),
  }
})

describe('R2.2 — the 2026-11-20 run against its own Splits screen', () => {
  for (const [label, key] of [
    ['560 px JPEG q80 (what the browser uploads)', 'fridayJpeg'],
    ['739 px original PNG', 'fridayPng'],
  ] as const) {
    it(`${label}: distance within 2 %, every full km within 15 s and 3 bpm`, () => {
      const estimate = estimateFromCharts(images[key]!, FRIDAY)
      expect(estimate).not.toBeNull()
      if (estimate === null) return

      expect(Math.abs(estimate.distanceKm - FRIDAY_TRUTH.distanceKm)).toBeLessThanOrEqual(
        0.02 * FRIDAY_TRUTH.distanceKm,
      )
      expect(estimate.distanceWasEstimated).toBe(true)
      expect(estimate.slotCount).toBe(90)

      const full = estimate.splits.filter((s) => !s.partial)
      expect(full.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
      full.forEach((split, i) => {
        expect(Math.abs(split.timeSec - FRIDAY_TRUTH.splitSec[i]!)).toBeLessThanOrEqual(15)
        expect(split.paceSecPerKm).toBe(split.timeSec)
        expect(split.hrBpm).not.toBeNull()
        expect(Math.abs(split.hrBpm! - FRIDAY_TRUTH.splitHr[i]!)).toBeLessThanOrEqual(3)
      })
    })
  }
})

describe('R2.1 — the shape of an estimate', () => {
  it('ends with one partial row, cadence is always null, and the rows sum to the duration', () => {
    const estimate = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const last = estimate.splits.at(-1)!
    expect(last.partial).toBe(true)
    expect(last.km).toBe(7)
    expect(estimate.splits.filter((s) => s.partial)).toHaveLength(1)
    expect(estimate.splits.every((s) => s.cadenceSpm === null)).toBe(true)
    expect(estimate.splits.every((s) => Number.isInteger(s.timeSec) && s.timeSec > 0)).toBe(true)
    expect(estimate.splits.reduce((sum, s) => sum + s.timeSec, 0)).toBe(FRIDAY.durationSec)
  })

  it('is deterministic: the same pixels and inputs give the same estimate', () => {
    expect(estimateFromCharts(images.fridayJpeg!, FRIDAY)).toEqual(
      estimateFromCharts(images.fridayJpeg!, FRIDAY),
    )
  })

  it('the 2026-11-22 run (no Splits screen) reads as ~6.1 km with six full splits', () => {
    for (const image of [images.sundayJpeg!, images.sundayPng!]) {
      const estimate = estimateFromCharts(image, SUNDAY)!
      expect(estimate.distanceKm).toBeGreaterThanOrEqual(5.9)
      expect(estimate.distanceKm).toBeLessThanOrEqual(6.3)
      expect(estimate.splits.filter((s) => !s.partial)).toHaveLength(6)
      for (const split of estimate.splits) {
        expect(split.hrBpm).toBeGreaterThanOrEqual(116)
        expect(split.hrBpm).toBeLessThanOrEqual(177)
      }
    }
  })

  it('a transcribed distance wins: speeds scale to it and distance is not estimated', () => {
    const estimate = estimateFromCharts(images.fridayJpeg!, { ...FRIDAY, knownDistanceKm: 6.04 })!
    expect(estimate.distanceKm).toBe(6.04)
    expect(estimate.distanceWasEstimated).toBe(false)
    // The 0.04 km remainder is below CHK-4's 0.05 km partial rule (lib/review/checks.ts), so it
    // is folded away: six full rows, no partial row, and no full row absorbs its seconds.
    expect(estimate.splits.map((s) => s.km)).toEqual([1, 2, 3, 4, 5, 6])
    expect(estimate.splits.some((s) => s.partial)).toBe(false)
    const sum = estimate.splits.reduce((total, s) => total + s.timeSec, 0)
    expect(sum).toBeLessThan(FRIDAY.durationSec)
    expect(FRIDAY.durationSec - sum).toBeLessThanOrEqual(Math.ceil(0.05 * FRIDAY.paceSlowestSecPerKm))
    estimate.splits.forEach((split, i) => {
      expect(Math.abs(split.timeSec - FRIDAY_TRUTH.splitSec[i]!)).toBeLessThanOrEqual(15)
    })
  })

  it('a remainder above 0.05 km keeps its partial row, priced on the real remainder', () => {
    // Unscaled Friday reads 6.08 km: remainder 0.08 km > 0.05.
    const estimate = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const last = estimate.splits.at(-1)!
    expect(last.partial).toBe(true)
    const remainderKm = Math.round((estimate.distanceKm - 6) * 100) / 100
    expect(remainderKm).toBeGreaterThan(0.05)
    expect(Math.abs(last.paceSecPerKm - Math.round(last.timeSec / remainderKm))).toBeLessThanOrEqual(15)
  })

  it('without a printed HR range the splits carry no HR, and the distance is unchanged', () => {
    const withHr = estimateFromCharts(images.fridayJpeg!, FRIDAY)!
    const withoutHr = estimateFromCharts(images.fridayJpeg!, {
      ...FRIDAY,
      hrMinBpm: null,
      hrMaxBpm: null,
    })!
    expect(withoutHr.splits.every((s) => s.hrBpm === null)).toBe(true)
    expect(withoutHr.distanceKm).toBe(withHr.distanceKm)
    expect(withoutHr.splits.map((s) => s.timeSec)).toEqual(withHr.splits.map((s) => s.timeSec))
  })
})

describe('R2.4 — the estimator returns null, never throws', () => {
  it('for screens that are not Workout Details', () => {
    for (const key of ['summaryPng', 'summaryJpeg', 'splitsJpeg', 'heartrateJpeg'] as const) {
      expect(estimateFromCharts(images[key]!, FRIDAY)).toBeNull()
    }
  })

  it('for an inverted or zero-width pace range, and for a non-positive duration', () => {
    const image = images.fridayJpeg!
    const bad: ChartEstimateInput[] = [
      { ...FRIDAY, paceSlowestSecPerKm: 365, paceFastestSecPerKm: 497 },
      { ...FRIDAY, paceSlowestSecPerKm: 420, paceFastestSecPerKm: 420 },
      { ...FRIDAY, paceFastestSecPerKm: 0 },
      { ...FRIDAY, durationSec: 0 },
      { ...FRIDAY, durationSec: -60 },
      { ...FRIDAY, durationSec: Number.NaN },
    ]
    for (const input of bad) expect(estimateFromCharts(image, input)).toBeNull()
  })

  it('for an empty, inconsistent or noise image', () => {
    const noise = new Uint8Array(400 * 800 * 3)
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919) % 256
    const cases: RgbImage[] = [
      { width: 0, height: 0, data: new Uint8Array(0) },
      { width: 10, height: 10, data: new Uint8Array(5) },
      { width: 400, height: 800, data: noise },
    ]
    for (const image of cases) {
      expect(() => estimateFromCharts(image, FRIDAY)).not.toThrow()
      expect(estimateFromCharts(image, FRIDAY)).toBeNull()
    }
  })
})

describe('the locator finds the pace chart by its shape, not by its rows', () => {
  for (const key of ['fridayJpeg', 'fridayPng'] as const) {
    it(`${key}: a wide, tall teal band where the route map was is ignored`, () => {
      const image = images[key]!
      const expected = estimateFromCharts(image, FRIDAY)
      // The committed fixtures have the map painted over (privacy). Paint the worst case back:
      // a solid teal block, then 70 thin teal stripes — many thin runs per row, like a bar chart,
      // but ~450 px tall at 739 px where the pace chart is under 100.
      const solid = paint(
        image,
        { x0: at(image, 30), y0: at(image, 210), x1: at(image, 710), y1: at(image, 660) },
        TEAL,
      )
      let striped = image
      for (let k = 0; k < 70; k++) {
        const x0 = at(image, 40 + k * 9)
        striped = paint(
          striped,
          { x0, y0: at(image, 210), x1: x0 + Math.max(2, at(image, 3)), y1: at(image, 660) },
          TEAL,
        )
      }
      expect(estimateFromCharts(solid, FRIDAY)).toEqual(expected)
      expect(estimateFromCharts(striped, FRIDAY)).toEqual(expected)
    })

    it(`${key}: with the pace chart erased, the Cadence chart below it is not taken instead`, () => {
      // 2026-11-20-details.png shows a Cadence chart under the pace chart, cut by the screen
      // edge and the home indicator. Erase the pace bars only; the Cadence bars stay.
      const image = images[key]!
      const erased = paint(
        image,
        { x0: 0, y0: at(image, 1318), x1: image.width, y1: at(image, 1416) },
        BACKGROUND,
      )
      expect(estimateFromCharts(erased, FRIDAY)).toBeNull()
    })
  }

  it('the teal "Average: …/KM" text alone is never read as the chart', () => {
    // 2026-11-22-details has no Cadence chart: with its bars erased, the only teal left is the
    // "Average: 0'00''/KM" line above them.
    const image = images.sundayJpeg!
    const erased = paint(
      image,
      { x0: 0, y0: at(image, 1318), x1: image.width, y1: at(image, 1416) },
      BACKGROUND,
    )
    expect(estimateFromCharts(erased, SUNDAY)).toBeNull()
  })
})

describe('decodeToRgb', () => {
  it('decodes the shipped JPEG and the original PNG to 3 bytes per pixel', () => {
    expect([images.fridayJpeg!.width, images.fridayJpeg!.height]).toEqual([560, 1212])
    expect([images.fridayPng!.width, images.fridayPng!.height]).toEqual([739, 1600])
    for (const image of [images.fridayJpeg!, images.fridayPng!]) {
      expect(image.data.length).toBe(image.width * image.height * 3)
    }
  })

  it('drops alpha and expands greyscale', async () => {
    const rgba = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 4,
        background: { r: 72, g: 230, b: 228, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()
    const grey = await sharp({
      create: { width: 3, height: 3, channels: 3, background: { r: 90, g: 90, b: 90 } },
    })
      .toColourspace('b-w')
      .png()
      .toBuffer()
    const a = await decodeToRgb(rgba)
    const g = await decodeToRgb(grey)
    expect(a.data.length).toBe(4 * 2 * 3)
    expect(g.data.length).toBe(3 * 3 * 3)
  })

  it('rejects bytes that are not an image', async () => {
    await expect(decodeToRgb(Buffer.from('not an image'))).rejects.toThrow()
  })
})
```
**Impact:** `npm test` gains 19 cases.

### Step 10: Gates
**File:** none (commands)
**Change:** Run the repo's gates over the new files. Run knip and add `@public` only if it flags
a contract symbol that Step 7 left untagged. Never add a knip ignore entry.
**Code:**
```sh
cd /home/miftah/.worktrees/run-insights/workout-details-estimate
npm run typecheck && npm run lint && npm run format:check
npx vitest run tests/extract.chartEstimate.test.ts
npm test
npm run ci:data-layer-guard && npm run ci:f08-guard && npm run ci:openrouter-guard \
  && npm run ci:client-secret-guard && npm run ci:llm-payload-guard && npm run ci:f11-guard \
  && npm run ci:schema-drift-guard
npx knip 2>&1 | grep -n 'lib/extract/chart' || echo 'knip: nothing in lib/extract/chart'
```
Checked while planning: the new files contain no `process.env`, no `NEXT_PUBLIC_`, no
`OPENROUTER`, no Recharts or `yAxisId`, no `db`/Drizzle import and no model call, so all seven
guards' patterns miss them. A fresh worktree needs `npm install` and `.env.local` first (the
repo's own note). A symlinked `node_modules` passes vitest but fails `next build`.
**Impact:** none.

## Principles applied

- Laziness protocol: one internal `estimateFromHeights` behind the single public entry point. No exported "maths-only" function, no configuration object, and no generic band-finder for charts the feature does not read. Only the pace and HR locators exist.
- Build the lever: the 560 px JPEGs come from the repo's existing recipe (`scripts/shipped-image-recipe.py`), extended with a named set rather than regenerated by hand or by a second script. A reviewer reruns one command, and the canonical set was checked byte-identical, so the existing fixtures cannot drift.
- Boundary discipline: inputs are validated once in `estimateFromCharts` (`inputsUsable`, HR range check). Locator, measurement and arithmetic trust the typed values they are handed. `decodeToRgb` is the I/O edge: it may throw, and the caller owns the degradation.
- Test behavior, not implementation: every test drives `decodeToRgb` → `estimateFromCharts` on the real committed bytes. The locator's rejection of the map, the Cadence chart and the "Average" text is observed through the estimate (unchanged when the map is painted in, `null` when the pace chart is erased), not by asserting band coordinates. Refactoring `locate.ts` cannot break a test that the behavior still satisfies.
- Prove it works: the analysis's teal predicate was re-measured rather than trusted, and it was wrong at 560 px (see Goal). The plan's code was run against the fixtures before being written down, so the numbers in Goal are measured, not expected.

## Verification

**Build:** `npm run typecheck && npm run build`
**Tests:** `npm test` (and `npx vitest run tests/extract.chartEstimate.test.ts` for this phase alone)
**Proof:** The real artefact is the estimator running on the committed screenshot bytes,
including the exact 560 px JPEG q80 encoding the browser uploads. Nothing in the app calls it
until phase 3, so no `verify.sh` drive can reach it in this phase. The journeys run it through
the repo's own test runner on real pixels, with no fake DB and no network.
- Harness: `.claude/skills/verify-run-insights` exists, but this phase adds no reachable surface (no route, no UI, no job change). `no harness` for phase 1: the journeys run vitest on the real fixture bytes instead.
- Feature-map entries: none. Nothing the user can do changes until phase 3 wires the `details` kind.
- Journeys:
  - **J1** · traces R2.2 — `cd /home/miftah/.worktrees/run-insights/workout-details-estimate && npx vitest run tests/extract.chartEstimate.test.ts -t "560 px JPEG q80"` → passes when vitest reports `1 passed` for "R2.2 — the 2026-11-20 run against its own Splits screen > 560 px JPEG q80 (what the browser uploads): distance within 2 %, every full km within 15 s and 3 bpm". That case asserts |distance − 6.04| ≤ 0.1208 km, six full splits each within 15 s of 446/468/458/450/463/466 s, and each split HR within 3 bpm of 148/158/167/174/181/180, on `research/fixtures/workout-details/shipped/2026-11-20-details.jpg` (560 × 1212).
  - **J2** · traces R2.1 — `npx vitest run tests/extract.chartEstimate.test.ts -t "R2.1"` → passes when vitest reports `6 passed`. The cases prove that the unscaled Friday estimate ends in exactly one `partial: true` row with `km: 7`, every `cadenceSpm` is `null`, the rows sum to 2773 s, two runs give deep-equal output, the Sunday run gives 5.9–6.3 km with six full splits, `knownDistanceKm: 6.04` yields `distanceKm: 6.04` with `distanceWasEstimated: false` and six full rows with no partial row (the 0.04 km remainder is folded away under CHK-4's > 0.05 km rule), a remainder above 0.05 km keeps its partial row priced on that remainder, and a null HR range yields `hrBpm: null` on every row.
  - **J3** · traces R2.1 — `grep -nE "from '(sharp|server-only)'|import '(server-only)'|@/lib/llm|@/lib/db|fetch\(" lib/extract/chart/pixels.ts lib/extract/chart/locate.ts lib/extract/chart/measure.ts lib/extract/chart/estimate.ts; echo "exit=$?"` → passes when it prints nothing but `exit=1`, meaning the pure estimator imports no codec, no server-only module, no model client and no DB, and makes no network call ("no model call", invariant 7). Then `grep -c "import 'server-only'" lib/extract/chart/decode.ts` prints `1`.
  - **J4** · traces R2.4 — `npx vitest run tests/extract.chartEstimate.test.ts -t "R2.4"` → passes when vitest reports `3 passed`. The cases prove that `estimateFromCharts` returns `null` without throwing for the Summary (PNG and JPEG), Splits and Heart Rate screens, for an inverted pace range, a zero-width range, a zero fastest pace, durations 0 / −60 / NaN, an empty image, a buffer whose length disagrees with its dimensions, and a 400 × 800 noise image.
  - **J5** · traces R2.4, R2.2 — `npx vitest run tests/extract.chartEstimate.test.ts -t "the locator finds the pace chart"` → passes when vitest reports `5 passed`. With a solid teal block, or 70 thin teal stripes, painted where the route map is, the estimate deep-equals the unpainted one at 560 px and 739 px. With the pace bars erased from `2026-11-20-details` (Cadence chart still below, cut by the screen edge), the result is `null`. With them erased from `2026-11-22-details` (only the teal "Average" text left), the result is `null`.
  - **J6** · traces R2.2 — `python3 scripts/shipped-image-recipe.py workout-details && git status --porcelain research/fixtures/workout-details/shipped/ && npx vitest run tests/extract.chartEstimate.test.ts -t "R2.2"` → passes when the recipe prints seven `-> 560x1212  short 560` lines, `git status` prints nothing after the phase's commit (the committed JPEGs are exactly what the recipe makes), and vitest reports `2 passed`.
- Neighbor check: the canonical shipped fixtures and the golden regression gate, the existing feature most likely to break through the shared recipe script. Run `python3 scripts/shipped-image-recipe.py && git status --porcelain research/fixtures/screenshots/shipped/ && npx vitest run tests/research/goldenFixture.test.ts`. It passes when the script prints the three `1:`/`2:`/`3:` lines plus the 170 KB note, `git status` prints nothing (bytes unchanged), and vitest reports every case passed.
- Cost: none. No LLM calls, no network.
**Exit criteria:** `tests/extract.chartEstimate.test.ts` shows 19/19 green inside `npm test`;
`npm run typecheck`, `lint`, `format:check` and all seven CI guards pass; the Friday 560 px JPEG
estimate is 6.08 km with full-km splits within 9 s and HR within 1 bpm of the Splits screen;
`estimateFromCharts` returns `null` for the four non-details screens and every bad input listed
in J4.

## Handoffs

- **Phase 3, `decodeToRgb` throws.** The contract only promises "never throws" for `estimateFromCharts`. `decodeToRgb` rejects on bytes `sharp` cannot decode. `runExtractionJob` must call it inside the same try/catch that degrades to "no estimate" (R2.4, invariant 4). It must not let a rejection reach the job's terminal-row write as a failure.
- **Phase 3, R2.4's job half.** This phase proves the estimator side: `null` for unlocatable charts and unusable inputs, never a throw. "The extraction finishes with the other screens' fields intact and is not marked `failed`" is observable only in `runExtractionJob`. Phase 3 owns that journey.
- **Phase 3, R2.3.** Merging `ChartEstimate` into `parsedSession`: estimated splits fill an empty `splits`, and `distanceKm` is filled only when null. Passing `knownDistanceKm` when the details screen printed a distance is phase 3's work. The estimator already returns `distanceWasEstimated: false` and splits scaled to the given distance.
- **Phase 3 and the reconciler, the fixture path moved.** The seven PNGs now live in `research/fixtures/workout-details/`, and their 560 px JPEGs in `research/fixtures/workout-details/shipped/`. They are no longer in `.workflows/plan/workout-details-estimate/fixtures/`. Phase 3's exit-criteria uploads (the Sunday set summary + details + heartrate, the Friday set summary + details + heartrate) should name `research/fixtures/workout-details/shipped/2026-11-2{0,2}-{summary,details,heartrate}.jpg`. The plan index's "Why" paragraph and the analysis also name the old directory.
- **Reconciler, analysis correction.** The teal predicate in the analysis's "Measured facts" table is wrong at 560 px (see Goal). The shipped predicate is `g>130 && b>130 && g−r>50 && |g−b|<40`. Phase 3 needs nothing from this. It only matters if anyone re-derives from the analysis.
- **Settled by the reconciler: fixture paths.** The index, the analysis (dated note) and phase 3 now all name `research/fixtures/workout-details/` and its `shipped/*.jpg`; phase 3's tests and Proof read the committed shipped JPEGs directly instead of re-encoding the PNGs.
- **Settled by the reconciler: partial-row threshold.** Step 7's `MIN_PARTIAL_KM` is 0.05 with CHK-4's strict `>` on the 2-decimal remainder (was 0.01). The two Step 9 cases that pin it (the transcribed-6.04 case, now six rows with no partial, and the new "> 0.05 km keeps its partial row" case) were written by the reconciler from the measured numbers in Goal, not run while planning: run them first, and if either disagrees with the measured table, report it rather than loosen it.
- **Phase 3, the input mapping.** `paceSlowestSecPerKm` is the printed range's LEFT value and `paceFastestSecPerKm` the RIGHT value (Apple prints `8'17"–6'05"`). `estimateFromCharts` returns `null` when slowest ≤ fastest, so a swapped transcription degrades to "no estimate" rather than an inverted one.

## Rollback

Delete `lib/extract/chart/`, `tests/extract.chartEstimate.test.ts` and
`research/fixtures/workout-details/`, and `git checkout -- scripts/shipped-image-recipe.py`.
Nothing imports the directory until phase 3, so no other file changes. If the PNGs are still
wanted for planning, move them back to `.workflows/plan/workout-details-estimate/fixtures/`
before deleting the directory.
