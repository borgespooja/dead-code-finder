import type { DeadCodeConfig, Report } from "../types.js";
import type { Logger } from "../utils/logger.js";
import { createLogger } from "../utils/logger.js";
import { discoverFiles, resolveEntrypoints } from "../discovery/files.js";
import { loadProject } from "../project/loader.js";
import { indexSymbols } from "./symbolIndex.js";
import { buildImportGraph } from "./importGraph.js";
import { computeReachability } from "./reachability.js";
import { analyzeReferences } from "./referenceGraph.js";
import { classify } from "./classifier.js";
import { buildMatcher } from "../utils/dynamicPatterns.js";
import { relFromRoot } from "../utils/paths.js";

export interface AnalyzeOptions {
  logger?: Logger;
}

/**
 * Top-level orchestration: config in, structured Report out.
 * No side effects beyond disk reads — writing/cleanup happens in cleanup/applier.
 */
export async function analyze(
  config: DeadCodeConfig,
  opts: AnalyzeOptions = {},
): Promise<Report> {
  const log = opts.logger ?? createLogger();

  log.debug(`Discovering files under ${config.root}`);
  const discovered = await discoverFiles(config);
  if (discovered.length === 0) {
    log.warn("No source files matched include patterns — producing empty report.");
  } else {
    log.info(`Discovered ${discovered.length} source file(s).`);
  }

  const files = new Set(discovered);
  const testMatcher = buildMatcher(config.testPatterns);
  const testFiles = new Set<string>();
  for (const f of discovered) {
    if (testMatcher(relFromRoot(config.root, f))) testFiles.add(f);
  }

  log.debug("Loading ts-morph project…");
  const { project, tsconfigUsed } = loadProject(config, discovered);
  if (tsconfigUsed) {
    log.debug(`Using tsconfig: ${tsconfigUsed}`);
  } else {
    log.debug("No tsconfig found; using permissive defaults.");
  }

  // Resolve entrypoints AFTER files are discovered so we can warn on typos.
  const { resolved: entrypointPaths, missing } = await resolveEntrypoints(config, discovered);
  for (const m of missing) {
    log.warn(`Entrypoint not found: ${m}`);
  }
  if (!entrypointPaths.length) {
    log.warn(
      "No entrypoints resolved — reachability analysis will treat every file as unreachable. " +
      "Pass --entry <file> or configure entrypoints in deadcode.config.json.",
    );
  }

  log.debug("Building import graph…");
  const importGraph = buildImportGraph(project, files);

  log.debug("Computing reachability…");
  const { reachable, unreachable } = computeReachability(importGraph, files, entrypointPaths);

  log.debug("Indexing symbols…");
  const index = indexSymbols(project, files);
  log.debug(`Indexed ${index.entries.length} symbol(s).`);

  log.debug("Analyzing references (this can be slow on large repos)…");
  const references = analyzeReferences(index, importGraph);

  log.debug("Classifying findings…");
  const findings = classify({
    config,
    files,
    index,
    importGraph,
    references,
    reachable,
    unreachable,
    testFiles,
  });

  // Summary
  const byConfidence = { high: 0, medium: 0, low: 0 } as Record<"high" | "medium" | "low", number>;
  const byType: Record<string, number> = {};
  let safeToAutofix = 0;
  for (const f of findings) {
    byConfidence[f.confidence] += 1;
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    if (f.safeToAutofix) safeToAutofix += 1;
  }

  const report: Report = {
    generatedAt: new Date().toISOString(),
    root: config.root,
    entrypoints: entrypointPaths.map((p) => relFromRoot(config.root, p)),
    filesAnalyzed: discovered.length,
    findings: sortFindings(findings),
    summary: {
      total: findings.length,
      byConfidence,
      byType,
      safeToAutofix,
    },
  };

  return report;
}

function sortFindings(findings: ReturnType<typeof classify>) {
  const confidenceRank = { high: 0, medium: 1, low: 2 } as const;
  return [...findings].sort((a, b) => {
    const c = confidenceRank[a.confidence] - confidenceRank[b.confidence];
    if (c !== 0) return c;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}
