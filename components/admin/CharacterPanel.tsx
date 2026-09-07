'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  resetNinaTuningAction,
  saveNinaTuningAction,
  type AdminTuningResult,
} from '@/lib/admin/tuningActions'
import {
  changedTuningFields,
  loudestDials,
  relationshipCopy,
  tuningCopy,
  type TuningDraft,
} from '@/lib/admin/tuningModel'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { cn } from '@/lib/cn'
import {
  NINA_DIALS,
  NINA_NOTES_MAX,
  NINA_RELATIONSHIPS,
  NINA_SCORE_MAX,
  NINA_SCORE_MIN,
  NINA_TRAITS,
  NINA_TUNING_RELATIONSHIP_KEY,
  NINA_WARDROBE_MAX,
} from '@/lib/nina/tuning'

/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials, now on a route of its own.
 *
 * ── WHY THIS IS NO LONGER A DISCLOSURE ──────────────────────────────────────────────────────
 * This file used to open with an argument for being shut: *"the album is the page's working
 * surface and must stay the first thing on it"*, because the panel shared `/admin/nina` with a
 * file manager built for *"hundreds of profile pics"*, and seventeen sliders open by default would
 * have pushed the album below the fold on every visit that was about a photograph.
 *
 * The user repealed the premise — *"right now, 'Her character' is in Nina's album. move it as a
 * new tab with name: Personality"* — and the panel now owns `/admin/personality`
 * (`app/admin/personality/page.tsx`), which it is the whole content of. Nothing shares the page,
 * so nothing has to be pushed below the fold, and the disclosure's only stated justification is
 * gone with the page it was about.
 *
 * `<details open>` would have been the wrong way to keep it, not merely a redundant one: `open`
 * was deliberately never a prop, because passing it would make React control the attribute and
 * fight the user's click, and `revalidatePath` re-renders this component after every save. So the
 * root is a plain `<section>`, and what the `<summary>` carried — the relationship, the loudest
 * dials, how many parameters are off, and the revision — is carried by the section header, where
 * it is the same one-line answer to "what is she set to" that the hub card gives.
 *
 * **`id="character"` survives on that section root**, and it is not decoration: for two plan sets
 * the overview card deep-linked to this panel by that `#character` fragment on the album route.
 * The card now points at `/admin/personality`, and a bookmark someone kept still lands on the
 * panel rather than on a fragment that resolves to nothing. It costs one attribute.
 *
 * The old URL is deliberately not spelled out here: plan invariant 10 greps `app components lib
 * tests docs` for it and must come back empty, so that even a mention in a comment cannot be
 * mistaken for a live reference.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `MemorySlots.tsx` states the reason and it is unchanged here: phase 15's album manager set the
 * plain-argument + result-object convention on the sibling admin page, and a desktop-only tool
 * gains nothing from progressive enhancement that it does not lose in consistency. Validation is
 * Zod on the server for every field, either way.
 *
 * ── ONE SAVE ────────────────────────────────────────────────────────────────────────────────
 * Every control edits a local draft; nothing writes on change. One button sends the whole tuning
 * (plan invariant 11) — Next dispatches actions one at a time per client, so seventeen dials as
 * seventeen actions would stall behind each other.
 *
 * ── THE TOGGLES ARE PART OF THE SAME ONE SAVE (R4) ──────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate."* Each checkbox edits `draft.enabled[key]` and nothing else; the same button sends
 * the whole map with the scores. Seventeen toggles as seventeen actions is the same stall the
 * seventeen dials would have been, and for the same reason: Next dispatches Server Actions one at a time per
 * client.
 *
 * The score is NOT reset when a parameter is switched off, and that is the feature: the operator
 * parks `flirty` at 80, excludes it from tonight's prompt, and gets the 80 back with one click. A
 * toggle that cleared the number would just be a slower way of dragging it to the default.
 *
 * ── EVERY WORD BESIDE A CONTROL COMES FROM `lib/nina/tuning.ts` ─────────────────────────────
 * Labels, hints and the address words are `tuningCopy` / `relationshipCopy`, which read phase 1's
 * specs. There is no copy table in this package, so the panel cannot promise a behaviour the
 * prompt does not produce. It is also what keeps one specific promise off the page: phase 2's
 * `ANGER_CEILING_BY_BAND.off` is **4**, so there is no setting that means "she never gets angry",
 * and anger's hint is phase 1's own *"at 0 the ladder is untouched"* rather than an off switch.
 *
 * ── WHAT THIS FILE MAY NOT IMPORT ───────────────────────────────────────────────────────────
 * Nothing `server-only`, and nothing that reaches drizzle or `lib/env.ts`. `lib/nina/tuning.ts` is
 * guaranteed client-importable by phase 1 (types and plain data only, zero imports of its own) and
 * is imported directly for the key arrays and the two length bounds; the VALUES arrive as a plain
 * `TuningDraft` the page mapped, so no part of phase 1's row shape crosses the serialization
 * boundary. `tests/admin.tuning.test.ts` asserts both.
 */

export interface CharacterPanelProps {
  userId: string
  /** The tuning as the row holds it right now — the baseline for "unsaved". */
  tuning: TuningDraft
  /** `NINA_TUNING_DEFAULTS`, mapped — the baseline for "no longer the Nina who shipped". */
  defaults: TuningDraft
  revision: number
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The preview's own summary
   * line — the one `<details>` this panel still has — says which revision it is showing.
   */
  promptPreview: string
}

export function CharacterPanel({
  userId,
  tuning,
  defaults,
  revision,
  promptPreview,
}: CharacterPanelProps) {
  const [draft, setDraft] = React.useState<TuningDraft>(tuning)
  const [result, setResult] = React.useState<AdminTuningResult | null>(null)
  const [confirmingReset, setConfirmingReset] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical row after every action, so the draft follows the prop
  // rather than diverging from it — a stale slider next to "saved as revision 5" is how a second
  // save writes the pre-canonical value back.
  //
  // Keyed on `revision` and not on the object: the prop is a fresh object on every render, so an
  // identity comparison would reset the draft on any unrelated re-render and throw away the
  // operator's keystrokes. The revision changes exactly when the row does.
  //
  // Adjusted DURING RENDER rather than in an effect, which is React's own recipe for "some state
  // derives from a prop" and the reason `MemorySlots` does it this way: an effect would paint the
  // stale value first, and `react-hooks/set-state-in-effect` rejects it for exactly that.
  const [lastRevision, setLastRevision] = React.useState(revision)
  if (revision !== lastRevision) {
    setLastRevision(revision)
    setDraft(tuning)
    setConfirmingReset(false)
  }

  const unsaved = React.useMemo(() => new Set(changedTuningFields(draft, tuning)), [draft, tuning])
  const dirty = unsaved.size > 0
  const loud = loudestDials(draft, defaults)
  /* How many parameters are excluded from her prompt entirely (R4). It goes in the section header
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length

  function setTrait(key: string, value: number) {
    setDraft((current) => ({ ...current, traits: { ...current.traits, [key]: value } }))
  }

  function setDial(key: string, value: number) {
    setDraft((current) => ({ ...current, dials: { ...current.dials, [key]: value } }))
  }

  /**
   * R4's toggle, into the same local draft as every other control. Nothing writes on change; the
   * one Save button still sends the whole tuning (plan invariant 11).
   */
  function setEnabled(key: string, next: boolean) {
    setDraft((current) => ({ ...current, enabled: { ...current.enabled, [key]: next } }))
  }

  /** Absent means ON, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.enabled[key] ?? true
  }

  /**
   * One control's "unsaved" dot covers BOTH of its paths — the score and the toggle. Two dots on
   * one row would be an operator wondering which of two identical marks meant what, and the answer
   * to "is this row what the database holds" is one boolean.
   */
  function rowUnsaved(path: string, key: string): boolean {
    return unsaved.has(path) || unsaved.has(`enabled.${key}`)
  }

  function run(action: () => Promise<AdminTuningResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <section id="character" className="mb-8 rounded-card border border-rule bg-card px-5">
      {/*
       * The old `<summary>`, minus the affordances a disclosure needed: no `cursor-pointer`, no
       * `list-none`, no `[&::-webkit-details-marker]:hidden`. The CONTENT is unchanged, because it
       * is still the one-line answer to "what is she set to" and it is still worth having above
       * forty controls.
       *
       * `<h2>` and not a `<span>`: the page's `<h1>` is "Personality" and the two sections below
       * are `<h3>`, so this is the level that was missing while the panel lived inside a
       * `<summary>` that was not a heading at all.
       */}
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          Her character
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`} &middot; revision {revision}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every dial below goes into her system prompt.{' '}
          <strong>There is no cache on her turn path</strong>, so a saved row is in her next message
          with no invalidation step, no distillation pass and no deploy. The defaults reproduce the
          Nina who shipped, character for character — a dial you never touch changes nothing about
          her. <strong>Clear a checkbox and that parameter leaves the prompt entirely</strong>,
          whatever it is parked at — the number stays here for when you want it back.
        </p>

        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            {/* `TOUCH_TARGET` for the same reason `DialSlider` wraps its checkbox in `TOUCH_ICON`:
                a bare `size-4` box is 16 px, and the responsive phase's rule is that every
                interactive control in this package is ≥ 44 px on its smaller axis. The label is
                the hit target, so the height goes on the label rather than on the glyph. */}
            <label
              className={cn(
                TOUCH_TARGET,
                'inline-flex cursor-pointer items-center gap-2 align-middle',
              )}
            >
              <input
                type="checkbox"
                checked={isOn(NINA_TUNING_RELATIONSHIP_KEY)}
                disabled={pending}
                aria-label="Include the relationship in her prompt"
                onChange={(event) => setEnabled(NINA_TUNING_RELATIONSHIP_KEY, event.target.checked)}
                className="size-4 shrink-0 accent-accent disabled:opacity-50"
              />
              <span>Relationship</span>
            </label>
            {rowUnsaved('relationship', NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
            {!isOn(NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-medium text-ink-3">
                off — she is the best friend who shipped
              </span>
            )}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {NINA_RELATIONSHIPS.map((value) => {
              const copy = relationshipCopy(value)
              const selected = draft.relationship === value
              return (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-card bg-paper-2 p-3',
                    selected && 'ring-2 ring-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="nina-relationship"
                    value={value}
                    checked={selected}
                    disabled={pending}
                    onChange={() => setDraft((current) => ({ ...current, relationship: value }))}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      {copy.label}
                      {value === defaults.relationship && (
                        <span className="ml-1 text-[11px] font-medium text-ink-3">default</span>
                      )}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-3">{copy.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">Traits</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Twelve dials, 0 to 100.
          </p>
          <div className="grid gap-x-8 xl:grid-cols-2">
            {NINA_TRAITS.map((key) => {
              const copy = tuningCopy(key)
              return (
                <DialSlider
                  key={key}
                  label={copy.label}
                  hint={copy.hint || undefined}
                  value={draft.traits[key] ?? defaults.traits[key] ?? NINA_SCORE_MIN}
                  defaultValue={defaults.traits[key] ?? NINA_SCORE_MIN}
                  min={NINA_SCORE_MIN}
                  max={NINA_SCORE_MAX}
                  disabled={pending}
                  unsaved={rowUnsaved(`traits.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setTrait(key, value)}
                />
              )
            })}
          </div>
        </section>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">The rest of it</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Dials that are not moods: they change what she does, not how she feels.
          </p>
          <div className="grid gap-x-8 xl:grid-cols-2">
            {NINA_DIALS.map((key) => {
              const copy = tuningCopy(key)
              return (
                <DialSlider
                  key={key}
                  label={copy.label}
                  hint={copy.hint || undefined}
                  value={draft.dials[key] ?? defaults.dials[key] ?? NINA_SCORE_MIN}
                  defaultValue={defaults.dials[key] ?? NINA_SCORE_MIN}
                  min={NINA_SCORE_MIN}
                  max={NINA_SCORE_MAX}
                  disabled={pending}
                  unsaved={rowUnsaved(`dials.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setDial(key, value)}
                />
              )
            })}
          </div>
        </section>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Wardrobe
              {unsaved.has('wardrobe') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.wardrobe}
              maxLength={NINA_WARDROBE_MAX}
              disabled={pending}
              placeholder="heather-grey racerback tank, black fitted running shorts"
              onChange={(event) =>
                setDraft((current) => ({ ...current, wardrobe: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing <strong>in the photograph</strong>. This line goes into the image
              prompt, not into her voice. Leave it empty and she wears what the anchor photo shows.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Notes
              {unsaved.has('notes') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
              value={draft.notes}
              maxLength={NINA_NOTES_MAX}
              disabled={pending}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Free text, handed to her verbatim in the system prompt. Anything no dial can say.
            </span>
          </label>
        </div>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled system prompt &middot; revision {revision}
            {dirty && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {result?.ok === false && (
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
        {result?.ok === true && result.note && (
          <p className="mb-3 text-[12px] font-semibold text-accent">{result.note}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={pending || !dirty}
            loading={pending}
            onClick={() =>
              run(() =>
                saveNinaTuningAction({
                  userId,
                  traits: draft.traits,
                  dials: draft.dials,
                  enabled: draft.enabled,
                  relationship: draft.relationship,
                  wardrobe: draft.wardrobe,
                  notes: draft.notes,
                }),
              )
            }
          >
            Save the whole tuning
          </Button>

          <Button
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(tuning)
              setResult(null)
            }}
          >
            Discard changes
          </Button>

          {!confirmingReset && (
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmingReset(true)}
            >
              Reset to defaults
            </Button>
          )}
        </div>

        {confirmingReset && (
          <div className="mt-3 rounded-card border border-rule bg-paper-2 p-3">
            <p className="mb-2 max-w-[70ch] text-[12px] font-medium text-ink-2">
              This writes <strong>every</strong> dial back to its shipping default and bumps the
              revision, so the row records that it happened rather than losing the fact. It is a
              real rollback and not a gesture: the default tuning renders the prompt she shipped
              with.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  run(() => resetNinaTuningAction({ userId }))
                  setConfirmingReset(false)
                }}
              >
                Reset her to the defaults
              </Button>
              <Button variant="ghost" disabled={pending} onClick={() => setConfirmingReset(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
