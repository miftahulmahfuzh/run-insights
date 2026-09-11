# docs/plans/archive/

The point-in-time plan record for everything through the Nina release (v1.0.0). Archived
2026-09-11: every plan here is **SHIPPED** or **SHIPPED+AMENDED** — none is the living spec
for anything anymore, and several were overruled in part or wholly after they landed.

**Read `docs/architecture.md` §13 (the plan-by-plan cross-reference) alongside any of these.**
Where a plan and the architecture document disagree, the architecture document wins; §13 says
exactly where and why, plan by plan.

## What is here

36 documents:

- `F01`–`F33` — one plan per feature, foundation to Nina, each carrying its own execution
  record where it has one (34 files: two plans both landed as `F16` before the 2026-09-11
  renumber below).
- `2026-09-10-admin-photos-icon-compact-profpic-design.md` and
  `2026-09-10-image-gen-controls-design.md` — the two design docs behind the admin console's
  photos redesign and image-gen controls.

## The F16b renumber

Plan numbers were assigned `F<N+1>`-style across parallel sessions, and the race produced two
collisions. The `F16` one: `F16-splits-column-gutters.md` (card #2, commit `bc01bf4`,
2026-08-21 22:10:02 +0700) and `F16-upload-kind-swap.md` (card #3, commit `ed98bee`, 23
minutes later). At archival the race's second claimer was renamed
**`F16b-upload-kind-swap.md`** — the first free suffix, keeping the archive listing in order
and keeping the `F16` stem that every historical reference greps for. Content is
byte-identical; only the filename changed. (The other race, `F20→F21/F22`, needed no rename —
the numbers themselves are unique.)

## Conventions inside these records

- Cross-references inside the plans were written before the archival and still say
  `docs/plans/…` (and some `expense-tracking/docs/plans/…`, which point at a different
  repo's plans and were never valid here). They are left exactly as written: these are
  records. The live pointers — in `README.md`, `CHANGELOG.md`, source comments, the CI
  guards' error strings, the badge-art tools and the generate-badge skill — were all
  repointed at this directory at archival time.
- Later plan sets, after this series ended, live under `.workflows/plan/<set>/`, not here.
  `F33-nina.md` is the pointer plan into that system for Nina.
