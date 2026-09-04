import Image from 'next/image'

import { ninaCropStyle, resolveCrop, type NinaCropInput } from '@/lib/nina/crop'
import { NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { cn } from '@/lib/cn'

/**
 * Nina's face, in a circle — F33 R9/R17/R19.
 *
 * ── THE SOURCE IS THE ALBUM, WITH THE COMMITTED FILE AS THE ANSWER FOR "NO ALBUM" ─────────────
 * Phase 4 hardcoded `public/nina/avatar-001.png` because there was no album yet. Now there is, and
 * `getCurrentNinaAvatar()` returning null means "use the committed constant" — D-2, implemented
 * once in `ninaAvatarView`. Every caller passes a `NinaAvatarView`'s three fields or passes
 * nothing at all, and passing nothing renders exactly what phase 4 rendered.
 *
 * ── ONE CROP MAPPING, SHARED WITH THE ADMIN PREVIEW ───────────────────────────────────────────
 * `ninaCropStyle` is the only function in the repo that knows what `crop_scale` means. Phase 15's
 * circular studio and this 44 px header avatar therefore cannot disagree about where her face is,
 * which is the entire reason that module exists and why it was moved into this phase (D-1).
 *
 * ── WHY THE FALLBACK KEEPS ITS `next/image` AND A BLOB URL DOES NOT GET ONE ───────────────────
 * The committed PNG is a build-time asset at a known path: `next/image` can size, format and cache
 * it for free. An album photo is a Blob URL of arbitrary dimensions that phase 12 already produced
 * at its target size, so `next/image` would re-optimise a finished file on a paid transform quota
 * — the same argument `PhotoViewer` makes in its own eslint-disable. And the crop transform sets
 * `position`/`width`/`height`/`left`/`top`, which is exactly what `next/image fill` sets itself.
 */

/** `public/nina/avatar-001.png`, re-exported so phase 4's importers do not change. */
export { NINA_AVATAR_FALLBACK_SRC as NINA_AVATAR_SRC } from '@/lib/nina/album'

const SIZES = {
  /** 28px — the typing indicator and the message list. */
  sm: 'size-7',
  /** 44px — the chat header. Also the iOS tap-target floor, which is why Step 13 needs no resize. */
  md: 'size-11',
  /** 128px — the hero on `/nina/about`. */
  xl: 'size-32',
} as const

export function NinaAvatar({
  size = 'md',
  src = NINA_AVATAR_FALLBACK_SRC,
  natural = null,
  crop = null,
  className,
}: {
  size?: keyof typeof SIZES
  src?: string
  natural?: { width: number | null; height: number | null } | null
  crop?: NinaCropInput | null
  className?: string
}) {
  const isFallback = src === NINA_AVATAR_FALLBACK_SRC && crop == null

  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        SIZES[size],
        className,
      )}
    >
      {isFallback ? (
        <Image src={src} alt="" fill sizes="128px" className="object-cover" />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary
           dimensions, already at its target size, and the crop transform owns every positioning
           property `next/image fill` would set. See the header. */
        <img
          src={src}
          alt=""
          draggable={false}
          style={ninaCropStyle(natural ?? { width: null, height: null }, resolveCrop(crop))}
        />
      )}
    </span>
  )
}
