import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit runs outside Next.js: no automatic .env.local loading, and lib/env.ts
// (server-only) is not importable here.
loadEnv({ path: '.env.local', quiet: true })

const url = process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error(
    'DATABASE_URL_UNPOOLED is not set. drizzle-kit must use the DIRECT (unpooled) Neon ' +
      'connection string. Copy .env.example to .env.local and fill it in.',
  )
}
if (new URL(url).host.includes('-pooler')) {
  throw new Error(
    `DATABASE_URL_UNPOOLED points at a pooled host (${new URL(url).host}). ` +
      'Use the direct connection string from the Neon console.',
  )
}

export default defineConfig({
  schema: './lib/db/schema.ts', // F03's file — this path is fixed, F03 must not move it
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
})
