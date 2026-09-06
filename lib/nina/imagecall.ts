import 'server-only'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure, type NinaImageFailure } from './imagefail'
import {
  buildImageRequestBody,
  NINA_IMAGE_CALL_TIMEOUT_MS,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from './imagerecipe'

/**
 * **The camera's shutter, on Vercel.** One `POST /api/v1/images/generations`, and nothing else.
 *
 * ── R4, ANSWERED, AND THIS IS WHERE THE ANSWER BELONGS ────────────────────────────────────────
 * The user asked: *"is there an asynchronous api for openrouter image generation? i think this
 * will solve alot of our problems."* **No. There is not.** Checked against the vendor
 * documentation on 2026-09-06:
 *
 *   · Image generation is SYNCHRONOUS. `POST /api/v1/images` returns the bytes as base64 in the
 *     response body; `stream: true` yields SSE partial renders of the same call. There is no job
 *     id, no polling endpoint, no `callback_url` and no webhook. The other image routes are
 *     discovery only — `GET /api/v1/images/models`, `GET /api/v1/images/models/{id}/endpoints`.
 *   · An asynchronous job API DOES exist and it is VIDEO-ONLY:
 *     `POST /api/v1/videos` -> `GET /api/v1/videos/{id}` -> `GET /api/v1/videos/{jobId}/content`,
 *     with `callback_url` webhooks signed by `X-OpenRouter-Signature` and deduplicated by
 *     `X-OpenRouter-Idempotency-Key`. Images are not eligible for it.
 *
 * So do not go looking for a callback to subscribe to; there is nothing on the other side of the
 * wire to subscribe to. **The durability problem is solved on OUR side** — `after()` owns the
 * server's remaining wall clock, `lib/nina/imagerun.ts` is what spends it, and the tab is
 * irrelevant the moment this function is called. If OpenRouter ever ships an async image job API,
 * the change is confined to this file plus one polling caller; nothing else in the pipeline knows
 * the call is synchronous.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────────────────────────
 * Every failure comes back as a `NinaImageFailure`, exactly as `scripts/nina-image-worker.ts`'s
 * `generate` does, because the caller's whole job is to turn that into one of her sentences and a
 * `catch` that has to re-derive which of four things happened is a `catch` that will get it wrong.
 * `classifyImageFailure` is imported from `lib/nina/imagefail.ts` — the SAME function the worker
 * uses, so both hosts say the same sentence for the same failure.
 *
 * ── `costMicroUsd`, AND PLAN INVARIANT 9 ──────────────────────────────────────────────────────
 * *Money is never spent silently.* Three cases, and the caller is never left guessing:
 *   · `0`    — the request was never sent (the key is absent). Nothing was billed, and recording
 *              $0.04 here would put an imaginary charge in the ledger.
 *   · `null` — the request WAS sent and no usable image came back. Unknown, so the caller
 *              substitutes `NINA_IMAGE_COST_MICRO_USD`. Guessing high is the honest direction for
 *              a cost log; the analysis measured two generations that succeeded at the provider,
 *              crashed on the write and were recorded as free.
 *   · a number on success — `usage.cost` when the provider reports it, the constant when it does
 *              not. `readReportedCostMicroUsd` owns that preference.
 *
 * ── THE TIMEOUT IS NOT THE WORKER'S ───────────────────────────────────────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` is 240 s because a GitHub runner has six hours and no ceiling to
 * race. Here there IS a ceiling — the route segment's `maxDuration` — so the timeout is
 * `NINA_IMAGE_CALL_TIMEOUT_MS` (150 s), derived in `imagerecipe.ts`'s threshold block and asserted
 * in `tests/nina.imagerecipe.test.ts`. Two hosts, two ceilings, two constants, one payload.
 */
export type NinaImageCallResult =
  | { ok: true; b64: string; costMicroUsd: number; latencyMs: number }
  | {
      ok: false
      kind: NinaImageFailure
      latencyMs: number
      /** `0` = certainly nothing was billed. `null` = unknown; the caller guesses high. */
      costMicroUsd: number | null
      /** Never rendered. Log only. */
      detail: string
    }

export async function callNinaImageModel(
  prompt: string,
  seed: number,
): Promise<NinaImageCallResult> {
  const startedAt = Date.now()

  /*
   * Read INSIDE the function and inside a `try`, never at module scope. `ninaEnv()` is a lazy zod
   * group that throws when a member is absent, and the analysis measured production carrying
   * neither of the two it used to hold. It is a one-member group now — `OPENROUTER_API_KEY` —
   * because this phase deleted `GITHUB_DISPATCH_TOKEN` with the doorbell, so the coupling that
   * made a missing dispatch token break a generation is gone as well.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly here would
   * pass the grep and break plan invariant 3 — app code reads secrets through `lib/env.ts`.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    return {
      ok: false,
      kind: 'transport',
      latencyMs: Date.now() - startedAt,
      costMicroUsd: 0,
      detail: `image config: ${String(cause)}`,
    }
  }

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed })),
      signal: AbortSignal.timeout(NINA_IMAGE_CALL_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      /* The request left the building. A generation that was aborted at 150 s was very probably
       * billed, so this is `null` ("unknown, guess high") and not `0`. */
      costMicroUsd: null,
      detail: String(cause),
    }
  }

  const raw = await res.text()

  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: null,
      detail: `HTTP ${res.status} ${raw.slice(0, 500)}`,
    }
  }

  let b64: string | null = null
  let reportedCost: number | null = null
  try {
    const parsed = JSON.parse(raw) as { data?: Array<{ b64_json?: string }>; usage?: unknown }
    b64 = parsed.data?.[0]?.b64_json ?? null
    reportedCost = readReportedCostMicroUsd(parsed.usage)
  } catch {
    b64 = null
  }

  if (b64 == null || b64.length === 0) {
    /*
     * A 200 with no image. `classifyImageFailure` decides whether the body reads as a refusal
     * (`policy`) or as something else (`transport`) — the distinction that matters to the runner
     * is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      costMicroUsd: reportedCost,
      detail: raw.slice(0, 500),
    }
  }

  return {
    ok: true,
    b64,
    /* `null` here means the provider said nothing; `imagerun.ts` substitutes the constant. */
    costMicroUsd: reportedCost ?? 0,
    latencyMs: Date.now() - startedAt,
  }
}
