'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import type { ExtractionBlobRefRow } from '@/lib/db/schema'
import type { ExtractAcceptedResponse } from '@/lib/schema/extractionResult'

/**
 * "Read these screenshots again" — a second attempt at the same blobs.
 *
 * Nothing is re-uploaded. `extractions.blob_urls` already holds exactly the `{url, pathname, kind,
 * width, height, bytes}` records `POST /api/extract` accepts, because that column IS the immutable
 * record of what was sent to the model. So a retry is one POST of a value we already have, and the
 * new extraction gets its own audit row rather than overwriting the old one — two readings of the
 * same screenshots is a genuinely interesting pair to be able to compare later.
 *
 * ── WHY IT ASKS FIRST ───────────────────────────────────────────────────────────────────────
 * A vision call is ~33 s and costs real money, and the reviewer is one tap away from just fixing
 * the number by hand — which is faster, free, and certain. So this is deliberately the least
 * prominent control on the screen, and it confirms inline (two buttons in place, mirroring the
 * expense tracker's re-parse pattern) rather than through `window.confirm`, which on iOS is a
 * system dialog that reads as an error.
 *
 * ── AND WHEN IT IS WORTH IT ─────────────────────────────────────────────────────────────────
 * Exactly one case, really: a `failed` extraction, where there is nothing to correct and the
 * alternative is typing 108 fields. On an `ok` extraction with one wrong split, correcting by hand
 * is strictly better — which is why the copy says so instead of pretending the choice is even.
 */
export function RetryExtraction({ images }: { images: ExtractionBlobRefRow[] }) {
  const router = useRouter()
  const [confirming, setConfirming] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (images.length === 0) return null

  async function retry() {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Re-sent verbatim. The route re-validates every field against `ExtractRequestSchema`
        // regardless — a blob URL is an SSRF primitive if it is ever taken on trust.
        body: JSON.stringify({ images }),
      })
      if (!response.ok) {
        setError('That could not be started. Try again in a moment.')
        setPending(false)
        return
      }
      const body = (await response.json()) as ExtractAcceptedResponse
      router.push(`/x/${body.extractionId}`)
    } catch {
      setError('That could not be started. Check your connection.')
      setPending(false)
    }
  }

  if (!confirming) {
    return (
      <div className="px-1 text-center">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[12px] font-semibold text-ink-3 underline decoration-rule underline-offset-4"
        >
          Read these screenshots again
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-card bg-card p-5 shadow-card">
      <p className="text-[13px] font-semibold text-ink">Read them again?</p>
      <p className="mt-1 max-w-[38ch] text-[12px] font-medium text-ink-2">
        This starts a fresh reading of the same screenshots — about half a minute, and it may come
        back with the same answer. If you can see the right number on the screenshot, correcting it
        by hand is faster and certain.
      </p>
      {error && <p className="mt-2 text-[12px] font-semibold text-red">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={retry}
          disabled={pending}
          className="h-11 flex-1 rounded-field bg-ink text-[14px] font-semibold text-card disabled:opacity-50"
        >
          {pending ? 'Starting…' : 'Read again'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="h-11 flex-1 rounded-field bg-paper-2 text-[14px] font-semibold text-ink disabled:opacity-50"
        >
          Keep these
        </button>
      </div>
    </div>
  )
}
