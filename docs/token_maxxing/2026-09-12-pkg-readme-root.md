# Token-Maxxing Session — 2026-09-12: Root Package Readme Compaction

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`** —
> one of six same-day compaction workers, each owning one package readme. This
> one took the **root** `.workflows/package_readme.md`; the five siblings took
> `lib/nina`, `lib/db`, `lib/admin`, `components/admin`, and
> `components/nina`. The idea was pre-assigned rather than self-picked:
> compact the root readme the way the day's sessions had been shrinking other
> recurring context, and — the part that turned out to be the real work —
> **verify every claim it makes against the current tree** while doing it.

## 🎯 Achievement / End Result
- **Goal of the burn:** Compact `.workflows/package_readme.md` (the
  application root's package readme — the doc every session loads as
  recurring context for root-level work) from 1359 lines down to what the
  current tree actually justifies, trimming the stale and redundant sections
  and re-verifying every surviving claim against the code.
- **Concrete changes:** one commit, `f6e595a` — *"docs(package_readme):
  compact the root readme 1359 -> 769 lines, every claim re-verified"* —
  **1 file changed, 422 insertions(+), 1012 deletions(-); the file went
  1359 → 769 lines (−43%)**. `prettier --check` passes on it.
- **Real value delivered:**
  - The recurring-context cost of the root readme dropped by nearly half,
    and — more important than the raw count — the half that remained is
    **true**. The compaction pass doubled as the doc's first full fact
    audit, and the audit found major drift the doc had been carrying
    silently for days (details below).
  - **Twelve per-phase "Recent changes" changelog entries** (2026-09-05
    through 09-11) — roughly half the file by bulk, restating facts the
    body already carried — were folded into **one rolling summary**, under
    a new written policy: **one paragraph per landing wave, no per-phase
    entries**; durable statements live in the body sections and the
    constants' own docstrings, and narrative lives in git history. The
    readme had only ever grown additively; this is its first compaction.
  - **Geometry re-based to the compact bar.** The old text still said
    `TAB_BAR_HEIGHT_PX` 58/59, `COMPOSER_RESTING_PX` 68, and a 127 px
    bottom gap. The tree now says: **39** (the compact bar,
    composer-frost-and-admin-notch R5, commit `18b0c58`), outer height
    **40**, a new **`TAB_BAR_CONTENT_DROP_CSS`**, **`COMPOSER_RESTING_PX`
    60**, and **`BOTTOM_GAP.chat` 7rem** (112 = 60 + 8 + 32 + 12), with
    `COMPOSER_FALLBACK_PX` **100**. Every number in the geometry sections
    was re-derived from source, including the 112 breakdown.
  - **The safe-area inset's position was corrected — backwards in the
    doc.** The readme asserted the inset sits *outside*
    `composerBottomCss`'s keyboard gate; it now sits **inside** it. Three
    exports the doc had never heard of — `composerPadBottomCss`,
    `panelBottomCss`, `attachStripPadBottomCss` — are now documented.
  - **The bar's state ownership was re-described.** State now lives in a
    **`NinaBarProvider` mounted by `AppShell` around both subtrees**; the
    sidebar rail's "up" control **dispatches toggle into that shared
    state** — it replaced the scroll-to-top handle, and `listScrollRef` /
    `onScrollToTop` are gone. The doc described none of this.
  - **The route table was wrong in both directions:** `/nina/jobs` and
    `/nina/jobs/[id]` were **missing entirely**; the merged-away
    `/admin/photos` was still listed; `/nina`'s `maxDuration` is **300**,
    not 60. The corrected table counts **19 pages, not 16**.
  - **Every count re-measured:** **22** `lib/` directories (was 23),
    **13** `components/` folders (was 15), **~270 test suites (was
    ~100)** — of which **~74 are happy-dom component suites**. That last
    number mattered for tone, not just arithmetic: the component-test
    harness arrived *after* the doc's "a rule in a component cannot be
    asserted at all" passages were written. Those passages were reworded
    honestly rather than deleted, so the doc now records what changed and
    when instead of asserting an obsolete limitation.
  - **The install contract caught up with the shipped icons:**
    `ADMIN_PWA_ICONS` and `app/admin/apple-icon.png` exist now, so the
    "both tiles draw the same art" known-cost note is gone; and the admin
    viewport merge behaviour is now **cited from `mergeViewport` in Next's
    own source** — previously recorded as unverified.
  - **Retired citations repointed:** `RECONCILIATION_v0.1.0.md` /
    `ROADMAP_v0.1.0.md` no longer exist at the repo root; the doc now
    names git history for what those files used to govern.
  - Smaller corrections from the same pass: **AppShell consumers 8 → 10**,
    **`ScreenHeader` importers: 7**, and `r/[id]` **hand-rolls its
    header** rather than using the shared one.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-root`
  (coordinator-assigned worker branch).
- **Merge status:** on branch — the coordinator owns merging; this session
  committed the work and this doc, and stopped.
- **Approx token burn:** high — the whole 1359-line doc read against the
  tree it describes, every constant / route / version / count / consumer
  grep-verified in source, a full rewrite drafted under the repo's
  update-readme skill structure, then the same audit applied sentence by
  sentence to the rewrite. 🔥

## Context & Motivation

The root `.workflows/package_readme.md` is the doc the context-loader hands
to every session that touches root-level concerns, which means its bulk is
paid on every one of those sessions — the same recurring-context-cost
argument that motivated the day's other compaction work. It had grown to
**1359 lines**, and the growth was purely additive: twelve "Recent changes"
changelog entries had accumulated since 2026-09-05, each per-phase, each
restating facts the body already carried, and nothing had ever been
compacted.

The coordinator (`tokenmax-orch-2026-09-12`) pre-assigned this as one of
six parallel compaction workers — five sub-package readmes plus this root
one — with a two-part mandate: trim the stale and redundant sections, and
**verify claims against current code**. The second half is what separates
this from a formatting pass, and it is where the session's real findings
came from: a doc can be *long* because it is stale, but its danger is that
it is *wrong*. Half of the corrections above are things the doc asserted
confidently about the tree that the tree had stopped doing — geometry
numbers from before the compact bar, an inset-gate relationship that had
been inverted, a route that had been merged away, a test-harness
limitation that two days of test-writing sessions had erased.

## What We Did (blow-by-blow)

1. **Read the doc in full against the tree.** 1359 lines, of which roughly
   half was the twelve-entry changelog block (2026-09-05..09-11). The
   first structural decision fell out immediately: the changelog is
   narrative, and narrative belongs in git history.

2. **Verified every claim class with a method suited to it:**
   - **Geometry constants** grepped in their defining source (`lib/nina/
     chrome.ts` and companions) — not trusted from the doc, not from
     memory of recent sessions. This is where 58→39, 68→60, 7.5rem→7rem,
     127→112, and the new `TAB_BAR_CONTENT_DROP_CSS` surfaced.
   - **Routes enumerated with `find`** over `app/`, then reconciled
     against the doc's table — surfacing the two missing `/nina/jobs`
     pages, the ghost `/admin/photos`, the wrong `maxDuration`, and the
     16→19 page count.
   - **Versions read from `package.json`**, config files read directly,
     **consumers grep'd** (AppShell: 8 → 10; `ScreenHeader`: 7), and
     **test suites counted** (~100 → ~270, ~74 of them happy-dom).
   - **Cited files checked for existence** — which is how the
     `RECONCILIATION_v0.1.0.md` / `ROADMAP_v0.1.0.md` citations were
     found pointing at files retired from the repo root.

3. **Chased the drift to its commits where the "when" mattered.** The
   compact bar's 39 px is R5 of composer-frost-and-admin-notch, commit
   `18b0c58` — the doc now names it, so the next reader can date the
   number instead of trusting it.

4. **Rewrote the file** to 769 lines following the repo's own
   **update-readme skill structure** — Overview / The shell contract
   (`AppShellScreen`, who renders the bar, the reveal rules, the geometry,
   the CSS channels, motion) / Root modules (the auth edge: `auth.ts`,
   `auth.config.ts`, `proxy.ts`) / Internal Architecture (data flow,
   route tree, chrome, the two-manifest install contract) / Dependencies /
   Reverse Dependencies / Concurrency / Error Handling / Performance /
   Configuration / Usage / Notes (charter + the new rolling Recent
   changes). The new "Last Updated" header is a **single compaction
   entry**, not a chain.

5. **Reworded, don't deleted, the obsolete-limitation passages.** The doc
   once said a rule in a component "cannot be asserted at all" — true when
   written, falsified by the ~74 happy-dom suites that now exist. Those
   passages now say what the harness made possible, rather than vanishing
   as if the claim had never been made. The doc's history stays honest
   while its present tense becomes true.

6. **Gates:** `prettier --check` passes on the rewritten file. (A docs-only
   diff; no test, typecheck, or migration surface touched.)

7. **Committed** as `f6e595a` with the correction list spelled out in the
   body, so the changelog summary's "what changed" is auditable from the
   commit message alone.

## Code / Design Details

**The changelog policy is the anti-re-inflation mechanism.** The structural
fix is not "fewer lines" — it is a written rule in the Recent changes
section that makes the old shape unrepeatable:

- **One paragraph per landing wave.** No per-phase entries.
- Durable statements live in the **body sections** and in the **constants'
  own docstrings** — where the next reader is already looking when they
  need them.
- Narrative (what happened when, in what order) lives in **git history**,
  which is better at it than a changelog: it is complete, ordered, and
  doesn't cost a session any context to load.

The failure mode this guards against is exactly what the file had: twelve
entries × per-phase granularity × facts duplicated from the body = every
future "Recent changes" update re-inflating the doc additively forever.

**The geometry section, before → after (the drift in one table):**

| Claim | Doc said | Tree says |
|-------|----------|-----------|
| `TAB_BAR_HEIGHT_PX` | 58 (and 59 in a second place) | **39** (compact bar, R5, `18b0c58`) |
| Bar outer height | — | **40** |
| Content-drop CSS | — | **`TAB_BAR_CONTENT_DROP_CSS`** (new) |
| `COMPOSER_RESTING_PX` | 68 | **60** |
| `BOTTOM_GAP.chat` | 7.5rem (127 px) | **7rem** (112 = 60 + 8 + 32 + 12) |
| `COMPOSER_FALLBACK_PX` | — | **100** |

The 112 breakdown is written into the doc because "the same numbers are
written more than once" in this codebase by design — the geometry section
explains why, so a future editor updates them together or not at all.

**The inset/gate inversion** is the subtlest correction, and the reason a
verification pass has to read code and not just grep for numbers: the doc
asserted the safe-area inset is applied *outside* `composerBottomCss`'s
keyboard gate. In the current tree it is **inside the gate** — the two
arrangements differ in exactly the states a reader would consult the doc
to predict (keyboard-open vs inset-only). Alongside it, three exports the
doc predated — `composerPadBottomCss`, `panelBottomCss`,
`attachStripPadBottomCss` — are now each documented.

**The bar-state story** now reads correctly: `NinaBarProvider` is mounted
by `AppShell` around **both** subtrees; the sidebar rail's "up" control
dispatches `toggle` into that shared state — it replaced the scroll-to-top
handle, and `listScrollRef` / `onScrollToTop` no longer exist. Under the
old text, a reader would have gone looking for a prop chain that isn't
there.

**Count corrections, all re-measured:** 19 pages (was 16) / 22 `lib/`
dirs (was 23) / 13 `components/` dirs (was 15) / ~270 suites (was ~100,
~74 happy-dom). The suite count is the one that changed the doc's *tone*:
statements like "a rule in a component cannot be asserted at all" were
written before the component-test harness existed and are now false in
both letter and spirit; they were reworded, not removed.

## Decisions & Trade-offs

- **Fold all twelve changelog entries into one summary.** The alternative
  — keeping per-phase entries as an appendix — preserves archaeology in
  the highest-cost location for it. Git history is strictly better at
  this; the one-paragraph-per-wave summary keeps only what git is bad at:
  the shape of the week's landings in prose.
- **Reword stale-limitation passages rather than delete them.** Deleting
  the "cannot be asserted at all" claims would silently rewrite the doc's
  own past and hide *why* the rewording was needed (the harness arrived).
  The reworded text records the change; the cost is a sentence or two of
  history, which is the cheap direction to err in.
- **Name the commit for a correction** (`18b0c58`) where a number's date
  matters, so future verification passes can re-trace the same path.
- **Follow the update-readme skill's section structure** rather than
  inventing a layout. The doc has to keep working with the tooling and
  subagents that already navigate that structure.
- **A docs-only diff, no drive-by code changes.** The verification pass
  surfaced drift in the *doc*, not bugs in the *code* — the geometry,
  routes, and state ownership in source are internally consistent. Nothing
  outside `.workflows/package_readme.md` was touched.
- **`scripts/` left alone.** The six-package fan-out covered the five
  sub-package readmes plus root; `scripts/package_readme.md` (226 lines,
  freshly expanded the day before) had no worker and did not need one.

## Follow-ups & YAGNI notes

- **The other five package readmes are still large** — lib/nina **3767**
  lines, components/admin **1950**, lib/admin **1300**, lib/db **1098**,
  components/nina **1017**. Five sibling workers were compacting them the
  same day (their docs and commits land separately); this session did not
  touch their files.
- **The lib/nina readme's "Last Updated" header is a run-on chain of every
  prior entry** — the same disease this session cured in the root readme's
  header. Whether its compactor fixed the header pattern was unknowable
  mid-fan-out and is worth one glance when its doc lands.
- **The "one rolling paragraph per wave" policy should be applied to the
  other readmes' headers.** It is written into the root readme's Recent
  changes section; transplanting that policy line into each sibling's
  header would keep all six from re-inflating the way the root one did.
- **A future verification pass should re-check the ~74-suite count** as
  the harness's coverage grows — the doc rounds it, deliberately, but a
  rounding that never gets re-measured becomes the next stale claim.
- **Not done, deliberately: any tooling for doc-drift.** A lint that checks
  cited file paths exist (or that counts in docs match measured counts)
  would have caught several of today's findings mechanically. Out of scope
  for a worker session; recorded here because the failure mode is now well
  documented by six compaction sessions' worth of findings.

## Appendix

**Commit (on `token-maxxing-2026-09-12-pkg-readme-root`):**

```
f6e595a docs(package_readme): compact the root readme 1359 -> 769 lines, every claim re-verified

 .workflows/package_readme.md | 1434 +++++++++++++-----------------------------
 1 file changed, 422 insertions(+), 1012 deletions(-)
```

(1359 → 769 lines; the diff touches nearly every line because the body was
rewritten in place around the surviving true statements.)

**The rewritten file's section map** (769 lines, update-readme skill
structure): Overview · The shell contract (`AppShellScreen` — one prop for
the chrome *and* the gap / who renders the bar, and where the state lives /
the reveal rules, `lib/nina/chrome.ts` / the geometry / the CSS channels
across the sibling gap / motion) · Root modules — the auth edge (`auth.ts`,
`auth.config.ts`, `proxy.ts`, `next-env.d.ts`) · Internal Architecture
(one reveal end-to-end / the route tree and its chrome / which screens get
chrome at all / the install contract — two manifests on one origin) ·
Dependencies (external / composed packages / internal / boundary rule) ·
Reverse Dependencies (`AppShell` consumers / geometry-constant consumers) ·
Concurrency · Error Handling · Performance · Configuration · Usage (adding
a shelled screen / the full-screen conversation / gotchas) · Notes
(charter / Recent changes — the one-paragraph-per-wave policy).

**Key commands run this session:**

```bash
find app -name 'page.tsx' -o -name 'route.ts'   # route enumeration (19 pages)
git grep -n 'TAB_BAR_HEIGHT_PX\|COMPOSER_RESTING_PX\|BOTTOM_GAP' -- lib/  # constants in source
ls lib | wc -l; ls components | wc -l           # directory counts: 22 / 13
find . -name '*.test.{ts,tsx}' | wc -l           # ~270 suites (~74 happy-dom)
node -e "console.log(require('./package.json').dependencies)"  # versions
git log --oneline -- lib/nina/chrome.ts          # drift dating (18b0c58, R5)
ls RECONCILIATION_v0.1.0.md ROADMAP_v0.1.0.md    # gone — citations repointed
npx prettier --check .workflows/package_readme.md  # passes
```

**Verification method note:** every correction above was made by grepping
or reading the *current tree*, never from memory of recent sessions — the
sessions that changed these values were not this session's, and their
commit messages are where the "when" came from, not the "what".
