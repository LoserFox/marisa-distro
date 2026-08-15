/** Remove generated build output without touching source-controlled files. */
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
rmSync(resolve(root, 'lib'), { recursive: true, force: true })
