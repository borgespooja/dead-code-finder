import chalk from "chalk";
import type { Finding, Report } from "../types.js";

/**
 * A compact terminal summary. We print one line per finding with enough to triage,
 * followed by a totals footer. Colors are used to make confidence pop at a glance.
 */
export function formatCliSummary(report: Report): string {
  const lines: string[] = [];

  lines.push(
    chalk.bold(`Dead code report`) +
      ` — analyzed ${chalk.cyan(String(report.filesAnalyzed))} file(s), ` +
      `found ${chalk.cyan(String(report.summary.total))} finding(s).`,
  );

  if (!report.findings.length) {
    lines.push(chalk.green("No dead code detected. ✨"));
    return lines.join("\n");
  }

  lines.push("");
  const grouped = groupByConfidence(report.findings);
  for (const [conf, items] of grouped) {
    if (!items.length) continue;
    lines.push(renderHeader(conf, items.length));
    for (const f of items) {
      lines.push("  " + renderOneLine(f));
    }
    lines.push("");
  }

  lines.push(
    chalk.dim(
      `high=${report.summary.byConfidence.high}  ` +
        `medium=${report.summary.byConfidence.medium}  ` +
        `low=${report.summary.byConfidence.low}  ` +
        `safeAutofix=${report.summary.safeToAutofix}`,
    ),
  );

  return lines.join("\n");
}

function renderHeader(conf: string, count: number): string {
  const label = `${conf} confidence (${count})`;
  switch (conf) {
    case "high":
      return chalk.bold.red(label);
    case "medium":
      return chalk.bold.yellow(label);
    default:
      return chalk.bold.gray(label);
  }
}

function renderOneLine(f: Finding): string {
  const kind = f.type.padEnd(18);
  const loc = chalk.cyan(`${f.file}:${f.line}`);
  const name = chalk.bold(f.name);
  const risk = renderRisk(f.riskLevel);
  const autofix = f.safeToAutofix ? chalk.green("[safe]") : "";
  return `${kind}  ${name}  ${loc}  ${risk}  ${autofix}  ${chalk.dim(f.whyLikelyUnused)}`;
}

function renderRisk(risk: string): string {
  switch (risk) {
    case "high":
      return chalk.red(`risk=${risk}`);
    case "medium":
      return chalk.yellow(`risk=${risk}`);
    default:
      return chalk.gray(`risk=${risk}`);
  }
}

function groupByConfidence(findings: Finding[]): Array<[string, Finding[]]> {
  const buckets = new Map<string, Finding[]>([
    ["high", []],
    ["medium", []],
    ["low", []],
  ]);
  for (const f of findings) {
    buckets.get(f.confidence)!.push(f);
  }
  return [...buckets];
}
