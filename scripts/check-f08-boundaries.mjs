// F08's three grep-able invariants, each with a real exit code. Plan §10 task 15, §11, §12.
//
// 1. RECHARTS IS IMPORTED ONLY FROM components/charts/*Inner.tsx.
//    Every chart is a thin `'use client'` outer that lazily imports an inner via `dynamic(...,
//    { ssr: false })`. A second importer anywhere else silently promotes Recharts (~100 KB) into a
//    shared chunk, and then `/` and `/upload` — screens with no chart on them at all — pay for it.
//    This is invisible in review and invisible at runtime; only the bundle output shows it.
//
// 2. EXACTLY ONE FILE DECLARES A SECOND Y AXIS.
//    §12's dual-axis waiver is granted to the pace+HR chart alone, and R-25 upholds it on the
//    condition that it stays contained. `yAxisId` outside PaceHrChartInner.tsx means a second chart
//    has quietly taken the same exception without arguing for it.
//
// 3. NO CHART OR SCREEN HAND-ROLLS A UNIT.
//    R-23: lib/format.ts decides every rendered measurement, once. A ` km` template literal or a
//    stray Intl.NumberFormat in a component is how `10,67 km` comes back after F04 spent a whole
//    plan getting the comma right.
//
// Fix the code, never silence the check.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

/**
 * Comments are prose, and prose is allowed to mention `yAxisId` or say "144 spm" — this guard's job
 * is to police CODE. Stripping block and line comments before matching is approximate (a string
 * literal containing `//` loses its tail), which is acceptable for a grep whose only failure mode is
 * a false PASS on a line that no longer looks like code. It is not acceptable the other way: a
 * guard that fires on its own explanatory comment gets silenced, and then it protects nothing.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(path) && !path.endsWith('.test.ts')) out.push(path)
  }
  return out
}

const sources = ['app', 'lib', 'components'].flatMap((dir) => walk(dir))

/* ── 1. the Recharts boundary ─────────────────────────────────────────────────────────────── */

const RECHARTS_ALLOWED = /^components[/\\]charts[/\\]\w+Inner\.tsx$/

for (const path of sources) {
  const source = stripComments(readFileSync(path, 'utf8'))
  if (!/from ['"]recharts['"]/.test(source)) continue
  if (!RECHARTS_ALLOWED.test(path)) {
    failures.push(
      `${path} imports recharts. Only components/charts/*Inner.tsx may — see ` +
        'docs/plans/F08-views-charts.md §7. Put the drawing in an Inner and lazy-import it.',
    )
  }
}

/* ── 2. the dual-axis waiver stays contained ──────────────────────────────────────────────── */

const DUAL_AXIS_FILE = join('components', 'charts', 'PaceHrChartInner.tsx')

for (const path of sources) {
  if (path === DUAL_AXIS_FILE) continue
  if (/yAxisId/.test(stripComments(readFileSync(path, 'utf8')))) {
    failures.push(
      `${path} declares a yAxisId. The dual-axis waiver (§12, upheld by R-25) covers ` +
        `${DUAL_AXIS_FILE} and nothing else. A second axis needs its own justification of that depth.`,
    )
  }
}

if (!/yAxisId/.test(stripComments(readFileSync(DUAL_AXIS_FILE, 'utf8')))) {
  // The check must fail loudly if its own anchor moves, rather than passing vacuously forever.
  failures.push(
    `${DUAL_AXIS_FILE} no longer declares a yAxisId. If the signature chart moved, move this ` +
      'guard with it; if the waiver was surrendered, delete the guard deliberately.',
  )
}

/* ── 3. lib/format.ts is the only place a unit is spelled ─────────────────────────────────── */

// The right-hand side of a rendered measurement. Deliberately narrow: it looks for a NUMBER or an
// interpolation immediately followed by a unit, which is what hand-formatting looks like, and not
// for the words themselves (a caption may say "kilometres" all it likes).
const HAND_ROLLED = [
  { re: /\$\{[^}]*\}\s*(?:km|kcal|bpm|spm)\b/, what: 'an interpolated value with a unit suffix' },
  {
    re: /\btoFixed\(\s*\d\s*\)\s*\}?\s*(?:km|kcal|bpm|spm)?\b\s*(?:km|kcal|bpm|spm)/,
    what: 'a toFixed() with a unit suffix',
  },
  { re: /Intl\.NumberFormat/, what: 'an Intl.NumberFormat' },
]

// lib/format.ts IS the implementation, so it is the one file allowed to spell a unit. The set is a
// literal rather than a pattern so that a second exception has to be argued for in a diff — the
// answer to "my component needs a unit" is a function in lib/format.ts, every time.
const FORMAT_ALLOWED = new Set([join('lib', 'format.ts')])

for (const path of sources) {
  if (FORMAT_ALLOWED.has(path)) continue
  const source = stripComments(readFileSync(path, 'utf8'))
  for (const { re, what } of HAND_ROLLED) {
    const hit = re.exec(source)
    if (hit) {
      failures.push(
        `${path} contains ${what} ("${hit[0].trim()}"). Every rendered measurement comes from ` +
          'lib/format.ts (R-23) — add a function there instead.',
      )
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error('F08 boundary guard FAILED:\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  `F08 boundary guard passed: recharts confined to components/charts/*Inner.tsx, one yAxisId, ` +
    `no hand-rolled units across ${sources.length} files.`,
)
