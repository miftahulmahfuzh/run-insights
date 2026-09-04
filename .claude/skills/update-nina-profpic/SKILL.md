---
name: update-nina-profpic
description: Replace Nina's profile picture in production from a local image file, for Run Insights. Use when handed an image and asked to change, update or replace Nina's profpic, profile picture, avatar or face — e.g. "/update-nina-profpic ~/Pictures/nina2.png", "make this Nina's new profile picture", "change nina's profpic to this", "use this photo as her face from now on", "re-anchor Nina's face", "her avatar is wrong, here's a better one". Uploads the image to Vercel Blob, flips the current avatar row, re-seeds the committed face anchor, and makes her comment on the change. Writes production; dry-runs by default.
---

# Update Nina's profile picture

One local image file becomes, in production: her current avatar, the newest photo in her album,
and something she brings up in the chat unprompted.

## Read this before you run it

**It writes production and there is no undo.** Everything it touches, exactly:

| Where | What | When |
|---|---|---|
| Vercel Blob | one new object at `nina/<userId>/avatar-<id>.jpg`, public, immutable | `--apply` |
| Neon (`nina_avatars`) | the current row un-currented, one new row inserted as current, in **one** transaction | `--apply` |
| The app | `GET /api/cron/nina` with the cron bearer — the poke that makes her speak | `--apply` |
| Working tree | `assets/nina/_anchor.png` replaced from the same source image | `--apply` |
| Nothing | — | without `--apply` |

**The env file is `.env.local`**, read by node's own `--env-file`, and the three variables it needs
from there are `DATABASE_URL` (pooled), `BLOB_READ_WRITE_TOKEN` and `CRON_SECRET`. All three are
already in `.env.example`; none is new. The script refuses, by name, before touching anything if one
is missing. It does **not** import `lib/env.ts` — that module is `server-only` **and** alias-imported,
which is the actual wall. Plain `.ts` modules are fine: it imports `lib/id.ts`, `lib/nina/images.ts`
and `lib/nina/imagerecipe.ts` under `--experimental-strip-types`, exactly as
`scripts/nina-image-worker.ts` does, so the blob prefix and the pathname regex have one definition
in the repo rather than two (RULING A6).

**It does not delete the old avatar.** The previous blob and row stay exactly where they were, which
is what keeps them in her album (phase 13). Nothing here is a cleanup step.

## The loop

### 1. Dry run first, always

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png
```

Flags go after `--`. The script is dry by default; `--apply` is the only thing that writes
anything. The dry run does the full decode and re-encode in memory, so its byte counts and
dimensions are real, not predicted.

The bare `node` form needs the same two flags the npm script carries, because of the `.ts` imports:

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/nina-profpic.mjs ~/Pictures/nina-new.png
```

### 2. Read the plan it printed

Check four lines before going further:

- **`source`** — the format and dimensions it actually decoded. If this is not the picture you
  meant, stop.
- **`user`** — the account whose avatar changes. On a database with more than one user the script
  refuses and asks for `--user <id>` rather than guessing.
- **`current avatar`** — the one being replaced. **`(none — the committed seed, D-2)` is normal on
  a database where she has never had a photo**: there is no seed *row*, only the committed
  `public/nina/avatar-001.png`, and a null current avatar is exactly how the app spells that. It is
  not a wrong-database symptom — the wrong-database symptom is `this database holds no users at
  all`, and that one is a refusal.
- **`will upload`** — the resized avatar's dimensions. It is fitted inside 1600 px and **never
  cropped to a square**, because phase 13 opens the avatar full-screen; the round thumbnail is
  CSS's job, and the circular crop is `/admin/nina`'s.

### 3. Apply

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png --apply
```

Order of operations is blob → transaction → anchor file → poke. The `nina_avatars` update and
insert are a single transaction, un-current first, so she can never end up with two current avatars
or none — and the partial unique index `nina_avatars_user_current_unq` makes that structural rather
than merely intended.

### 4. Commit the anchor

The script prints the command. Run it.

```bash
git add assets/nina/_anchor.png && git commit -m "chore(nina): re-anchor from nina-new.png"
```

**Be clear about what this is and is not.** RU-18 dropped the reference image: phase 12 sends no
`input_references`, so `assets/nina/_anchor.png` is read by nothing at runtime and re-anchoring has
**no effect on her next generated photo** — her generated photos are different-looking women, that
is deliberate, and `lib/nina/album.ts` says so out loud. The file is kept as the seed for the
deferred consistent-face feature, and the reason to commit it is that a seed which silently drifts
out of date is worse than no seed: the day that feature is picked up, the committed face should be
the one the app is actually wearing.

### 5. Verify

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png            # a fresh dry run
```

`current avatar` should now name the object you just uploaded, and `avatars on record` should have
gone up by one. Then open `/nina` and `/nina/about`: the chat header shows the new face, and the
album still holds the previous one.

## Describing the photo — the `--description` flag

`nina_avatars.description` is what lets her answer *"lah lo ganti foto profil na, itu lagi dimana?"*
She is never sent the image itself (RU-12), so prose is the only way she knows what it shows.

```bash
npm run nina:profpic -- ~/Pictures/nina-new.png --apply \
  --description "Di track Rawamangun, abis 10k pagi, masih ngos-ngosan, matahari rendah dari kiri."
```

Omit it and the column is NULL, which is a supported state: `AvatarFacts.description` is documented
nullable and the `avatar_changed` prompt tells her not to describe the photo to him anyway ("he can
see it"). The flag only matters for the question that comes *later*, when he asks where she was.

**This script deliberately runs no `glm-4.6v` pre-pass.** Phase 6's `describeNinaImages` is
`server-only` and alias-imported, so reaching it from a node script would mean a second z.ai call
site carrying a second copy of the token-floor guard — the guard whose own header warns it is not a
copy of F04's. Phase 15's `/api/admin/nina/upload` runs the real pre-pass, inside `lib/`, behind the
boundary guard. Here you type the prose or you leave it null.

## Refusals, and what each one means

| It says | It means |
|---|---|
| `missing DATABASE_URL, …` | you did not pass `--env-file=.env.local` (or the variable is blank) |
| `not an image: no decodable format` | the extension lied; no decoder could read the bytes |
| `SVG is refused` | a vector file is not a photograph of a face — export a raster still |
| `animated image (N frames)` | a GIF/animated WebP; export one frame first |
| `NxM is too small` | the short edge is under 512 px; there is not enough face to be worth keeping |
| `cannot write .../assets/nina` | phase 1's anchor promotion has not landed in this tree |
| `there is no nina_avatars table` | the Nina migration is not applied to **this** database |
| `this database holds no users at all` | `DATABASE_URL` points at the wrong Neon branch — fix the connection, do not work around it |
| `this database holds N users` | pass `--user <id>`; the script will not pick for you |
| `The proactive poke did not land` | production **is** updated; she is just quiet until the next cron tick, since the row is still `announced_at NULL` |

Exit codes: `0` success or clean dry run · `1` a refusal, or the poke failed after production was
already updated · `2` usage or configuration error.

## Common mistakes

| Mistake | What happens |
|---|---|
| Running with `--apply` before reading the dry run | you upload the wrong picture to production, permanently |
| Reading `(none — the committed seed)` as an error | it is the healthy first run; the seed is a file, not a row |
| Expecting the anchor to change her next generated photo | it does not — RU-18 dropped the reference image |
| Forgetting to commit `assets/nina/_anchor.png` | the deferred consistent-face feature inherits a stale seed |
| Cropping the image square first "to help" | you throw away the full-screen photo phase 13 renders; the script fits inside and never crops |
| Passing a screenshot or a thumbnail | refused under 512 px |
| Reaching for `--user` on a one-user database | you do not need it, and a typo'd id updates nobody |
| Expecting the old avatar to be cleaned up | it is deliberately kept; it is her album |
| Editing `public/nina/avatar-001.png` to match | that is the committed static fallback and is not this skill's business |

## What it deliberately does not do

- **It does not write her message.** The new row is `source = 'operator'`, `announced_at = null`;
  phase 10's `avatar_changed` trigger chooses the words. A line written in a laptop script would be
  a second author for Nina's voice in the one place nobody would look when she sounds wrong.
- **It does not generate anything.** No OpenRouter, no Qwen. It uploads the file you gave it.
- **It does not set the circular crop.** `crop_scale`/`crop_x`/`crop_y` are left NULL, which means
  "render `object-cover`, centred". `/admin/nina` (phase 15) is where the zoom and drag live.
- **It does not touch `shots/` or the chat images.** Only the one new object under `nina/<userId>/`.

## The known gap it does not close

`scripts/blob-reap.mjs` reaps `shots/` only, and reports everything else as
`elsewhere — never touched`. So a `nina/` object orphaned by a transaction that failed after `put`
succeeded is harmless but permanent. Teaching the reaper a second `nina/` prefix — reference sites
`nina_message_images.pathname` and `nina_avatars.pathname` — plus updating
`.claude/skills/reap-orphaned-blobs/SKILL.md` is **one named follow-up card** (ruling D4), not this
skill's business: that skill's own doc requires a prefix's reference sites to exist first.
