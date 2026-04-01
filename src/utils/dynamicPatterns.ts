import picomatch from "picomatch";

/**
 * Build a matcher that tests a POSIX relative path against any of the globs.
 * Empty glob list => matcher that always returns false.
 */
export function buildMatcher(patterns: string[]): (relPath: string) => boolean {
  if (!patterns.length) return () => false;
  const matchers = patterns.map((p) => picomatch(p, { dot: true }));
  return (relPath: string) => matchers.some((m) => m(relPath));
}
