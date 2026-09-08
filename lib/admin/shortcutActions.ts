'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  shortcutCellSchema,
  shortcutDeleteSchema,
  shortcutInsertSchema,
  shortcutToggleSchema,
} from '@/lib/admin/schema'
import { NINA_TRIGGER_MAX } from '@/lib/admin/shortcutModel'
import {
  adminCreateShortcut,
  adminDeleteShortcut,
  adminSaveShortcutField,
  adminSetShortcutEnabled,
} from '@/lib/admin/shortcutStore'

/**
 * `/admin/shortcuts`'s write side — R1's *"admin can add shortcuts that entails some situations or
 * what miftah and nina were doing"*.
 *
 * **Four actions, because there are four things a person can do to this table**: add a shortcut,
 * change one of its cells, turn it off, throw it away. There is no fifth, and in particular there
 * is no confirm, no purge gate and no "are you sure" — the standing ruling of this admin surface,
 * carried in `lib/admin/memoryActions.ts`'s own header in the owner's words: *"i am the only one
 * using this app, no need for all these bullshit confirmation."*
 *
 * Every action follows the same four lines, in this order and for these reasons — the rule is
 * `memoryActions.ts`'s and it is repeated rather than referenced because it is the thing a future
 * edit is most likely to skip:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists
 *                                 (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`,
 *                                 "Security"), and `proxy.ts` does not match `/admin`.
 *   2. Zod                      — every field, every time. Validation is not confirmation. It is
 *                                 also what keeps the two derived columns out of the payload: they
 *                                 are absent from every schema, so a forged POST has nowhere to put
 *                                 a key that disagrees with its own trigger.
 *   3. the write                — through `lib/admin/shortcutStore.ts` only, which is where the
 *                                 folded key and the classification are computed.
 *   4. `revalidatePath`         — re-renders THIS page, and the re-rendered RSC payload rides back
 *                                 in the SAME response as the return value, which is what lets the
 *                                 table delete a row optimistically without guessing. It is **not**
 *                                 how the edit reaches Nina: nothing on the turn path caches a
 *                                 shortcut, so a committed row is live on her next matching
 *                                 message with no invalidation step at all.
 *
 * ── A DUPLICATE TRIGGER IS A SENTENCE, NOT A STACK TRACE ────────────────────────────────────
 * The store turns the unique-index violation into `'duplicate'` and `refusal()` turns that into a
 * sentence naming the trigger. Nothing here does a pre-flight SELECT: see the store's header for
 * why a check-then-write races itself.
 */

export interface AdminShortcutResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. Rendered under the cell that caused it. */
  note?: string
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminShortcutResult {
  console.error(`[f36] admin shortcuts ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/** The sentence the operator gets when the row is gone from under him. */
const GONE = 'That shortcut is no longer in the table. Nothing changed.'

/**
 * A refused write, in one sentence that names the trigger. `'duplicate'` quotes it because the
 * operator has to go find the row it collided with, and `(user_id, match_key)` means the collision
 * may be with a trigger that LOOKS different — `✌️` and `✌` fold to the same key, which is the whole
 * point and is also the most confusing five seconds this page can produce.
 */
function refusal(status: 'duplicate' | 'missing' | 'empty', trigger: string): string {
  if (status === 'duplicate') {
    return `"${trigger}" already matches a shortcut this user has — variation selectors and case are folded away before the comparison, so it may be spelled differently in the table. Edit that row instead.`
  }
  if (status === 'empty') {
    return `"${trigger}" folds away to nothing once whitespace and variation selectors come out. A trigger needs at least one character that survives that.`
  }
  return GONE
}

/**
 * **The add row.** The first click of a create, not a second click on anything. The row is live the
 * moment it lands: nothing caches a shortcut, so his next message carrying that trigger takes the
 * whole expansion with it.
 */
export async function addShortcutAction(input: {
  userId: string
  trigger: string
  label: string
  expansion: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutInsertSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: `A shortcut needs all three: a trigger of at most ${NINA_TRIGGER_MAX} characters, a one-line label, and the expansion it stands for.`,
    }
  }
  const { userId, trigger, label, expansion } = parsed.data

  try {
    const status = await adminCreateShortcut(userId, { trigger, label, expansion })
    if (status !== 'ok') return { ok: false, error: refusal(status, trigger) }
  } catch (cause) {
    return failed('add', cause)
  }

  revalidatePath('/admin/shortcuts')
  return {
    ok: true,
    note: 'Live. The next message he sends with that in it carries the whole expansion.',
  }
}

/**
 * A cell save. One field, because the three are independent and only one of them can be refused —
 * sending all three would make every label typo a candidate for a duplicate-trigger error.
 *
 * Editing the trigger re-derives the folded key and the boundary rule in the same statement, which
 * is why this is the branch that can come back `'duplicate'`.
 */
export async function saveShortcutCellAction(input: {
  userId: string
  id: string
  field: string
  value: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutCellSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not an edit this page can make.' }
  const { userId, id, field, value } = parsed.data

  try {
    const status = await adminSaveShortcutField(userId, id, field, value)
    if (status !== 'ok') return { ok: false, error: refusal(status, value) }
  } catch (cause) {
    return failed('saveCell', cause)
  }

  revalidatePath('/admin/shortcuts')
  return {
    ok: true,
    note:
      field === 'trigger'
        ? 'Saved. The row now shows the folded key it will actually match on.'
        : 'Saved. She reads it on the next message that fires this one.',
  }
}

/**
 * Off is not delete, and that distinction is the reason this action exists rather than making the
 * operator delete and retype. A disabled row keeps its expansion, its usage count and its place in
 * the table; the matcher filters it out before matching and nothing can fire it.
 */
export async function toggleShortcutAction(input: {
  userId: string
  id: string
  enabled: boolean
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutToggleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a toggle this page can make.' }
  const { userId, id, enabled } = parsed.data

  try {
    const status = await adminSetShortcutEnabled(userId, id, enabled)
    if (status !== 'ok') return { ok: false, error: GONE }
  } catch (cause) {
    return failed('toggle', cause)
  }

  revalidatePath('/admin/shortcuts')
  return {
    ok: true,
    note: enabled
      ? 'On. It can fire again from his next message.'
      : 'Off. The row stays and keeps its count; nothing can fire it.',
  }
}

/**
 * **The one destructive action on this page, and it destroys on the first click.** No typed word,
 * no panel, no record written first, no dialog. Invariant 6.
 *
 * A successful delete returns no `note`: the row being gone IS the message, and a sentence under a
 * row that no longer exists has nowhere to render.
 */
export async function deleteShortcutAction(input: {
  userId: string
  id: string
}): Promise<AdminShortcutResult> {
  await requireAdmin()

  const parsed = shortcutDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a row this page can delete.' }
  const { userId, id } = parsed.data

  try {
    const status = await adminDeleteShortcut(userId, id)
    if (status !== 'ok') return { ok: false, error: GONE }
  } catch (cause) {
    return failed('delete', cause)
  }

  revalidatePath('/admin/shortcuts')
  return { ok: true }
}
