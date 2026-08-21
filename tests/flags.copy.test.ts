import { describe, expect, it } from 'vitest'

import { FLAG_CODES, flagCopy } from '@/lib/flags/copy'
import { evaluateSessionFlags } from '@/lib/metrics'
import { computeSessionMetrics } from '@/lib/metrics/session'
import { canonicalSession } from './fixtures/canonicalRun'

describe('every flag F06 can fire has a sentence', () => {
  it('covers the whole FlagCode union', () => {
    // If F06 adds a code, this fails here rather than rendering an empty chip in production.
    for (const code of FLAG_CODES) {
      const copy = flagCopy({ code, severity: 'warn', value: 12.3 })
      expect(copy.title.length).toBeGreaterThan(0)
      expect(copy.detail.length).toBeGreaterThan(0)
    }
  })

  it('never scolds: no exclamation marks, no emoji, no second-person accusation', () => {
    for (const code of FLAG_CODES) {
      const { title, detail } = flagCopy({ code, severity: 'warn', value: 12.3 })
      const text = `${title} ${detail}`
      expect(text).not.toMatch(/!/)
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text.toLowerCase()).not.toMatch(/\byou (slowed|faded|went out|need to)\b/)
    }
  })
})

describe('the canonical run’s own flags, in the words the screen shows', () => {
  const metrics = computeSessionMetrics(canonicalSession, { bpm: 189, source: 'observed' })
  const flags = evaluateSessionFlags(
    metrics,
    canonicalSession.splits.find((s) => !s.partial) ?? null,
  )

  it('quotes F06’s measured values rather than re-deriving them', () => {
    const byCode = new Map(flags.map((f) => [f.code, flagCopy(f)]))

    // +41 s/km and −18 spm are roadmap §4.9's own fixture constants.
    expect(byCode.get('POSITIVE_SPLIT')?.detail).toContain('+41 s/km')
    expect(byCode.get('CADENCE_FADE')?.detail).toContain('18 spm')
    // 90.6% Z4+Z5, the number the design brief asks to make unmissable.
    expect(byCode.get('TOO_MUCH_HARD')?.detail).toBe('90.6% of this run was in zones 4 and 5.')
  })
})
