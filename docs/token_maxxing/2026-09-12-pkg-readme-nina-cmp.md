# Token-Maxxing Session — 2026-09-12: Components Nina `package_readme` Compaction

> **A coordinator-assigned worker session under `tokenmax-orch-2026-09-12`**
> (idea slug `pkg-readme-nina-cmp`). The first 2026-09-12 session to write its
> doc: the task was not code at all but a *documentation* compaction — the
> same recurring-context-cost problem the fan-out had already attacked on
> other bloated `package_readme.md` files, applied to the largest one left:
> `components/nina/.workflows/package_readme.md` at 1,017 lines. That file is
> loaded into context on **every nina task**, so its size is a tax paid
> repeatedly, and its staleness was worse than its size — whole sections
> described a codebase that 2026-09-11's work had replaced.

## 🎯 Achievement / End Result
- **Goal of the burn:** Compact
  `components/nina/.workflows/package_readme.md` from 1,017 lines — trim the
  stale and redundant sections, and **verify every surviving claim against
  the current tree** before letting it stand — without losing the document's
  value as the nina package's orientation map.
- **Concrete changes:** one commit, `11f5689` — *"docs(nina): compact
  package_readme 1017→713 lines; re-verify every claim against the tree"* —
  **a single file changed: 514 insertions(+), 818 deletions(-)**. The readme
  went 1,017 → **713 lines** and 96,666 → **61,492 bytes (−36%)**, prettier
  clean, working tree clean after.
- **Real value delivered:**
  - **~36% off a file that rides in context on every nina task** — the
    duplication cut alone removed two parallel changelogs saying the same
    facts twice (~85 lines: a ~1.5k-word single-line "Last Updated" blob at
    the top plus four giant "Documentation Created" entries at the bottom,
    replaced by one compact per-task "Recent changes" record).
  - **~15 falsified or drifted claims corrected** — found by a
    claim-by-claim verification sweep against the tree before anything was
    cut, so the compaction is also a truth repair. The biggest: the
    "component tests are impossible in the node environment" story (killed
    by 2026-09-11's component-test campaign), the retired 90 s
    `NINA_TURN_STALE_MS` identity, the vanished ChatChrome 32 px disc
    exception, the "media-dedupe phase 2 of 4 now running" note (it is 4/4
    complete), and a claimed `lucide-static` dependency that does not exist.
  - **The skill skeleton survived intact** — Overview, module map for all 32
    files, the turn/keyboard/dedup/about/sidebar deep-dives, export table,
    dependencies, reverse dependencies, concurrency, errors, performance,
    usage + gotchas, and notes are all still there; the file is smaller
    because it says each true thing once, in present tense.
- **Branch:** `token-maxxing-2026-09-12-pkg-readme-nina-cmp`
- **Merge status:** merged (commit `0438cbb`)
- **Approx token burn:** high — the full 1,017-line file read twice (once to
  inventory claims, once to rewrite), a dated git log for two packages since
  2026-09-10, per-commit diffs for all seven post-readme commits, and
  dozens of grep verifications of export names, prop surfaces, constants,
  suite names, and boundary claims before the rewrite could start.

## Context & Motivation
The 2026-09-12 coordinator fanned out parallel worker sessions; this one's
assigned idea was `pkg-readme-nina-cmp`: compact the nina package readme. The
motivation is the same one that drove the earlier package-readme work
(`scripts/` got the treatment on 2026-09-11): these `.workflows/` readmes are
loaded into context on every task touching the package, so every stale or
duplicated line is paid again and again by every future session.

Nina's readme was the worst remaining case — 1,017 lines, 96.7 KB — and a
read of it in full showed it was stale **twice over**:

1. **Redundancy:** a ~1.5k-word single-line "Last Updated" changelog blob at
   the very top of the file restated, in compressed prose, the same facts the
   four giant "Documentation Created" entries at the bottom already told —
   the same events recorded twice, ~85 lines apart, in two different formats
   and two different narrative tenses.
2. **Falsity:** sections of the phase narrative had been made *false* by the
   2026-09-11 work — most visibly the day's component-test campaign, which
   had overturned one of the document's central design claims outright.

## What We Did (blow-by-blow)
1. **Read the whole 1,017-line file.** Not a skim — the compaction standard
   for this fan-out is "verify before you cut," and that requires an
   inventory of every claim the document makes.
2. **Ran a claim-by-claim verification sweep against the tree** before
   cutting anything:
   - dated `git log` for `components/nina` and `lib/nina` since 2026-09-10;
   - per-commit diffs for the **seven commits** that landed after the readme
     was last written;
   - grep verification of **every** `lib/nina` export name, prop surface,
     constant, suite name, and boundary claim the doc names.
3. **Found ~15 falsified or drifted claims** (detailed in the next section).
4. **Rewrote the file compacted to present tense** — 1,017 → 713 lines,
   96,666 → 61,492 bytes — keeping the skill skeleton (see below) and
   replacing both changelogs with one compact per-task "Recent changes"
   record.
5. **Committed and hit one incident:** a guard command in the commit chain
   misfired and landed a commit literally named **"placeholder"** — right
   content, wrong message. Amended in place to the real message; the final
   commit is `11f5689`, single file, 514 insertions(+), 818 deletions(-).

## Code / Design Details
### The falsified / drifted claims (the reason verification had to run first)
The sweep surfaced roughly fifteen claims the 2026-09-11 work had broken.
The twelve named individually:

1. **The test-consumer story was false.** The doc's claim — *"Test
   consumers: none, by design — the `node` environment cannot render a
   client component"* — was overturned by the 2026-09-11 component-test
   campaign: **31 of 32 files now carry co-located happy-dom suites**. `node`
   remains the global Vitest default; each suite opts in per-file with a
   `@vitest-environment` docblock, and testing-library drives the real
   component with the lib actions mocked. The five `tests/` text guards
   remain the structural layer on top.
2. **The turn-poll give-up constant changed identity.** `NINA_TURN_POLL_GIVE_UP_MS`
   is now `NINA_BACKGROUND_BUDGET_MS` (240 s) — no longer the 90 s
   `NINA_TURN_STALE_MS` identity the doc recorded (`nina-offline-reply`
   P1-RI-A038) — and cold-load awaiting is the poll's own disjunct over the
   pending `nina_turns` claim.
3. **The reveal's append is id-idempotent** via `appendNewBubbles`
   (P1-NIN-A034; the production bug it fixed was 7 bubbles rendered for 4
   rows).
4. **NinaJobDetail's Prompt section is gone** — one "Catatan foto" renders
   `sidecar ?? prompt`, and the jump targets the earliest bubble carrying
   the photo.
5. **NinaAboutScreen gained the `returnTo` prop** (the three-rung close),
   and the strip gained a `useSavePhoto` download, with `ChatPhotoActions`
   now a thin wrapper over the shared hook.
6. **ChatScreen gained a ninth required prop, `flashBlinks`**, resolved
   server-side.
7. **ChatChrome's recorded 32 px disc exception no longer exists** — the
   lane is `size-11` (44 px) like everything else.
8. **Media-dedupe is complete 4/4** — the "phase 2 of 4 now running" note is
   retired — with `applyPerceptualKeepers` in the send path.
9. **The send runner internals moved to server-only `turnrun.ts` /
   `turnrevive.ts`** (the component import surface is unchanged, which is
   why the doc's import claims survived).
10. **`lucide-static` is NOT a dependency** — the glyphs are copied
    verbatim; the paths in the tree *are* the copy.
11. **The Usage snippet now matches the real `ninaFlightView` call.**
12. **`ABOUT_JOB_LIMIT`'s home is `app/nina/about/page.tsx`** — the doc had
    it elsewhere.

### What the compacted file keeps
The rewrite preserves the document's actual job — orienting a session in the
package — section for section: **Overview**, the **module map for all 32
files**, the **turn / keyboard / dedup / about / sidebar** deep-dive
sections, the **export table**, **dependencies**, **reverse dependencies**,
**concurrency**, **errors**, **performance**, **usage + gotchas**, and
**notes**.

### What got smaller
- Both changelogs (top blob + bottom "Documentation Created" quartet) → one
  compact per-task **"Recent changes"** record.
- Everything retold in **present tense** — the file now describes the
  codebase as it is, not how it got here, so the next staleness shows up as
  a checkable claim rather than an archaeology puzzle.
- Net: −304 lines, −35,174 bytes.

## Decisions & Trade-offs
- **Verify before cutting, every claim.** The cheap version of this task —
  delete the changelogs, ship the byte savings — would have re-verified
  nothing and left ~15 false statements wearing a fresh coat of brevity.
  The sweep cost most of the session's tokens and is the part that matters:
  a context file that is *wrong* is worse than one that is merely *long*.
- **One changelog, not zero.** The "Recent changes" record stays because the
  readme's audience needs to know which claims are recent; what died was the
  *duplication*, not the history.
- **Keep the full skill skeleton.** No section of the document was dropped
  outright; sections shrank to their true content. The module map keeps all
  32 files even where the entry is one line.
- **Amend, don't stack.** The misfired "placeholder" commit carried the right
  content and the wrong message; amending in place on an unpushed worker
  branch keeps history honest without a reverts-on-reverts commit chain.

## Follow-ups & YAGNI notes
- **Not merged here by design** — the coordinator owns the merge for the
  2026-09-12 set; concurrent-set landing collisions (add/add on
  `docs/token_maxxing/README.md` rows are the known pattern) are its
  problem, not this branch's.
- The remaining `package_readme.md` files that still carry the same
  duplicated-changelog shape are candidates for the same treatment if the
  coordinator wants the rest of the recurring tax.
- The five `tests/` text guards are now the *only* structural (non-DOM)
  test layer for nina; if the co-located suites keep growing, a future pass
  could ask which of the five still earn their keep — deliberately **not**
  done here, out of scope for a docs compaction.

## Appendix
- **Commit:** `11f5689f59eea68e3dbd4cb470603e8ea862c152` —
  `docs(nina): compact package_readme 1017→713 lines; re-verify every claim against the tree`
- **Diff:** `components/nina/.workflows/package_readme.md | 1332 +++---`,
  1 file changed, 514 insertions(+), 818 deletions(-)
- **Size:** 1,017 lines / 96,666 bytes → 713 lines / 61,492 bytes (−36%)
- **Verification inputs:** `git log --since=2026-09-10 components/nina lib/nina`
  (dated), per-commit diffs ×7, grep sweeps of every named export / prop /
  constant / suite / boundary claim.
- **Related sessions:** the 2026-09-11 component-test campaign
  (`2026-09-11-nina-chat-component-tests.md` through
  `2026-09-11-nina-remaining-component-tests.md`) is what falsified the old
  test-consumer story; the `scripts/` readme expansion
  (`2026-09-11-scripts-package-hygiene.md`) is the sibling package-readme
  work this session complements.
