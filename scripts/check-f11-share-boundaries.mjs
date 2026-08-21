// F11's grep-able invariants, each with a real exit code. docs/plans/F11-sharing.md §3.4/§3.7/§10.
//
// `/s/[token]` is the only route in this application that answers to somebody with no account. Every
// guarantee it makes is a NEGATIVE — a module it must not reach, a field it must not carry, a value
// it must not compute — and negatives are invisible in review and invisible at runtime. A page that
// "just quickly" resolves HRmax for a nicer percentage renders perfectly and breaks a binding
// constraint. tests/share.bundle.test.ts catches most of it from the import graph; these four are
// the ones a test either cannot see or would have to import the whole Next runtime to see.
//
// 1. THE PUBLIC ROUTE HAS NO SECOND PAGE.
//    Every file under app/(public)/s/ is enumerated here. A new route added under that prefix — a photo
//    proxy, an embed endpoint, an /s/[token]/raw — is a new unauthenticated surface, and D7 also
//    restricts Route Handlers to a fixed list that contains nothing under /s. Adding one is a real
//    decision; this makes it a visible one.
//
// 2. NO ANALYTICS, EVER, ON /s.
//    The pathname IS the bearer token. `/s/V1StGXR8mN4qP2wZ` handed to any analytics backend —
//    including a first-party one that is not adversarial in the slightest — copies a
//    health-data-protecting secret into a second system's logs, dashboards and retention policy
//    that nobody reasoned about. This is a standing constraint on F01's eventual analytics choice,
//    not a one-time setup step, so it is asserted rather than remembered.
//
// 3. THE OWNER-SIDE SHARE COMPONENTS NEVER LEAVE THE AUTHENTICATED TREE.
//    Their copy is second person ("your screenshots", "stop sharing"), and two of the three import a
//    Server Action. A page whose reader owns nothing must not reach them.
//
// 4. NOBODY RE-DERIVES A DENOMINATOR.
//    F02 INVARIANT B, at source level: no file under app/(public)/s/ may name resolveHrMax, and none may
//    hand-roll Tanaka (`208 - 0.7 * age`) to fill in for it. The honest degrade is to omit the
//    figure — never to guess it.
//
// 5. NO SUSPENSE BOUNDARY ANYWHERE ABOVE /s/[token].
//    The one that took an afternoon to find, so it is asserted rather than remembered. `loading.tsx`
//    wraps its own segment AND every segment below it; once a Suspense fallback can render, the
//    response body starts streaming, the headers are on the wire, and the HTTP status can no longer
//    change (Next docs, loading.md -> "Status Codes"). A `loading.tsx` on this route's ancestry
//    therefore turns every notFound() into a 200 with a 404 body.
//
//    Measured: /s/<unknown-token> answered 200 while F08's loading.tsx sat at app/loading.tsx, and
//    404 once it moved to app/(app)/loading.tsx, with the page code unchanged. "The link 404s the
//    moment I revoke it" is a promise this feature makes in its own confirm dialog, so the absence
//    of that file is load-bearing and gets a guard.
//
// Fix the code, never silence the check.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

/**
 * Comments are prose, and prose is allowed to say "resolveHrMax" or "analytics" — this guard's job
 * is to police CODE. Same approximation and same justification as check-f08-boundaries.mjs: it can
 * produce a false PASS on a line that no longer looks like code, which is acceptable, whereas a
 * guard that fires on its own explanatory comment gets silenced and then protects nothing.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(path) && !path.endsWith('.test.ts')) out.push(path)
  }
  return out
}

const shareRoute = walk('app/(public)/s').map((p) => p.split('\\').join('/'))

/* ── 1. the public route's file list is closed ─────────────────────────────────────────────── */

const EXPECTED = new Set([
  'app/(public)/s/[token]/page.tsx',
  'app/(public)/s/[token]/layout.tsx',
  'app/(public)/s/[token]/not-found.tsx',
  'app/(public)/s/[token]/copy.ts',
])

for (const path of shareRoute) {
  if (!EXPECTED.has(path)) {
    failures.push(
      `${path} is a NEW file under app/(public)/s/. The public route is meant to be exactly four files ` +
        '(page, layout, not-found, copy). A route handler here would also sit outside D7 fixed ' +
        'list. If this is deliberate, reason about it in docs/plans/F11-sharing.md and add it to ' +
        'EXPECTED in this script.',
    )
  }
}

for (const path of EXPECTED) {
  if (!shareRoute.includes(path)) failures.push(`${path} is missing — F11 route is incomplete.`)
}

// A loading.tsx would make Next stream a 200 before notFound() can run: the status line is already
// on the wire, so a revoked link would answer 200 with a 404 body. Also asserted in the test suite;
// repeated here because it is a FILE ABSENCE, and an absence is the easiest thing to undo by accident.
if (shareRoute.some((p) => p.endsWith('loading.tsx'))) {
  failures.push(
    'app/(public)/s/[token]/loading.tsx exists. A Suspense boundary over the token lookup streams a 200 ' +
      'before notFound() can change the status — a revoked link would answer 200 with a 404 body.',
  )
}

/* ── 5. nothing above /s may stream ────────────────────────────────────────────────────────── */

// Every ancestor segment of app/(public)/s/[token]. A loading.tsx in ANY of them locks the status.
const ANCESTORS = ['app', 'app/(public)', 'app/(public)/s', 'app/(public)/s/[token]']

for (const segment of ANCESTORS) {
  for (const boundary of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
    if (existsSync(join(segment, boundary))) {
      failures.push(
        `${segment}/${boundary} exists. loading.tsx wraps its segment AND everything below it, so ` +
          'a Suspense fallback can render, the body starts streaming, and notFound() can no longer ' +
          'set a 404 — /s/[token] would answer 200 with a 404 body. Route-scope the boundary ' +
          '(app/(app)/loading.tsx) instead of putting it on this path.',
      )
    }
  }
}

/* ── 2 & 4. what the public route may not name ─────────────────────────────────────────────── */

const FORBIDDEN_IN_ROUTE = [
  [/\bresolveHrMax\b/, 'names resolveHrMax. F02 INVARIANT B: /s must never resolve HRmax live.'],
  [
    /208\s*-\s*0\.7/,
    'hand-rolls the Tanaka formula. When the frozen denominator is absent the figure is OMITTED, ' +
      'never estimated (F02 §4.6 degrade-honestly rule).',
  ],
  [
    /@vercel\/analytics|@vercel\/speed-insights|gtag|googletagmanager|posthog|plausible|mixpanel/i,
    'pulls in an analytics package. The pathname IS the bearer token — sending it to any backend ' +
      'copies a health-data secret into a second system logs.',
  ],
  [
    /from ['"]@\/lib\/metrics['"]/,
    'imports the lib/metrics barrel, which re-exports resolveHrMax. Import the specific pure ' +
      'module, or better, use a value already stored on the row.',
  ],
  [
    /from ['"]@\/lib\/share\/copy['"]/,
    'imports the OWNER-side copy module. Public strings live in app/(public)/s/[token]/copy.ts; owner copy ' +
      'is second person and does not belong in front of a stranger.',
  ],
  [
    /requireUserId|getUserId|from ['"]@\/auth['"]/,
    'reads the session. /s/[token] has no account behind it and must never learn a userId.',
  ],
]

for (const path of shareRoute) {
  const source = stripComments(readFileSync(path, 'utf8'))
  for (const [pattern, message] of FORBIDDEN_IN_ROUTE) {
    if (pattern.test(source)) failures.push(`${path} ${message}`)
  }
}

/* ── 3. the owner-side components stay in the authenticated tree ───────────────────────────── */

const OWNER_COMPONENTS = ['ShareButton', 'ShareLinkPanel', 'PhotoInclusionList']

for (const path of shareRoute) {
  const source = stripComments(readFileSync(path, 'utf8'))
  for (const component of OWNER_COMPONENTS) {
    if (source.includes(`components/share/${component}`)) {
      failures.push(
        `${path} imports ${component}. It is an owner control on /r/[id]; the shared page is ` +
          'read-only and has no mutation surface at all.',
      )
    }
  }
}

/* ── the report ────────────────────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error('\nF11 share-boundary guard FAILED:\n')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  `OK    app/(public)/s/ is ${shareRoute.length} files, none of them a second public surface`,
)
console.log('OK    /s/[token] resolves no HRmax, reads no session, ships no analytics')
console.log('OK    the owner-side share controls stay out of the public route')
console.log('OK    no loading.tsx above /s/[token] — a revoked link can still answer a real 404')
