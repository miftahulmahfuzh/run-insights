/**
 * Generation: the OpenRouter call and the reference fetch that anchors it. One call, and it never
 * throws — every failure comes back as a `NinaImageFailure` so the caller can turn it into one of
 * her sentences.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import {
  buildImageReferenceDataUrl,
  buildImageRequestBody,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS,
  NINA_IMAGE_REFERENCE_MAX_BYTES,
  NINA_WORKER_CALL_TIMEOUT_MS,
  OPENROUTER_IMAGE_URL,
  readReportedCostMicroUsd,
} from '../../lib/nina/imagerecipe.ts'
import { classifyImageFailure } from '../../lib/nina/imagefail.ts'
import type { NinaImageFailure } from '../../lib/nina/imagefail.ts'

export type WorkerOutcome =
  | { ok: true; b64: string; costMicroUsd: number; latencyMs: number }
  | { ok: false; kind: NinaImageFailure; latencyMs: number; detail: string }

/**
 * **The anchor, off Blob, on the runner.** A near-copy of `fetchNinaImageReference` in
 * `lib/nina/imagecall.ts`, and the duplication is stated rather than hidden — the same trade this
 * file's header makes about column names, and for the same reason: `imagecall.ts` opens with
 * `import 'server-only'` and reaches `@/lib/env`, neither of which survives
 * `--experimental-strip-types`.
 *
 * **What is NOT duplicated is everything that could disagree**: the byte bound, the fetch deadline,
 * the allow-list and the `data:` URL construction all come from `imagerecipe.ts`, which both hosts
 * import. What is duplicated is fifteen lines of `fetch` plumbing.
 *
 * A plain `fetch` of the public Blob URL, not `@vercel/blob`: this file can only reach that package
 * through `createRequire` (see `put`, in `store.ts`) and its reader half has no `require()`-able
 * shape here. A public Blob object is an HTTPS GET on both hosts, so the app side uses the same
 * `fetch` — one mechanism, two copies, rather than two mechanisms.
 */
export async function fetchReference(url: string): Promise<string | null> {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.warn('[nina-worker] image reference dropped — blob fetch failed', {
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
      console.warn('[nina-worker] image reference dropped — declared too large', {
        url,
        declaredBytes,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const bytes = Buffer.from(await res.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > NINA_IMAGE_REFERENCE_MAX_BYTES) {
      console.warn('[nina-worker] image reference dropped — bad size', {
        url,
        bytes: bytes.byteLength,
        maxBytes: NINA_IMAGE_REFERENCE_MAX_BYTES,
      })
      return null
    }

    const served = res.headers.get('content-type') ?? ''
    const dataUrl = buildImageReferenceDataUrl(served, bytes.toString('base64'))
    if (dataUrl == null) {
      console.warn('[nina-worker] image reference dropped — content type not vouched for', {
        url,
        served,
      })
      return null
    }

    console.info('[nina-worker] image reference attached', {
      bytes: bytes.byteLength,
      contentType: served,
      fetchMs: Date.now() - startedAt,
    })
    return dataUrl
  } catch (cause) {
    console.warn('[nina-worker] image reference dropped — fetch threw', {
      url,
      cause: String(cause),
    })
    return null
  }
}

/**
 * One OpenRouter call. **It never throws** — every failure comes back as a `NinaImageFailure`,
 * because the caller's whole job is to turn that into one of her sentences, and a `catch` that has
 * to re-derive which of four things happened is a `catch` that will get it wrong.
 *
 * The classification is `classifyImageFailure` from `lib/nina/imagefail.ts` — **the same function
 * the app uses, imported, not paraphrased.** That is the whole reason `imagefail.ts` is forbidden
 * from having imports.
 *
 * ── ONE TIMEOUT HERE, TWO ON VERCEL, AND THAT ASYMMETRY IS DELIBERATE ─────────────────────────
 * `NINA_WORKER_CALL_TIMEOUT_MS` (290 s) covers BOTH the anchored and the unanchored call on this
 * host: 3.7x the measured 78.2 s unanchored, and strictly above the 240 s at which this host's
 * own anchored attempt died on 2026-09-10 — the drift that moved the in-platform ceilings the
 * same day. The app needs a second, larger constant because it is racing a 300 s invocation
 * ceiling; this host is racing `timeout-minutes: 6` (360 s), and 290 s is the largest call
 * timeout that keeps the whole derived chain honest without touching it: 360 s must stay above
 * call + 60 s of setup (290 + 60 = 350), and `NINA_IMAGE_RECLAIM_MS` (420 s, chosen to exceed
 * BOTH host ceilings) must stay above the workflow ceiling. The residual is still accepted and
 * named: an anchored generation slower than 290 s fails here as `timeout` — and one
 * `reviveNinaImageJobs` retries.
 *
 * The reference is fetched before the POST and inside the same 290 s wall, which is bounded by
 * `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS` (10 s) and degrades to unanchored on any failure.
 */
export async function generate(
  prompt: string,
  seed: number,
  /** The job's `args.referenceUrl`, already normalised by `ninaImageReferenceUrl`. */
  referenceUrl: string | null = null,
  /**
   * The job's chosen camera (the 2026-09-10 dropdown), already normalised by
   * `coerceNinaImageModel`. Optional and defaulted: the payload builder owns the fallback to
   * `NINA_IMAGE_MODEL`, so a caller that never heard of the dropdown builds the body it always
   * built — which is also what every pre-dropdown job (no `args.model` key at all) does.
   */
  model?: string,
): Promise<WorkerOutcome> {
  const startedAt = Date.now()
  const apiKey = process.env.OPENROUTER_API_KEY as string

  const referenceDataUrl =
    referenceUrl == null || referenceUrl.length === 0 ? null : await fetchReference(referenceUrl)

  let res: Response
  try {
    res = await fetch(OPENROUTER_IMAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildImageRequestBody({ prompt, seed, referenceDataUrl, model })),
      /* What is left of the 290 s after the reference fetch, floored so a slow fetch cannot hand
       * `AbortSignal.timeout` a zero. */
      signal: AbortSignal.timeout(
        Math.max(1_000, NINA_WORKER_CALL_TIMEOUT_MS - (Date.now() - startedAt)),
      ),
      cache: 'no-store',
    })
  } catch (cause) {
    return {
      ok: false,
      kind: classifyImageFailure({ cause }),
      latencyMs: Date.now() - startedAt,
      detail: String(cause),
    }
  }

  const raw = await res.text()
  if (!res.ok) {
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: res.status, body: raw }),
      latencyMs: Date.now() - startedAt,
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
     * (`policy`) or as something else entirely (`transport`) — the distinction that matters to the
     * runner is a picture the model would not draw versus a picture that got lost.
     */
    return {
      ok: false,
      kind: classifyImageFailure({ httpStatus: 200, body: raw }),
      latencyMs: Date.now() - startedAt,
      detail: raw.slice(0, 500),
    }
  }

  return {
    ok: true,
    b64,
    /* The index measured `usage.cost` present at $0.040. The constant is the fallback only. */
    costMicroUsd: reportedCost ?? NINA_IMAGE_COST_MICRO_USD,
    latencyMs: Date.now() - startedAt,
  }
}
