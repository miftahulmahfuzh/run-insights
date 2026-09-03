# F33 — Nina

A chatbot who lives in the app, remembers the runner, and comments on his training without being
asked. Sixteen phases, `v0.2.0`.

**The plan set lives in `.workflows/plan/nina-chatbot/`.** Start with `NINA_CHATBOT_PLAN.md` — the
index: the requirements table (R1–R26), the phase table, the dependency edges and the invariants
every phase is held to. Then `phase-<n>.md` for the phase you care about.

| # | Phase |
|---|---|
| 1 | schema, env, and the three repeals |
| 2 | the prompt layer and the context builder |
| 3 | the turn loop, the tools, the Server Action |
| 4 | `/nina` — the chat screen and the fifth tab |
| 5 | memory: distillation, slots, the ledger |
| 6 | images he sends her |
| 7 | quoting a message (R12) |
| 8 | attaching a run (R13) |
| 9 | patterns and the nag ladder |
| 10 | proactivity — she speaks first |
| 11 | Web Push and the unread badge |
| 12 | images she makes (RU-20: dispatched to GitHub Actions) |
| 13 | her album, her detail page, and the promise machine |
| 14 | the operator script — re-anchoring her face |
| 15 | `/admin/nina` — avatar upload and the circular crop |
| 16 | `/admin/memory` — hand-editing what she knows |

**The reconciler's rulings** — the cross-phase decisions that override anything an individual
phase plan says — are the rulings table in `NINA_CHATBOT_PLAN.md`. Three of them repeal earlier
project invariants and are recorded where those invariants live: RU-1 (body weight reaches every
LLM payload) in `RECONCILIATION_v0.1.0.md` R-28 and `ROADMAP_v0.1.0.md` §2/§6; RU-2 (runtime
OpenRouter generation, `lib/nina/` only) in `ROADMAP_v0.1.0.md` §2/§4.1/§6; RU-3 (push
notifications ship) in `ROADMAP_v0.1.0.md` §6.
