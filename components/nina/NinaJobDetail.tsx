'use client'

import { ButtonLink, Card, Stat } from '@/components/ui'
import {
  NINA_JOB_JUMP_NOTE,
  formatJobLatency,
  formatMicroUsd,
  type NinaJobJump,
  type NinaJobStage,
} from '@/lib/nina/jobview'
import { NinaJobElapsed } from './NinaJobElapsed'

/**
 * **R1's image-generation detail page: "the exact prompt of image generation, how long the job has
 * been going on, what is the error status, etc." — plus the button back to the bubble that asked.**
 *
 * ── EVERY PROP IS SERIALIZABLE, AND THE JUMP ARRIVES ALREADY DECIDED ──────────────────────────
 * `planJobJump` ran on the server, against an ownership-scoped resolution of `args.replyToId`. This
 * component renders the answer; it does not re-derive it. That is the same split
 * `planSessionRemoval` keeps one screen over, and for the same reason: the client must not hold a
 * second opinion about a question the database already answered.
 *
 * ── WHY A `ButtonLink` AND NOT A BUTTON ───────────────────────────────────────────────────────
 * It is a navigation to a URL that exists, so it keeps the platform's long-press, middle-click and
 * back behaviour and Next prefetches the chat. The same argument `NinaSidebar`'s avatar link makes,
 * and the same one `NewChatButton` makes in the other direction (its destination does not exist
 * until an action has run, so it is a button).
 *
 * ── WHY THE PROMPT IS RENDERED AT ALL ─────────────────────────────────────────────────────────
 * R1 asks for it by name. It is Nina's own generated text about her own photograph, not the private
 * `nina_message_images.description` prose that invariant 5 keeps on the server — and the runner
 * asking "why did that come out like that" has no other way to find out.
 */
export function NinaJobDetail({
  stage,
  stageLabel,
  errorLabel,
  purpose,
  scene,
  mood,
  prompt,
  sidecar,
  seed,
  model,
  attempts,
  costMicroUsd,
  latencyMs,
  createdAtMs,
  createdAtLabel,
  nowMs,
  jump,
}: {
  stage: NinaJobStage
  stageLabel: string
  errorLabel: string | null
  purpose: 'selfie' | 'avatar'
  scene: string | null
  mood: string | null
  prompt: string | null
  sidecar: string | null
  seed: number | null
  model: string
  attempts: number
  costMicroUsd: number | null
  latencyMs: number | null
  createdAtMs: number
  /** Formatted on the SERVER — a formatted instant in a client component is a hydration mismatch. */
  createdAtLabel: string
  nowMs: number
  jump: NinaJobJump
}) {
  const open = stage === 'queued' || stage === 'dispatched' || stage === 'running'

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={
              stage === 'failed'
                ? 'text-[19px] font-semibold text-red'
                : 'text-[19px] font-semibold text-ink'
            }
          >
            {stageLabel}
          </p>
          <p className="text-[19px] font-semibold text-ink tabular-nums">
            {open ? (
              <NinaJobElapsed startedAtMs={createdAtMs} nowMs={nowMs} running />
            ) : (
              formatJobLatency(latencyMs)
            )}
          </p>
        </div>
        <p className="mt-1 text-[11px] font-medium text-ink-3">
          {open ? `Jalan sejak ${createdAtLabel}` : `Dibuka ${createdAtLabel}`}
        </p>

        {errorLabel !== null && (
          <p className="mt-3 max-w-[54ch] rounded-field bg-paper-2 px-3 py-2 text-[13px] leading-[1.5] font-semibold text-red">
            {errorLabel}
          </p>
        )}

        {/*
          The jump. `'ready'` is a control; the other three are a sentence, because a button that
          navigates nowhere is the one thing R1's degradations must not become. See `planJobJump` —
          and note that the sentence is the COMMON case here, not the rare one: phase 6 measured
          fourteen image jobs whose `args.replyToId` resolves to nothing.
        */}
        <div className="mt-4">
          {jump.kind === 'ready' ? (
            <ButtonLink href={jump.href} size="md" fullWidth>
              Buka chat-nya
            </ButtonLink>
          ) : (
            <p className="max-w-[54ch] rounded-field border border-dashed border-rule px-3 py-2.5 text-[12px] leading-[1.5] font-medium text-ink-2">
              {NINA_JOB_JUMP_NOTE[jump.kind]}
            </p>
          )}
        </div>
      </Card>

      <Card className="grid grid-cols-2 gap-4 p-5">
        <Stat label="Jenis" value={purpose === 'avatar' ? 'Foto profil' : 'Selfie'} size="sm" />
        <Stat label="Percobaan" value={String(attempts)} size="sm" />
        {/*
          **"Biaya total", not "Biaya", and it sits beside "Percobaan" for a reason.**
          `nina_turns.cost_micro_usd` is a per-JOB CUMULATIVE TOTAL across attempts — reconciled
          across phases 1, 2, 4 and 7 under invariant 9 (see the plan index's Decisions). Every
          writer on both hosts accumulates: the worker's `finishSelfie`/`finishAvatar`/`closeFailed`
          and the in-platform `completeNinaImageJob`/`requeueNinaImageJob`/`failNinaImageJob`. So a
          job that burned both attempts legitimately reads $0.080, and the attempt count next to it
          is what makes that number legible rather than alarming. Labelling it "Biaya" would invite
          the reader to divide by nothing.
        */}
        <Stat label="Biaya total" value={formatMicroUsd(costMicroUsd)} size="sm" />
        <Stat label="Seed" value={seed === null ? '—' : String(seed)} size="sm" />
        <Stat label="Model" value={model} size="sm" />
        <Stat label="Suasana" value={mood ?? '—'} size="sm" />
      </Card>

      <Card className="p-5">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Prompt
        </h2>
        {scene !== null && <p className="mb-2 text-[13px] font-semibold text-ink-2">{scene}</p>}
        {prompt === null ? (
          <p className="text-[13px] font-medium text-ink-3">
            Job ini nggak nyimpen prompt-nya — barisnya dibuat sebelum kolom itu ada.
          </p>
        ) : (
          <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink">
            {prompt}
          </p>
        )}
        {sidecar !== null && sidecar !== prompt && (
          <>
            <h2 className="mt-4 mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
              Catatan foto
            </h2>
            <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink-2">
              {sidecar}
            </p>
          </>
        )}
      </Card>
    </div>
  )
}
