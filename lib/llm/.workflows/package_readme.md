# Package: `lib/llm`

**Location**: `lib/llm`
**Last Updated**: 2026-09-12 (first `package_readme.md`. The prose README.md that stood in the
package root since F07 was folded into this file the same day and deleted — one map, one home,
per the repo's `.workflows/package_readme.md` convention. Its "boundary enforced in CI" claim,
which the 2026-09-12 llm-yagni-audit flagged as unverified, was VERIFIED TRUE by direct
inspection: `.github/workflows/ci.yml` runs `npm run ci:llm-payload-guard` as its own step.)
**Documentation Created**: 2026-09-12

## Overview

`lib/llm` is the whole of the app's direct contact with language models, and it has exactly two
of them. The **vision path** sends 1–3 Apple Fitness screenshots to `glm-4.6v` over an
OpenAI-shaped `chat/completions` endpoint with a bare `fetch` and gets back the 108-field
`ExtractedSession` JSON. The **narrative path** sends precomputed, rounded, formatted facts to
`glm-5.3` over an Anthropic-compatible endpoint through `@anthropic-ai/sdk` and gets back a
coaching report via one forced tool call. Everything else in the package is the machinery that
makes those two calls honest: the facts builders that bound what the model is allowed to know,
the SHA-256 that keys the insight cache, the prompt constants, and the no-redeploy model switch.

**Key responsibilities:**

- **Vision extraction** — `vision.ts` (the call + the token-floor guard), `extract.ts` (the
  primary→validate→repair orchestrator), `runExtractionJob.ts` (the `after()` job that always
  writes a terminal `extractions` row), `prompts/extraction.ts` (the measured 108/108 prompt),
  `extractJson.ts` (JSON recovery from chatty output).
- **Narrative insights** — `narrate.ts` (the call, the one repair, the cache),
  `facts.ts` (the payload boundary, session/week/month builders), `prompts/narrate.ts` (three
  system prompts + the one tool schema), `schema.ts` (the Zod output contract),
  `factsHash.ts` (the cache key).
- **The model switch** — `catalog.ts` (the closed vocabulary, browser-safe) and `textModel.ts`
  (the live `app_settings` resolver and its admin writer).

## The map

| File | One line |
|------|----------|
| `catalog.ts` | The text-model vocabulary. Zero imports; the only module a `'use client'` component may hold. |
| `client.ts` | The `glm-5.3` client — lazy `@anthropic-ai/sdk` singleton, `maxRetries: 0`, narrative endpoint only. |
| `textModel.ts` | Reads `app_settings.text_model` live at dial time; never throws; admin's write half. |
| `facts.ts` | THE BOUNDARY. Everything the model may know, built as pure functions. No I/O, no `server-only`. |
| `factsHash.ts` | SHA-256 over recursively key-sorted facts. The insight cache key. |
| `narrate.ts` | Primary call → Zod → one repair → silence, plus the `insights` cache and store. |
| `prompts/narrate.ts` | Three system prompts, `REPORT_TOOL`, `REPAIR_PREAMBLE`, per-scope prompt versions. Constants only. |
| `schema.ts` | `InsightPayloadSchema` — the load-bearing output contract — and `describeInsightIssues`. |
| `vision.ts` | The `glm-4.6v` call via bare `fetch`, and THE TOKEN-FLOOR GUARD. |
| `prompts/extraction.ts` | The extraction prompt, byte-for-byte from the measured 108/108 recipe. |
| `extract.ts` | primary → Zod → one text-only repair → terminal outcome. Never throws for an LLM problem. |
| `extractJson.ts` | First `{` to last `}`, fences stripped, `null` on any failure. Ported, not improved. |
| `runExtractionJob.ts` | The `after()` body of `POST /api/extract`: blob fetch → extract → terminal row. |

**`server-only` split:** `client.ts`, `textModel.ts`, `narrate.ts`, `vision.ts`, `extract.ts`,
`runExtractionJob.ts` open with `import 'server-only'`. The other seven (`catalog.ts`,
`facts.ts`, `factsHash.ts`, `extractJson.ts`, `schema.ts`, both `prompts/*`) are pure — no I/O,
no env — which is what lets tests pin them without the dummy-env scaffolding
`tests/support/setup.ts` exists to provide. `catalog.ts` is the only one a browser component
may import (see rule 15).

## The standing rules of the package

1. **Nothing throws for an LLM problem.** Every vendor failure on either path becomes a
   terminal, auditable outcome. Vision: `extractSession` returns `failed` with a specific
   `errorCode`, and `runExtractionJob`'s last-resort catch still writes the row — a stuck
   `pending` is worse than a failed one. Narrative: `narrateWith` returns
   `{ payload: null, source: 'unavailable' }`, `console.warn` not `console.error` (an absent
   narrative is an expected state of the feature, §7.3, not an incident). Only a genuinely
   unexpected error rethrows, and the job wrapper converts even that into a row.
2. **A model call is never awaited from a page render.** Enforced by
   `scripts/check-llm-payload-boundary.mjs` (`npm run ci:llm-payload-guard`), which runs in CI
   (`.github/workflows/ci.yml`, verified 2026-09-12). Of its nine guarded symbols, this package
   owns `getOrCreateInsight` — sanctioned in `lib/insights/actions.ts` (Server Action from a
   client effect) and `app/api/cron/rollup/route.ts` only; the other eight are Nina's entry
   points in `lib/nina/`. The guard scans `.ts`/`.tsx` and strips comments first ("prose may
   say the name"), so mentioning a symbol in a comment or this file is safe. The honest fix for
   a moved call site is the array entry, not a rename. Note the distinction:
   `narrativeModel()` is a database read, not a model call — `app/admin/personality/page.tsx`
   may and does await it in render. The clients are what the guard fences.
3. **The model computes nothing.** Every number the prose may quote must appear verbatim in the
   facts it was handed. MEASURED (facts.ts header): asked to compute aerobic decoupling from raw
   splits, `glm-5.3` returned −14.1% against a true +12.3% — a flipped sign, on an easy
   calculation. Hence `daysBefore` precomputed, zone shares precomputed, drift precomputed,
   and HARD RULE #1 of every system prompt.
4. **Every string in a payload comes from `lib/format.ts`.** A pace in the prompt is
   `formatPace(442, true)` — the same characters the run page renders. Two spellings of one
   number is how a narrative quotes `7:22` at someone looking at `7'22"/km` (R-23).
5. **Round at the boundary, then hash.** `facts.ts` applies display precision exactly once
   (`round0`/`round1`). An unrounded `12.299999999999999` and `12.3` are the same run to a
   reader and two different `facts_hash` values to Postgres; rounding first stops a float
   wobble in the sixteenth decimal from regenerating an insight nobody asked for.
6. **`factsHash` is a pure function of the facts.** Object keys sorted recursively in plain
   code-point order — `localeCompare` is deliberately not used (ICU drift would move the hash
   with the runtime). **Arrays are NOT reordered**: splits are ordered by km, flag lists are
   sorted by the builders themselves, and that order is meaningful — reordering `splits` must
   and does change the hash (pinned by `tests/llm.factsHash.test.ts`). `promptVersion` is
   folded into the hashed object but deleted from the user turn (`visibleFacts`) — it exists to
   bust the cache, not to be mentioned.
7. **Absent and null canonicalise differently — required-nullable keys are always present.**
   `profileFacts` emits `weightKg: null` and `sex: null` for a runner with no profile rather
   than omitting the keys; an optional field there would mean two hashes for one runner. This
   is also why both fields are REQUIRED on `NarrativeProfile` — a caller must decide every
   field a payload carries.
8. **One repair, text-only, budget-gated.** Primary → validate → at most one repair → terminal,
   on both paths. The repair echoes the malformed output as an assistant turn and appends the
   Zod issues as a bullet list (capped at 12 — a prompt with sixty bullets is a prompt the
   model skims). Skipped when `finish_reason` is `max_tokens`/`length` (the same prompt and
   ceiling will cut identically — a repair there re-proves a known outcome) and when less than
   `MIN_REPAIR_BUDGET_MS` remains.
9. **`MIN_REPAIR_BUDGET_MS` is a twin name with two different values.** `narrate.ts` exports
   3_000 (narrative repair, overall budgets 45–50 s); `lib/extract/constants.ts` exports
   28_000 (extraction, inside a 55 s job deadline). Both alive, both pinned by different
   suites — a grep hit for one is not the other. This is the same twin-name trap the
   2026-09-12 YAGNI sweep documented for the whole repo.
10. **`thinking: { type: 'disabled' }` on BOTH endpoints — never remove.** Both measured.
    Narrative (2026-08-26/27): `glm-5.3` began emitting a thinking block by default; it ate the
    entire `max_tokens` ceiling before any tool_use was produced, every scope returned
    `unavailable`, and the `insights` table stopped growing for 31 hours with nothing recorded
    why — a failure here persists nothing. Raising the ceiling is not the fix (4000 tokens buys
    4000 tokens of thinking and still no answer). Vision: thinking doubled latency (73 s vs
    33.7 s) for an identical 108/108 score. `tests/llm.narrate.test.ts` and `vision.test.ts`
    guard the field on both.
11. **No retries under the app's own budgets.** The SDK client is built with `maxRetries: 0` —
    the default two silent retries under a per-call timeout mean one "25 s" call can occupy the
    whole 45 s overall budget and starve the repair. The repair IS the retry: the only retry
    that has a chance of changing the outcome. Vision uses `AbortSignal.timeout` per call for
    the same reason.
12. **The token floor GATES parsing.** `TOKEN_FLOOR_PER_IMAGE = 500` (MEASURED: the Anthropic-
    shaped endpoint accepts an image, returns HTTP 200, silently drops it, reports ~141 prompt
    tokens for the whole request, and invents numbers; a real screenshot costs ~1,092 input
    tokens — 500×count sits above the drop signature and below any real image). The check sits
    above every read of `choices` and before the status check (the measured failure was itself
    a 200), and throws `VisionTokenFloorError` — the one class that must never be repaired
    (same endpoint, same request shape, same behavior). The floor multiplies by `imageCount`:
    a flat floor would let a 3-image request with one image delivered slip through. The
    text-only repair passes `imageCount: 0` and is floored not at all — R-2's corollary, not an
    oversight. The guard is NOT ported to the narrative client: F07 sends no images, and a
    guard against a condition that cannot arise is dead code that reads like a live defence.
13. **Provenance from our records, never the model's answer.** `kindsPresent` is derived from
    OUR upload records (`runExtractionJob`), never from what the model claims to have seen —
    that is what makes the provenance guard undefeatable. The extraction prompt's rule 8 does
    the same work on the model side: a screen kind not among the labels given does not exist.
14. **The tool schema's `required` array is documentation, not enforcement.** MEASURED
    (2026-08-21): z.ai returned HTTP 200 for a forced `report` call omitting `title` from every
    observation despite the array. Only `InsightPayloadSchema` — the Zod check on the way IN to
    the database — is load-bearing, and only its `.max(70)` on `headline` actually holds the
    one-line hero slot. Same lesson for the extraction SHAPE block.
15. **`catalog.ts` is the only browser-safe module, and its list is closed.** Zero imports, so
    the `'use client'` dropdown (`components/admin/TextModelSelect.tsx`), the Server Action's
    Zod boundary, and the server resolver read ONE vocabulary. An unknown id degrades toward
    `env.LLM_MODEL` at the read and never reaches the provider — a model call that fails after
    the turn's tokens are spent is the failure a closed list exists to prevent. (Both ids were
    verified live 2026-09-10 against the Anthropic-shaped face, not the coding endpoint.)
    `tests/share.bundle.test.ts` independently asserts no `lib/llm/` file enters the public
    share-page bundle graph.
16. **`narrativeModel()` never throws and is read live at dial time.** One indexed
    primary-key read per text call, on paths that already read the tuning or the session. Any
    failure — unreadable row, unknown value, database down — warns and answers
    `env.LLM_MODEL`, because a settings read that cannot happen must not cost a turn. A
    silent model swap is Nina waking up with a different voice, which is why the degrade
    warns when the row holds an unknown id. The env fallback must stay inside the catalog's
    vocabulary — pinned by `tests/llm.textModel.test.ts` since the YAGNI sweep made the
    catalog's old claim true.
17. **The measured prompt text is load-bearing.** The extraction prompt's RULES 1–7 and the
    SHAPE block are byte-for-byte the wording that scored 108/108 five consecutive times
    (`research/schema.mjs`); rules 6a, 8, 9, 10 are ADDITIVE, never replacing measured text.
    Rewording a measured rule requires re-running the scorer before shipping. Same principle
    on the narrative side: `SESSION_SYSTEM_PROMPT` is near-verbatim from
    `research/narrate.mjs`, the one prompt in the repo with a measured output attached
    (1,743 in / 546 out, a verdict a human agrees with).
18. **`EXTRACTION_SYSTEM_PROMPT` and `EXTRACTION_SHAPE` keep their `export` for a non-TS
    consumer.** `scripts/f04-e2e-probe.mjs` regex-scrapes them out of the source text
    (`` export const ${name} = ` ``) because the probe replays the job without a TS loader.
    Dropping the keyword silently changes what the probe reads while `tsc` stays green —
    knip reporting these two as unused is EXPECTED and must not be "fixed". This is the
    repo's canonical example of a regex-scrape contract, the one blind spot a type-checker-
    backed dead-export sweep has.
19. **Images travel as data URIs, not hosted URLs.** §2.2: the bytes are already on a public
    CDN, but a `url:`-only `image_url` pointing at the Blob URL was never probed against this
    endpoint, and per §1's whole lesson an untested request shape on this vendor is not
    something to trust in production — especially when the failure mode is "200 OK with
    invented numbers".
20. **A prompt edit is a cache-key edit.** `facts_hash` hashes the numbers, so editing a prompt
    without bumping the scope's `*_PROMPT_VERSION` (same commit) means the stale insight serves
    forever. "The prompt" includes `REPORT_TOOL` — MEASURED (2026-08-21): adding property
    descriptions took first-attempt validity from 0/3 to 5/6, and the repaired path cost 16–21 s
    and two calls where the first-attempt path costs 13.6–15.7 s and one. No test can catch a
    missed bump — review only. After an edit, re-run `npm run test:live:narrate` (a few cents,
    ~35 s).

## The two clients (why this package has two and they share nothing)

| | vision (F04) | narrative (F07) |
|---|---|---|
| Endpoint | `LLM_VISION_BASE_URL` — `api.z.ai/api/coding/paas/v4` | `LLM_BASE_URL` — `api.z.ai/api/anthropic` |
| Wire format | OpenAI Chat Completions | Anthropic Messages |
| Client | plain `fetch` (`vision.ts`) | `@anthropic-ai/sdk` (`client.ts`) |
| Auth header | `Authorization: Bearer` | `x-api-key`, sent by the SDK |
| Credential | `LLM_API_KEY` | `LLM_API_KEY` — the same one (R-40) |
| Token-floor guard (D3) | **yes, and it is the point** | no, and adding one would be dead code |
| Repair round-trip | text-only, images never resent (R-2) | text-only; there are no images |

The request envelopes genuinely differ — an image part is
`{ type: 'image_url', image_url: { url } }` there and `{ type: 'image', source: {…} }` here —
so one client cannot serve both, and the SDK buys nothing on the vision side. There is
deliberately **no `LLM_VISION_API_KEY`**: a second variable holding a copy of the first is a
rotation bug waiting to happen (R-40: one z.ai key serves both endpoints).

The narrative client is a lazy singleton, not a module-level `new`: `lib/env.ts` already
crashes the build on a missing key, so eager construction buys no earlier failure — it only
makes every module that imports a type from here pay for an HTTP agent.

## The facts boundary (`facts.ts`)

`lib/insights/load.ts` does the fetching and hands the rows in; `facts.ts` turns them into
prose-ready payloads as pure functions — the same gateway pattern as `lib/records/recompute.ts`.
The builders: `buildSessionFacts`, `buildWeekFacts`, `buildMonthFacts`, plus the period helpers
`aggregatePeriodFlags` (deduped to the WORST value per code, `|value|` comparator, because
`CADENCE_FADE` is worst at its most negative and `TOO_MUCH_HARD` at its most positive) and
`buildTrendSincePrevious` (set arithmetic over flag codes plus two deltas — the entire
anti-repetition mechanism, deterministic on purpose; never the model diffing headline strings).

**What never enters a payload** (each its own decision, recorded in the file header):
`runs.note` (a runner's unverified words mixing with reviewed numbers defeats D2); raw
per-second HR/GPS series (only zone-bucketed aggregates); anything requiring arithmetic to
answer (rule 3 above). `weightKg` and `sex` WERE forbidden (D15/R-28) and are REPEALED under
RU-1 — the payload carries both as required keys, self-reported and labelled as such in every
prompt, with the file header recording the repeal so nobody "fixes the leak" that was decided
away.

**Shape invariants worth knowing before editing:**

- `NarrativeProfile` is a FOUR-field type (`birthYear`, `heightCm`, `weightKg`, `sex`),
  deliberately not F03's `Profile` — a spread of the row would carry `restingHr`, `maxHr`,
  `onboardedAt`, `updatedAt` into a payload, and `hrMax` arrives separately, resolved and
  labelled `measured`/`estimated` (an estimated HRmax is a Tanaka formula and every prompt has
  a rule about saying so — IMPLEMENTATION_PLAN §4.1 measured the estimate wrong by 2 bpm on the
  first run analysed).
- `age` is derived from `birthYear` at build time, never carried: a birth year in a payload is
  a birth year in a cache key that changes meaning every January.
- `recentRuns` is newest-first, `[]` (never `null`) when there is no earlier reviewed run — the
  prompt states what an empty array means so it cannot read as "this runner does not run".
  Each entry carries `daysBefore` precomputed in whole days and NO splits (§1.1 admits one full
  child inclusion per payload and this run's own splits spend it; eight earlier runs at eleven
  splits each is the averaging-by-hand this boundary exists to prevent).
- `weeklyContext` is `null` when absent, while `recentRuns` is `[]` — the distinction is
  deliberate and prompt-referenced.
- `metrics.hrMaxUsed` is copied, never re-resolved (R-11): the denominator that produced
  `avgHrPctMax` is the one the prose must label, and resolving again opens a window in which
  they disagree.

## The narrative path (`narrate.ts`)

**Budgets** (per scope; measured against live `glm-5.3`, 15 calls on 2026-08-21 clustering at
13–16 s — the plan's original 15 s primary would have aborted a third of them):

| Scope | primary | repair | overall | max_tokens |
|---|---|---|---|---|
| session | 25 s | 18 s | 45 s | 1,200 |
| week | 28 s | 20 s | 50 s | 1,600 |
| month | 28 s | 20 s | 50 s | 1,600 |

Week and month carry `trendSincePrevious` and a weekly series on top of a session's payload and
get proportionally more; **neither has a live measurement yet** — the numbers are the session's
scaled, and the file header says to revisit once `/trends` has run against real history.
`SESSION_OVERALL_MS` is exported so the deadline-gate test never hardcodes the number. A
`max_tokens` stop is never a validation failure to repair: `maxTokens` is already ~2× the
measured ~546–633 output tokens, so if the truncation path starts firing, the ceiling is the
bug.

**The cache rule.** Read the NEWEST row for `(userId, scope, scopeKey)` — one index seek on
`insights_latest_idx` — compare its `facts_hash` to the hash just built. Equal is a hit (no
call; `cached: true` is the informative field — a hit reports `source: 'llm'` whether the
stored row originally needed a repair, because `insights` has no column for that and two
byte-identical rows are not worth a migration). Different means something real moved and the
model runs. Reading newest rather than probing for the exact hash is what makes the stale case
OBSERVABLE — a corrected run regenerates instead of quietly serving old prose forever. Old rows
are kept: an insight is immutable once written (`saveInsight` is insert-if-new), so a narrative
a runner has already read never changes under them.

**On failure, nothing is persisted.** No row, no marker, no negative cache; the next natural
view retries for free. But note the asymmetry (F31 corrected this comment after it was simply
wrong): **a page view is the only retry a SESSION insight gets** — `/api/cron/rollup` iterates
week and month only. Week and month get the cron as a second chance; sessions do not, and
giving them one is a feature with its own budget and ordering questions inside the 60 s
function, not a comment fix.

**Sanctioned callers only** (rule 2): `getOrCreateInsight` takes 10–35 s on a miss. The run
detail page ships its stored metrics immediately; the narrative arrives via the Server Action
after the page has painted, or with the nightly cron for periods.

**The stored session payload carries its denominator** (R-11): `payloadToStore` appends
`hrMaxUsed`/`hrMaxSource` to session-scope payloads at the moment they become rows, so
`/s/[token]` — a public, unauthenticated page — can render a %HRmax figure without ever calling
`resolveHrMax` into the owner's profile (satisfying F02's INVARIANT B structurally), and a
months-old insight stays explicable after the observed ceiling moves. Reading a stored payload
back is tolerant (`readStoredPayload`): a row written before a schema change is treated as no
row rather than crashing a render.

## The vision path (`vision.ts` → `extract.ts` → `runExtractionJob.ts`)

**`runExtractionJob`** is the body of the `after()` in `POST /api/extract` and owns exactly one
promise: **always write a terminal `extractions` row** — `ok`, `repaired` or `failed` — even
for an unexpected crash (caught, logged loudly, closed as `transport`). The stale-pending
self-heal in `GET /api/extract/[id]` exists for the one case this cannot cover (the invocation
killed outright), not as a substitute. Blob fetches get 10 s max (`Promise.all`, one
`AbortSignal.timeout` each) and re-encode as `data:image/jpeg;base64` (rule 19); the media type
is known rather than sniffed because compression always emits JPEG and the upload route allows
only that. `kindsPresent` comes from the upload records (rule 13).

**`extractSession`** builds the Zod schema from `kindsPresent` (`makeExtractedSessionSchema` —
fields for absent screens aren't merely null-checked, they're refused), makes the primary call,
recovers JSON with `extractJsonObject`, validates, and on failure runs the one text-only repair
(R-2/D17: the measured failure mode is structural, not perceptual — re-showing the image costs
~1,700 tokens and ~28 s to learn nothing) with the budget measured against **actual elapsed
time**, not the primary timeout (subtracting the timeout understates remaining budget by up to
45 s on the happy path and would skip almost every repair that could have succeeded).

**`extractions.raw_response`** (`RawResponseColumn`, a convention on an existing jsonb column,
no migration): `{ vendor, parsedSession, attempts }`. `vendor` holds the exact body the
endpoint returned — the canary worth storing even on failure: a `token_floor` row whose
prompt_tokens reads 141 is the difference between "the vendor dropped the images" and "the
model wrote bad JSON", months after the fact. `parsedSession` is stored PRE-validated so `GET`
is a pure read — re-parsing on every poll could disagree with what was written, and "the
numbers changed while I was looking at them" is the one thing D1 cannot tolerate. On a repair
failure the PRIMARY response is kept as `raw_response`: it is the more informative artefact.

**`extractJsonObject`** is ported verbatim from `research/score.mjs`, proven against every
feasibility run including the 108/108 runs, and deliberately not "improved". It returns `null`
for every failure (no fence, no braces, malformed JSON, a non-object between the braces) — the
orchestrator treats "no parseable object" and "parsed but failed Zod" identically, so a thrown
exception would only mean a try/catch at the one call site. It takes the FIRST `{` to the LAST
`}`, which strips chatty output by construction and survives nested braces.

## The model switch (`catalog.ts` / `textModel.ts`)

The 2026-09-10 ask: move every TEXT generation between `glm-5.3` and `glm-5.3-flash` from
`/admin/personality` with no redeploy. The mechanics: `writeNarrativeTextModel` (admin action
only, argument is the NARROW catalog id) upserts one `app_settings` row keyed `text_model`;
every text call reads it via `narrativeModel()` at the moment it dials — the same no-cache
discipline as the image path's prefs row, so a switch is in force on the next turn. The
resolver was already the one seam (every Nina consumer reaches it through the `ninaModel`
alias — `export const ninaModel = narrativeModel` in `lib/nina/turn.ts`); the override changed
what the seam reads, not how many seams exist. Degrade order: declared row value →
`env.LLM_MODEL` (no row, unreadable row, or unknown value, the last with a loud warn). The
shipped default is deliberately NOT restated as a constant: the degrade lands on the LIVE env
value, and a second spelling of "the default" is one more name that can drift.

Vision has no switch: `env.LLM_VISION_MODEL` is read directly, by design — the dropdown is a
text-generation control and the image path's model was verified separately.

## Error handling

Custom error classes (both in `vision.ts`, both carrying structured fields):

- `VisionTokenFloorError(promptTokens, imageCount)` — the guard tripped; maps to
  `errorCode: 'token_floor'`; never repaired (rule 12).
- `VisionTransportError(message, detail?)` — network failure, timeout, non-JSON body, or a
  non-200 that cleared the floor; `codeForVisionError` inspects `detail`'s name
  (`TimeoutError`/`AbortError`) to split `timeout` from `transport`, because "the reader was
  slow" and "the reader was unreachable" have different odds on retry.

`ExtractionErrorCode` taxonomy (defined in `lib/extract/constants.ts`, written to
`extractions.error_code`): `token_floor` | `timeout` | `transport` | `validation`. The
narrative path has no error codes because it has no error states to name — `source`
(`'llm' | 'llm_repair' | 'unavailable'`) is its whole outcome vocabulary, and `payload: null`
is not an error (see Usage).

No panics, no custom `Error` subclasses beyond the two above, no error wrapping strategy —
errors on these paths are consumed, classified, and closed, not propagated. Logging discipline:
`console.warn` for expected LLM failures (narrate stages, extraction failures, settings
degrades); `console.error` only for genuine bugs (blob fetch failure, job crash, the
could-not-even-record-the-failure case).

## Concurrency

The package is stateless apart from one lazy singleton (`client.ts`'s Anthropic client, built
once per process) and contains no locks, no atomics, no shared mutable state. The only place
parallelism appears is `runExtractionJob`'s `Promise.all` over the 1–3 blob fetches, each with
its own `AbortSignal.timeout`. Every entry point is safe to call concurrently; the insight path
tolerates a concurrent miss racing twice (both callers call the model, one `saveInsight` wins
as insert-if-new, nothing is corrupted — `insights` is unique on
`(user_id, scope, scope_key, facts_hash)`). There is no long-lived work: nothing spawns
timers, workers or subscriptions, and nothing needs closing.

## Performance

Allocation is light and bounded by design — the facts builders produce one small object per
call, and the heavy payloads (base64 screenshots, ~60 KB each) exist only inside one job
invocation. The expensive operations are the model calls themselves, and the package's whole
budget architecture exists to bound them:

- Narrative: 13.6–16.4 s measured per live call (2026-08-21); `thinking` disabled (~17 s vs
  18–38 s when the model thinks itself out of its token ceiling); ~546–633 output tokens
  against a 1,200–1,600 ceiling.
- Vision/extraction: ~33.7 s with thinking disabled (73 s with — identical accuracy); a real
  560w/q80 screenshot costs ~1,092 input tokens (3,277 for three); the full 108-field JSON
  completes in ~950 output tokens against `MAX_TOKENS = 4096`.
- Extraction job deadline: 55 s (`JOB_DEADLINE_MS`, inside the function's 60 s ceiling),
  primary call timeout 45 s, repair 36 s, repair skipped under 28 s remaining
  (`lib/extract/constants.ts` — see the twin-name warning, rule 9).
- Cache: a hit is one indexed read (`insights_latest_idx`) plus one SHA-256 over a few KB —
  `factsHash` alone decides whether opening `/trends` costs ten seconds and a model call or one
  seek.

Benchmark coverage: none (no `*_benchmark_test.go`-style files; this is a TypeScript package).
Latency evidence lives in committed research artefacts
(`research/results-narrative.json`, `research/results-downscale.json`) and the measured notes
in each file header.

## Configuration

Environment (`lib/env.ts`, all required, validated at load):

- `LLM_API_KEY` — the one z.ai credential, sent two ways (Bearer by the vision fetch, `x-api-key` by the SDK).
- `LLM_BASE_URL` / `LLM_MODEL` — the Anthropic-shaped narrative endpoint and deployed default model.
- `LLM_VISION_BASE_URL` / `LLM_VISION_MODEL` — the OpenAI-shaped coding endpoint (`/chat/completions` is appended in code) and `glm-4.6v`.
- Deliberately absent: `LLM_VISION_API_KEY` (R-40).

Runtime setting: `app_settings` row `text_model` (written only by
`writeNarrativeTextModel`; read live by `narrativeModel`). No cleanup/disposal anywhere —
nothing in the package holds a resource that needs closing.

## Dependencies

**External:** `@anthropic-ai/sdk` (narrative client + the `Anthropic.Tool`/`Message` types
shaping narrate's surface), `zod` (both output contracts — `InsightPayloadSchema` here,
`makeExtractedSessionSchema` in `lib/schema/extractedSession.ts`).

**Internal:** `lib/env` (the five vars); `lib/db` + `lib/db/queries` (`getLatestInsight`,
`saveInsight`, `appSettings`, and `InsightScope` from `lib/db/schema`); `lib/format`
(`formatDay`/`formatDuration`/`formatPace` — rule 4); `lib/metrics/*` (`SessionMetrics`,
`SplitRow`, `Flag`, `HrMax`, `DistanceBucket`, `ageFromBirthYear` — types and precomputed
numbers the facts builders repack, never recompute); `lib/date/ranges` (`daysBetween`);
`lib/extract/constants` (budgets, `ScreenKind`, `ExtractionErrorCode`, `UPLOAD_CONTENT_TYPE`);
`lib/schema/extractedSession` (the 108-field contract + `describeZodIssues` twin);
`lib/schema/extractionResult` (`ExtractionBlobRef`).

**Stdlib:** `node:crypto` (`factsHash` — SHA-256), `node:fetch` + `AbortSignal.timeout`
(vision), `Buffer` (blob → base64). Deliberately NOT used: `crypto.subtle` (the hash must be
synchronous), `localeCompare` (rule 6), the SDK's retry machinery (rule 11).

## Reverse dependencies

**Primary consumers** (the reason the surface exists):

- `lib/nina/*` — every text turn Nina makes resolves the model through
  `narrativeModel` (aliased `ninaModel` in `lib/nina/turn.ts`) with `narrativeClient`:
  the chat turn (`turn.ts`/`chatturn.ts`), memory distillation (`distill.ts`), photo captions
  (`caption.ts`), autotitles (`autotitle.ts`), semantic search ranking (`semantic.ts`, which
  also borrows `extractJsonObject` for its own structured output).
- `lib/insights/load.ts` + `lib/insights/actions.ts` — build facts via the `facts.ts` builders
  and `promptVersionFor`, then call `getOrCreateInsight` from the Server Action.
- `app/api/cron/rollup/route.ts` — the nightly week/month `getOrCreateInsight` sweep.
- `app/api/extract/route.ts` — `runExtractionJob` in `after()`.

**Secondary / type-only consumers:**

- `lib/admin/textModelActions.ts` — `NARRATIVE_TEXT_MODEL_IDS` (the Zod boundary), `writeNarrativeTextModel`.
- `components/admin/TextModelSelect.tsx` — `catalog.ts` only (`'use client'`; the zero-import rule is what makes this legal).
- `app/admin/personality/page.tsx` — `narrativeModel` for display (a DB read, render-safe).
- `lib/extract/readExtraction.ts`, `lib/review/loadReview.ts` — `type RawResponseColumn` only.

**Test consumers:** in-package (`extract.test.ts`, `extractJson.test.ts`, `vision.test.ts`)
and `tests/llm.{facts,factsHash,narrate,schema,textModel}.test.ts` (unit, fake clients/fetch),
`tests/research/goldenFixture.test.ts`, `tests/nina.prompts.test.ts` (source-reading),
`tests/live/{narrate,vision}.live.test.ts` (real API, costs money, `npm run test:live:*`),
`tests/share.bundle.test.ts` (asserts the share bundle contains NO `lib/llm/` file).

**Named in but not importing:** the boundary guard's advice strings, `knip.ts` (the
EXTRACTION_SHAPE exemption note), and several comment references across `app/` and
`components/` — prose, not imports (the guard itself strips comments for the same reason).

## Usage

### Correct

```ts
// A Server Action, after the page has painted — never in the render itself.
'use server'
export async function ensureRunInsight(scope: InsightScope, scopeKey: string) {
  const facts = await loadNarrateFacts(scope, scopeKey)   // lib/insights/load.ts
  const result = await getOrCreateInsight(userId, scope, scopeKey, facts)
  // result.source === 'llm' | 'llm_repair' | 'unavailable'; result.cached says whether a call happened.
}
```

### `payload: null` is not an error

It is the expected shape of "no narrative yet", with three causes that render the same way: not
generated yet, model unreachable, or the model answered twice and never validated. There is no
deterministic fallback for prose (R-17) — a canned sentence in a coach's voice is the model
inventing a fact, moved into our code so it looks accountable; the only safe fallback for prose
is the absence of prose. `InsightCard` renders its reserved slot, the metrics and charts around
it are unaffected, and the next page view retries for free because a failure persists nothing.
**Do not surface it loudly. Do not add a retry button. Do not log it as an error.**

### Anti-patterns

- Calling `narrativeClient()` and dialing a model yourself instead of going through
  `narrateWith`/`getOrCreateInsight` — the budget, repair, and thinking-disabled discipline
  live in those functions, and the boundary guard will not know your call site.
- Spreading a profile/settings row into a facts builder — `NarrativeProfile` names its four
  fields precisely so a spread is a compile error, not a code-review catch.
- Editing a prompt (or `REPORT_TOOL`'s descriptions) without bumping `*_PROMPT_VERSION` in the
  same commit — no test can catch it; the stale insight serves forever (rule 20).
- "Fixing" knip's report on `EXTRACTION_SYSTEM_PROMPT`/`EXTRACTION_SHAPE` by dropping the
  `export` — breaks the f04 probe's source-text scrape silently (rule 18).
- Porting the token floor to the narrative client "for consistency" — dead code that reads
  like a live defence (rule 12).
- Adding a third client without reading the two-clients table — the repo's bet is that the
  next endpoint either speaks one of these two envelopes or gets its own module with its own
  measured notes, never a shared abstraction over "mostly the same thing".

## Historical Context

- **F04** (ingest/extraction) created `vision.ts` + the token-floor guard and measured
  everything twice — once the failure (§1.1: 200 OK, image silently dropped, numbers invented)
  and once the fix. **F07** added the narrative path, the facts boundary, and the insight
  cache. F28 added `recentRuns` (against a measured production failure: the model spent three
  of its four prose fields restating `runsPerWeek`); F30 added prompt rule 10 (the clock
  conversion, after 15 human corrections on `startTime`); F31 corrected this package's own
  claim that cron backfills failed session narratives — it does not.
- **RU-1 repealed D15/R-28**: `weightKg`/`sex` moved from forbidden to required in the payload
  (F33's chatbot-physician premise; the user's reasoning is recorded verbatim in the `facts.ts`
  header and in `scripts/check-llm-payload-boundary.mjs`, where the old grep was removed rather
  than disabled — restoring the rule means restoring the ruling first).
- **2026-09-12, `5421e6b`** — the YAGNI sweep (`docs/token_maxxing/2026-09-12-llm-yagni-audit.md`):
  export surface 93 → 57 symbols (−39%): 6 exports deleted outright, 30 internal-only exports
  unexported. The sweep's stale-claim catch became a real test: the catalog's docstring
  claimed `env.LLM_MODEL` was pinned inside the catalog's vocabulary, the pin did not exist,
  so `tests/llm.textModel.test.ts` gained it. The export count in force at this writing
  (re-measured 2026-09-12, line-start `export` statements with brace/comma lists expanded,
  tests excluded): client 1, vision 8, extractJson 1, prompts/extraction 7, prompts/narrate 4,
  extract 3, factsHash 1, textModel 2, facts 14, narrate 7, runExtractionJob 2, schema 4,
  catalog 3 — **57 total**. Per the repo rule on volatile counts: treat this as a measurement
  stamped 2026-09-12, not a property of the package.
- **2026-09-12, this file** — first `package_readme.md`; the root `README.md` (F07-era,
  53 lines) was folded in and deleted: the two-clients table, the `getOrCreateInsight` caller
  rules, the `payload: null` doctrine, and the prompt-edit procedure now live in the sections
  above, and the README's "enforced in CI" claim — the one item the YAGNI audit left unverified
  — was verified TRUE against `.github/workflows/ci.yml` and is stated with the evidence in
  rule 2. `docs/plans/archive/F07-insights.md` still names the deleted README as "the F08
  boundary"; archives are records and were left alone.
