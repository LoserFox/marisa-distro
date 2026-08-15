//#region src/invariant.ts
const PACKAGE_NAME = "@dsh-external/dsh-ui-progress";
/** Cordis companion plugin name. */
const name = "dsh-ui-progress-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: the dock registration is an effect owned and
* observed by the slot registry; the host side has no runtime state.
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
