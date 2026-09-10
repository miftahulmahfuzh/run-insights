import {
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_FOCUS_SPECS,
  NINA_IMAGE_REFERENCE_SOURCES,
  ninaPromptLengthRungFor,
  type NinaImagePrefs,
} from '@/lib/nina/imageprefs'
import { ninaBand } from '@/lib/nina/tuning'

/**
 * `/admin/image-generation`'s panel, as data and pure functions — the client-safe half.
 *
 * ── WHY THIS FILE EXISTS AT ALL ──────────────────────────────────────────────────────────────
 * `lib/admin/tuningModel.ts`'s reasoning, one feature over and unchanged: `app/admin/page.tsx` and
 * `app/admin/image-generation/page.tsx` are Server Components and `components/admin/ImageGenPanel.tsx`
 * is `'use client'`. A Server Component cannot read a plain export out of a `'use client'` module,
 * so the copy and the diffing cannot live in the panel.
 *
 * **This file imports exactly TWO modules, `@/lib/nina/imageprefs` and `@/lib/nina/tuning`, and
 * `tests/admin.imagegen.test.ts` asserts that.** Values as well as types, because the labels, the
 * hints and the bounds all come from there — safe, and checked, precisely because both of phase 1's
 * modules have zero imports of their own.
 *
 * The second import is not a convenience. `ninaPromptLengthRungFor` takes a BAND INDEX, and the
 * band mapping is `ninaBand` in `lib/nina/tuning.ts` — which `lib/nina/imageprefs.ts` deliberately
 * does not re-declare, because a second copy of the band vocabulary is a scale that can drift.
 * Phase 1's Handoff says it directly: *"render the band caption via
 * `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score."*
 * Re-deriving the five boundaries locally is forbidden — a private scale is a slider the operator
 * cannot predict. `lib/admin/tuningModel.ts` already imports `@/lib/nina/tuning` for exactly this
 * class of reason, so the client-bundle safety is precedent rather than a new claim.
 *
 * ── THE READ-SIDE ADAPTATION SEAM ────────────────────────────────────────────────────────────
 * `toImageGenDraft` is ONE of exactly TWO functions in this phase that know phase 1's field names
 * (`lib/admin/imageGenActions.ts`'s `toImagePrefsWrite` is the other). Everything above the seam
 * works in `ImageGenDraft`, whose focus map is a plain `Record<string, boolean>` and whose
 * reference `source` is a plain `string` — so if phase 1 named or grouped its fields differently,
 * two small functions change and no component does.
 *
 * ── EVERY LABEL, HINT AND BOUND IS PHASE 1'S ─────────────────────────────────────────────────
 * There is no copy table in this file, for `tuningModel.ts`'s three recorded reasons, and the
 * third is the one that decides it here: **the six focus options are the user's own words** — face,
 * skin, big boobs, bubble butt, big thighs, very long calves. They are prompt text, not copy. They
 * live in `NINA_IMAGE_FOCUS_SPECS[key].label`, the prompt's emphasis terms are keyed by the same
 * `NinaImageFocusKey` (`NINA_FOCUS_EMPHASIS`, `lib/nina/imagegen.ts`), and this file only reads
 * them, so the panel cannot promise an emphasis the prompt does not add. A label
 * typed into the JSX would be a second source of truth for a vocabulary the user dictated.
 *
 * What IS local is genuinely local: `LENGTH_BAND_NOTE` below is editorial about the SURFACE
 * ("read the assembled prompt underneath") and makes no claim about what a rung adds, which is
 * phase 2's business and is visible in the preview rather than described here.
 */

/** What a browser edits: phase 1's row, with its vocabulary loosened for the adaptation seam. */
export interface ImageGenDraft {
  /** R4. 0-100 on phase 1's scale, read through its five bands. */
  promptLength: number
  /**
   * R5, keyed by `NINA_IMAGE_FOCUS_KEYS`. `Record<string, boolean>` rather than the key union for
   * the same reason `TuningDraft.enabled` is loose: this is the adaptation seam, and a component
   * that reads `draft.focus[key] ?? false` survives a key the model has and the panel has not
   * caught up with.
   *
   * **Absent means OFF here, and that is the opposite of `TuningDraft.enabled`.** The difference is
   * deliberate and it is R1's: a focus option adds an EMPHASIS clause on top of a body canon that
   * ships unconditionally, so an unknown key defaulting to "on" would add emphasis nobody asked
   * for, whereas an unknown tuning parameter defaulting to "off" would silently delete text.
   */
  focus: Record<string, boolean>
  /** R6. */
  wardrobe: string
  /** R7. */
  venue: string
  /** R8. */
  time: string
  /** R9. */
  notes: string
  /**
   * The editable template shell (the 2026-09-10 ask). `''` = the shipping default, exactly as
   * `NinaImagePrefs.promptTemplate` spells it — the panel edits the shell it was handed, and the
   * validator (`validateNinaImageTemplate`) is what both the save and the render agree on.
   */
  promptTemplate: string
  /**
   * R10's selection, persisted by THIS phase's save so that phase 5 only has to supply the grid.
   *
   * **`source`, not `kind`, and `id` is `string` with `''` as the one empty value** — phase 1's
   * `NinaImageReference` exactly (`lib/nina/imageprefs.ts` §4). `''`-is-empty rather than `null` is
   * `nina_tuning.wardrobe`'s convention and `nina_image_prefs` is that table's sibling.
   * `source` is loose (`string`) for the same seam reason as everything else here;
   * `ninaImagePrefsWriteSchema` narrows it to `NINA_IMAGE_REFERENCE_SOURCES` at the boundary.
   */
  reference: { source: string; id: string }
}

/** One control's user-facing text. The label goes beside the control; the hint goes under it. */
export interface ImageGenCopy {
  label: string
  hint: string
  /**
   * The band name for a slider's current value, `''` for a control that has no scale.
   *
   * It is a MEMBER and not something a caller digs out of `hint` with a `split('.')`, because two
   * surfaces read it — the slider's hint here and `/admin`'s hub card — and string surgery on a
   * sentence one of them owns is the kind of coupling that breaks when the sentence is reworded.
   */
  band: string
}

/**
 * "Nothing selected", spelled ONCE.
 *
 * This is the only string literal in the whole phase that names a member of phase 1's
 * `NINA_IMAGE_REFERENCE_SOURCES`, and `tests/admin.imagegen.test.ts` asserts that phase 1 still
 * declares it — so a rename over there fails a test here instead of silently producing a reference
 * source the Zod boundary rejects at save time.
 */
export const IMAGE_REFERENCE_NONE: ImageGenDraft['reference'] = { source: 'none', id: '' }

/**
 * The `SCENE:` line the PREVIEW and the test dispatch stand in with.
 *
 * The prefs are the operator's standing opinion about how she is photographed; the SCENE is still
 * hers per photograph, chosen by the chat model's `generate_image` argument (the plan's Scope keeps
 * `scene` and `mood` on that tool for exactly this reason). So the operator has not chosen one, and
 * the preview needs one, because `buildNinaImagePrompt` takes a scene and this phase calls the REAL
 * assembler rather than a reconstruction of it.
 *
 * Three candidates, and the choice matters because whatever goes here is what the operator judges
 * the prompt by:
 *
 *   `''`                     — REJECTED. Phase 2's assembler emits `SCENE: ` with nothing after it,
 *                              which is a malformed line the real path never produces, so the
 *                              preview would be unrepresentative in exactly the place it is meant
 *                              to be authoritative.
 *   the venue pref           — REJECTED. The venue already has its own `VENUE:` block. Splicing it
 *                              into the scene as well would double it and make the preview show a
 *                              prompt no real generation sends.
 *   a plain literal          — CHOSEN. One neutral sentence, deliberately saying nothing about
 *                              where or when she is, so that every word the operator reads under
 *                              `VENUE:`, `TIME:` and `NOTES:` came from a field he filled in.
 *
 * **Phase 6's test dispatch must send this same constant**, or the verdict it reports would be a
 * verdict on a prompt the operator never read. It is exported for that.
 */
export const ADMIN_IMAGE_PREVIEW_SCENE = 'a phone photograph she is taking of herself right now'

/**
 * What the reference grid needs per photograph, and **nothing more.**
 *
 * There is no `createdAt` and no filename here on purpose. R10 is *"a simple photos grid without
 * any captions (just like ios album app)"*, and phase 5's exit criterion is *"no caption, no
 * filename and no date on any tile"*. A field that is not serialized to the client cannot be
 * rendered onto a tile by a later edit, so the requirement holds by construction rather than by
 * review. Ordering is the query's (newest first) and is carried by array position.
 *
 * ── THREE FIELDS, AND THE SET IS NOT ONE OF THEM ─────────────────────────────────────────────
 * **RECONCILED against phase 5.** This type is deliberately made *structurally identical* to phase
 * 5's `PhotoReferenceItem` — `{ key, url, thumbUrl }` and nothing else — so phase 5's mount is
 * `items={references}` and typechecks **without this phase importing from phase 5's file**, which
 * it cannot do: phase 5 lands after this one and the module would not exist.
 *
 * There is no `kind` and no `source` on the tile, and that is phase 5's exit criterion held
 * structurally rather than by discipline: *nothing in the grid announces which set a photograph
 * came from*. A tile that has no `source` **cannot** render a set badge. Phase 5's test asserts the
 * field list is exactly `['key', 'thumbUrl', 'url']`, so this shape is load-bearing on both sides.
 *
 * The set survives inside `key`, which is `` `${source}:${id}` `` — enough to address the row for a
 * save, and opaque to the component, which never parses it.
 */
export interface ImageReferenceOption {
  /** `referenceKey(...)` of this photograph. The exact string the save persists. */
  key: string
  url: string
  /** `null` for a chat photograph — `nina_message_images` has no `thumb_url` column. */
  thumbUrl: string | null
}

/**
 * Phase 1's `NinaPhotoRef` -> what a browser can hold. Structural in its parameter, so the row
 * type's *name* does not matter; only these four members do.
 *
 * Note `blobUrl`, not `url`: that is `NinaPhotoRef`'s spelling (phase 1 §5).
 */
export function toImageReferenceOption(row: {
  source: string
  id: string
  blobUrl: string
  thumbUrl?: string | null
}): ImageReferenceOption {
  return {
    key: referenceKey({ source: row.source, id: row.id }),
    url: row.blobUrl,
    thumbUrl: row.thumbUrl ?? null,
  }
}

/**
 * A stable identity for one photograph across the two tables. React keys, equality, and the
 * picker's `value`/`onChange` currency.
 *
 * **`''` for no reference**, which is phase 5's `PHOTO_REFERENCE_NONE` and phase 1's
 * `NINA_IMAGE_REFERENCE_NONE` agreeing on one empty value.
 */
export function referenceKey(reference: { source: string; id: string }): string {
  if (reference.source === IMAGE_REFERENCE_NONE.source || reference.id === '') return ''
  return `${reference.source}:${reference.id}`
}

/**
 * The other direction — **the second half of the adaptation seam, and the reason phase 5 never has
 * to know what a reference is.**
 *
 * The picker hands back an opaque `string`; this turns it into the `{ source, id }` the draft and
 * the Zod boundary want. It is total and never throws: anything it cannot read is no reference at
 * all, because a half-selection is not representable (phase 1's `coerceNinaImageReference` makes
 * the same choice at the store, and this is the client-side mirror of it, not a second authority).
 *
 * `indexOf` rather than `split(':')`: an id containing a colon would make `split` produce three
 * parts and drop the tail, whereas the first colon is unambiguously the separator.
 * `NINA_IMAGE_REFERENCE_ID_RE` forbids a colon in an id anyway, so this is belt and braces on a
 * string that arrives from a component.
 */
export function parseReferenceKey(key: string): ImageGenDraft['reference'] {
  const cut = key.indexOf(':')
  if (cut <= 0) return IMAGE_REFERENCE_NONE
  const source = key.slice(0, cut)
  const id = key.slice(cut + 1)
  if (id === '' || source === IMAGE_REFERENCE_NONE.source) return IMAGE_REFERENCE_NONE
  if (!(NINA_IMAGE_REFERENCE_SOURCES as readonly string[]).includes(source)) {
    return IMAGE_REFERENCE_NONE
  }
  return { source, id }
}

/**
 * Phase 1's row -> what a browser edits. **Adaptation seam, half one of two.**
 *
 * The focus record is COPIED rather than aliased, and so is the reference: the panel holds the
 * result in `useState` and mutates a draft off it, so sharing an object with a prop would make
 * "unsaved" undetectable — and `NINA_IMAGE_PREFS_DEFAULTS` is frozen, so a draft spread off the
 * singleton would throw on the first checkbox.
 */
export function toImageGenDraft(prefs: NinaImagePrefs): ImageGenDraft {
  return {
    promptLength: prefs.promptLength,
    focus: { ...prefs.focus },
    wardrobe: prefs.wardrobe,
    venue: prefs.venue,
    time: prefs.time,
    notes: prefs.notes,
    promptTemplate: prefs.promptTemplate,
    reference: { source: prefs.reference.source, id: prefs.reference.id },
  }
}

/** Which of the six the operator has switched on, in phase 1's declared order. */
export function focusOnKeys(draft: ImageGenDraft): string[] {
  return NINA_IMAGE_FOCUS_KEYS.filter((key) => draft.focus[key] === true)
}

/** `big_boobs` -> `Big boobs`. The last resort when a key has no spec of its own. */
export function prettifyFocusKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\-\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase())
  if (words.length === 0) return key
  /* `charAt` rather than `word[0]`: `noUncheckedIndexedAccess` types the index access as
   * `string | undefined` even behind the `length > 0` filter above, and `charAt` is total. */
  const first = words[0] ?? ''
  return [first.charAt(0).toUpperCase() + first.slice(1), ...words.slice(1)].join(' ')
}

/** Whether a key is one phase 1 actually declares. The test reads this. */
export function hasImageFocusCopy(key: string): boolean {
  return (NINA_IMAGE_FOCUS_KEYS as readonly string[]).includes(key)
}

/**
 * The label for one of the six focus options, **read off phase 1's specs** — and, since the
 * image-prefs simplify set, the ONLY copy a focus card has. The hint this function used to return
 * rendered the spec's `userSaid` under each option, which repeated the label back in lower case
 * ("face" under Face); the user asked for that line gone, and with it went `userSaid`, whose one
 * reader was this return value.
 *
 * A plain string, not `ImageGenCopy`, for the same rung: `band` was already always `''` here (a
 * checkbox has no scale), and a `hint` that must stay empty is an absence pinned by its own test.
 * `promptLengthCopy` keeps the `ImageGenCopy` shape because its hint and band are genuinely
 * rendered.
 *
 * The fallback exists so a running page degrades to a readable label rather than crashing on a key
 * phase 1 adds, and `tests/admin.imagegen.test.ts` fails on any key in `NINA_IMAGE_FOCUS_KEYS`
 * that reaches it — the net is for a running page, never a licence to ship an unlabelled checkbox.
 */
export function imageFocusCopy(key: string): string {
  if (hasImageFocusCopy(key)) {
    return NINA_IMAGE_FOCUS_SPECS[key as keyof typeof NINA_IMAGE_FOCUS_SPECS].label
  }
  return prettifyFocusKey(key)
}

/**
 * What the operator reads beside the length slider.
 *
 * The RUNG is phase 1's (`ninaPromptLengthRungFor(ninaBand(value).index)`), because the whole point of putting the slider
 * on the repo's existing five-band scale was that the operator can predict it — `/admin`'s other
 * sliders are read in bands and a private scale would be a control nobody can report back.
 *
 * The note is this file's own and is deliberately editorial about the SURFACE rather than
 * descriptive of the prompt. A sentence here claiming what a rung adds would be a promise phase 2
 * has to keep forever, and a stale one is the panel lying about text the operator can already read:
 * the assembled prompt is rendered a few centimetres below the slider, from the same assembler the
 * camera is handed, so the honest hint points at it.
 */
const LENGTH_BAND_NOTE = 'The assembled prompt below is what this rung actually produces.'

export function promptLengthCopy(value: number): ImageGenCopy {
  /* PHASE 1'S HANDOFF, VERBATIM: "It must render the band caption via
   * `ninaPromptLengthRungFor(ninaBand(value).index)` and never re-derive a band from a score."
   * `ninaBand` comes from `@/lib/nina/tuning` — the second of this file's two imports (A1b), and
   * the reason `imageprefs.ts` does not carry a private copy of the five band boundaries. */
  const rung = ninaPromptLengthRungFor(ninaBand(value).index)
  return {
    label: 'Prompt length',
    hint: `${rung.label}. ${rung.axis} ${LENGTH_BAND_NOTE}`,
    band: rung.label,
  }
}

/**
 * Which fields differ, as stable dotted paths (`promptLength`, `wardrobe`, `venue`, `time`,
 * `notes`, `reference`, `focus.boobs`).
 *
 * One function serves three jobs, which is why it returns names instead of a boolean: the header
 * counts them, each control asks whether its own path is in the set, and `imageGenDraftEquals` is
 * `length === 0`. `focus.*` is appended LAST, after the scalars, so R5's paths are visibly a group —
 * `changedTuningFields` puts `enabled.*` last for the same reason.
 *
 * The focus key union is taken from BOTH sides, so a key present in one and absent in the other
 * counts as a difference rather than being silently skipped. `?? false` on both sides, because
 * absent means OFF in this feature (see `ImageGenDraft.focus`).
 *
 * The reference is ONE path and not two. The operator picks a photograph, not a table name, so two
 * dots on one row would be him wondering which of two identical marks meant what.
 */
export function changedImageGenFields(next: ImageGenDraft, saved: ImageGenDraft): string[] {
  const changed: string[] = []

  if (next.promptLength !== saved.promptLength) changed.push('promptLength')
  if (next.wardrobe !== saved.wardrobe) changed.push('wardrobe')
  if (next.venue !== saved.venue) changed.push('venue')
  if (next.time !== saved.time) changed.push('time')
  if (next.notes !== saved.notes) changed.push('notes')
  if (next.promptTemplate !== saved.promptTemplate) changed.push('promptTemplate')
  if (referenceKey(next.reference) !== referenceKey(saved.reference)) changed.push('reference')

  for (const key of Object.keys({ ...saved.focus, ...next.focus }).sort()) {
    if ((next.focus[key] ?? false) !== (saved.focus[key] ?? false)) changed.push(`focus.${key}`)
  }

  return changed
}

export function imageGenDraftEquals(a: ImageGenDraft, b: ImageGenDraft): boolean {
  return changedImageGenFields(a, b).length === 0
}

/**
 * How long the prompt-length dial waits after its last change before it commits — the settle
 * window of the auto-save panel (this set's R2).
 *
 * `TUNING_DIAL_COMMIT_DEBOUNCE_MS`'s argument in `lib/admin/tuningModel.ts` transfers verbatim: a
 * native `<input type="range">` fires `change` on every pointer move of a drag and on every arrow
 * keypress, and it KEEPS FOCUS after the thumb is released — so the blur rule that commits the text
 * fields below cannot transfer to the one dial this panel has, because there is no blur event that
 * means "this edit is finished". The debounce is the settle detector: one continuous drag becomes
 * one save. 600 ms sits above the tens-of-milliseconds gaps between change events inside one drag
 * and below the time it takes to wonder whether the edit landed. A separate constant rather than
 * importing the tuning one: the two windows answer to two panels, and recalibrating one is a
 * product decision about THAT panel that must not silently move the other.
 *
 * Named here rather than in the component for the same reason every bound in this file is imported
 * rather than re-declared: one home, and a test can pin it.
 */
export const IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS = 600

/**
 * The focus map's share of the post-save merge — `tuningModel.ts`'s private `mergeRecord`, with one
 * value type instead of three, so it is typed `boolean` and named for the one record it merges.
 *
 * The rule is one line per key: **adopt the stored value only where the operator has not touched
 * the key since dispatch** — `current` still holds exactly what was `sent`. A key that has moved on
 * keeps the newer local value and stays pending; the next commit carries it. Keys are taken from
 * the union of all three sides, so a key present on one side only is decided rather than dropped.
 */
function mergeFocusRecord(
  current: Record<string, boolean>,
  sent: Record<string, boolean>,
  canonical: Record<string, boolean>,
): Record<string, boolean> {
  const merged: Record<string, boolean> = {}
  for (const key of Object.keys({ ...sent, ...canonical, ...current })) {
    if (current[key] !== sent[key] && current[key] !== undefined) {
      merged[key] = current[key]
    } else if (canonical[key] !== undefined) {
      merged[key] = canonical[key]
    } else if (sent[key] !== undefined) {
      merged[key] = sent[key]
    }
    /* All three undefined: the key is in nobody's draft — leave it out of the merge too. */
  }
  return merged
}

/**
 * The post-save canonical merge — what the auto-save panel does when a save comes back. The
 * structural twin of `mergeTuningAfterSave` (`lib/admin/tuningModel.ts:315-334`), field for field.
 *
 * `writeNinaImagePrefs` coerces before it writes, and the coercion is not a no-op:
 * `coerceNinaImageText` collapses whitespace runs, trims and truncates ("  long  hugging  leggings  "
 * is stored as "long hugging leggings") and `coerceNinaImagePromptLength` clamps, so the stored row
 * can differ cosmetically from what was typed. The panel cannot keep showing the pre-coercion text
 * after the row that holds the canonical form has landed — the operator would watch the field "not
 * take" — but it also cannot adopt the stored row wholesale, because the operator may have kept
 * editing while the save was in flight, and a wholesale adoption would write the older stored value
 * over the newer local one. That is the one failure this merge exists to prevent.
 *
 * So: for each field, if `current` still equals what was `sent`, the field was untouched since
 * dispatch and takes the canonical value (a collapsed wardrobe appears; a clamped dial snaps to
 * what was stored); otherwise the field keeps the newer local value and remains pending — it rides
 * the next commit. `changedImageGenFields` is the same per-field comparison in boolean form, which
 * is why the merge and the pending marks always agree. The reference is decided by
 * `referenceKey(...)` — the ONE identity measure this file already uses for "is the selection the
 * same", and the one the pending mark is computed from.
 */
export function mergeImageGenAfterSave(
  current: ImageGenDraft,
  sent: ImageGenDraft,
  canonical: ImageGenDraft,
): ImageGenDraft {
  return {
    promptLength:
      current.promptLength === sent.promptLength ? canonical.promptLength : current.promptLength,
    focus: mergeFocusRecord(current.focus, sent.focus, canonical.focus),
    wardrobe: current.wardrobe === sent.wardrobe ? canonical.wardrobe : current.wardrobe,
    venue: current.venue === sent.venue ? canonical.venue : current.venue,
    time: current.time === sent.time ? canonical.time : current.time,
    notes: current.notes === sent.notes ? canonical.notes : current.notes,
    promptTemplate:
      current.promptTemplate === sent.promptTemplate
        ? canonical.promptTemplate
        : current.promptTemplate,
    reference:
      referenceKey(current.reference) === referenceKey(sent.reference)
        ? canonical.reference
        : current.reference,
  }
}
