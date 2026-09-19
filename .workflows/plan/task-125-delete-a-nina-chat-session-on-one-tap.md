# task-125 — Delete a Nina chat session on one tap, with no confirmation panel

**Card**: [#125](https://github.com/miftahulmahfuzh/run-insights/issues/125) · round 1
**Branch**: `task/125-delete-a-nina-chat-session-on-one-tap` off `origin/main` @ `bb2d19a952c3`
**Touches**: `lib/nina/.workflows/package_readme.md` (only)

## The ask

Card #125 asks for exactly what task #136 (PR #137, merged) already shipped: the Nina sidebar's
`⋯ → Hapus → Hapus chat` three-tap confirm becomes `⋯ → Hapus`, firing `removeNinaChatSession`
directly with `RowMode` losing its `'remove'` member, and the reversal recorded in
`SessionRow.tsx`'s header docstring rather than silently deleted.

`git log` shows #136 predates this card's filing date only in merge order, not intent — #125 was
opened 2026-09-07 and evidently never closed once #136 landed the same change. This round is a
verification pass plus a sweep of one leftover reference, not a re-implementation.

## What #136 already did (verified against the current tree, not assumed)

- `components/nina/SessionRow.tsx`: `RowMode` is `'idle' | 'menu' | 'rename'` — no `'remove'`.
  The menu's `Hapus` button calls `remove()` → `removeNinaChatSession` directly. The header
  docstring carries a full section, **"R11 DELETES ON THE TAP, AND THE CONFIRMATION PANEL THAT
  WAS HERE IS GONE"**, replacing the four-properties argument for the old panel with the new
  ruling — exactly the "replace, don't delete silently" instruction the card gave.
- `components/nina/NinaJobActions.tsx:143-145`: already says *"`SessionRow`'s R11 lost its
  confirmation to #136 and now does the same"* — the stale "the right call there and the wrong
  one here" framing the card asked to fix is gone.
- `lib/nina/jobActions.ts`: its header already reads *"Task #136 has since taken the confirm out
  of `SessionRow` too, on this same instruction"*.
- `lib/db/schema/nina/chat.ts:186-190` (this is where `lib/db/schema.ts:702` moved to, in an
  earlier schema-split task — the card's line number had drifted): already reads *"Task #136 has
  since removed that panel too, but the asymmetry it named is still the one that matters here"*.
- `grep -rn "remove"` under `tests/` and `components/nina/SessionRow.test.tsx` show no test
  driving a `'remove'` mode — the test file was already updated with the rest of #136.

## The one thing that hadn't been swept

`lib/nina/.workflows/package_readme.md` item 11 (line 175, drifted from the card's cited
844/988 — the file has been rewritten since) still read the old panel as live and current:

> `SessionRow`'s three-tap confirm is deliberately not the precedent: it hard-deletes a
> conversation with no undo; these controls cost a capped generation or write a reversible flag.

Fixed to match the phrasing every other sibling file already converged on: the panel is gone
(task #136, same instruction), and the stakes that motivated skipping it here are unaffected —
`SessionRow`'s delete still has no undo, `/nina/jobs`'s controls still cost a capped generation
or write a reversible flag.

## Approaches considered

| | Convention | Scope | Verifiability | Reversibility |
|---|---|---|---|---|
| **A. Verify #136 covers the ask; fix the one stale doc reference** | matches how every sibling file already phrases the reversal | smallest change — nothing here is unimplemented | `grep` for `three-tap`/`R11` plus a read of every file the card named | one line, one commit |
| B. Re-implement `SessionRow.tsx` from the card's description, ignoring history | — | duplicates #136's diff for no reason | typecheck would pass on dead-identical code | — |
| C. Close the card as a duplicate with no code change | — | leaves a genuinely stale doc line in the tree | can't be verified against the card's own "sweep" instruction | — |

**B** would silently re-author work already reviewed and merged under #136 — the exact
two-provenances problem the task loop exists to avoid, and it would touch `RowMode`,
`SessionRow.tsx`'s docstring and `NinaJobActions.tsx` for zero behavioural change.

**C** ignores the card's own "grep before finishing" instruction, which is there specifically to
catch a leftover reference like the one this round found and fixed.

**A** is the only approach that is both minimal and honest about what #136 already delivered.

## Verification

- `grep -rn "three-tap\|R11" components/ lib/ app/` — the remaining hits are either the
  requirement-code sense of "R11" (unrelated to this card) or prose that already states the panel
  is gone; none argues the old panel is still current.
- `npm run typecheck`, `npm test`, and the full CI gate run in `land`'s step, since the actual
  code path (`SessionRow.tsx`) is unchanged this round and the only diff is prose in a markdown
  file.
