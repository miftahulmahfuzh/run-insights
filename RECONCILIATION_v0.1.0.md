# Reconciliation — v0.1.0

Eleven feature plans were written in parallel against `ROADMAP_v0.1.0.md` §4. Several proved
parts of it wrong. **This document supersedes any individual plan file and amends the roadmap.**
Rulings are referenced elsewhere as **R-n**.

Written 2026-08-20, after all eleven plans landed.

| Source | Deltas filed | Rulings |
|---|---|---|
| F01 foundation | 4 | R-2, R-14, R-20, R-21 |
| F02 auth & profile | 0 (2 clarifications) | R-12, R-18, R-24 |
| F03 data layer | 6 | R-5, R-6, R-13, R-16, R-22, R-23 |
| F04 ingest & extraction | 0 | R-1, R-2, R-4 |
| F05 review & correction | 3 | R-1, R-7, R-8 |
| F06 metrics & records | 2 | R-3, R-9, R-10 |
| F07 insights | 1 | R-11, R-17, R-19 |
| F08 views & charts | 0 | R-25 |
| F09 badges | 0 | R-26 |
| F10 badge art | 0 | — |
| F11 sharing | 4 | R-11, R-15, R-27 |

---

## Part I — The three genuine conflicts

### R-1 · `runs` rows are NOT created at upload time. Photos attach to the extraction. ⚠️ contract change

**The conflict.** F05 ruled that F04 creates a `runs` row at upload with placeholder sentinels
(`duration_sec = 0`, `distance_m = 0`, `reviewed_at = NULL`) so `run_photos.run_id NOT NULL` has
somewhere to attach. F04 designed the opposite — "no run exists yet at upload time" — and filed
no delta. Both plans are internally consistent and mutually incompatible.

**F05's proposal is unshippable, for a reason neither plan noticed.** `runs.occurred_on` is
`NOT NULL`, and at upload time the date has not been extracted yet. A placeholder row therefore
needs a placeholder date — and R-5's duplicate-upload guard is
`UNIQUE (user_id, occurred_on, coalesce(started_at, '00:00:00'))`. **Two screenshots uploaded on
the same day, before either is extracted, collide on the guard and the second upload fails.**
That is the single most likely thing the author does on a Saturday morning after two weekend
runs.

Placeholder rows are also a straight contradiction of D1. A `runs` row is the durable, reviewed
record; writing one before a human has seen the numbers is exactly the auto-save D1 forbids, and
it survives only because R-13's reviewed-data invariant remembers to filter it out everywhere,
forever.

**Ruling.**

1. `run_photos.run_id` becomes **nullable**. A new **`run_photos.extraction_id text NOT NULL`**
   → `extractions.id ON DELETE CASCADE` is the attachment point at upload time.
2. **The `runs` row is created by F05's `commitReview` action**, in the same transaction that
   writes `run_splits`, `run_zones` and `reviewed_at`, and backfills `run_photos.run_id`.
3. **The pre-commit review route is `/x/[extractionId]`**, not `/r/[id]/review`. `/r/[id]` only
   ever addresses a committed run. Post-review editing is `/r/[id]/edit` and re-uses the same
   component tree.
4. F04's upload flow returns an **extraction id**, not a run id. The design brief's "skeleton of
   the run card" waiting state renders from `extractions.status`, not from a placeholder row.

F05 keeps everything else: it is still the sole writer of `reviewed_at`, the real metrics
columns and the child rows. It gains one responsibility — the `INSERT` itself.

### R-2 · The repair round-trip is text-only. It never resends images.

**The conflict.** F01 mandated a text-only repair, having derived that the expense tracker's
pattern resends the entire prior message array — for vision that is all three images again,
~70–80 s worst case, straight through the 60 s Hobby ceiling. F04 designed a "budget-gated repair
round-trip sized for vision's longer latency" and flagged it *designed, not measured*.

**Ruling: F01 wins, and the measured evidence supports it.** `IMPLEMENTATION_PLAN.md` §1.6
recorded the actual failure mode — a field listed in the tool schema's `required` array simply
absent from the response. That is a **structural** failure, not a perceptual one. The model saw
the image correctly; it emitted the wrong shape. Re-showing it the image cannot help, and costs
~1,700 tokens and ~28 s to learn nothing.

The repair call carries: the original system prompt, the model's malformed JSON, and the Zod
error list. No image parts. F04's §4.6 budget gate stays as a second safety net.

**Corollary:** the token-floor guard (D3) must **not** run on the repair response. A text-only
repair legitimately has a low `prompt_tokens`, and asserting the floor there would fail every
repair. F04's plan already skips repair when the floor trips on the *primary* call; this adds
the converse. Both belong in the same test.

### R-3 · A run's own max HR counts toward its own %HRmax. The fixture is **91.5%**, not 92.5%.

**The conflict.** F06 found that F02's `resolveHrMax` scores the canonical run at 91.5%
(observed max 189, set by that very run) where the roadmap and `IMPLEMENTATION_PLAN.md` §4
state 92.5% (Tanaka estimate 187). F06 read this as a bug and requested a third resolver,
`resolveHrMaxExcludingRun`, to reproduce 92.5%.

**Ruling: the roadmap's 92.5% is the error, not F02's resolver.** F06 identified a real
inconsistency and then resolved it the wrong way round.

The purpose of %HRmax is "how hard was this, relative to your ceiling". This runner's ceiling is
**at least 189 bpm** — the watch recorded it, in this run, and the number is legible on the
heart-rate screenshot's chart axis. Scoring against a formula estimate of 187 that the same
screenshot disproves is not conservatism; it is ignoring evidence. **91.5% against a demonstrated
189 is a truer statement than 92.5% against a contradicted 187.**

This is the concrete instance of the general principle already in §4.4 and §4.1: resolve
observed-first, never formula-first. F06's request would have carved out an exception that
reintroduces the formula precisely where the measurement is strongest.

1. **Every acceptance criterion changes from `92.5%` to `91.5%`**, with
   `hrMaxUsed: 189, hrMaxSource: 'observed'`. Amend `IMPLEMENTATION_PLAN.md` §4, roadmap §4, and
   F06's fixture tests.
2. `VERY_HIGH_AVG_HR` (>90%) still fires. No flag changes.
3. **`resolveHrMaxExcludingRun` is still built — but for the `new_ceiling` badge, not for
   metrics.** "Did this run beat the previous best?" genuinely needs the previous best, and that
   question is F09's, not F06's. Both resolvers ship, with non-overlapping callers, and F02's
   plan must say which is which.
4. **Freeze the denominator at write time.** Stored session metrics and `insights.payload` carry
   `hrMaxUsed` and `hrMaxSource` (see R-11). A later, higher observed max changes future runs'
   scores and invalidates cached insights via `facts_hash`; it must not silently rewrite the
   number displayed on a run reviewed months ago.

---

## Part II — Corrections to the roadmap itself

### R-4 · Which screen owns which field. Settled by reading the screenshots.

F04 flagged its `FIELD_OWNERSHIP` table as an unverified assumption and filed a task to check it.
Resolved here from the three source images, so the task can be closed:

| Field | Summary | Splits | Heart Rate |
|---|---|---|---|
| `avgHrBpm` | ✅ `173` | — | ✅ `173` |
| `maxHrBpm` | — | — | ✅ `189` (chart axis label only — never a labelled field) |
| `restingHrBpm` | — | — | ✅ `72` (zones footnote small print) |
| `postWorkoutHr[]` | — | — | ✅ `185 / 162 / 169` |
| `hrZones[]` | — | — | ✅ |
| `splits[]` | first 3 rows only | ✅ all 11 | — |
| everything else | ✅ | — | — |

Two consequences. `avgHrBpm` is the **only** field present on two screens, so it is the only one
needing a merge rule: **prefer the summary screen; they agreed at 173 in the fixture, and if they
ever disagree that is a genuine extraction fault the reviewer should see.** And `maxHrBpm` /
`restingHrBpm` exist *only* as incidental chrome on one screen — upload the heart-rate screenshot
or R-3's whole HRmax chain silently degrades to the Tanaka estimate.

### R-5 · The duplicate-upload guard is a functional unique index. ⚠️ contract change

Roadmap §4.3's literal `UNIQUE (user_id, occurred_on, started_at)` **does not guard anything when
`started_at` is NULL** — Postgres treats two NULLs as distinct. Adopting F03's fix:

```sql
CREATE UNIQUE INDEX runs_dedupe_idx
  ON runs (user_id, occurred_on, coalesce(started_at, '00:00:00'::time));
```

Under R-1 this now fires at commit rather than at upload, which is also where the user can act on
it — they are looking at the extracted date and time when it happens.

### R-6 · ACWR was defined so that it could never fire. ⚠️ contract change

Roadmap §4 and `IMPLEMENTATION_PLAN.md` §4 both say acute:chronic workload ratio is "7-day ÷
28-day volume", flagged outside 0.8–1.3. F06 proved algebraically that the literal reading is
**structurally pinned at 0.25** for any steady runner and can never enter the band. The 28-day
figure must be a 28-day *average* expressed per week:

```
ACWR = acute7dKm / (chronic28dKm / 4)
```

Adopt F06's definition verbatim. The 0.8–1.3 band is correct for that formula.

### R-7 · `extractions.corrections` is an array per field. ⚠️ contract change

Roadmap §4.3's `{field: {from, to}}` loses history the moment a field is corrected twice, which
R-8 makes a normal occurrence. Adopt F05's shape:

```ts
Record<string, Array<{
  from: unknown; to: unknown
  phase: 'review' | 'post-review-edit'
  checkId?: string          // which consistency check pointed here, if any
  correctedAt: string       // ISO
}>>
```

F03's outer-shape enforcement updates from `Record<string, {from, to}>` accordingly. Path syntax
for nested splits and zones stays F05's to define (F03 delta 6 stands).

### R-8 · New column `runs.corrected_at timestamptz NULL`. ⚠️ contract change

`reviewed_at` answers "has a human ever confirmed this run" and is written exactly once.
Nothing answered "has it been edited since", which F07 and F09 need cheaply. Adopt F05's column.

### R-9 · New columns for HR recovery. ⚠️ contract change

`hrRecovery1MinBpm` (fixture: **23 bpm**) is listed as a required metric in
`IMPLEMENTATION_PLAN.md` §4 and consumed by F07's payload, but nothing persisted it past
`extractions.raw_response`. Adopt F06's addition to `runs`:

```
end_hr_bpm        int NULL   -- postWorkoutHr[0], fixture 185
hr_1min_post_bpm  int NULL   -- postWorkoutHr[1], fixture 162
```

The +2 min reading is extracted and reviewable but feeds no metric and gets no column. Both
columns are reviewable fields on F05's screen.

### R-10 · Records are replaced wholesale, never upserted per key.

Roadmap §4.5 says "recomputed, never incremented" without specifying the write. A per-key upsert
cannot express *deletion* — and a correction that disqualifies the only run holding
`fastest_pace_10k` must remove that record, not leave a stale one. Adopt F03's `DELETE` +
`INSERT` inside one `db.batch`.

### R-11 · `insights.payload` freezes its own denominator. ⚠️ contract change

Adopting F11's delta, reinforced by R-3. Session-scope payloads gain:

```ts
hrMaxUsed:   number | null
hrMaxSource: 'measured' | 'observed' | 'estimated' | null
```

computed at generation time, inside the authenticated path. This is what lets `/s/[token]` render
a %HRmax figure without ever calling `resolveHrMax` live — satisfying F02's INVARIANT B
structurally rather than by discipline — and what makes a months-old insight still explicable
after the runner's observed ceiling has moved.

### R-12 · Additional indexes. Adopted, no discussion.

```sql
CREATE INDEX runs_maxhr_idx    ON runs (user_id, max_hr DESC);                          -- F02
CREATE INDEX insights_latest_idx ON insights (user_id, scope, scope_key, created_at DESC); -- F07
```

### R-13 · The reviewed-data invariant is promoted to a locked decision. → **D16**

F03 named it; it deserves the status. **Every rollup, list, chart, record input and badge input
filters `runs.reviewed_at IS NOT NULL`.** Under R-1 there are no placeholder rows to exclude any
more, but the invariant still matters: it is what stops a future feature from quietly counting an
unreviewed run, and it is the mechanical expression of D1.

### R-14 · Route additions. ⚠️ contract change to §4.8

```
/x/[extractionId]     pre-commit review                     (R-1, replaces /r/[id]/review)
/r/[id]/edit          post-review correction                (R-1)
GET /api/health       unauthenticated liveness probe        (F01)
```

`/api/health` returns `{ ok, db, latencyMs, vision: {baseUrl, model}, narrative: {baseUrl,
model}, commit }` — model ids and base URLs, never a credential.

### R-15 · Revocation rotates the blobs. D7 is not amended.

F11 correctly identified the sharpest issue in the feature and correctly refused to fix it by
quietly widening D7: **a Vercel Blob URL is public and survives revocation forever**, so revoking
a share kills the page but not the images.

F11's photo-proxy would need a Route Handler outside D7's fixed list. **Ruling: rotate instead of
proxy.** On revoke, for each `run_photos` row — fetch the bytes, re-upload under a fresh random
pathname, delete the old blob, update `blob_url` and `pathname`. Old URLs 404. No new route, D7
intact, and the cost is paid once per revocation rather than on every image request forever.

**The UI must say the true thing:** anyone who already opened the link may have saved the images,
and no revocation reaches a copy. That is true of every sharing feature ever built and it must be
stated plainly rather than implied away.

### R-16 · Ownership of shared plumbing.

`lib/id.ts` and `lib/date/ranges.ts` → **F03**. `drizzle.config.ts` → **F01**, at the repo root,
pointing at `./lib/db/schema.ts`; F03 must not move it. `.github/workflows/ci.yml`,
`scripts/check-openrouter-boundary.mjs`, `tests/research/score.test.ts` → **F01**.

### R-17 · There is no deterministic fallback for prose. Adopted as policy.

F07 departed from the expense tracker's three-tier degradation deliberately: a regex fallback
that invents an expense parse is recoverable, and a template that invents coaching sentences is
not. When the narrative model fails twice, the correct third state is **`unavailable`** — F08
renders the metrics and charts with no prose. This is right and is now policy, not one plan's
preference.

### R-18 · Sharing is F11.

F02's plan refers to sharing as "F09/F10" from an earlier numbering. Sharing is **F11**; F09 is
badges, F10 is badge art. Fix on sight.

### R-19 · Insight memory ships. Roadmap §10 open question 2 is closed: **yes.**

F07 designed it as a deterministic `TrendSincePrevious` diff (new / resolved / persisting flags,
volume and pace deltas) fed into the week and month prompts, needing no schema change beyond
R-12's index. It is also the answer to insight fatigue — the thing that stops week 5 reading
identically to week 4.

### R-20 · Background extraction runs via `after()` inside `/api/extract`.

F01's flagship call. `runtime = 'nodejs'`, `maxDuration = 60`, a 55 s internal soft deadline
ported from `parseExpenseWith`'s `Promise.race`, and a stale-pending self-heal so a job that dies
mid-flight cannot leave a row `pending` forever. Stays on Vercel Hobby. R-2 is what makes the
budget fit.

### R-21 · Dependencies and the Next 16 file-name trap.

Add to §3: `nanoid@5.1.16`, `server-only@0.0.1`, `dotenv@17.4.2` (dev-only). And the one that
bites: Next.js 16 renamed `middleware.ts` to **`proxy.ts`** (exported `middleware` → `proxy`),
and Edge is not supported there. F02's plan already gets this right; recorded so nobody
"corrects" it back.

### R-22 · `badges.run_id` is `ON DELETE SET NULL`, and it is the only non-cascade FK.

Flagged so a later contributor pattern-matching every other FK in the file does not "fix" it to
cascade — which would delete badge history when a run is deleted.

### R-23 · `lib/format.ts` is the single formatting authority.

We store `10670` and render `10.67 km` with a **period**, while Apple shows `10,67KM` with a
comma. The extractor's job is to parse Apple's comma; the UI's job is internal consistency. One
module decides both directions.

---

## Part III — Rulings that confirm a plan's judgement

### R-24 · The `/` route is the runs list. There is no marketing page.

### R-25 · The pace+HR dual-axis waiver stands.

The `dataviz` skill names dual-axis charts as its top anti-pattern. F08 took the exception rather
than silently obeying or silently ignoring, and fenced it: inverted pace axis so "up" is faster,
physiologically-anchored rather than tuned domains, shared x-positions, and a mechanical grep
asserting no *other* chart in F08 adds a second y-axis. **The chart earns its exception because
divergence between the two series is the entire content** — on the fixture, pace climbing
6'36"→8'00" while HR climbs 154→183 is the run's whole story in one picture.

### R-26 · The fixture earns seven badges. `warmup_who` does not fire.

F09 hand-verified all twenty predicates and contradicted the brief I gave it. Km 1's HR of 154
sits in that run's **zone 3** (152–163), not zone 4+, so "Warm-Up? Never Met Her" correctly stays
dark. The canonical set is `late_start`, `fast_start_fool`, `redline_republic`,
`cadence_collapse`, `tourist`, `new_ceiling`, `long_way_home`. Refusing to move a threshold to
match a brief is the behaviour this reconciliation wants more of.

### R-27 · `doNext` and `questionForRunner` are withheld from the public share page.

F11's call. Coaching advice about a specific person's body, shown to an unbounded forward chain
of WhatsApp recipients, is a different act from showing it to the person it is about.

### R-28 · Weight never reaches the narrative model.

F07 dropped `weightKg` from the payload that `research/narrate.mjs` included. D15 said no
weight-based coaching claims; F07 made that structural instead of instructional — the model
cannot comment on what it never receives. **D15 is amended to say so.**

---

## Amended decisions

| # | Change |
|---|---|
| **D15** | now reads: *No weight-based coaching claims, ever — enforced structurally: `weight_kg` is never included in any LLM payload.* (R-28) |
| **D16** | **new.** *The reviewed-data invariant: every rollup, list, chart, record input and badge input filters `runs.reviewed_at IS NOT NULL`.* (R-13) |
| **D17** | **new.** *Repair round-trips are text-only. An image is never sent twice.* (R-2) |

## Open, and owned by the author

1. **R-15's honesty copy** — the exact sentence shown next to the revoke button about images
   already saved by a recipient. Worth writing by hand.
2. **`glm-4.6v-flash` intermittency.** The free tier returned `1305 overloaded` during the
   bake-off. Nothing depends on it today; it is the obvious fallback if the coding plan's access
   to `glm-4.6v` ever changes, and `research/matrix.mjs` re-probes in one command.
3. **The Claude Design pull.** `docs/design-brief.md` is written; every hex value in F08 and the
   theme-strip backgrounds in F10 are placeholders until it lands.

---

## Part IV — Design integration (2026-08-20)

The Claude Design pull landed after Parts I–III. Rulings **R-29 … R-35** live in
`docs/design/DESIGN_INTEGRATION.md`; tokens in `docs/design/tokens.css`. Summary of what
changes outside that file:

| Ruling | Effect elsewhere |
|---|---|
| R-31 | **F04 gains `lib/photos/regions.ts`; F05 gains a crop viewer.** The correction sheet shows the screenshot region a value came from. Do NOT change the extraction prompt to get bounding boxes — it is measured at 108/108. |
| R-32 | `century_club` stays **100 km**; the design's tile copy saying 200 km is wrong. |
| R-33 | **The badge catalog grows to 22 keys.** Restore `sandbagger`, `warmup_who`, `double_century`; add `two_a_days` and `boring_excellence`; **cut `rain_tax` — Apple Fitness screenshots carry no weather data, so it can never fire.** F09 rules and F10's scene lines both update. |
| R-34 | **Open, author's call:** the app palette is identical to expense-tracking and daily-words, which collides with §4.7's navy-twill patches. Decide before F10 spends anything. |

`docs/design-brief.md` is now historical — the design it briefed exists. Keep it for provenance.

### R-36 · R-34 resolved: **keep the navy patches, let them be loud.**

The author's call, 2026-08-20. F10's style block ships **unchanged** — dark navy twill, five
saturated threads, safety-orange signature thread. The clash with the warm-paper app is
deliberate: the shelf is quiet so the patches can be loud, exactly as the design's own BadgeTile
caption argues.

**Consequences, so nobody re-opens this:**

- The `#1d2436` placeholder tile in `02 Components.dc.html` is the *intended* final treatment,
  not a stand-in to be re-themed. F09's `/me` shelf keeps a paper-coloured grid with navy tiles
  sitting on it.
- F10's `check_badge_art.py` theme strip renders each patch on **both** `#f0ede4` and `#131311`
  (the app's two paper values, now known — closing F10's flagged open dependency on the design
  pull). A patch must read at 40 px on warm cream, which is the harder of the two.
- The one thing to watch in judging: a navy patch on cream paper has enormous edge contrast, so
  the **merrowed border weight** carries more visual load here than it would on a dark app. If
  patches start looking like stickers rather than embroidery, the border is the first thing to
  adjust — not the substrate.

### R-37 · The two new badges get scene lines. F10's deck is 22.

Written in F10's own format so `style.md` can take them verbatim.

```
- two_a_days: A pair of running shoes set down heel to heel and facing opposite ways, one upright and one fallen onto its side, laces still tied on both. SHAPE: hexagon. SIGNATURE THREAD: the laces of the fallen shoe.
- boring_excellence: A single spirit level lying dead flat across the full width of the patch, its vial centred and its bubble sitting exactly between the two marks. SHAPE: chevron. SIGNATURE THREAD: the bubble in the vial.
```

**Collision audit against the existing twenty.** `two_a_days` is the only shoe in the deck —
F10's style block bans shoes as a *default* centre, and this is the one badge where the object
is the literal subject rather than a lazy fallback, so it is allowed and must stay unique.
`boring_excellence`'s spirit level is the second slender horizontal object after
`metronome`'s pendulum, but the metronome stands upright in a pyramidal case and the level lies
flat edge to edge — no convergence at 40 px. If either ever drifts, change `two_a_days` first; a
pair of identical alarm clocks showing different times is the prepared alternative.

### R-38 · The revocation copy, written.

R-15 left this to be hand-written. It ships as:

> **Stop sharing this run**
> The link stops working and the photos are replaced with new ones, so old image links break too.
> Anyone who already opened it may have saved what they saw — that part no revocation can reach.

Three properties this has to have and does: it says what revocation *does* (link dies, blobs
rotate), it says plainly what it *cannot* do, and it does not apologise for the limitation or
bury it in a tooltip. F11 uses this text verbatim on the revoke confirmation.

### R-39 · Remaining open questions, closed.

| Question | Ruling |
|---|---|
| Copy language | **Straight English.** D10 already said so; recorded here as final. |
| `research/` in the repo | **Stays**, and `score.mjs` runs in CI. D13. |
| Weekly/monthly insight memory | **Ships.** R-19, no schema change beyond R-12's index. |
| `glm-4.6v-flash` | **Not used.** It returned `1305 overloaded` during the bake-off and is unusable as a primary. It stays documented as the fallback if coding-plan access to `glm-4.6v` ever changes; `research/matrix.mjs` re-probes in one command. |
| Design brief status | **Historical.** The design it briefed exists; keep the file for provenance and do not maintain it. |

**Nothing in v0.1.0 is now blocked on an author decision.**

### R-40 · One z.ai key, two endpoints. `LLM_VISION_API_KEY` is deleted. ⚠️ contract change

Roadmap §4.1 specified a separate `LLM_VISION_API_KEY` alongside `LLM_API_KEY`. **That was an
error of symmetry, not of fact** — the two *base URLs* differ, so the env block was drafted as
though the two *credentials* did too. They never did.

Every measurement in `IMPLEMENTATION_PLAN.md` §1 was taken with a single key: `research/lib.mjs`
reads `process.env.LLM_API_KEY` for the coding/vision endpoint, and `research/narrate.mjs` reads
the same variable for the Anthropic endpoint. There was never a second credential to test with.

Re-verified live on 2026-08-20 with one Authorization value:

```
VISION   glm-4.6v @ coding/paas/v4 : 200  in=1502  "The distance is 10.67KM and the average pace is 7'22"/KM."
NARRATE  glm-5.3  @ api/anthropic  : 200  in=14    "OK"
```

`in=1502` is the token-floor canary passing — the image was genuinely processed, not silently
dropped.

**Ruling:** `LLM_VISION_API_KEY` is removed from §4.1, `.env.example`, `.env.local`, and F01's
`lib/env.ts` schema. `lib/llm/vision.ts` authenticates with `env.LLM_API_KEY` and differs from
`lib/llm/narrate.ts` only in base URL, request shape, and header name (`Authorization: Bearer`
vs `x-api-key`). `LLM_VISION_BASE_URL` and `LLM_VISION_MODEL` remain — those genuinely differ.

**On cost, stated precisely.** There is **no additional monetary cost**: the GLM Coding Plan
subscription already covers `glm-4.6v`, which is why the bake-off reached it while
`glm-5v-turbo` returned `1311 not included in your plan` and `glm-ocr` returned `1113
insufficient balance`. What vision calls *do* consume is the **same plan quota** as every other
coding-plan request, including Claude Code usage on this machine. At the author's volume — ~17
runs a month, one extraction each — that is negligible. It would only matter if extraction
started running in a loop, which D4's single-shot background job precludes.

**F01 must not add a `LLM_VISION_API_KEY` entry to `lib/env.ts`.** A second variable holding a
duplicate of the first is a credential-rotation bug waiting to happen: rotate one, forget the
other, and vision fails while narrative keeps working — the most confusing possible failure mode
for this app, because the run still uploads and only the numbers go missing.
