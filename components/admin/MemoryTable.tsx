'use client'

import * as React from 'react'

import { Button, Card } from '@/components/ui'
import {
  deleteMemoryRowAction,
  editFactAction,
  insertFactAction,
  saveSlotAction,
  type AdminMemoryResult,
} from '@/lib/admin/memoryActions'
import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_SLOT_VALUE_MAX,
  type AdminFactCategory,
  type MemoryRow,
} from '@/lib/admin/memoryModel'
import { cn } from '@/lib/cn'

/**
 * **R1, in one element: *"just make all the memory to show as one simple table. i can easily edit,
 * add or remove one row easily"*.**
 *
 * It replaces the two card components this page used to render — a two-column slot grid with a
 * Retire panel, and a card per ledger row carrying Retract, Edit and a red destructive panel that
 * demanded a word be typed out before it would fire. Between them they had four two-step flows.
 * This file has none, and there is nothing to hide behind a flag: the code is gone.
 *
 * ── HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A DEBOUNCE ─────────────────────────────────
 * Next dispatches Server Actions **one at a time per client**
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on the
 * client"), and every action here calls `revalidatePath`, which means each one drags a whole
 * re-rendered route back in its own response ("A single response carries data and UI"). A
 * keystroke debounce would therefore queue actions AND queue re-renders, and the operator's cursor
 * would spend the session fighting them. Blur is exactly one write per completed edit and it is
 * the moment the edit is finished, which is also what makes "no Save button" true rather than
 * cosmetic. `Escape` reverts the cell; `Cmd`/`Ctrl+Enter` commits without leaving it. A `<select>`
 * saves on CHANGE, because a select's change IS the finished edit.
 *
 * ── OPTIMISM, ONLY WHERE IT IS HONEST ───────────────────────────────────────────────────────
 * The DELETE is optimistic: the authoritative row list arrives in the same response as the action's
 * return value, so the optimistic frame is discarded against real data rather than a guess. Edits
 * are NOT optimistic, because `canonicaliseSlotValue` may store something other than what was typed
 * ("tuesdays and thursdays" -> "Selasa, Kamis") and an optimistic cell would show a value that is
 * about to change. Instead each cell's draft follows its prop, so the canonical form simply appears
 * when it lands.
 *
 * ── WHY `CONTROL_CLASS` IS NOT USED ─────────────────────────────────────────────────────────
 * It is a 52-pixel form control, and `Field` renders a block label above its child. Neither is a
 * table cell. Overriding four of `CONTROL_CLASS`'s utilities from a `className` would depend on the
 * order Tailwind happens to emit two same-property utilities in, which is not a thing to rely on.
 * `CELL_CONTROL` below is built from the SAME tokens at table density; `Button`, `Card` and `cn`
 * are used unmodified and no new palette is introduced.
 *
 * ── WHY THIS FILE NAMES NEITHER ZOD NOR A DRIZZLE MODULE ────────────────────────────────────
 * The page builds every row on the server and passes plain serializable props, so this component
 * imports only `lib/admin/memoryModel.ts` — which has zero value imports. `AdminFactCategory` is
 * derived from `ADMIN_FACT_CATEGORIES` rather than imported from the drizzle schema for exactly
 * that reason, and `tests/admin.memory.test.ts` asserts the module names neither.
 */

/** The row id under which the add row's result is stored. Not a `MemoryRow`; it has no target yet. */
const ADD_ROW_ID = 'add:fact'

/** `CONTROL_CLASS`'s tokens at table density. See the header. */
const CELL_CONTROL =
  'w-full rounded-field bg-paper-2 px-2 py-1.5 text-[13px] font-medium text-ink outline-none ' +
  'placeholder:font-normal placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent'

const CELL = 'border-t border-rule px-2 py-2 align-top'

const HEAD_CELL = 'px-2 py-2 text-[11px] font-semibold tracking-[0.02em] text-ink-2'

/**
 * The three groups, in the order the table renders them. They are `<tbody>` sections of ONE table
 * with a `scope="colgroup"` header row each — one table, still scannable, and every row still
 * shares the six columns. Three separate tables would be the thing R1 asked to stop doing.
 */
const GROUPS: readonly { kind: MemoryRow['kind']; title: string; blurb: string }[] = [
  {
    kind: 'slot',
    title: 'Slots',
    blurb:
      'Eight closed keys, every one of them in her prompt on every turn. Deleting a slot clears ' +
      'the value; the key comes straight back as a blank row, because the vocabulary is closed.',
  },
  {
    kind: 'promise',
    title: 'Pending promises',
    blurb:
      'Structured rows she wrote from a real turn. Not editable as text — she checks the metric, ' +
      'the target and the deadline against real runs. Delete is the only edit.',
  },
  {
    kind: 'fact',
    title: 'Ledger',
    blurb:
      'Everything she has been told, newest first; she reads the newest 60 on every turn. ' +
      'Editing a distilled row makes it yours — it is re-labelled admin and stops quoting the ' +
      'message it came from.',
  },
]

export function MemoryTable({
  userId,
  rows,
  factTotal,
  hiddenCount,
}: {
  userId: string
  rows: readonly MemoryRow[]
  factTotal: number
  hiddenCount: number
}) {
  /*
   * The optimistic frame. `reappears` is the whole of the slot rule: deleting one of the eight
   * closed keys removes the VALUE and not the key, so the honest optimistic state for that row is
   * the BLANK row it is about to become — not its absence. Getting this wrong would make a correct
   * delete look like a bug (the row vanishes, then reappears a moment later).
   */
  const [visible, markDeleted] = React.useOptimistic<readonly MemoryRow[], string>(
    rows,
    (current, rowId) =>
      current.flatMap((row) => {
        if (row.rowId !== rowId) return [row]
        if (!row.reappears) return []
        return [
          {
            ...row,
            text: '',
            origin: null,
            at: null,
            deletable: false,
            note: 'not set — type here and it is written as an admin slot',
          },
        ]
      }),
  )

  const [results, setResults] = React.useState<Readonly<Record<string, AdminMemoryResult>>>({})
  const [, startTransition] = React.useTransition()

  const report = React.useCallback((rowId: string, result: AdminMemoryResult | null) => {
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
    (rowId: string, action: () => Promise<AdminMemoryResult>) => {
      startTransition(async () => {
        report(rowId, await action())
      })
    },
    [report],
  )

  const remove = React.useCallback(
    (row: MemoryRow) => {
      startTransition(async () => {
        // Inside the transition, which is what `useOptimistic` requires.
        markDeleted(row.rowId)
        const result = await deleteMemoryRowAction({
          userId,
          kind: row.kind,
          target: row.target,
        })
        // A successful delete says nothing: the row being gone IS the message.
        report(row.rowId, result.ok ? null : result)
      })
    },
    [markDeleted, report, userId],
  )

  /*
   * `Card`'s own `p-6` is kept rather than overridden with `p-0`: both are padding utilities, so
   * which one wins depends on the order Tailwind emits them and not on the order they appear in the
   * class attribute. The table lives inside the card's padding, which is also where it looks right.
   */
  return (
    <Card className="mt-8 overflow-x-auto">
      <table className="w-full min-w-[940px] border-collapse text-left">
        <caption className="sr-only">
          Every memory Nina holds for this account: her eight slots, her pending promises, and the
          ledger. A cell saves when you leave it. The delete control removes a row on the first
          click, with no confirmation.
        </caption>

        <colgroup>
          <col className="w-[190px]" />
          <col />
          <col className="w-[86px]" />
          <col className="w-[250px]" />
          <col className="w-[104px]" />
          <col className="w-[48px]" />
        </colgroup>

        <thead>
          <tr className="bg-paper-2">
            <th scope="col" className={HEAD_CELL}>
              What
            </th>
            <th scope="col" className={HEAD_CELL}>
              Value
            </th>
            <th scope="col" className={HEAD_CELL}>
              Conf.
            </th>
            <th scope="col" className={HEAD_CELL}>
              Origin
            </th>
            <th scope="col" className={HEAD_CELL}>
              When
            </th>
            <th scope="col" className={HEAD_CELL}>
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>

        {GROUPS.map((group) => {
          const groupRows = visible.filter((row) => row.kind === group.kind)
          // The ledger group always renders, because it carries the add row. The other two would be
          // an empty heading over nothing.
          if (group.kind !== 'fact' && groupRows.length === 0) return null

          return (
            <tbody key={group.kind}>
              <tr>
                <th scope="colgroup" colSpan={6} className="border-t border-rule px-2 pt-6 pb-2">
                  <span className="block text-[13px] font-semibold text-ink">{group.title}</span>
                  <span className="mt-0.5 block max-w-[86ch] text-[11px] font-medium text-ink-3">
                    {group.blurb}
                  </span>
                </th>
              </tr>

              {group.kind === 'fact' && (
                <AddRow
                  userId={userId}
                  result={results[ADD_ROW_ID]}
                  onResult={(result) => report(ADD_ROW_ID, result)}
                />
              )}

              {groupRows.map((row) => (
                <Row
                  key={row.rowId}
                  userId={userId}
                  row={row}
                  result={results[row.rowId]}
                  onRun={run}
                  onReport={report}
                  onDelete={remove}
                />
              ))}
            </tbody>
          )
        })}
      </table>

      {hiddenCount > 0 && (
        <p className="mt-3 border-t border-rule pt-3 text-[11px] font-medium text-ink-3">
          Showing the newest {factTotal - hiddenCount} of {factTotal} ledger rows. {hiddenCount}{' '}
          older row(s) are not listed here.
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
  row: MemoryRow
  result: AdminMemoryResult | undefined
  onRun: (rowId: string, action: () => Promise<AdminMemoryResult>) => void
  onReport: (rowId: string, result: AdminMemoryResult | null) => void
  onDelete: (row: MemoryRow) => void
}) {
  const [text, setText] = React.useState(row.text)
  const [category, setCategory] = React.useState(row.category)
  const [confidence, setConfidence] = React.useState(row.confidence)

  /*
   * Each draft follows its prop, adjusted DURING RENDER rather than in an effect — React's own
   * recipe for "some state derives from a prop", and the reason the old slot editor used it too: an
   * effect would paint the stale draft first and then re-render, and `react-hooks/set-state-in-effect`
   * rejects it for exactly that.
   *
   * The comparison is against the VALUE and never against the row object. `revalidatePath` hands
   * every row a fresh object on every single write, so comparing identity would wipe out a draft in
   * a cell nobody had touched every time any other cell saved.
   */
  const [lastText, setLastText] = React.useState(row.text)
  if (row.text !== lastText) {
    setLastText(row.text)
    setText(row.text)
  }
  const [lastCategory, setLastCategory] = React.useState(row.category)
  if (row.category !== lastCategory) {
    setLastCategory(row.category)
    setCategory(row.category)
  }
  const [lastConfidence, setLastConfidence] = React.useState(row.confidence)
  if (row.confidence !== lastConfidence) {
    setLastConfidence(row.confidence)
    setConfidence(row.confidence)
  }

  function commitSlot() {
    if (text === row.text) return
    if (text.trim().length === 0) {
      // Not a confirmation — a refusal `slotEditSchema` would make anyway, reported before the
      // round trip. An emptied cell deliberately does NOT delete the row: a stray select-all-and-tab
      // would destroy a slot silently, and the one-click delete is two columns away.
      setText(row.text)
      onReport(row.rowId, {
        ok: false,
        error: 'A slot cannot be empty. Delete the row instead — the key comes back blank.',
      })
      return
    }
    onRun(row.rowId, () => saveSlotAction({ userId, key: row.target, value: text }))
  }

  function commitFact(patch: { category?: AdminFactCategory; text?: string; confidence?: number }) {
    // The patch carries the value a control just produced, because `setState` has not landed yet
    // when its own `onChange` runs.
    const nextCategory = patch.category ?? category ?? 'other'
    const nextText = patch.text ?? text
    const nextConfidence = patch.confidence ?? confidence ?? 100

    if (
      nextCategory === row.category &&
      nextText === row.text &&
      nextConfidence === row.confidence
    ) {
      return
    }
    if (nextText.trim().length === 0) {
      setText(row.text)
      onReport(row.rowId, { ok: false, error: 'A ledger row cannot be empty. Delete it instead.' })
      return
    }
    onRun(row.rowId, () =>
      editFactAction({
        userId,
        id: row.target,
        category: nextCategory,
        text: nextText,
        confidence: nextConfidence,
      }),
    )
  }

  function commit() {
    if (row.kind === 'slot') commitSlot()
    else if (row.kind === 'fact') commitFact({})
  }

  return (
    <tr>
      <td className={CELL}>
        {row.kind === 'fact' ? (
          <select
            aria-label="Category"
            className={cn(CELL_CONTROL, 'appearance-none')}
            value={category ?? 'other'}
            onChange={(event) => {
              const next = event.target.value as AdminFactCategory
              setCategory(next)
              commitFact({ category: next })
            }}
          >
            {ADMIN_FACT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        ) : (
          <>
            <span className="block text-[13px] font-semibold text-ink">{row.label}</span>
            <code className="mt-0.5 block text-[11px] font-medium text-ink-3">{row.code}</code>
          </>
        )}
      </td>

      <td className={CELL}>
        {row.editable ? (
          <textarea
            aria-label={row.label === '' ? 'Ledger row text' : `${row.label} value`}
            className={cn(CELL_CONTROL, 'min-h-[34px] resize-y leading-snug')}
            rows={1}
            value={text}
            maxLength={row.kind === 'slot' ? ADMIN_SLOT_VALUE_MAX : ADMIN_FACT_TEXT_MAX}
            placeholder={row.kind === 'slot' ? 'not set' : ''}
            onChange={(event) => {
              setText(event.target.value)
              if (result !== undefined) onReport(row.rowId, null)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                setText(row.text)
                onReport(row.rowId, null)
                return
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                event.currentTarget.blur()
              }
            }}
          />
        ) : (
          <p className="px-2 py-1.5 text-[13px] font-medium text-ink">{row.text}</p>
        )}

        {row.hint !== '' && (
          <p className="mt-1 px-2 text-[11px] font-medium text-ink-3">{row.hint}</p>
        )}
        {result?.ok === false && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note !== undefined && (
          <p className="mt-1 px-2 text-[11px] font-semibold text-accent">{result.note}</p>
        )}
      </td>

      <td className={CELL}>
        {row.kind === 'fact' ? (
          <input
            aria-label="Confidence"
            className={cn(CELL_CONTROL, 'tabular-nums')}
            type="number"
            min={0}
            max={100}
            step={1}
            value={confidence ?? 100}
            onChange={(event) => setConfidence(Number(event.target.value))}
            onBlur={() => {
              const raw = confidence ?? 100
              const clamped = Number.isFinite(raw)
                ? Math.min(100, Math.max(0, Math.round(raw)))
                : (row.confidence ?? 100)
              setConfidence(clamped)
              commitFact({ confidence: clamped })
            }}
          />
        ) : (
          <span className="px-2 text-[13px] font-medium text-ink-3">&mdash;</span>
        )}
      </td>

      <td className={CELL}>
        <span
          className={cn(
            'rounded-field px-1.5 py-0.5 text-[11px] font-semibold',
            row.origin === 'admin' ? 'bg-accent/15 text-accent' : 'bg-paper-2 text-ink-2',
          )}
        >
          {row.origin ?? (row.kind === 'promise' ? 'promise' : 'not set')}
        </span>
        <span className="mt-1 block text-[11px] font-medium text-ink-3">{row.note}</span>
      </td>

      <td className={cn(CELL, 'text-[11px] font-medium text-ink-3 tabular-nums')}>
        {row.at?.slice(0, 10) ?? '—'}
      </td>

      <td className={cn(CELL, 'text-right')}>
        {row.deletable && (
          <button
            type="button"
            aria-label={`Delete ${row.label === '' ? 'this ledger row' : row.label}`}
            title={
              row.reappears
                ? 'Delete the value. The key comes back as a blank row.'
                : 'Delete this row. No confirmation.'
            }
            className={cn(
              'rounded-field px-2 py-1 text-[15px] leading-none font-semibold text-ink-3',
              'transition-colors hover:bg-red/10 hover:text-red',
              'focus-visible:ring-2 focus-visible:ring-red focus-visible:outline-none',
            )}
            onClick={() => onDelete(row)}
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  )
}

/**
 * **The one add affordance, and it is a row of the table rather than a card above it.**
 *
 * It sits at the TOP of the ledger group, because the ledger is newest-first and up to 200 rows is
 * a long scroll to a form. `Enter` in the text cell and the `+` button both commit; that is the
 * FIRST click of a create, not a second click on anything, which is what R1 rules out. The
 * category and confidence survive a successful add, so three `training` rows are three sentences
 * and three `Enter`s.
 *
 * An `<input>` rather than a `<textarea>`, so `Enter` means "add" instead of "newline". A ledger
 * row is one sentence — the ledger's own shape, and its 400-character cap.
 */
function AddRow({
  userId,
  result,
  onResult,
}: {
  userId: string
  result: AdminMemoryResult | undefined
  onResult: (result: AdminMemoryResult | null) => void
}) {
  const [category, setCategory] = React.useState<AdminFactCategory>('person')
  const [text, setText] = React.useState('')
  const [confidence, setConfidence] = React.useState(100)
  const [pending, startTransition] = React.useTransition()

  function add() {
    if (text.trim().length === 0) return
    startTransition(async () => {
      const next = await insertFactAction({ userId, category, text, confidence })
      onResult(next)
      if (next.ok) setText('')
    })
  }

  return (
    <tr className="bg-paper-2/40">
      <td className={CELL}>
        <select
          aria-label="Category for the new row"
          className={cn(CELL_CONTROL, 'appearance-none')}
          value={category}
          disabled={pending}
          onChange={(event) => setCategory(event.target.value as AdminFactCategory)}
        >
          {ADMIN_FACT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </td>

      <td className={CELL}>
        <input
          aria-label="Tell her something — it goes straight into the ledger"
          className={CELL_CONTROL}
          value={text}
          maxLength={ADMIN_FACT_TEXT_MAX}
          disabled={pending}
          placeholder="Tell her something. She reads it on her next turn."
          onChange={(event) => {
            setText(event.target.value)
            if (result !== undefined) onResult(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
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

      <td className={CELL}>
        <input
          aria-label="Confidence for the new row"
          className={cn(CELL_CONTROL, 'tabular-nums')}
          type="number"
          min={0}
          max={100}
          step={1}
          value={confidence}
          disabled={pending}
          onChange={(event) => setConfidence(Number(event.target.value))}
        />
      </td>

      <td className={cn(CELL, 'text-[11px] font-medium text-ink-3')} colSpan={2}>
        Written as <code className="text-ink">admin</code>, with no message behind it. No
        distillation can rewrite or remove it.
      </td>

      <td className={cn(CELL, 'text-right')}>
        <Button
          size="md"
          className="h-8 px-2 text-[15px]"
          aria-label="Add this row to the ledger"
          loading={pending}
          disabled={text.trim().length === 0}
          onClick={add}
        >
          +
        </Button>
      </td>
    </tr>
  )
}
