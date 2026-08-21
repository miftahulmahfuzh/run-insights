/**
 * The records barrel. `gateway.ts` is deliberately NOT re-exported here: it opens with
 * `import 'server-only'`, and pulling it into every consumer of `RECORD_CATALOG` would make the
 * catalog — pure data F08 wants on the client — unimportable outside a server component.
 * Import `@/lib/records/gateway` explicitly where the database is actually needed.
 */

export { isRecordKey, RECORD_CATALOG, RECORD_KEYS, recordDefinition } from './catalog'
export { computeRecords } from './compute'
export {
  recomputeRecords,
  type RecomputeResult,
  type RecordRunRow,
  type RecordsGateway,
} from './recompute'
export type {
  RecordCandidate,
  RecordDefinition,
  RecordDirection,
  RecordKey,
  RecordResult,
  RecordUnit,
  StoredRecord,
} from './types'
