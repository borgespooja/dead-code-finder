import type { Confidence, FindingType, SuggestedAction } from "../types.js";
import type { SymbolEntry } from "./symbolIndex.js";

export interface ExplanationInputs {
  entry?: SymbolEntry;
  file?: string;
  fileUnreachable: boolean;
  usedOnlyByDead: boolean;
  matchesDynamicPattern: boolean;
  hasNamespaceImporter: boolean;
  projectHasDynamicImports: boolean;
  treatExportsAsPublic: boolean;
  directReferences: number;
  importerCount: number;
}

export interface ExplanationOutput {
  whyLikelyUnused: string;
  evidence: string[];
  falsePositiveReasons: string[];
  suggestedAction: SuggestedAction;
}

/**
 * Build a deterministic explanation + evidence list + suggested action.
 * We favor language that tells the user *what* we saw and *why we hesitate*,
 * so humans can quickly sanity-check instead of trusting a confidence label.
 */
export function explain(
  kind: FindingType,
  confidence: Confidence,
  inp: ExplanationInputs,
): ExplanationOutput {
  const evidence: string[] = [];
  const falsePositiveReasons: string[] = [];
  let whyLikelyUnused = "";
  let suggestedAction: SuggestedAction = "needs-review";

  switch (kind) {
    case "unreachable-file": {
      whyLikelyUnused =
        "The file is not reachable from any configured entrypoint and nothing in the reachable graph imports it.";
      evidence.push("File is outside the transitive import closure of entrypoints.");
      if (inp.projectHasDynamicImports) {
        falsePositiveReasons.push(
          "Project uses dynamic import(); this file could be lazy-loaded at runtime.",
        );
      }
      if (inp.matchesDynamicPattern) {
        falsePositiveReasons.push(
          "File matches a configured dynamicPatterns glob (framework convention / plugin loader).",
        );
      }
      if (inp.hasNamespaceImporter) {
        falsePositiveReasons.push(
          "File is star-imported elsewhere; members may be used via namespace access we can't resolve.",
        );
      }
      break;
    }

    case "unused-export": {
      whyLikelyUnused = `Export is never imported by any file in this repo${
        inp.treatExportsAsPublic ? ", but this package treats exports as public API" : ""
      }.`;
      evidence.push(`Importer count across the project: ${inp.importerCount}.`);
      if (inp.treatExportsAsPublic) {
        falsePositiveReasons.push(
          "treatExportsAsPublic=true: external consumers of this package may depend on this export.",
        );
      }
      if (inp.hasNamespaceImporter) {
        falsePositiveReasons.push(
          "A file imports the declaring module via `import * as ns` — usage via ns.X can't be ruled out.",
        );
      }
      if (inp.projectHasDynamicImports) {
        falsePositiveReasons.push(
          "Project uses dynamic import(); dynamic loaders may reference this export by string.",
        );
      }
      break;
    }

    case "dead-only-by-dead": {
      whyLikelyUnused =
        "The symbol is referenced, but only from code that is itself unreachable or unused.";
      evidence.push(
        `${inp.directReferences} direct reference(s), all inside files we already flagged as dead.`,
      );
      falsePositiveReasons.push(
        "If the enclosing dead code is preserved for any reason, this symbol must stay too.",
      );
      break;
    }

    case "unused-function":
    case "unused-class":
    case "unused-variable":
    case "unused-type":
    case "unused-interface":
    case "unused-enum": {
      whyLikelyUnused =
        "The declaration has zero non-self references in the analyzed project and is not re-exported.";
      evidence.push("ts-morph findReferences() returned no non-self use sites.");
      if (inp.entry?.isExported) {
        evidence.push("The declaration is exported but nothing imports that name.");
      } else {
        evidence.push("The declaration is not exported — nothing outside this file can reach it.");
      }
      if (inp.projectHasDynamicImports) {
        falsePositiveReasons.push("Project uses dynamic import(); symbol could be indirectly loaded.");
      }
      if (inp.matchesDynamicPattern) {
        falsePositiveReasons.push(
          "File matches a configured dynamicPatterns glob — framework-loaded conventions may bypass static imports.",
        );
      }
      break;
    }
  }

  // Suggested action resolution
  if (kind === "unreachable-file" && confidence === "high") {
    suggestedAction = "safe-to-remove";
  } else if (confidence === "high" && !inp.treatExportsAsPublic) {
    // When the project isn't treated as public API, a high-confidence finding — exported
    // or not — is safe to remove because we've verified no in-repo consumer references it.
    suggestedAction = "safe-to-remove";
  } else if (confidence === "high" && !inp.entry?.isExported) {
    suggestedAction = "safe-to-remove";
  } else if (inp.treatExportsAsPublic && inp.entry?.isExported) {
    suggestedAction = "keep-public-api";
  } else if (inp.matchesDynamicPattern || inp.hasNamespaceImporter || inp.projectHasDynamicImports) {
    suggestedAction = "investigate-dynamic-use";
  } else {
    suggestedAction = "needs-review";
  }

  return { whyLikelyUnused, evidence, falsePositiveReasons, suggestedAction };
}
