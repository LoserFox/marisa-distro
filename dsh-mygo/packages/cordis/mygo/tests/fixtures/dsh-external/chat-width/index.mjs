// Registry-form Node half for chat-width.
//
// The width engine is purely browser-side (it mutates the Web client's
// stylesheets), so the host half intentionally has no behavior — mirroring
// the official channel's lib/index.js. The registry entry must still be a
// Cordis plugin; the browser half, registered through the manifest `client`
// declaration (dsh.plugin.json#client.main -> ./client.js), does the work.
export default {
  name: 'chat-width',
  apply() {},
}
