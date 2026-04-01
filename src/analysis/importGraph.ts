import { Project, SourceFile, SyntaxKind, Node, ImportDeclaration, ExportDeclaration } from "ts-morph";

export interface ImportEdge {
  from: string; // absolute path
  to: string;   // absolute path of resolved module
  /** True for `import "./side-effect"` or bare-`import`. */
  sideEffect: boolean;
  /** True for `import type { X } from ...` or `export type { X }`. */
  typeOnly: boolean;
  /**
   * Named specifiers being imported. `default` for default import. `*` for namespace.
   * Empty when sideEffect is true.
   */
  names: string[];
  /** Original text of the module specifier, for debugging / reports. */
  specifier: string;
  /** Whether this edge came from `export * from` / `export { ... } from`. */
  isReExport: boolean;
}

export interface ImportGraph {
  /** from -> edges */
  outgoing: Map<string, ImportEdge[]>;
  /** to -> edges (reverse) */
  incoming: Map<string, ImportEdge[]>;
  /** Files with at least one dynamic `import(...)` call (we can't resolve these safely). */
  filesWithDynamicImports: Set<string>;
  allEdges: ImportEdge[];
}

/**
 * Build a file-level import graph. Unresolved specifiers (external packages, unknown
 * paths) are dropped — this graph is strictly intra-project.
 */
export function buildImportGraph(project: Project, files: Set<string>): ImportGraph {
  const outgoing = new Map<string, ImportEdge[]>();
  const incoming = new Map<string, ImportEdge[]>();
  const filesWithDynamicImports = new Set<string>();
  const allEdges: ImportEdge[] = [];

  const pushEdge = (edge: ImportEdge) => {
    allEdges.push(edge);
    const outs = outgoing.get(edge.from) ?? [];
    outs.push(edge);
    outgoing.set(edge.from, outs);
    const ins = incoming.get(edge.to) ?? [];
    ins.push(edge);
    incoming.set(edge.to, ins);
  };

  for (const sf of project.getSourceFiles()) {
    const fromPath = sf.getFilePath();
    if (!files.has(fromPath)) continue;

    for (const imp of sf.getImportDeclarations()) {
      const edge = importToEdge(sf, imp, files);
      if (edge) pushEdge(edge);
    }

    for (const exp of sf.getExportDeclarations()) {
      const edge = exportToEdge(sf, exp, files);
      if (edge) pushEdge(edge);
    }

    // Detect dynamic `import(...)` calls — we can't resolve these, but their presence
    // tells us not to fully trust reachability conclusions about a file.
    sf.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.CallExpression) {
        const call = node.asKindOrThrow(SyntaxKind.CallExpression);
        if (call.getExpression().getKind() === SyntaxKind.ImportKeyword) {
          filesWithDynamicImports.add(fromPath);
        }
      }
    });
  }

  return { outgoing, incoming, filesWithDynamicImports, allEdges };
}

function importToEdge(
  sf: SourceFile,
  imp: ImportDeclaration,
  files: Set<string>,
): ImportEdge | null {
  const target = imp.getModuleSpecifierSourceFile();
  if (!target) return null;
  const to = target.getFilePath();
  if (!files.has(to)) return null;

  const specifier = imp.getModuleSpecifierValue();
  const clause = imp.getImportClause();
  const names: string[] = [];
  let sideEffect = false;
  let typeOnly = imp.isTypeOnly();

  if (!clause) {
    sideEffect = true;
  } else {
    if (clause.getDefaultImport()) names.push("default");
    const named = clause.getNamedBindings();
    if (named) {
      if (named.getKind() === SyntaxKind.NamespaceImport) {
        names.push("*");
      } else if (named.getKind() === SyntaxKind.NamedImports) {
        const ni = named.asKindOrThrow(SyntaxKind.NamedImports);
        for (const el of ni.getElements()) {
          names.push(el.getNameNode().getText());
          if (el.isTypeOnly()) typeOnly = true;
        }
      }
    }
  }

  return {
    from: sf.getFilePath(),
    to,
    sideEffect,
    typeOnly,
    names,
    specifier,
    isReExport: false,
  };
}

function exportToEdge(
  sf: SourceFile,
  exp: ExportDeclaration,
  files: Set<string>,
): ImportEdge | null {
  const target = exp.getModuleSpecifierSourceFile();
  if (!target) return null;
  const to = target.getFilePath();
  if (!files.has(to)) return null;

  const specifier = exp.getModuleSpecifierValue() ?? "";
  const names: string[] = [];
  const typeOnly = exp.isTypeOnly();

  if (exp.isNamespaceExport()) {
    names.push("*");
  } else {
    for (const el of exp.getNamedExports()) {
      // For `export { foo as bar }` we care about the original name on the target side
      names.push(el.getNameNode().getText());
    }
  }

  return {
    from: sf.getFilePath(),
    to,
    sideEffect: false,
    typeOnly,
    names,
    specifier,
    isReExport: true,
  };
}

/**
 * Small helper: true if the file has any outgoing non-type-only imports that bring
 * in side effects (either a bare `import "x"` or targeting a module with side effects).
 */
export function hasSideEffectImportInto(graph: ImportGraph, file: string): boolean {
  const edges = graph.incoming.get(file) ?? [];
  return edges.some((e) => e.sideEffect);
}
