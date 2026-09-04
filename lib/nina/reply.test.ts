import { describe, expect, it } from 'vitest'

import {
  QUOTE_EMPTY_LABEL,
  QUOTE_PREVIEW_MAX_CHARS,
  QUOTE_SCROLL_TOP_MARGIN_PX,
  REPLY_SWIPE_MIN_DISTANCE,
  buildQuote,
  decideReplySwipe,
  planQuoteScroll,
  quoteContextBlock,
  quoteMediaOf,
  quotePreview,
  resolveQuote,
  type QuoteCandidate,
  type QuoteScrollGeometry,
  type ReplySwipeGesture,
} from './reply'

/* ── quotePreview ──────────────────────────────────────────────────────────────────────────── */

describe('quotePreview', () => {
  it('collapses every kind of whitespace into single spaces', () => {
    expect(quotePreview('pagi   mif\n\nlari\tlagi?')).toBe('pagi mif lari lagi?')
  })

  it('trims the ends', () => {
    expect(quotePreview('  hm  ')).toBe('hm')
  })

  it('leaves a message shorter than the cap exactly alone', () => {
    const text = 'lari gw kemaren gimana menurut lo?'
    expect(quotePreview(text)).toBe(text)
  })

  it('keeps a message of exactly the cap length whole, with no ellipsis', () => {
    const text = 'a'.repeat(QUOTE_PREVIEW_MAX_CHARS)
    expect(quotePreview(text)).toBe(text)
    expect(quotePreview(text)).not.toContain('…')
  })

  it('cuts at a word boundary and marks the cut', () => {
    const preview = quotePreview('satu dua tiga empat lima enam tujuh delapan', 20)
    expect(preview).toBe('satu dua tiga empat…')
  })

  it('cuts mid-word rather than lose most of the budget to find a space', () => {
    // The only space is at index 2, well inside the first 60% of a 20-char budget, so retreating
    // to it would spend 90% of the preview on the word "ok".
    const preview = quotePreview(`ok ${'a'.repeat(32)}`, 20)
    expect(preview).toBe(`ok ${'a'.repeat(17)}…`)
  })

  it('handles a single unbroken token longer than the cap', () => {
    const preview = quotePreview('https://runins.site/r/abcdefghijklmnopqrstuvwxyz', 20)
    expect(preview).toHaveLength(21)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('returns empty for empty, whitespace-only and non-positive budgets', () => {
    expect(quotePreview('')).toBe('')
    expect(quotePreview('   \n  ')).toBe('')
    expect(quotePreview('anything', 0)).toBe('')
    expect(quotePreview('anything', Number.NaN)).toBe('')
  })
})

/* ── quoteMediaOf ──────────────────────────────────────────────────────────────────────────── */

describe('quoteMediaOf', () => {
  it('is none when the message carries neither — an ordinary text bubble', () => {
    expect(quoteMediaOf({ hasImage: false, hasRun: false })).toBe('none')
  })

  it('names a photo, and a photo beats a run', () => {
    expect(quoteMediaOf({ hasImage: true, hasRun: false })).toBe('photo')
    expect(quoteMediaOf({ hasImage: true, hasRun: true })).toBe('photo')
  })

  it('names a run when that is all there is — the branch phase 8 turns on', () => {
    expect(quoteMediaOf({ hasImage: false, hasRun: true })).toBe('run')
  })
})

/* ── buildQuote / resolveQuote ─────────────────────────────────────────────────────────────── */

const PLAIN = { hasImage: false, hasRun: false } as const

const HIS: QuoteCandidate = { id: 'm1', mine: true, text: 'gw lari 10k pagi ini', ...PLAIN }
const HERS: QuoteCandidate = { id: 'm2', mine: false, text: 'lo telat lagi tah', ...PLAIN }
const PHOTO: QuoteCandidate = { id: 'm3', mine: true, text: '', hasImage: true, hasRun: false }
const RUN: QuoteCandidate = { id: 'm4', mine: true, text: '', hasImage: false, hasRun: true }
const BLANK: QuoteCandidate = { id: 'm5', mine: false, text: '   ', ...PLAIN }

describe('buildQuote', () => {
  it('names the runner as "you" and Nina as "nina"', () => {
    expect(buildQuote(HIS).author).toBe('you')
    expect(buildQuote(HERS).author).toBe('nina')
  })

  it('carries the target id, which is also the DOM anchor', () => {
    expect(buildQuote(HIS).targetId).toBe('m1')
  })

  it('falls back to the media word when the message has no text of its own', () => {
    expect(buildQuote(PHOTO).preview).toBe('Photo')
    expect(buildQuote(RUN).preview).toBe('Run')
  })

  it('never renders an empty preview', () => {
    expect(buildQuote(BLANK).preview).toBe(QUOTE_EMPTY_LABEL)
  })

  it('prefers the text over the media word when there is both', () => {
    expect(buildQuote({ ...PHOTO, text: 'liat ini' }).preview).toBe('liat ini')
    expect(buildQuote({ ...PHOTO, text: 'liat ini' }).media).toBe('photo')
  })

  it('derives the media word from the two booleans, not from a passed-in enum', () => {
    // RULING E2b: `QuoteCandidate` carries `hasImage` / `hasRun` and `buildQuote` collapses them,
    // so `MessageList` and `ChatScreen` cannot disagree about what a candidate's media is.
    expect(buildQuote(RUN).media).toBe('run')
    expect(buildQuote(BLANK).media).toBe('none')
  })
})

describe('resolveQuote', () => {
  const candidates = [HIS, HERS, PHOTO]

  it('finds either party’s message', () => {
    expect(resolveQuote('m1', candidates)?.author).toBe('you')
    expect(resolveQuote('m2', candidates)?.author).toBe('nina')
  })

  it('degrades to null — plain text — when the target is not on the screen', () => {
    // The three real cases: ON DELETE SET NULL, older than the rendered window, unconfirmed send.
    expect(resolveQuote(null, candidates)).toBeNull()
    expect(resolveQuote(undefined, candidates)).toBeNull()
    expect(resolveQuote('', candidates)).toBeNull()
    expect(resolveQuote('m404', candidates)).toBeNull()
    expect(resolveQuote('m1', [])).toBeNull()
  })
})

/* ── quoteContextBlock ─────────────────────────────────────────────────────────────────────── */

describe('quoteContextBlock', () => {
  it('tells her the quoted message is his, and quotes it verbatim', () => {
    const block = quoteContextBlock({
      id: 'm1',
      mine: true,
      text: 'gw lari 10k pagi ini',
      sentAtLabel: 'Tue 2 Sep 07:14',
    })
    expect(block).toContain('one of HIS earlier messages')
    expect(block).toContain('sent Tue 2 Sep 07:14')
    expect(block).toContain('"gw lari 10k pagi ini"')
    expect(block).toContain('AS A REPLY TO THAT MESSAGE')
  })

  it('tells her when the quoted message is one of her own', () => {
    const block = quoteContextBlock({ id: 'm2', mine: false, text: 'lo telat', sentAtLabel: null })
    expect(block).toContain('one of YOUR earlier messages')
    expect(block).not.toContain('sent ')
  })

  it('gives the model the whole bubble, not the stub’s two lines', () => {
    const long = 'a'.repeat(400)
    expect(quoteContextBlock({ id: 'm', mine: true, text: long, sentAtLabel: null })).toContain(
      long,
    )
  })
})

/* ── decideReplySwipe ──────────────────────────────────────────────────────────────────────── */

const drag = (over: Partial<ReplySwipeGesture> = {}): ReplySwipeGesture => ({
  dx: 60,
  dy: 4,
  touches: 1,
  zoomScale: 1,
  ...over,
})

describe('decideReplySwipe', () => {
  it('arms a reply on a clean rightward drag', () => {
    expect(decideReplySwipe(drag())).toBe('reply')
  })

  it('refuses a leftward drag, however long — that is iOS navigation territory', () => {
    expect(decideReplySwipe(drag({ dx: -200 }))).toBe('none')
  })

  it('refuses a tap and anything under the 44px floor', () => {
    expect(decideReplySwipe(drag({ dx: 0 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: REPLY_SWIPE_MIN_DISTANCE - 1 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: REPLY_SWIPE_MIN_DISTANCE }))).toBe('reply')
  })

  it('yields to the chat log: a thumb-flick that arcs sideways is still a scroll', () => {
    expect(decideReplySwipe(drag({ dx: 50, dy: -200 }))).toBe('none')
    expect(decideReplySwipe(drag({ dx: 50, dy: 20 }))).toBe('reply')
    // 1.6 dominance: 48/30 = 1.6 passes, 48/31 does not.
    expect(decideReplySwipe(drag({ dx: 48, dy: 30 }))).toBe('reply')
    expect(decideReplySwipe(drag({ dx: 48, dy: 31 }))).toBe('none')
  })

  it('loses to a pinch, counted at its maximum', () => {
    expect(decideReplySwipe(drag({ touches: 2 }))).toBe('none')
  })

  it('loses on a zoomed page, and tolerates float noise at scale 1', () => {
    expect(decideReplySwipe(drag({ zoomScale: 1.8 }))).toBe('none')
    expect(decideReplySwipe(drag({ zoomScale: 1.0000000000000002 }))).toBe('reply')
  })

  it('refuses non-finite geometry rather than guessing', () => {
    expect(decideReplySwipe(drag({ dx: Number.NaN }))).toBe('none')
    expect(decideReplySwipe(drag({ dy: Number.POSITIVE_INFINITY }))).toBe('none')
  })
})

/* ── planQuoteScroll ───────────────────────────────────────────────────────────────────────── */

const geometry = (over: Partial<QuoteScrollGeometry> = {}): QuoteScrollGeometry => ({
  targetTop: 4_000,
  targetHeight: 80,
  scrollTop: 9_000,
  scrollHeight: 12_000,
  clientHeight: 800,
  obstructedTopPx: 0,
  obstructedBottomPx: 150,
  reducedMotion: false,
  ...over,
})

describe('planQuoteScroll', () => {
  it('centres the target in the band the chrome leaves readable', () => {
    // band = 800 - 0 - 150 = 650; slack = (650 - 80) / 2 = 285; top = 4000 - 285 = 3715.
    expect(planQuoteScroll(geometry())).toEqual({ kind: 'scroll', top: 3_715, behavior: 'smooth' })
  })

  it('accounts for the keyboard by shrinking the band, not by ignoring it', () => {
    // band = 800 - 0 - 480 = 320; slack = 120; top = 3880 — lower than the unobstructed answer,
    // which is the point: the readable strip has moved up the screen.
    expect(planQuoteScroll(geometry({ obstructedBottomPx: 480 })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ obstructedBottomPx: 480 }))).toEqual({
      kind: 'scroll',
      top: 3_880,
      behavior: 'smooth',
    })
  })

  it('aligns a target taller than the band to the top of it', () => {
    expect(planQuoteScroll(geometry({ targetHeight: 900 }))).toEqual({
      kind: 'scroll',
      top: 4_000 - QUOTE_SCROLL_TOP_MARGIN_PX,
      behavior: 'smooth',
    })
  })

  it('respects a fixed header when one exists', () => {
    // band = 800 - 60 - 150 = 590; slack = 255; top = 4000 - 60 - 255 = 3685.
    expect(planQuoteScroll(geometry({ obstructedTopPx: 60 })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ obstructedTopPx: 60 }))).toEqual({
      kind: 'scroll',
      top: 3_685,
      behavior: 'smooth',
    })
  })

  it('clamps at the top of the conversation', () => {
    expect(planQuoteScroll(geometry({ targetTop: 40, scrollTop: 5_000 }))).toEqual({
      kind: 'scroll',
      top: 0,
      behavior: 'smooth',
    })
  })

  it('clamps at the bottom, never asking for a position that does not exist', () => {
    expect(planQuoteScroll(geometry({ targetTop: 11_900, scrollTop: 0 }))).toEqual({
      kind: 'scroll',
      top: 11_200,
      behavior: 'smooth',
    })
  })

  it('does nothing when the target is already where it would be put', () => {
    expect(planQuoteScroll(geometry({ scrollTop: 3_715 }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollTop: 3_710 }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollTop: 3_700 })).kind).toBe('scroll')
  })

  it('jumps instead of gliding when the reader asked for less motion', () => {
    expect(planQuoteScroll(geometry({ reducedMotion: true })).kind).toBe('scroll')
    expect(planQuoteScroll(geometry({ reducedMotion: true }))).toEqual({
      kind: 'scroll',
      top: 3_715,
      behavior: 'instant',
    })
  })

  it('degrades to a top-aligned jump when the band collapses', () => {
    expect(planQuoteScroll(geometry({ clientHeight: 120, obstructedBottomPx: 400 }))).toEqual({
      kind: 'scroll',
      top: 4_000 - QUOTE_SCROLL_TOP_MARGIN_PX,
      behavior: 'smooth',
    })
  })

  it('refuses non-finite geometry rather than scrolling to NaN', () => {
    expect(planQuoteScroll(geometry({ targetTop: Number.NaN }))).toEqual({ kind: 'none' })
    expect(planQuoteScroll(geometry({ scrollHeight: Number.POSITIVE_INFINITY }))).toEqual({
      kind: 'none',
    })
  })
})
