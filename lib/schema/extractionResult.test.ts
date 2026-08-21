import { describe, expect, it } from 'vitest'

import { EXTRACTION_ERROR_CODES } from '@/lib/extract/constants'
import {
  errorCopy,
  EXTRACTION_ERROR_COPY,
  ExtractRequestSchema,
  isTerminal,
} from './extractionResult'

/**
 * The wire contract. Everything here is a boundary a hostile or buggy client can reach, so every
 * refusal below is a refusal that matters.
 */

const BLOB =
  'https://abc123.public.blob.vercel-storage.com/shots/aBcDeFgHiJkL-xxxxxxxxxxxxxxxxxxxxxxx.jpg'
const ref = (over: Record<string, unknown> = {}) => ({
  url: BLOB,
  pathname: 'shots/aBcDeFgHiJkL-xxxxxxxxxxxxxxxxxxxxxxx.jpg',
  kind: 'summary',
  ...over,
})

describe('ExtractRequestSchema', () => {
  it('accepts one image', () => {
    // A 1-image upload is a first-class case, not a degraded one: the provenance guard nulls out
    // what the missing screens would have shown and everything else extracts normally.
    const parsed = ExtractRequestSchema.safeParse({ images: [ref()] })
    expect(parsed.success).toBe(true)
  })

  it('accepts three images with three different kinds', () => {
    const parsed = ExtractRequestSchema.safeParse({
      images: [
        ref({ kind: 'summary' }),
        ref({ kind: 'splits', pathname: 'shots/bBcDeFgHiJkL-yyyyyyyyyyyyyyyyyyyyyyy.jpg' }),
        ref({ kind: 'heartrate', pathname: 'shots/cBcDeFgHiJkL-zzzzzzzzzzzzzzzzzzzzzzz.jpg' }),
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects duplicate kinds', () => {
    // Two "Splits" screenshots would make `kindsPresent` claim a screen is covered while the real
    // screen is missing — the exact hole the provenance guard exists to close.
    const parsed = ExtractRequestSchema.safeParse({
      images: [ref({ kind: 'splits' }), ref({ kind: 'splits' })],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects zero and four images', () => {
    expect(ExtractRequestSchema.safeParse({ images: [] }).success).toBe(false)
    expect(ExtractRequestSchema.safeParse({ images: [ref(), ref(), ref(), ref()] }).success).toBe(
      false,
    )
  })

  it('rejects a url outside the Blob store — this is the SSRF boundary', () => {
    // The background job fetches these URLs SERVER-SIDE. Without this refinement, a crafted
    // request turns `/api/extract` into an SSRF primitive that reads the metadata endpoint and
    // base64s the result into a prompt.
    for (const url of [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/api/health',
      'https://evil.example.com/shots/x.jpg',
      'https://public.blob.vercel-storage.com.evil.com/x.jpg',
      'file:///etc/passwd',
    ]) {
      expect(ExtractRequestSchema.safeParse({ images: [ref({ url })] }).success).toBe(false)
    }
  })

  it('rejects a pathname outside our prefix and alphabet', () => {
    for (const pathname of [
      '../../etc/passwd',
      'shots/../secret.jpg',
      'other/aBcDeFgHiJkL-xxxxxxxxxxxxxxxxxxxxxxx.jpg',
      'shots/aBcDeFgHiJkL-xxxxxxxxxxxxxxxxxxxxxxx.png',
      'shots/short.jpg', // no random suffix — not a pathname Blob would have produced
    ]) {
      expect(ExtractRequestSchema.safeParse({ images: [ref({ pathname })] }).success).toBe(false)
    }
  })

  it('rejects an unknown kind, including run_photos’ own "other"', () => {
    // `run_photos.kind` allows 'other' (roadmap §4.3); extraction never does. A photo that fed no
    // extraction is F05/user territory, and `FIELD_SOURCES` has no row for it.
    expect(ExtractRequestSchema.safeParse({ images: [ref({ kind: 'other' })] }).success).toBe(false)
    expect(ExtractRequestSchema.safeParse({ images: [ref({ kind: 'zones' })] }).success).toBe(false)
  })

  it('defaults the optional dimension fields rather than requiring them', () => {
    // A browser that could not read the output's dimensions still gets to upload; §4.3 declares
    // all three nullable for exactly this reason.
    const parsed = ExtractRequestSchema.parse({ images: [ref()] })
    expect(parsed.images[0]).toMatchObject({ width: null, height: null, bytes: null })
  })
})

describe('the terminal-status contract', () => {
  it('treats only pending as non-terminal', () => {
    expect(isTerminal('pending')).toBe(false)
    expect(isTerminal('ok')).toBe(true)
    expect(isTerminal('repaired')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
  })

  it('has copy for every error code F04 can write', () => {
    // A failure with no sentence to show is a spinner that stops for no stated reason.
    for (const code of EXTRACTION_ERROR_CODES) {
      expect(EXTRACTION_ERROR_COPY[code]).toBeTruthy()
      expect(errorCopy(code)).toBe(EXTRACTION_ERROR_COPY[code])
    }
  })

  it('degrades to a generic sentence for an unknown code, and to null for none', () => {
    // F03's `failStalePendingExtractions` defaults to 'STALE_PENDING'; a row written before F04
    // pinned its codes must still render something.
    expect(errorCopy('STALE_PENDING')).toBeTruthy()
    expect(errorCopy(null)).toBeNull()
    expect(errorCopy(undefined)).toBeNull()
  })

  it('every failure either says nothing was saved, or offers the by-hand path', () => {
    // D1, in the copy layer. A failure sentence that leaves the runner unsure whether a run
    // landed is the worst possible outcome of a feature whose whole premise is "a human confirms
    // every run" — they would go looking for a run that is not there, or worse, not look.
    for (const code of EXTRACTION_ERROR_CODES) {
      const copy = EXTRACTION_ERROR_COPY[code]
      const saysNothingSaved = /nothing was saved/i.test(copy)
      const offersManualEntry = /by hand/i.test(copy)
      expect(saysNothingSaved || offersManualEntry).toBe(true)
      // And none of them may claim the opposite.
      expect(copy).not.toMatch(/\bwas saved\b(?<!nothing was saved)/i)
    }
  })
})
