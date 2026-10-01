'use client'

import * as React from 'react'

import { adminPhotoLink } from '@/lib/admin/albumDeepLink'
import type { PhotoPointer } from '@/lib/photos/pointer'

/**
 * How long the tick stands in for the copy glyph after a copy. `ShareButton`'s constant and its
 * reasoning, unchanged: long enough to be seen on a glance down at the phone, short enough that the
 * header row is itself again before the next tap — because a permanently-ticked button has stopped
 * reading as a copy button.
 */
const COPIED_HOLD_MS = 2000

/**
 * The control's words. Indonesian, because its two mount points are Nina's own client surfaces and
 * the header control already standing there says "Buka detail job foto ini"
 * (`ChatScreen.tsx:705`, `NinaAboutScreen.tsx:758`) — one header row, two languages, is the drift
 * these constants exist to prevent. The admin rail's English stays where it is; this button never
 * renders there.
 *
 * Exported so the test asserts the same strings the component renders rather than a second copy of
 * them.
 */
export const COPY_ADMIN_LINK_LABEL = 'Salin link admin foto ini'
export const COPY_ADMIN_LINK_DONE = 'Link admin tersalin'
export const COPY_ADMIN_LINK_FAILED = 'Gagal menyalin — ini linknya.'
export const COPY_ADMIN_LINK_FIELD = 'Link admin'

/**
 * **R1: the icon-only "copy this photograph's admin link" control, for `PhotoViewer`'s header.**
 *
 * The runner's own words for why it exists: *"oftentimes, i am using full-view image from runins
 * Nina chat (client page, not admin) through my phone, and here sometimes i realize i want to
 * replace this image with a newly uploaded image"* — so the link goes to WhatsApp, and the Replace
 * happens on a desktop at `/admin/nina` with the row already selected.
 *
 * ── WHAT THIS COMPONENT DELIBERATELY DOES NOT KNOW ───────────────────────────────────────────
 * **Who is looking.** `origin` is required and non-null, and R4's "hide it from everyone but the
 * admin" gate lives entirely at the call sites: each of phase 4's four surfaces holds a NULLABLE
 * admin-origin prop, resolved server-side from `getAdminIdentity()` + `shareOrigin()`, and renders
 * no control at all when it is `null`. That is structural rather than a render-time `if` — a
 * non-admin's page payload carries no origin, so there is nothing to hide. This file therefore
 * imports nothing `server-only`, reads no env, and never touches `window.location` (whose
 * per-deployment preview hostname would die at the next push, with the link already sent).
 *
 * ── CLIPBOARD ONLY. NO SHARE SHEET. ──────────────────────────────────────────────────────────
 * A tap writes `navigator.clipboard.writeText` and nothing else. **`navigator.share` is never
 * called, even where the platform has it**, and `CopyAdminLinkButton.test.tsx` pins that as a
 * regression test rather than leaving it as an accident of this file's current shape.
 *
 * That is the runner's own ruling, asked and answered: *"yes, clipboard-only, no share sheet"*. It
 * follows the requirement's literal words — *"it will automatically copy an admin-media-view link
 * to clipboard"* — and it is the behaviour that is the same on every device. The share sheet is a
 * modal the operator then has to steer, on a one-handed phone, to reach an action the clipboard
 * already performed; and on a platform where `navigator.share` exists it would have been the ONLY
 * path, so the plain copy this button is named after would never have run at all.
 *
 * ── THE ONE FALLBACK, AND WHY IT STAYS ───────────────────────────────────────────────────────
 * `components/share/ShareButton.tsx:123-130`'s bottom rung, kept verbatim in spirit: when
 * `writeText` rejects — an insecure context, or a browser that gates the clipboard behind a
 * permission the operator declined — the URL goes on screen in a read-only, selectable field.
 * **Nobody ever gets nothing**, which matters more here than it does there: the only feedback a
 * copy has is a tick, and a silent failure sends the operator to a desktop to paste an empty
 * clipboard.
 *
 * ── NO `pointerdown` WARM, AND NOW FOR A STRONGER REASON ─────────────────────────────────────
 * `ShareButton`'s one hard problem is transient activation: `navigator.share()` may only be called
 * while a user gesture is still live, and its link needs a Server Action round trip to mint, so the
 * `await` eats the window and Safari answers `NotAllowedError`. Warming the mint on `pointerdown`
 * is the fix for that. None of it applies here, twice over: `adminPhotoLink` is a pure string built
 * in render, so there is nothing to await before acting — and **no gesture-sensitive API is called
 * at all**, because `navigator.clipboard.writeText` carries no transient-activation requirement.
 * That is precisely why `ShareButton` treats the clipboard as the rung that always works, and it is
 * why this component is a plain `onClick` with no warming machinery guarding a problem that cannot
 * occur.
 *
 * ── ICON ONLY, ON PURPOSE ────────────────────────────────────────────────────────────────────
 * R1's word, and the header's geometry: the row is a 44 px control plus a 44 px ✕ on `bg-ink/95`,
 * and a word there would wrap over a photograph. The verb lives in `aria-label` and `title`; the
 * glyph is `aria-hidden`, because the accessible name is the control's, never the picture's — the
 * rule `components/admin/photoIcons.tsx`'s header states for the whole repo.
 */
export function CopyAdminLinkButton({
  /** Which table and which row this photograph is — `ViewerPhoto.rowPointer`, straight through. */
  pointer,
  /**
   * The absolute origin to build the link on, e.g. `https://runins.site`. Resolved SERVER-side via
   * `shareOrigin()` and threaded down as a prop (phase 4). **Never `window.location`** — invariant
   * 9, and `SelectionPane`'s prop doc spells the same rule for the same reason.
   */
  origin,
}: {
  pointer: PhotoPointer
  origin: string
}) {
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'manual'>('idle')
  const [pending, setPending] = React.useState(false)

  /**
   * `null` for a kind with no admin destination — `'shot'`, a `run_photos` row, which `/admin/nina`
   * holds in neither of its two collections. Memoised only so the identity is stable across the
   * status re-renders below; it is a string concatenation, not a cost.
   */
  const href = React.useMemo(
    () => adminPhotoLink(pointer.kind, pointer.id, origin),
    [pointer.kind, pointer.id, origin],
  )

  /*
   * The tick's own clock. `'manual'` deliberately does NOT expire — that state is showing the
   * operator a link to select by hand, and yanking it away mid-drag would be the rudest thing this
   * component could do. Only the success tick reverts.
   */
  React.useEffect(() => {
    if (status !== 'copied') return
    const timer = window.setTimeout(() => setStatus('idle'), COPIED_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  /*
   * A refused kind renders NOTHING rather than a dead button. Below every hook, so the hook order
   * is identical on every render regardless of which photograph is on screen — the overlay pages
   * across a mixed list and this component is remounted per photo by `headerAction`.
   */
  if (href === null) return null
  const link = href

  async function onClick() {
    setPending(true)
    try {
      /*
       * Straight to the clipboard. No `navigator.share` branch, deliberately and by the runner's
       * own ruling — see this component's header. Adding one back would mean that on every
       * share-capable platform (which is to say: the phone this button was asked for) a tap opens a
       * sheet instead of doing the single thing the control is named after.
       */
      await navigator.clipboard.writeText(link)
      setStatus('copied')
    } catch {
      // The clipboard refused — an insecure context, or a browser that gates it behind a permission
      // the operator declined. Put the URL on screen in a field they can select. Never a dead end.
      setStatus('manual')
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        aria-label={status === 'copied' ? COPY_ADMIN_LINK_DONE : COPY_ADMIN_LINK_LABEL}
        title={status === 'copied' ? COPY_ADMIN_LINK_DONE : COPY_ADMIN_LINK_LABEL}
        className="grid size-11 place-items-center rounded-pill text-card disabled:opacity-50"
      >
        {status === 'copied' ? <CheckIcon className="size-5" /> : <CopyIcon className="size-5" />}
      </button>

      {/*
       * The confirmation the tick cannot speak. Swapping this button's `aria-label` is not enough
       * on its own: a name change on an element that is not focused is not reliably announced, and
       * a clipboard write is otherwise completely invisible — nothing opens, nothing navigates,
       * nothing moves. A live region says it once, out of the layout, so the header row stays two
       * tap targets wide.
       */}
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? COPY_ADMIN_LINK_DONE : ''}
      </span>

      {/*
       * The bottom rung. `fixed` and not `absolute`: this control is rendered inside the header's
       * `flex shrink-0` cluster, where an inline input would squeeze the ✕ off the edge, and
       * `fixed` positions against the viewport rather than against whichever ancestor a future
       * caller happens to have positioned.
       *
       * `4.25rem + var(--safe-top)` sits it immediately under `PhotoViewer`'s header, and the
       * arithmetic is deliberate: that header is `pt-[calc(0.75rem+var(--safe-top))] pb-3` around a
       * `size-11` control, so 0.75 + 2.75 + 0.75 = 4.25rem. **Tailwind cannot read a constant**, so
       * changing the header's padding means changing this literal — the same coupling `PhotoViewer`
       * states out loud for its own `3.25rem`, and `AppShell` for `TAB_BAR_HEIGHT_PX`.
       *
       * `z-70` against the overlay's `z-60`, matching `NinaAboutScreen.tsx:808`'s attach strip.
       *
       * `readOnly` rather than `disabled` — a disabled input cannot be selected, which would defeat
       * the entire purpose of showing it. `onFocus` selects the whole value, so one tap plus the
       * platform's own "Copy" gets there with no API at all.
       */}
      {status === 'manual' && (
        <span className="fixed inset-x-3 top-[calc(4.25rem+var(--safe-top))] z-70 flex items-center gap-2 rounded-field bg-card px-2.5 py-2">
          <span className="shrink-0 text-[11px] font-medium text-ink-3">
            {COPY_ADMIN_LINK_FAILED}
          </span>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={COPY_ADMIN_LINK_FIELD}
            className="min-w-0 flex-1 rounded-field bg-paper-2 px-2 py-1 text-[11px] font-medium text-ink"
          />
        </span>
      )}
    </>
  )
}

/**
 * Lucide's `copy` — two offset rounded rectangles, the one mark that reads as "this is now on your
 * clipboard".
 *
 * **The glyph follows the behaviour, and the behaviour changed.** The first draft of this file drew
 * Lucide's `link` and argued against a clipboard mark on the grounds that the tap opened a share
 * sheet rather than writing a clipboard. That is no longer true — there is no sheet, the tap writes
 * the clipboard and only ever writes the clipboard — so a copy mark is now the honest picture and a
 * chain-link one would be naming the payload instead of the verb. The payload is already said in
 * full by the `aria-label`, *"Salin link admin foto ini"*, which carries both: salin (the verb) and
 * link admin (the thing).
 *
 * It also reads correctly beside its neighbour. The chat and about headers already hold
 * `JobDetailIcon`, a *destination* glyph for a control that navigates; two link-ish marks in one
 * 88 px row would say "two ways to go somewhere" when one of them goes nowhere at all.
 *
 * `strokeWidth` 2 and a caller-supplied `size-5`, matching `JobDetailIcon` (`ChatScreen.tsx:722`)
 * and the ✕ beside it, so the header row stays visually even. `aria-hidden`: the button carries the
 * accessible name, never the picture — `components/admin/photoIcons.tsx`'s rule for the repo.
 */
function CopyIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

/** The copy confirmation, for {@link COPIED_HOLD_MS}. Same box, so the header never shifts. */
function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}
