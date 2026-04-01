import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/loader.js";
import { analyze } from "../src/analysis/analyze.js";
import { planCleanup } from "../src/cleanup/planner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/simple");

describe("planCleanup", () => {
  it("plans deletion for the unreachable file but skips the dynamic one", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const plan = planCleanup(report, { minConfidence: "high", root: config.root });

    const files = plan.items.map((i) => i.file);
    expect(files.some((f) => f.endsWith("src/unreachable.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("src/plugins/sample.ts"))).toBe(false);

    const skipped = plan.skipped.find((s) => s.findingId.includes("plugins/sample.ts"));
    expect(skipped).toBeTruthy();
  });
});
