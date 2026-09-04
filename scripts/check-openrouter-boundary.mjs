// OPENROUTER_API_KEY's boundary, and a ruling that moved it.
//
// It used to be build-time-only: read by tools/gen_badge_art.py (F10) and tools/extend_badge_art.py
// (F15) and by NOTHING at runtime, per ROADMAP_v0.1.0.md §4.1 and D12.
//
// **NINA_CHATBOT_PLAN.md RU-2 repeals D12 for `lib/nina/` ONLY.** F33's Nina generates images at
// runtime (R18) — queued, daily-capped, and cost-logged in `nina_turns`. Badge and record art is
// unchanged: still generated offline by a skill and committed, still $0.04 and 4-5 minutes an
// image, still no reason whatsoever to do at request time.
//
// So this check is NARROWED, not removed. It still greps app/, lib/ and components/, and it still
// fails for every hit outside two exempt paths:
//
//   · `lib/nina/`  — the ruling's own boundary. Her generation client lives here.
//   · `lib/env.ts` — the app's single environment contract, which is where every other
//                    credential is declared and where the next person will look for this one.
//                    Hiding the variable in a lib/nina/env.ts, or assembling its name so this
//                    grep misses it, would be evading the check rather than amending it — which
//                    the plan's invariant 8 forbids in as many words.
//
// If this script fails, something in app/, components/ or the rest of lib/ started reading a key
// that only Nina and the offline skills may see. Fix the import, don't widen the exemption.
//
// Exported as well as run: `scripts/check-badge-art.mjs` asserts the same property as its first
// section, because `npm run badges:check` is meant to be the one command that says whether F10 is
// whole, and "the key never leaked" is the most important thing it can say. One implementation,
// two callers — a second copy of a security grep is a second thing to keep in step, and the copy
// is always the one that goes stale.
import { execSync } from 'node:child_process'

const DIRS = ['app', 'lib', 'components']

/**
 * Paths the key is allowed to appear in, as PREFIXES of a repo-relative path. RU-2.
 *
 * Prefix-matched in JS rather than handed to `grep --exclude-dir`, because `--exclude-dir=nina`
 * matches a directory NAME anywhere in the tree and would quietly exempt `app/nina/` and
 * `components/nina/` as well — and a client component reading this key is exactly the leak this
 * script exists to catch.
 */
const EXEMPT_PATHS = ['lib/nina/', 'lib/env.ts']

function isExempt(line) {
  // grep -rn output is `path:lineno:text`; the path is everything before the first colon.
  const path = line.slice(0, line.indexOf(':'))
  return EXEMPT_PATHS.some((prefix) => path === prefix || path.startsWith(prefix))
}

/** @returns {{ok: true} | {ok: false, reason: string, detail: string}} */
export function checkOpenRouterBoundary() {
  let raw
  try {
    raw = execSync(`grep -rnE 'OPENROUTER_API_KEY' ${DIRS.join(' ')}`, { encoding: 'utf8' })
  } catch (err) {
    // grep exits 1 when it finds nothing — that's a success path, and still is.
    if (err.status === 1) return { ok: true }
    return { ok: false, reason: 'grep itself errored', detail: err.message }
  }

  const leaked = raw
    .split('\n')
    .filter((line) => line.length > 0 && !isExempt(line))
    .join('\n')

  if (leaked.length === 0) return { ok: true }
  return { ok: false, reason: 'found outside its boundary', detail: leaked }
}

export const BOUNDARY_DIRS = DIRS
export { EXEMPT_PATHS }

// Run directly (`npm run ci:openrouter-guard`) rather than imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkOpenRouterBoundary()
  if (result.ok) {
    console.log(
      `OK    OPENROUTER_API_KEY appears in ${DIRS.join('/, ')}/ only under ` +
        `${EXEMPT_PATHS.join(' and ')} (RU-2)`,
    )
    process.exit(0)
  }
  console.error(`FAIL  OPENROUTER_API_KEY ${result.reason}:\n${result.detail}`)
  process.exit(result.reason === 'grep itself errored' ? 2 : 1)
}
