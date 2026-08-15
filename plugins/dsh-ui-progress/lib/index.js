//#region src/index.ts
/**
* Task-progress plugin, node half. Pure UI plugin: the empty apply exists so
* the plugin appears in the host cordis.yml / Loader; the browser half ships
* via exports["./client"] and does all the rendering. The report_progress
* tool and its reporting guidance are no longer hosted here (removed in
* v0.8.0) — hosts that provide the tool win, and the browser half renders
* whoever registers it.
*/
/** Stable Cordis plugin name (matches the manifest id). */
const name = "@dsh-external/dsh-ui-progress";
/** Host plugin body — no host-side behavior for this surface plugin. */
function apply() {}
//#endregion
export { apply, name };
