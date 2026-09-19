---
name: photoshop
description: Run a photoshop job on an existing Nina photo (album or chat) and add the result to her album, for Run Insights. Use when asked "/photoshop <image-id-substr> <mode> <model> <request>" — e.g. "/photoshop 36dgj edit seedream 4.5 bigger boobs" — where <image-id-substr> is a fragment of a photo id (from /admin/photoshop or the Photoshop tab on /admin/error-logs), <mode> is anchor or edit, <model> is a runner's words naming one of the catalogued models, and everything after is the instruction. Runs the job to completion and adds a successful result into the album's Photoshop folder — no separate approval step, since this is a CLI run with no before/after screen.
---

# /photoshop

**`/photoshop <image-id-fragment> <anchor|edit> <model words…> <instruction…>`** — e.g.
`/photoshop 36dgj edit seedream 4.5 bigger boobs`.

This runs the underlying script, which does the whole job: opens a row in
`nina_photoshop_jobs`, calls the model, stores the result in Vercel Blob, and — on success —
**adds it as a new photo in the `Photoshop` folder of the album**, automatically. There is no
before/after review here; that is what `/admin/photoshop`'s web UI is for. A CLI run either lands
in the album or it doesn't, and either way you get a full JSON report.

## Step 1 — resolve the model words to a closed id, yourself

The runner's command names a model in their own words ("seedream 4.5", "gemini", "gpt image").
**You resolve that to one of the exact ids below before running the script** — the script
validates but does not guess, on purpose (see the script's own header for why: a fuzzy
multi-word match is fragile and this repo's existing scripts put ambiguity resolution in the
skill's judgment, not in shell-script string matching).

| Mode | Valid ids | What a runner might call it |
|---|---|---|
| `anchor` | `qwen/qwen-image-3` | "qwen", "qwen 3" |
| `anchor` | `qwen/qwen-image-3-pro` | "qwen pro", "qwen 3 pro" |
| `anchor` | `recraft/recraft-v4.1` | "recraft" |
| `anchor` | `bytedance-seed/seedream-4.5` | "seedream", "seedream 4.5", "seedream 4" |
| `anchor` | `bytedance-seed/seedream-5-0-pro` | "seedream pro", "seedream 5" |
| `edit` | `google/gemini-3.1-flash-image` | "gemini", "gemini 3.1", "nano banana 2" |
| `edit` | `google/gemini-2.5-flash-image` | "gemini 2.5", "nano banana" |
| `edit` | `bytedance-seed/seedream-4.5` | "seedream", "seedream 4.5" |
| `edit` | `black-forest-labs/flux.2-pro` | "flux", "flux pro", "flux 2" |
| `edit` | `openai/gpt-image-2` | "gpt", "gpt image", "gpt 2" |

If the runner's words are ambiguous (e.g. "seedream" alone, which exists on both lists) — use the
mode they gave to pick the matching entry; if a mode's list has no match at all for what they
said, ask which of that mode's models they meant rather than guessing.

**Edit mode is generally the better choice** for "fix"/"same but with X" requests (documented to
keep the rest of the photo intact); Anchor mode is a fresh generation strongly guided by the
photo's subject, and pose/background may drift. If the runner's own command already names a mode,
use it as given.

## Step 2 — run the script

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/photoshop.ts <image-id-fragment> <anchor|edit> <resolved-model-id> <instruction…>
```

Example, resolving "seedream 4.5" for edit mode:

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/photoshop.ts 36dgj edit bytedance-seed/seedream-4.5 'much bigger breasts'
```

The **instruction** is everything after the model id, joined with spaces — pass the runner's
request roughly as given ("bigger boobs" is fine verbatim; you do not need to rewrite it into one
of the app's preset sentences, though doing so for clarity is fine too).

### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | job succeeded and the photo was added to the album | report the new photo, done |
| 1 | job ran but the model call failed after retries | report the raw error from the JSON; suggest a different model or a reworded instruction |
| 2 | usage or env error, or an unknown mode/model id | fix the invocation — re-check Step 1 |
| 3 | no photo (album or chat) has that id fragment | the fragment is mistyped, or the photo was deleted since |
| 4 | the fragment names more than one photo | the JSON lists them — ask which one, never pick |

## Read the JSON

```jsonc
{
  "ok": true,
  "jobId": "...",
  "sourceId": "...",              // the photo that was edited
  "sourceKind": "avatar",          // or "message_image"
  "mode": "edit",
  "model": "bytedance-seed/seedream-4.5",
  "instruction": "much bigger breasts",
  "attempts": 1,
  "outcome": "ok",                 // or "gave-up"
  "result": {
    "blobUrl": "https://…",
    "width": 1536, "height": 2048,
    "newAvatarId": "...",          // the new nina_avatars row — paste into /pull-photoshop-job
    "folder": "Photoshop"
  },
  "rawProviderError": null         // the [kind] detail string on a failure, else null
}
```

On success, fetch `result.blobUrl` and look at it before telling the runner it's done — the same
"never diagnose from text alone" rule `/pull-image-gen-job` states, applied to confirming a
result rather than diagnosing a failure:

```bash
curl -sL --fail 'https://…' -o "$SCRATCHPAD/<newAvatarId>.png"
```

Then `Read` the saved file and describe what changed, briefly, before reporting success.

On a failure (exit 1), read `rawProviderError` and say what it means in plain words — do not just
paste the raw JSON back at the runner. If it looks like the same resolution-requirement class of
bug this feature shipped with (`"requires at least … output pixels"`), say so and suggest a
different model; that specific one (`seedream-4.5`) is already patched (`resolution: '2K'`), so a
NEW instance of that message names a model this repo has not yet special-cased — worth flagging as
a possible code fix rather than just retrying blind.

## The one rule

**A successful run always adds.** There is no "run it but don't add it yet" mode for this skill —
if the runner wants to preview before deciding, point them at `/admin/photoshop`'s web UI instead,
which has the before/after screen with Replace / Add as new / Cancel.
