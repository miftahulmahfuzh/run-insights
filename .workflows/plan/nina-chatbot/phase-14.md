# Phase 14: The `/update-nina-profpic` skill

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. One ruling changes this plan materially:
>
> - **RU-18 dropped the face anchor**, so **RU-16 ("this script always re-anchors") now has no
>   consumer.** Generation sends no reference image, so rewriting `assets/nina/_anchor.png` changes
>   nothing about any future photograph. Keep the write — it is cheap, and it is the seed for the
>   deferred consistent-face feature — but **delete the claim that it affects later generations**,
>   and do not let the operator believe re-anchoring has a present effect.
> - **A5 — one spelling** for the committed avatar path (`lib/nina/album.ts`).
> - **D4 — `scripts/blob-reap.mjs` still knows only `shots/`**, and this script is one of four
>   writers under `nina/`.


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R21 — "please create a skill here, `/update-nina-profpic <image_file_path>` … so i can
change nina's profpic anytime from local computer"
**Depends on:** Phase 1 (the `nina_avatars` table and `assets/nina/`), Phase 12 (the `nina/<userId>/`
blob convention). Phase 10's proactive entry point is consumed but is **not** a build dependency —
see §Interface Contract → Requires and §Handoffs.
**Difficulty:** NORMAL
**Package:** `scripts` (plus `.claude/skills/update-nina-profpic/`, `package.json`, one test)

---

## Goal

After this phase the operator can run one command on their laptop, hand it a path to an image, and
production shows that image as Nina's current avatar: the bytes are in Vercel Blob under the
`nina/<userId>/` prefix, a `nina_avatars` row is `is_current` (in the same transaction that
un-currents the previous one, so "two current" and "none current" are both unreachable),
`assets/nina/_anchor.png` in the working tree has been replaced from the same source image so every
later generation matches the new face (RU-16), and Nina has been poked to comment on the change in
character (RU-17). A bad path, a non-image, an animated image, a too-small image, a missing env var,
a missing migration or an empty database all fail **before** anything is written, and the whole thing
is a dry run unless `--apply` is passed.

This is an operator tool. It is not reachable from the app, it is not imported by the app, and
nothing in `app/`, `lib/` or `components/` changes.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing.

**Renames:** nothing.

**Creates:**

- `scripts/nina-profpic.mjs` — the operator script. Exported (and unit-tested) pure helpers:
  `parseArgs`, `assertUsableImage`, `fitInside`, `avatarPathname`, `newId`, `ALLOWED_FORMATS`,
  `NINA_BLOB_PREFIX`, `AVATAR_MAX_EDGE_PX`, `ANCHOR_MAX_EDGE_PX`, `AVATAR_QUALITY`,
  `MIN_SHORT_EDGE_PX`, `MAX_INPUT_BYTES`, `DEFAULT_APP_URL`, `USER_ID_RE`.
- `tests/nina.profpic.test.ts` — pure-unit coverage of those helpers, importing
  `@/scripts/nina-profpic.mjs` (the `tests/capture/dataset.test.ts` precedent for importing a
  `scripts/*.mjs` through the `@` alias).
- `.claude/skills/update-nina-profpic/SKILL.md` — the skill wrapper.
- `package.json` script `nina:profpic` (inserted at `package.json:31`, after `records:backfill`).
- `package.json` devDependency `"sharp": "0.35.3"` (inserted at `package.json:76`, before
  `tailwindcss`), plus the resulting `package-lock.json` churn.

**CLI signature (the contract the skill wraps):**

```
node --env-file=.env.local scripts/nina-profpic.mjs <image-path> [--apply] [--user <id>] [--app-url <url>]
npm run nina:profpic -- <image-path>            # dry run
npm run nina:profpic -- <image-path> --apply    # writes production
```

Exit codes: `0` success or clean dry run · `1` a refusal, or the RU-17 poke failed after production
was already updated · `2` usage or configuration error (bad flags, missing env var, unreadable file).
There is deliberately **no `--no-anchor` and no `--no-poke` flag**: RU-16 says it *always*
re-anchors and RU-17 says a hand-uploaded avatar *makes her speak*, so a flag to skip either would
be a flag to disobey a ruling.

**Environment variables read (all via `process.env`, from `--env-file=.env.local`):**

| Variable | Required | Why |
|---|---|---|
| `DATABASE_URL` | yes | the **pooled** Neon string, over the HTTP driver — DML only, exactly as `blob-reap.mjs`, `backfill-badge-run-ids.mjs`, `f04-e2e-probe.mjs` and `capture/seed-demo.mjs` all do. `DATABASE_URL_UNPOOLED` is drizzle-kit's, for DDL and studio sessions; this script issues no DDL and needs no session state, so using it would diverge from every peer script for nothing. |
| `BLOB_READ_WRITE_TOKEN` | yes | the avatar upload |
| `CRON_SECRET` | yes | the RU-17 poke at phase 10's entry point |

`lib/env.ts` is **not** imported and must not be: it opens with `import 'server-only'` and its own
header states that node scripts outside Next read `process.env` directly. Phase 1's validated env
object is therefore unavailable here, and the three variables above are validated by this script's
own pre-flight.

**Production resources written (only with `--apply`, and in this order):**

1. Vercel Blob object `nina/<userId>/avatar-<nanoid12>.jpg` (+ Blob's random suffix), `access:
   'public'`, `contentType: 'image/jpeg'`, `cacheControlMaxAge: 31_536_000`.
2. `nina_avatars` — one `UPDATE … set is_current = false where user_id = $1 and is_current` plus one
   `INSERT … is_current = true, source = 'operator', announced_at = null`, submitted as **one**
   `sql.transaction([…])` (the HTTP driver's non-interactive transaction: one round trip, atomic).
3. `GET <app-url>/api/cron/nina` with `Authorization: Bearer $CRON_SECRET` — phase 10's proactive
   entry point. Best-effort nudge only; the durable enqueue is the `announced_at is null` row.

**Working tree written (only with `--apply`):** `assets/nina/_anchor.png`, replaced in place
(written to `_anchor.png.tmp` then `renameSync`d, so the replacement is atomic). This is a
**committed repo file**, so the script prints the exact `git add`/`git commit` line and states that
until that commit is deployed, any runtime generation path that reads the committed anchor is still
looking at the old face.

**Requires (from earlier phases):**

- **Phase 1 — `nina_avatars` columns, exactly these names:** `id text pk`, `user_id text not null`
  (FK → `user.id` on delete cascade), `blob_url text not null`, `pathname text not null`,
  `width integer`, `height integer`, `bytes integer`, `source text not null`,
  `is_current boolean not null default false`, `announced_at timestamptz`,
  `created_at timestamptz not null default now()`. If phase 1 spells any of these differently, the
  only edits needed here are the two SQL statements in Step 1 §7 and the pre-flight read in §6.
- **Phase 1 — `source` accepts the literal `'operator'`** alongside whatever phases 12/13 write
  (`'generated'`, and `'seed'` if the promoted `nina.png` gets a row).
- **Phase 1 — ideally a partial unique index** `nina_avatars_user_current_unq on (user_id) where
  is_current` (the `shares_run_id_active_unq` precedent). It is not required for this script to be
  correct — the transaction already makes double-current unreachable — but it would make the
  invariant enforced rather than merely obeyed. Note that with such an index the transaction's
  statement **order** is load-bearing: un-current first, insert second.
- **Phase 1 — `assets/nina/` exists** in the tree (it promotes `nina.png` to
  `assets/nina/_anchor.png`). Pre-flight refuses if the directory is missing, naming phase 1.
- **Phase 12 — the blob prefix is `nina/<userId>/`** (RU-7). This script writes
  `nina/<userId>/avatar-<id>.jpg`. If phase 12 defines a narrower pathname shape (a regex, a
  `nina/<userId>/gen/` sub-prefix, a shared constant), `avatarPathname` here must be aligned to it
  and the collision-freedom argued in one place rather than two.
- **Phase 10 — `GET /api/cron/nina`, `CRON_SECRET` as a bearer header** (the
  `app/api/cron/rollup/route.ts` shape). If phase 10 chooses `POST`, or a different path, only the
  one `fetch` in Step 1 §9 changes.
- **Phase 10 or 13 — a trigger that announces an un-announced avatar.** The row this script writes
  is `source = 'operator'`, `is_current = true`, `announced_at is null`. Something must read
  "current avatar with `announced_at is null`", make Nina say something about it in character, and
  stamp `announced_at`. **This script deliberately does not compose her line and does not write a
  `nina_messages` row**, per the phase's scope. Phase 13 already owns "announce the swap" for the
  promise path; the operator path is the same shape with a different cause. See §Handoffs.

**Leaves alone (owned by others):**

- `lib/nina/*`, `app/**`, `components/**` — no app runtime change of any kind (phases 2–13).
- `lib/nina/imagegen.ts` and the generation path (phase 12). This script never calls OpenRouter and
  never generates; it only uploads what the operator handed it.
- `public/nina/avatar-001.png` (phase 1's committed first avatar / static fallback). Untouched — a
  fallback that changes with every profpic update is a fallback that has stopped being a constant.
- `scripts/blob-reap.mjs` (phase 14 adds a *new* blob prefix but does not teach the reaper about it
  — see §Handoffs).
- `lib/env.ts`, `.env.example` — no new variable is introduced; all three reads already exist in
  `.env.example`.
- `scripts/check-*.mjs` guards — every one of them scans `app/`, `lib/`, `components/` (verified:
  `check-openrouter-boundary.mjs:13`, `check-llm-payload-boundary.mjs:41,60`), so a new file under
  `scripts/` is outside all of them and none needs editing.

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-profpic.mjs` | create | the whole operator tool: validate → transform → upload → one transaction → re-anchor → poke |
| `tests/nina.profpic.test.ts` | create | pure units: `parseArgs`, `assertUsableImage`, `fitInside`, `avatarPathname` |
| `.claude/skills/update-nina-profpic/SKILL.md` | create | the skill wrapper: triggers, the env file it reads, the production resources it writes, the loop, the mistakes |
| `package.json` | modify | `nina:profpic` script at line 31; `"sharp": "0.35.3"` devDependency at line 76 |
| `package-lock.json` | modify | `sharp` flips from an optional transitive of `next` to a declared dev tree entry |

Five files, against the index's "~4" — the fifth is the unit test, which exists because
`parseArgs`/`assertUsableImage`/`fitInside` are the only parts of this script a test runner can
prove without writing to production.

## Implementation Steps

### Step 1: `scripts/nina-profpic.mjs`

**File:** `scripts/nina-profpic.mjs` (new file, whole contents below)

**Change:** the operator tool. Shape and invocation copied from `scripts/blob-reap.mjs` (dry by
default, `--apply`/`--delete` the only thing that writes, a configuration interlock that refuses
rather than proceeds, aligned two-column reporting) and `scripts/capture/seed-demo.mjs` (plain ESM
imports of `neon` and `@vercel/blob`, a local `newId` restated because `lib/id.ts` is TypeScript
behind the `@` alias, `REPO` resolved from `import.meta.url`).

Three structural notes on the code:

1. **`sharp` is imported lazily, inside `renderAvatar`/`renderAnchor`/`inspect`.** The pure helpers
   are exported for `tests/nina.profpic.test.ts`, and a top-level `import sharp from 'sharp'` would
   load a native addon on every `npm test`. A dynamic import inside the functions that need it keeps
   the default suite pure Node.
2. **Nothing runs on import.** `main()` is invoked only when the file is the process entry point, so
   Vitest can import it for the helpers without executing anything. `scripts/capture/dataset.mjs` is
   the precedent for a `scripts/` module a test imports; the guard is what lets this file be both.
3. **The whole transform happens before the `--apply` gate**, in memory. A dry run therefore proves
   sharp can actually decode and re-encode this file and prints real byte counts, while writing
   nothing anywhere.

**Code:**

```js
/**
 * Push a local image to production as Nina's current profile picture, and re-anchor her face.
 *
 *   node --env-file=.env.local scripts/nina-profpic.mjs ~/Pictures/nina-new.png            # dry run, always
 *   node --env-file=.env.local scripts/nina-profpic.mjs ~/Pictures/nina-new.png --apply
 *   npm run nina:profpic -- ~/Pictures/nina-new.png --apply
 *
 * Flags: --apply (write) · --user <id> (required only if the database holds more than one user)
 *        --app-url <url> (default https://runins.site; .env.local leaves AUTH_URL empty on purpose)
 *
 * NOT A TEST, and never part of `npm test`: it writes the real Blob store, the real database and
 * the working tree. Same line `scripts/blob-reap.mjs`, `scripts/backfill-badge-run-ids.mjs` and
 * `scripts/f04-e2e-probe.mjs` draw. F33 R21 / RU-16 / RU-17.
 *
 * ── WHAT IT WRITES, AND WHERE ─────────────────────────────────────────────────────────────────
 * PRODUCTION, with --apply and in this order:
 *   1. one Blob object at `nina/<userId>/avatar-<id>.jpg` (public, immutable, year-long cache)
 *   2. `nina_avatars`: the old current row un-currented and the new row inserted, in ONE
 *      transaction — see the transaction note below
 *   3. a poke at `GET /api/cron/nina` (bearer CRON_SECRET), phase 10's proactive entry point
 * WORKING TREE, with --apply:
 *   4. `assets/nina/_anchor.png`, replaced from the same source image (RU-16)
 * Nothing at all without --apply.
 *
 * ── WHY ONE TRANSACTION, AND WHY THE ORDER INSIDE IT MATTERS ──────────────────────────────────
 * Two statements, submitted as one non-interactive HTTP transaction: un-current the user's current
 * avatar, then insert the new one as current. A crash between two separate round trips is exactly
 * how she ends up with two current avatars (album renders twice, the chat picks whichever the
 * planner returned first) or none (a chat with a missing face). Neither state is repairable from
 * the app, and this script runs from a laptop on a hotel connection.
 *
 * The order is un-current FIRST. If phase 1 shipped the partial unique index
 * `nina_avatars_user_current_unq on (user_id) where is_current`, inserting first would violate it
 * inside the transaction; un-currenting first leaves zero current rows at the moment the insert
 * lands. Do not "simplify" this into one statement or reorder it.
 *
 * ── WHY IT ALWAYS RE-ANCHORS (RU-16) ──────────────────────────────────────────────────────────
 * `assets/nina/_anchor.png` is the face every later generation is matched against (phase 12, and
 * the `assets/badges/_anchor.png` convention it copies). A new profpic that did not replace the
 * anchor would mean the next generated image comes back as the PREVIOUS Nina — the app would
 * contradict its own avatar. So there is no flag to skip it.
 *
 * It is a COMMITTED file and this script runs locally, so the anchor half of the work is only
 * half-done when the script exits: the operator still has to commit and deploy. The script says so,
 * loudly, with the command. Production is already correct in the two places that are data (the blob
 * and the row); the anchor is correct in the tree and stale in the deployment until then.
 *
 * ── WHY IT DOES NOT WRITE HER LINE (RU-17) ────────────────────────────────────────────────────
 * The new row carries `source = 'operator'` and `announced_at = null`. That IS the enqueue: it is
 * durable, it survives a failed poke, and it leaves the choice of words entirely to `glm-5.3`
 * through phase 10's engine. A message row hand-written here would be a second author for Nina's
 * voice living in a laptop script — the one place nobody would think to look when she sounds wrong.
 *
 * ── THE INTERLOCKS, AND WHY EACH ONE EXISTS ───────────────────────────────────────────────────
 * This script writes production and has no undo button, so every check that can be made before the
 * first byte moves is made before the first byte moves:
 *
 *   - the three env vars, by name, or exit 2. A missing CRON_SECRET is a refusal and not a
 *     warning: RU-17 says a hand-uploaded avatar makes her speak, so a run that cannot reach her is
 *     not a successful run.
 *   - the path must be an existing regular file, under MAX_INPUT_BYTES.
 *   - sharp must decode it, the format must be in ALLOWED_FORMATS, it must not be animated, and
 *     its short edge must be at least MIN_SHORT_EDGE_PX. "Is it an image" is answered by a decoder,
 *     never by an extension: `nina.png` that is really a PDF must fail here, not at `put`.
 *   - SVG is refused by name even though sharp can rasterise it. A vector file is not a photograph
 *     of a face, and rasterising an arbitrary SVG is a render bomb hiding behind an avatar.
 *   - `assets/nina/` must exist and be writable BEFORE the upload, so that "the anchor could not be
 *     written" is a pre-flight refusal rather than a half-applied change.
 *   - the database must hold the user. Zero users is what a DATABASE_URL pointing at the wrong Neon
 *     branch looks like, and blob-reap's whole interlock section is about that failure being silent.
 *     More than one user means --user is required rather than guessed.
 *   - `nina_avatars` must exist. A 42P01 is reported as "phase 1's migration has not been applied
 *     to THIS database", because that is what it always means here.
 *
 * ── THE RESIZE, AND WHY IT DOES NOT CROP ──────────────────────────────────────────────────────
 * The avatar is fitted INSIDE 1600 px on the long edge and re-encoded as JPEG q88; it is never
 * cropped to a square and never upscaled. Phase 13 opens the avatar FULL SCREEN, so a square crop
 * applied here would permanently destroy the composition of the photograph the operator chose, to
 * serve a round 40 px thumbnail that CSS `object-fit: cover` already handles. Cropping is a display
 * concern; this is storage.
 *
 * The anchor is fitted inside 2048 px and kept as lossless PNG, matching `assets/badges/_anchor.png`
 * — it is a generation input, not a display asset, and a JPEG anchor would feed compression
 * artefacts into every future face.
 *
 * Both outputs are re-encoded from the source rather than copied, which also strips EXIF (sharp
 * drops metadata by default) after `.rotate()` has baked the orientation in. A phone photo that
 * arrives sideways therefore lands upright, and no GPS tag ships to a public blob.
 */
import { accessSync, constants, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { neon } from '@neondatabase/serverless'
import { put } from '@vercel/blob'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const ANCHOR_PATH = path.join(REPO, 'assets', 'nina', '_anchor.png')

/* ── Tunables. Every one of them is a decision the header argues for. ──────────────────────── */

/** Long edge of the stored avatar. Fitted inside, never cropped, never upscaled. */
export const AVATAR_MAX_EDGE_PX = 1600
/** JPEG quality for the stored avatar. */
export const AVATAR_QUALITY = 88
/** Long edge of `assets/nina/_anchor.png`. Lossless PNG — it is a generation input. */
export const ANCHOR_MAX_EDGE_PX = 2048
/** Below this on the SHORT edge there is not enough face to anchor a generation against. */
export const MIN_SHORT_EDGE_PX = 512
/** A sanity ceiling on the input, not a budget. `nina.png` is 6.4 MB at 1792x2400. */
export const MAX_INPUT_BYTES = 25_000_000
/** `BLOB_CACHE_MAX_AGE` from `lib/extract/constants.ts`, restated (TypeScript, `@` alias). */
export const BLOB_CACHE_MAX_AGE = 60 * 60 * 24 * 365
/** RU-7: every Nina blob lives under `nina/<userId>/`. Phase 12 owns this convention. */
export const NINA_BLOB_PREFIX = 'nina/'
/** `.env.local` leaves AUTH_URL empty on purpose (it is PRODUCTION ONLY), so this is a literal. */
export const DEFAULT_APP_URL = 'https://runins.site'

/** Decoders sharp is allowed to accept here. `svg` is refused by name in `assertUsableImage`. */
export const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff'])

/** A user id must be safe to put in a blob pathname. Auth.js ids are UUIDs; demo ids are `demo-*`. */
export const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_'

/**
 * `lib/id.ts` newId(12), reimplemented rather than imported: that module is TypeScript behind the
 * `@/` alias. Same reason `scripts/capture/seed-demo.mjs` carries its own copy.
 */
export function newId(size = 12) {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] & 63]
  return out
}

/* ── Pure helpers. These four are what `tests/nina.profpic.test.ts` proves. ────────────────── */

/**
 * Parse argv. Throws on anything ambiguous rather than picking a default, because every default
 * this script could pick would be a default that writes production.
 */
export function parseArgs(argv) {
  const flags = { apply: false, user: null, appUrl: DEFAULT_APP_URL }
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') {
      flags.apply = true
    } else if (arg === '--user') {
      const value = argv[++i]
      if (!value || value.startsWith('-')) throw new Error('--user needs a user id')
      flags.user = value
    } else if (arg === '--app-url') {
      const value = argv[++i]
      if (!value || value.startsWith('-')) throw new Error('--app-url needs a URL')
      flags.appUrl = value.replace(/\/+$/, '')
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown flag ${arg}`)
    } else {
      positional.push(arg)
    }
  }
  if (positional.length === 0) throw new Error(USAGE)
  if (positional.length > 1) {
    throw new Error(`one image at a time; got ${positional.length}: ${positional.join(', ')}`)
  }
  return { ...flags, imagePath: positional[0] }
}

export const USAGE =
  'usage: node --env-file=.env.local scripts/nina-profpic.mjs <image-path> ' +
  '[--apply] [--user <id>] [--app-url <url>]'

/**
 * The dimensions an image of `width` x `height` gets when fitted INSIDE a `maxEdge` box without
 * upscaling — sharp's `fit: 'inside', withoutEnlargement: true`, computed here so the dry run can
 * print the answer and the apply run can assert sharp agreed with it.
 *
 * sharp rounds internally and may land one pixel either side, so the assertion that uses this
 * allows +/-1 px. The property being checked is "the long edge came out at the target", not
 * "our arithmetic and libvips round identically".
 */
export function fitInside(width, height, maxEdge) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`fitInside: implausible source dimensions ${width}x${height}`)
  }
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new Error(`fitInside: implausible maxEdge ${maxEdge}`)
  }
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longEdge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Refuse anything that is not a usable photograph, with a message that says which rule it broke.
 * Takes a plain object so it is testable without a decoder: `{ format, width, height, pages, bytes }`.
 */
export function assertUsableImage(meta) {
  const { format, width, height, pages, bytes } = meta
  if (!format) {
    throw new Error('not an image: no decodable format (an extension is not evidence)')
  }
  if (format === 'svg') {
    throw new Error(
      'SVG is refused: a vector file is not a photograph of a face, and rasterising an ' +
        'arbitrary one is a render bomb behind an avatar',
    )
  }
  if (!ALLOWED_FORMATS.has(format)) {
    throw new Error(
      `unsupported format "${format}" — accepted: ${[...ALLOWED_FORMATS].sort().join(', ')}`,
    )
  }
  if (typeof pages === 'number' && pages > 1) {
    throw new Error(`animated image (${pages} frames): export a single still frame first`)
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error(`implausible dimensions ${width}x${height}`)
  }
  if (Math.min(width, height) < MIN_SHORT_EDGE_PX) {
    throw new Error(
      `${width}x${height} is too small: the short edge must be at least ${MIN_SHORT_EDGE_PX} px, ` +
        'or the anchor cannot carry a face',
    )
  }
  if (Number.isFinite(bytes) && bytes > MAX_INPUT_BYTES) {
    throw new Error(
      `${(bytes / 1e6).toFixed(1)} MB exceeds the ${(MAX_INPUT_BYTES / 1e6).toFixed(0)} MB ceiling`,
    )
  }
}

/** RU-7's pathname. The id is generated locally so the whole transaction can be composed up front. */
export function avatarPathname(userId, id) {
  if (!USER_ID_RE.test(userId)) throw new Error(`refusing to build a blob path from "${userId}"`)
  if (!USER_ID_RE.test(id)) throw new Error(`refusing to build a blob path from "${id}"`)
  return `${NINA_BLOB_PREFIX}${userId}/avatar-${id}.jpg`
}

/* ── The sharp half. Lazily imported so `npm test` never loads a native addon. ─────────────── */

async function inspect(bytes) {
  const { default: sharp } = await import('sharp')
  try {
    const meta = await sharp(bytes).metadata()
    return { format: meta.format, width: meta.width, height: meta.height, pages: meta.pages }
  } catch (error) {
    throw new Error(`sharp could not decode this file: ${error.message}`)
  }
}

async function renderAvatar(bytes) {
  const { default: sharp } = await import('sharp')
  const out = await sharp(bytes)
    .rotate()
    .resize({
      width: AVATAR_MAX_EDGE_PX,
      height: AVATAR_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: AVATAR_QUALITY, progressive: true })
    .toBuffer({ resolveWithObject: true })
  return { bytes: out.data, width: out.info.width, height: out.info.height }
}

async function renderAnchor(bytes) {
  const { default: sharp } = await import('sharp')
  const out = await sharp(bytes)
    .rotate()
    .resize({
      width: ANCHOR_MAX_EDGE_PX,
      height: ANCHOR_MAX_EDGE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true })
  return { bytes: out.data, width: out.info.width, height: out.info.height }
}

/** The QA assertion behind `fitInside`: sharp's answer must be ours, within a pixel. */
function assertLandedOnTarget(label, source, actual, maxEdge) {
  const want = fitInside(source.width, source.height, maxEdge)
  if (Math.abs(actual.width - want.width) > 1 || Math.abs(actual.height - want.height) > 1) {
    throw new Error(
      `${label}: sharp returned ${actual.width}x${actual.height}, expected ` +
        `${want.width}x${want.height} from ${source.width}x${source.height} @ ${maxEdge}`,
    )
  }
}

/* ── Reporting ─────────────────────────────────────────────────────────────────────────────── */

const kb = (n) => `${(n / 1000).toFixed(0)} KB`
const line = (label, value) => console.log(`${label.padEnd(20)} ${value}`)

/* ── main ──────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  /* 1. flags */
  let flags
  try {
    flags = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }

  /* 2. env, by name, before anything else */
  const missing = ['DATABASE_URL', 'BLOB_READ_WRITE_TOKEN', 'CRON_SECRET'].filter(
    (name) => !process.env[name],
  )
  if (missing.length > 0) {
    console.error(
      `missing ${missing.join(', ')} — run with --env-file=.env.local.\n` +
        'CRON_SECRET is required, not optional: RU-17 says a hand-uploaded avatar makes Nina\n' +
        'speak, so a run that cannot reach her proactive entry point is not a successful run.',
    )
    process.exit(2)
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const sql = neon(process.env.DATABASE_URL)

  /* 3. the file */
  const imagePath = path.resolve(process.cwd(), flags.imagePath)
  let stat
  try {
    stat = statSync(imagePath)
  } catch {
    console.error(`no such file: ${imagePath}`)
    process.exit(2)
  }
  if (!stat.isFile()) {
    console.error(`not a regular file: ${imagePath}`)
    process.exit(2)
  }
  const sourceBytes = readFileSync(imagePath)

  /* 4. is it really an image */
  let meta
  try {
    meta = await inspect(sourceBytes)
    assertUsableImage({ ...meta, bytes: stat.size })
  } catch (error) {
    console.error(`REFUSING ${imagePath}\n  ${error.message}`)
    process.exit(2)
  }

  /* 5. can the anchor be replaced at all — asked BEFORE anything is uploaded */
  try {
    accessSync(path.dirname(ANCHOR_PATH), constants.W_OK)
  } catch {
    console.error(
      `cannot write ${path.dirname(ANCHOR_PATH)} — phase 1 promotes nina.png to\n` +
        'assets/nina/_anchor.png; without that directory RU-16 cannot be honoured, and a\n' +
        'profpic update that does not re-anchor makes the next generated image the OLD face.',
    )
    process.exit(2)
  }

  /* 6. the user, and the wrong-database interlock */
  const users = flags.user
    ? await sql`select id, email from "user" where id = ${flags.user}`
    : await sql`select id, email from "user" order by id`
  if (flags.user && users.length === 0) {
    console.error(`no user ${flags.user} in this database`)
    process.exit(1)
  }
  if (users.length === 0) {
    console.error(
      'REFUSING: this database holds no users at all.\n' +
        'That is what a DATABASE_URL pointing at the wrong Neon branch looks like — the same\n' +
        'failure scripts/blob-reap.mjs interlocks against. Fix the connection.',
    )
    process.exit(1)
  }
  if (users.length > 1) {
    console.error(
      `this database holds ${users.length} users; pass --user <id>:\n` +
        users.map((u) => `  ${u.id}  ${u.email ?? '(no email)'}`).join('\n'),
    )
    process.exit(2)
  }
  const user = users[0]

  let avatars
  try {
    avatars = await sql`
      select id, pathname, is_current, announced_at, created_at
      from nina_avatars
      where user_id = ${user.id}
      order by created_at desc
    `
  } catch (error) {
    if (error?.code === '42P01') {
      console.error(
        'REFUSING: there is no nina_avatars table in this database.\n' +
          "Phase 1's migration has not been applied here. Run `npm run db:migrate` against it.",
      )
      process.exit(1)
    }
    throw error
  }
  const current = avatars.find((row) => row.is_current)

  /* 7. transform. Writes nothing; a dry run proves the pipeline and prints real byte counts. */
  const avatar = await renderAvatar(sourceBytes)
  assertLandedOnTarget('avatar', meta, avatar, AVATAR_MAX_EDGE_PX)
  const anchor = await renderAnchor(sourceBytes)
  assertLandedOnTarget('anchor', meta, anchor, ANCHOR_MAX_EDGE_PX)

  const avatarId = newId()
  const pathname = avatarPathname(user.id, avatarId)

  line('source', `${imagePath}`)
  line('', `${meta.format} ${meta.width}x${meta.height}, ${kb(stat.size)}`)
  line('user', `${user.id}  ${user.email ?? '(no email)'}`)
  line('avatars on record', `${avatars.length}`)
  line('current avatar', current ? current.pathname : '(none)')
  if (avatars.length === 0) {
    line('', 'WARN no avatar rows at all — expected at least the seeded first one')
  }
  console.log('')
  line('will upload', `${pathname} (+ random suffix)`)
  line('', `jpeg q${AVATAR_QUALITY} ${avatar.width}x${avatar.height}, ${kb(avatar.bytes.length)}`)
  line('will re-anchor', path.relative(REPO, ANCHOR_PATH))
  line('', `png ${anchor.width}x${anchor.height}, ${kb(anchor.bytes.length)}`)
  line('will insert', `nina_avatars ${avatarId} source=operator is_current=true`)
  line('will un-current', current ? current.id : '(nothing)')
  line('will poke', `${flags.appUrl}/api/cron/nina`)
  console.log('')

  if (!flags.apply) {
    console.log('DRY RUN — nothing uploaded, nothing written, no file touched.')
    console.log('Re-run with --apply once the lines above are what you meant.')
    process.exit(0)
  }

  /* 8. production: the blob, then the one transaction */
  const blob = await put(pathname, avatar.bytes, {
    access: 'public',
    token,
    addRandomSuffix: true,
    allowOverwrite: false,
    contentType: 'image/jpeg',
    cacheControlMaxAge: BLOB_CACHE_MAX_AGE,
  })
  line('uploaded', blob.pathname)

  const [, inserted] = await sql.transaction([
    sql`
      update nina_avatars set is_current = false
      where user_id = ${user.id} and is_current = true
    `,
    sql`
      insert into nina_avatars
        (id, user_id, blob_url, pathname, width, height, bytes, source, is_current, announced_at)
      values
        (${avatarId}, ${user.id}, ${blob.url}, ${blob.pathname}, ${avatar.width},
         ${avatar.height}, ${avatar.bytes.length}, 'operator', true, null)
      returning id, created_at
    `,
  ])
  line('nina_avatars', `${inserted[0].id} is_current, announced_at null`)

  /* 9. the working tree, atomically */
  const tmp = `${ANCHOR_PATH}.tmp`
  try {
    writeFileSync(tmp, anchor.bytes)
    renameSync(tmp, ANCHOR_PATH)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      /* nothing to clean up */
    }
    console.error(`\nFAILED to write ${ANCHOR_PATH}: ${error.message}`)
    console.error('Production IS updated. Re-run this script to retry the anchor.')
    process.exit(1)
  }
  line('re-anchored', path.relative(REPO, ANCHOR_PATH))

  /* 10. RU-17: poke phase 10's entry point. The durable enqueue is already in the row. */
  let poked = false
  try {
    const res = await fetch(`${flags.appUrl}/api/cron/nina`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: AbortSignal.timeout(65_000),
    })
    poked = res.ok
    line('poked', `${res.status} ${res.ok ? 'ok' : await res.text().catch(() => '')}`)
  } catch (error) {
    line('poked', `FAILED ${error.message}`)
  }

  console.log('')
  console.log('DONE. Production shows the new avatar; the previous one is still in the album.')
  console.log('COMMIT THE ANCHOR — it is a repo file, and until it is deployed any generation')
  console.log('path that reads the committed anchor is still matching the OLD face:')
  console.log(
    `    git add ${path.relative(REPO, ANCHOR_PATH)} && ` +
      `git commit -m "chore(nina): re-anchor from ${path.basename(imagePath)}"`,
  )
  if (!poked) {
    console.error('')
    console.error('The proactive poke did not land. The avatar row is announced_at NULL, so the')
    console.error('next cron tick still makes her mention it — nothing is lost, but she is quiet')
    console.error('until then. Exiting 1 so this is not mistaken for a clean run.')
    process.exit(1)
  }
}

/* Run only as the process entry point, so `tests/nina.profpic.test.ts` can import the helpers
 * above without executing any of this. `scripts/capture/dataset.mjs` is the precedent for a
 * scripts/ module a test imports; the guard is what lets this file be both. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
```

**Impact:** a new operator entry point. Nothing imports it; nothing in the app changes. `sharp` and
`@vercel/blob`'s `put` are the only new runtime surfaces touched, both already resolved in the lock.

---

### Step 2: the unit test

**File:** `tests/nina.profpic.test.ts` (new file)

**Change:** prove the parts that a test runner can prove. Everything else in this script is a write
to production and is verified by running it once — said plainly in §Verification.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_FORMATS,
  ANCHOR_MAX_EDGE_PX,
  AVATAR_MAX_EDGE_PX,
  MIN_SHORT_EDGE_PX,
  NINA_BLOB_PREFIX,
  assertUsableImage,
  avatarPathname,
  fitInside,
  parseArgs,
} from '@/scripts/nina-profpic.mjs'

/**
 * The three pure halves of `scripts/nina-profpic.mjs`: what it will accept, what size it will
 * produce, and where it will put it. The upload, the transaction and the poke are not testable
 * without writing production — see the phase plan's Verification section, which says so rather
 * than pretending otherwise.
 */

describe('parseArgs', () => {
  it('takes one path and defaults to a dry run', () => {
    const args = parseArgs(['/tmp/nina.png'])
    expect(args.imagePath).toBe('/tmp/nina.png')
    expect(args.apply).toBe(false)
    expect(args.user).toBeNull()
    expect(args.appUrl).toBe('https://runins.site')
  })

  it('reads --apply, --user and --app-url in any order', () => {
    const args = parseArgs(['--user', 'u1', '/tmp/n.png', '--app-url', 'http://x.test/', '--apply'])
    expect(args).toEqual({
      apply: true,
      user: 'u1',
      appUrl: 'http://x.test',
      imagePath: '/tmp/n.png',
    })
  })

  it('refuses no path, two paths, an unknown flag and a valueless flag', () => {
    expect(() => parseArgs([])).toThrow(/usage/)
    expect(() => parseArgs(['a.png', 'b.png'])).toThrow(/one image at a time/)
    expect(() => parseArgs(['a.png', '--force'])).toThrow(/unknown flag --force/)
    expect(() => parseArgs(['a.png', '--user'])).toThrow(/--user needs a user id/)
    expect(() => parseArgs(['a.png', '--user', '--apply'])).toThrow(/--user needs a user id/)
  })
})

describe('assertUsableImage', () => {
  const ok = { format: 'png', width: 1792, height: 2400, pages: 1, bytes: 6_400_000 }

  it('accepts a real photograph', () => {
    expect(() => assertUsableImage(ok)).not.toThrow()
  })

  it('refuses a file no decoder recognised', () => {
    expect(() => assertUsableImage({ ...ok, format: undefined })).toThrow(/not an image/)
  })

  it('refuses SVG by name, not by allow-list accident', () => {
    expect(() => assertUsableImage({ ...ok, format: 'svg' })).toThrow(/SVG is refused/)
    expect(ALLOWED_FORMATS.has('svg')).toBe(false)
  })

  it('refuses an unlisted format', () => {
    expect(() => assertUsableImage({ ...ok, format: 'pdf' })).toThrow(/unsupported format "pdf"/)
  })

  it('refuses an animated image', () => {
    expect(() => assertUsableImage({ ...ok, format: 'webp', pages: 12 })).toThrow(/animated/)
  })

  it('refuses anything whose short edge is under the floor', () => {
    const short = MIN_SHORT_EDGE_PX - 1
    expect(() => assertUsableImage({ ...ok, width: short, height: 4000 })).toThrow(/too small/)
    expect(() =>
      assertUsableImage({ ...ok, width: 4000, height: MIN_SHORT_EDGE_PX }),
    ).not.toThrow()
  })

  it('refuses an absurd input size', () => {
    expect(() => assertUsableImage({ ...ok, bytes: 40_000_000 })).toThrow(/ceiling/)
  })
})

describe('fitInside', () => {
  it("puts the long edge on the target and keeps the aspect ratio", () => {
    expect(fitInside(1792, 2400, AVATAR_MAX_EDGE_PX)).toEqual({ width: 1195, height: 1600 })
    expect(fitInside(2400, 1792, AVATAR_MAX_EDGE_PX)).toEqual({ width: 1600, height: 1195 })
  })

  it('never upscales', () => {
    expect(fitInside(800, 600, AVATAR_MAX_EDGE_PX)).toEqual({ width: 800, height: 600 })
    expect(fitInside(1792, 2400, ANCHOR_MAX_EDGE_PX)).toEqual({ width: 1529, height: 2048 })
  })

  it('refuses implausible input', () => {
    expect(() => fitInside(0, 10, 100)).toThrow(/implausible source dimensions/)
    expect(() => fitInside(10, 10, 0)).toThrow(/implausible maxEdge/)
  })
})

describe('avatarPathname', () => {
  it('writes under the RU-7 prefix, keyed by user', () => {
    expect(avatarPathname('e6f1a0c2-1111-4222-8333-444455556666', 'Ab3-_9xYz012')).toBe(
      `${NINA_BLOB_PREFIX}e6f1a0c2-1111-4222-8333-444455556666/avatar-Ab3-_9xYz012.jpg`,
    )
  })

  it('refuses to build a path out of anything that could traverse', () => {
    expect(() => avatarPathname('../../etc', 'Ab3-_9xYz012')).toThrow(/refusing to build/)
    expect(() => avatarPathname('u1', 'a/b')).toThrow(/refusing to build/)
  })
})
```

**Impact:** `npm test` gains ~15 assertions and loads no native addon (sharp is imported lazily
inside the functions the test does not call).

---

### Step 3: `package.json` — the script and the dependency

**File:** `package.json:31` (the new script) and `package.json:76` (the dependency)

**Change:** two insertions, nothing else.

**Code** — after line 30 (`"records:backfill": …`) and before line 31 (`"capture:seed": …`):

```json
    "nina:profpic": "node --env-file=.env.local scripts/nina-profpic.mjs",
```

**Code** — in `devDependencies`, after line 75 (`"prettier-plugin-tailwindcss": "0.8.1",`) and
before line 76 (`"tailwindcss": "4.3.3",`), keeping the alphabetical order and the exact pin every
other entry uses:

```json
    "sharp": "0.35.3",
```

Then:

```bash
npm install
```

`sharp@0.35.3` is already in `package-lock.json:8585` as an **optional transitive** of `next`
(Next's image optimizer), so this declares what is already resolved rather than adding a download:
the lock entry loses `"optional": true` and gains the dev tree. Verified present on disk in the
primary checkout at `node_modules/sharp` (0.35.3). A `devDependency` and not a `dependency` because
nothing the app ships imports it — `next` pulls its own copy for the image optimizer, and a
production `npm ci --omit=dev` must not start depending on this line.

**Impact:** `npm run nina:profpic -- <path>` works; `package-lock.json` changes. No app code path
changes.

---

### Step 4: `.claude/skills/update-nina-profpic/SKILL.md`

**File:** `.claude/skills/update-nina-profpic/SKILL.md` (new file, whole contents below)

**Change:** the skill wrapper. Frontmatter shape and description style copied from
`.claude/skills/reap-orphaned-blobs/SKILL.md` (one `name`, one `description` that front-loads what
it does and then lists the phrasings that should trigger it) — and, like that skill, it **wraps the
script and does not reimplement any of its logic**.

**Code:**

```markdown
---
name: update-nina-profpic
description: Replace Nina's profile picture in production from a local image file, for Run Insights. Use when handed an image and asked to change, update or replace Nina's profpic, profile picture, avatar or face — e.g. "/update-nina-profpic ~/Pictures/nina2.png", "make this Nina's new profile picture", "change nina's profpic to this", "use this photo as her face from now on", "re-anchor Nina's face", "her avatar is wrong, here's a better one". Uploads the image to Vercel Blob, flips the current avatar row, replaces the committed face anchor so later generations match, and makes her comment on the change. Writes production; dry-runs by default.
---

# Update Nina's profile picture

One local image file becomes, in production: her current avatar, the new face anchor for every
image she generates afterwards, and something she brings up in the chat unprompted.

## Read this before you run it

**It writes production and there is no undo.** Everything it touches, exactly:

| Where | What | When |
|---|---|---|
| Vercel Blob | one new object at `nina/<userId>/avatar-<id>.jpg`, public, immutable | `--apply` |
| Neon (`nina_avatars`) | the current row un-currented, one new row inserted as current, in **one** transaction | `--apply` |
| The app | `GET /api/cron/nina` with the cron bearer — the poke that makes her speak | `--apply` |
| Working tree | `assets/nina/_anchor.png` replaced from the same source image (RU-16) | `--apply` |
| Nothing | — | without `--apply` |

**The env file is `.env.local`**, read by node's own `--env-file`, and the three variables it needs
from there are `DATABASE_URL` (pooled), `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET`. All three are
already in `.env.example`; none is new. The script refuses, by name, before touching anything if one
is missing. It does **not** import `lib/env.ts` — that module is `server-only` and unimportable from
a plain node script.

**It does not delete the old avatar.** The previous blob and row stay exactly where they were, which
is what keeps them in her album (phase 13). Nothing here is a cleanup step.

## The loop

### 1. Dry run first, always

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png
# or: node --env-file=.env.local scripts/nina-profpic.mjs ~/Pictures/nina-new.png
```

Flags go after `--`. The script is dry by default; `--apply` is the only thing that writes
anything. The dry run does the full decode and re-encode in memory, so its byte counts and
dimensions are real, not predicted.

### 2. Read the plan it printed

Check four lines before going further:

- **`source`** — the format and dimensions it actually decoded. If this is not the picture you
  meant, stop.
- **`user`** — the account whose avatar changes. On a database with more than one user the script
  refuses and asks for `--user <id>` rather than guessing.
- **`current avatar`** — the one being replaced. `(none)` plus a `WARN no avatar rows at all` is
  worth pausing on: phase 1 seeds her first avatar, so zero rows suggests you are pointed at the
  wrong database.
- **`will upload`** — the resized avatar's dimensions. It is fitted inside 1600 px and **never
  cropped to a square**, because phase 13 opens the avatar full-screen; the round thumbnail is
  CSS's job.

### 3. Apply

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png --apply
```

Order of operations is blob → transaction → anchor file → poke. The `nina_avatars` update and
insert are a single transaction, so she can never end up with two current avatars or none.

### 4. Commit the anchor

The script prints the command. Run it.

```bash
git add assets/nina/_anchor.png && git commit -m "chore(nina): re-anchor from nina-new.png"
```

**This is the half that is not done when the script exits.** The blob and the row are production
data and are live immediately; the anchor is a **committed repo file**, so until that commit is
deployed, any generation path that reads the committed anchor is still matching the old face. A
profpic update left uncommitted is how Nina's next generated photo comes back as the previous Nina.

### 5. Verify

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png            # a fresh dry run
```

`current avatar` should now name the object you just uploaded, and `avatars on record` should have
gone up by one. Then open `/nina` and `/nina/about`: the chat header shows the new face, and the
album still holds the previous one.

## Refusals, and what each one means

| It says | It means |
|---|---|
| `missing DATABASE_URL, …` | you did not pass `--env-file=.env.local` (or the variable is blank) |
| `not an image: no decodable format` | the extension lied; no decoder could read the bytes |
| `SVG is refused` | a vector file is not a photograph of a face — export a raster still |
| `animated image (N frames)` | a GIF/animated WebP; export one frame first |
| `NxM is too small` | the short edge is under 512 px; there is not enough face to anchor against |
| `cannot write .../assets/nina` | phase 1's anchor promotion has not landed in this tree |
| `there is no nina_avatars table` | the Nina migration is not applied to **this** database |
| `this database holds no users at all` | `DATABASE_URL` points at the wrong Neon branch — fix the connection, do not work around it |
| `this database holds N users` | pass `--user <id>`; the script will not pick for you |
| `The proactive poke did not land` | production **is** updated; she is just quiet until the next cron tick, since the row is still `announced_at NULL` |

Exit codes: `0` success or clean dry run · `1` a refusal, or the poke failed after production was
already updated · `2` usage or configuration error.

## Common mistakes

| Mistake | What happens |
|---|---|
| Running with `--apply` before reading the dry run | you upload the wrong picture to production, permanently |
| Forgetting to commit `assets/nina/_anchor.png` | her next generated photo is the OLD face |
| Cropping the image square first "to help" | you throw away the full-screen photo phase 13 renders; the script fits inside and never crops |
| Passing a screenshot or a thumbnail | refused under 512 px, and a poor anchor even at 600 |
| Reaching for `--user` on a one-user database | you do not need it, and a typo'd id updates nobody |
| Expecting the old avatar to be cleaned up | it is deliberately kept; it is her album |
| Editing `public/nina/avatar-001.png` to match | that is the committed static fallback and is not this skill's business |

## What it deliberately does not do

- **It does not write her message.** The new row is `source = 'operator'`, `announced_at = null`;
  phase 10's proactive engine chooses the words. A line written in a laptop script would be a second
  author for Nina's voice in the one place nobody would look when she sounds wrong.
- **It does not generate anything.** No OpenRouter, no Qwen. It uploads the file you gave it.
- **It does not touch `shots/` or the chat images.** Only the one new object under `nina/<userId>/`.
```

**Impact:** a third skill in `.claude/skills/`. No code depends on it.

## Verification

**Build:** `npm run typecheck && npm run lint && npm run format:check`

- `typecheck` — `scripts/*.mjs` is not in `tsconfig`'s program, but `tests/nina.profpic.test.ts` is,
  and it imports the `.mjs` through the `@` alias exactly as `tests/capture/dataset.test.ts` does.
  If TypeScript objects to the untyped `.mjs` import, match whatever `tests/capture/dataset.test.ts`
  relies on (`allowJs`/implicit-any settings in `tsconfig.json`) rather than adding a `.d.ts`.
- `lint` — `scripts/` is **not** in eslint's `globalIgnores` (only `.next`, `out`, `build`,
  `drizzle`, `next-env.d.ts`, `scaffold-tmp`, `research`, `public/vendor`), so this file is linted.
- `format:check` — `scripts/` is not in `.prettierignore` either. The file must be Prettier-clean at
  `printWidth: 100`, `semi: false`, `singleQuote: true`, `trailingComma: "all"`. Run
  `npm run format` once after writing it; in particular the long `node:fs` import line above will be
  wrapped by Prettier.

**Tests:** `npm test` (the new `tests/nina.profpic.test.ts` must pass, and nothing else may change)

**Guards:** `npm run ci:openrouter-guard && npm run ci:llm-payload-guard && npm run ci:data-layer-guard && npm run ci:client-secret-guard && npm run ci:f08-guard && npm run ci:f11-guard`
— all six must still pass. None of them scans `scripts/` (`check-openrouter-boundary.mjs:13` and
`check-llm-payload-boundary.mjs:41,60` both walk `app`, `lib`, `components` only), so this is a
regression check, not a new rule.

**Manual check — and be honest about the split.** What is provable by the suite is exactly the four
pure helpers: which files are accepted, the resize arithmetic, the argument grammar, the blob
pathname. What is **not** provable without writing production is everything that matters most: that
`put` lands under the right prefix, that `sql.transaction` is atomic against the real schema
(including whether phase 1 spelled the columns the way this plan assumed), that phase 10's route
accepts the poke, and that the app then renders the new face. The transaction's *SQL shape* can be
eyeballed against `lib/db/schema.ts` and dry-run with `explain` by hand; its *atomicity* is a
property of the driver, already relied on by nothing else in this repo, and is verified by reading
the two statements rather than by a test.

So it gets verified **once, deliberately, against production, with a throwaway image**:

1. `npm run nina:profpic -- /tmp/throwaway.jpg` — read every line of the plan.
2. `npm run nina:profpic -- /tmp/throwaway.jpg --apply`.
3. Open `/nina` — the header avatar is the throwaway. Open `/nina/about` — the album holds the
   previous one, and the throwaway is current.
4. `select id, pathname, is_current, source, announced_at from nina_avatars order by created_at desc`
   — exactly one `is_current`, the newest, `source = 'operator'`.
5. Wait for (or trigger) Nina's next turn — she mentions the new picture, unprompted, in character.
6. `git diff --stat assets/nina/_anchor.png` — replaced.
7. **Then run it again with the real intended image**, and commit that anchor. The throwaway stays
   in the album, which is a slightly odd but harmless artefact of having tested honestly; delete its
   row and blob by hand if it bothers you.
8. Exercise two refusals on purpose, since they are the whole safety argument:
   `npm run nina:profpic -- package.json` (not an image) and
   `DATABASE_URL=postgres://…/an-empty-branch npm run nina:profpic -- /tmp/throwaway.jpg` (the
   wrong-database interlock). Both must exit non-zero having written nothing.

**Exit criteria:** `npm run nina:profpic -- <path> --apply` leaves production showing that image as
Nina's current avatar with the previous one still in the album, `assets/nina/_anchor.png` replaced
in the working tree with the commit command printed, and a `nina_avatars` row that is
`announced_at NULL` so she comments on it in character; a bad path, a non-image, an animated image,
a too-small image, a missing env var, a missing migration or an empty database each fail before
anything is written; and `SKILL.md` names `.env.local` and lists the three production resources it
writes.

## Handoffs

- **Phase 1 — the columns and the index.** `nina_avatars` must carry `source text not null` (the
  literal `'operator'` is written here) and `announced_at timestamptz`. The partial unique index
  `nina_avatars_user_current_unq on (user_id) where is_current` is wanted but not required. Left to
  phase 1; flagged in §Interface Contract → Requires so the reconciler can place it.
- **Phase 10 (or 13) — the fifth trigger.** RU-15's four triggers do not include "the operator
  changed her face". Something must select the current avatar with `announced_at is null`, make her
  say something about it, and stamp `announced_at`. This phase writes the row and pokes the entry
  point; it deliberately writes no `nina_messages` row and composes no line, so **without that
  trigger, RU-17 is only half-delivered by this phase's own work**. That is the single most
  important thing for the reconciler to resolve, and it serves R3, not R21, which is why it is not
  a step here.
- **Phase 12 — the pathname convention.** If phase 12 introduces a shared constant or a regex for
  `nina/<userId>/…`, `avatarPathname` here should be aligned to it (restated, since a `.mjs` script
  cannot import a TypeScript constant — the same wall `seed-demo.mjs` documents for `newId`), and
  the two prefixes must be argued as collision-free in one place.
- **Phase 12/13 — blob liveness for the `nina/` prefix.** `scripts/blob-reap.mjs` only reaps
  `shots/` and reports everything else as `elsewhere — never touched`, so a `nina/` blob orphaned by
  a transaction that failed after `put` succeeded is harmless but permanent. Teaching the reaper the
  `nina/` prefix means teaching it the reference sites (`nina_avatars.blob_url`/`pathname`,
  `nina_message_images`), which belong to phases 12 and 13. Its own skill doc is explicit that the
  prefix must not be added before its reference sites are, so **not** doing it here is the correct
  call, not an omission.
- **Not done, on purpose:** `public/nina/avatar-001.png` is left alone; no `.env.example` or
  `lib/env.ts` change; no `--no-anchor`/`--no-poke` escape hatches (RU-16 and RU-17 say "always");
  no square crop; no deletion of the superseded avatar.

## Rollback

Self-contained, because nothing imports any of it:

```bash
git rm scripts/nina-profpic.mjs tests/nina.profpic.test.ts
git rm -r .claude/skills/update-nina-profpic
# revert the two package.json insertions (the nina:profpic script, the sharp devDependency)
npm install       # returns sharp to an optional transitive of next in the lock
```

The tree builds and the suite passes with the phase absent — nothing else in the plan set depends on
it. What a revert does **not** undo is any run of the script that already happened: the blob, the
`nina_avatars` row and the replaced anchor are data, not code. To undo one of those, un-current the
new row and re-current the previous one in a single transaction (the script's own two statements,
reversed), `git checkout assets/nina/_anchor.png`, and leave the blob — it is 200-400 KB and
deleting it would break the album entry that still points at it.
