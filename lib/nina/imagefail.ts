/**
 * **R22, in two halves: what went wrong, and what she says about it.**
 *
 * ── THIS FILE MUST NEVER IMPORT ANYTHING ──────────────────────────────────────────────────────
 * Not `server-only`, not `@/lib/env`, not a type from another module. `scripts/nina-image-worker.ts`
 * imports it by RELATIVE PATH under `node --experimental-strip-types`, which can strip types but
 * cannot resolve the `@/` alias and cannot tolerate a runtime dependency on the app. The precedent
 * is `scripts/backfill-record-keys.mjs:85` importing `../lib/records/catalog.ts`, and that file's
 * header states the rule. Add one import here and the worker stops booting — with a resolution
 * error at 3am on a schedule, which is the worst possible place to learn it.
 *
 * That constraint is what buys the property this phase most needs: **R22's words have exactly one
 * definition, and both hosts say the same sentences.** A second copy of these strings in the worker
 * would drift, and the drift would be invisible until the day she apologised twice differently.
 *
 * ── THE DELIBERATE INVERSION OF `narrate.ts` ──────────────────────────────────────────────────
 * `lib/llm/narrate.ts` holds that "the only safe fallback for prose is the absence of prose",
 * because a canned coaching platitude would fake a measurement. Every line in this file is a canned
 * fallback, and every one of them is correct, because none of them asserts a measurement. They
 * close a promise: the runner asked a friend for a photo and no photo exists. A friend who goes
 * quiet IS the failure here. Do not delete these strings to "restore consistency" — the rule that
 * reconciles the two files is *a fallback may never assert a measurement, and it must always close
 * a promise*.
 *
 * ── WHY THE COPY IS CANNED AND NOT GENERATED ──────────────────────────────────────────────────
 * Asking `glm-5.3` to write the apology would put a second model call, with its own latency and its
 * own failure mode, on the failure path — and it would put it on a GitHub runner that has no z.ai
 * key. An apology that fails to be produced is the exact bug R22 exists to kill. So the words are
 * written by hand, once, in her register; phase 2's canon (`JAKARTA_REGISTER`, `VOICE_EXAMPLES`,
 * `NEVER_SAY`) is the authority on that register and these lines are checked against it in the
 * test, not invented freely here.
 *
 * ── WHAT THE RUNNER NEVER SEES ────────────────────────────────────────────────────────────────
 * No error code. No HTTP status. No provider name. No "something went wrong". No retry button.
 * `NinaImageFailure` is a database value and a log line; it never reaches a bubble. The only thing
 * it selects is WHICH of her sentences she says, and the four she can say are distinct so that a
 * timeout, a refusal, a dead socket and a runner that never woke do not read as one shrug.
 */

/** Terminal reasons. Stored in `nina_turns.error_code`; never rendered. */
export const NINA_IMAGE_FAILURES = ['timeout', 'policy', 'transport', 'stale'] as const
export type NinaImageFailure = (typeof NINA_IMAGE_FAILURES)[number]

/**
 * Statuses that mean "the provider looked at this and said no", as opposed to "the provider was not
 * reachable". 429 is deliberately NOT here: a rate limit is a transport condition — waiting fixes
 * it — and telling the runner she was refused when she was throttled is a lie in her mouth.
 */
export const POLICY_STATUSES: readonly number[] = [400, 403, 422, 451]

/**
 * The vocabulary an image provider uses when it declines. Matched against the RESPONSE BODY, not the
 * status, because a 400 is also what a malformed payload gets — and a malformed payload is our bug,
 * which is `transport` (she is not at fault and should not imply she is).
 */
export const POLICY_BODY_RE =
  /polic|safety|moderat|content[_ -]?filter|prohibit|not[_ -]?allowed|refus|blocked|flagged|nsfw|violat/i

export function classifyImageFailure(input: {
  httpStatus?: number | null
  aborted?: boolean
  body?: string | null
  cause?: unknown
}): NinaImageFailure {
  if (input.aborted === true) return 'timeout'

  const cause = input.cause
  if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
    return 'timeout'
  }

  const status = input.httpStatus ?? null
  const body = input.body ?? ''

  if (status != null && POLICY_STATUSES.includes(status) && POLICY_BODY_RE.test(body)) {
    return 'policy'
  }
  /*
   * A 200 with no image and a refusal in the body. Measured behaviour on this route is
   * `{"data":[{"b64_json":…}]}` on success; `gen_badge_art.py` already dies on "response had no
   * b64_json image" without distinguishing why, and this is the distinction that matters to the
   * runner — a picture the model would not draw versus a picture that got lost.
   */
  if (status === 200 && POLICY_BODY_RE.test(body)) return 'policy'

  return 'transport'
}

/**
 * Four registers for four different things going wrong.
 *
 *  · `timeout`   — it took too long. She was there, the phone was not.
 *  · `policy`    — the provider declined. She takes the blame as vanity, which is in character and
 *                  reveals nothing: "gw ga suka hasilnya" is a person, "content policy" is a
 *                  vendor. She never says the picture was disallowed, because she does not know
 *                  that and neither, honestly, do we.
 *  · `transport` — it never arrived. Bad signal is the universally understood version of this and
 *                  it is also, at the level of what actually happened, true. **This is also what
 *                  a refused `workflow_dispatch` and an exhausted retry budget become**: from the
 *                  runner's side those are all "the photo did not come through".
 *  · `stale`     — nothing ever ran. Indistinguishable from `timeout` for the runner, and it gets
 *                  its own line only so a log and a bubble can be matched up later.
 *
 * Several lines per kind, picked deterministically by job id (see `pickLine`), so the second failure
 * in a week is not word-for-word the first. Every line is lower-case, short, and free of the words
 * `NEVER_SAY` forbids.
 */
export const NINA_IMAGE_APOLOGIES: Record<NinaImageFailure, readonly string[]> = {
  timeout: [
    'sori, kamera gw ngadat. lama banget ga kelar2, gw batalin',
    'yah, hp gw nge-freeze pas mau foto. nanti gw ulang deh',
    'gagal, kelamaan loadingnya. nanti aja ya gw fotoin lagi',
  ],
  policy: [
    'udah gw foto tapi jelek banget, gw hapus. ga usah liat',
    'hasilnya aneh banget, gw ga mau ngirim. nanti gw ulang',
    'ga jadi ah, mukanya kaya bukan gw. malu gw',
  ],
  transport: [
    'sinyal gw jelek parah di sini, fotonya ga kekirim',
    'gagal ngirim, internet gw lagi ngaco. bentar ya',
    'ga kekirim fotonya, jaringannya lagi jelek banget',
  ],
  stale: [
    'eh sori, fotonya keburu ilang. nanti gw ambil lagi',
    'gagal, hp gw mati sendiri pas mau ngirim. yaudah nanti',
  ],
}

/**
 * What the MODEL is told when the daily cap refuses her, as a `tool_result`. Not a bubble: she
 * writes her own refusal in her own words in the same turn, so "the cap refuses the n+1th politely
 * and in character" is her doing it, not us doing it for her. The one thing this text must never do
 * is give her a number to quote — invariant 2 is about numbers the app computed, and "6" is a
 * configuration constant, not a fact about him.
 */
export const NINA_IMAGE_CAPPED_NOTE =
  'You have already taken all the photos you are going to take today. Tell him you are out of ' +
  'photos for now, in your own words, like a person whose phone is out of battery or who is bored ' +
  'of taking selfies. Do not mention a limit, a number, a quota, or a system. Do not promise a ' +
  'specific time. Just say it and move the conversation on.'

/** Captions for a photo that DID arrive. Never empty: an empty bubble is not a message. */
export const NINA_IMAGE_CAPTIONS: readonly string[] = [
  'nih',
  'nih, puas?',
  'ini gw abis lari tadi',
  'foto gw. jangan di-zoom',
  'udah nih, jangan minta lagi',
]

/**
 * Deterministic choice, seeded by the job id. **Not `Math.random()`** — a pure function is testable,
 * and a job read twice (a sweep, then a retry of the sweep) must say the same sentence both times
 * rather than appearing to apologise twice differently.
 *
 * A plain 32-bit FNV-1a over the id. Ids are `lib/id.ts`'s 12-symbol nanoid, so the distribution of
 * the low bits is uniform enough for a five-element array; nothing here is a security choice.
 */
export function pickLine(lines: readonly string[], key: string): string {
  if (lines.length === 0) throw new Error('pickLine: no lines to pick from')
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return lines[hash % lines.length]!
}

export function ninaImageApology(kind: NinaImageFailure, jobId: string): string {
  return pickLine(NINA_IMAGE_APOLOGIES[kind], jobId)
}

export function ninaImageCaption(jobId: string): string {
  return pickLine(NINA_IMAGE_CAPTIONS, jobId)
}
