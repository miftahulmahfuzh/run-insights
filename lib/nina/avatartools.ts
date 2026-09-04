import 'server-only'

import { z } from 'zod'

import { SET_AVATAR_TOOL } from './prompts/tools'
import { extendToolSet, type NinaToolAnswer, type NinaToolHandler, type NinaToolSet } from './tools'
import { NINA_CHAT_TOOL_SET } from './imagetools'
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
 * All six tools, and the set `lib/nina/actions.ts` actually passes.
 *
 * Layered rather than redefined: phase 3 ships four, phase 12 adds `generate_image`, this adds
 * `set_avatar`. `extendToolSet` throws at module load on a duplicate name, in the phase that added
 * it — which is the only time anyone can fix it.
 */
export const NINA_FULL_TOOL_SET: NinaToolSet = extendToolSet(NINA_CHAT_TOOL_SET, [
  { tool: SET_AVATAR_TOOL, handler: handleSetAvatar },
])
