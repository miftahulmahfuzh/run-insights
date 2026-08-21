/**
 * Pull a JSON object out of whatever the model actually said.
 *
 * The regex and the brace-slicing below are **ported verbatim from `research/score.mjs`'s
 * `extractJson()`**, which is already proven against real `glm-4.6v` output across every
 * feasibility run in `research/` — including the runs that scored 108/108. It is deliberately not
 * "improved": the prompt says "no markdown fences, no commentary", the model mostly complies, and
 * this handles the cases where it does not. Rewriting it would mean re-proving it.
 *
 * Two behaviours worth naming, because both are relied on:
 *
 *  - It returns `null` rather than throwing, for every failure — no fence, no braces, malformed
 *    JSON. The orchestrator treats "no parseable object" and "parsed but failed Zod" identically
 *    (both are a `validation` failure, both are repairable), so a thrown exception here would
 *    only mean a try/catch at the one call site.
 *  - It takes the FIRST `{` to the LAST `}`. Chattier output — "Here is the JSON:" before, "Let
 *    me know if…" after — is stripped by construction. Nested braces inside the object survive
 *    because the slice is outermost-to-outermost, not first-balanced-pair.
 */

const FENCE_RE = /```(?:json)?\s*([\s\S]*?)```/

/** Ported from research/score.mjs. Returns `null` on anything it cannot turn into an object. */
export function extractJsonObject(text: string | null | undefined): unknown | null {
  if (!text) return null
  let s = text.trim()

  const fence = s.match(FENCE_RE)
  if (fence?.[1]) s = fence[1].trim()

  const open = s.indexOf('{')
  const close = s.lastIndexOf('}')
  if (open === -1 || close === -1 || close < open) return null

  try {
    const parsed: unknown = JSON.parse(s.slice(open, close + 1))
    // A bare array or string that happens to sit between braces is not a session object.
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
