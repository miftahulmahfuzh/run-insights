'use client'

import * as React from 'react'

import { revokeShareLinkAction } from '@/app/actions/share'
import { Button } from '@/components/ui/Button'
import { Card, Eyebrow } from '@/components/ui/Card'
import {
  REVOKE_ACTION,
  REVOKE_BODY,
  REVOKE_CANCEL,
  REVOKE_CONFIRM,
  REVOKE_DONE,
  REVOKE_FAILED,
  REVOKE_PARTIAL,
  REVOKE_TITLE,
  SHARE_COPIED,
  SHARE_COPY_LINK,
  SHARE_LINK_LIVE,
  SHARE_LINK_NONE,
  SHARE_TITLE,
  SHARE_WHO_CAN_SEE,
} from '@/lib/share/copy'

/**
 * The share state, in the run's own body: is this run shared, what is the link, and how to stop.
 *
 * ── WHY THIS IS A SEPARATE COMPONENT FROM `ShareButton` ────────────────────────────────────────
 * They answer different questions. The header button is *"send this"* — a verb, one tap, gone into
 * WhatsApp. This panel is *"what have I already published?"* — a state, readable at a glance,
 * weeks later, with the way out attached. Collapsing them would either put a destructive action in
 * a header slot or bury the send behind a scroll.
 *
 * They share no client state and do not need to: `createShareLinkAction` calls
 * `revalidatePath('/r/<id>')`, so a mint in the header re-renders this panel from the server with
 * the live token. The token arrives as a prop from a Server Component; nothing here fetches.
 *
 * ── THE REVOKE CONFIRM IS THE POINT OF THIS FILE ──────────────────────────────────────────────
 * Not "Are you sure?" — a question with no information in it. R-38's text, verbatim, which says
 * what revocation does, says plainly what it cannot do, and does not apologise for the difference.
 * A runner deciding whether to revoke needs to know that the images get replaced *and* that a copy
 * already saved is beyond reach. That sentence belongs here, at the moment of the decision, not in
 * a help page.
 */
export function ShareLinkPanel({
  runId,
  token,
  url,
}: {
  runId: string
  /** The live share token, or null. From the server — this component never mints. */
  token: string | null
  /** The absolute URL for `token`. Built server-side (`lib/share/origin.ts`), never from
   *  `window.location.origin`, which on a preview deployment produces a link that dies next deploy. */
  url: string | null
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function revoke() {
    setPending(true)
    setNotice(null)
    try {
      const result = await revokeShareLinkAction(runId)
      if (!result.ok) {
        setNotice(REVOKE_FAILED)
        return
      }
      // The link is dead either way. The only thing left to report is whether the blob rotation
      // finished — and if it did not, the runner is told, because "old image links break too" is a
      // promise this feature just made in the confirm dialog above.
      setNotice(result.photosStillLive > 0 ? REVOKE_PARTIAL : REVOKE_DONE)
      setConfirming(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="p-5">
      <Eyebrow className="mb-2">{SHARE_TITLE}</Eyebrow>

      <p className="text-[13px] leading-[1.55] font-medium text-ink-2">
        {token ? SHARE_LINK_LIVE : SHARE_LINK_NONE}
      </p>

      {token && url && (
        <>
          <p className="mt-2 text-[12px] leading-[1.5] font-medium text-ink-3">
            {SHARE_WHO_CAN_SEE}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Share link"
              className="min-w-0 flex-1 rounded-field bg-paper-2 px-3 py-2 text-[12px] font-medium text-ink"
            />
            <Button variant="secondary" size="md" onClick={copy}>
              {copied ? SHARE_COPIED : SHARE_COPY_LINK}
            </Button>
          </div>
        </>
      )}

      {notice && <p className="mt-3 text-[12px] font-semibold text-ink-2">{notice}</p>}

      {token && !confirming && (
        <div className="mt-4 border-t border-rule-2 pt-4">
          <Button variant="destructive" size="md" onClick={() => setConfirming(true)}>
            {REVOKE_ACTION}
          </Button>
        </div>
      )}

      {token && confirming && (
        /* Inline, not a modal sheet. The consequence has to be readable in the same glance as the
           button that causes it, and a sheet that covers the page hides the run the decision is
           about. */
        <div className="mt-4 rounded-field bg-warn-soft p-4">
          <p className="text-[13px] font-semibold text-ink">{REVOKE_TITLE}</p>
          <p className="mt-1.5 text-[12px] leading-[1.55] font-medium text-ink-2">{REVOKE_BODY}</p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="md" onClick={revoke} loading={pending}>
              {REVOKE_CONFIRM}
            </Button>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {REVOKE_CANCEL}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
