# Phase 3 — The admin add path captions from the photograph

**Plan set:** `NINA_PHOTO_CAPTION_FROM_IMAGE_PLAN.md`
**Satisfies:** R1
**Depends on:** 1, 2
**Package:** `lib/admin`
**Difficulty:** NORMAL
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-photo-caption-from-image` (branch `feature/nina-photo-caption-from-image`)

---

## What this phase is

R1, wired. The `after()` on the add path currently describes the photograph and stops. It grows a
second half: turn the description into a line in her voice, and put it on the bubble.

**Work on this branch, in this worktree.** Phases 1 and 2 are already on it — do not cut a branch
off `origin/main`, and quote `lib/admin/chatPhotoActions.ts` **as phase 2 leaves it** (the
`insertNinaMessages` call already carrying `photoOnly: true`).

## Files

| File | Change |
|---|---|
| `lib/admin/chatPhotoActions.ts` | edit — `scheduleChatPhotoDescribe` becomes `scheduleChatPhotoCaption` |
| `tests/admin.chatPhotos.test.ts` | edit — append the caption cases below phase 2's |

**Do not touch:** `replaceChatPhotoAction`'s caption (out of scope — Step 3), `lib/nina/imagerun.ts`
(phase 4, concurrent), `lib/nina/caption.ts`, `lib/nina/vision.ts`, `lib/nina/queries.ts`,
`lib/admin/chatPhotos.ts`, `lib/db/schema.ts`, `scripts/check-llm-payload-boundary.mjs` (phase 1
already sanctioned this file).

---

## Step 1 — Imports

`lib/admin/chatPhotoActions.ts` gains three, and loses none:

```ts
import { captionNinaPhoto } from '@/lib/nina/caption'
import { readNinaTuning, updateNinaMessage } from '@/lib/nina/queries'   // add to the existing block
import { NinaVisionTokenFloorError, describeNinaImages } from '@/lib/nina/vision'
```

`readNinaTuning` and `updateNinaMessage` go into the **existing** `@/lib/nina/queries` import list
(alphabetical, as that block already is). `describeNinaImages` is already imported; add
`NinaVisionTokenFloorError` beside it — the floor tripping is the one failure that must be logged
loudly and separately, exactly as `lib/nina/actions.ts:1268-1276` does it.

## Step 2 — Replace `scheduleChatPhotoDescribe` with `scheduleChatPhotoCaption`

The whole function, and the whole docstring. Keep the two things that already work — the re-read
inside the callback and the `description != null` early return — for the reasons the existing
docstring gives, both of which are still true and are re-stated below.

```ts
/**
 * Look at the photograph, then say something true about it — AFTER the response has gone out. Not
 * exported: a `'use server'` module may export only async functions, and this is a synchronous
 * scheduler.
 *
 * ── WHAT THIS FIXES, AND WHERE THE BUG ACTUALLY WAS ─────────────────────────────────────────
 * MEASURED 2026-09-07, from the user's screenshot: an underwater photograph of her in a swimsuit
 * and fins, captioned `ini gw abis lari tadi`. That sentence was never about that photograph. It is
 * element index 2 of a five-string array and `pickLine` hashed a fresh nanoid onto it — no model,
 * no image, no prompt. Meanwhile THIS function was already sending the picture to `glm-4.6v` and
 * storing a perfectly good paragraph about it in a column that, on this path, nothing reads
 * (`dbNinaSourceGateway.readConversation` maps every window row with a literal
 * `imageDescriptions: []`). The multimodal call existed; its answer just never reached the one text
 * the runner sees.
 *
 * So this function now does both halves: `glm-4.6v` looks, `glm-5.3` speaks, and the bubble is
 * rewritten. `nina_message_images.description` is still written first and on its own, so the
 * paragraph survives even when the caption call does not.
 *
 * ── TWO MODEL CALLS, ONE `after()`, AND WHY THAT FITS ───────────────────────────────────────
 * Describe is ~8-11 s (`NINA_DESCRIBE_TIMEOUT_MS` 25 s) and the caption is ~4-8 s
 * (`NINA_CAPTION_TIMEOUT_MS` 12 s), so the worst case is 37 s of a 60 s segment with the response
 * already sent. They are strictly sequential because the second consumes the first — there is
 * nothing to parallelise.
 *
 * ── WHY `after()` AND NOT `await`, RESTATED BECAUSE IT NOW MATTERS TWICE AS MUCH ────────────
 * `lib/admin/ninaAlbumActions.ts:300-320`'s `scheduleDescribe`, same shape and same measurement.
 * Next dispatches Server Actions **one at a time per client** (the Server Actions guide, quoted at
 * `lib/nina/actions.ts:1201-1206`), so an awaited pair would put ~15-25 s on every add, in series:
 * five photographs would be two minutes of a spinner. Non-fatal by design — the row exists, the
 * grid renders, and the caption already on the bubble is one of `NINA_IMAGE_CAPTION_POOL`'s
 * scene-agnostic lines.
 *
 * ── THE PLACEHOLDER IS PART OF THE FIX, NOT A COMPROMISE ────────────────────────────────────
 * For the ~20 s before the caption lands, the bubble says whatever `addChatPhotoAction` wrote. As of
 * phase 1 that can only be a line that asserts nothing about the picture — `nih`, `nih, puas?`,
 * `foto gw. jangan di-zoom`, `udah nih, jangan minta lagi`. The reported sentence is unreachable
 * from that pool. **That is what makes every failure path below safe**: a caption that never
 * arrives leaves a true sentence, not a wrong one.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing, and so the skip is authoritative at the moment the work would run — a
 * row removed between the click and the callback is a miss, not a vendor call. The re-read also
 * hands us `messageId`, which is what the caption is written to.
 *
 * ── AND WHY THE `description != null` SKIP STAYS ────────────────────────────────────────────
 * `after()` can run more than once. The skip means a second pass does not pay for a second vision
 * call — and it deliberately does NOT skip the caption: the stored description is exactly the input
 * the caption needs, so a re-run captions for the price of one text call. That is the cheap retry
 * and it is free.
 *
 * No `revalidatePath` in here: `after()` runs once the response is finished, so there is no
 * re-render left to attach to. The runner's screen picks the new text up on its next load or
 * service-worker refresh, the same way the bubble itself arrived.
 */
function scheduleChatPhotoCaption(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaMessageImage(userId, id)
      /* Gone between the click and the callback. A miss, not a failure. */
      if (row == null) return

      /* ── HALF ONE: LOOK AT IT ──────────────────────────────────────────────────────────────
       * `subject: 'self'` is not optional here and it is not cosmetic. The default prompt is
       * written about the RUNNER — *"The state of him. Drenched or dry"*, and rule 6 is *"'Him' for
       * whoever is clearly the runner"*. Pointed at a photograph of Nina it looks for a man who is
       * not in the frame. See `NINA_SELF_DESCRIBE_SYSTEM_PROMPT`. */
      let description = row.description
      if (description == null) {
        try {
          const result = await describeNinaImages([{ blobUrl: row.blobUrl, pathname: row.pathname }], {
            subject: 'self',
          })
          description = result.description
          await setNinaMessageImageDescription(userId, id, description)
        } catch (cause) {
          /* The floor tripping is its own class and is logged LOUDLY: it means the vendor answered
           * 200 with an image it silently dropped, and the text of such a response is exactly where
           * an invented description would be. `lib/nina/actions.ts:1268-1276` does this and says
           * why. Either way the caption is skipped and the pool line stands. */
          if (cause instanceof NinaVisionTokenFloorError) {
            console.error('[f36] TOKEN FLOOR TRIPPED on a chat photo', {
              pathname: row.pathname,
              message: cause.message,
            })
          } else {
            console.warn('[f36] chat photo describe failed; the row keeps a null description', {
              id,
              error: String(cause),
            })
          }
          return
        }
      }

      /* ── HALF TWO: SAY SOMETHING TRUE ABOUT IT ─────────────────────────────────────────────
       * The tuning is read LIVE, no cache — `lib/nina/selfiegen.ts`'s rule: *"A wardrobe saved on
       * /admin/nina thirty seconds ago is in this prompt."* One indexed primary-key read on a path
       * that has just made two network calls.
       *
       * `captionNinaPhoto` never throws and returns `null` for every refusal — a digit, alt-text
       * narration, an over-long line, the sanctioned empty answer, a timeout. `null` means the
       * placeholder was the better sentence, so nothing is written. */
      const tuning = await readNinaTuning(userId)
      const caption = await captionNinaPhoto({ seen: description, seenKind: 'described', tuning })
      if (caption == null) {
        console.info('[f36] no caption for this photo; the canned line stands', { id })
        return
      }

      /* `updateNinaMessage` writes `text` and NOTHING else — not `seq`, not `sent_at`, not
       * `read_at`, not `turn_id`. Its docstring argues each one, and every argument is exactly what
       * a late caption needs: *"Rewriting a bubble is not re-sending it."* A returned `null` means
       * the message is not his or is gone, which is the same miss as above. */
      const updated = await updateNinaMessage(userId, row.messageId, caption)
      if (updated == null) {
        console.info('[f36] the bubble went away before its caption arrived', { id })
        return
      }
      console.log('[f36] captioned a chat photo', { id, chars: caption.length })
    } catch (cause) {
      /* The outer net. Nothing in here may reject: `after()` turns a rejection into a log line, and
       * a photograph wearing a scene-agnostic canned caption is a cosmetic state with a true
       * sentence on it. */
      console.warn('[f36] chat photo caption pass failed', { id, error: String(cause) })
    }
  })
}
```

## Step 3 — The two call sites

`addChatPhotoAction` (`:236`) — rename the call:

```ts
  scheduleChatPhotoCaption(userId, image.id)
```

`replaceChatPhotoAction` (`:~136`) — **also rename it**, because there is one scheduler and it is
now the captioner, but add a note that the caption behaviour there is deliberately not designed for:

```ts
  /*
   * Replace re-captions too, and that falls out of the shared scheduler rather than being designed:
   * the statement nulls `description` in the same breath as it repoints the row (see
   * `updateNinaChatPhotoBlob`), so the pass below earns a fresh description for the NEW bytes and
   * then writes a caption from it — which is the right answer, since a caption about the old
   * picture is exactly the stale-prose failure that null exists to prevent.
   *
   * What is NOT designed for: the bubble keeps whatever text it had until the new caption lands,
   * and if the caption call fails it keeps a caption about a photograph that is gone. That is
   * strictly better than today (where it keeps it forever) and strictly worse than nulling the text
   * too — which cannot be done, because `nina_messages.text` is NOT NULL and an empty bubble is not
   * a message. Deciding what a replaced photograph's bubble should say in the gap is its own card.
   */
  scheduleChatPhotoCaption(userId, id)
```

Read the actual `replaceChatPhotoAction` body before editing and confirm it schedules the describe
at all — if it does not, leave it alone entirely and drop this half of the step, noting which it was
in the report.

## Step 4 — `tests/admin.chatPhotos.test.ts`

Append below phase 2's block; do not rewrite anything already there. The action itself is a
`'use server'` module reaching the database, so the unit test's job is the **decision tree**, not the
insert — mock the four edges and assert the calls, `tests/nina.jobActions.test.ts`'s shape.

```ts
describe('scheduleChatPhotoCaption (through addChatPhotoAction)', () => {
  it('describes with subject: self, then writes the caption to the message', async () => {
    // The subject is the half a runner-subject prompt gets wrong, so it is asserted explicitly.
    expect(describeNinaImages).toHaveBeenCalledWith(
      [{ blobUrl: expect.any(String), pathname: expect.any(String) }],
      { subject: 'self' },
    )
    expect(setNinaMessageImageDescription).toHaveBeenCalled()
    expect(updateNinaMessage).toHaveBeenCalledWith(USER, MESSAGE_ID, 'eh gw nyelam tadi')
  })

  it('leaves the canned line and writes nothing when the caption is refused', async () => {
    // captionNinaPhoto -> null. The placeholder is one of NINA_IMAGE_CAPTION_POOL's scene-agnostic
    // lines, so keeping it is a true sentence rather than a wrong one.
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('does not caption when the eyes failed, and still stores no description', async () => {
    // describeNinaImages throws NinaVisionTokenFloorError.
    expect(setNinaMessageImageDescription).not.toHaveBeenCalled()
    expect(captionNinaPhoto).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('skips the vision call but still captions when a description is already stored', async () => {
    // getNinaMessageImage returns a row with description set — the free retry.
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(captionNinaPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ seen: STORED_DESCRIPTION, seenKind: 'described' }),
    )
    expect(updateNinaMessage).toHaveBeenCalled()
  })

  it('is a miss, not a failure, when the row is gone', async () => {
    // getNinaMessageImage returns null.
    expect(describeNinaImages).not.toHaveBeenCalled()
    expect(updateNinaMessage).not.toHaveBeenCalled()
  })

  it('never rejects, whatever the pass does', async () => {
    // updateNinaMessage throws. The action still resolved { ok: true } and after() saw no rejection.
    await expect(runTheAfterCallback()).resolves.toBeUndefined()
  })
})
```

**Read the file's existing mock setup first and reuse it.** It already mocks
`@/lib/nina/queries` — check whether that factory is pinned to an exact list of names (phase 1's
notes record that `tests/nina.jobActions.test.ts` has such a factory that must stay at exactly seven
names). If it is, extend it deliberately and say so in the report. `after` from `next/server` needs
to be mocked to capture and invoke the callback synchronously; if the file has no such helper yet,
add the smallest one that works and name it `runTheAfterCallback`.

## Verification

```bash
cd /home/miftah/.worktrees/run-insights/nina-photo-caption-from-image
npm run lint
npm run typecheck
npm run test -- tests/admin.chatPhotos.test.ts
node scripts/check-llm-payload-boundary.mjs      # captionNinaPhoto is called from a sanctioned file
npm run test
```

**Read the diff before committing** and confirm the action's response path grew no `await` on a
model call. The concrete check: `addChatPhotoAction` still ends in
`revalidatePath(...)` / `return { ok: true, id }` with nothing between it and the insert except the
scheduler call.

## Exit criteria

1. An add writes the scene-agnostic placeholder synchronously, and inside `after()` replaces it with
   a caption derived from that photograph's own description.
2. `describeNinaImages` is called with `{ subject: 'self' }` on this path. Nothing else on this path
   changed subject.
3. Every failure — the row gone, describe throwing, the floor tripping, `captionNinaPhoto` returning
   `null`, `updateNinaMessage` returning `null` or throwing — leaves the placeholder in place, logs
   once, and never rejects. The action still returns `{ ok: true, id }`.
4. The floor tripping is logged with `console.error` and distinguishably from a transport failure.
5. `nina_message_images.description` is still written, and still written **before** the caption is
   attempted, so a caption failure does not cost the paragraph.
6. A second `after()` pass over an already-described row makes no vision call and still captions.
7. No `await` on a model call was added to the action's response path; the payload-boundary guard
   passes.
8. `lib/nina/imagerun.ts` and `scripts/nina-image-worker.ts` are untouched by this phase.

## Report to the coordinator

State the phase number. Say which of the two schedulers `replaceChatPhotoAction` actually had, what
you did about it, and whether the `@/lib/nina/queries` mock factory in
`tests/admin.chatPhotos.test.ts` had to be extended.
