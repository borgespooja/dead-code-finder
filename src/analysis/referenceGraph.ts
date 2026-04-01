import { Node } from "ts-morph";
import type { SymbolEntry, SymbolIndex } from "./symbolIndex.js";
import type { ImportGraph } from "./importGraph.js";

export interface ReferenceInfo {
  /** Distinct non-self reference nodes. */
  total: number;
  /** References by the file containing the reference. */
  byFile: Map<string, number>;
  /** Files that import the symbol's name from the declaring file (via import graph). */
  importers: Set<string>;
}

export interface ReferenceAnalysis {
  /** Per-symbol-id reference info. */
  bySymbol: Map<string, ReferenceInfo>;
}

/**
 * Compute references for every tracked symbol.
 *
 * We combine two signals:
 *   1. ts-morph's findReferencesAsNodes() — catches in-file and cross-file identifier uses,
 *      including inside expressions, JSX, type positions, etc.
 *   2. The import graph — which files import this symbol's declared name. This redundantly
 *      covers cross-file uses but also catches re-exports that might otherwise look "unused"
 *      from the reference side.
 *
 * Both are intentionally redundant: if either side says "someone uses this", we treat it as used.
 */
export function analyzeReferences(
  index: SymbolIndex,
  importGraph: ImportGraph,
): ReferenceAnalysis {
  const bySymbol = new Map<string, ReferenceInfo>();

  // Build a quick lookup: for each file, which names are imported from it?
  const importedNamesFromFile = new Map<string, Map<string, Set<string>>>();
  // file -> (exportedName -> set of importing files)
  for (const edge of importGraph.allEdges) {
    if (!edge.names.length) continue;
    const map = importedNamesFromFile.get(edge.to) ?? new Map<string, Set<string>>();
    for (const name of edge.names) {
      const set = map.get(name) ?? new Set<string>();
      set.add(edge.from);
      map.set(name, set);
    }
    importedNamesFromFile.set(edge.to, map);
  }
  // Namespace imports pull in *all* exported names. Represent as "*" -> importers.

  for (const entry of index.entries) {
    const info: ReferenceInfo = {
      total: 0,
      byFile: new Map(),
      importers: new Set(),
    };

    // 1) ts-morph reference search on the name node
    if (entry.nameNode) {
      let refs: Node[] = [];
      try {
        refs = (entry.nameNode as any).findReferencesAsNodes?.() ?? [];
      } catch {
        // Some pathological nodes can throw; treat as "no references found" rather than failing the scan.
        refs = [];
      }
      for (const ref of refs) {
        // Skip the declaration's own name node
        if (ref === entry.nameNode) continue;
        // Skip references inside the declaration itself (recursion etc. — the symbol is used only by itself).
        if (isInsideNode(ref, entry.declarationNode)) continue;

        const refFile = ref.getSourceFile().getFilePath();
        info.total += 1;
        info.byFile.set(refFile, (info.byFile.get(refFile) ?? 0) + 1);
      }
    }

    // 2) Import graph signal: who imports this symbol by name?
    // We intentionally do NOT treat `import * as ns` as usage of every export, because
    // that would mask genuinely-dead exports. Namespace-import presence is instead handled
    // by the confidence scorer (via `hasNamespaceImporter`), which downgrades confidence
    // so the finding still surfaces but carries a clear false-positive caveat.
    if (entry.isExported) {
      const map = importedNamesFromFile.get(entry.file);
      if (map) {
        const exportedName = entry.isDefaultExport ? "default" : entry.name;
        const importers = map.get(exportedName);
        if (importers) {
          for (const f of importers) info.importers.add(f);
        }
      }
    }

    bySymbol.set(entry.id, info);
  }

  return { bySymbol };
}

/** True if `node` is contained within `container` (inclusive of descendants, exclusive of the container itself). */
function isInsideNode(node: Node, container: Node): boolean {
  let cur: Node | undefined = node.getParent();
  while (cur) {
    if (cur === container) return true;
    cur = cur.getParent();
  }
  return false;
}

/**
 * Is this symbol used at all (by ref or by import edge)?
 */
export function isUsed(
  entry: SymbolEntry,
  info: ReferenceInfo,
): boolean {
  if (info.total > 0) return true;
  if (entry.isExported && info.importers.size > 0) return true;
  return false;
}

/**
 * Used, but only by files we consider dead. Caller passes the set of "dead" files.
 */
export function usedOnlyByDead(
  info: ReferenceInfo,
  deadFiles: Set<string>,
): boolean {
  if (info.total === 0 && info.importers.size === 0) return false;
  for (const f of info.byFile.keys()) {
    if (!deadFiles.has(f)) return false;
  }
  for (const f of info.importers) {
    if (!deadFiles.has(f)) return false;
  }
  return true;
}
