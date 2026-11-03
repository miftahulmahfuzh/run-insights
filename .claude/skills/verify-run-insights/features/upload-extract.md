# Upload and the vision read

## Sub-features

- `/upload`: pick 1-3 Fitness-app screenshots; each is compressed in the browser (560 px / q80
  recipe, `lib/photos/compressForExtraction.ts`), content-hashed, and PUT straight to Blob with a
  client token from `POST /api/upload` (the route never sees image bytes).
- Kind per tile (summary, splits, heart rate), carried inside the signed token.
- `POST /api/extract` inserts a `pending` extraction and returns 202 in under 500 ms; `after()` runs
  `glm-4.6v` on the images in the background (the token-floor guard checks
  `prompt_tokens >= 500 x images` before trusting any field).
- `/x/<id>` polls `GET /api/extract/<id>` and swaps to the review form when the read settles, or to
  the hand-entry form when it fails.

## How to get to it (user POV)

Bottom tab **New** (`/upload`) -> **Choose images** -> pick the screenshots -> **Read this run** ->
the review screen fills in about half a minute later.

## Driving it with verify.sh

Real run (`$V up` or `--seed=review`; `--seed=new` has no profile and redirects to onboarding):

```sh
$V upload RUN research/fixtures/screenshots/shipped/{1,2,3}.jpg
# 2026-11-03: polled 28 s, "status":"ok","errorCode":null, the full session JSON
#   (10.67 km, 11 splits, 5 zones), EXTRACTION=tfDe1x0PbWQx. Budget: 1 llm call.
$V ui RUN .claude/skills/verify-run-insights/features/steps/upload.mjs
# The browser path: "extraction: /x/Pl-ykuOFGQ1m", then "Check this run ... Summary / Splits /
#   Heart rate" once the read lands. 1 llm call.
$V sql RUN "select id, status, model, prompt_tokens from extractions order by created_at desc limit 2"
$V blobs RUN shots/     # the browser-compressed bytes (52-68 KB), suffixed: shots/<12>-<30>.jpg
```

Offline (`--offline`): `upload` ends `"status":"failed","errorCode":"transport"` with 1 call
refused and 0 spent; `upload.mjs` ends on "We could not read these screenshots automatically / The
reader could not be reached. Nothing was saved." That is the outage state, and it is the right
end state for an offline run.

## Gotchas

- `upload` replays `UploadPicker`'s calls with the raw fixture bytes (71/60/56 KB); `upload.mjs`
  exercises the browser's own compression worker and Blob client. A change to compression, the
  picker or the Blob handshake needs `upload.mjs`; a change to extraction or its route can use
  either.
- The stand-in enforces what Vercel enforces for a client token: the signature, the pathname, the
  expiry, `maximumSizeInBytes` (600 000 for shots), `allowedContentTypes` and the random suffix.
  A blob the stand-in refused would have been refused in production too.
- Every `/api/upload` logs "onUploadCompleted provided but no callbackUrl could be determined": the
  completion webhook needs a public URL. The handler only logs, so nothing depends on it.
- The shipped fixtures read clean (no consistency checks). The flagged fixture with a real misread
  is the seeded extraction whose `raw_response.vendor.seeded` is null (see review-commit.md).
