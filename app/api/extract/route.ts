import { NextResponse } from 'next/server'

// See docs/plans/F01-foundation.md section 2: after() shares this budget. 60 is the Hobby
// ceiling. F04 must not raise this without also reading section 2.4's upgrade path.
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  // F04 implements: insert `extractions` (status='pending'), respond immediately, then
  // `after(() => runExtraction(id))`. See plan section 2 for the required text-only repair
  // and the 55s internal deadline.
  return NextResponse.json({ error: 'not_implemented' }, { status: 501 })
}
