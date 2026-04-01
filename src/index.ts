/**
 * Programmatic API. Stable surface for callers who embed the analyzer.
 */
export type {
  Finding,
  FindingType,
  Report,
  Confidence,
  RiskLevel,
  SuggestedAction,
  DeadCodeConfig,
  CleanupPlan,
  CleanupPlanItem,
} from "./types.js";

export { analyze } from "./analysis/analyze.js";
export { loadConfig } from "./config/loader.js";
export { defaultConfig } from "./config/defaults.js";
export { formatJson } from "./report/json.js";
export { formatMarkdown } from "./report/markdown.js";
export { formatCliSummary } from "./report/cli.js";
export { planCleanup } from "./cleanup/planner.js";
export { applyCleanup } from "./cleanup/applier.js";
