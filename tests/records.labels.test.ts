import { describe, expect, it } from 'vitest'

import { formatRecordValue } from '@/lib/records/labels'

/**
 * `longest_distance` and `most_elevation` share the catalog unit `'m'`, but a distance is read in
 * kilometres and a climb in metres. Routing both through `formatDistanceM` put "0.12 km" on the
 * shelf for a 118 m climb that the run page itself prints as "118 m" (found by verify-run-insights,
 * 2026-11-03).
 */
describe('formatRecordValue', () => {
  it('prints the elevation record in metres, the way the run page does', () => {
    expect(formatRecordValue('most_elevation', 118)).toBe('118 m')
  })

  it('still prints the distance record in kilometres', () => {
    expect(formatRecordValue('longest_distance', 21200)).toBe('21.20 km')
  })
})
