/**
 * The photos inside a bubble. Rendered through `MessageBubble`'s `above` slot, which phase 4 built
 * for exactly this. Phase 8's run card is the slot's second occupant, stacked BELOW these; phase
 * 7's quote stub is not in this slot at all — it has its own `quote` prop and sits above the whole
 * slot (RULING E2). Order inside the bubble: quote stub → images → run card → text.
 *
 * `mb-2` lives on the `<ul>` here, not on a wrapper, and phase 8's `RunAttachmentCard` does the
 * same: each inset block owns its own bottom margin, so the two stack with no wrapper margins and
 * either can be absent without leaving a gap.
 *
 * A plain `<img>`, not `next/image`, matching every other Blob-backed image in the app
 * (`ScreenshotStrip`, `PhotoViewer`, `PhotoInclusionList`, `/s/[token]`): the browser already
 * compressed these to ~120-200 KB, so a paid transformation would buy nothing. `NinaAvatar` is
 * the one `next/image` call site because it serves committed local art at unknown intrinsic size.
 *
 * `bg-ink-3/20` is the inset surface, and it is the answer to phase 4's flagged issue: `ink-3` is
 * `#93a2b0` in light and `#7c8d9b` in dark, a mid-grey in BOTH schemes, so an alpha of it
 * composites correctly over `bg-ink` and over `bg-card` in light and dark alike, where
 * `bg-paper-2` inverts. See the phase-6 plan's Step 9. **RULING E1 makes this the inset surface
 * for phases 7, 8 and 13 too**, so do not introduce a second recipe here.
 *
 * `alt=""`. The photo is the runner's own, he is looking at the thing he just sent, and there is
 * no honest alt text for it — the only description that exists is `glm-4.6v`'s, which is private.
 *
 * Not interactive in this phase. Phase 13 owns tap-to-open, and it already has
 * `components/ui/PhotoViewer.tsx` and `lib/photos/gallery.ts` to do it with; it should widen this
 * component with an `onOpen` prop rather than write a second image grid.
 */
export function ChatImages({ urls }: { urls: readonly string[] }) {
  if (urls.length === 0) return null

  return (
    <ul
      className={urls.length === 1 ? 'mb-2 grid grid-cols-1 gap-1' : 'mb-2 grid grid-cols-2 gap-1'}
    >
      {urls.map((url) => (
        <li key={url} className="overflow-hidden rounded-field bg-ink-3/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            className={
              urls.length === 1
                ? 'block max-h-64 w-full object-cover'
                : 'block aspect-square w-full object-cover'
            }
          />
        </li>
      ))}
    </ul>
  )
}
