/**
 * Entry: argv parsing, preflight, and the sweep budget. `main` builds one SQL client, checks the
 * ground it stands on, then drains.
 *
 * The executable entry point is the barrel `../nina-image-worker.ts` — its bottom-of-file guard
 * compares `import.meta.url` against `process.argv[1]`, and only the barrel's path is ever
 * `argv[1]`, so the guard lives there and not here.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { NINA_IMAGE_SWEEP_BUDGET } from '../../lib/nina/imagerecipe.ts'

import { connectSql } from './sql.ts'
import { preflight } from './preflight.ts'
import { runOneJob } from './run.ts'

export interface WorkerArgv {
  jobId: string | null
  dryRun: boolean
}

export function parseArgv(argv: readonly string[]): WorkerArgv {
  const jobFlag = argv.indexOf('--job')
  const raw = jobFlag === -1 ? null : (argv[jobFlag + 1] ?? null)
  /*
   * `workflow_dispatch` inputs arrive as strings and an unset one arrives as the empty string, so
   * "--job ''" must mean "sweep" and not "job id ''". The character class is the id alphabet from
   * `lib/id.ts`; anything else is a caller bug and is refused rather than turned into a query.
   */
  const jobId = raw != null && /^[0-9A-Za-z_-]{1,64}$/.test(raw) ? raw : null
  return { jobId, dryRun: argv.includes('--dry-run') }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const { jobId, dryRun } = parseArgv(argv)
  const sql = connectSql(process.env.DATABASE_URL as string)

  await preflight(sql)
  if (dryRun) {
    console.info('[nina-worker] preflight ok', { jobId, mode: jobId == null ? 'sweep' : 'job' })
    return 0
  }

  /*
   * With `--job` exactly one job is attempted, because the doorbell named it. Without one, up to
   * `NINA_IMAGE_SWEEP_BUDGET` — a burst of six requests would otherwise make a single scheduled run
   * exceed `timeout-minutes`, and a run killed mid-generation wastes the money it already spent.
   * Three x 78 s ~ 4 min, inside the 6.
   */
  const budget = jobId == null ? NINA_IMAGE_SWEEP_BUDGET : 1
  let done = 0
  for (let i = 0; i < budget; i++) {
    const result = await runOneJob(sql, jobId)
    if (result === 'none') break
    done += 1
  }

  /*
   * Exit 0 even when nothing was found. The scheduled backstop finds nothing on the overwhelming
   * majority of its runs — that is what a backstop is — and a red workflow every ten minutes is a
   * workflow nobody reads. A genuine problem (missing secrets, schema drift) throws out of
   * `preflight` and DOES go red.
   */
  console.info('[nina-worker] finished', { attempted: done })
  return 0
}
