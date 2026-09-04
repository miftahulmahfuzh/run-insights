import { AppShell, ScreenHeader } from '@/components/ui/AppShell'

/**
 * `/`'s route-level loading boundary. Three skeleton rows at `RunRow`'s exact height — three lines
 * of text inside a 22px-radius card with 16px padding — so the real list lands with zero layout
 * shift instead of pushing the page down as it arrives.
 *
 * The heights are hardcoded rather than derived, which is the honest tradeoff: a shared constant
 * would only move the coupling, and a skeleton that silently stops matching its row is a visible
 * jump, not a silent bug.
 *
 * ── WHY THIS FILE MOVED INTO `app/(app)/` (F11) ────────────────────────────────────────────────
 * It was written for `/` and its doc comment said so, but at `app/loading.tsx` it was the ROOT
 * loading boundary: `loading.tsx` wraps its segment **and every segment below it**, so this
 * skeleton put a Suspense boundary above `/r/[id]`, `/x/[id]`, `/trends`, `/me` and `/s/[token]`
 * alike.
 *
 * That has a consequence nobody would guess from reading this file. Once a Suspense fallback can
 * render, the response body starts streaming, the headers are already on the wire, **and the HTTP
 * status can no longer change** (`next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * loading.md`, "Status Codes"). Every `notFound()` in the app was therefore answering **200 with a
 * 404 body** — a soft 404. Measured, not theorised: `/s/<unknown-token>` returned 200 before this
 * move and 404 after it, same page code.
 *
 * That is merely untidy for a run detail page and unacceptable for `/s/[token]`, where "the link
 * 404s the moment I revoke it" is a promise the feature makes to the runner in its own confirm
 * dialog. Scoping this boundary to the one route it was written for is what makes the promise true,
 * and it fixes the same soft-404 for `/r/[id]` and `/x/[id]` on the way past.
 *
 * **Do not move this file back up to `app/loading.tsx`.** A route group costs nothing in the URL and
 * buys a correct status line on every dynamic route in the application.
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
