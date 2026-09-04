import Image from 'next/image'

import { cn } from '@/lib/cn'

/**
 * Nina's face, circular. **The app's first avatar** — `grep` finds no other, and `/s/[token]`
 * explicitly refuses one ("a shared run is a run, not a profile"), so there is nothing to inherit
 * and nothing forbidding it.
 *
 * `next/image` and not a plain `<img>`, which inverts the rule at the other four image call sites
 * — and the inversion is the point. Those serve Vercel Blob URLs holding files the browser already
 * compressed to ~55 KB, so re-optimising them would spend a paid transformation on nothing. This is
 * committed local art (phase 1 writes `public/nina/avatar-001.png`) at unknown intrinsic size, drawn
 * at 28 or 44 px, which is exactly the case `next/image` is for — the same reason `DetailPanel`
 * uses it for badge art.
 *
 * `fill` inside a fixed-size box rather than `width`/`height`, because her portrait is not square
 * (the anchor is 1792x2400) and a circular crop needs `object-cover` against a square box.
 *
 * `alt=""`. Both call sites already name her in adjacent text — the header says "Nina", the typing
 * row is `aria-hidden` behind a live region that says "Nina is typing". An `alt="Nina"` here would
 * make a screen reader say her name twice and tell the reader nothing new.
 *
 * Phase 13 replaces the source with `nina_avatars.is_current` and wraps this in a `<Link>` to
 * `/nina/about`. It renders here; it does not navigate here.
 */

/**
 * Phase 1 commits this file. The album that supersedes it is phase 13's, and RULING A5 fixes how:
 * phase 13 turns this constant into a **re-export of `NINA_AVATAR_FALLBACK_SRC` from
 * `lib/nina/album.ts`**, so every import written in this phase keeps compiling and the string
 * `'/nina/avatar-001.png'` is spelled exactly once in the repo. Phase 15's `CircleFrame` imports
 * that same constant rather than declaring a third copy.
 */
export const NINA_AVATAR_SRC = '/nina/avatar-001.png'

const SIZES = {
  /** 28px — beside the typing indicator. */
  sm: 'size-7',
  /** 44px — the chat header. Also the iOS tap-target floor, for when phase 13 makes it a link. */
  md: 'size-11',
} as const

export function NinaAvatar({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        SIZES[size],
        className,
      )}
    >
      <Image src={NINA_AVATAR_SRC} alt="" fill sizes="88px" className="object-cover" />
    </span>
  )
}
