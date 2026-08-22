# F25 — Ten personal-record patches, and a second deck in the asset pipeline

**Card:** [#24](https://github.com/miftahulmahfuzh/run-insights/issues/24) · round 1
**Base:** `origin/main` at `d5e6f25`

Part 3 of 5 of the "Personal records + badge panel" set. Blocks [#25](https://github.com/miftahulmahfuzh/run-insights/issues/25);
depends on nothing, so it runs fully in parallel with #22 and #23. It touches `tools/`, `assets/`,
`public/`, `.claude/skills/generate-badge/`, one new manifest and `next.config.ts` — and no component.

> **On the plan number.** `F<N+1>` is not race-safe; commit `0ea0acf` records two sessions minting
> `F20` off the same base. This set uses **card number + 1** instead, which needs no lock and no
> coordination: #22 → F23 (landed as [#27](https://github.com/miftahulmahfuzh/run-insights/pull/27)),
> #23 → F24, **#24 → F25**, #25 → F26. `origin/main` was re-checked for the label immediately before
> committing, per that commit's own advice.

---

## 1. What the card asked for, and the one place it is wrong

> **(1a)** We need to create a new badge for each personal records item. Make sure the generated
> badge has the correct aspect ratio to accommodate the badge detail modal.

Ten records — `RECORD_KEYS` / `RECORD_CATALOG` in `lib/records/catalog.ts`, named in
`lib/records/labels.ts`: `longest_distance`, `longest_duration`, `fastest_pace_5k`,
`fastest_pace_10k`, `fastest_km_split`, `most_kcal`, `most_elevation`, `highest_cadence`,
`highest_max_hr`, `best_paced_run`.

The card then instructs: *"generate the ten record masters at 1024×768 natively. No
`extend_badge_art.py` pass."* **That instruction is not obviously safe, and this plan does not take
it on faith.** Three places in the toolchain argue against it, each with a measurement behind it:

- `gen_badge_art.py` sends `aspect_ratio: "1:1"`, and STYLE BLOCK v2 asks for the patch at
  **"about 80 percent of the image width"**. On a 4:3 frame that is 106% of the *height* — the
  patch runs off the top and bottom.
- `tools/extend_badge_art.py`'s header: *"the style block's composition rules … were written for a
  square frame and every one of the four `SHAPE_WIDTH` numbers was observed on one. Regenerating
  the deck at 4:3 from scratch would invalidate all of it."*
- The same header measured that prompted patch size is barely a controllable quantity:
  **"eighty percent" → 66.0%, "eighty-eight percent" → 68.0%**.

The half that *is* already solved is measurement, not generation. `check_badge_art.py` check 9a
already scales its expectation by the frame's own aspect:

```python
expected = SHAPE_WIDTH[shape] * h / w
```

with a comment stating that height is the number that matters on a 4:3 master. So a genuinely
correct native 4:3 master passes 9a today, untouched. **What is unproven is whether the model
produces one.**

### The resolution: probe once, then commit

Rather than choose between the card and the toolchain from the armchair, §6 spends **one
generation (~$0.04)** finding out, and the result is recorded here either way so that nobody
re-litigates it from prose a third time.

---

## 2. The records deck's own silhouette: a point-up pentagon

The two decks must be tellable apart at the 56 px shelf size and in the panel, so the records deck
gets a **fifth shape of its own**: a pentagon, apex up, flat base, corners rounded, the merrowed
border following it.

**Why not the obvious rounded diamond.** The badge deck's collision audit already learned this
lesson once — *"a scene's composition has an implied aspect ratio, and it must agree with the outer
shape it was assigned"*. A diamond's usable interior is a narrow vertical spindle. It suits a
candle and a plumb bob and actively fights a bounding hare or a kite on a long line, and **one
shape has to carry all ten scenes.**

A pentagon:

- has a hexagon's generous interior, so wide and tall subjects both fit;
- has a flat base, which the standing subjects (a bell, a spinning top, a peak, a bellows) need;
- is unmistakable against the badge deck at 40 px, because that deck's hexagon *presents its points
  left and right* while this presents one apex up;
- is never circle-adjacent — which an octagon would be, and *"a plain circle in a square"* is the
  one shape STYLE BLOCK v2 forbids outright.

### `SHAPE_WIDTH["pentagon"] = 0.855`, and it ships as a guess that says so

The four existing bands are `(observed, 22 badges, v2)`:

| shape | band | provenance |
|---|---|---|
| shield | 0.810 | observed, 22 |
| rounded triangle | 0.778 | observed, 22 |
| hexagon | 0.873 | observed, 22 |
| chevron | 0.844 | observed, 22 (shipped as a 0.850 estimate; the guess was 0.6 high) |
| **pentagon** | **0.855** | **geometric estimate, 0 images** |

0.855 sits between chevron and hexagon: a pentagon's widest chord fills its bounding box the way a
hexagon's points do, while its apex tapers the way a shield's shoulders do.

**A guessed band must not be a hard gate.** Check 9a sets the exit code, and
`check_badge_art.py`'s own header is explicit about the failure mode: *"A threshold that fails on
every good candidate is the threshold somebody comments out."* So the entries gain provenance:

```python
SHAPE_WIDTH = {
    "shield":           Band(0.810, observed=22),
    "rounded triangle": Band(0.778, observed=22),
    "hexagon":          Band(0.873, observed=22),
    "chevron":          Band(0.844, observed=22),
    "pentagon":         Band(0.855, observed=0),   # geometric estimate — see §2
}
```

`observed == 0` makes 9a **advisory and loud** for that shape — it prints the drift and says the
band is a guess — instead of failing the run. Every already-observed shape stays hard, so the badge
deck's gate does not weaken by a single point.

**The guess does not survive the task that made it.** §9's last step re-derives `pentagon` from all
ten promoted records and commits the observed number with `observed=10`, at which point 9a goes
hard for records too. That is the file's own rule — *"a distribution, not a candidate, sets a
threshold"* — applied to a new deck rather than deferred forever.

**The four existing bands are not re-derived.** The header forbids that from a small sample, and
the records deck is a different shape anyway.

---

## 3. The ten scenes

All pentagon. Checked against the badge deck's collision audit as they were written.

| key | scene | signature thread |
|---|---|---|
| `longest_distance` | a kite flown so high it is small, at the end of one long taut line running from the base corner to the apex | the kite's single tail bow |
| `longest_duration` | a candle burned almost to its base, still lit, standing in a deep wide pool of its own wax | the last unburnt fold of wick |
| `fastest_pace_5k` | a swift in a hard flat dive, wings swept fully back to a dart | the swift's eye |
| `fastest_pace_10k` | a hare at full stretch mid-bound, all four feet clear of the ground | the hare's leading forepaw |
| `fastest_km_split` | a bow at the instant of release — the arrow just clear of it, the string still shivering | the arrow's fletching |
| `most_kcal` | a leather-and-wood bellows squeezed hard, one puff leaving its nozzle | the nozzle's brass ferrule |
| `most_elevation` | a mountain peak, snow line hard across its upper third, one switchback path stitched up the near face | the topmost switchback turn |
| `highest_cadence` | a spinning top at full speed, dead upright, one blurred ring of motion at its waist | the top's steel tip |
| `highest_max_hr` | a heavy bell mid-strike, its clapper hard over against the lip | the clapper |
| `best_paced_run` | a plumb bob hanging dead still on its line | the bob's point |

### The collision audit, extended to 32 patches

Three adjacencies are recorded rather than hoped away:

- **`longest_duration` is the second flame**, after `fast_start_fool`'s spent match. A tall taper
  standing in a wax pool and a collapsed matchstick lying diagonal share no silhouette.
- **`fastest_pace_5k` is the second bird**, after `early_bird`'s rooster — which is perched in
  profile on a rail against a sun disc. A swept-wing dart in a dive is a different picture.
- **`best_paced_run` is the closest of the three.** A plumb bob and `boring_excellence`'s spirit
  level are both trueness instruments. Vertical against horizontal, pentagon against chevron,
  different decks. Per the audit's own lesson — *"a prepared alternative can spend itself on the
  wrong problem … write the next one down before moving on"* — the reserve is written now:
  **a carpenter's chalk line snapped taut between two pins, one clean struck line below it.**

Still true across both decks: **no shoes, no medals, no stopwatches**, and no clock, watch face,
gauge, scale or numeral — which is why `longest_duration` is a candle and not an hourglass, and
`highest_max_hr` a bell and not a dial.

---

## 4. STYLE BLOCK v2 is not touched, and cannot be

`scripts/check-badge-art.mjs:175` asserts that every promoted master's sidecar style version equals
`style.md`'s current version:

> `masters are ${distinct[0]}, style.md is ${style.version} — either the block was bumped without
> regenerating, or a regeneration was never promoted`

So bumping v2 → v3 fails `npm run badges:check` on all 22 existing badges until every one is
regenerated. The block also names only four shapes — *"a shield, a hexagon, a chevron, or a rounded
triangle"* — and says "22 badges" five times.

**The resolution is a per-deck addendum, not a second style block.** `style.md` keeps STYLE BLOCK
v2 byte-identical and gains a short region appended only for records generations:

```
<!-- ADDENDUM:records v1 -->
…the fifth silhouette, named and described
…"wherever the block above says 22 badges, read every patch in this set", across both decks
<!-- /ADDENDUM:records -->
```

Everything the two decks share stays **literally one text**, which is what makes "one bolt of
cloth" a true statement rather than an asserted one. A second full style block would duplicate
~40 lines and let the substrate, the threads and the technique silently drift — the exact three
things that must not.

The stamped version becomes composite: `badges` → `v2` (unchanged on disk), `records` →
`v2+records1`. The version assertion in `check-badge-art.mjs` becomes per-deck, so each deck's
sidecars are compared against that deck's own computed current version.

---

## 5. The deck becomes a parameter, across four tools

`tools/make_badge_assets.py`'s header names this moment exactly:

> ONE DECK. The tool this descends from carries a `DECKS` table … Run Insights has only the badge
> shelf, so the table is four module constants. **If a second deck ever appears, restore the
> abstraction then.**

This is that second deck. The abstraction is restored — as **one** table, not four.

### `tools/decks.py` (new)

A `Deck` dataclass and two entries. Every tool takes `--deck`, **defaulting to `badges`**, so every
command in the badge deck's existing docs keeps working exactly as written.

| field | `badges` | `records` |
|---|---|---|
| scenes region | `<!-- SCENES -->` | `<!-- SCENES:records -->` |
| addendum | *none* | `<!-- ADDENDUM:records v1 -->` |
| style version stamped | `v2` | `v2+records1` |
| catalog | `lib/badges/catalog.ts` | `lib/records/catalog.ts` |
| key regex | `badge\('([a-z0-9_]+)'` | `key: '([a-z0-9_]+)'` |
| catalog array | `BADGE_CATALOG` | `RECORD_CATALOG` |
| masters | `assets/badges` | `assets/records` |
| public | `public/badges` | `public/records` |
| manifest | `lib/badges/badge-art.ts` | `lib/records/record-art.ts` |
| exported const / key type | `BADGE_ART` / `BadgeKey` | `RECORD_ART` / `RecordKey` |
| anchor | `assets/badges/_anchor.png` | **the same file** |

**The anchor is shared on purpose.** Check 9b measures twill-tone drift against it, and the whole
premise of both decks is that they are one bolt of cloth. A second anchor would let the cloth drift
between decks with nothing measuring it.

`decks.py` also writes **`tools/decks.json`**, because `scripts/check-badge-art.mjs` is JavaScript
and cannot import the Python table. A `selftest` assertion keeps the two in step — a hand-copied
second table is precisely how they would silently disagree.

### The parity assertion becomes per-deck

`gen_badge_art.py`'s `assert_parity` currently demands `<!-- SCENES -->` equal `BADGE_CATALOG`
exactly. **Following the card's literal wording — ten record scenes inside `<!-- SCENES -->` —
would make every badge generation refuse to start**, reporting ten orphan keys. So each deck's
scene region is checked against its own catalog, and the two cannot interfere.

### Per-tool changes

| tool | change |
|---|---|
| `gen_badge_art.py` | `--deck`; per-deck scenes/catalog/parity; addendum appended to the style block; composite version in the sidecar; `--aspect-ratio` (§6) |
| `check_badge_art.py` | `--deck` for the anchor path only. `shape_for` already scans all of `style.md`, so record scene lines resolve with no change |
| `make_badge_assets.py` | `--deck`; the four module constants become a `decks.py` lookup |
| `scripts/check-badge-art.mjs` | loops both decks from `decks.json`; per-deck style-version assertion |

### `next.config.ts`

The card missed this. `/badges/:file*` is served `max-age=31536000, immutable`, which is only safe
because the filenames are content-hashed. `public/records/**` is hashed the same way and needs the
same header — **without it the records deck is uncached, and with it but without hashing it would
be a year-long stale-image bug.** Both halves land together.

---

## 6. The aspect-ratio probe

**Subject: `most_elevation`.** A snow-capped peak inside a pentagon is the scene most sensitive to
vertical crop — if native 4:3 misplaces the patch, this is where it is visible rather than
arguable.

```bash
python3 tools/gen_badge_art.py most_elevation --deck records --aspect-ratio 4:3 --seed 1970
python3 tools/check_badge_art.py assets/records/_candidates/most_elevation.a01.png --deck records
```

9a's expectation on a 1024×768 frame is `0.855 × 768/1024 = 64.1%` of image width.

| outcome | what happens | what is recorded |
|---|---|---|
| **PASS** — 9a within tolerance *and* the theme strip reads | the remaining nine go native 4:3. The card is satisfied as written. | the measured width, here |
| **FAIL** | all ten go square → `extend_badge_art.py`, the proven path | the measured width and the failure mode, here, so this is never re-litigated from prose |

`--aspect-ratio` is added to `gen_badge_art.py` regardless, defaulting to `1:1`. The flag is cheap;
the finding is what is expensive.

**`RESOLUTION` stays `"1K"`.** The constant's comment is emphatic that OpenRouter ignores `size`
and defaults to 2K, *"so omitting these silently returns a 2048² master that check_badge_art.py
rejects on check 1 after the money is spent."* At `1K` with `4:3` the expected return is 1024×768,
which is exactly `MASTER_W, MASTER_H`.

---

## 7. Generation: one key per invocation

**Ten separate `/generate-badge` invocations. Never a batch loop.** The three-attempt cap and the
look-at-it step are per badge, and the skill and the card both say so. ~$0.04 and 4–5 minutes each
→ ~$0.40 and roughly an hour of wall-clock, plus regenerations.

The skill's step 2 finding is inherited unchanged: **the anchor is check 9's baseline and is NOT
passed as `--reference`.** `input_references` on `qwen/qwen-image-3-pro` behaves as a strong img2img
— it transfers the *subject* hard and the cloth tone not at all, which is fatal when inventing.
`--seed 1970` on every generation is what actually holds the deck together.

Judgement is the skill's step 5 in full, per key: the theme strip at 40 px and 220 px, the ring
crop for lettering, the centre crop for stitch texture. **Aesthetic calls are the implementer's;
this plan does not stop to ask which doughnut.**

Promotion to `assets/records/` is the human act the skill refuses to perform, and it is the `.wNN`
pair if §6 fell back to widening, the `.aNN` pair if it did not.

---

## 8. The manifest

`lib/records/record-art.ts`, generated by `make_badge_assets.py --deck records`, mirroring
`lib/badges/badge-art.ts` field for field:

```ts
export const RECORD_ART: Record<RecordKey, RecordArt> = { … }
```

**Total, never `Partial<>`.** An eleventh key in `RECORD_CATALOG` with no art fails
`npm run typecheck` in the same session, before anything ships. Per key:

- `src` — `768×576` WebP, the master's own 4:3, for the record panel's art band
- `small` — `192²` WebP, a **centre square crop**, not a squash. **Generated even though #25 may
  decide the one-line record row shows no thumbnail** — it is free at generation time and
  expensive to retrofit, which is exactly what the card asks for
- `sha256` — of `assets/records/<key>.png`, recomputed by `badges:check`, and what licenses the
  immutable header
- `twill` — mean of the master's outer 5% frame
- `styleVersion` — read from the sidecar, never from `style.md` (taking the current version would
  stamp every master "the version now" and make a mixed deck undetectable)

---

## 9. Commits, in order

1. **plumbing** — `tools/decks.py` + `decks.json`, `--deck` through the four tools, `--aspect-ratio`,
   the `Band` provenance and `pentagon` at `observed=0`, `next.config.ts`. All four `selftest`s pass.
2. **style** — the `<!-- ADDENDUM:records v1 -->` region and the ten `<!-- SCENES:records -->` lines,
   plus the extended collision audit.
3. **masters** — `assets/records/<key>.png` ×10 and their `.txt` sidecars.
4. **shipped art** — `public/records/**` and `lib/records/record-art.ts`. Its own commit, because
   regenerating `public/**` changes what ships, alongside `npm run badges:check` and
   `npm run typecheck`.
5. **band** — `pentagon` re-derived from the ten, `observed=10`, 9a goes hard for records.

---

## 10. Acceptance

- [ ] Ten masters at **exactly 1024×768**, ten manifest entries.
- [ ] `npm run badges:check` clean for **both** decks — hashes and twill recomputed from the
      masters, not trusted from the manifest.
- [ ] `npm run typecheck` **fails** when a record key has no art. Proven once by deleting an entry,
      then reverted.
- [ ] Each patch legible at the 56 px shelf size and at panel size — the skill's judgement step,
      not a metric.
- [ ] The badge deck is untouched: 22 masters unchanged, STYLE BLOCK v2 byte-identical, every
      undecorated `gen_badge_art.py` / `make_badge_assets.py` command behaving as before.
- [ ] `python3 taskcore.py`-style selftests: `decks.py`, `gen_badge_art.py`, `check_badge_art.py`
      and `make_badge_assets.py` all pass offline.
- [ ] The §6 probe's measured number is written into this file, whichever way it went.
