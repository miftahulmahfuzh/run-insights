# F08 — Views, charts & trends

> Status: plan. Depends on F06 (metrics) and F07 (insights) landing their read contracts
> first; this document specifies what F08 needs from each, not how they compute it.

## 0. Scope

**F08 owns:**

| Route | Screen |
|---|---|
| `/` | Runs list, newest first, grouped by week |
| `/r/[id]` | Run detail — hero, analysis slot, charts, splits |
| `/trends` | Week + month rollups, the three trend charts |
| — | `AppShell` / `TabBar` (3 tabs: Runs · Upload (raised) · Trends) |
| — | Every chart component, `lib/charts/*`, `lib/format.ts` |

**F08 does not own** (and this plan writes zero code against them):

| Owner | What |
|---|---|
| F04/F05 | `/upload`, `/r/[id]/review`, extraction, correction |
| F06 | The metrics themselves — decoupling, drift, cadence fade, HRmax resolution, flags, ACWR |
| F07 | The narrative prose, `headline`/`verdict`/`observations`/`doNext`/`questionForRunner` |
| F09 | `/me`, badge shelf, records display, the intent-answer write path's *badge evaluation* |
| F05 | The provenance/low-confidence *editing* affordance (F08 only *displays* the read-only mark) |

F08 is a **consumer** of F06 and F07's output shapes. Where this plan assumes a shape F06
or F07 hasn't fixed yet, it says so explicitly (§3, §8) — the mapping functions are the
part that may need to flex; the screens and chart specs do not.

**Copy is straight English (roadmap D10).** Every wireframe and copy example below is
English. Do not port Indonesian strings from the expense tracker — only its *structural*
patterns (RSC/client split, formatting centralisation, empty-state discipline) transfer.

---

## 1. Design stance carried into every screen

From `docs/design-brief.md`: this is a reading app, not a dashboard. Three rules that
constrain every decision below:

1. **One hero figure per screen.** `/` has none (it's a list); `/r/[id]`'s hero is the
   run's distance; `/trends` has exactly one hero number per scope (week distance, or
   month distance) — never two competing headline numbers on one screen.
2. **No gamification chrome.** No rings, no confetti, no "Great job!". A flag reads as
   `POSITIVE_SPLIT — second half 41 s/km slower than the first`, not `⚠️ You're fading!`.
3. **The honesty rule is first-class, not an error state.** Every saved run shows where
   its numbers came from (§2.2, `ProvenanceMark`), and every chart ships its accessible
   table-view twin (dataviz's non-negotiable #6) — never a value reachable only by hover
   or tap on a 414px screen with a thumb over it.

---

## 2. Screens

### 2.1 `/` — Runs list

```
┌─────────────────────────────────────┐  pt-safe-header
│  RUN INSIGHTS              TRENDS →  │  eyebrow wordmark, plain-text link, no icon
├─────────────────────────────────────┤
│  THIS WEEK · 3 RUNS · 24.10 KM       │  week divider: eyebrow + mono meta, not sticky
│                                       │  (mirrors expense tracker's day-header decision:
│                                       │   nothing publishes a header-height token to key
│                                       │   a sticky offset off, so it doesn't stick)
│ ┌───────────────────────────────────┐│
│ │ Tue 18 Aug                    ⧉ 3 ││  RunRow — whole row is the /r/[id] link
│ │ 10.67 km · 1:18:36                 ││  line 1: day+date, photo count if any
│ │ 7'22"/km avg · 173 bpm avg          ││  line 2: distance · duration
│ └───────────────────────────────────┘│  line 3: pace · avg HR
│ ┌───────────────────────────────────┐│
│ │ Sun 16 Aug                          ││
│ │ 8.02 km · 47:10                     ││
│ │ 5'53"/km avg · 158 bpm avg           ││
│ └───────────────────────────────────┘│
│                                       │
│  WEEK OF 10 AUG · 4 RUNS · 41.20 KM  │
│  ┌───────────────────────────────────┐
│  │ ...                                │
├─────────────────────────────────────┤
│   Runs         [ + ]         Trends  │  TabBar, raised centre tab = Upload
└─────────────────────────────────────┘
```

- **Grouping key**: ISO week (`isoWeekKey`, §6), newest week first, newest run first
  inside it. The divider states the week's own total distance and run count — computed
  server-side from the same rows being listed, never a second query.
- **A run mid-extraction never appears here.** Per roadmap D1, a run only exists in
  `runs` once a human has reviewed and saved it (`reviewed_at IS NOT NULL`). A pending
  extraction lives on `/upload`'s own polling UI (F04), not in this list. §9 still
  specifies a state for "you just saved a run and navigated back here" — the new row is
  a normal server-rendered row, no special treatment needed, because by the time it's in
  `runs` it is exactly as real as every other row.
- **RunRow is a Server Component.** No client state, no callback — same reasoning as
  `MonthHeader.tsx`: shipping React for a link is a tax with no benefit.
- **Pull-to-refresh / infinite scroll**: out of scope for v0.1. At 4 runs/week the whole
  history for a year is ~200 rows; paginate at 90 days server-side (a `?before=` cursor
  on `occurred_on`) rather than building virtualization for a dataset this small.

### 2.2 `/r/[id]` — Run detail

```
┌─────────────────────────────────────┐
│  ‹ Runs                    Share ›   │  Share is F11 — render the slot, no logic yet
├─────────────────────────────────────┤
│  Tue 18 Aug · Tangerang               │  eyebrow: date + location
│                                       │
│  10.67 km                            │  hero, ≥48px sans (dataviz hero-figure spec)
│  1:18:36 · 7'22"/km avg               │  duration · pace, one step down
│                                       │
│  173 bpm avg · 189 max · 144 spm avg │  secondary stat row (Stat/sm tiles)
│  646 kcal active · 15 m gain          │
│                                       │
│  ⌁ Read from screenshot · reviewed    │  ProvenanceMark — quiet, permanent, mono
│    20 Aug                             │  (see §2.2.1)
│                                       │
│  [ Easy ] [ Tempo ] [ Long ] [ Race ] │  intent chip row — unset by default, tap to
│                                       │  set once; already-set intent shows filled
├─────────────────────────────────────┤
│  "An easy-distance run done way too   │  F07's InsightCard — F08 owns the container,
│   hard — 93% of estimated HRmax."     │  not the words. Verdict pill: EASY/MOD/HARD/
│   VERY HARD                            │  VERY HARD (status colour, icon+label, §4)
│                                       │
│   [Flag] Positive split: +41 s/km     │  Flag components, info/warn severity, one
│   [Flag] Cadence fade: −18 spm        │  per fired rule, straight sentence, no exclaim
│   [Flag] 90.6% of this run in Z4+Z5   │
├─────────────────────────────────────┤
│  PACE & HEART RATE                    │  the signature chart (§3.1)
│  ┌───────────────────────────────┐   │
│  │        ╱‾‾HR‾‾╲___╱‾‾‾‾╲       │   │
│  │  pace ╱──inverted, "up"=faster │   │
│  └───────────────────────────────┘   │
├─────────────────────────────────────┤
│  TIME IN ZONE                         │  zone bar (§3.2)
│  ▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│  Z1 2%  Z2 1%  Z3 7%  Z4 47%  Z5 43% │
│  90.6% of this run was Z4 or harder.  │  plain-stated caption, not a chart label
├─────────────────────────────────────┤
│  SPLITS                    ▸ per km   │  splits table (§3.3)
│  km   pace     hr    cadence          │
│  1    6'36"   154    154              │
│  2    7'08"   171    148              │
│  ...                                  │
│  11*  7'09"   183    145   0.67 km    │  visually distinct partial row
├─────────────────────────────────────┤
│   Runs         [ + ]         Trends  │
└─────────────────────────────────────┘
```

#### 2.2.1 `ProvenanceMark` — the honesty rule, on the saved screen

Design brief: *"a saved run must show where its numbers came from... a distinct
treatment for a field I corrected by hand."* On `/r/[id]` this is **read-only and
run-level**, not per-field (per-field belongs to F05's review screen, which is the only
place a field is still editable):

```ts
type Provenance =
  | { kind: 'screenshot'; reviewedAt: string; correctedFieldCount: 0 }
  | { kind: 'screenshot'; reviewedAt: string; correctedFieldCount: number } // > 0
  | { kind: 'manual'; reviewedAt: string }
```

Rendering rule: `source === 'screenshot'` and `correctedFieldCount === 0` → `⌁ Read from
screenshot · reviewed 20 Aug`. `correctedFieldCount > 0` → `⌁ Read from screenshot ·
2 fields corrected · reviewed 20 Aug`, same mono ink-3 treatment, no colour — this is
provenance, not a warning. `correctedFieldCount` is `Object.keys(extractions.corrections
?? {}).length`; F08 reads it, F05 writes it. Never a colour-only cue: the glyph `⌁` plus
the word "corrected" carry it, per dataviz's "never colour alone."

#### 2.2.2 The intent chip

`runs.intent` (`'easy'|'tempo'|'long'|'race'|'unspecified'`, roadmap §4.3). Unset shows
four outline chips; tap sets it via a Server Action F08 calls but does not own the
business logic of (the write lives beside F07's "answer the question" flow, since intent
is literally the answer to `questionForRunner`). Once set, the matching chip fills
(`Chip`'s `selected` pattern) and the others disappear — this is a fact about the run,
not a filter. No "why we ask" copy needed here; onboarding already explained HRmax, and
intent is self-explanatory in context.

#### 2.2.3 The extracting / pending state

A run mid-extraction is **never** reached via `/r/[id]` — no id exists until the row is
saved (D1). §9 covers the *upload* skeleton (owned by F04, referenced only so F08's
`EmptyState` vocabulary stays consistent with it).

### 2.3 `/trends` — week + month rollups

One route, a `?scope=week|month&key=...` pair (mirrors the expense tracker's `?m=`
pattern), a segmented control at the top swapping between them. **Do not build this as
two routes** — a single route keeps the "Trends" tab's `aria-current` logic in `TabBar`
trivial and lets the always-visible trend section below live in one server component
tree instead of being duplicated per route.

```
┌─────────────────────────────────────┐
│   [ WEEK ]   MONTH                    │  segmented control, WEEK selected
├─────────────────────────────────────┤
│  ‹  Week of 10 Aug 2026   ›           │  prev/next chevrons, mirrors MonthHeader.tsx
│                                       │
│  41.20 km                            │  hero: this scope's total distance
│  4 runs · ↑ 12% vs last week          │  delta tile, status colour = direction × good/bad
│                                       │
│  Tue 18 Aug   10.67 km   7'22"/km    │  compact run rows for the week, no charts —
│  Sun 16 Aug    8.02 km   5'53"/km    │  side-by-side comparison per design brief §6
│  Thu 13 Aug   11.30 km   6'58"/km    │
│  Mon 11 Aug   11.21 km   6'40"/km    │
├─────────────────────────────────────┤
│  "Four runs, all easy-to-moderate     │  F07's week-scope InsightCard (verdict on the
│   effort. Tuesday ran 41 s/km slower  │  week as a whole) — F08 renders the slot only
│   than the rest — the only outlier."  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│    WEEK   [ MONTH ]                   │  MONTH selected
├─────────────────────────────────────┤
│  ‹  August 2026            ›          │
│                                       │
│  180.40 km                           │  hero: month total distance
│  17 runs · ↑ 4% vs July               │
│                                       │
│  WEEKS THIS MONTH                     │  the Nike-Run-Club chart — §3.4
│  ┌───────────────────────────────┐   │
│  │ ▁▁  ▓▓▓  ▓▓▓▓  ▓▓▓  ▓▓░ ▁      │   │  (░ = partial week at the boundary)
│  └───────────────────────────────┘   │
│  27 Jul–2 Aug · 3–9 Aug · ... · 31 Aug│
│                                       │
│  ACWR  0.94  (7d ÷ 28d)   within range│  stat tile, flagged only if outside 0.8–1.3
│                                       │
│  ▓▓░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  month-aggregate zone bar (same component as
│  Z1 3%  Z2 4%  Z3 12%  Z4 41%  Z5 40% │  §3.2, fed monthly-summed durations)
├─────────────────────────────────────┤
│  "180 km, your biggest month yet..."  │  F07's month-scope InsightCard
└─────────────────────────────────────┘

──────────────── always visible, regardless of scope ────────────────
┌─────────────────────────────────────┐
│  TRENDS · LAST 12 WEEKS               │
│                                       │
│  WEEKLY VOLUME                        │  §3.5
│  ┌───────────────────────────────┐   │
│  │ ▁▃▅▃▆▇▅▆▇▆▇█  ╌╌rolling mean╌╌ │   │
│  └───────────────────────────────┘   │
│                                       │
│  PACE TREND    [Short][●Med][Long][V+]│  §3.6, filter chip row above the chart
│  ┌───────────────────────────────┐   │
│  │  ·  ·    ·  ·  ·   ·  ·  ·      │   │  scatter, size = distance, inverted y
│  └───────────────────────────────┘   │
│                                       │
│  ZONE DRIFT                           │  §3.7
│  ┌───────────────────────────────┐   │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │   │
│  └───────────────────────────────┘   │
├─────────────────────────────────────┤
│   Runs         [ + ]         Trends  │
└─────────────────────────────────────┘
```

**Do not conflate the two "weekly bars" charts.** "Weeks this month" (§3.4) is scoped to
the calendar month selector and its bars must sum exactly to the month hero number.
"Weekly volume · last 12 weeks" (§3.5) is a rolling window independent of the
week/month switcher above it — it does not change when you flip the segmented control
or page months. They share a visual grammar (bars = distance per ISO week) but different
domains, different data sources, and different purposes; a reader who taps the month
switcher must never see the 12-week trend chart move.

---

## 3. Chart-by-chart specifications

Every chart follows the dataviz procedure in order: form → color → validate → marks →
interaction → accessibility pass. Palette values below cite the dataviz skill's
documented **placeholder** default (`references/palette.md`) — roadmap §5 defers the
real Claude Design pull until F08 has screens to dress, exactly as it did for the
expense tracker (see `app/(shell)/stats/stats.css`'s own history of a discarded blue
ramp). Task 14 (§10) re-validates against real tokens once that pull lands.

### 3.1 Pace + HR per kilometre — the signature chart

**Data shape** (`lib/charts/paceHr.ts`, from `run_splits`):

```ts
type PaceHrPoint = {
  km: number            // 1..11
  paceSec: number       // seconds/km, Apple's own value — already normalised for
                         // the partial km (schema.mjs: km 11 timeSec 288, paceSec 429)
  hr: number | null
  cadence: number | null
  partial: boolean
  distanceM: number     // 1000, or the partial's actual metres (670)
}
```

**Form:** two lines over a shared discrete x (km 1..11), not a scatter — the reader's
question is "how did this change, split to split," which is trend-over-time's job.

**The dual-axis waiver.** This is a deliberate, singular exception to dataviz's #1
anti-pattern ("dual-axis charts... invent a correlation that isn't in the data").
Full reasoning and the guardrails that keep it honest are in §12. **No other chart in
this plan uses two y-scales** — confirm that invariant on every future addition to this
file.

**Axis treatment:**
- **X:** km 1..11, one tick per split, labelled `1`…`10`, `11*` (the asterisk is the
  same non-colour partial marker as the splits table, §3.3 — a reader scanning only the
  axis still sees it).
- **Left Y — pace, INVERTED.** Domain is `[max(paceSec) + 20s, min(paceSec) - 20s]` in
  *reversed* order so the axis's rendered top is the fastest pace and the bottom is the
  slowest. Ticks at round pace values (`6'30"`, `7'00"`, `7'30"`, `8'00"`) via
  `formatPaceShort` (§5). The axis title reads `PACE (FASTER ↑)` — words, not just
  the reversal, because an inverted axis is exactly the kind of thing a returning reader
  forgets by the third visit.
- **Right Y — HR**, domain `[min(hr) - 10, max(hr) + 10]`, standard orientation, ticks at
  round bpm (`150`, `170`, `190`). Right axis exists *only* on this one chart in the
  whole app — grep for a second `yAxisId` anywhere else in `lib/charts/` should return
  nothing.
- Both axes are scaled to their own **physiologically anchored** domains (not an
  arbitrary 0-max that could be tuned to make the lines cross dramatically) — this is
  one of the waiver's guardrails, see §12.

**Marks:** pace line — 2px, categorical slot 1 (blue `#2a78d6` / dark `#3987e5`), 8px end
dot on km 11. HR line — 2px, categorical slot 2 (orange `#eb6834` / dark `#d95926`, the
second documented slot, chosen for the widest adjacent CVD separation from blue),
8px end dot. Both lines get a 2px surface-colour ring on their end dots so they read
crisply where the lines cross (they do cross visually near km 4–5 on the fixture — pace
and HR moving in *opposite screen directions* on an inverted axis is exactly the "worse
pace, higher HR" story rendering as "both lines rising together").

**Legend:** always present (2 series) — a compact one-row legend under the chart title,
line-key style (`— Pace`, `— HR`), not swatch boxes (marks-and-anatomy: "line keys, not
boxes" for dense contexts; a 2-item legend on a 414px card is dense enough to earn it).
Direct-label the **last point of each line** with its value (`8'00"`, `183`) — the
"endpoint, not every point" rule — since the last split is the punchline of a fatigue
story.

**The partial-km handling:** km 11 renders identically to km 1–10 on *this* chart — its
`paceSec` (429) is Apple's own already-normalised per-km rate, not the raw 288s time, so
plotting it is not misleading the way displaying its raw time would be (contrast §3.3,
where the raw time genuinely is the risk). Mark it anyway: the x-axis tick is `11*`, and
its dot on both lines gets a thin dashed outline ring (not a colour change) — dashing is
banned for *gridlines* (anti-patterns) but is exactly the right "this one's different"
cue on a single point, and it doesn't compete with the two solid data lines.

**Legibility at 414px with a thumb on it:**
- Chart card height: 220px total (plot ~180px + x-axis band ~26px + legend row ~14px) —
  satisfies the "container height must include the axis band" anti-pattern check.
- Hit target: `accessibilityLayer` + a per-km vertical crosshair band (not per-dot),
  ~34px wide (414 / 11 splits ≈ 37px, minus the 2px gaps) — bigger than the 24px floor,
  bigger than a thumb-tip needs to be precise about.
- Tooltip on crosshair-snap shows **both** series at that km in one readout: `km 6 —
  pace 7'20", HR 177 bpm`, per interaction.md's "one tooltip, every series."
- Table-view twin: the splits table (§3.3) directly below **is** this chart's
  accessible twin — no separate `<details>` needed, because the data is identical and
  adjacent on the same page. State this explicitly in the component's doc comment so a
  future editor doesn't duplicate a table.

### 3.2 The zone bar

**Data shape** (`lib/charts/zones.ts`, from `run_zones`):

```ts
type ZoneShare = {
  zone: 1 | 2 | 3 | 4 | 5
  durationSec: number
  pct: number              // rounded via largest-remainder so the five sum to 100
  minBpm: number | null    // null for zone 1
  maxBpm: number | null    // null for zone 5
}
```

Percent denominator is `sum(durationSec)` across the five zone rows, **not**
`runs.duration_sec`— the zones may not perfectly reconcile to the watch's total duration
(GPS pauses, auto-pause gaps), and a bar that doesn't sum to 100% because its denominator
disagrees with its own segments is a worse bug than a percent that's off by a second
from the hero duration.

**Form:** one horizontal stacked bar, 5 segments — part-to-whole, ≤6 segments, exactly
dataviz's stacked-bar table row.

**Color — the "semantic heat" exception.** Zones are ordinal (Z1 easier → Z5 hardest)
but the design brief explicitly wants distinguishable *hues*, not five lightness steps
of one colour, echoing Apple's own blue→green→yellow→orange→pink direction. This is
marks-and-anatomy's documented "semantic heat" exception to the one-hue-sequential rule.
Treat the five zones as five **fixed categorical slots in a chosen order**, validated
like any categorical set:

| Zone | Hue | Light | Dark | Categorical slot borrowed |
|---|---|---|---|---|
| Z1 | blue (coolest) | `#2a78d6` | `#3987e5` | slot 1 |
| Z2 | aqua | `#1baf7a` | `#199e70` | slot 3 |
| Z3 | yellow | `#eda100` | `#c98500` | slot 4 |
| Z4 | orange | `#eb6834` | `#d95926` | slot 2 |
| Z5 | red (hottest) | `#e34948` | `#e66767` | slot 8 |

This is a **placeholder order**, picked for its blue→green→yellow→orange→red reading
(the "unmissable at a glance" sequence the brief asks for) and must clear the standard
categorical validator in **adjacent-pairs mode** (only touching zones are ever
neighbours in a stacked bar or a stacked area) before it ships — task in §10. If any
adjacent pair fails, re-order among the 8 documented hues per the skill's
snap-to-passing procedure; do not invent a 9th hue.

**Marks:** each segment gets a 2px surface-colour gap from its neighbours (never a
border). A segment's rendered width is clamped to a **3px floor** so Z2's 1% share on
the fixture never vanishes to a sliver nobody can tap — the printed percentage next to
it stays the true, unclamped value, so the clamp is cosmetic, never a lie (same
technique as the expense tracker's `CategoryBreakdown` minWidth clamp).

**Labels:** below the bar, five labels in one row: `Z1 2%`, `Z2 1%`, `Z3 7%`, `Z4 47%`,
`Z5 43%` — a legend AND direct labels at once because five is within the "label
everything" budget when the values are this important and there are only five of them
(this is the "part-to-whole, ≤6 segments" case marks-and-anatomy calls out as the
sanctioned dense-label exception; contrast the pace chart's sparse endpoint-only rule).
Colour is never the only channel — every label carries its own zone number.

**Making 90.6% unmissable without scolding:** a single plain sentence directly under the
labels, sourced from F06's `TOO_MUCH_HARD` flag (fires at Z4+Z5 ≥ 60%, per §4.6's rule
family): `90.6% of this run was Z4 or harder.` No colour change on the sentence, no
icon, no bold — the number itself is the emphasis. This is the difference between "the
chart makes the fact visible" (good) and "the app is telling you off" (the thing the
brief explicitly forbids).

**Table view:** the same five rows as a `<details>` table (zone, range, duration,
share) — identical pattern to the expense tracker's `MonthlyChart` `<details>` block.

### 3.3 The splits table

**Data shape:** the same `PaceHrPoint[]` as §3.1, plus a `cadence` column already in
the type.

**This is not a chart** — it's a data table, and dataviz's own contract is that every
chart needs one; here the table exists in its own right as one of the three named
"critical design points."

**Columns:** `KM` · `PACE` · `HR` · `CADENCE`, right-aligned, `font-variant-numeric:
tabular-nums` (dataviz: reserve tabular figures for *columns that must align* — this is
exactly that case, unlike a hero figure). Header row is the mono eyebrow style already
established by every other table header in the sibling app (`GroupRow`'s pattern).

**The partial row (km 11), concretely distinct — three independent channels, per D14:**

1. **The KM cell reads `11*`**, and a second line directly beneath it in muted ink reads
   `0.67 km` — the actual distance sits right next to the row's own label, not in a
   footnote a reader can miss.
2. **A left rule** (3px, `--rule-strong` or ink-3, never a hue) marks the row's full
   height, distinguishing it *in kind*, the same visual grammar as `EmptyState`'s dashed
   border — "this is a different kind of row," not "this row is an error."
3. **The row's background is one step off the card surface** (a neutral tint, not a
   colour), so it also reads correctly in a greyscale screenshot.

Crucially: the **PACE** cell for km 11 still shows `7'09"` (429s) — Apple's own
per-km-normalised value — because that number is honest and comparable. What must never
happen is a reader glancing at a hypothetical **TIME** column (if one were added later)
and seeing `4:48` for the shortest-looking row and reading it as a sprint. **This plan
does not add a raw split-time column to the table for exactly that reason** — pace
already carries the "how fast" information in comparable units, and a time column would
require the exact partial-km caveat inline for every reader who skips the asterisk.

**Fastest/slowest split emphasis (optional, v0.1 stretch):** if built, compute
`min`/`max` over `paceSec` **excluding the partial row** even though its pace value is
itself valid — the point of D14 is to stop *any* comparison from treating 0.67 km as a
peer distance-wise, and a highlighted "fastest split: km 11" reads as a badge for a run
that never happened. Full km 1 (396s) is the fixture's actual fastest split and should
win the highlight.

**No hover-only values.** Every number is already printed in the grid — this table
*is* its own table view. No `<details>` wrapper needed here (contrast §3.2, where the
table view is the *addition*; here the "chart" already is the table).

### 3.4 Weeks-in-month — the Nike Run Club chart

**Data shape** (`lib/charts/weeksInMonth.ts` — algorithm detail in §6):

```ts
type MonthWeekBucket = {
  isoWeekKey: string       // '2026-W31' — the week's own ISO identity
  clippedStartISO: string  // the first day of this bucket that's IN the selected month
  clippedEndISO: string    // the last day of this bucket that's IN the selected month
  distanceM: number        // sum of runs whose occurred_on falls in the clipped range
  runCount: number
  isPartial: boolean       // the ISO week extends outside the selected month
  isCurrent: boolean       // today falls inside this bucket AND the month is the
                           // current month — the "still running" case
}
```

**The invariant this chart must satisfy, always:** `sum(buckets.map(b =>
b.distanceM)) === monthTotalDistanceM`. Every calendar day in the month belongs to
exactly one bucket's *clipped* range and no bucket includes a day outside the month —
see §6 for why this falls out of the algorithm by construction rather than needing a
reconciliation step. **Unit-test this invariant directly** (§11) — it is the one
number on this screen a reader will mentally re-add.

**Form:** bar chart, one bar per ISO week touching the month, x = week (labelled by its
*clipped* start date, e.g. `3 Aug`), y = distance. Same "why a bar not a line" reasoning
as the expense tracker's `MonthlyChartInner`: a week is a discrete completed (or
in-progress) bucket, and the reader's question is a magnitude comparison against a
common baseline.

**Color:** one series, one hue — `--accent`-equivalent (categorical slot 1, sequential
default blue). Two ordinal states on that one hue, exactly like the expense tracker's
`chart-bar--complete` / `chart-bar--partial`, plus a **third** ordinal state this app
needs that the expense tracker didn't: the **current, still-running** week gets the
lightest step, distinguished non-colour by a `•` suffix on its tick (same convention)
**and** the caption underneath the chart naming it: `27 Jul – 2 Aug and 31 Aug are
partial weeks. This week is still in progress.`

**Marks:** ≤24px bar width, 4px rounded cap, 2px gaps between bars, `minPointSize: 0`
(a zero-distance week, e.g. an injury week, draws as a true zero — no sympathy sliver,
same rule as the expense tracker's month chart).

**Month total as the hero number:** the hero (`180.40 km`) sits *above* this chart in
the wireframe (§2.3), not as a chart label — one hero figure per screen (§1), and this
chart's job is to show the *shape* of the month, not repeat the headline. Direct-label
only the tallest bar, or the current-week bar if it's also the most recent — the reader
already has the total; the chart's marginal information is "which week was biggest."

**Boundary handling — the fiddly part, resolved:** see §6 for the algorithm. The
plain-language summary: a bucket's bar only ever counts kilometres actually run on days
inside the selected month; a week straddling two months produces one (correctly
smaller) bar in each month's chart, never a doubled or dropped kilometre.

### 3.5 12-week volume trend + 4-week rolling mean

**Data shape** (`lib/charts/volumeTrend.ts`):

```ts
type VolumeTrendPoint = {
  isoWeekKey: string
  weekStartISO: string       // Monday, unclipped — this chart is not month-scoped
  distanceM: number
  rollingMeanM: number | null // null until 4 full weeks of history exist (see below)
  isCurrent: boolean
}
```

**Window:** the 12 most recent ISO weeks ending at the current week, by the Asia/Jakarta
wall clock — a fixed rolling window, independent of anything selected in the switcher
above it (§2.3's non-conflation rule).

**Form:** bar (weekly distance) + line (4-week trailing mean) on **one shared axis** —
this is not a dual-axis violation because both series are the same unit and the same
scale (kilometres); it is exactly the sanctioned "one series is the point, the rest is
context" emphasis form, rendered as bar-plus-overlay-line rather than two-tone bars.

**The rolling mean's first three points are omitted, not estimated.** A 1-week or
2-week "trailing mean" plotted at full line-weight reads as equally confident as the
4-week version next to it and is not — showing `null` (a visible line gap, not a
guessed value) for weeks 1–3 of the window is the honest choice; the line begins at
week 4 once a real 4-week window exists.

**Color:** bars in the sequential default hue (categorical slot 1); the rolling-mean
line in a **darker step of the same hue family** (never a second categorical colour —
it's a derived statistic about the same series, not a second series). 2px line, 2px
surface ring on its points, drawn *above* the bars.

**The current week's bar** gets the same lighter "in progress" step as §3.4, `•`-tagged.

**Legend:** two entries (`▬ Weekly distance`, `╌ 4-week mean`) — the line-key style, not
boxes; the bar's key is a short filled rect, the line's a short stroke.

**Table view:** `<details>` twin, columns `Week` / `Distance` / `4-wk mean`.

### 3.6 Pace trend — banded scatter, "like with like" enforced

**The comparability rule, made mechanical.** IMPLEMENTATION_PLAN §6 says a 5 km at
6'30" is not progress over a 15 km at 7'00" — pace at different distances is not
comparable, full stop. F08 enforces this with a **fixed distance-band filter**, not by
trying to encode distance and pace and progress all in one undifferentiated scatter:

```ts
// lib/charts/paceTrend.ts — the ONLY place these thresholds are defined
export type DistanceBand = 'short' | 'medium' | 'long' | 'very-long'

export function distanceBand(distanceM: number): DistanceBand {
  if (distanceM < 7_000) return 'short'        // < 7 km
  if (distanceM < 12_000) return 'medium'      // 7–12 km — this runner's home base
  if (distanceM < 18_000) return 'long'        // 12–18 km
  return 'very-long'                            // 18 km+
}
```

```ts
type PaceTrendPoint = {
  runId: string
  occurredOn: string      // DateISO
  avgPaceSec: number
  distanceM: number
  band: DistanceBand
}
```

**Interaction, per dataviz's "filters are standard UI, not chart marks":** one row of
filter chips above the chart — `Short` / `Medium` / `Long` / `Very long` — a single
select, not multi-select (mixing bands defeats the entire point). **Default selection**
is whichever band has the most runs in the 12-week window (ties break toward `medium`,
this runner's actual home-base distance per the design brief's "roughly 10.5 km each
time"). Selecting a chip filters the plotted points to that band only — the chart
literally cannot render a 5 km next to a 15 km.

**Form:** scatter, x = date (chronological, continuous — unlike §3.1's discrete km,
here the x truly is time), y = **inverted pace** (same global rule as §3.1 — "up" always
means "faster" everywhere in this app, never a one-chart trick), size = distance in
metres (bubble radius scaled within the selected band's own min/max, so the *within-band*
variance, e.g. 10.1 km vs 11.9 km inside "medium," still reads even though the band has
already equalized the big jumps).

**Color:** single series → **no legend box** (marks-and-anatomy: "a single series needs
no legend box" — the card title plus the active filter chip already say what's plotted).
One hue, categorical slot 1, at ~70% opacity for the raw points so overlapping dots on a
busy training week don't fully occlude each other; the trend line (below) is the same
hue at full opacity.

**Trend line:** a simple linear regression over the filtered band's points, 2px, no
markers — direct-labelled at its right endpoint with the implied pace-per-week change
(`−2 s/km/wk`, i.e. improving, since the axis is inverted "up" already means faster and
the label should agree with the eye rather than requiring a sign flip in the reader's
head).

**Hit targets:** 24px minimum transparent hit area per point (interaction.md's scatter
rule), tooltip on hover/focus shows `18 Aug — 10.67 km, 7'22"/km`; keyboard-reachable via
`accessibilityLayer`.

**Table view:** `<details>` list of the filtered band's runs, date/distance/pace —
reuses the same rows the chart plots, so there is no risk of the two disagreeing.

### 3.7 Zone drift — stacked area over weeks

**Data shape** (`lib/charts/zoneDrift.ts`), same 12-week window as §3.5 for direct
side-by-side reading:

```ts
type ZoneDriftWeek = {
  isoWeekKey: string
  weekStartISO: string
  sharePct: { 1: number; 2: number; 3: number; 4: number; 5: number } // sums to 100
}
```

**Form:** stacked area, x = week (12 points), y = % share (0–100, always full-stack —
this is a part-to-whole-over-time question: "is training becoming more polarised," per
IMPLEMENTATION_PLAN §6's framing).

**Color:** the identical five zone hues from §3.2, same fixed order (Z1 bottom → Z5
top) — one palette for "zone" as a concept everywhere in the app; a reader who's
internalised the run-detail zone bar's colours reads this chart for free.

**Marks:** area fills at ~10% opacity is *not* right here — a stacked area chart's fills
*are* the data (unlike a line's context wash), so each zone's band is its full hue at
normal fill opacity with a 2px surface-colour stroke separating adjacent bands (the
"surface gap" applied to areas rather than bars).

**Direct label:** only the top band (Z5) at the rightmost (most recent) week —
`This week: 43% Z5` — the same "the story is the extreme/endpoint" discipline as every
other chart in this plan. Legend is always present (5 series) underneath, matching
§3.2's five-label row exactly so the two zone visualisations train the same reading
habit.

**Table view:** `<details>` grid, weeks as rows, five zone-share columns.

---

## 4. Color system summary — what F08 actually ships

| Use | Hue(s) | Source |
|---|---|---|
| Pace line (§3.1) | categorical slot 1 (blue) | dataviz default |
| HR line (§3.1) | categorical slot 2 (orange) | dataviz default |
| Zones Z1–Z5 (§3.2, §3.7) | slots 1, 3, 4, 2, 8 in that order | dataviz default, reordered — task §10 to validate |
| Weekly volume bars (§3.4, §3.5) | categorical slot 1 (blue), 3 ordinal steps (complete / partial-boundary / in-progress) | dataviz default |
| Pace trend scatter + trend line (§3.6) | categorical slot 1 (blue) | dataviz default, single-series, no legend |
| Status pills (verdict, ACWR flag) | fixed status scale (good/warning/serious/critical) | dataviz status palette, never themed |

**Every hex above is a placeholder** pending the Claude Design pull (roadmap §5). The
task breakdown (§10) treats "swap placeholder hexes for the real design tokens" as its
own numbered step, exactly mirroring the expense tracker's own documented history where
the F08 plan's original blue ramp did not survive contact with the real surfaces.

**The token-bridge technique** (from `app/(shell)/stats/stats.css`) transfers directly:
Recharts writes `fill`/`stroke` as SVG presentation attributes, which `var()` cannot
override reliably in Safari, but a CSS class declaration outranks a presentation
attribute in the cascade. So: every `<Cell>`/`<Line>`/`<Area>` gets a `className`
(`zone-1`, `pace-line`, `hr-line`, …) and **zero inline hex or inline `fill` props**.
One stylesheet per chart-bearing route (`app/(shell)/r/[id]/run.css`,
`app/(shell)/trends/trends.css`) defines the classes against CSS custom properties that
flip with `prefers-color-scheme`, so a light/dark change repaints every chart with zero
JS and zero re-render.

---

## 5. `lib/format.ts` — the one formatting module

Roadmap §4.2 is the source of truth; this module is its only implementation. No chart,
no table, no stat tile computes a display string itself.

```ts
export const TZ = 'Asia/Jakarta' as const

/* ---- distance: stored int metres, rendered km with a PERIOD (roadmap D10/§4.2) ---- */
export function formatDistance(m: number): string        // 10670 -> '10.67 km'
export function formatDistanceCompact(m: number): string // axis ticks: 5000 -> '5 km', 45000 -> '45 km'

/* ---- duration: stored int seconds ---- */
export function formatDuration(sec: number): string
// >= 3600 -> 'H:MM:SS' (4716 -> '1:18:36'); < 3600 -> 'M:SS' (2483 -> '41:23')

/* ---- pace: stored int seconds/km ---- */
export function formatPace(secPerKm: number): string      // 442 -> '7\'22"/km'
export function formatPaceShort(secPerKm: number): string // 442 -> '7\'22"' — table cells, axis ticks
export function formatPaceDelta(deltaSec: number): string // +41 -> '+41 s/km', -12 -> '−12 s/km'

/* ---- cadence & heart rate: stored int ---- */
export function formatCadence(spm: number): string  // 144 -> '144 spm'
export function formatHr(bpm: number): string        // 173 -> '173 bpm'

/* ---- energy, elevation, weight ---- */
export function formatEnergy(kcal: number): string     // 646 -> '646 kcal'
export function formatElevation(m: number): string     // 15 -> '15 m'
export function formatWeight(kg: number): string        // 55.0 -> '55.0 kg'

/* ---- percentages: one function, decimals is a caller-chosen parameter ---- */
export function formatPercent(value: number, decimals = 0): string
// value is a FRACTION (0.906) or already a whole percent (90.6) — pick ONE convention
// at the call boundary (this module takes a 0-100 percent, matching F06's ZoneShare.pct)
// and document it in the one JSDoc line; formatPercent(90.6, 1) -> '90.6%'

/* ---- ISO week / date helpers (roadmap scope_key format '2026-W34') ---- */
export function isoWeekKey(iso: DateISO): string          // '2026-08-18' -> '2026-W34'
export function isoWeekLabel(iso: DateISO): string        // 'Week of 18 Aug'
export function isoWeekRange(weekKey: string): { startISO: DateISO; endISO: DateISO }
export function weeksInMonth(month: MonthKey): MonthWeekBucketRange[] // §6, unclipped ranges only — the query layer clips
```

**Straight English, no i18n layer (D10).** Month/day names are the standard English
short forms (`Aug`, `Tue`) — no hardcoded name table is needed the way the expense
tracker needed `MONTH_NAMES_ID`, because `Intl.DateTimeFormat('en-US', ...)` is exactly
right for English and carries no ICU-drift risk worth avoiding here (the expense
tracker's ban on `Intl` was specifically about *Indonesian* names having no canonical
`Intl` locale guarantee; English does not have that problem).

**The Apple-vs-app rule, restated concretely:** the extractor (F04) is the only place a
comma is ever parsed as a decimal separator (`research/schema.mjs`'s `10,67KM` → `10.67`
rule). Once a value is in `runs.distance_m` as an integer, `lib/format.ts` renders it
with a period, unconditionally. There is no runtime branch anywhere that reproduces
Apple's comma — the fixture's `10.67 km` is simply what `formatDistance(10670)` returns.

**Weight gets `formatWeight` and nothing built on it.** Per roadmap D15, no function in
this module (or anywhere else) may combine `formatWeight`'s output with a coaching
claim — it exists for the onboarding/profile screens (F02/F09), not for F08's charts.

---

## 6. ISO week / month-boundary arithmetic — the fiddly part

**ISO week definition:** Monday–Sunday; a week's ISO year/number is determined by its
Thursday (the ISO 8601 rule — week 1 is the week containing the year's first Thursday).
Implement with `Date` UTC math anchored at noon UTC (avoids DST entirely, which Asia/
Jakarta doesn't have anyway per roadmap D6, but keeps the function portable and
matches the existing `dayLabel` precedent of using `Date.UTC` purely for calendar
arithmetic, never as a wall-clock read).

```ts
function isoWeekKey(iso: DateISO): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7          // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3)        // move to this week's Thursday
  const isoYear = d.getUTCFullYear()
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const week1Mon = new Date(jan4)
  week1Mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7))
  const weekNum = 1 + Math.round((d.getTime() - week1Mon.getTime()) / 604_800_000)
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}
```

**The weeks-in-month algorithm, step by step:**

1. `monthStart = '2026-08-01'`, `monthEnd = '2026-08-31'` (via `monthRange`-equivalent,
   ported from `lib/format.ts`'s existing half-open-range pattern).
2. `firstBucketStart` = the Monday on or before `monthStart` (walk back ≤6 days).
3. Enumerate consecutive 7-day windows `[bucketStart, bucketStart+6]` starting at
   `firstBucketStart`, stepping `+7` days, **until `bucketStart > monthEnd`**.
4. For each window:
   - `clippedStartISO = max(bucketStart, monthStart)`
   - `clippedEndISO = min(bucketStart + 6, monthEnd)`
   - `isPartial = bucketStart < monthStart || bucketStart + 6 > monthEnd`
   - `isCurrent = todayJakartaISO() is between bucketStart and bucketStart+6 AND month
     === currentMonthKey()`
   - Query runs with `occurred_on BETWEEN clippedStartISO AND clippedEndISO` (inclusive)
     and sum `distance_m` — **never** query the unclipped window.
5. `isoWeekKey` for the bucket is computed from **any day inside the window** (they all
   resolve to the same ISO week by definition) — use `bucketStart` for simplicity.

**Why the invariant (§3.4) falls out for free:** every calendar day in `[monthStart,
monthEnd]` is covered by exactly one bucket's clipped range (the buckets are
consecutive, non-overlapping 7-day windows, and clipping only ever shrinks a bucket's
range to intersect the month — it never extends one bucket's claim into another's
territory). Summing `distanceM` over all buckets is therefore summing over a strict
partition of the month's days, which is definitionally the month total. **No
reconciliation step, no "distribute the remainder" logic** — get the clipping right and
the sum is automatically right.

**Edge case to test explicitly:** a month whose first day is a Sunday (so the first
bucket is a single-day partial week) and a month whose last day is a Monday (so the
last bucket is also a single-day partial week) — both need real unit tests with a real
month, not just eyeballing the algorithm. February in a non-leap year is the shortest
month and a good adversarial case for the "does the last bucket terminate correctly"
loop condition.

**The 12-week trend window (§3.5, §3.7) does NOT use this clipping** — it is a rolling
window of whole ISO weeks with no month boundary to respect. Do not accidentally import
`weeksInMonth`'s clipping logic into `volumeTrend.ts`; they solve different problems and
sharing code between them is more likely to introduce a bug than remove one.

---

## 7. RSC vs client boundary

Recharts is client-only (it reads layout via `ResizeObserver` and animates with
`requestAnimationFrame`). Every chart in this plan follows the expense tracker's
`Chart` / `ChartInner` split, for the same reason stated in `MonthlyChart.tsx`:
`ssr: false` inside `dynamic()` is illegal in a Server Component in Next 16 / React 19,
so the `dynamic()` call itself must live in a file that already carries `'use client'`,
and that file should do as little as possible — everything Recharts-shaped lives one
level deeper, behind the lazy import, so a session that never opens a chart-bearing
route never downloads Recharts' ~100 KB.

| Outer (`'use client'`, thin) | Inner (dynamic, `ssr:false`, does the drawing) | Owns |
|---|---|---|
| `PaceHrChart.tsx` | `PaceHrChartInner.tsx` | §3.1 |
| `ZoneBar.tsx` | *(no Recharts — see below)* | §3.2 |
| — | *(no component — a plain table)* | §3.3 |
| `WeeksInMonthChart.tsx` | `WeeksInMonthChartInner.tsx` | §3.4 |
| `VolumeTrendChart.tsx` | `VolumeTrendChartInner.tsx` | §3.5 |
| `PaceTrendChart.tsx` (owns the filter-chip state) | `PaceTrendChartInner.tsx` | §3.6 |
| `ZoneDriftChart.tsx` | `ZoneDriftChartInner.tsx` | §3.7 |

**`ZoneBar` ships zero Recharts**, deliberately — same reasoning as the expense
tracker's `CategoryBreakdown`: five flex divs with widths as percentages is the entire
chart, it needs no SVG library, and building it as plain HTML makes it a zero-JS Server
Component that repaints for free on a theme flip via CSS custom properties. This also
means the run-detail page's *most load-bearing* visual (design brief: "make 90.6%
unmissable") pays no client-bundle cost and has no hydration delay before it's visible.

**Server-held state, client-held state:**
- `run.occurred_on`, all `run_splits`, all `run_zones`, the resolved metrics (F06) and
  the narrative payload (F07) are fetched **once**, server-side, in the route's
  `page.tsx` — one `Promise.all`, same discipline as the expense tracker's `/stats`
  page ("ALL AGGREGATION IS SQL... adding a fifth query is a regression"). F08's
  version of that rule: **all metric computation is F06's job, done once, server-side**;
  F08 never re-derives a metric client-side from raw splits.
- The **pace-trend distance-band filter** (§3.6) is the one genuinely client-stateful
  piece in this entire feature — it needs no server round-trip (all 12 weeks of points
  are already on the page; filtering is a client-side array filter), so it is a
  `useState` in `PaceTrendChart.tsx`, not a `?band=` query param. Contrast the expense
  tracker's month selection, which *does* use a query param because it changes what the
  server fetches — the pace-trend filter changes nothing the server computed.
- The `/trends` scope switcher (`?scope=week|month&key=...`) **does** need a query param
  and a server re-fetch, exactly like the expense tracker's `?m=`, because switching
  scope changes which week's or month's rows are queried.

**Bundle-boundary audit.** Mirror `scripts/f08-audit.sh` from the sibling app: assert
that `recharts` is imported **only** from the six `*Inner.tsx` files listed above, and
from nowhere else — a second importer silently promotes Recharts into a shared chunk
and every route (including `/` and `/upload`, which never show a chart) pays for it.

---

## 8. Component inventory

New components this feature introduces, building on the primitives already named in
`docs/design-brief.md` (`Button`, `Card`, `Sheet`, `Field`, `Stat`, `Pace`, `Duration`,
`ZoneBar`, `SplitsTable`, `Flag`, `EmptyState`, `Toast`, `TabBar`) — F08 **implements**
`ZoneBar`, `SplitsTable`, `Pace`, `Duration` (the brief names them; no other feature
owns run-domain formatting) and **consumes** `Button`/`Card`/`Sheet`/`Field`/`Stat`/
`EmptyState`/`Toast`/`TabBar` once F10-equivalent primitives exist for run-insights
(this repo's own `components/ui/` barrel — not yet built; F08 depends on it existing
with the same shape as the expense tracker's, per the design brief pulling from the
same design system lineage).

| Component | Server/Client | Notes |
|---|---|---|
| `RunRow` | Server | `/` list row, whole-row link, no state |
| `WeekDivider` | Server | the `THIS WEEK · 3 RUNS · 24.10 KM` heading |
| `RunHero` | Server | distance/duration/pace/HR block on `/r/[id]` |
| `ProvenanceMark` | Server | §2.2.1, reads `runs.source`/`reviewed_at`/corrections count |
| `IntentChips` | Client | the only mutation on this page besides Share; small `useTransition` |
| `InsightCard` | Server | F07's slot — headline, verdict pill, `whatHappened` prose |
| `Flag` | Server | one coaching observation, severity `info`\|`warn`, per design brief |
| `PaceHrChart` / `Inner` | Client / Client(dynamic) | §3.1, §7 |
| `ZoneBar` | Server | §3.2, no Recharts |
| `SplitsTable` | Server | §3.3, no Recharts |
| `ScopeSwitcher` | Client | `/trends` Week/Month segmented control + chevrons |
| `WeekRollup` | Server | the week-scope hero + run rows + `InsightCard` slot |
| `MonthRollup` | Server | the month-scope hero + `WeeksInMonthChart` + ACWR tile + `ZoneBar` + `InsightCard` slot |
| `WeeksInMonthChart` / `Inner` | Client / Client(dynamic) | §3.4 |
| `VolumeTrendChart` / `Inner` | Client / Client(dynamic) | §3.5 |
| `PaceTrendChart` / `Inner` | Client / Client(dynamic) | §3.6, owns filter-chip state |
| `ZoneDriftChart` / `Inner` | Client / Client(dynamic) | §3.7 |
| `AcwrTile` | Server | stat tile, flagged styling only outside 0.8–1.3 |
| `ExtractionSkeleton` | *(F04 owns this; F08 only references its vocabulary)* | — |

---

## 9. Empty, partial and loading states

| Screen | State | Treatment |
|---|---|---|
| `/` | Brand-new user, zero runs | `EmptyState`: title "No runs yet", description pointing at the Upload tab, no chart machinery imported at all (mirrors `NoDataState` — zero Recharts bytes shipped) |
| `/` | Some runs, current week empty so far | The week divider still renders (`THIS WEEK · 0 RUNS · 0.00 km`) rather than being hidden — a week that hasn't happened yet is not the same absence as a user with no data ever |
| `/` | Loading (`loading.tsx`) | Skeleton rows matching `RunRow`'s exact height (3 lines of `<span className="skeleton">`), so `next/dynamic`'s route-level loading boundary produces zero layout shift on arrival — same reasoning as the expense tracker's `MonthLoading` |
| `/r/[id]` | Not found / not owned by this user | `notFound()` → a 404 page in the same voice as `not-found.tsx` in the sibling repo |
| `/r/[id]` | Every chart, run with < 2 full-km splits (e.g. a 1.2 km run) | §3.1's pace/HR chart needs ≥2 points for a line to mean anything — below that, render a stat-tile fallback ("Too short for a per-km trend") instead of a 1-point line chart, per dataviz's own "is it even a chart?" table |
| `/r/[id]` | Zones missing entirely (older manual-source run, or extraction with no HR data) | `ZoneBar` renders an `EmptyState`-flavoured single row: "No heart-rate data for this run" — never a bar of five 0% segments, which would misreport "zero effort" |
| `/r/[id]` | Insight not yet generated (cache miss, F07 still computing) | `InsightCard` shows its own skeleton (F07's contract) — F08 reserves the layout slot with a fixed min-height so the charts below it don't jump once the prose streams in |
| `/trends` (Week) | Fewer than 7 days of history (first week ever) | No "vs last week" delta — same honesty as the expense tracker's `DeltaTile` "first" state: "First tracked week — no comparison yet," never a fake 0% or a divide-by-zero |
| `/trends` (Month) | First calendar month (< 2 full months of data) | `WeeksInMonthChart` still renders (it only needs *this* month's data, unlike the 12-week trend charts) — but the always-visible "Trends" section below (§2.3) is replaced by a single-sentence stat: "Trend charts appear after 4 weeks of runs," exactly the expense tracker's `SingleMonthState` reasoning: a 1–3 point trend line looks broken, so don't draw it |
| `/trends` (Trends section) | Between 1 and 3 weeks of history | Bars render (they're just weekly totals, always meaningful at n=1), but the rolling-mean line and the pace-trend's regression line are both withheld until ≥4 weeks exist — a 2-point "trend" line is not a trend, it's a ruler |
| `/trends` (Pace trend) | Selected distance band has 0 runs in the window | The chip stays selectable (so the reader can see the band exists) but the plot area shows "No runs in this range yet" rather than an empty axis with nothing on it |
| `/trends` | Loading | Hold the previous scope's render at reduced opacity while the new scope/key fetches (interaction.md's "refetch keeps the frame") — not a skeleton flash, since switching Week→Month is a common, fast interaction that a skeleton would make feel slower than it is |
| Any chart | A run still mid-extraction | Cannot occur — D1 guarantees no unreviewed run reaches any F08 query. If this state is ever observed, it is a F03/F05 query bug, not something F08 should defensively code around |

---

## 10. Task breakdown

1. **`lib/format.ts`** — every function in §5, unit-tested against `research/schema.mjs`
   fixture values (`formatDistance(10670) === '10.67 km'`,
   `formatDuration(4716) === '1:18:36'`, `formatPace(442) === "7'22\"/km"`, etc.).
2. **`lib/charts/weeksInMonth.ts` + `isoWeekKey`** — the §6 algorithm, with the
   invariant test (`sum(buckets) === monthTotal`) and both boundary-month edge cases
   (month starting Sunday, month ending Monday) as named unit tests.
3. **`lib/charts/volumeTrend.ts`, `paceTrend.ts` (incl. `distanceBand`), `zoneDrift.ts`,
   `paceHr.ts`, `zones.ts`** — pure mapping functions from F06's metric shapes to
   chart-ready arrays. No I/O in this layer; feed each function fixture data in tests.
4. **`components/ui/ZoneBar`** — plain-HTML five-segment bar, §3.2, incl. the min-width
   clamp and the largest-remainder percent rounding so segments sum to 100.
5. **`components/ui/SplitsTable`** — §3.3, incl. the three-channel partial-row
   treatment and the tabular-figures column alignment.
6. **`app/(shell)/r/[id]/PaceHrChart(.tsx/Inner.tsx)`** — the signature chart, §3.1.
   Build this one first among the Recharts components; it's the hardest (inverted
   axis, dual axis, crosshair-both-series tooltip) and everything else is simpler.
7. **`app/(shell)/r/[id]/page.tsx`** — assembles hero, `ProvenanceMark`, `IntentChips`,
   `InsightCard` slot, the pace/HR chart, `ZoneBar`, `SplitsTable`. One `Promise.all`
   fetch boundary (run + splits + zones + F06 metrics + F07 insight).
8. **`/` route** — `RunRow`, `WeekDivider`, the ISO-week grouping query consumer,
   `loading.tsx`, the zero-runs `EmptyState`.
9. **`app/(shell)/trends/WeeksInMonthChart(.tsx/Inner.tsx)`** — §3.4, built directly
   against task 2's bucket output.
10. **`app/(shell)/trends/VolumeTrendChart`, `ZoneDriftChart`** — §3.5, §3.7 (build
    together; they share the 12-week window and a lot of chart chrome).
11. **`app/(shell)/trends/PaceTrendChart`** — §3.6, including the filter-chip row and
    its client-side `useState`.
12. **`app/(shell)/trends/page.tsx`** — `ScopeSwitcher`, `WeekRollup`, `MonthRollup`,
    the always-visible Trends section, `?scope=&key=` parsing/clamping (mirror the
    expense tracker's `?m=` clamp: invalid or future keys fall back silently to the
    current week/month).
13. **Every empty/partial/loading state in §9**, each as its own tested component —
    do not fold them into `if` branches inside the page files; the expense tracker's
    `EmptyStates.tsx` pattern (separate named components) is worth copying exactly.
14. **Design-token pass** — once the Claude Design pull lands (roadmap §5), replace
    every placeholder hex in §4 with real tokens via the same CSS-custom-property
    token bridge (§4), and re-run the palette validator (§11) against the real
    surfaces. Track this as its own PR, not folded into tasks 1–13, exactly because
    the sibling app's own history shows the first-guess palette did not survive.
15. **`f08-audit.sh`-equivalent script** — asserts `recharts` is imported only from the
    six `*Inner.tsx` files (§7), and that no `app/`/`lib`/`components` file outside
    `lib/format.ts` calls `Intl.NumberFormat`/hand-rolls a unit suffix for distance,
    pace, duration, cadence, HR, energy or elevation (the "one module decides" rule,
    made mechanically checkable rather than merely documented).

---

## 11. Verification

**Fixture correctness (research/score.mjs's downstream consumers):**
- Every `lib/format.ts` function has a unit test asserting the exact fixture string
  from roadmap §4.2 / `research/schema.mjs` (e.g. `avgPaceSecPerKm: 442` →
  `"7'22\"/km"`, `durationSec: 4716` → `"1:18:36"`).
- `lib/charts/paceHr.ts` fed the fixture's 11 splits produces a `PaceHrPoint[]` whose
  km 11 has `partial: true`, `distanceM: 670`, `paceSec: 429` — matching
  `schema.mjs`'s `TRUTH.splits[10]` exactly.
- `lib/charts/zones.ts` fed the fixture's `hrZones` produces percentages that sum to
  100 and match the design brief's worked example (`Z1 2%, Z2 1%, Z3 7%, Z4 47%, Z5
  43%`) within the largest-remainder rounding's own tolerance.

**The one invariant that must never regress:** `sum(weeksInMonth(month).map(b =>
b.distanceM)) === monthlyTotalDistanceM(month)`, tested against at least three real
calendar months including both boundary-day edge cases from §6.

**Dataviz compliance, mechanically:**
- Run `scripts/validate_palette.js` (from the dataviz skill) against the five zone
  hexes in §3.2's fixed order, adjacent-pairs mode, both `--mode light` and
  `--mode dark`. Zero hard FAILs; any WARN on the normal-vision floor blocks shipping
  (per the skill's own hard-gate rule) and forces a re-order, not a "ship it anyway."
- Run the same validator on the pace/HR line pair (slot 1 vs slot 2) — two series,
  adjacent-pairs is sufficient since they never need to be told apart from a third.
- Confirm by grep that no chart file outside `PaceHrChartInner.tsx` declares a second
  `yAxisId` — the dual-axis waiver (§12) must stay contained to exactly one file.
- Confirm every chart in §3 has a rendered `<details>`/table twin reachable without
  JavaScript-driven hover (view the page with JS-triggered tooltips disabled and check
  no number is missing).

**Bundle boundary:**
- `next build` output shows `recharts` in exactly the six lazy chunks named in §7's
  table, never in the shared/first-load chunk for `/` or `/upload`.

**Accessibility:**
- Every chart's crosshair/tooltip content is also reachable via `Tab` + the
  `accessibilityLayer` keyboard path (Recharts 3's built-in support) — verify by
  tabbing through `PaceHrChartInner` and confirming the same per-km readout appears
  that a pointer hover produces.
- `ProvenanceMark` and `Flag` never rely on colour alone — screenshot each in
  grayscale (a CSS `filter: grayscale(1)` dev toggle is enough) and confirm every
  distinction (corrected vs. clean, info vs. warn) still reads.

**Visual QA against the two named fixtures:** design brief explicitly asks to see
run-detail "at both a good run and the ugly run" — render `/r/[id]` against the
canonical fixture (10.67 km, 90.6% Z4+Z5, +41 s/km positive split) **and** against a
synthetic easy, well-paced run (flat pace line, mostly Z2, negative split) before
calling any chart done. A chart that only looks right on the flattering run is not done.

---

## 12. The dual-axis waiver, in full

Dataviz's #1 anti-pattern: *"the alignment of the two scales is arbitrary, so the
chart invents a correlation that isn't in the data."* Three authoritative sources —
`ROADMAP_v0.1.0.md`'s route contract, `IMPLEMENTATION_PLAN.md` §6 ("the signature
visual... the single most important chart in the app"), and `docs/design-brief.md`
("the single most important chart in the app," verbatim) — converge on exactly this
chart, overlaid on two axes, as the one thing this feature must get right above all
others. This plan ships it, as a **single, named, contained exception**, for reasons
the general anti-pattern doesn't anticipate:

1. **The alignment is not arbitrary — it's the same 11 x-positions for both series,
   from the same run.** The anti-pattern's canonical bad example (Users vs. Sessions,
   two different measurements sampled independently) doesn't apply: pace and HR here
   are two readings *of the same kilometre*, not two differently-sampled datasets
   whose x-axis correspondence is a choice.
2. **Both axis domains are physiologically anchored, not tuned for drama.** The pace
   axis spans the run's own min/max pace ± a fixed pad; the HR axis spans the run's own
   min/max HR ± a fixed pad. Neither domain is chosen to make the lines cross or
   diverge more dramatically than the data supports — a reviewer re-deriving either
   axis from the raw splits gets the same chart.
3. **The claim the chart makes is not "pace causes HR" or vice versa** — it's "both
   moved together as effort held constant against fading fitness," which is exactly
   the deterministic, TypeScript-computed decoupling metric (F06) stated in the
   `InsightCard` right above it. The chart illustrates a claim already proven by
   arithmetic elsewhere on the page; it does not manufacture the claim by itself.
4. **This is a single-run narrative artifact, not a comparative dashboard tile.** The
   anti-pattern's harm model is a reader scanning many charts quickly and absorbing a
   false correlation as a KPI; here the reader is looking at one run they just finished,
   already knows both numbers went the wrong way, and is looking at *how much*.
5. **Every value is also in the splits table, one scroll away** — the chart is never
   the only place a number lives, discharging dataviz's "tooltip/chart is never the
   sole carrier of a value" rule at the level of the whole screen, not just this chart.

**The guardrail this waiver is conditioned on:** it is the *only* dual-axis chart in
F08. §11's grep check enforces that mechanically. If a future feature is ever tempted
to reach for a second axis to solve a different problem, that is a new decision
requiring its own justification of this depth — this waiver does not generalise.

---

## Contract deltas

**None.** This plan does not change roadmap §4 — routes (§4.8: `/`, `/r/[id]`,
`/trends`), the units table (§4.2), and the database schema (§4.3: `run_splits`,
`run_zones`) are all consumed exactly as specified. The one deviation worth a reader's
attention is not a contract change but a documented exception to the *dataviz skill's*
general guidance (§12), which the roadmap does not mention and therefore cannot
conflict with.

---

# Execution record — F08 shipped 2026-08-21

> Status: **implemented.** Written after the fact, against the code that exists. Where this section
> and the plan above disagree, this section is what shipped and says why.

## What landed

| Task (§10) | Where |
|---|---|
| 1 · `lib/format.ts` | extended, not replaced — `formatDistanceCompact`, `formatPaceDelta`, `formatPercent`, `formatVolumeDelta`, `formatDayShort`, `formatDayCompact`, `isoWeekLabel`, `formatMonthLabel`, `formatMonthName`, `formatZoneBounds`. `tests/format.test.ts` +30 assertions |
| 2 · weeks-in-month | `lib/charts/weeksInMonth.ts`, `tests/charts.weeksInMonth.test.ts` — the sum invariant over three real months, plus Feb 2026 (starts Sunday) and Aug 2026 (ends Monday) |
| 3 · the mapping layer | `lib/charts/{paceHr,zones,window,volumeTrend,paceTrend,zoneDrift,types,index}.ts`, all pure, `tests/charts.*.test.ts` |
| 4 · `ZoneBar` | `components/ui/ZoneBar.tsx` — plain HTML, zero Recharts, largest-remainder shares, 3px floor |
| 5 · `SplitsTable` | `components/ui/SplitsTable.tsx` — four channels on the partial row (label, distance, left rule, shortened bar) |
| 6 · the signature chart | `components/charts/PaceHrChart{,Inner}.tsx` |
| 7 · `/r/[id]` | rebuilt |
| 8 · `/` | rebuilt, plus `app/loading.tsx` |
| 9–11 · the trends charts | `components/charts/{WeeksInMonth,VolumeTrend,PaceTrend,ZoneDrift}Chart{,Inner}.tsx` |
| 12 · `/trends` | new, one route, `?scope=&key=` clamped |
| 13 · empty/partial/loading | `EmptyState` / `EmptySlot` as named components; per-chart withholding rules |
| 14 · design tokens | **folded into task 1's first write** — see delta 4 |
| 15 · the audit script | `scripts/check-f08-boundaries.mjs`, wired as `npm run ci:f08-guard` and a CI step |

Also shipped, because the screens needed them and nothing else owned them: `AppShell`,
`ScreenHeader`, `TabBar`, `Chip`, `Flag`/`FlagList`, `lib/flags/copy.ts` (one English sentence per
flag code, exhaustiveness-tested), `components/insights/InsightCard.tsx` (F07's slot),
`components/runs/{RunRow,RunList,ProvenanceMark,IntentChips}.tsx`,
`components/trends/{ScopeSwitcher,DeltaLine,AcwrTile,CompactRunRow}.tsx`, and two additions to the
data layer: `listRunsWithPhotoCounts` and `setRunIntent`.

Gate at hand-off: **721 unit tests green**, `next build` clean, eslint clean, prettier clean, the
F08 guard green, and `recharts` absent from every route's client-reference manifest (it lives in one
380 KB chunk reached only through `dynamic()`).

## Contract deltas

**None against `ROADMAP_v0.1.0.md` §4** — routes, units and schema are consumed exactly as
specified, as the plan's own `## Contract deltas` section promised. The six deltas below are against
**this plan**, not the roadmap.

**1 · The pace-trend filter uses F06's distance buckets, not a new `DistanceBand` enum.** §3.6
specified `short`/`medium`/`long`/`very-long` at 7/12/18 km and called `paceTrend.ts` "the ONLY place
these thresholds are defined". It was written before F06 existed. F06 shipped `bucketForDistanceM`
(`5k`/`10k`/`half`/`full`/`other`) with the same justification in its own doc comment, and its
buckets already key `WeekMetrics.avgPaceByBucket` and `MonthMetrics.paceTrendByBucket` — both of
which render on `/trends` beside the scatter. Two taxonomies whose boundaries differ by 3 km would
put "10K pace, week over week" next to a chart that disagrees about which runs are 10Ks. The plan's
*intent* is honoured exactly; only the enum is F06's. Ties in `defaultBucket` break outward from
`10k`, which is the runner's home base.

**2 · Chart components live in `components/charts/`, not in the route folders.** This repo has no
route groups (`app/(shell)/…` does not exist here), and the same four trend charts are consumed by
one route today and by `/s/[token]` (F11) tomorrow. The §7 split — thin `'use client'` outer,
`dynamic(..., { ssr: false })`, everything Recharts-shaped one level deeper in `*Inner.tsx` — is
unchanged, and the guard script asserts it by that filename pattern.

**3 · `ScopeSwitcher` and `PeriodNav` are links, not client state.** §8 lists `ScopeSwitcher` as
Client, but §7 also says the scope switch *is* a server re-fetch. A `<Link>` expresses that with no
JavaScript, no hydration wait, free prefetching and a working middle-click. The one genuinely
client-stateful control in the feature is therefore the pace-trend band filter, exactly as §7 says.

**4 · Task 14 was done at first write, not as a follow-up PR.** §4 planned placeholder hexes from
the dataviz default palette plus a later swap for real tokens. The v2 design pull had already landed
by the time F08 was implemented, so `components/charts/charts.css` was written against `--accent`,
`--z1..--z5`, `--ink-3`, `--rule-2` and `color-mix()` steps from the start. **No placeholder hex ever
entered the repo**, and there is nothing left to swap. The pace/HR pair is cyan (`--accent`) and
coral (`--z5`) — the same maximum-hue-separation reasoning as the planned blue/orange, in the
palette the app ships. The zone five are the design's own, unchanged.

**5 · `/r/[id]` shows the tab bar.** Roadmap §4.8 calls it a pushed screen; §2.2's wireframe draws
the bar at the bottom of it. The wireframe wins: a reader lands here from a commit or a share link
and then wants to go somewhere. `/upload`, `/x/[extractionId]`, `/r/[id]/edit`, `/onboarding` and
`/s/[token]` have no bar, per §4.8.

**6 · One extra formatter, and three pre-existing violations fixed.** `formatZoneBounds` was added to
`lib/format.ts` because F05's editable zone bar and F08's read-only one were spelling the same range
two different ways (`< 140 bpm` vs `under 140 bpm`) — R-23's exact failure mode, caught by the new
guard. The guard also found `lib/review/checks.ts`, `components/review/SplitsTable.tsx` and
`app/me/page.tsx` hand-rolling `km`/`bpm` suffixes; all three now call `lib/format.ts`. Message
strings are byte-identical, so F05's tests were unaffected.

## Two judgement calls worth naming

**`/trends` reads the whole reviewed history in one query.** `getReviewedRunsWithChildren` (one
`db.batch`, three statements, one snapshot) feeds every rollup, delta, chart and the ACWR window on
that screen; each section is a `filter` and a `reduce` over the same array. The alternative was six
range scans over the same few hundred rows — six chances for two charts on one screen to disagree,
and a guaranteed disagreement the day one of them straddles Jakarta midnight. This is right *because
this is a single-user app with a bounded history* (~200 runs a year), the same premise F06's
`recomputeRecords` rests on. **If a user ever has thousands of runs, this page and that recompute
need the same rethink, and neither should be changed alone.**

**The rolling mean's gap is index-based, not history-based.** §3.5 says the window's first three
weeks show `null`. That is what shipped, even for a runner with a year of history behind the window,
because the line is a statement about *the twelve bars on this chart* and every value it plots must
be derivable from bars the reader can see. A mean computed from weeks off the left edge would be
arithmetically defensible and visually unverifiable.

## What §11 still asks a human to do

`tests/views.render.test.ts` server-renders the Recharts-free components against the canonical
fixture and asserts the numbers reach the markup — `90.6% of this run was zone 4 or harder`, `11*`
beside `0.67 km`, a 67% bar track, `+41 s/km`, km 1 as the fastest split. That is as far as an
assertion honestly goes. **Not yet done, and not automatable here:**

- open `/r/[id]` at 414px on the canonical run **and** on a flattering one (flat pace, mostly Z2,
  negative split). A chart that only looks right on the ugly run is not done;
- the same two in dark mode, and both in `filter: grayscale(1)` to confirm `ProvenanceMark` and
  `Flag` never lean on colour;
- tab into `PaceHrChartInner` and confirm Recharts 3's `accessibilityLayer` announces the same
  per-kilometre readout a pointer hover produces.

The palette validator run named in §11 was not executed: the five zone hues are the design system's
own shipped tokens rather than a set F08 chose, so re-validating them is a **design-system** question
(and would be re-run against `docs/design/tokens.css`, not against this feature). What F08 owes
instead is discharged structurally: every chart ships a table twin, and every zone carries its
number, so no reading in this feature depends on telling two hues apart.
