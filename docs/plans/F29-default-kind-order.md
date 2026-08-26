# F29 — The upload picker's default kind order follows the device, not the Fitness app

**Card:** [#38](https://github.com/miftahulmahfuzh/run-insights/issues/38) · round 1 · 2026-08-26

## 1. What is wrong

The upload page assigns a screen kind by pick order. Today that order is
`Summary → Splits → Heart rate`, aliased straight off `SCREEN_KINDS`, and justified in
`lib/extract/constants.ts` as *"the order the screens appear in the iOS Fitness app itself, so it
is right most of the time"*.

The card reports it is right **none** of the time. The runner's images come off the device in
`Heart rate → Splits → Summary`, so every upload begins by re-picking all three kinds before it
can be submitted. The comment's premise — that the Fitness app's own screen order is the order the
OS photo picker hands files over in — is precisely the premise F16 already recorded as false
(`lib/extract/reassignKind.ts` §1, `docs/plans/F16-upload-kind-swap.md` §1). F16 fixed the
*consequence* by making the mislabel correctable with one tap; this fixes the *cause* so there is
usually nothing to correct.

Note what this is not: it is not a claim that pick order can be inferred. It is a claim that the
one order that was hardcoded was the wrong one.

## 2. Approaches weighed

| | Approach | Verdict |
|---|---|---|
| **A** | Give `DEFAULT_KIND_BY_INDEX` its own literal `['heartrate', 'splits', 'summary']` and leave `SCREEN_KINDS` alone | **Chosen** |
| B | Reorder `SCREEN_KINDS` itself | Rejected |
| C | Infer the order per-pick from filenames / EXIF timestamps | Rejected |

Scored against the four criteria this repo supplies:

- **Convention.** `constants.ts` is the module that holds a tunable next to the reason it has that
  value, with `MEASURED` / `DESIGNED` tags. A named literal with a rewritten justification is
  exactly its idiom; A produces one, B removes one by making the default a second reader of a
  constant that means something else.
- **Scope.** The card asks for the *default assigned by pick order*. `SCREEN_KINDS` is also the
  canonical kind list, the `z.enum` in `ScreenKindSchema`, and the render order of the per-tile
  segmented control (`components/extract/KindSelector.tsx:47`). B moves all four to fix one. A
  moves one.
- **Verifiability.** Both A and B are provable in `environment: 'node'`. C is not: the picker
  hands `planPicked` a `File[]`, and EXIF would need a parser, a browser API, or a fixture corpus
  this repo does not have — and it would trade a wrong-but-predictable default for a
  sometimes-wrong-unpredictably one, which is worse for a control whose whole job is being easy to
  override.
- **Reversibility.** A is one literal. B is one literal plus a visible UI change, which is
  reversible in git and not in the runner's muscle memory.

C also fails on the card's own evidence: the runner reports a *fixed* device order. A fixed problem
deserves a fixed answer.

## 3. The one ambiguity, and which way it was resolved

The card names the decision explicitly and leaves it open: does the per-tile dropdown order change
too?

**Resolved narrow: it does not.** The card's *What* section is about "the default screen-kind
assigned by pick order", and nothing in its *Why* says the segmented control is hard to read in its
current order. The two orders are allowed to differ because they answer different questions — the
control asks *"which screen is this?"* and reads best in the app's own top-to-bottom order, while
the default answers *"which screen is this probably?"* and must match the device.

The wider reading (reorder `SCREEN_KINDS`, moving the control to `Heart rate | Splits | Summary`)
loses because it changes a control the card did not complain about. If that was wanted, one comment
on the card reopens it and round 2 is a one-line diff.

## 4. The change

### 4.1 `lib/extract/constants.ts`

`DEFAULT_KIND_BY_INDEX` stops being an alias and becomes its own literal:

```ts
export const DEFAULT_KIND_BY_INDEX = ['heartrate', 'splits', 'summary'] as const satisfies
  readonly ScreenKind[]
```

`satisfies` rather than a type annotation, so the element type is still checked against
`ScreenKind` while the literal stays literal — a plain `readonly ScreenKind[]` annotation would
widen it and let a typo'd permutation through a `length` check.

The comment above it is rewritten to state the real reason (the device's hand-off order, measured
by the runner on every upload) and to say in one line why it is deliberately *not* `SCREEN_KINDS`,
so the next reader does not "tidy" the alias back.

### 4.2 `lib/extract/planPicked.ts`

The free-kind search must follow the same order it just defaulted from. Today:

```ts
const preferred = DEFAULT_KIND_BY_INDEX[existing.length + accepted.length] ?? SCREEN_KINDS[0]
const kind = usedKinds.has(preferred) ? (SCREEN_KINDS.find((k) => !usedKinds.has(k)) ?? preferred) : preferred
```

Both `SCREEN_KINDS` references become `DEFAULT_KIND_BY_INDEX`. While the two arrays were the same
object this was invisible; once they diverge, leaving it would mean a pick that *cannot* take its
preferred kind falls back to the **Fitness app's** order — the exact order this card is removing.
Concretely: one tile already set to Splits, one more image picked, and the runner gets `Summary`
when the device just handed over the heart-rate screen.

`planPicked` no longer needs `SCREEN_KINDS`, so the import drops it. The inline comment naming
"1st Summary, 2nd Splits, 3rd Heart Rate — the order the screens appear in the Fitness app" is
rewritten, and its load-bearing sentence changes with it: the guarantee that the search always
finds a free kind was `MAX_IMAGES === SCREEN_KINDS.length`, and it is now
`MAX_IMAGES === DEFAULT_KIND_BY_INDEX.length` **plus** the fact that the default array is a
permutation of `SCREEN_KINDS`. §4.4 pins both.

### 4.3 Stale comments elsewhere

Two modules describe `DEFAULT_KIND_BY_INDEX` as "the Fitness app's order" while explaining a
defect it caused. They are history and stay history, but the parenthetical is now wrong:

- `lib/extract/reassignKind.ts:11`
- `tests/extract.kindSelector.test.ts:10`

Both get the tense fixed — the defaults *were* the Fitness app's order — so F16's reasoning still
reads correctly without asserting something false about today's code. Neither file's assertions
change.

### 4.4 `tests/extract.planPicked.test.ts`

The current suite proves distinctness exhaustively but never pins the order itself: its one
order assertion is `toEqual([...DEFAULT_KIND_BY_INDEX])`, which is true of any permutation. That is
why every existing case survives A unchanged — and it is the gap the card fell through. So:

- **New — the literal.** `expect([...DEFAULT_KIND_BY_INDEX]).toEqual(['heartrate', 'splits', 'summary'])`,
  plus the happy-path pick asserted against the same literal rather than against the constant. A
  test that reads its expectation out of the module under test cannot fail when that module
  changes, which is the whole defect being fixed.
- **New — the permutation invariant.** `DEFAULT_KIND_BY_INDEX` has `MAX_IMAGES` entries, they are
  distinct, and as a set they equal `SCREEN_KINDS`. This is what makes the §4.2 fallback total,
  and it is what fails loudly if a fourth kind lands or a permutation is mistyped.
- **Changed — the skip case.** `planPicked(holders('splits'), [file('b.jpg')])` now yields
  `['heartrate']`, not `['summary']`: index 1 prefers `splits`, the existing tile holds it, and the
  first free kind in default order is `heartrate`. The assertion's *point* — never a duplicate — is
  unchanged; only the identity of the free kind moves, and it moves because of §4.2.
- **Changed — a comment.** The "skips a kind an earlier pick just claimed" case still passes
  unchanged (`holders('heartrate')` + two picks still yields `['splits', 'summary']`), but its
  walkthrough describes the old indices. Rewritten to trace the new ones.

## 5. What is deliberately untouched

`SCREEN_KINDS`, `ScreenKindSchema`, `KindSelector`'s render order, the extraction prompt (it reads
`SCREEN_KINDS.length`, never its order), the upload route's `z.enum`, and every stored `kind` value.
No migration: this changes a default for *future* picks and touches nothing already in the database.

## 6. Verification

The repo's CI gate (`.github/workflows/ci.yml`) in full, in the worktree. The two suites that carry
this change are `tests/extract.planPicked.test.ts` and `tests/extract.kindSelector.test.ts`; the
`onPickPurity` suite must also stay green, since it asserts the component still delegates
`DEFAULT_KIND_BY_INDEX` to `lib/` rather than deciding it inline.
