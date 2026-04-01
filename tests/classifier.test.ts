import { describe, it, expect } from "vitest";
import { scoreConfidence, confidenceAtLeast, riskFor } from "../src/analysis/confidence.js";

describe("scoreConfidence", () => {
  it("returns low when matches dynamic pattern", () => {
    const { confidence } = scoreConfidence({
      matchesDynamicPattern: true,
      isTest: false,
      projectHasDynamicImports: false,
      treatExportsAsPublic: false,
      isExported: false,
      hasNamespaceImporter: false,
    });
    expect(confidence).toBe("low");
  });

  it("returns low when file is star-imported", () => {
    const { confidence } = scoreConfidence({
      matchesDynamicPattern: false,
      isTest: false,
      projectHasDynamicImports: false,
      treatExportsAsPublic: false,
      isExported: true,
      hasNamespaceImporter: true,
    });
    expect(confidence).toBe("low");
  });

  it("returns low for public-API exports", () => {
    const { confidence } = scoreConfidence({
      matchesDynamicPattern: false,
      isTest: false,
      projectHasDynamicImports: false,
      treatExportsAsPublic: true,
      isExported: true,
      hasNamespaceImporter: false,
    });
    expect(confidence).toBe("low");
  });

  it("returns high for unused internal symbols", () => {
    const { confidence } = scoreConfidence({
      matchesDynamicPattern: false,
      isTest: false,
      projectHasDynamicImports: false,
      treatExportsAsPublic: true,
      isExported: false,
      hasNamespaceImporter: false,
    });
    expect(confidence).toBe("high");
  });
});

describe("confidenceAtLeast", () => {
  it("ranks correctly", () => {
    expect(confidenceAtLeast("high", "medium")).toBe(true);
    expect(confidenceAtLeast("medium", "high")).toBe(false);
    expect(confidenceAtLeast("low", "low")).toBe(true);
  });
});

describe("riskFor", () => {
  it("escalates when public API", () => {
    expect(riskFor("high", true)).toBe("high");
  });
  it("maps confidence to risk inversely", () => {
    expect(riskFor("high", false)).toBe("low");
    expect(riskFor("medium", false)).toBe("medium");
    expect(riskFor("low", false)).toBe("high");
  });
});
