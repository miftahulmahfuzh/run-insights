import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  EXTRACTION_SHAPE,
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserContent,
  buildRepairRequestText,
} from './extraction'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE FROZEN PROMPT, PINNED BY HASH. Rules 1–7 and SHAPE scored 108/108 and are byte-frozen.
 *
 *  Every expected value below is the sha-256 of the value at `origin/main` @ 7e285b3, computed
 *  from that commit's file (`git show 7e285b3:lib/llm/prompts/extraction.ts`), never from the
 *  working copy. If one of these fails, the change under test altered the measured request — revert
 *  it. Do NOT "update the hash": a new hash needs a re-run of `research/run-extract.mjs` first.
 *
 *  The user turns are pinned too, because the request is more than the two strings: the intro
 *  sentence is chosen by comparing the image count to the number of PRIMARY kinds, and comparing it
 *  to the widened `SCREEN_KINDS` (four, since Workout Details) would silently change every
 *  three-image request while both strings still hashed the same.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

describe('the frozen extraction prompt (origin/main @ 7e285b3)', () => {
  it('EXTRACTION_SYSTEM_PROMPT is byte-identical', () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toHaveLength(2816)
    expect(sha(EXTRACTION_SYSTEM_PROMPT)).toBe(
      '23c82197c6ae148b42a9a3a157ba505431d33da01a6e75a0d17d995868633411',
    )
  })

  it('EXTRACTION_SHAPE is byte-identical', () => {
    expect(EXTRACTION_SHAPE).toHaveLength(1218)
    expect(sha(EXTRACTION_SHAPE)).toBe(
      '6dc42e9915b10e93d34f0a7e28998fe79fdff83c3cfd95cc2107f852dc3af3ba',
    )
  })

  it('the three-screen user turn is byte-identical', () => {
    const parts = buildExtractionUserContent([
      { kind: 'summary', dataUri: 'data:a' },
      { kind: 'splits', dataUri: 'data:b' },
      { kind: 'heartrate', dataUri: 'data:c' },
    ])
    expect(sha(JSON.stringify(parts))).toBe(
      '12338a24474acbff6aab2533afb1d060ac276f59ed72bd1588144f4dccebd5a4',
    )
  })

  it('a two-screen user turn is byte-identical', () => {
    const parts = buildExtractionUserContent([
      { kind: 'summary', dataUri: 'data:a' },
      { kind: 'heartrate', dataUri: 'data:c' },
    ])
    expect(sha(JSON.stringify(parts))).toBe(
      'ca4bbadf53f55061f00bf87c9d4043dc2ff1b7a45a15bb45a62b76f61af27754',
    )
  })

  it('the repair request text is byte-identical', () => {
    expect(sha(buildRepairRequestText(['summary', 'heartrate']))).toBe(
      'be86bea4b12f0b460061b40a1a924405476a9d8f51cbbc5789c043562add8c56',
    )
  })
})
