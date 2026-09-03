# Run Insights — Roadmap v0.1.0

**Domain:** [runins.site](https://runins.site) (DomaiNesia) · **Repo:** `run-insights` · **Host:** Vercel · **DB:** Neon Postgres · **Blob:** Vercel Blob
**Vision:** `glm-4.6v` via z.ai coding endpoint · **Narrative:** `glm-5.3` via z.ai Anthropic endpoint
**Badge art:** `qwen/qwen-image-3-pro` via OpenRouter

> **⚠️ Amended after plan reconciliation.** Eleven feature plans were written against this
> contract in parallel; several proved parts of it wrong. `RECONCILIATION_v0.1.0.md` is the
> arbitration record and **supersedes any individual plan file**. Rulings referenced below as
> **R-n**.

> **`IMPLEMENTATION_PLAN.md` is the feasibility record and stays authoritative on everything it
> measured** — the endpoint matrix, the token-floor guard, extraction accuracy, why metrics are
> deterministic. This roadmap is authoritative on **scope, contract and sequencing**. Where a
> feature plan needs to change §4 of this file, it must say so in a `## Contract deltas` section
> rather than silently diverging.

> **Core tenet: this is a reading app, not a dashboard.** You open it after a run to understand
> what happened. Every feature earns its place. No streaks-as-anxiety, no push notifications, no
> social feed, no settings page beyond the profile, no dark-mode toggle (follow system).

---

## 1. Product summary

Screenshot an Apple Watch run from the iOS Fitness app → a vision model reads it → get
coaching-grade analysis of that run, that week, and that month, with charts, personal records
and a shelf of deliberately funny badges.

### The one flow that matters

```
1–3 screenshots  ──►  glm-4.6v extraction  ──►  REVIEW & CORRECT  ──►  runs
   │                   (background, ~33 s)         (mandatory)           │
   └──► extractions ──► run_photos.extraction_id        R-1: the runs row │
                                                    is INSERTed here,     │
                                                    not at upload         │
                                                                        ▼
                                             deterministic metrics ──► glm-5.3 narrative
                                                        │
                                                        ├──► personal records
                                                        └──► badge evaluation
```

### The canonical fixture

The three screenshots in `research/` — 2026-08-20, Tangerang, 10.67 km in 1:18:36 — with its
108-field hand-transcribed ground truth in `research/schema.mjs`. **Every feature builds against
this run.** It is a deliberately unflattering run (90.6% in zones 4–5, +41 s/km positive split,
−18 spm cadence fade), which makes it a better fixture than a good one would be.

---

## 2. Decisions locked (do not re-litigate)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Extraction never auto-saves.** A human confirms every run | The model can be confidently wrong; a bad split poisons every rollup built on it |
| D2 | **Every number is computed in TypeScript.** The LLM writes prose only | Measured: it returned aerobic decoupling of −14.1% when the truth is +12.3% |
| D3 | **Token-floor assertion on every vision call** | The Anthropic endpoint drops images silently and returns 200 with invented numbers |
| D4 | Extraction runs as a **background job**, never inside a request | 33 s median vs a 60 s function ceiling with a repair round-trip to spare for |
| D5 | Distance stored as **integer metres**; pace and duration as **integer seconds** | Floats summed over 17 runs a month drift visibly |
| D6 | Timezone fixed to **Asia/Jakarta**; `occurred_on` is a `date` | Single-region personal app |
| D7 | **Server Actions** for every mutation. Route Handlers only for `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]`, `/api/cron/*` | Fewest files |
| D8 | Any Google account may sign in; **all data scoped per `user_id`** | Multi-user from day one, no allowlist |
| D9 | Sharing = unguessable token at `/s/<token>`, no login, read-only, revocable | "send it to a friend over WhatsApp" |
| D10 | **Copy is straight English.** No i18n layer | Author's choice |
| D11 | **HRmax resolves observed-first**, never formula-first | Tanaka says 187; the author's watch already recorded 189 |
| D12 | Badge art is **generated offline by a skill and committed**. No runtime image generation | ~$0.04 and 4–5 min per image |
| D13 | `research/` **stays in the repo**, and `score.mjs` runs in CI | A 108-field ground-truth fixture on day one is rare; it is the F04 regression test |
| D14 | Partial final kilometres are stored and **excluded from every pace average** | km 11 is 0.67 km; averaging it makes a fade look like a sprint |
| D15 | No weight-based coaching claims, ever — **enforced structurally: `weight_kg` never enters any LLM payload** (R-28) | This is a running app, not a weight app |
| D16 | **The reviewed-data invariant:** every rollup, list, chart, record input and badge input filters `runs.reviewed_at IS NOT NULL` (R-13) | The mechanical expression of D1 |
| D17 | **Repair round-trips are text-only.** An image is never sent twice (R-2) | 3 images resent = ~70–80 s, through the 60 s ceiling; the measured failure is structural, not perceptual |

---

## 3. Stack (pinned)

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router, TypeScript, RSC | `next@16.3.1` |
| React | | `react@19.2.8` |
| Auth | Auth.js v5, Google only | `next-auth@5.0.0-beta.32` |
| Auth adapter | Drizzle adapter | `@auth/drizzle-adapter@1.11.3` |
| ORM | Drizzle + Neon serverless | `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `@neondatabase/serverless@1.1.0` |
| Blob | Vercel Blob client uploads | `@vercel/blob@2.8.0` |
| Styling | Tailwind CSS v4 (CSS-first `@theme`) | `tailwindcss@4.3.3` |
| Charts | Recharts | `recharts@3.10.1` |
| Validation | Zod | `zod@4.4.3` |
| Narrative client | `@anthropic-ai/sdk` with `baseURL` override | `0.117.1` |
| Vision client | **plain `fetch`** — no SDK | — |
| Image compression | `browser-image-compression` | `2.0.2` |
| Tests | Vitest | `4.1.2` |
| Node | | `>=22` |

> **Two LLM clients, deliberately.** `@anthropic-ai/sdk` cannot be pointed at the v4 vision
> endpoint — different request shape. The vision call is one `fetch`; the SDK buys nothing there.

---

## 4. Shared contract — AUTHORITATIVE

### 4.1 Environment

```bash
# ONE z.ai key serves both endpoints — the coding-plan subscription covers glm-4.6v
# and glm-5.3 alike. There is no separate vision key. Verified live (R-40).
LLM_API_KEY=

# Vision — glm-4.6v. OpenAI-shaped. NOT the Anthropic base URL. See IMPLEMENTATION_PLAN §1.1.
LLM_VISION_BASE_URL=https://api.z.ai/api/coding/paas/v4
LLM_VISION_MODEL=glm-4.6v

# Narrative — glm-5.3. Anthropic-compatible. No trailing slash, no /v1 suffix.
LLM_BASE_URL=https://api.z.ai/api/anthropic
LLM_MODEL=glm-5.3

DATABASE_URL=                 # pooled,  host contains "-pooler"
DATABASE_URL_UNPOOLED=        # direct,  drizzle-kit migrate/studio ONLY

AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=https://runins.site  # PRODUCTION ONLY. Leave empty locally and on preview —
                              # Auth.js infers the origin from the request there.

BLOB_READ_WRITE_TOKEN=
CRON_SECRET=                  # guards /api/cron/*

# Build-time ONLY. Read by tools/gen_badge_art.py and by NOTHING in app/ or lib/.
# `grep -rE 'OPENROUTER_API_KEY' app/ lib/ components/` must stay empty, asserted in CI.
OPENROUTER_API_KEY=
```

Every variable is server-only. **None may ever be prefixed `NEXT_PUBLIC_`.** `lib/env.ts` parses
the core group eagerly at import and crashes the build if any is missing, following
`expense-tracking/lib/env.ts`.

### 4.2 Units and formatting — one rule each, no exceptions

| Quantity | Stored as | Rendered as |
|---|---|---|
| Distance | `int` **metres** — `10670` | `10.67 km`, two decimals, **period decimal separator** |
| Duration | `int` **seconds** | `1:18:36` (h:mm:ss) or `41:23` (m:ss) |
| Pace | `int` **seconds per km** — `442` | `7'22"/km` |
| Cadence, HR | `int` | `144 spm`, `173 bpm` |
| Energy | `int` kcal | `646 kcal` |
| Elevation | `int` metres | `15 m` |
| Weight | `numeric(4,1)` kg | `55.0 kg` |

> Apple renders `10,67KM` with a comma. **We render `10.67 km` with a period**, because the copy
> is English (D10). The extractor's job is to parse Apple's comma correctly; the UI's job is to
> be internally consistent. `lib/format.ts` is the only place either is decided.

### 4.3 Database schema

Auth.js tables (`users`, `accounts`, `sessions`, `verificationTokens`) come from the standard
Drizzle adapter shape — **do not hand-roll them**.

```
profiles
  user_id      text PK → users.id ON DELETE CASCADE
  birth_year   int NULL          -- store the year; age is derived, never stored
  height_cm    int NULL
  weight_kg    numeric(4,1) NULL
  resting_hr   int NULL
  max_hr       int NULL          -- MEASURED only. Never write an estimate here.
  onboarded_at timestamptz NULL
  updated_at   timestamptz NOT NULL DEFAULT now()

runs
  id             text PK                    -- nanoid(12)
  user_id        text NOT NULL → users.id ON DELETE CASCADE
  occurred_on    date NOT NULL              -- Asia/Jakarta day
  started_at     time NULL
  ended_at       time NULL
  activity_type  text NOT NULL DEFAULT 'Outdoor Run'
  location       text NULL
  duration_sec   int NOT NULL
  distance_m     int NOT NULL
  active_kcal    int NULL
  total_kcal     int NULL
  elevation_m    int NULL
  avg_cadence    int NULL
  avg_pace_sec   int NOT NULL               -- derived at write; stored for cheap sorting
  avg_hr         int NULL
  max_hr         int NULL
  resting_hr     int NULL
  intent         text NULL                  -- 'easy'|'tempo'|'long'|'race'|'unspecified'
  end_hr_bpm     int NULL                   -- R-9. postWorkoutHr[0], fixture 185
  hr_1min_post_bpm int NULL                 -- R-9. postWorkoutHr[1], fixture 162
  note           text NULL
  source         text NOT NULL              -- 'screenshot'|'manual'
  extraction_id  text NULL → extractions.id
  reviewed_at    timestamptz NULL           -- NULL = not yet confirmed. Written once, at commit.
  corrected_at   timestamptz NULL           -- R-8. Last post-review edit.
  created_at     timestamptz NOT NULL DEFAULT now()
  updated_at     timestamptz NOT NULL DEFAULT now()
  -- R-5: a plain UNIQUE does NOT guard when started_at is NULL (Postgres: NULLs are distinct)
  UNIQUE INDEX (user_id, occurred_on, coalesce(started_at, '00:00:00'::time))
  INDEX (user_id, occurred_on DESC)
  INDEX (user_id, max_hr DESC)              -- R-12, for the HRmax observed lookup

run_splits
  run_id    text NOT NULL → runs.id ON DELETE CASCADE
  km        int NOT NULL
  time_sec  int NOT NULL
  pace_sec  int NOT NULL
  hr        int NULL
  cadence   int NULL
  partial   boolean NOT NULL DEFAULT false
  PRIMARY KEY (run_id, km)

run_zones
  run_id       text NOT NULL → runs.id ON DELETE CASCADE
  zone         int NOT NULL              -- 1..5
  duration_sec int NOT NULL
  min_bpm      int NULL                  -- NULL for zone 1
  max_bpm      int NULL                  -- NULL for zone 5
  PRIMARY KEY (run_id, zone)

run_photos
  id         text PK
  -- R-1: photos attach to the EXTRACTION at upload; run_id is backfilled at commit.
  extraction_id text NOT NULL → extractions.id ON DELETE CASCADE
  run_id     text NULL → runs.id ON DELETE CASCADE
  blob_url   text NOT NULL
  pathname   text NOT NULL
  kind       text NOT NULL              -- 'summary'|'splits'|'heartrate'|'other'
  width      int NULL
  height     int NULL
  bytes      int NULL
  sort_order int NOT NULL DEFAULT 0
  excluded_from_share boolean NOT NULL DEFAULT false   -- R-11 / F11 per-photo opt-out
  created_at timestamptz NOT NULL DEFAULT now()

extractions                             -- the audit trail. Never delete.
  id            text PK
  user_id       text NOT NULL → users.id ON DELETE CASCADE
  blob_urls     jsonb NOT NULL
  model         text NOT NULL
  prompt_tokens int NULL                -- the D3 canary, stored
  raw_response  jsonb NULL
  status        text NOT NULL           -- 'pending'|'ok'|'repaired'|'failed'
  error_code    text NULL
  corrections   jsonb NULL              -- R-7: {fieldPath: [{from,to,phase,checkId,correctedAt}]}
  created_at    timestamptz NOT NULL DEFAULT now()
  completed_at  timestamptz NULL

insights
  id         text PK
  user_id    text NOT NULL → users.id ON DELETE CASCADE
  scope      text NOT NULL              -- 'session'|'week'|'month'
  scope_key  text NOT NULL              -- run id | '2026-W34' | '2026-08'
  facts_hash text NOT NULL              -- sha256 of the metrics fed in
  payload    jsonb NOT NULL
  model      text NOT NULL
  created_at timestamptz NOT NULL DEFAULT now()
  UNIQUE (user_id, scope, scope_key, facts_hash)
  INDEX (user_id, scope, scope_key, created_at DESC)   -- R-12
  -- R-11: session payloads carry hrMaxUsed + hrMaxSource, frozen at generation time

records                                 -- one row per record KEY per user, current holder
  user_id    text NOT NULL → users.id ON DELETE CASCADE
  key        text NOT NULL              -- see §4.5
  run_id     text NOT NULL → runs.id ON DELETE CASCADE
  value      int NOT NULL               -- in the key's canonical unit
  achieved_on date NOT NULL
  previous_value int NULL
  updated_at timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (user_id, key)

badges                                  -- one row per badge EARNED
  user_id    text NOT NULL → users.id ON DELETE CASCADE
  key        text NOT NULL              -- see §4.6
  run_id     text NULL → runs.id ON DELETE SET NULL   -- the run that earned it, if session-scoped
  scope_key  text NULL                  -- '2026-W34' | '2026-08' for period badges
  earned_on  date NOT NULL
  count      int NOT NULL DEFAULT 1     -- times re-earned
  created_at timestamptz NOT NULL DEFAULT now()
  PRIMARY KEY (user_id, key)

shares
  token       text PK                   -- nanoid(16), unguessable
  user_id     text NOT NULL → users.id ON DELETE CASCADE
  run_id      text NOT NULL → runs.id ON DELETE CASCADE
  revoked_at  timestamptz NULL
  created_at  timestamptz NOT NULL DEFAULT now()
  UNIQUE (run_id) WHERE revoked_at IS NULL
```

### 4.4 HRmax resolution — one function, used everywhere

`lib/metrics/hrMax.ts` exports exactly one resolver. **No feature may compute HRmax any other
way.**

```ts
type HrMaxSource = 'measured' | 'observed' | 'estimated'
interface HrMax { bpm: number; source: HrMaxSource }

// 1. profiles.max_hr           -> 'measured'
// 2. max(runs.max_hr) if > est -> 'observed'
// 3. Tanaka 208 - 0.7 * age    -> 'estimated'
// no birth_year and no observed max -> null; the caller must degrade, not default
```

Every metric that divides by HRmax carries the `source` through to the UI, and the UI shows it.
When `observed` first overtakes `estimated`, tell the runner — a silently shifting denominator
makes historical percentages incomparable.

### 4.5 Personal record keys

`lib/records/catalog.ts`. Each key names a comparator and a **minimum qualifying distance**,
because "fastest pace" over 400 m is not a record.

| key | measures | unit | qualifier | direction |
|---|---|---|---|---|
| `longest_distance` | `distance_m` | m | — | max |
| `longest_duration` | `duration_sec` | s | — | max |
| `fastest_pace_5k` | `avg_pace_sec` | s/km | `distance_m >= 5000` | min |
| `fastest_pace_10k` | `avg_pace_sec` | s/km | `distance_m >= 10000` | min |
| `fastest_km_split` | `min(run_splits.pace_sec)` | s/km | full km only | min |
| `most_kcal` | `active_kcal` | kcal | — | max |
| `most_elevation` | `elevation_m` | m | — | max |
| `highest_cadence` | `avg_cadence` | spm | `distance_m >= 5000` | max |
| `highest_max_hr` | `max_hr` | bpm | — | max |
| `best_paced_run` | `abs(decoupling_pct)` | basis points | `distance_m >= 5000` | min |
| `earliest_start` | `started_at` | seconds past midnight | `started_at is not null` | min |

`best_paced_run` is stored in **basis points** (`1234` = 12.34%) and `earliest_start` in **seconds
past midnight** (`25620` = 07:07) so `records.value` stays an integer for every key.

**`earliest_start` (F32) is a plain minimum, and midnight is where the day starts.** A run begun at
00:15 takes it from one begun at 04:30. `runs.started_at` is a `time` carrying no date and the
badge rules already order it lexically from `'00:00:00'`; a "sane morning" window like
`early_bird`'s would be the only place in the app that moved the start of the day. It is the one
key with no distance qualifier *and* no magnitude — a floor belongs to the four keys that measure a
rate, and a start time is not a rate.

**Records are recomputed, never incremented.** A correction in review can invalidate a record;
the only safe implementation is a full recompute over the user's runs. At 17 runs a month this
is free.

### 4.6 Badge catalog

`lib/badges/catalog.ts`. **This list is the contract** — F09 implements the rules, F10 draws
exactly these keys, and `gen_badge_art.py` refuses to start if the two sets differ.

Every rule is evaluated against **stored, human-reviewed data only**. A badge earned from an
unreviewed extraction is a badge earned from a hallucination.

| key | title | earns when | scope |
|---|---|---|---|
| `early_bird` | Early Bird | `started_at` between 05:00 and 05:30 | session |
| `late_start` | Fashionably Late | `started_at` after 07:00 | session |
| `self_reward` | Self-Reward Achieved | 4 runs in one ISO week | week |
| `negative_split` | Finished the Job | second half faster than first | session |
| `metronome` | Metronome | pace std dev under 10 s across full kms | session |
| `fast_start_fool` | Went Out Like a Hero | km 1 fastest by 30 s+ **and** positive split | session |
| `redline_republic` | Citizen of Redline Republic | 40%+ of a run in zone 5 | session |
| `sandbagger` | Suspiciously Sensible | entire run in zones 1–2 | session |
| `cadence_collapse` | Legs Have Left the Chat | cadence fade of 15+ spm | session |
| `warmup_who` | Warm-Up? Never Met Her | km 1 already in zone 4+ | session |
| `groundhog_day` | Groundhog Day | 3 consecutive runs within ±100 m | session |
| `tourist` | Tourist | a `location` never seen before | session |
| `century_club` | Century Club | 100 km in a calendar month | month |
| `double_century` | Double Century | 200 km in a calendar month | month |
| `half_ish` | Half-ish | a single run of 21.1 km+ | session |
| `sweat_equity` | Sweat Equity | 1000+ active kcal in one run | session |
| `new_ceiling` | New Ceiling | observed max HR beats the previous best | session |
| `consistency_gremlin` | Consistency Gremlin | 4 consecutive weeks of 4+ runs | week |
| `dawn_patrol` | Dawn Patrol | 10 runs started before 06:00 | lifetime |
| `long_way_home` | The Long Way Home | a new `longest_distance` record | session |
| `two_a_days` | Two-a-Days | two reviewed runs on one calendar day | session |
| `boring_excellence` | Boring Excellence | 3 consecutive runs within ±10 s/km **and** all under 5% decoupling | session |

**22 keys. This list is the interface** — F09 implements these rules, F10 draws exactly these
keys, and `gen_badge_art.py` refuses to start if the two sets differ.

> **R-33: this catalog is 22 keys.** The Claude Design pull shipped a shelf that dropped
> `sandbagger` / `warmup_who` / `double_century` and invented three; two were adopted above and
> **`rain_tax` was cut — Apple Fitness screenshots carry no weather data, so it can never fire.**
> `gen_badge_art.py`'s key-diff guard is what keeps F09 and F10 honest about this.

**Tone rule:** the funny ones are funny *about the run*, never about the runner.
`cadence_collapse` and `fast_start_fool` are self-deprecating jokes the author is making about
their own data — they must never read as the app scolding a stranger.

### 4.7 Badge art style — vastly different from `daily-words`

> **R-34 resolved (R-36); rationale restated for the v2 design in R-43.** Keep the navy patches,
> let them be loud — **the decision is unchanged, only its reasoning moved.**
>
> This section was first written against a warm cream app. Since the v2 design revamp the app is
> a **sky-blue canvas (`--paper #c9e9fb`) with white cards**, and the patches are still dark navy
> twill. The clash survives the repaint intact, and is arguably louder for it: navy against sky
> reads as a *sewn-on object* more strongly than navy against cream ever did, because there is no
> shared warmth to soften the join. What actually carries the decision never depended on the
> paper colour — the shelf stays quiet so the patches can be loud, and the patch is the only
> saturated, tactile, non-flat thing anywhere in the app.
>
> The v2 design confirms this rather than contradicting it: its `BadgeTile` ships a navy
> placeholder (`#1d2436`, dashed `#46557a` border, `#93a5d4` label) and repeats the same
> sentence — *"the shelf stays quiet so the patches can be loud."* **F10's style block ships
> unchanged.**

The reference deck (`/home/miftah/daily-words/.claude/skills/generate-badge-art/style.md`) is a
**19th-century letterpress ration coupon**: square, flat cream paper, exactly two flat inks
(pine green + one vermilion mark), pure line engraving, a circular seal, austere and clerical.

**Run Insights goes somewhere else entirely — a different medium, not different scenes:**

| axis | daily-words | **run-insights** |
|---|---|---|
| Medium | ink printed on paper | **thread embroidered on fabric** |
| Substrate | flat cream card stock | **dark navy cotton twill, visible weave** |
| Palette | 2 flat inks | **4–5 saturated thread colours** |
| Technique | engraved line, hatch, stipple | **satin stitch, raised thread, merrowed border** |
| Silhouette | circle in a square | **shield, hexagon, chevron, rounded triangle — varies per badge** |
| Light | none, flat | **raked side-light catching the thread's sheen** |
| Tone | dry, clerical, fond | **loud, sporty, a little absurd** |

The object is a **1970s embroidered race-club patch** — the kind sewn onto a running-club jacket:
chunky, tactile, saturated, with real thread texture and a raised merrowed edge. It stays
legible at 40 px because a patch is a bold shape with a hard border, and it can carry humour a
letterpress seal cannot.

**Constraints kept from the reference, because they are craft not style:** no text anywhere, full
bleed, one clear silhouette that reads at 40 px, one subject per badge, no trophies/laurels/
ribbons, and an anchor image that every subsequent generation references so the 22 patches
share a twill tone, a border weight and a thread gauge.

### 4.8 Routes

```
/                     runs list, newest first, grouped by week
/r/[id]               run detail — hero, analysis, charts, splits
/upload               screenshot picker → extraction → review
/x/[extractionId]     pre-commit review        (R-1 — replaces /r/[id]/review)
/r/[id]/edit          post-review correction   (R-1)
/trends               week + month rollups and trend charts
/me                   profile: totals, records, badge shelf
/onboarding           age / height / weight, first login only
/s/[token]            public read-only share
/api/upload           blob client-upload handshake
/api/extract          starts a background extraction, returns immediately
/api/extract/[id]     poll status
/api/cron/rollup      nightly weekly/monthly insight refresh (guarded by CRON_SECRET)
/api/auth/[...nextauth]
/api/health           unauthenticated liveness probe (R-14)
```

**Navigation is a four-tab bottom bar**, from the v2 design's `TabBar`. The routes above are
the surface; this is how a phone reaches them:

| tab | route | note |
|---|---|---|
| Runs | `/` | default landing once signed in |
| **Upload** | `/upload` | **centre, raised, coral (`--z5`)** — a circular FAB breaking the bar's top edge, not a peer of the other three. It is the one flow that matters (§1), and the IA says so |
| Trends | `/trends` | |
| Me | `/me` | profile, records, badge shelf |

`/r/[id]`, `/x/[extractionId]`, `/r/[id]/edit`, `/onboarding` and `/s/[token]` are **not** tabs —
they are pushed screens or standalone pages. The bar pads its bottom by `--safe-bottom`
(home-indicator inset), which is inert without `viewport-fit=cover` in the root layout. `/s/[token]`
shows no tab bar at all: a shared run is read-only and its viewer has no account to navigate.

**Canonical origin is `https://runins.site`.** `www.runins.site` 301s to the apex. Share links
(`/s/<token>`) are built from that origin — never from `VERCEL_URL`, whose per-deployment
hostname would produce links that die on the next deploy.

### 4.9 Testing contract

- `research/score.mjs` runs in CI against the committed fixture. **It must stay green.**
- Every `lib/metrics/*` function is unit-tested against the canonical fixture's known values:
  decoupling `+12.3%`, drift `+41 s/km`, cadence fade `−18 spm`, Z4+Z5 `90.6%`, pace sd `24.7 s`.
- Every badge rule has a test that fires it and a test that does not.
- No test may call a live LLM except the explicitly-tagged live suites.

---

## 5. Features

Eleven. Each gets a plan in `docs/plans/`.

| # | Feature | Owns | Depends on |
|---|---|---|---|
| **F01** | Foundation & deployment | Next 16 skeleton, `lib/env.ts`, Neon client, Vercel, CI, Vitest | — |
| **F02** | Auth, profile & onboarding | Auth.js Google, `profiles`, `/onboarding`, HRmax resolver | F01 |
| **F03** | Data layer | Drizzle schema for §4.3, migrations, all queries, ownership scoping | F01 |
| **F04** | Ingest & vision extraction | `/upload`, client compression, Blob, `/api/extract`, background job, vision client, token-floor guard, Zod + repair | F01, F03 |
| **F05** | Review & correction | `/r/[id]/review`, per-field correction, `extractions.corrections`, commit to `runs` | F03, F04 |
| **F06** | Metrics & records | `lib/metrics/*`, `lib/records/*`, flags, recompute-on-change | F03, F05 |
| **F07** | Insights | `lib/llm/narrate.ts`, session/week/month prompts, Zod + repair, `facts_hash` caching, cron refresh | F06 |
| **F08** | Views, charts & trends | `/`, `/r/[id]`, `/trends`, pace+HR dual axis, zone bar, splits table, weekly/monthly graphs | F06, F07 |
| **F09** | Badges & achievements | `lib/badges/*`, evaluation on commit, `/me` shelf, records display | F06 |
| **F10** | Badge art skill | `.claude/skills/generate-badge/`, `style.md`, `tools/gen_badge_art.py`, `tools/check_badge_art.py`, 22 patches | F09 (catalog only) |
| **F11** | Sharing | `shares`, `/s/[token]`, share button, revocation | F03, F08 |

**Design system:** `docs/design-brief.md` already exists. Pull it via `DesignSync` once F08 has
real screens to dress, and record the integration in `docs/design/DESIGN_INTEGRATION.md`
following the expense tracker's precedent — the design wins over any plan except where an iOS
constraint is at stake.

### Build order

F01 → F03 → F02 → **F04 → F05** → F06 → F08 → F07 → F09 → F11 → F10.

**F04 and F05 are the project.** Everything else is competent CRUD over a good schema. F10 is
last because it spends real money per image and needs the badge catalog to have stopped moving.

---

## 6. Non-goals for v0.1.0

Apple Health / HealthKit import · GPX or route maps · manual run entry as a primary flow (the
schema allows `source='manual'`; no UI ships) · training-plan generation · social features,
following, comparison against other runners · push notifications · streak pressure mechanics ·
weight tracking or any weight-based advice (D15) · a settings page beyond `/me` · non-running
activity types · runtime badge-image generation (D12).
