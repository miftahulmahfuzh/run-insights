import { jobStage } from '@/lib/nina/jobview'

/**
 * **R11's answer, in words an operator can act on.** Nothing here classifies anything: the
 * classification is `classifyImageFailure`'s (`lib/nina/imagefail.ts`), it already lands in
 * `nina_turns.error_code` through `failNinaImageJob`, and this module is a LOOKUP over whatever
 * that column says — `NINA_JOB_ERROR_LABEL`'s relationship to the same union, for the same stated
 * reason. A second classifier would be a second thing to keep in step, and the copy is always the
 * one that goes stale.
 *
 * ── WHY IT IS NOT `NINA_JOB_ERROR_LABEL` ─────────────────────────────────────────────────────
 * That map is the RUNNER's screen vocabulary and it is in Indonesian, in his register: *"Ditolak
 * filter konten provider"*. This is an operator's diagnosis on an English admin surface, and the
 * load-bearing thing it adds is the clause that map has no reason to carry — **"this is not a
 * refusal"** on the three kinds that are not one. `jobStage` IS reused, because that is a rule
 * about a column with two meanings and there must be exactly one of those.
 *
 * ── THE VERDICT MUST NOT LIE IN EITHER DIRECTION ─────────────────────────────────────────────
 * `'refused'` is reachable from `error_code === 'policy'` and from nothing else, and every other
 * terminal failure is `'inconclusive'` or `'unknown'`. A timeout is not a refusal: telling the
 * operator his prompt was banned when the network dropped would send him rewriting a prompt that
 * was fine, which is the single most expensive wrong answer this panel can give. In the other
 * direction, `'allowed'` requires `status === 'ok'` — a photograph that exists — and not merely
 * "did not fail".
 *
 * ── THE RETRY WINDOW IS ITS OWN VERDICT, BECAUSE IT IS ITS OWN FACT ──────────────────────────
 * `NINA_IMAGE_MAX_ATTEMPTS = 2`, so a `policy` failure on attempt 1 is REQUEUED by `closeFailed`
 * (`lib/nina/imagerun.ts`) rather than going terminal. `requeueNinaImageJob` puts `error_code` back
 * to `'queued'` and does not record which kind failed — only `console.warn` sees it. So the
 * observable state is `status='pending'`, `error_code='queued'`, `attempts >= 1`, and the only
 * honest reading of it is *"the first attempt failed and it is being retried; what failed is not
 * recorded until the retry budget is spent"*. Rendering that as `'running'` would hide a failure;
 * rendering it as `'refused'` would invent one. **And the converse bit, measured in production
 * on 2026-09-11:** `claimNinaImageJob` increments `attempts` when an attempt STARTS — in the same
 * statement that sets `error_code='running'` — so `attempts >= 1` alone is also the state of a
 * first attempt that has never failed at all. The phase, not the counter, is what separates the
 * two; the test named "reads a claim as running" pins it.
 */

export const NINA_IMAGE_TEST_VERDICTS = [
  'idle',
  'running',
  'retrying',
  'allowed',
  'refused',
  'inconclusive',
  'unknown',
] as const

export type NinaImageTestVerdict = (typeof NINA_IMAGE_TEST_VERDICTS)[number]

/**
 * What the panel needs off a `nina_turns` row, structurally — `JobLike`'s precedent and its stated
 * reason: the row's shape belongs to `lib/nina/imagejobs.ts`, which is `server-only`, and this
 * module is imported by a client component.
 *
 * `createdAtMs` is epoch milliseconds and not a `Date`, which is the same conversion
 * `toNinaJobListItems` makes and for the same reason: it is the one shape a client and a server
 * cannot disagree about.
 */
export interface NinaImageTestJobView {
  jobId: string
  status: string
  /** Phase while pending, failure reason when failed, `null` on success. Two meanings, one column. */
  errorCode: string | null
  attempts: number
  latencyMs: number | null
  costMicroUsd: number | null
  /** The exact prompt as sent, off `args.prompt`. `null` only for a row with no args. */
  prompt: string | null
  createdAtMs: number
}

export function imageTestVerdict(job: NinaImageTestJobView | null): NinaImageTestVerdict {
  if (job == null) return 'idle'

  const stage = jobStage({ status: job.status, errorCode: job.errorCode })

  if (stage === 'failed') {
    /* THE ONE PATH TO 'refused'. `POLICY_STATUSES` + the policy body regex decided this upstream. */
    if (job.errorCode === 'policy') return 'refused'
    if (job.errorCode === 'timeout' || job.errorCode === 'transport' || job.errorCode === 'stale') {
      return 'inconclusive'
    }
    /* A fifth failure kind added to `NINA_IMAGE_FAILURES` lands here rather than being silently
     * read as one of the four. Ugly and true, in that order — `jobErrorLabel`'s rule. */
    return 'unknown'
  }

  if (stage === 'done') {
    /* `jobStage` maps BOTH `'ok'` and `'repaired'` to `'done'`. No image writer produces
     * `'repaired'`, and calling it `'allowed'` would assert a photograph this panel has not seen
     * evidence of. */
    return job.status === 'ok' ? 'allowed' : 'unknown'
  }

  /* Still pending. The PHASE is the discriminator, and it has to be: `claimNinaImageJob` bumps
   * `attempts` to 1 in the SAME statement that sets error_code to 'running', so `attempts >= 1`
   * holds on every in-flight attempt — including the first. Reading the counter alone as "an
   * attempt has already been made and requeued" showed the requeue headline seconds after every
   * click (measured 2026-09-11, job jyMH4MGw-x8k: the message at t+5 s, latency still NULL, the
   * genuine requeue only landing at t+225 s). 'retrying' is reachable from the requeued 'queued'
   * phase — `requeueNinaImageJob`'s — and from nothing else that is still open. */
  return job.attempts >= 1 && job.errorCode === 'queued' ? 'retrying' : 'running'
}

/** True while the answer can still change — the only states a poll is honest for. */
export function imageTestVerdictIsOpen(verdict: NinaImageTestVerdict): boolean {
  return verdict === 'running' || verdict === 'retrying'
}

/** The headline. One sentence, and `'refused'` is the only one that says the provider said no. */
export const NINA_IMAGE_TEST_VERDICT_LINE: Record<NinaImageTestVerdict, string> = {
  idle: 'No test has been run yet.',
  running: 'Running. The provider has not answered yet.',
  retrying: 'The first attempt failed and the job was requeued.',
  allowed: 'Allowed. The provider drew this prompt.',
  refused: 'Refused. The provider declined this prompt on content-policy grounds.',
  inconclusive: 'No verdict. The generation failed before the provider answered.',
  unknown: 'Failed with a reason this panel does not recognise.',
}

/** The clause that stops each headline being misread. This is the half that protects the operator. */
export const NINA_IMAGE_TEST_VERDICT_WHY: Record<NinaImageTestVerdict, string> = {
  idle: 'One test spends one of today’s generations, and the daily cap counts failures too.',
  running:
    'A generation measured 78 s without a reference photo and up to 235 s with one — anchored ' +
    'ones have been running longer still, which is why the ceiling moved. Nothing has been ' +
    'refused and nothing has succeeded yet.',
  retrying:
    'Two attempts are allowed, so this is not a verdict yet. What went wrong on the first attempt ' +
    'is not written to the database until the retry budget is spent — the runner logged it, and ' +
    'the verdict here will name the kind if the retry fails too.',
  allowed:
    'The photograph is in Chat photos, and a caption bubble from Nina is in the conversation — ' +
    'a chat photo cannot exist without a message to hang on.',
  refused:
    'This is the only state that means the guardrails said no. The provider’s own words are ' +
    'not stored; they are in the server log for this job id, under "[nina] image job failed".',
  inconclusive:
    'This is NOT a refusal. The prompt may be perfectly acceptable — run the test again ' +
    'before changing a word of it.',
  unknown:
    'Not a refusal either. Treat it as inconclusive and check the server log for this job id.',
}

/**
 * The three non-refusal failures, spelled out. Keyed on the raw `error_code` string rather than on
 * a union, so a kind added to `NINA_IMAGE_FAILURES` cannot make this file fail to compile — the
 * caller falls back to the raw code, which is `jobErrorLabel`'s rule.
 */
export const NINA_IMAGE_TEST_REASON: Readonly<Record<string, string>> = {
  timeout: 'the call was aborted at the timeout — the provider was still thinking',
  transport: 'the request never completed — a dropped connection, a throttle, or a bad payload',
  stale: 'nothing ever picked the job up, and it was given up at the deadline',
  policy: 'the provider looked at the prompt and declined it',
}

export function imageTestReason(errorCode: string | null): string | null {
  if (errorCode === null || errorCode === '') return null
  return NINA_IMAGE_TEST_REASON[errorCode] ?? errorCode
}

/**
 * **The escalating poll schedule**, on `POLL_INTERVALS_MS` (`lib/extract/constants.ts`) and
 * `NINA_TURN_POLL_INTERVALS_MS` (`lib/nina/turnflight.ts`) — the two shipped precedents, both
 * against jobs of this order of magnitude.
 *
 * The bands are pinned to the measured latencies rather than picked: `initial` covers the first
 * 18 s (nothing can have finished), `mid` runs through ~78 s (RU-18's unanchored measurement), and
 * `late` carries the anchored tail and the retry. A flat interval would either waste round trips in
 * the first minute or answer late in the fourth.
 */
export const NINA_IMAGE_TEST_POLL_INTERVALS_MS = {
  initial: 3_000,
  mid: 5_000,
  late: 8_000,
} as const

export const NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS = 6
export const NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS = 18

/** `pollDelayFor`'s shape, exactly — a pure function of the attempt count, so it is testable. */
export function imageTestPollDelayFor(attempts: number): number {
  if (attempts >= NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS) {
    return NINA_IMAGE_TEST_POLL_INTERVALS_MS.late
  }
  if (attempts >= NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS) {
    return NINA_IMAGE_TEST_POLL_INTERVALS_MS.mid
  }
  return NINA_IMAGE_TEST_POLL_INTERVALS_MS.initial
}

/**
 * **The bound, and it is derived rather than chosen.** `NINA_IMAGE_MAX_ATTEMPTS = 2` and the
 * anchored call ceiling is 235 s, so two legitimate attempts can take 470 s before anything is
 * terminal. 480 s clears that by ten seconds — thin, on purpose: this bound's only job is to stop
 * the poll, and its expiry message says the job is STILL OPEN rather than failed.
 *
 * ── AND WHY IT IS NOT `NINA_IMAGE_STALE_MS` ──────────────────────────────────────────────────
 * The chat poll's give-up pairs with the server's honest wall clock (`NINA_BACKGROUND_BUDGET_MS`),
 * because the server's own claim read is what actually stops a dead turn — but a give-up must
 * still be SHORTER than the thing it watches is allowed to run, or it is no backstop at all. This
 * one must NOT be `NINA_IMAGE_STALE_MS`: the server's deadline for an image job is twenty minutes,
 * and a tab that read the database for twenty minutes to learn something already visible on
 * `/nina/jobs` would be a poll with no bound in practice. So when this clock runs out the panel
 * says the job is STILL OPEN — which is true — rather than "failed", which would not be.
 * `STALE_PENDING_MS` makes the same distinction for extractions.
 */
export const NINA_IMAGE_TEST_GIVE_UP_MS = 480_000
