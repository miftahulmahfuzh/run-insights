# F31 — The narrative call must disable thinking

**Card:** [#42](https://github.com/miftahulmahfuzh/run-insights/issues/42) · round 1 · 2026-08-27

## The defect

`insights` produced its last row at **2026-08-26T01:29:37Z** and nothing since — every
scope, every user. The 27 Aug run (`k1O7eFnDyJ3a`) committed completely: 11 splits, 5
zones, 3 photos, an `early_bird` badge, `reviewed_at` set. Only the prose is missing, and
nothing records the attempt, because `getOrCreateInsight` persists nothing on failure.

`glm-5.3` on the z.ai Anthropic-compatible endpoint now emits an extended `thinking` block
by default. It consumes the whole `max_tokens` ceiling before any `tool_use` block is
produced, so `findReportBlock` finds nothing and `narrateWith` returns `unavailable`.

Measured live against prod facts, 2026-08-27 (read-only; no `insights` row written):

| variant | latency | stop_reason | content |
|---|---|---|---|
| shipped: 1200 tokens, thinking on | 18.3–38.3 s | `max_tokens` | `["thinking"]` |
| 4000 tokens, thinking on | 65.0–73.1 s | `max_tokens` | `["thinking"]` |
| `tool_choice: auto`, thinking on | 24.3 s | `max_tokens` | `["thinking"]` |
| no tools at all, thinking on | 15.8 s | `max_tokens` | `["thinking"]` |
| **`thinking: { type: 'disabled' }`** | **17.0 s** | **`tool_use`** | **`["tool_use"]`** |

Both the 27 Aug run and the 25 Aug run — which *did* narrate successfully on 25 Aug —
fail identically now. Last code commit is `a6f8b31` (08-22), six days before the break:
this is a vendor-side model behaviour change, not a regression from our side.

## The change

### 1. `lib/llm/narrate.ts` — `baseBody()` sends `thinking: { type: 'disabled' }`

`baseBody` carried a comment naming `thinking` as a field deliberately *not* sent:

> The allowed request surface is `model · max_tokens · system · messages · tools ·
> tool_choice` and nothing else — no `thinking`, … every field beyond that set is a field
> z.ai may accept, ignore, or 400 on depending on the day.

That reasoning is now disproved for `thinking` specifically, and the comment is replaced
rather than quietly edited around: the endpoint accepts it and answers correctly in 17 s.
The comment's caution still governs every *other* field, so the surface widens by exactly
one entry and says why.

`lib/llm/vision.ts:131` has sent `thinking: { type: 'disabled' }` to the sibling z.ai
endpoint since F04, marked **"MEASURED … Never remove"**. F07 simply never got the same
treatment. This makes the two clients agree.

### 2. `app/r/[id]/page.tsx` and `app/trends/page.tsx` — `export const maxDuration = 60`

`ensureRunInsight` / `ensureWeekInsight` / `ensureMonthInsight` are Server Actions fired
from `InsightTrigger`'s client effect. Next 16's own `maxDuration` reference:

> If using Server Actions, set the `maxDuration` at the page level to change the default
> timeout of all Server Actions used on the page.

`BUDGET.session.overall` is 45 s and the fixed call measures 17 s, both above the platform
default. `app/api/extract/route.ts` and `app/api/cron/rollup/route.ts` already set 60 for
the same reason; these two pages are the remaining paths that call a model and never got
it. Without this the fix in (1) would still be killed mid-call in production.

### 3. `tests/llm.narrate.test.ts` — the guard

`'sends exactly the sanctioned request surface'` asserts the exact key set and so must
change. It gains `thinking`, and a dedicated case mirrors
`vision.test.ts:165`'s `'always sends thinking: disabled'` so that removing the field
fails a test with the measurement in it, exactly as it does on the vision side.

### 4. `lib/llm/narrate.ts` — one comment corrected

The "ON FAILURE, NOTHING IS PERSISTED" block claims "the next natural view of the page —
or tonight's cron — retries for free". `/api/cron/rollup` iterates `week` and `month`
only; a session insight retries **only** on a page visit. The comment is corrected to say
that. See the ambiguity call below for why the cron itself is not changed.

## Approaches considered

| | Approach | Verdict |
|---|---|---|
| **A** | **Disable thinking; give the two pages the `maxDuration` their budget assumes** | **Chosen** |
| B | Raise `maxTokens` / budget for the thinking block | **Dead on measurement.** At 4000 tokens the model burned all 4000 on `thinking` and still emitted no `tool_use`, taking 65–73 s. There is no ceiling that fixes this. |
| C | A: plus a cron session-backfill pass and a retry on primary timeout | **Loses on scope, and is partly wrong.** See below. |

**Why C's "retry on primary timeout" is not a defect.** The card claimed the `if (first)`
guard wastes ~20 s of budget when the primary call throws. It does not: `attemptRepair`
works by echoing the model's own malformed JSON back to it, and a call that *threw*
produced no JSON to echo. There is nothing to repair against — which is precisely what
`'does not throw when the primary call throws, and does not repair against nothing'`
asserts by name. A *retry* is a different feature from a *repair*, and with thinking
disabled the latency that provoked the thought drops to 17 s against a 25 s ceiling.

Scored against the repo's criteria: A matches an existing convention in the sibling
module (Convention); it is the smallest change that makes an insight generate in
production (Scope); the gate proves it with a unit assertion that mirrors the vision
suite's (Verifiability); and it is one field and two exports to revert (Reversibility).

## Ambiguity call

The card offered a choice on the cron gap: *"Either fix the comment or give the cron a
session backfill pass."* **The narrow reading wins — fix the comment.**

A session backfill is a new feature, not a bugfix: `/api/cron/rollup` already iterates
every active user twice inside a 60 s ceiling with its own deadline arithmetic, and adding
an unbounded third pass over every un-narrated run raises budget and ordering questions
this card does not answer. The affected insights regenerate on the next page view, which
is the path the runner is already on. If the backfill is wanted, it is its own card.

## Verification

The repo's CI gate, in full. Plus, after deploy: the 27 Aug session insight, week
`2026-W35` and month `2026-08` should each appear on first view. Nothing negative is
cached, so no backfill step is needed to make that happen.
