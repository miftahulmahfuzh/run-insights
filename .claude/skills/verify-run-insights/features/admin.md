# Admin

## Sub-features

- `/admin`: overview ("Signed in as <email>. Everything here writes production."), the image
  collection state, memory counts, links to each section.
- `/admin/nina`: Nina's image collection (album folders, upload, set profile picture, text and
  photo search); `?view=media` for chat photos.
- `/admin/image-generation`, `/admin/photoshop`: her image prompt and photo edits (OpenRouter).
- `/admin/personality`, `/admin/memory` (slots, reminders, promises, ledger; cells save on blur),
  `/admin/shortcuts`, `/admin/error-logs` (every failed LLM call: Text, Multimodal, Image
  generation, Photoshop).
- Gate: `requireAdmin()`; signed out redirects to `/`, signed in but not in `ADMIN_EMAILS` 404s.

## How to get to it (user POV)

Type `/admin` (there is no link from the runner's tabs). Only the address in `ADMIN_EMAILS`.

## Driving it with verify.sh

The run's `ADMIN_EMAILS` is the seeded runner's address, so the minted session is an admin.

```sh
$V api RUN GET /admin
# 2026-11-03: "Signed in as demo-tnx7pd@demo.invalid . Everything here writes production.",
#   "Image collection Empty — she is still using the committed photo.", "Memory 1 slot and 0 ledger rows"
$V api RUN GET /admin/nina
# "The album folder is empty, so she is still showing the committed photo ( /nina/avatar-001.png )",
#   "[Search the album]", "[Describe the photo you are looking for]", "[Search with a photo]"
$V api RUN GET /admin/memory          # "Demo Runner 1 slots · 0 facts"
$V api RUN GET /admin/error-logs      # "Error logs ... Text Multimodal Image generation Photoshop"
```

All five answer 200. Cost: 0 to read. Writes go through `ui` steps against the run's own database.

## Gotchas

- "Everything here writes production" is the page's own copy. In a run it writes the run's
  database and stand-in store; outside a run, `/admin` on runins.site really does.
- The album is empty in every run (no seeded avatars), so Nina shows the committed photo. Album
  uploads go to the run's store under `nina/`; album search embeddings and image generation need
  `--openrouter` (paid), photo search falls back without it.
- A demo run's error logs start with ~25 Text rows: the `run_committed` reactions refused while
  seeding.
- The 404-for-non-admins path is not driven (a run has one user). It is covered by
  `tests/env.admin.test.ts` and `tests/admin.requireAdmin.test.ts`.
