'use client'

import * as React from 'react'

import { CONTROL_CLASS } from '@/components/ui'
import {
  NINA_CHAT_FALLBACK_MODEL_IDS,
  NINA_CHAT_FALLBACK_MODEL_SPECS,
  type NinaChatFallbackModelId,
} from '@/lib/nina/openrouter'
import { saveChatFallbackModelAction } from '@/lib/admin/chatFallbackModelActions'
import { cn } from '@/lib/cn'

/**
 * **Which model rescues a chat turn when z.ai fails** — `TextModelSelect`'s exact shape, one
 * `app_settings` row over. A discrete control (a select's change IS the finished edit), saving
 * through its own action, with the status line as the whole result surface. See
 * `TextModelSelect`'s own docstring for why this is optimistic-with-revert and why it lives beside
 * `CharacterPanel` rather than inside it — every word of that reasoning applies here unchanged,
 * against a different `app_settings` key.
 *
 * ── WHY A SEPARATE COMPONENT AND NOT A SECOND OPTION LIST ON `TextModelSelect` ─────────────────
 * The two selects answer different questions to different vocabularies — `glm-5.3` vs.
 * `z-ai/glm-5.3-flash`, an OpenRouter slug — and `ninaChatFallbackModel()` reads a different row
 * than `narrativeModel()`. One dropdown cannot serve two catalogs without a second control hidden
 * inside it, which is the same "one action per row" argument `textModelActions.ts`'s header makes.
 */

export interface ChatFallbackModelSelectProps {
  /**
   * The model id as the setting resolves RIGHT NOW — `ninaChatFallbackModel()` on the server, so
   * it is the effective id (a declared stored id, or the default when nothing is set) and never a
   * raw value the vocabulary does not declare.
   */
  model: string
}

export function ChatFallbackModelSelect({ model }: ChatFallbackModelSelectProps) {
  const [value, setValue] = React.useState(model)
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'failed'>('idle')

  async function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    const previous = value
    setValue(next)
    setStatus('saving')
    const result = await saveChatFallbackModelAction({ model: next })
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
          Fallback model
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
          {NINA_CHAT_FALLBACK_MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {NINA_CHAT_FALLBACK_MODEL_SPECS[id as NinaChatFallbackModelId].label}
            </option>
          ))}
        </select>
        <span className="mt-1.5 block max-w-[52ch] text-[11px] font-medium text-ink-3">
          {NINA_CHAT_FALLBACK_MODEL_SPECS[value as NinaChatFallbackModelId]?.hint ??
            'Which model answers via OpenRouter when z.ai fails. In force on the next fallback attempt — no deploy.'}
        </span>
      </label>
    </section>
  )
}
