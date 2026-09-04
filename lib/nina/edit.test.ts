import { describe, expect, it } from 'vitest'

import { MAX_BUBBLE_CHARS, MAX_RUNNER_MESSAGE_CHARS } from './schema'
import {
  EDIT_MAX_CHARS_HERS,
  EDIT_MAX_CHARS_MINE,
  MESSAGE_ACTION_EDGE_GUARD_PX,
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  decideMessageActionSwipe,
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
  type MessageActionSwipeGesture,
} from './edit'
import { REPLY_SWIPE_DOMINANCE, REPLY_SWIPE_MIN_DISTANCE } from './reply'

/* A real nanoid(12)-shaped id, because `canActOnMessage` checks the shape. */
const ID = 'aBcD1234efGH'
const OTHER = 'zZ9876yYxXwW'

function target(patch: Partial<EditTarget> = {}): EditTarget {
  return {
    id: ID,
    mine: true,
    body: 'lari gw kemaren gimana menurut lo?',
    hasImage: false,
    hasRun: false,
    confirmed: true,
    ...patch,
  }
}

/* ── the two caps, pinned to the send path ─────────────────────────────────────────────────── */

describe('the edit caps are the send path’s caps', () => {
  it('his cap equals MAX_RUNNER_MESSAGE_CHARS', () => {
    expect(EDIT_MAX_CHARS_MINE).toBe(MAX_RUNNER_MESSAGE_CHARS)
  })

  it('hers equals MAX_BUBBLE_CHARS, and is NOT his', () => {
    expect(EDIT_MAX_CHARS_HERS).toBe(MAX_BUBBLE_CHARS)
    expect(EDIT_MAX_CHARS_HERS).not.toBe(EDIT_MAX_CHARS_MINE)
  })

  it('editCapFor picks the author’s own ceiling', () => {
    expect(editCapFor(true)).toBe(EDIT_MAX_CHARS_MINE)
    expect(editCapFor(false)).toBe(EDIT_MAX_CHARS_HERS)
  })
})

/* ── canActOnMessage ───────────────────────────────────────────────────────────────────────── */

describe('canActOnMessage', () => {
  it('accepts a confirmed row with a database id', () => {
    expect(canActOnMessage(target())).toBe(true)
  })

  it('refuses an optimistic row: a local- id is not a database row', () => {
    expect(canActOnMessage(target({ id: 'local-6f0c1d2e-aaaa' }))).toBe(false)
  })

  it('refuses an unconfirmed row even when its id looks real', () => {
    expect(canActOnMessage(target({ confirmed: false }))).toBe(false)
  })

  it('refuses an empty id', () => {
    expect(canActOnMessage(target({ id: '' }))).toBe(false)
  })
})

/* ── planMessageEdit ───────────────────────────────────────────────────────────────────────── */

describe('planMessageEdit', () => {
  it('writes the trimmed new text', () => {
    expect(planMessageEdit(target(), '  besok gw lari pagi  ')).toEqual({
      kind: 'edit',
      body: 'besok gw lari pagi',
    })
  })

  it('reports unchanged when the text is what it already was', () => {
    const t = target({ body: 'hm' })
    expect(planMessageEdit(t, 'hm')).toEqual({ kind: 'unchanged' })
  })

  it('reports unchanged when only surrounding whitespace differs', () => {
    const t = target({ body: 'hm' })
    expect(planMessageEdit(t, '  hm  ')).toEqual({ kind: 'unchanged' })
  })

  it('refuses text over HIS cap and says how much to lose', () => {
    const over = 'a'.repeat(EDIT_MAX_CHARS_MINE + 5)
    expect(planMessageEdit(target({ mine: true }), over)).toEqual({
      kind: 'too-long',
      max: EDIT_MAX_CHARS_MINE,
      over: 5,
    })
  })

  it('refuses one of HER bubbles at his cap, because her cap is lower', () => {
    const long = 'a'.repeat(EDIT_MAX_CHARS_HERS + 1)
    expect(planMessageEdit(target({ mine: false }), long).kind).toBe('too-long')
    expect(planMessageEdit(target({ mine: true }), long).kind).toBe('edit')
  })

  it('accepts text of exactly the cap length', () => {
    const exact = 'a'.repeat(EDIT_MAX_CHARS_HERS)
    expect(planMessageEdit(target({ mine: false }), exact)).toEqual({ kind: 'edit', body: exact })
  })

  /* The send path's floor, evaluated against the row. */
  it('refuses clearing a text-only message, and names delete instead', () => {
    expect(planMessageEdit(target(), '')).toEqual({ kind: 'delete-instead' })
    expect(planMessageEdit(target(), '   \n  ')).toEqual({ kind: 'delete-instead' })
  })

  it('ALLOWS clearing the caption of a message that carries a photo', () => {
    expect(planMessageEdit(target({ hasImage: true }), '')).toEqual({ kind: 'edit', body: '' })
  })

  it('ALLOWS clearing the note on a message that carries a run', () => {
    expect(planMessageEdit(target({ hasRun: true }), '')).toEqual({ kind: 'edit', body: '' })
  })

  it('refuses an optimistic row outright', () => {
    expect(planMessageEdit(target({ id: 'local-x' }), 'anything')).toEqual({
      kind: 'not-editable',
    })
  })

  it('refuses a non-string, rather than coercing it', () => {
    expect(planMessageEdit(target(), null as unknown as string)).toEqual({ kind: 'not-editable' })
  })
})

/* ── describeMessageDeletion ───────────────────────────────────────────────────────────────── */

describe('describeMessageDeletion', () => {
  it('names whose message it is', () => {
    expect(describeMessageDeletion(target({ mine: true }), 0)).toContain('your message')
    expect(describeMessageDeletion(target({ mine: false }), 0)).toContain('Nina’s message')
  })

  it('always says she stops seeing it — that is what R8 is for', () => {
    expect(describeMessageDeletion(target(), 0)).toContain('She stops seeing it')
    expect(describeMessageDeletion(target(), 3)).toContain('She stops seeing it')
  })

  it('always says it cannot be undone', () => {
    expect(describeMessageDeletion(target(), 0)).toContain('cannot be undone')
  })

  it('discloses one photo in the singular', () => {
    const sentence = describeMessageDeletion(target({ hasImage: true }), 1)
    expect(sentence).toContain('its photo')
    expect(sentence).toContain('that photo goes with it')
  })

  it('discloses several photos with the count', () => {
    const sentence = describeMessageDeletion(target({ hasImage: true }), 3)
    expect(sentence).toContain('its 3 photos')
    expect(sentence).toContain('those photos go with it')
  })

  it('mentions no photos when there are none', () => {
    expect(describeMessageDeletion(target(), 0)).not.toContain('photo')
  })

  it('treats a nonsense count as none rather than rendering NaN', () => {
    expect(describeMessageDeletion(target(), Number.NaN)).not.toContain('NaN')
    expect(describeMessageDeletion(target(), -2)).not.toContain('photo')
  })
})

/* ── applyMessageEdit ─────────────────────────────────────────────────────────────────────── */

describe('applyMessageEdit', () => {
  const rows = [
    { id: ID, body: 'old', replyToId: null },
    { id: OTHER, body: 'other', replyToId: null },
  ]

  it('replaces only the named row’s text', () => {
    const next = applyMessageEdit(rows, ID, 'new')
    expect(next.map((r) => r.body)).toEqual(['new', 'other'])
  })

  it('returns the SAME array when the text already matches', () => {
    expect(applyMessageEdit(rows, ID, 'old')).toBe(rows)
  })

  it('returns the SAME array for an id that is not there', () => {
    expect(applyMessageEdit(rows, 'nope00000000', 'new')).toBe(rows)
  })

  it('leaves every other field alone', () => {
    const next = applyMessageEdit(rows, ID, 'new')
    expect(next[0]).toEqual({ id: ID, body: 'new', replyToId: null })
  })
})

/* ── applyMessageDeletion — the client half of ON DELETE SET NULL ──────────────────────────── */

describe('applyMessageDeletion', () => {
  const rows = [
    { id: ID, body: 'the embarrassing one', replyToId: null },
    { id: OTHER, body: 'a reply to it', replyToId: ID },
    { id: 'kK1111lL2222', body: 'unrelated', replyToId: OTHER },
  ]

  it('removes the deleted row', () => {
    const next = applyMessageDeletion(rows, ID)
    expect(next.map((r) => r.id)).toEqual([OTHER, 'kK1111lL2222'])
  })

  it('degrades a quote that pointed at it to plain text, exactly as ON DELETE SET NULL does', () => {
    const next = applyMessageDeletion(rows, ID)
    expect(next.find((r) => r.id === OTHER)?.replyToId).toBeNull()
  })

  it('leaves quotes that pointed elsewhere alone', () => {
    const next = applyMessageDeletion(rows, ID)
    expect(next.find((r) => r.id === 'kK1111lL2222')?.replyToId).toBe(OTHER)
  })

  it('returns the SAME array when the id is not in the list', () => {
    expect(applyMessageDeletion(rows, 'ghost0000000')).toBe(rows)
  })

  it('handles a message that several others quoted', () => {
    const many = [
      { id: ID, body: 'x', replyToId: null },
      { id: 'a1a1a1a1a1a1', body: 'y', replyToId: ID },
      { id: 'b2b2b2b2b2b2', body: 'z', replyToId: ID },
    ]
    const next = applyMessageDeletion(many, ID)
    expect(next).toHaveLength(2)
    expect(next.every((r) => r.replyToId === null)).toBe(true)
  })
})

/* ── decideMessageActionSwipe ──────────────────────────────────────────────────────────────── */

describe('decideMessageActionSwipe', () => {
  function gesture(patch: Partial<MessageActionSwipeGesture> = {}): MessageActionSwipeGesture {
    return {
      dx: -60,
      dy: 4,
      touches: 1,
      zoomScale: 1,
      startX: 200,
      viewportWidth: 414,
      ...patch,
    }
  }

  it('accepts a clean leftward drag', () => {
    expect(decideMessageActionSwipe(gesture())).toBe('actions')
  })

  it('refuses a RIGHTWARD drag — that is reply’s, and reply keeps it (invariant 9)', () => {
    expect(decideMessageActionSwipe(gesture({ dx: 80 }))).toBe('none')
    expect(decideMessageActionSwipe(gesture({ dx: 0 }))).toBe('none')
  })

  it('uses reply’s own minimum distance, so neither gesture is harder than the other', () => {
    expect(decideMessageActionSwipe(gesture({ dx: -(REPLY_SWIPE_MIN_DISTANCE - 1) }))).toBe('none')
    expect(decideMessageActionSwipe(gesture({ dx: -REPLY_SWIPE_MIN_DISTANCE }))).toBe('actions')
  })

  it('uses reply’s own dominance ratio', () => {
    const dy = 40
    expect(decideMessageActionSwipe(gesture({ dx: -(dy * REPLY_SWIPE_DOMINANCE - 1), dy }))).toBe(
      'none',
    )
    expect(decideMessageActionSwipe(gesture({ dx: -(dy * REPLY_SWIPE_DOMINANCE + 1), dy }))).toBe(
      'actions',
    )
  })

  it('refuses two fingers, counted as the maximum seen during the drag', () => {
    expect(decideMessageActionSwipe(gesture({ touches: 2 }))).toBe('none')
  })

  it('refuses a zoomed page, with reply’s epsilon for a settled pinch', () => {
    expect(decideMessageActionSwipe(gesture({ zoomScale: 1.4 }))).toBe('none')
    expect(decideMessageActionSwipe(gesture({ zoomScale: 1.000000000000002 }))).toBe('actions')
  })

  /* The one rule that exists only because this phase took the leftward direction. */
  it('refuses a drag that began in iOS Safari’s right-edge zone', () => {
    expect(decideMessageActionSwipe(gesture({ startX: 414 - 1 }))).toBe('none')
    expect(
      decideMessageActionSwipe(gesture({ startX: 414 - MESSAGE_ACTION_EDGE_GUARD_PX + 1 })),
    ).toBe('none')
  })

  it('accepts a drag that began just inside the guard', () => {
    expect(
      decideMessageActionSwipe(gesture({ startX: 414 - MESSAGE_ACTION_EDGE_GUARD_PX - 1 })),
    ).toBe('actions')
  })

  it('disables the edge guard rather than rejecting everything when the width is unknown', () => {
    expect(decideMessageActionSwipe(gesture({ viewportWidth: 0, startX: 9999 }))).toBe('actions')
  })

  it('refuses a gesture with non-finite numbers', () => {
    expect(decideMessageActionSwipe(gesture({ dx: Number.NaN }))).toBe('none')
    expect(decideMessageActionSwipe(gesture({ dy: Number.POSITIVE_INFINITY }))).toBe('none')
    expect(decideMessageActionSwipe(gesture({ startX: Number.NaN }))).toBe('none')
  })
})
