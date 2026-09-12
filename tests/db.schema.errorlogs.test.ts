import { readdirSync, readFileSync } from 'node:fs'

import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'

import * as schema from '@/lib/db/schema'
import { NINA_ERROR_LOG_PAGE_SIZE, NINA_ERROR_LOG_TEXT_MAX } from '@/lib/nina/errorlogs'

/**
 * The pin for `nina_error_logs`, in a file of its own for the reason `tests/db.schema.nina.test.ts`
 * gives for not being a copy of `tests/db.schema.test.ts`: it asks different questions, and sharing
 * helpers would mean one of the files owning them.
 *
 * What is worth pinning here is the shape three LATER phases write against. Phase 2 fills
 * `category: 'text'`, phase 3 `'multimodal'` with an `image_url`, phase 4 `'image_generation'` —
 * none of them can see this table's definition while they are being written, so a column renamed
 * after the fact would surface as a type error in three files at once, or worse, as a silently
 * unwritten column.
 */
function cfg(table: PgTable) {
  return getTableConfig(table)
}
function columns(table: PgTable): Map<string, ReturnType<typeof cfg>['columns'][number]> {
  return new Map(cfg(table).columns.map((c) => [c.name, c]))
}
function sqlType(table: PgTable, column: string): string {
  const col = columns(table).get(column)
  if (!col) throw new Error(`no column ${column} on ${cfg(table).name}`)
  return col.getSQLType()
}
function names(table: PgTable): string[] {
  return [...columns(table).keys()].sort()
}
function indexNames(table: PgTable): string[] {
  return cfg(table)
    .indexes.map((i) => i.config.name ?? '(unnamed)')
    .sort()
}
function fkFor(table: PgTable, column: string) {
  return cfg(table).foreignKeys.find((fk) =>
    fk
      .reference()
      .columns.map((c) => c.name)
      .includes(column),
  )
}

/** The migration is found by CONTENT, not by filename — a number in a name is invisible to grep. */
function createTableSql(): string {
  const found = readdirSync('drizzle')
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(`drizzle/${file}`, 'utf8'))
    .find((body) => body.includes('CREATE TABLE "nina_error_logs"'))
  if (!found) throw new Error('no migration in drizzle/ creates nina_error_logs')
  return found
}

describe('nina_error_logs', () => {
  it('is named what the plan set promised', () => {
    expect(cfg(schema.ninaErrorLogs).name).toBe('nina_error_logs')
  })

  it('spells exactly the columns phases 2, 3, 4 and 5 were written against', () => {
    expect(names(schema.ninaErrorLogs)).toEqual(
      [
        'id',
        'user_id',
        'category',
        'provider',
        'model',
        'full_input',
        'error_message',
        'timeout_ms',
        'image_url',
        'created_at',
      ].sort(),
    )
  })

  it('makes the seven identifying columns NOT NULL and the three optional ones nullable', () => {
    const col = columns(schema.ninaErrorLogs)
    for (const name of [
      'id',
      'category',
      'provider',
      'model',
      'full_input',
      'error_message',
      'created_at',
    ]) {
      expect(col.get(name)?.notNull, name).toBe(true)
    }
    // NULL is a real answer for all three: a text row has no input image, a caller may have no
    // single timeout ceiling to name, and two of the three writing seams observe a failure with no
    // runner in hand at all. None of them is missing data.
    expect(col.get('timeout_ms')?.notNull).toBe(false)
    expect(col.get('image_url')?.notNull).toBe(false)
    expect(col.get('user_id')?.notNull).toBe(false)
  })

  it('keeps user_id NULLABLE in the generated SQL too — phases 2 and 3 write rows with no user', () => {
    // The one pin that must not regress. `logNinaError` swallows its own failure by design, so a
    // NOT NULL here would drop every text-fallback and vision-fallback row in silence.
    expect(createTableSql()).toContain('"user_id" text,')
    expect(createTableSql()).not.toContain('"user_id" text NOT NULL')
  })

  it('types the long columns as plain text, not varchar — the ceiling is the writer’s job', () => {
    expect(sqlType(schema.ninaErrorLogs, 'full_input')).toBe('text')
    expect(sqlType(schema.ninaErrorLogs, 'error_message')).toBe('text')
    expect(sqlType(schema.ninaErrorLogs, 'image_url')).toBe('text')
    expect(sqlType(schema.ninaErrorLogs, 'timeout_ms')).toBe('integer')
    expect(sqlType(schema.ninaErrorLogs, 'created_at')).toBe('timestamp with time zone')
    expect(createTableSql()).toContain('"full_input" text NOT NULL')
  })

  it('defaults created_at to now(), so no writer has to send a clock', () => {
    expect(columns(schema.ninaErrorLogs).get('created_at')?.hasDefault).toBe(true)
    expect(createTableSql()).toContain(
      '"created_at" timestamp with time zone DEFAULT now() NOT NULL',
    )
  })

  it('cascades from user, so deleting the account leaves no failure log behind', () => {
    expect(fkFor(schema.ninaErrorLogs, 'user_id')?.onDelete).toBe('cascade')
  })

  it('keeps EXACTLY one index, on (category, created_at desc) and not on the user', () => {
    expect(indexNames(schema.ninaErrorLogs)).toEqual(['nina_error_logs_category_created_idx'])

    const idx = cfg(schema.ninaErrorLogs).indexes.find(
      (i) => i.config.name === 'nina_error_logs_category_created_idx',
    )
    expect(idx?.config.unique).toBe(false)
    expect((idx?.config.columns ?? []).map((c) => (c as { name?: string }).name)).toEqual([
      'category',
      'created_at',
    ])
    // The DESC is only visible in the generated SQL; drizzle's builder config does not expose the
    // ordering in a version-stable shape. Read it where Postgres will.
    expect(createTableSql()).toContain(
      'CREATE INDEX "nina_error_logs_category_created_idx" ON "nina_error_logs" USING btree ("category","created_at" DESC',
    )
  })

  it('leaves category as text with no CHECK, so a fourth tab is a union edit not a migration', () => {
    expect(sqlType(schema.ninaErrorLogs, 'category')).toBe('text')
    expect(cfg(schema.ninaErrorLogs).checks.length).toBe(0)
  })

  it('leaves provider untyped in SQL too — phases 2/3/4 own that vocabulary', () => {
    expect(sqlType(schema.ninaErrorLogs, 'provider')).toBe('text')
  })

  it('NINA_ERROR_CATEGORIES is the three tabs, in tab order', () => {
    expect(schema.NINA_ERROR_CATEGORIES).toEqual(['text', 'multimodal', 'image_generation'])
  })
})

describe('the reader/writer constants', () => {
  it('bounds a page and bounds a column, and the page is the smaller commitment', () => {
    expect(NINA_ERROR_LOG_PAGE_SIZE).toBe(25)
    expect(NINA_ERROR_LOG_TEXT_MAX).toBe(64_000)
  })
})
