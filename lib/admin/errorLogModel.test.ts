import { describe, expect, it } from 'vitest'

import {
  ADMIN_ERROR_CATEGORIES,
  ADMIN_ERROR_LOGS_PATH,
  ADMIN_ERROR_LOG_PAGE_CEILING,
  ADMIN_ERROR_LOG_PAGE_SIZE,
  buildErrorLogItems,
  composeErrorText,
  errorLogHref,
  formatErrorLogStamp,
  formatErrorTimeout,
  readErrorCategory,
  readErrorLogPage,
  toErrorLogListItem,
  type ErrorLogSource,
} from '@/lib/admin/errorLogModel'

/**
 * `/admin/error-logs`'s pure half — R2's exit criteria that do not need a browser.
 *
 * `tests/admin.shortcuts.test.ts` is the file this one copies: the row model is asserted whole
 * with `toEqual` rather than field by field, so a column added to the item without a reason shows
 * up as a failing test rather than as a silently wider payload.
 */

const SOURCE: ErrorLogSource = {
  id: 'e1',
  provider: 'zai',
  model: 'glm-5.3-flash',
  fullInput: '{"system":"…","messages":[]}',
  errorMessage: 'Connection error.',
  timeoutMs: 22_000,
  imageUrl: null,
  createdAt: new Date('2026-09-12T00:31:15Z'),
}

describe('the URL grammar', () => {
  it('makes the default tab and the first page the ABSENCE of a parameter', () => {
    // The canonical /admin/error-logs and a navigated-back-to first page are the same URL —
    // hrefForFolder's rule, which is why the tab strip and the pager share this one function.
    expect(errorLogHref('text', 1)).toBe(ADMIN_ERROR_LOGS_PATH)
  })

  it('spells the other two tabs and every page past the first', () => {
    expect(errorLogHref('multimodal', 1)).toBe('/admin/error-logs?tab=multimodal')
    expect(errorLogHref('text', 3)).toBe('/admin/error-logs?page=3')
    expect(errorLogHref('image_generation', 2)).toBe(
      '/admin/error-logs?tab=image_generation&page=2',
    )
  })

  it('names the three categories once, in the order the user wrote them', () => {
    expect(ADMIN_ERROR_CATEGORIES).toEqual(['text', 'multimodal', 'image_generation'])
  })
})

describe('reading the parameters', () => {
  it('takes the first value of a repeated parameter and falls back to text', () => {
    expect(readErrorCategory('multimodal')).toBe('multimodal')
    expect(readErrorCategory(['image_generation', 'text'])).toBe('image_generation')
    expect(readErrorCategory(undefined)).toBe('text')
    expect(readErrorCategory('../../etc')).toBe('text')
    expect(readErrorCategory([])).toBe('text')
  })

  it('floors the page at 1 and caps it, so no offset can be asked for that no log reaches', () => {
    expect(readErrorLogPage(undefined)).toBe(1)
    expect(readErrorLogPage('0')).toBe(1)
    expect(readErrorLogPage('-4')).toBe(1)
    expect(readErrorLogPage('nonsense')).toBe(1)
    expect(readErrorLogPage('3')).toBe(3)
    expect(readErrorLogPage('99999999')).toBe(ADMIN_ERROR_LOG_PAGE_CEILING)
  })

  it('renders one bounded page', () => {
    expect(ADMIN_ERROR_LOG_PAGE_SIZE).toBe(25)
  })

  it('never asks the reader for more rows than the reader will return', async () => {
    /*
     * The guard for the one duplicated number in this phase. `listNinaErrorLogs` CLAMPS `limit` to
     * `NINA_ERROR_LOG_PAGE_SIZE`, so a page size above it would render fewer rows than the offset
     * advances by and skip everything in between — silently, since nothing errors. The constant is
     * duplicated rather than imported by `errorLogModel.ts` (zero value imports, so no `'use
     * client'` consumer drags drizzle into the bundle); this test is what makes that duplication
     * safe. Imported dynamically so the module under test keeps its own import graph clean.
     */
    const { NINA_ERROR_LOG_PAGE_SIZE } = await import('@/lib/nina/errorlogs')
    expect(ADMIN_ERROR_LOG_PAGE_SIZE).toBeLessThanOrEqual(NINA_ERROR_LOG_PAGE_SIZE)
  })
})

describe('the timestamp', () => {
  it('is Asia/Jakarta, eleven characters, and has no year', () => {
    // 00:31 UTC on the 12th is 07:31 the same day in Jakarta (UTC+7, no DST, ever).
    expect(formatErrorLogStamp(new Date('2026-09-12T00:31:15Z'))).toBe('12/09 07:31')
    expect(formatErrorLogStamp(new Date('2026-09-12T00:31:15Z'))).toHaveLength(11)
  })

  it('crosses the date line into Jakarta rather than reporting the UTC day', () => {
    // The incident this plan set follows from started at 22:29 UTC on the 11th, which is 05:29 on
    // the 12th where the operator reads it.
    expect(formatErrorLogStamp(new Date('2026-09-11T22:29:41Z'))).toBe('12/09 05:29')
  })

  it('renders midnight as 00:00 and not as 24:00', () => {
    expect(formatErrorLogStamp(new Date('2026-09-11T17:00:00Z'))).toBe('12/09 00:00')
  })
})

describe('the timeout fold', () => {
  it('turns milliseconds into the seconds the requirement is written in', () => {
    expect(formatErrorTimeout(300_000)).toBe('300s')
    expect(formatErrorTimeout(22_000)).toBe('22s')
    expect(formatErrorTimeout(25_500)).toBe('26s')
  })

  it('has nothing to say about a failure that was not given a timeout', () => {
    expect(formatErrorTimeout(null)).toBeNull()
    expect(formatErrorTimeout(0)).toBeNull()
    expect(formatErrorTimeout(Number.NaN)).toBeNull()
  })

  it('puts the number FIRST, so a kilobyte of provider HTML cannot bury it', () => {
    expect(composeErrorText('504 Gateway Timeout', 300_000)).toBe(
      'Timeout: 300s\n\n504 Gateway Timeout',
    )
  })

  it('leaves the provider text exactly as it was when there is no timeout to add', () => {
    expect(composeErrorText('401 Unauthorized', null)).toBe('401 Unauthorized')
  })
})

describe('toErrorLogListItem', () => {
  it('turns the Date into two strings, folds the timeout in, and changes nothing else', () => {
    expect(toErrorLogListItem(SOURCE)).toEqual({
      id: 'e1',
      stamp: '12/09 07:31',
      stampISO: '2026-09-12T00:31:15.000Z',
      provider: 'zai',
      model: 'glm-5.3-flash',
      fullInput: '{"system":"…","messages":[]}',
      errorText: 'Timeout: 22s\n\nConnection error.',
      imageUrl: null,
    })
  })

  it('carries an image URL through untouched, and a null as a null', () => {
    const withPhoto = { ...SOURCE, imageUrl: 'https://blob.example/nina/a.jpg' }
    expect(toErrorLogListItem(withPhoto).imageUrl).toBe('https://blob.example/nina/a.jpg')
    expect(toErrorLogListItem(SOURCE).imageUrl).toBeNull()
  })

  it('maps and never sorts — the reader already ordered these newest-first', () => {
    const older = { ...SOURCE, id: 'e0', createdAt: new Date('2026-09-11T00:31:15Z') }
    expect(buildErrorLogItems([SOURCE, older]).map((item) => item.id)).toEqual(['e1', 'e0'])
  })
})
