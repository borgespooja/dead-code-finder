/**
 * Shared types for the dead-code finder.
 * Everything the pipeline produces flows through these shapes.
 */

export type Confidence = "high" | "medium" | "low";
export type RiskLevel = "low" | "medium" | "high";

export type FindingType =
  | "unused-function"
  | "unused-class"
  | "unused-variable"
  | "unused-type"
  | "unused-interface"
  | "unused-enum"
  | "unused-export"
  | "unreachable-file"
  | "dead-only-by-dead";

export type SuggestedAction =
  | "safe-to-remove"
  | "needs-review"
  | "investigate-dynamic-use"
  | "keep-public-api";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface Finding {
  id: string;
  type: FindingType;
  name: string;
  file: string;
  line: number;
  column: number;

  whyLikelyUnused: string;
  evidence: string[];
  confidence: Confidence;
  riskLevel: RiskLevel;
  falsePositiveReasons: string[];

  directReferences: number;
  transitiveReferences: number;

  deletionImpact: {
    isPublicApi: boolean;
    cascading: string[]; // ids of findings that would be freed by this one
    notes: string[];
  };

  suggestedAction: SuggestedAction;
  safeToAutofix: boolean;
}

export interface DeadCodeConfig {
  root: string;
  entrypoints: string[];
  ignore: string[];
  include: string[];
  tsconfig?: string | undefined;
  treatExportsAsPublic: boolean;
  dynamicPatterns: string[];
  safeAutofixMinConfidence: Confidence;
  /** Globs classifying files as tests; they're analyzed but excluded from being "public API". */
  testPatterns: string[];
}

export interface Report {
  generatedAt: string;
  root: string;
  entrypoints: string[];
  filesAnalyzed: number;
  findings: Finding[];
  summary: {
    total: number;
    byConfidence: Record<Confidence, number>;
    byType: Partial<Record<FindingType, number>>;
    safeToAutofix: number;
  };
}

export interface CleanupPlanItem {
  findingId: string;
  file: string;
  description: string;
  /** Start/end offsets in the source file that we intend to remove. */
  edits: Array<{ start: number; end: number }>;
}

export interface CleanupPlan {
  items: CleanupPlanItem[];
  skipped: Array<{ findingId: string; reason: string }>;
}
