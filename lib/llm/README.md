# `lib/llm/` — the two model clients

Two endpoints, two clients, no shared code. Read this before adding a third caller.

| | vision (F04) | narrative (F07) |
|---|---|---|
| Endpoint | `LLM_VISION_BASE_URL` — `api.z.ai/api/coding/paas/v4` | `LLM_BASE_URL` — `api.z.ai/api/anthropic` |
| Wire format | OpenAI Chat Completions | Anthropic Messages |
| Client | plain `fetch` (`vision.ts`) | `@anthropic-ai/sdk` (`client.ts`) |
| Auth header | `Authorization: Bearer` | `x-api-key`, sent by the SDK |
| Credential | `LLM_API_KEY` | `LLM_API_KEY` — the same one (R-40) |
| Token-floor guard (D3) | **yes, and it is the point** | no, and adding one would be dead code |
| Repair round-trip | text-only, images never resent (R-2) | text-only; there are no images |

The token-floor guard exists because the *Anthropic-shaped* endpoint accepts an image block,
returns HTTP 200, silently drops the image and invents numbers (IMPLEMENTATION_PLAN §1.1). F07
sends no images, so that failure cannot occur here and there is nothing to guard.

## Calling `getOrCreateInsight` correctly

**Never from a page's own render path.** A cache miss is one or two model calls: measured
13.6–16.4 s each against live `glm-5.3` on 2026-08-21. The run detail page's numbers are stored,
deterministic and already correct — F06 shipped before F07 exactly so that screen is complete
without prose — and blocking its render on the model trades a useful screen for a blank one.

The two sanctioned callers, enforced by `scripts/check-llm-payload-boundary.mjs` in CI:

1. **`lib/insights/actions.ts`** — Server Actions, fired from `components/insights/InsightTrigger.tsx`
   in a client effect after the page has painted. D7 picks a Server Action over a Route Handler:
   the route-handler list is fixed at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
   `/api/cron/*`, and generating an insight writes a row, so it is a mutation.
2. **`app/api/cron/rollup/route.ts`** — the nightly week/month refresh.

## `payload: null` is not an error

It is the expected shape of "no narrative yet", and it has three separate causes that all render
the same way: the insight has not been generated, the model was unreachable, or the model answered
twice with something that did not validate. **There is no deterministic fallback for prose**
(R-17): a canned sentence in a coach's voice is the model inventing a fact, moved into our code so
it looks accountable. F08's `InsightCard` renders its reserved slot, the numbers and charts around
it are unaffected, and the next page view retries for free because a failure persists nothing.

Do not surface it loudly. Do not add a retry button. Do not log it as an error.

## Editing a prompt

`facts_hash` is a hash of the numbers, so a prompt edit does not move it and the stale insight
would serve forever. Bump the matching `*_PROMPT_VERSION` in `prompts/narrate.ts` **in the same
commit** — and note that "the prompt" includes `REPORT_TOOL`, whose property descriptions
measurably change what the model returns.

Then re-run `npm run test:live:narrate`. It costs a few cents and about 35 seconds.
