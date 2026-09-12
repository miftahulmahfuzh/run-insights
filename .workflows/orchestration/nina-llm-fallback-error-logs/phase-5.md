# Phase 5: Admin Error Logs page

**Plan set:** `NINA_LLM_FALLBACK_ERROR_LOGS_PLAN.md`
**Analysis:** `20260912-073115-KZHE_code_analyzer.md`
**Satisfies:** R2 — the operator gets a `/admin/error-logs` surface with three sub-tabs, one compact
row per failed LLM call, icon-button popups for the full input and the full error text, and a
full-screen image viewer on the rows that carry an image.
**Depends on:** Phase 1 (the `nina_error_logs` table and its paginated reader)
**Difficulty:** HARD
**Package:** `app/admin`, `components/admin`, `lib/admin`

---

## Goal

`/admin` gains a seventh nav cell, "Error logs", pointing at a new Server Component route that reads
one page of `nina_error_logs` per category and renders it as a list where **one log entry occupies
exactly one 44px row down to a 375px viewport** — timestamp and model on a single truncating line,
two (or three) 44×44 icon buttons pinned at the row's end. Tapping the first button opens a native
`<dialog>` with the full request payload; tapping the second opens the same dialog with the full
provider error text, with the configured timeout folded in as its first line; tapping the third (only
present when the row has an input image) opens the existing `PhotoViewer` full-screen overlay.

Nothing in this phase writes a row. It reads whatever Phases 2/3/4 have written — and renders an
empty state, correctly, when they have not landed yet.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**
- `lib/admin/errorLogModel.ts` — `ADMIN_ERROR_LOGS_PATH`, `ADMIN_ERROR_LOG_PAGE_SIZE`,
  `ADMIN_ERROR_LOG_PAGE_CEILING`, `ADMIN_ERROR_CATEGORIES`, `AdminErrorCategory` (type),
  `ADMIN_ERROR_CATEGORY_LABEL`, `readErrorCategory`, `readErrorLogPage`, `errorLogHref`,
  `ErrorLogSource` (type), `ErrorLogListItem` (type), `formatErrorLogStamp`, `formatErrorTimeout`,
  `composeErrorText`, `toErrorLogListItem`, `buildErrorLogItems`.
- `app/admin/error-logs/page.tsx` — default export `AdminErrorLogsPage`, `dynamic = 'force-dynamic'`.
- `components/admin/ErrorLogList.tsx` — `ErrorLogList` (`'use client'`).
- `components/admin/LogTextDialog.tsx` — `LogTextDialog` (`'use client'`).
- `lib/admin/errorLogModel.test.ts`, `components/admin/ErrorLogList.test.tsx`,
  `components/admin/LogTextDialog.test.tsx`.

**Signature changes:** none to any existing export.

**Modifies (shared files — reconciler, read this):**
- `components/admin/AdminNavLinks.tsx` — a 7th `LINKS` entry `{ href: '/admin/error-logs', label:
  'Error logs', short: 'Errors', icon: TriangleAlertIcon }`, a new `TriangleAlertIcon` function, and
  `grid-cols-6` -> `grid-cols-7` on the `<ul>`. **No other phase in this set touches this file.**
- `tests/admin.shell.test.ts` — six pinned counts move 6 -> 7 (see Step 6). **No other phase touches
  this file.**

**Requires (from earlier phases):**
- **Phase 1** exports, from `lib/nina/errorlogs.ts`, the paginated reader this page calls.
  **RECONCILED 2026-09-12 against Phase 1's plan file — this is its ACTUAL signature, and the three
  divergences the draft of this plan tolerated are now resolved in the code blocks below, not left
  to the implementer:**

  ```ts
  export async function listNinaErrorLogs(
    category: NinaErrorCategory,                       // 'text' | 'multimodal' | 'image_generation'
    opts?: { limit?: number; offset?: number },
  ): Promise<{ rows: NinaErrorLog[]; total: number }>

  export const NINA_ERROR_LOG_PAGE_SIZE = 25           // the DEFAULT **and the CEILING** on `limit`
  ```

  **There is NO `userId` parameter, and that is Phase 1's deliberate design, not an omission**: this
  is an admin-only, cross-user read, and Phase 1's module header spells out why it therefore does not
  live in the ownership-scoped `lib/nina/queries.ts`. The page's call drops the argument accordingly
  (Step 4), and `requireAdmin()` is no longer destructured, because nothing on this page needs the id.

  Each `NinaErrorLog` row (`typeof ninaErrorLogs.$inferSelect`) carries, with exactly this spelling:
  `id: string`, `userId: string | null`, `category: NinaErrorCategory`, `provider: string`,
  `model: string`, `fullInput: string`, `errorMessage: string`, `timeoutMs: number | null`,
  `imageUrl: string | null`, `createdAt: Date`. **`ErrorLogSource` (Step 1) names the eight of those
  this page renders**, and a row satisfies it structurally — `userId` and `category` are simply not
  read here (the tab already answers `category`, and the page is not user-scoped).

  `ErrorLogSource` stays declared **locally in `lib/admin/errorLogModel.ts` as a structural
  interface, not imported from `lib/nina/errorlogs.ts`.** That is still right even now that Phase 1's
  type name is known: `lib/nina/errorlogs.ts` imports `@/lib/db`, and `lib/admin/errorLogModel.ts`'s
  whole contract is ZERO value imports so a `'use client'` consumer cannot drag drizzle or zod into
  the browser bundle — `lib/admin/shortcutModel.ts`'s stated rule, which
  `tests/admin.shortcuts.test.ts` asserts structurally for its own page.

- **`ADMIN_ERROR_LOG_PAGE_SIZE` MUST NOT EXCEED Phase 1's `NINA_ERROR_LOG_PAGE_SIZE` (25).** That
  constant is the reader's ceiling, not just its default: `listNinaErrorLogs` clamps
  `opts.limit` to it. The draft of this plan asked for 50 and then paged by 50, which would have
  rendered 25 rows per page while advancing the offset by 50 — **every other row silently skipped**.
  Reconciled to 25 (Step 1). If the page size is ever to change, Phase 1's ceiling moves first.

**Leaves alone (owned by others):**
- `lib/db/schema.ts`, `drizzle/**`, `lib/nina/errorlogs.ts` (Phase 1)
- `lib/nina/turn.ts`, `lib/nina/llmFallbackText.ts` (Phase 2)
- `lib/nina/vision.ts` (Phase 3)
- `lib/nina/imagejobs.ts`, `lib/nina/imagerun.ts` (Phase 4)
- `components/ui/PhotoViewer.tsx`, `components/ui/DetailPanel.tsx`, `components/ui/index.ts` — read
  and reused, never edited. The barrel deliberately does not re-export `PhotoViewer`; this phase
  imports it by path, per that file's own header.
- `app/admin/page.tsx` (the hub) — see Handoffs.

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/errorLogModel.ts` | create | the pure half: URL grammar, category/page readers, the row model, the Jakarta timestamp, the timeout fold |
| `app/admin/error-logs/page.tsx` | create | Server Component: `requireAdmin()`, `?tab=`/`?page=`, the reader call, the tab strip, the pager, the empty state |
| `components/admin/ErrorLogList.tsx` | create | `'use client'` — the compact `<li>` flex rows, the three glyphs, the dialog/viewer state |
| `components/admin/LogTextDialog.tsx` | create | `'use client'` — the minimal read-only native `<dialog>`, no picture band |
| `components/admin/AdminNavLinks.tsx` | modify | line 47, line 51, after line 110 (7th `LINKS` entry), line 153 (`grid-cols-6` -> `grid-cols-7`), new `TriangleAlertIcon` after line 351 |
| `tests/admin.shell.test.ts` | modify | lines 111-118, 131-133, 141, 179, 189, 198, 294, 298-301 — six pinned 6s become 7s |
| `lib/admin/errorLogModel.test.ts` | create | pure unit tests for the model |
| `components/admin/ErrorLogList.test.tsx` | create | happy-dom: the row shape, the two popups, the image button's presence/absence |
| `components/admin/LogTextDialog.test.tsx` | create | happy-dom: `showModal`/`close`, Escape, backdrop click, focus, nothing rendered while shut |

---

## Implementation Steps

### Step 1: The pure model
**File:** `lib/admin/errorLogModel.ts` (new)
**Change:** Everything this page decides that is not I/O and not markup — so the page and the client
component share one URL grammar, one row shape and one timestamp, and so `ErrorLogList.tsx` names
exactly one module outside `components/` and that module has zero value imports. This is
`lib/admin/shortcutModel.ts`'s shape, borrowed whole.

**Code:**

```ts
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
```

**Impact:** New module, no existing importer. `ADMIN_ERROR_LOG_PAGE_SIZE` is not read by Phase 1 —
it is this page's mirror of Phase 1's `NINA_ERROR_LOG_PAGE_SIZE` ceiling, and Step 7a's test pins
that it never exceeds it.

---

### Step 2: The read-only popup
**File:** `components/admin/LogTextDialog.tsx` (new)
**Change:** One shared dialog serves both the full-input popup and the full-error popup — the only
difference is the title and the body string, which is exactly what a prop is for. Modelled on
`components/ui/DetailPanel.tsx:95-207`'s native-`<dialog>` mechanics and deliberately **not** on
`DetailPanel` itself, whose contract assumes a 4:3 picture band this has no use for, nor on `Sheet`,
whose contract assumes a form with a footer action.

It lives in `components/admin/` and not `components/ui/`: `components/admin/touch.ts:15-21` states
the rule — *"the UI barrel is a load-bearing bundle boundary, ten `'use client'` files import it, and
an operator-only concern does not join it on the strength of one phase."*

**Code:**

```tsx
'use client'

import * as React from 'react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * The full-input / full-error popup for `/admin/error-logs` — R2's *"full input di rownya perlu
 * dibikin jadi tombol icon aja. klik tombol ini baru pop up nunjukin full input text nya"*, and
 * the same sentence again for the error message.
 *
 * ── ONE COMPONENT, TWO CALLERS, BECAUSE THE ONLY DIFFERENCE IS TWO STRINGS ──────────────────
 * The input popup and the error popup are the same box around a different `body`. A second
 * component would be a second set of dialog mechanics to keep correct, and the mechanics are the
 * only hard part here.
 *
 * ── WHY A NATIVE `<dialog>`, AND WHY NOT `DetailPanel` OR `Sheet` ───────────────────────────
 * `DetailPanel.tsx`'s header makes the whole argument and it carries over unchanged: the UA
 * supplies the focus trap, initial focus, `aria-modal`, Escape-to-cancel, focus restoration on
 * close, and the backdrop, with no application code. `app/globals.css:185-194` styles
 * `dialog::backdrop` ELEMENT-WIDE (a literal rgba in both schemes, because `::backdrop` inherits
 * from nothing in older engines and a `backdrop:` utility would compile to a colour it cannot
 * see), so this dialog gets the same scrim for free.
 *
 * **Do not add `role="dialog" aria-modal="true"`.** A redundant explicit role on a native
 * `<dialog>` is a known screen-reader hazard — the same note `DetailPanel` carries.
 *
 * What is NOT borrowed is the picture band. `DetailPanel`'s `art` prop is its reason to exist and
 * there is no picture here; a component that took `art={null}` forever would be a component whose
 * contract lies about it. The image link on a row goes to `PhotoViewer` instead, which is the
 * full-screen viewer the user pointed at (*"kita udah punya fitur ini pas klik satu image di
 * /nina/about"*).
 *
 * ── THE CLOSE BUTTON IS FOCUSED EXPLICITLY, AND AFTER `showModal()` ─────────────────────────
 * `DetailPanel`'s hard-won detail, and it matters MORE here. `showModal()` picks the dialog's own
 * focus delegate — the first focusable AREA, which is not the first tab stop — and the body below
 * is a scroll container, which Chromium makes a focusable area on its own. Without the explicit
 * focus the panel would open announcing "scrollable region" with a focus ring drawn across it.
 * React's `autoFocus` is not the same thing and is the wrong thing: it fires on MOUNT, one commit
 * BEFORE this effect, so the dialog would record a child of its own as the element to restore
 * focus to and drop focus to `<body>` on close — losing the row the operator tapped.
 */
export function LogTextDialog({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean
  /** Names the dialog. `aria-labelledby` is wired internally so a caller cannot forget it. */
  title: string
  /** Rendered verbatim, wrapped, scrolling. Never truncated — the popup IS the full text. */
  body: string
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId()

  /*
   * `showModal()` and `close()` are imperative and this component is declarative, so exactly one
   * effect reconciles them. Both `el.open` guards are load-bearing: `showModal()` on an
   * already-open dialog throws `InvalidStateError`, and React 19 Strict Mode double-invokes
   * effects in development.
   */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      closeRef.current?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* Escape fires `cancel` and closes the element itself. Telling React about it is what keeps
         DOM state and component state from diverging — without this the dialog is shut but the
         caller's selection is still set, and the next tap on the same icon appears to do nothing. */
      onCancel={onClose}
      /* A click on the backdrop targets the <dialog> itself, because the panel is its child. This
         is the robust form; comparing pointer coordinates against a bounding box breaks when a
         text selection is dragged out of the panel and released over the backdrop — and this
         panel's whole content is text a reader will drag over. */
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      /* Wider than `DetailPanel`'s 360px cap: the body is a JSON payload or a stack trace, not a
         caption. `calc(100vw-2rem)` is 343px on a 375px screen and 382px on an XS Max, and the cap
         only bites on a desktop. `88dvh` and not `92dvh` because there is no picture band to
         justify the extra height, and `dvh` follows Safari's retracting toolbar. */
      className={cn(
        'm-auto max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[720px] overflow-hidden p-0',
        'rounded-card bg-card text-ink shadow-sheet',
      )}
    >
      {/* Nothing is rendered while closed. A `<dialog>` with `display: none` still has its subtree
          in the document, and a several-kilobyte provider error behind a shut panel is text a
          screen reader can reach in the reading order of every other element on the page. */}
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <h2
            id={titleId}
            className="shrink-0 px-5 pt-5 pb-3 text-[13px] leading-[1.35] font-semibold break-words text-ink"
          >
            {title}
          </h2>

          {/* The half that gives when the panel cannot fit the viewport; the title and the footer
              keep their size. `whitespace-pre-wrap` so a JSON payload's own newlines survive and
              `break-words` so one unbroken 4000-character token cannot widen the dialog instead of
              wrapping inside it — `components/admin/ImageGenPanel.tsx:836` is the same `<pre>` at
              the same size, with `break-words` added for the payloads this page shows. */}
          <pre className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-ink-2">
            {body}
          </pre>

          {/* `DetailPanel`'s footer verbatim: `pt-3` against the body, `1rem` plus the home-
              indicator inset below, and nothing edited so there is no rule above the button. */}
          <div className="shrink-0 px-5 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            <Button ref={closeRef} variant="secondary" size="md" fullWidth onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
```

**Impact:** New client component. `Button` forwards `ref` because `ButtonProps` extends
`React.ComponentProps<'button'>` (`components/ui/Button.tsx:30`) — the same call `DetailPanel.tsx:200`
already makes.

---

### Step 3: The compact list
**File:** `components/admin/ErrorLogList.tsx` (new)
**Change:** R2's hardest sentence — *"buat sedemikian rupa supaya satu row ditabel benar2 cuma makan
satu row di xsmax screen"*. A flex `<li>` row, not a `<table>`: the plan's Decisions row says so, and
the repo's one real admin `<table>` (`components/admin/ShortcutTable.tsx:151-152`) proves the point by
shipping `min-w-[460px]` inside an `overflow-x-auto` Card — it does not fit, it scrolls.

**THE WIDTH ARITHMETIC, DECIDED AND COSTED.** `NinaJobList.tsx:119-130` is the proven pattern (`min-w-0
truncate` on the shrinkable label, `shrink-0` on the fixed companion) but its row has TWO children.
This row has four, so the classes are not copied blind:

| | px |
|---|---|
| viewport (the narrow target; an XS Max is 414) | 375 |
| `app/admin/layout.tsx:170` — `pl-[calc(1rem+…)]` + `pr-[calc(1rem+…)]`, insets 0 in portrait | −32 |
| `<main className="min-w-0">` | **343** |
| the `<ul>`'s `border` both sides | −2 |
| the `<li>`'s `pl-3` (and **no** `pr`: the last icon's 44px box ends flush at the inner edge, which still leaves ~14px of visual air around an `size-4` glyph) | −12 |
| the single `gap-2` between the label block and the button group | −8 |
| three 44px buttons in one `shrink-0` group with **no gaps between them** | −132 |
| **left for the label block** | **189** |
| the `<time>` stamp, `shrink-0`, eleven tabular characters at 11px | −72 |
| its `gap-2` | −8 |
| **left for the model name before it truncates** | **109** (~18 characters at 12px semibold) |

Two collapsing decisions follow from that table and both are deliberate:

1. **Timestamp and model share ONE line, and the model truncates.** Stacking them would make the row
   two lines of text inside a 44px box, which reads as two rows and is what the requirement forbids.
   The model is the field that gives, because `z-ai/glm-5.3-flash` and `glm-5.3-flash` differ at their
   START — the provider slash is the first thing on screen and the tail is the part that repeats.
   Nothing is lost: the full value is the button's `title`, and every popup's own title spells
   `stamp · provider · model` in full.
2. **The buttons are grouped with no gap between them and pinned at the row's end.** Three 44px boxes
   is 132px of the 189px the label block would otherwise have; gaps between them would cost another
   16px of the model name to buy air two Lucide glyphs already have inside their own boxes.

The 44×44 floor is `components/admin/touch.ts`'s `TOUCH_ICON`, not a hand-rolled size —
`docs/design-brief.md`'s iOS minimum, spelled once. It holds on both axes at every width this page
sees.

**On the image button:** rendered ONLY when `imageUrl !== null`, and **nothing** — no placeholder, no
dimmed glyph — when it is null. That is `lib/nina/jobview.ts:510-523`'s already-shipped convention
(`planJobPhoto` returns `{ kind: 'none' }` and the job detail page draws no affordance): never a link
the server has not proved. It also means the Text tab's rows are 88px of buttons, not 132, and the
model gets 153px there.

**Code:**

```tsx
'use client'

import * as React from 'react'

import { LogTextDialog } from '@/components/admin/LogTextDialog'
import { TOUCH_ICON } from '@/components/admin/touch'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import type { ErrorLogListItem } from '@/lib/admin/errorLogModel'
import { cn } from '@/lib/cn'

/**
 * `/admin/error-logs`'s list — R2: *"biar tabelnya keliatan compact, buat sedemikian rupa supaya
 * satu row ditabel benar2 cuma makan satu row di xsmax screen"*.
 *
 * ── WHY A FLEX `<li>` AND NOT A `<table>` ───────────────────────────────────────────────────
 * This repo has exactly one proven "one row at any width" pattern and it is
 * `components/nina/NinaJobList.tsx:119-130`: a flex line with `min-w-0 truncate` on the label that
 * gives and `shrink-0` on the companions that must not. Its one real admin `<table>`
 * (`ShortcutTable.tsx:151`) is the counter-example — `min-w-[460px]` inside an `overflow-x-auto`
 * Card, which is a table that scrolls rather than a table that fits.
 *
 * The width budget at 375px is in this phase's plan file and it is the reason for two choices the
 * markup below would otherwise look arbitrary for: the stamp and the model share ONE truncating
 * line (stacking them is two lines of text in a 44px box, which reads as two rows), and the icon
 * buttons sit in one `shrink-0` group with NO gaps between them (each gap would cost ~2
 * characters of the model name to buy air the glyphs already have inside their 44px boxes).
 *
 * ── WHY IT IS A CLIENT COMPONENT ────────────────────────────────────────────────────────────
 * It holds two pieces of state and nothing else: which text is in the popup, and which photo the
 * viewer is showing. `NinaAboutScreen.tsx:495-501` is the pattern for the second — client-held
 * index, `<PhotoViewer>` rendered conditionally. Every prop is a string or `null`
 * (`lib/admin/errorLogModel.ts` builds the items on the server), so this file names one module
 * outside `components/` and that module has zero value imports: no drizzle table and no zod
 * schema is ever bundled for the browser.
 *
 * ── THE IMAGE BUTTON IS ABSENT, NOT DISABLED, WHEN THERE IS NO IMAGE ────────────────────────
 * `lib/nina/jobview.ts`'s `planJobPhoto` convention: never a link the server has not proved. A
 * Text row has no image by construction; a Multimodal row always has one; an Image-generation row
 * has one only when the job was anchored to a reference photo.
 */
export function ErrorLogList({ items }: { items: readonly ErrorLogListItem[] }) {
  /** Which text the popup is showing. `null` is "shut" — one state, two buttons. */
  const [detail, setDetail] = React.useState<{ title: string; body: string } | null>(null)
  /** An index into `photos` below, or `null` for "no viewer". `NinaAboutScreen`'s shape. */
  const [viewerIndex, setViewerIndex] = React.useState<number | null>(null)

  /**
   * Every image on this page, in row order, **deduplicated by URL** — so the viewer's swipe and
   * its dot row page through the whole page of logs rather than showing one photo in isolation.
   *
   * The dedupe is not tidiness: `PhotoViewer` keys its dot row by `p.url`
   * (`components/ui/PhotoViewer.tsx:269`), and the same photo failing to be described twice in one
   * night is the ORDINARY case for this table — two rows, one URL, two identical React keys.
   */
  const photos = React.useMemo<ViewerPhoto[]>(() => {
    const byUrl = new Map<string, ViewerPhoto>()
    for (const item of items) {
      if (item.imageUrl === null || byUrl.has(item.imageUrl)) continue
      byUrl.set(item.imageUrl, {
        url: item.imageUrl,
        /* `kind` is only the fallback name when `label` is absent, and it never is here. */
        kind: 'log',
        label: `${item.stamp} · ${item.model}`,
      })
    }
    return [...byUrl.values()]
  }, [items])

  return (
    <>
      {/* One sheet, one pair of rounded corners, one hairline between rows: `overflow-hidden`
          sits on the list so the first and last rows are clipped to the card radius, and each row
          carries its own `border-b` with `last:border-b-0` rather than a `divide-y` this repo
          does not use anywhere. */}
      <ul className="overflow-hidden rounded-card border border-rule bg-card">
        {items.map((item) => (
          <li
            key={item.id}
            /* `items-center`: the row's height comes from the 44px buttons, and the text is
               centred in it. `pl-3` only — see the header's width budget for why there is no
               right padding. */
            className="flex items-center gap-2 border-b border-rule pl-3 last:border-b-0"
          >
            {/* The half that gives. `min-w-0` is what lets `truncate` below actually truncate
                instead of blowing the row out; `flex-1` is what makes it take every pixel the
                button group does not. */}
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <time
                dateTime={item.stampISO}
                title={item.stampISO}
                className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums"
              >
                {item.stamp}
              </time>
              <span
                title={item.model}
                className="min-w-0 truncate text-[12px] font-semibold text-ink"
              >
                {item.model}
              </span>
            </span>

            {/* One group, no gaps. See the header. */}
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() =>
                  setDetail({
                    title: `Full input · ${item.stamp} · ${item.provider} · ${item.model}`,
                    body: item.fullInput,
                  })
                }
                /* The accessible name carries the row's identity, because the glyph is
                   `aria-hidden` decor and "Full input" alone would be one of fifty identical
                   names on this page. `PhotoGrid.tsx:133`'s rule. */
                aria-label={`Full input — ${item.model}, ${item.stamp}`}
                className={cn(TOUCH_ICON, 'text-ink-2')}
              >
                <FileTextIcon className="size-4" />
              </button>

              <button
                type="button"
                onClick={() =>
                  setDetail({
                    title: `Full error · ${item.stamp} · ${item.provider} · ${item.model}`,
                    body: item.errorText,
                  })
                }
                aria-label={`Full error — ${item.model}, ${item.stamp}`}
                /* The one coloured control in the row: this is the thing the operator came for.
                   `text-red` is the token `NinaJobList.tsx:133` paints a failed stage with. */
                className={cn(TOUCH_ICON, 'text-red')}
              >
                <TriangleAlertIcon className="size-4" />
              </button>

              {item.imageUrl !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const index = photos.findIndex((photo) => photo.url === item.imageUrl)
                    if (index >= 0) setViewerIndex(index)
                  }}
                  aria-label={`Open the image — ${item.model}, ${item.stamp}`}
                  className={cn(TOUCH_ICON, 'text-ink-2')}
                >
                  <ImageIcon className="size-4" />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <LogTextDialog
        open={detail !== null}
        title={detail?.title ?? ''}
        body={detail?.body ?? ''}
        onClose={() => setDetail(null)}
      />

      {/* R2's *"image link ... ketika di klik akan show the image in full screen. kita udah punya
          fitur ini pas klik satu image di /nina/about"* — literally that component, invoked the
          way that screen invokes it. `subject="foto"` for the same reason it does: "log
          screenshot" is not a thing. */}
      {viewerIndex !== null && photos[viewerIndex] != null && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          subject="foto"
        />
      )}
    </>
  )
}

/*
 * The three glyphs, inlined rather than imported — `components/admin/AdminNavLinks.tsx`'s ruling,
 * extended here the way `components/admin/photoIcons.tsx` extends it: **Lucide** (lucide-static,
 * ISC), copied verbatim with the four `stroke*` presentation attributes moved onto the root `svg`
 * where they inherit to every child. Every glyph takes `className` (the size belongs to the
 * caller — `size-4`, `photoIcons.tsx`'s number for an admin icon button) and is `aria-hidden`,
 * because the accessible name is the button's `aria-label`, never the picture.
 *
 * `TriangleAlertIcon` is also drawn in `AdminNavLinks.tsx`, and that duplication is deliberate:
 * that file's own header holds that its seven glyphs live in it, and the nav cell and the row
 * button mean the same thing and must therefore look the same. Three glyphs is not worth a
 * package and two copies of one path list is not worth a barrel.
 */

/** Full input: the request payload, drawn as the document it is. */
function FileTextIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}

/** Full error: the thing that went wrong. The nav cell's glyph, at row size. */
function TriangleAlertIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}

/** The input image — the photo she failed to describe, or the generation's anchor. */
function ImageIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  )
}
```

**Impact:** New client component. Imports `PhotoViewer` **by path** — `components/ui/index.ts:37-44`
deliberately does not re-export it, and that file's header explains why.

---

### Step 4: The page
**File:** `app/admin/error-logs/page.tsx` (new)
**Change:** The Server Component. `requireAdmin()` is the first statement, before `searchParams` is
even awaited (`lib/admin/requireAdmin.ts`'s stated rule, and `app/admin/nina/page.tsx:86`'s shape).
`dynamic = 'force-dynamic'` matches every other admin page.

The tab strip is three plain `<Link>`s and stays on the SERVER: this repo navigates by `?param=`
(`?view=`, `?folder=`, `?page=`, `?user=`), not by client state, and there is no `Tabs` component in
`components/ui/` to reuse — `components/ui/TabBar.tsx` is the runner's five-cell bottom navigation,
which `app/admin/layout.tsx:20-23` already refuses for this whole subtree.

The pager is `components/admin/explorer/PhotoGrid.tsx:177-211`'s *"‹ Newer / N–M of Total / Older ›"*
block, copied with `errorLogHref` in place of `hrefForPage` — including the disabled end keeping the
same box, so the row does not resize and the live control does not move under a thumb.

**Code:**

```tsx
import Link from 'next/link'

import { ErrorLogList } from '@/components/admin/ErrorLogList'
import { TOUCH_ICON, TOUCH_TARGET } from '@/components/admin/touch'
import { ButtonLink, EmptyState } from '@/components/ui'
import {
  ADMIN_ERROR_CATEGORIES,
  ADMIN_ERROR_CATEGORY_LABEL,
  ADMIN_ERROR_LOG_PAGE_SIZE,
  buildErrorLogItems,
  errorLogHref,
  readErrorCategory,
  readErrorLogPage,
  type AdminErrorCategory,
} from '@/lib/admin/errorLogModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { cn } from '@/lib/cn'
import { listNinaErrorLogs } from '@/lib/nina/errorlogs'

/**
 * `/admin/error-logs` — R2: *"tolong buat satu tab baru di admin page: Error logs, bagi jadi 3:
 * Text / Multimodal / Image generation"*, each *"log setiap failure call to LLM"* with timestamp,
 * full input, full LLM error message and model name (plus an image link on the last two).
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*`, so this call and the layout's are the only gates;
 * `app/admin/layout.tsx`'s header explains why both exist rather than one. This page has no
 * Server Action of its own — it is read-only, which is the third place that argument usually
 * lands.
 *
 * ── `force-dynamic`, AND ITS REASON HERE ────────────────────────────────────────────────────
 * Not `searchParams` (reading that already opts a page into dynamic rendering). The log table is
 * written by background work — `after()` turns, the vision describe path, the GitHub Actions image
 * backstop — none of which calls `revalidatePath`, so a cached render of this page would show an
 * operator a stale "no failures" while the streak he is chasing is still being written.
 *
 * ── WHY THE TABS ARE LINKS AND NOT CLIENT STATE ─────────────────────────────────────────────
 * `?tab=` is this repo's navigation idiom (`?view=`, `?folder=`, `?page=`, `?user=`), and the tab
 * a link carries is a tab the operator can bookmark, reload into and send to himself. There is no
 * `Tabs` component in `components/ui/` to reuse and `TabBar.tsx` is not one: it is the RUNNER's
 * five-cell bottom navigation, which `app/admin/layout.tsx` already refuses for this subtree on
 * the grounds that *"an admin tool that borrows it invites the runner to tap into it"*.
 *
 * ── ROW -> PROP HAPPENS HERE ────────────────────────────────────────────────────────────────
 * `buildErrorLogItems` turns every `Date` into two strings and drops the columns a browser has no
 * use for. `app/admin/shortcuts/page.tsx:63` and `app/admin/nina/page.tsx:193` make the same call
 * for the same reason: the client component receives plain serializable props and names no
 * `server-only` module.
 */

export const dynamic = 'force-dynamic'

export default async function AdminErrorLogsPage(props: PageProps<'/admin/error-logs'>) {
  /*
   * The gate, and NOTHING is destructured off it. `requireAdmin()` returns the admin's own
   * `userId`, but this page never uses one: `listNinaErrorLogs` takes no user parameter because the
   * error log is an operator's cross-user diagnostic read, not a runner's conversation. Binding an
   * unused `userId` here would be a lint error and, worse, would read as though the list were
   * scoped when it is not. See `lib/nina/errorlogs.ts`'s module header for the whole argument.
   */
  await requireAdmin()

  const params = await props.searchParams
  const category = readErrorCategory(params.tab)
  const page = readErrorLogPage(params.page)

  /* `limit` is ALSO Phase 1's ceiling (25). Asking for more returns 25 anyway, so a page size above
   * it would advance the offset past rows that were never rendered — see the constant's docblock. */
  const listed = await listNinaErrorLogs(category, {
    limit: ADMIN_ERROR_LOG_PAGE_SIZE,
    offset: (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE,
  })

  const items = buildErrorLogItems(listed.rows)
  const first = (page - 1) * ADMIN_ERROR_LOG_PAGE_SIZE + 1
  const last = Math.min(page * ADMIN_ERROR_LOG_PAGE_SIZE, listed.total)
  const lastPage = Math.max(1, Math.ceil(listed.total / ADMIN_ERROR_LOG_PAGE_SIZE))

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Error logs</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every LLM call that failed, newest first — the z.ai attempt and its OpenRouter retry are
          separate rows, because either can be the one that broke. The two icons open the full
          request and the full provider error; the timeout the call was given is the error text&rsquo;s
          first line.
        </p>
      </header>

      <TabStrip current={category} />

      {items.length === 0 ? (
        <EmptyState
          title={page > 1 ? 'Nothing on this page' : 'No failures logged'}
          description={
            page > 1
              ? 'This tab is not that long any more.'
              : 'Nothing has failed in this category since the log table started recording. That is the state you want.'
          }
          action={
            page > 1 ? (
              /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
                 invalid HTML and the barrel exports this exact component for this exact case. */
              <ButtonLink href={errorLogHref(category, 1)} size="md" variant="secondary">
                Go to the first page
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <ErrorLogList items={items} />

          {/* `PhotoGrid.tsx:177-211`'s pager, with this page's grammar. The disabled end keeps the
              same box, so the row does not resize and the live control does not move under a thumb
              when the page changes. */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-rule pt-3">
            {page > 1 ? (
              <Link
                href={errorLogHref(category, page - 1)}
                className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                rel="prev"
              >
                &lsaquo; Newer
              </Link>
            ) : (
              <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                &lsaquo; Newer
              </span>
            )}

            <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
              {first}&ndash;{last} of {listed.total}
            </span>

            {page < lastPage ? (
              <Link
                href={errorLogHref(category, page + 1)}
                className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-accent')}
                rel="next"
              >
                Older &rsaquo;
              </Link>
            ) : (
              <span className={cn(TOUCH_ICON, 'px-2 text-[12px] font-semibold text-ink-3')}>
                Older &rsaquo;
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * The three sub-tabs. Every tab links to page 1 of its own category — a page 3 of Text has no
 * meaning in Image generation, and `errorLogHref` spells that in one place so the strip and the
 * pager cannot disagree.
 *
 * `TOUCH_TARGET` (a 44px FLOOR, not a fixed height — `components/admin/touch.ts:11-13` explains
 * why a minimum and not `h-11`) rather than `TOUCH_ICON`: these are text pills, so only the
 * vertical axis needs the rule and the width comes from the label. The active pill is
 * `bg-accent-soft text-ink`, the same treatment `AdminNavLinks.tsx` gives its active cell at `lg`,
 * with `aria-current="page"` as the accessible half.
 *
 * `overflow-x-auto` on the row and `shrink-0` on each cell: the three labels measure ~285px at
 * 375px against 343px of `<main>`, so it never scrolls on the target device — but a shell that
 * *"does not clip its own overflow"* (`app/admin/layout.tsx`, pinned by `tests/admin.shell.test.ts`)
 * makes a child that could exceed its track responsible for scrolling inside itself.
 */
function TabStrip({ current }: { current: AdminErrorCategory }) {
  return (
    <nav aria-label="Error log category" className="mb-4">
      <ul className="flex gap-1 overflow-x-auto">
        {ADMIN_ERROR_CATEGORIES.map((category) => {
          const active = category === current
          return (
            <li key={category} className="shrink-0">
              <Link
                href={errorLogHref(category, 1)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  TOUCH_TARGET,
                  'flex items-center rounded-field px-3 text-[12px] font-semibold transition-colors',
                  active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-card hover:text-ink',
                )}
              >
                {ADMIN_ERROR_CATEGORY_LABEL[category]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

**Impact:** New route. `PageProps<'/admin/error-logs'>` is a globally available Next 16 helper whose
literal is minted by `next typegen` — which `npm run typecheck` runs first, so **run
`npm run typecheck`, not a bare `tsc --noEmit`**, or this line is an error about an unknown route
literal.

---

### Step 5: The seventh nav cell
**File:** `components/admin/AdminNavLinks.tsx` — four edits
**Change:** `LINKS` gains a 7th entry, the `<ul>` goes `grid-cols-6` -> `grid-cols-7`, one new glyph
is inlined, and two prose counts that say "six" are corrected.

**Note for whoever implements this:** the file's *other* counts already say seven — the `<ul>`
comment opens *"`h-14 grid-cols-7` — **one row of seven cells**"* and the glyph footer says *"The
seven glyphs"*. Those are stale in the opposite direction (the bar was seven routes before a surface
merge took it back to six, per `tests/admin.shell.test.ts:301`). **Do not "fix" them downward** — this
change makes them true again.

**5a.** `components/admin/AdminNavLinks.tsx:47` — the header's route count.

```
 * The match itself: `/admin` is compared EXACT — a prefix match there would mark every cell
 * active — and every other href by prefix, so a route keeps its cell through whatever nested
 * paths grow under it later. All seven routes are flat today; `startsWith` is the forward-safe
 * spelling, not a current necessity.
```

(Only the word `six` -> `seven` on that third line.)

**5b.** `components/admin/AdminNavLinks.tsx:52` — the `LINKS` preamble's first line.

```
/**
 * The seven routes, longest label first in each pair.
```

**5c.** `components/admin/AdminNavLinks.tsx:110-111` — the 7th entry, appended after `/admin/shortcuts`
and before the closing `] as const`. The Shortcuts comment above it currently claims that route *"goes
LAST"*; that clause is replaced, because appending after it makes the sentence false and a comment
that lies is worse than one that is missing.

Replace:

```ts
  /*
   * `nina-emoji-shortcuts` R1's route, and it goes LAST because it is the newest surface and
   * Memory is the one it grew out of: most of the rows in the production memory ledger were
   * shortcuts written in prose, for want of anywhere else to put them, and this page is where they
   * stop being that. Adjacency to Memory is the whole of what tells the operator these two are
   * related.
```

with:

```ts
  /*
   * `nina-emoji-shortcuts` R1's route, and it sits directly after Memory because Memory is the one
   * it grew out of: most of the rows in the production memory ledger were shortcuts written in
   * prose, for want of anywhere else to put them, and this page is where they stop being that.
   * Adjacency to Memory is the whole of what tells the operator these two are related. (It was the
   * LAST cell until `nina-llm-fallback-error-logs` R2 appended the diagnostics tab below.)
```

and append, after the `/admin/shortcuts` line:

```ts
  /*
   * `nina-llm-fallback-error-logs` R2: *"tolong buat satu tab baru di admin page: Error logs"*.
   *
   * It goes LAST, and not beside Memory or Shortcuts, because it is the only cell in this bar that
   * is not a thing the operator EDITS. The first six are two pairs of configuration surfaces and
   * two collections he curates; this one is a read-only record of what the providers did to him
   * overnight, and it belongs at the end of the bar the way a log belongs at the end of a console.
   *
   * The phone name is "Errors" — a true short form of the label rather than an invented
   * abbreviation, and distinct from "Images" and "Photos", which is the property
   * `tests/admin.shell.test.ts` pins (two cells announcing the same name would make one of them
   * ambiguous to a screen reader).
   */
  { href: '/admin/error-logs', label: 'Error logs', short: 'Errors', icon: TriangleAlertIcon },
```

**5d.** `components/admin/AdminNavLinks.tsx:153` — the row's grid.

```tsx
    <ul className="mx-auto grid h-14 w-full max-w-[470px] grid-cols-7 px-[7px] lg:mx-0 lg:block lg:h-auto lg:max-w-none lg:space-y-1 lg:px-0">
```

**The breakpoint check, done rather than assumed.** `h-14` does not move, so
`app/admin/layout.tsx`'s `pb-[calc(5rem+var(--safe-bottom))]` reserve stays correct (80px against the
bar's 57px border box). The row is `max-w-[470px] mx-auto` with `px-[7px]`, so a cell is
`(min(width, 470) − 14) / 7`:

| viewport | cell width | 44pt floor |
|---|---|---|
| 375 (narrow phone) | 51.6px | ✓ |
| 414 (XS Max portrait, the target) | 57.1px | ✓ |
| 470 (the cap, and any width above it) | 65.1px | ✓ |
| 896 (XS Max landscape — still below `lg`, so still the bar) | 65.1px (capped) | ✓ |
| ≥1024 (`lg`) | n/a — `lg:block` takes the list out of grid layout entirely and `grid-cols-7` is inert, exactly as `grid-cols-6` was | ✓ |

The glyph is 24px, so the air each side is 13.8px at 375 and 16.6px at 414. Nothing wraps, nothing
clips, and no breakpoint needs a second grid.

**5e.** `components/admin/AdminNavLinks.tsx` — the new glyph, appended after `ZapIcon` (line 351), so
the seven functions stay in `LINKS` order.

```tsx
/** Errors: the record of what the providers did overnight. */
function TriangleAlertIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
```

**Impact:** The active-cell match needs no change — `/admin/error-logs` is matched by
`pathname.startsWith(link.href)` and collides with no other href. Three `tests/admin.shell.test.ts`
regexes scan this WHOLE file (`/href: '(\/admin[^']*)'/g`, `/short: '([^']*)'/g`, `/<svg\b[\s\S]*?>/g`),
so the new comments above must not contain the strings `href: '/admin…'` or `short: '…'` — the text in
5c does not.

---

### Step 6: Move the pinned counts
**File:** `tests/admin.shell.test.ts` — six assertions and their prose
**Change:** This suite pins the bar's cell count exactly, on purpose ("a bar that regains a second row
needs the layout's reserve to grow with it"). Step 5 is the deliberate change; these are its
counterparts. **This is not test-weakening — every assertion keeps its exact-fit form.**

**6a.** line 111-118 — the route list.

```ts
    expect(hrefs).toEqual([
      '/admin',
      '/admin/nina',
      '/admin/personality',
      '/admin/image-generation',
      '/admin/memory',
      '/admin/shortcuts',
      '/admin/error-logs',
    ])
```

**6b.** lines 131-133 + 141 — the accessible-name count and the arithmetic in its comment.

```ts
     * and a glyph has no character count (the row is seven cells now, 414px / 7 = 59.1px, still
     * past the 44pt floor with 15px to spare). What the new role still needs caught: seven
     * entries, one per cell
```

```ts
    expect(shorts).toHaveLength(7)
```

**6c.** line 179 — one glyph per cell.

```ts
    expect(svgTags, 'the bar no longer inlines one glyph per cell').toHaveLength(7)
```

**6d.** line 189 + 198 — the distinctness case, its name and its number.

```ts
  it('inlines seven DISTINCT glyphs', () => {
```

```ts
    expect(new Set(glyphs).size, 'two cells render the same glyph').toBe(7)
```

**6e.** line 294 — the exact-fit case's name. Its assertion (`toBe(cellCount)`) is DERIVED and needs no
edit; only the title says a number.

```ts
  it('is one row of exactly seven cells', () => {
```

and, inside its comment block (lines 298-301), the last sentence of the first paragraph:

```ts
     * un-reject the one-row layout, and the surface merge took the bar back to six routes -- so
     * every cell was spoken for again and the fit became exact. `nina-llm-fallback-error-logs` R2
     * adds the seventh, which is the layout this argument was originally costed for: 414px / 7 =
     * 59.1px a cell, a width a 24px glyph wears with 17.5px of air before the row's own
     * `px-[7px]` dial takes one pixel off each side.
```

**Impact:** `it('gives every cell a tap target past the 44pt minimum, on both axes')` needs NO edit —
it computes `(414 - rowPad) / Number(bar![2])` and `(414 − 14) / 7 = 57.1 ≥ 44` passes. Likewise
`it('reserves more room than the bar occupies')`: `h-14` and the `5rem` reserve are both unchanged.

---

### Step 7: Tests for the new code
**Files:** `lib/admin/errorLogModel.test.ts`, `components/admin/ErrorLogList.test.tsx`,
`components/admin/LogTextDialog.test.tsx` (all new)
**Change:** `vitest.config.ts` collects `lib/**/*.test.ts` and `components/**/*.test.tsx` (note: only
`.tsx` under `components/`). The component suites declare happy-dom per file, as every sibling does.

**None of these tests needs a `nina_error_logs` row, a database, or Phases 2/3/4.** The model tests
build `ErrorLogSource` literals by hand and the component tests build `ErrorLogListItem` literals by
hand, which is what makes this phase reviewable the moment Phase 1's reader signature is fixed. For a
real end-to-end look at the page, seed rows directly with Phase 1's `logNinaError` writer from a
`node --env-file=.env.local` one-liner (see Verification) — never by waiting for a real LLM failure.

**7a. `lib/admin/errorLogModel.test.ts`:**

```ts
import { describe, expect, it } from 'vitest'

import {
  ADMIN_ERROR_CATEGORIES,
  ADMIN_ERROR_LOGS_PATH,
  ADMIN_ERROR_LOG_PAGE_CEILING,
  ADMIN_ERROR_LOG_PAGE_SIZE,
  buildErrorLogItems,
  composeErrorText,
  errorLogHref,
  formatErrorLogStamp,
  formatErrorTimeout,
  readErrorCategory,
  readErrorLogPage,
  toErrorLogListItem,
  type ErrorLogSource,
} from '@/lib/admin/errorLogModel'

/**
 * `/admin/error-logs`'s pure half — R2's exit criteria that do not need a browser.
 *
 * `tests/admin.shortcuts.test.ts` is the file this one copies: the row model is asserted whole
 * with `toEqual` rather than field by field, so a column added to the item without a reason shows
 * up as a failing test rather than as a silently wider payload.
 */

const SOURCE: ErrorLogSource = {
  id: 'e1',
  provider: 'zai',
  model: 'glm-5.3-flash',
  fullInput: '{"system":"…","messages":[]}',
  errorMessage: 'Connection error.',
  timeoutMs: 22_000,
  imageUrl: null,
  createdAt: new Date('2026-09-12T00:31:15Z'),
}

describe('the URL grammar', () => {
  it('makes the default tab and the first page the ABSENCE of a parameter', () => {
    // The canonical /admin/error-logs and a navigated-back-to first page are the same URL —
    // hrefForFolder's rule, which is why the tab strip and the pager share this one function.
    expect(errorLogHref('text', 1)).toBe(ADMIN_ERROR_LOGS_PATH)
  })

  it('spells the other two tabs and every page past the first', () => {
    expect(errorLogHref('multimodal', 1)).toBe('/admin/error-logs?tab=multimodal')
    expect(errorLogHref('text', 3)).toBe('/admin/error-logs?page=3')
    expect(errorLogHref('image_generation', 2)).toBe(
      '/admin/error-logs?tab=image_generation&page=2',
    )
  })

  it('names the three categories once, in the order the user wrote them', () => {
    expect(ADMIN_ERROR_CATEGORIES).toEqual(['text', 'multimodal', 'image_generation'])
  })
})

describe('reading the parameters', () => {
  it('takes the first value of a repeated parameter and falls back to text', () => {
    expect(readErrorCategory('multimodal')).toBe('multimodal')
    expect(readErrorCategory(['image_generation', 'text'])).toBe('image_generation')
    expect(readErrorCategory(undefined)).toBe('text')
    expect(readErrorCategory('../../etc')).toBe('text')
    expect(readErrorCategory([])).toBe('text')
  })

  it('floors the page at 1 and caps it, so no offset can be asked for that no log reaches', () => {
    expect(readErrorLogPage(undefined)).toBe(1)
    expect(readErrorLogPage('0')).toBe(1)
    expect(readErrorLogPage('-4')).toBe(1)
    expect(readErrorLogPage('nonsense')).toBe(1)
    expect(readErrorLogPage('3')).toBe(3)
    expect(readErrorLogPage('99999999')).toBe(ADMIN_ERROR_LOG_PAGE_CEILING)
  })

  it('renders one bounded page', () => {
    expect(ADMIN_ERROR_LOG_PAGE_SIZE).toBe(25)
  })

  it('never asks the reader for more rows than the reader will return', async () => {
    /*
     * The guard for the one duplicated number in this phase. `listNinaErrorLogs` CLAMPS `limit` to
     * `NINA_ERROR_LOG_PAGE_SIZE`, so a page size above it would render fewer rows than the offset
     * advances by and skip everything in between — silently, since nothing errors. The constant is
     * duplicated rather than imported by `errorLogModel.ts` (zero value imports, so no `'use
     * client'` consumer drags drizzle into the bundle); this test is what makes that duplication
     * safe. Imported dynamically so the module under test keeps its own import graph clean.
     */
    const { NINA_ERROR_LOG_PAGE_SIZE } = await import('@/lib/nina/errorlogs')
    expect(ADMIN_ERROR_LOG_PAGE_SIZE).toBeLessThanOrEqual(NINA_ERROR_LOG_PAGE_SIZE)
  })
})

describe('the timestamp', () => {
  it('is Asia/Jakarta, eleven characters, and has no year', () => {
    // 00:31 UTC on the 12th is 07:31 the same day in Jakarta (UTC+7, no DST, ever).
    expect(formatErrorLogStamp(new Date('2026-09-12T00:31:15Z'))).toBe('12/09 07:31')
    expect(formatErrorLogStamp(new Date('2026-09-12T00:31:15Z'))).toHaveLength(11)
  })

  it('crosses the date line into Jakarta rather than reporting the UTC day', () => {
    // The incident this plan set follows from started at 22:29 UTC on the 11th, which is 05:29 on
    // the 12th where the operator reads it.
    expect(formatErrorLogStamp(new Date('2026-09-11T22:29:41Z'))).toBe('12/09 05:29')
  })

  it('renders midnight as 00:00 and not as 24:00', () => {
    expect(formatErrorLogStamp(new Date('2026-09-11T17:00:00Z'))).toBe('12/09 00:00')
  })
})

describe('the timeout fold', () => {
  it('turns milliseconds into the seconds the requirement is written in', () => {
    expect(formatErrorTimeout(300_000)).toBe('300s')
    expect(formatErrorTimeout(22_000)).toBe('22s')
    expect(formatErrorTimeout(25_500)).toBe('26s')
  })

  it('has nothing to say about a failure that was not given a timeout', () => {
    expect(formatErrorTimeout(null)).toBeNull()
    expect(formatErrorTimeout(0)).toBeNull()
    expect(formatErrorTimeout(Number.NaN)).toBeNull()
  })

  it('puts the number FIRST, so a kilobyte of provider HTML cannot bury it', () => {
    expect(composeErrorText('504 Gateway Timeout', 300_000)).toBe(
      'Timeout: 300s\n\n504 Gateway Timeout',
    )
  })

  it('leaves the provider text exactly as it was when there is no timeout to add', () => {
    expect(composeErrorText('401 Unauthorized', null)).toBe('401 Unauthorized')
  })
})

describe('toErrorLogListItem', () => {
  it('turns the Date into two strings, folds the timeout in, and changes nothing else', () => {
    expect(toErrorLogListItem(SOURCE)).toEqual({
      id: 'e1',
      stamp: '12/09 07:31',
      stampISO: '2026-09-12T00:31:15.000Z',
      provider: 'zai',
      model: 'glm-5.3-flash',
      fullInput: '{"system":"…","messages":[]}',
      errorText: 'Timeout: 22s\n\nConnection error.',
      imageUrl: null,
    })
  })

  it('carries an image URL through untouched, and a null as a null', () => {
    const withPhoto = { ...SOURCE, imageUrl: 'https://blob.example/nina/a.jpg' }
    expect(toErrorLogListItem(withPhoto).imageUrl).toBe('https://blob.example/nina/a.jpg')
    expect(toErrorLogListItem(SOURCE).imageUrl).toBeNull()
  })

  it('maps and never sorts — the reader already ordered these newest-first', () => {
    const older = { ...SOURCE, id: 'e0', createdAt: new Date('2026-09-11T00:31:15Z') }
    expect(buildErrorLogItems([SOURCE, older]).map((item) => item.id)).toEqual(['e1', 'e0'])
  })
})
```

**7b. `components/admin/ErrorLogList.test.tsx`:**

```tsx
// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ErrorLogList } from './ErrorLogList'
import type { ErrorLogListItem } from '@/lib/admin/errorLogModel'

/**
 * `/admin/error-logs`'s list — R2's behaviours, the ones a width cannot be asserted for.
 *
 * **What is NOT asserted here: the pixel fit.** No test in this repo can see a media query or a
 * flex overflow — `tests/admin.shell.test.ts`'s header says so at length, and happy-dom has zero
 * layout. The one-row property is held by the class SHAPE (`min-w-0 truncate` on the label that
 * gives, `shrink-0` on the companions that must not) plus the arithmetic in this phase's plan
 * file, and confirmed by eye at 375px. What IS asserted is everything the shape depends on:
 * exactly one row element per item, the truncating label present, the buttons named, and the
 * image button ABSENT rather than disabled when there is no image.
 */

const BASE: ErrorLogListItem = {
  id: 'e1',
  stamp: '12/09 07:31',
  stampISO: '2026-09-12T00:31:15.000Z',
  provider: 'zai',
  model: 'glm-5.3-flash',
  fullInput: 'SYSTEM: you are Nina\nUSER: halo',
  errorText: 'Timeout: 22s\n\nConnection error.',
  imageUrl: null,
}

const WITH_PHOTO: ErrorLogListItem = {
  ...BASE,
  id: 'e2',
  stamp: '12/09 05:29',
  provider: 'openrouter',
  model: 'z-ai/glm-5.3-flash',
  imageUrl: 'https://blob.example/nina/a.jpg',
}

describe('the row', () => {
  it('renders one list item per log entry and nothing else', () => {
    render(<ErrorLogList items={[BASE, WITH_PHOTO]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps the stamp machine-readable and the model on the same line', () => {
    render(<ErrorLogList items={[BASE]} />)
    const stamp = screen.getByText('12/09 07:31')
    expect(stamp.tagName).toBe('TIME')
    expect(stamp.getAttribute('dateTime')).toBe('2026-09-12T00:31:15.000Z')
    // The label that gives. `truncate` is the whole one-row mechanism; `title` is what makes a
    // truncated model name still answerable with a pointer.
    const model = screen.getByTitle('glm-5.3-flash')
    expect(model.className).toContain('truncate')
    expect(model.className).toContain('min-w-0')
  })

  it('names every icon button with the row it belongs to, not just its job', () => {
    render(<ErrorLogList items={[BASE]} />)
    // Fifty rows of "Full input" would be fifty identical accessible names.
    expect(screen.getByRole('button', { name: 'Full input — glm-5.3-flash, 12/09 07:31' }))
      .toBeTruthy()
    expect(screen.getByRole('button', { name: 'Full error — glm-5.3-flash, 12/09 07:31' }))
      .toBeTruthy()
  })
})

describe('the image affordance', () => {
  it('draws NOTHING — not a disabled control — when the row has no image', () => {
    render(<ErrorLogList items={[BASE]} />)
    expect(screen.queryByRole('button', { name: /Open the image/ })).toBeNull()
    // planJobPhoto's convention: never a link the server has not proved.
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('draws a third button when the row has one', () => {
    render(<ErrorLogList items={[WITH_PHOTO]} />)
    expect(
      screen.getByRole('button', { name: 'Open the image — z-ai/glm-5.3-flash, 12/09 05:29' }),
    ).toBeTruthy()
  })

  it('opens the shared full-screen viewer on that photo', () => {
    render(<ErrorLogList items={[BASE, WITH_PHOTO]} />)
    fireEvent.click(screen.getByRole('button', { name: /Open the image/ }))
    // PhotoViewer names its dialog `${label} ${subject}`.
    expect(screen.getByRole('dialog', { name: '12/09 05:29 · z-ai/glm-5.3-flash foto' }))
      .toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('shows one dot per DISTINCT photo, so two failures on one image are one entry', () => {
    const twin = { ...WITH_PHOTO, id: 'e3', stamp: '12/09 05:31' }
    render(<ErrorLogList items={[WITH_PHOTO, twin]} />)
    fireEvent.click(screen.getAllByRole('button', { name: /Open the image/ })[0]!)
    // One photo, so PhotoViewer draws no pager at all — which is also the proof that two rows
    // sharing a URL did not become two React children keyed the same.
    expect(screen.queryByRole('button', { name: /Show the/ })).toBeNull()
  })
})

describe('the popups', () => {
  it('shows the whole input, unabbreviated, with the row named in the title', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full input/ }))
    expect(
      screen.getByRole('dialog', { name: 'Full input · 12/09 07:31 · zai · glm-5.3-flash' }),
    ).toBeTruthy()
    expect(screen.getByText('SYSTEM: you are Nina\nUSER: halo')).toBeTruthy()
  })

  it('shows the whole error, timeout line first', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full error/ }))
    expect(
      screen.getByRole('dialog', { name: 'Full error · 12/09 07:31 · zai · glm-5.3-flash' }),
    ).toBeTruthy()
    expect(screen.getByText('Timeout: 22s\n\nConnection error.')).toBeTruthy()
  })

  it('uses ONE dialog for both buttons, so the second tap replaces the first content', () => {
    render(<ErrorLogList items={[BASE]} />)
    fireEvent.click(screen.getByRole('button', { name: /Full input/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: /Full error/ }))
    expect(screen.queryByText('SYSTEM: you are Nina\nUSER: halo')).toBeNull()
    expect(screen.getByText('Timeout: 22s\n\nConnection error.')).toBeTruthy()
  })
})
```

**7c. `components/admin/LogTextDialog.test.tsx`:**

```tsx
// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LogTextDialog } from './LogTextDialog'

/**
 * The read-only popup's mechanics, which are the only hard part of it —
 * `components/ui/DetailPanel.test.tsx` is the suite this one borrows its shape from, minus every
 * case about a picture band this component does not have.
 *
 * The redundant-ARIA rule is asserted NEGATIVELY, as it is there: a native `<dialog>` with an
 * explicit `role="dialog"` is a known screen-reader hazard.
 */

function renderDialog(props: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const view = render(
    <LogTextDialog
      open={props.open ?? true}
      title="Full error · 12/09 07:31 · zai · glm-5.3-flash"
      body="Timeout: 300s\n\n504 Gateway Timeout"
      onClose={onClose}
    />,
  )
  return { ...view, onClose }
}

describe('LogTextDialog', () => {
  it('opens the dialog modally and names it from its own heading', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', {
      name: 'Full error · 12/09 07:31 · zai · glm-5.3-flash',
    })
    expect((dialog as HTMLDialogElement).open).toBe(true)
    expect(dialog.getAttribute('role')).toBeNull()
  })

  it('renders NOTHING while shut, so a kilobyte of error is not in the reading order', () => {
    renderDialog({ open: false })
    expect(screen.queryByText(/504 Gateway Timeout/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('focuses Close rather than letting the scroll container take initial focus', () => {
    renderDialog()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  })

  it('closes through the caller on the Close button', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes through the caller on Escape, so DOM state and component state cannot diverge', () => {
    const { onClose } = renderDialog()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click — the click that targets the dialog ITSELF', () => {
    const { onClose } = renderDialog()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close on a click inside the panel', () => {
    const { onClose } = renderDialog()
    fireEvent.click(screen.getByText(/504 Gateway Timeout/))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps the body rather than clipping it, and keeps its newlines', () => {
    renderDialog()
    const body = screen.getByText(/504 Gateway Timeout/)
    expect(body.tagName).toBe('PRE')
    expect(body.className).toContain('whitespace-pre-wrap')
    expect(body.className).toContain('break-words')
    expect(body.className).toContain('overflow-auto')
  })
})
```

**Impact:** Three new suites, ~60 cases. None touches a database, a network, or another phase's code.

---

## Verification

**Build:** `npm run typecheck` — **not a bare `tsc --noEmit`**: the script runs `next typegen` first,
which is what mints the `PageProps<'/admin/error-logs'>` route literal Step 4 depends on.

**Tests:**

```
npm test
npm test -- tests/admin.shell.test.ts lib/admin/errorLogModel.test.ts components/admin/ErrorLogList.test.tsx components/admin/LogTextDialog.test.tsx
```

If the full sweep goes red in `components/admin/MemoryTable.test.tsx` with a varying count, reproduce
on clean `HEAD` before blaming this diff and settle it with `--no-file-parallelism`; that suite is a
known flake under parallel load.

**Lint / format / guards:**

```
npm run lint
npm run format          # prettier-plugin-tailwindcss owns class order; run it, do not hand-sort
npm run ci:client-secret-guard
npm run ci:f08-guard
```

The f08 guard is worth naming: its rule 3 bans `Intl.NumberFormat` outside `lib/format.ts`. This phase
uses `Intl.DateTimeFormat`, which it does not ban and which `lib/date/ranges.ts:146` already uses
outside `lib/format.ts` — but `${…}` immediately followed by `km|kcal|bpm|spm` would trip rule 1, so do
not let the "300s" string grow a unit from that list.

**Manual check** — the whole point of this phase is a thing no test can see:

1. `npm run dev`, open `/admin/error-logs` in Safari/Chrome responsive mode at **375px wide**. With
   real rows in each tab, confirm every entry is **one 44px row**: the stamp never wraps, the model
   truncates with an ellipsis rather than pushing the buttons off, and the icon group stays flush at
   the right edge. Then check 414px (XS Max) and 896px (XS Max landscape, still the phone layout).
2. Tap each icon: the input popup and the error popup show the complete text, scroll inside
   themselves, close on the Close button, on Escape, and on the backdrop.
3. On a Multimodal or Image-generation row with a photo, tap the image glyph: the existing
   full-screen `PhotoViewer` opens, pinch-zoom works, and paging between photos works when the page
   has more than one distinct image.
4. The bar at the bottom is **one row of seven glyphs** on a phone, the Error-logs glyph paints
   `text-accent` while you are on the route, and the last card on every admin page still clears the
   bar.
5. Page 2: `?page=2` shows "26–50 of N" and both arrows behave. (26, not 51 — the page is 25 rows,
   because that is Phase 1's reader ceiling.)

**Seeding rows without Phases 2/3/4.** This phase reads whatever is in `nina_error_logs`, so a handful
of rows written directly through Phase 1's writer is a complete end-to-end exercise:

```
node --experimental-strip-types --no-warnings --env-file=.env.local -e "
  const { logNinaError } = await import('./lib/nina/errorlogs.ts')
  await logNinaError({ category: 'text', userId: '<your id>', provider: 'zai',
    model: 'glm-5.3-flash', fullInput: '{\"system\":\"…\"}', errorMessage: 'Connection error.',
    timeoutMs: 22000, imageUrl: null })
"
```

That argument shape is Phase 1's actual `NinaErrorLogWrite`, verified at reconciliation; `userId` is
optional, so it can be dropped entirely and the row will carry NULL — which is exactly what the text
and multimodal writers do in production. **`.env.local`'s `DATABASE_URL` is production** — seed a
few rows you are willing to see on the real page, and delete them after.

**Exit criteria:**
- `/admin` shows a seventh bottom-bar cell, "Errors", one row of seven at 375/414/896px, and its
  sidebar label at `lg` reads "Error logs".
- `/admin/error-logs` renders all three tabs, `?tab=` and `?page=` survive a reload and a share.
- One log entry is one visual row at 375px, verified by eye, with the model truncating.
- Both popups show the complete text; the error popup's first line is `Timeout: <n>s` whenever the
  row has one.
- An image-bearing row opens `PhotoViewer`; a row with no image draws no image control at all.
- `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check` and the CI guards all pass.

## Handoffs

- **The `/admin` hub card.** `app/admin/page.tsx` has four cards for six routes today (Shortcuts has
  none either), so it is not a route index and this phase adds nothing to it. If the owner wants a
  card, it is a one-block addition with no dependency on anything here.
- **A per-user filter.** The page does **not** scope its read to any user: Phase 1's
  `listNinaErrorLogs(category, opts)` takes no `userId`, deliberately, because an error log is an
  operator's cross-user diagnostic read. `/admin/memory` and `/admin/shortcuts` carry a `?user=`
  picker; there is one account in production, so that picker would be a mandatory click-through past
  a list of one — the same ruling `/admin/shortcuts`'s header records. If a second account ever
  exists and per-user filtering is wanted, **the reader itself changes first** (a `userId` predicate
  in `lib/nina/errorlogs.ts`), then `UserPicker` drops in beside the tab strip. Two of the three
  writers store `user_id` as NULL by design, so such a filter would hide most rows — which is the
  real reason it is not worth having today, and it belongs in Phase 1's module, not here.
- **Deleting or pruning log rows.** Not requested (R2 is "show me the failures"), and a table that only
  grows is a later ops question — `scripts/` is where a reaper would live, next to `blob-reap.mjs`.
- **A `category` badge inside a row.** Deliberately not rendered: the tab already answers it, and the
  375px budget in Step 3 has no room to spend on a fact the URL states.
- **`components/admin/.workflows/package_readme.md`** carries the rule *"Do not add active-link
  highlighting to AdminNav or UserPicker"*, which `admin-bottom-bar-active-tab` already overturned for
  AdminNav. This phase changes nothing about that and does not update the readme; the set's
  `readme-updater` pass owns it.
- **Phase 1 alignment — DONE, not deferred.** This plan was originally written without Phase 1's file
  on disk and assumed `listNinaErrorLogs(userId, category, …)`. It has been reconciled to the real
  signature `listNinaErrorLogs(category, { limit, offset })`, the real row shape
  (`NinaErrorLog`/`NewNinaErrorLog`: `id`, `userId`, `category`, `provider`, `model`, `fullInput`,
  `errorMessage`, `timeoutMs`, `imageUrl`, `createdAt`), and the real page-size ceiling (25). There
  is nothing left for the implementer to adapt.

## Rollback

Additive, so the undo is a delete plus two reverts:

1. `rm -r app/admin/error-logs lib/admin/errorLogModel.ts lib/admin/errorLogModel.test.ts components/admin/ErrorLogList.tsx components/admin/ErrorLogList.test.tsx components/admin/LogTextDialog.tsx components/admin/LogTextDialog.test.tsx`
2. `git checkout -- components/admin/AdminNavLinks.tsx tests/admin.shell.test.ts` (or hand-revert the
   7th `LINKS` entry, `TriangleAlertIcon`, `grid-cols-7` -> `grid-cols-6`, and the six pinned counts —
   they must move together, or `tests/admin.shell.test.ts` fails on the count it derives from `LINKS`).

No migration, no data, and nothing any other phase imports. Phases 1–4 are unaffected: reverting this
phase leaves `nina_error_logs` being written by code nothing renders, which is exactly the state the
tree is in between Phase 1 landing and this one.
