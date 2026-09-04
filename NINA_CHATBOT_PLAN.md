# Plan: Nina — the proactive chatbot friend (F33)

**Slug:** nina-chatbot
**Date:** 2026-09-03 14:03:08 +07
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Worktree:** `~/.worktrees/run-insights/nina-chatbot` — cut on this machine 2026-09-03; recreate with `task_gh.py worktree`
**Branch:** `feature/nina-chatbot` (base: `origin/main` @ `2119947`)
**Phases:** 16
**Status:** planned
**Cross-phase authority:** `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` — **normative.**
Where a phase plan and that sheet disagree, **the sheet wins.**

---

## Why

The user's rationale, verbatim, is reproduced in full in the analysis document's **User Input**
section and is the specification for this feature. The load-bearing sentences:

> she is not exactly an "assistant", and more of a "friend" or "a best friend who will be harsh on
> you to make you a better person. to always say things as it is and be honest about everything"

> 99% of chatbot out there is a passive chatbot. FUCK THAT. the iron rule of this chatbot is
> proactivity. integrate nina seamlessly into user experience.

> do not stint on burning tokens … basically i want nina to pass turing test.

> everything before that conflict with this new feature. must be changed.

> i am the only one that uses this app. so i dont care about any privacy whatsoever. this is my
> personal toy. just let me do whatever i want with it

The last two sentences are what authorise the repeals below. They are a decision, not a drift.

---

## Worktree setup — read this before implementing

`git worktree add` does not copy `node_modules`, so this worktree had none. Since **AGENTS.md
requires reading `node_modules/next/dist/docs/` before writing any code** — this is Next 16.3.1 and
not the Next.js in anyone's training data — a symlink was created during planning so the phase
planners could read those guides:

    node_modules -> /home/miftah/run-insights/node_modules

**That symlink is for READING only, and implementation must replace it with a real install.** It is
shared with the main checkout, so `npm install` through it would mutate the other tree's
dependencies — and phase 14 adds `sharp` as an explicit devDependency, phase 11 adds `web-push`.
First implementation step, before anything else:

    rm node_modules && npm install

`.gitignore` already ignores `/node_modules`, so neither the symlink nor the install is committable.

---

## Verified live, 2026-09-03 — do not re-litigate these

Phase 3 named the agentic tool loop as its largest unproven assumption: F07 only ever sent
`tool_choice: {type:'tool', name}` and never fed a `tool_result` back, so nothing in this repo knew
whether `api.z.ai/api/anthropic` supports a real loop. **It was probed directly against `glm-5.3`
before implementation.** Results, measured:

| Property | Result |
|---|---|
| `tool_choice: {type:'any'}` honoured | **YES** |
| `tool_use` block emitted | **YES** (`lookup_runs`) |
| `tool_result` accepted on the next turn | **YES** |
| Round 2 answered with another `tool_use` | **YES** (`send`) |
| Round 2 quoted the injected facts faithfully | **YES** — 10.67 km, 7'22"/km, 168/181, no invention |
| Round 1 / round 2 latency | 6.2 s / 7.6 s — **13.8 s for a two-round turn** |
| Token cost | round 1: 310 in / 29 out · round 2: 395 in / 94 out |

So phase 3's architecture stands and its named fallback (two plain text turns instead of tools) is
not needed. Its 45 s overall budget has real headroom at two rounds.

**RU-13 is validated too.** Given only "Today is Wednesday 2026-09-03" in the system text, the
prompt *"na, lari gw kemaren gimana?"* produced `lookup_runs({dates:["2026-09-02"]})` — correct,
with no date-parsing machinery of any kind. R15 needs the model to emit ISO strings and it does.

### ⚠ One correction: `thinking: {type:'disabled'}` was NOT honoured on round 1

The request set `thinking: {type: 'disabled'}` and the response **still contained a `thinking`
block** (`["thinking","tool_use:lookup_runs"]`). Round 2 contained none. Phase 3's plan states that
this flag is load-bearing on all three body shapes and that removing it "produces no reply at all,
twice per turn" — that claim is inherited from F31, which measured a *text* completion, and it is
**not** what this endpoint does for a tool call. What actually happened: thinking appeared anyway,
cost 29 output tokens, and a valid `tool_use` came back regardless.

Two consequences for implementation, and neither is "delete the flag":

1. **Keep sending it** — it is harmless and it is what F31 measured for the narrative path.
2. **Do not rely on it** for `max_tokens` arithmetic. A thinking block can appear even when
   disabled, so `NINA_MAX_TOKENS` must have room for one, and the loop must tolerate a
   `thinking` block sitting before the `tool_use` rather than treating a non-`tool_use` first
   block as malformed. A parser that reads `content[0]` instead of scanning for the block would
   have failed on round 1 of this very probe.

The probe script is `probe-tools.mjs` in this session's scratchpad; re-run it against any endpoint
change before assuming these results still hold.

### ⚠ A second correction, measured 2026-09-04 while implementing phase 3: `tool_choice` IS NOT HONOURED EITHER

The table above says `tool_choice: { type: 'any' }` is honoured, and it is — **on the first call.**
Driving the finished loop against `glm-5.3` (not a hand-built probe: `runNinaTurnWith` itself, with
a spy on the client) showed the flag being ignored on later calls, intermittently:

| Call | Request | Response |
|---|---|---|
| 1 | `tool_choice {any}`, 4 tools | `stop_reason tool_use`, `[thinking, tool_use]` ✓ |
| 2 | `tool_choice {any}`, 4 tools | `stop_reason end_turn`, `[thinking, text]` ✗ |
| 3 | `tool_choice {tool, name:'send'}`, **`tools: [SEND_TOOL]` alone** | `stop_reason end_turn`, `[thinking, text]` ✗ |

Row 3 is the load-bearing one: that is the **strictest request this endpoint accepts** — one tool
offered, that tool named — and it still answered with a paragraph. Her actual reply was sitting in
the `text` block both times. It is intermittent, not deterministic: several probes of the same
continuation did return a `tool_use`, and one in four full turns degraded.

So `tool_choice` is a **request, exactly like `thinking: { type: 'disabled' }`**, and the same rule
applies to it: keep sending it, never do arithmetic against it. Phase 3's plan built one branch on
the assumption it was a guarantee — "with `{ type: 'auto' }` she may answer in prose, which this
loop correctly reads as malformed and then repairs" — and treated a prose answer as a dead end,
which threw away a reply she had already written and told the runner she was not answering.

**What phase 3 ships instead**, and it is the plan's own reasoning followed one step further: a
turn that answers in prose is echoed its own text back, told that only `send` is delivered, and
asked once more with `send` forced. It costs **one extra model call**, held in `MAX_PROSE_RETRIES`
and deliberately NOT taken out of `MAX_TOOL_ROUNDS`' allowance — because the measured failure is a
turn that spends both rounds on real tool calls and *then* answers the forced `send` with prose, so
a shared budget leaves nothing to re-ask with. It does not touch the repair budget, which stays
reserved for a malformed `send`. `nina_turns.tool_calls` records `prose:no_tool` so the rate is
measurable rather than folklore.

Measured after the fix: **five consecutive live runs of `npm run test:live:nina`, all green**,
against nought for three before it. `lib/nina/turn.test.ts` pins all four shapes — prose on the
first call, prose after a tool round, prose on the forced `send` after both rounds, and prose twice
in a row degrading honestly.

*Revisit if* z.ai starts honouring `tool_choice`, at which point the branch becomes dead code that
costs nothing and the tests still pass.

### ⛔ Image generation does NOT fit Vercel Hobby — measured, not estimated

Phase 12 named this its largest risk: `tools/gen_badge_art.py`'s comment records an anchored Qwen
call "measured at just over two minutes", against a 60 s Hobby function ceiling in `sin1`. **It was
measured directly**, with a 765×1024 downscale of `nina.png` as the anchor and a realistic
post-run-selfie prompt:

| Property | Measured |
|---|---|
| Endpoint / model | `POST /api/v1/images/generations`, `qwen/qwen-image-3-pro` |
| Anchor transport | `input_references[0].image_url.url` as a base64 data URL, 1,665 KB |
| **Latency** | **148.9 s** |
| Returned image | 1,184 KB, `b64_json` |
| **Cost** | **$0.043** — and `usage.cost` / `usage.cost_details` ARE reported |
| Fits Hobby (60 s) | **NO — 2.5× over** |
| Fits Pro (300 s) | yes |

Two consequences:

1. **R18 and R19 cannot ship on Hobby as designed.** Every generation would hit the deadline, so
   R22's apology would be the only outcome the runner ever sees — the feature would be a permanent
   apology generator. This is a platform decision, not a code decision, and it is recorded in Open
   Questions for the user rather than worked around.
2. **Phase 12's cost constant should be the reported value, not a guess.** Its plan flags
   "whether this endpoint reports it is UNVERIFIED" — it does. `usage.cost` is authoritative;
   `NINA_IMAGE_COST_MICRO_USD` becomes a fallback for when it is absent.

#### Then the anchor was dropped (RU-18), so the shipping path was measured too

Because the 148.9 s above included uploading a 1,665 KB base64 anchor, the *actual* shipping path —
no `input_references` at all — was re-measured before committing to any infrastructure:

| Path | Latency | Cost | Fits Hobby (60 s) |
|---|---|---|---|
| anchored (`input_references`) | 148.9 s | $0.043 | **NO** |
| **unanchored (ships)** | **78.2 s** | $0.040 | **NO** |

Dropping the anchor nearly **halves** the call, which matters for whatever ends up running it — but
78.2 s is still over the ceiling, so **RU-19 stands**: generation runs outside Vercel. The check was
worth making anyway; it would have been embarrassing to build a worker for 149 s and then discover
the real number was 40.

**Output quality is verified and it is good.** The unanchored image was kept
(`nina-selfie-unanchored.png` in the session scratchpad): a convincing phone mirror-selfie of a
young Indonesian woman in running clothes, flushed and grinning, with an invented but plausible
`JL. KEMANG SELATAN` street sign, an `RT 05 / RW 02` plate, parked motorbikes, bougainvillea and a
cat on the wall. That is exactly R18's bar as the user restated it in RU-18 — *"i only want
successful image generation … that's all"* — met with no reference image.

Face fidelity is therefore **not** an open question any more; it is deferred work (RU-18).

The probe scripts are `probe-imagegen.mjs` (anchored) and `probe-unanchored.mjs` (shipping path) in
this session's scratchpad.

---

## Rulings

Twenty-one decisions. RU-1..RU-17 were taken in discussion before planning; RU-18..RU-21 landed
mid-flight, after measurement. **These are settled. A phase planner that disagrees states the
disagreement and its own reasoning inline — it does not re-decide, and per RU-21 it does not defer
to a human either.**

| # | Ruling |
|---|---|
| RU-1 | **D15/R-28 is repealed app-wide.** Body weight enters every LLM payload, public share pages included. The guard's weight rule is deleted and its header rewritten to record the repeal. |
| RU-2 | **D12 is repealed for `lib/nina/` only.** Runtime OpenRouter image generation, queued and daily-capped. Badge and record art stay offline-and-committed. |
| RU-3 | **Push notifications ship.** Unread badge on the tab, plus real Web Push where the browser supports it. Struck from the roadmap's non-goals. |
| RU-4 | **Pre-injected core, tools for the rare.** Every turn carries datetime, profile, memory, recent runs, records, badges, fired patterns. Tools are for the expensive and unpredictable only. |
| RU-5 | **Multi-bubble, staggered.** Nina returns 1–4 short messages; the client reveals them one at a time behind a typing indicator. Each is a real row, so each is independently reply-able. **No SSE.** |
| RU-6 | **Memory is slots plus a ledger.** Upserted structured slots drive proactivity; an append-only fact ledger with `source_message_id` drives colour. |
| RU-7 | **Per-user Nina.** Avatar album keyed by `user_id`; blobs under `nina/<userId>/`. |
| RU-8 | **She knows the name and confirms the nickname.** `users.name` seeds it; she asks what to call him. |
| RU-9 | **Anger is computed, then escalated.** `lib/nina/patterns.ts` computes named longitudinal codes; `lib/nina/nags.ts` records what she has already said so the third time escalates instead of repeating. |
| RU-10 | **The persona canon is drafted in this plan set** as `docs/nina/persona.md`, for the user to redline later. |
| RU-11 | **Phased, every phase shippable.** The tree builds green and the app stays usable at every phase boundary. |
| RU-12 | **Nina's eyes are `glm-4.6v`.** It writes a dense private description; `glm-5.3` reacts in character to that description. `glm-5.3` is never sent an image. |
| RU-13 | **Nina emits ISO dates into `lookup_runs`.** The server validates the strings and answers with precomputed facts or an explicit "no run that day". |
| RU-14 | **Last N turns verbatim plus structured memory.** N is a named constant, initially 40 messages. No rolling summariser. |
| RU-15 | **All four proactive triggers ship:** committed run, missed usual day, crossed pattern threshold, prolonged silence. |
| RU-16 | **`/update-nina-profpic` always re-anchors.** The uploaded image replaces `assets/nina/_anchor.png`, so every later generation matches the new face. |
| RU-17 | **A hand-uploaded avatar makes her speak.** The script writes a proactive trigger; she comments on it in character next time she talks. |
| RU-18 | **THE FACE ANCHOR IS DROPPED.** The user, after the latency measurement: *"dont worry about her face being the same or not. after thinking about it, i think we should just save this requirement (keeping the same face) for future implementations. i only want successful image generation. user ask 'coba kirim foto lu lari tadi na', will succesfully result in nina generated an image. that's all"* — so generation sends NO `input_references`, R20 keeps only its first half (`nina.png` is her initial avatar), and consistent-face generation is deferred to a future feature. |
| RU-19 | **Generation runs OUTSIDE Vercel.** Measured at 78.2 s unanchored against a 60 s Hobby ceiling, so the user chose an external worker over a Pro upgrade, a weaker model, or a best-effort attempt. |
| RU-20 | **The worker is GITHUB ACTIONS, dispatched by `workflow_dispatch`.** Chosen so the user did not have to: the repo already has `.github/`, so there is no new service, no monthly bill and nothing to keep alive; repo secrets already exist as a secret store; a 78 s job fits the 6 h job ceiling with absurd headroom; and it is unattended, unlike the user's laptop. QStash and Inngest both lose on one technicality — they call *back* into a Vercel function, which is the 60 s ceiling being escaped. A Fly/Railway worker is a container to maintain for six images a day. It is also idiomatic here: `scripts/blob-reap.mjs` and the backfill scripts are already Node scripts that write production directly, and a workflow running one is the same act with a different trigger. A `schedule:` backstop sweep recovers any lost dispatch, which is the reliability a third Vercel cron would have provided and Hobby forbids. Budget: ~180 runs/month against GitHub Free's 2,000 minutes. |
| RU-21 | **NO HUMAN IN THE LOOP, IN DESIGN OR IMPLEMENTATION.** The user, verbatim: *"i dont need to choose the real candidates myself. you must do everything. just choose one for me. make sure no human in the loop exist during design nor implementation"*. Consequences, binding on every phase, on the reconciler, and on `/implement`: **Open Questions must be EMPTY.** An unresolved question is not parked for the user — it is decided, the decision is stated with its reasoning, and the reasoning records what would change the answer. A phase may not emit "ask the user whether…"; it emits "decided X because Y; revisit if Z." Where a genuine unknown remains, the plan picks the reversible option and says what would falsify it. `/implement` never stops to ask. |

---

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | `glm-5.3` for every prompt, tokens no object; proactive, natural, funny; passing for human | 2, 3, 4 |
| R2 | Reply in the user's language; Indonesian means Jakarta dialect and `lo`/`gw` slang | 2 |
| R3 | Proactivity is the iron rule; Nina is integrated, not bolted on | 10, 11 |
| R4 | Distil everything the user reveals, permanently, as the main context | 5 |
| R5 | Nutritionist / running expert / physiologist, explaining non-technically and funnily | 2 |
| R6 | Access to everything stored: runs, badges, records, height, gender, weight | 1, 2 |
| R7 | Learn the user's name and use its Indonesian short form | 5 |
| R8 | React proactively to a newly committed run, and to what it earned | 10 |
| R9 | A new tab between Runs and `+`, leaving `+` exactly centred | 4 |
| R10 | Accept images: image plus text, or image alone | 6 |
| R11 | Be angry when warranted; tough love on repeated late starts and repeated high HR | 9 |
| R12 | WhatsApp-style reply-to for either party; tapping the quote scrolls to that message | 7 |
| R13 | Attach a run to Nina from an icon button, with or without text | 8 |
| R14 | Tapping an attached run opens run detail; going back restores the exact scroll position | 8 |
| R15 | Resolve natural date references, compare two runs, handle "no run that day" | 3 |
| R16 | The exact current date and time is part of Nina's context | 2 |
| R17 | A WhatsApp-style Nina detail page: avatar full-screen, every image from the chat | 13 |
| R18 | Nina generates images via OpenRouter and Qwen Image 3 Pro, as a tool she chooses | 12 |
| R19 | Remember a conditional promise, honour it by changing her avatar, keep an album, announce it | 13 |
| R20 | `nina.png` is her first avatar. **The "face anchor for every generation" half is dropped by RU-18** and deferred to a future feature | 1 |
| R21 | A `/update-nina-profpic <image_file_path>` skill that pushes a local image to production | 14 |
| R22 | A failed image generation is announced by Nina in chat, non-technically; never an endless wait | 12 |
| R23 | A desktop `/admin/nina`: album add/remove, pick the current photo, zoom and reposition a face in a circular frame | 15 |
| R24 | A desktop `/admin/memory`: read and edit every user's distilled memory, as a deliberate backdoor | 16 |
| R25 | Asked where she is in her new profile photo, Nina invents a story true to the photo and the chat history | 13 |
| R26 | An "attach to chat" button in the album's zoomed-photo state, with or without a question | 13 |

**Two phases serve more than one R, and neither split is available.** Phase 2 is the prompt, and
voice (R2), expertise (R5), context inclusion (R6) and the clock (R16) are all properties of one
system prompt and one facts builder — splitting them would leave both halves unable to produce a
reply. Phase 8 serves R13 and R14 because the user wrote them as `#11` and `#11a`: the attachment
and the round trip through it are one interaction. Phase 13 serves R17, R19 and R20 because the
album, the avatar swap and the anchor are one screen and one lifecycle.

---

## Decisions taken under RU-21 that would otherwise have been questions

**F07's coach narrative DOES get weight and sex.** Phase 1 widened `NarrativeProfile` (the input
type) but deliberately left `ProfileFacts` alone, so weight reached Nina and not the run-detail
insights — and it flagged that as a choice for someone else to make. Under RU-21 it is made here:
**add `weightKg` and `sex` to `ProfileFacts` and to the three narrate prompts.** The user's stated
reason for repealing D15 was that "exposing user details like weight to ai analysis will 100% make
the analysis much more accurate", and an insight that cannot see them is the half of the repeal
that does nothing.

The cost is real and accepted: it changes the facts fed to the model, so `factsHash` moves and
**every cached insight regenerates on next view**. That is one model call per run the user actually
opens, spread over time, against a user who said "do not stint on burning tokens". The reconciler
folds this into phase 1, which already edits `lib/llm/facts.ts`.

*Revisit if* the regeneration cost ever matters — the escape is to seed the new fields only for
runs newer than a cutoff date, which keeps old hashes stable.

## Scope

**In scope:** everything in the Requirements table. Eight new tables and one new `profiles`
column, plus a crop transform and a description on `nina_avatars`. A new `lib/nina/` module tree. A fifth tab and two new screens. A `glm-4.6v` describe
pre-pass. A runtime OpenRouter path. A proactivity engine on cron plus `after()`. The app's first
service worker, and Web Push. One local operator skill. Two desktop admin screens behind an email-matched gate — the app's
first non-mobile UI. Three documented invariant repeals.

**Out of scope, and why:**

- **A consistent face across generated images.** RU-18. Generation sends no reference image; every
  selfie is a fresh young Indonesian woman in running clothes. The user deferred this knowingly,
  after seeing that the anchor doubled latency (148.9 s vs 78.2 s) for a property he did not need
  yet. `assets/nina/_anchor.png` is still committed by phase 1 so the future feature has its seed.
- **Streaming (SSE).** RU-5 chose staggered multi-bubble instead. Revisit only if a measured turn
  latency makes the typing indicator dishonest.
- **A rolling conversation summariser.** RU-14. The fact ledger is the long-term memory.
- **Offline support / a caching service worker.** Phase 11's worker handles `push` and
  `notificationclick` and nothing else. Serwist and friends are a separate decision.
- **Changing how badges, records, metrics or extraction work.** Nina reads them. She does not
  compute them and does not get her own copies. A number she needs that F06 does not compute is a
  change to F06, in its own card, not a calculation in a prompt.
- **`RECONCILIATION_v0.1.0.md` rulings other than R-28.** R-1, R-5, R-7, R-8, R-9, R-11, R-12 and
  R-22 all stand. In particular **R-22's non-cascade `badges.run_id` and its plain `dedupe_key`
  are not to be touched** — the analysis records why a generated column breaks `DELETE FROM runs`.
- **The `NEXT_PUBLIC_` prohibition.** It survives. The VAPID public key is read server-side and
  passed to the client component as a prop.

---

## Invariants

Rules every phase must hold. A phase that breaks one is not done.

1. **The tree builds and the suite passes at every phase boundary.**
   `npm run typecheck && npm run lint && npm test` plus every `ci:*` guard.
2. **Nina never states a number the app did not compute.** `lib/nina/context.ts` is the boundary,
   in the shape of `lib/llm/facts.ts`. If F06 has not precomputed it as a field, it does not exist
   to her. The measurement behind this rule — a flipped sign on aerobic decoupling — is in the
   analysis. R15's comparison is a *precomputed* comparison served by a tool.
3. **Every number she reads is spelled the way the screen spells it.** Strings come from
   `lib/format.ts`, the same calls the run detail page makes.
4. **No model call is ever awaited in a render path.** The rule that guards
   `getOrCreateInsight` now guards Nina's turn entry point too, in the same CI grep.
5. **`glm-5.3` is never sent an image.** The endpoint answers 200 and silently drops it. Images go
   to `glm-4.6v` and arrive at Nina as text.
6. **UI behaviour worth testing is a pure function in `lib/`.** Vitest is `environment: 'node'`
   with no jsdom. Follow `lib/photos/gallery.ts`, which was extracted from `PhotoViewer.tsx` for
   exactly this reason.
7. **Ownership scoping stays.** Every read and write is keyed by `userId` even though there is one
   user. The query layer is built that way; diverging from it is more work, not less.
8. **A repeal is a rewrite, not a deletion.** Each guard edited in phase 1 keeps its explanatory
   header and gains a sentence naming the ruling that changed it. No guard is silenced, no check
   is commented out, and `BOUNDARY_DIRS` stays exported because `check-badge-art.mjs` imports it.
9. **`reviewed_at IS NOT NULL` still gates every aggregate.** Nina reads through
   `lib/db/queries.ts`; she does not write her own SQL against `runs`.
10. **No `NEXT_PUBLIC_` anywhere in `app/`, `lib/` or `components/`.**

---

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 | Schema, env, and the three repeals | R6, R20 | `lib/db`, `scripts`, `assets` | 26 | — | NORMAL | `.workflows/plan/nina-chatbot/phase-1.md` | — | — |
| 2 | Persona canon, context boundary, prompts | R1, R2, R5, R6, R16 | `lib/nina`, `docs/nina` | 10 | 1 | HARD | `.workflows/plan/nina-chatbot/phase-2.md` | — | — |
| 3 | Turn engine, tools, multi-bubble | R1, R15 | `lib/nina` | 14 | 1, 2 | HARD | `.workflows/plan/nina-chatbot/phase-3.md` | — | — |
| 4 | The tab and the chat screen | R9, R1 | `components/nina`, `app/nina` | 14 | 1, 2, 3 | NORMAL | `.workflows/plan/nina-chatbot/phase-4.md` | — | — |
| 5 | Memory: slots, ledger, the name | R4, R7 | `lib/nina` | 9 | 1, 2, 3 | HARD | `.workflows/plan/nina-chatbot/phase-5.md` | — | — |
| 6 | Her eyes: vision pre-pass and chat images | R10 | `lib/nina`, `app/api/upload` | 16 | 1, 3, 4 | HARD | `.workflows/plan/nina-chatbot/phase-6.md` | — | — |
| 7 | Reply-to and scroll-to-message | R12 | `lib/nina`, `components/nina` | 11 | 3, 4 | NORMAL | `.workflows/plan/nina-chatbot/phase-7.md` | — | — |
| 8 | Run attachments and the round trip | R13, R14 | `lib/nina`, `components/nina`, `app/r` | 17 | 3, 4 | HARD | `.workflows/plan/nina-chatbot/phase-8.md` | — | — |
| 9 | Patterns and the nag ledger | R11 | `lib/nina` | 4 | 1, 2 | NORMAL | `.workflows/plan/nina-chatbot/phase-9.md` | — | — |
| 10 | Proactivity: triggers, cron, unread | R3, R8 | `lib/nina`, `app/api/cron`, `lib/review` | 15 | 1, 3, 4, 5, 9 | HARD | `.workflows/plan/nina-chatbot/phase-10.md` | — | — |
| 11 | Web Push and the first service worker | R3 | `lib/push`, `lib/service-worker.js` | 18 | 1, 10 | HARD | `.workflows/plan/nina-chatbot/phase-11.md` | — | — |
| 12 | Image generation, capped and honest | R18, R22 | `lib/nina`, `scripts`, `.github/workflows` | 16 | 1, 2, 3, 4, 6 | HARD | `.workflows/plan/nina-chatbot/phase-12.md` | — | — |
| 13 | Her page, her album, her promises | R17, R19, R25, R26 | `app/nina`, `components/nina`, `lib/nina` | 22 | 1, 4, 5, 6, 12 | HARD | `.workflows/plan/nina-chatbot/phase-13.md` | — | — |
| 14 | The `/update-nina-profpic` skill | R21 | `scripts`, `.claude/skills` | 5 | 1, 12 | NORMAL | `.workflows/plan/nina-chatbot/phase-14.md` | — | — |
| 15 | Admin: the desktop shell and her album | R23 | `app/admin`, `lib/admin`, `components/admin` | 17 | 1, 12, 13 | HARD | `.workflows/plan/nina-chatbot/phase-15.md` | — | — |
| 16 | Admin: the memory editor | R24 | `app/admin`, `lib/admin` | 12 | 1, 5, 15 | NORMAL | `.workflows/plan/nina-chatbot/phase-16.md` | — | — |

### Phase 1 — Schema, env, and the three repeals
**Satisfies:** R6, R20
**Owns:** the migration (eight tables: `nina_messages`, `nina_message_images`, `nina_memory_slots`,
`nina_memory_facts`, `nina_avatars`, `nina_nags`, `nina_turns`, `push_subscriptions`) plus
`profiles.sex`; `lib/nina/queries.ts`; `lib/env.ts` gaining `OPENROUTER_API_KEY`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`; `.env.example`; **RU-1** (the weight rule out of
`check-llm-payload-boundary.mjs`, `NarrativeProfile` gaining `weightKg` and `sex`); **RU-2**
(`lib/nina/` out of `check-openrouter-boundary.mjs`'s `DIRS`); **RU-3** and the other two roadmap
amendments; promoting `nina.png` to `assets/nina/_anchor.png` and `public/nina/avatar-001.png`;
the profile form gaining a sex field; and `ADMIN_EMAILS` in `lib/env.ts` (the variable only —
phase 15 owns the gate itself).
**Does not touch:** any prompt, any component under `components/nina/`, any route.
**Exit criteria:** `npm run db:generate` produces one migration that applies cleanly; every `ci:*`
guard passes with its new rules; the F07 narrative still generates with a widened profile; the two
committed PNGs exist and `nina.png` is gone from the repo root.

### Phase 2 — Persona canon, context boundary, prompts
**Satisfies:** R1, R2, R5, R6, R16
**Owns:** `docs/nina/persona.md` (the canon: who she is, how she talks, the Jakarta register, the
anger ladder, her physical description for the image anchor); `lib/nina/persona.ts`;
`lib/nina/context.ts` (pure, the boundary — datetime in Asia/Jakarta, profile including weight and
sex, memory, recent runs, records, badges, patterns); `lib/nina/load.ts` (the fetching half);
`lib/nina/prompts/*.ts` (system text and every tool schema as constants).
**Does not touch:** the turn loop, any component, any route. It produces strings and objects.
**Exit criteria:** a unit test builds a full context object from fixture rows and asserts weight
and sex are present, every pace string came from `lib/format.ts`, and the Jakarta datetime is
correct across a DST-free UTC+7 boundary. No model call in this phase.

### Phase 3 — Turn engine, tools, multi-bubble
**Satisfies:** R1, R15
**Owns:** `lib/nina/turn.ts` (the agentic loop over `glm-5.3`, budgeted, Zod plus one repair);
`lib/nina/tools.ts` (`lookup_runs`, `compare_runs`, `save_memory` — definitions and dispatch);
`lib/nina/dates.ts` (ISO validation and the no-run-that-day answer); `lib/nina/schema.ts` (the
`{ bubbles: [1..4], memory_writes, reply_to }` payload); `lib/nina/actions.ts` (the Server Action).
**Does not touch:** `generate_image` or `set_avatar` (phases 12–13), the distillation pass
(phase 5), any component.
**Exit criteria:** a fake client drives the loop through a tool call and back; a malformed reply
triggers exactly one repair; `compare_runs` returns precomputed deltas and never raw run pairs;
asking for a date with no run yields an explicit absence, not an empty object; the CI grep now
guards this module's entry point against render-path callers.

### Phase 4 — The tab and the chat screen
**Satisfies:** R9, R1
**Owns:** `TabBar.tsx` at `grid-cols-5` with `+` in cell 3; `AppShell.tsx` admitting `/nina`;
`app/nina/page.tsx`; `components/nina/*` (message list, bubble, composer, typing indicator,
staggered reveal); `lib/nina/reveal.ts` (the reveal-timing arithmetic, pure and tested).
**Does not touch:** reply-to (7), attachments (8), images (6), the unread badge (10).
**Exit criteria:** the runner can send a message and receive staggered bubbles; `+` is
pixel-centred; the reveal function is unit-tested; no jsdom test was written.

### Phase 5 — Memory: slots, ledger, the name
**Satisfies:** R4, R7
**Owns:** `lib/nina/memory.ts` — the distillation pass over a finished turn, slot upserts, ledger
appends, the nickname derivation, and the first-conversation name confirmation seeded from
`users.name`; the `pending_promises` slot shape that phase 13 consumes.
**Does not touch:** the cron that reads the slots (10), the promise evaluator (13).
**Exit criteria:** a fixture conversation yields the expected slots and ledger rows; a
contradicting later statement replaces the slot and leaves both ledger rows; a nickname is derived
from a multi-word name; `pending_promises` has a documented shape phase 13 can read.

### Phase 6 — Her eyes: vision pre-pass and chat images
**Satisfies:** R10
**Owns:** `lib/nina/vision.ts` (the `glm-4.6v` describe call, OpenAI-shaped, with its own token
floor); the `chat/` pathname branch in `app/api/upload/route.ts`; `nina_message_images` writes; the
composer's image picker; image-only turns.
**Does not touch:** image generation (12), the album (13).
**Exit criteria:** an image-only message produces a reply that references what is in the picture;
`glm-5.3` receives text and never an image block; a dropped image is caught by the floor rather
than believed.

### Phase 7 — Reply-to and scroll-to-message
**Satisfies:** R12
**Owns:** `nina_messages.reply_to_id` end to end; the quote UI; `lib/nina/reply.ts` (quote
resolution and the scroll-target rule, pure); Nina's own ability to reply to a specific message;
tapping a quote scrolling to its target.
**Does not touch:** attachments (8).
**Exit criteria:** either party's message can be quoted; the quote is in Nina's context for that
turn; tapping scrolls to the target; a quote whose target was deleted degrades to plain text.

### Phase 8 — Run attachments and the round trip
**Satisfies:** R13, R14
**Owns:** the icon-only share-to-Nina button on `app/r/[id]/page.tsx`; `nina_messages.run_id`; the
attachment card in the chat; tapping it navigating to run detail; `lib/nina/scroll.ts` (the
scroll-restoration arithmetic, pure) so returning lands on the exact prior position rather than
the newest message.
**Does not touch:** reply-to (7).
**Exit criteria:** a run can be attached with or without text; Nina answers about the attached run
using precomputed facts; the round trip restores the scroll position; the restoration rule is
unit-tested. **Read `02-guides/preserving-ui-state.md` and `01-getting-started/04-linking-and-navigating.md`
before writing this** — Next 16's scroll behaviour is not the Next.js in training data.

### Phase 9 — Patterns and the nag ledger
**Satisfies:** R11
**Owns:** `lib/nina/patterns.ts` — named longitudinal codes with exported, strict thresholds, in
the exact shape of `lib/metrics/flags.ts` (at minimum: repeated late starts, repeated high average
HR, a missed usual day, pace regression, an ACWR spike); `lib/nina/nags.ts` — the escalation
ledger, so the third mention escalates rather than repeats.
**Does not touch:** the triggers that fire on these codes (10), the prompt's anger ladder (2).
**Exit criteria:** every code has one test at the threshold that does not fire and one just past
it that does; escalation level rises on repeat and decays after compliance; **the model never
coins a code.**

### Phase 10 — Proactivity: triggers, cron, unread
**Satisfies:** R3, R8
**Owns:** `lib/nina/proactive.ts` (all four triggers from RU-15); the `after()` hook in
`lib/review/commit.ts` so a committed run makes her speak without delaying the redirect;
`app/api/cron/nina/route.ts` plus its `vercel.json` entry, following the rollup cron's
`CRON_SECRET`, soft-deadline and per-user-`try` shape; the unread count and the badge on the Nina
tab.
**Does not touch:** Web Push delivery (11).
**Exit criteria:** committing a run writes a reactive message naming the records and badges it
earned; a missed usual day fires once and not twice; the cron respects its soft deadline and one
user's failure stops nothing; the tab shows an unread dot.

### Phase 11 — Web Push and the first service worker
**Satisfies:** R3
**Owns:** `lib/service-worker.js` (`push` and `notificationclick` only); its registration;
`lib/push/*` (VAPID send path over `web-push`); the subscribe and unsubscribe actions;
`push_subscriptions` writes; the iOS install hint; the service-worker headers in `next.config.ts`.
**Does not touch:** offline caching, trigger logic (10).
**Exit criteria:** a subscription round-trips and persists; a proactive message delivers a
notification whose tap opens `/nina`; the VAPID public key reaches the client **as a prop, never as
`NEXT_PUBLIC_`**, and `ci:client-secret-guard` still passes. **Read
`02-guides/progressive-web-apps.md` first** — it carries the exact recipe, and note that its
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` step is deliberately not followed here (invariant 10).

### Phase 12 — Image generation, capped and honest
**Satisfies:** R18, R20, R22
**Owns:** `lib/nina/imagegen.ts` (OpenRouter `qwen/qwen-image-3-pro`, the anchor as reference —
port the call shape from `tools/gen_badge_art.py`, including that the anchor rides in the prompt
payload and not as a chat image part); the `generate_image` tool;
`app/api/nina/image/route.ts` as the queued job; the daily cap and cost logging in `nina_turns`;
**and R22: a hard deadline, a terminal failure state, and an in-character non-technical apology in
chat.** The pending bubble always resolves — to a photograph or to an apology, never to a spinner.
**Does not touch:** avatar replacement or the album (13).
**Exit criteria:** a request produces an image whose face matches the anchor; the cap refuses the
n+1th politely and in character; a forced timeout, a forced policy refusal and a forced HTTP error
each end in a distinct Nina message with no error code, no retry button and no stack trace; the
`ci:openrouter-guard` passes with its narrowed boundary.

### Phase 13 — Her page, her album, her promises
**Satisfies:** R17, R19, R20, R25, R26
**Also owns (added after the first draft):**
- **R25** — the avatar's *story*. `nina_avatars` carries a description of what the photo depicts
  (phase 1 declares the column; phase 12 fills it from its own generation prompt, phases 14 and 15
  fill it by running phase 6's `glm-4.6v` describe pre-pass over a hand-uploaded image). This phase
  puts the **current** avatar's description into Nina's context — an additive extension of phase 2's
  context type, not a rewrite of it — so that asked *"lah lo ganti foto profil na, itu lagi
  dimana?"* she invents a story consistent with what the picture actually shows **and** with the
  chat history. The story is improvised per turn, never stored as canon: a stored story would be
  re-quoted verbatim next month and stop sounding like a person remembering.
- **R26** — an "attach to chat" button in the album's zoomed-photo state. Attaching one of her own
  photos produces an ordinary chat message carrying an existing blob, so it reuses phase 6's
  `nina_message_images` row shape rather than inventing a second attachment kind. A text-free
  attach must be a valid send, exactly as phase 8's run attachment is.
**Owns:** `app/nina/about/page.tsx` (WhatsApp-style detail page); avatar tap → full-screen photo,
reusing `components/ui/PhotoViewer.tsx` and `lib/photos/gallery.ts` unchanged; the chat-image
gallery (his and hers); the avatar album; the `set_avatar` tool; the promise evaluator that reads
`pending_promises`, checks it against reality, generates, swaps `nina_avatars.is_current`, and
makes her announce it in chat.
**Does not touch:** the generation client itself (12).
**Exit criteria:** the detail page renders; the avatar opens full-screen and swipes; every chat
image appears in the gallery; a promise stated in chat and then met produces a new avatar and an
unprompted message about it; a promise not met produces neither; `gallery.ts` was reused, not
reimplemented.

### Phase 14 — The `/update-nina-profpic` skill
**Satisfies:** R21
**Owns:** `scripts/nina-profpic.mjs` (resize, upload to Blob, insert `nina_avatars`, flip
`is_current`, re-anchor per RU-16, write the proactive trigger per RU-17); the `nina:profpic`
package script; `.claude/skills/update-nina-profpic/SKILL.md`; promoting `sharp` from a transitive
dependency to an explicit `devDependency`.
**Does not touch:** the app runtime. This is an operator tool, in the shape of
`scripts/blob-reap.mjs` — `node --env-file=.env.local`, straight at production.
**Exit criteria:** the command takes a local path and leaves production showing that image as her
current avatar, the old one still in the album, `assets/nina/_anchor.png` replaced, and a queued
message from her about it; a bad path or a non-image fails loudly before touching anything; the
skill's own docs say which env file it reads and which production resources it writes.

### Phase 15 — Admin: the desktop shell and her album
**Satisfies:** R23
**Owns:** the admin gate (`lib/admin/requireAdmin.ts`, matching the signed-in `users.email`
against phase 1's `ADMIN_EMAILS`); the `app/admin/` route group with **its own layout** — no
`AppShell`, no `TabBar`, no 470px column; `/admin/nina`, where the album is managed: add a photo,
remove one, choose which is current, and **zoom and reposition** an image so Nina's face sits
centred in a circular frame, persisted to phase 1's crop-transform columns; running phase 6's
describe pre-pass over each newly uploaded photo so R25 has a story to work from.
**Does not touch:** the memory editor (16), the chat, the mobile Nina pages (13).
**Exit criteria:** a non-admin account gets a refusal, not a page; the crop transform round-trips
and the circular preview matches what the chat header renders; removing the current photo cannot
leave zero current avatars; every upload lands with a description.

**This is the first desktop screen in the app and that is the phase's main risk.** Every existing
screen is a `max-w-[470px]` mobile column against an iPhone XS Max (`docs/design-brief.md`), so
there is no desktop grid, no wide-layout tokens and no precedent to copy — the admin group needs
its own layout decisions, made deliberately rather than by widening a phone screen. The
zoom-and-position control is also the only free-form direct-manipulation UI in the codebase; per
invariant 6 the transform arithmetic (clamping, fitting, converting gesture deltas to stored
offsets) belongs in a pure module under `lib/` with tests, and only the pointer plumbing stays in
the component.

### Phase 16 — Admin: the memory editor
**Satisfies:** R24
**Owns:** `/admin/memory` — read every user's slots and fact ledger, edit a value, correct a stale
fact, and **insert one by hand** (the backdoor the user asked for, in his words: "this way, i can
add some important data of myself through a backdoor in admin page"). Reuses phase 15's admin gate
and layout.
**Does not touch:** the distillation pass (5), the album (15).
**Exit criteria:** slots and ledger rows are visible per user and editable; a hand-inserted row is
distinguishable from a distilled one and survives the next distillation pass rather than being
overwritten by it; an edit takes effect in Nina's very next turn.

**The one thing this phase must not break is R4's "PERMANENTLY".** The ledger is append-only by
design, so "edit" and "delete" need a defined meaning that does not silently discard history —
and a hand-written row has no `source_message_id`, because nothing in the chat ever said it. Phase
1 has been asked to make that column nullable and to consider a `source` discriminator
(`'distilled' | 'admin'`) for exactly this reason. Get that semantics right in the plan before
writing any UI.

## Reconciliation Log

Thirty conflicts were queued from the sixteen planners' interface contracts and settled in
`.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` (641 lines), which is **normative** and
carries the full reasoning for each. Summary:

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| A1 | `nina_messages` field spelling — `text`/`sent_at` vs `body`/`createdAt` | 1,2,3,4,6,7,8 | **Three layers, three spellings, one mapper.** Columns are `text`/`sent_at`; the `lib/nina/queries.ts` DTO is `body`/`createdAt`; the prompt layer is `text`/`sentAt`. Phase 3's `dbNinaSourceGateway` is the only translator. Neither side may be "fixed" to match the other |
| A2 | `insertNinaMessage(…{seq})` vs `insertNinaMessages(…{body})` | 1,3,7 | Phase 1 owns `lib/nina/queries.ts`; its names are canonical, phase 3's `gateway.ts` is the sole adapter |
| A3 | `insertNinaMemoryFact` vs `appendNinaMemoryFacts` | 1,3,5 | `appendNinaMemoryFacts` wins — phase 5's structural R24 guarantee depends on which functions the distiller imports |
| A4 | Avatar-announcement query names | 1,10 | Phase 1's `getUnannouncedCurrentNinaAvatar` / `markNinaAvatarAnnounced`; phase 10's 8 references renamed |
| A5 | Two spellings of `/nina/avatar-001.png` | 4,13,15 | One export, `NINA_AVATAR_FALLBACK_SRC` from `lib/nina/album.ts`; phase 4's `NINA_AVATAR_SRC` re-exports it; `CircleFrame`'s copy deleted |
| A6 | `NINA_BLOB_PREFIX` declared three times | 6,12,15 | Exactly one definition |
| B1 | `sendNinaMessage` extended by four phases independently | 3,6,7,8,13 | **One** combined object — `{body, imageTickets?, replyToMessageId?, runId?, attachExisting?}` — and one refusal rule: empty body allowed when any attachment is present |
| B2 | `NinaTurnInput` extended by four phases | 3,6,7,8,13 | One final shape; phase 10's `NinaTurnOptions.runId` is a *different* thing (written to the row, not read for the prompt) and both survive |
| B3 | `buildNinaRunFact` module-local but needed by phase 8 | 2,3,8 | Exported from phase 2 |
| C1 | Phase 12 needs `nina_turns.args jsonb` | 1,12 | **Folded into phase 1's migration.** Load-bearing: the repo is *public*, so a `workflow_dispatch` input is world-readable — the prompt travels in the DB, only an opaque job id in the dispatch |
| C2–C4 | `NinaTurnStatus += 'pending'`, `NinaPendingPromise += jobId?/firedOn?/attempts?`, `GITHUB_DISPATCH_TOKEN`, `VAPID_SUBJECT` | 1,11,12,13 | All folded into phase 1; none needs a second migration |
| C5 | Weight reached Nina but not F07's coach narrative | 1 | **Decided under RU-21:** `ProfileFacts` and the three narrate prompts gain `weightKg` + `sex`. `factsHash` moves and cached insights regenerate on next view — accepted |
| C6–C7 | `productionDeps()` needs `export`; `maxDuration = 60` missing on `app/nina/page.tsx` | 3,4,12 | Both applied; without C7 a Server Action timeout reads as an intermittent bug |
| D1 | `check-llm-payload-boundary.mjs` rule 2 claimed by four phases | 1,3,5,6 | Phase 1 owns it, as a `GUARDED_CALLS` table with the complete symbol and sanctioned-caller lists |
| D2 | `ROADMAP` §4.8 "four-tab bar", §4.1 "four route handlers", no F33 entry | 1,4,10,12 | Phase 1 owns every roadmap amendment. Route handlers become **five** (phase 10's cron), not six — phase 12's rewrite adds none |
| D3–D4 | `proxy.ts` matcher for `/nina` + `/admin`; `blob-reap.mjs` knows only `shots/` | 6,12,13,14,15,16 | One matcher ruling; the reaper becomes one owned follow-up card rather than five deferrals |
| E1 | Colour-inversion fix: `bg-ink-3/20` vs `bg-current/10` | 4,6,7,8,13 | `bg-ink-3/20` — `ink-3` is mid-grey in *both* schemes, so an alpha composites correctly over `bg-ink` and `bg-card`; `bg-paper-2` inverts |
| E2 | `MessageBubble`'s `above` slot has four occupants | 6,7,8,13 | One composition order, fixed in one place: quote first, attachment card second |
| E3 | `after()` hook placed in `lib/review/actions.ts`, not `commit.ts` | 10 | **Accepted.** `after()` throws E468 outside a request scope and `tests/review.commit.test.ts` calls `commitReview` directly, so the brief's placement would have broken the suite |
| E4 | Two `parseRunningDays` implementations, ISO 1–7 vs 0–6 | 5,9,10 | Phase 5 owns the vocabulary and supplies both typed views; phase 10 deletes its `DAY_TOKENS` and re-exports. Fixes two live bugs: "Senin sampe Jumat" yielding 2 days, and "tiap hari kecuali senin" firing every Monday |
| E5 | Phase 5 claimed orphaned slots are "not read" — false | 2,5,16 | Corrected with evidence: `getNinaMemorySlots` returns every row and phase 2 passes all of them into the prompt unfiltered. `/admin/memory`'s retire button is the answer; phase 2 keeps no filter, because that is a prompt change |
| E6 | **The plan set's one true ordering conflict** — phase 13 lands before 15 but needs `lib/nina/crop.ts`, which 15 creates | 13,15 | `crop.ts` moves to phase 13; phase 15's Steps 1–2 become no-ops. Not phase 1, because phase 1 is the one commit whose rollback is not a `git revert` |
| E7 | `size="sm"` used across UI phases; `ButtonSize` is `'md'\|'lg'` only | 4,7,8,13,15,16 | Verified against `components/ui/Button.tsx`; every occurrence removed |
| E8 | Phase 7 made `MessageBubble` a client module | 4,7,13 | Confirmed nothing depended on it being a server component |
| F1–F5 | R20 on phase 13's Satisfies line; file counts; dependency edges; R-coverage; status | index | R20 struck (RU-18); counts and edges corrected; **R1–R26 all covered**; status `planned` |
| G1 | `MessageRole` and `NinaRole` both declare `'runner'\|'nina'` | 1,2,3 | **Both stay** — a column domain and a prompt-layer name, one mapper between. Deliberately the *opposite* call from `Sex`, because `Sex` is a value the prompt renders verbatim while `role` is a discriminator each layer switches on |
| G2 | `FiredNinaPattern` created vs imported | 2,9 | A type alias of phase 2's `FiredPattern` — one definition, no structural copy |
| G3 | Phase 12 joins an `app/nina/page.tsx` `Promise.all` that does not exist | 4,12 | Phase 12 **creates** it; phase 4's page awaits sequentially |
| G4 | `SendNinaMessageResult` quoted structurally by phase 4 | 3,4,7 | Phase 3 exports the name so phase 7's edit has one landing site |
| G5 | Phase 5 pointed phase 16 at `updateNinaMemoryFact` for a distilled row | 5,16 | Phase 16 is right: in-place edit is `source:'admin'` only, because rewriting a distilled row forges what its `source_message_id` claims was said. Retract (append-then-delete) is the route for a distilled row |
| G6–G7 | Pattern-gateway stub exit test unowned; phase 16's `file:line` pins go stale | 1,2,10,16 | Phase 10 owns the test; the pins are demoted to symbol names |

**Three reconciler attempts died to infrastructure — two API 529s and one session usage limit —
and no ruling was lost to any of them.** The sheet was written to disk before the edits for exactly
that reason. Phases 1–9 and 16 have the rulings folded into their bodies; phases 10–15 carry a
`⚠ RECONCILIATION` banner naming every ruling binding on them, with four body edits deliberately
left to the session that picks each phase up (listed in the sheet's Application Status). A ruling
duplicated into sixteen plans has sixteen chances to drift; stated once and declared normative, it
has one.

## Open Questions

**None.** RU-21 forbids parking a decision for a human, and nothing here is parked. Every
contradiction above was decided, with its reasoning and a "revisit if…" condition recorded in the
ruling sheet. The three items that were genuinely uncertain — the image worker mechanism, whether
F07's narrative should see weight, and where `lib/nina/crop.ts` lives — were decided as RU-20, C5
and E6 respectively.

The only thing outside this plan set's control is **one-time setup the user must perform in a
browser**, which is not a decision: creating a fine-grained GitHub PAT with `actions: write`, and
pasting `OPENROUTER_API_KEY`, `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` into the repository's
Actions secrets. Phase 12 carries that as a numbered setup checklist.

## Rollback

**Whole feature:** delete the branch. Nothing on `main` changes until the pull request merges.

**Per phase:** every phase after 1 is additive to `lib/nina/`, `components/nina/`, `app/nina/` or
`scripts/`, so reverting its commit is sufficient. Phase 1 is the exception in two ways, and both
need naming: the migration is forward-only (drop the eight tables and the `profiles.sex` column by
hand), and the three repeals are edits to shared files (`lib/llm/facts.ts`, two guard scripts, two
root markdown documents) whose revert must be checked against the F07 narrative still generating.
Phase 11's service worker is the other sticky one — a registered worker survives a deploy, so
backing it out means shipping an unregister, not just deleting the file.

## Next

Execute the phases, starting at phase 1:

    /implement -f NINA_CHATBOT_PLAN.md --phase 1

Or put them on the board first:

    /create-task --from-plan NINA_CHATBOT_PLAN.md
