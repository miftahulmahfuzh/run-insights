'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { ImageGenTestPanel } from '@/components/admin/ImageGenTestPanel'
import { PhotoReferencePicker } from '@/components/admin/PhotoReferencePicker'
import { TOUCH_TARGET } from '@/components/admin/touch'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { saveNinaImagePrefsAction, type AdminImageGenResult } from '@/lib/admin/imageGenActions'
import {
  ADMIN_IMAGE_PREVIEW_SCENE,
  changedImageGenFields,
  focusOnKeys,
  imageFocusCopy,
  imageGenDraftEquals,
  IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS,
  imageModelHint,
  imageModelLabel,
  mergeImageGenAfterSave,
  parseReferenceKey,
  promptLengthCopy,
  referenceKey,
  type ImageGenDraft,
  type ImageReferenceOption,
} from '@/lib/admin/imageGenModel'
import { cn } from '@/lib/cn'
import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_MODEL_IDS,
  NINA_IMAGE_PROMPT_LENGTH_MAX,
  NINA_IMAGE_PROMPT_LENGTH_MIN,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_TEMPLATE_KEYS,
  NINA_IMAGE_TEMPLATE_SPECS,
  NINA_IMAGE_TEXT_SPECS,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
  NINA_PROMPT_TEMPLATE_DEFAULT,
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
 *   - **The prompt-length dial commits DEBOUNCED, `IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS` after the
 *     last change.** A range input fires `change` on every pointer move and KEEPS FOCUS after the
 *     thumb is released, so blur — the text fields' moment — does not exist for a slider. The
 *     debounce is the settle detector: one continuous drag becomes one save, and the timer is
 *     cleared on re-arm, on unmount, and whenever an immediate commit has already carried
 *     everything pending.
 *   - **The six focus checkboxes and the photo reference commit on CHANGE.** A discrete control's
 *     change IS the finished edit — there is no "still dragging" state to wait out.
 *   - **The four text fields commit on BLUR.** A keystroke debounce would queue an action per
 *     sentence. Blur is exactly one write per completed edit, at the moment the edit is finished.
 *
 * ── ONE ACTION PER COMMIT, AND IT ALWAYS CARRIES THE WHOLE DRAFT ────────────────────────────
 * Plan invariant 7 survives auto-save unchanged: one Server Action, the whole row — Next
 * dispatches actions one at a time per client, so eleven controls as eleven actions would stall
 * behind each other, and each action drags a re-rendered route back with it. The pipeline leans on
 * the whole-row rule three ways: a dial change inside the settle window coalesces into one write;
 * an immediate commit (a checkbox, a pick, a field blur) carries any dial still waiting in the
 * debounce and disarms the timer, so nothing pending is lost and nothing is double-sent; and a
 * debounce that matures while a save is still in flight simply queues behind it and re-sends the
 * whole draft — idempotent, and the fire-time equality check makes the common case free.
 *
 * One honest consequence: a commit carries the text fields as they stand, so an unfinished sentence
 * can spend a moment as the stored row if the dial settles mid-edit. The alternative — sending a
 * stale value to "protect" it — would write an older draft over the operator's newer words, which
 * is the one failure this pipeline exists to prevent.
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
 * The staged-commit panel locked every control on `pending`. Auto-save must not: locking on every
 * debounce settle would flicker the whole panel uneditable for the length of a round trip, and
 * editing during a save is safe here — the draft keeps accepting changes, the merge above protects
 * anything typed after dispatch, and the next commit carries the newest whole draft. `pending`
 * drives only the status line.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `CharacterPanel.tsx` states the reason and it is unchanged here: the plain-argument +
 * result-object convention on the sibling admin pages, and an operator-only tool gains nothing from
 * progressive enhancement that it does not lose in consistency. Validation is Zod on the server for
 * every field, either way.
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
  /**
   * The prefs as the row holds them at mount — the baseline the draft and the panel's `saved` copy
   * both start from. After mount the pipeline maintains `saved` itself from the action's results;
   * see "THE ROW THE PANEL BELIEVES IN" above for why the prop is not watched.
   */
  prefs: ImageGenDraft
  /**
   * `NINA_IMAGE_PREFS_DEFAULTS`, mapped — the baseline for "no longer the shipping default".
   * The global Reset is gone; this prop now drives `DialSlider`'s `defaultValue` marker and its
   * per-dial "default N" undo, which is the surviving route back to a single default.
   */
  defaults: ImageGenDraft
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
   * Every photograph the reference grid may offer, newest first, already mapped to a plain
   * serializable shape on the server.
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
   * it cannot do from `references.length` alone.
   */
  photoTotal: number
}

export function ImageGenPanel({
  userId,
  prefs,
  defaults,
  promptPreview,
  references,
  photoTotal,
}: ImageGenPanelProps) {
  /* What the controls show and edit. */
  const [draft, setDraft] = React.useState<ImageGenDraft>(prefs)
  /* What the panel believes the row holds. The predicate under every "unsaved" mark and the status
   * line is `changedImageGenFields(draft, saved)` — never the prop. See the header. */
  const [saved, setSaved] = React.useState<ImageGenDraft>(prefs)
  const [result, setResult] = React.useState<AdminImageGenResult | null>(null)
  /* Whether the dial debounce is armed — render-visible, because the timer itself lives in a ref
   * and the status line has to show the pending window. */
  const [commitArmed, setCommitArmed] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  /* The one debounce. A ref because it is a timer handle, not render state; armed/disarmed above
   * is the render-visible half. */
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /* The latest draft and saved row, for code that runs outside render (the timer's callback).
   * Mirrored in an effect — the sanctioned home for a ref write, and the shape `CharacterPanel.tsx`
   * uses for the same pipeline. NOT setState: the `react-hooks/set-state-in-effect` rule this repo
   * enforces rejects that, and nothing here needs it — the pipeline's state changes all happen in
   * event handlers and the transition. */
  const latest = React.useRef({ draft: prefs, saved: prefs })
  React.useEffect(() => {
    latest.current = { draft, saved }
  })

  /* Timer hygiene, the `ImageGenTestPanel.tsx` shape: the handle is cleared on unmount, so a
   * navigate-away inside the settle window cannot fire a save into a dead component. Cleared, not
   * flushed — the edit was never committed, exactly as an unclicked Save was never committed in
   * the staged-commit panel this file replaced. */
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const pendingFields = React.useMemo(
    () => new Set(changedImageGenFields(draft, saved)),
    [draft, saved],
  )
  const clean = pendingFields.size === 0
  /* "Saving…" covers both halves of the pending window: a commit in flight (`pending`) and a
   * commit waiting for the settle timer (`commitArmed`). Between the timer firing and the
   * transition opening, React batches the two updates, so there is no gap where neither shows. */
  const saving = pending || commitArmed
  /* `ImageGenTestPanel`'s warning is exactly this: the assembled prompt below was built from
   * `saved`, so a draft that differs from it is a prompt the test would not actually send. */
  const dirty = !clean
  const on = focusOnKeys(draft)
  const length = promptLengthCopy(draft.promptLength)

  /**
   * The draft's selection as the opaque key the picker's contract is written in. `''` is "nothing
   * selected" — phase 1's `NinaImageReference` carries `''`, never `null`, so every "is one
   * selected" question in this file is asked of this string rather than of `reference.id` directly.
   */
  const selectedKey = referenceKey(draft.reference)

  /** Disarm the settle timer. Safe to call when nothing is armed; the state write bails out. */
  function disarmCommit() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setCommitArmed(false)
  }

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
        promptLength: sent.promptLength,
        focus: sent.focus,
        wardrobe: sent.wardrobe,
        venue: sent.venue,
        time: sent.time,
        notes: sent.notes,
        promptTemplate: sent.promptTemplate,
        model: sent.model,
        reference: sent.reference,
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
   * The immediate path — the six focus checkboxes and the reference pick. `next` is the draft as
   * this control just produced it (a `setState` has not landed when its own `onChange` runs —
   * `MemoryTable`'s `commitFact` passes the patch for exactly this reason).
   *
   * Disarming is not an optimization: an immediate commit carries the WHOLE draft, so it subsumes
   * any dial still waiting in the debounce — clearing the timer here is what makes "nothing pending
   * is lost and nothing is double-sent" true rather than lucky.
   */
  function commitImmediate(next: ImageGenDraft) {
    setDraft(next)
    disarmCommit()
    if (imageGenDraftEquals(next, saved)) return
    dispatchSave(next)
  }

  /**
   * The dial's path — debounced. Every change re-arms the timer (one continuous drag is one save),
   * and the fire-time check re-reads the LIVE draft and saved row through the ref mirror: if an
   * immediate commit already sent everything while the timer ran, the dispatch is skipped rather
   * than duplicated. A draft that matches the saved row never arms at all — the second half of
   * "do not fire a save for a draft identical to the saved row" (the first half is this same check
   * on the immediate path).
   */
  function scheduleDialCommit(next: ImageGenDraft) {
    setDraft(next)
    if (imageGenDraftEquals(next, saved)) {
      disarmCommit()
      return
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCommitArmed(false)
      const { draft: draftNow, saved: savedNow } = latest.current
      if (imageGenDraftEquals(draftNow, savedNow)) return
      dispatchSave(draftNow)
    }, IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS)
    setCommitArmed(true)
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
   * finished edit. It rides the one whole-row save, so it carries anything still pending (the
   * dial, an unsent textarea) exactly the way a checkbox does.
   */
  function setModel(next: string) {
    commitImmediate({ ...draft, model: next })
  }

  /**
   * The five text controls' commit moment — `MemoryTable`'s rule verbatim: blur is exactly one
   * write per completed edit, at the moment the edit is finished. NEVER a keystroke debounce; see
   * the header. Typing changed ONLY the draft, so the blur reads the draft the keystrokes already
   * landed — and it disarms first, so it carries any dial still settling.
   *
   * Defined LAST among the handlers, directly above the JSX: every one of the four fields and the
   * template textarea mount it as `onBlur={commitText}`.
   */
  function commitText() {
    disarmCommit()
    if (imageGenDraftEquals(draft, saved)) return
    dispatchSave(draft)
  }

  /**
   * The template's route back to the shipped shell — an immediate commit, like every discrete
   * control, because the click IS the finished edit. It stores the default TEMPLATE itself rather
   * than `''`; both render identically, and the stored text is what the operator will see in the
   * box the next time the page loads.
   */
  function resetTemplate() {
    commitImmediate({ ...draft, promptTemplate: NINA_PROMPT_TEMPLATE_DEFAULT })
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
          prompt length {draft.promptLength} &middot; {on.length} of {NINA_IMAGE_FOCUS_KEYS.length}{' '}
          emphasised
          {selectedKey !== '' && ' · one reference'}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Everything on this page goes into the <strong>image</strong> prompt, not into her voice,
          and every change saves itself — the dial when its drag settles, a checkbox or a photograph
          the moment you pick it, the text fields when you leave them.{' '}
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
            unsaved={pendingFields.has('promptLength')}
            onChange={(value) => scheduleDialCommit({ ...draft, promptLength: value })}
          />
        </section>

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
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.wardrobe.label}
              {pendingFields.has('wardrobe') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.wardrobe}
              maxLength={NINA_IMAGE_WARDROBE_MAX}
              placeholder={NINA_IMAGE_TEXT_SPECS.wardrobe.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, wardrobe: event.target.value }))
              }
              onBlur={commitText}
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              What she is wearing. Leave it empty and she wears what the canon says.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.venue.label}
              {pendingFields.has('venue') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.venue}
              maxLength={NINA_IMAGE_VENUE_MAX}
              placeholder={NINA_IMAGE_TEXT_SPECS.venue.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, venue: event.target.value }))
              }
              onBlur={commitText}
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Where she is. This is a standing preference; the scene she picks per photograph still
              sits above it.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.time.label}
              {pendingFields.has('time') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <input
              className={CONTROL_CLASS}
              value={draft.time}
              maxLength={NINA_IMAGE_TIME_MAX}
              placeholder={NINA_IMAGE_TEXT_SPECS.time.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, time: event.target.value }))
              }
              onBlur={commitText}
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Time of day and weather, in your own words.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
              {NINA_IMAGE_TEXT_SPECS.notes.label}
              {pendingFields.has('notes') && (
                <span className="ml-2 font-semibold text-accent">unsaved</span>
              )}
            </span>
            <textarea
              className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
              value={draft.notes}
              maxLength={NINA_IMAGE_NOTES_MAX}
              placeholder={NINA_IMAGE_TEXT_SPECS.notes.placeholder}
              onChange={(event) =>
                setDraft((current) => ({ ...current, notes: event.target.value }))
              }
              onBlur={commitText}
            />
            <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
              Anything no other field can say. Handed to the camera verbatim — this is the image
              prompt, not her system prompt. It saves when you leave the field.
            </span>
          </label>
        </div>

        <PhotoReferencePicker
          items={references}
          total={photoTotal}
          value={selectedKey}
          onChange={(next) => setReference(parseReferenceKey(next))}
        />

        {/*
         * The editable template shell (the 2026-09-10 ask). It sits here — after every control
         * whose values flow INTO it, before the assembled preview that shows it — because it is
         * the outermost thing on this page: the dial, the checkboxes and the four fields are what
         * the blocks say, and this textarea is where the blocks stand.
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
          <p className="mb-3 mt-1 max-w-[70ch] text-[11px] font-medium text-ink-3">
            The skeleton every photograph is assembled from. Each{' '}
            <code className="font-mono text-[11px] text-ink-2">{'{{placeholder}}'}</code> stands
            for one whole block from the controls above — labels included — and a block that is
            empty takes its whole line with it. Reorder them, delete them, or write your own prose
            around them; it saves when you leave the field, and the placeholder spelling itself
            cannot be saved broken.
          </p>
          <textarea
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
                <span className="text-[11px] font-medium leading-snug text-ink-3">
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
         * while a debounce is armed or a blur-pending edit exists), which is still exactly the
         * warning the test wants: the test runs the SAVED row, so an operator mid-edit is warned
         * rather than handed a verdict on a prompt he is not looking at.
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
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
      </div>
    </section>
  )
}
