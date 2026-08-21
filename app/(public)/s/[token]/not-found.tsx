import { NOT_FOUND_BODY, NOT_FOUND_TITLE, PUBLIC_TITLE } from './copy'

/**
 * The one page a stranger sees for an unknown token, a revoked token, and a malformed token alike.
 *
 * **It renders nothing conditional.** Three different causes, one byte-identical response: that is
 * the anti-oracle property, and the moment this page grows a "was this recently revoked?" branch it
 * is gone. There is also no "go to the runs list" link and no sign-in prompt — somebody who
 * mistyped a share URL is not a lapsed user to be recovered.
 */
export default function ShareNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[470px] flex-col justify-center p-5">
      <p className="text-xs font-semibold tracking-[0.02em] text-accent">{PUBLIC_TITLE}</p>
      <h1 className="mt-2 text-[26px] font-bold tracking-[-0.02em] text-ink">{NOT_FOUND_TITLE}</h1>
      <p className="mt-2 text-[13px] leading-[1.55] font-medium text-ink-2">{NOT_FOUND_BODY}</p>
    </main>
  )
}
