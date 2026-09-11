/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  THE IMAGE-GENERATION PREFERENCES. One slider, six emphasis flags, four lines of free text
 *  and one photograph. Everything the operator can say about HOW SHE IS PHOTOGRAPHED, as
 *  opposed to `lib/nina/tuning.ts`, which is everything he can say about WHO SHE IS.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THIS FILE MUST STAY IMPORTABLE FROM A `'use client'` COMPONENT, AND FROM THE WORKER ───────
 * **Zero imports. No value import, no type import, no `server-only`, nothing from the db layer.**
 * The `lib/nina/tuning.ts` and `lib/nina/imagerecipe.ts` rule, and for three reasons at once:
 * phase 4's `components/admin/ImageGenPanel.tsx` is `'use client'` and renders every label and
 * bound below in the browser; phase 4's Zod boundary must import the same bounds so the form and
 * the schema cannot disagree; and phase 3's `scripts/nina-image-worker.ts` loads its dependencies
 * by relative path under `node --experimental-strip-types`, where an `@/` alias does not resolve.
 * `tests/nina.imageprefs.test.ts` reads this file's own source and fails on an `import` line, so
 * the property is checked rather than merely intended.
 *
 * ── WHY `prompt_length` DOES NOT RESTATE THE BANDS, AND WHAT IT SHARES INSTEAD ────────────────
 * The slider is a 0-100 integer read through the repo's existing FIVE bands (`ninaBand`,
 * `NINA_BAND_NAMES` in `lib/nina/tuning.ts:80-122`), and this file cannot import them. It does not
 * copy them either. `NINA_PROMPT_LENGTH_RUNGS` below is indexed by BAND INDEX — the numeric domain
 * `NinaBandIndex` already is, and the same one `ANGER_FLOOR_BY_BAND` in `lib/nina/persona.ts`
 * consumes — so the vocabulary crosses this boundary as a number 0..4 and nothing else. The caller
 * writes:
 *
 *     ninaPromptLengthRungFor(ninaBand(prefs.promptLength).index)
 *
 * one `ninaBand` call, in a module that already imports it. What IS duplicated is the two scale
 * endpoints and the clamp's semantics, and `tests/nina.imageprefs.test.ts` asserts both against
 * `NINA_SCORE_MIN` / `NINA_SCORE_MAX` / `clampNinaScore` directly. That is the RULING A6 mitigation
 * shape: `tests/nina.imagerecipe.test.ts` proves `ninaImagePathname` agrees with the one
 * `NINA_BLOB_PREFIX` for exactly this reason. A test may reach where the consumer cannot.
 *
 * ── "FOCUS ON" IS EMPHASIS, NEVER INCLUSION ──────────────────────────────────────────────────
 * The user's words are *"i dont care about her face, i care a lot about her voluptuous body: big
 * boobs, bubble butt, big thighs, very long calves. **always** explicitly instruct these in the
 * prompt."* So the body canon is unconditional prompt text (phase 2 owns it, plan invariant 4) and
 * these six flags add emphasis ON TOP. `NINA_IMAGE_FOCUS_DEFAULTS` is therefore all-false: with
 * nothing selected the prompt still names all four body facts, and a phase that made a focus flag
 * the thing that PUTS the body in the prompt would have contradicted the word "always".
 *
 * ── THE COERCION ASYMMETRY, AND WHY IT IS THE OPPOSITE OF `coerceNinaEnabled` ────────────────
 * `coerceNinaEnabled` reads anything that is not literally `false` as ON, because its failure mode
 * is a deploy that silently mutes her personality. `coerceNinaImageFocus` is the mirror image:
 * **only an explicit `true` enables.** Its failure mode is the other one — an unreadable value that
 * read as ON would put an emphasis clause into the prompt that nobody selected, and R1 already
 * guarantees the body is named, so OFF is the state that loses nothing.
 *
 * ── ALL FOUR TEXT FIELDS ARE ONE LINE, INCLUDING `notes` ────────────────────────────────────
 * Unlike `coerceNinaNotes` in `lib/nina/tuning.ts`, which keeps newlines because it feeds a
 * seven-kilobyte SYSTEM prompt where paragraphs are prose. These four are interpolated into an
 * IMAGE prompt, where a newline splits a sentence the provider reads as two — `coerceNinaWardrobe`'s
 * own argument, applied to all four rather than to one.
 *
 * ── THE REFERENCE IS AN ID PLUS A SET, NOT A URL ────────────────────────────────────────────
 * `reference_source` + `reference_id`, and the reason is `updateNinaChatPhotoBlob`: replacing a
 * chat photograph's bytes changes its `blob_url` and keeps its `id`. A stored URL would point at a
 * deleted Blob object while the picker still showed the chosen tile. There is no foreign key —
 * the parent is one of two tables, which no single FK can express, and a cascade would delete a
 * whole prefs row because one photograph was deleted. A dangling id resolves to `null` and the
 * generation degrades to unanchored; `NINA_IMAGE_REFERENCE_NONE` is the one representable "no
 * reference", and a half-selection (a source with no id, or an id with no source) is coerced into
 * it rather than stored.
 */

/* ============================================================================
 * §1 The scale, and the five rungs of the length ladder (R4)
 * ==========================================================================*/

/**
 * The slider's domain. **The same two integers as `NINA_SCORE_MIN` / `NINA_SCORE_MAX` in
 * `lib/nina/tuning.ts`, restated because this file may not import them**, and asserted equal in
 * `tests/nina.imageprefs.test.ts`. See the header for why the BANDS are not restated with them.
 */
export const NINA_IMAGE_PROMPT_LENGTH_MIN = 0
export const NINA_IMAGE_PROMPT_LENGTH_MAX = 100

/**
 * The middle of the slider, which is the middle rung of the ladder.
 *
 * There is no byte-identical prompt to reproduce here and that is worth stating, because
 * `NINA_TUNING_DEFAULTS`'s whole discipline is the opposite: R1 changes every image prompt
 * unconditionally, so `tests/nina.imagerecipe.test.ts`'s byte-stability assertion is restated by
 * phase 2 by design (see the plan index, phase 2). What survives of that discipline is the weaker
 * and still useful claim: the default is the NEUTRAL rung, so an operator who never touches the
 * slider gets the prompt phase 2 wrote as its baseline.
 */
export const NINA_IMAGE_PROMPT_LENGTH_DEFAULT = 50

/**
 * One rung of the ladder. Five of them, indexed by BAND INDEX — see the header.
 *
 * `detailSentences` is the operator's whole instruction, made a number: *"the longer the prompt,
 * the more detailed the prompt would be"*. It is how many sentences of **generated** detail the
 * assembler may add — the focus-emphasis clauses and the canon's own elaboration.
 *
 * **It is NOT a budget over the operator's own free text.** `wardrobe`, `venue`, `time` and `notes`
 * reach the prompt at every rung, in full. A slider that could eat a field the operator typed into
 * would be a control that makes another control silently do nothing, which is the failure
 * `lib/db/schema.ts`'s `nina_tuning` header spends three paragraphs forbidding. Phase 2 owns what a
 * sentence of detail SAYS; this table owns how many of them there are, and that the count rises.
 */
export interface NinaPromptLengthRung {
  /** 0-4. The band index, which is also this rung's position in the array. */
  readonly index: number
  /** The panel's label, rendered beside the slider. Sentence case, like every other admin label. */
  readonly label: string
  /** What the rung is, in one line. Operator copy, not prompt text. */
  readonly axis: string
  /** Sentences of GENERATED detail the assembler may spend. Strictly increasing. */
  readonly detailSentences: number
}

export const NINA_PROMPT_LENGTH_RUNGS: readonly NinaPromptLengthRung[] = Object.freeze([
  Object.freeze({
    index: 0,
    label: 'Terse',
    axis: 'The style block, the body, and the scene. Nothing else — the shortest prompt that still names all four body facts.',
    detailSentences: 0,
  }),
  Object.freeze({
    index: 1,
    label: 'Short',
    axis: 'One sentence of detail. The strongest emphasis and nothing more.',
    detailSentences: 1,
  }),
  Object.freeze({
    index: 2,
    label: 'Standard',
    axis: 'Two sentences of detail. The neutral rung, and the default.',
    detailSentences: 2,
  }),
  Object.freeze({
    index: 3,
    label: 'Detailed',
    axis: 'Four sentences of detail. Every selected emphasis gets its own clause.',
    detailSentences: 4,
  }),
  Object.freeze({
    index: 4,
    label: 'Exhaustive',
    axis: 'Six sentences of detail. Everything selected, elaborated, plus the texture and lighting the canon can spell out.',
    detailSentences: 6,
  }),
])

/**
 * A band index, made a rung. **Never throws and never returns undefined**, which is why it takes a
 * plain `number` rather than a band-index type: a type union restated here would be the second copy
 * of the band vocabulary the header refuses. A non-integer floors, out of range clamps, and
 * anything that is not a finite number falls to the middle rung — the same trust-boundary
 * discipline as `clampNinaScore`, for a caller that may be a hand-run script.
 */
export function ninaPromptLengthRungFor(bandIndex: unknown): NinaPromptLengthRung {
  const last = NINA_PROMPT_LENGTH_RUNGS.length - 1
  if (typeof bandIndex !== 'number' || !Number.isFinite(bandIndex)) {
    return NINA_PROMPT_LENGTH_RUNGS[Math.floor(last / 2)]!
  }
  const index = Math.min(last, Math.max(0, Math.floor(bandIndex)))
  return NINA_PROMPT_LENGTH_RUNGS[index]!
}

/**
 * A prompt-length score, made safe. Floor before clamp, so `100.9` is 100 and not a band index of
 * 5 — `clampNinaScore`'s own ordering, and the reason it matters is the same.
 */
export function clampNinaImageScore(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(
    NINA_IMAGE_PROMPT_LENGTH_MAX,
    Math.max(NINA_IMAGE_PROMPT_LENGTH_MIN, Math.floor(value)),
  )
}

/** The slider's value, made safe. Unreadable falls to the neutral rung, never to zero. */
export function coerceNinaImagePromptLength(value: unknown): number {
  return clampNinaImageScore(value, NINA_IMAGE_PROMPT_LENGTH_DEFAULT)
}

/* ============================================================================
 * §2 "Focus on" — the six, in the order the user wrote them (R5)
 * ==========================================================================*/

/**
 * **The six, in the user's own order**, which is the panel's order and the prompt's order.
 *
 * The keys are short because they become column names (`focus_boobs`) and object keys read by a
 * client panel; the user's words are in `label`, where nothing may tidy them.
 */
export const NINA_IMAGE_FOCUS_KEYS = ['face', 'skin', 'boobs', 'butt', 'thighs', 'calves'] as const

export type NinaImageFocusKey = (typeof NINA_IMAGE_FOCUS_KEYS)[number]

export function isNinaImageFocusKey(key: string): key is NinaImageFocusKey {
  return (NINA_IMAGE_FOCUS_KEYS as readonly string[]).includes(key)
}

/**
 * One focus option, fully described. The `NINA_TRAIT_SPECS` idiom: a key array for the order, a
 * spec record for everything about each key.
 *
 * `label` is **the user's own words, sentence-cased** — his list was *"face, skin, big boobs,
 * bubble butt, big thighs, very long calves"*, and the image-prefs simplify set made the label the
 * one home for those words on this record by deleting `userSaid`, whose only reader was the
 * redundant hint the same set removed from the panel. Nothing may rephrase the label, because the
 * whole complaint that produced this feature was that the prompt did not say these words. The
 * prompt's emphasis vocabulary itself lives in `NINA_FOCUS_EMPHASIS` (`lib/nina/imagegen.ts`),
 * which is keyed by `NinaImageFocusKey` and has never read this record.
 */
export interface NinaImageFocusSpec {
  readonly key: NinaImageFocusKey
  /** The checkbox's label. Sentence case. */
  readonly label: string
}

export const NINA_IMAGE_FOCUS_SPECS: Readonly<Record<NinaImageFocusKey, NinaImageFocusSpec>> =
  Object.freeze({
    face: Object.freeze({ key: 'face', label: 'Face' }),
    skin: Object.freeze({ key: 'skin', label: 'Skin' }),
    boobs: Object.freeze({ key: 'boobs', label: 'Big boobs' }),
    butt: Object.freeze({ key: 'butt', label: 'Bubble butt' }),
    thighs: Object.freeze({ key: 'thighs', label: 'Big thighs' }),
    calves: Object.freeze({ key: 'calves', label: 'Very long calves' }),
  })

function allFocusOff(): Record<NinaImageFocusKey, boolean> {
  const out = {} as Record<NinaImageFocusKey, boolean>
  for (const key of NINA_IMAGE_FOCUS_KEYS) out[key] = false
  return out
}

/**
 * **ALL FALSE, and that is R1 held rather than hoped for.** Deselecting everything must still
 * produce a prompt that names all four body facts (plan invariant 4), so the empty focus set is the
 * default and phase 2's baseline prompt is the one an operator who never opens the tab gets.
 *
 * Frozen, because `NINA_IMAGE_PREFS_DEFAULTS` below is frozen and `readNinaImagePrefs` hands that
 * exact object to every caller for a user with no row.
 */
export const NINA_IMAGE_FOCUS_DEFAULTS: Readonly<Record<NinaImageFocusKey, boolean>> =
  Object.freeze(allFocusOff())

/**
 * A focus map, made safe. **ONLY AN EXPLICIT `true` ENABLES** — the mirror image of
 * `coerceNinaEnabled`, and the header says why the asymmetry flips.
 */
export function coerceNinaImageFocus(value: unknown): Record<NinaImageFocusKey, boolean> {
  const out = {} as Record<NinaImageFocusKey, boolean>
  for (const key of NINA_IMAGE_FOCUS_KEYS) out[key] = pick(value, key) === true
  return out
}

/**
 * The selected keys, **in `NINA_IMAGE_FOCUS_KEYS` order and never in insertion order**. Phase 2's
 * one reader. The order is the array's so that two identical selections produce one identical
 * prompt — the reproducibility argument `getNinaMemorySlots` makes for ordering by key, and the
 * reason a seed is worth storing at all.
 *
 * Reads through `pick` rather than `prefs.focus[key]` so a hand-built `NinaImagePrefs` with no
 * `focus` at all — a fixture, a `psql` round trip, an `as NinaImagePrefs` cast — degrades to "none
 * selected" instead of throwing in the middle of a generation.
 */
export function ninaImageFocusKeysOn(prefs: NinaImagePrefs): NinaImageFocusKey[] {
  return NINA_IMAGE_FOCUS_KEYS.filter((key) => pick(prefs.focus, key) === true)
}

/* ============================================================================
 * §3 The four free-text fields (R6, R7, R8, R9)
 * ==========================================================================*/

/**
 * One line about clothes. **200, the same as `NINA_WARDROBE_MAX` in `lib/nina/tuning.ts`, and it is
 * the same field moving house** — every existing value was capped at 200 by `coerceNinaWardrobe`,
 * so the migration's copy in step 3 cannot truncate anything.
 *
 * Deliberately NOT asserted equal to `NINA_WARDROBE_MAX` in a test: phase 7 deletes that constant,
 * and an assertion against it would be a phase-1 test that fails in phase 7 for no phase-7 reason.
 * The number and its argument are here; the old constant's grave is phase 7's business.
 */
export const NINA_IMAGE_WARDROBE_MAX = 200

/** One line about where. *"Kuta streets in Bali"* is nineteen characters; 200 is generous. */
export const NINA_IMAGE_VENUE_MAX = 200

/**
 * One short phrase about when and what the weather is doing. *"sunny day, rainy night, cold
 * afternoon"* are the user's three examples and the longest is nineteen characters. 120 is a
 * phrase; anything longer is a venue in the wrong field.
 */
export const NINA_IMAGE_TIME_MAX = 120

/**
 * The escape hatch. *"nina is full of sweat"*.
 *
 * **600, and deliberately far below `NINA_NOTES_MAX`'s 2000.** That field is appended to a
 * seven-kilobyte system prompt; this one is spliced into an image prompt of a few hundred words,
 * where a paragraph fights the style block for the model's attention and loses money doing it —
 * `NINA_WARDROBE_MAX`'s own argument (`lib/nina/tuning.ts:684-689`), applied at the scale this
 * field actually needs.
 */
export const NINA_IMAGE_NOTES_MAX = 600

/** The four, in the order the user wrote them, which is the order the panel renders them in. */
export const NINA_IMAGE_TEXT_KEYS = ['wardrobe', 'venue', 'time', 'notes'] as const

export type NinaImageTextKey = (typeof NINA_IMAGE_TEXT_KEYS)[number]

/**
 * One free-text field, fully described — so phase 4's input, its `maxLength`, its placeholder and
 * phase 4's Zod bound are all one lookup and cannot drift from each other.
 *
 * `placeholder` is **the user's own example, verbatim**. He gave one for every field except the
 * wardrobe's second half, and an example he wrote is worth more than an example we invent.
 */
export interface NinaImageTextSpec {
  readonly key: NinaImageTextKey
  /** The input's label. Sentence case. */
  readonly label: string
  /** The user's own line about this field, verbatim. */
  readonly userSaid: string
  /** His own example, verbatim — the input's `placeholder`. */
  readonly placeholder: string
  /** The cap. Enforced by `coerceNinaImageText`, by phase 4's `maxLength`, and by phase 4's Zod. */
  readonly max: number
}

export const NINA_IMAGE_TEXT_SPECS: Readonly<Record<NinaImageTextKey, NinaImageTextSpec>> =
  Object.freeze({
    wardrobe: Object.freeze({
      key: 'wardrobe',
      label: 'Wardrobe',
      userSaid: 'wardrobe (free text) : e.g: long hugging leggings with string bra',
      placeholder: 'long hugging leggings with string bra',
      max: NINA_IMAGE_WARDROBE_MAX,
    }),
    venue: Object.freeze({
      key: 'venue',
      label: 'Venue',
      userSaid: 'venue (free text): Kuta streets in Bali',
      placeholder: 'Kuta streets in Bali',
      max: NINA_IMAGE_VENUE_MAX,
    }),
    time: Object.freeze({
      key: 'time',
      label: 'Time',
      userSaid: 'time (free text): e.g: sunny day , rainy night, cold afternoon',
      placeholder: 'sunny day, rainy night, cold afternoon',
      max: NINA_IMAGE_TIME_MAX,
    }),
    notes: Object.freeze({
      key: 'notes',
      label: 'Notes',
      userSaid: 'notes: e.g: nina is full of sweat',
      placeholder: 'nina is full of sweat',
      max: NINA_IMAGE_NOTES_MAX,
    }),
  })

/**
 * One free-text field, made safe. Whitespace collapsed to single spaces and cut at that field's own
 * cap — **all four fields, including `notes`**; the header says why this differs from
 * `coerceNinaNotes`.
 *
 * `''` is the one empty value and never null: "no override" and "not set" are the same fact, and
 * two spellings for one fact is one too many (`nina_tuning.wardrobe`'s column docstring, verbatim).
 * A cut mid-word at the cap is acceptable — phase 4's input carries the same constant as
 * `maxLength`, so this is the last line of defence rather than the first.
 */
export function coerceNinaImageText(key: NinaImageTextKey, value: unknown): string {
  const max = NINA_IMAGE_TEXT_SPECS[key].max
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/* ============================================================================
 * §4 The photograph reference (R10 — the storage half)
 * ==========================================================================*/

/**
 * Which set the chosen photograph came from. `'none'` is the empty value, and it is a member of the
 * vocabulary rather than a NULL for the same reason `''` is the empty wardrobe.
 *
 * `'album'` is `nina_avatars`; `'chat'` is `nina_message_images WHERE kind = 'generated'`. Those are
 * exactly the two sets the user named: *"all photos in Nina's album and Chat photos"*.
 */
export const NINA_IMAGE_REFERENCE_SOURCES = ['none', 'album', 'chat'] as const

export type NinaImageReferenceSource = (typeof NINA_IMAGE_REFERENCE_SOURCES)[number]

/** Ids in this repo are `lib/id.ts` nanoids; 64 is a defensive ceiling, not a shape claim. */
export const NINA_IMAGE_REFERENCE_ID_MAX = 64

/**
 * The character class `NINA_IMAGE_PATHNAME_RE` in `lib/nina/imagerecipe.ts` already admits, for the
 * same ids. An id outside it is not a row we could ever read, so it coerces to no reference at all
 * rather than to a query that returns nothing.
 */
export const NINA_IMAGE_REFERENCE_ID_RE = /^[0-9A-Za-z_-]{1,64}$/

/**
 * The chosen photograph, as the row stores it: which set, and its id in that set. **Never a blob
 * URL** — the header gives the `updateNinaChatPhotoBlob` argument.
 *
 * A half-selection is not representable: `coerceNinaImageReference` maps a source with no id, an id
 * with no source, and an unreadable either to `NINA_IMAGE_REFERENCE_NONE`.
 */
export interface NinaImageReference {
  readonly source: NinaImageReferenceSource
  /** `''` exactly when `source === 'none'`. Otherwise the row's id in that set. */
  readonly id: string
}

/** The one representable "no reference". Frozen; it is reachable from the frozen defaults. */
export const NINA_IMAGE_REFERENCE_NONE: NinaImageReference = Object.freeze({
  source: 'none',
  id: '',
})

/**
 * A reference, made safe. **Never throws, and never returns a half-selection.**
 *
 * Accepts either the nested shape (`{ source, id }`) or the two flat column values, because the
 * three real inputs are a database row mapped by `lib/nina/queries.ts`, phase 4's Server Action
 * payload, and a `NinaImagePrefs` being round-tripped, and a signature that admits only one of
 * those pushes the validation out to three call sites.
 */
export function coerceNinaImageReference(value: unknown): NinaImageReference {
  const rawSource = pick(value, 'source')
  const rawId = pick(value, 'id')
  if (typeof rawSource !== 'string' || typeof rawId !== 'string') return NINA_IMAGE_REFERENCE_NONE
  if (!(NINA_IMAGE_REFERENCE_SOURCES as readonly string[]).includes(rawSource)) {
    return NINA_IMAGE_REFERENCE_NONE
  }
  if (rawSource === 'none') return NINA_IMAGE_REFERENCE_NONE
  const id = rawId.trim()
  if (!NINA_IMAGE_REFERENCE_ID_RE.test(id)) return NINA_IMAGE_REFERENCE_NONE
  return { source: rawSource as NinaImageReferenceSource, id }
}

/* ============================================================================
 * §5 The picker's page — the union over both sets (R10)
 * ==========================================================================*/

/**
 * One page of the caption-less grid. 48, the same as `NINA_CHAT_PHOTO_PAGE_SIZE` in
 * `lib/nina/album.ts` — a 6x8 grid of square tiles on a phone, which is the iOS Photos idiom the
 * user asked for. Both the default and the CEILING for `limit`, so a hand-edited request cannot
 * turn one page into the unpaginated read this function exists to avoid.
 */
export const NINA_PHOTO_REF_PAGE_SIZE = 48

/**
 * **How deep the picker can reach, and it is a real bound rather than a formality.**
 *
 * The merge below is a pure function over two arrays, which is what lets `npm test` prove the
 * ordering with no database — the *"SQL groups, the pure module rolls up"* split
 * `listNinaAvatarFolders` and `lib/admin/filetree.ts` already use. The price of that split is that
 * `listNinaPhotoReferences` must read `offset + limit` rows from EACH side before it can merge, so
 * the depth has to be capped or the read stops being bounded — which is precisely the mistake
 * `countNinaAvatars` exists to undo, and `listNinaAvatars` (`lib/nina/queries.ts:2314`) is the
 * unbounded read this must not reuse.
 *
 * 480 is ten pages. The honest cost, stated rather than hidden: a photograph older than the newest
 * 480 across both sets cannot be reached from the picker. Against that, the alternative is a SQL
 * `UNION ALL` whose ordering can only be proved against a live database, bought for deep paging
 * nobody does inside a modal grid.
 */
export const NINA_PHOTO_REF_SCAN_MAX = 480

/** The two sets a photograph can come from. `'none'` is not one of them, so it is excluded. */
export type NinaPhotoRefSource = Exclude<NinaImageReferenceSource, 'none'>

/**
 * One selectable photograph, from either set, in the ONE shape the grid draws.
 *
 * `thumbUrl` is nullable because the two sets disagree: `nina_avatars` has a derived thumbnail and
 * `nina_message_images` has no `thumb_url` column at all. A tile renders `thumbUrl ?? blobUrl`,
 * which is what `ChatPhotoGrid` already knowingly does — and the plan's Scope rules out adding the
 * column.
 *
 * There is no `description`, no `filename`, no `folder` and no `prompt`, and that is R10 held in the
 * type: *"a simple photos grid without any captions (just like ios album app)"*. A field the grid
 * must not render is a field the read must not ship.
 */
export interface NinaPhotoRef {
  readonly source: NinaPhotoRefSource
  readonly id: string
  readonly blobUrl: string
  readonly thumbUrl: string | null
  readonly width: number | null
  readonly height: number | null
  readonly createdAt: Date
}

/**
 * One page, plus the whole collection's size and the window it was taken from.
 *
 * `total` is a truthful count of BOTH sets, so an over-shot page returns `rows: []` beside a
 * non-zero total — the distinction `NinaAvatarFolderPage`'s docstring calls out as the one case a
 * pager has to tell apart. `offset` and `limit` are echoed back already clamped, so phase 5 renders
 * the window it actually got rather than the one it asked for.
 */
export interface NinaPhotoRefPage {
  readonly rows: NinaPhotoRef[]
  readonly total: number
  readonly offset: number
  readonly limit: number
}

/** The clamped window, plus how many rows each side must be read to fill it. */
export interface NinaPhotoRefBounds {
  readonly offset: number
  readonly limit: number
  /** `min(offset + limit, NINA_PHOTO_REF_SCAN_MAX)` — the per-side `LIMIT`. */
  readonly scan: number
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * The one place the picker's window is decided, so the reader and the merge cannot disagree about
 * it. `lib/nina/queries.ts` calls this once and passes the result to `mergeNinaPhotoRefs`.
 */
export function ninaPhotoRefBounds(
  opts: { limit?: number; offset?: number } = {},
): NinaPhotoRefBounds {
  const limit = boundedInt(opts.limit, NINA_PHOTO_REF_PAGE_SIZE, 1, NINA_PHOTO_REF_PAGE_SIZE)
  const offset = boundedInt(opts.offset, 0, 0, NINA_PHOTO_REF_SCAN_MAX)
  return { offset, limit, scan: Math.min(offset + limit, NINA_PHOTO_REF_SCAN_MAX) }
}

/**
 * Newest first across both sets, then the requested slice. **Pure, total, and never throws.**
 *
 * The tiebreak is `(createdAt desc, source asc, id desc)` and every part of it is load-bearing:
 * both source reads already order `(created_at desc, id desc)`, rows written in one statement share
 * `created_at` to the microsecond, and a grid whose order changes between two renders of the same
 * page is a grid whose selection moves under the operator's finger. `source` sorts before `id` so
 * that a tie is resolved the same way whichever side happened to be read first — and `'album'` <
 * `'chat'` is plain string order, not a preference.
 *
 * A row with an unusable `createdAt` sorts last rather than corrupting the comparator, because the
 * consumer is an admin screen that must render "gone" rather than an error page.
 */
export function mergeNinaPhotoRefs(
  album: readonly NinaPhotoRef[],
  chat: readonly NinaPhotoRef[],
  bounds: NinaPhotoRefBounds,
): NinaPhotoRef[] {
  const merged = [...album, ...chat].sort(compareNinaPhotoRefs)
  return merged.slice(bounds.offset, bounds.offset + bounds.limit)
}

function refTime(ref: NinaPhotoRef): number {
  const at = ref.createdAt
  return at instanceof Date && Number.isFinite(at.getTime()) ? at.getTime() : 0
}

function compareNinaPhotoRefs(a: NinaPhotoRef, b: NinaPhotoRef): number {
  const at = refTime(a)
  const bt = refTime(b)
  if (at !== bt) return bt - at
  if (a.source !== b.source) return a.source < b.source ? -1 : 1
  if (a.id !== b.id) return a.id < b.id ? 1 : -1
  return 0
}

/* ============================================================================
 * §6 The editable prompt template (the 2026-09-10 ask, second revision)
 * ==========================================================================*/

/**
 * **The template IS the prompt — full prose, with placeholders only where a VALUE goes.**
 *
 * The first revision made every block a token (`{{camera}}`, `{{subject}}`, …) and the field
 * showed nine opaque slots. The user's reply settled it with a sketch: the field must show the
 * ACTUAL prompt text — the camera paragraph, the body canon, the face paragraph, every label —
 * editable word by word (*"POSE AND PRESENCE: dia lagi nungging diatas kasur"*), with
 * placeholders only where a per-generation or per-preference value is spliced in. So the
 * vocabulary below is VALUES, not blocks:
 *
 *   {{bodyFacts}}  — the four facts, in the canon's own enumeration (PLAN INVARIANT 4's slot)
 *   {{wardrobe}}   — the Wardrobe field, or the canon default outfit when it is empty
 *   {{focus}}      — the selected Focus-on terms, as the emphasis sentence's object
 *   {{presence}}   — the Pose-and-presence clauses the Personality dials add
 *   {{venue}} {{time}} {{notes}} — the three free-text fields, verbatim
 *   {{scene}}      — the per-photograph scene, the chat model's own argument
 *   {{mood}}       — the per-photograph EXPRESSION AND ENERGY note
 *
 * **A line containing a token that expanded to empty is dropped ENTIRE.** That is what keeps
 * "VENUE: {{venue}}" from dangling when the field is empty, and what lets the FOCUS line vanish
 * when nothing is selected — the omit-when-empty rule the built-in assembly always had, now
 * applied per line. Static text on a dropped line goes with it, which is the documented price of
 * labels living in the template; each value sits on its own line in the default precisely so a
 * dropped line takes nothing else with it.
 *
 * The keys are short, lowercase, and the substitution map in `lib/nina/imagegen.ts` is keyed by
 * this union — renaming a key here is a compile error there. This file cannot import `imagegen`
 * (circular), which is why the vocabulary lives HERE: the panel's legend, the Zod boundary and
 * the assembler must all read one list.
 */
export const NINA_IMAGE_TEMPLATE_KEYS = [
  'bodyFacts',
  'wardrobe',
  'focus',
  'presence',
  'venue',
  'time',
  'scene',
  'mood',
  'notes',
] as const

export type NinaImageTemplateKey = (typeof NINA_IMAGE_TEMPLATE_KEYS)[number]

/**
 * **The two a template may not omit.**
 *
 * `{{bodyFacts}}` is PLAN INVARIANT 4 made template-shaped: *always explicitly instruct these*,
 * so the four facts must reach the prompt wherever this token sits, and a template without the
 * token is a template that can delete the body — refused. `{{scene}}` is what the photograph is
 * OF: the chat model chooses it per photograph, and a prompt with no slot for it cannot describe
 * the picture he asked for — which is also why the SCENE line's {{scene}} is a TOKEN and not the
 * stand-in sentence the preview shows; freezing that sentence would make every photograph
 * "at arm's length, standing". The other seven are droppable by choice, and the save error says
 * so rather than pretending otherwise.
 */
export const NINA_IMAGE_TEMPLATE_REQUIRED_KEYS: readonly NinaImageTemplateKey[] = [
  'bodyFacts',
  'scene',
]

/**
 * One template token, described for the panel's legend. `description` is operator copy: it says
 * what arrives and where its words come from, so the legend cannot promise a value the assembler
 * does not supply.
 */
export interface NinaImageTemplateSpec {
  readonly key: NinaImageTemplateKey
  /** One line in the legend. Sentence case. */
  readonly description: string
}

export const NINA_IMAGE_TEMPLATE_SPECS: Readonly<
  Record<NinaImageTemplateKey, NinaImageTemplateSpec>
> = Object.freeze({
  bodyFacts: Object.freeze({
    key: 'bodyFacts',
    description:
      "The four facts, in the canon's own words: big boobs, a bubble butt, big thighs and very long calves. Required.",
  }),
  wardrobe: Object.freeze({
    key: 'wardrobe',
    description:
      "The Wardrobe field's value — or her canon default outfit when the field is empty.",
  }),
  focus: Object.freeze({
    key: 'focus',
    description:
      'The ticked Focus-on terms, as one list. Nothing ticked, no line — the whole line goes.',
  }),
  presence: Object.freeze({
    key: 'presence',
    description:
      'The pose clauses the steamy and flirty dials on the Personality tab add. Quiet dials, no line. Replace this token with your own sentence to pin the pose.',
  }),
  venue: Object.freeze({
    key: 'venue',
    description: 'The Venue field, verbatim. Empty field, whole line gone.',
  }),
  time: Object.freeze({
    key: 'time',
    description: 'The Time field, verbatim. Empty field, whole line gone.',
  }),
  scene: Object.freeze({
    key: 'scene',
    description:
      'What this photograph is of — she chooses it per photograph, and this is the slot it lands in. Required.',
  }),
  mood: Object.freeze({
    key: 'mood',
    description: 'EXPRESSION AND ENERGY — the per-photograph note the chat model may send.',
  }),
  notes: Object.freeze({
    key: 'notes',
    description: 'The Notes field, verbatim. Empty field, whole line gone.',
  }),
})

/**
 * The template's cap. The default template is ~1.4 KB of prose; the cap admits a full rewrite
 * plus headroom and still bounds what a saved row can put on the wire.
 */
export const NINA_PROMPT_TEMPLATE_MAX = 4000

/**
 * The one token shape: `{{` + letters + `}}`. Letters admit both cases because the vocabulary
 * names them that way (`{{bodyFacts}}`), and the validator checks the NAME against the
 * vocabulary anyway — the class is a shape, not the guard. Anything brace-like outside a valid
 * token is refused: there is no legitimate `{` in a photograph prompt, and a single stray one is
 * exactly the "broken placeholder formatting" the user asked this feature to make impossible.
 */
export const NINA_IMAGE_TEMPLATE_TOKEN_RE = /\{\{([a-zA-Z]+)\}\}/g

/**
 * Whether a template may be saved and rendered. **`''` is valid and means "use the default"** —
 * the one spelling of "unmodified", matching every other text field in this table. The SAME
 * function guards the save (`lib/admin/schema.ts`'s Zod refine) and the render
 * (`buildNinaImagePrompt`'s degrade), so a template the panel accepts is a template the
 * assembler honours, character for character.
 *
 * Checks, in the order an operator meets them: an unknown `{{name}}` (a typo, named exactly),
 * then a stray `{` or `}` outside any token (the mangled-brace case, refused rather than
 * silently shipped), then a missing required key (named, with the reset escape hatch).
 * Reordered tokens, duplicated tokens, deleted optional lines and rewritten prose are all FINE —
 * that is the control the feature exists to hand over.
 */
export function validateNinaImageTemplate(
  value: string,
): { ok: true } | { ok: false; error: string } {
  if (value === '') return { ok: true }

  const seen = new Set<string>()
  let stripped: string
  try {
    stripped = value.replace(NINA_IMAGE_TEMPLATE_TOKEN_RE, (_match, name: string) => {
      seen.add(name)
      return ''
    })
  } catch {
    return { ok: false, error: 'The template could not be read as text.' }
  }

  for (const name of seen) {
    if (!(NINA_IMAGE_TEMPLATE_KEYS as readonly string[]).includes(name)) {
      return {
        ok: false,
        error:
          `Unknown placeholder {{${name}}}. The placeholders are: ` +
          NINA_IMAGE_TEMPLATE_KEYS.map((key) => `{{${key}}}`).join(', ') +
          '.',
      }
    }
  }

  const stray = stripped.search(/[{}]/)
  if (stray !== -1) {
    return {
      ok: false,
      error:
        `A stray "${stripped.charAt(stray)}" appears outside any {{placeholder}}. ` +
        'Placeholders use doubled braces — check the character just after the placeholder list.',
    }
  }

  for (const key of NINA_IMAGE_TEMPLATE_REQUIRED_KEYS) {
    if (!seen.has(key)) {
      return {
        ok: false,
        error:
          `The template is missing {{${key}}}, which every photograph is assembled from. ` +
          'Put it back, or press "Reset to default template".',
      }
    }
  }

  return { ok: true }
}

/**
 * A stored template, made safe. Normalises CRLF line endings to `\n` (a paste from Windows is
 * formatting, not content), trims the ENDS only — the template is multi-line prose and the
 * internal newlines ARE its formatting — cuts at `NINA_PROMPT_TEMPLATE_MAX`, and **degrades an
 * invalid template to `''`**, the default. That empty is the whole reason a hand-run SQL update
 * cannot break a generation: the validator runs again here, on the read path, and a template
 * that would fail the save fails the read into the shipped shell instead. Never throws.
 */
export function coerceNinaImageTemplate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalised = value.replace(/\r\n?/g, '\n').trim().slice(0, NINA_PROMPT_TEMPLATE_MAX)
  if (normalised === '') return ''
  return validateNinaImageTemplate(normalised).ok ? normalised : ''
}

/* ============================================================================
 * §7 The image model (the 2026-09-10 ask, second half)
 * ==========================================================================*/

/**
 * **The two cameras the dropdown offers, verified live on 2026-09-10**: both ids were listed by
 * OpenRouter's `/api/v1/images/models` the day this shipped. A CLOSED vocabulary, not a free-text
 * id, for the reason `NINA_IMAGE_REFERENCE_SOURCES` is one: an unknown model id must fail toward
 * the measured default at the read, not toward a provider 404 after the money is spent. A new
 * model is a code change — and, per this repo's own discipline, a probe — rather than a form
 * field.
 *
 * Lives HERE and not in `lib/nina/imagerecipe.ts` because three hosts that may not import that
 * file all need it: the `'use client'` panel renders the dropdown, the Zod boundary checks the
 * save, and `scripts/nina-image-worker.ts` normalises old jsonb args on claim — and this module is
 * importable from all three (zero imports; the worker reaches it by relative path under
 * `--experimental-strip-types`). `imagerecipe.ts`'s `NINA_IMAGE_MODEL` is the DEFAULT id spelled
 * for the payload builder, and `tests/nina.imagerecipe.test.ts` asserts the two agree — the same
 * RULING A6 mitigation shape as `ninaImagePathname` versus `NINA_BLOB_PREFIX`.
 */
export const NINA_IMAGE_MODEL_IDS = ['qwen/qwen-image-3', 'qwen/qwen-image-3-pro'] as const

export type NinaImageModelId = (typeof NINA_IMAGE_MODEL_IDS)[number]

/** The measured camera, and the value everything unreadable degrades to. 2026-09-11's A/B moved
 * it off the Pro: anchored, the Pro needed 257 s — past every in-platform ceiling — while this
 * finished in 107 s at ~75% of the price and took the reference without complaint. */
export const NINA_IMAGE_MODEL_DEFAULT: NinaImageModelId = 'qwen/qwen-image-3'

export interface NinaImageModelSpec {
  readonly id: NinaImageModelId
  /** The dropdown's label. The provider's own product name, nothing invented. */
  readonly label: string
  /** One line under the dropdown. What is measured, and what is not. */
  readonly hint: string
}

export const NINA_IMAGE_MODEL_SPECS: Readonly<Record<NinaImageModelId, NinaImageModelSpec>> =
  Object.freeze({
    'qwen/qwen-image-3': Object.freeze({
      id: 'qwen/qwen-image-3',
      label: 'Qwen Image 3',
      hint:
        'The measured camera: 107 s anchored, 60 s unanchored, about $0.03 a generation ' +
        '(A/B 2026-09-11). Takes the photo reference; honours the seed and the 3:4 frame.',
    }),
    'qwen/qwen-image-3-pro': Object.freeze({
      id: 'qwen/qwen-image-3-pro',
      label: 'Qwen Image 3 Pro',
      hint:
        'The heavier brush: 257 s anchored (A/B 2026-09-11) — past every in-platform ceiling, ' +
        'so anchored generations abort on Vercel and only the backstop worker finishes them. ' +
        '61 s unanchored. For days likeness quality beats latency.',
    }),
  })

/**
 * A model id, made safe. **Anything unreadable is the default** — the same degrade the focus
 * flags and the reference make, for the same reason: a generation must never reach the provider
 * with an id nobody verified.
 */
export function coerceNinaImageModel(value: unknown): NinaImageModelId {
  if (typeof value !== 'string') return NINA_IMAGE_MODEL_DEFAULT
  return (NINA_IMAGE_MODEL_IDS as readonly string[]).includes(value)
    ? (value as NinaImageModelId)
    : NINA_IMAGE_MODEL_DEFAULT
}

/* ============================================================================
 * §8 The preferences themselves
 * ==========================================================================*/

/**
 * One property of something that may not be an object at all. Never throws.
 *
 * The same three lines as `lib/nina/tuning.ts`'s `pick`, and it is a second copy for the same
 * reason `clampNinaImageScore` is: this file may not import that one. It is three lines with no
 * vocabulary in it, so there is nothing here that can drift — which is the test the header's
 * duplication rule actually applies.
 */
function pick(bag: unknown, key: string): unknown {
  if (typeof bag !== 'object' || bag === null) return undefined
  return (bag as Record<string, unknown>)[key]
}

/**
 * **Everything the operator can set about how she is photographed.** One value, read live at
 * dispatch time with no cache, exactly like `NinaTuning`: a wardrobe saved thirty seconds ago is in
 * the next photograph, with no invalidation step at all.
 *
 * Every field is `readonly` and `NINA_IMAGE_PREFS_DEFAULTS` is frozen, because `readNinaImagePrefs`
 * returns that shared singleton for a user with no row — a caller that mutated it would corrupt
 * every subsequent generation in the same process. Frozen means the attempt throws instead.
 */
export interface NinaImagePrefs {
  /** 0-100, read through the five bands. See §1 and the header. */
  readonly promptLength: number
  /** Emphasis, never inclusion. All false is the default and R1 still holds. */
  readonly focus: Readonly<Record<NinaImageFocusKey, boolean>>
  /** `''` = no override. */
  readonly wardrobe: string
  /** `''` = the canon's own home ground. */
  readonly venue: string
  /** `''` = nothing said about when. */
  readonly time: string
  /** `''` = nothing appended. */
  readonly notes: string
  /**
   * §7's editable template shell. `''` = `NINA_PROMPT_TEMPLATE_DEFAULT` — the one spelling of
   * "unmodified", and the only value an invalid template can coerce to (see
   * `coerceNinaImageTemplate`: a broken stored template reads as the shipping shell, never as a
   * broken prompt).
   */
  readonly promptTemplate: string
  /**
   * §8's camera. The narrow `NinaImageModelId`, because the store coerces and nothing downstream
   * re-reads it loosely — the job args carry the id forward and `coerceNinaImageModel` guards
   * that older read.
   */
  readonly model: NinaImageModelId
  /** `NINA_IMAGE_REFERENCE_NONE` = an unanchored generation. */
  readonly reference: NinaImageReference
}

/**
 * What a caller supplies to `writeNinaImagePrefs`. **The whole row, and no longer a subset of it**:
 * there is no database-minted member left to omit, so this is `NinaImagePrefs` spelled under its
 * write-path name. The alias survives rather than being inlined at its four call sites because
 * `writeNinaImagePrefs`'s signature and `lib/admin/imageGenActions.ts`'s `toImagePrefsWrite` are
 * written against the write shape, and the day the write path wants a member of its own again it
 * should not have to invent a name.
 */
export type NinaImagePrefsWrite = NinaImagePrefs

/**
 * What `coerceNinaImagePrefs` accepts: the shape, with every field `unknown`.
 *
 * Deliberately not `Partial<NinaImagePrefs>`, for `NinaTuningInput`'s reason: the real inputs are a
 * flat database row, a Server Action payload and a round-tripped model value, and a type that
 * admits only the last of those pushes the trust boundary out to three call sites.
 */
export interface NinaImagePrefsInput {
  readonly promptLength?: unknown
  readonly focus?: unknown
  readonly wardrobe?: unknown
  readonly venue?: unknown
  readonly time?: unknown
  readonly notes?: unknown
  readonly promptTemplate?: unknown
  readonly model?: unknown
  readonly reference?: unknown
}

/**
 * **The shipping preferences: nothing selected, nothing typed, no reference, the neutral rung.**
 *
 * Frozen, and its two nested values frozen, because `readNinaImagePrefs` hands this exact object to
 * every caller for a user with no row. That is the whole design: it is what makes every downstream
 * caller unconditional — no `?? defaults` at four call sites, no "has he opened the tab yet" branch
 * in `selfiegen.ts`, and no way for a first-run generation to get a prompt with holes in it.
 */
export const NINA_IMAGE_PREFS_DEFAULTS: NinaImagePrefs = Object.freeze({
  promptLength: NINA_IMAGE_PROMPT_LENGTH_DEFAULT,
  focus: NINA_IMAGE_FOCUS_DEFAULTS,
  wardrobe: '',
  venue: '',
  time: '',
  notes: '',
  promptTemplate: '',
  model: NINA_IMAGE_MODEL_DEFAULT,
  reference: NINA_IMAGE_REFERENCE_NONE,
})

/**
 * **Anything at all, made into a usable `NinaImagePrefs`. This function never throws.**
 *
 * `coerceNinaTuning`'s rule, and this data has the same four writers: phase 4's panel, a hand-run
 * SQL update, a restored backup and a future migration. Its consumer is a $0.040 model call, which
 * must degrade rather than 500.
 *
 * Three behaviours worth stating because the tests pin them:
 *
 *   1. **An unreadable slider falls to the neutral rung, not to zero.** Zero is a real setting (the
 *      terse rung), so it must not double as "we could not read this".
 *   2. **An unreadable focus flag reads OFF.** The opposite of `coerceNinaEnabled`, and the header
 *      says why.
 *   3. **The result is always a fresh, unfrozen object**, never `NINA_IMAGE_PREFS_DEFAULTS` itself,
 *      so a caller may hold it, spread it and hand it to React state without touching the
 *      singleton.
 */
export function coerceNinaImagePrefs(
  input: NinaImagePrefsInput | null | undefined,
): NinaImagePrefs {
  return {
    promptLength: coerceNinaImagePromptLength(input?.promptLength),
    focus: coerceNinaImageFocus(input?.focus),
    wardrobe: coerceNinaImageText('wardrobe', input?.wardrobe),
    venue: coerceNinaImageText('venue', input?.venue),
    time: coerceNinaImageText('time', input?.time),
    notes: coerceNinaImageText('notes', input?.notes),
    promptTemplate: coerceNinaImageTemplate(input?.promptTemplate),
    model: coerceNinaImageModel(input?.model),
    reference: coerceNinaImageReference(input?.reference),
  }
}
