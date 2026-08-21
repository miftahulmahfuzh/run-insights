'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { ensureMonthInsight, ensureRunInsight, ensureWeekInsight } from '@/lib/insights/actions'

/**
 * The suspended half of F07's card. **Renders nothing on the happy path.**
 *
 * ── WHY A CLIENT EFFECT AND NOT `await` IN THE PAGE ───────────────────────────────────────────
 * Generating an insight is a 10–35 s model call on a cache miss. The run detail page's numbers
 * are stored, deterministic and already correct, and F06 shipped before F07 so that screen would
 * be complete without prose (§7.2). Awaiting the model in the page's own render path would trade
 * a fully useful screen for a blank one, for half a minute, on the one day the vendor is slow.
 *
 * So: the server renders everything it has, this fires afterwards, and when a new row lands it
 * asks Next to re-render the server component — which reads the row through the same
 * `getLatestInsight` call the first render used. There is exactly one code path that renders an
 * insight, and it is not this file.
 *
 * ── WHY IT FIRES EVEN WHEN AN INSIGHT ALREADY EXISTS ──────────────────────────────────────────
 * A cache HIT is one indexed read plus a hash, and it is the only thing that notices a *stale*
 * insight: the facts move when a split is corrected, when the observed HRmax ceiling rises, or
 * when the runner answers the intent question. Firing only on an empty card would mean corrected
 * numbers keep their old prose until something else happened to regenerate them. The action
 * returns `{ changed: false }` on a hit and nothing re-renders.
 *
 * ── THE THREE VISIBLE STATES ──────────────────────────────────────────────────────────────────
 *   1. an insight is already on screen → this renders nothing, ever, even while working;
 *   2. no insight yet, work in flight → one quiet line, no spinner, no skeleton (the card already
 *      reserves its height, so nothing moves when the prose arrives);
 *   3. no insight, model unavailable → R-17's honest state. Not an error, not a retry button: the
 *      next view of this page tries again for free, because a failure persists nothing.
 */

type Target = { scope: 'session'; runId: string } | { scope: 'week' | 'month'; periodKey: string }

export function InsightTrigger({
  target,
  hasInsight,
  enabled = true,
}: {
  target: Target
  /** Whether the server already rendered prose. Controls only what this shows, not what it does. */
  hasInsight: boolean
  /** False for a run with nothing worth narrating yet — an unreviewed draft, an empty week. */
  enabled?: boolean
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'unavailable'>('idle')
  // React runs effects twice in development's StrictMode. Without this the first page view of
  // every run would fire two model calls, race them, and let the unique index sort it out.
  const fired = useRef(false)

  useEffect(() => {
    if (!enabled || fired.current) return
    fired.current = true

    let alive = true
    setState('working')
    void (async () => {
      const result =
        target.scope === 'session'
          ? await ensureRunInsight(target.runId)
          : target.scope === 'week'
            ? await ensureWeekInsight(target.periodKey)
            : await ensureMonthInsight(target.periodKey)

      if (!alive) return
      setState(result.unavailable ? 'unavailable' : 'done')
      if (result.changed) router.refresh()
    })()

    return () => {
      alive = false
    }
  }, [enabled, router, target])

  if (hasInsight) return null

  if (state === 'working') {
    return (
      <p className="mt-3 text-[12px] font-medium text-ink-3">The coach is reading your numbers…</p>
    )
  }

  if (state === 'unavailable') {
    return (
      <p className="mt-3 text-[12px] font-medium text-ink-3">
        The coach&rsquo;s take isn&rsquo;t available right now. Nothing else on this screen depends
        on it.
      </p>
    )
  }

  return null
}
