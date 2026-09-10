import 'server-only'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure, type NinaImageFailure } from './imagefail'
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  ninaImageCallTimeoutMs,
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
 * ── THE TIMEOUTS ARE NOT THE WORKER'S, AND THERE ARE TWO OF THEM ──────────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` is 240 s because a GitHub runner has six hours and no ceiling to
 * race. Here there IS a ceiling — the route segment's `maxDuration` — so the timeout comes from
 * `ninaImageCallTimeoutMs(anchored)`: **150 s unanchored, 220 s with a reference**, because RU-18
 * measured an anchored generation at 148.9 s against 78.2 s and a 150 s ceiling would have aborted
 * about half of R10's own generations. Both are derived in `imagerecipe.ts`'s threshold block and
 * asserted in `tests/nina.imagerecipe.test.ts`. Two hosts, three ceilings, one payload.
 *
 * **THE CHOSEN CEILING BOUNDS THIS WHOLE FUNCTION, NOT JUST THE POST.** The reference is fetched
 * from Blob here, before the request, and the POST's `AbortSignal` gets what is left of the
 * allowance afterwards. So `callNinaImageModel` cannot outlive one constant, and the threshold
 * arithmetic needs no term for the fetch.
 *
 * ── A REFERENCE THAT CANNOT BE FETCHED IS NOT A FAILED JOB ────────────────────────────────────
 * `fetchNinaImageReference` returns null on every failure — a non-200 from Blob, an oversized
 * object, a content type this pipeline will not vouch for, a timeout, a thrown anything — and logs
 * one `console.warn`. The generation then proceeds UNANCHORED and the result carries
 * `anchored: false`, which `imagerun.ts` logs beside the bytes and the cost. The operator gets a
 * picture without the anchor rather than an apology, which is the trade R10 is worth: the alternative
 * is spending a day's quota on an apology for a CDN hiccup.
 */
export type NinaImageCallResult =
  | {
      ok: true
      b64: string
      costMicroUsd: number
      latencyMs: number
      /**
       * Whether a reference actually went on the wire. `false` for an unanchored job AND for a job
       * whose reference could not be fetched — the caller logs it, so a degraded generation is
       * visible in the log rather than inferred from a missing warning.
       */
      anchored: boolean
    }
  | {
      ok: false
      kind: NinaImageFailure
      latencyMs: number
      /** `0` = certainly nothing was billed. `null` = unknown; the caller guesses high. */
      costMicroUsd: number | null
      /** Never rendered. Log only. */
      detail: string
    }

/**
 * **The anchor, off Blob and into a `data:` URL. It never throws and it never blocks a job.**
 *
 * Modelled on `lib/nina/vision.ts`'s `toDataUri` (`:253-286`) — a `data:` URL rather than the
 * hosted URL, and the media type READ BACK from the object's own `content-type` and allow-listed
 * rather than assumed — with two differences that matter here:
 *
 *   1. **It returns null instead of throwing.** `vision.ts` throws because a description with no
 *      image is worthless; a photograph with no anchor is still a photograph.
 *   2. **It is BOUNDED.** `vision.ts` fetches chat photos, which are ≤ 900 KB by construction.
 *      This fetches whatever the operator picked out of the album, which is ≤ 8 MiB by
 *      construction — so `NINA_IMAGE_REFERENCE_MAX_BYTES` is a belt-and-braces guard on a set that
 *      every writer already bounds, checked twice: once against the declared `content-length`
 *      (cheap, and Vercel Blob serves one) and once against the bytes actually read.
 */
export async function fetchNinaImageReference(url: string): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina] image reference dropped — blob fetch failed', {
        url,
        status: res.status,
      })
      return null
    }

    const declared = res.headers.get('content-length')
    const declaredBytes = declared == null ? null : Number.parseInt(declared, 10)
    if (
      declaredBytes != null &&
      Number.isFinite(declaredBytes) &&
      declaredBytes > NINA_IMAGE_REFERENCE_MAX_BYTES
    ) {
      console.warn('[nina] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''
    const dataUrl = buildImageReferenceDataUrl(served, bytes.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina] image reference attached', {
      bytes: bytes.byteLength,
      contentType: served,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    /* A timeout, a DNS failure, a truncated body — all of them cost the anchor and none of them
     * costs the job. */
    console.warn('[nina] image reference dropped — fetch threw', { url, cause: String(cause) })
    return null
  }
}

export async function callNinaImageModel(
  prompt: string,
  seed: number,
  /**
   * The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. Optional and
   * defaulted so every existing caller — and `tests/nina.imagecall.test.ts`'s four positional
   * calls — is unchanged.
   */
  referenceUrl: string | null = null,
  /**
   * The job's chosen camera, already normalised by `coerceNinaImageModel`. Optional and defaulted
   * to the module constant for the same reason `referenceUrl` is defaulted — the payload builder
   * owns the fallback, so a caller that never heard of the dropdown builds the body it always
   * built.
   */
  model?: string,
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

  /* The anchor, if this job asked for one. BEFORE the key check would have been wrong: a job with
   * no key must not spend ten seconds pulling bytes it will never send. */
  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0
      ? null
      : await fetchNinaImageReference(referenceUrl)

  /*
   * The ceiling for what is ACTUALLY being sent — a reference that could not be fetched is an
   * unanchored call and gets the unanchored 150 s. Minus what the fetch already spent, so the
   * chosen constant bounds this whole function and not merely the POST. Floored at one second so a
   * pathologically slow fetch cannot hand `AbortSignal.timeout` a zero or a negative.
   */
  const postTimeoutMs = Math.max(
    1_000,
    ninaImageCallTimeoutMs(referenceDataUrl != null) - (Date.now() - startedAt),
  )

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        buildImageRequestBody({ prompt, seed, referenceDataUrl, model }),
      ),
      signal: AbortSignal.timeout(postTimeoutMs),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      /* The request left the building. A generation that was aborted at its ceiling was very
       * probably billed, so this is `null` ("unknown, guess high") and not `0`. */
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
    anchored: referenceDataUrl != null,
  }
}
