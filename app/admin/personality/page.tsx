import { CharacterPanel } from '@/components/admin/CharacterPanel'
import { TextModelSelect } from '@/components/admin/TextModelSelect'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { toTuningDraft } from '@/lib/admin/tuningModel'
import { narrativeModel } from '@/lib/llm/textModel'
import { buildNinaSystemPrompt } from '@/lib/nina/prompts'
import { readNinaTuning } from '@/lib/nina/queries'
import { NINA_TUNING_DEFAULTS } from '@/lib/nina/tuning'

/**
 * `/admin/personality` — R1 of this set, in the user's own words: *"right now, 'Her character' is
 * in Nina's album. move it as a new tab with name: Personality."*
 *
 * ── WHY A ROUTE, AND WHY A FLAT SIBLING OF THE ALBUM ────────────────────────────────────────
 * `/admin` has no in-page tab component anywhere. What it has is `components/admin/AdminNav.tsx`,
 * whose own docstring calls its cells the admin counterpart of `components/ui/TabBar.tsx` — so "a
 * new tab" beside the album tab is a fifth NAV CELL and a fifth route, and this file is it.
 *
 * It is `/admin/personality` and not `/admin/nina/personality` because the user asked for the
 * panel to LEAVE the album; nesting it under the album's segment would leave it inside the thing
 * it was moved out of. The nav's other four entries are flat and this one joins them.
 *
 * ── WHAT THIS PAGE IS NOT ───────────────────────────────────────────────────────────────────
 * It is not a second copy of the panel. `components/admin/CharacterPanel.tsx` has exactly one
 * mount site in this repo and this is it; `app/admin/nina/page.tsx` no longer imports it, no
 * longer reads `readNinaTuning`, and is the album alone.
 *
 * ── THE GATE IS HERE, AS IT IS ON EVERY SIBLING ─────────────────────────────────────────────
 * `requireAdmin()` is the FIRST statement, above the read. `proxy.ts` matches neither `/admin` nor
 * `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's and each action's
 * are the only gates on this route — a new segment under `/admin` inherits no matcher change and
 * needs none. `app/admin/layout.tsx:60-70` explains why all three calls exist rather than one, and
 * `tests/admin.tuning.test.ts` asserts the ordering on this file structurally.
 *
 * ── `force-dynamic`, AND WHY IT IS NOT ABOUT `searchParams` ─────────────────────────────────
 * This page reads no `searchParams` and therefore takes no props — the shape `app/admin/page.tsx`
 * already has. Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` states that
 * `searchParams` is the Request-time API that opts a page into dynamic rendering, and
 * `01-app/02-guides/caching-without-cache-components.md` that the default `'auto'` caches as much
 * as it can. Neither is the reason this is declared.
 *
 * The reason is `app/admin/nina/page.tsx`'s, verbatim: the tuning is per-request state that must
 * reflect the action that just ran, and `revalidatePath('/admin/personality')` in the save action
 * is what makes that immediate. `requireAdmin()` awaits `auth()`, which reads a cookie and would opt
 * this route in implicitly — but a route's caching decided by the internals of a module three
 * levels down is a route that loses it the day that module is refactored. It is declared here.
 *
 * ── THE PREVIEW IS A PURE FUNCTION, WHICH IS WHAT MAKES IT LEGAL HERE ───────────────────────
 * `buildNinaSystemPrompt(tuning)` assembles a string. It is not a model call, it awaits nothing,
 * and it is the SAME function `lib/nina/turn.ts` uses to build the system prompt — which is the
 * whole value of the preview: what the panel shows is what she is actually handed, not a
 * reconstruction of it.
 *
 * Plan invariant 5 / `scripts/check-llm-payload-boundary.mjs` Rule 2 forbids awaiting a MODEL CALL
 * from a page render, by function name. Nothing on this page appears in that table and nothing on
 * this page may: the preview is deliberately the pure assembler and never a turn entry point. It
 * shows the SAVED tuning, so it changes when a save changes the row, not as a slider moves.
 *
 * ── ONE READ, SO NO `Promise.all` ───────────────────────────────────────────────────────────
 * On the album page this read joined two others in a `Promise.all` so three round trips did not
 * run in sequence. Here there is one read and a bare `await` is the honest shape; a `Promise.all`
 * over a single promise is a comment pretending to be code.
 */

export const dynamic = 'force-dynamic'

export default async function AdminPersonalityPage() {
  const { userId } = await requireAdmin()

  const tuning = await readNinaTuning(userId)

  /*
   * The EFFECTIVE text model, not the raw stored one: `narrativeModel()` is the same resolver
   * every text call makes, so the dropdown shows what the next turn will actually dial. It is a
   * one-row indexed SELECT, not a model call — `ci:llm-payload-guard`'s table has no entry for it
   * and needs none.
   */
  const textModel = await narrativeModel()

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Personality</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Who she is, not what she looks like. Her relationship to you, every dial and the notes she
          is handed verbatim. Her photographs stayed behind on the Image collection and what she
          wears in them moved to Image Generation; this page is the row her system prompt is
          assembled from.
        </p>
      </header>

      {/*
       * The text model (the 2026-09-10 ask). It sits ABOVE the character panel because it is the
       * wider setting: the panel below configures what she says, this select configures which
       * brain says it — her replies, captions, titles and the insights rollup together. It edits
       * `app_settings`, not the tuning row, which is why it is its own component and its own
       * action file (`lib/admin/textModelActions.ts`) rather than a control on the panel.
       */}
      <TextModelSelect model={textModel} />

      {/*
       * The tuning crosses to the client as a plain `TuningDraft` — `toTuningDraft` is the one
       * place on the read side that knows phase 1's field names, so no part of the row's shape
       * reaches a component. `promptPreview` is a pure string assembly, never a model call: see
       * the header, and plan invariant 5.
       *
       * The leading `*` on every line is the same load-bearing detail the album page's JSX
       * comment records: `ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner
       * recognises, and a JSX comment with bare prose continuation lines fails the guard.
       */}
      <CharacterPanel
        userId={userId}
        tuning={toTuningDraft(tuning)}
        defaults={toTuningDraft(NINA_TUNING_DEFAULTS)}
        promptPreview={buildNinaSystemPrompt(tuning)}
      />
    </div>
  )
}
