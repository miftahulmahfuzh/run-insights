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

/* ── The threshold chain. Derived in the plan's §The threshold arithmetic; asserted in the test. ── */

/** The worker's own OpenRouter timeout. 3x the measured 78.2 s. */
export const NINA_WORKER_CALL_TIMEOUT_MS = 240_000
/** `timeout-minutes` on the workflow job. Must exceed the call timeout plus setup. */
export const NINA_WORKER_TIMEOUT_MINUTES = 6
/** The `api.github.com` POST, inside `after()`, sharing the Server Action's page budget. */
export const NINA_IMAGE_DISPATCH_TIMEOUT_MS = 8_000
/**
 * How long a `dispatched` row is left alone before a SWEEP treats it as un-started.
 *
 * **It applies to a sweep and NOT to a job named by `--job`** — see `dispatchCutoffFor` in
 * `scripts/nina-image-worker.ts`, which is where Finding 2 was fixed. The grace exists to stop a
 * sweep stealing a job a runner is about to start; a named job and its runner are the same event, so
 * for a named claim the same window runs FORWARD instead, absorbing clock skew between the Vercel
 * process that stamped `created_at` and the GitHub runner that reads `now`.
 */
export const NINA_IMAGE_DISPATCH_GRACE_MS = 60_000
/** > the job ceiling, so a `running` row this old cannot still be running. */
export const NINA_IMAGE_RECLAIM_MS = 420_000
/** One retry. 2 x RECLAIM = 14 min worst case, which must stay under STALE. */
export const NINA_IMAGE_MAX_ATTEMPTS = 2
/**
 * The app-side give-up, and — **measured, not assumed** — the only deadline in the system.
 *
 * The original derivation assumed the workflow's `schedule: '*\/10'` would rescue a lost dispatch at
 * ~10 minutes, comfortably inside this 20. `NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS` records what
 * `schedule:` actually does, and it is one to two orders of magnitude slower. So this is not "the
 * backstop's deadline plus margin"; it is the whole guarantee, and the FAST path has to work. That
 * is Finding 2's fix and, permanently, phase 2's in-platform generator.
 *
 * The value does not move. Twenty minutes is how long she may plausibly say "bentar" before an
 * apology is the kinder answer, and stretching it to cover a four-hour backstop would mean a
 * photograph that failed at 09:00 goes unacknowledged until lunch.
 */
export const NINA_IMAGE_STALE_MS = 1_200_000
/**
 * **What `schedule:` measured, against what it declares. FINDING 3.**
 *
 * `.github/workflows/nina-image.yml` declares `cron: '*\/10 * * * *'`. Twelve consecutive `schedule`
 * runs over 2026-09-04..06 fired with gaps of **1 h 46 m to 4 h 19 m** — never ten minutes. GitHub
 * documents `schedule:` as best-effort and heavily deprioritises it on low-activity public
 * repositories, and the workflow's own comment anticipated the direction ("a good retry engine and a
 * bad deadline") while the threshold chain was nonetheless derived as if the declared cron were
 * honoured.
 *
 * This is the SHORTEST measured gap, so it is the most generous number the evidence supports.
 * `tests/nina.imagerecipe.test.ts` asserts it exceeds `NINA_IMAGE_STALE_MS`, which is the fact that
 * matters: **the backstop cannot beat the give-up.** If anyone later lowers `NINA_IMAGE_STALE_MS`
 * on the belief that a ten-minute rescue exists, that assertion is what stops them.
 *
 * The `*\/` in the crons above is written `*\/` on purpose: an unescaped one closes this comment.
 * `scripts/nina-image-worker.ts:36` and `tests/views.render.test.ts` use the same convention.
 */
export const NINA_IMAGE_SCHEDULE_MEASURED_GAP_MS = 6_360_000
/** Jobs one backstop run will drain, so a burst cannot exceed `timeout-minutes`. */
export const NINA_IMAGE_SWEEP_BUDGET = 3

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
