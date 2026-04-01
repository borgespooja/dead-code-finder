import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Project } from "ts-morph";
import type { CleanupPlan } from "../types.js";

export interface ApplyOptions {
  root: string;
}

export interface ApplyResult {
  filesChanged: string[];
  filesDeleted: string[];
  removedCount: number;
}

/**
 * Apply a CleanupPlan to disk.
 * - "Delete unreachable file" items: `fs.unlink` the file.
 * - Symbol-level items: re-parse the file with ts-morph, locate the declaration
 *   by file + description, and remove it. We re-parse because the plan is
 *   offset-free; relying on offsets from analysis time is fragile if other edits
 *   happened in-between.
 *
 * This is deliberately conservative: if we can't find a declaration exactly, we
 * leave the file alone and report it via filesChanged omission.
 */
export async function applyCleanup(plan: CleanupPlan, opts: ApplyOptions): Promise<ApplyResult> {
  const filesChanged = new Set<string>();
  const filesDeleted: string[] = [];
  let removedCount = 0;

  // Group symbol-level edits per file so we do a single load+save round per file.
  const perFile = new Map<string, typeof plan.items>();
  const fileDeletions: string[] = [];

  for (const item of plan.items) {
    if (item.description.startsWith("Delete unreachable file")) {
      fileDeletions.push(item.file);
    } else {
      const list = perFile.get(item.file) ?? [];
      list.push(item);
      perFile.set(item.file, list);
    }
  }

  // Handle symbol-level removals file-by-file with a fresh Project.
  // Creating a Project per file is wasteful in principle but keeps this MVP simple
  // and eliminates cross-file state surprises after edits.
  for (const [file, items] of perFile) {
    if (!existsSync(file)) continue;
    const project = new Project({
      compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true },
      useInMemoryFileSystem: false,
    });
    const sf = project.addSourceFileAtPath(file);

    let changed = false;
    for (const item of items) {
      // Description format: `Remove unused <type> "<name>" at <file>:<line>`
      const parsed = parseDescription(item.description);
      if (!parsed) continue;
      const { name } = parsed;

      const removed = removeByName(sf, name);
      if (removed) {
        removedCount += 1;
        changed = true;
      }
    }

    if (changed) {
      await sf.save();
      filesChanged.add(file);
    }
  }

  for (const f of fileDeletions) {
    if (existsSync(f)) {
      await unlink(f);
      filesDeleted.push(f);
    }
  }

  return {
    filesChanged: [...filesChanged],
    filesDeleted,
    removedCount,
  };
}

function parseDescription(desc: string): { name: string } | null {
  const m = desc.match(/"([^"]+)"/);
  if (!m || !m[1]) return null;
  return { name: m[1] };
}

/**
 * Attempt to remove a top-level declaration by name. Returns true on success.
 * We walk the most common top-level forms. Re-exports that happened to bind this
 * name via `export { name }` would need their own handling — we skip those for MVP.
 */
function removeByName(sf: ReturnType<Project["addSourceFileAtPath"]>, name: string): boolean {
  const fn = sf.getFunction(name);
  if (fn) {
    fn.remove();
    return true;
  }
  const cls = sf.getClass(name);
  if (cls) {
    cls.remove();
    return true;
  }
  const iface = sf.getInterface(name);
  if (iface) {
    iface.remove();
    return true;
  }
  const ta = sf.getTypeAlias(name);
  if (ta) {
    ta.remove();
    return true;
  }
  const en = sf.getEnum(name);
  if (en) {
    en.remove();
    return true;
  }
  const variable = sf.getVariableDeclaration(name);
  if (variable) {
    const stmt = variable.getVariableStatement();
    if (stmt && stmt.getDeclarations().length === 1) {
      stmt.remove();
    } else {
      variable.remove();
    }
    return true;
  }
  return false;
}
