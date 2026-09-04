'use client'

import * as React from 'react'

import { Button, Card, CONTROL_CLASS, Field } from '@/components/ui'
import {
  recordSlotAsFactAction,
  removePendingPromiseAction,
  retireSlotAction,
  saveSlotAction,
  type AdminMemoryResult,
} from '@/lib/admin/memoryActions'
import { ADMIN_SLOT_VALUE_MAX, type SlotCard } from '@/lib/admin/memoryModel'
import { cn } from '@/lib/cn'
import type { NinaPendingPromise } from '@/lib/db/schema'

/**
 * The upserted half of RU-6, editable — R24's *"i can edit inaccurate / stale data about myself"*.
 *
 * Every card is one `<textarea>` and two or three buttons. There is no "add a slot" form and that
 * is deliberate: phase 5's vocabulary is closed, the page already renders an empty card for each
 * of the nine keys, and a free-text key field would manufacture exactly the orphaned rows the
 * bottom section exists to clean up.
 *
 * `useTransition` rather than `<form action={…}>`: phase 15's album manager established the
 * plain-argument + result-object shape on the sibling admin page, and a desktop-only tool gains
 * nothing from progressive enhancement that it does not lose in consistency. Validation is still
 * Zod on the server for every field.
 */

export function MemorySlots({
  userId,
  slots,
  promises,
}: {
  userId: string
  slots: readonly SlotCard[]
  promises: readonly NinaPendingPromise[]
}) {
  const known = slots.filter((slot) => slot.inVocabulary)
  const orphans = slots.filter((slot) => !slot.inVocabulary)

  return (
    <section>
      <h2 className="mb-1 text-[16px] font-semibold text-ink">Slots</h2>
      <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
        Nine keys, all nine handed to her on every turn. A value you write here is marked
        <code className="mx-1 text-ink">admin</code>and the distiller defers to it instead of
        overwriting it.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {known.map((slot) =>
          slot.editKind === 'structured' ? (
            <PromisesPanel key={slot.key} userId={userId} slot={slot} promises={promises} />
          ) : (
            <SlotEditor key={slot.key} userId={userId} slot={slot} />
          ),
        )}
      </div>

      {orphans.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-1 text-[15px] font-semibold text-ink">Orphaned keys</h3>
          <p className="mb-4 max-w-[70ch] text-[13px] font-medium text-ink-2">
            Keys outside the nine. No rule reads them — but every slot row goes into her prompt, so
            <strong> she does</strong>. Retiring one records its value in the ledger and takes it
            out of her prompt.
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            {orphans.map((slot) => (
              <SlotEditor key={slot.key} userId={userId} slot={slot} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/** `admin` / `distilled` / `not set`, plus what the distiller will do about it. */
function OriginBadge({ slot }: { slot: SlotCard }) {
  const label = slot.present ? slot.origin : 'not set'
  const protection =
    slot.protection === 'deferred'
      ? 'the distiller defers to this'
      : slot.protection === 'sticky'
        ? 'merges keep the admin label'
        : slot.present
          ? 'the next distillation may replace this'
          : ''

  return (
    <span className="text-[11px] font-medium text-ink-3">
      <span
        className={cn(
          'rounded-field px-1.5 py-0.5 font-semibold',
          slot.origin === 'admin' ? 'bg-accent/15 text-accent' : 'bg-paper-2 text-ink-2',
        )}
      >
        {label}
      </span>
      {protection && <span className="ml-2">{protection}</span>}
    </span>
  )
}

function SlotEditor({ userId, slot }: { userId: string; slot: SlotCard }) {
  const [draft, setDraft] = React.useState(slot.value)
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [retiring, setRetiring] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical value after every action, so the draft follows the
  // prop rather than diverging from it — a stale textarea next to a "saved as …" message is how a
  // second save writes the pre-canonical text back.
  //
  // Adjusted DURING RENDER rather than in an effect, which is React's own recipe for "some state
  // derives from a prop": an effect would paint the stale draft first and then re-render, and
  // `react-hooks/set-state-in-effect` rejects it for exactly that. Remounting on a `key` was the
  // other option and loses the result note at the moment it matters most — the note that says
  // "saved as <the canonical form>" appears precisely when the value changed.
  const [lastValue, setLastValue] = React.useState(slot.value)
  if (slot.value !== lastValue) {
    setLastValue(slot.value)
    setDraft(slot.value)
  }

  const editable = slot.editKind === 'text'
  const dirty = draft !== slot.value

  function run(action: () => Promise<AdminMemoryResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{slot.label}</h3>
          <code className="text-[11px] font-medium text-ink-3">{slot.key}</code>
        </div>
        <OriginBadge slot={slot} />
      </div>

      <Field
        label="Value"
        hint={editable ? slot.hint : undefined}
        error={result?.ok === false ? result.error : undefined}
      >
        <textarea
          aria-label={`${slot.label} value`}
          className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
          value={draft}
          maxLength={ADMIN_SLOT_VALUE_MAX}
          disabled={!editable || pending}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Field>

      {!editable && <p className="mt-2 text-[11px] font-medium text-ink-3">{slot.hint}</p>}

      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {editable && (
          <Button
            disabled={pending || !dirty || draft.trim().length === 0}
            onClick={() => run(() => saveSlotAction({ userId, key: slot.key, value: draft }))}
          >
            Save
          </Button>
        )}

        {/* Phase 5's own fallback for a refused value, offered explicitly rather than silently. */}
        {editable && result?.ok === false && draft.trim().length > 0 && (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(() => recordSlotAsFactAction({ userId, key: slot.key, value: draft }))
            }
          >
            Record it as a fact instead
          </Button>
        )}

        {slot.present && !retiring && (
          <Button variant="ghost" disabled={pending} onClick={() => setRetiring(true)}>
            Retire
          </Button>
        )}
      </div>

      {retiring && (
        <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
          <p className="mb-2 text-[12px] font-medium text-ink-2">
            The value is recorded in the ledger first, then the slot is removed from her prompt.
            Nothing is lost.
          </p>
          <Field label="Why (optional)">
            <input
              aria-label={`Why ${slot.key} is being retired`}
              className={CONTROL_CLASS}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={pending}
              onClick={() => {
                run(() => retireSlotAction({ userId, key: slot.key, reason }))
                setRetiring(false)
                setReason('')
              }}
            >
              Record and retire
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setRetiring(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/**
 * `pending_promises` — read-only, plus per-entry removal.
 *
 * Not editable as text because phase 5's `canonicalise` returns `null` for this key on purpose
 * ("a string is never a promise"): phase 13 has to evaluate `metric`, `target` and `byDate`
 * against precomputed facts, and a sentence cannot be evaluated. Removal is the one operation that
 * has to exist here — the slot is `merge` policy, so nothing in the runtime can ever drop an entry.
 */
function PromisesPanel({
  userId,
  slot,
  promises,
}: {
  userId: string
  slot: SlotCard
  promises: readonly NinaPendingPromise[]
}) {
  const [result, setResult] = React.useState<AdminMemoryResult | null>(null)
  const [pending, startTransition] = React.useTransition()

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{slot.label}</h3>
          <code className="text-[11px] font-medium text-ink-3">{slot.key}</code>
        </div>
        <OriginBadge slot={slot} />
      </div>

      <p className="mb-3 text-[11px] font-medium text-ink-3">{slot.hint}</p>

      {promises.length === 0 ? (
        <p className="text-[13px] font-medium text-ink-2">No pending promises.</p>
      ) : (
        <ul className="space-y-2">
          {promises.map((promise) => (
            <li key={promise.id} className="rounded-card border border-rule bg-paper-2 p-3">
              <p className="text-[13px] font-semibold text-ink">{promise.text}</p>
              <p className="mt-1 text-[12px] font-medium text-ink-2">{promise.condition}</p>
              <p className="mt-1 text-[11px] font-medium text-ink-3">
                {promise.status} &middot; {promise.metric}
                {promise.target !== null && <> &middot; target {promise.target}</>}
                {promise.targetKey !== null && <> &middot; {promise.targetKey}</>}
                {promise.byDate !== null && <> &middot; by {promise.byDate}</>} &middot; promised{' '}
                {promise.promisedOn}
              </p>
              <Button
                variant="ghost"
                className="mt-2"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(await removePendingPromiseAction({ userId, promiseId: promise.id }))
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {result?.ok === false && (
        <p className="mt-2 text-[11px] font-semibold text-red">{result.error}</p>
      )}
      {result?.ok === true && result.note && (
        <p className="mt-2 text-[11px] font-semibold text-accent">{result.note}</p>
      )}
    </Card>
  )
}
