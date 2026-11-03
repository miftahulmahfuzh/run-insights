# Sharing a run

## Sub-features

- The share icon on `/r/<id>` ("Share this run") creates a `shares` row with an unguessable token
  and copies `<origin>/s/<token>`; when the clipboard refuses, the panel shows the link in a field
  ("Copy did not work — here is the link.").
- "This run has a live link." panel, **Stop sharing** with an inline confirm (**Keep sharing**).
- Which screenshots the shared page shows ("Screenshots in the shared page": Included / Not shared).
- `/s/<token>`: the public page, no session needed (the proxy never matches it), `no-store`.

## How to get to it (user POV)

Open a run -> the share icon at the top -> paste the link anywhere.

## Driving it with verify.sh

```sh
$V ui RUN .claude/skills/verify-run-insights/features/steps/share.mjs [-- RUN_ID]
# 2026-11-03: "shared /r/BifIQnRUAbca -> http://localhost:60385/s/LVjJnK3ytYNDCoB3", then
#   "public page (signed out): ... Mon, 2 Nov 2026 · Outdoor Run · 10.67 km · 1:18:36 · 7'22"/km"
$V sql RUN "select token, run_id, revoked_at is null as live from shares"
# LVjJnK3ytYNDCoB3 | BifIQnRUAbca | t
```

Cost: 0 (the public page shows the cached narrative; it never generates one).

## Gotchas

- The link's origin reads `localhost:<port>` even though the run serves on 127.0.0.1: the app
  derives it from the request. The steps file uses only the path, signed out (cookies cleared in
  the same fenced browser, so the fake store's screenshots still load from the stand-in).
- The browser is never granted clipboard access, so the copy always "fails" into the link field.
  That is the fallback path; the copy-success path is covered by `ShareButton.test.tsx`, not here.
