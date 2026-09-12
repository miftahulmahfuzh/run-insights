/**
 * **The public address of Nina's chat Server Actions** — the same specifier `lib/nina/actions.ts`
 * answered before the 2026-09-12 split. Every client import (`ChatScreen`, `Composer`) and every
 * test suite that mocks or `typeof import`s `@/lib/nina/actions` resolves through this barrel, so
 * the per-concern modules beneath it (`./send`, `./resend`, `./poll`, `./duplicateCheck`,
 * `./describe`, and the directive-free `./startTurn` seam) are invisible to callers: same names,
 * same signatures, same shapes.
 *
 * ── THE BARREL ADDS RE-EXPORTS AND NOTHING ELSE ───────────────────────────────────────────────
 * Invariant 4 is a counting argument, and it is checked here: the runtime exports of a
 * `'use server'` module are public POST endpoints, so every name this file re-exports must have
 * been exported by the pre-split file, and no name may be ADDED. The action modules keep their
 * helpers module-private for the same reason — `resolveAttachment`, `perceptualTwinsForClaims`,
 * `REFUSED` and `resendRefused` are not endpoints and never become them — and
 * `startNinaBackgroundTurn` lives outside any `'use server'` module because a plain re-export of a
 * non-async function from one would not even compile. The `'use server'` directives live in the
 * implementation modules; re-exporting an action through this plain barrel keeps it a server
 * reference in the client graph (the reference is created by the directive module's transform, and
 * the barrel only hands it on).
 *
 * `_verify` gates: `npm run typecheck` proves the re-exported name set is exactly the historic
 * one (five suites do `typeof import('@/lib/nina/actions')` against it), `npm run knip` proves no
 * export went missing or stale, and `next build` compiles both graphs so a broken action
 * reference fails there and not in production.
 */

/**
 * `ChatScreen` (a client component) imports this type from here, and a client bundle cannot touch a
 * `'server-only'` module — so the type keeps its public address after the move. Type-only: erased
 * at compile time, the same reason `NinaResendRefusal` may be exported from this file. Invariant 4
 * is untouched: no new runtime export, no new POST endpoint.
 */
export type { SentBubble } from '../turnrun'

export type { SendNinaMessageResult, NinaAttachExisting } from './send'
export { sendNinaMessage } from './send'
export { findNinaDuplicateChatImage } from './duplicateCheck'
export type { NinaResendRefusal, ResendNinaMessageResult } from './resend'
export { resendNinaMessage } from './resend'
export type { NinaReplyPoll } from './poll'
export { pollNinaReply } from './poll'
export type {
  NinaDescribeFailureReason,
  NinaDescribeImageInput,
  NinaDescribeImageResult,
} from './describe'
export { describeNinaImage } from './describe'
