/**
 * **The camera's settings, shared by both hosts.** RU-2 is the ruling that permits a runtime
 * OpenRouter image call at all: D12 ("offline generation, committed, no runtime image calls") is
 * repealed for `lib/nina/` and for nothing else. Badge and record art are still generated offline
 * by `tools/gen_badge_art.py` and committed.
 *
 * ── THIS FILE MUST NEVER IMPORT ANYTHING ──────────────────────────────────────────────────────
 * Same rule and same reason as `imagefail.ts`: `scripts/nina-image-worker.ts` imports it by
 * relative path under `node --experimental-strip-types`. See that file's header, and
 * `scripts/backfill-record-keys.mjs:85` for the precedent.
 *
 * **RULING A6 is why `NINA_BLOB_PREFIX` is not declared here.** `lib/nina/images.ts` holds the one
 * definition in the repo and three hosts outside this phase read it from there. Re-exporting it
 * would cost this module its zero-import property; declaring a second one would be the duplication
 * A6 exists to forbid. So `ninaImagePathname` spells `nina/` inline, and
 * `tests/nina.imagerecipe.test.ts` imports the real constant and asserts the two agree. A test can
 * import both modules; the worker still cannot.
 *
 * ── TWO FACTS PORTED FROM `tools/gen_badge_art.py`. DO NOT RE-DERIVE THEM. ────────────────────
 *
 * 1. **THE ENDPOINT IS `POST /api/v1/images/generations`.** There is no `/images/edits` on this
 *    provider — it 404s, and not with "unknown model": the route does not exist. The
 *    chat-completions route with `modalities: ["image","text"]` also produces images on OpenRouter
 *    in general, but `qwen/qwen-image-3-pro` refuses it with "no endpoints found that support the
 *    requested output modalities". Verified again by this plan set's two probes.
 *
 * 2. **`resolution` AND `aspect_ratio`, NEVER `size`.** OpenRouter ignores `size` and defaults to
 *    2K, so omitting these silently returns a 2048-px master — after the money is spent.
 *    `resolution` is an enum (`'1K' | '2K'`), not a pixel count. `'1K'` here: 768x1024 at 3:4 is
 *    right for a phone-screen photo bubble and it is the cheaper and faster of the two.
 *
 * 3. **`seed` IS HONOURED BY THIS MODEL.** One is minted per job on Vercel and stored in
 *    `nina_turns.args`, so a generation that came out well can be reproduced and one that came out
 *    badly can be explained — and so a RETRY of the same job produces the same picture rather than
 *    a different one. `qwen/qwen-image-3-pro` is not listed in `/api/v1/models` — image models live
 *    at `/api/v1/images/models` — which is why it looks absent if anyone goes looking.
 *
 * ── THE FACT THAT IS NO LONGER HERE ───────────────────────────────────────────────────────────
 * The third scar in `gen_badge_art.py` is that the reference image rides in `input_references` on
 * the same generations call. **RU-18 dropped the anchor**, so this phase sends no
 * `input_references` at all and `buildImageRequestBody` has no parameter for one. Do not add it
 * back "for consistency with the badge deck": it was measured at 148.9 s against 78.2 s, and the
 * user deferred face fidelity knowingly. The seed for a future consistent-face feature is
 * `assets/nina/_anchor.png`, committed by phase 1 and read by nothing.
 *
 * ── THE SIDECAR CONVENTION, AT RUNTIME ────────────────────────────────────────────────────────
 * `gen_badge_art.py` writes a `.txt` beside every PNG holding the prompt, model and seed, because
 * "a candidate you like six weeks from now" has to be explainable. That habit is worth keeping and
 * the database is where it goes: `nina_message_images.prompt` receives it (assembled by
 * `sidecarText` in `imagegen.ts`). No file is written; the row IS the sidecar.
 * ── THE CEILING THAT MOVED, AND THE ONE MEASUREMENT THAT MATTERS ──────────────────────────────
 * Five files used to say: *"the shipping generation is 78.2 s measured and the Hobby ceiling in
 * `sin1` is 60 s, so the work cannot happen on Vercel at all."* That is no longer true.
 * `/docs/fluid-compute` and `/docs/functions/configuring-functions/duration` (both
 * `last_updated: 2026-08-24`) give Hobby + Fluid compute a default AND maximum of 300 s, and
 * fluid compute has been on by default for new projects since 2025-04-23; `vercel project
 * inspect run-insights` reports Created At: 20 August 2026. **The phase that acted on this
 * measured it rather than trusting it** — on 2026-09-06 a deployed `maxDuration = 300` route in
 * `sin1` held 90.4 s and returned 200 (no 504 at 60 s), and an `after()` callback logged
 * `SURVIVED { heldMs: 90030 }` 90 s after its response had been flushed and the connection
 * closed. Both numbers are in that phase's plan file.
 *
 * The threshold chain below is therefore derived for a host with TWO ceilings, not one:
 *   · VERCEL, the primary — 300 s per invocation, shared with whatever the turn already spent.
 *   · GITHUB ACTIONS, the backstop — six hours per job, capped at `timeout-minutes: 6` by us.
 * That is why there are two call timeouts. They are not a duplication; they are two hosts.
 *
 * ── THERE IS NO ASYNCHRONOUS OPENROUTER IMAGE API (R4) ────────────────────────────────────────
 * The full answer, with the endpoints, is in `lib/nina/imagecall.ts`'s header, next to the code
 * that would have used one. Short version: image generation is synchronous (base64 in the
 * response, or SSE partials with `stream: true`), and the async job API — `POST /api/v1/videos`,
 * `callback_url`, `X-OpenRouter-Signature` — is video-only. Do not go looking for a webhook.
 *
 */

export const NINA_IMAGE_MODEL = 'qwen/qwen-image-3-pro'
export const OPENROUTER_IMAGE_URL = 'https://openrouter.ai/api/v1/images/generations'
/** Enum, not a pixel count. See fact 2. */
export const NINA_IMAGE_RESOLUTION = '1K'
/** Portrait. She is a person, not a badge. */
export const NINA_IMAGE_ASPECT = '3:4'
/** 1K at 3:4. RECORDED, not measured — no image decoder runs on either host. */
export const NINA_IMAGE_WIDTH = 768
export const NINA_IMAGE_HEIGHT = 1024
/** Qwen returns PNG bytes and there is no `sharp` on the worker, so PNG is what gets stored. */
export const NINA_IMAGE_CONTENT_TYPE = 'image/png'
/** Blob objects are immutable (random suffix). One year. */
export const NINA_IMAGE_CACHE_MAX_AGE = 31_536_000
/**
 * The REQUESTED pathname's shape. Vercel appends its own random suffix to what we ask for
 * (`addRandomSuffix: true`), so the STORED pathname is longer than this and deliberately not
 * matched against it — exactly the distinction `lib/nina/images.ts`'s `NINA_CHAT_ID_RE` draws by
 * admitting 12-24 symbols. `.jpg` is admitted because phase 14 writes
 * `nina/<userId>/avatar-<nanoid12>.jpg` and this is the regex it inherits.
 */
export const NINA_IMAGE_PATHNAME_RE =
  /^nina\/[0-9A-Za-z_-]{1,64}\/(selfie|avatar)-[0-9A-Za-z_-]{12}\.(png|jpg)$/
export const SEED_MAX = 2_147_483_647

export type NinaImagePurpose = 'selfie' | 'avatar'
export type NinaImageJobPhase = 'queued' | 'dispatched' | 'running'

/**
 * Millionths of a USD (phase 1's rule: money is an integer in its smallest sensible unit).
 * **A FALLBACK, not the source of truth.** The index records the shipping path measured at $0.040
 * with `usage.cost` and `usage.cost_details` both present in the response, so the real number is
 * logged and this constant is used only when the provider omits it. A constant left as the primary
 * source goes stale silently the day the price moves.
 */
export const NINA_IMAGE_COST_MICRO_USD = 40_000

/**
 * Six a day. **DESIGNED, not measured** — at the measured $0.040 that is $0.24/day and ~$7.20/month
 * worst case, the right order of magnitude for a personal toy whose owner told us not to stint on
 * tokens but who is also paying the bill. It counts FAILED generations too, because
 * `countNinaTurnsSince` does: a cap that only counts successes is a cap an unlucky afternoon can
 * spend ten times over, and every failed attempt still cost either money or a runner minute.
 */
export const NINA_IMAGE_DAILY_CAP = 6

/* ── The threshold chain. Two hosts, one ordering; asserted in tests/nina.imagerecipe.test.ts. ── */

/**
 * **The primary host's ceiling, measured.** Vercel Hobby + Fluid compute: default AND maximum
 * 300 s. Every `after()` callback registered from a route segment inherits that segment's
 * `maxDuration`, which is why `app/nina/page.tsx` and `app/api/cron/nina/route.ts` both carry the
 * literal `300` — a segment left at 60 would kill a generation at 60 no matter what this file
 * says.
 *
 * DECLARED here so the arithmetic below is checkable in one place; the segments themselves must
 * spell a LITERAL, because segment config exports are statically analysed at build time and an
 * imported constant is not a value the analyser can see.
 */
export const NINA_HOST_MAX_DURATION_MS = 300_000

/**
 * What a chat turn may already have spent out of the invocation before a `generate_image` tool
 * call starts a generation in a nested `after()`. **Measured: 13-45 s.** The high end, because a
 * budget derived from the typical case is a budget that fails on the bad day.
 */
export const NINA_TURN_SPENT_MS = 45_000

/**
 * **The in-platform OpenRouter call's timeout.** 1.9x the measured 78.2 s.
 *
 * Not `NINA_WORKER_CALL_TIMEOUT_MS`: on a GitHub runner there is no ceiling to race, so 240 s is
 * free there and would be reckless here. 45 + 150 + 20 = 215 s inside a 300 s invocation, with
 * 85 s of slack for a cold start and a slow Blob write.
 */
export const NINA_IMAGE_CALL_TIMEOUT_MS = 150_000

/** The Blob `put` plus three indexed writes, with slack. Reserved out of the run budget. */
export const NINA_IMAGE_FINISH_RESERVE_MS = 20_000

/**
 * What `lib/nina/imagerun.ts` may spend of the invocation, from the moment it starts. Its retry
 * loop refuses to begin an attempt that would not fit inside what is left of this — a retry killed
 * halfway spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * `NINA_TURN_SPENT_MS + NINA_IMAGE_RUN_BUDGET_MS <= NINA_HOST_MAX_DURATION_MS` is the inequality
 * the whole in-platform design rests on. 45 + 200 = 245 <= 300.
 */
export const NINA_IMAGE_RUN_BUDGET_MS = 200_000

/** The backstop worker's own OpenRouter timeout. 3x the measured 78.2 s; off Vercel, nothing to
 *  race. Unchanged by the migration, because that host's ceiling did not move. */
export const NINA_WORKER_CALL_TIMEOUT_MS = 240_000

/** `timeout-minutes` on the backstop workflow's job. Must exceed the call timeout plus setup. */
export const NINA_WORKER_TIMEOUT_MINUTES = 6

/**
 * How long a job nobody has started is left alone before ANOTHER host may pick it up.
 *
 * **Its meaning narrowed and its value did not.** It used to be "how long a `dispatched` row is
 * left alone before a backstop treats it as un-started", and it was the arithmetic half of the
 * measured deadlock: the doorbell stamped `dispatched` 25-40 s before the runner it woke could
 * boot, and a runner may not claim a `dispatched` row younger than this — so a targeted dispatch
 * could never claim the job it was dispatched for. In-platform there is no doorbell, so nothing
 * writes `dispatched` at all; what survives is the honest question `reviveNinaImageJobs` asks on
 * a `/nina` render — *has this `queued` row been sitting long enough that whoever opened it is
 * plainly not going to run it?* Sixty seconds is a generous yes: the ordinary path claims within
 * milliseconds.
 *
 * `scripts/nina-image-worker.ts` still reads it for `dispatchCutoffFor`, which is phase 1's fix
 * and still guards the manual `--job` drain of the historical `dispatched` rows.
 */
export const NINA_IMAGE_DISPATCH_GRACE_MS = 60_000

/**
 * How old a `running` row must be before it is safe to reclaim. **> BOTH ceilings**, because
 * either host may have been the one that died:
 *   · Vercel  — `NINA_HOST_MAX_DURATION_MS` = 300 s
 *   · Actions — `NINA_WORKER_TIMEOUT_MINUTES` = 6 min = 360 s
 * 420 s clears both. Reclaiming sooner would claim a live generation twice and bill it twice.
 */
export const NINA_IMAGE_RECLAIM_MS = 420_000

/**
 * One retry. **Load-bearing, not a nicety**: neither host has a claim timestamp to compare against
 * (`nina_turns` has no `claimed_at` column), so both use `created_at` as a proxy, and this bound
 * is the only thing that stops an infinite reclaim loop on a row whose `created_at` is already old.
 */
export const NINA_IMAGE_MAX_ATTEMPTS = 2

/**
 * **The app-side give-up, and the deadline the runner actually experiences.** A `pending` row
 * older than this is closed `failed`/`stale` with her apology, by `sweepStaleNinaImageJobs` on
 * every `/nina` render.
 *
 * `NINA_IMAGE_STALE_MS > NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_RECLAIM_MS` (1200 > 840) is the
 * inequality R22 depends on most: she must not apologise while a generation is still running, or
 * the photograph lands after the apology.
 *
 * **It is a real deadline again, and it was not before.** The design used to lean on the workflow's
 * `schedule: '*\/10'` to rescue a lost job inside this window. Measured over 2026-09-05/06, the
 * actual gaps between scheduled runs were **1 h 46 m to 4 h 19 m** — one to two orders of magnitude
 * past this. So every lost job was declared stale long before any backstop looked at it. With the
 * generation in-platform the normal path never touches the backstop at all: it resolves in ~80-120
 * s, `reviveNinaImageJobs` re-fires a dropped one on the next render, and twenty minutes is the
 * outer bound on how long he can be left wondering. Long on purpose — apologising at four minutes
 * and delivering at five is worse than a two-minute wait.
 */
export const NINA_IMAGE_STALE_MS = 1_200_000

/**
 * **What `schedule:` measured, against what it declares. FINDING 3.**
 *
 * **CARRIED FORWARD FROM PHASE 1 — do not drop it when replacing this block.** Phase 1 added this
 * constant and `tests/nina.imagerecipe.test.ts` asserts it against `NINA_IMAGE_STALE_MS`; deleting
 * it here would stop the test file compiling. The value and the measurement are unchanged by the
 * migration, because the migration did not change what GitHub does.
 *
 * `.github/workflows/nina-image.yml` declares `cron: '*\/10 * * * *'`. Twelve consecutive
 * `schedule` runs over 2026-09-04..06 fired with gaps of **1 h 46 m to 4 h 19 m** — never ten
 * minutes. GitHub documents `schedule:` as best-effort and heavily deprioritises it on low-activity
 * public repositories. This is the SHORTEST measured gap, so it is the most generous number the
 * evidence supports.
 *
 * The assertion that matters is `> NINA_IMAGE_STALE_MS`: **the backstop cannot beat the give-up.**
 * That was the load-bearing fact when the backstop was the only rescue, and it is now the reason
 * the backstop is a THIRD net rather than the deadline — `reviveNinaImageJobs` is the second, and
 * it runs on the same render as the give-up sweep.
 *
 * The `*\/` in the crons above is written `*\/` on purpose: an unescaped one closes this comment.
 * `scripts/nina-image-worker.ts:36` and `tests/views.render.test.ts` use the same convention.
 */
export const NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000

/** Jobs one BACKSTOP run will drain, so a burst cannot exceed the workflow's `timeout-minutes`. */
export const NINA_IMAGE_SWEEP_BUDGET = 3

/**
 * Jobs one `/nina` RENDER will revive. One. A burst of six queued jobs must not turn a single page
 * load into six concurrent generations sharing one invocation's wall clock — and the next render
 * takes the next one, which is fast enough for a cap of six a day.
 */
export const NINA_IMAGE_REVIVE_BUDGET = 1

/**
 * `nina/<userId>/selfie-<id>.png`. RU-7, and the shape phase 14 already writes.
 *
 * The `nina/` literal is `NINA_BLOB_PREFIX` from `lib/nina/images.ts`, which is **the one
 * definition in the repo (RULING A6)** and cannot be imported here without costing this module the
 * zero-import property the Actions worker depends on. `tests/nina.imagerecipe.test.ts` imports that
 * constant and asserts this function agrees with it, so the duplication is checked rather than
 * merely intended — the same mitigation shape as the worker's `information_schema` preflight.
 */
export function ninaImagePathname(userId: string, purpose: NinaImagePurpose, id: string): string {
  return `nina/${userId}/${purpose}-${id}.png`
}

/**
 * **The payload, in one place, so the two hosts cannot disagree.** The app never calls OpenRouter;
 * it only builds prompts. The worker never builds prompts; it only calls OpenRouter. This function
 * is where those two halves meet, and `tests/nina.imagerecipe.test.ts` asserts both ported facts
 * against it — which is the only way they can be asserted at all, since the worker's own `fetch` is
 * on a machine no test runs on.
 *
 * Exactly the body the unanchored probe sent and got 200 from:
 *   { model, prompt, resolution, aspect_ratio, n, seed }
 */
export function buildImageRequestBody(input: {
  prompt: string
  seed: number
}): Record<string, unknown> {
  return {
    model: NINA_IMAGE_MODEL,
    prompt: input.prompt,
    resolution: NINA_IMAGE_RESOLUTION,
    aspect_ratio: NINA_IMAGE_ASPECT,
    n: 1,
    seed: input.seed,
  }
}

/**
 * `usage.cost` off the response, in micro-USD. `usage.total_cost` is accepted as a second spelling
 * because OpenRouter's chat routes use that name and a provider that unifies them later should not
 * silently fall back to the constant. Returns null when neither is a finite number, and the caller
 * substitutes `NINA_IMAGE_COST_MICRO_USD`.
 */
export function readReportedCostMicroUsd(usage: unknown): number | null {
  if (usage == null || typeof usage !== 'object') return null
  const record = usage as Record<string, unknown>
  for (const key of ['cost', 'total_cost']) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.round(value * 1_000_000)
    }
  }
  return null
}

/**
 * Midnight in Asia/Jakarta, as an instant. D6 says the app's day is Jakarta's day, and the cap is a
 * per-day cap, so it must roll over at 00:00 +07:00 and not at UTC midnight — otherwise the cap
 * resets at 7am local and "she is out of photos" happens over breakfast.
 *
 * A literal offset, not a time-zone library: Asia/Jakarta is UTC+7 with no DST, ever, which is the
 * same fact `lib/date/ranges.ts` and phase 2's `JAKARTA_TIME_ZONE` already rely on. It lives here
 * rather than in `imagejobs.ts` so the worker can compute the same day boundary — it enforces the
 * cap again on claim, since a job queued at 23:59 and retried at 00:05 belongs to the day it was
 * queued and must not be double-counted.
 */
export function jakartaDayStart(now: Date = new Date()): Date {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const y = jakarta.getUTCFullYear()
  const m = String(jakarta.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jakarta.getUTCDate()).padStart(2, '0')
  return new Date(`${y}-${m}-${d}T00:00:00+07:00`)
}

/**
 * **`nina_turns.args`.** Phase 1's nullable `jsonb` column (RULING C1). Everything the worker needs
 * to do its job, written once by the app and never by a browser.
 *
 * `prompt` is fully assembled on Vercel and stored verbatim. That is the load-bearing choice in
 * this whole design: it means the worker needs no persona, no phase 2 module and no `@/` alias, and
 * it means the BACKSTOP SCHEDULE can pick up a job it was never told about — which is the retry
 * path that a queue calling back into Vercel could not have.
 */
export interface NinaImageJobArgs {
  purpose: NinaImagePurpose
  scene: string
  mood: string | null
  prompt: string
  seed: number
  /** The runner message that asked, so the photo or the apology quotes it (phase 7's column). */
  replyToId: string | null
  /** Provenance. `'chat'` posts a message; the other two write `nina_avatars`. */
  source: 'chat' | 'generated' | 'admin'
  /** Bounded by `NINA_IMAGE_MAX_ATTEMPTS`. Incremented by each claim. */
  attempts: number
  /** The prompt-as-sent record; lands in `nina_message_images.prompt`. */
  sidecar: string
}
