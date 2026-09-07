> Adopted from `NINA_IMAGE_GENERATION_TAB_PLAN.md` phase 3. Source: `.workflows/plan/nina-image-generation-tab/phase-3.md`.
> Written and reconciled by /analyze — edit the source, not this copy.

# Phase 3: The reference image on the wire, and the timeout it costs

**Plan set:** `NINA_IMAGE_GENERATION_TAB_PLAN.md`
**Analysis:** `20260907-124015-IMGN_code_analyzer.md`
**Satisfies:** R10 (the backend half) — the operator's chosen photograph actually reaches
`qwen/qwen-image-3-pro` as `input_references`, and the generation is given enough wall clock to
come back.
**Depends on:** Phase 1 (only for the *shape* of the selection it stores — see Assumptions; no line
of phase 1's code is imported here)
**Difficulty:** HARD
**Package:** `lib/nina` (with one file in `scripts/`)

> ### ⚠ THE BASE MOVED AFTER THIS PLAN WAS WRITTEN — READ THIS FIRST
>
> This plan was written against `b0e492a`, which was local `main` and **30 commits behind
> `origin/main`**. `origin/main` has since been merged into the branch and the worktree is now at
> **`4a7588e`**. That is the tree this plan must be applied to.
>
> Two feature sets landed in that merge and both changed facts this plan set depends on:
> **`nina-photo-caption-from-image`** (migration `0009_nina_message_photo_only.sql` — `nina_messages.photo_only`)
> and **`nina-photo-refs-and-bubble-actions`** (migration `0010_nina_image_provenance.sql` —
> `nina_message_images.source_avatar_id` / `source_image_id`).
>
> **Consequences for every plan in this set:**
>
> 1. **The migration watermark is `0010`**, not `0008`. The journal has eleven entries (`idx` 0-10).
>    Phase 1 generates **`0011`**; phase 7 generates **`0012`**. No other phase generates one.
> 2. **Hand-written backfill SQL is appended AFTER `npm run db:generate`, and regeneration silently
>    drops it.** Both landed migrations say so in banner comments. Never hand-name, never rename, and
>    if a migration is ever regenerated, diff the old file against the new one and re-append before
>    deleting anything.
> 3. **A row in `nina_message_images` is a *reference* when `source_avatar_id` OR `source_image_id`
>    is non-null** — see plan invariant 13. The three collection reads already exclude them through
>    `isOriginalPhoto()` (`lib/nina/queries.ts:1616-1618`).
> 4. **`lib/nina/prompts/` now exists** (`caption.ts`, `describe.ts`, `distill.ts`, `index.ts`,
>    `system.ts`, `tools.ts`) and `lib/nina/persona.ts` gained the Instructor character
>    (`isInstructor` :730, `INSTRUCTOR_COACHING` :813, `ninaInstructorCoachingBlock` :839).
>    **Image-prompt assembly did NOT move** — `buildNinaImagePrompt` and `sidecarText` are still in
>    `lib/nina/imagegen.ts`, and `ninaAppearance` / `NINA_FACE` / `NINA_APPEARANCE` are still in
>    `persona.ts`. Nothing under `lib/nina/prompts/` imports any of them.
> 5. **`scripts/check-llm-payload-boundary.mjs` now guards NINE symbols, not eight** — the ninth is
>    `captionNinaPhoto`, sanctioned in `lib/nina/caption.ts`, `lib/admin/chatPhotoActions.ts` and
>    `lib/nina/imagerun.ts`. Three of the nine are image symbols (`runNinaImageJob`,
>    `describeNinaImage`, `captionNinaPhoto`). The guard is a name allowlist over `app/`, `lib/`,
>    `components/`; `buildNinaImagePrompt` is not in it, so a pure preview in a render still passes
>    (plan invariant 5 re-verified against the guard as it now stands).
> 6. **EVERY `file:line` CITATION BELOW IS ADVISORY.** Line numbers shifted in `persona.ts` (+~13 to
>    +139), `queries.ts` (+~130), `tuning.ts` (+~22), `schema.ts` (+~64), `CharacterPanel.tsx` (+13),
>    `app/admin/layout.tsx` (+31) and `imagegen.ts` (-7). The reconciler corrected the load-bearing
>    ones in place; **grep for the symbol before editing, never `sed -n` a line range.**

---

## Goal

After this phase, a `nina_turns` row whose `args.referenceUrl` names a public Blob object produces
an OpenRouter call that carries that object as a `data:` URL inside `input_references` — the one
payload shape this repo has ever got a 200 from — and the call is allowed 220 s instead of 150 s,
because RU-18 measured an anchored generation at 148.9 s against a 150 s ceiling. A row without
that field, or with a reference that cannot be fetched, produces byte-identically the request that
ships today. Nobody sets `referenceUrl` yet: phase 6 does, and until it does this phase is a
capability with no caller and no behaviour change.

## Interface Contract

> **RECONCILED — every conflict warning this phase raised has been checked and settled, and this
> plan needed no change to its own contract.**
>
> - **`lib/nina/imagerun.ts` is confirmed as this phase's fifth owned file.** It is on no other
>   phase's Owns list, and the plan index's phase-3 row has been corrected to name it. Phase 6
>   *calls* `fireNinaImageGeneration` from it and edits nothing in it.
> - **The `tests/nina.imagerecipe.test.ts` split with phase 2 is confirmed disjoint** and both
>   plans' line ranges are still correct — that file was **not** touched by the `origin/main`
>   merge. Phase 2 owns `describe('the prompt')` (`:66-210`); this phase owns
>   `describe('the payload …')` (`:34-64`), `describe('the threshold chain')` (`:276-363`) and the
>   import list (`:6-32`). The `reference:  none (RU-18)` assertion at `:98` stays, in phase 2's
>   block, untouched by both — and phase 6 has been told it therefore remains cosmetically wrong on
>   an anchored sidecar, filed as a follow-up card rather than fixed across a seam.
> - **`NinaImageJobArgs.referenceUrl?: string | null` is confirmed as the shape phase 6 codes
>   against**, and phase 6 passes an explicit `null` for the unanchored case, which
>   `ninaImageReferenceUrl(args)` normalises. Phase 6 fills it from
>   `resolveNinaPhotoReference(userId, prefs.reference)?.blobUrl` — an owner-scoped resolve, never a
>   string off a request body, which is this phase's stated requirement.
> - **Nothing from phase 1 is imported here**, at compile time or otherwise, so this phase's
>   `Depends on: 1` is a shape dependency only and the two can be built in either order within the
>   wave.
> - `lib/nina/imagerecipe.ts`, `imagecall.ts` and `scripts/nina-image-worker.ts` were **not** touched
>   by the `origin/main` merge, so this plan's line citations for them are still accurate — unlike
>   `persona.ts`, `queries.ts` and `tuning.ts`, which moved. One correction: `NINA_IMAGE_DAILY_CAP`
>   is at `:119`, and the analysis document's `:196` / `:216` for the two call timeouts are stale
>   (they are `:150` and `:167`); this plan's own ranges were already right.

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Creates:**

- `lib/nina/imagerecipe.ts`
  - `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000`
  - `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS = 10_000`
  - `NINA_IMAGE_REFERENCE_MAX_BYTES = 8 * 1024 * 1024`
  - `NINA_IMAGE_REFERENCE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`
  - `type NinaImageReferenceContentType`
  - `function ninaImageCallTimeoutMs(anchored: boolean): number`
  - `function ninaImageReferenceUrl(args: Partial<NinaImageJobArgs> | null | undefined): string | null`
  - `function buildImageReferenceDataUrl(contentType: string, base64: string): string | null`
- `lib/nina/imagecall.ts` — `function fetchNinaImageReference(url: string): Promise<string | null>`
- `scripts/nina-image-worker.ts` — `function fetchReference(url: string): Promise<string | null>`
  (the worker's own copy; it cannot import `imagecall.ts`, which is `server-only` + `@/`)
- `lib/nina/imagerun.ts` — `interface AttemptResult` (module-private)

**Signature changes:**

- `buildImageRequestBody({ prompt, seed })` -> `buildImageRequestBody({ prompt, seed, referenceDataUrl? })`
  (`referenceDataUrl?: string | null` — **optional**, so every existing call site compiles unchanged)
- `callNinaImageModel(prompt, seed)` -> `callNinaImageModel(prompt, seed, referenceUrl = null)`
  (a third **optional positional** parameter, not an options object: `tests/nina.imagecall.test.ts`
  calls it positionally in four places and it is not a file this plan set owns)
- `generate(prompt, seed)` (worker) -> `generate(prompt, seed, referenceUrl = null)` (same reasoning:
  `tests/nina.imageworker.test.ts` calls it positionally in seven places)
- `NinaImageCallResult`'s `ok: true` branch gains `anchored: boolean`
- `attemptOnce` (module-private in `imagerun.ts`) returns `AttemptResult` instead of a string union.
  **`runNinaImageJob`'s signature and return type do not change** — `'none' | 'ok' | 'retry' | 'gave-up'`,
  exactly as today, because `fireNinaImageGeneration`, `jobActions.ts`,
  `tests/nina.jobActions.test.ts` and `tests/integration/ninaImageE2E.int.test.ts` all depend on it.

**Type changes:**

- `NinaImageJobArgs` gains `referenceUrl?: string | null`. **Optional, and that is load-bearing** —
  see "How an old row stays readable" in Step 5.

**Value changes:**

- `NINA_IMAGE_RUN_BUDGET_MS`: `200_000` -> `240_000`. Re-derived in Step 4; asserted in Step 8.
- `NINA_IMAGE_CALL_TIMEOUT_MS` stays `150_000`; `NINA_WORKER_CALL_TIMEOUT_MS` stays `240_000`;
  `NINA_IMAGE_FINISH_RESERVE_MS`, `NINA_TURN_SPENT_MS`, `NINA_HOST_MAX_DURATION_MS`,
  `NINA_IMAGE_RECLAIM_MS`, `NINA_IMAGE_STALE_MS`, `NINA_WORKER_TIMEOUT_MINUTES` are all unchanged.

**Deletes:** nothing. No symbol, no column, no config key.

**Renames:** nothing.

**Requires (from earlier phases):** nothing at compile time. Phase 1's `nina_image_prefs` is not
imported, not read and not mentioned by any file this phase edits.

**Provides (to phase 6, which is the only phase that may set it):**

```ts
/**
 * An absolute `https://` URL to a PUBLIC Vercel Blob object holding the operator's chosen
 * photograph. Absent or null = an unanchored generation, which is what every job written before
 * this phase is.
 */
referenceUrl?: string | null
```

Phase 6 puts it on the `NinaImageJobArgs` it hands `openNinaImageJob`, and nothing else has to
change for the anchor to reach the provider. It must be the `blob_url` of a `nina_avatars` row or a
`nina_message_images` row — resolved server-side from the operator's selection — never a string
that came off a request body.

**Leaves alone (owned by others):**

- `lib/nina/imagegen.ts`, `lib/nina/persona.ts`, `selfiegen.ts`, `avatargen.ts` (Phase 2)
- `lib/nina/imageprefs.ts`, `lib/nina/queries.ts`, `lib/db/schema.ts`, `drizzle/*` (Phase 1)
- everything under `app/`, `components/`, `lib/admin/` (Phases 4, 5, 6)
- `lib/nina/imagetest.ts` (Phase 6 — it does not exist yet)
- `lib/nina/imagejobs.ts` — **checked, and genuinely needs no edit**: `reopenNinaImageJob` copies
  args with `{ ...args, attempts: 0 }` (`:222`), so a redo of an anchored job stays anchored for
  free, and `isRedoableArgs` (`:184`) only requires `prompt` and `seed`.
- `.github/workflows/nina-image.yml` — `timeout-minutes: 6` is untouched (Step 6 explains why the
  backstop keeps one timeout).
- `NINA_IMAGE_RESOLUTION`, `NINA_IMAGE_ASPECT`, `NINA_IMAGE_DAILY_CAP`.

**Conflict warnings for the reconciler:**

1. **`tests/nina.imagerecipe.test.ts` is edited by BOTH phase 2 and phase 3.** They are disjoint by
   `describe` block and must stay that way:
   - phase 3 owns `describe('the payload …')` (`:34-64`) and `describe('the threshold chain')`
     (`:276-363`), plus the `@/lib/nina/imagerecipe` import list (`:6-32`);
   - phase 2 owns `describe('the prompt')` (`:66-210`).
   Phase 3 does not touch a single line inside `describe('the prompt')`, including the
   `reference:  none (RU-18)` sidecar assertion at `:98` — see Handoffs.
2. **`lib/nina/imagerun.ts` is a fifth file this phase must own, and the index's phase-3 row does
   not name it.** It is the only place `args.referenceUrl` can be read on the app host
   (`imagerun.ts:328` is the single `callNinaImageModel` call site) and the only place the retry
   budget is spent, so R10's backend cannot work without it. It is on nobody else's Owns list; the
   index's "Files: 5" count matches once it is included. Phase 6 *calls*
   `fireNinaImageGeneration` from this file but edits nothing in it.
3. `tests/nina.imagecall.test.ts` and `tests/nina.imageworker.test.ts` are edited here and are on
   no other phase's list.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/nina/imagerecipe.ts` | modify | header block `:38-45` rewritten (RU-18's ruling reversed); five new constants + three new functions after `:167`; `NINA_IMAGE_RUN_BUDGET_MS` re-derived at `:156-163`; `buildImageRequestBody` at `:283-296` gains an optional reference; `NinaImageJobArgs` at `:343-357` gains `referenceUrl` |
| `lib/nina/imagecall.ts` | modify | header `:55-59` re-derived for two in-platform timeouts; new `fetchNinaImageReference`; `callNinaImageModel` at `:73-76` gains the third parameter, selects the timeout, and reports `anchored` |
| `lib/nina/imagerun.ts` | modify | imports `:18-34`; `attemptOnce` `:317-378` returns `AttemptResult` and threads the reference; `runNinaImageJob` `:398-421` sizes the retry by this job's ceiling |
| `scripts/nina-image-worker.ts` | modify | imports `:65-81`; new `fetchReference`; `generate` at `:458` gains the third parameter; the call site at `:866` passes it |
| `tests/nina.imagerecipe.test.ts` | modify | the payload block `:34-64` and the threshold block `:276-363`; import list `:6-32` |
| `tests/nina.imagecall.test.ts` | modify | three cases appended: the anchored payload, the degrade, and the never-throws promise under a broken reference |
| `tests/nina.imageworker.test.ts` | modify | the same two at the second host; `:167-178`'s "no reference image" case restated |

## Implementation Steps

### Step 1: Rewrite the header ruling that argues against the code below it

**File:** `lib/nina/imagerecipe.ts:38-45`
**Change:** Replace the `── THE FACT THAT IS NO LONGER HERE ──` block. A header that forbids what
the file now does is the failure mode this repo documents most, and the block currently says *"Do
not add it back"* about the exact parameter Step 5 adds. Delete these eight lines:

```
 * ── THE FACT THAT IS NO LONGER HERE ───────────────────────────────────────────────────────────
 * The third scar in `gen_badge_art.py` is that the reference image rides in `input_references` on
 * the same generations call. **RU-18 dropped the anchor**, so this phase sends no
 * `input_references` at all and `buildImageRequestBody` has no parameter for one. Do not add it
 * back "for consistency with the badge deck": it was measured at 148.9 s against 78.2 s, and the
 * user deferred face fidelity knowingly. The seed for a future consistent-face feature is
 * `assets/nina/_anchor.png`, committed by phase 1 and read by nothing.
```

**Code:** and put this in their place, keeping the surrounding blank comment lines:

```
 * ── THE FACT THAT CAME BACK, AND WHAT IT COSTS (R10) ──────────────────────────────────────────
 * The third scar in `gen_badge_art.py` is that the reference image rides in `input_references` on
 * the same generations call. This block used to say RU-18 had dropped the anchor and *"do not add
 * it back for consistency with the badge deck"*. **R10 reverses that ruling, and the user asked
 * for it in as many words:** *"photo reference: user can select all photos in Nina's album and
 * Chat photos … user can select one out of all these photos."* So `buildImageRequestBody` has an
 * OPTIONAL reference parameter again, and `NinaImageJobArgs.referenceUrl` is how a job carries
 * one.
 *
 * **RU-18's measurement was right and is not repealed — it is PAID FOR.** An anchored generation
 * was measured at **148.9 s** against **78.2 s** unanchored, and the shipping in-platform ceiling
 * was 150 s, so shipping R10 against that ceiling would have aborted about half of its own
 * generations after the money was spent. That is why there is now a SECOND in-platform timeout —
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, used only when a reference is present — and why
 * `NINA_IMAGE_RUN_BUDGET_MS` moved from 200 s to 240 s. The threshold block below derives both.
 *
 * **WHAT `input_references` ACTUALLY DOES ON THIS MODEL, measured elsewhere in this repo and not
 * to be re-learned at $0.04 a probe:** it *"behaves like a strong img2img, not a style reference:
 * it transfers the SUBJECT hard and the cloth tone not at all"* — `docs/plans/F10-badge-art-skill.md:1087`
 * (three graded attempts), restated at `docs/plans/F15-badge-master-aspect.md:79-88` and
 * `docs/plans/F25-record-patch-art.md:322`. For a badge that was fatal, because a badge is being
 * INVENTED. Here it is the point: the operator picks a photograph of the woman he wants back, and
 * the subject transferring hard is the request. The honest caveat, which belongs on the picker and
 * not in a prompt sentence: the chosen photograph's pose and composition come along with her face.
 * The finding is not contradicted, it is used — exactly as F15 §2.2 used it.
 *
 * **ONLY `image/png` IS VERIFIED ON THIS ENDPOINT.** `gen_badge_art.py:349` hardcodes
 * `data:image/png;base64,`. `NINA_IMAGE_REFERENCE_CONTENT_TYPES` also admits JPEG and WebP because
 * that is what the album and the chat photos actually hold, and refusing them would leave R10 with
 * almost nothing to point at. The first anchored generation is therefore also the probe — which is
 * what R11's test button is for, and its verdict distinguishes a refusal from a timeout.
 *
 * **`assets/nina/_anchor.png` IS STILL READ BY NOTHING, and this phase did not change that.** It
 * is written by `scripts/nina-profpic.mjs` (and the `update-nina-profpic` skill) as the committed
 * face seed, it is 6.7 MB, and it is deliberately NOT the fallback for a reference that cannot be
 * fetched: a committed asset is on the GitHub runner's disk and is not in the Vercel bundle unless
 * something imports it, so a fallback built on it would work on one host and not the other, which
 * is worse than no fallback. A reference that cannot be fetched degrades to an unanchored
 * generation with a warning — the operator gets a picture without the anchor rather than an
 * apology.
```

**Impact:** documentation only, but it is the difference between a file that explains itself and a
file that contradicts itself. Nothing compiles differently.

---

### Step 2: The anchored call timeout

**File:** `lib/nina/imagerecipe.ts:143-150` (the `NINA_IMAGE_CALL_TIMEOUT_MS` docblock and value)
**Change:** re-comment the existing constant so it names itself as the *unanchored* one, and add
the anchored one directly beneath it. Replace lines 143-150 in full:

```ts
/**
 * **The in-platform OpenRouter call's timeout, WITHOUT a reference.** 1.9x the measured 78.2 s.
 *
 * Not `NINA_WORKER_CALL_TIMEOUT_MS`: on a GitHub runner there is no ceiling to race, so 240 s is
 * free there and would be reckless here. 45 + 150 + 20 = 215 s inside a 300 s invocation, with
 * 85 s of slack for a cold start and a slow Blob write.
 *
 * **Read it through `ninaImageCallTimeoutMs(anchored)` rather than directly.** An anchored call has
 * its own ceiling below, and a caller that hardcodes this one would abort about half of R10's
 * generations at 150 s — the exact bug RU-18's measurement predicts.
 */
export const NINA_IMAGE_CALL_TIMEOUT_MS = 150_000

/**
 * **The in-platform timeout WITH a reference, and the whole price of R10.** 1.5x the measured
 * 148.9 s anchored generation (`gen_badge_art.py`'s own `urlopen` ceiling for the same shape is
 * 300 s, and its comment says the ceiling "is doing real work rather than guarding a
 * hypothetical").
 *
 *   NINA_TURN_SPENT_MS + this + NINA_IMAGE_FINISH_RESERVE_MS <= NINA_HOST_MAX_DURATION_MS
 *   45 + 220 + 20 = 285 <= 300                                        ✔ 15 s of slack
 *
 * versus 215 <= 300 unanchored. **The slack fell from 85 s to 15 s and that is the cost of the
 * anchor**, paid only on jobs that carry one. Worst case is reached only when all three worst
 * cases coincide — a turn that really spent its measured 45 s high end, a provider that runs to
 * the full ceiling, and finish writes that need their whole reserve — and the consequence is the
 * invocation being killed with a `running` row, which `reviveNinaImageJobs` re-fires on the next
 * `/nina` render and `sweepStaleNinaImageJobs` apologises for at twenty minutes. Three nets, all
 * unchanged.
 *
 * **IT BOUNDS THE WHOLE OF `callNinaImageModel`, fetch included.** The reference is fetched from
 * Blob inside that function, before the POST, and the POST's `AbortSignal` gets what is LEFT of
 * this after the fetch. So this one number is the honest ceiling on the call and the arithmetic
 * above needs no fourth term — `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS` is a sub-bound inside it,
 * not an addition to it.
 */
export const NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000
```

**Impact:** nothing reads the new constant until Step 3's selector; `NINA_IMAGE_CALL_TIMEOUT_MS`
keeps its value, so the unanchored path is bit-for-bit unchanged.

---

### Step 3: The reference's own bounds, and the three pure functions both hosts share

**File:** `lib/nina/imagerecipe.ts` — insert immediately after
`export const NINA_WORKER_TIMEOUT_MINUTES = 6` (currently `:170`), i.e. between that constant and
the `NINA_IMAGE_DISPATCH_GRACE_MS` docblock.
**Change:** add the reference's policy — its byte bound, its content types, its fetch deadline —
and the three pure functions that keep the two hosts from disagreeing. **Every one of these is a
string, a number or a pure function: PLAN INVARIANT 2 holds, this file still imports nothing.**

**Code:**

```ts
/**
 * **How long the reference fetch may take, out of the anchored allowance above.**
 *
 * A Blob object is on a public CDN in the same region, so ten seconds is generous for the 8 MiB
 * worst case; the ordinary case is a ~1.2 MB generated PNG. It is a SUB-BOUND of
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, not an addition to it — `callNinaImageModel` gives the
 * POST whatever is left of the 220 s after the fetch — which is why the threshold arithmetic has
 * three terms and not four.
 *
 * Missing this deadline costs an ANCHOR, never a job: the fetch degrades to an unanchored
 * generation with a warning.
 */
export const NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS = 10_000

/**
 * **The largest reference this pipeline will put on the wire. 8 MiB.**
 *
 * Two reasons for that number and not a rounder one:
 *
 *   1. It is exactly `ADMIN_AVATAR_MAX_UPLOAD_BYTES` (`lib/admin/avatars.ts:46`), which is the
 *      largest thing the picker can offer — that constant's own comment says *"a lightly-compressed
 *      PNG portrait is ~7 MB"*. A cap below it would silently drop the anchor on album photographs
 *      the operator can see and select, which is a control that does nothing. Chat photos are
 *      smaller by construction (2 MiB admin-added, 900 KB from his side) and a generated 1K PNG is
 *      ~1.2 MB.
 *   2. An UNBOUNDED fetch into a JSON body on a serverless invocation is both a memory and a
 *      latency problem. **Base64 inflates bytes by 4/3**: 8 MiB in becomes ~11.2 MB of `data:` URL,
 *      and `JSON.stringify` makes another copy of it, so the transient peak is ~30 MB. That is
 *      affordable at 8 MiB and is not at 80.
 *
 * It cannot IMPORT `ADMIN_AVATAR_MAX_UPLOAD_BYTES` — this module must stay zero-import for the
 * Actions worker (see the header) — so `tests/nina.imagerecipe.test.ts` imports both and asserts
 * they agree. Same mitigation shape as `ninaImagePathname` versus `NINA_BLOB_PREFIX` (RULING A6).
 */
export const NINA_IMAGE_REFERENCE_MAX_BYTES = 8 * 1024 * 1024

/**
 * What a reference `data:` URL may claim to be — read back from the Blob's own `content-type`
 * header and allow-listed, never assumed.
 *
 * The same three as `ADMIN_AVATAR_CONTENT_TYPES` (`lib/admin/avatars.ts:38`) and
 * `vision.ts`'s `DESCRIBABLE_MEDIA_TYPES`, and asserted against the former in the tests. Labelling
 * JPEG bytes `image/png` in a data URI is a lie told to a vendor whose failure mode is "200 OK with
 * invented content" (`vision.ts:275`'s ruling), so a served type outside this list DEGRADES to an
 * unanchored generation rather than being guessed at.
 *
 * Only `image/png` is VERIFIED on this endpoint (`tools/gen_badge_art.py:349`). See the header.
 */
export const NINA_IMAGE_REFERENCE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type NinaImageReferenceContentType = (typeof NINA_IMAGE_REFERENCE_CONTENT_TYPES)[number]

/**
 * **Which of the two in-platform ceilings this call gets.** One function so that neither host, nor
 * `imagerun.ts`'s retry budget, can pick the wrong one — and so the choice is one grep away from
 * both constants.
 *
 * `anchored` is a boolean rather than the URL because the two call sites mean different things by
 * it: `imagerun.ts` asks "does this JOB request an anchor" (conservative — it must reserve the
 * larger budget before the fetch is attempted) and `imagecall.ts` asks "is an anchor actually
 * going on the wire" (precise — a reference that could not be fetched is an unanchored call and
 * gets the unanchored ceiling).
 */
export function ninaImageCallTimeoutMs(anchored: boolean): number {
  return anchored ? NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS : NINA_IMAGE_CALL_TIMEOUT_MS
}

/**
 * **The one reader of `args.referenceUrl`, because `nina_turns.args` is jsonb and old rows exist.**
 *
 * Every row written before this phase has no `referenceUrl` key at all, and both hosts read those
 * rows (`claimNinaImageJob` in `lib/nina/imagejobs.ts` and `claimJob` in
 * `scripts/nina-image-worker.ts` both cast `row.args` straight to `NinaImageJobArgs`, with no
 * validation and no migration of the blob). So the field is OPTIONAL in the interface and every
 * read goes through this function, which normalises four things to one:
 *
 *   · absent          -> null   (every job written before this phase)
 *   · null            -> null   (a job whose operator selected nothing)
 *   · ''              -> null   (a form that round-tripped an empty string; a `data:`-less fetch
 *                                of '' would be a transport failure inside the anchored branch)
 *   · not a string    -> null   (jsonb holds whatever was written; nothing validates it on read)
 *
 * It also refuses anything that is not `https://`. The URL is resolved server-side from our own
 * rows, so this is not the SSRF boundary — it is the assertion that it stays that way, cheap enough
 * to keep even though nothing untrusted reaches it today.
 */
export function ninaImageReferenceUrl(
  args: Partial<NinaImageJobArgs> | null | undefined,
): string | null {
  if (args == null) return null
  const url = args.referenceUrl
  if (typeof url !== 'string' || url.length === 0) return null
  return url.startsWith('https://') ? url : null
}

/**
 * `data:<type>;base64,<payload>` — the exact string `tools/gen_badge_art.py:349-351` builds, minus
 * the file read.
 *
 * Returns null when the served content type is not one this pipeline will vouch for, which the
 * callers turn into an unanchored generation. Building the URL is separated from FETCHING it
 * because the fetch differs per host (`imagecall.ts` on Vercel, `fetchReference` on the runner) and
 * this string must not: a payload built two ways is a payload that will one day be built two ways.
 */
export function buildImageReferenceDataUrl(contentType: string, base64: string): string | null {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!(NINA_IMAGE_REFERENCE_CONTENT_TYPES as readonly string[]).includes(type)) return null
  if (base64.length === 0) return null
  return `data:${type};base64,${base64}`
}
```

**Impact:** additive. `ninaImageReferenceUrl` references `NinaImageJobArgs`, which is declared later
in the same module — fine for an `interface` (TypeScript hoists type declarations); no runtime
ordering issue because nothing is evaluated at module load.

---

### Step 4: Re-derive the run budget for an anchored attempt

**File:** `lib/nina/imagerecipe.ts:155-163`
**Change:** an anchored attempt needs 220 s of call plus 20 s of finish writes = 240 s, and
`runNinaImageJob` refuses to *begin* an attempt that does not fit in the budget — so a 200 s budget
would refuse every anchored attempt, including the first, and R10 would never generate anything at
all. Replace the docblock and the value:

```ts
/**
 * What `lib/nina/imagerun.ts` may spend of the invocation, from the moment it starts. Its retry
 * loop refuses to begin an attempt that would not fit inside what is left of this — a retry killed
 * halfway spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * **Two inequalities pin it, and R10 moved it from 200 s to 240 s.**
 *
 *   1. It must hold ONE WHOLE ANCHORED ATTEMPT, or the loop refuses even the first one and the
 *      reference feature generates nothing:
 *        NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS <= this
 *        220 + 20 = 240 <= 240                                              ✔ exactly
 *   2. It must still fit under the host ceiling with a whole chat turn already spent — the
 *      inequality the whole in-platform design rests on:
 *        NINA_TURN_SPENT_MS + this <= NINA_HOST_MAX_DURATION_MS
 *        45 + 240 = 285 <= 300                                              ✔ 15 s of slack
 *
 * The unanchored attempt is unchanged at 150 + 20 = 170 <= 240.
 *
 * **What (1) being EXACT means, said plainly: an anchored job gets one attempt per invocation.**
 * After any anchored failure, `Date.now() - start` is already positive, so
 * `elapsed + 220 + 20 > 240` and the loop declines the retry and returns `'retry'`. That is the
 * correct answer rather than a limitation — two 220 s attempts cannot fit under a 300 s ceiling by
 * any arithmetic — and the second attempt still happens: the row is left `queued`,
 * `NINA_IMAGE_MAX_ATTEMPTS` is still 2, and `reviveNinaImageJobs` re-fires it on the next `/nina`
 * render with a fresh 300 s. An unanchored job keeps its same-invocation retry and gets a more
 * generous one than before: it now retries after any failure inside the first 70 s (240 - 170)
 * where the old 200 s budget allowed 30 s.
 */
export const NINA_IMAGE_RUN_BUDGET_MS = 240_000
```

**Impact:** the only behaviour change on the *unanchored* path in this whole phase, and it is a
widening: an unanchored failure between 30 s and 70 s now retries inside the same invocation
instead of waiting for the next `/nina` render. Both bounds are asserted in Step 8.
`tests/integration/ninaImageE2E.int.test.ts:660-670` reasons about this loop against a stub that
answers instantly, where the check passes either way; it needs no edit.

---

### Step 5: The payload, and the field that carries the reference

**File:** `lib/nina/imagerecipe.ts:274-296` (`buildImageRequestBody` and its docblock) and
`:337-357` (`NinaImageJobArgs`)
**Change:** the function gains one optional input and appends one key. Replace the whole function
including its docblock:

```ts
/**
 * **The payload, in one place, so the two hosts cannot disagree.** The app never calls OpenRouter;
 * it only builds prompts. The worker never builds prompts; it only calls OpenRouter. This function
 * is where those two halves meet, and `tests/nina.imagerecipe.test.ts` asserts both ported facts
 * against it — which is the only way they can be asserted at all, since the worker's own `fetch` is
 * on a machine no test runs on.
 *
 * **WITHOUT a reference it is byte-identical to the body the unanchored probe got a 200 from**, and
 * the test asserts that against a literal rather than against a re-derivation:
 *   { model, prompt, resolution, aspect_ratio, n, seed }
 * The `input_references` key is ASSIGNED CONDITIONALLY and never set to `undefined`, so the
 * unanchored `JSON.stringify` output is unchanged down to the byte and the key order still matches
 * `gen_badge_art.py`'s (seed, then the references).
 *
 * **WITH one it adds exactly the shape `tools/gen_badge_art.py:349-354` verified** — one array, one
 * entry, `{ type: 'image_url', image_url: { url } }`, where the url is a `data:` URL built by
 * `buildImageReferenceDataUrl`. Not an `https://` URL: an image_url pointing at a host has never
 * been probed against this endpoint, and `lib/nina/vision.ts:252-258` makes the same ruling for the
 * same reason. Not `/images/edits` either — that route does not exist on this provider (fact 1).
 */
export function buildImageRequestBody(input: {
  prompt: string
  seed: number
  /** A `data:` URL from `buildImageReferenceDataUrl`. Absent or null = an unanchored generation. */
  referenceDataUrl?: string | null
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: NINA_IMAGE_MODEL,
    prompt: input.prompt,
    resolution: NINA_IMAGE_RESOLUTION,
    aspect_ratio: NINA_IMAGE_ASPECT,
    n: 1,
    seed: input.seed,
  }
  if (input.referenceDataUrl != null && input.referenceDataUrl.length > 0) {
    body.input_references = [{ type: 'image_url', image_url: { url: input.referenceDataUrl } }]
  }
  return body
}
```

Then, in `NinaImageJobArgs`, add the new member immediately after `sidecar` (`:356`), keeping every
existing member exactly as it is:

```ts
  /** The prompt-as-sent record; lands in `nina_message_images.prompt`. */
  sidecar: string
  /**
   * **The operator's chosen photograph (R10), as an absolute `https://` Blob URL.** Fetched and
   * base64'd at call time by whichever host runs the job, and sent as `input_references`.
   *
   * ── WHY IT IS OPTIONAL AND NOT `string | null` ────────────────────────────────────────────────
   * `nina_turns.args` is jsonb and is never migrated. Every row written before this phase has no
   * `referenceUrl` key, and BOTH hosts read those rows by casting: `claimNinaImageJob`
   * (`lib/nina/imagejobs.ts:342`) and the worker's `claimJob`
   * (`scripts/nina-image-worker.ts:429`) each do `row.args as NinaImageJobArgs` with no validation.
   * A required member would make that cast a lie about every historical row and every job phases 2
   * and 6 open without one. Optional keeps the cast honest; `ninaImageReferenceUrl(args)` is the
   * only sanctioned read and normalises absent, null, empty and non-string alike.
   *
   * A job whose reference cannot be fetched is generated WITHOUT it, with a warning. The operator
   * gets a picture without the anchor rather than an apology.
   */
  referenceUrl?: string | null
```

**Impact:** `tests/nina.jobActions.test.ts:128`'s `ARGS: NinaImageJobArgs` literal, the two
`NinaImageJobArgs` literals in `tests/integration/ninaImageE2E.int.test.ts`, and
`tests/live/ninaImageE2E.live.test.ts` all keep compiling untouched, which is the whole point of the
member being optional. The `.workflows/plan/*.md` hits from the grep are historical plan documents
and are not code.

---

### Step 6: Fetch the bytes and select the timeout, on Vercel

**File:** `lib/nina/imagecall.ts` — the import block `:5-11`, the header section at `:55-59`, the
result type at `:61-71`, and `callNinaImageModel` at `:73-114`.
**Change:** four edits to one file.

**6a — the imports.** Replace `:6-11`:

```ts
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  ninaImageCallTimeoutMs,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from './imagerecipe'
```

(`NINA_IMAGE_CALL_TIMEOUT_MS` is no longer imported here — `ninaImageCallTimeoutMs` owns the
choice, and leaving the unused import would fail `npm run lint`.)

**6b — the header's timeout section.** Replace `:55-59`:

```
 * ── THE TIMEOUTS ARE NOT THE WORKER'S, AND THERE ARE TWO OF THEM ──────────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` is 240 s because a GitHub runner has six hours and no ceiling to
 * race. Here there IS a ceiling — the route segment's `maxDuration` — so the timeout comes from
 * `ninaImageCallTimeoutMs(anchored)`: **150 s unanchored, 220 s with a reference**, because RU-18
 * measured an anchored generation at 148.9 s against 78.2 s and a 150 s ceiling would have aborted
 * about half of R10's own generations. Both are derived in `imagerecipe.ts`'s threshold block and
 * asserted in `tests/nina.imagerecipe.test.ts`. Two hosts, three ceilings, one payload.
 *
 * **THE CHOSEN CEILING BOUNDS THIS WHOLE FUNCTION, NOT JUST THE POST.** The reference is fetched
 * from Blob here, before the request, and the POST's `AbortSignal` gets what is left of the
 * allowance afterwards. So `callNinaImageModel` cannot outlive one constant, and the threshold
 * arithmetic needs no term for the fetch.
 *
 * ── A REFERENCE THAT CANNOT BE FETCHED IS NOT A FAILED JOB ────────────────────────────────────
 * `fetchNinaImageReference` returns null on every failure — a non-200 from Blob, an oversized
 * object, a content type this pipeline will not vouch for, a timeout, a thrown anything — and logs
 * one `console.warn`. The generation then proceeds UNANCHORED and the result carries
 * `anchored: false`, which `imagerun.ts` logs beside the bytes and the cost. The operator gets a
 * picture without the anchor rather than an apology, which is the trade R10 is worth: the alternative
 * is spending a day's quota on an apology for a CDN hiccup.
```

**6c — the result type.** Replace `:61-71` so a successful call says whether the anchor went with
it:

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
    }
```

**6d — the fetch helper and the call.** Replace `callNinaImageModel` (`:73-114`, up to and including
the closing brace of the `try`/`catch` around `fetch`) — the rest of the function, from
`const raw = await res.text()` at `:127` to the end, is unchanged except for the one `anchored`
field on the final return, given below. Insert the helper above the function:

```ts
/**
 * **The anchor, off Blob and into a `data:` URL. It never throws and it never blocks a job.**
 *
 * Modelled on `lib/nina/vision.ts`'s `toDataUri` (`:253-286`) — a `data:` URL rather than the
 * hosted URL, and the media type READ BACK from the object's own `content-type` and allow-listed
 * rather than assumed — with two differences that matter here:
 *
 *   1. **It returns null instead of throwing.** `vision.ts` throws because a description with no
 *      image is worthless; a photograph with no anchor is still a photograph.
 *   2. **It is BOUNDED.** `vision.ts` fetches chat photos, which are ≤ 900 KB by construction.
 *      This fetches whatever the operator picked out of the album, which is ≤ 8 MiB by
 *      construction — so `NINA_IMAGE_REFERENCE_MAX_BYTES` is a belt-and-braces guard on a set that
 *      every writer already bounds, checked twice: once against the declared `content-length`
 *      (cheap, and Vercel Blob serves one) and once against the bytes actually read.
 */
export async function fetchNinaImageReference(url: string): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina] image reference dropped — blob fetch failed', {
        url,
        status: res.status,
      })
      return null
    }

    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      console.warn('[nina] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''
    const dataUrl = buildImageReferenceDataUrl(served, bytes.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina] image reference attached', {
      bytes: bytes.byteLength,
      contentType: served,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    /* A timeout, a DNS failure, a truncated body — all of them cost the anchor and none of them
     * costs the job. */
    console.warn('[nina] image reference dropped — fetch threw', { url, cause: String(cause) })
    return null
  }
}

export async function callNinaImageModel(
  prompt: string,
  seed: number,
  /**
   * The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. Optional and
   * defaulted so every existing caller — and `tests/nina.imagecall.test.ts`'s four positional
   * calls — is unchanged.
   */
  referenceUrl: string | null = null,
): Promise<NinaImageCallResult> {
  const startedAt = Date.now()

  /*
   * Read INSIDE the function and inside a `try`, never at module scope. `ninaEnv()` is a lazy zod
   * group that throws when a member is absent, and the analysis measured production carrying
   * neither of the two it used to hold. It is a one-member group now — `OPENROUTER_API_KEY` —
   * because this phase deleted `GITHUB_DISPATCH_TOKEN` with the doorbell, so the coupling that
   * made a missing dispatch token break a generation is gone as well.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly here would
   * pass the grep and break plan invariant 3 — app code reads secrets through `lib/env.ts`.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    return {
      ok: false,
      kind: 'transport',
      latencyMs: Date.now() - startedAt,
      costMicroUsd: 0,
      detail: `image config: ${String(cause)}`,
    }
  }

  /* The anchor, if this job asked for one. BEFORE the key check would have been wrong: a job with
   * no key must not spend ten seconds pulling bytes it will never send. */
  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0
      ? null
      : await fetchNinaImageReference(referenceUrl)

  /*
   * The ceiling for what is ACTUALLY being sent — a reference that could not be fetched is an
   * unanchored call and gets the unanchored 150 s. Minus what the fetch already spent, so the
   * chosen constant bounds this whole function and not merely the POST. Floored at one second so a
   * pathologically slow fetch cannot hand `AbortSignal.timeout` a zero or a negative.
   */
  const postTimeoutMs = Math.max(
    1_000,
    ninaImageCallTimeoutMs(referenceDataUrl != null) - (Date.now() - startedAt),
  )

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed, referenceDataUrl })),
      signal: AbortSignal.timeout(postTimeoutMs),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      /* The request left the building. A generation that was aborted at its ceiling was very
       * probably billed, so this is `null` ("unknown, guess high") and not `0`. */
      costMicroUsd: null,
      detail: String(cause),
    }
  }
```

And the function's final return (`:164-170`) gains one field:

```ts
  return {
    ok: true,
    b64,
    /* `null` here means the provider said nothing; `imagerun.ts` substitutes the constant. */
    costMicroUsd: reportedCost ?? 0,
    latencyMs: Date.now() - startedAt,
    anchored: referenceDataUrl != null,
  }
```

**Impact:** an unanchored call sends the same bytes to the same URL with the same 150 s signal as
today. `tests/nina.imagecall.test.ts`'s four positional calls compile and pass unchanged.
`tests/nina.jobActions.test.ts` mocks this function with `(...args: unknown[])`, so the third
argument is absorbed.

---

### Step 7: Thread the reference through the runner, at both hosts

**File 7a:** `lib/nina/imagerun.ts:18-34` (imports), `:316-378` (`attemptOnce`), `:398-421`
(`runNinaImageJob`).

**Change:** the imports first — drop `NINA_IMAGE_CALL_TIMEOUT_MS`, add the two new readers:

```ts
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_FINISH_RESERVE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REVIVE_BUDGET,
  NINA_IMAGE_RUN_BUDGET_MS,
  NINA_IMAGE_WIDTH,
  ninaImageCallTimeoutMs,
  ninaImagePathname,
  ninaImageReferenceUrl,
  type NinaImageJobArgs,
  type NinaImagePurpose,
} from './imagerecipe'
```

Then replace `attemptOnce` in full — its `/** One attempt: claim, call, store, finish. */` docblock
included — with the version below. It is the same function with three additions: it reads the
reference, passes it, and reports whether the job it just attempted was anchored so the loop can
size the next one.

```ts
/**
 * What one attempt did, and whether the job it did it to carried an anchor.
 *
 * The second field exists for `runNinaImageJob`'s deadline check and for nothing else: an anchored
 * attempt needs 220 s + 20 s of wall clock and an unanchored one needs 170 s, and the loop cannot
 * ask the claim itself — `claimNinaImageJob` is what has the args, and it is one layer down.
 * Reserving the anchored figure for every job would silently delete the unanchored retry; reserving
 * the unanchored figure for every job would start an anchored retry that gets killed at 240 s with
 * the money spent.
 */
interface AttemptResult {
  outcome: 'none' | 'ok' | 'retry' | 'gave-up'
  anchored: boolean
}

/** One attempt: claim, call, store, finish. Returns what happened, and whether it was anchored. */
async function attemptOnce(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null },
): Promise<AttemptResult> {
  const claim = await claimNinaImageJob(userId, jobId, opts)
  if (claim == null) return { outcome: 'none', anchored: false }

  const { args, attempts } = claim
  /* The ONE sanctioned read of a jsonb field that may not be there. See `ninaImageReferenceUrl`. */
  const referenceUrl = ninaImageReferenceUrl(args)
  const anchored = referenceUrl != null
  console.info('[nina] image job claimed', {
    jobId,
    purpose: args.purpose,
    attempt: attempts,
    anchored,
  })

  const outcome: NinaImageCallResult = await callNinaImageModel(
    args.prompt,
    args.seed,
    referenceUrl,
  )
  if (!outcome.ok) {
    return { outcome: await closeFailed(userId, jobId, args, attempts, outcome), anchored }
  }

  /* The provider reported nothing, so the measured price stands in. ONE substitution point on this
   * path — `imagecall.ts` deliberately does not do it too. */
  const costMicroUsd = outcome.costMicroUsd > 0 ? outcome.costMicroUsd : NINA_IMAGE_COST_MICRO_USD
  const result = { latencyMs: outcome.latencyMs, costMicroUsd }

  let image: StoredImage
  try {
    image = await storeNinaImage(userId, args.purpose, outcome.b64)
  } catch (cause) {
    /*
     * **A store failure is a `transport` failure and not a crash.** The picture exists and we could
     * not keep it, which from the runner's side is "the photo did not come through" — and the
     * money is already spent, which is why it is still logged and still counted against the cap.
     */
    return {
      outcome: await closeFailed(userId, jobId, args, attempts, {
        kind: 'transport',
        latencyMs: outcome.latencyMs,
        costMicroUsd,
        detail: `store: ${String(cause)}`,
      }),
      anchored,
    }
  }

  try {
    if (args.purpose === 'avatar') {
      await finishAvatar(userId, jobId, args, image, result)
    } else {
      await finishSelfie(userId, jobId, args, image, result)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the `reap-orphaned-blobs` skill exists for.
     */
    return {
      outcome: await closeFailed(userId, jobId, args, attempts, {
        kind: 'transport',
        latencyMs: outcome.latencyMs,
        costMicroUsd,
        detail: `finish: ${String(cause)}`,
      }),
      anchored,
    }
  }

  console.info('[nina] image job done', {
    jobId,
    purpose: args.purpose,
    bytes: image.bytes,
    costMicroUsd,
    latencyMs: outcome.latencyMs,
    /* Requested versus SENT. `anchored: true, sentAnchored: false` is a degraded generation, and
     * the `console.warn` explaining why is immediately above it in the log. */
    anchored,
    sentAnchored: outcome.anchored,
  })
  return { outcome: 'ok', anchored }
}
```

Then replace `runNinaImageJob`'s docblock and body (`:380-421`):

```ts
/**
 * **Claim, generate, close — and retry only while the wall clock can actually hold another one.**
 *
 * The retry loop is bounded twice, and both bounds matter:
 *   · `NINA_IMAGE_MAX_ATTEMPTS`, enforced inside `claimNinaImageJob`'s WHERE, so two runners
 *     cannot spend the same budget; and
 *   · the DEADLINE below, so a second attempt is started only when a whole call timeout plus the
 *     finish writes still fit. **A retry that would be killed halfway is worse than no retry**: it
 *     spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * That deadline is why a FAST failure (a 500 at five seconds) retries immediately and a SLOW one (a
 * timeout at the ceiling) does not. The slow case is left `queued` and picked up by
 * `reviveNinaImageJobs` on the next `/nina` render, which starts a fresh invocation with a fresh
 * 300 s.
 *
 * **THE DEADLINE IS SIZED BY THIS JOB'S CEILING, WHICH R10 MADE TWO.** An anchored attempt needs
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS` = 240 s, which is the whole
 * of `NINA_IMAGE_RUN_BUDGET_MS`, so **an anchored job gets exactly one attempt per invocation** and
 * its second one comes from `reviveNinaImageJobs` on a fresh clock. Two 220 s attempts do not fit
 * under a 300 s host ceiling by any arithmetic, so this is the answer and not a shortfall. An
 * unanchored attempt needs 170 s and retries after any failure inside the first 70 s.
 */
export async function runNinaImageJob(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null } = {},
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const deadlineAt = Date.now() + NINA_IMAGE_RUN_BUDGET_MS

  for (;;) {
    const attempt = await attemptOnce(userId, jobId, opts)
    if (attempt.outcome !== 'retry') return attempt.outcome

    const nextAttemptMs =
      ninaImageCallTimeoutMs(attempt.anchored) + NINA_IMAGE_FINISH_RESERVE_MS
    if (Date.now() + nextAttemptMs > deadlineAt) {
      console.warn('[nina] retry left for the next host — not enough wall clock', {
        jobId,
        anchored: attempt.anchored,
        nextAttemptMs,
        remainingMs: deadlineAt - Date.now(),
      })
      return 'retry'
    }
    /* A reclaim on the SAME invocation: the row is `queued` again and this loop owns it. The
     * cutoffs stay as the caller set them, so a revival that was allowed to steal a stale row is
     * still allowed to retry it. */
  }
}
```

**File 7b:** `scripts/nina-image-worker.ts` — the import block `:65-81`, `generate` at `:451-458`,
and the call site at `:866`.

Add the four new members to the `imagerecipe.ts` import (alphabetical, as the block already is):

```ts
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_IMAGE_SWEEP_BUDGET,
  NINA_IMAGE_WIDTH,
  NINA_WORKER_CALL_TIMEOUT_MS,
  ninaImagePathname,
  ninaImageReferenceUrl,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../lib/nina/imagerecipe.ts'
```

Insert the worker's own fetch above `generate`, and replace `generate`'s docblock and signature:

```ts
/**
 * **The anchor, off Blob, on the runner.** A near-copy of `fetchNinaImageReference` in
 * `lib/nina/imagecall.ts`, and the duplication is stated rather than hidden — the same trade this
 * file's header makes about column names, and for the same reason: `imagecall.ts` opens with
 * `import 'server-only'` and reaches `@/lib/env`, neither of which survives
 * `--experimental-strip-types`.
 *
 * **What is NOT duplicated is everything that could disagree**: the byte bound, the fetch deadline,
 * the allow-list and the `data:` URL construction all come from `imagerecipe.ts`, which both hosts
 * import. What is duplicated is fifteen lines of `fetch` plumbing.
 *
 * A plain `fetch` of the public Blob URL, not `@vercel/blob`: this file can only reach that package
 * through `createRequire` (see `put`, above) and its reader half has no `require()`-able shape here.
 * A public Blob object is an HTTPS GET on both hosts, so the app side uses the same `fetch` — one
 * mechanism, two copies, rather than two mechanisms.
 */
export async function fetchReference(url: string): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina-worker] image reference dropped — blob fetch failed', {
        url,
        status: res.status,
      })
      return null
    }

    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      console.warn('[nina-worker] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina-worker] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''
    const dataUrl = buildImageReferenceDataUrl(served, bytes.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina-worker] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina-worker] image reference attached', {
      bytes: bytes.byteLength,
      contentType: served,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    console.warn('[nina-worker] image reference dropped — fetch threw', {
      url,
      cause: String(cause),
    })
    return null
  }
}

/**
 * One OpenRouter call. **It never throws** — every failure comes back as a `NinaImageFailure`,
 * because the caller's whole job is to turn that into one of her sentences, and a `catch` that has
 * to re-derive which of four things happened is a `catch` that will get it wrong.
 *
 * The classification is `classifyImageFailure` from `lib/nina/imagefail.ts` — **the same function
 * the app uses, imported, not paraphrased.** That is the whole reason `imagefail.ts` is forbidden
 * from having imports.
 *
 * ── ONE TIMEOUT HERE, TWO ON VERCEL, AND THAT ASYMMETRY IS DELIBERATE ─────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` (240 s) covers BOTH the anchored and the unanchored call on this
 * host: three times the measured 78.2 s unanchored, 1.6x the measured 148.9 s anchored. The app
 * needs a second, larger constant because it is racing a 300 s invocation ceiling; this host is
 * racing `timeout-minutes: 6` (360 s), and raising the call timeout above 240 s would mean raising
 * that ceiling too — which would mean re-deriving `NINA_IMAGE_RECLAIM_MS` (420 s, chosen to exceed
 * BOTH host ceilings) and editing the workflow. That is a large blast radius for a backstop that
 * the normal path never reaches, so the residual is accepted and named: an anchored generation
 * slower than 240 s fails here as `timeout` — the same failure the app would have had before R10,
 * and one `reviveNinaImageJobs` retries.
 *
 * The reference is fetched before the POST and inside the same 240 s wall, which is bounded by
 * `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS` (10 s) and degrades to unanchored on any failure.
 */
export async function generate(
  prompt: string,
  seed: number,
  /** The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. */
  referenceUrl: string | null = null,
): Promise<WorkerOutcome> {
  const startedAt = Date.now()
  const apiKey = process.env.OPENROUTER_API_KEY as string

  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0 ? null : await fetchReference(referenceUrl)

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed, referenceDataUrl })),
      /* What is left of the 240 s after the reference fetch, floored so a slow fetch cannot hand
       * `AbortSignal.timeout` a zero. */
      signal: AbortSignal.timeout(
        Math.max(1_000, NINA_WORKER_CALL_TIMEOUT_MS - (Date.now() - startedAt)),
      ),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      detail: String(cause),
    }
  }
```

The remainder of `generate` — from `const raw = await res.text()` to its final `return` — is
unchanged, and `WorkerOutcome` is unchanged (the worker logs no `anchored` flag; its `console.info`
at the call site does).

Finally the call site at `:866`:

```ts
  const outcome = await generate(
    job.args.prompt,
    job.args.seed,
    ninaImageReferenceUrl(job.args),
  )
```

**Impact:** an unanchored job on either host takes the same path with the same timeout as today.
`tests/nina.imageworker.test.ts`'s seven positional `generate(...)` calls compile and pass
unchanged.

---

### Step 8: The assertions

**File 8a:** `tests/nina.imagerecipe.test.ts` — the import block `:6-32`, the payload `describe`
`:34-64`, and the threshold `describe` `:276-363`. **Do not touch `describe('the prompt')`
(`:66-210`) — phase 2 owns it.**

Add to the top-of-file imports — **first in the `@/lib` group**, since the block is sorted and
`@/lib/admin/avatars` precedes `@/lib/nina/imagegen` (`npm run lint` enforces the order):

```ts
import { ADMIN_AVATAR_CONTENT_TYPES, ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'
```

(`lib/admin/avatars.ts` is importable from a test: its only import is `@/lib/nina/images`, which is
pure and zero-import. It is not `server-only`.)

and add these members to the existing `@/lib/nina/imagerecipe` import list:

```ts
  buildImageReferenceDataUrl,
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_CONTENT_TYPES,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  ninaImageCallTimeoutMs,
  ninaImageReferenceUrl,
```

Replace the payload `describe` (`:34-64`) with:

```ts
describe('the payload — the two surviving ported facts, and the reference that came back', () => {
  const body = buildImageRequestBody({ prompt: 'a photograph', seed: 42 })

  it('targets /images/generations with the right model', () => {
    // FACT 1. There is no /images/edits on this provider, and chat-completions with `modalities`
    // is refused by this model. Verified twice by this plan set's probes.
    expect(OPENROUTER_IMAGE_URL).toBe('https://openrouter.ai/api/v1/images/generations')
    expect(body.model).toBe(NINA_IMAGE_MODEL)
  })

  it('sends resolution and aspect_ratio, never size', () => {
    // FACT 2. `size` is ignored and the default is 2K — a 2048-px master, after the money is spent.
    expect(body.resolution).toBe(NINA_IMAGE_RESOLUTION)
    expect(body.aspect_ratio).toBe(NINA_IMAGE_ASPECT)
    expect(body.size).toBeUndefined()
  })

  it('sends the seed it was given', () => {
    // FACT 3. Honoured by this model, so a retry reproduces the same photograph.
    expect(body.seed).toBe(42)
    expect(body.n).toBe(1)
  })

  it('R10: WITHOUT a reference the body is byte-identical to the one the probe got a 200 from', () => {
    /*
     * The compatibility contract of this phase, asserted against a LITERAL rather than against a
     * re-derivation — a re-derivation would move with the code it is meant to pin. Key order
     * included, because this is the JSON that goes on the wire.
     */
    expect(JSON.stringify(buildImageRequestBody({ prompt: 'a photograph', seed: 42 }))).toBe(
      JSON.stringify({
        model: NINA_IMAGE_MODEL,
        prompt: 'a photograph',
        resolution: NINA_IMAGE_RESOLUTION,
        aspect_ratio: NINA_IMAGE_ASPECT,
        n: 1,
        seed: 42,
      }),
    )
    expect(body.input_references).toBeUndefined()
    expect(body.messages).toBeUndefined()
    expect(body.modalities).toBeUndefined()
  })

  it('R10: a null or empty reference is the unanchored body, not an empty array', () => {
    const nulled = buildImageRequestBody({ prompt: 'a photograph', seed: 42, referenceDataUrl: null })
    const empty = buildImageRequestBody({ prompt: 'a photograph', seed: 42, referenceDataUrl: '' })
    expect(JSON.stringify(nulled)).toBe(JSON.stringify(body))
    expect(JSON.stringify(empty)).toBe(JSON.stringify(body))
  })

  it('R10: WITH a reference it adds exactly the shape gen_badge_art.py:352 verified', () => {
    // The ONE payload in this repo that has ever got a 200 with an anchor: one array, one entry,
    // `{ type: 'image_url', image_url: { url } }`, on the ordinary generations call.
    const dataUrl = 'data:image/png;base64,QUJD'
    const anchored = buildImageRequestBody({
      prompt: 'a photograph',
      seed: 42,
      referenceDataUrl: dataUrl,
    })
    expect(anchored.input_references).toEqual([
      { type: 'image_url', image_url: { url: dataUrl } },
    ])
    /* Nothing else moved: the anchored body is the unanchored one plus one key. */
    expect({ ...anchored, input_references: undefined }).toEqual({
      ...body,
      input_references: undefined,
    })
  })

  it('R10: the data URL is built only for a content type this pipeline vouches for', () => {
    expect(buildImageReferenceDataUrl('image/png', 'QUJD')).toBe('data:image/png;base64,QUJD')
    /* The header's parameters and its casing are the store's business, not ours. */
    expect(buildImageReferenceDataUrl('IMAGE/JPEG; charset=binary', 'QUJD')).toBe(
      'data:image/jpeg;base64,QUJD',
    )
    /* Not vouched for -> null -> the caller degrades to unanchored rather than lying about the
     * bytes to a vendor whose failure mode is "200 OK with invented content". */
    expect(buildImageReferenceDataUrl('image/gif', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('text/html', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('', 'QUJD')).toBeNull()
    expect(buildImageReferenceDataUrl('image/png', '')).toBeNull()
  })

  it('R10: the reference bound agrees with the ONE definition of what the picker can offer', () => {
    /*
     * `imagerecipe.ts` cannot import `lib/admin/avatars.ts` — it must stay zero-import for the
     * Actions worker — so it spells 8 MiB itself. This is what makes that duplication checked
     * rather than merely intended; same mitigation shape as `ninaImagePathname` versus
     * `NINA_BLOB_PREFIX` (RULING A6). A test can import both modules; the worker still cannot.
     */
    expect(NINA_IMAGE_REFERENCE_MAX_BYTES).toBe(ADMIN_AVATAR_MAX_UPLOAD_BYTES)
    expect([...NINA_IMAGE_REFERENCE_CONTENT_TYPES].sort()).toEqual(
      [...ADMIN_AVATAR_CONTENT_TYPES].sort(),
    )
  })

  it('R10: args.referenceUrl is read tolerantly, because old jsonb rows have no such key', () => {
    // Every row written before this phase. `claimNinaImageJob` casts them straight to the type.
    expect(ninaImageReferenceUrl({ prompt: 'p', seed: 1 })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: null })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: '' })).toBeNull()
    expect(ninaImageReferenceUrl(null)).toBeNull()
    expect(ninaImageReferenceUrl(undefined)).toBeNull()
    /* Not the SSRF boundary — the URL is resolved from our own rows — but the assertion that it
     * stays that way. */
    expect(ninaImageReferenceUrl({ referenceUrl: 'http://blob.test/a.png' })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: 'file:///etc/passwd' })).toBeNull()
    expect(ninaImageReferenceUrl({ referenceUrl: 'https://blob.test/a.png' })).toBe(
      'https://blob.test/a.png',
    )
  })
})
```

Then in `describe('the threshold chain')`, replace the two cases at `:291-310` and append four
more. The replacements:

```ts
  it('the in-platform run fits inside the host ceiling with a full turn already spent', () => {
    // THE inequality the whole in-platform design rests on. R10 moved it: 45 + 240 = 285 <= 300.
    expect(NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS).toBeLessThanOrEqual(
      NINA_HOST_MAX_DURATION_MS,
    )
  })

  it('one whole attempt plus its finish writes fits inside the run budget — BOTH kinds', () => {
    // Otherwise `runNinaImageJob` could never start even its FIRST attempt without overrunning,
    // and for the anchored kind that would mean R10 generating nothing at all.
    // Unanchored: 150 + 20 = 170 <= 240. Anchored: 220 + 20 = 240 <= 240, exactly — which is why
    // an anchored job gets one attempt per invocation and its retry comes from a fresh render.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS).toBeLessThanOrEqual(
      NINA_IMAGE_RUN_BUDGET_MS,
    )
    expect(
      NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS,
    ).toBeLessThanOrEqual(NINA_IMAGE_RUN_BUDGET_MS)
  })

  it('the in-platform call timeout is above the measured 78.2 s and below the worker’s', () => {
    // Above, or a merely slow day throws away $0.04 and a photograph. Below the worker's 240 s,
    // because THIS host has a ceiling to race and that one does not.
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeGreaterThan(78_200)
    expect(NINA_IMAGE_CALL_TIMEOUT_MS).toBeLessThan(NINA_WORKER_CALL_TIMEOUT_MS)
  })
```

The four new cases, appended inside the same `describe`:

```ts
  it('R10: BOTH in-platform timeouts clear the host ceiling with a full turn spent', () => {
    // PLAN INVARIANT 3, for two timeouts instead of one:
    //   unanchored  45 + 150 + 20 = 215 <= 300
    //   anchored    45 + 220 + 20 = 285 <= 300
    // The anchored chain is what R10 costs, and 15 s is the slack it leaves.
    expect(
      NINA_TURN_SPENT_MS + NINA_IMAGE_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS,
    ).toBeLessThanOrEqual(NINA_HOST_MAX_DURATION_MS)
    expect(
      NINA_TURN_SPENT_MS + NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS,
    ).toBeLessThanOrEqual(NINA_HOST_MAX_DURATION_MS)
  })

  it('R10: the anchored timeout is above the measured 148.9 s that RU-18 recorded', () => {
    // The whole reason this constant exists. The shipping 150 s ceiling was 1.1 s above the
    // measurement, so R10 against it would have aborted about half of its own generations.
    expect(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS).toBeGreaterThan(148_900)
    expect(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS).toBeGreaterThan(NINA_IMAGE_CALL_TIMEOUT_MS)
  })

  it('R10: the reference fetch is a sub-bound of the call, not an addition to it', () => {
    // `callNinaImageModel` fetches the anchor and then gives the POST what is LEFT of the
    // allowance, which is why the inequality above has three terms and not four. If this ever
    // fails, the arithmetic above has stopped being true.
    expect(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS).toBeLessThan(NINA_IMAGE_CALL_TIMEOUT_MS)
    expect(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('R10: the timeout selector is the only place the choice is made', () => {
    expect(ninaImageCallTimeoutMs(false)).toBe(NINA_IMAGE_CALL_TIMEOUT_MS)
    expect(ninaImageCallTimeoutMs(true)).toBe(NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS)
  })
```

**File 8b:** `tests/nina.imagecall.test.ts` — append three cases inside the existing
`describe('callNinaImageModel')`, and add this helper above it (after `PNG`-less as it is, this file
has no helpers yet):

```ts
/**
 * A `fetch` stub that answers by URL: the Blob GET and the OpenRouter POST are two different calls
 * inside one `callNinaImageModel`, so a single-response stub cannot express an anchored call.
 *
 * **`vi.fn<typeof fetch>` and not a bare `vi.fn`** — the same trap
 * `tests/nina.imageworker.test.ts:30-35` documents: an untyped mock types its own `mock.calls` as
 * `[]`, so reading `calls[1][1]` to inspect the request body becomes a type error rather than the
 * assertion it looks like.
 */
function stubTwoHostFetch(blob: Response | Error, openrouter: Response) {
  const fn = vi.fn<typeof fetch>(async (input) => {
    if (String(input).startsWith(OPENROUTER_IMAGE_URL)) return openrouter
    if (blob instanceof Error) throw blob
    return blob
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

/** 200 OK from OpenRouter with one image, reusable because each case builds its own. */
function okImage() {
  return new Response(JSON.stringify({ data: [{ b64_json: 'QUJD' }], usage: { cost: 0.04 } }), {
    status: 200,
  })
}

/** What Vercel Blob serves for a generated selfie: PNG bytes with both headers set. */
function blobPng(bytes = 4) {
  return new Response(Buffer.alloc(bytes, 1), {
    status: 200,
    headers: { 'content-type': 'image/png', 'content-length': String(bytes) },
  })
}
```

and the cases:

```ts
  it('R10: a reference is fetched from Blob and rides as input_references', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fn = stubTwoHostFetch(blobPng(), okImage())

    const result = await callNinaImageModel('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(true)

    /* Two calls, in this order: the anchor, then the generation. */
    expect(fn.mock.calls.length).toBe(2)
    expect(String(fn.mock.calls[0]?.[0])).toBe('https://blob.test/nina/a.png')
    const init = fn.mock.calls[1]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as {
      input_references?: Array<{ type: string; image_url: { url: string } }>
    }
    expect(body.input_references?.length).toBe(1)
    expect(body.input_references?.[0]?.type).toBe('image_url')
    expect(body.input_references?.[0]?.image_url.url.startsWith('data:image/png;base64,')).toBe(
      true,
    )
  })

  it('R10: a reference that cannot be fetched degrades to unanchored — never a failed job', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'

    /* Four ways to lose an anchor: a 404, an oversized object, a type we will not vouch for, and a
     * thrown fetch. All four must produce a PHOTOGRAPH. */
    const losses: Array<Response | Error> = [
      new Response('nope', { status: 404 }),
      new Response(Buffer.alloc(8), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '999999999' },
      }),
      new Response(Buffer.alloc(8), {
        status: 200,
        headers: { 'content-type': 'text/html', 'content-length': '8' },
      }),
      new Error('ECONNRESET'),
    ]

    for (const loss of losses) {
      const fn = stubTwoHostFetch(loss, okImage())
      const result = await callNinaImageModel('a photograph', 42, 'https://blob.test/nina/a.png')

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.anchored).toBe(false)

      const init = fn.mock.calls[1]?.[1] as RequestInit
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      expect(body.input_references).toBeUndefined()
      vi.unstubAllGlobals()
    }
  })

  it('R10: an unanchored call is unchanged — one fetch, no reference', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-unit-test-never-sent'
    const fn = stubTwoHostFetch(blobPng(), okImage())

    const result = await callNinaImageModel('a photograph', 42)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.anchored).toBe(false)
    /* The Blob is not even asked for: a job with no reference does no extra I/O. */
    expect(fn.mock.calls.length).toBe(1)
    expect(String(fn.mock.calls[0]?.[0])).toBe(OPENROUTER_IMAGE_URL)
  })
```

**File 8c:** `tests/nina.imageworker.test.ts` — restate the existing case at `:167-178` and add two.
Replace that case's title and body:

```ts
  it('sends exactly the recipe body, and no reference image when the job has none', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = stubFetch(
      new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }),
    )
    await generate('a photograph', 42)
    const init = fn.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.resolution).toBe('1K')
    expect(body.aspect_ratio).toBe('3:4')
    expect(body.input_references).toBeUndefined()
  })

  it('R10: the second host sends the same anchored payload as the first', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith(OPENROUTER_IMAGE_URL)) {
        return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 })
      }
      return new Response(Buffer.alloc(4, 1), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '4' },
      })
    })
    vi.stubGlobal('fetch', fn)

    const outcome = await generate('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(outcome.ok).toBe(true)
    const init = fn.mock.calls[1]?.[1]
    const body = JSON.parse(String(init?.body)) as {
      input_references?: Array<{ image_url: { url: string } }>
    }
    expect(body.input_references?.length).toBe(1)
    expect(body.input_references?.[0]?.image_url.url.startsWith('data:image/png;base64,')).toBe(
      true,
    )
  })

  it('R10: a broken reference degrades to unanchored here too, not to a failed job', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const fn = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith(OPENROUTER_IMAGE_URL)) {
        return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 })
      }
      return new Response('nope', { status: 403 })
    })
    vi.stubGlobal('fetch', fn)

    const outcome = await generate('a photograph', 42, 'https://blob.test/nina/a.png')

    expect(outcome.ok).toBe(true)
    const init = fn.mock.calls[1]?.[1]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.input_references).toBeUndefined()
  })
```

and add `OPENROUTER_IMAGE_URL` to that file's existing `../lib/nina/imagerecipe.ts` import.

**Impact:** the suite proves the byte-identity of the unanchored payload, the verified shape of the
anchored one, all four degrade paths, and every inequality in the re-derived chain — at both hosts.

## Verification

**Precondition:** the worktree has **no `node_modules`**. Before anything else:

```
cd /home/miftah/.worktrees/run-insights/nina-image-generation-tab && npm install
```

`.env.local` is NOT needed for this phase — no command below touches the database or the network
(`tests/support/setup.ts` stubs the env groups this code reads, and `tests/nina.imagecall.test.ts`
deliberately leaves the nina group unstubbed so the missing-key case stays reproduced).

**Build:**

```
npm run typecheck
npm run lint
```

`typecheck` is the one that matters most here: `tsconfig.json` includes `**/*.ts`, so it typechecks
`scripts/nina-image-worker.ts` as well as the app, and it is what proves the optional
`referenceUrl` did not break the four `NinaImageJobArgs` literals in the test suites.

**Tests:**

```
npm test -- tests/nina.imagerecipe.test.ts tests/nina.imagecall.test.ts tests/nina.imageworker.test.ts tests/nina.jobActions.test.ts
npm test
```

**Guards (both must stay green; neither should be affected):**

```
npm run ci:openrouter-guard
npm run ci:llm-payload-guard
```

**Manual check:**

1. `head -100 lib/nina/imagerecipe.ts` — the header must no longer contain the string
   `THE FACT THAT IS NO LONGER HERE`, and must contain `R10`, `148.9` and `_anchor.png`.
2. `grep -c "^import" lib/nina/imagerecipe.ts` must print `0`. **PLAN INVARIANT 2.**
3. `node --experimental-strip-types --no-warnings -e "import('./scripts/nina-image-worker.ts').then(m => console.log(typeof m.generate, typeof m.fetchReference))"`
   from the worktree root must print `function function` — the worker still loads under stripping,
   which is the only thing invariant 2 exists to protect. (It prints nothing else: `main()` is
   guarded by the `import.meta.url === process.argv[1]` check.)
4. `npm run nina:worker:dry` is available if `.env.local` is present, but it is not required: it
   exercises the preflight, not the reference.

**Exit criteria:**

- `buildImageRequestBody({ prompt, seed })` `JSON.stringify`s to the exact literal the unanchored
  probe got a 200 from, asserted against that literal.
- With a reference it adds exactly one `input_references` array holding one
  `{ type: 'image_url', image_url: { url: 'data:…' } }`.
- `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 220_000`, `NINA_IMAGE_RUN_BUDGET_MS = 240_000`, and every
  inequality in invariant 3 holds for **both** in-platform timeouts, asserted in
  `tests/nina.imagerecipe.test.ts`.
- All four ways of losing a reference (non-200, oversize, unvouched type, thrown fetch) produce a
  successful unanchored generation plus one `console.warn`, at both hosts.
- `npm test` is green, `npm run typecheck` and `npm run lint` are clean, and
  `grep -c "^import" lib/nina/imagerecipe.ts` is `0`.

## Assumptions

1. **Phase 1's plan file did not exist when this was written** (`.workflows/plan/nina-image-generation-tab/`
   was empty), so no contract was read from it — and none is needed. This phase requires nothing
   from phase 1 at compile time or at run time. The seam is `NinaImageJobArgs.referenceUrl`, and the
   only thing that must be true of phase 1's storage is that **something can resolve the operator's
   selection to the `blob_url` of a `nina_avatars` or `nina_message_images` row.** Both tables have
   a `blob_url` column today (`lib/db/schema.ts`), so whether phase 1 stores an id + source pair or
   the URL itself, phase 6 can produce what this phase consumes. If phase 1 stores an id + source,
   phase 6 does one read; if it stores the URL, phase 6 passes it through. Neither shape changes a
   line of this plan.
2. **Phase 1 has landed** and its migration applied, per `depends_on`. Nothing here reads its table,
   so this phase is in fact applyable before it — but the plan set's wave order is respected.
3. `Buffer` is available on both hosts. Measured, not assumed: `lib/nina/imagerun.ts:118-125` and
   `lib/nina/vision.ts:264` already use it on Vercel, and `scripts/nina-image-worker.ts:526` uses it
   on the runner. No route this code runs on is on the edge runtime.
4. Vercel Blob serves `content-type` and `content-length` on a public object. The content type is
   already relied on this way by `lib/nina/vision.ts:275`; the length is only an early-exit, and the
   real bound is re-checked against the bytes actually read.

## Handoffs

1. **`sidecarText` still says `reference:  none (RU-18)` — phase 2 owns that line.**
   `lib/nina/imagegen.ts:171` hardcodes it and `tests/nina.imagerecipe.test.ts:98` asserts it. For
   an anchored job that string is now false, and the sidecar is what lands in
   `nina_message_images.prompt` as the only human-readable record of how a photograph was made.
   Phase 2 restates that function for R1–R9 anyway; the suggested change is one optional input and
   one line:
   `reference:  ${input.referenceUrl ?? 'none'}`, with the assertion at `:98` updated. **This phase
   deliberately did not touch it** — editing phase 2's `describe` block and phase 2's file to fix a
   comment would be exactly the cross-phase collision the reconciler exists to prevent. Serves R10's
   explainability, not a new requirement.
2. **Phase 6 sets `referenceUrl`, and only phase 6.** The exact member is declared in the Interface
   Contract above. `lib/nina/imagetest.ts` must resolve the operator's saved selection to a Blob URL
   *server-side* and put it on the args it hands `openNinaImageJob`; `selfiegen.ts` and
   `avatargen.ts` may leave it absent for ever, and an absent field is an unanchored generation.
3. **Phase 6's verdict panel could report a degraded anchor, and this phase gave it the signal.**
   `NinaImageCallResult.anchored` is `false` when a reference was requested and could not be
   fetched, and `imagerun.ts` logs `{ anchored, sentAnchored }` on success. Nothing persists that
   distinction to `nina_turns`, so if the operator should be told "generated, but without your
   reference", phase 6 needs a column or an args field of its own. Left undone on purpose: R10 asks
   for the picture, R11 asks for the verdict, and inventing a third state here would be scope creep.
4. **Phase 5's picker should say what the reference actually does.** Measured three times in this
   repo (`docs/plans/F10-badge-art-skill.md:1087`, `F15:79-88`, `F25:322`):
   `input_references` on `qwen/qwen-image-3-pro` *"behaves like a strong img2img … it transfers the
   subject hard"*. So the chosen photograph's pose and composition come along with her face. One
   line of helper text on the grid would set the right expectation. **It must not become a prompt
   sentence** — `imagegen.ts`'s header records that the first draft's "the reference is
   authoritative for her face" line was deleted because instructing a model to defer to an image
   degrades a prompt for free, and `tests/nina.imagerecipe.test.ts:87-92` asserts the word
   `reference` never appears in a prompt. That assertion stays true after this phase: the reference
   is a payload key, never a sentence.
5. **The backstop worker's job ceiling was left alone.** Raising `NINA_WORKER_CALL_TIMEOUT_MS` above
   240 s for anchored jobs would require raising `.github/workflows/nina-image.yml`'s
   `timeout-minutes: 6` and re-deriving `NINA_IMAGE_RECLAIM_MS` (420 s, chosen to exceed both host
   ceilings). Not worth it for a third net; the residual is named in `generate`'s docblock.
6. **`lib/nina/.workflows/package_readme.md` mentions the payload and the thresholds.** Phase 7 owns
   the documentation sweep for this set; the anchored timeout and the reference belong in it.

## Rollback

`git revert` the phase's commit. Nothing else is needed and nothing is destructive:

- No schema object, no migration, no Blob pathname and no config key changes, so there is nothing
  outside the source tree to undo.
- A `nina_turns` row already carrying `args.referenceUrl` is read by a reverted
  `buildImageRequestBody` that has no parameter for it and by a reverted `attemptOnce` that never
  looks for it, so **an in-flight anchored job degrades to an unanchored generation rather than
  failing** — the same property the index's Rollback section records.
- Reverting restores `NINA_IMAGE_RUN_BUDGET_MS = 200_000`. A job in flight at the moment of the
  revert is unaffected: the budget is read once per `runNinaImageJob` call, from the module the
  invocation already loaded.
- If only the timeout needs backing out and the payload does not, `ninaImageCallTimeoutMs` is the
  single seam: making it return `NINA_IMAGE_CALL_TIMEOUT_MS` unconditionally reverts the timeout
  half in one line, and the two `describe`d inequalities in Step 8 are what will then fail — loudly,
  which is the point.
