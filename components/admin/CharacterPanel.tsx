'use client'

import * as React from 'react'

import { DialSlider } from '@/components/admin/DialSlider'
import { CONTROL_CLASS } from '@/components/ui'
import { saveNinaTuningAction, type AdminTuningResult } from '@/lib/admin/tuningActions'
import {
  changedTuningFields,
  loudestDials,
  mergeTuningAfterSave,
  relationshipCopy,
  TUNING_DIAL_COMMIT_DEBOUNCE_MS,
  tuningCopy,
  tuningDraftEquals,
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
} from '@/lib/nina/tuning'

/**
 * **Her character** — R1's *"full nina character tuning in /admin/nina page / make several sliding
 * bars"*, R2's relationship, R3's extra dials, R4's toggles, now on a route of its own — and,
 * since the simplify set, saving itself: every control commits at the moment its edit is
 * finished, and the staged-commit row this panel carried from the start is gone.
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
 * dials, how many parameters are off — is carried by the section header, where it is the same
 * one-line answer to "what is she set to" that the hub card gives.
 *
 * **`id="character"` survives on that section root**, and it is not decoration: for two plan sets
 * the overview card deep-linked to this panel by that `#character` fragment on the album route.
 * The card now points at `/admin/personality`, and a bookmark someone kept still lands on the
 * panel rather than on a fragment that resolves to nothing. It costs one attribute.
 *
 * The old URL is deliberately not spelled out here: plan invariant 10 greps `app components lib
 * tests` for it and must come back empty, so that even a mention in a comment cannot be
 * mistaken for a live reference.
 *
 * ── EVERY CONTROL COMMITS ITSELF — AND WHY THAT IS SAFE HERE ────────────────────────────────
 * The simplify set's R2: *"remove the Discard and Reset buttons; make Personality auto-save
 * every time a change is made."* There is no Save button, no discard, no global reset, nothing
 * to confirm. Four properties make committing on every edit safe rather than reckless:
 *
 *   1. **One writer.** `nina_tuning` is one row per account, upserted on `user_id` by
 *      `writeNinaTuning` — there is no history to fork and no list to reconcile.
 *   2. **One operator.** The admin surface is one person; there is no second editor whose
 *      in-flight draft this panel could silently overwrite.
 *   3. **Sequential dispatch.** Next dispatches Server Actions one at a time per client
 *      (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on
 *      the client"), so commits cannot interleave out of order even when several queue up.
 *   4. **The write is an idempotent whole-row upsert.** Every commit sends the complete tuning,
 *      so a commit that duplicates another or queues behind it writes the same truth. The
 *      failure mode of auto-save here is a wasted round trip, never a half-written character.
 *
 * ── THE COMMIT MOMENTS ARE `MemoryTable`'s RULE, NOT A STYLE CHOICE ─────────────────────────
 * `components/admin/MemoryTable.tsx` records the measured precedent for no-Save-button admin
 * cells ("HOW A CELL SAVES, AND WHY IT IS BLUR AND NOT A DEBOUNCE") and this panel follows it
 * control-kind by control-kind:
 *
 *   - **The notes commit on BLUR.** A keystroke debounce would queue actions AND queue
 *     `revalidatePath` re-renders, and the operator's cursor would spend the session fighting
 *     them. Blur is exactly one write per completed edit, at the moment the edit is finished —
 *     which is also what makes "no Save button" true rather than cosmetic.
 *   - **The relationship radios and every toggle commit on CHANGE.** A discrete control's change
 *     IS the finished edit — there is no "still dragging" state to wait out.
 *   - **The dials commit DEBOUNCED, `TUNING_DIAL_COMMIT_DEBOUNCE_MS` after the last change.** A
 *     range input fires `change` on every pointer move and KEEPS FOCUS after the thumb is
 *     released, so blur — the notes' moment — does not exist for a slider. The debounce is the
 *     settle detector: one continuous drag becomes one save, and the timer is cleared on re-arm,
 *     on unmount, and whenever an immediate commit has already carried everything pending.
 *
 * ── ONE ACTION PER COMMIT, AND IT ALWAYS CARRIES THE WHOLE TUNING ───────────────────────────
 * Plan invariant 3 (the character-tuning set's invariant 11) survives auto-save unchanged: one
 * Server Action, the whole row — Next dispatches actions one at a time per client, so seventeen
 * dials as seventeen actions would stall behind each other, and each action drags a re-rendered
 * route back with it. The pipeline leans on the whole-row rule three ways: two dials dragged
 * within the window coalesce into one write; an immediate commit (radio, toggle, notes blur)
 * carries any dial still waiting in the debounce and disarms the timer, so nothing pending is
 * lost and nothing is double-sent; and a debounce that matures while a save is still in flight
 * simply queues behind it and re-sends the whole draft — idempotent, and the fire-time equality
 * check makes the common case free.
 *
 * One honest consequence: a commit carries the notes as they stand, so an unfinished sentence can
 * spend a moment as the stored row if a dial settles mid-edit. The alternative — sending a stale
 * notes value to "protect" it — would write an older draft over the operator's newer words, which
 * is the one failure this pipeline exists to prevent.
 *
 * ── THE ROW THE PANEL BELIEVES IN ───────────────────────────────────────────────────────────
 * `saved` is the panel's copy of the stored row. It starts as the `tuning` prop and is updated
 * ONLY from the action's own result: the save returns the row after `coerceNinaTuning`, and the
 * response carries both that value and the re-rendered route in one round trip
 * (`server-actions.md`, "A single response carries data and UI"), so reading the row off the
 * result is the same freshness as reading it off the prop — without having to tell "my save
 * landed" apart from "the row changed under me". Nothing else writes this row (one operator), so
 * the only way it changes under the panel is the panel's own save coming back; no other sync
 * exists, and the prop is the mount-time baseline and a fresh page load, nothing more.
 *
 * The draft does NOT blindly adopt the canonical row: `coerceNinaNotes` trims and collapses, so
 * the stored row can differ cosmetically from what was typed, and the operator may have kept
 * editing while the save was in flight. `mergeTuningAfterSave(current, sent, canonical)` adopts
 * the stored value only for fields still equal to what was dispatched; a field edited since
 * keeps the newer local value and stays pending, riding the next commit.
 *
 * ── NOTHING IS DISABLED WHILE A SAVE IS IN FLIGHT ───────────────────────────────────────────
 * The staged-commit panel locked every control on `pending`. Auto-save must not: locking on
 * every debounce settle would flicker the whole panel uneditable for the length of a round trip,
 * and editing during a save is safe here — the draft keeps accepting changes, the merge above
 * protects anything typed after dispatch, and the next commit carries the newest whole draft.
 * `pending` drives only the status line.
 *
 * ── `useTransition`, NOT `<form action={…}>` ────────────────────────────────────────────────
 * `MemorySlots.tsx` states the reason and it is unchanged here: phase 15's album manager set the
 * plain-argument + result-object convention on the sibling admin page, and a desktop-only tool
 * gains nothing from progressive enhancement that it does not lose in consistency. Validation is
 * Zod on the server for every field, either way.
 *
 * ── THE TOGGLES RIDE THE SAME WHOLE-ROW COMMIT (R4) ─────────────────────────────────────────
 * *"we need an on/off toggle for each parameter, so we can exclude some parameters to make prompt
 * more accurate."* Each checkbox edits `draft.enabled[key]` and commits immediately — the same
 * one action carries the whole map with the scores. Seventeen toggles as seventeen actions is
 * the same stall the seventeen dials would have been, and for the same reason: Next dispatches
 * Server Actions one at a time per client.
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
 * boundary. `saveNinaTuningAction` crosses it as a client reference the way every action in this
 * package does, and `AdminTuningResult`'s `tuning` is the same plain draft shape coming back.
 * `tests/admin.tuning.test.ts` asserts all of this.
 */

export interface CharacterPanelProps {
  userId: string
  /**
   * The tuning as the row holds it at mount — the baseline the draft and the panel's `saved`
   * copy both start from. After mount the pipeline maintains `saved` itself from the action's
   * results; see "THE ROW THE PANEL BELIEVES IN" above for why the prop is not watched.
   */
  tuning: TuningDraft
  /** `NINA_TUNING_DEFAULTS`, mapped — the baseline for "no longer the Nina who shipped". */
  defaults: TuningDraft
  /**
   * `buildNinaSystemPrompt(tuning)`, assembled on the SERVER from the SAVED tuning.
   *
   * It is not recomputed as the sliders move, and that is deliberate rather than a limitation: the
   * assembler reaches the whole persona, and shipping that into the browser to preview a string
   * would put Nina's canon in a client bundle to save one round trip. Every commit's
   * `revalidatePath` re-renders the page, so the preview catches up in the same response the
   * save returned — and its summary line below says when it is stale.
   */
  promptPreview: string
}

export function CharacterPanel({ userId, tuning, defaults, promptPreview }: CharacterPanelProps) {
  /* What the controls show and edit. */
  const [draft, setDraft] = React.useState<TuningDraft>(tuning)
  /* What the panel believes the row holds. The predicate under every "unsaved" mark and the
   * status line is `changedTuningFields(draft, saved)` — never the prop. See the header. */
  const [saved, setSaved] = React.useState<TuningDraft>(tuning)
  const [result, setResult] = React.useState<AdminTuningResult | null>(null)
  /* Whether the dial debounce is armed — render-visible, because the timer itself lives in a ref
   * and the status line has to show the pending window. */
  const [commitArmed, setCommitArmed] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  /* The one debounce. A ref because it is a timer handle, not render state; armed/disarmed above
   * is the render-visible half. */
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /* The latest draft and saved row, for code that runs outside render (the timer's callback).
   * Mirrored in an effect — the sanctioned home for a ref write, and the shape
   * `ImageGenTestPanel.tsx` uses for its own out-of-render state. NOT setState: the
   * `react-hooks/set-state-in-effect` rule this repo enforces rejects that, and nothing here
   * needs it — the pipeline's state changes all happen in event handlers and the transition. */
  const latest = React.useRef({ draft: tuning, saved: tuning })
  React.useEffect(() => {
    latest.current = { draft, saved }
  })

  /* Timer hygiene, the `ImageGenTestPanel.tsx:94-136` shape: the handle is cleared on unmount, so
   * a navigate-away inside the settle window cannot fire a save into a dead component. Cleared,
   * not flushed — the edit was never committed, exactly as an unclicked Save was never committed
   * in the staged-commit panel this file replaced. */
  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  const pendingFields = React.useMemo(
    () => new Set(changedTuningFields(draft, saved)),
    [draft, saved],
  )
  const clean = pendingFields.size === 0
  /* "Saving…" covers both halves of the pending window: a commit in flight (`pending`) and a
   * commit waiting for the settle timer (`commitArmed`). Between the timer firing and the
   * transition opening, React batches the two updates, so there is no gap where neither shows. */
  const saving = pending || commitArmed
  const loud = loudestDials(draft, defaults)
  /* How many parameters are excluded from her prompt entirely (R4). It goes in the section header
   * because it is the one setting that cannot be inferred from the numbers underneath it. */
  const off = Object.values(draft.enabled).filter((value) => value === false).length

  /**
   * One control's pending dot covers BOTH of its paths — the score and the toggle. Two dots on
   * one row would be an operator wondering which of two identical marks meant what, and the
   * answer to "is this row what the database holds" is one boolean. Same predicate and same word
   * ("unsaved") as the staged-commit panel — what changed is the baseline it is measured against:
   * `saved`, the panel's live belief, rather than a prop that only moves on a re-render.
   */
  function rowPending(path: string, key: string): boolean {
    return pendingFields.has(path) || pendingFields.has(`enabled.${key}`)
  }

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
   * point for "edited since dispatch". The whole row goes, every time (plan invariant 3); the
   * action's `tuning` comes back canonical and is adopted per-field.
   *
   * The previous error is cleared as the new attempt starts, the way `MemoryTable` clears a row's
   * result when its cell is edited again.
   */
  function dispatchSave(sent: TuningDraft) {
    setResult(null)
    startTransition(async () => {
      const outcome = await saveNinaTuningAction({
        userId,
        traits: sent.traits,
        dials: sent.dials,
        enabled: sent.enabled,
        relationship: sent.relationship,
        notes: sent.notes,
      })
      if (!outcome.ok || outcome.tuning === undefined) {
        /* Nothing was written, so `saved` stays where it was — the panel is still pending
         * exactly the fields it was pending before, and the sentence says what to do. */
        setResult(outcome)
        return
      }
      const canonical = outcome.tuning
      setSaved(canonical)
      setDraft((current) => mergeTuningAfterSave(current, sent, canonical))
    })
  }

  /**
   * The immediate path — radios, every toggle, the notes' blur. `next` is the draft as this
   * control just produced it (a `setState` has not landed when its own `onChange` runs —
   * `MemoryTable`'s `commitFact` passes the patch for exactly this reason).
   *
   * Disarming is not an optimization: an immediate commit carries the WHOLE draft, so it
   * subsumes any dial still waiting in the debounce — clearing the timer here is what makes
   * "nothing pending is lost and nothing is double-sent" true rather than lucky.
   */
  function commitImmediate(next: TuningDraft) {
    setDraft(next)
    disarmCommit()
    if (tuningDraftEquals(next, saved)) return
    dispatchSave(next)
  }

  /**
   * The dials' path — debounced. Every change re-arms the timer (one continuous drag is one
   * save), and the fire-time check re-reads the LIVE draft and saved row through the ref mirror:
   * if an immediate commit already sent everything while the timer ran, the dispatch is skipped
   * rather than duplicated. A draft that matches the saved row never arms at all — the second
   * half of "do not fire a save for a draft identical to the saved row" (the first half is this
   * same check on the immediate path).
   */
  function scheduleDialCommit(next: TuningDraft) {
    setDraft(next)
    if (tuningDraftEquals(next, saved)) {
      disarmCommit()
      return
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCommitArmed(false)
      const { draft: draftNow, saved: savedNow } = latest.current
      if (tuningDraftEquals(draftNow, savedNow)) return
      dispatchSave(draftNow)
    }, TUNING_DIAL_COMMIT_DEBOUNCE_MS)
    setCommitArmed(true)
  }

  /**
   * R4's toggle — an immediate commit, like every discrete control. The score it shares a row
   * with is untouched; see the header.
   */
  function setEnabled(key: string, next: boolean) {
    commitImmediate({ ...draft, enabled: { ...draft.enabled, [key]: next } })
  }

  function setTrait(key: string, value: number) {
    scheduleDialCommit({ ...draft, traits: { ...draft.traits, [key]: value } })
  }

  function setDial(key: string, value: number) {
    scheduleDialCommit({ ...draft, dials: { ...draft.dials, [key]: value } })
  }

  /** Absent means ON, everywhere in this feature. One reader for that rule in this file. */
  function isOn(key: string): boolean {
    return draft.enabled[key] ?? true
  }

  /**
   * The notes' commit moment — `MemoryTable`'s rule verbatim: blur is exactly one write per
   * completed edit, at the moment the edit is finished. NEVER a keystroke debounce; see the
   * header. The blur carries the whole draft, so it also subsumes any dial still settling.
   */
  function commitNotes() {
    disarmCommit()
    if (tuningDraftEquals(draft, saved)) return
    dispatchSave(draft)
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
          {/*
           * The save-status surface, where the "N unsaved" counter used to be. Tri-state, and the
           * third state is not decoration: "Unsaved edits" is what shows while the operator TYPES
           * (a keystroke commits nothing — that is the rule) and after a FAILED save (the error
           * sentence renders below). `aria-live="polite"` because this is the one line that
           * changes on its own, and "Saved" is worth hearing without stealing focus.
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
          {relationshipCopy(draft.relationship).label} &middot;{' '}
          {loud.length === 0
            ? 'every dial at its default'
            : loud
                .map((dial) => `${tuningCopy(dial.key).label.toLowerCase()} ${dial.value}`)
                .join(', ')}
          {off > 0 && ` · ${off} off`}
        </span>
      </div>

      <div className="pb-6">
        <p className="mb-6 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Every dial below goes into her system prompt, and every change saves itself — a dial when
          its drag settles, a switch the moment you flip it, the notes when you leave the field.{' '}
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
                aria-label="Include the relationship in her prompt"
                onChange={(event) => setEnabled(NINA_TUNING_RELATIONSHIP_KEY, event.target.checked)}
                className="size-4 shrink-0 accent-accent"
              />
              <span>Relationship</span>
            </label>
            {rowPending('relationship', NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
            {!isOn(NINA_TUNING_RELATIONSHIP_KEY) && (
              <span className="ml-2 font-medium text-ink-3">
                off — she is the best friend who shipped
              </span>
            )}
          </legend>
          {/* R1 — "to make it a nice 3 columns x 2 rows". The BREAKPOINTS do not move (index
              decision D2: `AdminNav` is `lg:sticky` in this grid's first column, so three cards
              only have legible room from `xl`). What was ragged is ROW-TO-ROW height. Grid items
              already stretch inside their own row — the container's `align-items` is `normal`,
              which behaves as `stretch` for grid items, and the label's `items-start` below is
              the LABEL's own flex axis, aligning the radio against the text rather than the card
              against its cell. But the implicit rows are `auto`, so the row holding the longest
              hint is taller than the other, and `relationshipCopy`'s hints vary by about 3x.
              `auto-rows-fr` is `grid-auto-rows: minmax(0, 1fr)`, and in a grid whose height is
              indefinite an `fr` row resolves to the largest max-content contribution of the items
              crossing it — so every row becomes the height of the tallest card and six cards read
              as a rectangle. Left off below `sm`, where one column has no rectangle to make and
              equal rows would only pad the short cards. */}
          <div className="grid gap-2 sm:auto-rows-fr sm:grid-cols-2 xl:grid-cols-3">
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
                    onChange={() => commitImmediate({ ...draft, relationship: value })}
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
                  unsaved={rowPending(`traits.${key}`, key)}
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
                  unsaved={rowPending(`dials.${key}`, key)}
                  enabled={isOn(key)}
                  onEnabledChange={(next) => setEnabled(key, next)}
                  onChange={(value) => setDial(key, value)}
                />
              )
            })}
          </div>
        </section>

        {/*
         * ── ONE FIELD HERE NOW, AND THE GRID WENT WITH THE OTHER ONE ───────────────────────
         * This was a two-column `xl:grid-cols-2` row holding Wardrobe beside Notes. F41 R3 moved
         * the wardrobe to `/admin/image-generation` — *"remove Wardrobe field in
         * /admin/personality (this new feature is more detailed version of it)"* — and a
         * two-column grid with a single child renders that child at half width with an empty cell
         * beside it, which reads as a control that failed to load rather than as a layout. So the
         * wrapper is gone rather than left half-empty, and Notes is a plain block.
         *
         * `max-w-[70ch]` and not full width: this is a prose textarea, and 70ch is the measure
         * every hint on this page already uses (`max-w-[70ch]` on both section descriptions and on
         * the page header). An `xl` viewport would otherwise stretch it to a line length nobody
         * writes prose at, which is a worse answer than the half-empty grid was.
         *
         * The leading `*` on every line is load-bearing, not style: `ci:client-secret-guard`'s
         * Rule 3 exempts only lines a comment scanner recognises, and a JSX comment with bare
         * prose continuation lines fails the guard. `app/admin/personality/page.tsx` records the
         * same detail about its own JSX comment.
         *
         * The commit moment is on the element: `onBlur={commitNotes}`. Typing changes ONLY the
         * draft — no timer, no dispatch — which is the whole blur-not-debounce rule.
         */}
        <label className="mb-6 block max-w-[70ch]">
          <span className="mb-1.5 block text-[12px] font-semibold tracking-[0.02em] text-ink-2">
            Notes
            {pendingFields.has('notes') && (
              <span className="ml-2 font-semibold text-accent">unsaved</span>
            )}
          </span>
          <textarea
            className={cn(CONTROL_CLASS, 'min-h-[76px] resize-y py-2 leading-snug')}
            value={draft.notes}
            maxLength={NINA_NOTES_MAX}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            onBlur={commitNotes}
          />
          <span className="mt-1.5 block max-w-[46ch] text-[11px] font-medium text-ink-3">
            Free text, handed to her verbatim in the system prompt. Anything no dial can say. It
            saves when you leave the field.
          </span>
        </label>

        <details className="mb-6 rounded-card bg-paper-2 p-4">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            The assembled system prompt
            {!clean && (
              <span className="ml-2 font-medium text-ink-3">
                (as saved — the edits above are not in it yet)
              </span>
            )}
          </summary>
          <pre className="mt-3 max-h-[420px] overflow-auto text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {promptPreview}
          </pre>
        </details>

        {/*
         * The failure surface, and the only rendering of `result`. A successful save is the
         * status line's job ("Saved", no qualifier); this paragraph exists for the sentence an
         * operator needs to act on.
         */}
        {result?.ok === false && (
          <p className="mb-3 text-[12px] font-semibold text-red">{result.error}</p>
        )}
      </div>
    </section>
  )
}
