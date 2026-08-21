# F14 — The keyboard that could not type a colon

> **Task:** [#1 Wrong Field Input Keyboard](https://github.com/miftahulmahfuzh/run-insights/issues/1)
> — round 1, 2026-08-21.

**Depends on:** F05 (the review screen, `ParsedInput`, `lib/review/inputs.ts`).
**Depended on by:** nothing. This is a defect fix inside F05's surface, not a new capability.
**Owns:** the display-side mask between a phone keypad and F05's parse contract.

---

## 1. The bug, stated precisely

F05 shipped a review screen whose whole justification is that a human can correct a field the
model got wrong (§1: the measured `6'36"` → `436` miss, one wrong field per 108 on this exact
model and fixture). Five of those fields cannot be corrected on a phone at all.

Every editable control on the screen is a `ParsedInput`, which renders
`<input type="text" inputMode="numeric">`. `inputMode="numeric"` asks the OS for a digits-only
keypad, and both iOS and Android oblige — **there is no colon key on it.** Five fields need one:

| Field | Component | Wants |
|---|---|---|
| Duration | `HeroFields.tsx:90` | `h:mm:ss` |
| Average pace | `HeroFields.tsx:106` | `mm:ss` |
| Split time | `SplitsTable.tsx:259` | `mm:ss` |
| Split pace | `SplitsTable.tsx:272` | `mm:ss` |
| Time in zone | `ZoneBar.tsx:219` | `h:mm:ss` |

So the screen that exists to catch a wrong split cannot accept a corrected split. The failure is
total, not cosmetic: the reviewer's only remaining move is to confirm a value they know is wrong,
which writes it into `runs`, into `avg_pace_sec`, into every aggregate and every record check
downstream — the exact silent-corruption path F05 §1 was built to close.

### 1.1 "Just pick a better inputMode" is not available

Checked before designing anything, because it would have been a one-line fix:

- `inputMode="tel"` — iOS telephone pad offers `+ * #` and pause/wait. No colon.
- `inputMode="decimal"` — digits plus the locale decimal separator. No colon.
- `inputMode="text"` / omitted — full QWERTY, where `:` on iOS is two taps deep (`123`, then
  `#+=`). Technically reachable, but it swaps a digits-only keypad for a letter keyboard on a
  numeric field, which is a worse default for the other keystroke in every entry.

**No `inputMode` value puts a colon on the primary keypad.** The separator therefore has to stop
being typed, rather than be made typeable. Everything below follows from that.

### 1.2 What is *not* broken, and why the diff says so

The card lists seven fields. Four of them work today, and rebuilding them would be churn:

- **Distance** — already `inputMode="decimal"`, and `parseDistanceInput` accepts both `.` and `,`
  (the comma is deliberate: Apple prints `10,67KM`). The separator key is on that pad.
- **Started / Ended** — `parseClockInput` strips non-digits, so `0707` already parses to `07:07`
  on a digits-only keypad. These were *usable*; they merely looked impossible, which is its own
  kind of bug and §3.2 fixes it — but not by adding a mask.
- **Location** — plain `type="text"`, full keyboard, correct already.
- **Every integer field** — km, HR, cadence, kcal, elevation, zone bounds, and the nine in
  `MoreDetails`. Thirteen call sites where digits-only is the *right* keypad.

`ParsedInput` has **18 call sites**. Five are broken. Any change that alters its default behaviour
touches thirteen working fields to fix five, so §3's change is strictly additive: two optional
props, both absent by default.

---

## 2. The mask

### 2.1 Where it lives, and why that is forced

`vitest.config.ts` sets `environment: 'node'`, its `include` matches only `*.test.ts` — never
`.tsx` — and neither jsdom nor testing-library is a dependency. **This repo has no component
tests, by design.**

That single fact decides the architecture. If the digit-placement logic lives inside
`ParsedInput`, it is untestable as shipped. So it lives in `lib/review/inputs.ts`, the module that
already owns "text in, integers out", already documents the three-way parse contract, and already
has `tests/review.inputs.test.ts` pointed at it. The placement is not tidiness; it is the
difference between tested and untested.

```ts
export type TimeMaskShape = 'mm:ss' | 'hh:mm:ss'
export function maskTimeInput(text: string, shape: TimeMaskShape): string
```

Pure, string in, string out. No React, no DOM, no clock.

### 2.2 The algorithm, one reason per step

1. **Strip every non-digit.** Two things fall out of this. The function becomes idempotent over
   its own output, which is what lets `ParsedInput`'s re-seed path run it repeatedly without
   drift; and a desktop user who types `4:48` still lands on `4:48`, because the colon is
   discarded and `448` re-lays into the same place.
2. **Drop leading zeros, then cap the digit count** — 4 for `mm:ss`, 6 for `hh:mm:ss`.

   **The cap is a guardrail, not just a bound.** A pace field that physically cannot hold six
   digits cannot hold the `436` that F05 §1 records the model producing for a `6'36"` split.

   **Dropping the leading zeros is what makes the field clearable, and that was found by the
   tests rather than by design** — see §6.1. Dropping them first also stops padded zeros from
   eating the digit budget the cap allows.
3. **Left-pad to a minimum of three digits**, so one keystroke reads `0:01` rather than a bare
   `1` that looks like a whole number sitting in a duration field.
4. **Group from the right in twos** — `ss`, then `mm`, then the remainder as `hh` — rendering
   only the groups that exist.

**`mm:ss` tops out at `59:59`, not `99:59`** (§6.2). `toDurationInput` rolls past sixty minutes
into a third group — 3600 s renders `1:00:00` — which no four-digit mask can hold. A kilometre
slower than an hour is outside the shape by design.

```
mm:ss       "448"   → 4:48         "1183"  → 11:83
hh:mm:ss    "11"    → 0:11         "11836" → 1:18:36
```

### 2.3 The parsers do not change

This is the property that keeps the change small. The mask is **display-only**; it hands the
parser a well-shaped string and the parser's documented contract is untouched:

- `parseDurationInput('0:01')` → `1`. Already true.
- `parseDurationInput('11:83')` → `invalid`, because only the leading field may exceed 59.
  Already true.
- `toDurationInput(4716)` → `'1:18:36'` → mask → `'1:18:36'`. Round-trips in both directions.

No edit to `parseDurationInput`, `parsePaceInput`, `toDurationInput` or `toPaceInput`.

### 2.4 The intermediate-invalid problem

Right-to-left shifting means `1:18:36` is reached by typing `1,1,8,3,6`, and the fourth keystroke
displays `11:83` — 83 seconds, genuinely invalid. **Intermediate invalid states are unavoidable**
with this mask, and refusing the keystroke that creates them is a dead end: it would make
`1:18:36` untypeable, because the only route to it passes through `11:83`.

`ParsedInput` today shows its red message the instant a parse fails, so as written the mask would
flash red on the fourth keystroke of most durations. A field that scolds you mid-keystroke reads
as broken — which is the feeling this whole fix exists to remove. §3.1 defers the message instead.

---

## 3. The changes

### 3.1 `ParsedInput` gains two optional props

**`mask?: TimeMaskShape`.** When present, the change handler runs the raw event value through
`maskTimeInput` before anything else, and the masked string is what enters local state. The
existing flow then continues unchanged: parse it, push the value up if it parses, keep the text
either way. Masking happens **before** the parse — that ordering is what lets §2.3 hold.

**`deferError?: boolean`.** A third state variable, `touched`, initialised `false`; blur sets it
true, focus sets it back to false.

```ts
const showLocal = invalid && (!deferError || touched)
const message = error ?? (showLocal ? invalidMessage : undefined)
```

Two properties preserved on purpose:

- **The `error` prop still outranks everything and is never deferred.** A server-side error did
  not arrive from the keystroke under your thumb, so there is no flash to avoid — and hiding it
  would suppress the one message the user cannot fix by typing on.
- **The draft still never receives an invalid value.** Only the red text waits. `onChange` stays
  gated on `!parsed.invalid`, so the module header's rule — an unparseable entry must never
  silently become `null` — is untouched.

**Caret handling.** Because the mask re-lays the whole string, a mid-string edit produces a
technically-correct-but-surprising result. Mask fields pin the caret to the end on focus and after
each masked change (one `setSelectionRange`). Right-to-left entry is the entire gesture; there is
no meaningful mid-string edit to protect.

### 3.2 The five masked call sites

Each gets `mask` and `deferError`. Nothing else changes — same `toText`, same `parse`, same
`inputMode="numeric"`.

| Field | File | Shape |
|---|---|---|
| Duration | `HeroFields.tsx:90` | `hh:mm:ss` |
| Average pace | `HeroFields.tsx:106` | `mm:ss` |
| Split time | `SplitsTable.tsx:259` | `mm:ss` |
| Split pace | `SplitsTable.tsx:272` | `mm:ss` |
| Time in zone | `ZoneBar.tsx:219` | `hh:mm:ss` |

### 3.3 Started and Ended become native

`ClockInput` is deleted. Both fields become `<input type="time">` wearing `CONTROL_CLASS` —
exactly what the Date field two grid cells above already does with `type="date"`. The card asked
for "rolling clock selection"; on iOS and Android `type="time"` **is** that wheel, for free, and
it ends the state where two of the three date/time fields are native and one is not.

Smaller than it sounds, because the formats already agree. `type="time"` emits zero-padded
`HH:mm` or `''`, and `lib/review/schema.ts:85`'s `clockTime` requires precisely zero-padded
`HH:mm` — it rejects `'7:07'` (`tests/review.schema.test.ts:108`). **The native control cannot
produce the one shape the schema refuses.** So `onChange` is `event.target.value || null`, and
there is no parse step at all.

`parseClockInput` then has no callers. It and its `describe` block are removed rather than left as
a tested function nothing calls: `lib/review/inputs.ts` declares itself the edge between typed
text and the draft, and a parser for an input that no longer exists is not that edge.

The browser owns the control's internals, so styling is height, font and colour only — the same
bargain `type="date"` already struck on this screen. `app/globals.css:151`'s
`font-size: max(16px, 1rem)` still applies, so Safari will not zoom on focus.

### 3.4 Deliberately untouched

Distance, Location, Date, and all thirteen integer call sites across `MoreDetails`,
`SplitsTable` and `ZoneBar`. Named here so the diff's silence about them reads as a decision
rather than an oversight — see §1.2.

---

## 4. Verification

### 4.1 Added to `tests/review.inputs.test.ts`

1. **Typing simulation.** A helper folding a digit string one character at a time through
   `maskTimeInput(prev + char, shape)` — *exactly* what the component's change handler does, so
   this covers the real path with no DOM. `1,1,8,3,6` → `0:01`, `0:11`, `1:18`, `11:83`,
   `1:18:36`.
2. **Backspace shifts out symmetrically.** Dropping the last character and re-masking walks the
   sequence backwards: `1:18:36` → `11:83` → `1:18` → `0:11`. This works because the last
   character of every masked shape is a digit, never a colon.
3. **Idempotence** — `maskTimeInput(maskTimeInput(x)) === maskTimeInput(x)` over a table. This is
   what guarantees `ParsedInput`'s re-seed path cannot drift.
4. **Colon tolerance** — `'4:48'` and `'448'` both mask to `4:48`, so desktop typing survives.
5. **The cap** — a 5th digit in `mm:ss` is dropped; a 7th in `hh:mm:ss` is dropped.
6. **Round-trip against the existing formatters** —
   `maskTimeInput(toDurationInput(v)) === toDurationInput(v)` across `[1, 288, 429, 4716, 5999]`,
   and the same for `toPaceInput` across `[1, 288, 429, 3599]` — the `mm:ss` domain stops at
   `59:59` (§6.2).
8. **A cleared field stays cleared** — `maskTimeInput('00')` and `maskTimeInput('0:0')` are both
   `''`, which the parsers read as `null` (§6.1).
7. **The mask feeds the parser correctly** —
   `parseDurationInput(maskTimeInput('11836', 'hh:mm:ss')).value === 4716`, and `'1183'` masks to
   something the parser calls `invalid`.

**Removed:** the `parseClockInput` describe block, with the function.

**Result: 29 assertions in this file, 1,054 across the suite, all green.**

### 4.2 By hand, because nothing else can

The deferred error timing, the caret pin, and the native `type="time"` wheel — on a real phone,
on the review screen of a real run. This is the part `npm test` cannot reach, and the part the
card was actually reporting.

### 4.3 Gate

`npm test` green, `npm run lint` clean, `npx tsc --noEmit` clean, and the five fields
demonstrably correctable on a phone.

---

## 5. What this costs

One documented affordance disappears. `lib/review/inputs.ts` states that a bare number in a
duration field is read as seconds — `288` → 288 s — "the reviewer is entering the stored unit
deliberately". Under the mask, typing `288` displays `2:88` and is invalid.

Accepted. That escape hatch requires knowing the storage unit and doing the conversion by hand,
which is the arithmetic F05 §2.1 took off the human's plate on purpose, and it was never usable
on the device this fix is for. The parser still accepts a bare integer, so the capability survives
for any non-masked caller; only the masked fields give it up.

---

## 6. What the tests found that the design missed

Both of these were caught by §4.1's suite on its first run, before any of it reached a browser.
Recorded here rather than quietly fixed, because the first one is a real defect the design
introduced and would have shipped.

### 6.1 The field could not be cleared

As designed, step 3 padded to three digits *before* grouping — and padding inflates the digit
count, so the padded zeros come back as real digits on the next keystroke. Backspacing out of
`0:01` left `0:0`, which is two digits `00`, which re-padded to `000` and rendered `0:00`. From
there every further backspace produced `0:0` → `0:00` again. **A masked field you cannot empty.**

That is not cosmetic. `null` is a legitimate value on every field on this screen, and the parse
contract at the top of `lib/review/inputs.ts` exists specifically to keep "blank" and "nonsense"
apart. A mask that cannot reach blank breaks the one distinction that module is built to defend.

The fix is one `.replace(/^0+/, '')` before the cap, and the test that catches it is the
backspace-symmetry case in §4.1.2 — which, as originally written, looped forever.

### 6.2 The `mm:ss` ceiling is 59:59, not 99:59

The design claimed `mm:ss` held up to `99:59` on the arithmetic that four digits reach 5,999
seconds. Wrong, because the *formatter* decides the string: `toDurationInput(3600)` is `1:00:00`,
three groups, five digits — and a four-digit cap turns that into `13:95`. So the round-trippable
domain is 0–3599, and the ceiling is an hour.

No code change needed; the shape is still right for a pace. But the plan asserted a bound the
implementation does not have, so the bound is corrected here and in the `MASK_DIGITS` comment.

---

# F14 round 2 — 2026-08-21 — the sheet that stole the keyboard

Reported from a phone immediately after round 1 landed: **editing a heart-rate zone, every single
digit dismissed the keyboard.** One digit, keyboard gone, tap the field again.

## 7. Root cause, four links long, none of them in ZoneBar

```
keystroke in the zone sheet
  → ParsedInput pushes the value up
  → ReviewClient's `draft` useState updates            (ReviewClient.tsx:95)
  → ReviewClient re-renders, so ZoneBar re-renders
  → ZoneBar mints a NEW `onClose={() => setEditing(null)}`   (ZoneBar.tsx:162)
  → Sheet's effect listed `onClose` in its deps, so they compare unequal
  → React tears the effect down and re-runs it
  → the effect calls `panelRef.current?.focus()`        (Sheet.tsx:69)
  → focus leaves the input, and iOS drops the keyboard
```

**The dependency was spurious.** `onClose` is only ever *read inside* the Escape listener — it is
never consulted to decide whether the effect should re-run. Listing it turned "focus the panel when
the sheet opens" into "focus the panel whenever the parent re-renders", on a surface whose entire
content is text inputs.

### 7.1 Not an F14 regression

`components/ui/Sheet.tsx` is not in `3759b71`; the effect landed with F05 in `182745f`. Tracing the
pre-mask code confirms it: zone 1 with `durationSec: 0` displayed `0:00`, typing `5` gave `0:005`,
and `parseDurationInput` read that as a valid 5 seconds — so `onChange` fired and focus was stolen
on the first digit then too. Round 1 neither caused this nor hid it.

### 7.2 It was never only the zone sheet

`SplitsTable.tsx:195` passes the identical inline `onClose`, so correcting a split had the same bug.
It was fixed by the same one-line change, which is the argument for fixing `Sheet` rather than
memoising at the call sites: a `useCallback` in `ZoneBar` would have fixed the reported screen and
left the trap armed in the other one, and for every component that opens a sheet later.

### 7.3 The fix

`onClose` moves into a ref synced by its own effect, the Escape listener reads
`onCloseRef.current()`, and the focus effect keys on `[open]` alone.

## 8. The sweep

Every effect dependency array under `components/` and `app/` was read. Two others take unstable
function props, and neither is this bug:

- **`ScreenshotStrip.tsx:116`** — `[index, photos.length, onIndex, onClose]`. Re-runs the same way,
  but the effect only adds a keydown listener and locks body overflow. **No `focus()` call**, so
  there is nothing to steal, and the listener genuinely wants a fresh `onIndex`. Left alone.
- **`ShareButton.tsx:62`** — a `useCallback`, not an effect.

The combination that bites is *unstable dependency plus a focus call*, and `Sheet` was the only
place it occurred.

## 9. How this is tested, given there are no component tests

`tests/ui.sheetFocus.test.ts` asserts the dependency list of the effect that focuses the panel does
not contain `onClose`, in the static-source idiom `tests/share.bundle.test.ts` already established
for this repo. Verified both ways: re-arming `[open, onClose]` fails exactly the one key assertion,
restoring the fix passes all four.

A text scan is the right instrument, not a compromise. The property being asserted is *"can this
effect re-run on a re-render?"* — which lives in the dependency list, not in any one rendered
scenario. A jsdom test would prove it for the interaction it simulated; this proves it for every
consumer of `Sheet`, including ones a future feature adds, and it fails naming the dependency rather
than reporting a lost keyboard three components away from the cause.

**It also has nothing else guarding it: `eslint.config.mjs` configures no `react-hooks` plugin, so
`exhaustive-deps` is not running.** Nothing flagged the original dependency, and nothing would stop
a future edit re-adding it — which is precisely the gap this test fills. Two mistakes while writing
it are worth recording, because both are traps for the next structural test in this repo:

1. Anchoring on the first `React.useEffect` in the file measured the **new ref-sync effect**, whose
   deps legitimately *are* `[onClose]`. The anchor has to be the focus call.
2. Scanning the raw file found `panelRef.current?.focus()` **inside the doc comment explaining the
   fix** before finding it in the code. `readRepoCode` exists for exactly this, and its own comment
   says why: "a guard that fires on its own explanation gets silenced, and then it protects
   nothing."

## 10. Verification

`npm test` — **1058 passed, 73 files** · `tsc --noEmit` clean · `npm run lint` clean · `next build`
compiles. Still unverified by anything automated, and still the part that matters: that the keyboard
actually stays up on a phone.
