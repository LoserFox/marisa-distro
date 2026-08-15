//#region src/invariant.ts
const name = "dsh-stickers-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register("@dsh-external/dsh-stickers", install));
//#endregion
export { apply, inject, name };
