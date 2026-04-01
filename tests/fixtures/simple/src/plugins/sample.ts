// Matches dynamicPatterns in the config — should be flagged LOW confidence
// ("investigate-dynamic-use") even though it's unreachable from entrypoints.
export function pluginEntry(): string {
  return "loaded dynamically";
}
