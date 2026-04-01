import type { Confidence, DeadCodeConfig } from "../types.js";
import type { SymbolEntry } from "./symbolIndex.js";

export interface ConfidenceInputs {
  symbol?: SymbolEntry;
  /** True if the file is unreachable from entrypoints. */
  fileUnreachable?: boolean;
  /** True if the symbol (or containing file) matches a dynamic pattern. */
  matchesDynamicPattern: boolean;
  /** True if the file is a test file. */
  isTest: boolean;
  /** True if there are *any* dynamic imports anywhere in the project. */
  projectHasDynamicImports: boolean;
  /** Relevant for exported symbols only. */
  treatExportsAsPublic: boolean;
  /** Kind-specific: for unused-export cases vs internal. */
  isExported: boolean;
  /** The file contains any namespace (`import * as ...`) importers? */
  hasNamespaceImporter: boolean;
}

/**
 * Heuristic: favor safety. Anything suggesting dynamic use or public API drops confidence.
 * Result is ranked from low to high, default low.
 */
export function scoreConfidence(inp: ConfidenceInputs): {
  confidence: Confidence;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (inp.matchesDynamicPattern) {
    reasons.push("file/symbol matches a configured dynamicPatterns glob");
    return { confidence: "low", reasons };
  }

  if (inp.hasNamespaceImporter) {
    reasons.push("file is star-imported (`import * as ns`) — cannot rule out dynamic member access");
    return { confidence: "low", reasons };
  }

  if (inp.isExported && inp.treatExportsAsPublic) {
    reasons.push("exported symbol, and treatExportsAsPublic=true means consumers outside this repo may rely on it");
    return { confidence: "low", reasons };
  }

  if (inp.projectHasDynamicImports && inp.isExported) {
    reasons.push("project uses dynamic import() somewhere; exported symbol could be loaded dynamically");
    // Don't hard-bucket to low — just downgrade.
    return { confidence: "medium", reasons };
  }

  // Internal (non-exported) symbol with clean evidence → high confidence
  if (!inp.isExported) {
    reasons.push("internal (non-exported) symbol with no non-self references found in the project");
    return { confidence: "high", reasons };
  }

  // Exported symbol with no importers, treatExportsAsPublic false → medium-high
  if (inp.isExported && !inp.treatExportsAsPublic) {
    reasons.push("exported symbol but no in-repo importers, and treatExportsAsPublic=false");
    return { confidence: "high", reasons };
  }

  // Unreachable file fallback
  if (inp.fileUnreachable) {
    reasons.push("file is unreachable from configured entrypoints");
    return { confidence: "medium", reasons };
  }

  reasons.push("default: unable to rule out live use with certainty");
  return { confidence: "low", reasons };
}

export function confidenceAtLeast(actual: Confidence, min: Confidence): boolean {
  const order: Confidence[] = ["low", "medium", "high"];
  return order.indexOf(actual) >= order.indexOf(min);
}

/** Convenience: turn confidence into a risk level for the default suggestion. */
export function riskFor(confidence: Confidence, isPublicApi: boolean): "low" | "medium" | "high" {
  if (isPublicApi) return "high";
  if (confidence === "high") return "low";
  if (confidence === "medium") return "medium";
  return "high";
}

/** Placeholder to satisfy the type compilation when config is unused. */
export type _Keep = DeadCodeConfig;
