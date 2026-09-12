'use client'

import { useEffect, useRef, useState } from 'react'

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

/**
 * Whether the return key in question is a phone's: `(pointer: coarse)`, resolved once on first
 * use. Never at module scope — a `'use client'` component still renders on the server for the
 * initial HTML, and `matchMedia` does not exist there.
 *
 * The pointer type and not a user-agent string, because it is the honest question: the rule below
 * is about WHICH RETURN KEY THE USER HAS, not about which browser shipped the device. A laptop
 * with a touchscreen reports a fine primary pointer and keeps Enter-to-send, which is right.
 */
let phoneReturn: boolean | null = null
export function isPhoneReturn(): boolean {
  if (phoneReturn === null) {
    phoneReturn = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  }
  return phoneReturn
}

/**
 * The text half of the composer: the draft string, the auto-growing textarea it is typed into,
 * and the two moments the box takes focus — arming a reply takes it, sending releases it.
 *
 * The state lives here and not in `ChatScreen` for the reason `Composer`'s header records: a
 * keystroke must re-render the composer and nothing above it. The Enter split itself (phone:
 * newline, desktop: send) is the component's, because it is render wiring deciding which key
 * sends — so `isPhoneReturn` above is exported for `Composer`'s `onKeyDown` rather than folded
 * in here.
 */
export function useComposerDraft({
  replyTargetId,
}: {
  /**
   * The quote currently armed, by its target id — the derivation (`reply?.targetId ?? null`) is
   * the caller's; the focus is this hook's. Keyed on the id and not on the object, so
   * re-resolving the same quote during an unrelated re-render does not steal focus back from
   * wherever it has gone.
   */
  replyTargetId: string | null
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)

  /*
   * Arming a reply focuses the box, which is the whole point of the gesture: swipe, type, send.
   */
  useEffect(() => {
    if (replyTargetId !== null) ref.current?.focus()
  }, [replyTargetId])

  function resize() {
    const el = ref.current
    if (el == null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  /** The controlled input's `onChange`: set the text, then re-fit the box to it. */
  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value)
    resize()
  }

  /**
   * The send's text half: empty the draft and collapse the box back to one row. Then RELEASE the
   * composer, on the repo owner's explicit ask: "can you automatically hide the keyboard after
   * user press send? right now i have to manually click Done everytime to hide this stupid
   * keyboard". The line here used to keep focus — "he is going to type again — that is what a
   * conversation is" — and keeping it had a second cost the owner had already reported as a bug:
   * `ChatChrome` hides the floating `<` and `^` while focus is anywhere inside this bar, so a
   * send that left focus behind (Enter leaves it in the textarea; a click leaves it on the Send
   * button) also left the conversation without its controls until something else was tapped — and
   * on desktop Chrome, reading her reply taps nothing. Blurring whatever INSIDE this bar holds
   * focus folds the keyboard and puts the controls back in the same frame. The reply-arming
   * effect above still focuses the box, because arming a reply is the start of typing, which is a
   * different moment than the end of sending one.
   */
  function clear() {
    setValue('')
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      const host = el.closest('#nina-composer')
      const active = document.activeElement
      if (host != null && active instanceof HTMLElement && host.contains(active)) active.blur()
    }
  }

  return { value, ref, handleChange, clear }
}
