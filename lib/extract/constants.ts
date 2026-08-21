/**
 * Every tunable the ingest pipeline argues about, in one dependency-free module.
 *
 * PURE ON PURPOSE. No imports, no `server-only`, no `@/lib/env` — this file is read by the
 * client compressor, by a `'use client'` picker, by two Route Handlers, by the background job
 * and by the unit suite alike. The moment it imports anything from `lib/env.ts` the client half
 * of F04 stops compiling.
 *
 * Numbers with a MEASURED tag come from `IMPLEMENTATION_PLAN.md` §1 / `research/downscale.mjs`.
 * Numbers with a DESIGNED tag were chosen, not measured, and say so — see
 * `docs/plans/F04-ingest-extraction.md` §4.6.
 */

/* ── The three screens ───────────────────────────────────────────────────────────────────── */

/**
 * The screen kinds extraction understands. `run_photos.kind` also allows `'other'` (roadmap
 * §4.3); F04 never produces it — a photo that fed no extraction is F05/user territory.
 */
export const SCREEN_KINDS = ['summary', 'splits', 'heartrate'] as const
export type ScreenKind = (typeof SCREEN_KINDS)[number]

/** Human labels. One place, so the prompt, the picker and the review strip cannot drift. */
export const SCREEN_KIND_LABEL: Record<ScreenKind, string> = {
  summary: 'Summary',
  splits: 'Splits',
  heartrate: 'Heart rate',
}

/**
 * Default kind by pick order — 1st Summary, 2nd Splits, 3rd Heart Rate. That is the order the
 * screens appear in the iOS Fitness app itself, so it is right most of the time; the picker
 * always lets the runner override it before submitting (plan §5.3).
 */
export const DEFAULT_KIND_BY_INDEX: readonly ScreenKind[] = SCREEN_KINDS

export const MAX_IMAGES = 3
export const MIN_IMAGES = 1

/* ── Image preprocessing (plan §3) ───────────────────────────────────────────────────────── */

/**
 * MEASURED. `research/downscale.mjs` scored five variants at 108/108; JPEG q80 at **560 px on
 * the SHORT edge** is the one that ships — 170 KB for three images, 3,277 input tokens, no
 * accuracy cost. Input tokens track pixel dimensions, not bytes, so only the resize saves money.
 *
 * SHORT edge, not long edge. Apple Fitness screenshots are portrait (the fixture is 739×1600);
 * `browser-image-compression`'s `maxWidthOrHeight` clamps the LONGER dimension, so passing 560
 * straight through would produce a ~259 px-wide image, far outside the tested envelope. See
 * `lib/photos/resizeTarget.ts`, which exists solely to get this right.
 */
export const TARGET_SHORT_EDGE_PX = 560
/** MEASURED — the exact quality that was scored. Not a byte budget; see the compressor. */
export const TARGET_QUALITY = 0.8
/** Safety ceiling only. At 560w/q80 a screenshot lands near 55–60 KB, nowhere near this. */
export const TARGET_MAX_MB = 0.5
/**
 * One pass, deliberately. `expense-tracking` lets the library iterate quality downward to hit a
 * byte budget, which is right for arbitrary photos and wrong here: iteration could silently pick
 * a quality that was never scored at 108/108.
 */
export const COMPRESSION_MAX_ITERATION = 1
/** Self-hosted by `scripts/copy-image-compression-worker.mjs`; the library default is a CDN. */
export const COMPRESSION_LIB_URL = '/vendor/browser-image-compression.js'

/** Reject before decoding: a 25 MB "screenshot" is a mistake. */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
/**
 * Server-side ceiling for the compressed upload. 600 KB is ~10× the expected 55–60 KB, which
 * leaves room for an unusually dense screen while still making "upload the raw 5 MB original"
 * fail loudly at the token-mint step rather than quietly eating the free tier.
 */
export const MAX_UPLOAD_BYTES = 600_000

export const UPLOAD_CONTENT_TYPE = 'image/jpeg'
/** Compression always outputs JPEG, so exactly one type is allowed through. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = ['image/jpeg'] as const

/* ── Blob paths ──────────────────────────────────────────────────────────────────────────── */

export const SHOT_PREFIX = 'shots/'
/**
 * What the browser is allowed to ASK for, enforced in `onBeforeGenerateToken`. Our prefix, our
 * alphabet, our extension — the whole of the path-traversal defence.
 */
export const SHOT_REQUEST_PATHNAME_RE = /^shots\/[A-Za-z0-9_-]{12,24}\.jpg$/
/**
 * What Vercel actually STORES: `addRandomSuffix: true` appends `-` plus a run of URL-safe
 * characters. The bound is deliberately loose rather than pinned at the 30 currently observed —
 * this regex's job is our prefix and alphabet, not an internal of Vercel's we do not control.
 */
export const SHOT_STORED_PATHNAME_RE = /^shots\/[A-Za-z0-9_-]{12,24}-[A-Za-z0-9_-]{16,64}\.jpg$/

/** Blobs are immutable (random suffix), so cache them for a year. */
export const BLOB_CACHE_MAX_AGE = 60 * 60 * 24 * 365
/** Client upload tokens are short-lived. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000
/** Two at a time: enough to hide latency, few enough not to thrash a cellular uplink. */
export const UPLOAD_CONCURRENCY = 2

/* ── The background job's time budget (plan §4.6, amended by R-2) ────────────────────────── */

/** The Vercel Hobby function ceiling. The honest number, not an aspirational one. */
export const FUNCTION_MAX_DURATION_S = 60
/**
 * DESIGNED. A soft internal deadline, 5 s under the hard ceiling, so the job always gets to
 * write a terminal `extractions` row instead of being killed mid-flight and leaving `pending`
 * behind (plan §4.5). Ported from `parseExpenseWith`'s overall-deadline pattern.
 */
export const JOB_DEADLINE_MS = 55_000
/** MEASURED median is 33.7 s. 45 s covers the observed tail without eating the whole ceiling. */
export const PRIMARY_TIMEOUT_MS = 45_000
/**
 * **MEASURED 2026-08-21** by `tests/live/vision.live.test.ts` (plan Task 19, which had never been
 * run): a production text-only repair against the live endpoint took **11,460 ms**, with
 * `prompt_tokens: 1184` and `completion_tokens: 338`.
 *
 * This corrected a designed value that was about to ship broken. The first draft of this file set
 * the timeout to 12 s, reasoning from R-2 that a text-only repair must be cheap — and it IS cheap
 * in tokens, but not in wall-clock: 11.46 s against a 12 s timeout leaves 540 ms of margin, so a
 * slightly slower day would have failed repairs that were about to succeed, and reported them as
 * `validation` failures. 18 s is ~1.5× the one real sample; tighten it only against more samples,
 * never against the plan's arithmetic.
 */
export const REPAIR_TIMEOUT_MS = 18_000
/**
 * **MEASURED-DERIVED, from the same 11,460 ms.** Below this much remaining budget, do not start a
 * repair at all — starting a round-trip we cannot finish risks the invocation dying before it can
 * write a terminal row, which is strictly worse than failing cleanly now.
 *
 * The gate has to be at least as large as a repair actually takes, or it fails at its one job. The
 * original 6 s here was reasoned from R-2's "no images resent" and would have waved through
 * repairs with 6 s left that need 11.5 s. 14 s is the measurement plus a small margin.
 *
 * Note what this implies, and that it is correct: at the measured 33.7 s primary median there is
 * ~21 s of the 55 s soft deadline left, comfortably over this gate. But a primary that runs close
 * to its own 45 s timeout leaves only ~10 s, and the repair is then **skipped by design** rather
 * than started and killed. That is the gate working, not the gate misconfigured.
 */
export const MIN_REPAIR_BUDGET_MS = 14_000

/* ── Polling (plan §4.4) ─────────────────────────────────────────────────────────────────── */

/**
 * MEASURED-DERIVED. The extraction median is 33.7 s, so 2 s early / 5 s late delivers the
 * result within one interval of it finishing without hammering the endpoint on the slow tail.
 */
export const POLL_INTERVALS_MS = { initial: 2_000, mid: 3_000, late: 5_000 } as const
export const POLL_MID_AFTER_ATTEMPTS = 4
export const POLL_LATE_AFTER_ATTEMPTS = 10

/**
 * Both halves of the give-up rule, deliberately the same number.
 *
 *  - CLIENT: after this long without a terminal status, stop polling and offer "wait, or start
 *    over" rather than spinning forever.
 *  - SERVER: a `pending` row older than this is flipped to `failed` / `stale_timeout` on the
 *    next `GET` (plan §4.5, R-20). ~2.7× the measured median, comfortably past the slow tail.
 *
 * They match on purpose: the poll that gives up is the same poll that closes the row, so the
 * user's last request is the one that makes the state honest.
 */
export const STALE_PENDING_MS = 90_000

/** `extractions.error_code` values F04 writes. F05 branches on these. */
export const EXTRACTION_ERROR_CODES = [
  'token_floor',
  'transport',
  'timeout',
  'validation',
  'stale_timeout',
] as const
export type ExtractionErrorCode = (typeof EXTRACTION_ERROR_CODES)[number]

/** Elapsed-time copy for the progress screen. MEASURED median, stated as "about". */
export const TYPICAL_EXTRACTION_SECONDS = 35
