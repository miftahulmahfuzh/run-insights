# Claude Design brief — Run Insights

**Domain:** [runins.site](https://runins.site) · **Version:** v2, rewritten 2026-08-20 after
`ROADMAP_v0.1.0.md` and `RECONCILIATION_v0.1.0.md` landed.

> v1 covered eight screens. This version adds the profile, the badge shelf, the records table and
> the public share page, and corrects the route names to match R-1.

## How to use this

1. Go to **claude.ai/design** and create a **new Design System project** named `Run Insights`.
2. Paste everything below the rule as your first message.
3. Iterate there until you're happy.
4. Come back to Claude Code and say *"pull the design"* — it reads the project through the
   `DesignSync` tool (`list_projects` → `list_files` → `get_file`) and maps it onto the tokens
   and primitives in the feature plans. No copy-paste.

> The iOS constraints below (16px minimum input font-size, safe-area insets, 44pt tap targets,
> `100dvh`) **win** over any conflicting design output. Everything else follows the design.

---

## The prompt (paste this into Claude Design)

I'm building a personal running-analytics web app called **Run Insights**, at **runins.site**.
I need a small, coherent design system for it. Design **mobile-first for an iPhone XS Max —
414 × 896 CSS px, notch at the top, home indicator at the bottom.** It is a phone app that
happens to run in Safari. Desktop only needs to not look broken: centre the mobile column on a
wide viewport.

**Who it's for:** one person — me. I'm 30, and I run four times a week, about 10.5 km each time,
roughly 180 km a month. I track every run on an Apple Watch and the data lands in the iOS
Fitness app.

**The signature interaction:** instead of typing anything, I screenshot my Apple Fitness workout
— the summary screen, the splits table, the heart-rate screen — and drop all three into this
app. A vision model reads them and turns them into structured data. Then I get coaching-grade
analysis of that run, that week, and that month.

**The single most important thing: this is a reading app, not a dashboard.** I open it after a
run to *understand what happened*. It should feel like a coach's notebook — calm, literate,
confident — not a fitness tracker covered in rings, streaks, confetti and gradients. No
gamification pressure. No "You crushed it! 🔥". If you're deciding between adding something and
leaving it out, leave it out.

**The one exception to that restraint is the badges**, which are deliberately loud and a bit
absurd. That tension is intentional — see the badge section near the end. The quiet app is the
room; the badges are the one wall with something silly pinned to it.

### The data is dense and that's the point

One run produces: distance, duration, average pace, average and max heart rate, cadence,
elevation, active and total calories, **eleven per-kilometre splits each with its own pace, heart
rate and cadence**, and **five heart-rate zones with a duration each**. The interesting screens
are the ones that make that density legible.

Numbers are the hero content. Please:
- Pick a typeface with genuinely good **tabular figures** — the splits table lives or dies on
  columns of `7'22"` and `173` lining up.
- Give me a clear typographic hierarchy: the hero distance/pace, the per-split row, the small
  metric label.
- Pace is written `7'22"`, heart rate `173`, distance `10.67 km` with a **period** decimal
  separator (Apple shows a comma; the app is in English and stays internally consistent).

### The honesty rule — design this in, don't bolt it on

The vision model reads my screenshots, and it can be wrong. Every extracted run is
**reviewable and correctable before it is saved**, and a saved run shows *where its numbers came
from*. I need:
- A **review state** after upload: the extracted values shown next to the screenshot they came
  from, every field tappable to correct.
- A quiet, permanent **provenance mark** on a saved run — this number was read from an image —
  and a distinct treatment for a field I corrected by hand.
- An **attention treatment** for fields worth checking. The app cross-checks its own arithmetic
  (the eleven split times should sum to the total duration; the five zone durations should too)
  and points at the fields implicated when they don't. That's a much better signal than the model
  guessing at its own confidence, and it's the thing the review screen is organised around.

Treat this as a first-class part of the visual language, not an error state.

### Screens to design

1. **Sign in** — nearly empty: app name, one line of purpose, one "Continue with Google" button.
2. **Onboarding** — asked once, on first login: age, height, weight. Explain in one line *why*
   (it calibrates heart-rate zones and effort estimates). Skippable and later editable. It must
   not feel like a medical intake form.
3. **Upload** — drop or pick 1–3 screenshots. Design the **waiting state carefully**: extraction
   takes about 30 seconds, far too long for a spinner. Design a skeleton of the run card it is
   about to produce, with a sense of progress. Don't fake a progress bar — there's nothing real
   to measure.
4. **Review** — the correction screen above. Second-most-important screen in the app. It has to
   let me confirm ~100 extracted values without feeling like 100 taps: most things collapsed and
   quiet, the cross-check failures surfaced and jumpable.
5. **Run detail** — the hero run card (distance, duration, pace, heart rate), then the analysis
   prose, then the charts:
   - a **pace-per-kilometre chart with heart rate overlaid on a second axis** — the single most
     important chart in the app; it shows pace fading while heart rate climbs. **Pace axis is
     inverted so "up" means "faster."**
   - a **heart-rate zone bar** showing where the time went
   - the **splits table**. Design the partial final kilometre distinctly — km 11 is 0.67 km, not
     a full one, and it must never read as a sudden sprint.
6. **Week** — four runs in a week: weekly volume, the runs compared, a verdict on the week.
7. **Month** — about 17 runs and 180 km. **A bar chart of distance per week within the selected
   month**, with the month total as the hero number, plus the month's analysis. Design the empty
   and partial-month states.
8. **History** — every run, newest first, grouped by week.
9. **Profile** — lifetime distance as the hero number, total runs, total time; then the
   **personal records** table; then the **badge shelf**. Ten records: longest distance, longest
   duration, fastest 5K pace, fastest 10K pace, fastest single kilometre, most calories, most
   elevation, highest cadence, highest max heart rate, and best-paced run. A record row shows the
   value, the date, and what it beat.
10. **Public share page** — what a friend sees when I send a link over WhatsApp. Read-only, no
    navigation, no edit controls, no sign-in prompt. The run, its charts, its splits, the
    analysis prose, and the screenshots. No owner identity. Design a quiet footer line.

### Components I need

`Button` (primary / secondary / ghost / destructive, plus loading and full-width variants) ·
`Card` · **`Sheet`** — a bottom sheet, the most-reused interactive piece, used for correcting a
field · `Field` — labelled input with error text · `Stat` — a label-over-value metric tile in
hero / medium / small sizes · `Pace` and `Duration` read-only formatted values · `ZoneBar` — the
five-zone horizontal stacked bar · `SplitsTable` · `Flag` — one coaching observation with a
severity (info / warn) · `RecordRow` · `BadgeTile` — earned and locked states · `EmptyState` ·
`Toast` · `TabBar` — a 4-tab bottom bar: **Runs** / **Upload** (centre, raised) / **Trends** /
**Me** · the extraction skeleton · the provenance and attention marks above.

### The five heart-rate zones

Distinct colours that stay legible in **both light and dark mode**, work as chart series colours,
and read as a **sequence** — zone 1 easy through zone 5 maximum — not five unrelated hues.
Apple's own are blue → green → yellow → orange → pink; you don't have to copy them, but the
ordering must be obvious at a glance.

A real example to design against — one of my actual runs, and not a flattering one:

| zone | range | time | share |
|---|---|---|---|
| 1 | <140 bpm | 1:44 | 2% |
| 2 | 141–151 | 0:25 | 1% |
| 3 | 152–163 | 5:03 | 7% |
| 4 | 164–174 | 36:05 | 47% |
| 5 | 175+ | 33:18 | 43% |

Ninety percent of that run was in zones 4 and 5. The zone bar has to make that **unmissable
without scolding me about it.**

### The badges — the one loud thing

22 achievement badges, deliberately funny. The artwork is generated separately as
**1970s embroidered running-club patches** — dark navy twill, five saturated thread colours,
satin stitch, a raised merrowed border, and silhouettes that vary per badge (shield, hexagon,
chevron, rounded triangle). **You are not designing the patches themselves** — you are designing
the shelf they sit on, the earned/locked treatment, and the moment one is awarded.

Sample titles, so you can judge the register: *Early Bird*, *Fashionably Late*, *Self-Reward
Achieved*, *Finished the Job*, *Metronome*, *Went Out Like a Hero*, *Citizen of Redline
Republic*, *Legs Have Left the Chat*, *Groundhog Day*, *Tourist*, *Century Club*, *Half-ish*,
*Sweat Equity*, *New Ceiling*, *Consistency Gremlin*, *Dawn Patrol*, *The Long Way Home*.

**The tone rule, and please hold the line on it: the jokes are about the run, never about the
runner.** "Legs Have Left the Chat" is a joke I'm making about my own cadence data. It must
never read as the app being snide at a stranger. Design the award moment as dry and pleased, not
triumphant — no confetti, no fanfare, no full-screen takeover.

Unearned badges are **visible but locked**, with their condition readable. Design that locked
state so it invites rather than nags.

### Constraints you must respect

- **Light and dark mode**, driven by the system setting. Define every colour token in both —
  never define a colour only inside a dark-mode block.
- **Safe areas**: fixed headers and the bottom tab bar must account for the notch and home
  indicator.
- **Every input at 16px minimum font-size** — Safari zooms the page when you focus a smaller one.
- **Minimum 44 × 44pt tap targets.**
- Colour must never be the only thing carrying meaning — zones need a number or label too.
- Keep the shadow and border-radius vocabulary tiny. Two or three steps, not eight.
- Charts must be legible at 414px wide with a thumb covering part of them.
- The embroidered badge artwork is saturated and textured; **the rest of the app must not
  compete with it.** The shelf is a quiet grid.

### Deliver

Foundations (colour tokens light + dark, type scale, spacing, radius, the zone palette), then
the components, then the ten screens as a prototype. Show me the run detail screen twice — once
for a good run, once for the ugly one above.

---

## Where this landed — v2, 2026-08-20

This brief is the *prompt*, deliberately open-ended about aesthetics ("pick a typeface with
genuinely good tabular figures", "keep the shadow and border-radius vocabulary tiny"). It has been
run twice, and the second run replaced the first wholesale rather than refining it:

| | v1 | **v2 — current** |
|---|---|---|
| Surface | warm cream `#f0ede4` | **sky `#c9e9fb`, white cards** |
| Accent | pine green `#2f5d50` | **cyan `#23beeb`** |
| Type | Georgia prose + system mono for numbers | **Poppins only**, 500 / 600 / 700 |
| Zones | muted earth | **candy, `#38c3ee` → `#ff5e5b`** |
| Radii | 2 / 6 / 10 | **8 / 14 / 22** |
| Elevation | *no shadows anywhere*, hairline + card-over-paper | ***no borders on surfaces***, tinted fill or soft shadow |

**Re-running this brief from scratch will not reproduce v2** — it is under-specified on exactly
the axes that changed. If you want to iterate rather than restart, start from the existing canvas
(`01 Foundations`, `02 Components`, `Run Insights v2`) and from `docs/design/tokens.css`, which is
the normalised copy of what shipped.

Two things below survived both runs unchanged and should be treated as settled, not preferences:
the **iOS constraints** (16 px minimum inputs, safe-area insets, 44 pt tap targets, `100dvh`) and
the **number formats** (`10.67 km`, `1:18:36`, `7'22"`, `173`, `144 spm`, period decimal
separator). The **honesty marks** survived too, re-expressed from underlines to chips — see R-46.
