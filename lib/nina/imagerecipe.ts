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
 * ── THE FACT THAT CAME BACK, AND WHAT IT COSTS (R10) ──────────────────────────────────────────
 * The third scar in `gen_badge_art.py` is that the reference image rides in `input_references` on
 * the same generations call. This block used to say RU-18 had dropped the anchor and *"do not add
 * it back for consistency with the badge deck"*. **R10 reverses that ruling, and the user asked
 * for it in as many words:** *"photo reference: user can select all photos in Nina's album and
 * Chat photos … user can select one out of all these photos."* So `buildImageRequestBody` has an
 * OPTIONAL reference parameter again, and `NinaImageJobArgs.referenceUrl` is how a job carries
 * one.
 *
 * **RU-18's measurement was right and is not repealed — it is PAID FOR.** An anchored generation
 * was measured at **148.9 s** against **78.2 s** unanchored, and the shipping in-platform ceiling
 * was 150 s, so shipping R10 against that ceiling would have aborted about half of its own
 * generations after the money was spent. That is why there is now a SECOND in-platform timeout —
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, used only when a reference is present — and why
 * `NINA_IMAGE_RUN_BUDGET_MS` has moved twice (200 s → 240 s with R10, → 255 s with the 2026-09-11
 * anchored drift). The threshold block below derives both.
 *
 * **WHAT `input_references` ACTUALLY DOES ON THIS MODEL, measured elsewhere in this repo and not
 * to be re-learned at $0.04 a probe:** it *"behaves like a strong img2img, not a style reference:
 * it transfers the SUBJECT hard and the cloth tone not at all"* — `docs/plans/F10-badge-art-skill.md:1087`
 * (three graded attempts), restated at `docs/plans/F15-badge-master-aspect.md:79-88` and
 * `docs/plans/F25-record-patch-art.md:322`. For a badge that was fatal, because a badge is being
 * INVENTED. Here it is the point: the operator picks a photograph of the woman he wants back, and
 * the subject transferring hard is the request. The honest caveat, which belongs on the picker and
 * not in a prompt sentence: the chosen photograph's pose and composition come along with her face.
 * The finding is not contradicted, it is used — exactly as F15 §2.2 used it.
 *
 * **ONLY `image/png` IS VERIFIED ON THIS ENDPOINT.** `gen_badge_art.py:349` hardcodes
 * `data:image/png;base64,`. `NINA_IMAGE_REFERENCE_CONTENT_TYPES` also admits JPEG and WebP because
 * that is what the album and the chat photos actually hold, and refusing them would leave R10 with
 * almost nothing to point at. The first anchored generation is therefore also the probe — which is
 * what R11's test button is for, and its verdict distinguishes a refusal from a timeout.
 *
 * **`assets/nina/_anchor.png` IS STILL READ BY NOTHING, and this phase did not change that.** It
 * is written by `scripts/nina-profpic.mjs` (and the `update-nina-profpic` skill) as the committed
 * face seed, it is 6.7 MB, and it is deliberately NOT the fallback for a reference that cannot be
 * fetched: a committed asset is on the GitHub runner's disk and is not in the Vercel bundle unless
 * something imports it, so a fallback built on it would work on one host and not the other, which
 * is worse than no fallback. A reference that cannot be fetched degrades to an unanchored
 * generation with a warning — the operator gets a picture without the anchor rather than an
 * apology.
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
 * **The fallback daily cap — 30, the 2026-09-10 ask:** *"buat quota untuk image generation can be
 * easily changed via vercel env. right now set it to 30 images."* The LIVE number is
 * `ninaImageDailyCap()` below, which reads `NINA_IMAGE_DAILY_CAP` from the environment; the Vercel
 * variable moves the cap with no deploy and this constant is what ships when it is unset. At the
 * measured $0.040 the default is $1.20/day and ~$36/month worst case — the owner was shown that
 * arithmetic next to the 6/day it replaced and chose the raise.
 *
 * It counts FAILED generations too, because `countNinaTurnsSince` does: a cap that only counts
 * successes is a cap an unlucky afternoon can spend ten times over, and every failed attempt still
 * cost either money or a runner minute.
 */
export const NINA_IMAGE_DAILY_CAP = 30

/**
 * The clamp `ninaImageDailyCap` applies to the env override. **1, not 0**: an operator who wants no
 * generations unchecks the photo dial (`nina_tuning.photo_eagerness`), which announces itself in
 * her behaviour, whereas a mistyped `0` here would ban them silently. **200, not ∞**: the variable
 * is a MONEY number and a dropped digit should fail toward the modest side, not the ruinous one.
 */
export const NINA_IMAGE_DAILY_CAP_MIN = 1
export const NINA_IMAGE_DAILY_CAP_MAX = 200

/**
 * **The daily cap, as the environment has it — the one reader.**
 *
 * Read at CALL time, not at import time, so a Vercel env edit takes effect on the next generation
 * with no redeploy and no cold-start distinction; every consumer (`ninaImageQuotaLeft`, the
 * admin panel's capped sentence) goes through here rather than touching `process.env` itself or
 * the constant, which would freeze the number at build time. `lib/share/origin.ts` is the
 * precedent for an optional variable read beside its fallback rather than through `lib/env.ts`:
 * this file must keep its zero-import property (`scripts/nina-image-worker.ts` imports it under
 * `--experimental-strip-types`), and `process.env` is a global, not an import.
 *
 * Unset, empty, or unparseable all fall back to `NINA_IMAGE_DAILY_CAP`; a parsed value is floored
 * to an integer and clamped into `NINA_IMAGE_DAILY_CAP_MIN..MAX`. A cap that could not be read
 * must never degrade to 0 — zero would be a silent generation ban.
 */
export function ninaImageDailyCap(): number {
  const raw = process.env.NINA_IMAGE_DAILY_CAP
  if (typeof raw !== 'string' || raw.trim() === '') return NINA_IMAGE_DAILY_CAP
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return NINA_IMAGE_DAILY_CAP
  return Math.min(NINA_IMAGE_DAILY_CAP_MAX, Math.max(NINA_IMAGE_DAILY_CAP_MIN, parsed))
}

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
 * **The in-platform OpenRouter call's timeout, WITHOUT a reference.** 1.9x the measured 78.2 s.
 *
 * Not `NINA_WORKER_CALL_TIMEOUT_MS`: on a GitHub runner there is no ceiling to race, so 290 s is
 * free there and would be reckless here. 45 + 150 + 20 = 215 s inside a 300 s invocation, with
 * 85 s of slack for a cold start and a slow Blob write.
 *
 * **Read it through `ninaImageCallTimeoutMs(anchored)` rather than directly.** An anchored call has
 * its own ceiling below, and a caller that hardcodes this one would abort about half of R10's
 * generations at 150 s — the exact bug RU-18's measurement predicts.
 */
export const NINA_IMAGE_CALL_TIMEOUT_MS = 150_000

/**
 * **The in-platform timeout WITH a reference, and the whole price of R10.** Chosen against two
 * measurements that disagree, and the disagreement is the point: RU-18 measured 148.9 s anchored,
 * and 192-197 s completions through 2026-09-10 09:41 UTC sat comfortably under the 220 s that
 * R10 derived from it — then every anchored attempt from 2026-09-10 13:23 UTC onward died AT that
 * ceiling (`nina_turns` latency 220002-220004, four jobs, two hosts). A ceiling set exactly at a
 * stale measurement turns provider drift into requeues and double bills, so the drift moved it to
 * 235 s: strictly above the value that failed, and the largest value the inequality below allows
 * at all (`tests/nina.imagerecipe.test.ts` pins the floor at 220_000 for exactly that reason).
 *
 *   NINA_TURN_SPENT_MS + this + NINA_IMAGE_FINISH_RESERVE_MS <= NINA_HOST_MAX_DURATION_MS
 *   45 + 235 + 20 = 300 <= 300                                        ✔ exact
 *
 * versus 215 <= 300 unanchored. **The slack fell from 85 s to 15 s to none, and that is the cost
 * of the anchor on a slower provider**, paid only on jobs that carry one. Worst case is reached
 * only when all three worst cases coincide — a turn that really spent its measured 45 s high end,
 * a provider that runs to the full ceiling, and finish writes that need their whole reserve — and
 * the consequence is the invocation being killed with a `running` row, which `reviveNinaImageJobs`
 * re-fires on the next `/nina` render and `sweepStaleNinaImageJobs` apologises for at twenty
 * minutes. Three nets, all unchanged; on the ADMIN test path the turn term is ~0, so the real
 * slack there is the whole 45 s.
 *
 * **IT BOUNDS THE WHOLE OF `callNinaImageModel`, fetch included.** The reference is fetched from
 * Blob inside that function, before the POST, and the POST's `AbortSignal` gets what is LEFT of
 * this after the fetch. So this one number is the honest ceiling on the call and the arithmetic
 * above needs no fourth term — `NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS` is a sub-bound inside it,
 * not an addition to it.
 */
export const NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS = 235_000

/** The Blob `put` plus three indexed writes, with slack. Reserved out of the run budget. */
export const NINA_IMAGE_FINISH_RESERVE_MS = 20_000

/**
 * What `lib/nina/imagerun.ts` may spend of the invocation, from the moment it starts. Its retry
 * loop refuses to begin an attempt that would not fit inside what is left of this — a retry killed
 * halfway spends $0.04 and leaves a `running` row for a sweep to apologise for.
 *
 * **Two inequalities pin it, and twice moved: R10 took it from 200 s to 240 s, and the 2026-09-11
 * anchored drift took it from 240 s to 255 s.**
 *
 *   1. It must hold ONE WHOLE ANCHORED ATTEMPT, or the loop refuses even the first one and the
 *      reference feature generates nothing:
 *        NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS + NINA_IMAGE_FINISH_RESERVE_MS <= this
 *        235 + 20 = 255 <= 255                                              ✔ exactly
 *   2. It must still fit under the host ceiling with a whole chat turn already spent — the
 *      inequality the whole in-platform design rests on:
 *        NINA_TURN_SPENT_MS + this <= NINA_HOST_MAX_DURATION_MS
 *        45 + 255 = 300 <= 300                                              ✔ exact
 *
 * The unanchored attempt is unchanged at 150 + 20 = 170 <= 255.
 *
 * **What (1) being EXACT means, said plainly: an anchored job gets one attempt per invocation.**
 * After any anchored failure, `Date.now() - start` is already positive, so
 * `elapsed + 235 + 20 > 255` and the loop declines the retry and returns `'retry'`. That is the
 * correct answer rather than a limitation — two 235 s attempts cannot fit under a 300 s ceiling by
 * any arithmetic — and the second attempt still happens: the row is left `queued`,
 * `NINA_IMAGE_MAX_ATTEMPTS` is still 2, and `reviveNinaImageJobs` re-fires it on the next `/nina`
 * render with a fresh 300 s. An unanchored job keeps its same-invocation retry and gets a more
 * generous one than before: it now retries after any failure inside the first 85 s (255 - 170)
 * where the 240 s budget allowed 70 s.
 */
export const NINA_IMAGE_RUN_BUDGET_MS = 255_000

/** The backstop worker's own OpenRouter timeout. Strictly above the 240 s at which its own
 *  anchored attempt died on 2026-09-10 (latency 240002) — that is what a backstop is for — and
 *  still the largest value the chain below allows: `timeout-minutes: 6` (360 s) must stay above
 *  call + 60 s of setup (290 + 60 = 350), and `NINA_IMAGE_RECLAIM_MS` (420 s) must stay above the
 *  workflow ceiling, so no host's generation is ever reclaimed while it may still be running. */
export const NINA_WORKER_CALL_TIMEOUT_MS = 290_000

/** `timeout-minutes` on the backstop workflow's job. Must exceed the call timeout plus setup. */
export const NINA_WORKER_TIMEOUT_MINUTES = 6

/**
 * **How long the reference fetch may take, out of the anchored allowance above.**
 *
 * A Blob object is on a public CDN in the same region, so ten seconds is generous for the 8 MiB
 * worst case; the ordinary case is a ~1.2 MB generated PNG. It is a SUB-BOUND of
 * `NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS`, not an addition to it — `callNinaImageModel` gives the
 * POST whatever is left of the 235 s after the fetch — which is why the threshold arithmetic has
 * three terms and not four.
 *
 * Missing this deadline costs an ANCHOR, never a job: the fetch degrades to an unanchored
 * generation with a warning.
 */
export const NINA_IMAGE_REFERENCE_FETCH_TIMEOUT_MS = 10_000

/**
 * **The largest reference this pipeline will put on the wire. 8 MiB.**
 *
 * Two reasons for that number and not a rounder one:
 *
 *   1. It is exactly `ADMIN_AVATAR_MAX_UPLOAD_BYTES` (`lib/admin/avatars.ts:46`), which is the
 *      largest thing the picker can offer — that constant's own comment says *"a lightly-compressed
 *      PNG portrait is ~7 MB"*. A cap below it would silently drop the anchor on album photographs
 *      the operator can see and select, which is a control that does nothing. Chat photos are
 *      smaller by construction (2 MiB admin-added, 900 KB from his side) and a generated 1K PNG is
 *      ~1.2 MB.
 *   2. An UNBOUNDED fetch into a JSON body on a serverless invocation is both a memory and a
 *      latency problem. **Base64 inflates bytes by 4/3**: 8 MiB in becomes ~11.2 MB of `data:` URL,
 *      and `JSON.stringify` makes another copy of it, so the transient peak is ~30 MB. That is
 *      affordable at 8 MiB and is not at 80.
 *
 * It cannot IMPORT `ADMIN_AVATAR_MAX_UPLOAD_BYTES` — this module must stay zero-import for the
 * Actions worker (see the header) — so `tests/nina.imagerecipe.test.ts` imports both and asserts
 * they agree. Same mitigation shape as `ninaImagePathname` versus `NINA_BLOB_PREFIX` (RULING A6).
 */
export const NINA_IMAGE_REFERENCE_MAX_BYTES = 8 * 1024 * 1024

/**
 * What a reference `data:` URL may claim to be — read back from the Blob's own `content-type`
 * header and allow-listed, never assumed.
 *
 * The same three as `ADMIN_AVATAR_CONTENT_TYPES` (`lib/admin/avatars.ts:38`) and
 * `vision.ts`'s `DESCRIBABLE_MEDIA_TYPES`, and asserted against the former in the tests. Labelling
 * JPEG bytes `image/png` in a data URI is a lie told to a vendor whose failure mode is "200 OK with
 * invented content" (`vision.ts:275`'s ruling), so a served type outside this list DEGRADES to an
 * unanchored generation rather than being guessed at.
 *
 * Only `image/png` is VERIFIED on this endpoint (`tools/gen_badge_art.py:349`). See the header.
 */
export const NINA_IMAGE_REFERENCE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type NinaImageReferenceContentType = (typeof NINA_IMAGE_REFERENCE_CONTENT_TYPES)[number]

/**
 * **Which of the two in-platform ceilings this call gets.** One function so that neither host, nor
 * `imagerun.ts`'s retry budget, can pick the wrong one — and so the choice is one grep away from
 * both constants.
 *
 * `anchored` is a boolean rather than the URL because the two call sites mean different things by
 * it: `imagerun.ts` asks "does this JOB request an anchor" (conservative — it must reserve the
 * larger budget before the fetch is attempted) and `imagecall.ts` asks "is an anchor actually
 * going on the wire" (precise — a reference that could not be fetched is an unanchored call and
 * gets the unanchored ceiling).
 */
export function ninaImageCallTimeoutMs(anchored: boolean): number {
  return anchored ? NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS : NINA_IMAGE_CALL_TIMEOUT_MS
}

/**
 * **The one reader of `args.referenceUrl`, because `nina_turns.args` is jsonb and old rows exist.**
 *
 * Every row written before this phase has no `referenceUrl` key at all, and both hosts read those
 * rows (`claimNinaImageJob` in `lib/nina/imagejobs.ts` and `claimJob` in
 * `scripts/nina-image-worker.ts` both cast `row.args` straight to `NinaImageJobArgs`, with no
 * validation and no migration of the blob). So the field is OPTIONAL in the interface and every
 * read goes through this function, which normalises four things to one:
 *
 *   · absent          -> null   (every job written before this phase)
 *   · null            -> null   (a job whose operator selected nothing)
 *   · ''              -> null   (a form that round-tripped an empty string; a `data:`-less fetch
 *                                of '' would be a transport failure inside the anchored branch)
 *   · not a string    -> null   (jsonb holds whatever was written; nothing validates it on read)
 *
 * It also refuses anything that is not `https://`. The URL is resolved server-side from our own
 * rows, so this is not the SSRF boundary — it is the assertion that it stays that way, cheap enough
 * to keep even though nothing untrusted reaches it today.
 */
export function ninaImageReferenceUrl(
  args: Partial<NinaImageJobArgs> | null | undefined,
): string | null {
  if (args == null) return null
  const url = args.referenceUrl
  if (typeof url !== 'string' || url.length === 0) return null
  return url.startsWith('https://') ? url : null
}

/**
 * `data:<type>;base64,<payload>` — the exact string `tools/gen_badge_art.py:349-351` builds, minus
 * the file read.
 *
 * Returns null when the served content type is not one this pipeline will vouch for, which the
 * callers turn into an unanchored generation. Building the URL is separated from FETCHING it
 * because the fetch differs per host (`imagecall.ts` on Vercel, `fetchReference` on the runner) and
 * this string must not: a payload built two ways is a payload that will one day be built two ways.
 */
export function buildImageReferenceDataUrl(contentType: string, base64: string): string | null {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!(NINA_IMAGE_REFERENCE_CONTENT_TYPES as readonly string[]).includes(type)) return null
  if (base64.length === 0) return null
  return `data:${type};base64,${base64}`
}

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
 * **WITHOUT a reference it is byte-identical to the body the unanchored probe got a 200 from**, and
 * the test asserts that against a literal rather than against a re-derivation:
 *   { model, prompt, resolution, aspect_ratio, n, seed }
 * The `input_references` key is ASSIGNED CONDITIONALLY and never set to `undefined`, so the
 * unanchored `JSON.stringify` output is unchanged down to the byte and the key order still matches
 * `gen_badge_art.py`'s (seed, then the references).
 *
 * **WITH one it adds exactly the shape `tools/gen_badge_art.py:349-354` verified** — one array, one
 * entry, `{ type: 'image_url', image_url: { url } }`, where the url is a `data:` URL built by
 * `buildImageReferenceDataUrl`. Not an `https://` URL: an image_url pointing at a host has never
 * been probed against this endpoint, and `lib/nina/vision.ts:252-258` makes the same ruling for the
 * same reason. Not `/images/edits` either — that route does not exist on this provider (fact 1).
 */
export function buildImageRequestBody(input: {
  prompt: string
  seed: number
  /** A `data:` URL from `buildImageReferenceDataUrl`. Absent or null = an unanchored generation. */
  referenceDataUrl?: string | null
  /**
   * The job's chosen camera (the 2026-09-10 dropdown), as the row's coerced id. Optional and
   * defaulted to `NINA_IMAGE_MODEL` so every caller that does not know about the dropdown — and
   * every pre-dropdown test — builds the byte-identical body they always built. A caller that HAS
   * a job passes `coerceNinaImageModel(args.model)`, so an old jsonb row without the key rides the
   * default like every other absent member.
   */
  model?: string
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model ?? NINA_IMAGE_MODEL,
    prompt: input.prompt,
    resolution: NINA_IMAGE_RESOLUTION,
    aspect_ratio: NINA_IMAGE_ASPECT,
    n: 1,
    seed: input.seed,
  }
  if (input.referenceDataUrl != null && input.referenceDataUrl.length > 0) {
    body.input_references = [{ type: 'image_url', image_url: { url: input.referenceDataUrl } }]
  }
  return body
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
  /**
   * **The operator's chosen photograph (R10), as an absolute `https://` Blob URL.** Fetched and
   * base64'd at call time by whichever host runs the job, and sent as `input_references`.
   *
   * ── WHY IT IS OPTIONAL AND NOT `string | null` ────────────────────────────────────────────────
   * `nina_turns.args` is jsonb and is never migrated. Every row written before this phase has no
   * `referenceUrl` key, and BOTH hosts read those rows by casting: `claimNinaImageJob`
   * (`lib/nina/imagejobs.ts:342`) and the worker's `claimJob`
   * (`scripts/nina-image-worker.ts:429`) each do `row.args as NinaImageJobArgs` with no validation.
   * A required member would make that cast a lie about every historical row and every job phases 2
   * and 6 open without one. Optional keeps the cast honest; `ninaImageReferenceUrl(args)` is the
   * only sanctioned read and normalises absent, null, empty and non-string alike.
   *
   * A job whose reference cannot be fetched is generated WITHOUT it, with a warning. The operator
   * gets a picture without the anchor rather than an apology.
   */
  referenceUrl?: string | null
  /**
   * **The camera this job was opened with (the 2026-09-10 dropdown), as a coerced provider id.**
   * OPTIONAL for the exact reason `referenceUrl` is — `nina_turns.args` is jsonb and is never
   * migrated, both hosts cast old rows straight to this interface, and every job opened before the
   * dropdown shipped has no such key. The read is `coerceNinaImageModel`
   * (`lib/nina/imageprefs.ts` — this file cannot import it), which normalises absent, null,
   * empty and unknown alike to `NINA_IMAGE_MODEL`; a plain `string` member keeps the cast honest
   * the same way `referenceUrl`'s does.
   */
  model?: string
}
