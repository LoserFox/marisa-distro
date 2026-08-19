# src/ — mygo-loader-profile 源码

- `face.ts`：profile 安装执行面（P3 原生形态，P5 从 mygo-cli 收敛）：
  profile 目录 pnpm add/remove + `dsh.bundle` 对账 `dsh.profile.bundles` +
  cordis.patch.yml id 定向 disabled 块。所有其他 loader 的最终执行面。
- `adapter.ts`：`createProfileLoaderAdapter()`——LoaderAdapter 契约实现
  （`id: 'profile'`），resolve 接受 npm 包名 / git spec / tarball / 本地
  目录四种 spec；扩展面 uninstall / setEnabled。
- `invariant.ts`：包级 invariant 伴生（官方模板形态，空 installer）。
