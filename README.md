# Run Insights

Screenshot your Apple Watch run. A vision model reads it. Get coaching-grade analysis of that
run, that week, and that month.

**[runins.site](https://runins.site)** · v0.1.0 · shipped: **F01** foundation, **F03** data layer, **F02** auth &
profile, **F04** ingest & vision extraction, **F05** review & correction, **F06** metrics & records,
**F08** views, charts & trends, **F07** insights, **F09** badges & achievements, **F11** sharing,
**F10** badge art — all 22 patches generated, promoted and on the shelf. **v0.1.0 is feature-complete.**

```
1–3 screenshots  ──►  glm-4.6v extraction  ──►  REVIEW & CORRECT  ──►  runs
   │                   (background, ~33 s)      /x/[extractionId]        │
   └──► extractions ──► run_photos              (mandatory — D1)         ▼
                                             deterministic metrics ──► glm-5.3 narrative
                                                        │
                                                        ├──► personal records
                                                        └──► badge evaluation
```

---

## Why this repo starts with documents

Every number below was **measured against the live API before a line of application code was
written**, using three real Apple Fitness screenshots and a hand-transcribed 108-field ground
truth. The scripts are in [`research/`](research/) and re-run in one command.

That research killed the original plan. It was going to use GLM-5.2, which turns out to be
text-only, on an endpoint that **accepts images, returns HTTP 200, and silently discards them** —
after which the model invents plausible numbers. Asked for the distance in a screenshot showing
10.67 km, it answered *"5.00 km"*, confidently.

| What was measured | Result |
|---|---|
| Extraction accuracy, 3 screenshots → 108 fields | **108/108, five runs in a row** |
| Median latency | 33.7 s |
| Best preprocessing | JPEG q80 @ 560w — 170 KB, 3,277 tokens, no accuracy cost |
| Cost per run | ~$0.006 |
| LLM computing its own metrics | **aerobic decoupling came back −14.1% when the truth is +12.3%** |

Re-measured against the shipped code on 2026-08-21, with the production prompt rather than the
research one:

| What was measured | Result |
|---|---|
| Accuracy, production prompt @ 560w/q80 | **108/108, three runs in a row** · median 38 s · 3,628 tokens |
| The 560w recipe, in actual pixels | 739×1600 → **560×1212**, short edge exactly 560, 55–70 KB |
| A text-only repair round-trip | 25–35 s, ~1,070 completion tokens — about what the primary call costs |

That last row is the uncomfortable one: two calls of that size do not fit Vercel Hobby's 60 s
ceiling, so the repair is best-effort and usually skipped. `lib/extract/constants.ts` says so at
the constant.

That last row is why every number in this app is computed in TypeScript and the LLM only writes
prose about numbers it was handed.

---

## Why 108/108 still means a human checks every run

The same measurement run that scored 108/108 five times also produced the number F05 is built
around: the **parallel-call variant scored 102/108**, and its worst miss was reading a split's
pace as `436` s off a cell that plainly says `6'36"` (396 s) — while getting the other 101 fields
right, including the other ten splits. **A model can be locally wrong and globally convincing.**
Nothing about 107 correct fields signals that the 108th is broken.

At ~17 runs a month that is roughly one wrong field a month, and a wrong split does not fail
loudly: it sits in `runs`, feeds `avg_pace_sec`, feeds every rollup, every personal record and
every badge built on it, until a chart looks odd and nobody can say which of forty runs is at
fault. So extraction never auto-saves (D1), and `runs.reviewed_at` has exactly one writer.

Review would be worthless if it were 108 taps, and the thing that makes it one tap instead is
that **confidence is derived from arithmetic, not from the model**. Four quantities are supposed
to agree by construction — splits sum to the duration, zones sum to the duration, distance × pace
is the duration, and a partial final kilometre's pace matches its own time. When they agree,
nothing is flagged and confirming is a single tap. When they don't, the disagreement points at
the wrong number far more precisely than a self-rated confidence score could, because it comes
from the data rather than from the process that produced the error.

The canonical fixture passes all four, and `tests/review.checks.test.ts` holds them to both
directions: green on the real ground truth, red on the misread that actually happened.

---

## Every number is computed in TypeScript

`research/control.mjs` handed `glm-5.3` the canonical fixture's raw splits **and the exact
formulas**, and asked it to do six pieces of arithmetic. It got two wrong, and one of them was not
a rounding slip:

| Metric | LLM returned | Truth |
|---|---|---|
| aerobic decoupling % | **−14.1** | **+12.35** |
| % time in Z4+Z5 | 88.3 | 90.60 |

The decoupling sign is **backwards**. Shipped as-is, the narrative would have congratulated this
runner on aerobic fitness that "held up" during the exact run where their heart rate pinned at 90%
of max while their pace faded from 6'36" to 8'00". So `lib/metrics/*` computes every number, and
the model's only permitted operation on one is to copy it into a sentence.

The canonical fixture pins eleven values and fires exactly six flags — `HIGH_DECOUPLING`,
`TOO_MUCH_HARD`, `POSITIVE_SPLIT`, `CADENCE_FADE`, `VERY_HIGH_AVG_HR`, `FAST_START` — no more, no
fewer. Two of those assertions are for values the code must NOT produce: a cadence fade of −9 spm
and a split drift of +35.2 s/km, which are what you get if the final **partial** kilometre is
allowed into a statistic that aggregates split rows (D14). The wrong cadence number is exactly
half the true −18 and looks entirely plausible on a chart, which is why the tests pin constants
rather than signs.

Personal records are recomputed wholesale on every commit, never incremented: a correction that
drops a run below a qualifier has to be able to **remove** a record, and an upsert cannot express
that (R-10).

---

## One chart is allowed to break the rules, and it argues its case

The `dataviz` guidance names dual-axis charts as its top anti-pattern: two scales whose alignment
is arbitrary invent a correlation the data does not contain. Run Insights ships exactly one, on
`/r/[id]`, and the exemption is fenced rather than assumed (F08 §12, upheld by **R-25**):

- pace and heart rate are **two readings of the same kilometre**, not two independently sampled
  series whose x-axis correspondence is a choice;
- both domains are anchored to the run's own min and max plus a **fixed** pad, never a percentage
  one that would widen with the run's variance — a reviewer re-deriving either axis gets this chart;
- the pace axis is **inverted, and says so in words** (`PACE (FASTER ↑)`), because "up is faster"
  everywhere in this app is a global rule, not a per-chart trick;
- the claim it makes is one `lib/metrics/*` already proved arithmetically and the `InsightCard`
  above it states in prose — the chart illustrates a finding, it does not manufacture one;
- every value it plots is also printed in the splits table one scroll below it.

`npm run ci:f08-guard` fails the build if a second `yAxisId` appears anywhere, if `recharts` is
imported outside the six lazily-loaded `components/charts/*Inner.tsx` files (a seventh importer
taxes `/` and `/upload` — screens with no chart at all — with ~100 KB), or if any component
hand-rolls a unit suffix around `lib/format.ts`. The waiver does not generalise, and the check is
what keeps that true.

Everything else follows the ordinary rules, including the ones that are easy to skip: five zone
percentages that sum to exactly 100 by largest-remainder apportionment, a 4-week rolling mean whose
first three points are a **visible gap** rather than a guess, a pace-trend regression withheld until
four weeks exist, a distance-band filter so a 5 km can never be plotted next to a 15 km, and a
table twin under every chart so no number is reachable only by hovering a thumb over a phone.

---

## The badge art is made by hand, one patch at a time, and the tooling enforces that

D12: badge art is generated offline and committed. There is no runtime image generation anywhere
in the app — at ~$0.04 and 4–5 minutes per image, a shelf that drew itself on demand would be a
bill and a latency budget in exchange for nothing a build step can't do better.

So F10 is **machinery first, pictures second**: a skill (`.claude/skills/generate-badge/`), a
style contract, four Python tools and a CI guard — then 22 patches generated one at a time, each
judged by eye before promotion. The deck took **35 generations for 22 badges** (~$1.40), inside
the plan's ~60/$2.40 worst case.

- **`style.md` is an interface, not a document.** `gen_badge_art.py` parses its
  `<!-- STYLE BLOCK vN -->` and `<!-- SCENES -->` fences, and **refuses to start** unless the scene
  keys are exactly `BADGE_CATALOG`'s 22. A badge with no scene, or a scene with no badge, is a
  startup error rather than a surprise 22 images later. `npm run badges:check` asserts the same
  parity from the other side, in CI, where no API key exists.
- **One badge per invocation, never a batch loop.** The three-attempt cap and the look-at-it step
  are per badge; a loop makes both ceremonial, and it would spend the full worst-case budget
  before a human had judged a single patch.
- **Nothing is judged from the 1024² master.** `check_badge_art.py` writes a contact strip of the
  badge at **40 px and 220 px against the app's real `--paper` in both themes**, plus the patch
  edge unrolled (where lettering hides) and the subject at 2× (where anatomy hides). At 1024 every
  stitch looks considered, and the app never draws it at 1024.
- **Ten measurements, and every band is a labelled guess.** The tool this descends from re-derived
  its thresholds from a thirteen-badge distribution; this deck has zero images, so each band says
  `(guess, 0 badges)` in place and the standing rule is: *do not tighten anything until six badges
  are approved.* A threshold that fails on something harmless is a threshold somebody comments out.
- **Same craft, opposite medium.** Every constraint the reference deck earned — no text, full
  bleed, one silhouette, one subject, an anchor image every later badge is generated against —
  survives untouched, because none of them is about ink and paper. Everything that *is* about ink
  and paper was rebuilt: the substrate check inverts (navy is cool, dark, and deliberately
  textured, so its variance gets a **floor** as well as a ceiling), the "unauthorised blue/violet"
  guard is deleted outright rather than re-tuned (the substrate *is* navy, so it would fail every
  correct candidate), and the ring-geometry fit is replaced entirely — this deck's outer shape is a
  shield, a hexagon, a chevron or a rounded triangle by design, and a radial harmonic fit against
  a chevron is close to meaningless.
- **`tools/make_badge_control.py` draws synthetic patches from the style block's own hex values**,
  so the measurement tool can be exercised — and its floors shown to actually catch a flat,
  weaveless "sticker" fill — without an API call. Controls are never a source for re-deriving a
  band; they are drawn by arithmetic and a real candidate is photographed thread.

Three things the deck taught that the plan could not have known, all recorded in its §12:

- **The anchor is a ruler, not a stencil.** The plan made every badge generate against
  `_anchor.png`, reasoning that twill tone and stitch gauge are continuous quantities a prompt
  specifies loosely. Sound a priori, false for this model: three generations of one badge from an
  identical prompt showed `input_references` transferring the *subject* hard (it redrew the
  anchor's rooster instead of a doughnut, twice) and the *cloth tone* not at all — 9.5 and 9.3
  points of drift with the anchor, **1.9 without it**. What holds the deck together is the style
  block plus one fixed seed. The anchor's real job is check 9's baseline, which is how this was
  caught.
- **Two instrument fixes, neither a loosened band.** The twill check was sampling a fixed outer
  frame that a 96%-tall patch reaches into — it was measuring the patch and calling it cloth. And
  check 9a was comparing a hexagon's bounding box against a shield's: the first two hexagons
  "drifted" 8.8% and 9.3% while landing 0.4 points apart *from each other*. Both were fixed at the
  instrument, with every already-passing badge unmoved — the signature of a correctness fix rather
  than a capitulation.
- **The contact sheet earned its place on the first run.** `century_club` and `double_century`
  both ended up as "a vertical post with something wound round it" — the exact escalation-pair
  collision the audit predicted, arrived at by a route it did not. Every per-badge check passed
  it; the whole shelf in one line of sight caught it in a second.

Filenames under `public/badges/` carry the first 8 hex of their master's SHA-256, which is the only
reason `next.config.ts` may serve them `immutable` for a year: regenerating a patch changes its
bytes, its hash and its URL, so every cache misses correctly. `npm run badges:check` recomputes
that hash from the master and sweeps for orphans, which is what turns "the shipped file is the
approved master" from a hope into a checked statement.

---

## The documents

| File | What it is |
|---|---|
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | The feasibility record. Endpoint matrix, measured accuracy, the token-floor trap. Authoritative on everything it measured. |
| [`ROADMAP_v0.1.0.md`](ROADMAP_v0.1.0.md) | Scope, the 17 locked decisions, and §4 — the authoritative shared contract every feature builds against. |
| [`RECONCILIATION_v0.1.0.md`](RECONCILIATION_v0.1.0.md) | 39 rulings arbitrating eleven plans written in parallel. **Supersedes any individual plan file.** |
| [`docs/plans/F01`–`F11`](docs/plans/) | One comprehensive plan per feature, ~11,700 lines. |
| [`docs/design/DESIGN_INTEGRATION.md`](docs/design/DESIGN_INTEGRATION.md) | What came back from Claude Design and how it overrode the plans. |
| [`docs/google-auth-setup.md`](docs/google-auth-setup.md) | Google OAuth + DomaiNesia DNS, step by step. |
| [`.claude/skills/generate-badge/`](.claude/skills/generate-badge/) | F10's badge-art skill: the loop, and `style.md` — the parsed style contract and all 22 scenes. |
| [`assets/badges/README.md`](assets/badges/README.md) | The three human acts between a generated candidate and a shipped patch. |
| [`research/`](research/) | The live feasibility harness and the 108-field fixture. Stays in the repo; `score.mjs` runs in CI. |

**Read `RECONCILIATION_v0.1.0.md` before any plan file.** The eleven plans were written
concurrently and three of them contradicted each other; several also found real bugs in the
roadmap they were built against — a duplicate-upload guard that stopped guarding on NULL, an
acute:chronic workload ratio algebraically pinned at 0.25 that could never fire, and a %HRmax
figure computed against a formula the runner's own watch had already disproved.

---

## The stack

Next.js 16 App Router · Drizzle + Neon Postgres · Vercel Blob · Auth.js v5 (Google) · Recharts ·
Tailwind v4 · Vitest · Vercel.

Two LLM clients, deliberately: **`glm-4.6v`** for vision on z.ai's OpenAI-shaped coding endpoint
(plain `fetch` — the Anthropic SDK cannot be pointed at it), and **`glm-5.3`** for narrative on
the Anthropic-compatible endpoint. Badge art is generated offline by a skill against
`qwen/qwen-image-3-pro` and committed; nothing generates images at runtime.

## Build order

`F01` → `F03` → `F02` → **`F04` → `F05`** → `F06` → `F08` → `F07` → `F09` → `F11` → `F10`

**F04 (extraction) and F05 (review) are the project.** Everything else is competent CRUD over a
good schema.

## Getting started

```bash
cp .env.example .env.local     # then fill it — see docs/google-auth-setup.md
node research/show-metrics.mjs # deterministic metrics, no API key needed

npm run db:smoke               # is Neon reachable on the pooled string?
npm run db:migrate             # apply drizzle/ to the database
npm test                       # unit suites; never touches a database, never calls an LLM
TEST_DATABASE_URL=<pooled url> npm run test:int   # the real-Postgres suite
npm run test:live:vision       # opt-in: calls glm-4.6v for real. Costs money

npm run badges:check           # F10's deck: key boundary, style.md ↔ catalog parity, hashes
python3 tools/gen_badge_art.py --dry-run --all   # every prompt, no key read, nothing sent

npm run icon:assets            # rebuild every shipped app icon from the committed silhouette
python3 tools/gen_app_icon.py --all --dry-run    # the icon prompts, no key read, nothing sent
```

### The home-screen icon

"Add to Home Screen" is a real install, not a bookmark, and the two things that make it one are
`app/manifest.ts` (`display: 'standalone'`) and `app/apple-icon.png` (the `apple-touch-icon` Safari
reads). Both read their names and colours from `lib/pwa.ts`, and `tests/pwa.install.test.ts` asserts
the whole contract — including that each icon file exists, is the size it claims, and carries no
alpha channel, because iOS mattes a transparent icon onto black.

`lib/pwa.ts` is also where to look before switching `statusBarStyle` to `'black-translucent'`: it is
`'default'` on purpose, because almost nothing in this app pads `env(safe-area-inset-top)` yet and
translucent would slide the screen titles under the notch.

The art is two steps, offline and committed, the same rule D12 sets for badge art — no runtime image
calls, no key on the server:

```bash
python3 tools/gen_app_icon.py plain      # candidates → assets/icon/_candidates/ (gitignored)
cp assets/icon/_candidates/plain.aNN.png assets/icon/silhouette.png   # pick one, by looking at it
npm run icon:assets                      # compose + write public/icons/* and app/*-icon.png
```

The split is deliberate: the model draws the runner, and `tools/make_icon_assets.py` draws the
ground, the zone bar, the scale and the centring from `globals.css`'s real tokens. It has to, because
the model returned `#2dc1f9` for a `#23beeb` ground, desaturated the zone colours, and twice ignored
an instruction to keep the bar clear of the bottom edge — where Android's circular crop would have
eaten it. Regenerating after a palette change makes the icon follow the design system instead of
drifting from it, which is the same argument `scripts/gen-og-default.mjs` makes for the share image.

Reviewing is `/x/[extractionId]`, not `/r/[id]/review` — under R-1 no `runs` row exists until the
commit, so there is no run id to address yet. `/r/[id]/edit` is the post-review correction, and it
is the same component tree pointed at a different baseline: the stored run rather than the model's
original guess. Both write `extractions.corrections`, append-only, which is what turns a month of
human fixes into a measured error profile (`getExtractionErrorProfile`).

Uploading a run needs a Vercel Blob store linked to the project (`BLOB_READ_WRITE_TOKEN`).
`scripts/f04-e2e-probe.mjs` walks the whole ingest pipeline once against the real Blob store, the
real model and the real database, then deletes what it made:

```bash
node --env-file=.env.local scripts/f04-e2e-probe.mjs path/to/a-screenshot.png
```

Sign-in needs a Google OAuth client — `docs/google-auth-setup.md` has the console walkthrough.
Leave `AUTH_URL` **empty** locally and on preview; it is production-only, and Auth.js infers the
origin from the request everywhere else.

`npm test` is safe by construction: `tests/integration/**` is excluded unless
`VITEST_INTEGRATION=1`, `tests/live/**` unless `LLM_LIVE_TEST=1`, and every other suite runs
against a recording fake driver that generates real SQL and sends none of it anywhere. The vision
client is exercised with an injected `fetch`, so the token-floor guard is tested against the
measured failure body without a network.

The live vision suite needs only a real `LLM_API_KEY`: the three canonical screenshots are
committed under `research/fixtures/screenshots/`, both as captured (739×1600) and at the 560w/q80
recipe the browser actually uploads. It last scored **108/108 three runs running**, median 38 s —
see `docs/plans/F04-ingest-extraction.md` §13 for the full measurement table.

## Licence

Personal project. No licence granted.
