# Token-Maxxing Session — 2026-09-12: Admin Accessibility Audit

## 🎯 Achievement / End Result
- **Goal of the burn:** A WORKER session (slug `tokenmax-admin-a11y-audit`) pre-assigned one idea
  by the coordinator (`tokenmax-orch-2026-09-12`, the fan-out run): *"Run an accessibility audit
  over components/admin (16.7k lines, the largest component tree in the repo): keyboard
  navigation, focus management, aria labeling, color-contrast-independent state signaling. Fix
  concrete, real issues found; do not invent speculative ones. Why: this directory has had two
  dead-code sweeps (admin-optional-props, components-dead-code-a/b) but never an accessibility
  pass — a genuinely different audit lens, not a repeat of prior YAGNI work."*
- **Concrete changes:** three commits, 17 unique files, +246/−38, 5 new tests.
  `935f847` (*fix(admin): restore focus lost by pane closes and FolderMenu panels*) fixed the
  focus-management defect class across `FileExplorer`, `FolderMenu` and `PhotoGrid` (5 files,
  +135/−6); `d39052e` (*fix(admin): announce async results and name the unlabeled control*) added
  8 live-region sites plus one accessible name plus one sr-only state marker across 12 files
  (+95/−19); `43572bd` normalized JSX comment continuations in the focus-fix files to the repo's
  load-bearing `*`-prefix style (3 files, +16/−13, style-only).
- **Real value delivered:**
  - **The audit's headline negative result: the tree is REMARKABLY a11y-aware already.** Native
    `<dialog>` in LogTextDialog with explicit focus management; native range inputs in
    DialSlider/CropStudio; CropStudio's `role="application"` canvas with full keyboard support;
    sr-only table captions; `aria-current`/`aria-pressed` used with documented reasoning;
    measured contrast decisions in PhotoGrid. After two dead-code sweeps, the honest audit
    verdict — that only two real defect classes survived this bar — is itself the finding.
  - **Focus management fixed (commit `935f847`).** Every details-pane close in FileExplorer (the
    pane's ×, and the unmount after a successful remove) dropped focus to `<body>` because the
    focused button unmounted; focus now hands back to the selected tile via a new
    `data-photo-id` attribute on PhotoGrid's tile buttons, falling back to a `tabIndex={-1}`
    content-pane anchor when the row is gone, keyed on `selectedId` so a folder change never
    steals focus. FolderMenu's move and delete panels `autoFocus` nothing on open (create/rename
    always autoFocus their field) — the move select now takes focus, and delete focuses Cancel,
    never the destructive verb.
  - **Async result announcements added (commit `d39052e`), following the repo's own stated
    convention** (CharacterPanel/ImageGenPanel status lines carry `aria-live='polite'` as "the
    one line that changes on its own"; MediaPane/FolderMenu already used `role=alert`): 8 sites
    converted — save-failure lines to `role=alert`, cell-result refusals to `role=alert`, notes
    and download notices to `role=status` — because blur commits land after the operator has
    already tabbed away.
  - **The panel's one unnamed control named.** ImageGenPanel's prompt-template textarea named
    itself via `aria-label` — it was the only control neither a wrapping `<label>` nor the
    `<h3>` named (pinned by `getByRole('textbox', { name: 'Prompt template' })`).
  - **Color-contrast-independent state signaling.** DialSlider's unsaved dot was color +
    title-tooltip only; an sr-only "unsaved" now rides the dot.
  - **Five deliberate non-fixes recorded with reasoning** (the "Kosongkan" label idiom,
    UploadQueue's headline, Escape-to-close, roving tabindex, the FolderTree chevron) — audit
    judgment, not oversights; see Follow-ups.
  - **Full verification green:** 192 files / 3752 tests all passing on the full sweep; admin
    tests 443 → 448; `next typegen` + `tsc --noEmit` clean; prettier clean;
    `check-client-secret-boundary.mjs` passes. (Counts measured 2026-09-12 at session close.)
- **Branch:** `token-maxxing-2026-09-12-admin-a11y-audit`
- **Merge status:** On branch — coordinator `tokenmax-orch-2026-09-12` owns landing; the worker
  never merges. (Accurate at time of writing: commits `935f847`, `d39052e`, `43572bd` sit on the
  worker branch only.)
- **Approx token burn:** high (est. ~1M, input-dominated) — the burn went into reading all ~40
  non-test source files of components/admin in full (16.7k lines including tests), the pattern
  sweeps, and the full 3752-test sweep. 🔥

## Context & Motivation
The 2026-09-12 token-maxxing day ran as an orchestrated fan-out: coordinator
`tokenmax-orch-2026-09-12` spawning worker sessions on per-session branches, each handed a
pre-assigned idea. This worker drew the accessibility audit of `components/admin` — a lens the
directory had never been viewed through.

The assignment's framing was deliberate. components/admin had been swept twice for dead code
(admin-optional-props, components-dead-code-a/b) and tested heavily across the 2026-09-11/12
test-writing sessions — but accessibility is orthogonal to both: dead-code sweeps ask "is it
used?", coverage sessions ask "is it verified?", and an a11y audit asks "can every user operate
it?" The brief explicitly bounded the work against audit theater: fix concrete, real issues;
do not invent speculative ones. That bar shaped everything below — most candidate findings were
dismissed on inspection, and the two that survived were both defects a keyboard or screen-reader
user would hit on ordinary flows.

Notable environment fact: the worker died twice on transient glm 429s before doing any work.
The coordinator confirmed the worktree was still clean via tmux capture and asked for a retry;
the retry ran the whole session. Nothing from the dead attempts survived (they died pre-write).

## What We Did (blow-by-blow)
1. **Read the tree in full.** All ~40 non-test source files of components/admin read end-to-end
   (16.7k lines including tests), plus mechanical pattern sweeps across the directory: aria-*/
   role attribute counts, onClick-without-onKeyDown pairs, tabIndex usage, `title=`-tooltip
   state signaling, and inventories of img/input/dialog elements.
2. **The audit's verdict: remarkably a11y-aware already.** The tree's own exemplars set the bar:
   LogTextDialog uses native `<dialog>` with explicit focus management; DialSlider and CropStudio
   build on native range inputs rather than div-scrims; CropStudio's canvas is
   `role="application"` with full keyboard support; tables carry sr-only captions;
   `aria-current`/`aria-pressed` appear with comments explaining why; PhotoGrid documents its
   contrast decisions. Most "findings" a checklist would raise here are already handled.
3. **Two real defect classes survived the bar.**
   - *Focus management.* FileExplorer: every details-pane close — clicking the pane's ×, and the
     pane unmounting after a successful remove — left the focused button unmounted and focus
     dropped to `<body>`. FolderMenu: the move and delete panels `autoFocus` nothing on open
     (create/rename always autoFocus their field), so opening them unmounts the clicked menu row
     and a keyboard operator lands on `<body>`.
   - *Async result announcement + one unnamed control.* Awaited writes across the panels commit
     or fail after the operator has tabbed away, with the result rendered in silence. Separately,
     ImageGenPanel's prompt-template textarea was the one control in the panel that neither a
     wrapping `<label>` nor the `<h3>` named.
4. **Fixed focus management (`935f847`).** FileExplorer focus hands back to the selected tile
   (found via a new `data-photo-id` attribute on PhotoGrid's tile buttons), falling back to a
   `tabIndex={-1}` focus anchor on the content pane when the selected row is gone; the effect is
   keyed on `selectedId` so a folder change never steals focus. FolderMenu: the move select gets
   `autoFocus`; the delete panel focuses Cancel — deliberately never the destructive verb.
   FileExplorer's PhotoGrid test mock was reshaped to render real per-photo tiles carrying
   `data-photo-id`, so the focus-restore path is exercised against real tiles. 4 new tests
   (2 FolderMenu `toHaveFocus`, 2 FileExplorer focus-restore), red-green verified for both
   components.
5. **Added async announcements and the accessible name (`d39052e`).** Live regions for awaited
   writes, following the repo's own stated convention rather than a foreign checklist:
   ImageGenPanel and CharacterPanel save-failure lines → `role=alert`; ImageGenTestPanel's error
   → `role=alert` and its VERDICT heading — the async output of a 78–235 s job, the feature's
   whole point — → `aria-live='polite'` on the heading alone; ShortcutTable and MemoryTable
   cell-result refusals → `role=alert` and notes → `role=status` (8 sites total); PhotoDescription,
   MediaControls, MediaAdd (failures `<ul>`), and both panes' download notices → `role=status`.
   The prompt-template textarea got `aria-label="Prompt template"`, pinned by a new role+name
   query. DialSlider's unsaved dot gained an sr-only "unsaved" label. 1 new test.
6. **Normalized the comment style (`43572bd`).** The JSX comment continuations in the three
   focus-fix files were normalized to the repo's load-bearing `*`-prefix style — the form
   `ci:client-secret-guard`'s isComment rule checks — style-only, no logic.
7. **Ran the full gate stack, all green:** the full sweep
   `npx vitest run tests components/admin --no-file-parallelism` → 192 files, 3752 tests, all
   passing (baseline before the changes: 443 admin tests green; after: 448); `npx next typegen`
   then `npx tsc --noEmit` clean (typegen first is required — PageProps errors are missing
   typegen, a known repo pattern); prettier --check clean on all touched files;
   `scripts/check-client-secret-boundary.mjs` passes.
8. **Stopped at the branch tip** — no merge, no push; the coordinator lands worker branches.

## Code / Design Details

**The focus handback, and why it's keyed on `selectedId`.** When a pane closes, the previously
focused control no longer exists. The fix moves focus to the tile of the photo the operator was
just inspecting — found in the DOM via a `data-photo-id` attribute now set on every PhotoGrid tile
button — and falls back to the content pane's `tabIndex={-1}` focus anchor when that row has been
removed. Keying the effect on `selectedId` (rather than on pane-open/close alone) is what keeps a
folder change from stealing focus: the handback runs because a *pane* closed, not because the
selection moved under an open grid.

**Delete focuses Cancel, never the destructive verb.** FolderMenu's create/rename panels autoFocus
their text field — typing is the expected next act. For the delete panel the safe default is
opposite: autofocus lands on Cancel so an impatient Enter dismisses the dialog instead of
confirming deletion. This mirrors the pattern a11y guidance recommends for destructive dialogs
and cost one line.

**Live-region granularity — the heading, not the block.** ImageGenTestPanel's verdict is the
async output of a 78–235 s job; it is the feature's whole point and must be announced. But the
job-status line under the heading changes on every poll, so a live region around the whole block
would read each poll aloud. The `aria-live='polite'` therefore sits on the verdict heading alone.

**alert vs status.** Failures (save errors, refusals) use `role=alert` — assertive, because the
operator's action did not take and they must know before navigating away. Notes and download
notices use `role=status` — polite, because nothing is being refused. This matches the
convention the repo's own code comments had already articulated (the CharacterPanel/ImageGenPanel
status lines as "the one line that changes on its own", MediaPane/FolderMenu's alerts).

**The test-mock reshape that made focus tests possible.** FileExplorer's existing PhotoGrid test
mock rendered a featureless stub, so the focus-restore path had no tile to receive focus. The mock
was reshaped to render real per-photo tiles carrying `data-photo-id`, which lets the two new
FileExplorer tests assert real `toHaveFocus` outcomes through the handback path rather than
asserting that a mock function was called.

## Decisions & Trade-offs
- **Announce on the heading alone, not the block.** Chatty announcements are their own
  screen-reader failure; the verdict heading is the one thing worth interrupting for. Trade-off:
  poll-to-poll status text changes are silent — deliberate, since the heading is the payload.
- **No `aria-live` on UploadQueue's headline — audit judgment, not an oversight.** It changes per
  file during a 300-file upload; announcing each would drown the user. The existing
  `role=progressbar` conveys progress on demand, which is the right channel for high-frequency
  progress.
- **The four "Kosongkan X" clear-button aria-labels kept as-is.** The Indonesian-verb idiom is
  repo-wide (components/nina/SessionRow.tsx carries "Kosongkan nama" with tests pinning it), so
  renaming would be second-guessing the owner's own vocabulary, not fixing drift. Screen readers
  announce it fine; consistency with the rest of the app wins.
- **FolderMenu Escape-to-close left out.** Escape currently works via ×/Cancel; wiring the key is
  an enhancement, not a defect against any criterion in the audit's four lenses.
- **PhotoGrid arrow-key roving tabindex left out.** Tab is functional today; WCAG 2.1.1
  (Keyboard) is satisfied. Roving tabindex is nicer for heavy grid users but is an enhancement
  with real implementation cost (arrow-key handling, focus memory across re-renders).
- **FolderTree's permanently-disabled root chevron left alone.** A pre-existing oddity, not an
  a11y violation — a disabled control is announced as such, and "fixing" it would change behavior
  beyond the audit's mandate.
- **The audit bar stayed at "concrete and real."** Every candidate finding was checked against
  actual usage before fixing; the five dismissals above are recorded so the next auditor doesn't
  re-litigate them from scratch.

## Follow-ups & YAGNI notes
- **The five deliberate non-fixes above are the queue-if-anyone-cares:** Escape-to-close for
  FolderMenu panels; PhotoGrid roving tabindex; UploadQueue live progress (only if a
  low-chattiness design appears); the "Kosongkan" labels (only if the owner rewords the idiom
  repo-wide); FolderTree's root chevron (only as part of a behavior review, not an a11y pass).
- **The repo's stated live-region convention now has 8 more exemplars.** Future panels should
  follow the alert-for-failures / status-for-notes / heading-alone-for-expensive-async-outputs
  pattern established here rather than reinventing the granularity question.
- **The a11y lens is cheap to re-run.** The pattern sweeps (aria-*/role counts, onClick vs
  onKeyDown, tabIndex, title= tooltips, img/input/dialog inventories) are mechanical; a future
  session could apply the same lens to components/nina (the other large component tree) in a
  fraction of this session's read budget.

## Appendix

**Commits (branch `token-maxxing-2026-09-12-admin-a11y-audit`):**
```
935f847 fix(admin): restore focus lost by pane closes and FolderMenu panels
        components/admin/FileExplorer.test.tsx  | 60 +++++-  (2 new focus-restore tests; mock reshaped)
        components/admin/FileExplorer.tsx       | 30 +++    (handback on pane close/remove)
        components/admin/FolderMenu.test.tsx    | 27 +++    (2 new toHaveFocus tests)
        components/admin/FolderMenu.tsx         | 21 ++-    (autoFocus: move select, delete→Cancel)
        components/admin/explorer/PhotoGrid.tsx |  3 +     (data-photo-id on tile buttons)
        5 files changed, 135 insertions(+), 6 deletions(-)

d39052e fix(admin): announce async results and name the unlabeled control
        CharacterPanel / DialSlider / ImageGenPanel(.test) / ImageGenTestPanel /
        MemoryTable / ShortcutTable / explorer/{MediaAdd,MediaControls,MediaPane,
        PhotoDescription,SelectionPane}
        12 files changed, 95 insertions(+), 19 deletions(-)

43572bd style(admin): star-prefix JSX comment continuations in the focus-fix files
        FileExplorer.tsx / FolderMenu.tsx / explorer/PhotoGrid.tsx
        3 files changed, 16 insertions(+), 13 deletions(-)
```

**Verification performed (all green, measured 2026-09-12 at session close):**
`npx vitest run tests components/admin --no-file-parallelism` → 192 files, 3752 tests, all
passing; admin tests 443 (baseline before the changes) → 448 (after; +5 new tests: 4 focus from
`935f847`, 1 accessible name from `d39052e`); `npx next typegen` then `npx tsc --noEmit` clean
(typegen must precede tsc — PageProps errors are missing typegen, a known repo pattern);
prettier --check clean on all touched files; `scripts/check-client-secret-boundary.mjs` passes.

**Key evidence locations:** `components/admin/FileExplorer.tsx` (the focus handback and its
`selectedId` keying); `components/admin/FolderMenu.tsx` (autoFocus on the move select; delete
focusing Cancel); `components/admin/explorer/PhotoGrid.tsx` (`data-photo-id` on tile buttons);
`components/admin/ImageGenTestPanel.tsx` (the polite verdict heading); `components/admin/DialSlider.tsx`
(the sr-only unsaved marker); `components/admin/ImageGenPanel.tsx` (the named textarea).

**Session identity:** worker session `tokenmax-admin-a11y-audit`, spawned by coordinator
`tokenmax-orch-2026-09-12` on 2026-09-12 (fan-out run); branch
`token-maxxing-2026-09-12-admin-a11y-audit`; final commit `43572bd`; NOT merged at time of
writing — the coordinator owns the landing. The worker died twice on transient glm 429s before
starting; the coordinator confirmed a clean worktree via tmux capture and the retry ran the
whole session.
