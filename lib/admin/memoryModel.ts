import type { NinaFactCategory, NinaMemorySource } from '@/lib/db/schema'

/**
 * `/admin/memory`'s pure half — R1's row model, with no I/O and nothing importable-only-on-a-server.
 *
 * ── WHY THE VALUE-IMPORT BAN IS A RULE AND NOT AN ACCIDENT ─────────────────────────────────
 * `MemoryTable.tsx` is `'use client'` and needs the bounds and the category list.
 * `NINA_SLOT_SPECS` lives in `lib/nina/memory.ts`, which imports zod and (for
 * `NINA_SLOT_PENDING_PROMISES`) `lib/db/schema.ts` — a drizzle table module. Pulling that into a
 * browser bundle to render a label would be absurd. So the split is:
 *
 *   this file          — zero value imports, client-safe, the bounds and the row model
 *   `memoryVocab.ts`   — imports `NINA_SLOT_SPECS`; server-only in practice, used by the page,
 *                        the actions and the test, never by a component
 *
 * The page builds every row server-side and passes plain serializable props down, so the client
 * never needs the vocabulary at all — only the numbers and the strings below.
 */

/* ── bounds ─────────────────────────────────────────────────────────────────────────────────── */

/** A hand-typed fact. Same number as phase 5's `FACT_TEXT_MAX`, on purpose: one ledger, one cap. */
export const ADMIN_FACT_TEXT_MAX = 400

/** A slot value before canonicalisation. The specs cap the stored form tighter (120–240). */
export const ADMIN_SLOT_VALUE_MAX = 400

/** How much of the ledger the page renders. The table is unbounded; the page is not. */
export const ADMIN_LEDGER_PAGE = 200

/**
 * The seven `NinaFactCategory` values, as a tuple the table can iterate.
 *
 * Retyped rather than imported because importing it as a VALUE is impossible — `NinaFactCategory`
 * is a type union, not a const tuple. `satisfies` makes the compiler reject a typo, and the test
 * asserts the length, so an eighth category fails loudly here instead of silently missing from the
 * select.
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

/**
 * The same seven as a TYPE, derived from the tuple.
 *
 * This exists so `MemoryTable.tsx` can type its category state without importing anything from
 * `lib/db/schema.ts` — the test asserts that the table names that module nowhere, which is the
 * cheapest possible proof that no drizzle table definition can reach a browser bundle through it.
 */
export type AdminFactCategory = (typeof ADMIN_FACT_CATEGORIES)[number]

/* ── the vocabulary's two readings ──────────────────────────────────────────────────────────── */

/**
 * `'text'`       — the eight prose/scalar slots. Editable, canonicalised on save.
 * `'structured'` — a `merge`-policy slot (`pending_promises`). Its ENTRIES become rows of their
 *                  own; the key itself is never rendered as a row.
 * `'orphaned'`   — a key outside phase 5's nine. Deletable, never editable.
 */
export type SlotEditKind = 'text' | 'structured' | 'orphaned'

/**
 * What phase 5's ruling (c) does for this row:
 *
 *   `'deferred'` — an admin `replace` slot. The distiller's contradicting reading is dropped from
 *                  the slot write and appended to the ledger instead. The admin's value stands.
 *   `'sticky'`   — an admin `merge` slot. Entries are folded in and `source` stays admin.
 *   `'none'`     — a row the distiller wrote. The next distillation may replace it.
 */
export type SlotProtection = 'deferred' | 'sticky' | 'none'

/* ── the one row model ──────────────────────────────────────────────────────────────────────── */

/**
 * Which table a row came out of. It decides what an edit MEANS at the storage layer; it no longer
 * decides what the row LOOKS like, which is the whole of R1's *"one simple table"*.
 */
export type MemoryRowKind = 'slot' | 'promise' | 'fact'

/**
 * **One row of `/admin/memory`, whatever it is made of.** Three shapes across two tables — the
 * upserted slots, the append-only ledger, and the `pending_promises` entries — flattened into the
 * single serializable shape the table renders.
 *
 * Every field is a string, a number, a boolean or `null`: this crosses the RSC boundary, and the
 * page builds it precisely so `MemoryTable.tsx` needs neither zod nor a drizzle table module.
 */
export interface MemoryRow {
  /** React key, and the key of the table's per-row result map. `slot:goals`, `fact:<id>`, … */
  rowId: string
  kind: MemoryRowKind
  /** What an action names: the slot key, the promise id, or the fact id. */
  target: string
  /** The human title in the first column. `''` on a ledger row, where a `<select>` is the title. */
  label: string
  /** The machine token under the title. `''` on a ledger row. */
  code: string
  /** One line under the value: phase 5's own spec for a slot key, or a promise's terms. `''` if none. */
  hint: string
  /** The editable (or, on a promise, the displayed) text. `''` for a slot key with no row. */
  text: string
  /** `false` on a promise (structured) and on an orphaned key (every save would be refused). */
  editable: boolean
  /** Ledger rows only. `null` everywhere else, and the cell renders nothing. */
  category: AdminFactCategory | null
  /** Ledger rows only, integer percent 0–100. `null` everywhere else. */
  confidence: number | null
  /** `null` on a promise, and on a vocabulary key that has no row — nobody wrote it. */
  origin: NinaMemorySource | null
  /**
   * ISO 8601, or a Jakarta `YYYY-MM-DD` on a promise. The table renders the first ten characters,
   * which is the same day either way — a promise IS a day (roadmap D6) and a slot's instant is not.
   */
  at: string | null
  /** `false` only for a vocabulary key with no row: there is nothing to delete. */
  deletable: boolean
  /**
   * **`true` for a row that does not disappear when you delete it.** Only the eight closed
   * vocabulary slot keys: `(user_id, key)` is the primary key and the vocabulary is closed, so
   * deleting the row deletes the VALUE and the key comes straight back as a blank row. That is
   * correct behaviour, and the table has to say so or it reads as a failed delete. Everything else
   * — an orphaned key, a promise, a ledger row — is gone for good.
   */
  reappears: boolean
  /** One sentence about where the row came from and what the distiller will do about it. */
  note: string
}
