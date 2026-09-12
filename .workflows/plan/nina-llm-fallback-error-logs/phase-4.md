# Phase 4: Image-generation error logging

**Plan set:** `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md`
**Analysis:** `20260912-073115-KZHE_code_analyzer.md`
**Satisfies:** R2 — the admin "Error logs" tab's third sub-tab (Image generation) needs rows to show; this phase is what writes them.
**Depends on:** Phase 1 (`lib/nina/errorlogs.ts`'s `logNinaError`, and the `nina_error_logs` table it writes to)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

Every failed OpenRouter image-generation call made on the Vercel host now leaves a `nina_error_logs`
row carrying the raw provider text (`detail`) that is today `console.warn`'d and thrown away, the
fully-assembled generation prompt, the camera that was actually used, the anchor photo's Blob URL
when one was supplied, and the abort budget that call was actually given. Nothing about the retry,
requeue, revival or give-up machinery changes, and `nina_turns`' own coarse `error_code`
classification keeps working exactly as it does today — the log write is a second, parallel,
best-effort write that cannot affect the job's outcome.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none
**Renames:** none
**Creates:**

- `NinaImageCallResult`'s failure variant gains a member: `timeoutMs: number | null`
  (`lib/nina/imagecall.ts:92-100`) — additive to an existing exported union, not a new symbol.
- module-private `recordImageCallFailure` (`lib/nina/imagerun.ts`, new, inserted above `attemptOnce`)
- `tests/nina.imagelog.test.ts` (new file)

**Signature changes:** none. `callNinaImageModel`, `closeFailed`, `failNinaImageJob`,
`requeueNinaImageJob`, `runNinaImageJob` and `attemptOnce` all keep their current parameter lists.

**Requires (from earlier phases):** Phase 1 exports from `lib/nina/errorlogs.ts` — **verified
against Phase 1's plan file, byte for byte, not assumed:**

```ts
export interface NinaErrorLogWrite {
  category: 'text' | 'multimodal' | 'image_generation'
  userId?: string | null     // nullable column, optional field — phases 2 and 3 write rows with none
  provider: string           // untyped text; 'zai' | 'openrouter' are this set's values
  model: string
  fullInput: string
  errorMessage: string
  timeoutMs?: number | null
  imageUrl?: string | null
}

export async function logNinaError(entry: NinaErrorLogWrite): Promise<void>   // NEVER throws
```

This phase calls it with **all eight** fields named explicitly (never relying on a default), and it
is the one of the three writers that always **has** a real `userId` in hand — `attemptOnce` is given
it. So `userId` being optional costs this phase nothing; it passes a string every time. The category
literal it writes is `'image_generation'`, spelled identically to Phase 1's union member and to
Phase 5's `ADMIN_ERROR_CATEGORIES` entry.

**Leaves alone (owned by others):**

- `lib/nina/turn.ts`, `lib/llm/client.ts` (Phase 2)
- `lib/nina/vision.ts` (Phase 3)
- `lib/db/schema.ts`, `drizzle/**`, `lib/nina/errorlogs.ts` (Phase 1 — **this phase generates no
  migration and runs no `db:migrate`**)
- `app/admin/**`, `components/admin/**`, `components/ui/PhotoViewer.tsx` (Phase 5)
- `lib/nina/imagejobs.ts` — **not modified.** See Step 2's justification; the chosen call site is one
  layer up, in `imagerun.ts`, where `args` and `detail` are both already in hand.
- `scripts/nina-image-worker.ts` — the GitHub backstop host. See **Handoffs**.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagecall.ts` | modify | failure variant of `NinaImageCallResult` gains `timeoutMs` (`:92-100`); all four `ok: false` returns populate it (`:216-223`, `:256-265`, `:269-277`, `:295-302`) |
| `lib/nina/imagerun.ts` | modify | import `logNinaError` (`:10-12`); new `recordImageCallFailure` helper above `attemptOnce` (`:575`); call it at the `!outcome.ok` branch inside `attemptOnce` (`:595-604`) |
| `tests/nina.imagelog.test.ts` | create | the phase's own suite: every failed call logs, the row's contents, a store failure does not log, a log fault cannot cost the job |
| `tests/nina.imagerun.test.ts` | modify | one added `vi.mock('@/lib/nina/errorlogs', …)` line (`:54`), so the existing suite never reaches the real writer |
| `tests/nina.imagecall.test.ts` | modify | one added case asserting `timeoutMs` on the failure results |

---

## Design decisions this phase owns

### D1 — Every failed attempt is logged, not only the terminal one

The user asked for *"log setiap failure call to LLM untuk menggenerate gambar"* — **every failed
call**, not every failed job. `lib/nina/imagerun.ts:513-558`'s `closeFailed` is entered on every
failed attempt and then branches:

- `attempts < NINA_IMAGE_MAX_ATTEMPTS` (2) → `requeueNinaImageJob` → the row goes back to `queued`,
  stays `pending`, and the same prompt/seed is tried again. **Nothing is said to the runner, and
  nothing about that attempt survives anywhere today** — the requeue UPDATE writes only
  `latencyMs`/`costMicroUsd`, so the failure is invisible after the retry succeeds.
- `attempts >= NINA_IMAGE_MAX_ATTEMPTS` → `failNinaImageJob` → terminal, `status='failed'`,
  `error_code = kind`.

**Both get a log row.** An in-budget retry is a failed call to OpenRouter that was billed and that
cost the runner ninety seconds, and it is precisely the case that leaves no trace at all today — a
job that failed once and then succeeded currently reads as a clean success. Logging only the
terminal failure would make the log a *job* log wearing an error log's name.

This also keeps the three categories consistent: Phase 2 and Phase 3 each log **per failed attempt**
(their exit criteria say "both attempts are logged"), so all three tabs mean the same thing by a row.

Consequence to expect in the data: a job that burns both attempts writes **two** rows with near-
identical `fullInput`. That is correct and deliberate; the two rows will differ in `errorMessage`,
`timeoutMs` and `created_at`.

### D2 — The call site is `attemptOnce`'s `!outcome.ok` branch, not `closeFailed`, and not `failNinaImageJob`

Three candidate sites, and only one is right:

- **`failNinaImageJob` (`lib/nina/imagejobs.ts:480-565`)** — terminal only (loses D1's retry row),
  and it does **not** receive `args`: its input is `{userId, jobId, kind, purpose, latencyMs,
  costMicroUsd, replyToId, detail}`. It has no `prompt` and no `referenceUrl`, so the log write would
  require widening its signature and updating its other reachable caller shapes for no gain. It is
  also reached by `sweepStaleNinaImageJobs`-adjacent give-up paths that never made a call at all.
- **`closeFailed` (`lib/nina/imagerun.ts:513-558`)** — has `args` and `detail`, and covers both
  branches, but it is **also** entered for two failures that are not model-call failures:
  `detail: \`store: …\`` (`:621-628`, the Blob put threw) and `detail: \`finish: …\`` (`:644-651`,
  the DB row could not be written). Both of those mean *the LLM call succeeded and we were billed*.
  Filing them under a tab titled "log setiap failure call to LLM" would put our own Blob/Neon bugs in
  the provider's column, and it would make the tab's row count disagree with what an admin means by
  "how often is the image model failing?".
- **`attemptOnce`'s `if (!outcome.ok)` branch (`lib/nina/imagerun.ts:602-604)`** — CHOSEN. It is
  entered if and only if `callNinaImageModel` reported a failure; `args` (prompt, model,
  referenceUrl), `userId`, `jobId`, the normalised `referenceUrl` and the failure `detail` are all in
  scope; and it sits **above** the requeue/terminal branch, so D1 is satisfied structurally rather
  than by remembering to log in two places. Every in-platform generation path funnels through here —
  `selfiegen.ts:125`, `avatargen.ts:120`, `imagetest.ts:186`, `jobActions.ts:118` and
  `reviveNinaImageJobs` all reach it via `fireNinaImageGeneration` → `runNinaImageJob` →
  `attemptOnce` — so one call site covers the whole host.

**Store and finish failures are deliberately not logged to `nina_error_logs`.** They remain exactly
as they are today: a `console.warn` from `closeFailed` and `nina_turns.error_code = 'transport'`.
Test case 5 in `tests/nina.imagelog.test.ts` pins that choice so a later edit cannot silently widen
it.

### D3 — `timeoutMs` is the abort budget that actually applied, read back from the call

`lib/nina/imagecall.ts:238-241` computes the real ceiling:

```ts
const postTimeoutMs = Math.max(
  1_000,
  ninaImageCallTimeoutMs(referenceDataUrl != null) - (Date.now() - startedAt),
)
```

Two things make this the only honest source. First, `ninaImageCallTimeoutMs(anchored)`
(`lib/nina/imagerecipe.ts:368-370`) picks **235 s when an anchor actually went on the wire and 150 s
otherwise** — and "actually went on the wire" is a fact only `imagecall.ts` knows, because a
reference that could not be fetched from Blob degrades to an unanchored call
(`imagecall.ts:117-180, 227-241`). `attemptOnce`'s own `anchored` flag is the *requested* anchoring,
which is deliberately the conservative one for the retry-budget arithmetic (`imagerun.ts:561-573`)
and would over-report 235 s for a call that really got 150 s. Second, the ceiling is reduced by
whatever the Blob fetch already spent, so the number the `AbortSignal` was handed is what a "did it
time out at its ceiling?" question is actually asking about.

So `callNinaImageModel` returns it, rather than the caller re-deriving it. `null` on the one path
where no request was sent at all (`OPENROUTER_API_KEY` missing, `imagecall.ts:212-223`) — there is
no timeout to report, and `nina_error_logs.timeout_ms` is nullable.

`NINA_WORKER_CALL_TIMEOUT_MS` (290 s) never appears in a row written by this phase; it belongs to
`scripts/nina-image-worker.ts`, which is out of scope (see **Handoffs**).

### D4 — `errorMessage` carries the classification as a one-token prefix, then the raw text verbatim

```ts
errorMessage: `[${outcome.kind}] ${outcome.detail}`
```

`nina_error_logs` has no classification column and carries no job/turn id, so there is nothing to
join back to `nina_turns.error_code` — the prefix is the only place `'timeout' | 'policy' |
'transport'` survives into the admin view, and it is the distinction the analysis calls out as the
one that matters ("a picture the model would not draw versus a picture that got lost",
`imagefail.ts:78-84`). The provider's own text follows it unaltered and un-truncated by this phase,
so the "full llm error message" contract holds and the string stays greppable.

`detail` is already bounded to 500 chars on the two body-derived paths (`imagecall.ts:275, 300`) and
is `String(cause)` (unbounded, may carry a stack) on the throw path. This phase does **not**
truncate — the column is `text` and "full" is the requirement; if a cap is wanted it belongs in
Phase 1's writer, once, for all three categories.

### D5 — `fullInput` is `args.prompt`

Per the analysis's Key Consideration 7 and `NinaImageJobArgs`' own docstring
(`lib/nina/imagerecipe.ts:602-616`): *"`prompt` is fully assembled on Vercel and stored verbatim.
That is the load-bearing choice in this whole design."* It is exactly the string handed to
`buildImageRequestBody`, so it is the input the model saw. `args.sidecar` (model + seed as JSON) and
`args.scene` are not included — the seed and model are recoverable from the row's `model` column and
`nina_turns.args`, and a "full input" column that is half prompt and half metadata is harder to read
at a glance than the prompt itself.

### D6 — The write is `await`ed, not fire-and-forget

`attemptOnce` runs inside `after()` (`imagerun.ts:736-761`), where a floating promise can be cut off
when the invocation ends. One INSERT against Neon costs tens of milliseconds against a 150 000 ms
budget, and the retry-deadline arithmetic at `imagerun.ts:701-710` has 85 s of slack by construction
(`imagerecipe.ts:219-229`), so the added latency is immaterial. The `await` is inside
`recordImageCallFailure`'s own `try/catch`, so a slow or dead write degrades to a `console.warn` and
the job proceeds to its requeue or its apology unchanged.

---

## Implementation Steps

### Step 1: `callNinaImageModel` reports the abort budget it used

**File:** `lib/nina/imagecall.ts:79-100` (the type) and `:212-302` (the four failure returns)

**Change:** add a `timeoutMs` member to the `ok: false` variant of `NinaImageCallResult`, and
populate it at every return that constructs one. `postTimeoutMs` already exists at `:238-241`; the
only new arithmetic is none.

**Code:** replace the whole `NinaImageCallResult` union (currently `imagecall.ts:79-100`) with:

```ts
export type NinaImageCallResult =
  | {
      ok: true
      b64: string
      costMicroUsd: number
      latencyMs: number
      /**
       * Whether a reference actually went on the wire. `false` for an unanchored job AND for a job
       * whose reference could not be fetched — the caller logs it, so a degraded generation is
       * visible in the log rather than inferred from a missing warning.
       */
      anchored: boolean
    }
  | {
      ok: false
      kind: NinaImageFailure
      latencyMs: number
      /** `0` = certainly nothing was billed. `null` = unknown; the caller guesses high. */
      costMicroUsd: number | null
      /** Never rendered. Log only. */
      detail: string
      /**
       * **The abort budget this attempt actually got, in milliseconds** — R2's `timeout_ms` column.
       *
       * It is reported from HERE and not re-derived by the caller, because the caller cannot know
       * it. `ninaImageCallTimeoutMs(anchored)` picks 235 s only when a reference ACTUALLY went on
       * the wire, and a reference that could not be fetched from Blob degrades to an unanchored
       * 150 s call (`fetchNinaImageReference` returns null and the job proceeds) — so
       * `imagerun.ts`'s `anchored` flag, which means "did this JOB request an anchor", would
       * over-report 235 s for a call that really got 150 s. The figure also has the reference
       * fetch's own elapsed time already subtracted, because that is what the `AbortSignal` was
       * handed.
       *
       * `null` on exactly one path: the key was absent, so no request was sent and there was no
       * timeout to apply. `nina_error_logs.timeout_ms` is nullable for this case.
       */
      timeoutMs: number | null
    }
```

Then the four failure returns. **1 — the missing-key path** (`imagecall.ts:216-223`):

```ts
    return {
      ok: false,
      kind: 'transport',
      latencyMs: Date.now() - startedAt,
      costMicroUsd: 0,
      detail: `image config: ${String(cause)}`,
      /* Nothing was sent, so no ceiling applied. Not `ninaImageCallTimeoutMs(...)`: recording the
       * budget a call would have had is a number about a call that never happened. */
      timeoutMs: null,
    }
```

**2 — the thrown-fetch path** (`imagecall.ts:256-265`):

```ts
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      /* The request left the building. A generation that was aborted at its ceiling was very
       * probably billed, so this is `null` ("unknown, guess high") and not `0`. */
      costMicroUsd: null,
      detail: String(cause),
      timeoutMs: postTimeoutMs,
    }
  }
```

**3 — the non-200 path** (`imagecall.ts:269-277`):

```ts
  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: null,
      detail: `HTTP ${res.status} ${raw.slice(0, 500)}`,
      timeoutMs: postTimeoutMs,
    }
  }
```

**4 — the 200-with-no-image path** (`imagecall.ts:295-302`):

```ts
  if (b64 == null || b64.length === 0) {
    /*
     * A 200 with no image. `classifyImageFailure` decides whether the body reads as a refusal
     * (`policy`) or as something else (`transport`) — the distinction that matters to the runner
     * is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: reportedCost,
      detail: raw.slice(0, 500),
      timeoutMs: postTimeoutMs,
    }
  }
```

**Impact:** `NinaImageCallResult` is constructed in exactly one place — this file (verified by
`grep -rn "NinaImageCallResult\|callNinaImageModel"` over `lib/`, `app/`, `scripts/`, `tests/`). The
`ok: true` branch is untouched, so no success-path caller changes.
`scripts/nina-image-worker.ts` imports `imagefail.ts`, `imageprefs.ts` and `imagerecipe.ts` but
**never** `imagecall.ts` (it cannot — `imagecall.ts` opens with `import 'server-only'` and reads
`@/lib/env`), and its own `generate()` returns its own local shape, so the worker does not compile
against this union and is unaffected. The only test that mocks a failure result is the new one in
Step 4.

### Step 2: `imagerun.ts` records the failed call

**File:** `lib/nina/imagerun.ts:10-12` (imports) and `:575` (the new helper, immediately above
`attemptOnce`'s docstring)

**Change:** add the `errorlogs` import, then a module-private helper that owns the whole log write
and its own `try/catch`.

**Code — the import.** The current block at `:10-16` reads:

```ts
import { releaseBlobIfUnreferenced } from './blobRelease'
import { captionNinaPhoto } from './caption'
import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { planNinaImageWrite, type NinaImageDedupHit } from './imageDedupe'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import { signImageBytes, type NinaImageSignature } from './perceptualSign'
import { coerceNinaImageModel } from './imageprefs'
```

Replace with (one line inserted after `./caption`):

```ts
import { releaseBlobIfUnreferenced } from './blobRelease'
import { captionNinaPhoto } from './caption'
import { logNinaError } from './errorlogs'
import { callNinaImageModel, type NinaImageCallResult } from './imagecall'
import { planNinaImageWrite, type NinaImageDedupHit } from './imageDedupe'
import { ninaImageCaption, type NinaImageFailure } from './imagefail'
import { signImageBytes, type NinaImageSignature } from './perceptualSign'
import { coerceNinaImageModel } from './imageprefs'
```

**Code — the helper.** Insert this complete function immediately before the
`/** One attempt: claim, call, store, finish. … */` docstring that precedes `attemptOnce`
(currently `lib/nina/imagerun.ts:575`):

```ts
/**
 * **R2's Image-generation row, and the only place the raw provider text survives.**
 *
 * ── WHAT IT RESCUES ───────────────────────────────────────────────────────────────────────────
 * `callNinaImageModel`'s `detail` is commented *"Never rendered. Log only."* and that was literally
 * true: `closeFailed` `console.warn`s it, `failNinaImageJob` `console.warn`s it again, and neither
 * `.set({...})` has ever included it. `nina_turns.error_code` keeps only the four-value
 * classification (`timeout | policy | transport | stale`), so the day OpenRouter starts answering
 * `HTTP 429 rate limit exceeded for qwen/qwen-image-3` the database says `transport` and the
 * sentence is gone with the Vercel log. This writes it down.
 *
 * ── IT IS CALLED ON EVERY FAILED CALL, NOT EVERY FAILED JOB ───────────────────────────────────
 * The user asked to log *"setiap failure call"*. `closeFailed` below either REQUEUES (budget left —
 * the attempt is billed and invisible, since the requeue UPDATE writes only latency and cost) or
 * gives up. Both are failed calls, so the call site is ABOVE that branch, in `attemptOnce`, where
 * the choice cannot be forgotten in one of the two arms. A job that burns both attempts therefore
 * writes two rows, differing in `errorMessage`, `timeoutMs` and `created_at`.
 *
 * ── AND ONLY FOR A FAILED *MODEL CALL* ────────────────────────────────────────────────────────
 * `closeFailed` is also entered with `detail: 'store: …'` and `detail: 'finish: …'` — a Blob put or
 * a Neon insert that threw AFTER a generation we were billed for. Those are our failures, not the
 * provider's, and filing them under a tab titled "log setiap failure call to LLM" would make the
 * tab answer a different question than the one an operator is asking it. They keep their existing
 * `console.warn` and their `nina_turns.error_code = 'transport'`, and nothing else.
 *
 * ── IT CANNOT COST THE JOB ────────────────────────────────────────────────────────────────────
 * Its own `try/catch`, matching the plan's invariant and this codebase's
 * `try { await deps.store.record(...) } catch { console.warn(...) }` idiom. `logNinaError` is
 * documented as best-effort by phase 1, and this catch does not rely on that: a log table is not
 * worth one photograph, and the outer `after()` has no second net for a throw from here.
 */
async function recordImageCallFailure(input: {
  userId: string
  jobId: string
  args: NinaImageJobArgs
  /** Already normalised by `ninaImageReferenceUrl` — the ANCHOR, which is the input image. */
  referenceUrl: string | null
  /** Already normalised by `coerceNinaImageModel`; the same value the call was made with. */
  model: string
  outcome: Extract<NinaImageCallResult, { ok: false }>
}): Promise<void> {
  const { userId, jobId, args, referenceUrl, model, outcome } = input
  try {
    await logNinaError({
      userId,
      category: 'image_generation',
      /* Image generation has always been OpenRouter and this plan set adds no fallback to it —
       * see the index's Decisions. A constant, not a parameter. */
      provider: 'openrouter',
      model,
      /* `args.prompt` is the fully-assembled generation prompt, stored verbatim when the job was
       * opened — "the load-bearing choice in this whole design" (`NinaImageJobArgs`). It is
       * exactly what `buildImageRequestBody` sent. */
      fullInput: args.prompt,
      /* The classification first, then the provider's own words untouched. `nina_error_logs` has
       * no `kind` column and carries no job id to join back to `nina_turns.error_code`, so this
       * prefix is where the timeout/policy/transport distinction survives to the admin screen. */
      errorMessage: `[${outcome.kind}] ${outcome.detail}`,
      /* The budget the AbortSignal actually got, reported by the call itself. `null` only when no
       * request was sent at all. */
      timeoutMs: outcome.timeoutMs,
      /* The anchor photo — an INPUT image. A failed generation produces no output image at all
       * (`finishSelfie` never runs), which is why this is never an output URL. `null` for an
       * unanchored job, and the admin row then simply has no image affordance. */
      imageUrl: referenceUrl,
    })
  } catch (cause) {
    console.warn('[nina] image failure could not be logged', {
      jobId,
      kind: outcome.kind,
      error: String(cause),
    })
  }
}
```

**Impact:** `NinaImageJobArgs` is already imported as a type at `imagerun.ts:39`; no other import is
needed. `lib/nina/errorlogs.ts` pulls in `@/lib/db`, which constructs a Neon client eagerly at import
— safe under Vitest, because `tests/support/setup.ts` seeds a syntactically valid dummy
`DATABASE_URL` and `neon()` performs no I/O at construction. Step 5 mocks the module anyway in the
one existing suite that drives failure paths.

### Step 3: call it from `attemptOnce`

**File:** `lib/nina/imagerun.ts:595-604`

**Change:** hoist the coerced model into a named const so the log names the same camera the call
used, then log before handing off to `closeFailed`.

**Code:** the current block reads:

```ts
  const outcome: NinaImageCallResult = await callNinaImageModel(
    args.prompt,
    args.seed,
    referenceUrl,
    /* The job's own camera, normalised — an old jsonb row without the key rides the default. */
    coerceNinaImageModel(args.model),
  )
  if (!outcome.ok) {
    return { outcome: await closeFailed(userId, jobId, args, attempts, outcome), anchored }
  }
```

Replace it with:

```ts
  /* The job's own camera, normalised — an old jsonb row without the key rides the default.
   * HOISTED out of the argument list so the log row below names the camera the call was ACTUALLY
   * made with, rather than re-deriving it and risking the two drifting apart. */
  const model = coerceNinaImageModel(args.model)

  const outcome: NinaImageCallResult = await callNinaImageModel(
    args.prompt,
    args.seed,
    referenceUrl,
    model,
  )
  if (!outcome.ok) {
    /*
     * R2. ABOVE `closeFailed`, deliberately: `closeFailed` either requeues (retry budget left) or
     * gives up, and BOTH are failed calls the operator asked to see. Awaited rather than floated —
     * this runs inside `after()`, where a floating promise can be cut off — and its own try/catch
     * is inside `recordImageCallFailure`, so nothing here can change what the job does next.
     */
    await recordImageCallFailure({ userId, jobId, args, referenceUrl, model, outcome })
    return { outcome: await closeFailed(userId, jobId, args, attempts, outcome), anchored }
  }
```

**Impact:** one added `await` on the failure path only (an INSERT, tens of ms) against a
150 000–235 000 ms call budget and the 85 s of slack `NINA_IMAGE_CALL_TIMEOUT_MS`'s docstring
accounts for; the retry deadline check at `imagerun.ts:701-710` is unaffected at that scale. The
success path is byte-for-byte unchanged apart from the hoisted `model` const. No behaviour change to
`closeFailed`, `requeueNinaImageJob`, `failNinaImageJob`, `reviveNinaImageJobs` or
`sweepStaleNinaImageJobs`.

### Step 4: the phase's own test suite

**File:** `tests/nina.imagelog.test.ts` (new)

**Change:** drive `runNinaImageJob` with a failing model call and assert the log row, the
per-attempt count, the non-logging of store failures, and that a log fault cannot cost the job.

**Code:**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { logNinaError } from '@/lib/nina/errorlogs'
import { callNinaImageModel } from '@/lib/nina/imagecall'
import { claimNinaImageJob, failNinaImageJob, requeueNinaImageJob } from '@/lib/nina/imagejobs'
import {
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
} from '@/lib/nina/imagerecipe'
import { runNinaImageJob } from '@/lib/nina/imagerun'

/**
 * **Phase 4: every failed image-generation call leaves a row.**
 *
 * The defect this suite pins shut is that `callNinaImageModel`'s `detail` — the raw provider text,
 * the only thing that says WHY a generation failed — reached `closeFailed` and `failNinaImageJob`
 * and was `console.warn`'d into a Vercel log that expires. `nina_turns.error_code` kept four words.
 *
 * `recordImageCallFailure` is module-private, so every case here drives it through
 * `runNinaImageJob`, which is the only door it has. Everything that leaves the process is mocked:
 * `@vercel/blob`, the job store, the image model, `lib/nina/queries.ts` and — the point of this
 * suite — `lib/nina/errorlogs.ts`.
 */

vi.mock('next/server', () => ({ after: (task: () => unknown) => void task }))

const { putBlob } = vi.hoisted(() => ({ putBlob: vi.fn() }))

vi.mock('@vercel/blob', () => ({ put: putBlob }))
vi.mock('@/lib/env', () => ({ blobEnv: () => ({ BLOB_READ_WRITE_TOKEN: 'test-token' }) }))
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: vi.fn() }))
vi.mock('@/lib/nina/caption', () => ({ captionNinaPhoto: vi.fn() }))
vi.mock('@/lib/nina/errorlogs', () => ({ logNinaError: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
vi.mock('@/lib/nina/imagejobs', () => ({
  claimNinaImageJob: vi.fn(),
  completeNinaImageJob: vi.fn(),
  failNinaImageJob: vi.fn(),
  listRevivableNinaImageJobs: vi.fn(),
  requeueNinaImageJob: vi.fn(),
}))
vi.mock('@/lib/nina/queries', () => ({
  findNinaImageByContentHash: vi.fn(),
  getNinaMessagesByIds: vi.fn(),
  insertNinaAvatarAsCurrent: vi.fn(),
  insertNinaMessageImages: vi.fn(),
  insertNinaMessages: vi.fn(),
  readNinaTuning: vi.fn(),
}))
vi.mock('@/lib/nina/sessionResolve', () => ({ resolveNinaWriteSession: vi.fn() }))

const call = vi.mocked(callNinaImageModel)
const claim = vi.mocked(claimNinaImageJob)
const fail = vi.mocked(failNinaImageJob)
const requeue = vi.mocked(requeueNinaImageJob)
const log = vi.mocked(logNinaError)

const USER = 'user-1'
const JOB_ID = 'job-abc'
const REFERENCE = 'https://blob.test/nina/anchor.png'
const PROMPT = 'a photograph of Nina on the seawall at dusk, 35mm, golden hour'

const ARGS = {
  purpose: 'selfie' as const,
  scene: 'nina on the seawall at dusk',
  mood: 'santai',
  prompt: PROMPT,
  seed: 7,
  replyToId: null,
  source: 'chat' as const,
  attempts: 1,
  sidecar: '{"model":"qwen/qwen-image-3","seed":7}',
}

/** A timed-out unanchored call, with the ceiling `imagecall.ts` would have reported. */
const TIMED_OUT = {
  ok: false as const,
  kind: 'timeout' as const,
  latencyMs: 150_000,
  costMicroUsd: null,
  detail: 'TimeoutError: The operation was aborted due to timeout',
  timeoutMs: NINA_IMAGE_CALL_TIMEOUT_MS,
}

/**
 * Claim the job at its LAST attempt, so `closeFailed` gives up instead of requeuing — a requeue
 * would spin `runNinaImageJob`'s loop forever against a mock that always returns the same claim.
 */
function claimLastAttempt(args: Record<string, unknown> = ARGS) {
  claim.mockResolvedValue({
    jobId: JOB_ID,
    args: { ...args, attempts: NINA_IMAGE_MAX_ATTEMPTS },
    attempts: NINA_IMAGE_MAX_ATTEMPTS,
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  log.mockResolvedValue(undefined)
  putBlob.mockResolvedValue({ url: 'https://blob.test/nina/x.png', pathname: 'nina/x.png' })
  call.mockResolvedValue(TIMED_OUT)
})

describe('image-generation failures land in nina_error_logs', () => {
  it('writes the raw provider detail, the prompt, the camera and the timeout', async () => {
    claimLastAttempt()

    await runNinaImageJob(USER, JOB_ID)

    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith({
      userId: USER,
      category: 'image_generation',
      provider: 'openrouter',
      model: NINA_IMAGE_MODEL,
      fullInput: PROMPT,
      /* The classification, then the provider's words verbatim. */
      errorMessage: '[timeout] TimeoutError: The operation was aborted due to timeout',
      timeoutMs: NINA_IMAGE_CALL_TIMEOUT_MS,
      /* No anchor on this job, so no image link — matching `planJobPhoto`'s "never a link the
       * server has not proved". */
      imageUrl: null,
    })
  })

  it('logs EVERY failed call, including one that is requeued and retried in budget', async () => {
    /* Attempt 1 has budget left -> requeue; attempt 2 is terminal -> failNinaImageJob. */
    claim.mockResolvedValueOnce({ jobId: JOB_ID, args: ARGS, attempts: 1 } as never)
    claim.mockResolvedValueOnce({
      jobId: JOB_ID,
      args: { ...ARGS, attempts: NINA_IMAGE_MAX_ATTEMPTS },
      attempts: NINA_IMAGE_MAX_ATTEMPTS,
    } as never)

    const outcome = await runNinaImageJob(USER, JOB_ID)

    expect(outcome).toBe('gave-up')
    expect(requeue).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
    /* The whole decision, in one number: a failed CALL is a row, not a failed JOB. */
    expect(log).toHaveBeenCalledTimes(2)
  })

  it("an anchored job logs the anchor's URL and the anchored ceiling", async () => {
    claimLastAttempt({ ...ARGS, referenceUrl: REFERENCE })
    call.mockResolvedValue({
      ok: false,
      kind: 'transport',
      latencyMs: 900,
      costMicroUsd: null,
      detail: 'HTTP 502 upstream connect error',
      timeoutMs: NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
    })

    await runNinaImageJob(USER, JOB_ID)

    expect(log.mock.calls[0]?.[0]).toMatchObject({
      imageUrl: REFERENCE,
      timeoutMs: NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
      errorMessage: '[transport] HTTP 502 upstream connect error',
    })
  })

  it("names the job's own camera, and coerces an unknown one the way the call does", async () => {
    claimLastAttempt({ ...ARGS, model: 'qwen/qwen-image-3-pro' })
    await runNinaImageJob(USER, JOB_ID)
    expect(log.mock.calls[0]?.[0]).toMatchObject({ model: 'qwen/qwen-image-3-pro' })

    vi.clearAllMocks()
    log.mockResolvedValue(undefined)
    call.mockResolvedValue(TIMED_OUT)
    claimLastAttempt({ ...ARGS, model: 'a-camera-that-was-retired' })
    await runNinaImageJob(USER, JOB_ID)
    expect(log.mock.calls[0]?.[0]).toMatchObject({ model: NINA_IMAGE_MODEL })
  })

  it('does NOT log a Blob store failure: the model call succeeded and was billed', async () => {
    claimLastAttempt()
    call.mockResolvedValue({
      ok: true,
      b64: 'QUJD',
      costMicroUsd: 40_000,
      latencyMs: 78_200,
      anchored: false,
    })
    putBlob.mockRejectedValue(new Error('blob: 503'))

    const outcome = await runNinaImageJob(USER, JOB_ID)

    /* The job still closes as a failure, with `transport` in `nina_turns` as it always did... */
    expect(outcome).toBe('gave-up')
    expect(fail).toHaveBeenCalledTimes(1)
    /* ...and the Error-logs tab does not claim the image model failed, because it did not. */
    expect(log).not.toHaveBeenCalled()
  })

  it('a log write that throws cannot cost the job its apology', async () => {
    claimLastAttempt()
    log.mockRejectedValue(new Error('neon: connection reset'))

    await expect(runNinaImageJob(USER, JOB_ID)).resolves.toBe('gave-up')

    expect(log).toHaveBeenCalledTimes(1)
    expect(fail).toHaveBeenCalledTimes(1)
  })
})
```

**Impact:** new file; no existing test changes behaviour. The suite never touches a database — the
writer is mocked in every case.

### Step 5: keep the existing suites off the real writer

**File:** `tests/nina.imagerun.test.ts:54`

**Change:** `lib/nina/imagerun.ts` now imports `lib/nina/errorlogs.ts`. That suite drives
`closeFailed` through its store/finish paths (`:210-226`), which this phase does **not** log — so it
would pass either way today. The mock is added so it stays that way if a future edit widens the call
site, rather than silently sending an INSERT at a fake Neon host and eating the 5 s test timeout.

**Code:** the file currently has, at `:51-61`:

```ts
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: releaseLoser }))
vi.mock('@/lib/nina/caption', () => ({ captionNinaPhoto: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
```

Insert one line, keeping the alphabetical run:

```ts
vi.mock('@/lib/nina/blobRelease', () => ({ releaseBlobIfUnreferenced: releaseLoser }))
vi.mock('@/lib/nina/caption', () => ({ captionNinaPhoto: vi.fn() }))
vi.mock('@/lib/nina/errorlogs', () => ({ logNinaError: vi.fn() }))
vi.mock('@/lib/nina/imagecall', () => ({ callNinaImageModel: vi.fn() }))
```

**Impact:** none on that suite's assertions. `tests/nina.jobActions.test.ts` imports
`@/lib/nina/imagerun` dynamically and stubs `callNinaImageModel` with an `ok: true` result, so it
never reaches the writer and needs no change.

### Step 6: pin the new `timeoutMs` at its source

**File:** `tests/nina.imagecall.test.ts:210` (append one case inside the existing
`describe('callNinaImageModel', …)`, just before its closing `})`)

**Change:** assert that a failure result reports the ceiling that actually applied, and that the
key-absent path reports `null`.

**Code:** add at the top of the file's import block:

```ts
import {
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  NINA_IMAGE_MODEL,
  OPENROUTER_IMAGE_URL,
} from '../lib/nina/imagerecipe.ts'
```

(replacing the current `import { NINA_IMAGE_MODEL, OPENROUTER_IMAGE_URL } from
'../lib/nina/imagerecipe.ts'` at `:4`), and this case as the last `it` in the describe:

```ts
  it('R2: a failure reports the abort budget that actually applied', async () => {
    /* No key: nothing was sent, so there is no ceiling to report. */
    vi.stubGlobal('fetch', vi.fn())
    const unsent = await callNinaImageModel('x', 1)
    expect(unsent.ok).toBe(false)
    if (!unsent.ok) expect(unsent.timeoutMs).toBeNull()
    vi.unstubAllGlobals()

    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    /* Unanchored: the 150 s ceiling, minus whatever the (absent) reference fetch spent. */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream exploded', { status: 500 })),
    )
    const plain = await callNinaImageModel('x', 1)
    expect(plain.ok).toBe(false)
    if (!plain.ok) {
      expect(plain.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_CALL_TIMEOUT_MS)
      expect(plain.timeoutMs).toBeGreaterThan(NINA_IMAGE_CALL_TIMEOUT_MS - 5_000)
    }
    vi.unstubAllGlobals()

    /* Anchored: the 235 s ceiling, because the reference really went on the wire. */
    stubTwoHostFetch(blobPng(), new Response('upstream exploded', { status: 500 }))
    const anchored = await callNinaImageModel('x', 1, 'https://blob.test/nina/a.png')
    expect(anchored.ok).toBe(false)
    if (!anchored.ok) {
      expect(anchored.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS)
      expect(anchored.timeoutMs).toBeGreaterThan(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS - 5_000)
    }

    /* An anchor that could NOT be fetched is an unanchored call, and gets the unanchored ceiling —
     * which is exactly why the number is reported from inside the call and not re-derived by
     * `imagerun.ts`, whose `anchored` flag means "did the JOB request one". */
    vi.unstubAllGlobals()
    stubTwoHostFetch(new Response('nope', { status: 404 }), new Response('boom', { status: 500 }))
    const degraded = await callNinaImageModel('x', 1, 'https://blob.test/nina/a.png')
    expect(degraded.ok).toBe(false)
    if (!degraded.ok) expect(degraded.timeoutMs).toBeLessThanOrEqual(NINA_IMAGE_CALL_TIMEOUT_MS)
  })
```

**Impact:** the file's existing `afterEach` already runs `vi.unstubAllGlobals()` and deletes
`OPENROUTER_API_KEY`, so this case leaves no state behind. The 5 000 ms tolerance is generous
against a stubbed fetch that resolves immediately; it exists so the assertion is about the *ceiling
chosen*, not about clock jitter.

---

## Verification

**Build:** `npm run typecheck` (= `next typegen && tsc --noEmit`) — `vitest` does not typecheck, and
the `NinaImageCallResult` union change is exactly the kind of edit only `tsc` catches.

**Tests:**

```
npx vitest run tests/nina.imagelog.test.ts tests/nina.imagecall.test.ts tests/nina.imagerun.test.ts tests/nina.jobActions.test.ts tests/nina.imageworker.test.ts
npm test
```

Then the repo's guards, both of which must stay green and neither of which this phase should move:

```
npm run lint
npm run format:check
npm run ci:openrouter-guard
npm run ci:llm-payload-guard
npm run db:check
```

`ci:openrouter-guard` matters because `lib/nina/imagerun.ts` is already under `lib/nina/` and no new
`OPENROUTER_API_KEY` read is added — the `provider: 'openrouter'` string is a literal, not the key.
`db:check` must report no drift: **this phase generates no migration** (Phase 1 owns the table), and
if `db:check` is unhappy the cause is Phase 1's migration, not this one.

**Manual check:** none required, and deliberately no production write. If one is wanted after
Phase 5 lands, the cheapest honest probe is the admin image-gen test panel
(`lib/nina/imagetest.ts` → `fireNinaImageGeneration`) against a deliberately bad
`OPENROUTER_API_KEY`, which exercises the missing-key branch and should produce a row with
`timeout_ms IS NULL` and `error_message` starting `[transport] image config:`.

**Exit criteria:** with `lib/nina/errorlogs.ts` present from Phase 1, a forced image-generation model
failure produces one `nina_error_logs` row per failed attempt, carrying `category='image_generation'`,
`provider='openrouter'`, the coerced model id, `args.prompt` as `full_input`, the raw
`callNinaImageModel` detail (classification-prefixed) as `error_message`, the applied abort budget as
`timeout_ms`, and `args.referenceUrl` as `image_url` when the job was anchored — while
`nina_turns.status`/`error_code`, the requeue budget and the apology message are all byte-identical
to their pre-phase behaviour, and `npm test` + `npm run typecheck` are green.

## Handoffs

- **The GitHub Actions backstop host is not covered.** `scripts/nina-image-worker.ts` has its own
  `generate()` and its own `closeFailed` (`:1134`) with `NINA_WORKER_CALL_TIMEOUT_MS = 290_000`, and
  it runs under `node --experimental-strip-types` with hand-written `postgres` SQL — it cannot import
  `lib/nina/errorlogs.ts` (which will open with `server-only` and `@/lib/db`) any more than it can
  import `lib/nina/queries.ts`. Logging its failures means a hand-written INSERT in the worker,
  mirroring Phase 1's column list, and the drift risk that `lib/nina/imagefail.ts`'s "this file must
  never import anything" header exists to talk about. Deliberately left out: the worker is the
  demoted backstop, the in-platform path is where generations actually run, and a second
  hand-maintained copy of the log's column list is a worse trade than a gap in the backstop's rows.
  Worth a follow-up card, not a phase.
- **Stale give-ups write no row.** `sweepStaleNinaImageJobs` (`lib/nina/imagejobs.ts:636-707`) closes
  a 20-minute-old `pending` job as `failed`/`stale`. No call was made in that invocation and there is
  no provider text to record — the failure is "an invocation died", which `nina_turns.error_code =
  'stale'` already says. If an operator later wants stale give-ups in the tab, it is a Phase-1-schema
  question (what does `error_message` say when there is no error message?), not a plumbing one.
- **Store / finish failures write no row**, by decision D2. If that is later judged wrong, the change
  is to move the call from `attemptOnce` into `closeFailed` and drop test case 5 — a five-line edit,
  recorded here so the option is not lost.
- **Phase 5 owns the rendering**, including turning `timeout_ms` into the user's requested `"300s"`
  string and deciding whether the `[kind]` prefix is shown inline or parsed out. This phase writes
  the data and asserts nothing about how it looks.
- **Phase 1 owns any truncation cap** on `full_input` / `error_message`. This phase deliberately
  writes the full strings.
- Requirement **R1 is untouched here** — image generation gets no fallback (index Decisions), so no
  step of this phase serves R1.

## Rollback

Three reverts, in any order, none of which touches the database:

1. `git checkout -- lib/nina/imagerun.ts` — removes the `errorlogs` import, the
   `recordImageCallFailure` helper and its one call site. `attemptOnce`'s failure branch returns to
   the single `closeFailed` line.
2. `git checkout -- lib/nina/imagecall.ts` — removes `timeoutMs` from the failure variant. Safe
   because nothing outside that file constructs the union, and the caller that read the field is gone
   with revert 1.
3. `rm tests/nina.imagelog.test.ts` and `git checkout -- tests/nina.imagerun.test.ts
   tests/nina.imagecall.test.ts`.

`nina_error_logs` rows already written are orphaned data, not a schema problem — Phase 1's rollback
owns the table itself. No migration, no data backfill, no `nina_turns` change to unwind.

## Assumptions

- **Phase 1 has landed** and exports `logNinaError` from `lib/nina/errorlogs.ts` with the field names
  quoted in the Interface Contract (`userId`, `category`, `provider`, `model`, `fullInput`,
  `errorMessage`, `timeoutMs`, `imageUrl`) and the category value `'image_generation'`. **Checked
  against Phase 1's plan file on 2026-09-12 — every name and every literal agrees; no edit was
  needed here.** If a later revision of Phase 1 renames a field, the only edits are inside
  `recordImageCallFailure`'s single object literal and the `toHaveBeenCalledWith` in test case 1.
- **`logNinaError` never throws** (Phase 1's exit criteria call it best-effort). This phase does not
  rely on that: the call site has its own `try/catch` regardless, per the plan's invariant.
- `nina_error_logs.timeout_ms` is nullable and `image_url` is nullable — **confirmed in Phase 1's
  Drizzle definition and pinned by its schema test.** Both are written as `null` on real paths here.
  This phase's `timeoutMs` values are milliseconds (`NINA_IMAGE_CALL_TIMEOUT_MS` 150 000,
  `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS` 235 000, minus the reference fetch's own elapsed time),
  which is the unit Phase 1's `integer` column stores and Phase 5's `formatErrorTimeout` divides by
  1000 to render. All three agree.
- **`NinaImageCallResult`'s new `timeoutMs` member collides with nothing.** The union is constructed
  in exactly one file (`lib/nina/imagecall.ts`), read in exactly one other
  (`lib/nina/imagerun.ts`), and both belong to this phase alone. Phase 1 never sees the type;
  `scripts/nina-image-worker.ts` cannot import `imagecall.ts` at all. **Verified across all five
  plan files on 2026-09-12.**
- Phases 2 and 3 do not touch `lib/nina/imagecall.ts`, `lib/nina/imagerun.ts`,
  `tests/nina.imagerun.test.ts` or `tests/nina.imagecall.test.ts`; their scopes are `turn.ts` /
  `turnrun.ts` / `llmFallbackText.ts` and `vision.ts` / `openrouter.ts` respectively. **Verified
  against their Files tables — no file in this phase is touched by any other.**
- Phase 5 reads `nina_error_logs` through Phase 1's readers and does not import anything from
  `lib/nina/imagerun.ts` or `lib/nina/imagecall.ts`.
