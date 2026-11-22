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
