// Referenced from index.ts — should not be flagged.
export function greet(name: string): string {
  return `hello, ${name}`;
}

export function addNumbers(a: number, b: number): number {
  return a + b;
}

// Private helper — referenced only by addNumbers. Should NOT be flagged.
function ensureFinite(n: number): number {
  if (!Number.isFinite(n)) throw new Error("not finite");
  return n;
}

export function addFinite(a: number, b: number): number {
  return ensureFinite(a) + ensureFinite(b);
}
