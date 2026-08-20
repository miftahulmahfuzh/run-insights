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
  AUTH_URL: z.url('AUTH_URL must be an absolute URL').optional(), // production only
})

/** F04 owns this. Vercel injects it once a Blob store is linked to the project. */
const blobSchema = z.object({
  BLOB_READ_WRITE_TOKEN: nonEmpty('BLOB_READ_WRITE_TOKEN'),
})

/** F07 owns this. Guards every /api/cron/* handler. */
const cronSchema = z.object({
  CRON_SECRET: nonEmpty('CRON_SECRET'),
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

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'

export type CoreEnv = z.infer<typeof coreSchema>
export type AuthEnv = z.infer<typeof authSchema>
export type BlobEnv = z.infer<typeof blobSchema>
export type CronEnv = z.infer<typeof cronSchema>
