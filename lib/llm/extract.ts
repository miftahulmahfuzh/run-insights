import 'server-only'

import {
  MIN_REPAIR_BUDGET_MS,
  PRIMARY_TIMEOUT_MS,
  REPAIR_TIMEOUT_MS,
  type ExtractionErrorCode,
  type ScreenKind,
} from '@/lib/extract/constants'
import {
  describeZodIssues,
  makeExtractedSessionSchema,
  type ExtractedSession,
} from '@/lib/schema/extractedSession'
import { extractJsonObject } from './extractJson'
import type { PromptImage } from './prompts/extraction'
import {
  callVisionPrimary,
  callVisionRepair,
  VisionTokenFloorError,
  VisionTransportError,
  type VisionResult,
} from './vision'

/**
 * primary vision call → Zod → one text-only repair → terminal outcome.
 *
 * THE CONTRACT: this never throws for an LLM problem. Every vendor failure becomes a
 * `status: 'failed'` with a specific `errorCode`, because a stuck `pending` row is worse than a
 * failed one — the latter is auditable in `extractions` and actionable in the UI, the former is
 * indistinguishable from "still working" without reading timestamps by hand. It re-throws only a
 * genuinely unexpected error, which the job wrapper turns into `failed` / `transport` anyway.
 */

export interface ExtractOutcome {
  status: 'ok' | 'repaired' | 'failed'
  session: ExtractedSession | null
  errorCode: ExtractionErrorCode | null
  promptTokens: number | null
  /** Exactly what the vendor returned, for `extractions.raw_response`. */
  rawVendorResponse: unknown
  /** 1 = validated first try, 2 = a repair round-trip was needed. */
  attempts: 1 | 2
}

/**
 * The two calls and the clock, injected. Production binds the real ones in `runExtractionJob`;
 * the unit suite passes fakes, so the whole orchestrator — including the budget gate — is
 * exercised with no network and no real timers.
 */
export interface ExtractDeps {
  callPrimary: typeof callVisionPrimary
  callRepair: typeof callVisionRepair
  /** Injectable so "the primary call ate the budget" is a test, not a `setTimeout`. */
  now: () => number
}

export const productionDeps: ExtractDeps = {
  callPrimary: callVisionPrimary,
  callRepair: callVisionRepair,
  now: Date.now,
}

function failure(
  errorCode: ExtractionErrorCode,
  promptTokens: number | null,
  rawVendorResponse: unknown,
  attempts: 1 | 2,
): ExtractOutcome {
  return { status: 'failed', session: null, errorCode, promptTokens, rawVendorResponse, attempts }
}

/** Maps a thrown vision error onto its error code. `null` means "not one of ours — rethrow". */
function codeForVisionError(cause: unknown): ExtractionErrorCode | null {
  if (cause instanceof VisionTokenFloorError) return 'token_floor'
  if (cause instanceof VisionTransportError) {
    // AbortSignal.timeout() rejects with a TimeoutError DOMException, wrapped by the transport
    // error. Distinguishing them is worth one `instanceof`: "the reader was slow" and "the
    // reader was unreachable" are different problems with different odds of succeeding on retry.
    const inner = cause.detail
    const isTimeout =
      inner instanceof Error && (inner.name === 'TimeoutError' || inner.name === 'AbortError')
    return isTimeout ? 'timeout' : 'transport'
  }
  return null
}

/**
 * `images` are already base64 data URIs; `kindsPresent` is derived from OUR upload records, never
 * from the model's answer (that is what makes the provenance guard undefeatable).
 *
 * `budgetMs` is how long the whole of this function may take — the job's soft deadline minus
 * whatever the blob fetches already spent. The repair gate measures against **actual elapsed
 * time**, not against `PRIMARY_TIMEOUT_MS`: the plan subtracted the primary call's *timeout*
 * from the budget, which understates the remaining time by up to 45 s on the happy path and
 * would skip almost every repair that could have succeeded.
 */
export async function extractSession(
  deps: ExtractDeps,
  images: PromptImage[],
  kindsPresent: ReadonlySet<ScreenKind>,
  budgetMs: number,
): Promise<ExtractOutcome> {
  const startedAt = deps.now()
  const schema = makeExtractedSessionSchema(kindsPresent)

  let primary: VisionResult
  try {
    primary = await deps.callPrimary(images, {
      timeoutMs: Math.min(PRIMARY_TIMEOUT_MS, budgetMs),
    })
  } catch (cause) {
    const code = codeForVisionError(cause)
    if (code === null) throw cause
    // D3: a token-floor trip NEVER attempts a repair. The repair would resend the same request
    // shape to the same misbehaving endpoint and fail identically — and R-2's text-only repair
    // is even more pointless here, since there would be no image data at all to recover from.
    const tokens = cause instanceof VisionTokenFloorError ? cause.promptTokens : null
    return failure(code, tokens, null, 1)
  }

  const parsed = extractJsonObject(primary.text)
  const first = parsed === null ? null : schema.safeParse(parsed)

  if (first?.success) {
    return {
      status: 'ok',
      session: first.data,
      errorCode: null,
      promptTokens: primary.promptTokens,
      rawVendorResponse: primary.raw,
      attempts: 1,
    }
  }

  /* ── One repair round-trip, text-only (R-2 / D17), budget-gated (§4.6) ──────────────────── */

  // A response truncated by max_tokens would truncate identically on retry — same limit, same
  // prompt, same output length. Not worth the round-trip.
  const truncated = primary.finishReason === 'length'
  const budgetLeft = budgetMs - (deps.now() - startedAt)

  if (truncated || budgetLeft < MIN_REPAIR_BUDGET_MS) {
    return failure('validation', primary.promptTokens, primary.raw, 1)
  }

  const issues =
    parsed === null
      ? '- (root): the reply contained no JSON object at all. Return ONLY the JSON object.'
      : describeZodIssues(first?.error)

  let repair: VisionResult
  try {
    repair = await deps.callRepair(
      {
        kinds: [...kindsPresent],
        malformedText: primary.text,
        issues,
      },
      { timeoutMs: Math.min(REPAIR_TIMEOUT_MS, budgetLeft) },
    )
  } catch (cause) {
    const code = codeForVisionError(cause)
    if (code === null) throw cause
    // The primary response is kept as `raw_response`: it is the more informative artefact of
    // the two, and the repair produced nothing at all.
    return failure(code, primary.promptTokens, primary.raw, 2)
  }

  const repairedJson = extractJsonObject(repair.text)
  const second = repairedJson === null ? null : schema.safeParse(repairedJson)
  if (second?.success) {
    return {
      status: 'repaired',
      session: second.data,
      errorCode: null,
      promptTokens: repair.promptTokens,
      rawVendorResponse: repair.raw,
      attempts: 2,
    }
  }

  // Fail to the review screen's empty state (§8.1). Not a dead end: F05 renders the same form
  // with every field blank, still keyed to this extraction, so the runner is never hard-blocked.
  return failure('validation', repair.promptTokens, repair.raw, 2)
}
