# 构建与打包

## Windows 完整发行包

1. `pnpm install --frozen-lockfile`
2. 构建 harness 和需要编译的 vendored 插件。
3. 生成并安装 Marisa profile，执行 profile/MyGO 自检。
4. `desktop/bundle/make-bundle.ps1` 创建生产后端 `backend.tar.zst`。脚本内建两道与运行期插件管理相关的门禁：bundle 根的 `pnpm.cmd` shim 必须能在解包后的 node.exe 上跑出版本号（JS 版 pnpm 以根 prod 依赖进 hoisted 树）；部署到 `.dsh/profiles/marisa` 的 profile 的 `file:` 依赖与 workspace globs 会被重写为部署布局下的相对路径并逐一断言可解析（源 profile 的引用只对源位置成立）。
5. `go build -tags embeddedbundle` 生成单文件 EXE。首次启动时解压后端到用户本地目录。
6. `desktop/scripts/build-msi.ps1` 生成薄桌面壳 MSI；MSI 在安装阶段展开 `backend.tar.zst`，首次启动不再自解压。
7. 生成 `SHA256SUMS.txt`，由手动 Release workflow 上传。

MSI 不包含 standalone EXE；两种格式各自包含运行所需后端。

## Linux/macOS 实验产物

首版实验产物只构建当前平台的 Wails 桌面壳，依赖用户环境中的 `dsh`，不是与 Windows 等价的完整自包含包。Linux 还需要 GTK/WebKit 运行库；macOS 产物没有签名或 notarization。

实验构建失败不会阻止 Windows Release。维护者修复后可重新运行实验构建并手工补充同一 Release，但不得把缺失平台描述为已支持。

## 本地验证

```powershell
pnpm test
go test -C desktop -tags installedbundle ./...
go test -C desktop -tags embeddedbundle ./...
pwsh -NoProfile -File build.ps1
pwsh -NoProfile -File desktop/bundle/make-bundle.ps1
go build -C desktop -tags embeddedbundle -o release/marisa-desktop-standalone.exe .
pwsh -NoProfile -File desktop/scripts/build-msi.ps1
```

正式发版还必须人工观察桌面窗口已经渲染、插件清单符合预期，并完成 MSI 安装/启动/卸载。后端 HTTP 200 不能替代桌面验收。
