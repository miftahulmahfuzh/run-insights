/**
 * The one line of state the reviewer reads before committing — written once, here.
 *
 * It used to live inside `ReviewClient` as a small JSX component, and that placement is the reason
 * it shipped saying **`1 check still disagree`** for as long as it did. Two facts combined:
 *
 *   - This repo has no jsdom and no `@testing-library/react`; vitest runs node-env only. A private
 *     function inside a `'use client'` file is therefore not merely untested but *unreachable* from
 *     a test, so there was nowhere to put the assertion that would have caught it.
 *   - The bug then rode out on the front page. The sticky bar is `position: fixed`, so every
 *     photograph of the review screen carries this sentence — F19 committed two stills and a GIF,
 *     and `README.md` quoted the broken string as though it were the intended copy.
 *
 * None of the five states below renders any markup, so being a component bought nothing and cost
 * the test. A pure function returning a string is the whole of what this needs to be.
 *
 * ── WHY THE CLAUSE IS ONE TERNARY AND NOT TWO PIECES ───────────────────────────────────────────
 * The original read:
 *
 *     {failing === 1 ? '1 check' : `${failing} checks`} still disagree
 *
 * The **noun** was inside the ternary and the **verb** was outside it, in the JSX that followed,
 * where no count could reach it. So the plural reading was right and the singular reading had a
 * subject-verb disagreement — on the one screen in this app whose entire purpose is the careful
 * reading of small numbers.
 *
 * Adding the missing `s` to a singular branch would have left the verb outside the ternary, one
 * edit away from the same bug. So the whole clause moves in, and singular and plural are two
 * complete sentences that cannot drift apart. Any future count-and-verb sentence here should be
 * built the same way.
 */

/**
 * @param failingCount how many of the four consistency checks are currently unhappy
 * @param editedCount how many fields differ from the extractor's own values
 * @param mode `review` is a first pass over a model's guess; `edit` is a correction of a saved run
 * @param hasNumbers whether the draft has enough to commit at all — distance and duration
 */
export function commitStatusLine({
  failingCount,
  editedCount,
  mode,
  hasNumbers,
}: {
  failingCount: number
  editedCount: number
  mode: 'review' | 'edit'
  hasNumbers: boolean
}): string {
  if (!hasNumbers) return 'Fill in at least the distance and the duration.'

  const edits = editedCount === 1 ? '1 correction' : `${editedCount} corrections`

  if (failingCount > 0) {
    // Subject and verb in one string each — see the note above.
    const disagreement =
      failingCount === 1 ? '1 check still disagrees' : `${failingCount} checks still disagree`
    // "save anyway" is deliberate and is F05's whole posture: the checks are hints from arithmetic,
    // not rules, and the button is never disabled for failing one.
    return `${disagreement}${editedCount > 0 ? ` · ${edits}` : ''} — save anyway if the screenshots say otherwise.`
  }

  if (editedCount === 0) {
    return mode === 'edit' ? 'Nothing changed yet.' : 'Everything checks out. Nothing corrected.'
  }

  return `Everything checks out · ${edits}.`
}
