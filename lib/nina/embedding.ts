import 'server-only'

import { NINA_EMBEDDING_DIMENSIONS } from '@/lib/db/schema'
import { ninaEnv } from '@/lib/env'
import { logNinaError } from './errorlogs'
import { NINA_EMBEDDING_MODEL, OPENROUTER_EMBEDDINGS_URL } from './openrouter'

/**
 * **One string in, one `number[]` out.** The album's semantic search (2026-09-15) has exactly two
 * jobs for a vendor: turn a photo's stored `description` into a vector at write time, and turn an
 * operator's query into a vector at read time. Both are this one call.
 *
 * One `fetch`, no SDK, the same construction and for the same reason as `lib/nina/vision.ts`:
 * `@anthropic-ai/sdk` cannot be pointed at an OpenAI-shaped embeddings endpoint, and pulling in a
 * second vendor SDK to send one JSON object would be more dependency than request.
 *
 * ── NO FALLBACK LADDER, AND THAT IS NOT AN OMISSION ──────────────────────────────────────────
 * `describeNinaImagesWithFallback` tries z.ai and then OpenRouter because both vendors serve
 * chat/completions and the describe path had a measured two-hour outage to survive
 * (`nina_error_logs`, 2026-09-14 07:40-09:38 UTC). Embeddings have one confirmed door here — the
 * probe in this phase's plan is what established that — so there is nothing to fall back FROM.
 * One attempt, one `nina_error_logs` row, one throw. If a second vendor is ever confirmed, this
 * module gains a `…WithFallback` sibling in `describeNinaImagesWithFallback`'s shape rather than
 * a branch inside the core, for the reason that function's header spells out.
 *
 * ── THE DIMENSION CHECK IS THIS MODULE'S TOKEN FLOOR ─────────────────────────────────────────
 * `lib/nina/vision.ts` refuses a response whose `prompt_tokens` says the image never arrived,
 * because the invented text is exactly what downstream would otherwise believe. The analogue here
 * is width: a vector of the wrong length is not a worse ranking, it is a failed INSERT thrown from
 * deep inside an `after()` callback, where pgvector's own message ("expected 1536 dimensions, not
 * 1024") surfaces as an unattributable warning hours after the model was swapped. So the width is
 * checked HERE, against the same constant the column is declared with, and a mismatch is a named
 * error with both numbers in it.
 */

/**
 * Wrong width, network failure, timeout, non-2xx, non-JSON body, a missing or non-numeric vector,
 * or an empty input. One class, unlike `vision.ts`'s two, because there is no caller that needs to
 * branch on which: phase 2 logs and moves on, phase 3 returns `{ ok: false }`. The distinguishing
 * detail rides in `message` and `detail`, which is what the `nina_error_logs` row carries.
 */
export class NinaEmbeddingError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'NinaEmbeddingError'
  }
}

/**
 * **MEASURED-DERIVED, and deliberately shorter than the describe path's ceilings.** An embedding is
 * a single forward pass with no autoregressive decode — there are no completion tokens to stream,
 * which is the entire reason `NINA_DESCRIBE_TIMEOUT_MS` is 25 s and its OpenRouter sibling 30 s
 * (~26-33 ms per output token, F04). A few hundred input tokens in, one vector out, over a broker
 * that adds a routing hop: 15 s is a ceiling with room, not a target.
 *
 * It matters that it is short. Phase 2 embeds every row of a folder upload inside one `after()`
 * callback under a route segment's `maxDuration`; a 30 s ceiling per row would halve how many rows
 * fit in that budget for a call that should answer in under a second.
 */
export const NINA_EMBEDDING_TIMEOUT_MS = 15_000

/**
 * The input clamp, and it is a STORAGE-SHAPED GUARD rather than a contract — the same thing
 * `NINA_ERROR_LOG_TEXT_MAX` is, for the same reason.
 *
 * A real description is 60-140 words (~900 characters) because the describe prompt asks for that,
 * and a real search query is a sentence. 8 000 characters is ~2 000 tokens, comfortably inside any
 * candidate model's window, so nothing legitimate is ever truncated. What it actually stops is a
 * caller that hands over something that is not prose — a `data:` URI, a stringified row, a whole
 * file — which `lib/nina/errorlogs.ts`'s header notes is one careless line away on the vision path.
 *
 * Truncated rather than refused: an over-long description is still a describable photo, and half a
 * paragraph embeds to something usefully close to the whole one. An EMPTY input is a different
 * thing and does throw — see `embedNinaTextWithFetch`.
 */
export const NINA_EMBEDDING_MAX_CHARS = 8_000

export interface NinaEmbedOptions {
  /**
   * Whose photo or query this is, for the failure log's `user_id` column. Optional and nullable
   * for the reason `NinaDescribeOptions.userId` is: `nina_error_logs.user_id` is nullable, and a
   * call that genuinely has no runner in hand must not have to invent one. Phase 2 and phase 3
   * both have the id and should pass it.
   */
  userId?: string | null
  /** Override the ceiling. Nothing in the repo passes it; it exists for a probe or a backfill. */
  timeoutMs?: number
}

type FetchLike = typeof fetch

/**
 * Trim, then clamp. Pure, and exported so the suite can assert the ceiling is real rather than
 * aspirational — `clampNinaErrorText`'s precedent.
 *
 * No "[truncated N characters]" marker, unlike that function: this string is sent to a model, not
 * stored for a human, and appending a sentence about truncation to text being embedded would put
 * words into the vector that the photograph does not contain.
 */
export function clampEmbedInput(text: string): string {
  const trimmed = text.trim()
  return trimmed.length <= NINA_EMBEDDING_MAX_CHARS
    ? trimmed
    : trimmed.slice(0, NINA_EMBEDDING_MAX_CHARS)
}

/**
 * One `nina_error_logs` row for one failed attempt. **Never throws and never rejects** — the same
 * contract, and the same doubled guard, as `recordDescribeFailure` in `lib/nina/vision.ts`:
 * `logNinaError` is itself specified best-effort, and this second catch is that guarantee held at
 * the place that depends on it, so a logging regression cannot cost an album row its embedding.
 *
 * `category: 'text'` and NOT a fourth `NinaErrorCategory`. An embedding IS a text-model call, the
 * existing Text tab on `/admin/error-logs` is where an operator looks for one, and a fourth member
 * would be a four-file edit reaching into an admin UI model for one more tab nobody asked for.
 * See this phase's plan, Step 4.
 *
 * `imageUrl` is always null here: this path never holds a photo. An image SEARCH reaches this
 * module as the caption text the describe pass already produced, and that describe call logs its
 * own row with its own image link if it fails.
 */
async function recordEmbedFailure(entry: {
  input: string
  timeoutMs: number
  cause: unknown
  opts: NinaEmbedOptions
}): Promise<void> {
  try {
    await logNinaError({
      category: 'text',
      provider: 'openrouter',
      model: NINA_EMBEDDING_MODEL,
      /* The payload actually sent, with the real input in it. No base64 can reach here — the
       * clamp above bounds it and the caller sends prose — so `clampNinaErrorText` downstream is
       * a backstop rather than the thing doing the work. */
      fullInput: JSON.stringify(
        { url: OPENROUTER_EMBEDDINGS_URL, model: NINA_EMBEDDING_MODEL, input: entry.input },
        null,
        2,
      ),
      errorMessage: embedErrorText(entry.cause),
      timeoutMs: entry.timeoutMs,
      imageUrl: null,
      userId: entry.opts.userId ?? null,
    })
  } catch (cause) {
    console.warn('[nina] could not record an embedding failure', { error: String(cause) })
  }
}

/**
 * What the admin log stores as "full LLM error message". Pure, exported for the test.
 *
 * `String(cause)` alone drops `NinaEmbeddingError.detail`, which is where the response snippet or
 * the thrown cause lives — and that snippet is the whole diagnosis six weeks later.
 * `describeErrorText`'s argument, applied to this module's one error class.
 */
export function embedErrorText(cause: unknown): string {
  if (cause instanceof NinaEmbeddingError) {
    return cause.detail === undefined
      ? `${cause.name}: ${cause.message}`
      : `${cause.name}: ${cause.message} — detail: ${String(cause.detail)}`
  }
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  return String(cause)
}

/**
 * The injectable core. Production reaches it through `embedNinaText`; the unit suite hands it a
 * fake `fetch` and never touches the network. DI at exactly this seam for the reason
 * `describeNinaImagesWithFetch` gives: this module is `server-only` and reads `@/lib/env`, so a
 * fake `fetch` is the only honest way to test the validation.
 *
 * @throws {NinaEmbeddingError} on an empty input, a missing credential, a transport failure, a
 *   non-2xx, a non-JSON body, a missing or non-numeric vector, or a wrong dimension. A
 *   `nina_error_logs` row is written before every throw except the empty-input one, which is a
 *   programmer error that never reached a vendor.
 */
export async function embedNinaTextWithFetch(
  fetchImpl: FetchLike,
  text: string,
  opts: NinaEmbedOptions = {},
): Promise<number[]> {
  const input = clampEmbedInput(text)
  /* Hoisted above everything that could log, so a programmer error is one throw and zero rows —
   * `describeNinaImagesWithFallback`'s empty-array check, same placement, same reasoning. An empty
   * string is not a degraded query, it is a call that should not have been made: the vendor would
   * either 400 or hand back the embedding of nothing, and the second is worse. */
  if (input.length === 0) {
    throw new NinaEmbeddingError('embedNinaText was given empty text')
  }

  const timeoutMs = opts.timeoutMs ?? NINA_EMBEDDING_TIMEOUT_MS

  /*
   * Read INSIDE the function and inside a `try`, exactly as `lib/nina/vision.ts:493-501` and
   * `lib/nina/imagecall.ts:212-223` do: `ninaEnv()` is a lazy zod group that THROWS when its member
   * is absent, and production was measured once carrying neither of the variables it used to hold.
   * A module-scope read would turn a missing key into an import-time crash of everything that
   * imports this module — which, once phase 2 lands, is the deferred describe pass, and taking the
   * WORKING description path down over a missing search credential would be the wrong trade.
   *
   * `ci:openrouter-guard` permits the literal under `lib/nina/` and `lib/env.ts` only (RU-2), and
   * this file is under `lib/nina/`. Reading `process.env.OPENROUTER_API_KEY` directly would pass
   * the grep and break the invariant it stands for.
   */
  let apiKey: string
  try {
    apiKey = ninaEnv().OPENROUTER_API_KEY
  } catch (cause) {
    const err = new NinaEmbeddingError(
      'nina embedding is not configured (no OPENROUTER_API_KEY)',
      cause,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  let res: Response
  try {
    res = await fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NINA_EMBEDDING_MODEL,
        input,
        /* Explicit, and it is the shape the phase-1 probe sent. Several providers behind this
         * broker default to a base64-packed vector when the field is absent, which would arrive
         * here as a string and fail the array check below with a confusing message. Naming it
         * costs nothing and removes a whole class of "200 OK, wrong shape". */
        encoding_format: 'float',
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (cause) {
    const err = new NinaEmbeddingError('nina embedding request failed or timed out', cause)
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  /* `res.text()` first, then parse — `describeNinaImagesWithOpenRouter`'s idiom rather than
   * `res.json()`. A broker's non-2xx body is frequently HTML or a bare string, and the raw snippet
   * is the single most useful thing the log row can hold. `res.json()` would throw it away. */
  const raw = await res.text()

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (cause) {
    const err = new NinaEmbeddingError(
      `nina embedding response was not valid JSON: ${raw.slice(0, 300)}`,
      cause,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  if (!res.ok) {
    const err = new NinaEmbeddingError(
      `nina embedding endpoint returned ${res.status}: ${raw.slice(0, 300)}`,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  const body = json as { data?: Array<{ embedding?: unknown }> }
  const embedding = body.data?.[0]?.embedding

  if (!Array.isArray(embedding)) {
    const err = new NinaEmbeddingError(
      `nina embedding response carried no vector at data[0].embedding: ${raw.slice(0, 300)}`,
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  /* ══ THE WIDTH GUARD ═══════════════════════════════════════════════════════════════════════
   * The analogue of `vision.ts`'s token floor, and it GATES the return rather than validating
   * alongside it: a vector of the wrong length must never reach a column declared at a different
   * width, because the failure then surfaces as an opaque pgvector INSERT error inside an
   * `after()` callback instead of here, with both numbers named. The `every` check is part of it —
   * a `null` or a string inside the array is a vector pgvector will also refuse, and finding out
   * here costs one comparison per element on a vector we already materialised.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */
  if (
    embedding.length !== NINA_EMBEDDING_DIMENSIONS ||
    !embedding.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    const err = new NinaEmbeddingError(
      `nina embedding returned ${embedding.length} value(s) for model ${NINA_EMBEDDING_MODEL}; ` +
        `nina_avatars.description_embedding is vector(${NINA_EMBEDDING_DIMENSIONS}). The model id ` +
        'and NINA_EMBEDDING_DIMENSIONS must be changed together, in one migration, with a full ' +
        're-embed — two embedding models do not share a vector space.',
    )
    await recordEmbedFailure({ input, timeoutMs, cause: err, opts })
    throw err
  }

  return embedding as number[]
}

/**
 * Production: the real `fetch`. Everything else is `embedNinaTextWithFetch`.
 *
 * The whole public surface of this module for phases 2 and 3 — the deferred describe pass embeds
 * the description it just wrote, and the search action embeds the operator's query (or the caption
 * of their query image). Both call THIS.
 */
export async function embedNinaText(text: string, opts: NinaEmbedOptions = {}): Promise<number[]> {
  return embedNinaTextWithFetch(fetch, text, opts)
}
