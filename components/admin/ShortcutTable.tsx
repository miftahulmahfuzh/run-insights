'use client'

import * as React from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { Button, Card } from '@/components/ui'
import {
  addShortcutAction,
  deleteShortcutAction,
  saveShortcutCellAction,
  toggleShortcutAction,
  type AdminShortcutResult,
} from '@/lib/admin/shortcutActions'
import {
  ADMIN_SHORTCUT_PAGE,
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  formatFired,
  type ShortcutField,
  type ShortcutRow,
} from '@/lib/admin/shortcutModel'
import { cn } from '@/lib/cn'

/**
 * **R1's surface, in one element**: *"in shortcuts admin can add shortcuts that entails some
 * situations or what miftah and nina were doing."*
 *
 * It is `MemoryTable.tsx` with different columns, and that is deliberate rather than lazy: the two
 * pages are operated in the same session, by the same thumb, and a second set of table mechanics
 * would be a second set of ways to lose an edit. Everything below that is not about shortcuts —
 * the cell tokens, the blur-to-save rule, the optimism rule, the delete control — is that file's,
 * with its reasoning kept where it is load-bearing and pointed at where it is not.
 *
 * ── WHY THIS FILE NAMES NOTHING UNDER `lib/nina` ────────────────────────────────────────────
 * The three caps below come out of `@/lib/admin/shortcutModel`, which re-exports them from the
 * pure matcher module. It could have imported them from there directly — that module is
 * zero-import and therefore client-safe — and it deliberately does not.
 * `lib/admin/shortcutModel.ts`'s header has the argument; `tests/admin.shortcuts.test.ts` asserts
 * that this file names no `lib/nina` specifier at all.
 *
 * ── AND WHY THERE IS NO CONFIRMATION ────────────────────────────────────────────────────────
 * Invariant 6, and the owner's sentence in `lib/admin/memoryActions.ts`'s header. The `✕` deletes
 * on the first click. The test asserts the absence of every dialog and second-click API by name,
 * because "no second step" is a property a future edit can quietly reintroduce.
 *
 * **A note for the next editor of this docstring.** That test reads this file whole, so the two
 * paragraphs above must not SPELL the specifiers and the API names they are talking about — the
 * guard cannot tell an explanation from a reintroduction. `tests/admin.shell.test.ts`'s
 * `classNames()` helper exists for the identical trap, and the schema section this page validates
 * against carries the same warning.
 */

/** The row id under which the add row's result is stored. Not a `ShortcutRow`; it has no id yet. */
const ADD_ROW_ID = 'add:shortcut'

/**
 * `CONTROL_CLASS`'s tokens at table density — the same string `MemoryTable.tsx` uses, and its
 * docstring is the full argument. The two rules that must not be softened here, because this page
 * is even more nothing-but-form-controls than that one:
 *
 *   · `text-base` below `lg` — 16 px. Safari zooms the viewport when a control smaller than that
 *     takes focus and leaves it zoomed. `app/globals.css` sets `font-size: max(16px, 1rem)` in
 *     `@layer base`, and a Tailwind utility sits in `@layer utilities`, which beats it — so a
 *     `text-[13px]` here would re-open the exact hole the global rule exists to close.
 *     13 px density returns at `lg`, where there is no viewport to zoom.
 *   · `min-h-11` — the 44 px tap target, back to `min-h-0` at `lg` so a long table is still one
 *     screen of scanning.
 */
const CELL_CONTROL =
  'min-h-11 w-full rounded-field bg-paper-2 px-2 py-1.5 text-base font-medium text-ink outline-none ' +
  'placeholder:font-normal placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent ' +
  'lg:min-h-0 lg:text-[13px]'

const CELL = 'border-t border-rule px-2 py-2 align-top'

/**
 * **`Fired`, below `lg`, is not there** — and it is the only column that goes.
 *
 * Five of the six are things the operator ACTS on: the trigger, the label, the expansion, the
 * on/off, and the delete. `Fired` is telemetry he READS — a count and a date, both answers to
 * "is this code dead?", which is a question asked at a desk and not with a thumb. It is
 * `MemoryTable`'s own reasoning for dropping Origin and When, applied to the one column here that
 * matches the description.
 *
 * ── AND IT IS DONE WITH `hidden lg:table-cell`, NOT A COLUMN GROUP ──────────────────────────
 * `MemoryTable.tsx`'s header has the whole argument and it is not being re-litigated: a `<col>`
 * maps to a column by POSITION among the cells actually rendered, so hiding a `<td>` with
 * `display:none` slides every later column into the wrong one; and `display:none` on a `<col>`
 * is not defined to hide a column at all. The widths live on the `<th>`s, which carry them whether
 * the cell is rendered or not.
 */
const CELL_WIDE_ONLY = `${CELL} hidden lg:table-cell`

const HEAD_CELL = 'px-2 py-2 text-[11px] font-semibold tracking-[0.02em] text-ink-2'

const HEAD_CELL_WIDE_ONLY = `${HEAD_CELL} hidden lg:table-cell`

export function ShortcutTable({ userId, rows }: { userId: string; rows: readonly ShortcutRow[] }) {
  /*
   * The optimistic frame, and it is a plain filter — unlike the ledger's, where deleting one of the
   * eight closed slot keys leaves the KEY behind as a blank row. A shortcut has no closed
   * vocabulary: the row is gone, and nothing manufactures it again.
   */
  const [visible, markDeleted] = React.useOptimistic<readonly ShortcutRow[], string>(
    rows,
    (current, id) => current.filter((row) => row.id !== id),
  )

  const [results, setResults] = React.useState<Readonly<Record<string, AdminShortcutResult>>>({})
  const [, startTransition] = React.useTransition()

  const report = React.useCallback((rowId: string, result: AdminShortcutResult | null) => {
    setResults((previous) => {
      if (result === null) {
        if (previous[rowId] === undefined) return previous
        const next = { ...previous }
        delete next[rowId]
        return next
      }
      return { ...previous, [rowId]: result }
    })
  }, [])

  const run = React.useCallback(
    (rowId: string, action: () => Promise<AdminShortcutResult>) => {
      startTransition(async () => {
        report(rowId, await action())
      })
    },
    [report],
  )

  const remove = React.useCallback(
    (row: ShortcutRow) => {
      startTransition(async () => {
        // Inside the transition, which is what `useOptimistic` requires.
        markDeleted(row.id)
        const result = await deleteShortcutAction({ userId, id: row.id })
        // A successful delete says nothing: the row being gone IS the message.
        report(row.id, result.ok ? null : result)
      })
    },
    [markDeleted, report, userId],
  )

  return (
    /* `overscroll-x-contain`: without it, flicking the table past its right edge hands the
        remaining horizontal scroll to the page, and on iOS a horizontal overscroll at the left
        edge is the back-swipe gesture — so scrolling a table would navigate away from it. */
    <Card className="mt-8 overflow-x-auto overscroll-x-contain">
      <table className="w-full min-w-[460px] border-collapse text-left lg:min-w-[1000px]">
        <caption className="sr-only">
          Every shortcut this account has. A trigger, what it is for, and the context it stands in
          for. A cell saves when you leave it; the on/off control saves the moment it changes; the
          delete control removes a row on the first click, with no confirmation. On a narrow screen
          the Fired column is not shown; the table scrolls sideways inside its own box.
        </caption>

        {/* No column group — the widths live on the header cells. `CELL_WIDE_ONLY`'s docstring has
            the argument. */}
        <thead>
          <tr className="bg-paper-2">
            <th scope="col" className={cn(HEAD_CELL, 'w-[96px] lg:w-[150px]')}>
              Trigger
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[120px] lg:w-[220px]')}>
              Label
            </th>
            <th scope="col" className={HEAD_CELL}>
              Expansion
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[76px] lg:w-[84px]')}>
              On
            </th>
            <th scope="col" className={cn(HEAD_CELL_WIDE_ONLY, 'lg:w-[132px]')}>
              Fired
            </th>
            <th scope="col" className={cn(HEAD_CELL, 'w-[56px] lg:w-[48px]')}>
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>

        <tbody>
          <AddRow
            userId={userId}
            result={results[ADD_ROW_ID]}
            onResult={(result) => report(ADD_ROW_ID, result)}
          />

          {visible.map((row) => (
            <Row
              key={row.id}
              userId={userId}
              row={row}
              result={results[row.id]}
              onRun={run}
              onReport={report}
              onDelete={remove}
            />
          ))}
        </tbody>
      </table>

      {visible.length === 0 && (
        <p className="mt-3 border-t border-rule pt-3 text-[11px] font-medium text-ink-3">
          No shortcuts yet. The row above is where the first one goes — a trigger he will actually
          type, and the whole scene it stands for.
        </p>
      )}

      {rows.length >= ADMIN_SHORTCUT_PAGE && (
        <p className="mt-3 border-t border-rule pt-3 text-[11px] font-medium text-ink-3">
          Showing the newest {ADMIN_SHORTCUT_PAGE}. Any older ones are still in the table and still
          fire; they are just not listed here.
        </p>
      )}
    </Card>
  )
}

function Row({
  userId,
  row,
  result,
  onRun,
  onReport,
  onDelete,
}: {
  userId: string
  row: ShortcutRow
  result: AdminShortcutResult | undefined
  onRun: (rowId: string, action: () => Promise<AdminShortcutResult>) => void
  onReport: (rowId: string, result: AdminShortcutResult | null) => void
  onDelete: (row: ShortcutRow) => void
}) {
  const [trigger, setTrigger] = React.useState(row.trigger)
  const [label, setLabel] = React.useState(row.label)
  const [expansion, setExpansion] = React.useState(row.expansion)

  /*
   * Each draft follows its prop, adjusted DURING RENDER rather than in an effect — React's own
   * recipe for "some state derives from a prop", and `react-hooks/set-state-in-effect` rejects the
   * alternative. The comparison is against the VALUE and never against the row object:
   * `revalidatePath` hands every row a fresh object on every write, so comparing identity would
   * wipe out a draft in a cell nobody had touched every time any other cell saved.
   *
   * `row.enabled` deliberately has NO draft. The select renders the prop, and the server's answer
   * is what changes it — an optimistic toggle would show "on" for a row the write is about to
   * refuse, and `MemoryTable`'s rule is that only the DELETE is optimistic.
   */
  const [lastTrigger, setLastTrigger] = React.useState(row.trigger)
  if (row.trigger !== lastTrigger) {
    setLastTrigger(row.trigger)
    setTrigger(row.trigger)
  }
  const [lastLabel, setLastLabel] = React.useState(row.label)
  if (row.label !== lastLabel) {
    setLastLabel(row.label)
    setLabel(row.label)
  }
  const [lastExpansion, setLastExpansion] = React.useState(row.expansion)
  if (row.expansion !== lastExpansion) {
    setLastExpansion(row.expansion)
    setExpansion(row.expansion)
  }

  /**
   * One commit path for all three text cells. `committed` is the prop — the last thing the server
   * agreed to — and `revert` puts the draft back to it.
   *
   * An emptied cell deliberately does NOT delete the row: a stray select-all-and-tab would destroy
   * a shortcut silently, and the one-click delete is four columns away. The refusal is reported
   * before the round trip, because the schema would make it anyway.
   */
  function commit(field: ShortcutField, draft: string, committed: string, revert: () => void) {
    if (draft === committed) return
    if (draft.trim().length === 0) {
      revert()
      onReport(row.id, {
        ok: false,
        error: `A shortcut's ${field} cannot be empty. Delete the row instead — one click, no confirmation.`,
      })
      return
    }
    onRun(row.id, () => saveShortcutCellAction({ userId, id: row.id, field, value: draft }))
  }

  /** `Escape` reverts the cell; `Cmd`/`Ctrl+Enter` commits without leaving it. */
  function keys(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    revert: () => void,
  ) {
    if (event.key === 'Escape') {
      event.preventDefault()
      revert()
      onReport(row.id, null)
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const revertTrigger = () => setTrigger(row.trigger)
  const revertLabel = () => setLabel(row.label)
  const revertExpansion = () => setExpansion(row.expansion)

  return (
    <tr className={cn(!row.enabled && 'opacity-60')}>
      <td className={CELL}>
        <input
          aria-label="Trigger"
          className={CELL_CONTROL}
          value={trigger}
          maxLength={NINA_TRIGGER_MAX}
          onChange={(event) => {
            setTrigger(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('trigger', trigger, row.trigger, revertTrigger)}
          onKeyDown={(event) => keys(event, revertTrigger)}
        />
      </td>

      <td className={CELL}>
        <input
          aria-label="Label"
          className={CELL_CONTROL}
          value={label}
          maxLength={NINA_SHORTCUT_LABEL_MAX}
          placeholder="what this code is for"
          onChange={(event) => {
            setLabel(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('label', label, row.label, revertLabel)}
          onKeyDown={(event) => keys(event, revertLabel)}
        />
      </td>

      <td className={CELL}>
        <textarea
          aria-label="Expansion"
          className={cn(CELL_CONTROL, 'resize-y leading-snug')}
          rows={2}
          value={expansion}
          maxLength={NINA_SHORTCUT_EXPANSION_MAX}
          onChange={(event) => {
            setExpansion(event.target.value)
            if (result !== undefined) onReport(row.id, null)
          }}
          onBlur={() => commit('expansion', expansion, row.expansion, revertExpansion)}
          onKeyDown={(event) => keys(event, revertExpansion)}
        />
        {result?.ok === false && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-accent">{result.note}</p>
        )}
      </td>

      <td className={CELL}>
        {/*
         * A `<select>` and not a checkbox, for two reasons that both come from files in this
         * directory. `CELL_CONTROL` gives it the 44 px target and the 16 px font for free, where a
         * checkbox would need both bolted on; and "on" and "off" are two words that cannot be
         * misread. The admin phone bar — `AdminNavLinks` since the shell/leaf split — went
         * icon-only in `admin-bottom-bar-icons` — seven cells on 414 px stopped fitting words —
         * which is the inverse of this cell: two words fit, and
         * a glyph here would be the guess. It saves on CHANGE, because a select's change IS the
         * finished edit.
         */}
        <select
          aria-label="On or off"
          className={cn(CELL_CONTROL, 'appearance-none')}
          value={row.enabled ? 'on' : 'off'}
          onChange={(event) => {
            const next = event.target.value === 'on'
            onRun(row.id, () => toggleShortcutAction({ userId, id: row.id, enabled: next }))
          }}
        >
          <option value="on">on</option>
          <option value="off">off</option>
        </select>
      </td>

      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3 tabular-nums')}>
        {formatFired(row.uses, row.lastUsedAt)}
      </td>

      <td className={cn(CELL, 'text-right')}>
        <button
          type="button"
          aria-label={`Delete the ${row.trigger} shortcut`}
          title="Delete this shortcut. No confirmation."
          className={cn(
            TOUCH_ICON,
            'rounded-field text-[15px] leading-none font-semibold text-ink-3',
            'transition-colors hover:bg-red/10 hover:text-red',
            'focus-visible:ring-2 focus-visible:ring-red focus-visible:outline-none',
          )}
          onClick={() => onDelete(row)}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

/**
 * **The one add affordance, and it is a row of the table rather than a card above it.**
 *
 * It sits at the TOP, because the table is newest-first and the row just added should appear
 * immediately under the form that made it. `Enter` in either single-line cell and the `+` button
 * both commit; that is the FIRST click of a create, not a second click on anything.
 *
 * The expansion is a `<textarea>`, so `Enter` there means newline — it is up to 2000 characters of
 * scene and it will have paragraphs in it. `Cmd`/`Ctrl+Enter` commits from inside it, the same
 * chord the editable cells use.
 */
function AddRow({
  userId,
  result,
  onResult,
}: {
  userId: string
  result: AdminShortcutResult | undefined
  onResult: (result: AdminShortcutResult | null) => void
}) {
  const [trigger, setTrigger] = React.useState('')
  const [label, setLabel] = React.useState('')
  const [expansion, setExpansion] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const ready = trigger.trim().length > 0 && label.trim().length > 0 && expansion.trim().length > 0

  function add() {
    if (!ready) return
    startTransition(async () => {
      const next = await addShortcutAction({ userId, trigger, label, expansion })
      onResult(next)
      if (next.ok) {
        setTrigger('')
        setLabel('')
        setExpansion('')
      }
    })
  }

  function clearResult() {
    if (result !== undefined) onResult(null)
  }

  /** `Enter` on a single-line cell adds. The textarea gets the chord instead. */
  function enterAdds(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    }
  }

  return (
    <tr className="bg-paper-2/40">
      <td className={CELL}>
        <input
          aria-label="The trigger to add"
          className={CELL_CONTROL}
          value={trigger}
          maxLength={NINA_TRIGGER_MAX}
          disabled={pending}
          placeholder="🍑"
          onChange={(event) => {
            setTrigger(event.target.value)
            clearResult()
          }}
          onKeyDown={enterAdds}
        />
      </td>

      <td className={CELL}>
        <input
          aria-label="What the new shortcut is for"
          className={CELL_CONTROL}
          value={label}
          maxLength={NINA_SHORTCUT_LABEL_MAX}
          disabled={pending}
          placeholder="what it is for"
          onChange={(event) => {
            setLabel(event.target.value)
            clearResult()
          }}
          onKeyDown={enterAdds}
        />
      </td>

      <td className={CELL}>
        <textarea
          aria-label="The context the new shortcut stands for"
          className={cn(CELL_CONTROL, 'resize-y leading-snug')}
          rows={2}
          value={expansion}
          maxLength={NINA_SHORTCUT_EXPANSION_MAX}
          disabled={pending}
          placeholder="The whole thing it stands in for. She is handed this verbatim, as an instruction, on the turn it fires."
          onChange={(event) => {
            setExpansion(event.target.value)
            clearResult()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              add()
            }
          }}
        />
        {result?.ok === false && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-accent">{result.note}</p>
        )}
      </td>

      <td className={cn(CELL, 'text-[11px] font-medium text-ink-3')}>on</td>

      <td className={cn(CELL_WIDE_ONLY, 'text-[11px] font-medium text-ink-3')}>
        New shortcuts start on. Nothing has fired yet.
      </td>

      <td className={cn(CELL, 'text-right')}>
        {/* `size="md"` IS `h-11` (`components/ui/Button.tsx:41-44`). No height override: two
            same-property utilities would leave the winner to Tailwind's emission order, which
            `lib/cn.ts` does not arbitrate. The 56 px column holds `h-11 px-4` plus a `+`. */}
        <Button
          size="md"
          className="text-[15px]"
          aria-label="Add this shortcut"
          loading={pending}
          disabled={!ready}
          onClick={add}
        >
          +
        </Button>
      </td>
    </tr>
  )
}
