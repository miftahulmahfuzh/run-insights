'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import { ninaTuningWriteSchema, type NinaTuningWriteInput } from '@/lib/admin/schema'
import { toTuningDraft, type TuningDraft } from '@/lib/admin/tuningModel'
import { writeNinaTuning } from '@/lib/nina/queries'
import type { NinaTuning } from '@/lib/nina/tuning'

/**
 * `/admin/personality`'s character panel, write side — R1, R2, R3, then R4, then the simplify
 * set: the panel commits every control by itself, and this file is the single action they all
 * ride on.
 *
 * The action follows `lib/admin/memoryActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`),
 *                                 so this call is the only gate on this endpoint.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaTuning`, which owns the
 *                                 clamp and the upsert.
 *   4. `revalidatePath`         — re-renders THIS page, so the prompt preview shows the row that
 *                                 was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES NINA, AND THAT IS THE FEATURE ──────────────
 * `memoryActions.ts` records this about the memory tables and it holds verbatim for the tuning:
 * there is no cache anywhere on the turn path, so a committed row is in her next prompt with no
 * invalidation step at all. No deploy, no distillation pass, no revalidation. That is why the
 * panel's own copy says it, and why auto-save is safe to commit a dial the moment its drag
 * settles: what lands is live on her very next message.
 *
 * ── ONE ACTION, NOT SIXTEEN — AND NOW IT IS LITERALLY ONE ───────────────────────────────────
 * Plan invariant 11, and `ninaTuningWriteSchema`'s docstring has the mechanism: Next dispatches
 * Server Actions one at a time per client, so per-dial actions would stall behind each other.
 * The simplify set made the count exact: `resetNinaTuningAction` is gone (the panel it served
 * lost its staged-commit row), this file exports exactly one action, and
 * `tests/admin.tuning.test.ts` asserts the count — "add one action per dial" remains the
 * obvious-looking change the assertion exists to refuse.
 *
 * ── THE RESULT CARRIES THE ROW IT WROTE ──────────────────────────────────────────────────────
 * The success result's `tuning` is `toTuningDraft(stored)` — the row AFTER `coerceNinaTuning`,
 * as the database holds it. The panel adopts it through `mergeTuningAfterSave` (see
 * `tuningModel.ts`): `coerceNinaNotes` trims and collapses, so the stored row can differ
 * cosmetically from what was typed, and the response carries this value and the re-rendered
 * route in one round trip anyway (`server-actions.md`, "A single response carries data and UI")
 * — reading the row off the result is the same freshness as reading it off the prop, without
 * having to tell "my save landed" apart from "the row changed under me". Nothing needs to tell
 * them apart: this panel is the row's only writer, so the only way the row changes under it is
 * this file's own save coming back.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions — the shape phase 15 set on
 * the sibling admin page. A throw from a Server Action reaches the browser as an opaque digest;
 * a sentence reaches the operator. There is no retry button any more, so the failure sentence
 * names the retry that exists: move any control and it commits again.
 */

export interface AdminTuningResult {
  ok: boolean
  error?: string
  /**
   * One sentence about what was written. The panel's status line is the success surface ("Saved"
   * with no qualifier); this stays in the shape for the result-object convention and for any
   * future caller that wants the sentence.
   */
  note?: string
  /**
   * The row as stored — `toTuningDraft` over what `writeNinaTuning` returned, i.e. AFTER
   * `coerceNinaTuning`. Present on success. The panel merges it with
   * `mergeTuningAfterSave` so coerced values appear without clobbering edits made since
   * dispatch.
   */
  tuning?: TuningDraft
}

/** The action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(cause: unknown): AdminTuningResult {
  console.error('[tune] admin tuning save failed', cause)
  return {
    ok: false,
    error: 'The write failed and nothing was changed — move any control to try again.',
  }
}

/**
 * The validated payload -> phase 1's write shape. **Adaptation seam, half two of two**
 * (`lib/admin/tuningModel.ts`'s `toTuningDraft` is half one).
 *
 * It reads like a no-op and is not: the fields are picked EXPLICITLY so that `userId` cannot ride
 * into the row, and so that a change to phase 1's field names is a compiler error in one function
 * instead of a silent extra key in a jsonb column. `parsed.data.traits` is already
 * `Record<NinaTrait, number>` and `relationship` already `NinaRelationship`, because
 * `dialShape` builds the Zod shape from phase 1's own key arrays — so no cast is needed anywhere
 * on this path.
 *
 * The return type is `NinaTuning`, IMPORTED from `lib/nina/tuning.ts` rather than re-declared
 * locally. A second declaration of it here is the shape `lib/admin/avatars.ts` warns about:
 * *"a constant that is agreed rather than shared is a constant that will one day disagree."*
 */
function toTuningWrite(input: NinaTuningWriteInput): NinaTuning {
  return {
    traits: input.traits,
    dials: input.dials,
    /* R4. `ninaTuningWriteSchema` builds this shape from `NINA_TUNING_KEYS`, so it is already
     * `Record<NinaTuningKey, boolean>` and no cast is needed on this path either. */
    enabled: input.enabled,
    relationship: input.relationship,
    notes: input.notes,
  }
}

/**
 * Save the whole tuning. One action, one row — the only write the panel has, dispatched by
 * every control at its own commit moment (dials debounced, toggles and radios on change, notes
 * on blur).
 *
 * The argument types are deliberately loose (`Record<string, number>`, `relationship: string`) and
 * Zod does the narrowing, which is the convention `saveSlotAction`'s `key: string` set: a Server
 * Action's declared parameter type is a comment as far as the runtime is concerned, so the schema
 * has to be the check, and pretending otherwise at the signature invites a caller to skip it.
 */
export async function saveNinaTuningAction(input: {
  userId: string
  traits: Record<string, number>
  dials: Record<string, number>
  /** R4's per-parameter toggles, keyed by `NINA_TUNING_KEYS`. Zod narrows it; this is a comment. */
  enabled: Record<string, boolean>
  relationship: string
  notes: string
}): Promise<AdminTuningResult> {
  await requireAdmin()

  const parsed = ninaTuningWriteSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: 'That is not a tuning this panel can save, so nothing was written.',
    }
  }

  try {
    /* `writeNinaTuning` returns the whole stored `NinaTuning` — phase 1's landed contract. The
     * row it hands back is what the database actually holds, already coerced, so the result's
     * `tuning` is the truth rather than a hope, and the panel can adopt it without a refetch. */
    const stored = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/personality')
    return {
      ok: true,
      tuning: toTuningDraft(stored),
      note: 'Saved. She reads it on her very next message — there is no cache on her turn path.',
    }
  } catch (cause) {
    return failed(cause)
  }
}
