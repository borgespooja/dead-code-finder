// pluralize is reached via a namespace import in barrel.ts — should NOT be flagged.
export function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

// capitalize: exported, but no importers in the repo. With treatExportsAsPublic=false
// and no dynamic patterns applying here, this should become a `unused-export`.
// However helpers.ts is star-imported by barrel.ts, which downgrades confidence.
export function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
