import { describe, expect, it } from 'vitest'

import { formatDay } from '@/lib/format'
import { indexAttachments, toRunAttachment, type RunAttachmentInput } from './attach'

const ROW: RunAttachmentInput = {
  id: 'run_abc123',
  occurredOn: '2026-08-20',
  location: 'Senayan',
  activityType: 'Outdoor Run',
  distanceM: 10670,
  durationSec: 3753,
  avgPaceSec: 352,
}

describe('toRunAttachment', () => {
  it('spells every measurement through lib/format', () => {
    expect(toRunAttachment(ROW)).toEqual({
      runId: 'run_abc123',
      day: formatDay('2026-08-20'),
      activityType: 'Outdoor Run',
      location: 'Senayan',
      distance: '10.67 km',
      duration: '1:02:33',
      pace: '5\'52"/km',
    })
  })

  it('keeps a missing location as null rather than an em dash', () => {
    // The card decides how to render an absence; a formatter that invents '—' would put a rendered
    // string outside lib/format.ts.
    expect(toRunAttachment({ ...ROW, location: null }).location).toBeNull()
  })
})

describe('indexAttachments', () => {
  it('keys by run id', () => {
    const index = indexAttachments([ROW, { ...ROW, id: 'run_def456' }])
    expect([...index.keys()]).toEqual(['run_abc123', 'run_def456'])
    expect(index.get('run_abc123')?.distance).toBe('10.67 km')
  })

  it('is empty for no rows', () => {
    expect(indexAttachments([]).size).toBe(0)
  })
})
