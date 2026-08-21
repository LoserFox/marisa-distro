/**
 * tsdown config for the client bundle. The shared clientBundle preset lives
 * in the dsh checkout (packages/client/tsdown.client.ts); scripts/build.mjs
 * resolves the checkout and exports DSH_CHECKOUT before invoking tsdown.
 */
const checkout = process.env.DSH_CHECKOUT
if (checkout === undefined) {
  throw new Error('tsdown.config.mjs: DSH_CHECKOUT is required (run `npm run build`)')
}
const { pathToFileURL } = await import('node:url')
// Windows absolute paths (C:\…, C:/…) are not valid ESM URLs; normalize so
// the preset import works on every platform.
const { clientBundle } = await import(pathToFileURL(`${checkout}/packages/client/tsdown.client.ts`).href)

export default clientBundle('@bill9109/dsh-web-ui-notify', ['lib/types/index.js'])
