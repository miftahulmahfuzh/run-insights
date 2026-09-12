/* ============================================================================
 * §1 Errors — the query layer's error vocabulary, shared by every domain module.
 * ==========================================================================*/

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * Thrown when the R-5 dedupe index refuses a second run for the same user, day and start time.
 * `existingRunId` is looked up AFTER the index has already said no, purely so the UI can link to
 * the run the user already has. Never check-then-insert: two tabs committing the same extraction
 * would race through the check, and the index cannot race itself.
 */
export class DuplicateRunError extends Error {
  readonly code = 'DUPLICATE_RUN' as const
  constructor(readonly existingRunId: string | null) {
    super('A run already exists for this date and start time')
    this.name = 'DuplicateRunError'
  }
}

/** Postgres SQLSTATE 23505. Neon surfaces it on `err.code`; some wrappers nest it on `.cause`. */
export function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: unknown; cause?: unknown; sourceError?: unknown }
    if (record.code === '23505') return true
    current = record.cause ?? record.sourceError
  }
  return false
}
