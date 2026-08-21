import { z } from 'zod'

import type { HrMaxSource } from '@/lib/metrics/hrMax'

/**
 * The narrative output contract, checked on the way IN to the database.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────────────────────────
 * MEASURED (`research/results-narrative.json`, still committed with the defect intact): z.ai
 * returned HTTP 200 for a forced `report` tool call whose `observations[]` entries were **all
 * missing `title`**, despite `title` sitting in the tool schema's `required` array. The server
 * does not enforce a tool schema. Nothing complained except code downstream that trusted the
 * shape. `Observation.title` is therefore the exact field the repair round-trip exists to fix,
 * and this fixture is the repair path's primary test input.
 *
 * ── WHY THE LENGTH CAPS ARE HERE AND NOT ONLY IN THE PROMPT ───────────────────────────────────
 * `headline` is told "<= 70 chars" in three places: the prompt text, the tool schema's
 * `maxLength`, and this `.max(70)`. Only the last one is load-bearing — the other two are
 * requests. A 180-character headline is not a lie, but it breaks the one-line hero slot in
 * `InsightCard`, and a repair round-trip that trims it costs ~10 s and produces a payload the UI
 * can actually render.
 *
 * The remaining caps are generous rather than tight: they are there to catch a runaway
 * generation (a model that starts listing every split in `whatHappened`), not to police style.
 */

export const Observation = z.object({
  title: z.string().trim().min(1).max(80),
  detail: z.string().trim().min(1).max(500),
  metric: z.string().trim().min(1).max(120),
})

export const InsightPayloadSchema = z.object({
  headline: z.string().trim().min(1).max(70),
  verdict: z.enum(['easy', 'moderate', 'hard', 'very hard']),
  whatHappened: z.string().trim().min(1).max(800),
  observations: z.array(Observation).min(2).max(4),
  doNext: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
  questionForRunner: z.string().trim().min(1).max(300),
})

export type Observation = z.infer<typeof Observation>
export type InsightPayload = z.infer<typeof InsightPayloadSchema>
export type Verdict = InsightPayload['verdict']

/**
 * **R-11.** What actually lands in `insights.payload` for a session-scope row: the validated
 * prose plus the HRmax denominator that produced every percentage in it, frozen at generation
 * time.
 *
 * Two things this buys, neither of which is cosmetic:
 *
 *   1. `/s/[token]` (F11) renders a %HRmax figure without ever calling `resolveHrMax` — a public,
 *      unauthenticated page must not reach into the owner's profile, and this satisfies F02's
 *      INVARIANT B structurally rather than by everyone remembering.
 *   2. A months-old insight stays explicable. The observed ceiling moves (D11 resolves
 *      observed-first), and a percentage recomputed against today's denominator would silently
 *      contradict prose the runner read in August.
 *
 * Week and month payloads carry neither field: nothing at period scope divides by HRmax.
 */
export interface StoredSessionInsightPayload extends InsightPayload {
  hrMaxUsed: number | null
  hrMaxSource: HrMaxSource | null
}

/**
 * Zod issues as the repair turn's bullet list. Same shape and same 12-issue cap as
 * `lib/schema/extractedSession.ts`'s twin — a repair note is a prompt, and a prompt with sixty
 * bullets in it is a prompt the model skims.
 *
 * Not imported from that module on purpose: this one is about a five-field prose object and that
 * one about a 108-field extraction. They are eight lines each and share no vocabulary; a common
 * helper would only couple two schemas that have no reason to move together.
 */
export function describeInsightIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(error)
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
