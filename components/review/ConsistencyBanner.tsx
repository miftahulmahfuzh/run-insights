'use client'

import type { CheckResult } from '@/lib/review/checks'

/**
 * What the arithmetic found, and — just as important — what it did not.
 *
 * **The honesty constraint lives in the copy as much as in the code.** `splitsSumVsDuration` knows
 * that the eleven split times do not add up to the duration; it does not know which row is wrong.
 * So its message says "one of the 11 splits below looks off" and its Jump lands on the block, not
 * on a row. Pointing at row 7 with false confidence would be worse than pointing at nothing:
 * a reviewer who follows a flag to the wrong number and finds it correct learns to ignore flags.
 *
 * `role="alert"` when something failed, `role="status"` when nothing did. Both are announced;
 * only the first interrupts. The all-clear line is not decoration — on a clean extraction it is
 * the only feedback that the checks ran at all, and without it "no banner" is indistinguishable
 * from "no checking happened".
 */

export function ConsistencyBanner({
  checks,
  onJump,
}: {
  checks: CheckResult[]
  /** Resolves `fieldPaths[0]` to a block and scrolls it into view. */
  onJump: (fieldPath: string) => void
}) {
  const failing = checks.filter((c) => !c.ok)

  if (failing.length === 0) {
    return (
      <div role="status" aria-live="polite" className="rounded-card bg-card p-4 shadow-card">
        <p className="text-[13px] font-semibold text-ink">The numbers agree with each other</p>
        <p className="mt-1 max-w-[40ch] text-[12px] font-medium text-ink-2">
          Splits and zones both add up to the duration, and distance times pace matches it. Nothing
          here needs a second look — but the screenshots are above if you want one.
        </p>
      </div>
    )
  }

  return (
    <div role="alert" aria-live="polite" className="rounded-card bg-warn-soft p-4 shadow-card">
      <p className="text-[13px] font-semibold text-ink">
        {failing.length === 1
          ? '1 thing worth checking'
          : `${failing.length} things worth checking`}
      </p>
      <ul className="mt-3 space-y-3">
        {failing.map((check) => (
          <li key={check.id} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />
            <p className="flex-1 text-[12px] leading-[1.5] font-medium text-ink">{check.message}</p>
            {check.fieldPaths[0] && (
              <button
                type="button"
                onClick={() => onJump(check.fieldPaths[0]!)}
                className="shrink-0 rounded-chip px-2 py-1 text-[11px] font-semibold text-accent"
              >
                Jump
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] font-medium text-ink-2">
        These are hints from arithmetic, not rules. If you have looked at the screenshot and the
        numbers are right, save anyway.
      </p>
    </div>
  )
}
