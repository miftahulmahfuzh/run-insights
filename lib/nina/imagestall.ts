import { pickLine } from './imagefail'

/**
 * **The words and the numbers for the wait between "gw foto dulu" and the photograph.**
 *
 * Task #76. The runner's complaint, in his own transcript: she said `nih sebentar, gw foto kondisi
 * sekarang deh` and then nothing happened for eighty seconds. Generation is 57–60 s measured on
 * production and up to 235 s against `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, and for all of it the
 * conversation was dead. What he asked for is the thing a person does: keep talking.
 *
 * ── WHY THIS IS ITS OWN MODULE AND NOT A BLOCK IN `imagetools.ts` ─────────────────────────────
 * Two consumers that must not import each other. `lib/nina/imagetools.ts` reads the STEERS at
 * dispatch (inside a tool handler, inside the chat turn's model call); `lib/nina/photostall.ts`
 * reads the INSTRUCTION and all four constants afterwards, from the background turn. A shared
 * block in either one would make the other import a tool handler or a turn runner to get at a
 * string.
 *
 * ── IT IMPORTS EXACTLY ONE THING, AND THAT THING IMPORTS NOTHING ──────────────────────────────
 * `pickLine` from `./imagefail`, whose own header forbids it any import at all so
 * `scripts/nina-image-worker.ts` can load it under `node --experimental-strip-types`. This file is
 * NOT on the worker's path — nothing in a stall survives a process boundary — so one relative
 * import of a zero-import module is safe, and reusing the hash is what keeps "a job read twice
 * says the same sentence twice" one implementation instead of two.
 *
 * ── EVERY STRING HERE IS WRITTEN FOR A MODEL AND NEVER RENDERED ───────────────────────────────
 * The contract `NINA_IMAGE_CAPPED_NOTE` has, for the same reason: a canned bubble would be the app
 * talking, and the one thing this feature cannot afford is Nina sounding like an API. These steer
 * her; the words in the bubble are still hers.
 */

/**
 * **R4. Three ways to say "hang on", one per the runner's own three examples.**
 *
 * He wrote them himself on the card — `coba gw cek di album foto gw dulu ya`, `waduh foto nya
 * dimana ya, coba gw cari dulu`, `ntar yaaa gw fotoin dulu, sabaar` — and they are not three
 * phrasings of one thing. They are three different stories about where the photograph is coming
 * from: already taken and being looked for, lost and being hunted, not taken yet. That is the axis
 * the variety has to live on, because a model handed three paraphrases writes one sentence three
 * ways and the runner reads the same bubble every time.
 *
 * **They do not say which one is TRUE**, and they must not: she is about to generate a photograph
 * that does not exist yet, and `searching` is a fiction she is allowed because it is a fiction a
 * person tells. What none of them does is assert anything about the picture — the rule
 * `lib/nina/imagefail.ts` states as *a fallback may never assert a measurement*, applied to a
 * photograph nobody has seen.
 */
export const NINA_PHOTO_STALL_STEERS: readonly string[] = [
  'Say it as if the photo already exists somewhere and you are going to look for it — in your ' +
    'album, in your gallery, on your phone.',
  'Say it as if you cannot find the photo and are about to go hunting for it. A bit of fuss is ' +
    'right here.',
  'Say it as if you are about to take the photo right now, and he has to wait for you.',
]

/** The steer for this job. Deterministic in the job id — see `pickLine`. */
export function ninaPhotoStallSteer(jobId: string): string {
  return pickLine(NINA_PHOTO_STALL_STEERS, jobId)
}

/**
 * **What the FILLER turn is told** — the one that runs while the camera is still going, with
 * nothing of his to answer.
 *
 * ── THE FOUR PROHIBITIONS, EACH WITH A FAILURE BEHIND IT ──────────────────────────────────────
 *   · *do not mention the photo* — a second "bentar ya, fotonya lagi proses" is the waiting room
 *     this card exists to remove. Narrating the wait makes the wait the subject.
 *   · *do not describe it* — she has not seen it, and `handleGenerateImage` already refuses her
 *     this for the same reason: a bubble that narrates the picture is a fact the app never
 *     computed, and it reads absurdly if the generation then fails and she apologises for a photo
 *     she had already described.
 *   · *do not promise a time* — she does not know about queues, and the number would be a promise
 *     about `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`.
 *   · *do not take another photo* — belt only. The brace is that `lib/nina/photostall.ts` hands
 *     this turn a tool set with no camera in it, because the duplicate guard keyed on
 *     `ctx.sourceMessageId` cannot see a turn that has none.
 *
 * ── AND THE ONE POSITIVE INSTRUCTION, WHICH IS THE CARD ───────────────────────────────────────
 * *ask him something.* The runner's word was "proactive": the point is not that she fills the air,
 * it is that the conversation becomes his turn again. A question is also the only filler that
 * survives him not answering it — he reads it later and it still works — and when he DOES answer,
 * the existing chain in `runNinaBackgroundTurn` picks him up and the rest of the wait covers
 * itself with no help from this feature at all.
 */
export const NINA_PHOTO_STALL_INSTRUCTION =
  'The camera is still running in the background and he is sitting there waiting. Keep the ' +
  'conversation alive the way a friend would while their phone is busy: ask him something, pick ' +
  'up a thread from earlier, tease him, change the subject. One or two short bubbles. ' +
  'Ask him something he has to answer — that is the point of this message. ' +
  'Do NOT mention the photo, the camera, or that anything is loading. Do NOT describe the photo: ' +
  'you have not seen it. Do not promise a time. Do not take another photo.'

/**
 * **How many filler turns one wait may spend.**
 *
 * Two, and the ceiling is conversational rather than financial. A third unanswered message in a
 * row stops reading as someone filling a silence and starts reading as someone talking to
 * themselves — and by the third the typical 57–60 s generation has landed anyway. The money is
 * real but secondary: a filler is one `glm-5.3` turn against a photograph that already cost
 * $0.04.
 */
export const NINA_PHOTO_STALL_MAX = 2

/**
 * **The pause before each filler**, so she does not answer her own promise in the same breath.
 *
 * `planReveal` already staggers the bubbles WITHIN a turn; this is the gap BETWEEN turns, and it
 * is the difference between a person who said one thing and then thought of another, and a wall of
 * text that arrives at once. Six seconds is the low end of how long a second thought takes, and
 * the whole stall only has `NINA_PHOTO_STALL_DEADLINE_MS` to live in.
 */
export const NINA_PHOTO_STALL_GAP_MS = 6_000

/**
 * **The wall clock a filler needs before it is worth starting**, measured from the send.
 *
 * `NINA_PHOTO_STALL_GAP_MS` plus a turn. Fifteen live `glm-5.3` calls measured 10.2–16.4 s
 * (`NINA_TURN_POLL_INTERVALS_MS`' own note), so 22 s of model allowance plus the gap is the
 * honest figure — NOT `NINA_TURN_BUDGET.overall` (45 s), which is a ceiling rather than a
 * duration and would mean a second filler essentially never fires.
 *
 * Overrunning it is not dangerous, which is why the measured number is the right one here and the
 * ceiling is the right one in `runNinaImageJob`: that loop's overrun spends $0.04 on a generation
 * that gets killed, and this one's overrun lets the claim expire a few seconds early, so the tab
 * stops polling and a bubble that is already committed waits for the next load instead of landing
 * live.
 */
export const NINA_PHOTO_STALL_RESERVE_MS = 28_000

/**
 * **When the stall must be over, measured from the send — and the one number here that is derived
 * rather than chosen.**
 *
 * The stall works by holding the turn's `nina_turns` chat claim OPEN (see
 * `lib/nina/photostall.ts`), because `pollNinaReply`'s first `awaiting` disjunct is "a fresh claim
 * exists for this session" and that is what keeps the tab polling and makes the filler bubbles
 * arrive live. A claim is fresh for `NINA_TURN_STALE_MS` — 90 s — after which
 * `sweepStaleNinaChatTurns` closes it as dead and the poll stops believing it.
 *
 * So the stall has to finish, and the close has to be written, inside 90 s of the send. 70 s
 * leaves 20 s of margin for the close plus the insert that precedes it.
 * `lib/nina/imagestall.test.ts` asserts `NINA_PHOTO_STALL_DEADLINE_MS < NINA_TURN_STALE_MS`, so
 * raising one of the two literals without the other fails the suite rather than silently
 * un-landing every second filler.
 *
 * **This is not the wait's length, and it is not meant to cover it.** A 60 s generation outlives
 * the stall by design: the stall's job is to get the conversation moving again, and the chain in
 * `runNinaBackgroundTurn` is what carries it from there once he answers.
 */
export const NINA_PHOTO_STALL_DEADLINE_MS = 70_000

/** What `shouldStallAgain` was asked, so a `false` can say which rule stopped it. */
export type NinaPhotoStallVerdict =
  { go: true } | { go: false; reason: 'job-closed' | 'he-spoke' | 'out-of-time' | 'enough' }

/**
 * **The half of the rule that needs no I/O: the cap and the wall clock.**
 *
 * Split out so the loop can ask it BEFORE it pays for anything — the beat, the job read, the
 * context load. Without the split the last iteration of every stall spends a `db.batch` loading a
 * conversation it is about to decline to use, which the suite caught as "3 context loads for a
 * cap of 2".
 *
 * It is not a second copy of the policy: `shouldStallAgain` below is DEFINED in terms of this, so
 * each rule has exactly one statement and the two callers cannot drift.
 *
 *   · `enough` — `NINA_PHOTO_STALL_MAX`.
 *   · `out-of-time` — see `NINA_PHOTO_STALL_RESERVE_MS` and `NINA_PHOTO_STALL_DEADLINE_MS`.
 */
export function stallBudgetLeft(input: {
  /** `Date.now() - startedAtMs`: the whole send's age, not this filler's. */
  elapsedMs: number
  /** Fillers already emitted in this stall. */
  emitted: number
}): NinaPhotoStallVerdict {
  if (input.emitted >= NINA_PHOTO_STALL_MAX) return { go: false, reason: 'enough' }
  if (input.elapsedMs + NINA_PHOTO_STALL_RESERVE_MS > NINA_PHOTO_STALL_DEADLINE_MS) {
    return { go: false, reason: 'out-of-time' }
  }
  return { go: true }
}

/**
 * **The whole stop rule, as a pure function, so the loop in `lib/nina/photostall.ts` holds no
 * policy at all.**
 *
 * The two rules this adds to `stallBudgetLeft` are the ones that cost a read, and they are checked
 * FIRST — when all four inputs are known, the state of the world outranks the budget, because
 * "the photograph landed" is the reason an operator reading the log wants to see and "we were at
 * the cap anyway" is not.
 *
 *   · `job-closed` — the photograph (or the apology) has landed. There is nothing left to cover.
 *   · `he-spoke` — the newest row in the conversation is HIS. This is the one that must never be
 *     got wrong: the chain at the bottom of `runNinaBackgroundTurn` is already opening a turn for
 *     that message, and a filler emitted now talks over an answer he is waiting for. It is also
 *     the SUCCESS case — the filler asked him something and he replied, which is the entire point
 *     — so it is a stop and not a failure.
 */
export function shouldStallAgain(input: {
  jobOpen: boolean
  newestRowIsHis: boolean
  elapsedMs: number
  emitted: number
}): NinaPhotoStallVerdict {
  if (!input.jobOpen) return { go: false, reason: 'job-closed' }
  if (input.newestRowIsHis) return { go: false, reason: 'he-spoke' }
  return stallBudgetLeft(input)
}
