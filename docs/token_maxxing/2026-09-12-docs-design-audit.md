# Token-Maxxing Session — 2026-09-12: Docs-Design Staleness Audit & Compaction

## 🎯 Achievement / End Result
- **Goal of the burn:** Audit the repo's three design-authority documents —
  `docs/design/DESIGN_INTEGRATION.md`, `docs/design-brief.md` and `docs/design/tokens.css` — for
  **content staleness and duplication**, and compact them. This continues yesterday's
  `docs-design-dead-links` session, which fixed only the *broken links* (the retired
  `RECONCILIATION_v0.1.0.md`/`ROADMAP_v0.1.0.md` citations) and explicitly left *content
  staleness* untouched. The assigned idea's framing: these three docs are read by anyone doing
  frontend/design work in this repo, so every token value and integration note in them should
  still match `components/ui` and the rest of the tree, and anything obsolete should go.
- **Concrete changes:** one commit, `580863d` — "docs(design): audit the three design docs
  against the tree; fix staleness, compact" — 3 files changed, **+39/−30**:
  - `docs/design-brief.md` (+10/−4) — retired-record citation replaced with the git-history
    retrieval; the `list_projects` re-pull trap annotated; a shipped-deltas landing paragraph
    added (five-tab bar, eleventh record, the Nina surface, the current screen map).
  - `docs/design/DESIGN_INTEGRATION.md` (+16/−15) — R-32's threshold location corrected to
    post-R-42 reality; the 4-tab-bar and `--miss` claims given live-status notes; the
    "Still open" heading retitled to stop lying; the 13-line v1 "direction" paragraph and the
    twice-glossing "New with v2" paragraph compacted.
  - `docs/design/tokens.css` (+13/−11) — comment-only: "Thresholds are fixed" rewritten to the
    fixture-print reality, the radii naming wrinkle documented, the v1→v2 header narrative
    condensed with the retrieval command kept. **Zero token values touched** — the
    mirror-into-`app/globals.css` contract is unaffected.
- **Real value delivered:**
  - **A verified-clean negative result is half the deliverable.** Every checkable claim in the
    three docs was tested against the tree before any edit, and most of them *held*: the
    tokens.css → `app/globals.css` mirror is intact for all **25 tokens in both schemes**
    (light and dark) — 21 by identical name, the 4 radii by identical value under `--radius-*`
    literal names; Poppins 500/600/700 via `next/font` in `app/layout.tsx`; no theme toggle
    (system-driven, exactly as the tokens doc claims); the **22-key** badge catalog intact with
    all **17** of the brief's sample badge titles live; the brief's v2 comparison table (sky
    `#c9e9fb`, cyan `#23beeb`, radii 8/14/22, zones `#38c3ee`→`#ff5e5b`) matching the tokens;
    number formats matching `lib/format.ts`; and DESIGN_INTEGRATION's claim that the canvas
    project never appears in DesignSync `list_projects` (`PROJECT_TYPE_PROJECT` is filtered)
    confirmed correct. A future reader now knows the mirror *holds*, not just that someone
    once hoped it did.
  - **Nine stale claims fixed** (detailed in What We Did): the last bare citation of the
    retired contract duo (yesterday's recorded follow-up, now closed); a re-pull instruction
    that sent readers through an API that can never return the existing canvas; a "Thresholds
    are fixed" comment contradicted by `lib/charts/zones.ts`; R-32's threshold location
    (superseded by R-42); the four-tab bar that ships as five (Nina joined at v1.0.0); the ten
    records that ship as eleven (`earliest_start`); `--miss` described as unused when it is now
    the zone-fallback colour; a "Still open" heading holding only struck-through closed items;
    and a landing note that now tells design-prompt readers what has moved since v2 shipped.
  - **Three duplications compacted** — DESIGN_INTEGRATION's v1 "direction" paragraph restated
    palette/type/zones that R-34/R-35 carry in full (cut to the rationale plus a pointer); its
    "New with v2" paragraph glossed R-44/R-45 twice over (trimmed to R-41, the only gloss not
    stated elsewhere); tokens.css's header narrative condensed. Net +39/−30: density up, three
    new truths added, duplicated narrative out.
  - **A hard cross-reference constraint was discovered and honoured.** The sweep of everything
    citing the three docs surfaced that `components/admin/DialSlider.tsx:64` cites
    **`docs/design-brief.md:175` by line number** (the "44 × 44pt tap targets" line). Both
    brief edits above that line were therefore made **line-count-neutral** (2→2 and 3→3
    lines), so the code comment's citation stays true after the commit.
  - **The audit's own harness bug became documentation.** A naive name-keyed token diff has a
    blind spot — it skips the presence check when a name is absent — which is exactly how the
    radii naming wrinkle (`--radius-card` in globals vs `--r-card` in tokens.css) initially
    slipped past. The name-aware 25/25 gate caught it, and tokens.css's header now spells the
    wrinkle out for the next auditor.
- **Branch:** `token-maxxing-2026-09-12-docs-design-audit`
- **Merge status:** on branch — this was a coordinator-spawned **worker session**
  (`tokenmax-docs-design-audit`, spawned by coordinator `tokenmax-orch-2026-09-12` alongside
  sibling workers); the worker does NOT merge or push. The coordinator owns all merges.
- **Approx token burn:** modest — a docs-only worker session (three comment/prose files, no
  test or build gates beyond prettier and the manual verification sweeps), a fraction of a full
  fanned-out build session. 🔥

## Context & Motivation
The 2026-09-11 fan-out produced twenty-one session docs; the first of yesterday's two
docs/design sessions (`docs-design-dead-links`) repaired the *dangling citations* left by the
`204fd34` retirement of the v0.1.0 contract trio, and its follow-up section recorded exactly
what it had deliberately left undone: `docs/design-brief.md:4` still cited the retired duo by
bare name, and nothing had checked whether the docs' *content* still matched the tree. Today's
coordinator (`tokenmax-orch-2026-09-12`) assigned this session the second half of that arc
in place of a self-picked menu item: audit all three design docs for staleness and duplication
against the current tree, and compact them.

The premise was plausible but unproven — and turned out half-wrong in the most useful way. The
docs *read* current (yesterday's link repair made them read current), but v1.0.0 had shipped
the same day (2026-09-11), bringing the five-tab TabBar with Nina, the eleventh record, and a
shift of badge thresholds into `lib/badges/catalog.ts` — any of which could have silently
staled a design doc written before the ship. The session's method was therefore fixed before
any edit was contemplated: **verify every checkable claim first, edit only what fails**, so
the resulting diff distinguishes "audited and true" from "audited and fixed" — the same
achievement-first honesty yesterday's session applied to its link sweep.

## What We Did (blow-by-blow)
1. **Verified before editing — the claims sweep.** Ran the checks that would judge each doc:
   - **Token mirror, per scheme:** a diff of `docs/design/tokens.css` against
     `app/globals.css` run separately for light and dark, name-aware — not a naive text diff
     (the first attempt was exactly that, and it skipped the radii entirely because their
     *names* differ; see Decisions). Result: 25/25 tokens match in both schemes — 21 by
     identical name, 4 radii by identical value under globals' `--radius-*` literals.
   - **Ruling carriers exist:** all six components DESIGN_INTEGRATION names as carrying
     rulings were checked present — `ExtractingSkeleton` (R-41), `BadgeShelf`/`BadgeDialog`
     (R-42–R-44), `ProvenanceMark` and both `SplitsTable`s (R-45), `HonestyChip` (R-46). All
     exist.
   - **Catalogs and counts:** the badge catalog is 22 keys with all 17 of the brief's sample
     titles live; the records catalog ships **eleven** records, not the brief's ten
     (`earliest_start` joined — `lib/records/catalog.ts:123`).
   - **Chrome shape:** `components/ui/TabBar.tsx` is **five** tabs — Nina joined as a tab at
     v1.0.0 and the centre tab is labelled **New**, not Upload — against DESIGN_INTEGRATION's
     "4-tab bar" note and the brief's four-tab ask.
   - **Font and theming:** Poppins 500/600/700 via `next/font` in `app/layout.tsx` (as
     claimed); no theme toggle exists anywhere (the tokens doc's "system-driven" claim holds).
   - **Cross-reference sweep:** everything in the repo citing the three docs — which surfaced
     both the code-comment citation family (see Follow-ups) and the one hard constraint:
     `components/admin/DialSlider.tsx:64` pins `docs/design-brief.md:175` **by line number**.
2. **Closed yesterday's recorded follow-up.** `docs/design-brief.md:4` ("rewritten 2026-08-20
   after `ROADMAP_v0.1.0.md` and `RECONCILIATION_v0.1.0.md` landed") cited the retired duo by
   bare name. Now carries the same `git show 204fd34^:RECONCILIATION_v0.1.0.md` retrieval
   convention every other `docs/design/` file uses — the repo answers "where did the contract
   trio go?" in one voice.
3. **Fixed the re-pull trap.** The brief's "How to use this" step 4 told re-pullers to read
   the canvas through `list_projects` → `list_files` → `get_file` — but DESIGN_INTEGRATION
   itself documents that the Run Insights canvas is a `PROJECT_TYPE_PROJECT`, which
   `list_projects` filters out. A reader following the brief verbatim would have found
   nothing. Added the fetch-by-id caveat inline.
4. **Corrected the zones comment against the code.** tokens.css's zone block said "Thresholds
   are fixed and match the canonical fixture" — contradicted by `lib/charts/zones.ts`, where
   zone bounds are per-run screenshot data that move with the runner's HRmax. Reworded to the
   fixture-print reality, keeping the printed fixture numbers (they are true *of the
   fixture*) but adding the warning that they are **not constants the code enforces**.
5. **Corrected R-32's threshold location.** DESIGN_INTEGRATION's R-32 parenthetical said the
   live thresholds are in `lib/badges/rules.ts`; since R-42 they live only as
   `BADGE_THRESHOLDS.centuryM` in `lib/badges/catalog.ts` (verified at line 55:
   `centuryM: 100_000`), with `rules.ts` comparing against it and `meta.ts` interpolating it
   into the condition sentence. The correction names R-42 as what made the split structural,
   not just a file move.
6. **Gave the four-tab claims their live notes.** R-35's "4-tab bar, Upload centre and
   raised" and the brief's four-tab ask: the shipped bar is five tabs (Nina joined at v1.0.0,
   centre tab relabelled **New**, `components/ui/TabBar.tsx`). Both docs got a live note; the
   prompt/ruling text itself stays as history — the idiom yesterday's session established:
   tense corrections and live-location notes, never re-adjudication of what the design run
   decided.
7. **Covered the eleventh record.** The brief asks for "Ten records"; `lib/records/catalog.ts`
   ships eleven (`earliest_start`). Covered in the new landing-note deltas paragraph rather
   than by editing the prompt text — same history-preserving idiom.
8. **Closed the `--miss` contradiction in the other direction.** R-35 said "`--miss: #bfb9a9`
   is defined but unused in the three artboards… F05 should use it rather than inventing
   another." It *did* — `bg-miss` is now the fallback for zone segments a run's data doesn't
   report (both `ZoneBar`s and `SplitsTable`). Added an "(It did…)" note so the doc's
   recommendation reads as fulfilled, not pending.
9. **Stopped the "Still open" heading from lying.** The section held only struck-through,
   closed items (yesterday's session had closed the last two). Retitled
   "## Open items — none" — the items stay, struck, as record.
10. **Added the shipped-deltas landing paragraph to the brief.** After the "two things
    survived both runs" note, a new paragraph tells anyone reading the design prompt as
    history what has moved since v2 shipped: the five-tab bar (Nina joined at v1.0.0, centre
    tab **New**, `components/ui/TabBar.tsx`), the eleventh record (`earliest_start`,
    `lib/records/catalog.ts`), the Nina surface (`/nina`) postdating both design runs
    entirely, and `docs/architecture.md` as the current screen map.
11. **Documented the radii naming wrinkle at the trap site.** tokens.css's "THIS FILE IS THE
    REFERENCE COPY" header now states the one place the mirror is not name-identical: the
    four radii exist in `app/globals.css` only as `--radius-*` literals (`--radius-card`, not
    `var(--r-card)`), so a radius change is mirrored by editing that literal. This is the
    exact trap the session's own verification harness hit mid-audit (Decisions).
12. **Compacted three duplications.**
    - DESIGN_INTEGRATION's 13-line v1 "direction" paragraph restated palette/type/zone detail
      that R-34/R-35 carry in full a page later. Cut to the kept rationale ("F10's patch
      decision (R-43) is still argued against it") plus an explicit pointer: "The full v1
      detail — palette hexes, zone sequence, input sizes — is in R-34 and R-35 below; it is
      not restated here."
    - Its "New with v2" paragraph glossed R-44 and R-45 twice over (once in the status table,
      once again in prose, with the components carrying them in header comments named above).
      Trimmed to R-41 — the only gloss not stated elsewhere — with a pointer for R-42–R-46.
    - tokens.css's header v1→v2 narrative condensed; the retrieval command kept.
13. **Honoured the line-number constraint.** Both brief edits above line 175 were made
    line-count-neutral — the `**Domain:**` edit 2 lines → 2 lines, the step-4 edit 3 lines →
    3 lines — so `components/admin/DialSlider.tsx:64`'s `docs/design-brief.md:175` citation
    continues to land on "Minimum 44 × 44pt tap targets."
14. **Ran the gates, committed, stayed unpushed.** `prettier --check` clean on all three; the
    name-aware token mirror gate 25/25; `sed -n 175p` confirmed the anchor line unchanged;
    every backticked repo path introduced (`lib/charts/zones.ts`,
    `components/ui/TabBar.tsx`, `lib/records/catalog.ts`, `lib/badges/catalog.ts`) resolves;
    grep confirms the remaining retired-file mentions all sit inside retrieval-note framing.
    Committed as `580863d` (3 files, +39/−30), tree clean, **not pushed** — worker contract;
    the coordinator owns merges.

## Code / Design Details

**The brief's line 4, before and after** — the last bare citation of the retired duo, now on
the house retrieval convention (and exactly two lines, preserving the line-number contract):

```markdown
<!-- before -->
**Domain:** [runins.site](https://runins.site) · **Version:** v2, rewritten 2026-08-20 after
`ROADMAP_v0.1.0.md` and `RECONCILIATION_v0.1.0.md` landed.

<!-- after -->
**Domain:** [runins.site](https://runins.site) · **Version:** v2, rewritten 2026-08-20 after the
v0.1.0 contract trio landed (retired 2026-09-10 — `git show 204fd34^:RECONCILIATION_v0.1.0.md`).
```

**The re-pull step, before and after** — the caveat costs one clause and saves a dead end
(3 lines → 3 lines, above line 175):

```markdown
<!-- before -->
4. Come back to Claude Code and say *"pull the design"* — it reads the project through the
   `DesignSync` tool (`list_projects` → `list_files` → `get_file`) and maps it onto the tokens
   and primitives in the feature plans. No copy-paste.

<!-- after -->
4. Come back to Claude Code and say *"pull the design"* — it reads the project through the
   `DesignSync` tool (`list_projects` → `list_files` → `get_file`; the existing Run Insights
   canvas is `PROJECT_TYPE_PROJECT`, filtered out of `list_projects` — fetch by id). No copy-paste.
```

**The zones comment** — the fixture numbers were true of the fixture but false as a statement
about the app:

```css
/* before */
  /* the five heart-rate zones, cool to warm: easy is water, maximum is ember.
     Thresholds are fixed and match the canonical fixture:
     Z1 <140 · Z2 141-151 · Z3 152-163 · Z4 164-174 · Z5 175+ */

/* after */
  /* the five heart-rate zones, cool to warm: easy is water, maximum is ember. The canonical
     fixture prints Z1 <140 · Z2 141-151 · Z3 152-163 · Z4 164-174 · Z5 175+, but the app's
     bounds are per-run screenshot data that move with the runner's HRmax (lib/charts/zones.ts) —
     these numbers are not constants the code enforces. */
```

**R-32's parenthetical** — from a file location that R-42 superseded to the structural story:

```markdown
<!-- before -->
(The ruling held: the live conditions are `lib/badges/meta.ts`, the thresholds
`lib/badges/rules.ts`.)

<!-- after -->
(The ruling held, and R-42 later made it structural: the 100 km lives only as
`BADGE_THRESHOLDS.centuryM` in `lib/badges/catalog.ts`; `lib/badges/rules.ts` compares against it
and `lib/badges/meta.ts` interpolates it into the condition sentence.)
```

**The live notes on R-35's claims** — prompt text untouched, status annotated:

```markdown
- **4-tab bar**, Upload centre and raised. (The shipped bar is five tabs now — Nina joined as a
  tab at v1.0.0 and the centre tab reads *New*; `components/ui/TabBar.tsx`.)
- **`--miss: #bfb9a9`** is defined but unused in the three artboards. Presumably intended for
  absent/unextracted values. F05 should use it for exactly that rather than inventing another.
  (It did, via a later change: `bg-miss` is now the fallback for a zone segment the run's data
  doesn't report — both `ZoneBar`s and `SplitsTable`.)
```

**The compactions** — duplication out, pointers in:

```markdown
<!-- DESIGN_INTEGRATION "direction" paragraph: 13 lines of v1 palette/type/zone detail cut to -->
Warm paper (`#f0ede4`) and near-black ink; **Georgia** for anything that is *language* and the
**system monospace** for anything that is a *measurement* — numbers in mono deliver tabular
figures by construction rather than by CSS trick. Zones cool-to-warm, water to ember; **no
shadows anywhere** — a raised surface is `card` over `paper` plus a hairline. The full v1 detail
— palette hexes, zone sequence, input sizes — is in R-34 and R-35 below; it is not restated here.

<!-- "New with v2": R-44/R-45 glossed a second time, cut -->
New with v2, ruled in the record's Part IV (git history; retrieval above): **R-41** (extraction
progress may not claim per-screenshot state — the design changed, D4 stands). R-42 – R-46 are
carried by the components named above and glossed in the table where they amend a v1 ruling.
```

**The per-file delta:**

| File | +/− | Character |
|---|---|---|
| `docs/design-brief.md` | +10/−4 | retrieval, caveat, deltas paragraph |
| `docs/design/DESIGN_INTEGRATION.md` | +16/−15 | live notes, R-32, retitle, compactions |
| `docs/design/tokens.css` | +13/−11 | comment-only — zero token values |
| **Total** | **+39/−30** | 3 files, one commit `580863d` |

**The verified-true ledger** (the claims the sweep tested and left alone — recorded so the
next auditor re-tests deltas, not the world):

| Claim (in the docs) | Verified against | Result |
|---|---|---|
| 25 tokens mirror `app/globals.css` in both schemes | per-scheme name-aware diff | TRUE (21 same-name; 4 radii by value under `--radius-*` literals) |
| Poppins 500/600/700 | `app/layout.tsx` (`next/font`) | TRUE |
| No theme toggle — system-driven | repo-wide grep | TRUE |
| v2 palette/type table (sky `#c9e9fb`, cyan `#23beeb`, radii 8/14/22, zones `#38c3ee`→`#ff5e5b`) | tokens.css | TRUE |
| 22-key badge catalog; 17 sample titles live | `lib/badges/catalog.ts` | TRUE |
| Number formats (`10.67 km`, `1:18:36`, `7'22"`…) | `lib/format.ts` | TRUE |
| Canvas absent from `list_projects` (`PROJECT_TYPE_PROJECT` filtered) | integration doc's own claim | TRUE |
| Six ruling-carrier components exist | tree | TRUE, all six |
| Ten records | `lib/records/catalog.ts` | **STALE** — eleven (`earliest_start`) |
| 4-tab bar | `components/ui/TabBar.tsx` | **STALE** — five tabs |
| Thresholds fixed | `lib/charts/zones.ts` | **STALE** — per-run, HRmax-derived |
| Thresholds in `lib/badges/rules.ts` | post-R-42 layout | **STALE** — only `catalog.ts`'s `BADGE_THRESHOLDS.centuryM` |
| `--miss` unused | both `ZoneBar`s, `SplitsTable` | **STALE** — `bg-miss` zone fallback |

## Decisions & Trade-offs
- **Verify everything first, edit only what fails — and record the negative results.** The
  audit's half-purpose was to find out whether the docs had drifted at all. Writing down what
  came back TRUE (the ledger above) is what turns this from "we changed some lines" into "the
  three design docs are verified current as of 2026-09-12"; the next auditor starts from the
  delta, not from zero. It also protects the mirror contract: had the token diff failed, that
  would have been a code bug, not a doc edit.
- **A naive token diff is not a token diff.** The first mirror check keyed on token *names*
  and silently skipped every token whose name had no counterpart — which is precisely the four
  radii, whose values match but whose names don't (`--r-card` vs `--radius-card`). A gate that
  skips presence checks on name mismatch reports "no drift" while blind to the one place drift
  would hide. The fixed gate checks value-match when names match **and** searches by value
  when they don't — 25/25. The wrinkle itself is now documented at the trap site in
  tokens.css's header, because the next person to write this audit would hit the same blind
  spot.
- **Live-location notes, never re-adjudication** — yesterday's idiom, kept. The brief is a
  *prompt* and DESIGN_INTEGRATION is a *record*: their four-tab and ten-record texts are what
  the design runs actually asked for, and history does not move. The corrections ride as
  parenthetical live notes and one deltas paragraph, so the documents stay truthful as
  *history* and current as *maps* without rewriting what was decided.
- **Honour the line-number citation over typographic freedom.** `DialSlider.tsx:64` cites
  `docs/design-brief.md:175` by number — a fragile convention, but the existing one, and
  breaking it silently to gain two wrapped lines would trade a real (if odd) in-repo contract
  for cosmetics. Both edits above the anchor were shaped to be line-count-neutral instead.
  The durable fix — pointing code comments at content rather than line numbers — is recorded
  as a follow-up, not smuggled into this diff.
- **Compact duplication only where the content provably lives elsewhere.** The v1 "direction"
  paragraph went because R-34/R-35 carry the same palette/type/zone detail in full a page
  later, and the R-43 rationale (the reason the section survives at all) stays. The "New with
  v2" gloss went where the status table and the component header comments already carry
  R-44/R-45. Nothing was cut whose only home was the paragraph being cut — the lesson
  yesterday's session learned in the opposite direction (R-29–R-35 have no other home, so
  nothing there was cut).
- **tokens.css stayed comment-only.** It is the reference copy of a contract mirrored into
  `app/globals.css`; every edit is inside `/* */`. The verified 25/25 mirror makes this
  checkable rather than merely claimed: a future `git show 580863d -- docs/design/tokens.css`
  shows no token line changed.
- **Stay in the three-file scope; record the rest.** The cross-reference sweep found real
  defects *outside* the three docs — stale line-36/:362 claims in `docs/architecture.md`,
  code comments attributing to the brief content it does not contain, the tool-parsed
  generate-badge style contract. All recorded as follow-ups; none fixed. A worker session's
  scope is the coordinator's to set, and widening it would complicate the merge the
  coordinator owns.

## Follow-ups & YAGNI notes
Discovered during this session, deliberately **not** fixed (out of the three-file scope), all
verified against the current tree:
- **`docs/architecture.md:36` and `:362`** still say "39 rulings, R-1..R-45" — the count is
  right but the range is stale (the record ends at **R-46**). This is yesterday's recorded
  follow-up, still unfixed; one-line fixes each in the file the `architecture-reference`
  session created. A future docs session should take both lines together.
- **Code comments citing `docs/design-brief.md` for content it does not contain:**
  - `app/admin/layout.tsx:21` calls 470 px "the brief's iPhone XS Max target" — the brief
    specifies **414 × 896**;
  - `components/admin/UserPicker.tsx:12` cites an "icon button stance" the brief never states;
  - the archived admin plan `components/admin/.workflows/plan/P2-CA-A002.md` quotes "a
    plain-text link, never an icon button" as the brief's words.
  By contrast, the **44pt citations are true**: `components/admin/touch.ts`,
  `components/admin/photoReferenceModel.ts` and `DialSlider.tsx` all cite the minimum the
  brief's line 175 really carries. Fixing the false attributions means editing code comments
  (or, for `DialSlider`, replacing the line-number citation with an anchored one) — code-touch,
  not docs-touch, so out of scope here.
- **`.claude/skills/generate-badge/style.md:619-626`** still cites Roadmap §4.7 (yesterday's
  follow-up, still open): the file is parsed by tools, so its citation needs a history
  pointer *without* disturbing the parsed text — its own careful session, as judged yesterday.
- **YAGNI: still no automated dead-citation/staleness checker for `docs/`** — same call as
  yesterday, now twice-reasoned: the manual sweep (name-aware token diff, path-resolution
  check, `sed -n 175p` anchor check) was a few commands and caught everything a checker would
  have, and the failure mode that would justify automating (drift *recurring* after this
  audit) has not happened yet. Revisit if a third session finds the same class of defect.

## Appendix

**Commit:**
```
580863d docs(design): audit the three design docs against the tree; fix staleness, compact
```
Key lines from the full commit message:
```
Verified, and found TRUE (left alone): the tokens.css -> app/globals.css mirror is
intact for all 25 tokens in both schemes (21 same-name, 4 radii by value under
--radius-* literals); Poppins 500/600/700 via next/font; no theme toggle; 22-key
badge catalog with all 17 brief sample titles live; number formats match
lib/format.ts; the fetch-by-id note about the canvas project is correct
(list_projects filters out PROJECT_TYPE_PROJECT).
...
Constraint honoured: components/admin/DialSlider.tsx:64 cites
docs/design-brief.md:175 by line number (the 44pt line), so both edits above that
line are line-count-neutral.
```

**Files touched:**
```
docs/design-brief.md              | 14 ++++++++++----
docs/design/DESIGN_INTEGRATION.md | 31 ++++++++++++++++---------------
docs/design/tokens.css            | 24 +++++++++++++-----------
3 files changed, 39 insertions(+), 30 deletions(-)
```

**Verification commands run:** `prettier --check` on all three files (clean); the name-aware
per-scheme token mirror gate (25/25 — the earlier naive diff's name-skipping blind spot is
what exposed the radii wrinkle); `sed -n 175p docs/design-brief.md` confirming the
DialSlider-cited anchor line ("Minimum 44 × 44pt tap targets.") unchanged and in place;
existence checks on every backticked repo path introduced (`lib/charts/zones.ts`,
`components/ui/TabBar.tsx`, `lib/records/catalog.ts`, `lib/badges/catalog.ts`); a grep sweep
confirming every remaining retired-file mention sits inside retrieval-note framing;
`git status --porcelain` clean after the commit.

**References:**
- Continues: `docs/token_maxxing/2026-09-11-docs-design-dead-links.md` — the link-repair half
  of the same arc; its follow-ups listed the brief's line-4 citation (closed here) and the
  generate-badge §4.7 citation (still open, deliberately).
- The retirement this builds on: `204fd34` (2026-09-10) — "docs: retire the v0.1.0 contract
  trio"; its `CHANGELOG.md` note establishes the `git show 204fd34^:` retrieval convention
  both sessions applied.
- Facts checked in tree: `lib/charts/zones.ts` (per-run zone bounds), `components/ui/TabBar.tsx`
  (five tabs, centre **New**), `lib/records/catalog.ts` (eleven records, `earliest_start` at
  line 123), `lib/badges/catalog.ts` (`BADGE_THRESHOLDS.centuryM` at line 55), `lib/format.ts`,
  `app/layout.tsx` (Poppins via `next/font`).
- The line-number constraint: `components/admin/DialSlider.tsx:64` → `docs/design-brief.md:175`.
- Coordinator: `tokenmax-orch-2026-09-12` (owns the merge of branch
  `token-maxxing-2026-09-12-docs-design-audit`; this session does not push).
