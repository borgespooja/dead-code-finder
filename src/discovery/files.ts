import fg from "fast-glob";
import { resolve } from "node:path";
import type { DeadCodeConfig } from "../types.js";
import { relFromRoot } from "../utils/paths.js";

/**
 * Discover source files under the project root.
 * Returns absolute paths.
 */
export async function discoverFiles(config: DeadCodeConfig): Promise<string[]> {
  const matches = await fg(config.include, {
    cwd: config.root,
    absolute: true,
    ignore: config.ignore,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
  });
  // Deterministic order — important for stable reports
  matches.sort();
  return matches;
}

/**
 * Resolve entrypoint globs/paths to concrete existing files.
 * Missing entrypoints are silently dropped — the loader warns on them.
 */
export async function resolveEntrypoints(
  config: DeadCodeConfig,
  discovered: string[],
): Promise<{ resolved: string[]; missing: string[] }> {
  const resolved = new Set<string>();
  const missing: string[] = [];
  const discoveredSet = new Set(discovered.map((p) => relFromRoot(config.root, p)));

  for (const entry of config.entrypoints) {
    // Support globs as well as literal paths
    if (entry.includes("*")) {
      const matched = await fg(entry, {
        cwd: config.root,
        absolute: true,
        ignore: config.ignore,
        onlyFiles: true,
      });
      if (!matched.length) missing.push(entry);
      for (const m of matched) resolved.add(m);
      continue;
    }

    const abs = resolve(config.root, entry);
    const rel = relFromRoot(config.root, abs);
    if (discoveredSet.has(rel)) {
      resolved.add(abs);
    } else {
      missing.push(entry);
    }
  }

  return { resolved: [...resolved].sort(), missing };
}
