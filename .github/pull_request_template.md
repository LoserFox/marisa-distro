## 变更

<!-- 一个 PR 只解决一个问题。 -->

## 上游与所有权边界

- [ ] 不修改 vendored mirror，或这是维护者标记的 `upstream-sync` PR
- [ ] fork/harness 改动已经更新对应差异文档并链接上游 Issue/PR
- [ ] 没有提交 node_modules、构建缓存、Release 二进制、凭据或嵌套 .git

## 验证

- [ ] `pnpm test`
- [ ] desktop installedbundle/embeddedbundle Go tests
- [ ] 已说明人工桌面验收范围；没有用 HTTP 200 代替 UI 启动证明

## 权限影响

<!-- 新增网络、进程、文件写入、密钥或模型访问时必须说明；无则写“无”。 -->
