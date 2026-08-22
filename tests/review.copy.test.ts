import { describe, expect, it } from 'vitest'

import { commitStatusLine } from '@/lib/review/copy'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  **The test that could not have existed before the copy moved.**
 *
 *  `commitStatusLine` was a JSX component private to `ReviewClient.tsx`. This repo has no jsdom
 *  and no `@testing-library/react` — vitest runs node-env only — so there was no way to reach it,
 *  and it shipped reading `1 check still disagree` into two committed screenshots and a GIF on the
 *  README's front page.
 *
 *  So the agreement invariant below is the point of the file, and the five state cases are the
 *  regression net around the move.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Everything present and correct, which each case then perturbs one field of. */
const clean = { failingCount: 0, editedCount: 0, mode: 'review' as const, hasNumbers: true }

describe('the subject agrees with its verb, at every count', () => {
  /*
   * THE BUG, AS AN ASSERTION.
   *
   * The original built the sentence from two pieces — `failing === 1 ? '1 check' : 'N checks'`
   * followed by a bare `still disagree` in the JSX after it. The noun counted and the verb could
   * not, because it sat outside the ternary. Nothing in the type system objects to that, and no
   * unit test could see it.
   */
  it.each([1, 2, 3, 4, 5])('%i failing check(s) conjugates correctly', (failingCount) => {
    const line = commitStatusLine({ ...clean, failingCount })

    if (failingCount === 1) {
      expect(line).toContain('1 check still disagrees')
      // The exact shape of the shipped bug. If this ever passes again, so has the bug.
      expect(line).not.toContain('1 check still disagree —')
    } else {
      expect(line).toContain(`${failingCount} checks still disagree`)
      expect(line).not.toContain('disagrees')
    }
  })

  it('never pairs a singular subject with a plural verb, or the reverse', () => {
    for (let failingCount = 1; failingCount <= 5; failingCount++) {
      const line = commitStatusLine({ ...clean, failingCount })
      const singularSubject = /\b1 check\b/.test(line)
      // `\b` after the `e` is what separates the two: `disagrees` does not match.
      const pluralVerb = /\bdisagree\b/.test(line)
      // One of the two readings, never a mix of them.
      expect(singularSubject && pluralVerb).toBe(false)
    }
  })
})

describe('the five states, in the words the sticky bar shows', () => {
  it('asks for the two numbers it cannot commit without', () => {
    // Before distance and duration exist, no check has anything to disagree about — so the line is
    // an instruction rather than a verdict, whatever the other counts say.
    expect(commitStatusLine({ ...clean, hasNumbers: false, failingCount: 3, editedCount: 2 })).toBe(
      'Fill in at least the distance and the duration.',
    )
  })

  it('states the failure and then gives permission to ignore it', () => {
    // F05's posture: the checks are hints from arithmetic, not rules, and the button is never
    // disabled for failing one. The sentence has to say so, or a reviewer reads it as a block.
    expect(commitStatusLine({ ...clean, failingCount: 1 })).toBe(
      '1 check still disagrees — save anyway if the screenshots say otherwise.',
    )
  })

  it('carries the correction count alongside the failure when there is one', () => {
    expect(commitStatusLine({ ...clean, failingCount: 2, editedCount: 1 })).toBe(
      '2 checks still disagree · 1 correction — save anyway if the screenshots say otherwise.',
    )
    expect(commitStatusLine({ ...clean, failingCount: 1, editedCount: 4 })).toBe(
      '1 check still disagrees · 4 corrections — save anyway if the screenshots say otherwise.',
    )
  })

  it('distinguishes a first pass from a correction of a saved run', () => {
    // Same state, two different truths: on a fresh extraction nothing has been corrected *yet*;
    // on a saved run, nothing has changed at all and there is nothing to save.
    expect(commitStatusLine({ ...clean, mode: 'review' })).toBe(
      'Everything checks out. Nothing corrected.',
    )
    expect(commitStatusLine({ ...clean, mode: 'edit' })).toBe('Nothing changed yet.')
  })

  it('counts corrections on a clean draft', () => {
    expect(commitStatusLine({ ...clean, editedCount: 1 })).toBe(
      'Everything checks out · 1 correction.',
    )
    expect(commitStatusLine({ ...clean, editedCount: 7 })).toBe(
      'Everything checks out · 7 corrections.',
    )
  })
})

describe('the tone rules F06 made operational apply here too', () => {
  const everyState = [
    { ...clean, hasNumbers: false },
    { ...clean, failingCount: 1 },
    { ...clean, failingCount: 3, editedCount: 2 },
    { ...clean, mode: 'edit' as const },
    { ...clean },
    { ...clean, editedCount: 5 },
  ]

  it('never scolds: no exclamation marks, no emoji, no second-person accusation', () => {
    for (const state of everyState) {
      const line = commitStatusLine(state)
      expect(line.length).toBeGreaterThan(0)
      expect(line).not.toMatch(/!/)
      expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(line.toLowerCase()).not.toMatch(/\byou (got|entered|need to|should)\b/)
    }
  })

  it('is one sentence, so it fits the bar it is centred in', () => {
    // The bar is 11px text inside a max-w-[470px] column. Two sentences wrap to three lines and
    // push the button down; the failing state is the longest and is the one to hold the line.
    for (const state of everyState) {
      expect(commitStatusLine(state).length).toBeLessThan(100)
    }
  })
})
