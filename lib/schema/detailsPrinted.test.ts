import { describe, expect, it } from 'vitest'

import { DetailsPrintedSchema } from './detailsPrinted'

const SUNDAY = {
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

describe('DetailsPrintedSchema — the details reading, validated once', () => {
  it('accepts the 2026-11-22 reading as printed', () => {
    expect(DetailsPrintedSchema.parse(SUNDAY)).toEqual(SUNDAY)
  })

  it('reads Apple’s 0’00’’ average (transcribed as 0) as null, not as a pace', () => {
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, avgPaceSecPerKm: 0 }).avgPaceSecPerKm).toBeNull()
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, durationSec: 0 }).durationSec).toBeNull()
  })

  it('keeps a real zero elevation gain', () => {
    expect(DetailsPrintedSchema.parse({ ...SUNDAY, elevationGainM: 0 }).elevationGainM).toBe(0)
  })

  it('defaults every omitted field to null — the vendor drops keys', () => {
    expect(DetailsPrintedSchema.parse({})).toEqual({
      durationSec: null,
      distanceKm: null,
      paceSlowestSecPerKm: null,
      paceFastestSecPerKm: null,
      avgPaceSecPerKm: null,
      hrMinBpm: null,
      hrMaxBpm: null,
      avgHrBpm: null,
      elevationGainM: null,
    })
  })

  it('drops an inverted pace pair but keeps everything else', () => {
    const out = DetailsPrintedSchema.parse({
      ...SUNDAY,
      paceSlowestSecPerKm: 407,
      paceFastestSecPerKm: 552,
    })
    expect(out.paceSlowestSecPerKm).toBeNull()
    expect(out.paceFastestSecPerKm).toBeNull()
    expect(out.durationSec).toBe(3046)
    expect(out.hrMinBpm).toBe(116)
  })

  it('drops an HR pair whose low is not below its high', () => {
    const out = DetailsPrintedSchema.parse({ ...SUNDAY, hrMinBpm: 177, hrMaxBpm: 177 })
    expect(out.hrMinBpm).toBeNull()
    expect(out.hrMaxBpm).toBeNull()
  })

  it('refuses a value that is not a number at all — the whole reading fails', () => {
    expect(
      DetailsPrintedSchema.safeParse({ ...SUNDAY, paceSlowestSecPerKm: "9'12''" }).success,
    ).toBe(false)
  })

  it('refuses a pace outside one minute to one hour per km', () => {
    expect(DetailsPrintedSchema.safeParse({ ...SUNDAY, paceFastestSecPerKm: 12 }).success).toBe(
      false,
    )
  })
})
