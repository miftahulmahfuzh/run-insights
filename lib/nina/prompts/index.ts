/**
 * The prompt module's public surface, and the version.
 *
 * **`NINA_PROMPT_VERSION` covers the system text AND every tool schema in `./tools.ts`.** Bump it
 * by hand in the same commit as any edit to either. Unlike F07's `promptVersion` it is not a cache
 * key — Nina has no `facts_hash` and every turn is a fresh call — so its job is narrower and still
 * real: it is what `nina_turns` records, so a change in her behaviour can be traced to the commit
 * that caused it. An edit with no bump is a bug no test can catch; only review can.
 */
export const NINA_PROMPT_VERSION = 1

export {
  LANGUAGE_RULE,
  NINA_REPAIR_PREAMBLE,
  NINA_SYSTEM_PROMPT,
  NUMBERS_RULE,
  CONTEXT_GUIDE,
  OUTPUT_RULE,
  PROACTIVE_INSTRUCTIONS,
  type ProactiveTriggerKind,
} from './system'

export {
  COMPARE_RUNS_TOOL,
  GENERATE_IMAGE_TOOL,
  LOOKUP_RUNS_TOOL,
  NINA_TOOL_NAMES,
  NINA_TOOLS,
  SAVE_MEMORY_TOOL,
  SEND_TOOL,
  SET_AVATAR_TOOL,
} from './tools'
