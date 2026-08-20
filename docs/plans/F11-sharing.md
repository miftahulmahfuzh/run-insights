# F11 — Sharing

> **Depends on:** F03 (schema, queries, ownership scoping), F08 (`/r/[id]` run detail — hero,
> charts, splits table — the embed point and the component tree this plan narrows for public
> use). **Consumes:** F02 (`requireUserId`, `proxy.ts`, INVARIANT A/B, `resolveHrMax`), F06
> (metrics), F07 (insights — session-scope narrative payload), F09 (badges — explicitly NOT
> consumed, see §3.8). **Owns:** the `shares` table's read/write surface, `/s/[token]`, the
> share button and link panel, revocation, and the tests.
> **Precedent:** `expense-tracking/docs/plans/F09-sharing.md` and its shipped implementation
> (`app/(bare)/s/[token]/`, `components/share/*`, `lib/share/*`, `app/actions/share.ts`,
> `tests/share.bundle.test.ts`). Followed closely; diverges wherever the stakes differ, and
> every divergence is argued, not asserted.

**A numbering note, so two plan files don't quietly disagree.** `ROADMAP_v0.1.0.md` §5 is
authoritative: **F09 = Badges, F10 = Badge art, F11 = Sharing** (this file). `F02-auth-profile.md`
was drafted before that table was final and refers to the share page as **"F09/F10"** in its
INVARIANT B and §6.1/§6.3 (e.g. *"`/s/[token]` (F10) must render..."*). Wherever F02 says F09 or
F10 in a sharing context, read **F11**. F02's INVARIANT B itself is not stale — it is binding on
this plan exactly as written, and §3.4 below is this plan's compliance proof.

---

## 0. What this feature is, in one paragraph

The runner finishes reviewing a run, taps **Share** on `/r/[id]`, and gets a link. They send it
to a training partner over WhatsApp. The partner — no account, never will have one — taps it and
sees the run: the metrics, the pace-and-heart-rate chart, the splits, the zone breakdown, the
coaching narrative's factual half, and the Apple Fitness screenshots the runner uploaded. They do
not see who the runner is beyond what WhatsApp already told them, they do not see the runner's
age or weight or resting heart rate, they do not see this run's spot in a training plan, and they
cannot reach any other run. Later the runner taps **Revoke**, and the page 404s within seconds.
**One divergence from that paragraph's tidy ending, stated up front rather than buried in §7: the
screenshots themselves do not fully die when the link does.** §3.4 is the reason this plan exists
in this much detail rather than as a straight port.

---

## 1. Why this is not a straight port of F09, in three numbers

| | expense-tracking F09 | run-insights F11 |
|---|---|---|
| What a leaked link exposes | six grocery-store line items and a rupiah total | **heart-rate data** (health information) plus, via the screenshots, **exact GPS-level location text, and an exact clock window the runner was outdoors** |
| Token | `nanoid(12)` — 2⁷² | `nanoid(16)` per roadmap §4.3 — **2⁹⁶**, ≈7.9×10²⁸ |
| Revoke mechanism | `DELETE FROM share_links` — hard delete, no history | `UPDATE shares SET revoked_at = now()` — **soft delete**, `UNIQUE (run_id) WHERE revoked_at IS NULL`, history retained |

The schema difference in row three is not cosmetic. F09's `share_links.group_id UNIQUE` means a
group has at most one token *ever*; re-sharing after revoke would need a second column or a
second table, which F09 didn't build because expense-tracking never asked for it. Run-insights'
`shares` table was designed with the partial index from day one (roadmap §4.3), which means
**re-sharing after revocation is a first-class, already-modeled operation**, and this plan's
get-or-create logic (§3.2) is the mechanism that uses it. It also means the roadmap's authors
already anticipated that a runner might revoke and re-share the same run more than once — treat
that as evidence for the UX in §5, not just a schema curiosity.

---

## 2. Preconditions

Preflight (Task 1) confirms every symbol below actually shipped, named as assumed, before any
code in this plan is written — per the convention `F02-auth-profile.md` and
`F05-review-correction.md` both set (their own Task 1 / §1).

| From | Symbol / artefact | Used for |
|---|---|---|
| F01 | `lib/env.ts` (`AUTH_URL`), `next.config.ts` | absolute share URLs, response headers |
| F02 | `requireUserId()` | ownership check in every server action |
| F02 | `proxy.ts` matcher (§2.1 of F02's plan) | **already excludes `/s/:token*`, annotated "INVARIANT B. Never add this."** Task 11 verifies this held, not that it's added. |
| F02 | INVARIANT B (`F02-auth-profile.md` §6.3) | **binding constraint**: `/s/[token]` must never call `resolveHrMax(userId)` live. §3.4 is this plan's answer. |
| F03 | `db`, `schema.shares`, `schema.runs`, `schema.runSplits`, `schema.runZones`, `schema.runPhotos` | all queries |
| F03 | an id-generation convention (`nanoid(12)` for most tables per roadmap; `shares.token` is `nanoid(16)`) | token minting — confirm whether F03 exposes a parameterised `newId(len)` or F11 needs its own `mintShareToken()` |
| F06 | nothing at render time — see §3.4 | the shared page computes **no** metrics live |
| F07 | `insights` table, session-scope payload (`scope='session'`, `scope_key=run.id`) | the narrative; **this plan requests one additive field from F07's payload shape, §9 delta 1** |
| F08 | `/r/[id]/page.tsx`, its pace/HR chart component, zone-bar component, splits-table component | embed point for the share control; **component tree to narrow for public reuse, §3.7** |
| F08 | route-group convention: `app/(app)/...` (confirmed live in `F05-review-correction.md` Task 4: `app/(app)/r/[id]/review/page.tsx`) | `/s` must sit **outside** `(app)`, in its own group |
| — | `lib/format.ts` equivalent (unit conventions, roadmap §4.2) | rendering distance/duration/pace consistently on the public page |

### 2.1 Assumptions about upstream naming

This plan writes Drizzle fields in camelCase (`runId`, `userId`, `occurredOn`, `distanceM`,
`avgPaceSec`, `blobUrl`, `sortOrder`, `revokedAt`, `createdAt`) mapping to the snake_case columns
in roadmap §4.3, matching the convention `F02-auth-profile.md` §4.2 already uses
(`birthYear`, `heightCm`, `restingHr`, `maxHr`, `onboardedAt`). Verify in Task 1; do not rename
columns to fix a mismatch — fix this plan's identifiers instead.

**Blocking findings to escalate rather than work around** (mirrors F09 Task 1's framing):

- `proxy.ts`'s matcher matches `/s` → this is a regression against F02's own INVARIANT B and
  must be fixed in `proxy.ts` before anything in this plan can work, full stop.
- F07's session-scope `insights.payload` has no HRmax figure or source label → §3.4 cannot ship
  a `%HRmax` number on the shared page until F07 adds it (delta 1, §9). The plan still ships:
  every other metric is unaffected, and §3.4 specifies the exact degrade.
- `run_photos` has no per-photo visibility flag → adopt this plan's schema delta (§9 delta 2) or
  fall back to all-or-nothing sharing per §3.3's documented fallback.

---

## 3. Design decisions

### 3.1 What a share includes

Per the author's own words: *"a single session can be shared. others can see the uploaded photos
and insights as well."* Concretely, for **one run**:

- every deterministic metric on that run: distance, duration, pace, cadence, HR avg/max, kcal,
  elevation, `intent`
- the pace + heart-rate dual-axis chart, the zone bar, the splits table — all derived from
  `run_splits` / `run_zones`, which (see §3.4) carry **no** profile dependency
- the narrative's descriptive half: `headline`, `verdict`, `whatHappened`, `observations[]`
- the uploaded Apple Fitness screenshots (`run_photos`), full resolution, in a lightbox — with
  per-photo control, not blanket inclusion (§3.3)

### 3.2 Token design, and the soft-delete revoke that F09 never had to build

`shares.token` is `nanoid(16)` (roadmap §4.3, already fixed — not this plan's decision to make).
64¹⁶ = 2⁹⁶ ≈ 7.9 × 10²⁸. Compare F09's already-adequate 2⁷²: this is **2²⁴ ≈ 16.8 million times**
larger a space, for the same "nobody is brute-forcing a bearer token" reason F09 argued at length
— the roadmap's authors picked a bigger number *because* the payload is health data, and that
argument does not need re-deriving here, only citing.

**Get-or-create, exactly like F09 §2.1, adapted for the partial-unique index:**

```ts
// app/actions/share.ts
async function selectLiveToken(runId: string): Promise<string | null> {
  const row = await db.query.shares.findFirst({
    columns: { token: true },
    where: and(eq(shares.runId, runId), isNull(shares.revokedAt)),
  })
  return row?.token ?? null
}

export async function createShareLink(runId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  await assertOwnsRun(userId, runId)               // SELECT id FROM runs WHERE id=$ AND user_id=$

  // 1. Fast path: a LIVE share already exists. No write. A second Share tap must return the
  //    SAME token — the link the runner already sent must keep working. Identical reasoning to
  //    F09 §2.1; the only schema difference is the predicate on revoked_at.
  const existing = await selectLiveToken(runId)
  if (existing) return { token: existing }

  // 2. Mint. ON CONFLICT DO NOTHING with NO target absorbs BOTH constraints in one path:
  //      shares_pkey                    -> a token collision (2^-96; will not happen)
  //      shares_run_id_live_unique_idx  -> a concurrent mint won (double-tap, two tabs) —
  //                                         NOTE this is a PARTIAL index (WHERE revoked_at IS
  //                                         NULL); Postgres's no-target DO NOTHING absorbs
  //                                         partial-unique violations the same as full ones,
  //                                         so this needs no special-casing versus F09's version.
  for (let attempt = 0; attempt < SHARE_MINT_ATTEMPTS; attempt++) {
    const token = mintShareToken()
    const inserted = await db
      .insert(shares)
      .values({ token, userId, runId })
      .onConflictDoNothing()
      .returning({ token: shares.token })

    if (inserted.length === 1) return { token: inserted[0]!.token }

    const raced = await selectLiveToken(runId)
    if (raced) return { token: raced }        // the partial index fired: someone else won
    // else the PK fired: a genuine token collision. Loop with a fresh token.
  }
  throw new Error('Could not create a share link. Try again.')
}
```

**Re-sharing after revocation is a plain second `INSERT`, not a special case.** Because the
unique index only covers rows `WHERE revoked_at IS NULL`, a revoked row does not block a new
live one for the same `run_id` — the insert above just succeeds with a fresh token, and the old
revoked row is left in place. **This is a real, free feature: `shares` becomes a share-history
log per run** (mint → revoke → re-mint → revoke...), queryable later for "you've shared this run
3 times, most recently 2 days ago" without any new column. This plan does not build that UI —
flagged as an easy v0.2 addition in Open Questions, §11.

**Revoke:**

```ts
export async function revokeShareLink(runId: string): Promise<void> {
  const userId = await requireUserId()
  await assertOwnsRun(userId, runId)
  await db
    .update(shares)
    .set({ revokedAt: new Date() })
    .where(and(eq(shares.runId, runId), isNull(shares.revokedAt)))
  // Idempotent: revoking a run with no live share updates zero rows, not an error.
}
```

**What a revoked link renders.** `getRunByShareToken(token)` filters `WHERE revoked_at IS NULL`
in the same query that filters by token — a revoked token and a token that never existed hit the
identical `WHERE token = $1 AND revoked_at IS NULL` predicate and produce the identical
zero-row result, which resolves to the identical neutral 404. **No special-casing is needed to
avoid the F09-style oracle risk** ("does this URL 404 because it never existed, or because it was
revoked?") — the anti-oracle property falls out of the query shape for free, which is actually
cleaner than F09, which had to argue this explicitly because its hard-delete meant "gone" and
"never existed" were only *accidentally* the same response, not structurally guaranteed by one
predicate.

### 3.3 What a share must never include — and the part that needs real thought

**The uncontroversial half first**, because it's the same reasoning F09 already worked out and
the stakes there don't change here: never the owner's email, `userId`, the raw `extractions`
audit trail (`blob_urls`, `raw_response`, `corrections`, `prompt_tokens`), never a route into any
other run, never a count or a "back to your runs" — the recipient must not learn that other
sessions exist. New to this app and worth stating once: never **badges, records, or PR
comparisons** for this run (F09/F10's territory) — "you just set a new 10K best" is a claim about
the runner's whole history, not this session, and it is out of this feature's stated scope (a
*single session* can be shared, per the author, not a runner's trophy case).

**The half that needs real thought: the screenshots leak things the structured data was
designed not to.**

Three Apple Fitness screenshots, per the canonical fixture (`ROADMAP_v0.1.0.md` §1): a summary
screen, a splits screen, a heart-rate screen. Baked into their *pixels*, not extracted into any
column this app controls:

| Leaks through the **image** | Leaks through the **structured data**, if shown |
|---|---|
| the free-text location string exactly as Apple rendered it (`Tangerang`) — same string as `runs.location`, but now unremovable from a photo the recipient can save | `runs.location` — one text field, easy to omit |
| the **exact** start and end clock time, printed on the summary screen | `runs.started_at` / `ended_at` — two `time` columns, easy to omit |
| the **continuous** heart-rate trace, far more granular than `run_zones`' five duration buckets | `runs.avg_hr` / `max_hr` — two integers; not equivalent information |
| the iOS **status bar**: carrier name, battery %, wifi network name, exact device clock (which may differ from the run's own timestamps by the seconds it took to open the app and screenshot) | nothing — this has no structured equivalent at all |
| **whatever else was on screen** — a notification banner (a text preview, a calendar reminder) if one fired at the moment of the screenshot | nothing — this is unpredictable free content, the same category of risk F09 flagged for its free-text `note` field, but here it can appear **without the runner typing anything or reviewing it** |

**The conclusion this table forces, stated plainly: once a screenshot is included, hiding the
matching structured fields is close to theater.** Omitting `runs.location` and
`started_at`/`ended_at` from the page's text does *nothing* if the very next screenshot on the
same page shows "Tangerang" and "05:12–06:31" in Apple's own type. This plan does it anyway
(§3.3.1) because it is cheap and it is the only real protection in the one scenario where it
still matters: **a runner who deselects every photo and shares metrics only.** In every other
scenario, the actual privacy lever is not the text fields — it's whether the photo ships at all.

**3.3.1 — Structured fields: omit location and exact time-of-day by default, cheaply, for the
metrics-only case.**

```ts
// lib/share/config.ts
export const SHARE_SHOWS_LOCATION = false      // runs.location — a text field, cheap to hide
export const SHARE_SHOWS_TIME_OF_DAY = false   // started_at / ended_at — same
export const SHARE_SHOWS_NOTE = false          // see below — deliberately the opposite of F09's default
```

`occurred_on` (the date, no time) is always shown — it's needed for "which run is this," and a
date alone is a much weaker location+time correlation signal than a date *plus* a five-minute
clock window.

**On the `note` field, a deliberate reversal of F09's default.** F09 shipped
`SHARE_SHOWS_NOTE = true` reasoning that the owner's own text, visible right above the Share
button, is an informed act of publishing. That reasoning still holds *procedurally* here — but
the content behind it does not: an expense note is "beli deterjen"; a run note is exactly the
kind of place a runner writes "knee's been off since Tuesday," "rough week, needed this,"
"skipped breakfast, bad idea" — health- and life-context disclosures the author never asked this
feature to publish. Same pattern F09 established (one boolean, reversible in one line), opposite
default, because the two apps' free-text fields are not equivalently risky.

**3.3.2 — Photos: per-photo inclusion, default all-included, and why "crop the status bar" is
not the answer.**

The task this plan was handed asks directly: per-photo toggle, or all-or-nothing? **Per-photo,
default all-included.** Reasoning:

- The author's stated requirement is that photos are shared. All-included-by-default honors that
  with zero extra taps for the common case.
- But §3.3's table shows the risk is genuinely per-photo, not per-run: the *splits* screenshot
  usually carries none of the location/time/status-bar risk the *summary* screenshot does, and a
  runner who's fine sharing two of three screenshots but not the one with a notification banner
  needs a lever finer than "share everything or share nothing."
- This needs one schema addition F03/F04 do not currently have a reason to add on their own:
  `run_photos.excluded_from_share boolean NOT NULL DEFAULT false` (§9 delta 2). The flag lives on
  the photo, not on a specific share event, so it survives revoke/re-share (§3.2) without any
  extra bookkeeping — "I don't want the summary screenshot going out" is a property of the photo,
  not of any one link.

**Cosmetic-only cropping of the iOS status bar, considered and demoted to "maybe later, and be
honest about what it buys."** Hiding the top ~50px of each screenshot with a CSS crop on the
`/s` page's rendering is cheap and would stop *casual on-page viewing* of the carrier name,
battery %, and device clock. It is explicitly **not a security control**: the full image bytes,
status bar included, are still exactly what the `<img>` tag's underlying URL serves — a `view
source`, `Save Image As`, or a Blob URL copied straight out of the DOM recovers everything the
crop hid. This plan does **not** build it for v0.1.0 (no image-processing step exists anywhere
in the pinned stack, per `ROADMAP_v0.1.0.md` §3, and adding one — even a client-side canvas crop
— is scope this feature wasn't asked for). It is named here, not built, so nobody re-derives "is
this worth doing" from scratch and nobody mistakes it for a fix to §3.4.

**The UI must say this plainly, at the moment of sharing** — not buried in a settings page:

> *Screenshots may show your exact location, the time you ran, or notifications that were on
> your screen. Review each one before sharing.*

### 3.4 Health data, and the sharpest issue in this feature

Heart rate is health data (`ROADMAP_v0.1.0.md` §9's own risk table already says so). The share
route is an unguessable-token public URL with no login, per D9. Four separate controls, none of
which substitutes for another:

**`noindex`, both ways, mirroring F09 Task 16 exactly — this part genuinely doesn't change with
the domain.** A response header (`X-Robots-Tag: noindex, nofollow, noarchive`) *and* a
`generateMetadata` `robots` block (`index: false, follow: false, nocache: true`), because the
header covers non-HTML responses and intermediary caches while the meta tag is what a crawler
that already fetched the page actually reads — belt and braces, same as F09 §2.8/Task 16.
`app/robots.ts` **allows** the fetch (so `facebookexternalhit` can still build the WhatsApp
preview, §3.6) and **disallows** every authenticated route, exactly F09's non-obvious
disallow-vs-noindex tradeoff (F09 §2.8's sidebar) — worth restating here because "just disallow
`/s` too, it's sensitive" is the wrong instinct twice over: it kills the preview card *and*
doesn't stop Google indexing a URL it learns about elsewhere without ever crawling it.

**No third-party analytics on this route — and no first-party analytics either, if the pathname
itself is the payload.** `ROADMAP_v0.1.0.md` §3 pins no analytics package into the stack at all;
if one is ever added (Vercel Web Analytics / Speed Insights are common `create-next-app`
defaults), it must exclude `/s/*`, and the reason is sharper than "generic third-party
tracking is bad practice": **the pathname *is* the bearer token.** `/s/V1StGXR8mN4qP2wZ` sent to
*any* analytics backend — including Vercel's own, which is not adversarial, not "third-party" in
the leak sense — puts a health-data-protecting secret into a second system's logs, dashboards,
and retention policy that this plan never reasoned about. Treat "don't log the full path of `/s`
requests anywhere" as a standing constraint on F01's eventual analytics choice, not a one-time
setup step.

**No LLM call at share-view time, of any kind.** The narrative was generated once, by F07,
authenticated, and cached in `insights.payload`. `/s/[token]` reads that stored JSON and nothing
else — it never calls `lib/llm/narrate.ts`, never re-sends the runner's metrics to z.ai, and
never touches `lib/metrics/hrMax.ts`. That last one is not a performance choice, it is **the
compliance mechanism for F02's INVARIANT B**:

> *"the shared page must render from already-computed, stored values... never by calling
> `resolveHrMax` at share-view time"* — `F02-auth-profile.md` §6.3.

Concretely: `runs.avg_hr` and `runs.max_hr` (this run's own recorded bpm numbers) are always
safe to show — they carry no profile dependency. The one figure that *does* depend on the
profile is **%HRmax**, because its denominator comes from `resolveHrMax(userId)`, which reads
`profiles.max_hr` / `birth_year`. This plan does not call that function, ever, from `/s`. Instead
it requires F07 to have frozen the number and its provenance into the session-scope insight
payload at generation time (authenticated, session-scoped, exactly where `resolveHrMax` is
already supposed to run per F02 §4.6's caller table) — **Contract delta 1, §9**. If that field is
absent (insight never generated, or generated before F07 adds it), the shared page **omits the
%HRmax figure entirely** — the same "degrade honestly, never substitute a default" rule F02 §4.6
already established for every other caller of the resolver. A stranger with a share link must
never be able to infer, even indirectly, whether the runner filled in their age or weight —
INVARIANT B's exact wording — and the only way to guarantee that from a route with no `userId`
is to never open a code path that could read `profiles` at all.

**The sharpest issue: Vercel Blob URLs are public, unguessable, and permanent — and they survive
revocation completely.** Say this as plainly as F09 said its version, and then say why it is
worse here:

> `run_photos.blob_url` points at `https://*.public.blob.vercel-storage.com/...`. That URL is
> not protected by the share token — it is its own bearer secret, minted once at upload and
> **never rotated, never expired, and never touched by `revokeShareLink`**. Revoking a share
> deletes nothing from Blob; it only makes `getRunByShareToken` return null, which 404s the
> *page*. Anyone who right-clicked "Copy Image Address" — or simply saved the image — during the
> window the link was live keeps working access to that exact photo **forever**, independent of
> whatever the runner believes "Revoke" just did.

F09 accepted this for photos of a dinner receipt and called it a residual risk. **This plan
takes a firmer position, because the photo is not a receipt — it is a screenshot that shows
where the runner was and when, continuously correlated with a heart-rate trace.** Two responses,
one shipped now and one explicitly deferred with its cost stated:

1. **Shipped in v0.1.0: identical to F09's mitigation, because it is the only one that fits the
   pinned stack (`ROADMAP_v0.1.0.md` §3 has no signed-URL or proxy layer, and D7 restricts Route
   Handlers to a fixed list that does not include a photo proxy).** Say the true thing, at the
   exact moment it matters — inside the revoke confirm, not in a settings page nobody reads:

   > *"Revoking kills the page. Anyone who already opened a photo may still have it — revoking
   > doesn't reach into their phone or their saved copy."*

2. **Not shipped, designed anyway, and flagged as a v0.2 candidate that requires reopening a
   locked decision (D7), not a straightforward add-on:** serve shared photos through a
   server-side proxy — `GET /s/[token]/photo/[photoId]` — that re-checks the token is live on
   *every image request*, fetches the Blob bytes server-side, and streams them with
   `Cache-Control: private, no-store`. The client `<img src>` would then point at our own origin,
   never at the permanent Blob URL, so **the page's DOM never hands out a link that outlives
   revoke**, and "Copy Image Address" during a live window yields a URL that itself 404s the
   instant the token is revoked (same anti-oracle 404 as the page, §3.2). This does **not**
   fix the fundamental problem — a viewer who screenshots or saves the *rendered* image during
   the live window still keeps the pixels forever, and nothing server-side can reach into that
   — but it closes the specific, easy, no-effort vector ("right-click, copy link, forward the
   link itself, forever") that direct blob URLs leave wide open. **This plan does not build it**:
   it is a genuine new Route Handler outside D7's fixed list ("Route Handlers only for
   `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]`, `/api/cron/*`"), it adds a Vercel
   function invocation and its cost/latency to every photo view (against the roadmap's own
   "reading app, not a dashboard" simplicity tenet), and amending a decision the roadmap marks
   **do not re-litigate** is not this plan's call to make unilaterally. It is written up in full
   here so the author can make that call with a real design in hand rather than from a bullet
   point — see Open Questions §11.1.

**Do not gloss this by rounding it down to "same as F09."** F09's residual photo risk was "a
forwarded photo of a dinner"; this one is "a forwarded photo that timestamps and geolocates a
person's whereabouts, next to their heart rate." The mitigation available in v0.1.0 is identical
in *mechanism* (say the truth, at the moment of the decision) and different in *stakes* — this
plan says so in the revoke copy itself, not only in this document.

### 3.5 The insight on a shared page — coaching advice about a body, in front of a stranger

`ROADMAP_v0.1.0.md` §5 fixes the narrative's output shape: `headline`, `verdict`,
`whatHappened`, `observations[]`, `doNext[]`, `questionForRunner`. The last two are excluded from
`/s/[token]` by default, and this needs its own reasoning, not just "less is safer":

- **`doNext[]` is direct, personal coaching advice** — *"Cap easy runs at Zone 2,"* *"Start 30–60
  s/km slower than goal pace."* On the authenticated `/r/[id]` page this reads as an app coaching
  its user. Rendered to a friend who receives a WhatsApp link, the identical sentence reads as
  *the runner's flaws, itemized, for an audience the runner did not choose the size of* — every
  recipient the link reaches (and per §7, that recipient set has no ceiling once forwarded) sees
  a specific, unflattering diagnosis of this person's training. That is a different act from
  showing them a pace chart.
- **`questionForRunner` is, definitionally, an unanswered private reflection** — *"Was this
  meant to be a tempo session, or did the effort just creep up?"* It exists (§5 of
  `IMPLEMENTATION_PLAN.md`) specifically because the data alone can't tell whether a hard run was
  intended, and the answer becomes `runs.intent`. Showing an **unresolved** version of that
  question to a third party publishes a piece of self-doubt the runner hasn't even processed
  themselves yet. There is no version of this that reads as anything but exposing.
- **`observations[]` stays**, deliberately, on the other side of this line — it is
  data-adjacent description (*"Cadence dropped 18 spm over the run, showing clear fatigue"*), not
  a directive about what the runner should change or an open question about their state of mind.
  It is closer to "what the chart already shows in words" than to advice.

```ts
// lib/share/config.ts
export const SHARE_SHOWS_COACHING_ADVICE = false   // doNext[] and questionForRunner
```

One flag for both fields (not two) — they are the same category of problem (advice/reflection
*about the runner*, not description *of the run*) and splitting them invites someone to flip one
without re-reading why the other exists.

### 3.6 OG tags for WhatsApp — and the gap between "on the page" and "on a lock screen"

This is where these links are actually sent, per D9's own rationale ("send it to a friend over
WhatsApp"). WhatsApp fetches the URL server-side and renders the card **inside the chat**: the
bubble, the recipient's chat-list snippet, their lock-screen notification, every member of a
group chat, every forward — exactly F09 §2.6's argument, restated here because it applies
unchanged.

**What's different here: even fields already decided as visible on the page itself (§3.1/§3.3)
should not all reach the preview card**, because the preview is shown *before* the click — before
the runner's one deliberate act of sending the link has any bearing on who's actually looking.
Concretely:

| On the `/s` page | In the `og:description` | Why |
|---|---|---|
| `headline` / `verdict` (e.g. *"An easy-distance run done way too hard"*) | **no** | this is the coaching narrative's most blunt line, verbatim, rendered on a lock screen before anyone chose to look |
| `avgHr`, `%HRmax` | **no** | health data on a notification banner is a strictly worse exposure than health data behind a tap |
| `location` (if shown at all, §3.3.1) | **no** | same reasoning as F09's total-not-in-preview, sharpened: a place name plus a date, unrequested, on a lock screen |
| distance + date | **yes** | this is what the runner is about to say out loud in the WhatsApp message anyway |

```
og:title       "10.67 km run"
og:description "20 August 2026"
```

Deliberately generic, deliberately boring — closer to a calendar-invite subject line than a
performance brag. **No dynamic per-run OG image**, for the identical reason as F09 §2.7: Meta
caches scraped preview images on its own CDN for days, independent of this app's revoke. A
per-run `opengraph-image.tsx` burning distance/pace/HR into a bitmap would survive
`revokeShareLink` in a place this app cannot reach — ship one static `public/og-default.png`
instead, and every link gets the same branded thumbnail.

### 3.7 Client-component boundary discipline — sharper here than in F09

F09's public page had no data-bearing Client Component: the photo lightbox is interactive but
its props (`id`, `blobUrl`, `width`, `height`) carry nothing sensitive. **This app's pace/HR chart
is Recharts, and Recharts requires `'use client'`.** That changes the risk shape: whatever object
crosses into that boundary is serialized into the page's RSC flight payload and shipped to the
browser **verbatim, whether it's rendered or not** — an unused key on a prop object is not
protected by the component simply choosing not to display it.

**Binding rule for every Client Component F08's chart tree contributes to `/s/[token]`:** it
receives only the narrow shape it needs — the chart gets `{ km, paceSec, hr }[]` from
`run_splits`, never the full `SharedRun` object; the zone bar gets `{ zone, durationSec, minBpm,
maxBpm }[]`; the lightbox gets the photo array. **None of them ever receives `insight`,
`profiles`, or the full row from `getRunByShareToken`.** This is the same principle F09's
`getGroupByShareToken` doc-comment establishes for the query layer (§3.9 below) — it just has
more places it can be violated here, because there are more Client Components in the tree.
Task 13 is an explicit audit against this rule, not an assumption that "it's a server component
so it's fine."

### 3.8 Scope: one run, nothing else — badges and records are out

Per the author's own wording ("a single session"), and consistent with F09's "no evidence other
groups exist" principle: the shared page shows no personal records this run set, no badges it
earned, no comparison to other runs, no week/month rollup context. F09 (badges) and F10 (badge
art) are **not** dependencies of this plan and their data must not leak in even as an aside
("this was your longest run this month!") — that claim references history outside the one
session the author said may be shared.

### 3.9 The query layer's one deliberately unscoped read

Mirrors F09's `getGroupByShareToken` exactly, adapted:

```ts
/**
 * ⚠️ THE ONLY QUERY IN THIS APPLICATION NOT SCOPED BY userId, AND THE ONLY ONE THAT MUST
 * NEVER CALL resolveHrMax(). ⚠️
 *
 * Authorisation is the token: nanoid(16), 2^96 (§3.2). There is no session on /s/[token] by
 * design (roadmap D9); this is the one public route.
 *
 * INVARIANT B (F02-auth-profile.md §6.3) is enforced HERE: this function reads `runs`,
 * `run_splits`, `run_zones`, `run_photos`, and the session-scope row of `insights` — never
 * `profiles`. If a future edit adds a join to `profiles` to "just grab the HRmax while we're
 * here," that edit is the bug this comment exists to prevent.
 *
 * The returned shape is a narrow SharedRun projection (lib/share/types.ts), not a raw row
 * union — see the exclude table in F11-sharing.md §5. Never spread a raw `runs` or `insights`
 * row into this return value; every field is named explicitly, so a new column added to
 * `runs` or a new key added to `insights.payload` is excluded BY DEFAULT until someone reads
 * this comment and decides otherwise.
 */
export const getRunByShareToken = cache(
  async (token: string): Promise<SharedRun | null> => {
    const share = await db.query.shares.findFirst({
      where: and(eq(shares.token, token), isNull(shares.revokedAt)),
    })
    if (!share) return null
    // ...load runs/run_splits/run_zones/run_photos/insights by share.runId, project narrowly...
  },
)
```

`cache()`-wrapped for the same reason as F09 §2.5 of its query task: `/s/[token]` calls this
from both `generateMetadata` and the page body, and without request-level memoisation that is
two round trips to Neon per pageview and per link-preview scrape.

---

## 4. ASCII wireframe

```
┌──────────────────────────────────────────────────┐
│  Run Insights                                     │  no nav, no sign-in, no avatar
├──────────────────────────────────────────────────┤
│  Outdoor Run                                      │
│  Thursday, 20 August 2026                         │  date only — no clock time, §3.3.1
│                                                    │
│  10.67 km      1:18:36      7'22"/km              │  hero metrics
│  173 bpm avg (93% · estimated)     646 kcal        │  %HRmax shown ONLY if F07 froze it, §3.4
│                                                    │
│  ── Pace & heart rate ─────────────────────────   │
│  ╭──────────────────────────────────────────╮    │
│  │  [ dual-axis line chart, pace inverted ]  │    │  narrow props only, §3.7
│  ╰──────────────────────────────────────────╯    │
│                                                    │
│  ── Heart-rate zones ──────────────────────────   │
│  [Z1][ Z2 ][      Z4      ][       Z5       ]     │
│                                                    │
│  ── Splits ─────────────────────────────────────  │
│   km   time    pace     hr    cadence             │
│    1   6:36    6'36"    154     172               │
│  ...                                              │
│   11*  4:48    7'09"    181     150   * partial   │
│                                                    │
│  ── What happened ──────────────────────────────  │
│  "An easy-distance run done way too hard —        │
│   93% of estimated HRmax"                         │
│  A 10.67 km run that started fast (6'36" km 1)    │
│  and steadily faded to 8'00" by km 10...          │
│    • Cadence dropped 18 spm, showing fatigue      │
│    • [more observations]                          │
│                                                    │
│  (no "do next" advice, no open question — §3.5)   │
│                                                    │
│  ── Screenshots (3) ────────────────────────────  │
│  [ photo ][ photo ][ photo ]                      │  read-only lightbox, no mutation surface
│  ⚠ Screenshots may show your exact location, the  │
│    time you ran, or notifications on your screen. │
│                                                    │
│  Shared via Run Insights                          │  the ONLY outbound link → /
└──────────────────────────────────────────────────┘
```

---

## 5. Include / exclude table

| Field / surface | Source | Shown on `/s`? | Config flag |
|---|---|---|---|
| `distanceM`, `durationSec`, `avgPaceSec`, `avgCadence`, `avgHr`, `maxHr`, `activeKcal`, `totalKcal`, `elevationM` | `runs` | **yes** | — |
| `occurredOn` (date only) | `runs` | **yes** | — |
| `startedAt` / `endedAt` (clock time) | `runs` | no by default | `SHARE_SHOWS_TIME_OF_DAY` |
| `location` | `runs` | no by default | `SHARE_SHOWS_LOCATION` |
| `intent` | `runs` | **yes** — low risk, adds context | — |
| `note` | `runs` | no by default (opposite of F09's default — see §3.3.1) | `SHARE_SHOWS_NOTE` |
| `run_splits` (full table, `partial` flagged) | `run_splits` | **yes** | — |
| `run_zones` | `run_zones` | **yes** | — |
| pace + HR chart, zone bar | derived from the above, client-side only | **yes** | — |
| `headline`, `verdict`, `whatHappened`, `observations[]` | `insights.payload` | **yes** | — |
| `doNext[]`, `questionForRunner` | `insights.payload` | **no** | `SHARE_SHOWS_COACHING_ADVICE` |
| `%HRmax` figure + its `source` label | **new** field on `insights.payload`, frozen by F07 (§9 delta 1) | yes, if present; omitted (not zero, not guessed) if absent | — |
| `run_photos` (screenshots) | `run_photos`, filtered by `excluded_from_share` (§9 delta 2) | **yes, per-photo, default all included** | per-row flag, not a global one |
| this run's badges / PRs | `badges`, `records` | **never** — out of scope, §3.8 | — |
| other runs, week/month rollups | — | **never** | — |
| `runId` visible in the DOM or URL | — | never — the token is the only identifier a stranger sees | — |
| `userId`, owner email, owner name | — | **never**, under any setting | — |
| `profiles.*` (age, height, weight, resting HR, measured max HR) | — | **never**, directly or via a live resolver call (INVARIANT B) | — |
| `extractions.*` (`blob_urls`, `raw_response`, `corrections`, `prompt_tokens`) | — | **never** | — |
| `reviewedAt`, `correctedAt`, `extractionId` | `runs` | **never** — provenance metadata, no product use here | — |

---

## 6. File manifest

**Created**

```
lib/share/config.ts                      constants — token length note, all SHARE_SHOWS_* flags
lib/share/origin.ts                      server-only absolute-origin resolver (AUTH_URL first)
lib/share/token.ts                       mintShareToken() IF F03 has no parameterised newId(len)
lib/share/types.ts                       SharedRun, SharedInsight, SharedPhoto — the narrow shapes
lib/share/copy.ts                        owner-side strings
lib/share/__tests__/config.test.ts       entropy, alphabet, shareUrl() shape
app/actions/share.ts                     createShareLink, revokeShareLink, setPhotoInclusion
components/share/ShareButton.tsx         header action — mint + navigator.share + clipboard
components/share/ShareLinkPanel.tsx      status row + revoke confirm, on /r/[id]'s body
components/share/PhotoInclusionList.tsx  per-photo checkboxes, §3.3.2 (only if delta 2 lands)
app/(public)/s/[token]/layout.tsx        minimal shell — no nav, no analytics, no session read
app/(public)/s/[token]/page.tsx          the public page + generateMetadata
app/(public)/s/[token]/not-found.tsx     neutral 404 — identical for unknown and revoked
app/(public)/s/[token]/copy.ts           public-page strings — imports NOTHING from the owner side
app/robots.ts                            allow /s (crawl), disallow every authenticated route
public/og-default.png                    static preview image, 1200×630
tests/share.bundle.test.ts               import-graph + projection-shape assertions, §10
```

**Modified**

```
lib/db/queries.ts        + getShareTokenForRun(userId, runId), getRunByShareToken(token) [cache()]
                          + F03 migration: run_photos.excludedFromShare boolean default false
next.config.ts            + headers() block for /s/:token
app/(app)/r/[id]/page.tsx embed <ShareButton/> + <ShareLinkPanel/> + <PhotoInclusionList/>
proxy.ts                  assertion only — confirm /s stays unmatched (F02 already excludes it)
```

---

## 7. Tasks

### Task 1 — Preflight

No code. Run the confirmations in §2/§2.1. Escalate rather than route around anything in the
"blocking findings" list.

### Task 2 — `lib/share/config.ts`, `origin.ts`, `types.ts`

Every constant from §3.3.1/§3.5/§3.6, each with the one-paragraph reason inline (mirror F09's
`lib/share/config.ts` doc-comment density — a constant with no reason invites a careless flip).
`origin.ts` ports F09's resolution order verbatim: `AUTH_URL` → `VERCEL_PROJECT_PRODUCTION_URL`
→ `localhost:$PORT`, never `window.location.origin` (same preview-deploy trap F09 §Open question
6 already solved). `types.ts` defines `SharedRun`/`SharedInsight`/`SharedPhoto` as explicit,
named-field types — no `Pick<typeof runs.$inferSelect, ...>` shortcut, because a `Pick` silently
widens the moment someone adds a field to the source list; an independent type has to be
hand-updated, which is the point.

**Verify:** `npx vitest run lib/share/__tests__/config.test.ts` — token-length/alphabet/shape
tests mirroring F09's `token.test.ts`, adjusted for 16 chars and 2⁹⁶.

### Task 3 — Commit

### Task 4 — Schema delta: `run_photos.excludedFromShare`

Hand this to F03 as a migration request (this plan does not own DDL, same division F02 §7 used
for its own index request): `ALTER TABLE run_photos ADD COLUMN excluded_from_share boolean NOT
NULL DEFAULT false`. If F03/F04 decline before F11's build window, fall back to all-or-nothing
sharing (drop `PhotoInclusionList.tsx`, share every non-excluded — i.e. every — photo) and note
the fallback was taken in this file's checklist (§12).

### Task 5 — `app/actions/share.ts`

`createShareLink`, `revokeShareLink` per §3.2. `setPhotoInclusion(photoId, included: boolean)`:
`requireUserId()`, verify the photo's run belongs to the caller (join `run_photos → runs` on
`user_id`), `UPDATE run_photos SET excluded_from_share = NOT $included WHERE id = $photoId`.
Ownership check happens **before** any write, identical discipline to `assertOwnsRun` — this is
the same "most important line in the file" argument F09 §2.1 made for its own ownership gate,
repeated here because a mutation surface is a mutation surface regardless of which table it
touches.

**Verify:**
```bash
npx tsc --noEmit
grep -c "requireUserId()" app/actions/share.ts        # expect: 3
grep -c "assertOwnsRun(userId" app/actions/share.ts    # expect: 4 (1 def + 3 calls)
```

### Task 6 — `lib/db/queries.ts`: `getShareTokenForRun`, `getRunByShareToken`

The first is `userId`-scoped, mirrors F09's `getShareTokenForGroup`. The second is §3.9's
projection — write the doc-comment from §3.9 verbatim above the function; it is load-bearing,
not decoration. Confirm the `cache()` wrap.

**Verify:** a unit test that constructs a fake row shaped like the canonical fixture
(`research/schema.mjs`'s `TRUTH`, run through the projection) and asserts the *keys present* on
the result — see §10's shape test, which this task's implementation must satisfy, not just its
own ad hoc check.

### Task 7 — Commit

### Task 8 — `components/share/ShareButton.tsx` + `ShareLinkPanel.tsx`

Port F09's `ShareButton.tsx`/`ShareLinkPanel.tsx` near-verbatim: pointerdown-warming, the
`AbortError`-is-silence rule, the clipboard-then-manual-input fallback chain, the revoke
inline-confirm with copy that states the consequence rather than a bare "Are you sure?" — none
of that reasoning is app-specific and re-deriving it here would just reproduce F09 §2.3/§2.4
with different variable names. **What does change:** the revoke confirm body must include the
blob-permanence sentence from §3.4 point 1 — this is the one place this app's confirm copy must
say something F09's never had to:

```
"Revoking kills the page. Anyone who already opened a photo may still have it — 
 revoking doesn't reach into their phone or their saved copy."
```

### Task 9 — `components/share/PhotoInclusionList.tsx` (if Task 4's delta landed)

One row per `run_photos` entry: thumbnail, filename-free label ("Screenshot 1 of 3"), a checkbox
bound to `!excludedFromShare`, calling `setPhotoInclusion` on toggle. Render the §3.3.2 warning
copy once, above the list, not per-row. Lives on `/r/[id]`, not inside `ShareLinkPanel` — it's
relevant whether or not a link currently exists (a runner can pre-exclude a photo before ever
sharing).

### Task 10 — Embed on `/r/[id]` (F08 integration)

Load `getShareTokenForRun` alongside F08's existing run-detail query (`Promise.all`, same pattern
as F09 Task 9). Place `PhotoInclusionList` near the photo section, `ShareButton` in the header
action slot if F08 ships one (mirror F09's header-vs-body split, Task 8/9 of that plan, if F08's
design has an equivalent single-action header), `ShareLinkPanel` in the body, above any
destructive action.

### Task 11 — Commit

### Task 12 — Coordinate with F02: confirm `/s` stays outside `proxy.ts`'s matcher

This is verification, not a new change — F02's `proxy.ts` §2.1 already lists
`NOT matched: /s/:token* — public share pages — INVARIANT B. Never add this.` Confirm it live:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/s/aaaaaaaaaaaaaaaa   # expect 404
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/r/aaaaaaaaaaaa        # expect 307
```

If the first line is a 307, `proxy.ts` regressed against its own documented invariant — fix
`proxy.ts`, do not add a workaround in this feature's routes.

### Task 13 — Route-group isolation + the Client Component audit (§3.7)

Move `/s/[token]` into its own group, `app/(public)/`, sitting beside `app/(app)/` (confirmed
live per F05 Task 4). No nav, no header menu, no analytics script, no session read anywhere in
the layout. Then, **for every Client Component the page's tree includes** (the pace/HR chart,
the zone bar if it's interactive, the photo lightbox): grep its prop types and confirm none of
them is `SharedRun`, `SharedInsight`, or any type containing `doNext`/`questionForRunner`/
`profiles`/`location`/`startedAt`. This is Task 17 of F09 done one layer deeper — F09 never
needed it because it had no data-bearing Client Component.

```bash
grep -rn "SharedRun\|SharedInsight" components/**/*.tsx | grep "'use client'" -B5
# manually confirm each hit takes a narrower prop type, not the full shape
```

### Task 14 — `app/(public)/s/[token]/page.tsx`, `layout.tsx`, `not-found.tsx`

`export const dynamic = 'force-dynamic'`, no `loading.tsx` (same soft-404 argument as F09
§2.8/Task 14 — a Suspense boundary over the token lookup would stream a 200 before `notFound()`
can run, and the status can no longer change afterward). Render per the wireframe (§4). The
%HRmax line renders **only if** `insight.hrMaxPct != null` — no fallback formula, no silent zero.

### Task 15 — `generateMetadata` per §3.6

Static `og:image`, minimal `og:description` (distance + date only, never the headline, never
HR, never location) — see §3.6's table for exactly which fields cross this specific boundary.

### Task 16 — `next.config.ts` headers + `app/robots.ts`

Identical shape to F09 Task 16: `Cache-Control: private, no-store, max-age=0, must-revalidate`,
`X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: strict-origin-when-cross-origin`
on `/s/:token`. `robots.ts` allows `/s`, disallows `/upload`, `/r/`, `/trends`, `/me`,
`/onboarding`.

### Task 17 — Prove the cache cannot serve a revoked link

Identical script to F09 Task 17: confirm the build lists `/s/[token]` as `ƒ` (dynamic), confirm
no `unstable_cache`/`'use cache'`/`generateStaticParams`/`revalidate > 0` anywhere under
`app/(public)/s/`, confirm `x-vercel-cache` never reports `HIT` in production, and confirm
revoke → three immediate `curl`s all return `404`.

### Task 18 — Commit and deploy

---

## 8. Manual QA script (condensed from F09's 22 steps — the deltas only; run F09's full script
structure otherwise: mint/idempotence, WhatsApp preview, signed-out render, revoke, desktop
fallback)

1. Seed the canonical fixture run (`research/`, 2026-08-20, Tangerang, 10.67 km) reviewed and
   committed. Confirm it has an insight generated and 3 photos attached.
2. On `/r/[id]`, uncheck the summary screenshot in the photo-inclusion list (leave the other
   two). Tap **Share**, send to yourself, note the token.
3. In an incognito window, open the token. **Pass:** exactly 2 photos render — the excluded one
   is absent from the lightbox, the grid, and the page source.
4. **Pass:** no "do next" section, no open question, anywhere on the page —
   `curl -s $URL | grep -icE "cap easy runs|zone 2|was this meant"` → `0`.
5. **Pass:** `curl -s $URL | grep -icE "tangerang|birth|weight|height|resting"` → `0` **while
   `SHARE_SHOWS_LOCATION` is false** — re-run with it flipped true and confirm the count becomes
   nonzero only for `tangerang`, never for the profile fields (those must never appear under any
   flag setting).
6. Revoke. Reload the incognito tab: 404 within seconds. **Then**, separately, paste the *direct
   Blob URL* of one of the two included photos (copied from network inspector before revoking) —
   **confirm it still 200s.** This is the expected, documented gap (§3.4) — the QA step exists to
   make sure nobody mistakes "the page 404s" for "the photos are gone," including future
   reviewers of this feature.
7. Re-share. **Pass:** a new token; the old token still 404s; the previously-excluded photo is
   still excluded (the flag lives on the photo, not the share event, §3.3.2).

---

## 9. Contract deltas

Two schema/behavioural additions, one payload addition. None changes an existing column type or
a fixed route; nothing in `ROADMAP_v0.1.0.md` §4 is contradicted.

1. **F07's session-scope `insights.payload` gains two keys: `hrMaxPct: number | null` and
   `hrMaxSource: 'measured' | 'observed' | 'estimated' | null`**, computed via `resolveHrMax()`
   at insight-generation time (authenticated, session-scoped — the one place F02 §4.6 already
   says this computation belongs) and frozen into the stored JSON. **This is what makes F02's
   INVARIANT B achievable at all for this route** — without it, `/s/[token]` has no way to show
   a %HRmax figure without violating INVARIANT B, and the honest fallback (§3.4) is simply to
   omit it. Additive to a `jsonb` column with no declared internal schema in the roadmap; no
   migration.
2. **`run_photos` gains `excludedFromShare boolean NOT NULL DEFAULT false`** (§3.3.2). Enables
   per-photo opt-out. If declined, this plan's documented fallback is all-or-nothing sharing with
   the same default (everything included) — see Task 4.
3. **`lib/db/queries.ts` gains `getShareTokenForRun(userId, runId)` and `getRunByShareToken(token)
   `** — additive query-layer symbols, same shape as F09's Contract delta 1, needed so `/r/[id]`
   knows whether a live share exists on first paint, and so the public route has its one
   deliberately-unscoped read (§3.9).
4. **`getRunByShareToken` must be `cache()`-wrapped** — behavioural, not a signature change; see
   F09's identical Contract delta 2 for the reasoning (one route reading twice per request).

**Not a delta, but stated because it modifies how a reader should weigh §3.4 point 2**: adopting
the photo-proxy design in that section would require reopening **D9** is fine (sharing's own
locked decision already anticipates revocation) but would add a Route Handler outside **D7**'s
fixed list — `"Route Handlers only for /api/extract, /api/upload, /api/auth/[...nextauth],
/api/cron/*"`. This plan does not propose amending D7; it surfaces the design so the author can
decide, which is different from quietly doing it.

---

## 10. Verification, including the bundle/shape test the brief asked for

**`tests/share.bundle.test.ts`** — mirrors `expense-tracking/tests/share.bundle.test.ts`'s
import-graph technique, plus a projection-shape test this app's richer payload needs that F09's
receipt-shaped data didn't:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importGraph, isClientModule, repoRoot } from './support/importGraph'
import { getRunByShareToken } from '@/lib/db/queries'
import { seedFixtureRun } from './support/fixtures'   // wraps research/schema.mjs's TRUTH

const PAGE = 'app/(public)/s/[token]/page.tsx'

describe('the public share route carries no mutation', () => {
  it('reaches no Server Action at all', () => {
    const actions = [...importGraph(PAGE)].filter((f) => f.startsWith('app/actions/'))
    expect(actions, `/s/[token] reaches ${actions.join(', ')}`).toEqual([])
  })

  it('never reaches lib/metrics/hrMax.ts — INVARIANT B, F02 §6.3', () => {
    // The single most important line in this test file. Any future edit that makes /s
    // "just quickly" resolve HRmax for a nicer number has broken F02's binding constraint.
    expect([...importGraph(PAGE)]).not.toContain('lib/metrics/hrMax.ts')
  })

  it('does not read the session', () => {
    expect([...importGraph(PAGE)].filter((f) => f.startsWith('lib/auth/'))).toEqual([])
  })

  it('never reaches the owner-side share components', () => {
    const graph = [...importGraph(PAGE)]
    expect(graph).not.toContain('components/share/ShareButton.tsx')
    expect(graph).not.toContain('components/share/ShareLinkPanel.tsx')
    expect(graph).not.toContain('components/share/PhotoInclusionList.tsx')
  })

  it('is force-dynamic with no loading boundary', () => {
    const src = readFileSync(resolve(repoRoot, PAGE), 'utf8')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(() => readFileSync(resolve(repoRoot, 'app/(public)/s/[token]/loading.tsx'))).toThrow()
  })
})

describe('the SharedRun projection never carries the excluded fields', () => {
  it('omits doNext, questionForRunner, profile fields, and every audit-trail column', async () => {
    const { token } = await seedFixtureRun({ withInsight: true, withPhotos: 3 })
    const shared = await getRunByShareToken(token)
    expect(shared).not.toBeNull()

    const json = JSON.stringify(shared)
    for (const forbidden of [
      'doNext', 'questionForRunner',
      'birthYear', 'heightCm', 'weightKg', 'restingHr',   // profiles.*, never present at all
      'userId', 'rawResponse', 'corrections', 'promptTokens', 'blobUrls',
      'reviewedAt', 'correctedAt', 'extractionId',
    ]) {
      expect(json, `"${forbidden}" leaked into the SharedRun projection`).not.toContain(forbidden)
    }
  })

  it('omits hrMaxPct when the insight never froze one — never a computed fallback', async () => {
    const { token } = await seedFixtureRun({ withInsight: false })
    const shared = await getRunByShareToken(token)
    expect(shared?.insight?.hrMaxPct ?? null).toBeNull()
  })

  it('respects per-photo exclusion', async () => {
    const { token, photoIds } = await seedFixtureRun({ withPhotos: 3, excludeFirst: true })
    const shared = await getRunByShareToken(token)
    expect(shared!.photos.map((p) => p.id)).not.toContain(photoIds[0])
    expect(shared!.photos).toHaveLength(2)
  })

  it('a revoked share resolves identically to an unknown token', async () => {
    const { token } = await seedFixtureRun({})
    await revokeShareLink(/* the run id */ '')
    expect(await getRunByShareToken(token)).toBeNull()
    expect(await getRunByShareToken('not-a-real-token-at-all')).toBeNull()
  })
})
```

**Other verification, itemized:**

- `lib/share/__tests__/config.test.ts` — token entropy/alphabet, `shareUrl()` shape (Task 2).
- `app/actions/__tests__/share.test.ts` — ownership-before-write, idempotent mint, the
  partial-index race disambiguation (concurrent-mint vs. PK-collision branches), idempotent
  revoke, `setPhotoInclusion` ownership check (Task 5).
- Manual QA script, §8.
- The cache-freshness proof, Task 17.
- `research/score.mjs` stays green throughout — this plan touches no extraction or metrics code,
  but the build gate still runs it, and a regression there is never this feature's to absorb
  silently.

---

## 11. Open questions for the author

1. **The photo-proxy design in §3.4 point 2 — build it, or accept the residual risk?** Written up
   in full because "no" is a real, defensible answer for v0.1.0 (matches the stack, respects D7),
   but it should be a decision made with the design in hand, not a default nobody chose.
2. **`SHARE_SHOWS_LOCATION` / `SHARE_SHOWS_TIME_OF_DAY` — worth exposing as a per-share toggle in
   the UI, not just a code constant?** Given §3.3's finding that these fields are close to
   theater once any photo ships, a UI toggle might overstate the protection it offers. Recommend:
   ship as code constants only, and let the metrics-only case (all photos excluded) be the actual
   answer to "I don't want to reveal where or when," not a checkbox that sits beside photos that
   already reveal it.
3. **Should a live share block deleting a run?** Not addressed above; mirrors F09's Open question
   7. A run delete should cascade the share row (same `ON DELETE CASCADE` pattern) and the page
   should 404 — correct, but silent. Worth a delete-confirm line once a live share exists.
4. **Share-history UI** (§3.2's "this is a real, free feature") — not built in v0.1.0, cheap to
   add later, no schema change required.
5. **Does F08's `/r/[id]` have a single-action header slot (like expense-tracking's design
   system), or does `ShareButton` need its own placement decision?** Confirm against F08's actual
   shipped layout in Task 1's preflight, not this plan's assumption.

---

## 12. Implementation checklist (fill in on landing)

```
Task 1   Preflight                                                          [ ]
Task 2   lib/share/config.ts, origin.ts, types.ts + tests                   [ ]
Task 4   run_photos.excludedFromShare — landed / fallback taken (circle one) [ ]
Task 5   app/actions/share.ts — createShareLink / revokeShareLink /
         setPhotoInclusion, ownership gate on all three                     [ ]
Task 6   getShareTokenForRun / getRunByShareToken, cache()-wrapped,
         doc-comment from §3.9 present verbatim                             [ ]
Task 8   ShareButton / ShareLinkPanel — AbortError silence verified,
         blob-permanence sentence present in revoke confirm copy            [ ]
Task 9   PhotoInclusionList (if Task 4 landed)                               [ ]
Task 12  proxy.ts /s exclusion reconfirmed live (F02 INVARIANT B intact)     [ ]
Task 13  Client Component prop audit — no full SharedRun/SharedInsight
         crosses a 'use client' boundary                                    [ ]
Task 14  /s/[token] force-dynamic, no loading.tsx, %HRmax omitted-not-
         guessed when absent                                                [ ]
Task 16  headers() + robots.ts — noindex both ways, /s allowed to fetch      [ ]
Task 17  next build shows ƒ /s/[token]; revoke → 404×3 with no warm-up       [ ]
Ship     tests/share.bundle.test.ts green, incl. the hrMax.ts import-graph
         assertion and the projection-shape tests                           [ ]
         Manual QA §8 run against the real fixture, on a real phone         [ ]
```
