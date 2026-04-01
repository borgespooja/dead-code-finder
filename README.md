# deadcode-finder

A CLI tool for TypeScript/JavaScript repos that finds likely **dead code**, **explains why** each item is flagged, **estimates impact**, and can optionally prepare a **cleanup branch + PR draft**.

Built for **trust and explainability** over breadth: the analyzer prefers downgrading confidence to flagging noisy results. `--write` only acts on high-confidence findings; everything else is surfaced for human review.

- AST-based (ts-morph / TypeScript compiler API), not grep.
- File + symbol-level analysis.
- Builds an import graph and computes reachability from configured entrypoints.
- Scores confidence heuristically (dynamic patterns, namespace imports, public API → lower confidence).
- No LLM required. Deterministic from end to end.

---

## Install

```bash
# inside the repo
npm install
npm run build
```

Once the project is published, the typical install is:

```bash
npm install -g deadcode-finder
```

## Quick start

```bash
# Scan the current directory
deadcode scan .

# Write a JSON report
deadcode scan . --format json --output deadcode.json

# Write a Markdown report
deadcode scan . --format markdown --output deadcode-report.md

# Override entrypoints
deadcode scan . --entry src/index.ts --entry src/cli.ts

# Plan a cleanup (dry run)
deadcode cleanup .

# Actually apply the high-confidence cleanup and create a branch
deadcode cleanup . --write --create-pr --branch deadcode/cleanup-2026-04-22

# Explain a single finding
deadcode explain src/utils/legacy.ts#oldHelper
```

## Configuration

Drop a `deadcode.config.json` at the project root (or pass `--config path/to.json`):

```json
{
  "entrypoints": ["src/index.ts", "src/cli.ts"],
  "ignore": ["**/*.test.ts", "**/*.spec.ts", "src/generated/**"],
  "include": ["src/**/*.{ts,tsx,js,jsx}"],
  "treatExportsAsPublic": true,
  "dynamicPatterns": ["src/plugins/*.ts"],
  "safeAutofixMinConfidence": "high"
}
```

CLI flags always override config values.

### What each setting means

| Key | Meaning |
| --- | --- |
| `entrypoints` | Files that kick off the reachability walk. Anything not reached (directly or transitively) is a candidate for "unreachable-file". |
| `include` / `ignore` | Globs passed to `fast-glob`. Ignore trumps include. |
| `treatExportsAsPublic` | If `true`, exported symbols are treated as external-consumer API — they drop to low confidence even when nothing imports them in-repo. Set `false` for apps; keep `true` for libraries. |
| `dynamicPatterns` | Files that might be loaded via framework conventions, dynamic `import()`, or plugin registries. Anything matching is forced to **low** confidence and `investigate-dynamic-use`. |
| `safeAutofixMinConfidence` | `high` \| `medium` \| `low`. Only findings at or above this threshold are considered for `--write`. |
| `testPatterns` | Files classified as tests. Analyzed (for references) but never flagged as candidates for removal. |

---

## What it detects

- **`unused-function` / `unused-class` / `unused-variable` / `unused-type` / `unused-interface` / `unused-enum`** — internal declarations (not exported) with no non-self references.
- **`unused-export`** — exported symbols that no other file in the repo imports.
- **`unreachable-file`** — whole files not reachable from any entrypoint.
- **`dead-only-by-dead`** — symbols whose only references live inside code already flagged dead.

## How confidence is scored

| Signal | Effect |
| --- | --- |
| File/symbol matches `dynamicPatterns` | `low` |
| File is `import *`-ed elsewhere (namespace import) | `low` |
| Symbol is exported AND `treatExportsAsPublic=true` | `low` |
| Project uses dynamic `import()` AND symbol is exported | `medium` |
| Symbol is internal, zero non-self refs | `high` |
| Symbol is exported, nobody imports it, `treatExportsAsPublic=false` | `high` |
| Unreachable file, no other signals | `medium`–`high` |

Risk is the inverse of confidence unless the symbol is public API, in which case risk is always `high`.

---

## Each finding includes…

```ts
{
  id: string;
  type: "unused-function" | "unused-export" | "unreachable-file" | …;
  name: string;
  file: string;
  line: number;
  whyLikelyUnused: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  riskLevel: "high" | "medium" | "low";
  falsePositiveReasons: string[];
  directReferences: number;
  transitiveReferences: number;
  deletionImpact: {
    isPublicApi: boolean;
    cascading: string[];
    notes: string[];
  };
  suggestedAction:
    | "safe-to-remove"
    | "needs-review"
    | "investigate-dynamic-use"
    | "keep-public-api";
  safeToAutofix: boolean;
}
```

---

## Cleanup workflow

1. `deadcode scan .` — inspect the report.
2. `deadcode cleanup .` — dry-run, lists what `--write` would do.
3. `deadcode cleanup . --write --create-pr` — applies edits, creates a branch and commit, writes `PR_DRAFT.md`.

The MVP refuses to autofix:

- Anything below the configured minimum confidence.
- Anything marked public API.
- Symbol-level removals that aren't `unused-*` (cascading deletions need a human deciding the blast radius).

No pushes. No force-anythings. You review the branch and push when ready.

---

## Programmatic API

```ts
import { analyze, loadConfig, formatMarkdown } from "deadcode-finder";

const config = await loadConfig("./repo");
const report = await analyze(config);
console.log(formatMarkdown(report));
```

## Non-goals for the MVP

- Perfect framework support (Next.js routes, Nest decorators, Vue SFCs).
- Perfect dynamic-code detection.
- Multi-language support.
- Aggressive autofix for uncertain cases.

When in doubt, the tool prefers to leave code alone and explain its doubt clearly.

---

## Development

```bash
npm install
npm run build
npm test

# dev mode (ts-node-like):
npm run dev -- scan tests/fixtures/simple --format cli
```

Project layout:

```
src/
  cli.ts                     CLI entry (commander)
  index.ts                   Programmatic API
  types.ts                   Shared types
  config/                    Config loader + defaults
  discovery/                 File discovery
  project/                   ts-morph project loader
  analysis/                  Symbol index, graphs, reachability, classifier, explanation
  cleanup/                   Planner, applier, git integration
  report/                    CLI / JSON / Markdown formatters
  utils/                     Logger, path helpers, glob matcher

tests/
  fixtures/simple/           Sample repo exercising the main detection categories
  analyze.test.ts
  classifier.test.ts
  planner.test.ts
```
