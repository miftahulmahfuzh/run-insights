import { LoadingDots } from '@/components/ui/Button'

import { NinaAvatar } from './NinaAvatar'
import type { ChatAvatar } from './types'

/**
 * Nina, mid-thought.
 *
 * **`LoadingDots` is reused, not re-drawn**, and this is not merely tidiness. That component's
 * docstring is the app's whole loading vocabulary — "Not a spinner: a spinner reads as 'the app is
 * thinking about itself', three dots read as 'your thing is being worked on'" — which is precisely
 * the sentence a typing indicator wants to say. And it animates through `ri-pulse`, the app's one
 * keyframe, which `app/globals.css` already neutralises under `prefers-reduced-motion`. A
 * hand-rolled second keyframe would fail `tests/motion.reducedMotion.test.ts`, whose job is to
 * assert that every animated keyframe has an escape.
 *
 * `aria-hidden`, because three dots are not information. `ChatScreen` carries the spoken version in
 * an `aria-live="polite"` region, which is where a screen reader should hear it.
 *
 * The bubble shape is `MessageBubble`'s "hers" exactly — same fill, same radii, same tail corner —
 * so the dots occupy the space her first line is about to occupy, rather than announcing themselves
 * as a different kind of object.
 *
 * ── WHY THE FACE IS A PROP AND NOT A DEFAULT (R1) ─────────────────────────────────────────────
 * It used to be `<NinaAvatar size="sm" />` with nothing else, which meant the committed
 * `/nina/avatar-001.png` and a `null` crop — so this circle silently ignored both the current
 * album photo and the framing set in the crop studio, while the 44 px circle two components away
 * honoured both. `lib/nina/crop.ts` already named this row as one of the four surfaces that must
 * render through `ninaCropStyle`; it was the one that did not. The triple is resolved once on the
 * server by `ninaAvatarView` and threaded down, so the two circles read the same row and cannot
 * disagree.
 *
 * The prop is OPTIONAL here and required at every hop above, which is the deliberate asymmetry:
 * this component is `aria-hidden` decoration whose worst case should be "the committed face", but
 * `ChatScreen` and `MessageList` have exactly one caller each and `tsc` should be what notices if
 * one of them stops passing it. An optional prop all the way up is how this bug happened.
 */
export function TypingIndicator({ avatar }: { avatar?: ChatAvatar }) {
  return (
    <li className="flex items-end justify-start gap-2" aria-hidden="true">
      <NinaAvatar
        size="sm"
        src={avatar?.src}
        natural={avatar?.natural ?? null}
        crop={avatar?.crop ?? null}
      />
      <span className="rounded-card rounded-bl-chip bg-card px-4 py-3.5 text-ink-3 shadow-card">
        <LoadingDots />
      </span>
    </li>
  )
}
