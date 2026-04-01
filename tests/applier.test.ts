import { describe, it, expect, beforeEach } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadConfig } from "../src/config/loader.js";
import { analyze } from "../src/analysis/analyze.js";
import { planCleanup } from "../src/cleanup/planner.js";
import { applyCleanup } from "../src/cleanup/applier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/simple");

describe("applyCleanup", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(resolve(tmpdir(), "deadcode-test-"));
    cpSync(FIXTURE, workdir, { recursive: true });
  });

  it("deletes unreachable files and removes high-confidence unused exports", async () => {
    const config = await loadConfig(workdir);
    const report = await analyze(config);
    const plan = planCleanup(report, { minConfidence: "high", root: workdir });

    const result = await applyCleanup(plan, { root: workdir });

    expect(result.filesDeleted.some((f) => f.endsWith("src/unreachable.ts"))).toBe(true);
    expect(existsSync(resolve(workdir, "src/unreachable.ts"))).toBe(false);

    const usedAfter = readFileSync(resolve(workdir, "src/used.ts"), "utf8");
    expect(usedAfter).not.toContain("addFinite");
    expect(usedAfter).toContain("greet"); // sanity check: we didn't touch live code
    expect(usedAfter).toContain("addNumbers");

    // Low-confidence findings must be left alone.
    expect(existsSync(resolve(workdir, "src/plugins/sample.ts"))).toBe(true);
    const helpersAfter = readFileSync(resolve(workdir, "src/helpers.ts"), "utf8");
    expect(helpersAfter).toContain("capitalize");

    rmSync(workdir, { recursive: true, force: true });
  });
});
