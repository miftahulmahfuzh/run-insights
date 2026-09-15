# Phase 3: `/search-analysis` skill and its diagnostic script

**Plan set:** `NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md`
**Analysis:** `20260915-140828-SBI4_code_analyzer.md`
**Satisfies:** R3 — `/search-analysis <text-query> <part-of-image-id>`: a streamlined way to ask
"why did THIS photograph rank where it did for THAT query", answered from the live column with the
app's own scoring, and answered as a written inference rather than a number.
**Depends on:** Phase 2 (the `search_keywords` column and `lib/nina/avatarEmbedText.ts` must exist)
**Difficulty:** NORMAL
**Package:** `scripts`, `.claude/skills`

---

## Goal

An operator who sees an irrelevant hit can type `/search-analysis tete #Rm2NG` and get back the
photograph's TRUE rank and score in the full, unfiltered ordering — including the ranks the app
structurally cannot show, because `NINA_SEARCH_LIMIT` caps the page at 48 and
`NINA_SEARCH_MIN_SCORE` cuts everything under 0.2 — together with its stored `description`, its
`search_keywords`, the exact text its vector was computed from, and the ten rows that beat it. On
top of that JSON, Claude writes the human inference: what in the stored prose the query matched, and
what the operator could add. Nothing is written back: the skill diagnoses and suggests, and the edits
stay manual in the admin UI that phases 1 and 2 built.

## Interface Contract

**Creates:**

- `scripts/search-analysis.mjs` (NEW) — CLI:
  `node --experimental-strip-types --no-warnings --env-file=.env.local scripts/search-analysis.mjs <query…> <id-fragment>`
  · positional args; every argument except the LAST is joined with single spaces into the query;
    the LAST is the id fragment, with an optional leading `#` stripped
  · exit 0 = a report on stdout; 2 = usage/env/validation; 3 = no row matched the fragment;
    4 = the fragment is ambiguous; 5 = the embeddings call failed
  · stdout is ONE JSON document and nothing else, in every exit path, carrying `ok: true|false`
  · READ-ONLY: two `SELECT`s and one `/embeddings` POST. No `UPDATE`, no `DELETE`, no Blob call.
- `.claude/skills/search-analysis/SKILL.md` (NEW) — skill `name: search-analysis`, invoked as
  `/search-analysis <text-query> <part-of-image-id>`, e.g. `/search-analysis tete #Rm2NG`.
- `package.json`: npm script `nina:search-analysis` (the convenience wrapper; the skill itself uses
  the raw `node` form so stdout stays pure JSON — see Step 3).

**Requires (from earlier phases):**

- Phase 2 — column `nina_avatars.search_keywords` (`text`, NULLABLE, no default) exists in the
  database AND the migration has been applied. The script `SELECT`s it by its SQL name.
- Phase 2 — `lib/nina/avatarEmbedText.ts` exists, is zero-import, and exports
  `buildNinaAvatarEmbedText(description: string, searchKeywords: string | null): string`. The
  script imports it as `../lib/nina/avatarEmbedText.ts` under `--experimental-strip-types`.

**Deletes:** none.
**Renames:** none.
**Signature changes:** none.

**Leaves alone (owned by others):** everything under `components/`, `app/` and `lib/` — including
`lib/nina/queries/avatarsearch.ts`, which this phase READS and MIRRORS but does not touch (Phase 1
and Phase 2's territory both, and Invariant 3 forbids changing `NINA_SEARCH_LIMIT` /
`NINA_SEARCH_MIN_SCORE` / the weighting in any case). `scripts/album-search-probe.mjs` is read as a
precedent and left byte-identical. `scripts/backfill-avatar-embeddings.mjs` is Phase 2's file and is
not touched.

**Shared file with Phase 2 — `package.json`.** Both phases append one line to the `scripts` block
(Phase 2: `nina:backfill-embeddings`; here: `nina:search-analysis`). Different lines, additive, and
git merges them cleanly; if they collide textually, keep BOTH lines.

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/search-analysis.mjs` | create | the whole diagnostic: fragment→row, query→vector, unfiltered ranking, JSON report |
| `.claude/skills/search-analysis/SKILL.md` | create | the skill: domain context, the invocation, how to read the JSON, and the never-edit rule |
| `package.json` | modify | one additive line in `scripts`, beside the other `nina:` entries (`:31-43`; after `nina:promote-image-prompt` `:37` is natural, the position is not load-bearing) — **co-edited by Phase 2** (`nina:backfill-embeddings`); keep both lines on conflict |

---

## Decisions (made here, with their reasons — the reconciler should not re-open these)

### D1 — the fragment match is a SUBSTRING match, not a suffix match. This corrects the phase brief.

> **RATIFIED by the reconciler (round 1), re-verified against source, and now the plan set's
> standing wording.** Three checks, all green: (a) `components/admin/explorer/SearchResultsGrid.tsx`
> renders `` `#${hit.id} · ${hit.score.toFixed(3)}` `` — the FULL 12-character id, no truncation at
> all — so what an operator pastes is a prefix, and a suffix-only lookup would return zero rows for
> the requirement's own worked example; (b) `lib/id.ts:11`'s alphabet is
> `'0123456789A-Za-z-_'` — **`_` really is the final symbol**, and it is also `LIKE`'s
> single-character wildcard, so `strpos` (which has no metacharacters) is the correct instrument and
> `LIKE '%' || $1` would be a live bug; (c) the analysis document already says
> *"suffix/substring lookup is kept"*, never suffix-only. The plan index's Scope, Decisions and
> phase-3 exit criteria have been rewritten to say **substring-via-`strpos`**; nothing downstream
> says "suffix-only" any more. Do not re-open this.

The phase scope handed to this planner says "a SUFFIX match against `nina_avatars.id`". The shipped
code says the fragment the operator will actually type is a **PREFIX**:

```
components/admin/explorer/SearchResultsGrid.tsx:70
        meta: `#${hit.id} · ${hit.score.toFixed(3)}`,
```

`751e034` renders the FULL 12-character id in the viewer header, so `#Rm2NG..` in the user's own
report (`NINA_ALBUM_SEARCH_RELEVANCE_TOOLS_PLAN.md:18`) is a human truncating a full id he could
see — the trailing `..` is the elision. A suffix-only lookup returns zero rows for the requirement's
own worked example, which is the one input this feature is guaranteed to receive.

The analysis agrees and is the tie-breaker (it is ground truth, and it was written against the same
code): *"so the **suffix/substring** lookup is kept"* (`20260915-140828-SBI4_code_analyzer.md:113-115`).

So: `strpos(id, <fragment>) > 0` — which subsumes prefix, suffix and interior. The widening is safe
precisely because the brief's other, harder requirement is kept exactly as written: **zero matches
and more-than-one match are both refusals with a clear message and a non-zero exit, never a guess.**
A substring match that refuses ambiguity is strictly better than a suffix match that refuses
ambiguity; it can only turn a "not found" into either a hit or an honest "that fragment names 3
rows, here they are".

**And it is `strpos`, deliberately not `LIKE '%' || fragment`.** The id alphabet is
`0123456789A-Za-z-_` (`lib/id.ts:11`), so **`_` is a legal id character AND a `LIKE` single-character
wildcard.** `id LIKE '%a_c'` matches `abc`, `axc` and `a_c` alike — a silent ambiguity the refusal
guard would then report as "3 matches" for a fragment that genuinely names one row, or worse, a
silent single match on the WRONG row. `strpos` has no metacharacters at all, so the question it asks
is the question that was meant. (`LIKE … ESCAPE '\'` with the fragment escaped would also work; it is
two more moving parts for the identical answer.)

### D2 — it imports `buildNinaAvatarEmbedText` rather than replicating the join.

The plan brief asks for the choice and the reason, and Invariant 5 asks for it in writing.

**Imported.** The script reports a field called `embeddedText`: the exact string this row's vector
was computed from. That field is the whole diagnostic payload for a keyword question — "I tagged it
`tete` and it still ranks 61st" is answered by showing what the embedder actually saw. A locally
retyped join would make that field a claim about the script's copy rather than about the app, and the
report would keep looking right while being wrong about the one thing it was consulted for.

**Verified, not assumed, that the import works for a plain script.** Node here is **v22.23.1**, and
this repo already ships three npm scripts that import a `lib/*.ts` module from an `.mjs` script under
`--experimental-strip-types`:

```
scripts/backfill-record-keys.mjs:85   import { RECORD_CATALOG } from '../lib/records/catalog.ts'
scripts/nina-shortcuts-import.mjs:63  import { newId } from '../lib/id.ts'
package.json:33,35,36,37             node --experimental-strip-types --no-warnings --env-file=.env.local …
```

The precondition is that stripping the types leaves no runtime dependency and no `@/` alias behind,
and Phase 2's `lib/nina/avatarEmbedText.ts` is specified zero-import for exactly this
(`phase-2.md` Step 3, D1 and its Handoffs section). So the flag goes on this script's npm entry too,
and there is an offline verification for it in the Verification section that needs no database.

**Duplicated (the `album-search-probe.mjs` convention):** `EMBEDDINGS_URL`, `EMBEDDING_MODEL`, the
`fetch`, and the SQL. `lib/nina/embedding.ts` opens with `import 'server-only'`, reads the zod env
group and imports `@/lib/db/schema` through a path alias — none of which survives a plain node run.
That is the same split `scripts/album-search-probe.mjs:17-21` already argues for itself, with the
same warning: if the model migrates, this copy must move with it or the probe scores a space the
album is not stored in.

### D3 — it duplicates `NINA_SEARCH_LIMIT` and `NINA_SEARCH_MIN_SCORE` to REPORT against them, never to apply them.

Both constants are module-private in `lib/nina/queries/avatarsearch.ts` (`:64`, `:100`) — deliberately,
because `lib/nina/queries.test.ts` pins that every runtime export of the barrel is a function. They
cannot be imported, and this script must not export them into existence.

They are copied here because without them the report cannot answer the operator's actual question.
"Rank 61, score 0.1842" is a number; **"rank 61, score 0.1842 → the app would NOT show this: cut by
the page limit AND by the relevance floor"** is a diagnosis. The script therefore prints both
constants in its own output, next to the verdict, so a reader can check the copy against the source
in one glance — which is the drift guard, since a stale copy would otherwise produce a confidently
wrong verdict.

**It never filters by them.** The ranking read has no `LIMIT` and no score predicate; that is the
entire reason this script exists instead of a call to `searchNinaAvatarsByText`, whose `clampLimit`
hard-caps at 48 and whose `rankByDistance` applies the 0.2 floor unconditionally
(`avatarsearch.ts:148-151`, `:189`). Invariant 3 is untouched: no constant in `lib/` changes.

### D4 — the ORDER BY carries the app's tiebreak, so "rank" means the same integer in both places.

`rankByDistance` orders by `asc(distance), desc(createdAt), desc(id)` (`avatarsearch.ts:178`). The
probe omits the tiebreak because it only wants a distribution. This script's rank is compared against
what the operator saw in the grid, so the tiebreak is copied verbatim — without it, two rows with
identical descriptions (the "duplicate folder" workflow the docstring names) swap ranks between the
app and the diagnostic for no reason, and the report contradicts the screen.

### D5 — the ranking is scoped to the TARGET ROW'S user, not run globally.

`searchScope` is `and(eq(userId), isNotNull(descriptionEmbedding))` (`avatarsearch.ts:144`), and plan
Invariant 4 says every read stays scoped to `userId`. The script does not take a `userId` argument:
it reads `user_id` off the resolved target row and scopes the ranking to that. So the candidate count
it reports is the same candidate set `searched` means in the UI, and a multi-user database cannot
inflate the rank. (`scripts/album-search-probe.mjs` ranks globally; that is correct for threshold
tuning across the whole store and wrong for "where did MY photo land".)

### D6 — stdout is one JSON document in every exit path; human lines go to stderr.

The consumer is Claude reading a Bash tool result. Interleaved progress prose and JSON is a parse
hazard, and a failure that prints only English gives the skill nothing structured to act on. So every
exit — success, not-found, ambiguous, embed failure — writes exactly one `JSON.stringify(…, null, 2)`
document to stdout with an `ok` discriminator, and the one-line human message goes to stderr. This is
also why the SKILL.md tells Claude to run the raw `node …` form rather than `npm run …`: npm prints
two banner lines ahead of the script's stdout.

---

## Implementation Steps

### Step 1: The diagnostic script

**File:** `scripts/search-analysis.mjs` — NEW (whole file).

**Change:** Create it. Read-only, one row resolved, one query embedded, one unfiltered ranking, one
JSON report.

**Code (complete file):**

```js
// /search-analysis — why did THIS photograph rank where it did for THAT query?
//
//   node --experimental-strip-types --no-warnings --env-file=.env.local \
//     scripts/search-analysis.mjs 'tete' Rm2NG
//   npm run nina:search-analysis -- 'string bra' '#Rm2NG'
//
// The LAST argument is the image id or any fragment of one (a leading '#' is stripped, because the
// viewer header renders '#<id> · <score>' and an operator copies what he sees). EVERY argument
// before it is joined with single spaces into the query text, so a multi-word query needs no quotes
// — though quoting it is clearer.
//
// READ-ONLY: two SELECTs and one /embeddings POST. No UPDATE, no DELETE, no Blob call. This script
// diagnoses; the edits are made by hand in /admin/nina, which is the whole point of the skill that
// drives it (`.claude/skills/search-analysis/SKILL.md`).
//
// WHY IT EXISTS — and why it cannot just call the app's search. `searchNinaAvatarsByText`
// (`lib/nina/queries/avatarsearch.ts`) passes every request through `clampLimit`, which caps the
// page at NINA_SEARCH_LIMIT = 48, and through `rankByDistance`, which cuts every row under
// NINA_SEARCH_MIN_SCORE = 0.2. Those are exactly the two mechanisms that HIDE the answer: an image
// the operator is asking about is usually one the app either did not show him or showed him at a
// position he wants explained. So this reproduces the scoring EXACTLY — same column, same `<=>`
// cosine distance, same `1 - distance` similarity, same JSON.stringify vector encoding, same
// (created_at desc, id desc) tiebreak, same user scope — with NO limit and NO floor, and then
// REPORTS the row's true rank against both constants instead of applying them.
//
// ── WHAT IS IMPORTED AND WHAT IS DUPLICATED, AND WHY ────────────────────────────────────────────
// IMPORTED: `buildNinaAvatarEmbedText` from `../lib/nina/avatarEmbedText.ts`. The report's
// `embeddedText` field claims to be the exact string this row's vector was computed from; a locally
// retyped join would make that field a claim about this file's copy instead, and it would keep
// looking right while being wrong about the one thing the report is consulted for. That module is
// deliberately zero-import so `--experimental-strip-types` can load it — the rule
// `scripts/backfill-record-keys.mjs` and `scripts/nina-shortcuts-import.mjs` already state and obey.
//
// DUPLICATED (the `scripts/album-search-probe.mjs` convention, with that file's warning repeated):
// the embeddings URL, the model id, and the SQL. `lib/nina/embedding.ts` opens with
// `import 'server-only'`, reads the zod env group and imports `@/lib/db/schema` through a `@/`
// alias, none of which survives a plain node run. The source of truth for the model remains
// `lib/nina/openrouter.ts` — if it ever migrates, this copy must move with it or this script scores
// a space the album is not stored in.
//
// ALSO DUPLICATED, AND ON PURPOSE: NINA_SEARCH_LIMIT and NINA_SEARCH_MIN_SCORE below. They are
// module-private in avatarsearch.ts (the barrel's test pins that every runtime export is a
// function), so they cannot be imported, and without them "rank 61, score 0.1842" is a number
// rather than a diagnosis. They are echoed into the report so a reader can check the copy against
// the source in one glance. They are NEVER applied to the query.
import { buildNinaAvatarEmbedText } from '../lib/nina/avatarEmbedText.ts'

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings'
const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/* Mirrors of `lib/nina/queries/avatarsearch.ts:64` and `:100`. Reported, never applied. */
const NINA_SEARCH_LIMIT = 48
const NINA_SEARCH_MIN_SCORE = 0.2

/* `lib/id.ts`'s alphabet, 1..12 symbols. A fragment outside it cannot be part of any id we mint, so
 * it is a typo and is refused before a round trip. */
const ID_FRAGMENT_RE = /^[0-9A-Za-z_-]{1,12}$/
/* How much of a competitor's prose the comparison table carries. Enough to judge semantic overlap,
 * short enough that ten of them stay readable. The TARGET's description is never truncated. */
const SNIPPET_CHARS = 240
const TOP_N = 10
/* Ranks either side of the target, so "what did it just lose to" has an answer even at rank 61. */
const NEIGHBOURS = 3
/* More than this many matches and the fragment is useless as a name; the list is for the operator
 * to pick from, not to read. */
const MAX_LISTED_MATCHES = 25

/**
 * Every exit path writes ONE JSON document to stdout and one human line to stderr. The consumer is
 * an agent reading a tool result: interleaved prose and JSON is a parse hazard, and a failure that
 * prints only English leaves it nothing structured to act on.
 */
function emit(payload, exitCode) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  process.exit(exitCode)
}

function fail(exitCode, error, extra = {}) {
  console.error(`FAIL  ${error}`)
  emit({ ok: false, error, ...extra }, exitCode)
}

/* ── 1. The arguments ───────────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
if (argv.length < 2) {
  fail(
    2,
    "usage: search-analysis.mjs <query…> <id-fragment>   e.g.  'tete' Rm2NG   or  string bra '#Rm2NG'",
  )
}

const fragment = argv[argv.length - 1].replace(/^#/, '').trim()
const query = argv.slice(0, -1).join(' ').trim()

if (query.length === 0) fail(2, 'the query text is empty — it is every argument but the last')
if (!ID_FRAGMENT_RE.test(fragment)) {
  fail(
    2,
    `${JSON.stringify(fragment)} is not a fragment of an id: ids are 1–12 symbols from [0-9A-Za-z_-] ` +
      "(lib/id.ts). A leading '#' is stripped for you; nothing else is.",
  )
}

/* ── 2. The environment — the probe's guards, verbatim, for the probe's reasons ─────────────── */

const url = process.env.DATABASE_URL
if (!url) fail(2, 'needs DATABASE_URL — run with --env-file=.env.local')
const parsedUrl = new URL(url)
if (!parsedUrl.host.endsWith('neon.tech')) {
  fail(2, `DATABASE_URL does not point at Neon (host: ${parsedUrl.host})`)
}
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) fail(2, 'needs OPENROUTER_API_KEY — run with --env-file=.env.local')

const { neon } = await import('@neondatabase/serverless')
const sql = neon(url)

/* ── 3. The fragment → exactly one row, or a refusal ────────────────────────────────────────—
 *
 * `strpos(id, $1) > 0` and NOT `id LIKE '%' || $1`. The id alphabet includes `_`
 * (`lib/id.ts:11`), which is ALSO a LIKE single-character wildcard — so `LIKE '%a_c'` would match
 * `abc` and `axc` as well as `a_c`, and the ambiguity guard below would either refuse a fragment
 * that genuinely names one row or, worse, single out the wrong one. `strpos` has no metacharacters.
 *
 * Substring rather than suffix, because the viewer header renders the FULL id
 * (`SearchResultsGrid.tsx:70`, `#${hit.id} · ${score}`), so what an operator pastes is normally a
 * PREFIX — `#Rm2NG..` in the requirement is a human eliding the tail. Substring covers prefix,
 * suffix and interior alike, and the refusals below are what make the widening safe: a fragment
 * that names two rows is reported, never guessed at.
 *
 * NOT scoped to a user: the operator names a photograph, not an owner. The user scope is applied to
 * the RANKING below, taken from whichever row this resolves to. */
const matches = await sql`
  select id, user_id, folder, filename, description, search_keywords,
         (description_embedding is not null) as has_embedding
  from nina_avatars
  where strpos(id, ${fragment}::text) > 0
  order by created_at desc, id desc
  limit ${MAX_LISTED_MATCHES + 1}
`

if (matches.length === 0) {
  fail(3, `no row in nina_avatars has an id containing ${JSON.stringify(fragment)}`, {
    fragment,
    query,
  })
}
if (matches.length > 1) {
  const listed = matches.slice(0, MAX_LISTED_MATCHES).map((row) => ({
    id: row.id,
    folder: row.folder === '' ? '(root)' : row.folder,
    filename: row.filename,
  }))
  fail(
    4,
    `${JSON.stringify(fragment)} names ${matches.length > MAX_LISTED_MATCHES ? `more than ${MAX_LISTED_MATCHES}` : matches.length} rows — give more of the id`,
    { fragment, query, matches: listed },
  )
}

const target = matches[0]

/* ── 4. The query vector — the app's model, the app's endpoint ──────────────────────────────—
 *
 * The QUERY is embedded ALONE. `search_keywords` is an input to the text a ROW's vector is computed
 * from (Phase 2's `buildNinaAvatarEmbedText`), never something a query is concatenated with: the
 * combining happens on the stored side, at write time. Embedding the query with anything appended
 * would score a question nobody asked. */

async function embed(text) {
  const res = await fetch(EMBEDDINGS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text, encoding_format: 'float' }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${raw.slice(0, 200)}`)
  const vector = JSON.parse(raw)?.data?.[0]?.embedding
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`embeddings returned no vector for ${JSON.stringify(text)}`)
  }
  return vector
}

let queryVector
try {
  queryVector = JSON.stringify(await embed(query))
} catch (cause) {
  fail(5, `could not embed the query: ${String(cause)}`, { fragment, query })
}

/* ── 5. The ranking — the app's SQL with the limit and the floor removed ────────────────────—
 *
 * `ORDER BY embedding <=> $q ASC` is the spelling the pgvector HNSW index answers, and the
 * projection computes `1 - distance` because the human-facing number is the similarity — both
 * exactly as `rankByDistance` does it. The tiebreak `(created_at desc, id desc)` is copied too, so
 * a rank printed here is the same integer the operator saw in the grid; without it two identical
 * descriptions swap places between the app and this report for no reason.
 *
 * No LIMIT, no score predicate. That absence IS this script. */
const ranked = await sql`
  select id, folder, filename, description, search_keywords,
         1 - (description_embedding <=> ${queryVector}::vector) as score
  from nina_avatars
  where user_id = ${target.user_id}
    and description_embedding is not null
  order by description_embedding <=> ${queryVector}::vector asc,
           created_at desc,
           id desc
`

/* ── 6. Where the target landed, and whether the app would have shown it ────────────────────— */

const targetIndex = ranked.findIndex((row) => row.id === target.id)
const rank = targetIndex === -1 ? null : targetIndex + 1
const score = targetIndex === -1 ? null : Number(ranked[targetIndex].score)

const cutBy = []
if (!target.has_embedding) {
  cutBy.push(
    'no vector: description_embedding IS NULL, so this row is not a search candidate at all. ' +
      'It has never been embedded, or an edit nulled the vector and the re-embed has not landed yet.',
  )
} else if (rank === null) {
  /* Belt and braces: has_embedding was read in an earlier statement than the ranking. */
  cutBy.push('the row carries a vector but did not appear in the ranking — re-run; the column changed underneath')
} else {
  if (rank > NINA_SEARCH_LIMIT) {
    cutBy.push(`page limit: rank ${rank} is past NINA_SEARCH_LIMIT (${NINA_SEARCH_LIMIT})`)
  }
  if (score < NINA_SEARCH_MIN_SCORE) {
    cutBy.push(
      `relevance floor: score ${score.toFixed(4)} is under NINA_SEARCH_MIN_SCORE (${NINA_SEARCH_MIN_SCORE})`,
    )
  }
}

const snippet = (text) =>
  text == null ? null : text.length <= SNIPPET_CHARS ? text : `${text.slice(0, SNIPPET_CHARS)}…`

const asRow = (row, index) => ({
  rank: index + 1,
  id: row.id,
  folder: row.folder === '' ? '(root)' : row.folder,
  filename: row.filename,
  score: Number(Number(row.score).toFixed(4)),
  descriptionSnippet: snippet(row.description),
  searchKeywords: row.search_keywords,
})

/* The ten best rows that are NOT the target — "what beat it" is the comparison the inference is
 * written from. */
const top = ranked
  .map(asRow)
  .filter((row) => row.id !== target.id)
  .slice(0, TOP_N)

/* And the handful either side of it, because at rank 61 the top ten explain the query and the
 * neighbours explain the position. */
const neighbours =
  rank === null
    ? []
    : ranked.map(asRow).slice(Math.max(0, rank - 1 - NEIGHBOURS), rank + NEIGHBOURS)

/* ── 7. The report ─────────────────────────────────────────────────────────────────────────—— */

emit(
  {
    ok: true,
    query,
    fragment,
    model: EMBEDDING_MODEL,
    generatedAt: new Date().toISOString(),
    /* Echoed so a reader can check these copies against lib/nina/queries/avatarsearch.ts:64,100 —
     * a stale copy would produce a confidently wrong verdict and nothing else would say so. */
    appThresholds: {
      limit: NINA_SEARCH_LIMIT,
      minScore: NINA_SEARCH_MIN_SCORE,
      source: 'lib/nina/queries/avatarsearch.ts (module-private; mirrored here, never applied)',
    },
    candidates: ranked.length,
    target: {
      id: target.id,
      folder: target.folder === '' ? '(root)' : target.folder,
      filename: target.filename,
      description: target.description,
      searchKeywords: target.search_keywords,
      /* The exact text this row's vector was computed from — Phase 2's one combine function, not a
       * second spelling of it. `null` when the row has no description to anchor on. */
      embeddedText:
        target.description == null
          ? null
          : buildNinaAvatarEmbedText(target.description, target.search_keywords),
      hasEmbedding: target.has_embedding,
      rank,
      score,
      wouldAppearInApp: cutBy.length === 0,
      cutBy,
    },
    top,
    neighbours,
  },
  0,
)
```

**Impact:** A new read-only instrument. Nothing imports it; `package.json` (Step 3) is what keeps it
visible to `knip`, the same way every other `scripts/*.mjs` entry stays live.

---

### Step 2: The skill

**File:** `.claude/skills/search-analysis/SKILL.md` — NEW (whole file, new directory).

**Change:** Create the directory and the file. Frontmatter shape is
`.claude/skills/reap-orphaned-blobs/SKILL.md`'s: `name` plus a `description` that front-loads the
trigger phrases, then a body that gives the domain first, the invocation second, and the failure
modes last.

**Code (complete file):**

````markdown
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
````

**Impact:** A new project skill, discoverable as `/search-analysis`. No source file references it;
skills are discovered by directory.

---

### Step 3: The npm entry

**File:** `package.json` — one line in the `scripts` block, beside the other `nina:` entries (they
sit at `:31-43`; after `"nina:promote-image-prompt"` at `:37` is the natural spot). The position is
**not** load-bearing: this is an independent, order-insensitive addition, not a diff that assumes
anything else about the block's contents. Phase 2 adds `"nina:backfill-embeddings"` to the same
block on the same terms; **keep both lines** on any textual conflict, and never reorder the block.

**Change:** Add the wrapper. It is the convention every other `scripts/*.mjs` follows, and it is what
keeps `knip` from reporting the file as unused (`knip.ts`'s header: *"package.json scripts (every
scripts/*.mjs wired there)"*). The SKILL.md deliberately tells Claude to use the raw `node` form
instead, because `npm run` prints banner lines ahead of the script's stdout.

**Code:**

```json
    "nina:search-analysis": "node --experimental-strip-types --no-warnings --env-file=.env.local scripts/search-analysis.mjs",
```

**Impact:** `npm run nina:search-analysis -- 'tete' Rm2NG` works for a human at a terminal. ⚠ Phase 2
adds `"nina:backfill-embeddings"` to this same block; the two lines are independent and a textual
conflict is resolved by **keeping both**.

---

## Verification

**Build:**

```bash
cd /home/miftah/.worktrees/run-insights/nina-album-search-relevance-tools
npm run typecheck     # next typegen && tsc --noEmit
```

This phase adds no TypeScript. `scripts/search-analysis.mjs` is `.mjs` and is not in the tsc program;
confirm that rather than assume it — the check is one command and its expected output is *nothing*:

```bash
npx tsc --noEmit --listFiles | grep -c search-analysis    # expect 0
```

**Lint / format** (`scripts/**` IS in the eslint surface — only `research/**` and the compression
worker are excluded, `eslint.config.mjs:18-20`):

```bash
npm run lint
npm run format:check
```

**Tests:**

```bash
npm test        # unchanged; this phase adds no test file and touches no module under test
```

**Offline smoke — proves the cross-phase `.ts` import resolves, with no database and no API key.**
Run it from the worktree root; it exits 2 at the usage check, which happens *after* the static import
of `../lib/nina/avatarEmbedText.ts` has already been stripped and loaded:

```bash
node --experimental-strip-types --no-warnings scripts/search-analysis.mjs
# expect on stderr:  FAIL  usage: search-analysis.mjs <query…> <id-fragment> …
# expect on stdout:  {"ok": false, "error": "usage: …"}
# expect exit code:  2
```

A `ERR_MODULE_NOT_FOUND` or `ERR_UNKNOWN_FILE_EXTENSION` here means Phase 2 has not landed, or
`lib/nina/avatarEmbedText.ts` acquired an import — D2's precondition, and the one thing about this
phase that can break from outside it.

Then the argument-shape checks, still offline:

```bash
node --experimental-strip-types --no-warnings scripts/search-analysis.mjs 'tete' 'Rm2N!'
# expect exit 2 — the fragment is outside the id alphabet, refused before any round trip
```

**Live check against the database** (READ-ONLY; this repo has one database and it is production):

The implementer **cannot fabricate an id** — `Rm2NG` in the requirement is the operator's own
truncation of a real row. Get one, then run three cases:

```bash
# 0. Take a real id + fragment from the live album (read-only, no embedding call):
node --env-file=.env.local -e "const {neon}=await import('@neondatabase/serverless');const s=neon(process.env.DATABASE_URL);console.table(await s\`select id, folder, filename, search_keywords, (description_embedding is not null) as embedded from nina_avatars order by created_at desc limit 5\`)"

# 1. The happy path — substitute a real 5-char PREFIX of one of those ids:
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/search-analysis.mjs 'tete' '#<first-5-chars>'

# 2. The ambiguity refusal — a 1-character fragment almost certainly names several rows:
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/search-analysis.mjs 'tete' a
# expect exit 4 and a `matches` array in the JSON

# 3. The not-found refusal — a 12-char fragment that is not an id:
node --experimental-strip-types --no-warnings --env-file=.env.local \
  scripts/search-analysis.mjs 'tete' zzzzzzzzzzzz
# expect exit 3
```

**Cross-check the rank against the app** — this is the check that proves the SQL was mirrored and not
merely written:

```bash
node --env-file=.env.local scripts/album-search-probe.mjs 'tete'
```

For a single-user database the probe's ranked list for `tete` and this script's `top` must agree on
the leading ids and on scores to 4 decimal places. They will NOT agree on tiebreak order for exactly
equal scores (the probe omits the `(created_at desc, id desc)` tiebreak — D4); anything else that
differs is a bug in the new SQL. If the database holds more than one `user_id` with embedded rows
(the probe's first line prints them), the counts legitimately differ: the probe ranks globally, this
script ranks within the target's owner.

**Manual check — the skill, end to end:** in a Claude Code session in this worktree, invoke
`/search-analysis tete #<first-5-chars>`. The run must:

1. call `scripts/search-analysis.mjs` with the raw `node --experimental-strip-types … --env-file` form;
2. produce a written inference naming the target's rank, score, `wouldAppearInApp`, and at least one
   named semantic comparison against the `top` rows;
3. **make no tool call that writes** — no Edit, no Write, no server action, no `UPDATE`. If it offers
   to apply a keyword suggestion, that is a SKILL.md failure, not a judgement call.

**Exit criteria:**

- `/search-analysis <query> #<fragment>` resolves a partial id by substring, refuses zero matches
  with exit 3 and refuses ambiguity with exit 4 (listing the candidates) — never guessing.
- For a resolved row the script prints one JSON document carrying: the target's `id`, `folder`,
  `filename`, full `description`, `searchKeywords`, `embeddedText`, `hasEmbedding`, its 1-indexed
  `rank` and `score` in the **unfiltered** ordering, `candidates` (rows with a non-null
  `description_embedding` for that owner), a `wouldAppearInApp` verdict with its `cutBy` reasons, and
  the top 10 competing rows.
- A row whose rank is past 48 or whose score is under 0.2 is REPORTED with that rank and score —
  demonstrating the script sees what `searchNinaAvatarsByText` structurally cannot return.
- `embeddedText` for a row with keywords is exactly
  `description + "\n\nKeywords: " + search_keywords`, produced by Phase 2's
  `buildNinaAvatarEmbedText` and not by a local copy.
- The skill's output is a written inference, and the session makes zero write calls.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` are green, and
  `git diff --stat` shows exactly three paths: the two new files and one line of `package.json`.

## Handoffs

- **Phase 2 — `package.json`.** Both phases append one line to the `scripts` block. If git reports a
  conflict there, the resolution is to keep both lines; neither depends on the other's position.
- **Phase 2 — the hard dependency.** This phase does not build until
  `lib/nina/avatarEmbedText.ts` exists and stays zero-import, and its live run needs the
  `search_keywords` migration applied. Nothing here can or should stub either.
- **Phase 1 — nothing.** Disjoint file sets; the viewer's `#<id> · <score>` header that makes this
  skill usable already shipped in `751e034` and neither phase changes it.
- **Not done here, deliberately.** The script does not tune `NINA_SEARCH_MIN_SCORE` and does not
  suggest a value for it (Invariant 3 and the index's Out of Scope) — it reports the two constants so
  a human can. It also does not cover image-query or combined (`searchNinaAvatarsByTextAndCaption`)
  searches: R3's requirement is `<text-query>`, and a caption-query diagnostic would need a vision
  call and a second set of arguments. If that is wanted, it is a new card, and the natural shape is a
  `--caption-image <path>` flag on this same script.
- **Noted, not fixed.** `scripts/album-search-probe.mjs` omits the `(created_at desc, id desc)`
  tiebreak that `rankByDistance` applies, so its ranks can differ from the app's for exactly-tied
  scores. Harmless for threshold tuning, which is all that file does. Left alone — touching it is a
  drive-by edit to a shipped instrument and belongs on its own card.
- **A hazard for whoever renumbers the search constants.** `NINA_SEARCH_LIMIT` and
  `NINA_SEARCH_MIN_SCORE` are mirrored in `scripts/search-analysis.mjs` and cannot be imported (they
  are module-private by design). A change to either in `lib/nina/queries/avatarsearch.ts` must move
  the mirror, or the script's `wouldAppearInApp` verdict goes quietly wrong. The script prints both
  values into its report so the drift is visible to a reader; there is no automated guard, and adding
  one (a `check-*` script grepping both files) is a reasonable follow-up card.

## Rollback

```bash
git rm -r .claude/skills/search-analysis
git rm scripts/search-analysis.mjs
# and revert the one `nina:search-analysis` line in package.json
```

Nothing imports either file, nothing tests them, and the script never wrote a byte to the database or
the blob store — so there is no data to undo and no other phase to unwind. Phase 2's
`lib/nina/avatarEmbedText.ts` keeps its other two consumers and stays exactly as it was.
