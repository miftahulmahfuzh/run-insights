/**
 * The y-axis label both pace charts render, with the config that draws it.
 *
 * "Up is always faster" is a global rule in this app — §3.1 inverts the pace axis, and §3.6 must
 * not make a reader relearn it — so the axis says so in words, not only by reversal. One constant,
 * two charts: a third pace axis would inherit the sentence and the rotation together instead of
 * hand-copying a third literal.
 *
 * Lives beside the charts rather than in `lib/charts`, whose barrel is pure data — a rendered
 * label is presentation, and the barrel's own constitution excludes it.
 */
export const PACE_AXIS_LABEL = {
  value: 'PACE (FASTER ↑)',
  angle: -90,
  position: 'insideLeft',
  offset: 8,
} as const
