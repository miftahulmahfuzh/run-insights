import type { NinaFactCategory, NinaMemorySource } from '@/lib/db/schema'

/**
 * `/admin/memory`'s pure half — R24's semantics, with no I/O and nothing importable-only-on-a-server.
 *
 * ── WHY THE VALUE-IMPORT BAN IS A RULE AND NOT AN ACCIDENT ─────────────────────────────────
 * `MemorySlots.tsx` and `MemoryLedger.tsx` are `'use client'` and need the bounds, the category
 * list and the confirmation word. `NINA_SLOT_SPECS` lives in `lib/nina/memory.ts`, which imports
 * zod and (for `NINA_SLOT_PENDING_PROMISES`) `lib/db/schema.ts` — a drizzle table module. Pulling
 * that into a browser bundle to render a label would be absurd. So the split is:
 *
 *   this file          — zero value imports, client-safe, the bounds and the composers
 *   `memoryVocab.ts`   — imports `NINA_SLOT_SPECS`; server-only in practice, used by the page,
 *                        the actions and the test, never by a component
 *
 * The page computes every card server-side and passes plain serializable props down, so the client
 * never needs the vocabulary at all — only the numbers below.
 */

/* ── bounds ─────────────────────────────────────────────────────────────────────────────────── */

/** A hand-typed fact. Same number as phase 5's `FACT_TEXT_MAX`, on purpose: one ledger, one cap. */
export const ADMIN_FACT_TEXT_MAX = 400

/**
 * A composed retraction quotes the original (<= 400) and the replacement (<= 400) plus ~120
 * characters of boilerplate, so it is bounded by construction at well under this. The cap is here
 * so the bound is asserted rather than assumed — `tests/admin.memory.test.ts` proves the worst case.
 */
export const ADMIN_RETRACTION_TEXT_MAX = 1000

/** A slot value before canonicalisation. The specs cap the stored form tighter (120–240). */
export const ADMIN_SLOT_VALUE_MAX = 400

/** How much of the ledger the page renders. The table is unbounded; the page is not. */
export const ADMIN_LEDGER_PAGE = 200

/** Typed verbatim to purge a row. The one lossy operation in the app asks for a word, not a click. */
export const ADMIN_PURGE_CONFIRMATION = 'PURGE'

/**
 * The seven `NinaFactCategory` values, as a tuple the hand-insert form can iterate.
 *
 * Retyped rather than imported because importing it as a VALUE is impossible — `NinaFactCategory`
 * is a type union, not a const tuple, and phase 1 owns that file. `satisfies` makes the compiler
 * reject a typo, and the test asserts the length, so a phase-1 eighth category fails loudly here
 * instead of silently missing from the form.
 */
export const ADMIN_FACT_CATEGORIES = [
  'person',
  'preference',
  'body',
  'life',
  'goal',
  'training',
  'other',
] as const satisfies readonly NinaFactCategory[]

/* ── views ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * `'text'`       — the eight prose/scalar slots. Editable, canonicalised on save.
 * `'structured'` — a `merge`-policy slot (`pending_promises`). Read-only JSON plus per-entry removal.
 * `'orphaned'`   — a key outside phase 5's nine. Retire-only; see §4.
 */
export type SlotEditKind = 'text' | 'structured' | 'orphaned'

/**
 * What phase 5's ruling (c) does for this row, said in one word so the page can say it on screen:
 *
 *   `'deferred'` — an admin `replace` slot. The distiller's contradicting reading is dropped from
 *                  the slot write and appended to the ledger instead. The admin's value stands.
 *   `'sticky'`   — an admin `merge` slot. Entries are folded in and `source` stays admin.
 *   `'none'`     — a row the distiller wrote. The next distillation may replace it.
 */
export type SlotProtection = 'deferred' | 'sticky' | 'none'

/** A slot as the page renders it. Every field is serializable — this crosses to a client component. */
export interface SlotCard {
  key: string
  /** The stored value, already rendered to a display string by `getNinaMemorySlots`. `''` if absent. */
  value: string
  /**
   * `false` for one of phase 5's nine keys that has no row yet. Those are still rendered, as empty
   * cards — **typing into one is how a slot is inserted by hand**, which is half of R24's backdoor.
   * There is no separate "add a slot" form, because the vocabulary is closed and a form would
   * invite a tenth key.
   */
  present: boolean
  /** `null` when `present` is `false` — there is no row, so nobody wrote it. */
  origin: NinaMemorySource | null
  sourceMessageId: string | null
  /** ISO 8601, `null` when absent. A string renders identically on both sides of the boundary. */
  updatedAt: string | null
  inVocabulary: boolean
  editKind: SlotEditKind
  protection: SlotProtection
  label: string
  /** Phase 5's own one-line spec for the key, verbatim, or the orphan explanation. */
  hint: string
}

/** A ledger row as the page renders it. */
export interface FactCard {
  id: string
  category: NinaFactCategory
  text: string
  confidence: number
  origin: NinaMemorySource
  sourceMessageId: string | null
  createdAt: string
  canEditInPlace: boolean
  /** Why in-place editing is or is not offered — rendered as a tooltip, never invented in the UI. */
  editNote: string
}

export interface FactPermissions {
  canEditInPlace: boolean
  canRetract: boolean
  canPurge: boolean
  editNote: string
}

/* ── permissions ────────────────────────────────────────────────────────────────────────────── */

/**
 * §2's one rule: **in-place editing is for rows the admin typed, and nothing else.**
 *
 * A row the distiller wrote records what it read out of the message at `source_message_id`.
 * Rewriting its text makes it claim that message said something it did not — forged evidence, and
 * the end of being able to diagnose a bad distillation by re-reading the conversation. Retract
 * (which quotes the original and appends) is the correct correction for those, and it is always
 * available.
 */
export function factPermissions(row: {
  source: NinaMemorySource
  sourceMessageId: string | null
}): FactPermissions {
  if (row.source === 'admin') {
    return {
      canEditInPlace: true,
      canRetract: true,
      canPurge: true,
      editNote: 'You wrote this one. Editing it in place changes nothing that was ever a record.',
    }
  }
  return {
    canEditInPlace: false,
    canRetract: true,
    canPurge: true,
    editNote:
      'Distilled from a message. Editing the text would make it misquote that message — retract it ' +
      'instead, which keeps the original wording and records the correction.',
  }
}

/* ── the composers ──────────────────────────────────────────────────────────────────────────── */

export interface RetractionInput {
  /** The row's existing text, verbatim. This is the sentence R4 promised to keep. */
  original: string
  /** The truth, or `''` for a pure retraction ("this was simply wrong"). */
  replacement: string
  /** A Jakarta `YYYY-MM-DD` day. Passed in, so this function stays pure and testable. */
  on: string
}

/**
 * The retraction row's text. **This is what makes "edit a stale fact" non-destructive**: the
 * original wording is inside the new row before the old row is deleted (see
 * `retractFactAction`'s statement order).
 *
 * It is deliberately readable BY NINA and not a tombstone. She reads the newest 60 ledger rows
 * every turn (`MEMORY_FACT_LIMIT`), so this sentence is what she will know — and "that earlier note
 * was wrong, here is the truth" is strictly better than her having never seen the bad note. The
 * quotes around the original are what let her say *"gw pernah nyatet lo cuma lari weekend, ternyata
 * salah"* without inventing anything.
 */
export function composeRetraction({ original, replacement, on }: RetractionInput): string {
  const quoted = original.replace(/\s+/g, ' ').trim()
  const truth = replacement.replace(/\s+/g, ' ').trim()

  if (truth.length === 0) {
    return `Retracted by admin on ${on}: "${quoted}" was wrong or stale and no longer applies.`
  }
  return (
    `Corrected by admin on ${on}: ${truth} ` +
    `(This replaces an earlier note that said "${quoted}", which was wrong or stale.)`
  )
}

export interface SlotRetirementInput {
  key: string
  /** The slot's final value, verbatim. */
  value: string
  /** Optional; why it is going. `''` is fine. */
  reason: string
  on: string
}

/**
 * The record a retired slot leaves behind — §4. A slot removed without this is text lost, and a
 * slot is in Nina's prompt on every single turn (§1), so removing one is a real change to what she
 * knows and deserves a ledger entry saying so.
 */
export function composeSlotRetirement({ key, value, reason, on }: SlotRetirementInput): string {
  const quoted = value.replace(/\s+/g, ' ').trim()
  const why = reason.replace(/\s+/g, ' ').trim()
  const tail = why.length === 0 ? '' : ` Reason: ${why}`
  return `Retired by admin on ${on}: the memory slot "${key}" held "${quoted}" and was removed.${tail}`
}

/** The purge gate. Trimmed and case-sensitive: a lossy operation should be typed on purpose. */
export function isPurgeConfirmed(raw: string): boolean {
  return raw.trim() === ADMIN_PURGE_CONFIRMATION
}
