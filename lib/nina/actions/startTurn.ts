/**
 * The `after()` seam the send and resend actions share — the whole of the action layer's
 * involvement in background turns, isolated to three lines so consuming its convention is a
 * three-line change and not a rewrite (F36 R6). Split from the former `lib/nina/actions.ts`
 * (2026-09-12) and deliberately WITHOUT a `'use server'` directive: this is not an action, it is
 * not exported to any client, and a non-async export behind the directive would not even compile.
 * Importing it from the `'use server'` action modules is an ordinary server-to-server import.
 *
 * `after()` is already this layer's convention for work that must outlive the response — the
 * send path's STEP 6 distillation and STEP 7 auto-title both used it before the background turn
 * existed, and both noted that it "throws E468 outside a request scope, which is exactly why the
 * CALL lives in the Server Action layer". The same reasoning applies at four hundred times the
 * duration, and Next 16.3.1's `after` reference is explicit that it is the right primitive:
 * *"`after` allows you to schedule work to be executed after a response is finished"*, it is
 * supported in Server Functions, and *"`after` will run for the platform's default or configured
 * max duration of your route"* — which on Vercel means the invocation is held open by
 * `waitUntil` until the callback settles. **That is the whole of "the app does not care whether
 * user close the app or not": the wall clock belongs to the server.**
 *
 * ── WHY THIS IS A FUNCTION AND NOT AN INLINE `after()` ───────────────────────────────────────
 * Phase 2 established this repo's convention for durable server-owned background work and chose
 * `after()` in as many words, so this body is the whole of the seam: if the convention ever becomes
 * a fetch to an internal route, this body changes and nothing else does — not the input type, not
 * the caller, not the chain, not the client half.
 *
 * **The budget is the INVOKING SEGMENT's `maxDuration`, not this function's.** `app/nina/page.tsx`
 * carries `export const maxDuration = 300` (phase 2), a Server Action's timeout is the page
 * segment's, and `after()` runs for that same budget. So this must never be relocated into a route
 * handler that does not carry 300 — a 240 s background budget under a 60 s segment is a silent
 * truncation, not an error. `NINA_BACKGROUND_BUDGET_MS` documents the pairing.
 *
 * ── NESTED `after()` IS SANCTIONED, WHICH MATTERS MORE THAN IT LOOKS ─────────────────────────
 * The turn below can call `generate_image` or `set_avatar`, and the generation registers its own
 * `after()`. That is now an `after()` inside an `after()`. Next's reference sanctions it in as many
 * words — *"`after` can be nested inside other `after` calls"* — so the image path keeps working
 * through the split with no change to phase 1's or phase 2's files. The arithmetic phase 2 asserts
 * is 45 s of turn plus 200 s of generation inside the segment's 300.
 */
import { after } from 'next/server'

import { runNinaBackgroundTurn, type NinaBackgroundTurnInput } from '../turnrun'

export function startNinaBackgroundTurn(input: NinaBackgroundTurnInput): void {
  after(() => runNinaBackgroundTurn(input))
}
