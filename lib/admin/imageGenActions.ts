'use server'

import { revalidatePath } from 'next/cache'

import { ADMIN_CHAT_PHOTOS_PATH } from '@/lib/admin/chatPhotos'
import { imageTestVerdict, type NinaImageTestJobView } from '@/lib/admin/imageGenTestView'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  ninaImagePrefsResetSchema,
  ninaImagePrefsWriteSchema,
  type NinaImagePrefsWriteInput,
} from '@/lib/admin/schema'
import { isValidId } from '@/lib/id'
import { getNinaImageJobDetail, ninaImageQuotaLeft } from '@/lib/nina/imagejobs'
import { NINA_IMAGE_PREFS_DEFAULTS, type NinaImagePrefsWrite } from '@/lib/nina/imageprefs'
import { NINA_IMAGE_DAILY_CAP } from '@/lib/nina/imagerecipe'
import { assembleNinaImageTestPrompt, dispatchNinaImageTest } from '@/lib/nina/imagetest'
import {
  readNinaImagePrefs,
  readNinaTuning,
  resolveNinaPhotoReference,
  writeNinaImagePrefs,
} from '@/lib/nina/queries'

/**
 * `/admin/image-generation`'s panel, write side — R4 through R9, and R10's selection.
 *
 * Both actions follow `lib/admin/tuningActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`),
 *                                 so this call is the only gate on this endpoint. Plan invariant 6.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaImagePrefs`, which owns the
 *                                 clamp and the revision bump.
 *   4. `revalidatePath`         — re-renders THIS page, so the panel and the prompt preview show
 *                                 the row that was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES THE CAMERA ─────────────────────────────────
 * `tuningActions.ts` records this about the tuning and it holds verbatim for the prefs: there is no
 * cache anywhere on the image path, so a committed row is in the next generation's prompt with no
 * invalidation step at all. The revalidation is for the PREVIEW, which is server-assembled from the
 * saved row and would otherwise show the pre-save prompt beside a "saved as revision 5" line.
 *
 * ── ONE SAVE, NOT ELEVEN ────────────────────────────────────────────────────────────────────
 * Plan invariant 7, and `ninaImagePrefsWriteSchema`'s docstring has the mechanism. There are
 * exactly two exported functions in this file today and `tests/admin.imagegen.test.ts` asserts they
 * are drawn from a named allowlist, because "add one action per field" is the obvious-looking
 * change that would reintroduce the stall.
 *
 * **Phase 6 appends the test-prompt actions to this file.** The allowlist already names them, and
 * the `requireAdmin`-is-first loop already covers them the moment they exist. It is a deliberate
 * speed bump: an action outside the allowlist fails the test, so a per-field action stays an
 * explicit decision somebody has to write down, and phase 6's addition is a different KIND of
 * action — it spends money — rather than one more field.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions. A throw from a Server Action
 * reaches the browser as an opaque digest; a sentence reaches the operator.
 */

export interface AdminImageGenResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. */
  note?: string
  /** The revision the row now carries, so the panel can name it without a refetch. */
  revision?: number
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminImageGenResult {
  console.error(`[imgn] admin image prefs ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/**
 * The validated payload -> phase 1's write shape. **Adaptation seam, half two of two**
 * (`lib/admin/imageGenModel.ts`'s `toImageGenDraft` is half one).
 *
 * It reads like a no-op and is not: the fields are picked EXPLICITLY so that `userId` cannot ride
 * into the row, and so that a change to phase 1's field names is a compiler error in one function
 * instead of a silently dropped control. If phase 1 landed the reference as two flat members
 * (`referenceSource` / `referenceId`), THIS is the function that un-groups it and the only one.
 *
 * `NinaImagePrefsWrite` is IMPORTED rather than re-declared as a local `Omit<NinaImagePrefs,
 * 'revision'>`, for `toTuningWrite`'s reason: *"a constant that is agreed rather than shared is a
 * constant that will one day disagree."*
 */
function toImagePrefsWrite(input: NinaImagePrefsWriteInput): NinaImagePrefsWrite {
  return {
    promptLength: input.promptLength,
    focus: input.focus,
    wardrobe: input.wardrobe,
    venue: input.venue,
    time: input.time,
    notes: input.notes,
    reference: { source: input.reference.source, id: input.reference.id },
  }
}

/**
 * Save the whole prefs row. One action, one row, one revision bump.
 *
 * The argument types are deliberately loose (`Record<string, boolean>`, `source: string`) and Zod
 * does the narrowing, which is `saveNinaTuningAction`'s convention: a Server Action's declared
 * parameter type is a comment as far as the runtime is concerned, so the schema has to be the
 * check, and pretending otherwise at the signature invites a caller to skip it.
 */
export async function saveNinaImagePrefsAction(input: {
  userId: string
  promptLength: number
  focus: Record<string, boolean>
  wardrobe: string
  venue: string
  time: string
  notes: string
  reference: { source: string; id: string }
}): Promise<AdminImageGenResult> {
  await requireAdmin()

  const parsed = ninaImagePrefsWriteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not a set of image parameters this panel can save, so nothing was written.',
    }
  }

  try {
    /* `writeNinaImagePrefs` returns the whole stored row, already coerced, so reading the revision
     * off it is reading the truth rather than a hope — `writeNinaTuning`'s landed contract. */
    const { revision } = await writeNinaImagePrefs(
      parsed.data.userId,
      toImagePrefsWrite(parsed.data),
    )
    revalidatePath('/admin/image-generation')
    return {
      ok: true,
      revision,
      note: `Saved as revision ${revision}. The next photograph she takes is assembled from it — there is no cache on the image path.`,
    }
  } catch (cause) {
    return failed('save', cause)
  }
}

/**
 * Reset every image parameter to `NINA_IMAGE_PREFS_DEFAULTS`.
 *
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record: a reset is a thing that happened at a revision, not a
 * hole where one used to be.
 *
 * The defaults do NOT go through Zod. They are phase 1's module constant, not client input, and
 * validating a constant against a schema derived from the same module would only assert that phase
 * 1 agrees with itself. The focus record and the reference ARE copied, though —
 * `NINA_IMAGE_PREFS_DEFAULTS` is frozen, and `writeNinaImagePrefs` should never be handed the
 * singleton itself.
 *
 * **Reset clears the photo reference.** R1's body canon is unconditional, so a defaulted row still
 * produces a prompt naming the body; a defaulted row that kept pointing at a photograph would be a
 * "reset" that left the single most influential input in place.
 */
export async function resetNinaImagePrefsAction(input: {
  userId: string
}): Promise<AdminImageGenResult> {
  await requireAdmin()

  const parsed = ninaImagePrefsResetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That is not an account this panel can reset.' }
  }

  const defaults: NinaImagePrefsWrite = {
    promptLength: NINA_IMAGE_PREFS_DEFAULTS.promptLength,
    focus: { ...NINA_IMAGE_PREFS_DEFAULTS.focus },
    wardrobe: NINA_IMAGE_PREFS_DEFAULTS.wardrobe,
    venue: NINA_IMAGE_PREFS_DEFAULTS.venue,
    time: NINA_IMAGE_PREFS_DEFAULTS.time,
    notes: NINA_IMAGE_PREFS_DEFAULTS.notes,
    reference: {
      source: NINA_IMAGE_PREFS_DEFAULTS.reference.source,
      id: NINA_IMAGE_PREFS_DEFAULTS.reference.id,
    },
  }

  try {
    const { revision } = await writeNinaImagePrefs(parsed.data.userId, defaults)
    revalidatePath('/admin/image-generation')
    return {
      ok: true,
      revision,
      note: `Every image parameter is back at its default, as revision ${revision}. The body canon is unchanged — it never was a setting.`,
    }
  } catch (cause) {
    return failed('reset', cause)
  }
}

/* ── R11 / R12: the prompt test ──────────────────────────────────────────────────────────────
 *
 * Two actions, and the split is the whole design: one SPENDS a generation and returns without
 * waiting for it, and one READS what happened. The index's Decisions table settles why they are not
 * one action that blocks — a Server Action's timeout is the page segment's, and 78-220 s inside a
 * browser POST is precisely what `after()` exists to avoid.
 *
 * NEITHER TAKES A PAYLOAD WORTH VALIDATING, and that is deliberate rather than lazy.
 * `runNinaImageTestAction` takes NO arguments at all: everything it needs is the saved row and the
 * id `requireAdmin()` returns, so there is no shape to forge and no Zod schema to keep in step with
 * `lib/admin/schema.ts`. `readNinaImageTestAction` takes one job id, which is a CLAIM and is turned
 * into a fact by `isValidId` (shape) plus `getNinaImageJobDetail`'s owner-scoped `WHERE` (identity)
 * — `parseNinaJumpParam` and `/nina/jobs/[id]` are the precedent for exactly that pair.
 */

export type NinaImageTestDispatchResult =
  { ok: true; jobId: string; quotaLeft: number } | { ok: false; message: string }

export interface NinaImageTestReadResult {
  /** Live, because a chat selfie can spend it between renders. Shown BEFORE the click. */
  quotaLeft: number
  /** The prompt the button would send right now, from the SAVED prefs. Pure assembly, no model. */
  promptPreview: string
  /** The saved photo reference, so the panel can say whether this test is anchored. */
  referenceUrl: string | null
  /** `null` until a test has been dispatched, or when the id names nothing of ours. */
  job: NinaImageTestJobView | null
}

/**
 * Spend one generation to find out whether the provider will draw the saved prompt.
 *
 * The order is the cap, then the row, then the handoff — `dispatchNinaImageTest` owns all
 * three and states why. This action's only job is to turn its three outcomes into a sentence and a
 * job id.
 *
 * **No `revalidatePath` here.** Nothing has landed: the photograph does not exist for another
 * 78-220 s. The quota HAS changed, and the panel gets the new number in this very result rather
 * than by re-rendering a page.
 */
export async function runNinaImageTestAction(): Promise<NinaImageTestDispatchResult> {
  const { userId } = await requireAdmin()

  const dispatched = await dispatchNinaImageTest(userId)

  if (!dispatched.ok) {
    if (dispatched.kind === 'capped') {
      return {
        ok: false,
        message:
          `Today’s ${NINA_IMAGE_DAILY_CAP} generations are spent, so nothing was sent and ` +
          'nothing was billed. The cap counts failed generations too, and it rolls over at ' +
          'midnight in Jakarta.',
      }
    }
    return {
      ok: false,
      message:
        'The job could not be opened, so nothing was sent and nothing was billed. This is not a ' +
        'refusal — see the server log and try again.',
    }
  }

  return { ok: true, jobId: dispatched.jobId, quotaLeft: await ninaImageQuotaLeft(userId) }
}

/**
 * The read behind the panel: the quota, the prompt as it would be sent, and — once a test has
 * been dispatched — the job's state.
 *
 * `jobId === null` is the mount case and is not an error: there is a quota to show and a prompt to
 * preview before anything has been spent.
 *
 * ── THE `source !== 'admin'` FILTER ──────────────────────────────────────────────────────────
 * `getNinaImageJobDetail` already proves the job is this user's. This adds that it is one of HIS
 * PROMPT TESTS: a chat selfie's id polled here would otherwise be reported as "your prompt test",
 * which is a true row described by a false sentence. `source: 'admin'` is stamped by
 * `dispatchNinaImageTest` and is the value `NinaImageJobArgs` already carries for this purpose.
 *
 * ── WHY THE PREVIEW MAY BE AWAITED HERE ──────────────────────────────────────────────────────
 * `assembleNinaImageTestPrompt` is a PURE string join over two indexed reads. No model call is
 * awaited, which is what `ci:llm-payload-guard` Rule 2 and plan invariant 5 forbid — the same
 * standing `buildNinaSystemPrompt` has on `/admin/personality`.
 *
 * ── AND WHY `referenceUrl` IS RESOLVED RATHER THAN READ ──────────────────────────────────────
 * **RECONCILED.** The prefs row stores `reference: { source, id }` and NOT a Blob URL — phase 1's
 * `NinaImagePrefs` has no `referenceUrl` member, by the same argument this phase's Step 1 makes:
 * `updateNinaChatPhotoBlob` changes a chat photograph's `blob_url` and keeps its `id`, so a stored
 * URL would point at a deleted object. `resolveNinaPhotoReference` is owner-scoped and returns
 * `null` both for "none selected" and for "the photograph was deleted", which are the same two
 * words on screen: this generation is unanchored.
 */
export async function readNinaImageTestAction(
  jobId: string | null,
): Promise<NinaImageTestReadResult> {
  const { userId } = await requireAdmin()

  const [quotaLeft, tuning, prefs] = await Promise.all([
    ninaImageQuotaLeft(userId),
    readNinaTuning(userId),
    readNinaImagePrefs(userId),
  ])

  const base = {
    quotaLeft,
    promptPreview: assembleNinaImageTestPrompt({ tuning, prefs }),
    referenceUrl: (await resolveNinaPhotoReference(userId, prefs.reference))?.blobUrl ?? null,
  }

  if (!isValidId(jobId)) return { ...base, job: null }

  const detail = await getNinaImageJobDetail(userId, jobId)
  if (detail == null || detail.source !== 'admin') return { ...base, job: null }

  const job: NinaImageTestJobView = {
    jobId: detail.id,
    status: detail.status,
    errorCode: detail.errorCode,
    attempts: detail.attempts,
    latencyMs: detail.latencyMs,
    costMicroUsd: detail.costMicroUsd,
    prompt: detail.prompt,
    /* Epoch milliseconds, not a `Date`: the one shape a client and a server cannot disagree about.
     * `toNinaJobListItems` makes the same conversion for the same reason. */
    createdAtMs: detail.createdAt.getTime(),
  }

  /*
   * R12's "automatically", made literal. The photograph is written by the selfie finisher on a
   * background invocation that has no idea `/admin/photos` exists, so its cached render would keep
   * showing the old collection until something invalidated it. Doing it HERE — once, on the
   * poll that first sees `status='ok'` — costs nothing and means the operator finds the
   * picture already there.
   */
  if (imageTestVerdict(job) === 'allowed') revalidatePath(ADMIN_CHAT_PHOTOS_PATH)

  return { ...base, job }
}
