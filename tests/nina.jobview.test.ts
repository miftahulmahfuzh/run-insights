import { describe, expect, it } from 'vitest'

import { SESSION_PARAM } from '@/lib/nina/active'
import { CHAT_SCROLL_PARAM } from '@/lib/nina/scroll'
import {
  decodeJobListScrollMark,
  encodeJobListScrollMark,
  JOB_JUMP_PARAM,
  JOB_LIST_SCROLL_PARAM,
  MAX_JOB_LIST_SCROLL_OFFSET_PX,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
  formatCostSourceLabel,
  formatJobLatency,
  formatMicroUsd,
  jobCanRedo,
  jobElapsedSeconds,
  jobErrorLabel,
  jobIsOpen,
  jobStage,
  ninaJobHref,
  ninaJobTitle,
  ninaJumpHref,
  nextSoftNavJump,
  parseNinaJumpParam,
  pickJobListScrollAnchor,
  planJobJump,
  planJobPhoto,
  planJobReferencePhoto,
  resolveJobListScrollTop,
  splitSidecarReference,
  toNinaJobListItems,
  withCostSourceLine,
  withJobIdLine,
  withJobListScrollMark,
  type JobListScrollAnchorRow,
} from '@/lib/nina/jobview'

describe('the deep link is its own parameter', () => {
  it('does not reuse the scroll-mark key', () => {
    /* D2. `?at=` is an anchor AND an offset with the opposite lifetime; see `jobview.ts`. */
    expect(JOB_JUMP_PARAM).not.toBe(CHAT_SCROLL_PARAM)
  })

  it('carries the session and the message, and nothing else', () => {
    const href = ninaJumpHref({
      sessionId: 'aaaaaaaaaaaa',
      messageId: 'bbbbbbbbbbbb',
      sessionParam: SESSION_PARAM,
    })
    const url = new URL(href, 'https://example.test')
    expect(url.pathname).toBe('/nina')
    expect(url.searchParams.get(SESSION_PARAM)).toBe('aaaaaaaaaaaa')
    expect(url.searchParams.get(JOB_JUMP_PARAM)).toBe('bbbbbbbbbbbb')
    expect([...url.searchParams.keys()]).toHaveLength(2)
  })

  it('refuses anything that cannot be one of our ids', () => {
    expect(parseNinaJumpParam('bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
    expect(parseNinaJumpParam('short')).toBeNull()
    expect(parseNinaJumpParam(['a', 'b'])).toBeNull()
    expect(parseNinaJumpParam(undefined)).toBeNull()
  })
})

describe('jobStage resolves error_code’s two meanings by status', () => {
  it('reads the phase while pending', () => {
    expect(jobStage({ status: 'pending', errorCode: 'queued' })).toBe('queued')
    expect(jobStage({ status: 'pending', errorCode: 'dispatched' })).toBe('dispatched')
    expect(jobStage({ status: 'pending', errorCode: 'running' })).toBe('running')
  })

  it('reads the failure reason as a failure, never as a phase', () => {
    expect(jobStage({ status: 'failed', errorCode: 'stale' })).toBe('failed')
    expect(jobStage({ status: 'failed', errorCode: 'running' })).toBe('failed')
  })

  it('tolerates a phase and a status it has never heard of', () => {
    /* D5: phase 2 may add a phase. A tracking page must not go blank when it does. */
    expect(jobStage({ status: 'pending', errorCode: 'generating-in-platform' })).toBe('queued')
    expect(jobStage({ status: 'pending', errorCode: null })).toBe('queued')
    expect(jobStage({ status: 'weird', errorCode: null })).toBe('queued')
  })

  it('counts repaired as done', () => {
    expect(jobStage({ status: 'ok', errorCode: null })).toBe('done')
    expect(jobStage({ status: 'repaired', errorCode: null })).toBe('done')
  })

  it('marks only the pending stages as open', () => {
    expect(jobIsOpen('queued')).toBe(true)
    expect(jobIsOpen('dispatched')).toBe(true)
    expect(jobIsOpen('running')).toBe(true)
    expect(jobIsOpen('done')).toBe(false)
    expect(jobIsOpen('failed')).toBe(false)
  })

  it('names every stage', () => {
    for (const stage of ['queued', 'dispatched', 'running', 'done', 'failed'] as const) {
      expect(NINA_JOB_STAGE_LABEL[stage].length).toBeGreaterThan(0)
    }
  })

  it('still renders the historical dispatched stage, without promising anything', () => {
    /*
     * Phase 2 deleted both writers of `error_code = 'dispatched'`, so nothing enters that stage on
     * Branch A — but the fifteen rows written before it landed are the first thing on `/nina/jobs`.
     * Deleting the branch as dead code would blank them; keeping "Dijadwalkan" would tell the
     * runner a worker is on the way. Both are wrong, so the branch stays and the word changed.
     */
    expect(jobStage({ status: 'pending', errorCode: 'dispatched' })).toBe('dispatched')
    expect(NINA_JOB_STAGE_LABEL.dispatched).not.toBe('Dijadwalkan')
  })
})

describe('jobErrorLabel', () => {
  it('puts the four known failures into words', () => {
    for (const kind of ['timeout', 'policy', 'transport', 'stale']) {
      expect(jobErrorLabel(kind)).not.toBe(kind)
      expect(jobErrorLabel(kind)).not.toBeNull()
    }
  })

  it('renders an unknown code as itself rather than dropping it', () => {
    expect(jobErrorLabel('quota')).toBe('quota')
  })

  it('has nothing to say about a job that did not fail', () => {
    expect(jobErrorLabel(null)).toBeNull()
    expect(jobErrorLabel('')).toBeNull()
  })
})

describe('toNinaJobListItems', () => {
  const base = {
    id: 'aaaaaaaaaaaa',
    status: 'pending',
    errorCode: 'running',
    purpose: 'selfie' as const,
    scene: 'sore di kos',
    attempts: 1,
    createdAt: new Date('2026-09-06T03:02:31.897Z'),
    latencyMs: null,
    imageId: null as string | null,
  }

  it('preserves the order it is given', () => {
    const items = toNinaJobListItems([
      { ...base, id: 'aaaaaaaaaaaa' },
      { ...base, id: 'bbbbbbbbbbbb' },
    ])
    expect(items.map((row) => row.id)).toEqual(['aaaaaaaaaaaa', 'bbbbbbbbbbbb'])
  })

  it('serialises the instant as a number', () => {
    const [item] = toNinaJobListItems([base])
    expect(item!.createdAtMs).toBe(base.createdAt.getTime())
  })

  it('carries an error label only on a failed row', () => {
    const [open] = toNinaJobListItems([base])
    expect(open!.errorLabel).toBeNull()
    const [failed] = toNinaJobListItems([{ ...base, status: 'failed', errorCode: 'stale' }])
    expect(failed!.errorLabel).not.toBeNull()
  })

  it('links each row at its own detail page', () => {
    const [item] = toNinaJobListItems([base])
    expect(item!.href).toBe(`${NINA_JOBS_HREF}/aaaaaaaaaaaa`)
    expect(item!.href).toBe(ninaJobHref('aaaaaaaaaaaa'))
  })

  it('resolves each row’s full-view link via planJobPhoto, threading the row’s own imageId through', () => {
    /*
     * Coupling this here rather than in the component is the point of `planJobPhoto` existing at
     * all — `vitest` is `environment: 'node'` and cannot reach a rule living inside
     * `NinaJobActions`. `stage` plays no part any more: unlike the old `canRedo`, the link's
     * presence depends only on whether a photograph has landed and on the job's purpose.
     */
    const [withPhoto] = toNinaJobListItems([{ ...base, imageId: 'imgAAAAAA1234' }])
    expect(withPhoto!.photo).toEqual(
      planJobPhoto({
        jobId: base.id,
        purpose: base.purpose,
        imageId: 'imgAAAAAA1234',
        returnTo: NINA_JOBS_HREF,
      }),
    )

    const [withoutPhoto] = toNinaJobListItems([{ ...base, imageId: null }])
    expect(withoutPhoto!.photo).toEqual({ kind: 'none' })

    const [avatar] = toNinaJobListItems([{ ...base, purpose: 'avatar', imageId: 'imgAAAAAA1234' }])
    expect(avatar!.photo).toEqual({ kind: 'none' })
  })

  it('titles a row by its scene, and by its purpose when it has none', () => {
    /* The row's visible title and the full-view link's accessible name are this one string. Two
     * copies of it would drift, and the drift would be invisible to anyone who can see the
     * screen. */
    const [item] = toNinaJobListItems([base])
    expect(ninaJobTitle(item!)).toBe('sore di kos')
    expect(ninaJobTitle({ scene: null, purpose: 'selfie' })).toBe('Selfie')
    expect(ninaJobTitle({ scene: null, purpose: 'avatar' })).toBe('Foto profil')
  })
})

describe('jobCanRedo says yes to failed and done, and to nothing still in progress', () => {
  it('says yes to a failed job', () => {
    expect(jobCanRedo('failed')).toBe(true)
  })

  it('says yes to a done job too — a redo of a successful job re-fires its own args, e.g. after an edited prompt', () => {
    expect(jobCanRedo('done')).toBe(true)
  })

  it('never offers a redo for a job something is already retrying', () => {
    /*
     * D3, rung 5. `reviveNinaImageJobs` re-fires a `queued` row on the next `/nina` render and
     * `claimNinaImageJob` bounds the whole thing at `NINA_IMAGE_MAX_ATTEMPTS`; a redo here would
     * open a SECOND row for one photograph and bill twice for it. The two properties are asserted
     * together on purpose — "open" and "redoable" must never both be true for one stage.
     */
    for (const stage of ['queued', 'dispatched', 'running'] as const) {
      expect(jobIsOpen(stage)).toBe(true)
      expect(jobCanRedo(stage)).toBe(false)
    }
  })
})

describe('planJobJump names each way there is no bubble', () => {
  const p = { sessionParam: SESSION_PARAM }

  it('jumps to the earliest bubble carrying the photograph, in whatever session it lives', () => {
    const jump = planJobJump({
      ...p,
      purpose: 'selfie',
      bubble: { sessionId: 'cccccccccccc', messageId: 'bbbbbbbbbbbb' },
    })
    expect(jump.kind).toBe('ready')
    expect(jump.kind === 'ready' && jump.href).toContain('bbbbbbbbbbbb')
    expect(jump.kind === 'ready' && jump.href).toContain('cccccccccccc')
  })

  it('an avatar job never has a bubble to jump to', () => {
    /* `finishAvatar` writes no carrier message, so there is nothing to resolve — the page skips
     * the reads and hands `bubble: null`. */
    expect(planJobJump({ ...p, purpose: 'avatar', bubble: null }).kind).toBe('avatar')
  })

  it('never links an avatar job, even if a bubble somehow arrived', () => {
    /* `planJobPhoto`'s avatar arm is the RULE and the page's read-skip is its cost half — the
     * same arrangement here, checked first, so a future caller cannot draw a button by
     * forgetting the skip. */
    expect(
      planJobJump({
        ...p,
        purpose: 'avatar',
        bubble: { sessionId: 'cccccccccccc', messageId: 'bbbbbbbbbbbb' },
      }).kind,
    ).toBe('avatar')
  })

  it('a selfie whose photograph resolves to no live bubble is the one refusal', () => {
    /* MEASURED: fourteen `kind='image'` rows whose `args.replyToId` resolves to nothing — under
     * the old rule that was the common refusal on this screen; under the new one most of those
     * rows have a live bubble, because the target follows the photograph and not the request.
     * What remains here: open and failed jobs (photo not made yet), a removed photo, a removed
     * chat. */
    expect(planJobJump({ ...p, purpose: 'selfie', bubble: null }).kind).toBe('no-photo')
  })

  it('the refusal sentence names all three causes without asserting one', () => {
    /* The old `gone` arm's honesty, kept: `bubble: null` arrives for a job still drawing, a
     * photograph the runner removed, and a chat the cascade took — one sentence, no cause
     * asserted, because the runner cannot tell which from this screen. */
    expect(NINA_JOB_JUMP_NOTE['no-photo']).toContain('belum jadi')
    expect(NINA_JOB_JUMP_NOTE['no-photo']).toContain('kehapus')
    expect(NINA_JOB_JUMP_NOTE['no-photo']).toContain('chatnya dihapus')
  })

  it('every refusal has a sentence', () => {
    for (const kind of ['avatar', 'no-photo'] as const) {
      expect(NINA_JOB_JUMP_NOTE[kind].length).toBeGreaterThan(0)
    }
  })
})

describe('the numbers', () => {
  it('never reports negative elapsed time', () => {
    expect(jobElapsedSeconds(1000, 900)).toBe(0)
    expect(jobElapsedSeconds(0, 74_000)).toBe(74)
  })

  it('renders micro-USD as dollars, three places', () => {
    expect(formatMicroUsd(40_000)).toBe('$0.040')
    expect(formatMicroUsd(0)).toBe('$0.000')
  })

  it('renders a two-attempt job as the sum of both bills', () => {
    /*
     * Invariant 9, and the Decisions row that made `cost_micro_usd` a per-JOB cumulative total:
     * two OpenRouter calls at $0.040 are $0.080 on one row, which is why the detail page labels it
     * "Biaya total" beside the attempt count.
     */
    expect(formatMicroUsd(80_000)).toBe('$0.080')
  })

  it('says nothing rather than zero when the cost was never recorded', () => {
    /* Invariant 9's other half: a NULL cost is "we do not know", not "it was free". */
    expect(formatMicroUsd(null)).not.toBe('$0.000')
  })

  it('renders latency as a duration and a miss as the missing marker', () => {
    expect(formatJobLatency(73_925)).toBe('1:14')
    expect(formatJobLatency(null)).not.toMatch(/\d/)
  })
})

describe('cost source — where the latest Biaya total write got its number', () => {
  const REAL_SHAPE_SIDECAR = [
    'provider:   openrouter',
    'model:      glm-4.6v',
    'purpose:    selfie',
    'resolution: 1024x1536 2:3',
    'seed:       42',
    'reference:  none (RU-18)',
    '',
    '--- prompt as sent ---',
    'sebuah foto selfie di pantai',
  ].join('\n')

  it('spells the two column values the way a reader sees them', () => {
    expect(formatCostSourceLabel('openrouter')).toBe('openrouter api response')
    expect(formatCostSourceLabel('fallback')).toBe('fallback constant')
    expect(formatCostSourceLabel(null)).toBeNull()
  })

  it('inserts the line right after "resolution:", not anywhere else', () => {
    const spliced = withCostSourceLine(REAL_SHAPE_SIDECAR, 'openrouter')
    const lines = spliced?.split('\n') ?? []
    const resolutionIdx = lines.findIndex((l) => l.startsWith('resolution:'))
    expect(lines[resolutionIdx + 1]).toBe('cost source: openrouter api response')
  })

  it('a null sidecar (bare prompt) passes through untouched', () => {
    expect(withCostSourceLine(null, 'openrouter')).toBeNull()
  })

  it('an unknown source (still pending, or predates the column) inserts nothing', () => {
    expect(withCostSourceLine(REAL_SHAPE_SIDECAR, null)).toBe(REAL_SHAPE_SIDECAR)
  })

  it('a sidecar from before this convention existed is left exactly as it was', () => {
    const oldShape = 'model: glm-4.6v\n--- prompt as sent ---\nhalo'
    expect(withCostSourceLine(oldShape, 'openrouter')).toBe(oldShape)
  })
})

describe('job id line — the id spliced above "provider:" (2026-09-17)', () => {
  const REAL_SHAPE_SIDECAR = [
    'provider:   openrouter',
    'model:      glm-4.6v',
    'purpose:    selfie',
    'resolution: 1024x1536 2:3',
    'seed:       42',
    'reference:  none (RU-18)',
    '',
    '--- prompt as sent ---',
    'sebuah foto selfie di pantai',
  ].join('\n')

  it('unshifts "job: <id>" as the new first line, above "provider:"', () => {
    const spliced = withJobIdLine(REAL_SHAPE_SIDECAR, 'HIiyRr5_zemf')
    const lines = spliced?.split('\n') ?? []
    expect(lines[0]).toBe('job:        HIiyRr5_zemf')
    expect(lines[1]).toBe('provider:   openrouter')
  })

  it('composes with withCostSourceLine — job id ends up first, cost source stays after resolution', () => {
    const spliced = withJobIdLine(withCostSourceLine(REAL_SHAPE_SIDECAR, 'openrouter'), 'abc123')
    const lines = spliced?.split('\n') ?? []
    expect(lines[0]).toBe('job:        abc123')
    const resolutionIdx = lines.findIndex((l) => l.startsWith('resolution:'))
    expect(lines[resolutionIdx + 1]).toBe('cost source: openrouter api response')
  })

  it('a null sidecar (bare prompt) passes through untouched', () => {
    expect(withJobIdLine(null, 'abc123')).toBeNull()
  })

  it('a sidecar from before this convention existed is left exactly as it was', () => {
    const oldShape = 'model: glm-4.6v\n--- prompt as sent ---\nhalo'
    expect(withJobIdLine(oldShape, 'abc123')).toBe(oldShape)
  })
})

describe('splitSidecarReference splits around the "reference:" line\'s value', () => {
  const withUrl = [
    'provider:   openrouter',
    'reference:  https://blob.example.test/nina/x/selfie-abc.jpg',
    '',
    '--- prompt as sent ---',
    'sebuah foto selfie di pantai',
  ].join('\n')

  it('carries the label into `before` and the raw URL into `referenceUrl`', () => {
    const { before, referenceUrl, after } = splitSidecarReference(withUrl)
    expect(before.endsWith('reference:  ')).toBe(true)
    expect(referenceUrl).toBe('https://blob.example.test/nina/x/selfie-abc.jpg')
    expect(after.startsWith('\n')).toBe(true)
    expect(before + after).not.toContain('https://')
  })

  it('rejoins to the original text once a caller re-inserts the URL', () => {
    const { before, referenceUrl, after } = splitSidecarReference(withUrl)
    expect(before + referenceUrl + after).toBe(withUrl)
  })

  it('the "none (RU-18)" placeholder answers no URL, whole text in `before`', () => {
    const noneShape = withUrl.replace(
      'https://blob.example.test/nina/x/selfie-abc.jpg',
      'none (RU-18)',
    )
    expect(splitSidecarReference(noneShape)).toEqual({
      before: noneShape,
      referenceUrl: null,
      after: '',
    })
  })

  it('a block with no reference line at all is an honest pass-through', () => {
    const bare = 'sebuah foto selfie di pantai'
    expect(splitSidecarReference(bare)).toEqual({ before: bare, referenceUrl: null, after: '' })
  })
})

describe('nextSoftNavJump is the one-shot rule for a jump that does not remount', () => {
  it('lands a value it has not seen, from no prev and from a different one', () => {
    expect(nextSoftNavJump(null, 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
    expect(nextSoftNavJump('aaaaaaaaaaaa', 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
  })

  it('does not land the value it was initialised to — mount is the ref path’s job', () => {
    /* The caller’s ref starts at the first render’s raw value, so the mount render answers
     * "already seen" and the jumpRef path owns the landing. */
    expect(nextSoftNavJump('bbbbbbbbbbbb', 'bbbbbbbbbbbb')).toBeNull()
  })

  it('after the strip (null resets prev), the same value is new again', () => {
    /* Mount: seen = raw, nothing to do. The landing strips the param, the next render sees null,
     * the caller resets prev — so a second tap of the SAME hit re-lands. */
    let prev: string | null = 'bbbbbbbbbbbb'
    expect(nextSoftNavJump(prev, 'bbbbbbbbbbbb')).toBeNull()
    prev = 'bbbbbbbbbbbb'
    const stripped: string | null = null
    expect(nextSoftNavJump(prev, stripped)).toBeNull()
    prev = stripped
    expect(nextSoftNavJump(prev, 'bbbbbbbbbbbb')).toBe('bbbbbbbbbbbb')
  })

  it('refuses anything that cannot be one of our ids', () => {
    expect(nextSoftNavJump(null, 'short')).toBeNull()
    expect(nextSoftNavJump('aaaaaaaaaaaa', 'not-an-id-!!')).toBeNull()
  })

  it('has nothing to say when nothing arrived', () => {
    expect(nextSoftNavJump('bbbbbbbbbbbb', null)).toBeNull()
    expect(nextSoftNavJump(null, null)).toBeNull()
  })
})

describe('planJobPhoto — the photograph link', () => {
  const JOB_ID = 'jobAAAAAAAAA'

  it('names the row id in the about-viewer grammar, on the about route', () => {
    /* R2's destination is the EXISTING viewer: `/nina/about?photo=chat.<id>`. The dot spelling is
     * the about codec's (`.` survives URLSearchParams unencoded); the chat page's `?photo=` is a
     * DIFFERENT grammar with a colon, and plan invariant 5 keeps them separate. */
    const plan = planJobPhoto({ jobId: JOB_ID, purpose: 'selfie', imageId: 'imgAAAAAA1234' })
    if (plan.kind !== 'ready') throw new Error('expected a ready plan')
    const url = new URL(plan.href, 'https://example.test')
    expect(url.pathname).toBe('/nina/about')
    expect(url.searchParams.get('photo')).toBe('chat.imgAAAAAA1234')
    expect(plan.href).not.toContain('chat:')
  })

  it('carries the job page as the RETURN leg, so closing the viewer lands back on Detail foto', () => {
    /* The runner's production request: the viewer opened from Detail foto closes back onto
     * Detail foto. History cannot answer it (a deep link has no in-app entry beneath it in a new
     * tab), so the origin travels in the link — and the plan, not the page, spells it. */
    const plan = planJobPhoto({ jobId: JOB_ID, purpose: 'selfie', imageId: 'imgAAAAAA1234' })
    if (plan.kind !== 'ready') throw new Error('expected a ready plan')
    const url = new URL(plan.href, 'https://example.test')
    expect(url.searchParams.get('return')).toBe(`/nina/jobs/${JOB_ID}`)
    /* And the origin survives the platform's own parse as an in-app path. */
    expect(url.searchParams.get('return')).toMatch(/^\//)
    expect(url.searchParams.get('return')).not.toMatch(/^\/\//)
  })

  it('overrides the return leg when a caller supplies one — the list’s own use', () => {
    /* `toNinaJobListItems` passes `NINA_JOBS_HREF` here so a row's full-view link returns to the
     * list rather than opening the row it was tapped from. */
    const plan = planJobPhoto({
      jobId: JOB_ID,
      purpose: 'selfie',
      imageId: 'imgAAAAAA1234',
      returnTo: NINA_JOBS_HREF,
    })
    if (plan.kind !== 'ready') throw new Error('expected a ready plan')
    const url = new URL(plan.href, 'https://example.test')
    expect(url.searchParams.get('return')).toBe(NINA_JOBS_HREF)
  })

  it('draws nothing for a job whose photo row is gone', () => {
    /* Admin Remove deletes the row; a removed session cascades the carrier message. Both arrive
     * as the same `null` from `getNinaJobPhoto` and the same `none` here — never a link the
     * server has not proved. */
    expect(planJobPhoto({ jobId: JOB_ID, purpose: 'selfie', imageId: null })).toEqual({
      kind: 'none',
    })
  })

  it('never links an avatar job, even if a row somehow resolved', () => {
    /* The plan index's DECIDED rule: no job→avatar key exists. The arm lives in `planJobPhoto`
     * and not only in the page's query skip, so a future caller cannot draw the icon by
     * forgetting the skip. */
    expect(planJobPhoto({ jobId: JOB_ID, purpose: 'avatar', imageId: 'imgAAAAAA1234' })).toEqual({
      kind: 'none',
    })
  })
})

describe('planJobReferencePhoto — the reference photo’s link, over the SAME viewer as the output', () => {
  const JOB_ID = 'jobAAAAAAAAA'

  it('opens the chat section when the match names a message image', () => {
    const plan = planJobReferencePhoto({
      jobId: JOB_ID,
      match: { section: 'chat', id: 'imgAAAAAA1234' },
    })
    if (plan.kind !== 'ready') throw new Error('expected a ready plan')
    const url = new URL(plan.href, 'https://example.test')
    expect(url.pathname).toBe('/nina/about')
    expect(url.searchParams.get('photo')).toBe('chat.imgAAAAAA1234')
    expect(url.searchParams.get('return')).toBe(`/nina/jobs/${JOB_ID}`)
  })

  it('opens the album section when the match names an avatar row — unlike planJobPhoto’s fixed "chat"', () => {
    const plan = planJobReferencePhoto({
      jobId: JOB_ID,
      match: { section: 'album', id: 'avaAAAAAA123' },
    })
    if (plan.kind !== 'ready') throw new Error('expected a ready plan')
    const url = new URL(plan.href, 'https://example.test')
    expect(url.searchParams.get('photo')).toBe('album.avaAAAAAA123')
  })

  it('draws nothing when the reference photo was never found — never a link the server has not proved', () => {
    expect(planJobReferencePhoto({ jobId: JOB_ID, match: null })).toEqual({ kind: 'none' })
  })
})

describe('the job list’s own scroll mark', () => {
  it('spells the same query key as the chat mark, and that is fine — different routes never collide', () => {
    expect(JOB_LIST_SCROLL_PARAM).toBe(CHAT_SCROLL_PARAM)
  })
})

describe('encodeJobListScrollMark', () => {
  it('joins the id and the offset with a tilde', () => {
    expect(encodeJobListScrollMark({ jobId: 'jobAAAAAAAAA', offset: 42 })).toBe('jobAAAAAAAAA~42')
  })

  it('rounds a fractional offset', () => {
    expect(encodeJobListScrollMark({ jobId: 'jobAAAAAAAAA', offset: 41.6 })).toBe('jobAAAAAAAAA~42')
  })

  it('round-trips through the decoder', () => {
    const mark = { jobId: 'jobAAAAAAAAA', offset: -12 }
    expect(decodeJobListScrollMark(encodeJobListScrollMark(mark))).toEqual(mark)
  })
})

describe('decodeJobListScrollMark', () => {
  it('reads a well-formed mark', () => {
    expect(decodeJobListScrollMark('jobAAAAAAAAA~250')).toEqual({
      jobId: 'jobAAAAAAAAA',
      offset: 250,
    })
  })

  it('reads a negative offset', () => {
    expect(decodeJobListScrollMark('jobAAAAAAAAA~-250')).toEqual({
      jobId: 'jobAAAAAAAAA',
      offset: -250,
    })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['no separator', 'jobAAAAAAAAA'],
    ['nothing before the separator', '~250'],
    ['nothing after the separator', 'jobAAAAAAAAA~'],
    ['a non-numeric offset', 'jobAAAAAAAAA~soon'],
    ['a fractional offset', 'jobAAAAAAAAA~250.5'],
    // Unlike a chat message id, a job id is ALWAYS exactly lib/id.ts's 12-character shape — an
    // 11- or 13-character id is never one of ours, which is exactly what `isValidId` enforces.
    ['a short id', 'short~250'],
    ['a long id', 'jobAAAAAAAAATOOLONG~250'],
  ])('treats %s as no mark', (_label, raw) => {
    expect(decodeJobListScrollMark(raw)).toBeNull()
  })

  it('refuses an offset past the sanity bound rather than clamping it', () => {
    expect(decodeJobListScrollMark(`jobAAAAAAAAA~${MAX_JOB_LIST_SCROLL_OFFSET_PX + 1}`)).toBeNull()
  })

  it('accepts the bound itself', () => {
    expect(decodeJobListScrollMark(`jobAAAAAAAAA~${MAX_JOB_LIST_SCROLL_OFFSET_PX}`)).toEqual({
      jobId: 'jobAAAAAAAAA',
      offset: MAX_JOB_LIST_SCROLL_OFFSET_PX,
    })
  })

  it('splits on the LAST tilde, so an id may never lose its tail silently', () => {
    expect(decodeJobListScrollMark('a~b~250')).toBeNull()
  })
})

describe('pickJobListScrollAnchor', () => {
  const ROWS: JobListScrollAnchorRow[] = [
    { jobId: 'job000000001', top: 0 },
    { jobId: 'job000000002', top: 200 },
    { jobId: 'job000000003', top: 480 },
  ]

  it('picks the topmost row at or below the viewport top', () => {
    expect(pickJobListScrollAnchor(ROWS, 200)).toEqual({ jobId: 'job000000002', offset: 0 })
  })

  it('records how far below the top edge that row sat', () => {
    expect(pickJobListScrollAnchor(ROWS, 150)).toEqual({ jobId: 'job000000002', offset: 50 })
  })

  it('below every row’s top, picks the last one with a negative offset', () => {
    expect(pickJobListScrollAnchor(ROWS, 1000)).toEqual({ jobId: 'job000000003', offset: -520 })
  })

  it('is null with nothing rendered', () => {
    expect(pickJobListScrollAnchor([], 0)).toBeNull()
  })
})

describe('resolveJobListScrollTop', () => {
  const GEOMETRY = { scrollHeight: 2000, clientHeight: 800 }

  it('re-derives the pixel from where the anchor row is NOW', () => {
    expect(
      resolveJobListScrollTop({
        mark: { jobId: 'job000000003', offset: 50 },
        anchorTop: 780,
        geometry: GEOMETRY,
      }),
    ).toBe(730)
  })

  it('is null when the anchor row is gone — the caller does the ordinary thing', () => {
    expect(
      resolveJobListScrollTop({
        mark: { jobId: 'gone', offset: 50 },
        anchorTop: null,
        geometry: GEOMETRY,
      }),
    ).toBeNull()
  })

  it('clamps into a document that shrank', () => {
    expect(
      resolveJobListScrollTop({
        mark: { jobId: 'job000000003', offset: 0 },
        anchorTop: 1900,
        geometry: GEOMETRY,
      }),
    ).toBe(1200)
  })
})

describe('withJobListScrollMark — widening the full-view link’s own return leg', () => {
  const JOB_ID = 'jobAAAAAAAAA'

  it('appends ?at= onto the return value, leaving the outer photo param untouched', () => {
    const photoHref = planJobPhoto({
      jobId: JOB_ID,
      purpose: 'selfie',
      imageId: 'imgAAAAAA1234',
      returnTo: NINA_JOBS_HREF,
    })
    if (photoHref.kind !== 'ready') throw new Error('expected a ready plan')

    const widened = withJobListScrollMark(photoHref.href, { jobId: JOB_ID, offset: -40 })
    const url = new URL(widened, 'https://example.test')
    expect(url.pathname).toBe('/nina/about')
    expect(url.searchParams.get('photo')).toBe('chat.imgAAAAAA1234')

    const returnUrl = new URL(url.searchParams.get('return')!, 'https://example.test')
    expect(returnUrl.pathname).toBe(NINA_JOBS_HREF)
    expect(returnUrl.searchParams.get(JOB_LIST_SCROLL_PARAM)).toBe(`${JOB_ID}~-40`)
  })

  it('the widened return value still passes an in-app-path check — a query string is not a second "/"', () => {
    const widened = withJobListScrollMark(
      `/nina/about?photo=chat.imgAAAAAA1234&return=${encodeURIComponent(NINA_JOBS_HREF)}`,
      { jobId: JOB_ID, offset: 10 },
    )
    const returnValue = new URL(widened, 'https://example.test').searchParams.get('return')!
    expect(returnValue.startsWith('/')).toBe(true)
    expect(returnValue.startsWith('//')).toBe(false)
    expect(returnValue.includes('\\')).toBe(false)
  })

  it('a photo href with no return leg at all is handed back unchanged — nothing to widen', () => {
    const bare = '/nina/about?photo=chat.imgAAAAAA1234'
    expect(withJobListScrollMark(bare, { jobId: JOB_ID, offset: 10 })).toBe(bare)
  })
})
