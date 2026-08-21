'use client'

import * as React from 'react'

/**
 * The escape hatch, and nothing more.
 *
 * **Never auto-opened, and nothing is ever inferred from it.** Every value on this screen came
 * from `extractions.raw_response.parsedSession` — the Zod-validated object written once at
 * completion time — and this disclosure shows the *vendor's* untouched reply beside it. Those two
 * can legitimately differ: the provenance guard nulls out fields no uploaded screen could have
 * shown (`lib/schema/extractedSession.ts`), so a model that invented five zone rows from a
 * summary-only upload will have them here and nowhere else. That is the disclosure working, not a
 * bug — and it is exactly why nothing on the screen may read from it.
 *
 * It exists for one reader: someone debugging why a number is wrong, who needs to know whether
 * the model misread the screenshot or the app mishandled a correct reading.
 */

export function RawResponseDisclosure({ raw }: { raw: unknown }) {
  const [open, setOpen] = React.useState(false)
  if (raw === null || raw === undefined) return null

  return (
    <details
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="rounded-card bg-card px-5 shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[13px] font-semibold text-ink-2 [&::-webkit-details-marker]:hidden">
        What the reader actually returned
        <span className="text-[12px] font-medium text-ink-3">{open ? 'hide' : 'show'}</span>
      </summary>
      <div className="pb-5">
        <p className="mb-3 max-w-[40ch] text-[11px] font-medium text-ink-3">
          The raw reply, before validation. Nothing on this screen is read from it — if a field here
          is not shown above, it was discarded because no screenshot you uploaded could have
          contained it.
        </p>
        <pre className="max-h-[320px] overflow-auto rounded-field bg-paper-2 p-3 text-[11px] leading-[1.5] text-ink-2">
          {safeStringify(raw)}
        </pre>
      </div>
    </details>
  )
}

/** A cyclic or gigantic vendor payload must not take the review screen down with it. */
function safeStringify(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2) ?? String(value)
    return text.length > 40_000 ? `${text.slice(0, 40_000)}\n… truncated` : text
  } catch {
    return String(value)
  }
}
