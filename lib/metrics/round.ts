/**
 * Largest-remainder (Hamilton) apportionment — a direct port of
 * `expense-tracking/lib/stats/series.ts`'s `largestRemainderPct`, renamed for this domain.
 *
 * Naive per-row rounding makes a column of five zone percentages add up to 99 or 101. Readers
 * notice, and a reader who catches the app failing at arithmetic they can do in their head has no
 * reason to trust the arithmetic they cannot (D2's whole argument, one layer up).
 *
 * ── DISPLAY LAYER ONLY ──────────────────────────────────────────────────────────────────────
 * **Never call this before a threshold comparison.** `hardPct`, the ACWR band, and every flag in
 * `flags.ts` compare RAW floats. Round first and a zone sitting at 69.6% can be promoted to 70%
 * and trip `TOO_MUCH_HARD` — a flag fired by a rounding artefact, on a run that never crossed the
 * line. The order is: compare raw, then round for the screen.
 */

/**
 * `values` are shares in any unit (zone seconds, here). Returns integers summing to exactly 100
 * whenever the total is positive, and all zeros when it is not.
 *
 * Ties break on the earlier index, so the output is deterministic for equal inputs — three equal
 * zones give `[34, 33, 33]`, never a different permutation between renders.
 */
export function roundSharesTo100(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)

  const exact = values.map((v) => (v / total) * 100)
  const out = exact.map((v) => Math.floor(v))
  let remaining = 100 - out.reduce((a, b) => a + b, 0)

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
    const i = order[k]!.i
    out[i] = out[i]! + 1
  }
  return out
}
