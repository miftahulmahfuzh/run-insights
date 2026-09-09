import { ImageGenPanel } from '@/components/admin/ImageGenPanel'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  toImageGenDraft,
  toImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { buildNinaImagePrompt } from '@/lib/nina/imagegen'
import { NINA_IMAGE_PREFS_DEFAULTS } from '@/lib/nina/imageprefs'
import { listNinaPhotoReferences, readNinaImagePrefs, readNinaTuning } from '@/lib/nina/queries'

/**
 * `/admin/image-generation` — R2 of this set, in the user's own words: *"we need to change image
 * generation prompt. in fact: make a new tab in admin: Image Generation."*
 *
 * ── WHY A ROUTE, AND WHY A FLAT SIBLING ─────────────────────────────────────────────────────
 * `/admin` has no in-page tab component anywhere. What it has is `components/admin/AdminNav.tsx`,
 * whose cells are the admin counterpart of the runner's tab bar — so "a new tab in admin" is a
 * SIXTH NAV CELL and a sixth route, and this file is it. Flat, like the other five, and named for
 * the thing it configures rather than nested under `/admin/nina`: the album is `nina_avatars` and
 * this page is not about a photograph, it is about how the next one is made.
 *
 * It sits beside `/admin/personality` in the nav on purpose. Those two are the configuration
 * surfaces — who she is, and how she is photographed — and phase 7 moves the Wardrobe field from
 * one to the other, which is a move nobody can find if the two tabs are at opposite ends of a bar.
 *
 * ── THE GATE IS HERE, AS IT IS ON EVERY SIBLING ─────────────────────────────────────────────
 * `requireAdmin()` is the FIRST statement, above every read. `proxy.ts` matches neither `/admin`
 * nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's and each
 * action's are the only gates on this route — a new segment under `/admin` inherits no matcher
 * change and needs none. Plan invariant 6, and `tests/admin.imagegen.test.ts` asserts the ordering
 * on this file structurally.
 *
 * ── `force-dynamic`, AND WHY IT IS NOT ABOUT `searchParams` ─────────────────────────────────
 * This page reads no `searchParams` and therefore takes no props — the shape `app/admin/page.tsx`
 * and `app/admin/personality/page.tsx` both already have. Verified against this repo's own Next
 * (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md:96-99` is where
 * `'auto' | 'force-dynamic' | 'error' | 'force-static'` is defined, and `'auto'` caches as much as
 * it can.
 *
 * The reason it is declared is the sibling pages' reason verbatim: these prefs are per-request
 * state that must reflect the action that just ran, and `revalidatePath('/admin/image-generation')`
 * in both actions is what makes that immediate. `requireAdmin()` awaits `auth()`, which reads a
 * cookie and would opt this route in implicitly — but a route's caching decided by the internals
 * of a module three levels down is a route that loses it the day that module is refactored.
 *
 * ── THE PREVIEW IS A PURE FUNCTION, WHICH IS WHAT MAKES IT LEGAL HERE ───────────────────────
 * `buildNinaImagePrompt(...)` assembles a string. It is not a model call, it awaits nothing, and it
 * is the SAME function `lib/nina/selfiegen.ts` uses to build the prompt the camera is handed —
 * which is the whole value of the preview: what the panel shows is what the provider gets, not a
 * reconstruction of it. Plan invariant 5 / `ci:llm-payload-guard` Rule 2 forbids awaiting a MODEL
 * CALL from a page render, by function name; nothing on this page appears in that table and
 * nothing on this page may.
 *
 * ── WHY THE TUNING IS READ HERE TOO ─────────────────────────────────────────────────────────
 * The prompt is not assembled from the prefs alone. `ninaPhotoPresence` still reads `steamy` and
 * `flirty` off `NinaTuning` (`lib/nina/imagegen.ts:93`), so a preview built with the prefs and no
 * tuning would be a preview missing a paragraph the real path has. Three indexed reads of three
 * rows, in one `Promise.all` so they do not run in sequence.
 *
 * ── AND WHY `maxDuration` NOW SITS BESIDE IT ────────────────────────────────────────────────
 * Phase 4 deliberately left it off: this page's own render awaits nothing longer than three
 * indexed reads. Phase 6 added it, because the segment now hosts `runNinaImageTestAction` — see
 * that export's own note below.
 */

export const dynamic = 'force-dynamic'

/**
 * **300, and it must be a literal.** Segment config exports are statically analysed at build time,
 * so `export const maxDuration = NINA_HOST_MAX_DURATION_MS / 1000` is not a value the analyser can
 * see — it would compile, ship, and leave this route on the platform default. `app/nina/page.tsx`
 * and `app/api/cron/nina/route.ts` spell the same number the same way for the same reason.
 *
 * ── WHY A FORM PAGE NEEDS A FIVE-MINUTE CEILING ──────────────────────────────────────────────
 * `runNinaImageTestAction` calls `fireNinaImageGeneration`, which schedules the generation in
 * `after()` — and `after()` inherits the ROUTE SEGMENT's `maxDuration`, not the action's own
 * wishes. A Server Action POSTed to this segment therefore runs the generation under this number.
 * At the platform default the call would be killed mid-flight, the row would be left `running`,
 * and the operator would be told "timeout" about a prompt the provider never finished looking at
 * — the one wrong answer this feature exists to avoid.
 *
 * 300 is `NINA_HOST_MAX_DURATION_MS`, and the threshold chain (plan invariant 3) is what fixes it:
 * `NINA_TURN_SPENT_MS (45) + phase 3's anchored call ceiling (220) +
 * NINA_IMAGE_FINISH_RESERVE_MS (20) = 285 <= 300`.
 *
 * `app/nina/jobs/page.tsx` is the precedent line for line — it carries this export for the
 * identical reason (`NinaJobActions` calls `redoNinaImageJob`, which registers a generation in
 * `after()`), and `lib/nina/imagerun.ts` predicted this one: *"`app/nina/page.tsx` and
 * `app/api/cron/nina/route.ts` are the two segments that can start a generation, and a third
 * caller would need the same line."* `/nina/jobs` was the third. **This is the fourth, and the
 * first under `/admin` — no other `/admin/*` route declares `maxDuration` today.**
 *
 * It is declared BESIDE `dynamic`, not instead of it: they answer different questions, and the
 * pair is what `app/nina/jobs/page.tsx` ships.
 */
export const maxDuration = 300

export default async function AdminImageGenerationPage() {
  const { userId } = await requireAdmin()

  /* `listNinaPhotoReferences` returns a `NinaPhotoRefPage` — `{ rows, total, offset, limit }` —
   * not an array. `total` counts BOTH sets and is what phase 5's footer needs to say "Showing 48 of
   * 142" truthfully, so it is threaded to the panel as its own prop. */
  const [prefs, tuning, referencePage] = await Promise.all([
    readNinaImagePrefs(userId),
    readNinaTuning(userId),
    listNinaPhotoReferences(userId),
  ])

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Image generation</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          What she looks like in a photograph, not who she is. How much detail to spend, what to
          emphasise, what she is wearing, where she is and when. Her character stayed on the
          Personality tab; this page is the row every image prompt is assembled from.
        </p>
      </header>

      {/*
       * The prefs cross to the client as a plain `ImageGenDraft` and the reference rows as plain
       * `ImageReferenceOption`s — `toImageGenDraft` and `toImageReferenceOption` are the only two
       * places on the read side that know phase 1's field names, so no drizzle row shape and no Zod
       * schema reaches a component (plan invariant 9).
       *
       * `promptPreview` is a pure string assembly, never a model call: see the header, and plan
       * invariant 5. `mood` is `null` because a mood is a per-photograph note the operator has no
       * field for, and passing a made-up one would put a word in the preview that no real
       * generation sends.
       *
       * The leading `*` on every line of this comment is the same load-bearing detail both sibling
       * admin pages record: `ci:client-secret-guard` recognises a comment line only when it is
       * trimmed-prefixed by `//`, `*` or `/*`, so a JSX comment with bare prose continuation lines
       * is scanned as code.
       */}
      <ImageGenPanel
        userId={userId}
        prefs={toImageGenDraft(prefs)}
        defaults={toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)}
        promptPreview={buildNinaImagePrompt({
          purpose: 'selfie',
          scene: ADMIN_IMAGE_PREVIEW_SCENE,
          mood: null,
          tuning,
          prefs,
        })}
        references={referencePage.rows.map(toImageReferenceOption)}
        photoTotal={referencePage.total}
      />
    </div>
  )
}
