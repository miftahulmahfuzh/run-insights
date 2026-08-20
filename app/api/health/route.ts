import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'
import { env } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    const sql = neon(env.DATABASE_URL)
    await sql`select 1`
    return NextResponse.json({
      ok: true,
      db: true,
      latencyMs: Date.now() - startedAt,
      // Safe to expose: model ids and base URLs, no key, no DSN. See Contract delta 1 for
      // why the payload stays this small (learned from expense-tracking's own R-27).
      vision: { baseUrl: env.LLM_VISION_BASE_URL, model: env.LLM_VISION_MODEL },
      narrative: { baseUrl: env.LLM_BASE_URL, model: env.LLM_MODEL },
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, latencyMs: Date.now() - startedAt },
      { status: 500 },
    )
  }
}
