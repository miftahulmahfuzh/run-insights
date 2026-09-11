# Token-Maxxing Session — 2026-09-11: Architecture Reference

> **Sixth token-maxxing session on this date — and the first run as a
> WORKER in a coordinator's fan-out** (coordinator `tokenmax-orch-2026-09-11`,
> which spawned N parallel worker sessions on separate branches). That changes
> two things from the pattern the first five sessions set: the idea was
> **assigned** by the coordinator rather than self-picked from a menu, and the
> merge to main is **coordinator-owned** — Worker Mode W4 says report, never
> merge. The idea assigned here was the one follow-up every one of the five
> prior sessions had deferred: the F0x architecture-synthesis doc. This
> session finally did it.

## 🎯 Achievement / End Result
- **Goal of the burn:** Read all 36 `docs/plans/*.md` planning documents
  (F01–F33 plus the two 2026-09-10 design docs) in full, cross-check each
  against the current implementation, and synthesize **one current-state
  architecture reference** — `docs/architecture.md` — describing the system
  as it actually exists today, not as originally planned.
- **Concrete changes:**
  - `docs/architecture.md` — new, 622 lines, 14 top-level sections (commit
    `9a851f9`, the only commit this session needed).
  - No code, tests, or infra touched — a pure documentation session.
- **Real value delivered:**
  - Closed the follow-up **deferred by all five prior token-maxxing
    sessions** (5× deferred, 0× acted on): 36 fragmented point-in-time plan
    docs and no single current-state reference was a real onboarding and
    context gap.
  - One document that now answers "how does this system actually work?"
    for a new reader: system-at-a-glance, build history, runtime topology,
    the 28-table data model, the run pipeline, Nina, the admin console,
    sharing, the guard system, and env/config.
  - The heart of it — **§13, a per-plan cross-reference covering all 36
    docs** — with SHIPPED / SHIPPED+AMENDED / SUPERSEDED status per plan and
    what diverged from the plan when it did, plus "known sharp edges" for
    the next reader.
  - Preserved the session-scale findings that would otherwise live only in
    scrollback: runs are born reviewed (R-1 overruled F03/F05's draft
    design); F31 found a vendor-side model change (thinking blocks) had
    silently killed ALL insights; F25 measured that appending anything to
    the badge-art STYLE BLOCK destroys subject adherence; blob rotation on
    revoke (R-15) superseded F11's accepted-residual-risk; the capture
    harness writes to the production database (the one-DB reality); the
    F27 R3 min-count rule; the F<N+1> plan-number race history.
- **Branch:** `token-maxxing-2026-09-11-fxx-architecture-doc` (worker
  branch; the coordinator's fan-out gave each worker its own).
- **Merge status:** NOT merged — worker session; the coordinator owns the
  merge to main (Worker Mode W4: report, never merge).
- **Approx token burn:** very high, deliberately — all 36 plan docs read in
  full (~19.2k lines), the current implementation surveyed across 672
  commits / 28 tables / 204 lib modules / 165 components / 192 test files,
  and a 622-line synthesis written from it. 🔥🔥

## Context & Motivation

Every one of the five prior token-maxxing sessions on 2026-09-11 ended its
Follow-ups section with some version of "still open: the F0x
architecture-synthesis doc (33 plan docs → one current-state reference)"
— and picked something else. Five deferrals in a single day is how the
coordinator noticed it, and it became this session's assignment: a survey
of the plans had become the gap *behind* the other gaps. The repo had 36
planning documents describing point-in-time intentions, some months stale,
with no document describing what the system is *now*. Anyone onboarding —
including every future session — had to reconstruct current state from
scratch or trust the oldest doc that mentioned a thing.

This session ran as a worker in coordinator `tokenmax-orch-2026-09-11`'s
fan-out, so unlike the prior five there was no menu and no self-pick: the
coordinator assigned the idea, this session executed it. That also means
this doc's "menu considered" section from prior sessions is replaced by
the assignment itself.

## What We Did (blow-by-blow)

1. **Read all 36 plan docs in full** (~19,200 lines): F01–F33 plus the two
   2026-09-10 design docs. In full, not skimmed — the session's whole
   premise was that the cross-reference had to be grounded in what each
   plan actually says, not in later docs' characterizations of earlier
   plans.

2. **Surveyed the current implementation** to have something to check the
   plans against: **672 commits** since 2026-08-20, **28 Drizzle tables**,
   **204 lib modules**, **165 component files**, **192 test files**
   (~3.6k tests), **21 migrations**, **7 CI guards**, **2 Vercel crons**,
   and ~35 post-F33 plan sets under `.workflows/plan/`.

3. **Spot-verified plan features against code** rather than trusting the
   plans: `normalizeClockTime`, `earliest_start`, `recentRuns`,
   thinking-disabled, `imageprefs`/`imagerecipe`, the admin chat-photo
   components, the native `type="time"` input, and others.

4. **Wrote `docs/architecture.md`** (622 lines) in one commit:
   - System-at-a-glance and build history.
   - Runtime topology.
   - Data model: the 28 tables plus **the 9 invariants that shape every
     query**.
   - Migration-chain scars: the **two `0011_*` files and the missing
     `0014`** — artifacts of concurrent branches forking the snapshot
     chain, kept as-is because the tip is constructed and verified, and a
     renamed migration is skipped silently.
   - The run pipeline: upload → extraction → review → commit.
   - Derived data, Nina (v0.2.0), the admin console, sharing.
   - The guard system, env/config, and a documentation map.
   - **§13 — the per-plan cross-reference**: all 36 docs, each marked
     SHIPPED / SHIPPED+AMENDED / SUPERSEDED, with what diverged when it
     did.
   - Known sharp edges for the next reader.

5. **Committed once** (`9a851f9`, "docs: current-state architecture
   reference (docs/architecture.md)") and stopped — no merge, per Worker
   Mode W4. The coordinator owns the landing.

## Code / Design Details

**The cross-reference statuses.** §13's three statuses do the doc's real
work:

- **SHIPPED** — the plan landed essentially as written.
- **SHIPPED+AMENDED** — the plan landed, but a later ruling or measurement
  changed it; the amendment is named with its source. The canonical
  example: **runs are born reviewed** — R-1 overruled F03/F05's draft
  design where runs entered as drafts needing a review pass.
- **SUPERSEDED** — a later decision replaced the plan outright. Examples:
  blob rotation on revoke (R-15) superseded F11's
  accepted-residual-risk; the F<N+1> plan-number race history left scars
  in the numbering.

**Findings worth having rescued from scrollback** (all now in the doc):

- **F31 found a vendor-side model change (thinking blocks) had silently
  killed ALL insights** — the pipeline wasn't broken in code; the vendor
  changed shape under it. The kind of fact that is invisible in the tree
  and lives only in a plan doc's postmortem.
- **F25 measured that appending anything to the badge-art STYLE BLOCK
  destroys subject adherence** — the style contract is load-exact,
  append-nothing, and the measurement says why.
- **The repair budget was re-measured twice in F04** — the constant in the
  code is the second measurement, not the first.
- **The capture harness writes to the production database** — the repo has
  ONE database and "dev" is production; the harness is not sandboxed.
- **The F27 R3 min-count rule.**

**The migration-chain scars section** records what the numbering *means*:
two `0011_*` files (concurrent branches each adding a table forked the
snapshot chain; the tip had to be constructed, not merged) and a missing
`0014` (an id in a filename is invisible to a content grep, and a renamed
migration is skipped silently). These are exactly the traps a new reader
would otherwise rediscover the hard way.

## Decisions & Trade-offs

- **Describe the system as it IS, not as planned** — the doc's stated
  premise. Where plan and tree disagree, the tree wins and the divergence
  is recorded, because the audience is someone trying to work on the
  current system.
- **Cite measurements rather than re-deriving them.** The doc records
  constants (token floor, budgets, SHAPE_WIDTH bands) with a pointer to
  where they were measured, instead of re-deriving them — that's what
  keeps a docs session a docs session. The trade-off recorded in
  Follow-ups: if a constant changes, update §13's relevant entry in the
  same commit.
- **Snapshot dated 2026-09-11, accepted as such.** The doc will drift;
  the session judged §13 (per-plan status) stays useful longest, since
  plan-vs-tree deltas accumulate slowly once written down.
- **One commit, no code touched.** A pure documentation deliverable; no
  test-suite or gate run was applicable beyond writing the file.
- **No merge, by design.** Worker Mode W4 — the coordinator
  (`tokenmax-orch-2026-09-11`) owns the merge to main; this session
  reports and stops.

## Follow-ups & YAGNI notes

- **The doc is a snapshot dated 2026-09-11 — it will drift.** The §13
  cross-reference is the part that stays useful longest; the topology and
  counts sections age fastest.
- **A follow-up could generate the same cross-reference for the ~35
  `.workflows/plan/` plan sets** — only Nina's rulings and the admin sets
  were sampled this session; the tail of that tree is uncatalogued.
- **If a constant changes** (token floor, repair budgets, SHAPE_WIDTH
  bands), update §13's relevant entry **in the same commit** as the code
  change — the doc cites measurements rather than re-deriving them, so a
  silently-changed constant would leave the doc confidently wrong.
- **Note on the other five sessions' open items:** they remain open —
  this session did not touch `useFolderUpload.ts`, `PhotoMoveBar.tsx`,
  `FolderMenu.tsx`, the `ninaAlbumActions.ts` avatar exports, the
  `components/ui` primitives, or the `lib/nina` dead-code hunt. See their
  docs; this session's assignment was the architecture doc alone.

## Appendix

**Key facts surveyed this session:**
- Plan docs read in full: 36 (`docs/plans/*.md`: F01–F33 + two
  2026-09-10 design docs), ~19.2k lines.
- Implementation: 672 commits since 2026-08-20; 28 Drizzle tables; 204
  lib modules; 165 component files; 192 test files (~3.6k tests); 21
  migrations; 7 CI guards; 2 Vercel crons; ~35 post-F33 plan sets under
  `.workflows/plan/`.

**Commit (on `token-maxxing-2026-09-11-fxx-architecture-doc`):**
```
9a851f9 docs: current-state architecture reference (docs/architecture.md)
```
`docs/architecture.md | 622 ++++++++++++++++++++` — 1 file changed, 622
insertions.

**Merge status:** on worker branch, NOT merged — coordinator
`tokenmax-orch-2026-09-11` owns the merge to main (Worker Mode W4:
report, never merge).
