import { describe, expect, it, vi } from 'vitest'

import { NINA_DESCRIBE_SYSTEM_PROMPT } from './prompts/describe'
import {
  NINA_TOKEN_FLOOR_PER_IMAGE,
  NinaVisionTokenFloorError,
  NinaVisionTransportError,
  describeNinaImagesWithFetch,
  describeTokenFloor,
  estimateTextTokens,
} from './vision'

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
