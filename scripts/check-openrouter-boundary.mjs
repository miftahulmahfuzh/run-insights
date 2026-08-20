// OPENROUTER_API_KEY is build-time-only, read by tools/gen_badge_art.py (F10) and by
// NOTHING at runtime. If this script ever fails, something in app/, lib/, or components/
// started reading a key meant only for an offline image-generation skill — fix the import,
// don't silence this check. See ROADMAP_v0.1.0.md section 4.1 and D12.
import { execSync } from 'node:child_process'

const DIRS = ['app', 'lib', 'components']
let leaked = ''
try {
  leaked = execSync(`grep -rnE 'OPENROUTER_API_KEY' ${DIRS.join(' ')}`, {
    encoding: 'utf8',
  })
} catch (err) {
  // grep exits 1 when it finds nothing — that's the success path.
  if (err.status === 1) {
    console.log(`OK    OPENROUTER_API_KEY does not appear in ${DIRS.join('/, ')}/`)
    process.exit(0)
  }
  console.error(`FAIL  grep itself errored: ${err.message}`)
  process.exit(2)
}
console.error('FAIL  OPENROUTER_API_KEY found outside its build-time boundary:\n' + leaked)
process.exit(1)
