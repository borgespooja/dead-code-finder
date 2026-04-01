import type { DeadCodeConfig, Finding, FindingType } from "../types.js";
import { confidenceAtLeast, riskFor, scoreConfidence } from "./confidence.js";
import { explain } from "./explanation.js";
import { computeImpact, filesOnlyImportingFrom } from "./impact.js";
import type { ImportGraph } from "./importGraph.js";
import { isUsed, usedOnlyByDead, type ReferenceAnalysis } from "./referenceGraph.js";
import type { SymbolEntry, SymbolIndex } from "./symbolIndex.js";
import { relFromRoot } from "../utils/paths.js";
import { buildMatcher } from "../utils/dynamicPatterns.js";

export interface ClassifierInputs {
  config: DeadCodeConfig;
  files: Set<string>;
  index: SymbolIndex;
  importGraph: ImportGraph;
  references: ReferenceAnalysis;
  reachable: Set<string>;
  unreachable: Set<string>;
  testFiles: Set<string>;
}

/**
 * Turn graphs + references into a list of findings with confidence, impact, and explanations.
 *
 * Ordering:
 *   1. Unreachable *non-test* files (file-level findings).
 *   2. Per-symbol: exported-but-not-imported / internal-with-no-refs.
 *   3. Symbols used only from already-flagged dead files ("dead-only-by-dead").
 *
 * We deliberately don't cascade deletions automatically — we surface them so humans decide.
 */
export function classify(inp: ClassifierInputs): Finding[] {
  const { config, files, index, importGraph, references, reachable, unreachable, testFiles } = inp;
  const dynamicMatch = buildMatcher(config.dynamicPatterns);
  const projectHasDynamicImports = importGraph.filesWithDynamicImports.size > 0;

  const findings: Finding[] = [];
  const flaggedFiles = new Set<string>(); // files reported as unreachable
  const flaggedSymbolIds = new Set<string>();

  // 1) Unreachable files
  for (const file of unreachable) {
    if (testFiles.has(file)) continue; // tests are allowed to be "unreachable"
    const rel = relFromRoot(config.root, file);
    const matches = dynamicMatch(rel);
    const hasNamespaceImporter = hasNamespaceImporterInto(importGraph, file);

    const { confidence, reasons } = scoreConfidence({
      fileUnreachable: true,
      matchesDynamicPattern: matches,
      isTest: false,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      isExported: false,
      hasNamespaceImporter,
    });

    const explanation = explain("unreachable-file", confidence, {
      fileUnreachable: true,
      usedOnlyByDead: false,
      matchesDynamicPattern: matches,
      hasNamespaceImporter,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      directReferences: (importGraph.incoming.get(file) ?? []).length,
      importerCount: (importGraph.incoming.get(file) ?? []).length,
    });

    const impactNotes: string[] = [...reasons];
    const only = filesOnlyImportingFrom(importGraph, file);
    if (only.length) {
      impactNotes.push(
        `${only.length} file(s) import from here and from nowhere else; they may become orphaned too.`,
      );
    }

    findings.push({
      id: `file:${rel}`,
      type: "unreachable-file",
      name: rel,
      file: rel,
      line: 1,
      column: 1,
      whyLikelyUnused: explanation.whyLikelyUnused,
      evidence: explanation.evidence,
      confidence,
      riskLevel: riskFor(confidence, false),
      falsePositiveReasons: explanation.falsePositiveReasons,
      directReferences: (importGraph.incoming.get(file) ?? []).length,
      transitiveReferences: 0,
      deletionImpact: {
        isPublicApi: false,
        cascading: only.map((f) => `file:${relFromRoot(config.root, f)}`),
        notes: impactNotes,
      },
      suggestedAction: explanation.suggestedAction,
      safeToAutofix:
        explanation.suggestedAction === "safe-to-remove" &&
        confidenceAtLeast(confidence, config.safeAutofixMinConfidence),
    });
    flaggedFiles.add(file);
  }

  // 2) Per-symbol findings
  for (const entry of index.entries) {
    if (!files.has(entry.file)) continue;
    if (flaggedFiles.has(entry.file)) continue; // whole-file finding already covers this

    const info = references.bySymbol.get(entry.id);
    if (!info) continue;

    if (isUsed(entry, info)) continue;

    const isTest = testFiles.has(entry.file);
    if (isTest) {
      // We analyze tests but don't flag their internal symbols — tests should be pruned
      // by test-specific tooling, not by a general dead-code scanner.
      continue;
    }

    const rel = relFromRoot(config.root, entry.file);
    const matches = dynamicMatch(rel);
    const hasNamespaceImporter = hasNamespaceImporterInto(importGraph, entry.file);

    const { confidence } = scoreConfidence({
      symbol: entry,
      matchesDynamicPattern: matches,
      isTest: false,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      isExported: entry.isExported,
      hasNamespaceImporter,
    });

    const impact = computeImpact(entry, references, index);
    const type = typeForEntry(entry);

    const explanation = explain(type, confidence, {
      entry,
      fileUnreachable: unreachable.has(entry.file),
      usedOnlyByDead: false,
      matchesDynamicPattern: matches,
      hasNamespaceImporter,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      directReferences: impact.directReferences,
      importerCount: info.importers.size,
    });

    findings.push({
      id: `sym:${rel}#${entry.name}:${entry.line}`,
      type,
      name: entry.name,
      file: rel,
      line: entry.line,
      column: entry.column,
      whyLikelyUnused: explanation.whyLikelyUnused,
      evidence: explanation.evidence,
      confidence,
      riskLevel: riskFor(confidence, entry.isExported && config.treatExportsAsPublic),
      falsePositiveReasons: explanation.falsePositiveReasons,
      directReferences: impact.directReferences,
      transitiveReferences: impact.transitiveReferences,
      deletionImpact: {
        isPublicApi: entry.isExported && config.treatExportsAsPublic,
        cascading: [],
        notes: [],
      },
      suggestedAction: explanation.suggestedAction,
      safeToAutofix:
        explanation.suggestedAction === "safe-to-remove" &&
        confidenceAtLeast(confidence, config.safeAutofixMinConfidence),
    });
    flaggedSymbolIds.add(entry.id);
  }

  // 3) Symbols that are used, but *only* from already-dead code
  const deadFiles = new Set<string>(flaggedFiles);
  for (const entry of index.entries) {
    if (flaggedSymbolIds.has(entry.id)) continue;
    if (!files.has(entry.file)) continue;
    if (flaggedFiles.has(entry.file)) continue;
    if (testFiles.has(entry.file)) continue;

    const info = references.bySymbol.get(entry.id);
    if (!info) continue;
    if (!isUsed(entry, info)) continue;
    if (!usedOnlyByDead(info, deadFiles)) continue;

    const rel = relFromRoot(config.root, entry.file);
    const matches = buildMatcher(config.dynamicPatterns)(rel);
    const hasNamespaceImporter = hasNamespaceImporterInto(importGraph, entry.file);

    const { confidence } = scoreConfidence({
      symbol: entry,
      matchesDynamicPattern: matches,
      isTest: false,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      isExported: entry.isExported,
      hasNamespaceImporter,
    });

    const explanation = explain("dead-only-by-dead", confidence, {
      entry,
      fileUnreachable: false,
      usedOnlyByDead: true,
      matchesDynamicPattern: matches,
      hasNamespaceImporter,
      projectHasDynamicImports,
      treatExportsAsPublic: config.treatExportsAsPublic,
      directReferences: info.total,
      importerCount: info.importers.size,
    });

    findings.push({
      id: `dbd:${rel}#${entry.name}:${entry.line}`,
      type: "dead-only-by-dead",
      name: entry.name,
      file: rel,
      line: entry.line,
      column: entry.column,
      whyLikelyUnused: explanation.whyLikelyUnused,
      evidence: explanation.evidence,
      confidence,
      riskLevel: riskFor(confidence, entry.isExported && config.treatExportsAsPublic),
      falsePositiveReasons: explanation.falsePositiveReasons,
      directReferences: info.total,
      transitiveReferences: 0,
      deletionImpact: {
        isPublicApi: entry.isExported && config.treatExportsAsPublic,
        cascading: [],
        notes: ["Only referenced by code already flagged dead; removing the dead code will free this too."],
      },
      suggestedAction: explanation.suggestedAction,
      safeToAutofix: false, // never autofix cascading cases in the MVP
    });
  }

  return findings;
}

function typeForEntry(entry: SymbolEntry): FindingType {
  if (entry.isExported) return "unused-export";
  switch (entry.kind) {
    case "function":
      return "unused-function";
    case "class":
      return "unused-class";
    case "interface":
      return "unused-interface";
    case "type-alias":
      return "unused-type";
    case "enum":
      return "unused-enum";
    case "variable":
      return "unused-variable";
  }
}

function hasNamespaceImporterInto(graph: ImportGraph, file: string): boolean {
  const incoming = graph.incoming.get(file) ?? [];
  return incoming.some((e) => e.names.includes("*"));
}
