/**
 * Push a local image to production as Nina's current profile picture, and re-seed her face anchor.
 *
 *   npm run nina:profpic -- ~/Pictures/nina-new.png            # dry run, always
 *   npm run nina:profpic -- ~/Pictures/nina-new.png --apply
 *
 * The bare form needs the same two node flags the `npm` script carries, because this file imports
 * three TypeScript modules (see THE IMPORTS below):
 *
 *   node --experimental-strip-types --no-warnings --env-file=.env.local \
 *     scripts/nina-profpic.mjs ~/Pictures/nina-new.png --apply
 *
 * Flags: --apply (write) · --user <id> (required only if the database holds more than one user)
 *        --app-url <url> (default https://runins.site; .env.local leaves AUTH_URL empty on
 *        purpose) · --description "<prose>" (what the photo shows — see THE DESCRIPTION below)
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
 *   4. `assets/nina/_anchor.png`, replaced from the same source image
 * Nothing at all without --apply.
 *
 * ── THE IMPORTS, AND WHY THEY ARE `.ts` (RULING A6) ───────────────────────────────────────────
 * The blob prefix, the stored-pathname regex and the id alphabet each have exactly one definition
 * in this repo, and this script reaches all three rather than restating them. That is possible
 * because `node --experimental-strip-types` runs a `.ts` import from a `.mjs` file — the standing
 * precedent is `scripts/nina-image-worker.ts:62`, which imports `../lib/id.ts` the same way, and
 * `lib/nina/images.ts`'s own header names this script as one of its three cross-phase consumers.
 * The real wall is `lib/env.ts` being `server-only` AND alias-imported, not `.ts` in general; so
 * the three variables below are read from `process.env` and validated by this script's pre-flight.
 *
 * Both imported modules are deliberately zero-import, and must stay that way: a `.mjs` importing a
 * `.ts` that in turn imports `@/lib/...` breaks at RUNTIME rather than at `tsc`.
 *
 * ── WHY ONE TRANSACTION, AND WHY THE ORDER INSIDE IT MATTERS ──────────────────────────────────
 * Two statements, submitted as one non-interactive HTTP transaction: un-current the user's current
 * avatar, then insert the new one as current. A crash between two separate round trips is exactly
 * how she ends up with two current avatars (album renders twice, the chat picks whichever the
 * planner returned first) or none (a chat with a missing face). Neither state is repairable from
 * the app, and this script runs from a laptop on a hotel connection.
 *
 * The order is un-current FIRST, and that is not stylistic: phase 1 shipped the partial unique
 * index `nina_avatars_user_current_unq on (user_id) where is_current` (`lib/db/schema.ts`), so
 * inserting first violates it inside the transaction. Un-currenting first leaves zero current rows
 * at the moment the insert lands. Do not "simplify" this into one statement or reorder it.
 *
 * ── WHY IT STILL RE-ANCHORS, AND WHAT THAT IS WORTH NOW (RU-16 UNDER RU-18) ───────────────────
 * `assets/nina/_anchor.png` was going to be the reference image every generated photograph was
 * matched against. **RU-18 dropped that.** Phase 12 sends no `input_references` at all, and
 * `lib/nina/imagerecipe.ts` says so in as many words: the anchor is "committed by phase 1 and read
 * by nothing". The reference call measured 148.9 s against 78.2 s and the user chose successful
 * generation over face fidelity, knowingly.
 *
 * So this write has NO effect on any later generation, and nobody running this command is told
 * otherwise. It is kept for one reason: it is the seed for the deferred consistent-face feature,
 * and an anchor that quietly drifts out of date is worse than no anchor — the day that feature is
 * picked up, the committed file should be the face the app is actually wearing. That costs a
 * couple of hundred milliseconds and one `git add`.
 *
 * There is no flag to skip it, because "sometimes the seed is her current face and sometimes it is
 * not" is precisely the state the write exists to prevent.
 *
 * ── WHY IT DOES NOT WRITE HER LINE (RU-17) ────────────────────────────────────────────────────
 * The new row carries `source = 'operator'` and `announced_at = null`. That IS the enqueue: it is
 * durable, it survives a failed poke, and it leaves the choice of words entirely to `glm-5.3`
 * through phase 10's `avatar_changed` trigger. A message row hand-written here would be a second
 * author for Nina's voice living in a laptop script — the one place nobody would think to look
 * when she sounds wrong.
 *
 * ── THE DESCRIPTION, AND WHY IT IS A FLAG AND NOT A VISION CALL ───────────────────────────────
 * `nina_avatars.description` is what lets her answer "lah lo ganti foto profil na, itu lagi
 * dimana?" — she cannot invent where she was in a photograph she cannot see, and RU-12 forbids
 * sending `glm-5.3` an image. `lib/db/schema.ts` names this script as one of its three writers.
 *
 * It is NOT written by a `glm-4.6v` pre-pass here. Phase 6's `describeNinaImages` is `server-only`
 * and alias-imported, so reaching it from a node script would mean a second z.ai call site with a
 * second copy of the token-floor guard — the guard whose own header warns it is not a copy of
 * F04's and must be read before it is touched. A third copy is how a safety property drifts.
 * Phase 15's `/api/admin/nina/upload` runs the real pre-pass, in `lib/`, behind the boundary guard.
 *
 * So: `--description "<prose>"` writes it, and omitting the flag leaves it NULL. NULL is a
 * first-class state — `AvatarFacts.description` is documented as "Null when nobody has described
 * it", and `PROACTIVE_INSTRUCTIONS.avatar_changed` tells her not to describe the photo to him
 * anyway ("he can see it"). The flag only matters for the question that comes later.
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
 * Note what is NOT an interlock: **zero avatar rows is normal.** Phase 13's D-2 is that there is no
 * seed row at all — `getCurrentNinaAvatar()` returning null IS the committed `/nina/avatar-001.png`
 * — so `(none)` on a fresh database is the healthy first run, not a wrong-database symptom. The
 * user check above is what catches that, and it catches it properly.
 *
 * ── THE RESIZE, AND WHY IT DOES NOT CROP ──────────────────────────────────────────────────────
 * The avatar is fitted INSIDE 1600 px on the long edge and re-encoded as JPEG q88; it is never
 * cropped to a square and never upscaled. Phase 13 opens the avatar FULL SCREEN, so a square crop
 * applied here would permanently destroy the composition of the photograph the operator chose, to
 * serve a round 40 px thumbnail that CSS `object-fit: cover` already handles. Cropping is a display
 * concern, it is phase 15's (`crop_scale`/`crop_x`/`crop_y`, left NULL here, which means "no
 * transform"), and this is storage.
 *
 * The anchor is fitted inside 2048 px and kept as lossless PNG, matching `assets/badges/_anchor.png`
 * — it is a generation seed, not a display asset, and a JPEG one would bake compression artefacts
 * into whatever eventually reads it.
 *
 * Both outputs are re-encoded from the source rather than copied, which also strips EXIF (sharp
 * drops metadata by default) after `.rotate()` has baked the orientation in. A phone photo that
 * arrives sideways therefore lands upright, and no GPS tag ships to a public blob.
 */
import {
  accessSync,
  constants,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { neon } from '@neondatabase/serverless'
import { put } from '@vercel/blob'

import { ID_LENGTH, newId } from '../lib/id.ts'
import { NINA_BLOB_PREFIX } from '../lib/nina/images.ts'
import { NINA_IMAGE_CACHE_MAX_AGE, NINA_IMAGE_PATHNAME_RE } from '../lib/nina/imagerecipe.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')
const ANCHOR_PATH = path.join(REPO, 'assets', 'nina', '_anchor.png')

/* ── Tunables. Every one of them is a decision the header argues for. ──────────────────────── */

/** Long edge of the stored avatar. Fitted inside, never cropped, never upscaled. */
export const AVATAR_MAX_EDGE_PX = 1600
/** JPEG quality for the stored avatar. */
export const AVATAR_QUALITY = 88
/** Long edge of `assets/nina/_anchor.png`. Lossless PNG — it is a generation seed. */
export const ANCHOR_MAX_EDGE_PX = 2048
/** Below this on the SHORT edge there is not enough face to be worth anchoring against. */
export const MIN_SHORT_EDGE_PX = 512
/** A sanity ceiling on the input, not a budget. `nina.png` is 6.7 MB at 1792x2400. */
export const MAX_INPUT_BYTES = 25_000_000
/** A prose description is a paragraph, not a document. Refused above this rather than truncated. */
export const MAX_DESCRIPTION_CHARS = 2_000

/** Decoders sharp is allowed to accept here. `svg` is refused by name in `assertUsableImage`. */
export const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif', 'tiff'])

/** A user id must be safe to put in a blob pathname. Auth.js ids are UUIDs; demo ids are `demo-*`. */
export const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** `lib/id.ts`'s alphabet at its exact length — the shape `NINA_IMAGE_PATHNAME_RE` will demand. */
export const AVATAR_ID_RE = new RegExp(`^[A-Za-z0-9_-]{${ID_LENGTH}}$`)

/** `.env.local` leaves AUTH_URL empty on purpose (it is PRODUCTION ONLY), so this is a literal. */
export const DEFAULT_APP_URL = 'https://runins.site'

export const USAGE =
  'usage: node --experimental-strip-types --no-warnings --env-file=.env.local ' +
  'scripts/nina-profpic.mjs <image-path> [--apply] [--user <id>] [--app-url <url>] ' +
  '[--description "<prose>"]'

/* ── Pure helpers. These four are what `tests/nina.profpic.test.ts` proves. ────────────────── */

/**
 * Parse argv. Throws on anything ambiguous rather than picking a default, because every default
 * this script could pick would be a default that writes production.
 */
export function parseArgs(argv) {
  const flags = { apply: false, user: null, appUrl: DEFAULT_APP_URL, description: null }
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
    } else if (arg === '--description') {
      /* Not `startsWith('-')`-guarded the way the others are: prose legitimately opens with a
       * dash, and an empty string is caught on the next line anyway. */
      const value = (argv[++i] ?? '').trim()
      if (value.length === 0) throw new Error('--description needs some prose')
      if (value.length > MAX_DESCRIPTION_CHARS) {
        throw new Error(
          `--description is ${value.length} chars; the ceiling is ${MAX_DESCRIPTION_CHARS}`,
        )
      }
      flags.description = value
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

/**
 * RU-7's pathname. The id is generated locally so the whole transaction can be composed up front.
 *
 * `.jpg`, where phase 12's `ninaImagePathname` hardcodes `.png` — which is why this function
 * exists beside that one instead of calling it, and why `NINA_IMAGE_PATHNAME_RE` admits both
 * extensions (RULING A6). The final assertion is against that shared regex, so the two writers
 * under `nina/<userId>/` cannot drift apart without a test going red.
 */
export function avatarPathname(userId, id) {
  if (!USER_ID_RE.test(userId)) throw new Error(`refusing to build a blob path from "${userId}"`)
  if (!AVATAR_ID_RE.test(id)) throw new Error(`refusing to build a blob path from "${id}"`)
  const pathname = `${NINA_BLOB_PREFIX}${userId}/avatar-${id}.jpg`
  if (!NINA_IMAGE_PATHNAME_RE.test(pathname)) {
    throw new Error(`built a pathname the shared regex rejects: ${pathname}`)
  }
  return pathname
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

async function render(bytes, maxEdge, encode) {
  const { default: sharp } = await import('sharp')
  const pipeline = sharp(bytes)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
  const out = await encode(pipeline).toBuffer({ resolveWithObject: true })
  return { bytes: out.data, width: out.info.width, height: out.info.height }
}

const renderAvatar = (bytes) =>
  render(bytes, AVATAR_MAX_EDGE_PX, (p) => p.jpeg({ quality: AVATAR_QUALITY, progressive: true }))

const renderAnchor = (bytes) =>
  render(bytes, ANCHOR_MAX_EDGE_PX, (p) => p.png({ compressionLevel: 9 }))

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
        'assets/nina/_anchor.png, and without that directory the face seed cannot be kept in\n' +
        'sync with the avatar that is about to go live.',
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
  /* `(none)` is the healthy first run, not a symptom: phase 13's D-2 is that there is no seed
   * row — a null current avatar IS the committed /nina/avatar-001.png. */
  line('current avatar', current ? current.pathname : '(none — the committed seed, D-2)')
  console.log('')
  line('will upload', `${pathname} (+ random suffix)`)
  line('', `jpeg q${AVATAR_QUALITY} ${avatar.width}x${avatar.height}, ${kb(avatar.bytes.length)}`)
  line('will re-anchor', path.relative(REPO, ANCHOR_PATH))
  line('', `png ${anchor.width}x${anchor.height}, ${kb(anchor.bytes.length)}`)
  line('will insert', `nina_avatars ${avatarId} source=operator is_current=true`)
  line('description', flags.description ? `"${flags.description}"` : 'NULL (no --description)')
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
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
  })
  line('uploaded', blob.pathname)

  const [, inserted] = await sql.transaction([
    sql`
      update nina_avatars set is_current = false
      where user_id = ${user.id} and is_current = true
    `,
    sql`
      insert into nina_avatars
        (id, user_id, blob_url, pathname, width, height, bytes, source, description,
         is_current, announced_at)
      values
        (${avatarId}, ${user.id}, ${blob.url}, ${blob.pathname}, ${avatar.width},
         ${avatar.height}, ${avatar.bytes.length}, 'operator', ${flags.description},
         true, null)
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

  /* 10. RU-17: poke phase 10's entry point. The durable enqueue is already in the row, and the
   * route is idempotent by design — a second call finds nothing unannounced and emits nothing. */
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
  console.log('COMMIT THE ANCHOR. It changes nothing at runtime today — RU-18 dropped the')
  console.log('reference image, so no generation reads it — but it is the seed for the deferred')
  console.log('consistent-face feature, and an uncommitted one goes stale silently:')
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
