/**
 * Read (and, later, retire) the live per-user override of Nina's selfie prompt template, as the
 * mechanical half of promoting a hand-tuned prompt into the shipped default.
 *
 *   npm run nina:promote-image-prompt                              # dry run, always
 *   npm run nina:promote-image-prompt -- --user <id>                # only needed with 2+ users
 *   npm run nina:promote-image-prompt -- --reset-after-deploy       # the one write this makes
 *
 * The bare form needs the same two node flags every `.ts`-importing script here carries:
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/nina-promote-image-prompt.mjs --reset-after-deploy
 *
 * ── WHAT THIS SCRIPT IS FOR, AND WHAT IT DELIBERATELY LEAVES TO THE OPERATOR ──────────────────
 * The two things a prompt promotion touches are a TypeScript constant
 * (`NINA_PROMPT_TEMPLATE_DEFAULT` in lib/nina/imagegen.ts) and a database column
 * (`nina_image_prefs.prompt_template`). Editing a TS array literal is a judgment call — telling
 * apart "the operator rewrote this line" from "this line is still the canon block verbatim" is
 * not this script's business, and .claude/skills/set-current-image-gen-prompt-as-default/SKILL.md
 * is where that judgment happens. This script only ever does the two mechanical, unambiguous
 * halves: read the live override out of the database, and — once the code half has shipped —
 * retire it back to ''. It never touches lib/nina/imagegen.ts.
 *
 * ── WHY `--reset-after-deploy` IS ITS OWN FLAG AND NOT A GENERIC --apply ──────────────────────
 * Resetting the override to '' BEFORE the new default has actually deployed makes
 * `effectiveNinaImageTemplate` (lib/nina/imagegen.ts) fall through to the OLD default for every
 * photograph generated in that window — a real behavioural regression, silent, and exactly
 * backwards from the intent of a promotion. The flag's name is the guard: there is no `--apply`
 * that could be reached for out of habit before the deploy has shipped.
 *
 * ── WHY THE VALIDATOR RUNS HERE TOO ────────────────────────────────────────────────────────────
 * `lib/nina/imageprefs.ts` is deliberately zero-import (no `@/lib/...`, no `server-only`), the
 * same property `lib/nina/imagerecipe.ts` and `lib/id.ts` have, which is what lets a bare
 * `--experimental-strip-types` script reach `validateNinaImageTemplate` directly rather than
 * re-implementing the three checks (unknown placeholder, stray brace, missing required key) a
 * second time. A broken override must never become the new shipped default, so this script
 * refuses rather than promotes text the panel itself would have rejected.
 *
 * ── THE USER INTERLOCK ─────────────────────────────────────────────────────────────────────────
 * Same shape as scripts/nina-profpic.mjs: zero users means the wrong Neon branch (refuse), more
 * than one means --user is required rather than guessed.
 */

import { neon } from '@neondatabase/serverless'
import { validateNinaImageTemplate } from '../lib/nina/imageprefs.ts'

function parseArgs(argv) {
  const flags = { user: null, resetAfterDeploy: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--user') {
      flags.user = argv[++i]
      if (!flags.user) throw new Error('--user needs a value')
    } else if (arg === '--reset-after-deploy') {
      flags.resetAfterDeploy = true
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return flags
}

async function main() {
  let flags
  try {
    flags = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }

  if (!process.env.DATABASE_URL) {
    console.error('missing DATABASE_URL — run with --env-file=.env.local.')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)

  const users = flags.user
    ? await sql`select id, email from "user" where id = ${flags.user}`
    : await sql`select id, email from "user" order by id`
  if (flags.user && users.length === 0) {
    console.error(`no user ${flags.user} in this database`)
    process.exit(1)
  }
  if (users.length === 0) {
    console.error(
      'REFUSING: this database holds no users at all.\n' +
        'That is what a DATABASE_URL pointing at the wrong Neon branch looks like.',
    )
    process.exit(1)
  }
  if (users.length > 1) {
    console.error(
      `this database holds ${users.length} users; pass --user <id>:\n` +
        users.map((u) => `  ${u.id}  ${u.email ?? '(no email)'}`).join('\n'),
    )
    process.exit(2)
  }
  const user = users[0]

  let rows
  try {
    rows = await sql`
      select prompt_template, updated_at
      from nina_image_prefs
      where user_id = ${user.id}
    `
  } catch (error) {
    if (error?.code === '42P01') {
      console.error(
        'REFUSING: there is no nina_image_prefs table in this database.\n' +
          'The image-gen-controls migration has not been applied here. Run `npm run db:migrate`.',
      )
      process.exit(1)
    }
    throw error
  }

  console.log(`user:            ${user.id}  ${user.email ?? '(no email)'}`)

  if (rows.length === 0) {
    console.log(
      'no nina_image_prefs row for this user — the panel has never saved anything for them, so\n' +
        'the shipped default is already what is live. Nothing to promote.',
    )
    process.exit(0)
  }

  const { prompt_template: template, updated_at: updatedAt } = rows[0]
  console.log(`row updated_at:  ${updatedAt}`)

  if (template === '') {
    console.log(
      'prompt_template is "" — this user is already on the shipped default. Nothing to promote.',
    )
    process.exit(0)
  }

  const verdict = validateNinaImageTemplate(template)
  if (!verdict.ok) {
    console.error(
      `REFUSING to promote: the stored override does not pass validateNinaImageTemplate.\n  ${verdict.error}\n` +
        '(effectiveNinaImageTemplate() is already silently falling back to the shipped default for\n' +
        "this user's generations — this row is stale, not live.)",
    )
    process.exit(1)
  }

  if (!flags.resetAfterDeploy) {
    console.log(
      `\nvalid override, ${template.length} chars, ${template.split('\n').length} lines. This is the\n` +
        'live prompt. Diff it against NINA_PROMPT_TEMPLATE_DEFAULT in lib/nina/imagegen.ts (lines\n' +
        '431-455) by hand — that edit is a judgment call this script does not make.\n' +
        '--- live override, verbatim -----------------------------------------------------------',
    )
    console.log(template)
    console.log('--- end -----------------------------------------------------------------------')
    console.log(
      '\nOnce lib/nina/imagegen.ts has been edited, verified, committed, pushed, and the deploy\n' +
        'has actually shipped — re-run this script with --reset-after-deploy to retire this row\n' +
        'back to "".',
    )
    process.exit(0)
  }

  console.log('\n--reset-after-deploy: setting prompt_template back to "" for this user…')
  await sql`
    update nina_image_prefs
    set prompt_template = ''
    where user_id = ${user.id}
  `
  console.log("done. This user's override is retired; they are back on the shipped default.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
