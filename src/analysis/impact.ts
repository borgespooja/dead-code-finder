import type { ImportGraph } from "./importGraph.js";
import type { SymbolEntry, SymbolIndex } from "./symbolIndex.js";
import type { ReferenceAnalysis } from "./referenceGraph.js";

export interface ImpactResult {
  directReferences: number;
  transitiveReferences: number;
  cascadingFiles: string[];
}

/**
 * Compute direct + transitive references for a symbol and the list of files that
 * would lose their last live reason to exist if this symbol went away.
 *
 * Transitive references = sum of references to the symbols that reference this one,
 * capped at a depth of 3 to stay cheap. This is a rough blast-radius signal, not a
 * precise call-graph metric.
 */
export function computeImpact(
  entry: SymbolEntry,
  refs: ReferenceAnalysis,
  index: SymbolIndex,
): ImpactResult {
  const info = refs.bySymbol.get(entry.id);
  if (!info) {
    return { directReferences: 0, transitiveReferences: 0, cascadingFiles: [] };
  }

  const direct = info.total + info.importers.size;

  // Transitive: symbols declared in files that reference this one. We count those symbols' own references.
  let transitive = 0;
  const visited = new Set<string>([entry.id]);
  const toVisit: { symbolId: string; depth: number }[] = [];

  for (const refFile of info.byFile.keys()) {
    const declsInFile = index.byFile.get(refFile) ?? [];
    for (const d of declsInFile) {
      if (!visited.has(d.id)) {
        toVisit.push({ symbolId: d.id, depth: 1 });
        visited.add(d.id);
      }
    }
  }

  while (toVisit.length) {
    const { symbolId, depth } = toVisit.shift()!;
    const nextInfo = refs.bySymbol.get(symbolId);
    if (!nextInfo) continue;
    transitive += nextInfo.total;
    if (depth >= 3) continue;
    for (const f of nextInfo.byFile.keys()) {
      const declsInFile = index.byFile.get(f) ?? [];
      for (const d of declsInFile) {
        if (!visited.has(d.id)) {
          visited.add(d.id);
          toVisit.push({ symbolId: d.id, depth: depth + 1 });
        }
      }
    }
  }

  return {
    directReferences: direct,
    transitiveReferences: transitive,
    cascadingFiles: [],
  };
}

/**
 * File-level blast radius: how many other files import *only* from this file? If this file
 * is removed, those other files lose an import target. We don't act on this, but surface it.
 */
export function filesOnlyImportingFrom(graph: ImportGraph, file: string): string[] {
  const importers = graph.incoming.get(file) ?? [];
  const out = new Set<string>();
  for (const edge of importers) {
    const othersFromImporter = (graph.outgoing.get(edge.from) ?? []).filter((e) => e.to !== file);
    if (othersFromImporter.length === 0) out.add(edge.from);
  }
  return [...out];
}
