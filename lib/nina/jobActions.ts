'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { isValidId } from '@/lib/id'

import { reopenNinaImageJob, softDeleteNinaImageJob } from './imagejobs'
import { fireNinaImageGeneration } from './imagerun'
import { NINA_JOBS_HREF, type NinaJobRefusal } from './jobview'

/**
 * **The `/nina/jobs` row's mutations. Phase 1 puts `redoNinaImageJob` here; phase 2 appends
 * `deleteNinaImageJob` beside it.**
 *
 * ── WHY A NEW FILE AND NOT `lib/nina/actions.ts` ──────────────────────────────────────────────
 * The isolation argument `lib/nina/sessionActions.ts` and `lib/nina/albumActions.ts` each make in
 * their own headers, and it holds here for the same reason: `actions.ts` is the chat's mutation
 * surface, it is long, and every future chat phase opens it. These functions are read by one
 * screen — the tracking list — and by nothing else. Keeping them apart means `/nina/jobs` imports
 * a file no other feature is holding open, and it means a `git log` of this file is a `git log` of
 * this feature.
 *
 * ── IT SCHEDULES; IT DOES NOT CALL A MODEL (plan invariant 4) ─────────────────────────────────
 * `fireNinaImageGeneration` registers `runNinaImageJob` inside Next's `after()` and returns
 * `void`. The model call happens there, in `lib/nina/imagerun.ts`, which
 * `scripts/check-llm-payload-boundary.mjs` already lists. **This module makes no model call and
 * must never acquire one**, so that guard's file list does not change in this phase — which is
 * the structural half of "no new module reaches the provider".
 *
 * ── AND WHY `/nina/jobs` SUDDENLY NEEDS `maxDuration = 300` ───────────────────────────────────
 * A Server Action's timeout is the **page segment's**, not the action file's — Next 16.3.1's
 * `maxDuration` reference: *"If using Server Actions, set the `maxDuration` at the page level to
 * change the default timeout of all Server Actions used on the page."* And `after()` inherits it:
 * *"`after` will run for the platform's default or configured max duration of your route."*
 * `lib/nina/imagerun.ts`'s header names the consequence in advance — *"A third caller would need
 * the same line"* — and this file is that third caller. `app/nina/jobs/page.tsx` carries it.
 *
 * ── NO CONFIRMATION, AND THAT IS AN R-LEVEL DECISION ──────────────────────────────────────────
 * The user's words are *"we dont need confirmation message to execute them"*. When this was
 * written it deliberately OVERRODE `components/nina/SessionRow.tsx`'s three-tap confirm, and the
 * override was principled rather than lazy: that control hard-deletes a conversation with no undo
 * (its photographs survive it since R1), whereas a redo costs one generation of a six-a-day cap
 * and produces a photograph the runner asked for. There is nothing here to protect him from.
 *
 * Task #136 has since taken the confirm out of `SessionRow` too, on this same instruction, so it
 * now holds across the whole set. The difference in stakes did not go with it — see
 * `deleteNinaImageJob` below, which is where that reasoning lives.
 *
 * ── THE RESULT CARRIES A CODE, NEVER A SENTENCE ───────────────────────────────────────────────
 * `NinaSessionActionResult` is `{ ok, next }` with no prose, and `SessionRow` supplies the words.
 * Same arrangement, one field wider: `reason` is a `NinaJobRefusal` discriminant so the button can
 * say "jatah foto hari ini sudah habis" instead of "tidak bisa". The words live in
 * `components/nina/NinaJobActions.tsx`; the vocabulary lives in `lib/nina/jobview.ts`, which is the
 * only module a `server-only` reader, a `'use server'` action and a `'use client'` button can all
 * import. See its docstring.
 *
 * ── OWNERSHIP IS PROVED IN SQL, ONCE (plan invariant 3) ───────────────────────────────────────
 * `requireUserId()` is line one of every action here — above the shape check, so a signed-out
 * caller is bounced to sign-in rather than told their id was malformed, which is
 * `app/actions/share.ts`'s asserted rule. The id itself is proved by `reopenNinaImageJob`'s
 * `WHERE`; there is no separate ownership pre-check beside it to go stale.
 */

export interface NinaJobActionResult {
  ok: boolean
  /**
   * Why not, as a discriminant. `null` on success.
   *
   * Not an error STRING: the server has no business writing Indonesian, and
   * `components/nina/NinaJobActions.tsx` owns the `Record<NinaJobRefusal, string>` that renders it.
   */
  reason: NinaJobRefusal | null
}

/**
 * **R1. One tap: reopen the failed job from its own args and start generating.**
 *
 * The three things it does, in an order that matters:
 *
 *   1. `reopenNinaImageJob` — the owner-scoped read, the four refusals, the cap, and the INSERT.
 *      Nothing has been scheduled yet, so every refusal is free.
 *   2. `fireNinaImageGeneration` — `after()`, returning `void` immediately. **The runner is not
 *      waiting for a photograph**; he is waiting for the list to refresh, and that is milliseconds.
 *      A generation is ~78 s and lands in the chat when it lands, exactly as
 *      `generateNinaSelfie`'s does.
 *   3. `revalidatePath(NINA_JOBS_HREF)` — the new `Antre` row appears above the `Gagal` one.
 *
 * The `queuedBefore` / `runningBefore` cutoffs are deliberately NOT passed. Those are
 * `reviveNinaImageJobs`'s, and their whole purpose is to stop a recovery pass stealing a job
 * another host may still be starting. This job was opened microseconds ago by this invocation,
 * which is `generateNinaSelfie`'s situation exactly — `claimNinaImageJob` with neither cutoff
 * claims a `queued` row at any age, and there is no other host.
 *
 * ── NO `router.refresh()` IS ASKED OF THE CALLER ──────────────────────────────────────────────
 * `SessionRow` calls one after its actions; this control does not need it. The redo button is
 * OPT-IN per surface (`NinaJobList`'s `actions` prop) and only `app/nina/jobs/page.tsx` sets it, so
 * the path this revalidates is provably the path the runner is standing on, and Next's own note is
 * that revalidation in a Server Function *"updates the UI immediately (if viewing the affected
 * path)"*. A second refresh would be a second round trip to re-fetch what the action's own response
 * already carried.
 *
 * ── IT DOES NOT NAVIGATE ──────────────────────────────────────────────────────────────────────
 * Hence no `next` field, unlike `NinaSessionActionResult`. Nothing the runner was reading has gone
 * away — he stays on the list and watches the new row tick.
 */
export async function redoNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()

  /* A segment that cannot be one of our ids is refused without a query, on `/r/[id]`'s precedent —
   * and it is refused as `not-found`, the same answer another runner's real id gets, so nothing
   * here tells a caller which ids exist. */
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found' }

  const reopened = await reopenNinaImageJob(userId, input.jobId)
  if (!reopened.ok) return { ok: false, reason: reopened.reason }

  fireNinaImageGeneration({
    userId,
    jobId: reopened.jobId,
    purpose: reopened.purpose,
    replyToId: reopened.replyToId,
  })

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null }
}

/**
 * **R2, and the whole of it: one tap, no dialog, and the row leaves the list.**
 *
 * ── WHY THERE IS NO CONFIRMATION, AND WHY `SessionRow`'s PREMISE NEVER TRANSFERRED ────────────
 * The runner asked for this by name — *"we dont need confirmation message to execute them"* — but
 * it survives on its merits, which matters because `components/nina/SessionRow.tsx` once built a
 * three-tap confirmation panel for its delete and argued for it at length. Read that argument and
 * it turned entirely on ONE premise: *"There is no archive flag and therefore no undo, so the
 * confirmation is the only thing between a mis-tap and a lost conversation."* R11 hard-deletes a
 * conversation and its messages. (Its photographs' rows used to go too; R1 made
 * `nina_message_images.message_id` `ON DELETE SET NULL`, so they now outlive it. The conversation
 * itself is still gone for good, which is the half the premise turns on.)
 *
 * Task #136 removed that panel, and it is worth being precise about what that did and did not
 * settle: it did NOT refute the premise — R11 is still irreversible — it decided the panel was not
 * worth its cost on the runner's own chats. The premise is still the reason the two controls COULD
 * have differed, and still the reason this one never needed a dialog to begin with.
 *
 * That premise is absent here, deliberately. This writes a nullable column. A mis-tap costs the
 * runner one row on one screen; `update nina_turns set deleted_at = null where id = '…'` puts it
 * back exactly, the ledger never moved, the photograph is still in the chat and still in Blob, and
 * an in-flight generation still finishes and still delivers. A confirmation panel guarding a
 * reversible flag is friction people learn to tap through — which `SessionRow` also says, about
 * the typed-phrase alternative it rejected.
 *
 * ── WHAT THE CALLER GETS, AND WHAT IT DOES NOT ───────────────────────────────────────────────
 * `ok: false` is the whole refusal — `NinaJobActionResult` carries no error prose, on
 * `NinaSessionActionResult`'s rule that the component supplies the sentence in his language. A
 * malformed id, a job that is not his, a job that never existed and a job already hidden are one
 * answer, because distinguishing them would be an ownership oracle.
 *
 * `revalidatePath` runs only when a row was actually flagged. Nothing written, nothing to
 * invalidate — `removeNinaChatSession`'s rule. And only `NINA_JOBS_HREF`: that is the surface the
 * tap happened on. `/nina/about` renders the same jobs and will show one fewer, but it is
 * dynamically rendered behind `requireUserId()` and re-reads on its next request anyway; naming it
 * here would be this phase reaching into a screen it promised not to touch.
 *
 * No `redirect()` and no `next` URL: he is already standing on the list he is tidying, and the
 * revalidate re-renders it under him. Navigating would be a bug.
 */
export async function deleteNinaImageJob(input: { jobId: string }): Promise<NinaJobActionResult> {
  const userId = await requireUserId()
  /* Line one is the auth call, ABOVE the shape check — `app/actions/share.ts`'s asserted property,
   * so a signed-out caller is bounced to sign-in rather than told their id was malformed. */
  if (!isValidId(input?.jobId)) return { ok: false, reason: 'not-found' }

  const deleted = await softDeleteNinaImageJob(userId, input.jobId)
  if (!deleted) return { ok: false, reason: 'not-found' }

  revalidatePath(NINA_JOBS_HREF)
  return { ok: true, reason: null }
}
