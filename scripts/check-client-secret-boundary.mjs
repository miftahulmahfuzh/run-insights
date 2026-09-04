/**
 * No secret may be readable from a client bundle, and `NEXT_PUBLIC_` may never appear at all.
 *
 * Roadmap §4.1: every variable is server-only and none may ever be prefixed `NEXT_PUBLIC_`. This
 * is the mechanical half of that sentence, and F04's Task 24 in particular — `LLM_API_KEY` is the
 * one credential this app sends to a paid endpoint.
 *
 * ── WHY GREP, WHEN `server-only` EXISTS ─────────────────────────────────────────────────────
 * `lib/env.ts` imports `server-only`, so importing it from a client component is already a build
 * error. But that pill only guards the door it is nailed to: reading `process.env.LLM_API_KEY`
 * DIRECTLY in a client file bypasses it entirely and compiles to `undefined` in the browser at
 * best — or to the literal value if someone "fixes" the undefined by renaming it with the public
 * prefix. Both bypasses are name-level, so a name-level check is the right shape of check.
 *
 * ── WHY TWO NARROW RULES AND NOT ONE BROAD ONE ──────────────────────────────────────────────
 * The first draft of this script grepped every secret name across all of `app/` and
 * `components/`, and immediately failed on `app/api/health/route.ts` reading `env.DATABASE_URL`.
 * That is a Route Handler: it CANNOT end up in a client bundle, and reading validated env is
 * exactly what it should do. A guard that cries wolf at correct code gets deleted, so the rules
 * below are the two things that are genuinely always wrong:
 *
 *   RULE 1  A `'use client'` module naming any secret. Nothing in a client module has business
 *           knowing these names, and a client module is precisely what ships to the browser.
 *
 *   RULE 2  ANY file under app/ lib/ components/ reading `process.env.<SECRET>` directly. This is
 *           the `server-only` bypass, and it is wrong even in a server file: `lib/env.ts` is the
 *           single validated reader (a raw read skips the Zod check that turns a missing key into
 *           a build failure instead of a runtime `undefined`). Two deliberate exemptions, both
 *           documented at their call site: `lib/env.ts` itself, and `lib/db/index.ts`, which
 *           reads `DATABASE_URL` raw on purpose so importing it does not drag `server-only` into
 *           every unit test (F03's execution record, "do not tidy that").
 *
 *   RULE 3  `NEXT_PUBLIC_` anywhere in app/ lib/ components/. §4.1 forbids it outright, so this
 *           one needs no nuance.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DIRS = ['app', 'lib', 'components']
const SECRETS = [
  'LLM_API_KEY',
  'AUTH_SECRET',
  'AUTH_GOOGLE_SECRET',
  'AUTH_GOOGLE_ID',
  'BLOB_READ_WRITE_TOKEN',
  'CRON_SECRET',
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'OPENROUTER_API_KEY',
  /*
   * F33 phase 11 / R3. The signing half of the VAPID pair: whoever holds it can send push
   * notifications to every subscription this app has ever stored, as this app.
   *
   * `VAPID_PUBLIC_KEY` is deliberately NOT in this list. It is public by construction — it travels
   * inside every `pushManager.subscribe()` call and is readable in any subscribed browser — and
   * listing it would make RULE 1 forbid `components/push/PushSetup.tsx`, the one server component
   * whose entire job is to read it and hand it to the browser as a prop.
   */
  'VAPID_PRIVATE_KEY',
]
/** Raw-read exemptions. Each is deliberate and commented at its call site. */
const RAW_READ_ALLOWED = new Set(['lib/env.ts', 'lib/db/index.ts'])

/** grep -rlE, returning [] on "no matches" instead of throwing. */
function grepFiles(pattern, dirs) {
  try {
    return execFileSync('grep', ['-rlE', pattern, ...dirs], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch (err) {
    if (err.status === 1) return []
    console.error(`FAIL  grep itself errored: ${err.message}`)
    process.exit(2)
  }
}

/**
 * Comments are not code. A doc comment that names `NEXT_PUBLIC_` in order to forbid it is the
 * kind of writing this repo is full of and must not be flagged — `lib/env.ts`'s own header did
 * exactly that and failed the first version of Rule 3. Only executable lines can leak a value.
 */
function isComment(line) {
  const trimmed = line.trim()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

const failures = []

// RULE 1 — a client module naming a secret.
for (const file of grepFiles(SECRETS.join('|'), DIRS)) {
  const source = readFileSync(file, 'utf8')
  if (!/^\s*['"]use client['"]/m.test(source)) continue
  for (const [i, line] of source.split('\n').entries()) {
    if (isComment(line)) continue
    const hit = SECRETS.find((name) => line.includes(name))
    if (hit) failures.push(`${file}:${i + 1}  'use client' module names ${hit}\n    ${line.trim()}`)
  }
}

// RULE 2 — a raw process.env read of a secret, bypassing lib/env.ts's validation.
for (const file of grepFiles(`process\\.env\\.(${SECRETS.join('|')})`, DIRS)) {
  if (RAW_READ_ALLOWED.has(file)) continue
  for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    if (isComment(line)) continue
    if (new RegExp(`process\\.env\\.(${SECRETS.join('|')})`).test(line)) {
      failures.push(
        `${file}:${i + 1}  raw process.env read — go through lib/env.ts\n    ${line.trim()}`,
      )
    }
  }
}

// RULE 3 — NEXT_PUBLIC_ anywhere.
for (const file of grepFiles('NEXT_PUBLIC_', DIRS)) {
  for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
    if (isComment(line)) continue
    if (line.includes('NEXT_PUBLIC_')) {
      failures.push(
        `${file}:${i + 1}  NEXT_PUBLIC_ is forbidden (roadmap §4.1)\n    ${line.trim()}`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('FAIL  a secret is reachable from a client bundle, or read unvalidated:\n')
  for (const failure of failures) console.error('  ' + failure + '\n')
  process.exit(1)
}

console.log(
  `OK    no client module names a secret, no raw process.env reads outside ` +
    `${[...RAW_READ_ALLOWED].join(' / ')}, no NEXT_PUBLIC_ anywhere`,
)
