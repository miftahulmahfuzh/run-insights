# Phase 3: OpenRouter fallback — vision/multimodal

**Plan set:** `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md`
**Analysis:** `20260912-073115-KZHE_code_analyzer.md`
**Satisfies:** R1 — a z.ai failure on a photo-description call is retried once against OpenRouter's `z-ai/glm-5.3-flash` before the photo is given up as undescribed, and every failed attempt is persisted for the admin log.
**Depends on:** Phase 1 (`lib/nina/errorlogs.ts`'s `logNinaError`)
**Difficulty:** NORMAL
**Package:** `lib/nina`

---

## Goal

After this phase, `describeNinaImages` — the single production entry point every vision caller uses
(`lib/nina/actions.ts`, `lib/admin/chatPhotoActions.ts` x2, `lib/admin/ninaAlbumActions.ts` x2) — no
longer gives up on the first z.ai failure. On a thrown fetch, a `NinaVisionTokenFloorError`, or a
`NinaVisionTransportError` it writes one `nina_error_logs` row (`category: 'multimodal'`) and retries
once against OpenRouter's chat-completions endpoint with the identical OpenAI-shaped payload. The
fallback's response is accepted on a plain non-empty check, **never** on the `glm-4.6v`-calibrated
token floor. If OpenRouter also fails, a second row is written and the **original** z.ai error is
rethrown unchanged, so every caller's existing `'dropped'` / `'transport'` branching keeps working
byte for byte.

## Interface Contract

**Creates:**
- `lib/nina/openrouter.ts` (new file) — `OPENROUTER_CHAT_URL`, `NINA_FALLBACK_TEXT_MODEL`.
  **SHARED FILE: this phase is its sole creator and owner; Phase 2 imports both names from it and
  declares neither.** Pure constants, zero imports, no runtime behaviour — so the sharing costs
  Phase 2 an ordering edge (`depends_on: [1, 3]`) and nothing else. There is no merge hazard: only
  one phase ever writes this file.
- `nina.vision.NINA_DESCRIBE_FALLBACK_TIMEOUT_MS` (`lib/nina/vision.ts`)
- `nina.vision.NINA_DESCRIBE_FALLBACK_MAX_TOKENS` (`lib/nina/vision.ts`)
- `nina.vision.describeLogInput` (`lib/nina/vision.ts`) — pure, exported for the test
- `nina.vision.describeErrorText` (`lib/nina/vision.ts`) — pure, exported for the test
- `nina.vision.describeNinaImagesWithOpenRouter` (`lib/nina/vision.ts`)
- `nina.vision.describeNinaImagesWithFallback` (`lib/nina/vision.ts`)

**Signature changes:**
- `NinaDescribeOptions` (`lib/nina/vision.ts:129`) gains two OPTIONAL fields: `imageUrl?: string`,
  `userId?: string`. Purely additive — no existing caller passes either, and no existing test pin on
  a `describeNinaImages(refs, { subject })` call changes.
- `describeNinaImages` (`lib/nina/vision.ts:326`) keeps its signature; its body now calls
  `describeNinaImagesWithFallback` instead of `describeNinaImagesWithFetch`, and fills
  `opts.imageUrl` from `refs[0].blobUrl` when the caller did not supply it.

**Deletes:** none.
**Renames:** none.

**Unchanged on purpose (load-bearing):**
- `describeNinaImagesWithFetch` (`lib/nina/vision.ts:187-274`) — **not one byte changes.** It stays
  the single-provider z.ai attempt. Every one of the 11 existing assertions in
  `lib/nina/vision.test.ts` and the live probe in `tests/live/ninaVision.live.test.ts` call it
  directly and keep passing unmodified. This is why the fallback is a *new* orchestrator rather than
  a branch inside this function: those tests hand it ONE fake `fetch` that answers every call
  identically, so an in-place fallback would let the fake's own floor-tripping body succeed as the
  "fallback response" and turn six `rejects.toBeInstanceOf(...)` cases green-by-accident.
- `describeTokenFloor`, `estimateTextTokens`, `NINA_TOKEN_FLOOR_PER_IMAGE`,
  `NINA_DESCRIBE_CHARS_PER_TOKEN` — untouched. The floor's calibration is not re-litigated.

**Requires (from Phase 1) — VERIFIED against Phase 1's plan file, not assumed:**
1. `lib/nina/errorlogs.ts` exports `logNinaError(entry: NinaErrorLogWrite): Promise<void>`, which
   never throws and never rejects. Phase 1's actual shape:
   ```ts
   export interface NinaErrorLogWrite {
     category: 'text' | 'multimodal' | 'image_generation'
     userId?: string | null
     provider: string           // untyped text; 'zai' | 'openrouter' are this set's values
     model: string
     fullInput: string
     errorMessage: string
     timeoutMs?: number | null
     imageUrl?: string | null
   }
   ```
   Every field `recordDescribeFailure` names below matches it byte for byte, including the three
   category literals.
2. **`userId` is optional and `nina_error_logs.user_id` is nullable — CONFIRMED**
   (`text('user_id').references(…)` with no `.notNull()`, pinned by Phase 1's schema test). This
   phase depends on it: the vision path has no user id at the seam where the failure is observed.
   `describeNinaImagesWithFetch`'s only inputs are data URIs; `describeNinaImages`'s only inputs are
   `{ blobUrl, pathname }`. Threading a user id in would mean editing five call sites in
   `lib/nina/actions.ts`, `lib/admin/chatPhotoActions.ts` and `lib/admin/ninaAlbumActions.ts` **and
   rewriting nine exact-argument test pins** that assert
   `expect(describeNinaImages).toHaveBeenCalledWith([{ blobUrl, pathname }], { subject: 'self' })`
   (`tests/admin.chatPhotos.test.ts:531,640,663,1132,1147`,
   `tests/admin.albumAvatarActions.test.ts:138,241,325,479`,
   `tests/admin.chatPhotoAdoption.test.ts:328`) — none of which is this phase's or Phase 1's scope.
   `opts.userId` exists so a future caller can supply one; this phase supplies none.
3. `lib/nina/errorlogs.ts` must be importable under Vitest without a live database — i.e. it imports
   `@/lib/db` the ordinary way and runs no query at module scope. `lib/nina/vision.test.ts` imports
   `./vision`, which will now import `./errorlogs` transitively, in every default `npm test` run.
   (`tests/support/setup.ts:22-25` already supplies a syntactically valid dummy `DATABASE_URL` and
   `neon()` performs no I/O at construction, so this holds for the normal import shape.)

**Shared constants — RECONCILED 2026-09-12, re: Phase 2:**
`NINA_FALLBACK_TEXT_MODEL = 'z-ai/glm-5.3-flash'` and `OPENROUTER_CHAT_URL =
'https://openrouter.ai/api/v1/chat/completions'` are defined by **this phase, and only this phase**,
in the new zero-import constants module `lib/nina/openrouter.ts`. Phase 2's draft independently
declared its own copies inside `lib/nina/llmFallbackText.ts`; that duplication has been removed from
Phase 2's plan, which now **imports both from `lib/nina/openrouter.ts`** and carries a `depends_on`
edge to this phase so the file exists before its import resolves. The declarations in Step 1 are the
canonical text and this phase must not weaken or rename them — Phase 2 compiles against them.

**Leaves alone (owned by others):**
- `lib/llm/vision.ts` — the unrelated `extractions` / screenshot-OCR feature. Explicitly out of
  scope per the analysis doc and the phase brief.
- `lib/nina/turn.ts`, `lib/llm/client.ts`, `lib/nina/llmFallbackText.ts` — Phase 2.
- `lib/nina/imagejobs.ts`, `lib/nina/imagerun.ts`, `lib/nina/imagecall.ts` — Phase 4.
- `lib/db/schema.ts`, `drizzle/**`, `lib/nina/errorlogs.ts` — Phase 1.
- All admin UI — Phase 5.
- `tests/support/setup.ts` and `.github/workflows/*` — deliberately not edited (see Step 4).

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/openrouter.ts` | create | **NEW SHARED FILE, created here and nowhere else.** Zero-import constants module: `OPENROUTER_CHAT_URL`, `NINA_FALLBACK_TEXT_MODEL`. Phase 2 imports both from it (and therefore `depends_on` this phase); no other phase writes it. |
| `lib/nina/vision.ts` | modify | Import block (`:3`); two new constants after `:79`; two optional fields on `NinaDescribeOptions` (`:129-145`); four new functions appended after `:274`; `describeNinaImages` body (`:326-334`). `describeNinaImagesWithFetch` (`:187-274`) untouched. |
| `lib/nina/vision.test.ts` | modify | One hoisted `vi.mock('./errorlogs')`, one module-scope env default, and a new `describe('the OpenRouter fallback')` block appended. The existing 11 cases are untouched. |

## Implementation Steps

### Step 1: The shared OpenRouter constants module

**File:** `lib/nina/openrouter.ts` (new)
**Change:** Create a zero-import constants module, modelled exactly on `lib/nina/imagerecipe.ts`'s
`OPENROUTER_IMAGE_URL` / `NINA_IMAGE_MODEL` pair (`imagerecipe.ts:114-115`) — the existing precedent
the analysis names for "a fixed OpenRouter model id lives in code, not in an env var".

**Code:**
```ts
/**
 * **OpenRouter's CHAT surface, and the one model Nina falls back to.** Two constants, no imports.
 *
 * ── WHY A FILE OF ITS OWN ─────────────────────────────────────────────────────────────────────
 * Two unrelated call paths need the same two values: the vision/describe fallback
 * (`lib/nina/vision.ts`, this plan set's phase 3) and the text-chat fallback
 * (`lib/nina/llmFallbackText.ts`, phase 2). Declaring them twice is how a model id and an endpoint
 * drift apart — RULING A6's rule, the same one that keeps `NINA_BLOB_PREFIX` in exactly one place.
 * A vision module is the wrong home for a text client's model id and vice versa, so neither owns
 * them: this file does.
 *
 * ── ZERO IMPORTS, ON PURPOSE ──────────────────────────────────────────────────────────────────
 * Same rule and same reason as `imagerecipe.ts` and `imagefail.ts`: a constants module with no
 * imports can be read by anything, including a `node --experimental-strip-types` script, without
 * dragging `server-only` or a database client in behind it. There is no secret here — the API KEY
 * is read through `ninaEnv()` at the call site, which is what `ci:openrouter-guard` checks for.
 *
 * ── NOT ENV VARS ──────────────────────────────────────────────────────────────────────────────
 * There is no `OPENROUTER_BASE_URL` and no `OPENROUTER_MODEL` in `lib/env.ts` and this phase does
 * not add one. `lib/nina/imagerecipe.ts` already hardcodes both halves for the image path
 * (`OPENROUTER_IMAGE_URL`, `NINA_IMAGE_MODEL`) and that is the convention being followed. A
 * fallback model an operator can point anywhere is a fallback nobody can reason about.
 */

/** OpenRouter's OpenAI-Chat-Completions endpoint. The image path's sibling of `/images/generations`. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * **The one fallback model, for BOTH the text chat and the photo-description call.**
 *
 * Chosen because it is natively multimodal — text, image and video in, text out, per
 * `openrouter.ai/z-ai/glm-5.3-flash` — unlike the text-only `glm-5.2`/`glm-5.3`. That single
 * property is what lets one constant serve phase 2's Anthropic-shaped text turn and phase 3's
 * OpenAI-shaped describe call: the describe call sends an `image_url` part and this model accepts
 * one.
 *
 * It is deliberately the same *family* as the primary z.ai model but a DIFFERENT ROUTE. The
 * 2026-09-11 22:29–00:12 UTC outage that motivated this work was an 11-in-a-row failure streak on
 * one z.ai coding-plan subscription, not a model defect — so a different path to a comparable model
 * is exactly the right shape of redundancy.
 */
export const NINA_FALLBACK_TEXT_MODEL = 'z-ai/glm-5.3-flash'
```

**Impact:** New file. Nothing imports it until Step 2. `ci:openrouter-guard` is unaffected (no
`OPENROUTER_API_KEY` literal here, and the file is under `lib/nina/` anyway).

---

### Step 2: `lib/nina/vision.ts` — imports and the two new constants

**File:** `lib/nina/vision.ts:1-11` (import block) and `lib/nina/vision.ts:79` (after
`NINA_BLOB_FETCH_TIMEOUT_MS`)

**Change:** Add `ninaEnv` to the existing `@/lib/env` import, add the `logNinaError` and
`lib/nina/openrouter.ts` imports, then declare the fallback's own timeout and token ceiling.

**Code — replace lines 1-11 (the whole import block) with:**
```ts
import 'server-only'

import { env, ninaEnv } from '@/lib/env'
import { logNinaError } from './errorlogs'
import { NINA_CHAT_CONTENT_TYPE } from './images'
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'
import {
  NINA_DESCRIBE_SYSTEM_PROMPTS,
  buildDescribeUserContent,
  type NinaDescribeImage,
  type NinaDescribeSubject,
  type NinaVisionContentPart,
} from './prompts/describe'
```

**Code — insert immediately after line 79 (`export const NINA_BLOB_FETCH_TIMEOUT_MS = 8_000`):**
```ts
/**
 * **The OpenRouter fallback's own ceiling, and it is NOT `NINA_DESCRIBE_TIMEOUT_MS`.**
 *
 * 25 s is a MEASURED-DERIVED number for z.ai's coding endpoint specifically (see
 * `NINA_DESCRIBE_TIMEOUT_MS` above: ~26-33 ms per completion token plus 2-3 s of fixed overhead).
 * OpenRouter is a broker — it selects an upstream provider per request and proxies the stream — so
 * it carries a routing hop the direct z.ai call does not, and reusing a constant derived from a
 * different vendor's measurement would be borrowing a number that was never taken here. 30 s is
 * that 25 s plus headroom for the hop; it is a CEILING, not a target, and nothing is slower for it.
 *
 * **The budget this spends is affordable, and the arithmetic is worth spelling out.** This ceiling
 * only ever binds AFTER the primary attempt already failed, so the worst case for one photo is
 * 25 s + 30 s = 55 s. The describe call runs in its OWN invocation (`describeNinaImage` is its own
 * Server Action, never inside `sendNinaMessage` and never inside `runNinaTurn`'s 45 s budget), under
 * a route segment `maxDuration` of 300 s. The composer's three-photo path describes SERIALLY
 * (`lib/nina/actions.ts:1578-1592`), so a total z.ai outage makes that path ~165 s of spinner
 * instead of ~33 s — slow, visibly in-progress, and still inside the segment ceiling. The
 * alternative on that path is three photos Nina cannot see at all, which is the outcome this whole
 * phase exists to stop.
 *
 * Deliberately NOT `opts.timeoutMs`: that option is the caller's override for the z.ai attempt and
 * no caller in the repo passes it today. Honouring a z.ai-shaped override on a different provider's
 * request would silently re-import the calibration problem this constant exists to avoid.
 */
export const NINA_DESCRIBE_FALLBACK_TIMEOUT_MS = 30_000

/**
 * **Higher than `NINA_DESCRIBE_MAX_TOKENS`, and the slack is the whole point.**
 *
 * The z.ai request sends `thinking: { type: 'disabled' }` — a z.ai vendor extension — and even
 * there `max_tokens` carries slack because the endpoint may emit a thinking block anyway. The
 * fallback request sends NO reasoning-control field at all: this module's standing rule is that an
 * unprobed request shape is not something to trust against a vendor whose failure mode is "200 OK
 * with invented content" (see `toDataUri`'s note on why a `url:`-only `image_url` is refused), and
 * OpenRouter's reasoning controls have never been probed from this codebase. So the reasoning
 * preamble is BUDGETED FOR rather than suppressed: 900 leaves ~400 tokens of head-room over the
 * 60-140 word paragraph the prompt asks for, which is what stops a preamble from consuming the
 * budget and handing back an empty completion that the non-empty check would then reject.
 */
export const NINA_DESCRIBE_FALLBACK_MAX_TOKENS = 900
```

**Impact:** `vision.ts` now imports `./errorlogs` (Phase 1) and `./openrouter` (Step 1). Every test
file that imports `./vision` now loads `./errorlogs` transitively — see the Requires note above.

---

### Step 3: `lib/nina/vision.ts` — the new options, the log helpers, the fallback attempt, the orchestrator, the new entry body

**File:** `lib/nina/vision.ts:129-145` (`NinaDescribeOptions`), then everything appended after
`:274` (the end of `describeNinaImagesWithFetch`), then `:326-334` (`describeNinaImages`).

**Change 3a — replace the whole `NinaDescribeOptions` interface (lines 129-145) with:**
```ts
export interface NinaDescribeOptions {
  timeoutMs?: number
  /**
   * Whose photograph this is. **Defaults to `'runner'`** — the composer pre-pass
   * (`describeNinaImage`, his uploads) and the runner-side media describe pass the default or
   * `'runner'` explicitly; every caller that describes a photograph OF NINA — the album's button
   * and its `after()` pass, and the chat-photo caption pass — passes `'self'` (R3, 2026-09-10;
   * until then the album paths pointed the runner prompt at her faces). Pick it with
   * `describeSubjectForSide` (`lib/nina/album.ts`), which owns the mapping from `photoSideOf` —
   * do not spell the ternary at a call site.
   *
   * `'self'` selects `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`. It is a different SUBJECT, not a
   * different mode: the request shape, the data URI, the timeout and the floor are all the same,
   * which is why this is one option rather than a second function.
   */
  subject?: NinaDescribeSubject
  /**
   * **The photo's hosted Blob URL, for the failure log's image column only. Never sent to a model.**
   *
   * `describeNinaImages` fills this in from `refs[0].blobUrl`, so no caller has to pass it and no
   * existing call-site test pin changes. It exists as an option because the injectable core takes
   * data URIs and a `data:` URI is not something to put in a database row or hand to an admin
   * viewer — the model is sent the bytes, the log row is sent the link.
   *
   * One URL for what may be several images, deliberately: this path is ONE IMAGE PER CALL in
   * production (see `describeNinaImages`' header) and a multi-image batch would need a log schema
   * with a link list, which R2 did not ask for.
   */
  imageUrl?: string
  /**
   * Who this describe call belongs to, for the failure log's `user_id` column. **Nothing supplies
   * it today and that is intentional**, not an omission: the five production callers pin their
   * exact `(refs, { subject })` arguments in three test suites, and this phase does not rewrite
   * those pins to carry an id the failure log does not require. `nina_error_logs.user_id` is
   * nullable for exactly this reason. The option exists so a caller that HAS the id can hand it
   * over without another signature change.
   */
  userId?: string
}
```

**Change 3b — append the following AFTER line 274 (the closing `}` of
`describeNinaImagesWithFetch`) and BEFORE the `DESCRIBABLE_MEDIA_TYPES` block at line 280:**

```ts
/**
 * **What the admin log stores as "full input" — the real payload, minus the base64.**
 *
 * Pure, and exported so `vision.test.ts` can assert the one property that matters: no data URI ever
 * reaches a database row. A chat photo is ≤ 900 KB, which is ~1.2 MB of base64 per image; putting
 * that in a `text` column would make the Error Logs page unloadable and would store the same bytes
 * a second time next to the Blob that already holds them.
 *
 * Everything else IS the real thing — the exact system prompt variant that was chosen and the exact
 * fixed instruction `buildDescribeUserContent` appends — because R2's "full input" means what the
 * model was actually shown, not a summary of it. The image parts are kept in place, in order, with
 * the URI replaced by a marker, so an admin reading the row can see the message really did carry an
 * image block and where it sat.
 */
export function describeLogInput(subject: NinaDescribeSubject, imageCount: number): string {
  const placeholders: NinaDescribeImage[] = Array.from({ length: imageCount }, () => ({
    dataUri: '<data: URI omitted — see the image link on this row>',
  }))
  return JSON.stringify(
    {
      system: NINA_DESCRIBE_SYSTEM_PROMPTS[subject],
      user: buildDescribeUserContent(placeholders),
      imageCount,
    },
    null,
    2,
  )
}

/**
 * **What the admin log stores as "full LLM error message".**
 *
 * Pure, exported for the test. `String(cause)` alone would render
 * `NinaVisionTokenFloorError: nina describe reported prompt_tokens=141 ...` and throw away the
 * three fields that make a floor trip diagnosable — and `NinaVisionTransportError` carries a
 * `detail` (the thrown cause, or the response snippet) that `String()` never reaches at all. The
 * one row an admin opens six weeks later has to answer "which failure was this" without a redeploy.
 *
 * The timeout is NOT concatenated here. It rides in `nina_error_logs.timeout_ms` as its own column
 * (per the analysis's schema) and Phase 5 renders the two together — one value, one place, formatted
 * once.
 */
export function describeErrorText(cause: unknown): string {
  if (cause instanceof NinaVisionTokenFloorError) {
    return (
      `${cause.name}: ${cause.message} ` +
      `[promptTokens=${cause.promptTokens} floor=${cause.floor} imageCount=${cause.imageCount}]`
    )
  }
  if (cause instanceof NinaVisionTransportError) {
    return cause.detail === undefined
      ? `${cause.name}: ${cause.message}`
      : `${cause.name}: ${cause.message} — detail: ${String(cause.detail)}`
  }
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  return String(cause)
}

/**
 * One `nina_error_logs` row for one failed attempt. **It never throws and it never rejects.**
 *
 * Plan invariant: a failure to write the log must never affect the outer call's own
 * success/failure — the same contract, and the same `try { … } catch { console.warn(…) }` idiom,
 * that `runNinaTurn` already applies to `deps.store.record`. `logNinaError` is itself specified as
 * best-effort by phase 1; this second catch is not redundant, it is the guarantee held at the place
 * that depends on it, so a phase-1 regression cannot cost a runner his photo description.
 */
async function recordDescribeFailure(entry: {
  provider: 'zai' | 'openrouter'
  model: string
  timeoutMs: number
  cause: unknown
  imageCount: number
  opts: NinaDescribeOptions
}): Promise<void> {
  try {
    await logNinaError({
      category: 'multimodal',
      provider: entry.provider,
      model: entry.model,
      fullInput: describeLogInput(entry.opts.subject ?? 'runner', entry.imageCount),
      errorMessage: describeErrorText(entry.cause),
      timeoutMs: entry.timeoutMs,
      imageUrl: entry.opts.imageUrl ?? null,
      userId: entry.opts.userId ?? null,
    })
  } catch (cause) {
    console.warn('[nina] could not record a describe failure', {
      provider: entry.provider,
      error: String(cause),
    })
  }
}

/**
 * **The fallback attempt: the same request, a different door.**
 *
 * NO TRANSLATION LAYER, and that is not an oversight — z.ai's vision endpoint and OpenRouter's chat
 * endpoint are BOTH OpenAI Chat Completions. Same `messages` array, same
 * `{ type: 'image_url', image_url: { url } }` parts, same `choices[0].message.content` on the way
 * back. Only the URL, the credential, the model id and the two ceilings differ. (Phase 2's text
 * fallback is the opposite case and needs a full Anthropic⇄OpenAI translation, which is why it is a
 * separate, harder phase.)
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE TOKEN FLOOR IS NOT APPLIED HERE, AND THAT IS A DECISION, NOT AN OMISSION.
 *
 *  `describeTokenFloor()` is calibrated for `glm-4.6v` SPECIFICALLY. `NINA_TOKEN_FLOOR_PER_IMAGE`
 *  was re-calibrated on 2026-09-09 from 500 to 150 after a real false trip — a measured 612x862
 *  arrival card (`nina_message_images` Jv4VMDMao31j) reported 1,559 prompt tokens against a 1,649
 *  floor and was refused as "dropped" while demonstrably delivered, because the constant had been
 *  sized to one vendor's tokens-per-pixel behaviour at one resolution. Read the note on that
 *  constant: the number is a MEASUREMENT of a specific model, not a property of images.
 *
 *  `z-ai/glm-5.3-flash` behind OpenRouter is a different model on a different route, and nobody has
 *  measured its prompt-token accounting for an image. Pointing a measured-elsewhere floor at it
 *  would be repeating 2026-09-09's mistake with a fresh unknown — and it would repeat it in the
 *  worst possible place, because this path only ever runs when the primary already failed. A false
 *  trip here converts a recoverable outage back into the undescribed photo the fallback exists to
 *  prevent.
 *
 *  So the fallback's acceptance test is the plain one that guards every other response in this
 *  file: a non-empty trimmed completion. The floor's real job — "the endpoint answered 200 and
 *  silently dropped the image" — is still fully guarded on the PRIMARY path, which is where it was
 *  measured and where it has always run. `NinaDescribeResult.floor` comes back as 0 on this path,
 *  which is the honest value: no floor was applied, and the log line says so.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */
export async function describeNinaImagesWithOpenRouter(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  const messages: Message[] = [
    { role: 'system', content: NINA_DESCRIBE_SYSTEM_PROMPTS[opts.subject ?? 'runner'] },
    { role: 'user', content: buildDescribeUserContent(images) },
  ]

  /*
   * Read INSIDE the function and inside a `try`, exactly as `lib/nina/imagecall.ts:212-223` does and
   * for the same reason: `ninaEnv()` is a lazy zod group that THROWS when its member is absent, and
   * the analysis measured production once carrying neither of the two it used to hold. A module-
   * scope read here would make a missing key an import-time crash of the whole vision module —
   * which would take the WORKING z.ai path down with it. A missing key must cost the fallback and
   * nothing else.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly would pass
   * the grep and break the invariant it stands for — app code reads secrets through `lib/env.ts`.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    throw new NinaVisionTransportError(
      'nina describe fallback is not configured (no OPENROUTER_API_KEY)',
      cause,
    )
  }

  let res: Response
  try {
    res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NINA_FALLBACK_TEXT_MODEL,
        max_tokens: NINA_DESCRIBE_FALLBACK_MAX_TOKENS,
        /* No `thinking` field. That is a z.ai vendor extension; this is not z.ai's endpoint, and an
         * unprobed field on a vendor whose failure mode is "200 OK with invented content" is not
         * something this module sends. `NINA_DESCRIBE_FALLBACK_MAX_TOKENS` budgets for a reasoning
         * preamble instead of trying to suppress one. */
        messages,
      }),
      signal: AbortSignal.timeout(NINA_DESCRIBE_FALLBACK_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new NinaVisionTransportError(
      'nina describe fallback request failed or timed out',
      cause,
    )
  }

  const raw = await res.text()

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (cause) {
    throw new NinaVisionTransportError(
      `nina describe fallback response was not valid JSON: ${raw.slice(0, 300)}`,
      cause,
    )
  }

  /* Status FIRST here, unlike the primary path. There, the floor is checked above `res.ok` because
   * F04's measured failure was itself a 200 and the floor is the more actionable diagnosis. Here
   * there is no floor, so there is nothing to order it against — and a non-2xx body from a broker
   * carries the upstream's own error text, which is the single most useful thing this row can hold. */
  if (!res.ok) {
    throw new NinaVisionTransportError(
      `nina describe fallback returned ${res.status}: ${raw.slice(0, 300)}`,
    )
  }

  const body = json as {
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = body.choices?.[0]
  const description = (choice?.message?.content ?? '').trim()

  /* THE WHOLE ACCEPTANCE TEST. See the header block: deliberately not the token floor. A 200 with
   * an error envelope, a refusal, or a completion eaten by a reasoning preamble all land here, and
   * the raw snippet goes in the log row so the admin can tell which. */
  if (description.length === 0) {
    throw new NinaVisionTransportError(
      `nina describe fallback returned an empty completion: ${raw.slice(0, 300)}`,
    )
  }

  return {
    description,
    promptTokens: body.usage?.prompt_tokens ?? 0,
    completionTokens: body.usage?.completion_tokens ?? 0,
    /* 0 = "no floor was applied to this response". The honest value, and it is what tells a reader
     * of `describeNinaImage`'s success log line that the paragraph came from the fallback. */
    floor: 0,
    finishReason: choice?.finish_reason ?? null,
  }
}

/**
 * **z.ai, then OpenRouter, then the original failure — and every attempt gets a row.**
 *
 * R1 in one function. The three failure classes the brief names are all covered by one `catch`,
 * because `describeNinaImagesWithFetch` already funnels every one of them into a throw:
 *
 *   (a) the fetch itself throws — wrapped as `NinaVisionTransportError` (`:225-227`)
 *   (b) `NinaVisionTokenFloorError` — the endpoint answered 200 and dropped the image (`:249-251`)
 *   (c) `NinaVisionTransportError` — non-2xx, bad JSON, or an empty completion (`:233, :255, :264`)
 *
 * ── IT RETHROWS `primary`, NOT `fallback`, AND THAT IS LOAD-BEARING ───────────────────────────
 * Every caller branches on the ORIGINAL error's class and would change behaviour if handed the
 * fallback's. `describeNinaImage` (`lib/nina/actions.ts:1646-1666`) does
 * `const dropped = cause instanceof NinaVisionTokenFloorError`, logs `console.error('[nina] TOKEN
 * FLOOR TRIPPED …')` versus `console.warn('[nina] could not describe a chat image', …)`, and returns
 * `reason: dropped ? 'dropped' : 'transport'` on a ticket whose `description` is null.
 * `lib/admin/chatPhotoActions.ts:645+` and `:805+` and `lib/admin/ninaAlbumActions.ts:152+`,
 * `:557+` do the same. The fallback's own failure is always a `NinaVisionTransportError`, so
 * rethrowing IT would silently reclassify every floor trip as a transport failure and lose the one
 * signal the floor exists to raise. **Today's failure behaviour is preserved exactly: same error
 * instance, same class, same message, same `dropped`/`transport`/`rejected` branching, same null
 * description.** The only change on a total failure is two extra rows in a table nobody's control
 * flow reads.
 *
 * ── WHY THIS IS A NEW FUNCTION AND NOT A BRANCH INSIDE `describeNinaImagesWithFetch` ──────────
 * That function's contract — "one provider, one request, throws on failure" — is what its eleven
 * unit cases in `vision.test.ts` and the live probe in `tests/live/ninaVision.live.test.ts` assert,
 * and each of them hands it ONE fake `fetch` that answers every call with the same body. A fallback
 * inlined there would retry against that same fake, the fake's floor-tripping body would sail
 * through the (correctly) floor-free fallback check, and six `rejects.toBeInstanceOf(...)` cases
 * would pass for the wrong reason — the most expensive kind of green. Splitting the orchestrator out
 * keeps the primary attempt exactly as tested and gives the fallback its own cases, driven by a
 * fake that routes on the URL the way the real world does.
 *
 * ── ONE RETRY, NOT A CHAIN ────────────────────────────────────────────────────────────────────
 * R1 asks for a fallback, not a retry policy. No backoff, no second OpenRouter attempt, no third
 * provider. Two attempts, bounded at 55 s, and then the existing degraded path
 * (`NINA_DESCRIPTION_UNAVAILABLE`, which has her ask him what the picture is) takes over exactly as
 * it does today.
 */
export async function describeNinaImagesWithFallback(
  fetchImpl: FetchLike,
  images: readonly NinaDescribeImage[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  /* Hoisted above the try so a programmer error — an empty array — is one throw and zero log rows,
   * rather than the same `Error` raised twice and written to the admin table twice. */
  if (images.length < 1) throw new Error('describeNinaImages expects at least one image')

  try {
    return await describeNinaImagesWithFetch(fetchImpl, images, opts)
  } catch (primary) {
    await recordDescribeFailure({
      provider: 'zai',
      model: env.LLM_VISION_MODEL,
      /* The timeout this attempt ACTUALLY used, resolved the same way `describeNinaImagesWithFetch`
       * resolves it (`:223`) — not the constant, in case a caller ever overrides it. */
      timeoutMs: opts.timeoutMs ?? NINA_DESCRIBE_TIMEOUT_MS,
      cause: primary,
      imageCount: images.length,
      opts,
    })

    try {
      return await describeNinaImagesWithOpenRouter(fetchImpl, images, opts)
    } catch (fallback) {
      await recordDescribeFailure({
        provider: 'openrouter',
        model: NINA_FALLBACK_TEXT_MODEL,
        timeoutMs: NINA_DESCRIBE_FALLBACK_TIMEOUT_MS,
        cause: fallback,
        imageCount: images.length,
        opts,
      })
      /* `primary`, never `fallback`. See the header — every caller's `instanceof` branch depends on
       * it, and the fallback's error is always a transport error. */
      throw primary
    }
  }
}
```

**Change 3c — replace `describeNinaImages` (lines 326-334, the body only; the whole docstring at
318-325 stays as it is) with:**
```ts
export async function describeNinaImages(
  refs: readonly NinaImageRef[],
  opts: NinaDescribeOptions = {},
): Promise<NinaDescribeResult> {
  const images = await Promise.all(
    refs.map((ref) => toDataUri(ref, AbortSignal.timeout(NINA_BLOB_FETCH_TIMEOUT_MS))),
  )
  /*
   * `describeNinaImagesWithFallback`, not `…WithFetch`: production gets z.ai then OpenRouter, the
   * unit suite still drives the single-provider core directly.
   *
   * `imageUrl` is filled in HERE and nowhere else. This is the only layer that still holds a hosted
   * URL — `toDataUri` has just turned the refs into base64 and the layers below never see a link
   * again — so it is the last honest place to name the photo for the log row. Defaulted rather than
   * overwritten so a caller that knows better can say so.
   *
   * A `toDataUri` failure above is NOT retried and NOT logged as an LLM failure: a blob that will
   * not fetch is this app's own storage failing, not a model failing, and it throws before either
   * provider is ever asked. It keeps today's behaviour exactly — a `NinaVisionTransportError` out
   * of `describeNinaImages`, caught by the caller as `'transport'`.
   */
  return describeNinaImagesWithFallback(fetch, images, {
    ...opts,
    imageUrl: opts.imageUrl ?? refs[0]?.blobUrl,
  })
}
```

**Impact:** Every production describe call now has a second chance. No caller signature changes, no
caller's catch block changes, no test pin on a `describeNinaImages(...)` call-shape changes. On a
z.ai-only failure the photo now gets described where it previously did not; on a double failure the
outcome is identical to today plus two log rows.

---

### Step 4: The tests

**File:** `lib/nina/vision.test.ts` — three insertions. The existing 11 cases are not edited.

**Change 4a — at the very top of the file, before the existing `import { describe, … }` line,
add the module-scope env default; and add the imports and the `vi.mock`.**

Replace lines 1-18 with:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { describeSubjectForSide } from './album'
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'
import {
  NINA_DESCRIBE_REQUEST_TEXT,
  NINA_DESCRIBE_SYSTEM_PROMPT,
  NINA_SELF_DESCRIBE_SYSTEM_PROMPT,
} from './prompts/describe'
import {
  NINA_DESCRIBE_FALLBACK_TIMEOUT_MS,
  NINA_DESCRIBE_TIMEOUT_MS,
  NINA_TOKEN_FLOOR_PER_IMAGE,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
  describeErrorText,
  describeLogInput,
  describeNinaImagesWithFallback,
  describeNinaImagesWithFetch,
  describeTokenFloor,
  estimateTextTokens,
} from './vision'

/*
 * `OPENROUTER_API_KEY` is NOT in `tests/support/setup.ts`'s `LLM_DEFAULTS`, and this phase
 * deliberately does not add it there: that list is documented as mirroring `.github/workflows`' env
 * block byte for byte, and editing one without the other leaves `npm test` and CI testing different
 * things. The fallback reads the key lazily through `ninaEnv()` at call time, so a module-scope
 * default in the one file that needs it is enough — and `??=` means a real `.env` never loses.
 *
 * Nothing is sent anywhere: every case below drives an injected `fetch`.
 */
process.env.OPENROUTER_API_KEY ??= 'unit-test-openrouter-key-never-sent'

/*
 * `lib/nina/vision.ts` now imports `logNinaError` from `./errorlogs`, which talks to the database.
 * Mocked at the module boundary so the fallback cases assert the ROW THAT WOULD BE WRITTEN without
 * a database, and so the eleven pre-existing cases below — which never reach a log call — keep
 * running exactly as they did.
 */
const logNinaError = vi.fn(async () => {})
vi.mock('./errorlogs', () => ({
  logNinaError: (...args: unknown[]) => logNinaError(...args),
}))

const IMAGE = { dataUri: 'data:image/jpeg;base64,AAAA' }

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}
```

**Change 4b — append the new suite at the end of the file:**
```ts
describe('the OpenRouter fallback (R1)', () => {
  /**
   * A fake `fetch` that routes on the URL, the way the real world does. The primary path posts to
   * `env.LLM_VISION_BASE_URL` (`api.z.ai/...`), the fallback to `OPENROUTER_CHAT_URL` — so one fake
   * can give the two providers different answers, which is the whole point: the single-answer fake
   * the cases above use is exactly why the fallback is a separate function.
   */
  function route(
    zai: () => Promise<Response>,
    openrouter: () => Promise<Response>,
  ): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('openrouter.ai') ? openrouter() : zai(),
    ) as unknown as typeof fetch
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  /** A z.ai body carrying the measured drop signature: 200, plausible text, 141 prompt tokens. */
  const zaiDropped = () =>
    json({
      usage: { prompt_tokens: 141, completion_tokens: 40 },
      choices: [{ message: { content: 'He is soaked and grinning on wet asphalt.' } }],
    })

  /** A z.ai body that clears the floor and really arrived. */
  const zaiOk = () =>
    json({
      usage: { prompt_tokens: 2_800, completion_tokens: 180 },
      choices: [{ message: { content: 'Soaked through, dark tee stuck to his chest.' } }],
    })

  /**
   * An OpenRouter body with prompt tokens FAR BELOW any floor this module would compute. That is
   * the fixture's job: if the floor were ever applied to the fallback, this case fails.
   */
  const openRouterOk = () =>
    json({
      usage: { prompt_tokens: 12, completion_tokens: 90 },
      choices: [
        { message: { content: '  Low sun behind him on a wet track.  ' }, finish_reason: 'stop' },
      ],
    })

  const callsOf = (fetchImpl: typeof fetch) =>
    (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls

  beforeEach(() => {
    logNinaError.mockClear()
  })

  it('never calls OpenRouter, and never logs, when z.ai succeeds', async () => {
    const fetchImpl = route(zaiOk, openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(result.description).toBe('Soaked through, dark tee stuck to his chest.')
    expect(callsOf(fetchImpl)).toHaveLength(1)
    expect(String(callsOf(fetchImpl)[0]![0])).not.toContain('openrouter.ai')
    expect(logNinaError).not.toHaveBeenCalled()
  })

  it('retries on a token-floor trip, and the floor does NOT gate the fallback', async () => {
    // 12 prompt tokens is under every floor this module can compute. It is accepted anyway,
    // because the glm-4.6v-calibrated floor is deliberately not applied to a different model —
    // see `describeNinaImagesWithOpenRouter`'s header and the 2026-09-09 re-calibration.
    const fetchImpl = route(zaiDropped, openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(result.description).toBe('Low sun behind him on a wet track.')
    expect(result.promptTokens).toBe(12)
    expect(result.floor).toBe(0) // "no floor was applied", and the log line says so
  })

  it('retries on a transport failure (non-2xx)', async () => {
    const fetchImpl = route(() => json({ usage: { prompt_tokens: 2_800 }, error: 'nope' }, 502), openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('retries when the z.ai fetch itself throws', async () => {
    const fetchImpl = route(() => Promise.reject(new Error('socket hang up')), openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('sends the same OpenAI-shaped envelope to OpenRouter, with the fallback model', async () => {
    const fetchImpl = route(zaiDropped, openRouterOk)
    await describeNinaImagesWithFallback(fetchImpl, [IMAGE], { subject: 'self' })

    const [url, init] = callsOf(fetchImpl)[1]!
    expect(String(url)).toBe(OPENROUTER_CHAT_URL)
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)

    const body = JSON.parse(String(init.body))
    expect(body.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(body.thinking).toBeUndefined() // a z.ai vendor extension; never sent here
    expect(body.messages[0].content).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: IMAGE.dataUri },
    })
    expect(body.messages[1].content.at(-1)).toEqual({
      type: 'text',
      text: NINA_DESCRIBE_REQUEST_TEXT,
    })
  })

  it('logs both attempts and rethrows the ORIGINAL error when both providers fail', async () => {
    const fetchImpl = route(zaiDropped, () => json({ error: 'upstream unavailable' }, 503))

    await expect(
      describeNinaImagesWithFallback(fetchImpl, [IMAGE], {
        imageUrl: 'https://blob.example/nina/chat/abc.jpg',
      }),
      // The ORIGINAL class, not the fallback's transport error: `describeNinaImage` branches on
      // `instanceof NinaVisionTokenFloorError` to choose `reason: 'dropped'` and its loud
      // console.error. Rethrowing the fallback's error would silently reclassify every floor trip.
    ).rejects.toBeInstanceOf(NinaVisionTokenFloorError)

    expect(logNinaError).toHaveBeenCalledTimes(2)

    const first = logNinaError.mock.calls[0]![0] as Record<string, unknown>
    expect(first.category).toBe('multimodal')
    expect(first.provider).toBe('zai')
    expect(first.model).toBe('glm-4.6v')
    expect(first.timeoutMs).toBe(NINA_DESCRIBE_TIMEOUT_MS)
    expect(first.imageUrl).toBe('https://blob.example/nina/chat/abc.jpg')
    expect(String(first.errorMessage)).toContain('NinaVisionTokenFloorError')
    expect(String(first.errorMessage)).toContain('promptTokens=141')

    const second = logNinaError.mock.calls[1]![0] as Record<string, unknown>
    expect(second.category).toBe('multimodal')
    expect(second.provider).toBe('openrouter')
    expect(second.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(second.timeoutMs).toBe(NINA_DESCRIBE_FALLBACK_TIMEOUT_MS)
    expect(second.imageUrl).toBe('https://blob.example/nina/chat/abc.jpg')
    expect(String(second.errorMessage)).toContain('503')
  })

  it('logs the z.ai attempt even when the fallback then succeeds', async () => {
    const fetchImpl = route(zaiDropped, openRouterOk)
    await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(logNinaError).toHaveBeenCalledTimes(1)
    expect((logNinaError.mock.calls[0]![0] as Record<string, unknown>).provider).toBe('zai')
  })

  it('a broken log writer costs nothing — the outer call is unaffected', async () => {
    logNinaError.mockRejectedValueOnce(new Error('nina_error_logs is on fire'))
    const fetchImpl = route(zaiDropped, openRouterOk)

    // The z.ai row fails to write. The retry still happens and the photo is still described.
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('an empty image array is one throw and zero rows, not a programmer error logged twice', async () => {
    const fetchImpl = route(zaiOk, openRouterOk)
    await expect(describeNinaImagesWithFallback(fetchImpl, [])).rejects.toThrow(
      'describeNinaImages expects at least one image',
    )
    expect(logNinaError).not.toHaveBeenCalled()
    expect(callsOf(fetchImpl)).toHaveLength(0)
  })
})

describe('what the log row carries', () => {
  it('stores the real prompt and instruction, and never a base64 payload', () => {
    const input = describeLogInput('runner', 1)

    expect(input).toContain(NINA_DESCRIBE_SYSTEM_PROMPT)
    expect(input).toContain(NINA_DESCRIBE_REQUEST_TEXT)
    expect(input).toContain('image_url')
    // The one property that matters: ~1.2 MB of base64 per image must never reach a text column.
    expect(input).not.toContain('base64')
    expect(input).toContain('data: URI omitted')
  })

  it('selects the same witness prompt the request did', () => {
    expect(describeLogInput('self', 1)).toContain(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
    expect(describeLogInput('self', 1)).not.toContain(NINA_DESCRIBE_SYSTEM_PROMPT)
  })

  it('keeps a floor trip diagnosable — the three fields String(cause) throws away', () => {
    const text = describeErrorText(new NinaVisionTokenFloorError(141, 1_649, 1))
    expect(text).toContain('NinaVisionTokenFloorError')
    expect(text).toContain('promptTokens=141')
    expect(text).toContain('floor=1649')
    expect(text).toContain('imageCount=1')
  })

  it('keeps a transport error’s detail, which String(cause) never reaches', () => {
    const text = describeErrorText(
      new NinaVisionTransportError('request failed', new Error('ETIMEDOUT')),
    )
    expect(text).toContain('NinaVisionTransportError: request failed')
    expect(text).toContain('ETIMEDOUT')
  })

  it('survives a non-Error throw', () => {
    expect(describeErrorText('just a string')).toBe('just a string')
  })
})
```

**Impact:** `NINA_TOKEN_FLOOR_PER_IMAGE` and `describeSubjectForSide` stay imported for the existing
cases; `beforeEach` is newly imported from vitest. No existing assertion changes.

---

## Verification

**Build / typecheck:** `npx tsc --noEmit`
(`vitest` does not typecheck — run this before believing the phase is green.)

**Tests:**
- `npx vitest run lib/nina/vision.test.ts` — the eleven pre-existing cases plus the new suites.
- `npx vitest run tests/admin.chatPhotos.test.ts tests/admin.albumAvatarActions.test.ts tests/admin.chatPhotoAdoption.test.ts`
  — the three suites holding exact-argument pins on `describeNinaImages(refs, { subject })`. They
  must pass **unmodified**; if any of them needs an edit, the `imageUrl`/`userId` defaulting leaked
  out of `describeNinaImages` and the change is wrong.
- `npm test` — the full suite.

**Guards:** `npm run ci:openrouter-guard` — must still print `OK`. (`lib/nina/vision.ts` and
`lib/nina/openrouter.ts` are both under `lib/nina/`, and only `vision.ts` names the key, via
`ninaEnv()`.)

**Format / lint:** `npm run format:check` and `npm run lint`.

**Manual check (optional, costs money):** `npm run test:live:nina-vision` still probes z.ai only —
it calls `describeNinaImagesWithFetch` directly (`tests/live/ninaVision.live.test.ts:51`), which
this phase leaves untouched. A live probe of the fallback is not added: it would spend OpenRouter
credit on every run of a suite whose whole purpose is to check the PRIMARY endpoint.

**Exit criteria:**
1. `describeNinaImagesWithFetch` is byte-identical to its pre-phase form and all eleven of its
   existing cases pass unmodified.
2. A z.ai token-floor trip, a z.ai non-2xx, and a thrown z.ai fetch each produce one OpenRouter
   retry whose response is accepted on a non-empty check with `prompt_tokens` far below any floor.
3. A double failure writes exactly two `nina_error_logs` rows (`multimodal` / `zai` then
   `multimodal` / `openrouter`, each with its own model, timeout and the photo's Blob URL) and
   rethrows the **original** error instance, so `describeNinaImage` still returns
   `reason: 'dropped'` with a null description.
4. `npx tsc --noEmit`, `npm test`, `npm run ci:openrouter-guard` all clean.

## Handoffs

- **Phase 2 (R1, text) — RESOLVED.** Phase 2's plan now imports `NINA_FALLBACK_TEXT_MODEL` and
  `OPENROUTER_CHAT_URL` from `lib/nina/openrouter.ts` (created here) and declares neither; it also
  carries a `depends_on` edge to this phase. **Do not rename or relocate either constant** without
  editing Phase 2's plan in the same breath.
- **Phase 1 (R1/R2, schema) — RESOLVED.** `nina_error_logs.user_id` is nullable and `logNinaError`'s
  `userId` is optional, confirmed against Phase 1's Drizzle definition and pinned by its schema
  test. The full reasoning and the cost of the alternative are in **Requires**, above.
- **Phase 5 (R2, admin UI):** `nina_error_logs.error_message` on a multimodal row carries the raw
  provider text only; the timeout value lives in its own `timeout_ms` column. The user asked for the
  timeout to appear *in* the error-message cell ("timeout juga dimasukin ke full llm error message …
  perlu ditambahkan nilai timeoutnya (misal 300s)"), so **Phase 5 renders the two together** — e.g.
  `${errorMessage}\n\n(timeout: ${timeoutMs / 1000}s)` in the popup. Do not expect this phase's rows
  to have it pre-concatenated.
- **Phase 5:** multimodal rows written by this phase always carry `imageUrl` (the photo's Blob URL),
  since `describeNinaImages` fills it from `refs[0].blobUrl` unconditionally. A null `imageUrl` on a
  multimodal row would mean a caller reached `describeNinaImagesWithFallback` directly.
- **Not done, deliberately (not R1, not this phase):** threading a real `userId` from the five
  vision call sites. It needs edits in `lib/nina/actions.ts` and two `lib/admin/*.ts` files plus
  nine test-pin rewrites, serves no requirement in R1, and the `opts.userId` hook is already in
  place for whoever wants it.
- **Not done, deliberately:** re-describing the ~N photos whose `description` is permanently NULL
  from past z.ai outages. The fallback fixes new failures only; a backfill sweep is a separate,
  ops-shaped piece of work nobody asked for.
- **Not done, deliberately:** making the vision fallback model operator-selectable. Scope section of
  the plan index rules this out.

## Rollback

Single-file-plus-one revert, no data migration, no schema involvement:

1. `git checkout HEAD~1 -- lib/nina/vision.ts lib/nina/vision.test.ts && rm lib/nina/openrouter.ts`
   — or equivalently, in-place: restore the import block to `import { env } from '@/lib/env'` plus
   the two original relative imports, delete the two new constants, drop `imageUrl`/`userId` from
   `NinaDescribeOptions`, delete the four appended functions, and point `describeNinaImages` back at
   `describeNinaImagesWithFetch(fetch, images, opts)`.
2. Nothing else in the tree imports anything this phase created. `describeNinaImagesWithFetch` was
   never modified, so every caller and every existing test is already on the pre-phase code path.
3. **If Phase 2 has already landed, keep `lib/nina/openrouter.ts`.** Phase 2 `depends_on` this phase
   precisely because it imports that file, so in the normal ordering Phase 2 lands *after* this one
   and the file is load-bearing for it. It is two constants with no behaviour; deleting it breaks
   `lib/nina/llmFallbackText.ts`. Revert `vision.ts` only.
4. Rows already written to `nina_error_logs` are inert: no control flow reads them, and Phase 5's
   page simply shows fewer multimodal entries.
