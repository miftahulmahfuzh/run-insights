import type * as React from 'react'

/**
 * The public shell. Its job is everything it does **not** do.
 *
 * No `TabBar` — the four tabs go to `/`, `/upload`, `/trends` and `/me`, every one of which is a
 * signed-in route; offering them to a viewer with no account is an invitation to a sign-in wall
 * they did not ask for (roadmap §4.8 says `/s/[token]` shows no tab bar at all, and this is where
 * that holds). No account menu, no avatar, no session read of any kind: this layout does not import
 * `@/auth`, `requireUserId` or `getUserId`, and `tests/share.bundle.test.ts` asserts the page's
 * whole import graph touches nothing under `lib/auth/`.
 *
 * No analytics script either, and the reason is sharper than habit: **the pathname IS the bearer
 * token.** `/s/V1StGXR8mN4qP2wZ` handed to any analytics backend — including a first-party one that
 * is not adversarial in the slightest — copies a health-data-protecting secret into a second
 * system's logs, dashboards and retention policy that nobody reasoned about. Treat "never log the
 * full path of an `/s` request" as a standing constraint on any future analytics choice, not a
 * one-time setup step.
 *
 * It is a `<div>`, not a `<main>`: the page and `not-found.tsx` each own their own `<main>`, so the
 * 404 can centre itself vertically while the run page scrolls from the top.
 *
 * ── WHY THIS SEGMENT LIVES IN `app/(public)/` AND NOT AT `app/s/` ──────────────────────────────
 * Because a route group is the only way to keep a `loading.tsx` off this route's ancestry, and that
 * is what lets a revoked link answer a real **404** instead of a 200 with a 404 body. `loading.tsx`
 * wraps its own segment and every segment below it; once a Suspense fallback can render, the body
 * starts streaming and the status is fixed (Next docs, `loading.md` → "Status Codes"). F08's
 * `loading.tsx` was written for `/` and sat at `app/loading.tsx`, which put it above everything —
 * so it moved to `app/(app)/loading.tsx` and this route moved into a sibling group with no loading
 * boundary above it at all.
 *
 * Measured both ways: `/s/<unknown-token>` answered 200 before the split and 404 after, with the
 * page code unchanged. `tests/share.bundle.test.ts` and `scripts/check-f11-share-boundaries.mjs`
 * both assert the absence that makes it work, because an absence is the easiest thing to undo by
 * accident.
 */
export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh">{children}</div>
}
