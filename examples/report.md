# Dead Code Report

_Generated: 2026-04-23T00:14:20.578Z_

- Root: `/Users/poojamalviya/Workspace/ClaudeProjects/DeadCodeFinder/tests/fixtures/simple`
- Files analyzed: **6**
- Findings: **4**
- By confidence: high=2, medium=0, low=2
- Marked safe to autofix: **2**
- Entrypoints: `src/index.ts`

## High confidence (2)

### `src/unreachable.ts` — unreachable-file

**Location:** `src/unreachable.ts:1`
**Why likely unused:** The file is not reachable from any configured entrypoint and nothing in the reachable graph imports it.
**Evidence:**
- File is outside the transitive import closure of entrypoints.
**Confidence:** high  |  **Risk:** low  |  **Suggested:** safe-to-remove
**References:** direct=0, transitive=0  |  **Public API:** no  |  **Safe autofix:** yes
**Notes:**
- internal (non-exported) symbol with no non-self references found in the project

### `addFinite` — unused-export

**Location:** `src/used.ts:16`
**Why likely unused:** Export is never imported by any file in this repo.
**Evidence:**
- Importer count across the project: 0.
**Confidence:** high  |  **Risk:** low  |  **Suggested:** safe-to-remove
**References:** direct=0, transitive=0  |  **Public API:** no  |  **Safe autofix:** yes

## Low confidence — needs human review (2)

### `capitalize` — unused-export

**Location:** `src/helpers.ts:9`
**Why likely unused:** Export is never imported by any file in this repo.
**Evidence:**
- Importer count across the project: 0.
**Confidence:** low  |  **Risk:** high  |  **Suggested:** investigate-dynamic-use
**References:** direct=0, transitive=0  |  **Public API:** no  |  **Safe autofix:** no
**False-positive risks:**
- A file imports the declaring module via `import * as ns` — usage via ns.X can't be ruled out.

### `src/plugins/sample.ts` — unreachable-file

**Location:** `src/plugins/sample.ts:1`
**Why likely unused:** The file is not reachable from any configured entrypoint and nothing in the reachable graph imports it.
**Evidence:**
- File is outside the transitive import closure of entrypoints.
**Confidence:** low  |  **Risk:** high  |  **Suggested:** investigate-dynamic-use
**References:** direct=0, transitive=0  |  **Public API:** no  |  **Safe autofix:** no
**False-positive risks:**
- File matches a configured dynamicPatterns glob (framework convention / plugin loader).
**Notes:**
- file/symbol matches a configured dynamicPatterns glob
