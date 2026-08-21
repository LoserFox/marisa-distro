/**
 * dsh-auto-resume host half.
 *
 * The plugin is browser-only: it rewrites the composer send button into a
 * resume (play) button after an interrupted conversation. The host entry
 * exists so the rc8 loader can resolve the patch row
 * (`- id: dsh-auto-resume / name: '@dsh-external/dsh-auto-resume'`); it
 * registers nothing on the host plane.
 */
export function apply() {}
