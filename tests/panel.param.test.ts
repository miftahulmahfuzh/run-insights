import { describe, expect, it } from 'vitest'

import {
  decodePanelDates,
  decodePanelSelection,
  encodePanelDates,
  encodePanelSelection,
  PANEL_DATES_PARAM,
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

describe('the date-list parameter — F27 round 2', () => {
  it('is a second, subordinate parameter and not a second surface', () => {
    /*
     * Round 1 read this module's "one parameter, not one per surface" note as forbidding a second
     * parameter outright, kept the expander in `useState`, and shipped a back-swipe that returned to
     * a collapsed list.
     *
     * That note is about two PARALLEL surfaces: `?badge=` beside `?record=` makes "both panels open"
     * a representable state. `dates` is subordinate — it names no surface, opens nothing on its own,
     * and cannot make a second dialog appear. The exclusivity the note protects is `panel`'s, and it
     * is untouched.
     */
    expect(PANEL_DATES_PARAM).toBe('dates')
    expect(PANEL_DATES_PARAM).not.toBe(PANEL_PARAM)
  })

  it('round trips an expanded list', () => {
    expect(encodePanelDates(true)).toBe('1')
    expect(decodePanelDates(encodePanelDates(true))).toBe(true)
  })

  it('drops the parameter entirely rather than writing a falsy value', () => {
    // `?dates=0` on every collapsed panel would be noise in the address bar and a second spelling of
    // "shut" for the decoder to know about.
    expect(encodePanelDates(false)).toBeNull()
    expect(decodePanelDates(null)).toBe(false)
  })

  it('treats `1` as the only truth, so a hand-typed URL fails closed', () => {
    // Anything else is shut, which is the safe direction: the panel opens the way a tap would leave
    // it rather than the way a typo asked for.
    for (const raw of ['', '0', 'true', 'yes', 'on', '2', '01', ' 1']) {
      expect(decodePanelDates(raw)).toBe(false)
    }
    expect(decodePanelDates(undefined)).toBe(false)
  })

  it('rides alongside a selection in one query string', () => {
    const params = new URLSearchParams()
    params.set(PANEL_PARAM, encodePanelSelection({ kind: 'badge', key: 'tourist' }))
    const dates = encodePanelDates(true)
    if (dates !== null) params.set(PANEL_DATES_PARAM, dates)
    expect(params.toString()).toBe('panel=badge.tourist&dates=1')

    const back = new URLSearchParams(params.toString())
    expect(decodePanelSelection(back.get(PANEL_PARAM))).toEqual({ kind: 'badge', key: 'tourist' })
    expect(decodePanelDates(back.get(PANEL_DATES_PARAM))).toBe(true)
  })

  it('does not disturb the selection codec — a dotted key is still one key', () => {
    /* This is why the flag is its own parameter rather than a suffix on the value. A key may contain
     * a dot and `decodePanelSelection` splits on the FIRST separator only, so `badge.a.b` is the key
     * `a.b` — and a `badge.a.b.dates` grammar could not tell that from the key `a.b` expanded. */
    expect(decodePanelSelection('badge.a.b')).toEqual({ kind: 'badge', key: 'a.b' })
    expect(decodePanelSelection('badge.tourist.dates')).toEqual({
      kind: 'badge',
      key: 'tourist.dates',
    })
  })
})
