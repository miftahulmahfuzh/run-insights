'use client'

import * as React from 'react'

import { formatJobSeconds, jobElapsedSeconds } from '@/lib/nina/jobview'

/**
 * **R1's "how long the job has been going on", ticking.**
 *
 * ── WHY IT TAKES `nowMs` AS A PROP AND STILL READS `Date.now()` ───────────────────────────────
 * Hydration. The server renders this component with the clock it read during the render; if the
 * first CLIENT render read `Date.now()` instead, the two strings would differ by however long the
 * payload spent on the wire and React would report a mismatch on a screen whose whole content is
 * a number. So the first render on both sides is `nowMs - startedAtMs`, from props, and the
 * browser's own clock is only consulted from the interval — after mount, where a difference is a
 * tick rather than a mismatch. `app/nina/page.tsx` hoists `todayInJakarta()` out of `<ChatScreen>`
 * for exactly this reason and states it.
 *
 * ── WHY THERE IS NO ANIMATION (INVARIANT 8) ───────────────────────────────────────────────────
 * A number that changes is not a transition and not a keyframe. Nothing here is animated, nothing
 * pulses, and `tests/motion.reducedMotion.test.ts` has nothing to guard.
 *
 * ── `running: false` IS NOT A DEGRADED CASE ───────────────────────────────────────────────────
 * `nina_turns` has NO `finished_at` column, so a terminal job has no recorded wall-clock end and
 * counting up from `created_at` forever would be a lie that gets worse every second. The caller
 * passes `running: false` for a closed job and renders `latency_ms` beside this instead — see the
 * phase plan's D4. This component then renders one frozen string and starts no timer.
 *
 * ── NO `className` PROP ────────────────────────────────────────────────────────────────────────
 * Both callers (`NinaJobDetail`, `NinaJobList`) render the bare span — neither has ever passed a
 * class — so the prop was a second way to render a number, waiting, and came back out (the rule
 * `RunDateLink` applied when its `label` override came back out).
 */
export function NinaJobElapsed({
  startedAtMs,
  nowMs,
  running,
}: {
  startedAtMs: number
  /** The clock at render, from the server. Both first renders use it; see the header. */
  nowMs: number
  running: boolean
}) {
  const [seconds, setSeconds] = React.useState(() => jobElapsedSeconds(startedAtMs, nowMs))

  React.useEffect(() => {
    if (!running) return

    /* Re-derived from the clock every time rather than incremented, so a throttled background tab
       catches up on its next tick instead of drifting. */
    const tick = () => setSeconds(jobElapsedSeconds(startedAtMs, Date.now()))

    /*
     * ── WHY THE WIRE-TIME CORRECTION IS A 0 ms TIMER AND NOT A CALL IN THE EFFECT BODY ────────
     * The first paint deliberately shows the SERVER's reading (see the header), so it is behind by
     * however long the payload spent on the wire — a correction is owed, and the interval would
     * not deliver it for a whole second.
     *
     * Calling `tick()` here directly is the obvious form and this repo rejects it:
     * `react-hooks/set-state-in-effect` is an error, and `ChatScreen`'s `seenInitial` block and
     * `NinaSearchField`'s `result` state both restructured rather than disabled it, for React's own
     * stated reason. A timer IS the external system this effect subscribes to, and setting state
     * from its callback is the shape the rule exists to allow — so the correction rides the same
     * clock as every later tick instead of cascading a render inside the commit.
     */
    const first = window.setTimeout(tick, 0)
    const handle = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(handle)
    }
  }, [running, startedAtMs])

  return <span suppressHydrationWarning>{formatJobSeconds(seconds)}</span>
}
