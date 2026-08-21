import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ProvenanceMark } from '@/components/runs/ProvenanceMark'
import { EmptyState } from '@/components/ui/EmptyState'
import { FlagList } from '@/components/ui/Flag'
import { SplitsTable } from '@/components/ui/SplitsTable'
import { ZoneBar } from '@/components/ui/ZoneBar'
import { fastestSlowestFullKm, toPaceHrPoints, toZoneShares } from '@/lib/charts'
import { computeSessionMetrics, evaluateSessionFlags } from '@/lib/metrics'
import { formatPercent } from '@/lib/format'
import { canonicalSession } from './fixtures/canonicalRun'

/**
 * **§11's visual QA, as far as a test can honestly take it.**
 *
 * These are the Server Components F08 ships with no Recharts in them — the zone bar, the splits
 * table, the provenance line, the flags, the empty state — rendered to static markup against the
 * canonical fixture. `createElement` rather than JSX because the test runner's `include` covers
 * `tests/**\/*.test.ts`, and a second config to admit `.tsx` would be a worse trade than three
 * `createElement` calls.
 *
 * What this catches that a unit test on `lib/charts` cannot: that the *numbers reach the screen*.
 * A correct `ZoneShare[]` rendered by a component that prints `s.durationSec` where it meant
 * `s.pct` passes every test in `charts.zones.test.ts`.
 *
 * What it does NOT catch, and what §11 still asks a human to do: whether the run detail page looks
 * right at 414px, on a good run and on the ugly one, in light and dark. No assertion substitutes
 * for opening it.
 */

const metrics = computeSessionMetrics(canonicalSession, { bpm: 189, source: 'observed' })
const points = toPaceHrPoints(canonicalSession.splits, canonicalSession.distanceM)

describe('ZoneBar renders the fixture the way the design brief asks for', () => {
  const html = renderToStaticMarkup(
    createElement(ZoneBar, {
      shares: toZoneShares(canonicalSession.zones),
      caption: `${formatPercent(metrics.hardPct, 1)} of this run was zone 4 or harder.`,
    }),
  )

  it('makes 90.6% unmissable, in a plain sentence, with no scolding', () => {
    expect(html).toContain('90.6% of this run was zone 4 or harder.')
    expect(html).not.toContain('!')
  })

  it('labels every zone with its number and its share — never colour alone', () => {
    for (const [zone, pct] of [
      [1, '2%'],
      [2, '1%'],
      [3, '7%'],
      [4, '47%'],
      [5, '43%'],
    ] as const) {
      expect(html).toContain(`Z${zone}`)
      expect(html).toContain(pct)
    }
  })

  it('keeps zone 2’s 1% visible: a 3px floor on a segment that would otherwise vanish', () => {
    expect(html).toContain('min-width:3px')
  })

  it('carries an accessible label and a table twin, so no value needs a hover', () => {
    expect(html).toContain('Zone 1, 2%, 1:44')
    expect(html).toContain('<details')
    expect(html).toContain('175 bpm and up')
  })

  it('renders the no-data case as a sentence, never as five 0% segments', () => {
    const empty = renderToStaticMarkup(createElement(ZoneBar, { shares: [] }))
    expect(empty).toContain('No heart-rate data for this run.')
    expect(empty).not.toContain('0%')
  })
})

describe('SplitsTable marks the partial kilometre on every channel D14 asks for', () => {
  const { fastestKm, slowestKm } = fastestSlowestFullKm(points)
  const html = renderToStaticMarkup(
    createElement(SplitsTable, { points, zones: canonicalSession.zones, fastestKm, slowestKm }),
  )

  it('prints 11* and its real distance next to the row’s own label', () => {
    expect(html).toContain('11*')
    expect(html).toContain('0.67 km')
  })

  it('states the partial row in words underneath, elapsed time included', () => {
    // The pace-mark escapes: react writes `7&#x27;09&quot;` for `7'09"`.
    expect(html).toContain('km 11 is partial — 0.67 km at 7&#x27;09&quot;/km, 4:48 elapsed')
  })

  it('shows the partial row’s honest per-km pace, not its raw elapsed time, in the pace column', () => {
    // 429 s/km, not 288 s. The 4:48 appears exactly once, in the caption that explains it.
    expect(html.match(/4:48/g)).toHaveLength(1)
  })

  it('shortens the partial row’s bar track to the fraction actually run (R-30)', () => {
    expect(html).toContain('width:67%')
  })

  it('highlights km 1 as the fastest — the partial row is never a candidate', () => {
    const rows = html.split('<tr')
    const partialRow = rows.find((row) => row.includes('11*'))!
    expect(partialRow).not.toContain('fastest')
    expect(rows.find((row) => row.includes('>1<'))).toContain('fastest')
  })
})

describe('flags read as statements about the run', () => {
  const flags = evaluateSessionFlags(
    metrics,
    canonicalSession.splits.find((s) => !s.partial) ?? null,
  )
  const html = renderToStaticMarkup(createElement(FlagList, { flags }))

  it('renders every fired flag with its measured value', () => {
    expect(flags.length).toBeGreaterThan(0)
    expect(html).toContain('Positive split')
    expect(html).toContain('+41 s/km')
    expect(html).toContain('90.6% of this run was in zones 4 and 5.')
  })

  it('carries severity in the accessible name, not only in the tint', () => {
    expect(html).toContain('Worth attention:')
  })

  it('renders nothing at all when nothing fired', () => {
    expect(renderToStaticMarkup(createElement(FlagList, { flags: [] }))).toBe('')
  })
})

describe('ProvenanceMark answers "can I trust this row?" without colour', () => {
  const reviewedAt = new Date('2026-08-20T13:00:00Z')

  it('names the source and the review date on a clean extraction', () => {
    const html = renderToStaticMarkup(
      createElement(ProvenanceMark, {
        source: 'screenshot',
        reviewedAt,
        correctedAt: null,
        correctedFieldCount: 0,
      }),
    )
    expect(html).toContain('Read from screenshot · reviewed 20 Aug')
    expect(html).not.toContain('corrected')
  })

  it('counts corrections, and pluralises them, without any warning language', () => {
    const html = renderToStaticMarkup(
      createElement(ProvenanceMark, {
        source: 'screenshot',
        reviewedAt,
        correctedAt: new Date('2026-08-22T02:00:00Z'),
        correctedFieldCount: 2,
      }),
    )
    expect(html).toContain('2 fields corrected')
    expect(html).toContain('reviewed 20 Aug · edited 22 Aug')
    expect(html).not.toMatch(/warn|error|wrong/i)
  })

  it('says so when a run was typed rather than read', () => {
    const html = renderToStaticMarkup(
      createElement(ProvenanceMark, {
        source: 'manual',
        reviewedAt,
        correctedAt: null,
        correctedFieldCount: 0,
      }),
    )
    expect(html).toContain('Entered by hand')
  })
})

describe('EmptyState ships no chart machinery', () => {
  it('renders a title and one sentence, and nothing else', () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: 'No runs yet',
        description: 'Screenshot a run in the Fitness app, then tap the + tab.',
      }),
    )
    expect(html).toContain('No runs yet')
    expect(html).toContain('border-dashed')
  })
})
