---
name: search-analysis
description: Diagnose why one album photograph ranked where it did for a text search query, for Run Insights. Use when asked "/search-analysis <query> <#id>" — e.g. "/search-analysis tete #Rm2NG" — or when an admin album search returned an irrelevant photo, missed a photo that should have matched, or when someone asks "why did this image come up for that query", "why didn't #Rm2NG show up for tete", "what score did this photo get", "is this photo even searchable". Read-only: it reports and suggests, it never edits a description or a keyword.
---

# Search analysis

**`/search-analysis <text-query> <part-of-image-id>`** — e.g. `/search-analysis tete #Rm2NG`.

Run the script, **fetch and look at the photograph**, read the rest of the JSON, then **write the
inference yourself**. The script produces numbers; the deliverable is the paragraph that explains
them, and that paragraph is only as good as whether it is actually looking at what the row claims to
depict. Never edit anything.

## What the album's search actually is

One column, one score. Every album search embeds what the operator typed with
`openai/text-embedding-3-small`, and ranks `nina_avatars` by cosine similarity against each row's
stored `description_embedding` (`lib/nina/queries/avatarsearch.ts`). There is no keyword matching, no
substring search, no second index — **if a word is not in the text that became the vector, it cannot
be matched.**

That text is built by `buildNinaAvatarEmbedText` (`lib/nina/avatarEmbedText.ts`):

```
no keywords  ->  description
keywords     ->  description + "\n\nKeywords: " + search_keywords
```

Both columns are written from the same panel in `/admin/nina`: `description` by the vision model or
by hand, `search_keywords` by hand only. The script reports the row's `embeddedText` — the exact
string the embedder saw — so you never have to reconstruct it.

## Why the app cannot answer this question itself

Two gates sit between the ranking and the screen, and both of them hide exactly the row someone is
asking about:

| Gate | Value | What it hides |
|---|---|---|
| `NINA_SEARCH_LIMIT` | 48 | every row past rank 48, whatever it scored |
| `NINA_SEARCH_MIN_SCORE` | 0.2 | every row under the floor, however high it ranked |

The script runs the identical SQL — same column, same `<=>` distance, same `1 - distance`
similarity, same `(created_at desc, id desc)` tiebreak, same user scope — with **neither gate
applied**, and then reports the row's true rank against both. That is why it exists instead of a call
to the app's own search.

**0.2 is provisional** (set 2026-09-15 from the first measured distribution,
`avatarsearch.ts:84-91`). A photograph at 0.19 is not "wrong" — it is evidence about the threshold.
Say so when you see it, rather than treating the floor as a verdict.

## Run it

```bash
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/search-analysis.mjs 'tete' Rm2NG
```

Use this raw form, **not** `npm run nina:search-analysis` — npm prints banner lines and the script's
stdout is meant to be one JSON document and nothing else.

Parsing the invocation: **the LAST whitespace-separated token is the id fragment; everything before
it is the query.** A leading `#` is stripped for you. Quote the query when it has spaces.

| Invocation | query | fragment |
|---|---|---|
| `/search-analysis tete #Rm2NG` | `tete` | `Rm2NG` |
| `/search-analysis string bra #Rm2NG` | `string bra` | `Rm2NG` |
| `/search-analysis 'kolor pink' Rm2NGx4Kp1Qb` | `kolor pink` | `Rm2NGx4Kp1Qb` |

The fragment matches **anywhere** in the id (prefix, suffix or interior). The viewer header shows the
full id as `#<id> · <score>`, so a pasted prefix is the normal case.

### Exit codes

| Code | Meaning | What to do |
|---|---|---|
| 0 | a report on stdout | read it and write the inference |
| 2 | usage, env or a fragment outside the id alphabet | fix the invocation; `--env-file=.env.local` is required |
| 3 | no row's id contains that fragment | the fragment is mistyped, or the photo is in another database. Say so; do not search for a "close" id |
| 4 | the fragment names more than one row | the JSON lists them with folder and filename — **ask which one**, never pick |
| 5 | the `/embeddings` call failed | report the vendor error; nothing about the photograph has been learned |

## Fetch the photograph — always, on exit 0

`target.blobUrl` is the row's original image in production Blob storage, the same bytes
`/admin/nina`'s description rail shows the operator. Pull it and look at it **every time**, before
writing anything about what the description does or does not capture:

```bash
curl -sL --fail 'https://…/nina/<userId>/avatar-<id>.<ext>' -o "$SCRATCHPAD/<id>.<ext>"
```

Use the extension already in the URL (the pathname convention is `avatar-<id>.<ext>`, and Blob never
rewrites an object's bytes) and save into this session's scratchpad directory — never anywhere the
image would be published, and never re-uploaded to any external service. Then `Read` the saved file
the same way you'd read a screenshot. This is a read of a Blob object over HTTPS, not a write to
anything, so it stays inside the skill's read-only contract.

If the fetch fails — a non-2xx status, or `curl` erroring — say so explicitly in the report
("blobUrl fetch failed, HTTP 404 — the row's photo is gone from Blob even though the row and its
description survive") and fall back to a text-only analysis with that limitation stated up front.
Never silently skip the fetch and reason from `description`/`embeddedText` alone: that was the old
failure mode this step exists to remove — a plausible-sounding inference about a photograph nobody
looked at.

## Read the JSON

```jsonc
{
  "ok": true,
  "query": "tete",
  "candidates": 214,              // rows with a vector, for this photo's owner — the ranking's denominator
  "appThresholds": { "limit": 48, "minScore": 0.2 },
  "target": {
    "id": "Rm2NGx4Kp1Qb",
    "folder": "sexy", "filename": "IMG_0421.jpg",
    "blobUrl": "https://…/nina/<userId>/avatar-Rm2NGx4Kp1Qb.jpg",  // fetch this, don't skip it
    "description": "...",          // full, never truncated
    "searchKeywords": null,
    "embeddedText": "...",         // EXACTLY what the embedder saw
    "hasEmbedding": true,
    "rank": 61, "score": 0.1842,
    "wouldAppearInApp": false,
    "cutBy": ["page limit: rank 61 is past NINA_SEARCH_LIMIT (48)", "relevance floor: ..."]
  },
  "top": [ /* the 10 best rows that are NOT the target: rank, id, score, descriptionSnippet, searchKeywords */ ],
  "neighbours": [ /* the 3 ranks either side of the target */ ]
}
```

Read them in this order, because each one can end the analysis:

1. **`hasEmbedding: false`** — stop. The photograph is not in the search at all; nothing about the
   query is relevant. Either it has never been described, or an edit nulled the vector and the
   deferred re-embed has not landed (or failed). That is the finding.
2. **`wouldAppearInApp` + `cutBy`** — this is the operator's real question ("why did I see it / why
   didn't I"), answered before any semantics.
3. **Fetch `target.blobUrl` and look at it** (see above) — form your own read of what the photograph
   actually shows before checking it against anyone's prose, including the row's own `description`.
4. **`target.embeddedText` against `query`, against what you just saw** — the semantic core. Does
   the description accurately capture what's in the photo? Does the query's subject appear in the
   image at all, under a name the description used or failed to use? An irrelevant hit is usually
   either a description that's accurate but orthogonal to the query, or a description that's simply
   wrong about the photograph.
5. **`top` against the target** — what the winners have that the target does not, in words. This is
   where a keyword suggestion comes from.
6. **`neighbours`** — for a target far down the list, what it is tied with says more than the top ten.

## Write the inference

Not a restatement of the JSON. Four short parts:

1. **The verdict, in one line.** *"#Rm2NG ranks 61 of 214 at 0.184 for `tete` — the app did not show
   it: past the 48-row page AND under the 0.2 floor."*
2. **Why, semantically — grounded in the photograph you fetched, not just its prose.** Quote the
   phrases from `embeddedText` that carry (or fail to carry) the query, and check each one against
   what the image actually shows. Name the mechanism: the description is about the setting rather
   than the subject; the query is Indonesian slang for something visible in the photo but never named
   in the description; the description is simply inaccurate about what's depicted; the top rows all
   name the garment explicitly (verify that garment is actually in their photos too, if you fetched
   them) and this one says "wearing very little".
3. **What would change it** — concretely, as text the operator could paste into the panel. Prefer
   `search_keywords` for vocabulary the description should not carry as prose (slang, synonyms, an
   operator's own shorthand) — you can now propose the actual word because you've seen what the photo
   shows; prefer flagging a description edit when the prose is simply wrong about what the photograph
   shows, since you can now say so with the picture in front of you rather than guessing. Say which,
   and why.
4. **Anything the numbers say about the threshold itself.** A relevant photo at 0.19 or an irrelevant
   one at 0.24 is evidence that 0.2 is in the wrong place — note it; it is the reason the constant is
   marked provisional.

## The one rule

**This skill never writes.** No `editNinaAvatarDescriptionAction`, no
`editNinaAvatarSearchKeywordsAction`, no `UPDATE`, no edit to any file under `lib/`, and no change to
`NINA_SEARCH_MIN_SCORE` or `NINA_SEARCH_LIMIT`. The suggestions are reported for a human to apply in
`/admin/nina`, where he can see the photograph while he types.

That is not caution, it is the workflow the requirement asked for: the operator applies the edit
himself, in the panel, so the row's description and keywords stay things he actually said about his
own photograph rather than text a model wrote unattended. Fetching `blobUrl` closes the OLD gap —
a suggestion is now grounded in what the photo shows instead of guessed from a description of a
description — but it doesn't change who commits the edit. A model rewriting a row from a model's own
read of the image, applied without a human in the loop, still makes the search worse in a way nothing
detects, because the row still looks healthy afterwards. Suggest the words; let him look at the photo
himself and agree.

If asked to apply a suggestion, say that this skill is read-only and either point at the panel
(`/admin/nina` → select the photo → the description rail) or hand the edit to a separate,
explicitly-asked-for step.

## Common mistakes

| Mistake | What happens |
|---|---|
| Calling `searchNinaAvatarsByText` instead of the script | `clampLimit` caps at 48 and the 0.2 floor is unconditional — the target's true rank is exactly what those hide |
| Reading a rank without `candidates` | "rank 61" means nothing until you know whether the album has 70 rows or 700 |
| Treating `score < 0.2` as "irrelevant" | 0.2 is provisional and under review; a relevant photo below it is the *evidence*, not the answer |
| Assuming the keywords are matched as words | There is no keyword index. They are embedded into the same vector as the description, under a `Keywords: ` label, and nothing else |
| Appending keywords to the QUERY | Combining happens on the stored side only. The script embeds the query alone, exactly as the app does |
| Skipping the `blobUrl` fetch and reasoning from prose alone | This is the exact blind-suggestion failure mode the fetch step exists to remove — fetch and look every time the script exits 0 |
| Treating a fetched image as license to write the description yourself | Seeing the photo makes the suggestion informed, not authorized. It is still reported for the operator to apply in `/admin/nina` |
| Uploading or re-hosting the fetched photograph anywhere | These are private album photos in production Blob storage — keep the download in this session's scratchpad, never publish it, paste it into another service, or attach it outside this analysis |
| Picking one row after exit 4 | The fragment was ambiguous. Ask |
| Running it without `--env-file=.env.local` | Exit 2: no `DATABASE_URL`, no `OPENROUTER_API_KEY` |
| Editing anything | See The one rule |

## Note on the database

This repo has ONE database — `.env.local`'s `DATABASE_URL` is what production reads. The script is
read-only, so that is safe, but it also means **the report describes production**: a rank you print
is the rank a real operator is seeing right now. The same is true of `blobUrl` — it names the one
object in production Blob storage this row points at, not a copy; a plain GET over HTTPS is safe, but
the photo you fetch is the real, current asset, not a fixture.
