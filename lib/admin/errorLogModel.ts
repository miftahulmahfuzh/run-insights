/**
 * `/admin/error-logs`'s pure half — R2's row model, with no I/O and nothing importable-only-on-a-
 * server. `lib/admin/shortcutModel.ts` is the file this one copies, and its header carries the
 * rule: a `'use client'` table must not pull zod or a drizzle table module into the browser
 * bundle, so this module has ZERO value imports and every consumer of a raw row builds its items
 * on the server.
 *
 * ── WHY `ErrorLogSource` IS DECLARED HERE AND NOT IMPORTED FROM `lib/nina/errorlogs.ts` ──────
 * Phase 1 owns the table and the reader and does publish a row type (`NinaErrorLog`). This module
 * still does not import it, for the reason stated above rather than for want of a name:
 * `lib/nina/errorlogs.ts` imports `@/lib/db`, and a `'use client'` component imports THIS module.
 * A structural interface naming the eight columns the page renders keeps the value-import count at
 * zero and leaves `lib/nina/errorlogs.ts` named by exactly one file in this phase: the page. A
 * `NinaErrorLog` satisfies it structurally, so the reader's rows pass straight into
 * `buildErrorLogItems` with no adapter.
 *
 * ── THE TIMESTAMP IS FORMATTED ON THE SERVER, IN JAKARTA ────────────────────────────────────
 * Roadmap D6 fixes this app to Asia/Jakarta (`lib/date/ranges.ts:134-152` is where that decision
 * is spent for calendar days). A log row is an INSTANT, not a calendar day, so it does not go
 * through `jakartaDayOf` — but it is read by one operator in one timezone, and a client-side
 * `toLocaleString()` would render one string on the server and another in the browser. The
 * formatter below is module-level (constructing an `Intl.DateTimeFormat` per row is the classic
 * cost) and every item crosses the RSC boundary as a finished string.
 *
 * `Intl.DateTimeFormat` and not `Intl.NumberFormat`: `scripts/check-f08-boundaries.mjs` rule 3
 * bans the latter outside `lib/format.ts` because it is how a rendered MEASUREMENT gets
 * hand-rolled. A timestamp is not a measurement and `lib/date/ranges.ts` already formats dates
 * outside `lib/format.ts` for the same reason.
 */

/* ── the URL grammar ────────────────────────────────────────────────────────────────────────── */

export const ADMIN_ERROR_LOGS_PATH = '/admin/error-logs'

/**
 * One page of the list, and **it is 25 because that is the CEILING Phase 1's reader clamps `limit`
 * to** (`NINA_ERROR_LOG_PAGE_SIZE`, `lib/nina/errorlogs.ts`) — not merely its default. Asking for
 * more would render 25 rows while this page advanced its offset by the larger number, silently
 * skipping every row in between; that is a real defect, caught at reconciliation.
 *
 * The number is duplicated rather than imported on purpose: `lib/nina/errorlogs.ts` imports
 * `@/lib/db`, and this module's contract is ZERO value imports so no `'use client'` consumer can
 * drag drizzle into the browser bundle. **The two must move together** — Phase 1's ceiling first.
 *
 * 25 rows of 44px is ~1100px of scroll, and the payload behind it is not small: this list ships the
 * full input and the full error text with every row, because the popup is a dialog over props
 * rather than a second round trip. That is the argument the 25 was chosen for, one module over.
 */
export const ADMIN_ERROR_LOG_PAGE_SIZE = 25

/** A hand-typed `?page=` cannot ask the database for an offset no log will ever reach. */
export const ADMIN_ERROR_LOG_PAGE_CEILING = 1000

/**
 * The three sub-tabs, as a tuple so the type is derived from it and a fourth category cannot be
 * added to one half and forgotten in the other. `SHORTCUT_FIELDS`'s idiom.
 *
 * The order is the user's own: *"bagi jadi 3: Text # ... Multimodal # ... Image generation #"*.
 * `'text'` is first and is therefore the DEFAULT, which is what makes it the absent parameter
 * below.
 */
export const ADMIN_ERROR_CATEGORIES = ['text', 'multimodal', 'image_generation'] as const

export type AdminErrorCategory = (typeof ADMIN_ERROR_CATEGORIES)[number]

export const ADMIN_ERROR_CATEGORY_LABEL: Record<AdminErrorCategory, string> = {
  text: 'Text',
  multimodal: 'Multimodal',
  image_generation: 'Image generation',
}

/**
 * `searchParams` values are `string | string[] | undefined` — a repeated parameter arrives as an
 * array, and the first wins (`app/admin/nina/page.tsx:301`'s `readOne`, inlined here because this
 * page has exactly two parameters and both want their own validator anyway).
 *
 * Anything that is not one of the three literals reads as `'text'`. Not a security boundary —
 * `requireAdmin()` is — but a page that hands an unvalidated string to a query is a page that
 * will one day hand it something worse.
 */
export function readErrorCategory(raw: string | string[] | undefined): AdminErrorCategory {
  const value = Array.isArray(raw) ? raw[0] : raw
  const known = (ADMIN_ERROR_CATEGORIES as readonly string[]).includes(value ?? '')
  return known ? (value as AdminErrorCategory) : 'text'
}

/** 1-based, floored at 1, capped. Garbage reads as page 1. `readPage`'s rule, same numbers. */
export function readErrorLogPage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, ADMIN_ERROR_LOG_PAGE_CEILING)
}

/**
 * The one place a link into this page is spelled, so the tab strip and the pager cannot disagree.
 *
 * `hrefForFolder`'s grammar (`components/admin/FileExplorer.tsx:529`): **the default is the
 * ABSENCE of the parameter.** The Text tab is `/admin/error-logs` and page 1 has no `?page=`, so
 * the canonical URL and a navigated-back-to first page are the same URL.
 */
export function errorLogHref(category: AdminErrorCategory, page: number): string {
  const params = new URLSearchParams()
  if (category !== 'text') params.set('tab', category)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query === '' ? ADMIN_ERROR_LOGS_PATH : `${ADMIN_ERROR_LOGS_PATH}?${query}`
}

/* ── the row model ──────────────────────────────────────────────────────────────────────────── */

/**
 * The eight columns of phase 1's `NinaErrorLog` that this page renders, named structurally. See the
 * header for why this is declared and not imported.
 *
 * Two of phase 1's ten columns are deliberately absent. `category`: the page already knows which
 * tab it is rendering, and a field nothing reads is a field that drifts. `userId`: the list is not
 * user-scoped, and two of the three writers store NULL there by design (the text fallback client
 * and the vision describe path both observe failures with no runner in hand), so it would be a
 * mostly-empty column nobody could act on.
 */
export interface ErrorLogSource {
  id: string
  /** `'zai' | 'openrouter'` today. Rendered as free text, never branched on. */
  provider: string
  /** The model id the failed call named — R2's *"nama LLM"*. */
  model: string
  /** The full request payload actually sent, JSON-stringified upstream. R2's *"full input"*. */
  fullInput: string
  /** The raw provider error text. R2's *"full llm error message"*. */
  errorMessage: string
  /** The timeout that call was configured with, in ms. `null` when the failure was not a timeout
   *  path at all (or the writer had no number to hand). */
  timeoutMs: number | null
  /** The INPUT image: the photo she failed to describe, or the generation's anchor. Never an
   *  output — a failed generation produces none. `null` renders nothing at all. */
  imageUrl: string | null
  createdAt: Date
}

/**
 * **One row of `/admin/error-logs`.** Every field is a string or `null`: this crosses the RSC
 * boundary, and the page builds it precisely so `ErrorLogList.tsx` needs neither a `Date` nor a
 * drizzle module.
 */
export interface ErrorLogListItem {
  id: string
  /** `"12/09 07:31"`, Asia/Jakarta. The row's `shrink-0` left column. */
  stamp: string
  /** The full instant, for `<time dateTime>` and the hover title. */
  stampISO: string
  provider: string
  model: string
  fullInput: string
  /** `errorMessage` with the timeout line already folded in. See `composeErrorText`. */
  errorText: string
  imageUrl: string | null
}

/**
 * `en-GB` is not a locale preference: it is the widely-supported locale whose short date is
 * `dd/mm` and whose default hour cycle is h23, so `00:00` renders as `00:00` and not as the
 * `24:00` an explicit `hour12: false` produces under some ICU builds with other locales. The one
 * edit is the separating comma, dropped so the whole stamp is eleven characters — the width the
 * row's arithmetic in `ErrorLogList.tsx` is costed against.
 *
 * No year. The operator looks at this page the morning after an incident; a year would cost five
 * characters of the model name on a 375px screen to tell him something he knows.
 */
const ERROR_LOG_STAMP = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatErrorLogStamp(at: Date): string {
  return ERROR_LOG_STAMP.format(at).replace(',', '')
}

/**
 * `300000` -> `'300s'`, and `null` for anything that is not a positive finite number of
 * milliseconds. Seconds because that is the unit the user wrote the requirement in — *"perlu
 * ditambahkan nilai timeoutnya (misal 300s)"*.
 */
export function formatErrorTimeout(timeoutMs: number | null): string | null {
  if (timeoutMs === null || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return null
  return `${Math.round(timeoutMs / 1000)}s`
}

/**
 * R2's *"timeout juga dimasukin ke full llm error message, di kolom itu juga perlu ditambahkan
 * nilai timeoutnya"* — the timeout is not a column of its own, it is part of the error text.
 *
 * It goes FIRST rather than appended, because a provider error can be a several-kilobyte HTML
 * body and the number the operator came for must not be at the bottom of a scroll. A blank line
 * separates it so the raw text below is still verbatim and still selectable as one block.
 */
export function composeErrorText(errorMessage: string, timeoutMs: number | null): string {
  const timeout = formatErrorTimeout(timeoutMs)
  if (timeout === null) return errorMessage
  return `Timeout: ${timeout}\n\n${errorMessage}`
}

/**
 * Row -> prop, on the server. The repo's standing rule (`app/admin/nina/page.tsx:193`,
 * `app/admin/shortcuts/page.tsx:63`): a raw reader row carries `Date`s and columns the browser
 * has no use for, and none of it should cross the serialization boundary wholesale.
 */
export function toErrorLogListItem(row: ErrorLogSource): ErrorLogListItem {
  return {
    id: row.id,
    stamp: formatErrorLogStamp(row.createdAt),
    stampISO: row.createdAt.toISOString(),
    provider: row.provider,
    model: row.model,
    fullInput: row.fullInput,
    errorText: composeErrorText(row.errorMessage, row.timeoutMs),
    imageUrl: row.imageUrl,
  }
}

/** Already ordered newest-first by the reader's SQL. This maps; it never sorts. */
export function buildErrorLogItems(rows: readonly ErrorLogSource[]): ErrorLogListItem[] {
  return rows.map(toErrorLogListItem)
}
