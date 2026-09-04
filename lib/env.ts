import 'server-only'
import { z } from 'zod'

/**
 * Environment contract for Run Insights.
 *
 * ROADMAP_v0.1.0.md section 4.1 is authoritative for variable names. Every variable is
 * server-only; none is prefixed NEXT_PUBLIC_.
 *
 * TWO LLM ENDPOINTS, ONE CREDENTIAL (R-40). The two base URLs genuinely differ; the keys
 * never did. There is deliberately NO LLM_VISION_API_KEY here — a second variable holding a
 * duplicate of the first is a credential-rotation bug waiting to happen (rotate one, forget
 * the other, and vision fails while narrative keeps working). Do not reintroduce it.
 *
 *   - LLM_VISION_BASE_URL / LLM_VISION_MODEL -> glm-4.6v, OpenAI-shaped chat/completions on
 *     the CODING endpoint. Authenticated with LLM_API_KEY via `Authorization: Bearer`.
 *     Never point this at api.z.ai/api/anthropic — that endpoint accepts image blocks,
 *     returns HTTP 200, and silently drops the image. See IMPLEMENTATION_PLAN.md section 1.1.
 *     The prompt_tokens floor guard in lib/llm/vision.ts (F04) is the runtime half of this
 *     defence; this schema's URL + non-empty checks are the boot-time half.
 *   - LLM_BASE_URL / LLM_MODEL -> glm-5.3, Anthropic-compatible endpoint, @anthropic-ai/sdk.
 *     Same LLM_API_KEY, sent as `x-api-key` by the SDK.
 *
 * Import rules:
 *   - Server Components, Route Handlers, Server Actions, lib/**  -> allowed
 *   - Client Components ('use client')                           -> build error
 *   - Node scripts outside Next (scripts/*.mjs, drizzle.config,
 *     research/*.mjs)                                            -> NOT importable; those
 *     read process.env directly (research/lib.mjs already does; keep it that way).
 */

const nonEmpty = (name: string) => z.string().min(1, `${name} is required but was empty or unset`)

const postgresUrl = (name: string) =>
  nonEmpty(name).startsWith('postgres', `${name} must be a postgres:// or postgresql:// URL`)

/** Always required. Parsed eagerly at module load -> a missing value fails the build. */
const coreSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // One z.ai key, both endpoints (R-40). F04 sends it as a Bearer token to the coding
  // endpoint; F07 hands it to @anthropic-ai/sdk for the Anthropic-compatible one.
  LLM_API_KEY: nonEmpty('LLM_API_KEY'),

  // F04 — glm-4.6v, OpenAI-shaped, coding/paas/v4. Plain fetch, no SDK (roadmap section 3).
  LLM_VISION_BASE_URL: z.url('LLM_VISION_BASE_URL must be an absolute URL'),
  LLM_VISION_MODEL: nonEmpty('LLM_VISION_MODEL'),

  // F07 — glm-5.3, Anthropic-compatible, @anthropic-ai/sdk with a baseURL override.
  LLM_BASE_URL: z.url('LLM_BASE_URL must be an absolute URL'),
  LLM_MODEL: nonEmpty('LLM_MODEL'),

  // F03 — Neon. DATABASE_URL is pooled (runtime); DATABASE_URL_UNPOOLED is direct
  // (drizzle-kit migrate/studio only, read via dotenv in drizzle.config.ts, not this module).
  DATABASE_URL: postgresUrl('DATABASE_URL'),
  DATABASE_URL_UNPOOLED: postgresUrl('DATABASE_URL_UNPOOLED'),
})

/** F02 owns these. Validated on first call — call it at module scope in auth.ts so it still
 *  crashes at boot, not mid-request. */
const authSchema = z.object({
  AUTH_SECRET: nonEmpty('AUTH_SECRET'),
  AUTH_GOOGLE_ID: nonEmpty('AUTH_GOOGLE_ID'),
  AUTH_GOOGLE_SECRET: nonEmpty('AUTH_GOOGLE_SECRET'),
  /**
   * PRODUCTION ONLY (roadmap §4.1). Locally and on preview it must be left unset so Auth.js infers
   * the origin from the request — a hardcoded origin on a preview deployment sends the OAuth
   * callback to the wrong host.
   *
   * The `''` case is not sloppiness, it is the literal shape of the instruction: `.env.example`
   * ships the key with an empty value and tells the reader to leave it that way, and a key present
   * with an empty value is exactly how a dotenv file spells "unset". Without this preprocess,
   * following the instruction crashes the build.
   */
  AUTH_URL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.url('AUTH_URL must be an absolute URL').optional(),
  ),
})

/** F04 owns this. Vercel injects it once a Blob store is linked to the project. */
const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: nonEmpty('BLOB_READ_WRITE_TOKEN'),
})

/** F07 owns this. Guards every /api/cron/* handler. */
const cronSchema = z.object({
  CRON_SECRET: nonEmpty('CRON_SECRET'),
})

/**
 * F33 owns these. Lazily validated, like `blobEnv()` and `cronEnv()`: a deploy without an
 * OpenRouter key must still serve every screen that is not Nina's, so a missing value is an
 * error at her first turn and not at build time.
 *
 * **RU-2 in one variable.** `OPENROUTER_API_KEY` was build-time-only (D12) and read by
 * `tools/gen_badge_art.py` and nothing else. It is now also a RUNTIME credential, for `lib/nina/`
 * ONLY, queued and daily-capped. Badge and record art stay offline-and-committed.
 *
 * `scripts/check-openrouter-boundary.mjs` still greps `app/`, `lib/` and `components/` for this
 * literal and still fails for every one of them except two exempted paths: `lib/nina/`, and this
 * file. `lib/env.ts` is exempted because it is the app's single environment contract and the
 * alternative — hiding the variable in `lib/nina/env.ts`, or assembling its name so the grep
 * misses it — would be evading the guard rather than amending it.
 */
const ninaSchema = z.object({
  OPENROUTER_API_KEY: nonEmpty('OPENROUTER_API_KEY'),
  /**
   * **RU-20's dispatch credential (RULING C4).** A GitHub fine-grained PAT with `actions: write`
   * on this repo, used by `lib/nina/imagedispatch.ts` to fire the image worker's
   * `workflow_dispatch`. Lazily validated with the rest of the group, so a deploy without it
   * serves every screen and fails only at the first image job.
   *
   * **The repo coordinates are deliberately NOT env vars.** `owner`/`repo`/`workflow` are module
   * constants in `lib/nina/imagedispatch.ts`, exactly as phase 12 wrote them, because an
   * environment variable is a thing a deploy can get wrong — and getting these wrong means
   * dispatching a workflow at SOMEBODY ELSE'S repository with this token in the header. A
   * constant in a reviewed file cannot be misconfigured; only rewritten.
   */
  GITHUB_DISPATCH_TOKEN: nonEmpty('GITHUB_DISPATCH_TOKEN'),
})

/**
 * F33 / R3 owns these. Generate a pair with:
 *
 *     npx --yes web-push generate-vapid-keys
 *
 * **The public key is read SERVER-SIDE and passed to the client component as a prop** — there is
 * no `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and there must not be one (plan invariant 10, enforced by
 * `ci:client-secret-guard`). The Next.js PWA guide's recipe uses the `NEXT_PUBLIC_` form; that
 * step is deliberately not followed here.
 */
const pushSchema = z.object({
  VAPID_PUBLIC_KEY: nonEmpty('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: nonEmpty('VAPID_PRIVATE_KEY'),
  /**
   * **The `mailto:` `web-push` requires (RULING C4).** `webpush.setVapidDetails(subject, pub,
   * priv)` throws unless `subject` is a `mailto:` or `https:` URL — it is the contact address a
   * push service uses to reach the sender when a subscription misbehaves, so it is part of the
   * credential and not part of the code. Env rather than a hardcoded string for the same reason
   * `ADMIN_EMAILS` is env: it is a personal address, it is the one field here that a second
   * deploy would want different, and a literal in `lib/nina/push.ts` would be a code change.
   *
   * Phase 11 asked to add this line itself; it ships here, because this file has one owner.
   */
  VAPID_SUBJECT: nonEmpty('VAPID_SUBJECT'),
})

/**
 * R23 / R24 — who may open `/admin/nina` and `/admin/memory`.
 *
 * ── WHY ENV AND NOT A `users.is_admin` COLUMN ─────────────────────────────────────────────────
 * Considered, and rejected on three grounds. (1) A column needs a bootstrap: the first admin has
 * to be granted by something, and that something is either a migration with an email literal in
 * it — which is this variable with extra steps and a deploy to change — or an admin page you
 * cannot reach until you are an admin. (2) Authorisation that lives in the database is data an
 * SQL bug can grant; authorisation that lives in the environment is data only a deploy can grant,
 * and for a two-page admin surface on a single-user app the environment is the stronger of the
 * two. (3) It matches how `CRON_SECRET` already gates `/api/cron/*` — the app's existing answer
 * to "who is allowed to do the privileged thing" is an environment variable, and a second,
 * different answer is a second thing to reason about.
 *
 * Comma-separated so a second address is a Vercel env edit rather than a code change.
 *
 * **The Google account you sign in with must be one of these**, or the admin pages 404. There is
 * no relationship between this list and `users.email` other than string equality, and if the app
 * is signed in as a different Google address than the one below, the pages are unreachable and
 * the symptom is a 404 rather than an error — which is the correct symptom and a confusing one,
 * so it is written down here.
 */
const adminSchema = z.object({
  ADMIN_EMAILS: nonEmpty('ADMIN_EMAILS'),
})

function fail(group: string, error: z.ZodError): never {
  const lines = error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
  throw new Error(
    [
      '',
      '',
      `================ INVALID ${group.toUpperCase()} ENVIRONMENT ================`,
      lines,
      '',
      'Local dev : copy .env.example to .env.local and fill in the blanks.',
      'Vercel    : Project Settings > Environment Variables (per environment).',
      '============================================================',
      '',
    ].join('\n'),
  )
}

function load<T extends z.ZodType>(group: string, schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) fail(group, parsed.error)
  return parsed.data
}

/** Validated core environment. Evaluated at import time. */
export const env = load('core', coreSchema)

let authCache: z.infer<typeof authSchema> | null = null
export function authEnv(): z.infer<typeof authSchema> {
  authCache ??= load('auth', authSchema)
  return authCache
}

let blobCache: z.infer<typeof blobSchema> | null = null
export function blobEnv(): z.infer<typeof blobSchema> {
  blobCache ??= load('blob', blobSchema)
  return blobCache
}

let cronCache: z.infer<typeof cronSchema> | null = null
export function cronEnv(): z.infer<typeof cronSchema> {
  cronCache ??= load('cron', cronSchema)
  return cronCache
}

let ninaCache: z.infer<typeof ninaSchema> | null = null
export function ninaEnv(): z.infer<typeof ninaSchema> {
  ninaCache ??= load('nina', ninaSchema)
  return ninaCache
}

let pushCache: z.infer<typeof pushSchema> | null = null
export function pushEnv(): z.infer<typeof pushSchema> {
  pushCache ??= load('push', pushSchema)
  return pushCache
}

let adminCache: z.infer<typeof adminSchema> | null = null
export function adminEnv(): z.infer<typeof adminSchema> {
  adminCache ??= load('admin', adminSchema)
  return adminCache
}

/**
 * The one piece of logic in this module, and therefore the one piece with a test
 * (`tests/env.admin.test.ts`). Case-insensitive because Google reports `Foo@Gmail.com` and
 * `foo@gmail.com` as the same account and a person typing the variable will not think about it;
 * whitespace-tolerant because `a@b.com, c@d.com` is how anyone writes a list.
 *
 * `null` and `''` are not admins. That matters: `requireUserId()` gives a user id, the email
 * comes from the session, and a session without one must fail closed.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (email == null || email.trim() === '') return false
  const needle = email.trim().toLowerCase()
  return adminEnv()
    .ADMIN_EMAILS.split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0)
    .includes(needle)
}

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

export type CoreEnv = z.infer<typeof coreSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type BlobEnv = z.infer<typeof blobSchema>
export type CronEnv = z.infer<typeof cronSchema>
export type NinaEnv = z.infer<typeof ninaSchema>
export type PushEnv = z.infer<typeof pushSchema>
export type AdminEnv = z.infer<typeof adminSchema>
