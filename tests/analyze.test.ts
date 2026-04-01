import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../src/config/loader.js";
import { analyze } from "../src/analysis/analyze.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, "fixtures/simple");

describe("analyze on the simple fixture", () => {
  it("flags unreachable.ts as an unreachable-file with high confidence", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const unreachable = report.findings.find(
      (f) => f.type === "unreachable-file" && f.file === "src/unreachable.ts",
    );
    expect(unreachable).toBeTruthy();
    expect(unreachable?.confidence).toBe("high");
    expect(unreachable?.safeToAutofix).toBe(true);
  });

  it("flags plugins/sample.ts at low confidence due to dynamicPatterns", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const plugin = report.findings.find(
      (f) => f.type === "unreachable-file" && f.file === "src/plugins/sample.ts",
    );
    expect(plugin).toBeTruthy();
    expect(plugin?.confidence).toBe("low");
    expect(plugin?.safeToAutofix).toBe(false);
    expect(plugin?.falsePositiveReasons.some((r) => /dynamicPatterns/.test(r))).toBe(true);
  });

  it("does not flag greet/addNumbers/pluralize (live code)", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const names = new Set(report.findings.map((f) => `${f.file}#${f.name}`));
    expect(names.has("src/used.ts#greet")).toBe(false);
    expect(names.has("src/used.ts#addNumbers")).toBe(false);
    expect(names.has("src/helpers.ts#pluralize")).toBe(false);
  });

  it("detects addFinite as unused-export (not imported anywhere)", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const addFinite = report.findings.find(
      (f) => f.file === "src/used.ts" && f.name === "addFinite",
    );
    expect(addFinite).toBeTruthy();
    expect(addFinite?.type).toBe("unused-export");
  });

  it("downgrades helpers.ts#capitalize because helpers.ts is star-imported", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);

    const capitalize = report.findings.find(
      (f) => f.file === "src/helpers.ts" && f.name === "capitalize",
    );
    // Because barrel.ts does `import * as _helpers`, we can't rule out `_helpers.capitalize`
    // usage, so confidence should be low.
    expect(capitalize?.confidence).toBe("low");
    expect(capitalize?.safeToAutofix).toBe(false);
  });

  it("produces a summary with expected shape", async () => {
    const config = await loadConfig(FIXTURE);
    const report = await analyze(config);
    expect(report.summary.total).toBe(report.findings.length);
    expect(report.summary.byConfidence).toHaveProperty("high");
    expect(report.summary.byConfidence).toHaveProperty("medium");
    expect(report.summary.byConfidence).toHaveProperty("low");
    expect(typeof report.summary.safeToAutofix).toBe("number");
  });
});
