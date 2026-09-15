---
name: search-analysis
description: Diagnose why one album photograph ranked where it did for a text search query, for Run Insights. Use when asked "/search-analysis <query> <#id>" — e.g. "/search-analysis tete #Rm2NG" — or when an admin album search returned an irrelevant photo, missed a photo that should have matched, or when someone asks "why did this image come up for that query", "why didn't #Rm2NG show up for tete", "what score did this photo get", "is this photo even searchable". Read-only: it reports and suggests, it never edits a description or a keyword.
---

# Search analysis

**`/search-analysis <text-query> <part-of-image-id>`** — e.g. `/search-analysis tete #Rm2NG`.

Run the script, read its JSON, then **write the inference yourself**. The script produces numbers;
the deliverable is the paragraph that explains them. Never edit anything.

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
3. **`target.embeddedText` against `query`** — the semantic core. What in that text does the query
   actually overlap with? An irrelevant hit usually has a description that mentions the query's
   subject in passing, or in a sense the model conflates with it.
4. **`top` against the target** — what the winners have that the target does not, in words. This is
   where a keyword suggestion comes from.
5. **`neighbours`** — for a target far down the list, what it is tied with says more than the top ten.

## Write the inference

Not a restatement of the JSON. Four short parts:

1. **The verdict, in one line.** *"#Rm2NG ranks 61 of 214 at 0.184 for `tete` — the app did not show
   it: past the 48-row page AND under the 0.2 floor."*
2. **Why, semantically.** Quote the phrases from `embeddedText` that carry (or fail to carry) the
   query, and compare against the `descriptionSnippet`s of the rows that beat it. Name the mechanism:
   the description is about the setting rather than the subject; the query is Indonesian slang and the
   description is clinical English; the top rows all name the garment explicitly and this one says
   "wearing very little".
3. **What would change it** — concretely, as text the operator could paste into the panel. Prefer
   `search_keywords` for vocabulary the description should not carry as prose (slang, synonyms, an
   operator's own shorthand); prefer a description edit when the prose is simply wrong about what the
   photograph shows. Say which, and why.
4. **Anything the numbers say about the threshold itself.** A relevant photo at 0.19 or an irrelevant
   one at 0.24 is evidence that 0.2 is in the wrong place — note it; it is the reason the constant is
   marked provisional.

## The one rule

**This skill never writes.** No `editNinaAvatarDescriptionAction`, no
`editNinaAvatarSearchKeywordsAction`, no `UPDATE`, no edit to any file under `lib/`, and no change to
`NINA_SEARCH_MIN_SCORE` or `NINA_SEARCH_LIMIT`. The suggestions are reported for a human to apply in
`/admin/nina`, where he can see the photograph while he types.

That is not caution, it is the workflow the requirement asked for: the operator looks at the image
and decides what it is *of*. A model rewriting a description from a description — without the
picture — writes plausible text that makes the search worse in a way nothing detects, because the row
still looks healthy afterwards. Suggest the words; let him look at the photo and agree.

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
| Suggesting a description rewrite without the picture | You cannot see the photograph. Suggest keywords, or ask the operator what it shows |
| Picking one row after exit 4 | The fragment was ambiguous. Ask |
| Running it without `--env-file=.env.local` | Exit 2: no `DATABASE_URL`, no `OPENROUTER_API_KEY` |
| Editing anything | See The one rule |

## Note on the database

This repo has ONE database — `.env.local`'s `DATABASE_URL` is what production reads. The script is
read-only, so that is safe, but it also means **the report describes production**: a rank you print
is the rank a real operator is seeing right now.
