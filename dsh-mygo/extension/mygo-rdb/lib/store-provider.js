/**
 * Host composition row for the rdb registry store: registers
 * `mygoRegistryStore` so the manager opens persistence through the extension
 * instead of the built-in sqlite domain. Must mount BEFORE the `dsh-mygo`
 * row. The store is provided synchronously (the manager awaits readiness and
 * runs the one-time sqlite→rdb migration at init before recovery).
 */

import z from 'schemastery'
import { createRdbRegistryStore } from './store.js'

export const name = 'mygo-rdb-store'
export const inject = ['storageDomain']

export const Config = z.union([
  z.object({
    profile: z.string().default('web'),
    store: z.object({
      type: z.const('sqlite'),
      path: z.string().required(),
    }),
  }),
  z.object({
    profile: z.string().default('web'),
    store: z.object({
      type: z.const('postgres'),
      connectionString: z.string().required(),
    }),
  }),
])

export function apply(ctx, config) {
  const store = createRdbRegistryStore(config.store)
  // Provide on the ROOT context: loader rows carry their own isolate map, so
  // a per-row `ctx.provide` would key the impl under a different isolation
  // symbol than sibling rows read. Root provides are visible to every row.
  const disposer = ctx.root.provide('mygoRegistryStore', store)
  ctx.effect(() => () => {
    void store.close()
    disposer()
  }, 'mygo-rdb-store.teardown')
}
