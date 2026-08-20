import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
// Default maxDuration is fine — this is a single indexed SELECT, not the extraction itself.

export async function GET(_req: Request, ctx: RouteContext<'/api/extract/[id]'>) {
  const { id } = await ctx.params
  // F04 implements: select extractions.status/corrections + the committed run, once reviewed.
  return NextResponse.json({ id, error: 'not_implemented' }, { status: 501 })
}
