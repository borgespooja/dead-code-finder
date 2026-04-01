import {
  Node,
  Project,
  SourceFile,
  SyntaxKind,
  VariableStatement,
  type ExportedDeclarations,
} from "ts-morph";

/**
 * A single top-level declaration we track for dead-code analysis.
 */
export interface SymbolEntry {
  id: string;
  /** Fully-qualified-ish key we use for reporting: "relpath#name" */
  displayId: string;
  name: string;
  exportedName: string | null; // differs from `name` for default-export aliases
  kind: "function" | "class" | "interface" | "type-alias" | "enum" | "variable";
  isExported: boolean;
  isDefaultExport: boolean;
  file: string; // absolute path
  line: number;
  column: number;

  /**
   * The identifier node for findReferences() calls.
   * For an anonymous default export (e.g. `export default function () {}`) this is null.
   */
  nameNode: Node | null;

  /**
   * The full declaration / statement node — used for computing precise edit ranges
   * during cleanup. For `export const x = ...`, this is the VariableStatement, not
   * the individual VariableDeclaration.
   */
  declarationNode: Node;
}

export interface SymbolIndex {
  /** All tracked symbols, in file+source order. */
  entries: SymbolEntry[];
  /** By absolute file path. */
  byFile: Map<string, SymbolEntry[]>;
  /** By id. */
  byId: Map<string, SymbolEntry>;
}

/**
 * Walk every tracked source file and index its top-level declarations.
 * We intentionally ignore nested declarations — an unused helper nested inside a used
 * function is typically still relevant to the enclosing scope, and analyzing it
 * produces more noise than signal at MVP stage.
 */
export function indexSymbols(
  project: Project,
  files: Set<string>,
): SymbolIndex {
  const entries: SymbolEntry[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (!files.has(filePath)) continue;

    indexFunctions(sf, entries);
    indexClasses(sf, entries);
    indexInterfaces(sf, entries);
    indexTypeAliases(sf, entries);
    indexEnums(sf, entries);
    indexVariables(sf, entries);
  }

  const byFile = new Map<string, SymbolEntry[]>();
  const byId = new Map<string, SymbolEntry>();
  for (const e of entries) {
    byId.set(e.id, e);
    const list = byFile.get(e.file) ?? [];
    list.push(e);
    byFile.set(e.file, list);
  }

  return { entries, byFile, byId };
}

function indexFunctions(sf: SourceFile, out: SymbolEntry[]): void {
  for (const fn of sf.getFunctions()) {
    const nameNode = fn.getNameNode();
    const name = fn.getName() ?? (fn.isDefaultExport() ? "default" : null);
    if (!name) continue; // anonymous non-default: cannot track cleanly
    const { line, column } = sf.getLineAndColumnAtPos(fn.getStart());
    out.push({
      id: makeId(sf.getFilePath(), name, "function", fn.getStart()),
      displayId: `${sf.getFilePath()}#${name}`,
      name,
      exportedName: fn.isExported() ? (fn.isDefaultExport() ? "default" : name) : null,
      kind: "function",
      isExported: fn.isExported(),
      isDefaultExport: fn.isDefaultExport(),
      file: sf.getFilePath(),
      line,
      column,
      nameNode: nameNode ?? null,
      declarationNode: fn,
    });
  }
}

function indexClasses(sf: SourceFile, out: SymbolEntry[]): void {
  for (const cls of sf.getClasses()) {
    const nameNode = cls.getNameNode();
    const name = cls.getName() ?? (cls.isDefaultExport() ? "default" : null);
    if (!name) continue;
    const { line, column } = sf.getLineAndColumnAtPos(cls.getStart());
    out.push({
      id: makeId(sf.getFilePath(), name, "class", cls.getStart()),
      displayId: `${sf.getFilePath()}#${name}`,
      name,
      exportedName: cls.isExported() ? (cls.isDefaultExport() ? "default" : name) : null,
      kind: "class",
      isExported: cls.isExported(),
      isDefaultExport: cls.isDefaultExport(),
      file: sf.getFilePath(),
      line,
      column,
      nameNode: nameNode ?? null,
      declarationNode: cls,
    });
  }
}

function indexInterfaces(sf: SourceFile, out: SymbolEntry[]): void {
  for (const iface of sf.getInterfaces()) {
    const nameNode = iface.getNameNode();
    const name = iface.getName();
    const { line, column } = sf.getLineAndColumnAtPos(iface.getStart());
    out.push({
      id: makeId(sf.getFilePath(), name, "interface", iface.getStart()),
      displayId: `${sf.getFilePath()}#${name}`,
      name,
      exportedName: iface.isExported() ? name : null,
      kind: "interface",
      isExported: iface.isExported(),
      isDefaultExport: iface.isDefaultExport(),
      file: sf.getFilePath(),
      line,
      column,
      nameNode,
      declarationNode: iface,
    });
  }
}

function indexTypeAliases(sf: SourceFile, out: SymbolEntry[]): void {
  for (const ta of sf.getTypeAliases()) {
    const nameNode = ta.getNameNode();
    const name = ta.getName();
    const { line, column } = sf.getLineAndColumnAtPos(ta.getStart());
    out.push({
      id: makeId(sf.getFilePath(), name, "type-alias", ta.getStart()),
      displayId: `${sf.getFilePath()}#${name}`,
      name,
      exportedName: ta.isExported() ? name : null,
      kind: "type-alias",
      isExported: ta.isExported(),
      isDefaultExport: ta.isDefaultExport(),
      file: sf.getFilePath(),
      line,
      column,
      nameNode,
      declarationNode: ta,
    });
  }
}

function indexEnums(sf: SourceFile, out: SymbolEntry[]): void {
  for (const en of sf.getEnums()) {
    const nameNode = en.getNameNode();
    const name = en.getName();
    const { line, column } = sf.getLineAndColumnAtPos(en.getStart());
    out.push({
      id: makeId(sf.getFilePath(), name, "enum", en.getStart()),
      displayId: `${sf.getFilePath()}#${name}`,
      name,
      exportedName: en.isExported() ? name : null,
      kind: "enum",
      isExported: en.isExported(),
      isDefaultExport: en.isDefaultExport(),
      file: sf.getFilePath(),
      line,
      column,
      nameNode,
      declarationNode: en,
    });
  }
}

/**
 * Top-level variable declarations. We operate at the VariableStatement level so the
 * declaration node spans the whole `export const foo = ...;` for later cleanup edits.
 */
function indexVariables(sf: SourceFile, out: SymbolEntry[]): void {
  const stmts = sf.getStatements().filter(
    (s): s is VariableStatement => s.getKind() === SyntaxKind.VariableStatement,
  );
  for (const stmt of stmts) {
    const isExported = stmt.isExported();
    const isDefault = stmt.isDefaultExport();
    for (const decl of stmt.getDeclarations()) {
      const nameNode = decl.getNameNode();
      if (nameNode.getKind() !== SyntaxKind.Identifier) {
        // Destructuring: skip for MVP — tracking bindings individually is a project of its own
        continue;
      }
      const name = decl.getName();
      const { line, column } = sf.getLineAndColumnAtPos(decl.getStart());
      out.push({
        id: makeId(sf.getFilePath(), name, "variable", decl.getStart()),
        displayId: `${sf.getFilePath()}#${name}`,
        name,
        exportedName: isExported ? (isDefault ? "default" : name) : null,
        kind: "variable",
        isExported,
        isDefaultExport: isDefault,
        file: sf.getFilePath(),
        line,
        column,
        nameNode,
        // Edit at the statement level so we can remove the whole line cleanly
        declarationNode: stmt,
      });
    }
  }
}

function makeId(file: string, name: string, kind: string, pos: number): string {
  return `${file}:${kind}:${name}:${pos}`;
}

/**
 * Helper: collect all identifier names exported by a file (name, whether it's
 * default, and the source span). Used later for detecting exported-but-unimported.
 * We defer to ts-morph's getExportedDeclarations for correctness (handles
 * `export { X as Y }`, re-exports, etc.).
 */
export function collectExportedNames(sf: SourceFile): ReadonlyMap<string, ExportedDeclarations[]> {
  return sf.getExportedDeclarations();
}
