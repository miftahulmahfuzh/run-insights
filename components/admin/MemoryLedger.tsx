'use client'

import * as React from 'react'

import { Button, Card, CONTROL_CLASS, Field } from '@/components/ui'
import {
  editFactAction,
  insertFactAction,
  purgeFactAction,
  retractFactAction,
  type AdminMemoryResult,
} from '@/lib/admin/memoryActions'
import {
  ADMIN_FACT_CATEGORIES,
  ADMIN_FACT_TEXT_MAX,
  ADMIN_PURGE_CONFIRMATION,
  type FactCard,
} from '@/lib/admin/memoryModel'
import { cn } from '@/lib/cn'

/**
 * The append-only half of RU-6 — R4's *"PERMANENTLY"* — made editable without becoming lossy.
 *
 * Three operations, and the UI is deliberately asymmetric about them:
 *
 *   **Retract** is the primary button on every row. It appends a record quoting the original and
 *   then removes the original, so the wording survives and the wrong sentence stops reaching her.
 *   **Edit** appears only on rows you wrote yourself. A row the distiller wrote points at the
 *   message it came from, and rewriting its text would make it misquote that message.
 *   **Purge** is small, last, and asks you to type PURGE. It is the only thing in this application
 *   that loses text.
 */

export function MemoryLedger({
  userId,
  facts,
  hiddenCount,
  total,
}: {
  userId: string
  facts: readonly FactCard[]
  hiddenCount: number
  total: number
}) {
  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">Ledger</h2>
      <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Everything she has been told, newest first. She reads the newest 60 on every turn. Nothing
        here is ever rewritten by the distiller — a row marked{' '}
        <code className="text-ink">admin</code> is unreachable from it entirely.
      </p>

      <InsertFact userId={userId} />

      <div className="mt-6 space-y-3">
        {facts.length === 0 ? (
          <p className="rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
            The ledger is empty. Add the first row above — she will read it on her next turn.
          </p>
        ) : (
          facts.map((fact) => <FactRow key={fact.id} userId={userId} fact={fact} />)
        )}
      </div>

      {hiddenCount > 0 && (
        <p className="mt-4 text-[12px] font-medium text-ink-3">
          Showing the newest {facts.length} of {total}. {hiddenCount} older row(s) are not listed
          and cannot be edited from this page.
        </p>
      )}
    </section>
  )
}

/** R24's backdoor: a fact with nothing in the chat behind it. */
function InsertFact({ userId }: { userId: string }) {
  const [category, setCategory] = React.useState<(typeof ADMIN_FACT_CATEGORIES)[number]>('person')
  const [text, setText] = React.useState('')
  const [confidence, setConfidence] = React.useState(100)
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Card className="p-5">
      <h3 className="text-[15px] font-semibold text-ink">Tell her something directly</h3>
      <p className="mt-1 mb-3 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Goes straight into the ledger as <code className="text-ink">admin</code>, with no message
        behind it. She reads it on her next turn and no distillation can ever remove it.
      </p>

      <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
        <Field label="Category">
          <select
            aria-label="Category"
            className={cn(CONTROL_CLASS, 'appearance-none')}
            value={category}
            disabled={pending}
            onChange={(event) =>
              setCategory(event.target.value as (typeof ADMIN_FACT_CATEGORIES)[number])
            }
          >
            {ADMIN_FACT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fact" error={result?.ok === false ? result.error : undefined}>
          <textarea
            aria-label="Fact"
            className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
            value={text}
            maxLength={ADMIN_FACT_TEXT_MAX}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        <Field label="Confidence" suffix="%">
          <input
            aria-label="Confidence"
            className={CONTROL_CLASS}
            type="number"
            min={0}
            max={100}
            step={1}
            value={confidence}
            disabled={pending}
            onChange={(event) => setConfidence(Number(event.target.value))}
          />
        </Field>
      </div>

      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      <Button
        className="mt-3"
        disabled={pending || text.trim().length === 0}
        onClick={() =>
          startTransition(async () => {
            const next = await insertFactAction({ userId, category, text, confidence })
            setResult(next)
            if (next.ok) setText('')
          })
        }
      >
        Add to the ledger
      </Button>
    </Card>
  )
}

type RowMode = 'idle' | 'edit' | 'retract' | 'purge'

function FactRow({ userId, fact }: { userId: string; fact: FactCard }) {
  const [mode, setMode] = React.useState<RowMode>('idle')
  const [text, setText] = React.useState(fact.text)
  const [category, setCategory] = React.useState(fact.category)
  const [confidence, setConfidence] = React.useState(fact.confidence)
  const [replacement, setReplacement] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  function run(action: () => Promise<AdminMemoryResult>) {
    startTransition(async () => {
      const next = await action()
      setResult(next)
      if (next.ok) setMode('idle')
    })
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-3">
          <span
            className={cn(
              'rounded-field px-1.5 py-0.5 font-semibold',
              fact.origin === 'admin' ? 'bg-accent/15 text-accent' : 'bg-paper-2 text-ink-2',
            )}
          >
            {fact.origin}
          </span>
          <span className="ml-2">{fact.category}</span>
          <span className="ml-2">{fact.confidence}%</span>
          <span className="ml-2">{fact.createdAt.slice(0, 10)}</span>
          {fact.sourceMessageId === null ? (
            <span className="ml-2">no message behind it</span>
          ) : (
            <span className="ml-2">from a message</span>
          )}
        </span>
      </div>

      <p className="mt-2 text-[14px] leading-snug font-medium text-ink">{fact.text}</p>

      {result?.ok === false && (
        <p className="mt-2 text-[11px] font-semibold text-red">{result.error}</p>
      )}
      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      {mode === 'idle' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button disabled={pending} onClick={() => setMode('retract')}>
            Retract
          </Button>
          {fact.canEditInPlace && (
            <Button variant="secondary" disabled={pending} onClick={() => setMode('edit')}>
              Edit
            </Button>
          )}
          {!fact.canEditInPlace && (
            <span className="max-w-[52ch] text-[11px] font-medium text-ink-3">{fact.editNote}</span>
          )}
          <Button variant="ghost" disabled={pending} onClick={() => setMode('purge')}>
            Purge
          </Button>
        </div>
      )}

      {mode === 'retract' && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <p className="mb-2 max-w-[70ch] text-[12px] font-medium text-ink-2">
            A new row is written that quotes this one word for word, then this row is removed. The
            wording survives; the wrong sentence stops reaching her. Leave the box empty for a plain
            retraction.
          </p>
          <Field label="What is actually true (optional)">
            <textarea
              aria-label="What is actually true"
              className={cn(CONTROL_CLASS, 'min-h-[64px] resize-y py-2 leading-snug')}
              value={replacement}
              maxLength={ADMIN_FACT_TEXT_MAX}
              disabled={pending}
              onChange={(event) => setReplacement(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={pending}
              onClick={() => run(() => retractFactAction({ userId, id: fact.id, replacement }))}
            >
              Record the retraction
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'edit' && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_120px]">
            <Field label="Category">
              <select
                aria-label="Category"
                className={cn(CONTROL_CLASS, 'appearance-none')}
                value={category}
                disabled={pending}
                onChange={(event) => setCategory(event.target.value as FactCard['category'])}
              >
                {ADMIN_FACT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Text">
              <textarea
                aria-label="Text"
                className={cn(CONTROL_CLASS, 'min-h-[64px] resize-y py-2 leading-snug')}
                value={text}
                maxLength={ADMIN_FACT_TEXT_MAX}
                disabled={pending}
                onChange={(event) => setText(event.target.value)}
              />
            </Field>
            <Field label="Confidence" suffix="%">
              <input
                aria-label="Confidence"
                className={CONTROL_CLASS}
                type="number"
                min={0}
                max={100}
                step={1}
                value={confidence}
                disabled={pending}
                onChange={(event) => setConfidence(Number(event.target.value))}
              />
            </Field>
          </div>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={pending || text.trim().length === 0}
              onClick={() =>
                run(() => editFactAction({ userId, id: fact.id, category, text, confidence }))
              }
            >
              Save
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'purge' && (
        <div className="mt-3 rounded-card border border-red/40 bg-paper-2 p-3">
          <p className="mb-2 max-w-[70ch] text-[12px] font-semibold text-red">
            Purge loses this text permanently. No record, no quote, nothing left. If you want the
            correction kept, cancel and use Retract.
          </p>
          <Field label={`Type ${ADMIN_PURGE_CONFIRMATION} to confirm`}>
            <input
              aria-label={`Type ${ADMIN_PURGE_CONFIRMATION} to confirm`}
              className={CONTROL_CLASS}
              value={confirm}
              disabled={pending}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              disabled={pending || confirm.trim() !== ADMIN_PURGE_CONFIRMATION}
              onClick={() => run(() => purgeFactAction({ userId, id: fact.id, confirm }))}
            >
              Purge
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
