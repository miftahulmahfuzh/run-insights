# F05 — Review & correction

> **F04 and F05 are the project** (`IMPLEMENTATION_PLAN.md` §8, `ROADMAP_v0.1.0.md` §5). F04
> proves the model can read a screenshot; F05 proves the app never trusts it blindly. Everything
> after F05 — metrics, insights, records, badges, charts — is competent CRUD over a table F05 is
> the only feature ever allowed to write the first row of.

**Depends on:** F03 (schema, queries, ownership scoping), F04 (extraction, `extractions` rows,
`run_photos`).
**Depended on by:** F06 (metrics/records), F07 (insights), F09 (badges) — via the invalidation
contract in §7, not via shared code.
**Owns:** `/r/[id]/review`, the per-field correction UI, the consistency-check module, writing
`extractions.corrections`, and the one and only code path that sets `runs.reviewed_at`.

---

## 1. Why review is mandatory, not a nag

`IMPLEMENTATION_PLAN.md` §1.3 measured **108/108 fields correct, five consecutive runs**, on the
canonical fixture. That number is easy to over-trust. Two facts from the same document say why
it must not be:

1. **The parallel-call variant — same model, same fixture, one call per screenshot instead of
   one call for all three — scored 102/108 (94.4%).** Its worst miss was not a rounding slip: it
   read split 1's pace off the splits-table screenshot as `436` s when the screenshot plainly
   shows `6'36"` (396 s), while getting the other 101 fields right, including the other ten
   splits. A model can be **locally wrong and globally convincing** — nothing about the other 107
   correct fields signals that the 108th is broken.
2. **§1.5's control experiment on a *different* stage of the pipeline (letting the LLM compute
   metrics instead of transcribe them) got aerobic decoupling backwards** — `−14.1%` reported,
   `+12.3%` true — a sign-flip that would have told this runner their aerobic fitness *held up*
   on a run where it visibly collapsed. That failure mode (confident, structurally plausible,
   arithmetically wrong) is exactly why D2 bans the LLM from arithmetic anywhere in the app, and
   it is exactly the failure mode a reviewer must be positioned to catch here too.

The 1-in-108 case is not hypothetical; it is the *measured* rate on this exact model, on this
exact fixture, run five times. At 17 runs a month that is roughly one wrong field a month if
nothing catches it — and a wrong split or duration does not fail loudly. It sits in the `runs`
table, feeds `avg_pace_sec`, feeds every weekly and monthly aggregate, feeds every personal
record check (§4.5) and badge rule (§4.6) that touches that run, forever, silently, until someone
notices a chart that doesn't look right and has no way to know which of the last 40 runs is the
one at fault.

**D1 exists because of this:** extraction never auto-saves. F05 is the wall between "a model's
guess" and "a fact the rest of the app treats as ground truth." Every other feature in the
product is allowed to assume `runs` rows are correct. F05 is the only place that assumption is
earned.

---

## 2. The core UX problem: 108 fields, not 108 taps

The design brief calls review "the second-most-important screen in the app" and asks for a
**low-confidence treatment that draws the eye to exactly the fields worth checking.** The naive
version of this screen — 108 open text inputs — fails on both usability (nobody proofreads 108
numbers after a run) and honesty (a wall of undifferentiated inputs teaches the user to stop
looking, which is worse than not reviewing at all).

**The insight this plan is built on: self-reported model confidence does not exist here (`schema.mjs`'s `SHAPE` has no
confidence field, and F04 does not ask for one), so it cannot be the ranking signal. What *is*
free is arithmetic. Several extracted quantities are supposed to agree with each other by
construction — splits should sum to the duration, zone durations should sum to the duration,
distance and pace should imply the duration. When two numbers that should agree don't, that
disagreement points at one of them being wrong far more precisely than a model's self-rated
certainty ever would, because it is derived from the data itself, not from the same process that
produced the error.**

### 2.1 Default state: mostly closed, opened only where it's earned

| Section | Default | Opens automatically when |
|---|---|---|
| Screenshot strip | thumbnails only | tap → full-screen pinch-zoom viewer |
| Hero (distance, duration, pace, date/time, location) | **always open** | — (these are what any run is identified by; always worth one glance) |
| Consistency-check banner | **always open, at the top, only if non-empty** | any check in §3 fails |
| Splits table (11 rows) | **always open** | — (this is the core content of the run; collapsing it defeats the point of the app) |
| HR zone bar | **always open** | — (same reason) |
| "More details" (cadence, kcal, elevation, resting/max HR) | **collapsed** | a check flags a field inside it, or the user taps it |
| Raw extraction response | **collapsed** | never automatically — it's an escape hatch, not a signal |

The splits table and zone bar stay open by default even though they are *dense* — the design
brief is explicit that density is the point ("the interesting screens are the ones that make
[the density] legible"), and hiding them behind a disclosure would defeat the review's purpose:
these are exactly where the historically-observed error lives (§1, the `6'36"` → `436` miss).
"Collapsed by default" is reserved for fields with **no cross-check and low downstream leverage**
— a wrong `elevationGainM` doesn't corrupt a trend the way a wrong split does.

**The punchline this design is built to deliver:** on a clean extraction (all four checks in §3
pass, which is the expected case — the fixture passes all four), correcting the run costs **zero
taps**. The reviewer scans the hero, sees no banner, sees eleven split rows and five zone
segments that look plausible, and taps **Confirm & save** once. 108 fields were reviewable; zero
were flagged; one tap happened. The cost of review scales with how wrong the extraction is, not
with how many fields exist — which is the only way "review every field" and "don't make me do
108 things" can both be true.

### 2.2 How a flagged field is corrected — mirror, not reinvent

`expense-tracking`'s review flow already solved "tap a value, fix it, see it reflected
immediately" twice, at two different grains, and F05 reuses both patterns rather than inventing a
third:

- **Row-level, inline-adjacent editing** — `ReviewStage.tsx` + `ItemRow.tsx`: a list where each
  row is two lines, always visible, tappable pieces open lightweight adjacent controls (the
  category `Chip` opens a shared `CategoryPicker`), and everything above the fold is scannable at
  once. F05's **splits table** and **zone bar** follow this shape: each row/segment is a compact,
  always-visible summary; tapping it opens a correction surface for just that row.
- **Sheet-based grouped editing** — `ItemSheet.tsx`: a bottom sheet (`Sheet`) holds every field
  for one logical unit (name, amount, category) plus a destructive action in the footer, opened
  either to edit an existing row or to add one, with the same layout either way. F05's **per-split
  sheet** and **per-zone sheet** are this pattern directly: tap km 11 → a sheet opens with that
  row's fields (time, pace, HR, cadence, the `partial` toggle) and a `Save`/`Delete` footer.

**One deliberate deviation from a literal "side-by-side" reading of the design brief:** at 414px
there is no room to put a screenshot and an input field beside each other and have either be
legible — expense-tracking's own components never attempt a true horizontal side-by-side for this
reason. F05's sheet stacks the source screenshot **above** the fields it was read from (pinned,
pinch-zoomable, not scrolling with the sheet body), which is "the value next to the screenshot it
came from" in the only orientation a phone screen actually supports. Because F04's extraction has
no bounding boxes (`schema.mjs` returns flat values, not coordinates), the sheet cannot crop to
the exact pixel region — it shows the **whole source image for that field's group**, using
`run_photos.kind` to pick which of the 1–3 uploads is relevant:

| Field group | `run_photos.kind` shown in sheet |
|---|---|
| Hero fields (distance, duration, pace, date, kcal, elevation, cadence, avg/max/resting HR) | `summary` |
| Each split row | `splits` |
| Each HR zone row, post-workout HR | `heartrate` |

If the matching `kind` wasn't uploaded (a 1- or 2-screenshot run), the sheet falls back to
whichever photos exist, in `sort_order`, so the reviewer always has *something* to check against
rather than a blank panel.

> **This section is ratified by R-45, which was amended on 2026-08-21 to adopt it.** The ruling had
> specified section-based provenance but missed the 1-or-2-screenshot fallback and said nothing
> about orientation; both of this plan's answers were folded into it verbatim. Note also that
> `02 Components.dc.html` still says *"crop"* — that wording predates the ruling. **Build the
> whole-image sheet described above, not a crop.** Per-field bounding boxes are a post-v0.1.0
> change gated on measuring what the coordinates cost on the one call with no latency slack.

### 2.3 Provenance and low-confidence marks are visual, not just functional

Per the design brief's "honesty rule," every field on this screen (and later on `/r/[id]`, F08's
territory) carries one of four states, and F05 is where three of the four are assigned:

| State | When | Visual treatment |
|---|---|---|
| **Extracted, unflagged** | came from `extractions.raw_response`, no check implicates it | quiet provenance mark (small icon/underline) — "read from a screenshot" |
| **Extracted, flagged** | implicated by a failed check (§3) | the low-confidence treatment — a warm highlight (colour is never the only signal — see §3's field-path honesty note) plus a small flag glyph, per the design brief's "color must never be the only thing carrying meaning" |
| **Human-corrected** | value differs from the original extraction at commit time | the distinct "I fixed this by hand" mark, permanent from this point on, shown here and on the run detail page |
| **Manually entered** | `extractions.status = 'failed'`, no extraction baseline exists (§8) | same "human-corrected" mark, `from: null` |

---

## 3. Consistency checks — deriving confidence from arithmetic, not from the model

Four checks, each comparing two quantities that are supposed to agree by construction. All four
are pure functions over the draft, run before render and on every field change, in
`lib/review/checks.ts` (F05-owned; F06 later imports the same module for `lib/metrics` so the
"sum of splits" arithmetic is written exactly once).

**Design honesty constraint:** a check can only highlight the field(s) it can actually implicate.
`splitsSumVsDuration` and `zonesSumVsDuration` know that *something in the block* disagrees with
the duration, not *which row* — so they highlight the whole block and say so in the banner copy
("one of the 11 splits" / "one of the 5 zones"), never a specific row. Only
`partialConsistency` can name one exact field, because it is the one check that is
row-specific by construction. This distinction matters: overclaiming precision teaches the
reviewer to trust a flag that lied about how much it knew, which is the same sin as trusting the
model's absent confidence score.

Tolerances are **seeded, not tuned** — there is exactly one ground-truth fixture today. §5's
`corrections` analytics query is the intended mechanism for tightening or loosening them once a
month of real runs exists; a tolerance that never fires on real data and never gets revisited is
a check that only exists on paper.

```ts
// lib/review/checks.ts — pure, no I/O, unit-tested against research/schema.mjs's TRUTH.

export type CheckId =
  | 'splits_sum_vs_duration'
  | 'zones_sum_vs_duration'
  | 'distance_pace_vs_duration'
  | 'partial_consistency'

export interface CheckResult {
  id: CheckId
  ok: boolean
  message: string        // shown verbatim in the ConsistencyBanner
  fieldPaths: string[]   // dot-paths this check can honestly implicate (see honesty note above)
}

interface DraftSplit {
  km: number
  timeSec: number
  paceSecPerKm: number
  partial: boolean
}
interface DraftZone {
  zone: number
  durationSec: number
}

/** CHK-1 — splits should sum to roughly the whole run. Can localize to: nothing specific. */
export function splitsSumVsDuration(splits: DraftSplit[], durationSec: number): CheckResult {
  const sum = splits.reduce((total, s) => total + s.timeSec, 0)
  const diff = Math.abs(sum - durationSec)
  const tolerance = Math.max(10, durationSec * 0.005) // seeded: 0.5%, min 10s
  return {
    id: 'splits_sum_vs_duration',
    ok: diff <= tolerance,
    message: `Splits total ${fmtDuration(sum)}, run duration is ${fmtDuration(durationSec)} ` +
      `(${diff}s off) — one of the 11 splits below looks off.`,
    fieldPaths: ['splits'],
  }
}

/** CHK-2 — zone durations should sum to roughly the whole run. Zones carry more natural slack
 *  (pause/transition time isn't always zone-classified) so the tolerance is looser. */
export function zonesSumVsDuration(zones: DraftZone[], durationSec: number): CheckResult {
  const sum = zones.reduce((total, z) => total + z.durationSec, 0)
  const diff = Math.abs(sum - durationSec)
  const tolerance = Math.max(90, durationSec * 0.035) // seeded: 3.5%, min 90s
  return {
    id: 'zones_sum_vs_duration',
    ok: diff <= tolerance,
    message: `Zone durations total ${fmtDuration(sum)}, run duration is ` +
      `${fmtDuration(durationSec)} (${diff}s off) — one of the 5 zones below looks off.`,
    fieldPaths: ['hrZones'],
  }
}

/** CHK-3 — distance / avg pace should imply roughly the duration. Can localize to: any of the
 *  three inputs, never a single one — a misread pace and a misread distance look identical here. */
export function distancePaceVsDuration(
  distanceM: number, avgPaceSecPerKm: number, durationSec: number,
): CheckResult {
  const implied = (distanceM * avgPaceSecPerKm) / 1000
  const diff = Math.abs(implied - durationSec)
  const tolerance = Math.max(5, durationSec * 0.005) // seeded: 0.5%, min 5s — this identity is
                                                      // near-exact when all three are read right
  return {
    id: 'distance_pace_vs_duration',
    ok: diff <= tolerance,
    message: `Distance × pace implies ${fmtDuration(Math.round(implied))}, run duration is ` +
      `${fmtDuration(durationSec)} — check distance, pace and duration above.`,
    fieldPaths: ['distanceM', 'avgPaceSecPerKm', 'durationSec'],
  }
}

/** CHK-4 — the partial final kilometre (D14 / roadmap). The ONLY check that can name one exact
 *  field, because it is inherently about one specific row. */
export function partialConsistency(splits: DraftSplit[], distanceKm: number): CheckResult {
  const last = splits[splits.length - 1]
  const wholeKm = Math.floor(distanceKm)
  const remainderKm = round2(distanceKm - wholeKm)
  const impliesPartial = remainderKm > 0.05 && remainderKm < 0.95
  const idx = splits.length - 1

  if (impliesPartial && !last.partial) {
    return {
      id: 'partial_consistency', ok: false,
      message: `Distance ${distanceKm} km implies a partial final kilometre of ${remainderKm} ` +
        `km, but split ${last.km} isn't flagged partial. An unflagged partial km is averaged ` +
        `as if it were a full one, and quietly turns a fade into a "sprint" everywhere downstream.`,
      fieldPaths: [`splits.${idx}.partial`],
    }
  }
  if (last.partial) {
    const impliedPace = Math.round(last.timeSec / remainderKm)
    const delta = Math.abs(impliedPace - last.paceSecPerKm)
    if (delta > 15) {
      return {
        id: 'partial_consistency', ok: false,
        message: `Split ${last.km} is flagged partial (${remainderKm} km) with pace ` +
          `${fmtPace(last.paceSecPerKm)}, but its time implies ${fmtPace(impliedPace)} — check ` +
          `the time or the pace on this row.`,
        fieldPaths: [`splits.${idx}.paceSecPerKm`, `splits.${idx}.timeSec`],
      }
    }
  }
  return { id: 'partial_consistency', ok: true, message: '', fieldPaths: [] }
}

export function runAllChecks(draft: ReviewDraft): CheckResult[] {
  return [
    splitsSumVsDuration(draft.splits, draft.durationSec),
    zonesSumVsDuration(draft.hrZones, draft.durationSec),
    distancePaceVsDuration(draft.distanceM, draft.avgPaceSecPerKm, draft.durationSec),
    partialConsistency(draft.splits, draft.distanceM / 1000),
  ]
}
```

### 3.1 Test cases — the fixture, then the historically-observed bug

Every function above is unit-tested first against `research/schema.mjs`'s `TRUTH` (must pass all
four — it's the golden run), then against a deliberately corrupted copy that reproduces §1.3's
*actual observed* extraction error, plus one synthetic corruption per remaining check:

```ts
import { TRUTH } from '../../research/schema.mjs' // durationSec: 4716, distanceKm: 10.67, ...

describe('splitsSumVsDuration', () => {
  it('passes on the real fixture: sum 4710 vs duration 4716 (6s, natural slack)', () => {
    // 396+428+431+431+423+440+452+474+467+480+288 = 4710
    const r = splitsSumVsDuration(TRUTH.splits, TRUTH.durationSec)
    expect(r.ok).toBe(true)
  })

  it('fires on the §1.3-observed bug: split 1 misread 396s → 436s (the "6\'36\\"" miread)', () => {
    const corrupted = TRUTH.splits.map((s, i) => i === 0 ? { ...s, timeSec: 436 } : s)
    // sum becomes 4750; |4750 - 4716| = 34s > tolerance max(10, 4716*0.005)=23.58s
    const r = splitsSumVsDuration(corrupted, TRUTH.durationSec)
    expect(r.ok).toBe(false)
  })
})

describe('zonesSumVsDuration', () => {
  it('passes on the real fixture: sum 4595 vs duration 4716 (121s, natural slack)', () => {
    // 104+25+303+2165+1998 = 4595
    const r = zonesSumVsDuration(TRUTH.hrZones, TRUTH.durationSec)
    expect(r.ok).toBe(true) // 121 <= max(90, 4716*0.035)=165.06
  })

  it('fires on a dropped-digit zone 4 misread: 2165 → 2065', () => {
    const corrupted = TRUTH.hrZones.map((z) => z.zone === 4 ? { ...z, durationSec: 2065 } : z)
    // sum becomes 4495; |4495 - 4716| = 221s > 165.06
    const r = zonesSumVsDuration(corrupted, TRUTH.durationSec)
    expect(r.ok).toBe(false)
  })
})

describe('distancePaceVsDuration', () => {
  it('passes on the real fixture: 10670m * 442s/km / 1000 = 4716.14s vs 4716s', () => {
    const r = distancePaceVsDuration(10670, TRUTH.avgPaceSecPerKm, TRUTH.durationSec)
    expect(r.ok).toBe(true) // diff 0.14s
  })

  it('fires on a tens-digit pace misread: 442 → 402 ("7\'22\\"" misread as "6\'42\\"")', () => {
    // 10670 * 402 / 1000 = 4289.34; |4289.34 - 4716| = 426.66s
    const r = distancePaceVsDuration(10670, 402, TRUTH.durationSec)
    expect(r.ok).toBe(false)
  })
})

describe('partialConsistency', () => {
  it('passes on the real fixture: km 11 flagged partial, 288/0.67=429.85 ≈ stated 429', () => {
    const r = partialConsistency(TRUTH.splits, TRUTH.distanceKm)
    expect(r.ok).toBe(true) // delta ~1s
  })

  it('fires when the partial flag is missing (the D14 case)', () => {
    const corrupted = TRUTH.splits.map((s, i) =>
      i === TRUTH.splits.length - 1 ? { ...s, partial: false } : s)
    const r = partialConsistency(corrupted, TRUTH.distanceKm)
    expect(r.ok).toBe(false)
    expect(r.fieldPaths).toEqual(['splits.10.partial'])
  })

  it('fires when the partial pace is inconsistent with its time', () => {
    const corrupted = TRUTH.splits.map((s, i) =>
      i === TRUTH.splits.length - 1 ? { ...s, paceSecPerKm: 480 } : s)
    // implied = round(288 / 0.67) = 430; |480 - 430| = 50 > 15
    const r = partialConsistency(corrupted, TRUTH.distanceKm)
    expect(r.ok).toBe(false)
  })
})
```

These four tests-against-real-numbers are the F05 equivalent of `research/score.mjs` — they stay
green in CI the same way, and a fifth "all pass on TRUTH" integration test guards against a
tolerance edit accidentally making the golden fixture fail its own review.

---

## 4. ASCII wireframe

```
┌─────────────────────────────────────────┐
│ ←  Review run                    ⋯       │  header: back, overflow (retry extraction)
├───────────────────────────────────────────┤
│  [img: summary] [img: splits] [img: hr]  │  screenshot strip — tap = full pinch-zoom view
├───────────────────────────────────────────┤
│                                           │
│   10.67 km · 1:18:36 · 7'22"/km          │  HERO — always open, always tappable
│   Thu 20 Aug · 07:07–08:26 · Tangerang   │
│                                           │
├───────────────────────────────────────────┤
│ ⚠ 2 things worth checking                │  ConsistencyBanner — role=alert, only if non-empty
│                                           │
│  • Splits total 1:18:30, run is 1:18:36  │
│    (6s off) — one of the 11 splits       │
│    below looks off.            [Jump ↓]  │
│                                           │
│  • Zone durations total 1:16:35, run is  │
│    1:18:36 (2:01 off) — one of the 5     │
│    zones below looks off.      [Jump ↓]  │
│                                           │
├───────────────────────────────────────────┤
│ ▸ More details                           │  collapsed <details> — cadence, kcal, elevation,
│   (cadence · calories · elevation · HR)  │  resting/max HR. auto-opens if a check names one.
├───────────────────────────────────────────┤
│ Splits                              11   │  ALWAYS OPEN — this is the app's core content
│ ┌───────────────────────────────────┐   │
│ │ km  time    pace     hr   cad     │   │
│ │  1  6:36    6'36"   154  154      │   │
│ │  2  7:08    7'08"   171  148      │   │
│ │  3  7:11    7'11"   168  151      │   │
│ │  …  (rows 4–9 elided in this ASCII, all present on screen)
│ │ 10  8:00    8'00"   176  136      │   │
│ │▓11▸ 4:48    7'09"   183  145 PART │   │  ← distinct row: dashed left border + "PART" chip,
│ └───────────────────────────────────┘   │    per design brief "must never read as a sprint"
├───────────────────────────────────────────┤
│ Heart-rate zones                         │  ALWAYS OPEN
│ [Z1][Z2][Z3]▓▓▓▓▓▓Z4▓▓▓▓▓▓ ▓▓▓▓▓Z5▓▓▓▓▓  │  ZoneBar — tap a segment = per-zone sheet
│ 1:44 0:25 5:03    36:05        33:18     │
│  2%   1%   7%       47%          43%     │
├───────────────────────────────────────────┤
│ ▸ Raw extraction response                │  collapsed <details> — escape hatch only, never
│                                           │  auto-opened, no auto-inference from it
├─────────────────────────────────────────┤
│           [   Confirm & save   ]         │  sticky bar — NEVER disabled for validation;
└───────────────────────────────────────────┘  tap → inline errors if something's still missing
```

**Per-row correction sheet** (tapping split 11 — the `ItemSheet.tsx` pattern):

```
┌─────────────────────────────────────┐
│  Km 11                          ✕   │
├─────────────────────────────────────┤
│                                     │
│   [ splits-table screenshot,       │
│     pinned, pinch-zoomable ]       │
│                                     │
├─────────────────────────────────────┤
│  Time             [ 04:48       ]  │
│  Pace              [ 7'09"      ]  │
│  Heart rate        [ 183        ]  │
│  Cadence           [ 145        ]  │
│                                     │
│  ☑ Partial kilometre (0.67 km)     │
│    Excluded from every pace        │
│    average — see why ›             │
│                                     │
├─────────────────────────────────────┤
│  [ Delete row ]        [  Save  ]  │
└─────────────────────────────────────┘
```

---

## 5. The partial final kilometre (D14)

`schema.mjs`'s fixture, split 11: `timeSec: 288` (04:48), `paceSecPerKm: 429` (7'09"),
`partial: true`. The trap: **288 seconds is faster than every other split's time in this table
(396–480s)**, and if a downstream consumer treats it as a full kilometre — say, computing
"fastest km" or feeding it unweighted into a pace-consistency chart — a runner who was visibly
fading (splits climbing from 6'36" to 8'00") appears to close with a sprint. The pace field is
actually *consistent* (429 s/km against a true distance of 0.67 km, roughly matching the run's
overall fade), the danger is entirely in the **time field being misread as a full-km duration**
by anything that isn't told the row is partial.

F05's obligations, concretely:

1. **The `partial` boolean is a first-class, always-visible, always-editable control** — the
   checkbox in the sheet above, never buried in "more details." Roadmap D14 exists because a
   silent misclassification here corrupts every average that follows; the UI treats it with the
   same weight as the pace field itself.
2. **CHK-4 (`partialConsistency`, §3) is the review screen's most targeted check** — it is the
   only one of the four that can name a single field, and it fires in both directions: a distance
   that implies a partial km but no row flagged (the miss that matters most, because nothing else
   in the raw extraction would ever surface it), and a flagged row whose pace doesn't match its
   own time-over-distance arithmetic.
3. **The splits table row itself is visually distinct** (dashed border, a `PART` chip, per the
   wireframe) so a human scanning the table — not just the automated check — has a chance to
   catch it, matching the design brief's instruction to "design the partial final kilometre
   distinctly."
4. **F06 contract (downstream, not F05's code, but F05 hands off the correctness of the flag
   that makes this possible):** every pace-consistency, pace-trend and "fastest split" metric in
   `lib/metrics/*` filters `WHERE partial = false` before aggregating. F05's only obligation is
   that the flag reaching that filter is correct — which is precisely what CHK-4 exists to check.

---

## 6. `extractions.corrections` — shape, and why it's the most valuable column in the schema

`IMPLEMENTATION_PLAN.md` §3 calls `corrections` the most valuable column because *every human fix
is a labelled extraction failure* — accumulate a month of them and there is a real, evidence-based
error profile instead of vibes, ready to feed back into the extraction prompt.

The roadmap's schema comment (`corrections jsonb NULL -- {field: {from, to}}`) states the idea at
its simplest. F05 needs slightly more to do the job properly — a run can be corrected **twice**
(once at initial review, again later if a mistake is spotted after commit, §7) and losing the
first correction when the second overwrites it would throw away exactly the signal this column
exists to keep. See §9 for the resulting (small) schema clarification.

### 6.1 Shape

One key per corrected field path (Zod-style dot-paths, zero-indexed arrays, matching
`schema.mjs`'s field names), each holding an **array of edit events** — append-only, oldest first:

```json
{
  "avgPaceSecPerKm": [
    {
      "from": 442,
      "to": 448,
      "phase": "review",
      "checkId": null,
      "correctedAt": "2026-08-20T09:15:03Z"
    }
  ],
  "splits.0.timeSec": [
    {
      "from": 436,
      "to": 396,
      "phase": "review",
      "checkId": "splits_sum_vs_duration",
      "correctedAt": "2026-08-20T09:14:41Z"
    }
  ],
  "splits.10.partial": [
    {
      "from": false,
      "to": true,
      "phase": "post-review-edit",
      "checkId": "partial_consistency",
      "correctedAt": "2026-08-22T18:02:10Z"
    }
  ]
}
```

Field rules:

- `from` / `to` — the raw values, in the units the field is stored in (e.g. seconds, not
  formatted strings), so the analytics query in §6.2 can do arithmetic on the deltas directly.
- `phase` — `'review'` (initial, pre-`reviewed_at`) | `'post-review-edit'` (§7) |
  `'manual'` (§8, no extraction baseline — `from` is always `null`).
- `checkId` — the `CheckId` from §3 that flagged this field, or `null` if the human caught it by
  eye with no check firing. **`null` is itself signal**: a field with many `checkId: null`
  corrections and no failing check is a candidate for a *new* check.
- Only fields the human actually changed get a key. A field the reviewer looked at and left alone
  produces no entry — `corrections` measures edits, not attention.

### 6.2 The query that turns a month of corrections into an error profile

```sql
-- Which fields does the extractor actually get wrong, and how often does a consistency
-- check catch it vs. a human catching it unaided ("caught_by_eye")?
select
  field_path,
  count(*)                                              as correction_count,
  count(*) filter (where check_id is not null)          as caught_by_check,
  count(*) filter (where check_id is null)              as caught_by_eye,
  jsonb_agg(distinct check_id) filter (where check_id is not null) as checks_involved,
  avg(nullif(extract(epoch from corrected_at - e.created_at), 0)) as avg_seconds_to_fix
from extractions e
cross join lateral jsonb_each(e.corrections) as edits(field_path, events)
cross join lateral jsonb_to_recordset(events) as ev(
  "from" jsonb, "to" jsonb, phase text, check_id text, corrected_at timestamptz
)
where e.created_at >= date_trunc('month', now())
  and e.status in ('ok', 'repaired')     -- exclude 'manual' — nothing to compare against
  and phase = 'review'                   -- exclude post-review edits: those are runner error or
                                          -- late correction, not extraction error
group by field_path
order by correction_count desc;
```

Reading this monthly is the entire feedback loop `IMPLEMENTATION_PLAN.md` §3 promises: if
`splits.N.paceSecPerKm` shows up repeatedly with `caught_by_check = 0`, that's a prompt bug no
automated check currently catches — either tighten `splitsSumVsDuration`'s tolerance or add a
targeted check. If a field never appears, it's a candidate to *stop* rendering prominently,
freeing more visual weight for the fields that actually go wrong.

---

## 7. Editing a run after it's reviewed — the invalidation contract

A run does not stop being editable once `reviewed_at` is set — a reviewer can miss something and
notice it later on the run detail page. When that happens, correcting it must not leave stale
derived data behind: `insights` cached by `facts_hash`, `records` computed from `runs`, `badges`
evaluated against `runs`. F05 does not implement metrics, records or badges (F06/F07/F09 do,
later in the build order) — but it is the only place a post-commit correction can originate, so
**the contract those features must satisfy is specified here, now, while the write path is being
designed**, rather than reverse-engineered later.

### 7.1 What F05 guarantees

Every commit — initial review (§2) or a later edit — calls one function, inside the same
transaction as the `runs`/`run_splits`/`run_zones` write:

```ts
// lib/derived/invalidate.ts — the contract. F05 calls this; F06/F07/F09 implement its body
// incrementally as each feature lands (build order: F05 → F06 → F07 → F09). Until a given
// feature exists, its portion of the body is a documented no-op — never skipped, never inlined
// elsewhere, so no caller has to change when the real implementation arrives.

export interface RunChangeEvent {
  runId: string
  userId: string
  changedFieldPaths: string[]        // the keys that got a new corrections entry this commit
  occurredOn: string                 // current value, post-write
  previousOccurredOn: string | null  // set only if occurredOn itself changed
  phase: 'review' | 'post-review-edit' | 'manual'
}

export function onRunCommitted(event: RunChangeEvent): Promise<void>
```

### 7.2 What each downstream feature's implementation must do

| Feature | Responsibility inside `onRunCommitted` |
|---|---|
| **F06** (`lib/metrics`, `lib/records`) | Recompute every `lib/metrics/*` value for `runId` (cheap, pure functions, no I/O beyond the one run's rows). **Fully recompute `records` for `userId`** — never increment/patch (this matches the roadmap's own rule for `records`: "a correction in review can invalidate a record; the only safe implementation is a full recompute," and at 17 runs/month it's free). |
| **F07** (`insights`) | Delete `insights` rows for `(userId, 'session', runId)`, and for `(userId, 'week', isoWeek(occurredOn))` / `(userId, 'month', yyyyMm(occurredOn))` — plus the same two for `previousOccurredOn` if the date itself moved. Deletion is a hygiene step, not a correctness requirement: caching is keyed on `facts_hash` (§4.3), so a changed metric already produces a cache miss on next read. **Binding rule for F07/F08: an insight is fetched by the full tuple `(user_id, scope, scope_key, facts_hash)` — never by `(user_id, scope, scope_key)` ordered by recency.** The latter would render a stale narrative next to corrected numbers, silently. |
| **F09** (`badges`) | Delete session-scoped badge rows where `run_id = runId`, then re-run every session-scoped rule (§4.6) against the corrected run and re-insert whatever still fires. For week/month-scoped rules whose `scope_key` covers this run's (possibly former *and* new) week/month, **recompute that scope_key's rules fresh** — same "recompute, never increment" discipline as records, for the same reason: a correction can make a badge that fired stop firing (e.g. `self_reward`'s "4 runs this week" no longer holds if a correction moves `occurred_on` into a different week). |

### 7.3 What F05 itself does with the write, regardless of downstream state

- `runs.reviewed_at` is set **once**, on the first commit, and never changed again — it answers
  "has a human ever confirmed this run," not "is this run currently correct."
- A **new** column answers the second question — see §9's contract delta.
- `extractions.corrections` is updated with `phase: 'post-review-edit'` entries (§6), appended to
  the same field-path arrays as the original review, preserving full history.
- The commit is one DB transaction: `runs` + `run_splits` + `run_zones` + `extractions.corrections`
  all succeed or all roll back together, then `onRunCommitted` fires. If `onRunCommitted` throws
  (e.g. F06 not yet deployed and its stub isn't wired), the transaction has already committed —
  invalidation failure must never roll back a successful, human-confirmed correction. Log and
  surface a "recompute is behind" indicator rather than blocking the save.

---

## 8. Manual entry as the final fallback (`source = 'manual'`)

`ROADMAP_v0.1.0.md` §6 explicitly rules out "manual run entry as a primary flow" as a non-goal for
v0.1.0 — no dedicated `/new-manual` route, no separate form. That non-goal is about *not building
a second data-entry surface*. It does not — and cannot — cover the case this task asks for:
**extraction failed entirely** (`extractions.status = 'failed'` after the repair round-trip in
F04's pipeline still doesn't parse — e.g. a non-run screenshot, a corrupted upload, or three
images the model simply can't read). Without some path forward, the user's upload is a dead end:
photos in Blob, an `extractions` row marked `failed`, nothing else.

**Resolution: F05 doesn't build a second surface. The review screen already renders 100% editable
fields — manual entry is that same screen with an empty draft, not a new component.**

- When `extractions.status = 'failed'`, `/r/[id]/review` renders the identical layout with every
  field `null`/blank instead of pre-filled. The consistency checks in §3 simply don't fire on an
  all-null draft (no sums to compare) — the checks are a bonus on top of manual entry, not a
  requirement it needs to satisfy before it can run.
- The screenshot strip still shows the uploaded photos (they're still evidence of the run, even
  if the model couldn't parse them) — the sheets in §2.2 still pin them, so manual entry is
  "type what you see" rather than "type from memory."
- A quiet banner explains what happened ("We couldn't read these screenshots automatically —
  enter the numbers by hand"), styled like `ReviewStage.tsx`'s `parseFailure` banner
  (`role="alert"`, not a modal, not blocking).
- Validation is unchanged from §9's Zod schema (`distance_m > 0`, `duration_sec > 0`, etc.) and
  the Save button is, as always, never pre-emptively disabled — tap it, see what's still missing.
- On commit: `runs.source = 'manual'`. **`runs.extraction_id` stays pointed at the failed
  extraction row** rather than being nulled — the failure is still worth keeping in the audit
  trail (it's a genuine F04 failure case, valuable for the same reason `corrections` is: it's
  evidence of where the pipeline breaks). Every entered field is recorded in
  `extractions.corrections` with `phase: 'manual'` and `from: null` (§6.1) — symmetrical with the
  screenshot path, so the analytics query in §6.2 can be extended later to also answer "how often
  does extraction fail outright, and on what."
- No `partial`/consistency defaults are assumed; the reviewer sets the `partial` flag on any split
  they type in, same as always.

This satisfies the letter of the roadmap non-goal (zero new routes, zero new components, no
"manual entry" entry point anywhere in the nav) while giving a failed extraction somewhere to go
other than data loss.

---

## 9. Contract deltas

Two clarifications to `ROADMAP_v0.1.0.md` §4.3, discovered while designing F05's write path.
Neither changes a column's type or a route; both pin down lifecycle details the roadmap states
loosely enough that F05 and F06 could otherwise disagree about them.

1. **`runs` row lifecycle, clarified.** The roadmap doesn't say when a `runs` row first comes
   into existence, but `run_photos.run_id` is `NOT NULL` and `runs.duration_sec` /
   `runs.distance_m` are `NOT NULL` — so *something* has to create a `runs` row before F05 can
   attach photos to it, and before extraction has produced real numbers to fill those `NOT NULL`
   columns. **Decision: F04 creates the `runs` row at upload time**, with `duration_sec = 0`,
   `distance_m = 0`, `avg_pace_sec = 0` as placeholder sentinels, `reviewed_at = NULL`, and
   `source = 'screenshot'`. `run_photos` attach to this id immediately. `/r/[id]/review`'s `[id]`
   is unambiguously `runs.id` from upload through commit — **F05 never creates a `runs` row, it
   only ever `UPDATE`s one that already exists**, and is the sole writer of `reviewed_at`, the
   real `duration_sec`/`distance_m`/`avg_pace_sec`, and the `run_splits`/`run_zones` child rows.
   The design brief's "skeleton of the run card" waiting state (F04's territory) is rendering
   this same placeholder row.

2. **`extractions.corrections` shape, refined.** The roadmap's inline comment
   (`-- {field: {from, to}}`) describes a single edit per field. §6.1 above specifies
   `{fieldPath: [{from, to, phase, checkId, correctedAt}, ...]}` — an **array** per field, because
   §7 establishes that a run can be corrected again after `reviewed_at` is set, and overwriting
   the first correction with the second would erase exactly the signal `corrections` exists to
   preserve (`IMPLEMENTATION_PLAN.md` §3). Still one `jsonb` column, still on `extractions` — no
   type or table change, just a richer value shape that every reader (§6.2's query, any future
   prompt-tuning tool) should assume from day one rather than migrate to later.

3. **New column: `runs.corrected_at timestamptz NULL`.** `reviewed_at` (existing) answers "has a
   human ever confirmed this run" and is set exactly once, permanently. Nothing in the existing
   schema answers "has this run been edited *since* that confirmation" — which F07/F09 need
   cheaply (§7.2: "recompute that scope_key fresh") without diffing `extractions.corrections`
   for a `phase: 'post-review-edit'` entry on every read. `corrected_at` is `NULL` until the first
   post-review edit, then holds the timestamp of the most recent one. F08 (run detail, later)
   surfaces this as a provenance line — "Reviewed Aug 20 · edited Aug 22" — distinct from the
   per-field correction mark in §2.3.

---

## 10. Task breakdown

1. **`lib/review/checks.ts`** — the four consistency-check functions (§3), pure, exported, unit
   tested against `research/schema.mjs`'s `TRUTH` and the five mutated cases in §3.1.
2. **`lib/review/draft.ts`** — `ReviewDraft` type (mirrors `schema.mjs`'s `SHAPE` field-for-field),
   `FieldErrors`, `FocusRequest`, `hydrateDraftFromExtraction(raw_response)`, and a
   `diffCorrections(original, edited)` function that produces the `{fieldPath: [...]}` shape from
   §6.1 by walking both objects and recording only changed leaves.
3. **`lib/review/schema.ts`** — Zod schema for the commit payload: `distance_m > 0`,
   `duration_sec > 0`, 1–20 splits each with positive `time_sec`/`pace_sec`, at most one
   `partial: true` and only as the last split, exactly 5 zone rows numbered 1–5.
4. **`app/(app)/r/[id]/review/page.tsx`** (server component) — loads the `runs` row (must be
   owned by the session user), its linked `extractions` row, and `run_photos`; redirects to
   `/r/[id]` if `reviewed_at` is set and the request has no `?edit=1`; renders the `failed`-status
   branch (§8) or the normal hydrated-draft branch.
5. **`ReviewClient.tsx`** — the client component holding draft state, running `runAllChecks` on
   every change, and rendering the sections in §2.1's table. Mirrors `ReviewStage.tsx`'s
   focus-request-and-reveal pattern (`useRef` maps, `revealAboveBar`) so tapping "Jump ↓" on a
   banner entry scrolls to and focuses the implicated block.
6. **`ConsistencyBanner.tsx`** — `role="alert"` when checks fail (matches `parseFailure` in
   `ReviewStage.tsx`), a quiet `role="status"` "numbers check out" line when all four pass (matches
   `DEGRADED_NOTICE`'s pattern), one entry per failing check with its `message` and a "Jump" CTA
   that resolves `fieldPaths[0]`'s block.
7. **`ScreenshotStrip.tsx`** + full-screen pinch-zoom viewer — thumbnails from `run_photos`
   ordered by `sort_order`, tap-to-expand.
8. **`SplitsTable.tsx`** + **`SplitSheet.tsx`** — always-open table, distinct partial-row styling,
   tap-a-row → sheet with the source screenshot pinned + fields + `partial` toggle + delete,
   mirroring `ItemSheet.tsx`'s footer layout (`Delete row` / `Save`).
9. **`ZoneBar.tsx`** + **`ZoneSheet.tsx`** — same shape as splits, one sheet per zone (duration,
   min/max bpm — with the null-bound copy for zone 1's floor and zone 5's ceiling made explicit
   in the sheet, not left as a blank input).
10. **`MoreDetails.tsx`** — collapsed `<details>` for cadence/kcal/elevation/resting-max HR, with
    a controlled `open` prop the parent sets to `true` the moment any check names a field inside
    it (mirrors `ReviewStage.tsx`'s controlled `showRaw` pattern exactly).
11. **`RawResponseDisclosure.tsx`** — collapsed, read-only pretty-printed `raw_response`, plus a
    "Retry extraction" action (re-runs F04's vision call against the same `run_photos`, gated by
    an inline confirm — mirrors `REPARSE_CONFIRM`'s two-button inline pattern, never
    `window.confirm`).
12. **`commitReview` server action** — one transaction: validate with #3's schema, `UPDATE runs`
    (real values + `reviewed_at = now()` if first commit, `corrected_at = now()` if not),
    replace `run_splits`/`run_zones` (delete + reinsert is simplest and correct at 11+5 rows),
    merge `diffCorrections`'s output into `extractions.corrections`, then call
    `onRunCommitted` (§7.1) with the appropriate `phase`. Surfaces the
    `UNIQUE (user_id, occurred_on, started_at)` collision as a friendly "you've already logged a
    run at this time" message, not a raw constraint error.
13. **`lib/derived/invalidate.ts`** — the `onRunCommitted` contract (§7.1) shipped as a real,
    documented, currently-no-op function (each downstream section commented with which future
    feature fills it in and exactly what it must do, quoting §7.2's table) — not left as a TODO
    comment scattered across the commit action.
14. **Manual-entry branch (§8)** — the `status === 'failed'` path through #4/#5: blank draft
    hydration, the explanatory banner, `phase: 'manual'` corrections, `source = 'manual'` on
    commit.
15. **Accessibility pass** — `aria-live="polite"` on the check-count summary (mirrors
    `ReviewStage.tsx`'s total/error-count announcements), full keyboard reachability of every
    sheet trigger, VoiceOver labels on split/zone rows that quote the row's own values (not
    "Edit row 11" ×11 — "Edit kilometre 11, partial, 7 minutes 9 seconds per kilometre").

---

## 11. Verification

- **`lib/review/checks.ts` unit tests** (§3.1) — five cases against `TRUTH`, all passing, plus the
  four mutated-fixture cases, each failing exactly the check it's designed to trip and no other.
  Wired into the same Vitest run as `research/score.mjs` so a broken tolerance fails CI, not a
  future reviewer's afternoon.
- **`diffCorrections` unit tests** — given an original and an edited draft, produces exactly the
  keys that changed, in the §6.1 shape, with `phase` and `checkId` populated correctly from
  whichever check (if any) was failing on that field at commit time.
- **Zod schema tests** — reject zero splits, reject two `partial: true` rows, reject a
  `partial: true` row that isn't last, reject `distance_m <= 0`, accept the exact `TRUTH` fixture
  shape unmodified.
- **`commitReview` integration test (golden path)** — hydrate a draft from `TRUTH` unmodified,
  commit with zero corrections, assert: `runs.reviewed_at` is set, `run_splits` has 11 rows
  matching `TRUTH.splits` exactly (partial flag on row 11 only), `run_zones` has 5 rows,
  `extractions.corrections` is `null` or `{}` (nothing was changed), `onRunCommitted` was called
  once with `phase: 'review'`.
- **`commitReview` integration test (corrected path)** — hydrate from a mutated draft
  (§3.1's split-1 `436s` corruption), correct it back to `396`, commit, assert:
  `extractions.corrections['splits.0.timeSec']` has one entry with
  `{from: 436, to: 396, checkId: 'splits_sum_vs_duration', phase: 'review'}`.
- **`commitReview` integration test (post-review edit)** — commit once, then commit again with a
  further change; assert `runs.reviewed_at` is unchanged from the first commit,
  `runs.corrected_at` is now set, and `extractions.corrections` contains **both** edit events for
  any field touched twice, in order.
- **Manual-entry integration test** — an `extractions` row with `status = 'failed'`, commit a
  fully hand-typed draft, assert `runs.source = 'manual'`, `runs.extraction_id` still points at
  the failed row, and every field appears in `corrections` with `phase: 'manual'`, `from: null`.
- **`onRunCommitted` contract test** — assert it is called exactly once per commit, with a
  correctly-populated `RunChangeEvent`, and that a thrown error inside it does not roll back the
  already-committed `runs`/`run_splits`/`run_zones` transaction (§7.3).
- **Manual QA checklist against the real fixture** (the three screenshots in `research/`):
  1. Upload the fixture, let extraction run, land on `/r/[id]/review` — confirm zero banner
     entries (all four checks should pass on real data) and that Save is one tap away.
  2. Hand-edit split 1's time in the DB (or via a debug flag) to `436` before loading review —
     confirm the banner appears, names "one of the 11 splits," and "Jump ↓" scrolls to the table.
  3. Toggle km 11's `partial` off in the sheet, save the sheet, confirm the banner immediately
     shows the CHK-4 message before the main Save is even tapped (checks re-run on every field
     change, not only at commit).
  4. Commit the run, reload `/r/[id]/review?edit=1`, change one field, save — confirm
     `reviewed_at` didn't move and `corrected_at` did.
  5. Force an `extractions.status = 'failed'` row, confirm the manual-entry banner and blank
     fields render, and that a fully hand-typed commit succeeds with `source = 'manual'`.

---

## 12. Execution record — 2026-08-21

Shipped. `npm test` 500 green across 36 files, typecheck clean, lint clean, `next build` clean,
all three CI guards green.

### 12.1 What was built

| Module | What it owns |
|---|---|
| `lib/review/checks.ts` | The four consistency checks (§3), pure, plus `checkIdForFieldPath` — the attribution the corrections log needs |
| `lib/review/draft.ts` | `ReviewDraft`, the three hydrations, `resolveOccurredOn`, `flattenDraft`, `diffCorrections`, `mergeCorrections` |
| `lib/review/schema.ts` | The commit-payload Zod schema and `toRunInput` — D5's unit conversion, once |
| `lib/review/inputs.ts` | Text ↔ integer parsing for every editable control |
| `lib/review/loadReview.ts` | The two server-resolved baselines (`/x/[id]` and `/r/[id]/edit`) |
| `lib/review/commit.ts` | The orchestration: baseline → validate → write → log → invalidate |
| `lib/review/actions.ts` | The Server Action boundary: auth, revalidate, redirect |
| `lib/derived/invalidate.ts` | §7.1's contract, shipped as a real documented no-op |
| `components/review/*` | `ReviewScreen`, `ReviewClient`, `ConsistencyBanner`, `HeroFields`, `SplitsTable`+sheet, `ZoneBar`+sheet, `MoreDetails`, `ScreenshotStrip`+viewer, `RawResponseDisclosure`, `RetryExtraction`, `HonestyChip`, `ParsedInput` |
| `components/ui/Sheet.tsx` | The bottom-sheet primitive (new to the design system) |
| `app/x/[extractionId]`, `app/r/[id]/edit`, `app/r/[id]` | R-14's three routes |

Tests: `tests/review.checks.test.ts` (23), `review.draft.test.ts` (39), `review.schema.test.ts`
(26), `review.inputs.test.ts` (24), `review.commit.test.ts` (24), `derived.invalidate.test.ts`.

### 12.2 Deviations from this plan, and why

1. **The route is `/x/[extractionId]`, not `/r/[id]/review`, and §9 delta 1 is dead.** R-1 ruled
   against this plan's placeholder-`runs`-row proposal — `occurred_on` is NOT NULL and unknown at
   upload, so a placeholder needs a placeholder date and the second upload of any day collides
   with the R-5 dedupe index. **F05 now creates the `runs` row**, in `commitExtractedRun`, and
   backfills `run_photos.run_id`. Everything else in §9 stands: deltas 2 (array-per-field) and 3
   (`corrected_at`) both shipped, as R-7 and R-8.

2. **CHK-3's field paths are `distanceKm`, not `distanceM`.** The draft mirrors the extractor's
   field names exactly (§6.1's whole premise — a correction path *is* the extractor's path), and
   the extractor returns kilometres. Metres appear once, in `toRunInput`.

3. **Zero splits and zero zones are legal; §10 item 3's "1–20 splits" is not.** `/upload` accepts
   one screenshot, and the provenance guard nulls the splits array out for a summary-only upload
   precisely so no invented rows reach a reviewer. Requiring a row would make that ordinary upload
   uncommittable. Zones are 0 or exactly 5 — never a partial set, because Apple prints all five or
   none and a truncated denominator is undetectable downstream.

4. **The hero fields are edited in place, not through a sheet.** §2.2's sheet pattern is right for
   splits and zones — a row at a time, screenshot pinned above. It is wrong for the three CHK-3
   inputs: a check that says "check the distance, the pace and the duration" wants all three
   visible together, and a sheet shows them one at a time. Provenance is still R-45's: the strip
   is above, and every photo opens full-screen and pinch-zoomable.

5. **`intent` and `note` were added to the draft.** Neither is in this plan, and both are `runs`
   columns with no other writer anywhere in the product. Without them here they are dead schema.
   They sit in "More details" and carry no `scan` chip, because they were never on a screenshot.

6. **`occurredOn` is a draft field the extractor has no equivalent for.** `runs.occurred_on` is
   NOT NULL and Apple prints no year. `resolveOccurredOn` guesses in the one safe direction — a
   run cannot be in the future — the label sits under the input as the evidence, and the guess is
   diffed like any other field, so "how often is it wrong" is measurable.

7. **`phase: 'manual'` is a transcript, not a diff.** §6.1 says `from` is always null for manual
   entry. Diffing against the blank draft did not deliver that: `emptyDraft` pre-fills today's
   date and "Outdoor Run", so those two leaked in as `from` values and would have been counted as
   model output by §6.2's query. `diffCorrections` now special-cases the phase and records every
   entered value as arriving from nothing. **Caught by the §8 test, not by review.**

8. **The commit is one transaction plus two follow-ups, not one transaction.** §7.3 asks for
   `runs` + children + `extractions.corrections` in a single transaction. F03's published surface
   writes corrections through `recordCorrections`, and `commitExtractedRun` takes no extra
   statements. The run goes first; a corrections-log failure is logged and the save stands. The
   exposure is lost analytics on one commit, against the alternative exposure of a corrections log
   describing a run that does not exist.

9. **`ExtractedSummary.tsx` was deleted.** Its own docblock said F05 replaces it wholesale.

10. **`/r/[id]` was built, minimally.** `commitReview` redirects there and F08 has not landed; a
    redirect to a 404 is not a finished flow. It carries two things F08 must keep: §9.3's
    provenance line ("Reviewed 20 Aug · edited 22 Aug") and the link into `/r/[id]/edit`.

11. **The F04/F05 seam moved out of `ExtractionGate`'s `switch`.** The review screen needs the
    stored `corrections`, the raw vendor reply, and above all a **server-resolved baseline**. The
    poll's only remaining job is to `router.refresh()` when the status turns terminal.

### 12.3 What is deliberately still open

- **The tolerances are seeded, not tuned** (§3). One ground-truth fixture exists.
  `getExtractionErrorProfile` is the mechanism for revisiting them after a month of real
  corrections; a check that never fires on real data and never gets reviewed is a check on paper.
- **`onRunCommitted` is a no-op**, by design, with each downstream feature's obligations written
  out in its body. `tests/derived.invalidate.test.ts` exists to stop a future author replacing it
  with `throw new Error('not implemented')`, which would make every commit log an unactionable
  error.
- **§11's manual QA checklist has not been run** — it needs the live Blob store, the live model
  and a real database. Every case on it is covered by an automated test except the two that are
  inherently visual: the "Jump ↓" scroll and the pinch-zoom viewer.
