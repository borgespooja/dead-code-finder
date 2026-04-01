// Nothing imports this file. With entrypoints=['src/index.ts'] this is unreachable
// and should be flagged as `unreachable-file` with HIGH confidence.
export function legacyHelper(): string {
  return "I am legacy";
}

function internalLegacy(): number {
  return 42;
}

internalLegacy; // keep a self-reference to avoid "obviously unused in file" bias
