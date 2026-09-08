/**
 * Lift the shortcut-shaped rows out of `nina_memory_facts` into `nina_shortcuts`.
 *
 *   npm run nina:shortcuts-import                        # the dry run: reports, writes nothing
 *   npm run nina:shortcuts-import -- --apply
 *   npm run nina:shortcuts-import -- --apply --prune     # …and clear the ledger rows it wrote
 *   npm run nina:shortcuts-import -- --user <id> --limit 3
 *
 * NOT A TEST, and never part of `npm test`: it reads the real database and with `--apply` it writes
 * to it. The same line `scripts/nina-memory-reap.mjs` and `scripts/blob-reap.mjs` draw.
 *
 * ── WHAT IT IS FOR ────────────────────────────────────────────────────────────────────────────
 * Before `nina_shortcuts` existed the owner of this deployment had already been writing shortcuts
 * — trigger plus a long scene the trigger stands for — into the only writable surface he had,
 * `/admin/memory`. They are sitting in `nina_memory_facts` in four prose grammars, mislabelled
 * `category: 'person'`, capped at the newest 60 rows by `MEMORY_FACT_LIMIT`, and described to the
 * model as "colour, not structure". This script moves them to the table that was built for them.
 * It exists so he does not retype a single character of it.
 *
 * ── THE FOUR GRAMMARS, AND WHY THE TRIGGER GROUP DIFFERS BETWEEN THEM ─────────────────────────
 *   A   kalo|kalau (miftah|tah) bilang [:] <TRIGGER> [, or newline] nina [harus] bilang [:] <EXP>
 *   B   kalo|kalau (miftah|tah) bilang [:] <TRIGGER> [,]            nina bakal            <EXP>
 *   C   <TRIGGER> artinya    <EXP>
 *   D   <TRIGGER> ini posisi <EXP>
 *
 * A and B let the trigger contain whitespace: five of the real triggers are Latin tokens and one
 * of them is `nom nom`. C and D require `\S+?`, and that is load-bearing rather than tidy. A
 * lazy `[\s\S]*?` trigger in C is still anchored at ^ and still matches
 * `kalo dia diem artinya dia marah` with a 13-character trigger — under NINA_TRIGGER_MAX, so the
 * length check would not save it, and an ordinary sentence would have been imported as a
 * shortcut. `\S+?` cannot cross a space, so that sentence matches nothing and is reported.
 *
 * All four are tried and the first that parses cleanly wins. Stopping at the first STRUCTURAL
 * match would be wrong: the `🫦` row has A's shape up to the verb and only B reads it correctly.
 *
 * ── WHY THIS FILE IMPORTS lib/nina/shortcuts.ts INSTEAD OF RE-IMPLEMENTING IT ─────────────────
 * `match_key` is the only thing the runtime matcher looks at. A second implementation of
 * `normalizeNinaTrigger` that drifted by one character would write keys the matcher can never
 * find — an import that reports success and does nothing, which is the worst failure this script
 * has available. So it does not have a second implementation.
 *
 * `.mjs` importing the app's TypeScript is established practice here, not a new trick:
 * `scripts/nina-profpic.mjs` imports three `.ts` modules and `scripts/backfill-record-keys.mjs`
 * imports `lib/records/catalog.ts`, both under `--experimental-strip-types`. The one case where it
 * fails is documented in `nina-memory-reap.mjs`'s header: a module whose own imports are runtime
 * values (drizzle) rather than `import type`. `lib/nina/shortcuts.ts` has ZERO imports — the plan
 * set's invariant 4, held for a different reason (a client component needs the bounds) — so it is
 * the safest possible target. `lib/id.ts` is zero-import for the same kind of reason.
 *
 * IF A FUTURE CHANGE ADDS A RUNTIME IMPORT TO lib/nina/shortcuts.ts, THIS SCRIPT STOPS BOOTING.
 * That is the correct failure: loud, immediate, and at the top of the file.
 *
 * ── WHAT IT NEVER DOES ────────────────────────────────────────────────────────────────────────
 * It never deletes a ledger row that did not parse. It never deletes by pattern — only by
 * `nina_memory_facts.id`, and only after re-reading `nina_shortcuts` and finding a byte-identical
 * expansion there. It never invents a label: `label` is a slice of the operator's own words,
 * announced as a placeholder, for him to rewrite on /admin/shortcuts.
 */
import { pathToFileURL } from 'node:url'

import { neon } from '@neondatabase/serverless'

import { newId } from '../lib/id.ts'
import {
  NINA_SHORTCUT_EXPANSION_MAX,
  NINA_SHORTCUT_LABEL_MAX,
  NINA_TRIGGER_MAX,
  classifyNinaTrigger,
  normalizeNinaTrigger,
} from '../lib/nina/shortcuts.ts'

/* Re-exported so `tests/nina.shortcutsImport.test.ts` can assert FUNCTION IDENTITY against the
 * same two names imported from '@/lib/nina/shortcuts'. `toBe` on those is the anti-drift guard:
 * it fails the moment anyone turns this import back into a copy. */
export { classifyNinaTrigger, normalizeNinaTrigger }

export const USAGE =
  'usage: node --experimental-strip-types --no-warnings --env-file=.env.local ' +
  'scripts/nina-shortcuts-import.mjs [--apply] [--prune] [--user <id>] [--limit <n>]'

/** The label is cut here, at a word boundary. See `placeholderLabel`. */
export const LABEL_TARGET_CHARS = 60

/**
 * The four grammars, anchored, case-insensitive, Unicode-aware. Tried in this order.
 *
 * `\s*` between every part is what absorbs the real data's spacing: `bilang🍑 ,` with no space
 * before the trigger, `🤏,` with none after, `bilang: 🫦 ,` with a colon in front, `🤲 artinya`
 * with one space and `✌️artinya` with none, and the `yumm` row where a literal NEWLINE stands
 * where the comma should be.
 */
export const GRAMMARS = [
  {
    name: 'A',
    re: /^\s*(?:kalo|kalau)\s+(?:miftah|tah)\s+bilang\s*:?\s*(?<trigger>[\s\S]*?)\s*,?\s*nina\s+(?:harus\s+)?bilang\s*:?\s*(?<expansion>[\s\S]+)$/iu,
  },
  {
    name: 'B',
    re: /^\s*(?:kalo|kalau)\s+(?:miftah|tah)\s+bilang\s*:?\s*(?<trigger>[\s\S]*?)\s*,?\s*nina\s+bakal\s+(?<expansion>[\s\S]+)$/iu,
  },
  { name: 'C', re: /^\s*(?<trigger>\S+?)\s*artinya\s+(?<expansion>[\s\S]+)$/iu },
  { name: 'D', re: /^\s*(?<trigger>\S+?)\s*ini\s+posisi\s+(?<expansion>[\s\S]+)$/iu },
]

/* ── Pure helpers. These four are what `tests/nina.shortcutsImport.test.ts` proves. ────────── */

/**
 * Parse argv. Throws on anything ambiguous rather than picking a default, because the only
 * defaults available here are defaults that write production.
 */
export function parseArgs(argv) {
  const flags = { apply: false, prune: false, user: null, limit: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') {
      flags.apply = true
    } else if (arg === '--prune') {
      flags.prune = true
    } else if (arg === '--user') {
      const value = argv[++i]
      if (!value || value.startsWith('-')) throw new Error('--user needs a user id')
      flags.user = value
    } else if (arg === '--limit') {
      const value = Number(argv[++i])
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--limit needs a positive integer')
      }
      flags.limit = value
    } else if (arg === '--help' || arg === '-h') {
      throw new Error(USAGE)
    } else {
      throw new Error(`unknown argument ${arg}\n${USAGE}`)
    }
  }
  if (flags.prune && !flags.apply) {
    throw new Error(
      '--prune is only valid together with --apply: there is nothing to prune until the\n' +
        'shortcuts exist in nina_shortcuts. Re-run with --apply --prune.',
    )
  }
  return flags
}

/** A slice can land between the two halves of an emoji. Drop a dangling high surrogate. */
const dropLoneSurrogate = (value) => (/[\uD800-\uDBFF]$/.test(value) ? value.slice(0, -1) : value)

/**
 * The `label` an imported row gets: the operator's own first ~60 characters, cut back to the last
 * word boundary.
 *
 * IT IS A PLACEHOLDER. The script says so in its output too. `/admin/shortcuts` is where he
 * rewrites it into a name for the scene; this function's job is to never invent one.
 */
export function placeholderLabel(expansion) {
  const flat = expansion.replace(/\s+/g, ' ').trim()
  if (flat.length <= LABEL_TARGET_CHARS) return flat
  const cut = flat.slice(0, LABEL_TARGET_CHARS)
  const space = cut.lastIndexOf(' ')
  const label = dropLoneSurrogate((space > 0 ? cut.slice(0, space) : cut).trim())
  const fallback = dropLoneSurrogate(flat.slice(0, NINA_SHORTCUT_LABEL_MAX))
  return label.length > 0 ? label : fallback
}

/**
 * A parsed shortcut, or the reason a row is not one. This is a DISCRIMINATED union on `ok`, and
 * the JSDoc is what makes it one: in a `.mjs`, `ok: true` widens to `boolean`, which collapses
 * the two members into a single type with every field optional — so
 * `tests/nina.shortcutsImport.test.ts`'s `if (!result.ok) return` would narrow nothing and
 * `result.matchKey` would be `string | undefined` under `tsc --noEmit`. The annotation states the
 * return type this phase's Interface Contract already declares; it is not a new contract.
 *
 * @typedef {{ ok: true, grammar: string, trigger: string, expansion: string, matchKey: string,
 *             kind: 'glyph' | 'word' }} ParsedShortcut
 * @typedef {{ ok: false, reason: string }} RejectedRow
 */

/**
 * One ledger row -> a shortcut, or a reason it is not one.
 *
 * Every grammar is tried; the first that parses AND validates wins. A row that matched a grammar
 * structurally but failed a bound is reported with that bound named, rather than being silently
 * imported under a garbage key or silently dropped.
 *
 * @param {string} text
 * @returns {ParsedShortcut | RejectedRow}
 */
export function parseShortcutRow(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, reason: 'the row is empty' }
  }
  let firstFailure = null
  for (const { name, re } of GRAMMARS) {
    const match = re.exec(text)
    if (!match?.groups) continue

    const trigger = match.groups.trigger.trim()
    const expansion = match.groups.expansion.trim()
    const fail = (reason) => {
      firstFailure ??= { ok: false, reason: `[${name}] ${reason}` }
    }

    if (trigger.length === 0) {
      fail('the trigger is empty')
      continue
    }
    if (expansion.length === 0) {
      fail('the expansion is empty')
      continue
    }
    const matchKey = normalizeNinaTrigger(trigger)
    if (matchKey.length === 0) {
      fail(`the trigger ${JSON.stringify(trigger)} normalises to nothing`)
      continue
    }
    if (matchKey.length > NINA_TRIGGER_MAX) {
      fail(
        `the trigger is ${matchKey.length} chars, the ceiling is ${NINA_TRIGGER_MAX}: ` +
          JSON.stringify(trigger.slice(0, 40)),
      )
      continue
    }
    if (expansion.length > NINA_SHORTCUT_EXPANSION_MAX) {
      fail(
        `the expansion is ${expansion.length} chars, the ceiling is ${NINA_SHORTCUT_EXPANSION_MAX}`,
      )
      continue
    }
    return {
      ok: true,
      grammar: name,
      trigger,
      expansion,
      matchKey,
      kind: classifyNinaTrigger(matchKey),
    }
  }
  return (
    firstFailure ?? { ok: false, reason: 'no grammar matched — this is a fact, not a shortcut' }
  )
}

/* ── The CLI. Nothing below here runs when this module is imported. ────────────────────────── */

const clip = (value, n) => {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > n ? `${dropLoneSurrogate(flat.slice(0, n - 1))}…` : flat
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
    console.error('DATABASE_URL is not set. Run with `node --env-file=.env.local`.')
    process.exit(2)
  }
  const sql = neon(process.env.DATABASE_URL)

  const mode = flags.apply ? (flags.prune ? 'APPLY + PRUNE' : 'APPLY') : 'DRY RUN'
  console.log(`${mode} — lifting shortcuts out of nina_memory_facts into nina_shortcuts`)
  if (flags.user) console.log(`  user filter    ${flags.user}`)
  if (flags.limit !== null) console.log(`  limit          ${flags.limit} importable row(s)`)
  console.log('')

  const facts = flags.user
    ? await sql`
        select id, user_id, text, created_at
          from nina_memory_facts
         where user_id = ${flags.user}
         order by created_at
      `
    : await sql`
        select id, user_id, text, created_at
          from nina_memory_facts
         order by user_id, created_at
      `

  /* ── 1. read the ledger and sort it into shortcuts and facts ────────────────────────────── */

  const candidates = []
  const skipped = []
  const seen = new Set()

  for (const row of facts) {
    const result = parseShortcutRow(row.text)
    if (!result.ok) {
      skipped.push({ factId: row.id, userId: row.user_id, text: row.text, reason: result.reason })
      continue
    }
    const dedupeKey = `${row.user_id}::${result.matchKey}`
    if (seen.has(dedupeKey)) {
      skipped.push({
        factId: row.id,
        userId: row.user_id,
        text: row.text,
        reason: `an earlier ledger row already defines ${JSON.stringify(result.trigger)}`,
      })
      continue
    }
    seen.add(dedupeKey)
    candidates.push({
      ...result,
      factId: row.id,
      userId: row.user_id,
      label: placeholderLabel(result.expansion),
    })
  }

  const work = flags.limit === null ? candidates : candidates.slice(0, flags.limit)

  /* ── 2. report, always, in both modes ───────────────────────────────────────────────────── */

  console.log(`nina_memory_facts — ${facts.length} row(s) read`)
  console.log(
    `\nPARSED — ${candidates.length} shortcut(s)${
      work.length === candidates.length ? '' : `, ${work.length} of them in this run (--limit)`
    }`,
  )
  for (const c of candidates) {
    const mark = work.includes(c) ? ' ' : '·'
    console.log(
      `  ${mark} [${c.grammar}] ${c.trigger.padEnd(10)} ${c.kind.padEnd(5)} ` +
        `key=${JSON.stringify(c.matchKey).padEnd(12)} ${clip(c.expansion, 64)}`,
    )
  }
  console.log(
    `\n  label is the first ${LABEL_TARGET_CHARS} characters of the expansion, cut at a word` +
      '\n  boundary. It is a PLACEHOLDER for the operator to rewrite on /admin/shortcuts.' +
      '\n  This script never invents a description of the scene.',
  )

  console.log(`\nSKIPPED — ${skipped.length} row(s), left in the ledger untouched`)
  for (const s of skipped) {
    console.log(`  -   ${clip(s.text, 72)}`)
    console.log(`      ${s.reason}`)
  }

  /* ── 3. write, or explain that nothing was written ──────────────────────────────────────── */

  if (!flags.apply) {
    console.log(
      `\nnothing was written. ${work.length} shortcut(s) pending. Re-run with --apply.` +
        '\n(--apply --prune would then delete the ledger rows it wrote, by id.)',
    )
    process.exit(0)
  }

  console.log(`\nINSERT — ${work.length} row(s) into nina_shortcuts`)
  let inserted = 0
  for (const c of work) {
    const rows = await sql`
      insert into nina_shortcuts
        (id, user_id, "trigger", match_key, kind, label, expansion, enabled, created_at, updated_at)
      values
        (${newId()}, ${c.userId}, ${c.trigger}, ${c.matchKey}, ${c.kind},
         ${c.label}, ${c.expansion}, true, now(), now())
      on conflict (user_id, match_key) do nothing
      returning id
    `
    if (rows.length === 1) {
      inserted++
      console.log(`  +   ${c.trigger.padEnd(10)} ${rows[0].id}`)
    } else {
      console.log(`  =   ${c.trigger.padEnd(10)} already present, left exactly as it is`)
    }
  }
  console.log(
    `\ninserted ${inserted}, already present ${work.length - inserted}. The ledger is untouched.`,
  )

  if (!flags.prune) {
    console.log('Re-run with --apply --prune to clear the ledger rows these came from.')
    process.exit(0)
  }

  /* ── 4. prune: by id, and only against a byte-identical stored expansion ────────────────── */

  console.log('\nPRUNE — deleting the ledger rows whose shortcut is confirmed in nina_shortcuts')
  let deleted = 0
  let kept = 0
  for (const c of work) {
    const [stored] = await sql`
      select id, expansion
        from nina_shortcuts
       where user_id = ${c.userId}
         and match_key = ${c.matchKey}
       limit 1
    `
    if (!stored) {
      kept++
      console.log(
        `  !   ${c.trigger.padEnd(10)} not in nina_shortcuts — ledger row ${c.factId} kept`,
      )
      continue
    }
    if (stored.expansion !== c.expansion) {
      kept++
      console.log(
        `  ~   ${c.trigger.padEnd(10)} a DIFFERENT expansion is stored — ledger row ${c.factId} kept.` +
          '\n      Someone edited it on /admin/shortcuts; this is the last copy of the original.',
      )
      continue
    }
    const gone = await sql`
      delete from nina_memory_facts
       where id = ${c.factId}
         and user_id = ${c.userId}
      returning id
    `
    if (gone.length === 1) {
      deleted++
      console.log(`  -   ${c.trigger.padEnd(10)} ledger row ${c.factId} deleted`)
    } else {
      kept++
      console.log(`  !   ${c.trigger.padEnd(10)} ledger row ${c.factId} was already gone`)
    }
  }
  console.log(
    `\ndeleted ${deleted} ledger row(s), kept ${kept}.` +
      '\nRe-run with no flag to confirm what is left.',
  )
  process.exit(0)
}

/* Run only as the process entry point, so `tests/nina.shortcutsImport.test.ts` can import the
 * helpers above without opening a database connection or writing a row. The guard is
 * `scripts/nina-profpic.mjs`'s, verbatim. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
