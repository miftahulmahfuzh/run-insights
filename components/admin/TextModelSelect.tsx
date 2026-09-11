'use client'

import * as React from 'react'

import { CONTROL_CLASS } from '@/components/ui'
import {
  NARRATIVE_TEXT_MODEL_IDS,
  NARRATIVE_TEXT_MODEL_SPECS,
  type NarrativeTextModelId,
} from '@/lib/llm/catalog'
import { saveNarrativeTextModelAction } from '@/lib/admin/textModelActions'
import { cn } from '@/lib/cn'

/**
 * **Which GLM writes every text turn** — the dropdown half of the 2026-09-10 ask. The smallest
 * client surface this repo's conventions allow: a discrete control (a select's change IS the
 * finished edit — the same commit-on-change rule the Image Generation panel's checkboxes follow),
 * saving through its own action, with the status line as the whole result surface.
 *
 * ── WHY IT IS NOT A CONTROL ON `CharacterPanel` ─────────────────────────────────────────────
 * The character panel edits ONE row (`nina_tuning`) through ONE action with an idempotent
 * whole-row upsert; its draft/merge machinery assumes that shape. This select writes a different
 * row in a different store with a different blast radius — every text call in the app — so
 * bolting it into that draft would have meant one of two lies: a "field" that the tuning save
 * does not write, or a second action smuggled behind the panel's one-action invariant. Beside the
 * panel, not inside it, is the honest shape.
 *
 * ── OPTIMISTIC, AND WHY THAT IS SAFE ────────────────────────────────────────────────────────
 * The select moves the moment it is moved and reverts if the save fails, the way `MemoryTable`'s
 * cell reverts. One operator, one row, sequential dispatch: there is no second writer to conflict
 * with, and the value this control shows is what the next turn will resolve — `narrativeModel()`
 * reads the row live with no cache, so the next chat message, caption or insight is on the new
 * model with no invalidation step and no deploy.
 */

export interface TextModelSelectProps {
  /**
   * The model id as the setting resolves RIGHT NOW — `narrativeModel()` on the server, so it is
   * the effective id (a declared stored id, or the env default when nothing is set) and never a
   * raw value the vocabulary does not declare.
   */
  model: string
}

export function TextModelSelect({ model }: TextModelSelectProps) {
  const [value, setValue] = React.useState(model)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'failed'>('idle')

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    const previous = value
    setValue(next)
    setStatus('saving')
    const result = await saveNarrativeTextModelAction({ model: next })
    if (result.ok) {
      setStatus('idle')
      return
    }
    setValue(previous)
    setStatus('failed')
  }

  return (
    <section className="mb-6 rounded-card border border-rule bg-card px-5 py-5">
      <label className="block">
        <span className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
          Text model
          <span
            aria-live="polite"
            className={cn(
              'text-[11px] font-semibold',
              status === 'failed' ? 'text-red' : 'text-accent',
            )}
          >
            {status === 'saving' ? 'Saving…' : status === 'failed' ? 'Save failed' : 'Saved'}
          </span>
        </span>
        <select
          className={cn(CONTROL_CLASS, 'max-w-[280px]')}
          value={value}
          onChange={(event) => void onChange(event)}
        >
          {NARRATIVE_TEXT_MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {NARRATIVE_TEXT_MODEL_SPECS[id as NarrativeTextModelId].label}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block max-w-[52ch] text-[11px] font-medium text-ink-3">
          {NARRATIVE_TEXT_MODEL_SPECS[value as NarrativeTextModelId]?.hint ??
            'Which GLM writes her replies, captions, titles and the insights rollup. In force on the next call — no deploy.'}
        </span>
      </label>
    </section>
  )
}
