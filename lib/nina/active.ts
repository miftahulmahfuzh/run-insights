import { isValidId } from '@/lib/id'
import { NINA_SESSION_TITLE_MAX_CHARS, mostRecentNinaSession } from '@/lib/nina/sessions'
import type { NinaSessionOrderable } from '@/lib/nina/sessions'

/**
 * **The active session: which chat `/nina` is looking at, and what the runner may call it.**
 *
 * ── WHY THE SESSION IS IN THE URL (ASSUMPTION A4) ─────────────────────────────────────────────
 * `lib/panel/param.ts` states the argument for `/me`'s open panel and every word of it applies
 * here: React state is invisible to the phone's back gesture. With the active session in
 * `useState`, a back-swipe out of a chat would leave `/nina` altogether, and tapping through to a
 * run and coming back would land on whichever session the server happened to pick. A query
 * parameter makes the open conversation an ordinary history entry.
 *
 * ── ONE LETTER, `s`, AND WHY THAT IS NOT TOO TERSE ────────────────────────────────────────────
 * This parameter is typed by nobody and read by one page. It sits beside `attach`, `photo` and
 * `at` on the same URL, and it is the one of the four a runner might actually share, so short is a
 * small kindness. The grammar is a bare id — no `kind:` prefix — because unlike `?photo=` there is
 * exactly one table it can name (`parseNinaPhotoParam`'s header explains when a prefix earns its
 * keep, and this is the other case).
 *
 * ── WHY THIS FILE IS PURE, AND SEPARATE FROM PHASE 1's `sessions.ts` ──────────────────────────
 * Two consumers make purity mandatory. `lib/nina/sessionActions.ts` is a `'use server'` module,
 * which may export only async functions, so a constant a form needs for `maxLength` cannot live
 * there (`lib/nina/albumActions.ts` hit the same wall and resolved it the same way). And
 * `vitest.config.ts` runs `environment: 'node'` with no jsdom, so a rule that lives in a component
 * or in a module that opens a database connection cannot be tested at all.
 *
 * `lib/nina/sessions.ts` is the neighbouring file and the plural is the difference: that one holds
 * the ORDER — which session is newest, and how the list is displayed — while this one answers
 * "which one is he in" for a single request and "what may he call it". This module is the thinner
 * of the two and it delegates rather than re-deriving: see `mostRecentSessionId`.
 */

/** The single query parameter that names the open session. `/nina?s=<nanoid(12)>`. */
export const SESSION_PARAM = 's'

/**
 * How long a session title may be, in characters, after sanitising — **published again under the
 * same name, never declared here.**
 *
 * Sixty is right, but `lib/nina/sessions.ts` landed the same cap first and holds the set's one
 * declaration, and four spellings of one constant across four phases is the drift reconciliation
 * exists to remove. So this module imports it, clamps with it in `sanitizeNinaSessionTitle`, and
 * re-exports it under the SAME name — no alias, no second spelling, no second value. A re-export
 * is not a second declaration.
 *
 * The re-export is deliberate rather than incidental, and load-bearing twice over:
 * `tests/nina.active.test.ts` reads the cap from `@/lib/nina/active`, and phase 4 replaces the
 * sanitiser's body below with a re-export from `./title`, after which this line is the only
 * remaining consumer of the import and the only reason the file still lints.
 *
 * The reason the number matters is unchanged: R3's automatic titles are 3-4 words, so this is not
 * a constraint on the titler — it is the ceiling on a MANUAL rename, and its job is to stop a
 * pasted paragraph becoming a row in the sidebar. The input's `maxLength` (phase 5's `SessionRow`)
 * and the server's clamp are one value, which is the only arrangement in which they cannot
 * disagree — exactly the reason `NINA_ATTACH_MAX_CHARS` lives in `lib/nina/album.ts` rather than in
 * the action that clamps.
 */
export { NINA_SESSION_TITLE_MAX_CHARS }

/**
 * `unknown -> id | null`.
 *
 * **Takes `unknown` on purpose**, on `parseNinaPhotoParam`'s precedent and for its stated reason:
 * the caller is `app/nina/page.tsx`, where a `searchParams` value is
 * `string | string[] | undefined`, and a repeated `?s=a&s=b` is a malformed link rather than an
 * interesting case. A shape check that refuses to be handed the wrong shape is a shape check with
 * a second bug in it.
 *
 * A miss is `null`, and `null` is NOT an error — see `chooseActiveSession`. This function proves
 * only that the string could be one of our ids; whether it is one of HIS is a question only the
 * database can answer.
 */
export function parseNinaSessionParam(raw: unknown): string | null {
  if (!isValidId(raw)) return null
  return raw
}

/**
 * The facts "which session is newest" depends on, and nothing else.
 *
 * **This is phase 1's `NinaSessionOrderable`, aliased rather than redeclared.** The two interfaces
 * were written independently and came out identical field for field, which is the signal to keep
 * one of them: a rival declaration here would be a second place for the shape to drift, and the
 * ordering functions this module delegates to are typed against phase 1's name anyway. The alias
 * exists so `@/lib/nina/active`'s published surface still carries the shape its own callers read,
 * without a second `interface` keyword in the tree.
 *
 * Phase 1's `NinaSessionListRow` is a structural superset of this, so `app/nina/page.tsx` passes
 * its rows straight in with no mapping step — the same arrangement `PatternRun` has with
 * `getReviewedRunWindow`'s row shape (`lib/nina/gateway.ts` says so). `pinnedAt` is present and
 * read by nothing here, which is the decision rather than an oversight: pinning (R4) is a
 * preference about where a session sits in the LIST, not a claim about which conversation he is
 * in, so defaulting to a pinned session would drop him into a stale topic every time he opened the
 * chat.
 */
export type SessionActivity = NinaSessionOrderable

/**
 * The most recently active session's id, or `null` when he has none.
 *
 * **Delegates to phase 1's `mostRecentNinaSession`, and does not re-derive the rule.** That
 * function is the set's one implementation of "most recent by activity, pins ignored", it has its
 * own suite in `tests/nina.sessions.test.ts`, and it already coalesces `lastUserMessageAt` onto
 * `createdAt` — the fallback that stops a session created a second ago by "new chat" from ranking
 * as the oldest thing he owns. This wrapper exists only to answer in the currency the page and
 * `sessionResolve.ts` want, which is an id.
 *
 * ── WHY NOT `listNinaSessions(userId)[0]` ─────────────────────────────────────────────────────
 * Because that list is pinned-first (R4). Its first element is whichever session he pinned, which
 * may be his oldest. This is the answer to a different question and has to be computed
 * separately; conflating the two is how a proactive message ends up in a pinned-and-abandoned
 * topic.
 */
export function mostRecentSessionId(sessions: readonly SessionActivity[]): string | null {
  return mostRecentNinaSession(sessions)?.id ?? null
}

/**
 * **`/nina`'s one routing decision.** Which session does this request render?
 *
 * The requested id wins only if it is in the list — and the list came back from an owner-scoped
 * read, so membership is the ownership proof (invariant 3's rule: an id from a URL is a claim, a
 * row that came back from an owner-scoped read is a fact).
 *
 * ── A MISS IS A SILENT FALLBACK, NOT AN ERROR ─────────────────────────────────────────────────
 * A forged id, another runner's id and an id he deleted on his other phone are the same outcome:
 * his newest chat, painted normally. That is `app/nina/page.tsx`'s existing answer for `?attach=`
 * and `?photo=` — *"a bad LINK is something anyone can type"* — and it also means nothing here
 * leaks which session ids exist. The hard refusal lives one layer down in `sendNinaMessage`, where
 * the id is about to become a NOT NULL foreign key on a persisted row.
 *
 * `null` — he has no sessions at all — is a real answer and not a failure. It is reachable two
 * ways: a runner who has never messaged, and R11's runner who removed his last session. The page
 * renders its empty state, and a send from that screen resolves-or-creates on the server, because
 * a render must not write.
 */
export function chooseActiveSession(
  sessions: readonly SessionActivity[],
  requestedId: string | null,
): string | null {
  if (requestedId !== null && sessions.some((session) => session.id === requestedId)) {
    return requestedId
  }
  return mostRecentSessionId(sessions)
}

/**
 * How long a session title may be, and the rule for what he is allowed to call one.
 *
 * **The rule lives in `lib/nina/title.ts` (phase 4) and is re-exported here so that this module's
 * published surface is unchanged.** `lib/nina/sessionActions.ts` and `tests/nina.active.test.ts`
 * keep importing `sanitizeNinaSessionTitle` from `@/lib/nina/active` and get the same name, the
 * same signature and one implementation. The CAP is imported from `@/lib/nina/sessions` (phase 1),
 * above — one declaration for the whole set.
 *
 * The move exists because `title.ts` holds BOTH title rules — his manual rename and the model's
 * 3-4 word answer — and they share a text cleaner and the same character cap. `title.ts` is pure
 * (a type from `@anthropic-ai/sdk` and one constant from `sessions.ts`); the model call lives in
 * `lib/nina/autotitle.ts`, so nothing `server-only` is reachable from this file and it stays
 * importable from a client component — which matters, because phase 6's `searchHitHref` imports
 * `SESSION_PARAM` from here into a `'use client'` module.
 *
 * Phase 4 also fixed a real hole in the rule while it was there: the old class `[\x00-\x1F\x7F]`
 * did not cover `U+200B` and friends, so a title made only of zero-width characters passed the
 * empty check and rendered as a blank sidebar row.
 */
export { sanitizeNinaSessionTitle } from './title'
