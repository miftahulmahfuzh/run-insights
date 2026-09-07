import { describe, expect, it } from 'vitest'

import { SESSION_PARAM } from '@/lib/nina/active'
import { CHAT_SCROLL_PARAM } from '@/lib/nina/scroll'
import {
  JOB_JUMP_PARAM,
  NINA_JOBS_HREF,
  NINA_JOB_JUMP_NOTE,
  NINA_JOB_STAGE_LABEL,
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
  parseNinaJumpParam,
  planJobJump,
  toNinaJobListItems,
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

  it('offers a redo on the failed row and on no other', () => {
    /*
     * The two derivations that share one `stage`: a row that shows a failure sentence is exactly a
     * row that offers a redo. Coupling them here rather than in the component is the point of
     * `jobCanRedo` existing at all — `vitest` is `environment: 'node'` and cannot reach a rule
     * living inside `NinaJobActions`.
     */
    const [open] = toNinaJobListItems([base])
    expect(open!.canRedo).toBe(false)

    const [failed] = toNinaJobListItems([{ ...base, status: 'failed', errorCode: 'stale' }])
    expect(failed!.canRedo).toBe(true)
    expect(failed!.errorLabel).not.toBeNull()

    const [done] = toNinaJobListItems([{ ...base, status: 'ok', errorCode: null }])
    expect(done!.canRedo).toBe(false)
  })

  it('titles a row by its scene, and by its purpose when it has none', () => {
    /* The row's visible title and the redo button's accessible name are this one string. Two
     * copies of it would drift, and the drift would be invisible to anyone who can see the
     * screen. */
    const [item] = toNinaJobListItems([base])
    expect(ninaJobTitle(item!)).toBe('sore di kos')
    expect(ninaJobTitle({ scene: null, purpose: 'selfie' })).toBe('Selfie')
    expect(ninaJobTitle({ scene: null, purpose: 'avatar' })).toBe('Foto profil')
  })
})

describe('jobCanRedo is R1’s one rule, and it is narrow', () => {
  it('says yes to a failed job', () => {
    expect(jobCanRedo('failed')).toBe(true)
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

  it('never offers a redo for a photograph that already exists', () => {
    /* A re-roll of a `done` job is a different feature nobody asked for, and it costs one of six
     * generations a day. */
    expect(jobCanRedo('done')).toBe(false)
  })
})

describe('planJobJump names each way there is no bubble', () => {
  const p = { sessionParam: SESSION_PARAM }

  it('jumps when the message resolved', () => {
    const jump = planJobJump({
      ...p,
      purpose: 'selfie',
      replyToId: 'bbbbbbbbbbbb',
      replySessionId: 'cccccccccccc',
    })
    expect(jump.kind).toBe('ready')
    expect(jump.kind === 'ready' && jump.href).toContain('bbbbbbbbbbbb')
    expect(jump.kind === 'ready' && jump.href).toContain('cccccccccccc')
  })

  it('an avatar job never had a triggering message', () => {
    expect(
      planJobJump({ ...p, purpose: 'avatar', replyToId: null, replySessionId: null }).kind,
    ).toBe('avatar')
  })

  it('a selfie job with no reply target says so separately', () => {
    expect(
      planJobJump({ ...p, purpose: 'selfie', replyToId: null, replySessionId: null }).kind,
    ).toBe('no-message')
  })

  it('an unresolvable message is gone, whether it or its session was deleted', () => {
    /*
     * MEASURED: phase 6 counted fourteen `kind='image'` rows in production whose `args.replyToId`
     * resolves to nothing. This arm is the common case on the detail page, not an edge.
     */
    expect(
      planJobJump({ ...p, purpose: 'selfie', replyToId: 'bbbbbbbbbbbb', replySessionId: null })
        .kind,
    ).toBe('gone')
  })

  it('does not tell the runner a live session was removed', () => {
    /*
     * `deleteNinaMessage` deletes a message while its session survives (reachable from
     * `lib/admin/chatPhotoActions.ts`), so `gone` cannot claim the session went with it. One arm,
     * one sentence, and it names both causes without asserting either.
     */
    expect(NINA_JOB_JUMP_NOTE.gone).toContain('kehapus')
  })

  it('every refusal has a sentence', () => {
    for (const kind of ['avatar', 'no-message', 'gone'] as const) {
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
