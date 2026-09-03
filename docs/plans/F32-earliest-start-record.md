# F32 — `earliest_start`: the eleventh personal record, and its patch

**Card:** [#44](https://github.com/miftahulmahfuzh/run-insights/issues/44) — *"add a new personal
records (including the appropriate funny badge for it). the earliest time user started the run"*
**Branch:** `task/44-add-an-earliest-start-personal-record` off `1d7d2c2`
**Round:** 1

`RECORD_CATALOG` grows from ten keys to eleven. The new one reads `runs.started_at` — the one
column the records deck has never touched, even though the badge deck reads it three ways — and
holds the earliest clock time the runner has ever set off at. It ships with its own pentagon patch,
because `RECORD_ART` is a total `Record<RecordKey, RecordArt>` and a key without art does not
typecheck.

---

## 1. The three decisions, and what lost

### 1a. Storage: seconds past midnight, in a new `clock` unit

`records.value` is `int NOT NULL` (roadmap §4.3) and every one of the ten existing keys is an
integer on purpose — it is the entire reason `best_paced_run` lives in basis points rather than as
a percentage. A time of day has to arrive as an integer too.

| Approach | Convention | Scope | Verifiability | Reversibility | |
|---|---|---|---|---|---|
| **Seconds past midnight, `unit: 'clock'`** | matches the `bp` precedent exactly — encode at the candidate, decode at the label | one new unit, one new formatter | `formatRecordValue` is a pure function over an int | one commit | **chosen** |
| Minutes past midnight | fits in a smaller int nobody needs | same | loses the seconds the column actually stores | one commit | lost: `runs.started_at` is `time`, i.e. `HH:MM:SS`, and throwing the seconds away at the record layer would make two runs one second apart tie for no reason |
| A second `records` column of type `time` | reads most naturally in SQL | a migration, and `StoredRecord.value` stops being one shape | every consumer grows a branch | a migration to undo | lost: it breaks the invariant that makes the whole table uniform, for one key |

**`unit: 'clock'`**, therefore, and `RecordUnit` gains it. `0 ≤ value ≤ 86399`.

### 1b. The comparison: a plain minimum, so 00:15 beats 04:30

This is the card's one genuine ambiguity, and it is resolved toward the literal reading.

The words are *"the earliest time user started the run"*. The narrowest reading that fully
satisfies them is `min(seconds past midnight)` over every reviewed run that has a start time —
nothing else. A run begun at 00:15 **is** the earliest one, and it takes the record.

**The rejected reading: a sane-morning window.** `early_bird` fires only inside `05:00–05:30`
precisely so that a midnight start cannot claim it, and the same guard could be applied here — say,
only starts before noon qualify, or the day begins at 03:00. It loses on two counts:

- **It invents a threshold the card never names.** R-42's whole argument is that a threshold is a
  contract; minting one from nothing, unasked, in a record whose meaning is otherwise self-evident,
  is a worse failure than a record occasionally held by a very odd run.
- **It contradicts what the repo already does with this column.** `lib/badges/rules.ts` compares
  `'HH:MM:SS'` lexically, and its own comment insists on it: the column "deliberately carries no
  day", so ordering starts at `00:00:00`. There is no 03:00 day boundary anywhere in this codebase
  — `occurredOn` is the Jakarta calendar day (D6) and nothing shifts it. A records key that
  invented one would be the only place in the app where midnight is not the start of the day.

If the runner would rather this record ignored the small hours, that is a comment on the card and a
round 2 — one threshold in `catalog.ts`, which is the cheap change this design deliberately leaves
available.

### 1c. The qualifier: a start time, and nothing else

No minimum distance. §4.5's table gives a floor to exactly the four keys that measure a **rate**
(`fastest_pace_5k`, `fastest_pace_10k`, `highest_cadence`, `best_paced_run`) — because a rate over
400 m is a sprint to the corner, which is the catalog header's own wording. The other six have no
floor at all.

An earliest start is not a rate. Getting up at 04:10 is the same act whether the run that follows
is 2 km or 12, and the three badges that already read this column — `early_bird`, `late_start`,
`dawn_patrol` — all ignore distance for exactly that reason. Following them is convention, not
laxity.

So: `qualifies: (c) => c.startedAtSec != null`. A screenshot with no start time excludes the run
from this key alone, which is the ordinary shape of every optional-input key in the catalog.

---

## 2. Where the value is derived, and where it is not

`toRecordCandidate` is the single place a `RecordRunRow` becomes a `RecordCandidate`, and it is
already where the two computed fields (`fastestFullKmPaceSec`, `decouplingBp`) are derived. The
clock-string → integer conversion joins them there, so `catalog.ts` keeps its property of being a
table of comparisons over numbers with no parsing in it.

```
runs.started_at ('07:07:00', nullable)
  → RecordRunRow.startedAt         (gateway maps the column through; the query already selects *)
  → RecordCandidate.startedAtSec   (toRecordCandidate, via clockToSeconds)
  → records.value                  (25620)
  → formatRecordValue → '07:07'    (formatClockSec, lib/format.ts)
```

`clockToSeconds` is module-local to `compute.ts`. It accepts `'HH:MM'` and `'HH:MM:SS'` and returns
null for anything else, mirroring `startTimeOf` in `lib/badges/rules.ts` — deliberately a second,
tiny, private tolerance rather than an import, because `lib/records` importing from `lib/badges`
would couple two decks that share only a column name. (`lib/format.ts` is the shared floor both may
import, and the *formatting* half does live there, under R-23.)

`formatClockSec(seconds)` goes in `lib/format.ts` beside the existing `formatClock(string)`, which
does the same narrowing from the other direction.

---

## 3. The patch — "the appropriate funny badge"

Records carry no `gloss` field (that is `BADGE_META`, badge deck only), so the joke lands in the
art. One master, generated by the `/generate-badge` skill on `--deck records`, native 4:3, seed
1970, per F25 §6.

**Scene: a stovetop moka coffee pot.** The deadpan reward for being up before anyone else, and the
one object in a 1970s kitchen that means *first thing in the morning* without a sunrise in it.

Why not the obvious ones:

- **A clock or an alarm clock** — a dial invites numerals, numerals are text, and text is an instant
  reject in this deck. style.md states the rule outright: not one of the 32 existing scenes uses a
  clock, watch face, gauge or scale, which is why `longest_duration` is a candle and not an
  hourglass. The most literal picture of "earliest time" is the one picture this style cannot draw.
- **A rooster, an owl, a sunrise** — `early_bird` is already a rooster crowing into a sun disc, and
  a second dawn bird would be the same patch. The cross-deck collision audit exists to catch exactly
  this.
- **A milk bottle on a doorstep** — the right idiom, the wrong object: a bottle pulls a printed
  dairy label, and lettering is the single likeliest reason this style burns an attempt.
- **A lantern or a bedside lamp** — the deck is already carrying four light sources (lighthouse
  beam, candle, match ember, sun disc). A fifth is convergence.

Scene line, appended inside `<!-- SCENES:records -->` in `.claude/skills/generate-badge/style.md`:

> `- earliest_start: A single stovetop moka coffee pot standing alone, seen from the side, its faceted octagonal body stepping in sharply at the waist, its one curved handle and its short spout in clear profile, its lid closed and its body left entirely bare of any mark or medallion. SHAPE: pentagon. SIGNATURE THREAD: the small round knob on top of the lid.`

"Bare of any mark or medallion" follows the `warmup_who` / `sweat_equity` precedent — the two scenes
that name a bare surface to keep the model from stitching a badge onto it.

### As generated — five attempts, and a lever nobody had found

| att | seed | note | verdict |
|---|---|---|---|
| a01 | 1970 | none | REJECT — 9b twill 8.0 (≤6.0). Subject right first time; body drawn as red/yellow/green vertical stripes, which reads as a lantern at 40 px |
| a02 | 1970 | one solid body colour; cloth "deep dark navy, near #1B2A44" | REJECT — 9b **9.8**. Subject and composition both excellent |
| a03 | 1971 | cloth "lies in deep shadow … raking light on the patch alone" | REJECT — 9b **1.5 PASS**, but a spotlight: patch 84% wide, 8.2% off centre |
| a04 | 1971 | cloth "deep and evenly dark" + margin and width | REJECT — 9b **12.6**, composition perfect |
| a05 | 1971 | a03's shadow sentence, non-exclusive, + a04's margin and width | **PROMOTED** — all ten hard checks pass. 9b 3.0, 9a 1.4%, 8a 1.2% |

Over the cap of three the skill sets, deliberately and with the reason written down: the cap exists
to stop a session re-rolling one prompt, and these were five different single-variable
generations that isolated a lever F25 had left open. Each attempt is ~$0.04. The finding — **9b
answers to a sentence about the light, not about the colour** — is written into `style.md` beside
F25's addendum finding, with the table above, so the next patch that drifts costs one generation
instead of five.

`SHAPE_WIDTH["pentagon"]` is left at `Band(0.893, observed=10)`. a05 sits 1.4% from it; re-deriving
a threshold from one new member is what that file's header forbids.

**The style block is not touched.** Bumping v2 would fail `npm run badges:check` on all 33 masters
until every one was regenerated (style.md §"The block cannot be bumped"), and F25 measured that
*appending* anything to it makes this model discard the scene entirely. The pentagon rides in the
scene line, exactly as the other ten do.

---

## 4. Tasks, in commit order

The order is forced by one fact: `gen_badge_art.py` refuses to start unless the deck's scene keys
are exactly its catalog's keys, and `RECORD_ART` refuses to typecheck without the art. So the code
lands first and the tree is briefly red on the manifest alone.

1. **The key.** `RecordKey` union, `RecordUnit` gains `'clock'`, `RecordCandidate.startedAtSec`,
   `RecordRunRow.startedAt`, the catalog entry (appended last — catalog order is the shelf's reading
   order and the existing ten must not move), `clockToSeconds` in `compute.ts`, the gateway mapping,
   `RECORD_LABELS['earliest_start'] = 'Earliest start'`, `formatClockSec` in `lib/format.ts` and its
   `case 'clock'` in `formatRecordValue`.
2. **The scene**, in `style.md`.
3. **The art.** `/generate-badge earliest_start` → judge at 40 px and 220 px → promote the `.aNN`
   pair to `assets/records/` → `python3 tools/make_badge_assets.py --deck records` →
   `npm run badges:check`. Its own commit, because it regenerates shipped bytes.
4. **Tests.** `tests/records.catalog.test.ts` grows to eleven keys and eleven unit/direction pairs;
   the three fixtures gain a `startedAt`; new cases for the minimum, for the null-start exclusion,
   and for `formatClockSec`.
5. **Docs.** Roadmap §4.5's table gains a row; the "ten records" sentences in `labels.ts`,
   `RecordsTable.tsx` and the catalog/compute headers become eleven; style.md's pentagon count and
   the cross-deck audit's "thirty-two patches" become 11 and 33.

## 5. What is deliberately not in scope

- **No badge.** The card says "badge" but names a *record*; in this codebase the record deck's
  patch is that badge, and `BADGE_CATALOG` is a separate 22-key contract with its own art deck.
  Adding a 23rd badge key would be a second feature the card did not ask for.
- **No `gloss` on records.** Giving the records deck a one-line joke the way `BADGE_META` has one
  is a change to all eleven panels, not to this key.
- **No backfill script.** `recomputeRecords` is a full re-derive over the whole history on every
  review commit, so the first review after this ships sets the new key from every existing run at
  once. Nothing needs migrating.
