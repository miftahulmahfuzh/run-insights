// F07's two grep-able invariants, each with a real exit code.
//
// 1. BODY WEIGHT NEVER REACHES A MODEL (D15 / R-28).
//    `profiles.weight_kg` is collected by the profile screen and read by nothing that talks to an
//    LLM. `lib/llm/facts.ts` builds its profile object field by field for exactly this reason, but
//    a type only protects the path that goes through the type — a future `{ ...profile }` in a
//    fact builder would compile, ship, and put a weight in a coaching prompt. The roadmap says
//    "enforced structurally"; this is the structure.
//
// 2. `getOrCreateInsight` IS NEVER AWAITED FROM A PAGE RENDER (plan §7.2).
//    A cache miss is a 10-35 s model call. The run detail page's numbers are stored and already
//    correct, so blocking the render on prose trades a complete screen for a blank one. The two
//    sanctioned callers are the Server Action (fired from a client effect) and the cron route.
//    A `page.tsx` that awaits it would look fine in dev against a warm cache and hang in
//    production the first time a runner opened a new run.
//
// Fix the code, never silence the check.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

/** Same approximate comment-stripper as the F08 guard, for the same reason: prose may say "weight". */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(path)) out.push(path)
  }
  return out
}

/* ── 1. no weight anywhere near a prompt ──────────────────────────────────────────────────── */

const WEIGHT = /\bweight_?[Kk]g\b/

for (const path of [...walk(join('lib', 'llm')), ...walk(join('lib', 'insights'))]) {
  const hit = WEIGHT.exec(stripComments(readFileSync(path, 'utf8')))
  if (hit) {
    failures.push(
      `${path} references ${hit[0]}. D15/R-28: body weight never enters an LLM payload, and this ` +
        'directory is the payload. If a calorie sanity check needs it, that check is a FLAG ' +
        'computed by F06, not something a narrator infers.',
    )
  }
}

/* ── 2. the non-blocking boundary ─────────────────────────────────────────────────────────── */

const SANCTIONED = new Set([
  join('lib', 'insights', 'actions.ts'),
  join('lib', 'llm', 'narrate.ts'),
  join('app', 'api', 'cron', 'rollup', 'route.ts'),
])

for (const path of [...walk('app'), ...walk('lib'), ...walk('components')]) {
  if (SANCTIONED.has(path) || path.endsWith('.test.ts')) continue
  if (/getOrCreateInsight\s*\(/.test(stripComments(readFileSync(path, 'utf8')))) {
    failures.push(
      `${path} calls getOrCreateInsight. On a cache miss that is a 10-35 s model call — see ` +
        'docs/plans/F07-insights.md §7.2. Call it from lib/insights/actions.ts (a Server Action, ' +
        'fired from a client effect) or from the cron route, never from a render path.',
    )
  }
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error('F07 payload boundary guard FAILED:\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  'F07 payload boundary guard passed: no body weight in lib/llm or lib/insights, and ' +
    'getOrCreateInsight is confined to its two non-blocking callers.',
)
