import { cn } from '@/lib/cn'
import { ninaCropStyle, resolveCrop, type NinaCropInput } from '@/lib/nina/crop'

/**
 * A photo, framed in a circle, with the stored crop applied. F33 R23's frame.
 *
 * ── THIS IS THE ONLY MARKUP IN THE ADMIN TREE THAT READS `ninaCropStyle` ────────────────────
 * Three call sites use it — the album grid's thumbnails and the two "as she appears in chat"
 * sanity circles — and they differ only in `sizeClass`. A component rather than a copied `<span>`
 * because the invariant it enforces is invisible: the box **must be square** (`ninaCropStyle`'s
 * docstring explains why `top: N%` and `left: N%` are only the same unit in a square box), and a
 * copied span is a square that someone will one day make 4:5.
 *
 * `components/nina/NinaAvatar.tsx` (phase 13) is the app-side twin: same helper, same square box,
 * so the circle in this tool and the circle in the chat header are the same circle by
 * construction rather than by coincidence.
 *
 * ── WHY A PLAIN `<img>` AND NOT `next/image` ────────────────────────────────────────────────
 * Two independent reasons. (1) The source is a Vercel Blob URL holding bytes we deliberately did
 * not re-encode; running a paid transformation over them to draw a 96 px circle buys nothing —
 * the same call the other blob-image sites in this repo make. (2) `next/image` with `fill` sets
 * `position:absolute; inset:0; width:100%; height:100%` itself, which is exactly the four
 * properties the crop transform has to control. Fighting it with `!important` would be worse than
 * not using it.
 */

export function CircleFrame({
  src,
  natural,
  crop,
  sizeClass = 'size-24',
  ring = false,
  className,
}: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
  /** A Tailwind `size-*` or an explicit square. **Must be square.** */
  sizeClass?: string
  /** The accent ring the current photo wears in the grid. */
  ring?: boolean
  className?: string
}) {
  const style = ninaCropStyle(natural, resolveCrop(crop))
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-pill bg-paper-2',
        ring && 'ring-2 ring-accent ring-offset-2 ring-offset-card',
        sizeClass,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted, arbitrary dimensions,
          and the crop transform owns every positioning property `next/image fill` would set. */}
      <img src={src} alt="" draggable={false} style={style} />
    </span>
  )
}
