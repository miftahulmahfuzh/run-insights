# Phase 3: The icon-only copy button, and the handle it reads

**Plan set:** `COPY_ADMIN_MEDIA_LINK_PLAN.md`
**Analysis:** `20261001-104938-K7P2_code_analyzer.md`
**Satisfies:** R1 — an icon-only copy-admin-link control in the full-view image overlay, whose tap
puts an absolute `https://…/admin/nina?…` link to *that* photograph somewhere the operator can
paste it into WhatsApp.
**Depends on:** Phase 1 (`adminPhotoLink` in `lib/admin/albumDeepLink.ts`)
**Difficulty:** NORMAL
**Package:** `components/ui`

---

## Goal

After this phase a `ViewerPhoto` can say **which admin row** it is — a `PhotoPointer`-shaped
`rowPointer` field that names the table *and* the id, kept deliberately separate from `id`, which on
both Nina surfaces already means the image-generation **turn**. And `components/ui/CopyAdminLinkButton.tsx`
exists: an icon-only, 44 px header control that mints phase 1's absolute admin link for a pointer
and **writes it straight to the clipboard** — with a selectable read-only field as the one fallback
when the clipboard refuses, so the control is never a dead end. Tick and live region included.

**Clipboard-only, no share sheet.** The runner was asked and answered, verbatim: *"yes,
clipboard-only, no share sheet"* — rung 5, the user's own input, and it overrides the
share → clipboard → field ladder the plan index originally wrote for this phase. `navigator.share`
is not called at all, and a test pins that it is not called even when the platform has it.

Nothing mounts it yet. `PhotoViewer`'s render output is byte-identical — the new field is read only
by a caller, through the photo `headerAction` is already handed. Phase 4 does the mounting and the
admin gate.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

- `ViewerPhoto.rowPointer?: PhotoPointer` — optional field on the exported interface
  (`components/ui/PhotoViewer.tsx`). **This exact spelling is what phase 4 populates — pinned by the
  reconciler.** Phase 4's first draft wrote `adminPointer` for both this field and its own
  `ChatSessionPhoto` field; that draft has been rewritten to `rowPointer` throughout, because this
  phase owns the file, already pins the spelling in `components/ui/PhotoViewer.test.tsx`, and
  `rowPointer` names what the value IS rather than which feature consumes it. **Do not rename it.** Type is
  `PhotoPointer` from `@/lib/photos/pointer` (`{ kind: PhotoPointerKind; id: string }`), imported
  into `PhotoViewer.tsx` as a **type-only** import so no runtime edge is added. Absent is legal and
  renders nothing; `PhotoViewer` itself never reads it.
- `CopyAdminLinkButton` — `function`, **new file** `components/ui/CopyAdminLinkButton.tsx`
  (`'use client'`). **Props, exactly:**
  ```ts
  { pointer: PhotoPointer; origin: string }
  ```
  Both **required**, `origin` **non-null** (R4's hide-from-non-admins gate lives at phase 4's call
  sites, which render nothing when their own nullable origin prop is `null`). Returns `null` —
  renders nothing at all — when `adminPhotoLink` refuses the kind (`'shot'`).
- `COPY_ADMIN_LINK_LABEL = 'Salin link admin foto ini'` — `const`, same file. The idle
  `aria-label`/`title`.
- `COPY_ADMIN_LINK_DONE = 'Link admin tersalin'` — `const`, same file. The post-copy label and the
  live region's sentence.
- `COPY_ADMIN_LINK_FAILED = 'Gagal menyalin — ini linknya.'` — `const`, same file. The fallback
  rung's sentence.
- `COPY_ADMIN_LINK_FIELD = 'Link admin'` — `const`, same file. The `aria-label` of the selectable
  fallback input.
- `components/ui/CopyAdminLinkButton.test.tsx` — new component test.

**Signature changes:** none. `PhotoViewer`'s own props are untouched; `headerAction` keeps its exact
`(photo: ViewerPhoto) => React.ReactNode` type and its exact render site.

**Requires (from earlier phases):**

- Phase 1 — `adminPhotoLink(kind: PhotoPointerKind, id: string, origin: string): string | null`,
  exported from `lib/admin/albumDeepLink.ts`. **Positional, in that order.** Verified against
  `.workflows/plan/copy-admin-media-link/phase-1.md` Step 3; this phase does not typecheck until
  phase 1 lands.
- Phase 1's contract that the minter **returns `null` and never throws** for `'shot'`. This
  component treats `null` as "render nothing"; a throw would escape a render and blank the overlay.

**Leaves alone (owned by others):**

- `lib/admin/albumDeepLink.ts` and its test (Phase 1).
- `lib/photos/pointer.ts` — imported, never edited.
- `lib/nina/queries/images.ts`, `lib/nina/queries.ts`, `app/admin/nina/page.tsx`,
  `components/admin/FileExplorer.tsx` (Phase 2).
- Every `PhotoViewer` caller: `components/nina/ChatScreen.tsx`, `components/nina/NinaAboutScreen.tsx`,
  `components/nina/usePhotoViewer.ts`, `lib/nina/chatphotos.ts`,
  `components/photo/PhotoDeepLinkScreen.tsx`, `app/nina/*`, `app/photo/*` (Phase 4).
- `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx`,
  `app/(public)/s/[token]/page.tsx`, `components/admin/explorer/SearchResultsGrid.tsx`,
  `components/admin/ErrorLogList.tsx` — untouched, and proven untouched by their frozen suites.
- `components/ui/index.ts` — **not** edited. `PhotoViewer` is imported by path, not through the
  barrel (that barrel's header says only names screens actually pull through it are re-exported);
  `CopyAdminLinkButton` follows the same rule.

## Files

| File | Action | What changes |
|---|---|---|
| `components/ui/PhotoViewer.tsx` | modify | one type-only import (after `:6`) and one optional `rowPointer` field on `ViewerPhoto` (after `:60`). No render change. |
| `components/ui/CopyAdminLinkButton.tsx` | create | the icon-only control, its four copy constants, and two inline glyphs |
| `components/ui/CopyAdminLinkButton.test.tsx` | create | the clipboard write, the never-shares regression, the refusal, the tick's clock, the live region |
| `components/ui/PhotoViewer.test.tsx` | modify | three cases appended inside `describe('the header action slot', …)` (`:210-260`) |

---

## Implementation Steps

### Step 1: `ViewerPhoto` learns which row it is

**File:** `components/ui/PhotoViewer.tsx:6` (the import block) and `:60` (immediately after `id?`)

**Change:** Add a type-only import of `PhotoPointer`, then a new optional `rowPointer` field whose
doc comment says out loud why it is not `id`.

`import type` and not a value import, deliberately: the field is a shape, the import erases entirely
at build, and `PhotoViewer` gains no runtime edge at all — which is what keeps this file's import
graph (and `tests/share.bundle.test.ts`'s view of it) exactly as it is today. Placement is
alphabetical after `@/lib/photos/gallery`, which is what `eslint-plugin-import`'s order rule in this
repo expects.

**Code:** the import block, complete, replacing lines 3–6:

```tsx
import * as React from 'react'

import { SCREEN_KIND_LABEL, type ScreenKind } from '@/lib/extract/constants'
import { decideSwipe, stepIndex, type SwipeGesture } from '@/lib/photos/gallery'
import type { PhotoPointer } from '@/lib/photos/pointer'
```

And the complete `ViewerPhoto` interface, replacing lines 47–78:

```tsx
export interface ViewerPhoto {
  url: string
  kind: string
  /**
   * The row id this photograph came from, when the caller has one — the handle `headerAction`
   * needs in order to link to the photograph's own screen.
   *
   * Deliberately separate from `meta` below, which is the DISPLAY string (`#<id> · <score>`) and is
   * already formatted for a human: parsing an id back out of it would make a printed format
   * load-bearing. Optional, because the review surfaces have no such id and never will —
   * `ReviewPhoto` is `{url, kind, width, height}` (`lib/review/loadReview.ts:34-39`) and assigns to
   * this type with no adapter, which is the promise this interface's header makes.
   */
  id?: string
  /**
   * WHICH ROW this photograph's bytes live in: the table and the id, together.
   *
   * ── WHY THIS IS NOT `id` ABOVE, AND MUST NEVER BECOME IT ─────────────────────────────────────
   * Because `id` is already spoken for, by something that breaks loudly and on two screens at once.
   * On both Nina surfaces it carries the image-generation TURN id: `ChatScreen.tsx:703` and
   * `NinaAboutScreen.tsx:757` hand it straight to `ninaJobHref` for the "Buka detail job foto ini"
   * link, and `lib/nina/chatphotos.ts:26-32` documents it as such. A photograph's own row id is a
   * different id in a different table, so overloading `id` would point both of those links at
   * `/nina/jobs/<a nina_message_images id>` — a page that does not exist — while still compiling
   * and still rendering a plausible-looking button.
   *
   * ── WHY A POINTER AND NOT A BARE STRING ──────────────────────────────────────────────────────
   * Because "which row" is only an answer when it also says which TABLE. `nina_avatars` and
   * `nina_message_images` both key on `lib/id.ts`'s nanoid(12), so nothing in the string itself
   * distinguishes them, and the consumer has to pick a collection to look in. `PhotoPointer`
   * (`lib/photos/pointer.ts`) is already this repo's vocabulary for exactly that question, and the
   * module is pure — one import, no database, no `server-only` — so a `'use client'` overlay may
   * hold it.
   *
   * **Absent renders NOTHING**, the same promise `label`, `meta`, `actions` and `headerAction` all
   * make. This component never reads the field at all: it travels to `headerAction` inside
   * `photos[index]`, which is what that slot's argument exists for. `ReviewPhoto` still assigns to
   * this type with no adapter, so `ScreenshotStrip`, `SheetSource` and `PhotoInclusionList` are
   * byte-identical — `components/ui/PhotoViewer.test.tsx` holds that half.
   */
  rowPointer?: PhotoPointer
  /**
   * What to call this photo, when `kind` is not a `ScreenKind`. F33's album and chat gallery pass
   * a human phrase here; the review surfaces pass nothing and keep `SCREEN_KIND_LABEL`.
   *
   * Without it the header renders `SCREEN_KIND_LABEL[kind] ?? kind`, which for an album photo is
   * the literal word `avatar` and for one of her selfies the literal word `generated` — and the
   * dot row then announces "generated screenshot".
   */
  label?: string
  /**
   * A short identifying line shown beside the name in the header — the search grid passes each
   * hit's row id and similarity score, so an operator can cite a photograph ("that one, id X,
   * scored 0.30") without leaving the viewer. Absent renders NOTHING, same promise as `label`:
   * the review surfaces keep the header they have always drawn
   * (`components/ui/PhotoViewer.test.tsx` holds both halves).
   */
  meta?: string
}
```

**Impact:** One optional field, zero render change. `tests/ui.photoViewer.test.ts` is a source scan
over this file with comments stripped by `readRepoCode`, so every one of its assertions still holds:
nothing here introduces the string `preventDefault`, `touch-pinch-zoom` is untouched,
`stepIndex(index, delta, photos.length)` is untouched, the `Math.max(drag.current.touches, …)` regex
is untouched, and `export function PhotoViewer` is untouched. The two `Math.min(\s*index` /
`Math.max(\s*index` negative assertions are unaffected — the only `Math.` in this diff is none.

---

### Step 2: The button

**File:** `components/ui/CopyAdminLinkButton.tsx` — new file

**Change:** An icon-only control that mints the absolute admin link for one pointer and writes it to
the clipboard, with a selectable read-only field as the one fallback.

Two things from `ShareButton` are carried over and cited in the header: the **fallback rung** (the
URL in a read-only, selectable field when the clipboard refuses — nobody ever gets nothing), and the
2000 ms tick plus the `role="status" aria-live="polite" sr-only` region, which exists because
swapping an unfocused button's `aria-label` is not reliably announced.

Two things are deliberately **not** carried over, and for the same underlying reason:

- **The `navigator.share` rung.** The runner ruled on it directly — *"yes, clipboard-only, no share
  sheet"* — so a tap goes straight to `navigator.clipboard.writeText`. `AbortError` goes with it:
  with no sheet to dismiss, there is no dismissal to stay silent about.
- **The `pointerdown` warming.** That machinery exists in `ShareButton` solely because its link needs
  a Server Action round trip to mint, which cannot survive Safari's transient-activation window
  across an `await`. Here the problem is absent twice over: the link is a pure string computed in
  render, and **no gesture-sensitive API is called at all** — `navigator.clipboard.writeText` has no
  transient-activation requirement, which is exactly why `ShareButton` uses it as the rung that
  always works.

**Code:**

```tsx
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
```

**Impact:** A new exported component with no mount point until phase 4. It imports
`@/lib/admin/albumDeepLink`, which `components/admin/explorer/SearchResultsGrid.tsx:8` — a
`'use client'` module — already imports, so the client-safety of that module is established
precedent rather than a new claim. No `server-only`, no env name, no `NEXT_PUBLIC_`, no email
literal: `ci:client-secret-guard` has nothing to find. Every JSX comment block above uses a leading
`*` on each continuation line, which is that guard's documented requirement on prose.

---

### Step 3: The component test

**File:** `components/ui/CopyAdminLinkButton.test.tsx` — new file

**Change:** Pin the clipboard write, the **never-shares** regression, the fallback rung, the
refusal, the tick's clock and the live region — in the harness
`components/share/ShareButton.test.tsx` established for exactly this shape of component.

Harness notes, all of them measured hazards in this repo:

- `// @vitest-environment happy-dom` on line 1. `vitest.config.ts` is `environment: 'node'` and
  includes `components/**/*.test.tsx`; the pragma is per-file and mandatory.
- `vi.mock` of `@/lib/admin/albumDeepLink` via `vi.hoisted`. The minter is phase 1's, with its own
  unit suite over all three kinds; everything under test here is this button's contract *about* it
  — which arguments it passes, and that a `null` renders nothing. Mocking also means a change to
  phase 1's URL text never falsely reds this file.
- **`mockReset()` per mock in `beforeEach`, never `clearAllMocks`.** A failed test's unconsumed
  `mockResolvedValueOnce` ghosts into the next test otherwise.
- **`fireEvent` + `act`, never `userEvent`** — `userEvent` hangs under `vi.useFakeTimers()`, and one
  test here needs fake timers.
- The file's own `afterEach` deletes the `navigator.share`/`navigator.clipboard` own-properties and
  calls `vi.useRealTimers()`. `afterEach` hooks run in REVERSE registration order, so this one runs
  *before* `tests/support/setup.ts`'s `cleanup()` — which is what makes the unmount happen under
  real timers rather than fake ones. **`share` stays in that teardown even though the component
  never calls it**: the "never shares" regression test below has to install a `navigator.share` in
  order to prove the component ignores one, and a leaked own-property would hand it to every later
  file in the same worker.
- Every test flushes its in-flight promise with the `click()` helper's two `act` passes before
  ending. A pending action crossing `cleanup()` poisons the next mount.

**Code:**

```tsx
// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { adminPhotoLink } = vi.hoisted(() => ({ adminPhotoLink: vi.fn() }))
/*
 * Phase 1 owns the URL grammar and proves all three kinds in `lib/admin/albumDeepLink.test.ts`.
 * What is under test HERE is the button's contract about that function: the arguments it passes,
 * and that a refusal renders no control at all rather than a dead one.
 */
vi.mock('@/lib/admin/albumDeepLink', () => ({ adminPhotoLink }))

import {
  COPY_ADMIN_LINK_DONE,
  COPY_ADMIN_LINK_FAILED,
  COPY_ADMIN_LINK_FIELD,
  COPY_ADMIN_LINK_LABEL,
  CopyAdminLinkButton,
} from './CopyAdminLinkButton'

import type { PhotoPointer } from '@/lib/photos/pointer'

/**
 * The icon-only copy-admin-link control. **Clipboard only, by the runner's own ruling** — a tap
 * writes `navigator.clipboard.writeText` and nothing else, and the one fallback is the link on
 * screen in a selectable field when the clipboard refuses. The tick and the `role="status"` region
 * are the only two things on screen that say a copy happened.
 *
 * The tests pin both rungs, the refusal, the fact that it is icon-only — and, explicitly, that
 * `navigator.share` is NEVER called even on a platform that has it. That last one is a regression
 * test for a decision, not a description of an accident: the first draft of this component opened a
 * share sheet first, and the whole point of the ruling is that it no longer may.
 */

const IMAGE_POINTER: PhotoPointer = { kind: 'image', id: 'Rm2NGabc1234' }
const SHOT_POINTER: PhotoPointer = { kind: 'shot', id: 'Sh0tIdaaaaaa' }
const ORIGIN = 'https://runins.site'
const LINK = 'https://runins.site/admin/nina?view=media&image=Rm2NGabc1234'

const clipboardWrite = vi.fn()

/**
 * A working `navigator.share`, installed for EVERY test in this file.
 *
 * happy-dom ships none of its own, so a "the component never shares" assertion made against a bare
 * environment would be vacuous — it would pass on a component that calls `navigator.share` eagerly,
 * simply because there was nothing there to call. Installing one everywhere means every case below
 * runs on a share-capable platform (an iPhone, which is the device R1 describes) and the clipboard
 * is reached because the component chose it, not because the alternative was missing.
 */
const navigatorShare = vi.fn()

function copyButton() {
  return screen.getByRole('button', {
    name: new RegExp(`^(${COPY_ADMIN_LINK_LABEL}|${COPY_ADMIN_LINK_DONE})$`),
  })
}

async function click() {
  fireEvent.click(copyButton())
  await act(async () => {})
  await act(async () => {})
}

function renderButton(pointer: PhotoPointer = IMAGE_POINTER, origin: string = ORIGIN) {
  return render(<CopyAdminLinkButton pointer={pointer} origin={origin} />)
}

beforeEach(() => {
  // mockReset and not clearAllMocks: a failed test's unconsumed `…Once` queue would otherwise
  // ghost into the next one.
  adminPhotoLink.mockReset()
  clipboardWrite.mockReset()
  navigatorShare.mockReset()
  adminPhotoLink.mockReturnValue(LINK)
  // The happy default. A test that wants the fallback rung overrides it with mockRejectedValue.
  clipboardWrite.mockResolvedValue(undefined)
  navigatorShare.mockResolvedValue(undefined)
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: clipboardWrite },
    configurable: true,
  })
  Object.defineProperty(window.navigator, 'share', {
    value: navigatorShare,
    configurable: true,
  })
})

afterEach(() => {
  delete (window.navigator as { share?: unknown }).share
  delete (window.navigator as { clipboard?: unknown }).clipboard
  vi.useRealTimers()
})

describe('CopyAdminLinkButton — the control itself', () => {
  it('is ICON ONLY: the verb lives in aria-label and title, and the glyph is hidden', () => {
    renderButton()

    const button = copyButton()
    expect(button).toHaveAttribute('aria-label', COPY_ADMIN_LINK_LABEL)
    expect(button).toHaveAttribute('title', COPY_ADMIN_LINK_LABEL)
    // No text node at all — R1 asked for an icon, and the header row has no width for a word.
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('mints the link from the pointer and the threaded origin — kind, id, origin, in that order', () => {
    renderButton()

    expect(adminPhotoLink).toHaveBeenCalledWith('image', 'Rm2NGabc1234', ORIGIN)
  })

  it('an avatar pointer mints through the album arm with the SAME call shape', () => {
    renderButton({ kind: 'avatar', id: 'Av4tarbbbbbb' })

    expect(adminPhotoLink).toHaveBeenCalledWith('avatar', 'Av4tarbbbbbb', ORIGIN)
  })

  it('a REFUSED kind renders nothing at all — never a dead button', () => {
    // `/admin/nina` holds no `run_photos`, so phase 1's minter answers null for 'shot'. A control
    // that copies a URL resolving to nothing is worse than no control.
    adminPhotoLink.mockReturnValue(null)
    const { container } = renderButton(SHOT_POINTER)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('CopyAdminLinkButton — clipboard only', () => {
  it('a tap writes the minted link to the clipboard, and says so twice', async () => {
    renderButton()

    await click()

    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_DONE)
    expect(screen.getByRole('status')).toHaveTextContent(COPY_ADMIN_LINK_DONE)
  })

  it('NEVER calls navigator.share, even on a platform that has one', async () => {
    /*
     * The regression test for the ruling, stated as a rule rather than observed as a side effect.
     * `beforeEach` installs a working `navigator.share`, so this is the iPhone case — the device
     * R1 describes, and the one where a share-first ladder would have meant the plain copy this
     * button is named after never ran at all. The runner's words: "yes, clipboard-only, no share
     * sheet".
     */
    renderButton()

    await click()

    expect(navigatorShare).not.toHaveBeenCalled()
    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
  })

  it('still copies when the platform has NO share API — the behaviour does not depend on one', async () => {
    // Deleting the own property restores what happy-dom has, which is nothing — a desktop browser
    // without the API. Same path, same single clipboard write, same tick.
    delete (window.navigator as { share?: unknown }).share
    renderButton()

    await click()

    expect(clipboardWrite).toHaveBeenCalledWith(LINK)
    expect(screen.getByRole('status')).toHaveTextContent(COPY_ADMIN_LINK_DONE)
  })

  it('while in flight it disables itself and announces busy — then comes back', async () => {
    let resolve!: () => void
    // The clipboard write is what is held open now: it is the only awaited call in the handler.
    clipboardWrite.mockReturnValue(new Promise<void>((res) => (resolve = res)))
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})

    expect(copyButton()).toBeDisabled()
    expect(copyButton()).toHaveAttribute('aria-busy', 'true')

    await act(async () => {
      resolve()
    })
    await act(async () => {})

    expect(copyButton()).toBeEnabled()
    expect(copyButton()).toHaveAttribute('aria-busy', 'false')
  })

  it('the tick expires after two seconds so the header reads as a copy button again', async () => {
    vi.useFakeTimers()
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})
    await act(async () => {})
    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_DONE)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(copyButton()).toHaveAttribute('aria-label', COPY_ADMIN_LINK_LABEL)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('CopyAdminLinkButton — the one fallback: the link on screen', () => {
  it('a refused clipboard puts the link in a read-only, selectable field', async () => {
    clipboardWrite.mockRejectedValue(new Error('insecure context'))
    renderButton()

    await click()

    expect(screen.getByText(COPY_ADMIN_LINK_FAILED)).toBeInTheDocument()
    const field = screen.getByLabelText(COPY_ADMIN_LINK_FIELD)
    expect(field).toHaveValue(LINK)
    // readOnly, never disabled: a disabled input cannot be selected, which would defeat the point.
    expect(field).toHaveAttribute('readonly')
    expect(field).not.toBeDisabled()
  })

  it('the fallback does NOT expire — it is a link being selected by hand', async () => {
    vi.useFakeTimers()
    clipboardWrite.mockRejectedValue(new Error('insecure context'))
    renderButton()

    fireEvent.click(copyButton())
    await act(async () => {})
    await act(async () => {})

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(screen.getByLabelText(COPY_ADMIN_LINK_FIELD)).toHaveValue(LINK)
  })
})
```

**Impact:** Eleven cases, no network, no database, no real clipboard and no real share sheet. The
`vi.mock` of `@/lib/admin/albumDeepLink` is a module mock, not a path mock, so it resolves through
the same `@` alias `vitest.config.ts` defines. **This file's imports are also what keep
`npm run knip` clean** — knip treats `components/**/*.test.tsx` as entry files via the vitest
plugin, so the import block above is what marks `CopyAdminLinkButton.tsx` reachable and all five of
its exports used before phase 4 adds a production importer. It imports every one of
`COPY_ADMIN_LINK_LABEL`, `COPY_ADMIN_LINK_DONE`, `COPY_ADMIN_LINK_FAILED`, `COPY_ADMIN_LINK_FIELD`
and `CopyAdminLinkButton`; that set did not change when the share rung was deleted (none of the four
constants was about the share sheet), so the knip baseline in `## Verification` still holds
unamended.

---

### Step 4: The `PhotoViewer` half

**File:** `components/ui/PhotoViewer.test.tsx:260` — three cases appended **inside** the existing
`describe('the header action slot', …)` block (`:210-260`), after the
`'absent renders nothing — the review surfaces keep the header they have always drawn'` case, which
stays byte-identical.

**Change:** Prove the three properties phase 4 depends on: the pointer reaches `headerAction` on the
photograph actually on screen; it is a *separate* handle from `id`, which still means the turn; and a
photo without one hands `undefined` and still renders exactly the header the review surfaces ship.

The file imports `type { ViewerPhoto }` already (`:6`); this adds one more type import.

**Code:** add to the import block at the top of the file, after line 6:

```tsx
import type { PhotoPointer } from '@/lib/photos/pointer'
```

and append these three cases before the closing `})` of `describe('the header action slot', …)`:

```tsx
    it('hands headerAction the row pointer — the table AND the id — of the photo on screen', () => {
      const seen: (PhotoPointer | undefined)[] = []
      renderViewer({
        index: 1,
        photos: [
          {
            url: 'blob:photo-a',
            kind: 'avatar',
            label: 'One',
            rowPointer: { kind: 'avatar', id: 'row-a' },
          },
          {
            url: 'blob:photo-b',
            kind: 'generated',
            label: 'Two',
            rowPointer: { kind: 'image', id: 'row-b' },
          },
        ],
        headerAction: (photo) => {
          seen.push(photo.rowPointer)
          return null
        },
      })

      expect(seen).toContainEqual({ kind: 'image', id: 'row-b' })
      expect(seen).not.toContainEqual({ kind: 'avatar', id: 'row-a' })
    })

    it('rowPointer is a SEPARATE handle from id, which still means the turn (job) id', () => {
      // Invariant 3 of the plan set, as a test. On both Nina surfaces `id` is the image-generation
      // turn id and goes to `ninaJobHref`; the photograph's own row lives in a different table
      // under a different id. One field carrying both would point the job-detail link at
      // /nina/jobs/<a nina_message_images id> — on two screens at once, and still compiling.
      // An ARRAY and not a `let x: ViewerPhoto | null = null`: TypeScript's control-flow analysis
      // cannot see that a callback ran, so it narrows such a binding to `null` and every property
      // read after the assertion is a compile error. `npm test` would never notice — it does not
      // typecheck — but `npm run typecheck` would.
      const captured: ViewerPhoto[] = []
      renderViewer({
        photos: [
          {
            url: 'blob:photo-a',
            kind: 'generated',
            label: 'One',
            id: 'turn-111',
            rowPointer: { kind: 'image', id: 'row-222' },
          },
        ],
        headerAction: (photo) => {
          captured.push(photo)
          return null
        },
      })

      expect(captured).toHaveLength(1)
      expect(captured[0]!.id).toBe('turn-111')
      expect(captured[0]!.rowPointer).toEqual({ kind: 'image', id: 'row-222' })
    })

    it('a photo with no rowPointer hands undefined, and the header is the one the review surfaces ship', () => {
      // `ReviewPhoto` is {url, kind, width, height} and assigns to ViewerPhoto with no adapter, so
      // ScreenshotStrip, SheetSource and PhotoInclusionList never set this field. Absent must stay
      // absent, and must stay silent.
      const seen: (PhotoPointer | undefined)[] = []
      renderViewer({
        photos: [PHOTOS[0]!],
        headerAction: (photo) => {
          seen.push(photo.rowPointer)
          return null
        },
      })

      expect(seen).toEqual([undefined])
      // The close button is still the only control in the DOM: one photo, so no dot row, and a
      // headerAction returning null adds nothing.
      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
    })
```

**Impact:** Three added cases, nothing removed or reworded. The existing
`'renders the caller’s control beside Close, and hands it the photo on screen'` and
`'follows the paging…'` cases keep using `id` and keep passing — which is itself the proof that
`id`'s meaning did not move.

---

## Verification

**Build:** `npm run typecheck` (this is the real gate; `vitest` does not typecheck), then
`npm run build`.

**Tests:**

```
npx vitest run components/ui/CopyAdminLinkButton.test.tsx
npx vitest run components/ui/PhotoViewer.test.tsx
npx vitest run tests/ui.photoViewer.test.ts
npm test
```

`tests/ui.photoViewer.test.ts` is the one to run *before* believing the `PhotoViewer.tsx` edit: it
is a frozen-surface source scan over that file and its callers, and the single most likely way this
phase breaks something it does not own.

**Guards and format:**

```
npm run format:check && npm run lint
npm run ci:f08-guard && npm run ci:client-secret-guard
npm run knip
```

`ci:client-secret-guard` scans `app/ lib/ components/` for secret names, raw `process.env.<SECRET>`
reads and any `NEXT_PUBLIC_`. This diff contains none of the three. Its documented trap is prose:
every JSX comment block in Step 2 carries a leading `*` on each continuation line, which is what
`app/admin/nina/page.tsx:265-276` records as the requirement.

**knip, measured.** Run on this worktree at base (`origin/main` @ `5b51454`) the baseline is
**3 unused files** (`scripts/album-search-probe.mjs`, `scripts/photoshop.ts`,
`scripts/pull-photoshop-job.mjs`), **27 unused exports**, **10 unused exported types**. After this
phase those three counts must be **unchanged**. A brand-new exported component with no production
importer would normally land in "unused files", and knip's vitest plugin is what prevents it: it
treats `components/**/*.test.tsx` as entry files, so Step 3's import marks both the file and its
five exports used. **If knip does flag it anyway, the fix is a `/** @public *\/` tag on the symbol
itself, never a `knip.ts` ignore entry** — `knip.ts`'s header is explicit that everything it reports
is triaged backlog, and that the two standing exceptions are documented at their symbols.

**Manual check:** none available in this phase — the button has no mount point until phase 4, and
`/admin/nina` cannot be served from a preview deployment at all (`ADMIN_EMAILS` is Production-scope
only). The end-to-end check is phase 4's, local with `ADMIN_EMAILS` supplied by hand, or on
production.

**Exit criteria:**

1. `ViewerPhoto` has an optional `rowPointer: PhotoPointer`, documented in the voice of its
   neighbours, and `ViewerPhoto.id` still means the turn id — proven by Step 4's second case and by
   the two pre-existing `headerAction` cases still passing untouched.
2. `components/ui/CopyAdminLinkButton.tsx` exports a component taking `{ pointer, origin }`, renders
   a single icon-only 44 px button with an Indonesian `aria-label`/`title` and no text node, and
   renders **nothing** when `adminPhotoLink` refuses the kind.
3. **A tap writes the clipboard and only the clipboard.** `navigator.share` is not called even when
   the platform has one — pinned by a named regression test — and the single fallback is the URL in
   a read-only selectable field when `writeText` rejects. The 2000 ms tick and the `role="status"`
   live region both say `COPY_ADMIN_LINK_DONE`.
4. `components/review/ScreenshotStrip.tsx`, `components/share/PhotoInclusionList.tsx` and
   `app/(public)/s/[token]/page.tsx` are not in the diff, and `tests/ui.photoViewer.test.ts` is
   green unmodified.
5. Every gate above is green and knip's three counts are unchanged.

## Handoffs

- **The four exported constants are the contract, not decoration.** `COPY_ADMIN_LINK_LABEL`,
  `COPY_ADMIN_LINK_DONE`, `COPY_ADMIN_LINK_FAILED` and `COPY_ADMIN_LINK_FIELD` must stay exported:
  phase 4's `components/nina/ChatScreen.test.tsx` and `components/nina/NinaAboutScreen.test.tsx` both
  `import { COPY_ADMIN_LINK_LABEL } from '@/components/ui/CopyAdminLinkButton'` to query the mounted
  header by its accessible name, rather than re-spelling the Indonesian literal. Un-exporting any of
  them, or changing a string without changing nothing else, reds phase 4.
- **Mounting the button (R1's visible half, R3, R4) — Phase 4.** Nothing imports
  `CopyAdminLinkButton` at the end of this phase. Phase 4 mounts it through `headerAction` on four
  surfaces, makes the two existing `headerAction`s a *cluster* (the new button beside the job link),
  and threads the nullable admin origin. **The exact interface it builds against is the
  `## Interface Contract` above** — `rowPointer`, `CopyAdminLinkButton`, `{ pointer, origin }`.
- **Populating `rowPointer` — Phase 4.** `lib/nina/chatphotos.ts` has the `nina_message_images` row
  id as `ChatSessionPhoto.attachId` (`:163`) and currently drops it on the way to the viewer;
  `NinaAboutScreen`'s `albumViewer` (`:366`) and `galleryViewer` (`:371`) mappers both drop their
  rows' ids too. This phase adds the field and does not fill it anywhere.
- **The admin gate (R4) — Phase 4.** This component takes a required non-null `origin` and asks
  nothing about who is looking, on purpose. The `server-only` resolver, `getAdminIdentity()`, and
  the invariant-7 "an unconfigured `ADMIN_EMAILS` must answer *not an admin* rather than throw"
  problem are all phase 4's.
- **`components/ui/index.ts`** was deliberately not touched. If a later phase wants
  `CopyAdminLinkButton` through the barrel, that is a barrel change with its own reasoning; today
  `PhotoViewer` is imported by path and this follows it.
- **`components/ui/.workflows/package_readme.md`**, if one exists, is not updated here — the
  completion handler's readme pass owns that, and the component's shape is not final until phase 4
  has a call site.

## Rollback

This phase alone:

```
git checkout -- components/ui/PhotoViewer.tsx components/ui/PhotoViewer.test.tsx
rm -f components/ui/CopyAdminLinkButton.tsx components/ui/CopyAdminLinkButton.test.tsx
```

or `git revert` the phase's commit. Nothing imports either new file and nothing reads `rowPointer`,
so the revert is complete on its own — no other phase's landed work depends on this one except
phase 4, which cannot have landed first. No database write, no blob write, no env change, no
migration.

## Decisions taken in this phase

- **Share sheet vs. clipboard-only — RESOLVED, clipboard-only.** An earlier draft of this file
  followed the plan index's original share → clipboard → field ladder and flagged the tension with
  the requirement's literal words. The runner was asked and answered verbatim: *"yes, clipboard-only,
  no share sheet"*. Rung 5, the user's own input; it overrides the index's phase-3 exit criteria,
  which the coordinator is correcting in the same pass. `navigator.share` is not called at all, and
  `'NEVER calls navigator.share, even on a platform that has one'` is a named regression test rather
  than an incidental property. **Do not reintroduce the share rung** without a new ruling from the
  runner.

## Risks
- **Phase 1's `adminPhotoLink` must return `null`, not throw.** Verified against its written plan;
  if the implementation drifts to a throw, this component must wrap the `useMemo` body in a
  `try/catch`, because an exception in render blanks the whole overlay.
- **The `4.25rem` fallback offset is coupled to `PhotoViewer`'s header padding** and Tailwind cannot
  read a constant. Documented at the literal, the way `PhotoViewer` documents its own `3.25rem`. It
  only shows on the clipboard-refused rung, which is rare — but it is also the rung nobody tests by
  hand.
