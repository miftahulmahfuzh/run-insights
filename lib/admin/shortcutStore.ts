import 'server-only'

import type { ShortcutField, ShortcutSource } from '@/lib/admin/shortcutModel'
import { isUniqueViolation } from '@/lib/db/queries'
import {
  deleteNinaShortcut,
  insertNinaShortcut,
  listNinaShortcuts,
  updateNinaShortcut,
  type NinaShortcutRecord,
} from '@/lib/nina/queries'
import { normalizeNinaTrigger } from '@/lib/nina/shortcuts'

/**
 * **The only file in `/admin/shortcuts` that writes a shortcut row.**
 *
 * ── `match_key` AND `kind` ARE NOT USER INPUT — AND THEY ARE NOT THIS FILE'S EITHER ─────────
 * `match_key` is `normalizeNinaTrigger(trigger)` and `kind` is `classifyNinaTrigger(match_key)`.
 * They are DERIVED, and they are the two columns the matcher actually reads: `match_key` is the
 * unique index and the haystack comparison, `kind` selects the boundary rule. A row whose
 * `match_key` disagrees with its `trigger` is a shortcut that renders one thing in the admin table
 * and fires on another — invisible until the operator wonders why his emoji stopped working.
 *
 * `lib/nina/queries.ts` derives both, inside every write, from `trigger`. **`NinaShortcutInsert`
 * and `NinaShortcutPatch` have no field for either**, so this file could not supply a mismatched
 * key if it wanted to — the property `lib/admin/memoryStore.ts` states as *"a caller cannot
 * mislabel a row because there is nowhere to put the label"*, enforced by the type rather than by
 * this module remembering two function calls. `AdminShortcutDraft` likewise has three fields and
 * none of them is a derived column.
 *
 * That is why the only `normalizeNinaTrigger` call below is a QUESTION, not a derivation: *"does
 * what he typed survive folding?"* A trigger of nothing but variation selectors is a row that can
 * never match anything, and the operator deserves that as a sentence rather than as a mysterious
 * `not-null` failure. `classifyNinaTrigger` is not imported at all.
 *
 * ── THE READ IS `listNinaShortcuts(userId)`, BARE ───────────────────────────────────────────
 * Bare means EVERY row, disabled included, which is exactly this page's question — a disabled
 * shortcut is still a row the operator edits and re-enables, and hiding it would make "off" look
 * like "deleted". `{ onlyEnabled: true }` is the turn path's narrowing and this page does not pass
 * it. The record carries `uses` and `lastUsedAt` for the `Fired` column, so there is nothing left
 * for a second statement here to fetch and no second `WHERE` to keep `user_id`-first.
 *
 * What is done here is the ORDERING and the ceiling — see `adminReadShortcuts`.
 *
 * ── AND WHY A DUPLICATE IS CAUGHT, NOT CHECKED FOR ──────────────────────────────────────────
 * `(user_id, match_key)` is a unique index and `insertNinaShortcut` deliberately lets the violation
 * THROW (phase 1's ruling: *"a pre-flight SELECT would be correct until two tabs raced"*). A
 * pre-flight `SELECT … WHERE match_key = $2` races itself: two dispatches both read "free", both
 * insert, and the loser gets a 500 where it should have got a sentence.
 * `lib/db/.workflows/package_readme.md`'s rule, verbatim: *"Never check-then-insert against a
 * unique index. Catch `23505` via `isUniqueViolation`."*
 */

/* ── the vocabulary a caller is allowed ─────────────────────────────────────────────────────── */

/** What a person types. No `match_key`, no `kind`, no `uses` — see the header. */
export interface AdminShortcutDraft {
  trigger: string
  label: string
  expansion: string
}

/**
 * What every write here can report, and nothing else:
 *
 *   `'ok'`        — the statement landed.
 *   `'duplicate'` — the unique index refused it; that trigger already folds to a taken `match_key`.
 *   `'missing'`   — no row with that id, for that user. Someone deleted it in another tab.
 *   `'empty'`     — the trigger folds away to nothing (all variation selectors, or all whitespace).
 *
 * A union of four strings rather than a thrown error, because three of the four are things the
 * operator did and one sentence is the whole correct response to each. Anything that is NOT one of
 * these four is a real fault and is thrown, so `shortcutActions.ts`'s `failed()` logs it.
 */
export type AdminShortcutWrite = 'ok' | 'duplicate' | 'missing' | 'empty'

/**
 * The unique index a person can actually violate from this page. The other unique constraint on
 * this table is the primary key, and a `newId()` nanoid collision reported as "that trigger is
 * taken" would send the operator hunting for a row that does not exist.
 */
const MATCH_UNIQUE = 'nina_shortcuts_user_match_unq'

/** Walks `.constraint` through `.cause` / `.sourceError`, exactly as `isUniqueViolation` walks `.code`. */
function violatedConstraint(err: unknown): string | null {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { constraint?: unknown; cause?: unknown; sourceError?: unknown }
    if (typeof record.constraint === 'string') return record.constraint
    current = record.cause ?? record.sourceError
  }
  return null
}

/**
 * A 23505 that this page can explain. When the driver hands back a constraint name we use it; when
 * it does not — and the Neon HTTP driver does not always — we still answer yes, because
 * `(user_id, match_key)` is the only constraint a form on this page can reach.
 */
function isDuplicateTrigger(cause: unknown): boolean {
  if (!isUniqueViolation(cause)) return false
  const constraint = violatedConstraint(cause)
  return constraint === null || constraint === MATCH_UNIQUE
}

/**
 * `updateNinaShortcut` answers with the saved record or `null`; `deleteNinaShortcut` answers with a
 * boolean. Two shapes, one meaning, so two one-line readers rather than a union parameter that
 * would make `settle(false)` and `settle(null)` look like different questions.
 *
 * The record itself is discarded on purpose. `revalidatePath` re-renders the page from
 * `adminReadShortcuts` in the same response, so the row the table shows comes from the read and
 * never from a write's return value — one source of truth for what is on screen. (Phase 1 returns
 * the record because a caller MIGHT want it; this one does not.)
 */
function settleWrite(row: NinaShortcutRecord | null): 'ok' | 'missing' {
  return row === null ? 'missing' : 'ok'
}

function settleDelete(deleted: boolean): 'ok' | 'missing' {
  return deleted ? 'ok' : 'missing'
}

/* ── writes ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The add row. Three fields go down, and `insertNinaShortcut` derives the folded key and the
 * boundary rule inside the same statement that writes the row — so there is no window in which a
 * row exists with a stale key, and no way for this function to hand down a key that disagrees with
 * its own trigger.
 *
 * The `normalizeNinaTrigger` call here is a QUESTION and not a derivation: a trigger that folds
 * away to nothing (all whitespace, or nothing but variation selectors) can never match anything,
 * and the operator gets that as a sentence instead of a row that silently never fires. The key the
 * database actually stores is computed one layer down, from the same function.
 *
 * **A duplicate arrives as a THROW, not as a `null`.** Phase 1 lets the 23505 out on purpose —
 * `(user_id, match_key)` is the authority on "this code already exists" and a check-then-write
 * races itself. `insertNinaShortcut` resolves to a record or throws; there is no third outcome.
 */
export async function adminCreateShortcut(
  userId: string,
  draft: AdminShortcutDraft,
): Promise<AdminShortcutWrite> {
  if (normalizeNinaTrigger(draft.trigger).length === 0) return 'empty'

  try {
    await insertNinaShortcut(userId, {
      trigger: draft.trigger.trim(),
      label: draft.label,
      expansion: draft.expansion,
    })
    return 'ok'
  } catch (cause) {
    if (isDuplicateTrigger(cause)) return 'duplicate'
    throw cause
  }
}

/**
 * One cell. The `label` and `expansion` branches are a single-column UPDATE; the `trigger` branch
 * causes `updateNinaShortcut` to rewrite all three derived-and-derived-from columns together, and
 * is therefore the only one that can hit the unique index.
 *
 * The three branches are spelled out rather than built from a computed key (`{ [field]: value }`),
 * because a computed key widens to an index signature and the patch type stops checking anything —
 * and the patch type refusing the two derived columns is precisely the guarantee this page rests
 * on.
 */
export async function adminSaveShortcutField(
  userId: string,
  id: string,
  field: ShortcutField,
  value: string,
): Promise<AdminShortcutWrite> {
  if (field === 'label') {
    return settleWrite(await updateNinaShortcut(userId, id, { label: value }))
  }
  if (field === 'expansion') {
    return settleWrite(await updateNinaShortcut(userId, id, { expansion: value }))
  }

  if (normalizeNinaTrigger(value).length === 0) return 'empty'

  try {
    return settleWrite(await updateNinaShortcut(userId, id, { trigger: value.trim() }))
  } catch (cause) {
    if (isDuplicateTrigger(cause)) return 'duplicate'
    throw cause
  }
}

/**
 * On or off. It cannot collide and it cannot be empty, so its return type is narrower than the
 * other two — which is what lets `toggleShortcutAction` answer a refusal with one sentence instead
 * of a switch over states it can never see.
 */
export async function adminSetShortcutEnabled(
  userId: string,
  id: string,
  enabled: boolean,
): Promise<'ok' | 'missing'> {
  return settleWrite(await updateNinaShortcut(userId, id, { enabled }))
}

/** One click on the table's `✕`, and nothing survives it. Invariant 6. */
export async function adminDeleteShortcut(userId: string, id: string): Promise<'ok' | 'missing'> {
  return settleDelete(await deleteNinaShortcut(userId, id))
}

/* ── the read ───────────────────────────────────────────────────────────────────────────────── */

/**
 * Every shortcut this user has, **including the disabled ones**, newest first.
 *
 * ── ONE STATEMENT IN THE TREE, AND IT IS PHASE 1'S ──────────────────────────────────────────
 * `listNinaShortcuts(userId)` bare returns every row as a `NinaShortcutRecord` — the id, the
 * trigger, the folded key, the classification already narrowed to the union, the label, the
 * expansion, `enabled`, `uses`, `lastUsedAt`, `createdAt` and `updatedAt`. There is no column this
 * page renders that it lacks, so a second `SELECT` here would be the same read written twice, with
 * a second `WHERE` to keep `user_id`-first (invariant 5) and a second place for the column list to
 * fall behind the schema.
 *
 * The classification needs no ternary and no `as`: phase 1's `toShortcutRecord` is where the
 * `text` column becomes the union, and it re-derives an unrecognised value rather than trusting
 * it — the boundary this page would otherwise have had to guard itself.
 *
 * ── THE ORDERING AND THE CEILING ARE THIS PAGE'S, AND THEY ARE DONE IN MEMORY ───────────────
 * `listNinaShortcuts` sorts by the folded key because a registry is scanned by trigger. This page
 * wants **newest first**, because the add row sits at the top of the table and a row he just
 * created has to appear directly under the form that made it. Rather than widen phase 1's
 * signature with an `orderBy` an admin page would be the only caller of, the sort happens here:
 * the registry holds tens of rows, all of them already in memory and already capped by
 * `ADMIN_SHORTCUT_PAGE`.
 *
 * `createdAt DESC, id DESC` matches `listNinaMemoryFacts`: an import run writes several rows in
 * one statement and they share an instant, and `id` is a random nanoid — an arbitrary but STABLE
 * tiebreak, which is all a re-render needs to stop rows swapping places under a cursor. `sort` is
 * called on a fresh array (`[...rows]`) so nothing mutates what the query layer handed back.
 */
export async function adminReadShortcuts(userId: string, limit: number): Promise<ShortcutSource[]> {
  const rows = await listNinaShortcuts(userId)

  return [...rows]
    .sort((a, b) => {
      const byCreated = b.createdAt.getTime() - a.createdAt.getTime()
      if (byCreated !== 0) return byCreated
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
    })
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      trigger: row.trigger,
      matchKey: row.matchKey,
      kind: row.kind,
      label: row.label,
      expansion: row.expansion,
      enabled: row.enabled,
      uses: row.uses,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    }))
}
