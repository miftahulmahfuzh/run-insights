import { describe, expect, it } from 'vitest'

import {
  CHAT_SCROLL_PARAM,
  clampScrollTop,
  decodeChatScrollMark,
  encodeChatScrollMark,
  MAX_CHAT_SCROLL_OFFSET_PX,
  pickScrollAnchor,
  resolveRestoreTop,
  type ScrollAnchorRow,
} from './scroll'

/**
 * R14's arithmetic. The DOM half — reading `getBoundingClientRect`, calling `window.scrollTo`,
 * writing the history entry — is deliberately not here: this suite runs under
 * `environment: 'node'` (invariant 6), so there is no `window` to fake and faking one would prove
 * nothing about Safari. What IS proven is the rule that decides the number, which is the part that
 * can be wrong in a way nobody notices until the phone.
 */

const ROWS: ScrollAnchorRow[] = [
  { messageId: 'm1', top: 0 },
  { messageId: 'm2', top: 200 },
  { messageId: 'm3', top: 480 },
  { messageId: 'm4', top: 900 },
]

const GEOMETRY = { scrollHeight: 2000, clientHeight: 800 }

describe('the param', () => {
  it('is the one the URL and the reader agree on', () => {
    expect(CHAT_SCROLL_PARAM).toBe('at')
  })
})

describe('encodeChatScrollMark', () => {
  it('joins the id and the offset with a tilde', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: 42 })).toBe('abc123~42')
  })

  it('rounds a fractional offset — a subpixel in a URL is noise', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: 41.6 })).toBe('abc123~42')
  })

  it('keeps a negative offset, which is a real position', () => {
    expect(encodeChatScrollMark({ messageId: 'abc123', offset: -137 })).toBe('abc123~-137')
  })

  it('round-trips through the decoder', () => {
    const mark = { messageId: 'Xy_9-Z', offset: -12 }
    expect(decodeChatScrollMark(encodeChatScrollMark(mark))).toEqual(mark)
  })
})

describe('decodeChatScrollMark', () => {
  it('reads a well-formed mark', () => {
    expect(decodeChatScrollMark('abc123~250')).toEqual({ messageId: 'abc123', offset: 250 })
  })

  it('reads a negative offset', () => {
    expect(decodeChatScrollMark('abc123~-250')).toEqual({ messageId: 'abc123', offset: -250 })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['no separator', 'abc123'],
    ['nothing before the separator', '~250'],
    ['nothing after the separator', 'abc123~'],
    ['a non-numeric offset', 'abc123~soon'],
    ['a fractional offset', 'abc123~250.5'],
    ['an id with a slash', 'a/b~250'],
    ['an id with a space', 'a b~250'],
    ['a percent-encoded id', 'a%2Fb~250'],
  ])('treats %s as no mark', (_label, raw) => {
    expect(decodeChatScrollMark(raw)).toBeNull()
  })

  it('refuses an offset past the sanity bound rather than clamping it', () => {
    expect(decodeChatScrollMark(`abc123~${MAX_CHAT_SCROLL_OFFSET_PX + 1}`)).toBeNull()
    expect(decodeChatScrollMark(`abc123~-${MAX_CHAT_SCROLL_OFFSET_PX + 1}`)).toBeNull()
  })

  it('accepts the bound itself', () => {
    expect(decodeChatScrollMark(`abc123~${MAX_CHAT_SCROLL_OFFSET_PX}`)).toEqual({
      messageId: 'abc123',
      offset: MAX_CHAT_SCROLL_OFFSET_PX,
    })
  })

  it('splits on the LAST tilde, so an id may never lose its tail silently', () => {
    // 'a~b' is not a legal id, so this is a rejection rather than a mangled parse.
    expect(decodeChatScrollMark('a~b~250')).toBeNull()
  })
})

describe('pickScrollAnchor', () => {
  it('picks the topmost message at or below the viewport top', () => {
    expect(pickScrollAnchor(ROWS, 200)).toEqual({ messageId: 'm2', offset: 0 })
  })

  it('records how far below the top edge that message sat', () => {
    expect(pickScrollAnchor(ROWS, 150)).toEqual({ messageId: 'm2', offset: 50 })
  })

  it('at the very top of the document, picks the first message', () => {
    expect(pickScrollAnchor(ROWS, 0)).toEqual({ messageId: 'm1', offset: 0 })
  })

  it('below every message top, picks the last one with a negative offset', () => {
    expect(pickScrollAnchor(ROWS, 1000)).toEqual({ messageId: 'm4', offset: -100 })
  })

  it('is null with nothing rendered', () => {
    expect(pickScrollAnchor([], 0)).toBeNull()
  })
})

describe('clampScrollTop', () => {
  it('leaves a position inside the document alone', () => {
    expect(clampScrollTop(400, GEOMETRY)).toBe(400)
  })

  it('clamps past the bottom to the last scrollable pixel', () => {
    expect(clampScrollTop(5000, GEOMETRY)).toBe(1200)
  })

  it('clamps a negative position to the top', () => {
    expect(clampScrollTop(-40, GEOMETRY)).toBe(0)
  })

  it('is 0 when the document does not scroll at all', () => {
    expect(clampScrollTop(300, { scrollHeight: 600, clientHeight: 800 })).toBe(0)
  })

  it('is 0 for a non-finite input rather than propagating NaN into scrollTo', () => {
    expect(clampScrollTop(Number.NaN, GEOMETRY)).toBe(0)
  })
})

describe('resolveRestoreTop', () => {
  it('re-derives the pixel from where the anchor is NOW', () => {
    // Left with m3 50px below the top edge; m3 has since moved down 300px.
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm3', offset: 50 },
        anchorTop: 780,
        geometry: GEOMETRY,
      }),
    ).toBe(730)
  })

  it('reproduces the exact position when nothing moved', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm3', offset: 50 },
        anchorTop: 480,
        geometry: GEOMETRY,
      }),
    ).toBe(430)
  })

  it('honours a negative offset', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm4', offset: -100 },
        anchorTop: 900,
        geometry: GEOMETRY,
      }),
    ).toBe(1000)
  })

  it('clamps into a document that shrank', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'm4', offset: 0 },
        anchorTop: 1900,
        geometry: GEOMETRY,
      }),
    ).toBe(1200)
  })

  it('is null when the anchor message is gone — the caller then does the ordinary thing', () => {
    expect(
      resolveRestoreTop({
        mark: { messageId: 'gone', offset: 50 },
        anchorTop: null,
        geometry: GEOMETRY,
      }),
    ).toBeNull()
  })

  it('never returns the bottom of the document just because the mark was odd', () => {
    // The regression this whole phase exists to prevent: a restore that silently means "newest".
    const top = resolveRestoreTop({
      mark: { messageId: 'm1', offset: 0 },
      anchorTop: 0,
      geometry: GEOMETRY,
    })
    expect(top).toBe(0)
    expect(top).not.toBe(GEOMETRY.scrollHeight - GEOMETRY.clientHeight)
  })
})
