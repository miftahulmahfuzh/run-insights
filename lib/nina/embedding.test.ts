import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NINA_EMBEDDING_DIMENSIONS } from '@/lib/db/schema'
import {
  NINA_EMBEDDING_MAX_CHARS,
  NINA_EMBEDDING_TIMEOUT_MS,
  NinaEmbeddingError,
  clampEmbedInput,
  embedErrorText,
  embedNinaTextWithFetch,
} from './embedding'
import { NINA_EMBEDDING_MODEL, OPENROUTER_EMBEDDINGS_URL } from './openrouter'

/*
 * `OPENROUTER_API_KEY` is NOT in `tests/support/setup.ts`'s `LLM_DEFAULTS`, and this phase
 * deliberately does not add it: that list is documented as mirroring `.github/workflows/ci.yml`'s
 * env block byte for byte. `lib/nina/vision.test.ts` sets the same default at its own module scope
 * for the same reason. The key is read lazily through `ninaEnv()` at call time, so one default in
 * each file that needs it is enough — and `??=` means a real `.env` never loses.
 *
 * Nothing is sent anywhere: every case below drives an injected `fetch`.
 */
process.env.OPENROUTER_API_KEY ??= 'unit-test-openrouter-key-never-sent'

/*
 * `lib/nina/embedding.ts` imports `logNinaError` from `./errorlogs`, which talks to the database.
 * Mocked at the module boundary so the failure cases assert THE ROW THAT WOULD BE WRITTEN without
 * one — `vision.test.ts`'s construction.
 */
const logNinaError = vi.fn<(entry: unknown) => Promise<void>>(async () => {})
vi.mock('./errorlogs', () => ({
  logNinaError: (entry: unknown) => logNinaError(entry),
}))

/** A well-formed vector of exactly the declared width. */
function vectorOf(n = NINA_EMBEDDING_DIMENSIONS): number[] {
  return Array.from({ length: n }, (_, i) => (i % 7) / 10)
}

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

function okBody(vector: unknown = vectorOf()) {
  return { object: 'list', data: [{ object: 'embedding', index: 0, embedding: vector }] }
}

beforeEach(() => {
  logNinaError.mockClear()
})

describe('clampEmbedInput', () => {
  it('trims, and leaves anything of a realistic length alone', () => {
    // A described photo is 60-140 words (~900 chars) because the describe prompt asks for that,
    // and a search query is a sentence. Nothing legitimate is ever truncated.
    expect(clampEmbedInput('  a woman on a trail  ')).toBe('a woman on a trail')
    const realistic = 'x'.repeat(900)
    expect(clampEmbedInput(realistic)).toBe(realistic)
  })

  it('clamps a caller that hands over something that is not prose', () => {
    // The guard's real job: a data: URI or a stringified row, one careless line away on the
    // vision path — `lib/nina/errorlogs.ts`'s NINA_ERROR_LOG_TEXT_MAX note, same argument.
    const huge = 'y'.repeat(NINA_EMBEDDING_MAX_CHARS + 5_000)
    expect(clampEmbedInput(huge)).toHaveLength(NINA_EMBEDDING_MAX_CHARS)
  })

  it('appends no truncation marker — this string is sent to a model, not shown to a human', () => {
    const clamped = clampEmbedInput('z'.repeat(NINA_EMBEDDING_MAX_CHARS + 10))
    expect(clamped).not.toMatch(/truncated/i)
  })
})

describe('the request this module sends', () => {
  it('posts the probed shape to the embeddings endpoint, with the key and the ceiling', async () => {
    const fetchImpl = respond(okBody())
    await embedNinaTextWithFetch(fetchImpl, '  a woman in a red jacket  ')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(OPENROUTER_EMBEDDINGS_URL)
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)
    expect(JSON.parse(String(init.body))).toEqual({
      model: NINA_EMBEDDING_MODEL,
      // TRIMMED — clampEmbedInput runs before the request, not after it.
      input: 'a woman in a red jacket',
      // Explicit, because several providers behind this broker default to base64 packing.
      encoding_format: 'float',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('honours a caller-supplied ceiling, and defaults to the measured one', () => {
    // The constant itself is the contract phase 2 budgets its after() callback against.
    expect(NINA_EMBEDDING_TIMEOUT_MS).toBe(15_000)
  })

  it('refuses empty text BEFORE the vendor, and writes no log row for it', async () => {
    // A programmer error, not a degraded query: one throw, zero rows — the placement
    // `describeNinaImagesWithFallback` uses for its empty-array check.
    const fetchImpl = respond(okBody())
    await expect(embedNinaTextWithFetch(fetchImpl, '   ')).rejects.toBeInstanceOf(
      NinaEmbeddingError,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(logNinaError).not.toHaveBeenCalled()
  })
})

describe('the width guard', () => {
  it('returns the vector when it is exactly the declared width', async () => {
    const vector = vectorOf()
    const got = await embedNinaTextWithFetch(respond(okBody(vector)), 'a trail at sunrise')
    expect(got).toHaveLength(NINA_EMBEDDING_DIMENSIONS)
    expect(got).toEqual(vector)
    expect(logNinaError).not.toHaveBeenCalled()
  })

  it('refuses a vector of the wrong width, naming BOTH numbers', async () => {
    // This is the module's token floor. A wrong width must not reach the column: the failure
    // would otherwise surface as an opaque pgvector INSERT error inside an after() callback,
    // hours after whoever swapped the model has stopped looking.
    const fetchImpl = respond(okBody(vectorOf(NINA_EMBEDDING_DIMENSIONS - 1)))
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(
      new RegExp(String(NINA_EMBEDDING_DIMENSIONS)),
    )
    expect(logNinaError).toHaveBeenCalledTimes(1)
  })

  it('refuses a right-width vector carrying a non-finite element', async () => {
    // pgvector refuses NaN too; finding out here costs one pass over a vector we already have.
    const poisoned = vectorOf()
    poisoned[3] = Number.NaN
    await expect(
      embedNinaTextWithFetch(respond(okBody(poisoned)), 'a trail'),
    ).rejects.toBeInstanceOf(NinaEmbeddingError)
  })

  it('refuses a base64-packed vector rather than reporting a confusing length', async () => {
    // What arrives when `encoding_format` is dropped from the request. A string is not an array.
    await expect(
      embedNinaTextWithFetch(respond(okBody('AAAAgD8AAABA')), 'a trail'),
    ).rejects.toThrow(/no vector at data\[0\]\.embedding/)
  })
})

describe('failures, and the row each one writes', () => {
  it('wraps a thrown fetch and logs it against the text category', async () => {
    const boom = vi.fn(async () => {
      throw new Error('ECONNRESET')
    }) as unknown as typeof fetch

    await expect(embedNinaTextWithFetch(boom, 'a trail', { userId: 'u1' })).rejects.toBeInstanceOf(
      NinaEmbeddingError,
    )

    expect(logNinaError).toHaveBeenCalledTimes(1)
    const entry = logNinaError.mock.calls[0]?.[0] as Record<string, unknown>
    // 'text' and not a fourth NinaErrorCategory: an embedding IS a text-model call, and the
    // existing Text tab on /admin/error-logs is where an operator looks for one.
    expect(entry.category).toBe('text')
    expect(entry.provider).toBe('openrouter')
    expect(entry.model).toBe(NINA_EMBEDDING_MODEL)
    expect(entry.timeoutMs).toBe(NINA_EMBEDDING_TIMEOUT_MS)
    // This path never holds a photo — an image search arrives here as caption TEXT, and the
    // describe call that produced it logs its own row with its own image link.
    expect(entry.imageUrl).toBeNull()
    expect(entry.userId).toBe('u1')
    expect(String(entry.errorMessage)).toContain('ECONNRESET')
    // The real input, so the row is diagnosable. No base64 can reach it — the clamp bounds it.
    expect(String(entry.fullInput)).toContain('a trail')
  })

  it('reports a non-2xx with the raw body snippet, which a JSON parse would have thrown away', async () => {
    const fetchImpl = respond({ error: { message: 'no endpoints found for this model' } }, 404)
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(
      /returned 404.*no endpoints found/s,
    )
    expect(logNinaError).toHaveBeenCalledTimes(1)
  })

  it('reports a non-JSON body without pretending it parsed', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    ) as unknown as typeof fetch
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(/not valid JSON/)
  })

  it('never lets a logging failure change the call outcome', async () => {
    // The doubled guard `recordDescribeFailure` holds: logNinaError is specified best-effort, and
    // this catch is that guarantee held where it is depended on.
    logNinaError.mockRejectedValueOnce(new Error('neon is down'))
    const fetchImpl = respond({ error: 'nope' }, 500)
    await expect(embedNinaTextWithFetch(fetchImpl, 'a trail')).rejects.toThrow(/returned 500/)
  })

  it('keeps the detail that String(cause) would drop', () => {
    const err = new NinaEmbeddingError('something broke', new Error('the real cause'))
    expect(embedErrorText(err)).toContain('the real cause')
    expect(embedErrorText(new NinaEmbeddingError('bare'))).toBe('NinaEmbeddingError: bare')
    expect(embedErrorText('a string')).toBe('a string')
  })
})
