'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  POLL_INTERVALS_MS,
  POLL_LATE_AFTER_ATTEMPTS,
  POLL_MID_AFTER_ATTEMPTS,
  STALE_PENDING_MS,
} from '@/lib/extract/constants'
import { isTerminal, type ExtractionResult } from '@/lib/schema/extractionResult'

/**
 * The poll, with the backoff schedule from plan §4.4 and the client-side give-up.
 *
 * Backoff: 2 s, then 3 s after the 4th attempt, then 5 s after the 10th, capped there. Against a
 * 33.7 s median that delivers the result within one interval of it actually finishing in the
 * common case, without hammering the endpoint through the slow tail.
 *
 * Giving up: after `STALE_PENDING_MS` without a terminal status this stops polling and reports
 * `gaveUp`. It does not spin forever, and it does not need to — the same 90 s threshold makes the
 * server flip the row to `failed`/`stale_timeout` on the very next read, so one "check again" tap
 * always reaches a terminal answer.
 */

export function pollDelayFor(attempts: number): number {
  if (attempts >= POLL_LATE_AFTER_ATTEMPTS) return POLL_INTERVALS_MS.late
  if (attempts >= POLL_MID_AFTER_ATTEMPTS) return POLL_INTERVALS_MS.mid
  return POLL_INTERVALS_MS.initial
}

export interface ExtractionStatusState {
  result: ExtractionResult | null
  /** Transport-level failure of the POLL itself — not an extraction failure. */
  pollError: string | null
  /** Stopped polling because 90 s passed with no terminal status. */
  gaveUp: boolean
  /** Seconds since the extraction row was created. Drives the honest elapsed counter (R-41). */
  elapsedSec: number
  /** Force one more poll — the "check again" button after giving up. */
  refresh: () => void
}

export function useExtractionStatus(
  extractionId: string,
  /**
   * The server render's own read of the row. REQUIRED, not optional, for two reasons: a reload
   * lands on the right screen instead of flashing a skeleton while the first poll goes out, and
   * `createdAt` gives the elapsed counter a real origin. Without it the fallback would be
   * `Date.now()` during render, which is impure and would make the counter jump on every
   * re-render (react-hooks/purity catches exactly this).
   */
  initial: ExtractionResult,
): ExtractionStatusState {
  const [result, setResult] = useState<ExtractionResult | null>(initial)
  const [pollError, setPollError] = useState<string | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)

  // The clock runs from the row's own createdAt, so a reopened tab shows the TRUE elapsed time
  // rather than restarting at zero and claiming the wait just began — which would be the same
  // class of dishonesty R-41 removed from the progress copy.
  const startedAtRef = useRef<number>(new Date(initial.createdAt).getTime())
  const attemptsRef = useRef(0)
  const settled = result !== null && isTerminal(result.status)

  const refresh = useCallback(() => {
    setGaveUp(false)
    setPollError(null)
    attemptsRef.current = 0
  }, [])

  /* The elapsed counter. One interval, independent of the poll, so the number keeps moving
   * smoothly between polls instead of jumping every few seconds. */
  useEffect(() => {
    if (settled) return
    const tick = () =>
      setElapsedSec(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [settled])

  useEffect(() => {
    if (settled || gaveUp) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      if (cancelled) return

      if (Date.now() - startedAtRef.current > STALE_PENDING_MS) {
        setGaveUp(true)
        return
      }

      attemptsRef.current += 1
      try {
        const res = await fetch(`/api/extract/${extractionId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const next = (await res.json()) as ExtractionResult
        if (cancelled) return
        setResult(next)
        setPollError(null)
        // Re-anchor the clock to the server's own timestamp the first time we see it.
        startedAtRef.current = new Date(next.createdAt).getTime()
        if (isTerminal(next.status)) return
      } catch (cause) {
        if (cancelled) return
        // A single failed poll is not a failed extraction — the job is still running on the
        // server. Keep polling and say so quietly; only the 90 s rule ends the wait.
        setPollError(cause instanceof Error ? cause.message : 'could not reach the server')
      }
      timer = setTimeout(run, pollDelayFor(attemptsRef.current))
    }

    timer = setTimeout(run, pollDelayFor(attemptsRef.current))
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [extractionId, settled, gaveUp])

  return { result, pollError, gaveUp, elapsedSec, refresh }
}
