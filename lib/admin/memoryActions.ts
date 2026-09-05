'use server'

import { revalidatePath } from 'next/cache'

import {
  adminAppendFact,
  adminDeleteFact,
  adminDeleteSlot,
  adminReadSlot,
  adminUpdateFact,
  adminUpsertSlot,
} from '@/lib/admin/memoryStore'
import { canonicaliseSlotValue } from '@/lib/admin/memoryVocab'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  factEditSchema,
  factInsertSchema,
  memoryDeleteSchema,
  slotEditSchema,
} from '@/lib/admin/schema'
import { NINA_SLOT_PENDING_PROMISES, type NinaPendingPromisesSlot } from '@/lib/db/schema'

/**
 * `/admin/memory`'s write side — R1's *"i can easily edit, add or remove one row easily"*.
 *
 * **Four actions, because the table has four things a person can do to it**: change a cell, add a
 * ledger row, delete a row, and that is all. There were nine. The five that went were not features
 * the table lost — two of them existed to APPEND a quoting record before deleting, one existed to
 * demand a confirmation word be typed out first, one was a second button offered after a refusal,
 * and one was a third delete control for a row kind the single delete below now covers. Every one
 * of them was a second step, and the owner of this deployment has ruled: *"i am the only one using
 * this app, no need for all these bullshit confirmation."*
 *
 * Every action follows the same four lines, in this order and for these reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists
 *                                 (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`,
 *                                 "Security": *"the route is reachable to anyone who can send the
 *                                 same POST"*), and `proxy.ts` does not match `/admin`.
 *   2. Zod                      — every field, every time. Validation is not confirmation; the
 *                                 client is not a source of truth. The same doc: *"Schema
 *                                 validation only checks the shape"* — which is why every statement
 *                                 below is `userId`-scoped in SQL as well.
 *   3. the write                — through `lib/admin/memoryStore.ts` only, so the admin label
 *                                 cannot be forgotten.
 *   4. `revalidatePath`         — re-renders THIS page, and the re-rendered RSC payload rides back
 *                                 in the SAME response as the return value ("A single response
 *                                 carries data and UI"), which is what lets the table delete a row
 *                                 optimistically without guessing. It is **not** how the edit
 *                                 reaches Nina: `loadNinaContext` reads both tables live on every
 *                                 turn with no cache anywhere on that path, so a committed row is
 *                                 in her next prompt with no invalidation step at all.
 *
 * ── THE ORDERING RULE THAT USED TO LIVE HERE IS GONE, DELIBERATELY ──────────────────────────
 * The previous version of this header recorded an invariant — *"the append comes first, always"* —
 * for the two deleted actions that each performed two write statements outside a transaction. Both
 * are gone, and no surviving action writes twice: three of the four are a single statement, and the
 * promise branch of the fourth is a read followed by one upsert. The invariant has no subject left,
 * so it is removed rather than left as folklore about code that no longer exists.
 */

export interface AdminMemoryResult {
  ok: boolean
  error?: string
  /** One sentence about what was written. Rendered under the cell that caused it. */
  note?: string
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminMemoryResult {
  console.error(`[f36] admin memory ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/**
 * Save a slot cell — an upsert, so this is both "edit the value" and "insert a slot by hand".
 * There is no separate insert action, because `(user_id, key)` is the primary key and the
 * vocabulary is closed: every key the page can save into is already a row in the table, empty or
 * not (`buildMemoryRows`).
 *
 * The canonicalisation is phase 5's, run here because phase 5's ruling (b) puts the round trip on
 * the WRITER. A refused value is reported and not converted — and the table shows the refusal
 * inline on the row, which is the whole of what "the server owns every refusal" means here.
 */
export async function saveSlotAction(input: {
  userId: string
  key: string
  value: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a slot edit this page can make.' }
  const { userId, key, value } = parsed.data

  const canonical = canonicaliseSlotValue(key, value)
  if (!canonical.ok) return { ok: false, error: canonical.reason }

  try {
    await adminUpsertSlot(userId, { key, value: canonical.value })
  } catch (cause) {
    return failed('saveSlot', cause)
  }

  revalidatePath('/admin/memory')
  return {
    ok: true,
    note:
      canonical.value === value.trim()
        ? 'Saved. The distiller will not overwrite it.'
        : `Saved as "${canonical.value}" — the canonical form, and it parses back.`,
  }
}

/**
 * **The backdoor, literally** — R24's *"i can add some important data of myself through a backdoor
 * in admin page"*, and R1's one add affordance. A ledger row with no message behind it: written as
 * an admin row, with a null `source_message_id`.
 *
 * It lands in `nina_memory_facts` and therefore in the newest 60 rows the context loader reads, so
 * **Nina reads it on her very next turn** with nothing else to do. And the distiller imports
 * neither of the two mutating ledger queries, so no distillation can ever rewrite or remove it.
 */
export async function insertFactAction(input: {
  userId: string
  category: string
  text: string
  confidence: number
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factInsertSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Pick a category and write something under 400 characters.' }
  }
  const { userId, category, text, confidence } = parsed.data

  try {
    const row = await adminAppendFact(userId, { category, text, confidence })
    if (row == null) return { ok: false, error: 'The ledger did not accept it. Nothing changed.' }
  } catch (cause) {
    return failed('insertFact', cause)
  }

  revalidatePath('/admin/memory')
  return { ok: true, note: 'She reads this on her next turn.' }
}

/**
 * A cell save on a ledger row — **any** ledger row, including one the distiller wrote.
 *
 * That is the change R1 forced, and it is not a confirmation being removed: refusing to edit a
 * distilled row was a DATA INTEGRITY rule, because the row carries a `source_message_id` and
 * rewriting its text would make it misquote that message. The fix is to stop claiming it is a
 * quotation, which `adminUpdateFact` does in the same statement as the text — `source = 'admin'`,
 * `source_message_id = NULL`. So the old permissions predicate has nothing left to decide and is
 * deleted; what the operator sees instead is the row's own note, which says the edit will make the
 * row his.
 *
 * The old version read the newest `ADMIN_LEDGER_PAGE` rows first, to check the permission and to
 * refuse an id outside the rendered window. Both reasons are gone: there is no permission, and the
 * statement's own `WHERE user_id = $1 AND id = $2` is what enforces ownership. One round trip
 * instead of two, on the hot path of every keystroke-completed edit.
 */
export async function editFactAction(input: {
  userId: string
  id: string
  category: string
  text: string
  confidence: number
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not an edit this page can make.' }
  const { userId, id, category, text, confidence } = parsed.data

  try {
    const updated = await adminUpdateFact(userId, id, { category, text, confidence })
    if (!updated) return { ok: false, error: 'That row is no longer in the ledger.' }
  } catch (cause) {
    return failed('editFact', cause)
  }

  revalidatePath('/admin/memory')
  return { ok: true, note: 'Saved. The row is yours now — admin, quoting nothing.' }
}

/**
 * **The one destructive action on this page, and it destroys on the first click.** No typed word,
 * no panel, no quoting record written first, no dialog. R1, verbatim: *"when i delete or edit a
 * memory, do not ask for any confirmation whatsoever."*
 *
 * One action for all three row kinds because there is one CONTROL — the `✕` on a row — and the
 * row's kind is the only thing that decides which table it lands in. `memoryDeleteSchema` is a
 * discriminated union, so the branch below is exhaustive by construction.
 *
 * The three branches differ in one honest way, and the table renders that difference
 * (`MemoryRow.reappears`):
 *
 *   · **fact**    — the row is gone. The ledger is append-only from the distiller's side; this is
 *                   the one path that removes a row, and nothing survives it.
 *   · **slot**    — the ROW is gone; on one of the eight closed vocabulary keys the KEY is not,
 *                   because the vocabulary is closed and the page renders every key. The row is
 *                   back, blank, in the same response.
 *   · **promise** — the ENTRY leaves the `pending_promises` slot, which is rewritten without it.
 *                   The removed `id` does not come back: `mergePendingPromises` matches candidates
 *                   by `id`, and a fresh candidate only appears if the runner states the promise
 *                   again in a later turn, which is a new promise and should reappear. The slot is
 *                   rewritten as an admin row, which phase 5's stickiness then preserves through
 *                   every later merge.
 *
 * No ledger record is written for any of the three. For a promise that was already the rule — a
 * promise is structured state about a future obligation, not a claim about the runner, and
 * recording "the admin deleted a promise" as a FACT would put a sentence about app administration
 * into Nina's memory of her friend. For a slot and a fact it is R1's ruling: the record was the
 * confirmation.
 */
export async function deleteMemoryRowAction(input: {
  userId: string
  kind: 'slot' | 'promise' | 'fact'
  target: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = memoryDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a row this page can delete.' }
  const { userId, kind, target } = parsed.data

  try {
    if (kind === 'fact') {
      const removed = await adminDeleteFact(userId, target)
      if (!removed) return { ok: false, error: 'That row is no longer in the ledger.' }
      revalidatePath('/admin/memory')
      return { ok: true }
    }

    if (kind === 'slot') {
      const removed = await adminDeleteSlot(userId, target)
      if (!removed) return { ok: false, error: 'There is no such slot, so nothing was removed.' }
      revalidatePath('/admin/memory')
      return { ok: true }
    }

    const slot = await adminReadSlot(userId, NINA_SLOT_PENDING_PROMISES)
    if (slot == null) return { ok: false, error: 'There are no pending promises to remove.' }

    const current = slot.value as NinaPendingPromisesSlot
    const promises = Array.isArray(current?.promises) ? current.promises : []
    const next = promises.filter((promise) => promise.id !== target)
    if (next.length === promises.length) {
      return { ok: false, error: 'No promise with that id. Nothing changed.' }
    }

    await adminUpsertSlot(userId, {
      key: NINA_SLOT_PENDING_PROMISES,
      value: { promises: next } satisfies NinaPendingPromisesSlot,
    })
    revalidatePath('/admin/memory')
    return { ok: true }
  } catch (cause) {
    return failed('deleteMemoryRow', cause)
  }
}
