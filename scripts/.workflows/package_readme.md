# Package: scripts

`npm run nina:dedupe-media` (`nina-dedupe-media.mjs`) is dry-run by default: no flag prints the
plan and writes nothing; `--apply` writes (hash fills, row repoints, blob releases) and is
idempotent. `--apply` has NOT yet been run against production — live data has drifted from the
acceptance snapshot (only 1 of the 2 measured duplicate findings remains), so run a FRESH dry run
and have a human read it before any `--apply`.
