import { describe, expect, it, vi } from 'vitest'

import { PRIMARY_TIMEOUT_MS } from '@/lib/extract/constants'
import type { RgbImage } from '@/lib/extract/chart/estimate'
import { readWorkoutDetails, type DetailsDeps } from './readDetails'
import { VisionTokenFloorError, VisionTransportError, type VisionResult } from './vision'

const IMAGE = { dataUri: 'data:image/jpeg;base64,/9j/', bytes: Buffer.from([0xff, 0xd8]) }
const RGB: RgbImage = { width: 1, height: 1, data: new Uint8Array([0, 0, 0]) }
const PRINTED = {
  durationSec: 3046,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}

function result(text: string, promptTokens = 1100): VisionResult {
  return {
    text,
    promptTokens,
    completionTokens: 90,
    finishReason: 'stop',
    raw: { choices: [{ message: { content: text } }], usage: { prompt_tokens: promptTokens } },
  }
}

function deps(over: Partial<DetailsDeps> = {}): DetailsDeps {
  return {
    callDetails: vi.fn(async () => result(JSON.stringify(PRINTED))),
    decode: vi.fn(async () => RGB),
    ...over,
  }
}

describe('readWorkoutDetails — the details side never throws', () => {
  it('returns the validated printed values and the decoded pixels', async () => {
    const reading = await readWorkoutDetails(deps(), IMAGE, 40_000)
    expect(reading.printed).toEqual(PRINTED)
    expect(reading.image).toBe(RGB)
    expect(reading.errorCode).toBeNull()
    expect(reading.promptTokens).toBe(1100)
    expect(reading.vendor).toMatchObject({ usage: { prompt_tokens: 1100 } })
  })

  it('sends one image with a timeout capped by the budget, and by the primary timeout', async () => {
    const d = deps()
    await readWorkoutDetails(d, IMAGE, 20_000)
    expect(d.callDetails).toHaveBeenCalledWith({ dataUri: IMAGE.dataUri }, { timeoutMs: 20_000 })
    await readWorkoutDetails(d, IMAGE, 90_000)
    expect(d.callDetails).toHaveBeenLastCalledWith(
      { dataUri: IMAGE.dataUri },
      { timeoutMs: PRIMARY_TIMEOUT_MS },
    )
  })

  it('a token-floor trip is no reading, with the canary kept', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'token_floor', promptTokens: 141 })
    expect(reading.image).toBe(RGB)
  })

  it('a timeout is no reading, coded timeout', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    const reading = await readWorkoutDetails(
      deps({
        callDetails: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision request failed or timed out', timeout)),
        ),
      }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'timeout' })
  })

  it('a reply the schema refuses is no reading, coded validation, raw body kept', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => result('{"durationSec":"fifty minutes"}')) }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'validation' })
    expect(reading.vendor).not.toBeNull()
  })

  it('a reply with no JSON at all is no reading', async () => {
    const reading = await readWorkoutDetails(
      deps({ callDetails: vi.fn(async () => result('I cannot read this screen.')) }),
      IMAGE,
      40_000,
    )
    expect(reading.errorCode).toBe('validation')
  })

  it('a decode failure keeps the reading and loses only the pixels', async () => {
    const reading = await readWorkoutDetails(
      deps({ decode: vi.fn(async () => Promise.reject(new Error('unsupported image format'))) }),
      IMAGE,
      40_000,
    )
    expect(reading.printed).toEqual(PRINTED)
    expect(reading.image).toBeNull()
  })

  it('an unexpected error, even a synchronous throw, degrades to transport', async () => {
    const reading = await readWorkoutDetails(
      deps({
        callDetails: (() => {
          throw new TypeError('boom')
        }) as unknown as DetailsDeps['callDetails'],
      }),
      IMAGE,
      40_000,
    )
    expect(reading).toMatchObject({ printed: null, errorCode: 'transport' })
  })
})
