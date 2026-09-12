import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaShortcuts } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  classifyNinaTrigger,
  normalizeNinaTrigger,
  type NinaShortcutKind,
} from '@/lib/nina/shortcuts'
import type { NinaShortcutInsert, NinaShortcutPatch, NinaShortcutRecord } from './shapes'

/**
 * The shortcut registry's statements (queries.ts §6b "Shortcuts — the trigger -> expansion
 * registry (F36)"): the list/insert/update/delete reads and writes plus the fire-and-forget
 * uses bump, with the private `shortcutColumns`, `toShortcutRecord` and `derivedTrigger`.
 *
 * Split out of `lib/nina/queries.ts` on 2026-09-12; that file remains the public barrel and
 * re-exports everything here, so no importer changes. Banner prose below moved byte-identical.
 *
 * The flat module `lib/nina/shortcuts.ts` is a DIFFERENT file — the zero-import, client-safe
 * matcher and vocabulary (`classifyNinaTrigger`, `normalizeNinaTrigger`, the length caps).
 * This is the persistence half; it imports the matcher from there. The mirror naming is
 * deliberate.
 *
 * Imports foundation-wards only — never the barrel `@/lib/nina/queries`. The layer-wide rules
 * on the barrel's header apply here unchanged.
 */
/* ---------------------------------------------------------------------------
 * §6b Shortcuts — the trigger -> expansion registry (F36)
 *
 * Memory-adjacent and deliberately NOT memory: see `nina_shortcuts`' header in
 * `lib/db/schema.ts`. Every statement below is `user_id`-scoped first, and `match_key` plus
 * `kind` are derived here rather than by any caller, so the unique index
 * `(user_id, match_key)` is guarding a key exactly one function knows how to spell.
 * -------------------------------------------------------------------------*/

const shortcutColumns = {
  id: ninaShortcuts.id,
  trigger: ninaShortcuts.trigger,
  matchKey: ninaShortcuts.matchKey,
  kind: ninaShortcuts.kind,
  label: ninaShortcuts.label,
  expansion: ninaShortcuts.expansion,
  enabled: ninaShortcuts.enabled,
  uses: ninaShortcuts.uses,
  lastUsedAt: ninaShortcuts.lastUsedAt,
  createdAt: ninaShortcuts.createdAt,
  updatedAt: ninaShortcuts.updatedAt,
}

/**
 * `nina_shortcuts.kind` is untyped `text` (the `nina_tuning.relationship` argument), so this is
 * where the column becomes a union. An unrecognised value is RE-DERIVED rather than rejected:
 * plan invariant 7 says nothing on the turn path throws for a shortcut problem, and a row hand-
 * edited in `db:studio` to `'Glyph'` should behave, not explode.
 */
function toShortcutRecord(row: {
  id: string
  trigger: string
  matchKey: string
  kind: string
  label: string
  expansion: string
  enabled: boolean
  uses: number
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): NinaShortcutRecord {
  const kind: NinaShortcutKind =
    row.kind === 'glyph' || row.kind === 'word' ? row.kind : classifyNinaTrigger(row.matchKey)
  return { ...row, kind }
}

/** `trigger` -> the derived `(match_key, kind)` pair, in the one place that derives it. */
function derivedTrigger(trigger: string): { matchKey: string; kind: NinaShortcutKind } {
  const matchKey = normalizeNinaTrigger(trigger)
  return { matchKey, kind: classifyNinaTrigger(matchKey) }
}

/**
 * The registry. **Phase 3's `/admin/shortcuts` calls it bare** and gets every row including the
 * disabled ones, because a disabled code still has to be visible to be re-enabled. **Phase 2's
 * turn path calls it with `{ onlyEnabled: true }`** and gets only what can fire, which is the
 * `nina_shortcuts_user_enabled_idx` read.
 *
 * Ordered by `match_key` and not by `created_at DESC`: a registry is scanned by trigger, and
 * `(user_id, match_key)` is UNIQUE, so that ordering is total on its own — the `id` tiebreak is
 * belt-and-braces for the same reason `listNinaMemoryFacts` carries one, namely that a prompt and
 * an admin table must both be reproducible.
 */
export async function listNinaShortcuts(
  userId: string,
  opts: { onlyEnabled?: boolean } = {},
): Promise<NinaShortcutRecord[]> {
  const where =
    opts.onlyEnabled === true
      ? and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.enabled, true))
      : eq(ninaShortcuts.userId, userId)

  const rows = await db
    .select(shortcutColumns)
    .from(ninaShortcuts)
    .where(where)
    .orderBy(asc(ninaShortcuts.matchKey), asc(ninaShortcuts.id))

  return rows.map(toShortcutRecord)
}

/**
 * Phase 3's add row, and phase 4's importer.
 *
 * **A duplicate trigger THROWS, and that is the design.** `(user_id, match_key)` is the authority
 * on "this code already exists"; a pre-flight `SELECT` would be correct until two tabs raced, so
 * the caller catches the unique violation and turns it into a sentence instead. The
 * `shares_run_id_active_unq` ruling, applied to a registry. Phase 4's importer wants the opposite
 * behaviour on a re-run and gets it with its own `onConflictDoNothing`, which is why this function
 * does not bake one in.
 */
export async function insertNinaShortcut(
  userId: string,
  input: NinaShortcutInsert,
): Promise<NinaShortcutRecord> {
  const { matchKey, kind } = derivedTrigger(input.trigger)

  const inserted = await db
    .insert(ninaShortcuts)
    .values({
      id: newId(),
      userId,
      trigger: input.trigger,
      matchKey,
      kind,
      label: input.label,
      expansion: input.expansion,
      enabled: input.enabled ?? true,
    })
    .returning(shortcutColumns)

  const row = inserted[0]
  if (row === undefined) throw new Error('insertNinaShortcut wrote no row')
  return toShortcutRecord(row)
}

/**
 * Phase 3's blur-to-save and its on/off switch. Returns the row rather than a boolean — unlike
 * `updateNinaMemoryFact`, whose caller only needs "did it exist" — because `match_key`, `kind` and
 * `updated_at` are all derived server-side and the admin table re-renders the values it did not
 * compute.
 *
 * An empty patch is a no-op that returns the row unchanged rather than `null`, so "nothing to
 * save" and "no such shortcut" stay distinguishable at the call site.
 *
 * `updated_at` moves via `$onUpdate`. It is NOT written explicitly here: the explicit write in
 * `upsertNinaMemorySlot` exists only because that statement has an INSERT path, and this one does
 * not.
 */
export async function updateNinaShortcut(
  userId: string,
  id: string,
  patch: NinaShortcutPatch,
): Promise<NinaShortcutRecord | null> {
  const derived = patch.trigger == null ? null : derivedTrigger(patch.trigger)
  const set = {
    ...(patch.trigger != null ? { trigger: patch.trigger } : {}),
    ...(derived != null ? { matchKey: derived.matchKey, kind: derived.kind } : {}),
    ...(patch.label != null ? { label: patch.label } : {}),
    ...(patch.expansion != null ? { expansion: patch.expansion } : {}),
    ...(patch.enabled != null ? { enabled: patch.enabled } : {}),
  }

  if (Object.keys(set).length === 0) {
    const current = await db
      .select(shortcutColumns)
      .from(ninaShortcuts)
      .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
      .limit(1)
    const row = current[0]
    return row === undefined ? null : toShortcutRecord(row)
  }

  const updated = await db
    .update(ninaShortcuts)
    .set(set)
    .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
    .returning(shortcutColumns)

  const row = updated[0]
  return row === undefined ? null : toShortcutRecord(row)
}

/**
 * Phase 3's ✕. A hard delete with no tombstone: a shortcut is a directive, and a deleted directive
 * that still exists somewhere is the failure this whole table was built to end. `false` means it
 * was already gone, or was never his — absent and forbidden are the same outcome in this file.
 */
export async function deleteNinaShortcut(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ninaShortcuts)
    .where(and(eq(ninaShortcuts.userId, userId), eq(ninaShortcuts.id, id)))
    .returning({ id: ninaShortcuts.id })
  return deleted.length > 0
}

/**
 * *"so the admin can see which codes actually fire"* — one statement, `uses = uses + 1` and
 * `last_used_at = now()`, for every id in one go.
 *
 * **Phase 2 calls this FIRE-AND-FORGET after the turn has already returned, and a rejection must
 * never fail a turn.** Plan invariant 7 lives at that call site — it is the caller that must
 * `.catch()` — but it is written here so the next person to reach for this function knows it is
 * telemetry and not bookkeeping the conversation depends on. Nothing reads `uses` on the turn
 * path.
 *
 * `uses` is incremented IN SQL rather than read-then-written: two turns can be in flight at once
 * (a background turn and a proactive sweep are a real pair) and a read-then-write loses one.
 * `upsertNinaNag`'s `count` is the precedent.
 *
 * Note that this ALSO moves `updated_at`, because `$onUpdate` fires on every drizzle update of the
 * table. See the schema header: `updated_at` is "the row last changed", never "the admin last
 * edited it".
 */
export async function bumpNinaShortcutUses(userId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return

  await db
    .update(ninaShortcuts)
    .set({ uses: sql`${ninaShortcuts.uses} + 1`, lastUsedAt: new Date() })
    .where(and(eq(ninaShortcuts.userId, userId), inArray(ninaShortcuts.id, [...ids])))
}
