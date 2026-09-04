import { LoadingDots } from '@/components/ui/Button'

import { NinaAvatar } from './NinaAvatar'

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
 */
export function TypingIndicator() {
  return (
    <li className="flex items-end justify-start gap-2" aria-hidden="true">
      <NinaAvatar size="sm" />
      <span className="rounded-card rounded-bl-chip bg-card px-4 py-3.5 text-ink-3 shadow-card">
        <LoadingDots />
      </span>
    </li>
  )
}
