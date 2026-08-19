# 发布检查清单（Release Checklist）

> 用途：npm 包 `@fakechris/dsh-track` 的版本发布流程。GitHub 是分发源与 CI 校验位；
> **publish 永远在本地执行**（npm 要求 IP 信任 + 硬件 2FA 指纹授权，CI 无法发布）。
> 适用：2026-08-14 v0.4.0 起。

## 0. 前置

- [ ] 所有功能 PR 已 squash 合并到 main（L4：禁止 main 直推）
- [ ] 全量测试绿：`pnpm run test`（DSH_SOURCE=slot-a）
- [ ] 主目录 `git pull origin main` 到最新

## 1. 版本与变更

- [ ] `package.json` bump 版本（如 0.4.0 → 0.4.1 / 0.5.0）
- [ ] README.md / README.en.md：状态行版本号 + 顶部新增 changelog 条目（中英同步，L6）

## 2. 构建与提交（PR）

- [ ] 主目录构建（主 tsconfig 已随轮换失效，必须用 worktree tsconfig）：
  `DSH_SOURCE=/Users/chris/.dsh/source/slot-a DSH_TSCONFIG=tsconfig.worktree.json pnpm run build`
- [ ] 确认 `lib/` 产物包含本次改动（`git status` 应显示 lib 有变更）
- [ ] **lib/ 产物必须提交**（官方推荐：git 源安装与 CI 校验不跑构建）
- [ ] 开 PR（含源码 + lib + README）→ squash merge → 主目录 pull

## 3. Tag 与 CI 校验

- [ ] `git tag v<版本> && git push origin v<版本>`（若 tag 已存在需先确认指向最新）
- [ ] GitHub Actions `npm release`（.github/workflows/npm-release.yml）跑绿：
  - tag 与 package.json 版本一致
  - 已入库 lib（lib/index.js + lib/client.js）存在
  - `npm pack` 产物上传为 artifact（可下载核对内容）

## 4. 本地发布（硬件 2FA）

- [ ] 在仓库根目录执行：
  `npm publish --ignore-scripts --registry=https://registry.npmjs.org`
  - `--ignore-scripts`：跳过 prepack 构建（lib 已入库；本地主 tsconfig 构建会失败）
  - `--registry`：本机 npm 默认是 npmmirror 镜像，必须显式指官方 registry
- [ ] 硬件钥匙指纹弹窗授权
- [ ] 验证：`npm view @fakechris/dsh-track` 显示新版本；README badge 自动更新

## 5. 部署 3080（如需）

- [ ] 主目录 build → rsync `lib/` 到 slot vendored 副本
  （`~/.dsh/source/slot-<x>/profiles/node_modules/.pnpm/@fakechris+dsh-track@<ver>_.../node_modules/@fakechris/dsh-track/lib/`）
- [ ] client 改动：浏览器硬刷新；host 改动：写 HANDOFF → kill 3080（guard 自动拉起，见全局 L8/L9）

## 常见坑

- `npm publish` 不带 `--ignore-scripts` → prepack 用主 tsconfig 构建必失败（路径已失效）
- 不带 `--registry=https://registry.npmjs.org` → ENEEDAUTH（本机默认 npmmirror）
- CI 尝试 publish → EOTP（npm 硬件 2FA 要求指纹，物理操作不可自动化）——workflow 只校验打包
- 忘提交 lib → 发布包缺功能（git 源/CI 不构建，直接吃旧产物）