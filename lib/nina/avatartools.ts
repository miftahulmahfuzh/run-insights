import 'server-only'

import { z } from 'zod'

import { SET_AVATAR_FROM_PHOTO_TOOL, SET_AVATAR_TOOL } from './prompts/tools'
import { extendToolSet, type NinaToolAnswer, type NinaToolHandler, type NinaToolSet } from './tools'
import { NINA_CHAT_TOOL_SET } from './imagetools'
import { setNinaAvatarFromExistingPhoto } from './avatarAdopt'
import { generateNinaAvatar } from './avatargen'
import { getCurrentNinaAvatar } from './queries'

/**
 * `set_avatar` — she changes her own profile picture, in a turn, on purpose (R19's direct route).
 *
 * ── SHE MUST NOT CLAIM IT HAS CHANGED, AND THE `tool_result` SAYS SO ──────────────────────────
 * D-3: phase 10 announces an avatar change, this phase never does. Under RU-20 the photograph is
 * produced by a GitHub Actions runner a minute or more after this handler returns, so a bubble
 * saying *"nih udah gw ganti"* would be a claim about a file that does not exist. The answer below
 * therefore tells her, in the protocol's own channel, that the camera is running and that she may
 * say she is taking one — and phase 10 says it landed, once it has.
 *
 * That also removes the double-announcement `avatar_changed` could otherwise produce: there is
 * exactly one message about a new face, and `announced_at` is what makes it exactly one.
 *
 * ── WHY THE PROMISE SWEEP DOES NOT GO THROUGH THIS TOOL ───────────────────────────────────────
 * A promise is honoured whether or not they are talking (Step 7's cron argument), so the sweep
 * calls `generateNinaAvatar` directly. This tool is the other half: he asks her to change it, or
 * she decides to, mid-conversation. Same generator, same `source: 'generated'`, same announcer.
 */

export const SetAvatarArgsSchema = z.object({
  scene: z.string().trim().min(1).max(600),
  because: z.string().trim().min(1).max(600),
})

export type SetAvatarArgs = z.infer<typeof SetAvatarArgsSchema>

/**
 * What she is told, per outcome. Written for a MODEL, not for the runner: these strings are never
 * rendered, they are `tool_result` content she then speaks in her own words. Phase 12's
 * `NINA_IMAGE_APOLOGIES` is the other kind of string — those are hers to say — and the two must
 * not be confused.
 */
export const SET_AVATAR_ANSWERS = {
  queued:
    'Kamera jalan. Foto barunya belum ada — proses di belakang, bisa satu-dua menit. ' +
    'JANGAN bilang fotonya sudah ganti. Bilang saja lo lagi ambil foto, santai, ' +
    'nanti dia lihat sendiri.',
  in_flight:
    'Masih ada satu proses foto yang belum kelar. Jangan mulai yang baru dan jangan ' +
    'bilang fotonya sudah ganti — bilang aja masih proses.',
  capped:
    'Kuota foto hari ini habis. Bilang apa adanya, santai, tanpa istilah teknis: ' +
    'hari ini nggak bisa, besok lagi.',
  failed:
    'Kameranya gagal. Bilang apa adanya, singkat, tanpa istilah teknis, dan jangan ' +
    'janji ulang di kalimat yang sama.',
} as const

/**
 * `set_avatar_from_photo`'s arguments. `because` is OPTIONAL here while the JSON schema marks it
 * `required` — the deliberate split `lib/nina/prompts/tools.ts` documents (*"`required` is
 * documentation and not enforcement"*). The schema asks her for a reason; Zod refusing a call that
 * omitted one would spend a whole tool round to punish her for a field nothing reads.
 *
 * It stays `z.object` rather than `z.any()` so a non-object payload is still caught, which is the
 * one case that genuinely earns `isError: true`.
 */
export const SetAvatarFromPhotoArgsSchema = z.object({
  because: z.string().trim().max(600).optional(),
})

export type SetAvatarFromPhotoArgs = z.infer<typeof SetAvatarFromPhotoArgsSchema>

/**
 * What she is told, per outcome. Written for a MODEL, never rendered — the same contract as
 * `SET_AVATAR_ANSWERS`, and the deliberate INVERSE of its `queued` line: this change is already
 * done when the handler returns, so she must say so plainly instead of saying the camera is running.
 */
export const SET_AVATAR_FROM_PHOTO_ANSWERS = {
  done:
    'Foto itu sudah jadi profpic lo, beneran, sekarang juga — bukan lagi diproses. ' +
    'Bilang ke dia kalau sudah lo pasang, satu bubble, pakai kalimat lo sendiri. ' +
    'JANGAN bilang lo lagi ambil foto atau lagi nunggu apa-apa.',
  already:
    'Foto itu memang sudah jadi profpic lo dari sebelumnya. Bilang apa adanya, santai, ' +
    'jangan pura-pura baru ganti.',
  reference:
    'Foto itu cuma tampilan ulang dari foto yang aslinya ada di tempat lain, jadi nggak bisa ' +
    'dipakai langsung. Minta dia tunjuk atau kirim foto aslinya. Tanpa istilah teknis.',
  none:
    'Nggak ketahuan foto mana yang dia maksud di obrolan ini. Tanya balik fotonya yang mana, ' +
    'santai, satu kalimat. JANGAN mulai ambil foto baru.',
  unsupported:
    'Bentuk file foto itu nggak bisa dipakai buat profpic. Bilang apa adanya, singkat, ' +
    'tanpa istilah teknis.',
  failed:
    'Gagal masang fotonya. Bilang apa adanya, singkat, tanpa istilah teknis, dan jangan ' +
    'janji ulang di kalimat yang sama.',
} as const

/**
 * `set_avatar` dispatch. **Never throws** — phase 3's `dispatchNinaTool` would turn a rejection
 * into an `isError` answer anyway, and a thrown exception here would cost a whole chat turn over
 * one tool call.
 */
export const handleSetAvatar: NinaToolHandler = async (args, ctx): Promise<NinaToolAnswer> => {
  const parsed = SetAvatarArgsSchema.safeParse(args)
  if (!parsed.success) {
    return {
      answer: { ok: false, why: 'set_avatar butuh `scene` dan `because`, dua-duanya teks.' },
      isError: true,
    }
  }

  /*
   * One in-flight photograph at a time. The check is on the CURRENT avatar being unannounced
   * rather than on phase 12's job table, and that is deliberate: an unannounced current avatar is
   * a face phase 10 has not spoken about yet, so starting a second generation would queue two
   * announcements for one conversation. Reading phase 12's job table instead would couple this
   * handler to a module under rewrite (RU-20) for no better answer.
   */
  const current = await getCurrentNinaAvatar(ctx.userId)
  if (current != null && current.announcedAt == null && current.source === 'generated') {
    return { answer: { ok: false, note: SET_AVATAR_ANSWERS.in_flight }, isError: false }
  }

  const result = await generateNinaAvatar({
    userId: ctx.userId,
    scene: parsed.data.scene,
    source: 'generated',
  })

  if (result.ok) {
    return { answer: { ok: true, note: SET_AVATAR_ANSWERS.queued }, isError: false }
  }

  /* Narrowed by the early return above: `NinaAvatarResult`'s `{ ok: false }` branch carries
   * `kind` as a real field, so no structural cast is needed to read it. */
  const { kind } = result
  return {
    answer: {
      ok: false,
      note: kind === 'capped' ? SET_AVATAR_ANSWERS.capped : SET_AVATAR_ANSWERS.failed,
    },
    isError: false,
  }
}

/**
 * `set_avatar_from_photo` dispatch — R2. **Never throws**, for `handleSetAvatar`'s reason.
 *
 * ── THE ONE THING IT DOES THAT `handleSetAvatar` MUST NOT ─────────────────────────────────────
 * It lets her say the change has happened, because it has. There is no generation, no job row and
 * no worker: `setNinaAvatarFromExistingPhoto` copies bytes and writes two rows inside this request,
 * and `lib/nina/avatarAdopt.ts` marks the row announced in the same breath so phase 10's
 * `avatar_changed` cron cannot announce it a second time tomorrow.
 *
 * ── AND THE `in_flight` GUARD IS DELIBERATELY ABSENT ─────────────────────────────────────────
 * `handleSetAvatar` refuses while an unannounced GENERATED avatar is in the air, because a second
 * generation would queue two announcements for one conversation. This tool queues none — it
 * announces inline — so the guard has nothing to protect, and applying it would refuse a legitimate
 * "pakai foto ini" just because a selfie happened to be developing.
 *
 * Every refusal below is `isError: false`: these are true answers to a legitimate request, not
 * malformed calls (ruling (g)). The one `isError: true` is a payload that is not an object at all.
 */
export const handleSetAvatarFromPhoto: NinaToolHandler = async (
  args,
  ctx,
): Promise<NinaToolAnswer> => {
  const parsed = SetAvatarFromPhotoArgsSchema.safeParse(args ?? {})
  if (!parsed.success) {
    return {
      answer: { ok: false, why: 'set_avatar_from_photo cuma menerima `because`, berupa teks.' },
      isError: true,
    }
  }

  const result = await setNinaAvatarFromExistingPhoto(ctx.userId, ctx.sourceMessageId)

  if (result.ok) {
    return {
      answer: {
        ok: true,
        note: result.changed
          ? SET_AVATAR_FROM_PHOTO_ANSWERS.done
          : SET_AVATAR_FROM_PHOTO_ANSWERS.already,
      },
      isError: false,
    }
  }

  const note =
    result.kind === 'reference'
      ? SET_AVATAR_FROM_PHOTO_ANSWERS.reference
      : result.kind === 'unsupported'
        ? SET_AVATAR_FROM_PHOTO_ANSWERS.unsupported
        : result.kind === 'none' || result.kind === 'missing'
          ? SET_AVATAR_FROM_PHOTO_ANSWERS.none
          : SET_AVATAR_FROM_PHOTO_ANSWERS.failed

  return { answer: { ok: false, note }, isError: false }
}

/**
 * All eight tools, and the set `lib/nina/turnrun.ts` actually passes.
 *
 * Layered rather than redefined: phase 3 ships four, phase 12 adds `generate_image`, phase 13
 * `set_avatar`, and the nina-avatar-existing-photo set `set_avatar_from_photo`. `extendToolSet`
 * throws at module load on a duplicate name, in the phase that added it — which is the only time
 * anyone can fix it.
 *
 * `set_avatar_from_photo` is added HERE and in the same call as `set_avatar`, so the pair that the
 * model has to choose between can never be split across two sets: a build in which only one of them
 * is dispatchable is the exact failure this feature exists to remove.
 */
export const NINA_FULL_TOOL_SET: NinaToolSet = extendToolSet(NINA_CHAT_TOOL_SET, [
  { tool: SET_AVATAR_TOOL, handler: handleSetAvatar },
  { tool: SET_AVATAR_FROM_PHOTO_TOOL, handler: handleSetAvatarFromPhoto },
])
