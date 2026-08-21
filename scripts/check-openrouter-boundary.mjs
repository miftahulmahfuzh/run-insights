// OPENROUTER_API_KEY is build-time-only, read by tools/gen_badge_art.py (F10) and
// tools/extend_badge_art.py (F15) and by NOTHING at runtime. If this script ever fails, something in app/, lib/, or components/
// started reading a key meant only for an offline image-generation skill — fix the import,
// don't silence this check. See ROADMAP_v0.1.0.md section 4.1 and D12.
//
// Exported as well as run: `scripts/check-badge-art.mjs` asserts the same property as its
// first section, because `npm run badges:check` is meant to be the one command that says
// whether F10 is whole, and "the key never leaked" is the most important thing it can say.
// One implementation, two callers — a second copy of a security grep is a second thing to
// keep in step, and the copy is always the one that goes stale.
import { execSync } from 'node:child_process'

const DIRS = ['app', 'lib', 'components']

/** @returns {{ok: true} | {ok: false, reason: string, detail: string}} */
export function checkOpenRouterBoundary() {
  try {
    const leaked = execSync(`grep -rnE 'OPENROUTER_API_KEY' ${DIRS.join(' ')}`, {
      encoding: 'utf8',
    })
    return { ok: false, reason: 'found outside its build-time boundary', detail: leaked }
  } catch (err) {
    // grep exits 1 when it finds nothing — that's the success path.
    if (err.status === 1) return { ok: true }
    return { ok: false, reason: 'grep itself errored', detail: err.message }
  }
}

export const BOUNDARY_DIRS = DIRS

// Run directly (`npm run ci:openrouter-guard`) rather than imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = checkOpenRouterBoundary()
  if (result.ok) {
    console.log(`OK    OPENROUTER_API_KEY does not appear in ${DIRS.join('/, ')}/`)
    process.exit(0)
  }
  console.error(`FAIL  OPENROUTER_API_KEY ${result.reason}:\n${result.detail}`)
  process.exit(result.reason === 'grep itself errored' ? 2 : 1)
}
