import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Project, ScriptTarget, ModuleKind, ModuleResolutionKind } from "ts-morph";
import type { DeadCodeConfig } from "../types.js";

export interface LoadedProject {
  project: Project;
  tsconfigUsed: string | null;
}

/**
 * Load a ts-morph Project. If a tsconfig is configured or discoverable, use it — this gives
 * correct module resolution, path mappings, and JSX settings. Otherwise fall back to a
 * permissive in-memory config and add the discovered files directly.
 */
export function loadProject(
  config: DeadCodeConfig,
  discoveredFiles: string[],
): LoadedProject {
  const tsconfigPath = resolveTsconfig(config);

  if (tsconfigPath) {
    const project = new Project({
      tsConfigFilePath: tsconfigPath,
      skipAddingFilesFromTsConfig: false,
      skipFileDependencyResolution: false,
    });
    // Also add any source files the glob discovered that tsconfig might've missed
    for (const f of discoveredFiles) {
      if (!project.getSourceFile(f)) {
        try {
          project.addSourceFileAtPath(f);
        } catch {
          // ignore add failures — file may be non-TS
        }
      }
    }
    return { project, tsconfigUsed: tsconfigPath };
  }

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: 4, // Preserve — we only analyze, don't emit
      target: ScriptTarget.ES2022,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      resolveJsonModule: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      strict: false,
    },
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: false,
    useInMemoryFileSystem: false,
  });

  for (const f of discoveredFiles) {
    try {
      project.addSourceFileAtPath(f);
    } catch {
      // skip unloadable files
    }
  }

  return { project, tsconfigUsed: null };
}

function resolveTsconfig(config: DeadCodeConfig): string | null {
  if (config.tsconfig) {
    const p = resolve(config.root, config.tsconfig);
    return existsSync(p) ? p : null;
  }
  for (const name of ["tsconfig.json", "jsconfig.json"]) {
    const p = resolve(config.root, name);
    if (existsSync(p)) return p;
  }
  return null;
}
