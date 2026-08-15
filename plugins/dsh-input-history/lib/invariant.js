//#region src/invariant.ts
const PACKAGE_NAME = "@dsh-external/dsh-input-history";
/** Cordis companion plugin name. */
const name = "dsh-input-history-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the browser capture is a window event-loop effect
* (addEventListener/removeEventListener pair owned by the plugin fiber); the
* host half holds no runtime state.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns The installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
