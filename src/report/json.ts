import type { Report } from "../types.js";

export function formatJson(report: Report, pretty = true): string {
  return JSON.stringify(report, null, pretty ? 2 : 0);
}
