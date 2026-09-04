'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  ninaTuningResetSchema,
  ninaTuningWriteSchema,
  type NinaTuningWriteInput,
} from '@/lib/admin/schema'
import { writeNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS, type NinaTuningWrite } from '@/lib/nina/tuning'

/**
 * `/admin/nina`'s character panel, write side — R1, R2, R3.
 *
 * Both actions follow `lib/admin/memoryActions.ts`'s four lines, in this order and for these
 * reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` matches
 *                                 neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`),
 *                                 so this call is the only gate on this endpoint.
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — one row, through phase 1's `writeNinaTuning`, which owns the
 *                                 clamp and the revision bump.
 *   4. `revalidatePath`         — re-renders THIS page, so the panel and the prompt preview show
 *                                 the row that was just written.
 *
 * ── `revalidatePath` IS NOT HOW THE EDIT REACHES NINA, AND THAT IS THE FEATURE ──────────────
 * `memoryActions.ts` records this about the memory tables and it holds verbatim for the tuning:
 * there is no cache anywhere on the turn path, so a committed row is in her next prompt with no
 * invalidation step at all. No deploy, no distillation pass, no revalidation. That is why the
 * panel's own copy says it, and why the slider is a live control rather than a config file.
 *
 * ── ONE SAVE, NOT SIXTEEN ───────────────────────────────────────────────────────────────────
 * Plan invariant 11, and `ninaTuningWriteSchema`'s docstring has the mechanism. There are exactly
 * two exported functions in this file and `tests/admin.tuning.test.ts` asserts the count, because
 * "add one action per dial" is the obvious-looking change that would reintroduce the stall.
 *
 * ── A RESULT OBJECT, NEVER A THROW ──────────────────────────────────────────────────────────
 * The panel is a `useTransition` client with plain-argument actions — the shape phase 15 set on the
 * sibling admin page and phase 16 followed. A throw from a Server Action reaches the browser as an
 * opaque digest; a sentence reaches the operator.
 */

export interface AdminTuningResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. */
  note?: string
  /** The revision the row now carries, so the panel can name it without a refetch. */
  revision?: number
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminTuningResult {
  console.error(`[tune] admin tuning ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
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
 * `NinaTuningWrite` is IMPORTED from `lib/nina/tuning.ts` rather than re-declared as a local
 * `Omit<NinaTuning, 'revision'>`. Phase 1 exports that exact type under that exact name, and a
 * second declaration of it here is the shape `lib/admin/avatars.ts` warns about: *"a constant that
 * is agreed rather than shared is a constant that will one day disagree."*
 */
function toTuningWrite(input: NinaTuningWriteInput): NinaTuningWrite {
  return {
    traits: input.traits,
    dials: input.dials,
    relationship: input.relationship,
    wardrobe: input.wardrobe,
    notes: input.notes,
  }
}

/**
 * Save the whole tuning. One action, one row, one revision bump.
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
  relationship: string
  wardrobe: string
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
    /* `writeNinaTuning` returns the whole stored `NinaTuning`, not a number — phase 1's landed
     * contract. The row it hands back is what the database actually holds, already coerced, so
     * reading the revision off it is reading the truth rather than a hope. */
    const { revision } = await writeNinaTuning(parsed.data.userId, toTuningWrite(parsed.data))
    revalidatePath('/admin/nina')
    return {
      ok: true,
      revision,
      note: `Saved as revision ${revision}. She reads it on her very next message — there is no cache on her turn path.`,
    }
  } catch (cause) {
    return failed('save', cause)
  }
}

/**
 * Reset every dial to `NINA_TUNING_DEFAULTS` — the behavioural rollback the plan's own Rollback
 * section names as cheaper than the code one.
 *
 * It **writes** the defaults rather than deleting the row, and so it bumps the revision like any
 * other save. That is the honest record: `nina_turns` stamps the tuning revision that produced
 * each turn, so "he reset her at revision 8" has to be a revision, not a hole where one used to
 * be. Invariant 2 is what makes this a real rollback instead of a gesture: the default tuning
 * renders the prompt she shipped with, character for character.
 *
 * The defaults do NOT go through Zod. They are phase 1's module constant, not client input, and
 * validating a constant against a schema derived from the same module would only assert that phase
 * 1 agrees with itself. The two records ARE spread, though — `NINA_TUNING_DEFAULTS` is frozen and
 * so are `traits` and `dials`, and `writeNinaTuning` should never be handed the singleton itself.
 */
export async function resetNinaTuningAction(input: {
  userId: string
}): Promise<AdminTuningResult> {
  await requireAdmin()

  const parsed = ninaTuningResetSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'That is not an account this panel can reset.' }
  }

  const defaults: NinaTuningWrite = {
    traits: { ...NINA_TUNING_DEFAULTS.traits },
    dials: { ...NINA_TUNING_DEFAULTS.dials },
    relationship: NINA_TUNING_DEFAULTS.relationship,
    wardrobe: NINA_TUNING_DEFAULTS.wardrobe,
    notes: NINA_TUNING_DEFAULTS.notes,
  }

  try {
    const { revision } = await writeNinaTuning(parsed.data.userId, defaults)
    revalidatePath('/admin/nina')
    return {
      ok: true,
      revision,
      note: `Every dial is back at its default, as revision ${revision}. She is the Nina who shipped.`,
    }
  } catch (cause) {
    return failed('reset', cause)
  }
}
