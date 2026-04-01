import type { Finding, Report } from "../types.js";

/**
 * A Markdown report optimized for PR description or cleanup issue body.
 * We group findings by confidence so reviewers focus on the "safe" bucket first.
 */
export function formatMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push(`# Dead Code Report`);
  lines.push("");
  lines.push(`_Generated: ${report.generatedAt}_`);
  lines.push("");
  lines.push(`- Root: \`${report.root}\``);
  lines.push(`- Files analyzed: **${report.filesAnalyzed}**`);
  lines.push(`- Findings: **${report.summary.total}**`);
  lines.push(
    `- By confidence: high=${report.summary.byConfidence.high}, medium=${report.summary.byConfidence.medium}, low=${report.summary.byConfidence.low}`,
  );
  lines.push(`- Marked safe to autofix: **${report.summary.safeToAutofix}**`);
  lines.push(`- Entrypoints: ${report.entrypoints.map((e) => `\`${e}\``).join(", ") || "_(none resolved)_"}`);
  lines.push("");

  const buckets: Array<{ title: string; filter: (f: Finding) => boolean }> = [
    { title: "High confidence", filter: (f) => f.confidence === "high" },
    { title: "Medium confidence", filter: (f) => f.confidence === "medium" },
    { title: "Low confidence — needs human review", filter: (f) => f.confidence === "low" },
  ];

  for (const bucket of buckets) {
    const items = report.findings.filter(bucket.filter);
    if (!items.length) continue;
    lines.push(`## ${bucket.title} (${items.length})`);
    lines.push("");
    for (const f of items) {
      lines.push(renderFinding(f));
      lines.push("");
    }
  }

  if (!report.findings.length) {
    lines.push("No dead code detected. ✨");
  }

  return lines.join("\n");
}

function renderFinding(f: Finding): string {
  const head = `### \`${f.name}\` — ${f.type}`;
  const loc = `\`${f.file}:${f.line}\``;
  const bits: string[] = [head, ""];
  bits.push(`**Location:** ${loc}`);
  bits.push(`**Why likely unused:** ${f.whyLikelyUnused}`);
  if (f.evidence.length) {
    bits.push(`**Evidence:**`);
    for (const e of f.evidence) bits.push(`- ${e}`);
  }
  bits.push(`**Confidence:** ${f.confidence}  |  **Risk:** ${f.riskLevel}  |  **Suggested:** ${f.suggestedAction}`);
  bits.push(
    `**References:** direct=${f.directReferences}, transitive=${f.transitiveReferences}  |  **Public API:** ${f.deletionImpact.isPublicApi ? "yes" : "no"}  |  **Safe autofix:** ${f.safeToAutofix ? "yes" : "no"}`,
  );
  if (f.falsePositiveReasons.length) {
    bits.push(`**False-positive risks:**`);
    for (const r of f.falsePositiveReasons) bits.push(`- ${r}`);
  }
  if (f.deletionImpact.cascading.length) {
    bits.push(`**Cascading removals:** ${f.deletionImpact.cascading.join(", ")}`);
  }
  if (f.deletionImpact.notes.length) {
    bits.push(`**Notes:**`);
    for (const n of f.deletionImpact.notes) bits.push(`- ${n}`);
  }
  return bits.join("\n");
}
