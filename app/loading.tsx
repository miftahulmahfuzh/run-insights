import { AppShell, ScreenHeader } from '@/components/ui'

/**
 * `/`'s route-level loading boundary. Three skeleton rows at `RunRow`'s exact height — three lines
 * of text inside a 22px-radius card with 16px padding — so the real list lands with zero layout
 * shift instead of pushing the page down as it arrives.
 *
 * The heights are hardcoded rather than derived, which is the honest tradeoff: a shared constant
 * would only move the coupling, and a skeleton that silently stops matching its row is a visible
 * jump, not a silent bug.
 */
export default function Loading() {
  return (
    <AppShell>
      <ScreenHeader title="Runs" />
      <div
        className="h-3 w-32 [animation:ri-pulse_1.4s_ease-in-out_infinite] rounded-pill bg-card/60"
        aria-hidden="true"
      />
      <ul className="mt-3 space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="[animation:ri-pulse_1.4s_ease-in-out_infinite] rounded-card bg-card p-4 shadow-card"
          >
            <div className="h-3 w-24 rounded-pill bg-paper-2" />
            <div className="mt-2 h-5 w-44 rounded-pill bg-paper-2" />
            <div className="mt-1.5 h-3 w-36 rounded-pill bg-paper-2" />
          </li>
        ))}
      </ul>
      <p className="sr-only" role="status">
        Loading your runs
      </p>
    </AppShell>
  )
}
