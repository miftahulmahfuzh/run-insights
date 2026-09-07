'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { ImageGenTestPanel } from '@/components/admin/ImageGenTestPanel'
import { PhotoReferencePicker } from '@/components/admin/PhotoReferencePicker'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  resetNinaImagePrefsAction,
  saveNinaImagePrefsAction,
  type AdminImageGenResult,
} from '@/lib/admin/imageGenActions'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  imageFocusCopy,
  parseReferenceKey,
  promptLengthCopy,
  referenceKey,
  type ImageGenDraft,
  type ImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { cn } from '@/lib/cn'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_TEXT_SPECS,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
} from '@/lib/nina/imageprefs'

/**
 * **How she is photographed** — R2's *"make a new tab in admin: Image Generation"*, and the UI half
 * of R4 through R9.
 *
 * ── WHAT THIS PANEL IS, AND WHAT IT DELIBERATELY IS NOT ─────────────────────────────────────
 * It is the operator's STANDING OPINION about her photographs: how much detail to spend, which of
 * six things to emphasise, what she is wearing, where she is, when it is, and anything else. It is
 * NOT the scene. The scene is still hers per photograph — the chat model's `generate_image`
 * argument — which is why the preview stands one in from `ADMIN_IMAGE_PREVIEW_SCENE` and says so
 * out loud rather than pretending the operator chose it.
 *
 * ── THE BODY CANON IS NOT ON THIS PAGE, AND THAT IS R1 ──────────────────────────────────────
 * *"i care a lot about her voluptuous body: big boobs, bubble butt, big thighs, very long calves.
 * always explicitly instruct these in the prompt."* **Always** is the requirement, so the four body
 * facts are unconditional text in phase 2's subject paragraph and there is no control here that can
 * remove them (plan invariant 4). The six checkboxes below add EMPHASIS on top; clearing all six
 * still yields a prompt naming all four, and the operator can see that in the preview because the
 * preview is the real assembler.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `CharacterPanel.tsx` states the reason and it is unchanged here: the plain-argument +
 * result-object convention on the sibling admin pages, and an operator-only tool gains nothing from
 * progressive enhancement that it does not lose in consistency. Validation is Zod on the server for
 * every field, either way.
 *
 * ── ONE SAVE (PLAN INVARIANT 7) ─────────────────────────────────────────────────────────────
 * A slider, six checkboxes, four text fields and a photograph is eleven controls. Every one of them
 * edits a local draft; nothing writes on change; one button sends the whole object. Next dispatches
 * Server Actions one at a time per client, so eleven actions would stall behind each other.
 *
 * **The photo reference is part of that same one save**, which is why the selection lives in this
 * draft even though phase 4 ships no grid to pick it with. Phase 5's picker is a control that calls
 * `onChange` and nothing else — no action of its own, no schema of its own, no round trip of its
 * own.
 *
 * ── EVERY WORD BESIDE A CONTROL COMES FROM `lib/nina/imageprefs.ts` ─────────────────────────
 * Labels, hints, placeholders and bounds are `imageFocusCopy` / `promptLengthCopy`,
 * `NINA_IMAGE_TEXT_SPECS` and the four `*_MAX` constants, which read phase 1's specs. There is no
 * copy table in this package, so the panel cannot promise an emphasis the prompt does not add —
 * and, specifically, so that the six option names stay the user's own words instead of somebody's
 * clinical synonyms for them.
 *
 * ── WHAT THIS FILE MAY NOT IMPORT ───────────────────────────────────────────────────────────
 * Nothing `server-only`, and nothing that reaches drizzle or `lib/env.ts`. `lib/nina/imageprefs.ts`
 * is guaranteed client-importable by phase 1 (types and plain data only, zero imports of its own);
 * the VALUES arrive as a plain `ImageGenDraft` the page mapped, so no part of phase 1's row shape
 * crosses the serialization boundary (plan invariant 9). `tests/admin.imagegen.test.ts` asserts
 * both.
 */

export interface ImageGenPanelProps {
  userId: string
  /** The prefs as the row holds them right now — the baseline for "unsaved". */
  prefs: ImageGenDraft
  /** `NINA_IMAGE_PREFS_DEFAULTS`, mapped — the baseline for "no longer the shipping default". */
  defaults: ImageGenDraft
  revision: number
  /**
   * `buildNinaImagePrompt(...)`, assembled on the SERVER from the SAVED prefs.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The preview's own summary
   * line says which revision it is showing.
   */
  promptPreview: string
  /**
   * Every photograph the reference grid may offer, newest first, already mapped to a plain
   * serializable shape on the server. Phase 4 renders the count and the selected tile; phase 5
   * renders the grid from the same array.
   *
   * **RECONCILED:** mapped from `listNinaPhotoReferences(userId).rows` with
   * `toImageReferenceOption`, and structurally identical to phase 5's `PhotoReferenceItem`, so
   * phase 5's mount is `items={references}` with no cross-phase import.
   */
  references: ImageReferenceOption[]
  /**
   * How many photographs the union holds **in total**, not just on this page — i.e.
   * `listNinaPhotoReferences(userId).total`.
   *
   * **RECONCILED: this prop is on phase 4's list because phase 5 needs it and phase 5 does not edit
   * this prop list.** Phase 5's footer says *"Showing 48 of 142 (94 older not on this page)"*, which
   * it cannot do from `references.length` alone. Phase 4's own seam placeholder renders it too, so
   * the number is verifiable before the grid exists.
   */
  photoTotal: number
}

export function ImageGenPanel({
  userId,
  prefs,
  defaults,
  revision,
  promptPreview,
  references,
  photoTotal,
}: ImageGenPanelProps) {
  const [draft, setDraft] = React.useState<ImageGenDraft>(prefs)
  const [result, setResult] = React.useState<AdminImageGenResult | null>(null)
  const [confirmingReset, setConfirmingReset] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  // The server re-renders with the canonical row after every action, so the draft follows the prop
  // rather than diverging from it — a stale field next to "saved as revision 5" is how a second
  // save writes the pre-canonical value back.
  //
  // Keyed on `revision` and not on the object, and adjusted DURING RENDER rather than in an effect:
  // `CharacterPanel.tsx:131-147` has the full argument, including why
  // `react-hooks/set-state-in-effect` rejects the alternative.
  const [lastRevision, setLastRevision] = React.useState(revision)
  if (revision !== lastRevision) {
    setLastRevision(revision)
    setDraft(prefs)
    setConfirmingReset(false)
  }

  const unsaved = React.useMemo(() => new Set(changedImageGenFields(draft, prefs)), [draft, prefs])
  const dirty = unsaved.size > 0
  const on = focusOnKeys(draft)
  const length = promptLengthCopy(draft.promptLength)

  /**
   * The draft's selection as the opaque key the picker's contract is written in. `''` is "nothing
   * selected" — phase 1's `NinaImageReference` carries `''`, never `null`, so every "is one
   * selected" question in this file is asked of this string rather than of `reference.id` directly.
   */
  const selectedKey = referenceKey(draft.reference)

  function setFocus(key: string, next: boolean) {
    setDraft((current) => ({ ...current, focus: { ...current.focus, [key]: next } }))
  }

  /** Absent means OFF, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.focus[key] ?? false
  }

  /**
   * R10's selection, into the same local draft as every other control (plan invariant 7).
   * **This is the function phase 5's picker calls.** It is the whole of the contract.
   */
  function setReference(next: ImageGenDraft['reference']) {
    setDraft((current) => ({ ...current, reference: next }))
  }

  function run(action: () => Promise<AdminImageGenResult>) {
    startTransition(async () => {
      setResult(await action())
    })
  }

  return (
    <section id="image-generation" className="mb-8 rounded-card border border-rule bg-card px-5">
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          How she is photographed
          {dirty && (
            <span className="ml-2 text-[12px] font-semibold text-accent">
              {unsaved.size} unsaved
            </span>
          )}
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          prompt length {draft.promptLength} &middot; {on.length} of {NINA_IMAGE_FOCUS_KEYS.length}{' '}
          emphasised
          {selectedKey !== '' && ' · one reference'} &middot; revision {revision}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Everything on this page goes into the <strong>image</strong> prompt, not into her voice.{' '}
          <strong>There is no cache on the image path</strong>, so a saved row is in the next
          photograph she takes with no invalidation step and no deploy. What this page does{' '}
          <strong>not</strong> control is the scene — she still chooses that per photograph, and the
          preview below stands one in so the rest of the prompt is readable.
        </p>

        <section className="mb-6">
          <h3 className="text-[13px] font-semibold text-ink">Prompt length</h3>
          <p className="mb-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            One dial, 0 to {NINA_IMAGE_PROMPT_LENGTH_MAX}, read in the same five bands as every
            other slider in here.
          </p>
          {/*
           * No `onEnabledChange`, so `DialSlider` renders no checkbox — its own docstring names
           * this case: *"A caller with a parameter that has no off switch … passes neither prop and
           * gets the control as it was before R4."* There is no "off" for prompt length; the
           * bottom of the scale is the shortest prompt, not the absence of one.
           */}
          <DialSlider
            label={length.label}
            hint={length.hint}
            value={draft.promptLength}
            defaultValue={defaults.promptLength}
            min={NINA_IMAGE_PROMPT_LENGTH_MIN}
            max={NINA_IMAGE_PROMPT_LENGTH_MAX}
            disabled={pending}
            unsaved={unsaved.has('promptLength')}
            onChange={(value) => setDraft((current) => ({ ...current, promptLength: value }))}
          />
        </section>

        <fieldset className="mb-6">
          <legend className="mb-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Focus on
          </legend>
          {/*
           * The leading `*` on every line of this comment is load-bearing and not tidy:
           * `ci:client-secret-guard` recognises a comment line only when it is trimmed-prefixed by
           * `//`, `*` or `/*`, so a JSX comment with bare prose continuation lines is scanned as
           * code. Both existing admin pages record the same trap.
           *
           * These six are ADDITIVE. R1's four body facts are in every prompt whatever is ticked
           * here — plan invariant 4 — so clearing all six shortens the emphasis and does not
           * undress the subject paragraph. The sentence below says so, and the preview proves it.
           */}
          <p className="mb-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            These add emphasis on top of the prompt. They cannot take anything out of it: her body
            is described in every photograph whether or not anything here is ticked. Read the
            assembled prompt below to see what each one adds.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {NINA_IMAGE_FOCUS_KEYS.map((key) => {
              const copy = imageFocusCopy(key)
              const ticked = isOn(key)
              return (
                <label
                  key={key}
                  className={cn(
                    TOUCH_TARGET,
                    'flex cursor-pointer items-start gap-2 rounded-card bg-paper-2 p-3',
                    ticked && 'ring-2 ring-accent',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={ticked}
                    disabled={pending}
                    onChange={(event) => setFocus(key, event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent disabled:opacity-50"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold text-ink">
                      {copy.label}
                      {unsaved.has(`focus.${key}`) && (
                        <span className="ml-2 text-[11px] font-semibold text-accent">unsaved</span>
                      )}
                    </span>
                    <span className="block text-[11px] font-medium text-ink-3">{copy.hint}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.wardrobe.label}
              {unsaved.has('wardrobe') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.wardrobe}
              maxLength={NINA_IMAGE_WARDROBE_MAX}
              disabled={pending}
              placeholder={NINA_IMAGE_TEXT_SPECS.wardrobe.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, wardrobe: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing. Leave it empty and she wears what the canon says.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.venue.label}
              {unsaved.has('venue') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.venue}
              maxLength={NINA_IMAGE_VENUE_MAX}
              disabled={pending}
              placeholder={NINA_IMAGE_TEXT_SPECS.venue.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, venue: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Where she is. This is a standing preference; the scene she picks per photograph still
              sits above it.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.time.label}
              {unsaved.has('time') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.time}
              maxLength={NINA_IMAGE_TIME_MAX}
              disabled={pending}
              placeholder={NINA_IMAGE_TEXT_SPECS.time.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, time: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Time of day and weather, in your own words.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.notes.label}
              {unsaved.has('notes') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
              value={draft.notes}
              maxLength={NINA_IMAGE_NOTES_MAX}
              disabled={pending}
              placeholder={NINA_IMAGE_TEXT_SPECS.notes.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Anything no other field can say. Handed to the camera verbatim — this is the image
              prompt, not her system prompt.
            </span>
          </label>
        </div>

        <PhotoReferencePicker
          items={references}
          total={photoTotal}
          value={selectedKey}
          onChange={(next) => setReference(parseReferenceKey(next))}
          disabled={pending}
        />

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled image prompt &middot; revision {revision}
            {dirty && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <p className="mt-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            Assembled by the same function the camera is handed, so this is the prompt and not a
            reconstruction of it. The <code>SCENE:</code> line is a stand-in —{' '}
            <em>{ADMIN_IMAGE_PREVIEW_SCENE}</em> — because she chooses the scene per photograph.
          </p>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {/* R11 / R12, phase 4's seam filled. Propless on purpose: the panel reads the live
         * quota and the saved-prefs prompt preview through its own Server Action, so this line
         * depends on none of this form's state and could not conflict with the picker mount
         * above it.
         *
         * `dirty` is this panel's own `unsaved.size > 0`. The test runs the SAVED row, so an
         * operator with unsaved edits is warned rather than handed a verdict on a prompt he is
         * not looking at.
         *
         * It sits after the assembled prompt and before the Save row for two reasons: the
         * verdict is about the prompt printed immediately above it, so the two read as one
         * block; and the button spends money against `NINA_IMAGE_DAILY_CAP`, so it must not sit
         * where a hand aiming for Save can land on it. */}
        <ImageGenTestPanel dirty={dirty} />

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
                saveNinaImagePrefsAction({
                  userId,
                  promptLength: draft.promptLength,
                  focus: draft.focus,
                  wardrobe: draft.wardrobe,
                  venue: draft.venue,
                  time: draft.time,
                  notes: draft.notes,
                  reference: draft.reference,
                }),
              )
            }
          >
            Save every parameter
          </Button>

          <Button
            variant="ghost"
            disabled={pending || !dirty}
            onClick={() => {
              setDraft(prefs)
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
              This writes <strong>every</strong> parameter on this page back to its default, clears
              the photo reference, and bumps the revision so the row records that it happened. It
              does not touch her body canon — that was never a setting.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={pending}
                onClick={() => {
                  run(() => resetNinaImagePrefsAction({ userId }))
                  setConfirmingReset(false)
                }}
              >
                Reset the image parameters
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
