'use client'

import { useTransition } from 'react'

import { buttonClasses } from '@/components/ui'
import { ensureNinaAvatarDescriptionAction } from '@/lib/admin/ninaAlbumActions'
import { ninaPhotoShareUrl } from '@/lib/admin/shareToNina'
import { cn } from '@/lib/cn'

/**
 * "Share link to Nina" — R2, one item in the explorer's per-photo menu.
 *
 * The user's words are the spec: *"clicking it automatically open runins.site chat in a new
 * browser tab and put this file as an attachment … user can input additional text question /
 * comment (optional), and nina will respond to it accordingly."* Four sentences of behaviour, and
 * every one of them has an obvious wrong implementation, so each gets a heading.
 *
 * ── WHY `window.open` AND NOT `<Link>` OR `router.push` ───────────────────────────────────────
 * *"in a new browser tab"* is in the requirement, and a `<Link>`/`router.push` is a client-side
 * navigation **inside this tab** — it would replace the file manager with the chat, which is the
 * opposite of what a share affordance in an admin tool should do (he is mid-audit of three hundred
 * photos; the album must still be there when he comes back). `'noopener'` is not optional either:
 * a `target=_blank` navigation without it leaves the new tab holding a live `window.opener` handle
 * back onto `/admin/nina` — a cross-tab reference into the app's only privileged screen, for no
 * gain, since nothing here needs to talk to the tab afterwards. Per the HTML spec's `window.open`
 * steps, `noopener` is stripped from the feature string *before* the "is a popup requested" check
 * runs, so the remaining feature map is empty and the result is a **tab**, not a popup window —
 * which is exactly what was asked for. `noreferrer` is deliberately not added: the target is our
 * own origin, so the `Referer` leaks nothing to anyone.
 *
 * `window.open` with `'noopener'` returns `null` by specification, so the return value is **not**
 * read and there is no popup-blocked branch to write. There is nothing useful such a branch could
 * do anyway; a blocked popup shows the browser's own indicator, which is a better affordance than
 * anything this component could render. What matters is not getting blocked in the first place —
 * see the next heading.
 *
 * ── WHY THE DESCRIBE IS FIRED AND NOT AWAITED ─────────────────────────────────────────────────
 * Phase 4 took the `glm-4.6v` pre-pass off the upload path, because *"i will put hundreds of
 * profile pics in there"* against a ~8-11 s round trip is not an upload, it is an afternoon. So a
 * freshly uploaded photo has `description = null`, and `lib/nina/actions.ts` is explicit that the
 * description is the only way she can say anything true about a photograph — she is never sent the
 * image itself (invariant 5). This is the moment it is needed, so this is where it is requested.
 *
 * It is *initiated* before the tab opens and **never awaited before it**. Awaiting would be the
 * bug: browsers grant `window.open` on transient user activation, which Chrome expires ~5 s after
 * the click, and an 8-11 s vendor call sitting in between would turn *"automatically open … in a
 * new browser tab"* into a blocked-popup icon. So both start in the same click: the action's fetch
 * goes out, then the tab opens, both inside the gesture.
 *
 * That leaves a race with the send, and it is an honest one: `resolveAttachment` copies the
 * description at **send** time, not at page load, so the describe has the whole of the new tab's
 * load plus however long he takes to type a question — comfortably more than 11 s in practice — to
 * land first. If it loses, or if z.ai is down, the send still works and she simply has nothing to
 * say about the picture, which is the same thing that happens today for any un-described photo.
 * Non-fatal, exactly as the register path's pre-pass was non-fatal, and for the same reason: a
 * vendor outage must not block the thing the human asked for.
 *
 * ── WHY `ensureNinaAvatarDescriptionAction` AND NOT `describeNinaAvatarAction` ────────────────
 * Phase 4 wrote `ensure…` for this call site specifically, and the difference is a vendor call:
 * `describeNinaAvatarAction` re-describes unconditionally (it is the album's "Describe it" retry
 * button), while `ensure…` returns after ONE indexed single-row read for any photo that already
 * has a description — which is every photo that has ever been her face (phase 4 schedules a
 * describe on `setCurrentNinaAvatarAction`) or was ever shared. So the common case costs a read,
 * the `described` guard below skips even that, and only a never-promoted never-shared photo pays
 * the ~8-11 s. Two guards for the same thing is deliberate: `described` is a REQUIRED prop so a
 * missing bit is a compile error, and `ensure…` is authoritative at the moment the work would
 * actually run.
 *
 * ── WHY NOTHING IS SENT FROM HERE ─────────────────────────────────────────────────────────────
 * `attachNinaPhotoToChat` (`lib/nina/albumActions.ts`) already attaches an owned photo to the
 * chat, and calling it would be wrong here. It **sends immediately** and awaits the entire 13-16 s
 * turn, which is right for the mobile `/nina/about` flow it was built for — there the caption is
 * typed before the attach and the screen then navigates to the chat. R2 asks for the other order:
 * *"user can input additional text question / comment (optional)"*, in the chat, in the tab that
 * just opened, where he can see her answer arrive. So this component **arms** the composer and
 * sends nothing; phase 3 owns everything that happens in the new tab, including the empty-question
 * case (a photo with no words is already a valid send — `sendNinaMessage`'s refusal rule has
 * `attachExisting != null` as its fourth disjunct).
 *
 * ── WHY THE ORIGIN IS A PROP ──────────────────────────────────────────────────────────────────
 * `lib/share/origin.ts` opens with `import 'server-only'`, so this file cannot call `shareOrigin()`
 * and must be handed the answer. It must not compute one either. `window.location.origin` is the
 * tempting inline fix and it is wrong for the reason that module's header spends fifteen lines on:
 * on a Vercel preview deployment it is a per-deployment hostname that dies at the next push, so
 * the "share" would open a chat on a URL that will not exist tomorrow. And a build-time public
 * environment variable is forbidden outright — invariant 9, roadmap §4.1, and
 * `scripts/check-client-secret-boundary.mjs` RULE 3 fails the build on that prefix appearing
 * anywhere under `app/`, `lib/` or `components/`. A prop from a Server Component is the one
 * remaining way, and it is also the correct one: the origin is resolved once, server-side, in the
 * single place that knows the rule.
 *
 * ── WHY `described` IS A BOOLEAN AND NOT THE DESCRIPTION ──────────────────────────────────────
 * One bit is all this decision needs ("has she got anything to say about this photo?"), and taking
 * the bit instead of the prose keeps `description` — `glm-4.6v`'s private input to her prompt,
 * invariant 5 — out of this component entirely. It is a **required** prop on purpose: if phase 5's
 * grid row does not carry the bit, that is a compile error rather than a silent extra vendor call
 * on every share.
 */
export function ShareToNinaItem({
  photoId,
  described,
  shareOrigin,
  className,
  onOpened,
}: {
  /** `nina_avatars.id` of the selected photo. */
  photoId: string
  /** `photo.description != null`. False means fire the describe on the way out. */
  described: boolean
  /** `shareOrigin()`'s output, threaded from `app/admin/nina/page.tsx`. Never `window.location`. */
  shareOrigin: string
  /** So the host menu can style this item exactly like its own. */
  className?: string
  /** Called after the tab is opened, so the host menu can close itself. */
  onOpened?: () => void
}) {
  const [describing, startTransition] = useTransition()

  function share() {
    /*
     * Initiated first, awaited never — see the header. `startTransition` runs its callback
     * synchronously up to the first `await`, so the action's request is on the wire before the
     * next statement executes, and the next statement is still inside the click's user
     * activation. The `revalidatePath('/admin/nina')` inside the action is what makes the
     * explorer's own row show the description afterwards, without anything here refetching.
     */
    if (!described) {
      startTransition(async () => {
        const outcome = await ensureNinaAvatarDescriptionAction(photoId)
        // Logged, never surfaced: the tab he asked for is already open and a toast about a vendor
        // timeout on a screen he has just navigated away from is noise. The explorer's existing
        // "Describe it" button is the retry.
        if (!outcome.ok) console.error('[f34] share-to-Nina describe failed', outcome.error)
      })
    }

    window.open(ninaPhotoShareUrl(shareOrigin, photoId), '_blank', 'noopener')
    onOpened?.()
  }

  /*
   * A plain `<button>` wearing `Button`'s look, which is what `buttonClasses` is exported for
   * (`components/ui/Button.tsx`: *"Exported so a non-`<button>` element can borrow the look"*).
   * Rendering `Button` itself would work, but this item must stay one element with `onClick`
   * straight on it: `window.open` runs inside the click's user activation and nothing may sit
   * between the gesture and the call. `secondary`/`md`/`fullWidth` is what phase 5's neighbours in
   * the action stack wear, so it sits with them without a caller having to say so.
   */
  return (
    <button
      type="button"
      onClick={share}
      className={cn(
        buttonClasses({ variant: 'secondary', size: 'md', fullWidth: true }),
        className,
      )}
      aria-busy={describing || undefined}
    >
      Share link to Nina
    </button>
  )
}
