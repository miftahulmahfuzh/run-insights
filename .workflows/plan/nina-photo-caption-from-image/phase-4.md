# Phase 4 — Generated selfies caption from the scene she asked for

**Plan set:** `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md`
**Satisfies:** R2
**Depends on:** 1, 2
**Package:** `lib/nina`
**Difficulty:** NORMAL
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image` (branch `feature/nina-photo-caption-from-image`)

---

## What this phase is

R2, on the other path that posts a photograph of hers. `finishSelfie` (`lib/nina/imagerun.ts:169`)
writes `body: ninaImageCaption(jobId)` — the same canned draw as the admin bug — while the image row
it writes in the same function gets `description: args.scene`, **the scene she asked for through the
`generate_image` tool**. The truth about the picture is already in hand, one field away from the
caption, and the caption ignores it.

**No vision call here, ever.** `finishSelfie`'s own docstring settles it: *"No `glm-4.6v` describe
pre-pass runs over a generated image: we wrote the picture, so paying a vision call to be told back
our own prompt would be absurd."* This phase is a text-only caption call over `args.scene`, which is
why `NinaCaptionSeenKind` has a `'requested'` member.

**Work on this branch, in this worktree.** Phases 1 and 2 are already on it — do not cut a branch off
`origin/main`, and quote `finishSelfie` **as phase 2 leaves it** (the insert already carrying
`photoOnly: true`).

## Files

| File | Change |
|---|---|
| `lib/nina/imagerun.ts` | edit — `finishSelfie`'s `body:` expression and two imports |
| `tests/nina.imagerun.test.ts` *(or the existing suite that covers `finishSelfie`)* | edit |

**Do not touch:** `lib/admin/*` (phase 3, concurrent), `scripts/nina-image-worker.ts` (it keeps the
canned line — Step 3), `lib/nina/caption.ts`, `lib/nina/imagefail.ts`, `lib/nina/queries.ts`,
`scripts/check-llm-payload-boundary.mjs` (phase 1 already sanctioned `lib/nina/imagerun.ts`).

---

## Step 1 — Imports

```ts
import { captionNinaPhoto } from './caption'
import { readNinaTuning } from './queries'        // add to the existing block if it is not there
```

`readNinaTuning` may already be imported — `imagerun.ts` sits beside `selfiegen.ts`, which reads the
tuning for the generation prompt. **Check before adding**, and if the job's tuning is already in
scope at `finishSelfie` (carried on the job, or read earlier in `runNinaImageJob`), use that instead
of a second read.

## Step 2 — `finishSelfie`: caption from the scene, fall back to the pool

The scene is already computed in this function as `args.scene`, and it is written to the image row a
few lines below. Insert the caption immediately before `insertNinaMessages` and use it as the body:

```ts
  const sessionId = quoted?.sessionId ?? (await resolveNinaWriteSession(userId))

  /*
   * ── THE CAPTION, FROM THE SCENE SHE ASKED FOR ────────────────────────────────────────────
   * `args.scene` is what the `generate_image` tool was told to draw and is about to become this
   * row's `description`. So the picture's content is already in hand, in English prose, with no
   * vision call — which is exactly why `NinaCaptionSeenKind` distinguishes `'requested'` from
   * `'described'`: the caption prompt is handed a REQUEST, not a witness's observation, and it is
   * told so.
   *
   * NO `glm-4.6v` PRE-PASS, and this is not an omission: *"we wrote the picture, so paying a vision
   * call to be told back our own prompt would be absurd"* (this function's own docstring). The one
   * thing a witness could add is whether the generator obeyed the prompt, and this path has no
   * budget for a second vision call inside a segment that has already spent 78 s generating.
   *
   * ── WHY THE FALLBACK IS THE OLD EXPRESSION, UNCHANGED ────────────────────────────────────
   * `ninaImageCaption(jobId)` is still deterministic in the job id, so a row read twice says the
   * same thing — and as of phase 1 it draws from `NINA_IMAGE_CAPTION_POOL`, which asserts nothing
   * about the picture. That is what makes a caption failure harmless here: `null` leaves a true
   * sentence rather than the wrong one. It is also, permanently, what
   * `scripts/nina-image-worker.ts` says on this same path, so the two hosts still agree whenever
   * the model call does not land.
   *
   * ── AND WHY THIS AWAIT IS ALLOWED WHERE PHASE 3'S IS NOT ─────────────────────────────────
   * `runNinaImageJob` is ALREADY inside `after()` (see `fireNinaImageGeneration`) and has already
   * spent ~78 s on the generation and a Blob write. Nobody is holding a response open: the runner
   * was told "dispatched" a minute and a half ago. A 4-8 s text call at the end of that is the
   * cheapest thing in the function, and it is sequential with the insert because the insert
   * consumes it.
   */
  const tuning = await readNinaTuning(userId)
  const caption =
    (await captionNinaPhoto({ seen: args.scene, seenKind: 'requested', tuning })) ??
    ninaImageCaption(jobId)

  const [message] = await insertNinaMessages(
    userId,
    [
      {
        role: 'nina',
        /* Never empty. `nina_messages.text` is notNull and would accept `''`, but an empty bubble
         * is not a message. Either half of the expression above is a non-empty string:
         * `sanitizeNinaCaption` refuses an empty answer, and `pickLine` throws on an empty pool. */
        body: caption,
        source: 'chat',
        turnId: jobId,
        replyToId: quoted?.id ?? null,
        /* Phase 2. The row is the photograph. */
        photoOnly: true,
      },
    ],
    sessionId,
  )
```

**`finishSelfie`'s throw contract does not change.** It still throws for exactly one thing —
`insertNinaMessages` returning `[]`, which *"cannot happen here… so it is a bug, not a degradation"*.
`captionNinaPhoto` never throws and `readNinaTuning` is a primary-key read on a user we just resolved
a session for; if that read can throw in this codebase, wrap **it alone** in a `try` that falls back
to `NINA_TUNING_DEFAULTS` rather than widening the function's failure surface. Check
`readNinaTuning`'s implementation and say which it was in the report.

Also update the function's docstring: the paragraph ending *"`prompt` gets the sidecar… `description`
gets the scene prose"* should gain a sentence saying the caption is now written from that same scene,
and that the canned line is the fallback rather than the caption.

## Step 3 — `scripts/nina-image-worker.ts` stays canned, and that is written down

The worker is the backstop that posts the photograph when the Vercel invocation could not. **It
cannot caption and it never will:**

- It runs on a GitHub runner with **no z.ai key**.
- It imports `lib/nina/imagefail.ts` **by relative path** under `node --experimental-strip-types`,
  and that file's header forbids it from ever importing anything, because the `@/` alias cannot be
  resolved there. `@/lib/nina/caption` reaches `@/lib/llm/client`, which reaches `@/lib/env`, which
  is `server-only`. One import and the worker stops booting — with a resolution error at 3am on a
  schedule.

Phase 2 already touched this file to set `photo_only`. **Do not touch it again in this phase**, but
confirm phase 2's comment at that INSERT says the caption is deliberately canned here. If it does
not, say so in the report and let the coordinator place it — a second phase editing the same INSERT
is the collision the DAG exists to avoid.

The practical consequence, stated so nobody reads it as a bug later: a selfie posted by the server
gets a caption about its scene; the rare one posted by the worker gets a scene-agnostic canned line.
Both are true sentences about the photograph. That is the whole of the asymmetry.

## Step 4 — Tests

Find the suite that covers `finishSelfie` first (`grep -rn "finishSelfie" tests/ lib/nina/*.test.ts`)
and extend it rather than adding a parallel file. If there is none, add
`tests/nina.imagerun.test.ts` with the mocks the function needs — `./queries`, `./caption`, and
whatever `runNinaImageJob` already stubs.

```ts
describe('finishSelfie captions from the scene', () => {
  it('writes the caption the model returned, not a canned line', async () => {
    expect(captionNinaPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ seen: ARGS.scene, seenKind: 'requested' }),
    )
    expect(insertNinaMessages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ body: 'nih, di pantai', photoOnly: true })],
      SESSION,
    )
  })

  it('makes no vision call, ever', () => {
    // "we wrote the picture, so paying a vision call to be told back our own prompt would be absurd"
    expect(describeNinaImages).not.toHaveBeenCalled()
  })

  it('falls back to the deterministic canned line when the caption is refused', async () => {
    // captionNinaPhoto -> null
    expect(insertNinaMessages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ body: ninaImageCaption(JOB_ID) })],
      SESSION,
    )
  })

  it('never lets a caption problem cost the photograph', async () => {
    // captionNinaPhoto -> null AND the pool line still lands, so the job completes.
    expect(insertNinaMessageImages).toHaveBeenCalled()
    expect(completeNinaImageJob).toHaveBeenCalled()
  })

  it('still throws only for a missing message row', async () => {
    // insertNinaMessages -> []
    await expect(finishSelfieUnderTest()).rejects.toThrow('no message row was written')
  })

  it('writes the scene to description unchanged', () => {
    // The caption is derived FROM it; it does not replace it. /admin's detail panel reads this.
    expect(insertNinaMessageImages).toHaveBeenCalledWith(
      USER,
      [expect.objectContaining({ description: ARGS.scene })],
    )
  })
})
```

## Verification

```bash
cd /home/miftah/.worktrees/run-insights/nina-photo-caption-from-image
npm run lint
npm run typecheck
npm run test -- tests/nina.imagerun.test.ts      # or whichever suite covers finishSelfie
node scripts/check-llm-payload-boundary.mjs
npm run test
```

## Exit criteria

1. A completed selfie job's bubble carries a line derived from `args.scene`, not a canned draw.
2. `captionNinaPhoto` is called with `seenKind: 'requested'` and the scene verbatim.
3. **No vision call is made on this path**, asserted.
4. A `null` caption falls back to `ninaImageCaption(jobId)` — deterministic, and scene-agnostic as of
   phase 1 — so the job still completes, the image row is still written, and the photograph still
   lands.
5. `finishSelfie` still throws for exactly one condition: `insertNinaMessages` returning `[]`.
6. `nina_message_images.description` is still `args.scene`, unchanged.
7. `scripts/nina-image-worker.ts` and everything under `lib/admin/` are untouched by this phase.
8. The payload-boundary guard passes with the call coming from `lib/nina/imagerun.ts`.

## Report to the coordinator

State the phase number. Say which suite covers `finishSelfie` and whether you extended it or created
one; whether `readNinaTuning` needed a `try` around it (and why); and whether phase 2's worker
comment about the canned caption was present or needs writing.
