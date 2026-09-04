'use server'

import { revalidatePath } from 'next/cache'

import {
  ADMIN_FACT_TEXT_MAX,
  ADMIN_LEDGER_PAGE,
  composeRetraction,
  composeSlotRetirement,
  factPermissions,
  isPurgeConfirmed,
} from '@/lib/admin/memoryModel'
import {
  adminAppendFact,
  adminDeleteFact,
  adminDeleteSlot,
  adminReadFacts,
  adminReadSlot,
  adminReadSlots,
  adminUpdateFact,
  adminUpsertSlot,
} from '@/lib/admin/memoryStore'
import { canonicaliseSlotValue, slotFactCategory } from '@/lib/admin/memoryVocab'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  factEditSchema,
  factInsertSchema,
  factPurgeSchema,
  factRetractSchema,
  promiseRemoveSchema,
  slotEditSchema,
  slotRetireSchema,
} from '@/lib/admin/schema'
import { jakartaDayOf } from '@/lib/date/ranges'
import { NINA_SLOT_PENDING_PROMISES, type NinaPendingPromisesSlot } from '@/lib/db/schema'

/**
 * `/admin/memory`'s write side — R24.
 *
 * Every action follows the same four lines, in this order and for these reasons:
 *
 *   1. `await requireAdmin()`   — FIRST, above any use of an argument. A Server Action is a POST
 *                                 endpoint whether or not a button exists, and `proxy.ts` does not
 *                                 match `/admin` (phase 15 verified and deliberately kept that).
 *   2. Zod                      — every field, every time. The client is not a source of truth.
 *   3. the write                — through `lib/admin/memoryStore.ts` only, so the admin label
 *                                 cannot be forgotten (§5).
 *   4. `revalidatePath`         — re-renders THIS page. It is **not** how the edit reaches Nina:
 *                                 `loadNinaContext` reads both tables live on every turn with no
 *                                 cache anywhere on that path, so a committed row is in her next
 *                                 prompt with no invalidation step at all (§1).
 *
 * ── THE ONE THING TO NOT REORDER ────────────────────────────────────────────────────────────
 * `retractFactAction` and `retireSlotAction` each perform TWO statements that are not in one
 * transaction (phase 1 exposes them as two functions; `runBatch` is not on this path). **The
 * append comes first, always.** The appended row contains the original text verbatim, so a crash
 * between the two leaves a recoverable duplicate rather than a hole. Reversed, a crash loses the
 * sentence for good, and R4's "permanently" is exactly the promise that would break.
 */

export interface AdminMemoryResult {
  ok: boolean
  error?: string
  /** What the row now says, so the client can show the canonical form without a refetch. */
  canonical?: string
  /** One sentence about what else was written — the ledger record a retraction or retirement left. */
  note?: string
  /** The id of a row this action created. */
  id?: string
}

/** Every action's catch-all. A stack trace goes to the log; a sentence goes to the admin. */
function failed(where: string, cause: unknown): AdminMemoryResult {
  console.error(`[f33] admin memory ${where} failed`, cause)
  return { ok: false, error: 'The write failed and nothing was changed. Try again.' }
}

/* ── slots ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * Save a slot — an upsert, so this is both "edit the value" and "insert a slot by hand". There is
 * no separate insert action, because `(user_id, key)` is the primary key and the vocabulary is
 * closed: every card the page can save into already exists as a card (`buildSlotCards`).
 *
 * The canonicalisation is phase 5's, run here because phase 5's ruling (b) puts the round trip on
 * the WRITER. A refused value is reported, not converted (§3).
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
    canonical: canonical.value,
    note:
      canonical.value === value.trim()
        ? 'Saved. The distiller will not overwrite it.'
        : `Saved as "${canonical.value}" — that is the canonical form, and it parses back.`,
  }
}

/**
 * The explicit fallback for a refused slot value: record it in the ledger instead. This is phase
 * 5's own degradation ("a write whose raw text does not parse is refused as a slot and appended to
 * the ledger instead"), taken by a second button rather than silently, because a human is present.
 */
export async function recordSlotAsFactAction(input: {
  userId: string
  key: string
  value: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotEditSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not something this page can record.' }
  const { userId, key, value } = parsed.data

  const text = value.replace(/\s+/g, ' ').trim().slice(0, ADMIN_FACT_TEXT_MAX)
  if (text.length === 0) return { ok: false, error: 'Nothing to record.' }

  try {
    const row = await adminAppendFact(userId, {
      category: slotFactCategory(key),
      text,
      confidence: 100,
    })
    if (row == null) return { ok: false, error: 'The ledger did not accept it. Nothing changed.' }
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: row.id,
      note: 'Recorded in the ledger. She will read it, but no rule reads it as a slot.',
    }
  } catch (cause) {
    return failed('recordSlotAsFact', cause)
  }
}

/**
 * Retire a slot — §4. **Append the record, then delete the row.** This is the only way a slot
 * leaves the table on this page: a bare delete would remove a sentence from the app entirely, and
 * a slot is in Nina's prompt on every single turn, so removing one is a real change to what she
 * knows.
 *
 * The value is read from `adminReadSlots` rather than `adminReadSlot` on purpose: the list read
 * returns the value already RENDERED to the display string (`renderSlotValue`), which is what the
 * record should quote, while the single read returns it parsed.
 */
export async function retireSlotAction(input: {
  userId: string
  key: string
  reason: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = slotRetireSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a slot this page can retire.' }
  const { userId, key, reason } = parsed.data

  try {
    const rows = await adminReadSlots(userId)
    const row = rows.find((candidate) => candidate.key === key)
    if (row == null) return { ok: false, error: 'There is no such slot, so nothing was removed.' }

    const text = composeSlotRetirement({
      key,
      value: row.value,
      reason,
      on: jakartaDayOf(new Date()),
    })

    // ── APPEND FIRST. See the header. ──
    const record = await adminAppendFact(userId, {
      category: slotFactCategory(key),
      text,
      confidence: 100,
    })
    if (record == null) {
      return {
        ok: false,
        error: 'Could not record the slot in the ledger, so it was NOT removed. Nothing changed.',
      }
    }

    const removed = await adminDeleteSlot(userId, key)
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: record.id,
      note: removed
        ? 'Recorded in the ledger, then removed from her prompt.'
        : 'Recorded in the ledger. The slot row was already gone.',
    }
  } catch (cause) {
    return failed('retireSlot', cause)
  }
}

/**
 * Remove one entry from `pending_promises` — the only surgical operation on a `merge` slot, and
 * the only way an entry can ever leave it, because `mergePendingPromises` appends and never
 * discards (phase 5's ruling (c) rule 3).
 *
 * Written back as an admin row, which phase 5's stickiness then preserves through every later
 * merge — an honest record that a human touched this row. The removed `id` does not come back:
 * the merge matches candidates by `id`, and a fresh candidate only appears if the runner states
 * the promise again in a later turn, which is a new promise and should reappear.
 *
 * No retraction record is appended here, and that is deliberate: a promise is *structured state*
 * about a future obligation, not a claim about the runner, and phase 13 writes an outcome row when
 * one is met. Recording "the admin deleted a promise" as a ledger FACT would put a sentence about
 * app administration into Nina's memory of her friend.
 */
export async function removePendingPromiseAction(input: {
  userId: string
  promiseId: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = promiseRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a promise id.' }
  const { userId, promiseId } = parsed.data

  try {
    const slot = await adminReadSlot(userId, NINA_SLOT_PENDING_PROMISES)
    if (slot == null) return { ok: false, error: 'There are no pending promises to remove.' }

    const current = slot.value as NinaPendingPromisesSlot
    const promises = Array.isArray(current?.promises) ? current.promises : []
    const next = promises.filter((promise) => promise.id !== promiseId)
    if (next.length === promises.length) {
      return { ok: false, error: 'No promise with that id. Nothing changed.' }
    }

    await adminUpsertSlot(userId, {
      key: NINA_SLOT_PENDING_PROMISES,
      value: { promises: next } satisfies NinaPendingPromisesSlot,
    })
    revalidatePath('/admin/memory')
    return { ok: true, note: `Removed. ${next.length} promise(s) left.` }
  } catch (cause) {
    return failed('removePendingPromise', cause)
  }
}

/* ── the ledger ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Find one ledger row **without adding a query to phase 1's file.**
 *
 * There is no `getNinaMemoryFact(userId, id)` in phase 1's query module and this phase does not
 * add one: that file is phase 1's and this phase touches no file it owns. Instead the row is
 * looked up in the same window the page rendered (`ADMIN_LEDGER_PAGE` newest rows), which is by
 * construction the set of rows the admin could have clicked a button on. A row older than that
 * window is not editable from this page, and the page says so under the table.
 */
async function findFact(userId: string, id: string) {
  const rows = await adminReadFacts(userId, ADMIN_LEDGER_PAGE)
  return rows.find((row) => row.id === id) ?? null
}

/**
 * **The backdoor, literally** — R24's *"this way, i can add some important data of myself through a
 * backdoor in admin page"*. A ledger row with no message behind it: written as an admin row, with
 * a null `source_message_id`.
 *
 * It lands in `nina_memory_facts` and therefore in the newest 60 rows the context loader reads, so
 * **Nina reads it on her very next turn** with nothing else to do. No distillation pass, no cache,
 * no deploy. And the distiller imports neither of the two mutating ledger queries, so no
 * distillation can ever rewrite or remove it: the row is permanent by construction.
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
    revalidatePath('/admin/memory')
    return { ok: true, id: row.id, note: 'She reads this on her next turn.' }
  } catch (cause) {
    return failed('insertFact', cause)
  }
}

/**
 * In-place edit — **only for a row the admin already wrote** (§2). The eligibility check is
 * `factPermissions`, the same pure predicate the page used to decide whether to render the
 * button, so the UI and the server cannot disagree.
 *
 * A row the distiller wrote is refused here with its reason, not silently ignored, because the
 * refusal is the interesting part: *retract it instead, which keeps the original wording.*
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
    const row = await findFact(userId, id)
    if (row == null) return { ok: false, error: 'That row is not in the ledger window.' }

    const permissions = factPermissions(row)
    if (!permissions.canEditInPlace) return { ok: false, error: permissions.editNote }

    const updated = await adminUpdateFact(userId, id, { category, text, confidence })
    if (!updated) return { ok: false, error: 'Nothing was updated.' }

    revalidatePath('/admin/memory')
    return { ok: true, canonical: text, note: 'Updated in place.' }
  } catch (cause) {
    return failed('editFact', cause)
  }
}

/**
 * **Retract — the answer to "i can edit inaccurate / stale data", and the mechanism that keeps R4
 * and R24 from destroying each other.** Two statements, in this order and never the other:
 *
 *   1. APPEND an admin row whose text QUOTES the original verbatim (`composeRetraction`).
 *   2. DELETE the original row.
 *
 * What a reader sees afterwards: the wrong sentence is gone from the newest-60 window Nina reads,
 * and in its place is a row saying what was wrong and (if given) what is actually true, with the
 * old wording quoted inside it. Nothing was lost — the retraction row is itself append-only and
 * unreachable from the distiller, so it is now the permanent record of both the claim and its
 * correction.
 *
 * Why the delete is necessary rather than optional: `loadNinaContext` passes every one of the
 * newest 60 rows into the prompt and reads no `confidence` (§1). Leaving the bad row in place —
 * "superseded" only by a later row — means she is handed both sentences and has to guess, which is
 * not a correction. Deleting the row it quotes is what makes the retraction take effect.
 */
export async function retractFactAction(input: {
  userId: string
  id: string
  replacement: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factRetractSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a retraction this page can make.' }
  const { userId, id, replacement } = parsed.data

  try {
    const row = await findFact(userId, id)
    if (row == null) return { ok: false, error: 'That row is not in the ledger window.' }

    const text = composeRetraction({
      original: row.text,
      replacement,
      on: jakartaDayOf(new Date()),
    })

    // ── APPEND FIRST. The original's wording lives in this row before the row holding it goes. ──
    const record = await adminAppendFact(userId, {
      category: row.category,
      text,
      confidence: 100,
    })
    if (record == null) {
      return {
        ok: false,
        error:
          'Could not write the retraction, so the original was NOT removed. Nothing changed — ' +
          'which is the safe outcome. Try again.',
      }
    }

    const removed = await adminDeleteFact(userId, id)
    revalidatePath('/admin/memory')
    return {
      ok: true,
      id: record.id,
      note: removed
        ? 'Retraction recorded and the original row removed. Her next turn reads the correction.'
        : 'Retraction recorded. The original row was already gone.',
    }
  } catch (cause) {
    return failed('retractFact', cause)
  }
}

/**
 * **Purge — the one operation in this application that loses text.** No record, no quote, no
 * trace: the raw delete and nothing else.
 *
 * It exists because retract cannot serve one real case — text the runner wants *gone*, where a
 * retraction quoting it verbatim would defeat the request. It is gated on typing
 * `ADMIN_PURGE_CONFIRMATION` verbatim, it is named `purge` rather than "delete" so the UI never
 * offers it as the cheap-looking option next to retract, and the page labels it "loses the text
 * permanently".
 *
 * `isPurgeConfirmed` rather than a Zod literal, so the refusal can be a sentence that explains
 * itself instead of a field error.
 */
export async function purgeFactAction(input: {
  userId: string
  id: string
  confirm: string
}): Promise<AdminMemoryResult> {
  await requireAdmin()

  const parsed = factPurgeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a row this page can purge.' }
  const { userId, id, confirm } = parsed.data

  if (!isPurgeConfirmed(confirm)) {
    return {
      ok: false,
      error:
        'Type PURGE to confirm. This one deletes the text with no record — use Retract if you ' +
        'want the correction kept.',
    }
  }

  try {
    const removed = await adminDeleteFact(userId, id)
    if (!removed) return { ok: false, error: 'That row is no longer in the ledger.' }
    revalidatePath('/admin/memory')
    return { ok: true, note: 'Purged. Nothing about it survives.' }
  } catch (cause) {
    return failed('purgeFact', cause)
  }
}
