import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  coerceNinaImageFocus,
  coerceNinaImagePrefs,
  coerceNinaImageReference,
  coerceNinaImageTemplate,
  coerceNinaImageText,
  dedupeNinaPhotoRefs,
  mergeNinaPhotoRefs,
  NINA_IMAGE_FOCUS_DEFAULTS,
  NINA_IMAGE_FOCUS_KEYS,
  NINA_IMAGE_FOCUS_SPECS,
  NINA_IMAGE_NOTES_MAX,
  NINA_IMAGE_PREFS_DEFAULTS,
  NINA_IMAGE_REFERENCE_NONE,
  NINA_IMAGE_REFERENCE_SOURCES,
  NINA_IMAGE_TEMPLATE_KEYS,
  NINA_IMAGE_TEMPLATE_REQUIRED_KEYS,
  NINA_IMAGE_TEMPLATE_SPECS,
  NINA_IMAGE_TEXT_KEYS,
  NINA_IMAGE_TEXT_SPECS,
  NINA_IMAGE_TIME_MAX,
  NINA_IMAGE_VENUE_MAX,
  NINA_IMAGE_WARDROBE_MAX,
  NINA_PHOTO_REF_PAGE_SIZE,
  NINA_PROMPT_TEMPLATE_MAX,
  ninaImageFocusKeysOn,
  ninaPhotoRefBounds,
  ninaPhotoRefPreloadUrls,
  paginateNinaPhotoRefs,
  validateNinaImageTemplate,
  type NinaImagePrefs,
  type NinaPhotoRef,
} from '@/lib/nina/imageprefs'

/**
 * The image-preferences vocabulary, asserted against the words the user wrote.
 *
 * Two of these suites exist for reasons a reader should not have to guess at:
 *
 *   · **"zero imports"** is the constraint that lets a `'use client'` panel, phase 4's Zod schema
 *     and phase 3's `--experimental-strip-types` worker all hold this module. It cannot be tested
 *     by importing, so it is tested by reading the source.
 *   · **"the migration's literals are the defaults"** is the same shape applied to SQL. The data
 *     step transcribes `NINA_IMAGE_PREFS_DEFAULTS` into an `INSERT`, and a migration is history
 *     rather than a live copy — so the only hazard is its being wrong on the day it runs, which is
 *     the day this test runs.
 */

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')
}

describe('the module stays importable from a client component and from the worker', () => {
  it('has no imports at all, and nothing server-only', () => {
    const source = readSource('lib/nina/imageprefs.ts')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s+.*\bfrom\s+'/m)
    /* Comments stripped before the substring checks, for `tests/nina.tuning.test.ts`'s reason: this
     * module's header names the db layer in the very sentence that forbids reaching it, and deleting
     * the explanation to satisfy a test would delete the reason the rule exists. The two assertions
     * above already forbid every import LINE; these are the belt-and-braces against a `require()`
     * or a dynamic `import()`. */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toContain('server-only')
    expect(code).not.toContain('@/lib/db')
    expect(code).not.toContain('@/lib/nina/tuning')
  })
})

describe('the six focus options are the six the user named (R5)', () => {
  it('are in his order, and every one has a spec', () => {
    expect(NINA_IMAGE_FOCUS_KEYS).toEqual(['face', 'skin', 'boobs', 'butt', 'thighs', 'calves'])
    for (const key of NINA_IMAGE_FOCUS_KEYS) expect(NINA_IMAGE_FOCUS_SPECS[key].key).toBe(key)
  })

  it('carries his own words, verbatim and untidied, in the labels', () => {
    // "focus on (select multi options): face, skin, big boobs, bubble butt, big thighs, very long
    // calves". The list is the specification, so it is stored rather than paraphrased. The
    // simplify set made `label` the one home for these words on the spec when it deleted
    // `userSaid` — whose only reader was the redundant hint under each option. Order and spelling
    // are both his; the prompt's emphasis terms (`NINA_FOCUS_EMPHASIS`, lib/nina/imagegen.ts) are
    // keyed by the same keys and say the same words in prompt register.
    expect(NINA_IMAGE_FOCUS_KEYS.map((k) => NINA_IMAGE_FOCUS_SPECS[k].label)).toEqual([
      'Face',
      'Skin',
      'Big boobs',
      'Bubble butt',
      'Big thighs',
      'Very long calves',
    ])
  })

  it('defaults to nothing selected, which is what keeps R1 unconditional', () => {
    // "always explicitly instruct these in the prompt" — so the body canon cannot be something a
    // checkbox turns on. All-false is the default and phase 2's baseline prompt still names the body.
    for (const key of NINA_IMAGE_FOCUS_KEYS) expect(NINA_IMAGE_FOCUS_DEFAULTS[key], key).toBe(false)
    expect(Object.isFrozen(NINA_IMAGE_FOCUS_DEFAULTS)).toBe(true)
  })

  it('enables on an explicit true ONLY — the opposite of coerceNinaEnabled', () => {
    const coerced = coerceNinaImageFocus({
      boobs: true,
      thighs: 1,
      calves: 'yes',
      face: null,
      skin: undefined,
    })
    expect(coerced).toEqual({
      face: false,
      skin: false,
      boobs: true,
      butt: false,
      thighs: false,
      calves: false,
    })
  })

  it('survives garbage as all-off, and never throws', () => {
    for (const bad of [null, undefined, 42, 'boobs', [], Object.create(null)]) {
      expect(() => coerceNinaImageFocus(bad)).not.toThrow()
      expect(coerceNinaImageFocus(bad)).toEqual({ ...NINA_IMAGE_FOCUS_DEFAULTS })
    }
  })

  it('reports the selected keys in array order, never in insertion order', () => {
    // Two identical selections must produce one identical prompt, which is what makes a stored seed
    // worth anything. Built with the keys in the wrong order on purpose.
    const prefs = coerceNinaImagePrefs({ focus: { calves: true, face: true, boobs: true } })
    expect(ninaImageFocusKeysOn(prefs)).toEqual(['face', 'boobs', 'calves'])
  })

  it('degrades a prefs value with no focus map at all to "none selected"', () => {
    const bare = { ...NINA_IMAGE_PREFS_DEFAULTS, focus: undefined } as unknown as NinaImagePrefs
    expect(() => ninaImageFocusKeysOn(bare)).not.toThrow()
    expect(ninaImageFocusKeysOn(bare)).toEqual([])
  })
})

describe('the four free-text fields (R6-R9)', () => {
  it('are the four the user listed, in his order, each with his own example', () => {
    expect(NINA_IMAGE_TEXT_KEYS).toEqual(['wardrobe', 'venue', 'time', 'notes'])
    expect(NINA_IMAGE_TEXT_SPECS.wardrobe.placeholder).toBe('long hugging leggings with string bra')
    expect(NINA_IMAGE_TEXT_SPECS.venue.placeholder).toBe('Kuta streets in Bali')
    expect(NINA_IMAGE_TEXT_SPECS.time.placeholder).toBe('sunny day, rainy night, cold afternoon')
    expect(NINA_IMAGE_TEXT_SPECS.notes.placeholder).toBe('nina is full of sweat')
  })

  it('publishes each bound once, and the spec reads it rather than restating it', () => {
    // Phase 4 imports EVERY bound from this module. One literal per field, in one place.
    expect(NINA_IMAGE_TEXT_SPECS.wardrobe.max).toBe(NINA_IMAGE_WARDROBE_MAX)
    expect(NINA_IMAGE_TEXT_SPECS.venue.max).toBe(NINA_IMAGE_VENUE_MAX)
    expect(NINA_IMAGE_TEXT_SPECS.time.max).toBe(NINA_IMAGE_TIME_MAX)
    expect(NINA_IMAGE_TEXT_SPECS.notes.max).toBe(NINA_IMAGE_NOTES_MAX)
    // 200 is `nina_tuning.wardrobe`'s cap, because it is the same field moving house — so the
    // migration's copy cannot truncate a value. Asserted as the NUMBER and not against
    // NINA_WARDROBE_MAX, which phase 7 deleted along with the column.
    expect(NINA_IMAGE_WARDROBE_MAX).toBe(200)
  })

  it('collapses every newline, for all four — including notes', () => {
    // Unlike `coerceNinaNotes`, which keeps them: that field feeds a SYSTEM prompt where paragraphs
    // are prose, and these four are spliced into an IMAGE prompt where a newline splits a sentence
    // the provider reads as two.
    for (const key of NINA_IMAGE_TEXT_KEYS) {
      expect(coerceNinaImageText(key, ' a\r\nb\n\n\nc\t d  '), key).toBe('a b c d')
    }
  })

  it('cuts at each field own cap', () => {
    for (const key of NINA_IMAGE_TEXT_KEYS) {
      const max = NINA_IMAGE_TEXT_SPECS[key].max
      expect(coerceNinaImageText(key, 'x'.repeat(max + 50)), key).toHaveLength(max)
    }
  })

  it('reads anything that is not a string as the empty value, never null', () => {
    for (const key of NINA_IMAGE_TEXT_KEYS) {
      for (const bad of [null, undefined, 7, {}, []]) {
        expect(coerceNinaImageText(key, bad), key).toBe('')
      }
    }
  })
})

describe('the photograph reference (R10, storage)', () => {
  it('has exactly three sources, with none as the empty one', () => {
    expect(NINA_IMAGE_REFERENCE_SOURCES).toEqual(['none', 'album', 'chat'])
    expect(NINA_IMAGE_REFERENCE_NONE).toEqual({ source: 'none', id: '' })
    expect(Object.isFrozen(NINA_IMAGE_REFERENCE_NONE)).toBe(true)
  })

  it('round-trips a real selection from either set', () => {
    expect(coerceNinaImageReference({ source: 'album', id: 'abcdefghijkl' })).toEqual({
      source: 'album',
      id: 'abcdefghijkl',
    })
    expect(coerceNinaImageReference({ source: 'chat', id: 'a-b_c9' })).toEqual({
      source: 'chat',
      id: 'a-b_c9',
    })
  })

  it('makes a half-selection unrepresentable', () => {
    // A source with no id, an id with no source, and `none` carrying an id are all the same fact:
    // there is no reference. One spelling for it.
    for (const bad of [
      { source: 'album', id: '' },
      { source: 'album', id: '   ' },
      { source: '', id: 'abcdefghijkl' },
      { source: 'none', id: 'abcdefghijkl' },
      { source: 'ALBUM', id: 'abcdefghijkl' },
      { source: 'avatar', id: 'abcdefghijkl' },
      { source: 'album', id: 'a/../b' },
      { source: 'album', id: 'x'.repeat(65) },
      { source: 'album' },
      { id: 'abcdefghijkl' },
      null,
      undefined,
      'album',
      42,
    ]) {
      expect(coerceNinaImageReference(bad), JSON.stringify(bad)).toEqual(NINA_IMAGE_REFERENCE_NONE)
    }
  })
})

describe('the picker page is provable without a database — merge, dedupe, paginate', () => {
  const at = (iso: string): Date => new Date(iso)
  const ref = (
    source: 'album' | 'chat',
    id: string,
    iso: string,
    opts: { thumbUrl?: string | null; contentHash?: string | null } = {},
  ): NinaPhotoRef => ({
    source,
    id,
    blobUrl: `https://blob.example/${source}/${id}.png`,
    thumbUrl: opts.thumbUrl ?? null,
    width: 768,
    height: 1024,
    createdAt: at(iso),
    contentHash: opts.contentHash ?? null,
  })

  it('clamps the limit to the page size, and floors the offset — no upper clamp any more', () => {
    // There is no `NINA_PHOTO_REF_SCAN_MAX` any more: the collection is read in full and sliced in
    // memory, so an offset has nothing left to protect against except a negative number.
    expect(ninaPhotoRefBounds()).toEqual({ offset: 0, limit: NINA_PHOTO_REF_PAGE_SIZE })
    expect(ninaPhotoRefBounds({ limit: 1000 }).limit).toBe(NINA_PHOTO_REF_PAGE_SIZE)
    expect(ninaPhotoRefBounds({ limit: 0 }).limit).toBe(1)
    expect(ninaPhotoRefBounds({ offset: -5 }).offset).toBe(0)
    expect(ninaPhotoRefBounds({ offset: 10_000 }).offset).toBe(10_000)
    for (const bad of [Number.NaN, undefined, null as unknown as number]) {
      expect(ninaPhotoRefBounds({ limit: bad, offset: bad })).toEqual({
        offset: 0,
        limit: NINA_PHOTO_REF_PAGE_SIZE,
      })
    }
  })

  it('interleaves both sets newest first, unbounded', () => {
    const album = [ref('album', 'a1', '2026-09-05T00:00:00Z', { thumbUrl: 'https://t/a1.jpg' })]
    const chat = [
      ref('chat', 'c1', '2026-09-06T00:00:00Z'),
      ref('chat', 'c2', '2026-09-04T00:00:00Z'),
    ]
    const rows = mergeNinaPhotoRefs(album, chat)
    expect(rows.map((r) => r.id)).toEqual(['c1', 'a1', 'c2'])
  })

  it('breaks a tie deterministically, so the selection cannot move under a finger', () => {
    // Rows written in one statement share `created_at` to the microsecond, and the tiebreak is
    // (source asc, id desc) — the same `id desc` both source reads use.
    const same = '2026-09-06T00:00:00Z'
    const rows = mergeNinaPhotoRefs(
      [ref('album', 'a1', same), ref('album', 'a2', same)],
      [ref('chat', 'c1', same)],
    )
    expect(rows.map((r) => r.id)).toEqual(['a2', 'a1', 'c1'])
    // Same input, sides swapped in the array: same answer.
    const again = mergeNinaPhotoRefs(
      [ref('album', 'a2', same), ref('album', 'a1', same)],
      [ref('chat', 'c1', same)],
    )
    expect(again.map((r) => r.id)).toEqual(['a2', 'a1', 'c1'])
  })

  it('handles an empty side, both sides, and an unusable timestamp', () => {
    expect(mergeNinaPhotoRefs([], [])).toEqual([])
    const good = ref('album', 'a1', '2026-09-05T00:00:00Z')
    const broken = { ...ref('chat', 'c1', '2026-09-09T00:00:00Z'), createdAt: null as never }
    const rows = mergeNinaPhotoRefs([good], [broken])
    // A row whose timestamp cannot be read sorts last rather than corrupting the comparator.
    expect(rows.map((r) => r.id)).toEqual(['a1', 'c1'])
  })

  it('paginateNinaPhotoRefs slices the requested window and returns [] past the end', () => {
    const album = [1, 2, 3, 4].map((n) => ref('album', `a${n}`, `2026-09-0${n}T00:00:00Z`))
    const sorted = mergeNinaPhotoRefs(album, []) // newest first: a4, a3, a2, a1
    expect(paginateNinaPhotoRefs(sorted, { offset: 1, limit: 2 }).map((r) => r.id)).toEqual([
      'a3',
      'a2',
    ])
    expect(paginateNinaPhotoRefs(sorted, { offset: 400, limit: 2 })).toEqual([])
  })

  describe('dedupeNinaPhotoRefs — "deduplicated", the operator\'s own word', () => {
    it('keeps the first (newest) of a group sharing one content_hash', () => {
      const rows = mergeNinaPhotoRefs(
        [ref('album', 'a1', '2026-09-06T00:00:00Z', { contentHash: 'HASH1' })],
        [ref('chat', 'c1', '2026-09-05T00:00:00Z', { contentHash: 'HASH1' })],
      )
      expect(dedupeNinaPhotoRefs(rows).map((r) => r.id)).toEqual(['a1'])
    })

    it('never treats two null hashes as duplicates of each other', () => {
      const rows = [
        ref('album', 'a1', '2026-09-06T00:00:00Z'),
        ref('chat', 'c1', '2026-09-05T00:00:00Z'),
      ]
      expect(dedupeNinaPhotoRefs(rows).map((r) => r.id)).toEqual(['a1', 'c1'])
    })

    it('leaves a collection with no duplicate hashes untouched, in order', () => {
      const rows = [
        ref('album', 'a1', '2026-09-06T00:00:00Z', { contentHash: 'H1' }),
        ref('chat', 'c1', '2026-09-05T00:00:00Z', { contentHash: 'H2' }),
      ]
      expect(dedupeNinaPhotoRefs(rows).map((r) => r.id)).toEqual(['a1', 'c1'])
    })
  })

  describe('ninaPhotoRefPreloadUrls — warms the browser for a likely Previous/Next', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      ref('album', `a${i}`, `2026-09-01T00:00:00.${String(i).padStart(3, '0')}Z`),
    )

    it('on the first page, offers only the next page — there is no previous to warm', () => {
      const urls = ninaPhotoRefPreloadUrls(rows, { offset: 0, limit: 4 })
      expect(urls).toEqual(
        paginateNinaPhotoRefs(rows, { offset: 4, limit: 4 }).map((r) => r.blobUrl),
      )
    })

    it('on a middle page, offers both neighbours and never the current page itself', () => {
      const urls = ninaPhotoRefPreloadUrls(rows, { offset: 4, limit: 4 })
      const previous = paginateNinaPhotoRefs(rows, { offset: 0, limit: 4 }).map((r) => r.blobUrl)
      const next = paginateNinaPhotoRefs(rows, { offset: 8, limit: 4 }).map((r) => r.blobUrl)
      expect(urls).toEqual([...previous, ...next])
      const current = paginateNinaPhotoRefs(rows, { offset: 4, limit: 4 }).map((r) => r.blobUrl)
      for (const url of current) expect(urls).not.toContain(url)
    })

    it('on the last page, the next window is empty rather than special-cased', () => {
      const urls = ninaPhotoRefPreloadUrls(rows, { offset: 8, limit: 4 })
      expect(urls).toEqual(
        paginateNinaPhotoRefs(rows, { offset: 4, limit: 4 }).map((r) => r.blobUrl),
      )
    })

    it("prefers the thumbnail, falling back to the original — the tile's own rule", () => {
      // Current page is row 0 (offset 0, limit 1); the preload window is row 1, the "next" page.
      const withThumb = [
        ref('album', 'current', '2026-09-02T00:00:00Z'),
        ref('album', 'a1', '2026-09-01T00:00:00Z', { thumbUrl: 'https://t/a1.jpg' }),
      ]
      const withoutThumb = [
        ref('chat', 'current', '2026-09-02T00:00:00Z'),
        ref('chat', 'c1', '2026-09-01T00:00:00Z'),
      ]
      expect(ninaPhotoRefPreloadUrls(withThumb, { offset: 0, limit: 1 })).toEqual([
        'https://t/a1.jpg',
      ])
      expect(ninaPhotoRefPreloadUrls(withoutThumb, { offset: 0, limit: 1 })).toEqual([
        withoutThumb[1]!.blobUrl,
      ])
    })

    it('answers [] for an empty collection', () => {
      expect(ninaPhotoRefPreloadUrls([], { offset: 0, limit: 4 })).toEqual([])
    })
  })
})

describe('the defaults, and the coercion that never throws', () => {
  it('are the shipping preferences: nothing selected, nothing typed, no reference', () => {
    expect(NINA_IMAGE_PREFS_DEFAULTS).toEqual({
      focus: { face: false, skin: false, boobs: false, butt: false, thighs: false, calves: false },
      wardrobe: '',
      venue: '',
      time: '',
      notes: '',
      promptTemplate: '',
      /* The measured camera (2026-09-11 A/B: 107 s anchored against the Pro's 257 s — past every
       * in-platform ceiling). Pinned as a literal so a default flip is always a witnessed one. */
      model: 'qwen/qwen-image-3',
      reference: { source: 'none', id: '' },
      /* The sentence NINA_FACE always carried, lifted into a selectable option (2026-09-18). */
      hairstyle: 'ponytail',
      /* The framing sentence {{angle}} always fell back to, lifted the same way (2026-09-18). */
      cameraAngle: 'eye_level',
    })
  })

  it('are frozen all the way down, because readNinaImagePrefs hands out this exact object', () => {
    expect(Object.isFrozen(NINA_IMAGE_PREFS_DEFAULTS)).toBe(true)
    expect(Object.isFrozen(NINA_IMAGE_PREFS_DEFAULTS.focus)).toBe(true)
    expect(Object.isFrozen(NINA_IMAGE_PREFS_DEFAULTS.reference)).toBe(true)
  })

  it('coerce null into the defaults, as a FRESH unfrozen object', () => {
    const coerced = coerceNinaImagePrefs(null)
    expect(coerced).toEqual({ ...NINA_IMAGE_PREFS_DEFAULTS })
    expect(coerced).not.toBe(NINA_IMAGE_PREFS_DEFAULTS)
    expect(Object.isFrozen(coerced)).toBe(false)
  })

  it('never throw on anything a psql session, a backup or a stale client can produce', () => {
    for (const bad of [
      undefined,
      {},
      { focus: 'all', reference: 7 },
      { wardrobe: 12, venue: null, time: [], notes: {} },
    ]) {
      expect(() => coerceNinaImagePrefs(bad as never)).not.toThrow()
    }
  })
})

describe("the migration's data step transcribes the defaults correctly", () => {
  /**
   * The copy of `nina_tuning.wardrobe` is one hand-appended `INSERT … SELECT` in phase 1's generated
   * migration, and every value it supplies other than the wardrobe is `NINA_IMAGE_PREFS_DEFAULTS`
   * written out in SQL. The migration is located by CONTENT and not by name, because the name is
   * whatever `db:generate` chose and renaming it would drop it below the journal's watermark.
   *
   * **IF A FUTURE PHASE CHANGES A DEFAULT AND THIS SUITE FAILS, DELETE THIS SUITE — DO NOT EDIT THE
   * MIGRATION.** An applied migration is a fact about what happened, and rewriting one that has run
   * makes the ledger and the database disagree. This suite exists to catch a mistranscription on the
   * day the copy is written, and it has no job after that day.
   */
  function migrationSql(): string {
    const dir = fileURLToPath(new URL('../drizzle', import.meta.url))
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    const matches = files
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
      .filter((sql) => sql.includes('INSERT INTO "nina_image_prefs"'))
    expect(matches, 'exactly one migration copies the wardrobe into nina_image_prefs').toHaveLength(
      1,
    )
    return matches[0]!
  }

  it('creates the table and copies only the rows that have a wardrobe', () => {
    const sql = migrationSql()
    expect(sql).toContain('CREATE TABLE "nina_image_prefs"')
    expect(sql).toContain('FROM "nina_tuning"')
    expect(sql).toContain('WHERE "nina_tuning"."wardrobe" <> \'\'')
    expect(sql).toContain('ON CONFLICT ("user_id") DO NOTHING')
  })

  it('supplies the default prompt length, all six focus flags false, and no reference', () => {
    const sql = migrationSql()
    const values = sql.slice(sql.indexOf('SELECT "nina_tuning"."user_id"'))
    /* Whitespace-tolerant on purpose: the statement's alignment is the author's, and a test that
     * pins indentation fails for a reason that is not a bug. What is pinned is the VALUES.
     *
     * `50` is a LITERAL, not `NINA_IMAGE_PROMPT_LENGTH_DEFAULT` — that constant, and the column
     * this statement fed, are both gone from the current schema (the prompt-length slider was
     * removed), but this migration already ran and is history: it stays pinned to what it wrote. */
    expect(values).toMatch(/,\s*50\s*,/)
    expect(values).toMatch(/(false\s*,\s*){5}false\s*,/)
    expect(NINA_IMAGE_FOCUS_KEYS).toHaveLength(6)
    expect(values).toMatch(new RegExp(`'${NINA_IMAGE_REFERENCE_NONE.source}'\\s*,\\s*''\\s*,`))
    // The trailing `1` is 0011's data step as it ran. The column it seeded was dropped by a later
    // migration, but an applied migration is a fact about what happened, so its literal stays
    // pinned rather than being reinterpreted to match today's schema.
    expect(values).toMatch(/,\s*1\s*FROM "nina_tuning"/)
  })

  it('names every column the copy needs, so a NOT NULL cannot be missed', () => {
    const sql = migrationSql()
    const columnList = sql.slice(
      sql.indexOf('INSERT INTO "nina_image_prefs"'),
      sql.indexOf('SELECT "nina_tuning"."user_id"'),
    )
    for (const column of [
      'user_id',
      'prompt_length',
      ...NINA_IMAGE_FOCUS_KEYS.map((k) => `focus_${k}`),
      'wardrobe',
      'venue',
      'time_of_day',
      'notes',
      'reference_source',
      'reference_id',
    ]) {
      expect(columnList, column).toContain(`"${column}"`)
    }
  })
})

describe("the picker's union cannot contain the same photograph twice (plan invariant 13)", () => {
  it('reaches the chat set through generatedChatPhotoScope, never a hand-written kind filter', () => {
    /* PLAN INVARIANT 13. `generatedChatPhotoScope` carries `isOriginalPhoto()`, which is the only
     * thing keeping an album face out of this grid twice — once as the `nina_avatars` row and
     * again as the chat row that points at it. Inlining `eq(kind, 'generated')` here would be the
     * obvious simplification (this read needs its own projection anyway) and would silently
     * re-create the duplicate the F37 set just removed. So the shortcut is a failing test. */
    const source = readSource('lib/nina/queries/imageprefs.ts')
    const fn = source.slice(source.indexOf('export async function listNinaPhotoReferences'))
    const body = fn.slice(0, fn.indexOf('\nexport '))
    expect(body).toContain('generatedChatPhotoScope(userId)')
    expect(body).not.toMatch(/ninaMessageImages\.kind/)
  })

  it('and the shared scope itself excludes a photograph already copied into her album', () => {
    /* THE SAME INVARIANT, THE OTHER DIRECTION. `isOriginalPhoto()` catches album → chat (a chat
     * row that POINTS at an album face). It cannot catch chat → album:
     * `setChatPhotoAsAvatarAction` copies the bytes into a new `nina_avatars` row and leaves the
     * chat row's provenance NULL, so the photograph came back as two tiles — which is what the
     * user reported on 2026-09-12 ("the first 2 are duplicates").
     *
     * The fix is one more arm on `generatedChatPhotoScope`, and it must STAY there: both the rows
     * and the `total` `listNinaPhotoReferences` returns are now read through this one scope (the
     * total is the deduped count of the SAME read, not a second statement any more), so a copy of
     * this arm inside `listNinaPhotoReferences` would let the two disagree. Asserted as source text
     * like the case above, because this file has no database harness — the generated-SQL proof is
     * `tests/nina.photoRefs.test.ts`'s `ADOPTED_SKIPPED`. */
    const source = readSource('lib/nina/queries/images.ts')
    const fn = source.slice(
      source.indexOf('\nexport function generatedChatPhotoScope(userId: string) {'),
    )
    const body = fn.slice(0, fn.indexOf('\n}\n'))
    expect(body).toContain('notExists(')
    expect(body).toContain('ninaAvatars.sourceKey')
    expect(body).toContain("'chat-photo:'")
    /* And the F37 arm is still there — the new one is an ADDITION, not a swap. */
    expect(body).toContain('isOriginalPhoto()')
  })
})

describe('the editable prompt template (the 2026-09-10 ask, second revision)', () => {
  /* The template IS the prompt: full prose with placeholders only where a VALUE goes. See §6 of
   * lib/nina/imageprefs.ts for the vocabulary and lib/nina/imagegen.ts for the default shell. */

  const VALID_MINIMAL = '{{scene}}'

  it('the vocabulary is the twelve value slots, and the required one is scene', () => {
    expect([...NINA_IMAGE_TEMPLATE_KEYS].sort()).toEqual([
      'angle',
      'buttClause',
      'faceLock',
      'focus',
      'hairstyle',
      'mood',
      'notes',
      'presence',
      'scene',
      'time',
      'venue',
      'wardrobe',
    ])
    expect([...NINA_IMAGE_TEMPLATE_REQUIRED_KEYS].sort()).toEqual(['scene'])
    for (const key of NINA_IMAGE_TEMPLATE_KEYS) {
      expect(NINA_IMAGE_TEMPLATE_SPECS[key].description.length).toBeGreaterThan(0)
    }
  })

  it('a minimal valid template, and an empty one (which means "use the default")', () => {
    expect(validateNinaImageTemplate(VALID_MINIMAL)).toEqual({ ok: true })
    expect(validateNinaImageTemplate('')).toEqual({ ok: true })
  })

  it('an unknown token is refused, and the error names it', () => {
    const verdict = validateNinaImageTemplate('{{wordrobe}}\n\n{{scene}}')
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toContain('wordrobe')
  })

  it('a stray brace is refused — doubled braces are the whole syntax', () => {
    for (const bad of ['{scene}', '{{scene}', '{{scene}}}', '{{{scene}}}']) {
      expect(validateNinaImageTemplate(bad).ok).toBe(false)
    }
  })

  it('a missing required token is refused, and the error names it', () => {
    const noScene = validateNinaImageTemplate('{{wardrobe}}')
    expect(noScene.ok).toBe(false)
    if (!noScene.ok) expect(noScene.error).toContain('scene')
  })

  it('coerce normalises CRLF, trims the ends and keeps internal newlines', () => {
    expect(coerceNinaImageTemplate('  {{scene}}\r\n\r\n{{wardrobe}}\r\n')).toBe(
      '{{scene}}\n\n{{wardrobe}}',
    )
  })

  it('coerce caps at NINA_PROMPT_TEMPLATE_MAX', () => {
    const long = VALID_MINIMAL + '\n\n' + 'p'.repeat(5000)
    expect(coerceNinaImageTemplate(long)).toHaveLength(NINA_PROMPT_TEMPLATE_MAX)
  })

  it('coerce degrades an invalid template to empty — the default — and never throws', () => {
    expect(coerceNinaImageTemplate('{{wordrobe}}')).toBe('')
    expect(coerceNinaImageTemplate('{{scene')).toBe('')
    expect(coerceNinaImageTemplate(42)).toBe('')
    expect(coerceNinaImageTemplate(null)).toBe('')
  })

  it('coerceNinaImagePrefs runs the template through the same coercion', () => {
    const good = coerceNinaImagePrefs({ promptTemplate: VALID_MINIMAL })
    expect(good.promptTemplate).toBe(VALID_MINIMAL)
    const bad = coerceNinaImagePrefs({ promptTemplate: '{{focus}}' })
    expect(bad.promptTemplate).toBe('')
  })
})
