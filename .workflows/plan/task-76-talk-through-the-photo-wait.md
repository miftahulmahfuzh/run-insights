# task-76 — Nina talks through the photo wait, and quotes her own promise when it lands

**Card:** https://github.com/miftahulmahfuzh/run-insights/issues/76
**Round:** 1 (2026-10-01)
**Branch:** `task/76-nina-should-talk-through-the-photo-wait`

---

## 0. What the card asked for, measured against the tree as it is today

The card was written on 2026-09-04 and the image feature moved underneath it twice since
(`040a70b` put generation on Vercel Fluid compute and demoted the GitHub worker to a backstop;
`5c42668` added the delivery push). So the four requirements do not all still exist:

| | Card's claim | Verified today | Verdict |
|---|---|---|---|
| **R1** | she goes silent for the whole generation | nothing between the promise bubble and the photograph. `runNinaBackgroundTurn` closes its claim at `lib/nina/turnrun.ts:566`, the poll reads `awaiting: false`, the tab stops polling, and the next thing written to the session is the photo 60–235 s later | **build it** |
| **R2** | the photograph quotes the ask, not her promise | `lib/nina/imagetools.ts:130` passes `replyToId: ctx.sourceMessageId` — the runner's message | **build it** |
| **R3** | the worker never pushes; VAPID absent from prod | `lib/nina/imagerun.ts:504` calls `notifyNinaPush(..., 'photo_delivered', ...)` as the last statement of `finishSelfie`, and `vercel env ls production` (2026-10-01) lists `VAPID_SUBJECT`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, all Production, all 27 days old | **already shipped — report, build nothing** |
| **R4** | one stall sentence every time | `handleGenerateImage` returns one fixed instruction string | **build it** |

Also re-measured: generation is no longer off-platform. `generateNinaSelfie` →
`fireNinaImageGeneration` → `after()` on the same invocation, `NINA_IMAGE_RUN_BUDGET_MS` 255 s,
anchored call ceiling 235 s. So the wait to cover is 60 s typical and up to ~235 s worst case, on
the same server process that just answered him — which is what makes R1 cheap.

---

## 1. R1 — the approaches, and why A won

### A — a bounded "photo stall" inside the background turn, under the turn's own still-open claim ✅

After her bubbles land, if this turn dispatched an image job that is still open,
`runNinaBackgroundTurn` **does not close its `nina_turns` chat claim yet**. It runs up to
`NINA_PHOTO_STALL_MAX` extra `runNinaTurn` calls — `runnerText: null`, `sourceMessageId: null`,
`proactive: <stall steer>`, camera tools removed — inserting each one's bubbles into the same
session, and closes the claim when the stall ends.

The claim staying open is the whole trick. `pollNinaReply`'s first `awaiting` disjunct is "a fresh
chat claim exists for this session", so **the tab that is already polling simply keeps polling**
and the filler bubbles arrive through the channel that already exists, staggered by `planReveal`
like every other bubble. No change to `pollNinaReply`, to `SentBubble`, to `useTurnArrival`, or to
how the photograph itself is delivered.

| Criterion | |
|---|---|
| Convention | the turn body is `runNinaTurn` with a `proactive` string — `emitProactiveMessage`'s exact shape, one file over |
| Scope | two server files plus one new copy module; zero client files, zero schema |
| Verifiability | the stop rule is a pure function with its own unit test; the wiring is asserted against the fake DB driver with an injected turn runner |
| Reversibility | one commit; delete the stall call and the tree is byte-identical in behaviour |

### B — a new `awaiting` disjunct: "an image job is open for this session" ❌

Semantically the tidier answer, and it would make the **photograph** arrive live too. Rejected:
`SentBubble` is `{id, body, replyToId}` and carries no images, so making the poll the photo's
delivery channel lands the photograph as a bare caption bubble with no picture until a refresh.
Fixing that means widening `SentBubble`, `RevealRow`, `appendNewBubbles` and `pollNinaReply`'s
reads — a regression introduced in order to fix it, for a liveness the card does not ask for
(R3's liveness is push, and push is shipped). **Lost on Scope and on Reversibility.**

### C — just tell her, in the tool result, to change the subject in the same turn ❌ (as the whole answer)

One string, zero infrastructure. Kept — it is half of R4 below. Rejected as *the whole* answer
because the card's complaint is the silence **after the turn ends**: if the runner says nothing,
C leaves her silent again at exactly the moment the card is about. A is C plus the part that only
a second turn can do.

### D — a seventh `ProactiveTriggerKind`, fired from cron ❌

`ProactiveTriggerKind` is pinned by hand to `NINA_PUSH_KINDS` (`lib/push/payload.ts`) and to the
`nina_messages.source` column domain, so a seventh kind is a schema change; and the cron's cadence
is minutes against a 60 s wait. **Lost on Scope and Convention.**

### The stop rule

The stall runs another filler only while **all four** hold:

1. the image job is still open (`queued`/`dispatched`/`running`) — the photo or the apology landing
   ends the stall;
2. the newest row in the session is still **hers** — if he answered, the existing chain owns him
   and she must not talk over him;
3. `Date.now() - startedAtMs + NINA_PHOTO_STALL_RESERVE_MS <= NINA_PHOTO_STALL_DEADLINE_MS`;
4. fewer than `NINA_PHOTO_STALL_MAX` fillers so far.

**The deadline is sized by `NINA_TURN_STALE_MS`, not by taste.** The claim is held open across the
stall, and a chat claim older than 90 s is swept as dead by `sweepStaleNinaChatTurns` and by the
poll itself. `NINA_PHOTO_STALL_DEADLINE_MS = 70_000` leaves 20 s of margin for the close write, and
the inequality is asserted in the suite so the two literals cannot drift apart.

### Two decisions inside A

**No push for a filler bubble.** The tab that is watching gets it from the poll; a tab that is not
watching is a runner who put the phone down, and the photograph's own `photo_delivered` push is
what brings him back. A second buzz twenty seconds after the first, for "eh btw lo udah makan
belom", is a worse app.

**The filler's tool set is `NINA_FULL_TOOL_SET` minus the three camera tools**
(`generate_image`, `set_avatar`, `set_avatar_from_photo`). The card names this constraint
explicitly, and `hasNinaImageJobForMessage` cannot enforce it here: that guard keys on
`ctx.sourceMessageId`, and a filler turn has none. Removing the tools is the only guard that holds.

---

## 2. R2 — the photograph quotes her promise

Her promise does not exist when the job is opened: `handleGenerateImage` runs *during* the model
call, and the only id in hand is `ctx.sourceMessageId` — the message that asked. So the job's quote
target is **patched after the fact**, immediately after `insertNinaMessages` in
`runNinaBackgroundTurn`: `setNinaImageJobReplyTo(userId, sourceMessageId, lastBubbleId)` rewrites
`args.replyToId` on the open job and leaves `args.sourceMessageId` untouched, so
`hasNinaImageJobForMessage`'s duplicate guard keeps working unchanged. `setNinaImageJobPrompt` is
the precedent for editing `nina_turns.args` in place.

**The LAST bubble of the dispatching turn, not the first.** A four-bubble reply ending in "nih
sebentar, gw foto kondisi sekarang deh" has the promise at the end; quoting the first bubble would
quote whatever she was saying before she reached for the camera.

**Ambiguity call (narrow reading).** The card says quoting the ask "is defensible when several
messages have passed, and quoting her promise is better when the promise is the last thing she
said". Built: **always quote her promise when the turn produced one**, falling back to the runner's
message when it produced none. The other reading — keep quoting the ask — loses on this card's own
terms, because the stall R1 adds puts filler bubbles between the ask and the photograph, which is
exactly the case where the ask is furthest away and her promise is the thing being answered.

---

## 3. R4 — variety

New module `lib/nina/imagestall.ts`, on `lib/nina/imagefail.ts`'s precedent (a set of her lines with
a kind attached, picked deterministically by job id with `pickLine` so a job read twice says the
same thing both times). It holds:

- `NINA_PHOTO_STALL_STEERS` — three steers matching the runner's own three examples: *look for it
  in my album*, *go and take it now*, *hang on, wait for me*. Appended to `handleGenerateImage`'s
  instruction, so her promise bubble is not the same sentence every time.
- `NINA_PHOTO_STALL_INSTRUCTION` — what the filler turn is told: keep the conversation alive, ask
  him something or change the subject, do not mention the photo, do not describe it, do not promise
  a time.

These are instructions to the model, never rendered — the same contract `NINA_IMAGE_CAPPED_NOTE`
has. The words in the bubble are still hers.

---

## 4. Files

| File | Change |
|---|---|
| `lib/nina/imagestall.ts` | **new.** The steers, the filler instruction, the four stall constants, and `shouldStallAgain` (pure) |
| `lib/nina/imagetools.ts` | append the picked steer to the tool result's instruction (R4) |
| `lib/nina/imagejobs.ts` | `setNinaImageJobReplyTo` (R2) and `openNinaImageJobForMessage` (R1's stop condition 1) |
| `lib/nina/photostall.ts` | **new.** `runNinaPhotoStall` — the loop, the filler turn, the inserts |
| `lib/nina/turnrun.ts` | defer the claim close when a stall will run; patch the job's quote target; run the stall before the distillation |
| `lib/nina/imagestall.test.ts` | the pure half: steers, the deadline inequality, `shouldStallAgain` |
| `lib/nina/photostall.test.ts` | the loop against the fake driver with an injected turn runner |

No migration. No client file. No change to `pollNinaReply`, `useTurnArrival` or the photo's
delivery path.

---

## 5. Found during the build, and accepted

**A send during the wait is now answered by the chain rather than by its own turn.** The stall
holds the claim open, so `openNinaChatTurn` refuses a mid-wait send and the chain picks it up —
costing the rest of an in-flight filler turn (≤16 s) plus the distillation (10-20 s). It cannot be
superseded away: `supersedeNinaChatTurn` refuses a claim past `'running'`, and
`ninaChatTurnStore` advances this one to `'persisting'` the moment the model answers.

The alternative — move the stall below the distillation — removes the 10-20 s and, on a 45 s turn,
pushes the stall's start past `NINA_PHOTO_STALL_DEADLINE_MS` so no filler is emitted at all. That
is the slow turn whose silence is longest. The card is about the filler, so the filler keeps the
position. Written up at the call site in `lib/nina/turnrun.ts`.

**One pre-existing lie fixed on the way.** `runNinaBackgroundTurn`'s `finally` closed with
`failure ?? 'crashed'`, and `failure` is only ever cleared on a path where her answer is already
committed — so the coalesce could only fire for a turn that SUCCEEDED and then threw on the way
out. It was unreachable before this card, because every success path set `closed = true` in the
same breath; the stall is the first thing to hold the claim open across other work, so the window
is now real. It passes `failure` through.
