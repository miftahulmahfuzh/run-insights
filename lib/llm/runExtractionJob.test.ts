import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TRUTH } from '../../research/schema.mjs'
import type { ChartEstimate, RgbImage } from '@/lib/extract/chart/estimate'
import type { ScreenKind } from '@/lib/extract/constants'
import type { ExtractionBlobRef } from '@/lib/schema/extractionResult'
import type { RawResponseColumn, JobDeps } from './runExtractionJob'
import { VisionTokenFloorError, VisionTransportError, type VisionResult } from './vision'

/**
 * The job, end to end through its public entry, with both vision calls, the decode and the clock
 * injected, the database writes captured and the Blob fetch stubbed. The estimator is a
 * collaborator from phase 1 and is stubbed to a canned estimate here so the MERGE and the STATUS
 * rules are what is asserted; `tests/extract.detailsMerge.test.ts` runs the real estimator on the
 * real fixtures.
 */

const queries = vi.hoisted(() => ({
  markExtractionOk: vi.fn(),
  markExtractionRepaired: vi.fn(),
  markExtractionFailed: vi.fn(),
}))
vi.mock('@/lib/db/queries', () => ({ ...queries }))

const chart = vi.hoisted(() => ({ estimateFromCharts: vi.fn() }))
vi.mock('@/lib/extract/chart/estimate', () => ({ ...chart }))
vi.mock('@/lib/extract/chart/decode', () => ({ decodeToRgb: vi.fn() }))

const { runExtractionJob } = await import('./runExtractionJob')

const USER = 'user_1'
const ID = 'extract12345'
const RGB: RgbImage = { width: 1, height: 1, data: new Uint8Array([0, 0, 0]) }

const SUNDAY_PRINTED = {
  durationSec: TRUTH.durationSec,
  distanceKm: null,
  paceSlowestSecPerKm: 552,
  paceFastestSecPerKm: 407,
  avgPaceSecPerKm: null,
  hrMinBpm: 116,
  hrMaxBpm: 177,
  avgHrBpm: 161,
  elevationGainM: 4,
}

const CANNED: ChartEstimate = {
  distanceKm: 6.1,
  distanceWasEstimated: true,
  slotCount: 90,
  splits: [
    { km: 1, timeSec: 494.2, paceSecPerKm: 494.2, hrBpm: 141.6, cadenceSpm: null, partial: false },
    { km: 2, timeSec: 496, paceSecPerKm: 496, hrBpm: 155, cadenceSpm: null, partial: false },
    { km: 3, timeSec: 496, paceSecPerKm: 496, hrBpm: 160, cadenceSpm: null, partial: false },
    { km: 4, timeSec: 512, paceSecPerKm: 512, hrBpm: 162, cadenceSpm: null, partial: false },
    { km: 5, timeSec: 509, paceSecPerKm: 509, hrBpm: 165, cadenceSpm: null, partial: false },
    { km: 6, timeSec: 493, paceSecPerKm: 493, hrBpm: 170, cadenceSpm: null, partial: false },
    { km: 7, timeSec: 46, paceSecPerKm: 460, hrBpm: 175, cadenceSpm: null, partial: true },
  ],
}

/** What the primary call returns for a summary + heart-rate read with no printed distance. */
const NO_DISTANCE_JSON = JSON.stringify({ ...TRUTH, distanceKm: null, avgPaceSecPerKm: null })

function ref(kind: ScreenKind): ExtractionBlobRef {
  return {
    url: `https://riverifystore0000.public.blob.vercel-storage.com/shots/${kind}.jpg`,
    pathname: `shots/abcdefghijkl-${'x'.repeat(20)}.jpg`,
    kind,
    width: 560,
    height: 1212,
    bytes: 3,
    contentHash: null,
  }
}

function visionResult(text: string, promptTokens = 3277): VisionResult {
  return {
    text,
    promptTokens,
    completionTokens: 900,
    finishReason: 'stop',
    raw: { choices: [{ message: { content: text } }], usage: { prompt_tokens: promptTokens } },
  }
}

function deps(over: Partial<JobDeps> = {}): JobDeps {
  return {
    callPrimary: vi.fn(async () => visionResult(NO_DISTANCE_JSON)),
    callRepair: vi.fn(async () => Promise.reject(new Error('no repair expected'))),
    callDetails: vi.fn(async () => visionResult(JSON.stringify(SUNDAY_PRINTED), 1100)),
    decode: vi.fn(async () => RGB),
    now: () => 1_000_000,
    ...over,
  }
}

async function run(kinds: ScreenKind[], d: JobDeps) {
  await runExtractionJob(
    { userId: USER, extractionId: ID, images: kinds.map(ref), invocationStartedAt: 1_000_000 },
    d,
  )
}

const okRaw = () => queries.markExtractionOk.mock.calls[0]![2] as RawResponseColumn

beforeEach(() => {
  vi.resetAllMocks()
  chart.estimateFromCharts.mockReturnValue(CANNED)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the primary request (R1.3)', () => {
  it('never carries the details image, and the details image goes to its own one-image call', async () => {
    const d = deps()
    await run(['summary', 'details', 'heartrate'], d)

    expect(d.callPrimary).toHaveBeenCalledTimes(1)
    const [primaryImages] = vi.mocked(d.callPrimary).mock.calls[0]!
    expect(primaryImages.map((i) => i.kind)).toEqual(['summary', 'heartrate'])
    expect(d.callDetails).toHaveBeenCalledTimes(1)
    expect(vi.mocked(d.callDetails).mock.calls[0]![0]).toEqual({
      dataUri: expect.stringMatching(/^data:image\/jpeg;base64,/),
    })
  })

  it('a plain summary + splits + heart rate upload makes no details call and writes no details key', async () => {
    const d = deps({ callPrimary: vi.fn(async () => visionResult(JSON.stringify(TRUTH))) })
    await run(['summary', 'splits', 'heartrate'], d)

    expect(d.callDetails).not.toHaveBeenCalled()
    expect(okRaw()).not.toHaveProperty('details')
    expect(okRaw().parsedSession!.splits).toEqual(TRUTH.splits)
  })
})

describe('the two calls run concurrently', () => {
  it('starts the details call while the primary call is still in flight', async () => {
    let releasePrimary!: (r: VisionResult) => void
    const primary = new Promise<VisionResult>((resolve) => {
      releasePrimary = resolve
    })
    const d = deps({ callPrimary: vi.fn(() => primary) })
    const job = run(['summary', 'details', 'heartrate'], d)

    await vi.waitFor(() => expect(d.callDetails).toHaveBeenCalledTimes(1))
    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    releasePrimary(visionResult(NO_DISTANCE_JSON))
    await job
    expect(queries.markExtractionOk).toHaveBeenCalledTimes(1)
  })
})

describe('the merge (R2.3, A1, A2, A7)', () => {
  it('writes the estimated distance and splits into parsedSession and records them', async () => {
    await run(['summary', 'details', 'heartrate'], deps())

    expect(chart.estimateFromCharts).toHaveBeenCalledWith(RGB, {
      durationSec: TRUTH.durationSec,
      paceSlowestSecPerKm: 552,
      paceFastestSecPerKm: 407,
      hrMinBpm: 116,
      hrMaxBpm: 177,
      knownDistanceKm: null,
    })
    const raw = okRaw()
    expect(raw.parsedSession!.distanceKm).toBe(6.1)
    expect(raw.parsedSession!.splits).toHaveLength(7)
    expect(raw.parsedSession!.splits[0]).toEqual({
      km: 1,
      timeSec: 494,
      paceSecPerKm: 494,
      hrBpm: 142,
      cadenceSpm: null,
      partial: false,
    })
    expect(raw.details).toEqual({
      vendor: expect.anything(),
      printed: SUNDAY_PRINTED,
      estimate: { distanceKm: 6.1, splits: true },
    })
    // A7: the summary's own average HR (TRUTH) is kept over the details screen's 161.
    expect(raw.parsedSession!.avgHrBpm).toBe(TRUTH.avgHrBpm)
  })

  it('a transcribed distance is handed to the estimator and is not flagged (A2)', async () => {
    chart.estimateFromCharts.mockReturnValue({
      ...CANNED,
      distanceKm: 6.04,
      distanceWasEstimated: false,
    })
    const d = deps({
      callPrimary: vi.fn(async () => visionResult(JSON.stringify({ ...TRUTH, distanceKm: 6.04 }))),
    })
    await run(['summary', 'details', 'heartrate'], d)

    expect(chart.estimateFromCharts.mock.calls[0]![1]).toMatchObject({ knownDistanceKm: 6.04 })
    expect(okRaw().parsedSession!.distanceKm).toBe(6.04)
    expect(okRaw().details!.estimate).toEqual({ distanceKm: null, splits: true })
  })

  it('a splits screenshot wins: the table is kept and no estimate is attempted (R1.2)', async () => {
    const d = deps({ callPrimary: vi.fn(async () => visionResult(JSON.stringify(TRUTH))) })
    await run(['summary', 'splits', 'details'], d)

    expect(chart.estimateFromCharts).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.splits).toEqual(TRUTH.splits)
    expect(okRaw().details!.estimate).toBeNull()
    expect(okRaw().details!.printed).toEqual(SUNDAY_PRINTED)
  })
})

describe('a details-side failure never fails the extraction (R2.4)', () => {
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
  // Factories, not prebuilt mocks: `vi.resetAllMocks()` in beforeEach would strip a module-level
  // vi.fn's implementation before the case runs.
  const cases: Array<[string, () => Partial<JobDeps>]> = [
    [
      'the details call times out',
      () => ({
        callDetails: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision request failed or timed out', timeout)),
        ),
      }),
    ],
    [
      'the details call trips the token floor',
      () => ({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
    ],
    [
      'the details reply is not the shape',
      () => ({
        callDetails: vi.fn(async () => visionResult('{"durationSec":"fifty minutes"}', 1100)),
      }),
    ],
    [
      'the pace range was not transcribed',
      () => ({
        callDetails: vi.fn(async () =>
          visionResult(JSON.stringify({ ...SUNDAY_PRINTED, paceSlowestSecPerKm: null }), 1100),
        ),
      }),
    ],
    [
      'the screenshot cannot be decoded',
      () => ({ decode: vi.fn(async () => Promise.reject(new Error('unsupported image format'))) }),
    ],
  ]

  it.each(cases)('%s: ok, the other screens intact, no estimate', async (_label, over) => {
    await run(['summary', 'details', 'heartrate'], deps(over()))

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    const raw = okRaw()
    expect(raw.parsedSession!.durationSec).toBe(TRUTH.durationSec)
    expect(raw.parsedSession!.avgHrBpm).toBe(TRUTH.avgHrBpm)
    expect(raw.parsedSession!.hrZones).toEqual(TRUTH.hrZones)
    expect(raw.parsedSession!.distanceKm).toBeNull()
    expect(raw.parsedSession!.splits).toEqual([])
    expect(raw.details!.estimate).toBeNull()
  })

  it('the charts cannot be located (the estimator answers null): ok, no estimate', async () => {
    chart.estimateFromCharts.mockReturnValue(null)
    await run(['summary', 'details', 'heartrate'], deps())

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.distanceKm).toBeNull()
    expect(okRaw().details!.estimate).toBeNull()
    expect(okRaw().details!.printed).toEqual(SUNDAY_PRINTED)
  })

  it('even an estimator that throws against its contract costs only the estimate', async () => {
    chart.estimateFromCharts.mockImplementation(() => {
      throw new Error('contract broken')
    })
    await run(['summary', 'details', 'heartrate'], deps())

    expect(queries.markExtractionFailed).not.toHaveBeenCalled()
    expect(okRaw().parsedSession!.durationSec).toBe(TRUTH.durationSec)
    expect(okRaw().details!.estimate).toBeNull()
  })
})

describe('statuses when one side stands alone', () => {
  it('details-only: no primary call, ok, built from the printed values and the estimate', async () => {
    const d = deps()
    await run(['details'], d)

    expect(d.callPrimary).not.toHaveBeenCalled()
    const [, , raw, promptTokens] = queries.markExtractionOk.mock.calls[0]!
    expect(promptTokens).toBe(1100)
    expect((raw as RawResponseColumn).parsedSession).toMatchObject({
      durationSec: TRUTH.durationSec,
      distanceKm: 6.1,
      elevationGainM: 4,
      avgHrBpm: 161,
    })
    expect((raw as RawResponseColumn).details!.estimate).toEqual({ distanceKm: 6.1, splits: true })
  })

  it('details-only with a failed reading is failed, with the reading’s own code', async () => {
    await run(
      ['details'],
      deps({ callDetails: vi.fn(async () => Promise.reject(new VisionTokenFloorError(141, 1))) }),
    )

    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    const [, , code, raw, promptTokens] = queries.markExtractionFailed.mock.calls[0]!
    expect(code).toBe('token_floor')
    expect(promptTokens).toBe(141)
    expect((raw as RawResponseColumn).details).toEqual({
      vendor: null,
      printed: null,
      estimate: null,
    })
  })

  it('a failed primary decides the status even when the details reading worked', async () => {
    await run(
      ['summary', 'details', 'heartrate'],
      deps({
        callPrimary: vi.fn(async () =>
          Promise.reject(new VisionTransportError('vision endpoint returned 503')),
        ),
      }),
    )

    expect(queries.markExtractionOk).not.toHaveBeenCalled()
    const [, , code, raw] = queries.markExtractionFailed.mock.calls[0]!
    expect(code).toBe('transport')
    expect((raw as RawResponseColumn).parsedSession).toBeNull()
    expect((raw as RawResponseColumn).details!.printed).toEqual(SUNDAY_PRINTED)
    expect((raw as RawResponseColumn).details!.estimate).toBeNull()
  })
})
