'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { NINA_SEMANTIC_PREF_KEY, decodeSemanticPref, encodeSemanticPref } from '@/lib/nina/search'

/**
 * R6's *"persist the toggle across app usage"* — **the first `localStorage` in this codebase.**
 *
 * ── WHY `localStorage`, GIVEN THAT THIS APP'S HABIT IS THE URL ────────────────────────────────
 * `lib/panel/param.ts` and `components/ui/usePanelParam.ts` persist UI state in the query string,
 * and that is the wrong mechanism here twice over: a query parameter belongs to one history entry,
 * so it is lost the moment the runner follows a link that does not carry it, and "across app usage"
 * is exactly the guarantee it cannot make.
 *
 * A cookie was the other candidate, and the reason it lost is that its one advantage — the server
 * render could read it — buys nothing. **This preference has no server consumer.** The semantic flag
 * is an argument to a Server Action that the client already holds; the server never needs to know
 * it unprompted. A cookie would put a new request-time input on `/nina`, whose own header opens
 * "ONE READ, NO MODEL CALL", and would be transmitted on every same-origin request for a boolean
 * one component reads.
 *
 * ── HOW THE HYDRATION PROBLEM IS SOLVED, AND IT IS NOT BY GUESSING ────────────────────────────
 * A server-rendered control cannot know a client value, and reading `localStorage` during the first
 * client render is a React hydration error. `useSyncExternalStore` is the API that exists for this:
 * React uses `getServerSnapshot` for the server render **and for hydration**, then reads
 * `getSnapshot` after hydration commits and re-renders if the two differ. That is not a mismatch —
 * it is the hook's documented contract, and the third argument exists for no other reason.
 *
 * `getServerSnapshot` returns the default (`false`), so the server HTML and the first client paint
 * agree by construction. If the stored value is `true` the toggle flips one frame after hydration,
 * which is invisible in practice: the sidebar has to be opened and a query typed before the flag
 * changes any behaviour, and both happen long after hydration.
 *
 * ── WHY THERE IS A `storage` LISTENER ────────────────────────────────────────────────────────
 * "Across app usage" includes two open tabs, which this app produces on purpose — `/admin/nina`'s
 * file explorer opens `/nina?photo=…` in a new one. The `storage` event fires in every OTHER
 * document on the origin, and the module-level listener set covers the mounts in THIS one, so both
 * halves are handled and the two tabs never disagree about a preference the runner just changed.
 *
 * ── WHAT HAPPENS WHEN THE STORE IS UNAVAILABLE ───────────────────────────────────────────────
 * Safari in private mode and a full quota both throw from `localStorage`. Every access is guarded,
 * and a failed write falls back to a module-level value so the toggle still works for the life of
 * the tab — it simply does not survive a reload. Stated rather than hidden: the degradation is that
 * the preference is not persisted, never that the toggle stops responding.
 */

const listeners = new Set<() => void>()

/**
 * The in-memory answer when the store refused a write. `null` means "the store is authoritative".
 * Module-level, because it has to outlive a mount for the tab-lifetime promise above to be true.
 */
let fallback: boolean | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function getSnapshot(): boolean {
  if (fallback !== null) return fallback
  try {
    return decodeSemanticPref(window.localStorage.getItem(NINA_SEMANTIC_PREF_KEY))
  } catch {
    return false
  }
}

/** The default, used for the server render and for hydration. See the header. */
function getServerSnapshot(): boolean {
  return false
}

export function useSemanticPref(): readonly [boolean, (next: boolean) => void] {
  const semantic = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setSemantic = useCallback((next: boolean) => {
    try {
      const value = encodeSemanticPref(next)
      if (value === null) window.localStorage.removeItem(NINA_SEMANTIC_PREF_KEY)
      else window.localStorage.setItem(NINA_SEMANTIC_PREF_KEY, value)
      fallback = null
    } catch {
      /* Private mode, or a full quota. The toggle keeps working for this tab; it just will not
         survive a reload. A thrown error here must never reach the runner as a broken control. */
      fallback = next
    }
    emit()
  }, [])

  return [semantic, setSemantic] as const
}
