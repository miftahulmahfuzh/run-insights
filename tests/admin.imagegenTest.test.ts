import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  imageTestPollDelayFor,
  imageTestReason,
  imageTestVerdict,
  imageTestVerdictIsOpen,
  NINA_IMAGE_TEST_GIVE_UP_MS,
  NINA_IMAGE_TEST_POLL_INTERVALS_MS,
  NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS,
  NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS,
  NINA_IMAGE_TEST_VERDICT_LINE,
  NINA_IMAGE_TEST_VERDICT_WHY,
  NINA_IMAGE_TEST_VERDICTS,
  type NinaImageTestJobView,
  type NinaImageTestVerdict,
} from '@/lib/admin/imageGenTestView'
import { NINA_IMAGE_FAILURES } from '@/lib/nina/imagefail'
import {
  NINA_HOST_MAX_DURATION_MS,
  NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_STALE_MS,
} from '@/lib/nina/imagerecipe'

/**
 * R11 and R12's testable surface.
 *
 * `vitest.config.ts` is `environment: 'node'` and its `include` matches no `.tsx`, so there is no
 * render here — the carve-out `tests/admin.tuning.test.ts` states for the same reason: everything
 * about this panel that could be wrong in a way a human would not notice is a pure function in
 * `lib/admin/imageGenTestView.ts`. **That is exactly why the verdict rules are in that module and
 * not inside the component**: a verdict that could lie to the operator has to be assertable.
 *
 * The second half is STRUCTURAL — `tests/admin.memory.test.ts`'s technique, and its stated reason:
 * *a structural guarantee that is only a comment decays.*
 */

const IMAGETEST = 'lib/nina/imagetest.ts'
const ACTIONS = 'lib/admin/imageGenActions.ts'
const VIEW = 'lib/admin/imageGenTestView.ts'
const PANEL = 'components/admin/ImageGenTestPanel.tsx'
const FORM = 'components/admin/ImageGenPanel.tsx'
const PAGE = 'app/admin/image-generation/page.tsx'

/**
 * A source file with its block comments removed — `admin.tuning.test.ts`'s `codeOnly`, copied
 * because it is load-bearing here rather than merely tidy. `lib/nina/imagetest.ts`'s docstring
 * explains at length why it does NOT re-implement the selfie finisher, so a `not.toContain(...)`
 * assertion over the raw text would fail on the prose that proves the property.
 */
function codeOnly(path: string): string {
  return readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function job(over: Partial<NinaImageTestJobView> = {}): NinaImageTestJobView {
  return {
    jobId: 'jobjobjobjo',
    status: 'pending',
    errorCode: 'queued',
    attempts: 0,
    latencyMs: null,
    costMicroUsd: null,
    prompt: 'SUBJECT: ...',
    createdAtMs: 1_760_000_000_000,
    ...over,
  }
}

describe('R11 — the verdict never lies in either direction', () => {
  it('reports a refusal for policy and for nothing else', () => {
    expect(imageTestVerdict(job({ status: 'failed', errorCode: 'policy' }))).toBe('refused')

    /* The property that protects the operator: no other terminal state may read as a refusal.
     * Driven off NINA_IMAGE_FAILURES so a fifth kind added upstream is covered automatically. */
    for (const kind of NINA_IMAGE_FAILURES) {
      if (kind === 'policy') continue
      expect(imageTestVerdict(job({ status: 'failed', errorCode: kind }))).not.toBe('refused')
    }
    /* Including one nobody has invented yet. */
    expect(imageTestVerdict(job({ status: 'failed', errorCode: 'wat' }))).toBe('unknown')
    expect(imageTestVerdict(job({ status: 'failed', errorCode: null }))).toBe('unknown')
  })

  it('classifies timeout, transport and stale as inconclusive, not as a refusal', () => {
    for (const kind of ['timeout', 'transport', 'stale'] as const) {
      expect(imageTestVerdict(job({ status: 'failed', errorCode: kind }))).toBe('inconclusive')
    }
    expect(NINA_IMAGE_TEST_VERDICT_WHY.inconclusive).toContain('NOT a refusal')
  })

  it('reports allowed only for a job that actually succeeded', () => {
    expect(imageTestVerdict(job({ status: 'ok', errorCode: null }))).toBe('allowed')
    /* `jobStage` folds 'repaired' into 'done'; no image writer produces it, and asserting a
     * photograph exists on that evidence would be an invention. */
    expect(imageTestVerdict(job({ status: 'repaired', errorCode: null }))).toBe('unknown')
  })

  it('distinguishes "still running" from "already failed once"', () => {
    expect(imageTestVerdict(job({ attempts: 0 }))).toBe('running')
    /* NINA_IMAGE_MAX_ATTEMPTS = 2, so a first failure is requeued: pending, error_code back to
     * 'queued', attempts incremented. That is a different fact from "still running". */
    expect(NINA_IMAGE_MAX_ATTEMPTS).toBe(2)
    expect(imageTestVerdict(job({ attempts: 1, errorCode: 'queued' }))).toBe('retrying')
    expect(NINA_IMAGE_TEST_VERDICT_LINE.retrying).not.toContain('refus')
  })

  it('reads a claim as running, not as a requeue — attempts counts starts, not failures', () => {
    /* `claimNinaImageJob` bumps `attempts` to 1 in the SAME statement that sets error_code to
     * 'running', so EVERY in-flight attempt — including the first — carries attempts >= 1. The
     * old reading of that counter as "an attempt has already been made and requeued" showed the
     * requeue headline seconds after every click: measured in production on 2026-09-11, job
     * jyMH4MGw-x8k said "The first attempt failed" at t+5 s with latency still NULL and the
     * genuine requeue only landing at t+225 s. The PHASE is the discriminator — 'retrying' is
     * reachable from the requeued 'queued' phase and from nothing else that is still open. */
    expect(imageTestVerdict(job({ attempts: 1, errorCode: 'running' }))).toBe('running')
    expect(imageTestVerdict(job({ attempts: 2, errorCode: 'running' }))).toBe('running')
    /* A row that is open but not yet claimed is on its first attempt too. */
    expect(imageTestVerdict(job({ attempts: 0, errorCode: 'queued' }))).toBe('running')
  })

  it('is idle before anything has been dispatched', () => {
    expect(imageTestVerdict(null)).toBe('idle')
    expect(imageTestVerdictIsOpen('idle')).toBe(false)
  })

  it('polls only while the answer can still change', () => {
    const openStates: NinaImageTestVerdict[] = ['running', 'retrying']
    for (const verdict of NINA_IMAGE_TEST_VERDICTS) {
      expect(imageTestVerdictIsOpen(verdict)).toBe(openStates.includes(verdict))
    }
  })

  it('has a line and a why for every verdict', () => {
    for (const verdict of NINA_IMAGE_TEST_VERDICTS) {
      expect(NINA_IMAGE_TEST_VERDICT_LINE[verdict].length).toBeGreaterThan(0)
      expect(NINA_IMAGE_TEST_VERDICT_WHY[verdict].length).toBeGreaterThan(0)
    }
    /* Exactly one headline may say the provider declined. */
    const declining = NINA_IMAGE_TEST_VERDICTS.filter((v) =>
      /declined|refused/i.test(NINA_IMAGE_TEST_VERDICT_LINE[v]),
    )
    expect(declining).toEqual(['refused'])
  })

  it('falls through to the raw code for a reason it does not know', () => {
    expect(imageTestReason(null)).toBeNull()
    expect(imageTestReason('')).toBeNull()
    expect(imageTestReason('timeout')).toContain('aborted')
    expect(imageTestReason('brand-new-kind')).toBe('brand-new-kind')
  })
})

describe('the poll is bounded, and the bound is derived', () => {
  it('covers two anchored attempts and stops well before the server gives up', () => {
    /* Two attempts at the anchored ceiling is 2 x 235 s = 470 s of legitimate work. The ceiling is
     * the CONSTANT and not a literal, so a ceiling move cannot desync this bound again — the
     * 220 s literal that stood here before read as if 480 s covered drift it no longer covered. */
    expect(NINA_IMAGE_TEST_GIVE_UP_MS).toBeGreaterThan(
      NINA_IMAGE_MAX_ATTEMPTS * NINA_IMAGE_ANCHORED_CALL_TIMEOUT_MS,
    )
    /* And it must stop long before a stale job is given up, or "stopped watching" would be read
     * as "failed" — see the constant's docstring on why this is NOT NINA_IMAGE_STALE_MS. */
    expect(NINA_IMAGE_TEST_GIVE_UP_MS).toBeLessThan(NINA_IMAGE_STALE_MS)
  })

  it('escalates the interval, and never returns zero', () => {
    expect(imageTestPollDelayFor(0)).toBe(NINA_IMAGE_TEST_POLL_INTERVALS_MS.initial)
    expect(imageTestPollDelayFor(NINA_IMAGE_TEST_POLL_MID_AFTER_ATTEMPTS)).toBe(
      NINA_IMAGE_TEST_POLL_INTERVALS_MS.mid,
    )
    expect(imageTestPollDelayFor(NINA_IMAGE_TEST_POLL_LATE_AFTER_ATTEMPTS)).toBe(
      NINA_IMAGE_TEST_POLL_INTERVALS_MS.late,
    )
    expect(imageTestPollDelayFor(9_999)).toBe(NINA_IMAGE_TEST_POLL_INTERVALS_MS.late)
    /* Monotonic, and bounded below — a zero would be a spin loop. */
    let previous = 0
    for (const attempts of [0, 1, 6, 12, 18, 40]) {
      const delay = imageTestPollDelayFor(attempts)
      expect(delay).toBeGreaterThan(0)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })

  it('reaches the give-up in a sane number of round trips', () => {
    let elapsed = 0
    let attempts = 0
    while (elapsed <= NINA_IMAGE_TEST_GIVE_UP_MS && attempts < 500) {
      elapsed += imageTestPollDelayFor(attempts)
      attempts += 1
    }
    /* Enough to answer inside the first minute, few enough that a forgotten tab is not a load
     * generator. */
    expect(attempts).toBeGreaterThan(20)
    expect(attempts).toBeLessThan(120)
  })
})

describe('the dispatch reuses the shipped pipeline', () => {
  const source = codeOnly(IMAGETEST)

  it('checks the cap before it opens a row', () => {
    expect(source.indexOf('ninaImageQuotaLeft')).toBeLessThan(source.indexOf('openNinaImageJob'))
  })

  it('opens one job and fires one generation, and never awaits it', () => {
    expect(source.match(/openNinaImageJob\(/g)).toHaveLength(1)
    expect(source.match(/fireNinaImageGeneration\(/g)).toHaveLength(1)
    expect(source).not.toMatch(/await\s+fireNinaImageGeneration/)
    /* The guarded symbol. It runs from lib/nina/imagerun.ts and nowhere else. */
    expect(source).not.toMatch(/\brunNinaImageJob\s*\(/)
  })

  it('is a selfie job stamped as admin, so the selfie finisher satisfies R12', () => {
    expect(source).toContain("purpose: 'selfie'")
    expect(source).toContain("source: 'admin'")
    expect(source).not.toContain("purpose: 'avatar'")
  })

  it('writes no message and no image row of its own (plan invariant 12)', () => {
    for (const forbidden of [
      'insertNinaMessages',
      'insertNinaMessageImages',
      'finishSelfie',
      'nina_message_images',
    ]) {
      expect(source).not.toContain(forbidden)
    }
  })

  it('resolves the saved reference server-side rather than trusting a URL', () => {
    /* Phase 1 stores `{ source, id }`, never a Blob URL — `updateNinaChatPhotoBlob` moves a chat
     * photograph's blob and keeps its id. Phase 3's contract requires the URL be resolved
     * owner-scoped, so the resolution is what must appear here. */
    expect(source).toContain('resolveNinaPhotoReference(userId, prefs.reference)')
    expect(source).toContain('referenceUrl: reference?.blobUrl ?? null')
  })

  it('reads no provider secret', () => {
    expect(source).not.toContain('OPENROUTER_API_KEY')
  })
})

describe('the gate cannot be forgotten', () => {
  /*
   * Scoped to THIS PHASE'S TWO ACTIONS BY NAME rather than looping over every
   * `export async function` in the file, because phase 4 owns the other exports in it and this
   * phase must not assert anything about their shape. See this plan's Handoffs, item 6 — the
   * `admin.tuning.test.ts` loop additionally requires a `.safeParse(` in every action, and
   * `runNinaImageTestAction` deliberately has no payload to parse.
   */
  it('opens both actions with requireAdmin as the first statement', () => {
    const actions = readFileSync(ACTIONS, 'utf8')
    for (const name of ['runNinaImageTestAction', 'readNinaImageTestAction']) {
      const at = actions.indexOf(`export async function ${name}`)
      expect(at, `${name} is not exported from ${ACTIONS}`).toBeGreaterThan(-1)

      /* This action's body only: up to the next export, or the end of the file. */
      const rest = actions.slice(at)
      const nextExport = rest.indexOf('\nexport ', 1)
      const body = nextExport === -1 ? rest : rest.slice(0, nextExport)

      const gate = body.indexOf('await requireAdmin()')
      expect(gate, `${name} does not call requireAdmin()`).toBeGreaterThan(-1)
      /* And it is the FIRST statement — before any read and before any use of an argument. */
      for (const later of ['ninaImageQuotaLeft(', 'dispatchNinaImageTest(', 'isValidId(']) {
        const useAt = body.indexOf(later)
        if (useAt > -1) expect(gate, `${name} reaches ${later} before the gate`).toBeLessThan(useAt)
      }
    }
  })

  it('gates the page before it reads anything', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toContain('await requireAdmin()')
  })

  it('reports a refusal as a value, never as a throw', () => {
    const source = codeOnly(ACTIONS)
    const at = source.indexOf('export async function runNinaImageTestAction')
    expect(at).toBeGreaterThan(-1)
    const body = source.slice(at)
    expect(body).toContain('ok: false')
    expect(body).not.toMatch(/throw new Error/)
  })
})

describe('the surface holds the admin invariants', () => {
  it('declares the route ceiling as a literal, because segment config is statically analysed', () => {
    const source = readFileSync(PAGE, 'utf8')
    /* `extract.pollSchedule.test.ts`'s regex, on the same export. */
    const match = /export const maxDuration = (\d+)/.exec(source)
    expect(match).not.toBeNull()
    expect(Number(match?.[1])).toBe(300)
    expect(NINA_HOST_MAX_DURATION_MS).toBe(300_000)
    /* Paired with the dynamic export every other /admin page carries, not instead of it. */
    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })

  it('mounts the test panel at phase 4’s seam, exactly once, and the seam is gone', () => {
    const source = readFileSync(FORM, 'utf8')
    expect(source.match(/<ImageGenTestPanel\b/g)).toHaveLength(1)
    expect(source).toContain("from '@/components/admin/ImageGenTestPanel'")
    expect(source).not.toContain('SEAM — PHASE 6')
  })

  it("declares 'use client' and reaches nothing server-only", () => {
    /* `admin.tuning.test.ts`, verbatim rule and verbatim list. */
    expect(readFileSync(PANEL, 'utf8').startsWith("'use client'")).toBe(true)
    const source = codeOnly(PANEL)
    for (const forbidden of [
      'server-only',
      '@/lib/nina/queries',
      '@/lib/db/',
      '@/lib/env',
      '@/lib/admin/requireAdmin',
      '@/components/ui/AppShell',
    ]) {
      expect(source, `${PANEL} reaches ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('keeps the view module client-safe and free of a second classifier', () => {
    const source = codeOnly(VIEW)
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('@/lib/db')
    /* It LOOKS UP the classification; it must not recompute it. */
    expect(source).not.toContain('POLICY_BODY_RE')
    expect(source).not.toContain('POLICY_STATUSES')
    expect(source).not.toContain('classifyImageFailure')
    /* And it reuses the one rule about a column with two meanings. */
    expect(source).toContain('jobStage(')
  })

  it('shows the quota before the click and disables the button when capped', () => {
    const source = codeOnly(PANEL)
    expect(source).toContain('quotaLeft')
    expect(source).toMatch(/disabled=\{[^}]*capped/)
    /* The verdict copy is the view module's, not the component's. */
    expect(source).toContain('NINA_IMAGE_TEST_VERDICT_LINE[verdict]')
    expect(source).toContain('NINA_IMAGE_TEST_VERDICT_WHY[verdict]')
  })

  it('asks a second time about nothing — R1, the standing ruling for this surface', () => {
    const source = readFileSync(PANEL, 'utf8')
    for (const banned of ['window.confirm', '<dialog', 'showModal', 'Are you sure', 'confirming']) {
      expect(source, `${PANEL} must not contain "${banned}"`).not.toContain(banned)
    }
  })

  it('polls in a sequential loop and cleans the timer up', () => {
    const source = codeOnly(PANEL)
    /* ChatScreen.tsx's rule: a tick must not fire while the previous request is in
     * flight. So: setTimeout re-armed after the await, never setInterval. */
    expect(source).not.toContain('setInterval')
    expect(source).not.toContain('clearInterval')
    expect(source).toContain('setTimeout')
    expect(source).toContain('clearTimeout')
    expect(source).toContain('cancelled')
    expect(source).toContain('NINA_IMAGE_TEST_GIVE_UP_MS')
    /* And no page-wide refresh: the read action carries the new state. */
    expect(source).not.toContain('router.refresh')
  })

  it('awaits no guarded model entry point in any of this phase’s files', () => {
    /* Plan invariant 5 / ci:llm-payload-guard Rule 2, restated where a reader will see it. */
    for (const path of [IMAGETEST, ACTIONS, VIEW, PANEL, FORM, PAGE]) {
      const source = codeOnly(path)
      for (const guarded of [
        'runNinaImageJob',
        'runNinaTurn',
        'distillNinaMemory',
        'describeNinaImage',
        'resolveNinaPromises',
        'getOrCreateInsight',
        'rankNinaSearchHits',
        'titleNinaSessionIfNeeded',
        'captionNinaPhoto',
      ]) {
        expect(source, `${path} names ${guarded}`).not.toContain(guarded)
      }
    }
  })
})
