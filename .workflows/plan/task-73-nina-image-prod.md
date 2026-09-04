# task-73 — Nina has never generated an image in prod

**Card:** [#73](https://github.com/miftahulmahfuzh/run-insights/issues/73)
**Branch:** `task/73-nina-has-never-generated-an-image-in` off `origin/main` @ `e5a4d4eef5d4`
**Round:** 1 — 2026-09-04

## The report

Nina had never successfully produced an image in production. The runner's hypothesis was that
`OPENROUTER_API_KEY` was never added to Vercel prod. **That was correct, and it was one of four
independent failures**, any one of which was sufficient on its own.

## What was actually wrong — measured, not inferred

| # | Failure | How it was established |
|---|---|---|
| 1 | Vercel Production carried neither `OPENROUTER_API_KEY` nor `GITHUB_DISPATCH_TOKEN` | `vercel env ls production` listed 13 variables; neither was among them |
| 2 | The repository had **zero** Actions secrets | `gh secret list` returned nothing — no `DATABASE_URL`, no `BLOB_READ_WRITE_TOKEN`, no `OPENROUTER_API_KEY` |
| 3 | `nina-image.yml` could not install its dependencies | run `33867716507` (2026-09-04 11:23Z, `schedule`) died in 14 s: `npm error code EUSAGE … Missing: esbuild@0.28.2 from lock file` |
| 4 | A missing variable produced twenty minutes of silence instead of a sentence | `lib/nina/imagedispatch.ts` called `ninaEnv()` outside every guard, so it threw before the POST; three `nina_turns` rows sat `pending`/`dispatched` with `cost_micro_usd` null |

**The non-obvious link between #1 and #4.** `ninaEnv()` validates `ninaSchema` as one zod group
(`lib/env.ts:106-121`) and `fail()`s when *any* member is absent. `imagedispatch.ts` reads only
`GITHUB_DISPATCH_TOKEN` from it — but the missing `OPENROUTER_API_KEY` alone was enough to throw
the dispatch. The runner's hypothesis pointed at a variable the dispatch never reads, and was
right anyway.

Run `33867716507` is also the **only** run `nina-image.yml` ever had: the workflow landed on `main`
in `d61cdba` earlier the same day, so `schedule` had fired once. There has never been a
`workflow_dispatch` run, which is consistent with #1 throwing on every attempt.

## Approaches considered

### For #3 — the install failure

| Approach | Verdict |
|---|---|
| **Copy `ci.yml`'s `npm i -g npm@12.0.1` pin (chosen)** | The workflow's own comment named this as the fallback: "copy ci.yml's pin step rather than dropping --omit=dev". Confirmed locally: `npm --version` is 12.0.1 and `npm ci` succeeds here, so the runner's npm is the variable. One step, matches `ci.yml` exactly, reversible in one line. |
| Drop `--omit=dev`, use plain `npm ci` | Installs vitest on a workflow that runs 144×/day for no benefit, and the file explicitly warns against dropping `--omit=dev`. |
| Swap `npm ci` → `npm install` | Discards the lockfile's determinism. `ci.yml:43-44` rejects this by name. |
| `--no-optional` | Removes the esbuild binary. Also rejected by name in `ci.yml:43`. |

The replaced comment claimed `--omit=dev` *sidesteps* the trap `ci.yml` pins npm for, "so no
`npm i -g npm@12.0.1` pin is needed here". The measured failure is a **lockfile sync check**
(`EUSAGE`), not `EBADPLATFORM`, and it runs *before* the omission is applied — so `--omit=dev`
cannot help. Both the pin and `--omit=dev` are now kept, and the comment records the refutation.

### For #4 — the silent dispatch

| Approach | Verdict |
|---|---|
| **Guard `ninaEnv()` and return `leaveForBackstop: true` (chosen)** | Distinguishes *our* misconfiguration from *GitHub's* refusal. The first keeps the row claimable; the second closes it. |
| Move `ninaEnv()` inside the existing `try` so a missing variable is an ordinary `{ ok: false }` | **Written, tested green, then reverted — it was wrong.** `{ ok: false }` sends the caller into `failNinaImageJob`, which closes the row, and `claimJob` only claims `status='pending'`. That would have deleted a working fallback. |
| Leave it as-is (the outer `catch` already swallows the throw) | The throw *was* caught, so the backstop still worked — but a config fault was indistinguishable from a real bug in the log, and the row waited the full 20 minutes for the give-up sweep. |

**Why the second one is wrong, and this is the load-bearing finding of the round:**
`scripts/nina-image-worker.ts`'s `claimJob` (line ~271) claims
`error_code = 'dispatched'` rows once `created_at < now - NINA_IMAGE_DISPATCH_GRACE_MS` (60 s). So
a job whose doorbell never rang **is still delivered** by the every-ten-minutes `schedule:`
backstop. Closing the row to apologise trades a late photograph for an apology, over a fault the
runner did not cause. `leaveForBackstop` keeps the two apart:

- GitHub refused (401/403/404/422) or the transport died → fail now, apologise now. GitHub has
  spoken and the backstop would only re-learn the same refusal.
- Our own configuration is incomplete → log on `error`, leave the row `dispatched`, let the sweep
  take it.

This matters immediately and not hypothetically: `GITHUB_DISPATCH_TOKEN` is *still* absent from
Vercel prod (see Ambiguity below), so `leaveForBackstop` is the live path, not a defensive branch.

## Ambiguity resolved (narrowest reading)

The card asked to "test end to end in prod" and answer "can Nina truly generate image?". Two
readings:

- **Narrow (built):** make image generation actually work in production and prove it with a real
  generation. Config fixed, code fixed, one photograph generated and verified in the chat.
- **Wide (declined):** also rebuild *when* and *how* she delivers the photograph — the runner's
  follow-up idea about stalling the conversation and quoting her own "bentar" message.

The wide reading is a behaviour change with its own design surface, and it is filed as its own
card rather than smuggled into a diagnosis. Note that two thirds of it already exist: generation
is already asynchronous and off-platform (RU-20), `reply_to_id` is already written by the worker
through a subselect (`nina-image-worker.ts:437`), and live arrival already works via push →
service worker → `router.refresh()` (`ChatScreen.tsx:207`). What is genuinely missing is (a) the
worker never *sends* a push when the photo lands, and (b) nothing keeps her talking while it
generates.

## What was changed

1. `.github/workflows/nina-image.yml` — added the `npm i -g npm@12.0.1` pin before the install,
   and replaced the comment that argued the pin was unnecessary with the measured refutation.
2. `lib/nina/imagedispatch.ts` — `ninaEnv()` is guarded; a config failure returns
   `leaveForBackstop: true`, and `fireNinaImageDispatch` honours it by leaving the row for the
   sweep instead of closing it.
3. `tests/nina.imagedispatch.test.ts` — **new**; the module had no test at all. Five cases,
   including the one that fails if the two failure kinds are collapsed back together.

## Configuration applied outside the repository

Not in the diff, and recorded here because nothing else records it:

- `gh secret set` — `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `OPENROUTER_API_KEY` on
  `miftahulmahfuzh/run-insights`. Verified present with `gh secret list`.
- `vercel env add OPENROUTER_API_KEY production`. Verified present with `vercel env ls production`.

**Still absent, and it needs a human:** `GITHUB_DISPATCH_TOKEN` on Vercel prod. GitHub has no API
that mints a personal access token, so this session could not create one. It needs a fine-grained
PAT with `actions: write` on this repository. Until it exists, every image is delivered by the
every-ten-minutes backstop instead of the instant doorbell — which now works correctly by design
rather than by accident, and is the whole reason `leaveForBackstop` was written.

`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are also absent from Vercel prod, so
push — and therefore live arrival without a page reload — is off in production. That belongs to
the behaviour-change card, not this one.

## Verification

Preflight, then a real generation against production, driven at the worker directly to isolate the
generator from the dispatch plumbing:

```
$ node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --dry-run
[nina-worker] preflight ok { jobId: null, mode: 'sweep' }

$ node --experimental-strip-types --no-warnings --env-file=.env.local scripts/nina-image-worker.ts --job e2e73tkuf82
[nina-worker] claimed { jobId: 'e2e73tkuf82', purpose: 'selfie', attempt: 1 }
[nina-worker] done { jobId: 'e2e73tkuf82', purpose: 'selfie', bytes: 1284767, costMicroUsd: 40000, latencyMs: 59953 }
[nina-worker] finished { attempted: 1 }
```

The job was enqueued with a real job's `args` verbatim (a new seed), so the payload is the app's
own and not a hand-written approximation. The whole chain landed:

| Row | Value |
|---|---|
| `nina_turns` | `status=ok`, `error_code=null`, `cost_micro_usd=40000`, `latency_ms=59953` |
| `nina_messages` | `blwDMm4QXNKd`, `role=nina`, `source=chat`, `text="nih"`, `reply_to_id=pkKBh5hmz3be` |
| the quoted message | `role=runner`, `"ini foto dmn"` |
| `nina_message_images` | `yNIJLw51m4sT`, 1284767 B, 768×1024 |
| the blob | `HTTP 200`, `image/png`, 1284767 B |

The photograph was opened and inspected: heather-grey racerback tank, black shorts, white towel
over one shoulder, blue bottle, black digital watch on the left wrist, a Tebet alley with parked
motorbikes — the subject contract and the scene from `args`, both honoured. **The answer to the
card's question is yes.**

Measured latency was **59.95 s**, against the 78.2 s the plan quotes. Still far above Vercel's
60 s ceiling in `sin1` once request overhead is counted, so RU-20's off-platform choice stands;
worth knowing the margin is narrower than assumed.
