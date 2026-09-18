---
name: redo-image-gen-job
description: Edit a Nina image-generation job's prompt and immediately re-run it in production, for Run Insights. Use as the follow-up to /pull-image-gen-job once a failed job's rejection is diagnosed — e.g. "fix the prompt and try again", "redo this job with that edit", "start another image gen job using the fixed prompt" — never on its own with no prior diagnosis to act on.
---

# Redo a Nina image-gen job with an edited prompt

**`node --experimental-strip-types --no-warnings --env-file=.env.local scripts/redo-image-gen-job.ts <job-id-fragment> <prompt-file> [--dry-run]`**

This is the write half of `/pull-image-gen-job` — that skill gathers and diagnoses, never writes;
this one takes the diagnosis and acts on it. Always run `/pull-image-gen-job` first. Never guess a
job id fragment or a prompt from a complaint alone.

## What it actually does

The exact two-step flow `/nina/jobs/[id]`'s own "Ubah prompt" + "Coba lagi" buttons perform
(`lib/nina/jobActions.ts`), plus a third step neither button takes:

1. Edits the **original** job's `args.prompt` in place (same row, same id) — the ledger keeps that
   row's own cost/latency/error history untouched, only the prompt text changes.
2. Opens a **new** `nina_turns` row with the edited prompt, `attempts: 0` — same rule the app's own
   redo follows: a redo is a new bill, never a rewrite of an old one.
3. **Runs it immediately**, in this process, via the same worker code
   `scripts/nina-image-worker.ts` uses (`runOneJob`) — looped until it stops returning `'retry'`.
   Nothing here waits on `after()` or the GitHub cron backstop.

This is a REAL production action: it spends real OpenRouter money (the ordinary ~$0.04 a
generation costs), counts against the runner's daily image cap, and — on success — posts a real
photograph into his live Nina chat. On failure it posts Nina's own in-character apology into that
same chat, exactly as a real failed job does. There is no dry-run-by-default; pass `--dry-run`
explicitly to check refusals and see the prompt diff with no write and no model call.

## Before running it: diagnose, then edit AS LITTLE AS POSSIBLE

Read `/pull-image-gen-job`'s report first — `job.errorCode === 'policy'` plus `rawProviderErrors`
(the provider's own words, not just the four-value classification) is the signal this skill exists
for. Read the WHOLE prompt, not just the field that seems obviously responsible:

- **Don't assume the obviously "adult" wording is the cause.** A body description ("big boobs",
  "her butt is round, high and full") appears in plenty of jobs that succeeded. A single instruction
  clause removed in isolation can still leave the actual trigger untouched — measured directly: the
  2026-09-18 `xha1hYOS0QCD` incident removed an explicit "FOCUS: emphasise her big bubble butt"
  clause, reran, and the provider rejected it again with the identical message. The wording of an
  INSTRUCTION is not automatically the same as the thing being rejected. Measured 2026-09-18 on
  `xha1hYOS0QCD`: removing an explicit "FOCUS: emphasise her big bubble butt" clause and rerunning
  produced the identical rejection.
- **Correlate against the runner's own history before picking what to change.** Query recent
  `kind='image'` jobs' prompts against their `status`/`error_code` (a one-off `node
  --env-file=.env.local -e "…"` against `nina_turns`, the same connection `pull-image-gen-job.mjs`
  opens) for the specific wording/pose/angle/outfit combination in the rejected prompt, and see
  which of those elements co-occurs with failures and which appears just as often in jobs that
  succeeded. A factor present in both the failures AND a pile of successes is very unlikely to be
  the actual cause, however suggestive it reads to a human — this is what should have been done
  BEFORE either edit on `xha1hYOS0QCD`, not after the first one failed.
- **Even a well-correlated factor can still be wrong, or only part of it.** Same incident, second
  edit: an overhead ("bird's-eye"/"directly above") camera and a prone, arched-back pose each
  succeeded routinely on their own, but the COMBINATION had failed 5 for 5 in the runner's own job
  history — a strong correlation — and softening ONLY the camera-angle clause (keeping the prone
  pose, keeping the FOCUS line) still failed with the identical provider message. Treat a
  correlation as a lead to test, not a conclusion to act on once and stop reasoning about — a
  failed redo means the hypothesis was wrong or incomplete, not that the runner's job is unsalvageable.
- Propose the smallest edit consistent with the STRONGEST available correlation, state which
  sentence(s) are changing and why before running this script, and if that redo still fails, say so
  plainly rather than reaching for a third guess — see "After a redo still fails" below.

## After a redo still fails

Don't keep guessing against production. Each attempt is a real, billed generation and a real
apology message the runner sees in his own chat — two or three blind single-clause edits in a row
is not a cheap way to search a hypothesis space. If the first evidence-backed edit still fails
(`outcome: "gave-up"`, `rawProviderError` unchanged), stop, report what was tried and what the
result was, and let the runner decide the next move — a bigger structural change to the pose or
composition, or accepting that this specific concept may not clear this provider's filter at all.

## Reading the result

```jsonc
{
  "ok": true,                 // outcome === 'ok'
  "originalJobId": "xha1hYOS0QCD",
  "newJobId": "CrIdMMLnkqBe",
  "prompt": "...",            // the edited prompt actually sent
  "attempts": [{ "result": "retry" }, { "result": "gave-up" }],  // or a single "ok"
  "outcome": "gave-up",       // 'ok' | 'gave-up' | 'none' (job vanished/already claimed elsewhere)
  "image": null,              // { messageId, blobUrl, width, height } on outcome 'ok'
  "rawProviderError": "HTTP 400 {...}"  // the provider's own words on a repeat rejection
}
```

On `outcome: "ok"`, fetch `image.blobUrl` the same way `/pull-image-gen-job` does
(`curl -sL --fail '<url>' -o "$SCRATCHPAD/<id>.<ext>"`, then `Read` it) and show the runner the
result before calling the job done.

### Refusals (non-zero exit before any write)

| Exit | Reason | What it means |
|---|---|---|
| 2 | usage/env error | bad invocation, or missing `--env-file=.env.local` |
| 3 | no (non-hidden) image job matches the fragment | mistyped fragment, or the job is hidden/deleted |
| 4 | fragment names more than one job | ask which one, never pick |
| 5 | `empty-prompt` | the prompt file had no text after trimming |
| 6 | `in-progress` | the job is still `pending` — it hasn't finished; nothing to redo yet |
| 7 | `no-args` | the row (or the edited args) has no prompt/seed to run from |
| 8 | `capped` | today's daily image cap is already spent — redoing now would only be refused |

## Why a file for the prompt, never a shell argument

The prompt is a multi-paragraph block of prose — quotes, em dashes, `$`, and newlines that a shell
will mangle long before they reach `argv`. Write the edited prompt to a file in this session's
scratchpad directory first, then pass that path. Never hand-retype the original prompt: read it
back from `/pull-image-gen-job`'s own JSON and edit only the specific sentence(s) diagnosed above,
so the rest of the prompt survives byte-for-byte.

## The one rule this skill does NOT inherit from `/pull-image-gen-job`

That skill never writes; this one always does when run without `--dry-run`. It still never invents
a prompt on its own — the edit comes from a diagnosis grounded in `rawProviderErrors` and the
runner's own job history, never from a guess at what "sounds explicit."
