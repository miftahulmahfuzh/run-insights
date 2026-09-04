// F07's grep-able invariant, with a real exit code. There used to be two.
//
// ── RULE 1 IS REPEALED. IT IS NOT DISABLED, IT IS GONE, AND HERE IS WHY ───────────────────────
// This file used to open by asserting that BODY WEIGHT NEVER REACHES A MODEL (D15 / R-28): it
// grepped `lib/llm/` and `lib/insights/` for `weightKg` and failed the build on a hit, because a
// type only protects the path that goes through the type and a future `{ ...profile }` in a fact
// builder would have compiled, shipped, and put a weight in a coaching prompt.
//
// **NINA_CHATBOT_PLAN.md RU-1 repeals D15/R-28 app-wide** — F33 gives the runner a chatbot that
// is a nutritionist and a physiologist as well as a friend, and a physiologist who may not know
// what you weigh cannot answer the questions being asked of her. The user's reason, verbatim:
// "i am the only one that uses this app. so i dont care about any privacy whatsoever. this is my
// personal toy." The repeal is recorded in RECONCILIATION_v0.1.0.md R-28 and in
// ROADMAP_v0.1.0.md §2 (D15) and §6.
//
// So `lib/llm/facts.ts`'s `NarrativeProfile` now carries `weightKg` and `sex`, `lib/nina/`
// carries both into every turn, and there is no grep left to keep. Restoring the rule means
// restoring the ruling first: this comment is here so that nobody re-adds the check without
// finding out that a decision was taken, and nobody deletes the weight from a payload thinking
// they are fixing a leak.
//
// ── RULE 2 STANDS, AND NOW COVERS SEVEN ENTRY POINTS. THIS TABLE IS COMPLETE ──────────────────
// A MODEL CALL IS NEVER AWAITED FROM A PAGE RENDER (plan §7.2, and F33 plan invariant 4).
//
// All seven entries ship from the phase that owns this file, and NO OTHER PHASE EDITS IT. The
// last two arrived together in F35 phase 4 and one of the two symbols did not exist yet — phase 6
// creates it — and the entry is written for it anyway, because the alternative was two phases each
// appending to one guard: two merge conflicts, and a window in each of them where the new
// expensive call was unguarded precisely while it was new. An entry naming a symbol that does not
// exist costs nothing (nothing calls it, so nothing is checked); a call with no entry costs the
// whole point of the file.
//   · `getOrCreateInsight` — a cache miss is a 10-35 s call. The run detail page's numbers are
//     stored and already correct, so blocking the render on prose trades a complete screen for a
//     blank one. A `page.tsx` that awaits it looks fine in dev against a warm cache and hangs in
//     production the first time a runner opens a new run.
//   · `runNinaTurn` — Nina's turn entry point. Fifteen measured `glm-5.3` calls took 10.2-16.4 s,
//     and a turn may make tool round trips on top of that. `app/nina/page.tsx` server-renders
//     STORED messages and awaits no model; the turn is fired from a client event handler, the
//     same shape as `components/insights/InsightTrigger.tsx` firing `ensureRunInsight`.
//   · `distillNinaMemory` — a SECOND model call on top of the turn that triggered it, so a turn
//     that awaited it would double its own latency for a write the runner never sees. It runs
//     from `lib/nina/actions.ts` inside `after()`.
//   · `resolveNinaPromises` — the promise sweep asks `generateNinaAvatar` for a photograph, so it
//     is a model call behind two indexed reads. It runs from the nightly cron route and nowhere
//     else. This bullet was missing while the table entry was not, which is the kind of drift a
//     table with a prose header invites; the count above is now the length of the array below.
//   · `describeNinaImage` — a `glm-4.6v` describe pass, 5-15 s. `components/nina/Composer.tsx`
//     fires it on pick, from a client event handler, so the description is already in hand by
//     the time he hits send. A render that awaited it would block the chat on a thumbnail.
//   · `titleNinaSessionIfNeeded` — F35 R3's titler. A THIRD model call in the same invocation as
//     a turn and its distillation, so its own ceiling is 600 tokens and its timeout 12 s rather
//     than the turn's 2400/22 s — sized to fit beside `distillNinaMemory` under one 60 s
//     function, not to be fast. It runs from `lib/nina/actions.ts` inside `after()`. A render
//     that awaited it would make the runner wait for a label he cannot see yet.
//   · `rankNinaSearchHits` — F35 R6's semantic search pass over SQL-narrowed candidates. A search
//     BOX is the one surface where a 10-16 s await is most tempting and most wrong: the text
//     results are already correct and already on screen, so awaiting the model would replace a
//     complete list with a spinner. It runs from `lib/nina/searchActions.ts`, a Server Action
//     fired from the sidebar's field.
//
// Fix the code, never silence the check.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const failures = []

/** Same approximate comment-stripper as the F08 guard, for the same reason: prose may say the name. */
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

/* ── the non-blocking boundary ─────────────────────────────────────────────────────────────── */

/**
 * One entry per guarded symbol. A table rather than two copies of one loop: the next expensive
 * entry point is four lines here, and a second copy of a boundary grep is a second thing to keep
 * in step — which is the argument `check-openrouter-boundary.mjs` makes about itself.
 */
const GUARDED_CALLS = [
  {
    symbol: 'getOrCreateInsight',
    sanctioned: [
      join('lib', 'insights', 'actions.ts'),
      join('lib', 'llm', 'narrate.ts'),
      join('app', 'api', 'cron', 'rollup', 'route.ts'),
    ],
    advice:
      'On a cache miss that is a 10-35 s model call — see docs/plans/F07-insights.md §7.2. ' +
      'Call it from lib/insights/actions.ts (a Server Action, fired from a client effect) or ' +
      'from the cron route, never from a render path.',
  },
  {
    symbol: 'runNinaTurn',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that
      // forces the definition to be renamed. `lib/db/queries.ts` is greppable the same way.
      join('lib', 'nina', 'turn.ts'),
      join('lib', 'nina', 'actions.ts'),
      join('lib', 'nina', 'proactive.ts'),
      join('app', 'api', 'cron', 'nina', 'route.ts'),
    ],
    advice:
      'A Nina turn is a 10-16 s model call plus tool round trips (F33 plan invariant 4). Call ' +
      'it from lib/nina/actions.ts (a Server Action, fired from the composer), from ' +
      'lib/nina/proactive.ts inside after(), or from the cron route. app/nina/page.tsx renders ' +
      'stored messages and awaits no model.',
  },
  {
    symbol: 'distillNinaMemory',
    sanctioned: [join('lib', 'nina', 'distill.ts'), join('lib', 'nina', 'actions.ts')],
    advice:
      'Distillation is a second model call on top of the turn that triggered it (F33 phase 5). ' +
      'It runs from lib/nina/actions.ts inside after(), never on a render path and never ' +
      'awaited before the reply is returned to the composer.',
  },
  {
    symbol: 'resolveNinaPromises',
    sanctioned: [
      join('lib', 'nina', 'promises.ts'),
      join('app', 'api', 'cron', 'nina', 'route.ts'),
    ],
    advice:
      'The promise sweep asks generateNinaAvatar for a photograph (F33 phase 13, R19), so it is ' +
      'a model call behind two indexed reads. It runs from the cron route and nowhere else — ' +
      'never from app/nina/about/page.tsx, which renders the album and evaluates no promise.',
  },
  {
    symbol: 'describeNinaImage',
    sanctioned: [join('lib', 'nina', 'actions.ts'), join('components', 'nina', 'Composer.tsx')],
    advice:
      'A glm-4.6v describe pass is a 5-15 s vision call (F33 phase 6). The composer fires it ' +
      'from a client event handler on pick, so the description is already in hand when he hits ' +
      'send; no page render may await it.',
  },
  {
    symbol: 'titleNinaSessionIfNeeded',
    sanctioned: [
      // Its own module, because a guard that fails on the definition site is a guard that forces
      // the definition to be renamed — the reason `runNinaTurn` sanctions `lib/nina/turn.ts`.
      join('lib', 'nina', 'autotitle.ts'),
      join('lib', 'nina', 'actions.ts'),
    ],
    advice:
      'The session titler is a third model call in an invocation that already made two (F35 R3). ' +
      "It runs from lib/nina/actions.ts inside after(), on sendNinaMessage's success path only, " +
      'and never on a render path. The pure rules it needs are in lib/nina/title.ts, which is ' +
      'client-safe and imports no model client — import from there, not from here.',
  },
  {
    symbol: 'rankNinaSearchHits',
    sanctioned: [
      // Phase 6 split lib/nina/semantic.ts out of lib/nina/search.ts precisely so this list can
      // sanction the definition site while the pure ranking rules stay importable everywhere.
      join('lib', 'nina', 'semantic.ts'),
      join('lib', 'nina', 'searchActions.ts'),
    ],
    advice:
      'Semantic search is a glm-5.3 pass over SQL-narrowed candidates (F35 R6). Call it from ' +
      'lib/nina/searchActions.ts, a Server Action fired from the sidebar field. The text results ' +
      'are already correct without it, so a render that awaited it would trade a complete list ' +
      'for a spinner — fall back to the text ranking instead.',
  },
]

for (const path of [...walk('app'), ...walk('lib'), ...walk('components')]) {
  if (path.endsWith('.test.ts') || path.endsWith('.test.tsx')) continue
  const source = stripComments(readFileSync(path, 'utf8'))
  for (const guard of GUARDED_CALLS) {
    if (guard.sanctioned.includes(path)) continue
    if (new RegExp(`\\b${guard.symbol}\\s*\\(`).test(source)) {
      failures.push(`${path} calls ${guard.symbol}. ${guard.advice}`)
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────────────────────── */

if (failures.length > 0) {
  console.error('F07/F33 payload boundary guard FAILED:\n')
  for (const failure of failures) console.error(`  ✗ ${failure}`)
  console.error('')
  process.exit(1)
}

console.log(
  `F07/F33 payload boundary guard passed: all ${GUARDED_CALLS.length} guarded symbols ` +
    `(${GUARDED_CALLS.map((g) => g.symbol).join(', ')}) are confined to their sanctioned ` +
    'non-blocking callers. ' +
    "(The D15/R-28 body-weight rule is repealed — see this file's header, RU-1.)",
)
