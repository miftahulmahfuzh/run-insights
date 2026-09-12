# Token-Maxxing Session — 2026-09-12: Nina Actions Split

## 🎯 Achievement / End Result
- **Goal of the burn:** The coordinator's (`tokenmax-orch-2026-09-12`) pre-assigned idea,
  verbatim: *"Split lib/nina/actions.ts (1667 lines) into per-concern Server Action
  modules behind a barrel. Why: safe to restructure now since today's nina-actions-yagni
  session just swept it to zero dead-code findings."* Worker mode — no Step-4 menu; the
  idea arrived chosen, and its premise was fresh: a same-day sibling session had just
  certified the file carried no dead weight, so every line moved would be a line still
  wanted.
- **Concrete changes:** Three commits on `token-maxxing-2026-09-12-nina-actions-split`:
  - `a125813` — refactor(nina): the split itself. `lib/nina/actions.ts` (1667 lines)
    becomes `lib/nina/actions/` — six per-concern modules plus a strict barrel, the
    public specifier `@/lib/nina/actions` unchanged, so `ChatScreen`, `Composer`, and
    every test suite that mocks or `typeof import`s the path needed **zero caller
    changes**, and no new runtime export (invariant 4: no new POST endpoint). Same
    commit repoints `scripts/check-llm-payload-boundary.mjs` and the source-as-text
    guard in `tests/nina.turnrevive.test.ts`.
  - `57371d0` — docs(nina): ~107 path-citation repairs across 43 files (32 lib,
    6 tests, 3 components, 1 scripts, 1 app) pointing at the removed
    `lib/nina/actions.ts`.
  - `c0302f3` — docs(nina): the 5 citations the first sweep pass missed
    (`jobActions.ts`, `messageActions.ts`, `sessionActions.ts`, `turnrevive.ts`, and
    the `tests/integration/ninaImageE2E.int.test.ts` banner line) — caught by the
    final exhaustive grep gate, not by the first sweep's list.
- **The resulting shape** (line counts measured post-split):
  | Module | Lines | Directive | Exports |
  |--------|-------|-----------|---------|
  | `actions/send.ts` | 1063 | `'use server'` | `sendNinaMessage`, `SendNinaMessageResult`, `NinaAttachExisting`, `REFUSED`, `ResolvedNinaAttachment`, `resolveAttachment`, `perceptualTwinsForClaims` |
  | `actions/resend.ts` | 254 | `'use server'` | `resendNinaMessage`, `NinaResendRefusal`, `ResendNinaMessageResult` |
  | `actions/poll.ts` | 142 | `'use server'` | `pollNinaReply`, `NinaReplyPoll` |
  | `actions/describe.ts` | 140 | `'use server'` | `describeNinaImage` + its three types (`NinaDescribeFailureReason`, `NinaDescribeImageInput`, `NinaDescribeImageResult`) |
  | `actions/duplicateCheck.ts` | 62 | `'use server'` | `findNinaDuplicateChatImage` |
  | `actions/startTurn.ts` | 45 | **none** | `startNinaBackgroundTurn` — the shared `after()` seam |
  | `actions/index.ts` | 47 | none | plain barrel re-exporting exactly the pre-split public name set |

  Total 1753 vs the original 1667 — the +86 is per-module docstring headers, not code;
  code moved verbatim. The only wording edits are where a comment's claim about the
  file's own shape became false (the startTurn docstring's "in the `'use server'`
  module" clause, resend's boundary-guard sentence).
- **Real value delivered:**
  - **The repo's largest Server Action file is now six navigable concerns** without a
    single caller edit. The public address survived the split on purpose: a barrel that
    re-exports the old name set means the split is invisible to the client graph, which
    is what made a 1667-line file safe to restructure mid-day with nine sibling workers
    running.
  - **Invariant 4 held and is enforced, not just claimed.** No new runtime export means
    no new POST endpoint — the barrel's own docstring states the counting argument and
    the gates check it: five test suites do `typeof import('@/lib/nina/actions')`
    against the re-exported set (typecheck fails if a name is missing or added), knip
    fails if an export went stale, and `next build` compiles both graphs so a broken
    server reference fails at build time, not in production.
  - **The `'use server'` directive placement is a deliberate, documented decision.**
    Directives live in the implementation modules; the barrel itself stays plain. Two
    subtle facts make this work and both are now written down in the barrel's header:
    the re-export chain preserves action references in the client graph (the reference
    is created by the directive module's transform; the barrel only hands it on), and
    `startNinaBackgroundTurn` must sit OUTSIDE any `'use server'` module because a
    non-async export behind the directive would not even compile — the compiler error
    is the feature that keeps the `after()` seam from ever becoming an endpoint.
  - **The boundary guard survived the split correctly.** All four entries sanctioning
    the old file now sanction the module that inherited the concern
    (`describeNinaImage` → `actions/describe.ts`; `runNinaTurn` /
    `distillNinaMemory` / `titleNinaSessionIfNeeded` → `actions/startTurn.ts`), and the
    guard's prose that named the dead path now names `lib/nina/turnrun.ts` — where the
    calls actually run. **All 9 guarded symbols still confined** (9/9 green).
  - **A source-as-text test updated the right way.** `tests/nina.turnrevive.test.ts`'s
    invariant guard read `lib/nina/actions.ts` as text and broke on the old path — the
    known source-as-text trap. The fix walks EVERY module in `actions/` via
    `readdirSync` for `runNinaBackgroundTurn` declarations (so no concern module can
    quietly grow its own runner copy either) and pins the `SentBubble` re-export to the
    barrel — strictly stronger than the single-file check it replaced.
  - **~107 stale citations repaired, stale line numbers dropped rather than recomputed.**
    Module+symbol citations were repointed to the inheriting module; numeric line
    references were dropped instead of translated, because several were already stale
    pre-split — e.g. `page.tsx` cited `:2016` on a file that was 1667 lines long. The
    sweep's final exhaustive grep gate caught 5 survivors the first pass missed, and
    they became `c0302f3`.
  - **All gates green on the post-split tree:** `npm run typecheck` (next typegen +
    tsc) clean; full vitest sweep **292 files / 5386 tests passing**; `npm run knip`
    exit 0 with no new findings; `node scripts/check-llm-payload-boundary.mjs` 9/9
    confined; `npm run build` — real Turbopack, after replacing the symlinked
    node_modules with a real npm install (the symlink passes vitest+tsc but Turbopack
    rejects it) — exit 0. The build is the proof the barrel preserves Server Action
    references in both graphs.
- **Branch:** `token-maxxing-2026-09-12-nina-actions-split` (worktree
  `tokenmax-2026-09-12-nina-actions-split`), head `c0302f3`.
- **Merge status:** on branch — the coordinator owns landing; this session must not
  merge, push, or amend.
- **Approx token burn:** no meter was read; by shape this was a mid-to-heavy worker
  session whose spend is split between a mechanical-but-paranoid refactor (every moved
  symbol re-checked against its new module's directive rules), a ~107-site citation
  sweep with a two-pass gate, and the full gate battery including a real npm install to
  make the Turbopack build meaningful. The tokens bought an invisible refactor: a
  1667-line file became six modules and nothing that imports it noticed. 🔥🔥

## Context & Motivation
`lib/nina/actions.ts` was the Nina chat's everything-file: send, resend, poll,
duplicate-check, image description, and the background-turn seam, 1667 lines in one
`'use server'` module. It had grown by accretion across the phased Nina build-out, and
every concern inside it shared one header, one set of imports, and one public address.

The timing was the coordinator's insight, not this session's: the same day, the
nina-actions-yagni session swept all of `lib/nina` to zero knip findings. A file just
certified to contain zero dead lines is the one file where "move code verbatim" is a
safe claim — nothing moved would turn out to be unwanted. Restructure and dead-code
work fight each other when interleaved; sequenced sweep-then-split, they compound.

Worker mode: this was one of nine parallel workers under `tokenmax-orch-2026-09-12`.
Five files were declared off-limits mid-sweep by the coordinator — `lib/db/schema.ts`,
`lib/admin/ninaAlbumActions.ts`, `lib/nina/queries.ts`, `lib/nina/vision.ts`,
`lib/admin/chatPhotoActions.ts` — because sibling workers (db-schema-split,
admin-album-actions-split) own them and a citation sweep into their docstrings would
have collided with their splits. The handback is part of the record (see Follow-ups).

## What We Did (blow-by-blow)
1. **Read the whole file and drew the concern boundaries first.** Six concerns fell out
   of the file's own structure: the send path (the giant — attachment resolution and
   the perceptual-twin claim check live here because they are send's pre-flight), the
   duplicate check, the resend path, the reply poll, the image description, and the
   background-turn seam.
2. **Decided the directive placement before moving anything**, because `'use server'`
   is the one thing that cannot be added casually. Each concern module that holds a
   callable action got the directive; the barrel got none; `startTurn.ts` got none —
   see Decisions for why that asymmetry is load-bearing.
3. **Moved code verbatim into the six modules.** No signature changes, no
   simplifications, no import hoisting beyond what the new module boundaries forced.
   The only wording edits were to comments whose claims became false about the file's
   own shape: startTurn's docstring said the runner lived "in the `'use server'`
   module", and resend's boundary-guard sentence described a single-file layout.
4. **Wrote the barrel as a strict re-export of exactly the pre-split public name set**,
   with a header documenting the counting argument (every re-exported runtime name must
   have existed pre-split; none may be added), why helpers stay module-private
   (`resolveAttachment`, `perceptualTwinsForClaims`, `REFUSED`, `resendRefused` are not
   endpoints and must never become them), and why `SentBubble` re-exports here as a
   type-only export (a client component imports it from this address; a client bundle
   cannot touch a `'server-only'` module; type-only exports are erased at compile time).
5. **Repointed the payload-boundary guard.** `scripts/check-llm-payload-boundary.mjs`
   sanctioned the old file for four guarded symbols; each entry now sanctions the
   inheriting module, each with a dated comment explaining the move and naming the
   `after()` seam chain (chat actions → `actions/startTurn.ts` → `runNinaBackgroundTurn`
   in `lib/nina/turnrun.ts`). Prose entries that described the old path as the run site
   now name `turnrun.ts`, the real run site.
6. **Fixed the source-as-text guard in `tests/nina.turnrevive.test.ts`.** The old
   assertion read one file and asserted two things about its text. The new one
   enumerates every module in `actions/` with `readdirSync`, asserts NONE declares
   `runNinaBackgroundTurn`, and keeps the `SentBubble` barrel pin — a stronger check
   that survives future concern-module additions.
7. **Ran the citation sweep in two passes.** Pass one repointed ~107 docstring
   references across 43 files, applying the rule: module+symbol citations get repointed
   to the inheriting module; numeric line references get DROPPED, not recomputed —
   several were already stale before the split (`page.tsx` cited `:2016` on a 1667-line
   file), so recomputing would have laundried pre-existing drift into post-split
   precision. The final exhaustive grep gate then found 5 survivors the pass-one list
   had missed (`jobActions.ts`, `messageActions.ts`, `sessionActions.ts`,
   `turnrevive.ts`, and the `ninaImageE2E.int.test.ts` banner), fixed in `c0302f3`.
8. **Handed back five files mid-sweep on the coordinator's order.** The sweep's file
   list included docstrings inside `lib/db/schema.ts`, `lib/admin/ninaAlbumActions.ts`,
   `lib/nina/queries.ts`, `lib/nina/vision.ts`, and `lib/admin/chatPhotoActions.ts` —
   all five owned by concurrent sibling workers. Their citations (a fresh word-boundary
   grep on 2026-09-12 measures 18 occurrences: `queries.ts` 8, `chatPhotoActions.ts` 5,
   `ninaAlbumActions.ts` 2, `vision.ts` 2, `schema.ts` 1; the handback ledger said 17 —
   the delta is one occurrence counted differently, both counts name the same five
   files) still name the dead path and are on those workers' ledgers, not this one.
9. **Ran the full gate battery.** `npm run typecheck` (typegen + tsc) clean → full
   vitest sweep 292 files / 5386 tests passing → `npm run knip` exit 0, no new findings
   → `node scripts/check-llm-payload-boundary.mjs` 9/9 confined → **real** `npm
   install` to replace the symlinked node_modules (the symlink passes vitest+tsc but
   Turbopack rejects it — the build is the gate that catches it) → `npm run build`
   exit 0. The build is the split's real proof: Server Action references survive the
   re-export chain in both the server and client graphs, and a broken one fails the
   build rather than production.

## Code / Design Details
**The barrel's counting argument, in the barrel's own words** (`actions/index.ts`
header, abridged):

> Invariant 4 is a counting argument, and it is checked here: the runtime exports of a
> `'use server'` module are public POST endpoints, so every name this file re-exports
> must have been exported by the pre-split file, and no name may be ADDED.

This is the whole safety story of the split in one sentence: the public surface was
frozen, the gates enforce the freeze, and everything else is internal rearrangement.

**The directive asymmetry** — why the barrel and `startTurn.ts` stay directive-free:

- `'use server'` at module top turns every export into an HTTP-reachable endpoint.
  Directives therefore live only in modules whose exports are ALL meant to be
  endpoints.
- The barrel re-exports actions but carries no directive itself — it does not need
  one: the server reference is created by the directive module's transform, and a
  plain re-export hands that reference on unchanged. `next build` proves this holds in
  both graphs.
- `startNinaBackgroundTurn` is not async (it schedules via `after()` and returns
  void), and a non-async export behind `'use server'` does not compile. That compiler
  refusal is deliberately kept in the path: the turn seam must never accidentally
  become callable from the client, and the language now enforces what a comment alone
  could not.

**The source-as-text guard, after** (`tests/nina.turnrevive.test.ts`):

```ts
const actionModules = readdirSync('lib/nina/actions').map((name) => `lib/nina/actions/${name}`)
expect(actionModules.length).toBeGreaterThan(0)
for (const path of actionModules) {
  expect(readFileSync(path, 'utf8')).not.toMatch(/function runNinaBackgroundTurn\(/)
}
```

Enumeration instead of a hardcoded file list: a future eighth concern module is
covered the day it appears, with no test edit.

**The citation sweep rule** — the reusable part:

- `lib/nina/actions.ts:143-192` (module + line range) → repoint the module, DROP the
  range: `resolveAttachment` in `lib/nina/actions/send.ts`.
- Bare module mentions (`actions.ts does the cast`) → repoint to the inheriting
  module.
- Numeric-only references were never recomputed. A pre-split-stale `:2016` on a
  1667-line file is evidence the number was already decoration; translating it would
  have manufactured false precision.

## Decisions & Trade-offs
- **Barrel over direct specifier updates.** Updating ~40 callers to import from
  per-concern paths would have made the split visible, reviewable, and conflict-prone
  across nine running workers. The barrel costs 47 lines and one indirection and buys
  zero caller churn. If a future session wants per-concern public paths, that is an
  additive, conflict-free follow-up.
- **`startTurn.ts` outside the directive.** The tempting layout puts all six concerns
  under `'use server'` uniformly. The uniform layout is wrong twice: it would not
  compile (non-async export), and if it DID compile it would publish the turn seam as
  an endpoint — invariant 4's exact violation. The asymmetry is the design.
- **Helpers stayed module-private, not barrel-exported.** `resolveAttachment`,
  `perceptualTwinsForClaims`, `REFUSED`, `resendRefused` are pre-flight machinery.
  Exporting them from the barrel would have widened the runtime surface — one new POST
  endpoint each. They are importable directly from their modules where a test genuinely
  needs them, which keeps invariant 4 clean while leaving the door open.
- **Stale line numbers dropped, not recomputed.** Recomputation would have been
  faithful to the new tree and a lie about history: several citations were wrong before
  the split ever touched them. Dropping keeps module+symbol citations (which survive
  edits) and sheds the numbers (which never do).
- **The five contested files stayed untouched, on order.** Fixing 18 citations in
  files a sibling worker is actively splitting trades a one-line docstring edit for a
  mid-air collision. The compliant move is the handback: the citations are on the
  owning workers' ledgers, and their splits will repoint citations as they move the
  same code anyway.
- **The turnrun provenance markers stayed.** `lib/nina/turnrun.ts` carries "MOVED
  VERBATIM from lib/nina/actions.ts" markers. They describe the past, and the past
  happened — rewriting provenance to spare a reader one hop through git history makes
  the history harder to reconstruct, not easier.

## Follow-ups & YAGNI notes
- **The contested files' stale citations (owned elsewhere).** A fresh word-boundary
  grep on 2026-09-12 in THIS worktree measures 18 occurrences of the dead path across
  the five handed-back files: `lib/nina/queries.ts` 8, `lib/admin/chatPhotoActions.ts`
  5, `lib/admin/ninaAlbumActions.ts` 2, `lib/nina/vision.ts` 2, `lib/db/schema.ts` 1.
  Whoever lands each file's split owns its citations; do not repoint them from a
  session that doesn't own the file.
- **Pre-existing comment drifts noticed, deliberately not fixed (they predate this
  session):**
  - `lib/nina/turn.ts:34` claims the action "returns `{ unavailable: true }`" — the
    action's actual declared contract is `SendNinaMessageResult`
    (`ok` / `userMessageId` / `sessionId` / `cursor` / `turnId`; verified against the
    interface post-split; no top-level `unavailable` field exists). The prose
    predates the poll-based contract.
  - `lib/admin/ninaAlbumActions.ts:524` cites `actions.ts:782` as scheduling
    distillation — distillation moved to the turnrun path long ago (the guard script's
    own dated comment records the nina-offline-reply phase 2 move), so the citation is
    doubly stale: wrong file, wrong era. It is also among the contested citations
    above.
- **Per-concern public paths, if ever wanted,** are additive: export the modules'
  specifiers alongside the barrel and migrate callers at leisure. Never needed for
  correctness — the barrel is stable.
- **Deliberately NOT done:** no signature changes to any moved export; no helper
  hoisted into a shared util module (each helper has exactly one consumer concern);
  no `index.ts` re-export of the private helpers; no touching the five contested
  files; no merge/push (coordinator owns landing).

## Appendix
- **Commits (branch `token-maxxing-2026-09-12-nina-actions-split`, head `c0302f3`):**
  - `a125813` refactor(nina): split lib/nina/actions.ts into per-concern action
    modules behind a barrel — the split, the guard-script repoint, the turnrevive
    source-as-text guard update.
  - `57371d0` docs(nina): repoint ~107 path citations from the removed
    lib/nina/actions.ts to the split modules — 43 files (+90/−88): 32 lib, 6 tests,
    3 components, 1 scripts, 1 app.
  - `c0302f3` docs(nina): sweep the five path citations the first pass missed —
    `lib/nina/jobActions.ts`, `lib/nina/messageActions.ts`, `lib/nina/sessionActions.ts`,
    `lib/nina/turnrevive.ts`, `tests/integration/ninaImageE2E.int.test.ts`.
- **Module inventory with measured line counts:** see the table in Achievement.
  Concern mapping for citations: `describeNinaImage` → `actions/describe.ts`;
  `resolveAttachment`, `perceptualTwinsForClaims`, send-path types →
  `actions/send.ts`; resend path → `actions/resend.ts`; `pollNinaReply` →
  `actions/poll.ts`; `findNinaDuplicateChatImage` → `actions/duplicateCheck.ts`;
  turn scheduling → `actions/startTurn.ts`; turn EXECUTION stays `lib/nina/turnrun.ts`
  (it never lived in actions.ts — the old citations that named actions.ts as the run
  site were already loose prose).
- **Guard script mapping (all 9 symbols confined post-split):** `describeNinaImage` →
  sanctioned in `actions/describe.ts`; `runNinaTurn`, `distillNinaMemory`,
  `titleNinaSessionIfNeeded` → sanctioned in `actions/startTurn.ts`; run-site prose →
  `lib/nina/turnrun.ts`.
- **Gates:** typecheck clean; vitest 292 files / 5386 tests passing; knip exit 0 (no
  new findings); llm-payload boundary 9/9 confined; real-install `npm run build`
  (Turbopack) exit 0 — the client-graph server-reference proof.
- **Session context:** `/token-maxxing --worker` run, coordinator
  `tokenmax-orch-2026-09-12`, 9 workers; idea pre-assigned; five-file handback
  ordered mid-sweep to keep the citation sweep out of the db-schema-split and
  admin-album-actions-split workers' files.
