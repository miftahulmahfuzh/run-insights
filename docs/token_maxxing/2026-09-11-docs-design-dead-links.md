# Token-Maxxing Session — 2026-09-11: Docs-Design Dead-Link Repair

## 🎯 Achievement / End Result
- **Goal of the burn:** Stop `docs/design/DESIGN_INTEGRATION.md` from dangling. The doc —
  already carrying a "superseded on the aesthetics by the v2 revamp" banner — repeatedly cited
  `RECONCILIATION_v0.1.0.md` and `ROADMAP_v0.1.0.md` as the authority for its R-29 through R-46
  rulings, and both files were confirmed absent from the tree. A doc marked superseded that
  still offered live dead links read as *more* current than it is: every citation invited a
  click through to nothing. The assigned idea offered two exits — trim the doc to a short
  historical pointer if its content was captured elsewhere, or otherwise remove/rewrite the
  dead cross-references — scoped strictly to `docs/design/`, no code touched.
- **Concrete changes:**
  - `docs/design/DESIGN_INTEGRATION.md` — a new "Where the retired citations point" block right
    after the intro, with the exact git-history retrieval commands (`git show
    204fd34^:RECONCILIATION_v0.1.0.md` / `git show 204fd34^:ROADMAP_v0.1.0.md`), an explanation
    of the shared R-1–R-46 numbering across the two retired documents, and current-state /
    narrative pointers (`docs/architecture.md`, `CHANGELOG.md`); the superseded banner's
    "current" claim re-pointed from the deleted record at the live token sheet plus the shipped
    components that carry R-41–R-46 in their header comments; Roadmap §4.6 re-pointed at
    `lib/badges/{catalog,meta,rules}.ts` and §4.7 at `.claude/skills/generate-badge/style.md`;
    "Still open" items 2–3 closed with the doc's own strikethrough pattern.
  - `docs/design/tokens.css` — its header comment (a *live* file inside the scope directory)
    also cited the dead record by name; comment-only rewrite to the same git-history retrieval.
    No token values touched.
  - Single commit `01b384b`: 2 files changed, +48/−18.
- **Real value delivered:**
  - **Seven rulings kept from being orphaned.** The deciding discovery: the retired record's
    own Part IV states that "Rulings R-29…R-35 live in" the pull doc — i.e.
    `DESIGN_INTEGRATION.md` is the *canonical* home of R-29–R-35, while the record holds
    R-1–R-28 and R-36–R-46 (39 rulings). Together the two documents hold the complete R-1–R-46
    set. Trimming to a stub would have orphaned seven rulings with no other home; the
    "rewrite the dead cross-references" branch of the idea was therefore the only correct one,
    and the doc keeps its full record text.
  - Every `R-nn` and "Roadmap §" citation in the doc now resolves: either to the one-command
    git-history copy of the retired files, or to the live code that carries the ruling
    (`ExtractingSkeleton` R-41, `BadgeShelf`/`BadgeDialog` R-42–R-44, `ProvenanceMark`/
    `SplitsTable` R-45, `HonestyChip` R-46, `lib/badges/catalog.ts` for the 22-key contract).
    All 17 backticked repo paths cited were checked and resolve.
  - The house convention for retired records — established by the retirement commit itself in
    `CHANGELOG.md` ("R-nn codes resolve to the git-history copy") — is now applied uniformly
    across `docs/design/` instead of being missed there.
  - Two stale "Still open" items are no longer presented as open: R-31's region maps were
    closed by R-45 (`lib/photos/regions.ts` was never authored — provenance went by section
    instead), and the "currently empty" GitHub association is long since pushed (v1.0.0
    shipped 2026-09-11).
  - `docs/design/` swept clean: grep confirms no bare retired-file citation remains anywhere
    in the directory — every remaining mention of the two filenames sits inside the
    retrieval-note framing that explains where they went.
- **Branch:** `token-maxxing-2026-09-11-docs-design-dead-links`
- **Merge status:** merged (commit `20d92f1`)
- **Approx token burn:** modest — a docs-only worker session (two comment/pointer files, no
  test or build gates beyond prettier and a path-resolution sweep); a fraction of a full
  fanned-out build session. 🔥

## Context & Motivation
By the time this session ran, 2026-09-11 had already produced eleven token-maxxing session
docs — an arc from standing up component testing from zero (`nina-chat-component-tests`)
through the admin/nina/ui sweeps, the first runtime execution of the admin security boundary
(`lib-admin-action-tests`), the `architecture-reference` synthesis of all 36 plan docs into
`docs/architecture.md`, and the closing photoReference false-positive fix. The coordinator
(`tokenmax-orch-2026-09-11`) was fanning worker sessions out over the remaining idea menu and
assigned this one: the dead-citation repair in `docs/design/`.

The problem's shape made it a good small burn. `RECONCILIATION_v0.1.0.md` and
`ROADMAP_v0.1.0.md` had been *deliberately* retired the day before (2026-09-10, commit
`204fd34`, "docs: retire the v0.1.0 contract trio — roadmap, feasibility record,
reconciliation"), on the reasoning that the shipped code and `CHANGELOG.md` are the record
now. That retirement commit updated `README.md`, `research/README` and `CHANGELOG.md` — but
**missed `docs/design/`**, which continued citing both files as if they still existed. And the
retirement itself had already established the house convention for this exact situation
(`CHANGELOG.md` lines 7–9: R-nn codes resolve to the git-history copy of the retired record).
So this was not a judgement call about *whether* the citations were wrong — the repo had
already ruled — only about *which* repair branch of the assigned idea applied: stub the doc,
or re-point its references.

## What We Did (blow-by-blow)
1. **Investigated the retirement before choosing a repair branch.** Confirmed both cited files
   were absent from the tree and located the commit that removed them (`204fd34`, 2026-09-10),
   then checked what that commit had updated: `README.md`, `research/README`, `CHANGELOG.md` —
   and nothing under `docs/design/`. Also found the convention it established:
   `CHANGELOG.md:7-9` resolves R-nn codes to the git-history copy of the retired record
   (`git show 204fd34^:…`). This immediately suggested the fix shape: point at history, don't
   invent a new convention.
2. **Found the fact that decided the idea's fork.** Before choosing between "trim to a stub"
   and "rewrite the references", the session checked whether the doc's content was captured
   elsewhere — and found the opposite. The retired record's own Part IV states that "Rulings
   R-29…R-35 live in" the pull doc. In other words `DESIGN_INTEGRATION.md` is not a redundant
   restatement of the record: it is the **canonical home of rulings R-29–R-35**. The record
   holds R-1–R-28, then R-36–R-46 — 39 rulings — and explicitly delegates the middle seven to
   this document. Between them the two files hold the complete R-1–R-46 set. A trim-to-stub
   would have orphaned seven rulings; the "remove/rewrite the dead cross-references" branch
   was chosen, and the doc keeps its full ruling text.
3. **Edited `docs/design/DESIGN_INTEGRATION.md`:**
   - Added a **"Where the retired citations point"** blockquote immediately after the intro,
     with the exact retrieval commands, the shared-numbering explanation (record ran R-1–R-28,
     the pull continued at R-29, the record's Part IV picked the sequence up at R-36 and
     delegates R-29–R-35 *here*), and the authority pointers: `docs/architecture.md` for
     current state, `CHANGELOG.md` for the narrative record.
   - Re-pointed the **superseded banner**: its old "current" line read "`docs/design/tokens.css`
     and `RECONCILIATION_v0.1.0.md` **R-41 – R-46** are current" — half of which was a dead
     file. The new line names the live token sheet (mirrored into `app/globals.css`) as the
     current token authority, states R-41–R-46 stand with their full text in the git-history
     copy, and lists the shipped components that carry each ruling in its header comment:
     `ExtractingSkeleton` (R-41), `BadgeShelf`/`BadgeDialog` (R-42–R-44), `ProvenanceMark`/
     `SplitsTable` (R-45), `HonestyChip` (R-46).
   - Re-pointed the **Roadmap section citations**: §4.6 (badge catalog) now names the live
     catalog `lib/badges/catalog.ts` (thresholds in `lib/badges/rules.ts`, conditions in
     `lib/badges/meta.ts`); §4.7 (badge-art boundary) now names
     `.claude/skills/generate-badge/style.md` — the file F10's tools actually parse.
   - Tense-corrected the two remaining in-body citations (R-32's and R-34's "Roadmap §4.6/4.7
     defines/requires" → "defined/required … now lives in …") so the prose reads correctly
     against a retired document.
   - Closed **"Still open" items 2–3** with the doc's own strikethrough pattern (already used
     by item 1): R-31's region maps are **closed by R-45** — provenance is by section, the
     whole source screenshot pinned and zoomable, and `lib/photos/regions.ts` was never
     authored (`components/runs/ProvenanceMark.tsx` is the shipped form); the "currently
     empty" GitHub association is **stale** — the repo was pushed long ago and is live
     (v1.0.0 shipped 2026-09-11).
4. **Rewrote `docs/design/tokens.css`'s header comment.** The scope was strictly
   `docs/design/`, and this live file inside it cited the deleted record in its header
   comment ("See RECONCILIATION_v0.1.0.md R-41 - R-46 for what that cost"). Rewrote the
   comment to the same git-history retrieval convention. Comment-only: no token value was
   touched, so the mirror-into-`app/globals.css` contract is unaffected.
5. **Verified before committing.** `prettier --check` passes on both files. Every backticked
   repo path cited in the rewritten doc was checked and resolves — 17/17. A grep sweep of
   `docs/design/` confirms no bare retired-file citation remains: every mention of the two
   filenames now sits inside the retrieval-note framing.
6. **Committed locally on the branch** as `01b384b` — "docs(design): re-point retired
   RECONCILIATION/ROADMAP citations at git history", 2 files changed, +48/−18. Tree clean
   after the commit. Not pushed; merge left to the coordinator per the worker contract.
7. **Recorded the out-of-scope discoveries as follow-ups** rather than expanding the diff
   (see Follow-ups): the same dead citations exist outside `docs/design/` in
   `docs/design-brief.md`, `docs/architecture.md` carries two stale claims about the retired
   record, and the generate-badge style contract — which is *parsed by tools* — cites Roadmap
   §4.7, so fixing it needs more care than a docs-only session should spend.

## Code / Design Details

**The new retrieval note** — the core of the fix, placed right after the intro so a reader
hits it before any citation:

> **Where the retired citations point.** `RECONCILIATION_v0.1.0.md` and `ROADMAP_v0.1.0.md` no
> longer sit in the tree — they were retired on 2026-09-10 (commit `204fd34`, "retire the v0.1.0
> contract trio"), on the reasoning that the shipped code and `CHANGELOG.md` are the record now.
> Both files' final text is one command away:
>
> ```bash
> git show 204fd34^:RECONCILIATION_v0.1.0.md   # the arbitration record: R-1 – R-28, then R-36 – R-46
> git show 204fd34^:ROADMAP_v0.1.0.md          # the roadmap; this doc cites §4.6 (badge catalog), §4.7 (badge art)
> ```
>
> The ruling numbering is shared across the two documents. The record ran R-1 – R-28; this pull
> continued it at R-29; the record's Part IV then picked the sequence up again at R-36 and states
> that R-29 – R-35 live *here*. Between them the two files hold the complete R-1 – R-46 set — so
> every `R-nn` and "Roadmap §" citation below resolves in that history, not to a missing file.
> Current-state authority: `docs/architecture.md`. Narrative record: `CHANGELOG.md`.

**The banner's "current" line, before and after** — replacing a dead file with the live
carriers of the rulings:

```markdown
<!-- before -->
> `docs/design/tokens.css` and `RECONCILIATION_v0.1.0.md` **R-41 – R-46** are current.

<!-- after -->
> `docs/design/tokens.css` — mirrored into `app/globals.css` — is the current token sheet, and
> rulings **R-41 – R-46** stand. Their full text is in the git-history copy of the record
> (retrieval above); the shipped components also carry each one in its header comment:
> `ExtractingSkeleton` (R-41), `BadgeShelf` / `BadgeDialog` (R-42 – R-44), `ProvenanceMark` /
> `SplitsTable` (R-45), `HonestyChip` (R-46).
```

**The "Still open" closures** — items 2–3 struck through in the doc's own established
pattern (item 1 was already struck), each with the ruling or fact that closed it:

```markdown
2. ~~**R-31's region maps** need hand-authoring against the three fixture screenshots once F04
   starts.~~ — **closed by R-45**: provenance is by section, with the whole source screenshot
   pinned and zoomable; no rects were ever authored (`components/runs/ProvenanceMark.tsx`).
3. ~~The GitHub association in the project points at `miftahulmahfuzh/run-insights`, currently
   empty. First push will let the design project map screens to files.~~ — **stale**: the repo
   was pushed long ago and is live (v1.0.0 shipped 2026-09-11).
```

**`tokens.css` header comment, before and after** — comment-only, zero token values:

```css
/* before
 * v2 replaced v1 wholesale — warm cream + Georgia + system-mono + no-shadows became sky blue +
 * white cards + Poppins-only + soft shadows. See RECONCILIATION_v0.1.0.md R-41 - R-46 for what
 * that cost, and docs/design/DESIGN_INTEGRATION.md for the v1 record.
 */

/* after
 * v2 replaced v1 wholesale — warm cream + Georgia + system-mono + no-shadows became sky blue +
 * white cards + Poppins-only + soft shadows. Rulings R-41 - R-46 covered what that cost; their
 * full text is in git history (git show 204fd34^:RECONCILIATION_v0.1.0.md), and
 * docs/design/DESIGN_INTEGRATION.md holds the v1 record.
 */
```

**The ruling geography this fix had to respect** (the fact that killed the stub option):

| Rulings | Canonical home |
|---|---|
| R-1 – R-28 | `RECONCILIATION_v0.1.0.md` (retired; git history via `204fd34^`) |
| **R-29 – R-35** | **`docs/design/DESIGN_INTEGRATION.md`** — the record's Part IV delegates them here |
| R-36 – R-46 | `RECONCILIATION_v0.1.0.md` (retired; git history via `204fd34^`); R-41–R-46 additionally carried in shipped components' header comments |

## Decisions & Trade-offs
- **Rewrite the references rather than trim the doc — decided by evidence, not preference.**
  The assigned idea presented both branches as acceptable and left the choice to inspection.
  The stub branch rested on a premise ("content captured elsewhere") that the investigation
  *falsified*: the retired record explicitly delegates R-29–R-35 to this document, so no other
  file holds those seven rulings. Trimming would have destroyed the only canonical copy of a
  third of the numbering. The reference-rewrite branch preserves every ruling while giving
  each citation a working resolution path.
- **Follow the retirement commit's own convention instead of inventing one.** `CHANGELOG.md`
  had already established, one day earlier, that R-nn codes resolve to the git-history copy of
  the retired record. Reusing exactly that mechanism (`git show 204fd34^:<file>`) means the
  whole repo now answers "where did the v0.1.0 contract trio go?" in one voice.
- **Keep the doc's full ruling text; change only the pointers.** Even where a ruling's
  *subject* has moved (catalog → `lib/badges/catalog.ts`, art boundary → the generate-badge
  style contract), the doc records the *history* of those rulings, and history does not move.
  The in-body edits are tense corrections and parenthetical live-location notes, not
  re-adjudications.
- **`tokens.css` was in scope and got the comment fix; code comments elsewhere did not.** The
  scope boundary was `docs/design/` — a live file inside it citing a dead record is drift and
  got repaired. Components' header comments citing the retired files by name were explicitly
  accepted by the retirement commit ("by design, not drift") and were left alone — touching
  them would have violated the no-code constraint and contradicted an existing decision.
- **Close stale "Still open" items rather than annotate them.** The doc had a strikethrough
  idiom already (item 1: "closed, navy (R-36)"); extending it to items 2–3 keeps the section's
  semantics uniform — struck = resolved, with the closing authority named — instead of adding
  a third state like "(stale)" that a future reader would have to interpret.
- **Stay strictly in scope; record the rest.** Four adjacent defects were found and documented
  as follow-ups instead of being fixed inline — most importantly the generate-badge style
  contract, where a careless edit would change what `tools/gen_badge_art.py` parses. A
  docs-only worker session widening into a tool-parsed file is exactly the scope creep the
  coordinator's constraint existed to prevent.

## Follow-ups & YAGNI notes
Discovered during this session, deliberately **not** fixed (out of the strictly-`docs/design/`
scope), all verified against the current tree:
- **`docs/design-brief.md:4`** also cites the retired duo ("`ROADMAP_v0.1.0.md` and
  `RECONCILIATION_v0.1.0.md` landed.") — same defect, outside `docs/design/`. The same
  git-history retrieval convention applies directly if a future session picks it up.
- **`docs/architecture.md:36`** describes the retired record as "39 rulings, R-1..R-45" — the
  count is right but the range is stale (the record ends at **R-46**; R-45 is its second-to-last).
  And **`architecture.md:356`**, the documentation map, says "§15 is the reconciliation" — but
  `architecture.md` ends at §14; no §15 exists. Both are one-line fixes in the file this same
  day's `architecture-reference` session created.
- **`.claude/skills/generate-badge/style.md:619-626`** cites "Roadmap §4.7" and R-36/R-43 as
  authority for the style block's seven axes. That file is **parsed by tools**
  (`tools/gen_badge_art.py`), so fixing it is not a docs edit — the parseable text must stay
  stable while the citation gets a history pointer. Needs its own careful session.
- **Code comments citing the retired files by name** (several components carry them, e.g. the
  R-41–R-46 headers listed in the banner) were explicitly accepted by the retirement commit —
  by design, not drift. Listed here only so a future reader doesn't re-flag them; nothing to do.
- **YAGNI:** did not add an automated check for dead backticked-path citations across `docs/`
  (a script would have caught this class of drift at the retirement commit). For a repo this
  size, the manual 17/17 path sweep was enough; a checker is worth it only if dead-link drift
  recurs.

## Appendix

**Commit:**
```
01b384b docs(design): re-point retired RECONCILIATION/ROADMAP citations at git history
```
Key lines from the full commit message:
```
The 204fd34 retirement of the v0.1.0 contract trio updated README, research/README
and CHANGELOG but missed docs/design/. Every citation there named a file that no
longer exists.
...
R-29-R-35 exist only in this document - the retired record's Part IV delegates
them here - so the doc keeps its full record text; only the pointers changed.
```

**Files touched:**
```
docs/design/DESIGN_INTEGRATION.md | 60 ++++++++++++++++++++++++++++-----------
docs/design/tokens.css            |  6 ++--
2 files changed, 48 insertions(+), 18 deletions(-)
```

**Verification commands run:** `prettier --check` on both changed files (clean); a manual
resolution sweep of every backticked repo path cited in the rewritten doc (17/17 resolve);
`grep -rn 'RECONCILIATION_v0.1.0\|ROADMAP_v0.1.0' docs/design/` confirming every remaining
mention sits inside the retrieval-note framing; `git status` clean after commit.

**References:**
- Retirement commit: `204fd34` — "docs: retire the v0.1.0 contract trio — roadmap, feasibility
  record, reconciliation" (2026-09-10); its `CHANGELOG.md:7-9` note establishes the
  git-history retrieval convention this session applied.
- Retired files' final text: `git show 204fd34^:RECONCILIATION_v0.1.0.md` /
  `git show 204fd34^:ROADMAP_v0.1.0.md`.
- Same-day sibling docs: `docs/token_maxxing/2026-09-11-architecture-reference.md` (created
  the `docs/architecture.md` that now serves as current-state authority — and that carries
  two of the follow-up defects above), `docs/token_maxxing/2026-09-11-admin-photoreference-
  false-positive-fix.md` and the rest of the 2026-09-11 index in `docs/token_maxxing/README.md`.
- Coordinator: `tokenmax-orch-2026-09-11` (owns the merge of branch
  `token-maxxing-2026-09-11-docs-design-dead-links`).
