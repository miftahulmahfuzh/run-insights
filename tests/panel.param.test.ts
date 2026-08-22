import { describe, expect, it } from 'vitest'

import {
  decodePanelSelection,
  encodePanelSelection,
  PANEL_PARAM,
  panelKeyFor,
} from '@/lib/panel/param'

/**
 * F24's URL codec — the whole of the open-panel state, as a pure function.
 *
 * This suite is where the history behaviour is actually testable. `vitest.config.ts` runs in the
 * `node` environment with no jsdom, so a tap, a `popstate` and a back gesture cannot be simulated
 * here at all; what CAN be pinned down is that every string the URL might hold maps to exactly one
 * selection or to none. The gesture itself is verified by driving a real browser — see
 * `docs/plans/F24-detail-panel-history.md` §5.
 */
describe('the panel parameter', () => {
  it('is one parameter for the whole page', () => {
    // Not `?badge=` plus a later `?record=`. See the module's own note: two parameters make
    // "both panels open" a representable state.
    expect(PANEL_PARAM).toBe('panel')
  })

  it('round trips a badge selection', () => {
    const encoded = encodePanelSelection({ kind: 'badge', key: 'early_bird' })
    expect(encoded).toBe('badge.early_bird')
    expect(decodePanelSelection(encoded)).toEqual({ kind: 'badge', key: 'early_bird' })
  })

  it('survives the trip through URLSearchParams without escaping the separator', () => {
    // The reason the separator is `.` and not `:`. A colon comes back as %3A and the address bar
    // stops being readable.
    const params = new URLSearchParams()
    params.set(PANEL_PARAM, encodePanelSelection({ kind: 'badge', key: 'two_a_days' }))
    expect(params.toString()).toBe('panel=badge.two_a_days')

    const roundTripped = new URLSearchParams(params.toString()).get(PANEL_PARAM)
    expect(decodePanelSelection(roundTripped)).toEqual({ kind: 'badge', key: 'two_a_days' })
  })

  it('reads a record selection, which is #25 and already representable', () => {
    expect(decodePanelSelection('record.longest_distance')).toEqual({
      kind: 'record',
      key: 'longest_distance',
    })
  })

  it('has no panel open for an absent, empty or half-written parameter', () => {
    expect(decodePanelSelection(null)).toBeNull()
    expect(decodePanelSelection(undefined)).toBeNull()
    expect(decodePanelSelection('')).toBeNull()
    // A kind with no key, and a key with no kind: neither names a panel.
    expect(decodePanelSelection('badge.')).toBeNull()
    expect(decodePanelSelection('badge')).toBeNull()
    expect(decodePanelSelection('.early_bird')).toBeNull()
  })

  it('rejects a kind it does not know, rather than opening something', () => {
    expect(decodePanelSelection('run.abc123')).toBeNull()
    expect(decodePanelSelection('Badge.early_bird')).toBeNull()
  })

  it('splits on the first separator only, so a dotted key stays one key', () => {
    expect(decodePanelSelection('badge.a.b')).toEqual({ kind: 'badge', key: 'a.b' })
  })

  it('accepts a key the catalog has never heard of, deliberately', () => {
    /*
     * A URL is user-typed input, so an unknown key has to be survivable whatever the types say.
     * `BadgeShelf` resolves the key against the shelf it was handed and renders no panel when it
     * misses — the same reasoning that made the shelf hold a key rather than an entry.
     */
    expect(decodePanelSelection('badge.nonsense')).toEqual({ kind: 'badge', key: 'nonsense' })
  })
})

describe('reading a selection from one surface', () => {
  const badge = { kind: 'badge', key: 'tourist' } as const

  it('answers only for its own kind', () => {
    expect(panelKeyFor(badge, 'badge')).toBe('tourist')
    expect(panelKeyFor(badge, 'record')).toBeNull()
    expect(panelKeyFor(null, 'badge')).toBeNull()
  })
})
