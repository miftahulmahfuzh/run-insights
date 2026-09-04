import { describe, expect, it } from 'vitest'

import { MAX_BUBBLES, NinaSendPayloadSchema, describeNinaIssues } from './schema'

describe('NinaSendPayloadSchema', () => {
  it('accepts one to four bubbles', () => {
    for (let n = 1; n <= MAX_BUBBLES; n++) {
      const bubbles = Array.from({ length: n }, (_, i) => `bubble ${i}`)
      expect(NinaSendPayloadSchema.safeParse({ bubbles }).success).toBe(true)
    }
  })

  it('rejects a fifth bubble rather than truncating it', () => {
    // Phase 4's "already clamped to <= 4" is guaranteed by THIS, not by a slice.
    const bubbles = Array.from({ length: 5 }, (_, i) => `bubble ${i}`)
    expect(NinaSendPayloadSchema.safeParse({ bubbles }).success).toBe(false)
  })

  it('rejects zero bubbles and whitespace-only bubbles', () => {
    expect(NinaSendPayloadSchema.safeParse({ bubbles: [] }).success).toBe(false)
    expect(NinaSendPayloadSchema.safeParse({ bubbles: ['   '] }).success).toBe(false)
  })

  it('strips an unknown key instead of failing the whole payload', () => {
    const parsed = NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], vibe: 'smug' })
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'vibe' in parsed.data).toBe(false)
  })

  it('accepts memoryWrites and rejects a seventh', () => {
    const write = { kind: 'fact' as const, text: 'he hates hills' }
    expect(
      NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], memoryWrites: Array(6).fill(write) })
        .success,
    ).toBe(true)
    expect(
      NinaSendPayloadSchema.safeParse({ bubbles: ['hi'], memoryWrites: Array(7).fill(write) })
        .success,
    ).toBe(false)
  })
})

describe('describeNinaIssues', () => {
  it('names the failing field, which is the measured lever for the repair', () => {
    const parsed = NinaSendPayloadSchema.safeParse({ bubbles: [] })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(describeNinaIssues(parsed.error)).toContain('bubbles')
  })

  it('degrades to a string for a non-Zod error rather than throwing', () => {
    expect(describeNinaIssues(new Error('boom'))).toContain('boom')
  })
})
