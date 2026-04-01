#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import chalk from "chalk";

import { analyze } from "./analysis/analyze.js";
import { loadConfig } from "./config/loader.js";
import { formatCliSummary } from "./report/cli.js";
import { formatJson } from "./report/json.js";
import { formatMarkdown } from "./report/markdown.js";
import { createLogger } from "./utils/logger.js";
import { planCleanup } from "./cleanup/planner.js";
import { applyCleanup } from "./cleanup/applier.js";
import { cleanupBranchAndCommit, writePrDraft } from "./cleanup/git.js";
import type { Finding, Report } from "./types.js";

const program = new Command();

program
  .name("deadcode")
  .description("Find and explain likely dead code in TypeScript/JavaScript repos.")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan a project for dead code.")
  .argument("[root]", "Project root", ".")
  .option("-f, --format <format>", "Output format: cli|json|markdown", "cli")
  .option("-o, --output <file>", "Write the report to a file instead of stdout")
  .option("-e, --entry <path...>", "Entrypoint file(s); may be passed multiple times")
  .option("--ignore <pattern...>", "Override ignore globs")
  .option("--include <pattern...>", "Override include globs")
  .option("--tsconfig <path>", "Path to tsconfig.json")
  .option("--config <path>", "Path to deadcode.config.json")
  .option("--no-treat-exports-as-public", "Don't treat every export as public API")
  .option("--dynamic-pattern <pattern...>", "Treat files matching these globs as dynamic-loaded")
  .option("-v, --verbose", "Verbose logging", false)
  .option("-q, --quiet", "Suppress non-error logging", false)
  .action(async function (this: Command, root: string, opts) {
    const logger = createLogger({ verbose: opts.verbose, quiet: opts.quiet });
    try {
      // Only forward the --no-treat-exports-as-public flag when the user actually passed it,
      // otherwise commander's synthetic default of `true` would clobber any value coming from
      // the config file.
      const explicitPublic =
        this.getOptionValueSource("treatExportsAsPublic") === "cli"
          ? opts.treatExportsAsPublic
          : undefined;

      const config = await loadConfig(root, {
        entrypoints: opts.entry,
        ignore: opts.ignore,
        include: opts.include,
        tsconfig: opts.tsconfig,
        treatExportsAsPublic: explicitPublic,
        dynamicPatterns: opts.dynamicPattern,
        configPath: opts.config,
      });
      const report = await analyze(config, { logger });
      const output = renderReport(report, opts.format as string);
      if (opts.output) {
        await writeFile(resolve(process.cwd(), opts.output), output, "utf8");
        logger.success(`Wrote report to ${opts.output}`);
      } else {
        process.stdout.write(output + "\n");
      }
      // Exit with non-zero when any high-confidence findings exist, so CI can gate.
      if (report.summary.byConfidence.high > 0) {
        process.exitCode = 1;
      }
    } catch (err) {
      logger.error((err as Error).message);
      if (opts.verbose) console.error((err as Error).stack);
      process.exit(2);
    }
  });

program
  .command("cleanup")
  .description("Plan or apply cleanup edits for high-confidence findings.")
  .argument("[root]", "Project root", ".")
  .option("-e, --entry <path...>", "Entrypoint file(s); may be passed multiple times")
  .option("--config <path>", "Path to deadcode.config.json")
  .option("--tsconfig <path>", "Path to tsconfig.json")
  .option("--min-confidence <level>", "Minimum confidence to act on: high|medium|low", "high")
  .option(
    "--write",
    "Actually apply edits (and create a branch + commit if in a git repo). Without this, only a plan is printed.",
    false,
  )
  .option("--branch <name>", "Branch name to create (default: deadcode/cleanup-<timestamp>)")
  .option("--create-pr", "Write a PR_DRAFT.md next to the report with a suggested PR title/body", false)
  .option("-v, --verbose", "Verbose logging", false)
  .option("-q, --quiet", "Suppress non-error logging", false)
  .action(async (root: string, opts) => {
    const logger = createLogger({ verbose: opts.verbose, quiet: opts.quiet });
    try {
      const config = await loadConfig(root, {
        entrypoints: opts.entry,
        tsconfig: opts.tsconfig,
        configPath: opts.config,
      });
      const minConf = validateConfidence(opts.minConfidence);
      const report = await analyze({ ...config, safeAutofixMinConfidence: minConf }, { logger });

      const plan = planCleanup(report, { minConfidence: minConf, root: config.root });
      if (!plan.items.length) {
        logger.info(`No findings at or above "${minConf}" confidence to clean up.`);
        if (plan.skipped.length) {
          logger.info(`${plan.skipped.length} finding(s) skipped — see plan details with --verbose.`);
          if (opts.verbose) {
            for (const s of plan.skipped) {
              logger.debug(`  skipped ${s.findingId}: ${s.reason}`);
            }
          }
        }
        return;
      }

      logger.info(`Planned ${plan.items.length} cleanup item(s):`);
      for (const item of plan.items) {
        logger.info(`  - ${chalk.cyan(item.file)}: ${item.description}`);
      }

      if (!opts.write) {
        logger.info("Dry run. Pass --write to apply edits.");
        return;
      }

      const applied = await applyCleanup(plan, { root: config.root });
      logger.success(`Applied edits to ${applied.filesChanged.length} file(s).`);
      logger.info(`Removed ${applied.removedCount} symbol(s); deleted ${applied.filesDeleted.length} file(s).`);

      const branch = opts.branch ?? `deadcode/cleanup-${Date.now()}`;
      const gitResult = await cleanupBranchAndCommit({
        root: config.root,
        branch,
        filesChanged: applied.filesChanged,
        filesDeleted: applied.filesDeleted,
      });

      if (gitResult.ok) {
        logger.success(`Created branch ${branch} and committed changes.`);
      } else {
        logger.warn(`Edits applied but git integration skipped: ${gitResult.reason}`);
      }

      if (opts.createPr) {
        const prPath = await writePrDraft({
          root: config.root,
          plan,
          report,
          branch,
        });
        logger.success(`Wrote PR draft to ${prPath}`);
      }
    } catch (err) {
      logger.error((err as Error).message);
      if (opts.verbose) console.error((err as Error).stack);
      process.exit(2);
    }
  });

program
  .command("explain")
  .description("Show the full finding for a single symbol (path#name or id).")
  .argument("<query>", "e.g. src/utils/legacy.ts#oldHelper")
  .argument("[root]", "Project root", ".")
  .option("--config <path>", "Path to deadcode.config.json")
  .action(async (query: string, root: string, opts) => {
    const logger = createLogger();
    try {
      const config = await loadConfig(root, { configPath: opts.config });
      const report = await analyze(config, { logger });
      const match = findFinding(report, query);
      if (!match) {
        logger.error(`No finding matches "${query}".`);
        process.exit(1);
      }
      process.stdout.write(formatSingleFinding(match) + "\n");
    } catch (err) {
      logger.error((err as Error).message);
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${chalk.red("✖")} ${msg}\n`);
  process.exit(2);
});

// --- helpers ---------------------------------------------------------------

function renderReport(report: Report, format: string): string {
  switch (format) {
    case "json":
      return formatJson(report);
    case "markdown":
    case "md":
      return formatMarkdown(report);
    case "cli":
    default:
      return formatCliSummary(report);
  }
}

function validateConfidence(raw: string): "high" | "medium" | "low" {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  throw new Error(`Invalid --min-confidence "${raw}". Use high, medium, or low.`);
}

function findFinding(report: Report, query: string): Finding | undefined {
  // Try id first
  const byId = report.findings.find((f) => f.id === query);
  if (byId) return byId;
  // Then path#name
  if (query.includes("#")) {
    const [file, name] = query.split("#");
    return report.findings.find((f) => f.file === file && f.name === name);
  }
  // Last resort: substring on id or name
  return report.findings.find((f) => f.id.includes(query) || f.name === query);
}

function formatSingleFinding(f: Finding): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`${f.type}  ${f.name}  (${f.file}:${f.line})`));
  lines.push(`confidence: ${f.confidence}  risk: ${f.riskLevel}  suggested: ${f.suggestedAction}`);
  lines.push("");
  lines.push(chalk.bold("Why likely unused:"));
  lines.push(`  ${f.whyLikelyUnused}`);
  if (f.evidence.length) {
    lines.push(chalk.bold("Evidence:"));
    for (const e of f.evidence) lines.push(`  - ${e}`);
  }
  if (f.falsePositiveReasons.length) {
    lines.push(chalk.bold("False-positive risks:"));
    for (const r of f.falsePositiveReasons) lines.push(`  - ${r}`);
  }
  lines.push(chalk.bold("Impact:"));
  lines.push(`  direct refs: ${f.directReferences}`);
  lines.push(`  transitive refs: ${f.transitiveReferences}`);
  lines.push(`  public API: ${f.deletionImpact.isPublicApi ? "yes" : "no"}`);
  if (f.deletionImpact.cascading.length) {
    lines.push(`  cascading: ${f.deletionImpact.cascading.join(", ")}`);
  }
  if (f.deletionImpact.notes.length) {
    for (const n of f.deletionImpact.notes) lines.push(`  - ${n}`);
  }
  lines.push(`safe to autofix: ${f.safeToAutofix ? "yes" : "no"}`);
  return lines.join("\n");
}
