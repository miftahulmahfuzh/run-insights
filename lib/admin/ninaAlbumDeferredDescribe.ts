import { after } from 'next/server'

import { describeSubjectForSide } from '@/lib/nina/album'
import { getNinaAvatar, setNinaAvatarDescription } from '@/lib/nina/queries'
import { describeNinaImages } from '@/lib/nina/vision'

/**
 * The deferred describe pre-pass: `scheduleDescribe`, the `after()` scheduler the action modules
 * call when a row becomes her face or lands in the album without a description. A `'use server'`
 * module may export only async functions (`lib/nina/album.ts:144-148`), and this is a synchronous
 * scheduler — the constraint that once kept it unexported beside the actions is what gives it a
 * plain module of its own now. Its only importers are the action modules behind the
 * `lib/admin/ninaAlbumActions.ts` barrel.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE DESCRIBE PRE-PASS IS OFF THE UPLOAD PATH. THIS IS THE ARGUMENT.
 *
 *  What it used to be: `registerNinaAvatarAction` awaited `describeNinaImages` on EVERY upload.
 *  That was correct, and its own comment said why — an uploaded image has no generation prompt,
 *  so `glm-4.6v` is the only way `nina_avatars.description` ever gets filled for it, and R25's
 *  "asked where she is in her new profile photo, Nina invents a story true to the photo" has
 *  nothing to work from otherwise.
 *
 *  What changed is the scale, and the user stated it as a requirement rather than an aside:
 *  *"i will put hundreds of profile pics in there."*
 *
 *  The measurement, from `lib/nina/vision.ts`'s own constants: a describe call is ~8-11 s typical
 *  (`NINA_DESCRIBE_TIMEOUT_MS = 25_000`, derived there from ~26-33 ms per completion token over
 *  ~220 output tokens plus 2-3 s of fixed overhead). Awaited once per upload, three hundred
 *  uploads is 40 minutes to 1.4 hours of wall clock the operator sits through, three hundred
 *  serverless invocations held open, and three hundred vendor bills — for descriptions of
 *  photographs Nina may never be shown. And Server Actions dispatch one at a time per client, so
 *  those latencies do not overlap. They add.
 *
 *  Where the description comes from instead. `description` has exactly one reader (invariant 5:
 *  it reaches Nina as text and is never rendered to the runner), and that reader is her prompt.
 *  So it is needed at two moments, and it is now produced at exactly those two:
 *    · IT BECOMES HER FACE — `setCurrentNinaAvatarAction`, plus the two paths in
 *      `lib/admin/ninaAlbumUploadActions.ts` that make a row current without going through it
 *      (`registerNinaAvatarsAction` with `makeCurrent`, and this batch's empty-album promotion).
 *    · IT IS HANDED TO HER — the share-to-Nina path, via `ensureNinaAvatarDescriptionAction`,
 *      which phase 7 calls before opening the chat tab.
 *  Plus on demand, forever: `describeNinaAvatarAction` is the button that was always there.
 *
 *  Both automatic triggers are NON-FATAL, exactly as the register path's pre-pass was: the row
 *  exists, the album renders, and a failure leaves a visible "Describe it" button rather than a
 *  lost upload or a refused promotion. That property is inherited, not re-litigated.
 *
 *  What is knowingly given up: a photo uploaded and never promoted or shared has
 *  `description = null` indefinitely. `resolveAttachment` (`lib/nina/actions.ts:141`) copies null
 *  happily, so a send still works — she simply has no words about it, which is exactly why phase
 *  7 fires the ensure before opening the tab.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Fill in a missing description AFTER the response has gone out.
 *
 * ── WHY THIS IS NOT BESIDE ITS CALLERS ──────────────────────────────────────────────────────
 * Every caller is a `'use server'` module, and a `'use server'` module may export only async
 * functions (`lib/nina/album.ts:144-148`) — a synchronous scheduler can live in one but cannot be
 * exported from it, and sharing it means exporting it. So it lives here, in a plain module the
 * action modules import.
 *
 * ── WHY `after()` AND NOT `await` ───────────────────────────────────────────────────────────
 * The repo's own idiom for a second model call the caller must not wait on
 * (`lib/nina/actions.ts:782` schedules distillation the same way, for the same reason). It also
 * keeps invariant 4 trivially true: this is a Server Action, never a render, and the model call is
 * not even on the action's clock.
 *
 * ── WHY IT RE-READS THE ROW INSIDE THE CALLBACK ─────────────────────────────────────────────
 * So the caller pays nothing. `setCurrentNinaAvatarAction` would otherwise need an extra
 * `getNinaAvatar` on its hot path just to discover whether a describe is needed; here the read
 * happens after the operator already has their answer, and the skip is authoritative at the moment
 * the work would actually run.
 *
 * ── NO `revalidatePath` IN HERE, DELIBERATELY ───────────────────────────────────────────────
 * `after()` runs once the response is finished, so there is no re-render left to attach to — an
 * action's revalidation is what makes the framework include a fresh RSC payload in the SAME
 * response (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "A single response
 * carries data and UI"). `/admin/nina` is `force-dynamic` and its reads are not cached, so the
 * operator's next navigation shows the description with nothing to invalidate.
 * `ensureNinaAvatarDescriptionAction` is the in-band variant for a caller that needs the prose in
 * its own return value.
 */
export function scheduleDescribe(userId: string, id: string): void {
  after(async () => {
    try {
      const row = await getNinaAvatar(userId, id)
      if (row == null) return
      if (row.description != null) return // already described; not a vendor call
      /* An album row is a photograph of HER — the self witness, exactly as the describe button.
       * See `describeNinaAvatarAction`'s docstring for the wrong-prompt history. */
      const { description } = await describeNinaImages(
        [{ blobUrl: row.blobUrl, pathname: row.pathname }],
        { subject: describeSubjectForSide('hers') },
      )
      await setNinaAvatarDescription(userId, row.id, description)
    } catch (cause) {
      // Non-fatal, exactly as the old register-path pre-pass was. The "Describe it" button on the
      // card is the recovery, and it always was the recovery.
      console.error('[f34] deferred describe failed', id, cause)
    }
  })
}
