import type { ImportGraph } from "./importGraph.js";

export interface ReachabilityResult {
  /** Files reachable from entrypoints (union, including the entrypoints themselves). */
  reachable: Set<string>;
  /** Files *not* reachable from entrypoints. */
  unreachable: Set<string>;
  /** Entrypoints that resolved successfully. */
  entrypoints: Set<string>;
}

/**
 * BFS over the file import graph starting from entrypoint files.
 * Both value and type-only edges propagate reachability — type-only imports still
 * tell us "this file's types are needed", which is a live use.
 */
export function computeReachability(
  graph: ImportGraph,
  allFiles: Set<string>,
  entrypoints: string[],
): ReachabilityResult {
  const entrySet = new Set(entrypoints.filter((e) => allFiles.has(e)));
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const e of entrySet) {
    reachable.add(e);
    queue.push(e);
  }

  while (queue.length) {
    const cur = queue.shift()!;
    const outs = graph.outgoing.get(cur) ?? [];
    for (const edge of outs) {
      if (!allFiles.has(edge.to)) continue;
      if (reachable.has(edge.to)) continue;
      reachable.add(edge.to);
      queue.push(edge.to);
    }
  }

  const unreachable = new Set<string>();
  for (const f of allFiles) {
    if (!reachable.has(f)) unreachable.add(f);
  }

  return { reachable, unreachable, entrypoints: entrySet };
}
