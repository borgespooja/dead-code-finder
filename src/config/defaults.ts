import type { DeadCodeConfig } from "../types.js";

export const DEFAULT_INCLUDE = [
  "src/**/*.{ts,tsx,js,jsx,mjs,cjs}",
];

export const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/*.d.ts",
];

export const DEFAULT_TEST_PATTERNS = [
  "**/*.test.{ts,tsx,js,jsx}",
  "**/*.spec.{ts,tsx,js,jsx}",
  "**/__tests__/**",
];

export const DEFAULT_ENTRYPOINTS = [
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/cli.ts",
];

export function defaultConfig(root: string): DeadCodeConfig {
  return {
    root,
    entrypoints: DEFAULT_ENTRYPOINTS,
    ignore: DEFAULT_IGNORE,
    include: DEFAULT_INCLUDE,
    tsconfig: undefined,
    treatExportsAsPublic: true,
    dynamicPatterns: [],
    safeAutofixMinConfidence: "high",
    testPatterns: DEFAULT_TEST_PATTERNS,
  };
}
