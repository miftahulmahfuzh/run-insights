---
name: pull-photoshop-job
description: Pull one photoshop job, the photo it operated on, and (for a failed job) the provider's own rejection text, for Run Insights. Use when asked "/pull-photoshop-job <image-id-substr> <complaint>" — e.g. "/pull-photoshop-job 36dgj wrong result, please check" — or when the runner complains about a specific photoshop result and names or pastes a job id or source photo id (both are printed on the Photoshop tab of /admin/error-logs and under a photo on /admin/photoshop). Read-only: it reports; fixing the request and re-running is /photoshop's job, not this one's.
---

# Pull photoshop job

**`/pull-photoshop-job <id-fragment> [complaint…]`** — e.g.
`/pull-photoshop-job 36dgj wrong result, please check`.

Run the script, **fetch and look at every image it returns — this is mandatory, not optional**,
then read the provider errors if the job failed, then **write the diagnosis yourself**. The script
produces facts and pulls nothing itself (it is read-only SQL); seeing the actual photograph(s) and
forming the judgment is this skill's job, every time it runs.

## Where the id comes from

Either id works — the script matches both columns:

- The **job id**, printed on the Photoshop tab of `/admin/error-logs` (the hash-icon popup on any
  row) and in `/photoshop`'s own JSON report (`jobId`).
- The **source photo's id** ("image id"), printed below the photo on `/admin/photoshop/[source]/
  [id]`, in that same error-logs popup, and as `sourceId` in `/photoshop`'s report.

A prefix, suffix, or any substring of either works.

## Run it

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/pull-photoshop-job.mjs 36dgj 'wrong result, please check'
```

**The FIRST argument is the id fragment; everything after it is the complaint, joined with
spaces.** The complaint may be empty.

### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | a report on stdout | pull the image(s) and read it |
| 2 | usage or env error | fix the invocation; `--env-file=.env.local` is required |
| 3 | no job or source photo has that id fragment | the fragment is mistyped |
| 4 | the fragment names more than one job | the JSON lists them with status and prompt — ask which one, never pick |

## Read the JSON

```jsonc
{
  "ok": true,
  "fragment": "36dgj",
  "complaint": "wrong result, please check",
  "job": {
    "id": "...", "sourceKind": "avatar", "sourceId": "...",
    "mode": "edit", "model": "bytedance-seed/seedream-4.5",
    "presetKey": null, "promptText": "much bigger breasts",
    "status": "ok",                    // 'pending' | 'ok' | 'failed'
    "errorCode": null, "attempts": 1, "costMicroUsd": 40000,
    "resultBlobUrl": "https://…", "resultWidth": 1536, "resultHeight": 2048,
    "resolvedAction": "added",         // 'replaced' | 'added' | 'discarded' | null
    "resolvedAt": "...", "createdAt": "..."
  },
  "source": { "collection": "album", "id": "...", "blob_url": "https://…", "folder": "...", ... },
  "addedAvatar": { "id": "...", "blob_url": "https://…", "folder": "Photoshop" } | null,
  "rawProviderErrors": [
    { "errorMessage": "[transport] HTTP 400 {\"error\":{\"message\":\"bytedance-seed/seedream-4.5 requires at least 3,686,400 output pixels…\"}}", "timeoutMs": null, "createdAt": "..." }
  ],
  "fetchInstructions": "MANDATORY: curl source.blob_url, and job.resultBlobUrl when non-null, …"
}
```

`rawProviderErrors` is joined **exactly** on `job_id` (not a fuzzy text match — see the script's
own header for why this join is cleaner than `/pull-image-gen-job`'s), one row per failed
attempt, oldest first.

Read them in this order:

1. **`job.status`** — did it even produce a result. For `'failed'`, read every entry in
   `rawProviderErrors` — the classification (`errorCode`) is never the reason, the raw text is.
2. **Fetch `source.blob_url` — mandatory, every time.** This is the photo the job started from.

   ```bash
   curl -sL --fail 'https://…' -o "$SCRATCHPAD/source-<id>.png"
   ```

   `Read` the saved file.
3. **Fetch `job.resultBlobUrl` — mandatory whenever it is non-null**, i.e. every successful job.
   Never write a diagnosis about "what's wrong with the result" from the prompt text alone when
   the photo itself is one `curl` away. Save into this session's scratchpad, never anywhere the
   image would be published or re-uploaded to any external service.
4. **`job.promptText` against what the result photo actually shows** (successful jobs) — did the
   instruction get followed? A mismatch between "much bigger breasts" and a barely-changed photo
   is `edit`/`anchor` mode not doing what its own documentation claims, worth naming explicitly
   rather than shrugged off as "AI weirdness."
5. **The model** — if the same model keeps failing the same way across multiple pulled jobs,
   that's a pattern worth surfacing (a resolution requirement like `seedream-4.5`'s, a policy
   filter, a consistently wrong model choice for the mode) rather than treating each failure as
   independent.

## Write the diagnosis

Not a restatement of the JSON. Three short parts, `/pull-image-gen-job`'s own shape:

1. **The verdict, in one line.** *"The result photo barely changed — 'bigger breasts' in Anchor
   mode with `qwen/qwen-image-3` reproduced the same composition almost untouched."*
2. **Why, grounded in the photo(s) you fetched** (successful jobs) **or the raw error** (failed
   jobs) — name the actual mechanism. For a failed job whose error mentions a resolution/pixel
   requirement, size, or an unsupported parameter, say so plainly: that is a code-level gap in
   this app's model support, not something rewording the instruction fixes.
3. **What would change it** — concretely. A different model (name one from `/photoshop`'s own
   table), a different mode (`edit` instead of `anchor`, or the reverse), a reworded instruction,
   or — if the raw error names an actual bug in `lib/nina/photoshopRun.ts`/`imagerecipe.ts` (a
   resolution override missing for a model, a hardcoded value that shouldn't be) — name the file
   and function and **ask whether to implement it** before touching any code. This skill does not
   edit, and neither does it re-run: that is `/photoshop`'s job, on a fresh command from the
   runner once the diagnosis is in hand.

## The one rule

**This skill never writes.** No edit to `lib/`, no `UPDATE`, no re-run of the job. It gathers
exactly what a human would have to gather by hand — the job, the source photo, the result photo,
the raw provider error — and hands back a grounded diagnosis. Running `/photoshop` again with a
different model or instruction is a separate, explicitly-asked-for next step.
