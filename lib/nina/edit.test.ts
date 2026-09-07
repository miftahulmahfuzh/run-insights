import { describe, expect, it } from 'vitest'

import { MAX_BUBBLE_CHARS, MAX_RUNNER_MESSAGE_CHARS } from './schema'
import {
  BUBBLE_BODY_SELECTOR,
  BUBBLE_INTERACTIVE_SELECTOR,
  EDIT_MAX_CHARS_HERS,
  EDIT_MAX_CHARS_MINE,
  MESSAGE_ACTION_EDGE_GUARD_PX,
  MESSAGE_ACTION_TAP_SLOP_PX,
  applyMessageDeletion,
  applyMessageEdit,
  canActOnMessage,
  canResendMessage,
  decideMessageActionSwipe,
  decideMessageActionTap,
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
  type MessageActionSwipeGesture,
  type MessageActionTapGesture,
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

  /* The signature widened to `ActionableMessage` so `MessageBubble` can ask the gate without
   * assembling a whole `EditTarget`. Both shapes are the same call. */
  it('accepts the narrow shape a bubble can build, as well as a whole EditTarget', () => {
    expect(canActOnMessage({ id: ID, confirmed: true })).toBe(true)
    expect(canActOnMessage({ id: ID, confirmed: false })).toBe(false)
    expect(canActOnMessage({ id: 'local-6f0c1d2e-aaaa', confirmed: true })).toBe(false)
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

/* ── decideMessageActionTap — R4's opener ──────────────────────────────────────────────────── */

describe('decideMessageActionTap', () => {
  function tap(patch: Partial<MessageActionTapGesture> = {}): MessageActionTapGesture {
    return {
      dx: 1,
      dy: -2,
      touches: 1,
      zoomScale: 1,
      startedOnBody: true,
      startedOnInteractive: false,
      textSelected: false,
      ...patch,
    }
  }

  it('opens the sheet for a still press on a confirmed bubble', () => {
    expect(decideMessageActionTap(target(), tap())).toBe('actions')
  })

  it('opens the sheet on HER bubble too — R4 is both sides', () => {
    expect(decideMessageActionTap(target({ mine: false }), tap())).toBe('actions')
  })

  /* Rule 1. The `<li>` is a full-width row; the paper beside a bubble is not the bubble. */
  it('refuses a press that began in the empty paper beside the bubble', () => {
    expect(decideMessageActionTap(target(), tap({ startedOnBody: false }))).toBe('none')
  })

  /* Rule 2. The photo grid, the quote stub, the run card and the two sr-only buttons. */
  it('refuses a press that began on a control inside the bubble', () => {
    expect(decideMessageActionTap(target(), tap({ startedOnInteractive: true }))).toBe('none')
  })

  /* Rule 3. Copying what she said stays a real capability — MessageBubble's header. */
  it('refuses while text is selected, at either end of the interaction', () => {
    expect(decideMessageActionTap(target(), tap({ textSelected: true }))).toBe('none')
  })

  /* Rule 4, and it is SILENT here where the swipe's refusal is a notice. */
  it('refuses an optimistic row: a local- id is not a database row', () => {
    expect(decideMessageActionTap(target({ id: 'local-6f0c1d2e-aaaa' }), tap())).toBe('none')
  })

  it('refuses a row whose send has not been confirmed', () => {
    expect(decideMessageActionTap(target({ confirmed: false }), tap())).toBe('none')
  })

  it('takes the narrow ActionableMessage shape the bubble builds', () => {
    expect(decideMessageActionTap({ id: 'aBcD1234efGH', confirmed: true }, tap())).toBe('actions')
  })

  /* Rule 5. */
  it('refuses two fingers, counted as the maximum seen during the interaction', () => {
    expect(decideMessageActionTap(target(), tap({ touches: 2 }))).toBe('none')
  })

  /* Rule 6, with the swipes' own epsilon for a settled pinch. */
  it('refuses a zoomed page but accepts a scale that merely settled above 1', () => {
    expect(decideMessageActionTap(target(), tap({ zoomScale: 1.4 }))).toBe('none')
    expect(decideMessageActionTap(target(), tap({ zoomScale: 1.000000000000002 }))).toBe('actions')
  })

  /* Rule 7, both axes, at the boundary. */
  it('accepts movement of exactly the slop and refuses one pixel more, in x', () => {
    expect(decideMessageActionTap(target(), tap({ dx: MESSAGE_ACTION_TAP_SLOP_PX }))).toBe(
      'actions',
    )
    expect(decideMessageActionTap(target(), tap({ dx: MESSAGE_ACTION_TAP_SLOP_PX + 1 }))).toBe(
      'none',
    )
  })

  it('accepts movement of exactly the slop and refuses one pixel more, in y', () => {
    expect(decideMessageActionTap(target(), tap({ dy: -MESSAGE_ACTION_TAP_SLOP_PX }))).toBe(
      'actions',
    )
    expect(decideMessageActionTap(target(), tap({ dy: MESSAGE_ACTION_TAP_SLOP_PX + 1 }))).toBe(
      'none',
    )
  })

  it('reads dx as a magnitude, because a tap has no direction', () => {
    expect(decideMessageActionTap(target(), tap({ dx: 6 }))).toBe('actions')
    expect(decideMessageActionTap(target(), tap({ dx: -6 }))).toBe('actions')
  })

  it('refuses a gesture with non-finite numbers', () => {
    expect(decideMessageActionTap(target(), tap({ dx: Number.NaN }))).toBe('none')
    expect(decideMessageActionTap(target(), tap({ dy: Number.POSITIVE_INFINITY }))).toBe('none')
  })

  /* ── the three windows are disjoint, and this is the assertion that keeps them so ────────── */

  it('leaves a gap between the tap window and either swipe window', () => {
    expect(MESSAGE_ACTION_TAP_SLOP_PX).toBeLessThan(REPLY_SWIPE_MIN_DISTANCE)
  })

  it('refuses every drag the actions swipe accepts, and vice versa (invariant 6)', () => {
    const dx = -REPLY_SWIPE_MIN_DISTANCE
    expect(
      decideMessageActionSwipe({
        dx,
        dy: 0,
        touches: 1,
        zoomScale: 1,
        startX: 200,
        viewportWidth: 414,
      }),
    ).toBe('actions')
    expect(decideMessageActionTap(target(), tap({ dx, dy: 0 }))).toBe('none')

    const still = 2
    expect(
      decideMessageActionSwipe({
        dx: still,
        dy: 0,
        touches: 1,
        zoomScale: 1,
        startX: 200,
        viewportWidth: 414,
      }),
    ).toBe('none')
    expect(decideMessageActionTap(target(), tap({ dx: still, dy: 0 }))).toBe('actions')
  })

  it('refuses reply’s own rightward swipe, so the reply gesture keeps it', () => {
    expect(decideMessageActionTap(target(), tap({ dx: REPLY_SWIPE_MIN_DISTANCE, dy: 0 }))).toBe(
      'none',
    )
  })

  /* ── the two selectors are contracts with `MessageBubble`, so their shape is asserted ────── */

  it('names the bubble body by the data attribute MessageBubble writes', () => {
    expect(BUBBLE_BODY_SELECTOR).toBe('[data-nina-bubble-body]')
  })

  it('covers every control this bubble actually renders', () => {
    /* QuoteStub and ChatImages and the two sr-only buttons are `button`; RunAttachmentCard is a
     * next/link, which is an `a`. A control added to the `above` slot later is excluded by one of
     * the generic clauses rather than by a later bug report. */
    for (const selector of ['a', 'button', '[role="button"]', '[role="link"]']) {
      expect(BUBBLE_INTERACTIVE_SELECTOR.split(',')).toContain(selector)
    }
  })
})

/* ── canResendMessage ─────────────────────────────────────────────────────────────────────── */

describe('canResendMessage', () => {
  it('accepts a confirmed message of his', () => {
    expect(canResendMessage(target())).toBe(true)
  })

  /* R5's own words: "just for user's bubble". */
  it('refuses one of Nina’s, however confirmed it is', () => {
    expect(canResendMessage(target({ mine: false }))).toBe(false)
  })

  it('inherits both of canActOnMessage’s exclusions', () => {
    expect(canResendMessage(target({ id: 'local-6f0c1d2e-aaaa' }))).toBe(false)
    expect(canResendMessage(target({ confirmed: false }))).toBe(false)
  })

  /*
   * The DECISION, pinned so nobody reintroduces it: there is no "was this answered" clause. A
   * client-side answered/unanswered test would be a second authority on turn state beside
   * `nina_turns`; `resendNinaMessage` refuses with 'turn-live' instead.
   */
  it('offers a resend on every confirmed bubble of his, answered or not', () => {
    expect(canResendMessage(target({ body: 'ini udah dijawab' }))).toBe(true)
    expect(canResendMessage(target({ body: '', hasImage: true }))).toBe(true)
  })

  it('never diverges from canActOnMessage on one of his', () => {
    for (const patch of [{}, { confirmed: false }, { id: '' }, { hasRun: true }]) {
      const his = target({ ...patch, mine: true })
      expect(canResendMessage(his)).toBe(canActOnMessage(his))
    }
  })
})
