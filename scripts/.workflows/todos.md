# Todos: scripts

**Package Path**: `scripts`
**Package Code**: SC
**Last Updated**: 2026-09-07
**Total Active Tasks**: 1

## Quick Stats
- P0 Critical: 0
- P1 High: 1
- P2 Medium: 0
- P3 Low: 0
- P4 Backlog: 0
- Blocked: 0
- Completed: 0

---

## Active Tasks

### [P1] High

- [x] **P1-SC-A000** Phase 4: Import the ledger's shortcuts
  - **Difficulty**: NORMAL
  - **Type**: Feature
  - **Context**: Owns a new `scripts/nina-shortcuts-import.mjs`; one `package.json` `scripts` entry, `nina:shortcuts-import`; and a new `tests/nina.shortcutsImport.test.ts` driven by the real production strings as fixtures — every shortcut-shaped row, every genuine fact that must **not** match, and two mid-sentence-`artinya` decoys, **per-string assertions only, no total asserted**. Three files. Does not touch anything under `lib/`, `app/`, `components/`, `drizzle/` or `tests/` other than its own new file. Four grammars tried A → B → C → D, all anchored and all case-insensitive, defined **only** in `.workflows/plan/nina-emoji-shortcuts/phase-4.md` §D2 (the authority): A is `… nina [harus] bilang …`, B the `bakal` variant prod contains, C `<T>artinya …`, D `<T>ini posisi …`; the first that parses **cleanly** wins, because stopping at the first *structural* match misreads the `🫦` row. Two corrections not to reintroduce: the alternation is `(?:kalo|kalau)`, **parenthesised**; and grammars C and D take `\S+?` for the trigger, not a lazy `[\s\S]*?`. Normalisation is phase 1's `normalizeNinaTrigger` — the same function, not a copy. A row matching no grammar is left alone and reported; the genuine facts in production must survive untouched. **Dry run is the default**, per `scripts/blob-reap.mjs` and `scripts/nina-memory-reap.mjs`: no flag prints what would be imported and what would be skipped and why, writing nothing; `--apply` inserts into `nina_shortcuts` idempotently on `(user_id, match_key)` via its own `onConflictDoNothing`, leaving the ledger intact; `--prune` is **only valid with `--apply`** and deletes only ledger rows whose shortcut is confirmed present after the insert, by id, never by pattern. `label` is the first ~60 characters of the expansion trimmed at a word boundary — a placeholder the admin rewrites on `/admin/shortcuts`, and the script says so. Exit: run against production with no flag, the output names every importable row and every skipped one with a reason each — **no count hard-coded anywhere**, in the script, the test or these criteria, because the ledger is live and moved during the analysis; the parser's test passes per string on the real production fixtures, both the ones that must parse and the ones that must not; `npm run lint`, `npm run typecheck` and `npm test` green.
  - **Status**: completed
  - **Plan Set**: `NINA_EMOJI_SHORTCUTS_PLAN.md` (phase 4 of 4)
  - **Satisfies**: R3 — The shortcut-shaped rows already in the production memory ledger carry over into the new mechanism instead of being retyped
  - **Depends on**: `P1-DB-A004`
  - **Plan**: `.workflows/plan/P1-SC-A000.md`

### [P2] Medium

### [P3] Low

### [P4] Backlog

---

## Completed Tasks
