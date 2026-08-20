import { describe, expect, it } from 'vitest'

import {
  ID_LENGTH,
  SHARE_TOKEN_LENGTH,
  isValidId,
  isValidShareToken,
  newExtractionId,
  newId,
  newInsightId,
  newPhotoId,
  newRunId,
  newShareToken,
} from '@/lib/id'

const ALPHABET_RE = /^[0-9A-Za-z_-]+$/

describe('lib/id', () => {
  it('generates 12-character ids by default (roadmap §4.3: nanoid(12))', () => {
    expect(ID_LENGTH).toBe(12)
    for (const make of [newId, newRunId, newExtractionId, newPhotoId, newInsightId]) {
      const id = make()
      expect(id).toHaveLength(12)
      expect(id).toMatch(ALPHABET_RE)
    }
  })

  it('generates 16-character share tokens (roadmap §4.3: nanoid(16))', () => {
    expect(SHARE_TOKEN_LENGTH).toBe(16)
    const token = newShareToken()
    expect(token).toHaveLength(16)
    expect(token).toMatch(ALPHABET_RE)
  })

  it('honours an explicit size', () => {
    expect(newId(1)).toHaveLength(1)
    expect(newId(32)).toHaveLength(32)
  })

  it('never repeats across 20 000 ids', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 20_000; i++) seen.add(newRunId())
    expect(seen.size).toBe(20_000)
  })

  it('uses the whole 64-symbol alphabet (uniform byte & 63 mapping, no modulo bias)', () => {
    const symbols = new Set<string>()
    for (let i = 0; i < 5_000; i++) for (const ch of newRunId()) symbols.add(ch)
    expect(symbols.size).toBe(64)
  })

  it('isValidId accepts what newRunId produces and rejects everything else', () => {
    expect(isValidId(newRunId())).toBe(true)
    expect(isValidId(newShareToken())).toBe(false) // 16 chars is a token, not an id
    expect(isValidId('short')).toBe(false)
    expect(isValidId('twelve chars')).toBe(false) // space is not in the alphabet
    expect(isValidId('abcdefghijk!')).toBe(false)
    expect(isValidId(null)).toBe(false)
    expect(isValidId(12)).toBe(false)
    expect(isValidId(undefined)).toBe(false)
  })

  it('isValidShareToken accepts what newShareToken produces and rejects everything else', () => {
    expect(isValidShareToken(newShareToken())).toBe(true)
    expect(isValidShareToken(newRunId())).toBe(false)
    expect(isValidShareToken('0123456789abcde/')).toBe(false)
    expect(isValidShareToken({})).toBe(false)
  })
})
