/**
 * The badges barrel. `gateway.ts` is deliberately NOT re-exported: it opens with
 * `import 'server-only'`, and pulling it in here would make the catalog — pure data the `/me` shelf
 * wants — unimportable outside a server component. Import `@/lib/badges/gateway` explicitly where
 * the database is actually needed. Same split, same reason, as `lib/records/index.ts`.
 */

export {
  BADGE_CATALOG,
  BADGE_KEYS,
  BADGE_THRESHOLDS,
  badgeDefinition,
  badgeScope,
  badgeTitle,
  catalogIndex,
  isBadgeKey,
} from './catalog'

export { BADGE_META, type BadgeMeta } from './meta'

export {
  evaluateBadgesForCommit,
  sweepPeriodBadges,
  type BadgeAwardResult,
  type BadgeGateway,
  type CommitBadgeOptions,
  type CommitFacts,
  type PeriodFacts,
  type SessionFacts,
} from './evaluate'

export {
  evaluateLifetimeBadges,
  evaluateMonthBadges,
  evaluateSessionBadges,
  evaluateWeekBadges,
  windowEdgeFires,
  type LifetimeBadgeContext,
  type MonthBadgeContext,
  type SessionBadgeContext,
  type WeekBadgeContext,
  type WindowRun,
} from './rules'

export {
  previousIsoWeek,
  qualifyingWeekStreak,
  runsOnDay,
  toWindowRun,
  totalDistanceM,
  weekRunCounts,
} from './facts'

export { readProgress, type ProgressReading } from './progress'

export { buildShelf, type Shelf, type ShelfEntry } from './shelf'

export type {
  BadgeDefinition,
  BadgeEarn,
  BadgeKey,
  BadgeProgressMetric,
  BadgeProgressSpec,
  BadgeScope,
  StoredBadge,
} from './types'
