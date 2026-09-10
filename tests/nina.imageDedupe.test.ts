import { describe, expect, it } from 'vitest'

import { planNinaImageWrite } from '@/lib/nina/imageDedupe'

/**
 * **The one dedup decision both hosts share, pinned.** `lib/nina/imagerun.ts` (in-platform) and
 * `scripts/nina-image-worker.ts` (the backstop) must not be able to disagree about what a deduped
 * write looks like, so the decision is a pure function with no imports and these are its answers.
 * No database, no network — the rule `tests/nina.imageworker.test.ts` states for its own suite.
 */

const KEEPER = {
  id: 'keeper000001',
  blobUrl: 'https://blob.test/nina/u1/selfie-keeper.png',
  pathname: 'nina/u1/selfie-keeper.png',
}

const FRESH = {
  blobUrl: 'https://blob.test/nina/u1/selfie-fresh-abcd.png',
  pathname: 'nina/u1/selfie-fresh-abcd.png',
}

/** NIST FIPS 180-4's SHA-256("abc") — the spelling the column stores. */
const HASH = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

describe('planNinaImageWrite', () => {
  it('writes an original when nothing shares the bytes, and releases nothing', () => {
    expect(planNinaImageWrite({ hit: null, stored: { ...FRESH, contentHash: HASH } })).toEqual({
      row: {
        blobUrl: FRESH.blobUrl,
        pathname: FRESH.pathname,
        sourceImageId: null,
        contentHash: HASH,
      },
      release: null,
    })
  })

  it('writes a null hash when the purpose is out of dedup scope, and that is honest', () => {
    // The avatar purpose: hashed by nobody, deduped by nobody. NULL means "no claim was made",
    // which is invariant 9's meaning for the column — not a missing one.
    expect(planNinaImageWrite({ hit: null, stored: { ...FRESH, contentHash: null } })).toEqual({
      row: {
        blobUrl: FRESH.blobUrl,
        pathname: FRESH.pathname,
        sourceImageId: null,
        contentHash: null,
      },
      release: null,
    })
  })

  it('on the skip path the row references the keeper and nothing is released (nothing was put)', () => {
    // The caller passes the KEEPER's own location as `stored` when it skipped the put — the
    // pathname comparison is what makes skip and race one function.
    const plan = planNinaImageWrite({
      hit: KEEPER,
      stored: { blobUrl: KEEPER.blobUrl, pathname: KEEPER.pathname, contentHash: HASH },
    })
    expect(plan.row).toEqual({
      blobUrl: KEEPER.blobUrl,
      pathname: KEEPER.pathname,
      sourceImageId: KEEPER.id,
      contentHash: HASH,
    })
    expect(plan.release).toBeNull()
  })

  it('on the race path the row references the keeper and the fresh loser bytes are released', () => {
    // ROW FIRST, BLOB SECOND: the release travels in the plan; the caller inserts the row first.
    const plan = planNinaImageWrite({ hit: KEEPER, stored: { ...FRESH, contentHash: HASH } })
    expect(plan.row.blobUrl).toBe(KEEPER.blobUrl)
    expect(plan.row.sourceImageId).toBe(KEEPER.id)
    expect(plan.release).toEqual({ blobUrl: FRESH.blobUrl, pathname: FRESH.pathname })
  })

  it('keeps the hash on the reference row: the column is about the bytes, and they are the same', () => {
    // Invariant 4's one semantics — identical hash ⟺ identical bytes in the store — holds for a
    // reference row too, because it displays exactly the keeper's bytes.
    const plan = planNinaImageWrite({ hit: KEEPER, stored: { ...FRESH, contentHash: HASH } })
    expect(plan.row.contentHash).toBe(HASH)
  })
})
