# Nina

## Sub-features

- `/nina`: the chat. The composer ("Message Nina", **Send**, "Add a photo"), her reply as several
  short bubbles, "Nina is typing" while a turn runs, reply/edit/delete per message, the sidebar
  ("Search all chats", **Chat baru**), unread badge on the tab.
- A turn is a tool loop on `glm-5.3` (Anthropic-compatible z.ai endpoint): `lib/nina/tools.ts`
  dispatches typed handlers, `lib/nina/gateway.ts` is her only door to Postgres. Recorded in
  `nina_turns` (status, error_code, tool_calls, tokens).
- Proactive openers (she messages first): `run_committed` from the commit's `after()`, and the
  cron candidates (`missed_usual_day`, `pattern_crossed`, `silence`, `avatar_changed`,
  `reminder_due`), at most one per evaluation, from `GET /api/cron/nina` (Vercel cron 13:00 UTC).
- Each opener also tries web push (`lib/push/send.ts`); in a run there are no subscriptions.
- Her photographs, album search embeddings and the OpenRouter chat fallback: OpenRouter, off by
  default (see Gotchas).

## How to get to it (user POV)

Bottom tab **Nina** -> type -> **Send**. She also starts conversations after a run is saved and in
the evening.

## Driving it with verify.sh

```sh
$V ui RUN .claude/skills/verify-run-insights/features/steps/nina-chat.mjs [-- "your message"]
# 2026-11-03 (after a run re-dated to 2 Nov): "sent: Nin, minggu ini aku udah lari berapa kali? ...",
#   "after sending (16 s): minggu ini baru satu kali, senin kemaren 10.67 km itu doang /
#   yang perlu diperhatiin udah gw bilang tadi, 90.6% di zona 4 dan 5 setelah 76 hari off ..."
$V sql RUN "select role, source, left(text,110) from nina_messages order by seq"
# runner | chat | <your line>; then nina | chat rows. Earlier: nina | run_committed x3, nina | pattern_crossed x3
$V sql RUN "select kind, status, error_code, model, created_at from nina_turns where status = 'ok' order by created_at"
$V cron RUN nina
# with an active runner: {"ok":true,"users":1,"emitted":1,"kinds":{"pattern_crossed":1}}
# without one (plain demo data): {"users":0,"emitted":0}
```

Assert on structure: a `runner/chat` row, then one or more `nina/chat` rows after it, a `nina_turns`
row with `status = ok`, and the budget's spent count. Quote her words only as support; she writes
lowercase Jakarta slang on purpose.

Cost: 3-5 llm calls per chat turn; `cron nina` 0-2.

## Gotchas

- Her answers are grounded in the run's data: on plain demo data she will say the last run was
  75+ days ago, because it was (20 Aug 2026). Commit a re-dated run first when the change is about
  her reading recent training.
- Without `--openrouter`, anything that reaches for OpenRouter fails with "INVALID NINA ENVIRONMENT
  ... OPENROUTER_API_KEY is required", and that is the expected end state. Measured 2026-11-03:
  `nina-chat.mjs -- "Nin, kirim foto kamu lagi lari dong"` -> she answers in character ("sinyal gw
  jelek parah di sini, fotonya ga kekirim"), `next.log` has `[nina] image job failed` then
  `image run finished { purpose: 'selfie', outcome: 'gave-up' }`, and `$V api RUN GET /nina/jobs`
  reads "Gagal · Selfie · 2 x dicoba · Koneksi ke provider putus". A failed z.ai call has no
  fallback either ("z.ai text call failed — considering openrouter", then nothing). With `--openrouter=N`, each generation is real money (~$0.04, 78-150
  s); opt in only for a change to her images, and say so in the report.
- A demo run's `nina_turns` starts with ~25 `failed / unavailable` rows: the `run_committed`
  reactions the seeding refused. They also fill `/admin/error-logs`.
- 2026-11-03, observed once and not yet re-run: a `pattern_crossed` opener quoted the internal code
  to the runner ("ACWR_SPIKE 400.0%"). `lib/nina/prompts/system.ts` hands her the codes; whether she
  may say them is a prompt question. Treat a repeat as a finding.
- Nina's `after()` work outlives the request: wait for "Nina is typing" to go (the steps file does),
  and read `nina_messages` rather than the first screenshot.
