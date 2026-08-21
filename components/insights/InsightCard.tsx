import { Card, Eyebrow } from '@/components/ui/Card'
import { EmptySlot } from '@/components/ui/EmptyState'

/**
 * F07's slot. **F08 owns this container; it does not own a single word inside it.**
 *
 * The narrative is written by `glm-5.3` from numbers F06 computed (D2 — the model's only permitted
 * operation on a number is to copy it into a sentence), stored in `insights.payload`, and read here.
 * Three states, and the third is the one that matters:
 *
 *   1. **Prose available** — headline, verdict pill, what happened, the observations, what to do
 *      next, and the question only the runner can answer.
 *   2. **Not generated yet** — a reserved slot with a fixed minimum height, so the charts below do
 *      not jump when the prose arrives. §9's rule.
 *   3. **`unavailable`** — R-19/§9: when the model fails twice, the correct state is *silence about
 *      the prose*, never a fabricated summary and never a scary error. The numbers on the rest of
 *      the page are unaffected and are the point of the screen anyway.
 *
 * ── WHY THE PAYLOAD IS PARSED HERE RATHER THAN TRUSTED ─────────────────────────────────────────
 * `insights.payload` is `jsonb`, so it arrives as `unknown` — and F07's own plan documents the
 * measured failure that motivates its Zod schema: a real captured response omitted
 * `observations[].title` from every entry while the server returned 200. F07 validates on the way
 * IN; this reads on the way OUT, and a row written before a schema change would otherwise crash a
 * page whose numbers are all perfectly fine. So the structural check below is deliberately
 * tolerant: whatever is present renders, whatever is missing is skipped, and nothing throws.
 * F07 owns the shape; this file owns not dying when a stored row predates it.
 */

interface Observation {
  title?: string
  detail?: string
  metric?: string
}

interface InsightPayloadish {
  headline?: string
  verdict?: string
  whatHappened?: string
  observations?: Observation[]
  doNext?: string[]
  questionForRunner?: string
}

const VERDICTS = ['easy', 'moderate', 'hard', 'very hard'] as const
type Verdict = (typeof VERDICTS)[number]

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v): v is string => v !== undefined) : []
}

/** Tolerant, non-throwing, and total: every branch returns something renderable or nothing. */
export function readInsightPayload(payload: unknown): InsightPayloadish | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  const p = payload as Record<string, unknown>

  const observations = Array.isArray(p.observations)
    ? p.observations
        .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
        .map((o) => ({ title: str(o.title), detail: str(o.detail), metric: str(o.metric) }))
        .filter((o) => o.title || o.detail)
    : []

  const out: InsightPayloadish = {
    headline: str(p.headline),
    verdict: str(p.verdict),
    whatHappened: str(p.whatHappened),
    observations,
    doNext: strings(p.doNext),
    questionForRunner: str(p.questionForRunner),
  }

  // Nothing usable at all is the same as no insight — the caller then renders the pending slot
  // rather than an empty card with a heading and no content.
  return out.headline || out.whatHappened || observations.length > 0 ? out : null
}

/**
 * The verdict pill. Four fixed values from F07's enum, on the status scale rather than on a themed
 * hue — the *severity* of an effort is not a brand colour, and dataviz's status palette exists
 * exactly so a "very hard" reads the same everywhere in the app.
 *
 * The label is always the word, never the colour alone.
 */
function VerdictPill({ verdict }: { verdict: string }) {
  const known = (VERDICTS as readonly string[]).includes(verdict) ? (verdict as Verdict) : null
  const tone =
    known === 'very hard'
      ? 'bg-warn-soft text-warn'
      : known === 'hard'
        ? 'bg-accent-soft text-ink-2'
        : 'bg-paper-2 text-ink-2'

  return (
    <span
      className={`shrink-0 rounded-pill px-[10px] py-[3px] text-[10px] font-semibold tracking-[0.04em] uppercase ${tone}`}
    >
      {verdict}
    </span>
  )
}

export function InsightCard({
  payload,
  scopeLabel,
  children,
}: {
  /** `insights.payload`, straight off the row. Null when no insight exists yet. */
  payload: unknown
  /** "This run", "This week", "This month" — the eyebrow, so one component serves all three scopes. */
  scopeLabel: string
  /** F08's own flags render inside the same card, below the prose (§2.2's wireframe). */
  children?: React.ReactNode
}) {
  const insight = readInsightPayload(payload)

  return (
    <Card className="min-h-[168px]">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <Eyebrow>{scopeLabel}</Eyebrow>
        {insight?.verdict && <VerdictPill verdict={insight.verdict} />}
      </div>

      {insight ? (
        <>
          {insight.headline && (
            <p className="text-[19px] leading-[1.3] font-semibold text-ink">{insight.headline}</p>
          )}
          {insight.whatHappened && (
            <p className="mt-2.5 text-[13px] leading-[1.55] font-medium text-ink-2">
              {insight.whatHappened}
            </p>
          )}

          {insight.observations && insight.observations.length > 0 && (
            <ul className="mt-4 space-y-3">
              {insight.observations.map((o, i) => (
                <li key={`${o.title ?? 'observation'}-${i}`}>
                  {o.title && <p className="text-[13px] font-semibold text-ink">{o.title}</p>}
                  {o.detail && (
                    <p className="mt-0.5 text-[13px] font-medium text-ink-2">{o.detail}</p>
                  )}
                  {o.metric && (
                    <p className="mt-0.5 text-[11px] font-semibold text-ink-3 tabular-nums">
                      {o.metric}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {insight.doNext && insight.doNext.length > 0 && (
            <div className="mt-4 rounded-field bg-paper-2 p-3.5">
              <p className="text-[10px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
                Next
              </p>
              <ul className="mt-1.5 space-y-1">
                {insight.doNext.map((item) => (
                  <li key={item} className="text-[13px] font-medium text-ink-2">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {insight.questionForRunner && (
            /* The one thing the data cannot tell you. Deliberately last, and deliberately quiet:
               it is a question, not a prompt to act. */
            <p className="mt-4 text-[13px] font-medium text-ink-3 italic">
              {insight.questionForRunner}
            </p>
          )}
        </>
      ) : (
        <EmptySlot>
          The written analysis is not ready for this one yet. Every number on this screen is already
          final — the prose is the only thing waiting.
        </EmptySlot>
      )}

      {children}
    </Card>
  )
}
