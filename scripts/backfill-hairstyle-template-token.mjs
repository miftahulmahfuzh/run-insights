/**
 * Rewrite a SAVED `nina_image_prefs.prompt_template` that still hard-codes the old, frozen
 * ponytail sentence into one that carries the live `{{hairstyle}}` token — so an account that
 * customised its template before the 2026-09-18 hairstyle preset shipped starts respecting the
 * preset without having to hand-edit the textarea themselves.
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-hairstyle-template-token.mjs
 *   node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-hairstyle-template-token.mjs --apply
 *
 *   npm run nina:backfill-hairstyle-template            # the dry run
 *   npm run nina:backfill-hairstyle-template -- --apply
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it
 * writes to it. `scripts/backfill-record-keys.mjs`'s own line.
 *
 * ── THE GAP THIS FILLS, MEASURED ──────────────────────────────────────────────────────────────
 * `NINA_PROMPT_TEMPLATE_DEFAULT` (`lib/nina/imagegen.ts`) now spells the face paragraph with a
 * `{{hairstyle}}` token in place of the sentence `NINA_FACE` used to carry as fixed prose. That
 * only helps an account whose `nina_image_prefs.prompt_template` is `''` — "use the default" —
 * because `effectiveNinaImageTemplate` renders a NON-EMPTY stored template byte for byte, never
 * re-deriving it from the current default shell. Job `q3DrQfYqXov8` (2026-09-18) is the measured
 * instance: the operator picked "Shaggy shoulder-length" in `/admin/image-generation`, the whole
 * row saved correctly (`hairstyle = 'shaggy'`), and the very next photograph still came back with
 * "Long dark brown hair pulled into a high ponytail…" — because that account's own saved template
 * predates the token and still spells the sentence out as plain text with nothing to substitute.
 *
 * ── WHY A TEXT REPLACE, AND NOT "RESET TO DEFAULT TEMPLATE" ───────────────────────────────────
 * The panel already has a reset button, and it is the wrong tool here: it would discard every
 * OTHER customisation a template may carry (a rewritten POSE sentence, a reordered block, an
 * operator's own prose) to fix one sentence. This script changes exactly the substring that
 * names the hairstyle and nothing else — the same "insert-only cannot corrupt a value it does not
 * compute" argument `backfill-record-keys.mjs` makes for its own narrower write.
 *
 * ── THE SENTENCE IS IMPORTED, NOT RETYPED ─────────────────────────────────────────────────────
 * `NINA_HAIRSTYLE_SENTENCES.ponytail` (`lib/nina/persona/appearance.ts`, imported directly — see
 * the import's own comment for why not via the `persona.ts` barrel) is the ONE spelling of the
 * frozen sentence — the same string `NINA_FACE` was built from before the split. A hand-typed copy
 * here would be a second source of truth for text this script exists to find; if that sentence is
 * ever reworded, this script's search string moves with it rather than silently stopping matching
 * anything.
 *
 * ── EVERY WRITE IS VALIDATED AND CONCURRENCY-GUARDED ──────────────────────────────────────────
 * `validateNinaImageTemplate` (`lib/nina/imageprefs.ts`) is the SAME function the save action and
 * the render path both run through — a row this script would write is a row the app would have
 * accepted from the panel. The `UPDATE` is guarded on `prompt_template = <the exact text just
 * read>`, so a template the operator edited between this script's read and its write is left
 * alone rather than clobbered: `writes` = 0 for that row, not a silent overwrite of a newer edit.
 *
 * ── WHAT IT WILL NOT TOUCH, AND WHY THAT NEEDS NO SPECIAL CASE ────────────────────────────────
 * A template with zero, or more than one, occurrence of the exact sentence is skipped and named
 * under `needsManualReview` rather than guessed at: zero means the row was already fine (or never
 * had the old sentence to begin with) and multiple means the substitution target is ambiguous —
 * both cases this script declines to act on rather than picking one.
 */
import { neon } from '@neondatabase/serverless'

/* Imported from `appearance.ts` directly, NOT the `persona.ts` barrel: the barrel's other
 * submodules (`bands.ts`, `identity.ts`) import each other by extensionless relative path, which
 * plain Node's ESM resolver cannot follow under `--experimental-strip-types` (no bundler here to
 * paper over it) — the same reason this file cannot import `@/lib/...` at all. `appearance.ts`
 * itself has exactly one import and it is `import type`, so it carries no such dependency. */
import { NINA_HAIRSTYLE_SENTENCES } from '../lib/nina/persona/appearance.ts'
import { validateNinaImageTemplate } from '../lib/nina/imageprefs.ts'

const apply = process.argv.includes('--apply')
const url = process.env.DATABASE_URL
if (!url) {
  console.error('FAIL  DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
  process.exit(1)
}
const sql = neon(url)

/** The one frozen sentence this script hunts for — imported, never retyped. See the header. */
const OLD_SENTENCE = NINA_HAIRSTYLE_SENTENCES.ponytail

const rows = await sql`
  select user_id, prompt_template
    from nina_image_prefs
   where prompt_template <> ''
   order by user_id
`

console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} row(s) with a saved template\n`)

let updated = 0
let alreadyTokenised = 0
let noMatch = 0
const needsManualReview = []

for (const { user_id: userId, prompt_template: template } of rows) {
  if (template.includes('{{hairstyle}}')) {
    alreadyTokenised++
    continue
  }

  const occurrences = template.split(OLD_SENTENCE).length - 1
  if (occurrences === 0) {
    noMatch++
    continue
  }
  if (occurrences > 1) {
    needsManualReview.push({ userId, reason: `sentence appears ${occurrences} times` })
    console.log(`  !!  ${userId}  ambiguous: the sentence appears ${occurrences} times — skipped`)
    continue
  }

  const next = template.replace(OLD_SENTENCE, '{{hairstyle}}')
  const verdict = validateNinaImageTemplate(next)
  if (!verdict.ok) {
    needsManualReview.push({ userId, reason: verdict.error })
    console.log(`  !!  ${userId}  replacement would be invalid: ${verdict.error} — skipped`)
    continue
  }

  console.log(`  ${apply ? '+' : '~'}   ${userId}  ponytail sentence -> {{hairstyle}}`)
  updated++

  if (apply) {
    const result = await sql`
      update nina_image_prefs
         set prompt_template = ${next}, updated_at = now()
       where user_id = ${userId} and prompt_template = ${template}
      returning user_id
    `
    if (result.length === 0) {
      console.log(`      (skipped at write time — ${userId}'s template changed since the read)`)
      updated--
    }
  }
}

console.log(
  `\n${apply ? 'updated' : 'would update'} ${updated} row(s); ` +
    `${alreadyTokenised} already tokenised, ${noMatch} with no match, ` +
    `${needsManualReview.length} need manual review`,
)
if (needsManualReview.length > 0) {
  console.log('needs manual review:')
  for (const { userId, reason } of needsManualReview) console.log(`  - ${userId}: ${reason}`)
}
if (!apply) console.log('\nnothing was written. Re-run with --apply.')
