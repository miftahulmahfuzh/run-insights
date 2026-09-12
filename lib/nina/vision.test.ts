import { beforeEach, describe, expect, it, vi } from 'vitest'

import { describeSubjectForSide } from './album'
import { NINA_FALLBACK_TEXT_MODEL, OPENROUTER_CHAT_URL } from './openrouter'
import {
  NINA_DESCRIBE_REQUEST_TEXT,
  NINA_DESCRIBE_SYSTEM_PROMPT,
  NINA_SELF_DESCRIBE_SYSTEM_PROMPT,
} from './prompts/describe'
import {
  NINA_DESCRIBE_FALLBACK_TIMEOUT_MS,
  NINA_DESCRIBE_TIMEOUT_MS,
  NINA_TOKEN_FLOOR_PER_IMAGE,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
  describeErrorText,
  describeLogInput,
  describeNinaImagesWithFallback,
  describeNinaImagesWithFetch,
  describeTokenFloor,
  estimateTextTokens,
} from './vision'

/*
 * `OPENROUTER_API_KEY` is NOT in `tests/support/setup.ts`'s `LLM_DEFAULTS`, and this phase
 * deliberately does not add it there: that list is documented as mirroring `.github/workflows`' env
 * block byte for byte, and editing one without the other leaves `npm test` and CI testing different
 * things. The fallback reads the key lazily through `ninaEnv()` at call time, so a module-scope
 * default in the one file that needs it is enough — and `??=` means a real `.env` never loses.
 *
 * Nothing is sent anywhere: every case below drives an injected `fetch`.
 */
process.env.OPENROUTER_API_KEY ??= 'unit-test-openrouter-key-never-sent'

/*
 * `lib/nina/vision.ts` now imports `logNinaError` from `./errorlogs`, which talks to the database.
 * Mocked at the module boundary so the fallback cases assert the ROW THAT WOULD BE WRITTEN without
 * a database, and so the eleven pre-existing cases below — which never reach a log call — keep
 * running exactly as they did.
 */
const logNinaError = vi.fn<(entry: unknown) => Promise<void>>(async () => {})
vi.mock('./errorlogs', () => ({
  logNinaError: (entry: unknown) => logNinaError(entry),
}))

const IMAGE = { dataUri: 'data:image/jpeg;base64,AAAA' }

function respond(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

describe('the floor arithmetic', () => {
  it('over-estimates the text term on purpose, in the safe direction', () => {
    // 3 chars/token here, ~4 in reality: the gap IS the margin, and it points at "I could not
    // see it" rather than at believing an invented description.
    expect(estimateTextTokens(3_300)).toBe(1_100)
    expect(estimateTextTokens(0)).toBe(0)
  })

  it('adds 500 PER IMAGE, and the multiplication is load-bearing', () => {
    expect(describeTokenFloor(0, 1)).toBe(NINA_TOKEN_FLOOR_PER_IMAGE)
    expect(describeTokenFloor(0, 3)).toBe(NINA_TOKEN_FLOOR_PER_IMAGE * 3)
    // A flat floor would let a 3-image request with one image delivered slip through.
    expect(describeTokenFloor(300, 3)).toBeGreaterThan(describeTokenFloor(300, 1))
  })

  it('separates a dropped image from a delivered one, with THIS prompt', () => {
    // The real system prompt, tokenised the way the endpoint would (~4 chars/token) — the number
    // a DROPPED-image response would report, which a flat floor of 500 would happily accept.
    const droppedReport = Math.ceil(NINA_DESCRIBE_SYSTEM_PROMPT.length / 4)
    const floor = describeTokenFloor(NINA_DESCRIBE_SYSTEM_PROMPT.length + 20, 1)

    expect(droppedReport).toBeGreaterThan(NINA_TOKEN_FLOOR_PER_IMAGE) // F04's flat floor fails
    expect(droppedReport).toBeLessThan(floor) // this one does not
    // A real 768px photo is ~1,700 input tokens on top of the text.
    expect(droppedReport + 1_700).toBeGreaterThan(floor)
  })

  it('clears the floor for the measured 612×862 arrival card — the false trip of 2026-09-08', () => {
    // MEASURED, twice, deterministic: glm-4.6v reported 1,559 prompt_tokens for the shipped runner
    // prompt over one 612×862 photo (`nina_message_images` Jv4VMDMao31j). At 500/image the floor
    // was 1,649, the guard refused, and Nina told him the picture "didn't load" — while the SAME
    // card upscaled to short edge 768 scored 1,930 and read back every field on it. The image WAS
    // delivered; it was merely small. Image tokens run ~pixels/1,100, so the per-image term must
    // sit UNDER a small real photo, not over it: the floor's drop detection needs the term to be
    // positive, because a dropped image reports the text alone.
    const promptChars = NINA_DESCRIBE_SYSTEM_PROMPT.length + NINA_DESCRIBE_REQUEST_TEXT.length
    expect(describeTokenFloor(promptChars, 1)).toBeLessThanOrEqual(1_559)
  })
})

describe('describeNinaImagesWithFetch', () => {
  it('trips the floor on the measured drop signature and never reads the text', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 141, completion_tokens: 40 },
      choices: [{ message: { content: 'He is soaked and grinning on wet asphalt.' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('trips the floor on a plausible text-only report, which is the F04 port’s hole', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 900, completion_tokens: 120 },
      choices: [{ message: { content: 'A man running.' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('returns a trimmed description when the image really arrived', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 180 },
      choices: [
        {
          message: { content: '  Soaked through, dark tee stuck to his chest.  ' },
          finish_reason: 'stop',
        },
      ],
    })
    const result = await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
    expect(result.description).toBe('Soaked through, dark tee stuck to his chest.')
    expect(result.promptTokens).toBe(2_800)
    expect(result.finishReason).toBe('stop')
  })

  it('reports the floor before the status, when a response fails both', async () => {
    const fetchImpl = respond({ usage: { prompt_tokens: 10 }, error: 'nope' }, 500)
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTokenFloorError,
    )
  })

  it('is a transport error on a non-200 that cleared the floor', async () => {
    const fetchImpl = respond({ usage: { prompt_tokens: 2_800 }, error: 'nope' }, 502)
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTransportError,
    )
  })

  it('is a transport error on an empty completion, not a silent empty description', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 0 },
      choices: [{ message: { content: '   ' } }],
    })
    await expect(describeNinaImagesWithFetch(fetchImpl, [IMAGE])).rejects.toBeInstanceOf(
      NinaVisionTransportError,
    )
  })

  it('sends an OpenAI-shaped envelope with an image_url part and thinking disabled', async () => {
    const fetchImpl = respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 100 },
      choices: [{ message: { content: 'ok' } }],
    })
    await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body.thinking).toEqual({ type: 'disabled' })
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: IMAGE.dataUri },
    })
  })
})

describe('the describe prompt', () => {
  it('forbids reading out numbers — invariant 2 at the vision boundary', () => {
    expect(NINA_DESCRIBE_SYSTEM_PROMPT).toMatch(/NEVER read out a number/)
  })
})

describe('which witness is sent', () => {
  /** The envelope-reading idiom this file already uses, named once. */
  const bodyOf = (fetchImpl: typeof fetch) => {
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit]
    return JSON.parse(String(init.body))
  }

  const ok = () =>
    respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 100 },
      choices: [{ message: { content: 'ok' } }],
    })

  it('sends the runner witness prompt by default, byte for byte', async () => {
    const fetchImpl = ok()
    await describeNinaImagesWithFetch(fetchImpl, [IMAGE])
    expect(bodyOf(fetchImpl).messages[0].content).toBe(NINA_DESCRIBE_SYSTEM_PROMPT)
  })

  it('sends the self witness prompt for subject: self', async () => {
    const fetchImpl = ok()
    await describeNinaImagesWithFetch(fetchImpl, [IMAGE], { subject: 'self' })
    const content = bodyOf(fetchImpl).messages[0].content
    expect(content).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
    // The subject is the whole point of the second prompt: it looks for her, not for him.
    expect(content).toContain('Call her "she"')
  })

  it('still trips the floor on the measured drop signature with the self prompt', async () => {
    // The floor is TEXT-AWARE, so a LONGER prompt RAISES it. That is the direction the module
    // header calls correct, and this case must keep tripping rather than start passing.
    const fetchImpl = respond({
      usage: { prompt_tokens: 141, completion_tokens: 40 },
      choices: [{ message: { content: 'She is underwater over a reef.' } }],
    })
    await expect(
      describeNinaImagesWithFetch(fetchImpl, [IMAGE], { subject: 'self' }),
    ).rejects.toBeInstanceOf(NinaVisionTokenFloorError)
  })
})

describe('subject by side reaches the prompt, not around it (R3)', () => {
  /** The envelope-reading idiom this file already uses, named once. */
  const bodyOf = (fetchImpl: typeof fetch) => {
    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0] as [string, RequestInit]
    return JSON.parse(String(init.body))
  }

  const ok = () =>
    respond({
      usage: { prompt_tokens: 2_800, completion_tokens: 100 },
      choices: [{ message: { content: 'ok' } }],
    })

  it('hers really sends the self prompt — the mapping is on the wire, not beside the call', async () => {
    // The pure mapping's both directions are pinned in lib/nina/album.test.ts
    // (describeSubjectForSide); this ties it to what glm-4.6v is actually asked, so an action
    // hardcoding a subject beside the helper cannot drift from the suite.
    const fetchImpl = ok()
    await describeNinaImagesWithFetch(fetchImpl, [IMAGE], {
      subject: describeSubjectForSide('hers'),
    })
    expect(bodyOf(fetchImpl).messages[0].content).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
  })
})

describe('the self describe prompt', () => {
  it('forbids reading out numbers — invariant 2, with no downstream to catch it', () => {
    expect(NINA_SELF_DESCRIBE_SYSTEM_PROMPT).toMatch(/NEVER read out a number/)
  })

  it('names swimwear as flatly as a coat, so she does not caption a hole', () => {
    expect(NINA_SELF_DESCRIBE_SYSTEM_PROMPT).toContain('You are not a moderator')
  })
})

describe('the OpenRouter fallback (R1)', () => {
  /**
   * A fake `fetch` that routes on the URL, the way the real world does. The primary path posts to
   * `env.LLM_VISION_BASE_URL` (`api.z.ai/...`), the fallback to `OPENROUTER_CHAT_URL` — so one fake
   * can give the two providers different answers, which is the whole point: the single-answer fake
   * the cases above use is exactly why the fallback is a separate function.
   */
  function route(
    zai: () => Response | Promise<Response>,
    openrouter: () => Response | Promise<Response>,
  ): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('openrouter.ai') ? openrouter() : zai(),
    ) as unknown as typeof fetch
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  /** A z.ai body carrying the measured drop signature: 200, plausible text, 141 prompt tokens. */
  const zaiDropped = () =>
    json({
      usage: { prompt_tokens: 141, completion_tokens: 40 },
      choices: [{ message: { content: 'He is soaked and grinning on wet asphalt.' } }],
    })

  /** A z.ai body that clears the floor and really arrived. */
  const zaiOk = () =>
    json({
      usage: { prompt_tokens: 2_800, completion_tokens: 180 },
      choices: [{ message: { content: 'Soaked through, dark tee stuck to his chest.' } }],
    })

  /**
   * An OpenRouter body with prompt tokens FAR BELOW any floor this module would compute. That is
   * the fixture's job: if the floor were ever applied to the fallback, this case fails.
   */
  const openRouterOk = () =>
    json({
      usage: { prompt_tokens: 12, completion_tokens: 90 },
      choices: [
        { message: { content: '  Low sun behind him on a wet track.  ' }, finish_reason: 'stop' },
      ],
    })

  const callsOf = (fetchImpl: typeof fetch) =>
    (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls

  beforeEach(() => {
    logNinaError.mockClear()
  })

  it('never calls OpenRouter, and never logs, when z.ai succeeds', async () => {
    const fetchImpl = route(zaiOk, openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(result.description).toBe('Soaked through, dark tee stuck to his chest.')
    expect(callsOf(fetchImpl)).toHaveLength(1)
    expect(String(callsOf(fetchImpl)[0]![0])).not.toContain('openrouter.ai')
    expect(logNinaError).not.toHaveBeenCalled()
  })

  it('retries on a token-floor trip, and the floor does NOT gate the fallback', async () => {
    // 12 prompt tokens is under every floor this module can compute. It is accepted anyway,
    // because the glm-4.6v-calibrated floor is deliberately not applied to a different model —
    // see `describeNinaImagesWithOpenRouter`'s header and the 2026-09-09 re-calibration.
    const fetchImpl = route(zaiDropped, openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(result.description).toBe('Low sun behind him on a wet track.')
    expect(result.promptTokens).toBe(12)
    expect(result.floor).toBe(0) // "no floor was applied", and the log line says so
  })

  it('retries on a transport failure (non-2xx)', async () => {
    const fetchImpl = route(
      () => json({ usage: { prompt_tokens: 2_800 }, error: 'nope' }, 502),
      openRouterOk,
    )
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('retries when the z.ai fetch itself throws', async () => {
    const fetchImpl = route(() => Promise.reject(new Error('socket hang up')), openRouterOk)
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('sends the same OpenAI-shaped envelope to OpenRouter, with the fallback model', async () => {
    const fetchImpl = route(zaiDropped, openRouterOk)
    await describeNinaImagesWithFallback(fetchImpl, [IMAGE], { subject: 'self' })

    const [url, init] = callsOf(fetchImpl)[1]!
    expect(String(url)).toBe(OPENROUTER_CHAT_URL)
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /)

    const body = JSON.parse(String(init.body))
    expect(body.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(body.thinking).toBeUndefined() // a z.ai vendor extension; never sent here
    expect(body.messages[0].content).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: IMAGE.dataUri },
    })
    expect(body.messages[1].content.at(-1)).toEqual({
      type: 'text',
      text: NINA_DESCRIBE_REQUEST_TEXT,
    })
  })

  it('logs both attempts and rethrows the ORIGINAL error when both providers fail', async () => {
    const fetchImpl = route(zaiDropped, () => json({ error: 'upstream unavailable' }, 503))

    await expect(
      describeNinaImagesWithFallback(fetchImpl, [IMAGE], {
        imageUrl: 'https://blob.example/nina/chat/abc.jpg',
      }),
      // The ORIGINAL class, not the fallback's transport error: `describeNinaImage` branches on
      // `instanceof NinaVisionTokenFloorError` to choose `reason: 'dropped'` and its loud
      // console.error. Rethrowing the fallback's error would silently reclassify every floor trip.
    ).rejects.toBeInstanceOf(NinaVisionTokenFloorError)

    expect(logNinaError).toHaveBeenCalledTimes(2)

    const first = logNinaError.mock.calls[0]![0] as Record<string, unknown>
    expect(first.category).toBe('multimodal')
    expect(first.provider).toBe('zai')
    expect(first.model).toBe('glm-4.6v')
    expect(first.timeoutMs).toBe(NINA_DESCRIBE_TIMEOUT_MS)
    expect(first.imageUrl).toBe('https://blob.example/nina/chat/abc.jpg')
    expect(String(first.errorMessage)).toContain('NinaVisionTokenFloorError')
    expect(String(first.errorMessage)).toContain('promptTokens=141')

    const second = logNinaError.mock.calls[1]![0] as Record<string, unknown>
    expect(second.category).toBe('multimodal')
    expect(second.provider).toBe('openrouter')
    expect(second.model).toBe(NINA_FALLBACK_TEXT_MODEL)
    expect(second.timeoutMs).toBe(NINA_DESCRIBE_FALLBACK_TIMEOUT_MS)
    expect(second.imageUrl).toBe('https://blob.example/nina/chat/abc.jpg')
    expect(String(second.errorMessage)).toContain('503')
  })

  it('logs the z.ai attempt even when the fallback then succeeds', async () => {
    const fetchImpl = route(zaiDropped, openRouterOk)
    await describeNinaImagesWithFallback(fetchImpl, [IMAGE])

    expect(logNinaError).toHaveBeenCalledTimes(1)
    expect((logNinaError.mock.calls[0]![0] as Record<string, unknown>).provider).toBe('zai')
  })

  it('a broken log writer costs nothing — the outer call is unaffected', async () => {
    logNinaError.mockRejectedValueOnce(new Error('nina_error_logs is on fire'))
    const fetchImpl = route(zaiDropped, openRouterOk)

    // The z.ai row fails to write. The retry still happens and the photo is still described.
    const result = await describeNinaImagesWithFallback(fetchImpl, [IMAGE])
    expect(result.description).toBe('Low sun behind him on a wet track.')
  })

  it('an empty image array is one throw and zero rows, not a programmer error logged twice', async () => {
    const fetchImpl = route(zaiOk, openRouterOk)
    await expect(describeNinaImagesWithFallback(fetchImpl, [])).rejects.toThrow(
      'describeNinaImages expects at least one image',
    )
    expect(logNinaError).not.toHaveBeenCalled()
    expect(callsOf(fetchImpl)).toHaveLength(0)
  })
})

describe('what the log row carries', () => {
  it('stores the real prompt and instruction, and never a base64 payload', () => {
    const input = describeLogInput('runner', 1)

    // The row is `JSON.stringify`d, so its multi-line prompt is newline-escaped inside the string
    // and a raw `toContain(prompt)` can never match. Parse the row back open and compare the
    // field EXACTLY — a stronger check than a substring, not a looser one.
    const row = JSON.parse(input) as { system: string; user: unknown[]; imageCount: number }
    expect(row.system).toBe(NINA_DESCRIBE_SYSTEM_PROMPT)
    expect(input).toContain(NINA_DESCRIBE_REQUEST_TEXT)
    expect(input).toContain('image_url')
    // The one property that matters: ~1.2 MB of base64 per image must never reach a text column.
    expect(input).not.toContain('base64')
    expect(input).toContain('data: URI omitted')
  })

  it('selects the same witness prompt the request did', () => {
    const row = JSON.parse(describeLogInput('self', 1)) as { system: string }
    expect(row.system).toBe(NINA_SELF_DESCRIBE_SYSTEM_PROMPT)
    expect(row.system).not.toBe(NINA_DESCRIBE_SYSTEM_PROMPT)
  })

  it('keeps a floor trip diagnosable — the three fields String(cause) throws away', () => {
    const text = describeErrorText(new NinaVisionTokenFloorError(141, 1_649, 1))
    expect(text).toContain('NinaVisionTokenFloorError')
    expect(text).toContain('promptTokens=141')
    expect(text).toContain('floor=1649')
    expect(text).toContain('imageCount=1')
  })

  it('keeps a transport error’s detail, which String(cause) never reaches', () => {
    const text = describeErrorText(
      new NinaVisionTransportError('request failed', new Error('ETIMEDOUT')),
    )
    expect(text).toContain('NinaVisionTransportError: request failed')
    expect(text).toContain('ETIMEDOUT')
  })

  it('survives a non-Error throw', () => {
    expect(describeErrorText('just a string')).toBe('just a string')
  })
})
