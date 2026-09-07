# task-135 — Remove confidence from Nina's memory pipeline

**Card**: [#135](https://github.com/miftahulmahfuzh/run-insights/issues/135) · round 1
**Branch**: `task/135-remove-confidence-from-nina-s-memory` off `origin/main` @ `a92780fe`
**Touches**: `lib/db/schema.ts`, `drizzle/0011_*`, `lib/nina/{memory,distill,tools,gateway,queries,tuning}.ts`,
`lib/nina/prompts/distill.ts`, `lib/admin/{schema,memoryActions,memoryStore,memoryVocab,memoryModel}.ts`,
`components/admin/MemoryTable.tsx`, `scripts/nina-memory-reap.mjs`, four test files

## The ask

> "make it simpler. make the whole process has no confidence. just extract some important
> information during interaction, with no confidence."

Remove `confidence` from Nina's memory pipeline — schema, prompt, gating, actions and UI. The
admin **Memory** table's `Conf.` column goes with it, because the column is only the visible end
of the field.

**Not re-litigated.** An earlier session argued confidence is live logic rather than decoration
and locked a predecessor requirement to UI-only on that basis. The user overruled it. The
argument was correct and is now moot: the point is a simpler pipeline, and losing the gating is
the accepted cost. This plan designs the simplification, not the justification.

## Approaches considered

Scored against the repo, not against taste.

| | **A — drop the field everywhere** | B — keep the column, stop reading it | C — replace it with an `inferred` boolean |
|---|---|---|---|
| **Convention** | ✅ leaves one gate: the verbatim quote | ❌ a `NOT NULL` column with no reader is precisely the landmine this repo's docstrings exist to prevent | ⚠️ the same gate under a new name |
| **Scope** | ✅ exactly the card | ❌ "no confidence" is not satisfied by a column that still exists | ❌ widens the card — a rename, not a removal |
| **Verifiability** | ✅ typecheck + the suite + rewritten gating tests | ✅ | ✅ |
| **Reversibility** | ⚠️ one commit; the column's *values* are unrecoverable | ✅ nothing to undo | ⚠️ one commit |

**A wins.** B and C both lose on the user's own words.

- **B loses** because a dead column needs a docstring explaining why it is there, and the next
  session reads that as evidence the field is live. This repo deletes orphans on sight — the same
  reasoning that condemned `countNinaSessionMessages`, an exported query with no callers.
- **C loses** because a model self-reporting a boolean is the same model self-report as a model
  self-reporting a percent. The repo has already ruled on the class of signal:
  `docs/plans/F05-review-correction.md:59` — *"self-reported model confidence does not exist here …
  so it cannot be the ranking signal."* C is also exactly the re-litigation the card forbids.

**On dropping the data rather than keeping it:** the only argument for keeping the column was that
existing rows carry real values a future feature might want. Those values are one of three things
— `100` (he said it outright, or she asserted it through her own tool schema), `40` (the unverified
ceiling), or a model's guess. The first two are recoverable from `source` and the quote gate; the
third is the signal the F05 ruling above already rejected. The fact *text* is retained in full, so
nothing a future feature could act on is lost.

## Scope: the narrowest reading

**In scope** — the `confidence` concept inside Nina's memory pipeline, end to end:
the DB column, the distiller's tool schema and prompt section, the candidate Zod schema, the two
constants, the planner's fact/slot shapes, the gateway and query layers, the four `lib/admin/`
modules, the admin table's column and both inputs, the reap script's `SELECT`, and the four test
files that assert on the field.

**Explicitly out of scope, and why:**

- **`lib/nina/persona.ts:272`** — *"Answer with the confidence of somebody who does this for a
  living"*, in her persona prompt. The English word, describing her manner. Not on the card's
  list; found by the closing sweep.
- **`lib/review/checks.ts`, `components/charts/VolumeTrendChartInner.tsx`,
  `components/review/ConsistencyBanner.tsx`** — the same English word, a different feature. F05's
  review screen derives *its* confidence from arithmetic over extracted run fields; it has no
  relationship to `nina_memory_facts` and nothing here reads it.
- **The quote gate itself.** "Entirely" could be read as taking §6's `verifyQuote` with it, since
  the file's own header couples the two ("§6's quote gate, **and** `SLOT_CONFIDENCE_FLOOR`"). That
  reading loses: the card names `verified` as the surviving gate, and the honest-memory invariant
  the header is defending — *she may not hold a standing memory of something he did not say* — is
  carried by the quote check alone. Removing both would leave no gate at all, which is a different
  card nobody wrote.
- **`docs/plans/**` and `.workflows/plan/**`.** A plan file records what was planned at the time.
  Rewriting history to match the present destroys the record.

## The behaviour that disappears, and what replaces each

Two behaviours die with the field. Both are recorded here rather than quietly dropped.

### 1. `SLOT_CONFIDENCE_FLOOR = 80` (`lib/nina/memory.ts:805`)

Gated promotion of a candidate into a standing slot; below it the candidate was demoted with
`reason: 'low-confidence'`. **Replacement: nothing — `verified` is the whole gate.**

The order in `proposeSlot` is what makes this cheap. `!verified → 'unverified-quote'` already ran
*before* the confidence check, so the only candidates the floor ever rejected were ones whose quote
**did** check out. In other words, the floor's entire remaining job was to catch a fact whose quote
is a verbatim span of his message but whose `text` is an inference drawn from it.

That case is real and it is losing a guard. `tests/nina.memory.test.ts:418` is exactly it:
quote `"sepatu gw udah tipis banget"` (verbatim, verified) producing text
`"Sepatunya mungkin Nike."` (an invention) at confidence 60. **After this change that fact is
promoted to the `gear` slot.** That is the accepted cost of "no confidence", and the test is
*rewritten to assert the new behaviour* rather than deleted, so the reversal is on the record in
the suite where a later session will actually meet it.

The `'low-confidence'` member of `DemotedWrite['reason']` goes with the check.

### 2. `UNVERIFIED_CONFIDENCE_CEILING = 40` (`lib/nina/memory.ts:808`)

Capped an unverified claim, and doubled as the confidence of the `'other'` fact recorded for an
unverified promise (`:1216`). Its stated job — *"an unverified fact must never become a standing
fact"* — **was never actually done by the number.** It is done by
`if (!verified) demoted.push({ reason: 'unverified-quote' }); return` two lines earlier, which
already refuses the slot outright. The ceiling only ever decorated the ledger row that got written
instead. So the invariant survives untouched and the number is pure loss of a decoration.

## Decisions

| # | Fork | Chosen | Why |
|---|---|---|---|
| **D1** | Drop the column, or keep it and stop reading it? | **Drop.** A newly generated migration, `0011`. | The card's own default, and see "Approaches" above. `0011` is the next free index — `origin/main` @ `a92780fe` already carries `0009_nina_message_photo_only` and `0010_nina_image_provenance`. |
| **D2** | How is the migration produced? | `npm run db:generate`, and the generated SQL is committed **as generated**. Never hand-edited, never renamed. | A renamed migration is skipped silently by the runner. Regeneration also silently drops hand-written backfills — there are none here (the drop needs no backfill), which is checked by reading the generated file before committing, not assumed. |
| **D3** | `verifyQuote`'s result is now the only thing `proposeSlot` needs beyond the value. Keep the four-parameter signature? | **No — `proposeSlot(key, raw, verified)`.** A parameter every caller passes a constant to is not a parameter. | Both call sites become honest: hers passes `true` (she asserted it through a tool schema), the distiller's passes `verifyQuote(...)`. |
| **D4** | `PlannedFact.confidence` and `addFact`'s third argument | Both removed. `addFact(category, text)`. | Nothing downstream can consume the number once the column is gone; keeping it in the pure planner's output type would be a value with no destination. |
| **D5** | The prompt's `CONFIDENCE` section (`prompts/distill.ts:90-91`) | Section deleted. The quote paragraph at `:88` is **reworded**, not deleted: "recorded at low confidence and can never become a standing fact" becomes a statement that the entry is dropped as a slot. | A prompt that threatens a consequence the code no longer has is a prompt that has started lying to the model. The threat still needs to exist — the quote gate is now the *only* thing keeping her memory honest, so its teeth get *more* emphasis, not less. |
| **D6** | `lib/db/schema.ts:1754` and `lib/nina/tuning.ts:69` cite this column as the integer-percent precedent | Both re-pointed at **`nina_model_calls.cost_micro_usd`** (`lib/db/schema.ts:561`) — an integer in millionths of a dollar. | The card is right that a deletion alone would leave two docstrings citing a column that does not exist. `cost_micro_usd` is the same smallest-sensible-unit rule (roadmap D5) applied to money, which the docstring there already calls "where float drift is least forgivable" — a strictly stronger precedent than the one being retired. |
| **D7** | `tests/nina.distill.test.ts:53`'s `BAD_PAYLOAD` is `confidence: 'high'` — its whole purpose is to be schema-invalid | **New rejection shape: omit `quote`.** The assertion at `:95` moves from `'facts.0.confidence'` to `'facts.0.quote'`. | Not listed on the card, and it fails *silently* rather than loudly: a Zod object strips unknown keys, so once the field is gone `{text, category, confidence:'high'}` **parses clean** and the repair round-trip test starts asserting nothing. `quote` is the right replacement — it is `required` in the tool schema and is now the pipeline's only gate, so "the model forgot the quote" is the malformation most worth exercising. |
| **D8** | `scripts/nina-memory-reap.mjs:63` selects `f.confidence` | Removed from the `SELECT` list. | Not listed on the card. The column is selected and then never used in the printout, so this is a one-token deletion — but left in place it is a `column does not exist` error the next time anyone reaps orphaned memory rows, and that script only runs by hand months apart. |
| **D9** | `tests/db.schema.nina.test.ts:189` — *"confidence is an integer percent, not a float probability"* | **Replaced with a whole-column-list assertion** on `ninaMemoryFacts` (seven columns), not deleted. | Corrected mid-implementation. The first call was "delete it, the file's `names(...)` assertions already catch a lingering column" — **measured false**: the file asserts a full column list for `ninaMessages` and `ninaAvatars` but never for `ninaMemoryFacts`, so deleting would have left the ledger's shape unasserted entirely. The file also has an explicit precedent for the stronger form, ten lines above the edit: *"An index asserted as an ABSENCE so that adding one is a decision somebody makes on purpose."* A column list does that for every column at once, not just this one. |
| **D11** | `lib/nina/persona.ts:272` — *"Answer with the confidence of somebody who does this for a living"* | Left alone. | Found by the final sweep, not on the card. It is the English word in her persona prompt, describing how she should sound. No relationship to the field. |
| **D10** | `npm run format` | Forbidden. `npx prettier --write <only the files touched>`. | `format` is repo-wide and `format:check` is already red on files inherited from `main` and owned by concurrent sessions. The exit criterion is "no *new* offender", never "`format:check` passes". |

## Exit criteria

- `grep -rn confidence` over `lib/ components/ app/ tests/ drizzle/ scripts/` returns **only** the
  three unrelated F05 files named in "out of scope".
- `drizzle/0011_*.sql` exists, is `drizzle-kit`-generated, drops the column, and `_journal.json`
  carries its entry.
- `proposeSlot` takes three parameters; `DemotedWrite['reason']` has four members.
- The rewritten `nina.memory.test.ts` case asserts the inference-from-a-real-quote is **promoted**,
  and says in a comment that this is the accepted cost.
- `nina.distill.test.ts`'s repair test still fails the payload and still asserts a Zod issue path.
- `npm run typecheck` green. `npm run test` green. No new `format:check` offender.

**Measured at implementation:** typecheck green; `npm run test` → **153 files / 3078 tests passed**.
`drizzle/0011_rare_blockbuster.sql` is a single `ALTER TABLE … DROP COLUMN "confidence";` — no
hand-written backfill existed to be lost, checked by reading the generated file rather than assumed.
- The repo's own CI gate, read out of `.github/workflows/*.yml`, passes in full.

## Rollback

One commit, one `git revert`. The migration is the one part a revert does not undo: re-adding the
column is a second generated migration with `DEFAULT 100`, and the historical per-row values are
gone for good. That is D1, accepted.
