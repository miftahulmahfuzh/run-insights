---
name: pull-image-gen-job
description: Pull one Nina image-generation job, the chat session that triggered it, and (for a successful job) the photograph it produced, for Run Insights. Use when asked "/pull-image-gen-job <job-id-fragment> <complaint>" — e.g. "/pull-image-gen-job HIiyRr5 wrong angle, please check" — or when the runner complains about a specific generated photo ("the angle is still wrong", "why did she wear X", "this job failed, what happened") and names or pastes a job id. Read-only: it reports; fixing the prompt is a separate, explicitly-asked-for step.
---

# Pull image-gen job

**`/pull-image-gen-job <job-id-fragment> [complaint…]`** — e.g.
`/pull-image-gen-job HIiyRr5_zemf wrong angle, please check`.

Run the script, fetch and look at the photograph **only when the job succeeded and `image` is
non-null**, read the chat around it, then **write the diagnosis yourself** — the same shape this
skill's own worked examples came from (two rounds of exactly this, by hand, in the
`bird-eye-view-angle-photo` session that asked for this skill to exist). The script produces facts;
the deliverable is the paragraph that explains what went wrong and, only if asked, the fix.

## Where the job id comes from

The job id is visible in the "Catatan foto" card on `/nina/jobs/[id]`, as the first line — `job:
<id>`, above `provider:` — added 2026-09-17 for exactly this: something to paste into this command
without opening the database. A prefix, suffix, or any substring works.

## Run it

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/pull-image-gen-job.mjs HIiyRr5_zemf 'wrong angle, please check'
```

Use this raw form, **not** `npm run nina:pull-image-gen-job` — npm prints banner lines and the
script's stdout is meant to be one JSON document and nothing else (`search-analysis.mjs`'s own
rule, unchanged here).

**The FIRST argument is the job id fragment; everything after it is the complaint, joined with
spaces.** The complaint may be empty — "just pull this job" is a legal call.

| Invocation | fragment | complaint |
|---|---|---|
| `/pull-image-gen-job HIiyRr5_zemf wrong angle` | `HIiyRr5_zemf` | `wrong angle` |
| `/pull-image-gen-job cPl8 still not 90 degrees, please advise` | `cPl8` | `still not 90 degrees, please advise` |
| `/pull-image-gen-job nY80NkDooKZv` | `nY80NkDooKZv` | *(empty)* |

The fragment matches **anywhere** in the id (prefix, suffix or interior), the same rule
`search-analysis.mjs` uses, and for the same reason: what a runner pastes off the sidecar is
whatever they selected, not necessarily the whole thing.

### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | a report on stdout | read it, and fetch the photo if `image` is non-null |
| 2 | usage or env error | fix the invocation; `--env-file=.env.local` is required |
| 3 | no image job's id contains that fragment | the fragment is mistyped, or it names a chat/proactive/vision turn, not an image one. Say so; do not search for a "close" id |
| 4 | the fragment names more than one image job | the JSON lists them with status, date and scene — **ask which one**, never pick |

## What the script does, and why three joins and not one

A `nina_turns` row (`kind = 'image'`) knows the prompt it sent and the `scene`/`mood`/`outfit`/
`pose`/`ootd`/`angle` arguments that built it, but nothing about the conversation or the
photograph — those are two more hops, each optional for a real reason:

1. **Job → chat message → session.** `args.sourceMessageId` is the runner's own message that asked
   for the photo. It is `null` for a promise-sweep- or admin-test-triggered photo — nobody asked in
   chat for THIS one — but `session` is still filled in for it: see point 2.
2. **Job → reply message → image row (selfie only) — and the session fallback.** `finishSelfie`
   (`lib/nina/imagerun.ts`) writes exactly one `nina_messages` row with `turn_id = <job id>` and
   `photo_only = true` — the caption bubble — and `nina_message_images.message_id` points at THAT
   row, never at the job directly. Skipping this hop and grabbing "the user's most recently
   generated image" is only ever correct for the single newest job in the whole app; it is wrong
   for any job this tool is actually asked to pull, which is why the script does not do that.
   `finishSelfie` **always** resolves a session before writing this row —
   `quoted?.sessionId ?? resolveNinaWriteSession(userId)` — so an unrequested photo still lands
   somewhere real. The script uses this row's `session_id` to fill in `session`/`conversation`
   whenever point 1 left them empty, so **a completed non-avatar job always reports the session it
   landed in.** `session` comes back `null` only for a job that never wrote a message at all —
   still `pending`/`failed`, or an avatar job (point 3).
3. **Avatar jobs have no join at all.** `finishAvatar` writes straight to `nina_avatars` — no
   `nina_messages` row, no `turn_id` column on `nina_avatars` either. `image` is `null` and
   `imageNote` says so plainly for `purpose: 'avatar'`; that is a real architectural gap, not a bug
   in the script, and it is not worth guessing at from `created_at`/`scene` proximity (the same
   "ask, never pick" rule `search-analysis.mjs` states for an ambiguous id fragment).

## Read the JSON

```jsonc
{
  "ok": true,
  "fragment": "HIiyRr5_zemf",
  "complaint": "wrong angle, please check",     // or null if none was given
  "job": {
    "id": "HIiyRr5_zemf",
    "status": "ok",                              // 'pending' | 'ok' | 'repaired' | 'failed'
    "errorCode": null,
    "purpose": "selfie",                          // or "avatar"
    "model": "bytedance-seed/seedream-5-0-pro",
    "seed": 1554516850,
    "scene": "...", "mood": "...", "outfit": null, "pose": null, "ootd": null, "angle": null,
    "referenceUrl": "https://…",
    "prompt": "...",                              // the EXACT prompt sent — the historical record
    "sidecar": "provider:   ...\n\n--- prompt as sent ---\n..."
  },
  "session": { "id": "...", "created_at": "..." } | null,
  "triggerMessage": { "id", "session_id", "role", "text", "seq" } | null,
  "conversation": [                               // seq window around the trigger, oldest first
    { "id", "role", "text", "seq", "linkedToJob": false }
    // ...
    { "id", "role", "text", "seq", "linkedToJob": true }   // the reply that actually carries the photo
  ],
  "image": { "messageId", "blobUrl", "width", "height", "createdAt", "sidecar" } | null,
  "imageNote": null | "job status is 'failed' (error_code=policy) — no photograph was generated"
                | "... this is an avatar job: ... no exact join back to it from the job ..."
                | "..."
}
```

Read them in this order:

1. **`job.status` and `imageNote`** — this is "did it even produce a photo", answered before
   anything else. A `failed` job's `errorCode` (e.g. `policy`) is usually the whole story on its
   own; there is no photo to fetch and the diagnosis is about the refusal, not the framing.
2. **`conversation`** — what the runner actually asked for, in their own words, and how Nina
   answered in chat. The row with `linkedToJob: true` is the caption bubble that carries the photo
   (selfie jobs only); everything else is context.
3. **`job.scene` / `job.pose` / `job.angle` against the runner's own words** — did the chat model's
   tool call actually capture what was asked? A mismatch here is a different bug (the model
   mis-transcribed the request) from a mismatch between the request and the photo (the prompt
   assembly is fighting itself, or the image model didn't follow a correct prompt).
4. **Fetch `image.blobUrl` and look at it — mandatory whenever `image` is non-null**, i.e. every
   successful selfie job. Never write a diagnosis about "what's wrong with the photo" from the
   prompt text alone when the photo itself is one `curl` away:

   ```bash
   curl -sL --fail 'https://…/nina/<userId>/selfie-<id>.<ext>' -o "$SCRATCHPAD/<id>.<ext>"
   ```

   Use the extension already in the URL and save into this session's scratchpad directory — never
   anywhere the image would be published, and never re-uploaded to any external service. Then
   `Read` the saved file. If the fetch fails, say so explicitly and fall back to a text-only
   analysis with that limitation stated up front, the same as `search-analysis.mjs`'s rule.
5. **`job.prompt` (the full, exact text sent) against what the photo actually shows** — this is
   where a real diagnosis lives. Read the WHOLE prompt, not just the `SCENE:`/`POSE AND PRESENCE:`
   lines: a contradiction between the fixed opening camera paragraph and a per-photo request is
   exactly the bug this skill exists to catch (`lib/nina/imagegen.ts`'s `NINA_SELFIE_STYLE_PREFIX`
   header has the full argument for why a diffusion model blends two competing camera instructions
   instead of picking the later one).

## Write the diagnosis

Not a restatement of the JSON. Three short parts, matched to what this session's own two rounds
looked like:

1. **The verdict, in one line.** *"The runner asked for directly-overhead, face-up. `scene`/`pose`
   captured that correctly, but the prompt's opening paragraph still says 'chest height... floor
   visible below her feet' — an eye-level instruction the overhead one has to fight."*
2. **Why, grounded in the photo you fetched** (successful jobs) **or the error code** (failed
   jobs) — name the actual mechanism, not a vague "the AI struggled." A diffusion model does not
   have "ignore the earlier sentence"; two contradicting camera clauses in one prompt blend rather
   than resolve.
3. **What would change it** — concretely. If the fix is a wording change the runner can just type
   differently next time, say the sentence. If it is a bug in this repo's own prompt assembly (a
   fixed clause that never varies with the scene, a field the tool schema doesn't expose, an
   override that only appends instead of replacing), name the file and function, and **ask whether
   to implement it** before touching any code — this skill does not edit.

## The one rule

**This skill never writes.** No edit to `lib/`, no `UPDATE`, no `redoNinaImageJob` call, no prompt
override saved to `/admin/image-generation`. It gathers exactly what a human would have to gather
by hand — the job, the conversation, the photograph — and hands back a grounded diagnosis. Applying
a fix (a code change to `lib/nina/imagegen.ts`, a different phrasing for next time, a redo of the
job) is a separate ask, exactly as it was both times this skill's own worked examples came from.

## Common mistakes

| Mistake | What happens |
|---|---|
| Grabbing "the user's most recent generated image" instead of the one the fragment names | Correct only when the fragment happens to name the newest job — silently wrong for any older one |
| Assuming every `ok` job has an `image` | Avatar-purpose jobs never do — check `imageNote` |
| Skipping the `blobUrl` fetch and reasoning from `job.prompt` alone | The exact blind-diagnosis failure mode the fetch step exists to remove |
| Reading only `job.scene`/`job.pose`/`job.angle` and not the full `job.prompt` | The bug usually lives in the FIXED prose those fields get spliced into, not in what the model wrote |
| Treating a `failed` job's `errorCode` as something to route around by rewording the scene | `policy` is a provider refusal, not a framing bug — say so, don't propose a camera-angle fix for it |
| Editing `lib/nina/imagegen.ts`, redoing the job, or saving a prompt override without being asked | See The one rule |
| Running it without `--env-file=.env.local` | Exit 2: no `DATABASE_URL` |
| Picking one job after exit 4 | The fragment was ambiguous. Ask |

## Note on the database

This repo has ONE database — `.env.local`'s `DATABASE_URL` is what production reads. The script is
read-only, so pulling a job is safe, but the report describes production: the conversation and the
photograph are real, current, and (for the photograph) private — keep any fetched copy in this
session's scratchpad, never publish or re-host it.
