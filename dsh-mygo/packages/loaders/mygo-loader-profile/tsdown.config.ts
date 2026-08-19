/**
 * Per-package override mirroring the mygo-cli package shape (ESM, .js
 * output, declarations from tsc, no clean) so this package can be rebuilt
 * without a full root workspace build.
 */
import type { UserConfig } from 'tsdown'

export default {
  entry: ['lib/types/{index,invariant}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
} satisfies UserConfig
