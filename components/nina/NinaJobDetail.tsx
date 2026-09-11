'use client'

import { ButtonLink, Card, Stat } from '@/components/ui'
import {
  NINA_JOB_JUMP_NOTE,
  formatJobLatency,
  formatMicroUsd,
  type NinaJobJump,
  type NinaJobPhoto,
  type NinaJobStage,
} from '@/lib/nina/jobview'
import { NinaJobElapsed } from './NinaJobElapsed'

/**
 * **R1's image-generation detail page: "the exact prompt of image generation, how long the job has
 * been going on, what is the error status, etc." — plus the controls to what the job produced: the
 * bubble that asked, and the photograph itself.**
 *
 * ── EVERY PROP IS SERIALIZABLE, AND BOTH FACTS ARRIVE ALREADY DECIDED ──────────────────────────
 * `planJobJump` and `planJobPhoto` ran on the server, against ownership-scoped reads. This
 * component renders the answers; it does not re-derive them. That is the same split
 * `planSessionRemoval` keeps one screen over, and for the same reason: the client must not hold a
 * second opinion about a question the database already answered. `photo` is REQUIRED for exactly
 * that reason — a page that forgot to resolve the fact cannot compile past the question
 * (`planJobPhoto`'s header).
 *
 * ── WHY BOTH CONTROLS ARE A `ButtonLink` AND NOT A BUTTON ─────────────────────────────────────
 * Each is a navigation to a URL that exists, so both keep the platform's long-press, middle-click
 * and back behaviour and Next prefetches their destinations. The same argument `NinaSidebar`'s
 * avatar link makes, and the same one `NewChatButton` makes in the other direction (its
 * destination does not exist until an action has run, so it is a button).
 *
 * ── WHY THE CONTROLS ARE ICON-ONLY, AND WHERE THE WORDS WENT ──────────────────────────────────
 * R1: "ubah tombol ini menjadi icon tanpa text". The words the labelled button carried did not
 * become decoration — they became the control's NAME (`aria-label` "Buka chat-nya", verbatim),
 * because an icon-only control a screen reader announces as "link" is a control that lost its
 * meaning in the trade. `SessionRow`'s three menu buttons and the attach strip's two sends are the
 * pattern and their headers are the record; the glyphs are Lucide, inlined verbatim per the
 * convention documented beside them at this file's foot. Both wear `variant="secondary"` on the
 * same precedents — every icon-only control in this app is a tinted disc, not an ink slab; an
 * icon-only `primary` would be a black square whose meaning the reader has to guess.
 *
 * ── THE ROW'S LAYOUT, AND WHERE EACH RULE COMES FROM ──────────────────────────────────────────
 * One `flex items-center gap-2` row, on the attach strip's (`NinaAboutScreen`'s two sends beside
 * its square delete): the jump — this row's reason for existing since R1 — takes `flex-1` where
 * the full-width labelled button used to own the whole line, the sentence takes `flex-1` when IT
 * is the one standing there, and the photo control is SQUARE at the row's end, taking the space it
 * needs and no more — the strip's delete, the control "that ends something", is the precedent for
 * sitting beside rather than filling. The two facts are independent, and every combination renders:
 * jump ready + photo ready is two icons; a refusal sentence + photo ready is the sentence with the
 * icon beside it (the `no-message` case — that job still produced its photograph); a sentence
 * alone is byte-for-byte what this row always rendered.
 *
 * ── WHY THE CARD HAS ONE SECTION, NOT TWO ─────────────────────────────────────────────────────
 * R1 asks for the exact prompt by name, and `sidecarText()` already ships it: every writer composes
 * `args.sidecar` as the metadata block, a `--- prompt as sent ---` rule and the prompt verbatim —
 * so a separate Prompt section repeated half the card inside the other half. It is gone
 * (2026-09-11): the sidecar IS the prompt display. A row that somehow carries only the bare prompt
 * still shows that — `toJobRecord` parses the two fields independently, though every writer since
 * d61cdba writes them together, so the arm is type-honesty rather than a data case — and when
 * neither exists, the line says so instead of rendering an empty card.
 */
export function NinaJobDetail({
  stage,
  stageLabel,
  errorLabel,
  purpose,
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
  photo,
}: {
  stage: NinaJobStage
  stageLabel: string
  errorLabel: string | null
  purpose: 'selfie' | 'avatar'
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
  /**
   * The photograph fact, resolved by `getNinaJobPhoto` + `planJobPhoto` on the server. `none`
   * renders NOTHING — no sentence exists for an absent photograph; the icon's absence is the
   * statement ("never a link the server has not proved").
   */
  photo: NinaJobPhoto
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
          The jump AND the photograph — R1 and R2, two independent facts on one row. `'ready'` is a
          control; the other three jump kinds are a sentence, because a button that navigates
          nowhere is the one thing R1's degradations must not become (see `planJobJump` — and note
          the sentence is the COMMON case here, not the rare one: phase 6 measured fourteen image
          jobs whose `args.replyToId` resolves to nothing). The photo control is drawn exactly when
          the server proved the row (`planJobPhoto`), and no sentence stands in for it when it is
          absent — an absent photograph is stated by the icon's absence, which is the honesty the
          admin Remove case demands.
        */}
        <div className="mt-4 flex items-center gap-2">
          {jump.kind === 'ready' ? (
            <ButtonLink
              href={jump.href}
              size="md"
              variant="secondary"
              className="flex-1"
              aria-label="Buka chat-nya"
            >
              <MessageCircleIcon />
            </ButtonLink>
          ) : (
            <p className="max-w-[54ch] min-w-0 flex-1 rounded-field border border-dashed border-rule px-3 py-2.5 text-[12px] leading-[1.5] font-medium text-ink-2">
              {NINA_JOB_JUMP_NOTE[jump.kind]}
            </p>
          )}
          {photo.kind === 'ready' && (
            <ButtonLink
              href={photo.href}
              size="md"
              variant="secondary"
              aria-label="Lihat foto ukuran penuh"
            >
              <Maximize2Icon />
            </ButtonLink>
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
        {/*
          ONE section, not two: `sidecarText()` composes `args.sidecar` as the metadata block plus
          `--- prompt as sent ---` and the prompt verbatim, so a separate Prompt section repeated
          half this card inside the other half. `sidecar ?? prompt` is the type-honesty arm — every
          writer writes both args fields together (d61cdba onward), so the bare prompt renders only
          where a sidecar genuinely never existed.
        */}
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Catatan foto
        </h2>
        {sidecar === null && prompt === null ? (
          <p className="text-[13px] font-medium text-ink-3">
            Job ini nggak nyimpen catatan fotonya — barisnya dibuat sebelum catatan itu ada.
          </p>
        ) : (
          <p className="text-[13px] leading-[1.55] font-medium whitespace-pre-wrap text-ink-2">
            {sidecar ?? prompt}
          </p>
        )}
      </Card>
    </div>
  )
}

/*
 * The row's two glyphs, inlined rather than imported — `NinaAboutScreen`'s strip collection note
 * and `SessionRow`'s menu before it. Both are **Lucide** (lucide-static 1.42.0, ISC), fetched
 * 2026-09-10 from `unpkg.com/lucide-static@1.42.0/icons/<name>.svg` and copied verbatim — the
 * paths and the root's presentation attributes exactly as published; the only adaptations are JSX
 * spelling (`stroke-width` -> `strokeWidth`) and dropping lucide's own `class`, `width` and
 * `height` for our `className` and the 18px size. Every glyph is 18px in `currentColor` and
 * `aria-hidden` — the accessible name is the `aria-label` on the button, never the picture.
 * (lucide-static is NOT a dependency of this repo, so there is no import to get wrong — the paths
 * below ARE the copy.)
 *
 * `message-circle` is the conversation the job came from — the speech-bubble noun chat UIs draw
 * for exactly this, which is what "Buka chat-nya" points at (`message-square-plus`, the sidebar
 * rail's glyph, is the app's noun for a conversation that does not exist yet; this one exists).
 * `maximize-2` is the two corners pulled outward — the glyph that means "bigger, full screen",
 * which is what the tap does: the job's photograph in the existing `/nina/about` viewer.
 */

/** "Buka chat-nya" — the bubble that asked for this photograph. Lucide's `message-circle`, verbatim. */
function MessageCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
    </svg>
  )
}

/** "Lihat foto ukuran penuh" — the job's photograph in the full-screen viewer. Lucide's `maximize-2`, verbatim. */
function Maximize2Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
      <path d="M9 21H3v-6" />
    </svg>
  )
}
