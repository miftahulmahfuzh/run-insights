'use client'

import * as React from 'react'

import { ImageGenTestPanel } from '@/components/admin/ImageGenTestPanel'
import { SparklesIcon } from '@/components/admin/photoIcons'
import { PhotoReferencePicker } from '@/components/admin/PhotoReferencePicker'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  generateAllImageFieldValuesAction,
  generateImageFieldValueAction,
  saveNinaImagePrefsAction,
  type AdminImageGenResult,
} from '@/lib/admin/imageGenActions'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  imageCameraAngleLabel,
  imageFocusCopy,
  imageGenDraftEquals,
  imageHairstyleLabel,
  imageModelHint,
  imageModelLabel,
  mergeImageGenAfterSave,
  parseReferenceKey,
  referenceKey,
  type ImageGenDraft,
  type ImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { cn } from '@/lib/cn'
import {
  NINA_CAMERA_ANGLE_KEYS,
  NINA_EXPRESSION_PRESETS,
  NINA_HAIRSTYLE_KEYS,
  NINA_IMAGE_EXPRESSION_MAX,
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_IDS,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_TEMPLATE_KEYS,
  NINA_IMAGE_TEMPLATE_SPECS,
  NINA_IMAGE_TEXT_SPECS,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
  NINA_PROMPT_TEMPLATE_MAX,
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
 * ── EVERY CONTROL COMMITS ITSELF — AND WHY THAT IS SAFE HERE ────────────────────────────────
 * The simplify set's R2, the same sentence the Personality tab's simplify set answered — *"hapus
 * tombol" the staged-commit row, "buat Personality capable to auto-save everytime some changes are
 * made"* — and `CharacterPanel.tsx` already shipped the answer for the sibling tab, so this panel
 * adopts that pipeline control-kind by control-kind rather than inventing a second one. Four
 * properties make committing on every edit safe rather than reckless:
 *
 *   1. **One writer.** `nina_image_prefs` is one row per account, upserted on `user_id` by
 *      `writeNinaImagePrefs` — there is no history to fork and no list to reconcile.
 *   2. **One operator.** The admin surface is one person; there is no second editor whose
 *      in-flight draft this panel could silently overwrite.
 *   3. **Sequential dispatch.** Next dispatches Server Actions one at a time per client
 *      (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on
 *      the client"), so commits cannot interleave out of order even when several queue up.
 *   4. **The write is an idempotent whole-row upsert.** Every commit sends the complete draft, so
 *      a commit that duplicates another or queues behind it writes the same truth. The failure
 *      mode of auto-save here is a wasted round trip, never a half-written row.
 *
 * ── THE COMMIT MOMENTS ARE `CharacterPanel`'s RULE, NOT A STYLE CHOICE ──────────────────────
 * `CharacterPanel.tsx` records the measured precedent (which itself cites `MemoryTable`'s
 * "HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A DEBOUNCE") and this panel follows it
 * control-kind by control-kind:
 *
 *   - **The six focus checkboxes, the three dropdowns and the photo reference commit on CHANGE.**
 *     A discrete control's change IS the finished edit — there is no "still dragging" state to
 *     wait out.
 *   - **The four text fields commit on BLUR.** A keystroke debounce would queue an action per
 *     sentence. Blur is exactly one write per completed edit, at the moment the edit is finished.
 *
 * ── ONE ACTION PER COMMIT, AND IT ALWAYS CARRIES THE WHOLE DRAFT ────────────────────────────
 * Plan invariant 7 survives auto-save unchanged: one Server Action, the whole row — Next
 * dispatches actions one at a time per client, so eleven controls as eleven actions would stall
 * behind each other, and each action drags a re-rendered route back with it. An immediate commit
 * (a checkbox, a pick, a field blur) carries the whole draft, so it subsumes anything else pending;
 * a save still in flight when another commit fires simply queues behind it and re-sends the whole
 * draft — idempotent, and the fire-time equality check makes the common case free.
 *
 * ── THE ROW THE PANEL BELIEVES IN ───────────────────────────────────────────────────────────
 * `saved` is the panel's copy of the stored row. It starts as the `prefs` prop and is updated ONLY
 * from the action's own result: the save returns the row after `coerceNinaImagePrefs`, and the
 * response carries both that value and the re-rendered route in one round trip
 * (`server-actions.md`, "A single response carries data and UI"), so reading the row off the result
 * is the same freshness as reading it off the prop — without having to tell "my save landed" apart
 * from "the row changed under me". Nothing else writes this row (one operator), so the only way it
 * changes under the panel is the panel's own save coming back; no other sync exists, and the prop
 * is the mount-time baseline and a fresh page load, nothing more.
 *
 * The staged-commit panel's keyed draft resync is gone with it, and nothing has replaced it: the
 * row arrives once as the `prefs` prop and is maintained from the save's own result, so there is
 * no sync mechanism left and no prop to key one on.
 *
 * The draft does NOT blindly adopt the canonical row: `coerceNinaImageText` collapses whitespace
 * runs and truncates, so the stored row can differ cosmetically from what was typed, and the
 * operator may have kept editing while the save was in flight. `mergeImageGenAfterSave(current,
 * sent, canonical)` adopts the stored value only for fields still equal to what was dispatched; a
 * field edited since keeps the newer local value and stays pending, riding the next commit.
 *
 * ── NOTHING IS DISABLED WHILE A SAVE IS IN FLIGHT ───────────────────────────────────────────
 * The staged-commit panel locked every control on `pending`. Auto-save must not: editing during a
 * save is safe here — the draft keeps accepting changes, the merge above protects anything typed
 * after dispatch, and the next commit carries the newest whole draft. `pending` drives only the
 * status line.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `CharacterPanel.tsx` states the reason and it is unchanged here: the plain-argument +
 * result-object convention on the sibling admin pages, and an operator-only tool gains nothing from
 * progressive enhancement that it does not lose in consistency. Validation is Zod on the server for
 * every field, either way.
 *
 * ── EVERY WORD BESIDE A CONTROL COMES FROM `lib/nina/imageprefs.ts` ─────────────────────────
 * Labels, hints, placeholders and bounds are `imageFocusCopy`, `NINA_IMAGE_TEXT_SPECS` and the four
 * `*_MAX` constants, which read phase 1's specs. There is no copy table in this package, so the
 * panel cannot promise an emphasis the prompt does not add — and, specifically, so that the six
 * option names stay the user's own words instead of somebody's clinical synonyms for them.
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
  /**
   * The prefs as the row holds them at mount — the baseline the draft and the panel's `saved` copy
   * both start from. After mount the pipeline maintains `saved` itself from the action's results;
   * see "THE ROW THE PANEL BELIEVES IN" above for why the prop is not watched.
   */
  prefs: ImageGenDraft
  /**
   * `buildNinaImagePrompt(...)`, assembled on the SERVER from the SAVED prefs.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. The preview's own summary
   * line says when it is stale.
   */
  promptPreview: string
  /**
   * `NINA_PROMPT_TEMPLATE_DEFAULT`, assembled on the SERVER — the textarea's content before the
   * operator touches it, and the Reset button's target. A prop rather than an import because
   * this file is `'use client'` and the default template is canon-interpolated in
   * `lib/nina/imagegen.ts`: importing the assembler here would ship the whole persona canon to
   * the browser to save one string, which this file's own header forbids.
   */
  defaultTemplate: string
  /**
   * Every photograph the reference grid may offer, newest first, already mapped to a plain
   * serializable shape on the server.
   *
   * **RECONCILED:** mapped from `listNinaPhotoReferences(userId).rows` with
   * `toImageReferenceOption`, and structurally identical to phase 5's `PhotoReferenceItem`, so
   * phase 5's mount is `items={references}` with no cross-phase import.
   */
  references: ImageReferenceOption[]
  /**
   * How many photographs the deduplicated union holds **in total**, across every page — i.e.
   * `listNinaPhotoReferences(userId, opts).total`. The footer's "Showing N of {photoTotal}" cannot
   * say this from `references.length` alone.
   */
  photoTotal: number
  /** 1-based. Which `?page=` window `references` came from — the page.tsx route's own reader. */
  photoPage: number
  /** `Math.max(1, Math.ceil(photoTotal / NINA_PHOTO_REF_PAGE_SIZE))`, computed by the page. */
  photoPageCount: number
  /**
   * Thumbnail (or original) URLs for the page either side of `photoPage` —
   * `listNinaPhotoReferences(userId, opts).preloadUrls`, computed server-side from the same deduped
   * read at no extra database cost. The picker renders these as `<link rel="prefetch">` hints so a
   * `Previous`/`Next` click finds its images already warming in the browser.
   */
  photoPreloadUrls: readonly string[]
}

export function ImageGenPanel({
  userId,
  prefs,
  promptPreview,
  defaultTemplate,
  references,
  photoTotal,
  photoPage,
  photoPageCount,
  photoPreloadUrls,
}: ImageGenPanelProps) {
  /* What the controls show and edit. */
  const [draft, setDraft] = React.useState<ImageGenDraft>(prefs)
  /* What the panel believes the row holds. The predicate under every "unsaved" mark and the status
   * line is `changedImageGenFields(draft, saved)` — never the prop. See the header. */
  const [saved, setSaved] = React.useState<ImageGenDraft>(prefs)
  const [result, setResult] = React.useState<AdminImageGenResult | null>(null)
  /* The 2026-09-18 "generate a fresh value" icon, one status per field. Not `pending`/`saving` —
   * generating never writes `nina_image_prefs`, so it has nothing to do with the save pipeline. */
  const [fieldGen, setFieldGen] = React.useState<
    Partial<Record<'wardrobe' | 'venue' | 'time' | 'notes' | 'expression', 'loading' | 'error'>>
  >({})
  /* The 2026-09-18 "regenerate all five" control, above the photo reference section —
   * `fieldGen`'s own shape but with nothing to key on since it touches every field at once. */
  const [allFieldGen, setAllFieldGen] = React.useState<'loading' | 'error' | null>(null)
  const [pending, startTransition] = React.useTransition()

  /* Refs for the five text controls' own ✕ — `SessionRow.tsx`'s pattern: the click handler
   * refocuses the control itself so the on-screen keyboard never drops. */
  const wardrobeInputRef = React.useRef<HTMLInputElement | null>(null)
  const venueInputRef = React.useRef<HTMLInputElement | null>(null)
  const timeInputRef = React.useRef<HTMLInputElement | null>(null)
  const notesInputRef = React.useRef<HTMLTextAreaElement | null>(null)
  const expressionInputRef = React.useRef<HTMLInputElement | null>(null)

  /*
   * One `<label>` per field, wrapping ONLY the field-name text — never the generate button, the
   * control, or the ✕. A `<label>` that wraps more than one labelable descendant resolves its
   * "labeled control" to the FIRST one in tree order (here: the ↻ button, since it sits in the
   * header row above the input) and the browser then forwards a synthetic click to THAT control
   * whenever anything else inside the label is clicked — the ✕, or even the input itself. That is
   * exactly the bug: clicking ✕ to clear a field was firing the generate suggestion. `Field.tsx`'s
   * `<label htmlFor={inputId}>` beside a plain `<div className="relative">` is the same fix, one
   * `<label>`, one labelable descendant — applied here by hand since this panel predates `Field`.
   */
  const wardrobeFieldId = React.useId()
  const venueFieldId = React.useId()
  const timeFieldId = React.useId()
  const notesFieldId = React.useId()
  const expressionFieldId = React.useId()
  /** The 2026-09-18 preset dropdown beside Facial expression — a stateless quick-fill, so its own
   * `<select>` always resets to the placeholder rather than tracking which preset (if any) the
   * current text happens to match. */
  const expressionPresetId = React.useId()

  const pendingFields = React.useMemo(
    () => new Set(changedImageGenFields(draft, saved)),
    [draft, saved],
  )
  const clean = pendingFields.size === 0
  const saving = pending
  /* `ImageGenTestPanel`'s warning is exactly this: the assembled prompt below was built from
   * `saved`, so a draft that differs from it is a prompt the test would not actually send. */
  const dirty = !clean
  const on = focusOnKeys(draft)

  /**
   * The draft's selection as the opaque key the picker's contract is written in. `''` is "nothing
   * selected" — phase 1's `NinaImageReference` carries `''`, never `null`, so every "is one
   * selected" question in this file is asked of this string rather than of `reference.id` directly.
   */
  const selectedKey = referenceKey(draft.reference)

  /**
   * THE one dispatch. `sent` is the exact draft that left the browser — the merge's reference
   * point for "edited since dispatch". The whole row goes, every time (plan invariant 7); the
   * action's `prefs` comes back canonical and is adopted per-field.
   *
   * The previous error is cleared as the new attempt starts, the way `MemoryTable` clears a row's
   * result when its cell is edited again.
   */
  function dispatchSave(sent: ImageGenDraft) {
    setResult(null)
    startTransition(async () => {
      const outcome = await saveNinaImagePrefsAction({
        userId,
        focus: sent.focus,
        wardrobe: sent.wardrobe,
        venue: sent.venue,
        time: sent.time,
        notes: sent.notes,
        expression: sent.expression,
        promptTemplate: sent.promptTemplate,
        model: sent.model,
        reference: sent.reference,
        hairstyle: sent.hairstyle,
        cameraAngle: sent.cameraAngle,
      })
      if (!outcome.ok || outcome.prefs === undefined) {
        /* Nothing was written, so `saved` stays where it was — the panel is still pending exactly
         * the fields it was pending before, and the sentence below says what to do. */
        setResult(outcome)
        return
      }
      const canonical = outcome.prefs
      setSaved(canonical)
      setDraft((current) => mergeImageGenAfterSave(current, sent, canonical))
    })
  }

  /**
   * The immediate path — the six focus checkboxes, the three dropdowns and the reference pick.
   * `next` is the draft as this control just produced it (a `setState` has not landed when its own
   * `onChange` runs — `MemoryTable`'s `commitFact` passes the patch for exactly this reason).
   */
  function commitImmediate(next: ImageGenDraft) {
    setDraft(next)
    if (imageGenDraftEquals(next, saved)) return
    dispatchSave(next)
  }

  /**
   * A focus checkbox — an immediate commit, like every discrete control. R5's emphasis map rides
   * the same whole-row action as everything else.
   */
  function setFocus(key: string, next: boolean) {
    commitImmediate({ ...draft, focus: { ...draft.focus, [key]: next } })
  }

  /** Absent means OFF, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.focus[key] ?? false
  }

  /**
   * R10's selection, committed immediately — a photograph is either the anchor or it is not, and
   * the click is the finished edit. **This is the function phase 5's picker calls.** It is the
   * whole of the contract.
   */
  function setReference(next: ImageGenDraft['reference']) {
    commitImmediate({ ...draft, reference: next })
  }

  /**
   * §8's camera — an immediate commit, like every discrete control: the dropdown's change IS the
   * finished edit. It rides the one whole-row save, so it carries anything still pending (an
   * unsent textarea) exactly the way a checkbox does.
   */
  function setModel(next: string) {
    commitImmediate({ ...draft, model: next })
  }

  /**
   * The 2026-09-18 hairstyle preset — an immediate commit, `setModel`'s own reasoning: the
   * dropdown's change IS the finished edit.
   */
  function setHairstyle(next: string) {
    commitImmediate({ ...draft, hairstyle: next })
  }

  /** The 2026-09-18 camera-angle preset. `setHairstyle`'s own reasoning: an immediate commit, like
   * every closed dropdown on this panel. */
  function setCameraAngle(next: string) {
    commitImmediate({ ...draft, cameraAngle: next })
  }

  /**
   * The five text controls' commit moment — `MemoryTable`'s rule verbatim: blur is exactly one
   * write per completed edit, at the moment the edit is finished. NEVER a keystroke debounce; see
   * the header. Typing changed ONLY the draft, so the blur reads the draft the keystrokes already
   * landed.
   *
   * Defined LAST among the handlers, directly above the JSX: every one of the four fields and the
   * template textarea mount it as `onBlur={commitText}`.
   */
  function commitText() {
    if (imageGenDraftEquals(draft, saved)) return
    dispatchSave(draft)
  }

  /**
   * The five text fields' ✕ — clears the draft and puts focus straight back on the control, the
   * same shape as `SessionRow.tsx`'s rename ✕. It does NOT call `commitText` itself: clearing is
   * an edit like any keystroke, so it rides the normal blur commit above rather than a second,
   * redundant write path.
   */
  function clearTextField(
    key: 'wardrobe' | 'venue' | 'time' | 'notes' | 'expression',
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  ) {
    setDraft((current) => ({ ...current, [key]: '' }))
    ref.current?.focus()
  }

  /**
   * The Facial expression preset dropdown — fills the DRAFT with the chosen preset's canned
   * sentence, `generateField`'s own pattern: it does NOT commit, and it focuses the field
   * afterwards so the existing `onBlur={commitText}` is what saves it. The admin can edit or
   * discard the filled text like anything else typed there; unlike a closed dropdown, this
   * `<select>` always resets to its placeholder rather than tracking a "current preset".
   */
  function applyExpressionPreset(key: string) {
    const preset = NINA_EXPRESSION_PRESETS.find((candidate) => candidate.key === key)
    if (preset === undefined) return
    setDraft((current) => ({ ...current, expression: preset.text }))
    expressionInputRef.current?.focus()
  }

  /**
   * The generate icon beside a field's label. Fills the DRAFT exactly like a keystroke would —
   * it does NOT commit — and then focuses the field's own control, `clearTextField`'s pattern, so
   * the field's existing `onBlur={commitText}` is what saves it. The model reads `draft` (not
   * `saved`) for the other four fields, so an unsaved edit next door still shapes the suggestion.
   */
  async function generateField(
    key: 'wardrobe' | 'venue' | 'time' | 'notes' | 'expression',
    ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  ) {
    setFieldGen((current) => ({ ...current, [key]: 'loading' }))
    const outcome = await generateImageFieldValueAction({
      field: key,
      wardrobe: draft.wardrobe,
      venue: draft.venue,
      time: draft.time,
      notes: draft.notes,
      expression: draft.expression,
    })
    if (!outcome.ok) {
      setFieldGen((current) => ({ ...current, [key]: 'error' }))
      return
    }
    setFieldGen((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setDraft((current) => ({ ...current, [key]: outcome.value }))
    ref.current?.focus()
  }

  /**
   * The "regenerate all five" control, above the photo reference section. One call proposes all
   * five fields as one coherent scene; unlike `generateField` there is no single control to focus
   * and blur afterwards, so a success here goes straight through `commitImmediate` — the same
   * "the click IS the finished edit" path the camera/hairstyle/angle dropdowns already use.
   */
  async function generateAllFields() {
    setAllFieldGen('loading')
    const outcome = await generateAllImageFieldValuesAction()
    if (!outcome.ok) {
      setAllFieldGen('error')
      return
    }
    setAllFieldGen(null)
    commitImmediate({ ...draft, ...outcome.values })
  }

  /**
   * The template's route back to the shipped shell — an immediate commit, like every discrete
   * control, because the click IS the finished edit. It stores the default TEMPLATE itself rather
   * than `''`; both render identically, and the stored text is what the operator will see in the
   * box the next time the page loads.
   */
  function resetTemplate() {
    commitImmediate({ ...draft, promptTemplate: defaultTemplate })
  }

  return (
    <section id="image-generation" className="mb-8 rounded-card border border-rule bg-card px-5">
      <div className="flex items-center justify-between gap-4 py-5">
        <h2 className="text-[15px] font-semibold text-ink">
          How she is photographed
          {/*
           * The save-status surface, where the "N unsaved" counter used to be. Tri-state, and the
           * third state is not decoration: "Unsaved edits" is what shows while the operator TYPES
           * into a text field (a keystroke commits nothing — that is the rule) and after a FAILED
           * save (the error sentence renders below). `aria-live="polite"` because this is the one
           * line that changes on its own, and "Saved" is worth hearing without stealing focus.
           */}
          <span
            aria-live="polite"
            className={cn(
              'ml-2 text-[12px] font-semibold',
              saving || !clean ? 'text-accent' : 'text-ink-3',
            )}
          >
            {saving ? 'Saving…' : clean ? 'Saved' : 'Unsaved edits'}
          </span>
        </h2>
        <span className="text-right text-[12px] font-medium text-ink-3">
          {on.length} of {NINA_IMAGE_FOCUS_KEYS.length} emphasised
          {selectedKey !== '' && ' · one reference'}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Everything on this page goes into the <strong>image</strong> prompt, not into her voice,
          and every change saves itself — a checkbox, a dropdown or a photograph the moment you pick
          it, the text fields when you leave them.{' '}
          <strong>There is no cache on the image path</strong>, so a saved row is in the next
          photograph she takes with no invalidation step and no deploy. What this page does{' '}
          <strong>not</strong> control is the scene — she still chooses that per photograph, and the
          preview below stands one in so the rest of the prompt is readable.
        </p>

        {/*
         * §8's camera (the 2026-09-10 ask). A closed two-option select rather than a free-text
         * id: the vocabulary lives in `lib/nina/imageprefs.ts` beside the coercion, the Zod
         * boundary refuses anything outside it, and the label and hint are phase 1's specs — the
         * same "no copy table in the panel" rule as every other word on this page. It commits on
         * CHANGE, like the checkboxes, because the selection is the finished edit; the new
         * camera is on the next generation with no invalidation step, and the Test panel below
         * is how the lighter sibling gets probed before he leans on it.
         */}
        <section className="mb-6">
          <label className="block">
            <span className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Image model
              {pendingFields.has('model') && (
                <span className="text-[11px] font-semibold text-accent">unsaved</span>
              )}
            </span>
            <select
              className={CONTROL_CLASS}
              value={draft.model}
              onChange={(event) => setModel(event.target.value)}
            >
              {NINA_IMAGE_MODEL_IDS.map((id) => (
                <option key={id} value={id}>
                  {imageModelLabel(id)}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              {imageModelHint(draft.model) ||
                'Which camera draws her. An unknown id falls back to the measured one.'}
            </span>
          </label>
        </section>

        {/*
         * The 2026-09-18 hairstyle preset. A closed dropdown, `Image model`'s own reasoning: the
         * vocabulary lives beside its coercion in `lib/nina/imageprefs.ts`, and the Zod boundary
         * refuses anything outside it. It commits on CHANGE, like the camera — the selection is
         * the finished edit, and the new hairstyle is in the next photograph with no invalidation
         * step, exactly the assembled prompt preview below shows.
         */}
        <section className="mb-6">
          <label className="block">
            <span className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Hairstyle
              {pendingFields.has('hairstyle') && (
                <span className="text-[11px] font-semibold text-accent">unsaved</span>
              )}
            </span>
            <select
              className={CONTROL_CLASS}
              value={draft.hairstyle}
              onChange={(event) => setHairstyle(event.target.value)}
            >
              {NINA_HAIRSTYLE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {imageHairstyleLabel(key)}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              How she wears her hair in every photograph. An unknown key falls back to the default.
            </span>
          </label>
        </section>

        {/*
         * The 2026-09-18 camera-angle preset. `Hairstyle`'s own reasoning, one control down: the
         * vocabulary lives beside its coercion in `lib/nina/imageprefs.ts`, and the Zod boundary
         * refuses anything outside it. This is also the fix for the incident that asked for it —
         * see `NINA_CAMERA_ANGLE_KEYS`'s header in `lib/nina/imageprefs.ts` — the chat model's own
         * per-photo pick (`generate_image`'s `angle` argument) still wins when the runner asks for
         * something else in the moment; this dropdown is only the standing default underneath it.
         */}
        <section className="mb-6">
          <label className="block">
            <span className="mb-1.5 flex items-baseline gap-2 text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              Camera angle
              {pendingFields.has('cameraAngle') && (
                <span className="text-[11px] font-semibold text-accent">unsaved</span>
              )}
            </span>
            <select
              className={CONTROL_CLASS}
              value={draft.cameraAngle}
              onChange={(event) => setCameraAngle(event.target.value)}
            >
              {NINA_CAMERA_ANGLE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {imageCameraAngleLabel(key)}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Where the camera is by default. She can still pick a different angle for one photo
              when he asks in chat.
            </span>
          </label>
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
           *
           * Each card is the label and nothing else: the line this set removed rendered the
           * lowercased label back at the operator — "face" under Face — which was the copy reading
           * itself. The words the prompt actually spends live in `NINA_FOCUS_EMPHASIS`
           * (`lib/nina/imagegen.ts`), a paragraph cannot carry them, and the assembled prompt
           * below is where an operator reads what a tick adds. Personality's option cards still
           * carry hints; these deliberately do not, because Personality's hints say something the
           * control's label cannot.
           */}
          <p className="mb-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            These add emphasis on top of the prompt. They cannot take anything out of it: her body
            is described in every photograph whether or not anything here is ticked. Read the
            assembled prompt below to see what each one adds.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {NINA_IMAGE_FOCUS_KEYS.map((key) => {
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
                    onChange={(event) => setFocus(key, event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span className="text-[13px] font-semibold text-ink">
                    {imageFocusCopy(key)}
                    {pendingFields.has(`focus.${key}`) && (
                      <span className="ml-2 text-[11px] font-semibold text-accent">unsaved</span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <div className="block">
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={wardrobeFieldId}
                className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
              >
                {NINA_IMAGE_TEXT_SPECS.wardrobe.label}
                {pendingFields.has('wardrobe') && (
                  <span className="ml-2 font-semibold text-accent">unsaved</span>
                )}
              </label>
              <button
                type="button"
                aria-label="Buat wardrobe baru"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => generateField('wardrobe', wardrobeInputRef)}
                disabled={fieldGen.wardrobe === 'loading' || allFieldGen === 'loading'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-pill text-[15px] text-ink-3 active:opacity-70 disabled:opacity-40"
              >
                {fieldGen.wardrobe === 'loading' ? '⋯' : '↻'}
              </button>
            </span>
            <div className="relative">
              <input
                id={wardrobeFieldId}
                ref={wardrobeInputRef}
                className={cn(CONTROL_CLASS, draft.wardrobe !== '' && 'pr-11')}
                value={draft.wardrobe}
                maxLength={NINA_IMAGE_WARDROBE_MAX}
                placeholder={NINA_IMAGE_TEXT_SPECS.wardrobe.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, wardrobe: event.target.value }))
                }
                onBlur={commitText}
              />
              {draft.wardrobe !== '' && (
                <button
                  type="button"
                  aria-label="Kosongkan wardrobe"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => clearTextField('wardrobe', wardrobeInputRef)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing. Leave it empty and she wears what the canon says.
            </span>
            {fieldGen.wardrobe === 'error' && (
              <span className="mt-1 block text-[11px] font-medium text-red-500">
                Gagal membuat nilai baru — coba lagi.
              </span>
            )}
          </div>

          <div className="block">
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={venueFieldId}
                className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
              >
                {NINA_IMAGE_TEXT_SPECS.venue.label}
                {pendingFields.has('venue') && (
                  <span className="ml-2 font-semibold text-accent">unsaved</span>
                )}
              </label>
              <button
                type="button"
                aria-label="Buat venue baru"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => generateField('venue', venueInputRef)}
                disabled={fieldGen.venue === 'loading' || allFieldGen === 'loading'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-pill text-[15px] text-ink-3 active:opacity-70 disabled:opacity-40"
              >
                {fieldGen.venue === 'loading' ? '⋯' : '↻'}
              </button>
            </span>
            <div className="relative">
              <input
                id={venueFieldId}
                ref={venueInputRef}
                className={cn(CONTROL_CLASS, draft.venue !== '' && 'pr-11')}
                value={draft.venue}
                maxLength={NINA_IMAGE_VENUE_MAX}
                placeholder={NINA_IMAGE_TEXT_SPECS.venue.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, venue: event.target.value }))
                }
                onBlur={commitText}
              />
              {draft.venue !== '' && (
                <button
                  type="button"
                  aria-label="Kosongkan venue"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => clearTextField('venue', venueInputRef)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Where she is. This is a standing preference; the scene she picks per photograph still
              sits above it.
            </span>
            {fieldGen.venue === 'error' && (
              <span className="mt-1 block text-[11px] font-medium text-red-500">
                Gagal membuat nilai baru — coba lagi.
              </span>
            )}
          </div>

          <div className="block">
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={timeFieldId}
                className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
              >
                {NINA_IMAGE_TEXT_SPECS.time.label}
                {pendingFields.has('time') && (
                  <span className="ml-2 font-semibold text-accent">unsaved</span>
                )}
              </label>
              <button
                type="button"
                aria-label="Buat time baru"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => generateField('time', timeInputRef)}
                disabled={fieldGen.time === 'loading' || allFieldGen === 'loading'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-pill text-[15px] text-ink-3 active:opacity-70 disabled:opacity-40"
              >
                {fieldGen.time === 'loading' ? '⋯' : '↻'}
              </button>
            </span>
            <div className="relative">
              <input
                id={timeFieldId}
                ref={timeInputRef}
                className={cn(CONTROL_CLASS, draft.time !== '' && 'pr-11')}
                value={draft.time}
                maxLength={NINA_IMAGE_TIME_MAX}
                placeholder={NINA_IMAGE_TEXT_SPECS.time.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, time: event.target.value }))
                }
                onBlur={commitText}
              />
              {draft.time !== '' && (
                <button
                  type="button"
                  aria-label="Kosongkan time"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => clearTextField('time', timeInputRef)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Time of day and weather, in your own words.
            </span>
            {fieldGen.time === 'error' && (
              <span className="mt-1 block text-[11px] font-medium text-red-500">
                Gagal membuat nilai baru — coba lagi.
              </span>
            )}
          </div>

          <div className="block">
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={notesFieldId}
                className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
              >
                {NINA_IMAGE_TEXT_SPECS.notes.label}
                {pendingFields.has('notes') && (
                  <span className="ml-2 font-semibold text-accent">unsaved</span>
                )}
              </label>
              <button
                type="button"
                aria-label="Buat notes baru"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => generateField('notes', notesInputRef)}
                disabled={fieldGen.notes === 'loading' || allFieldGen === 'loading'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-pill text-[15px] text-ink-3 active:opacity-70 disabled:opacity-40"
              >
                {fieldGen.notes === 'loading' ? '⋯' : '↻'}
              </button>
            </span>
            <div className="relative">
              <textarea
                id={notesFieldId}
                ref={notesInputRef}
                className={cn(
                  CONTROL_CLASS,
                  'min-h-[76px] resize-y py-2 leading-snug',
                  draft.notes !== '' && 'pr-11',
                )}
                value={draft.notes}
                maxLength={NINA_IMAGE_NOTES_MAX}
                placeholder={NINA_IMAGE_TEXT_SPECS.notes.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
                onBlur={commitText}
              />
              {draft.notes !== '' && (
                <button
                  type="button"
                  aria-label="Kosongkan notes"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => clearTextField('notes', notesInputRef)}
                  className="absolute top-0 right-0 grid h-11 w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Anything no other field can say. Handed to the camera verbatim — this is the image
              prompt, not her system prompt. It saves when you leave the field.
            </span>
            {fieldGen.notes === 'error' && (
              <span className="mt-1 block text-[11px] font-medium text-red-500">
                Gagal membuat nilai baru — coba lagi.
              </span>
            )}
          </div>

          {/*
           * The 2026-09-18 facial-expression field — the fifth free-text field, `Notes`'s own
           * shape: label, generate icon, input, ✕. The one addition is the preset `<select>` right
           * below it, since this field is HYBRID (the operator's own ask): free text an admin can
           * type or regenerate via the icon, AND a five-option quick-fill for the distilled
           * default plus the four named expressions. Picking a preset behaves exactly like
           * `generateField`'s icon — it fills the draft and focuses the input rather than
           * committing on its own — so the admin can still hand-edit before it saves on blur.
           */}
          <div className="block">
            <span className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor={expressionFieldId}
                className="text-[12px] font-semibold tracking-[0.02em] text-ink-2"
              >
                {NINA_IMAGE_TEXT_SPECS.expression.label}
                {pendingFields.has('expression') && (
                  <span className="ml-2 font-semibold text-accent">unsaved</span>
                )}
              </label>
              <button
                type="button"
                aria-label="Buat facial expression baru"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => generateField('expression', expressionInputRef)}
                disabled={fieldGen.expression === 'loading' || allFieldGen === 'loading'}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-pill text-[15px] text-ink-3 active:opacity-70 disabled:opacity-40"
              >
                {fieldGen.expression === 'loading' ? '⋯' : '↻'}
              </button>
            </span>
            <div className="relative">
              <input
                id={expressionFieldId}
                ref={expressionInputRef}
                className={cn(CONTROL_CLASS, draft.expression !== '' && 'pr-11')}
                value={draft.expression}
                maxLength={NINA_IMAGE_EXPRESSION_MAX}
                placeholder={NINA_IMAGE_TEXT_SPECS.expression.placeholder}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, expression: event.target.value }))
                }
                onBlur={commitText}
              />
              {draft.expression !== '' && (
                <button
                  type="button"
                  aria-label="Kosongkan facial expression"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => clearTextField('expression', expressionInputRef)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3 active:opacity-70"
                >
                  ✕
                </button>
              )}
            </div>
            <label htmlFor={expressionPresetId} className="sr-only">
              Facial expression preset
            </label>
            <select
              id={expressionPresetId}
              className={cn(CONTROL_CLASS, 'mt-2')}
              value=""
              onChange={(event) => {
                if (event.target.value === '') return
                applyExpressionPreset(event.target.value)
              }}
            >
              <option value="">Quick fill a preset…</option>
              {NINA_EXPRESSION_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              How her face reads. Leave it empty and she keeps her composed, serious default.
            </span>
            {fieldGen.expression === 'error' && (
              <span className="mt-1 block text-[11px] font-medium text-red-500">
                Gagal membuat nilai baru — coba lagi.
              </span>
            )}
          </div>
        </div>

        {/*
         * The 2026-09-18 "regenerate all five" control — one glm-5.3 call that proposes wardrobe,
         * venue, time, notes and facial expression together as one coherent scene, instead of five
         * separate clicks through the per-field icons above. Those stay: this is an addition for
         * an operator who wants everything refreshed at once, not a replacement for changing one
         * field alone. `SparklesIcon` (`components/admin/photoIcons.tsx`) rather than a raw
         * glyph — this button carries a visible label, so it goes through the `Button` component,
         * which draws its own busy state (`LoadingDots`) instead of a second hand-rolled loading
         * glyph. A success here commits immediately (`generateAllFields`'s own docstring) rather
         * than filling the draft, so the per-field icons are disabled while it runs — a click on
         * one mid-batch would race the same draft this is about to overwrite.
         */}
        <div className="mb-3 flex justify-end">
          <Button
            variant="secondary"
            size="md"
            type="button"
            leadingIcon={<SparklesIcon className="size-4" />}
            loading={allFieldGen === 'loading'}
            disabled={Object.values(fieldGen).some((status) => status === 'loading')}
            onClick={() => generateAllFields()}
          >
            Regenerate all five
          </Button>
        </div>
        {allFieldGen === 'error' && (
          <p className="-mt-2 mb-3 text-right text-[11px] font-medium text-red-500">
            Gagal membuat nilai baru untuk kelima kolom — coba lagi.
          </p>
        )}

        <PhotoReferencePicker
          items={references}
          total={photoTotal}
          page={photoPage}
          pageCount={photoPageCount}
          preloadUrls={photoPreloadUrls}
          value={selectedKey}
          selectedId={draft.reference.id}
          onChange={(next) => setReference(parseReferenceKey(next))}
        />

        {/*
         * The editable template shell (the 2026-09-10 ask). It sits here — after every control
         * whose values flow INTO it, before the assembled preview that shows it — because it is
         * the outermost thing on this page: the checkboxes, the dropdowns and the four fields are
         * what the blocks say, and this textarea is where the blocks stand.
         *
         * THE GUARD IS NOT IN THE BROWSER. The textarea is an ordinary multi-line control, and
         * every protection the design promises lives on the server: `saveNinaImagePrefsAction`
         * refuses an unknown `{{placeholder}}`, a stray brace, or a missing
         * {{camera}}/{{subject}}/{{scene}} with a sentence naming the violation, and
         * `buildNinaImagePrompt` degrades a template that fails the same validator to the
         * shipping shell. The worst this box can do is fail a save with a precise error — the
         * failure the user asked this feature to make impossible is a BROKEN PROMPT, not a
         * refused edit.
         */}
        <section className="mb-6">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-[13px] font-semibold text-ink">Prompt template</h3>
            <Button variant="secondary" size="md" type="button" onClick={resetTemplate}>
              Reset to default template
            </Button>
          </div>
          <p className="mt-1 mb-3 max-w-[70ch] text-[11px] font-medium text-ink-3">
            This is the prompt she is photographed by — every word of it, editable. A{' '}
            <code className="font-mono text-[11px] text-ink-2">{'{{placeholder}}'}</code> is where a
            changing value lands: the Wardrobe field, the ticked Focus terms, the scene she picks
            per photograph. A line whose value is empty takes the whole line with it, and a
            placeholder can never be saved broken — rewrite any sentence, delete any line, add your
            own; it saves when you leave the field.
          </p>
          {/* The one control here a wrapping `<label>` cannot name — it sits beside an `<h3>`,
           * which labels nothing — so it names itself, the way the table cells
           * (`MemoryTable.tsx`) do. */}
          <textarea
            aria-label="Prompt template"
            className={cn(
              CONTROL_CLASS,
              'min-h-[220px] resize-y py-2 font-mono text-[12px] leading-snug',
            )}
            value={draft.promptTemplate}
            maxLength={NINA_PROMPT_TEMPLATE_MAX}
            spellCheck={false}
            onChange={(event) =>
              setDraft((current) => ({ ...current, promptTemplate: event.target.value }))
            }
            onBlur={commitText}
          />
          <span className="mt-1.5 flex items-baseline justify-between gap-4">
            <span className="text-[11px] font-semibold text-accent">
              {pendingFields.has('promptTemplate') && 'unsaved'}
            </span>
            <span className="text-[11px] font-medium text-ink-3">
              {draft.promptTemplate.length} / {NINA_PROMPT_TEMPLATE_MAX}
            </span>
          </span>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {/*
             * The legend IS phase 1's specs, not a copy table here — the same rule as every other
             * label in this panel, so the browser cannot promise a block the assembler does not
             * produce.
             */}
            {NINA_IMAGE_TEMPLATE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2 rounded-card bg-paper-2 p-2.5">
                <code className="shrink-0 font-mono text-[11px] font-semibold text-accent">
                  {`{{${key}}}`}
                </code>
                <span className="text-[11px] leading-snug font-medium text-ink-3">
                  {NINA_IMAGE_TEMPLATE_SPECS[key].description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled image prompt
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
         * `dirty` is this panel's own `pendingFields.size > 0` — transient under auto-save (true
         * while a blur-pending edit exists), which is still exactly the warning the test wants:
         * the test runs the SAVED row, so an operator mid-edit is warned rather than handed a
         * verdict on a prompt he is not looking at.
         *
         * It sits after the assembled prompt because the verdict is about the prompt printed
         * immediately above it, so the two read as one block; and it spends money against
         * `NINA_IMAGE_DAILY_CAP`, so it keeps its distance from the controls above it. */}
        <ImageGenTestPanel dirty={dirty} />

        {/*
         * The failure surface, and the only rendering of `result`. A successful save is the status
         * line's job ("Saved", no qualifier); this paragraph exists for the sentence an operator
         * needs to act on.
         */}
        {result?.ok === false && (
          <p role="alert" className="mb-3 text-[12px] font-semibold text-red">
            {result.error}
          </p>
        )}
      </div>
    </section>
  )
}
