import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import type { DeadCodeConfig } from "../types.js";
import { defaultConfig } from "./defaults.js";

export interface CliOverrides {
  entrypoints?: string[];
  ignore?: string[];
  include?: string[];
  tsconfig?: string;
  treatExportsAsPublic?: boolean;
  dynamicPatterns?: string[];
  configPath?: string;
}

const CONFIG_FILENAMES = [
  "deadcode.config.json",
  ".deadcoderc.json",
];

export async function loadConfig(
  rootArg: string,
  cli: CliOverrides = {},
): Promise<DeadCodeConfig> {
  const root = isAbsolute(rootArg) ? rootArg : resolve(process.cwd(), rootArg);
  const base = defaultConfig(root);

  const explicit = cli.configPath
    ? (isAbsolute(cli.configPath) ? cli.configPath : resolve(root, cli.configPath))
    : undefined;

  let fileConfig: Partial<DeadCodeConfig> = {};
  const candidate = explicit ?? findConfigFile(root);
  if (candidate) {
    try {
      const raw = await readFile(candidate, "utf8");
      fileConfig = JSON.parse(raw) as Partial<DeadCodeConfig>;
    } catch (err) {
      throw new Error(`Failed to load config at ${candidate}: ${(err as Error).message}`);
    }
  }

  const merged: DeadCodeConfig = {
    ...base,
    ...fileConfig,
    root,
    // CLI overrides win last
    ...(cli.entrypoints ? { entrypoints: cli.entrypoints } : {}),
    ...(cli.ignore ? { ignore: cli.ignore } : {}),
    ...(cli.include ? { include: cli.include } : {}),
    ...(cli.tsconfig ? { tsconfig: cli.tsconfig } : {}),
    ...(cli.treatExportsAsPublic !== undefined
      ? { treatExportsAsPublic: cli.treatExportsAsPublic }
      : {}),
    ...(cli.dynamicPatterns ? { dynamicPatterns: cli.dynamicPatterns } : {}),
  };

  // Narrow invalid confidence values
  const valid = ["high", "medium", "low"] as const;
  if (!valid.includes(merged.safeAutofixMinConfidence)) {
    merged.safeAutofixMinConfidence = "high";
  }

  return merged;
}

function findConfigFile(root: string): string | undefined {
  for (const name of CONFIG_FILENAMES) {
    const p = resolve(root, name);
    if (existsSync(p)) return p;
  }
  return undefined;
}
