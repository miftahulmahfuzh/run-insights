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
 * Default kind by pick order — 1st Heart rate, 2nd Splits, 3rd Summary. That is the order the
 * runner's device hands the files over in, which is the only order that matters here: the picker
 * always lets the runner override it before submitting (plan §5.3), but a default that is never
 * right means three manual re-picks on every single upload.
 *
 * **Deliberately its own literal, not `SCREEN_KINDS`.** It was an alias until F29, justified as
 * "the order the screens appear in the iOS Fitness app itself" — the same false premise F16 had
 * already recorded (`lib/extract/reassignKind.ts` §1): the app's own screen order is not the order
 * the OS photo picker hands files over in. Re-aliasing this to `SCREEN_KINDS` to tidy it up would
 * restore the defect. See docs/plans/F29-default-kind-order.md.
 *
 * `satisfies` rather than a `readonly ScreenKind[]` annotation, so the elements are checked against
 * `ScreenKind` while the tuple stays literal — a widened annotation would let a mistyped
 * permutation past the invariant test that pins this against `SCREEN_KINDS`.
 */
export const DEFAULT_KIND_BY_INDEX = ['heartrate', 'splits', 'summary'] as const satisfies readonly ScreenKind[]

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
 * **MEASURED 2026-08-21** (plan Task 19, which had never been run). Three samples of a REALISTIC
 * repair — the full 108-field session with one split's `hrBpm` missing, which the model must
 * return complete:
 *
 *   | sample | latency  | prompt | completion |
 *   |--------|----------|--------|------------|
 *   | 1      | 25,320ms | 2,215  | 1,071      |
 *   | 2      | 27,640ms | 2,215  | 1,071      |
 *   | 3      | 31,905ms | 2,215  | 1,067      |
 *   | 4      | 34,872ms | 2,215  | 1,071      |
 *
 * **Range 25.3-34.9 s — and the shape of that result matters more than the number: latency tracks
 * COMPLETION tokens, at ~26-33 ms each.** Which is why this constant was wrong twice. It shipped
 * at 12 s (reasoned from R-2: a text-only repair sends no images, so it must be cheap), then 18 s
 * after a single 11,460 ms sample — but that sample repaired a stub and emitted only 338 tokens.
 * A real repair has to re-emit the whole session (~1,070 tokens), so it costs roughly what the
 * primary call costs. **Cheap in tokens is not cheap in wall-clock.**
 *
 * 36 s covers the measured maximum with a little room. It can never overrun the deadline anyway:
 * `extractSession` caps the repair's timeout at the budget that actually remains.
 */
export const REPAIR_TIMEOUT_MS = 36_000
/**
 * **MEASURED-DERIVED from the same three samples**, and the number with a real consequence.
 *
 * Below this much remaining budget, do not start a repair at all — a round-trip we cannot finish
 * risks the invocation dying before it writes a terminal row, which is strictly worse than
 * failing cleanly now. So the gate must be **at least as large as a repair really takes**, or it
 * fails at its one job. 28 s is the measured minimum (27,640 ms).
 *
 * ── WHAT THIS HONESTLY IMPLIES ON VERCEL HOBBY ──────────────────────────────────────────────
 * The primary call's own median is 28-36 s (measured: 28.2 s at the shipped 560w/q80 recipe,
 * 36 s at original PNG size). Against a 55 s soft deadline that leaves ~20-27 s — **less than a
 * repair needs.** So on Hobby the repair round-trip is **best-effort and will usually be
 * skipped**, and a malformed reply will usually reach `failed` / `validation` and hand F05 its
 * blank form. That is the gate working exactly as designed, not a misconfiguration, and it is
 * the outcome plan §4.6 already anticipated: *"If Vercel Pro ever becomes available, raising
 * maxDuration to 120-300 s removes this pressure entirely and the repair gate can be relaxed to
 * a flat 'always attempt.'"* This measurement is what turns that from a contingency into the
 * actual state of play. The repair path is correct and tested; it is rationed by a ceiling, and
 * this comment says so rather than pretending otherwise.
 *
 * ── AND WHAT A REPAIR CAN AND CANNOT FIX ────────────────────────────────────────────────────
 * All three samples returned `splits[3].hrBpm: null` where the truth is 173, while keeping every
 * other field intact. That is **correct**, not a failure: with no image in the request (R-2) the
 * model cannot recover a value it can no longer see, and RULE 1 forbids inventing one. So a
 * text-only repair fixes the SHAPE and nulls what it cannot re-read. F05 should treat a
 * `repaired` session as "valid, but a field may have been dropped" — which is exactly what a
 * human looking at the screenshot is for.
 */
export const MIN_REPAIR_BUDGET_MS = 28_000

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
