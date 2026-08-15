/** Locate the Cordis module merge used by the vendored core API projector. */

import ts from 'typescript'

/** The body of the cordis module merge in `sf`: `declare module 'cordis'`
 * (harness packages) or `declare module './context.ts'` (vendor core), or
 * null when the file has neither. */
export function cordisModuleBody(sf: ts.SourceFile): ts.ModuleBlock | null {
  for (const stmt of sf.statements) {
    if (!ts.isModuleDeclaration(stmt) || !ts.isStringLiteral(stmt.name)) continue
    if (stmt.name.text !== 'cordis' && stmt.name.text !== './context.ts') continue
    if (stmt.body && ts.isModuleBlock(stmt.body)) return stmt.body
  }
  return null
}
