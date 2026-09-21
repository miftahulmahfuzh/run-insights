'use client'

import { useSearchParams } from 'next/navigation'
import { useLayoutEffect } from 'react'

import {
  decodeJobListScrollMark,
  JOB_LIST_SCROLL_PARAM,
  resolveJobListScrollTop,
  type JobListScrollAnchorRow,
} from '@/lib/nina/jobview'

/**
 * `/nina/jobs`'s DOM half of the scroll mark — `useChatScroll.ts`'s `readAnchorRows`, one screen
 * over. `NinaJobList.tsx` puts `id={`nina-job-${item.id}`}` on every `<li>`, on that file's own
 * precedent for `nina-msg-`.
 */
export function readJobAnchorRows(): JobListScrollAnchorRow[] {
  const nodes = document.querySelectorAll<HTMLElement>('[id^="nina-job-"]')
  const scrollY = window.scrollY
  const rows: JobListScrollAnchorRow[] = []
  for (const node of nodes) {
    rows.push({
      jobId: node.id.slice('nina-job-'.length),
      top: node.getBoundingClientRect().top + scrollY,
    })
  }
  return rows
}

/**
 * The restore half, and the whole of it: unlike `useChatPageScroll`, there is no "follow new
 * content" behaviour to coordinate with — a job list never autoscrolls on its own — so a
 * mount-time layout effect is the entire hook.
 *
 * A LAYOUT effect, not a passive one, so it runs before the browser paints: the runner never sees
 * the top of the list flash past on the way to the row they were on. No `requestAnimationFrame`
 * re-application the way chat's restore has one: a job row's height does not settle after a font
 * or an image decodes the way a message bubble's can, so one measurement is the whole story.
 *
 * Reads through `useSearchParams` rather than `window.location.search` directly, on
 * `useChatScrollMark`'s own reasoning (`usePanelParam`'s shape): a deep link, a refresh and a
 * `router.push` all arrive through the one line Next already re-renders on.
 */
export function useJobListScrollRestore(): void {
  const searchParams = useSearchParams()
  const raw = searchParams.get(JOB_LIST_SCROLL_PARAM)

  useLayoutEffect(() => {
    const mark = decodeJobListScrollMark(raw)
    if (mark === null) return

    const anchor = readJobAnchorRows().find((row) => row.jobId === mark.jobId)
    const top = resolveJobListScrollTop({
      mark,
      anchorTop: anchor?.top ?? null,
      geometry: {
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: window.innerHeight,
      },
    })
    if (top === null) return
    window.scrollTo({ top, behavior: 'instant' })
  }, [raw])
}
