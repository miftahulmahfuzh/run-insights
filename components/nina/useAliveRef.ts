'use client'

import { useEffect, useRef } from 'react'

/**
 * Every timed step in the chat screen checks this before touching state. StrictMode double-invokes
 * effects in development and a runner can navigate away mid-reveal; both would otherwise set state
 * on an unmounted tree. `InsightTrigger` keeps the same guard as a local boolean for the same
 * reason; the screen's timers outlive one component-local `let`, so the flag is a ref that every
 * timer-owning hook shares.
 *
 * The flag flips through its own mount effect — `alive.current = true` lives in the SETUP and not
 * only in the initialiser, which is what makes a StrictMode dev remount live again after the first
 * teardown flipped it false. Each hook that owns a timer handle clears that handle in its own
 * unmount cleanup; this hook owns only the flag, and nothing else.
 */
export function useAliveRef() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}
