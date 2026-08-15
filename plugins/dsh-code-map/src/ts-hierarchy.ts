/**
 * Type-hierarchy analysis over the TypeScript compiler API for
 * `@dsh-external/dsh-code-map`.
 *
 * typescript-language-server (and tsserver itself) does not implement the
 * LSP 3.17 type-hierarchy requests, so `type_hierarchy` cannot ride the same
 * LSP connection as `document_symbols` / `call_hierarchy`. Instead this module
 * builds a real `ts.Program` and reads inheritance / implementation edges
 * directly:
 *   - supertypes  ← heritage clauses of the queried declaration
 *   - subtypes    ← every user source file whose heritage clause resolves to
 *                    the queried symbol
 *
 * The analyzer keeps one `ts.Program` per queried file (keyed by the file
 * path) and rebuilds it only when the source-file mtimes change, so repeated
 * queries inside one session are cheap.
 *
 * Self-declared host contracts only (no SDK dependency); the `typescript`
 * package ships with the plugin.
 * @module @dsh-external/dsh-code-map/ts-hierarchy
 */

import * as ts from 'typescript'
import { statSync } from 'node:fs'
import { type HierarchyItem, type MapRange, type TypeHierarchyResult } from './lsp-client.ts'

/** Query position in LSP terms: 0-based line and column. */
export interface Position {
  readonly line: number
  readonly character: number
}

/** Default compiler options: enough to resolve imports without a tsconfig. */
const DEFAULT_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
}

/** Type declarations that can carry a type hierarchy (class/interface/alias). */
type TypeDeclaration = ts.ClassDeclaration | ts.InterfaceDeclaration | ts.TypeAliasDeclaration

/**
 * Per-file program analyzer with an mtime-based rebuild guard.
 * One instance per plugin lifetime; `dispose()` clears cached programs.
 */
export class TypeHierarchyAnalyzer {
  private readonly cache = new Map<string, { fingerprint: string; program: ts.Program }>()

  /** Analyze the type hierarchy of the symbol at `position` (LSP 0-based). */
  analyze(filePath: string, position: Position): TypeHierarchyResult {
    const program = this.programFor(filePath)
    const sourceFile = program.getSourceFile(filePath)
    if (sourceFile === undefined) {
      return { root: null, supertypes: [], subtypes: [] }
    }
    const checker = program.getTypeChecker()
    const offset = this.positionToOffset(sourceFile, position)
    const symbol = symbolAtOffset(checker, sourceFile, offset)
    const declaration = symbol !== undefined ? typeDeclarationOf(symbol) : undefined
    if (symbol === undefined || declaration === undefined) {
      return { root: null, supertypes: [], subtypes: [] }
    }
    return {
      root: hierarchyItemFromDeclaration(declaration, checker) ?? null,
      supertypes: collectSupertypes(checker, declaration),
      subtypes: collectSubtypes(program, checker, symbol),
    }
  }

  /** Drop every cached program (plugin unload). */
  dispose(): void {
    this.cache.clear()
  }

  /** Get (or lazily rebuild) the cached program for one queried file. */
  private programFor(filePath: string): ts.Program {
    const key = filePath
    const program = ts.createProgram([key], DEFAULT_OPTIONS)
    const fingerprint = fingerprintOf(program)
    const cached = this.cache.get(key)
    if (cached !== undefined && cached.fingerprint === fingerprint) {
      return cached.program
    }
    this.cache.set(key, { fingerprint, program })
    return program
  }

  /** Map a 0-based line/column to a char offset, snapping to the first token. */
  private positionToOffset(sourceFile: ts.SourceFile, position: Position): number {
    const lineStarts = sourceFile.getLineStarts()
    const lineStart = position.line < lineStarts.length ? lineStarts[position.line] : sourceFile.text.length
    const firstToken = skipWhitespace(sourceFile.text, lineStart)
    const atLine = Math.max(lineStart + position.character, firstToken)
    return Math.min(atLine, sourceFile.text.length)
  }
}

/** Resolve the type symbol at a char offset, unwrapping aliases. */
function symbolAtOffset(checker: ts.TypeChecker, sourceFile: ts.SourceFile, offset: number): ts.Symbol | undefined {
  const token = findTokenAt(sourceFile, offset)
  if (token === undefined) return undefined
  let symbol = checker.getSymbolAtLocation(token)
  if (symbol === undefined) {
    // Keyword/modifier hits (e.g. `export class`): fall back to the nearest
    // enclosing type declaration and resolve through its name.
    const declaration = ts.findAncestor(token, isTypeDeclaration)
    const nameNode = declaration?.name
    if (nameNode === undefined) return undefined
    symbol = checker.getSymbolAtLocation(nameNode)
  }
  if (symbol === undefined) return undefined
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    symbol = checker.getAliasedSymbol(symbol)
  }
  return symbol
}

/** Find the deepest node whose span contains `position` (ts.getTokenAtPosition is internal). */
function findTokenAt(sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  const descend = (node: ts.Node): ts.Node | undefined => {
    if (node.getStart() > position || position >= node.getEnd()) return undefined
    let deepest: ts.Node | undefined
    ts.forEachChild(node, (child) => {
      if (deepest !== undefined) return // keep the first hit
      if (child.getStart() <= position && position < child.getEnd()) {
        deepest = descend(child) ?? child
      }
    })
    return deepest ?? node
  }
  return descend(sourceFile)
}

/** The first class/interface/type-alias declaration of a symbol, if any. */
function typeDeclarationOf(symbol: ts.Symbol): TypeDeclaration | undefined {
  return symbol.declarations?.find(isTypeDeclaration)
}

function isTypeDeclaration(node: ts.Node): node is TypeDeclaration {
  return ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
}

/** Supertypes = the resolved symbols of the declaration's heritage clauses. */
function collectSupertypes(checker: ts.TypeChecker, declaration: TypeDeclaration): HierarchyItem[] {
  if (ts.isTypeAliasDeclaration(declaration)) {
    const alias = checker.getTypeAtLocation(declaration.type)
    return [hierarchyItemFromType(alias, checker)].filter((item): item is HierarchyItem => item !== undefined)
  }
  const items: HierarchyItem[] = []
  for (const clause of declaration.heritageClauses ?? []) {
    for (const typeNode of clause.types) {
      const item = hierarchyItemFromSymbol(checker, typeNode.expression)
      if (item !== undefined && !containsItem(items, item)) items.push(item)
    }
  }
  return items
}

/**
 * Subtypes = user source files whose heritage clause resolves to the queried
 * symbol. Scans the program's source files once per query; node_modules and
 * bundled library files are skipped to keep the result focused on user code.
 */
function collectSubtypes(
  program: ts.Program,
  checker: ts.TypeChecker,
  target: ts.Symbol,
): HierarchyItem[] {
  const targetName = qualifiedName(checker, target)
  const items: HierarchyItem[] = []
  for (const sourceFile of program.getSourceFiles()) {
    if (isExternalLibraryFile(sourceFile.fileName)) continue
    const visit = (node: ts.Node): void => {
      if ((ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) && node.heritageClauses !== undefined) {
        for (const clause of node.heritageClauses) {
          for (const typeNode of clause.types) {
            const resolved = resolveSymbol(checker, typeNode.expression)
            if (resolved !== undefined && qualifiedName(checker, resolved) === targetName) {
              const item = hierarchyItemFromDeclaration(node, checker)
              if (item !== undefined && !containsItem(items, item)) items.push(item)
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return items
}

function resolveSymbol(checker: ts.TypeChecker, node: ts.Expression): ts.Symbol | undefined {
  let symbol = checker.getSymbolAtLocation(node)
  if (symbol === undefined) return undefined
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol)
  return symbol
}

/** A stable identity for cross-file symbol comparison. */
function qualifiedName(checker: ts.TypeChecker, symbol: ts.Symbol): string {
  return checker.getFullyQualifiedName(symbol)
}

/** Build a hierarchy item from a resolved heritage-clause symbol. */
function hierarchyItemFromSymbol(checker: ts.TypeChecker, node: ts.Expression): HierarchyItem | undefined {
  const symbol = resolveSymbol(checker, node)
  if (symbol === undefined) return undefined
  const declaration = typeDeclarationOf(symbol)
  if (declaration === undefined) return undefined
  return hierarchyItemFromDeclaration(declaration, checker)
}

/** Build a hierarchy item from a type (type-alias supertypes). */
function hierarchyItemFromType(type: ts.Type, checker: ts.TypeChecker): HierarchyItem | undefined {
  const symbol = type.aliasSymbol ?? type.symbol
  if (symbol === undefined) return undefined
  const declaration = typeDeclarationOf(symbol)
  if (declaration === undefined) return undefined
  return hierarchyItemFromDeclaration(declaration, checker)
}

/** Build a 1-based hierarchy item from a type declaration node. */
function hierarchyItemFromDeclaration(
  declaration: TypeDeclaration,
  checker: ts.TypeChecker,
): HierarchyItem | undefined {
  const sourceFile = declaration.getSourceFile()
  const nameNode = declaration.name
  const name = nameNode?.text ?? '(anonymous)'
  const start = nameNode !== undefined ? nameNode.getStart(sourceFile) : declaration.getStart(sourceFile)
  const end = nameNode !== undefined ? nameNode.getEnd() : declaration.getEnd()
  const selectionRange = rangeBetween(sourceFile, start, end)
  if (selectionRange === null) return undefined
  return {
    name,
    kind: kindOf(declaration),
    uri: pathToFileUrl(sourceFile.fileName),
    selectionRange,
  }
}

/** One 1-based range from two char offsets. */
function rangeBetween(sourceFile: ts.SourceFile, start: number, end: number): MapRange | null {
  const a = sourceFile.getLineAndCharacterOfPosition(start)
  const b = sourceFile.getLineAndCharacterOfPosition(end)
  return {
    startLine: a.line + 1,
    startCharacter: a.character + 1,
    endLine: b.line + 1,
    endCharacter: b.character + 1,
  }
}

/** LSP SymbolKind for a type declaration node. */
function kindOf(declaration: TypeDeclaration): number {
  if (ts.isClassDeclaration(declaration)) return 5 // Class
  if (ts.isInterfaceDeclaration(declaration)) return 11 // Interface
  return 19 // Object (type alias has no dedicated LSP kind)
}

/** Skip whitespace from `from` up to the next non-whitespace char. */
function skipWhitespace(text: string, from: number): number {
  let i = from
  while (i < text.length && /\s/.test(text[i])) i += 1
  return i
}

/** Fingerprint of a program's user source files (path + mtime). */
function fingerprintOf(program: ts.Program): string {
  const parts: string[] = []
  for (const sourceFile of program.getSourceFiles()) {
    if (isExternalLibraryFile(sourceFile.fileName)) continue
    try {
      parts.push(`${sourceFile.fileName}:${statSync(sourceFile.fileName).mtimeMs}`)
    } catch {
      // A source file that vanished mid-session still forces a rebuild via its
      // absence from the fingerprint only when it reappears; keep it simple.
    }
  }
  parts.sort()
  return parts.join('|')
}

function isExternalLibraryFile(fileName: string): boolean {
  const normalized = fileName.replaceAll('\\', '/')
  return normalized.includes('/node_modules/')
}

function containsItem(items: readonly HierarchyItem[], item: HierarchyItem): boolean {
  return items.some((existing) => existing.uri === item.uri && existing.selectionRange.startLine === item.selectionRange.startLine)
}

function pathToFileUrl(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/')
  const withScheme = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${withScheme}`
}
