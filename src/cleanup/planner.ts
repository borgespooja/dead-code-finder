import { resolve } from "node:path";
import type { CleanupPlan, CleanupPlanItem, Confidence, Finding, Report } from "../types.js";
import { confidenceAtLeast } from "../analysis/confidence.js";

export interface PlanOptions {
  minConfidence: Confidence;
  root: string;
}

/**
 * Turn a Report into a CleanupPlan. We deliberately only plan file-level deletions
 * (unreachable files) for the MVP — removing arbitrary declarations while keeping
 * their surrounding file parseable requires careful range edits that the applier
 * does separately. Symbol-level removals are planned only when we can identify
 * them precisely and they are marked safeToAutofix.
 */
export function planCleanup(report: Report, opts: PlanOptions): CleanupPlan {
  const items: CleanupPlanItem[] = [];
  const skipped: Array<{ findingId: string; reason: string }> = [];

  for (const f of report.findings) {
    if (!f.safeToAutofix) {
      skipped.push({ findingId: f.id, reason: "not marked safe to autofix" });
      continue;
    }
    if (!confidenceAtLeast(f.confidence, opts.minConfidence)) {
      skipped.push({ findingId: f.id, reason: `confidence ${f.confidence} below min ${opts.minConfidence}` });
      continue;
    }

    if (f.type === "unreachable-file") {
      items.push({
        findingId: f.id,
        file: resolve(opts.root, f.file),
        description: `Delete unreachable file ${f.file}`,
        // No edit ranges: the applier will delete the whole file.
        edits: [],
      });
      continue;
    }

    // Symbol-level removals: we only plan when confidence is high and it's not exported public API.
    if (f.confidence === "high" && !f.deletionImpact.isPublicApi) {
      items.push({
        findingId: f.id,
        file: resolve(opts.root, f.file),
        description: `Remove unused ${f.type} "${f.name}" at ${f.file}:${f.line}`,
        // Edit ranges are computed by the applier, which re-loads the project to get
        // accurate offsets (the Report is offset-free so it can serialize to JSON cleanly).
        edits: [],
      });
    } else {
      skipped.push({
        findingId: f.id,
        reason: f.deletionImpact.isPublicApi
          ? "is public API; refusing to autofix"
          : `confidence ${f.confidence}; MVP only autofixes high-confidence non-public symbols`,
      });
    }
  }

  return { items, skipped };
}

/** Convenience: map finding id back to a Finding from a report. */
export function findingsById(report: Report): Map<string, Finding> {
  const out = new Map<string, Finding>();
  for (const f of report.findings) out.set(f.id, f);
  return out;
}
