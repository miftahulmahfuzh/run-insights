# Run Insights — implementation plan v0.1.0

**Domain: [runins.site](https://runins.site)** (registered at DomaiNesia).

> **Amended by `RECONCILIATION_v0.1.0.md`** — see R-3 (the fixture's %HRmax is 91.5%, not
> 92.5%) and R-6 (the ACWR formula below was unfireable as originally written).

> **Status: feasibility proven against live API, 2026-08-20.** Every claim in §1 was measured
> with the author's own z.ai key against the three real Apple Fitness screenshots, not
> estimated. The scripts that produced these numbers are in `research/` and are re-runnable.

**What it is:** screenshot your Apple Watch run → a vision model reads it → you get
coaching-grade analysis of that run, that week, and that month, with charts.

---

## 0. Verdict

**Feasible, and better than expected.** Extraction of all three screenshots scored **108/108
fields correct on 5 consecutive runs** (median 33.7 s, ~5.1k input tokens). That includes the
per-kilometre splits table, the heart-rate zones, and the fiddly cases: comma decimals, the
partial final kilometre, and null-bounded zone ranges.

**But not with GLM-5.2.** GLM-5.2 and GLM-5.3 are text-only. The vision work is done by
**`glm-4.6v`**, and the endpoint it must be called on is *not* the one the expense tracker uses.

---

## 1. Measured findings

### 1.1 The endpoint matrix — read this before writing any client code

Probed every combination of {model} × {endpoint} with a real base64 screenshot:

| Endpoint | Shape | `glm-4.6v` | Notes |
|---|---|---|---|
| `api.z.ai/api/anthropic/v1/messages` | Anthropic | 200 ✅ | **image silently dropped** |
| `api.z.ai/api/coding/paas/v4/chat/completions` | OpenAI | 200 ✅ | **works — use this** |
| `api.z.ai/api/paas/v4/chat/completions` | OpenAI | 429 | `1113 Insufficient balance` |
| `api.z.ai/api/coding/paas/v4/v1/messages` | Anthropic | 404 | does not exist |

> ### ⚠️ The trap that will cost you a day
>
> The **Anthropic-compatible endpoint accepts image blocks, returns HTTP 200, and silently
> discards the image.** It does not error. It does not warn. The model then answers from the
> text prompt alone — and because it is a helpful model being asked about a run, **it invents
> plausible numbers.**
>
> Observed, verbatim: asked for the distance and pace in the screenshot, it answered
> **"Distance: 5.00 km, Avg Pace: 05:00/km"**. The true answer is 10,67 km at 7'22"/km.
>
> The tell is `input_tokens`. A 739 × 1600 screenshot costs ~1,500 tokens. When the image is
> dropped, the request reports **141**.
>
> **Mitigation, mandatory:** assert a token floor on every vision response. If
> `usage.prompt_tokens < 500 × imageCount`, throw — do not parse the reply. There is a
> ready-made test for this in `research/matrix.mjs`.

### 1.2 Model access under the GLM Coding Plan

The author's key is a **coding-plan subscription**, not pay-as-you-go. That changes what is
reachable:

| Model | Coding plan | Verdict |
|---|---|---|
| `glm-4.6v` | ✅ available | **the extractor** |
| `glm-4.6v-flash` | ⚠️ intermittent `1305 overloaded` | unusable as a primary |
| `glm-5.2` / `glm-5.3` | ✅ available | the narrator |
| `glm-5v-turbo` | ❌ `1311 not included in your plan` | — |
| `glm-ocr` | ❌ `1113 insufficient balance` | — |

`glm-ocr` at $0.03/M would have been the cheapest possible path and is worth revisiting if the
account ever moves to pay-as-you-go. It is **not** reachable on the coding plan today.

**Also worth knowing:** requesting `glm-5.2` on the Anthropic endpoint returns
`"model": "glm-5.3"`. z.ai is silently upgrading it. The expense tracker is already running on
5.3 without knowing it. Harmless here, but pin deliberately rather than by accident.

### 1.3 Extraction accuracy

Config: `glm-4.6v`, all three images in **one** call, `thinking: { type: 'disabled' }`,
`max_tokens: 4096`, scored against a hand-transcribed ground truth of 108 fields
(`research/schema.mjs`).

| Variant | Score | Latency |
|---|---|---|
| **3 images, one call, thinking off** | **108/108 (100%)** × 5 runs | median **33.7 s** |
| 3 images, one call, thinking on | 108/108 (100%) | 73 s |
| 3 parallel per-image calls, merged | 102/108 (94.4%) | 16 s |

Thinking mode **doubles the latency and buys nothing** — turn it off.

The parallel variant is twice as fast but wrong in a way that matters: it misread split 1's pace
as `436 s` when the screenshot says `6'36"` (396 s). Four of its six misses were fixable prompt
issues; that one was a genuine misread. **Accuracy wins — extraction is a background job, and
33 s is acceptable when the user is looking at a well-designed skeleton.**

What it got right, unprompted and repeatably:
- `10,67KM` → `10.67` — the comma is a decimal separator
- `1:18:36` → `4716` s, and `06:36` → `396` s in the same document
- `7'22"/KM` → `442` s/km
- all **11** split rows with pace, heart rate and cadence, in order
- **the partial 11th kilometre** — time `04:48` but pace `7'09"` — flagged `partial: true`
- `<140 BPM` → `{ minBpm: null, maxBpm: 140 }`, `175+` → `{ minBpm: 175, maxBpm: null }`
- resting HR `72` from the small-print footnote
- max HR `189` from the *chart axis label*, which is not written as a labelled field anywhere

### 1.4 Image preprocessing

All five variants scored **108/108**. Accuracy did not degrade at any setting tested:

| Variant | Bytes (3 imgs) | Input tokens | Latency | Score |
|---|---|---|---|---|
| original PNG 739w | 1222 KB | 5143 | 28.9 s | 108/108 |
| PNG 560w | 822 KB | 3277 | 33.0 s | 108/108 |
| JPEG q80 739w | 236 KB | 5143 | 32.7 s | 108/108 |
| **JPEG q80 560w** | **170 KB** | **3277** | 28.2 s | **108/108** |
| JPEG q70 460w | 107 KB | 2425 | 33.4 s | 108/108 |

Input tokens track **pixel dimensions**, not file size — JPEG cuts bytes 5× but not tokens;
downscaling cuts both.

**Use JPEG q80 at 560w client-side:** 7× fewer bytes uploaded, 36% fewer input tokens, no
accuracy cost. The expense tracker already has `browser-image-compression` wired for exactly
this in `lib/photos/compress.ts`.

460w/q70 also scored perfectly (53% fewer tokens) but sits closer to the legibility edge on the
smallest type in the splits table — take it only if latency or cost ever becomes a real
constraint, and re-run `research/downscale.mjs` before trusting it.

### 1.5 Why the LLM must not compute the metrics

Control experiment (`research/control.mjs`): give `glm-5.3` the raw splits and the formulas,
and ask it to compute six metrics itself.

| Metric | LLM | Truth | |
|---|---|---|---|
| avg HR as % of max | 93.2 | 93.01 | ok |
| **aerobic decoupling %** | **−14.1** | **+12.35** | ❌ **sign flipped** |
| 1st→2nd half drift s/km | 40.8 | 40.80 | ok |
| % time in Z4+Z5 | 88.3 | 90.60 | ❌ |
| cadence fade spm | −18 | −18.00 | ok |
| pace std dev s | 24.7 | 24.72 | ok |

Two of six wrong — and the decoupling error is not a rounding slip, it is **backwards**. Shipped,
it would have told the runner their aerobic fitness *held up* on a run where it visibly collapsed.

**Therefore: every number is computed in TypeScript and unit-tested. The LLM receives
pre-computed numbers and writes prose about them. It never does arithmetic.**

### 1.6 The narrative stage works, with one caveat

Given only pre-computed metrics, `glm-5.3` (forced tool use, Anthropic endpoint) produced a
genuinely useful report in ~10 s / 485 output tokens (`research/results-narrative.json`):

> **"An easy-distance run done way too hard — 93% of estimated HRmax"** · verdict: very hard
>
> *"A 10.67 km run that started fast (6'36" km 1) and steadily faded to 8'00" by km 10 while
> heart rate stayed pinned high. Cadence dropped 18 spm over the run, showing clear fatigue."*
>
> Do next: *"Cap easy runs at Zone 2 (roughly 130–150 bpm)"* · *"Start runs 30–60 s/km slower
> than goal pace — km 1 at 6'36" was too fast"* · *"Aim for ~170 spm with shorter, quicker steps"*
>
> Asks you: *"Was this meant to be a tempo session, or did you intend an easy run and the effort
> just crept up?"*

**Caveat:** the model **omitted `title` from every observation object despite it being listed in
the tool schema's `required` array.** z.ai does not enforce JSON Schema `required`. This is the
same class of failure the expense tracker already handles — so reuse that exact pattern:
**Zod-validate → one repair round-trip → deterministic fallback**
(`expense-tracking/lib/llm/parseExpense.ts:150`). Never trust the tool output shape.

### 1.7 Cost

Per session upload, at 560w JPEG: ~3.3k input + ~1k output on `glm-4.6v`, plus ~1.8k input +
~0.5k output on `glm-5.3`. At list pay-as-you-go rates that is **≈ $0.006 per run**, or **about
11 cents a month** at 17 runs. Under the coding plan it is included. **Cost is a non-issue;
design for accuracy, not for token thrift.**

---

## 2. Architecture

Mirror the expense tracker. The stack is proven, the conventions exist, and several modules
port directly.

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, TypeScript, RSC |
| Auth | Auth.js v5, Google only |
| DB | Neon Postgres + Drizzle |
| Blob | Vercel Blob, client uploads |
| Vision | `glm-4.6v` @ `api.z.ai/api/coding/paas/v4` — **OpenAI shape, `fetch`, no SDK** |
| Narrative | `glm-5.3` @ `api.z.ai/api/anthropic` — `@anthropic-ai/sdk`, forced tool |
| Charts | Recharts |
| Styling | Tailwind v4 |
| Tests | Vitest |
| Host | Vercel |

### 2.1 Two LLM clients, deliberately

```
lib/llm/
  vision.ts      glm-4.6v   · coding/paas/v4 · OpenAI shape · plain fetch
                            · asserts the token floor from §1.1
  narrate.ts     glm-5.3    · api/anthropic  · @anthropic-ai/sdk · forced tool
  extract.ts     orchestrates vision → Zod → repair → review queue
```

`@anthropic-ai/sdk` cannot be pointed at the v4 endpoint — different request shape. Don't fight
it; the vision call is one `fetch` and the SDK buys nothing there.

### 2.2 The pipeline

```
1–3 screenshots
      │  client: resize 560w, JPEG q80  (browser-image-compression)
      ▼
  Vercel Blob
      │
      ▼
 POST /api/extract ──► glm-4.6v, one call, all images, thinking off
      │                     │
      │                     ├─ assert prompt_tokens ≥ 500 × images   ← §1.1
      │                     └─ Zod parse ─┬─ ok ──────────────┐
      │                                   └─ fail → 1 repair ─┤
      ▼                                                       ▼
  REVIEW STATE (always — never auto-save)  ◄──────────────────┘
      │  user confirms or corrects any field
      ▼
  runs + run_splits + run_zones          ← the durable record
      │
      ▼
 lib/metrics/*.ts   deterministic, unit-tested, NO LLM      ← §1.5
      │
      ▼
 glm-5.3 forced tool ──► Zod ──► insights (cached by content hash)
```

**The review state is not optional.** §1.1 proves the model can be confidently wrong, and
§1.3's parallel variant proves it can misread a single cell while getting 101 others right. A
wrong split silently entering the database corrupts every weekly and monthly trend built on it.

### 2.3 Timeouts

Extraction is 33 s median. Vercel Hobby caps a function at 60 s. That is too tight for
`fetch → 33 s → Zod → repair`. **Extraction must not run inside the request.** Upload returns
immediately with a `pending` row; extraction runs as a background job and the client polls or
subscribes. This is the single biggest structural difference from the expense tracker, where
parsing fits comfortably inside one request.

---

## 3. Data model

```
users                    -- Auth.js drizzle adapter shape, do not hand-roll

profiles
  user_id      text PK → users.id ON DELETE CASCADE
  birth_year   int  NULL          -- store the year, not the age; age is derived
  height_cm    int  NULL
  weight_kg    numeric(4,1) NULL
  resting_hr   int  NULL          -- optional; Apple's default 72 is a placeholder
  max_hr       int  NULL          -- measured; if null, Tanaka-estimate and SAY SO
  updated_at   timestamptz

runs
  id             text PK          -- nanoid(12)
  user_id        text → users.id ON DELETE CASCADE
  occurred_on    date             -- Asia/Jakarta day
  started_at     time NULL
  ended_at       time NULL
  activity_type  text             -- "Outdoor Run"
  location       text NULL
  duration_sec   int
  distance_m     int              -- INTEGER METRES. 10.67 km -> 10670. No floats.
  active_kcal    int NULL
  total_kcal     int NULL
  elevation_m    int NULL
  avg_cadence    int NULL
  avg_pace_sec   int NULL         -- derived, stored for cheap sorting
  avg_hr         int NULL
  max_hr         int NULL
  resting_hr     int NULL
  source         text             -- 'screenshot' | 'manual'
  extraction_id  text NULL → extractions.id     -- provenance
  reviewed_at    timestamptz NULL -- NULL = not yet confirmed by a human
  INDEX (user_id, occurred_on DESC)

run_splits
  run_id    text → runs.id ON DELETE CASCADE
  km        int
  time_sec  int
  pace_sec  int
  hr        int NULL
  cadence   int NULL
  partial   boolean NOT NULL DEFAULT false
  PRIMARY KEY (run_id, km)

run_zones
  run_id       text → runs.id ON DELETE CASCADE
  zone         int         -- 1..5
  duration_sec int
  min_bpm      int NULL    -- NULL for zone 1's lower bound
  max_bpm      int NULL    -- NULL for zone 5's upper bound
  PRIMARY KEY (run_id, zone)

extractions                -- the audit trail. Never delete.
  id            text PK
  user_id       text
  blob_urls     jsonb      -- the screenshots as uploaded
  model         text       -- 'glm-4.6v'
  raw_response  jsonb      -- exactly what came back
  prompt_tokens int        -- the §1.1 canary, stored
  status        text       -- 'pending'|'ok'|'repaired'|'failed'
  corrections   jsonb NULL -- {field: {from, to}} — what the human changed
  created_at    timestamptz

insights
  id            text PK
  user_id       text
  scope         text       -- 'session'|'week'|'month'
  scope_key     text       -- run id | '2026-W34' | '2026-08'
  facts_hash    text       -- sha256 of the metrics fed in
  payload       jsonb      -- the validated narrative
  model         text
  created_at    timestamptz
  UNIQUE (user_id, scope, scope_key, facts_hash)
```

**`distance_m` as an integer is a deliberate lesson from the expense tracker's whole-rupiah
integers.** `10.67` km read from a comma-decimal screenshot, stored as a float, summed over 17
runs, is how a month total ends in `180.00000000000003`.

**`corrections` is the most valuable column in the schema.** Every field a human fixes is a
labelled extraction failure. After a month there is a real error profile — and the prompt can be
tuned against evidence instead of vibes.

---

## 4. Metrics — the deterministic core

`lib/metrics/`, pure functions, no I/O, no LLM, exhaustively unit-tested. A working
implementation with the real numbers already exists at `research/metrics.mjs`.

**Per session:**

Computed against the real profile: **age 30, 169 cm, 55 kg** (BMI 19.3).

| Metric | Definition | On the real run |
|---|---|---|
| avg HR % of max | `avgHr / hrMax` — **observed 189, not the Tanaka 187** (R-3) | **91.5%** |
| aerobic decoupling | `(speed/HR first half − second half) / first half` | **+12.3%** |
| first→second half drift | mean pace 2nd half − 1st half, full km only | **+41 s/km** |
| pace consistency | std dev of full-km paces | 24.7 s |
| cadence fade | cadence km₁₀ − cadence km₁ | **−18 spm** |
| HR recovery @1 min | peak post-workout HR − 1-minute HR | 23 bpm |
| zone distribution | share of time per zone | Z4 47%, Z5 43% |

Only the first row moves with the profile; the rest are profile-independent.

**Exclude the partial kilometre from every pace average.** km 11 is 0.67 km; treating its
`04:48` as a full-km time makes the runner look like they sprinted the finish. This is why
`partial` is a stored column and not a derived guess.

**Per week:** volume, run count, longest run, share of time in Z1–Z2 (the polarisation check),
week-over-week volume delta with a **>10% jump warning**, average pace at comparable distance.

**Per month:** volume vs the previous month, the pace trend across the month at matched
distance, aggregate zone distribution, **acute:chronic workload ratio** —
`acute7dKm / (chronic28dKm / 4)`, flagged outside 0.8–1.3. **R-6: the naive `7d ÷ 28d` reading
is structurally pinned at 0.25 and can never enter the band.**

**Flags** are fixed, testable rules — the LLM explains them, it never invents them. The real run
fires six: `HIGH_DECOUPLING`, `TOO_MUCH_HARD`, `POSITIVE_SPLIT`, `CADENCE_FADE`,
`VERY_HIGH_AVG_HR`, `FAST_START`.

### 4.1 Learn max HR from the data — do not trust the formula

The real profile exposes a flaw worth building around. Tanaka gives this runner an estimated
HRmax of **187 bpm**. The very first run analysed recorded an observed max of **189 bpm**.

**The formula is already wrong, on sample size one.** It will keep being wrong, and every
`%HRmax` figure and the `VERY_HIGH_AVG_HR` flag inherit the error.

**Therefore `lib/metrics/hrMax.ts` resolves in this order:**

1. `profiles.max_hr` — a value the runner entered, if present
2. **the highest `runs.max_hr` ever observed**, if it exceeds the estimate
3. the Tanaka estimate, always labelled `estimated`

Every metric carries the provenance of the HRmax it used (`measured` | `observed` | `estimated`),
and the UI shows it. When rule 2 first overtakes rule 3, tell the runner — *"your watch has seen
189 bpm, above the 187 your age predicts; zone percentages now use 189"* — because a silently
shifting denominator makes historical percentages incomparable.

**Recompute affected insights when the observed max rises.** This is a second reason insights
are keyed by `facts_hash` (§5): a new personal-max invalidates every `%HRmax` claim before it.

---

## 5. Insights — the narrative layer

**Input:** the metrics object, the profile, and the flags. Never raw splits alone, never a
question requiring arithmetic.

**System prompt rules that were tested and worked** (`research/narrate.mjs`):
- every number stated must appear verbatim in the supplied JSON
- age/height/weight are self-reported; estimated HRmax is a formula, not a measurement
- be direct; no filler, no "great job!"
- not a doctor — flag anything concerning once, plainly, without alarmism

**Output shape:** `headline` (≤70 chars) · `verdict` (easy|moderate|hard|very hard) ·
`whatHappened` · `observations[]` · `doNext[]` · `questionForRunner`.

That last field earns its place. The data cannot know whether a hard run was *intended*. Asking
turns a scolding into a conversation — and the answer is worth storing as a `runs.intent` column
so future analysis stops mislabelling deliberate tempo runs as pacing failures.

**Validation:** Zod → one repair round-trip → render the metrics without prose. §1.6 proved the
`required` array is advisory.

**Caching:** key on `facts_hash`. Insights are regenerated only when the underlying numbers
change — which, thanks to the review state, they can (a correction must invalidate the insight).

---

## 6. Charts

Recharts, mobile-first, all readable at 414 px.

1. **Pace + HR per kilometre, dual axis** — the signature chart. On the real run it shows pace
   climbing 6'36" → 8'00" while HR climbs 154 → 183. *Invert the pace axis* so "up" means
   "faster"; a pace chart where the good direction is down misreads at a glance every time.
2. **Zone bar** — one horizontal stacked bar, five segments, labelled with duration and share.
3. **Splits table** — the raw grid, partial km visually distinct.
4. **Weekly volume** — bars over 12 weeks with a 4-week rolling mean.
5. **Pace trend** — scatter of avg pace over time, sized by distance, with a trend line. Only
   compare like with like: a 5 km at 6'30" is not progress over a 15 km at 7'00".
6. **Zone drift** — stacked area of weekly zone share. If the goal is polarised training, this
   is the chart that shows whether it is actually happening.

Before writing chart code, load the `dataviz` skill — it covers the palette, the axis and the
stat-tile conventions.

---

## 7. Onboarding

Asked once on first login: **age (store birth year), height, weight.** Optional but encouraged:
**resting HR** and **measured max HR**.

The author's values, for fixtures and for the design mockups: **30, 169 cm, 55 kg** (BMI 19.3).

- Explain in one line why: it calibrates zones and effort estimates.
- Skippable. Everything degrades: no age → no HRmax estimate → no `%HRmax` claims and no
  `VERY_HIGH_AVG_HR` flag. The app must be honest about what it cannot say, not silently
  substitute a default.
- Editable afterwards.
- **Label estimated HRmax as estimated, every single time it is shown.** Tanaka's standard
  deviation is roughly ±7 bpm — and per §4.1 it is *already* wrong for this runner by at least
  2 bpm on the first run analysed. Presenting an estimate as fact is the most likely way this
  app gives bad advice.
- **Weight is the least load-bearing of the three.** It affects calorie sanity-checks and little
  else here. Ask for it, but never build a coaching claim on it, and never comment on it — this
  is a running app, not a weight app.

---

## 8. Build order

| # | Feature | Ships when |
|---|---|---|
| F01 | Next 16 + Drizzle + Neon + Auth.js + Vercel skeleton | you can sign in |
| F02 | Profile + onboarding | age/height/weight persist |
| F03 | Blob upload + client resize 560w/q80 | screenshots land in Blob |
| F04 | **Vision extraction + token-floor guard + Zod + repair** | JSON from a screenshot |
| F05 | **Review & correct screen** | a run reaches the DB with `reviewed_at` |
| F06 | Run detail + pace/HR chart + zone bar + splits table | one run is fully readable |
| F07 | `lib/metrics` session-level + flags, unit-tested | numbers, no prose |
| F08 | Narrative for a session | the coach speaks |
| F09 | History list, weekly rollup + weekly insight | the week view |
| F10 | Monthly rollup, trends, ACWR | the month view |
| F11 | Design system pull from Claude Design (`docs/design-brief.md`) | it looks like itself |

**F04 and F05 are the project.** Everything else is competent CRUD. Build them first, against
the real screenshots, and keep `research/score.mjs` as a regression test — a 108-field
ground-truth fixture is a genuinely rare thing to have on day one. Keep it green.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| **Silent image drop → invented numbers** (§1.1) | token-floor assertion; test in CI |
| Model misreads one cell of 108 | mandatory human review before save |
| `required` not enforced (§1.6) | Zod + repair + fallback |
| 33 s > request budget | background job, never inline |
| Apple redesigns the Fitness UI | prompt describes *semantics*, not pixel positions; `corrections` exposes drift early |
| Coding-plan model access changes | `LLM_VISION_MODEL` in env; `research/matrix.mjs` re-probes in one command |
| Estimated HRmax presented as fact | §4.1 resolution order; label provenance everywhere |
| Observed max HR shifts the denominator | announce the change; re-key insights on `facts_hash` |
| Screenshots are health data | private Blob, per-user scoping, no third-party analytics on run pages |

---

## 10. Open questions

1. ~~Real age/height/weight~~ — **answered: 30, 169 cm, 55 kg.** §4 and §4.1 are recomputed.
2. **Do you want the weekly/monthly insight to have a memory** — i.e. reference the previous
   week's advice and whether you took it? Cheap to add now (one extra field), awkward to retrofit.
3. **Language.** The expense tracker is Indonesian-flavoured English. Same here, or straight
   English?
4. **Is `research/` worth keeping in the repo?** It is a live, re-runnable feasibility harness
   with a ground-truth fixture. Recommendation: keep it, wire `score.mjs` into CI.

---

## Appendix — reproducing the findings

```bash
cd research
LLM_API_KEY=… node matrix.mjs        # endpoint × model probe — run this first
LLM_API_KEY=… node run-extract.mjs   # extraction variants, scored
LLM_API_KEY=… node run-repeat.mjs    # 5× stability
LLM_API_KEY=… node control.mjs       # proves the LLM must not compute
LLM_API_KEY=… node narrate.mjs       # the coaching report
node show-metrics.mjs                # deterministic metrics, no API key needed
```

The scripts read the three screenshots from an absolute path in `lib.mjs`; point it at your own
copies. Ground truth for scoring is `schema.mjs`.
